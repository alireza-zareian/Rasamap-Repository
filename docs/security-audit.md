# Dependency security audit

Run `npm audit` and review this file monthly, and before every release.

Lockfile: `package-lock.json` is committed and pins exact versions, so every
machine installs the same tree.

## 2026-09-01

`npm audit` — **10 advisories (1 moderate, 9 high)**. None are on the request
path; all are build-time or in a feature this project does not use.

| Package | Severity | What | Reachable here? | Action |
|---|---|---|---|---|
| `postcss` (via `@tailwindcss/postcss` and `next`) | moderate/high | `sourceMappingURL` path traversal — a crafted CSS comment can make PostCSS read an arbitrary `.map` file during a build | Build-time only. We author our own CSS; no untrusted CSS is processed. | **Deferred.** Fix requires `next@16.3.4` (outside the pinned `16.2.9`). Not worth a framework bump days before the presentation. Revisit right after. |
| `sharp` `<0.35.0` (via `next`) | high | Inherited libvips CVEs (image decoding) | Not used — the app has no `next/image` usage; images are plain `<img>`. `sharp` is pulled in transitively but never invoked. | **Deferred.** Same fix (`next@16.3.4`). Re-evaluate together with the `next/image` migration (STATUS.md P5). |

### Decision

Do **not** run `npm audit fix --force` before the presentation: it upgrades
Next.js past the pinned version and risks regressions in a working demo. Both
issues are non-exploitable in this deployment (no build server exposed to
untrusted input, no `next/image`). Plan: bump Next.js and re-audit in the first
post-presentation maintenance pass.

### How to re-check

```bash
npm audit               # summary
npm audit --json        # full detail
npm outdated            # what could be updated
```
