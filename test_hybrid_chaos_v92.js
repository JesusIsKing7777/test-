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
const LocalFirstEventSync = require('./local_sync/event_sourcing_queue.js');

test('1. Low-RAM (<400MB) LMKD guard flags fallback tier cleanly', () => {
  const pyOut = execFileSync('python3', [
    path.resolve(__dirname, 'semantic_router_classifier.py'), '--eval-json',
    JSON.stringify({ text: 'Verify 4GB LMKD.', domainRiskFlags: ['STRICT_NUMERIC_NLI'], pillRiskBoost: 0.30, freeRamMb: 280 })
  ], { encoding: 'utf8' });
  const parsed = JSON.parse(pyOut);
  assert.equal(parsed.memoryArena.lmkdSafe, false);
  assert.equal(parsed.memoryArena.recommendedTier, 'FALLBACK_1B_INT4_OR_CLOUD');
});

test('2. 100 NLI events + promoteClaim() + append-only Wi-Fi ack cursor', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-chaos-'));
  try {
    const drawer = new BottomQuarantineDrawerController();
    const bridge = new TelemetrySyncBridge({ syncOptions: { storagePath: tmpDir, hmacKey: 'chaos-hmac-32-bytes-minimum-key!' } });
    bridge.attachDrawer(drawer);

    for (let i = 0; i < 100; i++) {
      const acuId = `ACU-CHAOS-${i}`, isContra = i % 4 === 0, isLow = i % 10 === 1;
      drawer.onAcuStreamed({ acuId, text: `Chaos claim #${i}`, executionTier: 'LOCAL_EDGE', auditState: 'PENDING_AUDIT' });
      drawer.handleRetroactiveNliEvent({
        acuId, pContra: isContra ? 0.72 : 0.03, pNeutral: isLow ? 0.25 : 0.04,
        pEntail: isContra ? 0.24 : (isLow ? 0.72 : 0.93), vetoTripped: isContra, latencyMs: 12
      });
    }
    assert.equal(drawer.promoteClaim('ACU-CHAOS-0'), true);
    assert.equal(drawer.getSnapshot().drawerBadgeCount, 34);

    const cell = await bridge.syncIfWifi({ isOnline: true, isWifiConnected: false });
    assert.equal(cell.deferred, true);

    const wifi1 = await bridge.syncIfWifi({ isOnline: true, isWifiConnected: true });
    assert.equal(wifi1.syncedCount, 101);
    assert.equal(fs.existsSync(bridge.syncQueue.ackFile), true);

    const wifi2 = await bridge.syncIfWifi({ isOnline: true, isWifiConnected: true });
    assert.equal(wifi2.syncedCount, 0);
    assert.equal(wifi2.reason, 'ALL_RECORDS_SYNCED');
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
});

test('3. OmniSync pill-aware router routes PII/security pills locally', async () => {
  const router = new OmniSyncSemanticRouter();
  const events = [];
  const route = await router.executeHybridPipeline(
    'Spawning 500 child_process workers is unsafe on 4GB LMKD.', ['domain:security', 'privacy:pii'],
    { onAcuStreamed: e => events.push(e), onAcuNliResolved: e => events.push(e) }
  );
  assert.equal(route.executionTier, 'LOCAL_EDGE');
  assert.equal(events[1].vetoTripped, true);
});

test('4. Corrupted-HMAC record aborts Wi-Fi sync fail-closed without ack write', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-corrupt-'));
  try {
    const sync = new LocalFirstEventSync({ storagePath: tmpDir, hmacKey: 'fault-test-hmac-key-32-bytes-min' });
    await sync.enqueueMutation('v1', [0.1, 0.2], { ok: true });
    fs.appendFileSync(sync.queueFile, JSON.stringify({ payload: '{"tampered":true}', hmac: '0'.repeat(64) }) + '\n');

    const check = sync.verifyQueueIntegrity();
    assert.equal(check.ok, false);
    assert.equal(check.corrupted, 1);

    await assert.rejects(() => sync.syncWithCloudGateway({ isOnline: true, isWifiConnected: true }), /HMAC integrity check failed/);
    assert.equal(fs.existsSync(sync.ackFile), false);
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
});
