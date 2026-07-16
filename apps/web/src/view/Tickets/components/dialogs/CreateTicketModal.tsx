import { useEffect, useState } from "react";
import { Avatar, Button, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Spin, Tooltip } from "antd";
import { CopyOutlined, DeleteOutlined, ExclamationCircleFilled, PlusOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd";
import type { OpsProject, OpsResponsibleMember, OpsResponsibleSegment, OpsTenant } from "../../../../api/modules/ops";
import RichTextEditor from "../../../Ops/RichTextEditor";
import { PRIORITIES } from "../../constants";

type OwnerOption = {
	value: string;
	label: string;
	avatar: string;
	wechatName: string;
	name: string;
	username: string;
	segmentNames?: string[];
};

type TicketDraft = {
	title?: string;
	segmentId?: number;
	ownerId?: string;
	contentHtml?: string;
};

type CreateTicketModalProps = {
	open: boolean;
	submitting: boolean;
	form: FormInstance;
	tenants: OpsTenant[];
	projects: OpsProject[];
	projectsLoading?: boolean;
	segments: OpsResponsibleSegment[];
	members: OpsResponsibleMember[];
	selectedProjectId?: string;
	invalidTaskIndex?: number | null;
	onTenantChange: (tenantId?: string) => void;
	onProjectChange: (projectId?: string) => void;
	onSubmit: () => void;
	onCancel: () => void;
};

export default function CreateTicketModal({
	open,
	submitting,
	form,
	tenants,
	projects,
	projectsLoading = false,
	segments,
	members,
	selectedProjectId,
	invalidTaskIndex,
	onTenantChange,
	onProjectChange,
	onSubmit,
	onCancel,
}: CreateTicketModalProps) {
	const tickets = (Form.useWatch("tickets", form) || []) as TicketDraft[];
	const [activeIndex, setActiveIndex] = useState(0);
	const segNameById = new Map(segments.map((s) => [s.id, s.name]));
	const memberById = new Map(members.map((m) => [m.id, m]));
	useEffect(() => {
		if (!open) return;
		setActiveIndex(0);
	}, [open]);
	useEffect(() => {
		if (typeof invalidTaskIndex === "number" && invalidTaskIndex >= 0) setActiveIndex(invalidTaskIndex);
	}, [invalidTaskIndex]);
	const toOwnerOption = (m: OpsResponsibleMember): OwnerOption => ({
		value: m.id,
		label: m.wechatName ? `${m.wechatName}｜${m.name || m.username}` : m.name || m.username,
		avatar: m.wechatAvatar || "",
		wechatName: m.wechatName || "",
		name: m.name || m.username,
		username: m.username,
		segmentNames: (m.segmentIds || []).map((id) => segNameById.get(id)).filter(Boolean) as string[],
	});
	const ownerOptionsFor = (segmentId?: number) => {
		if (segmentId) return (segments.find((s) => s.id === segmentId)?.members ?? []).map(toOwnerOption);
		return (members ?? []).map(toOwnerOption);
	};
	const fillSegmentByOwner = (index: number, ownerId?: string) => {
		if (!ownerId || tickets[index]?.segmentId) return;
		const segId = members.find((x) => x.id === ownerId)?.segmentIds?.[0];
		if (segId != null) form.setFieldValue(["tickets", index, "segmentId"], segId);
	};
	const hasTaskDraft = (draft?: TicketDraft) =>
		Boolean(String(draft?.title || "").trim() || draft?.segmentId != null || String(draft?.ownerId || "").trim() || String(draft?.contentHtml || "").replace(/<[^>]+>/g, "").trim());
	const isTaskComplete = (draft?: TicketDraft) => Boolean(String(draft?.title || "").trim() && draft?.segmentId != null && String(draft?.ownerId || "").trim());
	const removeTask = (remove: (index: number | number[]) => void, index: number) => {
		remove(index);
		setActiveIndex(Math.max(0, index - 1));
	};
	const copyTask = (add: (defaultValue?: TicketDraft, insertIndex?: number) => void, index: number) => {
		const draft = tickets[index] || {};
		const nextIndex = index + 1;
		add(
			{
				title: draft.title,
				contentHtml: draft.contentHtml,
				segmentId: undefined,
				ownerId: undefined,
			},
			nextIndex,
		);
		setActiveIndex(nextIndex);
	};

	return (
		<Modal
			title="新建工单"
			cancelText="取消"
			open={open}
			onOk={onSubmit}
			confirmLoading={submitting}
			onCancel={onCancel}
			okText="提交"
			width={980}
			destroyOnHidden
			keyboard={false}
			mask={{ closable: false }}>
			<Form form={form} layout="vertical" preserve initialValues={{ priority: "普通", tickets: [{}] }}>
				<style>{`.ops-create-ticket-title-item .ant-form-item-label > label { width: 100%; } .ops-create-ticket-title-item .ant-form-item-label > label::after { display: none; }`}</style>
				<Row gutter={16}>
					<Col span={8}>
						<Form.Item name="tenantId" label="客户" rules={[{ required: true, message: "请选择客户" }]}>
							<Select allowClear showSearch optionFilterProp="label" placeholder="选择客户" options={tenants.map((t) => ({ value: t.id, label: t.name }))} onChange={onTenantChange} />
						</Form.Item>
					</Col>
					<Col span={8}>
						<Form.Item name="projectId" label="项目名称" rules={[{ required: true, message: "请选择项目" }]}>
							<Select
								allowClear
								showSearch
								loading={projectsLoading}
								optionFilterProp="label"
								placeholder="先选客户"
								notFoundContent={projectsLoading ? <Spin size="small" /> : "暂无项目"}
								options={projects.map((p) => ({ value: p.id, label: p.name }))}
								onChange={onProjectChange}
							/>
						</Form.Item>
					</Col>
					<Col span={8}>
						<Form.Item name="priority" label="优先级">
							<Select allowClear options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
						</Form.Item>
					</Col>
				</Row>
				<div style={{ borderTop: "1px dashed #cbd5e1", margin: "2px 0 12px" }} />

				<Form.List name="tickets">
					{(fields, { add, remove }) => {
						const visibleIndex = Math.min(activeIndex, Math.max(fields.length - 1, 0));
							return (
								<div style={{ width: "100%" }}>
								<div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0 8px", color: "#dc2626", fontSize: 13, fontWeight: 600 }}>
									<ExclamationCircleFilled style={{ color: "#f59e0b", fontSize: 14 }} />
									<span>支持一次给多人提单：每个工单可单独填写标题、环节、负责人和需求说明。</span>
								</div>
								<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 0 0", marginBottom: 8 }}>
								{fields.map((field, index) => {
									const draft = tickets[index] || {};
									const owner = draft.ownerId ? memberById.get(draft.ownerId) : undefined;
										const ownerName = owner?.name || owner?.username || `工单 ${index + 1}`;
										const ownerAvatar = owner?.wechatAvatar || "";
										const segmentName = draft.segmentId ? segNameById.get(draft.segmentId) : "未选环节";
										const completed = isTaskComplete(draft);
										const incomplete = !completed;
											const active = index === visibleIndex;
									return (
										<div
											key={field.key}
											role="button"
											tabIndex={0}
											onClick={() => setActiveIndex(index)}
											onKeyDown={(event) => {
												if (event.key === "Enter" || event.key === " ") setActiveIndex(index);
											}}
											style={{
												position: "relative",
												display: "inline-flex",
												alignItems: "center",
												gap: 8,
												height: 48,
												minWidth: 150,
													border: `1px solid ${incomplete ? "#ef4444" : active ? "#0f766e" : "#dbe3ec"}`,
													borderRadius: 8,
													background: active ? "#ecfdf5" : "#f8fafc",
													color: active ? "#0f766e" : "#475569",
													padding: "0 10px",
													cursor: "pointer",
													fontWeight: active ? 700 : 500,
													transform: active ? "scale(1.06)" : "scale(1)",
													transformOrigin: "center",
													transition: "transform 120ms ease, border-color 120ms ease, background 120ms ease",
													zIndex: active ? 2 : 1,
												}}>
												<Avatar size={28} src={ownerAvatar || undefined} style={{ flex: "none", background: "#e2e8f0", color: "#475569", fontSize: 12 }}>
													{owner ? ownerName.slice(0, 1) : null}
												</Avatar>
												<span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
													<span style={{ maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: "18px" }}>{ownerName}</span>
													<span style={{ maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#64748b", fontSize: 12, fontWeight: 400, lineHeight: "16px" }}>{segmentName}</span>
												</span>
												{active ? (
													<span
														style={{
															position: "absolute",
															left: "50%",
															bottom: 0,
															width: 0,
															height: 0,
															borderLeft: "6px solid transparent",
															borderRight: "6px solid transparent",
															borderBottom: "6px solid #0f766e",
															transform: "translateX(-50%)",
														}}
													/>
												) : null}
											</div>
									);
								})}
									<Button
										icon={<PlusOutlined />}
										disabled={fields.length >= 20}
										style={{ height: 48, minWidth: 70, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
										onClick={() => {
											add({});
											setActiveIndex(fields.length);
										}}>
										<span style={{ display: "inline-flex", flexDirection: "column", lineHeight: "16px" }}>
											<span>添加</span>
											<span>任务</span>
										</span>
									</Button>
							</div>
								{fields.map((field, index) => {
									const segmentId = tickets[index]?.segmentId;
									return (
										<div
											key={field.key}
											style={{
												display: index === visibleIndex ? "block" : "none",
												border: "1px solid #e2e8f0",
												borderRadius: 8,
												padding: "12px 14px 14px",
												background: "#fff",
											}}>
											<Row gutter={12}>
												<Col span={24}>
													<Form.Item
														className="ops-create-ticket-title-item"
														name={[field.name, "title"]}
														label={
															<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
																<span>标题</span>
																<span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
																	<Tooltip title="复制此工单">
																		<Button
																			size="small"
																			type="text"
																			htmlType="button"
																			disabled={fields.length >= 20}
																			icon={<CopyOutlined style={{ fontSize: 16 }} />}
																			style={{ width: 28, height: 24 }}
																			onClick={() => copyTask(add, field.name)}
																		/>
																	</Tooltip>
																	{fields.length > 1 ? (
																		hasTaskDraft(tickets[index]) ? (
																			<Popconfirm title="删除这条任务？" description="已填写内容，删除后不会保存。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => removeTask(remove, field.name)}>
																				<Button size="small" type="text" htmlType="button" danger icon={<DeleteOutlined style={{ fontSize: 16 }} />} style={{ width: 28, height: 24 }} />
																			</Popconfirm>
																		) : (
																			<Button
																				size="small"
																				type="text"
																				htmlType="button"
																				danger
																				icon={<DeleteOutlined style={{ fontSize: 16 }} />}
																				style={{ width: 28, height: 24 }}
																				onClick={() => removeTask(remove, field.name)}
																			/>
																		)
																	) : null}
																</span>
															</div>
														}
														rules={[{ required: true, message: "请输入标题" }]}>
														<Input maxLength={160} placeholder="输入标题" />
													</Form.Item>
												</Col>
											<Col span={10}>
												<Form.Item name={[field.name, "segmentId"]} label="环节" rules={[{ required: true, message: "请选择环节" }]}>
													<Select
														allowClear
														showSearch
														optionFilterProp="label"
														placeholder="选择环节"
														options={segments.map((s) => ({ value: s.id, label: s.name }))}
														notFoundContent="该项目暂无可分配的环节"
														onChange={() => form.setFieldValue(["tickets", field.name, "ownerId"], undefined)}
													/>
												</Form.Item>
											</Col>
											<Col span={14}>
												<Form.Item name={[field.name, "ownerId"]} label="负责人" rules={[{ required: true, message: "请选择负责人" }]}>
													<Select
														allowClear
														showSearch
														placeholder="选负责人"
														options={ownerOptionsFor(segmentId)}
														filterOption={(input, option) => {
															const kw = input.trim().toLowerCase();
															return [option?.wechatName, option?.name, option?.username].some((s) =>
																String(s ?? "")
																	.toLowerCase()
																	.includes(kw),
															);
														}}
														optionRender={(opt) => (
															<Space size={6}>
																<Avatar size={22} src={opt.data?.avatar || undefined} style={{ flex: "none", background: "#e2e8f0", color: "#475569", fontSize: 12 }}>
																	{(opt.data?.name || "?").slice(0, 1)}
																</Avatar>
																{opt.data?.wechatName ? <span style={{ color: "#64748b" }}>{opt.data.wechatName}</span> : null}
																{opt.data?.wechatName ? <span style={{ color: "#cbd5e1" }}>｜</span> : null}
																<span>{opt.data?.name}</span>
																{opt.data?.segmentNames?.length ? (
																	<>
																		<span style={{ color: "#cbd5e1" }}>｜</span>
																		<span style={{ color: "#0f766e" }}>{opt.data.segmentNames.join("、")}</span>
																	</>
																) : null}
															</Space>
														)}
														notFoundContent={selectedProjectId ? "该环节暂无可分配成员" : "请先选择项目"}
														onChange={(ownerId) => fillSegmentByOwner(field.name, ownerId)}
													/>
												</Form.Item>
											</Col>
											<Col span={24}>
												<Form.Item name={[field.name, "contentHtml"]} label="需求说明">
													<RichTextEditor projectId={selectedProjectId} />
												</Form.Item>
											</Col>
										</Row>
									</div>
								);
							})}
							</div>
						);
					}}
				</Form.List>
			</Form>
		</Modal>
	);
}
