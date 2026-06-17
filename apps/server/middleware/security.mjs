export function securityHeaders(request, response, next) {
  // 动态取前端请求源，只输出一次Allow-Origin，杜绝多值冲突
  const reqOrigin = request.headers.origin;
  if (reqOrigin) {
    response.setHeader("Access-Control-Allow-Origin", reqOrigin);
  }

  // 跨域配套头
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Max-Age", "86400");

  // 原有安全头保留不变
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // OPTIONS预检请求直接返回204，终止链路
  if (request.method === "OPTIONS") {
    return response.sendStatus(204);
  }
  next();
}

// 完全关闭origin来源校验，直接放行所有请求
export function validateWriteOrigin(request, response, next) {
  return next();
}