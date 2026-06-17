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

    async bootstrap(request, response) {
      return sendResult(response, await service.bootstrap(request.user));
    },

    async saveAdminConfig(request, response) {
      return sendResult(response, await service.saveAdminConfig(request.body, request.user, auditContext(request)));
    },

    async createTicket(request, response) {
      return sendResult(response, await service.createTicket(request.body ?? {}, request.user, auditContext(request)));
    },

    async updateTicketStatus(request, response) {
      return sendResult(
        response,
        await service.updateTicketStatus(request.params.ticketId, request.body ?? {}, request.user, auditContext(request))
      );
    },

    async updateTicketTimeline(request, response) {
      return sendResult(
        response,
        await service.updateTicketTimeline(request.params.ticketId, request.body ?? {}, request.user, auditContext(request))
      );
    },

    async openAttachment(request, response) {
      const result = await service.getAttachmentFile(request.params.attachmentId, request.user, "open");
      if (!result.ok) return sendResult(response, result);
      const { attachment } = result.body;
      response.setHeader("Content-Type", attachment.mime_type || "application/octet-stream");
      response.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.name)}"`);
      return response.sendFile(attachment.storage_path);
    },

    async downloadAttachment(request, response) {
      const result = await service.getAttachmentFile(request.params.attachmentId, request.user, "download");
      if (!result.ok) return sendResult(response, result);
      const { attachment } = result.body;
      return response.download(attachment.storage_path, attachment.name);
    },

    async audit(request, response) {
      return sendResult(response, await service.listAudit(request.query, request.user));
    },
  };
}
