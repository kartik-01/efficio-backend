import { DateTime } from "luxon";

export function dayWindow(dateStr, tz) {
  // dateStr = "YYYY-MM-DD"
  const zone = tz || "UTC";
  const start = DateTime.fromISO(dateStr, { zone }).startOf("day").toUTC();
  const end   = start.plus({ days: 1 });
  return { start: start.toJSDate(), end: end.toJSDate() };
}

export function rangeWindow(startISO, endISO, tz) {
  const zone = tz || "UTC";
  const start = DateTime.fromISO(startISO, { zone }).toUTC();
  const end   = DateTime.fromISO(endISO, { zone }).toUTC();
  return { start: start.toJSDate(), end: end.toJSDate() };
}