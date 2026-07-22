import { Avatar, Button, Input, Space, Table, Tag } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { PeopleProgressRow } from "../types";

type PeopleWorkloadTableProps = {
	rows: PeopleProgressRow[];
	loading: boolean;
	query: string;
	onOpenTickets: (row: PeopleProgressRow) => void;
	onQueryChange: (query: string) => void;
	onSearch: (query: string) => void;
};

const badgeStyle = {
	fontSize: 12,
	fontWeight: 700,
	borderRadius: 999,
	padding: "0 6px",
	lineHeight: "18px",
};

const hasTextSelection = () => window.getSelection()?.toString().trim();

export default function PeopleWorkloadTable({ rows, loading, query, onOpenTickets, onQueryChange, onSearch }: PeopleWorkloadTableProps) {
	const columns: ColumnsType<PeopleProgressRow> = [
		{
			title: "序号",
			width: 46,
			fixed: "left",
			align: "center",
			render: (_, __, index) => <span style={{ color: "#2563eb", fontWeight: 700 }}>{index + 1}</span>,
		},
		{
			title: "人员",
			dataIndex: "name",
			width: 260,
			fixed: "left",
			filtered: Boolean(query.trim()),
			filterIcon: () => <SearchOutlined style={{ color: query.trim() ? "#2563eb" : "#94a3b8", fontSize: 15 }} />,
			filterDropdown: ({ close }) => (
				<div style={{ padding: 12, width: 300 }}>
					<Input
						allowClear
						autoFocus
						value={query}
						placeholder="搜索人员，多个用空格/逗号分隔"
						onChange={(event) => onQueryChange(event.target.value)}
						onPressEnter={() => {
							onSearch(query);
							close();
						}}
					/>
					<div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
						<Button
							type="link"
							size="small"
							onClick={() => {
								onQueryChange("");
								onSearch("");
								close();
							}}>
							清空
						</Button>
						<Button
							type="primary"
							size="small"
							onClick={() => {
								onSearch(query);
								close();
							}}>
							搜索
						</Button>
					</div>
				</div>
			),
			render: (_, row) => (
				<Space size={8}>
					<Avatar size={30} src={row.avatar || undefined} style={{ background: "#e2e8f0", color: "#475569" }}>
						{row.name.slice(0, 1)}
					</Avatar>
					<span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, whiteSpace: "nowrap" }}>
						<span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
						<span style={{ color: "#94a3b8", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{row.wechatName || row.username || "-"}</span>
						{row.isNewcomer ? <span style={{ ...badgeStyle, color: "#dc2626", border: "1px solid #ef4444", background: "#fff1f2", flex: "0 0 auto" }}>新</span> : null}
						{row.disabled ? (
							<Tag color="red" style={{ marginInlineEnd: 0 }}>
								已禁用
							</Tag>
						) : null}
					</span>
				</Space>
			),
		},
		{
			title: "角色",
			dataIndex: "roles",
			width: 180,
			render: (roles: string[]) =>
				roles?.length ? (
					roles.map((role) => (
						<Tag key={role} style={{ marginRight: "10px" }}>
							{role}
						</Tag>
					))
				) : (
					<span style={{ color: "#94a3b8" }}>-</span>
				),
		},
		{ title: "未完成", dataIndex: "unfinished", width: 110, sorter: (a, b) => a.unfinished - b.unfinished, defaultSortOrder: "descend" },
		{ title: "进行中", dataIndex: "doing", width: 110, sorter: (a, b) => a.doing - b.doing },
		{ title: "排队中", dataIndex: "queued", width: 110, sorter: (a, b) => a.queued - b.queued },
		{
			title: "工单逾期",
			dataIndex: "overdue",
			width: 120,
			sorter: (a, b) => a.overdue - b.overdue,
			render: (value: number) => <span style={{ color: value > 0 ? "#dc2626" : "#64748b", fontWeight: value > 0 ? 700 : 500 }}>{value}</span>,
		},
		{ title: "涉及项目", dataIndex: "projectCount", width: 120, sorter: (a, b) => a.projectCount - b.projectCount },
	];
	return (
		<>
			<style>{`
				.people-progress-table .ant-table-thead > tr > th,
				.people-progress-table .ant-table-thead > tr > th.ant-table-column-sort,
				.people-progress-table .ant-table-thead > tr > th.ant-table-cell {
					background: #fff !important;
					font-weight: 600;
				}
				.people-progress-table .ant-table-tbody > tr > td.ant-table-column-sort {
					background: #fff !important;
				}
				.people-progress-table .ant-table-column-sorters {
					background: transparent !important;
				}
				.people-progress-table .ant-table-column-sorter-up.active,
				.people-progress-table .ant-table-column-sorter-down.active {
					color: #0f766e;
				}
				.people-progress-table .ant-table-tbody > tr {
					cursor: pointer;
				}
				.people-progress-table .ant-table-tbody > tr:hover > td {
					background: #f8fafc !important;
				}
			`}</style>
			<Table
				className="people-progress-table"
				rowKey="userId"
				loading={loading}
				columns={columns}
				dataSource={rows}
				size="middle"
				pagination={false}
				scroll={{ x: 956, y: "calc(100vh - 250px)" }}
				style={{ background: "#fff" }}
				onRow={(row) => ({
					onClick: () => {
						if (hasTextSelection()) return;
						onOpenTickets(row);
					},
				})}
			/>
		</>
	);
}
