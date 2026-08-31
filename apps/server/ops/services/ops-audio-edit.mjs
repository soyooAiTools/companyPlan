import { soyooClient } from "../soyoo-client.mjs";
import { prisma } from "../prisma.mjs";
import { ensureProjectPoolSnapshotTable, snapshotDbRowToPoolRow } from "./project-pool/snapshot-store.mjs";

const inactiveProjectStatuses = new Set(["回收中", "已回收", "已完成", "结算完成", "客户暂停"]);
const AUDIO_EDIT_FETCH_LIMIT = 200;

function mapAudioEditSession(row = {}) {
  return {
    id: String(row.id ?? ""),
    projectName: row.project_name ?? "",
    tenantName: row.tenant_name ?? "",
    projectVersionId: row.project_version_id ? String(row.project_version_id) : "",
    projectVersionCode: row.project_version_code ?? "v1",
    projectVersionName: row.project_version_name ?? "",
    isDefaultVersion: row.is_default_version !== false,
    hasProjectVersions: row.has_project_versions === true,
    uploader: row.last_uploader ?? "",
    uploadedAt: row.last_upload_at ?? null,
    priority: row.priority ?? null,
    debugUrl: row.debug_url ?? "",
    audioCount: Number(row.audio_count ?? 0),
    replacedCount: Number(row.replaced_count ?? 0),
    status: row.status ?? "",
    completedAt: row.completed_at ?? null,
    exportZipUrl: row.export_zip_url ?? "",
    plannerName: row.planner_name ?? "",
    plannerAvatar: row.planner_avatar ?? "",
    planners: Array.isArray(row.planners) ? row.planners.map((p) => ({ name: p?.name ?? "", avatar: p?.avatar ?? "" })) : [],
    systemRemark: row.system_remark ?? "",
  };
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function audioProjectKey(row) {
  const tenantName = row.tenantName ?? row.tenant_name;
  const projectName = row.projectName ?? row.project_name ?? row.name;
  return `${normalizeKey(tenantName)}\n${normalizeKey(projectName)}`;
}

function isInactiveProjectRow(row) {
  return [row?.status, row?.projectLifecycleStatus, row?.project_lifecycle_status, row?.lifecycle_status]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .some((value) => inactiveProjectStatuses.has(value));
}

function audioSessionMatchesProjectRow(session, row) {
  if (!row) return false;
  const versionId = String(session.projectVersionId || "").trim();
  const versionCode = String(session.projectVersionCode || "").trim();
  if (versionId && String(row.versionId || "").trim() === versionId) return true;
  if (versionCode && String(row.versionCode || "").trim() === versionCode) return true;
  return !versionId && !versionCode && !row.isVersionRow;
}

function matchedAudioProjectRow(session, projectIndex) {
  const rows = projectIndex.get(audioProjectKey(session));
  if (!rows?.length) return null;
  return rows.find((row) => audioSessionMatchesProjectRow(session, row)) || rows[0] || null;
}

function withAudioProjectStatus(session, projectIndex) {
  const row = matchedAudioProjectRow(session, projectIndex);
  return {
    ...session,
    projectStatus: row?.status || "",
    projectLifecycleStatus: row?.projectLifecycleStatus || row?.project_lifecycle_status || row?.lifecycle_status || "",
  };
}

function matchesProjectStatus(session, projectStatus) {
  const statuses = new Set(
    String(projectStatus || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!statuses.size) return true;
  return [session.projectStatus, session.projectLifecycleStatus].map((value) => String(value || "").trim()).some((value) => statuses.has(value));
}

async function loadAudioEditProjectIndex() {
  await ensureProjectPoolSnapshotTable();
  const dbRows = await prisma.$queryRaw`SELECT row_json FROM ops_project_pool_snapshot`;
  const index = new Map();
  for (const dbRow of dbRows) {
    const parent = snapshotDbRowToPoolRow(dbRow);
    if (!parent) continue;
    const key = audioProjectKey(parent);
    if (!key.trim()) continue;
    const rows = [parent, ...(Array.isArray(parent.children) ? parent.children.map((child) => ({ ...child, projectLifecycleStatus: child.projectLifecycleStatus || parent.projectLifecycleStatus })) : [])];
    index.set(key, rows);
  }
  return index;
}

function audioSessionProjectInactive(session, projectIndex) {
  return isInactiveProjectRow(matchedAudioProjectRow(session, projectIndex));
}

async function fetchAudioEditSessionsPage(params = {}) {
  const body = await soyooClient.audioEditSessions({
    page: params.page,
    limit: params.pageSize,
    keyword: params.q,
    status: params.status,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
  const rows = Array.isArray(body?.data) ? body.data.map(mapAudioEditSession) : [];
  return {
    rows,
    total: Number(body?.total ?? rows.length),
    page: Number(body?.page ?? params.page ?? 1),
    pageSize: Number(body?.limit ?? params.pageSize ?? 20),
  };
}

async function fetchAllAudioEditSessions(params = {}) {
  const allRows = [];
  let total = 0;
  for (let page = 1; page <= 100; page += 1) {
    const result = await fetchAudioEditSessionsPage({ ...params, page, pageSize: AUDIO_EDIT_FETCH_LIMIT });
    allRows.push(...result.rows);
    total = Number(result.total || allRows.length);
    if (!result.rows.length || allRows.length >= total) break;
  }
  return allRows;
}

export async function listAudioEditSessions(params = {}) {
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = Math.max(1, Number(params.pageSize ?? 20) || 20);
  const projectStatus = String(params.projectStatus || "").trim();
  if (String(params.status || "").trim() !== "待替换" && !projectStatus) {
    const [result, projectIndex] = await Promise.all([fetchAudioEditSessionsPage({ ...params, page, pageSize }), loadAudioEditProjectIndex()]);
    return { ...result, rows: result.rows.map((row) => withAudioProjectStatus(row, projectIndex)) };
  }

  const [rows, projectIndex] = await Promise.all([fetchAllAudioEditSessions(params), loadAudioEditProjectIndex()]);
  const mappedRows = rows.map((row) => withAudioProjectStatus(row, projectIndex));
  const filteredRows = mappedRows.filter((row) => (String(params.status || "").trim() === "待替换" ? !audioSessionProjectInactive(row, projectIndex) : true)).filter((row) => matchesProjectStatus(row, projectStatus));
  return {
    rows: filteredRows.slice((page - 1) * pageSize, page * pageSize),
    total: filteredRows.length,
    page,
    pageSize,
  };
}

export async function updateAudioEditPriority(id, priority) {
  const value = priority === null || priority === "" || priority === undefined ? null : Number(priority);
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    const err = new Error("优先级必须为空或大于等于 0 的数字");
    err.status = 400;
    throw err;
  }
  const body = await soyooClient.updateAudioEditPriority(id, value);
  return { session: mapAudioEditSession(body?.data) };
}

export async function updateAudioEditRemark(id, remark) {
  const value = remark == null ? "" : String(remark);
  const body = await soyooClient.updateAudioEditRemark(id, value);
  return { session: mapAudioEditSession(body?.data) };
}

export async function updateAudioEditStatus(id, status, remark) {
  const nextStatus = status == null ? "" : String(status).trim();
  const note = remark == null ? "" : String(remark).trim();
  if (nextStatus !== "已完成") {
    const err = new Error("待替换只能修改为已完成");
    err.status = 400;
    throw err;
  }
  if (!note) {
    const err = new Error("修改状态需要填写备注");
    err.status = 400;
    throw err;
  }
  if ([...note].length > 300) {
    const err = new Error("备注不能超过 300 个字符");
    err.status = 400;
    throw err;
  }
  const body = await soyooClient.updateAudioEditStatus(id, nextStatus, note);
  return { session: mapAudioEditSession(body?.data) };
}
