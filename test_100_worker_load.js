'use strict';
/**
 * 100-WORKER CONCURRENCY LOAD TEST & TERMUX BENCHMARK
 */
const { fork } = require('node:child_process');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

async function runLoadTest() {
  const TOTAL_WORKERS = 100;
  console.log(`[STRESS] Spawning ${TOTAL_WORKERS} concurrent workers (${TOTAL_WORKERS * 10} total writes)...`);
  const start = performance.now();

  const workers = [];
  for (let i = 0; i < TOTAL_WORKERS; i++) {
    const child = fork(path.join(process.cwd(), 'worker_load_task.js'), [String(i)]);
    workers.push(new Promise((resolve, reject) => {
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)));
    }));
  }

  await Promise.all(workers);
  const elapsed = performance.now() - start;
  console.log(`[SUCCESS] 100 workers completed in ${elapsed.toFixed(2)}ms (~${(elapsed / (TOTAL_WORKERS * 10)).toFixed(2)}ms per write).`);
  process.exit(0);
}

runLoadTest().catch(err => {
  console.error('[ERROR] 100-worker load test failed:', err);
  process.exit(2);
});
