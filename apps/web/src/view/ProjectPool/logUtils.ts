import type { OpsProjectStatusLog } from "@/api/modules/ops";

export type ProjectLogKind = "all" | "status" | "stage" | "remark" | "deadline" | "recycle";

export const projectLogKindLabel = (kind: OpsProjectStatusLog["kind"]) => {
  if (kind === "stage") return "阶段";
  if (kind === "remark") return "备注";
  if (kind === "deadline") return "交付";
  if (kind === "recycle") return "回收";
  return "状态";
};

export const projectLogKindColor = (kind: OpsProjectStatusLog["kind"], toStatus?: string) => {
  if (kind === "stage") return "purple";
  if (kind === "remark") return "gold";
  if (kind === "deadline") return "cyan";
  if (kind === "recycle") return "#991b1b";
  return toStatus === "已完成" ? "green" : "blue";
};

export const emptyLogKindText = (kind: ProjectLogKind) => {
  if (kind === "all") return "";
  if (kind === "status") return "状态";
  if (kind === "stage") return "阶段";
  if (kind === "deadline") return "交付";
  if (kind === "recycle") return "回收";
  return "备注";
};
