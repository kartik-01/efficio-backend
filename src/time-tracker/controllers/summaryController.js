import TimeSession from "../models/timeSession.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dayWindow, rangeWindow } from "../utils/timeRange.js";
import { FOCUS_CATEGORIES } from "../utils/constants.js";
import { DateTime } from "luxon";

function minutesBetween(a, b) { return Math.max(0, Math.round((b - a) / 60000)); }

export const getSummary = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { range = "today", tz } = req.query;

  let start, end;
  if (range === "today") {
    // Get today's date in the user's timezone, not UTC
    const timezone = tz || "UTC";
    const todayInTz = DateTime.now().setZone(timezone);
    const todayStr = todayInTz.toISODate(); // Returns YYYY-MM-DD format
    ({ start, end } = dayWindow(todayStr, timezone));
  } else if (req.query.start && req.query.end) {
    ({ start, end } = rangeWindow(req.query.start, req.query.end, tz));
  } else {
    return res.status(422).json({ success: false, message: "Provide range=today or start&end" });
  }

  // Query sessions that overlap with the day window
  // This includes:
  // 1. Sessions that start before the day ends and end after the day starts (overlapping)
  // 2. Sessions that start within the day (regardless of end time)
  // 3. Running sessions (no endTime) that started before the day ends
  const sessions = await TimeSession.find({
    userId,
    $or: [
      // Sessions that overlap with the day window
      { startTime: { $lt: end }, endTime: { $gt: start } },
      // Sessions that start within the day
      { startTime: { $gte: start, $lt: end } },
      // Running sessions (no endTime) that started before the day ends
      { startTime: { $lt: end }, endTime: null },
      { startTime: { $lt: end }, endTime: { $exists: false } },
    ],
  }).lean();

  console.log(`[getSummary] User: ${userId}, Timezone: ${tz || 'UTC'}, Day window: ${start.toISOString()} to ${end.toISOString()}`);
  console.log(`[getSummary] Found ${sessions.length} sessions`);

  // clamp to window and aggregate
  const byCategory = new Map();
  let total = 0, focus = 0;

  for (const s of sessions) {
    const sStart = new Date(Math.max(s.startTime, start));
    const sEnd   = new Date(Math.min(s.endTime || new Date(), end));
    const mins = minutesBetween(sStart, sEnd);
    if (!mins) continue;

    total += mins;
    byCategory.set(s.categoryId, (byCategory.get(s.categoryId) || 0) + mins);
    if (FOCUS_CATEGORIES.has(s.categoryId)) focus += mins;
  }

  const result = {
    success: true,
    data: {
      totalMinutes: total,
      byCategory: [...byCategory.entries()].map(([categoryId, minutes]) => ({ categoryId, minutes })),
      focus: { deepMinutes: focus, otherMinutes: Math.max(0, total - focus) },
      // streaks optional (compute later if you want)
    },
  };
  
  console.log(`[getSummary] Result:`, JSON.stringify(result, null, 2));
  
  res.json(result);
});