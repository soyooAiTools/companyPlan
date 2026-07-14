import { prisma } from "../../prisma.mjs";
import { getProjectWithMembers } from "../../ops-realtime.mjs";
import { isAdmin, meId, nowIso } from "../../ops-helpers.mjs";
import { remainingBusinessHours } from "../../business-hours.mjs";
import { loadSegmentOrderMap } from "./read-model.mjs";

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
    remainingHours: remainingBusinessHours(t.due_at, now),
    overdue: !!(t.warn_at && t.warn_at < now),
    atRisk: !!(t.due_at && t.due_at < now && t.warn_at && t.warn_at >= now),
  }));
}

export async function listProjectPoolTickets({ projectIds = [], mode = "unfinished", segmentIds = [], ownerName = "" }) {
  const ids = [...new Set((projectIds ?? []).map(String).filter(Boolean))];
  if (!ids.length) return [];
  const now = nowIso();
  const segmentFilter = (segmentIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const where = {
    project_id: { in: ids },
    status: { not: "已完成" },
  };
  if (mode === "overdue") {
    where.warn_at = { not: null, lt: now };
  }
  if (segmentFilter.length) {
    where.segment_id = { in: segmentFilter };
  }
  if (ownerName) {
    where.owner_name = String(ownerName);
  }
  const rows = await prisma.tickets.findMany({
    where,
    orderBy: mode === "overdue" ? [{ due_at: "asc" }, { created_at: "desc" }] : [{ created_at: "desc" }],
    select: {
      id: true,
      title: true,
      project_id: true,
      project_name: true,
      status: true,
      priority: true,
      requester_name: true,
      requester_avatar: true,
      owner_name: true,
      owner_avatar: true,
      due_at: true,
      warn_at: true,
      segment_id: true,
      discipline: true,
      tag_name: true,
    },
  });
  const segMap = await loadSegmentOrderMap();
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    projectId: t.project_id,
    projectName: t.project_name || "",
    segmentId: t.segment_id ?? null,
    segmentName: (t.segment_id ? segMap.get(t.segment_id)?.name : "") || t.discipline || t.tag_name || "",
    status: t.status,
    priority: t.priority,
    requesterName: t.requester_name || "",
    requesterAvatar: t.requester_avatar || "",
    ownerName: t.owner_name || "",
    ownerAvatar: t.owner_avatar || "",
    dueAt: t.due_at,
    remainingHours: remainingBusinessHours(t.due_at, now),
    overdue: !!(t.warn_at && t.warn_at < now),
    atRisk: !!(t.due_at && t.due_at < now && t.warn_at && t.warn_at >= now),
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
