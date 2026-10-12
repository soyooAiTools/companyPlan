import { useEffect, useState } from "react";
import { Button, Checkbox, Space, Typography } from "antd";
import type { OpsPlayableFeedbackCompletion, OpsTicket } from "../../../../api/modules/ops";

type Props = {
	ticket: OpsTicket;
	completion: OpsPlayableFeedbackCompletion | null;
	onSave: (ids: string[], expectedRevision: string) => Promise<void>;
	onDirtyChange: (dirty: boolean) => void;
};

export default function TicketPlayableFeedbackCompletionPanel({ ticket, completion, onSave, onDirtyChange }: Props) {
	const [selected, setSelected] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);
	useEffect(() => setSelected(completion?.items.filter((item) => item.completed).map((item) => item.feedbackId) || []), [completion]);
	const saved = completion?.items.filter((item) => item.completed).map((item) => item.feedbackId) || [];
	const savedSet = new Set(saved);
	const selectedSet = new Set(selected);
	const changedCount = completion?.items.filter((item) => savedSet.has(item.feedbackId) !== selectedSet.has(item.feedbackId)).length || 0;
	const dirty = changedCount > 0;
	useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
	if (!completion?.items.length) return null;
	const editable = ticket.canEdit && ticket.status !== "已完成";
	const all = completion.items.every((item) => selectedSet.has(item.feedbackId));
	const save = async () => {
		setSaving(true);
		try { await onSave(selected, completion.revision); } finally { setSaving(false); }
	};
	return (
		<div style={{ width: "100%" }}>
			<div style={{ display: "grid", gap: 10 }}>
				{completion.items.map((item) => (
					<Checkbox
						key={item.feedbackId}
						disabled={!editable}
						checked={selectedSet.has(item.feedbackId)}
						onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, item.feedbackId])] : current.filter((id) => id !== item.feedbackId))}
					>
						<span style={{ fontWeight: 600 }}>{item.displayOrder}. {item.feedbackText || "未填写需求说明"}</span>
					</Checkbox>
				))}
			</div>
			{editable ? (
				<div style={{ position: "sticky", bottom: 0, zIndex: 2, marginTop: 14, padding: "10px 0", background: "#fff", borderTop: "1px solid #f0f0f0", boxShadow: "0 -8px 16px rgba(15, 23, 42, 0.06)" }}>
					<Space wrap>
						<Checkbox checked={all} indeterminate={!all && selected.length > 0} onChange={(event) => setSelected(event.target.checked ? completion.items.map((item) => item.feedbackId) : [])}>全选</Checkbox>
						{dirty ? (
							<>
								<Button type="primary" loading={saving} onClick={save}>完成所选标记（{changedCount}）</Button>
								<Button disabled={saving} onClick={() => setSelected(saved)}>取消</Button>
							</>
						) : null}
					</Space>
				</div>
			) : null}
			{!editable ? <div style={{ marginTop: 10 }}><Typography.Text type="secondary">{ticket.status === "已完成" ? "已完成工单请先重新打开后再修改。" : "当前账号仅可查看。"}</Typography.Text></div> : null}
		</div>
	);
}
