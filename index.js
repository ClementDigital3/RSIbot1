// index.js — DERIV RSI BOT (New API 2026) + Web Dashboard

import dotenv from 'dotenv';
dotenv.config();

import { DerivConnection } from './src/connection.js';
import { RSIStrategy } from './src/strategy.js';
import { RiskManager } from './src/riskManager.js';
import { Trader } from './src/trader.js';
import logger from './src/logger.js';
import { createDashboardServer } from './src/server.js';

const config = {
  DERIV_API_TOKEN:    process.env.DERIV_API_TOKEN,
  DERIV_APP_ID:       process.env.DERIV_APP_ID,
  DERIV_ACCOUNT_ID:   process.env.DERIV_ACCOUNT_ID || null,
  SYMBOL:             process.env.SYMBOL             || '1HZ75V',
  STAKE:              process.env.STAKE              || '1',
  MAX_ACTIVE_TRADES:  process.env.MAX_ACTIVE_TRADES  || '1',
  STOP_LOSS_BALANCE:  process.env.STOP_LOSS_BALANCE  || '50',
  RSI_PERIOD:         process.env.RSI_PERIOD         || '14',
  RSI_OVERSOLD:       process.env.RSI_OVERSOLD       || '20',
  RSI_OVERBOUGHT:     process.env.RSI_OVERBOUGHT     || '80',
  CONTRACT_DURATION:  process.env.CONTRACT_DURATION  || '5',
  MIN_TICKS_REQUIRED: process.env.MIN_TICKS_REQUIRED || '50',
};

if (!config.DERIV_API_TOKEN || config.DERIV_API_TOKEN === 'YOUR_PAT_TOKEN_HERE') {
  console.error('\n❌  Missing DERIV_API_TOKEN in .env file'); process.exit(1);
}
if (!config.DERIV_APP_ID || config.DERIV_APP_ID === 'YOUR_APP_ID_HERE') {
  console.error('\n❌  Missing DERIV_APP_ID in .env file'); process.exit(1);
}

async function main() {
  // Start dashboard server
  const { broadcast } = createDashboardServer(3000);

  logger.banner();
  logger.info(`Symbol: ${config.SYMBOL} | Stake: $${config.STAKE} | Duration: ${config.CONTRACT_DURATION}min`);
  logger.info(`RSI(${config.RSI_PERIOD}) | Oversold: ${config.RSI_OVERSOLD} | Overbought: ${config.RSI_OVERBOUGHT}`);
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

  logger.info(`Subscribing to ${config.SYMBOL} tick stream...`);
  await conn.subscribeToTicks(config.SYMBOL);

  conn.on('reconnected', async () => {
    logger.info('Reconnected — resubscribing to feeds...');
    try {
      await conn.getBalance();
      await conn.subscribeToTicks(config.SYMBOL);
      strategy.prices = [];
      logger.info('Resubscribed successfully. Recollecting ticks...');
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
      rsi:            strategy.lastRSI,
      macd:           strategy.lastMACD?.histogram,
      signal,
      collecting:     strategy.prices.length < strategy.minTicks,
      ticksCollected: strategy.prices.length,
      minTicks:       strategy.minTicks,
    });

    if (signal === 'HOLD') return;

    const { allowed, reason } = riskMgr.canTrade(account.balance);
    if (!allowed) { logger.warn(`Trade blocked: ${reason}`); return; }
    if (isTrading) { logger.warn('Trade in progress — skipping signal'); return; }

    isTrading = true;
    riskMgr.onTradeOpened();
    broadcast('trade_opened', { signal, stake: config.STAKE, symbol: config.SYMBOL });

    try {
      const result = await trader.executeTrade(signal);
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
      } else {
        riskMgr.activeTrades = Math.max(0, riskMgr.activeTrades - 1);
        logger.warn('Trade failed — counter reset');
      }
    } catch (err) {
      logger.error(`Trade error: ${err.message}`);
      riskMgr.activeTrades = Math.max(0, riskMgr.activeTrades - 1);
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
    logger.divider();
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