// 设置 > 项目阶段时间:每个制作阶段设「是否监控 + 停留多久算超时」(按工作时间)。仅管理员。
import { useEffect, useState } from "react";
import { App, Button, InputNumber, Space, Switch, Table, Typography } from "antd";
import { opsApi } from "../../api/modules/ops";
import type { OpsProjectStageSetting } from "../../api/modules/ops";

export default function OpsProjectStageSettingsPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<OpsProjectStageSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await opsApi.projectStageSettings();
      setRows(r.settings);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const patch = (stage: string, p: Partial<OpsProjectStageSetting>) => setRows((prev) => prev.map((r) => (r.stage === stage ? { ...r, ...p } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const r = await opsApi.saveProjectStageSettings(rows);
      setRows(r.settings);
      message.success("已保存");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: "制作阶段", dataIndex: "stage", width: 160 },
    {
      title: "监控",
      key: "enabled",
      width: 90,
      render: (_: unknown, r: OpsProjectStageSetting) => <Switch checked={r.enabled} onChange={(v) => patch(r.stage, { enabled: v })} />,
    },
    {
      title: "停留超时阈值",
      key: "hours",
      render: (_: unknown, r: OpsProjectStageSetting) => (
        <Space>
          <InputNumber min={0} max={9999} disabled={!r.enabled} value={r.staleHours} onChange={(v) => patch(r.stage, { staleHours: Number(v) || 0 })} addonAfter="工作小时" style={{ width: 160 }} />
          <span style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>≈ {Math.round((r.staleHours / 9) * 10) / 10} 天</span>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Paragraph type="secondary">
        每个制作阶段设「是否监控 + 在该阶段停留多久算超时」。项目停在某阶段超过阈值还没流转,会按通知配置提醒对应负责人;项目池不再展示单独的阶段停留状态列。
      </Typography.Paragraph>
      <Table rowKey="stage" loading={loading} dataSource={rows} columns={columns} pagination={false} size="middle" style={{ maxWidth: 600 }} />
      <Button type="primary" loading={saving} onClick={save} style={{ marginTop: 12 }}>
        保存
      </Button>
    </div>
  );
}
