// scripts/auth.js
var SESSION_STORAGE_KEY = "dashboard.session.v1";
var KEY = SESSION_STORAGE_KEY;
function getSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s.exp && Date.now() > s.exp) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

// scripts/services/goalSettings.js
var DEFAULT_RULE = { type: "monthly", options: {} };
var KPI_TARGET_KEYS = [
  "newInterviewsTarget",
  "proposalsTarget",
  "recommendationsTarget",
  "interviewsScheduledTarget",
  "interviewsHeldTarget",
  "offersTarget",
  "acceptsTarget",
  "revenueTarget",
  "proposalRateTarget",
  "recommendationRateTarget",
  "interviewScheduleRateTarget",
  "interviewHeldRateTarget",
  "offerRateTarget",
  "acceptRateTarget",
  "hireRateTarget"
];
var PAGE_RATE_TARGET_KEYS = [
  // 広告管理画面
  "adValidAppRate",
  "adInterviewSetupRate",
  "adOfferRateTarget",
  "adOfferRateTargetStep",
  "adHireRateTarget",
  "adHireRateTargetStep",
  "adRetentionRate",
  // 架電管理画面
  "teleapoContactRate",
  "teleapoSetupRate",
  "teleapoAttendanceRate",
  "teleapoAttendanceRateContact",
  "teleapoConnectionRate",
  // 紹介先実績管理画面
  "clientRetentionRate"
];
var DEFAULT_GOAL_API_BASE = "https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod/goal";
var KPI_TARGET_API_BASE = "https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod";
var GOAL_API_BASE = resolveGoalApiBase();
var cache = {
  loaded: false,
  evaluationRule: normalizeRule(DEFAULT_RULE),
  evaluationPeriods: [],
  companyTargets: /* @__PURE__ */ new Map(),
  personalTargets: /* @__PURE__ */ new Map(),
  dailyTargets: /* @__PURE__ */ new Map(),
  msTargets: /* @__PURE__ */ new Map(),
  importantMetrics: /* @__PURE__ */ new Map(),
  pageRateTargets: /* @__PURE__ */ new Map(),
  // ページ別率目標（periodId -> targets）
  msPeriodSettings: /* @__PURE__ */ new Map()
  // MS期間設定（month -> { metricKey -> { startDate, endDate } }）
};
cache.evaluationPeriods = buildDefaultPeriods(cache.evaluationRule);
function resolveGoalApiBase() {
  if (typeof window === "undefined") return DEFAULT_GOAL_API_BASE;
  const fromWindow = window.GOAL_API_BASE || "";
  let fromStorage = "";
  try {
    fromStorage = localStorage.getItem("dashboard.goalApiBase") || "";
  } catch {
    fromStorage = "";
  }
  const base = (fromWindow || fromStorage || "").trim();
  const resolved = base ? base : DEFAULT_GOAL_API_BASE;
  return resolved.replace(/\/$/, "");
}
function buildGoalUrl(path) {
  if (!GOAL_API_BASE) return path;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${GOAL_API_BASE}${suffix}`;
}
function buildApiUrl(base, path) {
  if (!base) return path;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base.replace(/\/$/, "")}${suffix}`;
}
function getAuthHeaders() {
  var _a;
  const token = (_a = getSession()) == null ? void 0 : _a.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
async function requestJson(path, options = {}) {
  const res = await fetch(buildGoalUrl(path), {
    headers: {
      Accept: "application/json",
      ...options.headers || {},
      ...getAuthHeaders()
    },
    ...options
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = (data == null ? void 0 : data.error) || (data == null ? void 0 : data.message) || `HTTP ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}
async function requestJsonWithBase(base, path, options = {}) {
  const res = await fetch(buildApiUrl(base, path), {
    headers: {
      Accept: "application/json",
      ...options.headers || {},
      ...getAuthHeaders()
    },
    ...options
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = (data == null ? void 0 : data.error) || (data == null ? void 0 : data.message) || `HTTP ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}
function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function makeMsKey({ scope, departmentKey, metricKey, periodId, advisorUserId }) {
  const advisor = Number.isFinite(advisorUserId) ? advisorUserId : 0;
  return [scope, departmentKey, metricKey, periodId, advisor].join(":");
}
function makeImportantMetricKey({ departmentKey, userId }) {
  const user = Number.isFinite(userId) ? userId : 0;
  return [departmentKey || "all", user].join(":");
}
async function loadImportantMetricsFromApi({ departmentKey, userId, force = false } = {}) {
  const key = makeImportantMetricKey({ departmentKey, userId });
  if (!force && cache.importantMetrics.has(key)) {
    return cache.importantMetrics.get(key);
  }
  const params = new URLSearchParams();
  if (departmentKey) params.set("departmentKey", departmentKey);
  if (Number.isFinite(userId) && userId > 0) params.set("userId", String(userId));
  const data = await requestJsonWithBase(KPI_TARGET_API_BASE, `/important-metrics?${params.toString()}`);
  const items = Array.isArray(data == null ? void 0 : data.items) ? data.items : [];
  cache.importantMetrics.set(key, items);
  return items;
}
async function saveImportantMetricToApi({ departmentKey, userId, metricKey }) {
  if (!departmentKey || !userId || !metricKey) return null;
  await requestJsonWithBase(KPI_TARGET_API_BASE, "/important-metrics", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departmentKey, userId, metricKey })
  });
  return { departmentKey, userId, metricKey };
}
var MS_PERIOD_SETTINGS_API_BASE = "https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod";
async function loadMsPeriodSettingsFromApi(month, { force = false } = {}) {
  if (!month) return {};
  if (!force && cache.msPeriodSettings.has(month)) return cache.msPeriodSettings.get(month);
  try {
    const res = await fetch(`${MS_PERIOD_SETTINGS_API_BASE}/ms-period-settings?month=${month}`, {
      headers: { Accept: "application/json", ...getAuthHeaders() }
    });
    if (res.status === 404) {
      cache.msPeriodSettings.set(month, {});
      return {};
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const map = {};
    ((data == null ? void 0 : data.settings) || []).forEach((item) => {
      if (item.metricKey) map[item.metricKey] = { startDate: item.startDate, endDate: item.endDate };
    });
    cache.msPeriodSettings.set(month, map);
    return map;
  } catch (error) {
    console.warn("[goalSettingsService] failed to load ms period settings", error);
    return cache.msPeriodSettings.get(month) || {};
  }
}
async function saveMsPeriodSettingsToApi(month, settings) {
  if (!month || !Array.isArray(settings)) return null;
  const res = await fetch(`${MS_PERIOD_SETTINGS_API_BASE}/ms-period-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ month, settings })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save ms period settings: ${res.status} ${text}`);
  }
  const map = {};
  settings.forEach((item) => {
    if (item.metricKey && item.startDate && item.endDate) {
      map[item.metricKey] = { startDate: item.startDate, endDate: item.endDate };
    }
  });
  cache.msPeriodSettings.set(month, map);
  return map;
}
async function loadMsTargetsFromApi({ scope, departmentKey, metricKey, periodId, advisorUserId, force = false }) {
  if (!scope || !departmentKey || !metricKey || !periodId) return null;
  const key = makeMsKey({ scope, departmentKey, metricKey, periodId, advisorUserId });
  if (!force && cache.msTargets.has(key)) {
    return cache.msTargets.get(key);
  }
  const params = new URLSearchParams({
    scope,
    departmentKey,
    metricKey,
    periodId
  });
  if (Number.isFinite(advisorUserId) && advisorUserId > 0) {
    params.set("advisorUserId", String(advisorUserId));
  }
  const data = await requestJsonWithBase(KPI_TARGET_API_BASE, `/ms-targets?${params.toString()}`);
  const normalized = {
    targetTotal: Number((data == null ? void 0 : data.targetTotal) || 0),
    dailyTargets: (data == null ? void 0 : data.dailyTargets) || {}
  };
  cache.msTargets.set(key, normalized);
  return normalized;
}
async function saveMsTargetsToApi({ scope, departmentKey, metricKey, periodId, advisorUserId, targetTotal, dailyTargets }) {
  if (!scope || !departmentKey || !metricKey || !periodId) return null;
  await requestJsonWithBase(KPI_TARGET_API_BASE, "/ms-targets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope,
      departmentKey,
      metricKey,
      periodId,
      advisorUserId: Number.isFinite(advisorUserId) ? advisorUserId : null,
      targetTotal: Number(targetTotal || 0),
      dailyTargets: dailyTargets || {}
    })
  });
  const key = makeMsKey({ scope, departmentKey, metricKey, periodId, advisorUserId });
  const normalized = {
    targetTotal: Number(targetTotal || 0),
    dailyTargets: dailyTargets || {}
  };
  cache.msTargets.set(key, normalized);
  return normalized;
}
function padMonth(value) {
  return String(value).padStart(2, "0");
}
function buildDefaultPeriods(ruleInput) {
  var _a, _b, _c, _d;
  const rule = normalizeRule(ruleInput);
  switch (rule.type) {
    case "half-month":
      return buildHalfMonthPeriods();
    case "master-month":
      return buildMasterMonthPeriods();
    case "weekly":
      return buildWeeklyPeriods(((_a = rule.options) == null ? void 0 : _a.startWeekday) || "monday");
    case "quarterly":
      return buildQuarterlyPeriods(((_b = rule.options) == null ? void 0 : _b.fiscalStartMonth) || 1);
    case "custom-month":
      return buildCustomMonthPeriods(((_c = rule.options) == null ? void 0 : _c.startDay) || 1, ((_d = rule.options) == null ? void 0 : _d.endDay) || 31);
    case "monthly":
    default:
      return buildMonthlyPeriods();
  }
}
function buildMonthlyPeriods() {
  const now = /* @__PURE__ */ new Date();
  const periods = [];
  for (let offset = -12; offset <= 12; offset += 1) {
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const id = `${year}-${padMonth(month + 1)}`;
    const label = `${year}\u5E74${padMonth(month + 1)}\u6708`;
    periods.push({
      id,
      label,
      startDate: isoDate(startOfMonth),
      endDate: isoDate(endOfMonth)
    });
  }
  return periods;
}
function buildMasterMonthPeriods() {
  const now = /* @__PURE__ */ new Date();
  const periods = [];
  for (let offset = -12; offset <= 12; offset += 1) {
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const endDate = safeDay(year, month, 15);
    const previous = new Date(year, month - 1, 1);
    const startDate = safeDay(previous.getFullYear(), previous.getMonth(), 16);
    const id = `${year}-${padMonth(month + 1)}-M`;
    const label = `${year}\u5E74${padMonth(month + 1)}\u6708\u8A55\u4FA1`;
    periods.push({
      id,
      label,
      startDate: isoDate(startDate),
      endDate: isoDate(endDate)
    });
  }
  return periods;
}
function buildHalfMonthPeriods() {
  const now = /* @__PURE__ */ new Date();
  const periods = [];
  for (let offset = -12; offset <= 12; offset += 1) {
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const monthLabel = `${year}\u5E74${padMonth(month + 1)}\u6708`;
    const startOfMonth = new Date(year, month, 1);
    const mid = new Date(year, month, 15);
    const endOfMonth = new Date(year, month + 1, 0);
    periods.push(
      {
        id: `${year}-${padMonth(month + 1)}-H1`,
        label: `${monthLabel}\u524D\u534A`,
        startDate: isoDate(startOfMonth),
        endDate: isoDate(mid)
      },
      {
        id: `${year}-${padMonth(month + 1)}-H2`,
        label: `${monthLabel}\u5F8C\u534A`,
        startDate: isoDate(new Date(year, month, 16)),
        endDate: isoDate(endOfMonth)
      }
    );
  }
  return periods;
}
function buildWeeklyPeriods(startWeekday = "monday") {
  const now = /* @__PURE__ */ new Date();
  const periods = [];
  const dayOffset = startWeekday === "sunday" ? 0 : 1;
  for (let offset = -26; offset <= 26; offset += 1) {
    const base = new Date(now);
    base.setDate(base.getDate() + offset * 7);
    const diff = (base.getDay() - dayOffset + 7) % 7;
    const start = new Date(base);
    start.setDate(base.getDate() - diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const id = `${start.getFullYear()}-${padMonth(start.getMonth() + 1)}-${String(start.getDate()).padStart(2, "0")}`;
    const label = `${isoDate(start)}\u301C${isoDate(end)}`;
    periods.push({
      id,
      label,
      startDate: isoDate(start),
      endDate: isoDate(end)
    });
  }
  return periods;
}
function buildQuarterlyPeriods(fiscalStartMonth = 1) {
  const now = /* @__PURE__ */ new Date();
  const periods = [];
  const startMonth = Number(fiscalStartMonth) || 1;
  for (let offset = -8; offset <= 8; offset += 1) {
    const qStartMonth = ((startMonth - 1 + offset * 3) % 12 + 12) % 12;
    const startYear = now.getFullYear() + Math.floor((startMonth - 1 + offset * 3) / 12);
    const start = new Date(startYear, qStartMonth, 1);
    const end = new Date(startYear, qStartMonth + 3, 0);
    const qIndex = (offset % 4 + 4) % 4 + 1;
    const id = `${start.getFullYear()}-Q${qIndex}-${startMonth}`;
    const label = `Q${qIndex}\uFF08${isoDate(start)}\u301C${isoDate(end)}\uFF09`;
    periods.push({
      id,
      label,
      startDate: isoDate(start),
      endDate: isoDate(end)
    });
  }
  return periods;
}
function buildCustomMonthPeriods(startDayRaw = 1, endDayRaw = 31) {
  const now = /* @__PURE__ */ new Date();
  const periods = [];
  const startDay = clampDay(startDayRaw);
  const endDay = clampDay(endDayRaw);
  for (let offset = -12; offset <= 12; offset += 1) {
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const startDate = safeDay(year, month, startDay);
    let endDate;
    if (startDay <= endDay) {
      endDate = safeDay(year, month, endDay);
    } else {
      const next = new Date(year, month + 1, 1);
      endDate = safeDay(next.getFullYear(), next.getMonth(), endDay);
    }
    const id = `${year}-${padMonth(month + 1)}-C`;
    const label = `${year}\u5E74${padMonth(month + 1)}\u6708\uFF08${isoDate(startDate)}\u301C${isoDate(endDate)}\uFF09`;
    periods.push({
      id,
      label,
      startDate: isoDate(startDate),
      endDate: isoDate(endDate)
    });
  }
  return periods;
}
function clampDay(day) {
  const num = Number(day);
  if (!Number.isFinite(num)) return 1;
  return Math.min(31, Math.max(1, Math.round(num)));
}
function safeDay(year, month, day) {
  const last = new Date(year, month + 1, 0).getDate();
  const clamped = Math.min(last, Math.max(1, day));
  return new Date(year, month, clamped);
}
function normalizeTarget(raw = {}) {
  return KPI_TARGET_KEYS.reduce((acc, key) => {
    const value = Number(raw[key]);
    acc[key] = Number.isFinite(value) ? value : 0;
    return acc;
  }, {});
}
var KEY_VARIANTS = {
  adValidAppRate: ["adValidAppRate", "adValidApplicationRateTarget", "ad_valid_application_rate_target", "validApplicationRateTarget"],
  adInterviewSetupRate: ["adInterviewSetupRate", "adInitialInterviewRateTarget", "ad_initial_interview_rate_target", "initialInterviewRateTarget"],
  adOfferRateTarget: [
    "offerRateTarget",
    "offer_rate_target",
    "adOfferRateTarget",
    "ad_offer_rate_target",
    "adOfferTarget",
    "ad_offer_target",
    "adOfferRate",
    "ad_offer_rate",
    "adProvisionalOfferRateTarget",
    "ad_provisional_offer_rate_target",
    "adInformalOfferRateTarget",
    "ad_informal_offer_rate_target"
  ],
  adOfferRateTargetStep: ["adOfferRateTargetStep", "ad_offer_rate_target_step"],
  adHireRateTarget: [
    "hireRateTarget",
    "hire_rate_target",
    "adHireRateTarget",
    "ad_hire_rate_target",
    "adHireTarget",
    "ad_hire_target",
    "adHireRate",
    "ad_hire_rate",
    "adDecisionRateTarget",
    "ad_decision_rate_target",
    "decisionRateTarget",
    "decision_rate_target",
    "adEmploymentRateTarget",
    "ad_employment_rate_target"
  ],
  adHireRateTargetStep: ["adHireRateTargetStep", "ad_hire_rate_target_step"],
  adRetentionRate: ["adRetentionRate", "adRetentionRateTarget", "ad_retention_rate_target", "retentionRateTarget"],
  teleapoContactRate: ["teleapoContactRate", "teleapoContactRateTarget", "teleapo_contact_rate_target"],
  teleapoSetupRate: ["teleapoSetupRate", "teleapoSetRateTarget", "teleapo_set_rate_target"],
  teleapoAttendanceRate: ["teleapoAttendanceRate", "teleapoShowRateTarget", "teleapo_show_rate_target"],
  teleapoAttendanceRateContact: ["teleapoAttendanceRateContact", "teleapoShowRateTargetWithContact", "teleapo_show_rate_target_with_contact"],
  teleapoConnectionRate: ["teleapoConnectionRate", "teleapoConnectRateTarget", "teleapo_connect_rate_target"],
  clientRetentionRate: ["clientRetentionRate", "referralRetentionRateTarget", "referral_retention_rate_target"]
};
function normalizePageRateTarget(raw = {}) {
  return PAGE_RATE_TARGET_KEYS.reduce((acc, canonicalKey) => {
    let value = 0;
    const variants = KEY_VARIANTS[canonicalKey] || [canonicalKey];
    for (const variant of variants) {
      if (raw[variant] !== void 0 && raw[variant] !== null && raw[variant] !== "") {
        const parsed = Number(raw[variant]);
        if (Number.isFinite(parsed) && parsed >= 0) {
          value = parsed;
          break;
        }
      }
    }
    acc[canonicalKey] = value;
    return acc;
  }, {});
}
async function loadPageRateTargetsFromApi(periodId, { force = false } = {}) {
  if (!periodId) return null;
  if (!force && cache.pageRateTargets.has(periodId)) return cache.pageRateTargets.get(periodId);
  const headers = getAuthHeaders();
  const targetMonth = periodId && periodId.length >= 7 ? periodId.substring(0, 7) : periodId;
  const url = `${KPI_TARGET_API_BASE}/kpi-targets?period=${targetMonth}`;
  try {
    const res = await fetch(url, { headers: { ...headers, Accept: "application/json" } });
    if (res.status === 404) {
      const empty = {};
      cache.pageRateTargets.set(periodId, empty);
      return empty;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const target = normalizePageRateTarget(data || {});
    cache.pageRateTargets.set(periodId, target);
    return target;
  } catch (error) {
    console.warn("[goalSettingsService] failed to load page rate targets", error);
    return {};
  }
}
function getPeriodByDate(dateStr, periods) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const list = Array.isArray(periods) ? periods : [];
  return list.find((period) => {
    if (!(period == null ? void 0 : period.startDate) || !(period == null ? void 0 : period.endDate)) return false;
    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    return start <= target && target <= end;
  }) || null;
}
function normalizeRule(raw) {
  if (raw && typeof raw === "object" && raw.type) {
    return {
      type: raw.type,
      options: raw.options || {}
    };
  }
  const legacy = typeof raw === "string" ? raw : DEFAULT_RULE.type;
  const mapped = legacy === "half-monthly" ? "half-month" : legacy === "custom" ? "custom-month" : legacy === "master-monthly" ? "master-month" : legacy;
  return { type: mapped || "monthly", options: {} };
}
function resolveAdvisorUserId(advisorName) {
  var _a, _b;
  const session = getSession();
  const sessionId = Number((_a = session == null ? void 0 : session.user) == null ? void 0 : _a.id);
  if (Number.isFinite(sessionId) && sessionId > 0) {
    if (!advisorName || ((_b = session == null ? void 0 : session.user) == null ? void 0 : _b.name) === advisorName) {
      return sessionId;
    }
  }
  const parsed = Number(advisorName);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return null;
}
function makePersonalKey(advisorUserId, periodId) {
  return `${advisorUserId}:${periodId}`;
}
function normalizeAdvisorIds(advisorUserIds) {
  if (!advisorUserIds) return [];
  const raw = Array.isArray(advisorUserIds) ? advisorUserIds : String(advisorUserIds).split(",");
  return raw.map((value) => Number(String(value).trim())).filter((value) => Number.isFinite(value) && value > 0);
}
async function loadEvaluationRuleFromApi() {
  const data = await requestJson("/goal-settings");
  const rule = normalizeRule({
    type: (data == null ? void 0 : data.evaluation_rule_type) || DEFAULT_RULE.type,
    options: (data == null ? void 0 : data.evaluation_rule_options) || {}
  });
  cache.evaluationRule = rule;
  cache.evaluationPeriods = buildDefaultPeriods(rule);
  cache.loaded = true;
  return cache.evaluationRule;
}
async function loadCompanyTargetFromApi(periodId, { force = false } = {}) {
  if (!periodId) return null;
  if (!force && cache.companyTargets.has(periodId)) return cache.companyTargets.get(periodId);
  const params = new URLSearchParams({ scope: "company", periodId });
  const data = await requestJson(`/goal-targets?${params.toString()}`);
  const target = normalizeTarget((data == null ? void 0 : data.targets) || {});
  cache.companyTargets.set(periodId, target);
  return target;
}
async function loadPersonalTargetFromApi(periodId, advisorName, { force = false } = {}) {
  if (!periodId) return null;
  const advisorUserId = resolveAdvisorUserId(advisorName);
  if (!advisorUserId) return null;
  const key = makePersonalKey(advisorUserId, periodId);
  if (!force && cache.personalTargets.has(key)) return cache.personalTargets.get(key);
  const params = new URLSearchParams({
    scope: "personal",
    periodId,
    advisorUserId: String(advisorUserId)
  });
  const data = await requestJson(`/goal-targets?${params.toString()}`);
  const target = normalizeTarget((data == null ? void 0 : data.targets) || {});
  cache.personalTargets.set(key, target);
  return target;
}
async function loadDailyTargetsFromApi(periodId, advisorName, { force = false } = {}) {
  if (!periodId) return {};
  const advisorUserId = resolveAdvisorUserId(advisorName);
  if (!advisorUserId) return {};
  const key = makePersonalKey(advisorUserId, periodId);
  if (!force && cache.dailyTargets.has(key)) return cache.dailyTargets.get(key);
  const params = new URLSearchParams({
    advisorUserId: String(advisorUserId),
    periodId
  });
  const data = await requestJson(`/goal-daily-targets?${params.toString()}`);
  const raw = (data == null ? void 0 : data.dailyTargets) || {};
  const normalized = {};
  Object.entries(raw).forEach(([date, target]) => {
    normalized[date] = normalizeTarget(target || {});
  });
  cache.dailyTargets.set(key, normalized);
  return normalized;
}
async function loadPersonalTargetsBulkFromApi(periodId, advisorUserIds, { force = false } = {}) {
  if (!periodId) return [];
  const ids = normalizeAdvisorIds(advisorUserIds);
  if (!ids.length) return [];
  const pending = force ? ids : ids.filter((id) => !cache.personalTargets.has(makePersonalKey(id, periodId)));
  if (!pending.length) return [];
  const params = new URLSearchParams({
    scope: "personal",
    periodId,
    advisorUserIds: pending.join(",")
  });
  const data = await requestJson(`/goal-targets?${params.toString()}`);
  const items = Array.isArray(data == null ? void 0 : data.items) ? data.items : (data == null ? void 0 : data.targetsByAdvisor) && typeof data.targetsByAdvisor === "object" ? Object.entries(data.targetsByAdvisor).map(([advisorUserId, targets]) => ({
    advisorUserId,
    targets
  })) : [];
  items.forEach((item) => {
    const advisorUserId = Number((item == null ? void 0 : item.advisorUserId) ?? (item == null ? void 0 : item.advisor_user_id));
    if (!Number.isFinite(advisorUserId) || advisorUserId <= 0) return;
    const target = normalizeTarget((item == null ? void 0 : item.targets) || {});
    const key = makePersonalKey(advisorUserId, periodId);
    cache.personalTargets.set(key, target);
  });
  return items;
}
async function loadDailyTargetsBulkFromApi(periodId, advisorUserIds, { force = false, date } = {}) {
  if (!periodId) return [];
  const ids = normalizeAdvisorIds(advisorUserIds);
  if (!ids.length) return [];
  const pending = force ? ids : ids.filter((id) => !cache.dailyTargets.has(makePersonalKey(id, periodId)));
  if (!pending.length) return [];
  const params = new URLSearchParams({
    periodId,
    advisorUserIds: pending.join(",")
  });
  if (date) params.set("date", date);
  const data = await requestJson(`/goal-daily-targets?${params.toString()}`);
  const items = Array.isArray(data == null ? void 0 : data.items) ? data.items : (data == null ? void 0 : data.dailyTargetsByAdvisor) && typeof data.dailyTargetsByAdvisor === "object" ? Object.entries(data.dailyTargetsByAdvisor).map(([advisorUserId, dailyTargets]) => ({
    advisorUserId,
    dailyTargets
  })) : [];
  items.forEach((item) => {
    const advisorUserId = Number((item == null ? void 0 : item.advisorUserId) ?? (item == null ? void 0 : item.advisor_user_id));
    if (!Number.isFinite(advisorUserId) || advisorUserId <= 0) return;
    const raw = (item == null ? void 0 : item.dailyTargets) || {};
    const normalized = {};
    Object.entries(raw).forEach(([targetDate, target]) => {
      normalized[targetDate] = normalizeTarget(target || {});
    });
    const key = makePersonalKey(advisorUserId, periodId);
    cache.dailyTargets.set(key, normalized);
  });
  return items;
}
var goalSettingsService = {
  async load({ force = false } = {}) {
    if (!force && cache.loaded) return cache.evaluationRule;
    try {
      return await loadEvaluationRuleFromApi();
    } catch (error) {
      console.warn("[goalSettingsService] failed to load settings", error);
      cache.loaded = true;
      return cache.evaluationRule;
    }
  },
  getEvaluationRule() {
    return cache.evaluationRule;
  },
  async setEvaluationRule(rule) {
    const nextRule = normalizeRule(rule);
    await requestJson("/goal-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evaluation_rule_type: nextRule.type,
        evaluation_rule_options: nextRule.options || {}
      })
    });
    cache.evaluationRule = nextRule;
    cache.evaluationPeriods = buildDefaultPeriods(nextRule);
    return cache.evaluationRule;
  },
  getEvaluationPeriods() {
    return Array.isArray(cache.evaluationPeriods) ? cache.evaluationPeriods : [];
  },
  setEvaluationPeriods(periods = []) {
    cache.evaluationPeriods = Array.isArray(periods) ? periods : [];
    return cache.evaluationPeriods;
  },
  getCompanyPeriodTarget(periodId) {
    return cache.companyTargets.get(periodId) || null;
  },
  async loadCompanyPeriodTarget(periodId, { force = false } = {}) {
    try {
      return await loadCompanyTargetFromApi(periodId, { force });
    } catch (error) {
      console.warn("[goalSettingsService] failed to load company target", error);
      return this.getCompanyPeriodTarget(periodId);
    }
  },
  async saveCompanyPeriodTarget(periodId, target = {}) {
    if (!periodId) return null;
    const normalized = normalizeTarget(target);
    await requestJson("/goal-targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "company", periodId, targets: normalized })
    });
    cache.companyTargets.set(periodId, normalized);
    return normalized;
  },
  getPersonalPeriodTarget(periodId, advisorName) {
    const advisorUserId = resolveAdvisorUserId(advisorName);
    if (!advisorUserId || !periodId) return null;
    const key = makePersonalKey(advisorUserId, periodId);
    return cache.personalTargets.get(key) || null;
  },
  async loadPersonalPeriodTarget(periodId, advisorName, { force = false } = {}) {
    try {
      return await loadPersonalTargetFromApi(periodId, advisorName, { force });
    } catch (error) {
      console.warn("[goalSettingsService] failed to load personal target", error);
      return this.getPersonalPeriodTarget(periodId, advisorName);
    }
  },
  async loadPersonalPeriodTargetsBulk(periodId, advisorUserIds, { force = false } = {}) {
    try {
      return await loadPersonalTargetsBulkFromApi(periodId, advisorUserIds, { force });
    } catch (error) {
      console.warn("[goalSettingsService] failed to load personal targets (bulk)", error);
      const ids = normalizeAdvisorIds(advisorUserIds);
      await Promise.all(ids.map((id) => loadPersonalTargetFromApi(periodId, id, { force: true })));
      return [];
    }
  },
  async savePersonalPeriodTarget(periodId, target = {}, advisorName) {
    if (!periodId) return null;
    const advisorUserId = resolveAdvisorUserId(advisorName);
    if (!advisorUserId) {
      throw new Error("advisorUserId is required");
    }
    const normalized = normalizeTarget(target);
    await requestJson("/goal-targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "personal",
        advisorUserId,
        periodId,
        targets: normalized
      })
    });
    const key = makePersonalKey(advisorUserId, periodId);
    cache.personalTargets.set(key, normalized);
    return normalized;
  },
  getPersonalDailyTargets(periodId, advisorName) {
    const advisorUserId = resolveAdvisorUserId(advisorName);
    if (!advisorUserId || !periodId) return {};
    const key = makePersonalKey(advisorUserId, periodId);
    return cache.dailyTargets.get(key) || {};
  },
  async loadPersonalDailyTargets(periodId, advisorName, { force = false } = {}) {
    try {
      return await loadDailyTargetsFromApi(periodId, advisorName, { force });
    } catch (error) {
      console.warn("[goalSettingsService] failed to load daily targets", error);
      return this.getPersonalDailyTargets(periodId, advisorName);
    }
  },
  async loadPersonalDailyTargetsBulk(periodId, advisorUserIds, { force = false, date } = {}) {
    try {
      return await loadDailyTargetsBulkFromApi(periodId, advisorUserIds, { force, date });
    } catch (error) {
      console.warn("[goalSettingsService] failed to load daily targets (bulk)", error);
      const ids = normalizeAdvisorIds(advisorUserIds);
      await Promise.all(ids.map((id) => loadDailyTargetsFromApi(periodId, id, { force: true })));
      return [];
    }
  },
  async savePersonalDailyTargets(periodId, dailyTargets = {}, advisorName) {
    if (!periodId) return {};
    const advisorUserId = resolveAdvisorUserId(advisorName);
    if (!advisorUserId) {
      throw new Error("advisorUserId is required");
    }
    const items = Object.entries(dailyTargets || {}).map(([date, target]) => ({
      target_date: date,
      targets: normalizeTarget(target || {})
    }));
    await requestJson("/goal-daily-targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ advisorUserId, periodId, items })
    });
    const key = makePersonalKey(advisorUserId, periodId);
    const normalized = {};
    items.forEach((item) => {
      normalized[item.target_date] = item.targets;
    });
    cache.dailyTargets.set(key, normalized);
    return normalized;
  },
  getMsTargets({ scope, departmentKey, metricKey, periodId, advisorUserId }) {
    const key = makeMsKey({ scope, departmentKey, metricKey, periodId, advisorUserId });
    return cache.msTargets.get(key) || null;
  },
  async loadMsTargets({ scope, departmentKey, metricKey, periodId, advisorUserId, force = false } = {}) {
    try {
      return await loadMsTargetsFromApi({ scope, departmentKey, metricKey, periodId, advisorUserId, force });
    } catch (error) {
      console.warn("[goalSettingsService] failed to load ms targets", error);
      return this.getMsTargets({ scope, departmentKey, metricKey, periodId, advisorUserId });
    }
  },
  async saveMsTargets({ scope, departmentKey, metricKey, periodId, advisorUserId, targetTotal, dailyTargets } = {}) {
    try {
      return await saveMsTargetsToApi({ scope, departmentKey, metricKey, periodId, advisorUserId, targetTotal, dailyTargets });
    } catch (error) {
      console.warn("[goalSettingsService] failed to save ms targets", error);
      return null;
    }
  },
  getImportantMetrics({ departmentKey, userId } = {}) {
    const key = makeImportantMetricKey({ departmentKey, userId });
    return cache.importantMetrics.get(key) || [];
  },
  async loadImportantMetrics({ departmentKey, userId, force = false } = {}) {
    try {
      return await loadImportantMetricsFromApi({ departmentKey, userId, force });
    } catch (error) {
      console.warn("[goalSettingsService] failed to load important metrics", error);
      return this.getImportantMetrics({ departmentKey, userId });
    }
  },
  async saveImportantMetric({ departmentKey, userId, metricKey } = {}) {
    try {
      const saved = await saveImportantMetricToApi({ departmentKey, userId, metricKey });
      const key = makeImportantMetricKey({ departmentKey, userId });
      cache.importantMetrics.set(key, [saved]);
      const deptKey = makeImportantMetricKey({ departmentKey });
      const current = Array.isArray(cache.importantMetrics.get(deptKey)) ? cache.importantMetrics.get(deptKey) : [];
      const next = current.filter((item) => Number((item == null ? void 0 : item.userId) || (item == null ? void 0 : item.user_id)) !== Number(userId));
      next.push(saved);
      cache.importantMetrics.set(deptKey, next);
      return saved;
    } catch (error) {
      console.warn("[goalSettingsService] failed to save important metric", error);
      return null;
    }
  },
  getPeriodByDate(dateStr, periods) {
    return getPeriodByDate(dateStr, periods || cache.evaluationPeriods);
  },
  resolvePeriodIdByDate(dateStr, periods) {
    const period = this.getPeriodByDate(dateStr, periods);
    return (period == null ? void 0 : period.id) || null;
  },
  formatPeriodLabel(period) {
    if (!period) return "";
    const range = period.startDate && period.endDate ? `\uFF08${period.startDate}\u301C${period.endDate}\uFF09` : "";
    return `${period.label || period.id || "\u671F\u9593\u672A\u8A2D\u5B9A"}${range}`;
  },
  generateDefaultPeriods(rule) {
    return buildDefaultPeriods(rule || DEFAULT_RULE);
  },
  listKpiTargetKeys() {
    return [...KPI_TARGET_KEYS];
  },
  listPageRateTargetKeys() {
    return [...PAGE_RATE_TARGET_KEYS];
  },
  // ページ別率目標の取得
  getPageRateTargets(periodId) {
    return cache.pageRateTargets.get(periodId) || null;
  },
  // ページ別率目標のロード
  async loadPageRateTargets(periodId, { force = false } = {}) {
    try {
      return await loadPageRateTargetsFromApi(periodId, { force });
    } catch (error) {
      console.warn("[goalSettingsService] failed to load page rate targets", error);
      return this.getPageRateTargets(periodId);
    }
  },
  // ページ別率目標の保存
  async savePageRateTargets(periodId, targets = {}) {
    if (!periodId) return null;
    const normalized = normalizePageRateTarget(targets);
    const expandedPayload = {};
    Object.entries(normalized).forEach(([canonicalKey, value]) => {
      const variants = KEY_VARIANTS[canonicalKey] || [canonicalKey];
      variants.forEach((variant) => {
        expandedPayload[variant] = value;
      });
    });
    const url = `${KPI_TARGET_API_BASE}/kpi-targets`;
    const headers = getAuthHeaders();
    const targetMonth = periodId && periodId.length >= 7 ? periodId.substring(0, 7) : periodId;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ period: targetMonth, targets: expandedPayload })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to save targets: ${res.status} ${text}`);
    }
    cache.pageRateTargets.set(periodId, normalized);
    return normalized;
  },
  // MS期間設定の取得
  getMsPeriodSettings(month) {
    return cache.msPeriodSettings.get(month) || null;
  },
  // 指定月・指標のMS期間を取得
  getMsPeriodForMetric(month, metricKey) {
    const map = cache.msPeriodSettings.get(month);
    return (map == null ? void 0 : map[metricKey]) || null;
  },
  // MS期間設定のロード
  async loadMsPeriodSettings(month, { force = false } = {}) {
    return loadMsPeriodSettingsFromApi(month, { force });
  },
  // MS期間設定の保存
  // settings: [{ metricKey, startDate, endDate }, ...]
  async saveMsPeriodSettings(month, settings) {
    return saveMsPeriodSettingsToApi(month, settings);
  },
  // 目標達成度から色クラスを判定
  getRateColorClass(actualRate, targetRate, options = {}) {
    const { highThreshold = 100, midThreshold = 80 } = options;
    if (!Number.isFinite(targetRate) || targetRate <= 0) {
      return "bg-slate-100 text-slate-700";
    }
    const percentage = actualRate / targetRate * 100;
    if (percentage >= highThreshold) return "bg-green-100 text-green-700";
    if (percentage >= midThreshold) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  }
};

// scripts/api/endpoints.js
var DEFAULT_PRIMARY_API_BASE = "https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod";
function normalizeBaseUrl(value, fallback = "") {
  const text = String(value || "").trim();
  const base = text || fallback;
  return String(base || "").replace(/\/+$/, "");
}
function resolveApiBase({
  windowKey = "",
  storageKey = "",
  defaultBase = ""
} = {}) {
  if (typeof window === "undefined") {
    return normalizeBaseUrl(defaultBase);
  }
  const fromWindow = windowKey ? window[windowKey] : "";
  let fromStorage = "";
  if (storageKey) {
    try {
      fromStorage = localStorage.getItem(storageKey) || "";
    } catch {
      fromStorage = "";
    }
  }
  return normalizeBaseUrl(fromWindow || fromStorage, defaultBase);
}
var PRIMARY_API_BASE = resolveApiBase({
  windowKey: "APP_API_BASE",
  storageKey: "dashboard.apiBase",
  defaultBase: DEFAULT_PRIMARY_API_BASE
});

// scripts/services/validApplication.js?v=20260211_04
var PLACEHOLDER_VALUES = /* @__PURE__ */ new Set(["-", "\u30FC", "\u672A\u8A2D\u5B9A", "\u672A\u5165\u529B", "\u672A\u767B\u9332", "\u672A\u6307\u5B9A"]);
function parseRuleNumber(value) {
  if (value === null || value === void 0 || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
function parseListValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (value === null || value === void 0) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}
function normalizeCommaText(value) {
  if (value === null || value === void 0) return "";
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join(", ");
  }
  return String(value).split(",").map((item) => item.trim()).filter(Boolean).join(", ");
}
function normalizeScreeningRulesPayload(payload) {
  const source = (payload == null ? void 0 : payload.rules) || (payload == null ? void 0 : payload.item) || (payload == null ? void 0 : payload.data) || payload || {};
  const minAge = parseRuleNumber(source.minAge ?? source.min_age);
  const maxAge = parseRuleNumber(source.maxAge ?? source.max_age);
  const nationalitiesRaw = source.targetNationalities ?? source.target_nationalities ?? source.allowedNationalities ?? source.allowed_nationalities ?? source.nationalities ?? "";
  const allowedJlptRaw = source.allowedJlptLevels ?? source.allowed_jlpt_levels ?? source.allowed_japanese_levels ?? [];
  return {
    minAge,
    maxAge,
    targetNationalities: normalizeCommaText(nationalitiesRaw),
    targetNationalitiesList: parseListValue(nationalitiesRaw),
    allowedJlptLevels: parseListValue(allowedJlptRaw)
  };
}
function isUnlimitedMinAge(value) {
  if (value === null || value === void 0 || value === "") return true;
  return Number(value) <= 0;
}
function isUnlimitedMaxAge(value) {
  if (value === null || value === void 0 || value === "") return true;
  return Number(value) >= 100;
}
function hasScreeningConstraints(rules) {
  if (!rules) return false;
  if (!isUnlimitedMinAge(rules.minAge) && rules.minAge !== null) return true;
  if (!isUnlimitedMaxAge(rules.maxAge) && rules.maxAge !== null) return true;
  if (Array.isArray(rules.targetNationalitiesList) && rules.targetNationalitiesList.length > 0) return true;
  if (Array.isArray(rules.allowedJlptLevels) && rules.allowedJlptLevels.length > 0) return true;
  return false;
}
function toHalfWidthDigits(text) {
  return String(text || "").replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 65248));
}
function parseAgeNumber(value) {
  if (value === null || value === void 0 || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 && value <= 130 ? value : null;
  }
  const normalized = toHalfWidthDigits(String(value).trim());
  if (!normalized) return null;
  const direct = Number(normalized);
  if (Number.isFinite(direct) && direct >= 0 && direct <= 130) return direct;
  const match = normalized.match(/(\d{1,3})\s*(?:歳|才)?/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 130 ? parsed : null;
}
function calculateAgeFromBirthday(value) {
  if (!value) return null;
  let birthDate = null;
  if (value instanceof Date) {
    birthDate = value;
  } else {
    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) {
      birthDate = direct;
    } else {
      const match = String(value).match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
      if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        const parsed = new Date(year, month, day);
        if (!Number.isNaN(parsed.getTime())) birthDate = parsed;
      }
    }
  }
  if (!birthDate) return null;
  const today = /* @__PURE__ */ new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || monthDiff === 0 && today.getDate() < birthDate.getDate()) {
    age -= 1;
  }
  return age >= 0 && age <= 130 ? age : null;
}
function resolveCandidateAgeValue(candidate) {
  if (!candidate) return null;
  const birthday = candidate.birthday ?? candidate.birth_date ?? candidate.birthDate ?? candidate.birthdate ?? null;
  const fromBirthday = calculateAgeFromBirthday(birthday);
  if (fromBirthday !== null) return fromBirthday;
  return parseAgeNumber(candidate.age ?? candidate.ageText ?? candidate.age_value ?? candidate.age_years ?? candidate.ageYears);
}
function normalizeNationality(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (PLACEHOLDER_VALUES.has(text)) return "";
  const normalized = text.toLowerCase();
  if (normalized === "japan" || normalized === "jpn" || normalized === "jp" || normalized === "japanese") {
    return "\u65E5\u672C";
  }
  if (["\u65E5\u672C\u56FD", "\u65E5\u672C\u56FD\u7C4D", "\u65E5\u672C\u4EBA", "\u65E5\u672C\u56FD\u6C11"].includes(text)) return "\u65E5\u672C";
  return text;
}
function isJapaneseNationality(value) {
  return normalizeNationality(value) === "\u65E5\u672C";
}
function resolveCandidateNationalityForScreening(candidate) {
  const normalized = normalizeNationality((candidate == null ? void 0 : candidate.nationality) ?? "");
  return normalized || "\u65E5\u672C";
}
function normalizeJlpt(value) {
  const text = String(value || "").trim();
  if (!text || PLACEHOLDER_VALUES.has(text)) return "";
  return text;
}
function computeValidApplication(candidate, rules) {
  if (!candidate || !rules) return null;
  if (!hasScreeningConstraints(rules)) return null;
  const age = resolveCandidateAgeValue(candidate);
  const requiresMinAge = !isUnlimitedMinAge(rules.minAge) && rules.minAge !== null;
  const requiresMaxAge = !isUnlimitedMaxAge(rules.maxAge) && rules.maxAge !== null;
  if (requiresMinAge || requiresMaxAge) {
    if (age === null) return false;
    if (requiresMinAge && age < rules.minAge) return false;
    if (requiresMaxAge && age > rules.maxAge) return false;
  }
  const candidateNationality = resolveCandidateNationalityForScreening(candidate);
  const allowedNationalities = parseListValue(rules.targetNationalitiesList).map((value) => normalizeNationality(value)).filter(Boolean);
  if (allowedNationalities.length > 0 && !allowedNationalities.includes(candidateNationality)) {
    return false;
  }
  if (isJapaneseNationality(candidateNationality)) return true;
  const allowedJlptLevels = parseListValue(rules.allowedJlptLevels);
  if (!allowedJlptLevels.length) return true;
  const jlpt = normalizeJlpt(candidate.japaneseLevel ?? candidate.japanese_level);
  if (!jlpt) return false;
  return allowedJlptLevels.includes(jlpt);
}
function resolveValidApplicationRaw(candidate) {
  const explicitRaw = (candidate == null ? void 0 : candidate.valid_application) ?? (candidate == null ? void 0 : candidate.is_effective_application) ?? (candidate == null ? void 0 : candidate.isEffective) ?? (candidate == null ? void 0 : candidate.is_effective) ?? (candidate == null ? void 0 : candidate.isValidApplication) ?? (candidate == null ? void 0 : candidate.active_flag) ?? (candidate == null ? void 0 : candidate.valid);
  let raw = explicitRaw;
  if (raw === null || raw === void 0 || raw === "") {
    if ((candidate == null ? void 0 : candidate.validApplication) === true) raw = true;
    else if ((candidate == null ? void 0 : candidate.validApplication) === false) raw = false;
    else if ((candidate == null ? void 0 : candidate.validApplicationComputed) === true || (candidate == null ? void 0 : candidate.validApplicationComputed) === false) {
      raw = candidate.validApplicationComputed;
    } else if ((candidate == null ? void 0 : candidate.valid_application_computed) === true || (candidate == null ? void 0 : candidate.valid_application_computed) === false) {
      raw = candidate.valid_application_computed;
    }
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (["true", "1", "yes", "\u6709\u52B9", "\u6709\u52B9\u5FDC\u52DF"].includes(normalized)) return true;
    if (["false", "0", "no", "\u7121\u52B9", "\u7121\u52B9\u5FDC\u52DF"].includes(normalized)) return false;
  }
  if (raw === null || raw === void 0 || raw === "") return null;
  return Boolean(raw);
}

// pages/teleapo/teleapo.js
console.log("teleapo.js loaded");
window.switchTeleapoTab = function(targetPanel, clickedTab) {
  const performancePanel = document.getElementById("teleapoPerformancePanel");
  const managementPanel = document.getElementById("teleapoManagementPanel");
  const tabs = document.querySelectorAll(".teleapo-tab");
  tabs.forEach((t) => t.classList.remove("active"));
  clickedTab.classList.add("active");
  if (targetPanel === "performance") {
    performancePanel.style.display = "block";
    performancePanel.classList.add("active");
    managementPanel.style.display = "none";
    managementPanel.classList.remove("active");
  } else if (targetPanel === "management") {
    performancePanel.style.display = "none";
    performancePanel.classList.remove("active");
    managementPanel.style.display = "block";
    managementPanel.classList.add("active");
  }
};
function bindTeleapoTabs() {
  const tabs = document.querySelectorAll(".teleapo-tab");
  if (!tabs.length) return;
  tabs.forEach((tab) => {
    if (tab.dataset.bound) return;
    tab.addEventListener("click", () => {
      var _a;
      const target = tab.dataset.tab || "performance";
      (_a = window.switchTeleapoTab) == null ? void 0 : _a.call(window, target, tab);
    });
    tab.dataset.bound = "true";
  });
}
function bindTeleapoCollapsibles() {
  const headers = document.querySelectorAll(".teleapo-collapsible-header");
  if (!headers.length) return;
  headers.forEach((header) => {
    if (header.id === "teleapoCsTaskToggle" || header.id === "teleapoMissingInfoToggle") {
      return;
    }
    if (header.dataset.bound) return;
    const parent = header.closest(".teleapo-collapsible");
    const content = parent == null ? void 0 : parent.querySelector(".teleapo-collapsible-content");
    if (content) {
      const isOpen = parent == null ? void 0 : parent.classList.contains("open");
      content.style.display = isOpen ? "block" : "none";
    }
    header.addEventListener("click", () => {
      var _a;
      (_a = window.toggleTeleapoCollapsible) == null ? void 0 : _a.call(window, header);
    });
    const btn = header.querySelector(".teleapo-collapsible-btn");
    if (btn && !btn.dataset.bound) {
      btn.addEventListener("click", (event) => {
        var _a;
        event.stopPropagation();
        (_a = window.toggleTeleapoCollapsible) == null ? void 0 : _a.call(window, header);
      });
      btn.dataset.bound = "true";
    }
    header.dataset.bound = "true";
  });
}
window.toggleTeleapoCollapsible = function(header) {
  const parent = header.closest(".teleapo-collapsible");
  if (!parent) return;
  const content = parent.querySelector(".teleapo-collapsible-content");
  const willOpen = !parent.classList.contains("open");
  parent.classList.toggle("open", willOpen);
  if (content) {
    content.style.display = willOpen ? "block" : "none";
  }
  const btn = parent.querySelector(".teleapo-collapsible-btn");
  if (btn) {
    if (willOpen) {
      btn.textContent = "\u9589\u3058\u308B";
    } else {
      btn.textContent = "\u4E00\u89A7\u3092\u958B\u304F";
    }
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bindTeleapoTabs();
    bindTeleapoCollapsibles();
  });
} else {
  bindTeleapoTabs();
  bindTeleapoCollapsibles();
}
var ROUTE_TEL = "tel";
var ROUTE_OTHER = "other";
var TELEAPO_RATE_MODE_CONTACT = "contact";
var TELEAPO_RATE_MODE_STEP = "step";
var TELEAPO_API_URL = `${PRIMARY_API_BASE}/teleapo/logs`;
var TELEAPO_HEATMAP_DAYS = ["\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1"];
var TELEAPO_HEATMAP_SLOTS = ["09-11", "11-13", "13-15", "15-17", "17-19"];
var SETTINGS_API_BASE = PRIMARY_API_BASE;
var SCREENING_RULES_ENDPOINT = `${SETTINGS_API_BASE}/settings-screening-rules`;
var SCREENING_RULES_FALLBACK_ENDPOINT = `${SETTINGS_API_BASE}/settings/screening-rules`;
var CANDIDATES_API_URL = `${PRIMARY_API_BASE}/candidates`;
var MEMBERS_API_URL = `${PRIMARY_API_BASE}/members`;
var KPI_YIELD_API_URL = `${PRIMARY_API_BASE}/kpi/yield`;
var MYPAGE_API_URL = `${PRIMARY_API_BASE}/mypage`;
var ADVISOR_ACTION_FETCH_LIMIT = 50;
var ADVISOR_ACTION_PREVIEW_LIMIT = 3;
var ADVISOR_SCHEDULE_REFRESH_TTL_MS = 15e3;
var ADVISOR_PLANNED_METRICS = [
  { key: "newInterviews", label: "\u65B0\u898F\u9762\u8AC7" },
  { key: "proposals", label: "\u63D0\u6848" },
  { key: "recommendations", label: "\u63A8\u85A6" },
  { key: "interviewsScheduled", label: "\u9762\u63A5\u8A2D\u5B9A" },
  { key: "interviewsHeld", label: "\u9762\u63A5\u5B9F\u65BD" },
  { key: "offers", label: "\u5185\u5B9A" },
  { key: "accepts", label: "\u627F\u8AFE" }
];
var candidateNameMap = /* @__PURE__ */ new Map();
var candidateIdMap = /* @__PURE__ */ new Map();
var candidateAttendanceMap = /* @__PURE__ */ new Map();
var candidateAttendanceByName = /* @__PURE__ */ new Map();
var candidateNameList = [];
var dialFormAdvisorOptions = [];
var dialFormAdvisorMembers = [];
var dialFormAdvisorMembersPromise = null;
var dialFormAdvisorPlannedById = /* @__PURE__ */ new Map();
var dialFormAdvisorPlannedPromise = null;
var dialFormAdvisorPlannedLoading = false;
var dialFormAdvisorPlannedError = "";
var dialFormAdvisorUpcomingById = /* @__PURE__ */ new Map();
var dialFormAdvisorUpcomingPromise = null;
var dialFormAdvisorUpcomingCacheKey = "";
var dialFormAdvisorUpcomingLoading = false;
var dialFormAdvisorUpcomingError = "";
var dialFormAdvisorPlannedFetchedAt = 0;
var dialFormAdvisorUpcomingFetchedAt = 0;
var teleapoCsTaskCandidates = [];
var teleapoCandidateMaster = [];
var teleapoCandidateAbort = null;
var candidatePhoneCache = /* @__PURE__ */ new Map();
var candidatePhoneToId = /* @__PURE__ */ new Map();
var candidateEmailToId = /* @__PURE__ */ new Map();
var candidateDetailCache = /* @__PURE__ */ new Map();
var candidateDetailRequests = /* @__PURE__ */ new Map();
var screeningRules = null;
var screeningRulesLoaded = false;
var screeningRulesLoading = false;
var screeningRulesLoadPromise = null;
var validApplicationDetailCache = /* @__PURE__ */ new Map();
var validApplicationQueue = [];
var validApplicationQueueSet = /* @__PURE__ */ new Set();
var validApplicationQueueActive = false;
var missingInfoQueue = [];
var missingInfoQueueSet = /* @__PURE__ */ new Set();
var missingInfoQueueActive = false;
var MISSING_INFO_FETCH_BATCH = 20;
var MISSING_INFO_FETCH_DELAY_MS = 200;
var MISSING_INFO_RENDER_LIMIT = 200;
var missingInfoExpanded = false;
var contactTimeQueue = [];
var contactTimeQueueSet = /* @__PURE__ */ new Set();
var contactTimeQueueActive = false;
var CONTACT_TIME_FETCH_BATCH = 10;
var CONTACT_TIME_FETCH_DELAY_MS = 200;
var VALID_APPLICATION_FETCH_BATCH = 10;
var VALID_APPLICATION_FETCH_DELAY_MS = 200;
var candidateDetailRefreshTimer = null;
var validApplicationRefreshTimer = null;
var teleapoSummaryByCandidateId = /* @__PURE__ */ new Map();
var teleapoSummaryByName = /* @__PURE__ */ new Map();
var csTaskExpanded = false;
var logExpanded = true;
var attendanceQueue = [];
var attendanceQueueSet = /* @__PURE__ */ new Set();
var attendanceQueueActive = false;
var teleapoRateMode = TELEAPO_RATE_MODE_CONTACT;
var teleapoQuickEditState = { candidateId: null, detail: null, editMode: false, saving: false };
var teleapoRateTargets = {};
var ATTENDANCE_FETCH_BATCH = 10;
var ATTENDANCE_FETCH_DELAY_MS = 200;
var CONTACT_TIME_PLACEHOLDERS = /* @__PURE__ */ new Set([
  "-",
  "\u30FC",
  "\u672A\u8A2D\u5B9A",
  "\u672A\u5165\u529B",
  "\u672A\u767B\u9332",
  "\u672A\u6307\u5B9A"
]);
function normalizeContactPreferredTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (CONTACT_TIME_PLACEHOLDERS.has(text)) return "";
  return text;
}
function normalizeAttendanceValue(value) {
  if (value === true || value === false) return value;
  if (value === null || value === void 0 || value === "") return null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "\u6E08", "\u78BA\u8A8D\u6E08"].includes(normalized)) return true;
    if (["false", "0", "no", "\u672A", "\u672A\u78BA\u8A8D"].includes(normalized)) return false;
  }
  return Boolean(value);
}
function registerCandidateAttendance(candidateId, candidateName, attendanceRaw) {
  const attendance = normalizeAttendanceValue(attendanceRaw);
  if (attendance === null) return;
  const idNum = Number(candidateId);
  if (Number.isFinite(idNum) && idNum > 0) {
    candidateAttendanceMap.set(idNum, attendance);
  }
  const nameKey = normalizeNameKey(candidateName);
  if (nameKey) {
    candidateAttendanceByName.set(nameKey, attendance);
  }
}
function scheduleCandidateDetailRefresh() {
  if (candidateDetailRefreshTimer) return;
  candidateDetailRefreshTimer = window.setTimeout(() => {
    candidateDetailRefreshTimer = null;
    renderLogTable();
    renderCsTaskTable(teleapoCsTaskCandidates);
  }, 200);
}
function scheduleValidApplicationRefresh() {
  if (validApplicationRefreshTimer) return;
  validApplicationRefreshTimer = window.setTimeout(() => {
    validApplicationRefreshTimer = null;
    rebuildCsTaskCandidates();
  }, 200);
}
function enqueueAttendanceFetch(candidateId) {
  const idNum = Number(candidateId);
  if (!Number.isFinite(idNum) || idNum <= 0) return;
  if (candidateAttendanceMap.has(idNum)) return;
  if (candidateDetailRequests.has(idNum)) return;
  const cached = candidateDetailCache.get(idNum);
  if (cached && typeof cached.attendanceConfirmed === "boolean") return;
  if (attendanceQueueSet.has(idNum)) return;
  attendanceQueueSet.add(idNum);
  attendanceQueue.push(idNum);
  if (!attendanceQueueActive) processAttendanceQueue();
}
function processAttendanceQueue() {
  if (!attendanceQueue.length) {
    attendanceQueueActive = false;
    return;
  }
  attendanceQueueActive = true;
  const batch = attendanceQueue.splice(0, ATTENDANCE_FETCH_BATCH);
  batch.forEach((idNum) => attendanceQueueSet.delete(idNum));
  Promise.all(batch.map((idNum) => fetchCandidateDetailInfo(idNum))).catch(() => {
  }).finally(() => {
    setTimeout(processAttendanceQueue, ATTENDANCE_FETCH_DELAY_MS);
  });
}
function scheduleAttendanceFetchFromLogs(logs) {
  if (!Array.isArray(logs) || !logs.length) return;
  logs.forEach((log) => {
    const code = normalizeResultCode(log.resultCode || log.result);
    if (code !== "set") return;
    let idNum = Number(log.candidateId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      const resolved = findCandidateIdFromTarget(log.target);
      idNum = Number(resolved);
    }
    if (!Number.isFinite(idNum) || idNum <= 0) return;
    enqueueAttendanceFetch(idNum);
  });
}
function enqueueContactTimeFetch(candidateId) {
  const idNum = Number(candidateId);
  if (!Number.isFinite(idNum) || idNum <= 0) return;
  if (contactTimeQueueSet.has(idNum)) return;
  if (candidateDetailRequests.has(idNum)) return;
  const cached = candidateDetailCache.get(idNum);
  if (cached) {
    const cachedTime = normalizeContactPreferredTime(
      cached.contactPreferredTime ?? cached.contact_preferred_time ?? cached.contactTime ?? cached.contact_time
    );
    if (cachedTime) return;
    if (cached.contactPreferredTimeFetched) return;
  }
  contactTimeQueueSet.add(idNum);
  contactTimeQueue.push(idNum);
  if (!contactTimeQueueActive) processContactTimeQueue();
}
function processContactTimeQueue() {
  if (!contactTimeQueue.length) {
    contactTimeQueueActive = false;
    return;
  }
  contactTimeQueueActive = true;
  const batch = contactTimeQueue.splice(0, CONTACT_TIME_FETCH_BATCH);
  batch.forEach((idNum) => contactTimeQueueSet.delete(idNum));
  Promise.all(batch.map((idNum) => fetchCandidateDetailInfo(idNum))).finally(() => {
    scheduleCandidateDetailRefresh();
    setTimeout(processContactTimeQueue, CONTACT_TIME_FETCH_DELAY_MS);
  });
}
function prefetchContactTimeForLogs(logs) {
  if (!Array.isArray(logs) || !logs.length) return;
  logs.forEach((log) => {
    const resolvedId = resolveCandidateIdFromLog(log);
    if (resolvedId) enqueueContactTimeFetch(resolvedId);
  });
}
function enqueueValidApplicationFetch(candidateId) {
  if (!screeningRules) return;
  const idNum = Number(candidateId);
  if (!Number.isFinite(idNum) || idNum <= 0) return;
  if (validApplicationDetailCache.has(idNum)) return;
  if (validApplicationQueueSet.has(idNum)) return;
  if (candidateDetailRequests.has(idNum)) return;
  validApplicationQueueSet.add(idNum);
  validApplicationQueue.push(idNum);
  if (!validApplicationQueueActive) processValidApplicationQueue();
}
function processValidApplicationQueue() {
  if (!validApplicationQueue.length) {
    validApplicationQueueActive = false;
    return;
  }
  validApplicationQueueActive = true;
  const batch = validApplicationQueue.splice(0, VALID_APPLICATION_FETCH_BATCH);
  batch.forEach((idNum) => validApplicationQueueSet.delete(idNum));
  Promise.all(batch.map((idNum) => fetchCandidateDetailInfo(idNum))).finally(() => {
    setTimeout(processValidApplicationQueue, VALID_APPLICATION_FETCH_DELAY_MS);
  });
}
function prefetchValidApplicationForCandidates(list) {
  if (!screeningRules || !Array.isArray(list) || !list.length) return;
  list.forEach((candidate) => {
    const candidateId = (candidate == null ? void 0 : candidate.candidateId) ?? (candidate == null ? void 0 : candidate.candidate_id) ?? (candidate == null ? void 0 : candidate.id) ?? (candidate == null ? void 0 : candidate.candidateID) ?? null;
    enqueueValidApplicationFetch(candidateId);
  });
}
function prefetchContactTimeForTasks(list) {
  if (!Array.isArray(list) || !list.length) return;
  list.forEach((row) => {
    if (row == null ? void 0 : row.candidateId) enqueueContactTimeFetch(row.candidateId);
  });
}
function resolveAttendanceConfirmed(log) {
  const idNum = Number((log == null ? void 0 : log.candidateId) ?? (log == null ? void 0 : log.candidate_id));
  if (Number.isFinite(idNum) && idNum > 0 && candidateAttendanceMap.has(idNum)) {
    return candidateAttendanceMap.get(idNum) === true;
  }
  if (Number.isFinite(idNum) && idNum > 0) {
    const cached = candidateDetailCache.get(idNum);
    if (cached && typeof cached.attendanceConfirmed === "boolean") {
      return cached.attendanceConfirmed;
    }
  }
  const nameKey = normalizeNameKey((log == null ? void 0 : log.target) || "");
  if (nameKey && candidateAttendanceByName.has(nameKey)) {
    return candidateAttendanceByName.get(nameKey) === true;
  }
  return false;
}
function resolveCandidateInterviewDate(log) {
  let idNum = Number((log == null ? void 0 : log.candidateId) ?? (log == null ? void 0 : log.candidate_id));
  if (!Number.isFinite(idNum) || idNum <= 0) {
    const resolved = findCandidateIdFromTarget((log == null ? void 0 : log.target) || "");
    idNum = Number(resolved);
  }
  if (Number.isFinite(idNum) && idNum > 0) {
    const cached = candidateDetailCache.get(idNum);
    if (cached == null ? void 0 : cached.firstInterviewDate) return cached.firstInterviewDate;
  }
  return null;
}
function navigateToCandidateDetailPage(candidateId, candidateName) {
  const resolvedId = candidateId || findCandidateIdFromTarget(candidateName);
  if (!resolvedId) {
    console.warn("candidate not found:", candidateName);
    return;
  }
  const resolvedIdText = String(resolvedId);
  window.location.hash = `/candidate-detail?id=${encodeURIComponent(resolvedIdText)}`;
}
window.navigateToCandidateDetail = function(candidateId, candidateName) {
  openCandidateQuickView(candidateId, candidateName);
};
function escapeHtml(str) {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function normalizeNameKey(name) {
  return String(name ?? "").replace(/[\s\u3000]/g, "").toLowerCase();
}
function normalizePhoneKey(value) {
  return String(value ?? "").replace(/[^\d]/g, "");
}
function normalizeEmailKey(value) {
  return String(value ?? "").trim().toLowerCase();
}
function toPositiveInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.trunc(num);
}
function toNonNegativeInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.trunc(num);
}
function todayIsoDate() {
  const now = /* @__PURE__ */ new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}
function currentMonthKey() {
  return todayIsoDate().slice(0, 7);
}
function toIsoDateKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    const direct = trimmed.split("T")[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
    const parsedFromString = new Date(trimmed);
    if (!Number.isNaN(parsedFromString.getTime())) {
      const yyyy2 = parsedFromString.getFullYear();
      const mm2 = String(parsedFromString.getMonth() + 1).padStart(2, "0");
      const dd2 = String(parsedFromString.getDate()).padStart(2, "0");
      return `${yyyy2}-${mm2}-${dd2}`;
    }
    return direct;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function buildApiHeaders() {
  var _a;
  const headers = { Accept: "application/json" };
  const token = (_a = getSession()) == null ? void 0 : _a.token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
function normalizeMemberItems(payload) {
  const raw = Array.isArray(payload) ? payload : (payload == null ? void 0 : payload.items) || (payload == null ? void 0 : payload.members) || (payload == null ? void 0 : payload.users) || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((member) => ({
    id: toPositiveInt((member == null ? void 0 : member.id) ?? (member == null ? void 0 : member.user_id) ?? (member == null ? void 0 : member.userId)),
    name: String((member == null ? void 0 : member.name) || (member == null ? void 0 : member.fullName) || (member == null ? void 0 : member.displayName) || "").trim(),
    role: String((member == null ? void 0 : member.role) || "").trim()
  })).filter((member) => member.id);
}
function isAdvisorMemberRole(roleValue) {
  const role = String(roleValue || "").toLowerCase();
  if (!role) return false;
  return role.includes("advisor") || role.includes("sales") || role.includes("\u30A2\u30C9\u30D0\u30A4\u30B6\u30FC") || role.includes("\u55B6\u696D");
}
function normalizeAdvisorPlannedKpi(raw = {}) {
  return {
    newInterviews: toNonNegativeInt((raw == null ? void 0 : raw.newInterviews) ?? (raw == null ? void 0 : raw.new_interviews)),
    proposals: toNonNegativeInt(raw == null ? void 0 : raw.proposals),
    recommendations: toNonNegativeInt(raw == null ? void 0 : raw.recommendations),
    interviewsScheduled: toNonNegativeInt((raw == null ? void 0 : raw.interviewsScheduled) ?? (raw == null ? void 0 : raw.interviews_scheduled)),
    interviewsHeld: toNonNegativeInt((raw == null ? void 0 : raw.interviewsHeld) ?? (raw == null ? void 0 : raw.interviews_held)),
    offers: toNonNegativeInt(raw == null ? void 0 : raw.offers),
    accepts: toNonNegativeInt((raw == null ? void 0 : raw.accepts) ?? (raw == null ? void 0 : raw.hires))
  };
}
function getAdvisorPlannedKpi(advisorUserId) {
  const id = String(toPositiveInt(advisorUserId) || "");
  if (!id) return null;
  return dialFormAdvisorPlannedById.get(id) || null;
}
function getAdvisorUpcomingActions(advisorUserId) {
  const id = String(toPositiveInt(advisorUserId) || "");
  if (!id) return null;
  return dialFormAdvisorUpcomingById.get(id) || null;
}
function normalizeAdvisorActionRows(rawTasks) {
  const rows = [];
  (rawTasks || []).forEach((item) => {
    if (Array.isArray(item == null ? void 0 : item.tasks)) {
      item.tasks.forEach((task) => {
        rows.push({
          ...item,
          nextAction: task
        });
      });
      return;
    }
    if (item == null ? void 0 : item.nextAction) {
      rows.push(item);
      return;
    }
    if ((item == null ? void 0 : item.actionDate) || (item == null ? void 0 : item.actionName) || (item == null ? void 0 : item.date) || (item == null ? void 0 : item.type)) {
      rows.push({
        ...item,
        nextAction: {
          date: item.actionDate ?? item.date ?? null,
          type: item.actionName ?? item.type ?? item.label ?? item.actionNote ?? item.action_note ?? ""
        }
      });
    }
  });
  return rows.map((row) => {
    var _a, _b, _c, _d;
    const normalizedDate = toIsoDateKey((_a = row == null ? void 0 : row.nextAction) == null ? void 0 : _a.date);
    const actionTypeRaw = ((_b = row == null ? void 0 : row.nextAction) == null ? void 0 : _b.type) ?? ((_c = row == null ? void 0 : row.nextAction) == null ? void 0 : _c.label) ?? "";
    const actionType = String(actionTypeRaw || "").trim() || "\u6B21\u56DE\u30A2\u30AF\u30B7\u30E7\u30F3";
    return {
      candidateId: (row == null ? void 0 : row.candidateId) ?? (row == null ? void 0 : row.candidate_id) ?? "",
      candidateName: String((row == null ? void 0 : row.candidateName) ?? (row == null ? void 0 : row.candidate_name) ?? "").trim(),
      phase: String((row == null ? void 0 : row.phase) ?? "").trim(),
      partnerName: String((row == null ? void 0 : row.partnerName) ?? (row == null ? void 0 : row.partner_name) ?? "").trim(),
      nextAction: {
        date: normalizedDate || ((_d = row == null ? void 0 : row.nextAction) == null ? void 0 : _d.date) || null,
        type: actionType
      }
    };
  });
}
function sortAdvisorActionRows(rows) {
  const todayKey = todayIsoDate();
  return [...rows].sort((a, b) => {
    var _a, _b;
    const aDateKey = toIsoDateKey((_a = a == null ? void 0 : a.nextAction) == null ? void 0 : _a.date) || "";
    const bDateKey = toIsoDateKey((_b = b == null ? void 0 : b.nextAction) == null ? void 0 : _b.date) || "";
    const aIsFuture = aDateKey && aDateKey >= todayKey;
    const bIsFuture = bDateKey && bDateKey >= todayKey;
    if (aIsFuture !== bIsFuture) return aIsFuture ? -1 : 1;
    if (aDateKey && bDateKey && aDateKey !== bDateKey) {
      return aIsFuture ? aDateKey < bDateKey ? -1 : 1 : aDateKey > bDateKey ? -1 : 1;
    }
    return String((a == null ? void 0 : a.candidateName) || "").localeCompare(String((b == null ? void 0 : b.candidateName) || ""), "ja");
  });
}
function resolveAdvisorIdsForUpcomingFetch(advisorIds = null) {
  const source = Array.isArray(advisorIds) && advisorIds.length ? advisorIds : dialFormAdvisorOptions.map((item) => item == null ? void 0 : item.id);
  const uniq = /* @__PURE__ */ new Set();
  source.forEach((id) => {
    const parsed = toPositiveInt(id);
    if (parsed) uniq.add(parsed);
  });
  return Array.from(uniq).sort((a, b) => a - b);
}
function isAdvisorScheduleStale(fetchedAt) {
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return true;
  return Date.now() - fetchedAt > ADVISOR_SCHEDULE_REFRESH_TTL_MS;
}
async function refreshDialFormAdvisorSchedules({ force = false } = {}) {
  await loadDialFormAdvisorMembers();
  const advisorIds = resolveAdvisorIdsForUpcomingFetch();
  const idsKey = advisorIds.join(",");
  const shouldRefreshPlanned = force || isAdvisorScheduleStale(dialFormAdvisorPlannedFetchedAt);
  const shouldRefreshUpcoming = force || isAdvisorScheduleStale(dialFormAdvisorUpcomingFetchedAt) || idsKey && idsKey !== dialFormAdvisorUpcomingCacheKey;
  await Promise.all([
    loadDialFormAdvisorPlannedKpis({ force: shouldRefreshPlanned }),
    loadDialFormAdvisorUpcomingActions({ force: shouldRefreshUpcoming, advisorIds })
  ]);
}
async function fetchAdvisorUpcomingActions(advisorId) {
  const url = new URL(MYPAGE_API_URL);
  url.searchParams.set("userId", String(advisorId));
  url.searchParams.set("role", "advisor");
  url.searchParams.set("limit", String(ADVISOR_ACTION_FETCH_LIMIT));
  url.searchParams.set("month", currentMonthKey());
  const res = await fetch(url.toString(), { headers: buildApiHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`mypage HTTP ${res.status}`);
  const json = await res.json().catch(() => ({}));
  const sourceRows = Array.isArray(json == null ? void 0 : json.tasksUpcoming) ? json.tasksUpcoming : Array.isArray(json == null ? void 0 : json.tasks) ? json.tasks : [];
  return sortAdvisorActionRows(normalizeAdvisorActionRows(sourceRows));
}
function renderAdvisorKpiChips(kpi) {
  const normalized = normalizeAdvisorPlannedKpi(kpi || {});
  return ADVISOR_PLANNED_METRICS.map((metric) => `<span class="teleapo-advisor-kpi-chip">${escapeHtml(metric.label)} ${normalized[metric.key]}</span>`).join("");
}
function renderAdvisorActionPreviewRows(actions, { error = "" } = {}) {
  if (error) {
    return `<li class="teleapo-advisor-action-empty">${escapeHtml(error)}</li>`;
  }
  const preview = (actions || []).slice(0, ADVISOR_ACTION_PREVIEW_LIMIT);
  if (!preview.length) {
    return `<li class="teleapo-advisor-action-empty">\u4E88\u5B9A\u30A2\u30AF\u30B7\u30E7\u30F3\u306F\u3042\u308A\u307E\u305B\u3093</li>`;
  }
  return preview.map((row) => {
    var _a, _b;
    const dateText = ((_a = row == null ? void 0 : row.nextAction) == null ? void 0 : _a.date) ? formatCandidateDate(row.nextAction.date) : "-";
    const actionType = ((_b = row == null ? void 0 : row.nextAction) == null ? void 0 : _b.type) || "\u6B21\u56DE\u30A2\u30AF\u30B7\u30E7\u30F3";
    const candidateName = (row == null ? void 0 : row.candidateName) || "\u5019\u88DC\u8005\u672A\u8A2D\u5B9A";
    return `
      <li class="teleapo-advisor-action-row">
        <span class="teleapo-advisor-action-date">${escapeHtml(dateText)}</span>
        <span class="teleapo-advisor-action-text">${escapeHtml(`${actionType} / ${candidateName}`)}</span>
      </li>
    `;
  }).join("");
}
function renderAdvisorScheduleCard({ id, name, selectedId }) {
  const planned = getAdvisorPlannedKpi(id) || normalizeAdvisorPlannedKpi({});
  const upcoming = getAdvisorUpcomingActions(id);
  const rows = Array.isArray(upcoming == null ? void 0 : upcoming.rows) ? upcoming.rows : [];
  const upcomingError = (upcoming == null ? void 0 : upcoming.error) || (!upcoming && dialFormAdvisorUpcomingLoading ? "\u4E88\u5B9A\u30A2\u30AF\u30B7\u30E7\u30F3\u8AAD\u8FBC\u4E2D..." : "");
  const todayKey = todayIsoDate();
  const upcomingCount = rows.filter((row) => {
    var _a;
    const dateKey = toIsoDateKey((_a = row == null ? void 0 : row.nextAction) == null ? void 0 : _a.date);
    return Boolean(dateKey && dateKey >= todayKey);
  }).length;
  const isSelected = String(id) === String(selectedId || "");
  const selectionBadge = isSelected ? `<span class="teleapo-advisor-card-badge">\u9078\u629E\u4E2D</span>` : "";
  return `
    <button type="button" class="teleapo-advisor-card${isSelected ? " is-selected" : ""}" data-advisor-id="${escapeHtml(String(id))}" aria-pressed="${isSelected ? "true" : "false"}">
      <div class="teleapo-advisor-card-head">
        <div class="teleapo-advisor-card-name">${escapeHtml(name || `ID:${id}`)}</div>
        ${selectionBadge}
      </div>
      <div class="teleapo-advisor-kpi-chips">${renderAdvisorKpiChips(planned)}</div>
      <div class="teleapo-advisor-actions-summary">
        <span>\u4E88\u5B9A\u30A2\u30AF\u30B7\u30E7\u30F3</span>
        <span>${rows.length}\u4EF6 (\u672A\u6765 ${upcomingCount}\u4EF6)</span>
      </div>
      <ul class="teleapo-advisor-actions-list">
        ${renderAdvisorActionPreviewRows(rows, { error: upcomingError })}
      </ul>
    </button>
  `;
}
function getAdvisorPlannedFormContexts() {
  return [
    {
      key: "dial",
      resultElementId: "dialFormResult",
      advisorSelectElementId: "dialFormAdvisorUserId",
      panelElementId: "dialFormAdvisorPlannedPanel",
      infoElementId: "dialFormAdvisorPlannedInfo",
      cardsElementId: "dialFormAdvisorPlannedCards"
    },
    {
      key: "sms",
      resultElementId: "smsFormResult",
      advisorSelectElementId: "smsFormAdvisorUserId",
      panelElementId: "smsFormAdvisorPlannedPanel",
      infoElementId: "smsFormAdvisorPlannedInfo",
      cardsElementId: "smsFormAdvisorPlannedCards"
    }
  ];
}
function renderAdvisorPlannedDisplayForForm(context, { loading = false, error = "" } = {}) {
  var _a, _b;
  const panel = document.getElementById(context.panelElementId);
  const info = document.getElementById(context.infoElementId);
  const cards = document.getElementById(context.cardsElementId);
  if (!panel || !info || !cards) return;
  const resultValue = (_a = document.getElementById(context.resultElementId)) == null ? void 0 : _a.value;
  const needsInterview = shouldRequireInterview(resultValue);
  panel.classList.toggle("hidden", !needsInterview);
  if (!needsInterview) return;
  const hasOptions = Array.isArray(dialFormAdvisorOptions) && dialFormAdvisorOptions.length > 0;
  if (!hasOptions) {
    info.textContent = "\u62C5\u5F53\u30A2\u30C9\u30D0\u30A4\u30B6\u30FC\u5019\u88DC\u304C\u3042\u308A\u307E\u305B\u3093\u3002";
    cards.innerHTML = "";
    return;
  }
  const selectedId = toPositiveInt((_b = document.getElementById(context.advisorSelectElementId)) == null ? void 0 : _b.value);
  const selected = dialFormAdvisorOptions.find((item) => String(item.id) === String(selectedId || ""));
  const hasLoading = loading || dialFormAdvisorPlannedLoading || dialFormAdvisorUpcomingLoading;
  const errors = [error, dialFormAdvisorPlannedError, dialFormAdvisorUpcomingError].map((value) => String(value || "").trim()).filter((value) => value);
  if (hasLoading && !dialFormAdvisorPlannedById.size && !dialFormAdvisorUpcomingById.size) {
    info.textContent = "\u5168\u30A2\u30C9\u30D0\u30A4\u30B6\u30FC\u306E\u4E88\u5B9A\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u3067\u3059...";
    cards.innerHTML = `
      <div class="teleapo-advisor-card is-loading"><div class="teleapo-advisor-action-empty">\u8AAD\u307F\u8FBC\u307F\u4E2D...</div></div>
      <div class="teleapo-advisor-card is-loading"><div class="teleapo-advisor-action-empty">\u8AAD\u307F\u8FBC\u307F\u4E2D...</div></div>
    `;
    return;
  }
  const infoParts = [];
  if (selected) {
    infoParts.push(`\u9078\u629E\u4E2D: ${selected.name}`);
  } else {
    infoParts.push("\u4E00\u89A7\u304B\u3089\u62C5\u5F53\u30A2\u30C9\u30D0\u30A4\u30B6\u30FC\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  }
  if (errors.length) {
    infoParts.push(errors.join(" / "));
  }
  info.textContent = infoParts.join("  ");
  const sortedCards = [...dialFormAdvisorOptions].sort((a, b) => {
    const aSelected = String(a.id) === String(selectedId || "");
    const bSelected = String(b.id) === String(selectedId || "");
    if (aSelected !== bSelected) return aSelected ? -1 : 1;
    return String(a.name || "").localeCompare(String(b.name || ""), "ja");
  });
  cards.innerHTML = sortedCards.map((item) => renderAdvisorScheduleCard({ id: item.id, name: item.name, selectedId })).join("");
}
function setDialFormAdvisorSelection(advisorUserId) {
  const select = document.getElementById("dialFormAdvisorUserId");
  if (!select) return;
  const id = String(toPositiveInt(advisorUserId) || "");
  if (!id) return;
  const exists = Array.from(select.options).some((option) => option.value === id);
  if (!exists) return;
  select.value = id;
  updateAdvisorPlannedDisplay();
}
function setSmsFormAdvisorSelection(advisorUserId) {
  const select = document.getElementById("smsFormAdvisorUserId");
  if (!select) return;
  const id = String(toPositiveInt(advisorUserId) || "");
  if (!id) return;
  const exists = Array.from(select.options).some((option) => option.value === id);
  if (!exists) return;
  select.value = id;
  updateAdvisorPlannedDisplay();
}
function updateAdvisorPlannedDisplay({ loading = false, error = "" } = {}) {
  const contexts = getAdvisorPlannedFormContexts();
  contexts.forEach((context) => {
    renderAdvisorPlannedDisplayForForm(context, { loading, error });
  });
}
async function loadDialFormAdvisorMembers({ force = false } = {}) {
  if (!force && dialFormAdvisorMembers.length) return dialFormAdvisorMembers;
  if (dialFormAdvisorMembersPromise) return dialFormAdvisorMembersPromise;
  updateAdvisorPlannedDisplay({ loading: true });
  dialFormAdvisorMembersPromise = (async () => {
    try {
      const res = await fetch(MEMBERS_API_URL, { headers: buildApiHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error(`members HTTP ${res.status}`);
      const json = await res.json().catch(() => ({}));
      const normalizedMembers = normalizeMemberItems(json);
      let members = normalizedMembers.filter((member) => isAdvisorMemberRole(member.role));
      if (!members.length && normalizedMembers.length) {
        members = normalizedMembers;
      }
      dialFormAdvisorMembers = members.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    } catch (error) {
      console.warn("[teleapo] failed to load advisor members:", error);
      dialFormAdvisorMembers = [];
    } finally {
      dialFormAdvisorMembersPromise = null;
    }
    refreshDialFormAdvisorSelect();
    void loadDialFormAdvisorUpcomingActions({
      advisorIds: dialFormAdvisorMembers.map((member) => member.id)
    });
    return dialFormAdvisorMembers;
  })();
  return dialFormAdvisorMembersPromise;
}
async function loadDialFormAdvisorUpcomingActions({ force = false, advisorIds = null } = {}) {
  const ids = resolveAdvisorIdsForUpcomingFetch(advisorIds);
  const cacheKey = ids.join(",");
  if (!force && cacheKey && dialFormAdvisorUpcomingCacheKey === cacheKey && !isAdvisorScheduleStale(dialFormAdvisorUpcomingFetchedAt)) {
    return dialFormAdvisorUpcomingById;
  }
  if (dialFormAdvisorUpcomingPromise) return dialFormAdvisorUpcomingPromise;
  dialFormAdvisorUpcomingLoading = true;
  dialFormAdvisorUpcomingError = "";
  updateAdvisorPlannedDisplay();
  dialFormAdvisorUpcomingPromise = (async () => {
    try {
      if (!ids.length) {
        dialFormAdvisorUpcomingById = /* @__PURE__ */ new Map();
        dialFormAdvisorUpcomingCacheKey = "";
        dialFormAdvisorUpcomingFetchedAt = Date.now();
        return dialFormAdvisorUpcomingById;
      }
      const results = await Promise.all(ids.map(async (advisorId) => {
        try {
          const rows = await fetchAdvisorUpcomingActions(advisorId);
          return { advisorId, rows, error: "" };
        } catch (error) {
          console.warn(`[teleapo] failed to load mypage actions (advisor:${advisorId}):`, error);
          return { advisorId, rows: [], error: "\u4E88\u5B9A\u30A2\u30AF\u30B7\u30E7\u30F3\u53D6\u5F97\u5931\u6557" };
        }
      }));
      const map = /* @__PURE__ */ new Map();
      let failedCount = 0;
      results.forEach(({ advisorId, rows, error }) => {
        if (error) failedCount += 1;
        map.set(String(advisorId), { rows, error });
      });
      dialFormAdvisorUpcomingById = map;
      dialFormAdvisorUpcomingCacheKey = cacheKey;
      dialFormAdvisorUpcomingFetchedAt = Date.now();
      if (failedCount > 0) {
        dialFormAdvisorUpcomingError = failedCount === ids.length ? "\u4E88\u5B9A\u30A2\u30AF\u30B7\u30E7\u30F3\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" : `\u4E00\u90E8\u306E\u4E88\u5B9A\u30A2\u30AF\u30B7\u30E7\u30F3\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F (${failedCount}/${ids.length})`;
      }
    } catch (error) {
      console.warn("[teleapo] failed to load advisor upcoming actions:", error);
      dialFormAdvisorUpcomingById = /* @__PURE__ */ new Map();
      dialFormAdvisorUpcomingCacheKey = "";
      dialFormAdvisorUpcomingError = "\u4E88\u5B9A\u30A2\u30AF\u30B7\u30E7\u30F3\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
      dialFormAdvisorUpcomingFetchedAt = 0;
    } finally {
      dialFormAdvisorUpcomingLoading = false;
      dialFormAdvisorUpcomingPromise = null;
      updateAdvisorPlannedDisplay();
    }
    return dialFormAdvisorUpcomingById;
  })();
  return dialFormAdvisorUpcomingPromise;
}
async function loadDialFormAdvisorPlannedKpis({ force = false } = {}) {
  if (!force && dialFormAdvisorPlannedById.size > 0 && !isAdvisorScheduleStale(dialFormAdvisorPlannedFetchedAt)) {
    return dialFormAdvisorPlannedById;
  }
  if (dialFormAdvisorPlannedPromise) return dialFormAdvisorPlannedPromise;
  dialFormAdvisorPlannedLoading = true;
  dialFormAdvisorPlannedError = "";
  updateAdvisorPlannedDisplay({ loading: true });
  dialFormAdvisorPlannedPromise = (async () => {
    try {
      const today = todayIsoDate();
      const query = new URLSearchParams({
        from: today,
        to: today,
        scope: "company",
        granularity: "summary",
        groupBy: "advisor",
        planned: "1",
        calcMode: "cohort",
        countBasis: "application",
        timeBasis: "application"
      });
      const url = `${KPI_YIELD_API_URL}?${query.toString()}`;
      const res = await fetch(url, { headers: buildApiHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error(`kpi planned HTTP ${res.status}`);
      const json = await res.json().catch(() => ({}));
      const items = Array.isArray(json == null ? void 0 : json.items) ? json.items : [];
      const map = /* @__PURE__ */ new Map();
      items.forEach((item) => {
        const advisorId = toPositiveInt((item == null ? void 0 : item.advisorUserId) ?? (item == null ? void 0 : item.advisor_user_id) ?? (item == null ? void 0 : item.id));
        if (!advisorId) return;
        map.set(String(advisorId), normalizeAdvisorPlannedKpi((item == null ? void 0 : item.kpi) || item));
      });
      dialFormAdvisorPlannedById = map;
      dialFormAdvisorPlannedFetchedAt = Date.now();
    } catch (error) {
      console.warn("[teleapo] failed to load advisor planned kpis:", error);
      dialFormAdvisorPlannedById = /* @__PURE__ */ new Map();
      dialFormAdvisorPlannedError = "\u4ECA\u5F8C\u306E\u4E88\u5B9A\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
      dialFormAdvisorPlannedFetchedAt = 0;
    } finally {
      dialFormAdvisorPlannedLoading = false;
      dialFormAdvisorPlannedPromise = null;
      updateAdvisorPlannedDisplay();
    }
    return dialFormAdvisorPlannedById;
  })();
  return dialFormAdvisorPlannedPromise;
}
function registerCandidateContactMaps(candidateId, candidate = {}) {
  const idNum = Number(candidateId);
  if (!Number.isFinite(idNum) || idNum <= 0) return;
  const phone = candidate.phone ?? candidate.phone_number ?? candidate.phoneNumber ?? candidate.tel ?? candidate.mobile ?? candidate.candidate_phone ?? "";
  const email = candidate.email ?? candidate.candidate_email ?? candidate.mail ?? candidate.email_address ?? "";
  const phoneKey = normalizePhoneKey(phone);
  if (phoneKey) candidatePhoneToId.set(phoneKey, idNum);
  const emailKey = normalizeEmailKey(email);
  if (emailKey) candidateEmailToId.set(emailKey, idNum);
}
function findCandidateIdByName(name) {
  if (!name) return void 0;
  const direct = candidateNameMap.get(name);
  if (direct) return direct;
  const targetKey = normalizeNameKey(name);
  if (!targetKey) return void 0;
  for (const [candidateName, id] of candidateNameMap.entries()) {
    if (normalizeNameKey(candidateName) === targetKey) return id;
  }
  return void 0;
}
function findCandidateIdFromTarget(target) {
  if (!target) return void 0;
  const direct = findCandidateIdByName(target);
  if (direct) return direct;
  const normalizedTarget = normalizeNameKey(target);
  if (!normalizedTarget) return void 0;
  let bestMatch = null;
  let bestId;
  const list = candidateNameList.length ? candidateNameList : Array.from(candidateNameMap.keys());
  for (const name of list) {
    const normalizedName = normalizeNameKey(name);
    if (!normalizedName) continue;
    if (normalizedTarget.includes(normalizedName)) {
      if (!bestMatch || normalizedName.length > bestMatch.length) {
        bestMatch = normalizedName;
        bestId = candidateNameMap.get(name);
      }
    }
  }
  return bestId;
}
function findTeleapoCandidate({ candidateId, candidateName } = {}) {
  const idNum = toPositiveInt(candidateId);
  if (idNum) {
    const byId = teleapoCandidateMaster.find((candidate) => {
      const rawId = (candidate == null ? void 0 : candidate.candidateId) ?? (candidate == null ? void 0 : candidate.candidate_id) ?? (candidate == null ? void 0 : candidate.id) ?? (candidate == null ? void 0 : candidate.candidateID) ?? null;
      return toPositiveInt(rawId) === idNum;
    });
    if (byId) return byId;
  }
  const nameKey = normalizeNameKey(candidateName);
  if (!nameKey) return null;
  return teleapoCandidateMaster.find((candidate) => {
    const rawName = (candidate == null ? void 0 : candidate.candidateName) ?? (candidate == null ? void 0 : candidate.candidate_name) ?? (candidate == null ? void 0 : candidate.name) ?? "";
    return normalizeNameKey(rawName) === nameKey;
  }) || null;
}
function refreshDialFormAdvisorSelect(candidates = teleapoCandidateMaster) {
  const selectIds = ["dialFormAdvisorUserId", "smsFormAdvisorUserId"];
  const selects = selectIds.map((id) => ({ id, element: document.getElementById(id) })).filter((item) => item.element);
  const entries = /* @__PURE__ */ new Map();
  (dialFormAdvisorMembers || []).forEach((member) => {
    if (!(member == null ? void 0 : member.id)) return;
    entries.set(member.id, { id: member.id, name: member.name || `ID:${member.id}` });
  });
  (candidates || []).forEach((candidate) => {
    const advisorId = toPositiveInt((candidate == null ? void 0 : candidate.advisorUserId) ?? (candidate == null ? void 0 : candidate.advisor_user_id));
    if (!advisorId) return;
    const advisorName = String((candidate == null ? void 0 : candidate.advisorName) ?? (candidate == null ? void 0 : candidate.advisor_name) ?? "").trim();
    const current = entries.get(advisorId);
    if (!current || !current.name && advisorName) {
      entries.set(advisorId, { id: advisorId, name: advisorName || `ID:${advisorId}` });
    }
  });
  dialFormAdvisorOptions = Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const hasOptions = dialFormAdvisorOptions.length > 0;
  const optionsHtml = [
    `<option value="">${hasOptions ? "\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044" : "\u5019\u88DC\u304C\u3042\u308A\u307E\u305B\u3093"}</option>`,
    ...dialFormAdvisorOptions.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
  ].join("");
  selects.forEach(({ element }) => {
    const previous = String(element.value || "");
    element.innerHTML = optionsHtml;
    if (previous && dialFormAdvisorOptions.some((item) => String(item.id) === previous)) {
      element.value = previous;
    }
    element.disabled = !hasOptions;
  });
  updateAdvisorPlannedDisplay();
  if (hasOptions) {
    void loadDialFormAdvisorUpcomingActions({
      advisorIds: dialFormAdvisorOptions.map((item) => item.id)
    });
  }
}
function syncDialFormAdvisorSelection({ candidateId, candidateName, preserveCurrent = false } = {}) {
  const select = document.getElementById("dialFormAdvisorUserId");
  if (!select) return;
  if (preserveCurrent && String(select.value || "").trim()) return;
  const candidate = findTeleapoCandidate({ candidateId, candidateName });
  const advisorId = toPositiveInt((candidate == null ? void 0 : candidate.advisorUserId) ?? (candidate == null ? void 0 : candidate.advisor_user_id));
  if (!advisorId) {
    select.value = "";
    updateAdvisorPlannedDisplay();
    return;
  }
  const advisorIdText = String(advisorId);
  const exists = Array.from(select.options).some((option) => option.value === advisorIdText);
  if (exists) {
    select.value = advisorIdText;
  } else {
    select.value = "";
  }
  updateAdvisorPlannedDisplay();
}
function syncSmsFormAdvisorSelection({ candidateId, candidateName, preserveCurrent = false } = {}) {
  const select = document.getElementById("smsFormAdvisorUserId");
  if (!select) return;
  if (preserveCurrent && String(select.value || "").trim()) return;
  const candidate = findTeleapoCandidate({ candidateId, candidateName });
  const advisorId = toPositiveInt((candidate == null ? void 0 : candidate.advisorUserId) ?? (candidate == null ? void 0 : candidate.advisor_user_id));
  if (!advisorId) {
    select.value = "";
    updateAdvisorPlannedDisplay();
    return;
  }
  const advisorIdText = String(advisorId);
  const exists = Array.from(select.options).some((option) => option.value === advisorIdText);
  if (exists) {
    select.value = advisorIdText;
  } else {
    select.value = "";
  }
  updateAdvisorPlannedDisplay();
}
function resolveCandidateIdFromLog(log) {
  const rawId = (log == null ? void 0 : log.candidateId) ?? (log == null ? void 0 : log.candidate_id);
  const idNum = Number(rawId);
  if (Number.isFinite(idNum) && idNum > 0) return idNum;
  const nameResolved = findCandidateIdFromTarget((log == null ? void 0 : log.target) || "");
  const nameIdNum = Number(nameResolved);
  if (Number.isFinite(nameIdNum) && nameIdNum > 0) return nameIdNum;
  const phoneKey = normalizePhoneKey((log == null ? void 0 : log.tel) || "");
  if (phoneKey && candidatePhoneToId.has(phoneKey)) return candidatePhoneToId.get(phoneKey);
  const emailKey = normalizeEmailKey((log == null ? void 0 : log.email) || "");
  if (emailKey && candidateEmailToId.has(emailKey)) return candidateEmailToId.get(emailKey);
  return null;
}
function hydrateLogCandidateIds(logs) {
  if (!Array.isArray(logs) || !logs.length) return false;
  let updated = false;
  logs.forEach((log) => {
    const current = Number(log == null ? void 0 : log.candidateId);
    if (Number.isFinite(current) && current > 0) return;
    const resolved = resolveCandidateIdFromLog(log);
    if (resolved) {
      log.candidateId = resolved;
      updated = true;
    }
  });
  return updated;
}
function normalizePhaseList(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(/[,/、|]/).map((value) => value.trim()).filter((value) => value);
  return Array.from(new Set(list));
}
function resolveCandidatePhaseDisplay(candidate) {
  var _a, _b, _c, _d;
  const list = normalizePhaseList((candidate == null ? void 0 : candidate.phases) ?? (candidate == null ? void 0 : candidate.phaseList) ?? (candidate == null ? void 0 : candidate.phase) ?? "");
  if (list.length) return list.join(" / ");
  const hasConnected = ((_a = candidate == null ? void 0 : candidate.csSummary) == null ? void 0 : _a.hasConnected) ?? (candidate == null ? void 0 : candidate.phoneConnected) ?? false;
  const hasSms = ((_b = candidate == null ? void 0 : candidate.csSummary) == null ? void 0 : _b.hasSms) ?? (candidate == null ? void 0 : candidate.smsSent) ?? (candidate == null ? void 0 : candidate.smsConfirmed) ?? false;
  const callCount = ((_c = candidate == null ? void 0 : candidate.csSummary) == null ? void 0 : _c.callCount) ?? ((_d = candidate == null ? void 0 : candidate.csSummary) == null ? void 0 : _d.max_call_no) ?? 0;
  if (hasConnected) return "\u901A\u96FB";
  if (hasSms) return "SMS\u9001\u4FE1";
  if (Number(callCount || 0) > 0) return "\u67B6\u96FB\u4E2D";
  return "\u672A\u63A5\u89E6";
}
function normalizeScreeningRulesPayload2(payload) {
  return normalizeScreeningRulesPayload(payload);
}
function computeValidApplication2(candidate, rules) {
  return computeValidApplication(candidate, rules);
}
function resolveCandidateIdValue(candidate) {
  const raw = (candidate == null ? void 0 : candidate.candidateId) ?? (candidate == null ? void 0 : candidate.candidate_id) ?? (candidate == null ? void 0 : candidate.id) ?? (candidate == null ? void 0 : candidate.candidateID) ?? null;
  const idNum = Number(raw);
  if (Number.isFinite(idNum) && idNum > 0) return idNum;
  return null;
}
function updateValidApplicationDetailCache(candidate, { force = false } = {}) {
  if (!screeningRules || !candidate) return null;
  const idNum = resolveCandidateIdValue(candidate);
  if (!Number.isFinite(idNum)) return null;
  if (!force && validApplicationDetailCache.has(idNum)) {
    const cached = validApplicationDetailCache.get(idNum);
    candidate.validApplicationComputed = cached;
    return cached;
  }
  const computed = computeValidApplication2(candidate, screeningRules);
  const resolved = computed === true || computed === false ? computed : resolveValidApplicationRaw(candidate);
  if (resolved === true || resolved === false) {
    const prev = validApplicationDetailCache.get(idNum);
    validApplicationDetailCache.set(idNum, resolved);
    candidate.validApplicationComputed = resolved;
    if (prev !== resolved) {
      scheduleValidApplicationRefresh();
    }
    return resolved;
  }
  candidate.validApplicationComputed = null;
  validApplicationDetailCache.delete(idNum);
  return null;
}
function resolveValidApplicationFromDetail(candidate) {
  const idNum = resolveCandidateIdValue(candidate);
  if (!Number.isFinite(idNum)) return null;
  if (validApplicationDetailCache.has(idNum)) {
    return validApplicationDetailCache.get(idNum);
  }
  return null;
}
function isValidApplicationCandidate(candidate) {
  const rawValue = resolveValidApplicationRaw(candidate);
  if (rawValue === true || rawValue === false) return rawValue;
  if (screeningRules) {
    const computed = computeValidApplication2(candidate, screeningRules);
    if (computed === true || computed === false) {
      updateValidApplicationDetailCache(candidate, { force: true });
      return computed;
    }
  }
  const detailValue = resolveValidApplicationFromDetail(candidate);
  if (detailValue === true || detailValue === false) return detailValue;
  return rawValue;
}
function formatCandidateDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}
function formatCandidateDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}
function formatShortMonthDay(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
function formatCandidateValue(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text ? escapeHtml(text) : fallback;
}
function formatDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function getCandidateDetailApiUrl(candidateId) {
  const id = String(candidateId ?? "").trim();
  if (!id) return "";
  return `${CANDIDATES_API_URL}/${encodeURIComponent(id)}`;
}
function fetchCandidateDetailInfo(candidateId) {
  const idNum = Number(candidateId);
  if (!Number.isFinite(idNum) || idNum <= 0) return Promise.resolve(null);
  if (candidateDetailCache.has(idNum)) return Promise.resolve(candidateDetailCache.get(idNum));
  if (candidateDetailRequests.has(idNum)) return candidateDetailRequests.get(idNum);
  const url = getCandidateDetailApiUrl(idNum);
  if (!url) return Promise.resolve(null);
  const req = fetch(url, { headers: { Accept: "application/json" } }).then((res) => {
    if (!res.ok) {
      return res.text().then((text) => {
        throw new Error(`HTTP ${res.status}: ${text}`);
      });
    }
    return res.json();
  }).then((data) => {
    const prev = candidateDetailCache.get(idNum);
    const prevContactTime = normalizeContactPreferredTime(
      (prev == null ? void 0 : prev.contactPreferredTime) ?? (prev == null ? void 0 : prev.contact_preferred_time) ?? (prev == null ? void 0 : prev.contactTime) ?? (prev == null ? void 0 : prev.contact_time)
    );
    const phone = (data == null ? void 0 : data.phone) ?? (data == null ? void 0 : data.phone_number) ?? (data == null ? void 0 : data.phoneNumber) ?? (data == null ? void 0 : data.tel) ?? (data == null ? void 0 : data.mobile) ?? (data == null ? void 0 : data.candidate_phone) ?? "";
    const email = (data == null ? void 0 : data.email) ?? (data == null ? void 0 : data.candidate_email) ?? (data == null ? void 0 : data.mail) ?? (data == null ? void 0 : data.email_address) ?? "";
    const attendanceRaw = (data == null ? void 0 : data.attendanceConfirmed) ?? (data == null ? void 0 : data.first_interview_attended) ?? (data == null ? void 0 : data.attendance_confirmed) ?? null;
    const firstInterviewDate = (data == null ? void 0 : data.firstInterviewDate) ?? (data == null ? void 0 : data.first_interview_date) ?? (data == null ? void 0 : data.firstInterviewAt) ?? (data == null ? void 0 : data.first_interview_at) ?? null;
    const birthday = (data == null ? void 0 : data.birthday) ?? (data == null ? void 0 : data.birth_date) ?? (data == null ? void 0 : data.birthDate) ?? (data == null ? void 0 : data.birthdate) ?? "";
    const contactPreferredTime = normalizeContactPreferredTime(
      (data == null ? void 0 : data.contactPreferredTime) ?? (data == null ? void 0 : data.contact_preferred_time) ?? (data == null ? void 0 : data.contactTime) ?? (data == null ? void 0 : data.contact_time) ?? (data == null ? void 0 : data.preferredContactTime) ?? (data == null ? void 0 : data.preferred_contact_time)
    );
    console.log(`[teleapo] Fetched detail for ${idNum}:`, {
      contactPreferredTime,
      rawData: data
    });
    const ageRaw = (data == null ? void 0 : data.age) ?? (data == null ? void 0 : data.age_years) ?? (data == null ? void 0 : data.ageYears) ?? null;
    const ageValue = Number(ageRaw);
    const age = Number.isFinite(ageValue) && ageValue > 0 ? ageValue : null;
    const normalized = normalizeCandidateDetail({
      ...data,
      candidateId: idNum,
      phone,
      email,
      contactPreferredTime
    });
    normalized.attendanceConfirmed = normalizeAttendanceValue(attendanceRaw);
    if (firstInterviewDate) {
      normalized.firstInterviewDate = firstInterviewDate;
    }
    normalized.contactPreferredTimeFetched = true;
    updateValidApplicationDetailCache(normalized, { force: true });
    candidateDetailCache.set(idNum, normalized);
    candidateDetailRequests.delete(idNum);
    const newContactTime = normalizeContactPreferredTime(contactPreferredTime);
    if (newContactTime && newContactTime !== prevContactTime) {
      scheduleCandidateDetailRefresh();
    }
    return normalized;
  }).catch((err) => {
    console.warn(`[teleapo] Detail fetch error for ${idNum}:`, err);
    if (!candidateDetailCache.has(idNum)) {
      candidateDetailCache.set(idNum, {
        contactPreferredTimeFetched: true
      });
    }
    candidateDetailRequests.delete(idNum);
    return null;
  });
  candidateDetailRequests.set(idNum, req);
  return req;
}
function applyScreeningRulesToTeleapoCandidates() {
  validApplicationDetailCache.clear();
  validApplicationQueue = [];
  validApplicationQueueSet.clear();
  validApplicationQueueActive = false;
  if (!screeningRules || !teleapoCandidateMaster.length) return;
  prefetchValidApplicationForCandidates(teleapoCandidateMaster);
  rebuildCsTaskCandidates();
}
async function loadScreeningRulesForTeleapo({ force = false } = {}) {
  if (!force && screeningRulesLoaded) return screeningRules;
  if (screeningRulesLoadPromise) return screeningRulesLoadPromise;
  if (force) {
    screeningRulesLoaded = false;
  }
  screeningRulesLoading = true;
  screeningRulesLoadPromise = (async () => {
    var _a;
    try {
      const token = (_a = getSession()) == null ? void 0 : _a.token;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      let response = await fetch(SCREENING_RULES_ENDPOINT, { headers, cache: "no-store" });
      if (!response.ok && SCREENING_RULES_FALLBACK_ENDPOINT) {
        response = await fetch(SCREENING_RULES_FALLBACK_ENDPOINT, { headers, cache: "no-store" });
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      screeningRules = normalizeScreeningRulesPayload2(data);
      screeningRulesLoaded = true;
    } catch (error) {
      console.error("\u6709\u52B9\u5FDC\u52DF\u5224\u5B9A\u30EB\u30FC\u30EB\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002", error);
      screeningRules = null;
    } finally {
      screeningRulesLoading = false;
      screeningRulesLoadPromise = null;
      applyScreeningRulesToTeleapoCandidates();
    }
    return screeningRules;
  })();
  return screeningRulesLoadPromise;
}
function normalizeCandidateDetail(raw) {
  if (!raw) return raw;
  const normalized = {
    ...raw,
    candidateId: raw.candidateId ?? raw.candidate_id ?? raw.id ?? null,
    candidateName: raw.candidateName ?? raw.candidate_name ?? raw.name ?? "",
    advisorUserId: toPositiveInt(raw.advisorUserId ?? raw.advisor_user_id),
    partnerUserId: toPositiveInt(
      raw.partnerUserId ?? raw.partner_user_id ?? raw.csUserId ?? raw.cs_user_id
    ),
    csUserId: toPositiveInt(
      raw.csUserId ?? raw.cs_user_id ?? raw.partnerUserId ?? raw.partner_user_id
    ),
    callerUserId: toPositiveInt(raw.callerUserId ?? raw.caller_user_id),
    advisorName: raw.advisorName ?? raw.advisor_name ?? "",
    partnerName: raw.partnerName ?? raw.partner_name ?? "",
    registeredAt: raw.registeredAt ?? raw.createdAt ?? raw.created_at ?? raw.registered_at ?? null,
    validApplication: raw.validApplication ?? raw.valid_application ?? raw.validApplicationComputed ?? raw.valid_application_computed ?? raw.is_effective_application ?? raw.active_flag ?? raw.isEffective ?? raw.is_effective ?? raw.isEffectiveApplication ?? null,
    phone: raw.phone ?? raw.phone_number ?? raw.tel ?? "",
    email: raw.email ?? raw.email_address ?? "",
    birthday: raw.birthday ?? raw.birth_date ?? raw.birthDate ?? raw.birthdate ?? "",
    age: raw.age ?? raw.age_years ?? raw.ageYears ?? null,
    nationality: raw.nationality ?? raw.nationality_text ?? raw.nationality_code ?? "",
    japaneseLevel: raw.japaneseLevel ?? raw.japanese_level ?? raw.jlpt_level ?? raw.jlptLevel ?? "",
    applyCompanyName: raw.applyCompanyName ?? raw.apply_company_name ?? raw.companyName ?? raw.company_name ?? "",
    applyJobName: raw.applyJobName ?? raw.apply_job_name ?? raw.jobName ?? raw.job_name ?? "",
    applyRouteText: raw.applyRouteText ?? raw.apply_route_text ?? raw.source ?? "",
    contactPreferredTime: normalizeContactPreferredTime(
      raw.contactPreferredTime ?? raw.contact_preferred_time ?? raw.contactTime ?? raw.contact_time
    ),
    address: raw.address ?? "",
    selectionProgress: Array.isArray(raw.selectionProgress ?? raw.selection_progress) ? raw.selectionProgress ?? raw.selection_progress : [],
    teleapoLogs: Array.isArray(raw.teleapoLogs ?? raw.teleapo_logs) ? raw.teleapoLogs ?? raw.teleapo_logs : [],
    csSummary: raw.csSummary ?? raw.cs_summary ?? {},
    phases: raw.phases ?? raw.phaseList ?? raw.phase ?? ""
  };
  if (normalized.birthday) {
    const computedAge = calculateAgeFromBirthday2(normalized.birthday);
    if (computedAge !== null) {
      normalized.age = computedAge;
      normalized.age_years = computedAge;
      normalized.ageYears = computedAge;
    }
  }
  return normalized;
}
function buildCandidatePhaseBadges(candidate) {
  const list = normalizePhaseList((candidate == null ? void 0 : candidate.phases) ?? (candidate == null ? void 0 : candidate.phaseList) ?? (candidate == null ? void 0 : candidate.phase) ?? "");
  const display = list.length ? list : [resolveCandidatePhaseDisplay(candidate)];
  return display.map((value) => `
    <span class="teleapo-candidate-pill teleapo-candidate-pill--info">${escapeHtml(value || "-")}</span>
  `).join("");
}
function buildValidApplicationPill(validApplication) {
  if (validApplication === null || validApplication === void 0) {
    return '<span class="teleapo-candidate-pill teleapo-candidate-pill--muted">\u5FDC\u52DF\u4E0D\u660E</span>';
  }
  return validApplication ? '<span class="teleapo-candidate-pill teleapo-candidate-pill--success">\u6709\u52B9\u5FDC\u52DF</span>' : '<span class="teleapo-candidate-pill teleapo-candidate-pill--muted">\u7121\u52B9\u5FDC\u52DF</span>';
}
function setCandidateQuickViewTitle(text) {
  const titleEl = document.getElementById("teleapoCandidateModalTitle");
  if (titleEl) titleEl.textContent = text || "\u5019\u88DC\u8005\u8A73\u7D30";
}
function setCandidateQuickViewContent(html) {
  const container = document.getElementById("teleapoCandidateDetailContent");
  if (!container) return;
  container.innerHTML = html;
}
function setCandidateQuickEditStatus(message, variant = "info") {
  const el = document.getElementById("teleapoCandidateEditStatus");
  if (!el) return;
  el.textContent = message || "";
  el.classList.remove("text-slate-500", "text-rose-600", "text-emerald-600");
  if (variant === "error") el.classList.add("text-rose-600");
  else if (variant === "success") el.classList.add("text-emerald-600");
  else el.classList.add("text-slate-500");
}
function readQuickEditValue(id) {
  const el = document.getElementById(id);
  if (!el) return "";
  return String(el.value ?? "").trim();
}
function buildQuickEditPayload(candidateId) {
  const birthday = readQuickEditValue("teleapoQuickEditBirthday");
  const ageInput = readQuickEditValue("teleapoQuickEditAge");
  const parsedAge = ageInput ? Number(ageInput) : null;
  const age = Number.isFinite(parsedAge) && parsedAge > 0 ? Math.trunc(parsedAge) : null;
  return {
    id: candidateId ?? null,
    detailMode: true,
    phone: readQuickEditValue("teleapoQuickEditPhone"),
    email: readQuickEditValue("teleapoQuickEditEmail"),
    contactPreferredTime: readQuickEditValue("teleapoQuickEditContactTime"),
    applyCompanyName: readQuickEditValue("teleapoQuickEditApplyCompany"),
    applyJobName: readQuickEditValue("teleapoQuickEditApplyJob"),
    applyRouteText: readQuickEditValue("teleapoQuickEditApplyRoute"),
    birthday: birthday || null,
    age
  };
}
function syncCandidateCaches(candidateId, detail) {
  const idNum = Number(candidateId);
  if (!Number.isFinite(idNum) || idNum <= 0) return;
  const phone = String(detail.phone ?? "").trim();
  const birthday = String(detail.birthday ?? "").trim();
  const contactPreferredTime = normalizeContactPreferredTime(
    detail.contactPreferredTime ?? detail.contact_preferred_time ?? detail.contactTime ?? detail.contact_time
  );
  const ageRaw = detail.age ?? null;
  const ageValue = Number(ageRaw);
  const age = Number.isFinite(ageValue) && ageValue > 0 ? ageValue : calculateAgeFromBirthday2(birthday);
  const prev = candidateDetailCache.get(idNum) || {};
  candidateDetailCache.set(idNum, {
    ...prev,
    phone,
    birthday,
    age,
    contactPreferredTime,
    contactPreferredTimeFetched: true
  });
  updateValidApplicationDetailCache({ ...detail, candidateId: idNum }, { force: true });
  if (phone) candidatePhoneCache.set(idNum, phone);
  registerCandidateContactMaps(idNum, { phone, email: detail.email ?? "" });
  const entry = teleapoCandidateMaster.find((c) => {
    const entryId = c.id ?? c.candidate_id ?? c.candidateId ?? c.candidateID;
    return String(entryId) === String(idNum);
  });
  if (entry) {
    entry.phone = phone;
    entry.phone_number = phone;
    entry.tel = phone;
    entry.email = detail.email ?? entry.email ?? "";
    entry.birthday = birthday;
    entry.birth_date = birthday;
    entry.birthDate = birthday;
    entry.age = age ?? entry.age ?? null;
    entry.apply_company_name = detail.applyCompanyName ?? entry.apply_company_name ?? "";
    entry.apply_job_name = detail.applyJobName ?? entry.apply_job_name ?? "";
    entry.apply_route_text = detail.applyRouteText ?? entry.apply_route_text ?? "";
    entry.contactPreferredTime = contactPreferredTime;
    entry.contact_preferred_time = contactPreferredTime;
  }
}
async function saveCandidateQuickEdit() {
  var _a, _b, _c;
  if (teleapoQuickEditState.saving) return;
  const candidateId = teleapoQuickEditState.candidateId ?? ((_a = teleapoQuickEditState.detail) == null ? void 0 : _a.candidateId) ?? ((_b = teleapoQuickEditState.detail) == null ? void 0 : _b.id) ?? ((_c = teleapoQuickEditState.detail) == null ? void 0 : _c.candidate_id) ?? null;
  if (!candidateId) {
    setCandidateQuickEditStatus("\u5019\u88DC\u8005ID\u304C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002", "error");
    return;
  }
  const url = getCandidateDetailApiUrl(candidateId);
  if (!url) {
    setCandidateQuickEditStatus("\u4FDD\u5B58\u5148\u306EURL\u304C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3002", "error");
    return;
  }
  const payload = buildQuickEditPayload(candidateId);
  teleapoQuickEditState.saving = true;
  setCandidateQuickEditStatus("\u4FDD\u5B58\u4E2D...", "info");
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const data = await res.json().catch(() => ({}));
    const normalized = normalizeCandidateDetail(data) || {};
    const fallbackPhone = payload.phone;
    const fallbackBirthday = payload.birthday;
    const idNum = Number(candidateId);
    if (fallbackPhone && !String(normalized.phone || "").trim()) {
      normalized.phone = fallbackPhone;
    }
    if (fallbackBirthday && !String(normalized.birthday || "").trim()) {
      normalized.birthday = fallbackBirthday;
    }
    if (Number.isFinite(payload.age) && (!Number.isFinite(Number(normalized.age)) || Number(normalized.age) <= 0)) {
      normalized.age = payload.age;
    }
    if (!normalized.candidateId && !normalized.id && Number.isFinite(idNum)) {
      normalized.candidateId = idNum;
    }
    teleapoQuickEditState.detail = normalized;
    teleapoQuickEditState.editMode = false;
    syncCandidateCaches(candidateId, normalized);
    renderCandidateQuickView(normalized);
    rebuildMissingInfoCandidates();
    setCandidateQuickEditStatus("", "info");
  } catch (err) {
    console.error("candidate quick edit error:", err);
    const message = (err == null ? void 0 : err.message) ? `\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${err.message}` : "\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
    setCandidateQuickEditStatus(message, "error");
  } finally {
    teleapoQuickEditState.saving = false;
  }
}
function renderCandidateQuickView(detail) {
  const candidate = normalizeCandidateDetail(detail || {});
  const name = candidate.candidateName || "-";
  const candidateId = candidate.candidateId ?? candidate.id ?? candidate.candidate_id ?? null;
  const isEditing = teleapoQuickEditState.editMode;
  const birthdayValue = candidate.birthday ?? "";
  const rawAge = Number(candidate.age);
  const ageFromBirthday = calculateAgeFromBirthday2(birthdayValue);
  const ageValue = Number.isFinite(rawAge) && rawAge > 0 ? rawAge : Number.isFinite(ageFromBirthday) && ageFromBirthday > 0 ? ageFromBirthday : null;
  const birthdayText = birthdayValue ? formatCandidateDate(birthdayValue) : "-";
  const ageText = Number.isFinite(ageValue) && ageValue > 0 ? `${ageValue}\u6B73` : "-";
  const editDisabled = teleapoQuickEditState.saving ? "disabled" : "";
  teleapoQuickEditState.detail = candidate;
  if (candidateId) teleapoQuickEditState.candidateId = candidateId;
  setCandidateQuickViewTitle(name ? `${name} \u306E\u8A73\u7D30` : "\u5019\u88DC\u8005\u8A73\u7D30");
  const phaseBadges = buildCandidatePhaseBadges(candidate);
  const validBadge = buildValidApplicationPill(isValidApplicationCandidate(candidate));
  const csSummary = candidate.csSummary || {};
  const csConnected = csSummary.hasConnected ?? candidate.phoneConnected ?? false;
  const csSms = csSummary.hasSms ?? candidate.smsSent ?? candidate.smsConfirmed ?? false;
  const csCallCount = csSummary.callCount ?? csSummary.max_call_no ?? 0;
  const csLastConnected = csSummary.lastConnectedAt ?? candidate.callDate ?? null;
  const selection = (candidate.selectionProgress || [])[0] || null;
  const selectionCompany = (selection == null ? void 0 : selection.companyName) ?? (selection == null ? void 0 : selection.company_name) ?? candidate.applyCompanyName ?? "";
  const selectionJob = (selection == null ? void 0 : selection.jobTitle) ?? (selection == null ? void 0 : selection.job_title) ?? candidate.applyJobName ?? "";
  const selectionStatus = (selection == null ? void 0 : selection.status) ?? (selection == null ? void 0 : selection.stage_current) ?? "";
  const selectionInterview = (selection == null ? void 0 : selection.interviewDate) ?? (selection == null ? void 0 : selection.firstInterviewAt) ?? (selection == null ? void 0 : selection.first_interview_at) ?? null;
  const logs = Array.isArray(candidate.teleapoLogs) ? candidate.teleapoLogs.slice(0, 5) : [];
  const logsHtml = logs.length ? logs.map((log) => {
    const calledAt = log.calledAt ?? log.called_at ?? log.callDate ?? log.datetime ?? "";
    const callerName = log.callerName ?? log.caller_name ?? "";
    const memo = log.memo ?? "";
    const callNo = log.callNo ?? log.call_no ?? "";
    return `
        <div class="teleapo-candidate-log-item">
          <div class="teleapo-candidate-log-meta">${escapeHtml(formatCandidateDateTime(calledAt))}</div>
          <div class="teleapo-candidate-log-body">
            <div class="teleapo-candidate-log-title">${formatCandidateValue(callerName, "\u62C5\u5F53\u8005\u4E0D\u660E")}</div>
            <div class="teleapo-candidate-log-memo">${formatCandidateValue(memo, "-")}</div>
          </div>
          ${callNo ? `<span class="teleapo-candidate-log-tag">#${escapeHtml(String(callNo))}</span>` : ""}
        </div>
      `;
  }).join("") : '<p class="teleapo-candidate-muted">\u30C6\u30EC\u30A2\u30DD\u30ED\u30B0\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002</p>';
  const selectionHtml = selection ? `
      <dl class="teleapo-candidate-kv">
        <div><dt>\u4F01\u696D\u540D</dt><dd>${formatCandidateValue(selectionCompany)}</dd></div>
        <div><dt>\u8077\u7A2E</dt><dd>${formatCandidateValue(selectionJob)}</dd></div>
        <div><dt>\u30B9\u30C6\u30FC\u30BF\u30B9</dt><dd>${formatCandidateValue(selectionStatus)}</dd></div>
        <div><dt>\u6B21\u56DE\u9762\u8AC7</dt><dd>${escapeHtml(formatCandidateDate(selectionInterview))}</dd></div>
      </dl>
    ` : '<p class="teleapo-candidate-muted">\u9078\u8003\u60C5\u5831\u306F\u3042\u308A\u307E\u305B\u3093\u3002</p>';
  const actionHtml = isEditing ? `
      <div class="teleapo-candidate-actions">
        <button type="button" data-candidate-action="save" ${editDisabled}
          class="teleapo-candidate-action teleapo-candidate-action--primary">\u4FDD\u5B58</button>
        <button type="button" data-candidate-action="cancel"
          class="teleapo-candidate-action">\u30AD\u30E3\u30F3\u30BB\u30EB</button>
        <span id="teleapoCandidateEditStatus" class="teleapo-candidate-edit-status"></span>
      </div>
    ` : `
      <div class="teleapo-candidate-actions">
        <button type="button" data-candidate-action="edit"
          class="teleapo-candidate-action">\u7DE8\u96C6</button>
      </div>
    `;
  const applyRouteField = isEditing ? `<input id="teleapoQuickEditApplyRoute" class="teleapo-candidate-edit-input" value="${escapeHtml(candidate.applyRouteText || "")}" />` : formatCandidateValue(candidate.applyRouteText);
  const applyCompanyField = isEditing ? `<input id="teleapoQuickEditApplyCompany" class="teleapo-candidate-edit-input" value="${escapeHtml(candidate.applyCompanyName || "")}" />` : formatCandidateValue(candidate.applyCompanyName);
  const applyJobField = isEditing ? `<input id="teleapoQuickEditApplyJob" class="teleapo-candidate-edit-input" value="${escapeHtml(candidate.applyJobName || "")}" />` : formatCandidateValue(candidate.applyJobName);
  const birthdayField = isEditing ? `<input id="teleapoQuickEditBirthday" type="date" class="teleapo-candidate-edit-input" value="${escapeHtml(formatDateInputValue(birthdayValue))}" />` : escapeHtml(birthdayText);
  const ageInputValue = Number.isFinite(rawAge) && rawAge > 0 ? rawAge : Number.isFinite(ageFromBirthday) && ageFromBirthday > 0 ? ageFromBirthday : "";
  const ageField = isEditing ? `<input id="teleapoQuickEditAge" type="number" min="0" class="teleapo-candidate-edit-input" value="${escapeHtml(String(ageInputValue))}" />` : escapeHtml(ageText);
  const phoneField = isEditing ? `<input id="teleapoQuickEditPhone" class="teleapo-candidate-edit-input" value="${escapeHtml(candidate.phone || "")}" />` : formatCandidateValue(candidate.phone);
  const emailField = isEditing ? `<input id="teleapoQuickEditEmail" class="teleapo-candidate-edit-input" value="${escapeHtml(candidate.email || "")}" />` : formatCandidateValue(candidate.email);
  const contactTimeField = isEditing ? `<input id="teleapoQuickEditContactTime" class="teleapo-candidate-edit-input" value="${escapeHtml(candidate.contactPreferredTime || "")}" />` : formatCandidateValue(candidate.contactPreferredTime);
  setCandidateQuickViewContent(`
    <div class="teleapo-candidate-meta">
      <div>
        <div class="teleapo-candidate-name">${escapeHtml(name)}</div>
        <div class="teleapo-candidate-tags">
          ${phaseBadges}
          ${validBadge}
        </div>
      </div>
      <button 
        type="button"
        data-candidate-action="open-detail"
        data-candidate-id="${escapeHtml(String(candidateId || ""))}"
        class="px-3 py-2 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-500 shadow-sm whitespace-nowrap">
        \u8A73\u7D30\u753B\u9762\u3078
      </button>
    </div>
    ${actionHtml}

    <div class="teleapo-candidate-grid">
      <div class="teleapo-candidate-card">
        <div class="teleapo-candidate-card-title">\u57FA\u672C\u60C5\u5831</div>
        <dl class="teleapo-candidate-kv">
          <div><dt>\u767B\u9332\u65E5</dt><dd>${escapeHtml(formatCandidateDate(candidate.registeredAt))}</dd></div>
          <div><dt>\u5FDC\u52DF\u7D4C\u8DEF</dt><dd>${applyRouteField}</dd></div>
          <div><dt>\u5FDC\u52DF\u4F01\u696D</dt><dd>${applyCompanyField}</dd></div>
          <div><dt>\u5FDC\u52DF\u8077\u7A2E</dt><dd>${applyJobField}</dd></div>
          <div><dt>\u751F\u5E74\u6708\u65E5</dt><dd>${birthdayField}</dd></div>
          <div><dt>\u5E74\u9F62</dt><dd>${ageField}</dd></div>
          <div><dt>\u62C5\u5F53CS</dt><dd>${formatCandidateValue(candidate.advisorName)}</dd></div>
          <div><dt>\u62C5\u5F53\u30D1\u30FC\u30C8\u30CA\u30FC</dt><dd>${formatCandidateValue(candidate.partnerName)}</dd></div>
        </dl>
      </div>
      <div class="teleapo-candidate-card">
        <div class="teleapo-candidate-card-title">\u9023\u7D61\u5148</div>
        <dl class="teleapo-candidate-kv">
          <div><dt>\u96FB\u8A71</dt><dd>${phoneField}</dd></div>
          <div><dt>\u30E1\u30FC\u30EB</dt><dd>${emailField}</dd></div>
          <div><dt>\u5E0C\u671B\u6642\u9593</dt><dd>${contactTimeField}</dd></div>
          <div><dt>\u73FE\u4F4F\u6240</dt><dd>${formatCandidateValue(candidate.address)}</dd></div>
        </dl>
      </div>
      <div class="teleapo-candidate-card">
        <div class="teleapo-candidate-card-title">CS\u30B5\u30DE\u30EA\u30FC</div>
        <dl class="teleapo-candidate-kv">
          <div><dt>\u901A\u96FB</dt><dd>${csConnected ? "\u901A\u96FB\u6E08" : "\u672A\u901A\u96FB"}</dd></div>
          <div><dt>SMS</dt><dd>${csSms ? "\u9001\u4FE1\u6E08" : "\u672A\u9001\u4FE1"}</dd></div>
          <div><dt>\u67B6\u96FB\u56DE\u6570</dt><dd>${escapeHtml(String(csCallCount || 0))}\u56DE</dd></div>
          <div><dt>\u6700\u7D42\u901A\u96FB</dt><dd>${escapeHtml(formatCandidateDateTime(csLastConnected))}</dd></div>
        </dl>
      </div>
    </div>

    <div class="teleapo-candidate-section">
      <div class="teleapo-candidate-card">
        <div class="teleapo-candidate-card-title">\u6700\u65B0\u306E\u9078\u8003\u72B6\u6CC1</div>
        ${selectionHtml}
      </div>
    </div>

    <div class="teleapo-candidate-section">
      <div class="teleapo-candidate-card">
        <div class="teleapo-candidate-card-title">\u6700\u8FD1\u306E\u30C6\u30EC\u30A2\u30DD\u30ED\u30B0\uFF08\u76F4\u8FD15\u4EF6\uFF09</div>
        <div class="teleapo-candidate-log-list">${logsHtml}</div>
      </div>
    </div>
  `);
}
function openCandidateQuickView(candidateId, candidateName) {
  const resolvedId = candidateId || findCandidateIdFromTarget(candidateName);
  const fallbackName = candidateName || candidateIdMap.get(String(candidateId)) || "\u5019\u88DC\u8005\u8A73\u7D30";
  teleapoQuickEditState.editMode = false;
  teleapoQuickEditState.saving = false;
  teleapoQuickEditState.detail = null;
  teleapoQuickEditState.candidateId = resolvedId || null;
  setCandidateQuickViewTitle(fallbackName);
  setCandidateQuickViewContent(`
    <div class="teleapo-candidate-empty">
      <p class="text-sm text-slate-500">\u5019\u88DC\u8005\u8A73\u7D30\u3092\u53D6\u5F97\u3057\u3066\u3044\u307E\u3059...</p>
    </div>
  `);
  openTeleapoCandidateModal();
  if (!resolvedId) {
    setCandidateQuickViewContent(`
      <div class="teleapo-candidate-empty">
        <p class="text-sm text-rose-600">\u5019\u88DC\u8005ID\u304C\u53D6\u5F97\u3067\u304D\u306A\u3044\u305F\u3081\u8A73\u7D30\u3092\u8868\u793A\u3067\u304D\u307E\u305B\u3093\u3002</p>
      </div>
    `);
    return;
  }
  if (teleapoCandidateAbort) {
    teleapoCandidateAbort.abort();
  }
  teleapoCandidateAbort = new AbortController();
  fetch(getCandidateDetailApiUrl(resolvedId), {
    headers: { Accept: "application/json" },
    signal: teleapoCandidateAbort.signal
  }).then((res) => {
    if (!res.ok) {
      return res.text().then((text) => {
        throw new Error(`HTTP ${res.status}: ${text}`);
      });
    }
    return res.json();
  }).then((data) => {
    renderCandidateQuickView(data);
  }).catch((err) => {
    if ((err == null ? void 0 : err.name) === "AbortError") return;
    console.error("candidate quick view error:", err);
    setCandidateQuickViewContent(`
        <div class="teleapo-candidate-empty">
          <p class="text-sm text-rose-600">\u5019\u88DC\u8005\u8A73\u7D30\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002</p>
        </div>
      `);
  });
}
function openTeleapoCandidateModal() {
  const modal = document.getElementById("teleapoCandidateModal");
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("teleapo-candidate-open");
}
function closeTeleapoCandidateModal() {
  const modal = document.getElementById("teleapoCandidateModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("teleapo-candidate-open");
  if (teleapoCandidateAbort) {
    teleapoCandidateAbort.abort();
    teleapoCandidateAbort = null;
  }
}
function handleCandidateQuickAction(event) {
  var _a, _b, _c, _d;
  const btn = event.target.closest("[data-candidate-action]");
  if (!btn) return;
  event.preventDefault();
  const action = btn.dataset.candidateAction;
  if (!action) return;
  if (!teleapoQuickEditState.detail) return;
  if (action === "open-detail") {
    const candidateId = btn.dataset.candidateId || ((_a = teleapoQuickEditState.detail) == null ? void 0 : _a.candidateId) || ((_b = teleapoQuickEditState.detail) == null ? void 0 : _b.id);
    const candidateName = ((_c = teleapoQuickEditState.detail) == null ? void 0 : _c.candidateName) || ((_d = teleapoQuickEditState.detail) == null ? void 0 : _d.name);
    closeTeleapoCandidateModal();
    navigateToCandidateDetailPage(candidateId, candidateName);
    return;
  }
  if (action === "edit") {
    teleapoQuickEditState.editMode = true;
    renderCandidateQuickView(teleapoQuickEditState.detail);
    return;
  }
  if (action === "cancel") {
    teleapoQuickEditState.editMode = false;
    renderCandidateQuickView(teleapoQuickEditState.detail);
    return;
  }
  if (action === "save") {
    saveCandidateQuickEdit();
  }
}
function initCandidateQuickView() {
  const modal = document.getElementById("teleapoCandidateModal");
  const closeBtn = document.getElementById("teleapoCandidateClose");
  const detailContent = document.getElementById("teleapoCandidateDetailContent");
  if (closeBtn) closeBtn.addEventListener("click", closeTeleapoCandidateModal);
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeTeleapoCandidateModal();
    });
  }
  if (detailContent) {
    detailContent.addEventListener("click", handleCandidateQuickAction);
  }
}
function renderValidApplicationBadge(isValid) {
  const label = isValid ? "\u6709\u52B9\u5FDC\u52DF" : "\u7121\u52B9\u5FDC\u52DF";
  const classes = isValid ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500";
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${classes}">${label}</span>`;
}
function buildTeleapoSummaryForCandidate(candidateId, candidateName) {
  const idNum = Number(candidateId);
  const hasId = Number.isFinite(idNum) && idNum > 0;
  const normalizedName = normalizeNameKey(candidateName);
  if (hasId) {
    const cached2 = teleapoSummaryByCandidateId.get(idNum);
    if (!cached2) return null;
    return {
      hasConnected: cached2.hasConnected,
      hasSms: cached2.hasSms,
      callCount: cached2.callCount,
      lastConnectedAt: cached2.lastConnectedAt
    };
  }
  if (!normalizedName) return null;
  const cached = teleapoSummaryByName.get(normalizedName);
  if (!cached) return null;
  return {
    hasConnected: cached.hasConnected,
    hasSms: cached.hasSms,
    callCount: cached.callCount,
    lastConnectedAt: cached.lastConnectedAt
  };
}
function normalizeCandidateTask(candidate) {
  if (!candidate) return null;
  const candidateId = candidate.id ?? candidate.candidate_id ?? candidate.candidateId ?? candidate.candidateID ?? null;
  const candidateName = String(
    candidate.candidateName ?? candidate.candidate_name ?? candidate.name ?? ""
  ).trim();
  const phaseList = normalizePhaseList((candidate == null ? void 0 : candidate.phases) ?? (candidate == null ? void 0 : candidate.phaseList) ?? (candidate == null ? void 0 : candidate.phase) ?? "");
  const teleapoSummary = buildTeleapoSummaryForCandidate(candidateId, candidateName);
  const teleapoPhaseText = teleapoSummary ? resolveCandidatePhaseDisplay({ ...candidate, csSummary: teleapoSummary }) : "";
  const phaseText = teleapoPhaseText || (phaseList.length ? phaseList.join(" / ") : resolveCandidatePhaseDisplay(candidate));
  const validApplication = isValidApplicationCandidate(candidate);
  const registeredAt = candidate.registeredAt ?? candidate.registered_at ?? candidate.createdAt ?? candidate.created_at ?? candidate.createdDate ?? candidate.created_date ?? null;
  const phone = candidate.phone ?? candidate.phone_number ?? candidate.phoneNumber ?? candidate.tel ?? candidate.candidate_phone ?? candidate.mobile ?? candidate.mobilePhone ?? "";
  const contactPreferredTime = normalizeContactPreferredTime(
    candidate.contactPreferredTime ?? candidate.contact_preferred_time ?? candidate.contactTime ?? candidate.contact_time
  );
  const isUncontacted = teleapoSummary ? !(teleapoSummary.hasConnected || teleapoSummary.hasSms || teleapoSummary.callCount > 0) : phaseList.includes("\u672A\u63A5\u89E6") || phaseText === "\u672A\u63A5\u89E6";
  return {
    candidateId,
    candidateName,
    phaseText,
    validApplication,
    registeredAt,
    phone,
    contactPreferredTime,
    isUncontacted
  };
}
function resolveCandidatePhone(candidateId, candidateName) {
  var _a;
  const idNum = Number(candidateId);
  if (Number.isFinite(idNum) && candidatePhoneCache.has(idNum)) {
    return candidatePhoneCache.get(idNum) || "";
  }
  if (!teleapoLogData.length) return "";
  const normalizedName = normalizeNameKey(candidateName);
  let bestTel = "";
  let bestTs = -Infinity;
  for (const log of teleapoLogData) {
    const tel = String(log.tel || "").trim();
    if (!tel) continue;
    if (Number.isFinite(idNum) && idNum > 0) {
      if (Number(log.candidateId) !== idNum) continue;
    } else if (normalizedName) {
      const targetKey = normalizeNameKey(log.target || "");
      if (!targetKey || !targetKey.includes(normalizedName)) continue;
    } else {
      continue;
    }
    const ts = ((_a = parseDateTime(log.datetime)) == null ? void 0 : _a.getTime()) || 0;
    if (ts >= bestTs) {
      bestTs = ts;
      bestTel = tel;
    }
  }
  return bestTel;
}
function rebuildCsTaskCandidates() {
  if (!teleapoCandidateMaster.length) return;
  teleapoCsTaskCandidates = teleapoCandidateMaster.map(normalizeCandidateTask).filter((c) => c && c.validApplication && c.isUncontacted);
  renderCsTaskTable(teleapoCsTaskCandidates);
  rebuildMissingInfoCandidates();
}
function scheduleCandidatePhoneFetch(list) {
  return;
}
function renderCsTaskTable(list, state = {}) {
  const body = document.getElementById("teleapoCsTaskTableBody");
  const countEl = document.getElementById("teleapoCsTaskCount");
  const wrapper = document.getElementById("teleapoCsTaskTableWrapper");
  if (countEl) {
    countEl.textContent = state.loading ? "\u8AAD\u307F\u8FBC\u307F\u4E2D..." : `${list.length}\u4EF6`;
  }
  if (!body) return;
  if (wrapper) wrapper.classList.toggle("hidden", !csTaskExpanded);
  if (state.loading) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-slate-500 py-6">\u8AAD\u307F\u8FBC\u307F\u4E2D...</td>
      </tr>
    `;
    return;
  }
  if (state.error) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-rose-600 py-6">\u5019\u88DC\u8005\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F</td>
      </tr>
    `;
    return;
  }
  if (!csTaskExpanded) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-slate-500 py-6">\u4E00\u89A7\u3092\u958B\u304F\u3068\u5185\u5BB9\u304C\u8868\u793A\u3055\u308C\u307E\u3059</td>
      </tr>
    `;
    return;
  }
  if (!list.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-slate-500 py-6">\u5BFE\u8C61\u306E\u5019\u88DC\u8005\u304C\u3044\u307E\u305B\u3093</td>
      </tr>
    `;
    return;
  }
  body.innerHTML = list.map((row) => {
    const nameLabel = row.candidateName || "-";
    const candidateId = row.candidateId ?? findCandidateIdFromTarget(row.candidateName);
    const phoneValue = row.phone || resolveCandidatePhone(candidateId, row.candidateName);
    const contactTimeValue = normalizeContactPreferredTime(row.contactPreferredTime ?? row.contact_preferred_time ?? row.contactTime ?? row.contact_time) || resolveCandidateContactPreferredTime(candidateId, row.candidateName);
    const contactTimeTextValue = String(contactTimeValue ?? "").trim();
    if (!contactTimeTextValue) enqueueContactTimeFetch(candidateId);
    const contactTimeText = escapeHtml(contactTimeTextValue || "-");
    const dialBtn = candidateId || nameLabel !== "-" ? `<button type="button"
           class="text-xs px-2 py-1 rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
           data-action="prefill-dial"
           data-candidate-id="${escapeHtml(candidateId || "")}"
           data-candidate-name="${escapeHtml(row.candidateName || "")}">
           \u67B6\u96FB\u767B\u9332
         </button>` : `<span class="text-xs text-slate-400">-</span>`;
    const nameCell = nameLabel !== "-" ? `<button type="button"
           class="text-indigo-600 hover:text-indigo-800 underline bg-transparent border-0 p-0"
           data-action="open-candidate"
           data-candidate-id="${escapeHtml(candidateId || "")}"
           data-candidate-name="${escapeHtml(row.candidateName || "")}">${escapeHtml(nameLabel)}</button>` : escapeHtml(nameLabel);
    return `
      <tr>
        <td class="whitespace-nowrap">${escapeHtml(row.phaseText || "-")}</td>
        <td class="whitespace-nowrap">${renderValidApplicationBadge(row.validApplication)}</td>
        <td class="whitespace-nowrap">${nameCell}</td>
        <td class="whitespace-nowrap">${escapeHtml(formatCandidateDateTime(row.registeredAt))}</td>
        <td class="whitespace-nowrap">${escapeHtml(phoneValue || "-")}</td>
        <td class="whitespace-nowrap">${contactTimeText}</td>
        <td class="whitespace-nowrap">${dialBtn}</td>
      </tr>
    `;
  }).join("");
  scheduleCandidatePhoneFetch(list);
}
function parseCandidateDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = String(value).match(/(\d{4})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function calculateAgeFromBirthday2(value) {
  if (!value) return null;
  const date = parseCandidateDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  const today = /* @__PURE__ */ new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || monthDiff === 0 && today.getDate() < date.getDate()) age -= 1;
  return age;
}
function normalizeMissingInfoCandidate(candidate) {
  if (!candidate) return null;
  const candidateId = candidate.id ?? candidate.candidate_id ?? candidate.candidateId ?? candidate.candidateID ?? null;
  const idNum = Number(candidateId);
  const cached = Number.isFinite(idNum) && idNum > 0 ? candidateDetailCache.get(idNum) : null;
  const name = String(
    candidate.candidateName ?? candidate.candidate_name ?? candidate.name ?? ""
  ).trim();
  const registeredAt = candidate.registeredAt ?? candidate.registered_at ?? candidate.createdAt ?? candidate.created_at ?? candidate.createdDate ?? candidate.created_date ?? null;
  const birthday = (cached == null ? void 0 : cached.birthday) ?? candidate.birthday ?? candidate.birth_date ?? candidate.birthDate ?? candidate.birthdate ?? "";
  const ageRaw = (cached == null ? void 0 : cached.age) ?? candidate.age ?? candidate.age_years ?? candidate.ageYears ?? null;
  const ageValue = Number(ageRaw);
  const age = Number.isFinite(ageValue) && ageValue > 0 ? ageValue : calculateAgeFromBirthday2(birthday);
  const phone = (cached == null ? void 0 : cached.phone) ?? candidate.phone ?? candidate.phone_number ?? candidate.phoneNumber ?? candidate.tel ?? candidate.mobile ?? candidate.candidate_phone ?? candidatePhoneCache.get(idNum) ?? "";
  const missingAge = !(Number.isFinite(age) && age > 0);
  const missingPhone = !String(phone ?? "").trim();
  const needsDetail = (missingAge || missingPhone) && Number.isFinite(idNum) && idNum > 0 && !candidateDetailCache.has(idNum);
  if (!missingAge && !missingPhone) return null;
  return {
    candidateId: Number.isFinite(idNum) && idNum > 0 ? idNum : null,
    candidateName: name,
    registeredAt,
    birthday,
    age,
    phone,
    missingAge,
    missingPhone,
    needsDetail
  };
}
function rebuildMissingInfoCandidates() {
  if (!teleapoCandidateMaster.length) {
    renderMissingInfoTable([], { loading: true });
    return;
  }
  teleapoMissingInfoCandidates = teleapoCandidateMaster.map(normalizeMissingInfoCandidate).filter(Boolean);
  renderMissingInfoTable(teleapoMissingInfoCandidates);
}
function renderMissingInfoTable(list, state = {}) {
  const body = document.getElementById("teleapoMissingInfoTableBody");
  const countEl = document.getElementById("teleapoMissingInfoCount");
  const wrapper = document.getElementById("teleapoMissingInfoTableWrapper");
  if (countEl) {
    countEl.textContent = state.loading ? "\u8AAD\u307F\u8FBC\u307F\u4E2D..." : `${list.length}\u4EF6`;
  }
  if (!body) return;
  if (wrapper) wrapper.classList.toggle("hidden", !missingInfoExpanded);
  if (state.loading) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-slate-500 py-6">\u8AAD\u307F\u8FBC\u307F\u4E2D...</td>
      </tr>
    `;
    return;
  }
  if (!list.length) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-slate-500 py-6">\u5BFE\u8C61\u306E\u5019\u88DC\u8005\u304C\u3044\u307E\u305B\u3093</td>
      </tr>
    `;
    return;
  }
  if (!missingInfoExpanded) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-slate-500 py-6">\u4E00\u89A7\u3092\u958B\u304F\u3068\u5185\u5BB9\u304C\u8868\u793A\u3055\u308C\u307E\u3059</td>
      </tr>
    `;
    return;
  }
  if (!missingInfoExpanded && list.length > MISSING_INFO_RENDER_LIMIT) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-slate-500 py-6">
          \u5BFE\u8C61\u304C\u591A\u3044\u305F\u3081\u4E00\u89A7\u3092\u4E00\u6642\u7684\u306B\u975E\u8868\u793A\u306B\u3057\u3066\u3044\u307E\u3059\uFF08${list.length}\u4EF6\uFF09\u3002
          \u53F3\u4E0A\u306E\u300C\u4E00\u89A7\u3092\u958B\u304F\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002
        </td>
      </tr>
    `;
    return;
  }
  const visible = list;
  body.innerHTML = visible.map((row) => {
    const candidateId = row.candidateId ?? findCandidateIdFromTarget(row.candidateName);
    const nameLabel = row.candidateName || "-";
    const nameCell = nameLabel !== "-" ? `<button type="button"
           class="text-indigo-600 hover:text-indigo-800 underline bg-transparent border-0 p-0"
           data-action="open-candidate"
           data-candidate-id="${escapeHtml(candidateId || "")}"
           data-candidate-name="${escapeHtml(row.candidateName || "")}">${escapeHtml(nameLabel)}</button>` : escapeHtml(nameLabel);
    const missingTags = [
      row.missingAge ? "\u5E74\u9F62" : null,
      row.missingPhone ? "\u96FB\u8A71\u756A\u53F7" : null
    ].filter(Boolean);
    const missingHtml = missingTags.map((tag) => `
      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
        ${escapeHtml(tag)}
      </span>
    `).join(" ");
    const ageText = Number.isFinite(row.age) && row.age > 0 ? `${row.age}\u6B73` : "-";
    const phoneText = String(row.phone ?? "").trim() || "-";
    return `
      <tr>
        <td class="whitespace-nowrap">${missingHtml || "-"}</td>
        <td class="whitespace-nowrap">${nameCell}</td>
        <td class="whitespace-nowrap">${escapeHtml(formatCandidateDateTime(row.registeredAt))}</td>
        <td class="whitespace-nowrap">${escapeHtml(ageText)}</td>
        <td class="whitespace-nowrap">${escapeHtml(phoneText)}</td>
      </tr>
    `;
  }).join("");
  scheduleMissingInfoFetch(list);
}
function scheduleMissingInfoFetch(list) {
  if (!Array.isArray(list) || !list.length) return;
  list.forEach((row) => {
    if (!row.needsDetail) return;
    const idNum = Number(row.candidateId);
    if (!Number.isFinite(idNum) || idNum <= 0) return;
    if (candidateDetailCache.has(idNum)) return;
    if (candidateDetailRequests.has(idNum)) return;
    if (missingInfoQueueSet.has(idNum)) return;
    missingInfoQueue.push(idNum);
    missingInfoQueueSet.add(idNum);
  });
  if (!missingInfoQueue.length || missingInfoQueueActive) return;
  processMissingInfoQueue();
}
function processMissingInfoQueue() {
  if (!missingInfoQueue.length) {
    missingInfoQueueActive = false;
    return;
  }
  missingInfoQueueActive = true;
  const batch = missingInfoQueue.splice(0, MISSING_INFO_FETCH_BATCH);
  batch.forEach((idNum) => missingInfoQueueSet.delete(idNum));
  Promise.all(batch.map((idNum) => fetchCandidateDetailInfo(idNum))).then(() => {
    rebuildMissingInfoCandidates();
  }).finally(() => {
    setTimeout(processMissingInfoQueue, MISSING_INFO_FETCH_DELAY_MS);
  });
}
var RESULT_LABELS = {
  connect: "\u901A\u96FB",
  reply: "\u8FD4\u4FE1",
  set: "\u8A2D\u5B9A",
  show: "\u7740\u5EA7",
  callback: "\u30B3\u30FC\u30EB\u30D0\u30C3\u30AF",
  no_answer: "\u4E0D\u5728",
  sms_sent: "SMS\u9001\u4FE1"
};
var TELEAPO_RESULT_FILTER_BASE_ORDER = ["\u901A\u96FB", "\u8FD4\u4FE1", "\u4E0D\u5728", "\u8A2D\u5B9A", "\u7740\u5EA7", "\u30B3\u30FC\u30EB\u30D0\u30C3\u30AF", "SMS\u9001\u4FE1"];
var TELEAPO_LOGS_PER_PAGE = 30;
var TELEAPO_LOG_PAGINATION_MAX_BUTTONS = 7;
var teleapoLogData = [];
var teleapoPendingLogs = [];
var teleapoMissingInfoCandidates = [];
var teleapoFilteredLogs = [];
var teleapoLogPage = 1;
var teleapoEmployeeMetrics = [];
var teleapoSummaryScope = { type: "company", name: "\u5168\u4F53" };
var teleapoEmployeeTrendMode = "month";
var teleapoAnalysisRange = "all";
var teleapoHeatmapUser = "all";
var teleapoLogSort = { key: "datetime", dir: "desc" };
var teleapoEmployeeSortState = { key: "connectRate", dir: "desc" };
var teleapoHighlightLogId = null;
var teleapoHighlightFingerprint = null;
var employeeNameToUserId = /* @__PURE__ */ new Map();
var teleapoRangeTouched = false;
var teleapoAutoFallbackDone = false;
var teleapoActivePreset = "thisMonth";
var dialFormCurrentUser = { name: "", userId: null };
function resolveResultFilterLabel(log) {
  const flags = classifyTeleapoResult(log);
  if (flags.code === "show") return "\u7740\u5EA7";
  if (flags.code === "set") return "\u8A2D\u5B9A";
  if (flags.code === "connect") return "\u901A\u96FB";
  if (flags.code === "reply") return "\u8FD4\u4FE1";
  if (flags.code === "callback") return "\u30B3\u30FC\u30EB\u30D0\u30C3\u30AF";
  if (flags.code === "no_answer") return "\u4E0D\u5728";
  if (flags.code === "sms_sent") {
    return normalizeRoute(log == null ? void 0 : log.route) === ROUTE_TEL ? "\u4E0D\u5728" : "SMS\u9001\u4FE1";
  }
  const raw = String((log == null ? void 0 : log.result) || (log == null ? void 0 : log.resultCode) || "").trim();
  return raw || "";
}
function refreshTeleapoLogFilterOptions(logs = teleapoLogData) {
  const source = Array.isArray(logs) ? logs : [];
  const employeeSelect = document.getElementById("teleapoLogEmployeeFilter");
  if (employeeSelect) {
    const previous = String(employeeSelect.value || "").trim();
    const employees = Array.from(
      new Set(
        source.map((log) => String((log == null ? void 0 : log.employee) || "").trim()).filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "ja"));
    employeeSelect.innerHTML = [
      '<option value="">\u5168\u54E1</option>',
      ...employees.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    ].join("");
    employeeSelect.value = previous && employees.includes(previous) ? previous : "";
  }
  const resultSelect = document.getElementById("teleapoLogResultFilter");
  if (resultSelect) {
    const previous = String(resultSelect.value || "").trim();
    const labels = Array.from(
      new Set(
        source.map(resolveResultFilterLabel).filter(Boolean)
      )
    );
    const known = TELEAPO_RESULT_FILTER_BASE_ORDER.filter((label) => labels.includes(label));
    const extras = labels.filter((label) => !TELEAPO_RESULT_FILTER_BASE_ORDER.includes(label)).sort((a, b) => a.localeCompare(b, "ja"));
    const ordered = [...known, ...extras];
    resultSelect.innerHTML = [
      '<option value="">\u5168\u3066</option>',
      ...ordered.map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`)
    ].join("");
    resultSelect.value = previous && ordered.includes(previous) ? previous : "";
  }
}
function resolveDialFormCurrentUser() {
  const session = getSession();
  const user = (session == null ? void 0 : session.user) || {};
  const name = String(
    user.name ?? user.fullName ?? user.displayName ?? (session == null ? void 0 : session.name) ?? ""
  ).trim();
  const rawId = user.id ?? user.userId ?? (session == null ? void 0 : session.userId) ?? (session == null ? void 0 : session.id);
  const idNum = Number(rawId);
  return {
    name,
    userId: Number.isFinite(idNum) && idNum > 0 ? idNum : null
  };
}
function syncDialFormCurrentUser() {
  dialFormCurrentUser = resolveDialFormCurrentUser();
  const employeeName = dialFormCurrentUser.name || "";
  const dialInput = document.getElementById("dialFormEmployee");
  if (dialInput) dialInput.value = employeeName;
  const smsInput = document.getElementById("smsFormEmployee");
  if (smsInput) smsInput.value = employeeName;
  refreshCandidateDatalist();
}
function resolveDialFormEmployeeName() {
  var _a;
  const inputValue = String(((_a = document.getElementById("dialFormEmployee")) == null ? void 0 : _a.value) || "").trim();
  if (inputValue) return inputValue;
  return dialFormCurrentUser.name || "";
}
function resolveDialFormCallerUserId(employeeName) {
  if (Number.isFinite(dialFormCurrentUser.userId) && dialFormCurrentUser.userId > 0) {
    return dialFormCurrentUser.userId;
  }
  const mappedId = Number(employeeNameToUserId.get(employeeName));
  if (Number.isFinite(mappedId) && mappedId > 0) {
    return mappedId;
  }
  return null;
}
function rebuildEmployeeMap() {
  employeeNameToUserId = /* @__PURE__ */ new Map();
  for (const l of teleapoLogData) {
    if (l.employee && Number.isFinite(l.callerUserId)) {
      employeeNameToUserId.set(l.employee, l.callerUserId);
    }
  }
}
var teleapoInitialMockLogs = [
  // 同じターゲットに複数回架電した例（1回目不在→2回目通電）
  { datetime: "2025/11/25 09:10", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "ABC\u793E \u7530\u4E2D\u69D8", tel: "03-1111-1111", email: "tanaka@abc.co.jp", resultCode: "no_answer", memo: "1\u56DE\u76EE \u4E0D\u5728" },
  { datetime: "2025/11/25 10:00", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "ABC\u793E \u7530\u4E2D\u69D8", tel: "03-1111-1111", email: "tanaka@abc.co.jp", resultCode: "connect", memo: "\u63D0\u6848\u5185\u5BB9\u3092\u8AAC\u660E" },
  { datetime: "2025/11/25 11:30", employee: "\u9234\u6728", route: ROUTE_TEL, target: "XYZ\u793E \u9234\u6728\u69D8", tel: "03-2222-2222", email: "suzuki@xyz.co.jp", resultCode: "set", memo: "12/2 15:00 \u5546\u8AC7\u8A2D\u5B9A" },
  { datetime: "2025/11/25 14:10", employee: "\u9AD8\u6A4B", route: ROUTE_TEL, target: "DEF\u793E \u4F50\u3005\u6728\u69D8", tel: "03-3333-3333", email: "sasaki@def.jp", resultCode: "no_answer", memo: "\u518D\u67B6\u96FB\u5E0C\u671B" },
  { datetime: "2025/11/25 15:45", employee: "\u7530\u4E2D", route: ROUTE_TEL, target: "GHI\u793E \u9AD8\u6A4B\u69D8", tel: "03-4444-4444", email: "takahashi@ghi.jp", resultCode: "show", memo: "\u6765\u793E\u78BA\u5B9A" },
  { datetime: "2025/11/24 09:20", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "JKL\u793E \u5C71\u7530\u69D8", tel: "03-5555-5555", email: "yamada@jkl.jp", resultCode: "callback", memo: "\u5348\u5F8C\u6298\u8FD4\u3057" },
  // 3回目で通電した例
  { datetime: "2025/11/24 12:00", employee: "\u9AD8\u6A4B", route: ROUTE_TEL, target: "PQR\u793E \u4E2D\u6751\u69D8", tel: "03-6666-6666", email: "nakamura@pqr.jp", resultCode: "no_answer", memo: "1\u56DE\u76EE \u4E0D\u5728" },
  { datetime: "2025/11/24 13:20", employee: "\u9AD8\u6A4B", route: ROUTE_TEL, target: "PQR\u793E \u4E2D\u6751\u69D8", tel: "03-6666-6666", email: "nakamura@pqr.jp", resultCode: "callback", memo: "2\u56DE\u76EE \u6298\u8FD4\u3057\u5F85\u3061" },
  { datetime: "2025/11/24 13:50", employee: "\u9AD8\u6A4B", route: ROUTE_TEL, target: "PQR\u793E \u4E2D\u6751\u69D8", tel: "03-6666-6666", email: "nakamura@pqr.jp", resultCode: "connect", memo: "\u8AB2\u984C\u30D2\u30A2\u30EA\u30F3\u30B0" },
  { datetime: "2025/11/24 16:30", employee: "\u7530\u4E2D", route: ROUTE_TEL, target: "STU\u793E \u4F50\u85E4\u69D8", tel: "03-7777-7777", email: "sato@stu.jp", resultCode: "set", memo: "12/4 10:00 \u5546\u8AC7" },
  { datetime: "2025/11/23 10:40", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "VWX\u793E \u5C0F\u6797\u69D8", tel: "03-8888-8888", email: "kobayashi@vwx.jp", resultCode: "connect", memo: "\u62C5\u5F53\u7D39\u4ECB" },
  { datetime: "2025/11/23 14:00", employee: "\u9234\u6728", route: ROUTE_OTHER, target: "YZA\u793E \u9AD8\u7530\u69D8", tel: "", email: "takada@yza.jp", resultCode: "show", memo: "\u30AA\u30F3\u30E9\u30A4\u30F3\u9762\u8AC7" },
  { datetime: "2025/11/22 09:15", employee: "\u9AD8\u6A4B", route: ROUTE_TEL, target: "NEXT \u5C71\u672C\u69D8", tel: "03-9999-9999", email: "abe@next.jp", resultCode: "connect", memo: "\u8CC7\u6599\u9001\u4ED8" },
  { datetime: "2025/11/22 15:05", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "INSIGHT \u5C71\u4E0B\u69D8", tel: "03-1212-1212", email: "yamashita@insight.jp", resultCode: "set", memo: "11/29 15:00 \u4E88\u5B9A" },
  { datetime: "2025/11/21 10:50", employee: "\u9234\u6728", route: ROUTE_TEL, target: "JOINT \u5DE5\u85E4\u69D8", tel: "03-1313-1313", email: "kudo@joint.jp", resultCode: "show", memo: "\u6765\u793E\u6E08\u307F" },
  { datetime: "2025/11/21 16:20", employee: "\u7530\u4E2D", route: ROUTE_TEL, target: "LEAD \u6C60\u7530\u69D8", tel: "03-1414-1414", email: "ikeda@lead.jp", resultCode: "connect", memo: "\u30D5\u30A9\u30ED\u30FC\u4E2D" },
  // 10月以前のモック（期間広げてもグラフが埋まるように）
  { datetime: "2025/10/05 11:00", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "OLD\u793E \u4F50\u85E4\u69D8", tel: "03-2020-2020", email: "old1@example.jp", resultCode: "no_answer", memo: "1\u56DE\u76EE \u4E0D\u5728" },
  { datetime: "2025/10/06 14:00", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "OLD\u793E \u4F50\u85E4\u69D8", tel: "03-2020-2020", email: "old1@example.jp", resultCode: "connect", memo: "2\u56DE\u76EE \u901A\u96FB" },
  { datetime: "2025/09/28 09:30", employee: "\u9234\u6728", route: ROUTE_TEL, target: "LEGACY\u793E \u5C71\u53E3\u69D8", tel: "03-3030-3030", email: "legacy@example.jp", resultCode: "callback", memo: "1\u56DE\u76EE \u6298\u8FD4\u3057\u5F85\u3061" },
  { datetime: "2025/09/30 10:10", employee: "\u9234\u6728", route: ROUTE_TEL, target: "LEGACY\u793E \u5C71\u53E3\u69D8", tel: "03-3030-3030", email: "legacy@example.jp", resultCode: "show", memo: "2\u56DE\u76EE \u7740\u5EA7" },
  // 9?7月もカバーし、社員別の時系列グラフが長めに動くように追加
  { datetime: "2025/09/12 15:30", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "HIST\u793E \u4F50\u3005\u6728\u69D8", tel: "03-1515-1515", email: "sasaki@hist.jp", resultCode: "connect", memo: "9\u6708\u4E2D\u65EC \u901A\u96FB" },
  { datetime: "2025/09/05 10:30", employee: "\u9AD8\u6A4B", route: ROUTE_TEL, target: "HIST\u793E \u5C71\u4E0B\u69D8", tel: "03-1616-1616", email: "yamashita@hist.jp", resultCode: "set", memo: "9\u6708\u4E0A\u65EC \u8A2D\u5B9A" },
  { datetime: "2025/08/25 11:00", employee: "\u9234\u6728", route: ROUTE_TEL, target: "SUMMER\u793E \u4F50\u4F2F\u69D8", tel: "03-1717-1717", email: "saeki@summer.jp", resultCode: "callback", memo: "8\u6708\u4E0B\u65EC \u6298\u8FD4\u3057\u5F85\u3061" },
  { datetime: "2025/08/18 16:00", employee: "\u7530\u4E2D", route: ROUTE_TEL, target: "SUMMER\u793E \u658E\u85E4\u69D8", tel: "03-1818-1818", email: "saito@summer.jp", resultCode: "show", memo: "8\u6708\u4E2D\u65EC \u7740\u5EA7" },
  { datetime: "2025/08/02 09:15", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "SUMMER\u793E \u6C5F\u53E3\u69D8", tel: "03-1919-1919", email: "eguchi@summer.jp", resultCode: "no_answer", memo: "8\u6708\u521D\u65EC \u4E0D\u5728" },
  { datetime: "2025/07/22 14:30", employee: "\u9AD8\u6A4B", route: ROUTE_TEL, target: "RAINY\u793E \u5CA9\u7530\u69D8", tel: "03-2021-2021", email: "iwata@rainy.jp", resultCode: "connect", memo: "7\u6708\u4E0B\u65EC \u901A\u96FB" },
  { datetime: "2025/07/10 13:10", employee: "\u7530\u4E2D", route: ROUTE_TEL, target: "RAINY\u793E \u4E09\u6D66\u69D8", tel: "03-2121-2121", email: "miura@rainy.jp", resultCode: "set", memo: "7\u6708\u4E2D\u65EC \u8A2D\u5B9A" },
  { datetime: "2025/07/05 10:40", employee: "\u9234\u6728", route: ROUTE_TEL, target: "RAINY\u793E \u6E21\u8FBA\u69D8", tel: "03-2221-2221", email: "watanabe@rainy.jp", resultCode: "show", memo: "7\u6708\u521D\u65EC \u7740\u5EA7" },
  // 上期のモック（グラフを月単位でも確認できるように更に拡張）
  { datetime: "2025/06/18 11:40", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "EARLY\u793E \u6CB3\u5408\u69D8", tel: "03-2323-2323", email: "kawai@early.jp", resultCode: "connect", memo: "6\u6708\u4E2D\u65EC \u901A\u96FB" },
  { datetime: "2025/06/07 16:20", employee: "\u9AD8\u6A4B", route: ROUTE_TEL, target: "EARLY\u793E \u5927\u897F\u69D8", tel: "03-2424-2424", email: "onishi@early.jp", resultCode: "callback", memo: "6\u6708\u521D\u65EC \u6298\u8FD4\u3057\u5F85\u3061" },
  { datetime: "2025/05/27 09:50", employee: "\u9234\u6728", route: ROUTE_TEL, target: "MAY\u793E \u4E95\u4E0A\u69D8", tel: "03-2525-2525", email: "inoue@may.jp", resultCode: "set", memo: "5\u6708\u672B \u8A2D\u5B9A" },
  { datetime: "2025/05/15 14:05", employee: "\u7530\u4E2D", route: ROUTE_TEL, target: "MAY\u793E \u6728\u6751\u69D8", tel: "03-2626-2626", email: "kimura@may.jp", resultCode: "show", memo: "5\u6708\u4E2D\u65EC \u7740\u5EA7" },
  { datetime: "2025/04/22 10:25", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "SPRING\u793E \u91CE\u6751\u69D8", tel: "03-2727-2727", email: "nomura@spring.jp", resultCode: "connect", memo: "4\u6708\u4E0B\u65EC \u901A\u96FB" },
  { datetime: "2025/04/05 15:35", employee: "\u9234\u6728", route: ROUTE_TEL, target: "SPRING\u793E \u5927\u8C37\u69D8", tel: "03-2828-2828", email: "otani@spring.jp", resultCode: "no_answer", memo: "4\u6708\u521D\u65EC \u4E0D\u5728" },
  { datetime: "2025/03/18 11:10", employee: "\u9AD8\u6A4B", route: ROUTE_TEL, target: "MARCH\u793E \u4F50\u91CE\u69D8", tel: "03-2929-2929", email: "sano@march.jp", resultCode: "set", memo: "3\u6708\u4E2D\u65EC \u8A2D\u5B9A" },
  { datetime: "2025/02/09 09:40", employee: "\u7530\u4E2D", route: ROUTE_TEL, target: "WINTER\u793E \u5343\u8449\u69D8", tel: "03-3031-3031", email: "chiba@winter.jp", resultCode: "connect", memo: "2\u6708\u521D\u65EC \u901A\u96FB" },
  { datetime: "2024/12/12 13:00", employee: "\u4F50\u85E4", route: ROUTE_TEL, target: "XMAS\u793E \u6749\u5C71\u69D8", tel: "03-3131-3131", email: "sugiyama@xmas.jp", resultCode: "show", memo: "12\u6708 \u7740\u5EA7" }
];
function parseDateTime(dateTimeStr) {
  if (!dateTimeStr) return null;
  const [datePart, timePart = "00:00"] = dateTimeStr.split(" ");
  const [y, m, d] = (datePart || "").split("/");
  const [hh = "00", mm = "00"] = (timePart || "").split(":");
  if (!y || !m || !d) return null;
  return /* @__PURE__ */ new Date(`${y}-${m}-${d}T${hh}:${mm}:00`);
}
function normalizeResultCode(raw) {
  const t = (raw || "").toString().toLowerCase();
  if (t.includes("show") || t.includes("\u7740\u5EA7")) return "show";
  if (t.includes("set") || t.includes("\u8A2D\u5B9A") || t.includes("\u30A2\u30DD") || t.includes("\u9762\u8AC7")) return "set";
  if (t.includes("reply") || t.includes("\u8FD4\u4FE1")) return "reply";
  if (t.includes("callback") || t.includes("\u30B3\u30FC\u30EB\u30D0\u30C3\u30AF") || t.includes("\u6298\u8FD4") || t.includes("\u6298\u308A\u8FD4")) return "callback";
  if (t.includes("no_answer") || t.includes("\u4E0D\u5728")) return "no_answer";
  if (t.includes("connect") || t.includes("\u901A\u96FB")) return "connect";
  if (t.includes("sms")) return "sms_sent";
  return t || "";
}
function normalizeRoute(raw) {
  const t = (raw || "").toString().toLowerCase();
  if (t.includes("other") || t.includes("\u305D\u306E\u4ED6")) return ROUTE_OTHER;
  if (t.includes("sms") || t.includes("mail") || t.includes("\u30E1\u30FC\u30EB") || t.includes("line")) return ROUTE_OTHER;
  if (t.includes("tel") || t.includes("call") || t.includes("\u96FB\u8A71")) return ROUTE_TEL;
  return ROUTE_TEL;
}
function normalizeLog(log) {
  const rawResult = log.result || log.resultRaw || "";
  const resultCode = normalizeResultCode(log.resultCode || rawResult);
  return {
    ...log,
    route: normalizeRoute(log.route),
    resultCode,
    result: RESULT_LABELS[resultCode] || rawResult || ""
  };
}
function isSameTeleapoLog(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && String(a.id) === String(b.id)) return true;
  if (!a.datetime || !b.datetime) return false;
  if (a.employee && b.employee && a.employee !== b.employee) return false;
  if (a.datetime !== b.datetime) return false;
  if (a.candidateId && b.candidateId && Number(a.candidateId) === Number(b.candidateId)) return true;
  const aKey = normalizeNameKey(a.target || "");
  const bKey = normalizeNameKey(b.target || "");
  return aKey && bKey && aKey === bKey;
}
function findCandidateEntry(candidateId, candidateName) {
  if (!teleapoCandidateMaster.length) return null;
  const idText = candidateId ? String(candidateId) : "";
  const nameKey = normalizeNameKey(candidateName || "");
  let candidate = null;
  if (idText) {
    candidate = teleapoCandidateMaster.find((c) => String(c.id ?? c.candidate_id ?? c.candidateId ?? c.candidateID) === idText) || null;
  }
  if (!candidate && nameKey) {
    candidate = teleapoCandidateMaster.find((c) => normalizeNameKey(c.candidateName ?? c.candidate_name ?? c.name ?? "") === nameKey) || null;
  }
  if (!candidate && candidateName) {
    const resolvedId = findCandidateIdFromTarget(candidateName);
    if (resolvedId) {
      const resolvedIdText = String(resolvedId);
      candidate = teleapoCandidateMaster.find((c) => String(c.id ?? c.candidate_id ?? c.candidateId ?? c.candidateID) === resolvedIdText) || null;
    }
  }
  return candidate;
}
function resolveCandidateContact(candidateId, candidateName) {
  const candidate = findCandidateEntry(candidateId, candidateName);
  if (!candidate) return { tel: "", email: "" };
  const tel = (candidate == null ? void 0 : candidate.phone) ?? (candidate == null ? void 0 : candidate.phone_number) ?? (candidate == null ? void 0 : candidate.phoneNumber) ?? (candidate == null ? void 0 : candidate.tel) ?? (candidate == null ? void 0 : candidate.mobile) ?? (candidate == null ? void 0 : candidate.candidate_phone) ?? "";
  const email = (candidate == null ? void 0 : candidate.email) ?? (candidate == null ? void 0 : candidate.candidate_email) ?? (candidate == null ? void 0 : candidate.mail) ?? "";
  return { tel, email };
}
function resolveCandidateContactPreferredTime(candidateId, candidateName) {
  let idNum = Number(candidateId);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    const resolved = findCandidateIdFromTarget(candidateName);
    idNum = Number(resolved);
  }
  if (Number.isFinite(idNum) && idNum > 0) {
    const cached = candidateDetailCache.get(idNum);
    const cachedTime = normalizeContactPreferredTime(
      (cached == null ? void 0 : cached.contactPreferredTime) ?? (cached == null ? void 0 : cached.contact_preferred_time) ?? (cached == null ? void 0 : cached.contactTime) ?? (cached == null ? void 0 : cached.contact_time)
    );
    if (cachedTime) {
      return cachedTime;
    }
  }
  const candidate = findCandidateEntry(candidateId, candidateName);
  const time = normalizeContactPreferredTime(
    (candidate == null ? void 0 : candidate.contactPreferredTime) ?? (candidate == null ? void 0 : candidate.contact_preferred_time) ?? (candidate == null ? void 0 : candidate.contactTime) ?? (candidate == null ? void 0 : candidate.contact_time)
  );
  return time;
}
function buildPendingTeleapoLog({
  id,
  candidateId,
  candidateName,
  calledAt,
  employee,
  route,
  result,
  memo,
  callerUserId
}) {
  const contact = resolveCandidateContact(candidateId, candidateName);
  const contactPreferredTime = resolveCandidateContactPreferredTime(candidateId, candidateName);
  return normalizeLog({
    id: id != null && id !== "" ? String(id) : void 0,
    datetime: toDateTimeString(calledAt) || "",
    employee: employee || "",
    route,
    target: candidateName || "",
    tel: contact.tel || "",
    email: contact.email || "",
    contactPreferredTime,
    resultRaw: result || "",
    memo: memo || "",
    candidateId: Number.isFinite(candidateId) && candidateId > 0 ? candidateId : void 0,
    callerUserId: Number.isFinite(callerUserId) && callerUserId > 0 ? callerUserId : void 0
  });
}
function addPendingTeleapoLog(log) {
  if (!log || !log.datetime) return;
  const exists = teleapoPendingLogs.some((p) => isSameTeleapoLog(p, log));
  if (!exists) teleapoPendingLogs.unshift(log);
}
function mergePendingLogs(baseLogs) {
  if (!teleapoPendingLogs.length) return baseLogs;
  const merged = [...baseLogs];
  const stillPending = [];
  for (const pending of teleapoPendingLogs) {
    const exists = merged.some((l) => isSameTeleapoLog(l, pending));
    if (!exists) {
      merged.unshift(pending);
      stillPending.push(pending);
    }
  }
  teleapoPendingLogs = stillPending;
  return merged;
}
function classifyTeleapoResult(log) {
  const code = normalizeResultCode(log.resultCode || log.result);
  const attendanceConfirmed = resolveAttendanceConfirmed(log);
  const interviewDate = resolveCandidateInterviewDate(log);
  const isShow = code === "show" || code === "set" && attendanceConfirmed;
  const meetingLabel = interviewDate ? `\u9762\u8AC7(${formatShortMonthDay(interviewDate)})` : "\u9762\u8AC7";
  const flowLabels = code === "set" || code === "show" ? ["\u901A\u96FB", meetingLabel].concat(isShow ? ["\u7740\u5EA7"] : []) : null;
  const displayLabel = flowLabels ? flowLabels.join("\u2192") : RESULT_LABELS[code] || log.result || "";
  return {
    isConnect: ["connect", "reply", "set", "show", "callback"].includes(code),
    // 既存の通電判定（後方互換）
    isConnectPlusSet: ["connect", "reply", "callback", "set", "show"].includes(code),
    // 通電率定義用: 通電＋設定
    isSet: ["set", "show"].includes(code),
    isShow,
    code,
    attendanceConfirmed,
    interviewDate,
    flowLabels,
    displayLabel
  };
}
function zeroPad(n) {
  return `${n}`.padStart(2, "0");
}
function toDateTimeString(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return `${value}`;
  return `${d.getFullYear()}/${zeroPad(d.getMonth() + 1)}/${zeroPad(d.getDate())} ${zeroPad(d.getHours())}:${zeroPad(d.getMinutes())}`;
}
function buildLogHighlightFingerprint(candidateId, calledAt, callerUserId, candidateName) {
  const ts = new Date(calledAt).getTime();
  if (!Number.isFinite(ts)) return null;
  const candidateNum = Number(candidateId);
  const hasCandidateId = Number.isFinite(candidateNum) && candidateNum > 0;
  const name = (candidateName || "").trim();
  if (!hasCandidateId && !name) return null;
  const callerNum = Number(callerUserId);
  return {
    candidateId: hasCandidateId ? candidateNum : null,
    candidateName: name || null,
    callerUserId: Number.isFinite(callerNum) ? callerNum : null,
    timestampMs: ts
  };
}
function setLogHighlightTarget({ id, candidateId, calledAt, callerUserId, candidateName }) {
  teleapoLogPage = 1;
  teleapoHighlightLogId = id != null && id !== "" ? String(id) : null;
  teleapoHighlightFingerprint = teleapoHighlightLogId ? null : buildLogHighlightFingerprint(candidateId, calledAt, callerUserId, candidateName);
}
function shouldHighlightLog(row) {
  if (teleapoHighlightLogId && (row == null ? void 0 : row.id) != null && String(row.id) === teleapoHighlightLogId) return true;
  if (!teleapoHighlightFingerprint) return false;
  const fp = teleapoHighlightFingerprint;
  if (fp.candidateId != null) {
    const rowCandidate = Number(row == null ? void 0 : row.candidateId);
    if (!Number.isFinite(rowCandidate) || rowCandidate !== fp.candidateId) return false;
  } else if (fp.candidateName) {
    const rowName = ((row == null ? void 0 : row.target) || "").trim();
    if (!rowName || rowName !== fp.candidateName) return false;
  } else {
    return false;
  }
  if (fp.callerUserId && (row == null ? void 0 : row.callerUserId) && Number(row.callerUserId) !== fp.callerUserId) return false;
  const rowTime = parseDateTime(row == null ? void 0 : row.datetime);
  if (!rowTime) return false;
  const diffMs = Math.abs(rowTime.getTime() - fp.timestampMs);
  return diffMs <= 5 * 60 * 1e3;
}
function clearLogHighlightTarget() {
  teleapoHighlightLogId = null;
  teleapoHighlightFingerprint = null;
}
function ensureLogHighlightStyles() {
  if (document.getElementById("teleapo-log-highlight-style")) return;
  const style = document.createElement("style");
  style.id = "teleapo-log-highlight-style";
  style.textContent = `
    @keyframes teleapo-log-highlight {
      0% { background-color: #fef3c7; }
      70% { background-color: #fff7ed; }
      100% { background-color: transparent; }
    }
    .teleapo-log-highlight td {
      animation: teleapo-log-highlight 2.4s ease-out;
    }
  `;
  document.head.appendChild(style);
}
function mapApiLog(log = {}) {
  const id = log.id ?? log.log_id ?? log.logId ?? log.logID;
  const rawDatetime = log.datetime || log.called_at || log.calledAt || log.call_at;
  const employee = log.employee || log.caller_name || log.caller || log.user_name || "";
  const datetime = toDateTimeString(rawDatetime) || (rawDatetime ? String(rawDatetime) : "");
  const candidateIdRaw = log.candidate_id ?? log.candidateId ?? log.candidateID;
  const candidateId = candidateIdRaw === void 0 || candidateIdRaw === null || candidateIdRaw === "" ? void 0 : Number(candidateIdRaw);
  const callerUserIdRaw = log.caller_user_id ?? log.callerUserId;
  const callerUserIdNum = callerUserIdRaw === void 0 || callerUserIdRaw === null || callerUserIdRaw === "" ? void 0 : Number(callerUserIdRaw);
  const target = log.target || log.candidate_name || log.candidateName || log.company_name || "";
  const tel = log.candidate_phone || log.candidatePhone || log.phone || log.tel || "";
  const email = log.candidate_email || log.candidateEmail || log.email || "";
  const contactPreferredTime = normalizeContactPreferredTime(
    log.contactPreferredTime ?? log.contact_preferred_time ?? log.contactTime ?? log.contact_time
  );
  const rawResult = log.result || log.result_code || log.status || log.outcome || "";
  const resultCode = normalizeResultCode(log.resultCode || rawResult);
  const memo = log.memo || log.note || "";
  const route = normalizeRoute(log.route || log.route_type || log.channel || "");
  const callNo = Number(log.call_no || log.callNo || log.call_number || log.callNoNumber);
  return normalizeLog({
    id: id != null && id !== "" ? String(id) : void 0,
    datetime,
    employee,
    route,
    target,
    tel,
    email,
    contactPreferredTime,
    resultRaw: rawResult,
    resultCode,
    memo,
    candidateId: Number.isFinite(candidateId) && candidateId > 0 ? candidateId : void 0,
    callerUserId: Number.isFinite(callerUserIdNum) && callerUserIdNum > 0 ? callerUserIdNum : void 0,
    // ★追加
    callAttempt: Number.isFinite(callNo) && callNo > 0 ? callNo : void 0
  });
}
function getCallKey(log) {
  if (log.candidateId) return log.candidateId;
  const targetKey = normalizeNameKey(log.target || "");
  return targetKey || log.tel || log.email || "\u4E0D\u660E";
}
function getStageCountKey(log) {
  const base = getCallKey(log);
  if (base && base !== "\u4E0D\u660E") return String(base);
  const id = String((log == null ? void 0 : log.id) || "").trim();
  if (id) return `log:${id}`;
  const datetime = String((log == null ? void 0 : log.datetime) || "").trim();
  const employee = String((log == null ? void 0 : log.employee) || "").trim();
  const target = normalizeNameKey((log == null ? void 0 : log.target) || "");
  const route = normalizeRoute((log == null ? void 0 : log.route) || "");
  const code = normalizeResultCode((log == null ? void 0 : log.resultCode) || (log == null ? void 0 : log.result) || "");
  return `fallback:${route}|${target}|${employee}|${datetime}|${code}`;
}
function annotateCallAttempts(logs) {
  const telLogs = logs.filter((l) => l.route === ROUTE_TEL);
  const sorted = [...telLogs].sort((a, b) => {
    var _a, _b;
    return (((_a = parseDateTime(a.datetime)) == null ? void 0 : _a.getTime()) || 0) - (((_b = parseDateTime(b.datetime)) == null ? void 0 : _b.getTime()) || 0);
  });
  const counters = /* @__PURE__ */ new Map();
  sorted.forEach((log) => {
    const key = getCallKey(log);
    const next = (counters.get(key) || 0) + 1;
    counters.set(key, next);
    log.callAttempt = next;
  });
  logs.filter((l) => l.route !== ROUTE_TEL).forEach((log) => {
    if ("callAttempt" in log) delete log.callAttempt;
  });
  rebuildTeleapoSummaryCache(logs);
}
function rebuildTeleapoSummaryCache(logs) {
  teleapoSummaryByCandidateId = /* @__PURE__ */ new Map();
  teleapoSummaryByName = /* @__PURE__ */ new Map();
  if (!Array.isArray(logs) || !logs.length) return;
  const updateSummary = (map, key, log, flags, ts) => {
    if (!key && key !== 0) return;
    const current = map.get(key) || { callCount: 0, hasConnected: false, hasSms: false, lastConnectedAt: null, lastConnectedTs: -Infinity };
    if (log.route === ROUTE_TEL) current.callCount += 1;
    if (flags.code === "sms_sent") current.hasSms = true;
    if (flags.isConnect) {
      current.hasConnected = true;
      if (ts >= current.lastConnectedTs) {
        current.lastConnectedTs = ts;
        current.lastConnectedAt = log.datetime;
      }
    }
    map.set(key, current);
  };
  logs.forEach((log) => {
    var _a;
    const flags = classifyTeleapoResult(log);
    const ts = ((_a = parseDateTime(log.datetime)) == null ? void 0 : _a.getTime()) || 0;
    const idNum = Number(log.candidateId);
    if (Number.isFinite(idNum) && idNum > 0) {
      updateSummary(teleapoSummaryByCandidateId, idNum, log, flags, ts);
    }
    const targetKey = normalizeNameKey(log.target || "");
    if (targetKey) {
      updateSummary(teleapoSummaryByName, targetKey, log, flags, ts);
    }
  });
}
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function setLogStatus(message, type = "info") {
  const el = document.getElementById("teleapoLogStatus");
  if (!el) return;
  const baseClass = "text-[11px]";
  const colorClass = type === "success" ? "text-emerald-600" : type === "error" ? "text-rose-600" : "text-slate-500";
  el.className = `${baseClass} ${colorClass}`;
  el.textContent = message || "";
  if (message) {
    const current = message;
    window.setTimeout(() => {
      if (el.textContent === current) {
        el.textContent = "";
        el.className = `${baseClass} text-slate-500`;
      }
    }, 3e3);
  }
}
function formatRate(rate) {
  if (rate == null || Number.isNaN(rate)) return "-";
  return `${rate.toFixed(1)}%`;
}
function formatRangeLabel(startStr, endStr) {
  if (teleapoActivePreset) {
    const presetLabels = {
      today: "\u4ECA\u65E5",
      thisWeek: "\u4ECA\u9031",
      thisMonth: "\u4ECA\u6708"
    };
    if (presetLabels[teleapoActivePreset]) {
      return presetLabels[teleapoActivePreset];
    }
  }
  if (!startStr && !endStr) return "\u5168\u671F\u9593";
  if (startStr && endStr) return `${startStr.replace(/-/g, "/")} \uFF5E ${endStr.replace(/-/g, "/")}`;
  if (startStr) return `${startStr.replace(/-/g, "/")} \uFF5E`;
  return `\uFF5E ${endStr.replace(/-/g, "/")}`;
}
function addDaysToDateString(dateStr, days) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${zeroPad(dt.getMonth() + 1)}-${zeroPad(dt.getDate())}`;
}
function rateClass(rate, targetKey) {
  if (!targetKey || !teleapoRateTargets[targetKey]) return "text-slate-900";
  const targetRate = Number(teleapoRateTargets[targetKey]);
  if (!Number.isFinite(targetRate) || targetRate <= 0) return "text-slate-900";
  const percentage = rate / targetRate * 100;
  if (percentage >= 100) return "text-green-700";
  if (percentage >= 80) return "text-amber-600";
  return "text-red-600";
}
function getShowDenominator(sets, contacts) {
  return teleapoRateMode === TELEAPO_RATE_MODE_STEP ? sets : contacts;
}
function calcShowRate(shows, sets, contacts, nullIfZero = false) {
  const denom = getShowDenominator(sets, contacts);
  if (!denom) return nullIfZero ? null : 0;
  return shows / denom * 100;
}
function buildSummaryKpiDesc() {
  const denomLabel = teleapoRateMode === TELEAPO_RATE_MODE_STEP ? "\u8A2D\u5B9A\u6570" : "\u63A5\u89E6\u6570";
  return `\u8A2D\u5B9A\u7387=\u8A2D\u5B9A\u6570/\u63A5\u89E6\u6570\u30FB\u7740\u5EA7\u7387=\u7740\u5EA7\u6570/${denomLabel}`;
}
function buildEmployeeKpiDesc() {
  const denomLabel = teleapoRateMode === TELEAPO_RATE_MODE_STEP ? "\u8A2D\u5B9A\u6570" : "\u901A\u96FB\u6570";
  return `\u901A\u96FB\u7387=\u901A\u96FB\u6570/\u67B6\u96FB\u6570\u30FB\u8A2D\u5B9A\u7387=\u8A2D\u5B9A\u6570/\u901A\u96FB\u6570\u30FB\u7740\u5EA7\u7387=\u7740\u5EA7\u6570/${denomLabel}`;
}
function updateRateModeUI() {
  const toggle = document.getElementById("teleapoRateModeToggle");
  if (toggle) {
    toggle.querySelectorAll("[data-rate-mode]").forEach((btn) => {
      const mode = btn.dataset.rateMode;
      const isActive = mode === teleapoRateMode;
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      setTeleapoButtonActive(btn, isActive);
      btn.classList.toggle("bg-indigo-600", isActive);
      btn.classList.toggle("text-white", isActive);
      btn.classList.toggle("shadow-sm", isActive);
      btn.classList.toggle("text-slate-600", !isActive);
    });
  }
  const desc = document.getElementById("teleapoKpiCalcDesc");
  if (desc) desc.textContent = buildSummaryKpiDesc();
  const empDesc = document.getElementById("teleapoEmployeeCalcDesc");
  if (empDesc) empDesc.textContent = buildEmployeeKpiDesc();
}
function initRateModeToggle() {
  const toggle = document.getElementById("teleapoRateModeToggle");
  if (!toggle) return;
  toggle.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-rate-mode]");
    if (!btn) return;
    const nextMode = btn.dataset.rateMode === TELEAPO_RATE_MODE_STEP ? TELEAPO_RATE_MODE_STEP : TELEAPO_RATE_MODE_CONTACT;
    if (nextMode === teleapoRateMode) return;
    teleapoRateMode = nextMode;
    updateRateModeUI();
    applyFilters();
  });
  updateRateModeUI();
}
function computeKpi(logs) {
  const tel = { attempts: 0, contacts: 0, contactsPlusSets: 0, sets: 0, shows: 0 };
  const other = { attempts: 0, contacts: 0, contactsPlusSets: 0, sets: 0, shows: 0 };
  const telSetKeys = /* @__PURE__ */ new Set();
  const telShowKeys = /* @__PURE__ */ new Set();
  const otherSetKeys = /* @__PURE__ */ new Set();
  const otherShowKeys = /* @__PURE__ */ new Set();
  const totalSetKeys = /* @__PURE__ */ new Set();
  const totalShowKeys = /* @__PURE__ */ new Set();
  logs.forEach((log) => {
    const isOtherRoute = log.route === ROUTE_OTHER;
    const bucket = isOtherRoute ? other : tel;
    const flags = classifyTeleapoResult(log);
    const stageKey = getStageCountKey(log);
    bucket.attempts += 1;
    if (flags.isConnect) bucket.contacts += 1;
    if (flags.isConnectPlusSet) bucket.contactsPlusSets += 1;
    if (flags.isSet && stageKey) {
      const targetSet = isOtherRoute ? otherSetKeys : telSetKeys;
      if (!targetSet.has(stageKey)) {
        targetSet.add(stageKey);
        bucket.sets += 1;
      }
      totalSetKeys.add(stageKey);
    }
    if (flags.isShow && stageKey) {
      const targetShow = isOtherRoute ? otherShowKeys : telShowKeys;
      if (!targetShow.has(stageKey)) {
        targetShow.add(stageKey);
        bucket.shows += 1;
      }
      totalShowKeys.add(stageKey);
    }
  });
  const total = {
    attempts: tel.attempts + other.attempts,
    contacts: tel.contacts + other.contacts,
    contactsPlusSets: tel.contactsPlusSets + other.contactsPlusSets,
    sets: totalSetKeys.size,
    shows: totalShowKeys.size
  };
  return { tel, other, total };
}
function computeRates(counts) {
  const contactRate = counts.attempts > 0 ? (counts.contactsPlusSets ?? counts.contacts) / counts.attempts * 100 : null;
  const setRate = counts.contacts > 0 ? counts.sets / counts.contacts * 100 : null;
  const showRate = calcShowRate(counts.shows, counts.sets, counts.contacts, true);
  return { contactRate, setRate, showRate };
}
function renderSummary(logs, titleText, scopeLabelText) {
  const kpi = computeKpi(logs);
  const telRates = computeRates(kpi.tel);
  const otherRates = computeRates(kpi.other);
  const totalRates = computeRates(kpi.total);
  setText("teleapoSummaryTitle", titleText || "\u5168\u4F53KPI");
  setText("teleapoSummaryScopeLabel", scopeLabelText || "\u5168\u4F53");
  updateRateModeUI();
  setTextWithRateColor("teleapoKpiContactRateTel", telRates.contactRate, "teleapoConnectionRate");
  setTextWithRateColor("teleapoKpiContactRateOther", otherRates.contactRate, "teleapoConnectionRate");
  setTextWithRateColor("teleapoKpiContactRateTotal", totalRates.contactRate, "teleapoConnectionRate");
  setTextWithRateColor("teleapoKpiSetRateTel", telRates.setRate, "teleapoSetupRate");
  setTextWithRateColor("teleapoKpiSetRateOther", otherRates.setRate, "teleapoSetupRate");
  setTextWithRateColor("teleapoKpiSetRateTotal", totalRates.setRate, "teleapoSetupRate");
  const showRateTargetKey = teleapoRateMode === TELEAPO_RATE_MODE_STEP ? "teleapoAttendanceRate" : "teleapoAttendanceRateContact";
  setTextWithRateColor("teleapoKpiShowRateTel", telRates.showRate, showRateTargetKey);
  setTextWithRateColor("teleapoKpiShowRateOther", otherRates.showRate, showRateTargetKey);
  setTextWithRateColor("teleapoKpiShowRateTotal", totalRates.showRate, showRateTargetKey);
  setText("teleapoKpiDialsTel", kpi.tel.attempts.toLocaleString());
  setText("teleapoKpiContactsTel", kpi.tel.contacts.toLocaleString());
  setText("teleapoKpiContactsOther", kpi.other.contacts.toLocaleString());
  setText("teleapoKpiContactsTotal", kpi.total.contacts.toLocaleString());
  setText("teleapoKpiSetsTel", kpi.tel.sets.toLocaleString());
  setText("teleapoKpiSetsOther", kpi.other.sets.toLocaleString());
  setText("teleapoKpiSetsTotal", kpi.total.sets.toLocaleString());
  setText("teleapoKpiShowsTel", kpi.tel.shows.toLocaleString());
  setText("teleapoKpiShowsOther", kpi.other.shows.toLocaleString());
  setText("teleapoKpiShowsTotal", kpi.total.shows.toLocaleString());
}
function setTextWithRateColor(id, rate, targetKey) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = formatRate(rate);
  el.textContent = text;
  el.classList.remove("text-green-700", "text-amber-600", "text-red-600", "text-slate-900", "text-slate-800");
  if (rate == null || Number.isNaN(rate)) {
    el.classList.add("text-slate-900");
    return;
  }
  const targetRate = Number(teleapoRateTargets[targetKey]);
  if (!Number.isFinite(targetRate) || targetRate <= 0) {
    el.classList.add("text-slate-900");
    return;
  }
  const percentage = rate / targetRate * 100;
  if (percentage >= 100) el.classList.add("text-green-700");
  else if (percentage >= 80) el.classList.add("text-amber-600");
  else el.classList.add("text-red-600");
}
function computeEmployeeMetrics(logs) {
  const telLogs = logs.filter((l) => l.route === ROUTE_TEL);
  const map = /* @__PURE__ */ new Map();
  telLogs.forEach((log) => {
    const name = log.employee || "\u672A\u8A2D\u5B9A";
    const flags = classifyTeleapoResult(log);
    if (!map.has(name)) {
      map.set(name, { dials: 0, connects: 0, sets: 0, shows: 0, _setKeys: /* @__PURE__ */ new Set(), _showKeys: /* @__PURE__ */ new Set() });
    }
    const rec = map.get(name);
    const stageKey = getStageCountKey(log);
    rec.dials += 1;
    if (flags.isConnect) rec.connects += 1;
    if (flags.isSet && stageKey && !rec._setKeys.has(stageKey)) {
      rec._setKeys.add(stageKey);
      rec.sets += 1;
    }
    if (flags.isShow && stageKey && !rec._showKeys.has(stageKey)) {
      rec._showKeys.add(stageKey);
      rec.shows += 1;
    }
  });
  return Array.from(map.entries()).map(([name, rec]) => {
    const connectRate = rec.dials > 0 ? rec.connects / rec.dials * 100 : 0;
    const setRate = rec.connects > 0 ? rec.sets / rec.connects * 100 : 0;
    const showRate = calcShowRate(rec.shows, rec.sets, rec.connects);
    return { name, ...rec, connectRate, setRate, showRate };
  });
}
function renderEmployeeTable(metrics) {
  const tbody = document.getElementById("teleapoEmployeeTableBody");
  if (!tbody) return;
  const sortedMetrics = sortEmployeeMetrics(metrics, `${teleapoEmployeeSortState.key}-${teleapoEmployeeSortState.dir}`);
  tbody.innerHTML = sortedMetrics.map((emp) => {
    const connectClass = rateClass(emp.connectRate, "teleapoConnectionRate");
    const setClass = rateClass(emp.setRate, "teleapoSetupRate");
    const showClass = rateClass(emp.showRate, "teleapoAttendanceRate");
    return `
      <tr class="teleapo-employee-row hover:bg-slate-50 cursor-pointer" data-employee-name="${emp.name}">
        <td class="font-medium text-slate-800">${emp.name}</td>
        <td class="text-right">${emp.dials}</td>
        <td class="text-right">${emp.connects}</td>
        <td class="text-right">${emp.sets}</td>
        <td class="text-right">${emp.shows}</td>
        <td class="text-right font-semibold ${connectClass}">${emp.connectRate.toFixed(1)}%</td>
        <td class="text-right font-semibold ${setClass}">${emp.setRate.toFixed(1)}%</td>
        <td class="text-right font-semibold ${showClass}">${emp.showRate.toFixed(1)}%</td>
      </tr>
    `;
  }).join("");
  updateEmployeeSortIndicators();
  attachEmployeeRowHandlers();
}
function attachEmployeeRowHandlers() {
  const rows = document.querySelectorAll(".teleapo-employee-row");
  rows.forEach((row) => {
    const name = row.dataset.employeeName;
    row.onclick = () => {
      const isCurrent = teleapoSummaryScope.type === "employee" && teleapoSummaryScope.name === name;
      teleapoSummaryScope = isCurrent ? { type: "company", name: "\u5168\u4F53" } : { type: "employee", name };
      applyFilters();
    };
  });
  const resetBtn = document.getElementById("teleapoSummaryResetBtn");
  if (resetBtn) resetBtn.onclick = () => {
    teleapoSummaryScope = { type: "company", name: "\u5168\u4F53" };
    clearDateFilters();
    applyFilters();
  };
}
function sortEmployeeMetrics(metrics, sortValue) {
  const [key, dir] = sortValue.split("-");
  const factor = dir === "asc" ? 1 : -1;
  const data = [...metrics];
  data.sort((a, b) => {
    if (key === "name") return factor * a.name.localeCompare(b.name, "ja");
    return factor * ((a[key] || 0) - (b[key] || 0));
  });
  return data;
}
function initEmployeeSortHeaders() {
  const headers = document.querySelectorAll("#teleapoEmployeeTableWrapper th[data-sort]");
  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (!key) return;
      if (teleapoEmployeeSortState.key === key) {
        teleapoEmployeeSortState.dir = teleapoEmployeeSortState.dir === "asc" ? "desc" : "asc";
      } else {
        teleapoEmployeeSortState = { key, dir: "asc" };
      }
      renderEmployeeTable(teleapoEmployeeMetrics);
    });
  });
  updateEmployeeSortIndicators();
}
function updateEmployeeSortIndicators() {
  const headers = document.querySelectorAll("#teleapoEmployeeTableWrapper th[data-sort]");
  headers.forEach((th) => {
    const isActive = teleapoEmployeeSortState.key === th.dataset.sort;
    const dir = isActive ? teleapoEmployeeSortState.dir : "";
    th.classList.toggle("is-sorted", isActive);
    if (dir) {
      th.dataset.sortDir = dir;
      th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
    } else {
      th.removeAttribute("data-sort-dir");
      th.setAttribute("aria-sort", "none");
    }
  });
}
function initEmployeeTrendModeControls() {
  const container = document.getElementById("teleapoEmployeeTrendMode");
  if (!container) return;
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-employee-trend-mode]");
    if (!button) return;
    const mode = button.dataset.employeeTrendMode;
    if (!mode || mode === teleapoEmployeeTrendMode) return;
    setEmployeeTrendMode(mode);
  });
  updateEmployeeTrendModeButtons();
}
function setEmployeeTrendMode(mode) {
  teleapoEmployeeTrendMode = mode;
  updateEmployeeTrendModeButtons();
  if (teleapoSummaryScope.type === "employee") {
    renderEmployeeTrendChart(teleapoSummaryScope.name, teleapoFilteredLogs);
  }
}
function updateEmployeeTrendModeButtons() {
  document.querySelectorAll("[data-employee-trend-mode]").forEach((btn) => {
    const isActive = btn.dataset.employeeTrendMode === teleapoEmployeeTrendMode;
    setTeleapoButtonActive(btn, isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}
function renderHeatmap(logs) {
  const tbody = document.getElementById("teleapoHeatmapTableBody");
  if (!tbody) return;
  const buckets = {};
  TELEAPO_HEATMAP_DAYS.forEach((day) => {
    buckets[day] = {};
    TELEAPO_HEATMAP_SLOTS.forEach((slot) => {
      buckets[day][slot] = { dials: 0, connects: 0 };
    });
  });
  logs.filter((l) => l.route === ROUTE_TEL).forEach((log) => {
    const dt = parseDateTime(log.datetime);
    if (!dt) return;
    const day = "\u65E5\u6708\u706B\u6C34\u6728\u91D1\u571F"[dt.getDay()];
    if (!buckets[day]) return;
    const hour = dt.getHours();
    const slot = hour < 11 ? "09-11" : hour < 13 ? "11-13" : hour < 15 ? "13-15" : hour < 17 ? "15-17" : hour < 19 ? "17-19" : null;
    if (!slot) return;
    const flags = classifyTeleapoResult(log);
    const cell = buckets[day][slot];
    cell.dials += 1;
    if (flags.isConnect) cell.connects += 1;
  });
  tbody.innerHTML = TELEAPO_HEATMAP_SLOTS.map((slot) => {
    const cells = TELEAPO_HEATMAP_DAYS.map((day) => {
      const c = buckets[day][slot];
      const rate = c.dials ? c.connects / c.dials * 100 : null;
      const intensity = rate == null ? "bg-white" : rate >= 70 ? "bg-green-100" : rate >= 40 ? "bg-amber-50" : "bg-rose-50";
      const rateText = rate == null ? "-" : `${rate.toFixed(0)}%`;
      const countText = rate == null ? "" : `(${c.dials}-${c.connects})`;
      return `
        <td class="px-2 py-2 border border-slate-200 text-center ${intensity}">
          <div class="teleapo-heatmap-cell">
            <span class="teleapo-heatmap-rate">${rateText}</span>
            <span class="teleapo-heatmap-count">${countText}</span>
          </div>
        </td>
      `;
    }).join("");
    return `<tr><th class="px-3 py-2 border border-slate-200 text-left bg-slate-50">${slot}\u5E2F</th>${cells}</tr>`;
  }).join("");
}
function buildHeatmapInsight(logs, scopeLabel) {
  const telLogs = logs.filter((l) => l.route === ROUTE_TEL);
  if (!telLogs.length) return null;
  const buckets = /* @__PURE__ */ new Map();
  const allowedDays = new Set(TELEAPO_HEATMAP_DAYS);
  let totalDials = 0;
  let totalConnects = 0;
  const addBucket = (day, slot) => {
    const key = `${day}-${slot}`;
    if (!buckets.has(key)) buckets.set(key, { day, slot, dials: 0, connects: 0 });
    return buckets.get(key);
  };
  telLogs.forEach((log) => {
    const dt = parseDateTime(log.datetime);
    if (!dt) return;
    const day = "\u65E5\u6708\u706B\u6C34\u6728\u91D1\u571F"[dt.getDay()];
    if (!allowedDays.has(day)) return;
    const hour = dt.getHours();
    const slot = hour < 11 ? "09-11" : hour < 13 ? "11-13" : hour < 15 ? "13-15" : hour < 17 ? "15-17" : hour < 19 ? "17-19" : null;
    if (!slot) return;
    const flags = classifyTeleapoResult(log);
    const bucket = addBucket(day, slot);
    bucket.dials += 1;
    totalDials += 1;
    if (flags.isConnect) {
      bucket.connects += 1;
      totalConnects += 1;
    }
  });
  const baselineRate = totalDials ? totalConnects / totalDials * 100 : 0;
  const minSamples = Math.max(5, Math.ceil(totalDials * 0.05));
  const priorWeight = 6;
  const ranked = Array.from(buckets.values()).map((b) => {
    const rate = b.dials ? b.connects / b.dials * 100 : null;
    const smoothed = b.dials ? (b.connects + baselineRate / 100 * priorWeight) / (b.dials + priorWeight) * 100 : null;
    const lift = rate == null ? null : rate - baselineRate;
    const smoothedLift = smoothed == null ? null : smoothed - baselineRate;
    const score = smoothedLift == null ? -Infinity : smoothedLift * Math.sqrt(b.dials);
    return { ...b, rate, smoothed, lift, score };
  }).filter((b) => b.rate != null && b.dials >= minSamples).sort((a, b) => b.score - a.score || b.dials - a.dials);
  if (!ranked.length || totalDials < minSamples) {
    return { type: "lowSample", scopeLabel, baselineRate, totalDials, minSamples };
  }
  const best = ranked[0];
  if (best.lift != null && best.lift >= 6) {
    return { type: "lift", ...best, scopeLabel, baselineRate, totalDials, minSamples };
  }
  const byVolume = ranked.slice().sort((a, b) => b.dials - a.dials)[0];
  return { type: "volume", ...byVolume, scopeLabel, baselineRate, totalDials, minSamples };
}
function buildAttemptInsight(logs) {
  const { buckets, average } = computeAttemptDistribution(logs);
  if (!buckets.length) return null;
  const totalDials = buckets.reduce((s, b) => s + (b.reached || 0), 0);
  const totalConnects = buckets.reduce((s, b) => s + (b.connected || 0), 0);
  const baselineRate = totalDials ? totalConnects / totalDials * 100 : 0;
  const minSamples = Math.max(5, Math.ceil(totalDials * 0.05));
  const priorWeight = 4;
  const ranked = buckets.map((b) => {
    const smoothed = b.reached ? (b.connected + baselineRate / 100 * priorWeight) / (b.reached + priorWeight) * 100 : null;
    const lift = smoothed == null ? null : smoothed - baselineRate;
    const score = lift == null ? -Infinity : lift * Math.sqrt(b.reached);
    return { ...b, smoothed, lift, score };
  }).filter((b) => b.rate != null && b.reached >= minSamples).sort((a, b) => b.score - a.score || b.reached - a.reached);
  if (!ranked.length) return null;
  const best = ranked[0];
  if (best.lift != null && best.lift >= 3) {
    return { ...best, average };
  }
  return { ...best, average, lowSignal: true };
}
function updateTeleapoInsight(logs, scope) {
  const el = document.getElementById("teleapoInsightText");
  if (!el) return;
  const telLogs = logs.filter((l) => l.route === ROUTE_TEL);
  if (!telLogs.length) {
    el.textContent = "\u30C7\u30FC\u30BF\u304C\u307E\u3060\u5C11\u306A\u3081\u3067\u3059\uFF01\u30ED\u30B0\u3092\u5897\u3084\u305B\u3070\u52DD\u3061\u30D1\u30BF\u30FC\u30F3\u304C\u898B\u3048\u3066\u304D\u307E\u3059\u3088\uFF01";
    return;
  }
  const scopeLabel = (scope == null ? void 0 : scope.scopeLabel) || "\u5168\u4F53";
  const attempt = buildAttemptInsight(logs);
  const heatmap = buildHeatmapInsight(logs, scopeLabel);
  if (attempt && heatmap && heatmap.type === "lift") {
    const lift = Math.round(heatmap.lift || 0);
    const rateText = Number.isFinite(heatmap.rate) ? `${heatmap.rate.toFixed(0)}%` : "-";
    const baseText = Number.isFinite(heatmap.baselineRate) ? `${heatmap.baselineRate.toFixed(0)}%` : "-";
    const dials = heatmap.dials || 0;
    const connects = heatmap.connects || 0;
    const sampleNote = heatmap.minSamples ? `\uFF08\u6BCD\u6570${heatmap.minSamples}\u4EF6\u4EE5\u4E0A\u306E\u4E2D\u3067\uFF09` : "";
    el.textContent = `\u901A\u96FB\u306F${attempt.attempt}\u56DE\u76EE\u304C\u52DD\u8CA0\uFF01${heatmap.scopeLabel}\u306E${heatmap.day}${heatmap.slot}\u5E2F\u306F\u901A\u96FB\u7387${rateText}\uFF08${connects}/${dials}\u4EF6\uFF09\u3067\u5E73\u5747${baseText}\u3088\u308A${lift}\u30DD\u30A4\u30F3\u30C8\u9AD8\u3044${sampleNote}\u305F\u3081\u3001\u3053\u3053\u3092\u96C6\u4E2D\u653B\u7565\u3057\u307E\u3057\u3087\u3046\uFF01`;
    return;
  }
  if (attempt && heatmap && heatmap.type === "volume") {
    el.textContent = `\u901A\u96FB\u306F${attempt.attempt}\u56DE\u76EE\u304C\u52DD\u8CA0\uFF01${heatmap.scopeLabel}\u306E${heatmap.day}${heatmap.slot}\u5E2F\u304C\u6BCD\u6570\u6700\u591A\uFF08${heatmap.dials}\u4EF6\uFF09\u306A\u306E\u3067\u3001\u3053\u3053\u3092\u5E95\u4E0A\u3052\u3059\u308B\u3068\u4F38\u3073\u307E\u3059\uFF01`;
    return;
  }
  if (attempt && heatmap && heatmap.type === "lowSample") {
    el.textContent = `\u901A\u96FB\u306F${attempt.attempt}\u56DE\u76EE\u304C\u52DD\u8CA0\uFF01\u30D2\u30FC\u30C8\u30DE\u30C3\u30D7\u306F\u6BCD\u6570\u304C\u5C11\u306A\u3081\u306A\u306E\u3067\u3001\u307E\u305A\u4EF6\u6570\u3092\u7A4D\u307F\u4E0A\u3052\u307E\u3057\u3087\u3046\uFF01`;
    return;
  }
  if (attempt) {
    const baseText = `${attempt.attempt}\u56DE\u76EE\u306E\u901A\u96FB\u7387\u304C${attempt.rate.toFixed(0)}%\uFF01`;
    el.textContent = attempt.lowSignal ? `${baseText} \u305F\u3060\u3057\u5DEE\u306F\u5C0F\u3055\u3081\u306A\u306E\u3067\u3001\u307E\u305A\u306F\u6BCD\u6570\u3092\u5897\u3084\u3057\u3066\u7CBE\u5EA6\u3092\u4E0A\u3052\u307E\u3057\u3087\u3046\uFF01` : `${baseText} \u7C98\u308A\u304C\u7D50\u679C\u306B\u3064\u306A\u304C\u3063\u3066\u3044\u307E\u3059\u3001\u3042\u3068\u4E00\u62BC\u3057\u884C\u304D\u307E\u3057\u3087\u3046\uFF01`;
    return;
  }
  if (heatmap && heatmap.type === "lift") {
    const lift = Math.round(heatmap.lift || 0);
    const rateText = Number.isFinite(heatmap.rate) ? `${heatmap.rate.toFixed(0)}%` : "-";
    const baseText = Number.isFinite(heatmap.baselineRate) ? `${heatmap.baselineRate.toFixed(0)}%` : "-";
    const dials = heatmap.dials || 0;
    const connects = heatmap.connects || 0;
    const sampleNote = heatmap.minSamples ? `\uFF08\u6BCD\u6570${heatmap.minSamples}\u4EF6\u4EE5\u4E0A\u306E\u4E2D\u3067\uFF09` : "";
    el.textContent = `${heatmap.scopeLabel}\u306E${heatmap.day}${heatmap.slot}\u5E2F\u306F\u901A\u96FB\u7387${rateText}\uFF08${connects}/${dials}\u4EF6\uFF09\u3067\u5E73\u5747${baseText}\u3088\u308A${lift}\u30DD\u30A4\u30F3\u30C8\u9AD8\u304F\u597D\u8ABF${sampleNote}\uFF01\u3053\u306E\u6642\u9593\u5E2F\u3092\u653B\u3081\u3066\u4F38\u3070\u3057\u307E\u3057\u3087\u3046\uFF01`;
    return;
  }
  if (heatmap && heatmap.type === "volume") {
    el.textContent = `${heatmap.scopeLabel}\u306E${heatmap.day}${heatmap.slot}\u5E2F\u304C\u6BCD\u6570\u6700\u591A\uFF08${heatmap.dials}\u4EF6\uFF09\uFF01\u3053\u3053\u3092\u78E8\u3051\u3070\u5168\u4F53\u304C\u4F38\u3073\u307E\u3059\uFF01`;
    return;
  }
  if (heatmap && heatmap.type === "lowSample") {
    el.textContent = "\u30D2\u30FC\u30C8\u30DE\u30C3\u30D7\u306F\u6BCD\u6570\u304C\u5C11\u306A\u3081\u3067\u3059\uFF01\u307E\u305A\u306F\u4EF6\u6570\u3092\u5897\u3084\u3057\u3066\u52DD\u3061\u6642\u9593\u5E2F\u3092\u898B\u3064\u3051\u307E\u3057\u3087\u3046\uFF01";
    return;
  }
  el.textContent = "\u50BE\u5411\u304C\u307E\u3060\u51FA\u3066\u3044\u307E\u305B\u3093\uFF01\u307E\u305A\u306F\u6BCD\u6570\u3092\u5897\u3084\u3057\u3066\u3001\u52DD\u3061\u7B4B\u3092\u63B4\u307F\u307E\u3057\u3087\u3046\uFF01";
}
function getHeatmapUsers(logs = []) {
  const names = /* @__PURE__ */ new Set();
  (Array.isArray(logs) ? logs : []).forEach((log) => {
    const name = String((log == null ? void 0 : log.employee) || "").trim();
    if (name) names.add(name);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, "ja"));
}
function renderHeatmapUserToggles(logs) {
  const container = document.getElementById("teleapoHeatmapUserToggles");
  if (!container) return;
  const users = getHeatmapUsers(logs);
  if (teleapoHeatmapUser !== "all" && !users.includes(teleapoHeatmapUser)) {
    teleapoHeatmapUser = "all";
  }
  if (!users.length) {
    container.innerHTML = '<span class="text-xs text-slate-400">\u5BFE\u8C61\u30E6\u30FC\u30B6\u30FC\u304C\u3044\u307E\u305B\u3093</span>';
    return;
  }
  const items = ["all", ...users].map((name) => {
    const label = name === "all" ? "\u5168\u4F53" : name;
    const isActive = teleapoHeatmapUser === name;
    return `
      <button type="button" class="teleapo-filter-btn ${isActive ? "active" : ""}" data-heatmap-user="${escapeHtml(name)}" aria-pressed="${isActive ? "true" : "false"}">
        ${escapeHtml(label)}
      </button>
    `;
  });
  container.innerHTML = items.join("");
}
function getAnalysisScope(logs) {
  const employeeFilter = teleapoHeatmapUser || "all";
  const scopeLabel = employeeFilter === "all" ? "\u5168\u4F53" : `${employeeFilter}\u3055\u3093`;
  let scopedLogs = employeeFilter === "all" ? logs : logs.filter((l) => l.employee === employeeFilter);
  const dates = scopedLogs.map((l) => parseDateTime(l.datetime)).filter(Boolean).sort((a, b) => a - b);
  if (!dates.length) {
    return { logs: [], from: null, to: null, label: "", scopeLabel };
  }
  const maxDate = dates[dates.length - 1];
  const minDate = dates[0];
  const from = new Date(maxDate);
  if (teleapoAnalysisRange === "1w") from.setDate(maxDate.getDate() - 7);
  else if (teleapoAnalysisRange === "1m") from.setDate(maxDate.getDate() - 30);
  else if (teleapoAnalysisRange === "6m") from.setDate(maxDate.getDate() - 182);
  else from.setTime(minDate.getTime());
  if (from < minDate) from.setTime(minDate.getTime());
  scopedLogs = scopedLogs.filter((log) => {
    const dt = parseDateTime(log.datetime);
    return dt && dt >= from && dt <= maxDate;
  });
  const fromStr = from.toISOString().slice(0, 10).replace(/-/g, "/");
  const toStr = maxDate.toISOString().slice(0, 10).replace(/-/g, "/");
  return { logs: scopedLogs, from, to: maxDate, label: `${fromStr} \uFF5E ${toStr}`, scopeLabel };
}
function renderLogPagination(totalCount, totalPages, startIndex, endIndex) {
  const container = document.getElementById("teleapoLogPagination");
  if (!container) return;
  if (!Number.isFinite(totalCount) || totalCount <= 0) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }
  const from = Math.max(1, startIndex + 1);
  const to = Math.max(from, endIndex);
  const summary = `${from}-${to} / ${totalCount}\u4EF6`;
  if (!Number.isFinite(totalPages) || totalPages <= 1) {
    container.innerHTML = `<div class="teleapo-log-pagination-summary">${summary}</div>`;
    container.style.display = "flex";
    return;
  }
  const maxButtons = Math.max(3, TELEAPO_LOG_PAGINATION_MAX_BUTTONS);
  let startPage = Math.max(1, teleapoLogPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  startPage = Math.max(1, endPage - maxButtons + 1);
  const pageButtons = [];
  for (let page = startPage; page <= endPage; page += 1) {
    const isActive = page === teleapoLogPage;
    pageButtons.push(`
      <button
        type="button"
        class="teleapo-log-page-btn ${isActive ? "is-active" : ""}"
        data-log-page="${page}"
        aria-current="${isActive ? "page" : "false"}"
      >${page}</button>
    `);
  }
  const isFirstPage = teleapoLogPage <= 1;
  const isLastPage = teleapoLogPage >= totalPages;
  container.innerHTML = `
    <div class="teleapo-log-pagination-summary">${summary}</div>
    <div class="teleapo-log-pagination-controls">
      <button type="button" class="teleapo-log-page-btn" data-log-page="${teleapoLogPage - 1}" ${isFirstPage ? "disabled" : ""}>\u524D\u3078</button>
      ${pageButtons.join("")}
      <button type="button" class="teleapo-log-page-btn" data-log-page="${teleapoLogPage + 1}" ${isLastPage ? "disabled" : ""}>\u6B21\u3078</button>
    </div>
  `;
  container.style.display = "flex";
}
function renderLogTable() {
  const tbody = document.getElementById("teleapoLogTableBody");
  if (!tbody) return;
  const sorted = [...teleapoFilteredLogs].sort((a, b) => {
    if (teleapoLogSort.key === "datetime") {
      const ad = parseDateTime(a.datetime) || 0;
      const bd = parseDateTime(b.datetime) || 0;
      return teleapoLogSort.dir === "asc" ? ad - bd : bd - ad;
    }
    const valA = a[teleapoLogSort.key] || "";
    const valB = b[teleapoLogSort.key] || "";
    return teleapoLogSort.dir === "asc" ? `${valA}`.localeCompare(`${valB}`) : `${valB}`.localeCompare(`${valA}`);
  });
  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / TELEAPO_LOGS_PER_PAGE));
  if (!Number.isFinite(teleapoLogPage) || teleapoLogPage < 1) teleapoLogPage = 1;
  if (teleapoLogPage > totalPages) teleapoLogPage = totalPages;
  const startIndex = (teleapoLogPage - 1) * TELEAPO_LOGS_PER_PAGE;
  const pageRows = sorted.slice(startIndex, startIndex + TELEAPO_LOGS_PER_PAGE);
  const endIndex = startIndex + pageRows.length;
  tbody.innerHTML = pageRows.map((row) => {
    const flags = classifyTeleapoResult(row);
    const badgeClass = flags.code === "show" ? "bg-green-100 text-green-700" : flags.code === "set" ? "bg-emerald-100 text-emerald-700" : flags.code === "connect" ? "bg-blue-100 text-blue-700" : flags.code === "reply" ? "bg-cyan-100 text-cyan-700" : flags.code === "callback" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700";
    const attemptLabel = row.callAttempt ? `\uFF08${row.callAttempt}\u56DE\u76EE\uFF09` : "";
    const routeLabel = row.route === ROUTE_OTHER ? "\u305D\u306E\u4ED6" : `\u67B6\u96FB${attemptLabel}`;
    const targetLabel = row.target || "";
    const targetText = escapeHtml(targetLabel);
    const resolvedCandidateId = resolveCandidateIdFromLog(row);
    if (resolvedCandidateId && !row.candidateId) {
      row.candidateId = resolvedCandidateId;
    }
    const targetCandidateId = resolvedCandidateId || row.candidateId;
    const targetCell = targetLabel ? `<button type="button"
           class="text-indigo-600 hover:text-indigo-800 underline bg-transparent border-0 p-0"
           data-action="open-candidate"
           data-candidate-id="${escapeHtml(targetCandidateId || "")}"
           data-candidate-name="${escapeHtml(targetLabel)}">${targetText}</button>` : targetText;
    const telText = escapeHtml(row.tel || "");
    const contactTimeValue = normalizeContactPreferredTime(row.contactPreferredTime ?? row.contact_preferred_time ?? row.contactTime ?? row.contact_time) || resolveCandidateContactPreferredTime(targetCandidateId || row.candidateId, targetLabel);
    const contactTimeTextValue = String(contactTimeValue ?? "").trim();
    if (!contactTimeTextValue) enqueueContactTimeFetch(targetCandidateId || row.candidateId);
    const contactTimeText = escapeHtml(contactTimeTextValue || "-");
    const emailText = escapeHtml(row.email || "");
    const memoText = escapeHtml(row.memo || "");
    const isHighlight = shouldHighlightLog(row);
    const rowClass = isHighlight ? "teleapo-log-highlight" : "";
    const rowIdAttr = row.id ? `data-log-id="${escapeHtml(String(row.id))}"` : "";
    const deleteCell = row.id ? `<button type="button" class="px-2 py-1 rounded text-xs border border-rose-200 text-rose-600 hover:bg-rose-50"
           data-action="delete-log" data-log-id="${escapeHtml(String(row.id))}">\u524A\u9664</button>` : `<span class="text-xs text-slate-400">-</span>`;
    return `
      <tr class="${rowClass}" ${rowIdAttr}>
        <td class="whitespace-nowrap">${escapeHtml(row.datetime)}</td>
        <td class="whitespace-nowrap">${escapeHtml(row.employee || "")}</td>
        <td>${escapeHtml(routeLabel)}</td>
        <td>${targetCell}</td>
        <td>${telText}</td>
        <td class="whitespace-nowrap">${contactTimeText}</td>
        <td>${emailText}</td>
        <td>
          ${flags.flowLabels ? `
            <div class="flex flex-wrap items-center gap-1">
              ${flags.flowLabels.map((label, index) => {
      const variantClass = label.startsWith("\u901A\u96FB") ? "bg-blue-100 text-blue-700" : label.startsWith("\u9762\u8AC7") ? "bg-emerald-100 text-emerald-700" : label === "\u7740\u5EA7" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700";
      const arrow = index < flags.flowLabels.length - 1 ? '<span class="text-slate-400 text-xs">\u2192</span>' : "";
      return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold ${variantClass}">${escapeHtml(label)}</span>${arrow}`;
    }).join("")}
            </div>
          ` : `<span class="px-2 py-1 rounded text-xs font-semibold ${badgeClass}">
              ${escapeHtml(flags.displayLabel || RESULT_LABELS[flags.code] || row.result || "")}
            </span>`}
        </td>
        <td>${memoText}</td>
        <td class="text-center">${deleteCell}</td>
      </tr>
    `;
  }).join("");
  const highlightRow = tbody.querySelector(".teleapo-log-highlight");
  if (highlightRow) {
    window.setTimeout(() => highlightRow.classList.remove("teleapo-log-highlight"), 2400);
    clearLogHighlightTarget();
  }
  const countEl = document.getElementById("teleapoLogFilterCount");
  if (countEl) countEl.textContent = `${teleapoFilteredLogs.length}\u4EF6`;
  renderLogPagination(totalCount, totalPages, startIndex, endIndex);
}
async function deleteTeleapoLog(logId) {
  const res = await fetch(TELEAPO_LOGS_URL, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: logId })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
}
function computeAttemptDistribution(logs) {
  const telLogs = [...logs].filter((l) => l.route === ROUTE_TEL).sort((a, b) => parseDateTime(a.datetime) - parseDateTime(b.datetime));
  const counters = /* @__PURE__ */ new Map();
  telLogs.forEach((log) => {
    const key = getCallKey(log);
    const current = counters.get(key) || 0;
    const attempt = Number.isFinite(log.callAttempt) && log.callAttempt > 0 ? log.callAttempt : current + 1;
    counters.set(key, Math.max(current, attempt));
    log._attempt = attempt;
  });
  const bucketsMap = /* @__PURE__ */ new Map();
  const addBucket = (n) => {
    if (!bucketsMap.has(n)) bucketsMap.set(n, { attempt: n, dials: 0, connects: 0, connectsPlusSets: 0, sets: 0 });
    return bucketsMap.get(n);
  };
  telLogs.forEach((log) => {
    const attempt = log._attempt || 0;
    const bucket = addBucket(attempt);
    bucket.dials += 1;
    const flags = classifyTeleapoResult(log);
    if (flags.isConnect) bucket.connects += 1;
    if (flags.isConnectPlusSet) bucket.connectsPlusSets += 1;
    if (flags.isSet) bucket.sets += 1;
  });
  const buckets = Array.from(bucketsMap.values()).sort((a, b) => a.attempt - b.attempt).map((b) => ({
    attempt: b.attempt,
    reached: b.dials,
    connected: b.connectsPlusSets,
    rate: b.dials ? b.connectsPlusSets / b.dials * 100 : null
  }));
  const connectAttempts = telLogs.filter((l) => classifyTeleapoResult(l).isConnectPlusSet && Number.isFinite(l._attempt)).map((l) => l._attempt);
  const average = connectAttempts.length ? connectAttempts.reduce((s, v) => s + v, 0) / connectAttempts.length : 0;
  return { buckets, average, sampleDials: telLogs.length, sampleConnects: connectAttempts.length };
}
function getDateRange(logs) {
  const dates = logs.map((l) => parseDateTime(l.datetime)).filter(Boolean);
  if (!dates.length) return null;
  let min = dates[0];
  let max = dates[0];
  dates.forEach((d) => {
    if (d < min) min = d;
    if (d > max) max = d;
  });
  return { min, max };
}
function getWeekOfMonth(dt) {
  const firstDay = new Date(dt.getFullYear(), dt.getMonth(), 1).getDay();
  return Math.floor((firstDay + dt.getDate() - 1) / 7) + 1;
}
function buildEmployeeTrendPoints(empLogs, modeOverride) {
  const range = getDateRange(empLogs);
  if (!range) return { mode: modeOverride || "month", points: [] };
  const spanDays = (range.max - range.min) / (1e3 * 60 * 60 * 24);
  let mode = modeOverride;
  if (!mode) {
    if (spanDays <= 1) mode = "hour";
    else if (spanDays <= 7) mode = "weekday";
    else if (spanDays <= 31) mode = "week";
    else mode = "month";
  }
  const buckets = /* @__PURE__ */ new Map();
  const addBucket = (key, label, sortValue) => {
    if (!buckets.has(key)) buckets.set(key, { label, sortValue, dials: 0, connects: 0, sets: 0, shows: 0 });
    return buckets.get(key);
  };
  empLogs.forEach((log) => {
    const dt = parseDateTime(log.datetime);
    if (!dt) return;
    const flags = classifyTeleapoResult(log);
    let key;
    let label;
    let sortValue;
    if (mode === "hour") {
      const hour = dt.getHours();
      key = hour;
      label = `${String(hour).padStart(2, "0")}:00`;
      sortValue = hour;
    } else if (mode === "weekday") {
      const dow = dt.getDay();
      const weekdayLabels = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
      key = dow;
      label = weekdayLabels[dow];
      sortValue = dow;
    } else if (mode === "week") {
      const week = getWeekOfMonth(dt);
      key = `${dt.getFullYear()}-${dt.getMonth() + 1}-W${week}`;
      label = `${dt.getMonth() + 1}\u6708${week}\u9031`;
      sortValue = new Date(dt.getFullYear(), dt.getMonth(), (week - 1) * 7 + 1).getTime();
    } else if (mode === "month") {
      const month = dt.getMonth() + 1;
      key = `${dt.getFullYear()}-${month}`;
      label = `${dt.getFullYear()}/${String(month).padStart(2, "0")}`;
      sortValue = new Date(dt.getFullYear(), dt.getMonth(), 1).getTime();
    } else {
      const year = dt.getFullYear();
      key = `${year}`;
      label = `${year}\u5E74`;
      sortValue = new Date(year, 0, 1).getTime();
    }
    const bucket = addBucket(key, label, sortValue);
    bucket.dials += 1;
    if (flags.isConnect) bucket.connects += 1;
    if (flags.isSet) bucket.sets += 1;
    if (flags.isShow) bucket.shows += 1;
  });
  const points = Array.from(buckets.values()).sort((a, b) => a.sortValue - b.sortValue).map((b) => {
    const connectRate = b.dials ? b.connects / b.dials * 100 : 0;
    const setRate = b.connects ? b.sets / b.connects * 100 : 0;
    const showRate = calcShowRate(b.shows, b.sets, b.connects);
    return { label: b.label, connectRate, setRate, showRate, dials: b.dials, connects: b.connects, sets: b.sets, shows: b.shows };
  });
  return { mode, points };
}
function getTrendModeLabel(mode) {
  if (mode === "hour") return "\u6642\u9593\u5E2F";
  if (mode === "weekday") return "\u66DC\u65E5";
  if (mode === "week") return "\u9031";
  if (mode === "year") return "\u5E74";
  return "\u6708";
}
function renderEmployeeSummary(empName, empLogs, trend) {
  const setKeys = /* @__PURE__ */ new Set();
  const showKeys = /* @__PURE__ */ new Set();
  const summary = empLogs.reduce((acc, log) => {
    const flags = classifyTeleapoResult(log);
    const stageKey = getStageCountKey(log);
    acc.dials += 1;
    if (flags.isConnect) acc.connects += 1;
    if (flags.isSet && stageKey && !setKeys.has(stageKey)) {
      setKeys.add(stageKey);
      acc.sets += 1;
    }
    if (flags.isShow && stageKey && !showKeys.has(stageKey)) {
      showKeys.add(stageKey);
      acc.shows += 1;
    }
    return acc;
  }, { dials: 0, connects: 0, sets: 0, shows: 0 });
  const connectRate = summary.dials ? summary.connects / summary.dials * 100 : 0;
  const setRate = summary.connects ? summary.sets / summary.connects * 100 : 0;
  const showRate = calcShowRate(summary.shows, summary.sets, summary.connects);
  setText("teleapoEmployeeKpiDials", summary.dials.toLocaleString());
  setText("teleapoEmployeeKpiConnects", summary.connects.toLocaleString());
  setText("teleapoEmployeeKpiSets", summary.sets.toLocaleString());
  setText("teleapoEmployeeKpiShows", summary.shows.toLocaleString());
  setText("teleapoEmployeeRateConnect", formatRate(connectRate));
  setText("teleapoEmployeeRateSet", formatRate(setRate));
  setText("teleapoEmployeeRateShow", formatRate(showRate));
  renderEmployeeTrendTable(trend.points, trend.mode);
}
function renderEmployeeTrendTable(points, mode) {
  const body = document.getElementById("teleapoEmployeeTrendTableBody");
  if (!body) return;
  setText("teleapoEmployeeTrendModeLabel", getTrendModeLabel(mode));
  if (!points.length) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="teleapo-employee-table-empty">\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093\u3002</td>
      </tr>
    `;
    return;
  }
  body.innerHTML = points.map((p) => {
    const connectDetail = p.dials ? `${p.connects}/${p.dials}` : "-";
    const setDetail = p.connects ? `${p.sets}/${p.connects}` : "-";
    const showDenom = getShowDenominator(p.sets, p.connects);
    const showDetail = showDenom ? `${p.shows}/${showDenom}` : "-";
    return `
      <tr>
        <td>${escapeHtml(p.label)}</td>
        <td class="text-right">${p.dials}</td>
        <td class="text-right">
          <div class="teleapo-employee-table-rate ${rateClass(p.connectRate, "teleapoConnectionRate")}">${formatRate(p.connectRate)}</div>
          <div class="teleapo-employee-table-detail">${connectDetail}</div>
        </td>
        <td class="text-right">
          <div class="teleapo-employee-table-rate ${rateClass(p.setRate, "teleapoSetupRate")}">${formatRate(p.setRate)}</div>
          <div class="teleapo-employee-table-detail">${setDetail}</div>
        </td>
        <td class="text-right">
          <div class="teleapo-employee-table-rate ${rateClass(p.showRate, "teleapoAttendanceRate")}">${formatRate(p.showRate)}</div>
          <div class="teleapo-employee-table-detail">${showDetail}</div>
        </td>
      </tr>
    `;
  }).join("");
}
function renderAttemptChart(logs) {
  const wrapper = document.getElementById("teleapoAttemptChartWrapper");
  const svg = document.getElementById("teleapoAttemptChart");
  const note = document.getElementById("teleapoAttemptChartNote");
  if (!wrapper || !svg) return;
  const { buckets, average, sampleDials, sampleConnects } = computeAttemptDistribution(logs);
  if (!buckets.length) {
    wrapper.classList.add("hidden");
    return;
  }
  wrapper.classList.remove("hidden");
  if (note) note.textContent = `\u5E73\u5747 ${average.toFixed(1)} \u56DE\u76EE\u3067\u901A\u96FB\uFF08\u67B6\u96FB ${sampleDials}\u4EF6 / \u901A\u96FB ${sampleConnects}\u4EF6\uFF09`;
  const rect = svg.getBoundingClientRect();
  const maxWidth = 300;
  const width = Math.min(maxWidth, Math.round(rect.width || 0) || maxWidth);
  const height = 260;
  const padding = { top: 16, right: 20, bottom: 40, left: 56 };
  const count = Math.max(buckets.length, 1);
  const available = width - padding.left - padding.right;
  const fixedBarWidth = 36;
  let barWidth = fixedBarWidth;
  let gap = count > 1 ? (available - barWidth * count) / (count - 1) : 0;
  const minGap = 4;
  if (gap < minGap) {
    gap = minGap;
    const maxBarWidth = (available - gap * (count - 1)) / count;
    if (maxBarWidth < barWidth) {
      barWidth = Math.max(8, maxBarWidth);
    }
  }
  const maxRate = Math.max(...buckets.map((b) => b.rate ?? 0), 100);
  const yTicks = [0, 20, 40, 60, 80, 100].filter((v) => v <= maxRate);
  const bars = buckets.map((b, i) => {
    const rateVal = b.rate == null ? 0 : b.rate;
    const x = count === 1 ? padding.left + (available - barWidth) / 2 : padding.left + i * (barWidth + gap);
    const h = rateVal / maxRate * (height - padding.top - padding.bottom);
    const y = height - padding.bottom - h;
    const label = b.rate == null ? "-" : `${rateVal.toFixed(0)}%`;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="8" class="fill-indigo-400 opacity-90" />
      <text x="${x + barWidth / 2}" y="${height - padding.bottom + 12}" text-anchor="middle" class="text-[10px] fill-slate-700">${b.attempt}\u56DE\u76EE</text>
      <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" class="text-[10px] fill-slate-800 font-semibold">${label}</text>
    `;
  }).join("");
  const yGrid = yTicks.map((t) => {
    const y = height - padding.bottom - t / maxRate * (height - padding.top - padding.bottom);
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgb(226 232 240)" stroke-width="1" />
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" class="text-[10px] fill-slate-600">${t}%</text>
    `;
  }).join("");
  const yAxis = `
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="rgb(148 163 184)" stroke-width="1" />
    <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgb(148 163 184)" stroke-width="1" />
    ${yGrid}
  `;
  const yLabelX = padding.left - 32;
  const yLabelY = (height - padding.bottom + padding.top) / 2;
  const axisLabels = `
    <text x="${(padding.left + width - padding.right) / 2}" y="${height - 6}" text-anchor="middle" class="text-[10px] fill-slate-600">\u67B6\u96FB\u56DE\u6570</text>
    <text x="${yLabelX}" y="${yLabelY}" text-anchor="middle" class="text-[10px] fill-slate-600" transform="rotate(-90 ${yLabelX} ${yLabelY})">\u901A\u96FB\u7387</text>
  `;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `${yAxis}${bars}${axisLabels}`;
}
function renderEmployeeTrendChart(empName, logs) {
  const wrapper = document.getElementById("teleapoEmployeeChartWrapper");
  const svg = document.getElementById("teleapoEmployeeTrendChart");
  const titleEl = document.getElementById("teleapoEmployeeChartTitle");
  if (!wrapper || !svg || !titleEl) return;
  const empLogs = logs.filter((l) => l.route === ROUTE_TEL && l.employee === empName);
  if (!empLogs.length) {
    wrapper.classList.add("hidden");
    return;
  }
  titleEl.textContent = `${empName} \u3055\u3093\u306EKPI\u63A8\u79FB\uFF08\u67B6\u96FB\u306E\u307F\uFF09`;
  const trend = buildEmployeeTrendPoints(empLogs, teleapoEmployeeTrendMode);
  const { mode, points } = trend;
  if (!points.length) {
    wrapper.classList.add("hidden");
    return;
  }
  renderEmployeeSummary(empName, empLogs, trend);
  const width = 880;
  const height = 340;
  const padding = { top: 28, right: 32, bottom: 62, left: 72 };
  const maxY = Math.max(...points.map((p) => Math.max(p.connectRate, p.setRate, p.showRate)), 100);
  const yTicks = [0, 20, 40, 60, 80, 100].filter((v) => v <= maxY + 5);
  const toX = (i) => padding.left + i / Math.max(points.length - 1, 1) * (width - padding.left - padding.right);
  const toY = (v) => height - padding.bottom - v / Math.max(maxY, 1) * (height - padding.top - padding.bottom);
  const buildSmoothPath = (values) => {
    const pts = values.map((v, i) => ({ x: toX(i), y: toY(v) }));
    if (!pts.length) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    const tension = 0.35;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6 * tension;
      const cp1y = p1.y + (p2.y - p0.y) / 6 * tension;
      const cp2x = p2.x - (p3.x - p1.x) / 6 * tension;
      const cp2y = p2.y - (p3.y - p1.y) / 6 * tension;
      d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
    }
    return d;
  };
  const line = (vals, color) => {
    const d = buildSmoothPath(vals);
    if (!d) return "";
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />`;
  };
  const connectPath = line(points.map((p) => p.connectRate), "#2563eb");
  const setPath = line(points.map((p) => p.setRate), "#f59e0b");
  const showPath = line(points.map((p) => p.showRate), "#10b981");
  const grid = yTicks.map((t) => {
    const y = toY(t);
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgb(226 232 240)" stroke-width="1" />
      <text x="${padding.left - 14}" y="${y + 4}" text-anchor="end" class="teleapo-chart-axis-tick">${t}%</text>
    `;
  }).join("");
  const yLabelX = padding.left - 38;
  const yLabelY = (height - padding.bottom + padding.top) / 2;
  const xAxisLabel = getTrendModeLabel(mode);
  const axisLabels = `
    <text x="${(padding.left + width - padding.right) / 2}" y="${height - 8}" text-anchor="middle" class="teleapo-chart-axis-label">${xAxisLabel}</text>
    <text x="${yLabelX}" y="${yLabelY}" text-anchor="middle" class="teleapo-chart-axis-label" transform="rotate(-90 ${yLabelX} ${yLabelY})">\u7387\uFF08%\uFF09</text>
  `;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    ${grid}
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="rgb(148 163 184)" stroke-width="1" />
    <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgb(148 163 184)" stroke-width="1" />
    ${connectPath}
    ${setPath}
    ${showPath}
    ${points.map((p, i) => {
    const tip = `${p.label}
\u67B6\u96FB: ${p.dials}\u4EF6
\u901A\u96FB\u7387: ${p.connectRate.toFixed(1)}% (${p.connects}/${p.dials})
\u8A2D\u5B9A\u7387: ${p.setRate.toFixed(1)}% (${p.sets}/${Math.max(p.connects, 1)})
\u7740\u5EA7\u7387: ${p.showRate.toFixed(1)}% (${p.shows}/${Math.max(getShowDenominator(p.sets, p.connects), 1)})`;
    return `<circle cx="${toX(i)}" cy="${toY(p.connectRate)}" r="4" fill="#2563eb"><title>${tip}</title></circle>`;
  }).join("")}
    ${points.map((p, i) => {
    const tip = `${p.label}
\u67B6\u96FB: ${p.dials}\u4EF6
\u901A\u96FB\u7387: ${p.connectRate.toFixed(1)}% (${p.connects}/${p.dials})
\u8A2D\u5B9A\u7387: ${p.setRate.toFixed(1)}% (${p.sets}/${Math.max(p.connects, 1)})
\u7740\u5EA7\u7387: ${p.showRate.toFixed(1)}% (${p.shows}/${Math.max(getShowDenominator(p.sets, p.connects), 1)})`;
    return `<circle cx="${toX(i)}" cy="${toY(p.setRate)}" r="4" fill="#f59e0b"><title>${tip}</title></circle>`;
  }).join("")}
    ${points.map((p, i) => {
    const tip = `${p.label}
\u67B6\u96FB: ${p.dials}\u4EF6
\u901A\u96FB\u7387: ${p.connectRate.toFixed(1)}% (${p.connects}/${p.dials})
\u8A2D\u5B9A\u7387: ${p.setRate.toFixed(1)}% (${p.sets}/${Math.max(p.connects, 1)})
\u7740\u5EA7\u7387: ${p.showRate.toFixed(1)}% (${p.shows}/${Math.max(getShowDenominator(p.sets, p.connects), 1)})`;
    return `<circle cx="${toX(i)}" cy="${toY(p.showRate)}" r="4" fill="#10b981"><title>${tip}</title></circle>`;
  }).join("")}
    ${points.map((p, i) => `<text x="${toX(i)}" y="${height - padding.bottom + 18}" text-anchor="middle" class="teleapo-chart-axis-tick">${p.label}</text>`).join("")}
    ${axisLabels}
  `;
  const prevName = wrapper.dataset.employeeName || "";
  wrapper.dataset.employeeName = empName;
  const shouldHighlight = prevName !== empName;
  wrapper.classList.remove("hidden");
  if (shouldHighlight) {
    const chartCard = wrapper.querySelector(".teleapo-employee-chart-card");
    if (chartCard) {
      chartCard.classList.remove("is-highlight");
      void chartCard.offsetWidth;
      chartCard.classList.add("is-highlight");
    }
  }
}
function applyFilters() {
  var _a, _b, _c, _d;
  refreshTeleapoLogFilterOptions(teleapoLogData);
  const empFilter = ((_a = document.getElementById("teleapoLogEmployeeFilter")) == null ? void 0 : _a.value) || "";
  const resultFilter = ((_b = document.getElementById("teleapoLogResultFilter")) == null ? void 0 : _b.value) || "";
  const routeFilter = ((_c = document.getElementById("teleapoLogRouteFilter")) == null ? void 0 : _c.value) || "";
  const targetSearch = (((_d = document.getElementById("teleapoLogTargetSearch")) == null ? void 0 : _d.value) || "").toLowerCase();
  const { startStr, endStr, start, end } = getSelectedRange();
  const rangeLabel = formatRangeLabel(startStr, endStr);
  teleapoFilteredLogs = teleapoLogData.filter((log) => {
    const dt = parseDateTime(log.datetime);
    if (start && dt && dt < start) return false;
    if (end && dt && dt > end) return false;
    if (empFilter && log.employee !== empFilter) return false;
    if (resultFilter) {
      const flags = classifyTeleapoResult(log);
      if (resultFilter === "\u7740\u5EA7" && !flags.isShow) return false;
      if (resultFilter === "\u8A2D\u5B9A" && !flags.isSet) return false;
      if (resultFilter !== "\u7740\u5EA7" && resultFilter !== "\u8A2D\u5B9A") {
        const resultText = `${flags.displayLabel || ""}${log.result || ""}${log.resultCode || ""}`;
        if (!resultText.includes(resultFilter)) return false;
      }
    }
    if (routeFilter === "tel" && log.route !== ROUTE_TEL) return false;
    if (routeFilter === "other" && log.route !== ROUTE_OTHER) return false;
    if (targetSearch && !`${log.target || ""}`.toLowerCase().includes(targetSearch)) return false;
    return true;
  });
  const scopeLogs = teleapoSummaryScope.type === "employee" ? teleapoFilteredLogs.filter((l) => l.employee === teleapoSummaryScope.name && l.route === ROUTE_TEL) : teleapoFilteredLogs;
  renderSummary(scopeLogs, teleapoSummaryScope.type === "employee" ? `${teleapoSummaryScope.name}\u3055\u3093\u306EKPI` : "\u5168\u4F53KPI", rangeLabel ? `${teleapoSummaryScope.name} / ${rangeLabel}` : teleapoSummaryScope.name);
  teleapoEmployeeMetrics = computeEmployeeMetrics(teleapoFilteredLogs);
  renderEmployeeTable(teleapoEmployeeMetrics);
  if (teleapoSummaryScope.type === "employee") {
    renderEmployeeTrendChart(teleapoSummaryScope.name, teleapoFilteredLogs);
  } else {
    const wrapper = document.getElementById("teleapoEmployeeChartWrapper");
    if (wrapper) wrapper.classList.add("hidden");
  }
  renderHeatmapUserToggles(teleapoFilteredLogs);
  const analysisScope = getAnalysisScope(teleapoFilteredLogs);
  const analysisLogs = analysisScope.logs;
  renderHeatmap(analysisLogs);
  renderAttemptChart(analysisLogs);
  updateTeleapoInsight(analysisLogs, analysisScope);
  renderLogTable();
  setText("teleapoAnalysisPeriodLabel", analysisScope.label ? `\u96C6\u8A08\u671F\u9593: ${analysisScope.label}` : "\u96C6\u8A08\u671F\u9593: -");
  setText("teleapoLogPeriodLabel", rangeLabel || "\u5168\u671F\u9593");
}
function getSelectedRange() {
  var _a, _b, _c, _d;
  const startStr = ((_a = document.getElementById("teleapoLogRangeStart")) == null ? void 0 : _a.value) || ((_b = document.getElementById("teleapoCompanyRangeStart")) == null ? void 0 : _b.value) || "";
  const endStr = ((_c = document.getElementById("teleapoLogRangeEnd")) == null ? void 0 : _c.value) || ((_d = document.getElementById("teleapoCompanyRangeEnd")) == null ? void 0 : _d.value) || "";
  const start = startStr ? /* @__PURE__ */ new Date(`${startStr}T00:00:00`) : null;
  const end = endStr ? /* @__PURE__ */ new Date(`${endStr}T23:59:59`) : null;
  return { startStr, endStr, start, end };
}
function getLoadedDateRange(logs = teleapoLogData) {
  const dates = (Array.isArray(logs) ? logs : []).map((log) => parseDateTime(log.datetime)).filter(Boolean).sort((a, b) => a - b);
  if (!dates.length) return null;
  return { min: dates[0], max: dates[dates.length - 1] };
}
function isRangeWithinLoaded(selected, loaded) {
  if (!loaded) return false;
  if (selected.start && selected.start < loaded.min) return false;
  if (selected.end && selected.end > loaded.max) return false;
  return true;
}
function refreshForRangeChange() {
  const selected = getSelectedRange();
  const loaded = getLoadedDateRange();
  if (!loaded || !isRangeWithinLoaded(selected, loaded)) {
    loadTeleapoData();
    return;
  }
  applyFilters();
}
function setRangePreset(preset) {
  const today = /* @__PURE__ */ new Date();
  let start = new Date(today);
  let end = new Date(today);
  if (preset === "today") {
  } else if (preset === "thisWeek") {
    const day = today.getDay();
    const daysToMonday = day === 0 ? 6 : day - 1;
    start.setDate(today.getDate() - daysToMonday);
  } else if (preset === "thisMonth") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (preset === "last30") {
    start.setDate(today.getDate() - 30);
  } else if (preset === "last180") {
    start.setDate(today.getDate() - 180);
  } else {
    start.setDate(today.getDate() - 30);
  }
  const toLocalDate = (value) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const startStr = toLocalDate(start);
  const endStr = toLocalDate(end);
  ["teleapoLogRangeStart", "teleapoCompanyRangeStart"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = startStr;
  });
  ["teleapoLogRangeEnd", "teleapoCompanyRangeEnd"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = endStr;
  });
}
function clearDateFilters() {
  ["teleapoLogRangeStart", "teleapoCompanyRangeStart", "teleapoLogRangeEnd", "teleapoCompanyRangeEnd"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  clearCompanyRangePresetSelection();
}
function getCompanyPresetButtons() {
  const scoped = document.querySelector('[data-scope="company"]');
  if (scoped) return Array.from(scoped.querySelectorAll("[data-preset]"));
  return Array.from(document.querySelectorAll("#teleapoPerformancePanel [data-preset]"));
}
function isTeleapoButtonActive(button) {
  return button.classList.contains("active") || button.classList.contains("is-active") || button.classList.contains("kpi-v2-range-btn-active");
}
function setTeleapoButtonActive(button, isActive) {
  if (!button) return;
  if (isActive) {
    if (button.classList.contains("kpi-v2-range-btn")) button.classList.add("kpi-v2-range-btn-active");
    button.classList.add("active", "is-active");
    button.setAttribute("aria-pressed", "true");
    button.style.setProperty("background-color", "#0077c7", "important");
    button.style.setProperty("color", "#ffffff", "important");
    button.style.setProperty("font-weight", "600", "important");
    button.style.setProperty("box-shadow", "0 2px 8px rgba(0, 119, 199, 0.4)", "important");
  } else {
    if (button.classList.contains("kpi-v2-range-btn")) button.classList.remove("kpi-v2-range-btn-active");
    button.classList.remove("active", "is-active");
    button.setAttribute("aria-pressed", "false");
    button.style.removeProperty("background-color");
    button.style.removeProperty("color");
    button.style.removeProperty("font-weight");
    button.style.removeProperty("box-shadow");
  }
}
function syncTeleapoButtonGroup(buttons, activeButton) {
  buttons.forEach((btn) => setTeleapoButtonActive(btn, btn === activeButton));
}
function clearCompanyRangePresetSelection() {
  const buttons = getCompanyPresetButtons();
  if (!buttons.length) return;
  buttons.forEach((btn) => setTeleapoButtonActive(btn, false));
}
function initDateInputs() {
  const buttons = getCompanyPresetButtons();
  buttons.forEach((btn) => setTeleapoButtonActive(btn, false));
  teleapoActivePreset = null;
  ["teleapoLogRangeStart", "teleapoLogRangeEnd", "teleapoCompanyRangeStart", "teleapoCompanyRangeEnd"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  refreshForRangeChange();
}
function initFilters() {
  const handleRangeChange = () => {
    teleapoRangeTouched = true;
    refreshForRangeChange();
  };
  ["teleapoLogEmployeeFilter", "teleapoLogResultFilter", "teleapoLogRouteFilter", "teleapoLogTargetSearch", "teleapoLogRangeStart", "teleapoLogRangeEnd", "teleapoCompanyRangeStart", "teleapoCompanyRangeEnd"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id.includes("TargetSearch") ? "input" : "change", () => {
      teleapoLogPage = 1;
      if (id.includes("Range")) {
        handleRangeChange();
        return;
      }
      applyFilters();
    });
  });
  const resetBtn = document.getElementById("teleapoLogFilterReset");
  if (resetBtn) {
    resetBtn.onclick = () => {
      const emp = document.getElementById("teleapoLogEmployeeFilter");
      const result = document.getElementById("teleapoLogResultFilter");
      const route = document.getElementById("teleapoLogRouteFilter");
      const target = document.getElementById("teleapoLogTargetSearch");
      if (emp) emp.value = "";
      if (result) result.value = "";
      if (route) route.value = "";
      if (target) target.value = "";
      teleapoLogPage = 1;
      applyFilters();
    };
  }
}
function initHeatmapControls() {
  const rangeButtons = Array.from(document.querySelectorAll("[data-analysis-range]"));
  const syncButtons = () => {
    const active = rangeButtons.find((b) => b.dataset.analysisRange === teleapoAnalysisRange);
    syncTeleapoButtonGroup(rangeButtons, active || null);
  };
  syncButtons();
  rangeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      teleapoAnalysisRange = btn.dataset.analysisRange || "all";
      syncButtons();
      applyFilters();
    });
  });
  const toggleContainer = document.getElementById("teleapoHeatmapUserToggles");
  if (toggleContainer) {
    toggleContainer.addEventListener("click", (event) => {
      const button = event.target.closest("[data-heatmap-user]");
      if (!button) return;
      const value = button.dataset.heatmapUser || "all";
      teleapoHeatmapUser = teleapoHeatmapUser === value ? "all" : value;
      applyFilters();
    });
  }
}
function initEmployeeSort() {
  const select = document.getElementById("teleapoEmployeeSortSelect");
  if (!select) return;
  select.addEventListener("change", () => applyFilters());
}
function initResetButton() {
  const resetBtn = document.getElementById("teleapoSummaryResetBtn");
  if (!resetBtn) return;
  resetBtn.addEventListener("click", () => {
    const buttons = getCompanyPresetButtons();
    buttons.forEach((btn) => setTeleapoButtonActive(btn, false));
    teleapoActivePreset = null;
    ["teleapoLogRangeStart", "teleapoLogRangeEnd", "teleapoCompanyRangeStart", "teleapoCompanyRangeEnd"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    refreshForRangeChange();
  });
}
function initCompanyRangePresets() {
  setTimeout(() => {
    const buttons = getCompanyPresetButtons();
    if (!buttons.length) return;
    buttons.forEach((btn) => {
      if (btn.dataset.listenerAttached === "true") return;
      btn.addEventListener("click", () => {
        teleapoRangeTouched = true;
        const preset = btn.dataset.preset || "thisMonth";
        const isActive = isTeleapoButtonActive(btn);
        syncTeleapoButtonGroup(buttons, null);
        if (isActive) {
          teleapoActivePreset = null;
          ["teleapoLogRangeStart", "teleapoLogRangeEnd", "teleapoCompanyRangeStart", "teleapoCompanyRangeEnd"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = "";
          });
          refreshForRangeChange();
          return;
        }
        teleapoActivePreset = preset;
        setRangePreset(preset);
        setTeleapoButtonActive(btn, true);
        refreshForRangeChange();
      });
      btn.dataset.listenerAttached = "true";
    });
  }, 50);
}
function updateLogSortIndicators() {
  const headers = document.querySelectorAll("#teleapoLogTable th[data-sort]");
  headers.forEach((th) => {
    const isActive = teleapoLogSort.key === th.dataset.sort;
    th.classList.toggle("is-sorted", isActive);
    if (isActive) {
      th.dataset.sortDir = teleapoLogSort.dir;
      th.setAttribute("aria-sort", teleapoLogSort.dir === "asc" ? "ascending" : "descending");
    } else {
      th.removeAttribute("data-sort-dir");
      th.setAttribute("aria-sort", "none");
    }
  });
}
function initLogTableSort() {
  const headers = document.querySelectorAll("#teleapoLogTable th.sortable");
  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (!key) return;
      if (teleapoLogSort.key === key) {
        teleapoLogSort.dir = teleapoLogSort.dir === "asc" ? "desc" : "asc";
      } else {
        teleapoLogSort = { key, dir: "asc" };
      }
      renderLogTable();
      updateLogSortIndicators();
    });
  });
  updateLogSortIndicators();
}
function initLogPagination() {
  const container = document.getElementById("teleapoLogPagination");
  if (!container || container.dataset.bound === "true") return;
  container.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-log-page]");
    if (!btn || btn.disabled) return;
    const nextPage = Number(btn.dataset.logPage);
    if (!Number.isFinite(nextPage) || nextPage <= 0 || nextPage === teleapoLogPage) return;
    teleapoLogPage = nextPage;
    renderLogTable();
  });
  container.dataset.bound = "true";
}
function initLogTableActions() {
  const tbody = document.getElementById("teleapoLogTableBody");
  if (!tbody) return;
  tbody.addEventListener("click", async (event) => {
    var _a;
    const candidateBtn = event.target.closest('[data-action="open-candidate"]');
    if (candidateBtn) {
      event.preventDefault();
      event.stopPropagation();
      const candidateId = candidateBtn.dataset.candidateId;
      const candidateName = candidateBtn.dataset.candidateName;
      (_a = window.navigateToCandidateDetail) == null ? void 0 : _a.call(window, candidateId, candidateName);
      return;
    }
    const btn = event.target.closest('[data-action="delete-log"]');
    if (!btn) return;
    const logId = btn.dataset.logId;
    if (!logId) return;
    if (!window.confirm("\u3053\u306E\u67B6\u96FB\u30ED\u30B0\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F")) return;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "\u524A\u9664\u4E2D...";
    try {
      const removedLog = teleapoLogData.find((l) => String(l.id) === String(logId));
      await deleteTeleapoLog(logId);
      teleapoLogData = teleapoLogData.filter((l) => String(l.id) !== String(logId));
      annotateCallAttempts(teleapoLogData);
      applyFilters();
      rebuildCsTaskCandidates();
      if ((removedLog == null ? void 0 : removedLog.route) === ROUTE_TEL) {
        const candidateInput = document.getElementById("dialFormCandidateName");
        if (candidateInput) updateCallNoAndRoute(candidateInput.value);
      }
      setLogStatus("\u67B6\u96FB\u30ED\u30B0\u3092\u524A\u9664\u3057\u307E\u3057\u305F", "success");
    } catch (err) {
      console.error(err);
      setLogStatus(`\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${err.message}`, "error");
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}
function initCsTaskTableActions() {
  const tbody = document.getElementById("teleapoCsTaskTableBody");
  if (!tbody) return;
  tbody.addEventListener("click", (event) => {
    var _a;
    const dialBtn = event.target.closest('[data-action="prefill-dial"]');
    if (dialBtn) {
      event.preventDefault();
      event.stopPropagation();
      const candidateId2 = dialBtn.dataset.candidateId;
      const candidateName2 = dialBtn.dataset.candidateName;
      prefillDialFormFromCandidate(candidateId2, candidateName2);
      return;
    }
    const candidateBtn = event.target.closest('[data-action="open-candidate"]');
    if (!candidateBtn) return;
    event.preventDefault();
    event.stopPropagation();
    const candidateId = candidateBtn.dataset.candidateId;
    const candidateName = candidateBtn.dataset.candidateName;
    (_a = window.navigateToCandidateDetail) == null ? void 0 : _a.call(window, candidateId, candidateName);
  });
}
function setToggleButtonState(button, isOpen) {
  if (!button) return;
  button.setAttribute("aria-expanded", isOpen ? "true" : "false");
  button.classList.toggle("bg-indigo-600", isOpen);
  button.classList.toggle("text-white", isOpen);
  button.classList.toggle("border-indigo-600", isOpen);
  button.classList.toggle("bg-white", !isOpen);
  button.classList.toggle("text-indigo-700", !isOpen);
  button.classList.toggle("border-indigo-200", !isOpen);
}
function initCsTaskToggle() {
  const header = document.getElementById("teleapoCsTaskToggle");
  const wrapper = document.getElementById("teleapoCsTaskTableWrapper");
  if (!header) return;
  const toggleBtn = header.querySelector(".teleapo-collapsible-btn");
  if (!toggleBtn) return;
  const parent = header.closest(".teleapo-collapsible");
  const onToggle = () => {
    csTaskExpanded = !csTaskExpanded;
    updateLabel();
    if (parent) parent.classList.toggle("open", csTaskExpanded);
    if (wrapper) wrapper.style.display = csTaskExpanded ? "block" : "none";
    if (csTaskExpanded) {
      renderCsTaskTable(teleapoCsTaskCandidates);
    }
  };
  const updateLabel = () => {
    toggleBtn.textContent = csTaskExpanded ? "\u4E00\u89A7\u3092\u9589\u3058\u308B" : "\u4E00\u89A7\u3092\u958B\u304F";
    setToggleButtonState(toggleBtn, csTaskExpanded);
  };
  updateLabel();
  if (parent) parent.classList.toggle("open", csTaskExpanded);
  if (wrapper) wrapper.style.display = csTaskExpanded ? "block" : "none";
  header.addEventListener("click", onToggle);
  toggleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    onToggle();
  });
}
function initMissingInfoTableActions() {
  const tbody = document.getElementById("teleapoMissingInfoTableBody");
  if (!tbody) return;
  tbody.addEventListener("click", (event) => {
    var _a;
    const candidateBtn = event.target.closest('[data-action="open-candidate"]');
    if (!candidateBtn) return;
    event.preventDefault();
    event.stopPropagation();
    const candidateId = candidateBtn.dataset.candidateId;
    const candidateName = candidateBtn.dataset.candidateName;
    (_a = window.navigateToCandidateDetail) == null ? void 0 : _a.call(window, candidateId, candidateName);
  });
}
function initMissingInfoToggle() {
  const header = document.getElementById("teleapoMissingInfoToggle");
  const wrapper = document.getElementById("teleapoMissingInfoTableWrapper");
  if (!header) return;
  const toggleBtn = header.querySelector(".teleapo-collapsible-btn");
  if (!toggleBtn) return;
  const parent = header.closest(".teleapo-collapsible");
  const onToggle = () => {
    missingInfoExpanded = !missingInfoExpanded;
    updateLabel();
    if (parent) parent.classList.toggle("open", missingInfoExpanded);
    if (wrapper) wrapper.style.display = missingInfoExpanded ? "block" : "none";
    renderMissingInfoTable(teleapoMissingInfoCandidates);
  };
  const updateLabel = () => {
    toggleBtn.textContent = missingInfoExpanded ? "\u4E00\u89A7\u3092\u9589\u3058\u308B" : "\u4E00\u89A7\u3092\u958B\u304F";
    setToggleButtonState(toggleBtn, missingInfoExpanded);
  };
  updateLabel();
  if (parent) parent.classList.toggle("open", missingInfoExpanded);
  if (wrapper) wrapper.style.display = missingInfoExpanded ? "block" : "none";
  header.addEventListener("click", onToggle);
  toggleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    onToggle();
  });
}
function initLogToggle() {
  const toggleBtn = document.getElementById("teleapoLogToggle");
  const wrapper = document.getElementById("teleapoLogWrapper");
  if (!toggleBtn) return;
  const updateLabel = () => {
    toggleBtn.textContent = logExpanded ? "\u4E00\u89A7\u3092\u9589\u3058\u308B" : "\u4E00\u89A7\u3092\u958B\u304F";
    setToggleButtonState(toggleBtn, logExpanded);
  };
  updateLabel();
  if (wrapper) wrapper.classList.toggle("hidden", !logExpanded);
  toggleBtn.addEventListener("click", () => {
    logExpanded = !logExpanded;
    updateLabel();
    if (wrapper) wrapper.classList.toggle("hidden", !logExpanded);
    if (logExpanded) {
      renderLogTable();
    }
  });
}
async function fetchTeleapoApi() {
  var _a, _b, _c, _d, _e, _f;
  let startStr = ((_a = document.getElementById("teleapoLogRangeStart")) == null ? void 0 : _a.value) || ((_b = document.getElementById("teleapoCompanyRangeStart")) == null ? void 0 : _b.value) || "";
  let endStr = ((_c = document.getElementById("teleapoLogRangeEnd")) == null ? void 0 : _c.value) || ((_d = document.getElementById("teleapoCompanyRangeEnd")) == null ? void 0 : _d.value) || "";
  if (!startStr || !endStr) {
    if (teleapoActivePreset) {
      setRangePreset(teleapoActivePreset);
      startStr = ((_e = document.getElementById("teleapoCompanyRangeStart")) == null ? void 0 : _e.value) || "";
      endStr = ((_f = document.getElementById("teleapoCompanyRangeEnd")) == null ? void 0 : _f.value) || "";
    }
    if (!startStr || !endStr) {
      const today = /* @__PURE__ */ new Date();
      const from = new Date(today);
      from.setFullYear(today.getFullYear() - 1);
      startStr = from.toISOString().slice(0, 10);
      endStr = today.toISOString().slice(0, 10);
    }
  }
  const params = new URLSearchParams();
  params.append("from", startStr);
  params.append("to", endStr ? addDaysToDateString(endStr, 1) : endStr);
  params.append("limit", "2000");
  params.append("offset", "0");
  const url = new URL(TELEAPO_LOGS_URL);
  params.forEach((value, key) => url.searchParams.append(key, value));
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Teleapo API HTTP ${res.status}`);
  return res.json();
}
async function loadCandidates() {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  renderCsTaskTable([], { loading: true });
  renderMissingInfoTable([], { loading: true });
  try {
    const res = await fetch(CANDIDATES_API_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Candidates API Error: ${res.status}`);
    const data = await res.json();
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items = rawItems.map((item) => normalizeCandidateDetail(item) || item);
    candidateNameMap.clear();
    candidateIdMap.clear();
    candidateAttendanceMap.clear();
    candidateAttendanceByName.clear();
    candidatePhoneToId.clear();
    candidateEmailToId.clear();
    items.forEach((c) => {
      const fullName = String(c.candidateName ?? c.candidate_name ?? c.name ?? "").trim();
      const candidateId = Number(c.candidateId ?? c.candidate_id ?? c.id ?? c.candidateID);
      if (fullName && Number.isFinite(candidateId) && candidateId > 0) {
        candidateNameMap.set(fullName, candidateId);
        candidateIdMap.set(String(candidateId), fullName);
        registerCandidateAttendance(
          candidateId,
          fullName,
          c.attendanceConfirmed ?? c.first_interview_attended ?? c.attendance_confirmed ?? c.firstInterviewAttended
        );
        const phone = c.phone ?? c.phone_number ?? c.phoneNumber ?? c.tel ?? c.mobile ?? c.candidate_phone ?? "";
        const phoneText = String(phone ?? "").trim();
        const birthday = String(c.birthday ?? c.birth_date ?? c.birthDate ?? c.birthdate ?? "").trim();
        const contactPreferredTime = normalizeContactPreferredTime(
          c.contactPreferredTime ?? c.contact_preferred_time ?? c.contactTime ?? c.contact_time
        );
        const contactPreferredTimeFetched = Boolean(contactPreferredTime);
        const ageRaw = c.age ?? c.age_years ?? c.ageYears ?? null;
        const ageValue = Number(ageRaw);
        const age = Number.isFinite(ageValue) && ageValue > 0 ? ageValue : null;
        const detail = {
          phone: phoneText,
          birthday: String(birthday ?? "").trim(),
          age,
          contactPreferredTime: normalizeContactPreferredTime(contactPreferredTime),
          contactPreferredTimeFetched,
          attendanceConfirmed: normalizeAttendanceValue(
            c.attendanceConfirmed ?? c.first_interview_attended ?? c.attendance_confirmed ?? c.firstInterviewAttended
          ),
          firstInterviewDate: c.firstInterviewDate ?? c.first_interview_date ?? c.firstInterviewAt ?? c.first_interview_at ?? null
        };
        if (detail.phone) candidatePhoneCache.set(candidateId, detail.phone);
        if (detail.phone || detail.birthday || detail.age !== null || detail.contactPreferredTime) {
          candidateDetailCache.set(candidateId, detail);
        }
        registerCandidateContactMaps(candidateId, { ...c, phone: phoneText });
      }
    });
    candidateNameList = Array.from(candidateNameMap.keys()).sort((a, b) => b.length - a.length);
    console.log(`\u5019\u88DC\u8005\u30ED\u30FC\u30C9\u5B8C\u4E86: ${candidateNameMap.size}\u4EF6`);
    teleapoCandidateMaster = items;
    refreshCandidateDatalist();
    refreshDialFormAdvisorSelect(teleapoCandidateMaster);
    syncDialFormAdvisorSelection({
      candidateId: (_a = document.getElementById("dialFormCandidateId")) == null ? void 0 : _a.value,
      candidateName: ((_b = document.getElementById("dialFormCandidateName")) == null ? void 0 : _b.value) || ""
    });
    syncSmsFormAdvisorSelection({
      candidateId: (_c = document.getElementById("smsFormCandidateId")) == null ? void 0 : _c.value,
      candidateName: ((_d = document.getElementById("smsFormCandidateName")) == null ? void 0 : _d.value) || ""
    });
    updateInterviewFieldVisibility((_e = document.getElementById("dialFormResult")) == null ? void 0 : _e.value);
    updateSmsFormInterviewFieldVisibility((_f = document.getElementById("smsFormResult")) == null ? void 0 : _f.value);
    prefetchValidApplicationForCandidates(teleapoCandidateMaster);
    rebuildCsTaskCandidates();
    const hydrated = hydrateLogCandidateIds(teleapoLogData);
    if (hydrated) {
      rebuildTeleapoSummaryCache(teleapoLogData);
    }
    prefetchContactTimeForLogs(teleapoLogData);
    prefetchContactTimeForTasks(teleapoCsTaskCandidates);
    applyFilters();
    scheduleAttendanceFetchFromLogs(teleapoLogData);
  } catch (e) {
    console.error("\u5019\u88DC\u8005\u4E00\u89A7\u306E\u53D6\u5F97\u306B\u5931\u6557:", e);
    teleapoCandidateMaster = [];
    refreshDialFormAdvisorSelect([]);
    updateInterviewFieldVisibility((_g = document.getElementById("dialFormResult")) == null ? void 0 : _g.value);
    updateSmsFormInterviewFieldVisibility((_h = document.getElementById("smsFormResult")) == null ? void 0 : _h.value);
    renderCsTaskTable([], { error: true });
  }
}
async function loadTeleapoData() {
  const prevLogs = Array.isArray(teleapoLogData) ? [...teleapoLogData] : [];
  const prevRange = getLoadedDateRange(prevLogs);
  const selectedRange = getSelectedRange();
  try {
    const data = await fetchTeleapoApi();
    const logs = Array.isArray(data == null ? void 0 : data.logs) ? data.logs : Array.isArray(data == null ? void 0 : data.items) ? data.items : [];
    const mappedLogs = logs.map(mapApiLog).filter(Boolean);
    let nextLogs = mappedLogs.filter((l) => l.datetime);
    if (!nextLogs.length && mappedLogs.length) {
      nextLogs = mappedLogs;
    }
    if (!nextLogs.length && prevLogs.length && (selectedRange.startStr || selectedRange.endStr) && prevRange) {
      if (isRangeWithinLoaded(selectedRange, prevRange)) {
        teleapoLogData = prevLogs;
        applyFilters();
        return;
      }
    }
    teleapoLogData = nextLogs;
    if (!teleapoLogData.length && !teleapoRangeTouched && !teleapoAutoFallbackDone) {
      teleapoAutoFallbackDone = true;
      clearCompanyRangePresetSelection();
      setRangePreset("last180");
      return loadTeleapoData();
    }
    teleapoLogData = mergePendingLogs(teleapoLogData);
    annotateCallAttempts(teleapoLogData);
    rebuildEmployeeMap();
    refreshCandidateDatalist();
    const hydrated = hydrateLogCandidateIds(teleapoLogData);
    if (hydrated) {
      rebuildTeleapoSummaryCache(teleapoLogData);
    }
    scheduleAttendanceFetchFromLogs(teleapoLogData);
    prefetchContactTimeForLogs(teleapoLogData);
    applyFilters();
    rebuildCsTaskCandidates();
    prefetchContactTimeForTasks(teleapoCsTaskCandidates);
  } catch (err) {
    console.error("[teleapo] API\u53D6\u5F97\u306B\u5931\u6557\u3057\u305F\u305F\u3081\u30E2\u30C3\u30AF\u3092\u4F7F\u7528\u3057\u307E\u3059", err);
    teleapoLogData = teleapoInitialMockLogs.map(normalizeLog);
    teleapoLogData = mergePendingLogs(teleapoLogData);
    annotateCallAttempts(teleapoLogData);
    refreshCandidateDatalist();
    const hydrated = hydrateLogCandidateIds(teleapoLogData);
    if (hydrated) {
      rebuildTeleapoSummaryCache(teleapoLogData);
    }
    scheduleAttendanceFetchFromLogs(teleapoLogData);
    prefetchContactTimeForLogs(teleapoLogData);
    applyFilters();
    rebuildCsTaskCandidates();
    prefetchContactTimeForTasks(teleapoCsTaskCandidates);
  }
}
async function loadTeleapoRateTargets() {
  try {
    await goalSettingsService.load();
    const periods = goalSettingsService.getEvaluationPeriods();
    const now = /* @__PURE__ */ new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const todayStr = `${y}-${m}-${d}`;
    const currentPeriod = goalSettingsService.getPeriodByDate(todayStr, periods);
    if (currentPeriod == null ? void 0 : currentPeriod.id) {
      teleapoRateTargets = await goalSettingsService.loadPageRateTargets(currentPeriod.id) || {};
    }
  } catch (error) {
    console.warn("[teleapo] failed to load rate targets", error);
    teleapoRateTargets = {};
  }
}
function mount() {
  bindTeleapoTabs();
  bindTeleapoCollapsibles();
  ensureLogHighlightStyles();
  initDateInputs();
  initFilters();
  initCompanyRangePresets();
  initResetButton();
  initHeatmapControls();
  initEmployeeSort();
  initEmployeeSortHeaders();
  initEmployeeTrendModeControls();
  initLogTableSort();
  initLogPagination();
  initLogTableActions();
  initCsTaskTableActions();
  initCsTaskToggle();
  initMissingInfoTableActions();
  initMissingInfoToggle();
  initLogToggle();
  initCandidateQuickView();
  initRateModeToggle();
  initDialForm();
  initSmsForm();
  void refreshDialFormAdvisorSchedules({ force: true });
  loadTeleapoRateTargets().then(() => {
    refreshForRangeChange();
  });
  void loadScreeningRulesForTeleapo({ force: true });
  loadCandidates();
  loadTeleapoData();
}
function localDateTimeToRfc3339(localValue) {
  if (!localValue || !localValue.includes("T")) return null;
  const [datePart, timePart] = localValue.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0);
  const tzMin = -dt.getTimezoneOffset();
  const sign = tzMin >= 0 ? "+" : "-";
  const abs = Math.abs(tzMin);
  const tzH = String(Math.floor(abs / 60)).padStart(2, "0");
  const tzM = String(abs % 60).padStart(2, "0");
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:00${sign}${tzH}:${tzM}`;
}
var TELEAPO_API_BASE = PRIMARY_API_BASE;
var TELEAPO_LOGS_PATH = "/teleapo/logs";
var TELEAPO_LOGS_URL = `${TELEAPO_API_BASE}${TELEAPO_LOGS_PATH}`;
function nowLocalDateTime() {
  const d = /* @__PURE__ */ new Date();
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString();
  return iso.slice(0, 16);
}
function isAssignedToCurrentUserCandidate(candidate, userId) {
  const uid = toPositiveInt(userId);
  if (!uid || !candidate) return false;
  const ownerIds = [
    candidate.partnerUserId,
    candidate.partner_user_id,
    candidate.csUserId,
    candidate.cs_user_id,
    candidate.advisorUserId,
    candidate.advisor_user_id
  ].map((value) => toPositiveInt(value)).filter(Boolean);
  return ownerIds.includes(uid);
}
function buildDialFormCandidateNamesByPriority() {
  const names = Array.from(candidateNameMap.keys());
  if (!names.length) return [];
  const userId = toPositiveInt(dialFormCurrentUser == null ? void 0 : dialFormCurrentUser.userId);
  if (!userId || !Array.isArray(teleapoCandidateMaster) || !teleapoCandidateMaster.length) {
    return names.sort((a, b) => a.localeCompare(b, "ja"));
  }
  const mineSet = /* @__PURE__ */ new Set();
  teleapoCandidateMaster.forEach((candidate) => {
    if (!isAssignedToCurrentUserCandidate(candidate, userId)) return;
    const name = String(
      (candidate == null ? void 0 : candidate.candidateName) ?? (candidate == null ? void 0 : candidate.candidate_name) ?? (candidate == null ? void 0 : candidate.name) ?? ""
    ).trim();
    if (!name) return;
    if (!candidateNameMap.has(name)) return;
    mineSet.add(name);
  });
  return names.sort((a, b) => {
    const aMine = mineSet.has(a);
    const bMine = mineSet.has(b);
    if (aMine !== bMine) return aMine ? -1 : 1;
    return a.localeCompare(b, "ja");
  });
}
function getMyAssignedCandidateEntries({ limit = 16 } = {}) {
  const userId = toPositiveInt(dialFormCurrentUser == null ? void 0 : dialFormCurrentUser.userId);
  if (!userId || !Array.isArray(teleapoCandidateMaster) || !teleapoCandidateMaster.length) {
    return [];
  }
  const seen = /* @__PURE__ */ new Set();
  const entries = [];
  teleapoCandidateMaster.forEach((candidate) => {
    if (!isAssignedToCurrentUserCandidate(candidate, userId)) return;
    const candidateId = toPositiveInt(
      (candidate == null ? void 0 : candidate.candidateId) ?? (candidate == null ? void 0 : candidate.candidate_id) ?? (candidate == null ? void 0 : candidate.id) ?? (candidate == null ? void 0 : candidate.candidateID)
    );
    const name = String(
      (candidate == null ? void 0 : candidate.candidateName) ?? (candidate == null ? void 0 : candidate.candidate_name) ?? (candidate == null ? void 0 : candidate.name) ?? ""
    ).trim();
    if (!name || !candidateNameMap.has(name)) return;
    const key = `${candidateId || ""}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ id: candidateId, name });
  });
  entries.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  if (!Number.isFinite(limit) || limit <= 0) return entries;
  return entries.slice(0, limit);
}
function refreshDialFormMineCandidates() {
  const field = document.getElementById("dialFormMineCandidatesField");
  const wrap = document.getElementById("dialFormMineCandidatesWrap");
  const list = document.getElementById("dialFormMineCandidatesList");
  const count = document.getElementById("dialFormMineCandidatesCount");
  if (!wrap || !list || !count) return;
  const allEntries = getMyAssignedCandidateEntries({ limit: 0 });
  if (!allEntries.length) {
    field == null ? void 0 : field.classList.add("hidden");
    wrap.classList.add("hidden");
    list.innerHTML = "";
    count.textContent = "0\u4EF6";
    return;
  }
  const visibleEntries = allEntries.slice(0, 16);
  const overflow = allEntries.length - visibleEntries.length;
  field == null ? void 0 : field.classList.remove("hidden");
  wrap.classList.remove("hidden");
  count.textContent = `${allEntries.length}\u4EF6`;
  list.innerHTML = [
    ...visibleEntries.map((entry) => `
      <button
        type="button"
        class="teleapo-mine-candidate-chip"
        data-action="select-my-candidate"
        data-candidate-id="${escapeHtml(String(entry.id || ""))}"
        data-candidate-name="${escapeHtml(entry.name)}"
      >
        ${escapeHtml(entry.name)}
      </button>
    `),
    overflow > 0 ? `<span class="teleapo-mine-candidate-overflow">\u4ED6 ${overflow} \u540D</span>` : ""
  ].join("");
}
function refreshCandidateDatalist() {
  const listEl = document.getElementById("dialFormCandidateList");
  if (!listEl) return;
  const names = buildDialFormCandidateNamesByPriority();
  listEl.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
  refreshDialFormMineCandidates();
}
function updateCallNoAndRoute(candidateName) {
  const name = (candidateName || "").trim();
  const callNoInput = document.getElementById("dialFormCallNo");
  const routeInput = document.getElementById("dialFormRoute");
  const candidateIdHidden = document.getElementById("dialFormCandidateId");
  if (routeInput) routeInput.value = "\u96FB\u8A71";
  if (!name) {
    syncDialFormAdvisorSelection({ candidateId: null, candidateName: "" });
    return;
  }
  const matchedCandidateId = findCandidateIdByName(name);
  if (matchedCandidateId && candidateIdHidden) {
    candidateIdHidden.value = String(matchedCandidateId);
  }
  const nameKey = normalizeNameKey(name);
  const matched = matchedCandidateId ? teleapoLogData.filter((l) => Number(l.candidateId) === Number(matchedCandidateId)) : teleapoLogData.filter((l) => normalizeNameKey(l.target || "") === nameKey);
  if (matched.length === 0) {
    if (callNoInput) callNoInput.value = "1";
    if (candidateIdHidden && !matchedCandidateId) candidateIdHidden.value = "";
    syncDialFormAdvisorSelection({ candidateId: matchedCandidateId, candidateName: name });
    return;
  }
  const telMatched = matched.filter((l) => l.route === ROUTE_TEL);
  const nextAttempt = telMatched.length + 1;
  if (callNoInput) callNoInput.value = String(nextAttempt || 1);
  const latest = [...matched].sort((a, b) => {
    var _a, _b;
    const ta = ((_a = parseDateTime(a.datetime)) == null ? void 0 : _a.getTime()) || 0;
    const tb = ((_b = parseDateTime(b.datetime)) == null ? void 0 : _b.getTime()) || 0;
    return tb - ta;
  })[0];
  if (candidateIdHidden && (latest == null ? void 0 : latest.candidateId)) candidateIdHidden.value = String(latest.candidateId);
  syncDialFormAdvisorSelection({
    candidateId: matchedCandidateId ?? (latest == null ? void 0 : latest.candidateId) ?? (candidateIdHidden == null ? void 0 : candidateIdHidden.value),
    candidateName: name
  });
}
function prefillDialFormFromCandidate(candidateId, candidateName) {
  var _a;
  const form = document.getElementById("teleapoFormSection");
  const nameInput = document.getElementById("dialFormCandidateName");
  const idInput = document.getElementById("dialFormCandidateId");
  const calledAtInput = document.getElementById("dialFormCalledAt");
  const routeInput = document.getElementById("dialFormRoute");
  const resolvedName = candidateName || candidateIdMap.get(String(candidateId)) || "";
  if (nameInput && resolvedName) {
    nameInput.value = resolvedName;
  }
  if (idInput && candidateId) {
    idInput.value = String(candidateId);
  }
  if (calledAtInput) {
    calledAtInput.value = nowLocalDateTime();
  }
  if (resolvedName) {
    updateCallNoAndRoute(resolvedName);
  }
  if (routeInput) {
    routeInput.value = "\u96FB\u8A71";
  }
  syncDialFormAdvisorSelection({ candidateId, candidateName: resolvedName });
  updateInterviewFieldVisibility((_a = document.getElementById("dialFormResult")) == null ? void 0 : _a.value);
  if (form) {
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const resultSelect = document.getElementById("dialFormResult");
  if (resultSelect) {
    resultSelect.focus();
  } else {
    nameInput == null ? void 0 : nameInput.focus();
  }
}
function shouldRequireInterview(resultValue) {
  return normalizeResultCode(resultValue) === "set";
}
function updateInterviewFieldVisibility(resultValue) {
  var _a, _b, _c;
  const shouldShow = shouldRequireInterview(resultValue ?? ((_a = document.getElementById("dialFormResult")) == null ? void 0 : _a.value));
  const interviewField = document.getElementById("dialFormInterviewField");
  const interviewInput = document.getElementById("dialFormInterviewAt");
  if (interviewField && interviewInput) {
    interviewField.classList.toggle("hidden", !shouldShow);
    interviewInput.required = shouldShow;
    if (!shouldShow) interviewInput.value = "";
  }
  const advisorField = document.getElementById("dialFormAdvisorField");
  const advisorSelect = document.getElementById("dialFormAdvisorUserId");
  if (advisorField && advisorSelect) {
    advisorField.classList.toggle("hidden", !shouldShow);
    const hasOptions = Array.isArray(dialFormAdvisorOptions) && dialFormAdvisorOptions.length > 0;
    advisorSelect.required = shouldShow && hasOptions;
    if (!shouldShow) {
      advisorSelect.value = "";
    } else {
      syncDialFormAdvisorSelection({
        candidateId: (_b = document.getElementById("dialFormCandidateId")) == null ? void 0 : _b.value,
        candidateName: ((_c = document.getElementById("dialFormCandidateName")) == null ? void 0 : _c.value) || "",
        preserveCurrent: true
      });
      void refreshDialFormAdvisorSchedules();
    }
    updateAdvisorPlannedDisplay();
  }
}
function updateSmsFormInterviewFieldVisibility(resultValue) {
  var _a, _b, _c;
  const shouldShow = shouldRequireInterview(resultValue ?? ((_a = document.getElementById("smsFormResult")) == null ? void 0 : _a.value));
  const interviewField = document.getElementById("smsFormInterviewField");
  const interviewInput = document.getElementById("smsFormInterviewAt");
  if (interviewField && interviewInput) {
    interviewField.classList.toggle("hidden", !shouldShow);
    interviewInput.required = shouldShow;
    if (!shouldShow) interviewInput.value = "";
  }
  const advisorField = document.getElementById("smsFormAdvisorField");
  const advisorSelect = document.getElementById("smsFormAdvisorUserId");
  if (advisorField && advisorSelect) {
    advisorField.classList.toggle("hidden", !shouldShow);
    const hasOptions = Array.isArray(dialFormAdvisorOptions) && dialFormAdvisorOptions.length > 0;
    advisorSelect.required = shouldShow && hasOptions;
    if (!shouldShow) {
      advisorSelect.value = "";
    } else {
      syncSmsFormAdvisorSelection({
        candidateId: (_b = document.getElementById("smsFormCandidateId")) == null ? void 0 : _b.value,
        candidateName: ((_c = document.getElementById("smsFormCandidateName")) == null ? void 0 : _c.value) || "",
        preserveCurrent: true
      });
      void refreshDialFormAdvisorSchedules();
    }
    updateAdvisorPlannedDisplay();
  }
}
function resetDialFormDefaults(clearMessage = true) {
  const dt = document.getElementById("dialFormCalledAt");
  if (dt) dt.value = nowLocalDateTime();
  syncDialFormCurrentUser();
  const route = document.getElementById("dialFormRoute");
  if (route) route.value = "\u96FB\u8A71";
  const callNo = document.getElementById("dialFormCallNo");
  if (callNo) callNo.value = "1";
  const result = document.getElementById("dialFormResult");
  if (result) result.value = "\u901A\u96FB";
  updateInterviewFieldVisibility(result == null ? void 0 : result.value);
  const advisorSelect = document.getElementById("dialFormAdvisorUserId");
  if (advisorSelect) advisorSelect.value = "";
  updateAdvisorPlannedDisplay();
  const memo = document.getElementById("dialFormMemo");
  if (memo) memo.value = "";
  const msg = document.getElementById("dialFormMessage");
  if (msg && clearMessage) msg.textContent = "";
}
function resetSmsFormDefaults(clearMessage = true) {
  const dt = document.getElementById("smsFormCalledAt");
  if (dt) dt.value = nowLocalDateTime();
  syncDialFormCurrentUser();
  const route = document.getElementById("smsFormRoute");
  if (route) route.value = "\u305D\u306E\u4ED6";
  const result = document.getElementById("smsFormResult");
  if (result) result.value = "\u8FD4\u4FE1";
  updateSmsFormInterviewFieldVisibility(result == null ? void 0 : result.value);
  const advisorSelect = document.getElementById("smsFormAdvisorUserId");
  if (advisorSelect) advisorSelect.value = "";
  updateAdvisorPlannedDisplay();
  const memo = document.getElementById("smsFormMemo");
  if (memo) memo.value = "";
  const msg = document.getElementById("smsFormMessage");
  if (msg && clearMessage) msg.textContent = "";
}
function bindDialForm() {
  const candidateInput = document.getElementById("dialFormCandidateName");
  const resultSelect = document.getElementById("dialFormResult");
  const advisorSelect = document.getElementById("dialFormAdvisorUserId");
  if (candidateInput) {
    ["change", "blur", "input"].forEach(
      (ev) => candidateInput.addEventListener(ev, () => {
        const val = candidateInput.value.trim();
        updateCallNoAndRoute(val);
        const foundId = findCandidateIdByName(val);
        const hiddenId = document.getElementById("dialFormCandidateId");
        if (hiddenId && foundId) {
          hiddenId.value = foundId;
        }
        syncDialFormAdvisorSelection({
          candidateId: foundId ?? (hiddenId == null ? void 0 : hiddenId.value),
          candidateName: val
        });
      })
    );
  }
  if (resultSelect) {
    resultSelect.addEventListener("change", () => updateInterviewFieldVisibility(resultSelect.value));
    updateInterviewFieldVisibility(resultSelect.value);
  }
  if (advisorSelect) {
    advisorSelect.addEventListener("change", () => {
      updateAdvisorPlannedDisplay();
      void refreshDialFormAdvisorSchedules();
    });
  }
  const advisorCards = document.getElementById("dialFormAdvisorPlannedCards");
  if (advisorCards) {
    advisorCards.addEventListener("click", (event) => {
      const button = event.target.closest("[data-advisor-id]");
      if (!button) return;
      const advisorId = button.getAttribute("data-advisor-id");
      if (!advisorId) return;
      setDialFormAdvisorSelection(advisorId);
    });
  }
  const mineCandidatesList = document.getElementById("dialFormMineCandidatesList");
  if (mineCandidatesList) {
    mineCandidatesList.addEventListener("click", (event) => {
      const button = event.target.closest('[data-action="select-my-candidate"]');
      if (!button) return;
      const selectedName = String(button.getAttribute("data-candidate-name") || "").trim();
      const selectedId = toPositiveInt(button.getAttribute("data-candidate-id"));
      if (!selectedName) return;
      if (candidateInput) {
        candidateInput.value = selectedName;
      }
      const hiddenId = document.getElementById("dialFormCandidateId");
      if (hiddenId && selectedId) {
        hiddenId.value = String(selectedId);
      }
      updateCallNoAndRoute(selectedName);
      syncDialFormAdvisorSelection({
        candidateId: selectedId ?? (hiddenId == null ? void 0 : hiddenId.value),
        candidateName: selectedName
      });
      candidateInput == null ? void 0 : candidateInput.focus();
    });
  }
  const submitBtn = document.getElementById("dialFormSubmit");
  if (!submitBtn) return;
  submitBtn.addEventListener("click", async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const msg = document.getElementById("dialFormMessage");
    if (msg) msg.textContent = "";
    const candidateName = (((_a = document.getElementById("dialFormCandidateName")) == null ? void 0 : _a.value) || "").trim();
    let candidateId = Number((_b = document.getElementById("dialFormCandidateId")) == null ? void 0 : _b.value);
    if (!candidateId && candidateName) {
      candidateId = findCandidateIdByName(candidateName);
    }
    const candidateIdValue = Number.isFinite(candidateId) && candidateId > 0 ? candidateId : null;
    const calledAtLocal = ((_c = document.getElementById("dialFormCalledAt")) == null ? void 0 : _c.value) || nowLocalDateTime();
    const calledAt = localDateTimeToRfc3339(calledAtLocal);
    const route = "\u96FB\u8A71";
    const result = ((_d = document.getElementById("dialFormResult")) == null ? void 0 : _d.value) || "\u901A\u96FB";
    const interviewAtLocal = ((_e = document.getElementById("dialFormInterviewAt")) == null ? void 0 : _e.value) || "";
    const advisorUserIdRaw = (_f = document.getElementById("dialFormAdvisorUserId")) == null ? void 0 : _f.value;
    const advisorUserIdValue = toPositiveInt(advisorUserIdRaw);
    const needsInterview = shouldRequireInterview(result);
    const employee = resolveDialFormEmployeeName();
    const memo = ((_g = document.getElementById("dialFormMemo")) == null ? void 0 : _g.value) || "";
    const callNo = Number((_h = document.getElementById("dialFormCallNo")) == null ? void 0 : _h.value);
    if (!candidateName) {
      if (msg) msg.textContent = "\u5019\u88DC\u8005\u540D\u306F\u5FC5\u9808\u3067\u3059";
      return;
    }
    if (!calledAt) {
      if (msg) msg.textContent = "\u65E5\u6642\u306F\u5FC5\u9808\u3067\u3059";
      return;
    }
    if (!employee) {
      if (msg) msg.textContent = "\u30ED\u30B0\u30A4\u30F3\u30E6\u30FC\u30B6\u30FC\u60C5\u5831\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
      return;
    }
    if (needsInterview && !interviewAtLocal) {
      if (msg) msg.textContent = "\u30A2\u30DD\u7D50\u679C\u304C\u8A2D\u5B9A\u306E\u5834\u5408\u306F\u521D\u56DE\u9762\u8AC7\u65E5\u6642\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044";
      return;
    }
    if (needsInterview && !candidateIdValue) {
      if (msg) msg.textContent = "\u521D\u56DE\u9762\u8AC7\u65E5\u6642\u306E\u767B\u9332\u306B\u306F\u5019\u88DC\u8005\u3092\u4E00\u89A7\u304B\u3089\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044";
      return;
    }
    if (needsInterview) {
      const advisorSelect2 = document.getElementById("dialFormAdvisorUserId");
      const hasAdvisorOptions = Array.isArray(dialFormAdvisorOptions) && dialFormAdvisorOptions.length > 0;
      if (advisorSelect2 && hasAdvisorOptions && !advisorUserIdValue) {
        if (msg) msg.textContent = "\u30A2\u30DD\u7D50\u679C\u304C\u8A2D\u5B9A\u306E\u5834\u5408\u306F\u62C5\u5F53\u30A2\u30C9\u30D0\u30A4\u30B6\u30FC\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044";
        return;
      }
    }
    let callerUserId = resolveDialFormCallerUserId(employee);
    if (!callerUserId) {
      console.warn("\u793E\u54E1ID\u304C\u7279\u5B9A\u3067\u304D\u306A\u3044\u305F\u3081\u3001\u30C7\u30E2\u7528ID(1)\u3092\u4F7F\u7528\u3057\u307E\u3059");
      callerUserId = 1;
    }
    try {
      const payload = {
        candidateName,
        callerUserId,
        calledAt,
        route,
        result,
        memo
      };
      if (candidateIdValue) payload.candidateId = candidateIdValue;
      if (Number.isFinite(callNo) && callNo > 0) payload.callNo = callNo;
      const res = await fetch(TELEAPO_LOGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      let responseJson = null;
      try {
        responseJson = await res.json();
      } catch (e) {
        responseJson = null;
      }
      const responseId = (responseJson == null ? void 0 : responseJson.id) ?? (responseJson == null ? void 0 : responseJson.log_id) ?? (responseJson == null ? void 0 : responseJson.logId) ?? ((_i = responseJson == null ? void 0 : responseJson.item) == null ? void 0 : _i.id) ?? ((_j = responseJson == null ? void 0 : responseJson.data) == null ? void 0 : _j.id) ?? null;
      setLogHighlightTarget({
        id: responseId,
        candidateId: candidateIdValue,
        calledAt,
        callerUserId,
        candidateName
      });
      const pendingLog = buildPendingTeleapoLog({
        id: responseId,
        candidateId: candidateIdValue,
        candidateName,
        calledAt,
        employee,
        route,
        result,
        memo,
        callerUserId
      });
      addPendingTeleapoLog(pendingLog);
      teleapoLogData = mergePendingLogs(teleapoLogData);
      annotateCallAttempts(teleapoLogData);
      applyFilters();
      const postSaveWarnings = [];
      if (candidateIdValue) {
        try {
          await updateCandidateCsOwner(candidateIdValue, callerUserId);
        } catch (err) {
          postSaveWarnings.push("\u62C5\u5F53CS\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
          console.error("candidate cs update error:", err);
        }
      }
      if (needsInterview && candidateIdValue) {
        const interviewAt = localDateTimeToRfc3339(interviewAtLocal);
        try {
          await updateCandidateFirstInterview(candidateIdValue, interviewAt, advisorUserIdValue);
        } catch (err) {
          postSaveWarnings.push(
            advisorUserIdValue ? "\u521D\u56DE\u9762\u8AC7\u65E5\u6642\u30FB\u62C5\u5F53\u30A2\u30C9\u30D0\u30A4\u30B6\u30FC\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F" : "\u521D\u56DE\u9762\u8AC7\u65E5\u6642\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F"
          );
          console.error("candidate interview update error:", err);
        }
        try {
          await refreshDialFormAdvisorSchedules({ force: true });
        } catch (refreshError) {
          console.warn("[teleapo] failed to refresh advisor schedules after save:", refreshError);
        }
      }
      if (msg) {
        const warningText = postSaveWarnings.length ? `\uFF08${postSaveWarnings.join(" / ")}\uFF09` : "";
        msg.className = `teleapo-form-message text-sm ${warningText ? "text-amber-600" : "text-emerald-600"} font-semibold`;
        msg.textContent = `\u67B6\u96FB\u30ED\u30B0\u306B\u8FFD\u52A0\u3057\u307E\u3057\u305F${warningText}`;
        setTimeout(() => msg.textContent = "", 3e3);
      }
      resetDialFormDefaults(false);
      const cInput = document.getElementById("dialFormCandidateName");
      if (cInput) cInput.value = "";
      const hInput = document.getElementById("dialFormCandidateId");
      if (hInput) hInput.value = "";
      await loadTeleapoData();
    } catch (err) {
      console.error(err);
      if (msg) {
        msg.className = "teleapo-form-message text-sm text-red-600 font-semibold";
        msg.textContent = "\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F: " + err.message;
      }
    }
  });
}
function bindSmsForm() {
  const candidateInput = document.getElementById("smsFormCandidateName");
  const resultSelect = document.getElementById("smsFormResult");
  const advisorSelect = document.getElementById("smsFormAdvisorUserId");
  if (candidateInput) {
    ["change", "blur", "input"].forEach(
      (ev) => candidateInput.addEventListener(ev, () => {
        const val = candidateInput.value.trim();
        const foundId = findCandidateIdByName(val);
        const hiddenId = document.getElementById("smsFormCandidateId");
        if (hiddenId) {
          hiddenId.value = foundId ? String(foundId) : "";
        }
        syncSmsFormAdvisorSelection({
          candidateId: foundId ?? (hiddenId == null ? void 0 : hiddenId.value),
          candidateName: val
        });
      })
    );
  }
  if (resultSelect) {
    resultSelect.addEventListener("change", () => updateSmsFormInterviewFieldVisibility(resultSelect.value));
    updateSmsFormInterviewFieldVisibility(resultSelect.value);
  }
  if (advisorSelect) {
    advisorSelect.addEventListener("change", () => {
      updateAdvisorPlannedDisplay();
      void refreshDialFormAdvisorSchedules();
    });
  }
  const advisorCards = document.getElementById("smsFormAdvisorPlannedCards");
  if (advisorCards) {
    advisorCards.addEventListener("click", (event) => {
      const button = event.target.closest("[data-advisor-id]");
      if (!button) return;
      const advisorId = button.getAttribute("data-advisor-id");
      if (!advisorId) return;
      setSmsFormAdvisorSelection(advisorId);
    });
  }
  const submitBtn = document.getElementById("smsFormSubmit");
  if (!submitBtn) return;
  submitBtn.addEventListener("click", async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const msg = document.getElementById("smsFormMessage");
    if (msg) msg.textContent = "";
    const candidateName = (((_a = document.getElementById("smsFormCandidateName")) == null ? void 0 : _a.value) || "").trim();
    let candidateId = Number((_b = document.getElementById("smsFormCandidateId")) == null ? void 0 : _b.value);
    if (!candidateId && candidateName) {
      candidateId = findCandidateIdByName(candidateName);
    }
    const candidateIdValue = Number.isFinite(candidateId) && candidateId > 0 ? candidateId : null;
    const calledAtLocal = ((_c = document.getElementById("smsFormCalledAt")) == null ? void 0 : _c.value) || nowLocalDateTime();
    const calledAt = localDateTimeToRfc3339(calledAtLocal);
    const route = "\u305D\u306E\u4ED6";
    const result = ((_d = document.getElementById("smsFormResult")) == null ? void 0 : _d.value) || "\u8FD4\u4FE1";
    const interviewAtLocal = ((_e = document.getElementById("smsFormInterviewAt")) == null ? void 0 : _e.value) || "";
    const advisorUserIdRaw = (_f = document.getElementById("smsFormAdvisorUserId")) == null ? void 0 : _f.value;
    const advisorUserIdValue = toPositiveInt(advisorUserIdRaw);
    const needsInterview = shouldRequireInterview(result);
    const employee = resolveDialFormEmployeeName();
    const memo = ((_g = document.getElementById("smsFormMemo")) == null ? void 0 : _g.value) || "";
    if (!candidateName) {
      if (msg) msg.textContent = "\u5019\u88DC\u8005\u540D\u306F\u5FC5\u9808\u3067\u3059";
      return;
    }
    if (!calledAt) {
      if (msg) msg.textContent = "\u65E5\u6642\u306F\u5FC5\u9808\u3067\u3059";
      return;
    }
    if (!employee) {
      if (msg) msg.textContent = "\u30ED\u30B0\u30A4\u30F3\u30E6\u30FC\u30B6\u30FC\u60C5\u5831\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
      return;
    }
    if (needsInterview && !interviewAtLocal) {
      if (msg) msg.textContent = "\u30A2\u30DD\u7D50\u679C\u304C\u8A2D\u5B9A\u306E\u5834\u5408\u306F\u9762\u8AC7\u8A2D\u5B9A\u65E5\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044";
      return;
    }
    if (needsInterview && !candidateIdValue) {
      if (msg) msg.textContent = "\u9762\u8AC7\u8A2D\u5B9A\u65E5\u306E\u767B\u9332\u306B\u306F\u5019\u88DC\u8005\u3092\u4E00\u89A7\u304B\u3089\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044";
      return;
    }
    if (needsInterview) {
      const hasAdvisorOptions = Array.isArray(dialFormAdvisorOptions) && dialFormAdvisorOptions.length > 0;
      if (hasAdvisorOptions && !advisorUserIdValue) {
        if (msg) msg.textContent = "\u30A2\u30DD\u7D50\u679C\u304C\u8A2D\u5B9A\u306E\u5834\u5408\u306F\u62C5\u5F53\u30A2\u30C9\u30D0\u30A4\u30B6\u30FC\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044";
        return;
      }
    }
    let callerUserId = resolveDialFormCallerUserId(employee);
    if (!callerUserId) {
      console.warn("\u793E\u54E1ID\u304C\u7279\u5B9A\u3067\u304D\u306A\u3044\u305F\u3081\u3001\u30C7\u30E2\u7528ID(1)\u3092\u4F7F\u7528\u3057\u307E\u3059");
      callerUserId = 1;
    }
    try {
      const payload = {
        candidateName,
        callerUserId,
        calledAt,
        route,
        result,
        memo
      };
      if (candidateIdValue) payload.candidateId = candidateIdValue;
      const res = await fetch(TELEAPO_LOGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      let responseJson = null;
      try {
        responseJson = await res.json();
      } catch (e) {
        responseJson = null;
      }
      const responseId = (responseJson == null ? void 0 : responseJson.id) ?? (responseJson == null ? void 0 : responseJson.log_id) ?? (responseJson == null ? void 0 : responseJson.logId) ?? ((_h = responseJson == null ? void 0 : responseJson.item) == null ? void 0 : _h.id) ?? ((_i = responseJson == null ? void 0 : responseJson.data) == null ? void 0 : _i.id) ?? null;
      setLogHighlightTarget({
        id: responseId,
        candidateId: candidateIdValue,
        calledAt,
        callerUserId,
        candidateName
      });
      const pendingLog = buildPendingTeleapoLog({
        id: responseId,
        candidateId: candidateIdValue,
        candidateName,
        calledAt,
        employee,
        route,
        result,
        memo,
        callerUserId
      });
      addPendingTeleapoLog(pendingLog);
      teleapoLogData = mergePendingLogs(teleapoLogData);
      annotateCallAttempts(teleapoLogData);
      applyFilters();
      const postSaveWarnings = [];
      if (candidateIdValue) {
        try {
          await updateCandidateCsOwner(candidateIdValue, callerUserId);
        } catch (err) {
          postSaveWarnings.push("\u62C5\u5F53CS\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
          console.error("candidate cs update error:", err);
        }
      }
      if (needsInterview && candidateIdValue) {
        const interviewAt = localDateTimeToRfc3339(interviewAtLocal);
        try {
          await updateCandidateFirstInterview(candidateIdValue, interviewAt, advisorUserIdValue);
        } catch (err) {
          postSaveWarnings.push(
            advisorUserIdValue ? "\u9762\u8AC7\u8A2D\u5B9A\u65E5\u30FB\u62C5\u5F53\u30A2\u30C9\u30D0\u30A4\u30B6\u30FC\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F" : "\u9762\u8AC7\u8A2D\u5B9A\u65E5\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F"
          );
          console.error("candidate interview update error:", err);
        }
        try {
          await refreshDialFormAdvisorSchedules({ force: true });
        } catch (refreshError) {
          console.warn("[teleapo] failed to refresh advisor schedules after sms save:", refreshError);
        }
      }
      if (msg) {
        const warningText = postSaveWarnings.length ? `\uFF08${postSaveWarnings.join(" / ")}\uFF09` : "";
        msg.className = `teleapo-form-message text-sm ${warningText ? "text-amber-600" : "text-emerald-600"} font-semibold`;
        msg.textContent = `SMS\u9023\u7D61\u30ED\u30B0\u306B\u8FFD\u52A0\u3057\u307E\u3057\u305F${warningText}`;
        setTimeout(() => {
          if (msg.textContent === `SMS\u9023\u7D61\u30ED\u30B0\u306B\u8FFD\u52A0\u3057\u307E\u3057\u305F${warningText}`) {
            msg.textContent = "";
          }
        }, 3e3);
      }
      resetSmsFormDefaults(false);
      const cInput = document.getElementById("smsFormCandidateName");
      if (cInput) cInput.value = "";
      const hInput = document.getElementById("smsFormCandidateId");
      if (hInput) hInput.value = "";
      await loadTeleapoData();
    } catch (err) {
      console.error(err);
      if (msg) {
        msg.className = "teleapo-form-message text-sm text-red-600 font-semibold";
        msg.textContent = "\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F: " + err.message;
      }
    }
  });
}
async function updateCandidateFirstInterview(candidateId, interviewDate, advisorUserId = null) {
  var _a, _b;
  const idNum = Number(candidateId);
  if (!Number.isFinite(idNum) || idNum <= 0) return null;
  const url = getCandidateDetailApiUrl(idNum);
  if (!url) return null;
  const session = getSession();
  const token = session == null ? void 0 : session.token;
  if (!token) throw new Error("\u8A8D\u8A3C\u30C8\u30FC\u30AF\u30F3\u304C\u3042\u308A\u307E\u305B\u3093");
  const body = {
    detailMode: true,
    firstInterviewDate: interviewDate,
    phase: "\u4E00\u6B21\u9762\u8AC7\u8A2D\u5B9A",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const advisorId = toPositiveInt(advisorUserId);
  if (advisorId) {
    body.advisorUserId = advisorId;
  }
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const updated = await res.json();
  const normalizedUpdated = normalizeCandidateDetail(updated) || updated;
  if (candidateDetailCache) {
    candidateDetailCache.set(idNum, normalizedUpdated);
  }
  const masterEntry = findTeleapoCandidate({ candidateId: idNum });
  if (masterEntry) {
    const advisorId2 = toPositiveInt((normalizedUpdated == null ? void 0 : normalizedUpdated.advisorUserId) ?? (normalizedUpdated == null ? void 0 : normalizedUpdated.advisor_user_id));
    const advisorName = String((normalizedUpdated == null ? void 0 : normalizedUpdated.advisorName) ?? (normalizedUpdated == null ? void 0 : normalizedUpdated.advisor_name) ?? "").trim();
    if (advisorId2) {
      masterEntry.advisorUserId = advisorId2;
      masterEntry.advisor_user_id = advisorId2;
    }
    if (advisorName) {
      masterEntry.advisorName = advisorName;
      masterEntry.advisor_name = advisorName;
    }
  }
  refreshDialFormAdvisorSelect(teleapoCandidateMaster);
  syncDialFormAdvisorSelection({
    candidateId: idNum,
    candidateName: ((_a = document.getElementById("dialFormCandidateName")) == null ? void 0 : _a.value) || "",
    preserveCurrent: true
  });
  syncSmsFormAdvisorSelection({
    candidateId: idNum,
    candidateName: ((_b = document.getElementById("smsFormCandidateName")) == null ? void 0 : _b.value) || "",
    preserveCurrent: true
  });
  return normalizedUpdated;
}
async function updateCandidateCsOwner(candidateId, csUserId) {
  const idNum = Number(candidateId);
  if (!Number.isFinite(idNum) || idNum <= 0) return null;
  const csId = toPositiveInt(csUserId);
  if (!csId) return null;
  const url = getCandidateDetailApiUrl(idNum);
  if (!url) return null;
  const session = getSession();
  const token = session == null ? void 0 : session.token;
  if (!token) throw new Error("\u8A8D\u8A3C\u30C8\u30FC\u30AF\u30F3\u304C\u3042\u308A\u307E\u305B\u3093");
  const body = {
    detailMode: true,
    csUserId: csId,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const updated = await res.json();
  const normalizedUpdated = normalizeCandidateDetail(updated) || updated;
  if (candidateDetailCache) {
    candidateDetailCache.set(idNum, normalizedUpdated);
  }
  const masterEntry = findTeleapoCandidate({ candidateId: idNum });
  if (masterEntry) {
    const partnerId = toPositiveInt(
      (normalizedUpdated == null ? void 0 : normalizedUpdated.partnerUserId) ?? (normalizedUpdated == null ? void 0 : normalizedUpdated.partner_user_id) ?? (normalizedUpdated == null ? void 0 : normalizedUpdated.csUserId) ?? (normalizedUpdated == null ? void 0 : normalizedUpdated.cs_user_id)
    );
    const partnerName = String((normalizedUpdated == null ? void 0 : normalizedUpdated.partnerName) ?? (normalizedUpdated == null ? void 0 : normalizedUpdated.partner_name) ?? "").trim();
    if (partnerId) {
      masterEntry.partnerUserId = partnerId;
      masterEntry.partner_user_id = partnerId;
      masterEntry.csUserId = partnerId;
      masterEntry.cs_user_id = partnerId;
    }
    if (partnerName) {
      masterEntry.partnerName = partnerName;
      masterEntry.partner_name = partnerName;
    }
  }
  refreshCandidateDatalist();
  return normalizedUpdated;
}
function initDialForm() {
  var _a;
  syncDialFormCurrentUser();
  resetDialFormDefaults();
  refreshCandidateDatalist();
  refreshDialFormAdvisorSelect(teleapoCandidateMaster);
  updateInterviewFieldVisibility((_a = document.getElementById("dialFormResult")) == null ? void 0 : _a.value);
  bindDialForm();
}
function initSmsForm() {
  var _a;
  syncDialFormCurrentUser();
  resetSmsFormDefaults();
  refreshCandidateDatalist();
  refreshDialFormAdvisorSelect(teleapoCandidateMaster);
  updateSmsFormInterviewFieldVisibility((_a = document.getElementById("smsFormResult")) == null ? void 0 : _a.value);
  bindSmsForm();
}
export {
  mount
};
