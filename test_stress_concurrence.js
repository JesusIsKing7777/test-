'use strict';
const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const masterEngine = require('./alpha_v8_3_master.js');

async function runStressTest() {
  const TOTAL_WORKERS = 50;
  const WRITES_PER_WORKER = 20;
  console.log(`[STRESS] Spawning ${TOTAL_WORKERS} concurrent workers (${TOTAL_WORKERS * WRITES_PER_WORKER} total appends)...`);

  const workers = [];
  for (let i = 0; i < TOTAL_WORKERS; i++) {
    const workerScript = path.join(process.cwd(), `temp_worker_${i}.js`);
    fs.writeFileSync(workerScript, `
      const engine = require('./alpha_v8_3_master.js');
      async function run() {
        for (let j = 0; j < ${WRITES_PER_WORKER}; j++) {
          await engine.appendMutation({ worker: ${i}, seq: j, ts: Date.now() });
        }
        process.exit(0);
      }
      run().catch(e => { console.error(e); process.exit(1); });
    `);
    workers.push(new Promise((resolve, reject) => {
      const child = fork(workerScript);
      child.on('exit', code => {
        try { fs.unlinkSync(workerScript); } catch (e) {}
        code === 0 ? resolve() : reject(new Error(`Worker exited with code ${code}`));
      });
    }));
  }

  await Promise.all(workers);
  console.log('[SUCCESS] All concurrent workers finished successfully.');

  const manifestCheck = await masterEngine.verifyArchivedManifests();
  console.log('[VERIFY] Archived manifests verification result:', manifestCheck);

  process.exit(0);
}

runStressTest().catch(err => {
  console.error('[ERROR] Stress test failed:', err);
  process.exit(2);
});
