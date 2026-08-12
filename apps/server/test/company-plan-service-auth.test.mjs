import assert from "node:assert/strict";
import test from "node:test";
import { createCompanyPlanService, roleKeyFromSoyooUser } from "../service/company-plan-service.mjs";

function fixture({ authResult, loadedUser } = {}) {
  const calls = { audit: [], upsert: [], personLookups: 0, sessions: [] };
  let savedRoleKey = "member";
  const service = createCompanyPlanService({
    databaseLabel: "test",
    uploadDir: "/tmp/companyplan-test-uploads",
    sessionTtlDays: 7,
    authenticateSoyoo: async () => authResult,
    loadSoyooUser: async () => loadedUser,
    audit: async (...args) => calls.audit.push(args),
    upsertPersonFromSoyoo: async (person) => {
      calls.upsert.push(person);
      savedRoleKey = person.roleKey;
    },
    prismaClient: {
      people: {
        findFirst: async ({ where }) => {
          calls.personLookups += 1;
          return {
            id: "42",
            username: where.username,
            name: "测试用户",
            role_key: savedRoleKey,
            title: "",
            discipline: "",
            capacity: 0,
            completion: 0,
          };
        },
      },
      sessions: {
        create: async ({ data }) => calls.sessions.push(data),
        updateMany: async () => {},
      },
    },
  });
  return { service, calls };
}

test("invalid credentials stop before user lookup, upsert, and session creation", async () => {
  const { service, calls } = fixture({
    authResult: { ok: false, status: 401, error: "用户名或密码不正确" },
  });

  const result = await service.login({ username: "producer", password: "wrong" }, {});

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.body.error, "用户名或密码不正确");
  assert.equal(calls.upsert.length, 0);
  assert.equal(calls.personLookups, 0);
  assert.equal(calls.sessions.length, 0);
});

test("upstream failure remains a 502 instead of looking like a bad password", async () => {
  const { service } = fixture({
    authResult: { ok: false, status: 502, error: "无法连接 soyoo 登录服务,请稍后重试" },
  });

  const result = await service.login({ username: "producer", password: "secret" }, {});

  assert.equal(result.status, 502);
  assert.equal(result.body.error, "无法连接 soyoo 登录服务,请稍后重试");
});

test("successful producer login resolves soyoo tags and exposes username in session identity", async () => {
  const { service, calls } = fixture({
    authResult: { ok: true, user: { id: 42, nickname: "测试制片" } },
    loadedUser: { id: "42", tags: ["制片"] },
  });

  const result = await service.login({ username: "producer", password: "secret" }, {});

  assert.equal(result.ok, true);
  assert.equal(calls.upsert[0].roleKey, "producer");
  assert.equal(result.body.currentUser.username, "producer");
  assert.equal(result.body.currentUser.roleKey, "producer");
  assert.equal(calls.sessions.length, 1);
});

test("soyoo role mapping recognizes admin, producer, and ordinary members", () => {
  assert.equal(roleKeyFromSoyooUser({ is_admin: true }), "admin");
  assert.equal(roleKeyFromSoyooUser({ isAdmin: true }), "admin");
  assert.equal(roleKeyFromSoyooUser({ tags: [{ name: "管理员" }] }), "admin");
  assert.equal(roleKeyFromSoyooUser({ tags: [{ name: "制片" }] }), "producer");
  assert.equal(roleKeyFromSoyooUser({ tags: ["动画"] }), "member");
});
