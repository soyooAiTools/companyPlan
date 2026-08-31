import { Button, Input, Space } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import SegmentedTabs from "../../../components/SegmentedTabs";

type AudioEditToolbarProps = {
	status: string;
	keyword: string;
	loading: boolean;
	onStatusChange: (value: string) => void;
	onKeywordChange: (value: string) => void;
	onRefresh: () => void;
};

const STATUS_TABS = [
	{ value: "", label: "全部" },
	{ value: "待替换", label: "待替换" },
	{ value: "已完成", label: "已完成" },
];

export default function AudioEditToolbar({ status, keyword, loading, onStatusChange, onKeywordChange, onRefresh }: AudioEditToolbarProps) {
	return (
		<div className="audio-edit-toolbar">
			<SegmentedTabs
				value={status}
				onChange={onStatusChange}
				options={STATUS_TABS}
			/>
			<Space>
				<Input
					allowClear
					prefix={<SearchOutlined />}
					placeholder="搜索项目/客户"
					value={keyword}
					onChange={(event) => onKeywordChange(event.target.value)}
					style={{ width: 220 }}
				/>
				<Button icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>
					刷新
				</Button>
			</Space>
		</div>
	);
}
