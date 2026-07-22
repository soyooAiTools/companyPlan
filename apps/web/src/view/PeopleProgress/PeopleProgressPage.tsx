import { useEffect, useMemo, useState } from "react";
import { App, Card, Typography } from "antd";
import { opsApi } from "../../api/modules/ops";
import type { PeopleProgressRole, PeopleProgressRow } from "./types";
import PeopleProgressToolbar from "./components/PeopleProgressToolbar";
import PeopleWorkloadTable from "./components/PeopleWorkloadTable";
import PersonTicketsModal from "./components/PersonTicketsModal";

const FALLBACK_ROLES: PeopleProgressRole[] = [
	{ key: "all", label: "全部" },
	{ key: "program", label: "程序" },
	{ key: "model", label: "模型" },
	{ key: "animation", label: "动画" },
	{ key: "ui", label: "UI" },
	{ key: "level", label: "地编" },
	{ key: "effect", label: "特效" },
	{ key: "producer", label: "制片" },
	{ key: "storyboard", label: "分镜" },
	{ key: "sound", label: "音效" },
	{ key: "ta", label: "TA" },
];

export default function PeopleProgressPage() {
	const { message } = App.useApp();
	const [roles, setRoles] = useState<PeopleProgressRole[]>(FALLBACK_ROLES);
	const [role, setRole] = useState("all");
	const [query, setQuery] = useState("");
	const [appliedQuery, setAppliedQuery] = useState("");
	const [overdueOnly, setOverdueOnly] = useState(false);
	const [newcomerOnly, setNewcomerOnly] = useState(false);
	const [rows, setRows] = useState<PeopleProgressRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [drawerPerson, setDrawerPerson] = useState<PeopleProgressRow | null>(null);

	const currentRoleLabel = useMemo(() => roles.find((item) => item.key === role)?.label || "全部", [role, roles]);

	const loadRows = async (nextQuery = appliedQuery) => {
		setLoading(true);
		try {
			const response = await opsApi.peopleProgress({ role, q: nextQuery.trim() || undefined, overdueOnly, newcomerOnly });
			setRows(response.rows);
		} catch (error) {
			message.error(error instanceof Error ? error.message : "加载人员进度失败");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		opsApi
			.peopleProgressRoles()
			.then((response) => setRoles(response.roles.length ? response.roles : FALLBACK_ROLES))
			.catch(() => {});
	}, []);

	useEffect(() => {
		void loadRows();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [role, overdueOnly, newcomerOnly]);

	const applySearch = () => {
		setAppliedQuery(query);
		void loadRows(query);
	};

	return (
		<div>
			<Card styles={{ body: { padding: 12 } }} style={{ borderRadius: 8 }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
					<div>
						<Typography.Title level={4} style={{ margin: 0, lineHeight: "28px" }}>
							人员进度
						</Typography.Title>
					</div>
					<Typography.Text type="secondary" style={{ fontSize: 12 }}>
						当前视角：{currentRoleLabel}
					</Typography.Text>
				</div>
				<PeopleProgressToolbar
					roles={roles}
					role={role}
					overdueOnly={overdueOnly}
					newcomerOnly={newcomerOnly}
					loading={loading}
					onRoleChange={(nextRole) => {
						setRole(nextRole);
						setDrawerPerson(null);
					}}
					onOverdueOnlyChange={setOverdueOnly}
					onNewcomerOnlyChange={setNewcomerOnly}
					onRefresh={applySearch}
				/>
				<PeopleWorkloadTable
					rows={rows}
					loading={loading}
					query={query}
					onQueryChange={setQuery}
					onSearch={(nextQuery) => {
						setAppliedQuery(nextQuery);
						void loadRows(nextQuery);
					}}
					onOpenTickets={setDrawerPerson}
				/>
			</Card>
			<PersonTicketsModal open={Boolean(drawerPerson)} person={drawerPerson} role={role} onClose={() => setDrawerPerson(null)} />
		</div>
	);
}
