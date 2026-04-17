/* ── Global State ────────────────────────── */
let ALL = {}
let CAPITAL = 100000
let TARGET_DD = 8.0
let PRIMARY = null
let charts = {}
let currentPeriod = 'all'

/* ── Boot ────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupNav()
  loadData()
  document.getElementById('cur-date').textContent = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
})

/* ── Navigation ──────────────────────────── */
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault()
      navigateTo(el.dataset.page)
    })
  })
}
function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page))
  document.querySelectorAll('.page').forEach(el =>
    el.classList.toggle('active', el.id === 'page-' + page))
  if (Object.keys(ALL).length > 0) renderPage(page)
}

/* ── Data Load ───────────────────────────── */
async function loadData() {
  showLoading(true)
  try {
    const res = await fetch(`/algodashboard/api/strategies?capital=${CAPITAL}&target_dd=${TARGET_DD}`)
    ALL = await res.json()
    const names = Object.keys(ALL)
    if (names.length === 0) { showLoading(false); showEmpty(); return }
    PRIMARY = PRIMARY && ALL[PRIMARY] ? PRIMARY : names[0]
    showLoading(false)
    buildStrategySelector()
    renderPage(getCurrentPage())
  } catch (err) {
    showLoading(false)
    console.error(err)
  }
}

function getCurrentPage() {
  const el = document.querySelector('.nav-item.active')
  return el ? el.dataset.page : 'portfolio-intelligence'
}

function renderPage(page) {
  if (page === 'portfolio-intelligence') renderPortfolio()
  else if (page === 'overview') renderOverview()
  else if (page === 'strategy-universe') renderUniverse()
  else if (page === 'capital-ladder') renderCapitalLadder()
  else if (page === 'staircase') renderStaircase()
  else if (page === 'daily-pnl') renderDailyPnl()
  else if (page === 'tradetron') renderTradetron()
  else if (page === 'market-regime') renderMarketRegime()
}

/* ── Strategy Selector ───────────────────── */
function buildStrategySelector() {
  ['strategy-selector', 'cl-strategy-selector', 'sc-strategy-selector'].forEach(id => {
    const sel = document.getElementById(id)
    if (!sel) return
    sel.innerHTML = ''
    Object.keys(ALL).forEach(name => {
      const o = document.createElement('option')
      o.value = name; o.textContent = name
      if (name === PRIMARY) o.selected = true
      sel.appendChild(o)
    })
    sel.onchange = e => { PRIMARY = e.target.value; CL_DATA = {}; renderPage(getCurrentPage()) }
  })
}

/* ── Helpers ─────────────────────────────── */
const fmt = (v, dec=0) => typeof v === 'number' ? v.toFixed(dec) : v
const fmtINR = v => '₹' + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const fmtINRSigned = v => (v < 0 ? '(' : '') + fmtINR(v) + (v < 0 ? ')' : '')
const fmtPct = (v, dec=2) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(dec) + '%'

function clr(v, thresholds = [0]) {
  if (v > thresholds[0]) return 'green'
  if (v < 0) return 'red'
  return 'text-muted'
}

function filterByPeriod(data, period) {
  if (period === 'all') return data
  const now = new Date()
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[period] || 999
  const cutoff = new Date(now); cutoff.setMonth(now.getMonth() - months)
  return data.filter(d => new Date(d.d) >= cutoff)
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id] }
}

/* ── PORTFOLIO INTELLIGENCE ──────────────── */
function renderPortfolio() {
  const s = ALL[PRIMARY]
  if (!s) return
  renderKPIs(s)
  renderEquityChart(s)
  renderDrawdownChart(s)
  renderOptimInputs()
  renderRegimeOutlook(s)
  renderAIPortfolio(s)
  renderLeaderboard()
  renderRegimePerf()
  renderDecisionPanel()
}

/* KPI Cards */
function renderKPIs(s) {
  const capital = CAPITAL
  const rows = [
    { label: 'TOTAL CAPITAL',   main: fmtINR(capital),
      sub: `Deployed: ${fmtINR(capital)} · Cash: ₹0`, mainCls: '' },
    { label: 'EXP. RETURN',     main: fmtPct(s.avg_monthly_ret, 2) + '/m',
      sub: `Target: 4.0% ${s.avg_monthly_ret >= 4 ? '✓' : '✗'}`, mainCls: s.avg_monthly_ret >= 0 ? 'orange' : 'red' },
    { label: 'EXP. DRAWDOWN',   main: Math.abs(s.max_dd).toFixed(2) + '%',
      sub: `Max: ${TARGET_DD}% ${Math.abs(s.max_dd) <= TARGET_DD ? '✓' : '✗'}`, mainCls: 'orange' },
    { label: 'SHARPE',          main: s.sharpe.toFixed(2),
      sub: s.sharpe >= 2 ? '✦ Excellent' : s.sharpe >= 1 ? 'Good' : 'Below-par', mainCls: s.sharpe >= 2 ? 'green' : 'orange' },
    { label: 'SORTINO',         main: s.sortino.toFixed(2),  sub: '', mainCls: '' },
    { label: 'CVAR (5%)',       main: s.cvar.toFixed(2) + '%',
      sub: 'Tail risk', mainCls: s.cvar < -5 ? 'red' : 'text-muted' },
    { label: 'WIN RATE',        main: s.win_rate + '%',
      sub: `${s.wins}W · ${s.losses}L · ${s.flats}F`, mainCls: s.win_rate >= 55 ? 'green' : 'orange' },
  ]
  const el = document.getElementById('kpi-row')
  el.style.gridTemplateColumns = `repeat(${rows.length}, 1fr)`
  el.innerHTML = rows.map(r => `
    <div class="kpi-card">
      <div class="kpi-label">${r.label}</div>
      <div class="kpi-main ${r.mainCls}">${r.main}</div>
      ${r.sub ? `<div class="kpi-sub">${r.sub}</div>` : ''}
    </div>`).join('')
}

/* Equity Chart */
function renderEquityChart(s) {
  destroyChart('eq')
  const ctx = document.getElementById('equityChart').getContext('2d')
  const raw = filterByPeriod(s.equity_curve, currentPeriod)
  const bh  = raw.map(d => ({ x: d.d, y: CAPITAL }))
  charts.eq = new Chart(ctx, {
    type: 'line',
    data: { datasets: [
      { label: 'AI Optimized', data: raw.map(d => ({ x: d.d, y: d.e })),
        borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.07)',
        fill: true, borderWidth: 2, pointRadius: 0, tension: 0.1 },
      { label: 'Buy & Hold', data: bh,
        borderColor: '#94a3b8', borderDash: [4,4], borderWidth: 1.5,
        pointRadius: 0, fill: false },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', labels: { font: { size: 11 }, boxWidth: 10 } },
        tooltip: { callbacks: {
          label: c => ` ${c.dataset.label}: ${fmtINR(c.parsed.y)}`
        }}
      },
      scales: {
        x: { type: 'time', time: { unit: 'month', displayFormats: { month: 'MMM yy' } },
             grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 },
             callback: v => v >= 100000 ? '₹' + (v/100000).toFixed(1)+'L' : '₹'+(v/1000).toFixed(0)+'K' }}
      }
    }
  })
}

/* Drawdown Chart */
function renderDrawdownChart(s) {
  destroyChart('dd')
  const ctx = document.getElementById('drawdownChart').getContext('2d')
  const raw = filterByPeriod(s.drawdown, currentPeriod)
  charts.dd = new Chart(ctx, {
    type: 'line',
    data: { datasets: [{
      label: 'Drawdown',
      data: raw.map(d => ({ x: d.d, y: d.v })),
      borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.12)',
      fill: true, borderWidth: 1.5, pointRadius: 0,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => ` Drawdown: ${c.parsed.y.toFixed(2)}%` }}},
      scales: {
        x: { type: 'time', time: { unit: 'month', displayFormats: { month: 'MMM yy' } },
             grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, callback: v => v.toFixed(1)+'%' }}
      }
    }
  })
}

/* Period Filter Buttons */
document.addEventListener('click', e => {
  if (e.target.classList.contains('tf')) {
    document.querySelectorAll('.tf').forEach(b => b.classList.remove('active'))
    e.target.classList.add('active')
    currentPeriod = e.target.dataset.p
    const s = ALL[PRIMARY]
    if (s) { renderEquityChart(s); renderDrawdownChart(s) }
  }
})

/* Optimization Inputs */
function renderOptimInputs() {
  document.getElementById('optim-inputs').innerHTML = `
    <div class="optim-field">
      <label>Creator</label>
      <select><option>AlgoSanchay</option></select>
    </div>
    <div class="optim-field">
      <label>Total Capital (₹)</label>
      <input type="number" id="cap-input" value="${CAPITAL}" step="10000">
    </div>
    <div class="optim-field">
      <label>Underlying</label>
      <select><option>All</option><option>NIFTY</option><option>BankNifty</option></select>
    </div>
    <div class="optim-field">
      <label>Max Strategies</label>
      <input type="number" id="maxstrat-input" value="1" min="1">
    </div>
    <div class="optim-field">
      <label>Timeframe</label>
      <select><option>All</option><option>Intraday</option><option>Daily</option><option>Weekly</option></select>
    </div>
    <div class="optim-field">
      <label>Target Ret/M (%)</label>
      <input type="number" id="target-ret" value="4.00" step="0.5">
    </div>
    <div class="optim-field">
      <label>Contract</label>
      <select><option>Weekly</option><option>Monthly</option></select>
    </div>
    <div class="optim-field">
      <label>Max DD (%)</label>
      <input type="number" id="target-dd" value="${TARGET_DD}" step="1">
    </div>
  `
}

