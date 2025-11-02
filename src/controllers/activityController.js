import Activity from "../models/Activity.js";
import User from "../models/User.js";
import Group from "../models/Group.js";

// Helper function to get or create user
const getOrCreateUserFromAuth = async (auth0Id, email, name, picture) => {
  let user;
  try {
    user = await User.findOneAndUpdate(
      { auth0Id },
      {
        $set: {
          lastLogin: new Date(),
          isOnline: true,
        },
        $setOnInsert: {
          auth0Id,
          email: email,
          name: name,
          picture: picture || undefined,
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

    if (!user.isActive) {
      user.isActive = true;
    }

    let updated = false;
    if (!user.email && email) {
      user.email = email;
      updated = true;
    }
    if (!user.picture && !user.customPicture && picture) {
      user.picture = picture;
      updated = true;
    }

    if (updated || !user.isActive) {
      await user.save();
    }
  } catch (error) {
    if (error.code === 11000 || error.codeName === 'DuplicateKey') {
      user = await User.findOne({ auth0Id });
      if (!user) {
        throw new Error("User creation failed");
      }
      if (!user.isActive) {
        user.isActive = true;
      }
      user.lastLogin = new Date();
      user.isOnline = true;
      await user.save();
    } else {
      throw error;
    }
  }
  return user;
};

// Get activities for user
export const getActivities = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const { groupTag, limit = 50 } = req.query;

    // Build query
    const query = {};

    // If groupTag is provided, filter by it
    if (groupTag) {
      // Verify user has access to this group
      if (groupTag !== "@personal") {
        const group = await Group.findOne({
          tag: groupTag,
          $or: [
            { owner: req.auth0Id },
            { "collaborators.userId": req.auth0Id, "collaborators.status": "accepted" },
          ],
        });

        if (!group) {
          return res.status(403).json({
            success: false,
            message: "You don't have access to this group",
          });
        }
      }

      query.groupTag = groupTag;
    } else {
      // Get all accessible groups for user
      const accessibleGroups = await Group.find({
        $or: [
          { owner: req.auth0Id },
          { "collaborators.userId": req.auth0Id, "collaborators.status": "accepted" },
        ],
      });

      const accessibleGroupTags = accessibleGroups.map(g => g.tag);

      // Show activities from accessible groups and personal
      query.groupTag = { $in: [...accessibleGroupTags, "@personal", null] };
    }

    const activities = await Activity.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching activities",
      error: error.message,
    });
  }
};

// Create activity (usually called internally)
export const createActivity = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const activity = await Activity.create({
      ...req.body,
      userId: req.auth0Id,
      userName: req.userName || user.name || "Unknown",
      timestamp: req.body.timestamp || new Date(),
    });

    res.status(201).json({
      success: true,
      data: activity,
      message: "Activity created successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error creating activity",
      error: error.message,
    });
  }
};

