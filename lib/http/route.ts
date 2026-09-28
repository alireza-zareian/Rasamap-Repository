import "server-only";
import "./zod-messages";
import { NextResponse, type NextRequest } from "next/server";
import type { z, ZodTypeAny } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { getActor, type Actor, type CustomerActor, type StaffActor } from "@/lib/auth/actor";
import { recordAudit, type AuditAction, type AuditEntry } from "@/lib/audit";
import { DomainError, type DomainErrorKind } from "@/lib/domain/errors";
import { hasRole, type StaffRole } from "@/lib/domain/roles";
import type { CredentialAttempt, RateLimitResult } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { rateLimited, serverError } from "./responses";

/**
 * Every API route is declared through `defineRoute`, which runs the order
 * AGENTS.md rule 2 requires, written once:
 *
 *     session  →  rate limit  →  role  →  Zod  →  business logic
 *
 * A route states what it needs; the pipeline decides when. What each step
 * answers when it refuses:
 *
 *   access      401 when signed out, 403 when signed in as the wrong kind of
 *               account (a customer on a staff route, or the reverse)
 *   rateLimit   429 via rateLimited(), with Retry-After and an audit row
 *   role        403 when a staff member's role is below the route's minimum
 *   params      400 "شناسه نامعتبر"
 *   query       400
 *   body        413 past the route's size (32 KB unless it declares more),
 *               counted while reading; 400 when it is not JSON or fails its
 *               schema
 *   form        the same for a multipart/form-data body — the one that
 *               carries files. A route declares `body` or `form`, not both.
 *   handler     a DomainError becomes its status (STATUS_BY_KIND); any other
 *               throw becomes a 500 with a reference id
 *
 * Every call writes one `api_request` log line. A non-public route's response
 * is `Cache-Control: no-store` unless the handler set its own.
 */

export type Access =
  | "public"
  | "signed-in"
  | "customer"
  | { staff: StaffRole };

type ActorFor<A extends Access> =
  A extends "public"    ? null :
  A extends "customer"  ? CustomerActor :
  A extends "signed-in" ? Actor :
  StaffActor;

type Parsed<S> = S extends ZodTypeAny ? z.output<S> : undefined;

type IpLimiter = (ip: string) => Promise<RateLimitResult>;

/**
 * How a route is rate limited.
 *
 *   IpLimiter    a named policy from lib/rate-limit, checked right after access.
 *   afterBody    a limit keyed on the body (the account a sign-in targets, the
 *                phone a code went to). The body is read first, so the body
 *                size cap is what bounds the work before the check.
 *   "none"       sign-out only: throttling it would leave someone signed in.
 */
type RateLimitSpec<B> =
  | IpLimiter
  | { afterBody: (body: B, ip: string, req: NextRequest) => Promise<CredentialAttempt | RateLimitResult> }
  | "none";

export interface RouteSpec<
  A extends Access,
  P extends ZodTypeAny | undefined,
  Q extends ZodTypeAny | undefined,
  B extends ZodTypeAny | undefined,
> {
  /** Route name for logs and audit rows, e.g. "admin/leads/[id]". */
  name: string;
  access: A;
  rateLimit: RateLimitSpec<Parsed<B>>;
  params?: P;
  query?: Q;
  /** A JSON body. */
  body?: B;
  /**
   * A multipart/form-data body instead of JSON. Each field reaches the schema
   * as a string or a File, and a field sent more than once as an array of them
   * (see `many` in lib/http/form.ts).
   */
  form?: B;
  /** Refuse a larger body (413). Defaults to DEFAULT_MAX_BODY_BYTES. */
  maxBodyBytes?: number;
  /** Replaces the default refusals for this route. */
  messages?: {
    signedOut?: string;
    forbidden?: string;
    invalidQuery?: string;
    invalidBody?: string;
  };
  /** Off only for a route polled so often its log lines would bury the rest. */
  log?: boolean;
}

