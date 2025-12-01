import express from "express";
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  updateTaskProgress,
  configureTimePlanning,
} from "../controllers/taskController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All task routes require authentication
router.use(authenticate);

// Get all tasks
router.get("/", getTasks);

// Get single task
router.get("/:id", getTaskById);

// Create new task
router.post("/", createTask);

// Update task
router.put("/:id", updateTask);

// Update task status
router.patch("/:id/status", updateTaskStatus);

// Update task progress
router.patch("/:id/progress", updateTaskProgress);

// Configure time planning for a task
router.patch("/:id/time-planning", configureTimePlanning);

// Delete task
router.delete("/:id", deleteTask);

export default router;

