// 需求提单 —— 新接口客户端(对应后端 /api/ops/*,Prisma)。环节=分类,绑定 soyoo 标签。
import { requestJson } from "../request";

export interface OpsTag {
	id: string;
	name: string;
	color: string;
}
export interface OpsTenant {
	id: string;
	name: string;
}
export interface OpsProject {
	id: string;
	name: string;
	tenantId: string;
	client: string;
	plannerName: string;
	developerName: string;
	status: string;
}
export interface OpsSegmentTag {
	id: string;
	name: string;
}
export interface OpsSegment {
	id: number;
	name: string;
	defaultDeliveryHours: number;
	riskWarningHours: number;
	sortOrder: number;
	tags: OpsSegmentTag[];
}
export interface OpsResponsibleMember {
	id: string;
	username: string;
	name: string;
	wechatName?: string; // 微信名称(同步自 soyoo)
	wechatAvatar?: string; // 微信头像 URL(同步自 soyoo)
	segmentIds?: number[]; // 该成员所属环节(仅"全部成员"列表带;供选负责人回填环节)
}
export interface OpsResponsibleSegment {
	id: number;
	name: string;
	members: OpsResponsibleMember[];
}
export interface OpsTicket {
	id: string;
	title: string;
	client: string;
	projectName: string;
	projectId: string;
	tagName: string; // 环节名
	needType: string;
	priority: string;
	status: string;
	dueInHours: number;
	ownerId: string;
	ownerName: string;
	ownerAvatar?: string; // 负责人微信头像 URL
	requesterId: string;
	requesterName: string;
	requesterAvatar?: string; // 提单人微信头像 URL
	summary: string;
	contentHtml: string; // 富文本正文(已服务端 sanitize)
	hyperlink: string;
	blockReason: string;
	riskWarningHours: number;
	remainingHours?: number | null; // 距交付的工作小时(后端按工时算;正=剩、负=超期、null=已完成)
	canEdit: boolean; // 能否改状态(负责人/管理员)
	canEditContent: boolean; // 能否改需求说明(提单人/管理员)
	canAssign?: boolean; // 能否指派(负责人/提单人/管理员)
	canEditPriority?: boolean; // 能否改优先级(管理员)
	createdAt: string;
	statusUpdatedAt: string;
}
export interface OpsTicketEvent {
	id: number;
	actorName: string;
	action: string;
	fromStatus: string;
	toStatus: string;
	note: string;
	createdAt: string;
}
export interface CreateTicketBody {
	projectId: string;
	segmentId: number;
	ownerId: string;
	title: string;
	priority?: string;
	needType?: string;
	contentHtml?: string; // 富文本正文
	summary?: string;
	hyperlink?: string;
	text?: string;
}

export interface OpsMe {
	id: string;
	name: string;
	username: string;
	roleKey: string;
	isAdmin: boolean;
	isPlanner: boolean; // soyoo 带「制片」标签 = 策划(决定「项目池」菜单可见)
	avatar?: string; // 微信头像 URL
	wechatName?: string; // 微信名
}

