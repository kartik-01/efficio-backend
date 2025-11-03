import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // User who owns this notification (auth0Id)
    userId: {
      type: String,
      required: true,
      index: true,
    },
    // Type of notification
    type: {
      type: String,
      enum: ["invitation", "task_assigned"],
      required: true,
    },
    // Related task ID (for task_assigned)
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
    },
    // Related group ID (for invitation or task_assigned)
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
    },
    // Group tag (for quick lookup)
    groupTag: {
      type: String,
      index: true,
    },
    // Read status
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Timestamp when notification was created
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, groupId: 1 }, { unique: true, sparse: true });

export default mongoose.model("Notification", notificationSchema);

