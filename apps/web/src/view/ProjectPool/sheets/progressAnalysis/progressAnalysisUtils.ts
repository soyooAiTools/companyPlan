import dayjs from "dayjs";
import type { OpsProjectPoolRow, OpsProjectStatusLog } from "@/api/modules/ops";

const FLOW_STATUS_COLOR: Record<string, string> = {
	推进中: "#2563eb",
	未启动: "#b45309",
	已完成: "#0284c7",
	已反馈: "#b7791f",
	待反馈: "#0f766e",
	打包中: "#1d4ed8",
	回收中: "#dc2626",
	结算完成: "#15803d",
	客户暂停: "#7c3aed",
};

export type ProgressFlowEvent = {
	id: string;
	kind: "status" | "stage";
	label: string;
	color: string;
	textColor: string;
	fromStatus: string;
	toStatus: string;
	actorName: string;
	createdAt: string;
	durationToNext?: string;
	delayText?: string;
};

export type ProgressFlowRow = {
	id: string;
	row: OpsProjectPoolRow;
	parentName?: string;
	parentId?: string;
	childIndex?: number;
	childCount?: number;
	isParent?: boolean;
	statusEvents: ProgressFlowEvent[];
	stageEvents: ProgressFlowEvent[];
};

const HOUR = 60 * 60 * 1000;
const WORK_START_HOUR = 10;
const WORK_END_HOUR = 19;

function parseTime(value?: string | null) {
	const time = value ? dayjs(value).valueOf() : NaN;
	return Number.isFinite(time) ? time : null;
}

function formatDateTime(time: number) {
	return dayjs(time).format("MM/DD HH:mm");
}

function workDurationMs(start: number, end: number) {
	if (end <= start) return 0;
	let total = 0;
	let day = dayjs(start).startOf("day");
	const endDay = dayjs(end).startOf("day");
	while (day.valueOf() <= endDay.valueOf()) {
		if (day.day() !== 0) {
			const workStart = day.hour(WORK_START_HOUR).minute(0).second(0).millisecond(0).valueOf();
			const workEnd = day.hour(WORK_END_HOUR).minute(0).second(0).millisecond(0).valueOf();
			const from = Math.max(start, workStart);
			const to = Math.min(end, workEnd);
			if (to > from) total += to - from;
		}
		day = day.add(1, "day");
	}
	return total;
}

function durationText(start: number, end: number, filterRestTime: boolean) {
	const duration = filterRestTime ? workDurationMs(start, end) : Math.max(0, end - start);
	const hours = duration / HOUR;
	if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
	const days = Math.floor(hours / 24);
	const restHours = Math.round((hours - days * 24) * 10) / 10;
	return restHours ? `${days}天 ${restHours}h` : `${days}天`;
}

function cleanStatusText(value?: string | null) {
	return String(value || "").replace(/^\$+/, "");
}

function stageDelayText(row: OpsProjectPoolRow, stage: string, createdAt: number) {
	const deadline = (row.stageDeadlines || []).find((item) => item.name === stage || item.key === stage);
	if (!deadline?.date) return "";
	const planned = dayjs(deadline.date).startOf("day");
	if (!planned.isValid()) return "";
	const days = dayjs(createdAt).startOf("day").diff(planned, "day");
	return days > 0 ? `延期${days}天` : "";
}

function rowLogs(row: OpsProjectPoolRow, logsByProjectId: Record<string, OpsProjectStatusLog[]>, kind: "status" | "stage") {
	return (logsByProjectId[row.id] || [])
		.filter((log) => log.kind === kind)
		.sort((a, b) => (parseTime(a.createdAt) || 0) - (parseTime(b.createdAt) || 0));
}

function buildEvents(row: OpsProjectPoolRow, logsByProjectId: Record<string, OpsProjectStatusLog[]>, kind: "status" | "stage", filterRestTime: boolean): ProgressFlowEvent[] {
	const logs = rowLogs(row, logsByProjectId, kind);
	return logs
		.map((log, index) => {
			const start = parseTime(log.createdAt);
			if (start == null) return null;
			const nextStart = parseTime(logs[index + 1]?.createdAt);
			const toStatus = cleanStatusText(log.toStatus);
			const delayText = kind === "stage" ? stageDelayText(row, toStatus, start) : "";
			return {
				id: `${row.id}-${kind}-${log.id}-${index}`,
				kind,
				label: delayText ? `${toStatus} · ${delayText}` : toStatus,
				color: kind === "status" ? FLOW_STATUS_COLOR[toStatus] || "#475569" : "#1d4ed8",
				textColor: "#0f172a",
				fromStatus: cleanStatusText(log.fromStatus),
				toStatus,
				actorName: log.actorName || "系统",
				createdAt: formatDateTime(start),
				durationToNext: nextStart && nextStart > start ? durationText(start, nextStart, filterRestTime) : undefined,
				delayText,
			};
		})
		.filter(Boolean) as ProgressFlowEvent[];
}

function buildRowFlow(row: OpsProjectPoolRow, logsByProjectId: Record<string, OpsProjectStatusLog[]>, filterRestTime: boolean) {
	const statusEvents = buildEvents(row, logsByProjectId, "status", filterRestTime);
	const stageEvents = buildEvents(row, logsByProjectId, "stage", filterRestTime);
	return { statusEvents, stageEvents };
}

export function buildProgressFlowRows(rows: OpsProjectPoolRow[], logsByProjectId: Record<string, OpsProjectStatusLog[]>, filterRestTime: boolean) {
  const result: ProgressFlowRow[] = [];
  for (const row of rows) {
    if (row.children?.length) {
      const childRows = row.children.map((child) => ({ child, ...buildRowFlow(child, logsByProjectId, filterRestTime) }));
      if (!childRows.length) continue;
      result.push({ id: row.id, row: { ...row, children: childRows.map((item) => item.child) }, isParent: true, statusEvents: [], stageEvents: [] });
      for (const [index, item] of childRows.entries()) {
				result.push({ id: item.child.id, row: item.child, parentName: row.name, parentId: row.id, childIndex: index, childCount: childRows.length, statusEvents: item.statusEvents, stageEvents: item.stageEvents });
			}
      continue;
    }
    const flow = buildRowFlow(row, logsByProjectId, filterRestTime);
    result.push({ id: row.id, row, ...flow });
  }
  return result;
}
