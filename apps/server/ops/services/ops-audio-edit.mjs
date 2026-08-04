import { soyooClient } from "../soyoo-client.mjs";

function mapAudioEditSession(row = {}) {
  return {
    id: String(row.id ?? ""),
    projectName: row.project_name ?? "",
    tenantName: row.tenant_name ?? "",
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

export async function listAudioEditSessions(params = {}) {
  const body = await soyooClient.audioEditSessions({
    page: params.page,
    limit: params.pageSize,
    keyword: params.q,
    status: params.status,
  });
  const rows = Array.isArray(body?.data) ? body.data.map(mapAudioEditSession) : [];
  return {
    rows,
    total: Number(body?.total ?? rows.length),
    page: Number(body?.page ?? params.page ?? 1),
    pageSize: Number(body?.limit ?? params.pageSize ?? 20),
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
