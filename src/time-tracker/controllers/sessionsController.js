import TimeSession from "../models/timeSession.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { classifyForUser } from "../utils/classifier.js";
import { dayWindow, rangeWindow } from "../utils/timeRange.js";

export const getRunning = asyncHandler(async (req, res) => {
  const doc = await TimeSession.findOne({ userId: req.auth0Id, endTime: null }).lean();
  // Return 200 with null data instead of 404 to avoid console errors in browser
  // Frontend handles null as "no running session"
  res.json({ success: true, data: doc || null });
});

export const startSession = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { taskId = null, taskTitle = null, groupTag = "@personal", categoryId, notes = "" } = req.body;

  // Stop any existing running session (atomic-ish)
  await TimeSession.updateMany({ userId, endTime: null }, { $set: { endTime: new Date() } });

  let finalCategory = categoryId;
  if (!finalCategory) {
    const guess = await classifyForUser(userId, taskTitle);
    finalCategory = guess.categoryId;
  }

  const created = await TimeSession.create({
    userId, taskId, taskTitle, groupTag,
    categoryId: finalCategory,
    startTime: new Date(),
    endTime: null,
    source: "timer",
    notes,
  });

  res.status(201).json({ success: true, data: created });
});

export const stopSession = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { id } = req.params;
  const { endTime } = req.body;

  const doc = await TimeSession.findOne({ _id: id, userId });
  if (!doc) return res.status(404).json({ success: false, message: "Session not found" });
  if (doc.endTime) return res.status(409).json({ success: false, message: "Session already stopped" });

  doc.endTime = endTime ? new Date(endTime) : new Date();
  await doc.save();
  res.json({ success: true, data: doc });
});

export const createManual = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const {
    taskId = null, taskTitle = null, groupTag = "@personal",
    categoryId, startTime, endTime, notes = ""
  } = req.body;

  if (!startTime || !endTime) {
    return res.status(422).json({ success: false, message: "startTime and endTime are required" });
  }
  const s = new Date(startTime);
  const e = new Date(endTime);
  if (e <= s) return res.status(422).json({ success: false, message: "endTime must be after startTime" });

  let finalCategory = categoryId;
  if (!finalCategory) {
    const guess = await classifyForUser(userId, taskTitle);
    finalCategory = guess.categoryId;
  }

  const created = await TimeSession.create({
    userId, taskId, taskTitle, groupTag,
    categoryId: finalCategory,
    startTime: s,
    endTime: e,
    source: "manual",
    notes,
  });

  res.status(201).json({ success: true, data: created });
});

export const patchSession = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { id } = req.params;
  const updates = {};
  ["taskId","taskTitle","groupTag","categoryId","notes"].forEach(k => {
    if (k in req.body) updates[k] = req.body[k];
  });
  if ("startTime" in req.body) updates.startTime = new Date(req.body.startTime);
  if ("endTime" in req.body)   updates.endTime   = req.body.endTime ? new Date(req.body.endTime) : null;

  const doc = await TimeSession.findOneAndUpdate({ _id: id, userId }, { $set: updates }, { new: true });
  if (!doc) return res.status(404).json({ success: false, message: "Session not found" });
  if (doc.endTime && doc.endTime <= doc.startTime) {
    return res.status(422).json({ success: false, message: "endTime must be after startTime" });
  }
  res.json({ success: true, data: doc });
});

export const deleteSession = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { id } = req.params;
  const doc = await TimeSession.findOneAndDelete({ _id: id, userId });
  if (!doc) return res.status(404).json({ success: false, message: "Session not found" });
  res.json({ success: true, message: "Deleted" });
});

export const listSessions = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { date, tz, start, end } = req.query;

  let window;
  if (date) window = dayWindow(date, tz);
  else if (start && end) window = rangeWindow(start, end, tz);
  else return res.status(422).json({ success: false, message: "Provide date or start&end" });

  const sessions = await TimeSession.find({
    userId,
    $or: [
      { startTime: { $lt: window.end }, endTime: { $gt: window.start } }, // overlapping
      { startTime: { $gte: window.start, $lt: window.end } }
    ],
  }).sort({ startTime: 1 });

  res.json({ success: true, data: sessions });
});