import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Avatar, Table, Tag, Typography } from "antd";
import type { ColumnsType, ColumnType } from "antd/es/table";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import { isNextDeadlineOverdue } from "../deadlineUtils";
import type { ProjectPoolGroup } from "../utils/groupProjectRows";

type GroupedProjectPoolViewProps = {
	groups: ProjectPoolGroup[];
	columns: ColumnsType<OpsProjectPoolRow>;
	loading: boolean;
	scrollY: number;
	hideStats?: boolean;
	onOpenLogs: (row: OpsProjectPoolRow) => void;
	onOpenGroupTickets: (group: ProjectPoolGroup, mode: "overdue" | "unfinished") => void;
};

type ProjectGroupTableRow =
	| { kind: "group"; key: string; group: ProjectPoolGroup }
	| { kind: "project"; key: string; groupKey: string; project: OpsProjectPoolRow; groupIndex: number };

const projectCellValue = (column: ColumnType<OpsProjectPoolRow>, row: OpsProjectPoolRow) => {
	const dataIndex = column.dataIndex;
	if (typeof dataIndex === "string") return row[dataIndex as keyof OpsProjectPoolRow];
	if (Array.isArray(dataIndex)) return dataIndex.reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[String(key)] : undefined), row);
	return undefined;
};

const groupLabel = (group: ProjectPoolGroup, collapsed: boolean, hideStats: boolean, onOpenGroupTickets: GroupedProjectPoolViewProps["onOpenGroupTickets"]) => (
	<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, width: "100%" }}>
		<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, position: "sticky", left: 16, zIndex: 2, background: "#fff", paddingRight: 12 }}>
			{collapsed ? <RightOutlined style={{ color: "#64748b", fontSize: 11 }} /> : <DownOutlined style={{ color: "#64748b", fontSize: 11 }} />}
			{group.avatar ? <Avatar size={22} src={group.avatar} /> : null}
			<span style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>{group.title}</span>
			<Tag color="blue" style={{ margin: 0 }}>
				{group.stats.projectCount} 个项目
			</Tag>
		</div>
		{hideStats ? null : <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", whiteSpace: "nowrap", position: "sticky", right: 12, background: "#fff" }}>
			<Tag color={group.stats.deadlineOverdue ? "red" : "default"} style={{ margin: 0, width: 92, textAlign: "center" }}>
				交付逾期 {group.stats.deadlineOverdue}
			</Tag>
			<Tag
				color={group.stats.ticketOverdue ? "red" : "default"}
				style={{ margin: 0, width: 92, textAlign: "center", cursor: group.stats.ticketOverdue ? "pointer" : "default" }}
				onClick={(event) => {
					event.stopPropagation();
					if (group.stats.ticketOverdue) onOpenGroupTickets(group, "overdue");
				}}>
				工单逾期 {group.stats.ticketOverdue}
			</Tag>
			<Tag
				color="default"
				style={{ margin: 0, width: 104, textAlign: "center", cursor: group.stats.ticketTotal ? "pointer" : "default" }}
				onClick={(event) => {
					event.stopPropagation();
					if (group.stats.ticketTotal) onOpenGroupTickets(group, "unfinished");
				}}>
				未完成工单 {group.stats.ticketTotal}
			</Tag>
		</div>}
	</div>
);

