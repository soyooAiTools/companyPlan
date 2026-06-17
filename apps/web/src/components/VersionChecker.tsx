import { useEffect, useRef, useState } from "react";

// 版本检测 → 提示刷新(参考 playable-preview/VersionChecker):
// 每 20 分钟轮询一次 version.json;标签页重新可见时也查一次(切回来立即检测)。
// 发现部署了新版本(version.json 变化)就弹一条非阻塞顶部提示,让用户方便时自己点刷新。
const POLL_INTERVAL = 20 * 60 * 1000;

// version.json 由 vite 构建时生成(每次构建一个唯一时间戳);base 在 prod 是 /companyPlan/
const versionUrl = () => `${import.meta.env.BASE_URL}version.json`;

async function fetchVersion(): Promise<string | null> {
	// no-store + 时间戳双保险,绕开浏览器/CDN 缓存
	const res = await fetch(`${versionUrl()}?t=${Date.now()}`, { cache: "no-store" });
	if (!res.ok) throw new Error(`version.json ${res.status}`);
	const data = await res.json();
	return data && data.version != null ? String(data.version) : null;
}

export default function VersionChecker() {
	const baselineRef = useRef<string | null>(null);
	const [hasUpdate, setHasUpdate] = useState(false);

	useEffect(() => {
		let stopped = false;
		let timer: ReturnType<typeof setInterval> | null = null;

		const cleanup = () => {
			stopped = true;
			if (timer) clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
		};

		const check = async () => {
			try {
				const v = await fetchVersion();
				if (stopped || v == null) return;
				if (baselineRef.current == null) {
					baselineRef.current = v; // 启动时记基线
				} else if (v !== baselineRef.current) {
					setHasUpdate(true);
					cleanup(); // 已发现更新,停止轮询
				}
			} catch {
				// 拿不到 version.json(本地 dev / 404 等)静默跳过,绝不影响主流程
			}
		};

		const onVisible = () => {
			if (document.visibilityState === "visible") check();
		};

		check();
		timer = setInterval(check, POLL_INTERVAL);
		document.addEventListener("visibilitychange", onVisible);
		return cleanup;
	}, []);

	if (!hasUpdate) return null;
	return (
		<div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 2000, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
			<div
				style={{
					marginTop: 12,
					display: "flex",
					alignItems: "center",
					gap: 12,
					background: "#0f766e",
					color: "#fff",
					padding: "8px 16px",
					borderRadius: 8,
					boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
					pointerEvents: "auto",
					fontSize: 14,
				}}>
				<span>检测到新版本发布,点击刷新(或按 Ctrl+F5)</span>
				<button
					onClick={() => window.location.reload()}
					style={{ background: "#fff", color: "#0f766e", border: "none", borderRadius: 6, padding: "4px 16px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
					刷新
				</button>
			</div>
		</div>
	);
}
