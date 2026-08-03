import { useState } from "react";
import { projectPoolSheetOptions, type ProjectPoolSheetKey } from "../sheets/sheetTypes";

const PROJECT_POOL_SHEET_STORAGE_KEY = "ops.projectPool.sheet";
const PROJECT_POOL_SHEETS = new Set<ProjectPoolSheetKey>(projectPoolSheetOptions.map((option) => option.value));

function readStoredSheet(): ProjectPoolSheetKey {
	if (typeof window === "undefined") return "project";
	const stored = window.localStorage.getItem(PROJECT_POOL_SHEET_STORAGE_KEY) as ProjectPoolSheetKey | null;
	return stored && PROJECT_POOL_SHEETS.has(stored) ? stored : "project";
}

export function useProjectPoolSheet(mine: boolean) {
	const [sheet, setSheetState] = useState<ProjectPoolSheetKey>(() => (mine ? "project" : readStoredSheet()));

	const setSheet = (nextSheet: ProjectPoolSheetKey) => {
		setSheetState(nextSheet);
		if (!mine && typeof window !== "undefined") {
			window.localStorage.setItem(PROJECT_POOL_SHEET_STORAGE_KEY, nextSheet);
		}
	};

	return [sheet, setSheet] as const;
}
