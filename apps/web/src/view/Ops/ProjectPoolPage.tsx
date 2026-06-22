// 项目池:策划看自己(制片)的项目、管理员看全部。可改项目状态(同步 soyoo+飞书)、留富文本评论、看状态流转。
// 两个 tab:全部项目 / 超时关注;项目状态超时整行标红。超时是服务端按「项目状态时间」阈值实时算的。
import { useEffect, useRef, useState } from "react";
import { App, Avatar, Button, Drawer, Empty, Input, List, Modal, Select, Space, Spin, Table, Tag, Timeline, Tooltip, Typography } from "antd";
import { EditOutlined, QuestionCircleOutlined, PictureOutlined } from "@ant-design/icons";
import SegmentedTabs from "../../components/SegmentedTabs";
import { opsApi } from "../../api/modules/ops";
import type { OpsProjectPoolRow, OpsProjectStatusLog, OpsProjectPoolMember, OpsSegmentTicket } from "../../api/modules/ops";
import RichTextEditor from "./RichTextEditor";
import { fmtDateTime, fmtDuration } from "../../utils/format";
import { PROJECT_STATUSES, PROJECT_STAGES, statusStyle, commentHasMedia, OPS_TOOLBAR_CARD } from "./constants";

const fmtH = (h?: number | null) => {
  if (h == null) return "-";
  const neg = h < 0;
  const a = Math.abs(h);
  const s = a >= 24 ? `${Math.floor(a / 24)}天${a % 24 ? `${a % 24}h` : ""}` : `${a}h`;
  return neg ? `-${s}` : s;
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

  // 协作成员弹框
  const [memOpen, setMemOpen] = useState(false);
  const [memProject, setMemProject] = useState<OpsProjectPoolRow | null>(null);
  const [members, setMembers] = useState<OpsProjectPoolMember[]>([]);
  const [memLoading, setMemLoading] = useState(false);

  // 备注详情弹框(日志里含图片/视频的备注 → 点击查看)
  const [cmOpen, setCmOpen] = useState(false);
  const [cmHtml, setCmHtml] = useState("");

  // 环节工单弹框(点目前环节里的某环节 → 看该环节下所有人的未完成工单)
  const [segOpen, setSegOpen] = useState(false);
  const [segTitle, setSegTitle] = useState("");
  const [segTickets, setSegTickets] = useState<OpsSegmentTicket[]>([]);
  const [segLoading, setSegLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r =
        tab === "stale"
          ? await opsApi.projectPoolStale({ page, pageSize })
          : // 选了具体状态(可多选)就按状态查;没选则后端默认只查「开启监控」的状态
            await opsApi.projectPool({ page, pageSize, q: debounced.trim() || undefined, status: statusFilter });
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
  }, [tab, page, pageSize, statusFilter, debounced]);
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

  const openLogs = async (r: OpsProjectPoolRow) => {
    setLogsProject(r);
    setLogsOpen(true);
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

  // 剩余时间(和提单页一致):超期=红,临期=橙,正常=灰
  const segRemain = (t: OpsSegmentTicket) => {
    if (!t.dueAt) return null;
    const r = Math.round((new Date(t.dueAt).getTime() - Date.now()) / 3.6e6); // 剩余小时
    if (r < 0) return <span style={{ color: "#cf1322", fontSize: 12 }}>超期 {fmtDuration(-r)}</span>;
    return <span style={{ color: t.atRisk ? "#fa8c16" : "#64748b", fontSize: 12 }}>剩 {fmtDuration(r)}</span>;
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

  const columns = [
    {
      title: "项目名称",
      key: "name",
      width: 220,
      render: (_: unknown, r: OpsProjectPoolRow) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a", lineHeight: 1.35, wordBreak: "break-all" }}>{r.name || "—"}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{r.client || "未填客户"}</div>
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
      title: headerTip("制作阶段", "项目制作进度的 5 个里程碑:资产确认 → 场景单帧版本 → 可交互初版 → 功能完整版 → 最终交付版。可任意调整,变更会记入流转。"),
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
      title: headerTip("状态停留", "项目保持在「当前状态」的时长。超过「设置 → 项目状态时间」里为该状态配置的阈值时标红(超时 = 已停留 − 阈值),提醒尽快跟进。"),
      key: "stuck",
      width: 124,
      render: (_: unknown, r: OpsProjectPoolRow) =>
        r.isStale ? (
          <Tag color="red">超时 {fmtH(r.overByHours)}</Tag>
        ) : r.stuckHours != null ? (
          <span style={{ color: "#94a3b8" }}>{fmtH(r.stuckHours)}</span>
        ) : (
          "—"
        ),
    },
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
              style={{ minWidth: 220, maxWidth: 420 }}
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
              maxTagCount="responsive"
              options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </>
        ) : (
          <Typography.Text type="secondary">超过「项目状态时间」阈值仍未变更的项目(整行标红),需重点跟进。</Typography.Text>
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
        scroll={{ x: 1232, y: scrollY }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: (t) => `共 ${t} 个项目`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        onRow={(r) => ({
          onClick: () => {
            if (window.getSelection()?.toString()) return; // 正在框选文本(复制)→ 不打开抽屉
            openLogs(r);
          },
          className: r.isStale ? "ops-pool-stale" : undefined,
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
        width={760}
        destroyOnHidden>
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <div>
            <span style={{ marginRight: 8 }}>{chField === "status" ? "新状态:" : "新阶段:"}</span>
            <Select
              value={chValue || undefined}
              placeholder={chField === "status" ? "选择状态" : "选择阶段"}
              style={{ width: 200 }}
              options={(chField === "status" ? PROJECT_STATUSES : PROJECT_STAGES).map((s) => ({ value: s, label: s }))}
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

      <Drawer title={`项目名称:${logsProject?.name ?? ""}`} open={logsOpen} onClose={() => setLogsOpen(false)} width={460}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "#0f172a", marginBottom: 14 }}>项目流转记录</div>
        {logsLoading ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <Spin />
          </div>
        ) : logs.length ? (
          <Timeline
            items={logs.map((lg) => ({
              color: lg.kind === "stage" ? "purple" : lg.toStatus === "已完成" ? "green" : "blue",
              children: (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Avatar size={28} src={lg.actorAvatar || undefined} style={{ flexShrink: 0, background: "#e2e8f0", color: "#475569", fontSize: 13 }}>
                      {(lg.actorName || "系").slice(0, 1)}
                    </Avatar>
                    <span style={{ fontWeight: 600 }}>{lg.actorName || "系统"}</span>
                    <Tag color={lg.kind === "stage" ? "purple" : "blue"} style={{ marginInlineEnd: 0 }}>
                      {lg.kind === "stage" ? "阶段" : "状态"}
                    </Tag>
                    <span style={{ color: "#64748b" }}>
                      {lg.fromStatus ? `「${lg.fromStatus}」→ ` : ""}「{lg.toStatus}」
                    </span>
                  </div>
                  {lg.commentHtml ? (
                    commentHasMedia(lg.commentHtml) ? (
                      // 含图片/视频 → 折叠成「点击查看」,弹框展示
                      <Button
                        type="link"
                        size="small"
                        icon={<PictureOutlined />}
                        style={{ padding: 0, height: "auto", marginTop: 4 }}
                        onClick={() => {
                          setCmHtml(lg.commentHtml || "");
                          setCmOpen(true);
                        }}>
                        查看备注(含图片/视频)
                      </Button>
                    ) : (
                      // 纯文字 → 直接显示
                      <div className="ops-rich" style={{ marginTop: 4, fontSize: 13 }} dangerouslySetInnerHTML={{ __html: lg.commentHtml }} />
                    )
                  ) : null}
                  <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>{fmtDateTime(lg.createdAt)}</div>
                </div>
              ),
            }))}
          />
        ) : (
          <Typography.Text type="secondary">暂无状态/阶段变更记录</Typography.Text>
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

      <Modal title="备注详情" open={cmOpen} onCancel={() => setCmOpen(false)} footer={null} width={640}>
        <style>{`.ops-comment-detail img, .ops-comment-detail video { max-width: 100%; height: auto; border-radius: 6px; }`}</style>
        <div className="ops-rich ops-comment-detail" style={{ maxHeight: "70vh", overflow: "auto" }} dangerouslySetInnerHTML={{ __html: cmHtml }} />
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
