// src/strategy.js
// RSI + MACD Crossover Strategy (SMA trend filter removed)

import { calculateRSI, calculateMACD, getRSISignal } from './indicators.js';
import logger from './logger.js';

export class RSIStrategy {
  constructor(config) {
    this.rsiPeriod   = parseInt(config.RSI_PERIOD)         || 14;
    this.oversold    = parseInt(config.RSI_OVERSOLD)       || 20;
    this.overbought  = parseInt(config.RSI_OVERBOUGHT)     || 80;
    this.minTicks    = parseInt(config.MIN_TICKS_REQUIRED) || 50;

    this.prices      = [];
    this.lastSignal  = 'HOLD';
    this.lastRSI     = null;
    this.lastMACD    = null;
  }

  onTick(price) {
    this.prices.push(price);
    if (this.prices.length > 200) this.prices.shift();

    if (this.prices.length < this.minTicks) {
      logger.info(`Collecting ticks... ${this.prices.length}/${this.minTicks}`);
      return 'HOLD';
    }

    const rsi  = calculateRSI(this.prices, this.rsiPeriod);
    const macd = calculateMACD(this.prices);

    if (rsi === null || macd === null) return 'HOLD';

    this.lastRSI  = rsi;
    this.lastMACD = macd;

    const rsiSignal = getRSISignal(rsi, this.oversold, this.overbought);

    // ── Rules ─────────────────────────────────────────────
    // BUY:  RSI ≤ 20 (extremely oversold) + MACD histogram positive
    // SELL: RSI ≥ 80 (extremely overbought) + MACD histogram negative
    let signal = 'HOLD';
    if (rsiSignal === 'BUY'  && macd.histogram > 0) signal = 'BUY';
    if (rsiSignal === 'SELL' && macd.histogram < 0) signal = 'SELL';

    const macdStr = macd.histogram >= 0
      ? `MACD+${macd.histogram.toFixed(4)}`
      : `MACD${macd.histogram.toFixed(4)}`;

    logger.info(`Price: ${price.toFixed(5)} | ${logger.rsi(rsi)} | ${macdStr} | Signal: ${signal}`);

    if (signal !== 'HOLD' && signal !== this.lastSignal) {
      this.lastSignal = signal;
      logger.signal(`⚡ ${signal} — RSI ${rsi.toFixed(2)} + MACD ${macd.histogram > 0 ? 'positive' : 'negative'} confirmed`);
      return signal;
    }

    if (signal === 'HOLD') this.lastSignal = 'HOLD';
    return 'HOLD';
  }
}