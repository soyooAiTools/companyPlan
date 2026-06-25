// 通知传输层(SSE):进程内内存连接表(单实例)。userId -> Set<res>。
// 只负责"把已生成的通知推给在线用户",不碰业务/DB —— service 调 pushToUser,路由调 addConnection。
const conns = new Map();

// 注册一条 SSE 长连接;连接关闭时自动从表里摘除。
export function addConnection(userId, res) {
  const key = String(userId);
  let set = conns.get(key);
  if (!set) {
    set = new Set();
    conns.set(key, set);
  }
  set.add(res);
  res.on("close", () => {
    const s = conns.get(key);
    if (s) {
      s.delete(res);
      if (!s.size) conns.delete(key);
    }
  });
}

// 把一条 payload 推给某用户的所有在线连接(不在线则静默丢弃,靠铃铛补看)。
export function pushToUser(userId, payload) {
  const set = conns.get(String(userId));
  if (!set || !set.size) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(line);
    } catch {
      /* 写失败说明已断开,由 close 事件清理 */
    }
  }
}

// 心跳:每 25s 给所有连接发注释行,防代理/防火墙掐断空闲长连接。unref 避免心跳独自吊住进程。
setInterval(() => {
  for (const set of conns.values()) {
    for (const res of set) {
      try {
        res.write(": ping\n\n");
      } catch {
        /* ignore */
      }
    }
  }
}, 25000).unref?.();
