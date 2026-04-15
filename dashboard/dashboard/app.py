import os, glob, json, warnings
import pandas as pd
import numpy as np
from flask import Flask, render_template, jsonify, request, redirect

warnings.filterwarnings('ignore')

app = Flask(__name__)
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

CAPITAL_DEFAULT = 100_000
SKIP_COLS = {'s.no.', 's.no', 'sno', '#', 'index', 'no', 'sr', 'sr.no', 'sr.no.'}
WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

# ── Metadata ──────────────────────────────
META_PATH = os.path.join(DATA_DIR, 'metadata.json')

DEFAULT_META = {
    'creator': 'AlgoSanchay',
    'underlying': 'Nifty',
    'behavior': 'Directional',
    'timeframe': 'Positional',
    'contract': 'Weekly',
    'type': 'Selling',
    'capital_display': '₹1L',
    'active': True,
}

def load_metadata():
    if os.path.exists(META_PATH):
        with open(META_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_metadata(meta):
    with open(META_PATH, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

def get_meta(name):
    meta = load_metadata()
    return meta.get(name, {**DEFAULT_META})

# ── Strategy Loader ────────────────────────
def load_strategies(data_dir):
    strategies = {}
    paths = glob.glob(os.path.join(data_dir, '*.xlsx')) + glob.glob(os.path.join(data_dir, '*.xls'))
    for path in paths:
        try:
            xl = pd.read_excel(path, sheet_name=None)
            for _, df in xl.items():
                date_col = next((c for c in df.columns if 'date' in str(c).lower()), None)
                if not date_col:
                    continue
                for col in df.columns:
                    if col == date_col or str(col).lower().strip() in SKIP_COLS:
                        continue
                    sub = df[[date_col, col]].dropna()
                    if len(sub) < 20:
                        continue
                    sub = sub.copy()
                    sub.columns = ['date', 'pnl_pct']
                    sub['date'] = pd.to_datetime(sub['date'])
                    sub = sub.sort_values('date').reset_index(drop=True)
                    strategies[str(col).strip()] = sub
        except Exception as e:
            print(f"Error loading {path}: {e}")
    return strategies

# ── Signal Generator ───────────────────────
def generate_signal(sharpe, max_dd_pct, target_dd=8.0):
    dd = abs(max_dd_pct)
    if sharpe < 1.0 or dd > 22:
        return {'signal': 'Kill',   'cls': 'kill',
                'reason': f'Sharpe {sharpe:.2f}, DD {dd:.1f}%, won\'t fit predicted regime'}
    if dd > target_dd and sharpe < 2.5:
        return {'signal': 'Reduce', 'cls': 'reduce',
                'reason': f'Sharpe {sharpe:.2f}, DD {dd:.1f}%, regime shifting away'}
    if dd > target_dd:
        return {'signal': 'Reduce', 'cls': 'reduce',
                'reason': f'Below-par Sharpe {sharpe:.2f} or DD {dd:.1f}%'}
    if sharpe >= 2.0 and dd <= target_dd:
        return {'signal': 'Scale',  'cls': 'scale',
                'reason': f'Sharpe {sharpe:.2f}, DD {dd:.1f}%, fits predicted regime'}
    return {'signal': 'Hold', 'cls': 'hold',
            'reason': f'Monitor: Sharpe {sharpe:.2f}, DD {dd:.1f}%'}

# ── Core Calculator ────────────────────────
def calc(df, capital=CAPITAL_DEFAULT, target_dd=8.0):
    d = df.copy()
    d['pnl_inr'] = d['pnl_pct'] / 100 * capital

    d['equity'] = capital + d['pnl_inr'].cumsum()
    d['peak']   = d['equity'].cummax()
    d['dd']     = (d['equity'] - d['peak']) / d['peak'] * 100

    n       = len(d)
    wins    = int((d['pnl_pct'] > 0).sum())
    losses  = int((d['pnl_pct'] < 0).sum())
    flats   = n - wins - losses
    active  = wins + losses
    win_rate = round(wins / active * 100, 1) if active else 0  # exclude flat days

    def streak(series, cond):
        mx = cur = 0
        for v in series:
            cur = cur + 1 if cond(v) else 0
            mx = max(mx, cur)
        return mx

    roi      = (d['equity'].iloc[-1] - capital) / capital * 100
    d['ym']  = d['date'].dt.to_period('M')
    monthly  = d.groupby('ym').agg(pnl=('pnl_inr','sum'), days=('pnl_pct','count')).reset_index()
    monthly['roi'] = monthly['pnl'] / capital * 100

    mean_d = d['pnl_pct'].mean() / 100
    std_d  = d['pnl_pct'].std()  / 100
    sharpe  = round((mean_d / std_d) * np.sqrt(252), 2) if std_d else 0
    neg     = d[d['pnl_pct'] < 0]['pnl_pct'] / 100
    sortino = round((mean_d / neg.std()) * np.sqrt(252), 2) if len(neg) > 1 else 0
    cvar    = float(np.percentile(d['pnl_pct'], 5))
    max_dd  = round(float(d['dd'].min()), 2)
    current_pnl = round(float(d['pnl_pct'].iloc[-1]), 2)

    # ── Regime classification ──────────────
    d['rvol'] = d['pnl_pct'].rolling(20).std()
    vols = d['rvol'].dropna()
    if len(vols) >= 5:
        q20, q40, q60, q80 = vols.quantile([.2,.4,.6,.8]).values
        def classify(v):
            if pd.isna(v): return 'NM'
            if v <= q20: return 'LV'
            elif v <= q40: return 'NM'
            elif v <= q60: return 'EL'
            elif v <= q80: return 'HV'
            else: return 'DC'
        d['regime'] = d['rvol'].apply(classify)
    else:
        d['regime'] = 'NM'

    regime_perf = {}
    for r in ['DC','LV','NM','EL','HV']:
        sub = d[d['regime'] == r]
        regime_perf[r] = round(float(sub.groupby('ym')['pnl_pct'].sum().mean()), 1) if len(sub) >= 5 else None

    # ── Weekday performance ────────────────
    d['weekday'] = d['date'].dt.day_name()
    wk = d.groupby('weekday').agg(
        total_inr=('pnl_inr', 'sum'),
        avg_inr  =('pnl_inr', 'mean'),
        best_inr =('pnl_inr', 'max'),
        worst_inr=('pnl_inr', 'min'),
        wins_w   =('pnl_pct', lambda x: (x > 0).sum()),
        days_w   =('pnl_pct', 'count'),
    ).reindex(WEEKDAY_ORDER)

    weekday_data = []
    for day, r in wk.iterrows():
        if pd.isna(r['days_w']): continue
        wd = int(r['days_w'])
        wn = int(r['wins_w'])
        weekday_data.append({
            'day':        day,
            'total_inr':  round(float(r['total_inr']), 0),
            'total_pct':  round(float(r['total_inr']) / capital * 100, 2),
            'avg_inr':    round(float(r['avg_inr']),   0),
            'avg_pct':    round(float(r['avg_inr'])   / capital * 100, 2),
            'best_inr':   round(float(r['best_inr']),  0),
            'best_pct':   round(float(r['best_inr'])  / capital * 100, 2),
            'worst_inr':  round(float(r['worst_inr']), 0),
            'worst_pct':  round(float(r['worst_inr']) / capital * 100, 2),
            'win_rate':   round(wn / wd * 100, 1) if wd else 0,
            'days':       wd,
        })

    # ── Monthly detail ─────────────────────
    monthly_detail = []
    for _, r in monthly.iterrows():
        mdata = d[d['ym'] == r['ym']]
        wins_m = int((mdata['pnl_pct'] > 0).sum())
        tot = int(r['days'])
        monthly_detail.append({
            'm':         str(r['ym']),
            'total_inr': round(float(r['pnl']), 0),
            'total_pct': round(float(r['roi']), 2),
            'avg_inr':   round(float(r['pnl'] / r['days']), 0),
            'avg_pct':   round(float(r['roi']  / r['days']), 2),
            'best_inr':  round(float(mdata['pnl_inr'].max()), 0),
            'best_pct':  round(float(mdata['pnl_pct'].max()), 2),
            'worst_inr': round(float(mdata['pnl_inr'].min()), 0),
            'worst_pct': round(float(mdata['pnl_pct'].min()), 2),
            'wins':      wins_m,
            'days':      tot,
        })

    sig = generate_signal(sharpe, max_dd, target_dd)

    return {
        'n': n, 'wins': wins, 'losses': losses, 'flats': flats,
        'active_days': active,
        'win_rate': win_rate,
        'max_win_streak':  streak(d['pnl_pct'], lambda x: x > 0),
        'max_loss_streak': streak(d['pnl_pct'], lambda x: x < 0),
        'roi':             round(roi, 2),
        'avg_monthly_ret': round(float(monthly['roi'].mean()), 2),
        'total_pnl':       round(float(d['pnl_inr'].sum()), 0),
        'final_equity':    round(float(d['equity'].iloc[-1]), 0),
        'sharpe':  sharpe,
        'sortino': sortino,
        'cvar':    round(cvar, 2),
        'max_dd':  max_dd,
        'current_pnl': current_pnl,
        'max_profit_day': round(float(d['pnl_inr'].max()), 0),
        'max_loss_day':   round(float(d['pnl_inr'].min()), 0),
        'avg_pnl_day':    round(float(d['pnl_inr'].mean()), 0),
        'ann_std': round(std_d * np.sqrt(252) * 100, 2),
        'start': d['date'].min().strftime('%d %b %Y'),
        'end':   d['date'].max().strftime('%d %b %Y'),
        'regime_perf':    regime_perf,
        'signal':         sig,
        'weekday':        weekday_data,
        'monthly_detail': monthly_detail,
        'monthly': [{'m': str(r['ym']), 'pnl': round(float(r['pnl']),0),
                     'roi': round(float(r['roi']),2), 'days': int(r['days'])}
                    for _,r in monthly.iterrows()],
        'equity_curve': [{'d': row['date'].strftime('%Y-%m-%d'), 'e': round(float(row['equity']),2)}
                         for _,row in d.iterrows()],
        'drawdown':     [{'d': row['date'].strftime('%Y-%m-%d'), 'v': round(float(row['dd']),2)}
                         for _,row in d.iterrows()],
    }

# ── Capital Ladder Calculator ──────────────
def calc_cumulative_roi(df, initial_capital=100_000):
    """
    Milestone compounding:
      Phase 1 → base=1L, daily PnL on 1L. When phase profit >= 1L → base doubles to 2L.
      Phase 2 → base=2L, daily PnL on 2L. When phase profit >= 2L → base doubles to 4L.
      ... and so on.
    Excess profit above the milestone carries into the next phase.
    """
    base         = float(initial_capital)
    phase        = 1
    phase_profit = 0.0
    phase_start  = 0
    milestones   = []
    curve        = []

    PHASE_COLORS = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899']

    for i, row in df.reset_index(drop=True).iterrows():
        daily_inr     = float(row['pnl_pct']) / 100.0 * base
        phase_profit += daily_inr

        # Check for milestone (may double more than once in theory)
        while phase_profit >= base:
            excess = phase_profit - base
            milestones.append({
                'phase':      phase,
                'base':       round(base, 0),
                'target':     round(base, 0),
                'date':       row['date'].strftime('%d %b %Y'),
                'date_iso':   row['date'].strftime('%Y-%m-%d'),
                'duration':   i - phase_start,
                'new_base':   round(base * 2, 0),
                'color':      PHASE_COLORS[(phase - 1) % len(PHASE_COLORS)],
            })
            base         = base * 2
            phase_profit = excess
            phase        = phase + 1
            phase_start  = i

        total_value = base + phase_profit
        curve.append({
            'd':            row['date'].strftime('%Y-%m-%d'),
            'e':            round(total_value, 2),
            'base':         round(base, 0),
            'phase':        phase,
            'phase_profit': round(phase_profit, 2),
            'progress':     round(phase_profit / base * 100, 2),
            'color':        PHASE_COLORS[(phase - 1) % len(PHASE_COLORS)],
        })

    return {
        'curve':                curve,
        'milestones':           milestones,
        'current_base':         round(base, 0),
        'current_phase':        phase,
        'current_phase_profit': round(phase_profit, 0),
        'current_target':       round(base, 0),
        'current_progress':     round(phase_profit / base * 100, 2),
        'current_total':        round(base + phase_profit, 0),
        'phases_completed':     len(milestones),
        'initial_capital':      initial_capital,
        'total_return':         round((base + phase_profit - initial_capital) / initial_capital * 100, 2),
    }


# ── Staircase Ladder Calculator ───────────
def calc_staircase(df, initial_capital=100_000, step=100_000):
    """
    Linear staircase compounding:
      Phase 1 → base=1L, earn daily PnL on 1L. When phase profit >= 1L → base += 1L = 2L.
      Phase 2 → base=2L, earn on 2L. When phase profit >= 1L → base += 1L = 3L.
      Phase 3 → base=3L, earn on 3L. When phase profit >= 1L → base += 1L = 4L.
      Milestone target is always fixed at `step` (₹1L). Excess carries forward.
    """
    base         = float(initial_capital)
    step_val     = float(step)
    phase        = 1
    phase_profit = 0.0
    phase_start  = 0
    milestones   = []
    curve        = []

    PHASE_COLORS = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899']

    for i, row in df.reset_index(drop=True).iterrows():
        daily_inr     = float(row['pnl_pct']) / 100.0 * base
        phase_profit += daily_inr

        while phase_profit >= step_val:
            excess = phase_profit - step_val
            milestones.append({
                'phase':      phase,
                'base':       round(base, 0),
                'target':     round(step_val, 0),
                'roi_needed': round(step_val / base * 100, 1),
                'date':       row['date'].strftime('%d %b %Y'),
                'date_iso':   row['date'].strftime('%Y-%m-%d'),
                'duration':   i - phase_start,
                'new_base':   round(base + step_val, 0),
                'color':      PHASE_COLORS[(phase - 1) % len(PHASE_COLORS)],
            })
            base         = base + step_val
            phase_profit = excess
            phase        = phase + 1
            phase_start  = i

        total_value = base + phase_profit
        curve.append({
            'd':            row['date'].strftime('%Y-%m-%d'),
            'e':            round(total_value, 2),
            'base':         round(base, 0),
            'phase':        phase,
            'phase_profit': round(phase_profit, 2),
            'progress':     round(phase_profit / step_val * 100, 2),
            'color':        PHASE_COLORS[(phase - 1) % len(PHASE_COLORS)],
        })

    return {
        'curve':                curve,
        'milestones':           milestones,
        'current_base':         round(base, 0),
        'current_phase':        phase,
        'current_phase_profit': round(phase_profit, 0),
        'current_target':       round(step_val, 0),
        'current_progress':     round(phase_profit / step_val * 100, 2),
        'current_total':        round(base + phase_profit, 0),
        'phases_completed':     len(milestones),
        'initial_capital':      initial_capital,
        'step':                 step,
        'total_return':         round((base + phase_profit - initial_capital) / initial_capital * 100, 2),
    }


# ── Routes ─────────────────────────────────
@app.route('/')
def root():
    return redirect('/algodashboard/portfolio-intelligence')

@app.route('/algodashboard/')
@app.route('/algodashboard/<path:page>')
def dashboard(page='portfolio-intelligence'):
    return render_template('index.html')

@app.route('/algodashboard/api/strategies')
def api_strategies():
    capital   = int(request.args.get('capital', CAPITAL_DEFAULT))
    target_dd = float(request.args.get('target_dd', 8.0))
    strats    = load_strategies(DATA_DIR)
    meta      = load_metadata()
    result    = {}
    for name, df in strats.items():
        data = calc(df, capital, target_dd)
        data['meta'] = meta.get(name, {**DEFAULT_META})
        result[name] = data
    return jsonify(result)

@app.route('/algodashboard/api/compounding')
def api_compounding():
    capital = int(request.args.get('capital', CAPITAL_DEFAULT))
    strats  = load_strategies(DATA_DIR)
    return jsonify({name: calc_cumulative_roi(df, capital) for name, df in strats.items()})

@app.route('/algodashboard/api/metadata', methods=['POST'])
def api_save_meta():
    body = request.get_json()
    name = body.get('name')
    if not name:
        return jsonify({'error': 'name required'}), 400
    meta = load_metadata()
    meta[name] = {**DEFAULT_META, **body.get('meta', {})}
    save_metadata(meta)
    return jsonify({'ok': True})

@app.route('/algodashboard/api/staircase')
def api_staircase():
    capital = int(request.args.get('capital', CAPITAL_DEFAULT))
    step    = int(request.args.get('step', CAPITAL_DEFAULT))
    strats  = load_strategies(DATA_DIR)
    return jsonify({name: calc_staircase(df, capital, step) for name, df in strats.items()})

@app.route('/algodashboard/api/upload', methods=['POST'])
def api_upload():
    f = request.files.get('file')
    if not f or not f.filename.endswith(('.xlsx', '.xls')):
        return jsonify({'error': 'Send an .xlsx file'}), 400
    f.save(os.path.join(DATA_DIR, f.filename))
    return jsonify({'ok': True, 'file': f.filename})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"\n  AlgoSanchay Dashboard -> http://127.0.0.1:{port}/algodashboard/portfolio-intelligence\n")
    app.run(debug=False, port=port, host='0.0.0.0')
