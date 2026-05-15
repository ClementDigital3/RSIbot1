// index.js — DERIV ACCUMULATOR BOT

import dotenv from 'dotenv';
dotenv.config();

import { DerivConnection } from './src/connection.js';
import { RSIStrategy }     from './src/strategy.js';
import { RiskManager }     from './src/riskManager.js';
import { Trader }          from './src/trader.js';
import logger              from './src/logger.js';
import { createDashboardServer } from './src/server.js';

const config = {
  DERIV_API_TOKEN:    process.env.DERIV_API_TOKEN,
  DERIV_APP_ID:       process.env.DERIV_APP_ID,
  DERIV_ACCOUNT_ID:   process.env.DERIV_ACCOUNT_ID   || null,
  SYMBOL:             process.env.SYMBOL              || '1HZ75V',
  STAKE:              process.env.STAKE               || '1',
  MAX_ACTIVE_TRADES:  process.env.MAX_ACTIVE_TRADES   || '1',
  STOP_LOSS_BALANCE:  process.env.STOP_LOSS_BALANCE   || '50',
  GROWTH_RATE:        process.env.GROWTH_RATE         || '0.01',
  TAKE_PROFIT_PCT:    process.env.TAKE_PROFIT_PCT     || '0.40',
  TRAILING_STOP_PCT:  process.env.TRAILING_STOP_PCT   || '0.50',
  MIN_TICKS_REQUIRED: process.env.MIN_TICKS_REQUIRED  || '20',
  CONTRACT_DURATION:  process.env.CONTRACT_DURATION   || '1',
  RSI_PERIOD:         '14',
  RSI_OVERSOLD:       '30',
  RSI_OVERBOUGHT:     '70',
};

if (!config.DERIV_API_TOKEN || config.DERIV_API_TOKEN === 'YOUR_PAT_TOKEN_HERE') {
  console.error('\n❌  Missing DERIV_API_TOKEN'); process.exit(1);
}
if (!config.DERIV_APP_ID || config.DERIV_APP_ID === 'YOUR_APP_ID_HERE') {
  console.error('\n❌  Missing DERIV_APP_ID'); process.exit(1);
}

async function main() {
  const { broadcast } = createDashboardServer(3000);

  logger.banner();
  logger.info(`Mode: ACCUMULATOR | Symbol: ${config.SYMBOL} | Stake: $${config.STAKE}`);
  logger.info(`Growth: ${parseFloat(config.GROWTH_RATE) * 100}%/tick | Take profit: ${parseFloat(config.TAKE_PROFIT_PCT) * 100}% | Trailing stop: ${parseFloat(config.TRAILING_STOP_PCT) * 100}%`);
  logger.info(`Stop-loss floor: $${config.STOP_LOSS_BALANCE}`);
  logger.divider();

  const conn     = new DerivConnection(config.DERIV_API_TOKEN, config.DERIV_APP_ID);
  const strategy = new RSIStrategy(config);
  const riskMgr  = new RiskManager(config);
  const trader   = new Trader(conn, config);

  const account = await conn.connect(config.DERIV_ACCOUNT_ID);
  riskMgr.setStartBalance(account.balance);
  logger.balance(account.balance, account.currency);
  logger.divider();

  broadcast('connected', {
    accountId: account.accountId,
    balance:   account.balance,
    currency:  account.currency,
    symbol:    config.SYMBOL,
    stake:     config.STAKE,
  });

  conn.on('balance', (data) => {
    const bal = data.balance?.balance;
    if (bal !== undefined) {
      logger.balance(bal);
      broadcast('balance', { balance: bal });
    }
  });

  await conn.getBalance();
  await conn.subscribeToTicks(config.SYMBOL);

  conn.on('reconnected', async () => {
    logger.info('Reconnected — resubscribing...');
    try {
      await conn.getBalance();
      await conn.subscribeToTicks(config.SYMBOL);
      strategy.prices = [];
      strategy.ready  = false;
      broadcast('reconnected', {});
    } catch (err) {
      logger.error(`Resubscribe failed: ${err.message}`);
    }
  });

  let isTrading = false;

  conn.on('tick', async (data) => {
    const tick = data.tick;
    if (!tick) return;

    const price  = parseFloat(tick.quote);
    const signal = strategy.onTick(price);

    broadcast('tick', {
      price,
      rsi:            null,
      macd:           null,
      signal,
      collecting:     strategy.prices.length < strategy.minTicks,
      ticksCollected: strategy.prices.length,
      minTicks:       strategy.minTicks,
    });

    if (signal === 'HOLD') return;

    const { allowed, reason } = riskMgr.canTrade(account.balance);
    if (!allowed) { logger.warn(`Trade blocked: ${reason}`); return; }
    if (isTrading) return;

    isTrading = true;
    riskMgr.onTradeOpened();
    broadcast('trade_opened', { signal: 'BUY', stake: config.STAKE, symbol: config.SYMBOL });

    try {
      const result = await trader.executeTrade();
      if (result) {
        riskMgr.onTradeClosed(result.profit);
        broadcast('trade_closed', {
          profit:     result.profit,
          status:     result.status,
          wins:       riskMgr.totalWins,
          losses:     riskMgr.totalLosses,
          winRate:    riskMgr.getWinRate(),
          netPnL:     riskMgr.totalPnL,
          contractId: result.contractId,
        });
        // Reset strategy so next trade opens immediately
        strategy.reset();
      } else {
        riskMgr.activeTrades = Math.max(0, riskMgr.activeTrades - 1);
        strategy.reset();
      }
    } catch (err) {
      logger.error(`Trade error: ${err.message}`);
      riskMgr.activeTrades = Math.max(0, riskMgr.activeTrades - 1);
      strategy.reset();
    } finally {
      isTrading = false;
    }

    logger.divider();
  });

  const shutdown = () => {
    logger.divider();
    logger.warn('Shutting down...');
    const s = riskMgr.getSummary();
    logger.info(`Wins: ${s.wins} | Losses: ${s.losses} | Win Rate: ${s.winRate} | Net P&L: ${s.netPnL}`);
    broadcast('shutdown', s);
    conn.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});