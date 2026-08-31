import { useMemo, useState } from "react";
import type { OpsProjectPoolSortBy, OpsProjectPoolSortOrder } from "@/api/modules/ops";
import { emptyAdvancedFilter, type AdvancedFilterValue } from "@/components/common/AdvancedFilterBuilder";
import { projectPoolSheetOptions, type ProjectPoolSheetKey } from "../sheets/sheetTypes";

const PROJECT_POOL_PREFERENCES_KEY = "ops.projectPool.preferences.v1";
const OLD_SHEET_STORAGE_KEY = "ops.projectPool.sheet";
const OLD_HIDDEN_COLUMNS_KEY = "ops.projectPool.hiddenColumns";
const OLD_COLUMN_ORDER_KEY = "ops.projectPool.columnOrder";
const LOCKED_COLUMN_KEYS = new Set(["name"]);
const DEFAULT_HIDDEN_COLUMN_KEYS = ["remark2", "remark3", "remark4", "remark5", "remark6"];
const PROJECT_POOL_SHEETS = new Set<ProjectPoolSheetKey>(projectPoolSheetOptions.map((option) => option.value));

export const PROJECT_POOL_REMARK_COLUMN_LABELS = {
	remark: "策划备注",
	remark2: "备注2",
	remark3: "备注3",
	remark4: "备注4",
	remark5: "备注5",
	remark6: "备注6",
} as const;

const PROJECT_POOL_REMARK_COLUMN_KEYS = new Set<string>(Object.keys(PROJECT_POOL_REMARK_COLUMN_LABELS));
const RENAMABLE_REMARK_COLUMN_KEYS = new Set<string>(["remark2", "remark3", "remark4", "remark5", "remark6"]);

export type ProjectPoolRemarkColumnKey = keyof typeof PROJECT_POOL_REMARK_COLUMN_LABELS;
export type ProjectPoolColumnLabels = Partial<Record<ProjectPoolRemarkColumnKey, string>>;
export type ProjectPoolPreferenceResetKey = "columnVisibility" | "columnOrder" | "columnWidths" | "columnLabels" | "filters" | "sort" | "pagination" | "view";

type ProjectPoolPreferences = {
	extraRemarkColumnsInitialized: boolean;
	hiddenColumnKeys: string[];
	columnOrderKeys: string[];
	columnWidths: Record<string, number>;
	columnLabels: ProjectPoolColumnLabels;
	pageSize: number;
	view: {
		sheet: ProjectPoolSheetKey;
		onlyUrgent: boolean;
	};
	filters: {
		search: string;
		statusFilter: string[];
		stageFilter: string[];
		plannerFilter: string[];
		segmentFilter: number[];
		advancedFilter: AdvancedFilterValue;
	};
	sort: {
		sortBy?: OpsProjectPoolSortBy;
		sortOrder?: OpsProjectPoolSortOrder;
		deadlineSortMode: "date" | "overdue";
	};
};

const DEFAULT_PREFERENCES: ProjectPoolPreferences = {
	extraRemarkColumnsInitialized: true,
	hiddenColumnKeys: DEFAULT_HIDDEN_COLUMN_KEYS,
	columnOrderKeys: [],
	columnWidths: {},
	columnLabels: {},
	pageSize: 20,
	view: {
		sheet: "project",
		onlyUrgent: false,
	},
	filters: {
		search: "",
		statusFilter: [],
		stageFilter: [],
		plannerFilter: [],
		segmentFilter: [],
		advancedFilter: emptyAdvancedFilter,
	},
	sort: {
		sortBy: undefined,
		sortOrder: undefined,
		deadlineSortMode: "date",
	},
};

