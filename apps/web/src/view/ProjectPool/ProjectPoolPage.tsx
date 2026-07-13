import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { App, Radio, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { opsApi, type OpsProjectPoolRow } from "@/api/modules/ops";
import ChangeProjectFieldModal from "./components/dialogs/ChangeProjectFieldModal";
import MembersModal from "./components/dialogs/MembersModal";
import ProjectLogsDrawer from "./components/dialogs/ProjectLogsDrawer";
import RemarkModal from "./components/dialogs/RemarkModal";
import SegmentTicketDetailDrawer from "./components/dialogs/SegmentTicketDetailDrawer";
import SegmentTicketsModal from "./components/dialogs/SegmentTicketsModal";
import StageDeadlineModal from "./components/dialogs/StageDeadlineModal";
import { useProjectPoolColumns } from "./hooks/useProjectPoolColumns";
import { useProjectPoolData } from "./hooks/useProjectPoolData";
import { useProjectPoolModals } from "./hooks/useProjectPoolModals";
import GroupedProjectSheet from "./sheets/GroupedProjectSheet";
import ProjectPoolSheetTabs from "./sheets/ProjectPoolSheetTabs";
import ProjectSheet from "./sheets/ProjectSheet";
import type { ProjectPoolSheetKey } from "./sheets/sheetTypes";
import { groupProjectsByOwner, type ProjectPoolGroup, type ProjectPoolOwnerMember, type ProjectPoolOwnerRow } from "./utils/groupProjectRows";

dayjs.locale("zh-cn");

const OWNER_ROLE_OPTIONS = [
	{ key: "program", label: "程序", source: "tags", tags: ["unity开发", "cocos开发"] },
	{ key: "level", label: "地编", source: "tags", tags: ["地编"] },
	{ key: "producer", label: "制片/策划", source: "project_planners", tags: [] },
	{ key: "storyboard", label: "分镜", source: "tags", tags: ["分镜"] },
	{ key: "model", label: "模型", source: "tags", tags: ["模型"] },
	{ key: "animation", label: "动画", source: "tags", tags: ["动画"] },
	{ key: "ui", label: "UI", source: "tags", tags: ["UI"] },
	{ key: "sound", label: "音效", source: "tags", tags: ["音效"] },
	{ key: "ta", label: "TA", source: "tags", tags: ["TA"] },
] as const;

function buildOwnerMembersFromProjectPlanners(rows: OpsProjectPoolRow[]): ProjectPoolOwnerMember[] {
	const members: ProjectPoolOwnerMember[] = [];
	for (const row of rows) {
		const planners = row.planners?.length ? row.planners : row.plannerName ? row.plannerName.split(/[、,，/]/).map((name) => ({ name: name.trim(), avatar: "" })) : [];
		for (const planner of planners) {
			const name = planner.name.trim();
			if (!name) continue;
			members.push({
				id: name,
				username: "",
				name,
				avatar: planner.avatar || "",
				wechatName: "",
				tags: ["制片/策划"],
				project: row,
				matchedTags: ["制片/策划"],
			});
		}
	}
	return members;
}

type ProjectPoolPageProps = {
	mine?: boolean;
};

export default function ProjectPoolPage({ mine = false }: ProjectPoolPageProps) {
	const { message } = App.useApp();
	const {
		tab,
		setTab,
		rows,
		total,
		page,
		setPage,
		pageSize,
		setPageSize,
		loading,
		search,
		setSearch,
		statusFilter,
		setStatusFilter,
		stageFilter,
		setStageFilter,
		segmentFilter,
		setSegmentFilter,
		segmentOptions,
		allRows,
		allRowsLoading,
		filterKey,
		load,
		loadAllRows,
	} = useProjectPoolData(message, { mine });
	const dialogs = useProjectPoolModals(message, load);
	const [sheet, setSheet] = useState<ProjectPoolSheetKey>("project");
	const isStaleSheet = !mine && sheet === "stale";
	const groupMode = !mine && (sheet === "planner" || sheet === "segment" || sheet === "stage" || sheet === "status" || sheet === "owner") ? sheet : null;
	const [ownerRoleKey, setOwnerRoleKey] = useState<(typeof OWNER_ROLE_OPTIONS)[number]["key"]>("program");
	const [ownerGroups, setOwnerGroups] = useState<ProjectPoolGroup[]>([]);
	const [ownerGroupsLoading, setOwnerGroupsLoading] = useState(false);

	// 表格内部滚动高度:实测「表格区域」高度 − 表头/分页固定占位,做到分页精准贴底(自适应工具栏换行/各种屏高)
	const tableWrapRef = useRef<HTMLDivElement>(null);
	const [scrollY, setScrollY] = useState(420);
	const [groupScrollY, setGroupScrollY] = useState(480);
	useEffect(() => {
		const el = tableWrapRef.current;
		if (!el) return;
		const TABLE_FIXED = 106; // 表头(~46)+ 分页(~56)+ 余量
		const GROUP_FIXED = 48; // 表头(~46)+ 余量;分组表无分页
		const update = () => {
			setScrollY(Math.max(160, el.clientHeight - TABLE_FIXED));
			setGroupScrollY(Math.max(200, el.clientHeight - GROUP_FIXED));
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		const nextTab = isStaleSheet ? "stale" : "all";
		if (tab !== nextTab) {
			setTab(nextTab);
			setPage(1);
		}
	}, [isStaleSheet, setPage, setTab, tab]);

	useEffect(() => {
		if (!mine && !isStaleSheet && sheet !== "project" && tab === "all") void loadAllRows();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isStaleSheet, tab, sheet, filterKey, mine]);

	useEffect(() => {
		if (sheet !== "owner" || tab !== "all" || allRowsLoading) {
			if (sheet !== "owner") setOwnerGroups([]);
			return;
		}
		let cancelled = false;
		const loadOwnerGroups = async () => {
			setOwnerGroupsLoading(true);
			try {
				const role = OWNER_ROLE_OPTIONS.find((option) => option.key === ownerRoleKey) || OWNER_ROLE_OPTIONS[0];
				const activeRows = allRows.filter((row) => row.status !== "已完成" && row.status !== "回收中");
				if (role.source === "project_planners") {
					if (!cancelled) setOwnerGroups(groupProjectsByOwner(buildOwnerMembersFromProjectPlanners(activeRows)));
					return;
				}
				const rowById = new Map(activeRows.map((row) => [row.id, row]));
				const result = await opsApi.projectPoolOwnerMembers({ projectIds: activeRows.map((row) => row.id), tagNames: [...role.tags] });
				const members: ProjectPoolOwnerMember[] = [];
				for (const member of result.members) {
					const project = rowById.get(member.projectId);
					if (project) members.push({ ...member, project, matchedTags: member.tags });
				}
				if (!cancelled) setOwnerGroups(groupProjectsByOwner(members));
			} catch (e) {
				if (!cancelled) {
					message.error(e instanceof Error ? e.message : "加载负责人分组失败");
					setOwnerGroups([]);
				}
			} finally {
				if (!cancelled) setOwnerGroupsLoading(false);
			}
		};
		void loadOwnerGroups();
		return () => {
			cancelled = true;
		};
	}, [allRows, allRowsLoading, message, ownerRoleKey, sheet, tab]);

	// 通知深链:URL 带 ?project=<id> 时,在已加载的项目里找到它并打开流转抽屉(找到即打开并清掉参数)
	const [searchParams, setSearchParams] = useSearchParams();
	const projectParam = searchParams.get("project");
	useEffect(() => {
		if (!projectParam || !rows.length) return;
		const row = rows.find((r) => r.id === projectParam);
		if (row) {
			void dialogs.actions.openLogs(row);
			searchParams.delete("project");
			setSearchParams(searchParams, { replace: true });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectParam, rows]);

	const columns = useProjectPoolColumns(
		dialogs.actions,
		groupMode ? 0 : (page - 1) * pageSize,
		!isStaleSheet
			? {
					search,
					statusFilter,
					stageFilter,
					segmentFilter,
					segmentOptions,
					onSearchChange: setSearch,
					onStatusFilterChange: (value) => {
						setStatusFilter(value);
						setPage(1);
					},
					onStageFilterChange: (value) => {
						setStageFilter(value);
						setPage(1);
					},
					onSegmentFilterChange: (value) => {
						setSegmentFilter(value);
						setPage(1);
					},
				}
			: undefined,
		{ readonly: mine },
	);
	const displayColumns = useMemo<ColumnsType<OpsProjectPoolRow>>(() => {
		const baseColumns = mine ? columns.filter((column) => !["stage", "stageDeadlines", "remark", "tickets"].includes(String(column.key))) : columns;
		if (sheet !== "owner") return baseColumns;
		const ownerColumn: ColumnsType<OpsProjectPoolRow>[number] = {
			title: "负责人标签",
			key: "ownerTagsText",
			width: 180,
			render: (_: unknown, row) => {
				const text = (row as ProjectPoolOwnerRow).ownerTagsText;
				if (!text) return <Typography.Text type="secondary">—</Typography.Text>;
				return (
					<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
						{text.split("、").map((segment) => (
							<Tag key={segment} color="blue" style={{ margin: 0 }}>
								{segment}
							</Tag>
						))}
					</div>
				);
			},
		};
		return [...baseColumns.slice(0, 2), ownerColumn, ...baseColumns.slice(2)];
	}, [columns, mine, sheet]);

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 32px)" }}>
			{mine ? (
				<div style={{ height: 40, display: "flex", alignItems: "center", padding: "0 12px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
					<span style={{ color: "#0f172a", fontSize: 15, fontWeight: 700 }}>我的项目</span>
				</div>
			) : (
				<ProjectPoolSheetTabs value={sheet} onChange={setSheet} />
			)}

			{/* 表格区域:flex 填满剩余高度,内部滚动(表头固定、分页贴底) */}
			{sheet === "owner" ? (
				<div style={{ display: "flex", alignItems: "center", gap: 8, height: 42, padding: "0 12px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
					<span style={{ color: "#64748b", fontSize: 13 }}>角色</span>
					<Radio.Group
						value={ownerRoleKey}
						onChange={(event) => setOwnerRoleKey(event.target.value)}
					>
						{OWNER_ROLE_OPTIONS.map((option) => (
							<Radio key={option.key} value={option.key}>
								{option.label}
							</Radio>
						))}
					</Radio.Group>
				</div>
			) : null}

			<div ref={tableWrapRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
				{!isStaleSheet && groupMode ? (
					<GroupedProjectSheet
						mode={groupMode}
						rows={allRows}
						groupsOverride={sheet === "owner" ? ownerGroups : undefined}
						columns={displayColumns}
						loading={allRowsLoading || (sheet === "owner" && ownerGroupsLoading)}
						scrollY={groupScrollY}
						onOpenLogs={dialogs.actions.openLogs}
						onOpenGroupTickets={(group, mode) => {
							void dialogs.actions.openGroupTickets(`工单 · ${group.title} · ${mode === "overdue" ? "工单逾期" : "未完成工单"}`, group.rows, mode, group.segmentIds, group.ownerName);
						}}
					/>
				) : (
					<ProjectSheet
						rows={rows}
						columns={displayColumns}
						loading={loading}
						page={page}
						pageSize={pageSize}
						total={total}
						scrollY={scrollY}
						onPageChange={(nextPage, nextPageSize) => {
							setPage(nextPage);
							setPageSize(nextPageSize);
						}}
						onOpenLogs={mine ? undefined : dialogs.actions.openLogs}
					/>
				)}
			</div>

			<ChangeProjectFieldModal
				open={dialogs.change.open}
				field={dialogs.change.field}
				target={dialogs.change.target}
				value={dialogs.change.value}
				comment={dialogs.change.comment}
				saving={dialogs.change.saving}
				onValueChange={dialogs.change.setValue}
				onCommentChange={dialogs.change.setComment}
				onConfirm={dialogs.change.confirm}
				onCancel={dialogs.change.close}
			/>
			<RemarkModal
				open={dialogs.remark.open}
				target={dialogs.remark.target}
				value={dialogs.remark.value}
				saving={dialogs.remark.saving}
				onChange={dialogs.remark.setValue}
				onSave={dialogs.remark.save}
				onCancel={dialogs.remark.close}
			/>
			<StageDeadlineModal
				open={dialogs.deadline.open}
				target={dialogs.deadline.target}
				rows={dialogs.deadline.rows}
				auto={dialogs.deadline.auto}
				skipWeekend={dialogs.deadline.skipWeekend}
				intervals={dialogs.deadline.intervals}
				saving={dialogs.deadline.saving}
				onAutoChange={dialogs.deadline.setAuto}
				onSkipWeekendChange={dialogs.deadline.changeSkipWeekend}
				onIntervalChange={dialogs.deadline.changeInterval}
				onDateChange={dialogs.deadline.changeDate}
				onSave={dialogs.deadline.save}
				onCancel={dialogs.deadline.close}
			/>
			<ProjectLogsDrawer
				open={dialogs.logs.open}
				project={dialogs.logs.project}
				logs={dialogs.logs.rows}
				loading={dialogs.logs.loading}
				logKind={dialogs.logs.kind}
				onLogKindChange={dialogs.logs.setKind}
				onClose={dialogs.logs.close}
			/>
			<MembersModal
				open={dialogs.members.open}
				project={dialogs.members.project}
				members={dialogs.members.rows}
				loading={dialogs.members.loading}
				onCancel={dialogs.members.close}
			/>
			<SegmentTicketsModal
				open={dialogs.segmentTickets.open}
				title={dialogs.segmentTickets.title}
				segments={dialogs.segmentTickets.tabs}
				activeSegmentId={dialogs.segmentTickets.segmentId}
				tickets={dialogs.segmentTickets.tickets}
				loading={dialogs.segmentTickets.loading}
				onCancel={dialogs.segmentTickets.close}
				onSegmentChange={dialogs.segmentTickets.switchTab}
				onOpenTicket={dialogs.actions.openSegTicketDetail}
			/>
			<SegmentTicketDetailDrawer
				open={dialogs.segmentTicketDetail.open}
				ticket={dialogs.segmentTicketDetail.ticket}
				events={dialogs.segmentTicketDetail.events}
				loading={dialogs.segmentTicketDetail.loading}
				onClose={dialogs.segmentTicketDetail.close}
			/>
		</div>
	);
}
