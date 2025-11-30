import Task from "../models/Task.js";
import User from "../models/User.js";
import Activity from "../models/Activity.js";
import Group from "../models/Group.js";
import Notification from "../models/Notification.js";
import { sendEventToUser } from "../utils/sseManager.js";

// Helper: start of today (used for dueDate validation)
const startOfToday = () => {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
};

// Helper function to get or create user - using atomic operation to prevent duplicates
const getOrCreateUserFromAuth = async (auth0Id, email, name, picture) => {
  let user;
  
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

    // Check if account was deactivated (user already existed)
    if (!user.isActive) {
      user.isActive = true;
    }

    // Only update missing fields if they don't exist (preserve customizations)
    // Note: name is never updated from Auth0 after first login to preserve user customizations
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
      if (updated) {
        console.log('Updated missing user info:', { auth0Id, email: email || 'not provided' });
      }
    }
  } catch (error) {
    // Handle duplicate key error (race condition edge case)
    if (error.code === 11000 || error.codeName === 'DuplicateKey') {
      // User was created by another request, find and return it
      user = await User.findOne({ auth0Id });
      if (!user) {
        throw new Error("User creation failed due to duplicate key constraint");
      }
      // Update online status and reactivate if needed
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

// Helper function to add status change timestamps to update data
const addStatusChangeTimestamps = (task, updateData) => {
  if (!updateData.status || updateData.status === task.status) {
    return updateData;
  }

  const now = new Date();
  const newStatus = updateData.status;
  const oldStatus = task.status;

  // Record when task moves to in-progress
  if (newStatus === "in-progress" && oldStatus !== "in-progress") {
    updateData.startedAt = now;
  }

  // Record when task moves to completed
  if (newStatus === "completed" && oldStatus !== "completed") {
    updateData.completedAt = now;
    // If startedAt wasn't set, set it to completedAt (task was completed without going through in-progress)
    if (!task.startedAt) {
      updateData.startedAt = now;
    }
  }

  // Clear timestamps if moving back from completed/in-progress to pending
  if (newStatus === "pending") {
    if (oldStatus === "in-progress") {
      updateData.startedAt = null;
    }
    if (oldStatus === "completed") {
      updateData.completedAt = null;
      updateData.startedAt = null;
    }
  }

  return updateData;
};

// Get all tasks for the authenticated user
export const getTasks = async (req, res) => {
  try {
    // Get or create user from Auth0 token
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    // Get all groups user has access to (owner or accepted collaborator)
    const accessibleGroups = await Group.find({
      $or: [
        { owner: req.auth0Id },
        { "collaborators.userId": req.auth0Id, "collaborators.status": "accepted" },
      ],
    });

    const accessibleGroupTags = accessibleGroups.map(g => g.tag);

    // Optional: Filter by groupTag if provided
    const { groupTag } = req.query;
    
    let query;
    
    if (groupTag) {
      // Normalize groupTag
      let normalizedGroupTag = groupTag.toLowerCase();
      if (!normalizedGroupTag.startsWith('@')) {
        normalizedGroupTag = `@${normalizedGroupTag}`;
      }

      if (normalizedGroupTag === "@personal") {
        // Personal tasks: userId matches and groupTag is @personal or null
        query = {
          userId: req.auth0Id,
          $or: [
            { groupTag: "@personal" },
            { groupTag: { $exists: false } },
            { groupTag: null },
          ],
        };
      } else {
        // Group tasks: must be in accessible groups
        if (!accessibleGroupTags.includes(normalizedGroupTag)) {
          return res.status(403).json({
            success: false,
            message: "You don't have access to this group",
          });
        }
        // Show all tasks in this group (if user has access)
        query = {
          groupTag: normalizedGroupTag,
        };
      }
    } else {
      // "All Tasks" - show personal tasks AND only group tasks where user is assigned
      query = {
        $or: [
          // User's personal tasks
          { userId: req.auth0Id, $or: [{ groupTag: "@personal" }, { groupTag: { $exists: false } }, { groupTag: null }] },
          // Group tasks where user is assigned (assignedTo includes current user)
          { 
            groupTag: { $in: accessibleGroupTags },
            assignedTo: { $in: [req.auth0Id] }
          },
        ],
      };
    }

    const tasks = await Task.find(query)
      .sort({ createdAt: -1 });

    // Compute up-to-date isOverdue flag for each task before returning
    const today = startOfToday();
    const tasksForResponse = tasks.map((t) => {
      const obj = t.toObject ? t.toObject() : { ...t };
      try {
        if (obj.dueDate) {
          const due = new Date(obj.dueDate);
          obj.isOverdue = due < today && obj.status !== 'completed';
        } else {
          obj.isOverdue = false;
        }
      } catch (e) {
        obj.isOverdue = false;
      }
      return obj;
    });

    res.status(200).json({
      success: true,
      data: tasksForResponse,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching tasks",
      error: error.message,
    });
  }
};

// Get single task by ID
export const getTaskById = async (req, res) => {
  try {
    // Get or create user from Auth0 token
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const task = await Task.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.auth0Id }, // User owns the task (using auth0Id)
        { "collaborators.user": req.auth0Id }, // User is a collaborator
      ],
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found or you don't have access",
      });
    }

    // Ensure returned task has up-to-date isOverdue flag
    const taskObj = task.toObject ? task.toObject() : { ...task };
    try {
      if (taskObj.dueDate) {
        const due = new Date(taskObj.dueDate);
        taskObj.isOverdue = due < startOfToday() && taskObj.status !== 'completed';
      } else {
        taskObj.isOverdue = false;
      }
    } catch (e) {
      taskObj.isOverdue = false;
    }

    res.status(200).json({
      success: true,
      data: taskObj,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching task",
      error: error.message,
    });
  }
};

