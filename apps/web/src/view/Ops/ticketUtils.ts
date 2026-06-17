// 需求提单 —— 工单时间/状态相关的纯函数(从 OpsTicketsPage 拆出,便于复用与测试)
import type { OpsTicket } from "../../api/modules/ops";
import { fmtDuration } from "../../utils/format";

// 剩余小时 = 该工单交付时长 − 已过时间(交付时长建单时从环节「默认交付时间」快照)
export function remainingHours(t: OpsTicket): number | null {
  const created = new Date(t.createdAt).getTime();
  if (!created || !t.dueInHours) return null;
  return Math.round(t.dueInHours - (Date.now() - created) / 3.6e6);
}

// 剩余/超期文案 + 颜色:超期=红,临期(剩余 < 阈值)=橙,正常=默认
export function remainingView(t: OpsTicket): { text: string; color?: string } {
  const r = remainingHours(t);
  if (r === null) return { text: "-" };
  if (r < 0) return { text: `超期 ${fmtDuration(-r)}`, color: "#cf1322" };
  if (t.status !== "已完成" && r < (t.riskWarningHours ?? 8)) return { text: `剩 ${fmtDuration(r)}`, color: "#fa8c16" };
  return { text: `剩 ${fmtDuration(r)}` };
}

// 是否进延期预警:未完成且剩余 < 阈值
export function isWarning(t: OpsTicket): boolean {
  if (t.status === "已完成") return false;
  const r = remainingHours(t);
  return r !== null && r < (t.riskWarningHours ?? 8);
}
