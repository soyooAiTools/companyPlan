import { useEffect, useRef, useState } from "react";
import type { App } from "antd";
import { opsApi } from "@/api/modules/ops";
import type { OpsProjectPoolRow, OpsProjectPoolSortBy, OpsProjectPoolSortOrder, OpsSegment } from "@/api/modules/ops";
import { emptyAdvancedFilter, stringifyAdvancedFilter, type AdvancedFilterValue } from "@/components/common/AdvancedFilterBuilder";

type MessageApi = ReturnType<typeof App.useApp>["message"];

function replaceProjectPoolRows(rows: OpsProjectPoolRow[], updates: OpsProjectPoolRow[]): OpsProjectPoolRow[] {
  if (!updates.length) return rows;
  const byId = new Map(updates.map((row) => [String(row.id), row]));
  const byProjectId = new Map(updates.map((row) => [String(row.projectId || row.id), row]));
  let changed = false;
  const nextRows: OpsProjectPoolRow[] = rows.map((row) => {
    const replacement = byId.get(String(row.id)) || (!row.isVersionRow && !row.parentId ? byProjectId.get(String(row.projectId || row.id)) : undefined);
    if (replacement) {
      changed = true;
      return replacement;
    }
    if (row.children?.length) {
      const children: OpsProjectPoolRow[] = replaceProjectPoolRows(row.children, updates);
      if (children !== row.children) {
        changed = true;
        return { ...row, children };
      }
    }
    return row;
  });
  return changed ? nextRows : rows;
}

type ProjectPoolInitialDataPreferences = {
	pageSize?: number;
	search?: string;
	statusFilter?: string[];
	stageFilter?: string[];
	plannerFilter?: string[];
	segmentFilter?: number[];
	advancedFilter?: AdvancedFilterValue;
	sortBy?: OpsProjectPoolSortBy;
	sortOrder?: OpsProjectPoolSortOrder;
};

