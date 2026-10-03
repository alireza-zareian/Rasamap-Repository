// Numbers as a Persian reader sees them (lib/format.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { faApprox, faCompact } from "../../lib/format.ts";

test("an estimate keeps its ~ in front of the number inside right-to-left text", () => {
  // Without the isolate the bidi algorithm drew "~۱۸K" as "۱۸K~" in an RTL line.
  const s = faApprox(faCompact(18_000));
  assert.equal(s, "⁦~۱۸K⁩");
  assert.ok(s.startsWith("⁦") && s.endsWith("⁩"), "opens and closes one LTR isolate");
});
