import crypto from "node:crypto";
import { soyooLogin } from "../ops/soyoo-auth.mjs";
import { prisma } from "../ops/prisma.mjs";

function ok(body, status = 200) {
  return { ok: true, status, body };
}

function fail(status, error) {
  return { ok: false, status, body: { error } };
}

export function createCompanyPlanService(deps) {
  const { databaseLabel, uploadDir, sessionTtlDays, audit, upsertPersonFromSoyoo } = deps;

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

      const soyoo = await soyooLogin(username, password);
      if (!soyoo.ok) {
        await audit(null, "login_failed", "person", username || "unknown", auditContext, { username, via: "soyoo", status: soyoo.status });
        return fail(soyoo.status === 403 ? 403 : 401, soyoo.error || "用户名或密码不正确");
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

      await upsertPersonFromSoyoo({
        id: personId,
        username,
        name: su.nickname || username,
        roleKey: su.is_admin ? "admin" : "member",
        wechatName: su.wechat_name ?? "",
        wechatAvatar: su.wechat_avatar_url ?? "",
      });

      const user = await prisma.people.findFirst({ where: { username, disabled_at: null } });
      if (!user) {
        await audit(null, "login_upsert_failed", "person", username, auditContext, { username });
        return fail(500, "登录建档失败,请重试");
      }

      const sessionId = crypto.randomBytes(32).toString("hex");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + sessionTtlDays * 24 * 60 * 60 * 1000);
      await prisma.sessions.create({ data: { id: sessionId, person_id: user.id, created_at: now.toISOString(), expires_at: expiresAt.toISOString() } });

      await audit(user.id, "login", "person", user.id, auditContext);
      return ok({
        currentUser: {
          id: user.id,
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
        await prisma.sessions.updateMany({ where: { id: sessionId }, data: { revoked_at: new Date().toISOString() } });
        await audit(user?.id ?? null, "logout", "session", sessionId, auditContext);
      }
      return ok({ ok: true });
    },

    getSession(user) {
      return ok({ currentUser: user });
    },
  };
}
