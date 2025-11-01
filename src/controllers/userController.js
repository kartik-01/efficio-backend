import User from "../models/User.js";

// Get or create user from Auth0 token
export const getOrCreateUser = async (req, res) => {
  try {
    const { auth0Id, userEmail, userName, userPicture } = req;

    // Find or create user
    let user = await User.findOne({ auth0Id });

    if (!user) {
      // Create new user
      user = await User.create({
        auth0Id,
        email: userEmail,
        name: userName,
        picture: userPicture,
        lastLogin: new Date(),
      });
    } else {
      // Update last login and set user as active (logged in)
      user.lastLogin = new Date();
      user.isActive = true;
      await user.save();
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
export const updateUser = async (req, res) => {
  try {
    const { name, preferences } = req.body;

    const user = await User.findOneAndUpdate(
      { auth0Id: req.auth0Id },
      {
        ...(name && { name }),
        ...(preferences && { preferences }),
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

// Logout user (set isActive to false)
export const logoutUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { auth0Id: req.auth0Id },
      { isActive: false },
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
