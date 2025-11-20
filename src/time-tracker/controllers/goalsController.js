import TimeGoal from "../models/timeGoal.js";
import TimeSession from "../models/timeSession.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dayWindow, rangeWindow, weekWindow } from "../utils/timeRange.js";

function minutesBetween(a, b) { return Math.max(0, Math.round((b - a) / 60000)); }

export const listGoals = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { withProgress = "false", range = "today", tz } = req.query;

  // Get all active goals
  const goals = await TimeGoal.find({ userId, active: true }).lean();

  if (withProgress !== "true") {
    return res.json({ success: true, data: goals });
  }

  // Calculate progress for each goal based on its period
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const timezone = tz || "UTC";

  const withProg = await Promise.all(goals.map(async (g) => {
    let start, end;
    
    if (g.period === "daily") {
      // For daily goals, use today's window
      ({ start, end } = dayWindow(today, timezone));
    } else {
      // For weekly goals, use the week window (Monday to Sunday)
      ({ start, end } = weekWindow(today, timezone));
    }

    // Get sessions for this goal's category within the time window
    const sessions = await TimeSession.find({
      userId,
      categoryId: g.categoryId,
      $or: [
        { startTime: { $lt: end }, endTime: { $gt: start } },
        { startTime: { $gte: start, $lt: end } },
      ],
    }).lean();

    // Calculate total minutes for this category in the time window
    let totalMinutes = 0;
    for (const s of sessions) {
      const sStart = new Date(Math.max(s.startTime, start));
      const sEnd = new Date(Math.min(s.endTime || new Date(), end));
      const mins = minutesBetween(sStart, sEnd);
      if (mins > 0) {
        totalMinutes += mins;
      }
    }

    return {
      ...g,
      progress: {
        minutes: totalMinutes,
        met: totalMinutes >= g.targetMinutes,
      },
    };
  }));

  res.json({ success: true, data: withProg });
});

export const createGoal = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { categoryId, period, targetMinutes, active = true } = req.body;
  const doc = await TimeGoal.create({ userId, categoryId, period, targetMinutes, active });
  res.status(201).json({ success: true, data: doc });
});

export const patchGoal = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { id } = req.params;
  const updates = {};
  ["categoryId","period","targetMinutes","active"].forEach(k => {
    if (k in req.body) updates[k] = req.body[k];
  });
  const doc = await TimeGoal.findOneAndUpdate({ _id: id, userId }, { $set: updates }, { new: true });
  if (!doc) return res.status(404).json({ success: false, message: "Goal not found" });
  res.json({ success: true, data: doc });
});