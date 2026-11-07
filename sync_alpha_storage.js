const fs = require('fs');
const path = require('path');

const alphaDir = path.join(__dirname, 'alpha');
if (!fs.existsSync(alphaDir)) {
  fs.mkdirSync(alphaDir, { recursive: true });
}

console.log("[Alpha Up2date] Storage Engine Synced Successfully.");
