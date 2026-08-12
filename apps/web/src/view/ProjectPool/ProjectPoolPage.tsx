import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { App, Button, Checkbox, Input, Radio, Select, Spin, Switch } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { opsApi, type OpsBusinessUnit, type OpsProjectPoolMember, type OpsProjectPoolOwnerMember as RemoteProjectPoolOwnerMember, type OpsProjectPoolRow } from "@/api/modules/ops";
import ChangeProjectFieldModal from "./components/dialogs/ChangeProjectFieldModal";
import DeadlineOverdueProjectsModal from "./components/dialogs/DeadlineOverdueProjectsModal";
import MembersModal from "./components/dialogs/MembersModal";
import ProjectLogsDrawer from "./components/dialogs/ProjectLogsDrawer";
import ProjectMetaModal from "./components/dialogs/ProjectMetaModal";
import ProjectPoolCreateTicketModal from "./components/dialogs/ProjectPoolCreateTicketModal";
import RemarkModal from "./components/dialogs/RemarkModal";
import SegmentTicketDetailDrawer from "./components/dialogs/SegmentTicketDetailDrawer";
import SegmentTicketsModal from "./components/dialogs/SegmentTicketsModal";
import StageDeadlineModal from "./components/dialogs/StageDeadlineModal";
import ProjectPoolExportButton from "./components/export/ProjectPoolExportButton";
import ProjectPoolColumnConfigButton from "./components/toolbar/ProjectPoolColumnConfigButton";
import { useProjectPoolColumns } from "./hooks/useProjectPoolColumns";
import { useProjectPoolColumnVisibility } from "./hooks/useProjectPoolColumnVisibility";
import { useProjectPoolData } from "./hooks/useProjectPoolData";
import { useProjectPoolModals } from "./hooks/useProjectPoolModals";
import { useProjectPoolSheet } from "./hooks/useProjectPoolSheet";
import GroupedProjectSheet from "./sheets/GroupedProjectSheet";
import ProjectPoolSheetTabs from "./sheets/ProjectPoolSheetTabs";
import ProjectSheet from "./sheets/ProjectSheet";
import type { ProjectPoolSheetKey } from "./sheets/sheetTypes";
import { flattenProjectPoolRows, groupProjectsByOwner, type ProjectPoolGroup, type ProjectPoolOwnerMember } from "./utils/groupProjectRows";
import { filterProjectPoolRows } from "./utils/filterProjectPoolRows";

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
		const planners: { name: string; avatar: string; hireDate?: string; hire_date?: string }[] = row.planners?.length ? row.planners : row.plannerName ? row.plannerName.split(/[、,，/]/).map((name) => ({ name: name.trim(), avatar: "" })) : [];
		for (const planner of planners) {
			const name = planner.name.trim();
			if (!name) continue;
			members.push({
				id: name,
				username: "",
				name,
				avatar: planner.avatar || "",
				hireDate: planner.hireDate || planner.hire_date || "",
				wechatName: "",
				tags: ["制片/策划"],
				project: row,
				matchedTags: ["制片/策划"],
			});
		}
	}
	return members;
}

function buildOwnerMembersFromProjectMembers(rows: OpsProjectPoolRow[], tagNames: readonly string[]): ProjectPoolOwnerMember[] {
	const tagSet = new Set(tagNames.map((name) => name.trim()).filter(Boolean));
	if (!tagSet.size) return [];
	const members: ProjectPoolOwnerMember[] = [];
	for (const row of rows) {
		for (const member of row.members || []) {
			const matchedTags = (member.tags || []).filter((tag) => tagSet.has(tag));
			if (!matchedTags.length) continue;
			members.push({
				...member,
				name: member.name || member.wechatName || member.username || member.id,
				project: row,
				matchedTags,
			});
		}
	}
	return members;
}

function memberIdentityKeys(member: Pick<OpsProjectPoolMember, "id" | "username" | "name" | "wechatName">) {
	return [member.username, member.id, member.name, member.wechatName].map((value) => String(value || "").trim()).filter(Boolean);
}

function memberDisplayName(member: Pick<OpsProjectPoolMember, "id" | "username" | "name" | "wechatName">) {
	return member.name || member.wechatName || member.username || member.id;
}

