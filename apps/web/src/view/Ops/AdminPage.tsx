import LegacyApp from "../CompanyPlan";

// 管理员(复用旧实现,embedded 模式嵌入新外壳内容区)
export default function AdminPage() {
  return <LegacyApp embedded forcedView="admin" />;
}