function readJson(value: string | null) {
	if (!value) return null;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function stringList(value: unknown) {
	return Array.isArray(value) ? value.filter((key) => typeof key === "string" && !LOCKED_COLUMN_KEYS.has(key)) : [];
}

function numberList(value: unknown) {
	return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

function columnWidths(value: unknown) {
	if (!value || typeof value !== "object") return {};
	const next: Record<string, number> = {};
	for (const [key, width] of Object.entries(value as Record<string, unknown>)) {
		const parsed = Number(width);
		if (key && Number.isFinite(parsed) && parsed >= 30) next[key] = Math.round(parsed);
	}
	return next;
}

function columnLabels(value: unknown) {
	if (!value || typeof value !== "object") return {};
	const next: ProjectPoolColumnLabels = {};
	for (const [key, label] of Object.entries(value as Record<string, unknown>)) {
		if (!RENAMABLE_REMARK_COLUMN_KEYS.has(key) || typeof label !== "string") continue;
		const trimmed = label.trim();
		const remarkKey = key as ProjectPoolRemarkColumnKey;
		if (trimmed && trimmed !== PROJECT_POOL_REMARK_COLUMN_LABELS[remarkKey]) next[remarkKey] = trimmed;
	}
	return next;
}

function readOldStringList(key: string) {
	if (typeof window === "undefined") return [];
	return stringList(readJson(window.localStorage.getItem(key)));
}

function readOldSheet() {
	if (typeof window === "undefined") return DEFAULT_PREFERENCES.view.sheet;
	const stored = window.localStorage.getItem(OLD_SHEET_STORAGE_KEY) as ProjectPoolSheetKey | null;
	return stored && PROJECT_POOL_SHEETS.has(stored) ? stored : DEFAULT_PREFERENCES.view.sheet;
}

function normalizeSheet(value: unknown) {
	return typeof value === "string" && PROJECT_POOL_SHEETS.has(value as ProjectPoolSheetKey) ? (value as ProjectPoolSheetKey) : DEFAULT_PREFERENCES.view.sheet;
}

function normalizePreferences(value: Partial<ProjectPoolPreferences> | null): ProjectPoolPreferences {
	const extraRemarkColumnsInitialized = value?.extraRemarkColumnsInitialized === true;
	const hiddenColumnKeys = stringList(value?.hiddenColumnKeys);
	return {
		extraRemarkColumnsInitialized: true,
		hiddenColumnKeys: extraRemarkColumnsInitialized ? hiddenColumnKeys : Array.from(new Set([...hiddenColumnKeys, ...DEFAULT_HIDDEN_COLUMN_KEYS])),
		columnOrderKeys: stringList(value?.columnOrderKeys),
		columnWidths: columnWidths(value?.columnWidths),
		columnLabels: columnLabels(value?.columnLabels),
		pageSize: Number.isFinite(Number(value?.pageSize)) ? Number(value?.pageSize) : DEFAULT_PREFERENCES.pageSize,
		view: {
			sheet: normalizeSheet(value?.view?.sheet),
			onlyUrgent: !!(value?.view?.onlyUrgent ?? (value as { onlyUrgent?: boolean } | null)?.onlyUrgent),
		},
		filters: {
			search: typeof value?.filters?.search === "string" ? value.filters.search : "",
			statusFilter: stringList(value?.filters?.statusFilter),
			stageFilter: stringList(value?.filters?.stageFilter),
			plannerFilter: stringList(value?.filters?.plannerFilter),
			segmentFilter: numberList(value?.filters?.segmentFilter),
			advancedFilter: value?.filters?.advancedFilter || emptyAdvancedFilter,
		},
		sort: {
			sortBy: value?.sort?.sortBy,
			sortOrder: value?.sort?.sortOrder,
			deadlineSortMode: value?.sort?.deadlineSortMode === "overdue" ? "overdue" : "date",
		},
	};
}

function readPreferences() {
	if (typeof window === "undefined") return DEFAULT_PREFERENCES;
	const stored = readJson(window.localStorage.getItem(PROJECT_POOL_PREFERENCES_KEY));
	if (stored) return normalizePreferences(stored);
	return normalizePreferences({
		hiddenColumnKeys: [...DEFAULT_HIDDEN_COLUMN_KEYS, ...readOldStringList(OLD_HIDDEN_COLUMNS_KEY)],
		columnOrderKeys: readOldStringList(OLD_COLUMN_ORDER_KEY),
		view: { ...DEFAULT_PREFERENCES.view, sheet: readOldSheet() },
	});
}

function writePreferences(value: ProjectPoolPreferences) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(PROJECT_POOL_PREFERENCES_KEY, JSON.stringify(value));
}

export function useProjectPoolPreferences(mine = false) {
	const [preferences, setPreferences] = useState<ProjectPoolPreferences>(readPreferences);
	const hiddenColumnKeySet = useMemo(() => new Set(preferences.hiddenColumnKeys), [preferences.hiddenColumnKeys]);

	const updatePreferences = (updater: (old: ProjectPoolPreferences) => ProjectPoolPreferences) => {
		setPreferences((old) => {
			const next = normalizePreferences(updater(old));
			writePreferences(next);
			return next;
		});
	};

	const setHiddenColumnKeys = (keys: string[]) => {
		updatePreferences((old) => ({ ...old, hiddenColumnKeys: stringList(keys) }));
	};

	const setColumnOrderKeys = (keys: string[]) => {
		updatePreferences((old) => ({ ...old, columnOrderKeys: stringList(keys) }));
	};

	const setColumnWidth = (key: string, width: number) => {
		if (!key) return;
		updatePreferences((old) => ({
			...old,
			columnWidths: { ...old.columnWidths, [key]: Math.max(30, Math.round(width)) },
		}));
	};

	const setColumnLabel = (key: ProjectPoolRemarkColumnKey, label: string) => {
		if (!RENAMABLE_REMARK_COLUMN_KEYS.has(key)) return;
		const trimmed = label.trim();
		updatePreferences((old) => {
			const nextLabels = { ...old.columnLabels };
			if (!trimmed || trimmed === PROJECT_POOL_REMARK_COLUMN_LABELS[key]) {
				delete nextLabels[key];
			} else {
				nextLabels[key] = trimmed;
			}
			return { ...old, columnLabels: nextLabels };
		});
	};

	const setOnlyUrgent = (onlyUrgent: boolean) => {
		updatePreferences((old) => ({ ...old, view: { ...old.view, onlyUrgent } }));
	};

	const setSheet = (sheet: ProjectPoolSheetKey) => {
		if (mine) return;
		updatePreferences((old) => ({ ...old, view: { ...old.view, sheet: normalizeSheet(sheet) } }));
	};

	const setPageSize = (pageSize: number) => {
		updatePreferences((old) => ({ ...old, pageSize }));
	};

	const setFilters = (filters: Partial<ProjectPoolPreferences["filters"]>) => {
		updatePreferences((old) => ({ ...old, filters: { ...old.filters, ...filters } }));
	};

	const setSort = (sort: Partial<ProjectPoolPreferences["sort"]>) => {
		updatePreferences((old) => ({ ...old, sort: { ...old.sort, ...sort } }));
	};

	const resetColumnConfig = () => {
		resetPreferences(["columnVisibility", "columnOrder", "columnWidths"]);
	};

	const resetPreferences = (keys: ProjectPoolPreferenceResetKey[]) => {
		const keySet = new Set(keys);
		updatePreferences((old) => ({
			...old,
			hiddenColumnKeys: keySet.has("columnVisibility") ? DEFAULT_HIDDEN_COLUMN_KEYS : old.hiddenColumnKeys,
			columnOrderKeys: keySet.has("columnOrder") ? [] : old.columnOrderKeys,
			columnWidths: keySet.has("columnWidths") ? {} : old.columnWidths,
			columnLabels: keySet.has("columnLabels") ? {} : old.columnLabels,
			pageSize: keySet.has("pagination") ? DEFAULT_PREFERENCES.pageSize : old.pageSize,
			view: keySet.has("view") ? DEFAULT_PREFERENCES.view : old.view,
			filters: keySet.has("filters") ? DEFAULT_PREFERENCES.filters : old.filters,
			sort: keySet.has("sort") ? DEFAULT_PREFERENCES.sort : old.sort,
		}));
	};

	return {
		...preferences,
		sheet: mine ? "project" : preferences.view.sheet,
		onlyUrgent: preferences.view.onlyUrgent,
		hiddenColumnKeySet,
		setHiddenColumnKeys,
		setColumnOrderKeys,
		setColumnWidth,
		setColumnLabel,
		setOnlyUrgent,
		setPageSize,
		setFilters,
		setSort,
		setSheet,
		resetPreferences,
		resetColumnConfig,
		lockedColumnKeys: LOCKED_COLUMN_KEYS,
	};
}
