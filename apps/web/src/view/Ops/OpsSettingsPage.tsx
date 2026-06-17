// 设置页:Tabs —— 标签绑定(环节↔标签 + 交付配置) / 同步管理(频率/手动同步/记录)。仅管理员可进。
import { Tabs } from "antd";
import OpsTagSettingsPage from "./OpsTagSettingsPage";
import OpsSyncPage from "./OpsSyncPage";

export default function OpsSettingsPage() {
  return (
    <Tabs
      defaultActiveKey="tags"
      items={[
        { key: "tags", label: "标签绑定", children: <OpsTagSettingsPage /> },
        { key: "sync", label: "同步管理", children: <OpsSyncPage /> },
      ]}
    />
  );
}
