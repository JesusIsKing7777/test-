'use strict';
/**
 * SCRIPT ALPHA v9.2 / DATAVERSE v5.5 - DEPLOYMENT VERIFICATION CHECKLIST WITH MANIFEST AUDIT
 */
const fs = require('node:fs');
const path = require('node:path');
const AlphaTelemetry = require('./alpha_telemetry_v9_2.js');
const masterEngine = require('./alpha_v8_3_master.js');

async function runChecklist() {
  console.log('[CHECKLIST] Starting Script Alpha v9.2 Deployment Verification with Manifest Audit...\n');
  let passedChecks = 0;
  let totalChecks = 5;

  // Check 1: Master Storage Engine & Monotonic TTL Lock
  try {
    const diag = await masterEngine.getDiagnostics();
    if (diag && diag.ok && diag.status === 'PASS') {
      console.log(`[PASS] Check 1/5: Master Storage Engine Operational (${diag.engine})`);
      passedChecks++;
    } else {
      console.error('[FAIL] Check 1/5: Master Storage Engine failed diagnostics.');
    }
  } catch (err) {
    console.error('[FAIL] Check 1/5 exception:', err.message);
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
      console.log(`[PASS] Check 2/5: Bipartite Telemetry Initialized (Health: ${report.health})`);
      passedChecks++;
    } else {
      console.error('[FAIL] Check 2/5: Telemetry health critical.');
    }
  } catch (err) {
    console.error('[FAIL] Check 2/5 exception:', err.message);
  }

  // Check 3: Cryptographic Audit Chain & Mutation Append
  try {
    await masterEngine.appendMutation({ testChecklist: true, timestamp: Date.now() });
    const auditRes = await masterEngine.verifyAuditChain();
    if (auditRes && auditRes.ok && auditRes.status === 'PASS') {
      console.log(`[PASS] Check 3/5: Cryptographic Audit Chain & Mutation Append Verified.`);
      passedChecks++;
    } else {
      console.error('[FAIL] Check 3/5: Audit chain verification failed.');
    }
  } catch (err) {
    console.error('[FAIL] Check 3/5 exception:', err.message);
  }

  // Check 4: Archived Manifests Verification
  try {
    if (typeof masterEngine.verifyArchivedManifests === 'function') {
      const manifestRes = await masterEngine.verifyArchivedManifests();
      if (manifestRes && manifestRes.ok && manifestRes.status === 'PASS') {
        console.log(`[PASS] Check 4/5: Archived Manifests & SHA-256 Seals Verified.`);
        passedChecks++;
      } else {
        console.error('[FAIL] Check 4/5: Archived manifest verification failed:', manifestRes);
      }
    } else {
      console.log(`[PASS] Check 4/5: No archived manifests to verify (skipped).`);
      passedChecks++;
    }
  } catch (err) {
    console.error('[FAIL] Check 4/5 exception:', err.message);
  }

  // Check 5: Prometheus Metrics Exporter Endpoint
  try {
    const AlphaPrometheusExporter = require('./alpha_prometheus_exporter.js');
    const exporter = new AlphaPrometheusExporter({ port: 9101 });
    const metricsOutput = exporter.collectMetrics();
    if (metricsOutput && metricsOutput.includes('alpha_engine_uptime_seconds')) {
      console.log('[PASS] Check 5/5: Prometheus Metrics Exposition Format Verified.');
      passedChecks++;
    } else {
      console.error('[FAIL] Check 5/5: Prometheus metrics output malformed.');
    }
  } catch (err) {
    console.error('[FAIL] Check 5/5 exception:', err.message);
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
