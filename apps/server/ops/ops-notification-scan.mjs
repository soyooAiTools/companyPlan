// 通知扫描:后端定时器,周期性"发现"超时工单/项目并落库 + 推送。自重排 setTimeout(间隔可后台改,下一轮生效)。
// 只产生超时类通知;ticket_assigned 由建单/指派当场触发,不在这里。
import { prisma } from "./prisma.mjs";
import { nowIso } from "./ops-helpers.mjs";
import * as notif from "./services/ops-notifications.mjs";
import { listOverdueProjectsForNotify, loadSegmentsWithTagIds } from "./services/ops-project-pool.mjs";
import { getResponsibles } from "./ops-realtime.mjs";

let running = false;

async function runOnce(logger) {
  if (running) return; // 上一轮没跑完就跳过这次
  running = true;
  try {
    const now = nowIso();
    const out = [];

    // 工单超时(排除已完成;due_at/warn_at 是 ISO 串,与项目池一致按字符串比较)
    if (await notif.isEventEnabled("ticket_overdue_deliver")) {
      const rows = await prisma.tickets.findMany({
        where: { status: { not: "已完成" }, due_at: { lt: now } },
        select: { id: true, title: true, owner_id: true },
      });
      for (const t of rows) out.push(notif.buildTicketOverdue("deliver", t));
    }
    if (await notif.isEventEnabled("ticket_overdue_warn")) {
      const rows = await prisma.tickets.findMany({
        where: { status: { not: "已完成" }, warn_at: { lt: now } },
        select: { id: true, title: true, owner_id: true },
      });
      for (const t of rows) out.push(notif.buildTicketOverdue("warn", t));
    }

    // 项目超时 → 按管理员配置的环节算收件人(该项目里这些环节的负责人)
    if (await notif.isEventEnabled("project_overdue")) {
      const segIds = await notif.getProjectOverdueSegmentIds();
      if (segIds.length) {
        const [projects, segs] = await Promise.all([listOverdueProjectsForNotify(), loadSegmentsWithTagIds(segIds)]);
        for (const p of projects) {
          let members = [];
          try {
            members = (await getResponsibles(p.id, segs)).members ?? [];
          } catch {
            continue; // 单个项目查 soyoo 失败,跳过不影响其他
          }
          for (const rid of new Set(members.map((m) => String(m.id)))) {
            out.push(notif.buildProjectOverdue(p, p.kind, rid));
          }
        }
      }
    }

    // 超时类:首次建库+计未读,之后每轮都重弹桌面催办(铃铛只一条,不刷屏)
    if (out.length) await notif.emitOverdue(out);
  } catch (e) {
    logger?.error?.(`[notif-scan] ${e?.message || e}`);
  } finally {
    running = false;
  }
}

// 自重排:每轮跑完读最新间隔再排下一轮(后台改间隔即时生效)。首轮启动 5s 后跑。unref 不让定时器独自吊住进程。
export function startNotificationScan({ logger } = {}) {
  const loop = async () => {
    await runOnce(logger);
    let min = 15;
    try {
      min = await notif.getScanIntervalMin();
    } catch {
      /* 读配置失败用默认 15min */
    }
    setTimeout(loop, Math.max(10, min) * 60 * 1000).unref?.(); // 下限 10 分钟
  };
  setTimeout(loop, 5000).unref?.();
}
