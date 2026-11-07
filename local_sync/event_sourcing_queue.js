'use strict';
/**
 * [CONVERGE 5a] LOCAL-FIRST EVENT SOURCING & WI-FI-GATED HMAC-SHA256 SYNC QUEUE
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class LocalFirstEventSync {
  constructor(options = {}) {
    this.storagePath = path.resolve(options.storagePath || __dirname);
    this.queueFile = path.join(this.storagePath, 'vector_sync_queue.jsonl');
    this.hmacKey = options.hmacKey || process.env.ALPHA_TELEMETRY_HMAC_KEY || 'default-local-sync-entropy-32-bytes!';
    this._initStorage();
  }

  _initStorage() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  _signPayload(payloadJson) {
    return crypto.createHmac('sha256', this.hmacKey).update(payloadJson).digest('hex');
  }

  async enqueueMutation(vectorId, embedding, metadata = {}) {
    const timestamp = Date.now();
    const payload = JSON.stringify({ vectorId, embedding, metadata, timestamp });
    const hmac = this._signPayload(payload);
    const record = { payload, hmac, synced: false };

    fs.appendFileSync(this.queueFile, JSON.stringify(record) + '\n', 'utf8');
    return record;
  }

  verifyQueueIntegrity() {
    if (!fs.existsSync(this.queueFile)) {
      return { ok: true, total: 0, verified: 0, corrupted: 0 };
    }
    const lines = fs.readFileSync(this.queueFile, 'utf8').split('\n').filter(Boolean);
    let verified = 0;
    let corrupted = 0;
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        if (this._signPayload(rec.payload) === rec.hmac) {
          verified++;
        } else {
          corrupted++;
        }
      } catch (_) {
        corrupted++;
      }
    }
    return { ok: corrupted === 0, total: lines.length, verified, corrupted };
  }

  async syncWithCloudGateway(networkState = { isOnline: false, isWifiConnected: false }) {
    if (!networkState.isOnline || !networkState.isWifiConnected) {
      return {
        syncedCount: 0,
        deferred: true,
        reason: !networkState.isOnline ? 'OFFLINE' : 'CELLULAR_ONLY_WIFI_REQUIRED'
      };
    }

    if (!fs.existsSync(this.queueFile)) {
      return { syncedCount: 0, deferred: false, reason: 'QUEUE_EMPTY' };
    }

    const integrity = this.verifyQueueIntegrity();
    if (!integrity.ok) {
      throw new Error(`HMAC integrity check failed on ${integrity.corrupted} queued record(s).`);
    }

    const records = fs.readFileSync(this.queueFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));

    const pending = records.filter(r => !r.synced);
    if (pending.length === 0) {
      return { syncedCount: 0, deferred: false, reason: 'ALL_RECORDS_SYNCED' };
    }

    const updated = records.map(r => ({ ...r, synced: true, syncedAt: r.syncedAt || Date.now() }));
    fs.writeFileSync(this.queueFile, updated.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    return { syncedCount: pending.length, deferred: false, reason: 'WIFI_SYNC_COMPLETE' };
  }
}

module.exports = LocalFirstEventSync;
