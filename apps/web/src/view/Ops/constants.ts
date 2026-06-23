// 需求提单(Ops)模块公用常量
import type { CSSProperties } from "react";

/** 页面顶部工具栏卡片样式(白底圆角边框,各页统一)。布局可按需覆盖 justifyContent */
export const OPS_TOOLBAR_CARD: CSSProperties = {
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

export type OpsTicketsView = "table" | "kanban";

/** 列表视图(表格/看板)在本地存储的 key —— 记住用户上次的选择 */
export const OPS_TICKETS_VIEW_KEY = "ops.tickets.view";

/** 默认视图:表格 */
export const OPS_TICKETS_DEFAULT_VIEW: OpsTicketsView = "table";

// ===== 项目池公用常量 =====

/** 项目状态(与 soyoo 项目状态枚举一致) */
export const PROJECT_STATUSES = ["未启动", "推进中", "已完成", "已反馈", "待反馈", "回收中", "客户暂停"];

/** 制作阶段(ops 自有,固定顺序即流程)。新增阶段就往这里加(注意与后端 ops/project-pool-constants.mjs 同步) */
export const PROJECT_STAGES = ["资产确认", "场景单帧版本", "可交互初版", "功能完整版", "最终交付版"];

/** 项目状态配色(浅底 + 黑字、无边框),与 soyoo admin(src/lib/projectStatus.ts)一致 */
export const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
	推进中: { bg: "#c2d4ff", text: "#000000" },
	未启动: { bg: "#fee7cd", text: "#000000" },
	已完成: { bg: "#caeffc", text: "#000000" },
	已反馈: { bg: "#faedc2", text: "#000000" },
	待反馈: { bg: "#c4f2ec", text: "#000000" },
	回收中: { bg: "#fee3e2", text: "#000000" },
	客户暂停: { bg: "#efe6fe", text: "#000000" },
};

/** 项目状态内联样式(背景 + 文字色);未知/空按「未启动」,再兜底灰 */
export const statusStyle = (status?: string) => {
	const c = STATUS_COLOR[status || "未启动"] || { bg: "#f1f5f9", text: "#475569" };
	return { background: c.bg, color: c.text };
};