// ===== 项目池 =====
export interface OpsProjectPoolRow {
	id: string;
	name: string;
	tenantName: string; // 客户名(= soyoo tenant_name)
	status: string;
	stage: string; // 制作阶段(ops 自有:资产确认/场景单帧版本/可交互初版/功能完整版/最终交付版)
	stageChangedAt: string | null;
	remark: string; // 项目备注(ops 自有,富文本 HTML;空串=无)
	plannerName: string; // 原始串(可能含多个策划,如「牛群、王新丽」),文字展示用
	planners: { name: string; avatar: string }[]; // 拆分后的每个策划 + 微信头像(无头像则 avatar 为空)
	statusChangedAt: string | null;
	memberCount: number;
	segments: { id: number; name: string; count: number }[]; // 目前环节 + 各环节未完成工单数
	ticketGroups: Record<string, number>; // 未完成工单按状态分组 {排队中:N, 进行中:N}
	ticketTotal: number;
	atRisk: number; // 工单超时(临期)数
	overdue: number; // 工单逾期(超期)数
	stuckHours?: number | null; // 项目已停留工时
	staleHours?: number; // 该状态阈值
	overByHours?: number | null; // 超出阈值工时
	isStale?: boolean; // 项目状态超时 → 整行标红
	stageStuckHours?: number | null; // 阶段已停留工时
	stageStaleHours?: number; // 该阶段阈值
	stageOverByHours?: number | null; // 阶段超出阈值工时
	stageStale?: boolean; // 阶段停留超时
}
export interface OpsProjectPoolMember {
	id: string;
	name: string;
	avatar: string; // 微信头像 URL
	wechatName: string;
	username: string;
	tags: string[]; // 角色标签名(如 制片/美术)
}
export interface OpsSegmentTicket {
	id: string;
	title: string;
	status: string;
	priority: string;
	ownerName: string;
	ownerAvatar: string;
	dueAt: string | null;
	remainingHours?: number | null; // 距交付的工作小时(后端按工时算;正=剩、负=超期)
	overdue: boolean; // 逾期(已过截止)
	atRisk: boolean; // 临期(已过预警未到截止)
}
export interface OpsProjectStatusLog {
	id: number;
	kind: "status" | "stage" | "remark"; // 状态变更 / 阶段变更 / 备注修改(同一时间线区分)
	fromStatus: string | null;
	toStatus: string;
	actorName: string | null;
	actorAvatar: string; // 操作人微信头像 URL(无则空)
	commentHtml: string | null;
	createdAt: string;
}
export interface OpsProjectStatusSetting {
	status: string;
	enabled: boolean;
	staleHours: number;
	sortOrder: number;
}
export interface OpsProjectStageSetting {
	stage: string;
	enabled: boolean;
	staleHours: number;
	sortOrder: number;
}
export interface OpsSyncConfig {
	intervalMinutes: number;
	enabled: boolean;
}
export interface OpsSyncStatus {
	active?: boolean;
	reason?: string;
	syncedAt?: string;
	users?: number;
	projects?: number;
	tenants?: number;
	tags?: number;
	error?: string;
}
export interface OpsSyncLog {
	id: number;
	triggerBy: string;
	actorName: string;
	status: string;
	users: number;
	projects: number;
	tenants: number;
	tags: number;
	durationMs: number;
	error: string;
	startedAt: string;
	finishedAt: string;
}
export interface OpsNotification {
	id: string;
	eventKey: string;
	title: string;
	body: string;
	link: string;
	refType: string;
	refId: string;
	readAt: string | null;
	createdAt: string;
	realert?: boolean; // 仅 SSE 推送时出现:超时的"重复提醒",前端只重弹桌面、不计未读
}
export interface OpsNotifSettingEvent {
	eventKey: string;
	enabled: boolean;
	config: { recipientSegmentIds?: number[] };
}
export interface OpsNotifSettings {
	events: OpsNotifSettingEvent[];
	scanIntervalMin: number;
}

