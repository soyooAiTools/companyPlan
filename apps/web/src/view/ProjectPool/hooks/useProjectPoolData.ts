import { useEffect, useState } from "react";
import type { App } from "antd";
import { opsApi } from "@/api/modules/ops";
import type { OpsProjectPoolRow, OpsSegment } from "@/api/modules/ops";

type MessageApi = ReturnType<typeof App.useApp>["message"];

export function useProjectPoolData(message: MessageApi, options: { mine?: boolean } = {}) {
  const mine = !!options.mine;
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
  const [segmentFilter, setSegmentFilter] = useState<number[]>([]);
  const [segmentOptions, setSegmentOptions] = useState<OpsSegment[]>([]);
  const [allRows, setAllRows] = useState<OpsProjectPoolRow[]>([]);
  const [allRowsLoading, setAllRowsLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result =
        tab === "stale"
          ? await opsApi.projectPoolStale({ page, pageSize })
          : mine
            ? await opsApi.myProjects({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, segment: segmentFilter })
            : await opsApi.projectPool({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, segment: segmentFilter });
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
      return;
    }
    setAllRowsLoading(true);
    try {
      const pageSizeForAll = 100;
      const base = { q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, segment: segmentFilter };
      const first = mine ? await opsApi.myProjects({ page: 1, pageSize: pageSizeForAll, ...base }) : await opsApi.projectPool({ page: 1, pageSize: pageSizeForAll, ...base });
      const nextRows = [...first.rows];
      const pageCount = Math.ceil(first.total / pageSizeForAll);
      for (let nextPage = 2; nextPage <= pageCount; nextPage += 1) {
        const result = mine ? await opsApi.myProjects({ page: nextPage, pageSize: pageSizeForAll, ...base }) : await opsApi.projectPool({ page: nextPage, pageSize: pageSizeForAll, ...base });
        nextRows.push(...result.rows);
      }
      setAllRows(nextRows);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载分组数据失败");
      setAllRows([]);
    } finally {
      setAllRowsLoading(false);
    }
  };

  useEffect(() => {
    setTab("all");
    setRows([]);
    setAllRows([]);
    setTotal(0);
    setPage(1);
    setSearch("");
    setDebounced("");
    setStatusFilter([]);
    setStageFilter([]);
    setSegmentFilter([]);
  }, [mine]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, tab, page, pageSize, statusFilter, stageFilter, segmentFilter, debounced]);

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
    segmentFilter,
    setSegmentFilter,
    segmentOptions,
    allRows,
    allRowsLoading,
    filterKey: [debounced.trim(), statusFilter.join(","), stageFilter.join(","), segmentFilter.join(",")].join("|"),
    load,
    loadAllRows,
  };
}
