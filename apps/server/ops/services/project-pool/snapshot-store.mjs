import { prisma } from "../../prisma.mjs";
import { soyooClient, soyooId, soyooProjectId } from "../../soyoo-client.mjs";
import { getProjectWithMembers } from "../../ops-realtime.mjs";
import { isAdmin, meId, nowIso } from "../../ops-helpers.mjs";
import { EXCLUDED_CLIENT_NAMES } from "../../project-pool-constants.mjs";
import { buildProjectPoolRows, normalizeProjectForPoolRow, versionRowId } from "./read-model.mjs";
import { invalidateProjectPoolSnapshotRowsCache, readProjectPoolSnapshotRowsCache, writeProjectPoolSnapshotRowsCache } from "./cache.mjs";

const REBUILD_CONCURRENCY = Math.max(1, Number(process.env.COMPANYPLAN_OPS_REBUILD_CONCURRENCY ?? "8"));

export async function ensureProjectPoolSnapshotTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS ops_project_pool_snapshot (
      project_id VARCHAR(64) PRIMARY KEY,
      row_json MEDIUMTEXT NOT NULL,
      status VARCHAR(80) NOT NULL DEFAULT '',
      stage VARCHAR(40) NOT NULL DEFAULT '',
      tenant_name VARCHAR(160) NOT NULL DEFAULT '',
      planner_name VARCHAR(255) NOT NULL DEFAULT '',
      member_ids_json TEXT,
      updated_at VARCHAR(40) NOT NULL,
      version BIGINT NOT NULL DEFAULT 0,
      KEY idx_opps_status (status),
      KEY idx_opps_stage (stage),
      KEY idx_opps_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;
}

export function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function snapshotDbRowToPoolRow(row) {
  return parseJson(row.row_json, null);
}

export function snapshotMemberIds(row) {
  return parseJson(row.member_ids_json, []);
}

async function deleteProjectPoolSnapshot(projectId, reason) {
  const pid = String(projectId || "");
  if (!pid) return;
  await prisma.$executeRaw`DELETE FROM ops_project_pool_snapshot WHERE project_id = ${pid}`;
  await invalidateProjectPoolSnapshotRowsCache(reason);
}

async function existingSnapshotMemberIds(projectId) {
  await ensureProjectPoolSnapshotTable();
  const rows = await prisma.$queryRaw`SELECT member_ids_json FROM ops_project_pool_snapshot WHERE project_id = ${String(projectId)} LIMIT 1`;
  return rows.length ? snapshotMemberIds(rows[0]) : [];
}

function projectVersions(project) {
  return Array.isArray(project?.versions) ? project.versions.filter((version) => version?.id) : [];
}

function isProjectLifecycleHidden(project) {
  const lifecycle = String(project?.project_lifecycle_status || project?.lifecycle_status || "").trim();
  return lifecycle === "已完成" || lifecycle === "已回收" || lifecycle === "客户暂停";
}

function isProjectLifecycleActive(row) {
  const lifecycle = String(row?.projectLifecycleStatus || row?.project_lifecycle_status || row?.lifecycle_status || "").trim();
  return lifecycle === "进行中" || lifecycle === "正常";
}

function rowMatchesAnyStatus(row, statusNames = []) {
  const statuses = new Set((statusNames || []).map((name) => String(name || "").trim()).filter(Boolean));
  if (!statuses.size) return false;
  if (statuses.has(String(row?.status || "").trim())) return true;
  return Array.isArray(row?.children) && row.children.some((child) => statuses.has(String(child?.status || "").trim()));
}

function membersFromResponse(response) {
  return Array.isArray(response?.members) ? response.members : Array.isArray(response) ? response : [];
}

// member_ids_json 用于按登录用户过滤项目池，必须保存用户 ID，不能保存项目成员关系 ID。
function memberUserId(member) {
  return String(member?.user_id ?? member?.userId ?? member?.id ?? "").trim();
}

function memberMatchesUser(member, userId) {
  const uid = soyooId(userId);
  if (!uid) return false;
  return soyooId(memberUserId(member)) === uid;
}

function rowHasMember(row, userId) {
  return Array.isArray(row?.members) && row.members.some((member) => memberMatchesUser(member, userId));
}

function filterRowForMember(row, userId) {
  const children = Array.isArray(row?.children) ? row.children : [];
  if (!children.length) return rowHasMember(row, userId) ? row : null;
  const matchedChildren = children.filter((child) => rowHasMember(child, userId));
  if (!matchedChildren.length) return null;
  return { ...row, children: matchedChildren };
}

