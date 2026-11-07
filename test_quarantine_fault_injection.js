'use strict';
/**
 * AUTOMATED FAULT-INJECTION & QUARANTINE ROUTING TEST SUITE
 * Simulates corrupted audit chain entries and verifies that AlphaTelemetry
 * correctly routes failed claims into the 30% QUARANTINE DRAWER.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AlphaTelemetry = require('./alpha_telemetry_v9_2.js');
const masterEngine = require('./alpha_v8_3_master.js');

async function seedValidAuditLog() {
  const auditFile = path.join(process.cwd(), 'dataverse_audit.jsonl');
  const hmacKey = process.env.ALPHA_TELEMETRY_HMAC_KEY || 'default-test-entropy-key-32-bytes-minimum!!';
  const prevMac = '0'.repeat(64);
  const payload = JSON.stringify({ action: 'INIT', state: 'GENESIS' });
  const mac = crypto.createHmac('sha256', hmacKey).update(payload + prevMac).digest('hex');
  
  const validRecord = {
    sequence: 1,
    payload,
    prevMac,
    mac
  };
  fs.writeFileSync(auditFile, JSON.stringify(validRecord) + '\n', 'utf8');
}

async function injectCorruption() {
  const auditFile = path.join(process.cwd(), 'dataverse_audit.jsonl');
  if (!fs.existsSync(auditFile)) await seedValidAuditLog();

  const lines = fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean);
  if (lines.length > 0) {
    const record = JSON.parse(lines[0]);
    record.mac = 'deadbeef'.repeat(8); // Inject fraudulent MAC signature
    fs.writeFileSync(auditFile, JSON.stringify(record) + '\n', 'utf8');
  }
}

async function runFaultInjectionTest() {
  console.log('[FAULTEST] Seeding valid audit log & injecting corruption...');
  await seedValidAuditLog();
  await injectCorruption();

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
    quarantinedClauses: report.quarantineDrawer.quarantinedClaims.map(c => ({
      name: c.name,
      accessible_status: c.accessible_test_status,
      evidence_label: c.evidence_label,
      reason: c.details
    }))
  }, null, 2) + '\n');

  if (report.quarantineDrawer.count > 0 && report.health === 'CRITICAL') {
    console.log('[SUCCESS] Fault injection successfully trapped in QUARANTINE_DRAWER with CRITICAL health exit code 2.');
    process.exit(0);
  } else {
    console.error('[ERROR] Quarantine routing did not catch the corrupted audit chain.');
    process.exit(2);
  }
}

runFaultInjectionTest().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(2);
});
