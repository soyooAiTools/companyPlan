import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 每次构建生成唯一版本号 → 写进 dist/version.json;前端 VersionChecker 轮询它,发现新版本就提示刷新
const BUILD_ID = String(Date.now());

export default defineConfig(() => ({
	// 部署在(子)域名根路径下,用绝对根 base;子路由刷新也能正确取到 /assets/*
	base: "/",
	define: {
		__APP_VERSION__: JSON.stringify(BUILD_ID),
	},
	plugins: [
		react(),
		{
			name: "emit-version-json",
			generateBundle() {
				this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: BUILD_ID }) });
			},
		},
	],
	server: {
		port: 5001,
		// 开发时把 /api 转发到后端（server/index.mjs，默认 4174）
		proxy: {
			"/api": "http://localhost:4174",
		},
	},
}));
