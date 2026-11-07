'use strict';
/**
 * SCRIPT ALPHA v9.2 PROMETHEUS METRICS EXPORTER
 * Exposes core telemetry and engine stats in Prometheus text exposition format.
 */
const http = require('node:http');
const AlphaTelemetry = require('./alpha_telemetry_v9_2.js');

class AlphaPrometheusExporter {
  constructor(options = {}) {
    this.port = options.port || 9101;
    this.telemetry = new AlphaTelemetry(options);
  }

  collectMetrics() {
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    
    let output = '';
    output += `# HELP alpha_engine_uptime_seconds Engine uptime in seconds.\n`;
    output += `# TYPE alpha_engine_uptime_seconds gauge\n`;
    output += `alpha_engine_uptime_seconds ${uptime}\n\n`;

    output += `# HELP alpha_process_rss_bytes Resident Set Size memory in bytes.\n`;
    output += `# TYPE alpha_process_rss_bytes gauge\n`;
    output += `alpha_process_rss_bytes ${mem.rss}\n\n`;

    output += `# HELP alpha_process_heap_used_bytes Heap memory used in bytes.\n`;
    output += `# TYPE alpha_process_heap_used_bytes gauge\n`;
    output += `alpha_process_heap_used_bytes ${mem.heapUsed}\n\n`;

    return output;
  }

  start() {
    const server = http.createServer(async (req, res) => {
      if (req.url === '/metrics') {
        const metrics = this.collectMetrics();
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
        res.end(metrics);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found. Use /metrics');
      }
    });

    server.listen(this.port, () => {
      console.log(`[EXPORTER] Prometheus metrics exporter running at http://localhost:${this.port}/metrics`);
    });
  }
}

module.exports = AlphaPrometheusExporter;

if (require.main === module) {
  const exporter = new AlphaPrometheusExporter();
  exporter.start();
}
