import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { App, Button, Checkbox, Divider, Modal, Select, Space, Tooltip, Typography } from "antd";
import { DownloadOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import { opsApi, type OpsProjectPoolRow } from "@/api/modules/ops";
import { PROJECT_STAGES, PROJECT_STATUSES } from "@/view/Ops/constants";
import { finalStageDeadline, fmtProjectDate, nextStageDeadline, projectStartDate, stageDeadlineName, stageRangeLabel, stageDeadlineTemplates } from "../../deadlineUtils";

type ExportColumnKey =
	| "name"
	| "tenantName"
	| "customerContact"
	| "requirementDoc"
	| "plannerName"
	| "stage"
	| "nextDeadline"
	| "stagePlan"
	| "projectStart"
	| "projectEnd"
	| "status"
	| "segments";

type ExportColumn = {
	key: ExportColumnKey;
	label: string;
	value: (row: OpsProjectPoolRow) => string | number;
};

type ResolvedExportColumn = Omit<ExportColumn, "key"> & { key: string };

const ACTIVE_PROJECT_STATUSES_EXCLUDE = new Set(["完成", "已完成", "回收中"]);

const nextDeadlineText = (row: OpsProjectPoolRow) => {
	const deadline = nextStageDeadline(row.stage, Array.isArray(row.stageDeadlines) ? row.stageDeadlines : []);
	if (!deadline?.date) return "";
	return `${deadline.date} ${stageDeadlineName(deadline)}`;
};

const stageDeadlineDate = (row: OpsProjectPoolRow, key: string, name: string) => {
	const item = (row.stageDeadlines || []).find((deadline) => deadline.key === key || deadline.name === name);
	return item?.date || "";
};

const exportColumns: ExportColumn[] = [
	{ key: "name", label: "项目名称", value: (row) => row.name },
	{ key: "tenantName", label: "客户", value: (row) => row.tenantName },
	{ key: "customerContact", label: "客户对接人", value: (row) => row.customerContact || "" },
	{ key: "requirementDoc", label: "需求文档", value: (row) => row.requirementDoc || "" },
	{ key: "plannerName", label: "策划", value: (row) => row.plannerName || "" },
	{ key: "stage", label: "当前阶段", value: (row) => (row.stage ? stageRangeLabel(row.stage) : "") },
	{ key: "nextDeadline", label: "下版交付时间", value: nextDeadlineText },
	{ key: "stagePlan", label: "交付阶段", value: () => "" },
	{ key: "projectStart", label: "项目启动时间", value: (row) => fmtProjectDate(projectStartDate(row.startedAt, row.stageDeadlines)) },
	{ key: "projectEnd", label: "项目结束时间", value: (row) => fmtProjectDate(finalStageDeadline(row.stageDeadlines)?.date) },
	{ key: "status", label: "当前状态", value: (row) => row.status || "" },
	{ key: "segments", label: "目前环节", value: (row) => (row.segments || []).map((segment) => `${segment.name}(${segment.count})`).join("、") },
];

const defaultColumnKeys: ExportColumnKey[] = ["name", "plannerName", "stagePlan"];

const uniqueOptions = (items: string[]) =>
	[...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))]
		.sort((a, b) => a.localeCompare(b, "zh-CN"))
		.map((item) => ({ label: item, value: item }));

const plannerNames = (row: OpsProjectPoolRow) =>
	row.planners?.length ? row.planners.map((planner) => planner.name).filter(Boolean) : String(row.plannerName || "").split(/[、,，/]/).map((name) => name.trim()).filter(Boolean);

const exportCellText = (value: unknown) => {
	const text = String(value ?? "").trim();
	return text || "-";
};

const exportColumnWidth = (column: ResolvedExportColumn) => {
	if (column.key === "name") return 220;
	if (column.key === "customerContact" || column.key === "requirementDoc") return 160;
	if (column.key.startsWith("stagePlan.")) return 130;
	if (column.key === "stage" || column.key === "nextDeadline") return 180;
	if (column.key === "segments") return 180;
	return 120;
};

