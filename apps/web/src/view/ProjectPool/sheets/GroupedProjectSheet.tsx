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
};

export default function GroupedProjectSheet({ mode, rows, groupsOverride, columns, loading, scrollY, hideStats, onOpenLogs, onOpenGroupTickets }: GroupedProjectSheetProps) {
	const groups = useMemo(() => groupProjects(rows, mode), [mode, rows]);
	return <GroupedProjectPoolView groups={groupsOverride ?? groups} columns={columns} loading={loading} scrollY={scrollY} hideStats={hideStats} onOpenLogs={onOpenLogs} onOpenGroupTickets={onOpenGroupTickets} />;
}
