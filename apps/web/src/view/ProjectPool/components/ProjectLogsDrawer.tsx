import { Avatar, Drawer, Spin, Tag, Timeline, Typography } from "antd";
import SegmentedTabs from "@/components/SegmentedTabs";
import RichContentView from "@/components/RichContentView";
import type { OpsProjectPoolRow, OpsProjectStatusLog } from "@/api/modules/ops";
import { fmtDateTime } from "@/utils/format";
import { emptyLogKindText, projectLogKindColor, projectLogKindLabel, type ProjectLogKind } from "../logUtils";

type ProjectLogsDrawerProps = {
  open: boolean;
  project: OpsProjectPoolRow | null;
  logs: OpsProjectStatusLog[];
  loading: boolean;
  logKind: ProjectLogKind;
  onLogKindChange: (kind: ProjectLogKind) => void;
  onClose: () => void;
};

export default function ProjectLogsDrawer({ open, project, logs, loading, logKind, onLogKindChange, onClose }: ProjectLogsDrawerProps) {
  const shownLogs = logs.filter((lg) => logKind === "all" || lg.kind === logKind);

  return (
    <Drawer title={`项目名称:${project?.name ?? ""}`} open={open} onClose={onClose} width={460}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#0f172a" }}>项目流转记录</span>
        <SegmentedTabs
          value={logKind}
          onChange={onLogKindChange}
          options={[
            { label: "全部", value: "all" },
            { label: "状态", value: "status" },
            { label: "阶段", value: "stage" },
            { label: "交付", value: "deadline" },
            { label: "备注", value: "remark" },
          ]}
        />
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <Spin />
        </div>
      ) : shownLogs.length ? (
        <Timeline
          items={shownLogs.map((lg) => ({
            color: projectLogKindColor(lg.kind, lg.toStatus),
            children: (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Avatar size={28} src={lg.actorAvatar || undefined} style={{ flexShrink: 0, background: "#e2e8f0", color: "#475569", fontSize: 13 }}>
                    {(lg.actorName || "系").slice(0, 1)}
                  </Avatar>
                  <span style={{ fontWeight: 600 }}>{lg.actorName || "系统"}</span>
                  <Tag color={projectLogKindColor(lg.kind, lg.toStatus)} style={{ marginInlineEnd: 0 }}>
                    {projectLogKindLabel(lg.kind)}
                  </Tag>
                  {(lg.kind === "status" || lg.kind === "stage") && (
                    <span style={{ color: "#64748b" }}>
                      {lg.fromStatus ? `「${lg.fromStatus}」→ ` : ""}「${lg.toStatus}」
                    </span>
                  )}
                </div>
                <RichContentView
                  html={lg.commentHtml}
                  linkText={lg.kind === "deadline" ? "查看交付时间变更" : "查看备注(含图片/视频)"}
                  modalTitle={lg.kind === "deadline" ? "交付时间变更" : "备注详情"}
                  inlineStyle={{ marginTop: 4, fontSize: 13 }}
                />
                <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>{fmtDateTime(lg.createdAt)}</div>
              </div>
            ),
          }))}
        />
      ) : (
        <Typography.Text type="secondary">暂无{emptyLogKindText(logKind)}变更记录</Typography.Text>
      )}
    </Drawer>
  );
}
