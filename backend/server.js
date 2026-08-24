const { port } = require('./config/env');

const app = require('./app');

const { startDeadlineScheduler } = require('./utils/deadlineScheduler');

require('./utils/notificationPreferenceSchema');

app.listen(port, '0.0.0.0', () => {
  console.log(`WorkSync API listening on port ${port}`);
  startDeadlineScheduler();
});