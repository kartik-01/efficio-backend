import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    // Group/Workspace name
    name: {
      type: String,
      required: [true, "Group name is required"],
      trim: true,
    },
    // Unique tag identifier (e.g., "@web-ui", "@personal")
    tag: {
      type: String,
      required: [true, "Group tag is required"],
      unique: true,
      trim: true,
      lowercase: true,
      // Ensure tag starts with @
      validate: {
        validator: function(v) {
          return v.startsWith('@');
        },
        message: 'Tag must start with @'
      }
    },
    // Color for UI display
    color: {
      type: String,
      default: '#3b82f6', // Default blue
    },
    // Owner/Creator (using auth0Id)
    owner: {
      type: String,
      required: [true, "Group owner is required"],
      index: true,
    },
    // Collaborators/Team members
    collaborators: [
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
          required: true,
        },
        role: {
          type: String,
          enum: ["viewer", "editor", "admin"],
          default: "editor",
        },
        status: {
          type: String,
          enum: ["pending", "accepted", "declined"],
          default: "pending",
        },
        invitedAt: {
          type: Date,
          default: Date.now,
        },
        acceptedAt: {
          type: Date,
          default: null,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
groupSchema.index({ owner: 1 });
groupSchema.index({ "collaborators.userId": 1 });
groupSchema.index({ "collaborators.status": 1 });
groupSchema.index({ tag: 1 });

export default mongoose.model("Group", groupSchema);

