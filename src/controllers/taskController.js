import Task from "../models/Task.js";
import User from "../models/User.js";
import Activity from "../models/Activity.js";
import Group from "../models/Group.js";

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

    res.status(200).json({
      success: true,
      data: tasks,
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

    res.status(200).json({
      success: true,
      data: task,
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

    const task = await Task.create(taskData);

    // Create activity for task creation
    await Activity.create({
      type: "task_created",
      taskId: task._id,
      taskTitle: task.title,
      userId: req.auth0Id,
      userName: req.userName || user.name || "Unknown",
      groupTag: normalizedGroupTag,
      timestamp: new Date(),
    });

    res.status(201).json({
      success: true,
      data: task,
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
        groupTag: updatedTask.groupTag,
        timestamp: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      data: updatedTask,
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

    // Only owner can delete tasks
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.auth0Id, // Only owner can delete (using auth0Id)
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found or you don't have permission to delete",
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
      groupTag: groupTag,
      timestamp: new Date(),
    });

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
    if (task.status !== status) {
      await Activity.create({
        type: "task_moved",
        taskId: updatedTask._id,
        taskTitle: updatedTask.title,
        userId: req.auth0Id,
        userName: req.userName || user.name || "Unknown",
        groupTag: updatedTask.groupTag,
        fromStatus: task.status,
        toStatus: status,
        timestamp: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      data: updatedTask,
      message: "Task status updated successfully",
    });
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

    res.status(200).json({
      success: true,
      data: updatedTask,
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


