import { useEffect, useState } from "react";
import type { App } from "antd";
import { opsApi } from "@/api/modules/ops";
import type { OpsProjectPoolRow, OpsSegment } from "@/api/modules/ops";

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
  const [segmentOptions, setSegmentOptions] = useState<OpsSegment[]>([]);
  const [allRows, setAllRows] = useState<OpsProjectPoolRow[]>([]);
  const [allRowsLoading, setAllRowsLoading] = useState(false);
  const [allRowsKey, setAllRowsKey] = useState("");
  const [filterOptionRows, setFilterOptionRows] = useState<OpsProjectPoolRow[]>([]);
  const filterKey = [debounced.trim(), statusFilter.join(","), stageFilter.join(","), plannerFilter.join(","), segmentFilter.join(",")].join("|");

  const load = async () => {
    setLoading(true);
    setRows([]);
    setTotal(0);
    try {
      const result =
        tab === "stale"
          ? await opsApi.projectPoolStale({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, planner: plannerFilter, segment: segmentFilter })
          : mine
            ? await opsApi.myProjects({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, planner: plannerFilter, segment: segmentFilter })
            : await opsApi.projectPool({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, planner: plannerFilter, segment: segmentFilter });
      setRows(result.rows);
      setTotal(result.total);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const loadAllRows = async () => {
    if (tab !== "all") {
      setAllRows([]);
      setAllRowsKey("");
      return;
    }
    if (allRowsKey === filterKey && allRows.length) return;
    setAllRowsLoading(true);
    try {
      const pageSizeForAll = 500;
      const base = { q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, planner: plannerFilter, segment: segmentFilter };
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
      setAllRowsKey(filterKey);
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
  }, [mine, pagedEnabled, tab, page, pageSize, statusFilter, stageFilter, plannerFilter, segmentFilter, debounced]);

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
    segmentOptions,
    allRows,
    allRowsLoading,
    filterOptionRows,
    filterKey,
    load,
    loadAllRows,
  };
}
