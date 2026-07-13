import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import { isNextDeadlineOverdue } from "../../deadlineUtils";

type ProjectPoolTableProps = {
  rows: OpsProjectPoolRow[];
  columns: ColumnsType<OpsProjectPoolRow>;
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  scrollY: number;
  onPageChange: (page: number, pageSize: number) => void;
  onOpenLogs: (row: OpsProjectPoolRow) => void;
};

export default function ProjectPoolTable({ rows, columns, loading, page, pageSize, total, scrollY, onPageChange, onOpenLogs }: ProjectPoolTableProps) {
  return (
    <>
      <style>{`
        .ops-pool-table .ant-table-tbody > tr > td { padding-top: 14px; padding-bottom: 14px; }
        .ops-pool-table .ant-table-thead > tr > th { padding-top: 11px; padding-bottom: 11px; background: #f8fafc; font-weight: 600; }
        .ops-pool-table .ant-table-tbody > tr:not(.ops-pool-stale):hover > td { background: transparent !important; }
        .ops-pool-table .ops-pool-stale > td { background: #fff1f0 !important; }
        .ops-pool-table .ops-pool-stale:hover > td { background: #fff1f0 !important; }
        .ops-pool-table .ant-table-tbody > tr:hover > td:first-child { box-shadow: inset 3px 0 0 #0f766e; }
      `}</style>
      <Table
        className="ops-pool-table"
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={columns}
        size="small"
        scroll={{ x: 1350, y: scrollY }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 个项目`,
          onChange: onPageChange,
        }}
        onRow={(row) => ({
          onClick: () => {
            if (window.getSelection()?.toString()) return;
            onOpenLogs(row);
          },
          className: isNextDeadlineOverdue(row) ? "ops-pool-stale" : undefined,
          style: { cursor: "pointer" },
        })}
      />
    </>
  );
}
