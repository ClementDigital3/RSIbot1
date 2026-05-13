// src/server.js
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createDashboardServer(port = process.env.PORT || 3000) {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  // Cache latest state so new browser connections get it immediately
  let cachedState = null;
  let cachedBalance = null;

  app.get('/', (req, res) => {
    res.sendFile(join(__dirname, '../public/dashboard.html'));
  });

  wss.on('connection', (ws) => {
    console.log('[Dashboard] Browser connected');

    // Send cached state immediately to new connections
    if (cachedState) {
      ws.send(JSON.stringify({ event: 'connected', data: cachedState, timestamp: Date.now() }));
    }
    if (cachedBalance) {
      ws.send(JSON.stringify({ event: 'balance', data: cachedBalance, timestamp: Date.now() }));
    }

    ws.on('close', () => console.log('[Dashboard] Browser disconnected'));
  });

  function broadcast(event, data) {
    // Cache key events for late-joining browsers
    if (event === 'connected') cachedState = data;
    if (event === 'balance')   cachedBalance = data;

    const message = JSON.stringify({ event, data, timestamp: Date.now() });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(message);
    });
  }

  httpServer.listen(port, () => {
    console.log(`\n🌐  Dashboard running at: http://localhost:${port}\n`);
  });

  return { broadcast };
}