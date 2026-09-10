import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  createPlayableFeedbackServiceAuth,
  createPlayableFeedbackSignature,
} from "../middleware/playable-feedback-service-auth.mjs";
import { registerPlayableFeedbackIntegrationRoutes } from "../ops/playable-feedback-integration-routes.mjs";
import { getFeedbackResponsibles } from "../ops/ops-realtime.mjs";
import { prepareTicketCreate } from "../ops/ops-routes.mjs";
import { soyooClient } from "../ops/soyoo-client.mjs";

function createFakeDatabase({ staleSourceLinkClient = false } = {}) {
  const tickets = [];
  const sourceLinks = [];
  const ticketEvents = [];
  const tx = {
    tickets: {
      async create({ data }) {
        const ticket = { ...data };
        tickets.push(ticket);
        return ticket;
      },
    },
    ticket_events: {
      async create({ data }) {
        ticketEvents.push({ ...data });
        return data;
      },
    },
    async $executeRawUnsafe(_sql, ...values) {
      const [
        source_system,
        source_batch_id,
        source_assignment_id,
        source_review_id,
        source_review_number,
        source_feedback_id,
        ticket_id,
        payload_sha256,
        source_url,
        created_at,
      ] = values;
      sourceLinks.push({
        source_system,
        source_batch_id,
        source_assignment_id,
        source_review_id,
        source_review_number,
        source_feedback_id,
        ticket_id,
        payload_sha256,
        source_url,
        created_at,
      });
      return 1;
    },
  };
  if (!staleSourceLinkClient) {
    tx.ops_ticket_source_links = {
      async create({ data }) {
        sourceLinks.push({ ...data });
        return data;
      },
    };
  }
  const database = {
    tickets: {
      async findMany({ where }) {
        const ids = new Set(where.id.in);
        return tickets.filter((item) => ids.has(item.id));
      },
    },
    async $queryRawUnsafe(_sql, sourceSystem, ...assignmentIds) {
      const ids = new Set(assignmentIds);
      return sourceLinks.filter((item) => item.source_system === sourceSystem && ids.has(item.source_assignment_id));
    },
    async $transaction(callback) {
      return callback(tx);
    },
    state: { tickets, sourceLinks, ticketEvents },
  };
  if (!staleSourceLinkClient) {
    database.ops_ticket_source_links = {
      async findMany({ where }) {
        const ids = new Set(where.source_assignment_id.in);
        return sourceLinks.filter((item) => item.source_system === where.source_system && ids.has(item.source_assignment_id));
      },
    };
  }
  return database;
}

