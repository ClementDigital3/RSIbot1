// src/connection.js
import WebSocket from 'ws';
import logger from './logger.js';

const API_BASE = 'https://api.derivws.com';

export class DerivConnection {
  constructor(patToken, appId) {
    this.patToken = patToken;
    this.appId = appId;
    this.ws = null;
    this.wsUrl = null;
    this.accountId = null;
    this.accountBalance = null;
    this.accountCurrency = 'USD';
    this.messageHandlers = new Map();
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnects = 10;
    this.hasConnectedBefore = false;
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this.patToken}`,
      'Deriv-App-ID': this.appId,
      'Content-Type': 'application/json',
    };
  }

  async fetchAccounts() {
    logger.info('Fetching accounts from Deriv REST API...');
    const res = await fetch(`${API_BASE}/trading/v1/options/accounts`, {
      method: 'GET',
      headers: this._headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to fetch accounts: ${res.status} — ${JSON.stringify(err)}`);
    }
    const data = await res.json();
    const accounts = data.data || data;
    logger.info(`Found ${accounts.length} account(s):`);
    accounts.forEach((acc) => {
      logger.info(`  ${acc.account_id} | ${acc.account_type} | Balance: ${acc.balance} ${acc.currency}`);
    });
    return accounts;
  }

  async getAuthenticatedWsUrl(accountId) {
    logger.info(`Getting authenticated WebSocket URL for account: ${accountId}`);
    const res = await fetch(
      `${API_BASE}/trading/v1/options/accounts/${accountId}/otp`,
      { method: 'POST', headers: this._headers() }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to get OTP: ${res.status} — ${JSON.stringify(err)}`);
    }
    const data = await res.json();
    const wsUrl = data.data?.url || data.url;
    if (!wsUrl) throw new Error('No WebSocket URL in OTP response');
    logger.success(`Authenticated WebSocket URL obtained`);
    return wsUrl;
  }

  async connect(accountId = null) {
    const accounts = await this.fetchAccounts();
    if (accountId) {
      this.accountId = accountId;
      const acc = accounts.find(a => a.account_id === accountId);
      if (acc) {
        this.accountBalance = acc.balance;
        this.accountCurrency = acc.currency;
      }
    } else {
      const demo = accounts.find((a) => a.account_id?.startsWith('VRTC'));
      const selected = demo || accounts[0];
      if (!selected) throw new Error('No accounts found');
      this.accountId = selected.account_id;
      this.accountBalance = selected.balance;
      this.accountCurrency = selected.currency;
      logger.info(`Auto-selected account: ${this.accountId}`);
      logger.warn(`Tip: Add to .env → DERIV_ACCOUNT_ID=${this.accountId}`);
    }
    this.wsUrl = await this.getAuthenticatedWsUrl(this.accountId);
    return this._connectWebSocket();
  }

  _connectWebSocket() {
    return new Promise((resolve, reject) => {
      logger.info('Connecting to authenticated WebSocket...');
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.reconnectAttempts = 0;
        logger.success(`WebSocket connected | Account: ${this.accountId} | Balance: $${this.accountBalance} ${this.accountCurrency}`);

        if (this.hasConnectedBefore) {
          // Fire reconnected event so index.js can resubscribe
          this._emit('reconnected');
        } else {
          this.hasConnectedBefore = true;
          resolve({
            accountId: this.accountId,
            balance: this.accountBalance,
            currency: this.accountCurrency,
          });
        }
      });

      this.ws.on('message', (raw) => {
        try {
          const data = JSON.parse(raw.toString());
          this._routeMessage(data);
        } catch (e) {
          logger.error(`Failed to parse message: ${e.message}`);
        }
      });

      this.ws.on('close', () => {
        logger.warn('WebSocket disconnected.');
        this._reconnect();
      });

      this.ws.on('error', (err) => {
        logger.error(`WebSocket error: ${err.message}`);
        if (!this.hasConnectedBefore) reject(err);
      });
    });
  }

  _emit(eventType) {
    if (this.listeners.has(eventType)) {
      for (const cb of this.listeners.get(eventType)) cb();
    }
  }

  _routeMessage(data) {
    if (data.req_id && this.messageHandlers.has(data.req_id)) {
      const { resolve } = this.messageHandlers.get(data.req_id);
      this.messageHandlers.delete(data.req_id);
      resolve(data);
      return;
    }
    const type = data.msg_type;
    if (type && this.listeners.has(type)) {
      for (const cb of this.listeners.get(type)) cb(data);
    }
  }

  send(payload) {
    return new Promise((resolve, reject) => {
      const reqId = Date.now() + Math.floor(Math.random() * 1000);
      payload.req_id = reqId;
      const timeout = setTimeout(() => {
        this.messageHandlers.delete(reqId);
        reject(new Error(`Request timed out: ${JSON.stringify(payload)}`));
      }, 15000);
      this.messageHandlers.set(reqId, {
        resolve: (data) => { clearTimeout(timeout); resolve(data); },
        reject,
      });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) this.listeners.set(eventType, []);
    this.listeners.get(eventType).push(callback);
  }

  getBalance() { return this.send({ balance: 1, subscribe: 1 }); }
  subscribeToTicks(symbol) { return this.send({ ticks: symbol, subscribe: 1 }); }

  async _reconnect() {
    if (this.reconnectAttempts >= this.maxReconnects) {
      logger.error('Max reconnect attempts reached. Shutting down.');
      process.exit(1);
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts++;
    logger.warn(`Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`);
    await new Promise((r) => setTimeout(r, delay));
    try {
      this.wsUrl = await this.getAuthenticatedWsUrl(this.accountId);
      await this._connectWebSocket();
    } catch (err) {
      logger.error(`Reconnect failed: ${err.message}`);
      this._reconnect();
    }
  }

  close() { if (this.ws) this.ws.close(); }
}