function buildMemberMetaMap(rows: OpsProjectPoolRow[]) {
	const map = new Map<string, OpsProjectPoolMember>();
	for (const row of rows) {
		for (const member of row.members || []) {
			for (const key of memberIdentityKeys(member)) {
				if (!map.has(key)) map.set(key, member);
			}
		}
	}
	return map;
}

function ownerMemberMetaKey(projectId: string, key: string) {
	return `${projectId}::${key}`;
}

function buildOwnerMemberMetaMap(members: RemoteProjectPoolOwnerMember[]) {
	const map = new Map<string, OpsProjectPoolMember>();
	for (const member of members) {
		const projectId = String(member.projectId || "");
		if (!projectId) continue;
		for (const key of memberIdentityKeys(member)) {
			const normalizedKey = key.trim();
			if (normalizedKey && !map.has(ownerMemberMetaKey(projectId, normalizedKey))) {
				map.set(ownerMemberMetaKey(projectId, normalizedKey), member);
			}
		}
	}
	return map;
}

function findOwnerMemberMeta(map: Map<string, OpsProjectPoolMember>, projectId: string, member: OpsProjectPoolMember) {
	for (const key of memberIdentityKeys(member)) {
		const meta = map.get(ownerMemberMetaKey(projectId, key));
		if (meta) return meta;
	}
	return null;
}

type ProjectPoolPageProps = {
	mine?: boolean;
	isAdmin?: boolean;
};

