'use strict';
/**
 * 500-WORKER CONCURRENCY LOAD TEST & TERMux IOPS BENCHMARK
 */
const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

async function runLoadTest() {
  const TOTAL_WORKERS = 500;
  const expectedTotalWrites = TOTAL_WORKERS * 10;
  console.log(`[STRESS] Spawning ${TOTAL_WORKERS} concurrent workers (${expectedTotalWrites} total writes)...`);
  const start = performance.now();

  const workers = [];
  for (let i = 0; i < TOTAL_WORKERS; i++) {
    const child = fork(path.join(process.cwd(), 'worker_500_task.js'), [String(i)]);
    workers.push(new Promise((resolve, reject) => {
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)));
    }));
  }

  await Promise.all(workers);
  const elapsed = performance.now() - start;
  const iops = (expectedTotalWrites / (elapsed / 1000)).toFixed(2);

  console.log(`[SUCCESS] ${TOTAL_WORKERS} workers completed ${expectedTotalWrites} writes in ${elapsed.toFixed(2)}ms.`);
  console.log(`[BENCHMARK] Throughput: ~${iops} IOPS | Average Latency: ${(elapsed / expectedTotalWrites).toFixed(2)}ms per write.`);

  console.log('[VERIFY] Running automated audit-chain sequence & gap verification...');
  const auditFile = path.join(process.cwd(), 'dataverse_audit.jsonl');
  const lines = fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean);
  
  if (lines.length !== expectedTotalWrites) {
    console.error(`[FAIL] Record count mismatch! Expected ${expectedTotalWrites}, found ${lines.length}.`);
    process.exit(3);
  }

  const hmacKey = process.env.ALPHA_TELEMETRY_HMAC_KEY || 'default-test-entropy-key-32-bytes-minimum!!';
  let prevMac = '0'.repeat(64);
  let expectedSeq = 1;

  for (const line of lines) {
    const record = JSON.parse(line);
    if (record.sequence !== expectedSeq) {
      console.error(`[FAIL] Sequence gap detected! Expected ${expectedSeq}, got ${record.sequence}`);
      process.exit(4);
    }
    if (record.prevMac !== prevMac) {
      console.error(`[FAIL] Chain broken at sequence ${expectedSeq}`);
      process.exit(5);
    }
    const expectedMac = crypto.createHmac('sha256', hmacKey).update(record.payload + record.prevMac).digest('hex');
    if (record.mac !== expectedMac) {
      console.error(`[FAIL] MAC mismatch at sequence ${expectedSeq}`);
      process.exit(6);
    }
    prevMac = record.mac;
    expectedSeq++;
  }

  console.log(`[SUCCESS] Audit chain verification passed: Exactly ${lines.length} records verified with 0 sequence gaps.`);
  process.exit(0);
}

runLoadTest().catch(err => {
  console.error('[ERROR] Load test failed:', err);
  process.exit(2);
});
