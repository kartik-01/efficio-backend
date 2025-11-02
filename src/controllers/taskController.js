import Task from "../models/Task.js";
import User from "../models/User.js";

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

    // Get user's own tasks and shared tasks where user is a collaborator
    const tasks = await Task.find({
      $or: [
        { userId: req.auth0Id }, // User's own tasks (using auth0Id)
        { "collaborators.user": req.auth0Id }, // Tasks where user is a collaborator
      ],
    })
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
    const { userId, ...restBody } = req.body;
    const taskData = {
      ...restBody,
      userId: req.auth0Id, // Always use auth0Id, never trust userId from client
    };

    const task = await Task.create(taskData);

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
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.auth0Id, // Only owner can delete (using auth0Id)
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found or you don't have permission to delete",
      });
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


