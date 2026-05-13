# 🤖 Deriv RSI Bot

Automated trading bot for Deriv Synthetic Indices built with Node.js and WebSockets.

## Architecture

```
index.js (entry)
├── src/connection.js   — Deriv WebSocket, auth, reconnect
├── src/strategy.js     — RSI signal engine  
├── src/indicators.js   — RSI + SMA calculations
├── src/trader.js       — Contract buy/watch execution
├── src/riskManager.js  — Capital protection, P&L tracking
└── src/logger.js       — Colored terminal output
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```

### 3. Get a Deriv API Token
- Go to https://app.deriv.com/account/api-token
- Create a token with: **Read**, **Trade**, **Payments** scope
- Paste it into `.env` as `DERIV_API_TOKEN`

> ⚠️ **Always start on a DEMO account first!**
> Create a demo account at https://app.deriv.com

### 4. Run the bot
```bash
node index.js
```

## Configuration (.env)

| Variable | Description | Default |
|---|---|---|
| `DERIV_API_TOKEN` | Your Deriv API token | *required* |
| `SYMBOL` | Synthetic index to trade | `R_75` |
| `STAKE` | USD amount per trade | `1` |
| `STOP_LOSS_BALANCE` | Stop bot if balance drops here | `50` |
| `RSI_PERIOD` | RSI calculation period | `14` |
| `RSI_OVERSOLD` | Buy threshold | `30` |
| `RSI_OVERBOUGHT` | Sell threshold | `70` |
| `CONTRACT_DURATION` | Trade duration (minutes) | `1` |
| `MAX_ACTIVE_TRADES` | Max concurrent open trades | `1` |

## How the Strategy Works

```
Collect 20+ ticks
    ↓
Calculate RSI(14) on each new tick
    ↓
RSI ≤ 30 → BUY signal  (CALL contract — expect price to rise)
RSI ≥ 70 → SELL signal (PUT contract  — expect price to fall)
    ↓
Risk Manager checks: balance OK? no active trades?
    ↓
Buy contract → watch for settlement → log result
```

## Symbols Reference

| Symbol | Name | Volatility |
|---|---|---|
| `R_10` | Volatility 10 Index | Low |
| `R_25` | Volatility 25 Index | Low-Med |
| `R_50` | Volatility 50 Index | Medium |
| `R_75` | Volatility 75 Index | High ← recommended |
| `R_100` | Volatility 100 Index | Very High |

## Roadmap (Next Steps)

- [ ] Add Martingale / Anti-Martingale stake sizing
- [ ] Add MACD confirmation filter (reduce false signals)
- [ ] Add web dashboard (React + WebSocket)
- [ ] Add trade log export to CSV
- [ ] Add Telegram alerts on wins/losses
- [ ] Backtest engine using historical tick data

## ⚠️ Disclaimer

Trading involves significant financial risk. This bot is for educational
purposes. Always test on a demo account before trading real money.
Never trade more than you can afford to lose.
