import { useState } from "react";
import type { App } from "antd";
import { opsApi } from "@/api/modules/ops";
import type { OpsProjectPoolMember, OpsProjectPoolRow, OpsProjectStageDeadline, OpsProjectStatusLog, OpsSegmentTicket, OpsTicket, OpsTicketEvent } from "@/api/modules/ops";
import { defaultStageIntervals, inferStageDeadlines, normalizeStageDeadlines } from "../deadlineUtils";
import type { ProjectLogKind } from "../logUtils";

type MessageApi = ReturnType<typeof App.useApp>["message"];
type SegmentTicketWithSource = OpsSegmentTicket & {
  projectId?: string;
  projectName?: string;
  projectStage?: string;
  segmentId?: number;
  segmentName?: string;
};

export function useProjectPoolModals(message: MessageApi, reload: () => Promise<void>) {
  const [chOpen, setChOpen] = useState(false);
  const [chField, setChField] = useState<"status" | "stage">("status");
  const [chTarget, setChTarget] = useState<OpsProjectPoolRow | null>(null);
  const [chValue, setChValue] = useState("");
  const [chComment, setChComment] = useState("");
  const [chSaving, setChSaving] = useState(false);

  const [logsOpen, setLogsOpen] = useState(false);
  const [logsProject, setLogsProject] = useState<OpsProjectPoolRow | null>(null);
  const [logs, setLogs] = useState<OpsProjectStatusLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logKind, setLogKind] = useState<ProjectLogKind>("all");

  const [rmOpen, setRmOpen] = useState(false);
  const [rmTarget, setRmTarget] = useState<OpsProjectPoolRow | null>(null);
  const [rmValue, setRmValue] = useState("");
  const [rmSaving, setRmSaving] = useState(false);

  const [memOpen, setMemOpen] = useState(false);
  const [memProject, setMemProject] = useState<OpsProjectPoolRow | null>(null);
  const [members, setMembers] = useState<OpsProjectPoolMember[]>([]);
  const [memLoading, setMemLoading] = useState(false);

  const [segOpen, setSegOpen] = useState(false);
  const [segTitle, setSegTitle] = useState("");
  const [segTabs, setSegTabs] = useState<OpsProjectPoolRow["segments"]>([]);
  const [segTickets, setSegTickets] = useState<OpsSegmentTicket[]>([]);
  const [segLoading, setSegLoading] = useState(false);
  const [segProjectId, setSegProjectId] = useState("");
  const [segProjectName, setSegProjectName] = useState("");
  const [segSegmentId, setSegSegmentId] = useState<number[]>([]);
  const [segDetailOpen, setSegDetailOpen] = useState(false);
  const [segDetail, setSegDetail] = useState<OpsTicket | null>(null);
  const [segDetailEvents, setSegDetailEvents] = useState<OpsTicketEvent[]>([]);
  const [segDetailLoading, setSegDetailLoading] = useState(false);

  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineTarget, setDeadlineTarget] = useState<OpsProjectPoolRow | null>(null);
  const [deadlineRows, setDeadlineRows] = useState<OpsProjectStageDeadline[]>(normalizeStageDeadlines());
  const [deadlineAuto, setDeadlineAuto] = useState(true);
  const [deadlineSkipWeekend, setDeadlineSkipWeekend] = useState(true);
  const [deadlineIntervals, setDeadlineIntervals] = useState(defaultStageIntervals);
  const [deadlineSaving, setDeadlineSaving] = useState(false);

  const openChange = (row: OpsProjectPoolRow, field: "status" | "stage") => {
    setChTarget(row);
    setChField(field);
    setChValue(field === "status" ? row.status : row.stage);
    setChComment("");
    setChOpen(true);
  };

  const confirmChange = async () => {
    if (!chTarget || !chValue) return;
    if (chValue === (chField === "status" ? chTarget.status : chTarget.stage)) return;
    setChSaving(true);
    try {
      if (chField === "status") await opsApi.changeProjectStatus(chTarget.id, chValue, chComment || undefined);
      else await opsApi.changeProjectStage(chTarget.id, chValue, chComment || undefined);
      message.success(chField === "status" ? "状态已更新" : "阶段已更新");
      setChOpen(false);
      await reload();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setChSaving(false);
    }
  };

  const openRemark = (row: OpsProjectPoolRow) => {
    setRmTarget(row);
    setRmValue(row.remark || "");
    setRmOpen(true);
  };

  const saveRemark = async () => {
    if (!rmTarget) return;
    setRmSaving(true);
    try {
      await opsApi.changeProjectRemark(rmTarget.id, rmValue);
      message.success("备注已更新");
      setRmOpen(false);
      await reload();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setRmSaving(false);
    }
  };

  const openLogs = async (row: OpsProjectPoolRow) => {
    setLogsProject(row);
    setLogsOpen(true);
    setLogKind("all");
    setLogs([]);
    setLogsLoading(true);
    try {
      const result = await opsApi.projectStatusLogs(row.id);
      setLogs(result.logs);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const openMembers = async (row: OpsProjectPoolRow) => {
    setMemProject(row);
    setMemOpen(true);
    setMembers([]);
    setMemLoading(true);
    try {
      const result = await opsApi.projectPoolMembers(row.id);
      setMembers(result.members);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载协作成员失败");
    } finally {
      setMemLoading(false);
    }
  };

  const loadSegTickets = async (projectId: string, segmentIds: number[], segments = segTabs, projectName = "") => {
    setSegSegmentId(segmentIds);
    setSegDetailOpen(false);
    setSegDetail(null);
    setSegDetailEvents([]);
    setSegTickets([]);
    setSegLoading(true);
    try {
      const results = await Promise.all(
        segmentIds.map(async (segmentId) => {
          const segment = segments.find((item) => item.id === segmentId);
          const result = await opsApi.projectSegmentTickets(projectId, segmentId);
          return result.tickets.map((ticket) => ({ ...ticket, projectId, projectName, segmentId, segmentName: segment?.name }) satisfies SegmentTicketWithSource);
        }),
      );
      const unique = new Map<string, SegmentTicketWithSource>();
      for (const ticket of results.flat()) unique.set(ticket.id, ticket);
      setSegTickets([...unique.values()]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载工单失败");
    } finally {
      setSegLoading(false);
    }
  };

  const openSegTickets = (row: OpsProjectPoolRow, segment: { id: number; name: string }) => {
    setSegTitle(`环节工单 · ${row.name}`);
    setSegTabs(row.segments);
    setSegProjectId(row.id);
    setSegProjectName(row.name);
    setSegOpen(true);
    void loadSegTickets(row.id, [segment.id], row.segments, row.name);
  };

  const openGroupTickets = async (title: string, rows: OpsProjectPoolRow[], mode: "overdue" | "unfinished", segmentIds?: number[], ownerName?: string) => {
    setSegTitle(title);
    setSegTabs([]);
    setSegProjectId("");
    setSegProjectName("");
    setSegSegmentId([]);
    setSegOpen(true);
    setSegDetailOpen(false);
    setSegDetail(null);
    setSegDetailEvents([]);
    setSegTickets([]);
    setSegLoading(true);
    try {
      const segmentFilter = new Set((segmentIds || []).filter(Boolean));
      const pairs = rows.flatMap((row) => row.segments.filter((segment) => !segmentFilter.size || segmentFilter.has(segment.id)).map((segment) => ({ row, segment })));
      const results = await Promise.all(
        pairs.map(async ({ row, segment }) => {
          const result = await opsApi.projectSegmentTickets(row.id, segment.id);
          return result.tickets.map((ticket) => ({ ...ticket, projectId: row.id, projectName: row.name, projectStage: row.stage, segmentId: segment.id, segmentName: segment.name }) satisfies SegmentTicketWithSource);
        }),
      );
      const unique = new Map<string, SegmentTicketWithSource>();
      for (const ticket of results.flat()) {
        if (mode === "overdue" && !ticket.overdue) continue;
        if (ownerName && ticket.ownerName !== ownerName) continue;
        unique.set(ticket.id, ticket);
      }
      setSegTickets([...unique.values()]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载工单失败");
    } finally {
      setSegLoading(false);
    }
  };

  const switchSegTab = (segmentId: number | number[]) => {
    const segmentIds = Array.isArray(segmentId) ? segmentId : [segmentId];
    if (!segProjectId || !segmentIds.length) return;
    void loadSegTickets(segProjectId, segmentIds, segTabs, segProjectName);
  };

  const openSegTicketDetail = async (ticket: OpsSegmentTicket) => {
    const source = ticket as SegmentTicketWithSource;
    const projectId = source.projectId || segProjectId;
    const segmentId = source.segmentId ?? segSegmentId[0];
    if (!projectId || segmentId == null) return;
    setSegDetailOpen(true);
    setSegDetail(null);
    setSegDetailEvents([]);
    setSegDetailLoading(true);
    try {
      const result = await opsApi.projectSegmentTicketDetail(projectId, segmentId, ticket.id);
      setSegDetail(result.ticket);
      setSegDetailEvents(result.events);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载工单详情失败");
    } finally {
      setSegDetailLoading(false);
    }
  };

  const closeSegTickets = () => {
    setSegOpen(false);
    setSegDetailOpen(false);
    setSegTabs([]);
    setSegProjectName("");
    setSegSegmentId([]);
  };

  const openDeadlineEdit = (row: OpsProjectPoolRow) => {
    setDeadlineTarget(row);
    setDeadlineRows(normalizeStageDeadlines(row.stageDeadlines));
    setDeadlineIntervals(defaultStageIntervals);
    setDeadlineAuto(true);
    setDeadlineSkipWeekend(true);
    setDeadlineOpen(true);
  };

  const updateDeadlineDate = (index: number, date: string) => {
    if (index === 0 && deadlineAuto) {
      setDeadlineRows(inferStageDeadlines(date, deadlineIntervals, deadlineSkipWeekend));
      return;
    }
    setDeadlineRows((old) => old.map((item, i) => (i === index ? { ...item, date } : item)));
  };

  const updateDeadlineInterval = (index: number, value: number | string | null) => {
    const next = deadlineIntervals.map((n, i) => (i === index ? Math.max(0, Number(value) || 0) : n));
    setDeadlineIntervals(next);
    if (deadlineAuto && deadlineRows[0]?.date) setDeadlineRows(inferStageDeadlines(deadlineRows[0].date, next, deadlineSkipWeekend));
  };

  const toggleDeadlineSkipWeekend = (checked: boolean) => {
    setDeadlineSkipWeekend(checked);
    if (deadlineAuto && deadlineRows[0]?.date) setDeadlineRows(inferStageDeadlines(deadlineRows[0].date, deadlineIntervals, checked));
  };

  const saveDeadlineRows = async () => {
    if (!deadlineTarget) return;
    if (deadlineRows.some((item) => !item.date)) {
      message.warning("请补全 5 个阶段的交付日期");
      return;
    }
    setDeadlineSaving(true);
    try {
      await opsApi.changeProjectStageDeadlines(deadlineTarget.id, deadlineRows);
      message.success("计划交付日期已更新");
      setDeadlineOpen(false);
      await reload();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setDeadlineSaving(false);
    }
  };

  return {
    change: {
      open: chOpen,
      field: chField,
      target: chTarget,
      value: chValue,
      comment: chComment,
      saving: chSaving,
      setValue: setChValue,
      setComment: setChComment,
      confirm: confirmChange,
      close: () => setChOpen(false),
    },
    logs: {
      open: logsOpen,
      project: logsProject,
      rows: logs,
      loading: logsLoading,
      kind: logKind,
      setKind: setLogKind,
      close: () => setLogsOpen(false),
    },
    remark: {
      open: rmOpen,
      target: rmTarget,
      value: rmValue,
      saving: rmSaving,
      setValue: setRmValue,
      save: saveRemark,
      close: () => setRmOpen(false),
    },
    members: {
      open: memOpen,
      project: memProject,
      rows: members,
      loading: memLoading,
      close: () => setMemOpen(false),
    },
    segmentTickets: {
      open: segOpen,
      title: segTitle,
      tabs: segTabs,
      tickets: segTickets,
      loading: segLoading,
      segmentId: segSegmentId,
      switchTab: switchSegTab,
      close: closeSegTickets,
    },
    segmentTicketDetail: {
      open: segDetailOpen,
      ticket: segDetail,
      events: segDetailEvents,
      loading: segDetailLoading,
      close: () => setSegDetailOpen(false),
    },
    deadline: {
      open: deadlineOpen,
      target: deadlineTarget,
      rows: deadlineRows,
      auto: deadlineAuto,
      skipWeekend: deadlineSkipWeekend,
      intervals: deadlineIntervals,
      saving: deadlineSaving,
      setAuto: setDeadlineAuto,
      changeSkipWeekend: toggleDeadlineSkipWeekend,
      changeInterval: updateDeadlineInterval,
      changeDate: updateDeadlineDate,
      save: saveDeadlineRows,
      close: () => setDeadlineOpen(false),
    },
    actions: {
      openChange,
      openRemark,
      openLogs,
      openMembers,
      openSegTickets,
      openGroupTickets,
      openSegTicketDetail,
      openDeadlineEdit,
    },
  };
}
