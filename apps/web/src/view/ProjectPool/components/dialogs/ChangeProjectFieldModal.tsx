import { useEffect, useState } from "react";
import { Alert, Avatar, Modal, Radio, Select, Space } from "antd";
import { opsApi, type OpsRecycleHandoffUser } from "@/api/modules/ops";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import RichTextEditor from "@/view/Ops/RichTextEditor";
import { OPS_EDITABLE_PROJECT_STATUSES, PROJECT_STAGES } from "@/view/Ops/constants";
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

const RECYCLE_HANDOFF_USERS = [
  { username: "miaochuan", name: "苗川", avatar: "" },
  { username: "jingkun", name: "井昆", avatar: "" },
];

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

function StatusOptionLabel({ status, current }: { status: string; current?: string }) {
  const text = status === current ? `${status}(当前)` : status;
  if (status === SETTLEMENT_DONE_STATUS) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#16a34a", fontWeight: 600 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: "#22c55e", display: "inline-block" }} />
        <span>{text}</span>
      </span>
    );
  }
  if (status !== "回收中") return <span>{text}</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#dc2626", fontWeight: 600 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: "#ef4444", display: "inline-block" }} />
      <span>{text}</span>
    </span>
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
  const statusOptions = field === "status" && isAdmin && current === "回收中" ? [...OPS_EDITABLE_PROJECT_STATUSES, SETTLEMENT_DONE_STATUS] : OPS_EDITABLE_PROJECT_STATUSES;
  const currentStageIndex = field === "stage" ? PROJECT_STAGES.indexOf(current || "") : -1;
  const isRecyclingChange = field === "status" && current !== "回收中" && value === "回收中";
  const visibleVersionsReady = willAllVisibleVersionsRecycle(target, value, projectRows);
  const isMultiVersionSettlement = field === "status" && value === SETTLEMENT_DONE_STATUS && visibleProjectVersions(target, projectRows).length > 1;
  const showRecycleHandoff = isRecyclingChange && visibleVersionsReady;
  const confirmDisabled = !value || value === current || (showRecycleHandoff && !recycleHandoffUsername);
  const [recycleHandoffUsers, setRecycleHandoffUsers] = useState<OpsRecycleHandoffUser[]>([]);

  useEffect(() => {
    if (!showRecycleHandoff) return;
    let disposed = false;
    opsApi
      .recycleHandoffUsers()
      .then((res) => {
        if (!disposed) setRecycleHandoffUsers(Array.isArray(res.users) ? res.users : []);
      })
      .catch(() => {
        if (!disposed) setRecycleHandoffUsers([]);
      });
    return () => {
      disposed = true;
    };
  }, [showRecycleHandoff]);

  const handoffUsers = RECYCLE_HANDOFF_USERS.map((fallback) => {
    const remote = recycleHandoffUsers.find((user) => user.username === fallback.username);
    return remote || fallback;
  });
  return (
    <Modal
      title={`${field === "status" ? "修改项目状态" : "修改制作阶段"} · ${target?.name ?? ""}`}
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
        <div>
          {target ? (
            <div style={{ marginBottom: 6, color: "#94a3b8" }}>
              当前{field === "status" ? "状态" : "阶段"}:{field === "stage" ? stageRangeLabel(current) : current || "未设置"}
            </div>
          ) : null}
          <span style={{ marginRight: 8 }}>{field === "status" ? "新状态:" : "新阶段:"}</span>
          <Select
            value={value || undefined}
            placeholder={field === "status" ? "选择状态" : "选择阶段"}
            style={{ width: field === "stage" ? 320 : 200 }}
            options={(field === "status" ? statusOptions : PROJECT_STAGES).map((s) => ({
              value: s,
              label: field === "stage" ? `${stageRangeLabel(s)}${s === current ? "(当前)" : ""}` : <StatusOptionLabel status={s} current={current} />,
              disabled: field === "stage" ? PROJECT_STAGES.indexOf(s) <= currentStageIndex : s === current,
            }))}
            onChange={onValueChange}
          />
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
                  {handoffUsers.map((user) => (
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
            </Space>
          </div>
        ) : null}
        {isRecyclingChange ? (
          <AttentionNotice>注意：这是版本回收操作，请确认该版本确实不再继续推进。</AttentionNotice>
        ) : null}
        {field === "status" && value === SETTLEMENT_DONE_STATUS ? (
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
