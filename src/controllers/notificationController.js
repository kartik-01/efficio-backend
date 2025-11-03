import User from "../models/User.js";
import Group from "../models/Group.js";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";

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

    // Get pending invitations (only those that are actually pending, not accepted/declined)
    const pendingInvitations = await Group.find({
      "collaborators.userId": req.auth0Id,
      "collaborators.status": "pending",
    });

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

    // Get or create notification records for invitations and tasks
    const now = new Date();
    
    // Create/update invitation notifications
    for (const group of pendingInvitations) {
      await Notification.findOneAndUpdate(
        {
          userId: req.auth0Id,
          type: "invitation",
          groupId: group._id,
        },
        {
          userId: req.auth0Id,
          type: "invitation",
          groupId: group._id,
          groupTag: group.tag,
          read: false,
          createdAt: group.collaborators.find(c => c.userId === req.auth0Id)?.invitedAt || group.createdAt,
        },
        { upsert: true, new: true }
      );
    }

    // Create/update task notifications
    for (const task of filteredAssignedTasks) {
      await Notification.findOneAndUpdate(
        {
          userId: req.auth0Id,
          type: "task_assigned",
          taskId: task._id,
        },
        {
          userId: req.auth0Id,
          type: "task_assigned",
          taskId: task._id,
          groupId: accessibleGroups.find(g => g.tag === task.groupTag)?._id,
          groupTag: task.groupTag,
          read: false,
          createdAt: task.createdAt || task._id.getTimestamp(),
        },
        { upsert: true, new: true }
      );
    }

    // Remove notifications for invitations that are no longer pending (accepted/declined)
    const pendingInvitationIds = pendingInvitations.map(g => g._id.toString());
    await Notification.deleteMany({
      userId: req.auth0Id,
      type: "invitation",
      groupId: { $nin: pendingInvitations.map(g => g._id) },
    });

    // Remove notifications for tasks that are completed or no longer assigned
    const activeTaskIds = filteredAssignedTasks.map(t => t._id.toString());
    await Notification.deleteMany({
      userId: req.auth0Id,
      type: "task_assigned",
      taskId: { $nin: filteredAssignedTasks.map(t => t._id) },
    });

    // Get all unread notifications for user
    const notificationRecords = await Notification.find({
      userId: req.auth0Id,
      read: false,
    })
      .sort({ createdAt: -1 })
      .lean();

    // Format notifications with details
    const formattedNotifications = await Promise.all(
      notificationRecords.map(async (notif) => {
        if (notif.type === "invitation") {
          const group = pendingInvitations.find(g => g._id.toString() === notif.groupId?.toString());
          if (!group) return null; // Skip if group no longer exists or no longer pending
          
          return {
            id: notif._id.toString(),
            type: "invitation",
            groupId: group._id.toString(),
            groupName: group.name,
            groupTag: group.tag,
            invitedAt: group.collaborators.find(c => c.userId === req.auth0Id)?.invitedAt || group.createdAt,
            createdAt: notif.createdAt,
            read: notif.read,
          };
        } else if (notif.type === "task_assigned") {
          const task = filteredAssignedTasks.find(t => t._id.toString() === notif.taskId?.toString());
          if (!task) return null; // Skip if task no longer exists
          
          return {
            id: notif._id.toString(),
            type: "task_assigned",
            taskId: task._id.toString(),
            taskTitle: task.title,
            groupTag: task.groupTag,
            createdAt: task.createdAt || task._id.getTimestamp(),
            read: notif.read,
          };
        }
        return null;
      })
    );

    // Filter out null values
    const allNotifications = formattedNotifications.filter(n => n !== null);

    const pendingInvitationsCount = pendingInvitations.length;
    const taskNotifications = allNotifications.filter(n => n.type === "task_assigned");
    const invitationNotifications = allNotifications.filter(n => n.type === "invitation");
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

// Mark notification as read
export const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        userId: req.auth0Id, // Ensure user can only mark their own notifications as read
      },
      {
        read: true,
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error marking notification as read",
      error: error.message,
    });
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      {
        userId: req.auth0Id,
        read: false,
      },
      {
        read: true,
      }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error marking all notifications as read",
      error: error.message,
    });
  }
};

