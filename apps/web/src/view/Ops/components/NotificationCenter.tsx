// 通知中心:订阅站内通知 → 在「通知时段」内弹 Mac/Win 系统通知;时段外只进铃铛、不弹桌面。+ 渲染铃铛(点开居中大 Modal 列表)。
import { useEffect } from "react";
import NotificationBell from "./NotificationBell";
import { useNotifications } from "../hooks/useNotifications";
import type { OpsNotification } from "../../../api/modules/ops";

// 当前本地时间是否在通知时段 [start, end)(HH:mm);支持跨午夜(end < start)
function inNotifyWindow(start = "10:00", end = "22:00") {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = (sh || 0) * 60 + (sm || 0);
  const e = (eh || 0) * 60 + (em || 0);
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

// 桌面系统通知:时段外 / 未授权 都不弹(通知仍进铃铛)。tag+renotify:同实体每次都重新提醒。
function popSystemNotice(n: OpsNotification, start?: string, end?: string) {
  if (!inNotifyWindow(start, end)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const sys = new Notification(n.title, { body: n.body, tag: `${n.refType}:${n.refId}`, renotify: true } as NotificationOptions & { renotify?: boolean });
    sys.onclick = () => {
      window.focus();
      if (n.link) window.location.assign(n.link);
      sys.close();
    };
  } catch (e) {
    console.error("通知失败", e);
  }
}

export default function NotificationCenter({ enabled, notifyStart, notifyEnd }: { enabled: boolean; notifyStart?: string; notifyEnd?: string }) {
  // 登录后请求一次系统通知授权(只有 default 才弹授权框)
  useEffect(() => {
    if (enabled && typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
  }, [enabled]);

  const notif = useNotifications(enabled, (n) => popSystemNotice(n, notifyStart, notifyEnd));
  return <NotificationBell unread={notif.unread} bump={notif.bump} onRead={notif.markRead} onReadAll={notif.markAllRead} />;
}
