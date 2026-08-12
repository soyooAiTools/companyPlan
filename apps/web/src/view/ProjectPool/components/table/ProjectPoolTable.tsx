import { useCallback, useState } from "react";
import { Table } from "antd";
import type { MouseEvent, ReactNode } from "react";
import type { ColumnsType } from "antd/es/table";
import type { SorterResult } from "antd/es/table/interface";
import type { OpsProjectPoolSortBy, OpsProjectPoolSortOrder } from "@/api/modules/ops";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import { isNextDeadlineOverdue } from "../../deadlineUtils";
import ProjectPoolContextMenu, { type ProjectPoolContextRow } from "./ProjectPoolContextMenu";

type ProjectPoolTableProps = {
  rows: OpsProjectPoolRow[];
  columns: ColumnsType<OpsProjectPoolRow>;
  loading: boolean;
  page?: number;
  pageSize?: number;
  total?: number;
  scrollY?: number;
  pagination?: false;
  onPageChange?: (page: number, pageSize: number) => void;
  onSortChange?: (sortBy?: OpsProjectPoolSortBy, sortOrder?: OpsProjectPoolSortOrder) => void;
  onOpenLogs?: (row: OpsProjectPoolRow) => void;
  onToggleUrgent?: (row: OpsProjectPoolRow) => void;
};

function columnWidthSum(columns: ColumnsType<OpsProjectPoolRow>) {
  return columns.reduce((sum, column) => {
    const width = typeof column.width === "number" ? column.width : Number.parseInt(String(column.width || ""), 10);
    return sum + (Number.isFinite(width) ? width : 120);
  }, 0);
}

