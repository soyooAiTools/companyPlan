import { Input, Modal, Space } from "antd";
import type { OpsProjectPoolRow } from "@/api/modules/ops";

export default function ProjectMetaModal({
	open,
	target,
	customerContact,
	requirementDoc,
	saving,
	onCustomerContactChange,
	onRequirementDocChange,
	onSave,
	onCancel,
}: {
	open: boolean;
	target: OpsProjectPoolRow | null;
	customerContact: string;
	requirementDoc: string;
	saving: boolean;
	onCustomerContactChange: (value: string) => void;
	onRequirementDocChange: (value: string) => void;
	onSave: () => void;
	onCancel: () => void;
}) {
	return (
		<Modal title={`客户信息 · ${target?.name ?? ""}`} open={open} onOk={onSave} confirmLoading={saving} onCancel={onCancel} okText="保存" cancelText="取消" width={560} destroyOnHidden>
			<Space direction="vertical" size={14} style={{ width: "100%" }}>
				<div>
					<div style={{ marginBottom: 6, color: "#334155", fontWeight: 600 }}>客户对接人</div>
					<Input allowClear value={customerContact} placeholder="填写客户侧对接人，例如 zyy-奇美" maxLength={120} onChange={(e) => onCustomerContactChange(e.target.value)} />
				</div>
				<div>
					<div style={{ marginBottom: 6, color: "#334155", fontWeight: 600 }}>需求文档</div>
					<Input allowClear value={requirementDoc} placeholder="填写客户需求文档链接" maxLength={1000} onChange={(e) => onRequirementDocChange(e.target.value)} />
				</div>
			</Space>
		</Modal>
	);
}
