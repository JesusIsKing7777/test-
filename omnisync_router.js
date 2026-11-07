'use strict';
/**
 * OMNISYNC AI v9.2 - PILL-AWARE HYBRID SEMANTIC ROUTER & RETROACTIVE NLI STREAM BRIDGE
 */
const InputIntentCompiler = require('./input_intent_compiler_v92.js');
const SemanticRouterBridge = require('./semantic_router_bridge.js');

class OmniSyncSemanticRouter {
  constructor(options = {}) {
    this.dailyCloudSpend = 0.0;
    this.maxDailySpendUSD = options.maxDailySpendUSD ?? 5.00;
    this.isOnline = options.isOnline ?? true;
    this.compiler = new InputIntentCompiler();
    this.semanticBridge = new SemanticRouterBridge(options.bridgeOptions);
  }

  // Backward-compatible legacy v9.0 evaluator
  evaluateQuery(prompt, containsPII) {
    return this.routeCompiledQuery(prompt, containsPII ? ['privacy:pii'] : [], { containsPII });
  }

  routeCompiledQuery(rawQuery, constraintPills = [], options = {}) {
    const compiledIr = this.compiler.compile(rawQuery, constraintPills);
    if (compiledIr.status === 'PAUSED_FOR_CLARIFICATION') {
      return {
        executionTier: 'CLARIFICATION_GATE',
        compiledIr,
        reason: compiledIr.clarificationPrompt
      };
    }

    const flags = compiledIr.domainRiskFlags || [];
    const containsPII = Boolean(options.containsPII) || flags.includes('PII_LOCAL_ONLY');
    const offlineForced = !this.isOnline || flags.includes('OFFLINE_EDGE_FORCED');
    const routerDecision = this.semanticBridge.evaluateIntent(compiledIr);

    if (containsPII || offlineForced) {
      return {
        executionTier: 'LOCAL_EDGE',
        reason: containsPII
          ? 'Privacy Protocol: PII or Stage 1 privacy pill detected, forced local.'
          : 'Connectivity Protocol: Offline mode active.',
        compiledIr,
        routerDecision,
        payload: { model: 'llama-3-3b-instruct-int4-mmap', prompt: rawQuery }
      };
    }

    if (this.dailyCloudSpend >= this.maxDailySpendUSD) {
      return {
        executionTier: 'LOCAL_EDGE',
        reason: 'Resource Directive: Daily cloud budget cap reached, falling back to edge.',
        compiledIr,
        routerDecision,
        payload: { model: 'llama-3-3b-instruct-int4-mmap', prompt: rawQuery }
      };
    }

    const isDeepReasoning =
      rawQuery.length > 120 ||
      /architect|proof|distributed|consensus/i.test(rawQuery) ||
      flags.includes('HIGH_STAKES_LEGAL');

    if (isDeepReasoning) {
      this.dailyCloudSpend += 0.02;
      return {
        executionTier: 'CLOUD_FRONTIER',
        reason: 'Semantic Classification: Complex multi-step reasoning routed to cloud frontier.',
        compiledIr,
        routerDecision,
        payload: { model: 'claude-3-5-sonnet', prompt: rawQuery }
      };
    }

    return {
      executionTier: 'LOCAL_EDGE',
      reason: `Stage 2.5 Route [${routerDecision.route}] (risk=${routerDecision.riskScore}).`,
      compiledIr,
      routerDecision,
      payload: { model: 'llama-3-3b-instruct-int4-mmap', prompt: rawQuery }
    };
  }

  async executeHybridPipeline(rawQuery, constraintPills = [], callbacks = {}) {
    const route = this.routeCompiledQuery(rawQuery, constraintPills, callbacks);
    if (route.executionTier === 'CLARIFICATION_GATE') {
      return route;
    }

    const acuId = `ACU-${Date.now()}`;
    const needsAsyncNli = route.routerDecision.route === 'STREAM_PLUS_ASYNC_NLI';

    // Stage 2b: Stream tokens immediately before async NLI finishes
    if (typeof callbacks.onAcuStreamed === 'function') {
      callbacks.onAcuStreamed({
        acuId,
        text: rawQuery,
        executionTier: route.executionTier,
        auditState: needsAsyncNli ? 'PENDING_AUDIT' : 'BYPASSED_LOW_RISK',
        domainRiskFlags: route.compiledIr.domainRiskFlags
      });
    }

    // Simulate async shared-arena INT4 NLI completion (~68ms)
    if (needsAsyncNli && typeof callbacks.onAcuNliResolved === 'function') {
      await new Promise(r => setTimeout(r, 68));
      const probs = route.routerDecision.probs || { contra: 0.02, neutral: 0.05, entail: 0.93 };
      callbacks.onAcuNliResolved({
        acuId,
        pContra: probs.contra,
        pNeutral: probs.neutral,
        pEntail: probs.entail,
        vetoTripped: Boolean(route.routerDecision.vetoTripped),
        latencyMs: 68
      });
    }

    return route;
  }
}

module.exports = OmniSyncSemanticRouter;
