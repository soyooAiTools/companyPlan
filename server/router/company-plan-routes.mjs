export function registerCompanyPlanRoutes(app, controller, { attachSession, requireAuth, requireAdmin }) {
  app.get("/api/health", controller.health);
  app.post("/api/auth/login", controller.login);
  app.post("/api/auth/logout", attachSession, controller.logout);
  app.get("/api/session", requireAuth, controller.session);
  app.get("/api/bootstrap", requireAuth, controller.bootstrap);
  app.patch("/api/admin/config", requireAuth, requireAdmin, controller.saveAdminConfig);
  app.post("/api/tickets", requireAuth, controller.createTicket);
  app.patch("/api/tickets/:ticketId/status", requireAuth, controller.updateTicketStatus);
  app.patch("/api/tickets/:ticketId/timeline", requireAuth, controller.updateTicketTimeline);
  app.get("/api/attachments/:attachmentId/open", requireAuth, controller.openAttachment);
  app.get("/api/attachments/:attachmentId/download", requireAuth, controller.downloadAttachment);
  app.get("/api/audit", requireAuth, controller.audit);
}
