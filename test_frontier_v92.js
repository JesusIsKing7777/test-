'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SemanticRouterBridge = require('./semantic_router_bridge.js');
const LocalFirstEventSync = require('./local_sync/event_sourcing_queue.js');

function jsBasicSplit(text) {
  const out = [];
  let cur = '';
  for (const ch of text.toLowerCase()) {
    if (/\s/.test(ch)) {
      if (cur) { out.push(cur); cur = ''; }
    } else if (!/[\p{L}\p{N}]/u.test(ch)) {
      if (cur) { out.push(cur); cur = ''; }
      out.push(ch);
    } else { cur += ch; }
  }
  if (cur) out.push(cur);
  return out;
}

test('1. Dynamic label_map.json remaps swapped entailment/neutral indices', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-lbl-'));
  try {
    const mapFile = path.join(tmpDir, 'label_map.json');
    fs.writeFileSync(mapFile, JSON.stringify({ id2label: { '0': 'contradiction', '1': 'entailment', '2': 'neutral' } }));
    const pyOut = execFileSync('python3', [
      path.resolve(__dirname, 'semantic_router_classifier.py'), '--eval-json',
      JSON.stringify({ text: 'Verify 4GB LMKD.', domainRiskFlags: ['STRICT_NUMERIC_NLI'], pillRiskBoost: 0.3, labelMapPath: mapFile })
    ], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(pyOut).labelIndices, [0, 2, 1]);
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
});

test('2. Exclusive-lock compactSyncedRecords() prunes acked lines & heals stale locks', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-cmp-'));
  try {
    const sync = new LocalFirstEventSync({ storagePath: tmpDir, lockTtlMs: 25 });
    await sync.enqueueMutation('v1', [0.1], {});
    await sync.enqueueMutation('v2', [0.2], {});
    const synced = await sync.syncWithCloudGateway({ isOnline: true, isWifiConnected: true });
    assert.equal(synced.syncedCount, 2);

    await sync.enqueueMutation('v3', [0.3], {});
    fs.mkdirSync(sync.lockDir);
    fs.writeFileSync(sync.lockEpochFile, '1', 'utf8'); // Simulated stale orphan lock

    const cmp = await sync.compactSyncedRecords();
    assert.equal(cmp.compacted, true);
    assert.equal(cmp.removedCount, 2);
    assert.equal(cmp.remainingCount, 1);
    assert.equal(fs.existsSync(sync.ackFile), false);
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
});

test('3. Persistent async Python worker pool handles 20 concurrent queries & closes cleanly', async () => {
  const bridge = new SemanticRouterBridge({ poolSize: 2 });
  try {
    const calls = Array.from({ length: 20 }, (_, i) => bridge.evaluateIntentAsync({
      canonical_proposition_query: i % 2 === 0 ? 'Brainstorm dark mode themes.' : '500 child_process workers unsafe on LMKD.',
      domainRiskFlags: i % 2 === 0 ? [] : ['HIGH_STAKES_SECURITY'],
      pillRiskBoost: i % 2 === 0 ? 0 : 0.45
    }));
    const results = await Promise.all(calls);
    assert.equal(results.length, 20);
    assert.equal(results[1].vetoTripped, true);
  } finally { await bridge.shutdown(); }
});

test('4. 20-prompt WordPiece BasicTokenizer parity vectors match JS/Swift split rules', () => {
  const vectors = require('./models/tokenizer_parity_vectors.json');
  assert.equal(vectors.length, 20);
  for (const row of vectors) {
    assert.deepEqual(jsBasicSplit(row.text), row.basicTokens, `Mismatch on prompt ${row.id}`);
  }
});
