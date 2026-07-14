import { prisma } from "../../prisma.mjs";
import { nowIso } from "../../ops-helpers.mjs";
import { businessHoursBetween } from "../../business-hours.mjs";

// 批量取项目 ops 扩展字段(阶段/备注等)。
export async function loadProjectExtMap(projectIds) {
  const out = {};
  if (!projectIds.length) return out;
  const rows = await prisma.ops_project_ext.findMany({ where: { project_id: { in: projectIds.map(String) } } });
  for (const r of rows) out[r.project_id] = { stage: r.stage, stageChangedAt: r.stage_changed_at, remark: r.remark };
  return out;
}

function ensureTicketAgg(map, pid) {
  return (map[pid] ||= { groups: {}, total: 0, atRisk: 0, overdue: 0, segCounts: {} });
}

// 每项目聚合:未完成按状态分组数 / 逾期 / 临期 / 各环节未完成工单数。
export async function aggregateProjectTickets(projectIds) {
  const out = {};
  if (!projectIds.length) return out;
  const now = nowIso();
  const base = { project_id: { in: projectIds }, status: { not: "已完成" } };
  const [byStatus, overdue, atRisk, bySegment] = await Promise.all([
    prisma.tickets.groupBy({ by: ["project_id", "status"], where: base, _count: { _all: true } }),
    prisma.tickets.groupBy({ by: ["project_id"], where: { ...base, warn_at: { lt: now } }, _count: { _all: true } }),
    prisma.tickets.groupBy({ by: ["project_id"], where: { ...base, due_at: { lt: now }, warn_at: { gte: now } }, _count: { _all: true } }),
    prisma.tickets.groupBy({ by: ["project_id", "segment_id"], where: { ...base, segment_id: { not: null } }, _count: { _all: true } }),
  ]);
  for (const g of byStatus) {
    const o = ensureTicketAgg(out, g.project_id);
    o.groups[g.status] = g._count._all;
    o.total += g._count._all;
  }
  for (const g of overdue) ensureTicketAgg(out, g.project_id).overdue = g._count._all;
  for (const g of atRisk) ensureTicketAgg(out, g.project_id).atRisk = g._count._all;
  for (const g of bySegment) ensureTicketAgg(out, g.project_id).segCounts[g.segment_id] = g._count._all;
  return out;
}

export async function loadSegmentOrderMap() {
  const segs = await prisma.ops_segments.findMany({ select: { id: true, name: true, sort_order: true } });
  const out = new Map();
  for (const s of segs) out.set(s.id, { name: s.name, sort: s.sort_order });
  return out;
}

export function orderSegments(segCounts, segMap) {
  return Object.entries(segCounts)
    .map(([id, count]) => ({ id: Number(id), count, ...(segMap.get(Number(id)) || { name: "", sort: 9999 }) }))
    .filter((s) => s.name)
    .sort((a, b) => a.sort - b.sort)
    .map((s) => ({ id: s.id, name: s.name, count: s.count }));
}

export async function loadStatusSettingsMap() {
  const rows = await prisma.ops_project_status_settings.findMany();
  return Object.fromEntries(rows.map((r) => [r.status, { enabled: !!r.enabled, staleHours: r.stale_hours }]));
}

function normalizePlanners(p) {
  if (Array.isArray(p.planners) && p.planners.length) return p.planners.map((x) => ({ name: x.name ?? "", avatar: x.avatar ?? "" }));
  if (p.planner_avatar) return [{ name: p.planner_name ?? "", avatar: p.planner_avatar }];
  return [];
}

export function normalizeProjectForPoolRow(project, members = []) {
  return {
    ...project,
    id: String(project.id),
    tenant_id: project.tenant_id ?? project.clientId ?? "",
    tenant_name: project.tenant_name ?? project.client ?? "",
    member_count: Array.isArray(members) ? members.filter((m) => m.status !== "disabled").length : Number(project.member_count ?? 0),
  };
}

export function buildProjectPoolRow(project, ticketAgg, segMap, statusSettings, extMap) {
  const agg = ticketAgg[String(project.id)] || {};
  const ext = extMap?.[String(project.id)] || {};
  const now = nowIso();
  const setting = statusSettings?.[project.status];
  const stuckHours = project.status_changed_at ? Math.round(businessHoursBetween(project.status_changed_at, now)) : null;
  const staleHours = setting?.enabled ? setting.staleHours : 0;
  const isStale = !!(setting?.enabled && setting.staleHours > 0 && stuckHours != null && stuckHours > setting.staleHours);
  return {
    id: String(project.id),
    name: project.name ?? "",
    tenantName: project.tenant_name ?? "",
    status: project.status ?? "",
    plannerName: project.planner_name ?? "",
    planners: normalizePlanners(project),
    stage: ext.stage || "",
    stageDeadlines: Array.isArray(project.stage_deadlines) ? project.stage_deadlines : [],
    stageChangedAt: ext.stageChangedAt ?? null,
    startedAt: project.started_at ?? null,
    remark: ext.remark || "",
    statusChangedAt: project.status_changed_at ?? null,
    memberCount: project.member_count ?? 0,
    segments: orderSegments(agg.segCounts || {}, segMap),
    ticketGroups: agg.groups || {},
    ticketTotal: agg.total || 0,
    atRisk: agg.atRisk || 0,
    overdue: agg.overdue || 0,
    stuckHours,
    staleHours,
    overByHours: isStale ? stuckHours - staleHours : null,
    isStale,
    stageStuckHours: null,
    stageStaleHours: 0,
    stageOverByHours: null,
    stageStale: false,
  };
}

export async function buildProjectPoolRows(projects, membersByProjectId = new Map()) {
  const ids = projects.map((p) => String(p.id));
  const [ticketAgg, segMap, statusSettings, extMap] = await Promise.all([
    aggregateProjectTickets(ids),
    loadSegmentOrderMap(),
    loadStatusSettingsMap(),
    loadProjectExtMap(ids),
  ]);
  return projects.map((project) => {
    const members = membersByProjectId.get(String(project.id)) || [];
    return buildProjectPoolRow(normalizeProjectForPoolRow(project, members), ticketAgg, segMap, statusSettings, extMap);
  });
}
