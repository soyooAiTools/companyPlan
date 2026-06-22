import { Empty, Typography } from "antd";

// 老页面占位壳:旧实现(LegacyApp/死数据)已下线,等重新接入新数据源。
export default function PlaceholderPage({ title }: { title: string }) {
	return (
		<div style={{ background: "#fff", borderRadius: 8, padding: 48, minHeight: 360, display: "flex", alignItems: "center", justifyContent: "center" }}>
			<Empty description={<Typography.Text type="secondary">「{title}」正在重做,旧数据已下线,稍后重新接入</Typography.Text>} />
		</div>
	);
}
