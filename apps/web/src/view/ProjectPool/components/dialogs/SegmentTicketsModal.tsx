import { useEffect, useMemo, useState } from "react";
import { Avatar, Button, Empty, List, Modal, Select, Space, Spin, Tag } from "antd";
import type { OpsSegmentTicket } from "@/api/modules/ops";
import { fmtDuration } from "@/utils/format";

type SegmentTicketsModalProps = {
  open: boolean;
  title: string;
  segments: { id: number; name: string; count: number }[];
  activeSegmentId: number | number[] | null;
  tickets: OpsSegmentTicket[];
  loading: boolean;
  onCancel: () => void;
  onSegmentChange: (segmentId: number | number[]) => void;
  onOpenTicket: (ticket: OpsSegmentTicket) => void;
};

type TicketWithSource = OpsSegmentTicket & {
  projectName?: string;
  projectStage?: string;
  segmentId?: number;
  segmentName?: string;
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
    <Space size={5} style={{ minWidth: 90 }}>
      <Avatar size={22} src={avatar || undefined} style={{ background: bg, color, fontSize: 11 }}>
        {(name || "?").slice(0, 1)}
      </Avatar>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: "#94a3b8", fontSize: 11, lineHeight: "13px" }}>{label}</span>
        <span style={{ display: "block", color: "#0f172a", fontWeight: 600, fontSize: 12, lineHeight: "15px", maxWidth: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name || "-"}
        </span>
      </span>
    </Space>
  );
}

function FlowArrow({ remain }: { remain: ReturnType<typeof ticketRemain> }) {
  return (
    <span style={{ width: 68, display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 1, flexShrink: 0 }}>
      <span style={{ width: 58, height: 10, position: "relative", display: "inline-block" }}>
        <span style={{ position: "absolute", left: 0, right: 1, top: 5, borderTop: "1px solid #94a3b8" }} />
        <span style={{ position: "absolute", right: 0, top: 2, width: 8, height: 8, borderTop: "1px solid #94a3b8", borderRight: "1px solid #94a3b8", transform: "rotate(45deg)" }} />
      </span>
      {remain}
    </span>
  );
}

export default function SegmentTicketsModal({ open, title, segments, activeSegmentId, tickets, loading, onCancel, onSegmentChange, onOpenTicket }: SegmentTicketsModalProps) {
  const [segmentFilter, setSegmentFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const segmentOptions = useMemo(() => {
    if (segments.length) return segments.map((segment) => ({ value: String(segment.id), label: `${segment.name}(${segment.count})` }));
    const names = new Set<string>();
    for (const ticket of tickets) {
      const segmentName = (ticket as TicketWithSource).segmentName;
      if (segmentName) names.add(segmentName);
    }
    return [...names].map((name) => ({ value: name, label: name }));
  }, [segments, tickets]);
  const statusOptions = useMemo(() => {
    const statuses = new Set<string>();
    for (const ticket of tickets) {
      if (ticket.status) statuses.add(ticket.status);
    }
    return [...statuses].map((status) => ({ value: status, label: status }));
  }, [tickets]);
  const visibleTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const source = ticket as TicketWithSource;
      const segmentKey = source.segmentId != null ? String(source.segmentId) : source.segmentName;
      const segmentMatched = !segmentFilter.length || (segmentKey ? segmentFilter.includes(segmentKey) : false);
      const statusMatched = !statusFilter.length || statusFilter.includes(ticket.status);
      return segmentMatched && statusMatched;
    });
  }, [segmentFilter, statusFilter, tickets]);
  useEffect(() => {
    setSegmentFilter([]);
    setStatusFilter([]);
  }, [open, tickets]);

  return (
    <Modal title={title} open={open} onCancel={onCancel} footer={null} width={720}>
      {segmentOptions.length || statusOptions.length ? (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, margin: "-4px 0 10px" }}>
          {segmentOptions.length ? (
          <Select
            mode="multiple"
            allowClear={!segments.length}
            size="small"
            placeholder="环节"
            value={segmentFilter.length ? segmentFilter : segments.length ? (Array.isArray(activeSegmentId) ? activeSegmentId : activeSegmentId == null ? [] : [activeSegmentId]).map(String) : []}
            onChange={(value) => {
              if (segments.length && !value.length) return;
              setSegmentFilter(value);
              if (segments.length) onSegmentChange(value.map(Number));
            }}
            style={{ minWidth: 260, maxWidth: "100%" }}
            maxTagCount="responsive"
            options={segmentOptions}
          />
          ) : null}
          {statusOptions.length ? (
            <Select
              mode="multiple"
              allowClear
              size="small"
              placeholder="工单状态"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ minWidth: 160, maxWidth: "100%" }}
              maxTagCount="responsive"
              options={statusOptions}
            />
          ) : null}
        </div>
      ) : null}
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <Spin />
        </div>
      ) : visibleTickets.length ? (
        <List
          dataSource={visibleTickets}
          pagination={visibleTickets.length > 10 ? { pageSize: 10, size: "small", showSizeChanger: false, showTotal: (total) => `共 ${total} 条工单` } : false}
          renderItem={(t) => {
            const source = t as TicketWithSource;
            return (
            <List.Item
              style={{ borderRadius: 6, padding: "7px 10px" }}
              actions={[
                <Button key="view" size="small" type="link" onClick={() => onOpenTicket(t)}>
                  查看
                </Button>,
              ]}
            >
              <div style={{ width: "100%" }}>
                <div style={{ marginBottom: 4, lineHeight: "18px", color: "#0f172a", fontSize: 13, fontWeight: 600 }}>
                  {source.projectName ? (
                    <>
                      <span>项目：{source.projectName}</span>
                      <span style={{ marginLeft: 10 }}>需求：{t.title}</span>
                    </>
                  ) : (
                    <span>需求：{t.title}</span>
                  )}
                </div>
                <Space size={8} wrap style={{ fontSize: 12 }}>
                  <PersonFlowNode label="提单人" avatar={t.requesterAvatar} name={t.requesterName} tone="requester" />
                  <FlowArrow remain={ticketRemain(t)} />
                  <PersonFlowNode label="负责人" avatar={t.ownerAvatar} name={t.ownerName} tone="owner" />
                  {source.segmentName ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>环节:{source.segmentName}</Tag> : null}
                  <Tag color={t.status === "进行中" ? "green" : undefined} style={{ marginInlineEnd: 0 }}>{t.status}</Tag>
                  <span style={{ color: "#94a3b8" }}>优先级:{t.priority}</span>
                </Space>
              </div>
            </List.Item>
            );
          }}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tickets.length ? "当前筛选下暂无工单" : "该环节暂无未完成工单"} />
      )}
    </Modal>
  );
}
