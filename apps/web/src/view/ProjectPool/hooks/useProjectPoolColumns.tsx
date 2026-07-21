import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button, Avatar, Checkbox, Space, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { SortOrder } from "antd/es/table/interface";
import { EditOutlined, FileTextOutlined, FilterFilled, QuestionCircleOutlined } from "@ant-design/icons";
import type { OpsProjectPoolRow, OpsProjectPoolSortBy, OpsSegment } from "@/api/modules/ops";
import { PROJECT_STAGES, PROJECT_STATUSES, statusStyle } from "@/view/Ops/constants";
import AdvancedFilterBuilder, { compactAdvancedFilter, type AdvancedFilterValue } from "@/components/common/AdvancedFilterBuilder";
import StageDeadlineCell from "../components/table/StageDeadlineCell";
import { finalStageDeadline, fmtProjectDate, nextDeadlineDiffDays, projectStartDate, stageRangeLabel } from "../deadlineUtils";

export type ProjectPoolColumnActions = {
	openChange: (row: OpsProjectPoolRow, field: "status" | "stage") => void;
	openMeta: (row: OpsProjectPoolRow) => void;
	openDeadlineEdit: (row: OpsProjectPoolRow) => void;
	openRemark: (row: OpsProjectPoolRow) => void;
	openSegTickets: (row: OpsProjectPoolRow, segment: { id: number; name: string }) => void;
	openMembers: (row: OpsProjectPoolRow) => void;
	openCreateTicket?: (row: OpsProjectPoolRow) => void;
};

export type ProjectPoolColumnFilters = {
	statusFilter: string[];
	stageFilter: string[];
	plannerFilter: string[];
	plannerOptions: { name: string; avatar?: string }[];
	segmentFilter: number[];
	segmentOptions: OpsSegment[];
	advancedFilter: AdvancedFilterValue;
	onStatusFilterChange: (value: string[]) => void;
	onStageFilterChange: (value: string[]) => void;
	onPlannerFilterChange: (value: string[]) => void;
	onSegmentFilterChange: (value: number[]) => void;
	onAdvancedFilterChange: (value: AdvancedFilterValue) => void;
};

const headerTip = (text: string, tip: string) => (
	<span>
		{text}{" "}
		<Tooltip title={<span style={{ whiteSpace: "pre-line" }}>{tip}</span>}>
			<QuestionCircleOutlined style={{ color: "#94a3b8", cursor: "help" }} />
		</Tooltip>
	</span>
);

