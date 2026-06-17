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
	canEdit: boolean; // 能否改状态(负责人/管理员)
	canEditContent: boolean; // 能否改需求说明(提单人/管理员)
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
	avatar?: string; // 微信头像 URL
	wechatName?: string; // 微信名
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

export const opsApi = {
	tags: () => requestJson<{ tags: OpsTag[] }>("/api/ops/tags"),
	tenants: () => requestJson<{ tenants: OpsTenant[] }>("/api/ops/tenants"),
	projects: (tenantId?: string) => requestJson<{ projects: OpsProject[] }>(`/api/ops/projects${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`),
	segments: () => requestJson<{ segments: OpsSegment[] }>("/api/ops/segments"),
	createSegment: (name: string) => requestJson<{ segment: OpsSegment }>("/api/ops/segments", { method: "POST", body: JSON.stringify({ name }) }),
	updateSegment: (id: number, body: { name?: string; defaultDeliveryHours?: number; riskWarningHours?: number; sortOrder?: number; tagIds?: string[] }) =>
		requestJson<{ segment: OpsSegment }>(`/api/ops/segments/${id}`, { method: "PUT", body: JSON.stringify(body) }),
	deleteSegment: (id: number) => requestJson<{ ok: boolean }>(`/api/ops/segments/${id}`, { method: "DELETE" }),
	responsibles: (projectId: string) =>
		requestJson<{ segments: OpsResponsibleSegment[]; members: OpsResponsibleMember[] }>(`/api/ops/projects/${encodeURIComponent(projectId)}/responsibles`),
	tickets: (scope: "all" | "owner" | "requester" = "all") => requestJson<{ tickets: OpsTicket[] }>(`/api/ops/tickets${scope !== "all" ? `?scope=${scope}` : ""}`),
	createTicket: (body: CreateTicketBody) => requestJson<{ ticket: OpsTicket }>("/api/ops/tickets", { method: "POST", body: JSON.stringify(body) }),
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
	// 同步管理(仅管理员)
	syncInfo: () => requestJson<{ config: OpsSyncConfig; status: OpsSyncStatus; logs: OpsSyncLog[] }>("/api/ops/sync"),
	saveSyncConfig: (body: { intervalMinutes?: number; enabled?: boolean }) => requestJson<{ config: OpsSyncConfig }>("/api/ops/sync", { method: "PUT", body: JSON.stringify(body) }),
	runSync: () => requestJson<{ started: boolean }>("/api/ops/sync/run", { method: "POST" }),
	updateTicketStatus: (id: string, status: string, reason?: string) =>
		requestJson<{ ticket: OpsTicket }>(`/api/ops/tickets/${encodeURIComponent(id)}/status`, {
			method: "PATCH",
			body: JSON.stringify({ status, reason }),
		}),
};
