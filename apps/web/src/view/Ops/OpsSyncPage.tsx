// 设置 > 同步管理:同步频率(页面可调,落库,立即重排)+ 手动同步一次 + 同步记录。仅管理员可见。
import { useEffect, useState } from "react";
import { App, Button, Card, Descriptions, InputNumber, Space, Switch, Table, Tag, Typography } from "antd";
import { ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import { opsApi } from "../../api/modules/ops";
import type { OpsSyncLog, OpsSyncStatus } from "../../api/modules/ops";

const fmt = (v?: string) => (v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "-");
const triggerLabel = (v: string) => (v === "manual" ? "手动" : v === "startup" ? "启动" : "定时");

export default function OpsSyncPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<OpsSyncStatus | null>(null);
  const [logs, setLogs] = useState<OpsSyncLog[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await opsApi.syncInfo();
      setMinutes(r.config.intervalMinutes);
      setEnabled(r.config.enabled);
      setStatus(r.status);
      setLogs(r.logs);
      return r;
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载同步信息失败");
      return null;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await opsApi.saveSyncConfig({ intervalMinutes: minutes, enabled });
      message.success("已保存,定时器按新设置立即重排(无需重启)");
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    const prevTopId = logs[0]?.id ?? 0;
    try {
      await opsApi.runSync();
      message.loading({ content: "同步已开始(全量,约 1 分钟)…", key: "sync", duration: 0 });
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const r = await opsApi.syncInfo().catch(() => null);
        if (r) {
          setStatus(r.status);
          setLogs(r.logs);
          if ((r.logs[0]?.id ?? 0) > prevTopId) {
            const ok = r.logs[0]?.status === "success";
            if (ok) message.success({ content: "同步完成", key: "sync" });
            else message.error({ content: "同步失败,见记录", key: "sync" });
            return;
          }
        }
      }
      message.info({ content: "仍在同步,稍后点「刷新」查看记录", key: "sync" });
    } catch (e) {
      message.error({ content: e instanceof Error ? e.message : "触发同步失败", key: "sync" });
    } finally {
      setRunning(false);
    }
  };

  const cols = [
    { title: "时间", dataIndex: "startedAt", width: 165, render: (v: string) => fmt(v) },
    { title: "触发", dataIndex: "triggerBy", width: 64, render: triggerLabel },
    { title: "操作人", dataIndex: "actorName", width: 84, render: (v: string) => v || "-" },
    { title: "结果", dataIndex: "status", width: 70, render: (v: string) => <Tag color={v === "success" ? "success" : "error"}>{v === "success" ? "成功" : "失败"}</Tag> },
    { title: "用户", dataIndex: "users", width: 56 },
    { title: "项目", dataIndex: "projects", width: 56 },
    { title: "客户", dataIndex: "tenants", width: 56 },
    { title: "标签", dataIndex: "tags", width: 56 },
    { title: "耗时", dataIndex: "durationMs", width: 70, render: (v: number) => `${(v / 1000).toFixed(1)}s` },
    { title: "错误", dataIndex: "error", ellipsis: true, render: (v: string) => v || "-" },
  ];

  return (
    <div>
      <Card
        size="small"
        title="同步设置"
        style={{ marginBottom: 12 }}
        loading={loading}
        extra={
          <Button type="primary" icon={<SyncOutlined spin={running} />} loading={running} onClick={runNow}>
            立即同步一次
          </Button>
        }
      >
        <Space size="large" wrap>
          <Space>
            <span>定时同步</span>
            <Switch checked={enabled} onChange={setEnabled} />
          </Space>
          <Space>
            <span>每</span>
            <InputNumber min={1} max={1440} value={minutes} onChange={(v) => setMinutes(Number(v) || 5)} style={{ width: 120 }} addonAfter="分钟" disabled={!enabled} />
            <span>同步一次</span>
          </Space>
          <Button onClick={save} loading={saving}>
            保存
          </Button>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          建议 ≥ 5 分钟:每次同步会全量拉取所有项目的成员,频率太高会给 soyoo服务端 造成接口压力。改完点保存即生效。
        </Typography.Paragraph>
      </Card>

      <Card size="small" title="上次同步" style={{ marginBottom: 12 }}>
        {status ? (
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="状态">{status.active ? <Tag color="success">正常</Tag> : <Tag color="error">{status.reason || "未同步"}</Tag>}</Descriptions.Item>
            <Descriptions.Item label="时间">{fmt(status.syncedAt)}</Descriptions.Item>
            <Descriptions.Item label="用户">{status.users ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="项目">{status.projects ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="客户">{status.tenants ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="标签">{status.tags ?? "-"}</Descriptions.Item>
            {status.error ? (
              <Descriptions.Item label="错误" span={2}>
                {status.error}
              </Descriptions.Item>
            ) : null}
          </Descriptions>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        )}
      </Card>

      <Card
        size="small"
        title="同步记录"
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
        }
      >
        <Table rowKey="id" size="small" columns={cols} dataSource={logs} pagination={false} scroll={{ x: 900 }} />
      </Card>
    </div>
  );
}
