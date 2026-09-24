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
 * Every API route is declared through `defineRoute`.
 *
 * AGENTS.md rule 2 fixes the order of a protected request —
 *
 *     session  →  rate limit  →  permission  →  Zod  →  business logic
 *
 * — and it used to be enforced by thirty-five handlers each typing it out, plus
 * a test that grepped them for the word "RateLimit". This is the order, written
 * once. A route states *what* it needs (who may call it, which limit applies,
 * the shape of its input) and the pipeline decides *when*, so a new route
 * cannot get the order wrong and a reader can see a route's whole contract in
 * the first ten lines of its file.
 *
 * What each step answers, when it refuses:
 *
 *   access      401 when signed out, 403 when signed in as the wrong kind of
 *               account (a customer on a staff route, or the reverse)
 *   rateLimit   429 via rateLimited(), with Retry-After and an audit row
 *   role        403 when a staff member's role is below the route's minimum
 *   params      400 "شناسه نامعتبر"
 *   query       400
 *   body        413 when the declared size is exceeded (checked before
 *               reading), 400 when it is not JSON or fails its schema
 *   handler     a DomainError becomes its status (see STATUS_BY_KIND); any
 *               other throw becomes a 500 with a reference id
 *
 * Every call also writes one `api_request` log line, and a response from a
 * non-public route is `Cache-Control: no-store` unless the handler said
 * otherwise — an authenticated answer has no business in a shared cache.
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
 *   IpLimiter    the usual case: a named policy from lib/rate-limit, checked
 *                right after the access check.
 *   afterBody    a limit keyed on something in the body — the account a
 *                credential form is attacking, the phone a code was sent to.
 *                The body is parsed first; these schemas cap it at a few
 *                hundred bytes, so nothing expensive happens before the check.
 *   "none"       only for signing out. Throttling it fails in the dangerous
 *                direction: someone who taps "sign out" twice would be told to
 *                wait and left signed in.
 */
type RateLimitSpec<B> =
  | IpLimiter
  | { afterBody: (body: B, ip: string) => Promise<CredentialAttempt | RateLimitResult> }
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
  body?: B;
  /** Refuse a larger request before reading it (413). */
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

/**
 * Next signals control flow by throwing: `redirect()`, `notFound()`, and the
 * DynamicServerError the build throws when a route reads request headers while
 * being probed for static rendering. Each carries a string `digest`, which is
 * the one precondition all of Next's own guards check — so the digest is the
 * stable contract, rather than importing from `next/dist/*`, which is private.
 * These must reach the framework untouched: answering one with a 500 told the
 * build a dynamic route had failed rather than that it was dynamic.
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
    if (spec.body) {
      if (spec.maxBodyBytes && Number(req.headers.get("content-length")) > spec.maxBodyBytes) {
        return fail(413, DEFAULT_MESSAGES.tooLarge);
      }
      // An empty body reaches the schema as `undefined`, so a route whose body
      // is optional says so in its schema (`.optional()`) instead of every
      // route having to tell "no body" apart from "not JSON".
      let raw: unknown;
      if (req.body !== null && req.headers.get("content-length") !== "0") {
        try {
          raw = await req.json();
        } catch {
          return fail(400, messages?.invalidBody ?? DEFAULT_MESSAGES.invalidJson);
        }
      }
      const parsed = spec.body.safeParse(raw);
      if (!parsed.success) {
        return fail(400, messages?.invalidBody ?? parsed.error.errors[0]?.message ?? DEFAULT_MESSAGES.invalidBody);
      }
      body = parsed.data;
    }

    if (typeof spec.rateLimit === "object") {
      const checked = await spec.rateLimit.afterBody(body as Parsed<B>, ip);
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
