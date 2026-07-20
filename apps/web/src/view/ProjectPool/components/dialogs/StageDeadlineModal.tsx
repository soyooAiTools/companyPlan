import dayjs from "dayjs";
import zhCN from "antd/es/date-picker/locale/zh_CN";
import { Checkbox, DatePicker, Modal, Radio, Space } from "antd";
import type { OpsProjectPoolRow, OpsProjectStageDeadline } from "@/api/modules/ops";
import { stageDeadlineTemplates } from "../../deadlineUtils";
import { STAGE_PLAN_TEMPLATES, type StagePlanTemplateKey } from "../../stagePlanTemplates";

type StageDeadlineModalProps = {
  open: boolean;
  target: OpsProjectPoolRow | null;
  rows: OpsProjectStageDeadline[];
  auto: boolean;
  skipWeekend: boolean;
  templateKey: StagePlanTemplateKey | "";
  saving: boolean;
  onAutoChange: (checked: boolean) => void;
  onSkipWeekendChange: (checked: boolean) => void;
  onTemplateChange: (key: StagePlanTemplateKey) => void;
  onDateChange: (index: number, date: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

const dateRangeDaysText = (rows: OpsProjectStageDeadline[], skipWeekend: boolean) => {
  const start = rows[0]?.date;
  const end = rows[rows.length - 1]?.date;
  if (!start || !end) return "";
  const startDate = dayjs(start, "YYYY-MM-DD");
  const endDate = dayjs(end, "YYYY-MM-DD");
  if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate, "day")) return "";
  let workdayCount = 0;
  let naturalDayCount = 0;
  let cursor = startDate;
  while (!cursor.isAfter(endDate, "day")) {
    naturalDayCount += 1;
    if (cursor.day() !== 0 && cursor.day() !== 6) workdayCount += 1;
    cursor = cursor.add(1, "day");
  }
  const main = skipWeekend ? `${workdayCount} 个工作日` : `${naturalDayCount} 个自然日`;
  const sub = skipWeekend ? `自然日 ${naturalDayCount} 天` : `工作日 ${workdayCount} 天`;
  return `从 ${startDate.format("YYYY-MM-DD")} ～ ${endDate.format("YYYY-MM-DD")}，共 ${main}（${sub}）`;
};

export default function StageDeadlineModal({ open, target, rows, auto, skipWeekend, templateKey, saving, onAutoChange, onSkipWeekendChange, onTemplateChange, onDateChange, onSave, onCancel }: StageDeadlineModalProps) {
  const rangeText = dateRangeDaysText(rows, skipWeekend);
  return (
    <Modal title={`计划交付日期 · ${target?.name ?? ""}`} open={open} onOk={onSave} confirmLoading={saving} onCancel={onCancel} okText="保存" cancelText="取消" width={760} destroyOnHidden>
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
          <Space size={8} style={{ opacity: auto ? 1 : 0.5 }}>
            <span style={{ color: "#64748b", fontSize: 13 }}>开发周期</span>
            <Radio.Group
              disabled={!auto}
              size="small"
              value={templateKey}
              options={STAGE_PLAN_TEMPLATES.map((tpl) => ({ label: tpl.label, value: tpl.key }))}
              onChange={(event) => onTemplateChange(event.target.value)}
            />
          </Space>
        </div>
        {auto ? (
          <div style={{ color: "#d97706", fontSize: 12 }}>
            周期模板按工作日编号推算：资产确认为第 1 个工作日，后续阶段按所选周期固定节点生成。
          </div>
        ) : null}
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
              <DatePicker
                allowClear={false}
                disabled={index > 0}
                locale={zhCN}
                value={item.date ? dayjs(item.date) : null}
                format="YYYY-MM-DD"
                style={{ width: 160 }}
                onClick={(e) => e.stopPropagation()}
                onChange={(date) => onDateChange(index, date ? date.format("YYYY-MM-DD") : "")}
              />
            </div>
          ))}
        </div>
        {rangeText ? <div style={{ color: "#cf1322", fontSize: 14, fontWeight: 700 }}>{rangeText}</div> : null}
      </Space>
    </Modal>
  );
}
