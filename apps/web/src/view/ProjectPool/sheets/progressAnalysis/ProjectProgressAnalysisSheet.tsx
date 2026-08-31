import { useEffect, useMemo, useState } from "react";
import { App, Avatar, Button, Checkbox, Empty, Input, Popover, Spin, Tooltip } from "antd";
import { DownOutlined, FilterFilled, RightOutlined, SearchOutlined, ThunderboltFilled } from "@ant-design/icons";
import SegmentedTabs from "@/components/SegmentedTabs";
import { PROJECT_STATUSES, statusStyle } from "@/view/Ops/constants";
import HeaderMultiSelectDropdown from "../../components/table/HeaderMultiSelectDropdown";
import { fmtStageDate, nextStageDeadline } from "../../deadlineUtils";
import { flattenProjectPoolRows, groupProjectsByPlanner, type ProjectPoolGroup } from "../../utils/groupProjectRows";
import ProgressFlowLine from "./ProgressFlowLine";
import { buildProgressFlowRows, type ProgressFlowRow } from "./progressAnalysisUtils";
import { useProgressAnalysisData, type ProgressAnalysisFilters } from "./useProgressAnalysisData";
import "./progressAnalysis.css";

type ProjectProgressAnalysisSheetProps = {
	filters: ProgressAnalysisFilters;
	enabled: boolean;
	height: number;
	onlyUrgent?: boolean;
	plannerOptions: { name: string; avatar?: string }[];
	collapseAction?: { type: "collapse" | "expand"; version: number };
	onSearchChange: (value: string) => void;
	onStatusFilterChange: (value: string[]) => void;
	onPlannerFilterChange: (value: string[]) => void;
};

type HeaderFilterOption = {
	value: string;
	label: string;
	avatar?: string;
};

type FlowMode = "status" | "stage";

type ProgressDisplayItem =
	| { type: "group"; id: string; group: ProjectPoolGroup; collapsed: boolean }
	| { type: "flow"; id: string; item: ProgressFlowRow; groupKey: string; index: number; collapsed?: boolean };

function rowPlanners(row: ProgressFlowRow["row"]) {
	return row.planners?.length ? row.planners : row.plannerName ? row.plannerName.split(/[、,，/]/).map((name) => ({ name: name.trim(), avatar: "" })) : [];
}

function PlannerList({ row }: { row: ProgressFlowRow["row"] }) {
	const planners = rowPlanners(row).filter((planner) => planner.name);
	if (!planners.length) return <>—</>;
	return (
		<div className="progress-analysis-planners">
			{planners.slice(0, 2).map((planner) => (
				<span key={planner.name} className="progress-analysis-planner">
					<Avatar size={22} src={planner.avatar || undefined} style={{ background: "#e2e8f0", color: "#475569", fontSize: 12 }}>
						{planner.name.slice(0, 1)}
					</Avatar>
					<span>{planner.name}</span>
				</span>
			))}
			{planners.length > 2 ? <span className="progress-analysis-planner-more">+{planners.length - 2}</span> : null}
		</div>
	);
}

function deadlineText(row: ProgressFlowRow["row"]) {
	const next = nextStageDeadline(row.stage, row.stageDeadlines || []);
	if (!next) return "—";
	return `${fmtStageDate(next.date)} ${next.name}`;
}

function LeftColumns({ item, index, collapsed, onToggleParent }: { item: ProgressFlowRow; index: number; collapsed?: boolean; onToggleParent: () => void }) {
	const row = item.row;
	const isParent = !!item.isParent;
	const isChild = !!item.parentId;
	const projectName = isParent ? row.name : row.isVersionRow ? row.versionName || row.versionCode || row.name : row.name;
	const tenantName = row.tenantName || (isParent ? "" : item.parentName) || "—";
	return (
		<div className={`progress-analysis-left${isParent ? " progress-analysis-left-parent" : ""}${isChild ? " progress-analysis-left-child" : ""}`}>
			{row.isUrgent && !isParent ? (
				<Tooltip title="加急版本">
					<span className="progress-analysis-urgent-corner">
						<ThunderboltFilled />
					</span>
				</Tooltip>
			) : null}
			<div className="progress-analysis-project">
				<span className="progress-analysis-project-index">{isChild ? "" : index + 1}</span>
				{isParent ? (
					<button type="button" className="progress-analysis-tree-toggle" onClick={onToggleParent}>
						{collapsed ? <RightOutlined /> : <DownOutlined />}
					</button>
				) : isChild ? (
					<span
						className={`progress-analysis-tree-gutter${item.childIndex === 0 ? " is-first-version" : ""}${item.childIndex === (item.childCount ?? 0) - 1 ? " is-last-version" : ""}`}
						aria-hidden="true">
						<span className="progress-analysis-tree-line-v" />
						<span className="progress-analysis-tree-line-h" />
					</span>
				) : null}
				<strong>{`${projectName} - ${tenantName}`}</strong>
			</div>
			<div className="progress-analysis-cell">{isParent ? "—" : <PlannerList row={row} />}</div>
			<div className="progress-analysis-cell progress-analysis-deadline-cell">{isParent ? "—" : deadlineText(row)}</div>
			<div className="progress-analysis-cell">
				{isParent ? (
					"—"
				) : (
					<span className="progress-analysis-status" style={statusStyle(row.status)}>
						{row.status || "—"}
					</span>
				)}
			</div>
		</div>
	);
}

