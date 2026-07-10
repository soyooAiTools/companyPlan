// 项目池:策划看自己(制片)的项目、管理员看全部。可改项目状态(同步 soyoo+飞书)、留富文本评论、看状态流转。
// 两个 tab:全部项目 / 超时关注;当前超时关注只按「下版交付时间」是否逾期统计。
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { App, Avatar, Button, Input, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { EditOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import SegmentedTabs from "@/components/SegmentedTabs";
import { opsApi } from "@/api/modules/ops";
import type { OpsProjectPoolRow, OpsProjectStatusLog, OpsProjectPoolMember, OpsSegment, OpsSegmentTicket, OpsProjectStageDeadline, OpsTicket, OpsTicketEvent } from "@/api/modules/ops";
import { PROJECT_STATUSES, PROJECT_STAGES, statusStyle, OPS_TOOLBAR_CARD } from "@/view/Ops/constants";
import ChangeProjectFieldModal from "./components/ChangeProjectFieldModal";
import MembersModal from "./components/MembersModal";
import ProjectLogsDrawer from "./components/ProjectLogsDrawer";
import RemarkModal from "./components/RemarkModal";
import SegmentTicketDetailDrawer from "./components/SegmentTicketDetailDrawer";
import SegmentTicketsModal from "./components/SegmentTicketsModal";
import StageDeadlineCell from "./components/StageDeadlineCell";
import StageDeadlineModal from "./components/StageDeadlineModal";
import { defaultStageIntervals, fmtProjectDate, inferStageDeadlines, isNextDeadlineOverdue, normalizeStageDeadlines, projectDurationText } from "./deadlineUtils";
import type { ProjectLogKind } from "./logUtils";

dayjs.locale("zh-cn");

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
	const [segmentFilter, setSegmentFilter] = useState<number[]>([]);
	const [segmentOptions, setSegmentOptions] = useState<OpsSegment[]>([]);

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
	const [logKind, setLogKind] = useState<ProjectLogKind>("all"); // 流转记录按类型筛选

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
	const [segTabs, setSegTabs] = useState<OpsProjectPoolRow["segments"]>([]);
	const [segTickets, setSegTickets] = useState<OpsSegmentTicket[]>([]);
	const [segLoading, setSegLoading] = useState(false);
	const [segProjectId, setSegProjectId] = useState("");
	const [segSegmentId, setSegSegmentId] = useState<number | null>(null);
	const [segDetailOpen, setSegDetailOpen] = useState(false);
	const [segDetail, setSegDetail] = useState<OpsTicket | null>(null);
	const [segDetailEvents, setSegDetailEvents] = useState<OpsTicketEvent[]>([]);
	const [segDetailLoading, setSegDetailLoading] = useState(false);

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
						await opsApi.projectPool({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter, stage: stageFilter, segment: segmentFilter });
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
	}, [tab, page, pageSize, statusFilter, stageFilter, segmentFilter, debounced]);
	useEffect(() => {
		opsApi
			.segments()
			.then((r) => setSegmentOptions(r.segments))
			.catch(() => setSegmentOptions([]));
	}, []);
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

	const loadSegTickets = async (projectId: string, segmentId: number) => {
		setSegSegmentId(segmentId);
		setSegDetailOpen(false);
		setSegDetail(null);
		setSegDetailEvents([]);
		setSegTickets([]);
		setSegLoading(true);
		try {
			const x = await opsApi.projectSegmentTickets(projectId, segmentId);
			setSegTickets(x.tickets);
		} catch (e) {
			message.error(e instanceof Error ? e.message : "加载工单失败");
		} finally {
			setSegLoading(false);
		}
	};

	const openSegTickets = (r: OpsProjectPoolRow, seg: { id: number; name: string }) => {
		setSegTitle(r.name);
		setSegTabs(r.segments);
		setSegProjectId(r.id);
		setSegOpen(true);
		void loadSegTickets(r.id, seg.id);
	};

	const switchSegTab = (segmentId: number) => {
		if (!segProjectId || segmentId === segSegmentId) return;
		void loadSegTickets(segProjectId, segmentId);
	};

	const openSegTicketDetail = async (ticket: OpsSegmentTicket) => {
		if (!segProjectId || segSegmentId == null) return;
		setSegDetailOpen(true);
		setSegDetail(null);
		setSegDetailEvents([]);
		setSegDetailLoading(true);
		try {
			const r = await opsApi.projectSegmentTicketDetail(segProjectId, segSegmentId, ticket.id);
			setSegDetail(r.ticket);
			setSegDetailEvents(r.events);
		} catch (e) {
			message.error(e instanceof Error ? e.message : "加载工单详情失败");
		} finally {
			setSegDetailLoading(false);
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

	// 未完成工单汇总:2×2 网格,标签定宽 + 数字紧跟。进行中/排队中(按状态)、工单超时(临期)/工单逾期(已过截止)
	const ticketSummaryCell = (r: OpsProjectPoolRow) => {
		const g = r.ticketGroups || {};
		const item = (label: string, n: number, color?: string) => (
			<div style={{ display: "flex", alignItems: "baseline", lineHeight: "20px" }}>
				<span style={{ color: "#64748b", width: 52, flexShrink: 0 }}>{label}</span>
				<span style={{ color: n ? (color ?? "#0f172a") : "#94a3b8", fontWeight: n ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{n}</span>
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
			title: headerTip("下版交付时间", "根据当前阶段显示下版交付时间;鼠标悬停可查看完整阶段交付计划。超时关注按这个时间是否逾期判断。"),
			key: "stageDeadlines",
			width: 210,
			render: (_: unknown, r: OpsProjectPoolRow) => <StageDeadlineCell row={r} onEdit={openDeadlineEdit} />,
		},
		{
			title: "项目启动时间",
			key: "startedAt",
			width: 120,
			render: (_: unknown, r: OpsProjectPoolRow) => <span style={{ color: r.startedAt ? "#334155" : "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{fmtProjectDate(r.startedAt)}</span>,
		},
		{
			title: headerTip("项目持续时间", "已开发=项目启动时间到今天;剩余/逾期=最终交付版日期到今天。"),
			key: "duration",
			width: 190,
			render: (_: unknown, r: OpsProjectPoolRow) => {
				const duration = projectDurationText(r.startedAt, r.stageDeadlines);
				if (!duration) return <Typography.Text type="secondary">—</Typography.Text>;
				return (
					<span style={{ color: duration.overdue ? "#cf1322" : "#334155", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
						{duration.developedText}，{duration.remainText}
					</span>
				);
			},
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
				const text = (r.remark || "")
					.replace(/<[^>]+>/g, " ")
					.replace(/&nbsp;/g, " ")
					.replace(/\s+/g, " ")
					.trim(); // 纯文本预览
				const preview = text || (r.remark ? "[图文备注]" : "");
				return (
					<Space size={4} align="start">
						{preview ? (
							// 只显示预览;点整行 → 侧边栏看完整备注(含图文)
							<span style={{ fontSize: 13, color: "#334155", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", maxWidth: 150 }}>
								{preview}
							</span>
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
			title: "人员列表",
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
			title: headerTip("工单状态", "统计该项目未完成工单(不含已完成):进行中/排队中按状态分;工单超时=已过预警线、未到截止(临期);工单逾期=已过截止仍未完成。"),
			key: "tickets",
			width: 200,
			render: (_: unknown, r: OpsProjectPoolRow) => ticketSummaryCell(r),
		},
		/*
    // 临时隐藏：状态流程时间暂不参与项目池展示和超时关注，后面需要恢复时打开这一列即可。
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
    */
	];

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
						<Select
							allowClear
							mode="multiple"
							placeholder="环节(可多选)"
							style={{ minWidth: 170, maxWidth: 340 }}
							value={segmentFilter}
							onChange={(v) => {
								setSegmentFilter(v);
								setPage(1);
							}}
							maxTagCount="responsive"
							options={segmentOptions.map((s) => ({ value: s.id, label: s.name }))}
						/>
					</>
				) : null}
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
					scroll={{ x: 1350, y: scrollY }}
					pagination={{
						current: page,
						pageSize,
						total,
						showSizeChanger: true,
						showTotal: (t) => `共 ${t} 个项目`,
						onChange: (p, ps) => {
							setPage(p);
							setPageSize(ps);
						},
					}}
					onRow={(r) => ({
						onClick: () => {
							if (window.getSelection()?.toString()) return; // 正在框选文本(复制)→ 不打开抽屉
							openLogs(r);
						},
						className: isNextDeadlineOverdue(r) ? "ops-pool-stale" : undefined,
						style: { cursor: "pointer" },
					})}
				/>
			</div>

			<ChangeProjectFieldModal
				open={chOpen}
				field={chField}
				target={chTarget}
				value={chValue}
				comment={chComment}
				saving={chSaving}
				onValueChange={setChValue}
				onCommentChange={setChComment}
				onConfirm={confirmChange}
				onCancel={() => setChOpen(false)}
			/>
			<RemarkModal open={rmOpen} target={rmTarget} value={rmValue} saving={rmSaving} onChange={setRmValue} onSave={saveRemark} onCancel={() => setRmOpen(false)} />
			<StageDeadlineModal
				open={deadlineOpen}
				target={deadlineTarget}
				rows={deadlineRows}
				auto={deadlineAuto}
				skipWeekend={deadlineSkipWeekend}
				intervals={deadlineIntervals}
				saving={deadlineSaving}
				onAutoChange={setDeadlineAuto}
				onSkipWeekendChange={toggleDeadlineSkipWeekend}
				onIntervalChange={updateDeadlineInterval}
				onDateChange={updateDeadlineDate}
				onSave={saveDeadlineRows}
				onCancel={() => setDeadlineOpen(false)}
			/>
			<ProjectLogsDrawer
				open={logsOpen}
				project={logsProject}
				logs={logs}
				loading={logsLoading}
				logKind={logKind}
				onLogKindChange={setLogKind}
				onClose={() => setLogsOpen(false)}
			/>
			<MembersModal open={memOpen} project={memProject} members={members} loading={memLoading} onCancel={() => setMemOpen(false)} />
			<SegmentTicketsModal
				open={segOpen}
				title={segTitle}
				segments={segTabs}
				activeSegmentId={segSegmentId}
				tickets={segTickets}
				loading={segLoading}
				onCancel={() => {
					setSegOpen(false);
					setSegDetailOpen(false);
					setSegTabs([]);
					setSegSegmentId(null);
				}}
				onSegmentChange={switchSegTab}
				onOpenTicket={openSegTicketDetail}
			/>
			<SegmentTicketDetailDrawer
				open={segDetailOpen}
				ticket={segDetail}
				events={segDetailEvents}
				loading={segDetailLoading}
				onClose={() => setSegDetailOpen(false)}
			/>
		</div>
	);
}
