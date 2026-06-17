// 环节配置 / 标签绑定(antd)。环节=ops 分类,绑定 soyoo 标签(程序←cocos开发/unity开发),交付时间/阈值按环节。
import { useEffect, useState } from "react";
import { App, Button, Input, InputNumber, Popconfirm, Select, Space, Table, Typography } from "antd";
import { opsApi } from "../../api/modules/ops";
import type { OpsSegment, OpsTag } from "../../api/modules/ops";

type Draft = { name: string; defaultDeliveryHours: number; riskWarningHours: number; tagIds: string[] };

export default function OpsTagSettingsPage() {
  const [segments, setSegments] = useState<OpsSegment[]>([]);
  const [tags, setTags] = useState<OpsTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, Draft>>({});
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const { message: messageApi } = App.useApp();

  const load = async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([opsApi.segments(), opsApi.tags()]);
      setSegments(s.segments);
      setTags(t.tags);
      setEdits({});
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const valOf = (seg: OpsSegment): Draft =>
    edits[seg.id] ?? {
      name: seg.name,
      defaultDeliveryHours: seg.defaultDeliveryHours,
      riskWarningHours: seg.riskWarningHours,
      tagIds: seg.tags.map((t) => t.id),
    };
  const patch = (seg: OpsSegment, p: Partial<Draft>) => setEdits((prev) => ({ ...prev, [seg.id]: { ...valOf(seg), ...p } }));

  const save = async (seg: OpsSegment) => {
    const v = valOf(seg);
    if (!v.name.trim()) {
      messageApi.error("环节名不能为空");
      return;
    }
    setSavingId(seg.id);
    try {
      await opsApi.updateSegment(seg.id, v);
      messageApi.success(`已保存「${v.name}」`);
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (seg: OpsSegment) => {
    try {
      await opsApi.deleteSegment(seg.id);
      messageApi.success(`已删除「${seg.name}」`);
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await opsApi.createSegment(name);
      setNewName("");
      messageApi.success("环节已新增,记得绑定标签");
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "新增失败");
    } finally {
      setCreating(false);
    }
  };

  const tagOptions = tags.map((t) => ({ value: t.id, label: t.name }));

  const columns = [
    {
      title: "环节",
      key: "name",
      width: 150,
      render: (_: unknown, seg: OpsSegment) => <Input value={valOf(seg).name} onChange={(e) => patch(seg, { name: e.target.value })} />,
    },
    {
      title: "绑定 soyoo 标签",
      key: "tags",
      render: (_: unknown, seg: OpsSegment) => (
        <Select
          mode="multiple"
          style={{ width: "100%" }}
          placeholder="选择要绑定的标签"
          value={valOf(seg).tagIds}
          options={tagOptions}
          optionFilterProp="label"
          onChange={(ids) => patch(seg, { tagIds: ids })}
        />
      ),
    },
    {
      title: "默认交付小时",
      key: "d",
      width: 120,
      render: (_: unknown, seg: OpsSegment) => (
        <InputNumber min={1} max={720} value={valOf(seg).defaultDeliveryHours} onChange={(v) => patch(seg, { defaultDeliveryHours: Number(v) || 1 })} />
      ),
    },
    {
      title: "风险阈值小时",
      key: "r",
      width: 120,
      render: (_: unknown, seg: OpsSegment) => (
        <InputNumber min={1} max={168} value={valOf(seg).riskWarningHours} onChange={(v) => patch(seg, { riskWarningHours: Number(v) || 1 })} />
      ),
    },
    {
      title: "操作",
      key: "op",
      width: 150,
      render: (_: unknown, seg: OpsSegment) => (
        <Space>
          <Button size="small" type="primary" loading={savingId === seg.id} onClick={() => save(seg)}>
            保存
          </Button>
          <Popconfirm title="删除该环节?" onConfirm={() => remove(seg)} okText="删除" cancelText="取消">
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space direction="vertical" size={4} style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          环节配置 / 标签绑定
        </Typography.Title>
        <Typography.Text type="secondary">
          环节是 ops 自己的分类;把 soyoo 标签绑到环节(如 程序 ← cocos开发 / unity开发)。建单按环节筛选负责人,交付时间/阈值按环节生效。
        </Typography.Text>
      </Space>
      <Space style={{ marginBottom: 12 }}>
        <Input placeholder="新环节名(如 音效)" value={newName} onChange={(e) => setNewName(e.target.value)} onPressEnter={create} style={{ width: 200 }} />
        <Button type="dashed" loading={creating} onClick={create}>
          + 新增环节
        </Button>
      </Space>
      <Table rowKey="id" loading={loading} dataSource={segments} columns={columns} pagination={false} size="middle" />
    </div>
  );
}
