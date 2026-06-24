import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Form, Input, Modal, Segmented, Select, Space, Tag, Table, Tooltip, Typography } from "antd";
import { BarsOutlined, EditOutlined, ProjectOutlined } from "@ant-design/icons";
import { opsApi } from "../../api/modules/ops";
import type { OpsProject, OpsResponsibleMember, OpsResponsibleSegment, OpsTenant, OpsTicket, OpsTicketEvent } from "../../api/modules/ops";
import SegmentedTabs from "../../components/SegmentedTabs";
import { OPS_TICKETS_VIEW_KEY, OPS_TICKETS_DEFAULT_VIEW, OPS_TOOLBAR_CARD, type OpsTicketsView } from "./constants";
import { shortNo, fmtDateTime } from "../../utils/format";
import { remainingView } from "./ticketUtils";
import { NEED_NOTE, PRIORITIES, PRIORITY_COLOR, SCOPE_OPTIONS, STATUSES, STATUS_COLOR, type OpsTicketGroupBy, type OpsTicketScope } from "./opsTickets.constants";
import { stripHtmlText } from "./opsTickets.utils";
import AssignOwnerModal, { type AssignOwnerCandidate } from "./components/ticket/AssignOwnerModal";
import CreateTicketModal from "./components/ticket/CreateTicketModal";
import EditTicketContentModal from "./components/ticket/EditTicketContentModal";
import OpsTicketDetailDrawer from "./components/ticket/OpsTicketDetailDrawer";
import PersonCell from "./components/ticket/PersonCell";
import TicketStatusNoteModal from "./components/ticket/TicketStatusNoteModal";

