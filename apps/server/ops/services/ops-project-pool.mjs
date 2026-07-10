// 项目池业务层:实时查 soyoo 项目 + 聚合 ops 工单 + 改状态(soyoo+飞书+outbox)+ 流转记录 + 状态阈值配置 + 超时筛。
import { prisma } from "../prisma.mjs";
import { soyooClient, soyooId } from "../soyoo-client.mjs";
import { getProjectWithMembers } from "../ops-realtime.mjs";
import { isAdmin, meId, nowIso } from "../ops-helpers.mjs";
import { PROJECT_STAGES, PLANNER_TAG, EXCLUDED_CLIENT_NAMES } from "../project-pool-constants.mjs";
import { sanitizeRichHtml, isBlankRich } from "../rich-html.mjs";
import { businessHoursBetween, subBusinessHours, remainingBusinessHours } from "../business-hours.mjs";

// 批量取项目 ops 扩展字段(阶段等)→ { [project_id]: {stage, stageChangedAt} }
async function loadExt(projectIds) {
  const out = {};
  if (!projectIds.length) return out;
  const rows = await prisma.ops_project_ext.findMany({ where: { project_id: { in: projectIds.map(String) } } });
  for (const r of rows) out[r.project_id] = { stage: r.stage, stageChangedAt: r.stage_changed_at, remark: r.remark };
  return out;
}

// ---- 工单聚合(每项目:未完成按状态分组数 / 临期(超时) / 超期(逾期) / 各环节未完成工单数)----
function ensure(map, pid) {
  return (map[pid] ||= { groups: {}, total: 0, atRisk: 0, overdue: 0, segCounts: {} });
}
async function aggregateTickets(projectIds) {
  const out = {};
  if (!projectIds.length) return out;
  const now = nowIso();
  const base = { project_id: { in: projectIds }, status: { not: "已完成" } }; // 未完成
  const [byStatus, overdue, atRisk, bySegment] = await Promise.all([
    prisma.tickets.groupBy({ by: ["project_id", "status"], where: base, _count: { _all: true } }),
    prisma.tickets.groupBy({ by: ["project_id"], where: { ...base, warn_at: { lt: now } }, _count: { _all: true } }), // 工单逾期(红):已过预警(base 已排除已完成)
    prisma.tickets.groupBy({ by: ["project_id"], where: { ...base, due_at: { lt: now }, warn_at: { gte: now } }, _count: { _all: true } }), // 工单超时(橙):已过交付、未过预警
    prisma.tickets.groupBy({ by: ["project_id", "segment_id"], where: { ...base, segment_id: { not: null } }, _count: { _all: true } }), // 各环节未完成工单数
  ]);
  for (const g of byStatus) {
    const o = ensure(out, g.project_id);
    o.groups[g.status] = g._count._all;
    o.total += g._count._all;
  }
  for (const g of overdue) ensure(out, g.project_id).overdue = g._count._all;
  for (const g of atRisk) ensure(out, g.project_id).atRisk = g._count._all;
  for (const g of bySegment) ensure(out, g.project_id).segCounts[g.segment_id] = g._count._all;
  return out;
}
async function loadSegOrder() {
  const segs = await prisma.ops_segments.findMany({ select: { id: true, name: true, sort_order: true } });
  const m = new Map();
  for (const s of segs) m.set(s.id, { name: s.name, sort: s.sort_order });
  return m;
}
// segCounts: { [segmentId]: 未完成工单数 } → [{id, name, count}] 按环节 sort 排序
function orderSegments(segCounts, segMap) {
  return Object.entries(segCounts)
    .map(([id, count]) => ({ id: Number(id), count, ...(segMap.get(Number(id)) || { name: "", sort: 9999 }) }))
    .filter((s) => s.name)
    .sort((a, b) => a.sort - b.sort)
    .map((s) => ({ id: s.id, name: s.name, count: s.count }));
}
async function settingsMap() {
  const rows = await prisma.ops_project_status_settings.findMany();
  return Object.fromEntries(rows.map((r) => [r.status, { enabled: !!r.enabled, staleHours: r.stale_hours }]));
}
// 策划列表:新 soyoo 直接给 planners[{name,avatar}];旧 soyoo 只给 planner_avatar(单头像)→ 兼容回退
function normalizePlanners(p) {
  if (Array.isArray(p.planners) && p.planners.length) return p.planners.map((x) => ({ name: x.name ?? "", avatar: x.avatar ?? "" }));
  if (p.planner_avatar) return [{ name: p.planner_name ?? "", avatar: p.planner_avatar }];
  return [];
}
function buildRow(p, agg, segMap, sm, extMap) {
  const a = agg[String(p.id)] || {};
  const ext = extMap?.[String(p.id)] || {};
  const now = nowIso();
  // 状态停留(工作时间:只算每天 10:00-19:00)
  const setting = sm?.[p.status];
  const stuckHours = p.status_changed_at ? Math.round(businessHoursBetween(p.status_changed_at, now)) : null; // 已停留工时
  const staleHours = setting?.enabled ? setting.staleHours : 0;
  const isStale = !!(setting?.enabled && setting.staleHours > 0 && stuckHours != null && stuckHours > setting.staleHours);
  return {
    id: String(p.id),
    name: p.name ?? "",
    tenantName: p.tenant_name ?? "", // 客户名(= soyoo tenant_name);原字段名 client 已对齐为 tenantName
    status: p.status ?? "",
    plannerName: p.planner_name ?? "", // 原始串(可能含多个策划),文字展示用
    planners: normalizePlanners(p), // 拆分后每个策划 {name, avatar}(兼容新旧 soyoo)
    stage: ext.stage || "", // 制作阶段(ops 自有);没设置就空,前端显示「-」
    stageDeadlines: Array.isArray(p.stage_deadlines) ? p.stage_deadlines : [],
    stageChangedAt: ext.stageChangedAt ?? null,
    startedAt: p.started_at ?? null,
    remark: ext.remark || "", // 项目备注(ops 自有,富文本 HTML;空串=无)
    statusChangedAt: p.status_changed_at ?? null,
    memberCount: p.member_count ?? 0,
    segments: orderSegments(a.segCounts || {}, segMap), // 目前环节(各环节未完成工单数,按 sort)
    ticketGroups: a.groups || {}, // {排队中:N, 进行中:N}
    ticketTotal: a.total || 0,
    atRisk: a.atRisk || 0, // 工单超时(临期)
    overdue: a.overdue || 0, // 工单逾期(超期)
    stuckHours, // 项目已停留工时
    staleHours, // 该状态阈值
    overByHours: isStale ? stuckHours - staleHours : null, // 超出阈值工时
    isStale, // 项目状态超时 → 整行标红
    stageStuckHours: null, // 已废弃:项目池不再按「项目阶段时间」计算阶段停留
    stageStaleHours: 0,
    stageOverByHours: null,
    stageStale: false,
  };
}

