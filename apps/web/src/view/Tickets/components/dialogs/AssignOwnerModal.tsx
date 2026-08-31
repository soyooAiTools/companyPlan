import { Avatar, Modal, Select, Space, Typography } from "antd";
import type { ReactNode } from "react";
import { useMemo } from "react";

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

const EMPTY_SEGMENT = "未分组";

type AssignOwnerOption = {
	value: string;
	label: string;
	avatar: string;
	wechatName: string;
	name: string;
	username: string;
	segmentNames: string[];
};

type AssignOwnerGroup = {
	label: ReactNode;
	options: AssignOwnerOption[];
};

function isAssignOwnerOption(option?: AssignOwnerOption | AssignOwnerGroup): option is AssignOwnerOption {
	return !!option && "value" in option;
}

export default function AssignOwnerModal({ open, candidates, ownerId, assigning, onOwnerChange, onConfirm, onCancel }: AssignOwnerModalProps) {
	const toOption = (m: AssignOwnerCandidate): AssignOwnerOption => ({
		value: m.id,
		label: m.wechatName ? `${m.wechatName}｜${m.name || m.username}` : m.name || m.username,
		avatar: m.avatar || "",
		wechatName: m.wechatName || "",
		name: m.name || m.username,
		username: m.username,
		segmentNames: m.segmentNames || [],
	});

	const selectOptions = useMemo<Array<AssignOwnerOption | AssignOwnerGroup>>(() => {
		const groupMap = new Map<string, AssignOwnerCandidate[]>();
		for (const member of candidates) {
			const groupName = member.segmentNames?.[0] || EMPTY_SEGMENT;
			groupMap.set(groupName, [...(groupMap.get(groupName) || []), member]);
		}
		return Array.from(groupMap.entries()).map(([label, members]) => ({
			label: (
				<Typography.Text type="secondary" style={{ fontSize: 12 }}>
					{label} · {members.length} 人
				</Typography.Text>
			),
			options: members.map(toOption),
		}));
	}, [candidates]);

	return (
		<Modal title="指派负责人" open={open} onOk={onConfirm} confirmLoading={assigning} onCancel={onCancel} okText="指派" cancelText="取消" destroyOnHidden>
			<Select
				style={{ width: "100%" }}
				placeholder="选择该项目的成员"
				value={ownerId || undefined}
				onChange={onOwnerChange}
				options={selectOptions}
				filterOption={(input, option) => {
					if (!isAssignOwnerOption(option)) return false;
					const kw = input.trim().toLowerCase();
					return [option.wechatName, option.name, option.username].some((s) =>
						String(s ?? "")
							.toLowerCase()
							.includes(kw),
					);
				}}
				optionRender={(opt) => {
					const data = opt.data;
					if (!isAssignOwnerOption(data)) return null;
					return (
						<Space size={6} style={{ width: "100%" }}>
							<Avatar size={22} src={data.avatar || undefined} style={{ flex: "none", background: "#e2e8f0", color: "#475569", fontSize: 12 }}>
								{(data.name || "?").slice(0, 1)}
							</Avatar>
							{data.wechatName ? <span style={{ color: "#64748b" }}>{data.wechatName}</span> : null}
							{data.wechatName ? <span style={{ color: "#cbd5e1" }}>｜</span> : null}
							<span>{data.name}</span>
							{data.segmentNames?.length ? (
								<>
									<span style={{ color: "#cbd5e1" }}>｜</span>
									<span style={{ color: "#0f766e" }}>{data.segmentNames.join("、")}</span>
								</>
							) : null}
						</Space>
					);
				}}
				showSearch
				optionFilterProp="label"
				notFoundContent="该项目暂无可指派成员"
			/>
		</Modal>
	);
}
