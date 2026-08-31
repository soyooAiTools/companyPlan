import type { OpsProjectPoolRow } from "@/api/modules/ops";
import type { ProjectPoolGroup } from "../../utils/groupProjectRows";

export const PROJECT_POOL_SUMMARY_BAR_HEIGHT = 34;

function projectSummaryKey(row: OpsProjectPoolRow) {
	const projectId = String(row.projectId || "").trim();
	if (projectId) return projectId;
	return String(row.id || "").split("::version-")[0];
}

export function summaryProjectCount(groups: ProjectPoolGroup[]) {
	const projectIds = new Set<string>();
	for (const group of groups) {
		for (const row of group.rows) {
			const rows = Array.isArray(row.children) && row.children.length ? row.children : [row];
			for (const item of rows) {
				const key = projectSummaryKey(item);
				if (key) projectIds.add(key);
			}
		}
	}
	return projectIds.size;
}

export default function ProjectPoolSummaryBar({ groups }: { groups: ProjectPoolGroup[] }) {
	const projectCount = summaryProjectCount(groups);
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				zIndex: 20,
				height: PROJECT_POOL_SUMMARY_BAR_HEIGHT,
				display: "flex",
				alignItems: "center",
				justifyContent: "flex-start",
				padding: "0 12px",
				borderTop: "1px solid #e5e7eb",
				background: "#fff",
				color: "#0f172a",
				fontSize: 12,
				fontWeight: 700,
				whiteSpace: "nowrap",
				overflow: "hidden",
			}}>
			共 {projectCount} 个项目
		</div>
	);
}
