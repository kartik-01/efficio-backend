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
    customPicture: {
      type: String, // Base64-encoded custom profile picture (stored in MongoDB)
    },
    // User preferences (can be extended)
    preferences: {
      theme: {
        type: String,
        enum: ["light", "dark", "auto"],
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
    // Account status: true = active account, false = deactivated account
    isActive: {
      type: Boolean,
      default: true,
    },
    // Online status: true = currently logged in/online, false = logged out/offline
    isOnline: {
      type: Boolean,
      default: false,
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

