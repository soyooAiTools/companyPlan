export function registerCompanyPlanRoutes(app, controller, { attachSession, requireAuth, requireAdmin }) {
  app.get("/api/health", controller.health);
  app.post("/api/auth/login", controller.login);
  app.post("/api/auth/logout", attachSession, controller.logout);
  app.get("/api/session", requireAuth, controller.session);
}