// Create new task
export const createTask = async (req, res) => {
  try {
    // Get or create user from Auth0 token
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    // Create task with userId (using auth0Id)
    // Always override userId from request body to use auth0Id
    const { userId, groupTag, ...restBody } = req.body;
    
    // Normalize groupTag
    let normalizedGroupTag = groupTag || "@personal";
    if (normalizedGroupTag && !normalizedGroupTag.startsWith('@')) {
      normalizedGroupTag = `@${normalizedGroupTag}`;
    }
    normalizedGroupTag = normalizedGroupTag.toLowerCase();

    let assignedUsersData = [];
    let normalizedAssignedTo = restBody.assignedTo || [];
    
    // If groupTag is provided and not @personal, verify user has access and get assigned user info
    if (normalizedGroupTag !== "@personal") {
      const group = await Group.findOne({
        tag: normalizedGroupTag,
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

      // If assignedTo is provided, get user info from group collaborators
      if (restBody.assignedTo && Array.isArray(restBody.assignedTo) && restBody.assignedTo.length > 0) {
        // Normalize assignedTo to ensure all values are strings (auth0Id)
        normalizedAssignedTo = restBody.assignedTo.map(id => id?.toString().trim()).filter(Boolean);
        
        for (const userId of normalizedAssignedTo) {
          // Check if it's the owner
          if (userId === group.owner || userId === group.owner.toString().trim()) {
            const ownerUser = await User.findOne({ auth0Id: userId });
            if (ownerUser) {
              assignedUsersData.push({
                userId: userId.toString().trim(), // Ensure it's stored as string
                name: ownerUser.name || "Owner",
                email: ownerUser.email || "",
                picture: ownerUser.customPicture || ownerUser.picture || null,
              });
            }
          } else {
            // Check collaborators - normalize comparison
            const collaborator = group.collaborators.find(c => 
              (c.userId === userId || c.userId.toString().trim() === userId.toString().trim()) && 
              c.status === "accepted"
            );
            if (collaborator) {
              // Get user picture from User model
              const collaboratorUser = await User.findOne({ auth0Id: userId });
              assignedUsersData.push({
                userId: userId.toString().trim(), // Ensure it's stored as string
                name: collaborator.name,
                email: collaborator.email,
                picture: collaboratorUser ? (collaboratorUser.customPicture || collaboratorUser.picture || null) : null,
              });
            }
          }
        }
      }
    } else if (restBody.assignedTo && Array.isArray(restBody.assignedTo) && restBody.assignedTo.length > 0) {
      // For personal tasks, normalize and get user info from User model
      normalizedAssignedTo = restBody.assignedTo.map(id => id?.toString().trim()).filter(Boolean);
      
      for (const userId of normalizedAssignedTo) {
        const userIdNormalized = userId.toString().trim();
        const assignedUser = await User.findOne({ auth0Id: userIdNormalized });
        if (assignedUser) {
          assignedUsersData.push({
            userId: userIdNormalized, // Store as normalized string
            name: assignedUser.name || "User",
            email: assignedUser.email || "",
            picture: assignedUser.customPicture || assignedUser.picture || null,
          });
        }
      }
    }

    // Build taskData object with normalized values
    const taskData = {
      ...restBody,
      userId: req.auth0Id, // Always use auth0Id, never trust userId from client
      groupTag: normalizedGroupTag,
      assignedTo: normalizedAssignedTo, // Use normalized assignedTo
      assignedUsers: assignedUsersData, // Store assigned user info
    };

    // Validate dueDate unless client explicitly allows backdate
    if (taskData.dueDate) {
      const due = new Date(taskData.dueDate);
      if (!req.body.allowBackdate && due < startOfToday()) {
        return res.status(400).json({
          success: false,
          message: 'Due date cannot be in the past. Set allowBackdate=true to permit past dates.'
        });
      }
    }

    const task = await Task.create(taskData);

    // Create activity for task creation
    await Activity.create({
      type: "task_created",
      taskId: task._id,
      taskTitle: task.title,
      userId: req.auth0Id,
      userName: req.userName || user.name || "Unknown",
      // Prefer the server-stored customPicture/picture so updates made in-app
      // are used immediately instead of relying on the Auth0 token picture
      userPicture: (user && (user.customPicture || user.picture)) || req.userPicture || null,
      groupTag: normalizedGroupTag,
      timestamp: new Date(),
    });

    // Upsert task assignment notifications for assignees and emit SSE
    try {
      if (task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0) {
        // Try to find groupId if available
        const group = task.groupTag ? await Group.findOne({ tag: task.groupTag }) : null;
        for (const assignee of task.assignedTo) {
          const userIdStr = assignee ? assignee.toString().trim() : null;
          if (!userIdStr) continue;
          try {
            await Notification.findOneAndUpdate(
              { userId: userIdStr, type: 'task_assigned', taskId: task._id },
              {
                userId: userIdStr,
                type: 'task_assigned',
                taskId: task._id,
                groupId: group?._id,
                groupTag: task.groupTag,
                read: false,
                createdAt: task.createdAt || new Date(),
              },
              { upsert: true, new: true }
            );
            // Emit SSE notification to user
            try { sendEventToUser(userIdStr, 'notification', { type: 'task_assigned', taskId: task._id, taskTitle: task.title, groupTag: task.groupTag }); } catch (e) {}
          } catch (e) {
            // continue on errors per-user
            console.warn('[notifications] failed to upsert for assignee', userIdStr, e.message || e);
          }
        }
      }
    } catch (e) {
      console.warn('[notifications] createTask notification pass failed', e.message || e);
    }

    // Emit task_updated to assignees so they receive the new task immediately
    try {
      const taskPayload = task.toObject ? task.toObject() : { ...task };
      // Compute isOverdue for payload
      try {
        if (taskPayload.dueDate) {
          const due = new Date(taskPayload.dueDate);
          taskPayload.isOverdue = due < startOfToday() && taskPayload.status !== 'completed';
        } else {
          taskPayload.isOverdue = false;
        }
      } catch (e) {
        taskPayload.isOverdue = false;
      }

      const recipients = new Set();
      (taskPayload.assignedTo || []).forEach(a => { if (a) recipients.add(a.toString().trim()); });
      // Also include owner if needed (owner is the creator) - exclude actor to avoid duplicate
      if (taskPayload.userId) recipients.add(taskPayload.userId.toString().trim());
      // Exclude the actor (creator)
      recipients.delete(req.auth0Id && req.auth0Id.toString().trim());

      for (const rid of recipients) {
        try { sendEventToUser(rid, 'task_updated', taskPayload); } catch (e) {}
      }
    } catch (e) {
      console.warn('[sse] failed to emit task_updated on create', e.message || e);
    }

    // Compute isOverdue before returning
    const taskObj = task.toObject ? task.toObject() : { ...task };
    try {
      if (taskObj.dueDate) {
        const due = new Date(taskObj.dueDate);
        taskObj.isOverdue = due < startOfToday() && taskObj.status !== 'completed';
      } else {
        taskObj.isOverdue = false;
      }
    } catch (e) {
      taskObj.isOverdue = false;
    }

    res.status(201).json({
      success: true,
      data: taskObj,
      message: "Task created successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error creating task",
      error: error.message,
    });
  }
};

// Update task
export const updateTask = async (req, res) => {
  try {
    // Get or create user from Auth0 token
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    // Find task and verify ownership or collaboration access
    const task = await Task.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.auth0Id }, // User owns the task (using auth0Id)
        { "collaborators.user": req.auth0Id, "collaborators.role": { $in: ["editor", "admin"] } }, // User has edit access
      ],
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found or you don't have permission to edit",
      });
    }

    // Prevent changing userId (ownership)
    const updateData = { ...req.body };
    delete updateData.userId;

    // Handle assignedTo and assignedUsers update
    if (updateData.assignedTo) {
      let assignedUsersData = [];
      
      // Normalize assignedTo to ensure all values are strings (auth0Id)
      const normalizedAssignedTo = Array.isArray(updateData.assignedTo) 
        ? updateData.assignedTo.map(id => id?.toString().trim()).filter(Boolean)
        : [];
      
      if (task.groupTag && task.groupTag !== "@personal") {
        // Get group info for assigned users
        const group = await Group.findOne({ tag: task.groupTag });
        if (group) {
          for (const userId of normalizedAssignedTo) {
            const userIdNormalized = userId.toString().trim();
            if (userIdNormalized === group.owner || userIdNormalized === group.owner.toString().trim()) {
              const ownerUser = await User.findOne({ auth0Id: userIdNormalized });
              if (ownerUser) {
              assignedUsersData.push({
                userId: userIdNormalized, // Store as normalized string
                name: ownerUser.name || "Owner",
                email: ownerUser.email || "",
                picture: ownerUser.customPicture || ownerUser.picture || null,
              });
              }
            } else {
              const collaborator = group.collaborators.find(c => 
                (c.userId === userIdNormalized || c.userId.toString().trim() === userIdNormalized) && 
                c.status === "accepted"
              );
              if (collaborator) {
                // Get user picture from User model
                const collaboratorUser = await User.findOne({ auth0Id: userIdNormalized });
                assignedUsersData.push({
                  userId: userIdNormalized, // Store as normalized string
                  name: collaborator.name,
                  email: collaborator.email,
                  picture: collaboratorUser ? (collaboratorUser.customPicture || collaboratorUser.picture || null) : null,
                });
              }
            }
          }
        }
      } else {
        // For personal tasks
        for (const userId of normalizedAssignedTo) {
          const userIdNormalized = userId.toString().trim();
          const assignedUser = await User.findOne({ auth0Id: userIdNormalized });
          if (assignedUser) {
            assignedUsersData.push({
              userId: userIdNormalized, // Store as normalized string
              name: assignedUser.name || "User",
              email: assignedUser.email || "",
              picture: assignedUser.customPicture || assignedUser.picture || null,
            });
          }
        }
      }
      
      // Update assignedTo with normalized values
      updateData.assignedTo = normalizedAssignedTo;
      updateData.assignedUsers = assignedUsersData;
    }

    // Handle groupTag update if provided
    if (updateData.groupTag) {
      let normalizedGroupTag = updateData.groupTag;
      if (!normalizedGroupTag.startsWith('@')) {
        normalizedGroupTag = `@${normalizedGroupTag}`;
      }
      normalizedGroupTag = normalizedGroupTag.toLowerCase();

      // If groupTag is being changed and not @personal, verify user has access
      if (normalizedGroupTag !== "@personal" && normalizedGroupTag !== task.groupTag) {
        const group = await Group.findOne({
          tag: normalizedGroupTag,
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

      updateData.groupTag = normalizedGroupTag;
    }

    // Add status change timestamps if status is being updated
    if (updateData.status) {
      addStatusChangeTimestamps(task, updateData);
    }

    // Validate dueDate on update unless allowBackdate is explicitly provided
    if (updateData.dueDate) {
      const due = new Date(updateData.dueDate);
      if (!req.body.allowBackdate && due < startOfToday()) {
        return res.status(400).json({
          success: false,
          message: 'Due date cannot be in the past. Set allowBackdate=true to permit past dates.'
        });
      }
    }

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    // Create activity for task update (if significant changes)
    if (updateData.title || updateData.description || updateData.status) {
      await Activity.create({
        type: "task_updated",
        taskId: updatedTask._id,
        taskTitle: updatedTask.title,
        userId: req.auth0Id,
        userName: req.userName || user.name || "Unknown",
        userPicture: (user && (user.customPicture || user.picture)) || req.userPicture || null,
        groupTag: updatedTask.groupTag,
        timestamp: new Date(),
      });
    }

    // Compute isOverdue before returning
    const updatedObj = updatedTask.toObject ? updatedTask.toObject() : { ...updatedTask };
    try {
      if (updatedObj.dueDate) {
        const due = new Date(updatedObj.dueDate);
        updatedObj.isOverdue = due < startOfToday() && updatedObj.status !== 'completed';
      } else {
        updatedObj.isOverdue = false;
      }
    } catch (e) {
      updatedObj.isOverdue = false;
    }

    // Handle notifications for added/removed assignees
    try {
      const oldAssigned = (task.assignedTo || []).map(a => a ? a.toString().trim() : '').filter(Boolean);
      const newAssigned = (updatedTask.assignedTo || []).map(a => a ? a.toString().trim() : '').filter(Boolean);

      const added = newAssigned.filter(a => !oldAssigned.includes(a));
      const removed = oldAssigned.filter(a => !newAssigned.includes(a));

      // Upsert notifications for added assignees
      if (added.length > 0) {
        const group = updatedTask.groupTag ? await Group.findOne({ tag: updatedTask.groupTag }) : null;
        for (const userIdStr of added) {
          try {
            await Notification.findOneAndUpdate(
              { userId: userIdStr, type: 'task_assigned', taskId: updatedTask._id },
              {
                userId: userIdStr,
                type: 'task_assigned',
                taskId: updatedTask._id,
                groupId: group?._id,
                groupTag: updatedTask.groupTag,
                read: false,
                createdAt: new Date(),
              },
              { upsert: true, new: true }
            );
            try { sendEventToUser(userIdStr, 'notification', { type: 'task_assigned', taskId: updatedTask._id, taskTitle: updatedTask.title, groupTag: updatedTask.groupTag }); } catch (e) {}
          } catch (e) {
            console.warn('[notifications] upsert for added assignee failed', userIdStr, e.message || e);
          }
        }
      }

      // Remove notifications for removed assignees and emit removed event
      if (removed.length > 0) {
        for (const userIdStr of removed) {
          try {
            await Notification.deleteMany({ userId: userIdStr, type: 'task_assigned', taskId: updatedTask._id });
            try { sendEventToUser(userIdStr, 'notification_removed', { type: 'task_assigned', taskId: updatedTask._id }); } catch (e) {}
          } catch (e) {
            console.warn('[notifications] delete for removed assignee failed', userIdStr, e.message || e);
          }
        }
      }

      // Emit task_updated event to interested users (owner + assignees), excluding actor
      try {
        const recipients = new Set();
        if (updatedTask.userId) recipients.add(updatedTask.userId.toString().trim());
        (updatedTask.assignedTo || []).forEach(a => { if (a) recipients.add(a.toString().trim()); });
        recipients.delete(req.auth0Id && req.auth0Id.toString().trim());
        const payload = updatedObj;
        for (const rid of recipients) {
          try { sendEventToUser(rid, 'task_updated', payload); } catch (e) {}
        }
      } catch (e) {
        console.warn('[sse] failed to emit task_updated', e.message || e);
      }
    } catch (e) {
      console.warn('[notifications] post-update notification pass failed', e.message || e);
    }

    res.status(200).json({
      success: true,
      data: updatedObj,
      message: "Task updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating task",
      error: error.message,
    });
  }
};

// Delete task completely
export const deleteTask = async (req, res) => {
  try {
    // Get or create user from Auth0 token
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    // Find the task by id first
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Permission check: allow owner or collaborators with editor/admin role
    const taskUserIdNormalized = task.userId ? task.userId.toString().trim() : '';
    const currentUserId = req.auth0Id && req.auth0Id.toString().trim();

    let hasPermission = false;

    if (taskUserIdNormalized && currentUserId && taskUserIdNormalized === currentUserId) {
      hasPermission = true; // owner
    }

    // If not owner and task belongs to a group, check group membership/role
    if (!hasPermission && task.groupTag && task.groupTag !== '@personal') {
      const group = await Group.findOne({ tag: task.groupTag });
      if (group) {
        if (group.owner && group.owner.toString().trim() === currentUserId) {
          hasPermission = true;
        } else {
          const collaborator = group.collaborators.find(c => c.userId === currentUserId || c.userId?.toString().trim() === currentUserId);
          if (collaborator && ['editor', 'admin'].includes(collaborator.role)) {
            hasPermission = true;
          }
        }
      }
    }

    // Also allow task-level collaborators array (if present) with editor/admin
    if (!hasPermission && task.collaborators && Array.isArray(task.collaborators)) {
      const taskCollab = task.collaborators.find(c => (c.user && c.user.toString().trim() === currentUserId) && ['editor', 'admin'].includes(c.role));
      if (taskCollab) hasPermission = true;
    }

    if (!hasPermission) {
      // Return 403 to indicate authenticated but forbidden (clearer for debugging)
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this task",
      });
    }

    // Store task info for activity before deletion
    const taskTitle = task.title;
    const groupTag = task.groupTag;

    // Delete the task
    await Task.findByIdAndDelete(req.params.id);

    // Create activity for task deletion
    await Activity.create({
      type: "task_deleted",
      taskId: task._id,
      taskTitle: taskTitle,
      userId: req.auth0Id,
      userName: req.userName || user.name || "Unknown",
      userPicture: (user && (user.customPicture || user.picture)) || req.userPicture || null,
      groupTag: groupTag,
      timestamp: new Date(),
    });

    // Notify assignees and owner about deletion and remove any lingering notifications
    try {
      const recipients = new Set();
      if (task.userId) recipients.add(task.userId.toString().trim());
      (task.assignedTo || []).forEach(a => { if (a) recipients.add(a.toString().trim()); });
      // Exclude actor (deleter)
      recipients.delete(req.auth0Id && req.auth0Id.toString().trim());

      // Delete any task_assigned notifications for this task for all users
      try {
        await Notification.deleteMany({ type: 'task_assigned', taskId: task._id });
      } catch (err) {
        console.warn('[notifications] failed to bulk-delete task_assigned notifications on task delete', err && err.message ? err.message : err);
      }

      // Emit notification_removed and task_deleted to recipients
      for (const rid of recipients) {
        try {
          try { sendEventToUser(rid, 'notification_removed', { type: 'task_assigned', taskId: task._id }); } catch (e) {}
          try { sendEventToUser(rid, 'task_deleted', { taskId: task._id, groupTag }); } catch (e) {}
        } catch (e) {
          // ignore per-user errors
        }
      }
    } catch (e) {
      console.warn('[sse] task delete notify failed', e && e.message ? e.message : e);
    }

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting task",
      error: error.message,
    });
  }
};

