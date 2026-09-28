// Remove the route types earlier builds left in each Next dist folder (.next,
// .next-test, .next-e2e). tsconfig includes all of them, so after a route
// moves, a build in one folder type-checks another's stale copy and fails on
// code that is fine. Each build regenerates its own.

import { readdirSync, rmSync } from "node:fs";

for (const dir of readdirSync(".").filter(d => d.startsWith(".next"))) {
  rmSync(`${dir}/types`, { recursive: true, force: true });
  rmSync(`${dir}/dev/types`, { recursive: true, force: true });
}
