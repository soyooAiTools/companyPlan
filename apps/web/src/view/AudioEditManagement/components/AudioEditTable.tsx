import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import dayjs from "dayjs";
import { Avatar, Button, Checkbox, Input, InputNumber, Modal, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import { EditOutlined, DownloadOutlined, FilterFilled, LinkOutlined } from "@ant-design/icons";
import type { OpsAudioEditSession } from "../../../api/modules/ops";
import { PROJECT_STATUSES, statusStyle } from "../../Ops/constants";
import "../audioEditManagement.css";

const HIDDEN_PROJECT_STATUS_FILTERS = new Set(["结算完成", "客户暂停", "回收中", "打包中", "已完成"]);
const PROJECT_STATUS_FILTERS = PROJECT_STATUSES.filter((status) => !HIDDEN_PROJECT_STATUS_FILTERS.has(status));

type AudioEditTableProps = {
	rows: OpsAudioEditSession[];
	total: number;
	page: number;
	pageSize: number;
	loading: boolean;
	projectStatus: string;
	sortBy: string;
	sortOrder: "ascend" | "descend" | "";
	onPageChange: (page: number, pageSize: number) => void;
	onProjectStatusChange: (value: string) => void;
	onSortChange: (sortBy: string, sortOrder: "ascend" | "descend" | "") => void;
	onPrioritySave: (row: OpsAudioEditSession, priority: number | null) => Promise<void>;
	onRemarkSave: (row: OpsAudioEditSession, remark: string) => Promise<void>;
	onStatusSave: (row: OpsAudioEditSession, status: string, remark: string) => Promise<void>;
};

function formatTime(value?: string | null) {
	return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function statusTag(status: string) {
	if (status === "已完成") return <Tag className="audio-status-tag audio-status-tag-done">已完成</Tag>;
	if (status === "待替换") return <Tag className="audio-status-tag audio-status-tag-pending">待替换</Tag>;
	return <Tag className="audio-status-tag audio-status-tag-default">{status || "-"}</Tag>;
}

function projectStatusTag(row: OpsAudioEditSession) {
	const status = row.projectStatus || row.projectLifecycleStatus || "";
	if (!status) return <Typography.Text type="secondary">-</Typography.Text>;
	return <Tag style={{ ...statusStyle(status), border: 0 }}>{status}</Tag>;
}

function ProjectStatusFilterDropdown({ selectedKeys, setSelectedKeys, confirm, clearFilters }: any) {
	const current = (selectedKeys || []).map((key: unknown) => String(key));
	const toggle = (value: string) => {
		const next = current.includes(value) ? current.filter((item: string) => item !== value) : [...current, value];
		if (next.length) {
			setSelectedKeys(next);
			confirm({ closeDropdown: false });
			return;
		}
		clearFilters?.({ confirm: true, closeDropdown: false });
	};
	return (
		<div className="audio-project-status-filter-menu">
			{PROJECT_STATUS_FILTERS.map((status) => (
				<button key={status} type="button" className="audio-project-status-filter-option" onClick={() => toggle(status)}>
					<Checkbox checked={current.includes(status)} />
					<span>{status}</span>
				</button>
			))}
		</div>
	);
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
	const [draft, setDraft] = useState("");
	const text = row.systemRemark || "";
	const tooLong = draft.length > 300;
	const canSave = draft.trim().length > 0 && !tooLong;
	return (
		<>
			<div
				className="audio-remark-cell"
				onClick={() => {
					setDraft("");
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
				okButtonProps={{ disabled: !canSave, loading: saving }}
				onCancel={() => setOpen(false)}
				onOk={async () => {
					const nextRemark = `${dayjs().format("MM-DD HH:mm")} ${draft.trim()}${text ? `\n${text}` : ""}`;
					await onSave(row, nextRemark);
					setOpen(false);
				}}>
				<Input.TextArea rows={4} maxLength={300} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="填写本次备注" />
				<div className={tooLong ? "audio-remark-count audio-remark-count-error" : "audio-remark-count"}>{draft.length} / 300</div>
				{ text ? (
					<div className="audio-remark-history">
						<div className="audio-remark-history-title">历史备注</div>
						<div className="audio-remark-history-content">{text}</div>
					</div>
				) : null}
			</Modal>
		</>
	);
}

function StatusCell({
	row,
	saving,
	onSave,
}: {
	row: OpsAudioEditSession;
	saving: boolean;
	onSave: (row: OpsAudioEditSession, status: string, remark: string) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const nextStatus = "已完成";
	const [remark, setRemark] = useState("");
	const tooLong = remark.length > 300;
	const canSave = nextStatus !== row.status && remark.trim().length > 0 && !tooLong;

	useEffect(() => {
		setRemark("");
		setOpen(false);
	}, [row.id, row.status]);

	if (row.status === "已完成") {
		return statusTag(row.status);
	}

	return (
		<>
			<button
				type="button"
				className="audio-status-button"
				disabled={saving}
				title="标记已完成"
				onClick={() => {
					setRemark("");
					setOpen(true);
				}}>
				{statusTag(row.status)}
				<EditOutlined className="audio-status-edit-icon" />
			</button>
			<Modal
				title={`标记已完成 - ${row.projectName || "-"}`}
				open={open}
				width={560}
				okText="保存"
				cancelText="取消"
				okButtonProps={{ disabled: !canSave, loading: saving }}
				onCancel={() => setOpen(false)}
				onOk={async () => {
					await onSave(row, nextStatus, remark.trim());
					setOpen(false);
				}}>
				<Space direction="vertical" size={12} style={{ width: "100%" }}>
					<div className="audio-status-current">当前状态：{statusTag(row.status)}</div>
					<div className="audio-status-current">修改为：{statusTag(nextStatus)}</div>
					<Input.TextArea rows={4} maxLength={300} value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="填写本次状态变更备注" />
					<div className={tooLong ? "audio-remark-count audio-remark-count-error" : "audio-remark-count"}>{remark.length} / 300</div>
				</Space>
			</Modal>
		</>
	);
}

export default function AudioEditTable({ rows, total, page, pageSize, loading, projectStatus, sortBy, sortOrder, onPageChange, onProjectStatusChange, onSortChange, onPrioritySave, onRemarkSave, onStatusSave }: AudioEditTableProps) {
	const [savingId, setSavingId] = useState<string>("");
	const [savingRemarkId, setSavingRemarkId] = useState<string>("");
	const [savingStatusId, setSavingStatusId] = useState<string>("");

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
							{row.hasProjectVersions && row.projectVersionName ? ` - ${row.projectVersionName}` : ""}
							{row.tenantName ? ` - ${row.tenantName}` : ""}
						</Typography.Text>
					</div>
				),
			},
			{ title: "策划制片", dataIndex: "plannerName", width: 160, render: (_text, row) => <PlannerCell row={row} /> },
			{
				title: "项目状态",
				dataIndex: "projectStatus",
				width: 105,
				filters: PROJECT_STATUS_FILTERS.map((item) => ({ text: item, value: item })),
				filteredValue: projectStatus ? projectStatus.split(",").filter(Boolean) : null,
				filterDropdown: ProjectStatusFilterDropdown,
				filterIcon: (filtered) => <FilterFilled style={{ color: filtered ? "#dc2626" : undefined }} />,
				render: (_text, row) => projectStatusTag(row),
			},
			{ title: "上传人", dataIndex: "uploader", width: 110, render: (text) => text || "-" },
			{
				title: "上传时间",
				dataIndex: "uploadedAt",
				width: 150,
				sorter: true,
				sortOrder: sortBy === "last_upload_at" ? sortOrder || null : null,
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
			{
				title: "状态",
				dataIndex: "status",
				width: 120,
				render: (_value, row) => (
					<StatusCell
						row={row}
						saving={savingStatusId === row.id}
						onSave={async (target, nextStatus, remark) => {
							setSavingStatusId(target.id);
							try {
								await onStatusSave(target, nextStatus, remark);
							} finally {
								setSavingStatusId("");
							}
						}}
					/>
				),
			},
			{
				title: "被标注完成时间",
				dataIndex: "completedAt",
				width: 160,
				sorter: true,
				sortOrder: sortBy === "completed_at" ? sortOrder || null : null,
				render: formatTime,
			},
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
		[onPrioritySave, onRemarkSave, onStatusSave, page, pageSize, projectStatus, savingId, savingRemarkId, savingStatusId, sortBy, sortOrder],
	);

	const handleTableChange: TableProps<OpsAudioEditSession>["onChange"] = (_pagination, filters, sorter) => {
		const nextProjectStatus = (filters.projectStatus || []).map((value) => String(value)).filter(Boolean).join(",");
		if (nextProjectStatus !== projectStatus) onProjectStatusChange(nextProjectStatus);

		const currentSorter = Array.isArray(sorter) ? sorter[0] : sorter;
		const field = currentSorter?.field;
		const order = (currentSorter?.order as "ascend" | "descend" | undefined) || "";

		if (!order) {
			if (sortBy) onSortChange("", "");
			return;
		}

		if (field === "uploadedAt" || field === "completedAt") {
			onSortChange(field === "uploadedAt" ? "last_upload_at" : "completed_at", order);
			return;
		}

		if (sortBy) onSortChange("", "");
	};

	return (
		<Table
			className="audio-edit-table"
			rowKey="id"
			loading={loading}
			dataSource={rows}
			columns={columns}
			size="middle"
			scroll={{ x: 1825, y: "calc(100vh - 220px)" }}
			onChange={handleTableChange}
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
