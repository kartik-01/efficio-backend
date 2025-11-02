import express from "express";
import { getNotifications } from "../controllers/notificationController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All notification routes require authentication
router.use(authenticate);

// Get notifications for current user
router.get("/", getNotifications);

export default router;

