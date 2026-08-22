const { processDeadlineNotifications } = require('./deadlineService');

let started = false;
let timer = null;

function startDeadlineScheduler() {
  if (started) return;
  started = true;
  const run = () => {
    try { processDeadlineNotifications(); } catch (error) { console.error('Deadline scheduler failed', error); }
  };
  run();
  timer = setInterval(run, 60 * 60 * 1000);
  timer.unref?.();
}

module.exports = { startDeadlineScheduler };
