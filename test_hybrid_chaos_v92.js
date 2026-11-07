'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const OmniSyncSemanticRouter = require('./omnisync_router.js');
const BottomQuarantineDrawerController = require('./ui_controller/bottom_quarantine_drawer_controller.js');
const TelemetrySyncBridge = require('./telemetry_sync_bridge_v92.js');

test('1. Low-RAM (<400MB) LMKD guard flags fallback tier cleanly', () => {
  const pyOut = execFileSync('python3', [
    path.resolve(__dirname, 'semantic_router_classifier.py'),
    '--eval-json',
    JSON.stringify({ text: 'Verify 4GB LMKD headroom.', domainRiskFlags: ['STRICT_NUMERIC_NLI'], pillRiskBoost: 0.30, freeRamMb: 280 })
  ], { encoding: 'utf8' });
  const parsed = JSON.parse(pyOut);
  assert.equal(parsed.memoryArena.lmkdSafe, false);
  assert.equal(parsed.memoryArena.recommendedTier, 'FALLBACK_1B_INT4_OR_CLOUD');
});

test('2. 100 retroactive NLI events + promoteClaim() + Wi-Fi HMAC persistence', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-chaos-'));
  try {
    const drawer = new BottomQuarantineDrawerController();
    const bridge = new TelemetrySyncBridge({ syncOptions: { storagePath: tmpDir, hmacKey: 'chaos-test-hmac-key-32-bytes-minimum!' } });
    bridge.attachDrawer(drawer);

    for (let i = 0; i < 100; i++) {
      const acuId = `ACU-CHAOS-${i}`;
      const isContra = i % 4 === 0;
      const isLowEntail = i % 10 === 1;
      drawer.onAcuStreamed({ acuId, text: `Chaos claim #${i}`, executionTier: 'LOCAL_EDGE', auditState: 'PENDING_AUDIT' });
      drawer.handleRetroactiveNliEvent({
        acuId, pContra: isContra ? 0.72 : 0.03, pNeutral: isLowEntail ? 0.25 : 0.04,
        pEntail: isContra ? 0.24 : (isLowEntail ? 0.72 : 0.93), vetoTripped: isContra, latencyMs: 12
      });
    }

    assert.equal(drawer.getSnapshot().drawerBadgeCount, 35);
    assert.equal(drawer.getSnapshot().verifiedCoreCount, 65);
    assert.equal(drawer.promoteClaim('ACU-CHAOS-0'), true);
    assert.equal(drawer.getSnapshot().drawerBadgeCount, 34);

    const cellular = await bridge.syncIfWifi({ isOnline: true, isWifiConnected: false });
    assert.equal(cellular.deferred, true);
    assert.equal(cellular.reason, 'CELLULAR_ONLY_WIFI_REQUIRED');

    const wifi = await bridge.syncIfWifi({ isOnline: true, isWifiConnected: true });
    assert.equal(wifi.deferred, false);
    assert.equal(wifi.syncedCount, 101);
    assert.equal(bridge.syncQueue.verifyQueueIntegrity().ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('3. OmniSync pill-aware router routes PII/security pills locally with async NLI', async () => {
  const router = new OmniSyncSemanticRouter();
  const events = [];
  const route = await router.executeHybridPipeline(
    'Spawning 500 child_process workers is unsafe on 4GB LMKD.',
    ['domain:security', 'privacy:pii'],
    { onAcuStreamed: e => events.push({ stage: 'stream', ...e }), onAcuNliResolved: e => events.push({ stage: 'nli', ...e }) }
  );
  assert.equal(route.executionTier, 'LOCAL_EDGE');
  assert.equal(events.length, 2);
  assert.equal(events[1].vetoTripped, true);
});
