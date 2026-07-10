// 设置 > 通知:管理员配「哪些事件通知 + 项目超时通知给哪些环节的负责人 + 扫描间隔」。普通用户无开关。
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { App, Button, InputNumber, Select, Space, Switch, TimePicker, Table, Tooltip, Typography } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { opsApi } from "../../api/modules/ops";
import type { OpsNotifSettingEvent, OpsSegment } from "../../api/modules/ops";

// 事件中文名 + 说明(event_key → 展示)
const EVENT_META: Record<string, { label: string; desc: string }> = {
	ticket_assigned: { label: "别人给我提单", desc: "有人给你提单 / 把工单改派给你时通知" },
	ticket_overdue_deliver: { label: "工单超时·过交付", desc: "工单过了交付时间(橙)时通知负责人" },
	ticket_overdue_warn: { label: "工单超时·过预警", desc: "工单过了预警时间(红)时通知负责人" },
	project_overdue: { label: "项目超时", desc: "项目下版交付时间逾期,通知选定环节的负责人" },
	ticket_priority_changed: { label: "工单优先级变更", desc: "管理员/策划改了工单优先级时通知负责人" },
	ticket_status_changed: { label: "工单状态变更", desc: "工单状态变更时通知负责人(操作人就是负责人则不发)" },
};

export default function OpsNotificationSettingsPage() {
	const { message } = App.useApp();
	const [events, setEvents] = useState<OpsNotifSettingEvent[]>([]);
	const [scanIntervalMin, setScanIntervalMin] = useState(15);
	const [notifyStart, setNotifyStart] = useState("10:00");
	const [notifyEnd, setNotifyEnd] = useState("22:00");
	const [segments, setSegments] = useState<OpsSegment[]>([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	const load = async () => {
		setLoading(true);
		try {
			const [s, seg] = await Promise.all([opsApi.notifSettings(), opsApi.segments()]);
			setEvents(s.events);
			setScanIntervalMin(s.scanIntervalMin);
			setNotifyStart(s.notifyStart);
			setNotifyEnd(s.notifyEnd);
			setSegments(seg.segments);
		} catch (e) {
			message.error(e instanceof Error ? e.message : "加载失败");
		} finally {
			setLoading(false);
		}
	};
	useEffect(() => {
		void load();
	}, []);

	const patch = (eventKey: string, p: Partial<OpsNotifSettingEvent>) => setEvents((prev) => prev.map((e) => (e.eventKey === eventKey ? { ...e, ...p } : e)));

	const save = async () => {
		setSaving(true);
		try {
			const r = await opsApi.saveNotifSettings({ events, scanIntervalMin, notifyStart, notifyEnd });
			setEvents(r.events);
			setScanIntervalMin(r.scanIntervalMin);
			setNotifyStart(r.notifyStart);
			setNotifyEnd(r.notifyEnd);
			message.success("已保存");
		} catch (e) {
			message.error(e instanceof Error ? e.message : "保存失败");
		} finally {
			setSaving(false);
		}
	};

	const segOptions = segments.map((s) => ({ value: s.id, label: s.name }));

	const columns = [
		{
			title: "通知事件",
			key: "event",
			width: 170,
			render: (_: unknown, r: OpsNotifSettingEvent) => EVENT_META[r.eventKey]?.label ?? r.eventKey,
		},
		{
			title: "说明",
			key: "desc",
			render: (_: unknown, r: OpsNotifSettingEvent) => <span style={{ color: "#64748b" }}>{EVENT_META[r.eventKey]?.desc ?? ""}</span>,
		},
		{
			title: "开启",
			key: "enabled",
			width: 80,
			render: (_: unknown, r: OpsNotifSettingEvent) => <Switch checked={r.enabled} onChange={(v) => patch(r.eventKey, { enabled: v })} />,
		},
		{
			title: "项目超时通知人",
			key: "recipients",
			width: 300,
			render: (_: unknown, r: OpsNotifSettingEvent) =>
				r.eventKey === "project_overdue" ? (
					<Select
						mode="multiple"
						allowClear
						style={{ width: "100%" }}
						placeholder="选环节(通知该项目这些环节的负责人)"
						options={segOptions}
						value={r.config?.recipientSegmentIds ?? []}
						onChange={(ids) => patch(r.eventKey, { config: { recipientSegmentIds: ids } })}
						disabled={!r.enabled}
					/>
				) : (
					<span style={{ color: "#cbd5e1" }}>—</span>
				),
		},
	];

	// "HH:mm" → dayjs(手动设时分,避免依赖 customParseFormat 插件)
	const toDayjs = (hhmm: string) => {
		const [h, m] = (hhmm || "0:0").split(":").map(Number);
		return dayjs()
			.hour(h || 0)
			.minute(m || 0)
			.second(0)
			.millisecond(0);
	};

	return (
		<div>
			
			<Space style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
				<span>通知时段</span>
				<TimePicker.RangePicker
					format="HH:mm"
					minuteStep={10}
					allowClear={false}
					value={[toDayjs(notifyStart), toDayjs(notifyEnd)]}
					onChange={(v) => {
						if (v?.[0] && v?.[1]) {
							setNotifyStart(v[0].format("HH:mm"));
							setNotifyEnd(v[1].format("HH:mm"));
						}
					}}
				/>
				<Tooltip title="只在这个时段内弹桌面通知,其他时间(含凌晨)静默;默认 10:00–22:00">
					<QuestionCircleOutlined style={{ color: "#94a3b8", cursor: "help" }} />
				</Tooltip>
			</Space>
			<Space style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
				<span>服务端扫描间隔</span>
				<InputNumber min={10} max={1440} value={scanIntervalMin} onChange={(v) => setScanIntervalMin(Number(v) || 15)} addonAfter="分钟" style={{ width: 160 }} />
				<Tooltip title="针对项目中 状态 / 阶段 停留多久触发一次通知">
					<QuestionCircleOutlined style={{ color: "#94a3b8", cursor: "help" }} />
				</Tooltip>
			</Space>
			<Table rowKey="eventKey" loading={loading} dataSource={events} columns={columns} pagination={false} size="middle" style={{ maxWidth: 920 }} />
			<Button type="primary" loading={saving} onClick={save} style={{ marginTop: 12 }}>
				保存
			</Button>
		</div>
	);
}
