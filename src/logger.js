// src/logger.js
// Colored, timestamped terminal logger

import chalk from 'chalk';

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

const logger = {
  info: (msg) => console.log(`${timestamp()} ${chalk.cyan('INFO')}  ${msg}`),
  loss: (msg) => console.log(`\n${timestamp()} ${chalk.bgRed.white(' LOSS ')}  ${msg}\n`),
  success: (msg) => console.log(`\n${timestamp()} ${chalk.bgGreen.black(' WIN  ')}  ${msg}\n`),
  trade: (msg) => console.log(`${timestamp()} ${chalk.yellow('TRADE')} ${msg}`),
  warn: (msg) => console.log(`${timestamp()} ${chalk.magenta('WARN')}  ${msg}`),
  error: (msg) => console.log(`${timestamp()} ${chalk.red('ERR ')}  ${msg}`),
  signal: (msg) => console.log(`${timestamp()} ${chalk.blueBright('SIG  ')} ${msg}`),
  balance: (amount, currency = 'USD') =>
    console.log(`${timestamp()} ${chalk.white('BAL  ')} ${chalk.bold.green(`$${Number(amount).toFixed(2)} ${currency}`)}`),

  divider: () => console.log(chalk.gray('─'.repeat(60))),

  banner: () => {
    console.log(chalk.bold.green(`
╔══════════════════════════════════════════════════════════╗
║            DERIV RSI BOT  —  by Claudius                 ║
║         Synthetic Indices  |  Node.js + WebSocket        ║
╚══════════════════════════════════════════════════════════╝
    `));
  },

  rsi: (value) => {
    const color =
      value <= 30 ? chalk.green.bold :
      value >= 70 ? chalk.red.bold :
      chalk.white;
    return color(`RSI(${value.toFixed(2)})`);
  }
};

export default logger;
