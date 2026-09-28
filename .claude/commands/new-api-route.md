# New API Route

Create a new API route for this project.

Read `docs/api.md` for the exact route pattern to follow.

Steps:
1. Decide its `access`: `"public"`, `"signed-in"`, `"customer"` or `{ staff: role }`
2. Declare it with `defineRoute()` (`lib/http/route.ts`) — it runs session → rate limit →
   role → Zod → your handler, and requires a `rateLimit`
3. Create the file at the appropriate path under `app/api/`
4. Put the database work in the `lib/db/` module for that resource, and any rule with no
   I/O in `lib/domain/`; refuse with a `DomainError`. For billboards: reads in
   `queries.ts`, writes in `mutations.ts`, shared helpers in `core.ts`, exported from
   `index.ts` so callers keep importing `@/lib/db/billboards`
5. Add a test to `test/api.test.mjs`, and the route to `docs/api.md`

Arguments: $ARGUMENTS