export interface RouteContext<A extends Access, P, Q, B> {
  req: NextRequest;
  ip: string;
  userAgent: string | null;
  actor: ActorFor<A>;
  params: P;
  query: Q;
  body: B;
  /** A second, input-keyed limit inside the handler (e.g. per phone number). */
  tooMany(rl: RateLimitResult): NextResponse;
  /** recordAudit() with this request's actor, address and user agent filled in. */
  audit(action: AuditAction, opts?: { severity?: AuditEntry["severity"]; details?: Record<string, unknown> }): Promise<void>;
}

type NextHandler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  invalid:         400,
  unauthenticated: 401,
  forbidden:       403,
  not_found:       404,
  conflict:        409,
};

const DEFAULT_MESSAGES = {
  signedOut:    "احراز هویت لازم است",
  forbidden:    "دسترسی کافی ندارید",
  invalidId:    "شناسه نامعتبر",
  invalidQuery: "پارامترهای نامعتبر",
  invalidJson:  "درخواست نامعتبر",
  invalidBody:  "اطلاعات نامعتبر",
  tooLarge:     "حجم درخواست بیش از حد مجاز است",
};

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** The body cap for a route that declares none. The largest non-upload body is a few KB. */
const DEFAULT_MAX_BODY_BYTES = 32 * 1024;

const TOO_LARGE = Symbol("too-large");

/**
 * The request body, refused once it passes `max` bytes. Counted while reading,
 * because a chunked request has no Content-Length. Body-keyed limits run after
 * this, so it is what stops an anonymous caller sending an unbounded payload.
 */