export function useProjectPoolData(message: MessageApi, options: { mine?: boolean; pagedEnabled?: boolean; initialPreferences?: ProjectPoolInitialDataPreferences } = {}) {
  const mine = !!options.mine;
  const pagedEnabled = options.pagedEnabled ?? true;
  const initialPreferences = options.initialPreferences || {};
  const [tab, setTab] = useState<"all" | "stale">("all");
  const [rows, setRows] = useState<OpsProjectPoolRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPreferences.pageSize || 20);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(initialPreferences.search || "");
  const [debounced, setDebounced] = useState(initialPreferences.search || "");
  const [statusFilter, setStatusFilter] = useState<string[]>(initialPreferences.statusFilter || []);
  const [stageFilter, setStageFilter] = useState<string[]>(initialPreferences.stageFilter || []);
  const [plannerFilter, setPlannerFilter] = useState<string[]>(initialPreferences.plannerFilter || []);
  const [segmentFilter, setSegmentFilter] = useState<number[]>(initialPreferences.segmentFilter || []);
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilterValue>(initialPreferences.advancedFilter || emptyAdvancedFilter);
  const [sortBy, setSortBy] = useState<OpsProjectPoolSortBy | undefined>(initialPreferences.sortBy);
  const [sortOrder, setSortOrder] = useState<OpsProjectPoolSortOrder | undefined>(initialPreferences.sortOrder);
  const [segmentOptions, setSegmentOptions] = useState<OpsSegment[]>([]);
  const [allRows, setAllRows] = useState<OpsProjectPoolRow[]>([]);
  const [allRowsLoading, setAllRowsLoading] = useState(false);
  const [allRowsKey, setAllRowsKey] = useState("");
  const [filterOptionRows, setFilterOptionRows] = useState<OpsProjectPoolRow[]>([]);
  const allRowsRequestRef = useRef<Promise<OpsProjectPoolRow[]> | null>(null);
  const advancedFilterParam = stringifyAdvancedFilter(advancedFilter);
  const filterKey = [debounced.trim(), statusFilter.join(","), stageFilter.join(","), plannerFilter.join(","), segmentFilter.join(","), advancedFilterParam || ""].join("|");
  const allRowsSourceKey = mine ? "mine" : "all";

  const load = async () => {
    setLoading(true);
    setRows([]);
    setTotal(0);
    try {
      const result =
        tab === "stale"
          ? await opsApi.projectPoolStale({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, planner: plannerFilter, segment: segmentFilter, advancedFilter: advancedFilterParam, sortBy, sortOrder })
          : mine
            ? await opsApi.myProjects({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, planner: plannerFilter, segment: segmentFilter, advancedFilter: advancedFilterParam, sortBy, sortOrder })
            : await opsApi.projectPool({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, planner: plannerFilter, segment: segmentFilter, advancedFilter: advancedFilterParam, sortBy, sortOrder });
      setRows(result.rows);
      setTotal(result.total);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  // 合并项目池全量数据的并发请求:loadAllRows 和 loadFilterOptionRows 可能同时需要 pageSize=500 的数据。
  // 这里复用正在进行中的 Promise,不是输入防抖;lodash debounce 会延迟触发,但不能让两个调用共享同一次请求结果。
  const fetchAllRows = async () => {
    if (allRowsRequestRef.current) return allRowsRequestRef.current;
    const request = (async () => {
      const pageSizeForAll = 500;
      const fetchPages = async (extra: { status?: string[] } = {}) => {
        const first = mine ? await opsApi.myProjects({ page: 1, pageSize: pageSizeForAll, ...extra }) : await opsApi.projectPool({ page: 1, pageSize: pageSizeForAll, ...extra });
        const nextRows = [...first.rows];
        const pageCount = Math.ceil(first.total / pageSizeForAll);
        if (pageCount > 1) {
          const rest = await Promise.all(
            Array.from({ length: pageCount - 1 }, (_, index) => {
              const nextPage = index + 2;
              return mine ? opsApi.myProjects({ page: nextPage, pageSize: pageSizeForAll, ...extra }) : opsApi.projectPool({ page: nextPage, pageSize: pageSizeForAll, ...extra });
            }),
          );
          for (const result of rest) nextRows.push(...result.rows);
        }
        return nextRows;
      };
      const [defaultRows, recycledVersionRows] = await Promise.all([
        fetchPages(),
        // 分组视图/筛选候选项以「版本状态」为准。项目生命周期变成回收中后，
        // 默认项目池会隐藏该项目，但按策划/状态筛选仍需要能看到回收版本和交接策划。
        fetchPages({ status: ["回收中"] }),
      ]);
      const nextRows: OpsProjectPoolRow[] = [];
      const seen = new Set<string>();
      for (const row of [...defaultRows, ...recycledVersionRows]) {
        const key = String(row.id);
        if (seen.has(key)) continue;
        seen.add(key);
        nextRows.push(row);
      }
      return nextRows;
    })();
    allRowsRequestRef.current = request;
    try {
      return await request;
    } finally {
      allRowsRequestRef.current = null;
    }
  };

  const loadAllRows = async (force = false) => {
    if (tab !== "all") {
      setAllRows([]);
      setAllRowsKey("");
      return;
    }
    if (!force && allRowsKey === allRowsSourceKey && allRows.length) return;
    setAllRowsLoading(true);
    try {
      const nextRows = await fetchAllRows();
      setAllRows(nextRows);
      setFilterOptionRows(nextRows);
      setAllRowsKey(allRowsSourceKey);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载分组数据失败");
      setAllRows([]);
      setAllRowsKey("");
    } finally {
      setAllRowsLoading(false);
    }
  };

  const loadFilterOptionRows = async () => {
    if (allRowsKey === allRowsSourceKey && allRows.length) {
      setFilterOptionRows(allRows);
      return;
    }
    try {
      const nextRows = await fetchAllRows();
      setFilterOptionRows(nextRows);
    } catch {
      setFilterOptionRows([]);
    }
  };

  const replaceProjectRows = (updates: OpsProjectPoolRow[] = []) => {
    const normalizedUpdates = updates.filter(Boolean);
    if (!normalizedUpdates.length) return;
    // 提单/改字段后后端会返回受影响的项目行。这里只替换当前缓存中的对应行,
    // 避免重拉整张项目池导致当前筛选、分页、分组视图被重置。
    setRows((old) => replaceProjectPoolRows(old, normalizedUpdates));
    setAllRows((old) => replaceProjectPoolRows(old, normalizedUpdates));
    setFilterOptionRows((old) => replaceProjectPoolRows(old, normalizedUpdates));
  };

  useEffect(() => {
    setTab("all");
    setRows([]);
    setAllRows([]);
    setAllRowsKey("");
    allRowsRequestRef.current = null;
    setFilterOptionRows([]);
    setTotal(0);
    setPage(1);
    setPageSize(initialPreferences.pageSize || 20);
    setSearch(initialPreferences.search || "");
    setDebounced(initialPreferences.search || "");
    setStatusFilter(initialPreferences.statusFilter || []);
    setStageFilter(initialPreferences.stageFilter || []);
    setPlannerFilter(initialPreferences.plannerFilter || []);
    setSegmentFilter(initialPreferences.segmentFilter || []);
    setAdvancedFilter(initialPreferences.advancedFilter || emptyAdvancedFilter);
    setSortBy(initialPreferences.sortBy);
    setSortOrder(initialPreferences.sortOrder);
  }, [mine]);

  useEffect(() => {
    if (!pagedEnabled) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, pagedEnabled, tab, page, pageSize, statusFilter, stageFilter, plannerFilter, segmentFilter, advancedFilterParam, sortBy, sortOrder, debounced]);

  useEffect(() => {
    opsApi
      .segments()
      .then((result) => setSegmentOptions(result.segments))
      .catch(() => setSegmentOptions([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  return {
    tab,
    setTab,
    rows,
    total,
    page,
    setPage,
    pageSize,
    setPageSize,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    stageFilter,
    setStageFilter,
    plannerFilter,
    setPlannerFilter,
    segmentFilter,
    setSegmentFilter,
    advancedFilter,
    setAdvancedFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    segmentOptions,
    allRows,
    allRowsLoading,
    filterOptionRows,
    filterKey,
    allRowsSourceKey,
    load,
    loadAllRows,
    replaceProjectRows,
  };
}
