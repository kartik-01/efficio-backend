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

export function weekWindow(dateStr, tz) {
  // dateStr = "YYYY-MM-DD"
  // Returns the week window (Monday to Sunday) that contains the given date
  const zone = tz || "UTC";
  const date = DateTime.fromISO(dateStr, { zone });
  
  // Get Monday of the week (weekday 1 in Luxon, where 1 = Monday, 7 = Sunday)
  // Luxon's startOf("week") defaults to Monday, but we'll be explicit
  const monday = date.set({ weekday: 1 }).startOf("day");
  const sunday = monday.plus({ days: 6 }).endOf("day");
  
  return { 
    start: monday.toUTC().toJSDate(), 
    end: sunday.toUTC().toJSDate() 
  };
}