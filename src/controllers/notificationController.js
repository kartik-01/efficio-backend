import Group from "../models/Group.js";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";

const EMPTY_RESPONSE = {
  notifications: [],
  pendingInvitationsCount: 0,
  taskAssignmentsCount: 0,
  totalUnreadCount: 0,
};

const uniqueObjectIds = (items) => {
  const set = new Set();
  for (const value of items) {
    if (!value) continue;
    set.add(value.toString());
  }
  return Array.from(set);
};

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.auth0Id })
      .sort({ createdAt: -1 })
      .lean();

    if (!notifications.length) {
      return res.status(200).json({ success: true, data: EMPTY_RESPONSE });
    }

    const groupIds = uniqueObjectIds(notifications.map((n) => n.groupId).filter(Boolean));
    const taskIds = uniqueObjectIds(notifications.map((n) => n.taskId).filter(Boolean));

    const [groups, tasks] = await Promise.all([
      groupIds.length ? Group.find({ _id: { $in: groupIds } }).lean() : [],
      taskIds.length ? Task.find({ _id: { $in: taskIds } }).lean() : [],
    ]);

    const groupMap = new Map(groups.map((g) => [g._id.toString(), g]));
    const taskMap = new Map(tasks.map((t) => [t._id.toString(), t]));

    const formatted = [];
    const staleNotificationIds = [];

    for (const notif of notifications) {
      if (notif.type === "invitation") {
        const groupId = notif.groupId ? notif.groupId.toString() : null;
        const group = groupId ? groupMap.get(groupId) : null;
        if (!group) {
          staleNotificationIds.push(notif._id);
          continue;
        }
        const collaborator = (group.collaborators || []).find(
          (c) => c.userId === req.auth0Id && c.status === "pending"
        );
        if (!collaborator) {
          staleNotificationIds.push(notif._id);
          continue;
        }
        formatted.push({
          id: notif._id.toString(),
          type: "invitation",
          groupId: group._id.toString(),
          groupName: group.name,
          groupTag: group.tag,
          invitedAt: collaborator.invitedAt || notif.invitedAt || notif.createdAt,
          createdAt: notif.createdAt,
          acknowledgedAt: notif.acknowledgedAt,
        });
      } else if (notif.type === "task_assigned") {
        const taskId = notif.taskId ? notif.taskId.toString() : null;
        const task = taskId ? taskMap.get(taskId) : null;
        if (!task) {
          staleNotificationIds.push(notif._id);
          continue;
        }
        const stillAssigned = Array.isArray(task.assignedTo)
          ? task.assignedTo.some((id) => id && id.toString().trim() === req.auth0Id)
          : false;
        if (!stillAssigned) {
          staleNotificationIds.push(notif._id);
          continue;
        }
        formatted.push({
          id: notif._id.toString(),
          type: "task_assigned",
          taskId: task._id.toString(),
          taskTitle: task.title,
          groupTag: task.groupTag,
          createdAt: notif.createdAt,
          acknowledgedAt: notif.acknowledgedAt,
        });
      }
    }

    if (staleNotificationIds.length) {
      await Notification.deleteMany({ _id: { $in: staleNotificationIds } });
    }

    const pendingInvitationsCount = formatted.filter(
      (n) => n.type === "invitation" && !n.acknowledgedAt
    ).length;
    const taskAssignmentsCount = formatted.filter(
      (n) => n.type === "task_assigned" && !n.acknowledgedAt
    ).length;
    const totalUnreadCount = pendingInvitationsCount + taskAssignmentsCount;

    return res.status(200).json({
      success: true,
      data: {
        notifications: formatted,
        pendingInvitationsCount,
        taskAssignmentsCount,
        totalUnreadCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching notifications",
      error: error.message,
    });
  }
};

export const getRawNotificationsForUser = async (req, res) => {
  try {
    const docs = await Notification.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({ success: true, data: docs });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching raw notifications",
      error: error.message,
    });
  }
};

export const markNotificationAsRead = async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, userId: req.auth0Id },
      { $set: { acknowledgedAt: new Date() } },
      { new: true }
    );
    return res.status(200).json({ success: true, message: "Notification acknowledged" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error acknowledging notification",
      error: error.message,
    });
  }
};

export const markAllNotificationsAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.auth0Id },
      { $set: { acknowledgedAt: new Date() } }
    );
    return res.status(200).json({ success: true, message: "All notifications acknowledged" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error acknowledging notifications",
      error: error.message,
    });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const result = await Notification.findOneAndDelete({
      _id: req.params.notificationId,
      userId: req.auth0Id,
    });

    if (!result) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({ success: true, message: "Notification cleared" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error clearing notification",
      error: error.message,
    });
  }
};

export const clearTaskNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      userId: req.auth0Id,
      type: "task_assigned",
    });

    return res.status(200).json({
      success: true,
      message: "Task notifications cleared",
      clearedCount: result.deletedCount || 0,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error clearing task notifications",
      error: error.message,
    });
  }
};

export default {
  getNotifications,
  getRawNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearTaskNotifications,
};
