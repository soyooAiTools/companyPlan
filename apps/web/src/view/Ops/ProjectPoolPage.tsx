// 项目池:策划看自己(制片)的项目、管理员看全部。可改项目状态(同步 soyoo+飞书)、留富文本评论、看状态流转。
// 两个 tab:全部项目 / 超时关注;项目状态超时整行标红。超时是服务端按「项目状态时间」阈值实时算的。
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import zhCN from "antd/es/date-picker/locale/zh_CN";
import { App, Avatar, Button, Checkbox, DatePicker, Drawer, Empty, Input, InputNumber, List, Modal, Select, Space, Spin, Table, Tag, Timeline, Tooltip, Typography } from "antd";
import { EditOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import SegmentedTabs from "../../components/SegmentedTabs";
import RichContentView from "../../components/RichContentView";
import { opsApi } from "../../api/modules/ops";
import type { OpsProjectPoolRow, OpsProjectStatusLog, OpsProjectPoolMember, OpsSegmentTicket, OpsProjectStageDeadline } from "../../api/modules/ops";
import RichTextEditor from "./RichTextEditor";
import { fmtDateTime, fmtDuration } from "../../utils/format";
import { PROJECT_STATUSES, PROJECT_STAGES, statusStyle, OPS_TOOLBAR_CARD } from "./constants";

dayjs.locale("zh-cn");

console.log("%c[OPS PROJECT POOL] ProjectPoolPage loaded: stage deadline editor enabled", "background:#111827;color:#facc15;font-size:14px;font-weight:700;padding:6px 10px;border-radius:4px;");

const fmtH = (h?: number | null) => {
  if (h == null) return "-";
  const neg = h < 0;
  const a = Math.abs(h);
  const s = a >= 24 ? `${Math.floor(a / 24)}天${a % 24 ? `${a % 24}h` : ""}` : `${a}h`;
  return neg ? `-${s}` : s;
};

const fmtStageDate = (date?: string) => {
  if (!date) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[2]}-${m[3]}` : date;
};

const deadlineRemain = (date?: string) => {
  if (!date) return null;
  const d = dayjs(date, "YYYY-MM-DD");
  if (!d.isValid()) return null;
  const diff = d.startOf("day").diff(dayjs().startOf("day"), "day");
  if (diff > 0) return { text: `剩${diff}天`, color: "#0f766e" };
  if (diff === 0) return { text: "今天", color: "#0f766e" };
  return { text: `逾${Math.abs(diff)}天`, color: "#cf1322" };
};

const stageDescriptionFallback: Record<string, string> = {
  interactive_alpha: String.raw`不含灯光\UI音效`,
  feature_complete: String.raw`含UI\音效`,
  final_delivery: "封包版",
};

const stageDeadlineTemplates: OpsProjectStageDeadline[] = [
  { key: "asset_confirm", name: "资产确认", date: "" },
  { key: "scene_still", name: "场景单帧版本", date: "" },
  { key: "interactive_alpha", name: "可交互初版", description: String.raw`不含灯光\UI音效`, date: "" },
  { key: "feature_complete", name: "功能完整版", description: String.raw`含UI\音效`, date: "" },
  { key: "final_delivery", name: "最终交付版", description: "封包版", date: "" },
];
const defaultStageIntervals = [2, 3, 7, 3];

const normalizeStageDeadlines = (items?: OpsProjectStageDeadline[]) => {
  const byKey = new Map((items || []).map((item) => [item.key, item]));
  return stageDeadlineTemplates.map((tpl) => {
    const old = byKey.get(tpl.key);
    return { ...tpl, date: old?.date || "" };
  });
};

const addDeadlineDays = (date: dayjs.Dayjs, days: number, skipWeekend: boolean) => {
  let cursor = date;
  let remaining = Math.max(0, Number(days) || 0);
  while (remaining > 0) {
    cursor = cursor.add(1, "day");
    if (!skipWeekend || (cursor.day() !== 0 && cursor.day() !== 6)) remaining -= 1;
  }
  return cursor;
};

const inferStageDeadlines = (baseDate: string, intervals: number[], skipWeekend: boolean) => {
  if (!baseDate) return normalizeStageDeadlines();
  let cursor = dayjs(baseDate);
  return stageDeadlineTemplates.map((tpl, index) => {
    if (index > 0) cursor = addDeadlineDays(cursor, intervals[index - 1], skipWeekend);
    return { ...tpl, date: cursor.format("YYYY-MM-DD") };
  });
};

const stageDeadlineName = (item: { key: string; name: string; description?: string }) => {
  const description = item.description || stageDescriptionFallback[item.key] || "";
  return description ? `${item.name || item.key}（${description}）` : item.name || item.key;
};

const nextStageDeadline = (stage: string, items: { key: string; name: string; description?: string; date: string }[]) => {
  if (!items.length) return null;
  const currentIndex = items.findIndex((item) => item.name === stage || item.key === stage);
  if (currentIndex < 0) return items[0];
  if (currentIndex >= items.length - 1) return items[currentIndex];
  return items[currentIndex + 1];
};

// 带问号提示的表头(鼠标移上去说明该列含义)
const headerTip = (text: string, tip: string) => (
  <span>
    {text}{" "}
    <Tooltip title={tip}>
      <QuestionCircleOutlined style={{ color: "#94a3b8", cursor: "help" }} />
    </Tooltip>
  </span>
);

export default function ProjectPoolPage() {
  const { message } = App.useApp();
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

  // 修改 状态/阶段 通用弹框(两者交互一致,共用)
  const [chOpen, setChOpen] = useState(false);
  const [chField, setChField] = useState<"status" | "stage">("status");
  const [chTarget, setChTarget] = useState<OpsProjectPoolRow | null>(null);
  const [chValue, setChValue] = useState("");
  const [chComment, setChComment] = useState("");
  const [chSaving, setChSaving] = useState(false);

  // 流转记录抽屉
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsProject, setLogsProject] = useState<OpsProjectPoolRow | null>(null);
  const [logs, setLogs] = useState<OpsProjectStatusLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logKind, setLogKind] = useState<"all" | "status" | "stage" | "remark">("all"); // 流转记录按类型筛选

  // 备注编辑弹框(富文本)
  const [rmOpen, setRmOpen] = useState(false);
  const [rmTarget, setRmTarget] = useState<OpsProjectPoolRow | null>(null);
  const [rmValue, setRmValue] = useState("");
  const [rmSaving, setRmSaving] = useState(false);

  // 协作成员弹框
  const [memOpen, setMemOpen] = useState(false);
  const [memProject, setMemProject] = useState<OpsProjectPoolRow | null>(null);
  const [members, setMembers] = useState<OpsProjectPoolMember[]>([]);
  const [memLoading, setMemLoading] = useState(false);

  // 环节工单弹框(点目前环节里的某环节 → 看该环节下所有人的未完成工单)
  const [segOpen, setSegOpen] = useState(false);
  const [segTitle, setSegTitle] = useState("");
  const [segTickets, setSegTickets] = useState<OpsSegmentTicket[]>([]);
  const [segLoading, setSegLoading] = useState(false);

  // 临时校准计划交付日期:写 soyoo stage_deadlines,不改变当前制作阶段
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineTarget, setDeadlineTarget] = useState<OpsProjectPoolRow | null>(null);
  const [deadlineRows, setDeadlineRows] = useState<OpsProjectStageDeadline[]>(normalizeStageDeadlines());
  const [deadlineAuto, setDeadlineAuto] = useState(true);
  const [deadlineSkipWeekend, setDeadlineSkipWeekend] = useState(true);
  const [deadlineIntervals, setDeadlineIntervals] = useState(defaultStageIntervals);
  const [deadlineSaving, setDeadlineSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r =
        tab === "stale"
          ? await opsApi.projectPoolStale({ page, pageSize })
          : // 选了具体状态(可多选)就按状态查;没选则后端默认只查「开启监控」的状态
            await opsApi.projectPool({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter });
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, pageSize, statusFilter, stageFilter, debounced]);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // 表格内部滚动高度:实测「表格区域」高度 − 表头/分页固定占位,做到分页精准贴底(自适应工具栏换行/各种屏高)
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(420);
  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    const FIXED = 112; // 表头(~46)+ 分页(~56)+ 余量
    const update = () => setScrollY(Math.max(160, el.clientHeight - FIXED));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 打开「修改状态/阶段」弹框(field 决定改哪个)
  const openChange = (r: OpsProjectPoolRow, field: "status" | "stage") => {
    setChTarget(r);
    setChField(field);
    setChValue(field === "status" ? r.status : r.stage);
    setChComment("");
    setChOpen(true);
  };
  const confirmChange = async () => {
    if (!chTarget || !chValue) return;
    if (chValue === (chField === "status" ? chTarget.status : chTarget.stage)) return; // 未变化,不提交(避免重置停留计时)
    setChSaving(true);
    try {
      if (chField === "status") await opsApi.changeProjectStatus(chTarget.id, chValue, chComment || undefined);
      else await opsApi.changeProjectStage(chTarget.id, chValue, chComment || undefined);
      message.success(chField === "status" ? "状态已更新" : "阶段已更新");
      setChOpen(false);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setChSaving(false);
    }
  };

  // 备注:打开编辑(富文本)+ 保存
  const openRemark = (r: OpsProjectPoolRow) => {
    setRmTarget(r);
    setRmValue(r.remark || "");
    setRmOpen(true);
  };
  const saveRemark = async () => {
    if (!rmTarget) return;
    setRmSaving(true);
    try {
      await opsApi.changeProjectRemark(rmTarget.id, rmValue);
      message.success("备注已更新");
      setRmOpen(false);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setRmSaving(false);
    }
  };

  const openLogs = async (r: OpsProjectPoolRow) => {
    setLogsProject(r);
    setLogsOpen(true);
    setLogKind("all");
    setLogs([]);
    setLogsLoading(true);
    try {
      const x = await opsApi.projectStatusLogs(r.id);
      setLogs(x.logs);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  // 通知深链:URL 带 ?project=<id> 时,在已加载的项目里找到它并打开流转抽屉(找到即打开并清掉参数)
  const [searchParams, setSearchParams] = useSearchParams();
  const projectParam = searchParams.get("project");
  useEffect(() => {
    if (!projectParam || !rows.length) return;
    const row = rows.find((r) => r.id === projectParam);
    if (row) {
      void openLogs(row);
      searchParams.delete("project");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectParam, rows]);

  const openMembers = async (r: OpsProjectPoolRow) => {
    setMemProject(r);
    setMemOpen(true);
    setMembers([]);
    setMemLoading(true);
    try {
      const x = await opsApi.projectPoolMembers(r.id);
      setMembers(x.members);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载协作成员失败");
    } finally {
      setMemLoading(false);
    }
  };

  const openSegTickets = async (r: OpsProjectPoolRow, seg: { id: number; name: string }) => {
    setSegTitle(`${r.name} · ${seg.name}`);
    setSegOpen(true);
    setSegTickets([]);
    setSegLoading(true);
    try {
      const x = await opsApi.projectSegmentTickets(r.id, seg.id);
      setSegTickets(x.tickets);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载工单失败");
    } finally {
      setSegLoading(false);
    }
  };

  const openDeadlineEdit = (r: OpsProjectPoolRow) => {
    setDeadlineTarget(r);
    setDeadlineRows(normalizeStageDeadlines(r.stageDeadlines));
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
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setDeadlineSaving(false);
    }
  };

  // 剩余时间(后端按工作时间算好:正=剩、负=超期)
  const segRemain = (t: OpsSegmentTicket) => {
    const r = t.remainingHours;
    if (r == null) return null;
    if (r < 0) return <span style={{ color: t.overdue ? "#cf1322" : "#fa8c16", fontSize: 12 }}>超期 {fmtDuration(-r)}</span>; // 过预警=红,仅过交付=橙
    return <span style={{ color: "#64748b", fontSize: 12 }}>剩 {fmtDuration(r)}</span>;
  };

  // 未完成工单汇总:2×2 网格,标签定宽 + 数字紧跟。进行中/排队中(按状态)、工单超时(临期)/工单逾期(已过截止)
  const ticketSummaryCell = (r: OpsProjectPoolRow) => {
    const g = r.ticketGroups || {};
    const item = (label: string, n: number, color?: string) => (
      <div style={{ display: "flex", alignItems: "baseline", lineHeight: "20px" }}>
        <span style={{ color: "#64748b", width: 52, flexShrink: 0 }}>{label}</span>
        <span style={{ color: n ? color ?? "#0f172a" : "#94a3b8", fontWeight: n ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{n}</span>
      </div>
    );
    return (
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", justifyContent: "start", columnGap: 20, rowGap: 7, fontSize: 12 }}>
        {item("进行中", g["进行中"] || 0)}
        {item("排队中", g["排队中"] || 0)}
        {item("工单超时", r.atRisk || 0, "#d46b08")}
        {item("工单逾期", r.overdue || 0, "#cf1322")}
      </div>
    );
  };

  const stageDeadlinesCell = (r: OpsProjectPoolRow) => {
    const items = Array.isArray(r.stageDeadlines) ? r.stageDeadlines : [];
    const edit = (
      <Tooltip title="校准计划交付日期">
        <Button
          type="text"
          size="small"
          icon={<EditOutlined style={{ fontSize: 15 }} />}
          style={{ color: "#0f766e" }}
          onClick={(e) => {
            e.stopPropagation();
            openDeadlineEdit(r);
          }}
        />
      </Tooltip>
    );
    if (!items.length) {
      return (
        <Space size={6}>
          <Typography.Text type="secondary">未设置</Typography.Text>
          {edit}
        </Space>
      );
    }
    const next = nextStageDeadline(r.stage, items);
    if (!next) {
      return (
        <Space size={6}>
          <Typography.Text type="secondary">未设置</Typography.Text>
          {edit}
        </Space>
      );
    }
    const currentDeadlineIndex = items.findIndex((item) => item.name === r.stage || item.key === r.stage);
    const isNextOverdue = !!next.date && dayjs(next.date, "YYYY-MM-DD").isBefore(dayjs(), "day");
    const remain = deadlineRemain(next.date);
    const full = (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 44px", gap: "6px 10px", fontSize: 12, color: "#334155", width: 256, maxWidth: 256 }}>
        {items.map((item, index) => {
          const isCurrent = item.name === r.stage || item.key === r.stage;
          const isNext = item.key === next.key;
          const isPast = currentDeadlineIndex >= 0 && index < currentDeadlineIndex;
          const description = item.description || stageDescriptionFallback[item.key] || "";
          return (
            <div key={item.key} style={{ display: "contents" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, color: isCurrent ? "#1d4ed8" : isNext ? "#0f766e" : isPast ? "#94a3b8" : "#334155", fontWeight: isCurrent || isNext ? 700 : 400 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: isCurrent ? "#3b82f6" : isNext ? "#14b8a6" : isPast ? "#e2e8f0" : "#cbd5e1",
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {item.name || item.key}
                  {description ? <span style={{ marginLeft: 4, color: "#64748b", fontSize: 10, fontWeight: 400 }}>({description})</span> : null}
                </span>
                {isCurrent ? <Tag color="blue" style={{ marginInlineEnd: 0, lineHeight: "16px", fontSize: 11, flexShrink: 0 }}>当前</Tag> : null}
                {!isCurrent && isNext ? <Tag color="green" style={{ marginInlineEnd: 0, lineHeight: "16px", fontSize: 11, flexShrink: 0 }}>下版</Tag> : null}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", color: isCurrent ? "#1d4ed8" : isNext ? "#0f766e" : isPast ? "#94a3b8" : "#0f172a", fontWeight: isCurrent || isNext ? 700 : 600 }}>{fmtStageDate(item.date)}</span>
            </div>
          );
        })}
      </div>
    );
    return (
      <Space size={4}>
        <Tooltip
          title={full}
          placement="topLeft"
          color="#fff"
          overlayStyle={{ maxWidth: "none" }}
          overlayInnerStyle={{ width: 280, maxWidth: 280, boxShadow: "0 10px 26px rgba(15, 23, 42, 0.16)", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "inline-flex", flexDirection: "column", gap: 2, maxWidth: 190 }}>
            <span style={{ color: "#0f172a", fontWeight: 700, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              ({fmtStageDate(next.date)}){next.name || next.key}
            </span>
            {remain ? <span style={{ color: remain.color, fontSize: 13, lineHeight: "15px", fontWeight: isNextOverdue ? 700 : 500 }}>{remain.text}</span> : null}
          </div>
        </Tooltip>
        {edit}
      </Space>
    );
  };

  const columns = [
    {
      title: "项目名称",
      key: "name",
      width: 220,
      render: (_: unknown, r: OpsProjectPoolRow) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a", lineHeight: 1.35, wordBreak: "break-all" }}>{r.name || "—"}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{r.tenantName || "未填客户"}</div>
        </div>
      ),
    },
    {
      title: "策划",
      key: "planner",
      width: 150,
      render: (_: unknown, r: OpsProjectPoolRow) => {
        if (!r.plannerName) return <Typography.Text type="secondary">未指定</Typography.Text>;
        const avatars = (r.planners || []).filter((p) => p.avatar); // 只展示有头像的策划,没头像不展示
        return (
          <Space size={6}>
            {avatars.length ? (
              <Avatar.Group size={24}>
                {avatars.map((p, i) => (
                  <Tooltip key={i} title={p.name}>
                    <Avatar size={24} src={p.avatar} />
                  </Tooltip>
                ))}
              </Avatar.Group>
            ) : null}
            <span style={{ color: "#334155" }}>{r.plannerName}</span>
          </Space>
        );
      },
    },
    {
      title: headerTip("当前阶段", "项目当前所处的制作阶段。可任意调整,变更会记入流转。"),
      key: "stage",
      width: 150,
      render: (_: unknown, r: OpsProjectPoolRow) => (
        <Space size={6}>
          <Tag style={{ background: "#f0f5ff", color: "#1d39c4", padding: "2px 10px", fontSize: 13, borderRadius: 6, border: "none", margin: 0 }}>{r.stage || "—"}</Tag>
          <Tooltip title="修改阶段">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined style={{ fontSize: 15 }} />}
              style={{ color: "#0f766e" }}
              onClick={(e) => {
                e.stopPropagation();
                openChange(r, "stage");
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: headerTip("下版交付时间", "根据当前阶段显示下版交付时间;鼠标悬停可查看完整阶段交付计划。这里只展示,不参与阶段停留超时判断。"),
      key: "stageDeadlines",
      width: 210,
      render: (_: unknown, r: OpsProjectPoolRow) => stageDeadlinesCell(r),
    },
    {
      title: "当前状态",
      key: "status",
      width: 132,
      render: (_: unknown, r: OpsProjectPoolRow) => (
        <Space size={6}>
          <Tag style={{ ...statusStyle(r.status), padding: "2px 10px", fontSize: 13, borderRadius: 6, border: "none", margin: 0 }}>{r.status || "—"}</Tag>
          <Tooltip title="修改状态">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined style={{ fontSize: 15 }} />}
              style={{ color: "#0f766e" }}
              onClick={(e) => {
                e.stopPropagation();
                openChange(r, "status");
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: headerTip("备注", "项目备注(可富文本、附图)。修改会记入流转记录,可在流转记录里按「备注」筛选查看修改历史。"),
      key: "remark",
      width: 180,
      render: (_: unknown, r: OpsProjectPoolRow) => {
        const text = (r.remark || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); // 纯文本预览
        const preview = text || (r.remark ? "[图文备注]" : "");
        return (
          <Space size={4} align="start">
            {preview ? (
              // 只显示预览;点整行 → 侧边栏看完整备注(含图文)
              <span style={{ fontSize: 13, color: "#334155", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", maxWidth: 150 }}>{preview}</span>
            ) : (
              <Typography.Text type="secondary">—</Typography.Text>
            )}
            <Tooltip title="修改备注">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined style={{ fontSize: 15 }} />}
                style={{ color: "#0f766e" }}
                onClick={(e) => {
                  e.stopPropagation();
                  openRemark(r);
                }}
              />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: headerTip("目前环节", "该项目未完成工单涉及的环节,及每个环节的未完成工单数。点击环节查看该环节下所有人的未完成工单。"),
      key: "segments",
      width: 180,
      render: (_: unknown, r: OpsProjectPoolRow) =>
        r.segments.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
            {r.segments.map((s) => (
              <Button
                key={s.id}
                type="link"
                size="small"
                style={{ padding: 0, height: "auto", fontSize: 13 }}
                onClick={(e) => {
                  e.stopPropagation();
                  openSegTickets(r, s);
                }}>
                {s.name}({s.count})
              </Button>
            ))}
          </div>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: "协作",
      dataIndex: "memberCount",
      width: 76,
      align: "center" as const,
      render: (v: number, r: OpsProjectPoolRow) => (
        <Button
          type="link"
          size="small"
          disabled={!v}
          style={{ padding: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            openMembers(r);
          }}>
          {v}人
        </Button>
      ),
    },
    {
      title: headerTip(
        "工单状态",
        "统计该项目未完成工单(不含已完成):进行中/排队中按状态分;工单超时=已过预警线、未到截止(临期);工单逾期=已过截止仍未完成。",
      ),
      key: "tickets",
      width: 200,
      render: (_: unknown, r: OpsProjectPoolRow) => ticketSummaryCell(r),
    },
    {
      title: headerTip("状态停留", "项目保持在「当前状态」的工作时长(按 10:00-19:00 算、排除夜间)。超过「设置 → 项目状态时间」该状态阈值时标红。"),
      key: "stuck",
      width: 124,
      render: (_: unknown, r: OpsProjectPoolRow) =>
        r.isStale ? (
          <Tag color="red">状态超时 {fmtH(r.overByHours)}</Tag>
        ) : r.stuckHours != null ? (
          <span style={{ color: "#94a3b8" }}>{fmtH(r.stuckHours)}</span>
        ) : (
          "—"
        ),
    },
    {
      title: headerTip("阶段停留", "项目保持在「当前阶段」的工作时长(按 10:00-19:00 算)。超过「设置 → 项目阶段时间」该阶段阈值时标红;没设阶段不计。"),
      key: "stageStuck",
      width: 124,
      render: (_: unknown, r: OpsProjectPoolRow) =>
        r.stageStale ? (
          <Tag color="volcano">阶段超时 {fmtH(r.stageOverByHours)}</Tag>
        ) : r.stageStuckHours != null ? (
          <span style={{ color: "#94a3b8" }}>{fmtH(r.stageStuckHours)}</span>
        ) : (
          "—"
        ),
    },
  ];

  const shownLogs = logs.filter((lg) => logKind === "all" || lg.kind === logKind); // 流转记录按类型筛选

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 32px)" }}>
      <div style={{ ...OPS_TOOLBAR_CARD, flexShrink: 0 }}>
        <SegmentedTabs
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
          options={[
            { label: "全部项目", value: "all" },
            { label: "超时关注", value: "stale" },
          ]}
        />
        {tab === "all" ? (
          <>
            <Input.Search placeholder="搜索 项目/客户/策划" allowClear style={{ width: 240 }} onChange={(e) => setSearch(e.target.value)} />
            <Select
              allowClear
              mode="multiple"
              placeholder="项目状态(可多选)"
              style={{ minWidth: 190, maxWidth: 360 }}
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
              maxTagCount="responsive"
              options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))}
            />
            <Select
              allowClear
              mode="multiple"
              placeholder="制作阶段(可多选)"
              style={{ minWidth: 190, maxWidth: 360 }}
              value={stageFilter}
              onChange={(v) => {
                setStageFilter(v);
                setPage(1);
              }}
              maxTagCount="responsive"
              options={PROJECT_STAGES.map((s) => ({ value: s, label: s }))}
            />
          </>
        ) : (
          <Typography.Text type="secondary">超过「状态时间」或「阶段时间」阈值仍未流转的项目(整行标红),需重点跟进。</Typography.Text>
        )}
      </div>

      {/* 表格区域:flex 填满剩余高度,内部滚动(表头固定、分页贴底) */}
      <div ref={tableWrapRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* 加大行高、表头底色,让表格更透气好看;超时行标红且 hover 仍保持红 */}
      <style>{`
        .ops-pool-table .ant-table-tbody > tr > td { padding-top: 14px; padding-bottom: 14px; }
        .ops-pool-table .ant-table-thead > tr > th { padding-top: 11px; padding-bottom: 11px; background: #f8fafc; font-weight: 600; }
        .ops-pool-table .ant-table-tbody > tr:not(.ops-pool-stale):hover > td { background: transparent !important; }
        .ops-pool-table .ops-pool-stale > td { background: #fff1f0 !important; }
        .ops-pool-table .ops-pool-stale:hover > td { background: #fff1f0 !important; }
        .ops-pool-table .ant-table-tbody > tr:hover > td:first-child { box-shadow: inset 3px 0 0 #0f766e; }
      `}</style>
      <Table
        className="ops-pool-table"
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={columns}
        size="small"
        scroll={{ x: 1740, y: scrollY }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: (t) => `共 ${t} 个项目`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        onRow={(r) => ({
          onClick: () => {
            if (window.getSelection()?.toString()) return; // 正在框选文本(复制)→ 不打开抽屉
            openLogs(r);
          },
          className: r.isStale || r.stageStale ? "ops-pool-stale" : undefined,
          style: { cursor: "pointer" },
        })}
      />
      </div>

      <Modal
        title={`${chField === "status" ? "修改项目状态" : "修改制作阶段"} · ${chTarget?.name ?? ""}`}
        open={chOpen}
        onOk={confirmChange}
        confirmLoading={chSaving}
        onCancel={() => setChOpen(false)}
        okText="确认修改"
        cancelText="取消"
        okButtonProps={{ disabled: !chValue || chValue === (chField === "status" ? chTarget?.status : chTarget?.stage) }}
        width={760}
        destroyOnHidden>
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <div>
            <span style={{ marginRight: 8 }}>{chField === "status" ? "新状态:" : "新阶段:"}</span>
            <Select
              value={chValue || undefined}
              placeholder={chField === "status" ? "选择状态" : "选择阶段"}
              style={{ width: 200 }}
              options={(chField === "status" ? PROJECT_STATUSES : PROJECT_STAGES).map((s) => ({
                value: s,
                label: s === (chField === "status" ? chTarget?.status : chTarget?.stage) ? `${s}(当前)` : s,
                disabled: s === (chField === "status" ? chTarget?.status : chTarget?.stage), // 当前值不可选
              }))}
              onChange={setChValue}
            />
            {chTarget ? (
              <span style={{ marginLeft: 12, color: "#94a3b8" }}>当前:{(chField === "status" ? chTarget.status : chTarget.stage) || "未设置"}</span>
            ) : null}
          </div>
          <div>
            <div style={{ marginBottom: 6, color: "#64748b" }}>备注(可选,可附图):</div>
            <RichTextEditor value={chComment} onChange={setChComment} projectId={chTarget?.id} />
          </div>
        </Space>
      </Modal>

      <Modal
        title={`修改备注 · ${rmTarget?.name ?? ""}`}
        open={rmOpen}
        onOk={saveRemark}
        confirmLoading={rmSaving}
        onCancel={() => setRmOpen(false)}
        okText="保存"
        cancelText="取消"
        width={760}
        destroyOnHidden>
        <RichTextEditor value={rmValue} onChange={setRmValue} projectId={rmTarget?.id} />
      </Modal>

      <Modal
        title={`校准计划交付日期 · ${deadlineTarget?.name ?? ""}`}
        open={deadlineOpen}
        onOk={saveDeadlineRows}
        confirmLoading={deadlineSaving}
        onCancel={() => setDeadlineOpen(false)}
        okText="保存"
        cancelText="取消"
        width={760}
        destroyOnHidden>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {deadlineAuto ? (
            <div style={{ color: "#cf1322", fontSize: 15, fontWeight: 700 }}>
              填写 <span style={{ fontWeight: 800 }}>【资产确认】</span> 时间后自动推算后续交付时间
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <Space size={14}>
              <Checkbox checked={deadlineAuto} onChange={(e) => setDeadlineAuto(e.target.checked)}>
                自动推断时间
              </Checkbox>
              <Checkbox checked={deadlineSkipWeekend} disabled={!deadlineAuto} onChange={(e) => toggleDeadlineSkipWeekend(e.target.checked)}>
                排除周末
              </Checkbox>
            </Space>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: 8, alignItems: "center" }}>
              {stageDeadlineTemplates.slice(1).map((tpl, index) => (
                <span key={tpl.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#64748b", fontSize: 12 }}>
                  {tpl.name}
                  <InputNumber
                    min={0}
                    size="small"
                    value={deadlineIntervals[index]}
                    controls={false}
                    style={{ width: 44 }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(v) => updateDeadlineInterval(index, v)}
                  />
                  天
                </span>
              ))}
            </div>
          </div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
            {deadlineRows.map((item, index) => (
              <div
                key={item.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "34px minmax(190px, 1fr) 170px",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderTop: index ? "1px solid #e2e8f0" : "none",
                  background: index % 2 ? "#fff" : "#f8fafc",
                }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#eef2ff",
                    color: "#4f46e5",
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                  {index + 1}
                </span>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{item.name}</span>
                  {item.description ? <span style={{ marginLeft: 6, color: "#cf1322", fontSize: 12 }}>({item.description})</span> : null}
                  <div style={{ marginTop: 3, color: "#64748b", fontSize: 12 }}>
                    {index === 0 ? "资产确认结果交付客户" : `${stageDeadlineTemplates[index - 1].name} → ${item.name}`}
                  </div>
                </div>
                <DatePicker
                  allowClear={false}
                  locale={zhCN}
                  value={item.date ? dayjs(item.date) : null}
                  format="YYYY-MM-DD"
                  style={{ width: 160 }}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(date) => updateDeadlineDate(index, date ? date.format("YYYY-MM-DD") : "")}
                />
              </div>
            ))}
          </div>
        </Space>
      </Modal>

      <Drawer title={`项目名称:${logsProject?.name ?? ""}`} open={logsOpen} onClose={() => setLogsOpen(false)} width={460}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: "#0f172a" }}>项目流转记录</span>
          <SegmentedTabs
            value={logKind}
            onChange={setLogKind}
            options={[
              { label: "全部", value: "all" },
              { label: "状态", value: "status" },
              { label: "阶段", value: "stage" },
              { label: "备注", value: "remark" },
            ]}
          />
        </div>
        {logsLoading ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <Spin />
          </div>
        ) : shownLogs.length ? (
          <Timeline
            items={shownLogs.map((lg) => ({
              color: lg.kind === "stage" ? "purple" : lg.kind === "remark" ? "gold" : lg.toStatus === "已完成" ? "green" : "blue",
              children: (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Avatar size={28} src={lg.actorAvatar || undefined} style={{ flexShrink: 0, background: "#e2e8f0", color: "#475569", fontSize: 13 }}>
                      {(lg.actorName || "系").slice(0, 1)}
                    </Avatar>
                    <span style={{ fontWeight: 600 }}>{lg.actorName || "系统"}</span>
                    <Tag color={lg.kind === "stage" ? "purple" : lg.kind === "remark" ? "gold" : "blue"} style={{ marginInlineEnd: 0 }}>
                      {lg.kind === "stage" ? "阶段" : lg.kind === "remark" ? "备注" : "状态"}
                    </Tag>
                    {lg.kind !== "remark" && (
                      <span style={{ color: "#64748b" }}>
                        {lg.fromStatus ? `「${lg.fromStatus}」→ ` : ""}「{lg.toStatus}」
                      </span>
                    )}
                  </div>
                  <RichContentView html={lg.commentHtml} linkText="查看备注(含图片/视频)" modalTitle="备注详情" inlineStyle={{ marginTop: 4, fontSize: 13 }} />
                  <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>{fmtDateTime(lg.createdAt)}</div>
                </div>
              ),
            }))}
          />
        ) : (
          <Typography.Text type="secondary">暂无{logKind === "all" ? "" : logKind === "status" ? "状态" : logKind === "stage" ? "阶段" : "备注"}变更记录</Typography.Text>
        )}
      </Drawer>

      <Modal title={`协作成员 · ${memProject?.name ?? ""}`} open={memOpen} onCancel={() => setMemOpen(false)} footer={null} width={460}>
        {memLoading ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <Spin />
          </div>
        ) : members.length ? (
          <List
            dataSource={members}
            renderItem={(m) => (
              <List.Item>
                <List.Item.Meta
                  avatar={
                    <Avatar src={m.avatar || undefined} style={{ background: "#e2e8f0", color: "#475569" }}>
                      {(m.name || "?").slice(0, 1)}
                    </Avatar>
                  }
                  title={
                    <Space size={6} wrap>
                      <span>{m.name || m.username || "-"}</span>
                      {m.tags.map((t) => (
                        <Tag key={t} color={t === "制片" ? "geekblue" : "default"} style={{ marginInlineEnd: 0 }}>
                          {t}
                        </Tag>
                      ))}
                    </Space>
                  }
                  description={m.wechatName ? <span style={{ color: "#94a3b8", fontSize: 12 }}>微信:{m.wechatName}</span> : null}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无协作成员" />
        )}
      </Modal>

      <Modal title={`环节工单 · ${segTitle}`} open={segOpen} onCancel={() => setSegOpen(false)} footer={null} width={620}>
        {segLoading ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <Spin />
          </div>
        ) : segTickets.length ? (
          <List
            dataSource={segTickets}
            renderItem={(t) => (
              <List.Item>
                <List.Item.Meta
                  avatar={
                    <Avatar size={32} src={t.ownerAvatar || undefined} style={{ background: "#e2e8f0", color: "#475569" }}>
                      {(t.ownerName || "?").slice(0, 1)}
                    </Avatar>
                  }
                  title={
                    <Space size={8} wrap>
                      <span>{t.title}</span>
                      {segRemain(t)}
                    </Space>
                  }
                  description={
                    <Space size={10} wrap style={{ fontSize: 12 }}>
                      <span style={{ color: "#64748b" }}>负责人:{t.ownerName || "-"}</span>
                      <Tag style={{ marginInlineEnd: 0 }}>{t.status}</Tag>
                      <span style={{ color: "#94a3b8" }}>优先级:{t.priority}</span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该环节暂无未完成工单" />
        )}
      </Modal>
    </div>
  );
}
