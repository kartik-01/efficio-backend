import express from "express";
import {
  getOrCreateUser,
  getCurrentUser,
  updateUser,
  logoutUser,
  uploadProfilePicture,
  deactivateAccount,
  deleteAccount,
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

// Upload profile picture
router.post("/profile/picture", uploadProfilePicture);

// Logout user (set isOnline to false)
router.post("/logout", logoutUser);

// Deactivate account (keep data)
router.post("/deactivate", deactivateAccount);

// Delete account (permanently delete user and their tasks)
router.delete("/account", deleteAccount);

export default router;
