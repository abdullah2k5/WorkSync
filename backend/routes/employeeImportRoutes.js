const express = require('express');
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/employeeImportController');
const AppError = require('../utils/AppError');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 }, fileFilter: (req, file, callback) => file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv') ? callback(null, true) : callback(new AppError('Only CSV files are supported.', 400)) });
const router = express.Router();
router.use('/employee-imports', authenticate, authorize('admin'));
router.get('/employee-imports', asyncHandler(controller.history));
router.post('/employee-imports/reset', asyncHandler(controller.reset));
router.post('/employee-imports/preview', upload.single('file'), asyncHandler(controller.previewImport));
router.post('/employee-imports/commit', upload.single('file'), asyncHandler(controller.commitImport));
module.exports = router;
