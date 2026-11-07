'use strict';
const AlphaTelemetry = require('./alpha_telemetry_v9_2.js');
const masterEngine = require('./alpha_v8_3_master.js');

async function runTest() {
  const telemetry = new AlphaTelemetry({
    storagePath: process.cwd(),
    adapters: {
      getDiagnostics: masterEngine.getDiagnostics,
      verifyAuditChain: masterEngine.verifyAuditChain,
      verifyPersistence: masterEngine.verifyPersistence,
      verifyExternalAnchor: masterEngine.verifyExternalAnchor
    }
  });

  const report = await telemetry.runDiagnostics();
  process.stdout.write(JSON.stringify({
    health: report.health,
    readiness: report.readiness,
    verifiedCoreCount: report.verifiedCore.count,
    quarantineCount: report.quarantineDrawer.count,
    authMode: report.authMode,
    reportHash: report.reportHash
  }, null, 2) + '\n');
}

runTest().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(2);
});
