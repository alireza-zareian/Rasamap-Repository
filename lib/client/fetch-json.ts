/**
 * Every browser call to the app's own API. Each has a timeout: a `fetch` that
 * never answers (a stalled mobile link) never returns, and a form's button
 * would stay on "در حال ارسال…" for good. Failures arrive as a Persian sentence
 * ready to show.
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
 * `read` for the small JSON calls. `upload` for photo forms: five photos over a
 * slow mobile link can take most of a minute.
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
  /**
   * The caller's own cancel, for a request a newer one has made pointless (a
   * filter changed again). Aborting rejects with an error isAborted() recognises.
   */
  signal?: AbortSignal;
}

/** Whether a fetchJson rejection was the caller's own abort: not a failure to show. */
export function isAborted(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Parsed JSON, or a FetchError whose `message` is a Persian sentence to show. */
export async function fetchJson<T = unknown>(url: string, options: Options = {}): Promise<T> {
  const { timeoutMs = TIMEOUT_MS.read, signal, ...init } = options;
  const timeout = AbortSignal.timeout(timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (err) {
    if (signal?.aborted) throw signal.reason;
    // A timeout (slow server) and a network failure get different sentences.
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
    // The API's own Persian `error` (lib/http/responses.ts) is preferred.
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