export const opsApi = {
	tags: () => requestJson<{ tags: OpsTag[] }>("/api/ops/tags"),
	tenants: () => requestJson<{ tenants: OpsTenant[] }>("/api/ops/tenants"),
	projects: (tenantId?: string) => requestJson<{ projects: OpsProject[] }>(`/api/ops/projects${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`),
	segments: () => requestJson<{ segments: OpsSegment[] }>("/api/ops/segments"),
	createSegment: (name: string) => requestJson<{ segment: OpsSegment }>("/api/ops/segments", { method: "POST", body: JSON.stringify({ name }) }),
	updateSegment: (id: number, body: { name?: string; defaultDeliveryHours?: number; riskWarningHours?: number; sortOrder?: number; tagIds?: string[] }) =>
		requestJson<{ segment: OpsSegment }>(`/api/ops/segments/${id}`, { method: "PUT", body: JSON.stringify(body) }),
	deleteSegment: (id: number) => requestJson<{ ok: boolean }>(`/api/ops/segments/${id}`, { method: "DELETE" }),
	reorderSegments: (ids: number[]) => requestJson<{ segments: OpsSegment[] }>("/api/ops/segments/reorder", { method: "POST", body: JSON.stringify({ ids }) }),
	responsibles: (projectId: string) =>
		requestJson<{ segments: OpsResponsibleSegment[]; members: OpsResponsibleMember[] }>(`/api/ops/projects/${encodeURIComponent(projectId)}/responsibles`),
	tickets: (
		params: { scope?: "all" | "owner" | "requester" | "overdue"; page?: number; pageSize?: number; q?: string; status?: string; priority?: string; segment?: number } = {},
	) => {
		const qs = new URLSearchParams();
		if (params.scope && params.scope !== "all") qs.set("scope", params.scope);
		if (params.page) qs.set("page", String(params.page));
		if (params.pageSize) qs.set("pageSize", String(params.pageSize));
		if (params.q) qs.set("q", params.q);
		if (params.status) qs.set("status", params.status);
		if (params.priority) qs.set("priority", params.priority);
		if (params.segment != null) qs.set("segment", String(params.segment));
		const s = qs.toString();
		return requestJson<{ tickets: OpsTicket[]; total: number; page: number; pageSize: number; counts: Record<string, number> }>(`/api/ops/tickets${s ? `?${s}` : ""}`);
	},
	createTicket: (body: CreateTicketBody) => requestJson<{ ticket: OpsTicket }>("/api/ops/tickets", { method: "POST", body: JSON.stringify(body) }),
	ticket: (id: string) => requestJson<{ ticket: OpsTicket }>(`/api/ops/tickets/${encodeURIComponent(id)}`),
	ticketEvents: (id: string) => requestJson<{ events: OpsTicketEvent[] }>(`/api/ops/tickets/${encodeURIComponent(id)}/events`),
	// 按需拉富文本正文(列表不返 contentHtml)
	ticketContent: (id: string) => requestJson<{ contentHtml: string }>(`/api/ops/tickets/${encodeURIComponent(id)}/content`),
	updateTicketContent: (id: string, contentHtml: string) =>
		requestJson<{ ticket: OpsTicket }>(`/api/ops/tickets/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ contentHtml }) }),
	// 富文本资源上传(图片/视频/附件)→ OSS,返回公开 URL
	uploadFile: (body: { projectId: string; filename: string; mime: string; dataBase64: string }) =>
		requestJson<{ url: string }>("/api/ops/upload", { method: "POST", body: JSON.stringify(body) }),
	// 当前用户(角色,用于按管理员显示设置菜单)
	me: () => requestJson<{ user: OpsMe }>("/api/ops/me"),
	updateTicketStatus: (id: string, status: string, reason?: string) =>
		requestJson<{ ticket: OpsTicket }>(`/api/ops/tickets/${encodeURIComponent(id)}/status`, {
			method: "PATCH",
			body: JSON.stringify({ status, reason }),
		}),
	updateTicketPriority: (id: string, priority: string) =>
		requestJson<{ ticket: OpsTicket }>(`/api/ops/tickets/${encodeURIComponent(id)}/priority`, {
			method: "PATCH",
			body: JSON.stringify({ priority }),
		}),
	// 项目成员(指派候选)
	projectMembers: (projectId: string) =>
		requestJson<{ members: { id: string; username: string; name: string; avatar: string; wechatName: string; status: string; segmentNames?: string[] }[] }>(
			`/api/ops/projects/${encodeURIComponent(projectId)}/members`,
		),
	// 指派/改派工单给项目其他成员(管理员或当前负责人)
	assignTicket: (id: string, ownerId: string) =>
		requestJson<{ ticket: OpsTicket }>(`/api/ops/tickets/${encodeURIComponent(id)}/assign`, {
			method: "POST",
			body: JSON.stringify({ ownerId }),
		}),

	// ===== 项目池 =====
	projectPool: (params: { page?: number; pageSize?: number; q?: string; status?: string[] } = {}) => {
		const qs = new URLSearchParams();
		if (params.page) qs.set("page", String(params.page));
		if (params.pageSize) qs.set("pageSize", String(params.pageSize));
		if (params.q) qs.set("q", params.q);
		if (params.status?.length) qs.set("status", params.status.join(",")); // 多选 → 逗号分隔,后端 IN;不传则后端按「开启监控」状态查
		const s = qs.toString();
		return requestJson<{ rows: OpsProjectPoolRow[]; total: number; page: number; pageSize: number }>(`/api/ops/project-pool${s ? `?${s}` : ""}`);
	},
	projectPoolMembers: (projectId: string) =>
		requestJson<{ members: OpsProjectPoolMember[] }>(`/api/ops/project-pool/${encodeURIComponent(projectId)}/members`),
	projectSegmentTickets: (projectId: string, segmentId: number) =>
		requestJson<{ tickets: OpsSegmentTicket[] }>(`/api/ops/project-pool/${encodeURIComponent(projectId)}/segment-tickets?segmentId=${segmentId}`),
	projectPoolStale: (params: { page?: number; pageSize?: number } = {}) => {
		const qs = new URLSearchParams();
		if (params.page) qs.set("page", String(params.page));
		if (params.pageSize) qs.set("pageSize", String(params.pageSize));
		const s = qs.toString();
		return requestJson<{ rows: OpsProjectPoolRow[]; total: number; page: number; pageSize: number }>(`/api/ops/project-pool/stale${s ? `?${s}` : ""}`);
	},
	projectPoolStaleCount: () => requestJson<{ count: number }>("/api/ops/project-pool/stale-count"),
	changeProjectStatus: (projectId: string, status: string, commentHtml?: string) =>
		requestJson<{ ok: boolean; status: string }>(`/api/ops/project-pool/${encodeURIComponent(projectId)}/status`, {
			method: "POST",
			body: JSON.stringify({ status, commentHtml }),
		}),
	changeProjectStage: (projectId: string, stage: string, commentHtml?: string) =>
		requestJson<{ ok: boolean; stage: string }>(`/api/ops/project-pool/${encodeURIComponent(projectId)}/stage`, {
			method: "POST",
			body: JSON.stringify({ stage, commentHtml }),
		}),
	changeProjectRemark: (projectId: string, remark: string) =>
		requestJson<{ ok: boolean }>(`/api/ops/project-pool/${encodeURIComponent(projectId)}/remark`, {
			method: "POST",
			body: JSON.stringify({ remark }),
		}),
	projectStatusLogs: (projectId: string) => requestJson<{ logs: OpsProjectStatusLog[] }>(`/api/ops/project-pool/${encodeURIComponent(projectId)}/status-logs`),
	projectStatusSettings: () => requestJson<{ settings: OpsProjectStatusSetting[] }>("/api/ops/project-status-settings"),
	saveProjectStatusSettings: (settings: OpsProjectStatusSetting[]) =>
		requestJson<{ settings: OpsProjectStatusSetting[] }>("/api/ops/project-status-settings", { method: "PUT", body: JSON.stringify({ settings }) }),
	projectStageSettings: () => requestJson<{ settings: OpsProjectStageSetting[] }>("/api/ops/project-stage-settings"),
	saveProjectStageSettings: (settings: OpsProjectStageSetting[]) =>
		requestJson<{ settings: OpsProjectStageSetting[] }>("/api/ops/project-stage-settings", { method: "PUT", body: JSON.stringify({ settings }) }),
	// 通知(站内消息):列表/未读、已读、配置。SSE 流由 EventSource 直连,不走这里。
	notifications: (status: "unread" | "all" = "all", page = 1, pageSize = 10) =>
		requestJson<{ items: OpsNotification[]; total: number; unread: number }>(
			`/api/ops/notifications?status=${status}&page=${page}&pageSize=${pageSize}`,
		),
	notifRead: (id: string) => requestJson<{ ok: boolean }>(`/api/ops/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
	notifReadAll: () => requestJson<{ ok: boolean }>("/api/ops/notifications/read-all", { method: "POST" }),
	notifTest: () => requestJson<{ ok: boolean }>("/api/ops/notifications/test", { method: "POST" }),
	notifSettings: () => requestJson<OpsNotifSettings>("/api/ops/notification-settings"),
	saveNotifSettings: (payload: { events: OpsNotifSettingEvent[]; scanIntervalMin: number }) =>
		requestJson<OpsNotifSettings>("/api/ops/notification-settings", { method: "PUT", body: JSON.stringify(payload) }),
};
