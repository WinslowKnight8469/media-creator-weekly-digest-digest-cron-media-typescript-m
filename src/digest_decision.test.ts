import assert from "node:assert/strict";
import test from "node:test";
import { buildDigest } from "./digest_decision.ts";

test("only processed assets for the requested creator enter the weekly digest", () => {
  const digest = buildDigest([
    { assetId: "a1", creatorId: "maya", title: "Live set", plays: 12, processed: true },
    { assetId: "a2", creatorId: "maya", title: "Encoding", plays: 30, processed: false },
    { assetId: "a3", creatorId: "other", title: "Trailer", plays: 40, processed: true }
  ], "maya");
  assert.deepEqual(digest, { creatorId: "maya", totalPlays: 12, titles: ["Live set"] });
  assert.equal(buildDigest([], "maya"), null);
});
