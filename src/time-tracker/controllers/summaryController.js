import TimeSession from "../models/timeSession.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dayWindow, rangeWindow } from "../utils/timeRange.js";
import { FOCUS_CATEGORIES } from "../utils/constants.js";

function minutesBetween(a, b) { return Math.max(0, Math.round((b - a) / 60000)); }

export const getSummary = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { range = "today", tz } = req.query;

  let start, end;
  if (range === "today") {
    ({ start, end } = dayWindow(new Date().toISOString().slice(0,10), tz));
  } else if (req.query.start && req.query.end) {
    ({ start, end } = rangeWindow(req.query.start, req.query.end, tz));
  } else {
    return res.status(422).json({ success: false, message: "Provide range=today or start&end" });
  }

  const sessions = await TimeSession.find({
    userId,
    $or: [
      { startTime: { $lt: end }, endTime: { $gt: start } },
      { startTime: { $gte: start, $lt: end } },
    ],
  }).lean();

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

  res.json({
    success: true,
    data: {
      totalMinutes: total,
      byCategory: [...byCategory.entries()].map(([categoryId, minutes]) => ({ categoryId, minutes })),
      focus: { deepMinutes: focus, otherMinutes: Math.max(0, total - focus) },
      // streaks optional (compute later if you want)
    },
  });
});