// ---- 列表(管理员全部 / 策划=自己作为制片参与的项目)----
// status:前端显式多选(逗号分隔)→ 只查这些;不传 → 只查「设置→项目状态时间」里【开启监控】的状态,关闭的不展示(与超时口径一致)
export async function listProjectPool({ user, page = 1, pageSize = 20, q = "", status = "", stage = "", segment = "" }) {
  const sm = await settingsMap();
  let statusFilter = status;
  if (!statusFilter) {
    const enabled = Object.entries(sm)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);
    if (!enabled.length) return { rows: [], total: 0, page, pageSize }; // 没有任何开启监控的状态 → 不查
    statusFilter = enabled.join(",");
  }
  const opts = { page, limit: pageSize, keyword: q, status: statusFilter, excludeTenants: EXCLUDED_CLIENT_NAMES };
  if (!isAdmin(user)) opts.memberUserId = meId(user);
  let filterIds = null;
  const stageFilter = String(stage || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (stageFilter.length) {
    const rows = await prisma.ops_project_ext.findMany({ where: { stage: { in: stageFilter } }, select: { project_id: true } });
    const ids = rows.map((r) => String(r.project_id)).filter(Boolean);
    if (!ids.length) return { rows: [], total: 0, page, pageSize };
    filterIds = new Set(ids);
  }
  const segmentFilter = String(segment || "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (segmentFilter.length) {
    const rows = await prisma.tickets.findMany({
      where: { segment_id: { in: segmentFilter }, status: { not: "已完成" } },
      select: { project_id: true },
      distinct: ["project_id"],
    });
    const ids = rows.map((r) => String(r.project_id)).filter(Boolean);
    if (!ids.length) return { rows: [], total: 0, page, pageSize };
    filterIds = filterIds ? new Set(ids.filter((id) => filterIds.has(id))) : new Set(ids);
    if (!filterIds.size) return { rows: [], total: 0, page, pageSize };
  }
  if (filterIds) opts.projectIds = [...filterIds];
  const r = await soyooClient.projectsList(opts);
  const projects = Array.isArray(r?.data) ? r.data : [];
  const ids = projects.map((p) => String(p.id));
  const [agg, segMap, extMap] = await Promise.all([aggregateTickets(ids), loadSegOrder(), loadExt(ids)]);
  return { rows: projects.map((p) => buildRow(p, agg, segMap, sm, extMap)), total: Number(r?.total ?? projects.length), page, pageSize };
}

