'use strict';
const EventEmitter = require('node:events');

class BottomQuarantineDrawerController extends EventEmitter {
  constructor(options = {}) {
    super();
    this.contradictionVeto = options.contradictionVeto ?? 0.35;
    this.entailmentTau = options.entailmentTau ?? 0.85;
    this.verifiedCore = new Map();
    this.quarantineDrawer = new Map();
    this.isDrawerExpanded = false;
    this.transitionLog = [];
  }

  onAcuStreamed({ acuId, text, executionTier, auditState, domainRiskFlags = [] }) {
    const item = {
      acuId, text, executionTier,
      auditState: auditState || 'PENDING_AUDIT',
      domainRiskFlags, partition: 'VERIFIED_CORE_70',
      badge: auditState === 'BYPASSED_LOW_RISK' ? '[Inferred]' : '[Pending Audit]',
      streamedAt: Date.now()
    };
    this.verifiedCore.set(acuId, item);
    this._emitStateChange('ACU_STREAMED', acuId, item);
    return item;
  }

  handleRetroactiveNliEvent({ acuId, pContra, pNeutral = 0, pEntail, vetoTripped, latencyMs = 0 }) {
    const existing = this.verifiedCore.get(acuId);
    if (!existing) return null;
    const trippedVeto = Boolean(vetoTripped) || pContra >= this.contradictionVeto;
    const belowTau = pEntail < this.entailmentTau;

    if (trippedVeto || belowTau) {
      this.verifiedCore.delete(acuId);
      const qItem = {
        ...existing,
        partition: 'BOTTOM_QUARANTINE_DRAWER_30',
        auditState: trippedVeto ? 'QUARANTINED_CONTRADICTION' : 'QUARANTINED_LOW_ENTAILMENT',
        badge: trippedVeto ? '[Quarantined - Contradiction Veto]' : '[Inferred - Low Entailment]',
        probs: { pContra, pNeutral, pEntail }, nliLatencyMs: latencyMs, quarantinedAt: Date.now()
      };
      this.quarantineDrawer.set(acuId, qItem);
      this.isDrawerExpanded = trippedVeto ? true : this.isDrawerExpanded;
      this.transitionLog.push({ acuId, animation: 'SLIDE_TO_BOTTOM_DRAWER', reason: qItem.auditState });
      this._emitStateChange('SLIDE_TO_BOTTOM_DRAWER', acuId, qItem);
      return qItem;
    }

    const vItem = {
      ...existing, auditState: 'LOCKED_VERIFIED', badge: '[Reported]',
      probs: { pContra, pNeutral, pEntail }, nliLatencyMs: latencyMs, verifiedAt: Date.now()
    };
    this.verifiedCore.set(acuId, vItem);
    this._emitStateChange('LOCK_VERIFIED_CORE', acuId, vItem);
    return vItem;
  }

  promoteClaim(acuId) {
    const item = this.quarantineDrawer.get(acuId);
    if (!item) return false;
    this.quarantineDrawer.delete(acuId);
    const promoted = {
      ...item, partition: 'VERIFIED_CORE_70',
      auditState: 'USER_PROMOTED', badge: '[Verified - Promoted]', promotedAt: Date.now()
    };
    this.verifiedCore.set(acuId, promoted);
    this._emitStateChange('PROMOTE_FROM_DRAWER', acuId, promoted);
    return true;
  }

  toggleDrawer(forceState) {
    this.isDrawerExpanded = typeof forceState === 'boolean' ? forceState : !this.isDrawerExpanded;
    this._emitStateChange('TOGGLE_DRAWER', null, null);
  }

  getSnapshot() {
    return {
      verifiedCoreCount: this.verifiedCore.size,
      drawerBadgeCount: this.quarantineDrawer.size,
      isDrawerExpanded: this.isDrawerExpanded,
      verifiedCore: Array.from(this.verifiedCore.values()),
      quarantineDrawer: Array.from(this.quarantineDrawer.values()),
      transitionLog: this.transitionLog
    };
  }

  _emitStateChange(eventType, acuId, item) {
    this.emit('ui_state_changed', { eventType, acuId, item, snapshot: this.getSnapshot() });
  }
}

module.exports = BottomQuarantineDrawerController;
