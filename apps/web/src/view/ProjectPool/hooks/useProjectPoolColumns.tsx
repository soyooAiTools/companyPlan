import { useState } from "react";
import type { ReactNode } from "react";
import { Button, Avatar, Dropdown, Input, Popover, Space, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { SortOrder } from "antd/es/table/interface";
import { DownOutlined, EditOutlined, FileTextOutlined, FilterFilled, QuestionCircleOutlined, ThunderboltFilled } from "@ant-design/icons";
import type { OpsProjectPoolRow, OpsProjectPoolSortBy, OpsSegment, ProjectRemarkField } from "@/api/modules/ops";
import { PROJECT_STAGES, PROJECT_STATUSES, statusStyle } from "@/view/Ops/constants";
import AdvancedFilterBuilder, { compactAdvancedFilter, type AdvancedFilterValue } from "@/components/common/AdvancedFilterBuilder";
import HeaderMultiSelectDropdown from "../components/table/HeaderMultiSelectDropdown";
import StageDeadlineCell from "../components/table/StageDeadlineCell";
import { finalStageDeadline, fmtProjectDate, nextDeadlineDiffDays, nextStageDeadline, projectStartDate, stageRangeLabel } from "../deadlineUtils";
import { NO_SEGMENT_FILTER_VALUE, UNSET_STAGE_FILTER_VALUE } from "../utils/filterProjectPoolRows";
import type { ProjectPoolColumnLabels } from "./useProjectPoolPreferences";

type DeadlineSortMode = "date" | "overdue";

export type ProjectPoolColumnActions = {
	openChange: (row: OpsProjectPoolRow, field: "status" | "stage") => void;
	openMeta: (row: OpsProjectPoolRow) => void;
	openDeadlineEdit: (row: OpsProjectPoolRow) => void;
	openRemark: (row: OpsProjectPoolRow, field?: ProjectRemarkField) => void;
	openSegTickets: (row: OpsProjectPoolRow, segment: { id: number; name: string }) => void;
	openMembers: (row: OpsProjectPoolRow) => void;
	openCreateTicket?: (row: OpsProjectPoolRow) => void;
	transferPlanner?: (row: OpsProjectPoolRow, planner: { id: string; name: string }) => void;
};

export type ProjectPoolColumnFilters = {
	statusFilter: string[];
	stageFilter: string[];
	plannerFilter: string[];
	plannerOptions: { id?: string; userId?: string; username?: string; name: string; avatar?: string; status?: string }[];
	segmentFilter: number[];
	segmentOptions: OpsSegment[];
	advancedFilter: AdvancedFilterValue;
	remarkFilter: AdvancedFilterValue;
	onStatusFilterChange: (value: string[]) => void;
	onStageFilterChange: (value: string[]) => void;
	onPlannerFilterChange: (value: string[]) => void;
	onSegmentFilterChange: (value: number[]) => void;
	onAdvancedFilterChange: (value: AdvancedFilterValue) => void;
	onRemarkFilterChange: (value: AdvancedFilterValue) => void;
};

const headerTip = (text: string, tip: string) => (
	<span style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
		<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
		<Tooltip title={<span style={{ whiteSpace: "pre-line" }}>{tip}</span>}>
			<QuestionCircleOutlined style={{ flexShrink: 0, color: "#94a3b8", cursor: "help" }} />
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

const filterIcon = (active: boolean, activeColor = "#dc2626") => <FilterFilled style={{ color: active ? activeColor : "#94a3b8" }} />;

function advancedFieldFilterValue(value: AdvancedFilterValue, field: string) {
	const rule = (value.rules || []).find((item) => item.field === field && item.operator === "contains");
	return rule?.value || "";
}

function withAdvancedContainsFilter(value: AdvancedFilterValue, field: string, keyword: string): AdvancedFilterValue {
	const trimmed = keyword.trim();
	const rules = (value.rules || []).filter((rule) => !(rule.field === field && rule.operator === "contains"));
	if (!trimmed) return { ...value, rules };
	return {
		match: "all",
		rules: [
			...rules,
			{
				id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
				field,
				operator: "contains",
				value: trimmed,
			},
		],
	};
}

function remarkPreview(value: string) {
	return (value || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

const urgentCornerMark = (
	<Tooltip title="加急版本">
		<span
			style={{
				position: "absolute",
				left: 0,
				top: 0,
				width: 18,
				height: 18,
				clipPath: "polygon(0 0, 100% 0, 0 100%)",
				background: "#ef4444",
				boxShadow: "0 1px 2px rgba(239, 68, 68, 0.24)",
				pointerEvents: "auto",
			}}>
			<ThunderboltFilled
				style={{
					position: "absolute",
					left: 1,
					top: 1,
					color: "#fff",
					fontSize: 9,
					transform: "rotate(-12deg)",
				}}
			/>
		</span>
	</Tooltip>
);

const dateSortValue = (date?: string | null) => {
	if (!date) return Number.POSITIVE_INFINITY;
	const time = new Date(date).getTime();
	return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
};

const nextDeadlineDateSortValue = (row: OpsProjectPoolRow) => {
	const next = nextStageDeadline(row.stage, Array.isArray(row.stageDeadlines) ? row.stageDeadlines : []);
	return dateSortValue(next?.date);
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
	width?: number | string;
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
			.project-pool-planner-transfer-list {
				scrollbar-width: thin;
				scrollbar-color: #cbd5e1 transparent;
			}
			.project-pool-planner-transfer-list::-webkit-scrollbar {
				width: 4px;
			}
			.project-pool-planner-transfer-list::-webkit-scrollbar-thumb {
				background: #cbd5e1;
				border-radius: 999px;
			}
		`}
	</style>
);

function PlannerTransferPopover({
	content,
	options,
	onTransfer,
}: {
	content: ReactNode;
	options: { id: string; name: string; avatar?: string }[];
	onTransfer: (planner: { id: string; name: string }) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Popover
			open={open}
			trigger="click"
			placement="bottomLeft"
			onOpenChange={setOpen}
			content={
				<div className="project-pool-planner-transfer-list" style={{ width: 152, maxHeight: 320, overflowY: "auto", padding: 3 }} onClick={(e) => e.stopPropagation()}>
					{options.map((planner) => (
						<button
							key={planner.id}
							type="button"
							style={{
								width: "100%",
								display: "flex",
								alignItems: "center",
								gap: 7,
								border: 0,
								background: "transparent",
								padding: "7px 8px",
								borderRadius: 6,
								cursor: "pointer",
								textAlign: "left",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "#f1f5f9";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
							}}
							onClick={(e) => {
								e.stopPropagation();
								setOpen(false);
								onTransfer({ id: planner.id, name: planner.name });
							}}>
							<Avatar size={22} src={planner.avatar || undefined} style={{ background: "#e2e8f0", color: "#475569", fontSize: 10, flexShrink: 0 }}>
								{planner.name.slice(0, 1)}
							</Avatar>
							<span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#0f172a", fontSize: 13 }}>
								{planner.name}
							</span>
						</button>
					))}
				</div>
			}>
			<button
				type="button"
				style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", maxWidth: 132, textAlign: "left" }}
				title="点击转交策划"
				onClick={(e) => e.stopPropagation()}>
				{content}
			</button>
		</Popover>
	);
}

export function useProjectPoolColumns(
	actions: ProjectPoolColumnActions,
	rowNumberOffset = 0,
	filters?: ProjectPoolColumnFilters,
	options: { readonly?: boolean; serverSort?: boolean; sortBy?: OpsProjectPoolSortBy; sortOrder?: SortOrder; isAdmin?: boolean; deadlineSortMode?: DeadlineSortMode; onDeadlineSortModeChange?: (mode: DeadlineSortMode) => void; columnLabels?: ProjectPoolColumnLabels } = {},
): ColumnsType<OpsProjectPoolRow> {
	const statusFilterOptions = PROJECT_STATUSES.filter((status) => status !== "结算完成").map((status) => ({ label: status, value: status }));
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
				{ key: "versionCode", label: "版本标识" },
				{ key: "versionName", label: "版本名称" },
			]
		: [];

	const advancedFilterActive = filters ? compactAdvancedFilter(filters.advancedFilter).rules.length > 0 : false;
	const remarkLabel = (field: ProjectRemarkField, fallback: string) => options.columnLabels?.[field] || fallback;
	// 下版交付时间列支持两种排序口径:按日期本身,或按逾期天数。
	const deadlineSortMode = options.deadlineSortMode === "overdue" ? "overdue" : "date";
	const deadlineSortBy: OpsProjectPoolSortBy = deadlineSortMode === "overdue" ? "nextDeadlineOverdue" : "nextDeadline";
	const deadlineSortActive = options.sortBy === deadlineSortBy && !!options.sortOrder;
	const deadlineSorter = deadlineSortMode === "overdue" ? (a: OpsProjectPoolRow, b: OpsProjectPoolRow) => nextDeadlineDiffDays(b) - nextDeadlineDiffDays(a) : (a: OpsProjectPoolRow, b: OpsProjectPoolRow) => nextDeadlineDateSortValue(a) - nextDeadlineDateSortValue(b);
	const deadlineTitle = (
		<div style={{ display: "flex", alignItems: "center", width: "100%", minWidth: 0, gap: 6, overflow: "hidden", whiteSpace: "nowrap" }}>
			{headerTip("下版交付时间", "根据当前阶段显示下版交付时间;鼠标悬停可查看完整阶段交付计划。超时关注按这个时间是否逾期判断。")}
			<Dropdown
				trigger={["click"]}
				menu={{
					selectedKeys: [deadlineSortMode],
					items: [
						{ key: "date", label: "下版时间" },
						{ key: "overdue", label: "逾期时间" },
					],
					onClick: ({ key, domEvent }) => {
						domEvent.stopPropagation();
						options.onDeadlineSortModeChange?.(key === "overdue" ? "overdue" : "date");
					},
				}}>
				<Button
					type="text"
					size="small"
					onClick={(e) => e.stopPropagation()}
					style={{ height: 22, marginLeft: "auto", paddingInline: 4, fontSize: 12, flexShrink: 0 }}>
						<span
							className="project-pool-deadline-sort-text"
							style={{
								// 分组表的排序状态在 GroupedProjectPoolView 内维护,所以用 CSS 变量兜住文字颜色。
								color: deadlineSortActive ? "#dc2626" : "var(--project-pool-deadline-sort-color, #64748b)",
								fontWeight: deadlineSortActive ? 600 : "var(--project-pool-deadline-sort-weight, 400)",
							}}>
							{deadlineSortMode === "overdue" ? "逾期时间" : "下版时间"}
						</span>{" "}
						<DownOutlined
							className="project-pool-deadline-sort-icon"
							style={{
								// 和文字共用同一套颜色变量,确保下拉箭头也跟随排序态。
								color: deadlineSortActive ? "#dc2626" : "var(--project-pool-deadline-sort-color, #64748b)",
								fontSize: 10,
							}}
						/>
				</Button>
			</Dropdown>
		</div>
	);
	const remarkColumn = (field: ProjectRemarkField, label: string) => ({
		title: label,
		key: field,
		width: 180,
		filterDropdown: filters
			? ({ close }: { close: () => void }) => {
					let keyword = advancedFieldFilterValue(filters.remarkFilter, field);
					return (
						<div style={{ width: 220, padding: 10 }} onClick={(event) => event.stopPropagation()}>
							<Input
								allowClear
								autoFocus
								defaultValue={keyword}
								placeholder={`搜索${label}`}
								onChange={(event) => {
									keyword = event.target.value;
								}}
								onPressEnter={() => {
									filters.onRemarkFilterChange(withAdvancedContainsFilter(filters.remarkFilter, field, keyword));
									close();
								}}
							/>
							<div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
								<Button
									size="small"
									onClick={() => {
									filters.onRemarkFilterChange(withAdvancedContainsFilter(filters.remarkFilter, field, ""));
										close();
									}}
								>
									清空
								</Button>
								<Button
									type="primary"
									size="small"
									onClick={() => {
									filters.onRemarkFilterChange(withAdvancedContainsFilter(filters.remarkFilter, field, keyword));
										close();
									}}
								>
									搜索
								</Button>
							</div>
						</div>
					);
				}
			: undefined,
		filterIcon: filters ? () => filterIcon(!!advancedFieldFilterValue(filters.remarkFilter, field), "#dc2626") : undefined,
		render: (_: unknown, row: OpsProjectPoolRow) => {
			const value = row[field] || "";
			const text = remarkPreview(value);
			const preview = text || (value ? "[图文备注]" : "");
			return (
				<>
					{editableCellStyles}
					<EditableTextCell
						value={preview}
						placeholder="—"
						readonly={options.readonly}
						width="100%"
						onEdit={() => actions.openRemark(row, field)}
					/>
				</>
			);
		},
	});
	return [
		{
			title: "项目名称",
			key: "name",
			width: 270,
			fixed: "left",
			filterDropdown: filters
				? ({ close }) => <AdvancedFilterBuilder value={filters.advancedFilter} fields={advancedFilterFields} onChange={filters.onAdvancedFilterChange} onApply={close} />
				: undefined,
			filterDropdownProps: filters ? { align: { offset: [240, 0] } } : undefined,
			filterIcon: filters ? () => filterIcon(advancedFilterActive) : undefined,
			render: (_: unknown, row, index) => {
				const isParent = !!row.hasVersionChildren;
				const isVersion = !!row.isVersionRow;
				const canCreateTicket = !options.readonly && actions.openCreateTicket && !isParent;
				const versionText = [row.versionCode, row.versionName].filter(Boolean).join(" · ") || "版本";
				const showUrgentMark = row.isUrgent && !isParent;
				return (
					<div style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, width: "100%", maxWidth: 330, minWidth: 0, height: "100%" }}>
						{showUrgentMark ? urgentCornerMark : null}
						<span
							style={{ width: 24, flexShrink: 0, textAlign: "right", color: isVersion ? "#94a3b8" : "#2563eb", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
							{isVersion ? "" : rowNumberOffset + index + 1}
						</span>
						<div
							style={{
								position: "relative",
								minWidth: 0,
								fontWeight: 600,
								fontSize: 14,
								color: "#0f172a",
								lineHeight: 1.35,
								wordBreak: "break-all",
								flex: 1,
							}}>
							{isVersion ? (
								<span>{versionText}</span>
							) : (
								<>
									{row.name || "—"}
									<span style={{ color: "#64748b", fontSize: 13, fontWeight: 400 }}> - {row.tenantName || "未填客户"}</span>
									{isParent ? (
										<Tag color="blue" style={{ marginInlineStart: 8, fontWeight: 500 }}>
											多版本
										</Tag>
									) : null}
								</>
							)}
						</div>
						{canCreateTicket ? (
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
				);
			},
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
						<a
							href={row.requirementDoc}
							target="_blank"
							rel="noreferrer"
							style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, color: "#1677ff", fontSize: 13 }}
							onClick={(e) => e.stopPropagation()}>
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
				? ({ close }) => <HeaderMultiSelectDropdown value={filters.plannerFilter || []} options={plannerFilterOptions} onApply={filters.onPlannerFilterChange} close={close} defaultAll />
				: undefined,
			filterIcon: filters ? () => filterIcon((filters.plannerFilter || []).length > 0, "#dc2626") : undefined,
			render: (_: unknown, row) => {
				if (!row.plannerName) return <Typography.Text type="secondary">未指定</Typography.Text>;
				const avatars = (row.planners || []).filter((planner) => planner.avatar);
				const content = (
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
				const currentNames = new Set(String(row.plannerName || "").split(/[、,，/]/).map((name) => name.trim()).filter(Boolean));
				const transferOptions = (filters?.plannerOptions || [])
					.map((planner) => ({ ...planner, id: String(planner.id || planner.userId || "") }))
					.filter((planner) => planner.id && planner.status !== "disabled" && !currentNames.has(planner.name));
				if (options.readonly || !actions.transferPlanner || !transferOptions.length) return content;
				return (
					<PlannerTransferPopover
						content={content}
						options={transferOptions}
						onTransfer={(planner) => {
							actions.transferPlanner?.(row, planner);
						}}
					/>
				);
			},
		},
		{
			title: "当前阶段",
			key: "stage",
			width: 230,
			filterDropdown: filters
				? ({ close }) => (
						<HeaderMultiSelectDropdown
							value={filters.stageFilter}
							options={[{ label: "未设置", value: UNSET_STAGE_FILTER_VALUE }, ...PROJECT_STAGES.map((stage) => ({ label: stageRangeLabel(stage), value: stage }))]}
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
						maxWidth: "100%",
						background: "#f0f5ff",
						color: "#1d39c4",
						padding: "2px 10px",
						fontSize: 13,
						borderRadius: 6,
						border: "none",
						margin: 0,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
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
			title: deadlineTitle,
			key: "stageDeadlines",
			width: 290,
			sorter: options.serverSort ? true : deadlineSorter,
			sortOrder: options.sortBy === deadlineSortBy ? options.sortOrder : null,
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
						<HeaderMultiSelectDropdown
							value={filters.statusFilter}
							options={statusFilterOptions}
							onApply={filters.onStatusFilterChange}
							close={close}
							defaultAll
						/>
					)
				: undefined,
			filterIcon: filters ? () => filterIcon(filters.statusFilter.length > 0, "#dc2626") : undefined,
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
		remarkColumn("remark", remarkLabel("remark", "策划备注")),
		remarkColumn("remark2", remarkLabel("remark2", "备注2")),
		remarkColumn("remark3", remarkLabel("remark3", "备注3")),
		remarkColumn("remark4", remarkLabel("remark4", "备注4")),
		remarkColumn("remark5", remarkLabel("remark5", "备注5")),
		remarkColumn("remark6", remarkLabel("remark6", "备注6")),
		{
			title: headerTip("目前环节", "该项目未完成工单涉及的环节,及每个环节的未完成工单数。点击环节查看该环节下所有人的未完成工单。"),
			key: "segments",
			width: 170,
			filterDropdown: filters
				? ({ close }) => (
						<HeaderMultiSelectDropdown
							value={filters.segmentFilter}
							options={[{ label: "无环节", value: NO_SEGMENT_FILTER_VALUE }, ...filters.segmentOptions.map((segment) => ({ label: segment.name, value: segment.id }))]}
							onApply={filters.onSegmentFilterChange}
							close={close}
							defaultAll
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
			key: "memberCount",
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
