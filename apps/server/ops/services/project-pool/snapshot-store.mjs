import { prisma } from "../../prisma.mjs";
import { soyooClient } from "../../soyoo-client.mjs";
import { getProjectWithMembers } from "../../ops-realtime.mjs";
import { isAdmin, meId, nowIso } from "../../ops-helpers.mjs";
import { EXCLUDED_CLIENT_NAMES } from "../../project-pool-constants.mjs";
import { buildProjectPoolRows, normalizeProjectForPoolRow } from "./read-model.mjs";
import { invalidateProjectPoolSnapshotRowsCache, readProjectPoolSnapshotRowsCache, writeProjectPoolSnapshotRowsCache } from "./cache.mjs";

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

async function existingSnapshotMemberIds(projectId) {
  await ensureProjectPoolSnapshotTable();
  const rows = await prisma.$queryRaw`SELECT member_ids_json FROM ops_project_pool_snapshot WHERE project_id = ${String(projectId)} LIMIT 1`;
  return rows.length ? snapshotMemberIds(rows[0]) : [];
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
  const pid = String(projectId || "");
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
    await prisma.$executeRaw`DELETE FROM ops_project_pool_snapshot WHERE project_id = ${pid}`;
    await invalidateProjectPoolSnapshotRowsCache("project_snapshot_deleted");
    return null;
  }
  const [row] = await buildProjectPoolRows([normalizeProjectForPoolRow(project, members)], new Map([[pid, members]]));
  const memberIds = membersLoaded ? members.map((m) => String(m.id)).filter(Boolean) : await existingSnapshotMemberIds(pid);
  await writeProjectPoolSnapshot(row, memberIds);
  return row;
}

async function fetchAllSoyooProjectsForSnapshot() {
  const out = [];
  for (let page = 1; page <= 100; page += 1) {
    const r = await soyooClient.projectsList({ page, limit: 100 });
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
    const membersByProjectId = new Map();
    const memberIdsByProjectId = new Map();
    for (const project of projects) {
      let members = [];
      let membersLoaded = false;
      try {
        members = (await getProjectWithMembers(project.id)).members || [];
        membersLoaded = true;
      } catch {
        members = [];
      }
      membersByProjectId.set(String(project.id), members);
      memberIdsByProjectId.set(String(project.id), membersLoaded ? members.map((m) => String(m.id)).filter(Boolean) : await existingSnapshotMemberIds(project.id));
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

async function readProjectPoolSnapshotDbRows(statusNames = []) {
  await ensureProjectPoolSnapshotTable();
  const statuses = [...new Set((statusNames || []).map((name) => String(name || "").trim()).filter(Boolean))];
  const cachedRows = await readProjectPoolSnapshotRowsCache(statuses);
  if (cachedRows) return cachedRows;

  const rows = statuses.length
    ? await prisma.$queryRawUnsafe(
        `SELECT project_id, row_json, member_ids_json FROM ops_project_pool_snapshot WHERE status IN (${statuses.map(() => "?").join(",")})`,
        ...statuses,
      )
    : await prisma.$queryRaw`SELECT project_id, row_json, member_ids_json FROM ops_project_pool_snapshot`;
  if (!rows.length) {
    await rebuildProjectPoolSnapshots();
    const rebuiltRows = statuses.length
      ? await prisma.$queryRawUnsafe(
          `SELECT project_id, row_json, member_ids_json FROM ops_project_pool_snapshot WHERE status IN (${statuses.map(() => "?").join(",")})`,
          ...statuses,
        )
      : await prisma.$queryRaw`SELECT project_id, row_json, member_ids_json FROM ops_project_pool_snapshot`;
    await writeProjectPoolSnapshotRowsCache(rebuiltRows, statuses);
    return rebuiltRows;
  }
  await writeProjectPoolSnapshotRowsCache(rows, statuses);
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
    if (!isAdmin(user) && !snapshotMemberIds(dbRow).map(String).includes(uid)) continue;
    rows.push(row);
  }
  return rows;
}

export async function loadMySnapshotRows({ user, statusNames = [] }) {
  const dbRows = await readProjectPoolSnapshotDbRows(statusNames);
  const uid = meId(user);
  const rows = [];
  for (const dbRow of dbRows) {
    const row = snapshotDbRowToPoolRow(dbRow);
    if (!row || isExcludedTenantName(row.tenantName)) continue;
    if (!snapshotMemberIds(dbRow).map(String).includes(uid)) continue;
    rows.push(row);
  }
  return rows;
}
