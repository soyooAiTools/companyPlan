// 通知 service:通知的写 / 查 / 已读 + 事件配置 + 文案构造。业务都在这一层。
// 对外触发只走 emit();路由只调查询/已读/配置方法;埋点与扫描只调 emit()。
import { prisma } from "../prisma.mjs";
import { nowIso } from "../ops-helpers.mjs";
import { pushToUser } from "../ops-notify-sse.mjs";

// ===== 写 =====

// 幂等落库:按 dedup_key 去重(已存在的跳过)。仅做"写",不推送。
export async function createNotifications(items) {
  if (!items?.length) return;
  const now = nowIso();
  await prisma.ops_notifications.createMany({
    data: items.map((i) => ({
      recipient_id: String(i.recipientId),
      event_key: i.eventKey,
      title: i.title ?? "",
      body: i.body ?? "",
      link: i.link ?? "",
      ref_type: i.refType ?? "",
      ref_id: String(i.refId ?? ""),
      dedup_key: i.dedupKey,
      created_at: now,
    })),
    skipDuplicates: true,
  });
}

// 动作型(提单/改派、改优先级、改状态)入口:先挑出"从未存在过"的,只写+推这批(每次操作 key 都不同,故每次都发)。
export async function emit(items) {
  if (!items?.length) return [];
  const keys = items.map((i) => i.dedupKey);
  const existed = new Set(
    (await prisma.ops_notifications.findMany({ where: { dedup_key: { in: keys } }, select: { dedup_key: true } })).map(
      (r) => r.dedup_key
    )
  );
  const fresh = items.filter((i) => !existed.has(i.dedupKey));
  if (!fresh.length) return [];
  await createNotifications(fresh);
  const rows = await prisma.ops_notifications.findMany({ where: { dedup_key: { in: fresh.map((i) => i.dedupKey) } } });
  for (const n of rows) pushToUser(n.recipient_id, toClient(n));
  return rows;
}

// 超时型(工单/项目超时)入口:每条超时**只建一条库 + 只计一次未读**(key 不含时刻,一条一行);
// 但**每轮扫描都重推**(realert)让桌面再弹一次催办 —— 直到超时消失(完成/不再超时)才不再扫到。
// 效果:桌面一直催,铃铛不被同一条超时刷屏。
export async function emitOverdue(items) {
  if (!items?.length) return;
  const keys = items.map((i) => i.dedupKey);
  const existedKeys = new Set(
    (await prisma.ops_notifications.findMany({ where: { dedup_key: { in: keys } }, select: { dedup_key: true } })).map(
      (r) => r.dedup_key
    )
  );
  const fresh = items.filter((i) => !existedKeys.has(i.dedupKey));
  if (fresh.length) await createNotifications(fresh);
  const rows = await prisma.ops_notifications.findMany({ where: { dedup_key: { in: keys } } });
  for (const n of rows) {
    // 已存在的 = 重复提醒(realert):前端只重弹桌面,不计未读、不进列表;新建的 = 正常新通知
    pushToUser(n.recipient_id, { ...toClient(n), realert: existedKeys.has(n.dedup_key) });
  }
}

// 工单被指派 → 通知新负责人。建单与改派共用。best-effort:启用才发、操作人指给自己不发、失败不影响主流程。
export async function notifyTicketAssigned(ticket, actorId) {
  try {
    if (!ticket?.owner_id || ticket.owner_id === String(actorId)) return; // 自己把单指给自己,不通知自己
    if (!(await isEventEnabled("ticket_assigned"))) return;
    await emit([buildTicketAssigned(ticket)]);
  } catch (e) {
    console.error("[notif] ticket_assigned 失败:", e?.message || e);
  }
}

// 优先级变更(管理员/策划改) → 通知负责人。best-effort:启用才发、操作人就是负责人则不发、失败不影响主流程。
export async function notifyPriorityChanged(ticket, fromPriority, toPriority, actorId) {
  try {
    if (!ticket?.owner_id || ticket.owner_id === String(actorId)) return;
    if (!(await isEventEnabled("ticket_priority_changed"))) return;
    await emit([buildPriorityChanged(ticket, fromPriority, toPriority)]);
  } catch (e) {
    console.error("[notif] ticket_priority_changed 失败:", e?.message || e);
  }
}

