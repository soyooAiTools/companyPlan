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

export function versionRowId(projectId, versionId) {
  return `${String(projectId)}::version-${String(versionId)}`;
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
  if (Array.isArray(p.planners) && p.planners.length) return p.planners.map((x) => ({ name: x.name ?? "", avatar: x.avatar ?? "", hireDate: x.hireDate ?? x.hire_date ?? "" }));
  if (p.planner_avatar) return [{ name: p.planner_name ?? "", avatar: p.planner_avatar }];
  return [];
}

export function normalizeProjectForPoolRow(project, members = []) {
  return {
    ...project,
    id: String(project.id),
    tenant_id: project.tenant_id ?? project.clientId ?? "",
    tenant_name: project.tenant_name ?? project.client ?? "",
    member_count: Array.isArray(members) ? members.length : Number(project.member_count ?? 0),
    members: Array.isArray(members)
      ? members
          .map((m) => {
            // 用户 ID：用于人员进度、项目池权限过滤、负责人匹配。
            const userId = String(m.user_id ?? m.userId ?? m.id ?? "");
            return {
              // 兼容旧前端字段，id 必须保持为用户 ID，不能放成员关系 ID。
              id: userId,
              // 显式用户 ID，新代码优先读这个字段。
              userId,
              username: m.username ?? "",
              name: m.nickname || m.name || m.wechat_name || m.username || "",
              avatar: m.avatar ?? m.wechat_avatar_url ?? m.wechat_avatar ?? "",
              wechatName: m.wechatName ?? m.wechat_name ?? "",
              hireDate: m.hireDate ?? m.hire_date ?? "",
              status: m.status ?? m.user_status ?? "",
              tags: (m.tags || []).map((t) => (typeof t === "string" ? t : t?.name ?? "")).filter(Boolean),
            };
          })
      : [],
  };
}

function projectVersions(project) {
  return Array.isArray(project?.versions)
    ? project.versions
        .filter((version) => version?.id)
        .sort((a, b) => Number(a.sort_order ?? a.sortOrder ?? 0) - Number(b.sort_order ?? b.sortOrder ?? 0) || String(a.code || "").localeCompare(String(b.code || "")))
    : [];
}

function isDefaultVersion(version) {
  return !!version?.is_default || String(version?.code || "").toLowerCase() === "v1";
}

function defaultVersion(project) {
  const versions = projectVersions(project);
  return versions.find(isDefaultVersion) || versions[0] || null;
}

function versionValue(version, project, key, fallbackKey = key) {
  const camelKey = key.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
  const fallbackCamelKey = fallbackKey.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
  const value = version?.[key] ?? version?.[camelKey];
  return value === undefined || value === null || value === "" ? (project?.[fallbackKey] ?? project?.[fallbackCamelKey]) : value;
}

function normalizeStageDeadlinesValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function defaultStageFromDeadlines(items) {
  const first = Array.isArray(items) ? items.find((item) => item?.key || item?.name) : null;
  return first?.name || first?.key || "";
}

export function buildProjectPoolRow(project, ticketAgg, segMap, statusSettings, extMap, options = {}) {
  const rowId = String(options.rowId || project.id);
  const version = options.version || (!options.hasVersionChildren ? null : defaultVersion(project));
  const agg = ticketAgg[rowId] || {};
  const ext = extMap?.[rowId] || {};
  const status = version ? versionValue(version, project, "status") : project.status;
  const stageDeadlines = normalizeStageDeadlinesValue(version ? versionValue(version, project, "stage_deadlines", "stage_deadlines") : (project.stage_deadlines ?? project.stageDeadlines));
  const memberCount = version ? Number(version.member_count ?? project.member_count ?? 0) : project.member_count ?? 0;
  const now = nowIso();
  const setting = statusSettings?.[status];
  const statusChangedAt = version ? versionValue(version, project, "status_changed_at") : project.status_changed_at;
  const stuckHours = statusChangedAt ? Math.round(businessHoursBetween(statusChangedAt, now)) : null;
  const staleHours = setting?.enabled ? setting.staleHours : 0;
  const isStale = !!(setting?.enabled && setting.staleHours > 0 && stuckHours != null && stuckHours > setting.staleHours);
  return {
    id: rowId,
    projectId: String(project.id),
    versionId: version?.id ? String(version.id) : "",
    versionCode: version?.code || "",
    versionName: version?.name || "",
    parentId: options.parentId ? String(options.parentId) : "",
    isVersionRow: !!options.isVersionRow,
    hasVersionChildren: !!options.hasVersionChildren,
    projectLifecycleStatus: project.project_lifecycle_status || project.lifecycle_status || "",
    name: project.name ?? "",
    tenantId: project.tenant_id ?? "",
    tenantName: project.tenant_name ?? "",
    customerContact: (version ? versionValue(version, project, "customer_contact") : project.customer_contact) ?? "",
    requirementDoc: (version ? versionValue(version, project, "requirement_doc") : project.requirement_doc) ?? "",
    status: status ?? "",
    plannerName: project.planner_name ?? "",
    planners: normalizePlanners(project),
    stage: ext.stage || defaultStageFromDeadlines(stageDeadlines),
    stageDeadlines,
    stageChangedAt: ext.stageChangedAt ?? null,
    startedAt: (version ? versionValue(version, project, "started_at") : project.started_at) ?? null,
    remark: ext.remark || "",
    statusChangedAt: statusChangedAt ?? null,
    memberCount,
    members: Array.isArray(project.members) ? project.members : [],
    segments: options.isVersionRow ? [] : orderSegments(agg.segCounts || {}, segMap),
    ticketGroups: options.isVersionRow ? {} : agg.groups || {},
    ticketTotal: options.isVersionRow ? 0 : agg.total || 0,
    atRisk: options.isVersionRow ? 0 : agg.atRisk || 0,
    overdue: options.isVersionRow ? 0 : agg.overdue || 0,
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
  const versionExtIds = projects.flatMap((project) => projectVersions(project).map((version) => versionRowId(project.id, version.id)));
  const [ticketAgg, segMap, statusSettings, extMap] = await Promise.all([
    aggregateProjectTickets([...ids, ...versionExtIds]),
    loadSegmentOrderMap(),
    loadStatusSettingsMap(),
    loadProjectExtMap([...ids, ...versionExtIds]),
  ]);
  return projects.map((project) => {
    const versions = projectVersions(project);
    const parentMembers = membersByProjectId.get(String(project.id)) || [];
    const normalizedParent = normalizeProjectForPoolRow(project, parentMembers);
    if (versions.length <= 1) {
      const version = versions[0] || null;
      const members = version ? membersByProjectId.get(versionRowId(project.id, version.id)) || parentMembers : parentMembers;
      return buildProjectPoolRow(normalizeProjectForPoolRow(project, members), ticketAgg, segMap, statusSettings, extMap, { version });
    }
    const parentRow = buildProjectPoolRow(normalizedParent, ticketAgg, segMap, statusSettings, extMap, { hasVersionChildren: true });
    parentRow.children = versions.map((version) => {
      const rowId = versionRowId(project.id, version.id);
      const members = membersByProjectId.get(rowId) || (isDefaultVersion(version) ? parentMembers : []);
      return buildProjectPoolRow(normalizeProjectForPoolRow(project, members), ticketAgg, segMap, statusSettings, extMap, {
        rowId,
        version,
        parentId: project.id,
        isVersionRow: true,
      });
    });
    return parentRow;
  });
}
