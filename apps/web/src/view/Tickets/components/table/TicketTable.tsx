import { useEffect, useState, type ReactNode } from "react";
import { Button, Input, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { EditOutlined, FilterFilled, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { SorterResult } from "antd/es/table/interface";
import type { OpsTicket } from "../../../../api/modules/ops";
import { shortNo, fmtDateTime } from "../../../../utils/format";
import { PRIORITIES } from "../../constants";
import { remainingView } from "../../ticketUtils";
import PersonCell from "./PersonCell";

type TicketTableProps = {
	tickets: OpsTicket[];
	loading: boolean;
	page: number;
	pageSize: number;
	total: number;
	titleSearch: string;
	projectSearch: string;
	requesterSearch: string;
	ownerSearch: string;
	statusFilter: string[];
	priorityFilter: string[];
	segmentFilter: number[];
	sortBy: "createdAt" | "remaining" | "";
	sortOrder: "asc" | "desc" | "";
	showAdminNote: boolean;
	segmentOptions: { id: number; name: string }[];
	statusControl: (ticket: OpsTicket, width?: number | string) => ReactNode;
	priorityControl: (ticket: OpsTicket, width?: number | string) => ReactNode;
	onTitleSearchChange: (value: string) => void;
	onProjectSearchChange: (value: string) => void;
	onRequesterSearchChange: (value: string) => void;
	onOwnerSearchChange: (value: string) => void;
	onStatusFilterChange: (value: string[]) => void;
	onPriorityFilterChange: (value: string[]) => void;
	onSegmentFilterChange: (value: number[]) => void;
	onSortChange: (sortBy: "createdAt" | "remaining" | "", sortOrder: "asc" | "desc" | "") => void;
	onPageChange: (page: number, pageSize: number) => void;
	onOpen: (ticket: OpsTicket) => void;
	onEditAdminNote?: (ticket: OpsTicket) => void;
};

function dropdownShell(children: ReactNode, width = 220) {
	return <div style={{ padding: 8, width }}>{children}</div>;
}

function dropdownActions(onClear: () => void, onConfirm: () => void) {
	return (
		<Space style={{ marginTop: 8, width: "100%", justifyContent: "space-between" }}>
			<Button type="link" size="small" onClick={onClear} style={{ padding: 0 }}>
				清空
			</Button>
			<Button type="primary" size="small" onClick={onConfirm}>
				搜索
			</Button>
		</Space>
	);
}

function HeaderSearchDropdown({ value, placeholder, onApply, confirm }: { value: string; placeholder: string; onApply: (value: string) => void; confirm: () => void }) {
	const [draft, setDraft] = useState(value);
	const [composing, setComposing] = useState(false);
	useEffect(() => {
		setDraft(value);
	}, [value]);
	const apply = (next: string) => {
		onApply(next);
		confirm();
	};
	return (
		<>
			<Input
				autoFocus
				allowClear
				placeholder={placeholder}
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onCompositionStart={() => setComposing(true)}
				onCompositionEnd={() => setComposing(false)}
				onPressEnter={() => {
					if (!composing) apply(draft);
				}}
			/>
			{dropdownActions(
				() => apply(""),
				() => apply(draft),
			)}
		</>
	);
}

export default function TicketTable({
	tickets,
	loading,
	page,
	pageSize,
	total,
	titleSearch,
	projectSearch,
	requesterSearch,
	ownerSearch,
	statusFilter,
	priorityFilter,
	segmentFilter,
	sortBy,
	sortOrder,
	showAdminNote,
	segmentOptions,
	statusControl,
	priorityControl,
	onTitleSearchChange,
	onProjectSearchChange,
	onRequesterSearchChange,
	onOwnerSearchChange,
	onStatusFilterChange,
	onPriorityFilterChange,
	onSegmentFilterChange,
	onSortChange,
	onPageChange,
	onOpen,
	onEditAdminNote = () => {},
}: TicketTableProps) {
	const personCell = (avatar?: string, name?: string) => <PersonCell avatar={avatar} name={name} />;
	const antdSortOrder = (key: "createdAt" | "remaining") => (sortBy === key ? (sortOrder === "asc" ? "ascend" : "descend") : null);
	const searchIcon = (filtered: boolean) => <SearchOutlined style={{ color: filtered ? "#1677ff" : "#94a3b8", fontSize: 15, strokeWidth: 2 }} />;
	const searchDropdown = (value: string, placeholder: string, onApply: (value: string) => void, confirm: () => void) =>
		dropdownShell(
			<HeaderSearchDropdown value={value} placeholder={placeholder} onApply={onApply} confirm={confirm} />,
			300,
		);
	const handleTableChange = (_pagination: unknown, _filters: unknown, sorter: SorterResult<OpsTicket> | SorterResult<OpsTicket>[], extra: { action: string }) => {
		if (extra.action !== "sort") return;
		const current = Array.isArray(sorter) ? sorter[0] : sorter;
		const key = current?.columnKey === "createdAt" || current?.columnKey === "remaining" ? current.columnKey : "";
		const order = current?.order === "ascend" ? "asc" : current?.order === "descend" ? "desc" : "";
		onSortChange(key, order);
	};
	const columns: ColumnsType<OpsTicket> = [
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
		...(showAdminNote
			? [
					{
						title: "内部备注",
						dataIndex: "adminNote",
						width: 180,
						ellipsis: true,
						render: (v: string, ticket: OpsTicket) => (
							<Space size={4} onClick={(e) => e.stopPropagation()}>
								{v ? (
									<Tooltip title={v}>
										<span style={{ display: "inline-block", maxWidth: 130, color: "#0f766e", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>{v}</span>
									</Tooltip>
								) : (
									<Typography.Text type="secondary">-</Typography.Text>
								)}
								<Button size="small" type="text" icon={<EditOutlined />} style={{ padding: 0, width: 22, color: "#0f766e" }} onClick={() => onEditAdminNote(ticket)} />
							</Space>
						),
					},
				]
			: []),
		{
			title: "标题",
			dataIndex: "title",
			width: 190,
			ellipsis: true,
			filteredValue: titleSearch ? [titleSearch] : null,
			filterIcon: (filtered) => searchIcon(filtered),
			filterDropdown: ({ confirm }) => searchDropdown(titleSearch, "搜索 单号/标题", onTitleSearchChange, confirm),
		},
		{
			title: "项目",
			dataIndex: "projectName",
			width: 210,
			ellipsis: true,
			filteredValue: projectSearch ? [projectSearch] : null,
			filterIcon: (filtered) => searchIcon(filtered),
			filterDropdown: ({ confirm }) => searchDropdown(projectSearch, "搜索 项目/客户", onProjectSearchChange, confirm),
			render: (_: string, ticket) => (
				<span>
					{ticket.projectName}
					{ticket.client ? <span style={{ color: "#64748b" }}> - {ticket.client}</span> : null}
				</span>
			),
		},
		{
			title: "提单人",
			dataIndex: "requesterName",
			width: 120,
			filteredValue: requesterSearch ? [requesterSearch] : null,
			filterIcon: (filtered) => searchIcon(filtered),
			filterDropdown: ({ confirm }) => searchDropdown(requesterSearch, "搜索 提单人", onRequesterSearchChange, confirm),
			render: (v: string, r) => personCell(r.requesterAvatar, v),
		},
		{
			title: "环节",
			dataIndex: "tagName",
			width: 110,
			filteredValue: segmentFilter.length ? segmentFilter.map(String) : null,
			filterIcon: (filtered) => <FilterFilled style={{ color: filtered ? "#1677ff" : "#94a3b8" }} />,
			filterDropdown: ({ confirm }) =>
				dropdownShell(
					<>
						<Select
							allowClear
							mode="multiple"
							showSearch
							optionFilterProp="label"
							placeholder="选择环节"
							style={{ width: "100%" }}
							value={segmentFilter}
							options={segmentOptions.map((segment) => ({ value: segment.id, label: segment.name }))}
							onChange={(value) => onSegmentFilterChange(value)}
						/>
						{dropdownActions(
							() => {
								onSegmentFilterChange([]);
								confirm();
							},
							() => confirm(),
						)}
					</>,
				),
			render: (v: string) => <Tag color="cyan">{v}</Tag>,
		},
		{
			title: "负责人",
			dataIndex: "ownerName",
			width: 120,
			filteredValue: ownerSearch ? [ownerSearch] : null,
			filterIcon: (filtered) => searchIcon(filtered),
			filterDropdown: ({ confirm }) => searchDropdown(ownerSearch, "搜索 负责人", onOwnerSearchChange, confirm),
			render: (v: string, r) => personCell(r.ownerAvatar, v),
		},
		{
			title: "优先级",
			dataIndex: "priority",
			width: 120,
			filteredValue: priorityFilter.length ? priorityFilter : null,
			filterIcon: (filtered) => <FilterFilled style={{ color: filtered ? "#1677ff" : "#94a3b8" }} />,
			filterDropdown: ({ confirm }) =>
				dropdownShell(
					<>
						<Select allowClear mode="multiple" placeholder="选择优先级" style={{ width: "100%" }} value={priorityFilter} options={PRIORITIES.map((p) => ({ value: p, label: p }))} onChange={onPriorityFilterChange} />
						{dropdownActions(
							() => {
								onPriorityFilterChange([]);
								confirm();
							},
							() => confirm(),
						)}
					</>,
				),
			render: (_: string, r) => priorityControl(r, 88),
		},
		{
			title: "创建时间",
			key: "createdAt",
			dataIndex: "createdAt",
			width: 160,
			sorter: true,
			sortOrder: antdSortOrder("createdAt"),
			render: (v: string) => fmtDateTime(v),
		},
		{
			title: "剩余",
			key: "remaining",
			width: 100,
			sorter: true,
			sortOrder: antdSortOrder("remaining"),
			render: (_: unknown, r) => {
				const x = remainingView(r);
				return <span style={{ color: x.color, fontWeight: x.color ? 600 : 400 }}>{x.text}</span>;
			},
		},
		{
			title: "状态",
			key: "status",
			width: 120,
			filteredValue: statusFilter.length ? statusFilter : null,
			filterIcon: (filtered) => <FilterFilled style={{ color: filtered ? "#1677ff" : "#94a3b8" }} />,
			filterDropdown: ({ confirm }) =>
				dropdownShell(
					<>
						<Select
							allowClear
							mode="multiple"
							placeholder="选择状态"
							style={{ width: "100%" }}
							value={statusFilter}
							options={["排队中", "进行中", "已完成"].map((status) => ({ value: status, label: status }))}
							onChange={onStatusFilterChange}
						/>
						{dropdownActions(
							() => {
								onStatusFilterChange([]);
								confirm();
							},
							() => confirm(),
						)}
					</>,
				),
			render: (_: unknown, r) => statusControl(r, 108),
		},
	];

	return (
		<>
			<style>
				{`
					.ops-ticket-table .ant-table-column-sorter-up.active,
					.ops-ticket-table .ant-table-column-sorter-down.active {
						color: #dc2626;
					}
					.ops-ticket-table .ant-table-thead > tr > th {
						background: #fff !important;
					}
				`}
			</style>
			<Table
				className="ops-ticket-table"
				rowKey="id"
				dataSource={tickets}
				columns={columns}
				size="small"
				loading={loading}
				pagination={{
					current: page,
					pageSize,
					total,
					showSizeChanger: true,
					showTotal: (value) => `共 ${value} 条`,
					onChange: onPageChange,
				}}
				scroll={{ x: 1420 }}
				onRow={(ticket) => ({
					onClick: () => {
						if (window.getSelection()?.toString()) return;
						onOpen(ticket);
					},
					style: { cursor: "pointer" },
				})}
				onChange={handleTableChange}
				locale={{ emptyText: <Typography.Text type="secondary">暂无工单</Typography.Text> }}
			/>
		</>
	);
}
