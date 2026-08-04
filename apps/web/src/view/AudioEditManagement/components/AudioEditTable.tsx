import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import dayjs from "dayjs";
import { Avatar, Button, Input, InputNumber, Modal, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EditOutlined, DownloadOutlined, LinkOutlined } from "@ant-design/icons";
import type { OpsAudioEditSession } from "../../../api/modules/ops";
import "../audioEditManagement.css";

type AudioEditTableProps = {
	rows: OpsAudioEditSession[];
	total: number;
	page: number;
	pageSize: number;
	loading: boolean;
	onPageChange: (page: number, pageSize: number) => void;
	onPrioritySave: (row: OpsAudioEditSession, priority: number | null) => Promise<void>;
	onRemarkSave: (row: OpsAudioEditSession, remark: string) => Promise<void>;
};

function formatTime(value?: string | null) {
	return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function statusTag(status: string) {
	if (status === "已完成") return <Tag className="audio-status-tag audio-status-tag-done">已完成</Tag>;
	if (status === "待替换") return <Tag className="audio-status-tag audio-status-tag-pending">待替换</Tag>;
	return <Tag className="audio-status-tag audio-status-tag-default">{status || "-"}</Tag>;
}

function LinkButton({ href, label, icon }: { href?: string; label: string; icon: ReactNode }) {
	if (!href) return <Typography.Text type="secondary">-</Typography.Text>;
	return (
		<Button type="link" size="small" href={href} target="_blank" rel="noreferrer" icon={icon} style={{ paddingInline: 0 }}>
			{label}
		</Button>
	);
}

function PlannerCell({ row }: { row: OpsAudioEditSession }) {
	const planners = row.planners?.length ? row.planners : row.plannerName ? [{ name: row.plannerName, avatar: row.plannerAvatar }] : [];
	if (!planners.length) return <Typography.Text type="secondary">-</Typography.Text>;
	return (
		<Space size={6} wrap>
			{planners.map((planner) => (
				<Space key={planner.name || planner.avatar} size={5}>
					<Avatar size={22} src={planner.avatar || undefined}>
						{planner.name ? planner.name.slice(0, 1) : ""}
					</Avatar>
					<Typography.Text>{planner.name || "-"}</Typography.Text>
				</Space>
			))}
		</Space>
	);
}

function PriorityCell({ row, saving, onSave }: { row: OpsAudioEditSession; saving: boolean; onSave: (row: OpsAudioEditSession, priority: number | null) => Promise<void> }) {
	const [value, setValue] = useState<number | null>(row.priority ?? null);
	const [editing, setEditing] = useState(false);
	useEffect(() => {
		setValue(row.priority ?? null);
		setEditing(false);
	}, [row.id, row.priority]);

	const commit = async () => {
		const next = value == null ? null : Number(value);
		if (next === (row.priority ?? null)) {
			setEditing(false);
			return;
		}
		await onSave(row, next);
		setEditing(false);
	};

	if (editing) {
		return (
			<InputNumber
				autoFocus
				className="audio-priority-input"
				size="small"
				min={0}
				controls={false}
				disabled={saving}
				value={value}
				onChange={(next) => setValue(next == null ? null : Number(next))}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						setValue(row.priority ?? null);
						setEditing(false);
					}
				}}
				onPressEnter={(event) => {
					commit();
					event.currentTarget.blur();
				}}
			/>
		);
	}

	return (
		<button
			type="button"
			className="audio-priority-display"
			disabled={saving}
			title="修改优先级"
			onClick={() => setEditing(true)}
		>
			<span>{row.priority ?? "-"}</span>
			<EditOutlined className="audio-priority-edit-icon" />
		</button>
	);
}