// ---- 某项目某环节下的未完成工单(目前环节点击查看,含所有负责人)----
export async function listSegmentTickets(projectId, segmentId) {
  const sid = Number(segmentId);
  if (!projectId || !Number.isFinite(sid)) return [];
  const now = nowIso();
  const rows = await prisma.tickets.findMany({
    where: { project_id: String(projectId), segment_id: sid, status: { not: "已完成" } },
    orderBy: [{ due_at: "asc" }],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      requester_name: true,
      requester_avatar: true,
      owner_name: true,
      owner_avatar: true,
      due_at: true,
      warn_at: true,
    },
  });
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    requesterName: t.requester_name || "",
    requesterAvatar: t.requester_avatar || "",
    ownerName: t.owner_name || "",
    ownerAvatar: t.owner_avatar || "",
    dueAt: t.due_at,
    remainingHours: remainingBusinessHours(t.due_at, now), // 距交付的工作小时(正=剩,负=超期)
    overdue: !!(t.warn_at && t.warn_at < now), // 逾期(红):已过预警
    atRisk: !!(t.due_at && t.due_at < now && t.warn_at && t.warn_at >= now), // 超时(橙):过交付未过预警
  }));
}

function mapPoolTicket(t, segName) {
  return {
    id: t.id,
    title: t.title,
    client: t.client_name ?? t.source_project_name ?? "",
    projectName: t.project_name ?? "",
    projectId: t.project_id,
    tagName: segName || t.discipline || "",
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
    hyperlink: t.hyperlink ?? "",
    blockReason: t.block_reason ?? "",
    riskWarningHours: t.risk_warning_hours ?? 8,
    remainingHours: t.status === "已完成" ? null : remainingBusinessHours(t.due_at),
    canEdit: false,
    canEditContent: false,
    canAssign: false,
    canEditPriority: false,
    createdAt: t.created_at,
    statusUpdatedAt: t.status_updated_at,
  };
}

// ---- 项目池入口查看某环节工单详情:继承项目池权限,并限制为当前项目/环节下的工单 ----
export async function getSegmentTicketDetail({ user, projectId, segmentId, ticketId }) {
  const sid = Number(segmentId);
  if (!projectId || !Number.isFinite(sid) || !ticketId) return { error: "参数错误", code: 400 };
  if (!isAdmin(user)) {
    const { members } = await getProjectWithMembers(projectId);
    const uid = meId(user);
    if (!members.some((m) => String(m.id) === uid)) return { error: "无权查看该项目工单", code: 403 };
  }
  const [ticket, segment, events] = await Promise.all([
    prisma.tickets.findFirst({ where: { id: String(ticketId), project_id: String(projectId), segment_id: sid } }),
    prisma.ops_segments.findUnique({ where: { id: sid }, select: { name: true } }),
    prisma.ticket_events.findMany({ where: { ticket_id: String(ticketId) }, orderBy: [{ created_at: "desc" }, { id: "desc" }] }),
  ]);
  if (!ticket) return { error: "提单不存在", code: 404 };
  return {
    ticket: mapPoolTicket(ticket, segment?.name),
    events: events.map((e) => ({
      id: e.id,
      actorName: e.actor_name ?? "",
      action: e.action,
      fromStatus: e.from_status ?? "",
      toStatus: e.to_status ?? "",
      note: e.note ?? "",
      createdAt: e.created_at,
    })),
  };
}

// ---- 项目协作成员(协作列点击查看)----
export async function getProjectMembers(projectId) {
  const { members } = await getProjectWithMembers(projectId);
  return members.map((m) => ({
    id: m.id,
    name: m.name,
    avatar: m.avatar,
    wechatName: m.wechatName,
    username: m.username,
    tags: (m.tags || []).map((t) => t.name).filter(Boolean),
  }));
}

