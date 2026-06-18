import { BrowserRouter } from "react-router-dom";
import OpsApp from "./view/Ops/OpsApp";
import VersionChecker from "./components/VersionChecker";

// 需求提单系统单一应用:直接挂根(/tickets、/settings 等),旧版页面已下线。
export default function App() {
  return (
    <BrowserRouter>
      {/* 全局版本检测:部署新版本后提示用户刷新 */}
      <VersionChecker />
      <OpsApp />
    </BrowserRouter>
  );
}
