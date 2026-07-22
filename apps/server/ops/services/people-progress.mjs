import { remainingBusinessHours } from "../business-hours.mjs";
import { prisma } from "../prisma.mjs";

const DONE_STATUS = "已完成";
const ACTIVE_STATUSES = new Set(["排队中", "进行中", "阻塞"]);
const ROLE_DEFS = [
  { key: "all", label: "全部", keywords: [] },
  { key: "program", label: "程序", keywords: ["程序", "unity", "cocos", "开发"] },
  { key: "model", label: "模型", keywords: ["模型"] },
  { key: "animation", label: "动画", keywords: ["动画"] },
  { key: "ui", label: "UI", keywords: ["ui"] },
  { key: "level", label: "地编", keywords: ["地编"] },
  { key: "effect", label: "特效", keywords: ["特效"] },
  { key: "producer", label: "制片", keywords: ["制片"] },
  { key: "storyboard", label: "分镜", keywords: ["分镜"] },
  { key: "sound", label: "音效", keywords: ["音效"] },
  { key: "ta", label: "TA", keywords: ["ta"] },
];

const roleByKey = new Map(ROLE_DEFS.map((role) => [role.key, role]));

function ticketRoleText(ticket) {
  return `${ticket.discipline || ""} ${ticket.tag_name || ""} ${ticket.need_type || ""}`.toLowerCase();
}

function roleMatches(ticket, roleKey) {
  const role = roleByKey.get(roleKey) || roleByKey.get("all");
  if (!role || role.key === "all") return true;
  const text = ticketRoleText(ticket);
  return role.keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function ticketRoleLabels(ticket) {
  const directLabels = [ticket.tag_name, ticket.discipline].map((value) => String(value || "").trim()).filter(Boolean);
  if (directLabels.length) return [...new Set(directLabels)];
  const text = ticketRoleText(ticket);
  const labels = ROLE_DEFS.filter((role) => role.key !== "all" && role.keywords.some((keyword) => text.includes(keyword.toLowerCase()))).map((role) => role.label);
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

async function loadPersonRoleLabels(tickets) {
  const projectIds = [...new Set(tickets.map((ticket) => String(ticket.project_id || "").trim()).filter(Boolean))];
  const ownerIds = [
    ...new Set(
      tickets
        .flatMap((ticket) => {
          const rawId = String(ticket.owner_id || "").trim();
          const normalizedId = normalizePersonId(rawId);
          return [rawId, normalizedId, normalizedId ? `ops-user-${normalizedId}` : ""];
        })
        .filter(Boolean),
    ),
  ];
  if (!projectIds.length || !ownerIds.length) return new Map();
  const tagRows = await prisma.project_member_tags.findMany({
    where: { project_id: { in: projectIds }, person_id: { in: ownerIds } },
    select: { person_id: true, tag_id: true },
  });
  const tagIds = [...new Set(tagRows.map((row) => String(row.tag_id)).filter(Boolean))];
  if (!tagIds.length) return new Map();
  const tags = await prisma.tags.findMany({ where: { id: { in: tagIds } }, select: { id: true, name: true } });
  const tagNameById = new Map(tags.map((tag) => [String(tag.id), tag.name]));
  const labelsByPersonId = new Map();

  for (const row of tagRows) {
    const label = String(tagNameById.get(String(row.tag_id)) || "").trim();
    if (!label) continue;
    const rawId = String(row.person_id);
    const ids = [rawId, normalizePersonId(rawId), `ops-user-${normalizePersonId(rawId)}`].filter(Boolean);
    for (const id of ids) {
      const labels = labelsByPersonId.get(id) || new Set();
      labels.add(label);
      labelsByPersonId.set(id, labels);
    }
  }
  return labelsByPersonId;
}

export function listPeopleProgressRoles() {
  return ROLE_DEFS;
}

export async function listPeopleProgress({ role = "all", q = "", overdueOnly = false, newcomerOnly = false }) {
  const tickets = (await loadActiveTickets()).filter((ticket) => roleMatches(ticket, role) && (!overdueOnly || isOverdueTicket(ticket)));
  const peopleById = await loadPeopleByIds(tickets.map((ticket) => ticket.owner_id));
  const roleLabelsByPersonId = await loadPersonRoleLabels(tickets);
  const groups = new Map();

  for (const ticket of tickets) {
    const rawOwnerId = String(ticket.owner_id || "").trim();
    const normalizedOwnerId = normalizePersonId(rawOwnerId);
    const person = peopleById.get(rawOwnerId) || peopleById.get(normalizedOwnerId);
    const key = normalizedOwnerId || rawOwnerId || String(ticket.owner_name || "unknown");
    if (!groups.has(key)) {
      const hireDate = normalizeHireDate(person?.hire_date);
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
    const roleLabels = roleLabelsByPersonId.get(rawOwnerId) || roleLabelsByPersonId.get(normalizedOwnerId);
    if (roleLabels?.size) {
      roleLabels.forEach((label) => group.roles.add(label));
    } else {
      ticketRoleLabels(ticket).forEach((label) => group.roles.add(label));
    }
  }

  return [...groups.values()]
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
      projectCount: group.projectIds.size,
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
    .filter((ticket) => roleMatches(ticket, role) && matchesKeyword(ticket, q))
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
