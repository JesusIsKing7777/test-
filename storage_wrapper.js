'use strict';
const path = require('node:path');
const fs = require('node:fs');

function resolveStoragePath(customPath) {
  const rawPath = customPath || process.env.ALPHA_STORAGE_PATH || process.cwd();
  return path.resolve(rawPath);
}

module.exports = { resolveStoragePath };
