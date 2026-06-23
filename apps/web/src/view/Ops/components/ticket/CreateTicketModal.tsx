import { Avatar, Col, Form, Input, Modal, Row, Select, Space } from "antd";
import type { FormInstance } from "antd";
import type { OpsProject, OpsResponsibleSegment, OpsTenant } from "../../../../api/modules/ops";
import RichTextEditor from "../../RichTextEditor";
import { PRIORITIES } from "../../opsTickets.constants";

type OwnerOption = {
	value: string;
	label: string;
	avatar: string;
	wechatName: string;
	name: string;
	username: string;
};

type CreateTicketModalProps = {
	open: boolean;
	submitting: boolean;
	form: FormInstance;
	tenants: OpsTenant[];
	projects: OpsProject[];
	segments: OpsResponsibleSegment[];
	ownerOptions: OwnerOption[];
	selectedProjectId?: string;
	onTenantChange: (tenantId: string) => void;
	onProjectChange: (projectId: string) => void;
	onSegmentChange: () => void;
	onOwnerChange: (ownerId?: string) => void;
	onSubmit: () => void;
	onCancel: () => void;
};

export default function CreateTicketModal({
	open,
	submitting,
	form,
	tenants,
	projects,
	segments,
	ownerOptions,
	selectedProjectId,
	onTenantChange,
	onProjectChange,
	onSegmentChange,
	onOwnerChange,
	onSubmit,
	onCancel,
}: CreateTicketModalProps) {
	return (
		<Modal
			title="新建工单"
			cancelText="取消"
			open={open}
			onOk={onSubmit}
			confirmLoading={submitting}
			onCancel={onCancel}
			okText="提交"
			width={860}
			destroyOnHidden
			keyboard={false}
			maskClosable={false}>
			<Form form={form} layout="vertical" preserve={false}>
				<Row gutter={16}>
					<Col span={16}>
						<Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
							<Input maxLength={160} placeholder="需求标题" />
						</Form.Item>
					</Col>
					<Col span={8}>
						<Form.Item name="priority" label="优先级" initialValue="普通">
							<Select allowClear options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
						</Form.Item>
					</Col>
					<Col span={12}>
						<Form.Item name="tenantId" label="所属项目(客户)" rules={[{ required: true, message: "请选择客户" }]}>
							<Select allowClear showSearch optionFilterProp="label" placeholder="选择客户" options={tenants.map((t) => ({ value: t.id, label: t.name }))} onChange={onTenantChange} />
						</Form.Item>
					</Col>
					<Col span={12}>
						<Form.Item name="projectId" label="项目名称" rules={[{ required: true, message: "请选择项目" }]}>
							<Select allowClear showSearch optionFilterProp="label" placeholder="先选客户" options={projects.map((p) => ({ value: p.id, label: p.name }))} onChange={onProjectChange} />
						</Form.Item>
					</Col>
					<Col span={12}>
						<Form.Item name="segmentId" label="环节" rules={[{ required: true, message: "请选择环节" }]}>
							<Select allowClear showSearch optionFilterProp="label" placeholder="不选则按负责人带出" options={segments.map((s) => ({ value: s.id, label: s.name }))} notFoundContent="该项目暂无可分配的环节" onChange={onSegmentChange} />
						</Form.Item>
					</Col>
					<Col span={12}>
						<Form.Item name="ownerId" label="负责人" rules={[{ required: true, message: "请选择负责人" }]}>
							<Select
								allowClear
								showSearch
								placeholder="选负责人(环节自动带出)"
								options={ownerOptions}
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
									</Space>
								)}
								notFoundContent="该项目暂无可分配成员"
								onChange={onOwnerChange}
							/>
						</Form.Item>
					</Col>
					<Col span={24}>
						<Form.Item name="contentHtml" label="需求说明">
							<RichTextEditor projectId={selectedProjectId} />
						</Form.Item>
					</Col>
				</Row>
			</Form>
		</Modal>
	);
}
