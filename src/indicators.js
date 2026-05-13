// src/indicators.js
// Technical indicators — RSI + MACD

export function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;

  const deltas = [];
  for (let i = 1; i < prices.length; i++) {
    deltas.push(prices[i] - prices[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    const d = deltas[i];
    if (d > 0) avgGain += d;
    else avgLoss += Math.abs(d);
  }

  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < deltas.length; i++) {
    const d = deltas[i];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function calculateEMA(prices, period) {
  if (prices.length < period) return null;

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}

export function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
  if (prices.length < slow + signal) return null;

  const macdLine = [];

  for (let i = slow - 1; i < prices.length; i++) {
    const slice = prices.slice(0, i + 1);
    const fastEMA = calculateEMA(slice, fast);
    const slowEMA = calculateEMA(slice, slow);
    if (fastEMA !== null && slowEMA !== null) {
      macdLine.push(fastEMA - slowEMA);
    }
  }

  if (macdLine.length < signal) return null;

  const k = 2 / (signal + 1);
  let signalLine = macdLine.slice(0, signal).reduce((s, v) => s + v, 0) / signal;
  for (let i = signal; i < macdLine.length; i++) {
    signalLine = macdLine[i] * k + signalLine * (1 - k);
  }

  const currentMACD = macdLine[macdLine.length - 1];
  const prevMACD    = macdLine[macdLine.length - 2];
  const histogram   = currentMACD - signalLine;
  const prevHistogram = prevMACD - signalLine;

  let crossover = null;
  if (prevHistogram <= 0 && histogram > 0) crossover = 'bullish';
  if (prevHistogram >= 0 && histogram < 0) crossover = 'bearish';

  return { macdLine: currentMACD, signalLine, histogram, crossover };
}

export function getRSISignal(rsi, oversold = 30, overbought = 70) {
  if (rsi === null) return 'HOLD';
  if (rsi <= oversold)  return 'BUY';
  if (rsi >= overbought) return 'SELL';
  return 'HOLD';
}