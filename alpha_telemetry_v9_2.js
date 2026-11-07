'use strict';
/**
 * SCRIPT ALPHA v9.2 UNIFIED SPINE / DATAVERSE v5.5 BRIDGE
 * TELEMETRY, ATOMIC CLAIM UNIT (ACU) ROUTER & BIPARTITE HEALTH MODULE
 */
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

class AlphaTelemetry {
  constructor(options = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 5000,
      storagePath: options.storagePath ?? process.cwd(),
      historyLimit: options.historyLimit ?? 500,
      latencyWarningMs: options.latencyWarningMs ?? 1000,
      latencyCriticalMs: options.latencyCriticalMs ?? 5000,
      entailmentThresholdTau: options.entailmentThresholdTau ?? 0.85,
      disclosureTier: options.disclosureTier ?? 'STANDARD',
      registerLadder: options.registerLadder ?? 'EXPERT',
      platformTarget: options.platformTarget ?? 'Termux [Unverified]',
      ...options
    };
    this.adapters = options.adapters ?? {};
    this.startedAt = new Date().toISOString();
    this.metrics = { operations: 0, successfulOperations: 0, failedOperations: 0, recoveredOperations: 0, timeouts: 0, errors: [], latencySamples: [], lastError: null };
    this.checkHistory = [];
  }

  now() { return new Date().toISOString(); }

  mapToAccessibleStatus(legacyStatus) {
    if (legacyStatus === 'PASS') return 'PASS';
    if (legacyStatus === 'FAIL') return 'FAIL';
    return 'NOT RUN';
  }

  recordCheck(name, status, details = {}, epistemicMeta = {}) {
    const accessibleStatus = epistemicMeta.accessibleStatus ?? this.mapToAccessibleStatus(status);
    const evidenceLabel = epistemicMeta.evidenceLabel ?? (status === 'PASS' ? '[Verified]' : status === 'WARN' || status === 'FAIL' ? '[Inferred]' : '[Unknown]');
    const nliScore = epistemicMeta.nliScore ?? (status === 'PASS' && evidenceLabel === '[Verified]' ? 0.98 : 0.45);
    const partition = (nliScore >= this.options.entailmentThresholdTau && status === 'PASS') ? 'VERIFIED_CORE' : 'QUARANTINE_DRAWER';

    const record = {
      acu_id: `ACU-${String(this.checkHistory.length + 1).padStart(3, '0')}`,
      timestamp: this.now(),
      name,
      status,
      accessible_test_status: accessibleStatus,
      evidence_label: evidenceLabel,
      nli_entailment_score: nliScore,
      partition,
      details
    };

    this.checkHistory.push(record);
    if (this.checkHistory.length > this.options.historyLimit) {
      this.checkHistory.shift();
    }
    return record;
  }

  async withTimeout(task, timeoutMs = this.options.timeoutMs) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(task),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  checkRuntime() {
    const memory = process.memoryUsage();
    return this.recordCheck('runtime', 'PASS', { nodeVersion: process.version, rss: memory.rss }, { evidenceLabel: '[Verified]', accessibleStatus: 'PASS', nliScore: 1.0 });
  }

  checkStorage() {
    const target = path.resolve(this.options.storagePath);
    try {
      fs.accessSync(target, fs.constants.R_OK | fs.constants.W_OK);
      return this.recordCheck('storage', 'PASS', { path: target }, { evidenceLabel: '[Verified]', accessibleStatus: 'PASS', nliScore: 1.0 });
    } catch (error) {
      return this.recordCheck('storage', 'FAIL', { path: target, message: error.message }, { evidenceLabel: '[Verified]', accessibleStatus: 'FAIL', nliScore: 0.0 });
    }
  }

  async runAdapter(name, required = false) {
    const adapter = this.adapters[name];
    if (typeof adapter !== 'function') {
      return this.recordCheck(name, required ? 'UNKNOWN' : 'SKIPPED', { reason: 'Adapter not configured' }, { evidenceLabel: '[Unknown]', accessibleStatus: 'NOT RUN', nliScore: 0.0 });
    }
    try {
      const result = await this.withTimeout(() => adapter(), this.options.timeoutMs);
      const passed = result === true || (result && result.ok === true) || (result && result.status === 'PASS');
      return this.recordCheck(name, passed ? 'PASS' : 'FAIL', { result }, { evidenceLabel: '[Verified]', accessibleStatus: passed ? 'PASS' : 'FAIL', nliScore: passed ? 0.96 : 0.1 });
    } catch (error) {
      return this.recordCheck(name, 'FAIL', { message: error.message }, { evidenceLabel: '[Verified]', accessibleStatus: 'FAIL', nliScore: 0.0 });
    }
  }

  determineHealth(checks) {
    const statuses = checks.map(check => check.status);
    if (statuses.includes('FAIL')) return 'CRITICAL';
    if (statuses.includes('UNKNOWN') || statuses.includes('WARN') || statuses.includes('SKIPPED')) return 'DEGRADED';
    return 'HEALTHY';
  }

  determineReadiness(health) {
    if (health === 'CRITICAL') return 'NOT_READY';
    if (health === 'DEGRADED') return 'CONDITIONAL';
    return 'READY';
  }

  async runDiagnostics() {
    const start = performance.now();
    const initialHistoryLength = this.checkHistory.length;

    this.checkRuntime();
    this.checkStorage();
    await this.runAdapter('getDiagnostics', true);
    await this.runAdapter('verifyAuditChain', true);
    await this.runAdapter('verifyPersistence', true);
    await this.runAdapter('verifyExternalAnchor', false);

    const checks = this.checkHistory.slice(initialHistoryLength);
    const health = this.determineHealth(checks);
    const readiness = this.determineReadiness(health);

    const verifiedCore = checks.filter(c => c.partition === 'VERIFIED_CORE');
    const quarantinedClaims = checks.filter(c => c.partition === 'QUARANTINE_DRAWER');

    const report = {
      $schema: 'https://accelerator.ai/schemas/v9.2/bipartite-output-envelope.json',
      schema: 'alpha.telemetry.report',
      schemaVersion: '9.2.0',
      engine: 'Script Alpha v9.2 Unified Spine',
      generatedAt: this.now(),
      startedAt: this.startedAt,
      executionDurationMs: Number((performance.now() - start).toFixed(3)),
      health,
      readiness,
      compiledInputIr: {
        schema_version: '9.2.0',
        intent_verb: 'EVALUATE_PROTOCOL',
        disclosure_tier: this.options.disclosureTier,
        register_ladder: this.options.registerLadder,
        platform_target: this.options.platformTarget
      },
      telemetry: { ...this.metrics },
      verifiedCore: { count: verifiedCore.length, claims: verifiedCore },
      quarantineDrawer: { count: quarantinedClaims.length, assumptions: [], quarantinedClaims },
      predictiveCognitiveTriad: [
        { vector_type: 'CONVERGE', headline: 'Master Engine Active', next_prompt: 'Run production verification.' }
      ],
      sessionCapsule: `SESSION CAPSULE (v9.2) | Health: ${health} (${readiness}) | Verified Core: ${verifiedCore.length} | Quarantine: ${quarantinedClaims.length}.`,
      checks,
      checkCount: checks.length
    };

    report.reportHash = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
    return report;
  }

  async generateJSONReport() {
    const report = await this.runDiagnostics();
    return JSON.stringify(report, null, 2);
  }
}

module.exports = AlphaTelemetry;
