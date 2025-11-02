import express from "express";
import {
  getActivities,
  createActivity,
} from "../controllers/activityController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All activity routes require authentication
router.use(authenticate);

// Get activities
router.get("/", getActivities);

// Create activity (usually called internally)
router.post("/", createActivity);

export default router;

