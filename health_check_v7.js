'use strict';
/**
 * AUTOMATED HEALTH-CHECK HEARTBEAT MONITOR SCRIPT
 * Periodically polls master engine diagnostics and schema validation.
 */
const http = require('node:http');

class HeartbeatMonitor {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 60000; // Default: every 60 seconds
    this.targetUrl = options.targetUrl || 'http://localhost:8080/health';
    this.timer = null;
  }

  start() {
    console.log(`[MONITOR] Heartbeat monitor started. Polling ${this.targetUrl} every ${this.intervalMs / 1000}s...`);
    this.timer = setInterval(() => this.checkHealth(), this.intervalMs);
  }

  checkHealth() {
    const timestamp = new Date().toISOString();
    http.get(this.targetUrl, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`[HEARTBEAT OK] at ${timestamp} - Response: ${data.trim()}`);
        } else {
          console.warn(`[HEARTBEAT WARN] at ${timestamp} - Status Code: ${res.statusCode}`);
        }
      });
    }).on('err', err => {
      console.error(`[HEARTBEAT ERROR] at ${timestamp} - Connection failed: ${err.message}`);
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    console.log('[MONITOR] Heartbeat monitor stopped.');
  }
}

if (require.main === module) {
  const monitor = new HeartbeatMonitor();
  monitor.start();
}

module.exports = HeartbeatMonitor;
