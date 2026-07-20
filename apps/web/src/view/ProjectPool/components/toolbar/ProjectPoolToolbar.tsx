import { Badge, Button, Popover } from "antd";
import { FilterOutlined } from "@ant-design/icons";
import type { OpsSegment } from "@/api/modules/ops";
import { PROJECT_STATUSES, PROJECT_STAGES } from "@/view/Ops/constants";
import AdvancedFilterBuilder, { compactAdvancedFilter, type AdvancedFilterValue } from "@/components/common/AdvancedFilterBuilder";

type ProjectPoolToolbarProps = {
	plannerOptions: { name: string; avatar?: string }[];
	segmentOptions: OpsSegment[];
	advancedFilter: AdvancedFilterValue;
	onAdvancedFilterChange: (value: AdvancedFilterValue) => void;
};

export default function ProjectPoolToolbar({
  plannerOptions,
  segmentOptions,
  advancedFilter,
  onAdvancedFilterChange,
}: ProjectPoolToolbarProps) {
	const activeAdvancedCount = compactAdvancedFilter(advancedFilter).rules.length;
	const advancedFields = [
		{ key: "name", label: "项目名称" },
		{ key: "tenantName", label: "客户" },
		{ key: "plannerName", label: "策划", options: plannerOptions.map((planner) => ({ label: planner.name, value: planner.name })) },
		{ key: "status", label: "项目状态", options: PROJECT_STATUSES.map((status) => ({ label: status, value: status })) },
		{ key: "stage", label: "当前阶段", options: PROJECT_STAGES.map((stage) => ({ label: stage, value: stage })) },
		{ key: "segment", label: "环节", options: segmentOptions.map((segment) => ({ label: segment.name, value: String(segment.id) })) },
		{ key: "remark", label: "备注" },
	];
	return (
		<div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "8px 12px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
			<Popover
				trigger="click"
				placement="bottomLeft"
				content={<AdvancedFilterBuilder value={advancedFilter} fields={advancedFields} onChange={onAdvancedFilterChange} />}
				styles={{ content: { padding: 0 } }}
			>
				<Badge count={activeAdvancedCount} size="small">
					<Button icon={<FilterOutlined />} type={activeAdvancedCount ? "primary" : "default"}>
						筛选条件
					</Button>
				</Badge>
			</Popover>
		</div>
	);
}
