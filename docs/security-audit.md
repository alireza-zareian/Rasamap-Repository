# Dependency security audit

Run `npm audit` and review this file monthly, and before every release.

Lockfile: `package-lock.json` is committed and pins exact versions, so every
machine installs the same tree.

## 2026-09-02

Bumped **`next` 16.2.9 → 16.2.11** (a patch inside the pinned minor). That
release closes **10 Next.js advisories** whose range was `>=16.0.0 <16.2.11`,
including one that matters here:

| Advisory | Severity | Relevance |
|---|---|---|
| Middleware / Proxy bypass in App Router (Turbopack, single locale) | high | **Directly relevant** — Rasamap is App Router + single locale + Turbopack, and `proxy.ts` is the auth boundary. Fixed by the bump. |
| Unauthenticated disclosure of internal Server Function endpoints | moderate | Fixed. |
| SSRF in rewrites via attacker-controlled destination | high | We have no rewrites; fixed anyway. |
| DoS in Server Actions / unbounded Server Action payload / cache confusion on bodies / image-optimization SVG DoS | mixed | Mostly not on our paths; fixed anyway. |

`tsc`, `npm run lint` (0 errors), `npm run build`, `npm test` (27/27) all pass
on 16.2.11.

### Remaining after the bump — 12 advisories, none exploitable here

All are transitive dependencies of build/dev tooling or of a feature the app
does not use. None are reachable from user input at runtime.

| Package | Via | Why it does not apply |
|---|---|---|
| `postcss` (`<=8.5.22`) | `@tailwindcss/postcss`, `next` | Build-time CSS processing. We author our own CSS; no untrusted CSS is ever processed. |
| `sharp` (`<0.35.0`) | `next` | Image optimization. The app has **no `next/image` usage** — images are plain `<img>`. `sharp` is installed transitively but never invoked. |
| `mysql2` (`<3.22.0`) | `prisma` (`@prisma/config` optional driver) | SQLite project. The MySQL driver is never loaded. |
| `nanoid`, `brace-expansion`, `browserslist`, `js-yaml`, `deepmerge-ts` | `next`, `prisma`, build tooling | Dev/build-time only (glob matching, browserslist, YAML/config parsing). Not on the request path. |

Clearing these needs `next@16.3.x` (a minor bump) or `overrides` entries. Both
carry regression risk for a working demo and none of the issues are
exploitable in this deployment, so they are **deferred to the first
post-presentation maintenance pass**, together with the `next/image` migration.

### Do not run `npm audit fix --force`

It pulls `next@16.3.4` (outside the pinned minor) — a framework bump this close
to the presentation. Bump deliberately, then re-audit.

### How to re-check

```bash
npm audit               # summary
npm audit --json        # full detail
npm outdated            # what could be updated
```
