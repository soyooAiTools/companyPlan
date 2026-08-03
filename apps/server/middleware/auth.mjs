import { sessionCookieName, sessionTtlDays } from "../config/runtime.mjs";
import { prisma } from "../ops/prisma.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_CACHE_MS = 5000;
const sessionCache = new Map();
const sessionLoaders = new Map();

function mapAuthPerson(row) {
  return {
    id: row.id,
    name: row.name,
    roleKey: row.role_key,
    title: row.title,
    discipline: row.discipline,
    capacity: row.capacity,
    completion: row.completion,
    projectIds: [],
  };
}

export function createAuthMiddleware() {
  async function loadSession(request, response) {
    const cookies = parseCookies(request.headers.cookie ?? "");
    const sessionId = cookies[sessionCookieName];
    request.sessionId = sessionId;
    request.user = null;

    if (!sessionId) return;

    const cached = sessionCache.get(sessionId);
    const nowMs = Date.now();
    if (cached && cached.expiresAtMs > nowMs && nowMs - cached.cachedAtMs < SESSION_CACHE_MS) {
      request.user = cached.user;
      return;
    }

    const session = await loadSessionRow(sessionId);

    if (session) {
      request.user = mapAuthPerson(session.people);
      sessionCache.set(sessionId, {
        user: request.user,
        expiresAtMs: new Date(session.expires_at).getTime(),
        cachedAtMs: nowMs,
      });
      await refreshSessionExpiry(session, response);
    } else {
      sessionCache.delete(sessionId);
    }
  }

  async function attachSession(request, _response, next) {
    try {
      await loadSession(request, _response);
      return next();
    } catch (error) {
      return next(error);
    }
  }

  async function requireAuth(request, response, next) {
    try {
      await loadSession(request, response);
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

async function refreshSessionExpiry(session, response) {
  if (!response) return;
  const now = new Date();
  const ttlMs = sessionTtlDays * DAY_MS;
  const expiresAt = new Date(session.expires_at);
  if (!Number.isFinite(expiresAt.getTime())) return;

  const shouldRefresh = expiresAt.getTime() - now.getTime() <= Math.max(DAY_MS, ttlMs / 2);
  if (!shouldRefresh) return;

  const nextExpiresAt = new Date(now.getTime() + ttlMs);
  await prisma.sessions.updateMany({
    where: { id: session.id, revoked_at: null },
    data: { expires_at: nextExpiresAt.toISOString() },
  });
  setSessionCookie(response, session.id, nextExpiresAt);
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

export function clearSessionCache(sessionId) {
  if (sessionId) sessionCache.delete(sessionId);
  if (sessionId) sessionLoaders.delete(sessionId);
}

async function loadSessionRow(sessionId) {
  const pending = sessionLoaders.get(sessionId);
  if (pending) return pending;

  const loader = prisma.sessions
    .findFirst({
      where: {
        id: sessionId,
        revoked_at: null,
        expires_at: { gt: new Date().toISOString() },
        people: { disabled_at: null },
      },
      include: { people: true },
    })
    .finally(() => {
      sessionLoaders.delete(sessionId);
    });
  sessionLoaders.set(sessionId, loader);
  return loader;
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