function RemarkCell({ row, saving, onSave }: { row: OpsAudioEditSession; saving: boolean; onSave: (row: OpsAudioEditSession, remark: string) => Promise<void> }) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(row.systemRemark || "");
	const text = row.systemRemark || "";
	const tooLong = draft.length > 300;
	const changed = draft !== text;
	return (
		<>
			<div
				className="audio-remark-cell"
				onClick={() => {
					setDraft(text);
					setOpen(true);
				}}>
				{text ? (
					<Tooltip title={<div style={{ whiteSpace: "pre-wrap" }}>{text}</div>}>
						<Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0, whiteSpace: "pre-wrap" }}>
							{text}
						</Typography.Paragraph>
					</Tooltip>
				) : (
					<Typography.Text type="secondary">-</Typography.Text>
				)}
				<EditOutlined className="audio-remark-edit" />
			</div>
			<Modal
				title={`修改备注 - ${row.projectName || "-"}`}
				open={open}
				width={620}
				okText="保存"
				cancelText="取消"
				okButtonProps={{ disabled: !changed || tooLong, loading: saving }}
				onCancel={() => setOpen(false)}
				onOk={async () => {
					await onSave(row, draft);
					setOpen(false);
				}}>
				<Input.TextArea rows={6} maxLength={300} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="填写备注" />
				<div className={tooLong ? "audio-remark-count audio-remark-count-error" : "audio-remark-count"}>{draft.length} / 300</div>
			</Modal>
		</>
	);
}

export default function AudioEditTable({ rows, total, page, pageSize, loading, onPageChange, onPrioritySave, onRemarkSave }: AudioEditTableProps) {
	const [savingId, setSavingId] = useState<string>("");
	const [savingRemarkId, setSavingRemarkId] = useState<string>("");

	const columns = useMemo<ColumnsType<OpsAudioEditSession>>(
		() => [
			{
				title: "项目名",
				dataIndex: "projectName",
				width: 230,
				fixed: "left",
				render: (text, row, index) => (
					<div className="audio-project-cell">
						<span className="audio-project-index">{(page - 1) * pageSize + index + 1}</span>
						<Typography.Text strong>
							{text || "-"}
							{row.tenantName ? ` - ${row.tenantName}` : ""}
						</Typography.Text>
					</div>
				),
			},
			{ title: "策划制片", dataIndex: "plannerName", width: 160, render: (_text, row) => <PlannerCell row={row} /> },
			{ title: "上传人", dataIndex: "uploader", width: 110, render: (text) => text || "-" },
			{
				title: "上传时间",
				dataIndex: "uploadedAt",
				width: 150,
				sorter: (a, b) => dayjs(a.uploadedAt || 0).valueOf() - dayjs(b.uploadedAt || 0).valueOf(),
				render: formatTime,
			},
			{
				title: "优先级",
				dataIndex: "priority",
				width: 95,
				sorter: (a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER),
				render: (_value, row) => (
					<PriorityCell
						row={row}
						saving={savingId === row.id}
						onSave={async (target, priority) => {
							setSavingId(target.id);
							try {
								await onPrioritySave(target, priority);
							} finally {
								setSavingId("");
							}
						}}
					/>
				),
			},
			{
				title: "调试链接",
				dataIndex: "debugUrl",
				width: 110,
				render: (href) => <LinkButton href={href} label="进入调试" icon={<LinkOutlined />} />,
			},
			{ title: "原音效数量", dataIndex: "audioCount", width: 110, align: "right" },
			{ title: "已替换数量", dataIndex: "replacedCount", width: 110, align: "right" },
			{ title: "状态", dataIndex: "status", width: 100, render: statusTag },
			{ title: "被标注完成时间", dataIndex: "completedAt", width: 160, render: formatTime },
			{
				title: "导出包",
				dataIndex: "exportZipUrl",
				width: 105,
				render: (href) => <LinkButton href={href} label="下载音效包" icon={<DownloadOutlined />} />,
			},
			{
				title: "系统备注",
				dataIndex: "systemRemark",
				width: 260,
				render: (_text, row) => (
					<RemarkCell
						row={row}
						saving={savingRemarkId === row.id}
						onSave={async (target, remark) => {
							setSavingRemarkId(target.id);
							try {
								await onRemarkSave(target, remark);
							} finally {
								setSavingRemarkId("");
							}
						}}
					/>
				),
			},
		],
		[onPrioritySave, onRemarkSave, page, pageSize, savingId, savingRemarkId],
	);

	return (
		<Table
			className="audio-edit-table"
			rowKey="id"
			loading={loading}
			dataSource={rows}
			columns={columns}
			size="middle"
			scroll={{ x: 1720, y: "calc(100vh - 220px)" }}
			pagination={{
				current: page,
				pageSize,
				total,
				showSizeChanger: true,
				showTotal: (value) => `共 ${value} 条`,
				onChange: onPageChange,
			}}
		/>
	);
}
