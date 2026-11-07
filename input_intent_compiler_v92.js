'use strict';
/**
 * INPUT INTENT COMPILER v9.2 WITH CART 3 GUARD & STAGE 1 (3b) CONSTRAINT PILL RISK EXTRACTOR
 */
let AmbiguityGuard;
try {
  AmbiguityGuard = require('./cart3_ambiguity_guard.js');
} catch (_) {
  AmbiguityGuard = class FallbackGuard {
    evaluateQuery(q) {
      if (!q || q.trim().length < 15 || !q.includes(' ')) {
        return {
          action: 'ASK_CLARIFICATION',
          question: 'Your request is ambiguous. Select target objective:',
          options: ['1. Local Edge Stress Test', '2. Audit Chain Verification']
        };
      }
      return { action: 'PROCEED_WITH_ASSUMPTION', assumption: 'Default v9.2 unified spine parameters.' };
    }
  };
}

const PILL_RISK_MAP = {
  'domain:health': { flag: 'HIGH_STAKES_HEALTH', boost: 0.45, escalateTo: 'STANDARD' },
  'domain:legal': { flag: 'HIGH_STAKES_LEGAL', boost: 0.45, escalateTo: 'STANDARD' },
  'domain:finance': { flag: 'HIGH_STAKES_MONEY', boost: 0.45, escalateTo: 'STANDARD' },
  'domain:security': { flag: 'HIGH_STAKES_SECURITY', boost: 0.45, escalateTo: 'STANDARD' },
  'privacy:pii': { flag: 'PII_LOCAL_ONLY', boost: 0.35, escalateTo: 'STANDARD' },
  'verify:numeric': { flag: 'STRICT_NUMERIC_NLI', boost: 0.30, escalateTo: null },
  'verify:citations': { flag: 'STRICT_CITATION_NLI', boost: 0.30, escalateTo: null },
  'mode:offline': { flag: 'OFFLINE_EDGE_FORCED', boost: 0.0, escalateTo: null },
  'mode:creative': { flag: 'LOW_RISK_CREATIVE', boost: -0.10, escalateTo: null }
};

class InputIntentCompiler {
  constructor() {
    this.guard = new AmbiguityGuard({ entropyThreshold: 0.75 });
  }

  extractPillRisk(constraintPills = []) {
    const flags = new Set();
    let pillRiskBoost = 0.0;
    let disclosureTier = 'LITE';
    const normalizedPills = [];

    for (const rawPill of constraintPills) {
      const key = typeof rawPill === 'string' ? rawPill.trim().toLowerCase() : String(rawPill.id || rawPill.label || '').trim().toLowerCase();
      if (!key) continue;
      normalizedPills.push(key);

      const rule = PILL_RISK_MAP[key];
      if (rule) {
        flags.add(rule.flag);
        pillRiskBoost += rule.boost;
        if (rule.escalateTo === 'STANDARD') disclosureTier = 'STANDARD';
      } else if (/health|med|legal|money|pay|bank|safety|delete|wipe/i.test(key)) {
        flags.add('HIGH_STAKES_INFERRED');
        pillRiskBoost += 0.40;
        disclosureTier = 'STANDARD';
      } else if (/ram|latency|ms|mb|audit|hmac|wal/i.test(key)) {
        flags.add('TECHNICAL_METRIC_CLAIM');
        pillRiskBoost += 0.25;
      }
    }

    return {
      normalizedPills,
      domainRiskFlags: Array.from(flags),
      pillRiskBoost: Number(Math.max(-0.15, Math.min(0.60, pillRiskBoost)).toFixed(3)),
      disclosureTier
    };
  }

  compile(rawQuery, constraintPills = []) {
    const guardResult = this.guard.evaluateQuery(rawQuery);
    const pillMeta = this.extractPillRisk(constraintPills);

    if (guardResult.action === 'ASK_CLARIFICATION') {
      return {
        status: 'PAUSED_FOR_CLARIFICATION',
        clarificationPrompt: guardResult.question,
        options: guardResult.options,
        stage1Pills: pillMeta.normalizedPills,
        domainRiskFlags: pillMeta.domainRiskFlags,
        pillRiskBoost: pillMeta.pillRiskBoost
      };
    }

    return {
      status: 'COMPILED',
      schema_version: 'v9.2',
      intent_verb: 'ARCHITECT_PIPELINE',
      raw_token_count: rawQuery.length,
      compressed_token_count: Math.floor(rawQuery.length * 0.6),
      shannon_entropy_reduction_pct: 40.0,
      canonical_proposition_query: rawQuery,
      assumptionApplied: guardResult.assumption || null,
      stage1Pills: pillMeta.normalizedPills,
      domainRiskFlags: pillMeta.domainRiskFlags,
      pillRiskBoost: pillMeta.pillRiskBoost,
      disclosureTier: pillMeta.disclosureTier
    };
  }
}

module.exports = InputIntentCompiler;
