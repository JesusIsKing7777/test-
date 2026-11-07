'use strict';
/**
 * NODE.JS IPC BRIDGE FOR PYTHON NLI CROSS-ENCODER WORKER
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

class NliIpcBridge {
  constructor(pythonScriptPath) {
    this.scriptPath = pythonScriptPath;
    this.child = null;
  }

  start() {
    this.child = spawn('python3', [this.scriptPath]);
    this.child.stderr.on('data', data => {
      console.error(`[NLI PYTHON STDERR]: ${data}`);
    });
  }

  async evaluateClaim(acuText, corpusText) {
    return new Promise((resolve, reject) => {
      if (!this.child) {
        return reject(new Error('NLI worker subprocess not running.'));
      }

      const payload = JSON.stringify({ acu: acuText, corpus: corpusText }) + '\n';
      
      let responseData = '';
      const onData = data => {
        responseData += data.toString();
        if (responseData.includes('\n')) {
          this.child.stdout.removeListener('data', onData);
          try {
            const result = JSON.parse(responseData.trim());
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to parse NLI response: ${responseData}`));
          }
        }
      };

      this.child.stdout.on('data', onData);
      this.child.stdin.write(payload);
    });
  }

  stop() {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}

async function runBridgeTest() {
  console.log('[BRIDGE] Initializing Python NLI worker bridge...');
  const bridge = new NliIpcBridge(path.join(process.cwd(), 'acu_nli_streaming_worker.py'));
  bridge.start();

  // Test valid claim
  const res1 = await bridge.evaluateClaim("Valid HMAC-SHA256 chained records.", "Valid HMAC-SHA256 chained records.");
  console.log('[TEST 1 RESULT]:', res1);

  // Test contradictory claim
  const res2 = await bridge.evaluateClaim("Audit chain verification failed due to corrupted data.", "Valid HMAC-SHA256 chained records.");
  console.log('[TEST 2 RESULT]:', res2);

  bridge.stop();
  console.log('[SUCCESS] NLI IPC bridge test completed.');
}

if (require.main === module) {
  runBridgeTest().catch(err => {
    console.error('[ERROR] Bridge test failed:', err);
    process.exit(2);
  });
}

module.exports = NliIpcBridge;
