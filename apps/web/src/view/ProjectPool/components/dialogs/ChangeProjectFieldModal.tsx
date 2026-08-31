import { useEffect, useState } from "react";
import { Alert, Avatar, Modal, Radio, Select, Space, Tag } from "antd";
import { opsApi, type OpsRecycleHandoffUser } from "@/api/modules/ops";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import RichTextEditor from "@/view/Ops/RichTextEditor";
import { OPS_EDITABLE_PROJECT_STATUSES, PROJECT_STAGES, statusStyle } from "@/view/Ops/constants";
import { stageRangeLabel } from "../../deadlineUtils";

type ChangeProjectFieldModalProps = {
  open: boolean;
  field: "status" | "stage";
  target: OpsProjectPoolRow | null;
  projectRows?: OpsProjectPoolRow[];
  isAdmin?: boolean;
  value: string;
  comment: string;
  recycleHandoffUsername: string;
  saving: boolean;
  onValueChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onRecycleHandoffUserChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

const SETTLEMENT_DONE_STATUS = "结算完成";

function flattenRows(rows: OpsProjectPoolRow[] = []) {
  const result: OpsProjectPoolRow[] = [];
  const walk = (items: OpsProjectPoolRow[]) => {
    items.forEach((item) => {
      result.push(item);
      if (Array.isArray(item.children) && item.children.length) walk(item.children);
    });
  };
  walk(rows);
  return result;
}

function baseProjectId(row: OpsProjectPoolRow) {
  return String(row.projectId || row.parentId || row.id || "").split("::version-")[0];
}

function isVersionRow(row: OpsProjectPoolRow) {
  return Boolean(row.isVersionRow || row.versionId || row.parentId || String(row.id || "").includes("::version-"));
}

function isSameVersion(a: OpsProjectPoolRow, b: OpsProjectPoolRow) {
  if (String(a.id) === String(b.id)) return true;
  return Boolean(a.versionId && b.versionId && String(a.versionId) === String(b.versionId));
}

function willAllVisibleVersionsRecycle(target: OpsProjectPoolRow | null, nextStatus: string, projectRows: OpsProjectPoolRow[] = []) {
  if (!target || nextStatus !== "回收中") return true;
  const versions = visibleProjectVersions(target, projectRows);
  if (versions.length <= 1) return true;
  return versions.every((row) => isSameVersion(row, target) || row.status === "回收中");
}

function visibleProjectVersions(target: OpsProjectPoolRow | null, projectRows: OpsProjectPoolRow[] = []) {
  if (!target) return [];
  const targetProjectId = baseProjectId(target);
  const directChildren = Array.isArray(target.children) ? target.children : [];
  const versionRows = flattenRows(projectRows).filter((row) => baseProjectId(row) === targetProjectId && isVersionRow(row));
  return versionRows.length ? versionRows : directChildren;
}

function ProjectStatusTag({ status, current }: { status: string; current?: string }) {
  const text = status === current ? `${status}(当前)` : status;
  return (
    <Tag style={{ ...statusStyle(status), margin: 0, padding: "2px 10px", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700 }}>
      {text}
    </Tag>
  );
}

function AttentionNotice({ children, tone = "danger" }: { children: string; tone?: "danger" | "success" }) {
  const color = tone === "success" ? "#16a34a" : "#dc2626";
  const borderColor = tone === "success" ? "#22c55e" : "#ff4d4f";
  const background = tone === "success" ? "#f0fdf4" : "#fff";
  return (
    <>
      <style>
        {`
          @keyframes project-pool-attention-glow {
            0%, 100% { box-shadow: 0 0 0 0 ${borderColor}33; }
            50% { box-shadow: 0 0 0 5px ${borderColor}1f; }
          }
        `}
      </style>
      <div
        style={{
          color,
          background,
          border: `3px solid ${borderColor}`,
          borderLeftWidth: 4,
          borderRadius: 2,
          padding: "14px 18px",
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1.5,
          animation: "project-pool-attention-glow 1.6s ease-in-out infinite",
        }}>
        {children}
      </div>
    </>
  );
}

export default function ChangeProjectFieldModal({
  open,
  field,
  target,
  projectRows = [],
  isAdmin = false,
  value,
  comment,
  recycleHandoffUsername,
  saving,
  onValueChange,
  onCommentChange,
  onRecycleHandoffUserChange,
  onConfirm,
  onCancel,
}: ChangeProjectFieldModalProps) {
  const current = field === "status" ? target?.status : target?.stage;
  const [recycleHandoffUsers, setRecycleHandoffUsers] = useState<OpsRecycleHandoffUser[]>([]);
  const [settlementDoneStatus, setSettlementDoneStatus] = useState(SETTLEMENT_DONE_STATUS);
  const statusOptions =
    field === "status" && isAdmin && current === "回收中" && settlementDoneStatus
      ? [...OPS_EDITABLE_PROJECT_STATUSES, settlementDoneStatus].filter((item, index, array) => array.indexOf(item) === index)
      : OPS_EDITABLE_PROJECT_STATUSES;
  const currentStageIndex = field === "stage" ? PROJECT_STAGES.indexOf(current || "") : -1;
  const isRecyclingChange = field === "status" && current !== "回收中" && value === "回收中";
  const visibleVersionsReady = willAllVisibleVersionsRecycle(target, value, projectRows);
  const isMultiVersionSettlement = field === "status" && value === settlementDoneStatus && visibleProjectVersions(target, projectRows).length > 1;
  const showRecycleHandoff = isRecyclingChange && visibleVersionsReady;
  const confirmDisabled = !value || value === current || (showRecycleHandoff && !recycleHandoffUsername);
  const shouldLoadRecycleConfig = open && field === "status" && (showRecycleHandoff || (isAdmin && current === "回收中"));

  useEffect(() => {
    if (!shouldLoadRecycleConfig) return;
    let disposed = false;
    opsApi
      .recycleHandoffUsers()
      .then((res) => {
        if (disposed) return;
        setRecycleHandoffUsers(Array.isArray(res.users) ? res.users : []);
        if (typeof res.settlementDoneStatus === "string" && res.settlementDoneStatus.trim()) {
          setSettlementDoneStatus(res.settlementDoneStatus.trim());
        }
      })
      .catch(() => {
        if (!disposed) setRecycleHandoffUsers([]);
      });
    return () => {
      disposed = true;
    };
  }, [shouldLoadRecycleConfig]);

  const titleName = [target?.name, target?.tenantName].filter(Boolean).join(" - ");
  return (
    <Modal
      title={`${field === "status" ? "修改项目状态" : "修改制作阶段"} · ${titleName}`}
      open={open}
      onOk={onConfirm}
      confirmLoading={saving}
      onCancel={onCancel}
      okText="确认修改"
      cancelText="取消"
      okButtonProps={{ disabled: confirmDisabled }}
      width={760}
      destroyOnHidden>
      <Space orientation="vertical" style={{ width: "100%" }} size={12}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          {target ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 260px" }}>
              <span style={{ color: "#1677ff", fontWeight: 600 }}>当前{field === "status" ? "状态" : "阶段"}:</span>
              {field === "stage" ? <span style={{ fontWeight: 700 }}>{stageRangeLabel(current)}</span> : current ? <ProjectStatusTag status={current} /> : <span style={{ fontWeight: 700 }}>未设置</span>}
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 260px" }}>
            <span style={{ color: "#16a34a", fontWeight: 600 }}>{field === "status" ? "新状态:" : "新阶段:"}</span>
            <Select
              value={value || undefined}
              placeholder={field === "status" ? "选择状态" : "选择阶段"}
              style={{ flex: 1, minWidth: 0 }}
              options={(field === "status" ? statusOptions : PROJECT_STAGES).map((s) => ({
                value: s,
                label: field === "stage" ? `${stageRangeLabel(s)}${s === current ? "(当前)" : ""}` : <ProjectStatusTag status={s} current={current} />,
                disabled: field === "stage" ? PROJECT_STAGES.indexOf(s) <= currentStageIndex : s === current,
              }))}
              onChange={onValueChange}
            />
          </div>
        </div>
        {isRecyclingChange && !visibleVersionsReady ? <Alert type="warning" showIcon message="该项目还有其他版本未回收，最后一个版本回收时再选择交接人。" /> : null}
        {showRecycleHandoff ? (
          <div>
            <div style={{ marginBottom: 6, color: "#ef4444", fontWeight: 600 }}>回收交接人:</div>
            <Space orientation="vertical" style={{ width: "100%" }} size={8}>
              <Radio.Group
                value={recycleHandoffUsername || undefined}
                onChange={(event) => onRecycleHandoffUserChange(event.target.value || "")}>
                <Space size={14} wrap>
                  {recycleHandoffUsers.map((user) => (
                    <Radio key={user.username} value={user.username}>
                      <Space size={6}>
                        <Avatar size={22} src={user.avatar || undefined} style={{ background: "#e2e8f0", color: "#475569", fontSize: 12 }}>
                          {(user.name || user.username).slice(0, 1)}
                        </Avatar>
                        <span>{user.name || user.username}</span>
                        <span style={{ color: "#64748b" }}>{user.username}</span>
                      </Space>
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
              {recycleHandoffUsers.length === 0 ? <Alert type="warning" showIcon message="未配置回收交接人，请先检查 OPS 环境变量。" /> : null}
            </Space>
          </div>
        ) : null}
        {isRecyclingChange ? (
          <AttentionNotice>注意：这是版本回收操作，请确认该版本确实不再继续推进。</AttentionNotice>
        ) : null}
        {field === "status" && value === settlementDoneStatus ? (
          <AttentionNotice tone="success">
            {isMultiVersionSettlement
              ? "注意：这是多版本项目的项目级结算完成操作，确认后整个项目会同步为已完成，并从 OPS 项目池隐藏。请确认该项目所有版本均已回收。"
              : "注意：这是结算完成操作，确认后项目会同步为已完成，并从 OPS 项目池隐藏。"}
          </AttentionNotice>
        ) : null}
        <div>
          <div style={{ marginBottom: 6, color: "#64748b" }}>备注(可选,可附图):</div>
          <RichTextEditor value={comment} onChange={onCommentChange} projectId={target?.id} />
        </div>
      </Space>
    </Modal>
  );
}
