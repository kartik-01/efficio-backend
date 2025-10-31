import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // Auth0 unique identifier (sub claim from JWT token)
    auth0Id: {
      type: String,
      required: [true, "Auth0 ID is required"],
      unique: true,
    },
    email: {
      type: String,
      required: false, // Make optional since access tokens may not include it
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    picture: {
      type: String, // Profile picture URL from Auth0
    },
    // User preferences (can be extended)
    preferences: {
      theme: {
        type: String,
        enum: ["light", "dark"],
        default: "light",
      },
      notifications: {
        type: Boolean,
        default: true,
      },
    },
    // For future features: teams/organizations
    teams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
      },
    ],
    // Metadata
    lastLogin: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
// Note: auth0Id already has an index from unique: true, so we don't need to create it again
userSchema.index({ email: 1 });

export default mongoose.model("User", userSchema);

