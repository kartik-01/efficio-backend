import TimePlan from "../models/timePlan.js";
import TimeSession from "../models/timeSession.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dayWindow, rangeWindow } from "../utils/timeRange.js";
import { classifyForUser } from "../utils/classifier.js";

export const listPlans = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { date, tz, start, end, status } = req.query;

  let window;
  if (date) window = dayWindow(date, tz);
  else if (start && end) window = rangeWindow(start, end, tz);
  else return res.status(422).json({ success: false, message: "Provide date or start&end" });

  const q = {
    userId,
    $or: [
      { startTime: { $lt: window.end }, endTime: { $gt: window.start } },
      { startTime: { $gte: window.start, $lt: window.end } },
    ],
  };
  if (status) q.status = status;

  const plans = await TimePlan.find(q).sort({ startTime: 1 }).lean();
  res.json({ success: true, data: plans });
});

export const createPlan = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const body = req.body || {};
  const { taskId=null, taskTitle=null, groupTag="@personal", categoryId, startTime, endTime, notes="" } = body;

  if (!startTime || !endTime) return res.status(422).json({ success: false, message: "startTime and endTime are required" });
  if (new Date(endTime) <= new Date(startTime)) return res.status(422).json({ success: false, message: "endTime must be after startTime" });

  let cat = categoryId;
  if (!cat) {
    const guess = await classifyForUser(userId, taskTitle);
    cat = guess.categoryId;
  }

  const plan = await TimePlan.create({ userId, taskId, taskTitle, groupTag, categoryId: cat, startTime, endTime, notes, status: "scheduled" });
  res.status(201).json({ success: true, data: plan });
});

export const patchPlan = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { id } = req.params;
  const u = {};
  ["taskId","taskTitle","groupTag","categoryId","notes","status"].forEach(k => { if (k in req.body) u[k] = req.body[k]; });
  if ("startTime" in req.body) u.startTime = new Date(req.body.startTime);
  if ("endTime" in req.body) u.endTime = new Date(req.body.endTime);

  const doc = await TimePlan.findOneAndUpdate({ _id: id, userId }, { $set: u }, { new: true });
  if (!doc) return res.status(404).json({ success: false, message: "Plan not found" });
  if (doc.endTime <= doc.startTime) return res.status(422).json({ success: false, message: "endTime must be after startTime" });
  res.json({ success: true, data: doc });
});

export const deletePlan = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { id } = req.params;
  const doc = await TimePlan.findOneAndDelete({ _id: id, userId });
  if (!doc) return res.status(404).json({ success: false, message: "Plan not found" });
  res.json({ success: true, message: "Deleted" });
});

// Convert a plan into a running session (start now)
export const startFromPlan = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { id } = req.params;
  const plan = await TimePlan.findOne({ _id: id, userId });
  if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });

  // Stop any running session
  await TimeSession.updateMany({ userId, endTime: null }, { $set: { endTime: new Date() } });

  const session = await TimeSession.create({
    userId,
    taskId: plan.taskId,
    taskTitle: plan.taskTitle,
    groupTag: plan.groupTag,
    categoryId: plan.categoryId,
    startTime: new Date(),
    endTime: null,
    source: "timer",
    notes: plan.notes || "",
  });

  plan.status = "in_progress";
  plan.sessionId = session._id;
  await plan.save();

  res.status(201).json({ success: true, data: { plan, session } });
});

// Mark plan done by creating a completed manual session that matches planned window (if no session yet)
export const completePlan = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { id } = req.params;
  const plan = await TimePlan.findOne({ _id: id, userId });
  if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });

  let session = null;
  if (!plan.sessionId) {
    session = await TimeSession.create({
      userId,
      taskId: plan.taskId,
      taskTitle: plan.taskTitle,
      groupTag: plan.groupTag,
      categoryId: plan.categoryId,
      startTime: plan.startTime,
      endTime: plan.endTime,
      source: "manual",
      notes: plan.notes || "",
    });
    plan.sessionId = session._id;
  }
  plan.status = "done";
  await plan.save();

  res.json({ success: true, data: { plan, session } });
});