import assert from "node:assert/strict";
import test from "node:test";
import { soyooLogin } from "../ops/soyoo-auth.mjs";

test("soyooLogin returns an invalid-credential response directly", async () => {
  const calls = [];
  const result = await soyooLogin("producer", "wrong-password", {
    baseUrl: "https://soyoo.example.test/",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ error: "用户名或密码不正确" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.deepEqual(result, { ok: false, status: 401, error: "用户名或密码不正确" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://soyoo.example.test/tools/login");
  assert.deepEqual(JSON.parse(calls[0].init.body), { username: "producer", password: "wrong-password" });
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("soyooLogin maps an upstream timeout to a service error", async () => {
  const result = await soyooLogin("producer", "secret", {
    baseUrl: "https://soyoo.example.test",
    timeoutMs: 1,
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }),
  });

  assert.deepEqual(result, { ok: false, status: 502, error: "无法连接 soyoo 登录服务,请稍后重试" });
});
