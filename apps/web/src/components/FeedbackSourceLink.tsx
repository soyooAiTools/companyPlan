import { useEffect, useState } from "react";
import { Button, Typography } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { opsApi } from "../api/modules/ops";

export default function FeedbackSourceLink({ ticketId }: { ticketId: string }) {
	const [source, setSource] = useState<{ url: string } | null>(null);
	const [failed, setFailed] = useState(false);
	const [retry, setRetry] = useState(0);
	useEffect(() => {
		let active = true;
		setSource(null);
		setFailed(false);
		opsApi.ticketFeedbackSource(ticketId).then((response) => { if (active) setSource(response.source); })
			.catch(() => { if (active) setFailed(true); });
		return () => { active = false; };
	}, [ticketId, retry]);
	if (failed) return <Button size="small" onClick={() => setRetry((value) => value + 1)}>重新加载反馈入口</Button>;
	if (!source) return null;
	return <div style={{ padding: 14, marginBottom: 16, border: "1px solid #a7d9cf", background: "#f0faf7", borderRadius: 10 }}>
		<Button type="primary" icon={<ExportOutlined />} href={source.url} target="_blank" rel="noopener noreferrer">查看反馈原图与讨论</Button>
		<Typography.Paragraph type="secondary" style={{ margin: "8px 0 0", fontSize: 12 }}>直接定位该评审版本，并突出显示本工单负责的反馈。</Typography.Paragraph>
	</div>;
}
