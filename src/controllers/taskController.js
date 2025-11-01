import Task from "../models/Task.js";
import User from "../models/User.js";

// Helper function to get or create user
const getOrCreateUserFromAuth = async (auth0Id, email, name, picture) => {
  let user = await User.findOne({ auth0Id });
  
  if (!user) {
    // Create user with all available info
    user = await User.create({
      auth0Id,
      email: email || undefined,
      name: name || undefined,
      picture: picture || undefined,
      lastLogin: new Date(),
    });
    console.log('Created new user:', { 
      auth0Id, 
      email: email || 'not provided',
      name: name || 'not provided',
      picture: picture ? 'provided' : 'not provided'
    });
  } else {
    // Always update email/name/picture if provided (in case user updated their profile)
    let updated = false;
    if (email && email !== user.email) {
      user.email = email;
      updated = true;
    }
    if (name && name !== user.name) {
      user.name = name;
      updated = true;
    }
    if (picture && picture !== user.picture) {
      user.picture = picture;
      updated = true;
    }
    user.lastLogin = new Date();
    await user.save();
    if (updated) {
      console.log('Updated user info:', { auth0Id, email, name });
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
    const taskData = {
      ...req.body,
      userId: req.auth0Id,
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

