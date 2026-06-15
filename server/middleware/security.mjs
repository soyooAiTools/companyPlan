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
  if (origin !== expected) return response.status(403).json({ error: "请求来源不合法" });
  return next();
}
