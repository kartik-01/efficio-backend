import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    // Owner/Creator of the task (using auth0Id as primary identifier)
    userId: {
      type: String,
      required: [true, "User ID is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      default: "",
      trim: true,
    },
    priority: {
      type: String,
      enum: ["High", "Medium", "Low"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed"],
      default: "pending",
    },
    // Timestamps for status changes
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: String,
      default: "",
    },
    progress: {
      type: Number,
      default: undefined,
      min: 0,
      max: 100,
    },
    isOverdue: {
      type: Boolean,
      default: false,
    },
    // Future: Collaboration features
    // Array of user IDs who have access to this task (using auth0Id)
    collaborators: [
      {
        user: {
          type: String, // auth0Id
        },
        role: {
          type: String,
          enum: ["viewer", "editor", "admin"],
          default: "editor",
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // For shared tasks/projects
    isShared: {
      type: Boolean,
      default: false,
    },
    // Tags for organization (future feature)
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    // Group/Workspace tag (e.g., "@personal", "@web-ui")
    groupTag: {
      type: String,
      default: "@personal",
      trim: true,
      lowercase: true,
      index: true,
    },
    // Team/Project association (future feature)
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
taskSchema.index({ userId: 1, createdAt: -1 });
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ isShared: 1 });
taskSchema.index({ teamId: 1 });
taskSchema.index({ projectId: 1 });
taskSchema.index({ groupTag: 1, createdAt: -1 });
taskSchema.index({ groupTag: 1, status: 1 });

export default mongoose.model("Task", taskSchema);

