// 应用外壳:登录态守卫 + 左侧固定菜单 + 路由分发。各页面均独立成组件(同目录 LoginView / *Page)。
// 未登录显示登录页;非管理员只看到「需求提单」。直接挂根:/tickets、/overview、/settings 等。
import { useEffect, useState } from "react";
import { App as AntApp, Avatar, Button, ConfigProvider, Layout, Menu, Spin, Tooltip } from "antd";
import zhCN from "antd/locale/zh_CN";
import { DashboardOutlined, ProjectOutlined, TeamOutlined, FileTextOutlined, SettingOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { logoutApi } from "../../api/modules/companyPlan";
import { opsApi, type OpsMe } from "../../api/modules/ops";
import LoginView from "./LoginView";
import TicketsPage from "../Tickets/TicketsPage";
import OpsSettingsPage from "./OpsSettingsPage";
import OverviewPage from "./OverviewPage";
import ProjectPoolPage from "./ProjectPoolPage";
import PeoplePage from "./PeoplePage";
import NotificationCenter from "./components/NotificationCenter";

const { Sider, Content } = Layout;
const OPS_SIDER_COLLAPSED_KEY = "ops.sider.collapsed";

export default function OpsApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const selected = location.pathname.split("/")[1] || "tickets";
  const [me, setMe] = useState<OpsMe | null>(null);
  const [auth, setAuth] = useState<"loading" | "login" | "ready">("loading");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(OPS_SIDER_COLLAPSED_KEY) === "1");
  const isAdmin = !!me?.isAdmin;
  const canPool = isAdmin || !!me?.isPlanner; // 管理员或策划(制片)可见「项目池」
  const siderWidth = collapsed ? 64 : 200;

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

  useEffect(() => {
    localStorage.setItem(OPS_SIDER_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

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
    { key: "my-projects", icon: <FolderOpenOutlined />, label: "我的项目", show: true },
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
            <Sider
              theme="light"
              width={siderWidth}
              collapsedWidth={64}
              collapsed={collapsed}
              trigger={null}
              style={{ position: "fixed", left: 0, top: 0, bottom: 0, height: "100vh", borderRight: "1px solid #f0f0f0", zIndex: 10, transition: "width 0.18s ease" }}
            >
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", gap: 8, padding: collapsed ? "10px 8px" : "10px 12px 10px 20px", flexShrink: 0 }}>
                  {collapsed ? null : (
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 18, color: "#0f766e", lineHeight: 1.2 }}>PlayableOps</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>试玩广告生产中台</div>
                    </div>
                  )}
                  <Tooltip title={collapsed ? "展开侧边栏" : "折叠侧边栏"} placement="right">
                    <Button
                      type="text"
                      size="small"
                      icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                      onClick={() => setCollapsed((v) => !v)}
                      style={{ flexShrink: 0, color: "#64748b" }}
                    />
                  </Tooltip>
                </div>
                <Menu mode="inline" inlineCollapsed={collapsed} selectedKeys={[selected]} style={{ flex: 1, borderInlineEnd: "none", overflowY: "auto" }} onClick={(e) => onMenuClick(e.key)} items={items} />
                <div style={{ padding: collapsed ? "10px 8px" : 12, borderTop: "1px solid #f0f0f0", flexShrink: 0 }}>
                  {collapsed ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                      <Tooltip title={me?.name || "-"} placement="right">
                        <Avatar size={32} src={me?.avatar || undefined} style={{ flexShrink: 0, background: "#e2e8f0", color: "#475569" }}>
                          {(me?.name || "?").slice(0, 1)}
                        </Avatar>
                      </Tooltip>
                      <NotificationCenter enabled={auth === "ready"} notifyStart={me?.notifyStart} notifyEnd={me?.notifyEnd} />
                      <Tooltip title="退出登录" placement="right">
                        <Button icon={<LogoutOutlined />} onClick={logout} />
                      </Tooltip>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8, marginBottom: 10 }}>
                        <Avatar size={32} src={me?.avatar || undefined} style={{ flexShrink: 0, background: "#e2e8f0", color: "#475569" }}>
                          {(me?.name || "?").slice(0, 1)}
                        </Avatar>
                      <div style={{ overflow: "hidden", lineHeight: 1.3, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me?.name || "-"}</div>
                        {me?.wechatName ? (
                          <div style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me.wechatName}</div>
                        ) : null}
                      </div>
                        <NotificationCenter enabled={auth === "ready"} notifyStart={me?.notifyStart} notifyEnd={me?.notifyEnd} />
                      </div>
                      <Button block icon={<LogoutOutlined />} onClick={logout}>
                        退出登录
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Sider>
            <Layout style={{ marginLeft: siderWidth, transition: "margin-left 0.18s ease" }}>
              <Content style={{ padding: 16, background: "#f0f2f5" }}>
                <Routes>
                  <Route path="tickets" element={<TicketsPage isAdmin={isAdmin} />} />
                  <Route path="overview" element={<OverviewPage />} />
                  <Route path="my-projects" element={<ProjectPoolPage key="my-projects" mine />} />
                  <Route path="projects" element={canPool ? <ProjectPoolPage key="projects" /> : <Navigate to="/tickets" replace />} />
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
