import { useEffect, useState } from "react";
import { opsApi } from "../api/modules/ops";

export default function FeedbackSourceInlineLink({ ticketId }: { ticketId: string }) {
	const [source, setSource] = useState<{ url: string; reviewNumber?: number | null } | null>(null);

	useEffect(() => {
		let active = true;
		setSource(null);
		opsApi
			.ticketFeedbackSource(ticketId)
			.then((response) => {
				if (active) setSource(response.source?.url ? response.source : null);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [ticketId]);

	if (!source) return null;
	const versionLabel = Number.isInteger(source.reviewNumber) && Number(source.reviewNumber) > 0 ? `【V${source.reviewNumber}】` : "";
	return (
		<div style={{ marginTop: 8 }}>
			<a href={source.url} target="_blank" rel="noopener noreferrer">
				{versionLabel}打开反馈原图查看
			</a>
		</div>
	);
}