function PlannerGroupRow({ group, collapsed, onToggle }: { group: ProjectPoolGroup; collapsed: boolean; onToggle: () => void }) {
	return (
		<button type="button" className="progress-analysis-group-row" onClick={onToggle}>
			<span className="progress-analysis-group-main">
				{collapsed ? <RightOutlined /> : <DownOutlined />}
				{group.avatar ? <Avatar size={22} src={group.avatar} /> : null}
				<span className="progress-analysis-group-title" title={group.title}>
					{group.title}
				</span>
				<span className="progress-analysis-group-count">{group.stats.projectCount} 个项目</span>
			</span>
		</button>
	);
}

function HeaderFilter({ title, value, options, onChange }: { title: string; value: string[]; options: HeaderFilterOption[]; onChange: (value: string[]) => void }) {
	const [open, setOpen] = useState(false);
	const active = value.length > 0;
	const content = (
		<HeaderMultiSelectDropdown
			value={value}
			options={options.map((option) => ({
				value: option.value,
				label: (
					<span className="progress-analysis-filter-option">
						{option.avatar != null ? (
							<Avatar size={18} src={option.avatar || undefined} style={{ background: "#e2e8f0", color: "#475569", fontSize: 11 }}>
								{option.label.slice(0, 1)}
							</Avatar>
						) : null}
						<span>{option.label}</span>
					</span>
				),
			}))}
			onApply={onChange}
			close={() => setOpen(false)}
			defaultAll
			compact
		/>
	);
	return (
		<span className="progress-analysis-header-filter">
			<span>{title}</span>
			<Popover trigger="click" placement="bottomLeft" content={content} open={open} onOpenChange={setOpen}>
				<Button
					type="text"
					size="small"
					icon={<FilterFilled />}
					className={active ? "progress-analysis-filter-button progress-analysis-filter-button-active" : "progress-analysis-filter-button"}
					onClick={(event) => event.stopPropagation()}
				/>
			</Popover>
		</span>
	);
}

function HeaderSearch({ title, value, onChange }: { title: string; value: string; onChange: (value: string) => void }) {
	const [open, setOpen] = useState(false);
	const active = value.trim().length > 0;
	const content = (
		<div className="progress-analysis-project-search-popover" onClick={(event) => event.stopPropagation()}>
			<Input
				allowClear
				autoFocus
				size="small"
				prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
				placeholder="搜索项目 / 客户 / 版本"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onPressEnter={() => setOpen(false)}
			/>
		</div>
	);
	return (
		<span className="progress-analysis-header-filter">
			<span>{title}</span>
			<Popover trigger="click" placement="bottomLeft" content={content} open={open} onOpenChange={setOpen}>
				<Button
					type="text"
					size="small"
					icon={<SearchOutlined />}
					className={active ? "progress-analysis-filter-button progress-analysis-filter-button-active" : "progress-analysis-filter-button"}
					onClick={(event) => event.stopPropagation()}
				/>
			</Popover>
		</span>
	);
}

function filterUrgentRows(rows: ProgressFlowRow["row"][]): ProgressFlowRow["row"][] {
	return rows
		.map((row) => {
			const children: ProgressFlowRow["row"][] = Array.isArray(row.children) ? filterUrgentRows(row.children) : [];
			if (children.length) return { ...row, children };
			return !row.hasVersionChildren && row.isUrgent ? row : null;
		})
		.filter(Boolean) as ProgressFlowRow["row"][];
}

