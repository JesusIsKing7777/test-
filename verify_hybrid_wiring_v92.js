'use strict';
const OmniSyncSemanticRouter = require('./omnisync_router.js');
const BottomQuarantineDrawerController = require('./ui_controller/bottom_quarantine_drawer_controller.js');

async function verifyWiring() {
  const router = new OmniSyncSemanticRouter();
  const drawer = new BottomQuarantineDrawerController();

  drawer.on('ui_state_changed', ({ eventType, acuId, snapshot }) => {
    console.log(`[UI_EVENT] ${eventType} (${acuId || 'drawer'}) -> Core=${snapshot.verifiedCoreCount}, DrawerBadge=${snapshot.drawerBadgeCount}, Expanded=${snapshot.isDrawerExpanded}`);
  });

  // Test 1: Creative pill (3b) -> FAST_STREAM_BYPASS_NLI
  await router.executeHybridPipeline(
    'Brainstorm three calm dark-mode palette ideas for mobile UI.',
    ['mode:creative'],
    {
      onAcuStreamed: evt => drawer.onAcuStreamed(evt),
      onAcuNliResolved: evt => drawer.handleRetroactiveNliEvent(evt)
    }
  );

  // Test 2: Health/security pill + unsafe 500 child_process claim -> STREAM_PLUS_ASYNC_NLI -> Retroactive Slide to 4a Drawer
  await router.executeHybridPipeline(
    'Spawning 500 child_process workers with a 3B model is safe on 4GB LMKD.',
    ['domain:security', 'verify:numeric'],
    {
      onAcuStreamed: evt => drawer.onAcuStreamed(evt),
      onAcuNliResolved: evt => drawer.handleRetroactiveNliEvent(evt)
    }
  );

  console.log('\n[FINAL_UI_SNAPSHOT]', JSON.stringify(drawer.getSnapshot(), null, 2));
}

verifyWiring().catch(err => {
  console.error(err);
  process.exit(1);
});
