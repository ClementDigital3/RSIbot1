// src/riskManager.js
// Capital protection and trade gating logic

import logger from './logger.js';

export class RiskManager {
  constructor(config) {
    this.stopLossBalance = parseFloat(config.STOP_LOSS_BALANCE) || 50;
    this.maxActiveTrades = parseInt(config.MAX_ACTIVE_TRADES) || 1;
    this.stake = parseFloat(config.STAKE) || 1;

    this.activeTrades = 0;
    this.totalWins = 0;
    this.totalLosses = 0;
    this.totalPnL = 0;
    this.sessionStartBalance = null;
    this.halted = false;
  }

  setStartBalance(balance) {
    if (!this.sessionStartBalance) {
      this.sessionStartBalance = balance;
      logger.info(`Session start balance: $${balance}`);
    }
  }

  /**
   * Check if a trade is allowed given current conditions
   * @param {number} currentBalance
   * @returns {{ allowed: boolean, reason: string }}
   */
  canTrade(currentBalance) {
    if (this.halted) {
      return { allowed: false, reason: 'Bot halted by risk manager' };
    }

    if (currentBalance <= this.stopLossBalance) {
      this.halted = true;
      logger.warn(`🛑 STOP LOSS HIT — Balance $${currentBalance} ≤ floor $${this.stopLossBalance}. Bot halted.`);
      return { allowed: false, reason: 'Balance below stop-loss floor' };
    }

    if (this.activeTrades >= this.maxActiveTrades) {
      return { allowed: false, reason: `Max active trades (${this.maxActiveTrades}) reached` };
    }

    return { allowed: true, reason: 'OK' };
  }

  onTradeOpened() {
    this.activeTrades++;
  }

  onTradeClosed(profit) {
    this.activeTrades = Math.max(0, this.activeTrades - 1);
    this.totalPnL += profit;

    if (profit > 0) {
      this.totalWins++;
      logger.success(`+$${profit.toFixed(2)} profit  |  W:${this.totalWins} L:${this.totalLosses}  |  Net P&L: $${this.totalPnL.toFixed(2)}`);
    } else {
      this.totalLosses++;
      logger.loss(`-$${Math.abs(profit).toFixed(2)} loss  |  W:${this.totalWins} L:${this.totalLosses}  |  Net P&L: $${this.totalPnL.toFixed(2)}`);
    }
  }

  getWinRate() {
    const total = this.totalWins + this.totalLosses;
    if (total === 0) return 0;
    return ((this.totalWins / total) * 100).toFixed(1);
  }

  getSummary() {
    return {
      wins: this.totalWins,
      losses: this.totalLosses,
      winRate: `${this.getWinRate()}%`,
      netPnL: `$${this.totalPnL.toFixed(2)}`,
      activeTrades: this.activeTrades,
    };
  }
}
