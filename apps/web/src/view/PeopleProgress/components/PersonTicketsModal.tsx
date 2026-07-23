import { useEffect, useMemo, useState } from "react";
import { Avatar, Checkbox, Descriptions, Divider, Drawer, Input, Modal, Select, Space, Spin, Table, Tag, Timeline, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import SegmentedTabs from "../../../components/SegmentedTabs";
import { opsApi } from "../../../api/modules/ops";
import type { OpsTicket, OpsTicketEvent } from "../../../api/modules/ops";
import RichContentView from "../../../components/RichContentView";
import { fmtDateTime } from "../../../utils/format";
import { stageRangeLabel } from "../../ProjectPool/deadlineUtils";
import { remainingView } from "../../Tickets/ticketUtils";
import type { PeopleProgressRow, PeopleTicketStatus } from "../types";

type PersonTicketsModalProps = {
	open: boolean;
	person: PeopleProgressRow | null;
	role: string;
	onClose: () => void;
};

const STATUS_OPTIONS: { label: string; value: PeopleTicketStatus }[] = [
	{ label: "全部", value: "all" },
	{ label: "进行中", value: "doing" },
	{ label: "排队中", value: "queued" },
	{ label: "逾期", value: "overdue" },
];

const hasTextSelection = () => window.getSelection()?.toString().trim();

export default function PersonTicketsModal({ open, person, role, onClose }: PersonTicketsModalProps) {
	const [tickets, setTickets] = useState<OpsTicket[]>([]);
	const [loading, setLoading] = useState(false);
	const [status, setStatus] = useState<PeopleTicketStatus>("all");
	const [projectKeys, setProjectKeys] = useState<string[]>(["all"]);
	const [query, setQuery] = useState("");
	const [detail, setDetail] = useState<OpsTicket | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [events, setEvents] = useState<OpsTicketEvent[]>([]);

	const loadTickets = async () => {
		if (!person) return;
		setLoading(true);
		try {
			const response = await opsApi.peopleProgressTickets(person.userId, { role, status, q: query.trim() || undefined });
			setTickets(response.tickets);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (!open) {
			setTickets([]);
			setStatus("all");
			setProjectKeys(["all"]);
			setQuery("");
			setDetail(null);
			setEvents([]);
			return;
		}
		void loadTickets();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, person?.userId, role, status]);

	const ticketProjectKey = (ticket: OpsTicket) => ticket.projectId || ticket.projectName || "unknown";
	const projectOptions = useMemo(() => {
		const groups = new Map<string, { label: string; count: number }>();
		for (const ticket of tickets) {
			const key = ticketProjectKey(ticket);
			const current = groups.get(key);
			if (current) {
				current.count += 1;
			} else {
				groups.set(key, { label: ticket.projectName || "未关联项目", count: 1 });
			}
		}
		return [
			{ value: "all", label: `全部项目(${groups.size})` },
			...[...groups.entries()].map(([value, item]) => ({ value, label: `${item.label} (${item.count})` })),
		];
	}, [tickets]);

	useEffect(() => {
		if (!projectKeys.length || projectKeys.includes("all")) return;
		const optionSet = new Set(projectOptions.map((item) => item.value));
		const validKeys = projectKeys.filter((key) => optionSet.has(key));
		if (validKeys.length !== projectKeys.length) setProjectKeys(validKeys.length ? validKeys : ["all"]);
	}, [projectKeys, projectOptions]);

	const visibleTickets = useMemo(() => {
		if (!projectKeys.length || projectKeys.includes("all")) return tickets;
		const selectedProjects = new Set(projectKeys);
		return tickets.filter((ticket) => selectedProjects.has(ticketProjectKey(ticket)));
	}, [projectKeys, tickets]);
	const projectValueOptions = useMemo(() => projectOptions.filter((item) => item.value !== "all"), [projectOptions]);
	const projectValues = useMemo(() => projectValueOptions.map((item) => item.value), [projectValueOptions]);

	const handleProjectChange = (values: string[]) => {
		if (values.includes("all") && values.length === 1) {
			setProjectKeys(["all"]);
			return;
		}
		setProjectKeys(values.filter((value) => value !== "all"));
	};
	const openDetail = (ticket: OpsTicket) => {
		setDetail(ticket);
		setDetailLoading(true);
		setEvents([]);
		Promise.all([
			opsApi
				.ticketContent(ticket.id)
				.then((response) => setDetail((current) => (current?.id === ticket.id ? { ...current, contentHtml: response.contentHtml } : current)))
				.catch(() => {}),
			opsApi
				.ticketEvents(ticket.id)
				.then((response) => setEvents(response.events))
				.catch(() => setEvents([])),
		]).finally(() => setDetailLoading(false));
	};

	const columns: ColumnsType<OpsTicket> = [
		{
			title: "序号",
			width: 52,
			fixed: "left",
			align: "center",
			render: (_, __, index) => <span style={{ color: "#2563eb", fontWeight: 700 }}>{index + 1}</span>,
		},
		{
			title: "提单人",
			dataIndex: "requesterName",
			width: 130,
			fixed: "left",
			render: (_, ticket) => (
				<Space size={6}>
					<Avatar size={20} src={ticket.requesterAvatar || undefined} />
					<span>{ticket.requesterName || "-"}</span>
				</Space>
			),
		},
		{
			title: "项目",
			dataIndex: "projectName",
			width: 180,
			fixed: "left",
			render: (value) => <span style={{ color: value ? "#334155" : "#94a3b8", fontWeight: 600 }}>{value || "-"}</span>,
		},
		{
			title: "工单",
			dataIndex: "title",
			width: 200,
			render: (value) => <span style={{ fontWeight: 700 }}>{value}</span>,
		},
		{
			title: "阶段",
			dataIndex: "projectStage",
			width: 190,
			render: (value) => (value ? <Tag color="blue">{stageRangeLabel(value)}</Tag> : <span style={{ color: "#94a3b8" }}>-</span>),
		},
		{
			title: "环节",
			dataIndex: "tagName",
			width: 120,
			render: (value) => <Tag color="cyan">{value}</Tag>,
		},
		{
			title: "剩余",
			width: 110,
			sorter: (a, b) => (a.remainingHours ?? 999999) - (b.remainingHours ?? 999999),
			render: (_, ticket) => {
				const view = remainingView(ticket);
				return <span style={{ color: view.color, fontWeight: view.color ? 700 : 500 }}>{view.text}</span>;
			},
		},
		{
			title: "状态",
			dataIndex: "status",
			width: 90,
			render: (value) => <Tag color={value === "进行中" ? "green" : value === "排队中" ? "blue" : "orange"}>{value}</Tag>,
		},
		{
			title: "创建时间",
			dataIndex: "createdAt",
			width: 150,
			sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
			render: (value) => fmtDateTime(value),
		},
	];

	return (
		<>
			<Modal
				title={
					person ? (
						<Space size={8}>
							<Avatar src={person.avatar || undefined}>{person.name.slice(0, 1)}</Avatar>
							<span>{person.name} 的工单</span>
						</Space>
					) : (
						"人员工单"
					)
				}
				open={open}
				onCancel={onClose}
				footer={null}
				width="60%"
				centered
				styles={{ body: { height: 660, overflow: "hidden", display: "flex", flexDirection: "column" } }}
				destroyOnHidden>
				<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
					<SegmentedTabs value={status} options={STATUS_OPTIONS} onChange={setStatus} />
					<Select
						mode="multiple"
						showSearch
						value={projectKeys}
						options={projectOptions}
						style={{ width: 320 }}
						maxTagCount="responsive"
						optionFilterProp="label"
						onChange={handleProjectChange}
						optionRender={(option) => (
							<Space size={8}>
								<Checkbox checked={projectKeys.includes(String(option.value))} />
								<span>{option.label}</span>
							</Space>
						)}
						popupRender={(menu) => (
							<div>
								<div
									style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderBottom: "1px solid #eef2f7" }}
									onMouseDown={(event) => event.preventDefault()}>
									<button
										type="button"
										style={{ border: 0, background: "transparent", color: "#1677ff", cursor: "pointer", padding: 0 }}
										onClick={() => setProjectKeys(projectValues.length ? projectValues : ["all"])}>
										全选
									</button>
									<button
										type="button"
										style={{ border: 0, background: "transparent", color: "#1677ff", cursor: "pointer", padding: 0 }}
										onClick={() => {
											const selected = new Set(projectKeys.includes("all") ? projectValues : projectKeys);
											const inverted = projectValues.filter((value) => !selected.has(value));
											setProjectKeys(inverted.length ? inverted : ["all"]);
										}}>
										反选
									</button>
									<button
										type="button"
										style={{ border: 0, background: "transparent", color: "#64748b", cursor: "pointer", padding: 0 }}
										onClick={() => setProjectKeys(["all"])}>
										清空
									</button>
								</div>
								{menu}
							</div>
						)}
					/>
					<Input.Search
						allowClear
						value={query}
						placeholder="搜索项目/标题"
						style={{ width: 220 }}
						onChange={(event) => setQuery(event.target.value)}
						onSearch={() => void loadTickets()}
					/>
				</div>
				<div style={{ flex: 1, minHeight: 0 }}>
					<Spin spinning={loading}>
						<Table
							rowKey="id"
							size="small"
							columns={columns}
							dataSource={visibleTickets}
							pagination={{ pageSize: 10, showSizeChanger: false }}
							scroll={{ x: 1090, y: 480 }}
							onRow={(ticket) => ({
								onClick: () => {
									if (hasTextSelection()) return;
									openDetail(ticket);
								},
								style: { cursor: "pointer" },
							})}
						/>
					</Spin>
				</div>
			</Modal>
			<Drawer title={detail?.title || "工单详情"} open={Boolean(detail)} onClose={() => setDetail(null)} size={480} destroyOnHidden>
				{detail ? (
					<Spin spinning={detailLoading}>
						<Descriptions column={1} size="small" bordered>
							<Descriptions.Item label="单号">
								<Typography.Text copyable={{ text: detail.id }} style={{ fontFamily: "monospace", fontSize: 12 }}>
									{detail.id}
								</Typography.Text>
							</Descriptions.Item>
							<Descriptions.Item label="客户">{detail.client || "-"}</Descriptions.Item>
							<Descriptions.Item label="项目">{detail.projectName || "-"}</Descriptions.Item>
							<Descriptions.Item label="阶段">{detail.projectStage ? <Tag color="blue">{stageRangeLabel(detail.projectStage)}</Tag> : "-"}</Descriptions.Item>
							<Descriptions.Item label="环节">
								<Tag color="cyan">{detail.tagName}</Tag>
							</Descriptions.Item>
							<Descriptions.Item label="提单人">
								<Space size={6}>
									<Avatar size={22} src={detail.requesterAvatar || undefined} />
									<span>{detail.requesterName || "-"}</span>
								</Space>
							</Descriptions.Item>
							<Descriptions.Item label="负责人">
								<Space size={6}>
									<Avatar size={22} src={detail.ownerAvatar || undefined} />
									<span>{detail.ownerName || "-"}</span>
								</Space>
							</Descriptions.Item>
							<Descriptions.Item label="优先级">{detail.priority || "-"}</Descriptions.Item>
							<Descriptions.Item label="状态">
								<Tag color={detail.status === "进行中" ? "green" : detail.status === "排队中" ? "blue" : "orange"}>{detail.status}</Tag>
							</Descriptions.Item>
							<Descriptions.Item label="创建时间">{fmtDateTime(detail.createdAt)}</Descriptions.Item>
							<Descriptions.Item label="剩余时间">
								{(() => {
									const view = remainingView(detail);
									return <span style={{ color: view.color, fontWeight: view.color ? 700 : 500 }}>{view.text}</span>;
								})()}
							</Descriptions.Item>
						</Descriptions>
						<Typography.Title level={5} style={{ marginTop: 18 }}>
							需求说明
						</Typography.Title>
						{detail.contentHtml ? (
							<RichContentView html={detail.contentHtml} textViewable linkText="点击查看需求(含图片/视频)" modalTitle={`需求说明 · ${detail.title}`} modalWidth={900} inlineClassName="text-sm leading-relaxed font-bold" />
						) : detail.summary ? (
							<div style={{ whiteSpace: "pre-wrap", fontWeight: 600 }}>{detail.summary}</div>
						) : (
							<Typography.Text type="secondary">空</Typography.Text>
						)}
						<Divider style={{ margin: "18px 0 14px" }} />
						<Typography.Title level={5} style={{ marginTop: 0 }}>
							流转记录
						</Typography.Title>
						{events.length ? (
							<Timeline
								items={events.map((event) => ({
									color: event.toStatus === "已完成" ? "green" : event.toStatus === "阻塞" ? "red" : "blue",
									content: (
										<div>
											<span style={{ fontWeight: 600 }}>{event.actorName || "系统"}</span> {event.action}
											{event.fromStatus && event.toStatus ? <span style={{ color: "#64748b" }}>，状态「{event.fromStatus}」→「{event.toStatus}」</span> : null}
											{event.note ? <div style={{ color: "#475569" }}>备注：{event.note}</div> : null}
											<div style={{ color: "#94a3b8", fontSize: 12 }}>{fmtDateTime(event.createdAt)}</div>
										</div>
									),
								}))}
							/>
						) : (
							<Typography.Text type="secondary">暂无记录</Typography.Text>
						)}
					</Spin>
				) : null}
			</Drawer>
		</>
	);
}