const ticketSummaryCell = (row: OpsProjectPoolRow) => {
	const groups = row.ticketGroups || {};
	const item = (label: string, count: number, color?: string) => (
		<div style={{ display: "flex", alignItems: "baseline", lineHeight: "20px" }}>
			<span style={{ color: "#64748b", width: 52, flexShrink: 0 }}>{label}</span>
			<span style={{ color: count ? (color ?? "#0f172a") : "#94a3b8", fontWeight: count ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{count}</span>
		</div>
	);
	return (
		<div style={{ display: "grid", gridTemplateColumns: "auto auto", justifyContent: "start", columnGap: 20, rowGap: 7, fontSize: 12 }}>
			{item("进行中", groups["进行中"] || 0)}
			{item("排队中", groups["排队中"] || 0)}
			{item("工单超时", row.atRisk || 0, "#d46b08")}
			{item("工单逾期", row.overdue || 0, "#cf1322")}
		</div>
	);
};

const filterIcon = (active: boolean) => <FilterFilled style={{ color: active ? "#1677ff" : "#94a3b8" }} />;

const dateSortValue = (date?: string | null) => {
	if (!date) return Number.POSITIVE_INFINITY;
	const time = new Date(date).getTime();
	return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
};

function EditableTextCell({
	value,
	placeholder = "—",
	readonly,
	width = 105,
	onEdit,
}: {
	value?: string;
	placeholder?: string;
	readonly?: boolean;
	width?: number;
	onEdit: () => void;
}) {
	const text = String(value || "").trim();
	if (readonly) {
		return (
			<Typography.Text style={{ maxWidth: width }} ellipsis title={text}>
				{text || "—"}
			</Typography.Text>
		);
	}
	return (
		<button
			type="button"
			className={`project-pool-editable-cell${text ? "" : " is-empty"}`}
			onClick={(e) => {
				e.stopPropagation();
				onEdit();
			}}
			style={{ width, maxWidth: width }}
			title={text}>
			{text || placeholder}
		</button>
	);
}

const editableCellStyles = (
	<style>
		{`
			.project-pool-editable-cell {
				display: block;
				border: 0;
				background: transparent;
				padding: 2px 4px;
				margin: 0 0 0 -4px;
				text-align: left;
				border-radius: 4px;
				cursor: pointer;
				color: #334155;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.project-pool-editable-cell:empty,
			.project-pool-editable-cell:not(:empty) {
				font: inherit;
			}
			.project-pool-editable-cell:hover {
				background: #f1f5f9;
				color: #0f766e;
			}
			.project-pool-editable-cell.is-empty {
				color: #94a3b8;
			}
		`}
	</style>
);

function HeaderMultiDropdown<T extends string | number>({
	value,
	options,
	onApply,
	close,
}: {
	value: T[];
	options: { label: ReactNode; value: T }[];
	onApply: (value: T[]) => void;
	close: () => void;
}) {
	const [draft, setDraft] = useState<T[]>(value);
	useEffect(() => setDraft(value), [value]);
	const apply = (nextValue: T[]) => {
		onApply(nextValue);
		close();
	};
	return (
		<div style={{ minWidth: 180, maxWidth: 240, padding: 10 }} onClick={(e) => e.stopPropagation()}>
			<Checkbox.Group value={draft} onChange={(nextValue) => setDraft(nextValue as T[])} style={{ display: "grid", gap: 8 }}>
				{options.map((option) => (
					<Checkbox key={String(option.value)} value={option.value}>
						{option.label}
					</Checkbox>
				))}
			</Checkbox.Group>
			<div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
				<Button size="small" type="text" disabled={!draft.length && !value.length} onClick={() => apply([])}>
					清空
				</Button>
				<Button size="small" type="primary" onClick={() => apply(draft)}>
					确定
				</Button>
			</div>
		</div>
	);
}

export function useProjectPoolColumns(
	actions: ProjectPoolColumnActions,
	rowNumberOffset = 0,
	filters?: ProjectPoolColumnFilters,
	options: { readonly?: boolean; serverSort?: boolean; sortBy?: OpsProjectPoolSortBy; sortOrder?: SortOrder } = {},
): ColumnsType<OpsProjectPoolRow> {
	const plannerFilterOptions = (filters?.plannerOptions || []).map((planner) => ({
		value: planner.name,
		searchText: planner.name,
		label: (
			<Space size={6}>
				<Avatar size={18} src={planner.avatar || undefined} style={{ background: "#e2e8f0", color: "#475569", fontSize: 10 }}>
					{planner.name.slice(0, 1)}
				</Avatar>
				<span>{planner.name}</span>
			</Space>
		),
	}));
	const advancedFilterFields = filters
		? [
				{ key: "name", label: "项目名称" },
				{ key: "tenantName", label: "客户" },
			]
		: [];

	const advancedFilterActive = filters ? compactAdvancedFilter(filters.advancedFilter).rules.length > 0 : false;
	return [
		{
			title: "项目名称",
			key: "name",
			width: 270,
			fixed: "left",
			filterDropdown: filters ? ({ close }) => <AdvancedFilterBuilder value={filters.advancedFilter} fields={advancedFilterFields} onChange={filters.onAdvancedFilterChange} onApply={close} /> : undefined,
			filterDropdownProps: filters ? { align: { offset: [240, 0] } } : undefined,
			filterIcon: filters ? () => <FilterFilled style={{ color: advancedFilterActive ? "#1677ff" : "#94a3b8" }} /> : undefined,
			render: (_: unknown, row, index) => (
				<div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, height: "100%" }}>
					<span style={{ width: 24, flexShrink: 0, textAlign: "right", color: "#2563eb", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
						{rowNumberOffset + index + 1}
					</span>
					<div style={{ minWidth: 0, fontWeight: 600, fontSize: 14, color: "#0f172a", lineHeight: 1.35, wordBreak: "break-all", flex: 1 }}>
						{row.name || "—"}
						<span style={{ color: "#64748b", fontSize: 13, fontWeight: 400 }}> - {row.tenantName || "未填客户"}</span>
					</div>
					{!options.readonly && actions.openCreateTicket ? (
						<Button
							type="link"
							size="small"
							style={{ padding: "0 2px", height: 20, flexShrink: 0, color: "#0f766e", fontSize: 12, fontWeight: 500 }}
							onClick={(e) => {
								e.stopPropagation();
								actions.openCreateTicket?.(row);
							}}>
							+ 提单
						</Button>
					) : null}
				</div>
			),
		},
		{
			title: "客户对接人",
			key: "customerContact",
			width: 170,
			render: (_: unknown, row) => (
				<div style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: 152, minWidth: 0 }}>
					{editableCellStyles}
					<EditableTextCell value={row.customerContact} readonly={options.readonly} width={row.requirementDoc ? 82 : 132} onEdit={() => actions.openMeta(row)} />
					{row.requirementDoc ? (
						<a href={row.requirementDoc} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, color: "#1677ff", fontSize: 13 }} onClick={(e) => e.stopPropagation()}>
							<span style={{ color: "#cbd5e1" }}>·</span>
							<FileTextOutlined style={{ fontSize: 13 }} />
							文档
						</a>
					) : null}
				</div>
			),
		},
		{
			title: "策划",
			key: "planner",
			width: 150,
			filterDropdown: filters
				? ({ close }) => (
						<HeaderMultiDropdown
							value={filters.plannerFilter || []}
							options={plannerFilterOptions}
							onApply={filters.onPlannerFilterChange}
							close={close}
						/>
					)
				: undefined,
			filterIcon: filters ? () => filterIcon((filters.plannerFilter || []).length > 0) : undefined,
			render: (_: unknown, row) => {
				if (!row.plannerName) return <Typography.Text type="secondary">未指定</Typography.Text>;
				const avatars = (row.planners || []).filter((planner) => planner.avatar);
				return (
					<Space size={6}>
						{avatars.length ? (
							<Avatar.Group size={24}>
								{avatars.map((planner, index) => (
									<Tooltip key={index} title={planner.name}>
										<Avatar size={24} src={planner.avatar} />
									</Tooltip>
								))}
							</Avatar.Group>
						) : null}
						<span style={{ color: "#334155" }}>{row.plannerName}</span>
					</Space>
				);
			},
		},
		{
			title: headerTip("当前阶段", "项目当前所处的制作阶段。可任意调整,变更会记入流转。"),
			key: "stage",
			width: 230,
			filterDropdown: filters
				? ({ close }) => (
						<HeaderMultiDropdown
							value={filters.stageFilter}
							options={PROJECT_STAGES.map((stage) => ({ label: stageRangeLabel(stage), value: stage }))}
							onApply={filters.onStageFilterChange}
							close={close}
						/>
					)
				: undefined,
			filterIcon: filters ? () => filterIcon(filters.stageFilter.length > 0) : undefined,
			render: (_: unknown, row) => (
				<Tag
					style={{
						display: "inline-block",
						background: "#f0f5ff",
						color: "#1d39c4",
						padding: "2px 10px",
						fontSize: 13,
						borderRadius: 6,
						border: "none",
						margin: 0,
						whiteSpace: "nowrap",
						cursor: options.readonly ? "default" : "pointer",
					}}
					title={stageRangeLabel(row.stage)}
					onClick={(e) => {
						e.stopPropagation();
						if (!options.readonly) actions.openChange(row, "stage");
					}}>
					{stageRangeLabel(row.stage)}
				</Tag>
			),
		},
		{
			title: headerTip("下版交付时间", "根据当前阶段显示下版交付时间;鼠标悬停可查看完整阶段交付计划。超时关注按这个时间是否逾期判断。"),
			key: "stageDeadlines",
			width: 290,
			sorter: options.serverSort ? true : (a, b) => nextDeadlineDiffDays(a) - nextDeadlineDiffDays(b),
			sortOrder: options.sortBy === "nextDeadline" ? options.sortOrder : null,
			render: (_: unknown, row) => <StageDeadlineCell row={row} onEdit={actions.openDeadlineEdit} />,
		},
		{
			title: "项目启动时间",
			key: "startedAt",
			width: 120,
			sorter: options.serverSort ? true : (a, b) => dateSortValue(projectStartDate(a.startedAt, a.stageDeadlines)) - dateSortValue(projectStartDate(b.startedAt, b.stageDeadlines)),
			sortOrder: options.sortBy === "projectStart" ? options.sortOrder : null,
			render: (_: unknown, row) => {
				const startDate = projectStartDate(row.startedAt, row.stageDeadlines);
				const fromAssetConfirm = !!row.stageDeadlines?.some((item) => (item.key === "asset_confirm" || item.name === "资产确认") && item.date === startDate);
				return <span style={{ color: startDate ? (fromAssetConfirm ? "#64748b" : "#334155") : "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{fmtProjectDate(startDate)}</span>;
			},
		},
		{
			title: "项目结束时间",
			key: "duration",
			width: 130,
			sorter: options.serverSort ? true : (a, b) => dateSortValue(finalStageDeadline(a.stageDeadlines)?.date) - dateSortValue(finalStageDeadline(b.stageDeadlines)?.date),
			sortOrder: options.sortBy === "projectEnd" ? options.sortOrder : null,
			render: (_: unknown, row) => {
				const final = finalStageDeadline(row.stageDeadlines);
				return <span style={{ color: final?.date ? "#334155" : "#94a3b8", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmtProjectDate(final?.date)}</span>;
			},
		},
		{
			title: "当前状态",
			key: "status",
			width: 132,
			filterDropdown: filters
				? ({ close }) => (
						<HeaderMultiDropdown
							value={filters.statusFilter}
							options={PROJECT_STATUSES.map((status) => ({ label: status, value: status }))}
							onApply={filters.onStatusFilterChange}
							close={close}
						/>
					)
				: undefined,
			filterIcon: filters ? () => filterIcon(filters.statusFilter.length > 0) : undefined,
			render: (_: unknown, row) => (
				<Space size={6}>
					<Tag
						style={{ ...statusStyle(row.status), padding: "2px 10px", fontSize: 13, borderRadius: 6, border: "none", margin: 0, cursor: options.readonly ? "default" : "pointer" }}
						onClick={(e) => {
							if (options.readonly) return;
							e.stopPropagation();
							actions.openChange(row, "status");
						}}>
						{row.status || "—"}
					</Tag>
				</Space>
			),
		},
		{
			title: headerTip("备注", "项目备注(可富文本、附图)。修改会记入流转记录,可在流转记录里按「备注」筛选查看修改历史。"),
			key: "remark",
			width: 180,
			render: (_: unknown, row) => {
				const text = (row.remark || "")
					.replace(/<[^>]+>/g, " ")
					.replace(/&nbsp;/g, " ")
					.replace(/\s+/g, " ")
					.trim();
				const preview = text || (row.remark ? "[图文备注]" : "");
				return (
					<div style={{ display: "flex", alignItems: "center", gap: 4, width: 160, minWidth: 0 }}>
						{preview ? (
							<span style={{ fontSize: 13, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{preview}</span>
						) : (
							<Typography.Text type="secondary">—</Typography.Text>
						)}
						{options.readonly ? null : (
							<Tooltip title="修改备注">
								<Button
									type="text"
									size="small"
									icon={<EditOutlined style={{ fontSize: 15 }} />}
									style={{ color: "#0f766e" }}
									onClick={(e) => {
										e.stopPropagation();
										actions.openRemark(row);
									}}
								/>
							</Tooltip>
						)}
					</div>
				);
			},
		},
		{
			title: headerTip("目前环节", "该项目未完成工单涉及的环节,及每个环节的未完成工单数。点击环节查看该环节下所有人的未完成工单。"),
			key: "segments",
			width: 170,
			filterDropdown: filters
				? ({ close }) => (
						<HeaderMultiDropdown
							value={filters.segmentFilter}
							options={filters.segmentOptions.map((segment) => ({ label: segment.name, value: segment.id }))}
							onApply={filters.onSegmentFilterChange}
							close={close}
						/>
					)
				: undefined,
			filterIcon: filters ? () => filterIcon(filters.segmentFilter.length > 0) : undefined,
			render: (_: unknown, row) =>
				row.segments.length ? (
					<div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "2px 4px", alignItems: "center" }}>
						{row.segments.map((segment) => (
							<Button
								key={segment.id}
								type="link"
								size="small"
								style={{ padding: 0, height: "auto", fontSize: 13, justifyContent: "flex-start", minWidth: 0, overflow: "hidden" }}
								onClick={(e) => {
									e.stopPropagation();
									actions.openSegTickets(row, segment);
								}}>
								<span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
									{segment.name}({segment.count})
								</span>
							</Button>
						))}
					</div>
				) : (
					<Typography.Text type="secondary">—</Typography.Text>
				),
		},
		{
			title: "人员列表",
			dataIndex: "memberCount",
			width: 76,
			align: "center",
			render: (value: number, row) => (
				<Button
					type="link"
					size="small"
					disabled={!value}
					style={{ padding: 0 }}
					onClick={(e) => {
						e.stopPropagation();
						actions.openMembers(row);
					}}>
					{value}人
				</Button>
			),
		},
		// {
		// 	title: headerTip("工单状态", "统计该项目未完成工单(不含已完成):进行中/排队中按状态分;工单超时=已过预警线、未到截止(临期);工单逾期=已过截止仍未完成。"),
		// 	key: "tickets",
		// 	width: 200,
		// 	render: (_: unknown, row) => ticketSummaryCell(row),
		// },
	];
}
