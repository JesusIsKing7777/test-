'use strict';
/**
 * SCRIPT ALPHA v9.2 / DATAVERSE v5.5 - ROBUST DEPLOYMENT VERIFICATION CHECKLIST
 */
const fs = require('node:fs');
const path = require('node:path');
const AlphaTelemetry = require('./alpha_telemetry_v9_2.js');
const masterEngine = require('./alpha_v8_3_master.js');

async function runChecklist() {
  console.log('[CHECKLIST] Starting Script Alpha v9.2 Deployment Verification...\n');
  let passedChecks = 0;
  let totalChecks = 4;

  // Check 1: Master Storage Engine & Monotonic TTL Lock
  try {
    const diag = await masterEngine.getDiagnostics();
    if (diag && diag.ok && diag.status === 'PASS') {
      console.log(`[PASS] Check 1/4: Master Storage Engine Operational (${diag.engine})`);
      passedChecks++;
    } else {
      console.error('[FAIL] Check 1/4: Master Storage Engine failed diagnostics:', diag);
    }
  } catch (err) {
    console.error('[FAIL] Check 1/4 exception:', err.message);
  }

  // Check 2: Bipartite Telemetry & ACU Routing
  try {
    const telemetry = new AlphaTelemetry({
      storagePath: process.cwd(),
      adapters: {
        getDiagnostics: async () => await masterEngine.getDiagnostics(),
        verifyAuditChain: async () => await masterEngine.verifyAuditChain(),
        verifyPersistence: async () => await masterEngine.verifyPersistence(),
        verifyExternalAnchor: async () => await masterEngine.verifyExternalAnchor()
      }
    });
    const report = await telemetry.runDiagnostics();
    if (report && (report.health === 'HEALTHY' || report.health === 'DEGRADED')) {
      console.log(`[PASS] Check 2/4: Bipartite Telemetry Initialized (Health: ${report.health}, Readiness: ${report.readiness})`);
      console.log(`       -> Verified Core ACUs: ${report.verifiedCore.count} | Quarantine Claims: ${report.quarantineDrawer.count}`);
      passedChecks++;
    } else {
      console.error(`[FAIL] Check 2/4: Telemetry health critical or invalid report:`, report);
    }
  } catch (err) {
    console.error('[FAIL] Check 2/4 exception:', err.message);
  }

  // Check 3: Cryptographic Audit Chain & Mutation Append
  try {
    await masterEngine.appendMutation({ testChecklist: true, timestamp: Date.now() });
    const auditRes = await masterEngine.verifyAuditChain();
    if (auditRes && auditRes.ok && auditRes.status === 'PASS') {
      console.log(`[PASS] Check 3/4: Cryptographic Audit Chain & Mutation Append Verified.`);
      passedChecks++;
    } else {
      console.error('[FAIL] Check 3/4: Audit chain verification failed:', auditRes);
    }
  } catch (err) {
    console.error('[FAIL] Check 3/4 exception:', err.message);
  }

  // Check 4: Prometheus Metrics Exporter Endpoint
  try {
    const AlphaPrometheusExporter = require('./alpha_prometheus_exporter.js');
    const exporter = new AlphaPrometheusExporter({ port: 9101 });
    const metricsOutput = exporter.collectMetrics();
    if (metricsOutput && metricsOutput.includes('alpha_engine_uptime_seconds') && metricsOutput.includes('alpha_wal_bytes')) {
      console.log('[PASS] Check 4/4: Prometheus Metrics Exposition Format Verified.');
      passedChecks++;
    } else {
      console.error('[FAIL] Check 4/4: Prometheus metrics output malformed.');
    }
  } catch (err) {
    console.error('[FAIL] Check 4/4 exception:', err.message);
  }

  console.log(`\n[SUMMARY] Verification Complete: ${passedChecks}/${totalChecks} checks passed.`);
  if (passedChecks === totalChecks) {
    console.log('[SUCCESS] Script Alpha v9.2 deployment spine is fully verified and operational.');
    process.exit(0);
  } else {
    console.error('[CRITICAL] Deployment verification failed one or more checks.');
    process.exit(2);
  }
}

runChecklist();
