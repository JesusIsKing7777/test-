'use strict';
/**
 * TELEGRAM & DISCORD WEBHOOK FORWARDER EXTENSION
 * Extends webhook_receiver.js to relay Prometheus Alertmanager notifications
 * to Telegram and Discord chat channels via native HTTPS requests.
 */
const express = require('express');
const https = require('node:https');
const app = express();
const PORT = process.env.PORT || 8080;

// Environment credentials (optional fallback to test mode)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

app.use(express.json());

function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[FORWARDER] Telegram credentials not configured. Skipping dispatch.');
    return;
  }
  const data = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' });
  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  };
  const req = https.request(options, res => {
    res.on('data', () => {});
    res.on('end', () => console.log('[FORWARDER] Telegram notification dispatched successfully.'));
  });
  req.on('error', err => console.error('[FORWARDER] Telegram error:', err.message));
  req.write(data);
  req.end();
}

function sendDiscordMessage(content) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('[FORWARDER] Discord webhook URL not configured. Skipping dispatch.');
    return;
  }
  const url = new URL(DISCORD_WEBHOOK_URL);
  const data = JSON.stringify({ content });
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  };
  const req = https.request(options, res => {
    res.on('data', () => {});
    res.on('end', () => console.log('[FORWARDER] Discord notification dispatched successfully.'));
  });
  req.on('error', err => console.error('[FORWARDER] Discord error:', err.message));
  req.write(data);
  req.end();
}

app.post('/api/v1/alerts', (req, res) => {
  const alertPayload = req.body;
  const alerts = alertPayload.alerts || [];

  for (const alert of alerts) {
    const status = alert.status.toUpperCase();
    const labels = alert.labels || {};
    const annotations = alert.annotations || {};
    const emoji = status === 'FIRING' ? '🚨' : '✅';

    const message = `${emoji} *ALPHA ENGINE ALERT: ${status}*\n` +
                    `• *Alert:* ${labels.alertname || 'Unknown'}\n` +
                    `• *Severity:* ${labels.severity || 'none'}\n` +
                    `• *Summary:* ${annotations.summary || 'No summary'}\n` +
                    `• *Description:* ${annotations.description || 'No description'}`;

    console.log(`[FORWARDER] Relaying alert: ${labels.alertname} (${status})`);
    sendTelegramMessage(message);
    sendDiscordMessage(message);
  }

  res.status(200).json({ status: 'success', forwardedAlerts: alerts.length });
});

app.listen(PORT, () => {
  console.log(`[FORWARDER] Webhook forwarder active at http://localhost:${PORT}/api/v1/alerts`);
});
