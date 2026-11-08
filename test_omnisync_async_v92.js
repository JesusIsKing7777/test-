'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const OmniSyncSemanticRouter = require('./omnisync_router.js');

test('1. executeHybridPipeline streams immediately then resolves via persistent worker', async () => {
  const router = new OmniSyncSemanticRouter({ keepAlive: true });
  const timeline = [];
  try {
    const route = await router.executeHybridPipeline(
      'Spawning 500 child_process workers is unsafe on 4GB LMKD.',
      ['domain:security', 'privacy:pii'],
      {
        onAcuStreamed: e => timeline.push({ stage: 'stream', auditState: e.auditState }),
        onAcuNliResolved: e => timeline.push({ stage: 'nli', vetoTripped: e.vetoTripped, backend: e.inferenceBackend })
      }
    );
    assert.equal(route.executionTier, 'LOCAL_EDGE');
    assert.equal(timeline.length, 2);
    assert.equal(timeline[0].stage, 'stream');
    assert.equal(timeline[0].auditState, 'PENDING_AUDIT');
    assert.equal(timeline[1].stage, 'nli');
    assert.equal(timeline[1].vetoTripped, true);
  } finally {
    await router.shutdown();
  }
});

test('2. Clarification gate pauses short ambiguous prompts before spawning workers', async () => {
  const router = new OmniSyncSemanticRouter();
  const res = await router.executeHybridPipeline('Check', []);
  assert.equal(res.executionTier, 'CLARIFICATION_GATE');
});
