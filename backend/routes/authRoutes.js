const express = require('express');
const { login, me, changePassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { loginLimiter } = require('../middleware/rateLimiters');

const router = express.Router();
router.post('/login', loginLimiter, asyncHandler(login));
router.get('/me', authenticate, asyncHandler(me));
router.post('/change-password', authenticate, asyncHandler(changePassword));

module.exports = router;
