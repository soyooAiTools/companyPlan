import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { buildPlayableFeedbackSourceUrl, loadPlayableFeedbackSource, registerPlayableFeedbackSourceRoute } from "../ops/playable-feedback-source.mjs";
import { canViewTicket } from "../ops/services/collaboration-permissions.mjs";

test("upgrades old homepage links into exact review/person-level ticket destinations", () => {
  const result = new URL(buildPlayableFeedbackSourceUrl("https://preview.example/preview/index.html?tenant=demo#/", "r1", "a1", "t1"));
  assert.equal(result.searchParams.get("tenant"), "demo");
  assert.equal(result.hash, "#/feedback/r1?assignmentId=a1&ticketId=t1");
});

test("rejects unsafe or malformed feedback links", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,a", "not-a-url", "https://user:pass@example.com/"]) {
    assert.equal(buildPlayableFeedbackSourceUrl(value, "r1", "a1"), "");
  }
});

test("loads the source by scoped ticket ID with bound parameters and preserves existing rows", async () => {
  const database = { $queryRawUnsafe: async (sql, system, id) => {
    assert.match(sql, /ticket_id = \?/);
    assert.equal(system, "playable-feedback");
    assert.equal(id, "t1");
    return [{ source_review_id: "r1", source_review_number: 15, source_assignment_id: "a1", source_url: "https://preview.example/preview/index.html?tenant=demo" }];
  } };
  const result = await loadPlayableFeedbackSource(database, "t1");
  assert.equal(result.reviewId, "r1");
  assert.equal(result.reviewNumber, 15);
  assert.match(result.url, /#\/feedback\/r1\?assignmentId=a1&ticketId=t1$/);
  assert.equal(await loadPlayableFeedbackSource({ $queryRawUnsafe: async () => [] }, "other"), null);
});

test("feedback source route enforces login and ticket visibility before loading source metadata", async (t) => {
  let sourceReads = 0;
  const app = express();
  registerPlayableFeedbackSourceRoute(app, {
    requireAuth: (req, res, next) => { if (!req.get("x-test-user")) return res.sendStatus(401); req.user = { id: req.get("x-test-user") }; next(); },
    database: {
      tickets: { findUnique: async ({ where }) => where.id === "t1" ? { owner_id: "artist", requester_id: "producer" } : null },
      $queryRawUnsafe: async () => { sourceReads++; return [{ source_review_id: "r1", source_review_number: 15, source_assignment_id: "a1", source_url: "https://preview.example/preview/index.html" }]; },
    },
    getAccess: async (user) => ({ userId: user.id, admin: user.id === "admin", viewOwnerIds: new Set([user.id]), handleOwnerIds: new Set([user.id]) }),
    canView: canViewTicket,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/ops/tickets/t1/feedback-source`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { "x-test-user": "unrelated-programmer" } })).status, 403);
  assert.equal(sourceReads, 0);
  for (const user of ["admin", "producer", "artist"]) {
    const response = await fetch(url, { headers: { "x-test-user": user } });
    assert.equal(response.status, 200);
    assert.match((await response.json()).source.url, /assignmentId=a1/);
  }
});
