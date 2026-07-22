import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Empty, Modal, Spin } from "antd";
import { FullscreenExitOutlined, FullscreenOutlined, HistoryOutlined } from "@ant-design/icons";

type UpdateLogItem = {
	date: string;
	items: string[];
};

type MonthGroup = {
	month: string;
	dates: string[];
};

type UpdateLogFloatProps = {
	collapsed?: boolean;
	menuTrigger?: boolean;
};

const UPDATE_LOG_SEEN_KEY = "ops.updateLogs.seenSignature";

function signatureOf(logs: UpdateLogItem[]): string {
	return logs.map((log) => `${log.date}:${log.items.join("|")}`).join(";");
}

export default function UpdateLogFloat({ collapsed = false, menuTrigger = false }: UpdateLogFloatProps) {
	const [open, setOpen] = useState(false);
	const [fullScreen, setFullScreen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [logs, setLogs] = useState<UpdateLogItem[]>([]);
	const [activeDate, setActiveDate] = useState("");
	const [hasUnread, setHasUnread] = useState(false);
	const contentRef = useRef<HTMLDivElement | null>(null);

	const monthGroups = useMemo<MonthGroup[]>(() => {
		const groups: MonthGroup[] = [];
		for (const log of logs) {
			const month = log.date.slice(0, 7);
			let group = groups.find((item) => item.month === month);
			if (!group) {
				group = { month, dates: [] };
				groups.push(group);
			}
			if (!group.dates.includes(log.date)) group.dates.push(log.date);
		}
		return groups;
	}, [logs]);

	const applyLogs = (nextLogs: UpdateLogItem[]) => {
		setLogs(nextLogs);
		setActiveDate((current) => current || nextLogs[0]?.date || "");
		const signature = signatureOf(nextLogs);
		setHasUnread(Boolean(signature) && localStorage.getItem(UPDATE_LOG_SEEN_KEY) !== signature);
		return signature;
	};

	const fetchLogs = async () => {
		const res = await fetch(`/update-logs.json?t=${Date.now()}`, { cache: "no-store" });
		const data = (await res.json()) as UpdateLogItem[];
		const nextLogs = Array.isArray(data) ? data : [];
		return { logs: nextLogs, signature: applyLogs(nextLogs) };
	};

	useEffect(() => {
		let alive = true;
		fetch(`/update-logs.json?t=${Date.now()}`, { cache: "no-store" })
			.then((res) => res.json())
			.then((data: UpdateLogItem[]) => {
				if (!alive) return;
				applyLogs(Array.isArray(data) ? data : []);
			})
			.catch(() => {
				if (alive) setHasUnread(false);
			});
		return () => {
			alive = false;
		};
	}, []);

	const markSeen = (signature: string) => {
		if (!signature) return;
		localStorage.setItem(UPDATE_LOG_SEEN_KEY, signature);
		setHasUnread(false);
	};

	const openLogs = async () => {
		setOpen(true);
		if (logs.length) {
			markSeen(signatureOf(logs));
			return;
		}
		setLoading(true);
		try {
			const result = await fetchLogs();
			markSeen(result.signature);
		} catch {
			setLogs([]);
			setActiveDate("");
		} finally {
			setLoading(false);
		}
	};

	const scrollToDate = (date: string) => {
		setActiveDate(date);
		const target = document.getElementById(`update-log-${date}`);
		const container = contentRef.current;
		if (!target || !container) return;
		container.scrollTo({
			top: target.offsetTop - container.offsetTop,
			behavior: "smooth",
		});
	};

	return (
		<>
			<Badge dot={hasUnread} offset={collapsed ? [-4, 4] : [-2, 6]} style={{ display: "block" }}>
				<Button
					type={menuTrigger ? "text" : "default"}
					icon={<HistoryOutlined />}
					onClick={openLogs}
					style={{
						width: menuTrigger ? "100%" : collapsed ? 40 : "100%",
						height: menuTrigger ? 40 : collapsed ? 36 : 34,
						justifyContent: collapsed ? "center" : "flex-start",
						borderRadius: menuTrigger ? 8 : collapsed ? 8 : 6,
						background: menuTrigger ? "transparent" : "#fff",
						borderColor: menuTrigger ? "transparent" : "#dbe3ec",
						color: menuTrigger ? "#334155" : "#334155",
						fontWeight: menuTrigger ? 400 : 600,
						paddingInline: menuTrigger ? (collapsed ? 0 : 4) : collapsed ? 0 : undefined,
					}}
				>
					{collapsed ? null : "更新日志"}
				</Button>
			</Badge>

			<Modal
				title={
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 2 }}>
						<span style={{ color: "#0f172a", fontSize: 16, fontWeight: 700 }}>更新日志</span>
						<div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
							<Button
								type="text"
								size="small"
								icon={fullScreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
								onClick={(event) => {
									event.stopPropagation();
									setFullScreen((value) => !value);
								}}
								style={{ color: "#94a3b8" }}
							/>
							<Button
								type="text"
								size="small"
								onClick={(event) => {
									event.stopPropagation();
									setOpen(false);
								}}
								style={{ color: "#94a3b8", fontSize: 20, lineHeight: 1 }}
							>
								×
							</Button>
						</div>
					</div>
				}
				open={open}
				onCancel={() => setOpen(false)}
				footer={null}
				closable={false}
				width={fullScreen ? "86vw" : 760}
				style={{ top: fullScreen ? 24 : 48 }}
				styles={{ body: { paddingTop: 8 } }}
			>
				{loading ? (
					<div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
						<Spin />
					</div>
				) : logs.length ? (
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "164px minmax(0, 1fr)",
							height: fullScreen ? "78vh" : "72vh",
							minHeight: 0,
						}}
					>
						<aside style={{ minHeight: 0, borderRight: "1px solid #e2e8f0", padding: "6px 16px 6px 0", overflowY: "auto" }}>
							{monthGroups.map((group) => (
								<div key={group.month} style={{ marginBottom: 18 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 7, color: "#334155", fontSize: 14, marginBottom: 8 }}>
										<span style={{ color: "#0891b2", fontSize: 12 }}>▼</span>
										<span>{group.month}</span>
									</div>
									<div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 10 }}>
										{group.dates.map((date) => {
											const active = activeDate === date;
											return (
												<button
													key={date}
													type="button"
													onClick={() => scrollToDate(date)}
													style={{
														display: "flex",
														alignItems: "center",
														gap: 8,
														width: "100%",
														border: 0,
														borderRadius: 4,
														background: active ? "#dff3f7" : "transparent",
														color: active ? "#0284a8" : "#64748b",
														cursor: "pointer",
														padding: "7px 10px",
														textAlign: "left",
														fontSize: 13,
													}}
												>
													<span style={{ color: active ? "#0891b2" : "#cbd5e1", fontSize: 10 }}>●</span>
													<span>{date.slice(5)}</span>
												</button>
											);
										})}
									</div>
								</div>
							))}
						</aside>

						<div ref={contentRef} style={{ minHeight: 0, overflowY: "auto", padding: "0 18px 4px 24px" }}>
							{logs.map((log) => (
								<section id={`update-log-${log.date}`} key={log.date} style={{ paddingBottom: 30 }}>
									<h3 style={{ margin: "0 0 14px", color: "#0f172a", fontSize: 18, fontWeight: 700 }}>{log.date}</h3>
									<div style={{ height: 1, background: "#e2e8f0", marginBottom: 18 }} />
									<ul style={{ margin: 0, paddingLeft: 0, color: "#334155", lineHeight: 2.15, listStyle: "none" }}>
										{log.items.map((item) => (
											<li key={item} style={{ display: "flex", gap: 10 }}>
												<span style={{ color: "#64748b" }}>·</span>
												<span>{item}</span>
											</li>
										))}
									</ul>
								</section>
							))}
						</div>
					</div>
				) : (
					<Empty description="暂无更新日志" />
				)}
			</Modal>
		</>
	);
}
