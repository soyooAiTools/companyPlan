// 设置 > 项目状态时间:每个项目状态设「是否监控 + 停留多久算超时」。仅管理员。
import { useEffect, useState } from "react";
import { App, Button, InputNumber, Switch, Table, Typography } from "antd";
import { opsApi } from "../../api/modules/ops";
import type { OpsProjectStatusSetting } from "../../api/modules/ops";

export default function OpsProjectStatusSettingsPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<OpsProjectStatusSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await opsApi.projectStatusSettings();
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

  const patch = (status: string, p: Partial<OpsProjectStatusSetting>) => setRows((prev) => prev.map((r) => (r.status === status ? { ...r, ...p } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const r = await opsApi.saveProjectStatusSettings(rows);
      setRows(r.settings);
      message.success("已保存");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: "项目状态", dataIndex: "status", width: 140 },
    {
      title: "监控",
      key: "enabled",
      width: 90,
      render: (_: unknown, r: OpsProjectStatusSetting) => <Switch checked={r.enabled} onChange={(v) => patch(r.status, { enabled: v })} />,
    },
    {
      title: "停留超时阈值",
      key: "hours",
      render: (_: unknown, r: OpsProjectStatusSetting) => (
        <InputNumber min={0} max={9999} disabled={!r.enabled} value={r.staleHours} onChange={(v) => patch(r.status, { staleHours: Number(v) || 0 })} addonAfter="小时" style={{ width: 160 }} />
      ),
    },
  ];

  return (
    <div>
      <Typography.Paragraph type="secondary">
        每个项目状态设「是否监控 + 停留多久算超时」。项目停在某状态超过阈值还没变更,就进「项目池 → 超时关注」并整行标红。
      </Typography.Paragraph>
      <Table rowKey="status" loading={loading} dataSource={rows} columns={columns} pagination={false} size="middle" style={{ maxWidth: 520 }} />
      <Button type="primary" loading={saving} onClick={save} style={{ marginTop: 12 }}>
        保存
      </Button>
    </div>
  );
}
