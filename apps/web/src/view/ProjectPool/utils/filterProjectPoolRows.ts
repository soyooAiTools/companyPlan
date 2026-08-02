import type { OpsProjectPoolRow } from "@/api/modules/ops";
import type { AdvancedFilterRule, AdvancedFilterValue } from "@/components/common/AdvancedFilterBuilder";
import { compactAdvancedFilter } from "@/components/common/AdvancedFilterBuilder";

export const UNSET_STAGE_FILTER_VALUE = "__unset_stage";
export const NO_SEGMENT_FILTER_VALUE = 0;

export type ProjectPoolLocalFilters = {
	q?: string;
	status?: string[];
	stage?: string[];
	planner?: string[];
	segment?: number[];
	advancedFilter?: AdvancedFilterValue;
};

// 项目池“分组 sheet”使用的本地筛选。
// 全部项目/超时关注的分页筛选主要走后端接口；按策划/环节/阶段/状态/负责人等视角
// 会先拿 allRows，再用这里在前端做二次过滤和分组，避免切 sheet 时重新请求。
function rowAdvancedFieldText(row: OpsProjectPoolRow, field: string) {
	switch (field) {
		case "name":
			return row.name || "";
		case "tenant":
		case "tenantName":
			return row.tenantName || "";
		case "versionCode":
			return row.versionCode || "";
		case "versionName":
			return row.versionName || "";
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

// 匹配单条高级筛选规则。
// eq/neq 是完整匹配；contains/not_contains 是模糊匹配；empty/not_empty 判断空值。
// segment 的 eq/neq 额外支持用环节 id 或环节名称匹配。
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

function rowChildren(row: OpsProjectPoolRow) {
	return Array.isArray(row.children) ? row.children : [];
}

function rowSearchText(row: OpsProjectPoolRow) {
	return [row.name, row.tenantName, row.plannerName, row.versionCode, row.versionName].map((value) => String(value || "").toLowerCase()).join(" ");
}

function matchProjectPoolRow(row: OpsProjectPoolRow, filters: ProjectPoolLocalFilters) {
	const keyword = String(filters.q || "").trim().toLowerCase();
	if (keyword && !rowSearchText(row).includes(keyword)) return false;

	if (filters.status?.length) {
		const statusSet = new Set(filters.status);
		if (!statusSet.has(row.status)) return false;
	}

	if (filters.stage?.length) {
		const stageSet = new Set(filters.stage);
		if (!(stageSet.has(row.stage) || (stageSet.has(UNSET_STAGE_FILTER_VALUE) && !String(row.stage || "").trim()))) return false;
	}

	if (filters.planner?.length) {
		const names = row.planners?.length ? row.planners.map((planner) => planner.name) : String(row.plannerName || "").split(/[、,，/]/);
		if (!filters.planner.some((name) => names.some((candidate) => String(candidate || "").trim() === name || String(candidate || "").includes(name)))) return false;
	}

	if (filters.segment?.length) {
		const segmentSet = new Set(filters.segment);
		const segments = row.segments || [];
		if (!(segments.some((segment) => segmentSet.has(Number(segment.id))) || (segmentSet.has(NO_SEGMENT_FILTER_VALUE) && segments.length === 0))) return false;
	}

	const advanced = compactAdvancedFilter(filters.advancedFilter);
	if (advanced.rules.length) {
		const results = advanced.rules.map((rule) => matchAdvancedRule(row, rule));
		if (!(advanced.match === "all" ? results.every(Boolean) : results.some(Boolean))) return false;
	}

	return true;
}

// 对项目池 rows 应用本地筛选条件。
// 注意：这里不会触发接口请求，只处理已经加载到前端的 rows。
// 如果后续高级筛选要在本地支持“属于/不属于”，需要在 matchAdvancedRule 里补 in/not_in。
export function filterProjectPoolRows(rows: OpsProjectPoolRow[], filters: ProjectPoolLocalFilters) {
	return rows
		.map((row) => {
			const children = rowChildren(row);
			const parentMatched = matchProjectPoolRow(row, filters);
			if (!children.length) return parentMatched ? row : null;
			const matchedChildren = children.filter((child) => matchProjectPoolRow(child, filters));
			if (parentMatched) return { ...row, children: matchedChildren.length ? matchedChildren : children };
			return matchedChildren.length ? { ...row, children: matchedChildren } : null;
		})
		.filter(Boolean) as OpsProjectPoolRow[];
}
