import { useState } from "react";
import { App as AntApp, Button, Card, Form, Input, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { loginApi } from "../../api/modules/companyPlan";

// 登录页:soyoo 账号密码 → /api/auth/login(后端转发 soyoo /tools/login),成功后回调 onSuccess 重新加载会话。
export default function LoginView({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const { message } = AntApp.useApp();
  const [loading, setLoading] = useState(false);

  const onFinish = async (v: { username: string; password: string }) => {
    setLoading(true);
    try {
      await loginApi({ username: v.username.trim(), password: v.password });
      await onSuccess();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
      <Card style={{ width: 360, boxShadow: "0 6px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <Typography.Title level={3} style={{ margin: 0, color: "#0f766e" }}>
            PlayableOps
          </Typography.Title>
          <Typography.Text type="secondary">试玩广告生产中台</Typography.Text>
        </div>
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="username" rules={[{ required: true, message: "请输入账号" }]}>
            <Input size="large" prefix={<UserOutlined />} placeholder="账号" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password size="large" prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" size="large" block htmlType="submit" loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