export default function ProjectPoolTable({ rows, columns, loading, page, pageSize, total, scrollY, pagination, onPageChange, onSortChange, onOpenLogs, onToggleUrgent }: ProjectPoolTableProps) {
  const [contextRow, setContextRow] = useState<ProjectPoolContextRow | null>(null);
  const closeContextMenu = useCallback(() => setContextRow(null), []);
  const hasTreeRows = rows.some((row) => Array.isArray(row.children) && row.children.length > 0);
  const displayColumns = columns.map((column, index) => ({
    ...column,
    fixed: index === 0 ? "left" as const : column.fixed,
    width: index === 0 ? 330 : column.width,
    render: (value: unknown, row: OpsProjectPoolRow, rowIndex: number) => {
      if (row.hasVersionChildren && !row.isVersionRow && index > 0) return null;
      return column.render ? column.render(value, row, rowIndex) : (value as ReactNode);
    },
  }));
  const scrollX = columnWidthSum(displayColumns);
  const tablePagination =
    pagination === false || !onPageChange || page == null || pageSize == null || total == null
      ? false
      : {
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count: number) => `共 ${count} 个项目`,
          onChange: onPageChange,
        };
  return (
    <>
      <style>{`
        .ops-pool-table .ant-table-tbody > tr > td {
          padding-top: 14px;
          padding-bottom: 14px;
          transition: background-color 160ms ease, transform 160ms ease;
        }
        .ops-pool-table .ant-table,
        .ops-pool-table .ant-table-container,
        .ops-pool-table .ant-table-content,
        .ops-pool-table .ant-table-header {
          border-start-start-radius: 0 !important;
          border-start-end-radius: 0 !important;
          border-top-left-radius: 0 !important;
          border-top-right-radius: 0 !important;
        }
        .ops-pool-table .ant-table-thead > tr:first-child > th:first-child,
        .ops-pool-table .ant-table-thead > tr:first-child > th:last-child {
          border-start-start-radius: 0 !important;
          border-start-end-radius: 0 !important;
          border-top-left-radius: 0 !important;
          border-top-right-radius: 0 !important;
        }
        .ops-pool-table .ant-table-thead > tr > th { padding-top: 11px; padding-bottom: 11px; background: #fff; font-weight: 600; }
        .ops-pool-table .ant-table-thead > tr > th:first-child,
        .ops-pool-table .ant-table-tbody > tr > td:first-child {
          position: sticky !important;
          left: 0 !important;
          max-width: 330px;
          z-index: 4;
          background: #fff;
          box-shadow: 6px 0 8px -8px rgba(15, 23, 42, 0.22);
        }
        .ops-pool-table .ant-table-thead > tr > th:first-child {
          z-index: 7;
        }
        .ops-pool-table .ops-pool-parent-row > td:first-child {
          background: #f8fafc !important;
        }
        .ops-pool-table .ops-pool-stale > td:first-child {
          background: #fff7f6 !important;
        }
        .ops-pool-table .ant-table-column-sorter-up.active,
        .ops-pool-table .ant-table-column-sorter-down.active {
          color: #dc2626;
        }
        .ops-pool-table .ant-table-tbody > tr:not(.ops-pool-stale):hover > td {
          background: #f8fafc !important;
          transform: translateY(-1px) scale(1.001);
        }
        .ops-pool-table .ops-pool-stale > td { background: #fff7f6 !important; }
        .ops-pool-table .ops-pool-stale:hover > td {
          background: #fff1f0 !important;
          transform: translateY(-1px) scale(1.001);
        }
        .ops-pool-table .ops-pool-parent-row > td {
          background: #f8fafc !important;
          font-weight: 600;
        }
        .ops-pool-table .ops-pool-parent-row:hover > td {
          background: #f1f5f9 !important;
        }
        .ops-pool-table .ops-pool-version-row > td {
          background: #fff !important;
        }
        .ops-pool-table .ops-pool-version-row > td:first-child {
          position: relative;
        }
        .ops-pool-table .ops-pool-version-row > td:first-child::before {
          content: "";
          position: absolute;
          left: 36px;
          top: 0;
          bottom: 0;
          border-left: 1px dashed #cbd5e1;
        }
        .ops-pool-table .ops-pool-version-row > td:first-child::after {
          content: "";
          position: absolute;
          left: 36px;
          top: 50%;
          width: 18px;
          border-top: 1px dashed #cbd5e1;
        }
        .ops-pool-table .ant-table-tbody > tr:hover > td:first-child { box-shadow: inset 3px 0 0 #0f766e; }
      `}</style>
      <ProjectPoolContextMenu contextRow={contextRow} onClose={closeContextMenu} onToggleUrgent={onToggleUrgent} />
      <Table
        className="ops-pool-table"
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={displayColumns}
        size="small"
        virtual={!hasTreeRows}
        childrenColumnName="children"
        expandable={hasTreeRows ? { defaultExpandAllRows: true } : undefined}
        tableLayout="fixed"
        scroll={scrollY ? { x: scrollX, y: scrollY } : { x: scrollX }}
        pagination={tablePagination}
        onChange={(_pagination, _filters, sorter, extra) => {
          if (extra.action !== "sort") return;
          if (!onSortChange) return;
          const current = Array.isArray(sorter) ? sorter[0] : (sorter as SorterResult<OpsProjectPoolRow>);
          const key = String(current?.columnKey || "");
          if (key === "stageDeadlines" && current?.order) {
            onSortChange("nextDeadline", current.order === "ascend" ? "asc" : "desc");
            return;
          }
          if (key === "startedAt" && current?.order) {
            onSortChange("projectStart", current.order === "ascend" ? "asc" : "desc");
            return;
          }
          if (key === "duration" && current?.order) {
            onSortChange("projectEnd", current.order === "ascend" ? "asc" : "desc");
            return;
          }
          onSortChange(undefined, undefined);
        }}
        onRow={(row) => ({
          onClick: () => {
            if (!onOpenLogs) return;
            if (row.hasVersionChildren && !row.isVersionRow) return;
            if (window.getSelection()?.toString()) return;
            onOpenLogs(row);
          },
          onContextMenu: (event: MouseEvent) => {
            if (!onToggleUrgent) return;
            if (row.hasVersionChildren && !row.isVersionRow) return;
            event.preventDefault();
            setContextRow({ row, x: event.clientX, y: event.clientY });
          },
          className: [
            isNextDeadlineOverdue(row) ? "ops-pool-stale" : "",
            row.hasVersionChildren ? "ops-pool-parent-row" : "",
            row.isVersionRow ? "ops-pool-version-row" : "",
          ].filter(Boolean).join(" ") || undefined,
          style: { cursor: onOpenLogs && (!row.hasVersionChildren || row.isVersionRow) ? "pointer" : "default" },
        })}
      />
    </>
  );
}
