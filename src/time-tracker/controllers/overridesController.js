import UserCategoryOverride from "../models/userCategoryOverride.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const listOverrides = asyncHandler(async (req, res) => {
  const docs = await UserCategoryOverride.find({ userId: req.auth0Id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: docs });
});

export const createOverride = asyncHandler(async (req, res) => {
  const { pattern, categoryId } = req.body;
  const doc = await UserCategoryOverride.create({ userId: req.auth0Id, pattern, categoryId });
  res.status(201).json({ success: true, data: doc });
});

export const deleteOverride = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const doc = await UserCategoryOverride.findOneAndDelete({ _id: id, userId: req.auth0Id });
  if (!doc) return res.status(404).json({ success: false, message: "Override not found" });
  res.json({ success: true, message: "Deleted" });
});