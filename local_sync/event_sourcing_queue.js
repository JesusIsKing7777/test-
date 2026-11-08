'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class LocalFirstEventSync {
  constructor(options = {}) {
    this.storagePath = path.resolve(options.storagePath || __dirname);
    this.queueFile = path.join(this.storagePath, 'vector_sync_queue.jsonl');
    this.ackFile = path.join(this.storagePath, 'vector_sync_ack.jsonl');
    this.lockDir = path.join(this.storagePath, '.sync_queue.lock');
    this.lockEpochFile = path.join(this.lockDir, 'epoch.txt');
    this.lockTtlNs = BigInt(options.lockTtlMs ?? 5000) * 1000000n;
    this.hmacKey = options.hmacKey || process.env.ALPHA_TELEMETRY_HMAC_KEY || 'default-local-sync-entropy-32-bytes!';
    this._seq = 0;
    if (!fs.existsSync(this.storagePath)) fs.mkdirSync(this.storagePath, { recursive: true });
  }

  _signPayload(str) {
    return crypto.createHmac('sha256', this.hmacKey).update(str).digest('hex');
  }

  async _withLock(fn, timeoutMs = 2000) {
    const deadline = process.hrtime.bigint() + BigInt(timeoutMs) * 1000000n;
    while (true) {
      try {
        fs.mkdirSync(this.lockDir);
        fs.writeFileSync(this.lockEpochFile, process.hrtime.bigint().toString(), 'utf8');
        break;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        try {
          const epoch = BigInt(fs.readFileSync(this.lockEpochFile, 'utf8').trim());
          if (process.hrtime.bigint() - epoch > this.lockTtlNs) {
            fs.rmSync(this.lockDir, { recursive: true, force: true });
            continue;
          }
        } catch (_) {}
        if (process.hrtime.bigint() >= deadline) throw new Error('Timeout acquiring exclusive sync lock');
        await new Promise(r => setTimeout(r, 5));
      }
    }
    try { return await fn(); } finally { fs.rmSync(this.lockDir, { recursive: true, force: true }); }
  }

  async enqueueMutation(vectorId, embedding, metadata = {}) {
    return this._withLock(() => {
      const payload = JSON.stringify({ seq: ++this._seq, vectorId, embedding, metadata, timestamp: Date.now() });
      const record = { payload, hmac: this._signPayload(payload) };
      fs.appendFileSync(this.queueFile, JSON.stringify(record) + '\n', 'utf8');
      return record;
    });
  }

  getAckedSet() {
    const acked = new Set();
    if (!fs.existsSync(this.ackFile)) return acked;
    for (const line of fs.readFileSync(this.ackFile, 'utf8').split('\n').filter(Boolean)) {
      try {
        const ack = JSON.parse(line);
        if (ack.hmac && ack.ackMac === this._signPayload('ACK:' + ack.hmac)) acked.add(ack.hmac);
      } catch (_) {}
    }
    return acked;
  }

  verifyQueueIntegrity() {
    if (!fs.existsSync(this.queueFile)) return { ok: true, total: 0, verified: 0, corrupted: 0 };
    const lines = fs.readFileSync(this.queueFile, 'utf8').split('\n').filter(Boolean);
    let verified = 0, corrupted = 0;
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        this._signPayload(rec.payload) === rec.hmac ? verified++ : corrupted++;
      } catch (_) { corrupted++; }
    }
    return { ok: corrupted === 0, total: lines.length, verified, corrupted };
  }

  async syncWithCloudGateway(net = { isOnline: false, isWifiConnected: false }) {
    if (!net.isOnline || !net.isWifiConnected) {
      return { syncedCount: 0, deferred: true, reason: !net.isOnline ? 'OFFLINE' : 'CELLULAR_ONLY_WIFI_REQUIRED' };
    }
    return this._withLock(() => {
      if (!fs.existsSync(this.queueFile)) return { syncedCount: 0, deferred: false, reason: 'QUEUE_EMPTY' };
      const integrity = this.verifyQueueIntegrity();
      if (!integrity.ok) throw new Error(`HMAC integrity check failed on ${integrity.corrupted} queued record(s).`);
      const acked = this.getAckedSet();
      const records = fs.readFileSync(this.queueFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
      const pending = records.filter(r => !acked.has(r.hmac));
      if (pending.length === 0) return { syncedCount: 0, deferred: false, reason: 'ALL_RECORDS_SYNCED' };
      const now = Date.now();
      fs.appendFileSync(this.ackFile, pending.map(r => JSON.stringify({
        hmac: r.hmac, ackMac: this._signPayload('ACK:' + r.hmac), syncedAt: now
      })).join('\n') + '\n', 'utf8');
      return { syncedCount: pending.length, deferred: false, reason: 'WIFI_SYNC_COMPLETE', ackCursorFile: this.ackFile };
    });
  }

  async compactSyncedRecords() {
    return this._withLock(() => {
      if (!fs.existsSync(this.queueFile)) return { compacted: false, removedCount: 0, remainingCount: 0 };
      const integrity = this.verifyQueueIntegrity();
      if (!integrity.ok) throw new Error(`Refusing compaction: ${integrity.corrupted} corrupted record(s).`);
      const acked = this.getAckedSet();
      const lines = fs.readFileSync(this.queueFile, 'utf8').split('\n').filter(Boolean);
      const kept = lines.filter(line => !acked.has(JSON.parse(line).hmac));
      const tmpQueue = this.queueFile + '.tmp';
      fs.writeFileSync(tmpQueue, kept.length ? kept.join('\n') + '\n' : '', 'utf8');
      fs.renameSync(tmpQueue, this.queueFile);
      if (fs.existsSync(this.ackFile)) fs.unlinkSync(this.ackFile);
      return { compacted: true, removedCount: lines.length - kept.length, remainingCount: kept.length };
    });
  }
}

module.exports = LocalFirstEventSync;
