import { DatePicker, InputNumber, Modal, Tooltip } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { addBusinessHours, ceilDeadlineToHalfHour, disabledTicketDeadlineDate, disabledTicketDeadlineTime, getDeadlineHours } from "../../ticketDeadline";

type EditTicketDueTimeModalProps = {
	open: boolean;
	value?: number;
	saving: boolean;
	onSave: (value: number) => void;
	onCancel: () => void;
};

export default function EditTicketDueTimeModal({ open, value, saving, onSave, onCancel }: EditTicketDueTimeModalProps) {
	const [hours, setHours] = useState<number | null>(value ?? null);
	const [deadline, setDeadline] = useState<Dayjs | null>(value == null ? null : addBusinessHours(dayjs(), value));
	useEffect(() => {
		if (!open) return;
		setHours(value ?? null);
		setDeadline(value == null ? null : addBusinessHours(dayjs(), value));
	}, [open, value]);
	const updateHours = (next: number | null) => {
		setHours(next);
		setDeadline(next == null || !Number.isFinite(next) ? null : addBusinessHours(dayjs(), next));
	};
	const updateDeadline = (next: Dayjs | null) => {
		const normalized = ceilDeadlineToHalfHour(next);
		setDeadline(normalized);
		setHours(getDeadlineHours(normalized));
	};
	return (
		<Modal zIndex={3000} title="修改期望完成时间" open={open} confirmLoading={saving} okText="保存" cancelText="取消" onOk={() => hours != null && Number.isFinite(hours) && hours > 0 && onSave(hours)} onCancel={onCancel}>
			<div style={{ marginBottom: 8, fontWeight: 600 }}>
				期望完成时间{" "}
				<Tooltip trigger={["click"]} title="只能选择当前时间之后两天内的时间；工作时间为 09:00-21:00，周日不计入，最多 24 个工作小时。">
					<InfoCircleOutlined style={{ color: "#94a3b8", cursor: "pointer" }} />
				</Tooltip>
			</div>
			<div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
				<InputNumber<number> value={hours ?? undefined} min={0.5} max={720} step={0.5} precision={1} style={{ width: 112 }} placeholder="小时数" onChange={updateHours} />
				<span style={{ color: "#94a3b8", height: 32, display: "flex", alignItems: "center" }}>/</span>
				<DatePicker showTime={{ format: "HH:mm", minuteStep: 30 }} format="YYYY-MM-DD HH:mm" value={deadline} disabledDate={(date) => disabledTicketDeadlineDate(date)} disabledTime={(date) => disabledTicketDeadlineTime(date)} style={{ flex: 1 }} placeholder="选择截止日期时间" onChange={updateDeadline} />
			</div>
		</Modal>
	);
}
