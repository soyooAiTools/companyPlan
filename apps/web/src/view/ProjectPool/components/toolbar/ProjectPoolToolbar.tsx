import { Input, Select } from "antd";
import SegmentedTabs from "@/components/SegmentedTabs";
import type { OpsSegment } from "@/api/modules/ops";
import { PROJECT_STATUSES, PROJECT_STAGES, OPS_TOOLBAR_CARD } from "@/view/Ops/constants";

type ProjectPoolToolbarProps = {
  tab: "all" | "stale";
  search: string;
  statusFilter: string[];
  stageFilter: string[];
  segmentFilter: number[];
  segmentOptions: OpsSegment[];
  onTabChange: (value: "all" | "stale") => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string[]) => void;
  onStageFilterChange: (value: string[]) => void;
  onSegmentFilterChange: (value: number[]) => void;
};

export default function ProjectPoolToolbar({
  tab,
  search,
  statusFilter,
  stageFilter,
  segmentFilter,
  segmentOptions,
  onTabChange,
  onSearchChange,
  onStatusFilterChange,
  onStageFilterChange,
  onSegmentFilterChange,
}: ProjectPoolToolbarProps) {
  return (
    <div style={{ ...OPS_TOOLBAR_CARD, flexShrink: 0 }}>
      <SegmentedTabs
        value={tab}
        onChange={onTabChange}
        options={[
          { label: "全部项目", value: "all" },
          { label: "超时关注", value: "stale" },
        ]}
      />
      {tab === "all" ? (
        <>
          <Input.Search placeholder="搜索 项目/客户/策划" allowClear style={{ width: 240 }} value={search} onChange={(e) => onSearchChange(e.target.value)} />
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
        </>
      ) : null}
    </div>
  );
}
