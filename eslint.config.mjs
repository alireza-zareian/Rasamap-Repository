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
    // The test runners' own build output.
    ".next-test/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored bundles for the offline HTML docs; a 3 MB minified file exhausts the heap.
    "docs/vendor/**",
  ]),
  // ── Architecture boundaries (AGENTS.md rule 1), enforced ──────────────────
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
    // lib/domain: rules with no I/O, unit-tested on their own.
    files: ["lib/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/lib/*", "@prisma/*", "next", "next/*", "react", "node:*"], message: "lib/domain has no I/O and depends on nothing but zod." }],
      }],
    },
  },
  {
    // Next loads the cache handler with require.resolve(), so it must be CommonJS.
    files: ["cache-handler.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
