import { useMemo, useState } from "react";

const PROJECT_POOL_HIDDEN_COLUMNS_KEY = "ops.projectPool.hiddenColumns";
const PROJECT_POOL_COLUMN_ORDER_KEY = "ops.projectPool.columnOrder";
const LOCKED_COLUMN_KEYS = new Set(["name"]);

function readHiddenColumns() {
	if (typeof window === "undefined") return [];
	try {
		const value = JSON.parse(window.localStorage.getItem(PROJECT_POOL_HIDDEN_COLUMNS_KEY) || "[]");
		return Array.isArray(value) ? value.filter((key) => typeof key === "string" && !LOCKED_COLUMN_KEYS.has(key)) : [];
	} catch {
		return [];
	}
}

function readColumnOrder() {
	if (typeof window === "undefined") return [];
	try {
		const value = JSON.parse(window.localStorage.getItem(PROJECT_POOL_COLUMN_ORDER_KEY) || "[]");
		return Array.isArray(value) ? value.filter((key) => typeof key === "string" && !LOCKED_COLUMN_KEYS.has(key)) : [];
	} catch {
		return [];
	}
}

export function useProjectPoolColumnVisibility() {
	const [hiddenColumnKeys, setHiddenColumnKeysState] = useState<string[]>(readHiddenColumns);
	const [columnOrderKeys, setColumnOrderKeysState] = useState<string[]>(readColumnOrder);
	const hiddenColumnKeySet = useMemo(() => new Set(hiddenColumnKeys), [hiddenColumnKeys]);

	const setHiddenColumnKeys = (keys: string[]) => {
		const nextKeys = [...new Set(keys.filter((key) => !LOCKED_COLUMN_KEYS.has(key)))];
		setHiddenColumnKeysState(nextKeys);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(PROJECT_POOL_HIDDEN_COLUMNS_KEY, JSON.stringify(nextKeys));
		}
	};

	const setColumnOrderKeys = (keys: string[]) => {
		const nextKeys = [...new Set(keys.filter((key) => !LOCKED_COLUMN_KEYS.has(key)))];
		setColumnOrderKeysState(nextKeys);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(PROJECT_POOL_COLUMN_ORDER_KEY, JSON.stringify(nextKeys));
		}
	};

	const resetColumnConfig = () => {
		setHiddenColumnKeys([]);
		setColumnOrderKeys([]);
	};

	return {
		hiddenColumnKeys,
		hiddenColumnKeySet,
		setHiddenColumnKeys,
		columnOrderKeys,
		setColumnOrderKeys,
		resetColumnConfig,
		lockedColumnKeys: LOCKED_COLUMN_KEYS,
	};
}
