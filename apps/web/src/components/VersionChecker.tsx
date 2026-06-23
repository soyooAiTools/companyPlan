import { useEffect, useRef, useState } from "react";
import { Button, notification } from "antd";

// 版本检测 → 提示刷新(参考 playable-preview/VersionChecker):
// 进入页面先查一次;每 20 分钟轮询一次 version.json;标签页重新可见/窗口聚焦/页面恢复时也查一次。
// 发现部署了新版本(version.json 变化)就弹一条非阻塞顶部提示,让用户方便时自己点刷新。
declare const __APP_VERSION__: string;

const POLL_INTERVAL = 20 * 60 * 1000;
const CURRENT_VERSION = __APP_VERSION__;
const NOTICE_KEY = "ops-version-update";

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
