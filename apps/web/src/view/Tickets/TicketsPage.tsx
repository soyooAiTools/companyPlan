import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { App, Button, Form, Modal, Select, Space, Tag } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { opsApi } from "../../api/modules/ops";
import type { OpsProject, OpsResponsibleMember, OpsResponsibleSegment, OpsTenant, OpsTicket, OpsTicketEvent } from "../../api/modules/ops";
import { NEED_NOTE, PRIORITIES, PRIORITY_COLOR, STATUSES, STATUS_COLOR, type OpsTicketScope } from "./constants";
import { stripHtmlText } from "./ticketsUtils";
import AssignOwnerModal, { type AssignOwnerCandidate } from "./components/dialogs/AssignOwnerModal";
import CreateTicketModal from "./components/dialogs/CreateTicketModal";
import EditTicketContentModal from "./components/dialogs/EditTicketContentModal";
import EditTicketAdminNoteModal from "./components/dialogs/EditTicketAdminNoteModal";
import TicketDetailDrawer from "./components/dialogs/TicketDetailDrawer";
import TicketTable from "./components/table/TicketTable";
import PersonCell from "./components/table/PersonCell";
import TicketStatusNoteModal from "./components/dialogs/TicketStatusNoteModal";
import TicketsToolbar from "./components/toolbar/TicketsToolbar";

type TicketsPageProps = {
	isAdmin?: boolean;
};

