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

    // Lookup actor's server-side profile to enrich the payload with the latest name/picture.
    let actor = null;
    if (base.userId) {
      try {
        actor = await User.findOne({ auth0Id: base.userId }).select('auth0Id name email customPicture picture');
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
      const displayName = actor.name || actor.email || null;
      const avatarUrl = actor.customPicture || actor.picture || null;
      payload.userPicture = avatarUrl;
      payload.userInitials = computeInitials(displayName || null);
      payload.userEmail = actor.email || null;
      payload.userName = displayName;
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
