import type { OpsProjectPoolRow } from "@/api/modules/ops";
import type { AdvancedFilterRule, AdvancedFilterValue } from "@/components/common/AdvancedFilterBuilder";
import { compactAdvancedFilter } from "@/components/common/AdvancedFilterBuilder";

export type ProjectPoolLocalFilters = {
	q?: string;
	status?: string[];
	stage?: string[];
	planner?: string[];
	segment?: number[];
	advancedFilter?: AdvancedFilterValue;
};

const textIncludes = (value: unknown, keyword: string) => String(value || "").toLowerCase().includes(keyword);

function rowAdvancedFieldText(row: OpsProjectPoolRow, field: string) {
	switch (field) {
		case "name":
			return row.name || "";
		case "tenant":
		case "tenantName":
			return row.tenantName || "";
		case "planner":
		case "plannerName":
			return row.planners?.length ? row.planners.map((planner) => planner.name).join(" ") : row.plannerName || "";
		case "status":
			return row.status || "";
		case "stage":
			return row.stage || "";
		case "segment":
			return (row.segments || []).map((segment) => `${segment.id} ${segment.name}`).join(" ");
		case "remark":
			return row.remark || "";
		default:
			return "";
	}
}

function matchAdvancedRule(row: OpsProjectPoolRow, rule: AdvancedFilterRule) {
	const value = String(rule.value || "").toLowerCase();
	if (rule.field === "segment" && (rule.operator === "eq" || rule.operator === "neq")) {
		const matched = (row.segments || []).some((segment) => String(segment.id) === rule.value || String(segment.name || "").toLowerCase() === value);
		return rule.operator === "eq" ? matched : !matched;
	}
	const text = String(rowAdvancedFieldText(row, rule.field) || "").toLowerCase();
	if (rule.operator === "eq") return text === value;
	if (rule.operator === "neq") return text !== value;
	if (rule.operator === "contains") return text.includes(value);
	if (rule.operator === "not_contains") return !text.includes(value);
	if (rule.operator === "empty") return !text.trim();
	if (rule.operator === "not_empty") return !!text.trim();
	return true;
}

export function filterProjectPoolRows(rows: OpsProjectPoolRow[], filters: ProjectPoolLocalFilters) {
	let nextRows = rows;
	const keyword = String(filters.q || "").trim().toLowerCase();
	if (keyword) {
		nextRows = nextRows.filter((row) => [row.name, row.tenantName, row.plannerName].some((value) => textIncludes(value, keyword)));
	}

	if (filters.status?.length) {
		const statusSet = new Set(filters.status);
		nextRows = nextRows.filter((row) => statusSet.has(row.status));
	}

	if (filters.stage?.length) {
		const stageSet = new Set(filters.stage);
		nextRows = nextRows.filter((row) => stageSet.has(row.stage));
	}

	if (filters.planner?.length) {
		nextRows = nextRows.filter((row) => {
			const names = row.planners?.length ? row.planners.map((planner) => planner.name) : String(row.plannerName || "").split(/[、,，/]/);
			return filters.planner?.some((name) => names.some((candidate) => String(candidate || "").trim() === name || String(candidate || "").includes(name)));
		});
	}

	if (filters.segment?.length) {
		const segmentSet = new Set(filters.segment);
		nextRows = nextRows.filter((row) => (row.segments || []).some((segment) => segmentSet.has(Number(segment.id))));
	}

	const advanced = compactAdvancedFilter(filters.advancedFilter);
	if (advanced.rules.length) {
		nextRows = nextRows.filter((row) => {
			const results = advanced.rules.map((rule) => matchAdvancedRule(row, rule));
			return advanced.match === "all" ? results.every(Boolean) : results.some(Boolean);
		});
	}

	return nextRows;
}
