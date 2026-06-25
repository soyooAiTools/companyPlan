// 通知路由:只注册 + 调 service(分层,薄路由)。挂 /api/ops/notifications*。
import * as notif from "./services/ops-notifications.mjs";
import { addConnection } from "./ops-notify-sse.mjs";
import { meId } from "./ops-helpers.mjs";

export function registerNotificationRoutes(app, { requireAuth, requireAdmin }) {
  // 我的通知列表 + 未读数(前端初始化 / 重连对账)
  app.get("/api/ops/notifications", requireAuth, async (req, res) => {
    res.json(await notif.listForUser(meId(req.user), { status: req.query.status, page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || 10 }));
  });

  // SSE 长连接:服务器有新通知就推过来(no-transform 防代理缓冲;心跳在传输层)
  app.get("/api/ops/notifications/stream", requireAuth, (req, res) => {
    // X-Accel-Buffering: no 关键:告诉 Nginx 这条响应别缓冲,否则 SSE 推送会被 Nginx 卡住发不出去(线上必加)
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.flushHeaders?.();
    res.write(": connected\n\n");
    addConnection(meId(req.user), res);
  });

  // 标记已读 / 全部已读
  app.post("/api/ops/notifications/:id/read", requireAuth, async (req, res) => {
    await notif.markRead(meId(req.user), req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/ops/notifications/read-all", requireAuth, async (req, res) => {
    await notif.markAllRead(meId(req.user));
    res.json({ ok: true });
  });

  // 给自己发一条测试通知(验证铃铛 + 桌面弹窗 + SSE)
  app.post("/api/ops/notifications/test", requireAuth, async (req, res) => {
    await notif.sendTest(meId(req.user));
    res.json({ ok: true });
  });

  // 管理员:通知配置(事件开关 + 项目超时收件人环节 + 扫描间隔)
  app.get("/api/ops/notification-settings", requireAuth, requireAdmin, async (_req, res) => {
    res.json(await notif.getSettings());
  });
  app.put("/api/ops/notification-settings", requireAuth, requireAdmin, async (req, res) => {
    res.json(await notif.saveSettings(req.body || {}));
  });
}
