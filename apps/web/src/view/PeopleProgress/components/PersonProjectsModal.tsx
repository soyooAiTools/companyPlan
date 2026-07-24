import { useEffect, useMemo, useState } from "react";
import { Avatar, Input, Modal, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { opsApi, type OpsPeopleProgressProject } from "../../../api/modules/ops";
import { fmtStageDate, nextStageDeadline, stageDeadlineName, stageRangeLabel } from "../../ProjectPool/deadlineUtils";
import type { PeopleProgressRow } from "../types";

type PersonProjectsModalProps = {
	open: boolean;
	person: PeopleProgressRow | null;
	role: string;
	onClose: () => void;
};

const nextDeadlineText = (project: OpsPeopleProgressProject) => {
	const next = nextStageDeadline(project.stage, project.stageDeadlines || []);
	if (!next) return "—";
	const date = next.date ? `(${fmtStageDate(next.date)})` : "";
	return `${date}${stageDeadlineName(next)}`;
};

export default function PersonProjectsModal({ open, person, role, onClose }: PersonProjectsModalProps) {
	const [projects, setProjects] = useState<OpsPeopleProgressProject[]>([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState("");

	const loadProjects = async (nextQuery = query) => {
		if (!person) return;
		setLoading(true);
		try {
			const response = await opsApi.peopleProgressProjects(person.userId, { role, q: nextQuery.trim() || undefined });
			setProjects(response.projects);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (!open) {
			setProjects([]);
			setQuery("");
			return;
		}
		void loadProjects("");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, person?.userId, role]);

	const columns = useMemo<ColumnsType<OpsPeopleProgressProject>>(
		() => [
			{
				title: "序号",
				width: 58,
				align: "center",
				render: (_, __, index) => <span style={{ color: "#2563eb", fontWeight: 700 }}>{index + 1}</span>,
			},
			{
				title: "项目",
				dataIndex: "name",
				width: 240,
				render: (_, project) => (
					<span style={{ fontWeight: 700 }}>
						{project.name}
						{project.tenantName ? <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}> - {project.tenantName}</span> : null}
					</span>
				),
			},
			{
				title: "策划",
				dataIndex: "plannerName",
				width: 140,
				render: (value) => value || <span style={{ color: "#94a3b8" }}>—</span>,
			},
			{
				title: "当前阶段",
				dataIndex: "stage",
				width: 190,
				render: (value) => (value ? <Tag color="blue">{stageRangeLabel(value)}</Tag> : <span style={{ color: "#94a3b8" }}>—</span>),
			},
			{
				title: "下版交付",
				width: 220,
				render: (_, project) => <span style={{ color: "#0f172a", fontWeight: 600 }}>{nextDeadlineText(project)}</span>,
			},
			{
				title: "状态",
				dataIndex: "status",
				width: 100,
				render: (value) => <Tag color={value === "推进中" ? "blue" : value === "待反馈" ? "cyan" : "gold"}>{value || "—"}</Tag>,
			},
		],
		[],
	);

	return (
		<Modal
			title={
				person ? (
					<Space size={8}>
						<Avatar src={person.avatar || undefined}>{person.name.slice(0, 1)}</Avatar>
						<span>{person.name} 的项目</span>
					</Space>
				) : (
					"人员项目"
				)
			}
			open={open}
			onCancel={onClose}
			footer={null}
			width="60%"
			centered
			styles={{ body: { height: 620, overflow: "hidden", display: "flex", flexDirection: "column" } }}
			destroyOnHidden>
			<div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
				<Input
					allowClear
					value={query}
					prefix={<SearchOutlined />}
					placeholder="搜索项目/客户/策划/阶段"
					style={{ width: 320 }}
					onChange={(event) => setQuery(event.target.value)}
					onPressEnter={() => loadProjects()}
				/>
				<span style={{ color: "#64748b", lineHeight: "32px" }}>共 {projects.length} 个项目</span>
			</div>
			<Table
				rowKey="id"
				loading={loading}
				columns={columns}
				dataSource={projects}
				size="middle"
				pagination={false}
				scroll={{ x: 950, y: 540 }}
			/>
		</Modal>
	);
}
