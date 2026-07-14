// 项目池业务层:实时查 soyoo 项目 + 聚合 ops 工单 + 改状态(soyoo+飞书+outbox)+ 流转记录 + 状态阈值配置 + 超时筛。
import crypto from "node:crypto";
import { prisma } from "../prisma.mjs";
import { soyooClient, soyooId } from "../soyoo-client.mjs";
import { getProjectWithMembers, getUser } from "../ops-realtime.mjs";
import { isAdmin, meId, nowIso } from "../ops-helpers.mjs";
import { PROJECT_STAGES, PLANNER_TAG, EXCLUDED_CLIENT_NAMES } from "../project-pool-constants.mjs";
import { sanitizeRichHtml, isBlankRich } from "../rich-html.mjs";
import { addBusinessHours, subBusinessHours } from "../business-hours.mjs";
import { createProjectPoolTimer } from "./project-pool/timer.mjs";
import { loadVisibleSnapshotRows, refreshProjectPoolSnapshot } from "./project-pool/snapshot-store.mjs";

export { projectPoolSnapshotStats, rebuildProjectPoolSnapshots, refreshProjectPoolSnapshot } from "./project-pool/snapshot-store.mjs";
export { getSegmentTicketDetail, listProjectPoolTickets, listSegmentTickets } from "./project-pool/tickets.mjs";
export { listOwnerMembersByTags } from "./project-pool/owners.mjs";

