// ============================================================
// RASAMAP — structured logger
//
// One JSON object per line on stdout/stderr (searchable, ready for a log
// collector). When LOG_DIR is set, the same lines are also appended to a
// size-rotated file. No dependencies — Node stdlib only.
//
// Never pass secrets or PII here: log `userId`, never a phone number, name,
// token, password, or request body. Callers are responsible for that.
// ============================================================

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

/**
 * Short, human-quotable reference id. Printed to the user on an unexpected
 * error and logged alongside the stack trace so the two can be correlated.
 */
export function newErrorRef(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
