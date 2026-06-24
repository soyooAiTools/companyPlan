// 工作时间 = 每天 10:00~19:00(中国时间,含周末);只算落在这窗口里的时间。纯算时间,不查库。
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Asia/Shanghai";
const START_HOUR = 10; // 上班
const END_HOUR = 19; // 下班
const MAX_DAYS = 4000; // 逐天循环的保险丝(防脏数据死循环),正常碰不到

const winStartOf = (day) => day.hour(START_HOUR).minute(0).second(0).millisecond(0); // 某天 10:00
const winEndOf = (day) => day.hour(END_HOUR).minute(0).second(0).millisecond(0); // 某天 19:00
const minD = (x, y) => (x.isBefore(y) ? x : y);
const maxD = (x, y) => (x.isAfter(y) ? x : y);

// a~b 之间有多少工作小时
export function businessHoursBetween(startISO, endISO) {
  const a = dayjs(startISO);
  const b = dayjs(endISO);
  if (!a.isValid() || !b.isValid() || !b.isAfter(a)) return 0;
  let hours = 0;
  for (let day = a.tz(TZ).startOf("day"), i = 0; day.isBefore(b) && i < MAX_DAYS; day = day.add(1, "day"), i++) {
    const lo = maxD(a, winStartOf(day)); // 当天窗口 ∩ [a,b] 的起点
    const hi = minD(b, winEndOf(day)); // 终点
    if (hi.isAfter(lo)) hours += hi.diff(lo, "hour", true);
  }
  return hours;
}

// start 之后 N 个工作小时是几点(建单算到期 due_at/warn_at)
export function addBusinessHours(startISO, hours) {
  const a = dayjs(startISO);
  if (!a.isValid()) return startISO;
  let left = Math.max(0, Number(hours) || 0); // 还要消耗的工时
  if (left <= 0) return a.toISOString();
  for (let day = a.tz(TZ).startOf("day"), i = 0; i < MAX_DAYS; day = day.add(1, "day"), i++) {
    const from = maxD(a, winStartOf(day)); // 这天从这里开始可用
    const end = winEndOf(day);
    if (!end.isAfter(from)) continue; // 这天窗口已过
    const room = end.diff(from, "hour", true); // 这天还能用多少工时
    if (left <= room) return from.add(left, "hour").toISOString();
    left -= room;
  }
  return a.add(left, "hour").toISOString();
}

// 距 dueAt 还有多少工作小时(正=剩、负=超期、null=没传)
export function remainingBusinessHours(dueAtISO, nowISO) {
  if (!dueAtISO) return null;
  const now = nowISO || new Date().toISOString();
  const ahead = businessHoursBetween(now, dueAtISO);
  return ahead > 0 ? Math.round(ahead) : -Math.round(businessHoursBetween(dueAtISO, now));
}

// end 之前 N 个工作小时是几点(超时筛的分界线)
export function subBusinessHours(endISO, hours) {
  const b = dayjs(endISO);
  if (!b.isValid()) return endISO;
  let left = Math.max(0, Number(hours) || 0);
  if (left <= 0) return b.toISOString();
  for (let day = b.tz(TZ).startOf("day"), i = 0; i < MAX_DAYS; day = day.subtract(1, "day"), i++) {
    const start = winStartOf(day);
    const to = minD(b, winEndOf(day)); // 这天用到这里为止
    if (!to.isAfter(start)) continue; // 这天窗口还没到
    const room = to.diff(start, "hour", true);
    if (left <= room) return to.subtract(left, "hour").toISOString();
    left -= room;
  }
  return b.subtract(left, "hour").toISOString();
}
