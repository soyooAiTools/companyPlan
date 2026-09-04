import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { App, Avatar, Button, DatePicker, Modal, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { FilterFilled } from "@ant-design/icons";
import { opsApi, type OpsProjectPoolRow, type OpsProjectPoolSortBy, type OpsProjectPoolSortOrder, type OpsProjectVersion } from "@/api/modules/ops";
import { statusStyle } from "@/view/Ops/constants";
import HeaderMultiSelectDropdown from "../components/table/HeaderMultiSelectDropdown";
import ProjectSheet from "./ProjectSheet";
import AdvancedFilterBuilder, { compactAdvancedFilter, emptyAdvancedFilter, stringifyAdvancedFilter, type AdvancedFilterValue } from "@/components/common/AdvancedFilterBuilder";

const ARCHIVE_STATUSES = ["结算完成", "已完成", "回收中"];

type ArchiveProjectSheetProps = {
	scrollY: number;
	onOpenLogs?: (row: OpsProjectPoolRow) => void;
};

type DateRangeFilterProps = {
	value: [Dayjs | null, Dayjs | null] | null;
	placeholder: [string, string];
	onApply: (value: [Dayjs | null, Dayjs | null] | null) => void;
	close: () => void;
};

function DateRangeFilterDropdown({ value, placeholder, onApply, close }: DateRangeFilterProps) {
	const [draft, setDraft] = useState<[Dayjs | null, Dayjs | null] | null>(value);
	return (
		<div style={{ padding: 10, width: 290 }} onClick={(event) => event.stopPropagation()}>
			<DatePicker.RangePicker size="small" value={draft} placeholder={placeholder} onChange={setDraft} style={{ width: "100%" }} />
			<Space size={8} style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
				<Button size="small" onClick={() => setDraft(null)}>清空</Button>
				<Button size="small" type="primary" onClick={() => { onApply(draft); close(); }}>筛选</Button>
			</Space>
		</div>
	);
}

function formatProjectDate(value?: string | null) {
	if (!value) return "—";
	const parsed = dayjs(value);
	return parsed.isValid() ? parsed.format("YYYY/MM/DD") : value;
}

function formatProjectDateTime(value?: string | null) {
	if (!value) return "—";
	const parsed = dayjs(value);
	return parsed.isValid() ? parsed.format("YYYY/MM/DD HH:mm") : value;
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
	const [statusFilter, setStatusFilter] = useState<string[]>(ARCHIVE_STATUSES);
	const [startedDateRange, setStartedDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
	const [endedDateRange, setEndedDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
	const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilterValue>(emptyAdvancedFilter);
	const [sortBy, setSortBy] = useState<OpsProjectPoolSortBy>();
	const [sortOrder, setSortOrder] = useState<OpsProjectPoolSortOrder>();
	const [versionModalOpen, setVersionModalOpen] = useState(false);
	const [versionModalTitle, setVersionModalTitle] = useState("");
	const [versionRows, setVersionRows] = useState<OpsProjectVersion[]>([]);
	const [versionsLoading, setVersionsLoading] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [startedFrom, startedTo] = startedDateRange || [];
			const [endedFrom, endedTo] = endedDateRange || [];
			const result = await opsApi.projectPoolArchive({
				page,
				pageSize,
				status: statusFilter,
				startedFrom: startedFrom ? startedFrom.format("YYYY-MM-DD") : undefined,
				startedTo: startedTo ? startedTo.format("YYYY-MM-DD") : undefined,
				endedFrom: endedFrom ? endedFrom.format("YYYY-MM-DD") : undefined,
				endedTo: endedTo ? endedTo.format("YYYY-MM-DD") : undefined,
				advancedFilter: stringifyAdvancedFilter(advancedFilter),
				sortBy,
				sortOrder,
			});
			setRows(result.rows || []);
			setTotal(Number(result.total || 0));
		} catch (error) {
			message.error(error instanceof Error ? error.message : "加载历史项目失败");
		} finally {
			setLoading(false);
		}
	}, [advancedFilter, endedDateRange, message, page, pageSize, sortBy, sortOrder, startedDateRange, statusFilter]);

	const advancedFilterFields = useMemo(
		() => [
			{ key: "name", label: "项目名称" },
			{ key: "tenantName", label: "客户" },
			{ key: "plannerName", label: "策划" },
			{ key: "status", label: "状态", options: ARCHIVE_STATUSES.map((status) => ({ label: status, value: status })) },
		],
		[],
	);
	const activeAdvancedCount = compactAdvancedFilter(advancedFilter).rules.length;

	useEffect(() => {
		void load();
	}, [load]);

	const openVersionModal = useCallback(
		async (row: OpsProjectPoolRow) => {
			const projectId = String(row.projectId || row.id || "");
			if (!projectId) return;
			setVersionModalTitle([row.name, row.tenantName].filter(Boolean).join(" - "));
			setVersionRows([]);
			setVersionModalOpen(true);
			setVersionsLoading(true);
			try {
				const result = await opsApi.projectPoolArchiveVersions(projectId);
				setVersionRows([...(result.versions || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.code || a.id).localeCompare(String(b.code || b.id))));
			} catch (error) {
				message.error(error instanceof Error ? error.message : "加载版本状态失败");
			} finally {
				setVersionsLoading(false);
			}
		},
		[message],
	);

	const archiveColumns = useMemo<ColumnsType<OpsProjectPoolRow>>(() => {
		const offset = (page - 1) * pageSize;
		return [
			{
				title: "项目",
				key: "name",
				width: 300,
				filterDropdown: ({ close }) => (
					<AdvancedFilterBuilder
						value={advancedFilter}
						fields={advancedFilterFields}
						onChange={(value) => {
							setAdvancedFilter(value);
							setPage(1);
						}}
						onApply={close}
					/>
				),
				filterIcon: () => <FilterFilled style={{ color: activeAdvancedCount ? "#dc2626" : undefined }} />,
				render: (_: unknown, row, index) => (
					<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
						<span style={{ width: 28, flexShrink: 0, textAlign: "right", color: row.isVersionRow ? "#94a3b8" : "#2563eb", fontSize: 12, fontWeight: 600 }}>
							{row.isVersionRow ? "" : offset + index + 1}
						</span>
						<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
							{row.isVersionRow ? row.versionName || row.versionCode || row.name : [row.name, row.tenantName].filter(Boolean).join(" - ") || "—"}
						</span>
					</div>
				),
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
				width: 180,
				filterDropdown: ({ close }) => (
					<HeaderMultiSelectDropdown
						value={statusFilter}
						options={ARCHIVE_STATUSES.map((status) => ({
							value: status,
							label: <Tag bordered={false} style={{ ...statusStyle(status), marginInlineEnd: 0 }}>{status}</Tag>,
						}))}
						onApply={(value) => {
							setStatusFilter(value.length ? value : ARCHIVE_STATUSES);
							setPage(1);
						}}
						close={close}
					/>
				),
				filterIcon: () => <FilterFilled style={{ color: statusFilter.length === ARCHIVE_STATUSES.length ? undefined : "#dc2626" }} />,
				render: (_: unknown, row) => {
					const versionCount = Number(row.versionCount || 0);
					return (
						<Space size={6}>
							<Tag bordered={false} style={{ ...statusStyle(row.status), marginInlineEnd: 0 }}>
								{row.status || "—"}
							</Tag>
							{versionCount > 1 ? (
								<Button
									type="link"
									size="small"
									style={{ padding: 0, height: 22 }}
									onClick={(event) => {
										event.stopPropagation();
										openVersionModal(row);
									}}
								>
									{versionCount} 个版本
								</Button>
							) : null}
						</Space>
					);
				},
			},
			{
				title: "项目启动时间",
				key: "startedAt",
				width: 130,
				sorter: true,
				sortOrder: sortBy === "projectStart" ? (sortOrder === "asc" ? "ascend" : "descend") : null,
				filterDropdown: ({ close }) => (
					<DateRangeFilterDropdown
						value={startedDateRange}
						placeholder={["项目启动时间", ""]}
						onApply={(value) => { setStartedDateRange(value); setPage(1); }}
						close={close}
					/>
				),
				filterIcon: () => <FilterFilled style={{ color: startedDateRange?.some(Boolean) ? "#dc2626" : undefined }} />,
				render: (_: unknown, row) => formatProjectDate(row.startedAt),
			},
			{
				title: "项目结束时间",
				key: "duration",
				width: 130,
				sorter: true,
				sortOrder: sortBy === "projectEnd" ? (sortOrder === "asc" ? "ascend" : "descend") : null,
				filterDropdown: ({ close }) => (
					<DateRangeFilterDropdown
						value={endedDateRange}
						placeholder={["项目结束时间", ""]}
						onApply={(value) => { setEndedDateRange(value); setPage(1); }}
						close={close}
					/>
				),
				filterIcon: () => <FilterFilled style={{ color: endedDateRange?.some(Boolean) ? "#dc2626" : undefined }} />,
				render: (_: unknown, row) => formatProjectDate(row.endedAt),
			},
		];
	}, [activeAdvancedCount, advancedFilter, advancedFilterFields, endedDateRange, openVersionModal, page, pageSize, sortBy, sortOrder, startedDateRange, statusFilter]);

	return (
		<div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
			<div style={{ flex: 1, minHeight: 0 }}>
				<ProjectSheet
					rows={rows}
					columns={archiveColumns}
					loading={loading}
					page={page}
					pageSize={pageSize}
					total={total}
					scrollY={scrollY}
					onPageChange={(nextPage, nextPageSize) => {
						setPage(nextPage);
						setPageSize(nextPageSize);
					}}
					onSortChange={(nextSortBy, nextSortOrder) => {
						setSortBy(nextSortBy);
						setSortOrder(nextSortOrder);
						setPage(1);
					}}
					onOpenLogs={onOpenLogs}
				/>
			</div>
			<Modal title={`${versionModalTitle || "项目"} · 版本状态`} open={versionModalOpen} onCancel={() => setVersionModalOpen(false)} footer={null} width={680} destroyOnHidden>
				<Table<OpsProjectVersion>
					size="small"
					rowKey={(row) => row.id || row.code}
					loading={versionsLoading}
					dataSource={versionRows}
					pagination={false}
					columns={[
						{
							title: "版本",
							key: "version",
							render: (_: unknown, row) => (
								<Space size={6}>
									<span style={{ fontWeight: 700 }}>{row.code || "—"}</span>
									<span>{row.name || "默认版本"}</span>
									{row.isDefault ? <Tag bordered={false}>默认</Tag> : null}
								</Space>
							),
						},
						{
							title: "状态",
							dataIndex: "status",
							width: 130,
							render: (status: string) => (
								<Tag bordered={false} style={{ ...statusStyle(status), marginInlineEnd: 0 }}>
									{status || "—"}
								</Tag>
							),
						},
						{
							title: "最后操作状态时间",
							dataIndex: "statusChangedAt",
							width: 160,
							render: (value: string | null | undefined) => formatProjectDateTime(value),
						},
					]}
				/>
			</Modal>
		</div>
	);
}
