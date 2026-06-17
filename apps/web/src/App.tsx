import { BrowserRouter, Route, Routes } from "react-router-dom";
import CompanyPlanView from "./view/CompanyPlan";
import OpsApp from "./view/Ops/OpsApp";
import VersionChecker from "./components/VersionChecker";

export default function App() {
  return (
    <BrowserRouter>
      {/* 全局版本检测:部署新版本后提示用户刷新 */}
      <VersionChecker />
      <Routes>
        {/* 新需求提单(antd),与原应用共存;先在 / 登录后访问 /ops */}
        <Route path="/ops/*" element={<OpsApp />} />
        {/* 原应用(运营总览/项目池/人员进度/管理员/原提单),保持不动 */}
        <Route path="/*" element={<CompanyPlanView />} />
      </Routes>
    </BrowserRouter>
  );
}
