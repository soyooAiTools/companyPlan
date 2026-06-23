import { useEffect, useRef, useState } from "react";
import { Button, notification } from "antd";

declare const __APP_VERSION__: string;

const POLL_INTERVAL = 5 * 60 * 1000;
const CURRENT_VERSION = __APP_VERSION__;
const NOTICE_KEY = "ops-version-update";

const versionUrl = () => `${import.meta.env.BASE_URL}version.json`;

async function fetchVersion(): Promise<string | null> {
	// no-store + 时间戳双保险,绕开浏览器/CDN 缓存
	const res = await fetch(`${versionUrl()}?t=${Date.now()}`, { cache: "no-store" });
	if (!res.ok) throw new Error(`version.json ${res.status}`);
	const data = await res.json();
	return data && data.version != null ? String(data.version) : null;
}

export default function VersionChecker() {
	const [api, contextHolder] = notification.useNotification();
	const baselineRef = useRef(CURRENT_VERSION);
	const [hasUpdate, setHasUpdate] = useState(false);

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
		api.info({
			key: NOTICE_KEY,
			title: "检测到新版本发布",
			description: "点击刷新后即可使用最新版本。",
			duration: 0,
			placement: "topRight",
			actions: (
				<Button type="primary" size="small" onClick={() => window.location.reload()}>
					刷新
				</Button>
			),
		});
	}, [api, hasUpdate]);

	return contextHolder;
}
