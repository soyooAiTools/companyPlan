import { Button, Space, Switch } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import SegmentedTabs from "../../../../components/SegmentedTabs";
import { SCOPE_OPTIONS, TICKETS_TOOLBAR_CARD, type OpsTicketScope } from "../../constants";

type TicketsToolbarProps = {
	scope: OpsTicketScope;
	isAdmin: boolean;
	overdueOnly: boolean;
	refreshing?: boolean;
	onScopeChange: (value: OpsTicketScope) => void;
	onOverdueOnlyChange: (value: boolean) => void;
	onRefresh: () => void;
	onCreate: () => void;
};

export default function TicketsToolbar({ scope, isAdmin, overdueOnly, refreshing = false, onScopeChange, onOverdueOnlyChange, onRefresh, onCreate }: TicketsToolbarProps) {
	return (
		<div style={{ ...TICKETS_TOOLBAR_CARD, justifyContent: "space-between" }}>
			<Space wrap>
				<SegmentedTabs value={scope} onChange={(value) => onScopeChange(value as OpsTicketScope)} options={SCOPE_OPTIONS} />
			</Space>
			<Space>
				{isAdmin ? <Switch checked={overdueOnly} onChange={onOverdueOnlyChange} checkedChildren="只看超期" unCheckedChildren="只看超期" /> : null}
				<Button icon={<ReloadOutlined />} loading={refreshing} onClick={onRefresh}>
					刷新
				</Button>
				<Button type="primary" onClick={onCreate}>
					+ 新建工单
				</Button>
			</Space>
		</div>
	);
}
