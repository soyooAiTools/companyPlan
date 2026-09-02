import assert from "node:assert/strict";
import test from "node:test";
import {
  isFeedbackAssignmentRequester,
  sourcePayloadHash,
  stableStringify,
} from "../ops/playable-feedback-integration-routes.mjs";

test("stable source payload hashing ignores object key order but not assignment content", () => {
  assert.equal(stableStringify({ b: 2, a: { d: 4, c: 3 } }), stableStringify({ a: { c: 3, d: 4 }, b: 2 }));
  assert.equal(sourcePayloadHash({ b: 2, a: 1 }), sourcePayloadHash({ a: 1, b: 2 }));
  assert.notEqual(sourcePayloadHash({ ownerId: "1" }), sourcePayloadHash({ ownerId: "2" }));
});

test("only active caller validation accepts admins or exact 制片 tag", () => {
  assert.equal(isFeedbackAssignmentRequester({ isAdmin: true, tags: [] }), true);
  assert.equal(isFeedbackAssignmentRequester({ isAdmin: false, tags: [{ name: "制片" }] }), true);
  assert.equal(isFeedbackAssignmentRequester({ isAdmin: false, tags: ["制片助理"] }), false);
  assert.equal(isFeedbackAssignmentRequester(null), false);
});
