// 设置页:Tabs —— 标签绑定(环节↔标签 + 交付配置)。仅管理员可进。
import { Tabs } from "antd";
import OpsTagSettingsPage from "./OpsTagSettingsPage";

export default function OpsSettingsPage() {
  return <Tabs defaultActiveKey="tags" items={[{ key: "tags", label: "标签绑定", children: <OpsTagSettingsPage /> }]} />;
}
