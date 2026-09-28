# Security Check

Review the security posture of a specific API route or component.

Check for:
1. A route not declared with `defineRoute()`, or with the wrong `access`
2. Object-level authorisation: does `lib/db/` check the actor owns the row it touches?
3. Missing Zod validation on inputs
4. Sort/filter values not checked against allowlists
5. `JSON.parse(userInput)` anywhere
6. User enumeration risk in auth responses — in the text and in the timing
7. A rate limit keyed only on the address where an account key is possible
8. Any `eval`, `dangerouslySetInnerHTML`, or XSS vectors in client components
9. A property of the connection read from the build (rule 9 in `AGENTS.md`)
10. A field a client component or error body does not need (rule 12)

Label each finding verified (you broke it) or suspected (you read it).

Read `docs/api.md` for expected patterns.

Target: $ARGUMENTS (if empty, check all files under `app/api/`)
