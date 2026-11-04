'use strict';

const http = require('http');
const { DataverseCoreEngine } = require('./dataverse_v5_core');
const { LWWMap } = require('./lww_map');

const engine = new DataverseCoreEngine('dashboard_node');
const map = new LWWMap('dashboard_node');

map.set('system_status', { active: true, layout: 'Pure MX', engine: 'Script Alpha & Dataverse v5.1' });
map.set('uptime', process.uptime());

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  const payload = {
    timestamp: new Date().toISOString(),
    nodeId: engine.nodeId,
    clock: engine.clock.toJSON(),
    state: map.toJSON(),
    status: 'SECURE',
    layout: 'Pure MX'
  };
  res.end(JSON.stringify(payload, null, 2));
});

const PORT = 8080;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Pure MX Dashboard] Active on http://127.0.0.1:${PORT}`);
});
