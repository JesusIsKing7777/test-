'use strict';
const masterEngine = require('./alpha_v8_3_master.js');

async function run() {
  const workerId = process.argv[2] || process.pid;
  for (let i = 0; i < 20; i++) {
    await masterEngine.appendMutation({ worker: workerId, iteration: i, timestamp: Date.now() });
  }
  process.exit(0);
}

run().catch(err => {
  console.error(`Worker failed: ${err.message}`);
  process.exit(1);
});
