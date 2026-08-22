const { port } = require('./config/env');

const app = require('./app');

const { startDeadlineScheduler } = require('./utils/deadlineScheduler');

require('./utils/notificationPreferenceSchema');

app.listen(port, () => {
  console.log(`WorkSync API listening on port ${port}`);
  startDeadlineScheduler();
});