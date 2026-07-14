function auditContext(request) {
  return {
    ip: request.ip,
    headers: { "user-agent": request.headers?.["user-agent"] ?? null },
  };
}

function sendResult(response, result) {
  if (!result.ok) {
    return response.status(result.status).json(result.body);
  }
  return response.status(result.status).json(result.body);
}

export function createCompanyPlanController(service, { setSessionCookie, clearSessionCookie }) {
  return {
    health(_request, response) {
      response.json(service.getHealth());
    },

    async login(request, response) {
      const result = await service.login(request.body, auditContext(request));
      if (!result.ok) return sendResult(response, result);
      setSessionCookie(response, result.body.sessionId, result.body.expiresAt);
      return response.json({ currentUser: result.body.currentUser });
    },

    async logout(request, response) {
      const result = await service.logout(request.sessionId, request.user, auditContext(request));
      clearSessionCookie(response);
      return sendResult(response, result);
    },

    session(request, response) {
      return sendResult(response, service.getSession(request.user));
    },
  };
}
