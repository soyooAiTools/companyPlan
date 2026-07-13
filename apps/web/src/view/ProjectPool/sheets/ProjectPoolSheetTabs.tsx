import { projectPoolSheetOptions, type ProjectPoolSheetKey } from "./sheetTypes";

type ProjectPoolSheetTabsProps = {
	value: ProjectPoolSheetKey;
	onChange: (value: ProjectPoolSheetKey) => void;
};

export default function ProjectPoolSheetTabs({ value, onChange }: ProjectPoolSheetTabsProps) {
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
					height: 40px;
					padding: 0;
					border-bottom: 1px solid #e5e7eb;
					flex-shrink: 0;
				}
				.ops-pool-sheet-tabs-group {
					display: flex;
					align-items: flex-end;
					gap: 0;
				}
				.ops-pool-sheet-tab-wrap {
					display: flex;
					align-items: flex-end;
					height: 40px;
				}
				.ops-pool-sheet-tab,
				.ops-pool-sheet-tab:hover,
				.ops-pool-sheet-tab:focus,
				.ops-pool-sheet-tab:active {
					display: inline-flex;
					align-items: center;
					height: 40px;
					padding: 0 14px;
					border: 1px solid #e5e7eb;
					border-bottom-color: #e5e7eb;
					border-radius: 9px 9px 0 0;
					background: #f1f5f9;
					color: #64748b;
					font-size: 14px;
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
					border-color: #d9dee7;
					border-bottom-color: #fff;
					color: #334155;
					font-weight: 600;
				}
			`}</style>
			<div className="ops-pool-sheet-tabs">
				<div className="ops-pool-sheet-tabs-group">{leftOptions.map(renderTab)}</div>
				<div className="ops-pool-sheet-tabs-group">{rightOptions.map(renderTab)}</div>
			</div>
		</>
	);
}
