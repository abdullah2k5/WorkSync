const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { preview, commit, resetDevelopmentData } = require('../utils/employeeImportService');

function content(req) {
  if (!req.file) throw new AppError('A CSV file is required.', 400);
  return req.file.buffer.toString('utf8');
}

function validateFile(req) {
  if (!req.file) throw new AppError('A CSV file is required.', 400);
  if (req.file.mimetype !== 'text/csv' && !req.file.originalname.toLowerCase().endsWith('.csv')) {
    throw new AppError('Only CSV files are supported.', 400);
  }
}

async function previewImport(req, res) {
  validateFile(req);
  res.json({ success: true, data: await preview(content(req)) });
}

async function commitImport(req, res) {
  validateFile(req);
  const result = await commit(content(req), req.user.id, req.file.originalname);
  if (result.fileError || result.summary.invalidRows || !result.imported.length) {
    return res.status(400).json({ success: false, message: 'Import validation failed. No employees were imported.', data: result });
  }
  res.status(201).json({ success: true, data: result });
}

async function history(req, res) {
  const result = await pool.query(
    `SELECT id,original_filename,total_rows,imported_rows,failed_rows,duplicate_rows,status,created_at
     FROM employee_imports ORDER BY created_at DESC,id DESC LIMIT 100`
  );
  res.json({ success: true, data: result.rows });
}

async function reset(req, res) {
  if (req.body?.confirmation !== 'RESET_DEMO_DATA') throw new AppError('Confirmation phrase is required.', 400);
  const admins = await resetDevelopmentData(req.user.id);
  res.json({ success: true, message: 'Development data reset completed.', data: { admins } });
}

module.exports = { previewImport, commitImport, history, reset };