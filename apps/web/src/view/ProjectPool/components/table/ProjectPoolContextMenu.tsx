import { useEffect } from "react";
import type { OpsProjectPoolRow } from "@/api/modules/ops";

export type ProjectPoolContextRow = {
  row: OpsProjectPoolRow;
  x: number;
  y: number;
};

type ProjectPoolContextMenuProps = {
  contextRow: ProjectPoolContextRow | null;
  onClose: () => void;
  onToggleUrgent?: (row: OpsProjectPoolRow) => void;
};

export default function ProjectPoolContextMenu({ contextRow, onClose, onToggleUrgent }: ProjectPoolContextMenuProps) {
  useEffect(() => {
    if (!contextRow) return;
    window.addEventListener("click", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("click", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [contextRow, onClose]);

  if (!contextRow) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: contextRow.x,
        top: contextRow.y,
        zIndex: 2000,
        minWidth: 128,
        padding: 4,
        borderRadius: 6,
        background: "#fff",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.16)",
        border: "1px solid #e2e8f0",
      }}
      onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        style={{
          display: "block",
          width: "100%",
          border: 0,
          background: "transparent",
          padding: "7px 10px",
          borderRadius: 4,
          textAlign: "left",
          color: contextRow.row.isUrgent ? "#475569" : "#dc2626",
          fontSize: 13,
          cursor: "pointer",
        }}
        onClick={() => {
          const row = contextRow.row;
          onClose();
          onToggleUrgent?.(row);
        }}>
        {contextRow.row.isUrgent ? "取消加急" : "设为加急"}
      </button>
    </div>
  );
}