// ---- 改状态:先调 soyoo(落库+飞书+outbox)成功,才写 ops 流转记录 ----
export async function changeProjectStatus({ user, projectId, status, commentHtml, force = false }) {
  if (!status) return { error: "缺少状态", code: 400 };
  const { project, members } = await getProjectWithMembers(projectId);
  if (!project) return { error: "项目不存在", code: 404 };
  if (!isAdmin(user)) {
    const m = members.find((x) => x.id === meId(user));
    if (!m || !m.tags.some((t) => t.name === PLANNER_TAG)) return { error: "无权修改(仅该项目策划或管理员)", code: 403 };
  }
  const from = project.status;
  // 相同状态默认拦截(避免 UI 误点把 status_changed_at 清零);force=true 放行(维护用:把停留计时刷新为当前时间)
  if (!force && from === status) return { error: "状态未变化,无需修改", code: 400 };
  await soyooClient.setProjectStatus(projectId, status); // 抛错 → 路由转 502,不写日志(保证一致)
  await prisma.ops_project_status_logs.create({
    data: {
      project_id: String(projectId),
      project_name: project.name,
      kind: "status",
      from_status: from || null,
      to_status: status,
      actor_id: meId(user),
      actor_name: user?.name || user?.username || "",
      comment_html: commentHtml || null,
      created_at: nowIso(),
    },
  });
  return { ok: true, status };
}

// ---- 改阶段(纯 ops:校验权限 → upsert ops_project_ext → 写日志 kind=stage,不调 soyoo)----
export async function changeProjectStage({ user, projectId, stage, commentHtml }) {
  if (!stage) return { error: "缺少阶段", code: 400 };
  if (!PROJECT_STAGES.includes(stage)) return { error: "无效的阶段", code: 400 };
  const { project, members } = await getProjectWithMembers(projectId);
  if (!project) return { error: "项目不存在", code: 404 };
  if (!isAdmin(user)) {
    const m = members.find((x) => x.id === meId(user));
    if (!m || !m.tags.some((t) => t.name === PLANNER_TAG)) return { error: "无权修改(仅该项目策划或管理员)", code: 403 };
  }
  const pid = String(projectId);
  const cur = await prisma.ops_project_ext.findUnique({ where: { project_id: pid }, select: { stage: true } });
  const from = cur?.stage || null; // 没设置过阶段 → from 为空,日志只显示「→ X」
  if ((from || "") === stage) return { error: "阶段未变化,无需修改", code: 400 }; // 相同阶段不重置 stage_changed_at
  const now = nowIso();
  await prisma.ops_project_ext.upsert({
    where: { project_id: pid },
    create: { project_id: pid, stage, stage_changed_at: now, updated_at: now },
    update: { stage, stage_changed_at: now, updated_at: now },
  });
  await prisma.ops_project_status_logs.create({
    data: {
      project_id: pid,
      project_name: project.name,
      kind: "stage",
      from_status: from || null,
      to_status: stage,
      actor_id: meId(user),
      actor_name: user?.name || user?.username || "",
      comment_html: commentHtml || null,
      created_at: now,
    },
  });
  return { ok: true, stage };
}

// ---- 改下版交付时间(临时校准入口):校验权限 → 写 soyoo projects.stage_deadlines → 写项目流转日志 ----
export async function changeProjectStageDeadlines({ user, projectId, stageBaseDate, stageDeadlines }) {
  const { project, members } = await getProjectWithMembers(projectId);
  if (!project) return { error: "项目不存在", code: 404 };
  if (!isAdmin(user)) {
    const m = members.find((x) => x.id === meId(user));
    if (!m || !m.tags.some((t) => t.name === PLANNER_TAG)) return { error: "无权修改(仅该项目策划或管理员)", code: 403 };
  }
  const body = {};
  if (stageBaseDate) body.stage_base_date = String(stageBaseDate);
  if (Array.isArray(stageDeadlines) && stageDeadlines.length) body.stage_deadlines = stageDeadlines;
  if (!body.stage_base_date && !body.stage_deadlines) return { error: "缺少阶段交付日期", code: 400 };
  const beforeProject = await soyooClient.project(projectId).catch(() => null);
  const r = await soyooClient.setProjectStageDeadlines(projectId, body);
  const nextDeadlines = Array.isArray(r?.data?.stage_deadlines) ? r.data.stage_deadlines : [];
  if (deadlineItemsChanged(beforeProject?.stage_deadlines, nextDeadlines)) {
    const now = nowIso();
    await prisma.ops_project_status_logs.create({
      data: {
        project_id: String(projectId),
        project_name: project.name,
        kind: "deadline",
        from_status: null,
        to_status: "下版交付时间",
        actor_id: meId(user),
        actor_name: user?.name || user?.username || "",
        comment_html: deadlineChangeHtml(beforeProject?.stage_deadlines, nextDeadlines),
        created_at: now,
      },
    });
  }
  return { ok: true, stageDeadlines: nextDeadlines };
}

