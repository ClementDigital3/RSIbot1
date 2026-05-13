// src/trader.js
// Handles opening and tracking Deriv contracts

import logger from './logger.js';

export class Trader {
  constructor(connection, config) {
    this.conn = connection;
    this.symbol = config.SYMBOL || 'R_75';
    this.stake = parseFloat(config.STAKE) || 1;
    this.duration = parseInt(config.CONTRACT_DURATION) || 1;
    this.durationUnit = 'm'; // minutes
  }

  /**
   * Buy a contract
   * @param {'BUY'|'SELL'} signal - BUY = CALL (price goes up), SELL = PUT (price goes down)
   * @returns {Promise<object>} contract details
   */
  async openTrade(signal) {
    const contractType = signal === 'BUY' ? 'CALL' : 'PUT';
    const directionLabel = signal === 'BUY' ? '📈 CALL' : '📉 PUT ';

    logger.trade(`Opening ${directionLabel} | $${this.stake} | ${this.duration}${this.durationUnit} | ${this.symbol}`);

    // Step 1: Get a price proposal first
    const proposal = await this.conn.send({
      proposal: 1,
      amount: this.stake,
      basis: 'stake',
      contract_type: contractType,
      currency: 'USD',
      duration: this.duration,
      duration_unit: this.durationUnit,
      underlying_symbol: this.symbol,
    });

    if (proposal.error) {
      logger.error(`Proposal failed: ${proposal.error.message}`);
      return null;
    }

    const proposalId = proposal.proposal.id;
    const potentialPayout = proposal.proposal.payout;

    logger.trade(`Proposal ID: ${proposalId} | Potential payout: $${potentialPayout}`);

    // Step 2: Buy the contract
    const buyRes = await this.conn.send({
      buy: proposalId,
      price: this.stake,
    });

    if (buyRes.error) {
      logger.error(`Buy failed: ${buyRes.error.message}`);
      return null;
    }

    const contract = buyRes.buy;
    logger.trade(`Contract opened ✓ | ID: ${contract.contract_id} | Entry: ${contract.start_time}`);

    return {
      contractId: contract.contract_id,
      contractType,
      stake: this.stake,
      potentialPayout,
      openTime: Date.now(),
    };
  }

  /**
   * Subscribe to contract updates and resolve when it settles
   * @param {string} contractId
   * @returns {Promise<{ profit: number, status: string }>}
   */
  watchContract(contractId) {
    return new Promise((resolve) => {
      // Subscribe to contract-level updates
      this.conn.send({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1,
      });

      // Listen for updates on this contract
      const handler = (data) => {
        const poc = data.proposal_open_contract;
        if (!poc || poc.contract_id !== contractId) return;

        // Contract is still open
        if (poc.status === 'open') return;

        // Contract settled
        const profit = poc.profit || 0;
        const status = poc.status; // 'won' or 'lost'

        logger.trade(
          `Contract ${contractId} settled: ${status.toUpperCase()} | P&L: ${profit >= 0 ? '+' : ''}$${Number(profit).toFixed(2)}`
        );

        resolve({ profit: Number(profit), status });
      };

      this.conn.on('proposal_open_contract', handler);
    });
  }

  /**
   * Open a trade and await its result (full cycle)
   */
  async executeTrade(signal) {
    const trade = await this.openTrade(signal);
    if (!trade) return null;

    const result = await this.watchContract(trade.contractId);
    return { ...trade, ...result };
  }
}