function myProjectVersionIds(project) {
  const versions = Array.isArray(project?.versions) ? project.versions : [];
  return versions
    .map((version) => version?.id ?? version?.version_id ?? version?.project_version_id ?? version?.projectVersionId)
    .map((id) => String(id || "").trim())
    .filter(Boolean);
}

async function loadMyProjectRefs(user) {
  try {
    const data = await soyooClient.myProjects(user?.id);
    const projects = Array.isArray(data?.projects) ? data.projects : [];
    const projectIds = new Set();
    const versionIdsByProjectId = new Map();
    for (const project of projects) {
      const projectId = String(project?.project_id ?? project?.id ?? "").trim();
      if (!projectId) continue;
      const lifecycle = String(project?.project_lifecycle_status || project?.lifecycle_status || "").trim();
      if (lifecycle && lifecycle !== "进行中" && lifecycle !== "正常") continue;
      projectIds.add(projectId);
      const versionIds = myProjectVersionIds(project);
      if (versionIds.length) versionIdsByProjectId.set(projectId, new Set(versionIds));
    }
    return { projectIds, versionIdsByProjectId };
  } catch {
    return { projectIds: new Set(), versionIdsByProjectId: new Map() };
  }
}

function filterRowForMyProjectRefs(row, refs) {
  const projectId = String(row?.projectId || row?.id || "").trim();
  if (!projectId || !refs.projectIds.has(projectId)) return null;
  const children = Array.isArray(row?.children) ? row.children : [];
  const versionIds = refs.versionIdsByProjectId.get(projectId);
  if (!children.length || !versionIds?.size) return row;
  const matchedChildren = children.filter((child) => versionIds.has(String(child?.versionId || "").trim()) || versionIds.has(String(child?.id || "").replace(/^.*::version-/, "")));
  return matchedChildren.length ? { ...row, children: matchedChildren } : row;
}

async function loadMembersForProjectVersions(project, parentMembersFallback = []) {
	const pid = String(project?.id || "");
	const membersByProjectId = new Map([[pid, parentMembersFallback]]);
	const memberIds = new Set(parentMembersFallback.map(memberUserId).filter(Boolean));
	const versions = projectVersions(project);
	const versionMembers = await mapConcurrent(versions, REBUILD_CONCURRENCY, async (version) => {
		const rowId = versionRowId(pid, version.id);
		try {
			return { rowId, members: membersFromResponse(await soyooClient.projectMembers(rowId)) };
		} catch {
			return { rowId, members: String(version.code || "").toLowerCase() === "v1" || version.is_default ? parentMembersFallback : [] };
		}
	});
	for (const item of versionMembers) {
		const members = item.members || [];
		membersByProjectId.set(item.rowId, members);
		for (const member of members) {
			const userId = memberUserId(member);
			if (userId) memberIds.add(userId);
		}
	}
	return { membersByProjectId, memberIds: [...memberIds] };
}

async function mapConcurrent(items, limit, mapper) {
	const results = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		for (;;) {
			const index = next;
			next += 1;
			if (index >= items.length) return;
			results[index] = await mapper(items[index], index);
		}
	});
	await Promise.all(workers);
	return results;
}

async function writeProjectPoolSnapshot(row, memberIds, { invalidateCache = true } = {}) {
  await ensureProjectPoolSnapshotTable();
  const now = nowIso();
  const version = BigInt(Date.now());
  await prisma.$executeRaw`
    INSERT INTO ops_project_pool_snapshot
      (project_id, row_json, status, stage, tenant_name, planner_name, member_ids_json, updated_at, version)
    VALUES
      (${String(row.id)}, ${JSON.stringify(row)}, ${row.status || ""}, ${row.stage || ""}, ${row.tenantName || ""}, ${row.plannerName || ""}, ${JSON.stringify(memberIds)}, ${now}, ${version})
    ON DUPLICATE KEY UPDATE
      row_json = VALUES(row_json),
      status = VALUES(status),
      stage = VALUES(stage),
      tenant_name = VALUES(tenant_name),
      planner_name = VALUES(planner_name),
      member_ids_json = VALUES(member_ids_json),
      updated_at = VALUES(updated_at),
      version = VALUES(version)
  `;
  if (invalidateCache) await invalidateProjectPoolSnapshotRowsCache("project_snapshot_changed");
}

