// One JSON object per line on stdout/stderr, and in a size-rotated
// LOG_DIR/app.log when LOG_DIR is set.
//
// Never pass secrets or personal data: an id, never a phone, name, token,
// password or request body.

import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

type Level = "debug" | "info" | "warn" | "error";
const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_RANK =
  RANK[(process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === "production" ? "info" : "debug")] ?? 20;

const LOG_DIR = process.env.LOG_DIR ?? "";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // rotate app.log past 10 MB
const MAX_BACKUPS = 5;

if (LOG_DIR) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    /* fall back to stdout only */
  }
}

function rotateIfNeeded(file: string) {
  try {
    if (statSync(file).size < MAX_FILE_BYTES) return;
  } catch {
    return; // no file yet
  }
  try {
    for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
      try {
        renameSync(`${file}.${i}`, `${file}.${i + 1}`);
      } catch {
        /* that backup doesn't exist */
      }
    }
    renameSync(file, `${file}.1`);
  } catch {
    /* keep writing to the current file rather than lose the line */
  }
}

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (RANK[level] < MIN_RANK) return;

  const line =
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields }) + "\n";

  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line);

  if (LOG_DIR) {
    const file = join(LOG_DIR, "app.log");
    rotateIfNeeded(file);
    try {
      appendFileSync(file, line);
    } catch {
      /* stdout already has it */
    }
  }
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};

/** A short id a user can quote, logged beside the stack trace. Not unique — only enough to find the line. */
export function newErrorRef(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
