// 需求提单(Ops)模块公用常量

export type OpsTicketsView = "table" | "kanban";

/** 列表视图(表格/看板)在本地存储的 key —— 记住用户上次的选择 */
export const OPS_TICKETS_VIEW_KEY = "ops.tickets.view";

/** 默认视图:表格 */
export const OPS_TICKETS_DEFAULT_VIEW: OpsTicketsView = "table";