// ---- 改备注(纯 ops:富文本 sanitize → upsert ext.remark → 写日志 kind=remark,内容存 comment_html)----
export async function changeProjectRemark({ user, projectId, remark }) {
  const { project, members } = await getProjectWithMembers(projectId);
  if (!project) return { error: "项目不存在", code: 404 };
  if (!isAdmin(user)) {
    const m = members.find((x) => x.id === meId(user));
    if (!m || !m.tags.some((t) => t.name === PLANNER_TAG)) return { error: "无权修改(仅该项目策划或管理员)", code: 403 };
  }
  const pid = String(projectId);
  const now = nowIso();
  const html = isBlankRich(remark) ? "" : sanitizeRichHtml(remark); // 富文本白名单清洗;允许清空
  await prisma.ops_project_ext.upsert({
    where: { project_id: pid },
    create: { project_id: pid, remark: html, updated_at: now },
    update: { remark: html, updated_at: now },
  });
  await prisma.ops_project_status_logs.create({
    data: {
      project_id: pid,
      project_name: project.name,
      kind: "remark",
      from_status: null,
      to_status: "修改备注",
      actor_id: meId(user),
      actor_name: user?.name || user?.username || "",
      comment_html: html || null,
      created_at: now,
    },
  });
  return { ok: true };
}

// ---- 流转记录(倒序)----
export async function getStatusLogs(projectId) {
  const rows = await prisma.ops_project_status_logs.findMany({ where: { project_id: String(projectId) }, orderBy: { id: "desc" }, take: 200 });
  // 操作人头像:join 本地 people。actor_id 是去前缀的纯 id(如 "3"),而 people.id 可能带 ops-user- 前缀
  //(如 "ops-user-3")→ 两种形式都查、用 soyooId() 归一成纯 id 匹配,带不带前缀都能对上
  const pureIds = [...new Set(rows.map((r) => soyooId(r.actor_id)).filter(Boolean))];
  const avatarByPure = {};
  if (pureIds.length) {
    const candidates = [...pureIds, ...pureIds.map((i) => `ops-user-${i}`)];
    const ppl = await prisma.people.findMany({ where: { id: { in: candidates } }, select: { id: true, wechat_avatar: true } });
    for (const p of ppl) if (p.wechat_avatar) avatarByPure[soyooId(p.id)] = p.wechat_avatar;
  }
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind || "status",
    fromStatus: r.from_status,
    toStatus: r.to_status,
    actorName: r.actor_name,
    actorAvatar: avatarByPure[soyooId(r.actor_id)] || "",
    commentHtml: r.comment_html,
    createdAt: r.created_at,
  }));
}

// ---- 状态阈值配置 ----
export async function getStatusSettings() {
  const rows = await prisma.ops_project_status_settings.findMany({ orderBy: { sort_order: "asc" } });
  return rows.map((r) => ({ status: r.status, enabled: !!r.enabled, staleHours: r.stale_hours, sortOrder: r.sort_order }));
}
export async function saveStatusSettings(list) {
  for (const s of Array.isArray(list) ? list : []) {
    if (!s?.status) continue;
    await prisma.ops_project_status_settings
      .update({ where: { status: String(s.status) }, data: { enabled: s.enabled ? 1 : 0, stale_hours: Math.max(0, Number(s.staleHours) || 0), updated_at: nowIso() } })
      .catch(() => {});
  }
  return getStatusSettings();
}

