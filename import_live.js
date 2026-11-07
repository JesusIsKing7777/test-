'use strict';
const AlphaTelemetry = require('./alpha_telemetry_v9_2.js');

async function runLiveTest() {
  const telemetry = new AlphaTelemetry({ storagePath: process.cwd() });
  const report = await telemetry.runDiagnostics();
  process.stdout.write(JSON.stringify({ health: report.health, readiness: report.readiness, verified: report.verifiedCore.count }, null, 2) + '\n');
}

runLiveTest().catch(console.error);
