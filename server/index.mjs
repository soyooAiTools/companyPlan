import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import {
  dataDir,
  databasePath,
  defaultDeliveryHours,
  defaultRiskWarningHours,
  port,
  priorityOptions,
  repoRoot,
  sessionTtlDays,
  statusOptions,
  uploadDir,
} from "./config/runtime.mjs";
import { createCompanyPlanController } from "./controller/company-plan-controller.mjs";
import { logger } from "./core/logger.mjs";
import { createCompanyPlanDao } from "./dao/company-plan-dao.mjs";
import { createDatabase } from "./db/connection.mjs";
import {
  audit,
  bindCompanyPlanStore,
  canMutateTicket,
  canReadTicket,
  cleanText,
  clampNumber,
  formatDateTime,
  getBootstrap,
  getCompanyConfig,
  getDefaultDeliveryHours,
  getPerson,
  getPersonProjectIds,
  getTicketById,
  getVisibleProjectIds,
  initializeSchema,
  isConfiguredProjectName,
  mapPerson,
  nextTicketId,
  seedDatabase,
  storeAttachment,
  verifyPassword,
} from "./db/company-plan-store.mjs";
import { clearSessionCookie, createAuthMiddleware, setSessionCookie } from "./middleware/auth.mjs";
import { securityHeaders, validateWriteOrigin } from "./middleware/security.mjs";
import { registerCompanyPlanRoutes } from "./router/company-plan-routes.mjs";
import { createCompanyPlanService } from "./service/company-plan-service.mjs";

mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadDir, { recursive: true });

const db = createDatabase(databasePath);

bindCompanyPlanStore(db);
initializeSchema();
seedDatabase();

const { attachSession, requireAuth, requireAdmin } = createAuthMiddleware({
  db,
  mapPerson,
  getPersonProjectIds,
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "16mb" }));
app.use(securityHeaders);
app.use(validateWriteOrigin);

const companyPlanDao = createCompanyPlanDao(db);
const companyPlanService = createCompanyPlanService({
  dao: companyPlanDao,
  databasePath,
  uploadDir,
  sessionTtlDays,
  statusOptions,
  priorityOptions,
  defaultDeliveryHours,
  defaultRiskWarningHours,
  getBootstrap,
  getCompanyConfig,
  getVisibleProjectIds,
  getPerson,
  getPersonProjectIds,
  getTicketById,
  canReadTicket,
  canMutateTicket,
  getDefaultDeliveryHours,
  isConfiguredProjectName,
  mapPerson,
  nextTicketId,
  storeAttachment,
  audit,
  verifyPassword,
  cleanText,
  clampNumber,
  formatDateTime,
});
const companyPlanController = createCompanyPlanController(companyPlanService, {
  setSessionCookie,
  clearSessionCookie,
});
registerCompanyPlanRoutes(app, companyPlanController, {
  attachSession,
  requireAuth,
  requireAdmin,
});

const distDir = join(repoRoot, "dist");
if (existsSync(distDir)) {
  app.use("/companyPlan", express.static(distDir, { extensions: ["html"], index: false }));
  app.use(express.static(distDir, { extensions: ["html"], index: false }));
  app.get(/^(?!\/api\/).*/, (_request, response) => {
    response.sendFile(join(distDir, "index.html"));
  });
}

app.use((error, _request, response, _next) => {
  logger.error(error);
  response.status(500).json({ error: "服务器内部错误" });
});

app.listen(port, () => {
  logger.info(`companyPlan production server listening on http://127.0.0.1:${port}`);
});
