'use strict';
/**
 * TEST SCRIPT: CUSTOM ALPHA_STORAGE_PATH ENVIRONMENT VARIABLE OVERRIDES
 */
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const { AlphaMasterEngine } = require('./alpha_v8_3_master.js');

async function runStorageTests() {
  console.log('[TEST] Starting storage path resolution override tests...');

  // 1. Test default CWD storage resolution
  delete process.env.ALPHA_STORAGE_PATH;
  const defaultEngine = new AlphaMasterEngine();
  const expectedDefault = path.resolve(process.cwd());
  assert.strictEqual(defaultEngine.storagePath, expectedDefault);
  console.log(`[PASS] Default storage path correctly resolved to: ${defaultEngine.storagePath}`);

  // 2. Test custom environment variable override
  const customOverride = path.join(process.cwd(), 'custom_test_storage_dir');
  process.env.ALPHA_STORAGE_PATH = customOverride;
  const customEngine = new AlphaMasterEngine();
  assert.strictEqual(customEngine.storagePath, path.resolve(customOverride));
  console.log(`[PASS] Custom ALPHA_STORAGE_PATH override correctly resolved to: ${customEngine.storagePath}`);

  // 3. Verify directory creation and persistence probe
  const persistRes = await customEngine.verifyPersistence();
  assert.strictEqual(persistRes.status, 'PASS');
  console.log('[PASS] Persistence check passed on custom storage path.');

  // Cleanup custom test directory
  fs.rmSync(customOverride, { recursive: true, force: true });
  console.log('[SUCCESS] All storage resolution override tests passed successfully.');
  process.exit(0);
}

runStorageTests().catch(err => {
  console.error('[ERROR] Storage override test failed:', err);
  process.exit(2);
});
