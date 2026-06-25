// 通知中心:订阅站内通知 → 来新消息弹「Mac/Windows 系统通知(notice)」+ 渲染铃铛(点开是居中大 Modal 列表)。
import { useEffect } from "react";
import NotificationBell from "./NotificationBell";
import { useNotifications } from "../hooks/useNotifications";
import type { OpsNotification } from "../../../api/modules/ops";

// 系统级通知(Mac 右上 / Win 右下):需①浏览器已授权 ②系统设置允许该浏览器通知 ③关掉勿扰/专注。点击聚焦并跳深链。
function popSystemNotice(n: OpsNotification) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    // renotify 让同一 tag(同工单/项目)的通知每次都重新提醒,而非静默更新;TS 的 NotificationOptions 未含该字段,故 cast。
    const sys = new Notification(n.title, { body: n.body, tag: `${n.refType}:${n.refId}`, renotify: true } as NotificationOptions & { renotify?: boolean });
    sys.onclick = () => {
      window.focus();
      if (n.link) window.location.assign(n.link);
      sys.close();
    };
  } catch(e) {
    /* 个别环境 new Notification 受限,忽略 */
    console.error("通知失败", e)
  }
}

export default function NotificationCenter({ enabled }: { enabled: boolean }) {
  // 登录后请求一次系统通知授权(只有 default 才弹授权框;已 granted/denied 不再打扰)
  useEffect(() => {
    if (enabled && typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
  }, [enabled]);

  const notif = useNotifications(enabled, popSystemNotice);
  return <NotificationBell unread={notif.unread} bump={notif.bump} onRead={notif.markRead} onReadAll={notif.markAllRead} />;
}
