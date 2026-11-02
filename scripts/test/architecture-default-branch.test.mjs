import assert from "node:assert/strict";
import test from "node:test";

import { selectDefaultBranchRef } from "../architecture/default-branch.mjs";

test("prefers origin/dev as the default architecture baseline", () => {
  const availableRefs = new Set(["origin/dev", "origin/main"]);

  const selected = selectDefaultBranchRef({
    originHead: "origin/main",
    hasCommit: (ref) => availableRefs.has(ref),
  });

  assert.equal(selected, "origin/dev");
});
