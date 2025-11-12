import { asyncHandler } from "../utils/asyncHandler.js";
import { classifyForUser } from "../utils/classifier.js";

export const classify = asyncHandler(async (req, res) => {
  const userId = req.auth0Id;
  const { title = "" } = req.body;
  const guess = await classifyForUser(userId, title);
  res.json({ success: true, data: guess });
});