import { Input, Select } from "antd";
import type { OpsSegment } from "@/api/modules/ops";
import { PROJECT_STATUSES, PROJECT_STAGES } from "@/view/Ops/constants";

type ProjectPoolToolbarProps = {
	search: string;
	statusFilter: string[];
	stageFilter: string[];
	segmentFilter: number[];
	segmentOptions: OpsSegment[];
	onSearchChange: (value: string) => void;
	onStatusFilterChange: (value: string[]) => void;
	onStageFilterChange: (value: string[]) => void;
	onSegmentFilterChange: (value: number[]) => void;
};

export default function ProjectPoolToolbar({
  search,
  statusFilter,
  stageFilter,
  segmentFilter,
  segmentOptions,
  onSearchChange,
  onStatusFilterChange,
  onStageFilterChange,
  onSegmentFilterChange,
}: ProjectPoolToolbarProps) {
	return (
		<div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "8px 12px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
			<Input.Search placeholder="搜索 项目/客户/策划" allowClear style={{ width: 260 }} value={search} onChange={(e) => onSearchChange(e.target.value)} />
			<Select
				allowClear
				mode="multiple"
				placeholder="项目状态(可多选)"
				style={{ minWidth: 190, maxWidth: 360 }}
				value={statusFilter}
				onChange={onStatusFilterChange}
				maxTagCount="responsive"
				options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))}
			/>
			<Select
				allowClear
				mode="multiple"
				placeholder="制作阶段(可多选)"
				style={{ minWidth: 190, maxWidth: 360 }}
				value={stageFilter}
				onChange={onStageFilterChange}
				maxTagCount="responsive"
				options={PROJECT_STAGES.map((s) => ({ value: s, label: s }))}
			/>
			<Select
				allowClear
				mode="multiple"
				placeholder="环节(可多选)"
				style={{ minWidth: 170, maxWidth: 340 }}
				value={segmentFilter}
				onChange={onSegmentFilterChange}
				maxTagCount="responsive"
				options={segmentOptions.map((s) => ({ value: s.id, label: s.name }))}
			/>
		</div>
	);
}
