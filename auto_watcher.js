const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const targetDir = '/sdcard/Alpha Up2date';
const telemetryDir = path.join(srcDir, 'telemetry check');
const logFile = path.join(telemetryDir, 'audit_log.json');

if (!fs.existsSync(telemetryDir)) {
  fs.mkdirSync(telemetryDir, { recursive: true });
}

function writeAuditLog(event, filename) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    filename,
    engine: "Script Alpha & Dataverse v5.0",
    status: "SECURE"
  };
  try {
    let logs = [];
    if (fs.existsSync(logFile)) {
      logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    }
    logs.push(logEntry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('[Audit Error]:', err.message);
  }
}

console.log('[Script Alpha v5.0] Hardened Daemon with JSON Telemetry Running...');

fs.watch(srcDir, (eventType, filename) => {
  if (filename && eventType === 'rename' && filename !== 'auto_watcher.js' && filename !== 'telemetry check') {
    const filePath = path.join(srcDir, filename);
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const destPath = path.join(targetDir, filename);
          fs.copyFile(filePath, destPath, (err) => {
            if (!err) {
              console.log('[Auto-Exported & Indexed]:', filename);
              writeAuditLog('FILE_EXPORT_SUCCESS', filename);
            } else {
              writeAuditLog('FILE_EXPORT_ERROR', filename);
            }
          });
        }
      } catch (e) {
        // Suppress transient lock errors
      }
    }, 150);
  }
});
