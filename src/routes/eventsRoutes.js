import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { addClient, removeClient } from '../utils/sseManager.js';
import { getConnectedUsers } from '../utils/sseManager.js';

const router = express.Router();

// Allow token via query param for EventSource clients
const authQueryToHeader = (req, res, next) => {
  try {
    if (!req.headers.authorization && req.query && req.query.token) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
  } catch (e) {}
  next();
};

router.get('/stream', authQueryToHeader, authenticate, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  // Ensure headers are flushed
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const userId = req.auth0Id;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[sse] connection request', { userId, ip: req.ip, origin: req.headers.origin });
  }

  // Send initial connected event
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ connected: true, userId })}\n\n`);

  addClient(userId, res);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (e) { /* ignore */ }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    try { removeClient(userId, res); } catch (e) {}
    try { res.end(); } catch (e) {}
  });
});

export default router;

// Dev-only endpoint to send a test SSE to a user without going through application flows
if (process.env.NODE_ENV !== 'production') {
  router.post('/debug/send', express.json(), async (req, res) => {
    const { userId, eventName, data } = req.body || {};
    if (!userId || !eventName) {
      return res.status(400).json({ success: false, message: 'userId and eventName required' });
    }
    try {
      const { sendEventToUser } = await import('../utils/sseManager.js');
      const ok = sendEventToUser(userId.toString(), eventName, data === undefined ? {} : data);
      return res.status(200).json({ success: true, delivered: !!ok });
    } catch (err) {
      console.error('[sse debug] failed to send test event', err);
      return res.status(500).json({ success: false, message: 'failed to send test event', error: err.message });
    }
  });
  // Dev-only: list connected users
  router.get('/debug/clients', (req, res) => {
    try {
      const users = getConnectedUsers();
      res.status(200).json({ success: true, clients: users });
    } catch (err) {
      res.status(500).json({ success: false, message: 'failed to list clients', error: err.message });
    }
  });
}
