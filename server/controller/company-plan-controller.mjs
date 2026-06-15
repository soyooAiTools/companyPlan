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

    login(request, response) {
      const result = service.login(request.body, auditContext(request));
      if (!result.ok) return sendResult(response, result);
      setSessionCookie(response, result.body.sessionId, result.body.expiresAt);
      return response.json({ currentUser: result.body.currentUser });
    },

    logout(request, response) {
      const result = service.logout(request.sessionId, request.user, auditContext(request));
      clearSessionCookie(response);
      return sendResult(response, result);
    },

    session(request, response) {
      return sendResult(response, service.getSession(request.user));
    },

    bootstrap(request, response) {
      return sendResult(response, service.bootstrap(request.user));
    },

    saveAdminConfig(request, response) {
      return sendResult(response, service.saveAdminConfig(request.body, request.user, auditContext(request)));
    },

    createTicket(request, response) {
      return sendResult(response, service.createTicket(request.body ?? {}, request.user, auditContext(request)));
    },

    updateTicketStatus(request, response) {
      return sendResult(
        response,
        service.updateTicketStatus(request.params.ticketId, request.body ?? {}, request.user, auditContext(request))
      );
    },

    updateTicketTimeline(request, response) {
      return sendResult(
        response,
        service.updateTicketTimeline(request.params.ticketId, request.body ?? {}, request.user, auditContext(request))
      );
    },

    openAttachment(request, response) {
      const result = service.getAttachmentFile(request.params.attachmentId, request.user, "open");
      if (!result.ok) return sendResult(response, result);
      const { attachment } = result.body;
      response.setHeader("Content-Type", attachment.mime_type || "application/octet-stream");
      response.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.name)}"`);
      return response.sendFile(attachment.storage_path);
    },

    downloadAttachment(request, response) {
      const result = service.getAttachmentFile(request.params.attachmentId, request.user, "download");
      if (!result.ok) return sendResult(response, result);
      const { attachment } = result.body;
      return response.download(attachment.storage_path, attachment.name);
    },

    audit(request, response) {
      return sendResult(response, service.listAudit(request.query, request.user));
    },
  };
}
