const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

require('./config/env');

const authRoutes = require('./routes/authRoutes');
const managementRoutes = require('./routes/managementRoutes');
const taskRoutes = require('./routes/taskRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const profileRoutes = require('./routes/profileRoutes');
const employeeImportRoutes = require('./routes/employeeImportRoutes');
const taskCollaborationRoutes = require('./routes/taskCollaborationRoutes');
const taskFeaturesRoutes = require('./routes/taskFeaturesRoutes');

const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { frontendOrigins } = require('./config/env');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

const allowedOrigins = [
  ...frontendOrigins,

  // Quasar development server
  'http://localhost:9000',
  'http://127.0.0.1:9000',

  // Electron desktop development
  'http://localhost:5480',
  'http://127.0.0.1:5480'
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header
      // Electron/internal requests, curl, Postman, etc.
      if (!origin) {
        return callback(null, true);
      }

      // Allow explicitly configured frontend origins
      if (allowedOrigins.includes(origin)) {
        console.log(`[CORS] Allowed origin: ${origin}`);
        return callback(null, true);
      }

      // Allow localhost development origins with dynamic ports
      const isLocalDevelopmentOrigin =
        /^http:\/\/localhost:\d+$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);

      if (isLocalDevelopmentOrigin) {
        console.log(`[CORS] Allowed local development origin: ${origin}`);
        return callback(null, true);
      }

      // Reject unknown origins
      console.warn(`[CORS] Blocked origin: ${origin}`);
      return callback(
        new Error(`Origin is not allowed: ${origin}`)
      );
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ],

    optionsSuccessStatus: 204
  })
);

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'WorkSync API is running.'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api', employeeImportRoutes);
app.use('/api', notificationRoutes);
app.use('/api', taskCollaborationRoutes);
app.use('/api', taskFeaturesRoutes);
app.use('/api', taskRoutes);
app.use('/api', leaveRoutes);
app.use('/api', announcementRoutes);
app.use('/api', reportRoutes);
app.use('/api', managementRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;