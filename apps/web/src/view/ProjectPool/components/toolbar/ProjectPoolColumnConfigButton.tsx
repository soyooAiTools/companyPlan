import { useMemo, useState } from "react";
import { Button, Checkbox, Input, Popover, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { HolderOutlined, LockOutlined, SearchOutlined, SettingOutlined } from "@ant-design/icons";
import { DndContext, DragOverlay, closestCenter, type DragEndEvent, type DragOverEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { OpsProjectPoolRow } from "@/api/modules/ops";

type ProjectPoolColumnConfigButtonProps = {
	columns: ColumnsType<OpsProjectPoolRow>;
	hiddenColumnKeys: string[];
	columnOrderKeys: string[];
	lockedColumnKeys: Set<string>;
	onHiddenChange: (keys: string[]) => void;
	onOrderChange: (keys: string[]) => void;
	onReset: () => void;
};

const COLUMN_LABELS: Record<string, string> = {
	name: "项目名称",
	customerContact: "客户对接人",
	planner: "策划",
	stage: "当前阶段",
	stageDeadlines: "下版交付时间",
	startedAt: "项目启动时间",
	duration: "项目结束时间",
	status: "当前状态",
	remark: "备注",
	segments: "目前环节",
	memberCount: "人员列表",
};

type ColumnOption = { key: string; label: string; locked: boolean };

function columnKey(column: ColumnsType<OpsProjectPoolRow>[number]) {
	return String(column.key || ("dataIndex" in column ? column.dataIndex : "") || "");
}

function sameOrder(left: string[], right: string[]) {
	return left.length === right.length && left.every((key, index) => key === right[index]);
}

type FieldOptionRowProps = {
	option: ColumnOption;
	hidden: boolean;
	isOver: boolean;
	dropPosition: "before" | "after" | null;
	onToggle: (key: string) => void;
};

function FieldOptionRow({ option, hidden, isOver, dropPosition, onToggle }: FieldOptionRowProps) {
	const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.key, disabled: option.locked });

	return (
		<div
			ref={setNodeRef}
			{...(option.locked ? {} : attributes)}
			role={option.locked ? undefined : "button"}
			tabIndex={option.locked ? undefined : 0}
			onClick={() => onToggle(option.key)}
			onKeyDown={(event) => {
				if (option.locked) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onToggle(option.key);
				}
			}}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				height: 34,
				padding: "0 8px",
				borderRadius: 6,
				color: hidden ? "#94a3b8" : "#0f172a",
				background: isDragging ? "#fff" : undefined,
				opacity: isDragging ? 0.32 : 1,
				transform: CSS.Translate.toString(transform),
				transition,
				cursor: option.locked ? "default" : "pointer",
				touchAction: "none",
				position: "relative",
			}}>
			{dropPosition ? (
				<>
					<span
						style={{
							position: "absolute",
							left: -4,
							[dropPosition === "before" ? "top" : "bottom"]: -4,
							width: 0,
							height: 0,
							borderTop: "5px solid transparent",
							borderBottom: "5px solid transparent",
							borderLeft: "8px solid #2563eb",
							pointerEvents: "none",
							zIndex: 2,
						}}
					/>
					<span
						style={{
							position: "absolute",
							left: 0,
							right: 0,
							[dropPosition === "before" ? "top" : "bottom"]: 0,
							height: 2,
							background: "#2563eb",
							pointerEvents: "none",
							zIndex: 2,
						}}
					/>
				</>
			) : null}
			<span
				ref={option.locked ? undefined : setActivatorNodeRef}
				{...(option.locked ? {} : listeners)}
				onClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
				style={{
					width: 12,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					color: option.locked ? "transparent" : "#94a3b8",
					cursor: option.locked ? "default" : isDragging ? "grabbing" : "grab",
					touchAction: "none",
				}}
				title={option.locked ? undefined : "拖动排序"}>
				<HolderOutlined />
			</span>
			<span onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
				<Checkbox checked={!hidden} disabled={option.locked} onChange={() => onToggle(option.key)} />
			</span>
			<span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{option.label}</span>
			{option.locked ? (
				<Tooltip title="项目名称列固定显示">
					<LockOutlined style={{ color: "#94a3b8" }} />
				</Tooltip>
			) : null}
		</div>
	);
}

function DragPreview({ label }: { label: string }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				height: 34,
				width: 360,
				padding: "0 16px",
				borderRadius: 6,
				background: "#fff",
				boxShadow: "0 12px 30px rgba(15, 23, 42, 0.22)",
				color: "#0f172a",
				border: "1px solid #dbeafe",
			}}>
			<HolderOutlined style={{ color: "#64748b" }} />
			<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
		</div>
	);
}

