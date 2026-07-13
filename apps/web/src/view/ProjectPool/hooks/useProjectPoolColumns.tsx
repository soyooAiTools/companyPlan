import { Button, Avatar, Space, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EditOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import { statusStyle } from "@/view/Ops/constants";
import StageDeadlineCell from "../components/table/StageDeadlineCell";
import { fmtProjectDate, projectDurationText, projectStartDate } from "../deadlineUtils";

export type ProjectPoolColumnActions = {
  openChange: (row: OpsProjectPoolRow, field: "status" | "stage") => void;
  openDeadlineEdit: (row: OpsProjectPoolRow) => void;
  openRemark: (row: OpsProjectPoolRow) => void;
  openSegTickets: (row: OpsProjectPoolRow, segment: { id: number; name: string }) => void;
  openMembers: (row: OpsProjectPoolRow) => void;
};

const headerTip = (text: string, tip: string) => (
  <span>
    {text}{" "}
    <Tooltip title={<span style={{ whiteSpace: "pre-line" }}>{tip}</span>}>
      <QuestionCircleOutlined style={{ color: "#94a3b8", cursor: "help" }} />
    </Tooltip>
  </span>
);

const ticketSummaryCell = (row: OpsProjectPoolRow) => {
  const groups = row.ticketGroups || {};
  const item = (label: string, count: number, color?: string) => (
    <div style={{ display: "flex", alignItems: "baseline", lineHeight: "20px" }}>
      <span style={{ color: "#64748b", width: 52, flexShrink: 0 }}>{label}</span>
      <span style={{ color: count ? (color ?? "#0f172a") : "#94a3b8", fontWeight: count ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto auto", justifyContent: "start", columnGap: 20, rowGap: 7, fontSize: 12 }}>
      {item("进行中", groups["进行中"] || 0)}
      {item("排队中", groups["排队中"] || 0)}
      {item("工单超时", row.atRisk || 0, "#d46b08")}
      {item("工单逾期", row.overdue || 0, "#cf1322")}
    </div>
  );
};

export function useProjectPoolColumns(actions: ProjectPoolColumnActions): ColumnsType<OpsProjectPoolRow> {
  return [
    {
      title: "项目名称",
      key: "name",
      width: 220,
      render: (_: unknown, row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a", lineHeight: 1.35, wordBreak: "break-all" }}>{row.name || "—"}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{row.tenantName || "未填客户"}</div>
        </div>
      ),
    },
    {
      title: "策划",
      key: "planner",
      width: 150,
      render: (_: unknown, row) => {
        if (!row.plannerName) return <Typography.Text type="secondary">未指定</Typography.Text>;
        const avatars = (row.planners || []).filter((planner) => planner.avatar);
        return (
          <Space size={6}>
            {avatars.length ? (
              <Avatar.Group size={24}>
                {avatars.map((planner, index) => (
                  <Tooltip key={index} title={planner.name}>
                    <Avatar size={24} src={planner.avatar} />
                  </Tooltip>
                ))}
              </Avatar.Group>
            ) : null}
            <span style={{ color: "#334155" }}>{row.plannerName}</span>
          </Space>
        );
      },
    },
    {
      title: headerTip("当前阶段", "项目当前所处的制作阶段。可任意调整,变更会记入流转。"),
      key: "stage",
      width: 150,
      render: (_: unknown, row) => (
        <Space size={6}>
          <Tag style={{ background: "#f0f5ff", color: "#1d39c4", padding: "2px 10px", fontSize: 13, borderRadius: 6, border: "none", margin: 0 }}>{row.stage || "—"}</Tag>
          <Tooltip title="修改阶段">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined style={{ fontSize: 15 }} />}
              style={{ color: "#0f766e" }}
              onClick={(e) => {
                e.stopPropagation();
                actions.openChange(row, "stage");
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
      render: (_: unknown, row) => <StageDeadlineCell row={row} onEdit={actions.openDeadlineEdit} />,
    },
    {
      title: "项目启动时间",
      key: "startedAt",
      width: 120,
      render: (_: unknown, row) => {
        const startDate = projectStartDate(row.startedAt, row.stageDeadlines);
        const fromAssetConfirm = !!row.stageDeadlines?.some((item) => (item.key === "asset_confirm" || item.name === "资产确认") && item.date === startDate);
        return (
          <Tooltip title={fromAssetConfirm ? "按资产确认日期计算" : undefined}>
            <span style={{ color: startDate ? (fromAssetConfirm ? "#64748b" : "#334155") : "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{fmtProjectDate(startDate)}</span>
          </Tooltip>
        );
      },
    },
    {
      title: headerTip("项目持续时间", "已开发=当前时间 - 项目启动时间\n剩余=最终交付版日期 - 今天"),
      key: "duration",
      width: 190,
      render: (_: unknown, row) => {
        const duration = projectDurationText(row.startedAt, row.stageDeadlines);
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
      render: (_: unknown, row) => (
        <Space size={6}>
          <Tag style={{ ...statusStyle(row.status), padding: "2px 10px", fontSize: 13, borderRadius: 6, border: "none", margin: 0 }}>{row.status || "—"}</Tag>
          <Tooltip title="修改状态">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined style={{ fontSize: 15 }} />}
              style={{ color: "#0f766e" }}
              onClick={(e) => {
                e.stopPropagation();
                actions.openChange(row, "status");
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
      render: (_: unknown, row) => {
        const text = (row.remark || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const preview = text || (row.remark ? "[图文备注]" : "");
        return (
          <Space size={4} align="start">
            {preview ? (
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
                  actions.openRemark(row);
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
      render: (_: unknown, row) =>
        row.segments.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
            {row.segments.map((segment) => (
              <Button
                key={segment.id}
                type="link"
                size="small"
                style={{ padding: 0, height: "auto", fontSize: 13 }}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.openSegTickets(row, segment);
                }}>
                {segment.name}({segment.count})
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
      align: "center",
      render: (value: number, row) => (
        <Button
          type="link"
          size="small"
          disabled={!value}
          style={{ padding: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            actions.openMembers(row);
          }}>
          {value}人
        </Button>
      ),
    },
    {
      title: headerTip("工单状态", "统计该项目未完成工单(不含已完成):进行中/排队中按状态分;工单超时=已过预警线、未到截止(临期);工单逾期=已过截止仍未完成。"),
      key: "tickets",
      width: 200,
      render: (_: unknown, row) => ticketSummaryCell(row),
    },
  ];
}