function aiOptimize() {
  const newCap = parseInt(document.getElementById('cap-input')?.value || CAPITAL)
  const newDD  = parseFloat(document.getElementById('target-dd')?.value || TARGET_DD)
  if (newCap !== CAPITAL || newDD !== TARGET_DD) {
    CAPITAL = newCap; TARGET_DD = newDD
    loadData()
  } else {
    renderPortfolio()
  }
}

/* Regime Outlook */
function renderRegimeOutlook(s) {
  const regimes = s.regime_perf
  const best = Object.entries(regimes).filter(([,v]) => v != null).sort((a,b)=>b[1]-a[1])[0]
  const current = best ? best[0] : 'EL'
  const labels = { DC:'Dull/Choppy', LV:'Low Volatility', NM:'Normal', EL:'Elevated', HV:'High Volatility' }
  const clsMap  = { DC:'blue', LV:'blue', NM:'green', EL:'orange', HV:'red' }
  document.getElementById('regime-outlook').innerHTML = `
    <div class="regime-outlook-body">
      <div class="regime-big ${clsMap[current]}">${labels[current] || current}</div>
      <div class="regime-sub">Transitioning ↕</div>
      <div class="regime-conf" style="color: var(--muted)">Current Regime · Rolling Vol Based</div>
      <ul class="regime-bullets">
        <li>Strategy best performs in <strong>${labels[current]}</strong> regime</li>
        <li>Avg monthly return in ${current}: ${fmtPct(regimes[current] || 0, 1)}</li>
        <li>Monitor rolling 20D volatility for regime shifts</li>
      </ul>
    </div>`
}

/* AI Portfolio Table */
function renderAIPortfolio(s) {
  const rows = Object.entries(ALL).map(([name, d], i) => `
    <tr>
      <td class="rank-num">${i+1}</td>
      <td class="strat-name">${name}</td>
      <td><span class="tag tag-dbt">Daily</span></td>
      <td class="num">1x</td>
      <td class="num">${fmtINR(CAPITAL)}</td>
      <td class="num">100%</td>
      <td class="num ${d.avg_monthly_ret >= 0 ? 'green' : 'red'}">${fmtPct(d.avg_monthly_ret,1)}</td>
      <td class="num">${d.sharpe.toFixed(2)}</td>
    </tr>`)
  document.getElementById('portfolio-table').innerHTML = `
    <thead><tr>
      <th>#</th><th>STRATEGY</th><th>TYPE</th>
      <th class="num">LOTS</th><th class="num">ALLOC</th>
      <th class="num">WT</th><th class="num">RET/M</th><th class="num">PRED.SH</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>`
  document.getElementById('portfolio-summary').innerHTML = `
    <div class="port-summary">
      <div class="port-sum-item"><div class="port-sum-label">Deployed</div><div class="port-sum-val">${fmtINR(CAPITAL)}</div></div>
      <div class="port-sum-item"><div class="port-sum-label">Cash</div><div class="port-sum-val">₹0</div></div>
      <div class="port-sum-item"><div class="port-sum-label">Exp. Return/M</div><div class="port-sum-val green">${fmtPct(s.avg_monthly_ret,2)}</div></div>
      <div class="port-sum-item"><div class="port-sum-label">Sharpe</div><div class="port-sum-val">${s.sharpe.toFixed(2)}</div></div>
    </div>`
}

/* Strategy Leaderboard */
function renderLeaderboard() {
  const sorted = Object.entries(ALL).sort((a,b) => b[1].sharpe - a[1].sharpe)
  const rows = sorted.map(([name, d], i) => {
    const heat = d.avg_monthly_ret >= 4 ? '🟢' : d.avg_monthly_ret >= 0 ? '🟡' : '🔴'
    return `<tr>
      <td class="rank-num">${i+1}</td>
      <td class="strat-name" title="${name}">${name.length > 18 ? name.slice(0,18)+'…' : name}</td>
      <td class="num sharpe-val">${d.sharpe.toFixed(2)}</td>
      <td class="num">${heat}</td>
    </tr>`
  })
  document.getElementById('leaderboard-table').innerHTML = `
    <thead><tr>
      <th>#</th><th>STRATEGY</th>
      <th class="num">PRED.SHARPE</th><th class="num">HEAT</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>`
}

/* Regime Performance */
function renderRegimePerf() {
  const regimeCols = ['DC','LV','NM','EL','HV']
  const sorted = Object.entries(ALL).sort((a,b) => b[1].sharpe - a[1].sharpe)
  const rows = sorted.map(([name, d]) => {
    const cells = regimeCols.map(r => {
      const v = d.regime_perf[r]
      if (v == null) return `<td class="num null-val">—</td>`
      const cls = v >= 5 ? 'green' : v >= 0 ? '' : 'red'
      return `<td class="num regime-cell ${cls}">${fmtPct(v,1)}</td>`
    })
    return `<tr>
      <td class="strat-name" title="${name}">${name.length > 16 ? name.slice(0,16)+'…' : name}</td>
      ${cells.join('')}
    </tr>`
  })
  document.getElementById('regime-perf-table').innerHTML = `
    <thead><tr>
      <th>STRATEGY</th>
      ${regimeCols.map(r => `<th class="num">${r}</th>`).join('')}
    </tr></thead>
    <tbody>${rows.join('')}</tbody>`
}

/* Decision Panel */
function renderDecisionPanel() {
  const sorted = Object.entries(ALL).sort((a,b) => b[1].sharpe - a[1].sharpe)
  const rows = sorted.map(([name, d]) => {
    const sig = d.signal
    return `<tr>
      <td class="strat-name" title="${name}">${name.length > 16 ? name.slice(0,16)+'…' : name}</td>
      <td><span class="sig sig-${sig.cls}">${sig.signal}</span></td>
      <td style="font-size:11px; color: var(--muted); max-width:160px; white-space:normal">${sig.reason}</td>
    </tr>`
  })
  document.getElementById('decision-table').innerHTML = `
    <thead><tr>
      <th>STRATEGY</th><th>SIGNAL</th><th>REASON</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>`
}

