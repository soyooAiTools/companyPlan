import crypto from "node:crypto";
import { soyooLogin } from "../ops/soyoo-auth.mjs";
import { getUser as getSoyooUser } from "../ops/ops-realtime.mjs";
import { prisma } from "../ops/prisma.mjs";

function ok(body, status = 200) {
  return { ok: true, status, body };
}

function fail(status, error) {
  return { ok: false, status, body: { error } };
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => (typeof tag === "string" ? tag : tag?.name))
    .map((tag) => String(tag ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export function roleKeyFromSoyooUser(user) {
  const tags = normalizeTags(user?.tags);
  if (user?.is_admin || user?.isAdmin || tags.includes("管理员") || tags.includes("admin")) return "admin";
  if (tags.includes("制片")) return "producer";
  return "member";
}

function authFailureStatus(status) {
  if (status === 403) return 403;
  if (Number(status) >= 500) return 502;
  return 401;
}

export function createCompanyPlanService(deps) {
  const {
    databaseLabel,
    uploadDir,
    sessionTtlDays,
    audit,
    upsertPersonFromSoyoo,
    authenticateSoyoo = soyooLogin,
    loadSoyooUser = getSoyooUser,
    prismaClient = prisma,
  } = deps;

  return {
    getHealth() {
      return {
        ok: true,
        database: databaseLabel,
        uploadDir,
        startedAt: process.uptime(),
      };
    },

    async login(payload, auditContext) {
      const username = String(payload?.username ?? "").trim();
      const password = String(payload?.password ?? "");
      if (!username || !password) return fail(400, "请输入账号和密码");

      const soyoo = await authenticateSoyoo(username, password);
      if (!soyoo.ok) {
        await audit(null, "login_failed", "person", username || "unknown", auditContext, { username, via: "soyoo", status: soyoo.status });
        return fail(authFailureStatus(soyoo.status), soyoo.error || "用户名或密码不正确");
      }

      const su = soyoo.user ?? {};
      if (su.status === "disabled") {
        await audit(null, "login_disabled", "person", username, auditContext, { username });
        return fail(403, "账户已被禁用,请联系管理员");
      }

      const personId = String(su.ID ?? su.id ?? "").trim();
      if (!personId) {
        await audit(null, "login_no_soyoo_id", "person", username, auditContext, { username });
        return fail(500, "soyoo 未返回用户 id");
      }

      let roleSource = su;
      if (!su.is_admin && normalizeTags(su.tags).length === 0) {
        try {
          roleSource = { ...su, ...(await loadSoyooUser(personId)) };
        } catch {
          // 身份补查失败时按普通成员降级；管理员/制片功能仍会拒绝该会话，避免越权。
        }
      }

      await upsertPersonFromSoyoo({
        id: personId,
        username,
        name: su.nickname || username,
        roleKey: roleKeyFromSoyooUser(roleSource),
        wechatName: su.wechat_name ?? "",
        wechatAvatar: su.wechat_avatar_url ?? "",
      });

      const user = await prismaClient.people.findFirst({ where: { username, disabled_at: null } });
      if (!user) {
        await audit(null, "login_upsert_failed", "person", username, auditContext, { username });
        return fail(500, "登录建档失败,请重试");
      }

      const sessionId = crypto.randomBytes(32).toString("hex");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + sessionTtlDays * 24 * 60 * 60 * 1000);
      await prismaClient.sessions.create({ data: { id: sessionId, person_id: user.id, created_at: now.toISOString(), expires_at: expiresAt.toISOString() } });

      await audit(user.id, "login", "person", user.id, auditContext);
      return ok({
        currentUser: {
          id: user.id,
          username: user.username,
          name: user.name,
          roleKey: user.role_key,
          title: user.title,
          discipline: user.discipline,
          capacity: user.capacity,
          completion: user.completion,
          projectIds: [],
        },
        sessionId,
        expiresAt,
      });
    },

    async logout(sessionId, user, auditContext) {
      if (sessionId) {
        await prismaClient.sessions.updateMany({ where: { id: sessionId }, data: { revoked_at: new Date().toISOString() } });
        await audit(user?.id ?? null, "logout", "session", sessionId, auditContext);
      }
      return ok({ ok: true });
    },

    getSession(user) {
      return ok({ currentUser: user });
    },
  };
}
