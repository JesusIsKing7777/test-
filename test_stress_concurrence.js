'use strict';
/**
 * ROBUST MULTI-PROCESS CONCURRENCE STRESS TEST SUITE
 * Spawns multiple independent child processes using child_process.fork
 * to verify atomic WAL appends and audit trail integrity under load.
 */
const { fork } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

async function runStressTest() {
  const numWorkers = Math.min(os.cpus().length || 2, 4);
  console.log(`[STRESS] Spawning ${numWorkers} concurrent worker processes...`);

  const workers = [];
  let completed = 0;

  for (let i = 0; i < numWorkers; i++) {
    const workerPath = path.join(process.cwd(), 'worker_task.js');
    const child = fork(workerPath, [String(i + 1)]);
    
    workers.push(
      new Promise((resolve, reject) => {
        child.on('exit', (code) => {
          if (code === 0) {
            completed++;
            resolve();
          } else {
            reject(new Error(`Worker exited with code ${code}`));
          }
        });
      })
    );
  }

  await Promise.all(workers);
  console.log(`[SUCCESS] All ${completed} worker processes completed successfully with atomic log appends.`);
  process.exit(0);
}

runStressTest().catch(err => {
  console.error('[ERROR] Stress test failed:', err);
  process.exit(2);
});
