// src/strategy.js — Accumulator mode
// No RSI/MACD needed — just signals when ready to open next trade
import logger from './logger.js';

export class RSIStrategy {
  constructor(config) {
    this.minTicks   = parseInt(config.MIN_TICKS_REQUIRED) || 20;
    this.prices     = [];
    this.lastRSI    = null;
    this.lastMACD   = null;
    this.lastSignal = 'HOLD';
    this.ready      = false;
  }

  onTick(price) {
    this.prices.push(price);
    if (this.prices.length > 100) this.prices.shift();

    if (this.prices.length < this.minTicks) {
      logger.info(`Collecting ticks... ${this.prices.length}/${this.minTicks}`);
      return 'HOLD';
    }

    if (!this.ready) {
      this.ready = true;
      logger.success(`✅ Ready — Accumulator mode active`);
    }

    logger.info(`Price: ${price.toFixed(5)} | ACCUMULATOR MODE`);

    // Signal once then hold until trade completes
    if (this.lastSignal === 'HOLD' && this.ready) {
      this.lastSignal = 'BUY';
      return 'BUY';
    }

    return 'HOLD';
  }

  // Called by index.js after each trade closes — resets for next trade
  reset() {
    this.lastSignal = 'HOLD';
  }
}