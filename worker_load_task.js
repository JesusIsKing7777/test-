'use strict';
const masterEngine = require('./alpha_v8_3_master.js');
async function run() {
  const workerId = process.argv[2] || process.pid;
  for (let i = 0; i < 10; i++) {
    await masterEngine.appendMutation({ worker: workerId, seq: i, time: Date.now() });
  }
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
