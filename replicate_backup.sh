#!/usr/bin/env bash
set -e
BACKUP_DIR="$HOME/alpha_backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
tar -czf "$BACKUP_DIR/alpha_snapshot_$TIMESTAMP.tar.gz" -C "$HOME/alpha" dataverse_audit.jsonl dataverse_wal.jsonl archive/ 2>/dev/null || true
echo "[SUCCESS] Local backup archive created: alpha_snapshot_$TIMESTAMP.tar.gz"
# Optional rsync replication to remote destination (uncomment and configure when ready)
# rsync -avz "$BACKUP_DIR/" user@remote-backup-server:/path/to/remote/backups/
