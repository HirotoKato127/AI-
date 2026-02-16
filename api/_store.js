// Shared in-memory stores for Vercel API routes (best-effort; resets on cold start).

const goalSettingsState = {
  evaluation_rule_type: "monthly",
  evaluation_rule_options: {},
};

const goalTargetsCompany = new Map(); // periodId -> targets
const goalTargetsPersonal = new Map(); // `${advisorUserId}:${periodId}` -> targets
const goalDailyTargets = new Map(); // `${advisorUserId}:${periodId}` -> { [date]: targets }

const msTargets = new Map(); // `${scope}:${departmentKey}:${metricKey}:${periodId}:${advisorUserId||0}` -> { targetTotal, dailyTargets }
const importantMetrics = new Map(); // `${departmentKey||'all'}:${userId||0}` -> [{departmentKey,userId,metricKey}]

const kpiTargets = new Map(); // period -> object

module.exports = {
  goalSettingsState,
  goalTargetsCompany,
  goalTargetsPersonal,
  goalDailyTargets,
  msTargets,
  importantMetrics,
  kpiTargets,
};