async function readBodyCapped(req: NextRequest, max: number): Promise<Buffer | typeof TOO_LARGE> {
  if (Number(req.headers.get("content-length")) > max) return TOO_LARGE;
  if (!req.body) return Buffer.alloc(0);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * A multipart body as a plain object: one value per field, an array when a
 * field repeats. Parsed from bytes already counted, so the cap applies first.
 */
async function parseForm(bytes: Buffer, contentType: string): Promise<Record<string, unknown> | null> {
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return null;
  let fd: FormData;
  try {
    fd = await new Response(new Uint8Array(bytes), { headers: { "content-type": contentType } }).formData();
  } catch {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    const all = fd.getAll(key);
    out[key] = all.length === 1 ? all[0] : all;
  }
  return out;
}

/**
 * Next signals control flow by throwing (`redirect()`, `notFound()`, the build's
 * DynamicServerError), each with a string `digest`. They must reach the
 * framework untouched; a 500 in their place told the build a dynamic route had
 * failed. The digest is checked rather than importing Next's private classes.
 */
function isFrameworkSignal(err: unknown): boolean {
  return typeof err === "object" && err !== null && typeof (err as { digest?: unknown }).digest === "string";
}

/** Which kind of account `access` admits, and the refusal for anyone else. */
function checkAccess(access: Access, actor: Actor | null, messages: RouteSpec<Access, undefined, undefined, undefined>["messages"]): NextResponse | null {
  if (access === "public") return null;
  const signedOut = messages?.signedOut ?? DEFAULT_MESSAGES.signedOut;
  if (!actor) return fail(401, signedOut);
  if (access === "signed-in") return null;

  const wanted = access === "customer" ? "customer" : "staff";
  if (actor.kind !== wanted) {
    return fail(403, messages?.forbidden ?? (wanted === "customer"
      ? "این کار فقط با حساب کاربری مشتری ممکن است"
      : DEFAULT_MESSAGES.forbidden));
  }
  return null;
}

export function defineRoute<
  A extends Access,
  P extends ZodTypeAny | undefined = undefined,
  Q extends ZodTypeAny | undefined = undefined,
  B extends ZodTypeAny | undefined = undefined,
>(
  spec: RouteSpec<A, P, Q, B>,
  handler: (ctx: RouteContext<A, Parsed<P>, Parsed<Q>, Parsed<B>>) => Promise<Response>,
): NextHandler {
  const messages = spec.messages;

  const run = async (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    // 1. Who is asking.
    const actor = spec.access === "public" ? null : await getActor();
    const denied = checkAccess(spec.access, actor, messages);
    if (denied) return denied;

    // 2. How fast.
    if (typeof spec.rateLimit === "function") {
      const rl = await spec.rateLimit(ip);
      if (!rl.allowed) return rateLimited(rl, { endpoint: spec.name, ip, actor });
    }

    // 3. With what authority.
    if (typeof spec.access === "object" && actor?.kind === "staff" && !hasRole(actor.role, spec.access.staff)) {
      return fail(403, messages?.forbidden ?? DEFAULT_MESSAGES.forbidden);
    }

    // 4. With what input.
    let params: unknown;
    if (spec.params) {
      const parsed = spec.params.safeParse(await routeCtx.params);
      if (!parsed.success) return fail(400, DEFAULT_MESSAGES.invalidId);
      params = parsed.data;
    }

    let query: unknown;
    if (spec.query) {
      const parsed = spec.query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
      if (!parsed.success) return fail(400, messages?.invalidQuery ?? DEFAULT_MESSAGES.invalidQuery);
      query = parsed.data;
    }

    let body: unknown;
    const bodySchema = spec.body ?? spec.form;
    if (bodySchema) {
      const bytes = await readBodyCapped(req, spec.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
      if (bytes === TOO_LARGE) return fail(413, DEFAULT_MESSAGES.tooLarge);
      let raw: unknown;
      if (spec.form) {
        raw = await parseForm(bytes, req.headers.get("content-type") ?? "");
        if (raw === null) return fail(400, messages?.invalidBody ?? DEFAULT_MESSAGES.invalidJson);
      } else if (bytes.length > 0) {
        // An empty body reaches the schema as `undefined`; an optional body
        // says so with `.optional()`.
        try {
          // Straight into the schema below — never used unvalidated.
          raw = JSON.parse(bytes.toString("utf8"));
        } catch {
          return fail(400, messages?.invalidBody ?? DEFAULT_MESSAGES.invalidJson);
        }
      }
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return fail(400, messages?.invalidBody ?? parsed.error.errors[0]?.message ?? DEFAULT_MESSAGES.invalidBody);
      }
      body = parsed.data;
    }

    if (typeof spec.rateLimit === "object") {
      const checked = await spec.rateLimit.afterBody(body as Parsed<B>, ip, req);
      const attempt = "result" in checked ? checked : { result: checked, limitedBy: null };
      if (!attempt.result.allowed) {
        return rateLimited(attempt.result, { endpoint: spec.name, ip, actor, limitedBy: attempt.limitedBy });
      }
    }

    // 5. What it asked for.
    const ctx: RouteContext<A, Parsed<P>, Parsed<Q>, Parsed<B>> = {
      req, ip, userAgent,
      actor: actor as ActorFor<A>,
      params: params as Parsed<P>,
      query: query as Parsed<Q>,
      body: body as Parsed<B>,
      tooMany: rl => rateLimited(rl, { endpoint: spec.name, ip, actor }),
      audit: (action, opts = {}) => recordAudit(action, { actor, ip, userAgent, ...opts }),
    };

    try {
      const res = await handler(ctx);
      if (spec.access !== "public" && !res.headers.has("Cache-Control")) {
        res.headers.set("Cache-Control", "no-store");
      }
      return res;
    } catch (err) {
      if (err instanceof DomainError) return fail(STATUS_BY_KIND[err.kind], err.message);
      throw err;
    }
  };

  return async (req, routeCtx) => {
    const start = performance.now();
    let status = 0;
    try {
      const res = await run(req, routeCtx);
      status = res.status;
      return res;
    } catch (err) {
      if (isFrameworkSignal(err)) throw err;
      status = 500;
      return serverError(`${req.method} /api/${spec.name}`, err);
    } finally {
      if (spec.log !== false) {
        logger.info("api_request", {
          route: spec.name,
          method: req.method,
          path: req.nextUrl.pathname,
          status,
          ms: Math.round(performance.now() - start),
        });
      }
    }
  };
}
