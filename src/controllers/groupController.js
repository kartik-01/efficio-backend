import Group from "../models/Group.js";
import User from "../models/User.js";
import Task from "../models/Task.js";
import Activity from "../models/Activity.js";

// Helper function to get or create user (preserves custom name and picture)
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

    // Only update missing fields - NEVER overwrite custom name or customPicture
    // Preserve user customizations (name and customPicture should never be overwritten)
    let updated = false;
    if (!user.email && email) {
      user.email = email;
      updated = true;
    }
    // Only set picture if user doesn't have customPicture and doesn't have picture
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

// Helper to normalize tag (ensure it starts with @)
const normalizeTag = (tag) => {
  if (!tag) return null;
  const trimmed = tag.trim().toLowerCase();
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
};

// Create new group/workspace
export const createGroup = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const { name, tag, collaborators = [], color } = req.body;

    if (!name || !tag) {
      return res.status(400).json({
        success: false,
        message: "Group name and tag are required",
      });
    }

    const normalizedTag = normalizeTag(tag);

    // Check if tag already exists
    const existingGroup = await Group.findOne({ tag: normalizedTag });
    if (existingGroup) {
      return res.status(400).json({
        success: false,
        message: "A group with this tag already exists",
      });
    }

    // Prepare collaborators array with owner automatically added as admin
    const collaboratorsList = [
      {
        userId: req.auth0Id,
        name: req.userName || user.name || "Unknown",
        email: req.userEmail || user.email || "",
        role: "admin",
        status: "accepted",
        invitedAt: new Date(),
        acceptedAt: new Date(),
        invitedBy: {
          userId: req.auth0Id,
          name: req.userName || user.name || 'Unknown',
          picture: req.userPicture || null,
        },
      },
      // Add other collaborators with pending status
      ...collaborators.map(collab => ({
        userId: collab.userId,
        name: collab.name,
        email: collab.email,
        role: collab.role || "editor",
        status: "pending",
        invitedAt: new Date(),
        invitedBy: {
          userId: req.auth0Id,
          name: req.userName || user.name || 'Unknown',
          picture: req.userPicture || null,
        },
        acceptedAt: null,
      })),
    ];

    // Create group (include color if provided; otherwise schema default applies)
    const group = await Group.create({
      name,
      tag: normalizedTag,
      owner: req.auth0Id,
      collaborators: collaboratorsList,
      color: color ? color : undefined,
    });

    // Add group to owner's groups array
    await User.findByIdAndUpdate(
      user._id,
      { $addToSet: { groups: group._id } },
      { new: true }
    );

    // Create activity for group creation
    await Activity.create({
      type: "member_added",
      userId: req.auth0Id,
      userName: req.userName || user.name || "Unknown",
      userPicture: (user && (user.customPicture || user.picture)) || req.userPicture || null,
      groupTag: normalizedTag,
      timestamp: new Date(),
    });

    res.status(201).json({
      success: true,
      data: group,
      message: "Group created successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error creating group",
      error: error.message,
    });
  }
};

