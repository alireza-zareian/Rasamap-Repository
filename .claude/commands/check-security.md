# Security Check

Review the security posture of a specific API route or component.

Check for:
1. Missing session/auth check
2. Missing Zod validation on inputs
3. Sort/filter values not checked against allowlists
4. `JSON.parse(userInput)` anywhere
5. User enumeration risk in auth responses
6. Missing rate limit on auth endpoints
7. Any `eval`, `innerHTML`, or XSS vectors in client components

Read `docs/api.md` for expected patterns.

Target: $ARGUMENTS (if empty, check all files under `app/api/`)