export default function ProjectPoolColumnConfigButton({ columns, hiddenColumnKeys, columnOrderKeys, lockedColumnKeys, onHiddenChange, onOrderChange, onReset }: ProjectPoolColumnConfigButtonProps) {
	const [open, setOpen] = useState(false);
	const [keyword, setKeyword] = useState("");
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const [overKey, setOverKey] = useState<string | null>(null);
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
	const orderIndex = useMemo(() => new Map(columnOrderKeys.map((key, index) => [key, index])), [columnOrderKeys]);
	const defaultMovableKeys = useMemo(
		() =>
			columns
				.map(columnKey)
				.filter((key) => key && !lockedColumnKeys.has(key)),
		[columns, lockedColumnKeys],
	);
	const options = useMemo(
		() =>
			columns
				.map((column) => {
					const key = columnKey(column);
					if (!key) return null;
					return { key, label: COLUMN_LABELS[key] || key, locked: lockedColumnKeys.has(key) };
				})
				.filter(Boolean)
				.sort((a, b) => {
					const left = a as { key: string; locked: boolean };
					const right = b as { key: string; locked: boolean };
					if (left.locked !== right.locked) return left.locked ? -1 : 1;
					const leftIndex = orderIndex.get(left.key);
					const rightIndex = orderIndex.get(right.key);
					if (leftIndex != null && rightIndex != null) return leftIndex - rightIndex;
					if (leftIndex != null) return -1;
					if (rightIndex != null) return 1;
					return 0;
				}) as ColumnOption[],
		[columns, lockedColumnKeys, orderIndex],
	);
	const optionKeySet = useMemo(() => new Set(options.map((option) => option.key)), [options]);
	const effectiveHiddenColumnKeys = useMemo(() => hiddenColumnKeys.filter((key) => optionKeySet.has(key)), [hiddenColumnKeys, optionKeySet]);
	const effectiveColumnOrderKeys = useMemo(() => columnOrderKeys.filter((key) => optionKeySet.has(key)), [columnOrderKeys, optionKeySet]);
	const hasColumnConfigChanged = effectiveHiddenColumnKeys.length > 0 || effectiveColumnOrderKeys.length > 0;
	const hiddenSet = useMemo(() => new Set(effectiveHiddenColumnKeys), [effectiveHiddenColumnKeys]);
	const visibleOptions = options.filter((option) => !keyword.trim() || option.label.toLowerCase().includes(keyword.trim().toLowerCase()));

	const toggleColumn = (key: string) => {
		if (lockedColumnKeys.has(key)) return;
		if (hiddenSet.has(key)) {
			onHiddenChange(effectiveHiddenColumnKeys.filter((item) => item !== key));
		} else {
			onHiddenChange([...effectiveHiddenColumnKeys, key]);
		}
	};

	const movableKeys = options.filter((option) => !option.locked).map((option) => option.key);
	const activeOption = activeKey ? options.find((option) => option.key === activeKey) : null;
	const dropPositionOf = (key: string): "before" | "after" | null => {
		if (!activeKey || !overKey || overKey !== key || activeKey === overKey) return null;
		const activeIndex = movableKeys.indexOf(activeKey);
		const overIndex = movableKeys.indexOf(overKey);
		if (activeIndex < 0 || overIndex < 0) return null;
		return activeIndex < overIndex ? "after" : "before";
	};
	const handleDragOver = ({ over }: DragOverEvent) => {
		setOverKey(over ? String(over.id) : null);
	};
	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		setActiveKey(null);
		setOverKey(null);
		if (!over || active.id === over.id) return;
		const from = movableKeys.indexOf(String(active.id));
		const to = movableKeys.indexOf(String(over.id));
		if (from < 0 || to < 0) return;
		const nextKeys = arrayMove(movableKeys, from, to);
		onOrderChange(sameOrder(nextKeys, defaultMovableKeys) ? [] : nextKeys);
	};

	const content = (
		<div style={{ width: 360 }}>
			<Input
				allowClear
				size="small"
				prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
				placeholder="搜索字段"
				value={keyword}
				onChange={(event) => setKeyword(event.target.value)}
				style={{ marginBottom: 8 }}
			/>
			<div style={{ maxHeight: 320, overflowY: "auto", margin: "0 -4px" }}>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragStart={({ active }) => {
						setActiveKey(String(active.id));
						setOverKey(null);
					}}
					onDragOver={handleDragOver}
					onDragCancel={() => {
						setActiveKey(null);
						setOverKey(null);
					}}
					onDragEnd={handleDragEnd}>
					<SortableContext items={visibleOptions.filter((option) => !option.locked).map((option) => option.key)} strategy={verticalListSortingStrategy}>
						{visibleOptions.map((option) => (
							<FieldOptionRow key={option.key} option={option} hidden={hiddenSet.has(option.key)} isOver={overKey === option.key && activeKey !== option.key} dropPosition={dropPositionOf(option.key)} onToggle={toggleColumn} />
						))}
					</SortableContext>
					<DragOverlay dropAnimation={null} style={{ zIndex: 9999 }}>{activeOption ? <DragPreview label={activeOption.label} /> : null}</DragOverlay>
				</DndContext>
			</div>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
				<span style={{ color: "#64748b", fontSize: 12 }}>已隐藏 {effectiveHiddenColumnKeys.length} 列</span>
				<Button size="small" type="link" disabled={!hasColumnConfigChanged} onClick={onReset}>
					恢复默认
				</Button>
			</div>
		</div>
	);

	return (
		<Popover trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen} content={content}>
			<Tooltip title={hasColumnConfigChanged ? `字段配置（已隐藏 ${effectiveHiddenColumnKeys.length} 列${effectiveColumnOrderKeys.length ? "，顺序已调整" : ""}）` : "字段配置"}>
				<Button
					size="small"
					type={hasColumnConfigChanged ? "primary" : "default"}
					icon={<SettingOutlined />}
					aria-label="字段配置"
				/>
			</Tooltip>
		</Popover>
	);
}
