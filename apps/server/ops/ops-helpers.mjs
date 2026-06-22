// ops 公用小工具:鉴权/身份/时间/截断。多个路由文件(ops-routes / project-pool-routes)共用。
import dayjs from "dayjs";
import { soyooId } from "./soyoo-client.mjs";
import { getUser } from "./ops-realtime.mjs";

export const isAdmin = (user) => user?.roleKey === "admin";
// 当前用户的纯 soyoo id(req.user.id 形如 ops-user-123,统一成纯 id;与工单/项目里存的 id 对齐)
export const meId = (user) => soyooId(user?.id);
export const nowIso = () => dayjs().toISOString();
export const clip = (v, n) => (v == null ? "" : String(v)).slice(0, n);

// 是否「策划」= soyoo 用户带「制片」标签(项目池菜单可见/访问;实时查 soyoo,失败降级 false)
export async function isPlanner(user) {
  if (!user) return false;
  try {
    const su = await getUser(meId(user));
    return !!su && (su.tags || []).includes("制片");
  } catch {
    return false;
  }
}
