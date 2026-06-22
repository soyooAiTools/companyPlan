// 药丸式分段切换:选中项为主题绿(#0f766e)。各处「全部/我负责/超时关注」这类切换统一用它。
import type { ReactNode } from "react";

export interface SegmentedTabOption<T extends string> {
	label: ReactNode;
	value: T;
}

interface SegmentedTabsProps<T extends string> {
	value: T;
	onChange: (value: T) => void;
	options: SegmentedTabOption<T>[];
	/** 选中底色,默认主题绿 */
	activeColor?: string;
}

export default function SegmentedTabs<T extends string>({ value, onChange, options, activeColor = "#0f766e" }: SegmentedTabsProps<T>) {
	return (
		<div style={{ display: "inline-flex", gap: 2, background: "#eef1f5", padding: 3, borderRadius: 8 }}>
			{options.map((o) => {
				const active = value === o.value;
				return (
					<div
						key={o.value}
						onClick={() => onChange(o.value)}
						style={{
							padding: "3px 14px",
							borderRadius: 6,
							cursor: "pointer",
							fontSize: 14,
							fontWeight: active ? 600 : 400,
							background: active ? activeColor : "transparent",
							color: active ? "#fff" : "#64748b",
							transition: "background 0.15s",
						}}>
						{o.label}
					</div>
				);
			})}
		</div>
	);
}