async function startIntegrationServer({ staleSourceLinkClient = false, realMemberPolicy = false } = {}) {
  const secret = "route-e2e-shared-secret";
  const database = createFakeDatabase({ staleSourceLinkClient });
  database.ops_segments = { findUnique: async ({ where }) => ({
    2: { id: 2, name: "程序", default_delivery_hours: 24, risk_warning_hours: 4 },
    3: { id: 3, name: "动画", default_delivery_hours: 16, risk_warning_hours: 3 },
  })[where.id] || null };
  database.ops_segment_tags = { findMany: async () => [{ tag_id: 12 }] };
  const notifications = [];
  const responsibleCalls = [];
  const preparedTicketBodies = [];
  let nextTicket = 1;
  const app = express();
  app.use(express.json({
    verify: (request, _response, buffer) => {
      request.rawBody = Buffer.from(buffer);
    },
  }));
  registerPlayableFeedbackIntegrationRoutes(app, {
    requireServiceAuth: createPlayableFeedbackServiceAuth({
      serviceId: "helper-e2e",
      sharedSecret: secret,
      maxClockSkewSeconds: 60,
    }),
    dependencies: {
      prisma: database,
      loadSegments: async () => [
        { id: 2, name: "程序", defaultDeliveryHours: 24, riskWarningHours: 4, tags: [{ id: "programmer", name: "程序" }] },
        { id: 3, name: "动画", defaultDeliveryHours: 16, riskWarningHours: 3, tags: [{ id: "animator", name: "动画" }] },
      ],
      getResponsibles: async (projectRef) => {
        responsibleCalls.push(projectRef);
        if (realMemberPolicy) return getFeedbackResponsibles(projectRef, [{ id: 2, name: "程序", tags: [{ id: "12", name: "程序" }] }]);
        return {
          segments: [{ id: 2, name: "程序", defaultDeliveryHours: 24, riskWarningHours: 4, members: [{ id: "8", name: "开发李四", wechatAvatar: "avatar.png" }] }],
          members: [
            { id: "8", name: "开发李四", segmentIds: [2, 3] },
            { id: "9", name: "动画王五", segmentIds: [3, 2] },
          ],
        };
      },
      getUser: async () => ({ id: "7", username: "producer", name: "制片张三", status: "active", isAdmin: false, tags: [{ name: "制片" }] }),
      prepareTicketCreate: async ({ body, feedbackAssignment, user }) => {
        assert.equal(feedbackAssignment, true);
        preparedTicketBodies.push(body);
        if (realMemberPolicy) return prepareTicketCreate({ body, feedbackAssignment, user, database });
        return {
          data: {
            id: `ticket-${nextTicket++}`,
            owner_id: body.ownerId,
            status: "排队中",
            updated_at: "2026-09-03T02:00:00.000Z",
            status_updated_at: "2026-09-03T02:00:00.000Z",
          },
        };
      },
      notifyTicketAssigned: async (ticket) => notifications.push(ticket.id),
      refreshProjectPoolSnapshot: async () => {},
    },
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  return {
    server,
    secret,
    database,
    notifications,
    responsibleCalls,
    preparedTicketBodies,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

let nonceCounter = 0;

async function signedRequest(runtime, path, { method = "GET", body, signature = "" } = {}) {
  nonceCounter += 1;
  const timestamp = String(Date.now());
  const nonce = `route-e2e-${String(nonceCounter).padStart(8, "0")}`;
  const rawBody = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const headers = {
    "X-Playable-Service": "helper-e2e",
    "X-Playable-Timestamp": timestamp,
    "X-Playable-Nonce": nonce,
    "X-Playable-Signature": signature || createPlayableFeedbackSignature({ timestamp, nonce, rawBody, secret: runtime.secret }),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${runtime.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : rawBody,
  });
}

test("real member policy: signed nick assignment persists, notifies and replays once, without changing roles", async (t) => {
  const members = [
    { user_id: 9, username: "nick", user_status: "active", tags: [{ id: 13, name: "管理员" }] },
    { user_id: 8, username: "developer", user_status: "active", tags: [{ id: 12, name: "程序" }] },
    { user_id: 11, username: "disabled", user_status: "disabled", tags: [] },
  ];
  t.mock.method(soyooClient, "projectMembers", async (ref) => {
    assert.equal(ref, "1074::version-109");
    return { project: { id: 1074, name: "112A" }, members };
  });
  t.mock.method(soyooClient, "user", async () => ({ id: 7, username: "producer", tags: [{ name: "制片" }] }));
  t.mock.method(soyooClient, "tags", async () => [{ id: 12, name: "程序" }]);
  const runtime = await startIntegrationServer({ realMemberPolicy: true });
  t.after(() => new Promise(resolve => runtime.server.close(resolve)));
  const candidates = await signedRequest(runtime, "/api/internal/playable-feedback/projects/1074/responsibles?versionId=109");
  const choices = await candidates.json();
  assert.equal(choices.assignmentMode, "project-members");
  assert.deepEqual(choices.members.map(member => member.id), ["9", "8"]);
  assert.deepEqual(choices.members[0].segmentIds, []);
  const payload = {
    requesterUserId: "7", projectId: "1074", projectVersionId: "109",
    source: { batchId: "nick-batch", reviewId: "nick-review", feedbackId: "f1", url: "https://preview.example/feedback/nick-review" },
    tickets: [{ sourceAssignmentId: "nick-assignment", ownerId: "9", segmentId: 2, dueInHours: 8, title: "反馈修订", summary: "调整音效" }],
  };
  const created = await signedRequest(runtime, "/api/internal/playable-feedback/tickets/batch", { method: "POST", body: payload });
  assert.equal(created.status, 201, JSON.stringify(await created.json()));
  assert.equal(runtime.database.state.tickets[0].owner_username, "nick");
  assert.equal(runtime.database.state.tickets[0].project_version_id, "109");
  assert.equal(runtime.database.state.tickets[0].due_in_hours, 8);
  assert.equal(runtime.database.state.tickets[0].tag_name, "程序");
  assert.equal(runtime.notifications.length, 1);
  assert.equal((await signedRequest(runtime, "/api/internal/playable-feedback/tickets/batch", { method: "POST", body: payload })).status, 200);
  assert.equal(runtime.database.state.tickets.length, 1);
  for (const ownerId of ["999", "11"]) {
    const invalid = { ...payload, tickets: [{ ...payload.tickets[0], sourceAssignmentId: `invalid-${ownerId}`, ownerId }] };
    const rejected = await signedRequest(runtime, "/api/internal/playable-feedback/tickets/batch", { method: "POST", body: invalid });
    assert.equal(rejected.status, 400);
  }
  assert.equal(runtime.database.state.tickets.length, 1);
  assert.equal(runtime.notifications.length, 1);
  assert.deepEqual(members[0].tags, [{ id: 13, name: "管理员" }]);
});

test("signed feedback assignment route loads candidates, creates one ticket per person, and is idempotent", async (t) => {
  const runtime = await startIntegrationServer();
  t.after(() => new Promise((resolve) => runtime.server.close(resolve)));

  const optionsResponse = await signedRequest(runtime, "/api/internal/playable-feedback/projects/10/responsibles?versionId=20");
  assert.equal(optionsResponse.status, 200);
  const options = await optionsResponse.json();
  assert.equal(options.segments[0].members[0].name, "开发李四");
  assert.equal(options.segments[0].defaultDeliveryHours, 24);
  assert.deepEqual(runtime.responsibleCalls, ["10::version-20"]);

  const payload = {
    requesterUserId: "7",
    projectId: "10",
    projectVersionId: "20",
    source: { batchId: "batch-1", reviewId: "review-1", reviewNumber: 15, feedbackId: "feedback-1", url: "https://preview.example/review-1" },
    tickets: [
      { sourceAssignmentId: "assignment-1", ownerId: "8", segmentId: 0, title: "反馈 #1", contentHtml: "<p>按钮偏移</p>", summary: "按钮偏移", priority: "优先", needType: "试玩反馈", dueInHours: 18 },
      { sourceAssignmentId: "assignment-2", ownerId: "9", segmentId: 0, title: "反馈 #1", contentHtml: "<p>按钮偏移</p>", summary: "按钮偏移", priority: "优先", needType: "试玩反馈", dueInHours: 18 },
    ],
  };
  const createResponse = await signedRequest(runtime, "/api/internal/playable-feedback/tickets/batch", { method: "POST", body: payload });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.assignments.length, 2);
  assert.equal(runtime.database.state.tickets.length, 2);
  assert.equal(runtime.database.state.sourceLinks.length, 2);
  assert.deepEqual(runtime.database.state.sourceLinks.map((link) => link.source_review_number), [15, 15]);
  assert.equal(runtime.database.state.ticketEvents.length, 2);
  assert.deepEqual(runtime.notifications, ["ticket-1", "ticket-2"]);
  assert.deepEqual(runtime.preparedTicketBodies.map((body) => body.dueInHours), [18, 18]);
  assert.deepEqual(runtime.preparedTicketBodies.map((body) => body.segmentId), [2, 3]);
  assert.deepEqual(runtime.responsibleCalls, ["10::version-20", "10::version-20"]);

  const replayResponse = await signedRequest(runtime, "/api/internal/playable-feedback/tickets/batch", { method: "POST", body: payload });
  assert.equal(replayResponse.status, 200);
  const replay = await replayResponse.json();
  assert.equal(replay.idempotent, true);
  assert.equal(runtime.database.state.tickets.length, 2);

  const conflictingPayload = {
    ...payload,
    tickets: payload.tickets.map((ticket, index) => index === 0 ? { ...ticket, summary: "幂等内容发生变化" } : ticket),
  };
  const conflictResponse = await signedRequest(runtime, "/api/internal/playable-feedback/tickets/batch", {
    method: "POST",
    body: conflictingPayload,
  });
  assert.equal(conflictResponse.status, 409);
  assert.equal(runtime.database.state.tickets.length, 2);

  const statusResponse = await signedRequest(runtime, "/api/internal/playable-feedback/tickets/status", {
    method: "POST",
    body: { assignmentIds: ["assignment-1", "assignment-2"] },
  });
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).assignments.length, 2);
});

test("accepts one person-level ticket containing several consolidated feedback items", async (t) => {
  const runtime = await startIntegrationServer();
  t.after(() => new Promise((resolve) => runtime.server.close(resolve)));

  const contentHtml = "<p><strong>本工单共包含 3 条反馈</strong></p><p>反馈 #1：按钮偏移</p><p>反馈 #2：音效延迟</p><p>反馈 #3：结束页缺失</p>";
  const payload = {
    requesterUserId: "7",
    projectId: "10",
    projectVersionId: "20",
    source: {
      batchId: "batch-grouped",
      reviewId: "review-grouped",
      feedbackId: "feedback-1",
      feedbackIds: ["feedback-1", "feedback-2", "feedback-3"],
      url: "https://preview.example/review-grouped",
    },
    tickets: [{
      sourceAssignmentId: "assignment-grouped-8",
      ownerId: "8",
      segmentId: 2,
      title: "3 条反馈 · 试玩项目",
      contentHtml,
      summary: "#1 按钮偏移；#2 音效延迟；#3 结束页缺失",
      priority: "优先",
      needType: "试玩反馈",
      dueInHours: 12,
    }],
  };

  const response = await signedRequest(runtime, "/api/internal/playable-feedback/tickets/batch", { method: "POST", body: payload });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).assignments.length, 1);
  assert.equal(runtime.database.state.tickets.length, 1);
  assert.equal(runtime.preparedTicketBodies.length, 1);
  assert.equal(runtime.preparedTicketBodies[0].dueInHours, 12);
  assert.equal(runtime.preparedTicketBodies[0].contentHtml, contentHtml);
});

