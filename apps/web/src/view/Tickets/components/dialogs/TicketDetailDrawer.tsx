import type { ReactNode } from "react";
import { Button, Descriptions, Divider, Drawer, Space, Spin, Tag, Timeline, Typography } from "antd";
import { EditOutlined } from "@ant-design/icons";
import type { OpsTicket, OpsTicketEvent } from "../../../../api/modules/ops";
import RichContentView from "../../../../components/RichContentView";
import { fmtDateTime } from "../../../../utils/format";
import { remainingView } from "../../ticketUtils";

type TicketDetailDrawerProps = {
	detail: OpsTicket | null;
	loading: boolean;
	events: OpsTicketEvent[];
	statusControl: (ticket: OpsTicket, width?: number | string) => ReactNode;
	priorityControl: (ticket: OpsTicket, width?: number | string) => ReactNode;
	personCell: (avatar?: string, name?: string) => ReactNode;
	onClose: () => void;
	onAssign: () => void;
	onEditContent: () => void;
};

export default function TicketDetailDrawer({ detail, loading, events, statusControl, priorityControl, personCell, onClose, onAssign, onEditContent }: TicketDetailDrawerProps) {
	return (
		<Drawer title={detail?.title} open={!!detail} onClose={onClose} size={480} destroyOnHidden>
			{detail &&
				(loading ? (
					<div style={{ textAlign: "center", padding: "80px 0" }}>
						<Spin />
					</div>
				) : (
					<>
						<Space style={{ marginBottom: 12 }}>
							<span>状态:</span>
							{statusControl(detail, 130)}
						</Space>
						<Descriptions column={1} size="small" bordered>
							<Descriptions.Item label="单号">
								<Typography.Text copyable={{ text: detail.id }} style={{ fontFamily: "monospace", fontSize: 12 }}>
									{detail.id}
								</Typography.Text>
							</Descriptions.Item>
							<Descriptions.Item label="客户">{detail.client}</Descriptions.Item>
							<Descriptions.Item label="项目">{detail.projectName}</Descriptions.Item>
							<Descriptions.Item label="环节">
								<Tag color="cyan">{detail.tagName}</Tag>
							</Descriptions.Item>
							<Descriptions.Item label="提单人">{personCell(detail.requesterAvatar, detail.requesterName)}</Descriptions.Item>
							<Descriptions.Item label="负责人">
								{personCell(detail.ownerAvatar, detail.ownerName)}
								{detail.canAssign ? (
									<Button size="small" type="link" style={{ paddingLeft: 8 }} onClick={onAssign}>
										指派
									</Button>
								) : null}
							</Descriptions.Item>
							<Descriptions.Item label="优先级">
								{priorityControl(detail, 130)}
							</Descriptions.Item>
							<Descriptions.Item label="提单时间">{fmtDateTime(detail.createdAt)}</Descriptions.Item>
							<Descriptions.Item label="剩余时间">
								{(() => {
									const x = remainingView(detail);
									return <span style={{ color: x.color }}>{x.text}</span>;
								})()}
							</Descriptions.Item>
							{detail.status === "阻塞" && detail.blockReason ? <Descriptions.Item label="阻塞原因">{detail.blockReason}</Descriptions.Item> : null}
						</Descriptions>

						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
							<Typography.Title level={5} style={{ margin: 0 }}>
								需求说明
							</Typography.Title>
							{detail.canEditContent && detail.status !== "已完成" ? (
								<Button size="small" icon={<EditOutlined />} onClick={onEditContent}>
									编辑
								</Button>
							) : null}
						</div>
						<div style={{ marginTop: 10, marginBottom: 20 }}>
							{detail.contentHtml ? (
								<RichContentView html={detail.contentHtml} textViewable linkText="点击查看需求(含图片/视频)" modalTitle={`需求说明 · ${detail.title}`} modalWidth={900} inlineClassName="text-sm leading-relaxed font-bold" />
							) : detail.summary || detail.hyperlink ? (
								<div className="text-sm leading-relaxed font-bold">
									{detail.summary ? <div className="whitespace-pre-wrap">{detail.summary}</div> : null}
									{detail.hyperlink ? (
										<div className="mt-2">
											<a href={detail.hyperlink} target="_blank" rel="noreferrer">
												{detail.hyperlink}
											</a>
										</div>
									) : null}
								</div>
							) : (
								<Typography.Text type="secondary">空</Typography.Text>
							)}
						</div>

						<Divider style={{ margin: "8px 0 16px" }} />
						<Typography.Title level={5} style={{ marginTop: 0 }}>
							流转记录
						</Typography.Title>
						{events.length ? (
							<Timeline
								items={[...events].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id)).map((e) => ({
									color: e.toStatus === "阻塞" ? "red" : e.toStatus === "已完成" ? "green" : "blue",
									content: (
										<div>
											<span style={{ fontWeight: 600 }}>{e.actorName || "系统"}</span> {e.action}
											{e.fromStatus && e.toStatus ? (
												<span style={{ color: "#64748b" }}>
													,状态「{e.fromStatus}」→「{e.toStatus}」
												</span>
											) : e.toStatus ? (
												<span style={{ color: "#64748b" }}>,状态「{e.toStatus}」</span>
											) : null}
											{e.note ? <div style={{ color: "#475569" }}>备注:{e.note}</div> : null}
											<div style={{ color: "#94a3b8", fontSize: 12 }}>{fmtDateTime(e.createdAt)}</div>
										</div>
									),
								}))}
							/>
						) : (
							<Typography.Text type="secondary">暂无记录</Typography.Text>
						)}
					</>
				))}
		</Drawer>
	);
}
