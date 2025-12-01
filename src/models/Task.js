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
    documentationLink: {
      type: String,
      default: "",
      trim: true,
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
    // Array of user IDs (auth0Id) assigned to this task
    assignedTo: [
      {
        type: String, // auth0Id
      },
    ],
    // Store assigned user info (name, email) to display even after they exit the group
    assignedUsers: [
      {
        userId: {
          type: String, // auth0Id
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        email: {
          type: String,
          required: false,
        },
      },
    ],
    // Team/Project association (future feature)
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },
    // Time planning template (for recurring time blocks when task is in-progress)
    timePlanning: {
      // Whether time planning is enabled for this task
      enabled: {
        type: Boolean,
        default: false
      },
      // Default time slot (template)
      defaultStartTime: {
        type: String, // "HH:MM" format, e.g., "09:00"
        default: null
      },
      defaultEndTime: {
        type: String, // "HH:MM" format, e.g., "10:30"
        default: null
      },
      // Alternative: duration in minutes (if endTime not provided)
      defaultDuration: {
        type: Number, // minutes
        default: null
      },
      // Category for time blocks (auto-classified or user-selected)
      categoryId: {
        type: String,
        enum: ["work", "learning", "admin", "health", "personal", "rest"],
        default: null
      },
      // Recurrence pattern when task is in-progress
      recurrence: {
        type: {
          type: String,
          enum: ["none", "daily", "weekdays"], // Start simple, can add "weekly", "custom" later
          default: "none"
        },
        // For future: end date for recurring plans
        endDate: {
          type: Date,
          default: null
        },
        // When recurrence was activated (task moved to in-progress)
        activatedAt: {
          type: Date,
          default: null
        }
      },
      // User preferences
      autoPlanOnStart: {
        type: Boolean,
        default: false // If true, automatically create plans when task goes in-progress
      },
      showPlanningPrompt: {
        type: Boolean,
        default: true // Whether to show popup when task moves to in-progress
      },
      // Metadata
      lastPlanGenerated: {
        type: Date,
        default: null // Track when we last generated plan instances
      },
      planInstanceCount: {
        type: Number,
        default: 0 // Number of active plan instances
      },
      // Dates when virtual plans should be excluded (user deleted the plan for that day)
      excludedDates: [{
        type: String, // ISO date string format: "YYYY-MM-DD"
      }]
    }
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

export default mongoose.models.Task || mongoose.model("Task", taskSchema);

