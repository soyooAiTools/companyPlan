import { Avatar, Button, Empty, List, Modal, Space, Spin, Tag } from "antd";
import type { OpsSegmentTicket } from "@/api/modules/ops";
import SegmentedTabs from "@/components/SegmentedTabs";
import { fmtDuration } from "@/utils/format";

type SegmentTicketsModalProps = {
  open: boolean;
  title: string;
  segments: { id: number; name: string; count: number }[];
  activeSegmentId: number | null;
  tickets: OpsSegmentTicket[];
  loading: boolean;
  onCancel: () => void;
  onSegmentChange: (segmentId: number) => void;
  onOpenTicket: (ticket: OpsSegmentTicket) => void;
};

const ticketRemain = (ticket: OpsSegmentTicket) => {
  const remaining = ticket.remainingHours;
  if (remaining == null) return null;
  if (remaining < 0) return <span style={{ color: ticket.overdue ? "#cf1322" : "#fa8c16", fontSize: 12, fontWeight: 600 }}>超期 {fmtDuration(-remaining)}</span>;
  return <span style={{ color: "#64748b", fontSize: 12, fontWeight: 600 }}>剩 {fmtDuration(remaining)}</span>;
};

function PersonFlowNode({ label, avatar, name, tone }: { label: string; avatar?: string; name?: string; tone: "requester" | "owner" }) {
  const color = tone === "requester" ? "#0369a1" : "#475569";
  const bg = tone === "requester" ? "#e0f2fe" : "#e2e8f0";
  return (
    <Space size={6} style={{ minWidth: 96 }}>
      <Avatar size={24} src={avatar || undefined} style={{ background: bg, color, fontSize: 11 }}>
        {(name || "?").slice(0, 1)}
      </Avatar>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: "#94a3b8", fontSize: 11, lineHeight: "14px" }}>{label}</span>
        <span style={{ display: "block", color: "#0f172a", fontWeight: 600, fontSize: 12, lineHeight: "16px", maxWidth: 88, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name || "-"}
        </span>
      </span>
    </Space>
  );
}

function FlowArrow({ remain }: { remain: ReturnType<typeof ticketRemain> }) {
  return (
    <span style={{ width: 74, display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
      <span style={{ width: 62, height: 12, position: "relative", display: "inline-block" }}>
        <span style={{ position: "absolute", left: 0, right: 1, top: 5, borderTop: "1px solid #94a3b8" }} />
        <span style={{ position: "absolute", right: 0, top: 2, width: 8, height: 8, borderTop: "1px solid #94a3b8", borderRight: "1px solid #94a3b8", transform: "rotate(45deg)" }} />
      </span>
      {remain}
    </span>
  );
}

export default function SegmentTicketsModal({ open, title, segments, activeSegmentId, tickets, loading, onCancel, onSegmentChange, onOpenTicket }: SegmentTicketsModalProps) {
  return (
    <Modal title={`环节工单 · ${title}`} open={open} onCancel={onCancel} footer={null} width={720}>
      {segments.length ? (
        <div style={{ margin: "-4px 0 10px" }}>
          <SegmentedTabs
            value={activeSegmentId == null ? "" : String(activeSegmentId)}
            onChange={(key) => onSegmentChange(Number(key))}
            options={segments.map((s) => ({ value: String(s.id), label: `${s.name}(${s.count})` }))}
          />
        </div>
      ) : null}
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <Spin />
        </div>
      ) : tickets.length ? (
        <List
          dataSource={tickets}
          renderItem={(t) => (
            <List.Item
              style={{ borderRadius: 6, paddingInline: 10 }}
              actions={[
                <Button key="view" size="small" type="link" onClick={() => onOpenTicket(t)}>
                  查看
                </Button>,
              ]}
            >
              <div style={{ width: "100%" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{t.title}</div>
                <Space size={10} wrap style={{ fontSize: 12 }}>
                  <PersonFlowNode label="提单人" avatar={t.requesterAvatar} name={t.requesterName} tone="requester" />
                  <FlowArrow remain={ticketRemain(t)} />
                  <PersonFlowNode label="负责人" avatar={t.ownerAvatar} name={t.ownerName} tone="owner" />
                  <Tag style={{ marginInlineEnd: 0 }}>{t.status}</Tag>
                  <span style={{ color: "#94a3b8" }}>优先级:{t.priority}</span>
                </Space>
              </div>
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该环节暂无未完成工单" />
      )}
    </Modal>
  );
}
