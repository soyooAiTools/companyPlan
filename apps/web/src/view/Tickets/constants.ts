import type { CSSProperties } from "react";

export type OpsTicketScope = "all" | "owner" | "requester";

export const TICKETS_TOOLBAR_CARD: CSSProperties = {
	display: "flex",
	alignItems: "center",
	flexWrap: "wrap",
	gap: 12,
	marginBottom: 12,
	background: "#fff",
	padding: "10px 12px",
	borderRadius: 8,
	border: "1px solid #edf0f3",
};

// 「阻塞」暂时前端隐藏:不可选 / 不分组 / 不展示(后端仍支持,恢复时把 "阻塞" 加回本数组即可)
export const STATUSES = ["排队中", "进行中", "已完成"];
export const STATUS_COLOR: Record<string, string> = { 排队中: "default", 进行中: "processing", 阻塞: "error", 已完成: "success" };
export const PRIORITIES = ["紧急", "优先", "普通", "低优先"];
export const PRIORITY_COLOR: Record<string, string> = { 紧急: "red", 优先: "orange", 普通: "blue", 低优先: "default" };

export const SCOPE_OPTIONS: { label: string; value: OpsTicketScope }[] = [
	{ label: "全部", value: "all" },
	{ label: "我提单的", value: "requester" },
	{ label: "我负责的", value: "owner" },
];

export const NEED_NOTE = new Set(["已完成", "阻塞"]); // 切到这些状态要填备注
