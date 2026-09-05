<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Rasamap — Agent Constraints

Six hard rules. Follow them without exception on every task, every file, every PR.

---

**1. DB reads go through the ORM — never through static files**

```
✅  import { getAllBillboards, getFilteredBillboards } from "@/lib/db/billboards";
✅  import type { Billboard } from "@/lib/types";   // types + typeLabels, data-free
❌  import { everyBillboard, allBillboards, scrapedBillboards } from "@/lib/data";
```

`lib/data.ts` is a TypeScript constant file (static + scraped arrays + a 4 MB JSON import). It cannot receive DB writes and always serves stale data. Any API route or server function that reads from it instead of Prisma is silently serving old records — and any client/page import of it ships the entire dataset into the browser bundle. It is imported **only** by `prisma/seed.ts`. Everything else takes types from `lib/types.ts`.

---

**2. Admin route order is fixed and non-negotiable**

```
session check  →  rate limit  →  Zod  →  business logic
```

Out of order = security hole. A rate-limit check before auth lets unauthenticated callers exhaust the bucket. Zod before rate-limit lets attackers send oversized payloads for free. Never reorder.

---

**3. Zod `.safeParse()` only — no raw parse, no raw JSON.parse**

```
✅  const result = Schema.safeParse(body);   if (!result.success) return 400;
❌  const data = Schema.parse(body);          // throws, uncaught = 500
❌  const data = JSON.parse(req.body);        // no validation = injection surface
```

`.parse()` throws on bad input and will produce an unhandled 500. `JSON.parse(userInput)` bypasses all validation. Zod's `.safeParse()` does both parsing and validation in one step.

---

**4. Every user-visible string must be in Persian**

```
✅  return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
❌  return NextResponse.json({ error: "Unauthorized" },        { status: 401 });
```

Applies to: API error payloads, toast messages, button labels, status badges, empty-state text, modal copy. English is allowed only in: code identifiers, log messages (`console.error`), and developer-only comments.

---

**5. Styling is inline `style={{}}` — no Tailwind classes in JSX**

```
✅  <div style={{ display: "flex", gap: 12, borderRadius: 8 }}>
❌  <div className="flex gap-3 rounded-lg">
```

Tailwind v4 is present only for CSS custom properties (declared in `globals.css`). Adding utility classes silently breaks the design system because the purge config doesn't cover component files.

---

**7. Implement only what was explicitly asked — nothing more**

```
❌  Task: "add a search box" → you add search box + autocomplete + recent history + keyboard shortcuts
✅  Task: "add a search box" → you add exactly a search box, then stop
```

Before writing code, state in one sentence what you will change. If you spot a related improvement, **mention it in text** but do not implement it unless the user says yes. This rule exists because scope creep in a thesis codebase creates bugs and breaks the roadmap timeline.

---

**6. Roadmap HTML must be updated after every completed task**

After finishing any task — bug fix, feature, refactor — open `docs/roadmap.html` and:
- Completed sub-task: `class="task todo-t"` → `class="task done-t"`, empty tick → `✓`
- Completed phase card: badge to `✓ انجام شد`, add `<div class="proof">` with what was verified
- Footer date: update to today in Jalali calendar

Skipping this means the roadmap drifts from reality and the next agent starts with wrong context.

---

**8. Reviewer-facing reports must carry the architecture explanation**

