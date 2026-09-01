#!/usr/bin/env sh
# Online SQLite backup — safe to run while the app is up.
#
#   npm run db:backup                 # backs up ./dev.db -> ./backups/
#   sh scripts/backup-db.sh path.db   # explicit source
#   BACKUP_DIR=/mnt/backups npm run db:backup
#
# Keeps the 10 most recent backups. Restore procedure: see RUNBOOK.md.

set -eu

DB="${1:-./dev.db}"
OUT_DIR="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP:-10}"

if [ ! -f "$DB" ]; then
  echo "backup-db: source database not found: $DB" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BASE="$(basename "$DB")"
BASE="${BASE%.db}"
DEST="$OUT_DIR/${BASE}-${STAMP}.db"

# .backup is an online, consistent copy (handles WAL correctly).
sqlite3 "$DB" ".backup '$DEST'"
echo "backup written: $DEST ($(wc -c < "$DEST" | tr -d ' ') bytes)"

# Prune old backups, newest kept.
# shellcheck disable=SC2012
ls -1t "$OUT_DIR/${BASE}-"*.db 2>/dev/null | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do
  rm -f "$old"
  echo "pruned: $old"
done

echo "retained $(ls -1 "$OUT_DIR/${BASE}-"*.db 2>/dev/null | wc -l | tr -d ' ') backup(s) in $OUT_DIR"
