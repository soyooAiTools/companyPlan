// Keep historical audit data intact while hiding internal integration IDs.
export default function TicketEventNote({ note }: { note?: string }) {
	if (!note) return null;
	const text = /^来源反馈\s+\S+\/\S+/.test(note) ? "由反馈中心指派，可通过上方入口查看对应评审版本。" : note;
	return <div style={{ color: "#475569" }}>备注：{text}</div>;
}
