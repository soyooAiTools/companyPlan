import assert from "node:assert/strict";
import test from "node:test";
import { consumePlayableFeedbackBatch } from "../ops/services/playable-feedback-outbox.mjs";

test("creates one OPS ticket per assignee and persists exact feedback sources", async () => {
  const tickets = [];
  const events = [];
  const links = [];
  const database = {
    ops_ticket_source_links: {
      findFirst: async ({ where }) => links.find((item) => item.source_system === where.source_system && item.source_assignment_id === where.source_assignment_id) || null,
    },
    $transaction: async (run) => run({
      tickets: { create: async ({ data }) => { tickets.push(data); return data; } },
      ticket_events: { create: async ({ data }) => { events.push(data); return data; } },
      ops_ticket_source_links: { create: async ({ data }) => { links.push(data); return data; } },
    }),
  };
  const notified = [];
  const result = await consumePlayableFeedbackBatch({
    requesterUserId: "7",
    projectId: "1611",
    projectVersionId: "1122",
    source: { batchId: "assign_batch_a1", reviewId: "review_1", feedbackId: "feedback_1", url: "https://preview.example/preview?tenant=test" },
    tickets: [
      { sourceAssignmentId: "assignment_1", ownerId: "10", segmentId: 0, title: "反馈 #1", summary: "按钮位置错误" },
      { sourceAssignmentId: "assignment_2", ownerId: "11", segmentId: 0, title: "反馈 #1", summary: "按钮位置错误" },
    ],
  }, {
    prisma: database,
    getUser: async () => ({ id: "7", username: "producer", name: "制片", status: "active", isAdmin: false }),
    loadSegments: async () => [{ id: 2, name: "程序" }, { id: 3, name: "UI" }],
    getFeedbackResponsibles: async () => ({
      members: [{ id: "10", name: "开发", segmentIds: [2] }, { id: "11", name: "设计", segmentIds: [3] }],
      segments: [{ id: 2, name: "程序" }, { id: 3, name: "UI" }],
    }),
    prepareTicketCreate: async ({ body }) => ({ data: { id: `ticket_${body.ownerId}`, owner_id: body.ownerId, segment_id: body.segmentId, hyperlink: body.hyperlink } }),
    notifyTicketAssigned: async (ticket) => notified.push(ticket.id),
    refreshProjectPoolSnapshot: async () => {},
  });

  assert.deepEqual(result, { created: 2, idempotent: false });
  assert.deepEqual(tickets.map((item) => item.segment_id), [2, 3]);
  assert.equal(events.length, 2);
  assert.deepEqual(links.map((item) => item.source_feedback_id), ["feedback_1", "feedback_1"]);
  assert.deepEqual(notified, ["ticket_10", "ticket_11"]);
});
