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
✅  import type { Billboard } from "@/lib/types";   // types + typeLabels/typeIcons, data-free
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
