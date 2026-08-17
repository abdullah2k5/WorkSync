
const app = require('./app');
const { port } = require('./config/env');
const { startDeadlineScheduler } = require('./utils/deadlineScheduler');
require('./utils/notificationPreferenceSchema');
require('./utils/onboardingSchema');

app.listen(port, () => {
	console.log(`WorkSync API listening on port ${port}`);
	startDeadlineScheduler();
});
