// Simple in-memory SSE manager for development.
// Not suitable for multi-instance production (use Redis/PG pubsub instead).
const clientsMap = new Map(); // userId -> Set of response objects

function addClient(userId, res) {
  if (!userId) return;
  if (!clientsMap.has(userId)) clientsMap.set(userId, new Set());
  clientsMap.get(userId).add(res);
  if (process.env.NODE_ENV !== 'production') {
    console.log('[sse] addClient', { userId, totalForUser: clientsMap.get(userId).size, totalUsers: clientsMap.size });
  }
}

function removeClient(userId, res) {
  if (!userId) return;
  const set = clientsMap.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clientsMap.delete(userId);
  if (process.env.NODE_ENV !== 'production') {
    console.log('[sse] removeClient', { userId, remainingForUser: set ? set.size : 0, totalUsers: clientsMap.size });
  }
}

function sendEventToUser(userId, eventName, data) {
  if (!userId) return false;
  const set = clientsMap.get(userId);
  if (!set || set.size === 0) return false;

  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  let delivered = false;

  for (const res of Array.from(set)) {
    try {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${payload}\n\n`);
      delivered = true;
    } catch (e) {
      // Remove broken connections quietly
      set.delete(res);
    }
  }

  if (set.size === 0) {
    clientsMap.delete(userId);
  }

  return delivered;
}

function broadcast(eventName, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  for (const [, set] of clientsMap.entries()) {
    for (const res of set) {
      try {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${payload}\n\n`);
      } catch (e) {
        // ignore per-client write errors
      }
    }
  }
}

function getConnectedUsers() {
  return Array.from(clientsMap.keys());
}

export { addClient, removeClient, sendEventToUser, broadcast, getConnectedUsers };
export default { addClient, removeClient, sendEventToUser, broadcast, getConnectedUsers };
