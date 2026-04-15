# AlgoSanchay — Portfolio Intelligence Dashboard

> **Adaptive · Quant · Discipline**  
> A professional algorithmic trading analytics dashboard built for Indian options & equity strategy traders.

---

## What is AlgoSanchay?

AlgoSanchay is a web-based performance analytics platform for algorithmic trading strategies. Upload your strategy's daily PnL data (Excel) and instantly get deep insights — equity curves, drawdown analysis, regime detection, compounding projections, and AI-driven portfolio signals — all in one clean dashboard.

---

## Features

### 📊 Portfolio Intelligence
- Equity curve vs Buy & Hold benchmark
- Drawdown chart with peak-to-trough tracking
- Sharpe ratio, Sortino ratio, CVaR (tail risk)
- Win rate, win/loss streaks, average daily PnL
- AI-powered **Scale / Hold / Reduce / Kill** signals per strategy

### 🌐 Strategy Universe
- Browse and filter all uploaded strategies
- Filter by Creator, Underlying (Nifty / BankNifty), Behavior
- Drill-in view: equity chart, drawdown, weekday performance, monthly breakdown

### ⬆ Capital Ladder
- **Geometric compounding** — capital doubles every time you earn 100% ROI
- Visual phase-by-phase milestone tracker
- Progress bar toward next capital doubling

### ↗ Staircase Compounding *(unique)*
- **Linear compounding** — add a fixed ₹ amount to base every time you hit a profit milestone
- Phase 1: ₹1L base → earn ₹1L → base = ₹2L  
- Phase 2: ₹2L base → earn ₹1L → base = ₹3L  
- Fully configurable: set your own starting capital and step size
- Shows ROI% needed at each phase (gets easier as capital grows)

### 🌀 Market Regime
- Rolling 20-day volatility classification: **LV / Normal / Elevated / HV / Dull-Choppy**
- Average monthly return per regime
- Month-wise PnL bar chart

### 🔒 Overview
- Combined equity curves for all strategies on one chart
- Sortable summary table: Sharpe, Sortino, Max DD, Total ROI, Avg Monthly ROI

---

## Data Format

Upload an Excel file (`.xlsx`) with:
- A **Date** column
- One or more **PnL (%)** columns — each column is treated as a separate strategy

```
| Date       | Strategy A | Strategy B |
|------------|------------|------------|
| 01-01-2024 | 0.45       | -0.12      |
| 02-01-2024 | 0.32       | 0.28       |
```

---

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Backend  | Python · Flask |
| Frontend | Vanilla JS · Chart.js |
| Data     | Pandas · NumPy |
| Styling  | Custom CSS (dark + light) |

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/algosanchay.git
cd algosanchay

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the server
python app.py

# 4. Open in browser
http://localhost:8080/algodashboard/portfolio-intelligence
```

---

## Deploy

One-click deploy on Railway:

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

Or deploy on Render, PythonAnywhere, or any Python-compatible host.

---

## Built For

- Algo traders running **Nifty / BankNifty** options strategies
- Quant analysts tracking **multiple strategies** simultaneously
- Anyone who wants to visualize **compounding growth** realistically

---

*Built with discipline. Compounded with patience.*
