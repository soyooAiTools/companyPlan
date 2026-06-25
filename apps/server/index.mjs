import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import {
  dataDir,
  databaseLabel,
  defaultDeliveryHours,
  defaultRiskWarningHours,
  mysqlConfig,
  opsIntegration,
  opsSyncIntervalMs,
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
  upsertPersonFromSoyoo,
  verifyPassword,
} from "./db/company-plan-store.mjs";
import { clearSessionCookie, createAuthMiddleware, setSessionCookie } from "./middleware/auth.mjs";
import { securityHeaders, validateWriteOrigin } from "./middleware/security.mjs";
import { registerCompanyPlanRoutes } from "./router/company-plan-routes.mjs";
import { registerOpsRoutes } from "./ops/ops-routes.mjs";
import { registerProjectPoolRoutes } from "./ops/project-pool-routes.mjs";
import { registerNotificationRoutes } from "./ops/notification-routes.mjs";
import { startOpsChangeConsumer } from "./ops/ops-sync-consumer.mjs";
import { startNotificationScan } from "./ops/ops-notification-scan.mjs";
import { createCompanyPlanService } from "./service/company-plan-service.mjs";

mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadDir, { recursive: true });

const db = await createDatabase(mysqlConfig);

bindCompanyPlanStore(db);
await initializeSchema();
await seedDatabase();

// 去同步:全量同步(opsDirectorySync)+ 定时调度器(opsSyncScheduler)已移除,改用 ops-sync-consumer 消费 soyoo 变更 outbox(见 app.listen)。

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
  databaseLabel,
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
  upsertPersonFromSoyoo,
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
// 新需求提单接口(Prisma,/api/ops/*),与旧接口共存
registerOpsRoutes(app, { requireAuth, requireAdmin });
registerProjectPoolRoutes(app, { requireAuth, requireAdmin });
registerNotificationRoutes(app, { requireAuth, requireAdmin });

const distDir = join(repoRoot, "apps", "web", "dist");
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
  // 去同步:不再跑全量同步。改为消费 soyoo 变更 outbox,刷新工单快照(改名/换头像等)。
  startOpsChangeConsumer({ logger });
  // 通知扫描:周期性发现超时工单/项目并落库 + SSE 推送(间隔后台可改)
  startNotificationScan({ logger });
});
