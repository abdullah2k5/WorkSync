const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { authenticate } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/taskCollaborationController');
const AppError = require('../utils/AppError');

const storageDirectory = path.resolve(__dirname, '../storage/task-attachments');
fs.mkdirSync(storageDirectory, { recursive: true });
const allowedTypes = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf'],
  ['text/plain', '.txt'],
  ['application/zip', '.zip'],
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: storageDirectory,
    filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}${allowedTypes.get(file.mimetype) || ''}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) return callback(new AppError('Only PNG, JPEG, WebP, PDF, TXT, and ZIP files are allowed.', 400));
    callback(null, true);
  },
});
const uploadSingle = (req, res, next) => upload.single('file')(req, res, (error) => {
  if (!error) return next();
  if (error.code === 'LIMIT_FILE_SIZE') return next(new AppError('Files must be 10 MB or smaller.', 400));
  next(error);
});

const router = express.Router();
router.use(authenticate);
router.get('/tasks/:taskId/comments', asyncHandler(controller.comments));
router.post('/tasks/:taskId/comments', asyncHandler(controller.addComment));
router.get('/tasks/:taskId/blockers', asyncHandler(controller.blockers));
router.post('/tasks/:taskId/blockers', asyncHandler(controller.addBlocker));
router.patch('/tasks/:taskId/blockers/:blockerId', asyncHandler(controller.updateBlocker));
router.get('/tasks/:taskId/attachments', asyncHandler(controller.attachments));
router.post('/tasks/:taskId/attachments', uploadSingle, asyncHandler(controller.addAttachment));
router.get('/tasks/:taskId/attachments/:attachmentId', asyncHandler(controller.downloadAttachment));
router.delete('/tasks/:taskId/attachments/:attachmentId', asyncHandler(controller.removeAttachment));
module.exports = router;
