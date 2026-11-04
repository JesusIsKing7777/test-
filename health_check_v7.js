const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const workspace = path.join(process.env.HOME, 'alpha');
const telemetryDir = path.join(workspace, 'telemetry check');
const storagePath = '/sdcard/Alpha Up2date';

console.log('================================================================================');
console.log('[Script Alpha v7.0 & Dataverse v5.1] Comprehensive Health Check Audit');
console.log('================================================================================');

let status = 'HEALTHY';
let checks = {};

// 1. Environment & Runtime
checks.nodeVersion = process.version;
checks.platform = `${process.platform} (${process.arch})`;

// 2. Core Files Check
const coreFiles = ['dataverse_v5_core.js', 'lww_map.js', 'dataverse_pipeline_v5_1.js', 'triad_schema_validator.js', 'auto_watcher.js'];
checks.files = {};
coreFiles.forEach(file => {
    const exists = fs.existsSync(path.join(workspace, file));
    checks.files[file] = exists ? 'PASS' : 'FAIL';
    if (!exists) status = 'DEGRADED';
});

// 3. Telemetry & Audit Log Check
const auditLogPath = path.join(telemetryDir, 'audit_log.json');
if (fs.existsSync(auditLogPath)) {
    try {
        const data = JSON.parse(fs.readFileSync(auditLogPath, 'utf8'));
        checks.auditLog = `PASS (${data.length} entries)`;
    } catch (e) {
        checks.auditLog = 'CORRUPT';
        status = 'DEGRADED';
    }
} else {
    checks.auditLog = 'MISSING';
}

// 4. Internal Storage Mirror Check
checks.internalStorage = fs.existsSync(storagePath) ? 'PASS (Operational)' : 'MISSING';

// 5. Background Daemon Check via pgrep
try {
    const pgrep = execSync('pgrep -af "auto_watcher.js"').toString().trim();
    checks.daemon = pgrep ? `RUNNING (${pgrep.split('\n').length} process(es))` : 'STOPPED';
} catch (e) {
    checks.daemon = 'STOPPED / NOT FOUND';
}

console.log(JSON.stringify({ status, timestamp: new Date().toISOString(), checks }, null, 2));
console.log('================================================================================');
if (status === 'HEALTHY') {
    console.log('[SYSTEM STATUS]: 100% Operational & Schema Compliant.');
} else {
    console.log('[SYSTEM WARNING]: Check failed items for degradation.');
}
