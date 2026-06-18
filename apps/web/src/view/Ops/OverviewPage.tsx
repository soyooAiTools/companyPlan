import LegacyApp from "../CompanyPlan";

// 运营总览(复用旧实现,embedded 模式嵌入新外壳内容区)
export default function OverviewPage() {
  return <LegacyApp embedded forcedView="overview" />;
}
