import { useEffect, useMemo, useState } from "react";
import type { App } from "antd";
import { opsApi, type OpsProjectPoolRow, type OpsProjectStatusLog } from "@/api/modules/ops";

type MessageApi = ReturnType<typeof App.useApp>["message"];

export type ProgressAnalysisFilters = {
	search: string;
	statusFilter: string[];
	plannerFilter: string[];
};

export function useProgressAnalysisData(message: MessageApi, filters: ProgressAnalysisFilters, enabled: boolean) {
	const [rows, setRows] = useState<OpsProjectPoolRow[]>([]);
	const [logsByProjectId, setLogsByProjectId] = useState<Record<string, OpsProjectStatusLog[]>>({});
	const [loading, setLoading] = useState(false);
	const filterKey = [
		filters.search.trim(),
		filters.statusFilter.join(","),
		filters.plannerFilter.join(","),
	].join("|");

	useEffect(() => {
		if (!enabled) {
			setRows([]);
			setLogsByProjectId({});
			setLoading(false);
			return;
		}
		let cancelled = false;
		const load = async () => {
			setLoading(true);
			try {
				const result = await opsApi.projectPoolProgressAnalysis({
					q: filters.search.trim() || undefined,
					status: filters.statusFilter,
					planner: filters.plannerFilter,
				});
				if (cancelled) return;
				setRows(result.rows);
				setLogsByProjectId(result.logsByProjectId || {});
			} catch (error) {
				if (!cancelled) {
					message.error(error instanceof Error ? error.message : "加载进度分析失败");
					setRows([]);
					setLogsByProjectId({});
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enabled, filterKey]);

	return { rows, logsByProjectId, loading };
}
