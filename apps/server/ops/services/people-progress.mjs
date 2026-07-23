import { remainingBusinessHours } from "../business-hours.mjs";
import { prisma } from "../prisma.mjs";
import { EXCLUDED_CLIENT_NAMES } from "../project-pool-constants.mjs";
import { soyooClient } from "../soyoo-client.mjs";

const DONE_STATUS = "已完成";
const ACTIVE_STATUSES = new Set(["排队中", "进行中", "阻塞"]);
const ROLE_DEFS = [
  { key: "all", label: "全部", keywords: [], memberTags: [] },
  { key: "program", label: "程序", keywords: ["程序", "unity", "cocos", "开发"], memberTags: ["unity开发", "cocos开发"] },
  { key: "model", label: "模型", keywords: ["模型"], memberTags: ["模型"] },
  { key: "animation", label: "动画", keywords: ["动画"], memberTags: ["动画"] },
  { key: "ui", label: "UI", keywords: ["ui"], memberTags: ["UI"] },
  { key: "level", label: "地编", keywords: ["地编"], memberTags: ["地编"] },
  { key: "effect", label: "特效", keywords: ["特效"], memberTags: ["特效"] },
  { key: "producer", label: "制片", keywords: ["制片"], memberTags: ["制片"] },
  { key: "storyboard", label: "分镜", keywords: ["分镜"], memberTags: ["分镜"] },
  { key: "sound", label: "音效", keywords: ["音效"], memberTags: ["音效"] },
  { key: "ta", label: "TA", keywords: ["ta"], memberTags: ["TA"] },
];