// 状态变更 → 通知负责人。best-effort:启用才发、状态没变不发、操作人就是负责人则不发、失败不影响主流程。
export async function notifyStatusChanged(ticket, fromStatus, toStatus, actorId) {
  try {
    if (!ticket?.owner_id || ticket.owner_id === String(actorId)) return;
    if (fromStatus === toStatus) return;
    if (!(await isEventEnabled("ticket_status_changed"))) return;
    await emit([buildStatusChanged(ticket, fromStatus, toStatus)]);
  } catch (e) {
    console.error("[notif] ticket_status_changed 失败:", e?.message || e);
  }
}

// 给自己发一条测试通知(验证铃铛 + 桌面弹窗 + SSE 是否通)。不受事件开关限制,dedup_key 含时刻保证每次都发。
export async function sendTest(userId) {
  await emit([
    {
      recipientId: userId,
      eventKey: "test",
      title: "测试通知",
      body: "看到这条,说明站内铃铛和桌面弹窗都正常。",
      link: "/tickets",
      refType: "test",
      refId: nowIso(),
      dedupKey: `test:${userId}:${nowIso()}`,
    },
  ]);
}

// ===== 查 / 已读 =====

export async function listForUser(userId, { status = "all", page = 1, pageSize = 10 } = {}) {
  const uid = String(userId);
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(50, Math.max(1, Number(pageSize) || 10));
  const where = status === "unread" ? { recipient_id: uid, read_at: null } : { recipient_id: uid };
  const [rows, total, unread] = await Promise.all([
    prisma.ops_notifications.findMany({ where, orderBy: { id: "desc" }, skip: (p - 1) * size, take: size }),
    prisma.ops_notifications.count({ where }), // 当前 tab 的总数(分页用)
    prisma.ops_notifications.count({ where: { recipient_id: uid, read_at: null } }), // 未读数(铃铛角标)
  ]);
  return { items: rows.map(toClient), total, unread };
}

export function markRead(userId, id) {
  return prisma.ops_notifications.updateMany({
    where: { id: Number(id), recipient_id: String(userId), read_at: null },
    data: { read_at: nowIso() },
  });
}

export function markAllRead(userId) {
  return prisma.ops_notifications.updateMany({
    where: { recipient_id: String(userId), read_at: null },
    data: { read_at: nowIso() },
  });
}

// 落库行(snake_case)→ 前端形状(camelCase);SSE 推送与列表接口共用,保证两端形状一致。
function toClient(n) {
  return {
    id: String(n.id),
    eventKey: n.event_key,
    title: n.title,
    body: n.body ?? "",
    link: n.link,
    refType: n.ref_type,
    refId: n.ref_id,
    readAt: n.read_at,
    createdAt: n.created_at,
  };
}

// ===== 事件配置 / 通用参数 =====

// ops_config 通用读写
async function getConfig(keys) {
  const rows = await prisma.ops_config.findMany({ where: { k: { in: keys } } });
  return Object.fromEntries(rows.map((c) => [c.k, c.v]));
}
async function setConfig(k, v, now) {
  await prisma.ops_config.upsert({ where: { k }, update: { v: String(v), updated_at: now }, create: { k, v: String(v), updated_at: now } });
}
// 校验 "HH:mm",非法用兜底
const validHHmm = (v, fb) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : fb);

export async function getSettings() {
  const [rows, cfg] = await Promise.all([
    prisma.ops_notification_settings.findMany(),
    getConfig(["scan_interval_min", "notify_start_time", "notify_end_time"]),
  ]);
  return {
    events: rows.map((r) => ({ eventKey: r.event_key, enabled: !!r.enabled, config: parseConfig(r.config_json) })),
    scanIntervalMin: Number(cfg.scan_interval_min ?? 15) || 15,
    notifyStart: cfg.notify_start_time || "10:00", // 通知时段开始(本地 HH:mm)
    notifyEnd: cfg.notify_end_time || "22:00", // 通知时段结束;此窗口外前端不弹桌面
  };
}

