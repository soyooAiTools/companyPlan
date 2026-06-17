import { sessionCookieName } from "../config/runtime.mjs";

export function createAuthMiddleware({ db, mapPerson, getPersonProjectIds }) {
  async function loadSession(request) {
    const cookies = parseCookies(request.headers.cookie ?? "");
    const sessionId = cookies[sessionCookieName];
    request.sessionId = sessionId;
    request.user = null;

    if (!sessionId) return;

    const session = await db
      .prepare(
        `SELECT sessions.*, people.*
         FROM sessions
         JOIN people ON people.id = sessions.person_id
         WHERE sessions.id = ? AND sessions.revoked_at IS NULL AND sessions.expires_at > ? AND people.disabled_at IS NULL`
      )
      .get(sessionId, new Date().toISOString());

    if (session) {
      request.user = mapPerson(session, await getPersonProjectIds(session.person_id));
    }
  }

  async function attachSession(request, _response, next) {
    try {
      await loadSession(request);
      return next();
    } catch (error) {
      return next(error);
    }
  }

  async function requireAuth(request, response, next) {
    try {
      await loadSession(request);
      if (!request.user) return response.status(401).json({ error: "请先登录" });
      return next();
    } catch (error) {
      return next(error);
    }
  }

  function requireAdmin(request, response, next) {
    if (request.user?.roleKey !== "admin") {
      return response.status(403).json({ error: "只有管理员可以修改系统配置" });
    }
    return next();
  }

  return { attachSession, requireAuth, requireAdmin };
}

// 跨站部署(前端与 API 不同域,如 ops.soyootech.com → opsapi.soyootech.com)需 SameSite=None;Secure。
// 由 COMPANYPLAN_COOKIE_SAMESITE 控制(默认 lax;跨域填 none);SameSite=None 时浏览器强制要求 Secure,故自动置 true。
const cookieSameSite = (process.env.COMPANYPLAN_COOKIE_SAMESITE || "lax").toLowerCase();
const cookieSecure = process.env.COMPANYPLAN_COOKIE_SECURE === "1" || cookieSameSite === "none";

export function setSessionCookie(response, sessionId, expiresAt) {
  response.cookie(sessionCookieName, sessionId, {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: cookieSecure,
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(response) {
  response.clearCookie(sessionCookieName, { httpOnly: true, sameSite: cookieSameSite, secure: cookieSecure, path: "/" });
}

function parseCookies(header) {
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        if (index === -1) return [item, ""];
        return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
      })
  );
}
