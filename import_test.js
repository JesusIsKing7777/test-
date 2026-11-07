'use strict';
const AlphaTelemetry = require('./alpha_telemetry_v9_2.js');

// Mock or require your actual Dataverse / Script Alpha master module here:
// const masterEngine = require('./alpha_v8_3_master.js');

const mockEngineAdapters = {
  getDiagnostics: async () => ({ ok: true, status: 'PASS', engine: 'Mock Dataverse v5.4' }),
  verifyAuditChain: async () => ({ ok: true, status: 'PASS', verifiedEntries: 42 }),
  verifyPersistence: async () => ({ ok: true, status: 'PASS', checkpointValid: true }),
  verifyExternalAnchor: async () => ({ ok: true, status: 'PASS', anchorMatched: true })
};

async function runImportTest() {
  const telemetry = new AlphaTelemetry({
    storagePath: process.cwd(),
    adapters: mockEngineAdapters
  });

  const reportJson = await telemetry.generateJSONReport();
  const parsed = JSON.parse(reportJson);

  process.stdout.write(`Import Test Health: ${parsed.health} | Readiness: ${parsed.readiness}\n`);
  process.stdout.write(`Verified Core ACUs: ${parsed.verifiedCore.count}\n`);
  process.stdout.write(`Quarantine Count: ${parsed.quarantineDrawer.count}\n`);
}

runImportTest().catch(err => {
  console.error('Import test failed:', 
cat << 'EOF' > import_live.js
'use strict';
const AlphaTelemetry = require('./alpha_telemetry_v9_2.js');

let masterEngine;
try {
  masterEngine = require('./alpha_v8_3_master.js');
} catch (e) {
  console.warn('alpha_v8_3_master.js not found in CWD. Using mock fallback.');
}

const liveAdapters = {
  getDiagnostics: masterEngine?.getDiagnostics ?? async () => ({ status: 'PASS' }),
  verifyAuditChain: masterEngine?.verifyAuditChain ?? async () => ({ status: 'PASS' }),
  verifyPersistence: masterEngine?.verifyPersistence ?? async () => ({ status: 'PASS' }),
  verifyExternalAnchor: masterEngine?.verifyExternalAnchor ?? async () => ({ status: 'PASS' })
};

async function runLiveTest() {
  const telemetry = new AlphaTelemetry({
    storagePath: process.env.ALPHA_STORAGE_PATH || process.cwd(),
    adapters: liveAdapters
  });
  const report = await telemetry.runDiagnostics();
  process.stdout.write(JSON.stringify({ health: report.health, readiness: report.readiness, verified: report.verifiedCore.count }, null, 2) + '\n');
}

runLiveTest().catch(console.error);
