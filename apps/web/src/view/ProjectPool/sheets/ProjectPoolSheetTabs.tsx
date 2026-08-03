import { projectPoolSheetOptions, type ProjectPoolSheetKey } from "./sheetTypes";
import type { ReactNode } from "react";

type ProjectPoolSheetTabsProps = {
	value: ProjectPoolSheetKey;
	onChange: (value: ProjectPoolSheetKey) => void;
	extra?: ReactNode;
};

export default function ProjectPoolSheetTabs({ value, onChange, extra }: ProjectPoolSheetTabsProps) {
	const leftOptions = projectPoolSheetOptions.filter((option) => option.value !== "stale");
	const rightOptions = projectPoolSheetOptions.filter((option) => option.value === "stale");
	const renderTab = (option: (typeof projectPoolSheetOptions)[number]) => {
		const active = option.value === value;
		return (
			<div key={option.value} className="ops-pool-sheet-tab-wrap">
				<div
					className={`ops-pool-sheet-tab${active ? " ops-pool-sheet-tab-active" : ""}`}
					role="button"
					tabIndex={0}
					onClick={() => onChange(option.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onChange(option.value);
						}
					}}>
					<span>{option.label}</span>
				</div>
			</div>
		);
	};

	return (
		<>
			<style>{`
				.ops-pool-sheet-tabs {
					display: flex;
					align-items: flex-end;
					justify-content: space-between;
					height: 36px;
					padding: 0 10px 0 0;
					border-bottom: 1px solid #e5e7eb;
					background: transparent;
					flex-shrink: 0;
				}
				.ops-pool-sheet-tabs-group {
					display: flex;
					align-items: flex-end;
					gap: 0;
					padding: 0;
					border: 0;
					border-radius: 0;
					background: transparent;
				}
				.ops-pool-sheet-tabs-right {
					display: flex;
					align-items: center;
					gap: 8px;
				}
				.ops-pool-sheet-tab-wrap {
					display: flex;
					align-items: flex-end;
					height: 36px;
				}
				.ops-pool-sheet-tab,
				.ops-pool-sheet-tab:hover,
				.ops-pool-sheet-tab:focus,
				.ops-pool-sheet-tab:active {
					display: inline-flex;
					align-items: center;
					height: 30px;
					padding: 0 12px;
					border: 1px solid #e5e7eb;
					border-bottom-color: #e5e7eb;
					border-radius: 8px 8px 0 0;
					background: transparent;
					color: #64748b;
					font-size: 13px;
					font-weight: 400;
					font-family: inherit;
					cursor: pointer;
					outline: none !important;
					box-shadow: none !important;
					-webkit-tap-highlight-color: transparent;
					appearance: none;
				}
				.ops-pool-sheet-tab-active,
				.ops-pool-sheet-tab-active:hover,
				.ops-pool-sheet-tab-active:focus,
				.ops-pool-sheet-tab-active:active {
					background: #fff;
					border-color: #d8e0ea;
					border-bottom-color: #fff;
					color: #0f172a;
					font-weight: 600;
					box-shadow: none !important;
				}
			`}</style>
			<div className="ops-pool-sheet-tabs">
				<div className="ops-pool-sheet-tabs-group">{leftOptions.map(renderTab)}</div>
				<div className="ops-pool-sheet-tabs-right">
					{extra ? <div style={{ display: "flex", alignItems: "center", height: 32 }}>{extra}</div> : null}
					<div className="ops-pool-sheet-tabs-group">{rightOptions.map(renderTab)}</div>
				</div>
			</div>
		</>
	);
}
