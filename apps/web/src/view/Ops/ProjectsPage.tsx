import LegacyApp from "../CompanyPlan";

// 项目池(复用旧实现,embedded 模式嵌入新外壳内容区)
export default function ProjectsPage() {
  return <LegacyApp embedded forcedView="projects" />;
}
