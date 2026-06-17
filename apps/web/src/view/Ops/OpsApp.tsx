// 需求提单(antd)外壳 + 路由(挂 /ops/*)。左侧菜单含原版全部菜单 + 退出登录;非管理员只看到「需求提单」。
// 需求提单 / 设置 → 本 /ops 内路由;运营总览 / 项目池 / 人员进度 / 管理员 → 旧应用(/?view=key)。
import { useEffect, useState } from "react";
import { App as AntApp, Avatar, Button, ConfigProvider, Layout, Menu } from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  DashboardOutlined,
  ProjectOutlined,
  TeamOutlined,
  FileTextOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import OpsTicketsPage from "./OpsTicketsPage";
import OpsSettingsPage from "./OpsSettingsPage";
import { logoutApi } from "../../api/modules/companyPlan";
import { opsApi, type OpsMe } from "../../api/modules/ops";

const { Sider, Content } = Layout;

// 旧应用(运营总览/项目池/人员进度/管理员)用内部状态切换,/ops 通过 /?view=key 深链过去
const LEGACY_VIEWS: Record<string, string> = {
  overview: "/?view=overview",
  projects: "/?view=projects",
  people: "/?view=people",
  admin: "/?view=admin",
};

export default function OpsApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const selected = location.pathname.includes("/ops/settings") ? "settings" : "tickets";
  const [isAdmin, setIsAdmin] = useState(false);
  const [me, setMe] = useState<OpsMe | null>(null);

  useEffect(() => {
    opsApi
      .me()
      .then((r) => {
        setMe(r.user ?? null);
        setIsAdmin(!!r.user?.isAdmin);
      })
      .catch(() => setIsAdmin(false));
  }, []);

  const onMenuClick = (key: string) => {
    if (key === "tickets") navigate("/ops/tickets");
    else if (key === "settings") navigate("/ops/settings");
    else if (LEGACY_VIEWS[key]) window.location.href = LEGACY_VIEWS[key];
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch {
      /* 忽略:无论成功与否都回登录页 */
    }
    window.location.href = "/";
  };

  const allItems = [
    { key: "overview", icon: <DashboardOutlined />, label: "运营总览" },
    { key: "projects", icon: <ProjectOutlined />, label: "项目池" },
    { key: "people", icon: <TeamOutlined />, label: "人员进度" },
    { key: "tickets", icon: <FileTextOutlined />, label: "需求提单" },
    { key: "settings", icon: <SettingOutlined />, label: "设置" },
    { key: "admin", icon: <SafetyCertificateOutlined />, label: "管理员" },
  ];
  // 非管理员只看到「需求提单」(设置等仅管理员可见)
  const items = isAdmin ? allItems : allItems.filter((i) => i.key === "tickets");

  return (
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#0f766e" } }}>
      <AntApp style={{ minHeight: "100vh" }}>
        <Layout style={{ minHeight: "100vh" }}>
          <Sider theme="light" width={200} style={{ borderRight: "1px solid #f0f0f0" }}>
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 20px", fontWeight: 600, color: "#0f766e", flexShrink: 0 }}>运营中台</div>
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
          <Layout>
            <Content style={{ padding: 16, background: "#f0f2f5" }}>
              <Routes>
                <Route path="tickets" element={<OpsTicketsPage />} />
                <Route path="settings" element={<OpsSettingsPage />} />
                <Route path="*" element={<Navigate to="tickets" replace />} />
              </Routes>
            </Content>
          </Layout>
        </Layout>
      </AntApp>
    </ConfigProvider>
  );
}
