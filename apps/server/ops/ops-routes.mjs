// 需求提单 —— 新接口(Prisma,挂 /api/ops/*)。环节=ops 自定义"分类",绑定 soyoo 标签。
import crypto from "node:crypto";
import { addBusinessHours, remainingBusinessHours } from "./business-hours.mjs";
import { MAX_CONTENT_HTML, sanitizeRichHtml, htmlToPlain, isBlankRich } from "../utils/rich-html.mjs";
import { prisma } from "./prisma.mjs";
import { createDirectUploadUrl, isOssConfigured, uploadObject } from "./oss.mjs";
import { ossConfig } from "../config/runtime.mjs";
import { soyooId } from "./soyoo-client.mjs";
import { isAdmin, meId, nowIso, clip, isPlanner, soyooErrorResponse } from "./ops-helpers.mjs";
import { listMyProjects, listAllProjects, getProjectWithMembers, listTenants, listTags, getResponsibles, buildTicketSnapshot } from "./ops-realtime.mjs";
import * as notif from "./services/ops-notifications.mjs";
import { refreshProjectPoolSnapshot } from "./services/ops-project-pool.mjs";
import { effectiveSegmentTagIds } from "./segment-tag-match.mjs";

const PRIORITIES = new Set(["紧急", "优先", "普通", "低优先"]);
const STATUSES = ["排队中", "进行中", "阻塞", "已完成"];

// 富文本 sanitize / 纯文本派生 / 空判断 / 大小上限 → 公用模块 ../utils/rich-html.mjs(提单正文与项目备注共用)

function mapTicket(t, segNameById) {
  return {
    id: t.id,
    title: t.title,
    client: t.client_name ?? t.source_project_name ?? "", // 客户名(快照)
    projectName: t.project_name ?? "",
    projectId: t.project_id,
    tagName: (t.segment_id != null && segNameById?.get(t.segment_id)) || t.discipline, // 环节名:优先按 segment_id 取「当前」名,回退历史快照
    needType: t.need_type,
    priority: t.priority,
    status: t.status,
    dueInHours: t.due_in_hours,
    ownerId: t.owner_id,
    ownerName: t.owner_name ?? "",
    ownerAvatar: t.owner_avatar ?? "",
    requesterId: t.requester_id,
    requesterName: t.requester_name ?? "",
    requesterAvatar: t.requester_avatar ?? "",
    summary: t.summary ?? "",
    contentHtml: t.content_html ?? "",
    adminNote: t.admin_note ?? "",
    adminNoteUpdatedAt: t.admin_note_updated_at ?? null,
    hyperlink: t.hyperlink ?? "",
    blockReason: t.block_reason ?? "",
    riskWarningHours: t.risk_warning_hours ?? 8,
    remainingHours: t.status === "已完成" ? null : remainingBusinessHours(t.due_at), // 距交付的工作小时(正=剩,负=超期);已完成=null
    createdAt: t.created_at,
    statusUpdatedAt: t.status_updated_at,
  };
}

function splitQueryList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitNumberQueryList(value) {
  return splitQueryList(value)
    .map((item) => Number(item))
    .filter((value) => Number.isFinite(value));
}

// 权限标记:状态=负责人/管理员;需求说明=提单人/管理员;指派=负责人/提单人/管理员;优先级=管理员/策划
function withCanEdit(t, user, segNameById, planner = false) {
  const admin = isAdmin(user);
  const userId = meId(user);
  const ticket = mapTicket(t, segNameById);
  if (!admin) {
    delete ticket.adminNote;
    delete ticket.adminNoteUpdatedAt;
  }
  return {
    ...ticket,
    canEdit: admin || t.owner_id === userId,
    canEditContent: admin || t.requester_id === userId,
    canAssign: admin || t.owner_id === userId || t.requester_id === userId,
    canEditPriority: admin || planner,
    canEditAdminNote: admin,
  };
}

// 给工单(单条或数组)打权限标记;planner(=改优先级权限)按用户算一次,避免逐条查 soyoo;admin 直接放行不查。
async function decorateTickets(rowsOrRow, user, segNameById) {
  const planner = isAdmin(user) ? false : await isPlanner(user);
  const asArray = Array.isArray(rowsOrRow);
  let rows = asArray ? rowsOrRow : [rowsOrRow];
  if (isAdmin(user)) {
    const noteMap = await loadTicketAdminNoteMap(rows.map((t) => t.id));
    rows = rows.map((t) => ({ ...t, ...(noteMap.get(String(t.id)) || {}) }));
  }
  return asArray ? rows.map((t) => withCanEdit(t, user, segNameById, planner)) : withCanEdit(rows[0], user, segNameById, planner);
}