// ---- 阶段阈值配置 ----
export async function getStageSettings() {
  const rows = await prisma.ops_project_stage_settings.findMany({ orderBy: { sort_order: "asc" } });
  return rows.map((r) => ({ stage: r.stage, enabled: !!r.enabled, staleHours: r.stale_hours, sortOrder: r.sort_order }));
}
export async function saveStageSettings(list) {
  for (const s of Array.isArray(list) ? list : []) {
    if (!s?.stage) continue;
    await prisma.ops_project_stage_settings
      .update({ where: { stage: String(s.stage) }, data: { enabled: s.enabled ? 1 : 0, stale_hours: Math.max(0, Number(s.staleHours) || 0), updated_at: nowIso() } })
      .catch(() => {});
  }
  return getStageSettings();
}

// ---- 超时(项目状态停留超过该状态阈值,按工作时间)----
async function staleCutoffs() {
  const settings = await prisma.ops_project_status_settings.findMany();
  const now = nowIso();
  return settings
    .filter((s) => s.enabled && s.stale_hours > 0)
    .map((s) => ({ status: s.status, before: subBusinessHours(now, s.stale_hours), staleHours: s.stale_hours }));
}

function todayDateText() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextStageDeadline(stage, items) {
  if (!Array.isArray(items) || !items.length) return null;
  const currentIndex = items.findIndex((item) => item.name === stage || item.key === stage);
  if (currentIndex < 0) return items[0];
  if (currentIndex >= items.length - 1) return items[currentIndex];
  return items[currentIndex + 1];
}

function isNextStageDeadlineOverdue(project, ext, today = todayDateText()) {
  const next = nextStageDeadline(ext?.stage || "", project?.stage_deadlines);
  return !!(next?.date && /^\d{4}-\d{2}-\d{2}$/.test(next.date) && next.date < today);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeDeadlineItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    key: String(item?.key || ""),
    name: String(item?.name || item?.key || ""),
    date: String(item?.date || ""),
  }));
}

function deadlineItemsChanged(oldItems, newItems) {
  const oldNormalized = normalizeDeadlineItems(oldItems);
  const newNormalized = normalizeDeadlineItems(newItems);
  if (oldNormalized.length !== newNormalized.length) return true;
  return newNormalized.some((item, index) => {
    const old = oldNormalized[index];
    return old.key !== item.key || old.name !== item.name || old.date !== item.date;
  });
}

function deadlineChangeHtml(oldItems, newItems) {
  const oldByKey = new Map(normalizeDeadlineItems(oldItems).map((item) => [item.key, item]));
  const rows = normalizeDeadlineItems(newItems).map((item) => {
    const old = oldByKey.get(item.key);
    const from = old?.date || "-";
    const to = item.date || "-";
    const changed = from !== to;
    return `<li><b>${escapeHtml(item.name)}</b>：${escapeHtml(from)} → ${changed ? `<span style="color:#cf1322">${escapeHtml(to)}</span>` : escapeHtml(to)}</li>`;
  });
  return `<div>修改下版交付时间</div><ul>${rows.join("")}</ul>`;
}

// 下版交付时间已逾期的项目 id:根据当前阶段 + soyoo stage_deadlines 计算，不再按「项目阶段时间」配置。
async function deadlineOverdueProjectIds({ user }) {
  const out = [];
  const today = todayDateText();
  const opts = { page: 1, limit: 100, exclude: "已完成,回收中", excludeTenants: EXCLUDED_CLIENT_NAMES };
  if (!isAdmin(user)) opts.memberUserId = meId(user);
  for (let page = 1; page <= 100; page += 1) {
    const r = await soyooClient.projectsList({ ...opts, page });
    const projects = Array.isArray(r?.data) ? r.data : [];
    if (!projects.length) break;
    const ids = projects.map((p) => String(p.id));
    const extMap = await loadExt(ids);
    for (const p of projects) {
      if (isNextStageDeadlineOverdue(p, extMap[String(p.id)], today)) out.push(String(p.id));
    }
    const total = Number(r?.total ?? out.length);
    if (page * opts.limit >= total) break;
  }
  return out;
}

async function loadProjectsByIds(projectIds) {
  const ids = [...new Set(projectIds.map(String).filter(Boolean))];
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    if (!batch.length) continue;
    const r = await soyooClient.projectsList({
      page: 1,
      limit: 100,
      projectIds: batch,
      exclude: "已完成,回收中",
      excludeTenants: EXCLUDED_CLIENT_NAMES,
    });
    out.push(...(Array.isArray(r?.data) ? r.data : []));
  }
  return out;
}

