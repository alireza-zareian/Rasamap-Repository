// Shared 500 handling for API route handlers: log the real error (with a stack
// and a short reference id), return a generic Persian message + the same id so
// a user can quote it. Internals never reach the response body.

import { NextResponse } from "next/server";
import { logger, newErrorRef } from "./logger";

export function serverError(
  where: string,
  err: unknown,
  fields: Record<string, unknown> = {},
): NextResponse {
  const ref = newErrorRef();
  logger.error(`${where} failed`, {
    ref,
    ...fields,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return NextResponse.json(
    {
      error: "خطای غیرمنتظره‌ای رخ داد. اگر تکرار شد، این کد را به پشتیبانی بدهید.",
      ref,
    },
    { status: 500 },
  );
}
