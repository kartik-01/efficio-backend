import User from "../models/User.js";
import Group from "../models/Group.js";
import Task from "../models/Task.js";

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

// Get notifications for user
export const getNotifications = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    // Get pending invitations count
    const pendingInvitations = await Group.find({
      "collaborators.userId": req.auth0Id,
      "collaborators.status": "pending",
    });

    const pendingInvitationsCount = pendingInvitations.length;

    // Get all groups user has accepted access to
    const accessibleGroups = await Group.find({
      $or: [
        { owner: req.auth0Id },
        { "collaborators.userId": req.auth0Id, "collaborators.status": "accepted" },
      ],
    });

    const accessibleGroupTags = accessibleGroups.map(g => g.tag);

    // Get tasks assigned to user in groups (created in last 7 days, not completed)
    const assignedTasks = await Task.find({
      groupTag: { $in: accessibleGroupTags },
      assignedTo: { $in: [req.auth0Id] },
      status: { $ne: "completed" },
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Filter to only show tasks from groups where user has accepted access
    const filteredAssignedTasks = assignedTasks.filter(task => {
      if (!task.groupTag || task.groupTag === '@personal') return false;
      const group = accessibleGroups.find(g => g.tag === task.groupTag);
      if (!group) return false;
      
      // Check if user has accepted access (owner or accepted collaborator)
      const hasAcceptedAccess = group.owner === req.auth0Id || 
        group.collaborators.some(c => c.userId === req.auth0Id && c.status === 'accepted');
      
      return hasAcceptedAccess;
    });

    // Format assigned tasks as notifications
    const taskNotifications = filteredAssignedTasks.map(task => ({
      id: task._id.toString(),
      type: "task_assigned",
      taskId: task._id.toString(),
      taskTitle: task.title,
      groupTag: task.groupTag,
      createdAt: task.createdAt || task._id.getTimestamp(),
      read: false, // Could add read status tracking later
    }));

    // Format pending invitations as notifications
    const invitationNotifications = pendingInvitations.map(group => ({
      id: `invitation_${group._id}`,
      type: "invitation",
      groupId: group._id.toString(),
      groupName: group.name,
      groupTag: group.tag,
      invitedAt: group.collaborators.find(c => c.userId === req.auth0Id)?.invitedAt || group.createdAt,
      read: false,
    }));

    // Combine and sort by date (newest first)
    const allNotifications = [...invitationNotifications, ...taskNotifications].sort(
      (a, b) => new Date(b.createdAt || b.invitedAt) - new Date(a.createdAt || a.invitedAt)
    );

    const totalUnreadCount = allNotifications.length;

    res.status(200).json({
      success: true,
      data: {
        notifications: allNotifications,
        pendingInvitationsCount,
        taskAssignmentsCount: taskNotifications.length,
        totalUnreadCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching notifications",
      error: error.message,
    });
  }
};

