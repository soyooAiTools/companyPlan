export function securityHeaders(_request, response, next) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

export function validateWriteOrigin(request, response, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next();
  const origin = request.headers.origin;
  if (!origin) return next();

  const expected = `${request.protocol}://${request.get("host")}`;
  if (origin === expected) return next();

  // 显式白名单(逗号分隔),用于反向代理 / 跨端口部署
  const allowed = (process.env.COMPANYPLAN_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (allowed.includes(origin)) return next();

  // 开发便利:非 prod 放行 localhost / 127.0.0.1(前端 vite 5001 经代理打后端 4174)。
  // 生产请求来自真实域名 = expected,不受影响。
  if ((process.env.APP_ENV ?? "dev") !== "prod") {
    try {
      const host = new URL(origin).hostname;
      if (host === "localhost" || host === "127.0.0.1") return next();
    } catch {
      /* 无效 origin,落到下面拒绝 */
    }
  }

  return response.status(403).json({ error: "请求来源不合法" });
}
