import LegacyApp from "../CompanyPlan";

// 人员进度(复用旧实现,embedded 模式嵌入新外壳内容区)
export default function PeoplePage() {
  return <LegacyApp embedded forcedView="people" />;
}
