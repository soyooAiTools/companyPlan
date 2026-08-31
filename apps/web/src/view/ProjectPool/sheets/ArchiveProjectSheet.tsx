import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { App, Avatar, Button, DatePicker, Input, Select, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { opsApi, type OpsProjectPoolRow } from "@/api/modules/ops";
import { statusStyle } from "@/view/Ops/constants";
import ProjectSheet from "./ProjectSheet";

const ARCHIVE_STATUSES = ["已完成", "回收中"];

type ArchiveProjectSheetProps = {
	scrollY: number;
	onOpenLogs?: (row: OpsProjectPoolRow) => void;
};

function formatProjectDate(value?: string | null) {
	if (!value) return "—";
	const parsed = dayjs(value);
	return parsed.isValid() ? parsed.format("YYYY/MM/DD") : value;
}

function rowPlanners(row: OpsProjectPoolRow) {
	return row.planners?.length ? row.planners : row.plannerName ? row.plannerName.split(/[、,，/]/).map((name) => ({ name: name.trim(), avatar: "" })) : [];
}

function plannerNames(row: OpsProjectPoolRow) {
	const planners = rowPlanners(row).filter((planner) => planner.name);
	if (!planners.length) return "—";
	return (
		<Space size={6} wrap>
			{planners.map((planner) => (
				<span key={planner.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
					<Avatar size={20} src={planner.avatar || undefined} style={{ background: "#e2e8f0", color: "#475569", fontSize: 11 }}>
						{planner.name.slice(0, 1)}
					</Avatar>
					<span>{planner.name}</span>
				</span>
			))}
		</Space>
	);
}

export default function ArchiveProjectSheet({ scrollY, onOpenLogs }: ArchiveProjectSheetProps) {
	const { message } = App.useApp();
	const [rows, setRows] = useState<OpsProjectPoolRow[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [loading, setLoading] = useState(false);
	const [keyword, setKeyword] = useState("");
	const [keywordInput, setKeywordInput] = useState("");
	const [statusFilter, setStatusFilter] = useState<string[]>(ARCHIVE_STATUSES);
	const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
	const [dateField, setDateField] = useState<"started_at" | "ended_at">("started_at");

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [from, to] = dateRange || [];
			const result = await opsApi.projectPoolArchive({
				page,
				pageSize,
				q: keyword.trim(),
				status: statusFilter,
				from: from ? from.format("YYYY-MM-DD") : undefined,
				to: to ? to.format("YYYY-MM-DD") : undefined,
				dateField,
			});
			setRows(result.rows || []);
			setTotal(Number(result.total || 0));
		} catch (error) {
			message.error(error instanceof Error ? error.message : "加载历史项目失败");
		} finally {
			setLoading(false);
		}
	}, [dateField, dateRange, keyword, message, page, pageSize, statusFilter]);

	useEffect(() => {
		void load();
	}, [load]);

	const archiveColumns = useMemo<ColumnsType<OpsProjectPoolRow>>(() => {
		const offset = (page - 1) * pageSize;
		return [
			{
				title: "项目",
				key: "name",
				width: 300,
				render: (_: unknown, row, index) => (
					<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
						<span style={{ width: 28, flexShrink: 0, textAlign: "right", color: row.isVersionRow ? "#94a3b8" : "#2563eb", fontSize: 12, fontWeight: 600 }}>
							{row.isVersionRow ? "" : offset + index + 1}
						</span>
						<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
							{row.isVersionRow ? row.versionName || row.versionCode || row.name : row.name || "—"}
						</span>
					</div>
				),
			},
			{
				title: "客户",
				key: "tenantName",
				width: 130,
				render: (_: unknown, row) => row.tenantName || "—",
			},
			{
				title: "策划",
				key: "plannerName",
				width: 170,
				render: (_: unknown, row) => plannerNames(row),
			},
			{
				title: "状态",
				key: "status",
				width: 110,
				render: (_: unknown, row) => (
					<Tag bordered={false} style={{ ...statusStyle(row.status), marginInlineEnd: 0 }}>
						{row.status || "—"}
					</Tag>
				),
			},
			{
				title: "项目启动时间",
				key: "startedAt",
				width: 130,
				render: (_: unknown, row) => formatProjectDate(row.startedAt),
			},
			{
				title: "项目结束时间",
				key: "endedAt",
				width: 130,
				render: (_: unknown, row) => formatProjectDate(row.endedAt),
			},
			{
				title: "操作",
				key: "actions",
				width: 110,
				render: (_: unknown, row) =>
					row.hasVersionChildren ? null : (
						<Button size="small" onClick={() => onOpenLogs?.(row)}>
							查看记录
						</Button>
					),
			},
		];
	}, [onOpenLogs, page, pageSize]);

	const search = () => {
		setKeyword(keywordInput);
		setPage(1);
	};

	return (
		<div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 42, padding: "6px 12px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
				<Input
					allowClear
					size="small"
					prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
					placeholder="搜索项目 / 客户 / 策划"
					value={keywordInput}
					onChange={(event) => setKeywordInput(event.target.value)}
					onPressEnter={search}
					style={{ width: 220 }}
				/>
				<Select
					mode="multiple"
					size="small"
					maxTagCount="responsive"
					placeholder="状态"
					value={statusFilter}
					options={ARCHIVE_STATUSES.map((status) => ({
						value: status,
						label: (
							<Tag bordered={false} style={{ ...statusStyle(status), marginInlineEnd: 0 }}>
								{status}
							</Tag>
						),
					}))}
					onChange={(value) => {
						setStatusFilter(value.length ? value : ARCHIVE_STATUSES);
						setPage(1);
					}}
					style={{ width: 220 }}
				/>
				<DatePicker.RangePicker
					allowClear
					size="small"
					placeholder={["开始日期", "结束日期"]}
					value={dateRange}
					onChange={(value) => {
						setDateRange(value);
						setPage(1);
					}}
				/>
				<Select
					size="small"
					value={dateField}
					options={[
						{ value: "started_at", label: "按启动时间" },
						{ value: "ended_at", label: "按结束时间" },
					]}
					onChange={(value) => {
						setDateField(value);
						setPage(1);
					}}
					style={{ width: 116 }}
				/>
				<Space size={8}>
					<Button type="primary" size="small" onClick={search}>
						查询
					</Button>
					<Button
						size="small"
						onClick={() => {
							setKeyword("");
							setKeywordInput("");
							setStatusFilter(ARCHIVE_STATUSES);
							setDateRange(null);
							setDateField("started_at");
							setPage(1);
						}}>
						重置
					</Button>
					<Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
						刷新
					</Button>
				</Space>
			</div>
			<div style={{ flex: 1, minHeight: 0 }}>
				<ProjectSheet
					rows={rows}
					columns={archiveColumns}
					loading={loading}
					page={page}
					pageSize={pageSize}
					total={total}
					scrollY={Math.max(160, scrollY - 42)}
					onPageChange={(nextPage, nextPageSize) => {
						setPage(nextPage);
						setPageSize(nextPageSize);
					}}
					onOpenLogs={onOpenLogs}
				/>
			</div>
		</div>
	);
}