export default function ProjectProgressAnalysisSheet({
	filters,
	enabled,
	height,
	onlyUrgent = false,
	plannerOptions,
	collapseAction,
	onSearchChange,
	onStatusFilterChange,
	onPlannerFilterChange,
}: ProjectProgressAnalysisSheetProps) {
	const { message } = App.useApp();
	const [flowMode, setFlowMode] = useState<FlowMode>("status");
	const [filterRestTime, setFilterRestTime] = useState(true);
	const [collapsedParentIds, setCollapsedParentIds] = useState<string[]>([]);
	const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>([]);
	const { rows, logsByProjectId, loading } = useProgressAnalysisData(message, filters, enabled);
	const visibleRows = useMemo(() => (onlyUrgent ? filterUrgentRows(rows) : rows), [onlyUrgent, rows]);
	const collapsedParentSet = useMemo(() => new Set(collapsedParentIds), [collapsedParentIds]);
	const collapsedGroupSet = useMemo(() => new Set(collapsedGroupKeys), [collapsedGroupKeys]);
	const plannerGroups = useMemo(() => groupProjectsByPlanner(visibleRows), [visibleRows]);
	useEffect(() => {
		if (!collapseAction) return;
		if (collapseAction.type === "expand") {
			setCollapsedGroupKeys([]);
			setCollapsedParentIds([]);
			return;
		}
		setCollapsedGroupKeys(plannerGroups.map((group) => group.key));
	}, [collapseAction, plannerGroups]);
	const displayItems = useMemo(() => {
		const items: ProgressDisplayItem[] = [];
		let flowIndex = 0;
		for (const group of plannerGroups) {
			const groupCollapsed = collapsedGroupSet.has(group.key);
			items.push({ type: "group", id: `group-${group.key}`, group, collapsed: groupCollapsed });
			if (groupCollapsed) continue;
			const groupFlowRows = buildProgressFlowRows(group.rows, logsByProjectId, filterRestTime);
			for (const item of groupFlowRows) {
				const parentCollapseKey = item.parentId ? `${group.key}:${item.parentId}` : "";
				if (parentCollapseKey && collapsedParentSet.has(parentCollapseKey)) continue;
				const rowCollapseKey = item.isParent ? `${group.key}:${item.id}` : "";
				items.push({
					type: "flow",
					id: `${group.key}-${item.id}`,
					item,
					groupKey: group.key,
					index: flowIndex,
					collapsed: rowCollapseKey ? collapsedParentSet.has(rowCollapseKey) : false,
				});
				flowIndex += 1;
			}
		}
		return items;
	}, [collapsedGroupSet, collapsedParentSet, filterRestTime, logsByProjectId, plannerGroups]);
	const toggleParent = (id: string) => {
		setCollapsedParentIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
	};
	const toggleGroup = (key: string) => {
		setCollapsedGroupKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
	};
	const mergedPlannerOptions = useMemo(() => {
		const map = new Map(plannerOptions.map((planner) => [planner.name, planner]));
		for (const row of flattenProjectPoolRows(rows)) {
			const planners = row.planners?.length ? row.planners : row.plannerName ? row.plannerName.split(/[、,，/]/).map((name) => ({ name: name.trim(), avatar: "" })) : [];
			for (const planner of planners) {
				const name = planner.name?.trim();
				if (name && !map.has(name)) map.set(name, { name, avatar: planner.avatar });
			}
		}
		return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
	}, [plannerOptions, rows]);
	const chartHeight = Math.max(260, height);

	return (
		<div className="progress-analysis-sheet">
			<div className="progress-analysis-chart" style={{ height: chartHeight }}>
				{loading ? (
					<div className="progress-analysis-center">
						<Spin />
					</div>
				) : displayItems.length ? (
					<div className="progress-analysis-table">
						<div className="progress-analysis-table-header">
							<div className="progress-analysis-header">
								<HeaderSearch title="项目" value={filters.search} onChange={onSearchChange} />
								<HeaderFilter
									title="策划"
									value={filters.plannerFilter}
									options={mergedPlannerOptions.map((planner) => ({ value: planner.name, label: planner.name, avatar: planner.avatar }))}
									onChange={onPlannerFilterChange}
								/>
								<span>下版交付时间</span>
								<HeaderFilter
									title="状态"
									value={filters.statusFilter}
									options={PROJECT_STATUSES.map((status) => ({ value: status, label: status }))}
									onChange={onStatusFilterChange}
								/>
							</div>
							<div className="progress-analysis-flow-header">
								<span>流转记录</span>
								<div className="progress-analysis-flow-actions">
									<Checkbox className="progress-analysis-worktime-toggle" checked={filterRestTime} onChange={(event) => setFilterRestTime(event.target.checked)}>
										过滤休息时间/周日
									</Checkbox>
									<div className="progress-analysis-flow-tabs">
										<SegmentedTabs
											value={flowMode}
											options={[
												{ label: "状态流转", value: "status" },
												{ label: "版本流转", value: "stage" },
											]}
											onChange={setFlowMode}
										/>
									</div>
								</div>
							</div>
						</div>
						<div className="progress-analysis-table-body">
							{displayItems.map((displayItem) => {
								if (displayItem.type === "group") {
									return (
										<div key={displayItem.id} className="progress-analysis-table-row progress-analysis-table-row-group">
											<PlannerGroupRow group={displayItem.group} collapsed={displayItem.collapsed} onToggle={() => toggleGroup(displayItem.group.key)} />
										</div>
									);
								}
								const parentCollapseKey = `${displayItem.groupKey}:${displayItem.item.id}`;
								return (
									<div key={displayItem.id} className={`progress-analysis-table-row${displayItem.item.isParent ? " progress-analysis-table-row-parent" : ""}`}>
										<LeftColumns item={displayItem.item} index={displayItem.index} collapsed={displayItem.collapsed} onToggleParent={() => toggleParent(parentCollapseKey)} />
										<div className="progress-analysis-flow-cell">
											{displayItem.item.isParent ? null : (
												<ProgressFlowLine
													mode={flowMode}
													events={flowMode === "status" ? displayItem.item.statusEvents : displayItem.item.stageEvents}
													currentStatus={displayItem.item.row.status}
													currentStage={displayItem.item.row.stage}
													stageDeadlines={displayItem.item.row.stageDeadlines}
												/>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				) : (
					<div className="progress-analysis-center">
						<Empty description={`暂无${flowMode === "status" ? "状态" : "版本"}流转记录`} />
					</div>
				)}
			</div>
		</div>
	);
}