/* ── OVERVIEW PAGE ───────────────────────── */
function renderOverview() {
  const names = Object.keys(ALL)
  if (!names.length) return
  const container = document.getElementById('overview-content')

  // Combined equity chart
  destroyChart('ov-eq')
  const colors = ['#10b981','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4']
  const datasets = names.map((name, i) => ({
    label: name.length > 20 ? name.slice(0,20)+'…' : name,
    data: ALL[name].equity_curve.map(d => ({ x: d.d, y: d.e })),
    borderColor: colors[i % colors.length],
    borderWidth: 1.8, pointRadius: 0, fill: false, tension: 0.1,
  }))

  const ctx = document.getElementById('ov-equity-chart').getContext('2d')
  charts['ov-eq'] = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 10 } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtINR(c.parsed.y)}` }}},
      scales: {
        x: { type: 'time', time: { unit: 'month', displayFormats: { month: 'MMM yy' } },
             grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 },
             callback: v => v >= 100000 ? '₹'+(v/100000).toFixed(1)+'L' : '₹'+(v/1000).toFixed(0)+'K' }}
      }
    }
  })

  // Summary table
  const rows = names.sort((a,b) => ALL[b].sharpe - ALL[a].sharpe).map(name => {
    const d = ALL[name]
    return `<tr>
      <td class="strat-name">${name}</td>
      <td class="num">${d.start} – ${d.end}</td>
      <td class="num">${d.n}</td>
      <td class="num ${d.win_rate >= 55 ? 'green' : ''}">${d.win_rate}%</td>
      <td class="num">${d.sharpe.toFixed(2)}</td>
      <td class="num">${d.sortino.toFixed(2)}</td>
      <td class="num red">${d.max_dd.toFixed(2)}%</td>
      <td class="num ${d.roi >= 0 ? 'green' : 'red'}">${fmtPct(d.roi,1)}</td>
      <td class="num ${d.avg_monthly_ret >= 0 ? 'green' : 'red'}">${fmtPct(d.avg_monthly_ret,2)}</td>
    </tr>`
  })
  document.getElementById('ov-table').innerHTML = `
    <thead><tr>
      <th>STRATEGY</th><th>PERIOD</th><th class="num">DAYS</th>
      <th class="num">WIN%</th><th class="num">SHARPE</th><th class="num">SORTINO</th>
      <th class="num">MAX DD</th><th class="num">TOTAL ROI</th><th class="num">AVG M ROI</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>`
}

/* ── STRATEGY UNIVERSE PAGE ──────────────── */
let SU_SELECTED = null
let SU_PERIOD = 'all'

function renderUniverse() {
  buildFilterOptions()
  applyFilters()
  updateRegimeStats()
}

function buildFilterOptions() {
  const creators    = [...new Set(Object.values(ALL).map(d => d.meta?.creator).filter(Boolean))]
  const underlyings = [...new Set(Object.values(ALL).map(d => d.meta?.underlying).filter(Boolean))]
  const behaviors   = [...new Set(Object.values(ALL).map(d => d.meta?.behavior).filter(Boolean))]

  const populate = (id, opts) => {
    const el = document.getElementById(id)
    const cur = el.value
    el.innerHTML = `<option value="">${el.querySelector('option').textContent}</option>`
    opts.forEach(o => { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; el.appendChild(opt) })
    el.value = cur
  }
  populate('su-f-creator',    creators)
  populate('su-f-underlying', underlyings)
  populate('su-f-behavior',   behaviors)
}

function applyFilters() {
  const fc = document.getElementById('su-f-creator')?.value    || ''
  const fu = document.getElementById('su-f-underlying')?.value || ''
  const fb = document.getElementById('su-f-behavior')?.value   || ''

  const filtered = Object.entries(ALL).filter(([, d]) => {
    const m = d.meta || {}
    return (!fc || m.creator    === fc) &&
           (!fu || m.underlying === fu) &&
           (!fb || m.behavior   === fb)
  })

  const cnt = document.getElementById('su-showing-count')
  if (cnt) cnt.textContent = `Showing ${filtered.length} strateg${filtered.length === 1 ? 'y' : 'ies'}`

  renderStrategyList(filtered)
}

function clearFilters() {
  ['su-f-creator','su-f-underlying','su-f-behavior'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = ''
  })
  applyFilters()
}

const TAG_COLORS = {
  'Nifty':'su-tag-blue', 'Nifty & Sensex':'su-tag-blue', 'Sensex':'su-tag-blue',
  'Directional':'su-tag-green', 'Non-directional':'su-tag-purple',
  'Positional':'su-tag-orange', 'Intraday':'su-tag-orange',
  'Weekly':'su-tag-gray', 'Monthly':'su-tag-gray',
  'Selling':'su-tag-gray', 'Buying':'su-tag-gray',
}
function tagHtml(t) {
  const cls = TAG_COLORS[t] || 'su-tag-gray'
  return `<span class="su-tag ${cls}">${t}</span>`
}

function renderStrategyList(entries) {
  const list = document.getElementById('su-strategy-list')
  if (!entries.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:#334155;font-size:12px">No strategies match filters</div>`
    return
  }
  const sorted = [...entries].sort((a,b) => b[1].sharpe - a[1].sharpe)
  list.innerHTML = sorted.map(([name, d]) => {
    const m   = d.meta || {}
    const sig = d.signal
    const tags = [m.underlying, m.behavior, m.timeframe, m.contract, m.type].filter(Boolean)
    const ret  = d.avg_monthly_ret
    const retCls = ret >= 0 ? '#10b981' : '#ef4444'
    const selected = name === SU_SELECTED ? 'selected' : ''
    return `<div class="su-strat-item ${selected}" onclick="selectStrategy('${name.replace(/'/g,"\\'")}')">
      <div class="su-strat-name">${name}</div>
      <div class="su-strat-creator">${m.creator || 'Unknown'}</div>
      <div class="su-strat-tags">${tags.map(tagHtml).join('')}</div>
      <div class="su-strat-meta">
        <span style="font-size:11px;color:#475569">${m.capital_display || '₹1L'}</span>
        <span style="font-size:11px;font-weight:700;color:${retCls}">${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%/m</span>
      </div>
    </div>`
  }).join('')
}

function updateRegimeStats() {
  const names = Object.keys(ALL)
  const active = names.filter(n => ALL[n].meta?.active !== false).length
  const scale  = names.filter(n => ALL[n].signal?.signal === 'Scale').length
  document.getElementById('su-active-val').textContent = active
  document.getElementById('su-fit-val').textContent = `${scale}/${names.length}`
}

function selectStrategy(name) {
  SU_SELECTED = name
  document.querySelectorAll('.su-strat-item').forEach(el => {
    el.classList.toggle('selected', el.querySelector('.su-strat-name')?.textContent === name)
  })
  renderStrategyDetail(name)
}

function closeDetail() {
  SU_SELECTED = null
  document.getElementById('su-empty-state').style.display = 'flex'
  document.getElementById('su-detail').style.display = 'none'
  document.querySelectorAll('.su-strat-item').forEach(el => el.classList.remove('selected'))
}

function renderStrategyDetail(name) {
  const d = ALL[name]; if (!d) return
  const m = d.meta || {}
  document.getElementById('su-empty-state').style.display = 'none'
  document.getElementById('su-detail').style.display = 'block'

  // Header
  document.getElementById('su-det-name').textContent = name
  const tags = [m.underlying, m.behavior, m.timeframe, m.contract, m.type].filter(Boolean)
  const sigMap = { reduce:'su-sig-reduce', scale:'su-sig-scale', kill:'su-sig-kill', hold:'su-sig-hold' }
  document.getElementById('su-det-tags').innerHTML =
    tags.map(tagHtml).join('') +
    `<span class="su-signal-badge ${sigMap[d.signal.cls] || 'su-sig-hold'}">${d.signal.signal} ${d.signal.signal === 'Reduce' ? '↓' : d.signal.signal === 'Scale' ? '↑' : ''}</span>`

  // Key stats
  const currentDDStr = `${d.current_pnl >= 0 ? '+' : ''}${d.current_pnl.toFixed(2)}% (1d)`
  document.getElementById('su-key-stats').innerHTML = [
    { label:'Sharpe',       val: d.sharpe.toFixed(2),               cls: d.sharpe >= 2 ? 'su-pos' : '',  sub: d.sharpe >= 2 ? 'Excellent' : 'Below target' },
    { label:'Win Rate',     val: d.win_rate + '%',                   cls: d.win_rate >= 60 ? 'su-pos' : '', sub: `${d.wins}W · ${d.losses}L` },
    { label:'Avg Monthly',  val: `${d.avg_monthly_ret >= 0 ? '+' : ''}${d.avg_monthly_ret.toFixed(2)}%`, cls: d.avg_monthly_ret >= 0 ? 'su-pos' : 'su-neg', sub: 'On capital' },
    { label:'Max DD',       val: `${d.max_dd.toFixed(2)}%`,         cls: 'su-neg', sub: 'Peak to trough' },
    { label:'Current DD',   val: currentDDStr,                       cls: d.current_pnl >= 0 ? 'su-pos' : 'su-neg', sub: 'Last session' },
    { label:'Trading Days', val: d.active_days,                      cls: '',        sub: `${d.start} – ${d.end}` },
  ].map(s => `<div class="su-stat-card">
    <div class="su-stat-label">${s.label}</div>
    <div class="su-stat-val ${s.cls}">${s.val}</div>
    <div class="su-stat-sub">${s.sub}</div>
  </div>`).join('')

  // Charts
  renderSUEquityChart(d)
  renderSUDDChart(d)

  // Weekday table
  document.getElementById('su-weekday-table').innerHTML = `
    <thead><tr>
      <th>Day</th>
      <th class="r">Total ₹ (%)</th><th class="r">Average ₹ (%)</th>
      <th class="r">Best ₹ (%)</th><th class="r">Worst ₹ (%)</th>
      <th class="r">Win Rate</th><th class="r">Days</th>
    </tr></thead>
    <tbody>${(d.weekday || []).map(w => `<tr>
      <td><strong style="color:#f1f5f9">${w.day}</strong></td>
      <td class="r"><div class="su-td-main ${w.total_inr >= 0 ? 'su-pos' : 'su-neg'}">+₹${Math.abs(w.total_inr).toLocaleString('en-IN')}</div><div class="su-td-sub">(${w.total_pct >= 0 ? '+' : ''}${w.total_pct.toFixed(2)}%)</div></td>
      <td class="r"><div class="su-td-main ${w.avg_inr >= 0 ? 'su-pos' : 'su-neg'}">+₹${Math.abs(w.avg_inr).toLocaleString('en-IN')}</div><div class="su-td-sub">(${w.avg_pct >= 0 ? '+' : ''}${w.avg_pct.toFixed(2)}%)</div></td>
      <td class="r"><div class="su-pos">+₹${w.best_inr.toLocaleString('en-IN')}</div><div class="su-td-sub">(+${w.best_pct.toFixed(2)}%)</div></td>
      <td class="r"><div class="su-neg">-₹${Math.abs(w.worst_inr).toLocaleString('en-IN')}</div><div class="su-td-sub">(${w.worst_pct.toFixed(2)}%)</div></td>
      <td class="r">
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
          <span style="color:#f1f5f9;font-weight:700">${w.win_rate.toFixed(1)}%</span>
          <div style="height:3px;width:50px;background:#1e293b;border-radius:2px">
            <div style="height:3px;width:${w.win_rate}%;background:#10b981;border-radius:2px"></div>
          </div>
        </div>
      </td>
      <td class="r" style="color:#64748b">${w.days}</td>
    </tr>`).join('')}</tbody>`

  // Monthly table
  document.getElementById('su-monthly-table').innerHTML = `
    <thead><tr>
      <th>Month</th>
      <th class="r">Total ₹ (%)</th><th class="r">Daily Avg ₹ (%)</th>
      <th class="r">Best Day ₹ (%)</th><th class="r">Worst Day ₹ (%)</th>
      <th class="r">Win/Total</th>
    </tr></thead>
    <tbody>${(d.monthly_detail || []).map(m => `<tr>
      <td><strong style="color:#f1f5f9">${m.m}</strong></td>
      <td class="r"><div class="su-td-main ${m.total_inr >= 0 ? 'su-pos' : 'su-neg'}">${m.total_inr >= 0 ? '+' : '-'}₹${Math.abs(m.total_inr).toLocaleString('en-IN')}</div><div class="su-td-sub">(${m.total_pct >= 0 ? '+' : ''}${m.total_pct.toFixed(2)}%)</div></td>
      <td class="r"><div class="su-td-main ${m.avg_inr >= 0 ? 'su-pos' : 'su-neg'}">${m.avg_inr >= 0 ? '+' : '-'}₹${Math.abs(m.avg_inr).toLocaleString('en-IN')}</div><div class="su-td-sub">(${m.avg_pct >= 0 ? '+' : ''}${m.avg_pct.toFixed(2)}%)</div></td>
      <td class="r"><div class="su-pos">+₹${m.best_inr.toLocaleString('en-IN')}</div><div class="su-td-sub">(+${m.best_pct.toFixed(2)}%)</div></td>
      <td class="r"><div class="su-neg">-₹${Math.abs(m.worst_inr).toLocaleString('en-IN')}</div><div class="su-td-sub">(${m.worst_pct.toFixed(2)}%)</div></td>
      <td class="r" style="color:#94a3b8;font-weight:600">${m.wins}/${m.days}</td>
    </tr>`).join('')}</tbody>`
}