export default function ProjectPoolPage({ mine = false, isAdmin = false }: ProjectPoolPageProps) {
	const { message } = App.useApp();
	const [sheet, setSheet] = useProjectPoolSheet(mine);
	const [sheetContentReady, setSheetContentReady] = useState(true);
	const switchFrameRef = useRef<number | null>(null);
	const isStaleSheet = !mine && sheet === "stale";
	const groupMode = !mine && (sheet === "planner" || sheet === "segment" || sheet === "stage" || sheet === "status" || sheet === "owner") ? sheet : null;
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
		statusFilter,
		setStatusFilter,
		stageFilter,
		setStageFilter,
		plannerFilter,
		setPlannerFilter,
		segmentFilter,
		setSegmentFilter,
		advancedFilter,
		setAdvancedFilter,
		sortBy,
		setSortBy,
		sortOrder,
		setSortOrder,
		segmentOptions,
		allRows,
		allRowsLoading,
		filterOptionRows,
		allRowsSourceKey,
		load,
		loadAllRows,
		replaceProjectRows,
	} = useProjectPoolData(message, { mine, pagedEnabled: mine || !groupMode });
	const reloadAfterProjectChange = async (updatedRows: OpsProjectPoolRow[] = []) => {
		if (updatedRows.length) {
			replaceProjectRows(updatedRows);
			return;
		}
		if (mine || !groupMode) await load();
		if (!mine && tab === "all") await loadAllRows(true);
	};
	const dialogs = useProjectPoolModals(message, reloadAfterProjectChange);
	const toggleUrgent = async (row: OpsProjectPoolRow) => {
		if (!isAdmin || row.hasVersionChildren) return;
		const nextUrgent = !row.isUrgent;
		try {
			await opsApi.changeProjectUrgent(row.id, nextUrgent);
			message.success(nextUrgent ? "已设为加急" : "已取消加急");
			await reloadAfterProjectChange();
		} catch (error) {
			message.error(error instanceof Error ? error.message : "修改加急状态失败");
		}
	};
	const [ownerRoleKey, setOwnerRoleKey] = useState<(typeof OWNER_ROLE_OPTIONS)[number]["key"]>("program");
	const [ownerGroups, setOwnerGroups] = useState<ProjectPoolGroup[]>([]);
	const [ownerGroupsLoading, setOwnerGroupsLoading] = useState(false);
	const [ownerBusinessUnits, setOwnerBusinessUnits] = useState<OpsBusinessUnit[]>([]);
	const [ownerBusinessUnitsLoading, setOwnerBusinessUnitsLoading] = useState(false);
	const [ownerSearch, setOwnerSearch] = useState("");
	const [ownerBusinessScopeFilter, setOwnerBusinessScopeFilter] = useState<string[]>([]);
	const [ownerBusinessScopeSearch, setOwnerBusinessScopeSearch] = useState("");
	const [ownerBusinessScopeOpen, setOwnerBusinessScopeOpen] = useState(false);
	const [ownerOnlyNew, setOwnerOnlyNew] = useState(false);
	const [ownerCollapseAction, setOwnerCollapseAction] = useState<{ type: "collapse" | "expand"; version: number }>({ type: "expand", version: 0 });
	const [ownerCollapsed, setOwnerCollapsed] = useState(false);
	const [createTicketProject, setCreateTicketProject] = useState<OpsProjectPoolRow | null>(null);
	const [createTicketMember, setCreateTicketMember] = useState<OpsProjectPoolMember | null>(null);
	const { hiddenColumnKeys, hiddenColumnKeySet, setHiddenColumnKeys, columnOrderKeys, setColumnOrderKeys, resetColumnConfig, lockedColumnKeys } = useProjectPoolColumnVisibility();

	// 表格内部滚动高度:实测「表格区域」高度 − 表头/分页固定占位,做到分页精准贴底(自适应工具栏换行/各种屏高)
	const tableWrapRef = useRef<HTMLDivElement>(null);
	const [scrollY, setScrollY] = useState(420);
	const [groupScrollY, setGroupScrollY] = useState(480);
	useEffect(
		() => () => {
			if (switchFrameRef.current != null) cancelAnimationFrame(switchFrameRef.current);
		},
		[],
	);

	const changeSheet = (nextSheet: ProjectPoolSheetKey) => {
		if (nextSheet === sheet) return;
		if (switchFrameRef.current != null) cancelAnimationFrame(switchFrameRef.current);
		setSheet(nextSheet);
		setSheetContentReady(false);
		switchFrameRef.current = requestAnimationFrame(() => {
			switchFrameRef.current = requestAnimationFrame(() => {
				setSheetContentReady(true);
				switchFrameRef.current = null;
			});
		});
	};

	const changeOwnerRole = (nextRole: typeof ownerRoleKey) => {
		if (nextRole === ownerRoleKey) return;
		setOwnerRoleKey(nextRole);
		setStatusFilter([]);
		setStageFilter([]);
		setPlannerFilter([]);
		setSegmentFilter([]);
		setAdvancedFilter({ match: "any", rules: [] });
		setOwnerSearch("");
		setOwnerBusinessScopeFilter([]);
		setOwnerBusinessScopeSearch("");
		setOwnerBusinessScopeOpen(false);
		setOwnerOnlyNew(false);
		setOwnerCollapsed(false);
		setOwnerCollapseAction((old) => ({ type: "expand", version: old.version + 1 }));
		setPage(1);
	};

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
		if (!statusFilter.includes("结算完成")) return;
		setStatusFilter(statusFilter.filter((status) => status !== "结算完成"));
		setPage(1);
	}, [setPage, setStatusFilter, statusFilter]);

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
	}, [isStaleSheet, tab, sheet, allRowsSourceKey, mine]);

	const filteredGroupRows = useMemo(
		() =>
			filterProjectPoolRows(allRows, {
				q: search,
				status: statusFilter,
				stage: stageFilter,
				planner: plannerFilter,
				segment: segmentFilter,
				advancedFilter,
			}),
		[advancedFilter, allRows, plannerFilter, search, segmentFilter, stageFilter, statusFilter],
	);

	useEffect(() => {
		if (sheet !== "owner" || ownerBusinessUnits.length) return;
		let cancelled = false;
		setOwnerBusinessUnitsLoading(true);
		opsApi
			.businessUnits()
			.then((res) => {
				if (!cancelled) setOwnerBusinessUnits(Array.isArray(res.units) ? res.units : []);
			})
			.catch((e) => {
				if (!cancelled) message.error(e instanceof Error ? e.message : "业务范围加载失败");
			})
			.finally(() => {
				if (!cancelled) setOwnerBusinessUnitsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [message, ownerBusinessUnits.length, sheet]);

	useEffect(() => {
		if (sheet !== "owner" || tab !== "all") {
			setOwnerGroups([]);
			setOwnerGroupsLoading(false);
			setOwnerSearch("");
			setOwnerBusinessScopeFilter([]);
			setOwnerBusinessScopeSearch("");
			setOwnerBusinessScopeOpen(false);
			setOwnerOnlyNew(false);
			setOwnerCollapsed(false);
			return;
		}
		if (allRowsLoading) {
			setOwnerGroups([]);
			setOwnerGroupsLoading(true);
			return;
		}
		let cancelled = false;
		const loadOwnerGroups = async () => {
			setOwnerGroupsLoading(true);
			setOwnerGroups([]);
			try {
				const role = OWNER_ROLE_OPTIONS.find((option) => option.key === ownerRoleKey) || OWNER_ROLE_OPTIONS[0];
				const activeRows = flattenProjectPoolRows(filteredGroupRows);
				if (role.source === "project_planners") {
					if (!cancelled) setOwnerGroups(groupProjectsByOwner(buildOwnerMembersFromProjectPlanners(filteredGroupRows), filteredGroupRows));
					return;
				}
				const localMembers = buildOwnerMembersFromProjectMembers(activeRows, role.tags);
				const rowById = new Map(activeRows.map((row) => [row.id, row]));
				const snapshotMemberMeta = buildMemberMetaMap(activeRows);
				const result = await opsApi.projectPoolOwnerMembers({ projectIds: activeRows.map((row) => row.id), tagNames: [...role.tags] });
				const ownerMemberMeta = buildOwnerMemberMetaMap(result.members);
				const members: ProjectPoolOwnerMember[] = localMembers.map((member) => {
					const meta = findOwnerMemberMeta(ownerMemberMeta, member.project.id, member) || memberIdentityKeys(member).map((key) => snapshotMemberMeta.get(key)).find(Boolean) || null;
					return {
						...member,
						name: meta ? memberDisplayName(meta) : memberDisplayName(member),
						avatar: meta?.avatar || member.avatar,
						wechatName: meta?.wechatName || member.wechatName,
						hireDate: meta?.hireDate || member.hireDate,
						rating: meta?.rating || member.rating,
						status: meta?.status || member.status,
					};
				});
				const seen = new Set(members.map((member) => `${member.project.id}:${member.id || member.username || member.name}`));
				for (const member of result.members) {
					const project = rowById.get(member.projectId);
					const meta = memberIdentityKeys(member).map((key) => snapshotMemberMeta.get(key)).find(Boolean);
					if (!project) continue;
					const dedupeKey = `${project.id}:${member.id || member.username || member.name}`;
					if (seen.has(dedupeKey)) continue;
					seen.add(dedupeKey);
					members.push({
						...member,
						name: meta ? memberDisplayName(meta) : memberDisplayName(member),
						avatar: meta?.avatar || member.avatar,
						wechatName: meta?.wechatName || member.wechatName,
						hireDate: meta?.hireDate || member.hireDate,
						rating: meta?.rating || member.rating,
						status: meta?.status || member.status,
						project,
						matchedTags: member.tags,
					});
				}
				if (!cancelled) setOwnerGroups(groupProjectsByOwner(members, filteredGroupRows));
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
	}, [allRowsLoading, filteredGroupRows, message, ownerRoleKey, sheet, tab]);

	const ownerBusinessScopeOptions = useMemo(() => {
		const scopeMap = new Map<string, string>();
		for (const unit of ownerBusinessUnits) {
			const value = String(unit.id || unit.name || "").trim();
			const label = String(unit.name || "").trim();
			if (value && label) scopeMap.set(value, label);
		}
		for (const group of ownerGroups) {
			for (const scope of group.businessScopes || []) {
				const value = String(scope.id || scope.name || "").trim();
				const label = String(scope.name || "").trim();
				if (value && label) scopeMap.set(value, label);
			}
		}
		return [...scopeMap.entries()]
			.map(([value, label]) => ({ value, label }))
			.sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
	}, [ownerBusinessUnits, ownerGroups]);

	const filteredOwnerBusinessScopeOptions = useMemo(() => {
		const keyword = ownerBusinessScopeSearch.trim().toLowerCase();
		if (!keyword) return ownerBusinessScopeOptions;
		return ownerBusinessScopeOptions.filter((option) => option.label.toLowerCase().includes(keyword));
	}, [ownerBusinessScopeOptions, ownerBusinessScopeSearch]);

	const visibleOwnerGroups = useMemo(() => {
		const keyword = ownerSearch.trim().toLowerCase();
		const selectedScopes = new Set(ownerBusinessScopeFilter);
		return ownerGroups.filter((group) => {
			if (ownerOnlyNew && !group.isNewHire) return false;
			if (keyword && !group.title.toLowerCase().includes(keyword)) return false;
			if (selectedScopes.size && !group.businessScopes?.some((scope) => selectedScopes.has(String(scope.id || scope.name)) || selectedScopes.has(String(scope.name || "")))) return false;
			return true;
		});
	}, [ownerBusinessScopeFilter, ownerGroups, ownerOnlyNew, ownerSearch]);

	const toggleOwnerCollapse = () => {
		const nextCollapsed = !ownerCollapsed;
		setOwnerCollapsed(nextCollapsed);
		setOwnerCollapseAction((old) => ({ type: nextCollapsed ? "collapse" : "expand", version: old.version + 1 }));
	};

	const ownerBusinessScopeDropdown = (menu: ReactNode) => (
		<div style={{ width: 216 }}>
			<Input
				allowClear
				size="small"
				prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
				placeholder="在筛选项中搜索"
				value={ownerBusinessScopeSearch}
				onChange={(event) => setOwnerBusinessScopeSearch(event.target.value)}
				onMouseDown={(event) => event.stopPropagation()}
				style={{ marginBottom: 6 }}
			/>
			<div style={{ maxHeight: 128, overflowY: "auto", padding: "0 0 4px" }}>
				{menu}
			</div>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", borderTop: "1px solid #f1f5f9", paddingTop: 6 }}>
				<Button
					type="link"
					size="small"
					disabled={!ownerBusinessScopeFilter.length}
					onClick={() => {
						setOwnerBusinessScopeFilter([]);
						setOwnerBusinessScopeSearch("");
					}}>
					重置
				</Button>
			</div>
		</div>
	);

	// 通知深链:URL 带 ?project=<id> 时,在已加载的项目里找到它并打开流转抽屉(找到即打开并清掉参数)
	const [searchParams, setSearchParams] = useSearchParams();
	const projectParam = searchParams.get("project");
	useEffect(() => {
		if (!projectParam || !rows.length) return;
		const row = flattenProjectPoolRows(rows).find((r) => r.id === projectParam);
		if (row) {
			void dialogs.actions.openLogs(row);
			searchParams.delete("project");
			setSearchParams(searchParams, { replace: true });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectParam, rows]);

	const plannerOptions = useMemo(() => {
		const plannersByName = new Map<string, { name: string; avatar?: string }>();
		const sourceRows = flattenProjectPoolRows(filterOptionRows.length ? filterOptionRows : [...rows, ...allRows]);
		for (const row of sourceRows) {
			const planners: { name: string; avatar?: string }[] = row.planners?.length ? row.planners : row.plannerName ? row.plannerName.split(/[、,，/]/).map((name) => ({ name: name.trim() })) : [];
			for (const planner of planners) {
				const name = planner.name?.trim();
				if (!name) continue;
				const current = plannersByName.get(name);
				if (!current || (!current.avatar && planner.avatar)) {
					plannersByName.set(name, { name, avatar: planner.avatar || current?.avatar });
				}
			}
		}
		return [...plannersByName.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
	}, [allRows, filterOptionRows, rows]);

	const columns = useProjectPoolColumns(
		{
			...dialogs.actions,
			openCreateTicket: (row) => setCreateTicketProject(row),
		},
		groupMode ? 0 : (page - 1) * pageSize,
		{
			statusFilter,
			stageFilter,
			plannerFilter,
			plannerOptions,
			segmentFilter,
			segmentOptions,
			advancedFilter,
			onAdvancedFilterChange: (value) => {
				setAdvancedFilter(value);
				setPage(1);
			},
			onStatusFilterChange: (value) => {
				setStatusFilter(value);
				setPage(1);
			},
			onStageFilterChange: (value) => {
				setStageFilter(value);
				setPage(1);
			},
			onPlannerFilterChange: (value) => {
				setPlannerFilter(value);
				setPage(1);
			},
			onSegmentFilterChange: (value) => {
				setSegmentFilter(value);
				setPage(1);
			},
		},
		{
			readonly: mine,
			isAdmin,
			serverSort: !groupMode,
			sortBy,
			sortOrder: sortOrder === "asc" ? "ascend" : sortOrder === "desc" ? "descend" : null,
		},
	);
	const orderedColumns = useMemo<ColumnsType<OpsProjectPoolRow>>(() => {
		const orderIndex = new Map(columnOrderKeys.map((key, index) => [key, index]));
		return [...columns].sort((left, right) => {
			const leftKey = String(left.key || ("dataIndex" in left ? left.dataIndex : "") || "");
			const rightKey = String(right.key || ("dataIndex" in right ? right.dataIndex : "") || "");
			const leftLocked = lockedColumnKeys.has(leftKey);
			const rightLocked = lockedColumnKeys.has(rightKey);
			if (leftLocked !== rightLocked) return leftLocked ? -1 : 1;
			const leftIndex = orderIndex.get(leftKey);
			const rightIndex = orderIndex.get(rightKey);
			if (leftIndex != null && rightIndex != null) return leftIndex - rightIndex;
			if (leftIndex != null) return -1;
			if (rightIndex != null) return 1;
			return 0;
		});
	}, [columnOrderKeys, columns, lockedColumnKeys]);
	const displayColumns = useMemo<ColumnsType<OpsProjectPoolRow>>(() => {
		const baseColumns = mine ? orderedColumns.filter((column) => !["stage", "stageDeadlines", "remark", "tickets"].includes(String(column.key))) : orderedColumns;
		return baseColumns.filter((column) => {
			const key = String(column.key || ("dataIndex" in column ? column.dataIndex : "") || "");
			return !key || lockedColumnKeys.has(key) || !hiddenColumnKeySet.has(key);
		});
	}, [hiddenColumnKeySet, lockedColumnKeys, mine, orderedColumns]);

	const columnConfigButton = (
		<ProjectPoolColumnConfigButton
			columns={orderedColumns}
			hiddenColumnKeys={hiddenColumnKeys}
			columnOrderKeys={columnOrderKeys}
			lockedColumnKeys={lockedColumnKeys}
			onHiddenChange={setHiddenColumnKeys}
			onOrderChange={setColumnOrderKeys}
			onReset={resetColumnConfig}
		/>
	);

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 16px)" }}>
			{mine ? (
				<div style={{ height: 40, display: "flex", alignItems: "center", padding: "0 12px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
					<span style={{ color: "#0f172a", fontSize: 15, fontWeight: 700 }}>我的项目</span>
					<div style={{ marginLeft: "auto" }}>{columnConfigButton}</div>
				</div>
			) : (
				<ProjectPoolSheetTabs
					value={sheet}
					onChange={changeSheet}
					extra={
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							{columnConfigButton}
							{isAdmin ? <ProjectPoolExportButton /> : null}
						</div>
					}
				/>
			)}

			{/* 表格区域:flex 填满剩余高度,内部滚动(表头固定、分页贴底) */}
			{sheet === "owner" ? (
				<div style={{ display: "flex", alignItems: "center", gap: 8, height: 42, padding: "0 12px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
					<span style={{ color: "#64748b", fontSize: 13 }}>角色</span>
					<Radio.Group
						value={ownerRoleKey}
						onChange={(event) => changeOwnerRole(event.target.value)}
					>
						{OWNER_ROLE_OPTIONS.map((option) => (
							<Radio key={option.key} value={option.key}>
								{option.label}
							</Radio>
						))}
					</Radio.Group>
					<Input
						allowClear
						size="small"
						prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
						placeholder="搜索负责人"
						value={ownerSearch}
						onChange={(event) => setOwnerSearch(event.target.value)}
						style={{ width: 180, marginLeft: 8 }}
					/>
					<Select
						allowClear
						mode="multiple"
						maxTagCount="responsive"
						size="small"
						showSearch={false}
						placeholder="负责业务"
						value={ownerBusinessScopeFilter}
						options={filteredOwnerBusinessScopeOptions}
						loading={ownerBusinessUnitsLoading}
						open={ownerBusinessScopeOpen}
						popupMatchSelectWidth={232}
						onChange={setOwnerBusinessScopeFilter}
						onClear={() => {
							setOwnerBusinessScopeFilter([]);
						}}
						optionRender={(option) => (
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<Checkbox checked={ownerBusinessScopeFilter.includes(String(option.value))} />
								<span>{option.label}</span>
							</div>
						)}
						popupRender={ownerBusinessScopeDropdown}
						onOpenChange={(open) => {
							setOwnerBusinessScopeOpen(open);
							setOwnerBusinessScopeSearch("");
						}}
						style={{ width: 150 }}
					/>
					<Switch
						size="small"
						checked={ownerOnlyNew}
						onChange={setOwnerOnlyNew}
						checkedChildren="新人"
						unCheckedChildren="新人"
					/>
					<Button size="small" onClick={toggleOwnerCollapse} style={{ marginLeft: "auto" }}>
						{ownerCollapsed ? "展开全部" : "折叠全部"}
					</Button>
				</div>
			) : null}

			<div ref={tableWrapRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
				{!sheetContentReady ? (
					<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
						<Spin />
					</div>
				) : !isStaleSheet && groupMode ? (
					<GroupedProjectSheet
						mode={groupMode}
						rows={filteredGroupRows}
						groupsOverride={sheet === "owner" ? visibleOwnerGroups : undefined}
						columns={displayColumns}
						loading={allRowsLoading || (sheet === "owner" && ownerGroupsLoading)}
						scrollY={groupScrollY}
						hideStats={sheet === "owner"}
						collapseAction={sheet === "owner" ? ownerCollapseAction : undefined}
						onOpenLogs={dialogs.actions.openLogs}
						onOpenGroupTickets={(group, mode) => {
							void dialogs.actions.openGroupTickets(`工单 · ${group.title} · ${mode === "overdue" ? "工单逾期" : "未完成工单"}`, group.rows, mode, group.segmentIds, group.ownerName);
						}}
						onOpenGroupDeadlineProjects={(group) => dialogs.actions.openDeadlineOverdueProjects(`交付逾期 · ${group.title}`, group.rows)}
						onToggleUrgent={isAdmin ? toggleUrgent : undefined}
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
						onSortChange={(nextSortBy, nextSortOrder) => {
							setSortBy(nextSortBy);
							setSortOrder(nextSortOrder);
							setPage(1);
						}}
						onOpenLogs={mine ? undefined : dialogs.actions.openLogs}
						onToggleUrgent={isAdmin && !mine ? toggleUrgent : undefined}
					/>
				)}
			</div>

			<ChangeProjectFieldModal
				open={dialogs.change.open}
				field={dialogs.change.field}
				target={dialogs.change.target}
				projectRows={filterOptionRows.length ? filterOptionRows : [...rows, ...allRows]}
				isAdmin={isAdmin}
				value={dialogs.change.value}
				comment={dialogs.change.comment}
				recycleHandoffUsername={dialogs.change.recycleHandoffUsername}
				saving={dialogs.change.saving}
				onValueChange={dialogs.change.setValue}
				onCommentChange={dialogs.change.setComment}
				onRecycleHandoffUserChange={dialogs.change.setRecycleHandoffUsername}
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
			<ProjectMetaModal
				open={dialogs.meta.open}
				target={dialogs.meta.target}
				customerContact={dialogs.meta.customerContact}
				requirementDoc={dialogs.meta.requirementDoc}
				saving={dialogs.meta.saving}
				onCustomerContactChange={dialogs.meta.setCustomerContact}
				onRequirementDocChange={dialogs.meta.setRequirementDoc}
				onSave={dialogs.meta.save}
				onCancel={dialogs.meta.close}
			/>
			<StageDeadlineModal
				open={dialogs.deadline.open}
				target={dialogs.deadline.target}
				rows={dialogs.deadline.rows}
				auto={dialogs.deadline.auto}
				skipWeekend={dialogs.deadline.skipWeekend}
				templateKey={dialogs.deadline.templateKey}
				saving={dialogs.deadline.saving}
				onAutoChange={dialogs.deadline.setAuto}
				onSkipWeekendChange={dialogs.deadline.changeSkipWeekend}
				onTemplateChange={dialogs.deadline.changeTemplate}
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
				onCreateTicket={(member) => {
					if (dialogs.members.project) {
						setCreateTicketProject(dialogs.members.project);
						setCreateTicketMember(member);
					}
				}}
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
			<DeadlineOverdueProjectsModal
				open={dialogs.deadlineProjects.open}
				title={dialogs.deadlineProjects.title}
				rows={dialogs.deadlineProjects.rows}
				onCancel={dialogs.deadlineProjects.close}
			/>
			<SegmentTicketDetailDrawer
				open={dialogs.segmentTicketDetail.open}
				ticket={dialogs.segmentTicketDetail.ticket}
				events={dialogs.segmentTicketDetail.events}
				loading={dialogs.segmentTicketDetail.loading}
				onClose={dialogs.segmentTicketDetail.close}
			/>
			<ProjectPoolCreateTicketModal
				open={!!createTicketProject}
				project={createTicketProject}
				member={createTicketMember}
				messageApi={message}
				onCreated={reloadAfterProjectChange}
				onCancel={() => {
					setCreateTicketProject(null);
					setCreateTicketMember(null);
				}}
			/>
		</div>
	);
}
