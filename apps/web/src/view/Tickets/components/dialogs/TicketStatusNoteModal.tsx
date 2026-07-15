import { Input, Modal, Typography } from "antd";

type TicketStatusNoteModalProps = {
	open: boolean;
	status: string;
	value: string;
	onChange: (value: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
};

export default function TicketStatusNoteModal({ open, status, value, onChange, onConfirm, onCancel }: TicketStatusNoteModalProps) {
	const isBlocked = status === "阻塞";

	return (
		<Modal title={isBlocked ? "阻塞原因" : "完成备注"} open={open} onOk={onConfirm} onCancel={onCancel} okText="确认" okButtonProps={{ danger: isBlocked }}>
			<Typography.Paragraph type="secondary">{isBlocked ? "填写阻塞原因(如:等客户确认参考),会记入流转记录。" : "填写完成备注(可选),会记入流转记录。"}</Typography.Paragraph>
			<Input.TextArea rows={3} maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} placeholder={isBlocked ? "阻塞原因" : "完成备注(可选)"} />
		</Modal>
	);
}
