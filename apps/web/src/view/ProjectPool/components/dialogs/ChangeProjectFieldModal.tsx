import { Modal, Select, Space } from "antd";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import RichTextEditor from "@/view/Ops/RichTextEditor";
import { PROJECT_STAGES, PROJECT_STATUSES } from "@/view/Ops/constants";

type ChangeProjectFieldModalProps = {
  open: boolean;
  field: "status" | "stage";
  target: OpsProjectPoolRow | null;
  value: string;
  comment: string;
  saving: boolean;
  onValueChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ChangeProjectFieldModal({ open, field, target, value, comment, saving, onValueChange, onCommentChange, onConfirm, onCancel }: ChangeProjectFieldModalProps) {
  const current = field === "status" ? target?.status : target?.stage;
  const currentStageIndex = field === "stage" ? PROJECT_STAGES.indexOf(current || "") : -1;
  return (
    <Modal
      title={`${field === "status" ? "修改项目状态" : "修改制作阶段"} · ${target?.name ?? ""}`}
      open={open}
      onOk={onConfirm}
      confirmLoading={saving}
      onCancel={onCancel}
      okText="确认修改"
      cancelText="取消"
      okButtonProps={{ disabled: !value || value === current }}
      width={760}
      destroyOnHidden>
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <div>
          <span style={{ marginRight: 8 }}>{field === "status" ? "新状态:" : "新阶段:"}</span>
          <Select
            value={value || undefined}
            placeholder={field === "status" ? "选择状态" : "选择阶段"}
            style={{ width: 200 }}
            options={(field === "status" ? PROJECT_STATUSES : PROJECT_STAGES).map((s) => ({
              value: s,
              label: s === current ? `${s}(当前)` : s,
              disabled: field === "stage" ? PROJECT_STAGES.indexOf(s) <= currentStageIndex : s === current,
            }))}
            onChange={onValueChange}
          />
          {target ? <span style={{ marginLeft: 12, color: "#94a3b8" }}>当前:{current || "未设置"}</span> : null}
        </div>
        <div>
          <div style={{ marginBottom: 6, color: "#64748b" }}>备注(可选,可附图):</div>
          <RichTextEditor value={comment} onChange={onCommentChange} projectId={target?.id} />
        </div>
      </Space>
    </Modal>
  );
}
