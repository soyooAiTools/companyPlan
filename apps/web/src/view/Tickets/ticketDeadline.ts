import dayjs, { type Dayjs } from "dayjs";

export const TICKET_WORK_START_HOUR = 9;
export const TICKET_WORK_END_HOUR = 21;
export const TICKET_MAX_CALENDAR_DAYS = 2;
export const TICKET_MAX_BUSINESS_HOURS = 24;

const startOfWorkDay = (date: Dayjs) => date.startOf("day").hour(TICKET_WORK_START_HOUR);
const endOfWorkDay = (date: Dayjs) => date.startOf("day").hour(TICKET_WORK_END_HOUR);
const isWorkingDay = (date: Dayjs) => date.day() !== 0;

/**
 * 计算两个时间点之间的有效工时。
 * 提单截止时间只按 07:00-21:00 计时，周日整天不计入；其它时间段会被自动扣除。
 */
export function businessHoursBetween(start: Dayjs, end: Dayjs) {
	if (!start.isValid() || !end.isValid() || !end.isAfter(start)) return 0;
	let hours = 0;
	for (let date = start.startOf("day"); !date.isAfter(end, "day"); date = date.add(1, "day")) {
		if (!isWorkingDay(date)) continue;
		const windowStart = start.isAfter(startOfWorkDay(date)) ? start : startOfWorkDay(date);
		const windowEnd = end.isBefore(endOfWorkDay(date)) ? end : endOfWorkDay(date);
		if (windowEnd.isAfter(windowStart)) hours += windowEnd.diff(windowStart, "minute", true) / 60;
	}
	return hours;
}

/** 根据开始时间和工时反推截止时间，规则与 businessHoursBetween 保持一致。 */
export function addBusinessHours(start: Dayjs, hours: number) {
	let remaining = Math.max(0, Number(hours) || 0);
	for (let date = start.startOf("day"); remaining > 0; date = date.add(1, "day")) {
		if (!isWorkingDay(date)) continue;
		const from = start.isAfter(startOfWorkDay(date)) ? start : startOfWorkDay(date);
		const end = endOfWorkDay(date);
		if (!end.isAfter(from)) continue;
		const available = end.diff(from, "minute", true) / 60;
		if (remaining <= available) return from.add(remaining, "hour");
		remaining -= available;
	}
	return start;
}

export function normalizeDeadline(value: unknown) {
	if (!value) return null;
	const date = dayjs.isDayjs(value) ? value : dayjs(value as string | Date);
	return date.isValid() ? date : null;
}

/** 日期时间允许手动输入分钟；统一向上取整到下一个半小时，避免 09:22 这类时间产生不一致的工时。 */
export function ceilDeadlineToHalfHour(value: unknown) {
	const date = normalizeDeadline(value);
	if (!date) return null;
	const remainder = date.minute() % 30;
	const hasSeconds = date.second() > 0 || date.millisecond() > 0;
	if (remainder === 0 && !hasSeconds) return date;
	return date.second(0).millisecond(0).add(30 - remainder, "minute");
}

/** 将日期选择器的截止时间换算成提交接口使用的 dueInHours。 */
export function getDeadlineHours(value: unknown, now = dayjs()) {
	const deadline = normalizeDeadline(value);
	if (!deadline) return null;
	const hours = businessHoursBetween(now, deadline);
	return Number(hours.toFixed(2));
}

/** 新建工单的前端限制：未来两天内、工作日工作时段、0.5-24 个有效工时。 */
export function isValidTicketDeadline(value: unknown, now = dayjs()) {
	const deadline = normalizeDeadline(value);
	if (!deadline || !deadline.isAfter(now)) return false;
	if (deadline.isAfter(now.add(TICKET_MAX_CALENDAR_DAYS, "day"))) return false;
	if (!isWorkingDay(deadline) || deadline.isBefore(startOfWorkDay(deadline)) || deadline.isAfter(endOfWorkDay(deadline))) return false;
	const hours = getDeadlineHours(deadline, now);
	return hours != null && hours >= 0.5 && hours <= TICKET_MAX_BUSINESS_HOURS;
}

export function disabledTicketDeadlineDate(date: Dayjs, now = dayjs()) {
	return date.day() === 0 || date.isBefore(now, "day") || date.isAfter(now.add(TICKET_MAX_CALENDAR_DAYS, "day"), "day");
}

export function disabledTicketDeadlineHours() {
	return Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => hour < TICKET_WORK_START_HOUR || hour > TICKET_WORK_END_HOUR);
}

/** 日期面板已经限制日期范围，这里继续限制当前日期的过去小时/分钟和 21:00 之后的分钟。 */
export function disabledTicketDeadlineTime(date: Dayjs | null, now = dayjs()) {
	const sameDay = !!date?.isSame(now, "day");
	const disabledHours = disabledTicketDeadlineHours().concat(sameDay ? Array.from({ length: now.hour() }, (_, hour) => hour) : []);
	return {
		disabledHours: () => [...new Set(disabledHours)].sort((a, b) => a - b),
		disabledMinutes: (hour: number) => {
			const minutes: number[] = [];
			if (hour === TICKET_WORK_END_HOUR) minutes.push(...Array.from({ length: 59 }, (_, minute) => minute + 1));
			if (sameDay && hour === now.hour()) minutes.push(...Array.from({ length: now.minute() + 1 }, (_, minute) => minute));
			return [...new Set(minutes)].sort((a, b) => a - b);
		},
	};
}
