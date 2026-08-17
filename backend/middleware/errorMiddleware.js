function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found.' });
}

function errorHandler(error, req, res, next) {
  const status = error.statusCode || 500;
  if (status === 500) console.error(error);
  res.status(status).json({ success: false, message: status === 500 ? 'An unexpected server error occurred.' : error.message });
}

module.exports = { notFound, errorHandler };
