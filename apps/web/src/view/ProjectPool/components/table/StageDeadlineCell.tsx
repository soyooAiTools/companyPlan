import dayjs from "dayjs";
import { Button, Space, Tag, Tooltip, Typography } from "antd";
import { EditOutlined } from "@ant-design/icons";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import { deadlineRemain, fmtStageDate, nextStageDeadline, stageDescriptionFallback } from "../../deadlineUtils";

type StageDeadlineCellProps = {
  row: OpsProjectPoolRow;
  onEdit: (row: OpsProjectPoolRow) => void;
};

export default function StageDeadlineCell({ row, onEdit }: StageDeadlineCellProps) {
  const items = Array.isArray(row.stageDeadlines) ? row.stageDeadlines : [];
  const edit = (
    <Tooltip title="计划交付日期">
      <Button
        type="text"
        size="small"
        icon={<EditOutlined style={{ fontSize: 15 }} />}
        style={{ color: "#0f766e" }}
        onClick={(e) => {
          e.stopPropagation();
          onEdit(row);
        }}
      />
    </Tooltip>
  );

  if (!items.length) {
    return (
      <Space size={6}>
        <Typography.Text type="secondary">未设置</Typography.Text>
        {edit}
      </Space>
    );
  }

  const next = nextStageDeadline(row.stage, items);
  if (!next) {
    return (
      <Space size={6}>
        <Typography.Text type="secondary">未设置</Typography.Text>
        {edit}
      </Space>
    );
  }

  const currentDeadlineIndex = items.findIndex((item) => item.name === row.stage || item.key === row.stage);
  const isNextOverdue = !!next.date && dayjs(next.date, "YYYY-MM-DD").isBefore(dayjs(), "day");
  const remain = deadlineRemain(next.date);
  const full = (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 44px", gap: "6px 10px", fontSize: 12, color: "#334155", width: 256, maxWidth: 256 }}>
      {items.map((item, index) => {
        const isCurrent = item.name === row.stage || item.key === row.stage;
        const isNext = item.key === next.key;
        const isPast = currentDeadlineIndex >= 0 && index < currentDeadlineIndex;
        const description = item.description || stageDescriptionFallback[item.key] || "";
        return (
          <div key={item.key} style={{ display: "contents" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, color: isCurrent ? "#1d4ed8" : isNext ? "#0f766e" : isPast ? "#94a3b8" : "#334155", fontWeight: isCurrent || isNext ? 700 : 400 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: isCurrent ? "#3b82f6" : isNext ? "#14b8a6" : isPast ? "#e2e8f0" : "#cbd5e1",
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                {item.name || item.key}
                {description ? <span style={{ marginLeft: 4, color: "#64748b", fontSize: 10, fontWeight: 400 }}>({description})</span> : null}
              </span>
              {isCurrent ? <Tag color="blue" style={{ marginInlineEnd: 0, lineHeight: "16px", fontSize: 11, flexShrink: 0 }}>当前</Tag> : null}
              {!isCurrent && isNext ? <Tag color="green" style={{ marginInlineEnd: 0, lineHeight: "16px", fontSize: 11, flexShrink: 0 }}>下版</Tag> : null}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", color: isCurrent ? "#1d4ed8" : isNext ? "#0f766e" : isPast ? "#94a3b8" : "#0f172a", fontWeight: isCurrent || isNext ? 700 : 600 }}>{fmtStageDate(item.date)}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <Space size={4}>
      <Tooltip
        title={full}
        placement="topLeft"
        color="#fff"
        styles={{
          root: { maxWidth: "none" },
          container: { width: 280, maxWidth: 280, boxShadow: "0 10px 26px rgba(15, 23, 42, 0.16)", border: "1px solid #e2e8f0" },
        }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 220, minWidth: 0 }}>
          <span style={{ color: "#0f172a", fontWeight: 700, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            ({fmtStageDate(next.date)}){next.name || next.key}
          </span>
          {remain ? <span style={{ color: remain.color, fontSize: 13, lineHeight: "18px", fontWeight: isNextOverdue ? 700 : 500, whiteSpace: "nowrap", flexShrink: 0 }}>/ {remain.text}</span> : null}
        </div>
      </Tooltip>
      {edit}
    </Space>
  );
}
