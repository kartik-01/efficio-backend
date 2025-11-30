import express from "express";
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead, getRawNotificationsForUser } from "../controllers/notificationController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All notification routes require authentication
router.use(authenticate);

// Get notifications for current user
router.get("/", getNotifications);
router.put("/:notificationId/read", markNotificationAsRead);
router.put("/read-all", markAllNotificationsAsRead);

// Dev-only: inspect raw Notification documents for a user
if (process.env.NODE_ENV !== 'production') {
	router.get('/debug/:userId', getRawNotificationsForUser);
}

export default router;

