import { useEffect, useState } from "react";
import type { App } from "antd";
import { opsApi } from "@/api/modules/ops";
import type { OpsProjectPoolRow, OpsProjectPoolSortBy, OpsProjectPoolSortOrder, OpsSegment } from "@/api/modules/ops";
import { emptyAdvancedFilter, stringifyAdvancedFilter, type AdvancedFilterValue } from "@/components/common/AdvancedFilterBuilder";

type MessageApi = ReturnType<typeof App.useApp>["message"];

export function useProjectPoolData(message: MessageApi, options: { mine?: boolean; pagedEnabled?: boolean } = {}) {
  const mine = !!options.mine;
  const pagedEnabled = options.pagedEnabled ?? true;
  const [tab, setTab] = useState<"all" | "stale">("all");
  const [rows, setRows] = useState<OpsProjectPoolRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [plannerFilter, setPlannerFilter] = useState<string[]>([]);
  const [segmentFilter, setSegmentFilter] = useState<number[]>([]);
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilterValue>(emptyAdvancedFilter);
  const [sortBy, setSortBy] = useState<OpsProjectPoolSortBy | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<OpsProjectPoolSortOrder | undefined>(undefined);
  const [segmentOptions, setSegmentOptions] = useState<OpsSegment[]>([]);
  const [allRows, setAllRows] = useState<OpsProjectPoolRow[]>([]);
  const [allRowsLoading, setAllRowsLoading] = useState(false);
  const [allRowsKey, setAllRowsKey] = useState("");
  const [filterOptionRows, setFilterOptionRows] = useState<OpsProjectPoolRow[]>([]);
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

  const loadAllRows = async (force = false) => {
    if (tab !== "all") {
      setAllRows([]);
      setAllRowsKey("");
      return;
    }
    if (!force && allRowsKey === allRowsSourceKey && allRows.length) return;
    setAllRowsLoading(true);
    try {
      const pageSizeForAll = 500;
      const base = {};
      const first = mine ? await opsApi.myProjects({ page: 1, pageSize: pageSizeForAll, ...base }) : await opsApi.projectPool({ page: 1, pageSize: pageSizeForAll, ...base });
      const nextRows = [...first.rows];
      const pageCount = Math.ceil(first.total / pageSizeForAll);
      if (pageCount > 1) {
        const rest = await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, index) => {
            const nextPage = index + 2;
            return mine ? opsApi.myProjects({ page: nextPage, pageSize: pageSizeForAll, ...base }) : opsApi.projectPool({ page: nextPage, pageSize: pageSizeForAll, ...base });
          }),
        );
        for (const result of rest) nextRows.push(...result.rows);
      }
      setAllRows(nextRows);
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
    try {
      const pageSizeForAll = 500;
      const first = mine ? await opsApi.myProjects({ page: 1, pageSize: pageSizeForAll }) : await opsApi.projectPool({ page: 1, pageSize: pageSizeForAll });
      const nextRows = [...first.rows];
      const pageCount = Math.ceil(first.total / pageSizeForAll);
      if (pageCount > 1) {
        const rest = await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, index) => {
            const nextPage = index + 2;
            return mine ? opsApi.myProjects({ page: nextPage, pageSize: pageSizeForAll }) : opsApi.projectPool({ page: nextPage, pageSize: pageSizeForAll });
          }),
        );
        for (const result of rest) nextRows.push(...result.rows);
      }
      setFilterOptionRows(nextRows);
    } catch {
      setFilterOptionRows([]);
    }
  };

  useEffect(() => {
    setTab("all");
    setRows([]);
    setAllRows([]);
    setAllRowsKey("");
    setFilterOptionRows([]);
    setTotal(0);
    setPage(1);
    setSearch("");
    setDebounced("");
    setStatusFilter([]);
    setStageFilter([]);
    setPlannerFilter([]);
    setSegmentFilter([]);
    setAdvancedFilter(emptyAdvancedFilter);
    setSortBy(undefined);
    setSortOrder(undefined);
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
    void loadFilterOptionRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine]);

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
  };
}
