import { useEffect, useState } from "react";
import { opsApi } from "../api/modules/ops";

export default function FeedbackSourceInlineLink({ ticketId }: { ticketId: string }) {
	const [url, setUrl] = useState("");

	useEffect(() => {
		let active = true;
		setUrl("");
		opsApi.ticketFeedbackSource(ticketId)
			.then((response) => { if (active) setUrl(response.source?.url || ""); })
			.catch(() => {});
		return () => { active = false; };
	}, [ticketId]);

	if (!url) return null;
	return <div style={{ marginTop: 8 }}><a href={url} target="_blank" rel="noopener noreferrer">打开反馈原图与讨论</a></div>;
}
