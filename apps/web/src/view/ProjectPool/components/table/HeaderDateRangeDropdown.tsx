import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { Button, DatePicker, Space } from "antd";

export type HeaderDateRangeValue = [string, string] | null;

type HeaderDateRangeDropdownProps = {
	value: HeaderDateRangeValue;
	onApply: (value: HeaderDateRangeValue) => void;
	close: () => void;
};

function toPickerValue(value: HeaderDateRangeValue): [Dayjs, Dayjs] | null {
	if (!value) return null;
	const start = dayjs(value[0]);
	const end = dayjs(value[1]);
	return start.isValid() && end.isValid() ? [start, end] : null;
}

export default function HeaderDateRangeDropdown({ value, onApply, close }: HeaderDateRangeDropdownProps) {
	const [draft, setDraft] = useState<[Dayjs | null, Dayjs | null] | null>(() => toPickerValue(value));

	useEffect(() => {
		setDraft(toPickerValue(value));
	}, [value]);

	const apply = () => {
		const [start, end] = draft || [];
		onApply(start?.isValid() && end?.isValid() ? [start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")] : null);
		close();
	};

	return (
		<div style={{ width: 290, padding: 10 }} onClick={(event) => event.stopPropagation()}>
			<DatePicker.RangePicker
				size="small"
				value={draft}
				placeholder={["开始日期", "结束日期"]}
				onChange={(dates) => setDraft(dates ? [dates[0], dates[1]] : null)}
				style={{ width: "100%" }}
			/>
			<Space size={8} style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
				<Button size="small" onClick={() => setDraft(null)}>
					清空
				</Button>
				<Button size="small" type="primary" onClick={apply}>
					确定
				</Button>
			</Space>
		</div>
	);
}
