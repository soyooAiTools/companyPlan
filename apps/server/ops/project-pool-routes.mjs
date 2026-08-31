// 项目池路由:只注册 + 调 service(分层)。挂 /api/ops/*。可见=策划(制片)或管理员。
import * as pool from "./services/ops-project-pool.mjs";
import { isAdmin, isPlanner, meId, soyooErrorResponse } from "./ops-helpers.mjs";

const PROJECT_POOL_MAX_PAGE_SIZE = 500;

function projectPoolPageSize(value, fallback = 20) {
  return Math.min(PROJECT_POOL_MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(value) || fallback)));
}

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
  // 我的项目:当前登录人参与的项目,所有登录用户可访问
  app.get("/api/ops/my-projects", requireAuth, async (req, res) => {
    try {
      res.json(
        await pool.listMyProjectPool({
          user: req.user,
          page: Number(req.query.page) || 1,
          pageSize: projectPoolPageSize(req.query.pageSize),
          q: String(req.query.q ?? ""),
          status: String(req.query.status ?? ""),
          stage: String(req.query.stage ?? ""),
          planner: String(req.query.planner ?? ""),
          segment: String(req.query.segment ?? ""),
          advancedFilter: String(req.query.advanced_filter ?? ""),
          sortBy: String(req.query.sortBy ?? ""),
          sortOrder: String(req.query.sortOrder ?? ""),
        }),
      );
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 列表(管理员全部 / 策划=自己负责的)
  app.get("/api/ops/project-pool", requireAuth, requirePlanner, async (req, res) => {
    try {
      res.json(
        await pool.listProjectPool({
          user: req.user,
          page: Number(req.query.page) || 1,
          pageSize: projectPoolPageSize(req.query.pageSize),
          q: String(req.query.q ?? ""),
          status: String(req.query.status ?? ""), // 不传则后端默认按「开启监控」的状态查
          stage: String(req.query.stage ?? ""), // 制作阶段多选(逗号分隔)
          planner: String(req.query.planner ?? ""), // 策划多选(逗号分隔)
          segment: String(req.query.segment ?? ""), // 环节多选(逗号分隔):只看包含这些未完成环节工单的项目
          advancedFilter: String(req.query.advanced_filter ?? ""),
          sortBy: String(req.query.sortBy ?? ""),
          sortOrder: String(req.query.sortOrder ?? ""),
        }),
      );
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 超时关注列表
  app.get("/api/ops/project-pool/stale", requireAuth, requirePlanner, async (req, res) => {
    try {
      res.json(
        await pool.listStale({
          user: req.user,
          page: Number(req.query.page) || 1,
          pageSize: projectPoolPageSize(req.query.pageSize),
          q: String(req.query.q ?? ""),
          status: String(req.query.status ?? ""),
          stage: String(req.query.stage ?? ""),
          planner: String(req.query.planner ?? ""),
          segment: String(req.query.segment ?? ""),
          advancedFilter: String(req.query.advanced_filter ?? ""),
          sortBy: String(req.query.sortBy ?? ""),
          sortOrder: String(req.query.sortOrder ?? ""),
        }),
      );
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

  // 进度分析:一次返回可见项目/版本和对应状态/阶段流转记录,避免前端逐项目请求。
  app.get("/api/ops/project-pool/progress-analysis", requireAuth, requirePlanner, async (req, res) => {
    try {
      res.json(
        await pool.progressAnalysis({
          user: req.user,
          q: String(req.query.q ?? ""),
          status: String(req.query.status ?? ""),
          stage: String(req.query.stage ?? ""),
          planner: String(req.query.planner ?? ""),
          segment: String(req.query.segment ?? ""),
          advancedFilter: String(req.query.advanced_filter ?? ""),
        }),
      );
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 按负责人查看:按项目成员标签批量取负责人,避免前端逐项目请求成员
  app.post("/api/ops/project-pool/owner-members", requireAuth, requirePlanner, async (req, res) => {
    try {
      res.json(await pool.listOwnerMembersByTags({ projectIds: req.body?.projectIds, tagNames: req.body?.tagNames }));
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 业务范围筛选项：取完整配置，不依赖当前页/当前负责人分组里实际出现的范围
  app.get("/api/ops/business-units", requireAuth, requirePlanner, async (_req, res) => {
    try {
      res.json({ units: await pool.listBusinessUnits() });
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 回收项目配置：交接账号从环境变量读取，展示信息从 soyoo 用户数据补齐。
  app.get("/api/ops/recycle-handoff-users", requireAuth, requirePlanner, async (_req, res) => {
    try {
      res.json({ ...pool.projectPoolRuntimeOptions(), users: await pool.listRecycleHandoffUsers() });
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 手动重建项目池快照(管理员):部署后可先跑一次预热,后续由 outbox/ops 修改增量刷新
  app.post("/api/ops/project-pool/rebuild-snapshot", requireAuth, requireAdmin, async (_req, res) => {
    try {
      res.json({ ok: true, count: await pool.rebuildProjectPoolSnapshots() });
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  app.get("/api/ops/project-pool/snapshot-stats", requireAuth, requireAdmin, async (_req, res) => {
    try {
      res.json(await pool.projectPoolSnapshotStats());
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 手动刷新单个项目快照(管理员):用于测试/修复单个项目状态变化,避免全量重建。
  app.post("/api/ops/project-pool/:id/refresh-snapshot", requireAuth, requireAdmin, async (req, res) => {
    try {
      const row = await pool.refreshProjectPoolSnapshot(req.params.id);
      res.json({ ok: true, refreshed: !!row });
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // helper-server 推荐成员弹框按项目 ID 查询阶段；直接读落库快照，不依赖 Redis 缓存。
  app.post("/api/ops/project-pool/stages", async (req, res) => {
    try {
      res.json({ stages: await pool.lookupProjectPoolStages(req.body?.projectIds || req.body?.project_ids) });
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 分组头部工单弹框:按项目批量查工单,避免前端逐环节请求导致漏数
  app.post("/api/ops/project-pool/group-tickets", requireAuth, requirePlanner, async (req, res) => {
    try {
      res.json({
        tickets: await pool.listProjectPoolTickets({
          projectIds: req.body?.projectIds,
          mode: req.body?.mode,
          segmentIds: req.body?.segmentIds,
          ownerName: req.body?.ownerName,
        }),
      });
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 改项目状态(策划本人/管理员)
  app.post("/api/ops/project-pool/:id/status", requireAuth, requirePlanner, async (req, res) => {
    let r;
    try {
      r = await pool.changeProjectStatus({
        user: req.user,
        projectId: req.params.id,
        status: String(req.body?.status ?? ""),
        commentHtml: req.body?.commentHtml,
        force: req.body?.force === true,
        recycleHandoffUsername: req.body?.recycleHandoffUsername,
      });
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

  // 改项目计划交付日期(策划本人/管理员;临时校准入口,写回 soyoo)
  app.post("/api/ops/project-pool/:id/stage-deadlines", requireAuth, requirePlanner, async (req, res) => {
    let r;
    try {
      r = await pool.changeProjectStageDeadlines({ user: req.user, projectId: req.params.id, stageBaseDate: req.body?.stageBaseDate, stageDeadlines: req.body?.stageDeadlines });
    } catch (e) {
      return soyooErrorResponse(res, e);
    }
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  });

  // 改项目版本加急标记(管理员;写回 soyoo project_versions,再刷新快照)
  app.post("/api/ops/project-pool/:id/urgent", requireAuth, requireAdmin, async (req, res) => {
    try {
      const isUrgent = req.body?.isUrgent === true || req.body?.is_urgent === true;
      const r = await pool.changeProjectUrgent({ user: req.user, projectId: req.params.id, isUrgent });
      if (r.error) return res.status(r.code || 400).json({ error: r.error });
      res.json(r);
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 转交策划(策划本人/管理员;写回 soyoo 成员关系,再刷新快照)
  app.post("/api/ops/project-pool/:id/planner", requireAuth, requirePlanner, async (req, res) => {
    let r;
    try {
      r = await pool.changeProjectPlanner({ user: req.user, projectId: req.params.id, toUserId: req.body?.toUserId ?? req.body?.to_user_id, remark: req.body?.remark });
    } catch (e) {
      return soyooErrorResponse(res, e);
    }
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  });

  // 改客户对接人/需求文档(策划本人/管理员;写回 soyoo 并同步飞书)
  app.post("/api/ops/project-pool/:id/meta", requireAuth, requirePlanner, async (req, res) => {
    let r;
    try {
      r = await pool.changeProjectMeta({ user: req.user, projectId: req.params.id, customerContact: req.body?.customerContact, requirementDoc: req.body?.requirementDoc });
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
      r = await pool.changeProjectRemark({ user: req.user, projectId: req.params.id, remark: req.body?.remark, field: req.body?.field });
    } catch (e) {
      return soyooErrorResponse(res, e);
    }
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  });

  // 项目状态/阶段流转记录(同一时间线)
  app.get("/api/ops/project-pool/:id/status-logs", requireAuth, requirePlanner, async (req, res) => {
    res.json({ logs: await pool.getStatusLogs(req.params.id, { includeParentLegacy: req.query.include_parent === "1" }) });
  });

  // 某环节下的未完成工单(目前环节点击查看,纯本地工单表)
  app.get("/api/ops/project-pool/:id/segment-tickets", requireAuth, requirePlanner, async (req, res) => {
    res.json({ tickets: await pool.listSegmentTickets(req.params.id, req.query.segmentId) });
  });

  // 项目池里的环节工单详情:查看「谁提给谁」及需求说明/流转记录
  app.get("/api/ops/project-pool/:id/segment-tickets/:ticketId", requireAuth, requirePlanner, async (req, res) => {
    try {
      const r = await pool.getSegmentTicketDetail({ user: req.user, projectId: req.params.id, segmentId: req.query.segmentId, ticketId: req.params.ticketId });
      if (r?.error) return res.status(r.code || 400).json({ error: r.error });
      res.json(r);
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 项目协作成员(协作列点击查看)。项目池视角仅策划/管理员可进；我的项目里普通成员也允许查看自己参与项目/版本的成员。
  app.get("/api/ops/project-pool/:id/members", requireAuth, async (req, res) => {
    try {
      const members = await pool.getProjectMembers(req.params.id);
      if (!isAdmin(req.user) && !(await isPlanner(req.user)) && !members.some((member) => String(member.id) === String(meId(req.user)))) {
        return res.status(403).json({ error: "无权查看该项目成员" });
      }
      res.json({ members });
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
