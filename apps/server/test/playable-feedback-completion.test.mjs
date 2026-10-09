import assert from "node:assert/strict";
import test from "node:test";
import { assertPlayableFeedbackTicketCompletion } from "../ops/playable-feedback-completion.mjs";

const ticket = { id: "ticket-1", project_version_id: "307" };

test("feedback ticket cannot complete until every source review record is verified", async () => {
  const loadSource = async (_database, ticketId) => ({ reviewId: ticketId === "ticket-1" ? "review-1" : "" });
  const loadVerificationStatus = async (reviewId, targetVersionId) => {
    assert.equal(reviewId, "review-1");
    assert.equal(targetVersionId, "307");
    return { complete: false, feedbackCount: 4, pendingCount: 2 };
  };

  await assert.rejects(
    () => assertPlayableFeedbackTicketCompletion(ticket, { database: {}, loadSource, loadVerificationStatus }),
    { message: /该版本还有 2 条反馈未完成校验/ },
  );

  const result = await assertPlayableFeedbackTicketCompletion(ticket, {
    database: {},
    loadSource,
    loadVerificationStatus: async () => ({ complete: true, feedbackCount: 4, pendingCount: 0 }),
  });
  assert.equal(result.complete, true);
});
