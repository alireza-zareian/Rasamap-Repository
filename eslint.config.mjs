import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // The test suites' own build output (test/run.mjs and test/run-e2e.mjs set
    // distDir to these).
    ".next-test/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party bundles shipped beside the HTML docs so they open offline.
    // Linting a 3 MB minified file is pointless and exhausts the Node heap.
    "docs/vendor/**",
  ]),
  // ── Architecture boundaries ────────────────────────────────────────────────
  // These were rules in AGENTS.md that only a careful reader obeyed. Written
  // here, the next import that crosses one fails `npm run lint`.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "proxy.ts", "instrumentation.ts"],
    ignores: ["lib/db/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@/lib/db/client",
            message: "Only lib/db/ talks to the database. Call a function from lib/db/* instead (AGENTS.md rule 1).",
          },
          {
            name: "@prisma/client",
            allowTypeImports: true,
            message: "Only lib/db/ talks to the database. Types may be imported with `import type`.",
          },
          {
            name: "@/lib/data",
            message: "lib/data.ts is the seed dataset (4 MB) — importing it ships it to the browser. Read through lib/db/* (AGENTS.md rule 1).",
          },
        ],
        patterns: [
          {
            group: ["@/lib/db/billboards/*"],
            message: "Import from @/lib/db/billboards — the folder, not a file inside it (AGENTS.md rule 1).",
          },
        ],
      }],
    },
  },
  {
    // lib/domain is the rules of the product with no I/O — so it can be read
    // and unit-tested on its own. A database or framework import here would
    // quietly end that.
    files: ["lib/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/lib/*", "@prisma/*", "next", "next/*", "react", "node:*"], message: "lib/domain has no I/O and depends on nothing but zod." }],
      }],
    },
  },
  {
    // Next.js loads the cache handler with require.resolve() at runtime, so it
    // has to be CommonJS — see the shape in next/dist/docs .../self-hosting.md.
    // The rule is right everywhere else in this repo; this file is the one
    // place the framework dictates the module system.
    files: ["cache-handler.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
