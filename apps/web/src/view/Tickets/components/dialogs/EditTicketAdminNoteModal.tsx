import { Input, Modal } from "antd";

type EditTicketAdminNoteModalProps = {
	open: boolean;
	value: string;
	saving: boolean;
	onChange: (value: string) => void;
	onSave: () => void;
	onCancel: () => void;
};

export default function EditTicketAdminNoteModal({ open, value, saving, onChange, onSave, onCancel }: EditTicketAdminNoteModalProps) {
	return (
		<Modal title="编辑内部备注" open={open} onOk={onSave} confirmLoading={saving} onCancel={onCancel} okText="保存" cancelText="取消" width={620} keyboard={false} mask={{ closable: false }} destroyOnHidden>
			<div style={{ paddingBottom: 18 }}>
				<Input.TextArea autoSize={{ minRows: 5, maxRows: 8 }} maxLength={100} showCount placeholder="仅管理员可见，用于记录内部跟进说明" value={value} onChange={(e) => onChange(e.target.value)} />
			</div>
		</Modal>
	);
}
