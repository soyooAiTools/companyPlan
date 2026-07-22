import { Button, Space, Switch } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import SegmentedTabs from "../../../components/SegmentedTabs";
import type { PeopleProgressRole } from "../types";

type PeopleProgressToolbarProps = {
	roles: PeopleProgressRole[];
	role: string;
	overdueOnly: boolean;
	newcomerOnly: boolean;
	loading: boolean;
	onRoleChange: (role: string) => void;
	onOverdueOnlyChange: (value: boolean) => void;
	onNewcomerOnlyChange: (value: boolean) => void;
	onRefresh: () => void;
};

export default function PeopleProgressToolbar({
	roles,
	role,
	overdueOnly,
	newcomerOnly,
	loading,
	onRoleChange,
	onOverdueOnlyChange,
	onNewcomerOnlyChange,
	onRefresh,
}: PeopleProgressToolbarProps) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
			<div style={{ maxWidth: "100%", overflowX: "auto", paddingBottom: 2 }}>
				<SegmentedTabs value={role} onChange={onRoleChange} options={roles.map((item) => ({ label: item.label, value: item.key }))} />
			</div>
			<Space wrap>
				<Switch checked={overdueOnly} onChange={onOverdueOnlyChange} />
				<span style={{ color: "#475569" }}>只看逾期</span>
				<Switch checked={newcomerOnly} onChange={onNewcomerOnlyChange} />
				<span style={{ color: "#475569" }}>只看新人</span>
				<Button icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>
					刷新
				</Button>
			</Space>
		</div>
	);
}
