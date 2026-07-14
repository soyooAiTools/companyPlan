import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

type VirtualGroupStickyBarProps<TGroup, TRow> = {
	rows: TRow[];
	groupRowHeight?: number;
	itemRowHeight?: number;
	top?: number;
	isGroupRow: (row: TRow) => boolean;
	getGroup: (row: TRow) => TGroup | null;
	getRowKey: (row: TRow) => string;
	getActiveGroup: (row: TRow) => TGroup | null;
	getGroupKey: (group: TGroup) => string;
	renderGroup: (group: TGroup) => ReactNode;
	onToggleGroup: (groupKey: string) => void;
	children: ReactNode;
};

export default function VirtualGroupStickyBar<TGroup, TRow>({
	rows,
	groupRowHeight = 40,
	itemRowHeight = 66,
	top = 39,
	isGroupRow,
	getGroup,
	getRowKey,
	getActiveGroup,
	getGroupKey,
	renderGroup,
	onToggleGroup,
	children,
}: VirtualGroupStickyBarProps<TGroup, TRow>) {
	const [stickyGroupKey, setStickyGroupKey] = useState<string | null>(null);
	const tableWrapRef = useRef<HTMLDivElement | null>(null);

	const rowByKey = useMemo(() => new Map(rows.map((row) => [getRowKey(row), row])), [getRowKey, rows]);

	const groupOffsets = useMemo(() => {
		let offset = 0;
		const nextOffsets: Array<{ key: string; offset: number; group: TGroup }> = [];
		for (const row of rows) {
			if (isGroupRow(row)) {
				const group = getGroup(row);
				if (group) nextOffsets.push({ key: getGroupKey(group), offset, group });
			}
			offset += isGroupRow(row) ? groupRowHeight : itemRowHeight;
		}
		return nextOffsets;
	}, [getGroup, getGroupKey, groupRowHeight, isGroupRow, itemRowHeight, rows]);

	const stickyGroup = useMemo(() => groupOffsets.find((item) => item.key === stickyGroupKey)?.group || null, [groupOffsets, stickyGroupKey]);

	useEffect(() => {
		const holder = tableWrapRef.current?.querySelector<HTMLElement>(".ant-table-tbody-virtual-holder, .ant-table-body");
		if (!holder) return undefined;

		const updateStickyGroup = () => {
			const holderTop = holder.getBoundingClientRect().top;
			const visibleRows = [...holder.querySelectorAll<HTMLElement>("[data-row-key]")];
			const firstVisibleRow = visibleRows
				.map((node) => ({ node, rect: node.getBoundingClientRect() }))
				.filter((item) => item.rect.bottom >= holderTop + 2)
				.sort((a, b) => a.rect.top - b.rect.top)[0]?.node;
			const firstVisibleKey = firstVisibleRow?.dataset.rowKey;
			const firstVisibleData = firstVisibleKey ? rowByKey.get(firstVisibleKey) : undefined;
			const firstVisibleGroup = firstVisibleData ? getActiveGroup(firstVisibleData) : null;
			if (firstVisibleGroup) {
				setStickyGroupKey(holder.scrollTop > 4 ? getGroupKey(firstVisibleGroup) : null);
				return;
			}

			const scrollTop = holder.scrollTop;
			let activeGroupKey: string | null = null;
			for (const item of groupOffsets) {
				if (item.offset <= scrollTop + 2) activeGroupKey = item.key;
				else break;
			}
			setStickyGroupKey(scrollTop > 4 ? activeGroupKey : null);
		};

		updateStickyGroup();
		holder.addEventListener("scroll", updateStickyGroup, { passive: true });
		return () => holder.removeEventListener("scroll", updateStickyGroup);
	}, [getActiveGroup, getGroupKey, groupOffsets, rowByKey]);

	return (
		<div className="ops-pool-group-table-wrap" ref={tableWrapRef}>
			<style>{`
				.ops-pool-group-table-wrap {
					position: relative;
					height: 100%;
				}
				.ops-pool-virtual-sticky-group {
					position: absolute;
					left: 0;
					right: 0;
					height: 40px;
					display: flex;
					align-items: center;
					padding: 8px 16px;
					background: #fff;
					border-bottom: 1px solid #e5e7eb;
					box-shadow: 0 6px 12px -10px rgba(15, 23, 42, 0.45);
					cursor: pointer;
					z-index: 12;
				}
				.ops-pool-virtual-sticky-group:hover {
					background: #f8fafc;
				}
			`}</style>
			{stickyGroup ? (
				<div className="ops-pool-virtual-sticky-group" style={{ top }} onClick={() => onToggleGroup(getGroupKey(stickyGroup))}>
					{renderGroup(stickyGroup)}
				</div>
			) : null}
			{children}
		</div>
	);
}
