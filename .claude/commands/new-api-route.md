# New API Route

Create a new API route for this project.

Read `docs/api-patterns.md` for the exact route pattern to follow.

Steps:
1. Determine if this is a public, user-auth, or admin route
2. Use the correct template from docs/api-patterns.md (session check → rate limit → Zod → business logic)
3. Create the file at the appropriate path under `app/api/`
4. For DB queries, add a helper to `lib/db/billboards.ts` if needed
5. Update `proxy.ts` if the route needs auth guarding at the proxy level

Arguments: $ARGUMENTS
