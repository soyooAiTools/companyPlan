// 项目池业务层:实时查 soyoo 项目 + 聚合 ops 工单 + 改状态(soyoo+飞书+outbox)+ 流转记录 + 状态阈值配置 + 超时筛。
import dayjs from "dayjs";
import { prisma } from "../prisma.mjs";
import { soyooClient, soyooId } from "../soyoo-client.mjs";
import { getProjectWithMembers } from "../ops-realtime.mjs";
import { isAdmin, meId, nowIso } from "../ops-helpers.mjs";
import { PROJECT_STAGES, PLANNER_TAG } from "../project-pool-constants.mjs";

// 批量取项目 ops 扩展字段(阶段等)→ { [project_id]: {stage, stageChangedAt} }
async function loadExt(projectIds) {
  const out = {};
  if (!projectIds.length) return out;
  const rows = await prisma.ops_project_ext.findMany({ where: { project_id: { in: projectIds.map(String) } } });
  for (const r of rows) out[r.project_id] = { stage: r.stage, stageChangedAt: r.stage_changed_at };
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
    prisma.tickets.groupBy({ by: ["project_id"], where: { ...base, due_at: { lt: now } }, _count: { _all: true } }), // 逾期:已过截止
    prisma.tickets.groupBy({ by: ["project_id"], where: { ...base, warn_at: { lt: now }, due_at: { gte: now } }, _count: { _all: true } }), // 临期:预警内未过期
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
  const setting = sm?.[p.status];
  const stuckHours = p.status_changed_at ? dayjs().diff(dayjs(p.status_changed_at), "hour") : null; // 已停留小时
  const staleHours = setting?.enabled ? setting.staleHours : 0;
  const isStale = !!(setting?.enabled && setting.staleHours > 0 && stuckHours != null && stuckHours > setting.staleHours);
  return {
    id: String(p.id),
    name: p.name ?? "",
    client: p.tenant_name ?? "",
    status: p.status ?? "",
    plannerName: p.planner_name ?? "", // 原始串(可能含多个策划),文字展示用
    planners: normalizePlanners(p), // 拆分后每个策划 {name, avatar}(兼容新旧 soyoo)
    stage: ext.stage || "", // 制作阶段(ops 自有);没设置就空,前端显示「-」
    stageChangedAt: ext.stageChangedAt ?? null,
    statusChangedAt: p.status_changed_at ?? null,
    memberCount: p.member_count ?? 0,
    segments: orderSegments(a.segCounts || {}, segMap), // 目前环节(各环节未完成工单数,按 sort)
    ticketGroups: a.groups || {}, // {排队中:N, 进行中:N}
    ticketTotal: a.total || 0,
    atRisk: a.atRisk || 0, // 工单超时(临期)
    overdue: a.overdue || 0, // 工单逾期(超期)
    stuckHours, // 项目已停留小时
    staleHours, // 该状态阈值
    overByHours: isStale ? stuckHours - staleHours : null, // 超出阈值小时
    isStale, // 项目状态超时 → 整行标红
  };
}

// ---- 列表(管理员全部 / 策划=自己作为制片参与的项目)----
// status:前端显式多选(逗号分隔)→ 只查这些;不传 → 只查「设置→项目状态时间」里【开启监控】的状态,关闭的不展示(与超时口径一致)
export async function listProjectPool({ user, page = 1, pageSize = 20, q = "", status = "" }) {
  const sm = await settingsMap();
  let statusFilter = status;
  if (!statusFilter) {
    const enabled = Object.entries(sm)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);
    if (!enabled.length) return { rows: [], total: 0, page, pageSize }; // 没有任何开启监控的状态 → 不查
    statusFilter = enabled.join(",");
  }
  const opts = { page, limit: pageSize, keyword: q, status: statusFilter };
  if (!isAdmin(user)) opts.memberUserId = meId(user);
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
    select: { id: true, title: true, status: true, priority: true, owner_name: true, owner_avatar: true, due_at: true, warn_at: true },
  });
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    ownerName: t.owner_name || "",
    ownerAvatar: t.owner_avatar || "",
    dueAt: t.due_at,
    overdue: !!(t.due_at && t.due_at < now), // 逾期:已过截止
    atRisk: !!(t.warn_at && t.warn_at < now && t.due_at && t.due_at >= now), // 临期:已过预警未到截止
  }));
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
export async function changeProjectStatus({ user, projectId, status, commentHtml }) {
  if (!status) return { error: "缺少状态", code: 400 };
  const { project, members } = await getProjectWithMembers(projectId);
  if (!project) return { error: "项目不存在", code: 404 };
  if (!isAdmin(user)) {
    const m = members.find((x) => x.id === meId(user));
    if (!m || !m.tags.some((t) => t.name === PLANNER_TAG)) return { error: "无权修改(仅该项目策划或管理员)", code: 403 };
  }
  const from = project.status;
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

// ---- 超时(项目状态停留超过该状态阈值)----
async function staleCutoffs() {
  const settings = await prisma.ops_project_status_settings.findMany();
  return settings
    .filter((s) => s.enabled && s.stale_hours > 0)
    .map((s) => ({ status: s.status, before: dayjs().subtract(s.stale_hours, "hour").toISOString(), staleHours: s.stale_hours }));
}
export async function listStale({ user, page = 1, pageSize = 20 }) {
  const cutoffs = await staleCutoffs();
  if (!cutoffs.length) return { rows: [], total: 0, page, pageSize };
  const body = { cutoffs: cutoffs.map((c) => ({ status: c.status, before: c.before })), page, limit: pageSize };
  if (!isAdmin(user)) body.member_user_id = Number(meId(user)) || 0;
  const r = await soyooClient.staleProjects(body);
  const projects = Array.isArray(r?.data) ? r.data : [];
  const ids = projects.map((p) => String(p.id));
  const [agg, segMap, sm, extMap] = await Promise.all([aggregateTickets(ids), loadSegOrder(), settingsMap(), loadExt(ids)]);
  return { rows: projects.map((p) => buildRow(p, agg, segMap, sm, extMap)), total: Number(r?.total ?? projects.length), page, pageSize };
}
export async function staleCount({ user }) {
  const cutoffs = await staleCutoffs();
  if (!cutoffs.length) return 0;
  const body = { cutoffs: cutoffs.map((c) => ({ status: c.status, before: c.before })), page: 1, limit: 1 };
  if (!isAdmin(user)) body.member_user_id = Number(meId(user)) || 0;
  const r = await soyooClient.staleProjects(body);
  return Number(r?.total ?? 0);
}
