import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button, Checkbox } from "antd";

type HeaderMultiSelectDropdownProps<T extends string | number> = {
	value: T[];
	options: { label: ReactNode; value: T }[];
	onApply: (value: T[]) => void;
	close: () => void;
	defaultAll?: boolean;
	compact?: boolean;
};

export default function HeaderMultiSelectDropdown<T extends string | number>({
	value,
	options,
	onApply,
	close,
	defaultAll,
	compact,
}: HeaderMultiSelectDropdownProps<T>) {
	const allValues = useMemo(() => options.map((option) => option.value), [options]);
	const allValuesKey = allValues.map(String).join("\u0001");
	const normalizedValue = defaultAll && !value.length ? allValues : value;
	const [draft, setDraft] = useState<T[]>(normalizedValue);
	const checkedCount = draft.length;
	const allChecked = allValues.length > 0 && checkedCount === allValues.length;
	const indeterminate = checkedCount > 0 && checkedCount < allValues.length;

	useEffect(() => {
		setDraft(defaultAll && !value.length ? allValues : value);
	}, [allValuesKey, defaultAll, value]);

	const apply = (nextValue: T[]) => {
		// defaultAll 模式下,全选等价于不过滤,仍然向外提交空数组。
		onApply(defaultAll && nextValue.length === allValues.length ? [] : nextValue);
		close();
	};
	const reset = () => apply(defaultAll ? allValues : []);
	const listMaxHeight = compact ? 220 : 280;
	const containerStyle = compact
		? { minWidth: 156, maxWidth: 190, padding: 8 }
		: { minWidth: 180, maxWidth: 240, padding: 10 };

	return (
		<div style={containerStyle} onClick={(e) => e.stopPropagation()}>
			<div style={{ maxHeight: listMaxHeight, overflowY: "auto", overflowX: "hidden" }}>
				<Checkbox.Group value={draft} onChange={(nextValue) => setDraft(nextValue as T[])} style={{ display: "grid", gap: compact ? 6 : 8 }}>
					{options.map((option) => (
						<Checkbox key={String(option.value)} value={option.value}>
							{option.label}
						</Checkbox>
					))}
				</Checkbox.Group>
			</div>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10, borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
					<Checkbox indeterminate={indeterminate} checked={allChecked} disabled={!allValues.length} onChange={(e) => setDraft(e.target.checked ? allValues : [])} />
					<Button size="small" type="link" style={{ padding: "0 2px" }} onClick={reset}>
						重置
					</Button>
				</div>
				<Button size="small" type="primary" onClick={() => apply(draft)}>
					确定
				</Button>
			</div>
		</div>
	);
}
