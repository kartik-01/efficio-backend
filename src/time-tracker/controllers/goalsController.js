import TimeGoal from "../models/timeGoal.js";
import TimeSession from "../models/timeSession.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dayWindow, rangeWindow } from "../utils/timeRange.js";

function minutesBetween(a, b) { return Math.max(0, Math.round((b - a) / 60000)); }

export const listGoals = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { withProgress = "false", range = "today", tz } = req.query;

  const goals = await TimeGoal.find({ userId, active: true }).lean();

  if (withProgress !== "true") {
    return res.json({ success: true, data: goals });
  }

  let start, end;
  if (range === "today") ({ start, end } = dayWindow(new Date().toISOString().slice(0,10), tz));
  else if (req.query.start && req.query.end) ({ start, end } = rangeWindow(req.query.start, req.query.end, tz));
  else return res.status(422).json({ success: false, message: "Provide range=today or start&end" });

  const sessions = await TimeSession.find({
    userId,
    $or: [
      { startTime: { $lt: end }, endTime: { $gt: start } },
      { startTime: { $gte: start, $lt: end } },
    ],
  }).lean();

  const byCategory = new Map();
  for (const s of sessions) {
    const sStart = new Date(Math.max(s.startTime, start));
    const sEnd   = new Date(Math.min(s.endTime || new Date(), end));
    const mins = minutesBetween(sStart, sEnd);
    if (!mins) continue;
    byCategory.set(s.categoryId, (byCategory.get(s.categoryId) || 0) + mins);
  }

  const withProg = goals.map(g => {
    const m = (g.period === "daily") ? (byCategory.get(g.categoryId) || 0) : (byCategory.get(g.categoryId) || 0); // simple v1
    return { ...g, progress: { minutes: m, met: m >= g.targetMinutes } };
  });

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