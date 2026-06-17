export function securityHeaders(_request, response, next) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // 新增跨域放行头，全局允许所有来源
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "*");
  response.setHeader("Access-Control-Max-Age", "86400");
  // 处理OPTIONS预检请求直接返回204
  if (_request.method === "OPTIONS") {
    return response.sendStatus(204);
  }
  next();
}

// 全部跨域放开，直接跳过所有origin校验
export function validateWriteOrigin(request, response, next) {
  return next();
}