const resolveExportColumns = (columnKeys: ExportColumnKey[]): ResolvedExportColumn[] => {
	const columns: ResolvedExportColumn[] = [];
	for (const key of columnKeys) {
		if (key === "stagePlan") {
			for (const stage of stageDeadlineTemplates) {
				columns.push({
					key: `stagePlan.${stage.key}`,
					label: stage.name,
					value: (row) => stageDeadlineDate(row, stage.key, stage.name),
				});
			}
			continue;
		}
		const column = exportColumns.find((item) => item.key === key);
		if (column) columns.push(column);
	}
	return columns;
};

const downloadExcel = (filename: string, rows: OpsProjectPoolRow[], columns: ResolvedExportColumn[]) => {
	const data = [columns.map((column) => column.label), ...rows.map((row) => columns.map((column) => exportCellText(column.value(row))))];
	const sheet = XLSX.utils.aoa_to_sheet(data);
	sheet["!cols"] = columns.map((column) => ({ wch: Math.max(10, Math.round(exportColumnWidth(column) / 8)) }));
	sheet["!rows"] = [{ hpt: 22 }, ...rows.map(() => ({ hpt: 20 }))];

	const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
	for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
		for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
			const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
			const cell = sheet[address];
			if (!cell) continue;
			cell.s = {
				font: rowIndex === 0 ? { bold: true, color: { rgb: "0F172A" } } : { color: { rgb: "1F2937" } },
				fill: { fgColor: { rgb: rowIndex === 0 ? "EEF3F8" : rowIndex % 2 === 0 ? "FBFDFF" : "FFFFFF" } },
				border: {
					top: { style: "thin", color: { rgb: "D9E2EC" } },
					bottom: { style: "thin", color: { rgb: "D9E2EC" } },
					left: { style: "thin", color: { rgb: "D9E2EC" } },
					right: { style: "thin", color: { rgb: "D9E2EC" } },
				},
				alignment: { vertical: "center", horizontal: rowIndex === 0 ? "center" : "left" },
			};
		}
	}
	sheet["!autofilter"] = { ref: sheet["!ref"] || "A1:A1" };

	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, sheet, "项目报表");
	XLSX.writeFile(workbook, filename, { bookType: "xlsx", cellStyles: true });
};

