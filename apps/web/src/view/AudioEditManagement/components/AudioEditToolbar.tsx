import { Button, Space } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import SegmentedTabs from "../../../components/SegmentedTabs";

type AudioEditToolbarProps = {
	status: string;
	loading: boolean;
	onStatusChange: (value: string) => void;
	onRefresh: () => void;
};

const STATUS_TABS = [
	{ value: "", label: "全部" },
	{ value: "待替换", label: "待替换" },
	{ value: "已完成", label: "已完成" },
];

export default function AudioEditToolbar({ status, loading, onStatusChange, onRefresh }: AudioEditToolbarProps) {
	return (
		<div className="audio-edit-toolbar">
			<SegmentedTabs
				value={status}
				onChange={onStatusChange}
				options={STATUS_TABS}
			/>
			<Space>
				<Button icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>
					刷新
				</Button>
			</Space>
		</div>
	);
}
