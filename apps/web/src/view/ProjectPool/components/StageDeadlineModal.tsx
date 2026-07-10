import dayjs from "dayjs";
import zhCN from "antd/es/date-picker/locale/zh_CN";
import { Checkbox, DatePicker, InputNumber, Modal, Space } from "antd";
import type { OpsProjectPoolRow, OpsProjectStageDeadline } from "@/api/modules/ops";
import { stageDeadlineTemplates } from "../deadlineUtils";

type StageDeadlineModalProps = {
  open: boolean;
  target: OpsProjectPoolRow | null;
  rows: OpsProjectStageDeadline[];
  auto: boolean;
  skipWeekend: boolean;
  intervals: number[];
  saving: boolean;
  onAutoChange: (checked: boolean) => void;
  onSkipWeekendChange: (checked: boolean) => void;
  onIntervalChange: (index: number, value: number | string | null) => void;
  onDateChange: (index: number, date: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export default function StageDeadlineModal({ open, target, rows, auto, skipWeekend, intervals, saving, onAutoChange, onSkipWeekendChange, onIntervalChange, onDateChange, onSave, onCancel }: StageDeadlineModalProps) {
  return (
    <Modal title={`校准计划交付日期 · ${target?.name ?? ""}`} open={open} onOk={onSave} confirmLoading={saving} onCancel={onCancel} okText="保存" cancelText="取消" width={760} destroyOnHidden>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {auto ? (
          <div style={{ color: "#cf1322", fontSize: 15, fontWeight: 700 }}>
            填写 <span style={{ fontWeight: 800 }}>【资产确认】</span> 时间后自动推算后续交付时间
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Space size={14}>
            <Checkbox checked={auto} onChange={(e) => onAutoChange(e.target.checked)}>
              自动推断时间
            </Checkbox>
            <Checkbox checked={skipWeekend} disabled={!auto} onChange={(e) => onSkipWeekendChange(e.target.checked)}>
              排除周末
            </Checkbox>
          </Space>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: 8, alignItems: "center" }}>
            {stageDeadlineTemplates.slice(1).map((tpl, index) => (
              <span key={tpl.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#64748b", fontSize: 12 }}>
                {tpl.name}
                <InputNumber min={0} size="small" value={intervals[index]} controls={false} style={{ width: 44 }} onClick={(e) => e.stopPropagation()} onChange={(v) => onIntervalChange(index, v)} />
                天
              </span>
            ))}
          </div>
        </div>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
          {rows.map((item, index) => (
            <div
              key={item.key}
              style={{
                display: "grid",
                gridTemplateColumns: "34px minmax(190px, 1fr) 170px",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderTop: index ? "1px solid #e2e8f0" : "none",
                background: index % 2 ? "#fff" : "#f8fafc",
              }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#eef2ff",
                  color: "#4f46e5",
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                {index + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{item.name}</span>
                {item.description ? <span style={{ marginLeft: 6, color: "#cf1322", fontSize: 12 }}>({item.description})</span> : null}
                <div style={{ marginTop: 3, color: "#64748b", fontSize: 12 }}>
                  {index === 0 ? "资产确认结果交付客户" : `${stageDeadlineTemplates[index - 1].name} → ${item.name}`}
                </div>
              </div>
              <DatePicker allowClear={false} locale={zhCN} value={item.date ? dayjs(item.date) : null} format="YYYY-MM-DD" style={{ width: 160 }} onClick={(e) => e.stopPropagation()} onChange={(date) => onDateChange(index, date ? date.format("YYYY-MM-DD") : "")} />
            </div>
          ))}
        </div>
      </Space>
    </Modal>
  );
}
