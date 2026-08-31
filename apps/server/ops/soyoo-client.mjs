// 调 soyoo /integration 分组:ops 提单实时查 项目/用户/客户/标签 + 拉变更(outbox)。
// 同机内网调用,无鉴权(同 soyoo /ops)。提单"显示"不走这里(读工单快照),只在"选择/建单/刷快照"时用。
import { opsIntegration } from "../config/runtime.mjs";
import { logger } from "../core/logger.mjs";

const BASE = String(process.env.COMPANYPLAN_SOYOO_BASE_URL || opsIntegration?.baseUrl || "").replace(/\/+$/, "");
const TIMEOUT = Number(opsIntegration?.timeoutMs ?? 12000);
const PROJECT_LIST_TIMEOUT = Number(process.env.COMPANYPLAN_OPS_PROJECT_LIST_TIMEOUT_MS ?? "60000");
const CACHE_MS = Number(process.env.COMPANYPLAN_SOYOO_CACHE_MS ?? "30000");

// ops 历史 id 形如 ops-user-123 / ops-project-123;调 soyoo 一律用纯 id
export function soyooId(id) {
  return String(id ?? "").replace(/^ops-(user|project|tenant|tag)-/, "");
}

export function parseSoyooProjectRef(id) {
  const raw = soyooId(id);
  const [projectId, versionPart] = String(raw).split("::version-");
  return { projectId, versionId: versionPart || "" };
}

export function soyooProjectId(id) {
  return parseSoyooProjectRef(id).projectId;
}

export function soyooVersionId(id) {
  return parseSoyooProjectRef(id).versionId;
}

function withVersionBody(projectId, body = {}) {
  const versionId = soyooVersionId(projectId);
  return versionId ? { ...body, version_id: Number(versionId) } : body;
}

function projectMembersPath(projectId) {
  const { projectId: pid, versionId } = parseSoyooProjectRef(projectId);
  const path = `/integration/projects/${encodeURIComponent(pid)}/members`;
  return versionId ? `${path}?version_id=${encodeURIComponent(versionId)}` : path;
}

async function callRaw(path, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? TIMEOUT);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init = { headers: { Accept: "application/json" }, signal: controller.signal };
    if (opts.method) init.method = opts.method;
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(`${BASE}${path}`, init);
    if (!res.ok) {
      const rawText = await res.text().catch(() => "");
      let body = {};
      try {
        body = rawText ? JSON.parse(rawText) : {};
      } catch {
        body = {};
      }
      const detail = body?.error || rawText.trim().slice(0, 300);
      const err = new Error(detail || `soyoo ${path} -> ${res.status}`);
      err.status = res.status; // soyoo 的状态码(如 404)
      err.soyooError = typeof body?.error === "string" ? body.error : ""; // soyoo 的原始错误文案,供透传
      err.soyooPath = path;
      err.soyooBody = rawText.trim().slice(0, 300);
      throw err;
    }
    return await res.json().catch(() => ({}));
  } catch (e) {
    if (!e.soyooPath) e.soyooPath = path;
    if (!e.soyooBody) e.soyooBody = e?.message || "";
    // 集中记录所有 soyoo 调用失败的真实原因(超时/网络/非2xx);下游 catch 会吞成"无法连接 soyoo",这里先打日志
    logger.error(e, { scope: "soyoo", path, timeoutMs, timeout: e?.name === "AbortError" });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
async function call(path) {
  const body = await callRaw(path);
  return body?.data ?? body;
}
// 分页接口(如 /integration/tenants:soyoo 默认 limit=10、最大 100)→ 逐页取全
async function callAllPages(path) {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const body = await callRaw(`${path}${sep}page=${page}&limit=100`, { timeoutMs: path.startsWith("/integration/projects") ? PROJECT_LIST_TIMEOUT : undefined });
    const data = Array.isArray(body?.data) ? body.data : [];
    all.push(...data);
    const total = Number(body?.total ?? all.length);
    if (data.length === 0 || all.length >= total) break;
  }
  return all;
}

// 客户/标签这类小而稳的列表做短缓存,减少重复请求
const cache = new Map();
const ACTIVE_PROJECT_EXCLUDE = "已完成,回收中,已回收,客户暂停";
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  const v = await fn();
  cache.set(key, { v, t: Date.now() });
  return v;
}