// Get all groups user belongs to (accepted only) and pending invitations
export const getUserGroups = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    // Get groups where user is a member (accepted)
    const acceptedGroups = await Group.find({
      $or: [
        { owner: req.auth0Id },
        { "collaborators.userId": req.auth0Id, "collaborators.status": "accepted" },
      ],
    }).sort({ createdAt: -1 });

    // Get pending invitations (groups where user is collaborator with pending status)
    const pendingInvitations = await Group.find({
      "collaborators.userId": req.auth0Id,
      "collaborators.status": "pending",
    }).sort({ createdAt: -1 });

    // Get all unique user IDs from groups (owner + all collaborators)
    const allUserIds = new Set();
    acceptedGroups.forEach(group => {
      allUserIds.add(group.owner);
      group.collaborators.forEach(c => allUserIds.add(c.userId));
    });
    pendingInvitations.forEach(group => {
      allUserIds.add(group.owner);
      group.collaborators.forEach(c => allUserIds.add(c.userId));
    });

    // Fetch user pictures and names for all users
    const users = await User.find({ auth0Id: { $in: Array.from(allUserIds) } }).select('auth0Id picture customPicture name');
    const userPictureMap = new Map();
    const userNameMap = new Map();
    users.forEach(u => {
      userPictureMap.set(u.auth0Id, u.customPicture || u.picture || null);
      userNameMap.set(u.auth0Id, u.name || null);
    });

    // Populate pictures in groups
    const groupsWithPictures = acceptedGroups.map(group => {
      const groupObj = group.toObject();
      // Add owner picture
      if (!groupObj.ownerPicture) {
        groupObj.ownerPicture = userPictureMap.get(group.owner) || null;
      }
      // Add collaborator pictures
      groupObj.collaborators = groupObj.collaborators.map(collab => {
        const picture = userPictureMap.get(collab.userId) || null;
        const collabObj = {
          ...collab,
          picture: picture,
        };
        // If collaborator has invitedBy info, prefer the inviter's current name/picture when available
        if (collab.invitedBy && collab.invitedBy.userId) {
          const inviterId = collab.invitedBy.userId;
          collabObj.invitedBy = {
            userId: inviterId,
            name: userNameMap.get(inviterId) || collab.invitedBy.name || null,
            picture: userPictureMap.get(inviterId) || collab.invitedBy.picture || null,
          };
        }
        return collabObj;
      });
      return groupObj;
    });

    // Populate pictures in pending invitations
    const pendingInvitationsWithPictures = pendingInvitations.map(group => {
      const groupObj = group.toObject();
      // Add owner picture
      if (!groupObj.ownerPicture) {
        groupObj.ownerPicture = userPictureMap.get(group.owner) || null;
      }
      // Add collaborator pictures
      groupObj.collaborators = groupObj.collaborators.map(collab => {
        const picture = userPictureMap.get(collab.userId) || null;
        return {
          ...collab,
          picture: picture,
        };
      });
      return groupObj;
    });

    res.status(200).json({
      success: true,
      data: {
        groups: groupsWithPictures,
        pendingInvitations: pendingInvitationsWithPictures.map(group => {
          const inviteCollab = group.collaborators.find(c => c.userId === req.auth0Id && c.status === 'pending');

          // Determine inviter info: prefer invitedBy.userId if recorded, otherwise fallback to group owner
          let inviter = null;
          if (inviteCollab && (inviteCollab.invitedBy && inviteCollab.invitedBy.userId)) {
            const inviterId = inviteCollab.invitedBy.userId;
            inviter = {
              userId: inviterId,
              name: userNameMap.get(inviterId) || inviteCollab.invitedBy.name || null,
              picture: userPictureMap.get(inviterId) || inviteCollab.invitedBy.picture || null,
            };
          } else if (group.owner) {
            const ownerId = group.owner;
            inviter = {
              userId: ownerId,
              name: userNameMap.get(ownerId) || group.collaborators.find(c => c.userId === ownerId && c.status === 'accepted')?.name || 'Owner',
              picture: userPictureMap.get(ownerId) || group.ownerPicture || null,
            };
          }

          return {
            id: group._id,
            name: group.name,
            tag: group.tag,
            owner: {
              userId: group.owner,
              name: group.collaborators.find(c => c.userId === group.owner && c.status === 'accepted')?.name || 'Owner',
              email: group.collaborators.find(c => c.userId === group.owner && c.status === 'accepted')?.email || '',
              picture: group.ownerPicture,
            },
            invitedBy: inviter,
            role: inviteCollab?.role,
            invitedAt: inviteCollab?.invitedAt,
          };
        }),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching groups",
      error: error.message,
    });
  }
};

// Get single group by ID
export const getGroupById = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const group = await Group.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.auth0Id },
        { "collaborators.userId": req.auth0Id },
      ],
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found or you don't have access",
      });
    }

    res.status(200).json({
      success: true,
      data: group,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching group",
      error: error.message,
    });
  }
};

// Update group (name, tag, color) - owner or admin only
export const updateGroup = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const group = await Group.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.auth0Id },
        { "collaborators.userId": req.auth0Id, "collaborators.role": "admin" },
      ],
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found or you don't have permission",
      });
    }

    const updateData = {};
    if (req.body.name) updateData.name = req.body.name;
    if (req.body.color) updateData.color = req.body.color;
    if (req.body.tag) {
      const normalizedTag = normalizeTag(req.body.tag);
      // Check if new tag is different and doesn't already exist
      if (normalizedTag !== group.tag) {
        const existingGroup = await Group.findOne({ tag: normalizedTag });
        if (existingGroup) {
          return res.status(400).json({
            success: false,
            message: "A group with this tag already exists",
          });
        }
        updateData.tag = normalizedTag;
      }
    }

    const updatedGroup = await Group.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: updatedGroup,
      message: "Group updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating group",
      error: error.message,
    });
  }
};

// Delete group - owner only (cascade delete tasks and activities)
export const deleteGroup = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const group = await Group.findOne({
      _id: req.params.id,
      owner: req.auth0Id, // Only owner can delete
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found or you don't have permission to delete",
      });
    }

    // Delete all tasks associated with this group
    await Task.deleteMany({ groupTag: group.tag });

    // Delete all activities associated with this group
    await Activity.deleteMany({ groupTag: group.tag });

    // Remove group from all users' groups array
    await User.updateMany(
      { groups: req.params.id },
      { $pull: { groups: req.params.id } }
    );

    // Delete the group
    await Group.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Group deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting group",
      error: error.message,
    });
  }
};