export default function OpsTicketsPage() {
	const { message: messageApi } = App.useApp();
	const [tickets, setTickets] = useState<OpsTicket[]>([]);
	const [loading, setLoading] = useState(false);
	const [scope, setScope] = useState<OpsTicketScope>("all");
	const [view, setView] = useState<OpsTicketsView>(() => {
		const saved = localStorage.getItem(OPS_TICKETS_VIEW_KEY);
		return saved === "table" || saved === "kanban" ? saved : OPS_TICKETS_DEFAULT_VIEW;
	});
	const [groupBy, setGroupBy] = useState<OpsTicketGroupBy>("status");
	const [bottomTab, setBottomTab] = useState("tickets");
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [priorityFilter, setPriorityFilter] = useState<string>();
	const [segmentFilter, setSegmentFilter] = useState<number>();
	const [segmentOptions, setSegmentOptions] = useState<{ id: number; name: string }[]>([]); // 全部环节(筛选下拉用)
	const [statusFilter, setStatusFilter] = useState<string>(); // 状态筛选 chip(undefined=全部)
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [total, setTotal] = useState(0);
	const [counts, setCounts] = useState<Record<string, number>>({}); // 各状态条数(状态 chip 用)
	const [overdueCount, setOverdueCount] = useState(0); // 延期 tab 角标
	const [detail, setDetail] = useState<OpsTicket | null>(null);
	const [detailLoading, setDetailLoading] = useState(false); // 详情打开/切换时的加载态(避免闪上一条数据)
	const [events, setEvents] = useState<OpsTicketEvent[]>([]);
	const [editContentOpen, setEditContentOpen] = useState(false); // 编辑需求说明
	const [editContentHtml, setEditContentHtml] = useState("");
	const [savingContent, setSavingContent] = useState(false);
	const [editingPriorityId, setEditingPriorityId] = useState<string | null>(null);

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
	const [segments, setSegments] = useState<OpsResponsibleSegment[]>([]);
	const [members, setMembers] = useState<OpsResponsibleMember[]>([]);
	const [form] = Form.useForm();
	const selectedSegmentId = Form.useWatch("segmentId", form) as number | undefined;
	const selectedProjectId = Form.useWatch("projectId", form) as string | undefined;

	const loadTickets = async () => {
		setLoading(true);
		try {
			const overdue = bottomTab === "overdue";
			const r = await opsApi.tickets({
				scope: overdue ? "overdue" : scope,
				page,
				pageSize: view === "kanban" ? 200 : pageSize, // 看板=有界概览(封顶 200)
				q: debouncedSearch.trim() || undefined,
				priority: priorityFilter,
				segment: segmentFilter,
				status: overdue ? undefined : statusFilter,
			});
			setTickets(r.tickets);
			setTotal(r.total ?? r.tickets.length);
			setCounts(r.counts || {});
		} catch (e) {
			messageApi.error(e instanceof Error ? e.message : "加载提单失败");
		} finally {
			setLoading(false);
		}
	};
	// 延期总数(底部 tab 角标用)
	const loadOverdueCount = async () => {
		try {
			const r = await opsApi.tickets({ scope: "overdue", page: 1, pageSize: 1 });
			setOverdueCount(r.total ?? 0);
		} catch {
			/* ignore */
		}
	};
	// 筛选/分页/视图/tab 变化 → 服务端重新拉(单一来源,避免重复请求:筛选变更已在各 onChange 里 setPage(1))
	useEffect(() => {
		void loadTickets();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scope, bottomTab, view, page, pageSize, statusFilter, priorityFilter, segmentFilter, debouncedSearch]);
	// 搜索去抖(并回到第 1 页)
	useEffect(() => {
		const t = setTimeout(() => {
			setDebouncedSearch(search);
			setPage(1);
		}, 400);
		return () => clearTimeout(t);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [search]);
	useEffect(() => {
		void loadOverdueCount();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// 记住用户选的视图(table/kanban)到本地
	useEffect(() => {
		localStorage.setItem(OPS_TICKETS_VIEW_KEY, view);
	}, [view]);

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
			void loadOverdueCount();
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
		setProjects([]);
		setSegments([]);
		setMembers([]);
		setOpen(true);
		const tn = await opsApi.tenants().catch(() => null);
		if (tn) setTenants(tn.tenants);
	};
	const onTenantChange = async (tenantId: string) => {
		form.setFieldsValue({ projectId: undefined, segmentId: undefined, ownerId: undefined });
		setProjects([]);
		setSegments([]);
		setMembers([]);
		const r = await opsApi.projects(tenantId).catch(() => null);
		if (r) setProjects(r.projects);
	};
	const onProjectChange = async (projectId: string) => {
		form.setFieldsValue({ segmentId: undefined, ownerId: undefined });
		setSegments([]);
		setMembers([]);
		const r = await opsApi.responsibles(projectId).catch(() => null);
		if (r) {
			setSegments(r.segments ?? []);
			setMembers(r.members ?? []);
		}
	};
	// 负责人选项:选了环节→该环节成员;没选环节→项目全部成员。带微信头像/网名供下拉「头像｜网名｜姓名」展示
	const ownerOptions = useMemo(() => {
		const segNameById = new Map(segments.map((s) => [s.id, s.name]));
		const toOpt = (m: OpsResponsibleMember) => ({
			value: m.id,
			label: m.wechatName ? `${m.wechatName}｜${m.name || m.username}` : m.name || m.username,
			avatar: m.wechatAvatar || "",
			wechatName: m.wechatName || "",
			name: m.name || m.username,
			username: m.username,
			segmentNames: (m.segmentIds || []).map((id) => segNameById.get(id)).filter(Boolean) as string[], // 该成员所属环节名(下拉显示)
		});
		if (selectedSegmentId) {
			const seg = segments.find((s) => s.id === selectedSegmentId);
			return (seg?.members ?? []).map(toOpt);
		}
		return (members ?? []).map(toOpt);
	}, [segments, members, selectedSegmentId]);
	// 先选负责人(未选环节)时,自动回填其所属环节(取第一个)
	const onOwnerChange = (ownerId?: string) => {
		if (!ownerId || selectedSegmentId) return;
		const segId = members.find((x) => x.id === ownerId)?.segmentIds?.[0];
		if (segId != null) form.setFieldsValue({ segmentId: segId });
	};
	const submit = async () => {
		const v = await form.validateFields();
		setSubmitting(true);
		try {
			await opsApi.createTicket(v as Parameters<typeof opsApi.createTicket>[0]);
			messageApi.success("提单已创建");
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
		return Boolean(
			String(v.title ?? "").trim() ||
				String(v.tenantId ?? "").trim() ||
				String(v.projectId ?? "").trim() ||
				v.segmentId != null ||
				String(v.ownerId ?? "").trim() ||
				(v.priority && v.priority !== "普通") ||
				stripHtmlText(v.contentHtml),
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

	// 列表/看板数据都由服务端按 scope/状态/筛选/分页返回,前端不再客户端过滤
	const segmentNames = useMemo(() => [...new Set(tickets.map((t) => t.tagName).filter(Boolean))], [tickets]);

	// 看板:列按 groupBy(状态/优先级/环节)动态分组
	const makeGroupColumns = (rows: OpsTicket[]) =>
		groupBy === "priority"
			? PRIORITIES.map((v) => ({ key: v, color: PRIORITY_COLOR[v], rows: rows.filter((t) => t.priority === v) }))
			: groupBy === "segment"
				? segmentNames.map((v) => ({ key: v, color: "cyan", rows: rows.filter((t) => t.tagName === v) }))
				: STATUSES.map((v) => ({ key: v, color: STATUS_COLOR[v], rows: rows.filter((t) => t.status === v) }));
	const renderKanban = (rows: OpsTicket[]) => (
		<div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
			{makeGroupColumns(rows).map((col) => (
				<div key={col.key} style={{ flex: "0 0 290px", maxWidth: 290, background: "#edeef2", border: "1px solid #e2e5ea", borderRadius: 10, padding: 8 }}>
					<div style={{ marginBottom: 8, padding: "2px 4px", fontWeight: 600 }}>
						<Tag color={col.color}>{col.key}</Tag>
						<span style={{ color: "#64748b" }}>{col.rows.length}</span>
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
						{col.rows.map((t) => {
							const rem = remainingView(t);
							return (
								<Card
									key={t.id}
									size="small"
									hoverable
									onClick={() => openDetail(t)}
									styles={{ body: { padding: 12 } }}
									style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.06)", border: "1px solid #e8eaed" }}>
									<div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", marginBottom: 2 }}>#{shortNo(t.id)}</div>
									<div style={{ fontWeight: 600, marginBottom: 6 }}>{t.title}</div>
									<Space size={4} wrap style={{ marginBottom: 6 }}>
										{groupBy !== "segment" ? <Tag color="cyan">{t.tagName}</Tag> : null}
										{groupBy !== "priority" ? <Tag color={PRIORITY_COLOR[t.priority]}>{t.priority}</Tag> : null}
										{groupBy !== "status" ? <Tag color={STATUS_COLOR[t.status]}>{t.status}</Tag> : null}
										<span style={{ color: rem.color ?? "#64748b", fontSize: 12 }}>{rem.text}</span>
									</Space>
									<div style={{ fontSize: 12, color: "#64748b", marginBottom: t.canEdit ? 6 : 0 }}>
										{t.client} · {t.projectName} · 负责人 {t.ownerName}
									</div>
									{t.canEdit ? statusControl(t, "100%") : null}
								</Card>
							);
						})}
						{col.rows.length === 0 ? (
							<Typography.Text type="secondary" style={{ fontSize: 12 }}>
								无
							</Typography.Text>
						) : null}
					</div>
				</div>
			))}
		</div>
	);

	// 表格
	// 「提单人/负责人」列:微信头像 + 姓名(无头像回退首字母)
	const personCell = (avatar?: string, name?: string) => <PersonCell avatar={avatar} name={name} />;
	const baseColumns = [
		{
			title: "单号",
			dataIndex: "id",
			width: 116,
			render: (id: string) => (
				<Tooltip title={id}>
					<span style={{ fontFamily: "monospace", fontSize: 12, color: "#475569" }}>#{shortNo(id)}</span>
				</Tooltip>
			),
		},
		{ title: "标题", dataIndex: "title", width: 180, ellipsis: true },
		{ title: "客户", dataIndex: "client", width: 110, ellipsis: true },
		{ title: "项目", dataIndex: "projectName", width: 130, ellipsis: true },
		{ title: "提单人", dataIndex: "requesterName", width: 120, render: (v: string, r: OpsTicket) => personCell(r.requesterAvatar, v) },
		{ title: "环节", dataIndex: "tagName", width: 100, render: (v: string) => <Tag color="cyan">{v}</Tag> },
		{ title: "负责人", dataIndex: "ownerName", width: 120, render: (v: string, r: OpsTicket) => personCell(r.ownerAvatar, v) },
		{ title: "优先级", dataIndex: "priority", width: 120, render: (_: string, r: OpsTicket) => priorityControl(r, 88) },
		{ title: "创建时间", dataIndex: "createdAt", width: 160, render: (v: string) => fmtDateTime(v) },
		{
			title: "剩余",
			key: "rem",
			width: 100,
			render: (_: unknown, r: OpsTicket) => {
				const x = remainingView(r);
				return <span style={{ color: x.color, fontWeight: x.color ? 600 : 400 }}>{x.text}</span>;
			},
		},
		{ title: "状态", key: "status", width: 120, render: (_: unknown, r: OpsTicket) => statusControl(r, 108) },
	];
	const tableProps = {
		rowKey: "id" as const,
		dataSource: tickets,
		columns: baseColumns,
		size: "small" as const,
		loading,
		pagination: {
			current: page,
			pageSize,
			total,
			showSizeChanger: true,
			showTotal: (t: number) => `共 ${t} 条`,
			onChange: (p: number, ps: number) => {
				setPage(p);
				setPageSize(ps);
			},
		},
		scroll: { x: 1340 },
		onRow: (r: OpsTicket) => ({
			onClick: () => {
				if (window.getSelection()?.toString()) return;
				openDetail(r);
			},
			style: { cursor: "pointer" },
		}),
	};

	// 状态筛选 chip(替代旧的"按状态折叠";数量来自服务端 counts)
	const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);
	const statusChips = (
		<Space wrap style={{ marginBottom: 12 }}>
			<Tag.CheckableTag
				checked={!statusFilter}
				onChange={() => {
					setStatusFilter(undefined);
					setPage(1);
				}}>
				全部 {totalAll}
			</Tag.CheckableTag>
			{STATUSES.map((st) => (
				<Tag.CheckableTag
					key={st}
					checked={statusFilter === st}
					onChange={() => {
						setStatusFilter(statusFilter === st ? undefined : st);
						setPage(1);
					}}>
					{st} {counts[st] || 0}
				</Tag.CheckableTag>
			))}
		</Space>
	);

	const sheetTabs = [
		{ key: "tickets", label: "需求提单" },
		{ key: "overdue", label: `延期任务预警${overdueCount ? ` (${overdueCount})` : ""}` },
	];

	return (
		<div style={{ paddingBottom: 52 }}>
			<div style={{ ...OPS_TOOLBAR_CARD, justifyContent: "space-between" }}>
				<Space wrap>
					<SegmentedTabs
						value={scope}
						onChange={(v) => {
							setScope(v);
							setPage(1);
						}}
						options={SCOPE_OPTIONS}
					/>
					{view === "kanban" ? (
						<Segmented
							options={[
								{ label: "按状态", value: "status" },
								{ label: "按优先级", value: "priority" },
								{ label: "按环节", value: "segment" },
							]}
							value={groupBy}
							onChange={(v) => setGroupBy(v as OpsTicketGroupBy)}
						/>
					) : null}
					<Input.Search placeholder="搜索 单号/标题/项目/客户/人" allowClear style={{ width: 240 }} onChange={(e) => setSearch(e.target.value)} />
					<Select
						allowClear
						placeholder="环节"
						style={{ width: 110 }}
						value={segmentFilter}
						onChange={(v) => {
							setSegmentFilter(v);
							setPage(1);
						}}
						showSearch
						optionFilterProp="label"
						options={segmentOptions.map((s) => ({ value: s.id, label: s.name }))}
					/>
					<Select
						allowClear
						placeholder="优先级"
						style={{ width: 110 }}
						value={priorityFilter}
						onChange={(v) => {
							setPriorityFilter(v);
							setPage(1);
						}}
						options={PRIORITIES.map((p) => ({ value: p, label: p }))}
					/>
				</Space>
				<Space>
					<Button type="primary" onClick={openCreate}>
						+ 新建工单
					</Button>
					<Segmented
						options={[
							{ value: "table", icon: <BarsOutlined /> },
							{ value: "kanban", icon: <ProjectOutlined /> },
						]}
						value={view}
						onChange={(v) => setView(v as "kanban" | "table")}
					/>
				</Space>
			</div>

			{view === "kanban" ? (
				<>
					{total > tickets.length ? (
						<Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
							看板仅展示前 {tickets.length} 条(共 {total} 条),查看全部请切换到列表视图
						</Typography.Text>
					) : null}
					{renderKanban(tickets)}
				</>
			) : (
				<>
					{bottomTab === "tickets" ? statusChips : null}
					<Table {...tableProps} />
				</>
			)}

			{/* 固定在底部的工作表式标签栏(类似 Excel:圆角折页 Tab,选中白底连着内容,无顶部高亮线) */}
			<div
				style={{
					position: "fixed",
					left: 200,
					right: 0,
					bottom: 0,
					height: 34,
					background: "#eceef1",
					borderTop: "1px solid #dfe3e8",
					display: "flex",
					alignItems: "flex-end",
					gap: 4,
					padding: "0 12px",
					zIndex: 20,
				}}>
				{sheetTabs.map((t) => {
					const active = bottomTab === t.key;
					return (
						<div
							key={t.key}
							onClick={() => {
								setBottomTab(t.key);
								setPage(1);
							}}
							style={{
								display: "flex",
								alignItems: "center",
								height: active ? 34 : 27,
								marginTop: active ? -1 : 0,
								padding: "0 18px",
								cursor: "pointer",
								fontSize: 13,
								fontWeight: active ? 600 : 400,
								color: active ? "#0f766e" : "#5c6470",
								background: active ? "#fff" : "#e2e5ea",
								border: "1px solid #dfe3e8",
								borderBottom: "none",
								borderRadius: "8px 8px 0 0",
								boxShadow: active ? "0 -1px 3px rgba(15,118,110,0.08)" : "none",
							}}>
							{t.label}
						</div>
					);
				})}
			</div>

			<OpsTicketDetailDrawer
				detail={detail}
				loading={detailLoading}
				events={events}
				statusControl={statusControl}
				priorityControl={priorityControl}
				personCell={personCell}
				onClose={() => setDetail(null)}
				onAssign={openAssign}
				onEditContent={openEditContent}
			/>

			<EditTicketContentModal open={editContentOpen} value={editContentHtml} saving={savingContent} projectId={detail?.projectId} onChange={setEditContentHtml} onSave={saveContent} onCancel={() => setEditContentOpen(false)} />

			<TicketStatusNoteModal open={!!noteId} status={noteStatus} value={noteText} onChange={setNoteText} onConfirm={confirmNote} onCancel={() => setNoteId(null)} />

			<AssignOwnerModal open={assignOpen} candidates={assignCandidates} ownerId={assignOwnerId} assigning={assigning} onOwnerChange={setAssignOwnerId} onConfirm={confirmAssign} onCancel={() => setAssignOpen(false)} />

			<CreateTicketModal
				open={open}
				submitting={submitting}
				form={form}
				tenants={tenants}
				projects={projects}
				segments={segments}
				ownerOptions={ownerOptions}
				selectedProjectId={selectedProjectId}
				onTenantChange={onTenantChange}
				onProjectChange={onProjectChange}
				onSegmentChange={() => form.setFieldsValue({ ownerId: undefined })}
				onOwnerChange={onOwnerChange}
				onSubmit={submit}
				onCancel={closeCreate}
			/>
		</div>
	);
}
