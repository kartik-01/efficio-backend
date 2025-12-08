import DailySummary from "../models/dailySummary.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dayWindow } from "../utils/timeRange.js";
import { FOCUS_CATEGORIES } from "../utils/constants.js";
import TimeSession from "../models/timeSession.js";

function minutesBetween(a, b) {
  return Math.max(0, Math.round((b - a) / 60000));
}

// Get stored daily summary for a specific date
export const getDailySummary = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { date, tz } = req.query; // date: YYYY-MM-DD format

  if (!date) {
    return res.status(422).json({ success: false, message: "date parameter is required (YYYY-MM-DD)" });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(422).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD" });
  }

  // Check if stored summary exists
  let summary = await DailySummary.findOne({ userId, date }).lean();

  if (!summary) {
    // Check if date is in the past or today
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const requestedDate = date; // YYYY-MM-DD
    
    // If date is today or in the past, calculate on-demand
    if (requestedDate <= today) {
      // Calculate summary on-demand for past dates that don't have stored data
      const timezone = tz || "UTC";
      summary = await calculateAndStoreSummary(userId, date, timezone);
    } else {
      // Future date - return empty summary
      return res.json({
        success: true,
        data: {
          totalMinutes: 0,
          byCategory: [],
          focus: { deepMinutes: 0, otherMinutes: 0 },
        },
      });
    }
  }

  res.json({ success: true, data: summary });
});

// Calculate and store summary for a specific date (used by scheduled job)
export const calculateAndStoreSummary = async (userId, dateStr, tz = "UTC") => {
  try {
    const { start, end } = dayWindow(dateStr, tz);

    const sessions = await TimeSession.find({
      userId,
      $or: [
        { startTime: { $lt: end }, endTime: { $gt: start } },
        { startTime: { $gte: start, $lt: end } },
      ],
    }).lean();

    // Calculate summary
    const byCategory = new Map();
    let total = 0,
      focus = 0;

    for (const s of sessions) {
      const sStart = new Date(Math.max(s.startTime, start));
      const sEnd = new Date(Math.min(s.endTime || new Date(), end));
      const mins = minutesBetween(sStart, sEnd);
      if (!mins) continue;

      total += mins;
      byCategory.set(s.categoryId, (byCategory.get(s.categoryId) || 0) + mins);
      if (FOCUS_CATEGORIES.has(s.categoryId)) focus += mins;
    }

    const summaryData = {
      userId,
      date: dateStr,
      totalMinutes: total,
      byCategory: [...byCategory.entries()].map(([categoryId, minutes]) => ({
        categoryId,
        minutes,
      })),
      focus: {
        deepMinutes: focus,
        otherMinutes: Math.max(0, total - focus),
      },
    };

    // Upsert: update if exists, create if not
    await DailySummary.findOneAndUpdate(
      { userId, date: dateStr },
      summaryData,
      { upsert: true, new: true }
    );

    return summaryData;
  } catch (error) {
    console.error(`Error calculating summary for user ${userId}, date ${dateStr}:`, error);
    throw error;
  }
};
// Get daily summaries for multiple dates in batch
export const getDailySummaryBatch = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { dates, tz } = req.query; // dates: comma-separated YYYY-MM-DD format

  if (!dates) {
    return res.status(422).json({ success: false, message: "dates parameter is required (comma-separated YYYY-MM-DD)" });
  }

  // Parse dates from comma-separated string
  const dateArray = dates.split(',').map(d => d.trim());
  
  // Validate all dates
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  for (const date of dateArray) {
    if (!dateRegex.test(date)) {
      return res.status(422).json({ success: false, message: `Invalid date format: ${date}. Use YYYY-MM-DD` });
    }
  }

  const timezone = tz || "UTC";
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const result = {};

  // Fetch all stored summaries in one query
  const storedSummaries = await DailySummary.find({
    userId,
    date: { $in: dateArray }
  }).lean();

  // Create a map of stored summaries
  const summaryMap = new Map();
  storedSummaries.forEach(summary => {
    summaryMap.set(summary.date, summary);
  });

  // Process each requested date
  for (const date of dateArray) {
    let summary = summaryMap.get(date);

    if (!summary) {
      // If date is today or in the past, calculate on-demand
      if (date <= today) {
        summary = await calculateAndStoreSummary(userId, date, timezone);
      } else {
        // Future date - return empty summary
        summary = {
          totalMinutes: 0,
          byCategory: [],
          focus: { deepMinutes: 0, otherMinutes: 0 },
        };
      }
    }

    // Map to the expected format (only totalMinutes for frontend)
    result[date] = {
      totalMinutes: summary.totalMinutes || 0
    };
  }

  res.json({ success: true, data: result });
});
