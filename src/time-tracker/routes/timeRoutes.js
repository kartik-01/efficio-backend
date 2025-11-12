import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";

import {
  getRunning, startSession, stopSession,
  createManual, patchSession, deleteSession, listSessions,
} from "../controllers/sessionsController.js";

import { getSummary } from "../controllers/summaryController.js";
import { classify } from "../controllers/classifyController.js";
import { listCategories } from "../controllers/categoriesController.js";
import { listGoals, createGoal, patchGoal } from "../controllers/goalsController.js";
import { listOverrides, createOverride, deleteOverride } from "../controllers/overridesController.js";
import { listPlans, createPlan, patchPlan, deletePlan, startFromPlan, completePlan } from "../controllers/plansController.js";

const router = express.Router();

// Sessions
router.get("/sessions/running", getRunning);
router.post("/sessions/start", startSession);
router.post("/sessions/:id/stop", stopSession);
router.post("/sessions", createManual);
router.patch("/sessions/:id", patchSession);
router.delete("/sessions/:id", deleteSession);
router.get("/sessions", listSessions);

// Summary (quick insights)
router.get("/summary", getSummary);

// Classify (category suggestion)
router.post("/classify", classify);

// Categories (fixed set)
router.get("/categories", listCategories);

// Goals
router.get("/goals", listGoals);
router.post("/goals", createGoal);
router.patch("/goals/:id", patchGoal);

// Overrides (user-defined patterns → category)
router.get("/overrides", listOverrides);
router.post("/overrides", createOverride);
router.delete("/overrides/:id", deleteOverride);

  
// Plans (planning layer)
router.get("/plans", listPlans);
router.post("/plans", createPlan);
router.patch("/plans/:id", patchPlan);
router.delete("/plans/:id", deletePlan);
router.post("/plans/:id/start", startFromPlan);
router.post("/plans/:id/complete", completePlan);

export default router;