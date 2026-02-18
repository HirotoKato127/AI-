const { sendJson } = require("./_util");

module.exports = (_req, res) => {
  sendJson(res, 200, {
    tasksToday: [],
    tasksUpcoming: [],
    calendar: { month: null, pendingTasks: [], completedTasks: [], progressEvents: [] },
    notifications: [],
    candidates: [],
    closedCandidates: [],
  });
};