// Invite user to group
export const inviteUser = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const group = await Group.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.auth0Id },
        { "collaborators.userId": req.auth0Id, "collaborators.role": { $in: ["admin", "editor"] } },
      ],
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found or you don't have permission to invite",
      });
    }

    const { userId, name, email, role = "editor" } = req.body;

    if (!userId || !name || !email) {
      return res.status(400).json({
        success: false,
        message: "userId, name, and email are required",
      });
    }

    // Check if user is already a collaborator
    const existingCollaborator = group.collaborators.find(
      c => c.userId === userId
    );

    if (existingCollaborator) {
      // If declined, allow re-inviting
      if (existingCollaborator.status === "declined") {
        existingCollaborator.status = "pending";
        existingCollaborator.invitedAt = new Date();
        existingCollaborator.role = role;
        // Update name/email in case they changed
        existingCollaborator.name = name;
        existingCollaborator.email = email;
        // Update inviter info
        existingCollaborator.invitedBy = {
          userId: req.auth0Id,
          name: req.userName || user.name || 'Unknown',
          picture: req.userPicture || null,
        };
        await group.save();
      } else if (existingCollaborator.status === "pending") {
        // Already has pending invitation, just update role/name/email
        existingCollaborator.role = role;
        existingCollaborator.name = name;
        existingCollaborator.email = email;
        existingCollaborator.invitedBy = {
          userId: req.auth0Id,
          name: req.userName || user.name || 'Unknown',
          picture: req.userPicture || null,
        };
        await group.save();
      } else if (existingCollaborator.status === "accepted") {
        // User is already an accepted member
        return res.status(400).json({
          success: false,
          message: "User is already a member of this group",
        });
      }
    } else {
      // Add new collaborator (user was previously removed or never invited)
      group.collaborators.push({
        userId,
        name,
        email,
        role,
        status: "pending",
        invitedAt: new Date(),
        acceptedAt: null,
        invitedBy: {
          userId: req.auth0Id,
          name: req.userName || user.name || 'Unknown',
          picture: req.userPicture || null,
        },
      });
      await group.save();
    }

    const updatedGroup = await Group.findById(req.params.id);

    res.status(200).json({
      success: true,
      data: updatedGroup,
      message: "User invited successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error inviting user",
      error: error.message,
    });
  }
};

// Accept group invitation
export const acceptInvitation = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const group = await Group.findOne({
      _id: req.params.id,
      "collaborators.userId": req.auth0Id,
      "collaborators.status": "pending",
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found",
      });
    }

    // Update collaborator status
    const collaborator = group.collaborators.find(
      c => c.userId === req.auth0Id && c.status === "pending"
    );

    if (collaborator) {
      collaborator.status = "accepted";
      collaborator.acceptedAt = new Date();
      await group.save();

      // Add group to user's groups array
      await User.findByIdAndUpdate(
        user._id,
        { $addToSet: { groups: group._id } },
        { new: true }
      );

      // Check if user previously left this group (rejoin scenario)
      const previousLeaveActivity = await Activity.findOne({
        groupTag: group.tag,
        userId: req.auth0Id,
        type: "member_removed",
      }).sort({ timestamp: -1 });

      // Determine activity type: rejoin if they previously left, otherwise new join
      const activityType = previousLeaveActivity ? "member_rejoined" : "member_added";

      // Create activity
      await Activity.create({
        type: activityType,
        userId: req.auth0Id,
        userName: req.userName || user.name || "Unknown",
        userPicture: (user && (user.customPicture || user.picture)) || req.userPicture || null,
        groupTag: group.tag,
        timestamp: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      data: group,
      message: "Invitation accepted successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error accepting invitation",
      error: error.message,
    });
  }
};

// Decline group invitation
export const declineInvitation = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const group = await Group.findOne({
      _id: req.params.id,
      "collaborators.userId": req.auth0Id,
      "collaborators.status": "pending",
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found",
      });
    }

    // Update collaborator status
    const collaborator = group.collaborators.find(
      c => c.userId === req.auth0Id && c.status === "pending"
    );

    if (collaborator) {
      collaborator.status = "declined";
      await group.save();
    }

    res.status(200).json({
      success: true,
      message: "Invitation declined",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error declining invitation",
      error: error.message,
    });
  }
};

