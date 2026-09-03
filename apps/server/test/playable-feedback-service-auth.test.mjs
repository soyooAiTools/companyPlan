import assert from "node:assert/strict";
import test from "node:test";
import {
  bodySha256,
  clearPlayableFeedbackNonceCache,
  createPlayableFeedbackServiceAuth,
  createPlayableFeedbackSignature,
} from "../middleware/playable-feedback-service-auth.mjs";
import { resolvePlayableFeedbackSharedSecret } from "../config/runtime.mjs";

function invoke(middleware, { headers, rawBody }) {
  const result = { status: 200, body: null, next: false };
  const response = {
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  middleware({ headers, rawBody }, response, () => {
    result.next = true;
  });
  return result;
}

test("playable feedback HMAC signs the exact raw JSON bytes", () => {
  const rawBody = Buffer.from('{"b":2,"a":1}');
  const signature = createPlayableFeedbackSignature({ timestamp: "1700000000000", nonce: "abcdefghijklmnop", rawBody, secret: "test-secret" });
  assert.equal(signature, "sha256=0d091e1a2ee8cb11d19d4bde3cb340bfb6a4d47ca981e4758d916f9fd9c62ad3");
  assert.notEqual(signature, createPlayableFeedbackSignature({ timestamp: "1700000000000", nonce: "abcdefghijklmnop", rawBody: Buffer.from('{"a":1,"b":2}'), secret: "test-secret" }));
  assert.equal(bodySha256(rawBody).length, 64);
});

test("playable feedback credential prefers a dedicated secret and supports the deployed legacy token", () => {
  assert.equal(resolvePlayableFeedbackSharedSecret({
    COMPANYPLAN_PLAYABLE_FEEDBACK_SHARED_SECRET: " dedicated-secret ",
    COMPANYPLAN_EXTERNAL_USERS_API_TOKEN: "legacy-token",
  }), "dedicated-secret");
  assert.equal(resolvePlayableFeedbackSharedSecret({
    COMPANYPLAN_PLAYABLE_FEEDBACK_SHARED_SECRET: "",
    COMPANYPLAN_EXTERNAL_USERS_API_TOKEN: " legacy-token ",
  }), "legacy-token");
  assert.equal(resolvePlayableFeedbackSharedSecret({}), "");
});

test("playable feedback middleware accepts a current valid signature and rejects replay", () => {
  clearPlayableFeedbackNonceCache();
  const config = { serviceId: "helper", sharedSecret: "test-secret", maxClockSkewSeconds: 300 };
  const middleware = createPlayableFeedbackServiceAuth(config);
  const timestamp = String(Date.now());
  const nonce = "abcdefghijklmnop";
  const rawBody = Buffer.from('{"ok":true}');
  const headers = {
    "x-playable-service": "helper",
    "x-playable-timestamp": timestamp,
    "x-playable-nonce": nonce,
    "x-playable-signature": createPlayableFeedbackSignature({ timestamp, nonce, rawBody, secret: config.sharedSecret }),
  };
  assert.deepEqual(invoke(middleware, { headers, rawBody }), { status: 200, body: null, next: true });
  const replay = invoke(middleware, { headers, rawBody });
  assert.equal(replay.status, 409);
  assert.equal(replay.next, false);
});

test("playable feedback middleware rejects stale and tampered requests", () => {
  clearPlayableFeedbackNonceCache();
  const config = { serviceId: "helper", sharedSecret: "test-secret", maxClockSkewSeconds: 30 };
  const middleware = createPlayableFeedbackServiceAuth(config);
  const staleTimestamp = String(Date.now() - 60_000);
  const staleBody = Buffer.from("{}");
  const stale = invoke(middleware, {
    rawBody: staleBody,
    headers: {
      "x-playable-service": "helper",
      "x-playable-timestamp": staleTimestamp,
      "x-playable-nonce": "stale-request-001",
      "x-playable-signature": createPlayableFeedbackSignature({ timestamp: staleTimestamp, nonce: "stale-request-001", rawBody: staleBody, secret: config.sharedSecret }),
    },
  });
  assert.equal(stale.status, 401);

  const timestamp = String(Date.now());
  const tampered = invoke(middleware, {
    rawBody: Buffer.from('{"changed":true}'),
    headers: {
      "x-playable-service": "helper",
      "x-playable-timestamp": timestamp,
      "x-playable-nonce": "tampered-body-001",
      "x-playable-signature": createPlayableFeedbackSignature({ timestamp, nonce: "tampered-body-001", rawBody: Buffer.from('{"changed":false}'), secret: config.sharedSecret }),
    },
  });
  assert.equal(tampered.status, 401);
});
