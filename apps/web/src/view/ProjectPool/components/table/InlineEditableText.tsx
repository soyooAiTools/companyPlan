import { useEffect, useState } from "react";
import { Input, Typography } from "antd";
import { LoadingOutlined } from "@ant-design/icons";

type InlineEditableTextProps = {
	value?: string | null;
	readonly?: boolean;
	placeholder?: string;
	maxLength?: number;
	onSave: (value: string) => Promise<void>;
};

function formatInlineText(value?: string | null) {
	return String(value || "")
		.replace(/<br\s*\/?\s*>/gi, "\n")
		.replace(/<\/(p|div|li)>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

export default function InlineEditableText({ value, readonly, placeholder = "—", maxLength = 500, onSave }: InlineEditableTextProps) {
	const [editing, setEditing] = useState(false);
	const formattedValue = formatInlineText(value);
	const [draft, setDraft] = useState(formattedValue);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!editing) setDraft(formattedValue);
	}, [editing, formattedValue]);

	const save = async () => {
		if (saving) return;
		const nextValue = draft.trim();
		if (nextValue === formattedValue) {
			setDraft(formattedValue);
			setEditing(false);
			return;
		}
		setSaving(true);
		try {
			await onSave(nextValue);
			setEditing(false);
		} finally {
			setSaving(false);
		}
	};

	if (readonly) {
		return (
			<Typography.Text ellipsis title={formattedValue} style={{ maxWidth: "100%" }}>
				{formattedValue || placeholder}
			</Typography.Text>
		);
	}
	if (editing) {
		return (
			<div
				style={{ width: "100%", minWidth: 150 }}
				onPointerDown={(event) => event.stopPropagation()}
				onMouseDown={(event) => event.stopPropagation()}
				onMouseUp={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}>
				<Input
					autoFocus
					size="small"
					value={draft}
					disabled={saving}
					allowClear
					placeholder={placeholder === "—" ? "请输入内容" : placeholder}
					maxLength={maxLength}
					style={{ width: "100%" }}
					suffix={saving ? <LoadingOutlined spin style={{ color: "#1677ff" }} title="正在保存" /> : null}
					onChange={(event) => setDraft(event.target.value)}
					onClear={() => setDraft("")}
					onPressEnter={(event) => {
						event.preventDefault();
						void save();
					}}
					onBlur={() => void save()}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				/>
			</div>
		);
	}
	return (
		<button
			type="button"
			className={`project-pool-editable-cell${formattedValue ? "" : " is-empty"}`}
			title={formattedValue}
			style={{ width: "100%", maxWidth: "100%", minWidth: 150, minHeight: 28 }}
			onClick={(event) => {
				event.stopPropagation();
				setDraft(formattedValue);
				setEditing(true);
			}}>
			{formattedValue || placeholder}
		</button>
	);
}
