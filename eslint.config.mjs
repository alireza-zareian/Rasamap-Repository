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
    // The test suite's own build output (test/run.mjs sets distDir to this).
    ".next-test/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party bundles shipped beside the HTML docs so they open offline.
    // Linting a 3 MB minified file is pointless and exhausts the Node heap.
    "docs/vendor/**",
  ]),
]);

export default eslintConfig;