export default function GroupedProjectPoolView({ groups, columns, loading, scrollY, hideStats = false, onOpenLogs, onOpenGroupTickets }: GroupedProjectPoolViewProps) {
	const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set());
	const rows = useMemo<ProjectGroupTableRow[]>(() => {
		const nextRows: ProjectGroupTableRow[] = [];
		for (const group of groups) {
			nextRows.push({ kind: "group", key: `group-${group.key}`, group });
			if (!collapsedKeys.has(group.key)) {
				nextRows.push(...group.rows.map((project, groupIndex) => ({ kind: "project" as const, key: `project-${group.key}-${project.id}`, groupKey: group.key, project, groupIndex })));
			}
		}
		return nextRows;
	}, [collapsedKeys, groups]);

	const toggleGroup = (groupKey: string) => {
		setCollapsedKeys((prev) => {
			const next = new Set(prev);
			if (next.has(groupKey)) next.delete(groupKey);
			else next.add(groupKey);
			return next;
		});
	};

	const groupedColumns = useMemo<ColumnsType<ProjectGroupTableRow>>(
		() =>
			columns.map((column, columnIndex) => {
				const projectColumn = column as ColumnType<OpsProjectPoolRow>;
				const nextColumn: ColumnType<ProjectGroupTableRow> = {
					title: projectColumn.title as ColumnType<ProjectGroupTableRow>["title"],
					key: projectColumn.key,
					width: columnIndex === 0 ? 280 : projectColumn.width,
					align: projectColumn.align,
					fixed: projectColumn.fixed,
					className: projectColumn.className,
					filterDropdown: projectColumn.filterDropdown as ColumnType<ProjectGroupTableRow>["filterDropdown"],
					filterIcon: projectColumn.filterIcon as ColumnType<ProjectGroupTableRow>["filterIcon"],
					onCell: (row) => {
						if (row.kind === "group") return { colSpan: columnIndex === 0 ? columns.length : 0 };
						return projectColumn.onCell?.(row.project, 0) || {};
					},
					render: (_value: unknown, row, index) => {
						if (row.kind === "group") return columnIndex === 0 ? groupLabel(row.group, collapsedKeys.has(row.group.key), hideStats, onOpenGroupTickets) : null;
						const value = projectCellValue(projectColumn, row.project);
						if (projectColumn.render) return projectColumn.render(value, row.project, row.groupIndex) as ReactNode;
						return value as ReactNode;
					},
				};
				return nextColumn;
			}),
		[collapsedKeys, columns, hideStats, onOpenGroupTickets],
	);

	if (!loading && !groups.length) {
		return (
			<div style={{ textAlign: "center", padding: "48px 0" }}>
				<Typography.Text type="secondary">暂无项目</Typography.Text>
			</div>
		);
	}

	return (
		<>
			<style>{`
				.ops-pool-group-table .ant-table-thead > tr > th {
					background: #fff;
					font-weight: 600;
					padding-top: 11px;
					padding-bottom: 11px;
				}
				.ops-pool-group-table .ant-table-thead > tr > th:first-child {
					position: sticky;
					left: 0;
					z-index: 6;
					background: #fff;
					box-shadow: 6px 0 8px -8px rgba(15, 23, 42, 0.18);
				}
				.ops-pool-group-table .ant-table,
				.ops-pool-group-table .ant-table-container,
				.ops-pool-group-table .ant-table-content,
				.ops-pool-group-table .ant-table-header {
					border-start-start-radius: 0 !important;
					border-start-end-radius: 0 !important;
					border-top-left-radius: 0 !important;
					border-top-right-radius: 0 !important;
				}
				.ops-pool-group-table .ant-table-thead > tr:first-child > th:first-child,
				.ops-pool-group-table .ant-table-thead > tr:first-child > th:last-child {
					border-start-start-radius: 0 !important;
					border-start-end-radius: 0 !important;
					border-top-left-radius: 0 !important;
					border-top-right-radius: 0 !important;
				}
				.ops-pool-group-table,
				.ops-pool-group-table .ant-spin-nested-loading,
				.ops-pool-group-table .ant-spin-container,
				.ops-pool-group-table .ant-table,
				.ops-pool-group-table .ant-table-container {
					height: 100%;
				}
				.ops-pool-group-table .ant-table-tbody > tr > td {
					padding-top: 14px;
					padding-bottom: 14px;
					transition: background-color 160ms ease, transform 160ms ease;
				}
				.ops-pool-group-table .ant-table-tbody > tr.ops-pool-group-row > td {
					background: #fff !important;
					border-bottom: 1px solid #e5e7eb;
					padding: 8px 16px;
					position: sticky;
					top: 0;
					z-index: 5;
				}
				.ops-pool-group-table .ant-table-tbody > tr.ops-pool-group-row + tr.ops-pool-group-row > td {
					border-top: 0;
				}
				.ops-pool-group-table .ant-table-tbody > tr.ops-pool-group-row:hover > td {
					background: #fff !important;
				}
				.ops-pool-group-table .ant-table-tbody > tr:not(.ops-pool-stale):not(.ops-pool-group-row):hover > td {
					background: #f8fafc !important;
					transform: translateY(-1px) scale(1.001);
				}
				.ops-pool-group-table .ops-pool-stale > td {
					background: #fff7f6 !important;
				}
				.ops-pool-group-table .ops-pool-stale:hover > td {
					background: #fff1f0 !important;
					transform: translateY(-1px) scale(1.001);
				}
				.ops-pool-group-table .ant-table-tbody > tr:not(.ops-pool-group-row):hover > td:first-child {
					box-shadow: inset 3px 0 0 #0f766e, 6px 0 8px -8px rgba(15, 23, 42, 0.18);
				}
				.ops-pool-group-table .ant-table-tbody > tr.ops-pool-project-row > td:first-child {
					padding-left: 34px;
					position: relative;
					position: sticky;
					left: 0;
					z-index: 3;
					background: #fff;
					box-shadow: 6px 0 8px -8px rgba(15, 23, 42, 0.18);
				}
				.ops-pool-group-table .ant-table-tbody > tr.ops-pool-project-row.ops-pool-stale > td:first-child {
					background: #fff7f6 !important;
				}
				.ops-pool-group-table .ant-table-tbody > tr.ops-pool-project-row > td:first-child::before {
					content: "";
					position: absolute;
					left: 20px;
					top: 12px;
					bottom: 12px;
					width: 1px;
					background: #e2e8f0;
				}
			`}</style>
			<Table<ProjectGroupTableRow>
				className="ops-pool-table ops-pool-group-table"
				rowKey="key"
				loading={loading}
				dataSource={rows}
				columns={groupedColumns}
				size="small"
				scroll={{ x: 1900, y: scrollY }}
				pagination={false}
				onRow={(row) => {
					if (row.kind === "group") {
						return {
							className: "ops-pool-group-row",
							onClick: () => toggleGroup(row.group.key),
							style: { cursor: "pointer" },
						};
					}
					return {
						onClick: () => {
							if (window.getSelection()?.toString()) return;
							onOpenLogs(row.project);
						},
						className: `ops-pool-project-row${isNextDeadlineOverdue(row.project) ? " ops-pool-stale" : ""}`,
						style: { cursor: "pointer" },
					};
				}}
			/>
		</>
	);
}
