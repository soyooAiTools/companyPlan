import { useState } from "react";
import type { HTMLAttributes, MouseEvent } from "react";
import type { ColumnsType } from "antd/es/table";

export type ResizableHeaderCellProps = HTMLAttributes<HTMLTableCellElement> & {
	width?: number;
	columnKey?: string;
	onColumnResize?: (key: string, width: number) => void;
};

export function columnWidthValue(width: unknown, fallback: number) {
	const parsed = typeof width === "number" ? width : Number.parseInt(String(width || ""), 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function tableColumnKey<RecordType>(column: ColumnsType<RecordType>[number]) {
	return String(column.key || ("dataIndex" in column ? column.dataIndex : "") || "");
}

export function ResizableHeaderCell({ width, columnKey, onColumnResize, children, ...rest }: ResizableHeaderCellProps) {
	const [guideX, setGuideX] = useState<number | null>(null);
	const canResize = !!columnKey && !!onColumnResize;
	const startResize = (event: MouseEvent<HTMLSpanElement>) => {
		if (!canResize || !columnKey) return;
		event.preventDefault();
		event.stopPropagation();
		const startX = event.clientX;
		const startWidth = width || (event.currentTarget.parentElement?.getBoundingClientRect().width ?? 120);
		let latestX = startX;
		const onMove = (moveEvent: globalThis.MouseEvent) => {
			latestX = moveEvent.clientX;
			setGuideX(moveEvent.clientX);
		};
		const onUp = () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			onColumnResize(columnKey, Math.max(30, startWidth + latestX - startX));
			setGuideX(null);
		};
		setGuideX(event.clientX);
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
	};

	return (
		<th {...rest} style={{ ...rest.style, position: "relative" }}>
			{children}
			{canResize ? <span className="ops-pool-column-resize-handle" onMouseDown={startResize} /> : null}
			{guideX == null ? null : (
				<span
					style={{
						position: "fixed",
						left: guideX,
						top: 0,
						bottom: 0,
						width: 0,
						borderLeft: "2px dashed #2563eb",
						pointerEvents: "none",
						zIndex: 9999,
					}}
				/>
			)}
		</th>
	);
}
