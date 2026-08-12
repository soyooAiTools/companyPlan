// soyoo 账号密码校验:companyPlan 后端服务端转发到 soyoo POST /tools/login。
// 成功返回 { ok:true, token, user };失败返回 { ok:false, status, error }。
import { opsIntegration } from "../config/runtime.mjs";

export async function soyooLogin(
  username,
  password,
  {
    baseUrl = opsIntegration?.baseUrl,
    timeoutMs = opsIntegration?.timeoutMs ?? 10000,
    fetchImpl = globalThis.fetch,
  } = {}
) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base) return { ok: false, status: 500, error: "未配置 soyoo 地址(COMPANYPLAN_OPS_BASE_URL)" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/tools/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.error || "用户名或密码不正确" };
    }
    return { ok: true, token: data?.token, user: data?.user };
  } catch {
    return { ok: false, status: 502, error: "无法连接 soyoo 登录服务,请稍后重试" };
  } finally {
    clearTimeout(timer);
  }
}
