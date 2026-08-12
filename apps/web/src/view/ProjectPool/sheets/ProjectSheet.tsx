import type { ColumnsType } from "antd/es/table";
import type { OpsProjectPoolRow, OpsProjectPoolSortBy, OpsProjectPoolSortOrder } from "@/api/modules/ops";
import ProjectPoolTable from "../components/table/ProjectPoolTable";

type ProjectSheetProps = {
  rows: OpsProjectPoolRow[];
  columns: ColumnsType<OpsProjectPoolRow>;
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  scrollY: number;
  pagination?: false;
  onPageChange: (page: number, pageSize: number) => void;
  onSortChange?: (sortBy?: OpsProjectPoolSortBy, sortOrder?: OpsProjectPoolSortOrder) => void;
  onOpenLogs?: (row: OpsProjectPoolRow) => void;
  onToggleUrgent?: (row: OpsProjectPoolRow) => void;
};

export default function ProjectSheet({ rows, columns, loading, page, pageSize, total, scrollY, pagination, onPageChange, onSortChange, onOpenLogs, onToggleUrgent }: ProjectSheetProps) {
  return <ProjectPoolTable rows={rows} columns={columns} loading={loading} page={page} pageSize={pageSize} total={total} scrollY={scrollY} pagination={pagination} onPageChange={onPageChange} onSortChange={onSortChange} onOpenLogs={onOpenLogs} onToggleUrgent={onToggleUrgent} />;
}
