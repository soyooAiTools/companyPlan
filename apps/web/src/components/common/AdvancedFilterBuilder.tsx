import { Button, Input, Select, Space } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export type AdvancedFilterMatch = "all" | "any";
export type AdvancedFilterOperator = "eq" | "neq" | "contains" | "not_contains" | "empty" | "not_empty";

export type AdvancedFilterField = {
	key: string;
	label: string;
	options?: { label: ReactNode; value: string; searchText?: string }[];
};

export type AdvancedFilterRule = {
	id: string;
	field: string;
	operator: AdvancedFilterOperator;
	value: string;
};

export type AdvancedFilterValue = {
	match: AdvancedFilterMatch;
	rules: AdvancedFilterRule[];
};

export const emptyAdvancedFilter: AdvancedFilterValue = { match: "any", rules: [] };

const operatorOptions: { label: string; value: AdvancedFilterOperator; needValue: boolean }[] = [
	{ label: "等于", value: "eq", needValue: true },
	{ label: "不等于", value: "neq", needValue: true },
	{ label: "包含", value: "contains", needValue: true },
	{ label: "不包含", value: "not_contains", needValue: true },
	{ label: "为空", value: "empty", needValue: false },
	{ label: "不为空", value: "not_empty", needValue: false },
];

const needValue = (operator: AdvancedFilterOperator) => operatorOptions.find((item) => item.value === operator)?.needValue !== false;

const newRule = (field = ""): AdvancedFilterRule => ({
	id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
	field,
	operator: "contains",
	value: "",
});

export function compactAdvancedFilter(value?: AdvancedFilterValue): AdvancedFilterValue {
	const rules = (value?.rules || []).filter((rule) => {
		if (!rule.field || !rule.operator) return false;
		return !needValue(rule.operator) || String(rule.value || "").trim() !== "";
	});
	return { match: value?.match === "all" ? "all" : "any", rules };
}

export function stringifyAdvancedFilter(value?: AdvancedFilterValue) {
	const compacted = compactAdvancedFilter(value);
	if (!compacted.rules.length) return undefined;
	return JSON.stringify(compacted);
}

type AdvancedFilterBuilderProps = {
	value: AdvancedFilterValue;
	fields: AdvancedFilterField[];
	onChange: (value: AdvancedFilterValue) => void;
	onApply?: () => void;
};

export default function AdvancedFilterBuilder({ value, fields, onChange, onApply }: AdvancedFilterBuilderProps) {
	const firstField = fields[0]?.key || "";
	const [draft, setDraft] = useState<AdvancedFilterValue>(value.rules.length ? value : { ...value, rules: [newRule(firstField)] });
	const rules = draft.rules.length ? draft.rules : [newRule(firstField)];

	useEffect(() => {
		setDraft(value.rules.length ? value : { ...value, rules: [newRule(firstField)] });
	}, [firstField, value]);

	const updateRule = (id: string, patch: Partial<AdvancedFilterRule>) => {
		setDraft({
			...draft,
			rules: rules.map((rule) => {
				if (rule.id !== id) return rule;
				const next = { ...rule, ...patch };
				if (patch.operator && !needValue(patch.operator)) next.value = "";
				return next;
			}),
		});
	};

	const removeRule = (id: string) => {
		const nextRules = rules.filter((rule) => rule.id !== id);
		setDraft({ ...draft, rules: nextRules.length ? nextRules : [newRule(firstField)] });
	};

	return (
		<div style={{ width: 520, padding: 12 }} onClick={(event) => event.stopPropagation()}>
			<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "#334155", fontSize: 13 }}>
				<span>符合以下</span>
				<Select
					size="small"
					value={draft.match}
					style={{ width: 82 }}
					options={[
						{ label: "所有", value: "all" },
						{ label: "任一", value: "any" },
					]}
					onChange={(match) => setDraft({ ...draft, match })}
				/>
				<span>条件</span>
			</div>
			<Space direction="vertical" size={8} style={{ width: "100%" }}>
				{rules.map((rule) => {
					const field = fields.find((item) => item.key === rule.field) || fields[0];
					const showValue = needValue(rule.operator);
					return (
						<div key={rule.id} style={{ display: "grid", gridTemplateColumns: "128px 104px 1fr 24px", gap: 8, alignItems: "center" }}>
							<Select
								value={rule.field || firstField}
								options={fields.map((item) => ({ label: item.label, value: item.key }))}
								onChange={(fieldKey) => updateRule(rule.id, { field: fieldKey, value: "" })}
							/>
							<Select value={rule.operator} options={operatorOptions.map((item) => ({ label: item.label, value: item.value }))} onChange={(operator) => updateRule(rule.id, { operator })} />
							{showValue ? (
								field?.options?.length ? (
									<Select
										showSearch
										allowClear
										value={rule.value || undefined}
										placeholder="请选择"
										filterOption={(input, option) => String(option?.searchText ?? option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
										options={field.options}
										onChange={(nextValue) => updateRule(rule.id, { value: String(nextValue || "") })}
									/>
								) : (
									<Input allowClear value={rule.value} placeholder="请输入" onChange={(event) => updateRule(rule.id, { value: event.target.value })} />
								)
							) : (
								<div />
							)}
							<Button type="text" size="small" icon={<CloseOutlined />} onClick={() => removeRule(rule.id)} />
						</div>
					);
				})}
			</Space>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10 }}>
				<Button type="link" icon={<PlusOutlined />} style={{ paddingLeft: 0 }} onClick={() => setDraft({ ...draft, rules: [...rules, newRule(firstField)] })}>
					添加条件
				</Button>
				<div style={{ display: "flex", gap: 8 }}>
					<Button
						onClick={() => {
							const next = { ...emptyAdvancedFilter, rules: [newRule(firstField)] };
							setDraft(next);
							onChange(emptyAdvancedFilter);
						}}
					>
						清空
					</Button>
					<Button
						type="primary"
						onClick={() => {
							onChange(compactAdvancedFilter(draft));
							onApply?.();
						}}
					>
						搜索
					</Button>
				</div>
			</div>
		</div>
	);
}
