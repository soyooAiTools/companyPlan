// 应用外壳:登录态守卫 + 左侧固定菜单 + 路由分发。各页面均独立成组件(同目录 LoginView / *Page)。
// 未登录显示登录页;非管理员只看到「需求提单」。直接挂根:/tickets、/overview、/settings 等。
import { useEffect, useState } from "react";
import { App as AntApp, Avatar, Button, ConfigProvider, Layout, Menu, Spin } from "antd";
import zhCN from "antd/locale/zh_CN";
import { DashboardOutlined, ProjectOutlined, TeamOutlined, FileTextOutlined, SettingOutlined, LogoutOutlined } from "@ant-design/icons";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { logoutApi } from "../../api/modules/companyPlan";
import { opsApi, type OpsMe } from "../../api/modules/ops";
import LoginView from "./LoginView";
import OpsTicketsPage from "./OpsTicketsPage";
import OpsSettingsPage from "./OpsSettingsPage";
import OverviewPage from "./OverviewPage";
import ProjectPoolPage from "./ProjectPoolPage";
import PeoplePage from "./PeoplePage";

const { Sider, Content } = Layout;

export default function OpsApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const selected = location.pathname.split("/")[1] || "tickets";
  const [me, setMe] = useState<OpsMe | null>(null);
  const [auth, setAuth] = useState<"loading" | "login" | "ready">("loading");
  const isAdmin = !!me?.isAdmin;
  const canPool = isAdmin || !!me?.isPlanner; // 管理员或策划(制片)可见「项目池」

  // 用 /api/ops/me 判断登录态:成功=已登录,401=未登录显示登录页
  const loadMe = () =>
    opsApi
      .me()
      .then((r) => {
        setMe(r.user ?? null);
        setAuth("ready");
      })
      .catch(() => {
        setMe(null);
        setAuth("login");
      });

  useEffect(() => {
    loadMe();
  }, []);

  const onMenuClick = (key: string) => navigate("/" + key);

  const logout = async () => {
    try {
      await logoutApi();
    } catch {
      /* 忽略:无论成功与否都回登录页 */
    }
    setMe(null);
    setAuth("login");
    navigate("/tickets");
  };

  const allItems = [
    { key: "overview", icon: <DashboardOutlined />, label: "运营总览", show: isAdmin },
    { key: "projects", icon: <ProjectOutlined />, label: "项目池", show: canPool },
    { key: "people", icon: <TeamOutlined />, label: "人员进度", show: isAdmin },
    { key: "tickets", icon: <FileTextOutlined />, label: "需求提单", show: true },
    { key: "settings", icon: <SettingOutlined />, label: "设置", show: isAdmin },
  ];
  // 提单所有人可见;项目池=管理员或策划;其余仅管理员
  const items = allItems.filter((i) => i.show).map(({ show: _show, ...i }) => i);

  return (
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#0f766e" } }}>
      <AntApp style={{ minHeight: "100vh" }}>
        {auth === "loading" ? (
          <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spin size="large" />
          </div>
        ) : auth === "login" ? (
          <LoginView onSuccess={loadMe} />
        ) : (
          <Layout style={{ minHeight: "100vh" }}>
            <Sider theme="light" width={200} style={{ position: "fixed", left: 0, top: 0, bottom: 0, height: "100vh", borderRight: "1px solid #f0f0f0", zIndex: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ padding: "10px 20px", flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 18, color: "#0f766e", lineHeight: 1.2 }}>PlayableOps</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>试玩广告生产中台</div>
                </div>
                <Menu mode="inline" selectedKeys={[selected]} style={{ flex: 1, borderInlineEnd: "none", overflowY: "auto" }} onClick={(e) => onMenuClick(e.key)} items={items} />
                <div style={{ padding: 12, borderTop: "1px solid #f0f0f0", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Avatar size={32} src={me?.avatar || undefined} style={{ flexShrink: 0, background: "#e2e8f0", color: "#475569" }}>
                      {(me?.name || "?").slice(0, 1)}
                    </Avatar>
                    <div style={{ overflow: "hidden", lineHeight: 1.3 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me?.name || "-"}</div>
                      {me?.wechatName ? (
                        <div style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me.wechatName}</div>
                      ) : null}
                    </div>
                  </div>
                  <Button block icon={<LogoutOutlined />} onClick={logout}>
                    退出登录
                  </Button>
                </div>
              </div>
            </Sider>
            <Layout style={{ marginLeft: 200 }}>
              <Content style={{ padding: 16, background: "#f0f2f5" }}>
                <Routes>
                  <Route path="tickets" element={<OpsTicketsPage />} />
                  <Route path="overview" element={<OverviewPage />} />
                  <Route path="projects" element={canPool ? <ProjectPoolPage /> : <Navigate to="/tickets" replace />} />
                  <Route path="people" element={<PeoplePage />} />
                  <Route path="settings" element={isAdmin ? <OpsSettingsPage /> : <Navigate to="/tickets" replace />} />
                  <Route path="*" element={<Navigate to="/tickets" replace />} />
                </Routes>
              </Content>
            </Layout>
          </Layout>
        )}
      </AntApp>
    </ConfigProvider>
  );
}
