import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  createPlayableFeedbackServiceAuth,
  createPlayableFeedbackSignature,
} from "../middleware/playable-feedback-service-auth.mjs";
import { registerPlayableFeedbackIntegrationRoutes } from "../ops/playable-feedback-integration-routes.mjs";

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

async function startIntegrationServer({ staleSourceLinkClient = false } = {}) {
  const secret = "route-e2e-shared-secret";
  const database = createFakeDatabase({ staleSourceLinkClient });
  const notifications = [];
  const responsibleCalls = [];
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
      loadSegments: async () => [{ id: 2, name: "程序", tags: [{ id: "programmer", name: "程序" }] }],
      getResponsibles: async (projectRef) => {
        responsibleCalls.push(projectRef);
        return {
          segments: [{ id: 2, name: "程序", members: [{ id: "8", name: "开发李四", wechatAvatar: "avatar.png" }] }],
          members: [{ id: "8", name: "开发李四", segmentIds: [2] }],
        };
      },
      getUser: async () => ({ id: "7", username: "producer", name: "制片张三", status: "active", isAdmin: false, tags: [{ name: "制片" }] }),
      prepareTicketCreate: async ({ body }) => ({
        data: {
          id: `ticket-${nextTicket++}`,
          owner_id: body.ownerId,
          status: "排队中",
          updated_at: "2026-09-03T02:00:00.000Z",
          status_updated_at: "2026-09-03T02:00:00.000Z",
        },
      }),
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

test("signed feedback assignment route loads candidates, creates one ticket per person, and is idempotent", async (t) => {
  const runtime = await startIntegrationServer();
  t.after(() => new Promise((resolve) => runtime.server.close(resolve)));

  const optionsResponse = await signedRequest(runtime, "/api/internal/playable-feedback/projects/10/responsibles?versionId=20");
  assert.equal(optionsResponse.status, 200);
  const options = await optionsResponse.json();
  assert.equal(options.segments[0].members[0].name, "开发李四");
  assert.deepEqual(runtime.responsibleCalls, ["10::version-20"]);

  const payload = {
    requesterUserId: "7",
    projectId: "10",
    projectVersionId: "20",
    source: { batchId: "batch-1", reviewId: "review-1", feedbackId: "feedback-1", url: "https://preview.example/review-1" },
    tickets: [
      { sourceAssignmentId: "assignment-1", ownerId: "8", segmentId: 2, title: "反馈 #1", contentHtml: "<p>按钮偏移</p>", summary: "按钮偏移", priority: "优先", needType: "试玩反馈" },
      { sourceAssignmentId: "assignment-2", ownerId: "9", segmentId: 2, title: "反馈 #1", contentHtml: "<p>按钮偏移</p>", summary: "按钮偏移", priority: "优先", needType: "试玩反馈" },
    ],
  };
  const createResponse = await signedRequest(runtime, "/api/internal/playable-feedback/tickets/batch", { method: "POST", body: payload });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.assignments.length, 2);
  assert.equal(runtime.database.state.tickets.length, 2);
  assert.equal(runtime.database.state.sourceLinks.length, 2);
  assert.equal(runtime.database.state.ticketEvents.length, 2);
  assert.deepEqual(runtime.notifications, ["ticket-1", "ticket-2"]);

  const replayResponse = await signedRequest(runtime, "/api/internal/playable-feedback/tickets/batch", { method: "POST", body: payload });
  assert.equal(replayResponse.status, 200);
  const replay = await replayResponse.json();
  assert.equal(replay.idempotent, true);
  assert.equal(runtime.database.state.tickets.length, 2);

  const conflictingPayload = {
    ...payload,
    tickets: payload.tickets.map((ticket, index) => index === 0 ? { ...ticket, ownerId: "10" } : ticket),
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
