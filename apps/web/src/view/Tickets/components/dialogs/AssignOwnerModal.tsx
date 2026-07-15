import { Avatar, Modal, Select, Space } from "antd";

export type AssignOwnerCandidate = {
	id: string;
	name: string;
	username: string;
	avatar: string;
	wechatName: string;
	segmentNames?: string[];
	status: string;
};

type AssignOwnerModalProps = {
	open: boolean;
	candidates: AssignOwnerCandidate[];
	ownerId: string;
	assigning: boolean;
	onOwnerChange: (ownerId: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
};

export default function AssignOwnerModal({ open, candidates, ownerId, assigning, onOwnerChange, onConfirm, onCancel }: AssignOwnerModalProps) {
	return (
		<Modal title="指派负责人" open={open} onOk={onConfirm} confirmLoading={assigning} onCancel={onCancel} okText="指派" cancelText="取消" destroyOnHidden>
			<Select
				style={{ width: "100%" }}
				placeholder="选择该项目的成员"
				value={ownerId || undefined}
				onChange={onOwnerChange}
				options={candidates.map((m) => ({
					value: m.id,
					label: m.wechatName ? `${m.wechatName}｜${m.name || m.username}` : m.name || m.username,
					avatar: m.avatar || "",
					wechatName: m.wechatName || "",
					name: m.name || m.username,
					username: m.username,
					segmentNames: m.segmentNames || [],
				}))}
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
				showSearch
				optionFilterProp="label"
			/>
		</Modal>
	);
}
