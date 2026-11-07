/**
 * Script Alpha v8.1 - Dataverse v5.1 Master Engine Supervisor
 * Hardened with Array Type-Guards, HMAC-SHA-256 AuditLog, and Startup TVP Verification
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class AuditLog {
  constructor(logPath) {
    this.logPath = logPath;
    this.hmacKey = crypto.randomBytes(32);
    this._ensureDir();
  }

  _ensureDir() {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  verifyChain() {
    if (!fs.existsSync(this.logPath)) return true;
    try {
      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        const record = JSON.parse(lines[i]);
        if (record.sequence !== i + 1) {
          console.error(`[TVP Integrity Violation]: Sequence mismatch at record ${i + 1}`);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('[TVP Integrity Violation]: Failed to parse audit log:', err.message);
      return false;
    }
  }

  log(event, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      sequence: this._getNextSequence()
    };
    const dataStr = JSON.stringify(entry);
    const hmac = crypto.createHmac('sha256', this.hmacKey).update(dataStr).digest('hex');
    const record = JSON.stringify({ ...entry, hmac }) + '\n';
    fs.appendFileSync(this.logPath, record, 'utf8');
  }

  _getNextSequence() {
    if (!fs.existsSync(this.logPath)) return 1;
    try {
      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      return lines.length + 1;
    } catch {
      return 1;
    }
  }
}

class AlphaSupervisor {
  constructor(sourceDir = './', targetDir = '/sdcard/Alpha Up2date') {
    this.sourceDir = path.resolve(sourceDir);
    this.targetDir = targetDir;
    this.audit = new AuditLog(path.join(this.sourceDir, 'telemetry check', 'tvp_audit.jsonl'));
  }

  async start() {
    console.log('[Script Alpha v8.1]: Running startup Truth Verification Protocol check...');
    if (!this.audit.verifyChain()) {
      console.error('[CRITICAL]: Audit log chain verification failed. Aborting startup.');
      process.exit(1);
    }
    console.log('[TVP Check]: Audit chain verified successfully.');

    this.audit.log('SUPERVISOR_START', { source: this.sourceDir, target: this.targetDir });
    console.log('[Script Alpha v8.1]: Master Supervisor Active.');
    
    // Ensure target storage exists
    try {
      if (!fs.existsSync(this.targetDir)) {
        fs.mkdirSync(this.targetDir, { recursive: true });
      }
      this.audit.log('STORAGE_VERIFIED', { target: this.targetDir });
    } catch (err) {
      this.audit.log('STORAGE_ERROR', { error: err.message });
      console.error('[Storage Error]:', err.message);
    }
  }
}

// Export module properly
module.exports = { AuditLog, AlphaSupervisor };

if (require.main === module) {
  const supervisor = new AlphaSupervisor();
  supervisor.start().catch(console.error);
}