function filterProjectPoolRows(rows, { q = "", status = "", stage = "", planner = "", segment = "" }) {
  let nextRows = rows;
  const kw = String(q || "").trim().toLowerCase();
  if (kw) {
    nextRows = nextRows.filter((row) => [row.name, row.tenantName, row.plannerName].some((value) => String(value || "").toLowerCase().includes(kw)));
  }

  const statusSet = new Set(
    String(status || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (statusSet.size) nextRows = nextRows.filter((row) => statusSet.has(row.status));

  const stageSet = new Set(
    String(stage || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (stageSet.size) nextRows = nextRows.filter((row) => stageSet.has(row.stage));

  const plannerNames = String(planner || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (plannerNames.length) {
    nextRows = nextRows.filter((row) => {
      const names = Array.isArray(row.planners) && row.planners.length ? row.planners.map((p) => p.name) : String(row.plannerName || "").split(/[、,，/]/);
      return plannerNames.some((name) => names.some((candidate) => String(candidate || "").trim() === name || String(candidate || "").includes(name)));
    });
  }

  const segmentSet = new Set(
    String(segment || "")
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
  if (segmentSet.size) nextRows = nextRows.filter((row) => (row.segments || []).some((item) => segmentSet.has(Number(item.id))));

  return nextRows;
}

async function listProjectPoolFromSnapshot({ user, page = 1, pageSize = 20, q = "", status = "", stage = "", planner = "", segment = "" }) {
  const statusFilter = String(status || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const effectiveStatus = statusFilter.length ? statusFilter : [];
  let rows = await loadVisibleSnapshotRows({ user, statusNames: effectiveStatus });
  if (effectiveStatus.length) {
    const statusSet = new Set(effectiveStatus);
    rows = rows.filter((row) => statusSet.has(row.status));
  } else {
    rows = rows.filter((row) => row.status !== "已完成" && row.status !== "回收中");
  }
  rows = filterProjectPoolRows(rows, { q, stage, planner, segment });

  rows = rows.sort((a, b) => Number(b.id) - Number(a.id) || String(b.id).localeCompare(String(a.id)));
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total, page, pageSize };
}

// ---- 列表(管理员全部 / 策划=自己作为制片参与的项目)----
// status:前端显式多选(逗号分隔)→ 只查这些;不传 → 只查「设置→项目状态时间」里【开启监控】的状态,关闭的不展示(与超时口径一致)
export async function listProjectPool({ user, page = 1, pageSize = 20, q = "", status = "", stage = "", planner = "", segment = "" }) {
  const timer = createProjectPoolTimer("list", { page, pageSize, q: !!q, status: !!status, stage: !!stage, planner: !!planner, segment: !!segment, admin: isAdmin(user) });
  try {
    const result = await listProjectPoolFromSnapshot({ user, page, pageSize, q, status, stage, planner, segment });
    timer.mark("snapshot.query", { rows: result.rows.length, total: result.total });
    const { rows, total } = result;
    timer.done({ rows: rows.length, total });
    return result;
  } catch (e) {
    timer.error(e);
    throw e;
  }
}

// ---- 我的项目:固定按当前登录人参与的项目查询;不要求策划权限 ----
export async function listMyProjectPool({ user, page = 1, pageSize = 20, q = "", status = "", stage = "", planner = "", segment = "" }) {
  const timer = createProjectPoolTimer("mine", { page, pageSize, q: !!q, status: !!status, stage: !!stage, planner: !!planner, segment: !!segment, userId: meId(user) });
  try {
    const result = await listProjectPoolFromSnapshot({ user, page, pageSize, q, status, stage, planner, segment });
    timer.mark("snapshot.query", { rows: result.rows.length, total: result.total });
    const { rows, total } = result;
    timer.done({ rows: rows.length, total });
    return result;
  } catch (e) {
    timer.error(e);
    throw e;
  }
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

const AUTO_PROGRAM_SEGMENT = "程序第一版";
const AUTO_PROGRAM_TITLE = "程序第一版";
const AUTO_PROGRAM_HTML = "<p>系统自动生成</p>";
const SYSTEM_REQUESTER_ID = "system";
const SYSTEM_REQUESTER_NAME = "系统";

async function ensureSystemRequester() {
  await prisma.people.upsert({
    where: { id: SYSTEM_REQUESTER_ID },
    create: {
      id: SYSTEM_REQUESTER_ID,
      username: SYSTEM_REQUESTER_ID,
      password_hash: "",
      name: SYSTEM_REQUESTER_NAME,
      role_key: "system",
      title: "系统",
      discipline: "系统",
      capacity: 0,
      completion: 0,
      disabled_at: null,
      wechat_name: SYSTEM_REQUESTER_NAME,
      wechat_avatar: "",
    },
    update: {
      name: SYSTEM_REQUESTER_NAME,
      role_key: "system",
      disabled_at: null,
      wechat_name: SYSTEM_REQUESTER_NAME,
    },
  });
}

function lastPlannerMember(members) {
  const planners = members
    .filter((member) => member.status !== "disabled" && (member.tags || []).some((tag) => tag.name === PLANNER_TAG))
    .sort((a, b) => String(a.assignedAt || "").localeCompare(String(b.assignedAt || "")) || Number(a.id) - Number(b.id));
  return planners.at(-1) || null;
}

async function autoCreateProjectStatusTicket({ project, members, projectId, title, eventNote }) {
  const owner = lastPlannerMember(members);
  if (!owner) return { created: false, reason: "planner_not_found" };
  const exists = await prisma.tickets.findFirst({
    where: { project_id: String(projectId), title, status: { not: "已完成" } },
    select: { id: true },
  });
  if (exists) return { created: false, reason: "ticket_exists", ticketId: exists.id };
  await ensureSystemRequester();
  const now = nowIso();
  const dueInHours = 24;
  const riskWarningHours = 8;
  const dueAt = addBusinessHours(now, dueInHours);
  const warnAt = addBusinessHours(now, riskWarningHours);
  const created = await prisma.tickets.create({
    data: {
      id: crypto.randomUUID(),
      title,
      source_project_name: project.client || "",
      client_id: project.clientId || "",
      client_name: project.client || "",
      project_name: project.name || "",
      project_id: String(projectId),
      project_status: project.status || "",
      tag_id: "",
      tag_name: PLANNER_TAG,
      segment_id: null,
      discipline: PLANNER_TAG,
      requester_id: SYSTEM_REQUESTER_ID,
      requester_name: SYSTEM_REQUESTER_NAME,
      requester_avatar: "",
      requester_username: SYSTEM_REQUESTER_ID,
      owner_id: String(owner.id),
      owner_name: owner.name || owner.username || "",
      owner_avatar: owner.avatar || "",
      owner_username: owner.username || "",
      status: "排队中",
      priority: "普通",
      start_at: now,
      due_in_hours: dueInHours,
      risk_warning_hours: riskWarningHours,
      due_at: dueAt,
      warn_at: warnAt,
      need_type: PLANNER_TAG,
      summary: "系统自动生成",
      content_html: AUTO_PROGRAM_HTML,
      hyperlink: null,
      text: null,
      created_at: now,
      updated_at: now,
      status_updated_at: now,
    },
  });
  await prisma.ticket_events.create({
    data: {
      ticket_id: created.id,
      actor_id: SYSTEM_REQUESTER_ID,
      actor_name: SYSTEM_REQUESTER_NAME,
      action: "系统自动建单",
      from_status: null,
      to_status: "排队中",
      note: eventNote,
      created_at: now,
    },
  });
  return { created: true, ticketId: created.id };
}

export async function autoCreateProgramFirstTicket({ user, requesterUserId, project, members, projectId, eventNote = "系统自动生成" }) {
  const segment = await prisma.ops_segments.findFirst({ where: { name: AUTO_PROGRAM_SEGMENT } });
  if (!segment) return { created: false, reason: "segment_not_found" };
  const segTags = await prisma.ops_segment_tags.findMany({ where: { segment_id: segment.id }, select: { tag_id: true } });
  const tagIds = segTags.map((row) => String(row.tag_id));
  if (!tagIds.length) return { created: false, reason: "segment_tags_empty" };
  const owner = members.find((member) => member.status !== "disabled" && (member.tags || []).some((tag) => tagIds.includes(String(tag.id))));
  if (!owner) return { created: false, reason: "owner_not_found" };
  const exists = await prisma.tickets.findFirst({
    where: { project_id: String(projectId), segment_id: segment.id, title: AUTO_PROGRAM_TITLE, status: { not: "已完成" } },
    select: { id: true },
  });
  if (exists) return { created: false, reason: "ticket_exists", ticketId: exists.id };

  const matched = owner.tags.find((tag) => tagIds.includes(String(tag.id)));
  const now = nowIso();
  const dueAt = addBusinessHours(now, segment.default_delivery_hours);
  const warnAt = addBusinessHours(now, segment.risk_warning_hours);
  const requesterId = String(requesterUserId || meId(user));
  if (!requesterId) return { created: false, reason: "requester_not_found" };
  const requesterUser = requesterId ? await getUser(requesterId).catch(() => null) : null;
  const requesterName = requesterUser?.name || user?.name || user?.username || "";
  const created = await prisma.tickets.create({
    data: {
      id: crypto.randomUUID(),
      title: AUTO_PROGRAM_TITLE,
      source_project_name: project.client || "",
      client_id: project.clientId || "",
      client_name: project.client || "",
      project_name: project.name || "",
      project_id: String(projectId),
      project_status: project.status || "",
      tag_id: matched?.id || tagIds[0] || "",
      tag_name: matched?.name || "",
      segment_id: segment.id,
      discipline: segment.name,
      requester_id: requesterId,
      requester_name: requesterName,
      requester_avatar: requesterUser?.avatar || "",
      requester_username: requesterUser?.username || user?.username || "",
      owner_id: String(owner.id),
      owner_name: owner.name || owner.username || "",
      owner_avatar: owner.avatar || "",
      owner_username: owner.username || "",
      status: "排队中",
      priority: "普通",
      start_at: now,
      due_in_hours: segment.default_delivery_hours,
      risk_warning_hours: segment.risk_warning_hours,
      due_at: dueAt,
      warn_at: warnAt,
      need_type: segment.name,
      summary: "系统自动生成",
      content_html: AUTO_PROGRAM_HTML,
      hyperlink: null,
      text: null,
      created_at: now,
      updated_at: now,
      status_updated_at: now,
    },
  });
  await prisma.ticket_events.create({
    data: {
      ticket_id: created.id,
      actor_id: requesterId,
      actor_name: requesterName,
      action: "系统自动建单",
      from_status: null,
      to_status: "排队中",
      note: eventNote,
      created_at: now,
    },
  });
  return { created: true, ticketId: created.id };
}

const STATUS_AUTO_TICKET = {
  待反馈: { title: "催反馈", note: "项目状态改为待反馈后自动生成" },
  打包中: { title: "催打包", note: "项目状态改为打包中后自动生成" },
};

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
  const autoTicket = STATUS_AUTO_TICKET[status];
  if (autoTicket) {
    await autoCreateProjectStatusTicket({ project: { ...project, status }, members, projectId, title: autoTicket.title, eventNote: autoTicket.note });
  }
  await refreshProjectPoolSnapshot(projectId);
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
  const fromIndex = PROJECT_STAGES.indexOf(from || "");
  const toIndex = PROJECT_STAGES.indexOf(stage);
  if (fromIndex >= 0 && toIndex <= fromIndex) return { error: "制作阶段只能向后修改,不能回退", code: 400 };
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
  await refreshProjectPoolSnapshot(pid);
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
  await refreshProjectPoolSnapshot(projectId);
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
  await refreshProjectPoolSnapshot(pid);
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
  const today = todayDateText();
  const rows = await loadVisibleSnapshotRows({ user });
  return rows
    .filter((row) => row.status !== "已完成" && row.status !== "回收中")
    .filter((row) => isNextStageDeadlineOverdue({ stage_deadlines: row.stageDeadlines }, { stage: row.stage }, today))
    .map((row) => String(row.id));
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

export async function listStale({ user, page = 1, pageSize = 20, q = "", status = "", stage = "", planner = "", segment = "" }) {
  const timer = createProjectPoolTimer("stale", { page, pageSize, q: !!q, status: !!status, stage: !!stage, planner: !!planner, segment: !!segment, admin: isAdmin(user) });
  try {
    // 临时停用状态流程时间:后面恢复时把 staleCutoffs() 放回 Promise.all，并传 cutoffs 给 soyoo。
    // const cutoffs = await staleCutoffs();
    const extraIds = await deadlineOverdueProjectIds({ user });
    timer.mark("deadlineOverdueProjectIds", { ids: extraIds.length });
    if (!extraIds.length) {
      timer.done({ rows: 0, total: 0, reason: "no_deadline_overdue" });
      return { rows: [], total: 0, page, pageSize };
    }
    const idSet = new Set(extraIds);
    const allRows = filterProjectPoolRows(
      (await loadVisibleSnapshotRows({ user })).filter((row) => idSet.has(String(row.id))),
      { q, status, stage, planner, segment },
    ).sort((a, b) => String(a.stageDeadlines?.find((item) => item.date)?.date || "").localeCompare(String(b.stageDeadlines?.find((item) => item.date)?.date || "")));
    const total = allRows.length;
    const rows = allRows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    timer.mark("snapshot.staleRows", { rows: rows.length, total });
    timer.done({ rows: rows.length, total });
    return { rows, total, page, pageSize };
  } catch (e) {
    timer.error(e);
    throw e;
  }
}
export async function staleCount({ user }) {
  const timer = createProjectPoolTimer("stale-count", { admin: isAdmin(user) });
  try {
    // 临时停用状态流程时间:后面恢复时把 staleCutoffs() 放回 Promise.all，并传 cutoffs 给 soyoo。
    // const cutoffs = await staleCutoffs();
    const extraIds = await deadlineOverdueProjectIds({ user });
    timer.mark("deadlineOverdueProjectIds", { ids: extraIds.length });
    const total = extraIds.length;
    timer.done({ total });
    return total;
  } catch (e) {
    timer.error(e);
    throw e;
  }
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
