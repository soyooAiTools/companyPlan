import { BrowserRouter } from "react-router-dom";
import { Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import OpsApp from "./view/Ops/OpsApp";
import VersionChecker from "./components/VersionChecker";

const FilePreviewPage = lazy(() => import("./view/FilePreview/FilePreviewPage"));

// 需求提单系统单一应用:直接挂根(/tickets、/settings 等),旧版页面已下线。
export default function App() {
  return (
    <BrowserRouter>
      {/* 全局版本检测:部署新版本后提示用户刷新 */}
      <VersionChecker />
      <Routes>
        <Route
          path="/file-preview"
          element={
            <Suspense fallback={null}>
              <FilePreviewPage />
            </Suspense>
          }
        />
        <Route path="/*" element={<OpsApp />} />
      </Routes>
    </BrowserRouter>
  );
}
