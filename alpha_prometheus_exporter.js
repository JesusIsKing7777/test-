'use strict';
/**
 * ALPHA MASTER ENGINE PROMETHEUS METRICS EXPORTER
 * Exposes live performance stats, WAL bytes, audit sequence, and lock status in Prometheus format.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const masterEngine = require('./alpha_v8_3_master.js');

class AlphaPrometheusExporter {
  constructor(options = {}) {
    this.port = options.port || 9100;
    this.storagePath = path.resolve(options.storagePath || process.cwd());
    this.walFile = path.join(this.storagePath, 'dataverse_wal.jsonl');
    this.auditFile = path.join(this.storagePath, 'dataverse_audit.jsonl');
    this.lockDir = path.join(this.storagePath, 'dataverse.lock');
    this.startTime = Date.now();
  }

  collectMetrics() {
    let walBytes = 0;
    let auditEntries = 0;
    let lockActive = 0;

    try {
      if (fs.existsSync(this.walFile)) {
        walBytes = fs.statSync(this.walFile).size;
      }
    } catch (e) {}

    try {
      if (fs.existsSync(this.auditFile)) {
        const lines = fs.readFileSync(this.auditFile, 'utf8').split('\n').filter(Boolean);
        auditEntries = lines.length;
      }
    } catch (e) {}

    try {
      lockActive = fs.existsSync(this.lockDir) ? 1 : 0;
    } catch (e) {}

    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    const memory = process.memoryUsage();

    return [
      `# HELP alpha_engine_uptime_seconds Total uptime of the Alpha Master Engine in seconds.`,
      `# TYPE alpha_engine_uptime_seconds gauge`,
      `alpha_engine_uptime_seconds ${uptimeSeconds.toFixed(2)}`,
      ``,
      `# HELP alpha_wal_bytes Total size of the Write-Ahead Log in bytes.`,
      `# TYPE alpha_wal_bytes gauge`,
      `alpha_wal_bytes ${walBytes}`,
      ``,
      `# HELP alpha_audit_entries_total Total verified entries in the cryptographic audit trail.`,
      `# TYPE alpha_audit_entries_total counter`,
      `alpha_audit_entries_total ${auditEntries}`,
      ``,
      `# HELP alpha_lock_active Advisory lock state (1 if locked, 0 if unlocked).`,
      `# TYPE alpha_lock_active gauge`,
      `alpha_lock_active ${lockActive}`,
      ``,
      `# HELP alpha_process_resident_memory_bytes Resident Set Size (RSS) memory in bytes.`,
      `# TYPE alpha_process_resident_memory_bytes gauge`,
      `alpha_process_resident_memory_bytes ${memory.rss}`,
      ``,
      `# HELP alpha_process_heap_used_bytes Heap memory currently used in bytes.`,
      `# TYPE alpha_process_heap_used_bytes gauge`,
      `alpha_process_heap_used_bytes ${memory.heapUsed}`
    ].join('\n') + '\n';
  }

  startServer() {
    const server = http.createServer((req, res) => {
      if (req.url === '/metrics' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
        res.end(this.collectMetrics());
      } else if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'HEALTHY', engine: 'AlphaMasterEngine v8.3' }));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found. Use /metrics or /health');
      }
    });

    server.listen(this.port, () => {
      console.log(`[EXPORTER] Prometheus metrics exporter active at http://localhost:${this.port}/metrics`);
    });
  }
}

if (require.main === module) {
  const exporter = new AlphaPrometheusExporter({ port: process.env.PORT || 9100 });
  exporter.startServer();
}

module.exports = AlphaPrometheusExporter;
