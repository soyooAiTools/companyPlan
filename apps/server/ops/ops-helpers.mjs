// ops 公用小工具:鉴权/身份/时间/截断。多个路由文件(ops-routes / project-pool-routes)共用。
import dayjs from "dayjs";
import { soyooId } from "./soyoo-client.mjs";
import { getUser } from "./ops-realtime.mjs";
import { prisma } from "./prisma.mjs";

export const isAdmin = (user) => user?.roleKey === "admin";
// 当前用户的纯 soyoo id(req.user.id 形如 ops-user-123,统一成纯 id;与工单/项目里存的 id 对齐)
export const meId = (user) => soyooId(user?.id);
export const nowIso = () => dayjs().toISOString();
export const clip = (v, n) => (v == null ? "" : String(v)).slice(0, n);

// soyoo 调用失败 → 统一响应:soyoo 有原始错误(如 404「项目不存在」)就透传给前端,否则当连接失败。
export function soyooErrorResponse(res, e) {
  if (e?.soyooError) return res.status(e.status || 502).json({ error: e.soyooError });
  if (e?.soyooPath) {
    const status = e.status ? ` -> ${e.status}` : "";
    const detail = e.soyooBody ? `：${e.soyooBody}` : "";
    return res.status(502).json({ error: `soyoo 调用失败：${e.soyooPath}${status}${detail}` });
  }
  return res.status(e?.status || 502).json({ error: clip(e?.message, 300) || "操作失败" });
}

// 是否「策划」= soyoo 用户带「制片」标签(项目池菜单可见/访问;实时查 soyoo,失败降级 false)
const plannerCache = new Map();

function tagName(tag) {
  if (typeof tag === "string") return tag;
  return String(tag?.name || tag?.Name || "").trim();
}

async function isPlannerFromSnapshot(user) {
  const names = [user?.name, user?.username].map((value) => String(value || "").trim()).filter(Boolean);
  if (!names.length) return false;
  const row = await prisma.ops_project_pool_snapshot
    .findFirst({
      where: {
        OR: names.map((name) => ({ planner_name: name })),
      },
      select: { project_id: true },
    })
    .catch(() => null);
  return !!row;
}

export async function isPlanner(user) {
  if (!user) return false;
  const uid = meId(user);
  const hit = plannerCache.get(uid);
  if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.v;
  try {
    const su = await getUser(uid);
    const v = !!su && (su.tags || []).map(tagName).includes("制片");
    plannerCache.set(uid, { v, t: Date.now() });
    return v;
  } catch {
    const v = await isPlannerFromSnapshot(user);
    plannerCache.set(uid, { v, t: Date.now() });
    return v;
  }
}
