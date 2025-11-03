import express from "express";
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from "../controllers/notificationController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All notification routes require authentication
router.use(authenticate);

// Get notifications for current user
router.get("/", getNotifications);
router.put("/:notificationId/read", markNotificationAsRead);
router.put("/read-all", markAllNotificationsAsRead);

export default router;