export async function saveSettings({ events = [], scanIntervalMin, notifyStart, notifyEnd } = {}) {
  const now = nowIso();
  for (const e of events) {
    if (!e?.eventKey) continue;
    await prisma.ops_notification_settings.update({
      where: { event_key: e.eventKey },
      data: { enabled: e.enabled ? 1 : 0, config_json: e.config ? JSON.stringify(e.config) : null, updated_at: now },
    });
  }
  if (scanIntervalMin != null) await setConfig("scan_interval_min", String(Math.max(10, Number(scanIntervalMin) || 15)), now);
  if (notifyStart != null) await setConfig("notify_start_time", validHHmm(notifyStart, "10:00"), now);
  if (notifyEnd != null) await setConfig("notify_end_time", validHHmm(notifyEnd, "22:00"), now);
  return getSettings();
}

// 通知时段(给所有用户 /me 下发,前端据此决定是否弹桌面)
export async function getNotifyWindow() {
  const cfg = await getConfig(["notify_start_time", "notify_end_time"]);
  return { start: cfg.notify_start_time || "10:00", end: cfg.notify_end_time || "22:00" };
}

export async function isEventEnabled(eventKey) {
  const r = await prisma.ops_notification_settings.findUnique({ where: { event_key: eventKey } });
  return !!r?.enabled;
}

export async function getProjectOverdueSegmentIds() {
  const r = await prisma.ops_notification_settings.findUnique({ where: { event_key: "project_overdue" } });
  return parseConfig(r?.config_json).recipientSegmentIds ?? [];
}

export async function getScanIntervalMin() {
  const r = await prisma.ops_config.findUnique({ where: { k: "scan_interval_min" } });
  return Number(r?.v ?? 15) || 15;
}

function parseConfig(json) {
  if (!json) return {};
  try {
    return JSON.parse(json) || {};
  } catch {
    return {};
  }
}

// ===== 文案构造器(集中放;link 为深链,见设计 §8)=====

export const buildTicketAssigned = (t) => ({
  recipientId: t.owner_id,
  eventKey: "ticket_assigned",
  title: "新工单指派给你",
  body: `${t.requester_name || "有人"}给你提了「${t.title}」`,
  link: `/tickets?ticket=${t.id}`,
  refType: "ticket",
  refId: t.id,
  // 指派是动作型:key 含本次时刻,保证每次建单/改派都通知(不会被旧记录去重挡掉)
  dedupKey: `ticket_assigned:${t.id}:${t.owner_id}:${t.updated_at}`,
});

export const buildTicketOverdue = (kind, t) => ({
  recipientId: t.owner_id,
  eventKey: kind === "warn" ? "ticket_overdue_warn" : "ticket_overdue_deliver",
  title: kind === "warn" ? "工单已逾期" : "工单已过交付",
  body: `「${t.title}」${kind === "warn" ? "已过预警时间" : "已过交付时间"}`,
  link: `/tickets?ticket=${t.id}`,
  refType: "ticket",
  refId: t.id,
  dedupKey: `ticket_overdue_${kind === "warn" ? "warn" : "deliver"}:${t.id}`,
});

export const buildProjectOverdue = (project, kind, recipientId) => ({
  recipientId,
  eventKey: "project_overdue",
  title: "项目超时",
  body: `项目「${project.name}」${kind === "stage" ? "阶段" : "状态"}停留超时`,
  link: `/projects?project=${project.id}`,
  refType: "project",
  refId: project.id,
  dedupKey: `project_overdue:${project.id}:${recipientId}:${kind}`,
});

// 优先级是「动作型」事件:每次变更都要通知,故 dedup_key 含本次变更时刻(updated_at)保证唯一。
export const buildPriorityChanged = (t, fromPriority, toPriority) => ({
  recipientId: t.owner_id,
  eventKey: "ticket_priority_changed",
  title: "工单优先级变更",
  body: `「${t.title}」优先级 ${fromPriority} → ${toPriority}`,
  link: `/tickets?ticket=${t.id}`,
  refType: "ticket",
  refId: t.id,
  dedupKey: `ticket_priority_changed:${t.id}:${t.updated_at}`,
});

export const buildStatusChanged = (t, fromStatus, toStatus) => ({
  recipientId: t.owner_id,
  eventKey: "ticket_status_changed",
  title: "工单状态变更",
  body: `「${t.title}」状态 ${fromStatus} → ${toStatus}`,
  link: `/tickets?ticket=${t.id}`,
  refType: "ticket",
  refId: t.id,
  dedupKey: `ticket_status_changed:${t.id}:${t.updated_at}`, // 动作型,含变更时刻保证每次都发
});
