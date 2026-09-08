#!/usr/bin/env sh
# Online database backup — safe to run while the app is up.
#
#   npm run db:backup                 # backs up whatever DATABASE_URL names
#   sh scripts/backup-db.sh path.db   # explicit SQLite source
#   BACKUP_DIR=/mnt/backups npm run db:backup
#
# Keeps the 10 most recent backups. Restore procedure: see RUNBOOK.md.
#
# Since §27 the engine can be PostgreSQL, and a backup script that quietly
# copied a SQLite file that is no longer the database would be worse than no
# backup at all — it would look like one. So the engine is read from
# DATABASE_URL, the same single source lib/db/engine.ts uses, and an
# unrecognised scheme stops the run instead of guessing.

set -eu

DB="${1:-}"

# An explicit path argument always means SQLite; otherwise follow DATABASE_URL.
if [ -z "$DB" ]; then
  URL="${DATABASE_URL:-file:./dev.db}"
  case "$URL" in
    file:*)
      DB="${URL#file:}"
      ;;
    postgres://*|postgresql://*)
      OUT_DIR="${BACKUP_DIR:-./backups}"
      KEEP="${BACKUP_KEEP:-10}"
      command -v pg_dump >/dev/null 2>&1 || {
        echo "backup-db: DATABASE_URL is PostgreSQL but pg_dump is not installed." >&2
        exit 1
      }
      mkdir -p "$OUT_DIR"
      DEST="$OUT_DIR/rasamap-$(date +%Y%m%d-%H%M%S).sql.gz"
      # --no-owner so the dump restores into a database owned by anyone.
      pg_dump --no-owner --clean --if-exists "$URL" | gzip > "$DEST"
      echo "backup written: $DEST ($(wc -c < "$DEST" | tr -d ' ') bytes)"
      # shellcheck disable=SC2012
      ls -1t "$OUT_DIR"/rasamap-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do
        rm -f "$old"
        echo "pruned: $old"
      done
      echo "retained $(ls -1 "$OUT_DIR"/rasamap-*.sql.gz 2>/dev/null | wc -l | tr -d ' ') backup(s) in $OUT_DIR"
      exit 0
      ;;
    *)
      echo "backup-db: DATABASE_URL has an unrecognised scheme. Expected file: or postgresql:." >&2
      exit 1
      ;;
  esac
fi
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
