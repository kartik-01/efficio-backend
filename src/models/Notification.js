import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["invitation", "task_assigned"],
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    taskTitle: {
      type: String,
      default: null,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    groupTag: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    groupName: {
      type: String,
      default: null,
    },
    invitedAt: {
      type: Date,
      default: null,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index(
  { userId: 1, type: 1, taskId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { type: "task_assigned", taskId: { $exists: true } },
  }
);
notificationSchema.index(
  { userId: 1, type: 1, groupId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { type: "invitation", groupId: { $exists: true } },
  }
);

export default mongoose.models.Notification || mongoose.model("Notification", notificationSchema);

