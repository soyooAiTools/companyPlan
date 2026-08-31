import { useMemo } from "react";
import type { ColumnsType } from "antd/es/table";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import GroupedProjectPoolView from "./GroupedProjectPoolView";
import { groupProjects, type ProjectPoolGroup, type ProjectPoolGroupMode } from "../utils/groupProjectRows";

type GroupedProjectSheetProps = {
	mode: ProjectPoolGroupMode;
	rows: OpsProjectPoolRow[];
	groupsOverride?: ProjectPoolGroup[];
	columns: ColumnsType<OpsProjectPoolRow>;
	loading: boolean;
	scrollY: number;
	hideStats?: boolean;
	onOpenLogs: (row: OpsProjectPoolRow) => void;
	onOpenGroupTickets: (group: ProjectPoolGroup, mode: "overdue" | "unfinished") => void;
	onOpenGroupDeadlineProjects: (group: ProjectPoolGroup) => void;
	onToggleUrgent?: (row: OpsProjectPoolRow) => void;
	onColumnResize?: (key: string, width: number) => void;
	collapseAction?: { type: "collapse" | "expand"; version: number };
	sortResetKey?: string;
};

export default function GroupedProjectSheet({ mode, rows, groupsOverride, columns, loading, scrollY, hideStats, onOpenLogs, onOpenGroupTickets, onOpenGroupDeadlineProjects, onToggleUrgent, onColumnResize, collapseAction, sortResetKey }: GroupedProjectSheetProps) {
	const groups = useMemo(() => groupProjects(rows, mode), [mode, rows]);
	return (
		<GroupedProjectPoolView
			groups={groupsOverride ?? groups}
			columns={columns}
			loading={loading}
			scrollY={scrollY}
			hideStats={hideStats}
			onOpenLogs={onOpenLogs}
			onOpenGroupTickets={onOpenGroupTickets}
			onOpenGroupDeadlineProjects={onOpenGroupDeadlineProjects}
			onToggleUrgent={onToggleUrgent}
			onColumnResize={onColumnResize}
			collapseAction={collapseAction}
			sortResetKey={sortResetKey}
		/>
	);
}
