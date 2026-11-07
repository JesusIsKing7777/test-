'use strict';
const AlphaTelemetry = require('./alpha_telemetry_v9_2.js');
const masterEngine = require('./alpha_v8_3_master.js');

async function run() {
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
    quarantineCount: report.quarantineDrawer.count
  }, null, 2) + '\n');
}

run().catch(console.error);