// Update member role
export const updateMemberRole = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const group = await Group.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.auth0Id },
        { "collaborators.userId": req.auth0Id, "collaborators.role": "admin" },
      ],
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found or you don't have permission",
      });
    }

    const { role } = req.body;
    if (!["viewer", "editor", "admin"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be viewer, editor, or admin",
      });
    }

    const collaborator = group.collaborators.find(
      c => c.userId === req.params.userId
    );

    if (!collaborator) {
      return res.status(404).json({
        success: false,
        message: "Member not found in group",
      });
    }

    // Owner cannot change their own role
    if (group.owner === req.params.userId && req.auth0Id === req.params.userId) {
      return res.status(400).json({
        success: false,
        message: "Cannot change owner's role",
      });
    }

    collaborator.role = role;
    await group.save();

    const updatedGroup = await Group.findById(req.params.id);

    // Create activity
    await Activity.create({
      type: "member_role_changed",
      userId: req.auth0Id,
      userName: req.userName || user.name || "Unknown",
      userPicture: (user && (user.customPicture || user.picture)) || req.userPicture || null,
      groupTag: group.tag,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      data: updatedGroup,
      message: "Member role updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating member role",
      error: error.message,
    });
  }
};

// Exit group - members can leave themselves
export const exitGroup = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const group = await Group.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.auth0Id },
        { "collaborators.userId": req.auth0Id, "collaborators.status": "accepted" },
      ],
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found or you're not a member",
      });
    }

    // Cannot exit if you're the owner
    if (group.owner === req.auth0Id) {
      return res.status(400).json({
        success: false,
        message: "Owner cannot exit the group. Please delete the group instead.",
      });
    }

    // Remove user from collaborators
    group.collaborators = group.collaborators.filter(
      c => c.userId !== req.auth0Id
    );
    await group.save();

    // Remove group from user's groups array
    const memberUser = await User.findOne({ auth0Id: req.auth0Id });
    if (memberUser) {
      await User.findByIdAndUpdate(
        memberUser._id,
        { $pull: { groups: group._id } },
        { new: true }
      );
    }

    // Create activity
    await Activity.create({
      type: "member_removed",
      userId: req.auth0Id,
      userName: req.userName || user.name || "Unknown",
      userPicture: (user && (user.customPicture || user.picture)) || req.userPicture || null,
      groupTag: group.tag,
      timestamp: new Date(),
    });

    const updatedGroup = await Group.findById(req.params.id);

    res.status(200).json({
      success: true,
      data: updatedGroup,
      message: "You have left the group",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error leaving group",
      error: error.message,
    });
  }
};

// Remove member from group
export const removeMember = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const group = await Group.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.auth0Id },
        { "collaborators.userId": req.auth0Id, "collaborators.role": "admin" },
      ],
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found or you don't have permission",
      });
    }

    // Cannot remove owner
    if (group.owner === req.params.userId) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove group owner",
      });
    }

    // Remove collaborator
    group.collaborators = group.collaborators.filter(
      c => c.userId !== req.params.userId
    );
    await group.save();

    // Remove group from user's groups array
    const memberUser = await User.findOne({ auth0Id: req.params.userId });
    if (memberUser) {
      await User.findByIdAndUpdate(
        memberUser._id,
        { $pull: { groups: group._id } },
        { new: true }
      );
    }

    // Create activity
    await Activity.create({
      type: "member_removed",
      userId: req.auth0Id,
      userName: req.userName || user.name || "Unknown",
      userPicture: (user && (user.customPicture || user.picture)) || req.userPicture || null,
      groupTag: group.tag,
      timestamp: new Date(),
    });

    const updatedGroup = await Group.findById(req.params.id);

    res.status(200).json({
      success: true,
      data: updatedGroup,
      message: "Member removed successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error removing member",
      error: error.message,
    });
  }
};

// Get all group members
export const getGroupMembers = async (req, res) => {
  try {
    const user = await getOrCreateUserFromAuth(
      req.auth0Id,
      req.userEmail,
      req.userName,
      req.userPicture
    );

    const group = await Group.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.auth0Id },
        { "collaborators.userId": req.auth0Id },
      ],
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found or you don't have access",
      });
    }

    // Filter to only accepted members
    const acceptedMembers = group.collaborators.filter(
      c => c.status === "accepted"
    );

    // Get all user IDs (including owner)
    const userIds = [group.owner, ...acceptedMembers.map(m => m.userId)];

    // Fetch user pictures
    const users = await User.find({ auth0Id: { $in: userIds } }).select('auth0Id picture customPicture');
    const userPictureMap = new Map();
    users.forEach(u => {
      userPictureMap.set(u.auth0Id, u.customPicture || u.picture || null);
    });

    // Add pictures to members
    const membersWithPictures = acceptedMembers.map(member => ({
      ...member.toObject(),
      picture: userPictureMap.get(member.userId) || null,
    }));

    // Also add owner if not in accepted members
    const ownerInfo = {
      userId: group.owner,
      name: req.userName || user.name || "Owner",
      email: req.userEmail || user.email || "",
      role: "owner",
      status: "accepted",
      picture: userPictureMap.get(group.owner) || null,
    };

    const allMembers = [ownerInfo, ...membersWithPictures.filter(m => m.userId !== group.owner)];

    res.status(200).json({
      success: true,
      data: allMembers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching group members",
      error: error.message,
    });
  }
};