export default function TicketsPage({ isAdmin = false }: TicketsPageProps) {
	const { message: messageApi } = App.useApp();
	const [tickets, setTickets] = useState<OpsTicket[]>([]);
	const [loading, setLoading] = useState(false);
	const [scope, setScope] = useState<OpsTicketScope>("all");
	const [titleSearch, setTitleSearch] = useState("");
	const [projectSearch, setProjectSearch] = useState("");
	const [requesterSearch, setRequesterSearch] = useState("");
	const [ownerSearch, setOwnerSearch] = useState("");
	const [debouncedTitleSearch, setDebouncedTitleSearch] = useState("");
	const [debouncedProjectSearch, setDebouncedProjectSearch] = useState("");
	const [debouncedRequesterSearch, setDebouncedRequesterSearch] = useState("");
	const [debouncedOwnerSearch, setDebouncedOwnerSearch] = useState("");
	const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
	const [segmentFilter, setSegmentFilter] = useState<number[]>([]);
	const [segmentOptions, setSegmentOptions] = useState<{ id: number; name: string }[]>([]); // 全部环节(筛选下拉用)
	const [statusFilter, setStatusFilter] = useState<string[]>(["进行中", "排队中"]);
	const [overdueOnly, setOverdueOnly] = useState(false);
	const [sortBy, setSortBy] = useState<"createdAt" | "remaining" | "">("");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc" | "">("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [total, setTotal] = useState(0);
	const [detail, setDetail] = useState<OpsTicket | null>(null);
	const [detailLoading, setDetailLoading] = useState(false); // 详情打开/切换时的加载态(避免闪上一条数据)
	const [events, setEvents] = useState<OpsTicketEvent[]>([]);
	const [editContentOpen, setEditContentOpen] = useState(false); // 编辑需求说明
	const [editContentHtml, setEditContentHtml] = useState("");
	const [savingContent, setSavingContent] = useState(false);
	const [editingPriorityId, setEditingPriorityId] = useState<string | null>(null);
	const [adminNoteTicket, setAdminNoteTicket] = useState<OpsTicket | null>(null);
	const [adminNoteOpen, setAdminNoteOpen] = useState(false);
	const [adminNoteText, setAdminNoteText] = useState("");
	const [savingAdminNote, setSavingAdminNote] = useState(false);

	// 改状态填备注
	const [noteId, setNoteId] = useState<string | null>(null);
	const [noteStatus, setNoteStatus] = useState("");
	const [noteText, setNoteText] = useState("");

	// 指派/改派负责人
	const [assignOpen, setAssignOpen] = useState(false);
	const [assignCandidates, setAssignCandidates] = useState<AssignOwnerCandidate[]>([]);
	const [assignOwnerId, setAssignOwnerId] = useState("");
	const [assigning, setAssigning] = useState(false);

	// 建单
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [tenants, setTenants] = useState<OpsTenant[]>([]);
	const [projects, setProjects] = useState<OpsProject[]>([]);
	const [projectsLoading, setProjectsLoading] = useState(false);
	const [segments, setSegments] = useState<OpsResponsibleSegment[]>([]);
	const [members, setMembers] = useState<OpsResponsibleMember[]>([]);
	const [invalidTaskIndex, setInvalidTaskIndex] = useState<number | null>(null);
	const [form] = Form.useForm();
	const selectedProjectId = Form.useWatch("projectId", form) as string | undefined;
	const projectsRequestSeq = useRef(0);

	const loadTickets = async () => {
		setLoading(true);
		try {
			const r = await opsApi.tickets({
				scope,
				page,
				pageSize,
				title: debouncedTitleSearch.trim() || undefined,
				project: debouncedProjectSearch.trim() || undefined,
				requester: debouncedRequesterSearch.trim() || undefined,
				owner: debouncedOwnerSearch.trim() || undefined,
				priority: priorityFilter,
				segment: segmentFilter,
				overdueOnly: isAdmin ? overdueOnly : false,
				sortBy: sortBy || undefined,
				sortOrder: sortOrder || undefined,
				status: statusFilter,
			});
			setTickets(r.tickets);
			setTotal(r.total ?? r.tickets.length);
		} catch (e) {
			messageApi.error(e instanceof Error ? e.message : "加载提单失败");
		} finally {
			setLoading(false);
		}
	};
	// 筛选/分页/视图/tab 变化 → 服务端重新拉(单一来源,避免重复请求:筛选变更已在各 onChange 里 setPage(1))
	useEffect(() => {
		void loadTickets();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scope, page, pageSize, statusFilter, priorityFilter, segmentFilter, overdueOnly, sortBy, sortOrder, debouncedTitleSearch, debouncedProjectSearch, debouncedRequesterSearch, debouncedOwnerSearch]);
	// 搜索去抖(并回到第 1 页)
	useEffect(() => {
		const t = setTimeout(() => {
			setDebouncedTitleSearch(titleSearch);
			setDebouncedProjectSearch(projectSearch);
			setDebouncedRequesterSearch(requesterSearch);
			setDebouncedOwnerSearch(ownerSearch);
			setPage(1);
		}, 400);
		return () => clearTimeout(t);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [titleSearch, projectSearch, requesterSearch, ownerSearch]);
	// 环节筛选下拉:列出全部环节(不只当前数据里出现的)
	useEffect(() => {
		opsApi
			.segments()
			.then((r) => setSegmentOptions(r.segments.map((s) => ({ id: s.id, name: s.name }))))
			.catch(() => {});
	}, []);

	useEffect(() => {
		setEvents([]); // 切换/关闭先清空,避免闪现上一条工单的数据
		setEditingPriorityId(null);
		if (!detail) {
			setDetailLoading(false);
			return;
		}
		const id = detail.id;
		let active = true; // 防快速切换的竞态:旧请求回来不再写入
		// 流转记录 + 需求说明富文本一起拉,都到位再结束加载态(打开时显示 Spin,不闪旧数据)
		const tasks = [
			opsApi
				.ticketEvents(id)
				.then((r) => {
					if (active) setEvents(r.events);
				})
				.catch(() => {
					if (active) setEvents([]);
				}),
		];
		if (!detail.contentHtml) {
			tasks.push(
				opsApi
					.ticketContent(id)
					.then((r) => {
						if (active) setDetail((d) => (d && d.id === id ? { ...d, contentHtml: r.contentHtml } : d));
					})
					.catch(() => {}),
			);
		}
		Promise.all(tasks).finally(() => {
			if (active) setDetailLoading(false);
		});
		return () => {
			active = false;
		};
	}, [detail?.id]);

	// 打开详情:进入加载态(配合 effect 拉数据 + destroyOnHidden,避免显示上一条)
	const openDetail = (t: OpsTicket) => {
		setDetailLoading(true);
		setDetail(t);
	};

	// 通知深链:URL 带 ?ticket=<id> 时拉该工单并打开详情(可能不在当前列表/筛选内)
	const [searchParams, setSearchParams] = useSearchParams();
	const ticketParam = searchParams.get("ticket");
	useEffect(() => {
		if (!ticketParam) return;
		let active = true;
		opsApi
			.ticket(ticketParam)
			.then((r) => {
				if (active) openDetail(r.ticket);
			})
			.catch((e) => messageApi.error(e instanceof Error ? e.message : "打开工单失败"));
		return () => {
			active = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticketParam]);

	const changeStatus = async (id: string, status: string, reason?: string) => {
		try {
			const r = await opsApi.updateTicketStatus(id, status, reason);
			setDetail((d) => (d && d.id === id ? r.ticket : d));
			if (detail?.id === id)
				opsApi
					.ticketEvents(id)
					.then((e) => setEvents(e.events))
					.catch(() => {});
			await loadTickets();
		} catch (e) {
			messageApi.error(e instanceof Error ? e.message : "操作失败");
		}
	};
	const changePriority = async (t: OpsTicket, priority: string) => {
		if (priority === t.priority) return;
		try {
			const r = await opsApi.updateTicketPriority(t.id, priority);
			setDetail((d) => (d && d.id === t.id ? r.ticket : d));
			setEditingPriorityId(null);
			opsApi
				.ticketEvents(t.id)
				.then((e) => setEvents(e.events))
				.catch(() => {});
			messageApi.success("优先级已更新");
			await loadTickets();
		} catch (e) {
			messageApi.error(e instanceof Error ? e.message : "修改优先级失败");
		}
	};

	// 选状态:进行中/排队中 直接改;完成/阻塞 弹框填备注
	const onPickStatus = (t: OpsTicket, next: string) => {
		if (next === t.status) return;
		if (NEED_NOTE.has(next)) {
			setNoteId(t.id);
			setNoteStatus(next);
			setNoteText("");
		} else {
			void changeStatus(t.id, next);
		}
	};
	const confirmNote = async () => {
		if (!noteId) return;
		if (noteStatus === "阻塞" && !noteText.trim()) {
			messageApi.warning("请填写阻塞原因");
			return;
		}
		await changeStatus(noteId, noteStatus, noteText.trim());
		setNoteId(null);
	};

	// 指派:加载该项目成员 → 选一个 → 改派
	const openAssign = async () => {
		if (!detail) return;
		setAssignOwnerId("");
		setAssignOpen(true);
		try {
			const r = await opsApi.projectMembers(detail.projectId);
			setAssignCandidates(r.members.filter((m) => m.status !== "disabled"));
		} catch (e) {
			messageApi.error(e instanceof Error ? e.message : "加载项目成员失败");
		}
	};
	const confirmAssign = async () => {
		if (!detail || !assignOwnerId) {
			messageApi.warning("请选择负责人");
			return;
		}
		setAssigning(true);
		try {
			const r = await opsApi.assignTicket(detail.id, assignOwnerId);
			setDetail(r.ticket);
			opsApi
				.ticketEvents(detail.id)
				.then((e) => setEvents(e.events))
				.catch(() => {});
			setAssignOpen(false);
			messageApi.success("已指派");
			await loadTickets();
		} catch (e) {
			messageApi.error(e instanceof Error ? e.message : "指派失败");
		} finally {
			setAssigning(false);
		}
	};

	// 改需求说明(提单人/管理员)
	// 按需拉富文本正文(列表不返,查看/编辑时才拉)并缓存进 detail
	const loadDetailContent = async (): Promise<string> => {
		if (!detail) return "";
		if (detail.contentHtml) return detail.contentHtml;
		try {
			const r = await opsApi.ticketContent(detail.id);
			setDetail((d) => (d && d.id === detail.id ? { ...d, contentHtml: r.contentHtml } : d));
			return r.contentHtml;
		} catch {
			return "";
		}
	};
	const openEditContent = async () => {
		if (!detail) return;
		setEditContentHtml(await loadDetailContent());
		setEditContentOpen(true);
	};
	const saveContent = async () => {
		if (!detail) return;
		setSavingContent(true);
		try {
			const r = await opsApi.updateTicketContent(detail.id, editContentHtml);
			setDetail(r.ticket);
			opsApi
				.ticketEvents(detail.id)
				.then((e) => setEvents(e.events))
				.catch(() => {});
			setEditContentOpen(false);
			messageApi.success("需求说明已更新");
			await loadTickets();
		} catch (e) {
			messageApi.error(e instanceof Error ? e.message : "保存失败");
		} finally {
			setSavingContent(false);
		}
	};
	const openAdminNote = (ticket: OpsTicket) => {
		setAdminNoteTicket(ticket);
		setAdminNoteText(ticket.adminNote || "");
		setAdminNoteOpen(true);
	};
	const saveAdminNote = async () => {
		if (!adminNoteTicket) return;
		setSavingAdminNote(true);
		try {
			const r = await opsApi.updateTicketAdminNote(adminNoteTicket.id, adminNoteText);
			setDetail((current) => (current?.id === r.ticket.id ? r.ticket : current));
			setTickets((rows) => rows.map((ticket) => (ticket.id === r.ticket.id ? r.ticket : ticket)));
			setAdminNoteOpen(false);
			setAdminNoteTicket(null);
			messageApi.success("内部备注已保存");
		} catch (e) {
			messageApi.error(e instanceof Error ? e.message : "保存内部备注失败");
		} finally {
			setSavingAdminNote(false);
		}
	};

	// 状态控件:可改→Select,不可改→只读 Tag
	const statusControl = (t: OpsTicket, width: number | string = 120) =>
		t.canEdit ? (
			<span onClick={(e) => e.stopPropagation()}>
				<Select size="small" value={t.status} style={{ width }} options={STATUSES.map((s) => ({ value: s, label: s }))} onChange={(s) => onPickStatus(t, s)} />
			</span>
		) : (
			<Tag color={STATUS_COLOR[t.status]}>{t.status}</Tag>
		);
	const priorityControl = (t: OpsTicket, width: number | string = 120) =>
		t.canEditPriority && editingPriorityId === t.id ? (
			<Space size={6} onClick={(e) => e.stopPropagation()}>
				<Select
					size="small"
					value={t.priority}
					style={{ width }}
					options={PRIORITIES.map((p) => ({ value: p, label: p }))}
					onChange={(p) => void changePriority(t, p)}
				/>
				<Button size="small" type="link" style={{ padding: 0 }} onClick={() => setEditingPriorityId(null)}>
					取消
				</Button>
			</Space>
		) : (
			<Space size={4} onClick={(e) => e.stopPropagation()}>
				<Tag color={PRIORITY_COLOR[t.priority]}>{t.priority}</Tag>
				{t.canEditPriority ? (
					<Button size="small" type="text" icon={<EditOutlined />} style={{ padding: 0, width: 22 }} onClick={() => setEditingPriorityId(t.id)} />
				) : null}
			</Space>
		);

	// 建单级联
	const openCreate = async () => {
		form.resetFields();
		form.setFieldsValue({ priority: "普通", tickets: [{}] });
		setInvalidTaskIndex(null);
		setProjects([]);
		setProjectsLoading(false);
		setSegments([]);
		setMembers([]);
		setOpen(true);
		const tn = await opsApi.tenants().catch(() => null);
		if (tn) setTenants(tn.tenants);
	};
	const onTenantChange = async (tenantId?: string) => {
		const seq = ++projectsRequestSeq.current;
		form.setFieldsValue({ projectId: undefined, tickets: [{}] });
		setProjects([]);
		setSegments([]);
		setMembers([]);
		if (!tenantId) {
			setProjectsLoading(false);
			return;
		}
		setProjectsLoading(true);
		const r = await opsApi.projects(tenantId).catch(() => null);
		if (seq !== projectsRequestSeq.current) return;
		if (r) setProjects(r.projects);
		setProjectsLoading(false);
	};
	const onProjectChange = async (projectId?: string) => {
		form.setFieldsValue({ tickets: [{}] });
		setSegments([]);
		setMembers([]);
		if (!projectId) return;
		const r = await opsApi.responsibles(projectId).catch(() => null);
		if (r) {
			setSegments(r.segments ?? []);
			setMembers(r.members ?? []);
		}
	};
	const submit = async () => {
		await form.validateFields([["tenantId"], ["projectId"]]);
		const v = form.getFieldsValue();
		const rawTickets = (v.tickets || []) as Record<string, unknown>[];
		const hasAnyValue = (ticket: Record<string, unknown>) =>
			Boolean(String(ticket.title ?? "").trim() || ticket.segmentId != null || String(ticket.ownerId ?? "").trim() || stripHtmlText(String(ticket.contentHtml ?? "")));
		const isComplete = (ticket: Record<string, unknown>) => Boolean(String(ticket.title ?? "").trim() && ticket.segmentId != null && String(ticket.ownerId ?? "").trim());
		const incompleteIndex = rawTickets.findIndex((ticket) => hasAnyValue(ticket) && !isComplete(ticket));
		if (incompleteIndex >= 0) {
			const ticket = rawTickets[incompleteIndex];
			const ownerName = String(ticket.ownerId ?? "").trim() ? members.find((member) => member.id === String(ticket.ownerId))?.name || String(ticket.ownerId) : "未选负责人";
			const title = String(ticket.title ?? "").trim();
			const ticketLabel = `工单 ${incompleteIndex + 1}${ownerName ? `（${ownerName}${title ? ` · ${title}` : ""}）` : ""}`;
			setInvalidTaskIndex(incompleteIndex);
			form.setFields(
				[
					!String(ticket.title ?? "").trim() ? { name: ["tickets", incompleteIndex, "title"], errors: ["请输入标题"] } : null,
					ticket.segmentId == null ? { name: ["tickets", incompleteIndex, "segmentId"], errors: ["请选择环节"] } : null,
					!String(ticket.ownerId ?? "").trim() ? { name: ["tickets", incompleteIndex, "ownerId"], errors: ["请选择负责人"] } : null,
				].filter(Boolean) as Parameters<typeof form.setFields>[0],
			);
			messageApi.error(`${ticketLabel}：请补全标题、环节和负责人`);
			return;
		}
		setInvalidTaskIndex(null);
		const ticketsToCreate = rawTickets
			.filter(isComplete)
			.map((ticket: Record<string, unknown>) => ({
				projectId: v.projectId,
				segmentId: Number(ticket.segmentId),
				ownerId: String(ticket.ownerId),
				title: String(ticket.title || "").trim(),
				priority: v.priority,
				contentHtml: String(ticket.contentHtml ?? ""),
			}));
		if (!ticketsToCreate.length) {
			messageApi.error("请至少填写一条完整工单");
			return;
		}
		setSubmitting(true);
		try {
			await opsApi.createTickets({ projectId: v.projectId, priority: v.priority, tickets: ticketsToCreate });
			messageApi.success(ticketsToCreate.length > 1 ? `已创建 ${ticketsToCreate.length} 条工单` : "提单已创建");
			setOpen(false);
			await loadTickets();
		} catch (e) {
			messageApi.error(e instanceof Error ? e.message : "建单失败");
		} finally {
			setSubmitting(false);
		}
	};
	const hasCreateDraft = () => {
		const v = form.getFieldsValue();
		const hasTicketDraft = (v.tickets || []).some((ticket: Record<string, unknown>) =>
			Boolean(String(ticket.title ?? "").trim() || ticket.segmentId != null || String(ticket.ownerId ?? "").trim() || stripHtmlText(String(ticket.contentHtml ?? ""))),
		);
		return Boolean(
			String(v.tenantId ?? "").trim() || String(v.projectId ?? "").trim() || (v.priority && v.priority !== "普通") || hasTicketDraft,
		);
	};
	const closeCreate = () => {
		if (submitting) return;
		if (!hasCreateDraft()) {
			setOpen(false);
			return;
		}
		Modal.confirm({
			title: "确认关闭新建工单？",
			content: "当前已填写内容或需求说明，关闭后本次填写不会保存。",
			okText: "关闭",
			cancelText: "继续填写",
			okButtonProps: { danger: true },
			onOk: () => setOpen(false),
		});
	};

	const personCell = (avatar?: string, name?: string) => <PersonCell avatar={avatar} name={name} />;

	return (
		<div style={{ paddingBottom: 52 }}>
			<TicketsToolbar
				scope={scope}
				isAdmin={isAdmin}
				overdueOnly={overdueOnly}
				refreshing={loading}
				onScopeChange={(value) => {
					setScope(value);
					setPage(1);
				}}
				onOverdueOnlyChange={(value) => {
					setOverdueOnly(value);
					setPage(1);
				}}
				onRefresh={() => void loadTickets()}
				onCreate={openCreate}
			/>

			<TicketTable
				tickets={tickets}
				loading={loading}
				page={page}
				pageSize={pageSize}
				total={total}
				titleSearch={titleSearch}
				projectSearch={projectSearch}
				requesterSearch={requesterSearch}
				ownerSearch={ownerSearch}
				statusFilter={statusFilter}
				priorityFilter={priorityFilter}
				segmentFilter={segmentFilter}
				sortBy={sortBy}
				sortOrder={sortOrder}
				showAdminNote={isAdmin}
				segmentOptions={segmentOptions}
				statusControl={statusControl}
				priorityControl={priorityControl}
				onTitleSearchChange={(value) => {
					setTitleSearch(value);
					setPage(1);
				}}
				onProjectSearchChange={(value) => {
					setProjectSearch(value);
					setPage(1);
				}}
				onRequesterSearchChange={(value) => {
					setRequesterSearch(value);
					setPage(1);
				}}
				onOwnerSearchChange={(value) => {
					setOwnerSearch(value);
					setPage(1);
				}}
				onStatusFilterChange={(value) => {
					setStatusFilter(value);
					setPage(1);
				}}
				onPriorityFilterChange={(value) => {
					setPriorityFilter(value);
					setPage(1);
				}}
				onSegmentFilterChange={(value) => {
					setSegmentFilter(value);
					setPage(1);
				}}
				onSortChange={(nextSortBy, nextSortOrder) => {
					setSortBy(nextSortBy);
					setSortOrder(nextSortOrder);
					setPage(1);
				}}
				onPageChange={(p, ps) => {
					setPage(p);
					setPageSize(ps);
				}}
				onOpen={openDetail}
				onEditAdminNote={openAdminNote}
			/>

			<TicketDetailDrawer
				detail={detail}
				loading={detailLoading}
				events={events}
				statusControl={statusControl}
				priorityControl={priorityControl}
				personCell={personCell}
				onClose={() => {
					setDetail(null);
					if (ticketParam) {
						searchParams.delete("ticket");
						setSearchParams(searchParams, { replace: true });
					}
				}}
				onAssign={openAssign}
				onEditContent={openEditContent}
			/>

			<EditTicketContentModal open={editContentOpen} value={editContentHtml} saving={savingContent} projectId={detail?.projectId} onChange={setEditContentHtml} onSave={saveContent} onCancel={() => setEditContentOpen(false)} />
			<EditTicketAdminNoteModal
				open={adminNoteOpen}
				value={adminNoteText}
				saving={savingAdminNote}
				onChange={setAdminNoteText}
				onSave={saveAdminNote}
				onCancel={() => {
					setAdminNoteOpen(false);
					setAdminNoteTicket(null);
				}}
			/>

			<TicketStatusNoteModal open={!!noteId} status={noteStatus} value={noteText} onChange={setNoteText} onConfirm={confirmNote} onCancel={() => setNoteId(null)} />

			<AssignOwnerModal open={assignOpen} candidates={assignCandidates} ownerId={assignOwnerId} assigning={assigning} onOwnerChange={setAssignOwnerId} onConfirm={confirmAssign} onCancel={() => setAssignOpen(false)} />

			<CreateTicketModal
				open={open}
				submitting={submitting}
				form={form}
				tenants={tenants}
				projects={projects}
				projectsLoading={projectsLoading}
				segments={segments}
				members={members}
				selectedProjectId={selectedProjectId}
				invalidTaskIndex={invalidTaskIndex}
				onTenantChange={onTenantChange}
				onProjectChange={onProjectChange}
				onSubmit={submit}
				onCancel={closeCreate}
			/>
		</div>
	);
}
