const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/profileController');
const preferenceController = require('../controllers/notificationPreferenceController');
const { passwordLimiter } = require('../middleware/rateLimiters');

const router = express.Router();
router.use(authenticate);
router.get('/', asyncHandler(controller.profile));
router.post('/password/verify', passwordLimiter, asyncHandler(controller.verifyPassword));
router.put('/', asyncHandler(controller.update));
router.put('/password', passwordLimiter, asyncHandler(controller.changePassword));
router.get('/notification-preferences', asyncHandler(preferenceController.list));
router.patch('/notification-preferences', asyncHandler(preferenceController.update));
router.post('/notification-preferences/reset', asyncHandler(preferenceController.reset));
module.exports = router;
