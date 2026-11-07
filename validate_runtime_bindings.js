'use strict';
const os = require('node:os');
const assert = require('node:assert');

function validateRuntime() {
  console.log('[RUNTIME] Inspecting environment bindings...');
  console.log(`- Platform: ${os.platform()} (${os.arch()})`);
  console.log(`- Node Version: ${process.version}`);
  
  const majorVersion = parseInt(process.version.slice(1).split('.')[0], 10);
  assert(majorVersion >= 18, 'Node.js version 18+ required.');

  const hrTime = process.hrtime.bigint();
  assert(typeof hrTime === 'bigint', 'HRTime bigint support required for TTL locks.');

  console.log('[SUCCESS] Runtime binding validation passed.');
  process.exit(0);
}

validateRuntime();
