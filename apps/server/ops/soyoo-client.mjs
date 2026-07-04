// 调 soyoo /integration 分组:ops 提单实时查 项目/用户/客户/标签 + 拉变更(outbox)。
// 同机内网调用,无鉴权(同 soyoo /ops)。提单"显示"不走这里(读工单快照),只在"选择/建单/刷快照"时用。
import { opsIntegration } from "../config/runtime.mjs";

const BASE = String(process.env.COMPANYPLAN_SOYOO_BASE_URL || opsIntegration?.baseUrl || "").replace(/\/+$/, "");
const TIMEOUT = Number(opsIntegration?.timeoutMs ?? 12000);
const CACHE_MS = Number(process.env.COMPANYPLAN_SOYOO_CACHE_MS ?? "30000");

// ops 历史 id 形如 ops-user-123 / ops-project-123;调 soyoo 一律用纯 id
export function soyooId(id) {
  return String(id ?? "").replace(/^ops-(user|project|tenant|tag)-/, "");
}

async function callRaw(path, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const init = { headers: { Accept: "application/json" }, signal: controller.signal };
    if (opts.method) init.method = opts.method;
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(`${BASE}${path}`, init);
    if (!res.ok) {
      const body = await res.json().catch(() => ({})); // soyoo 错误体形如 {"error":"项目不存在"}
      const err = new Error(body?.error || `soyoo ${path} -> ${res.status}`);
      err.status = res.status; // soyoo 的状态码(如 404)
      err.soyooError = typeof body?.error === "string" ? body.error : ""; // soyoo 的原始错误文案,供透传
      throw err;
    }
    return await res.json().catch(() => ({}));
  } catch (e) {
    // 集中记录所有 soyoo 调用失败的真实原因(超时/网络/非2xx);下游 catch 会吞成"无法连接 soyoo",这里先打日志
    console.error(`[soyoo] 调用失败 ${path}:`, e?.name === "AbortError" ? `超时 ${TIMEOUT}ms` : e?.message || e);
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
    const body = await callRaw(`${path}${sep}page=${page}&limit=100`);
    const data = Array.isArray(body?.data) ? body.data : [];
    all.push(...data);
    const total = Number(body?.total ?? all.length);
    if (data.length === 0 || all.length >= total) break;
  }
  return all;
}

// 客户/标签这类小而稳的列表做短缓存,减少重复请求
const cache = new Map();
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  const v = await fn();
  cache.set(key, { v, t: Date.now() });
  return v;
}

export const soyooClient = {
  myProjects: (userId) => call(`/integration/users/${encodeURIComponent(soyooId(userId))}/projects`),
  allProjects: () => cached("ops-all-projects", () => callAllPages(`/integration/projects?exclude=${encodeURIComponent("回收中")}`)), // 管理员建单:全部非回收项目(短缓存)
  projectMembers: (projectId) => call(`/integration/projects/${encodeURIComponent(soyooId(projectId))}/members`),
  project: (projectId) => call(`/integration/projects/${encodeURIComponent(soyooId(projectId))}`),
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
    if (opts.exclude) q.set("exclude", String(opts.exclude)); // 排除的状态(逗号分隔),如 回收中,未启动
    if (Array.isArray(opts.excludeTenants) && opts.excludeTenants.length) q.set("exclude_tenants", opts.excludeTenants.join(",")); // 排除的客户名(逗号分隔)
    if (opts.memberUserId) q.set("member_user_id", String(opts.memberUserId));
    if (Array.isArray(opts.projectIds) && opts.projectIds.length) q.set("ids", opts.projectIds.join(","));
    return callRaw(`/integration/projects?${q.toString()}`);
  },
  setProjectStatus: (projectId, status) => callRaw(`/integration/projects/${encodeURIComponent(soyooId(projectId))}/status`, { method: "POST", body: { status } }),
  setProjectStageDeadlines: (projectId, body) => callRaw(`/integration/projects/${encodeURIComponent(soyooId(projectId))}/stage-deadlines`, { method: "POST", body }),
  staleProjects: (body) => callRaw(`/integration/stale-projects`, { method: "POST", body }),
};
