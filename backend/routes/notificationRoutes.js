const express=require('express');const jwt=require('jsonwebtoken');const c=require('../controllers/notificationController');const {authenticate}=require('../middleware/authMiddleware');const asyncHandler=require('../utils/asyncHandler');const { addUserStream } = require('../utils/notificationStream');const { jwtSecret } = require('../config/env');const router=express.Router();

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  let tokenFromQuery = '';
  try {
    const parsedUrl = new URL(req.originalUrl || req.url || '', 'http://localhost');
    tokenFromQuery = parsedUrl.searchParams.get('token') || '';
  } catch {
    tokenFromQuery = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
  }

  const tokenFromLegacyHeader = typeof req.headers['x-access-token'] === 'string' ? req.headers['x-access-token'].trim() : '';
  return tokenFromHeader || tokenFromQuery || tokenFromLegacyHeader || '';
}

router.get('/notifications/stream', (req, res) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication token is required.' });
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  addUserStream(req.user.id, res);
  return undefined;
});

router.use(authenticate);
router.get('/notifications',asyncHandler(c.list));router.get('/notifications/unread-count',asyncHandler(c.unreadCount));router.get('/notifications/:id/read',asyncHandler(c.readOne));router.post('/notifications/read-all',asyncHandler(c.readAll));router.delete('/notifications/:id',asyncHandler(c.remove));router.delete('/notifications',asyncHandler(c.clearAll));module.exports=router;