// Update task status (for drag and drop)
export const updateTaskStatus = async (req, res) => {
  try {
    // Get or create user from Auth0 token
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const { status } = req.body;

    // Find task first (without strict access check yet)
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Check permissions based on group role
    let hasPermission = false;
    let userRole = null;

    if (task.groupTag && task.groupTag !== "@personal") {
      // For group tasks, check group membership and role
      const group = await Group.findOne({
        tag: task.groupTag,
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

      // Check if user is owner of the group
      const isGroupOwner = group.owner === req.auth0Id;
      
      // Find user's role in the group
      const collaborator = group.collaborators.find(
        c => c.userId === req.auth0Id && c.status === "accepted"
      );
      userRole = isGroupOwner ? "owner" : (collaborator?.role || null);

    // Check if user owns the task (normalize comparison)
    const taskUserIdNormalized = task.userId ? task.userId.toString().trim() : '';
    const currentUserIdNormalized = req.auth0Id.trim();
    const userOwnsTask = taskUserIdNormalized && taskUserIdNormalized === currentUserIdNormalized;
    
    // Check if user is assigned to the task (normalize comparison)
    const isAssignedToTask = task.assignedTo && Array.isArray(task.assignedTo) && 
      task.assignedTo.some(assignedUserId => {
        const assignedIdNormalized = assignedUserId ? assignedUserId.toString().trim() : '';
        return assignedIdNormalized && assignedIdNormalized === currentUserIdNormalized;
      });
    
    // Debug logging (development only)
    if (process.env.NODE_ENV !== 'production' && userRole === "viewer") {
      console.log('[updateTaskStatus] Permission check:', {
        taskId: task._id,
        taskUserId: taskUserIdNormalized,
        currentUserId: currentUserIdNormalized,
        userOwnsTask,
        isAssignedToTask,
        assignedTo: task.assignedTo,
        userRole
      });
    }

      // Viewers can only move their own tasks (by userId or assignedTo)
      if (userRole === "viewer") {
        if (!userOwnsTask && !isAssignedToTask) {
          return res.status(403).json({
            success: false,
            message: "Viewers can only move their own tasks",
          });
        }
        // Viewer owns or is assigned, allow
        hasPermission = true;
      }

      // Editors, admins, and owners can move any task in the group
      if (userRole === "editor" || userRole === "admin" || userRole === "owner") {
        hasPermission = true;
      }
    } else {
      // For personal tasks, check if user owns the task
      hasPermission = task.userId === req.auth0Id;
      
      // Also check task collaborators
      if (!hasPermission) {
        const taskCollaborator = task.collaborators?.find(
          c => c.user?.toString() === req.auth0Id && ["editor", "admin"].includes(c.role)
        );
        hasPermission = !!taskCollaborator;
      }
    }

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this task",
      });
    }

    // Prepare update data with status change timestamps
    const updateData = { status };
    addStatusChangeTimestamps(task, updateData);

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    // Create activity for task moved (if status changed)
    let createdActivity = null;
    if (task.status !== status) {
      createdActivity = await Activity.create({
        type: "task_moved",
        taskId: updatedTask._id,
        taskTitle: updatedTask.title,
        userId: req.auth0Id,
        userName: req.userName || user.name || "Unknown",
        // Include the user's picture so the frontend can render it immediately
        userPicture: req.userPicture || (user && (user.customPicture || user.picture)) || null,
        groupTag: updatedTask.groupTag,
        fromStatus: task.status,
        toStatus: status,
        timestamp: new Date(),
      });
    }

    // Return the updated task and the created activity (if any) so the frontend can
    // immediately prepend the activity to the sidebar without re-fetching activities.
    // Compute isOverdue for updatedTask before returning
    const updatedObj = updatedTask.toObject ? updatedTask.toObject() : { ...updatedTask };
    try {
      if (updatedObj.dueDate) {
        const due = new Date(updatedObj.dueDate);
        updatedObj.isOverdue = due < startOfToday() && updatedObj.status !== 'completed';
      } else {
        updatedObj.isOverdue = false;
      }
    } catch (e) {
      updatedObj.isOverdue = false;
    }

    const responsePayload = { success: true, data: updatedObj, message: "Task status updated successfully" };

    if (createdActivity) {
      // Ensure the returned activity includes the server-stored user picture
      // (prefer `customPicture` then stored `picture`). Fetch the freshest user
      // record to avoid returning the Auth0 token picture when the user has
      // recently updated their portal avatar.
      try {
        const freshestUser = await User.findOne({ auth0Id: req.auth0Id }).select('customPicture picture');
        const userPic = (freshestUser && (freshestUser.customPicture || freshestUser.picture)) || null;
        const activityObj = createdActivity.toObject ? createdActivity.toObject() : { ...createdActivity };
        activityObj.userPicture = userPic;
        responsePayload.activity = activityObj;
      } catch (err) {
        // If enrichment fails, still return the created activity as-is
        responsePayload.activity = createdActivity;
      }
    }

    // Emit task_updated SSE to owner and assignees (excluding actor)
    try {
      const recipients = new Set();
      if (updatedObj.userId) recipients.add(updatedObj.userId.toString().trim());
      (updatedObj.assignedTo || []).forEach(a => { if (a) recipients.add(a.toString().trim()); });
      recipients.delete(req.auth0Id && req.auth0Id.toString().trim());
      for (const rid of recipients) {
        try { sendEventToUser(rid, 'task_updated', updatedObj); } catch (e) {}
      }
    } catch (e) {
      console.warn('[sse] task status update emit failed', e.message || e);
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating task status",
      error: error.message,
    });
  }
};

// Update task progress
export const updateTaskProgress = async (req, res) => {
  try {
    // Get or create user from Auth0 token
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const { progress } = req.body;

    // Find task and verify access
    const task = await Task.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.auth0Id },
        { "collaborators.user": req.auth0Id, "collaborators.role": { $in: ["editor", "admin"] } },
      ],
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found or you don't have permission to update",
      });
    }

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { progress },
      {
        new: true,
        runValidators: true,
      }
    );

    // Compute isOverdue before returning
    const updatedObj = updatedTask.toObject ? updatedTask.toObject() : { ...updatedTask };
    try {
      if (updatedObj.dueDate) {
        const due = new Date(updatedObj.dueDate);
        updatedObj.isOverdue = due < startOfToday() && updatedObj.status !== 'completed';
      } else {
        updatedObj.isOverdue = false;
      }
    } catch (e) {
      updatedObj.isOverdue = false;
    }

    res.status(200).json({
      success: true,
      data: updatedObj,
      message: "Task progress updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating task progress",
      error: error.message,
    });
  }
};


