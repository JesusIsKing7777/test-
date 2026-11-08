'use strict';
const InputIntentCompiler = require('./input_intent_compiler_v92.js');
const SemanticRouterBridge = require('./semantic_router_bridge.js');

class OmniSyncSemanticRouter {
  constructor(options = {}) {
    this.dailyCloudSpend = 0.0;
    this.maxDailySpendUSD = options.maxDailySpendUSD ?? 5.00;
    this.isOnline = options.isOnline ?? true;
    this.keepAlive = Boolean(options.keepAlive);
    this.idleReapMs = options.idleReapMs ?? 800;
    this._reapTimer = null;
    this.compiler = new InputIntentCompiler();
    this.semanticBridge = new SemanticRouterBridge(options.bridgeOptions);
  }

  evaluateQuery(prompt, containsPII) {
    return this.routeCompiledQuery(prompt, containsPII ? ['privacy:pii'] : [], { containsPII });
  }

  _buildRoutePayload(rawQuery, compiledIr, routerDecision, options = {}) {
    const flags = compiledIr.domainRiskFlags || [];
    const containsPII = Boolean(options.containsPII) || flags.includes('PII_LOCAL_ONLY');
    const offlineForced = !this.isOnline || flags.includes('OFFLINE_EDGE_FORCED');

    if (containsPII || offlineForced) {
      return {
        executionTier: 'LOCAL_EDGE',
        reason: containsPII ? 'Privacy Protocol: PII or Stage 1 privacy pill detected, forced local.' : 'Connectivity Protocol: Offline mode active.',
        compiledIr, routerDecision,
        payload: { model: 'llama-3-3b-instruct-int4-mmap', prompt: rawQuery }
      };
    }
    if (this.dailyCloudSpend >= this.maxDailySpendUSD) {
      return {
        executionTier: 'LOCAL_EDGE',
        reason: 'Resource Directive: Daily cloud budget cap reached, falling back to edge.',
        compiledIr, routerDecision,
        payload: { model: 'llama-3-3b-instruct-int4-mmap', prompt: rawQuery }
      };
    }
    const isDeepReasoning = rawQuery.length > 120 || /architect|proof|distributed|consensus/i.test(rawQuery) || flags.includes('HIGH_STAKES_LEGAL');
    if (isDeepReasoning) {
      this.dailyCloudSpend += 0.02;
      return {
        executionTier: 'CLOUD_FRONTIER',
        reason: 'Semantic Classification: Complex multi-step reasoning routed to cloud frontier.',
        compiledIr, routerDecision,
        payload: { model: 'claude-3-5-sonnet', prompt: rawQuery }
      };
    }
    return {
      executionTier: 'LOCAL_EDGE',
      reason: `Stage 2.5 Route [${routerDecision.route}] (risk=${routerDecision.riskScore}).`,
      compiledIr, routerDecision,
      payload: { model: 'llama-3-3b-instruct-int4-mmap', prompt: rawQuery }
    };
  }

  routeCompiledQuery(rawQuery, constraintPills = [], options = {}) {
    const compiledIr = this.compiler.compile(rawQuery, constraintPills);
    if (compiledIr.status === 'PAUSED_FOR_CLARIFICATION') {
      return { executionTier: 'CLARIFICATION_GATE', compiledIr, reason: compiledIr.clarificationPrompt };
    }
    const routerDecision = this.semanticBridge.evaluateIntent(compiledIr);
    return this._buildRoutePayload(rawQuery, compiledIr, routerDecision, options);
  }

  _cancelIdleReap() {
    if (this._reapTimer) { clearTimeout(this._reapTimer); this._reapTimer = null; }
  }

  _scheduleIdleReap() {
    if (this.keepAlive || this.idleReapMs <= 0) return;
    this._cancelIdleReap();
    this._reapTimer = setTimeout(() => { this.shutdown().catch(() => {}); }, this.idleReapMs);
    if (typeof this._reapTimer.unref === 'function') this._reapTimer.unref();
  }

  async executeHybridPipeline(rawQuery, constraintPills = [], callbacks = {}) {
    this._cancelIdleReap();
    const compiledIr = this.compiler.compile(rawQuery, constraintPills);
    if (compiledIr.status === 'PAUSED_FOR_CLARIFICATION') {
      return { executionTier: 'CLARIFICATION_GATE', compiledIr, reason: compiledIr.clarificationPrompt };
    }
    const fastDecision = this.semanticBridge.evaluateIntent(compiledIr);
    const fastRoute = this._buildRoutePayload(rawQuery, compiledIr, fastDecision, callbacks);
    const acuId = `ACU-${Date.now()}`;
    const needsAsyncNli = fastDecision.route === 'STREAM_PLUS_ASYNC_NLI';

    if (typeof callbacks.onAcuStreamed === 'function') {
      callbacks.onAcuStreamed({
        acuId, text: rawQuery, executionTier: fastRoute.executionTier,
        auditState: needsAsyncNli ? 'PENDING_AUDIT' : 'BYPASSED_LOW_RISK',
        domainRiskFlags: compiledIr.domainRiskFlags
      });
    }

    let finalDecision = fastDecision;
    if (needsAsyncNli) {
      const t0 = Date.now();
      finalDecision = callbacks.useSyncGate
        ? fastDecision
        : await this.semanticBridge.evaluateIntentAsync(compiledIr, {
            premise: callbacks.premise, freeRamMb: callbacks.freeRamMb, labelMapPath: callbacks.labelMapPath
          });
      this._scheduleIdleReap();
      if (typeof callbacks.onAcuNliResolved === 'function') {
        const probs = finalDecision.probs || { contra: 0.02, neutral: 0.05, entail: 0.93 };
        callbacks.onAcuNliResolved({
          acuId, pContra: probs.contra, pNeutral: probs.neutral, pEntail: probs.entail,
          vetoTripped: Boolean(finalDecision.vetoTripped), latencyMs: Date.now() - t0,
          inferenceBackend: finalDecision.inferenceBackend || 'ASYNC_WORKER'
        });
      }
    }
    return this._buildRoutePayload(rawQuery, compiledIr, finalDecision, callbacks);
  }

  async shutdown() {
    this._cancelIdleReap();
    await this.semanticBridge.shutdown();
  }
}

module.exports = OmniSyncSemanticRouter;