export async function refreshProjectPoolSnapshot(projectId) {
  await ensureProjectPoolSnapshotTable();
  const pid = String(soyooProjectId(projectId) || "");
  if (!pid) return null;
  let project;
  let members = [];
  let membersLoaded = false;
  try {
    const [projectResult, memberResult] = await Promise.allSettled([soyooClient.project(pid), getProjectWithMembers(pid)]);
    if (projectResult.status === "fulfilled") project = projectResult.value;
    if (memberResult.status === "fulfilled") {
      project ||= memberResult.value?.project;
      members = Array.isArray(memberResult.value?.members) ? memberResult.value.members : [];
      membersLoaded = true;
    }
  } catch {
    project = null;
  }
  if (!project?.id) {
    await deleteProjectPoolSnapshot(pid, "project_snapshot_deleted");
    return null;
  }
  if (isProjectLifecycleHidden(project)) {
    await deleteProjectPoolSnapshot(pid, "project_snapshot_recycled");
    return null;
  }
  const { membersByProjectId, memberIds: loadedMemberIds } = await loadMembersForProjectVersions(project, members);
  const [row] = await buildProjectPoolRows([normalizeProjectForPoolRow(project, members)], membersByProjectId);
  const memberIds = membersLoaded ? loadedMemberIds : await existingSnapshotMemberIds(pid);
  await writeProjectPoolSnapshot(row, memberIds);
  return row;
}

export async function refreshProjectPoolSnapshotsByMember(userId) {
  await ensureProjectPoolSnapshotTable();
  const uid = String(userId || "").replace(/^ops-user-/, "");
  if (!uid) return 0;
  const dbRows = await prisma.$queryRaw`SELECT project_id, member_ids_json FROM ops_project_pool_snapshot`;
  let count = 0;
  for (const row of dbRows) {
    const memberIds = snapshotMemberIds(row).map((id) => String(id).replace(/^ops-user-/, ""));
    if (!memberIds.includes(uid)) continue;
    const refreshed = await refreshProjectPoolSnapshot(row.project_id);
    if (refreshed) count += 1;
  }
  return count;
}

async function fetchAllSoyooProjectsForSnapshot() {
  const out = [];
  for (let page = 1; page <= 100; page += 1) {
    const r = await soyooClient.projectsList({ page, limit: 100, exclude: "已完成,已回收,客户暂停" });
    const projects = Array.isArray(r?.data) ? r.data : [];
    out.push(...projects);
    const total = Number(r?.total ?? out.length);
    if (!projects.length || out.length >= total) break;
  }
  return out;
}

let rebuildSnapshotsRunning = null;
export async function rebuildProjectPoolSnapshots() {
	if (rebuildSnapshotsRunning) return rebuildSnapshotsRunning;
	rebuildSnapshotsRunning = (async () => {
		await ensureProjectPoolSnapshotTable();
		const projects = await fetchAllSoyooProjectsForSnapshot();
		const projectMemberSnapshots = await mapConcurrent(projects, REBUILD_CONCURRENCY, async (project) => {
			let members = [];
			let membersLoaded = false;
			try {
				members = (await getProjectWithMembers(project.id)).members || [];
				membersLoaded = true;
			} catch {
				members = [];
			}
			const loaded = await loadMembersForProjectVersions(project, members);
			return {
				projectId: String(project.id),
				membersByProjectId: loaded.membersByProjectId,
				memberIds: membersLoaded ? loaded.memberIds : await existingSnapshotMemberIds(project.id),
			};
		});
		const membersByProjectId = new Map();
		const memberIdsByProjectId = new Map();
		for (const snapshot of projectMemberSnapshots) {
			for (const [key, value] of snapshot.membersByProjectId.entries()) membersByProjectId.set(key, value);
			memberIdsByProjectId.set(snapshot.projectId, snapshot.memberIds);
		}
		const rows = await buildProjectPoolRows(projects, membersByProjectId);
    for (const row of rows) {
      await writeProjectPoolSnapshot(row, memberIdsByProjectId.get(String(row.id)) || [], { invalidateCache: false });
    }
    const ids = projects.map((p) => String(p.id));
    if (ids.length) {
      await prisma.$executeRawUnsafe(`DELETE FROM ops_project_pool_snapshot WHERE project_id NOT IN (${ids.map(() => "?").join(",")})`, ...ids);
    } else {
      await prisma.$executeRaw`DELETE FROM ops_project_pool_snapshot`;
    }
    const dbRows = await prisma.$queryRaw`SELECT project_id, row_json, member_ids_json FROM ops_project_pool_snapshot`;
    await writeProjectPoolSnapshotRowsCache(dbRows);
    return projects.length;
  })();
  try {
    return await rebuildSnapshotsRunning;
  } finally {
    rebuildSnapshotsRunning = null;
  }
}

