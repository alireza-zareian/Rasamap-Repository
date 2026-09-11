/**
 * The browser's side of every call this app makes to its own API.
 *
 * There were thirty-nine `fetch` calls in client code and not one carried a
 * timeout. That is not a theoretical gap: `await fetch()` on a request that
 * never answers — a stalled mobile connection, a busy server, a tunnel that
 * dropped — simply does not return. The `setSubmitting(false)` after it never
 * runs, so the button stays on "در حال ارسال…" forever, with no error and no
 * way back except reloading, which on a form risks sending the whole thing
 * twice. §5 of the project's rules asks for a timeout, a bounded retry where
 * safe, and a defined fallback on every outbound call; this is where the first
 * and third live.
 *
 * The only place that already had one was lib/sms.ts, which is server-side —
 * so the pattern was known and simply never reached the client.
 */

/** A failed call, already carrying the sentence to show the user. */
export class FetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Whatever the API sent back, when it sent JSON at all. */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

/**
 * How long to wait before giving up.
 *
 * `read` covers the small JSON calls — a listing, a review, a phone reveal.
 * Ten seconds is far past a working request and well short of a person
 * deciding the site is broken.
 *
 * `upload` is deliberately several times that. A listing carries up to five
 * photographs, and two megabytes over a slow mobile connection legitimately
 * takes most of a minute — cutting that off would *be* the bug this module
 * exists to prevent, just with a different message.
 */
export const TIMEOUT_MS = {
  read: 10_000,
  upload: 90_000,
} as const;

const NETWORK_ERROR = "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.";
const TIMEOUT_ERROR = "پاسخی از سرور نرسید. لطفاً دوباره تلاش کنید.";
const PARSE_ERROR   = "پاسخ سرور قابل خواندن نبود.";

interface Options extends Omit<RequestInit, "signal"> {
  /** Milliseconds before the request is abandoned. Defaults to TIMEOUT_MS.read. */
  timeoutMs?: number;
}

/**
 * Call the API and get parsed JSON back, or throw a FetchError whose `message`
 * is already a Persian sentence fit to show the user.
 *
 * Callers therefore never build their own wording for a network failure, which
 * is how four spellings of "خطای شبکه" appeared in the first place.
 */
export async function fetchJson<T = unknown>(url: string, options: Options = {}): Promise<T> {
  const { timeoutMs = TIMEOUT_MS.read, ...init } = options;

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    // TimeoutError is what AbortSignal.timeout raises; anything else reaching
    // here is the network being unavailable rather than the server being slow,
    // and the two deserve different sentences.
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    throw new FetchError(timedOut ? TIMEOUT_ERROR : NETWORK_ERROR, 0);
  }

  // 204 and an empty body are legitimate answers; neither is JSON.
  const text = await res.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw new FetchError(PARSE_ERROR, res.status);
    }
  }

  if (!res.ok) {
    // The API answers failures with a Persian `error` (see lib/api-error.ts), so
    // the server's own wording is preferred over anything invented here.
    const fromApi = (body as { error?: unknown } | undefined)?.error;
    throw new FetchError(
      typeof fromApi === "string" && fromApi ? fromApi : "خطایی رخ داد. لطفاً دوباره تلاش کنید.",
      res.status,
      body,
    );
  }

  return body as T;
}

/** The user-facing sentence for any error, including ones thrown elsewhere. */
export function errorMessage(err: unknown): string {
  if (err instanceof FetchError) return err.message;
  return "خطایی رخ داد. لطفاً دوباره تلاش کنید.";
}
