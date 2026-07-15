import { Modal } from "antd";
import RichTextEditor from "../../../Ops/RichTextEditor";

type EditTicketContentModalProps = {
	open: boolean;
	value: string;
	saving: boolean;
	projectId?: string;
	onChange: (value: string) => void;
	onSave: () => void;
	onCancel: () => void;
};

export default function EditTicketContentModal({ open, value, saving, projectId, onChange, onSave, onCancel }: EditTicketContentModalProps) {
	return (
		<Modal title="编辑需求说明" open={open} onOk={onSave} confirmLoading={saving} onCancel={onCancel} okText="保存" cancelText="取消" width={860} destroyOnHidden>
			<RichTextEditor value={value} onChange={onChange} projectId={projectId} />
		</Modal>
	);
}
