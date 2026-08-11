import { useEffect, useMemo, useState } from "react";
import { Avatar, Button, Checkbox, Input, Space, Table, Tag } from "antd";
import { FilterFilled, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { PeopleProgressRow } from "../types";

type PeopleWorkloadTableProps = {
	rows: PeopleProgressRow[];
	loading: boolean;
	role: string;
	query: string;
	onOpenTickets: (row: PeopleProgressRow) => void;
	onOpenProjects: (row: PeopleProgressRow) => void;
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
const hiddenRoleLabels = new Set(["管理员", "外包"]);
const hasRoleLabel = (roles: string[] | undefined, target: string) => (roles || []).some((role) => String(role || "").trim() === target);
const visibleRoleLabels = (roles: string[] | undefined) => [...new Set((roles || []).map((role) => String(role || "").trim()).filter((role) => role && !hiddenRoleLabels.has(role)))];
const ratingRank = (rating?: string) => {
	const value = String(rating || "").trim().toUpperCase();
	if (!value) return 999;
	const first = value.charCodeAt(0);
	if (first >= 65 && first <= 90) return first - 65;
	return 500 + value.charCodeAt(0);
};
const normalizeScopeValue = (value: unknown) => String(value || "").trim();
const scopeFilterValues = (scope: { id?: string; name?: string; code?: string }) =>
	[scope.id, scope.name, scope.code].map(normalizeScopeValue).filter(Boolean);
const ratingStyle = (rating?: string) => {
	switch (String(rating || "").trim().toUpperCase()) {
		case "A":
			return { color: "#047857", background: "#ecfdf5", borderColor: "#a7f3d0" };
		case "B":
			return { color: "#0369a1", background: "#f0f9ff", borderColor: "#bae6fd" };
		case "C":
			return { color: "#c2410c", background: "#fff7ed", borderColor: "#fed7aa" };
		case "D":
			return { color: "#6d28d9", background: "#f5f3ff", borderColor: "#ddd6fe" };
		default:
			return { color: "#475569", background: "#f8fafc", borderColor: "#e2e8f0" };
	}
};

export default function PeopleWorkloadTable({ rows, loading, role, query, onOpenTickets, onOpenProjects, onQueryChange, onSearch }: PeopleWorkloadTableProps) {
	const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
	const [selectedBusinessScopes, setSelectedBusinessScopes] = useState<string[]>([]);
	const [selectedRatings, setSelectedRatings] = useState<string[]>([]);

	const roleOptions = useMemo(() => {
		const labels = new Set<string>();
		rows.forEach((row) => {
			visibleRoleLabels(row.roles).forEach((label) => labels.add(label));
		});
		return [...labels]
			.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
			.map((label) => ({ text: label, value: label }));
	}, [rows]);

	useEffect(() => {
		const availableValues = new Set(roleOptions.map((option) => String(option.value)));
		setSelectedRoles((values) => values.filter((value) => availableValues.has(value)));
	}, [roleOptions]);

	const businessScopeOptions = useMemo(() => {
		const scopeMap = new Map<string, string>();
		rows.forEach((row) => {
			row.businessScopes?.forEach((scope) => {
				const id = normalizeScopeValue(scope.id || scope.name);
				const name = normalizeScopeValue(scope.name);
				if (id && name) scopeMap.set(id, name);
			});
		});
		return [...scopeMap.entries()]
			.map(([value, text]) => ({ text, value }))
			.sort((a, b) => a.text.localeCompare(b.text, "zh-Hans-CN"));
	}, [rows]);

	useEffect(() => {
		const availableValues = new Set(businessScopeOptions.map((option) => String(option.value)));
		setSelectedBusinessScopes((values) => values.filter((value) => availableValues.has(value)));
	}, [businessScopeOptions]);

	const ratingOptions = useMemo(() => {
		const ratings = new Set<string>();
		rows.forEach((row) => {
			const rating = String(row.rating || "").trim();
			if (rating) ratings.add(rating);
		});
		return [...ratings]
			.sort((a, b) => ratingRank(a) - ratingRank(b) || a.localeCompare(b, "zh-Hans-CN"))
			.map((rating) => ({ text: rating, value: rating }));
	}, [rows]);

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
			filteredValue: query.trim() ? [query.trim()] : null,
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
						{hasRoleLabel(row.roles, "外包") ? (
							<Tag style={{ marginInlineEnd: 0, color: "#9a3412", borderColor: "#fb923c", background: "#ffedd5", fontWeight: 600 }}>
								外包
							</Tag>
						) : null}
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
			filteredValue: selectedRoles.length ? selectedRoles : null,
			filterIcon: () => <FilterFilled style={{ color: selectedRoles.length ? "#dc2626" : "#94a3b8" }} />,
			filterDropdown: () => (
				<div style={{ padding: 10, minWidth: 130, maxWidth: 220 }}>
					<Checkbox.Group
						value={selectedRoles}
						onChange={(values) => setSelectedRoles(values.map(String))}
						style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
						{roleOptions.map((option) => (
							<Checkbox key={String(option.value)} value={String(option.value)}>
								{option.text}
							</Checkbox>
						))}
					</Checkbox.Group>
					{selectedRoles.length ? (
						<Button type="link" size="small" style={{ padding: 0, marginTop: 8 }} onClick={() => setSelectedRoles([])}>
							清空
						</Button>
					) : null}
				</div>
			),
			onFilter: (value, row) => visibleRoleLabels(row.roles).includes(String(value)),
			render: (roles: string[]) => {
				const labels = visibleRoleLabels(roles);
				return labels.length ? (
					labels.map((role) => (
						<Tag key={role} style={{ marginRight: "10px" }}>
							{role}
						</Tag>
					))
				) : (
					<span style={{ color: "#94a3b8" }}>-</span>
				);
			},
		},
		{
			title: "业务范围",
			dataIndex: "businessScopes",
			width: 170,
			filteredValue: selectedBusinessScopes.length ? selectedBusinessScopes : null,
			filterIcon: () => <FilterFilled style={{ color: selectedBusinessScopes.length ? "#dc2626" : "#94a3b8" }} />,
			filterDropdown: () => (
				<div style={{ padding: 10, minWidth: 140, maxWidth: 220 }}>
					<Checkbox.Group
						value={selectedBusinessScopes}
						onChange={(values) => setSelectedBusinessScopes(values.map(String))}
						style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
						{businessScopeOptions.map((option) => (
							<Checkbox key={String(option.value)} value={String(option.value)}>
								{option.text}
							</Checkbox>
						))}
					</Checkbox.Group>
					{selectedBusinessScopes.length ? (
						<Button type="link" size="small" style={{ padding: 0, marginTop: 8 }} onClick={() => setSelectedBusinessScopes([])}>
							清空
						</Button>
					) : null}
				</div>
			),
			onFilter: (value, row) => {
				const selected = normalizeScopeValue(value);
				return Boolean(row.businessScopes?.some((scope) => scopeFilterValues(scope).includes(selected)));
			},
			render: (_, row) =>
				row.businessScopes?.length ? (
					<span style={{ color: "#475569", fontWeight: 600 }}>{row.businessScopes.map((scope) => scope.name).join(" / ")}</span>
				) : (
					<span style={{ color: "#94a3b8" }}>-</span>
				),
		},
		{
			title: "评级",
			dataIndex: "rating",
			width: 80,
			filteredValue: selectedRatings.length ? selectedRatings : null,
			filterIcon: () => <FilterFilled style={{ color: selectedRatings.length ? "#dc2626" : "#94a3b8" }} />,
			filterDropdown: () => (
				<div style={{ padding: 10, minWidth: 110 }}>
					<Checkbox.Group
						value={selectedRatings}
						onChange={(values) => setSelectedRatings(values.map(String))}
						style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{ratingOptions.map((option) => (
							<Checkbox key={String(option.value)} value={String(option.value)}>
								{option.text}
							</Checkbox>
						))}
					</Checkbox.Group>
					{selectedRatings.length ? (
						<Button type="link" size="small" style={{ padding: 0, marginTop: 8 }} onClick={() => setSelectedRatings([])}>
							清空
						</Button>
					) : null}
				</div>
			),
			onFilter: (value, row) => String(row.rating || "").trim() === String(value),
			sorter: (a, b) => ratingRank(a.rating) - ratingRank(b.rating) || a.name.localeCompare(b.name, "zh-Hans-CN"),
			render: (value?: string) =>
				value ? (
					<Tag style={{ margin: 0, minWidth: 28, textAlign: "center", fontWeight: 800, ...ratingStyle(value) }}>{value}</Tag>
				) : (
					<span style={{ color: "#94a3b8" }}>-</span>
				),
		},
		...(role === "program"
			? [
					{
						title: "项目数",
						dataIndex: "projectCount",
						width: 100,
						sorter: (a: PeopleProgressRow, b: PeopleProgressRow) => a.projectCount - b.projectCount,
						defaultSortOrder: "descend" as const,
						render: (value: number, row: PeopleProgressRow) => (
							<button
								type="button"
								disabled={!value}
								onClick={(event) => {
									event.stopPropagation();
									if (value) onOpenProjects(row);
								}}
								style={{
									border: 0,
									background: "transparent",
									padding: 0,
									color: value > 0 ? "#0f766e" : "#94a3b8",
									fontWeight: value > 0 ? 700 : 500,
									cursor: value > 0 ? "pointer" : "default",
								}}>
								{value}
								{value > 0 ? <span style={{ marginLeft: 8, color: "#2563eb", fontWeight: 500 }}>查看</span> : null}
							</button>
						),
					},
				]
			: []),
		{
			title: "工单数",
			dataIndex: "ticketCount",
			width: 100,
			sorter: (a, b) => a.ticketCount - b.ticketCount,
			render: (value: number) => <span style={{ color: value > 0 ? "#2563eb" : "#94a3b8", fontWeight: value > 0 ? 700 : 500 }}>{value}</span>,
		},
		{
			title: "工单逾期",
			dataIndex: "overdue",
			width: 120,
			sorter: (a, b) => a.overdue - b.overdue,
			render: (value: number) => <span style={{ color: value > 0 ? "#dc2626" : "#64748b", fontWeight: value > 0 ? 700 : 500 }}>{value}</span>,
		},
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
					color: #dc2626;
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
				scroll={{ x: 1056, y: "calc(100vh - 250px)" }}
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
