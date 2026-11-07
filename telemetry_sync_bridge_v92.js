'use strict';
/**
 * [CONVERGE] TELEMETRY & WI-FI AUDIT PERSISTENCE BRIDGE
 * Connects BottomQuarantineDrawerController & OmniSyncSemanticRouter into
 * alpha_telemetry_v9_2.js and local_sync/event_sourcing_queue.js.
 */
const crypto = require('node:crypto');
const LocalFirstEventSync = require('./local_sync/event_sourcing_queue.js');

let AlphaTelemetry = null;
try {
  const mod = require('./alpha_telemetry_v9_2.js');
  AlphaTelemetry = mod.AlphaTelemetry || mod;
} catch (_) {
  AlphaTelemetry = null;
}

class TelemetrySyncBridge {
  constructor(options = {}) {
    this.syncQueue = options.syncQueue || new LocalFirstEventSync(options.syncOptions);
    this.telemetry = options.telemetry || (typeof AlphaTelemetry === 'function' ? new AlphaTelemetry(options.telemetryOptions || {}) : null);
    this.auditRecords = [];
    this.pendingWrites = [];
    this._attachedDrawers = new WeakSet();
  }

  _deterministicMicroEmbedding(text) {
    const hash = crypto.createHash('sha256').update(String(text || '')).digest();
    return [
      Number((hash[0] / 255).toFixed(4)),
      Number((hash[1] / 255).toFixed(4)),
      Number((hash[2] / 255).toFixed(4)),
      Number((hash[3] / 255).toFixed(4))
    ];
  }

  attachDrawer(drawerController) {
    if (this._attachedDrawers.has(drawerController)) return;
    this._attachedDrawers.add(drawerController);

    drawerController.on('ui_state_changed', (evt) => {
      if (!evt || !evt.item) return;
      if (evt.eventType === 'SLIDE_TO_BOTTOM_DRAWER' || evt.eventType === 'LOCK_VERIFIED_CORE' || evt.eventType === 'PROMOTE_FROM_DRAWER') {
        const p = this.persistAuditEvent(evt.eventType, evt.acuId, evt.item, evt.snapshot);
        this.pendingWrites.push(p);
      }
    });
  }

  async persistAuditEvent(eventType, acuId, item, snapshot) {
    const record = {
      eventType,
      acuId,
      partition: item.partition,
      auditState: item.auditState,
      probs: item.probs || null,
      domainRiskFlags: item.domainRiskFlags || [],
      verifiedCoreCount: snapshot ? snapshot.verifiedCoreCount : null,
      drawerBadgeCount: snapshot ? snapshot.drawerBadgeCount : null,
      recordedAt: Date.now()
    };
    this.auditRecords.push(record);

    if (this.telemetry && typeof this.telemetry.recordCheck === 'function') {
      try {
        this.telemetry.recordCheck({
          name: `acu_${acuId}`,
          status: item.partition === 'BOTTOM_QUARANTINE_DRAWER_30' ? 'WARN' : 'PASS',
          detail: item.auditState,
          metadata: record
        });
      } catch (_) {
        // Preserve fail-safe telemetry resilience without crashing UI updates
      }
    }

    const vectorId = `${eventType.toLowerCase()}:${acuId}`;
    const embedding = this._deterministicMicroEmbedding(item.text || acuId);
    return this.syncQueue.enqueueMutation(vectorId, embedding, record);
  }

  async flushPendingWrites() {
    if (this.pendingWrites.length === 0) return;
    const batch = this.pendingWrites.splice(0, this.pendingWrites.length);
    await Promise.all(batch);
  }

  async syncIfWifi(networkState) {
    await this.flushPendingWrites();
    return this.syncQueue.syncWithCloudGateway(networkState);
  }
}

module.exports = TelemetrySyncBridge;
