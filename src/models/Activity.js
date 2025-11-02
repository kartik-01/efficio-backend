import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    // Type of activity
    type: {
      type: String,
      enum: ["task_created", "task_moved", "task_deleted", "task_updated", "member_added", "member_removed", "member_role_changed"],
      required: true,
    },
    // Task reference (if applicable)
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
    },
    // Task title for display (denormalized for performance)
    taskTitle: {
      type: String,
    },
    // User who performed the action (auth0Id)
    userId: {
      type: String,
      required: true,
      index: true,
    },
    // User name for display (denormalized)
    userName: {
      type: String,
      required: true,
    },
    // Group/Workspace tag (if applicable)
    groupTag: {
      type: String,
      index: true,
    },
    // Status transition (for task_moved)
    fromStatus: {
      type: String,
      enum: ["pending", "in-progress", "completed"],
    },
    toStatus: {
      type: String,
      enum: ["pending", "in-progress", "completed"],
    },
    // Timestamp
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
activitySchema.index({ groupTag: 1, timestamp: -1 });
activitySchema.index({ userId: 1, timestamp: -1 });

export default mongoose.model("Activity", activitySchema);

