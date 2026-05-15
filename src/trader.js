// src/trader.js — Accumulator Strategy
import logger from './logger.js';

export class Trader {
  constructor(connection, config) {
    this.conn           = connection;
    this.symbol         = config.SYMBOL        || '1HZ75V';
    this.stake          = parseFloat(config.STAKE)            || 1;
    this.growthRate     = parseFloat(config.GROWTH_RATE)      || 0.01;
    this.takeProfitPct  = parseFloat(config.TAKE_PROFIT_PCT)  || 0.40;
    this.trailingStopPct= parseFloat(config.TRAILING_STOP_PCT)|| 0.50;
  }

  // ── Open accumulator contract ────────────────────────────
  async openAccumulator() {
    logger.trade(`Opening ACCUMULATOR | $${this.stake} | Growth: ${this.growthRate * 100}% | ${this.symbol}`);

    const proposal = await this.conn.send({
      proposal:           1,
      amount:             this.stake,
      basis:              'stake',
      contract_type:      'ACCU',
      currency:           'USD',
      growth_rate:        this.growthRate,
      underlying_symbol:  this.symbol,
    });

    if (proposal.error) {
      logger.error(`Proposal failed: ${proposal.error.message}`);
      return null;
    }

    const buyRes = await this.conn.send({
      buy:   proposal.proposal.id,
      price: this.stake,
    });

    if (buyRes.error) {
      logger.error(`Buy failed: ${buyRes.error.message}`);
      return null;
    }

    const contract = buyRes.buy;
    logger.trade(`Accumulator opened ✓ | ID: ${contract.contract_id}`);
    return contract;
  }

  // ── Sell open contract ───────────────────────────────────
  async sellContract(contractId) {
    try {
      const res = await this.conn.send({ sell: contractId, price: 0 });
      if (res.error) {
        logger.error(`Sell failed: ${res.error.message}`);
        return null;
      }
      const soldFor = parseFloat(res.sell?.sold_for || 0);
      const profit  = parseFloat((soldFor - this.stake).toFixed(2));
      logger.trade(`Sold contract ${contractId} | Received: $${soldFor} | Profit: $${profit}`);
      return { profit };
    } catch (err) {
      logger.error(`Sell error: ${err.message}`);
      return null;
    }
  }

  // ── Watch contract and manage exit ──────────────────────
  watchAndManage(contractId) {
    return new Promise((resolve) => {
      let peakProfit  = 0;
      let sold        = false;

      // Subscribe to contract updates
      this.conn.send({
        proposal_open_contract: 1,
        contract_id:            contractId,
        subscribe:              1,
      }).catch(() => {});

      const handler = async (data) => {
        const poc = data.proposal_open_contract;
        if (!poc || poc.contract_id !== contractId) return;
        if (sold) return;

        const currentProfit = parseFloat(poc.profit || 0);

        // Contract ended naturally (barrier hit = loss)
if (poc.status !== 'open') {
  sold = true;
  const finalProfit = parseFloat(poc.profit || 0);
  const finalStatus = finalProfit > 0 ? 'WON' : 'LOST';
  logger.trade(`Contract ended | Status: ${finalStatus} | P&L: $${finalProfit.toFixed(2)}`);
  resolve({ profit: finalProfit, status: finalStatus, contractId });
  return;
}

        // Update peak profit
        if (currentProfit > peakProfit) {
          peakProfit = currentProfit;
          logger.info(`Peak profit: $${peakProfit.toFixed(3)} | Current: $${currentProfit.toFixed(3)}`);
        }

        // ── Take profit ──────────────────────────────────
        const takeProfit = this.stake * this.takeProfitPct;
        if (currentProfit >= takeProfit) {
          sold = true;
          logger.success(`🎯 Take profit hit! $${currentProfit.toFixed(2)} — selling now`);
          const result = await this.sellContract(contractId);
          resolve({
            profit:     result?.profit ?? currentProfit,
            status:     'WON',
            contractId,
          });
          return;
        }

        // ── Trailing stop ─────────────────────────────────
        // If we had meaningful profit and it dropped back significantly
        const minPeakToActivate = this.stake * 0.05; // activate after 10% profit
        const trailThreshold    = peakProfit * (1 - this.trailingStopPct);
        if (peakProfit >= minPeakToActivate && currentProfit <= trailThreshold) {
          sold = true;
          logger.warn(`📉 Trailing stop hit — peak was $${peakProfit.toFixed(3)}, now $${currentProfit.toFixed(3)}`);
          const result = await this.sellContract(contractId);
          resolve({
            profit:     result?.profit ?? currentProfit,
            status:     currentProfit > 0 ? 'WON' : 'LOST',
            contractId,
          });
          return;
        }
      };

      this.conn.on('proposal_open_contract', handler);
    });
  }

  // ── Full trade cycle ──────────────────────────────────────
  async executeTrade() {
    const contract = await this.openAccumulator();
    if (!contract) return null;

    const result = await this.watchAndManage(contract.contract_id);
    return result;
  }
}