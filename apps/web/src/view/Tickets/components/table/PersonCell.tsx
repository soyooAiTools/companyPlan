import { Avatar, Space } from "antd";

type PersonCellProps = {
	avatar?: string;
	name?: string;
};

export default function PersonCell({ avatar, name }: PersonCellProps) {
	return (
		<Space size={6}>
			<Avatar size={20} src={avatar || undefined} style={{ flex: "none", background: "#e2e8f0", color: "#475569", fontSize: 11 }}>
				{(name || "?").slice(0, 1)}
			</Avatar>
			<span>{name || "-"}</span>
		</Space>
	);
}
