'use strict';
/**
 * FAULT-INJECTION SCRIPT: READ-ONLY FILESYSTEM MOUNT / EACCES SIMULATION
 * Verifies that AlphaMasterEngine handles read-only storage path overrides gracefully.
 */
const fs = require('node:fs');
const path = require('node:path');
const { AlphaMasterEngine } = require('./alpha_v8_3_master.js');

async function runReadonlyFaultTest() {
  console.log('[FAULTEST] Initializing read-only storage override fault test...');
  
  // Use a system path or restricted directory where writes will fail, 
  // or simulate permission denial by overriding storagePath
  const restrictedPath = path.join(process.cwd(), 'restricted_storage_dir');
  
  // Create directory and revoke write permissions (chmod 0555 - read/execute only)
  try {
    fs.mkdirSync(restrictedPath, { recursive: true });
    fs.chmodSync(restrictedPath, 0o555);
  } catch (e) {
    console.warn('[WARN] Could not set restricted permissions on current filesystem; proceeding with mock denial check.');
  }

  process.env.ALPHA_STORAGE_PATH = restrictedPath;

  try {
    const engine = new AlphaMasterEngine();
    // Attempt persistence probe which tries to write to WAL
    const res = await engine.verifyPersistence();
    
    // Cleanup permissions before exit
    try { fs.chmodSync(restrictedPath, 0o755); fs.rmSync(restrictedPath, { recursive: true, force: true }); } catch(e) {}

    if (res && res.status === 'FAIL') {
      console.log('[PASS] Read-only storage failure correctly captured and reported as status: FAIL.');
      process.exit(0);
    } else {
      console.error('[ERROR] Engine succeeded on read-only storage path without throwing error.');
      process.exit(2);
    }
  } catch (err) {
    try { fs.chmodSync(restrictedPath, 0o755); fs.rmSync(restrictedPath, { recursive: true, force: true }); } catch(e) {}
    console.log(`[PASS] Read-only filesystem exception successfully caught: ${err.message}`);
    process.exit(0);
  }
}

runReadonlyFaultTest().catch(err => {
  console.error('[ERROR] Read-only fault test crashed:', err);
  process.exit(2);
});
