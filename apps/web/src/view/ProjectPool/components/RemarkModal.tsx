import { Modal } from "antd";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import RichTextEditor from "@/view/Ops/RichTextEditor";

type RemarkModalProps = {
  open: boolean;
  target: OpsProjectPoolRow | null;
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export default function RemarkModal({ open, target, value, saving, onChange, onSave, onCancel }: RemarkModalProps) {
  return (
    <Modal title={`修改备注 · ${target?.name ?? ""}`} open={open} onOk={onSave} confirmLoading={saving} onCancel={onCancel} okText="保存" cancelText="取消" width={760} destroyOnHidden>
      <RichTextEditor value={value} onChange={onChange} projectId={target?.id} />
    </Modal>
  );
}
