// 设置页:Tabs —— 标签绑定(环节↔标签 + 交付配置) / 项目状态时间(超时阈值)。仅管理员可进。
import { Tabs } from "antd";
import OpsTagSettingsPage from "./OpsTagSettingsPage";
import OpsProjectStatusSettingsPage from "./OpsProjectStatusSettingsPage";
import OpsProjectStageSettingsPage from "./OpsProjectStageSettingsPage";

export default function OpsSettingsPage() {
  return (
    <Tabs
      defaultActiveKey="tags"
      items={[
        { key: "tags", label: "标签绑定", children: <OpsTagSettingsPage /> },
        { key: "project-status", label: "项目状态时间", children: <OpsProjectStatusSettingsPage /> },
        { key: "project-stage", label: "项目阶段时间", children: <OpsProjectStageSettingsPage /> },
      ]}
    />
  );
}
