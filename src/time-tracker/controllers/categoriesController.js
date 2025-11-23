import { CATEGORIES } from "../utils/constants.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const listCategories = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: CATEGORIES });
});