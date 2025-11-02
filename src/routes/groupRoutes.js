import express from "express";
import {
  createGroup,
  getUserGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  inviteUser,
  acceptInvitation,
  declineInvitation,
  updateMemberRole,
  removeMember,
  getGroupMembers,
  exitGroup,
} from "../controllers/groupController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All group routes require authentication
router.use(authenticate);

// Create new group/workspace
router.post("/", createGroup);

// Get all groups user belongs to and pending invitations
router.get("/", getUserGroups);

// Invite user to group (must come before /:id routes)
router.post("/:id/invite", inviteUser);

// Accept group invitation
router.post("/:id/accept", acceptInvitation);

// Decline group invitation
router.post("/:id/decline", declineInvitation);

// Exit group (members leave themselves) - must come before /:id routes
router.post("/:id/exit", exitGroup);

// Get all group members (must come before /:id routes)
router.get("/:id/members", getGroupMembers);

// Update member role
router.put("/:id/members/:userId", updateMemberRole);

// Remove member from group
router.delete("/:id/members/:userId", removeMember);

// Get single group by ID
router.get("/:id", getGroupById);

// Update group (name, tag, color) - owner or admin only
router.put("/:id", updateGroup);

// Delete group - owner only
router.delete("/:id", deleteGroup);

export default router;

