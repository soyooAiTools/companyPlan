// 需求提单 —— 工单时间/状态相关的纯函数(从 OpsTicketsPage 拆出,便于复用与测试)
// 时间模型(两个绝对死线,交付 < 预警):
//   交付时刻 = 建单 + 交付时长(dueInHours,目标);预警时刻 = 建单 + 预警时长(riskWarningHours,最后死线,应 > 交付)
//   未到交付 → 黑「剩 X」;超过交付未超预警 → 橙「超期 X」;超过预警 → 红「超期 X」
import dayjs from "dayjs";
import type { OpsTicket } from "../../api/modules/ops";
import { fmtDuration } from "../../utils/format";

// 剩余小时 = 交付时长 − 已过时间(正=还没到交付,负=已超过交付)
export function remainingHours(t: OpsTicket): number | null {
  if (!t.createdAt || !t.dueInHours) return null;
  const created = dayjs(t.createdAt);
  if (!created.isValid()) return null;
  return Math.round(t.dueInHours - dayjs().diff(created, "hour", true)); // 已过小时用 dayjs().diff 算
}

// 剩余/超期 文案 + 颜色
export function remainingView(t: OpsTicket): { text: string; color?: string } {
  const r = remainingHours(t);
  if (r === null) return { text: "-" };
  if (r >= 0) return { text: `剩 ${fmtDuration(r)}` }; // 还没到交付时间 → 黑(正常)
  const over = -r; // 已超过交付时间多久
  const dueH = t.dueInHours ?? 0;
  const warnH = Math.max(t.riskWarningHours ?? 0, dueH); // 预警时长(最后死线),兜底 ≥ 交付
  const pastWarn = over >= warnH - dueH; // 超过交付的时长 ≥ (预警−交付)窗口 ⟺ 已过预警死线
  return { text: `超期 ${fmtDuration(over)}`, color: pastWarn ? "#cf1322" : "#fa8c16" }; // 过预警=红,仅过交付=橙
}

// 是否已超过「交付时间」(未完成且过了交付,= 橙或红)
export function isWarning(t: OpsTicket): boolean {
  if (t.status === "已完成") return false;
  const r = remainingHours(t);
  return r !== null && r < 0;
}