export const soyooClient = {
  myProjects: (userId) => call(`/integration/users/${encodeURIComponent(soyooId(userId))}/projects`),
  users: () => callAllPages(`/ops/users`),
  businessUnits: () => cached("business-units", () => call(`/ops/business-units`)),
  allProjects: () => cached("ops-all-projects", () => callAllPages(`/integration/projects?exclude=${encodeURIComponent(ACTIVE_PROJECT_EXCLUDE)}`)), // 管理员建单:只取项目级进行中项目(短缓存)
  projectMembers: (projectId) => call(projectMembersPath(projectId)),
  project: (projectId) => call(`/integration/projects/${encodeURIComponent(soyooProjectId(projectId))}`),
  user: (userId) => call(`/integration/users/${encodeURIComponent(soyooId(userId))}`),
  tenants: (opts = {}) => {
    // 前端传 keyword/page → 服务端搜索/分页(转发给 soyoo);不传 → 取全(下拉用,带缓存)
    if (opts.keyword || opts.page) {
      const q = new URLSearchParams({ page: String(opts.page ?? 1), limit: String(opts.limit ?? 100) });
      if (opts.keyword) q.set("keyword", String(opts.keyword));
      return call(`/integration/tenants?${q.toString()}`);
    }
    return cached("tenants", () => callAllPages(`/integration/tenants`));
  },
  tags: () => cached("tags", () => call(`/integration/tags`)),
  changes: (after = 0, limit = 200) => call(`/integration/changes?after=${after}&limit=${limit}`),
  // 项目池:列表(返回 {data,total,page,limit})/ 改状态 / 超时筛
  projectsList: (opts = {}) => {
    const q = new URLSearchParams({ page: String(opts.page ?? 1), limit: String(opts.limit ?? 20) });
    if (opts.keyword) q.set("keyword", String(opts.keyword));
    if (opts.status) q.set("status", String(opts.status));
    if (opts.planner) q.set("planner", String(opts.planner));
    if (opts.exclude) q.set("exclude", String(opts.exclude)); // 排除的项目级状态(逗号分隔),如 回收中,客户暂停
    if (Array.isArray(opts.excludeTenants) && opts.excludeTenants.length) q.set("exclude_tenants", opts.excludeTenants.join(",")); // 排除的客户名(逗号分隔)
    if (opts.memberUserId) q.set("member_user_id", String(opts.memberUserId));
    if (Array.isArray(opts.projectIds) && opts.projectIds.length) q.set("ids", opts.projectIds.join(","));
    return callRaw(`/integration/projects?${q.toString()}`, { timeoutMs: PROJECT_LIST_TIMEOUT });
  },
  setProjectStatus: (projectId, status, options = {}) =>
    callRaw(`/integration/projects/${encodeURIComponent(soyooProjectId(projectId))}/status`, {
      method: "POST",
      body: withVersionBody(projectId, { status, ...options }),
    }),
  setProjectStageDeadlines: (projectId, body) => callRaw(`/integration/projects/${encodeURIComponent(soyooProjectId(projectId))}/stage-deadlines`, { method: "POST", body: withVersionBody(projectId, body) }),
  setProjectMeta: (projectId, body) => callRaw(`/integration/projects/${encodeURIComponent(soyooProjectId(projectId))}/meta`, { method: "POST", body: withVersionBody(projectId, body) }),
  setProjectUrgent: (projectId, isUrgent, options = {}) =>
    callRaw(`/integration/projects/${encodeURIComponent(soyooProjectId(projectId))}/urgent`, {
      method: "POST",
      body: withVersionBody(projectId, { is_urgent: !!isUrgent, ...options }),
    }),
  transferProjectPlanner: (projectId, toUserId, options = {}) =>
    callRaw(`/integration/projects/${encodeURIComponent(soyooProjectId(projectId))}/planner/transfer`, {
      method: "POST",
      body: withVersionBody(projectId, { to_user_id: Number(soyooId(toUserId)), ...options }),
    }),
  staleProjects: (body) => callRaw(`/integration/stale-projects`, { method: "POST", body }),
  audioEditSessions: (opts = {}) => {
    const q = new URLSearchParams({ page: String(opts.page ?? 1), limit: String(opts.limit ?? 20) });
    if (opts.keyword) q.set("keyword", String(opts.keyword));
    if (opts.status) q.set("status", String(opts.status));
    if (opts.sortBy) q.set("sort_by", String(opts.sortBy));
    if (opts.sortOrder) q.set("sort_order", String(opts.sortOrder));
    return callRaw(`/integration/audio-edit/sessions?${q.toString()}`);
  },
  updateAudioEditPriority: (id, priority) =>
    callRaw(`/integration/audio-edit/sessions/${encodeURIComponent(id)}/priority`, {
      method: "PATCH",
      body: { priority },
    }),
  updateAudioEditRemark: (id, remark) =>
    callRaw(`/integration/audio-edit/sessions/${encodeURIComponent(id)}/remark`, {
      method: "PATCH",
      body: { remark },
    }),
  updateAudioEditStatus: (id, status, remark) =>
    callRaw(`/integration/audio-edit/sessions/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: { status, remark },
    }),
};
