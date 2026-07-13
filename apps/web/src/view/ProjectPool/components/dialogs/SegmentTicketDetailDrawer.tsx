import { useState } from "react";
import type { MouseEvent } from "react";
import { Avatar, Descriptions, Divider, Drawer, Image, Space, Spin, Tag, Timeline, Typography } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import type { OpsTicket, OpsTicketEvent } from "@/api/modules/ops";
import { fmtDateTime } from "@/utils/format";
import { remainingView } from "@/view/Ops/ticketUtils";
import "../../../Ops/RichText.css";

type SegmentTicketDetailDrawerProps = {
	open: boolean;
	ticket: OpsTicket | null;
	events: OpsTicketEvent[];
	loading: boolean;
	onClose: () => void;
};

function Person({ avatar, name }: { avatar?: string; name?: string }) {
	return (
		<Space size={6}>
			<Avatar size={22} src={avatar || undefined} style={{ background: "#e2e8f0", color: "#475569", fontSize: 11 }}>
				{(name || "?").slice(0, 1)}
			</Avatar>
			<span>{name || "-"}</span>
		</Space>
	);
}

function InlineRichContent({ html }: { html?: string | null }) {
	const [previewSrc, setPreviewSrc] = useState("");
	const [previewOpen, setPreviewOpen] = useState(false);
	if (!html) return null;
	const onContentClick = (e: MouseEvent<HTMLDivElement>) => {
		const t = e.target as HTMLElement;
		if (t.tagName !== "IMG") return;
		const src = (t as HTMLImageElement).currentSrc || (t as HTMLImageElement).src;
		if (!src) return;
		setPreviewSrc(src);
		setPreviewOpen(true);
	};
	return (
		<>
			<style>{`
				.pool-ticket-content img { max-width: 100%; height: auto; border-radius: 6px; cursor: zoom-in; }
				.pool-ticket-content video { max-width: 100%; height: auto; border-radius: 6px; }
			`}</style>
			<div className="ops-rich pool-ticket-content" onClick={onContentClick} dangerouslySetInnerHTML={{ __html: html }} />
			<Image style={{ display: "none" }} src={previewSrc} preview={{ visible: previewOpen, src: previewSrc, onVisibleChange: (v) => setPreviewOpen(v) }} />
		</>
	);
}

export default function SegmentTicketDetailDrawer({ open, ticket, events, loading, onClose }: SegmentTicketDetailDrawerProps) {
	const remain = ticket ? remainingView(ticket) : null;
	return (
		<Drawer title={ticket?.title || "工单详情"} open={open} onClose={onClose} width={560} destroyOnHidden>
			{loading ? (
				<div style={{ textAlign: "center", padding: "80px 0" }}>
					<Spin />
				</div>
			) : ticket ? (
				<>
					<Space size={8} wrap style={{ marginBottom: 14 }}>
						<Person avatar={ticket.requesterAvatar} name={ticket.requesterName} />
						<ArrowRightOutlined style={{ color: "#94a3b8", fontSize: 12 }} />
						<Person avatar={ticket.ownerAvatar} name={ticket.ownerName} />
						<Tag style={{ marginInlineStart: 4 }}>{ticket.status}</Tag>
						<Tag color={ticket.priority === "紧急" ? "red" : ticket.priority === "优先" ? "orange" : "default"}>{ticket.priority}</Tag>
					</Space>

					<Descriptions column={1} size="small" bordered>
						<Descriptions.Item label="单号">
							<Typography.Text copyable={{ text: ticket.id }} style={{ fontFamily: "monospace", fontSize: 12 }}>
								{ticket.id}
							</Typography.Text>
						</Descriptions.Item>
						<Descriptions.Item label="客户">{ticket.client}</Descriptions.Item>
						<Descriptions.Item label="项目">{ticket.projectName}</Descriptions.Item>
						<Descriptions.Item label="环节">
							<Tag color="cyan">{ticket.tagName}</Tag>
						</Descriptions.Item>
						<Descriptions.Item label="提单时间">{fmtDateTime(ticket.createdAt)}</Descriptions.Item>
						<Descriptions.Item label="剩余时间">
							<span style={{ color: remain?.color }}>{remain?.text || "-"}</span>
						</Descriptions.Item>
						{ticket.status === "阻塞" && ticket.blockReason ? <Descriptions.Item label="阻塞原因">{ticket.blockReason}</Descriptions.Item> : null}
					</Descriptions>

					<Divider style={{ margin: "18px 0 14px" }} />
					<Typography.Title level={5} style={{ marginTop: 0 }}>
						需求说明
					</Typography.Title>
					<div style={{ marginTop: 10, marginBottom: 20 }}>
						{ticket.contentHtml ? (
							<InlineRichContent html={ticket.contentHtml} />
						) : ticket.summary || ticket.hyperlink ? (
							<div className="ops-rich">
								{ticket.summary ? <div className="whitespace-pre-wrap">{ticket.summary}</div> : null}
								{ticket.hyperlink ? (
									<div style={{ marginTop: 8 }}>
										<a href={ticket.hyperlink} target="_blank" rel="noreferrer">
											{ticket.hyperlink}
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
							items={events.map((e) => ({
								color: e.toStatus === "阻塞" ? "red" : e.toStatus === "已完成" ? "green" : "blue",
								children: (
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
			) : null}
		</Drawer>
	);
}