// 环节 id→当前名 映射:工单显示「环节」时按 segment_id 取当前名(改名即时反映,不依赖名字快照)
async function loadSegNameMap() {
  const rows = await prisma.ops_segments.findMany({ select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function loadTicketAdminNoteMap(ticketIds) {
  const ids = [...new Set((ticketIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, admin_note, admin_note_updated_at FROM tickets WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  return new Map(rows.map((row) => [String(row.id), row]));
}

function statusActionLabel(from, to) {
  if (to === "进行中" && from === "排队中") return "开始处理";
  if (to === "进行中" && from === "阻塞") return "继续处理";
  if (to === "进行中" && from === "已完成") return "重新打开";
  if (to === "阻塞") return "阻塞";
  if (to === "已完成") return "完成";
  return "状态变更";
}

async function logTicketEvent({ ticketId, user, action, fromStatus = null, toStatus = null, note = null }) {
  await prisma.ticket_events.create({
    data: {
      ticket_id: ticketId,
      actor_id: user?.id ?? null,
      actor_name: user?.name ?? user?.username ?? "",
      action,
      from_status: fromStatus,
      to_status: toStatus,
      note: note ? String(note).slice(0, 500) : null,
      created_at: nowIso(),
    },
  });
}

// 环节列表 + 各自绑定的标签(id 为 INT → JS number)
async function loadSegments() {
  const segments = await prisma.ops_segments.findMany({ orderBy: [{ sort_order: "asc" }, { name: "asc" }] });
  const links = await prisma.ops_segment_tags.findMany();
  // 标签名实时查 soyoo(本地不再存 tags);失败则回退 tag_id
  const liveTags = await listTags().catch(() => []);
  const tagNameById = new Map(liveTags.map((t) => [String(t.id), t.name]));
  const bySeg = new Map();
  for (const l of links) {
    if (!bySeg.has(l.segment_id)) bySeg.set(l.segment_id, []);
    bySeg.get(l.segment_id).push({ id: String(l.tag_id), name: tagNameById.get(String(l.tag_id)) ?? String(l.tag_id) });
  }
  return segments.map((s) => ({
    id: s.id,
    name: s.name,
    defaultDeliveryHours: s.default_delivery_hours,
    riskWarningHours: s.risk_warning_hours,
    sortOrder: s.sort_order,
    tags: bySeg.get(s.id) ?? [],
  }));
}

async function loadSegmentTags(segmentId) {
  const links = await prisma.ops_segment_tags.findMany({ where: { segment_id: segmentId }, select: { tag_id: true } });
  if (!links.length) return [];
  const liveTags = await listTags().catch(() => []);
  const tagNameById = new Map(liveTags.map((t) => [String(t.id), t.name]));
  return links.map((row) => ({ id: String(row.tag_id), name: tagNameById.get(String(row.tag_id)) ?? String(row.tag_id) }));
}

async function prepareTicketCreate({ user, body }) {
  const projectId = body.projectId ? String(body.projectId) : "";
  const segmentId = Number(body.segmentId);
  const ownerId = body.ownerId ? String(body.ownerId) : "";
  if (!projectId || !Number.isInteger(segmentId) || !ownerId) return { error: "项目、环节、负责人均必填" };

  const rawHtml = body.contentHtml != null ? String(body.contentHtml) : "";
  if (rawHtml.length > MAX_CONTENT_HTML) return { status: 413, error: "内容过大,请压缩图片后重试" };
  const contentHtml = isBlankRich(rawHtml) ? "" : sanitizeRichHtml(rawHtml);
  const summaryText = htmlToPlain(contentHtml) || clip(body.summary, 2000);

  const segment = await prisma.ops_segments.findUnique({ where: { id: segmentId } });
  if (!segment) return { error: "环节不存在" };
  const segTags = await loadSegmentTags(segmentId);
  if (!segTags.length) return { error: "该环节未绑定任何标签" };

  let built;
  try {
    built = await buildTicketSnapshot({ projectId, ownerId, requesterUserId: meId(user), segTags });
  } catch (e) {
    return { soyooError: e };
  }
  if (built.error) return { error: built.error };
  const s = built.snapshot;
  const now = nowIso();
  const dueAt = addBusinessHours(now, segment.default_delivery_hours);
  const warnAt = addBusinessHours(now, segment.risk_warning_hours);
  const id = crypto.randomUUID();

  return {
    id,
    projectId: s.project_id,
    data: {
      id,
      title: clip(body.title, 160) || "未命名需求",
      source_project_name: clip(s.client_name, 160),
      client_id: s.client_id,
      client_name: clip(s.client_name, 160),
      project_name: clip(s.project_name, 160),
      project_id: s.project_id,
      project_status: clip(s.project_status, 80),
      tag_id: s.tag_id,
      tag_name: clip(s.tag_name, 120),
      segment_id: segmentId,
      discipline: clip(segment.name, 80),
      requester_id: s.requester_id,
      requester_name: clip(s.requester_name, 120),
      requester_avatar: clip(s.requester_avatar, 1024),
      requester_username: clip(s.requester_username, 120),
      owner_id: s.owner_id,
      owner_name: clip(s.owner_name, 120),
      owner_avatar: clip(s.owner_avatar, 1024),
      owner_username: clip(s.owner_username, 120),
      status: "排队中",
      priority: PRIORITIES.has(body.priority) ? body.priority : "普通",
      start_at: now,
      due_in_hours: segment.default_delivery_hours,
      risk_warning_hours: segment.risk_warning_hours,
      due_at: dueAt,
      warn_at: warnAt,
      need_type: clip(body.needType, 120) || segment.name,
      summary: clip(summaryText, 2000) || (contentHtml ? "[图片/附件]" : ""),
      content_html: contentHtml || null,
      hyperlink: body.hyperlink ? clip(body.hyperlink, 500) : null,
      text: body.text ? clip(body.text, 500) : null,
      created_at: now,
      updated_at: now,
      status_updated_at: now,
    },
  };
}

function ticketBatchErrorLabel(item, index) {
  const title = String(item?.title || "").trim();
  const owner = String(item?.ownerName || item?.ownerId || "").trim();
  const suffix = [owner, title].filter(Boolean).join(" · ");
  return `工单 ${index + 1}${suffix ? `（${suffix}）` : ""}`;
}

export function registerOpsRoutes(app, { requireAuth, requireAdmin }) {
  // 当前登录用户(供前端按角色显示菜单)
  app.get("/api/ops/me", requireAuth, async (req, res) => {
    const u = req.user || {};
    const p = await prisma.people.findUnique({ where: { id: String(u.id) }, select: { wechat_avatar: true, wechat_name: true } }).catch(() => null);
    // isPlanner:soyoo 用户带「制片」标签 = 策划(决定「项目池」菜单可见 + 策划视角)
    const planner = await isPlanner(u);
    const notifyWindow = await notif.getNotifyWindow();
    res.json({ user: { id: u.id, name: u.name || u.username || "", username: u.username || "", roleKey: u.roleKey || "", isAdmin: u.roleKey === "admin", isPlanner: planner, avatar: p?.wechat_avatar ?? "", wechatName: p?.wechat_name ?? "", notifyStart: notifyWindow.start, notifyEnd: notifyWindow.end } });
  });

  // 原始 soyoo 标签(供环节配置页绑定):实时查 soyoo
  app.get("/api/ops/tags", requireAuth, async (_req, res) => {
    const tags = await listTags().catch(() => []);
    res.json({ tags });
  });

  // 富文本编辑器资源直传 URL。浏览器拿到签名后直接 PUT 到 OSS,避免大文件经过 ops 后端。
  app.post("/api/ops/upload-url", requireAuth, async (req, res) => {
    if (!isOssConfigured()) return res.status(503).json({ error: "OSS 未配置(请在根 .env 填 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET)" });
    const b = req.body ?? {};
    const mime = String(b.mime || "application/octet-stream").toLowerCase();
    const filename = String(b.filename || "").trim();
    const size = Number(b.size || 0);
    if (!filename) return res.status(400).json({ error: "缺少文件名" });
    if (!size || size < 0) return res.status(400).json({ error: "缺少文件大小" });
    const isImage = mime.startsWith("image/");
    const max = isImage ? ossConfig.maxImageBytes : ossConfig.maxFileBytes;
    if (size > max) return res.status(413).json({ error: isImage ? "图片过大(超过 5MB)" : "文件过大(超过 55MB)" });
    try {
      const signed = await createDirectUploadUrl({ projectId: b.projectId, filename, mime });
      res.json(signed);
    } catch (e) {
      res.status(502).json({ error: e?.message || "生成上传地址失败" });
    }
  });

  // 富文本编辑器图片上传 → 阿里云 OSS,返回公开 URL。Body: { projectName, mime, dataBase64 }
  app.post("/api/ops/upload", requireAuth, async (req, res) => {
    if (!isOssConfigured()) return res.status(503).json({ error: "OSS 未配置(请在根 .env 填 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET)" });
    const b = req.body ?? {};
    const mime = String(b.mime || "").toLowerCase();
    if (!mime) return res.status(400).json({ error: "缺少文件类型" });
    const base64 = typeof b.dataBase64 === "string" ? b.dataBase64.replace(/^data:[^;]+;base64,/, "") : "";
    if (!base64) return res.status(400).json({ error: "缺少文件数据" });
    let buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch {
      return res.status(400).json({ error: "文件数据不合法" });
    }
    if (!buffer.length) return res.status(400).json({ error: "文件为空" });
    // 图片 ≤5MB;视频/压缩包等其它文件 ≤55MB
    const isImage = mime.startsWith("image/");
    const max = isImage ? ossConfig.maxImageBytes : ossConfig.maxFileBytes;
    if (buffer.length > max) return res.status(413).json({ error: isImage ? "图片过大(超过 5MB)" : "文件过大(超过 55MB)" });
    try {
      const url = await uploadObject({ projectId: b.projectId, filename: b.filename, buffer, mime });
      res.json({ url });
    } catch (e) {
      res.status(502).json({ error: e?.message || "上传失败" });
    }
  });

  // 客户:实时查 soyoo。前端可传 keyword/page/limit(服务端搜索/分页);不传则取全(下拉默认用)
  app.get("/api/ops/tenants", requireAuth, async (req, res) => {
    const { keyword, page, limit } = req.query;
    const tenants = await listTenants({ keyword, page, limit }).catch(() => []);
    res.json({ tenants });
  });

  // 项目:只返当前用户参与的(实时查 soyoo「我的项目」),可按客户过滤
  app.get("/api/ops/projects", requireAuth, async (req, res) => {
    try {
      const all = isAdmin(req.user) ? await listAllProjects() : await listMyProjects(req.user); // 管理员看全部非回收项目
      const tenantId = req.query.tenantId ? String(req.query.tenantId) : "";
      const projects = (tenantId ? all.filter((p) => p.clientId === tenantId) : all).map((p) => ({
        id: p.id,
        name: p.name,
        tenantId: p.clientId,
        client: p.client,
        status: p.status,
      }));
      res.json({ projects });
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 环节(分类)列表 + 绑定 + 配置
  app.get("/api/ops/segments", requireAuth, async (_req, res) => {
    res.json({ segments: await loadSegments() });
  });

  // 新建环节
  app.post("/api/ops/segments", requireAuth, requireAdmin, async (req, res) => {
    const name = clip(req.body?.name, 80).trim();
    if (!name) return res.status(400).json({ error: "环节名必填" });
    try {
      const seg = await prisma.ops_segments.create({
        data: { name, default_delivery_hours: 72, risk_warning_hours: 8, sort_order: 0, updated_at: nowIso() },
      });
      res.status(201).json({ segment: { id: seg.id, name: seg.name, defaultDeliveryHours: seg.default_delivery_hours, riskWarningHours: seg.risk_warning_hours, sortOrder: seg.sort_order, tags: [] } });
    } catch {
      res.status(400).json({ error: "环节名已存在或创建失败" });
    }
  });

  // 更新环节:配置(name/交付/阈值/排序)+ 绑定标签(tagIds 全量替换)
  app.put("/api/ops/segments/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "环节 id 不合法" });
    const b = req.body ?? {};
    const before = await prisma.ops_segments.findUnique({ where: { id }, select: { name: true } });
    const data = { updated_at: nowIso() };
    if (b.name != null) data.name = clip(b.name, 80).trim();
    if (b.defaultDeliveryHours != null) data.default_delivery_hours = Math.max(1, Math.min(720, Number(b.defaultDeliveryHours) || 72));
    if (b.riskWarningHours != null) data.risk_warning_hours = Math.max(1, Math.min(168, Number(b.riskWarningHours) || 8));
    if (b.sortOrder != null) data.sort_order = Number(b.sortOrder) || 0;
    try {
      await prisma.ops_segments.update({ where: { id }, data });
    } catch {
      return res.status(404).json({ error: "环节不存在" });
    }
    // 环节改名 → 同步存量工单的环节名(工单存的是名字快照,未按 id 关联)
    if (data.name && before && data.name !== before.name) {
      await prisma.tickets.updateMany({ where: { discipline: before.name }, data: { discipline: data.name } });
    }
    if (Array.isArray(b.tagIds)) {
      await prisma.ops_segment_tags.deleteMany({ where: { segment_id: id } });
      const rows = b.tagIds.map((t) => ({ segment_id: id, tag_id: String(t) })).filter((r) => r.tag_id);
      if (rows.length) await prisma.ops_segment_tags.createMany({ data: rows, skipDuplicates: true });
    }
    const segments = await loadSegments();
    res.json({ segment: segments.find((s) => s.id === id) ?? null });
  });

  // 环节排序(拖拽):按传入的 id 顺序写 sort_order(0,1,2…)
  app.post("/api/ops/segments/reorder", requireAuth, requireAdmin, async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)).filter(Number.isInteger) : [];
    if (!ids.length) return res.status(400).json({ error: "缺少 ids" });
    const now = nowIso();
    await prisma.$transaction(ids.map((id, i) => prisma.ops_segments.update({ where: { id }, data: { sort_order: i, updated_at: now } })));
    res.json({ segments: await loadSegments() });
  });

  // 删除环节
  app.delete("/api/ops/segments/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "环节 id 不合法" });
    await prisma.ops_segment_tags.deleteMany({ where: { segment_id: id } });
    await prisma.ops_segments.delete({ where: { id } }).catch(() => {});
    res.json({ ok: true });
  });

  // 该项目「环节 → 成员」:成员标签 ∈ 环节绑定标签(实时查 soyoo 成员;环节/绑定来自本地 ops)
  app.get("/api/ops/projects/:id/responsibles", requireAuth, async (req, res) => {
    const projectId = soyooId(req.params.id);
    const segments = await loadSegments();
    try {
      const result = await getResponsibles(projectId, segments);
      res.json(result);
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 提单列表 —— 需求提单是「个人数据」:始终只看与我相关(owner 或 requester),管理员也不例外。
  // scope: all=我相关的全部 / owner=我负责的 / requester=我提单的
  app.get("/api/ops/tickets", requireAuth, async (req, res) => {
    const user = req.user;
    const qy = req.query;
    const scope = String(qy.scope ?? "all"); // all | owner | requester | overdue
    const overdueOnly = qy.overdueOnly === "1" || qy.overdueOnly === "true";
    const sortBy = String(qy.sortBy ?? "");
    const sortOrder = String(qy.sortOrder ?? "") === "asc" ? "asc" : String(qy.sortOrder ?? "") === "desc" ? "desc" : "";
    const me = meId(user);
    const page = Math.max(1, Number(qy.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(qy.pageSize) || 20));

    // 可见性 + scope:管理员 all=全部;owner/requester=对应自己;普通用户"全部"=自己相关
    let base;
    if (scope === "owner") base = { owner_id: me };
    else if (scope === "requester") base = { requester_id: me };
    else if (isAdmin(user)) base = {};
    else base = { OR: [{ owner_id: me }, { requester_id: me }] };

    // 除"状态"外的筛选(状态单独加,以便给状态 chip 计数)
    const filters = [];
    const priorityNames = splitQueryList(qy.priority).filter((name) => PRIORITIES.has(name));
    const segmentIds = splitNumberQueryList(qy.segment);
    const statusNames = splitQueryList(qy.status).filter((name) => STATUSES.includes(name));
    if (priorityNames.length) filters.push({ priority: { in: priorityNames } });
    if (segmentIds.length) filters.push({ segment_id: { in: segmentIds } });
    const kw = String(qy.q ?? "").trim();
    if (kw)
      filters.push({
        OR: [
          { title: { contains: kw } },
          { project_name: { contains: kw } },
          { client_name: { contains: kw } },
          { owner_name: { contains: kw } },
          { requester_name: { contains: kw } },
          { id: { contains: kw } },
        ],
      });
    const titleKw = String(qy.title ?? "").trim();
    if (titleKw)
      filters.push({
        OR: [{ title: { contains: titleKw } }, { id: { contains: titleKw } }],
      });
    const projectKw = String(qy.project ?? "").trim();
    if (projectKw)
      filters.push({
        OR: [{ project_name: { contains: projectKw } }, { client_name: { contains: projectKw } }],
      });
    const requesterKw = String(qy.requester ?? "").trim();
    if (requesterKw) filters.push({ requester_name: { contains: requesterKw } });
    const ownerKw = String(qy.owner ?? "").trim();
    if (ownerKw) filters.push({ owner_name: { contains: ownerKw } });

    let orderBy = [{ created_at: "desc" }, { id: "desc" }];
    // 延期预警:未完成 且 warn_at < 现在,按截止时间升序(最急在前)
    if (scope === "overdue" || (overdueOnly && isAdmin(user))) {
      filters.push({ status: { not: "已完成" } }, { warn_at: { not: null } }, { warn_at: { lt: nowIso() } });
      orderBy = [{ due_at: "asc" }];
    }
    if (sortBy === "createdAt" && sortOrder) {
      orderBy = [{ created_at: sortOrder }, { id: "desc" }];
    } else if (sortBy === "remaining" && sortOrder) {
      orderBy = [{ due_at: sortOrder }, { id: "desc" }];
    }

    const whereNoStatus = { AND: [base, ...filters] };
    const where = statusNames.length ? { AND: [base, ...filters, { status: { in: statusNames } }] } : whereNoStatus;

    const [total, rows, grouped] = await Promise.all([
      prisma.tickets.count({ where }),
      prisma.tickets.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, omit: { content_html: true } }),
      // 各状态计数(给状态筛选 chip 用;延期 tab 不需要)
      scope === "overdue" ? Promise.resolve([]) : prisma.tickets.groupBy({ by: ["status"], where: whereNoStatus, _count: { _all: true } }),
    ]);
    const counts = {};
    for (const g of grouped) counts[g.status] = g._count._all;
    const segNameById = await loadSegNameMap();
    res.json({ tickets: await decorateTickets(rows, user, segNameById), total, page, pageSize, counts });
  });

  // 建单:按环节(segmentId)。owner 须为该项目下、标签 ∈ 环节绑定标签 的成员
  app.post("/api/ops/tickets", requireAuth, async (req, res) => {
    const user = req.user;
    const b = req.body ?? {};

    const batchItems = Array.isArray(b.tickets) ? b.tickets : null;
    if (batchItems) {
      const items = batchItems.slice(0, 20).map((item) => ({ ...item, projectId: item?.projectId ?? b.projectId, priority: item?.priority ?? b.priority }));
      if (!items.length) return res.status(400).json({ error: "请至少填写一条工单" });
      const prepared = [];
      for (let i = 0; i < items.length; i += 1) {
        const result = await prepareTicketCreate({ user, body: items[i] });
        if (result.soyooError) return soyooErrorResponse(res, result.soyooError);
        if (result.error) return res.status(result.status || 400).json({ error: `${ticketBatchErrorLabel(items[i], i)}：${result.error}` });
        prepared.push(result);
      }
      const createdRows = await prisma.$transaction(async (tx) => {
        const rows = [];
        for (const item of prepared) {
          const created = await tx.tickets.create({ data: item.data });
          await tx.ticket_events.create({
            data: {
              ticket_id: created.id,
              actor_id: meId(user),
              actor_name: user?.name ?? user?.username ?? "",
              action: "建单",
              from_status: null,
              to_status: "排队中",
              note: null,
              created_at: nowIso(),
            },
          });
          rows.push(created);
        }
        return rows;
      });
      for (const created of createdRows) {
        await notif.notifyTicketAssigned(created, meId(user));
      }
      for (const projectId of new Set(createdRows.map((ticket) => ticket.project_id))) {
        void refreshProjectPoolSnapshot(projectId).catch(() => {});
      }
      return res.status(201).json({ tickets: await decorateTickets(createdRows, user, await loadSegNameMap()) });
    }

    const prepared = await prepareTicketCreate({ user, body: b });
    if (prepared.soyooError) return soyooErrorResponse(res, prepared.soyooError);
    if (prepared.error) return res.status(prepared.status || 400).json({ error: prepared.error });
    const created = await prisma.tickets.create({
      data: prepared.data,
    });
    await logTicketEvent({ ticketId: created.id, user, action: "建单", toStatus: "排队中" });
    await notif.notifyTicketAssigned(created, meId(user)); // 通知负责人(指给自己不通知;失败不影响建单)
    void refreshProjectPoolSnapshot(created.project_id).catch(() => {});
    res.status(201).json({ ticket: await decorateTickets(created, user, await loadSegNameMap()) });
  });

  // 项目成员(指派候选 / 选负责人):实时查 soyoo
  app.get("/api/ops/projects/:id/members", requireAuth, async (req, res) => {
    try {
      const { members } = await getProjectWithMembers(soyooId(req.params.id));
      const segments = await loadSegments();
      const enriched = members.map((m) => {
        const tagIds = new Set((m.tags || []).map((t) => String(t.id)));
        const segmentNames = segments
          .filter((seg) => effectiveSegmentTagIds(seg.tags).some((tagId) => tagIds.has(tagId)))
          .map((seg) => seg.name);
        return { ...m, segmentNames };
      });
      res.json({ members: enriched });
    } catch (e) {
      soyooErrorResponse(res, e);
    }
  });

  // 指派/改派:把工单转给该项目的另一个成员(管理员/当前负责人/当前提单人可操作)
  app.post("/api/ops/tickets/:id/assign", requireAuth, async (req, res) => {
    const user = req.user;
    const id = String(req.params.id);
    const newOwnerId = req.body?.ownerId ? String(req.body.ownerId) : "";
    if (!newOwnerId) return res.status(400).json({ error: "请选择负责人" });
    const t = await prisma.tickets.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "提单不存在" });
    if (!isAdmin(user) && t.owner_id !== meId(user) && t.requester_id !== meId(user)) return res.status(403).json({ error: "只有管理员、当前负责人或当前提单人可指派" });
    let member;
    try {
      const { members } = await getProjectWithMembers(t.project_id);
      member = members.find((m) => m.id === newOwnerId);
    } catch (e) {
      return soyooErrorResponse(res, e);
    }
    if (!member) return res.status(400).json({ error: "该负责人不在此项目" });
    const updated = await prisma.tickets.update({
      where: { id },
      data: {
        owner_id: member.id,
        owner_name: clip(member.name, 120),
        owner_avatar: clip(member.avatar, 1024),
        owner_username: clip(member.username, 120),
        updated_at: nowIso(),
      },
    });
    await logTicketEvent({ ticketId: id, user, action: "指派", note: `指派给 ${member.name}` });
    await notif.notifyTicketAssigned(updated, meId(user)); // 改派后通知新负责人(指给自己不通知)
    void refreshProjectPoolSnapshot(updated.project_id).catch(() => {});
    res.json({ ticket: await decorateTickets(updated, user, await loadSegNameMap()) });
  });

  // 改状态(仅负责人或管理员;提单人不能改,不满意线下沟通)
  app.patch("/api/ops/tickets/:id/status", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const status = String(req.body?.status ?? "");
    if (!STATUSES.includes(status)) return res.status(400).json({ error: "状态不合法" });
    const t = await prisma.tickets.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "提单不存在" });
    const user = req.user;
    if (!isAdmin(user) && t.owner_id !== meId(user)) return res.status(403).json({ error: "无权修改(仅负责人或管理员)" });
    const now = nowIso();
    const reason = clip(req.body?.reason, 500) || null; // 完成/阻塞 的备注都记进流转记录
    const data = { status, updated_at: now, status_updated_at: now };
    if (status === "阻塞") data.block_reason = reason;
    const updated = await prisma.tickets.update({ where: { id }, data });
    await logTicketEvent({ ticketId: id, user, action: statusActionLabel(t.status, status), fromStatus: t.status, toStatus: status, note: reason });
    await notif.notifyStatusChanged(updated, t.status, status, meId(user)); // 通知负责人(自己改自己的单不通知)
    void refreshProjectPoolSnapshot(updated.project_id).catch(() => {});
    res.json({ ticket: await decorateTickets(updated, user, await loadSegNameMap()) });
  });

  // 改优先级(管理员或策划),记入流转记录,并通知负责人
  app.patch("/api/ops/tickets/:id/priority", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const priority = String(req.body?.priority ?? "");
    if (!PRIORITIES.has(priority)) return res.status(400).json({ error: "优先级不合法" });
    const t = await prisma.tickets.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "提单不存在" });
    const user = req.user;
    const planner = isAdmin(user) ? false : await isPlanner(user);
    if (!isAdmin(user) && !planner) return res.status(403).json({ error: "无权修改(仅管理员或策划)" });
    if (t.priority === priority) return res.json({ ticket: withCanEdit(t, user, await loadSegNameMap(), planner) });
    const updated = await prisma.tickets.update({
      where: { id },
      data: { priority, updated_at: nowIso() },
    });
    await logTicketEvent({ ticketId: id, user, action: "修改优先级", note: `优先级「${t.priority}」→「${priority}」` });
    await notif.notifyPriorityChanged(updated, t.priority, priority, meId(user)); // 通知负责人(自己改自己不通知)
    res.json({ ticket: withCanEdit(updated, user, await loadSegNameMap(), planner) });
  });

  // 改需求说明(富文本;仅提单人或管理员)。建单后正文可改,其它字段不可改。
  app.patch("/api/ops/tickets/:id", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const t = await prisma.tickets.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "提单不存在" });
    const user = req.user;
    if (!isAdmin(user) && t.requester_id !== meId(user)) return res.status(403).json({ error: "无权修改(仅提单人或管理员)" });
    const rawHtml = req.body?.contentHtml != null ? String(req.body.contentHtml) : "";
    if (rawHtml.length > MAX_CONTENT_HTML) return res.status(413).json({ error: "内容过大,请压缩图片后重试" });
    const contentHtml = isBlankRich(rawHtml) ? "" : sanitizeRichHtml(rawHtml);
    const summaryText = htmlToPlain(contentHtml);
    const now = nowIso();
    const updated = await prisma.tickets.update({
      where: { id },
      data: { content_html: contentHtml || null, summary: clip(summaryText, 2000) || (contentHtml ? "[图片/附件]" : ""), updated_at: now },
    });
    await logTicketEvent({ ticketId: id, user, action: "修改需求说明" });
    res.json({ ticket: await decorateTickets(updated, user, await loadSegNameMap()) });
  });

  // 改管理员内部备注:只给管理员看/改,不写普通流转记录。
  app.patch("/api/ops/tickets/:id/admin-note", requireAuth, async (req, res) => {
    const user = req.user;
    if (!isAdmin(user)) return res.status(403).json({ error: "仅管理员可修改内部备注" });
    const id = String(req.params.id);
    const t = await prisma.tickets.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: "提单不存在" });
    const adminNote = clip(req.body?.adminNote, 100);
    const now = nowIso();
    await prisma.$executeRaw`UPDATE tickets SET admin_note = ${adminNote || null}, admin_note_updated_at = ${now}, updated_at = ${now} WHERE id = ${id}`;
    const updated = await prisma.tickets.findUnique({ where: { id } });
    res.json({ ticket: await decorateTickets(updated, user, await loadSegNameMap()) });
  });

  // 流转记录(时间线)
  app.get("/api/ops/tickets/:id/events", requireAuth, async (req, res) => {
    const events = await prisma.ticket_events.findMany({ where: { ticket_id: String(req.params.id) }, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
    res.json({
      events: events.map((e) => ({ id: e.id, actorName: e.actor_name ?? "", action: e.action, fromStatus: e.from_status ?? "", toStatus: e.to_status ?? "", note: e.note ?? "", createdAt: e.created_at })),
    });
  });

  // 富文本正文(按需:点详情/查看/编辑时才拉,列表不返,避免列表带大字段)
  app.get("/api/ops/tickets/:id/content", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const t = await prisma.tickets.findUnique({ where: { id }, select: { content_html: true, owner_id: true, requester_id: true } });
    if (!t) return res.status(404).json({ error: "提单不存在" });
    const user = req.user;
    if (!isAdmin(user) && t.owner_id !== meId(user) && t.requester_id !== meId(user)) return res.status(403).json({ error: "无权查看" });
    res.json({ contentHtml: t.content_html ?? "" });
  });

  // 单工单(通知深链点击打开详情用):owner/requester/admin 可看
  app.get("/api/ops/tickets/:id", requireAuth, async (req, res) => {
    const t = await prisma.tickets.findUnique({ where: { id: String(req.params.id) } });
    if (!t) return res.status(404).json({ error: "提单不存在" });
    const user = req.user;
    if (!isAdmin(user) && t.owner_id !== meId(user) && t.requester_id !== meId(user)) return res.status(403).json({ error: "无权查看" });
    res.json({ ticket: await decorateTickets(t, user, await loadSegNameMap()) });
  });
}
