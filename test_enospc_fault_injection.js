'use strict';
/**
 * FAULT-INJECTION SCRIPT: DISK FULL (ENOSPC) SIMULATION DURING WAL APPENDS
 */
const fs = require('node:fs');
const path = require('node:path');
const { AlphaMasterEngine } = require('./alpha_v8_3_master.js');

async function runEnospcFaultTest() {
  console.log('[FAULTEST] Initializing ENOSPC disk full simulation...');
  
  const testStorage = path.join(process.cwd(), 'enospc_test_dir');
  fs.mkdirSync(testStorage, { recursive: true });

  const engine = new AlphaMasterEngine({ storagePath: testStorage });

  // Monkey-patch fs.appendFileSync to simulate ENOSPC error
  const originalAppend = fs.appendFileSync;
  fs.appendFileSync = function(filePath, data, options) {
    const err = new Error('No space left on device');
    err.code = 'ENOSPC';
    throw err;
  };

  try {
    await engine.appendMutation({ test: 'enospc_payload' });
    // Restore fs
    fs.appendFileSync = originalAppend;
    console.error('[ERROR] Engine did not throw ENOSPC error during constrained write.');
    process.exit(2);
  } catch (err) {
    fs.appendFileSync = originalAppend;
    try { fs.rmSync(testStorage, { recursive: true, force: true }); } catch(e) {}
    
    if (err.code === 'ENOSPC' || err.message.includes('No space left on device')) {
      console.log(`[PASS] ENOSPC fault successfully caught and handled: ${err.message}`);
      process.exit(0);
    } else {
      console.error(`[ERROR] Caught unexpected error type: ${err.message}`);
      process.exit(2);
    }
  }
}

runEnospcFaultTest().catch(err => {
  console.error('[ERROR] ENOSPC test crashed:', err);
  process.exit(2);
});
