import { useEffect, useState } from "react";
import type { App } from "antd";
import { opsApi } from "@/api/modules/ops";
import type { OpsProjectPoolRow, OpsSegment } from "@/api/modules/ops";

type MessageApi = ReturnType<typeof App.useApp>["message"];

export function useProjectPoolData(message: MessageApi) {
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

  const load = async () => {
    setLoading(true);
    try {
      const result =
        tab === "stale"
          ? await opsApi.projectPoolStale({ page, pageSize })
          : await opsApi.projectPool({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, segment: segmentFilter });
      setRows(result.rows);
      setTotal(result.total);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, pageSize, statusFilter, stageFilter, segmentFilter, debounced]);

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
    load,
  };
}
