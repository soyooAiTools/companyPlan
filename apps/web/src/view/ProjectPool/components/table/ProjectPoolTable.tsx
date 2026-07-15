import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import { isNextDeadlineOverdue } from "../../deadlineUtils";

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
  onOpenLogs?: (row: OpsProjectPoolRow) => void;
};

export default function ProjectPoolTable({ rows, columns, loading, page, pageSize, total, scrollY, pagination, onPageChange, onOpenLogs }: ProjectPoolTableProps) {
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
        .ops-pool-table .ant-table-tbody > tr:hover > td:first-child { box-shadow: inset 3px 0 0 #0f766e; }
      `}</style>
      <Table
        className="ops-pool-table"
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={columns}
        size="small"
        virtual
        scroll={scrollY ? { x: 1350, y: scrollY } : { x: 1350 }}
        pagination={tablePagination}
        onRow={(row) => ({
          onClick: () => {
            if (!onOpenLogs) return;
            if (window.getSelection()?.toString()) return;
            onOpenLogs(row);
          },
          className: isNextDeadlineOverdue(row) ? "ops-pool-stale" : undefined,
          style: { cursor: onOpenLogs ? "pointer" : "default" },
        })}
      />
    </>
  );
}
