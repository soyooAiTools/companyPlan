// 站内通知 hook:维护未读数(铃铛角标)+ EventSource 接收实时推送。列表分页由 Modal 自己拉,这里只管角标 + 来新通知的信号。
import { useCallback, useEffect, useRef, useState } from "react";
import { opsApi, type OpsNotification } from "../../../api/modules/ops";
import { apiUrl } from "../../../api/request";

export function useNotifications(enabled: boolean, onIncoming?: (n: OpsNotification) => void) {
  const [unread, setUnread] = useState(0);
  const [bump, setBump] = useState(0); // 每来一条 SSE +1,供打开着的 Modal 重拉当前页
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming; // 始终用最新回调,避免进 effect 依赖导致 SSE 反复重连

  // 只刷未读数(以服务端为准)
  const refresh = useCallback(async () => {
    try {
      const r = await opsApi.notifications("unread", 1, 1);
      setUnread(r.unread);
    } catch {
      /* 忽略,下次 SSE/对账再补 */
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    setUnread((u) => Math.max(0, u - 1));
    try {
      await opsApi.notifRead(id);
    } catch {
      /* 失败下次对账纠正 */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setUnread(0);
    try {
      await opsApi.notifReadAll();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const es = new EventSource(apiUrl("/api/ops/notifications/stream"), { withCredentials: true });
    es.onmessage = (ev) => {
      let n: OpsNotification | null = null;
      try {
        n = JSON.parse(ev.data) as OpsNotification;
      } catch {
        return; // 心跳/非 JSON 行忽略
      }
      if (!n?.id) return;
      // realert = 超时的"重复提醒":只重弹桌面,不增未读、不刷新列表;新通知才计数
      if (!n.realert) {
        setUnread((u) => u + 1);
        setBump((b) => b + 1);
      }
      onIncomingRef.current?.(n); // 弹桌面系统通知(新通知 + 超时重提醒都弹)
    };
    es.onopen = () => {
      void refresh(); // 首连/重连都对账一次
    };
    return () => {
      es.close();
    };
  }, [enabled, refresh]);

  return { unread, bump, markRead, markAllRead, refresh };
}
