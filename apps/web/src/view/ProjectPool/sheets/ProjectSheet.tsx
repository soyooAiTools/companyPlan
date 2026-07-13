import type { ColumnsType } from "antd/es/table";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import ProjectPoolTable from "../components/table/ProjectPoolTable";

type ProjectSheetProps = {
  rows: OpsProjectPoolRow[];
  columns: ColumnsType<OpsProjectPoolRow>;
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  scrollY: number;
  onPageChange: (page: number, pageSize: number) => void;
  onOpenLogs?: (row: OpsProjectPoolRow) => void;
};

export default function ProjectSheet({ rows, columns, loading, page, pageSize, total, scrollY, onPageChange, onOpenLogs }: ProjectSheetProps) {
  return <ProjectPoolTable rows={rows} columns={columns} loading={loading} page={page} pageSize={pageSize} total={total} scrollY={scrollY} onPageChange={onPageChange} onOpenLogs={onOpenLogs} />;
}
