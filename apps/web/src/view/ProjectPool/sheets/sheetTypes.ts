export type ProjectPoolSheetKey = "project" | "stale" | "planner" | "segment" | "stage" | "status" | "owner";

export const projectPoolSheetOptions: { value: ProjectPoolSheetKey; label: string }[] = [
	{ value: "project", label: "全部项目" },
	{ value: "planner", label: "按策划查看" },
	{ value: "segment", label: "按环节查看" },
	{ value: "stage", label: "按阶段查看" },
	{ value: "status", label: "按状态查看" },
	{ value: "owner", label: "按负责人查看" },
	{ value: "stale", label: "超时关注" },
];