test("feedback assignment route rejects an invalid service signature", async (t) => {
  const runtime = await startIntegrationServer();
  t.after(() => new Promise((resolve) => runtime.server.close(resolve)));
  const response = await signedRequest(runtime, "/api/internal/playable-feedback/projects/10/responsibles", { signature: "sha256=invalid" });
  assert.equal(response.status, 401);
  assert.equal(runtime.responsibleCalls.length, 0);
});

test("feedback assignment remains usable with a stale Prisma Client", async (t) => {
  const runtime = await startIntegrationServer({ staleSourceLinkClient: true });
  t.after(() => new Promise((resolve) => runtime.server.close(resolve)));

  const payload = {
    requesterUserId: "7",
    projectId: "10",
    projectVersionId: "20",
    source: { batchId: "batch-stale", reviewId: "review-stale", feedbackId: "feedback-stale", url: "https://preview.example/review-stale" },
    tickets: [
      { sourceAssignmentId: "assignment-stale", ownerId: "8", segmentId: 2, title: "反馈 #2", contentHtml: "<p>修正动效</p>", summary: "修正动效", priority: "普通", needType: "试玩反馈" },
    ],
  };

  const createResponse = await signedRequest(runtime, "/api/internal/playable-feedback/tickets/batch", { method: "POST", body: payload });
  assert.equal(createResponse.status, 201);
  assert.equal((await createResponse.json()).assignments[0].ticketId, "ticket-1");
  assert.equal(runtime.database.state.sourceLinks.length, 1);

  const replayResponse = await signedRequest(runtime, "/api/internal/playable-feedback/tickets/batch", { method: "POST", body: payload });
  assert.equal(replayResponse.status, 200);
  assert.equal((await replayResponse.json()).idempotent, true);
  assert.equal(runtime.database.state.tickets.length, 1);
});
