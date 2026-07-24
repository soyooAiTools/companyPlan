import { useEffect, useRef, useState } from "react";
import { Button, notification } from "antd";

declare const __APP_VERSION__: string;

const POLL_INTERVAL = 5 * 60 * 1000;
const CURRENT_VERSION = __APP_VERSION__;

const versionUrl = () => `${import.meta.env.BASE_URL}version.json`;

async function fetchVersion(): Promise<string | null> {
	// no-store + 时间戳双保险,绕开浏览器/CDN 缓存
	const res = await fetch(`${versionUrl()}?t=${Date.now()}`, { cache: "no-store" });
	if (!res.ok) throw new Error(`version.json ${res.status}`);
	const data = await res.json();
	return data && data.version != null ? String(data.version) : null;
}

export default function VersionChecker() {
	const baselineRef = useRef(CURRENT_VERSION);
	const [hasUpdate, setHasUpdate] = useState(false);
	const [api, contextHolder] = notification.useNotification();

	useEffect(() => {
		let stopped = false;
		let timer: ReturnType<typeof setInterval> | null = null;

		const cleanup = () => {
			stopped = true;
			if (timer) clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("focus", check);
			window.removeEventListener("pageshow", check);
		};

		const check = async () => {
			try {
				const v = await fetchVersion();
				if (stopped || v == null) return;
				if (v !== baselineRef.current) {
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
		window.addEventListener("focus", check);
		window.addEventListener("pageshow", check);
		return cleanup;
	}, []);

	useEffect(() => {
		if (!hasUpdate) return;
		api.warning({
			key: "app-version-update",
			message: "检测到新版本发布",
			description: "系统已发布新版本，避免浏览器缓存，请手动点击刷新按钮。",
			duration: 0,
			placement: "topRight",
			closeIcon: false,
			btn: (
				<Button type="primary" size="small" style={{ background: "#0f766e", borderColor: "#0f766e" }} onClick={() => window.location.reload()}>
					立即刷新
				</Button>
			),
		});
	}, [api, hasUpdate]);

	return contextHolder;
}
