import dayjs from "dayjs";
import type { OpsProjectPoolRow, OpsProjectStageDeadline } from "@/api/modules/ops";

export const stageDescriptionFallback: Record<string, string> = {
  interactive_alpha: String.raw`不含灯光\UI音效`,
  feature_complete: String.raw`含UI\音效`,
  final_delivery: "封包版",
};

export const stageDeadlineTemplates: OpsProjectStageDeadline[] = [
  { key: "asset_confirm", name: "资产确认", date: "" },
  { key: "scene_still", name: "场景单帧版本", date: "" },
  { key: "interactive_alpha", name: "可交互初版", description: String.raw`不含灯光\UI音效`, date: "" },
  { key: "feature_complete", name: "功能完整版", description: String.raw`含UI\音效`, date: "" },
  { key: "final_delivery", name: "最终交付版", description: "封包版", date: "" },
];

export const defaultStageIntervals = [2, 3, 7, 3];

export const fmtStageDate = (date?: string) => {
  if (!date) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[2]}-${m[3]}` : date;
};

export const deadlineRemain = (date?: string) => {
  if (!date) return null;
  const d = dayjs(date, "YYYY-MM-DD");
  if (!d.isValid()) return null;
  const diff = d.startOf("day").diff(dayjs().startOf("day"), "day");
  if (diff > 0) return { text: `剩${diff}天`, color: "#0f766e" };
  if (diff === 0) return { text: "今天", color: "#0f766e" };
  return { text: `逾${Math.abs(diff)}天`, color: "#cf1322" };
};

export const normalizeStageDeadlines = (items?: OpsProjectStageDeadline[]) => {
  const byKey = new Map((items || []).map((item) => [item.key, item]));
  return stageDeadlineTemplates.map((tpl) => {
    const old = byKey.get(tpl.key);
    return { ...tpl, date: old?.date || "" };
  });
};

const addDeadlineDays = (date: dayjs.Dayjs, days: number, skipWeekend: boolean) => {
  let cursor = date;
  let remaining = Math.max(0, Number(days) || 0);
  while (remaining > 0) {
    cursor = cursor.add(1, "day");
    if (!skipWeekend || (cursor.day() !== 0 && cursor.day() !== 6)) remaining -= 1;
  }
  return cursor;
};

export const inferStageDeadlines = (baseDate: string, intervals: number[], skipWeekend: boolean) => {
  if (!baseDate) return normalizeStageDeadlines();
  let cursor = dayjs(baseDate);
  return stageDeadlineTemplates.map((tpl, index) => {
    if (index > 0) cursor = addDeadlineDays(cursor, intervals[index - 1], skipWeekend);
    return { ...tpl, date: cursor.format("YYYY-MM-DD") };
  });
};

export const stageDeadlineName = (item: { key: string; name: string; description?: string }) => {
  const description = item.description || stageDescriptionFallback[item.key] || "";
  return description ? `${item.name || item.key}（${description}）` : item.name || item.key;
};

export const nextStageDeadline = (stage: string, items: { key: string; name: string; description?: string; date: string }[]) => {
  if (!items.length) return null;
  const currentIndex = items.findIndex((item) => item.name === stage || item.key === stage);
  if (currentIndex < 0) return items[0];
  if (currentIndex >= items.length - 1) return items[currentIndex];
  return items[currentIndex + 1];
};

export const isNextDeadlineOverdue = (row: OpsProjectPoolRow) => {
  const items = Array.isArray(row.stageDeadlines) ? row.stageDeadlines : [];
  const next = nextStageDeadline(row.stage, items);
  return !!next?.date && dayjs(next.date, "YYYY-MM-DD").isBefore(dayjs(), "day");
};

export const finalStageDeadline = (items?: { key: string; name: string; date: string }[]) => {
  if (!Array.isArray(items) || !items.length) return null;
  return items.find((item) => item.key === "final_delivery") || items[items.length - 1] || null;
};

export const fmtProjectDate = (date?: string | null) => {
  if (!date) return "—";
  const d = dayjs(date);
  return d.isValid() ? d.format("YYYY/MM/DD") : "—";
};

export const projectDurationText = (startedAt?: string | null, deadlines?: { key: string; name: string; date: string }[]) => {
  const start = dayjs(startedAt).startOf("day");
  if (!startedAt || !start.isValid()) return null;
  const final = finalStageDeadline(deadlines);
  const finalDate = final?.date ? dayjs(final.date, "YYYY-MM-DD").startOf("day") : null;
  if (!finalDate?.isValid()) return null;
  const today = dayjs().startOf("day");
  const developedDays = Math.max(0, today.diff(start, "day") + 1);
  const developedWeeks = Math.round((developedDays / 7) * 10) / 10;
  const remainingDays = finalDate.diff(today, "day");
  return {
    developedText: `已开发:${developedWeeks.toFixed(1)}周`,
    remainText: remainingDays >= 0 ? `剩余${remainingDays}天` : `逾期${Math.abs(remainingDays)}天`,
    overdue: remainingDays < 0,
  };
};
