import User from "../models/User.js";
import Task from "../models/Task.js";
import Group from "../models/Group.js";

// Get or create user from Auth0 token
export const getOrCreateUser = async (req, res) => {
  try {
    const { auth0Id, userEmail, userName, userPicture } = req;

    // Use findOneAndUpdate with upsert to atomically find or create user
    // This prevents race conditions that could create duplicate users
    let user;
    let wasDeactivated = false;
    
    // Use findOneAndUpdate with upsert for truly atomic operation
    // This prevents race conditions that could create duplicate users
    try {
      user = await User.findOneAndUpdate(
        { auth0Id },
        {
          // Always update these on existing users
          $set: {
            lastLogin: new Date(),
            isOnline: true,
          },
          // Only set these on insert (when creating new user)
          $setOnInsert: {
            auth0Id,
            email: userEmail,
            name: userName,
            picture: userPicture,
            isActive: true,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        }
      );

      // Check if account was deactivated (user already existed)
      if (!user.isActive) {
        wasDeactivated = true;
        user.isActive = true;
      }

      // Only update missing fields if they don't exist (preserve customizations)
      // Note: name is never updated from Auth0 after first login to preserve user customizations
      let updated = false;
      if (!user.email && userEmail) {
        user.email = userEmail;
        updated = true;
      }
      if (!user.picture && !user.customPicture && userPicture) {
        user.picture = userPicture;
        updated = true;
      }

      if (updated || wasDeactivated) {
        await user.save();
      }
    } catch (error) {
      // Handle duplicate key error (race condition edge case)
      if (error.code === 11000 || error.codeName === 'DuplicateKey') {
        // User was created by another request, find and return it
        user = await User.findOne({ auth0Id });
        if (!user) {
          throw new Error("User creation failed due to duplicate key constraint");
        }
        // Update status for the found user
        if (!user.isActive) {
          wasDeactivated = true;
          user.isActive = true;
        }
        user.lastLogin = new Date();
        user.isOnline = true;
        await user.save();
      } else {
        throw error;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        auth0Id: user.auth0Id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        preferences: user.preferences,
      },
      reactivated: wasDeactivated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching or creating user",
      error: error.message,
    });
  }
};

// Get current user profile
export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findOne({ auth0Id: req.auth0Id }).select("-__v");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: error.message,
    });
  }
};

// Update user profile
// NOTE: This function only updates existing users - it does NOT create new users
// Users should be created via getOrCreateUser endpoint
export const updateUser = async (req, res) => {
  try {
    const { name, preferences } = req.body;

    // First check if user exists
    const existingUser = await User.findOne({ auth0Id: req.auth0Id });
    
    if (!existingUser) {
      // User doesn't exist - this shouldn't happen, but return error
      // Don't create user here - let getOrCreateUser handle that
      return res.status(404).json({
        success: false,
        message: "User not found. Please ensure you are logged in.",
      });
    }

    // Build update object only with provided fields
    const updateData = {};
    if (name !== undefined && name !== null) {
      updateData.name = name;
    }
    if (preferences !== undefined && preferences !== null) {
      updateData.preferences = preferences;
    }

    // Only proceed if there's something to update
    if (Object.keys(updateData).length === 0) {
      return res.status(200).json({
        success: true,
        data: existingUser,
        message: "No changes to update",
      });
    }

    // Update existing user
    const user = await User.findOneAndUpdate(
      { auth0Id: req.auth0Id },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
      message: "User updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating user",
      error: error.message,
    });
  }
};

// Logout user (set isOnline to false)
export const logoutUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { auth0Id: req.auth0Id },
      { isOnline: false },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User logged out successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error logging out user",
      error: error.message,
    });
  }
};

// Upload profile picture (store base64 in MongoDB)
export const uploadProfilePicture = async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        message: "Image data is required",
      });
    }

    // Validate base64 format
    if (!imageBase64.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        message: "Invalid image format. Must be base64 encoded image.",
      });
    }

    const user = await User.findOneAndUpdate(
      { auth0Id: req.auth0Id },
      { customPicture: imageBase64 },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { customPicture: user.customPicture },
      message: "Profile picture uploaded successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error uploading profile picture",
      error: error.message,
    });
  }
};

// Deactivate account (set isActive to false, keep all data)
export const deactivateAccount = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { auth0Id: req.auth0Id },
      { 
        isActive: false, // Account is deactivated
        isOnline: false, // Also set offline since they're deactivating
      },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Account deactivated successfully. Your data has been preserved.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deactivating account",
      error: error.message,
    });
  }
};

// Delete account (permanently delete user and their individual tasks)
export const deleteAccount = async (req, res) => {
  try {
    // First, verify user exists
    const user = await User.findOne({ auth0Id: req.auth0Id });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Delete all tasks where user is the owner (individual tasks only)
    // Note: Future collaborative tasks will not be deleted as they have collaborators
    await Task.deleteMany({ userId: req.auth0Id });

    // Delete the user
    await User.findOneAndDelete({ auth0Id: req.auth0Id });

    res.status(200).json({
      success: true,
      message: "Account and all associated data deleted permanently",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting account",
      error: error.message,
    });
  }
};

// Search users by name or email
export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const searchQuery = q.trim();

    // Search by name or email (case-insensitive, partial match)
    const users = await User.find({
      auth0Id: { $ne: req.auth0Id }, // Exclude current user
      isActive: true, // Only active users
      $or: [
        { name: { $regex: searchQuery, $options: "i" } },
        { email: { $regex: searchQuery, $options: "i" } },
      ],
    })
      .select("auth0Id name email picture customPicture")
      .limit(20); // Limit results

    // Format response to match frontend expectations
    const formattedUsers = users.map(user => ({
      userId: user.auth0Id,
      name: user.name || "Unknown",
      email: user.email || "",
      picture: user.customPicture || user.picture || "",
    }));

    res.status(200).json({
      success: true,
      data: formattedUsers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error searching users",
      error: error.message,
    });
  }
};

// Get pending group invitations
export const getPendingInvitations = async (req, res) => {
  try {
    // Find groups where user is a collaborator with pending status
    const groups = await Group.find({
      "collaborators.userId": req.auth0Id,
      "collaborators.status": "pending",
    })
      .sort({ createdAt: -1 });

    // Get owner details for each group
    const ownerIds = [...new Set(groups.map(g => g.owner))];
    const owners = await User.find({ auth0Id: { $in: ownerIds } });
    const ownerMap = new Map(owners.map(o => [o.auth0Id, o]));

    // Format response
    const invitations = groups.map(group => {
      const collaborator = group.collaborators.find(
        c => c.userId === req.auth0Id && c.status === "pending"
      );

      const owner = ownerMap.get(group.owner);

      return {
        groupId: group._id.toString(),
        groupName: group.name,
        groupTag: group.tag,
        role: collaborator.role,
        invitedAt: collaborator.invitedAt,
        owner: owner ? {
          userId: owner.auth0Id,
          name: owner.name,
          email: owner.email,
        } : {
          userId: group.owner,
        },
      };
    });

    res.status(200).json({
      success: true,
      data: invitations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching invitations",
      error: error.message,
    });
  }
};