const roleByKey = new Map(ROLE_DEFS.map((role) => [role.key, role]));
function roleKeywordMatches(text, roleKey) {
  const role = roleByKey.get(roleKey) || roleByKey.get("all");
  if (!role || role.key === "all") return true;
  const normalized = String(text || "").toLowerCase();
  return role.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function memberRoleLabelMatches(label, roleKey) {
  const role = roleByKey.get(roleKey) || roleByKey.get("all");
  if (!role || role.key === "all") return true;
  const text = String(label || "").trim().toLowerCase();
  return (role.memberTags || []).some((tag) => String(tag || "").trim().toLowerCase() === text);
}

function ticketRoleText(ticket) {
  return `${ticket.discipline || ""} ${ticket.tag_name || ""} ${ticket.need_type || ""}`.toLowerCase();
}

function roleMatches(ticket, roleKey) {
  return roleKeywordMatches(ticketRoleText(ticket), roleKey);
}

function ticketRoleLabels(ticket) {
  const directLabels = [ticket.tag_name, ticket.discipline].map((value) => String(value || "").trim()).filter(Boolean);
  if (directLabels.length) return [...new Set(directLabels)];
  const text = ticketRoleText(ticket);
  const labels = ROLE_DEFS.filter((role) => role.key !== "all" && roleKeywordMatches(text, role.key)).map((role) => role.label);
  return [...new Set(labels)];
}

function isActiveTicket(ticket) {
  return ticket.status !== DONE_STATUS && ACTIVE_STATUSES.has(ticket.status);
}

function isOverdueTicket(ticket) {
  return isActiveTicket(ticket) && remainingBusinessHours(ticket.due_at) < 0;
}

function matchesKeyword(ticket, keyword) {
  if (!keyword) return true;
  const text = [
    ticket.title,
    ticket.project_name,
    ticket.client_name,
    ticket.source_project_name,
    ticket.owner_name,
    ticket.requester_name,
    ticket.discipline,
    ticket.need_type,
    ticket.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes(keyword.toLowerCase());
}

function matchesPersonKeyword(person, keyword) {
  const terms = String(keyword || "")
    .split(/[\s,，、/]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!terms.length) return true;
  const text = [person.name, person.username, person.wechatName, person.userId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.some((term) => text.includes(term));
}

function normalizePersonId(id) {
  return String(id || "").trim().replace(/^ops-user-/, "");
}

function normalizeHireDate(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 10) : "";
}

function isNewcomer(hireDate) {
  const text = normalizeHireDate(hireDate);
  if (!text) return false;
  const time = new Date(`${text}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(time)) return false;
  return Date.now() - time <= 45 * 24 * 60 * 60 * 1000;
}

function mapTicket(ticket, stageByProjectId = new Map()) {
  return {
    id: ticket.id,
    title: ticket.title,
    client: ticket.client_name ?? ticket.source_project_name ?? "",
    projectName: ticket.project_name ?? "",
    projectId: ticket.project_id,
    projectStage: stageByProjectId.get(String(ticket.project_id)) || "",
    tagName: ticket.need_type || ticket.discipline || ticket.tag_name || "",
    needType: ticket.need_type,
    priority: ticket.priority,
    status: ticket.status,
    dueInHours: ticket.due_in_hours,
    ownerId: ticket.owner_id,
    ownerName: ticket.owner_name ?? "",
    ownerAvatar: ticket.owner_avatar ?? "",
    requesterId: ticket.requester_id,
    requesterName: ticket.requester_name ?? "",
    requesterAvatar: ticket.requester_avatar ?? "",
    summary: ticket.summary ?? "",
    contentHtml: ticket.content_html ?? "",
    adminNote: ticket.admin_note ?? "",
    adminNoteUpdatedAt: ticket.admin_note_updated_at ?? null,
    hyperlink: ticket.hyperlink ?? "",
    blockReason: ticket.block_reason ?? "",
    riskWarningHours: ticket.risk_warning_hours ?? 8,
    remainingHours: ticket.status === DONE_STATUS ? null : remainingBusinessHours(ticket.due_at),
    createdAt: ticket.created_at,
    statusUpdatedAt: ticket.status_updated_at,
    canEdit: false,
    canEditContent: false,
    canAssign: false,
    canEditPriority: false,
    canEditAdminNote: false,
  };
}

async function loadProjectStageByIds(ids) {
  const projectIds = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!projectIds.length) return new Map();
  const rows = await prisma.ops_project_ext.findMany({
    where: { project_id: { in: projectIds } },
    select: { project_id: true, stage: true },
  });
  return new Map(rows.map((row) => [String(row.project_id), row.stage || ""]));
}

async function loadActiveTickets() {
  return prisma.tickets.findMany({
    where: { status: { not: DONE_STATUS } },
    orderBy: [{ due_at: "asc" }, { created_at: "desc" }],
    omit: { content_html: true },
  });
}

async function loadPeopleByIds(ids) {
  const cleanIds = [
    ...new Set(
      ids
        .flatMap((id) => {
          const rawId = String(id || "").trim();
          const normalizedId = normalizePersonId(rawId);
          return [rawId, normalizedId, normalizedId ? `ops-user-${normalizedId}` : ""];
        })
        .filter(Boolean),
    ),
  ];
  if (!cleanIds.length) return new Map();
  const rows = await prisma.people.findMany({
    where: { id: { in: cleanIds } },
    select: { id: true, name: true, username: true, wechat_name: true, wechat_avatar: true, hire_date: true, disabled_at: true },
  });
  const peopleById = new Map();
  for (const row of rows) {
    const id = String(row.id);
    peopleById.set(id, row);
    peopleById.set(normalizePersonId(id), row);
    peopleById.set(`ops-user-${normalizePersonId(id)}`, row);
  }
  return peopleById;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function loadProjectCountsByMemberId(roleKey = "all") {
  if (roleKey !== "program") return new Map();
  const rows = await prisma.$queryRaw`
    SELECT project_id, row_json, tenant_name
    FROM ops_project_pool_snapshot
    WHERE status <> '回收中' AND status <> '已完成'
  `;
  const projectIdsByMember = new Map();
  for (const row of rows) {
    const projectId = String(row.project_id || "").trim();
    const tenantName = String(row.tenant_name || "").trim().toLowerCase();
    if (tenantName && EXCLUDED_CLIENT_NAMES.includes(tenantName)) continue;
    const snapshot = parseJson(row.row_json, null);
    const members = Array.isArray(snapshot?.members) ? snapshot.members : [];
    if (!projectId || !members.length) continue;
    for (const member of members) {
      const labels = Array.isArray(member?.tags) ? member.tags : [];
      if (roleKey !== "all" && !labels.some((label) => memberRoleLabelMatches(label, roleKey))) continue;
      const key = normalizePersonId(member?.id);
      if (!key) continue;
      if (!projectIdsByMember.has(key)) projectIdsByMember.set(key, new Set());
      projectIdsByMember.get(key).add(projectId);
    }
  }
  return new Map([...projectIdsByMember.entries()].map(([key, projectIds]) => [key, projectIds.size]));
}

function soyooUserTags(user) {
  return [
    ...new Set(
      (Array.isArray(user?.tags) ? user.tags : [])
        .map((tag) => (typeof tag === "string" ? tag : tag?.name))
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    ),
  ];
}

async function loadSoyooPeopleGroups(roleKey = "all") {
  const peopleRows = await soyooClient.users();
  const groups = new Map();

  for (const person of peopleRows) {
    if (String(person.status || "").toLowerCase() === "disabled") continue;
    const rawId = String(person.id ?? "").trim();
    const key = normalizePersonId(rawId) || rawId;
    if (!key) continue;
    const labels = soyooUserTags(person);
    if (roleKey !== "all" && !labels.some((label) => memberRoleLabelMatches(label, roleKey))) continue;
    const hireDate = normalizeHireDate(person.hire_date);
    groups.set(key, {
      userId: key,
      name: person.nickname || person.name || person.username || "未指定",
      username: person.username || "",
      avatar: person.wechat_avatar_url || person.wechat_avatar || "",
      wechatName: person.wechat_name || "",
      hireDate,
      isNewcomer: isNewcomer(hireDate),
      disabled: false,
      roles: new Set(labels),
      projectIds: new Set(),
      unfinished: 0,
      doing: 0,
      queued: 0,
      blocked: 0,
      overdue: 0,
      ticketIds: new Set(),
    });
  }
  return groups;
}

export function listPeopleProgressRoles() {
  return ROLE_DEFS;
}

export async function listPeopleProgress({ role = "all", q = "", overdueOnly = false, newcomerOnly = false }) {
  const [peopleGroups, projectCountsByMemberId] = await Promise.all([loadSoyooPeopleGroups(role), loadProjectCountsByMemberId(role)]);
  const tickets = (await loadActiveTickets()).filter((ticket) => {
    const ownerKey = normalizePersonId(ticket.owner_id) || String(ticket.owner_id || "").trim();
    const ownerGroup = peopleGroups.get(ownerKey);
    const ownerMatchesRole = ownerGroup ? role === "all" || [...ownerGroup.roles].some((label) => memberRoleLabelMatches(label, role)) : roleMatches(ticket, role);
    return ownerMatchesRole && (!overdueOnly || isOverdueTicket(ticket));
  });
  const peopleById = await loadPeopleByIds(tickets.map((ticket) => ticket.owner_id));
  const groups = new Map(peopleGroups);

  for (const ticket of tickets) {
    const rawOwnerId = String(ticket.owner_id || "").trim();
    const normalizedOwnerId = normalizePersonId(rawOwnerId);
    const person = peopleById.get(rawOwnerId) || peopleById.get(normalizedOwnerId);
    const key = normalizedOwnerId || rawOwnerId || String(ticket.owner_name || "unknown");
    if (!groups.has(key)) {
      const hireDate = normalizeHireDate(person?.hire_date);
      if (person?.disabled_at) continue;
      groups.set(key, {
        userId: key,
        name: person?.name || ticket.owner_name || "未指定",
        username: person?.username || ticket.owner_username || "",
        avatar: person?.wechat_avatar || ticket.owner_avatar || "",
        wechatName: person?.wechat_name || "",
        hireDate,
        isNewcomer: isNewcomer(hireDate),
        disabled: Boolean(person?.disabled_at),
        roles: new Set(),
        projectIds: new Set(),
        unfinished: 0,
        doing: 0,
        queued: 0,
        blocked: 0,
        overdue: 0,
        ticketIds: new Set(),
      });
    }
    const group = groups.get(key);
    group.unfinished += 1;
    if (ticket.status === "进行中") group.doing += 1;
    if (ticket.status === "排队中") group.queued += 1;
    if (ticket.status === "阻塞") group.blocked += 1;
    if (isOverdueTicket(ticket)) group.overdue += 1;
    if (ticket.project_id) group.projectIds.add(String(ticket.project_id));
    group.ticketIds.add(String(ticket.id));
  }

  return [...groups.values()]
    .filter((group) => !overdueOnly || group.overdue > 0)
    .filter((group) => !newcomerOnly || group.isNewcomer)
    .map((group) => ({
      userId: group.userId,
      name: group.name,
      username: group.username,
      avatar: group.avatar,
      wechatName: group.wechatName,
      hireDate: group.hireDate,
      isNewcomer: group.isNewcomer,
      disabled: group.disabled,
      roles: [...group.roles],
      unfinished: group.unfinished,
      doing: group.doing,
      queued: group.queued,
      blocked: group.blocked,
      overdue: group.overdue,
      projectCount: projectCountsByMemberId.get(group.userId) || 0,
      ticketCount: group.ticketIds.size,
    }))
    .filter((group) => matchesPersonKeyword(group, q))
    .sort((a, b) => b.unfinished - a.unfinished || b.overdue - a.overdue || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

export async function listPersonProgressTickets({ userId, role = "all", status = "all", q = "" }) {
  const normalizedUserId = normalizePersonId(userId);
  const ownerIds = [...new Set([String(userId || "").trim(), normalizedUserId, normalizedUserId ? `ops-user-${normalizedUserId}` : ""].filter(Boolean))];
  const tickets = await prisma.tickets.findMany({
    where: { owner_id: { in: ownerIds }, status: { not: DONE_STATUS } },
    orderBy: [{ due_at: "asc" }, { created_at: "desc" }],
    omit: { content_html: true },
  });
  const stageByProjectId = await loadProjectStageByIds(tickets.map((ticket) => ticket.project_id));
  return tickets
    .filter((ticket) => matchesKeyword(ticket, q))
    .filter((ticket) => {
      if (status === "all") return true;
      if (status === "overdue") return isOverdueTicket(ticket);
      if (status === "doing") return ticket.status === "进行中";
      if (status === "queued") return ticket.status === "排队中";
      if (status === "blocked") return ticket.status === "阻塞";
      return true;
    })
    .map((ticket) => mapTicket(ticket, stageByProjectId));
}
