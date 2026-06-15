import { sessionCookieName } from "../config/runtime.mjs";

export function createAuthMiddleware({ db, mapPerson, getPersonProjectIds }) {
  function attachSession(request, _response, next) {
    const cookies = parseCookies(request.headers.cookie ?? "");
    const sessionId = cookies[sessionCookieName];
    request.sessionId = sessionId;
    request.user = null;

    if (!sessionId) return next();

    const session = db
      .prepare(
        `SELECT sessions.*, people.*
         FROM sessions
         JOIN people ON people.id = sessions.person_id
         WHERE sessions.id = ? AND sessions.revoked_at IS NULL AND sessions.expires_at > ? AND people.disabled_at IS NULL`
      )
      .get(sessionId, new Date().toISOString());

    if (session) {
      request.user = mapPerson(session, getPersonProjectIds(session.person_id));
    }
    return next();
  }

  function requireAuth(request, response, next) {
    attachSession(request, response, () => {
      if (!request.user) return response.status(401).json({ error: "请先登录" });
      return next();
    });
  }

  function requireAdmin(request, response, next) {
    if (request.user?.roleKey !== "admin") {
      return response.status(403).json({ error: "只有管理员可以修改系统配置" });
    }
    return next();
  }

  return { attachSession, requireAuth, requireAdmin };
}

export function setSessionCookie(response, sessionId, expiresAt) {
  const secure = process.env.COMPANYPLAN_COOKIE_SECURE === "1";
  response.cookie(sessionCookieName, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(response) {
  response.clearCookie(sessionCookieName, { httpOnly: true, sameSite: "lax", path: "/" });
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
