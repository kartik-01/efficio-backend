import express from "express";
import { authenticate } from "../middleware/auth.js";
import {
	getNotifications,
	markNotificationAsRead,
	markAllNotificationsAsRead,
	getRawNotificationsForUser,
	deleteNotification,
	clearTaskNotifications,
} from "../controllers/notificationController.js";

const router = express.Router();

// All notification routes require authentication
router.use(authenticate);

// Get notifications for current user
router.get("/", getNotifications);
router.put("/read-all", markAllNotificationsAsRead);
router.delete("/task-assignments", clearTaskNotifications);
router.put("/:notificationId/read", markNotificationAsRead);
router.delete("/:notificationId", deleteNotification);

// Dev-only: inspect raw Notification documents for a user
if (process.env.NODE_ENV !== 'production') {
	router.get('/debug/:userId', getRawNotificationsForUser);
}

export default router;

