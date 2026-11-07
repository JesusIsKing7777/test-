'use strict';
/**
 * FAULTY TEST SCRIPT: CI PIPELINE EXIT CODE VERIFICATION
 * Triggers a deterministic failure state and exits with code 2
 * to verify that CI runners correctly capture non-zero exit codes.
 */
const { AlphaMasterEngine } = require('./alpha_v8_3_master.js');

async function simulateCiFailure() {
  console.log('[FAULTEST] Initializing simulated CI failure test...');
  
  // Initialize engine
  const engine = new AlphaMasterEngine();
  
  // Perform valid persistence check
  const persistRes = await engine.verifyPersistence();
  console.log('[FAULTEST] Persistence check result:', persistRes);

  console.log('[FAULTEST] Triggering deliberate fault condition (Exit Code 2)...');
  console.error('[CRITICAL] Simulated audit chain tampering or pipeline verification failure detected.');
  
  // Exit with code 2 to signal deliberate test failure to CI pipeline
  process.exit(2);
}

simulateCiFailure().catch(err => {
  console.error('[ERROR] Uncaught exception in fault simulation:', err);
  process.exit(2);
});
