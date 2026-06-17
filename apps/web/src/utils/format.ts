// 通用格式化工具(跨页面复用)

// 单号:uuid 太长 → 取首段 #xxxxxxxx;旧短码(REQ-/UI-…)原样;搜索仍匹配完整 id
export const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(id);
export const shortNo = (id: string) => (isUuid(id) ? id.slice(0, 8) : id);

// 日期时间本地化(无值 → "-")
export const fmtDateTime = (v?: string) => (v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "-");

// 时长:超过 24h 显示 "X天Yh",不足 24h 显示 "Xh"
export function fmtDuration(h: number): string {
	if (h < 24) return `${h}h`;
	const d = Math.floor(h / 24);
	const r = h % 24;
	return r ? `${d}天${r}h` : `${d}天`;
}