export async function projectPoolSnapshotStats() {
  await ensureProjectPoolSnapshotTable();
  const [totalRows, statusRows, emptyMemberRows] = await Promise.all([
    prisma.$queryRaw`SELECT COUNT(*) AS count FROM ops_project_pool_snapshot`,
    prisma.$queryRaw`SELECT status, COUNT(*) AS count FROM ops_project_pool_snapshot GROUP BY status ORDER BY count DESC`,
    prisma.$queryRaw`SELECT COUNT(*) AS count FROM ops_project_pool_snapshot WHERE member_ids_json IS NULL OR member_ids_json = '[]'`,
  ]);
  return {
    count: Number(totalRows?.[0]?.count ?? 0),
    emptyMemberCount: Number(emptyMemberRows?.[0]?.count ?? 0),
    statuses: statusRows.map((row) => ({ status: row.status, count: Number(row.count ?? 0) })),
  };
}

export async function lookupProjectPoolStages(projectIds = []) {
  await ensureProjectPoolSnapshotTable();
  const ids = [...new Set((projectIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return {};
  const parentIds = [...new Set(ids.map((id) => soyooProjectId(id)).filter(Boolean))];
  const rows = await prisma.$queryRawUnsafe(
    `SELECT project_id, row_json, stage FROM ops_project_pool_snapshot WHERE project_id IN (${parentIds.map(() => "?").join(",")})`,
    ...parentIds,
  );
  const out = {};
  for (const row of rows) {
    const snapshot = snapshotDbRowToPoolRow(row) || {};
    const parentId = String(row.project_id);
    out[parentId] = {
      stage: String(snapshot.stage || row.stage || "").trim(),
      stageDeadlines: Array.isArray(snapshot.stageDeadlines) ? snapshot.stageDeadlines : [],
    };
    for (const child of Array.isArray(snapshot.children) ? snapshot.children : []) {
      out[String(child.id)] = {
        stage: String(child.stage || "").trim(),
        stageDeadlines: Array.isArray(child.stageDeadlines) ? child.stageDeadlines : [],
      };
    }
  }
  return out;
}

async function readProjectPoolSnapshotDbRows(statusNames = []) {
  await ensureProjectPoolSnapshotTable();
  const statuses = [...new Set((statusNames || []).map((name) => String(name || "").trim()).filter(Boolean))];
  const cachedRows = await readProjectPoolSnapshotRowsCache([]);
  if (cachedRows) return cachedRows;

  const rows = await prisma.$queryRaw`SELECT project_id, row_json, member_ids_json FROM ops_project_pool_snapshot`;
  if (!rows.length) {
    await rebuildProjectPoolSnapshots();
    const rebuiltRows = await prisma.$queryRaw`SELECT project_id, row_json, member_ids_json FROM ops_project_pool_snapshot`;
    await writeProjectPoolSnapshotRowsCache(rebuiltRows, []);
    return rebuiltRows;
  }
  await writeProjectPoolSnapshotRowsCache(rows, []);
  return rows;
}

function isExcludedTenantName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return normalized && EXCLUDED_CLIENT_NAMES.includes(normalized);
}

export async function loadVisibleSnapshotRows({ user, statusNames = [] }) {
  const dbRows = await readProjectPoolSnapshotDbRows(statusNames);
  const uid = meId(user);
  const rows = [];
  for (const dbRow of dbRows) {
    const row = snapshotDbRowToPoolRow(dbRow);
    if (!row || isExcludedTenantName(row.tenantName)) continue;
    if (!isProjectLifecycleActive(row) && !rowMatchesAnyStatus(row, statusNames)) continue;
    if (!isAdmin(user)) {
      if (!snapshotMemberIds(dbRow).map(soyooId).includes(uid)) continue;
      const scopedRow = filterRowForMember(row, uid);
      if (scopedRow) rows.push(scopedRow);
      continue;
    }
    rows.push(row);
  }
  return rows;
}

export async function loadMySnapshotRows({ user, statusNames = [] }) {
  const dbRows = await readProjectPoolSnapshotDbRows(statusNames);
  const uid = meId(user);
  const rows = [];
  const fallbackRows = [];
  for (const dbRow of dbRows) {
    const row = snapshotDbRowToPoolRow(dbRow);
    if (!row || isExcludedTenantName(row.tenantName)) continue;
    if (!isProjectLifecycleActive(row) && !rowMatchesAnyStatus(row, statusNames)) continue;
    fallbackRows.push(row);
    const scopedRow = filterRowForMember(row, uid);
    if (scopedRow) rows.push(scopedRow);
  }
  if (rows.length) return rows;
  const refs = await loadMyProjectRefs(user);
  if (!refs.projectIds.size) return [];
  return fallbackRows.map((row) => filterRowForMyProjectRefs(row, refs)).filter(Boolean);
}
