#!/data/data/com.termux/files/usr/bin/bash
set -e

WORKSPACE="$HOME/alpha"
STORAGE_DIR="/sdcard/Alpha Up2date"
TELEMETRY_DIR="$WORKSPACE/telemetry check"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="alpha_backup_${TIMESTAMP}.tar.gz"
BACKUP_PATH="$HOME/$BACKUP_NAME"

echo "================================================================================"
echo "[Script Alpha v7.0] Initializing Automated Workspace Backup..."
echo "================================================================================"

# Ensure target storage and telemetry directories exist
mkdir -p "$STORAGE_DIR"
mkdir -p "$TELEMETRY_DIR"

# Step A: Create compressed archive of workspace (excluding node_modules if present)
echo "[1/4] Packaging ~/alpha workspace into $BACKUP_NAME..."
tar --exclude='node_modules' -czf "$BACKUP_PATH" -C "$HOME" alpha

# Step B: Compute SHA-256 Checksum
echo "[2/4] Generating SHA-256 checksum..."
CHECKSUM=$(sha256sum "$BACKUP_PATH" | awk '{print $1}')
echo "$CHECKSUM  $BACKUP_NAME" > "$BACKUP_PATH.sha256"

# Step C: Record TVP Telemetry Log Entry
echo "[3/4] Updating TVP audit log..."
node -e "
const fs = require('fs');
const path = require('path');
const logFile = path.join('$TELEMETRY_DIR', 'audit_log.json');
const entry = {
  timestamp: new Date().toISOString(),
  event: 'AUTOMATED_BACKUP_CREATED',
  backupFile: '$BACKUP_NAME',
  sha256: '$CHECKSUM',
  engine: 'Script Alpha v7.0 & Dataverse v5.1',
  status: 'SUCCESS'
};
let logs = [];
if (fs.existsSync(logFile)) {
  try { logs = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch(e) {}
}
logs.push(entry);
fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
console.log('[TVP Log] Backup entry recorded in audit_log.json');
"

# Step D: Sync Backup and SHA-256 to Sovereign Storage
echo "[4/4] Syncing archive to internal storage ($STORAGE_DIR)..."
cp "$BACKUP_PATH" "$STORAGE_DIR/"
cp "$BACKUP_PATH.sha256" "$STORAGE_DIR/"

echo "================================================================================"
echo "[BACKUP COMPLETE]: Successfully exported $BACKUP_NAME to $STORAGE_DIR"
echo "SHA-256 Digest: $CHECKSUM"
echo "================================================================================"
