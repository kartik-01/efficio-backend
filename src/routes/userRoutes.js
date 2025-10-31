import express from "express";
import {
  getOrCreateUser,
  getCurrentUser,
  updateUser,
} from "../controllers/userController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

// Get or create user from Auth0 token (first-time setup)
router.get("/me", getOrCreateUser);

// Get current user profile
router.get("/profile", getCurrentUser);

// Update user profile
router.put("/profile", updateUser);

export default router;