let suEqChart = null, suDdChart = null

function renderSUEquityChart(d) {
  destroyChart('su-eq'); destroyChart('su-dd')
  const raw = filterByPeriod(d.equity_curve, SU_PERIOD)
  const ctx = document.getElementById('su-eq-chart').getContext('2d')
  suEqChart = charts['su-eq'] = new Chart(ctx, {
    type: 'line',
    data: { datasets: [{
      data: raw.map(p => ({ x: p.d, y: p.e })),
      borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)',
      fill: true, borderWidth: 1.8, pointRadius: 0, tension: 0.1,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => ` ₹${c.parsed.y.toLocaleString('en-IN', {maximumFractionDigits:0})}` }}},
      scales: {
        x: { type:'time', time:{ unit:'month', displayFormats:{ month:'MM-dd' }},
             grid:{ color:'#1e293b' }, ticks:{ color:'#475569', font:{ size:9 }}},
        y: { grid:{ color:'#1e293b' }, ticks:{ color:'#475569', font:{ size:9 },
             callback: v => v >= 100000 ? '₹'+(v/100000).toFixed(1)+'L' : '₹'+(v/1000).toFixed(0)+'K' }}
      }
    }
  })
}

function renderSUDDChart(d) {
  const raw = filterByPeriod(d.drawdown, SU_PERIOD)
  const ctx = document.getElementById('su-dd-chart').getContext('2d')
  charts['su-dd'] = new Chart(ctx, {
    type: 'line',
    data: { datasets: [{
      data: raw.map(p => ({ x: p.d, y: p.v })),
      borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.12)',
      fill: true, borderWidth: 1.2, pointRadius: 0,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.parsed.y.toFixed(2)}%` }}},
      scales: {
        x: { type:'time', time:{ unit:'month', displayFormats:{ month:'MM-dd' }},
             grid:{ color:'#1e293b' }, ticks:{ color:'#475569', font:{ size:9 }}},
        y: { grid:{ color:'#1e293b' }, ticks:{ color:'#475569', font:{ size:9 },
             callback: v => v.toFixed(1)+'%' }}
      }
    }
  })
}

// SU period filter buttons
document.addEventListener('click', e => {
  if (e.target.classList.contains('su-tf-btn')) {
    document.querySelectorAll('.su-tf-btn').forEach(b => b.classList.remove('active'))
    e.target.classList.add('active')
    SU_PERIOD = e.target.dataset.sp
    if (SU_SELECTED && ALL[SU_SELECTED]) {
      renderSUEquityChart(ALL[SU_SELECTED])
      renderSUDDChart(ALL[SU_SELECTED])
    }
  }
})

function selectAndView(name) {
  PRIMARY = name
  navigateTo('portfolio-intelligence')
}

/* ── CAPITAL LADDER PAGE ─────────────────── */
let CL_DATA    = {}
let CL_CAPITAL = 100000

function applyCapitalLadderParams() {
  const cap = parseInt(document.getElementById('cl-capital-input')?.value || CL_CAPITAL)
  CL_CAPITAL = cap > 0 ? cap : CL_CAPITAL
  CL_DATA = {}
  renderCapitalLadder()
}

async function loadCapitalLadderData() {
  const res = await fetch(`/algodashboard/api/compounding?capital=${CL_CAPITAL}`)
  CL_DATA = await res.json()
  const sel = document.getElementById('cl-strategy-selector')
  if (sel && Object.keys(CL_DATA).length) {
    sel.innerHTML = Object.keys(CL_DATA).map(n =>
      `<option value="${n}"${n === PRIMARY ? ' selected' : ''}>${n}</option>`).join('')
  }
}

async function renderCapitalLadder() {
  await loadCapitalLadderData()
  const d = CL_DATA[PRIMARY] || CL_DATA[Object.keys(CL_DATA)[0]]
  if (!d) return

  // Sync input to current value
  const capIn = document.getElementById('cl-capital-input')
  if (capIn) capIn.value = CL_CAPITAL

  const PHASE_COLORS = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899']

  // ── KPI Cards ──────────────────────────
  const fmt = v => '₹' + Math.abs(v).toLocaleString('en-IN', {maximumFractionDigits:0})
  const kpis = [
    { label:'Initial Capital',     val: fmt(d.initial_capital),       sub: 'Starting base',                    color:'#10b981' },
    { label:'Current Base Capital',val: fmt(d.current_base),          sub: `Phase ${d.current_phase} base`,    color: PHASE_COLORS[(d.current_phase-1)%7] },
    { label:'Profit This Phase',   val: (d.current_phase_profit >= 0 ? '+' : '-') + fmt(Math.abs(d.current_phase_profit)),  sub: `Target: ${fmt(d.current_target)}`, color: d.current_phase_profit >= 0 ? '#3b82f6' : '#ef4444' },
    { label:'Total Portfolio',     val: fmt(d.current_total),         sub: 'Base + phase profit',              color:'#8b5cf6' },
    { label:'Capital Doublings',   val: d.phases_completed,           sub: `Phase ${d.current_phase} active`,  color:'#f59e0b' },
    { label:'Total Return',        val: `${d.total_return.toFixed(1)}%`, sub: 'On initial capital',            color: d.total_return >= 0 ? '#10b981' : '#ef4444' },
  ]
  document.getElementById('cl-kpi-row').innerHTML = kpis.map(k => `
    <div class="cl-kpi" style="border-top:3px solid ${k.color}">
      <div class="cl-kpi-label">${k.label}</div>
      <div class="cl-kpi-val" style="color:${k.color}">${k.val}</div>
      <div class="cl-kpi-sub">${k.sub}</div>
    </div>`).join('')

  // ── Progress Bar ───────────────────────
  const pct   = Math.min(d.current_progress, 100)
  const color = PHASE_COLORS[(d.current_phase-1)%7]
  document.getElementById('cl-progress-card').innerHTML = `
    <div class="cl-progress-header">
      <div>
        <div class="cl-progress-title">Phase ${d.current_phase} Progress — Next Capital Doubling</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">
          ${fmt(d.current_phase_profit)} earned of ${fmt(d.current_target)} target
          &nbsp;·&nbsp; Need ${fmt(Math.max(0, d.current_target - d.current_phase_profit))} more to double capital to ${fmt(d.current_base * 2)}
        </div>
      </div>
      <div class="cl-progress-pct" style="color:${color}">${pct.toFixed(1)}%</div>
    </div>
    <div class="cl-progress-bar-bg">
      <div class="cl-progress-bar-fill" style="width:${pct}%;background:${color}"></div>
    </div>
    <div class="cl-progress-labels">
      <span>₹0</span>
      <span style="color:${color};font-weight:600">${fmt(d.current_phase_profit)} / ${fmt(d.current_target)}</span>
      <span>${fmt(d.current_target)} → ${fmt(d.current_base * 2)}</span>
    </div>`

  // ── Equity Chart ───────────────────────
  destroyChart('cl-eq')
  const raw   = filterByPeriod(d.curve, currentPeriod)
  const ctx   = document.getElementById('cl-equity-chart').getContext('2d')
  const baseSteps = raw.map(p => ({ x: p.d, y: p.base }))

  // Build milestone vertical lines as custom plugin
  const milestoneISOs = new Set((d.milestones || []).map(m => m.date_iso))

  charts['cl-eq'] = new Chart(ctx, {
    type: 'line',
    data: { datasets: [
      { label: 'Portfolio Value',
        data: raw.map(p => ({ x: p.d, y: p.e })),
        borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.07)',
        fill: true, borderWidth: 2, pointRadius: 0, tension: 0.1, order: 1 },
      { label: 'Capital Base',
        data: baseSteps,
        borderColor: '#94a3b8', borderDash: [6,3], borderWidth: 1.5,
        pointRadius: 0, fill: false, stepped: true, order: 2 },
      { label: 'Milestones',
        data: (d.milestones || [])
          .filter(m => raw.find(p => p.d === m.date_iso))
          .map(m => ({ x: m.date_iso, y: raw.find(p => p.d === m.date_iso)?.e || 0 })),
        borderColor: 'transparent', backgroundColor: '#f59e0b',
        pointRadius: 8, pointStyle: 'triangle', showLine: false, order: 0 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode:'index', intersect: false },
      plugins: {
        legend: { display: true, position:'top', labels:{ font:{size:11}, boxWidth:10 }},
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtINR(c.parsed.y)}` }}
      },
      scales: {
        x: { type:'time', time:{ unit:'month', displayFormats:{month:'MMM yy'}},
             grid:{color:'#f1f5f9'}, ticks:{font:{size:10}} },
        y: { grid:{color:'#f1f5f9'}, ticks:{font:{size:10},
             callback: v => v>=100000 ? '₹'+(v/100000).toFixed(1)+'L' : '₹'+(v/1000).toFixed(0)+'K'}}
      }
    }
  })

  // ── Phase Breakdown ────────────────────
  const allPhases = [...(d.milestones || []).map(m => ({
    phase: m.phase, base: m.base, days: m.duration,
    completed: true, date: m.date, newBase: m.new_base, color: PHASE_COLORS[(m.phase-1)%7]
  })), {
    phase: d.current_phase, base: d.current_base,
    days: null, completed: false, date: 'In Progress',
    newBase: d.current_base * 2,
    color: PHASE_COLORS[(d.current_phase-1)%7],
    progress: d.current_progress,
  }]

  document.getElementById('cl-phase-breakdown').innerHTML = allPhases.map(p => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--border-light)">
      <div style="width:10px;height:10px;border-radius:50%;background:${p.color};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:700;color:var(--text)">Phase ${p.phase}
          <span style="font-size:10px;font-weight:400;color:var(--muted);margin-left:4px">Base: ${fmtINR(p.base)}</span>
        </div>
        <div style="font-size:10.5px;color:var(--muted)">${p.completed ? `Completed ${p.date} · ${p.days}d` : `Active · ${p.progress?.toFixed(1)}% complete`}</div>
      </div>
      <div style="font-size:11px;font-weight:600;color:${p.color}">${p.completed ? `→ ${fmtINR(p.newBase)}` : '⏳'}</div>
    </div>`).join('')

  // ── Milestone Table ────────────────────
  const completedRows = (d.milestones || []).map((m, i) => `
    <tr>
      <td><div class="cl-m-phase"><div class="cl-m-dot" style="background:${PHASE_COLORS[(m.phase-1)%7]}"></div>Phase ${m.phase}</div></td>
      <td><span class="cl-m-val">${fmtINR(m.base)}</span></td>
      <td><span class="cl-m-val">${fmtINR(m.target)}</span> <span class="cl-m-muted">(100% ROI)</span></td>
      <td style="color:var(--green);font-weight:700">${m.date} ✓</td>
      <td style="font-weight:600">${m.duration} days</td>
      <td><span style="color:${PHASE_COLORS[m.phase%7]};font-weight:700">${fmtINR(m.new_base)}</span></td>
    </tr>`)

  const currentRow = `
    <tr class="cl-current-row">
      <td><div class="cl-m-phase"><div class="cl-m-dot" style="background:${PHASE_COLORS[(d.current_phase-1)%7]}"></div>Phase ${d.current_phase} <span style="font-size:10px;color:var(--muted)">(Current)</span></div></td>
      <td><span class="cl-m-val">${fmtINR(d.current_base)}</span></td>
      <td><span class="cl-m-val">${fmtINR(d.current_target)}</span> <span class="cl-m-muted">(100% ROI)</span></td>
      <td style="color:var(--orange);font-weight:600">In Progress</td>
      <td style="color:var(--muted)">${d.current_progress.toFixed(1)}% done</td>
      <td><span style="color:${PHASE_COLORS[d.current_phase%7]};font-weight:700">${fmtINR(d.current_base * 2)}</span> <span style="color:var(--muted);font-size:10px">next</span></td>
    </tr>`

  document.getElementById('cl-milestone-table').innerHTML = `
    <thead><tr>
      <th>PHASE</th><th>BASE CAPITAL</th><th>TARGET PROFIT</th>
      <th>COMPLETED</th><th>DURATION</th><th>NEXT CAPITAL</th>
    </tr></thead>
    <tbody>${completedRows.join('')}${currentRow}</tbody>`
}

/* ── STAIRCASE PAGE ──────────────────────── */
let SC_DATA    = {}
let SC_CAPITAL = 100000
let SC_STEP    = 100000

function applyStaircaseParams() {
  const cap  = parseInt(document.getElementById('sc-capital-input')?.value || SC_CAPITAL)
  const step = parseInt(document.getElementById('sc-step-input')?.value    || SC_STEP)
  SC_CAPITAL = cap  > 0 ? cap  : SC_CAPITAL
  SC_STEP    = step > 0 ? step : SC_STEP
  SC_DATA = {}
  renderStaircase()
}

async function loadStaircaseData() {
  const res = await fetch(`/algodashboard/api/staircase?capital=${SC_CAPITAL}&step=${SC_STEP}`)
  SC_DATA = await res.json()
  const sel = document.getElementById('sc-strategy-selector')
  if (sel && Object.keys(SC_DATA).length) {
    sel.innerHTML = Object.keys(SC_DATA).map(n =>
      `<option value="${n}"${n === PRIMARY ? ' selected' : ''}>${n}</option>`).join('')
  }
}

async function renderStaircase() {
  await loadStaircaseData()
  const d = SC_DATA[PRIMARY] || SC_DATA[Object.keys(SC_DATA)[0]]
  if (!d) return

  // Sync inputs to current values
  const capIn  = document.getElementById('sc-capital-input')
  const stepIn = document.getElementById('sc-step-input')
  if (capIn)  capIn.value  = SC_CAPITAL
  if (stepIn) stepIn.value = SC_STEP

  const PHASE_COLORS = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899']
  const fmt = v => '₹' + Math.abs(v).toLocaleString('en-IN', {maximumFractionDigits:0})

  // ── KPI Cards ──────────────────────────
  const kpis = [
    { label:'Initial Capital',     val: fmt(d.initial_capital),       sub: 'Starting base',                    color:'#10b981' },
    { label:'Current Base Capital',val: fmt(d.current_base),          sub: `Phase ${d.current_phase} base`,    color: PHASE_COLORS[(d.current_phase-1)%7] },
    { label:'Profit This Phase',   val: (d.current_phase_profit >= 0 ? '+' : '-') + fmt(Math.abs(d.current_phase_profit)),  sub: `Target: ${fmt(d.current_target)}`, color: d.current_phase_profit >= 0 ? '#3b82f6' : '#ef4444' },
    { label:'Total Portfolio',     val: fmt(d.current_total),         sub: 'Base + phase profit',              color:'#8b5cf6' },
    { label:'Steps Climbed',       val: d.phases_completed,           sub: `Phase ${d.current_phase} active`,  color:'#f59e0b' },
    { label:'Total Return',        val: `${d.total_return.toFixed(1)}%`, sub: 'On initial capital',            color: d.total_return >= 0 ? '#10b981' : '#ef4444' },
  ]
  document.getElementById('sc-kpi-row').innerHTML = kpis.map(k => `
    <div class="cl-kpi" style="border-top:3px solid ${k.color}">
      <div class="cl-kpi-label">${k.label}</div>
      <div class="cl-kpi-val" style="color:${k.color}">${k.val}</div>
      <div class="cl-kpi-sub">${k.sub}</div>
    </div>`).join('')

  // ── Progress Bar ───────────────────────
  const pct   = Math.min(d.current_progress, 100)
  const color = PHASE_COLORS[(d.current_phase-1)%7]
  document.getElementById('sc-progress-card').innerHTML = `
    <div class="cl-progress-header">
      <div>
        <div class="cl-progress-title">Phase ${d.current_phase} Progress — Next ${fmt(d.current_target)} Step · ROI needed: ${((d.current_target / d.current_base) * 100).toFixed(1)}%</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">
          ${fmt(d.current_phase_profit)} earned of ${fmt(d.current_target)} fixed target
          &nbsp;·&nbsp; Need ${fmt(Math.max(0, d.current_target - d.current_phase_profit))} more → base becomes ${fmt(d.current_base + d.current_target)}
        </div>
      </div>
      <div class="cl-progress-pct" style="color:${color}">${pct.toFixed(1)}%</div>
    </div>
    <div class="cl-progress-bar-bg">
      <div class="cl-progress-bar-fill" style="width:${pct}%;background:${color}"></div>
    </div>
    <div class="cl-progress-labels">
      <span>₹0</span>
      <span style="color:${color};font-weight:600">${fmt(d.current_phase_profit)} / ${fmt(d.current_target)}</span>
      <span>${fmt(d.current_target)} → base ${fmt(d.current_base + d.current_target)}</span>
    </div>`

  // ── Equity Chart ───────────────────────
  destroyChart('sc-eq')
  const raw = filterByPeriod(d.curve, currentPeriod)
  const ctx = document.getElementById('sc-equity-chart').getContext('2d')

  charts['sc-eq'] = new Chart(ctx, {
    type: 'line',
    data: { datasets: [
      { label: 'Portfolio Value',
        data: raw.map(p => ({ x: p.d, y: p.e })),
        borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.07)',
        fill: true, borderWidth: 2, pointRadius: 0, tension: 0.1, order: 1 },
      { label: 'Capital Base',
        data: raw.map(p => ({ x: p.d, y: p.base })),
        borderColor: '#94a3b8', borderDash: [6,3], borderWidth: 1.5,
        pointRadius: 0, fill: false, stepped: true, order: 2 },
      { label: 'Milestones',
        data: (d.milestones || [])
          .filter(m => raw.find(p => p.d === m.date_iso))
          .map(m => ({ x: m.date_iso, y: raw.find(p => p.d === m.date_iso)?.e || 0 })),
        borderColor: 'transparent', backgroundColor: '#f59e0b',
        pointRadius: 8, pointStyle: 'triangle', showLine: false, order: 0 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode:'index', intersect: false },
      plugins: {
        legend: { display: true, position:'top', labels:{ font:{size:11}, boxWidth:10 }},
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtINR(c.parsed.y)}` }}
      },
      scales: {
        x: { type:'time', time:{ unit:'month', displayFormats:{month:'MMM yy'}},
             grid:{color:'#f1f5f9'}, ticks:{font:{size:10}} },
        y: { grid:{color:'#f1f5f9'}, ticks:{font:{size:10},
             callback: v => v>=100000 ? '₹'+(v/100000).toFixed(1)+'L' : '₹'+(v/1000).toFixed(0)+'K'}}
      }
    }
  })

  // ── Phase Breakdown ────────────────────
  const allPhases = [...(d.milestones || []).map(m => ({
    phase: m.phase, base: m.base, days: m.duration,
    completed: true, date: m.date, newBase: m.new_base,
    color: PHASE_COLORS[(m.phase-1)%7],
    roiNeeded: m.roi_needed,
  })), {
    phase: d.current_phase, base: d.current_base,
    days: null, completed: false, date: 'In Progress',
    newBase: d.current_base + d.step,
    color: PHASE_COLORS[(d.current_phase-1)%7],
    progress: d.current_progress,
    roiNeeded: ((d.current_target / d.current_base) * 100).toFixed(1),
  }]

  document.getElementById('sc-phase-breakdown').innerHTML = allPhases.map(p => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--border-light)">
      <div style="width:10px;height:10px;border-radius:50%;background:${p.color};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:700;color:var(--text)">Phase ${p.phase}
          <span style="font-size:10px;font-weight:400;color:var(--muted);margin-left:4px">Base: ${fmtINR(p.base)} · Need ${p.roiNeeded}% ROI</span>
        </div>
        <div style="font-size:10.5px;color:var(--muted)">${p.completed ? `Completed ${p.date} · ${p.days}d` : `Active · ${p.progress?.toFixed(1)}% complete`}</div>
      </div>
      <div style="font-size:11px;font-weight:600;color:${p.color}">${p.completed ? `→ ${fmtINR(p.newBase)}` : '⏳'}</div>
    </div>`).join('')

  // ── Milestone Table ────────────────────
  const completedRows = (d.milestones || []).map(m => `
    <tr>
      <td><div class="cl-m-phase"><div class="cl-m-dot" style="background:${PHASE_COLORS[(m.phase-1)%7]}"></div>Phase ${m.phase}</div></td>
      <td><span class="cl-m-val">${fmtINR(m.base)}</span></td>
      <td><span class="cl-m-val">${fmtINR(m.target)}</span> <span class="cl-m-muted">(${m.roi_needed}% ROI)</span></td>
      <td style="color:var(--green);font-weight:700">${m.date} ✓</td>
      <td style="font-weight:600">${m.duration} days</td>
      <td><span style="color:${PHASE_COLORS[m.phase%7]};font-weight:700">${fmtINR(m.new_base)}</span></td>
    </tr>`)

  const currentRow = `
    <tr class="cl-current-row">
      <td><div class="cl-m-phase"><div class="cl-m-dot" style="background:${PHASE_COLORS[(d.current_phase-1)%7]}"></div>Phase ${d.current_phase} <span style="font-size:10px;color:var(--muted)">(Current)</span></div></td>
      <td><span class="cl-m-val">${fmtINR(d.current_base)}</span></td>
      <td><span class="cl-m-val">${fmtINR(d.current_target)}</span> <span class="cl-m-muted">(${((d.current_target/d.current_base)*100).toFixed(1)}% ROI)</span></td>
      <td style="color:var(--orange);font-weight:600">In Progress</td>
      <td style="color:var(--muted)">${d.current_progress.toFixed(1)}% done</td>
      <td><span style="color:${PHASE_COLORS[d.current_phase%7]};font-weight:700">${fmtINR(d.current_base + d.current_target)}</span> <span style="color:var(--muted);font-size:10px">next</span></td>
    </tr>`

  document.getElementById('sc-milestone-table').innerHTML = `
    <thead><tr>
      <th>PHASE</th><th>BASE CAPITAL</th><th>TARGET PROFIT</th>
      <th>COMPLETED</th><th>DURATION</th><th>NEXT BASE</th>
    </tr></thead>
    <tbody>${completedRows.join('')}${currentRow}</tbody>`
}

/* ── MARKET REGIME PAGE ──────────────────── */
function renderMarketRegime() {
  const s = ALL[PRIMARY]; if (!s) return
  const regimes = s.regime_perf
  const labels = { DC:'Dull/Choppy', LV:'Low Vol', NM:'Normal', EL:'Elevated', HV:'High Vol' }
  const bclrs  = ['#94a3b8','#3b82f6','#10b981','#f59e0b','#ef4444']

  destroyChart('regime-bar')
  const ctx = document.getElementById('regime-bar-chart').getContext('2d')
  const entries = Object.entries(regimes).filter(([,v]) => v != null)
  charts['regime-bar'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(([k]) => labels[k] || k),
      datasets: [{
        data: entries.map(([,v]) => v),
        backgroundColor: entries.map(([,v]) => v >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'),
        borderRadius: 5,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.parsed.y.toFixed(1)}% avg monthly` }}},
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: '#f1f5f9' }, ticks: { callback: v => v+'%', font: { size: 10 } }}
      }
    }
  })

  // Regime stats table
  const rows = Object.entries(regimes).map(([r, v]) => {
    if (v == null) return `<tr><td>${labels[r]}</td><td class="num null-val">—</td><td class="num null-val">—</td></tr>`
    return `<tr>
      <td>${labels[r]} <span style="font-size:10px;color:var(--muted)">(${r})</span></td>
      <td class="num ${v >= 0 ? 'green' : 'red'}">${fmtPct(v,1)}</td>
      <td class="num">${v >= 5 ? '🟢 Strong' : v >= 0 ? '🟡 Neutral' : '🔴 Weak'}</td>
    </tr>`
  })
  document.getElementById('regime-stats-table').innerHTML = `
    <thead><tr><th>REGIME</th><th class="num">AVG MONTHLY %</th><th class="num">ASSESSMENT</th></tr></thead>
    <tbody>${rows.join('')}</tbody>`

  // Monthly PnL Bar
  destroyChart('monthly-bar')
  const mctx = document.getElementById('monthly-bar-chart').getContext('2d')
  charts['monthly-bar'] = new Chart(mctx, {
    type: 'bar',
    data: {
      labels: s.monthly.map(m => m.m),
      datasets: [{
        data: s.monthly.map(m => m.roi),
        backgroundColor: s.monthly.map(m => m.roi >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.parsed.y.toFixed(2)}% (${fmtINR(s.monthly[c.dataIndex].pnl)})` }}},
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 40 } },
        y: { grid: { color: '#f1f5f9' }, ticks: { callback: v => v+'%', font: { size: 10 } }}
      }
    }
  })
}

/* ── UPLOAD ──────────────────────────────── */
function openUpload() {
  document.getElementById('upload-modal').classList.add('open')
}
function closeUpload() {
  document.getElementById('upload-modal').classList.remove('open')
}
async function doUpload() {
  const input = document.getElementById('file-input')
  if (!input.files.length) return
  const fd = new FormData()
  fd.append('file', input.files[0])
  const r = await fetch('/algodashboard/api/upload', { method: 'POST', body: fd })
  const data = await r.json()
  if (data.ok) { closeUpload(); loadData() }
  else alert(data.error || 'Upload failed')
}

/* ── DAILY P&L PAGE ──────────────────────── */
let DP_DATA     = {}
let DP_DATE     = null
let DP_DAYS     = 30
let DP_CAPITALS = {}   // { strategyName: capital }

/* ── Helpers ── */
function dpCap(name)  { return DP_CAPITALS[name] || CAPITAL }
function dpTotalCap() { return (DP_DATA.names || []).reduce((s, n) => s + dpCap(n), 0) }

/* Recompute a raw history row using per-strategy capitals */
function dpRecompute(rawHistory) {
  let cum = 0
  return [...rawHistory].reverse().map(h => {
    const strats   = {}
    let portInr    = 0
    let active     = 0
    for (const [name, d] of Object.entries(h.strategies || {})) {
      const cap = dpCap(name)
      const inr = Math.round(d.pct / 100 * cap)
      strats[name] = { pct: d.pct, inr }
      portInr += inr
      active++
    }
    const totalCap = dpTotalCap() || CAPITAL
    const portPct  = active ? Math.round(portInr / totalCap * 10000) / 100 : 0
    cum += portInr
    return { ...h, strategies: strats, portfolio_inr: portInr, portfolio_pct: portPct,
             cumulative: Math.round(totalCap + cum), active }
  }).reverse()
}

async function renderDailyPnl() {
  const res = await fetch(`/algodashboard/api/daily?capital=${CAPITAL}`)
  DP_DATA   = await res.json()
  if (!DP_DATA.latest_date) {
    document.getElementById('dp-kpi-row').innerHTML =
      '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--muted)">No data found — upload strategy Excel files first.</div>'
    return
  }
  // Load saved capitals from localStorage
  const saved = localStorage.getItem('dp_capitals')
  if (saved) try { DP_CAPITALS = JSON.parse(saved) } catch(e) { DP_CAPITALS = {} }

  DP_DATE = DP_DATE && DP_DATA.history.find(h => h.d === DP_DATE) ? DP_DATE : DP_DATA.latest_date
  const inp = document.getElementById('dp-date-input')
  if (inp) inp.value = DP_DATE
  renderDPCapitalPanel()
  renderDPView()
}

function renderDPView() {
  const computed = dpRecompute(DP_DATA.history || [])
  const row = computed.find(h => h.d === DP_DATE) || computed[0]
  if (!row) return
  renderDPKPIs(row)
  renderDPStrategyCards(row)
  renderDPCumChart(computed)
  renderDPHistory(computed)
}

/* ── Capital Panel ── */
function renderDPCapitalPanel() {
  const names = DP_DATA.names || []
  const inp   = document.getElementById('dp-capital-inputs')
  if (!inp) return
  inp.innerHTML = names.map(name => {
    const cap = dpCap(name)
    return `
    <div style="display:flex;align-items:center;gap:8px;background:var(--bg);padding:8px 10px;border-radius:7px;border:1px solid var(--border)">
      <div style="flex:1;font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${name}</div>
      <div style="display:flex;align-items:center;gap:4px">
        <span style="font-size:12px;color:var(--muted)">₹</span>
        <input type="number" id="dpc-${CSS.escape(name)}" value="${cap}" min="1000" step="10000"
          style="width:110px;padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:inherit;outline:none;text-align:right"
          oninput="updateDPGrandTotal()">
      </div>
    </div>`
  }).join('')
  updateDPGrandTotal()
  updateDPTotalDisplay()
}

function updateDPGrandTotal() {
  const names = DP_DATA.names || []
  let total = 0
  names.forEach(name => {
    const el = document.getElementById(`dpc-${CSS.escape(name)}`)
    if (el) total += parseInt(el.value) || 0
  })
  const el = document.getElementById('dp-grand-total')
  if (el) el.textContent = '₹' + total.toLocaleString('en-IN')
}

function updateDPTotalDisplay() {
  const total = dpTotalCap()
  const el = document.getElementById('dp-total-cap-display')
  if (el) el.textContent = `Total: ₹${total.toLocaleString('en-IN')}`
}

function applyDPCapitals() {
  const names = DP_DATA.names || []
  names.forEach(name => {
    const el = document.getElementById(`dpc-${CSS.escape(name)}`)
    if (el) DP_CAPITALS[name] = parseInt(el.value) || CAPITAL
  })
  localStorage.setItem('dp_capitals', JSON.stringify(DP_CAPITALS))
  updateDPTotalDisplay()
  renderDPView()
}

function toggleDPCapitalPanel() {
  const body  = document.getElementById('dp-capital-body')
  const arrow = document.getElementById('dp-panel-arrow')
  const open  = body?.style.display !== 'none'
  if (body)  body.style.display  = open ? 'none' : 'block'
  if (arrow) arrow.textContent   = open ? '▼ expand' : '▲ collapse'
}

/* KPI Row */
function renderDPKPIs(row) {
  const names    = DP_DATA.names || []
  const strats   = row.strategies || {}
  const vals     = names.map(n => strats[n]?.pct).filter(v => v != null)
  const best     = vals.length ? Math.max(...vals) : null
  const worst    = vals.length ? Math.min(...vals) : null
  const bestName = names.find(n => strats[n]?.pct === best)
  const date     = new Date(row.d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })

  const kpis = [
    { label:'DATE',              main: date,                                              mainCls: '', sub: `${row.active} strategies active` },
    { label:'PORTFOLIO % TODAY', main: (row.portfolio_pct >= 0 ? '+' : '') + row.portfolio_pct.toFixed(2) + '%', mainCls: row.portfolio_pct >= 0 ? 'green' : 'red', sub: 'Avg across strategies' },
    { label:'PORTFOLIO ₹ TODAY', main: fmtINRSigned(row.portfolio_inr),                  mainCls: row.portfolio_inr >= 0 ? 'green' : 'red', sub: `Total capital: ${fmtINR(dpTotalCap())}` },
    { label:'BEST STRATEGY',     main: best != null ? (best >= 0 ? '+' : '') + best.toFixed(2) + '%' : '—', mainCls: 'green', sub: bestName ? bestName.slice(0,20) : '—' },
  ]
  const el = document.getElementById('dp-kpi-row')
  el.style.gridTemplateColumns = `repeat(${kpis.length},1fr)`
  el.innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-main ${k.mainCls}">${k.main}</div>
      ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}
    </div>`).join('')
}

/* Strategy Cards */
function renderDPStrategyCards(row) {
  const names  = DP_DATA.names || []
  const strats = row.strategies || {}
  const el     = document.getElementById('dp-cards')
  if (!names.length) { el.innerHTML = ''; return }

  el.innerHTML = names.map(name => {
    const d   = strats[name]
    if (!d) return `
      <div class="dp-strat-card dp-no-data">
        <div class="dp-strat-name">${name}</div>
        <div class="dp-strat-pct" style="color:var(--muted)">—</div>
        <div class="dp-strat-sub">No data this day</div>
      </div>`
    const pos = d.pct >= 0
    return `
      <div class="dp-strat-card ${pos ? 'dp-pos' : 'dp-neg'}">
        <div class="dp-strat-name" title="${name}">${name.length > 22 ? name.slice(0,22)+'…' : name}</div>
        <div class="dp-strat-pct ${pos ? 'green' : 'red'}">${pos ? '+' : ''}${d.pct.toFixed(2)}%</div>
        <div class="dp-strat-inr">${fmtINRSigned(d.inr)}</div>
        <div class="dp-strat-bar">
          <div class="dp-strat-bar-fill" style="width:${Math.min(Math.abs(d.pct)*10,100)}%;background:${pos ? '#10b981' : '#ef4444'}"></div>
        </div>
      </div>`
  }).join('')
}

/* Cumulative Chart */
function renderDPCumChart(computed) {
  destroyChart('dp-cum')
  const history = computed || dpRecompute(DP_DATA.history || [])
  const days    = parseInt(document.querySelector('.dp-tf.active')?.dataset.dp || '30')
  const raw     = days > 0 ? history.slice(0, days) : history
  const sorted  = [...raw].reverse()

  const ctx = document.getElementById('dp-cum-chart')?.getContext('2d')
  if (!ctx) return

  charts['dp-cum'] = new Chart(ctx, {
    type: 'bar',
    data: { datasets: [
      { label: 'Daily Portfolio ₹',
        data: sorted.map(h => ({ x: h.d, y: h.portfolio_inr })),
        backgroundColor: sorted.map(h => h.portfolio_inr >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'),
        borderRadius: 3, borderSkipped: false },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${fmtINRSigned(c.parsed.y)}` }}
      },
      scales: {
        x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'dd MMM' } },
             grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 12 } },
        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 },
             callback: v => v >= 1000 ? '₹'+(v/1000).toFixed(0)+'K' : '₹'+v }}
      }
    }
  })
}

/* History Table */
function renderDPHistory(computed) {
  const names   = DP_DATA.names || []
  const history = computed || dpRecompute(DP_DATA.history || [])
  const rows    = parseInt(document.getElementById('dp-rows-select')?.value || '30')
  const slice   = rows > 0 ? history.slice(0, rows) : history

  const thead = `<thead><tr>
    <th>DATE</th>
    ${names.map(n => `<th class="num" title="${n}">${n.length > 14 ? n.slice(0,14)+'…' : n}</th>`).join('')}
    <th class="num">PORTFOLIO %</th>
    <th class="num">PORTFOLIO ₹</th>
  </tr></thead>`

  const tbody = slice.map(h => {
    const isSelected = h.d === DP_DATE
    const strats = h.strategies || {}
    const cells  = names.map(n => {
      const d = strats[n]
      if (!d) return `<td class="num" style="color:var(--muted)">—</td>`
      const cls = d.pct >= 0 ? 'green' : 'red'
      return `<td class="num ${cls}">${d.pct >= 0 ? '+' : ''}${d.pct.toFixed(2)}%</td>`
    }).join('')

    const ppCls = h.portfolio_pct >= 0 ? 'green' : 'red'
    const piCls = h.portfolio_inr >= 0 ? 'green' : 'red'
    const display = new Date(h.d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })

    return `<tr class="${isSelected ? 'dp-selected-row' : ''}" onclick="dpSelectDate('${h.d}')" style="cursor:pointer">
      <td style="font-weight:${isSelected ? '700' : '500'};color:${isSelected ? 'var(--green)' : 'var(--text)'}">${display}</td>
      ${cells}
      <td class="num ${ppCls}" style="font-weight:600">${h.portfolio_pct >= 0 ? '+' : ''}${h.portfolio_pct.toFixed(2)}%</td>
      <td class="num ${piCls}">${fmtINRSigned(h.portfolio_inr)}</td>
    </tr>`
  }).join('')

  document.getElementById('dp-history-table').innerHTML = thead + `<tbody>${tbody}</tbody>`
}

/* Date Navigation */
function dpSelectDate(dateStr) {
  DP_DATE = dateStr
  const inp = document.getElementById('dp-date-input')
  if (inp) inp.value = dateStr
  const computed = dpRecompute(DP_DATA.history || [])
  const row = computed.find(h => h.d === dateStr)
  if (row) { renderDPKPIs(row); renderDPStrategyCards(row) }
  renderDPHistory(computed)
}

function dpChangeDate(dir) {
  const computed = dpRecompute(DP_DATA.history || [])
  const idx      = computed.findIndex(h => h.d === DP_DATE)
  const newIdx   = idx + dir
  if (newIdx >= 0 && newIdx < computed.length) dpSelectDate(computed[newIdx].d)
}

function dpGoToday() {
  if (DP_DATA.latest_date) dpSelectDate(DP_DATA.latest_date)
}

// DP time filter buttons
document.addEventListener('click', e => {
  if (e.target.classList.contains('dp-tf')) {
    document.querySelectorAll('.dp-tf').forEach(b => b.classList.remove('active'))
    e.target.classList.add('active')
    renderDPCumChart(dpRecompute(DP_DATA.history || []))
  }
})

/* ── TRADETRON PAGE ──────────────────────── */
let TT_LINKS = []

const STATUS_MAP = {
  live:    { label: '🟢 Live',    cls: 'tt-live'    },
  paused:  { label: '🟡 Paused',  cls: 'tt-paused'  },
  testing: { label: '🔵 Testing', cls: 'tt-testing' },
  stopped: { label: '🔴 Stopped', cls: 'tt-stopped' },
}

async function renderTradetron() {
  const res = await fetch('/algodashboard/api/links')
  TT_LINKS  = await res.json()
  renderTTCards()
}

function renderTTCards() {
  const cards   = document.getElementById('tt-cards')
  const empty   = document.getElementById('tt-empty')
  const stats   = document.getElementById('tt-stats')

  if (!TT_LINKS.length) {
    cards.innerHTML = ''; empty.style.display = 'block'; stats.innerHTML = ''; return
  }
  empty.style.display = 'none'

  // Stats bar
  const total   = TT_LINKS.length
  const live    = TT_LINKS.filter(l => l.status === 'live').length
  const paused  = TT_LINKS.filter(l => l.status === 'paused').length
  const testing = TT_LINKS.filter(l => l.status === 'testing').length
  stats.innerHTML = [
    { label: 'Total Strategies', val: total,   color: '#3b82f6' },
    { label: 'Live',             val: live,    color: '#10b981' },
    { label: 'Paused',           val: paused,  color: '#f59e0b' },
    { label: 'Testing',          val: testing, color: '#06b6d4' },
  ].map(s => `
    <div class="cl-kpi" style="border-top:3px solid ${s.color};min-width:120px;flex:1;max-width:180px">
      <div class="cl-kpi-label">${s.label}</div>
      <div class="cl-kpi-val" style="color:${s.color}">${s.val}</div>
    </div>`).join('')

  // Cards
  cards.innerHTML = TT_LINKS.map(l => {
    const st  = STATUS_MAP[l.status] || STATUS_MAP.live
    const cap = l.capital ? '₹' + Number(l.capital).toLocaleString('en-IN') : '—'
    const tags = [l.underlying, l.type].filter(Boolean)
    return `
    <div class="tt-card">
      <div class="tt-card-top">
        <div>
          <div class="tt-card-name">${l.name}</div>
          <div class="tt-card-tags">${tags.map(t => `<span class="su-tag su-tag-gray">${t}</span>`).join('')}</div>
        </div>
        <span class="tt-status ${st.cls}">${st.label}</span>
      </div>
      ${l.notes ? `<div class="tt-card-notes">${l.notes}</div>` : ''}
      <div class="tt-card-meta">
        <span>Capital: <strong>${cap}</strong></span>
        <span style="color:var(--muted);font-size:10px">Added ${l.created_at || ''}</span>
      </div>
      <div class="tt-card-actions">
        <a href="${l.url}" target="_blank" rel="noopener noreferrer" class="tt-btn-open">
          ⚡ Open on Tradetron ↗
        </a>
        <div style="display:flex;gap:6px">
          <button class="tt-btn-edit" onclick="editLink('${l.id}')">✏️ Edit</button>
          <button class="tt-btn-del"  onclick="deleteLink('${l.id}')">🗑</button>
        </div>
      </div>
    </div>`
  }).join('')
}

function openLinkModal(id) {
  document.getElementById('tt-edit-id').value  = ''
  document.getElementById('tt-name').value      = ''
  document.getElementById('tt-url').value       = ''
  document.getElementById('tt-underlying').value= ''
  document.getElementById('tt-type').value      = ''
  document.getElementById('tt-capital').value   = ''
  document.getElementById('tt-status').value    = 'live'
  document.getElementById('tt-notes').value     = ''
  document.getElementById('tt-modal-title').textContent = 'Add Strategy Link'
  document.getElementById('tt-modal').classList.add('open')
}

function editLink(id) {
  const l = TT_LINKS.find(x => x.id === id); if (!l) return
  document.getElementById('tt-edit-id').value   = l.id
  document.getElementById('tt-name').value       = l.name      || ''
  document.getElementById('tt-url').value        = l.url       || ''
  document.getElementById('tt-underlying').value = l.underlying|| ''
  document.getElementById('tt-type').value       = l.type      || ''
  document.getElementById('tt-capital').value    = l.capital   || ''
  document.getElementById('tt-status').value     = l.status    || 'live'
  document.getElementById('tt-notes').value      = l.notes     || ''
  document.getElementById('tt-modal-title').textContent = 'Edit Strategy Link'
  document.getElementById('tt-modal').classList.add('open')
}

function closeLinkModal() {
  document.getElementById('tt-modal').classList.remove('open')
}

async function saveLink() {
  const name = document.getElementById('tt-name').value.trim()
  const url  = document.getElementById('tt-url').value.trim()
  if (!name) { alert('Please enter a strategy name'); return }
  if (!url)  { alert('Please enter a Tradetron link'); return }

  const body = {
    id:         document.getElementById('tt-edit-id').value || null,
    name,
    url,
    underlying: document.getElementById('tt-underlying').value,
    type:       document.getElementById('tt-type').value,
    capital:    document.getElementById('tt-capital').value,
    status:     document.getElementById('tt-status').value,
    notes:      document.getElementById('tt-notes').value.trim(),
  }
  if (!body.id) delete body.id

  const res = await fetch('/algodashboard/api/links', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  if (data.ok) { TT_LINKS = data.links; closeLinkModal(); renderTTCards() }
}

async function deleteLink(id) {
  if (!confirm('Delete this strategy link?')) return
  const res  = await fetch(`/algodashboard/api/links/${id}`, { method: 'DELETE' })
  const data = await res.json()
  if (data.ok) { TT_LINKS = data.links; renderTTCards() }
}

/* ── LOADING / EMPTY ─────────────────────── */
function showLoading(on) {
  document.getElementById('loading-overlay').style.display = on ? 'flex' : 'none'
}
function showEmpty() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('page-portfolio-intelligence').classList.add('active')
  document.getElementById('kpi-row').innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📂</div>
      <div class="empty-title">No strategy data found</div>
      <p style="font-size:12px;color:var(--muted);margin-top:6px">Add .xlsx files to the <code>dashboard/data/</code> folder or upload one below.</p>
      <button class="ai-btn" style="width:auto;margin-top:14px;padding:8px 20px" onclick="openUpload()">+ Upload Excel File</button>
    </div>`
}
