// 环节配置 / 标签绑定(antd)。环节=ops 分类,绑定 soyoo 标签(程序←cocos开发/unity开发),交付时间/阈值按环节。
import { type CSSProperties, type DOMAttributes, type HTMLAttributes, type Key, createContext, useContext, useEffect, useMemo, useState } from "react";
import { App, Button, Input, InputNumber, Popconfirm, Select, Space, Table, Typography } from "antd";
import { HolderOutlined } from "@ant-design/icons";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { opsApi } from "../../api/modules/ops";
import type { OpsSegment, OpsTag } from "../../api/modules/ops";

type Draft = { name: string; defaultDeliveryHours: number; riskWarningHours: number; tagIds: string[] };

// 拖拽:手柄的 listeners 经 context 传到「序号」列的手柄(整行平滑位移,只有手柄能发起拖拽,不影响行内输入框)
const RowContext = createContext<{ setActivatorNodeRef?: (el: HTMLElement | null) => void; listeners?: Record<string, unknown> }>({});

function DragHandle() {
  const { setActivatorNodeRef, listeners } = useContext(RowContext);
  return (
    <span ref={setActivatorNodeRef} {...(listeners as DOMAttributes<HTMLSpanElement>)} style={{ cursor: "grab", color: "#999", touchAction: "none" }} title="拖动排序">
      <HolderOutlined />
    </span>
  );
}

function SortableRow(props: HTMLAttributes<HTMLTableRowElement> & { "data-row-key"?: Key }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: String(props["data-row-key"] ?? "") });
  const style: CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 999, background: "#f5f7fa" } : {}),
  };
  const ctx = useMemo(() => ({ setActivatorNodeRef, listeners: listeners as Record<string, unknown> }), [setActivatorNodeRef, listeners]);
  return (
    <RowContext.Provider value={ctx}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes} />
    </RowContext.Provider>
  );
}

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

  // 拖拽排序(@dnd-kit):乐观更新 → 持久化 sort_order → 提示
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = segments.findIndex((s) => String(s.id) === active.id);
    const to = segments.findIndex((s) => String(s.id) === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(segments, from, to);
    setSegments(next);
    opsApi
      .reorderSegments(next.map((s) => s.id))
      .then(() => messageApi.success("排序已保存"))
      .catch((e) => {
        messageApi.error(e instanceof Error ? e.message : "排序保存失败");
        void load();
      });
  };

  const tagOptions = tags.map((t) => ({ value: t.id, label: t.name }));

  const columns = [
    {
      title: "序号",
      key: "drag",
      width: 64,
      render: (_: unknown, __: OpsSegment, index: number) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <DragHandle />
          <span style={{ color: "#475569" }}>{index + 1}</span>
        </span>
      ),
    },
    {
      title: "环节",
      key: "name",
      width: 150,
      render: (_: unknown, seg: OpsSegment) => <Input value={valOf(seg).name} onChange={(e) => patch(seg, { name: e.target.value })} />,
    },
    {
      title: "绑定 soyoo 标签",
      key: "tags",
      width: 300,
      render: (_: unknown, seg: OpsSegment) => (
        <Select
          mode="multiple"
          maxTagCount="responsive"
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
      title: "交付时长(h)",
      key: "d",
      width: 130,
      render: (_: unknown, seg: OpsSegment) => (
        <InputNumber min={1} max={720} style={{ width: "100%" }} value={valOf(seg).defaultDeliveryHours} onChange={(v) => patch(seg, { defaultDeliveryHours: Number(v) || 1 })} />
      ),
    },
    {
      title: "预警时长(h·须>交付)",
      key: "r",
      width: 160,
      render: (_: unknown, seg: OpsSegment) => (
        <InputNumber
          min={(valOf(seg).defaultDeliveryHours || 1) + 1}
          max={720}
          style={{ width: "100%" }}
          value={valOf(seg).riskWarningHours}
          onChange={(v) => patch(seg, { riskWarningHours: Number(v) || 1 })}
        />
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
        <Space direction="vertical" size={4}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            环节配置 / 标签绑定
          </Typography.Title>
          <Typography.Text type="secondary">把 soyoo 标签绑到 ops 环节;建单按环节选负责人,交付/预警时间也按环节算。</Typography.Text>
        </Space>
        <Space style={{ flexShrink: 0 }}>
          <Input placeholder="新环节名(如 音效)" value={newName} onChange={(e) => setNewName(e.target.value)} onPressEnter={create} style={{ width: 180 }} />
          <Button type="dashed" loading={creating} onClick={create}>
            + 新增环节
          </Button>
        </Space>
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={segments.map((s) => String(s.id))} strategy={verticalListSortingStrategy}>
          <Table
            rowKey="id"
            loading={loading}
            dataSource={segments}
            columns={columns}
            pagination={false}
            size="middle"
            components={{ body: { row: SortableRow } }}
          />
        </SortableContext>
      </DndContext>
    </div>
  );
}
