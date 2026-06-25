// 项目池路由:只注册 + 调 service(分层)。挂 /api/ops/*。可见=策划(制片)或管理员。
import * as pool from "./services/ops-project-pool.mjs";
import { isAdmin, isPlanner, soyooErrorResponse } from "./ops-helpers.mjs";

// 仅 管理员 或 策划(制片)可访问项目池
async function requirePlanner(req, res, next) {
  try {
    if (isAdmin(req.user) || (await isPlanner(req.user))) return next();
  } catch {
    /* 降级:拒绝 */
  }
  return res.status(403).json({ error: "无权访问项目池(仅策划或管理员)" });
}

export function registerProjectPoolRoutes(app, { requireAuth, requireAdmin }) {
  // 列表(管理员全部 / 策划=自己负责的)
  app.get("/api/ops/project-pool", requireAuth, requirePlanner, async (req, res) => {
    try {
      res.json(
        await pool.listProjectPool({
          user: req.user,
          page: Number(req.query.page) || 1,
          pageSize: Math.min(100, Number(req.query.pageSize) || 20),
          q: String(req.query.q ?? ""),
          status: String(req.query.status ?? ""), // 不传则后端默认按「开启监控」的状态查
        }),
      );
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 超时关注列表
  app.get("/api/ops/project-pool/stale", requireAuth, requirePlanner, async (req, res) => {
    try {
      res.json(await pool.listStale({ user: req.user, page: Number(req.query.page) || 1, pageSize: Math.min(100, Number(req.query.pageSize) || 20) }));
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 超时数(菜单红点轮询)
  app.get("/api/ops/project-pool/stale-count", requireAuth, requirePlanner, async (req, res) => {
    try {
      res.json({ count: await pool.staleCount({ user: req.user }) });
    } catch {
      res.json({ count: 0 });
    }
  });

  // 改项目状态(策划本人/管理员)
  app.post("/api/ops/project-pool/:id/status", requireAuth, requirePlanner, async (req, res) => {
    let r;
    try {
      r = await pool.changeProjectStatus({ user: req.user, projectId: req.params.id, status: String(req.body?.status ?? ""), commentHtml: req.body?.commentHtml, force: req.body?.force === true });
    } catch (e) {
      return soyooErrorResponse(res, e);
    }
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  });

  // 改项目阶段(策划本人/管理员;纯 ops,不调 soyoo)
  app.post("/api/ops/project-pool/:id/stage", requireAuth, requirePlanner, async (req, res) => {
    let r;
    try {
      r = await pool.changeProjectStage({ user: req.user, projectId: req.params.id, stage: String(req.body?.stage ?? ""), commentHtml: req.body?.commentHtml });
    } catch (e) {
      return soyooErrorResponse(res, e);
    }
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  });

  // 改项目备注(策划本人/管理员;纯 ops,富文本)
  app.post("/api/ops/project-pool/:id/remark", requireAuth, requirePlanner, async (req, res) => {
    let r;
    try {
      r = await pool.changeProjectRemark({ user: req.user, projectId: req.params.id, remark: req.body?.remark });
    } catch (e) {
      return soyooErrorResponse(res, e);
    }
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  });

  // 项目状态/阶段流转记录(同一时间线)
  app.get("/api/ops/project-pool/:id/status-logs", requireAuth, requirePlanner, async (req, res) => {
    res.json({ logs: await pool.getStatusLogs(req.params.id) });
  });

  // 某环节下的未完成工单(目前环节点击查看,纯本地工单表)
  app.get("/api/ops/project-pool/:id/segment-tickets", requireAuth, requirePlanner, async (req, res) => {
    res.json({ tickets: await pool.listSegmentTickets(req.params.id, req.query.segmentId) });
  });

  // 项目协作成员(协作列点击查看)
  app.get("/api/ops/project-pool/:id/members", requireAuth, requirePlanner, async (req, res) => {
    try {
      res.json({ members: await pool.getProjectMembers(req.params.id) });
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 状态时长阈值配置(仅管理员)
  app.get("/api/ops/project-status-settings", requireAuth, requireAdmin, async (_req, res) => {
    res.json({ settings: await pool.getStatusSettings() });
  });
  app.put("/api/ops/project-status-settings", requireAuth, requireAdmin, async (req, res) => {
    res.json({ settings: await pool.saveStatusSettings(req.body?.settings) });
  });

  // 阶段时长阈值配置(仅管理员)
  app.get("/api/ops/project-stage-settings", requireAuth, requireAdmin, async (_req, res) => {
    res.json({ settings: await pool.getStageSettings() });
  });
  app.put("/api/ops/project-stage-settings", requireAuth, requireAdmin, async (req, res) => {
    res.json({ settings: await pool.saveStageSettings(req.body?.settings) });
  });
}
