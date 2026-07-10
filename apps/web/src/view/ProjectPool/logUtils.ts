import type { OpsProjectStatusLog } from "@/api/modules/ops";

export type ProjectLogKind = "all" | "status" | "stage" | "remark" | "deadline";

export const projectLogKindLabel = (kind: OpsProjectStatusLog["kind"]) => {
  if (kind === "stage") return "阶段";
  if (kind === "remark") return "备注";
  if (kind === "deadline") return "交付";
  return "状态";
};

export const projectLogKindColor = (kind: OpsProjectStatusLog["kind"], toStatus?: string) => {
  if (kind === "stage") return "purple";
  if (kind === "remark") return "gold";
  if (kind === "deadline") return "cyan";
  return toStatus === "已完成" ? "green" : "blue";
};

export const emptyLogKindText = (kind: ProjectLogKind) => {
  if (kind === "all") return "";
  if (kind === "status") return "状态";
  if (kind === "stage") return "阶段";
  if (kind === "deadline") return "交付";
  return "备注";
};
