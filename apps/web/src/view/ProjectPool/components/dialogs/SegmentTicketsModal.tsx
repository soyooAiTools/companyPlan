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
  projectId?: string;
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

const filterSelectStyle = { width: 218, maxWidth: "100%" };

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
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [segmentFilter, setSegmentFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const projectOptions = useMemo(() => {
    const projects = new Map<string, { name: string; count: number }>();
    for (const ticket of tickets) {
      const source = ticket as TicketWithSource;
      const key = source.projectId || source.projectName;
      if (!key || !source.projectName) continue;
      const item = projects.get(key) || { name: source.projectName, count: 0 };
      item.count += 1;
      projects.set(key, item);
    }
    if (projects.size <= 1) return [];
    return [...projects.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name, "zh-CN"))
      .map(([value, item]) => ({ value, label: `${item.name}(${item.count})` }));
  }, [tickets]);
  const segmentOptions = useMemo(() => {
    if (segments.length) return segments.map((segment) => ({ value: String(segment.id), label: `${segment.name}(${segment.count})` }));
    const names = new Map<string, number>();
    for (const ticket of tickets) {
      const segmentName = (ticket as TicketWithSource).segmentName;
      if (segmentName) names.set(segmentName, (names.get(segmentName) || 0) + 1);
    }
    return [...names.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "zh-CN"))
      .map(([name, count]) => ({ value: name, label: `${name}(${count})` }));
  }, [segments, tickets]);
  const statusOptions = useMemo(() => {
    const statuses = new Set<string>();
    for (const ticket of tickets) {
      if (ticket.status) statuses.add(ticket.status);
    }
    return [...statuses].map((status) => ({ value: status, label: status }));
  }, [tickets]);
  const priorityOptions = useMemo(() => {
    const priorities = new Map<string, number>();
    for (const ticket of tickets) {
      if (!ticket.priority) continue;
      priorities.set(ticket.priority, (priorities.get(ticket.priority) || 0) + 1);
    }
    return [...priorities.entries()].map(([priority, count]) => ({ value: priority, label: `${priority}(${count})` }));
  }, [tickets]);
  const visibleTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const source = ticket as TicketWithSource;
      const projectKey = source.projectId || source.projectName;
      const projectMatched = !projectFilter.length || (projectKey ? projectFilter.includes(projectKey) : false);
      const segmentKeys = [source.segmentId != null ? String(source.segmentId) : "", source.segmentName || ""].filter(Boolean);
      const segmentMatched = !segmentFilter.length || segmentKeys.some((key) => segmentFilter.includes(key));
      const statusMatched = !statusFilter.length || statusFilter.includes(ticket.status);
      const priorityMatched = !priorityFilter.length || priorityFilter.includes(ticket.priority);
      return projectMatched && segmentMatched && statusMatched && priorityMatched;
    });
  }, [priorityFilter, projectFilter, segmentFilter, statusFilter, tickets]);
  useEffect(() => {
    setProjectFilter([]);
    setSegmentFilter([]);
    setStatusFilter([]);
    setPriorityFilter([]);
  }, [open, tickets]);

  return (
    <Modal title={title} open={open} onCancel={onCancel} footer={null} width="min(960px, calc(100vw - 96px))" keyboard={false}>
      <style>{`
        .ops-segment-ticket-item {
          border-radius: 6px;
          padding: 7px 10px !important;
          margin: 4px 0;
          transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
          transform-origin: center;
        }
        .ops-segment-ticket-item:hover {
          background: #f8fafc;
          box-shadow: 0 8px 22px rgba(15, 23, 42, 0.10);
          transform: scale(1.012);
          z-index: 1;
        }
      `}</style>
      {projectOptions.length || segmentOptions.length || statusOptions.length || priorityOptions.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, margin: "-4px 0 10px" }}>
          {projectOptions.length ? (
            <Select
              mode="multiple"
              allowClear
              showSearch
              size="small"
              placeholder="项目"
              value={projectFilter}
              onChange={setProjectFilter}
              style={filterSelectStyle}
              maxTagCount="responsive"
              optionFilterProp="label"
              options={projectOptions}
            />
          ) : null}
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
            style={filterSelectStyle}
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
              style={filterSelectStyle}
              maxTagCount="responsive"
              options={statusOptions}
            />
          ) : null}
          {priorityOptions.length ? (
            <Select
              mode="multiple"
              allowClear
              size="small"
              placeholder="优先级"
              value={priorityFilter}
              onChange={setPriorityFilter}
              style={filterSelectStyle}
              maxTagCount="responsive"
              options={priorityOptions}
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
          pagination={{ pageSize: 10, size: "small", showSizeChanger: false, showTotal: (total) => `共 ${total} 条工单` }}
          renderItem={(t) => {
            const source = t as TicketWithSource;
            return (
            <List.Item
              className="ops-segment-ticket-item"
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
                      <span style={{ color: "#0f766e", fontWeight: 700 }}>
                        项目：{source.projectName}
                      </span>
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