export default function ProjectPoolExportButton() {
	const { message } = App.useApp();
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [rows, setRows] = useState<OpsProjectPoolRow[]>([]);
	const [tenantFilter, setTenantFilter] = useState<string[]>([]);
	const [plannerFilter, setPlannerFilter] = useState<string[]>([]);
	const [stageFilter, setStageFilter] = useState<string[]>([]);
	const [statusFilter, setStatusFilter] = useState<string[]>([]);
	const [columnKeys, setColumnKeys] = useState<ExportColumnKey[]>(defaultColumnKeys);

	const activeRows = useMemo(() => rows.filter((row) => !ACTIVE_PROJECT_STATUSES_EXCLUDE.has(row.status)), [rows]);
	const filteredRows = useMemo(() => {
		return activeRows.filter((row) => {
			if (tenantFilter.length && !tenantFilter.includes(row.tenantName)) return false;
			if (stageFilter.length && !stageFilter.includes(row.stage)) return false;
			if (statusFilter.length && !statusFilter.includes(row.status)) return false;
			if (plannerFilter.length) {
				const names = plannerNames(row);
				if (!plannerFilter.some((name) => names.includes(name))) return false;
			}
			return true;
		});
	}, [activeRows, plannerFilter, stageFilter, statusFilter, tenantFilter]);

	const selectedColumns = useMemo(() => resolveExportColumns(columnKeys), [columnKeys]);
	const tenantOptions = useMemo(() => uniqueOptions(activeRows.map((row) => row.tenantName)), [activeRows]);
	const plannerOptions = useMemo(() => uniqueOptions(activeRows.flatMap(plannerNames)), [activeRows]);
	const stageOptions = useMemo(() => uniqueOptions([...PROJECT_STAGES, ...activeRows.map((row) => row.stage)]), [activeRows]);
	const statusOptions = useMemo(() => uniqueOptions([...PROJECT_STATUSES, ...activeRows.map((row) => row.status)].filter((status) => !ACTIVE_PROJECT_STATUSES_EXCLUDE.has(status))), [activeRows]);

	const loadRows = async () => {
		setLoading(true);
		try {
			const result = await opsApi.projectPool({ page: 1, pageSize: 500 });
			setRows(result.rows);
		} catch (error) {
			message.error(error instanceof Error ? error.message : "加载导出数据失败");
			setRows([]);
		} finally {
			setLoading(false);
		}
	};

	const openModal = () => {
		setOpen(true);
		void loadRows();
	};

	const reset = () => {
		setTenantFilter([]);
		setPlannerFilter([]);
		setStageFilter([]);
		setStatusFilter([]);
		setColumnKeys(defaultColumnKeys);
	};

	const exportFile = () => {
		if (!selectedColumns.length) {
			message.warning("请至少选择一个导出列");
			return;
		}
		if (!filteredRows.length) {
			message.warning("当前条件下没有可导出的项目");
			return;
		}
		downloadExcel(`项目报表-${dayjs().format("YYYYMMDD-HHmm")}.xlsx`, filteredRows, selectedColumns);
		setOpen(false);
	};

	return (
		<>
			<Button icon={<DownloadOutlined />} onClick={openModal}>
				导出报表
			</Button>
			<Modal
				title="导出项目报表"
				open={open}
				width={900}
				onCancel={() => setOpen(false)}
				okText={loading ? "数据加载中..." : "导出 Excel"}
				cancelText="取消"
				confirmLoading={loading}
				onOk={exportFile}
				keyboard={false}
				mask={{ closable: false }}
			>
				<Typography.Text type="secondary">
					导出范围固定为状态非「已完成 / 回收中」的项目；当前条件共{" "}
					<span style={{ color: "#ef4444", fontWeight: 'bold', fontSize: 20 }}>{filteredRows.length}</span> 个项目。
				</Typography.Text>
				<Divider plain>筛选条件</Divider>
				<Space wrap size={10}>
					<Select mode="multiple" allowClear maxTagCount="responsive" placeholder="客户" value={tenantFilter} options={tenantOptions} onChange={setTenantFilter} style={{ width: 170 }} />
					<Select mode="multiple" allowClear maxTagCount="responsive" placeholder="策划" value={plannerFilter} options={plannerOptions} onChange={setPlannerFilter} style={{ width: 170 }} />
					<Select mode="multiple" allowClear maxTagCount="responsive" placeholder="当前阶段" value={stageFilter} options={stageOptions} onChange={setStageFilter} style={{ width: 180 }} />
					<Select mode="multiple" allowClear maxTagCount="responsive" placeholder="项目状态" value={statusFilter} options={statusOptions} onChange={setStatusFilter} style={{ width: 170 }} />
					<Button onClick={reset}>重置</Button>
				</Space>
				<Divider plain>导出列</Divider>
				<Checkbox.Group value={columnKeys} onChange={(value) => setColumnKeys(value as ExportColumnKey[])} style={{ display: "block", width: "100%" }}>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px 12px" }}>
						{exportColumns.map((column) => (
							<Checkbox key={column.key} value={column.key}>
								{column.label}
								{column.key === "stagePlan" ? (
									<Tooltip title="导出 5 个交付环节：资产确认、场景单帧版本、可交互初版、功能完整版、最终交付版">
										<QuestionCircleOutlined style={{ marginLeft: 5, color: "#94a3b8" }} />
									</Tooltip>
								) : null}
							</Checkbox>
						))}
					</div>
				</Checkbox.Group>
			</Modal>
		</>
	);
}
