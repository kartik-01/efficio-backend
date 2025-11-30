import Group from '../models/Group.js';
import User from '../models/User.js';
import { sendEventToUser } from './sseManager.js';

// Emit an activity to relevant users (group members or user themselves)
export async function emitActivity(activity) {
  try {
    if (!activity) return false;

    const recipients = new Set();

    // If activity belongs to a group (and not personal), notify all group members
    let group = null;
    if (activity.groupTag && activity.groupTag !== '@personal') {
      group = await Group.findOne({ tag: activity.groupTag });
      if (group) {
        if (group.owner) recipients.add(group.owner.toString().trim());
        const collabs = group.collaborators || [];
        collabs.forEach(c => {
          if (c && c.userId && c.status === 'accepted') recipients.add(c.userId.toString().trim());
        });
      }
    } else if (activity.userId) {
      // Personal activity - notify only the user
      recipients.add(activity.userId.toString().trim());
    }

    // Exclude the actor (user who generated the activity) to avoid duplicate local handling
    if (activity.userId) recipients.delete(activity.userId.toString().trim());

    // Prepare base payload and sanitize/enrich actor information
    const base = activity.toObject ? activity.toObject() : { ...activity };

    // Lookup actor's server-side profile. We will NOT include Auth0/Google picture by default.
    let actor = null;
    if (base.userId) {
      try {
        // Include email so we can fall back to it when name is missing
        actor = await User.findOne({ auth0Id: base.userId }).select('auth0Id name email customPicture');
      } catch (err) {
        actor = null;
      }
    }

    const computeInitials = (nameOrEmail) => {
      if (!nameOrEmail) return null;
      const s = String(nameOrEmail).trim();
      if (!s) return null;
      // If it's an email, use local-part before @
      const local = s.includes('@') ? s.split('@')[0] : s;
      const parts = local.split(/\s+/).filter(Boolean);
      if (parts.length === 0) return null;
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const payload = { ...base };
    if (actor) {
      // Only include a picture if the user explicitly uploaded a customPicture
      payload.userPicture = actor.customPicture ? actor.customPicture : null;
      // Provide initials so the frontend can show a consistent avatar even when we omit full name/picture
      payload.userInitials = computeInitials(actor.name || actor.email || null);
      // Provide email so frontends can display it when name is missing
      payload.userEmail = actor.email || null;
      // Only include full name when the user has customized their profile (indicated by customPicture)
      // Fall back to email if name is missing and owner view requires it
      payload.userName = actor.customPicture ? (actor.name || actor.email || null) : null;
    } else {
      payload.userPicture = null;
      payload.userInitials = computeInitials(base.userName || null);
      payload.userEmail = base.userEmail || null;
      payload.userName = base.userName || null;
    }

    for (const rid of recipients) {
      try {
        // Clone payload per-recipient so we can optionally reveal more information
        const perPayload = { ...payload };

        // Reveal actor's name to the group owner only (owners often need identity to manage invites/assignments)
        // Keep pictures private unless the actor uploaded a customPicture.
        if (actor && group && group.owner && rid === group.owner.toString().trim()) {
          // Reveal name to owner, but fall back to email if name is missing
          perPayload.userName = actor.name || actor.email || null;
        }

        sendEventToUser(rid, 'activity', perPayload);
      } catch (e) {
        // ignore per-user send errors
      }
    }

    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn('[activityEmitter] emit failed', err && err.message ? err.message : err);
    return false;
  }
}

export default { emitActivity };