Any HTML report / slide / summary you produce for the thesis reviewers must include the
"two data paths" explanation and the restaurant/kitchen analogy from `docs/architecture.md`
(adapted to the report's tone). "Why doesn't every page call the API?" is the first
question a Next.js app draws in a defense. Never present the Server-Component-reads-the-DB
path as a shortcut or a gap — it is the framework's recommended pattern and the faster choice.

---

**9. Never infer a property of the *connection* from the environment you built in**

This project is opened from more than one machine. The demo is served with `npm run demo`
on a laptop and browsed **from a phone on the same Wi-Fi at `http://<lan-ip>:3000`** — a
reviewer scans a QR code and connects from their own device. Later it goes on a real
domain over HTTPS. Your browser, on `localhost` over loopback, is the one environment where
every mistake in this class is invisible.

```
❌  ...(process.env.NODE_ENV === "production" ? ["Secure"] : [])   // cookie dropped over http
✅  ...(isSecureRequest(req) ? ["Secure"] : [])                     // reads x-forwarded-proto / protocol

❌  new URL(referer).host === req.nextUrl.host   // nextUrl.host is the server's bind name
✅  new URL(referer).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))

❌  await navigator.clipboard.writeText(x)       // undefined outside a secure context — throws
✅  await copyText(x)                            // lib/clipboard.ts, with an execCommand fallback

❌  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
✅  SITE_URL                                     // lib/site-url.ts — one name, one fallback
```

**`loading="lazy"` belongs only on things the user can scroll to.** On an element that
cannot enter the viewport on its own — a card in a `translateX` carousel or a CSS marquee
inside `overflow:hidden`, an `<iframe>` below the fold — the image is simply never
requested, and mobile Chrome shrinks the pre-load distance far below the desktop value, so
the laptop keeps looking fine. Keep it on vertical grids and lists; leave it off carousels,
marquees and map frames.

**Infinite CSS animations must pause with the tab.** Add the class to the
`html.page-hidden` list in `globals.css`, or a backgrounded tab keeps waking the GPU on a
fanless laptop (§22).

Before you call a change done, ask one question: **would this still work if the site were
opened from another device at `http://<lan-ip>:3000`?** Secure context, cookie flags,
origin checks, absolute URLs and anything deferred until it is "visible" all answer
differently there. Six real bugs came from this one habit — the full list and the
reasoning are in §24 of `docs/engineering-decisions.md`.

---

**9b. Run the tests with `npm test` — and never point them at `next dev`**

`npm test` builds and serves a *production* server on :3100 (into `.next-test/`),
reseeding its own `prisma/test.db`. It finishes in about 37 seconds with 113/113
passing.

It used to run `next dev`, and the failure mode is worth knowing because it looks
like a broken test suite rather than a wrong server mode: one test reads the
catalogue 120 times in a row, `next dev` recompiles on request, a single call
passed undici's 300-second header timeout, the server wedged, and the last ~20
tests failed naming code that was fine. The run took over twenty minutes and
never reached the end.

So: if the suite is slow or the tail fails, **the fix is never to switch it back
to `next dev`, and never to delete the tests that look slow.** Check that the
build step passed. Nothing in the suite waits on an external service — the SMS
layer is dormant without `KAVENEGAR_API_KEY`, so the OTP tests issue and read
their codes inside the local database and no message is ever sent. Every request
aborts after 30 seconds, so a real stall reports itself immediately.

The same rule that governs the demo governs the tests: §22 and §22b of
`docs/engineering-decisions.md`.

---

**10. Leave the code readable by a person who has never seen it**

Every change lands in a file someone else will open cold — a reviewer, an
examiner, the author six months from now. A patch that works but leaves the file
harder to read than it found it has not finished.

- **One way to do a thing, not four.** Before hand-rolling a response, a guard,
  a label or a date format, look for the helper that already exists
  (`rateLimited`, `serverError`, `statusLabels`, `copyText`, `SITE_URL`). Four
  spellings of the same 429 is how numbers go stale in three of them.
- **Delete what your change orphans.** An import nothing uses, a helper nothing
  calls, a constant nothing reads — remove it in the same commit that stranded
  it. `npm run lint` names them; do not ship past its warnings.
- **A hardcoded number that duplicates a real one will drift.** `"X-RateLimit-Limit": "60"`
  outlived the limit it described. Read the value, or do not send it.
- **Comments say *why*, never *what*.** The code says what. A comment earns its
  place by recording the reason, the measurement, or the bug that forced the
  shape — the things the next reader cannot recover from the code alone.
- **Match the file you are in.** Its naming, its comment density, its idiom. A
  change that reads as a graft is a change that will be misread.
- **No half-done anything.** No TODO placeholder, no dead branch, no commented
  -out alternative, no "temporary" flag. If it is not finished, it does not land.

The test: could someone who has never opened this repository read the file
top to bottom and follow it? If the honest answer is no, the change is not done.