// 通知扫描用:保留「项目阶段时间」设置。只用于阶段停留通知,不恢复项目池阶段状态列。
async function stageOverdueProjectsForNotify() {
  const settings = await prisma.ops_project_stage_settings.findMany();
  const enabled = settings.filter((s) => s.enabled && s.stale_hours > 0);
  if (!enabled.length) return [];
  const candidates = [];
  const now = nowIso();
  for (const s of enabled) {
    const cutoff = subBusinessHours(now, s.stale_hours);
    const rows = await prisma.ops_project_ext.findMany({
      where: { stage: s.stage, stage_changed_at: { lt: cutoff } },
      select: { project_id: true },
    });
    candidates.push(...rows.map((r) => String(r.project_id)));
  }
  const projects = await loadProjectsByIds(candidates);
  return projects.map((p) => ({ id: String(p.id), name: p.name ?? "", kind: "stage" }));
}

export async function listStale({ user, page = 1, pageSize = 20 }) {
  // 临时停用状态流程时间:后面恢复时把 staleCutoffs() 放回 Promise.all，并传 cutoffs 给 soyoo。
  // const cutoffs = await staleCutoffs();
  const extraIds = await deadlineOverdueProjectIds({ user });
  if (!extraIds.length) return { rows: [], total: 0, page, pageSize };
  const body = { cutoffs: [], extra_ids: extraIds, page, limit: pageSize, exclude_tenants: EXCLUDED_CLIENT_NAMES };
  if (!isAdmin(user)) body.member_user_id = Number(meId(user)) || 0;
  const r = await soyooClient.staleProjects(body);
  const projects = Array.isArray(r?.data) ? r.data : [];
  const ids = projects.map((p) => String(p.id));
  const [agg, segMap, sm, extMap] = await Promise.all([aggregateTickets(ids), loadSegOrder(), settingsMap(), loadExt(ids)]);
  return { rows: projects.map((p) => buildRow(p, agg, segMap, sm, extMap)), total: Number(r?.total ?? projects.length), page, pageSize };
}
export async function staleCount({ user }) {
  // 临时停用状态流程时间:后面恢复时把 staleCutoffs() 放回 Promise.all，并传 cutoffs 给 soyoo。
  // const cutoffs = await staleCutoffs();
  const extraIds = await deadlineOverdueProjectIds({ user });
  if (!extraIds.length) return 0;
  const body = { cutoffs: [], extra_ids: extraIds, page: 1, limit: 1, exclude_tenants: EXCLUDED_CLIENT_NAMES };
  if (!isAdmin(user)) body.member_user_id = Number(meId(user)) || 0;
  const r = await soyooClient.staleProjects(body);
  return Number(r?.total ?? 0);
}

// 通知扫描用:下版交付时间逾期 + 阶段停留超时。状态流程时间暂不计入。
export async function listOverdueProjectsForNotify() {
  // 临时停用状态流程时间:后面恢复时把 staleCutoffs() 放回 Promise.all，并传 cutoffs 给 soyoo。
  // const cutoffs = await staleCutoffs();
  const [deadlineIds, stageProjects] = await Promise.all([deadlineOverdueProjectIds({ user: { roleKey: "admin" } }), stageOverdueProjectsForNotify()]);
  const deadlineProjects = (await loadProjectsByIds(deadlineIds)).map((p) => ({ id: String(p.id), name: p.name ?? "", kind: "deadline" }));
  return [...deadlineProjects, ...stageProjects];
}

// 环节 + 绑定标签 id(供「按环节算项目负责人」复用;getResponsibles 只需 tag id,不查 soyoo 标签名)。传 ids 则只取这些环节。
export async function loadSegmentsWithTagIds(segmentIds) {
  const ids = (segmentIds ?? []).map(Number).filter((n) => Number.isInteger(n));
  const where = ids.length ? { id: { in: ids } } : {};
  const [segments, links] = await Promise.all([
    prisma.ops_segments.findMany({ where, orderBy: [{ sort_order: "asc" }] }),
    prisma.ops_segment_tags.findMany({ where: ids.length ? { segment_id: { in: ids } } : {} }),
  ]);
  const bySeg = new Map();
  for (const l of links) {
    if (!bySeg.has(l.segment_id)) bySeg.set(l.segment_id, []);
    bySeg.get(l.segment_id).push({ id: l.tag_id });
  }
  return segments.map((s) => ({ id: s.id, name: s.name, tags: bySeg.get(s.id) ?? [] }));
}
