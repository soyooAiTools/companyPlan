/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	// 关闭 preflight(base 重置),避免覆盖/冲突 antd 的默认样式。只用工具类。
	corePlugins: { preflight: false },
	theme: { extend: {} },
	plugins: [],
};
