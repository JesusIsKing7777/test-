#!/usr/bin/env bash
set -e
BACKUP_SCRIPT="$HOME/alpha/replicate_backup.sh"
CRON_RULE="0 2 * * * $BACKUP_SCRIPT >> $HOME/alpha/backup.log 2>&1"

if ! crontab -l 2>/dev/null | grep -Fq "$BACKUP_SCRIPT"; then
  (crontab -l 2>/dev/null; echo "$CRON_RULE") | crontab -
  echo "[SUCCESS] Nightly cron backup replication scheduled for 02:00 AM."
else
  echo "[NOTE] Cron replication rule already exists."
fi
