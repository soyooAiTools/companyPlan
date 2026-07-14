import { Empty, List, Modal, Space, Tag } from "antd";
import type { OpsProjectPoolRow } from "@/api/modules/ops";
import { deadlineRemain, fmtStageDate, isNextDeadlineOverdue, nextStageDeadline, stageDeadlineName } from "../../deadlineUtils";

type DeadlineOverdueProjectsModalProps = {
	open: boolean;
	title: string;
	rows: OpsProjectPoolRow[];
	onCancel: () => void;
};

export default function DeadlineOverdueProjectsModal({ open, title, rows, onCancel }: DeadlineOverdueProjectsModalProps) {
	const overdueRows = rows.filter(isNextDeadlineOverdue);

	return (
		<Modal title={title} open={open} onCancel={onCancel} footer={null} width={760} keyboard={false}>
			<style>{`
				.ops-deadline-overdue-project-item {
					border-radius: 6px;
					padding: 7px 10px !important;
					margin: 4px 0;
					transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
					transform-origin: center;
				}
				.ops-deadline-overdue-project-item:hover {
					background: #f8fafc;
					box-shadow: 0 8px 22px rgba(15, 23, 42, 0.10);
					transform: scale(1.012);
					z-index: 1;
				}
			`}</style>
			{overdueRows.length ? (
				<List
					dataSource={overdueRows}
					pagination={{ pageSize: 10, size: "small", showSizeChanger: false, showTotal: (total) => `共 ${total} 个项目` }}
					renderItem={(row) => {
						const deadline = nextStageDeadline(row.stage, Array.isArray(row.stageDeadlines) ? row.stageDeadlines : []);
						const remain = deadlineRemain(deadline?.date);
						return (
							<List.Item className="ops-deadline-overdue-project-item">
								<div style={{ width: "100%", minWidth: 0 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
										{row.plannerName ? <span style={{ color: "#0f172a", fontWeight: 700, flexShrink: 0 }}>策划:{row.plannerName} -</span> : null}
										<span style={{ color: "#0f172a", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
										{row.tenantName ? <span style={{ color: "#64748b", flexShrink: 0 }}>- {row.tenantName}</span> : null}
									</div>
									<Space size={8} wrap style={{ marginTop: 6, fontSize: 12 }}>
										<Tag color="blue" style={{ marginInlineEnd: 0 }}>当前:{row.stage || "未设置"}</Tag>
										<Tag style={{ marginInlineEnd: 0, color: "#c2410c", background: "#ffedd5", borderColor: "#fed7aa" }}>
											下版:{deadline ? `${fmtStageDate(deadline.date)} ${stageDeadlineName(deadline)}` : "未设置"}
										</Tag>
										{remain ? <span style={{ color: remain.color, fontWeight: 700 }}>{remain.text}</span> : null}
									</Space>
								</div>
							</List.Item>
						);
					}}
				/>
			) : (
				<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无交付逾期项目" />
			)}
		</Modal>
	);
}
