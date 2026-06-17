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
  syncOpsDirectory,
  getOpsSetting,
  setOpsSetting,
  addSyncLog,
  getSyncLogs,
  storeAttachment,
  verifyPassword,
} from "./db/company-plan-store.mjs";
import { createOpsDirectorySync } from "./integration/ops-directory.mjs";
import { clearSessionCookie, createAuthMiddleware, setSessionCookie } from "./middleware/auth.mjs";
import { securityHeaders, validateWriteOrigin } from "./middleware/security.mjs";
import { registerCompanyPlanRoutes } from "./router/company-plan-routes.mjs";
import { registerOpsRoutes } from "./ops/ops-routes.mjs";
import { createCompanyPlanService } from "./service/company-plan-service.mjs";

mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadDir, { recursive: true });

const db = await createDatabase(mysqlConfig);

bindCompanyPlanStore(db);
await initializeSchema();
await seedDatabase();

const opsDirectorySync = createOpsDirectorySync({
  config: opsIntegration,
  logger,
  syncDirectory: syncOpsDirectory,
});
// 注意：首次同步不在这里 await（否则会阻塞启动 30-50s）。改为 listen 之后后台跑，见文件末尾。

// ops 同步调度器：频率/开关存 DB(ops_settings),「设置>同步管理」页可调、运行时重排（不重启）；每次同步记一条 ops_sync_logs。
const SYNC_INTERVAL_KEY = "sync_interval_minutes";
const SYNC_ENABLED_KEY = "sync_enabled";
const opsSyncScheduler = (() => {
  let timer = null;
  const envDefaultMinutes = Math.max(1, Math.round(opsSyncIntervalMs / 60000)) || 5;

  async function getIntervalMinutes() {
    const v = Number(await getOpsSetting(SYNC_INTERVAL_KEY));
    return Number.isFinite(v) && v >= 1 ? Math.min(1440, v) : envDefaultMinutes;
  }
  async function getEnabled() {
    const v = await getOpsSetting(SYNC_ENABLED_KEY);
    return v == null ? opsSyncIntervalMs > 0 : v === "1";
  }
  async function runSync(triggerBy = "scheduled", actorName = null) {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    let result;
    let ok = true;
    try {
      result = await opsDirectorySync.sync({ force: true, reason: triggerBy });
      ok = !!result?.active && result?.reason !== "sync_failed";
    } catch (error) {
      ok = false;
      result = { error: error?.message ?? String(error) };
    }
    await addSyncLog({
      triggerBy,
      actorName,
      status: ok ? "success" : "failed",
      users: result?.users,
      projects: result?.projects,
      tenants: result?.tenants,
      tags: result?.tags,
      durationMs: Date.now() - t0,
      error: ok ? null : result?.error,
      startedAt,
      finishedAt: new Date().toISOString(),
    }).catch((error) => logger.error("addSyncLog failed", { error: error?.message ?? String(error) }));
    logger.info("ops sync run", { triggerBy, status: ok ? "success" : "failed" });
    return result;
  }
  async function applySchedule() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    const enabled = await getEnabled();
    const minutes = await getIntervalMinutes();
    if (enabled && minutes > 0) timer = setInterval(() => void runSync("scheduled"), minutes * 60000);
    logger.info("ops sync scheduled", { enabled, minutes });
    return { enabled, minutes };
  }
  return {
    runSync,
    applySchedule,
    getStatus: opsDirectorySync.getStatus,
    getLogs: getSyncLogs,
    async getConfig() {
      return { intervalMinutes: await getIntervalMinutes(), enabled: await getEnabled() };
    },
    async reschedule({ intervalMinutes, enabled } = {}) {
      if (intervalMinutes != null) {
        await setOpsSetting(SYNC_INTERVAL_KEY, String(Math.max(1, Math.min(1440, Math.round(Number(intervalMinutes) || envDefaultMinutes)))));
      }
      if (enabled != null) await setOpsSetting(SYNC_ENABLED_KEY, enabled ? "1" : "0");
      return applySchedule();
    },
  };
})();

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
  cleanText,
  clampNumber,
  formatDateTime,
  syncExternalDirectory: opsDirectorySync.sync,
  getExternalDirectoryStatus: opsDirectorySync.getStatus,
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
registerOpsRoutes(app, { requireAuth, requireAdmin, opsSync: opsSyncScheduler });

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
  // 后台同步 ops：启动先跑一次,之后按 DB 配置的频率定时同步(页面可改,无需重启)。都不阻塞请求。
  void opsSyncScheduler.runSync("startup");
  void opsSyncScheduler.applySchedule();
});
