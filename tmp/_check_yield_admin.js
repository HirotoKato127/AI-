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
  const token = getSession()?.token;
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
    const message = data?.error || data?.message || `HTTP ${res.status}`;
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
    const message = data?.error || data?.message || `HTTP ${res.status}`;
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
  const items = Array.isArray(data?.items) ? data.items : [];
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
    (data?.settings || []).forEach((item) => {
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
    targetTotal: Number(data?.targetTotal || 0),
    dailyTargets: data?.dailyTargets || {}
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
  const rule = normalizeRule(ruleInput);
  switch (rule.type) {
    case "half-month":
      return buildHalfMonthPeriods();
    case "master-month":
      return buildMasterMonthPeriods();
    case "weekly":
      return buildWeeklyPeriods(rule.options?.startWeekday || "monday");
    case "quarterly":
      return buildQuarterlyPeriods(rule.options?.fiscalStartMonth || 1);
    case "custom-month":
      return buildCustomMonthPeriods(rule.options?.startDay || 1, rule.options?.endDay || 31);
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
  const num2 = Number(day);
  if (!Number.isFinite(num2)) return 1;
  return Math.min(31, Math.max(1, Math.round(num2)));
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
    if (!period?.startDate || !period?.endDate) return false;
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
  const session = getSession();
  const sessionId = Number(session?.user?.id);
  if (Number.isFinite(sessionId) && sessionId > 0) {
    if (!advisorName || session?.user?.name === advisorName) {
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
    type: data?.evaluation_rule_type || DEFAULT_RULE.type,
    options: data?.evaluation_rule_options || {}
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
  const target = normalizeTarget(data?.targets || {});
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
  const target = normalizeTarget(data?.targets || {});
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
  const raw = data?.dailyTargets || {};
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
  const items = Array.isArray(data?.items) ? data.items : data?.targetsByAdvisor && typeof data.targetsByAdvisor === "object" ? Object.entries(data.targetsByAdvisor).map(([advisorUserId, targets]) => ({
    advisorUserId,
    targets
  })) : [];
  items.forEach((item) => {
    const advisorUserId = Number(item?.advisorUserId ?? item?.advisor_user_id);
    if (!Number.isFinite(advisorUserId) || advisorUserId <= 0) return;
    const target = normalizeTarget(item?.targets || {});
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
  const items = Array.isArray(data?.items) ? data.items : data?.dailyTargetsByAdvisor && typeof data.dailyTargetsByAdvisor === "object" ? Object.entries(data.dailyTargetsByAdvisor).map(([advisorUserId, dailyTargets]) => ({
    advisorUserId,
    dailyTargets
  })) : [];
  items.forEach((item) => {
    const advisorUserId = Number(item?.advisorUserId ?? item?.advisor_user_id);
    if (!Number.isFinite(advisorUserId) || advisorUserId <= 0) return;
    const raw = item?.dailyTargets || {};
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
      const next = current.filter((item) => Number(item?.userId || item?.user_id) !== Number(userId));
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
    return period?.id || null;
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
    return map?.[metricKey] || null;
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

// scripts/mock/metrics.js
var today = /* @__PURE__ */ new Date();
var TOTAL_MONTHS = 36;
var monthKey = (offset = 0) => {
  const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
};
var personalBaseRow = (offset = 0) => {
  const period = monthKey(offset);
  const seed = TOTAL_MONTHS - offset;
  return {
    period,
    date: period,
    new_interviews: 30 + seed * 2,
    proposals: 24 + seed,
    recommendations: 20 + seed,
    interviews_scheduled: 18 + seed,
    interviews_held: 15 + seed,
    offers: 8 + seed,
    accepts: 6 + seed,
    proposal_rate: 80,
    recommendation_rate: 75,
    interview_schedule_rate: 110,
    interview_held_rate: 90,
    offer_rate: 55,
    accept_rate: 65,
    hire_rate: 50,
    prev_new_interviews: 28 + seed,
    prev_proposals: 22 + seed,
    prev_recommendations: 19 + seed,
    prev_interviews_scheduled: 17 + seed,
    prev_interviews_held: 14 + seed,
    prev_offers: 7 + seed
  };
};
var mockPersonalRows = Array.from({ length: TOTAL_MONTHS }, (_, idx) => personalBaseRow(idx));
var mockCompanyRows = mockPersonalRows.map((row, idx) => ({
  ...row,
  date: row.date,
  period: row.period,
  new_interviews: row.new_interviews * 5,
  proposals: row.proposals * 4,
  recommendations: row.recommendations * 4,
  interviews_scheduled: row.interviews_scheduled * 3.5,
  interviews_held: row.interviews_held * 3.2,
  offers: row.offers * 3,
  accepts: row.accepts * 3,
  prev_new_interviews: row.prev_new_interviews * 5,
  prev_proposals: row.prev_proposals * 4,
  prev_recommendations: row.prev_recommendations * 4,
  prev_interviews_scheduled: row.prev_interviews_scheduled * 3.5,
  prev_interviews_held: row.prev_interviews_held * 3.2,
  prev_offers: row.prev_offers * 3,
  id: idx + 1
}));
var mockEmployeeRows = ["A", "B", "C", "D"].map((name, idx) => ({
  user_id: `emp-${idx + 1}`,
  user_name: `Mock ${name}`,
  user_email: `mock${name.toLowerCase()}@example.com`,
  new_interviews: 25 + idx * 3,
  proposals: 20 + idx * 5,
  recommendations: 15 + idx * 4,
  interviews_scheduled: 10 + idx * 3,
  interviews_held: 8 + idx * 2,
  offers: 5 + idx,
  accepts: 3 + idx,
  proposal_rate: 75 - idx * 2,
  recommendation_rate: 70 - idx,
  interview_schedule_rate: 110 - idx * 2,
  interview_held_rate: 90 - idx,
  offer_rate: 50 + idx,
  accept_rate: 60 + idx,
  hire_rate: 40 + idx,
  trend: mockPersonalRows.map((row) => ({
    period: row.period,
    value: 5 + idx + Math.floor(Math.random() * 4)
  }))
}));

// pages/yield/yield.js?v=20260219_32
var YIELD_API_BASE = "https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod";
var KPI_API_BASE = `${YIELD_API_BASE}/kpi`;
var MEMBERS_API_BASE = YIELD_API_BASE;
var MEMBERS_LIST_PATH = "/members";
var KPI_YIELD_PATH = "/yield";
var KPI_YIELD_TREND_PATH = "/yield/trend";
var KPI_YIELD_BREAKDOWN_PATH = "/yield/breakdown";
var KPI_TARGETS_PATH = "/kpi-targets";
var DEFAULT_ADVISOR_USER_ID = 30;
var DEFAULT_CALC_MODE = "cohort";
var DEFAULT_RATE_CALC_MODE = "base";
var RATE_CALC_MODE_STORAGE_KEY = "yieldRateCalcMode.v1";
var YIELD_UI_VERSION = "20260211_01";
var MODE_SCOPE_KEYS = ["personalMonthly", "personalPeriod", "companyMonthly", "companyPeriod", "companyTerm", "employee"];
if (typeof window !== "undefined") {
  window.__yieldVersion = YIELD_UI_VERSION;
}
async function fetchJson(url, params = {}) {
  const normalizedParams = { ...params || {} };
  const isMsRequest = String(normalizedParams.ms || "") === "1" || normalizedParams.ms === true;
  if (isMsRequest) {
    normalizedParams.calcMode = "period";
    normalizedParams.countBasis = "event";
    normalizedParams.timeBasis = "event";
  }
  const query = new URLSearchParams(normalizedParams);
  const res = await fetch(`${url}?${query.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
async function fetchKpiTargetsFromApi(period) {
  try {
    const session = getSession();
    const headers = { Accept: "application/json" };
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    const res = await fetch(`${MEMBERS_API_BASE}${KPI_TARGETS_PATH}?period=${period}`, { headers });
    if (res.status === 404) return {};
    if (!res.ok) throw new Error(`kpi targets error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("[yield] fetchKpiTargets failed", err);
    return {};
  }
}
async function saveKpiTargetsToApi(period, targets) {
  const session = getSession();
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  const payload = { period, targets };
  const res = await fetch(`${MEMBERS_API_BASE}${KPI_TARGETS_PATH}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`save kpi targets error ${res.status}`);
  return res.json();
}
var membersCache = [];
var membersPromise = null;
function normalizeMembers(payload) {
  const raw = Array.isArray(payload) ? payload : payload?.items || payload?.members || payload?.users || [];
  if (!Array.isArray(raw)) {
    console.warn("[DEBUG] normalizeMembers: raw payload is not an array", payload);
    return [];
  }
  const normalized = raw.map((member) => ({
    id: member.id ?? member.user_id ?? member.userId,
    name: member.name || member.fullName || member.displayName || "",
    email: member.email || member.user_email || member.userEmail || member.mail || "",
    role: member.role || (member.is_admin ? "admin" : "member"),
    raw: member
    // for debugging
  })).filter((member) => member.id != null && member.id !== "");
  console.log("[DEBUG] normalizeMembers input count:", raw.length);
  console.log("[DEBUG] normalizeMembers output count:", normalized.length);
  if (raw.length > 0 && normalized.length === 0) {
    console.warn("[DEBUG] All members were filtered out! Sample raw member:", raw[0]);
  }
  return normalized;
}
async function ensureMembersList({ force = false } = {}) {
  if (!force && membersCache.length) return membersCache;
  if (membersPromise) return membersPromise;
  membersPromise = (async () => {
    try {
      const session = getSession();
      const headers = { Accept: "application/json" };
      if (session?.token) headers.Authorization = `Bearer ${session.token}`;
      const res = await fetch(`${MEMBERS_API_BASE}${MEMBERS_LIST_PATH}`, { headers });
      if (!res.ok) throw new Error(`members HTTP ${res.status}`);
      const json = await res.json();
      membersCache = normalizeMembers(json);
      return membersCache;
    } catch (error) {
      console.warn("[yield] failed to load members", error);
      membersCache = [];
      return membersCache;
    } finally {
      membersPromise = null;
    }
  })();
  return membersPromise;
}
function normalizeAdvisorId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function isAdvisorRole(role) {
  return String(role || "").toLowerCase().includes("advisor");
}
var MS_MARKETING_METRICS = [
  { key: "valid_applications", label: "\u6709\u52B9\u5FDC\u52DF\u6570", targetKey: "validApplications" }
];
var MS_CS_METRICS = [
  { key: "appointments", label: "\u8A2D\u5B9A\u6570", targetKey: "appointments" },
  { key: "sitting", label: "\u7740\u5EA7\u6570", targetKey: "sitting" }
];
var MS_SALES_METRICS = [
  { key: "new_interviews", label: "\u65B0\u898F\u9762\u8AC7\u6570", targetKey: "newInterviews" },
  { key: "proposals", label: "\u63D0\u6848\u6570", targetKey: "proposals" },
  { key: "recommendations", label: "\u63A8\u85A6\u6570", targetKey: "recommendations" },
  { key: "interviews_scheduled", label: "\u9762\u8AC7\u8A2D\u5B9A\u6570", targetKey: "interviewsScheduled" },
  { key: "interviews_held", label: "\u9762\u8AC7\u5B9F\u65BD\u6570", targetKey: "interviewsHeld" },
  { key: "offers", label: "\u5185\u5B9A\u6570", targetKey: "offers" },
  { key: "accepts", label: "\u627F\u8AFE\u6570", targetKey: "accepts" }
];
function mapRoleToDepartment(role) {
  const r = String(role || "").toLowerCase();
  if (!r) return "";
  if (r.includes("caller") || r.includes("call") || r.includes("teleapo") || r.includes("cs") || r.includes("support") || r.includes("customer_success")) return "cs";
  if (r.includes("marketer") || r.includes("marketing") || r.includes("market") || r.includes("admin")) return "marketing";
  if (r.includes("advisor") || r.includes("sales")) return "sales";
  return "";
}
function getDepartmentFromRole(role) {
  const mapped = mapRoleToDepartment(role);
  if (mapped) return mapped;
  return "sales";
}
function getMembersByDepartment(members, deptKey) {
  const result = (members || []).filter((m) => getDepartmentFromRole(m.role) === deptKey);
  if (result.length === 0 && members && members.length > 0) {
    console.warn(`[DEBUG] No members found for ${deptKey}. Sample roles:`, members.slice(0, 5).map((m) => `${m.name}:${m.role}`));
  }
  return result;
}
function normalizeCalcMode(value) {
  return String(value || "").toLowerCase() === "cohort" ? "cohort" : "period";
}
function resolveModeScope(scope) {
  const key = String(scope || "").trim();
  return key || "default";
}
function getCalcMode(scope = "default") {
  const key = resolveModeScope(scope);
  const scoped = key !== "default" ? state?.calcModes?.[key] : null;
  return normalizeCalcMode(scoped || state?.calcMode || DEFAULT_CALC_MODE);
}
function setCalcMode(scope, mode) {
  const key = resolveModeScope(scope);
  const normalized = normalizeCalcMode(mode);
  if (!state.calcModes) state.calcModes = {};
  state.calcModes[key] = normalized;
  if (key === "default") state.calcMode = normalized;
  return normalized;
}
function getCalcModeLabel(mode = getCalcMode()) {
  return normalizeCalcMode(mode) === "cohort" ? "\u5FDC\u52DF\u6708\u8A08\u4E0A" : "\u767A\u751F\u6708\u8A08\u4E0A";
}
function buildCalcModeParams(scope = "default") {
  const mode = getCalcMode(scope);
  const basis = mode === "cohort" ? "application" : "event";
  return {
    calcMode: mode,
    countBasis: basis,
    timeBasis: basis
  };
}
function buildMsCalcModeParams() {
  return {
    calcMode: "period",
    countBasis: "event",
    timeBasis: "event"
  };
}
function normalizeRateCalcMode(value) {
  return String(value || "").toLowerCase() === "step" ? "step" : "base";
}
function getRateModeStorageKey(scope = "default") {
  const key = resolveModeScope(scope);
  return `${RATE_CALC_MODE_STORAGE_KEY}.${key}`;
}
function getRateCalcMode(scope = "default") {
  const key = resolveModeScope(scope);
  const scoped = key !== "default" ? state?.rateCalcModes?.[key] : null;
  return normalizeRateCalcMode(scoped || state?.rateCalcMode || DEFAULT_RATE_CALC_MODE);
}
function setRateCalcMode(scope, mode) {
  const key = resolveModeScope(scope);
  const normalized = normalizeRateCalcMode(mode);
  if (!state.rateCalcModes) state.rateCalcModes = {};
  state.rateCalcModes[key] = normalized;
  if (key === "default") state.rateCalcMode = normalized;
  return normalized;
}
function getRateCalcModeLabel(mode = getRateCalcMode()) {
  return mode === "step" ? "\u30B9\u30C6\u30C3\u30D7\u8A08\u7B97" : "\u65B0\u898F\u9762\u8AC7\u6570\u304B\u3089";
}
async function mergeMembersWithDailyItems(items) {
  const members = await ensureMembersList();
  if (!members.length) return items;
  const map = /* @__PURE__ */ new Map();
  (items || []).forEach((item) => {
    const id = normalizeAdvisorId(item?.advisorUserId ?? item?.advisor_user_id ?? item?.id);
    if (!id) return;
    map.set(String(id), item);
  });
  const merged = members.map((member) => {
    const id = normalizeAdvisorId(member.id);
    const existing = id ? map.get(String(id)) : null;
    if (existing) {
      return {
        ...existing,
        advisorUserId: id,
        name: existing.name || member.name || `ID:${id}`
      };
    }
    return {
      advisorUserId: id,
      name: member.name || `ID:${id}`,
      series: {}
    };
  });
  const extras = (items || []).filter((item) => {
    const id = normalizeAdvisorId(item?.advisorUserId ?? item?.advisor_user_id ?? item?.id);
    return !id || !members.some((member) => String(member.id) === String(id));
  });
  return [...merged, ...extras];
}
async function mergeMembersWithKpiItems(items) {
  const members = await ensureMembersList();
  if (!members.length) return items;
  const map = /* @__PURE__ */ new Map();
  (items || []).forEach((item) => {
    const id = normalizeAdvisorId(item?.advisorUserId ?? item?.advisor_user_id ?? item?.id);
    if (!id) return;
    map.set(String(id), item);
  });
  const merged = members.map((member) => {
    const id = normalizeAdvisorId(member.id);
    const existing = id ? map.get(String(id)) : null;
    if (existing) {
      return {
        ...existing,
        advisorUserId: id,
        name: existing.name || member.name || `ID:${id}`
      };
    }
    return {
      advisorUserId: id,
      name: member.name || `ID:${id}`,
      kpi: {}
    };
  });
  const extras = (items || []).filter((item) => {
    const id = normalizeAdvisorId(item?.advisorUserId ?? item?.advisor_user_id ?? item?.id);
    return !id || !members.some((member) => String(member.id) === String(id));
  });
  return [...merged, ...extras];
}
var advisorUserIdCache = null;
var advisorUserIdCacheKey = null;
function resolveAdvisorCacheKey(session) {
  return session?.user?.id || session?.user?.email || session?.user?.name || "";
}
function parseAdvisorUserId(session) {
  const candidates = [
    session?.user?.advisorUserId,
    session?.user?.advisor_user_id,
    session?.user?.numericId,
    session?.user?.employeeId,
    session?.user?.userId,
    session?.user?.id,
    session?.advisorUserId,
    session?.advisor_user_id
  ];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}
async function resolveAdvisorUserId2() {
  const session = getSession();
  const cacheKey = resolveAdvisorCacheKey(session);
  if (advisorUserIdCacheKey && advisorUserIdCacheKey !== cacheKey) {
    advisorUserIdCache = null;
  }
  if (Number.isFinite(advisorUserIdCache) && advisorUserIdCache > 0) {
    return advisorUserIdCache;
  }
  const parsed = parseAdvisorUserId(session);
  if (parsed) {
    advisorUserIdCache = parsed;
    advisorUserIdCacheKey = cacheKey;
    console.log("[yield] advisorUserId from session", { rawId: session?.user?.id, advisorUserId: parsed });
    return parsed;
  }
  const members = await ensureMembersList();
  const sessionEmail = String(session?.user?.email || "").toLowerCase();
  const sessionName = String(session?.user?.name || "");
  let matched = null;
  if (sessionEmail) {
    matched = members.find((member) => String(member?.email || "").toLowerCase() === sessionEmail);
  }
  if (!matched && sessionName) {
    matched = members.find((member) => String(member?.name || "") === sessionName);
  }
  const mapped = normalizeAdvisorId(matched?.id);
  if (mapped) {
    advisorUserIdCache = mapped;
    advisorUserIdCacheKey = cacheKey;
    console.log("[yield] advisorUserId from members", { mapped });
    return mapped;
  }
  console.warn("[yield] advisorUserId fallback", { rawId: session?.user?.id, fallback: DEFAULT_ADVISOR_USER_ID });
  advisorUserIdCache = DEFAULT_ADVISOR_USER_ID;
  advisorUserIdCacheKey = cacheKey;
  return DEFAULT_ADVISOR_USER_ID;
}
async function resolveUserDepartmentKey() {
  const session = getSession();
  const roleCandidates = [
    session?.user?.role,
    session?.user?.department,
    session?.user?.division,
    session?.user?.team,
    session?.user?.jobTitle
  ];
  for (const candidate of roleCandidates) {
    const mapped2 = mapRoleToDepartment(candidate);
    if (mapped2) return mapped2;
  }
  const members = await ensureMembersList();
  const sessionEmail = String(session?.user?.email || "").toLowerCase();
  const sessionName = String(session?.user?.name || "");
  const sessionId = String(session?.user?.id || "");
  let matched = null;
  if (sessionId) matched = members.find((member) => String(member?.id || "") === sessionId);
  if (!matched && sessionEmail) {
    matched = members.find((member) => String(member?.email || "").toLowerCase() === sessionEmail);
  }
  if (!matched && sessionName) {
    matched = members.find((member) => String(member?.name || "") === sessionName);
  }
  const mapped = mapRoleToDepartment(matched?.role || "");
  return mapped || "sales";
}
async function fetchPersonalKpiFromApi({ startDate, endDate, planned = false, calcModeScope = "personalMonthly" }) {
  const advisorUserId = await resolveAdvisorUserId2();
  console.log("[yield] fetch personal kpi", { startDate, endDate, advisorUserId, planned });
  const params = {
    from: startDate,
    to: endDate,
    scope: "personal",
    advisorUserId,
    granularity: "summary",
    groupBy: "none",
    ...buildCalcModeParams(calcModeScope)
  };
  if (planned) params.planned = "1";
  const json = await fetchJson(`${KPI_API_BASE}${KPI_YIELD_PATH}`, params);
  console.log("[yield] personal kpi response", json);
  const kpi = json?.items?.[0]?.kpi || null;
  console.log("[yield] personal kpi fields", {
    revenue: kpi?.revenue,
    currentAmount: kpi?.currentAmount,
    revenueAmount: kpi?.revenueAmount,
    current_amount: kpi?.current_amount,
    revenue_amount: kpi?.revenue_amount,
    targetAmount: kpi?.targetAmount,
    revenueTarget: kpi?.revenueTarget,
    revenue_target: kpi?.revenue_target,
    achievementRate: kpi?.achievementRate
  });
  if (kpi && kpi.revenue === void 0 && kpi.currentAmount === void 0 && kpi.revenueAmount === void 0) {
    console.warn("[yield] personal kpi missing revenue fields", kpi);
  }
  return kpi;
}
async function fetchCompanyKpiFromApi({ startDate, endDate, msMode = false, calcModeScope = "companyMonthly" }) {
  const params = {
    from: startDate,
    to: endDate,
    scope: "company",
    granularity: "summary",
    groupBy: "none",
    ...msMode ? buildMsCalcModeParams() : buildCalcModeParams(calcModeScope)
  };
  if (msMode) {
    params.ms = "1";
  }
  const json = await fetchJson(`${KPI_API_BASE}${KPI_YIELD_PATH}`, params);
  console.log("[yield] company kpi response", json);
  const kpi = json?.items?.[0]?.kpi || null;
  console.log("[yield] company kpi fields", {
    revenue: kpi?.revenue,
    currentAmount: kpi?.currentAmount,
    revenueAmount: kpi?.revenueAmount,
    current_amount: kpi?.current_amount,
    revenue_amount: kpi?.revenue_amount,
    targetAmount: kpi?.targetAmount,
    revenueTarget: kpi?.revenueTarget,
    revenue_target: kpi?.revenue_target,
    achievementRate: kpi?.achievementRate
  });
  if (kpi && kpi.revenue === void 0 && kpi.currentAmount === void 0 && kpi.revenueAmount === void 0) {
    console.warn("[yield] company kpi missing revenue fields", kpi);
  }
  return kpi;
}
var dailyYieldCache = /* @__PURE__ */ new Map();
async function fetchDailyYieldFromApi({ startDate, endDate, advisorUserId, msMode = false, calcModeScope = "employee" }) {
  const params = {
    from: startDate,
    to: endDate,
    scope: "company",
    granularity: "day",
    groupBy: "advisor",
    ...msMode ? buildMsCalcModeParams() : buildCalcModeParams(calcModeScope)
  };
  if (msMode) {
    params.ms = "1";
  }
  console.log("[yield] fetch daily kpi", params);
  const json = await fetchJson(`${KPI_API_BASE}${KPI_YIELD_PATH}`, params);
  console.log("[DEBUG] fetchDailyYieldFromApi raw json:", JSON.stringify(json, null, 2));
  const rawItems = Array.isArray(json?.items) ? json.items : [];
  const items = await mergeMembersWithDailyItems(rawItems);
  const employees = items.map((item) => ({
    advisorUserId: item?.advisorUserId,
    name: item?.name || `ID:${item?.advisorUserId}`,
    daily: item?.series || {}
  }));
  const targetId = String(advisorUserId || "");
  const personalItem = items.find((item) => String(item?.advisorUserId || "") === targetId);
  return {
    personal: personalItem ? { advisorUserId, daily: personalItem.series || {} } : { advisorUserId, daily: {} },
    employees
  };
}
async function fetchYieldTrendFromApi({ startDate, endDate, scope, advisorUserId, granularity = "month", calcModeScope = "companyMonthly" }) {
  const params = {
    from: startDate,
    to: endDate,
    scope,
    granularity,
    ...buildCalcModeParams(calcModeScope)
  };
  if (Number.isFinite(advisorUserId) && advisorUserId > 0) {
    params.advisorUserId = advisorUserId;
  }
  const json = await fetchJson(`${KPI_API_BASE}${KPI_YIELD_TREND_PATH}`, params);
  const series = Array.isArray(json?.series) ? json.series : [];
  return {
    labels: series.map((item) => item.period),
    rates: series.map((item) => item.rates || {})
  };
}
async function fetchYieldBreakdownFromApi({ startDate, endDate, scope, advisorUserId, dimension, calcModeScope = "companyMonthly" }) {
  const params = {
    from: startDate,
    to: endDate,
    scope,
    dimension,
    ...buildCalcModeParams(calcModeScope)
  };
  if (Number.isFinite(advisorUserId) && advisorUserId > 0) {
    params.advisorUserId = advisorUserId;
  }
  const json = await fetchJson(`${KPI_API_BASE}${KPI_YIELD_BREAKDOWN_PATH}`, params);
  const items = Array.isArray(json?.items) ? json.items : [];
  return {
    labels: items.map((item) => item.label),
    data: items.map((item) => num(item.count))
  };
}
var csTeleapoCache = /* @__PURE__ */ new Map();
async function fetchCsTeleapoDaily({ startDate, endDate, callerUserId }) {
  const cacheKey = `${startDate}:${endDate}:${callerUserId || "all"}`;
  if (csTeleapoCache.has(cacheKey)) return csTeleapoCache.get(cacheKey);
  try {
    const params = {
      from: startDate,
      to: endDate,
      groupBy: "date"
    };
    if (Number.isFinite(callerUserId) && callerUserId > 0) {
      params.callerUserId = callerUserId;
    }
    const json = await fetchJson(`${KPI_API_BASE}/teleapo`, params);
    const rows = Array.isArray(json?.rows) ? json.rows : [];
    const dailyData = {};
    rows.forEach((row) => {
      const dateStr = row.date ? String(row.date).split("T")[0] : null;
      if (!dateStr) return;
      dailyData[dateStr] = {
        appointments: row.counts?.scheduledCalls || 0,
        // 設定数
        sitting: row.counts?.attendedCalls || 0
        // 着座数
      };
    });
    csTeleapoCache.set(cacheKey, dailyData);
    return dailyData;
  } catch (error) {
    console.error("[yield] fetchCsTeleapoDaily failed", error);
    return {};
  }
}
var marketingValidAppCache = /* @__PURE__ */ new Map();
async function fetchMarketingValidApplicationsDaily({ startDate, endDate }) {
  const cacheKey = `${startDate}:${endDate}`;
  if (marketingValidAppCache.has(cacheKey)) return marketingValidAppCache.get(cacheKey);
  try {
    const json = await fetchJson(`${YIELD_API_BASE}/candidates`, {
      from: startDate,
      to: endDate,
      effectiveOnly: true,
      groupBy: "date"
    });
    const items = Array.isArray(json?.items) ? json.items : [];
    const dailyData = {};
    items.forEach((item) => {
      const dateStr = item.date || item.created_at?.split("T")[0];
      if (!dateStr) return;
      if (!dailyData[dateStr]) {
        dailyData[dateStr] = { valid_applications: 0 };
      }
      dailyData[dateStr].valid_applications += 1;
    });
    marketingValidAppCache.set(cacheKey, dailyData);
    return dailyData;
  } catch (error) {
    console.error("[yield] fetchMarketingValidApplicationsDaily failed", error);
    return {};
  }
}
async function fetchCompanyEmployeeKpis({ startDate, endDate, calcModeScope = "employee" }) {
  const json = await fetchJson(`${KPI_API_BASE}${KPI_YIELD_PATH}`, {
    from: startDate,
    to: endDate,
    scope: "company",
    granularity: "summary",
    groupBy: "advisor",
    ...buildCalcModeParams(calcModeScope)
  });
  const items = Array.isArray(json?.items) ? json.items : [];
  return mergeMembersWithKpiItems(items);
}
async function fetchCompanyEmployeePlannedKpis({ baseDate, calcModeScope = "employee" }) {
  const date = baseDate || isoDate2(/* @__PURE__ */ new Date());
  const json = await fetchJson(`${KPI_API_BASE}${KPI_YIELD_PATH}`, {
    from: date,
    to: date,
    scope: "company",
    granularity: "summary",
    groupBy: "advisor",
    planned: "1",
    ...buildCalcModeParams(calcModeScope)
  });
  const items = Array.isArray(json?.items) ? json.items : [];
  return mergeMembersWithKpiItems(items);
}
function mapEmployeeKpiItems(items, { rateModeScope = "employee" } = {}) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    advisorUserId: item?.advisorUserId,
    name: item?.name || `ID:${item?.advisorUserId}`,
    ...normalizeKpi(item?.kpi || {}, { rateModeScope })
  }));
}
function applyDailyYieldResponse(periodId, payload, { msMode = false } = {}) {
  if (!periodId || !payload) return;
  const personalDaily = payload?.personal?.daily || payload?.personal?.dailyData || payload?.personalDaily || null;
  if (personalDaily && typeof personalDaily === "object") {
    state.personalDailyData[periodId] = personalDaily;
  } else if (!state.personalDailyData[periodId]) {
    state.personalDailyData[periodId] = {};
  }
  const employees = Array.isArray(payload?.employees) ? payload.employees : [];
  console.log("[DEBUG] applyDailyYieldResponse employees count:", employees.length, "sample:", employees[0]);
  if (employees.length) {
    state.companyDailyEmployees = employees.map((emp) => {
      const id = String(emp?.advisorUserId ?? emp?.id ?? "");
      if (!id) return null;
      return {
        id,
        name: emp?.name || emp?.advisorName || `ID:${id}`
      };
    }).filter(Boolean);
  }
  employees.forEach((emp) => {
    const id = String(emp?.advisorUserId ?? emp?.id ?? "");
    if (!id) return;
    const targetStore = msMode ? state.companyDailyDataMs : state.companyDailyData;
    if (!targetStore[id]) targetStore[id] = {};
    targetStore[id][periodId] = emp?.daily || emp?.dailyData || {};
  });
}
function getCompanyDailyEmployees() {
  return Array.isArray(state.companyDailyEmployees) ? state.companyDailyEmployees : [];
}
function ensureCompanyDailyEmployeeId() {
  const employees = getCompanyDailyEmployees();
  if (!employees.length) return;
  const current = String(state.companyDailyEmployeeId || "");
  const exists = employees.some((emp) => String(emp.id) === current);
  if (!exists) {
    state.companyDailyEmployeeId = String(employees[0].id);
  }
}
async function ensureDailyYieldData(periodId, { msMode = false, calcModeScope = "employee", rangeOverride = null } = {}) {
  if (!periodId) return null;
  const period = state.evaluationPeriods.find((item) => item.id === periodId);
  if (!period) return null;
  const rangeStartDate = rangeOverride?.startDate || period.startDate;
  const rangeEndDate = rangeOverride?.endDate || period.endDate;
  if (!rangeStartDate || !rangeEndDate) return null;
  const advisorUserId = await resolveAdvisorUserId2();
  const effectiveCalcMode = msMode ? "period" : getCalcMode(calcModeScope);
  const cacheKey = `${periodId}:${rangeStartDate}:${rangeEndDate}:${advisorUserId || "none"}:${effectiveCalcMode}:${msMode ? "ms" : "default"}`;
  if (dailyYieldCache.has(cacheKey)) return dailyYieldCache.get(cacheKey);
  try {
    const payload = await fetchDailyYieldFromApi({
      startDate: rangeStartDate,
      endDate: rangeEndDate,
      advisorUserId,
      msMode,
      calcModeScope
    });
    dailyYieldCache.set(cacheKey, payload);
    applyDailyYieldResponse(periodId, payload, { msMode });
    ensureCompanyDailyEmployeeId();
    const deptKey = await resolveUserDepartmentKey();
    if (deptKey === "cs") {
      const csData = await fetchCsTeleapoDaily({
        startDate: rangeStartDate,
        endDate: rangeEndDate,
        callerUserId: advisorUserId
      });
      if (csData && Object.keys(csData).length > 0) {
        const existingData = state.personalDailyData[periodId] || {};
        Object.entries(csData).forEach(([date, counts]) => {
          if (!existingData[date]) existingData[date] = {};
          existingData[date].appointments = counts.appointments || 0;
          existingData[date].sitting = counts.sitting || 0;
        });
        state.personalDailyData[periodId] = existingData;
      }
    } else if (deptKey === "marketing") {
      const marketingData = await fetchMarketingValidApplicationsDaily({
        startDate: rangeStartDate,
        endDate: rangeEndDate
      });
      if (marketingData && Object.keys(marketingData).length > 0) {
        const existingData = state.personalDailyData[periodId] || {};
        Object.entries(marketingData).forEach(([date, counts]) => {
          if (!existingData[date]) existingData[date] = {};
          existingData[date].valid_applications = counts.valid_applications || 0;
        });
        state.personalDailyData[periodId] = existingData;
      }
    }
    return payload;
  } catch (error) {
    console.error("[yield] daily api failed", error);
    return null;
  }
}
function buildDailyTotalsAllMetrics(periodId) {
  const totals = {};
  Object.values(state.companyDailyData || {}).forEach((periodMap) => {
    const series = periodMap?.[periodId] || {};
    Object.entries(series).forEach(([date, counts]) => {
      if (!totals[date]) totals[date] = {};
      Object.entries(counts || {}).forEach(([key, value]) => {
        totals[date][key] = num(totals[date][key]) + num(value);
      });
    });
  });
  return totals;
}
var getAdvisorName = () => getSession()?.user?.name || null;
var TODAY_GOAL_KEY = "todayGoals.v1";
var MONTHLY_GOAL_KEY = "monthlyGoals.v1";
var goalCache = {};
var RATE_KEYS = ["\u63D0\u6848\u7387", "\u63A8\u85A6\u7387", "\u9762\u8AC7\u8A2D\u5B9A\u7387", "\u9762\u8AC7\u5B9F\u65BD\u7387", "\u5185\u5B9A\u7387", "\u627F\u8AFE\u7387", "\u5165\u793E\u6C7A\u5B9A\u7387"];
var RATE_COUNT_LABELS = {
  newInterviews: "\u65B0\u898F\u9762\u8AC7\u6570",
  proposals: "\u63D0\u6848\u6570",
  recommendations: "\u63A8\u85A6\u6570",
  interviewsScheduled: "\u9762\u8AC7\u8A2D\u5B9A\u6570",
  interviewsHeld: "\u9762\u8AC7\u5B9F\u65BD\u6570",
  offers: "\u5185\u5B9A\u6570",
  accepts: "\u627F\u8AFE\u6570",
  hires: "\u5165\u793E\u6570"
};
var RATE_CALC_STEPS = [
  { rateKey: "proposalRate", numerator: "proposals", stepDenom: "newInterviews" },
  { rateKey: "recommendationRate", numerator: "recommendations", stepDenom: "proposals" },
  { rateKey: "interviewScheduleRate", numerator: "interviewsScheduled", stepDenom: "recommendations" },
  { rateKey: "interviewHeldRate", numerator: "interviewsHeld", stepDenom: "interviewsScheduled" },
  { rateKey: "offerRate", numerator: "offers", stepDenom: "interviewsHeld" },
  { rateKey: "acceptRate", numerator: "accepts", stepDenom: "offers" },
  { rateKey: "hireRate", numerator: "hires", stepDenom: "accepts" }
];
function buildRateDetailPipeline(denomMode) {
  const useStep = normalizeRateCalcMode(denomMode) === "step";
  return RATE_CALC_STEPS.map((step) => {
    const denomKey = useStep ? step.stepDenom : "newInterviews";
    return {
      labelA: RATE_COUNT_LABELS[step.numerator] || step.numerator,
      keyA: step.numerator,
      labelB: RATE_COUNT_LABELS[denomKey] || denomKey,
      keyB: denomKey
    };
  });
}
var RATE_DETAIL_PIPELINE_BASE = buildRateDetailPipeline("base");
var RATE_DETAIL_PIPELINE_STEP = buildRateDetailPipeline("step");
var DASHBOARD_YEARS = [(/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getFullYear() - 1, (/* @__PURE__ */ new Date()).getFullYear() - 2];
var DASHBOARD_MONTHS = Array.from({ length: 12 }, (_, idx) => idx + 1);
var DASHBOARD_COLORS = ["#2563eb", "#0ea5e9", "#10b981", "#f97316", "#8b5cf6", "#14b8a6", "#ec4899"];
var COUNT_ID_MAP = {
  today: {
    newInterviews: "todayProposals",
    proposals: "todayRecommendations",
    recommendations: "todayInterviewsScheduled",
    interviewsScheduled: "todayInterviewsHeld",
    interviewsHeld: "todayOffers",
    offers: "todayAccepts",
    accepts: "todayHires"
  },
  personalMonthly: {
    newInterviews: "personalProposals",
    proposals: "personalRecommendations",
    recommendations: "personalInterviewsScheduled",
    interviewsScheduled: "personalInterviewsHeld",
    interviewsHeld: "personalOffers",
    offers: "personalAccepts",
    accepts: "personalAcceptCount",
    hires: "personalHires"
  },
  personalPeriod: {
    newInterviews: "periodProposals",
    proposals: "periodRecommendations",
    recommendations: "periodInterviewsScheduled",
    interviewsScheduled: "periodInterviewsHeld",
    interviewsHeld: "periodOffers",
    offers: "periodAccepts",
    accepts: "periodAcceptCount",
    hires: "periodHires"
  },
  companyMonthly: {
    newInterviews: "companyProposals",
    proposals: "companyRecommendations",
    recommendations: "companyInterviewsScheduled",
    interviewsScheduled: "companyInterviewsHeld",
    interviewsHeld: "companyOffers",
    offers: "companyAccepts",
    accepts: "companyHires"
  },
  companyPeriod: {
    newInterviews: "companyPeriodProposals",
    proposals: "companyPeriodRecommendations",
    recommendations: "companyPeriodInterviewsScheduled",
    interviewsScheduled: "companyPeriodInterviewsHeld",
    interviewsHeld: "companyPeriodOffers",
    offers: "companyPeriodAccepts",
    accepts: "companyPeriodHires"
  }
};
var RATE_ID_MAP = {
  personalMonthly: {
    proposalRate: "personalProposalRate",
    recommendationRate: "personalRecommendationRate",
    interviewScheduleRate: "personalInterviewScheduleRate",
    interviewHeldRate: "personalInterviewHeldRate",
    offerRate: "personalOfferRate",
    acceptRate: "personalAcceptRate",
    hireRate: "personalHireRate"
  },
  personalPeriod: {
    proposalRate: "periodProposalRate",
    recommendationRate: "periodRecommendationRate",
    interviewScheduleRate: "periodInterviewScheduleRate",
    interviewHeldRate: "periodInterviewHeldRate",
    offerRate: "periodOfferRate",
    acceptRate: "periodAcceptRate",
    hireRate: "periodHireRate"
  },
  companyMonthly: {
    proposalRate: "companyProposalRate",
    recommendationRate: "companyRecommendationRate",
    interviewScheduleRate: "companyInterviewScheduleRate",
    interviewHeldRate: "companyInterviewHeldRate",
    offerRate: "companyOfferRate",
    acceptRate: "companyAcceptRate",
    hireRate: "companyHireRate"
  },
  companyPeriod: {
    proposalRate: "companyPeriodProposalRate",
    recommendationRate: "companyPeriodRecommendationRate",
    interviewScheduleRate: "companyPeriodInterviewScheduleRate",
    interviewHeldRate: "companyPeriodInterviewHeldRate",
    offerRate: "companyPeriodOfferRate",
    acceptRate: "companyPeriodAcceptRate",
    hireRate: "companyPeriodHireRate"
  }
};
var RATE_CARD_IDS = {
  personalMonthly: [
    "personalProposalRate",
    "personalRecommendationRate",
    "personalInterviewScheduleRate",
    "personalInterviewHeldRate",
    "personalOfferRate",
    "personalAcceptRate",
    "personalHireRate"
  ],
  personalPeriod: [
    "periodProposalRate",
    "periodRecommendationRate",
    "periodInterviewScheduleRate",
    "periodInterviewHeldRate",
    "periodOfferRate",
    "periodAcceptRate",
    "periodHireRate"
  ],
  companyMonthly: [
    "companyProposalRate",
    "companyRecommendationRate",
    "companyInterviewScheduleRate",
    "companyInterviewHeldRate",
    "companyOfferRate",
    "companyAcceptRate",
    "companyHireRate"
  ],
  companyPeriod: [
    "companyPeriodProposalRate",
    "companyPeriodRecommendationRate",
    "companyPeriodInterviewScheduleRate",
    "companyPeriodInterviewHeldRate",
    "companyPeriodOfferRate",
    "companyPeriodAcceptRate",
    "companyPeriodHireRate"
  ]
};
var TARGET_TO_GOAL_KEY = {
  newInterviewsTarget: "proposals",
  proposalsTarget: "recommendations",
  recommendationsTarget: "interviewsScheduled",
  interviewsScheduledTarget: "interviewsHeld",
  interviewsHeldTarget: "offers",
  offersTarget: "accepts",
  acceptsTarget: "hires",
  proposalRateTarget: "proposalRate",
  recommendationRateTarget: "recommendationRate",
  interviewScheduleRateTarget: "interviewScheduleRate",
  interviewHeldRateTarget: "interviewHeldRate",
  offerRateTarget: "offerRate",
  acceptRateTarget: "acceptRate",
  hireRateTarget: "hireRate"
};
var TARGET_TO_DATA_KEY = {
  newInterviewsTarget: "newInterviews",
  proposalsTarget: "proposals",
  recommendationsTarget: "recommendations",
  interviewsScheduledTarget: "interviewsScheduled",
  interviewsHeldTarget: "interviewsHeld",
  offersTarget: "offers",
  acceptsTarget: "accepts",
  proposalRateTarget: "proposalRate",
  recommendationRateTarget: "recommendationRate",
  interviewScheduleRateTarget: "interviewScheduleRate",
  interviewHeldRateTarget: "interviewHeldRate",
  offerRateTarget: "offerRate",
  acceptRateTarget: "acceptRate",
  hireRateTarget: "hireRate"
};
var DAILY_FIELDS = [
  { targetKey: "newInterviewsTarget", dataKey: "newInterviews" },
  { targetKey: "proposalsTarget", dataKey: "proposals" },
  { targetKey: "recommendationsTarget", dataKey: "recommendations" },
  { targetKey: "interviewsScheduledTarget", dataKey: "interviewsScheduled" },
  { targetKey: "interviewsHeldTarget", dataKey: "interviewsHeld" },
  { targetKey: "offersTarget", dataKey: "offers" },
  { targetKey: "acceptsTarget", dataKey: "accepts" },
  { targetKey: "revenueTarget", dataKey: "revenue" }
];
var DAILY_LABELS = {
  newInterviews: "\u65B0\u898F\u9762\u8AC7\u6570",
  proposals: "\u63D0\u6848\u6570",
  recommendations: "\u63A8\u85A6\u6570",
  interviewsScheduled: "\u9762\u8AC7\u8A2D\u5B9A\u6570",
  interviewsHeld: "\u9762\u8AC7\u5B9F\u65BD\u6570",
  offers: "\u5185\u5B9A\u6570",
  accepts: "\u627F\u8AFE\u6570",
  revenue: "\u58F2\u4E0A"
};
var MS_DEPARTMENTS = [
  { key: "marketing", label: "\u30DE\u30FC\u30B1" },
  { key: "cs", label: "CS" },
  { key: "sales", label: "\u55B6\u696D" },
  { key: "revenue", label: "\u58F2\u4E0A" }
];
var MS_METRIC_OPTIONS = DAILY_FIELDS.map((field) => ({
  key: field.dataKey,
  targetKey: field.targetKey,
  label: DAILY_LABELS[field.dataKey] || field.dataKey
}));
var PREV_KEY_MAP = {
  newInterviews: "prevNewInterviews",
  proposals: "prevProposals",
  recommendations: "prevRecommendations",
  interviewsScheduled: "prevInterviewsScheduled",
  interviewsHeld: "prevInterviewsHeld",
  offers: "prevOffers",
  accepts: "prevAccepts",
  proposalRate: "prevProposalRate",
  recommendationRate: "prevRecommendationRate",
  interviewScheduleRate: "prevInterviewScheduleRate",
  interviewHeldRate: "prevInterviewHeldRate",
  offerRate: "prevOfferRate",
  acceptRate: "prevAcceptRate",
  hireRate: "prevHireRate"
};
var GOAL_CONFIG = {
  today: {
    storageKey: TODAY_GOAL_KEY,
    inputPrefix: "todayGoal-",
    achvPrefix: "todayAchv-",
    metrics: [
      { goalKey: "proposals", dataKey: "newInterviews" },
      { goalKey: "recommendations", dataKey: "proposals" },
      { goalKey: "interviewsScheduled", dataKey: "recommendations" },
      { goalKey: "interviewsHeld", dataKey: "interviewsScheduled" },
      { goalKey: "offers", dataKey: "interviewsHeld" },
      { goalKey: "accepts", dataKey: "offers" },
      { goalKey: "hires", dataKey: "accepts" }
    ]
  },
  monthly: {
    storageKey: MONTHLY_GOAL_KEY,
    inputPrefix: "monthlyGoal-",
    achvPrefix: "monthlyAchv-",
    metrics: [
      { goalKey: "proposals", dataKey: "newInterviews" },
      { goalKey: "recommendations", dataKey: "proposals" },
      { goalKey: "interviewsScheduled", dataKey: "recommendations" },
      { goalKey: "interviewsHeld", dataKey: "interviewsScheduled" },
      { goalKey: "offers", dataKey: "interviewsHeld" },
      { goalKey: "accepts", dataKey: "offers" },
      { goalKey: "hires", dataKey: "accepts" },
      { goalKey: "proposalRate", dataKey: "proposalRate" },
      { goalKey: "recommendationRate", dataKey: "recommendationRate" },
      { goalKey: "interviewScheduleRate", dataKey: "interviewScheduleRate" },
      { goalKey: "interviewHeldRate", dataKey: "interviewHeldRate" },
      { goalKey: "offerRate", dataKey: "offerRate" },
      { goalKey: "acceptRate", dataKey: "acceptRate" },
      { goalKey: "hireRate", dataKey: "hireRate" }
    ]
  }
};
function getRateDetailPipeline(scope = "default") {
  return getRateCalcMode(scope) === "step" ? RATE_DETAIL_PIPELINE_STEP : RATE_DETAIL_PIPELINE_BASE;
}
var COHORT_NUMERATOR_MAP = {
  proposals: "cohortProposals",
  recommendations: "cohortRecommendations",
  interviewsScheduled: "cohortInterviewsScheduled",
  interviewsHeld: "cohortInterviewsHeld",
  offers: "cohortOffers",
  accepts: "cohortAccepts",
  hires: "cohortHires"
};
var state = {
  yieldScope: "all",
  isAdmin: false,
  loadSeq: 0,
  calcMode: DEFAULT_CALC_MODE,
  rateCalcMode: DEFAULT_RATE_CALC_MODE,
  calcModes: MODE_SCOPE_KEYS.reduce((acc, key) => {
    acc[key] = DEFAULT_CALC_MODE;
    return acc;
  }, {}),
  rateCalcModes: MODE_SCOPE_KEYS.reduce((acc, key) => {
    acc[key] = DEFAULT_RATE_CALC_MODE;
    return acc;
  }, {}),
  kpiTargets: {},
  // New field
  kpi: {
    today: {},
    monthly: {},
    personalPeriod: {},
    companyMonthly: {},
    companyPeriod: {}
  },
  evaluationPeriods: [],
  personalEvaluationPeriodId: "",
  personalDisplayMode: "monthly",
  companyEvaluationPeriodId: "",
  personalDailyPeriodId: "",
  companyDailyPeriodId: "",
  companyDailyEmployeeId: "",
  companyTermPeriodId: "",
  companyTermPeriodId: "",
  companyMsPeriodId: "",
  personalMsPeriodId: "",
  personalMs: {},
  personalDailyData: {},
  companyDailyData: {},
  companyDailyDataMs: {},
  companyDailyEmployees: [],
  ranges: {
    personalPeriod: {},
    companyPeriod: {},
    employee: getCurrentMonthRange()
  },
  employees: {
    list: [],
    filters: { search: "", sortKey: "name", sortOrder: "asc" }
  },
  companyToday: {
    rows: [],
    filters: { search: "", sortKey: "name", sortOrder: "asc" }
  },
  companyTerm: {
    rows: [],
    filters: { search: "", sortKey: "name", sortOrder: "asc" }
  },
  companyMs: {
    metricKeys: {
      marketing: "newInterviews",
      cs: "newInterviews",
      sales: "newInterviews"
    },
    dates: [],
    dailyTotals: {},
    companyTarget: {},
    msTargets: {},
    // 驛ｨ髢蛻･繝ｻ譌･莉伜挨縺ｮMS逶ｮ讓吝､
    msTargetTotals: {},
    // 驛ｨ髢蛻･繝ｻ謖・ｨ吝挨縺ｮ譛滄俣逶ｮ讓・
    msActuals: {},
    // 驛ｨ髢蛻･繝ｻ譌･莉伜挨縺ｮMS実績蛟､
    revenue: {
      actual: 0,
      target: 0
    }
  },
  msRateModes: {
    personalDaily: "daily",
    companyMs: "daily"
  },
  personalDailyMs: {
    metricKeys: {},
    targets: {},
    totals: {}
  },
  // 蛟倶ｺｺ蛻･MS繝・・繧ｿ
  personalMs: {
    marketing: { members: [], msTargets: {}, msTargetTotals: {}, msActuals: {}, dates: [], metricKeys: {} },
    cs: { members: [], msTargets: {}, msTargetTotals: {}, msActuals: {}, dates: [], metricKeys: {} },
    sales: { members: [], msTargets: {}, msTargetTotals: {}, msActuals: {}, dates: [], metricKeys: {} },
    importantMetrics: {
      marketing: {},
      cs: {},
      sales: {}
    }
  },
  companySales: {
    metricKeys: {},
    employees: [],
    dates: []
  },
  dashboard: {
    personal: {
      trendMode: "month",
      year: DASHBOARD_YEARS[0],
      month: (/* @__PURE__ */ new Date()).getMonth() + 1,
      charts: {},
      trendData: null,
      breakdown: null
    },
    company: {
      trendMode: "month",
      year: DASHBOARD_YEARS[0],
      month: (/* @__PURE__ */ new Date()).getMonth() + 1,
      charts: {},
      trendData: null,
      breakdown: null
    }
  }
};
if (typeof window !== "undefined") {
  window.__yieldState = state;
}
var chartJsPromise = null;
function resolveYieldScope(root) {
  const host = root?.querySelector?.("[data-yield-scope]") || document.querySelector("[data-yield-scope]");
  return host?.dataset?.yieldScope || "all";
}
function isYieldScope(scope) {
  return state.yieldScope === "all" || state.yieldScope === scope;
}
function getCurrentMonthRange() {
  const today2 = /* @__PURE__ */ new Date();
  const start = new Date(today2.getFullYear(), today2.getMonth(), 1);
  const end = new Date(today2.getFullYear(), today2.getMonth() + 1, 0);
  return {
    startDate: isoDate2(start),
    endDate: isoDate2(end)
  };
}
function getDashboardRange(scope) {
  const current = state.dashboard[scope];
  const year = Number(current.year) || (/* @__PURE__ */ new Date()).getFullYear();
  if (current.trendMode === "year") {
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`
    };
  }
  const month = Number(current.month) || (/* @__PURE__ */ new Date()).getMonth() + 1;
  const paddedMonth = String(month).padStart(2, "0");
  const endDate = isoDate2(new Date(year, month, 0));
  return {
    startDate: `${year}-${paddedMonth}-01`,
    endDate
  };
}
function getDashboardTrendGranularity(scope) {
  return state.dashboard[scope].trendMode === "year" ? "month" : "day";
}
function isoDate2(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatPeriodMonthLabel(period) {
  if (!period) return "";
  if (period.startDate) {
    const [year, month] = String(period.startDate).split("-");
    if (year && month) return `${year}\u5E74${month}\u6708`;
  }
  const id = String(period.id || "");
  const match = id.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}\u5E74${match[2]}\u6708`;
  return period.label || id || "";
}
function safe(name, fn) {
  try {
    return fn();
  } catch (e) {
    console.error(`[yield] ${name} failed:`, e);
    return null;
  }
}
function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}
function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}
function setTextByRef(ref, value) {
  const element = document.querySelector(`[data-ref="${ref}"]`);
  if (element) {
    element.textContent = value;
  }
}
function readGoals(storageKey) {
  return goalCache[storageKey] || {};
}
function persistGoal(storageKey, metric, rawValue, onChange) {
  const current = readGoals(storageKey);
  const next = { ...current };
  if (rawValue === "") {
    delete next[metric];
  } else {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed) && parsed >= 0) {
      next[metric] = parsed;
    }
  }
  goalCache[storageKey] = next;
  if (onChange) onChange();
}
function mapTargetsToGoals(target = {}) {
  return Object.entries(TARGET_TO_GOAL_KEY).reduce((acc, [sourceKey, goalKey]) => {
    acc[goalKey] = num(target[sourceKey]);
    return acc;
  }, {});
}
function updateGoalStorage(storageKey, updates = {}) {
  const current = readGoals(storageKey);
  const merged = { ...current, ...updates };
  goalCache[storageKey] = merged;
  return merged;
}
function seedMonthlyGoalsFromSettings() {
  const target = goalSettingsService.getPersonalPeriodTarget(state.personalEvaluationPeriodId, getAdvisorName()) || {};
  const mapped = mapTargetsToGoals(target);
  updateGoalStorage(MONTHLY_GOAL_KEY, mapped);
}
function seedTodayGoalsFromSettings() {
  const todayStr = isoDate2(/* @__PURE__ */ new Date());
  const todayPeriodId = goalSettingsService.resolvePeriodIdByDate(todayStr, state.evaluationPeriods) || state.personalEvaluationPeriodId;
  const dailyTargets = todayPeriodId ? goalSettingsService.getPersonalDailyTargets(todayPeriodId, getAdvisorName()) : {};
  const dayTarget = dailyTargets?.[todayStr];
  const fallback = todayPeriodId ? goalSettingsService.getPersonalPeriodTarget(todayPeriodId, getAdvisorName()) : {};
  const mapped = mapTargetsToGoals(dayTarget || fallback || {});
  updateGoalStorage(TODAY_GOAL_KEY, mapped);
}
function seedGoalDefaultsFromSettings() {
  seedTodayGoalsFromSettings();
  seedMonthlyGoalsFromSettings();
}
function syncAccessRole() {
  state.isAdmin = true;
  toggleEmployeeSections(true);
}
function toggleEmployeeSections(shouldShow) {
  const employeeSection = document.getElementById("employeeTableBody")?.closest(".kpi-v2-subsection");
  if (employeeSection) {
    employeeSection.hidden = !shouldShow;
  }
  if (!shouldShow) {
    state.employees.list = [];
    renderEmployeeRows([]);
  }
}
function initializeCalcModeControls() {
  const selects = Array.from(document.querySelectorAll("[data-calc-mode-select]"));
  if (!selects.length) return;
  const byScope = /* @__PURE__ */ new Map();
  selects.forEach((select) => {
    const scope = resolveModeScope(select.dataset.calcModeScope);
    if (!byScope.has(scope)) byScope.set(scope, []);
    byScope.get(scope).push(select);
  });
  byScope.forEach((group, scope) => {
    const initial = normalizeCalcMode(group[0]?.value || getCalcMode(scope) || DEFAULT_CALC_MODE);
    setCalcMode(scope, initial);
    group.forEach((select) => {
      select.value = initial;
    });
  });
  selects.forEach((select) => {
    select.addEventListener("change", () => {
      const scope = resolveModeScope(select.dataset.calcModeScope);
      const next = normalizeCalcMode(select.value);
      if (next === getCalcMode(scope)) return;
      setCalcMode(scope, next);
      selects.forEach((other) => {
        if (other === select) return;
        if (resolveModeScope(other.dataset.calcModeScope) === scope) other.value = next;
      });
      void refreshDataByModeScope(scope, { calcChanged: true });
    });
  });
}
function updateRateModeLabels() {
  document.querySelectorAll("[data-rate-calc-mode-select]").forEach((el) => {
    const scope = resolveModeScope(el.dataset.rateModeScope);
    el.value = getRateCalcMode(scope);
  });
  document.querySelectorAll("[data-rate-mode-label]").forEach((el) => {
    const scope = resolveModeScope(el.dataset.rateModeScope);
    el.textContent = getRateCalcModeLabel(getRateCalcMode(scope));
  });
  document.querySelectorAll("[data-rate-mode-toggle]").forEach((button) => {
    const scope = resolveModeScope(button.dataset.rateModeScope);
    button.setAttribute("aria-pressed", getRateCalcMode(scope) === "step" ? "true" : "false");
  });
}
function applyRateMode(nextMode, { scope = "default", syncSelects = true } = {}) {
  const scopeKey = resolveModeScope(scope);
  const next = normalizeRateCalcMode(nextMode);
  if (next === getRateCalcMode(scopeKey)) return;
  setRateCalcMode(scopeKey, next);
  try {
    localStorage.setItem(getRateModeStorageKey(scopeKey), next);
  } catch (error) {
    console.warn("[yield] failed to persist rate calc mode", error);
  }
  if (syncSelects) {
    document.querySelectorAll("[data-rate-calc-mode-select]").forEach((select) => {
      if (resolveModeScope(select.dataset.rateModeScope) === scopeKey) {
        select.value = next;
      }
    });
  }
  updateRateModeLabels();
  void refreshDataByModeScope(scopeKey, { calcChanged: false });
}
async function refreshDataByModeScope(scope, { calcChanged = true } = {}) {
  const scopeKey = resolveModeScope(scope);
  try {
    if (scopeKey === "personalMonthly") {
      if (calcChanged) {
        const summaryData = await loadPersonalSummaryKPIData();
        if (summaryData?.monthly) {
          renderPersonalMonthlySection(summaryData.monthly);
          return;
        }
      }
      renderPersonalMonthlySection(state.kpi.monthly || {});
      return;
    }
    if (scopeKey === "personalPeriod") {
      if (calcChanged) {
        const periodData = await loadPersonalKPIData();
        if (periodData?.period) {
          renderPersonalPeriodSection(periodData.period);
          return;
        }
      }
      renderPersonalPeriodSection(state.kpi.personalPeriod || {});
      return;
    }
    if (scopeKey === "companyMonthly") {
      if (calcChanged) {
        const data = await loadCompanyKPIData();
        if (data) {
          renderCompanyMonthly(data);
          return;
        }
      }
      renderCompanyMonthly(state.kpi.companyMonthly || {});
      return;
    }
    if (scopeKey === "companyPeriod") {
      if (calcChanged) {
        const data = await loadCompanyPeriodKPIData();
        if (data) return;
      }
      renderCompanyPeriod(state.kpi.companyPeriod || {});
      return;
    }
    if (scopeKey === "companyTerm") {
      await loadCompanyTermEmployeeKpi();
      renderCompanyTermTables();
      return;
    }
    if (scopeKey === "employee") {
      await loadEmployeeData(state.ranges.employee.startDate ? state.ranges.employee : {});
      return;
    }
    loadYieldData();
  } catch (error) {
    console.error("[yield] failed to refresh scoped mode data:", { scope: scopeKey, error });
  }
}
function initializeRateModeControls() {
  const selects = Array.from(document.querySelectorAll("[data-rate-calc-mode-select]"));
  const toggles = Array.from(document.querySelectorAll("[data-rate-mode-toggle]"));
  if (!selects.length && !toggles.length) return;
  const scopes = /* @__PURE__ */ new Set([
    ...selects.map((select) => resolveModeScope(select.dataset.rateModeScope)),
    ...toggles.map((button) => resolveModeScope(button.dataset.rateModeScope))
  ]);
  scopes.forEach((scope) => {
    let stored = null;
    try {
      stored = localStorage.getItem(getRateModeStorageKey(scope));
      if (!stored && scope === "default") {
        stored = localStorage.getItem(RATE_CALC_MODE_STORAGE_KEY);
      }
    } catch (error) {
      console.warn("[yield] rate calc mode storage unavailable", error);
    }
    const fromSelect = selects.find((select) => resolveModeScope(select.dataset.rateModeScope) === scope)?.value;
    setRateCalcMode(scope, stored || fromSelect || getRateCalcMode(scope) || DEFAULT_RATE_CALC_MODE);
  });
  updateRateModeLabels();
  selects.forEach((select) => {
    select.addEventListener("change", (e) => {
      const scope = resolveModeScope(select.dataset.rateModeScope);
      applyRateMode(e.target.value, { scope, syncSelects: false });
      selects.forEach((other) => {
        if (other !== select && resolveModeScope(other.dataset.rateModeScope) === scope) {
          other.value = getRateCalcMode(scope);
        }
      });
    });
  });
  toggles.forEach((button) => {
    if (button.dataset.bound) return;
    button.addEventListener("click", () => {
      const scope = resolveModeScope(button.dataset.rateModeScope);
      const next = getRateCalcMode(scope) === "step" ? "base" : "step";
      applyRateMode(next, { scope });
    });
    button.dataset.bound = "true";
  });
}
function updateMsRateToggleButton(button, mode) {
  if (!button) return;
  const label = mode === "overall" ? "\u5168\u4F53" : "\u65E5\u5225";
  button.textContent = label;
  button.setAttribute("aria-pressed", mode === "overall" ? "true" : "false");
}
function initializeMsRateToggles() {
  document.querySelectorAll("[data-ms-rate-toggle]").forEach((button) => {
    const scope = button.dataset.msRateScope;
    if (!scope) return;
    const current = state.msRateModes?.[scope] || "daily";
    updateMsRateToggleButton(button, current);
  });
  const root = document.body;
  if (!root || root.dataset.msRateToggleBound === "true") return;
  const handler = (event) => {
    const button = event.target.closest("[data-ms-rate-toggle]");
    if (!button) return;
    const scope = button.dataset.msRateScope;
    if (!scope) return;
    if (!state.msRateModes) state.msRateModes = {};
    const next = state.msRateModes[scope] === "overall" ? "daily" : "overall";
    state.msRateModes[scope] = next;
    document.querySelectorAll(`[data-ms-rate-toggle][data-ms-rate-scope="${scope}"]`).forEach((btn) => updateMsRateToggleButton(btn, next));
    if (scope === "personalDaily") {
      const periodId = state.personalDailyPeriodId;
      const dailyData = state.personalDailyData[periodId] || {};
      renderPersonalDailyTable(periodId, dailyData);
    }
    if (scope === "companyMs") {
      renderCompanyMsTable();
      renderAllPersonalMsTables();
    }
  };
  root.addEventListener("click", handler);
  root.dataset.msRateToggleBound = "true";
}
async function mount(root) {
  state.yieldScope = resolveYieldScope(root);
  syncAccessRole();
  try {
    await goalSettingsService.load({ force: true });
  } catch (error) {
    console.warn("[yield] failed to load goal settings", error);
  }
  safe("initializeDatePickers", initializeDatePickers);
  safe("initPersonalPeriodPreset", initPersonalPeriodPreset);
  safe("initCompanyPeriodPreset", initCompanyPeriodPreset);
  safe("initEmployeePeriodPreset", initEmployeePeriodPreset);
  safe("initializeEmployeeControls", initializeEmployeeControls);
  safe("initializeCompanyDailyEmployeeSelect", initializeCompanyDailyEmployeeSelect);
  safe("initializeCompanyPeriodSections", initializeCompanyPeriodSections);
  safe("initializeDashboardSection", initializeDashboardSection);
  safe("initializeKpiTabs", initializeKpiTabs);
  safe("initializeEvaluationPeriods", initializeEvaluationPeriods);
  safe("initializeCalcModeControls", initializeCalcModeControls);
  safe("initializeRateModeControls", initializeRateModeControls);
  safe("initializeMsRateToggles", initializeMsRateToggles);
  safe("loadYieldData", loadYieldData);
  if (typeof document !== "undefined") {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./pages/yield/yield.css?v=20260205_140149";
    document.head.appendChild(link);
  }
}
function unmount() {
}
function initializeDatePickers() {
  const monthRange = getCurrentMonthRange();
  const personalRangeStart = document.getElementById("personalRangeStart");
  const personalRangeEnd = document.getElementById("personalRangeEnd");
  const companyPeriodStart = document.getElementById("companyPeriodStart");
  const companyPeriodEnd = document.getElementById("companyPeriodEnd");
  if (personalRangeStart) personalRangeStart.value = monthRange.startDate;
  if (personalRangeEnd) personalRangeEnd.value = monthRange.endDate;
  if (companyPeriodStart) companyPeriodStart.value = monthRange.startDate;
  if (companyPeriodEnd) companyPeriodEnd.value = monthRange.endDate;
  state.ranges.personalPeriod = { startDate: personalRangeStart?.value, endDate: personalRangeEnd?.value };
  state.ranges.companyPeriod = { startDate: companyPeriodStart?.value, endDate: companyPeriodEnd?.value };
  const handlePersonalChange = () => {
    const nextRange = { startDate: personalRangeStart?.value, endDate: personalRangeEnd?.value };
    if (isValidRange(nextRange)) {
      state.personalDisplayMode = "monthly";
      state.ranges.personalPeriod = nextRange;
      loadYieldData();
    }
  };
  [personalRangeStart, personalRangeEnd].forEach((input) => input?.addEventListener("change", handlePersonalChange));
  const handleCompanyChange = async () => {
    const nextRange = { startDate: companyPeriodStart?.value, endDate: companyPeriodEnd?.value };
    if (isValidRange(nextRange)) {
      state.ranges.companyPeriod = nextRange;
      await loadCompanyPeriodKPIData();
    }
  };
  [companyPeriodStart, companyPeriodEnd].forEach((input) => input?.addEventListener("change", handleCompanyChange));
}
function setupRangePresets({ buttonSelector, startInputId, endInputId, onApply }) {
  const buttons = document.querySelectorAll(buttonSelector);
  const startInput = document.getElementById(startInputId);
  const endInput = document.getElementById(endInputId);
  if (!buttons.length || !startInput || !endInput) return;
  const applyRange = (rawRange) => {
    const months = parseInt(rawRange, 10) || 0;
    const baseEnd = endInput.value ? new Date(endInput.value) : /* @__PURE__ */ new Date();
    const normalizedEnd = new Date(baseEnd.getFullYear(), baseEnd.getMonth(), baseEnd.getDate());
    if (!endInput.value) endInput.value = isoDate2(normalizedEnd);
    const startDate = new Date(normalizedEnd.getTime());
    startDate.setMonth(startDate.getMonth() - months);
    startInput.value = isoDate2(startDate);
    if (onApply) onApply(startInput.value, endInput.value);
  };
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      applyRange(button.dataset.range);
    });
  });
  const first = buttons[0];
  if (first) {
    first.classList.add("active");
    if (first.dataset.range) applyRange(first.dataset.range);
  }
}
function initPersonalPeriodPreset() {
  setupRangePresets({
    buttonSelector: ".period-preset-btn:not(.company):not(.employee)",
    startInputId: "personalRangeStart",
    endInputId: "personalRangeEnd",
    onApply: (startDate, endDate) => {
      state.personalDisplayMode = "monthly";
      state.ranges.personalPeriod = { startDate, endDate };
      loadYieldData();
    }
  });
}
function initCompanyPeriodPreset() {
  setupRangePresets({
    buttonSelector: ".period-preset-btn.company",
    startInputId: "companyPeriodStart",
    endInputId: "companyPeriodEnd",
    onApply: (startDate, endDate) => {
      state.ranges.companyPeriod = { startDate, endDate };
      loadCompanyPeriodKPIData();
    }
  });
}
function initEmployeePeriodPreset() {
  const startInput = document.getElementById("employeeRangeStart");
  const endInput = document.getElementById("employeeRangeEnd");
  setupRangePresets({
    buttonSelector: ".period-preset-btn.employee",
    startInputId: "employeeRangeStart",
    endInputId: "employeeRangeEnd",
    onApply: (startDate, endDate) => {
      state.ranges.employee = { startDate, endDate };
      loadEmployeeData(state.ranges.employee);
    }
  });
  if (startInput?.value && endInput?.value) {
    state.ranges.employee = { startDate: startInput.value, endDate: endInput.value };
  }
  const handleManualChange = () => {
    if (!startInput?.value || !endInput?.value) return;
    if (!isValidRange({ startDate: startInput.value, endDate: endInput.value })) return;
    document.querySelectorAll(".period-preset-btn.employee").forEach((btn) => btn.classList.remove("active"));
    state.ranges.employee = { startDate: startInput.value, endDate: endInput.value };
    loadEmployeeData(state.ranges.employee);
  };
  [startInput, endInput].forEach((input) => input?.addEventListener("change", handleManualChange));
}
function initializeEmployeeControls() {
  const searchInput = document.getElementById("employeeSearchInput");
  const searchButton = document.getElementById("employeeSearchButton");
  const sortSelect = document.getElementById("employeeSortSelect");
  const triggerSearch = () => applyEmployeeSearch(searchInput?.value || "");
  searchButton?.addEventListener("click", triggerSearch);
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      triggerSearch();
    }
  });
  sortSelect?.addEventListener("change", handleEmployeeSort);
}
function initializeCompanyPeriodSections() {
  const termSearchInput = document.getElementById("companyTermSearchInput");
  const termSearchButton = document.getElementById("companyTermSearchButton");
  const termSortSelect = document.getElementById("companyTermSortSelect");
  const triggerTermSearch = () => applyCompanyTermSearch(termSearchInput?.value || "");
  termSearchButton?.addEventListener("click", triggerTermSearch);
  termSearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      triggerTermSearch();
    }
  });
  termSortSelect?.addEventListener("change", handleCompanyTermSort);
  renderCompanyTermTables();
}
function initGoalInputs(scope) {
  const config = GOAL_CONFIG[scope];
  if (!config) return;
  const inputs = document.querySelectorAll(`.goal-input[data-ref^="${config.inputPrefix}"]`);
  if (!inputs.length) return;
  const goals = readGoals(config.storageKey);
  inputs.forEach((input) => {
    const metric = input.dataset.ref?.replace(config.inputPrefix, "");
    if (!metric) return;
    if (goals[metric] !== void 0) {
      input.value = goals[metric];
    }
    if (input.dataset.goalBound) return;
    const handler = (event) => {
      persistGoal(config.storageKey, metric, event.target.value, () => refreshAchievements(scope));
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
    input.dataset.goalBound = "true";
  });
}
function refreshAchievements(scope) {
  if (scope === "today") {
    renderGoalProgress("today", state.kpi.today);
  }
  if (scope === "monthly") {
    renderGoalProgress("monthly", state.kpi.monthly);
  }
}
function renderGoalProgress(scope, data) {
  const config = GOAL_CONFIG[scope];
  if (!config) return;
  const goals = readGoals(config.storageKey);
  config.metrics.forEach(({ dataKey, goalKey }) => {
    const current = num(data?.[dataKey]);
    const target = num(goals[goalKey]);
    const achv = document.querySelector(`[data-ref="${config.achvPrefix}${goalKey}"]`);
    if (!achv) return;
    if (target > 0) {
      const percent = Math.round(current / target * 100);
      achv.textContent = `${percent}%`;
      setCardAchievementProgress(achv, percent);
    } else {
      achv.textContent = "";
      setCardAchievementProgress(achv, 0);
    }
  });
}
function renderGoalValues(scope) {
  const config = GOAL_CONFIG[scope];
  if (!config) return;
  const goals = readGoals(config.storageKey);
  Object.entries(goals).forEach(([key, value]) => {
    const el = document.querySelector(`[data-ref="${config.inputPrefix}${key}"]`);
    if (el) {
      el.textContent = num(value).toLocaleString();
    }
  });
}
function ensureDeltaElement(valueEl) {
  if (!valueEl) return null;
  let delta = valueEl.nextElementSibling;
  if (!delta || !delta.classList?.contains("kpi-v2-delta")) {
    delta = document.createElement("div");
    delta.className = "kpi-v2-delta delta-neutral";
    valueEl.insertAdjacentElement("afterend", delta);
  }
  return delta;
}
function setDeltaValue(elementId, diff, isPercent = false) {
  const valueEl = document.getElementById(elementId);
  const deltaEl = ensureDeltaElement(valueEl);
  if (!deltaEl) return;
  if (diff === null || diff === void 0 || Number.isNaN(diff)) {
    deltaEl.textContent = "";
    deltaEl.className = "kpi-v2-delta delta-neutral";
    return;
  }
  const isPositive = diff > 0;
  const isNegative = diff < 0;
  const arrow = isPositive ? "\u25B2" : isNegative ? "\u25BC" : "\xB1";
  const cls = isPositive ? "delta-positive" : isNegative ? "delta-negative" : "delta-neutral";
  const abs = Math.abs(Math.round(diff));
  const suffix = isPercent ? "%" : "";
  deltaEl.textContent = `${arrow}${abs}${suffix}`;
  deltaEl.className = `kpi-v2-delta ${cls}`;
}
function renderDeltaBadges(section, data, diffOverrides = {}, { includeRates = false } = {}) {
  const countMap = COUNT_ID_MAP[section];
  if (countMap) {
    Object.entries(countMap).forEach(([dataKey, elementId]) => {
      const current = num(data?.[dataKey]);
      const override = diffOverrides[dataKey];
      let diff = override !== void 0 ? override : null;
      if (diff === null) {
        const prevKey = PREV_KEY_MAP[dataKey];
        if (prevKey && data?.[prevKey] !== void 0) {
          diff = current - num(data[prevKey]);
        }
      }
      setDeltaValue(elementId, diff, false);
    });
  }
  if (includeRates) {
    const rateMap = RATE_ID_MAP[section];
    if (rateMap) {
      Object.entries(rateMap).forEach(([dataKey, elementId]) => {
        const current = num(data?.[dataKey]);
        const prevKey = PREV_KEY_MAP[dataKey];
        const diff = prevKey && data?.[prevKey] !== void 0 ? current - num(data[prevKey]) : null;
        setDeltaValue(elementId, diff, true);
      });
    }
  }
}
function renderCounts(section, data) {
  const map = COUNT_ID_MAP[section];
  if (!map) return;
  Object.entries(map).forEach(([dataKey, elementId]) => {
    setText(elementId, num(data?.[dataKey]).toLocaleString());
  });
}
function renderRates(section, data) {
  const map = RATE_ID_MAP[section];
  if (!map) return;
  Object.entries(map).forEach(([dataKey, elementId]) => {
    setText(elementId, `${num(data?.[dataKey])}%`);
  });
}
function renderRateDetails(section, data) {
  const cardIds = RATE_CARD_IDS[section];
  if (!cardIds) return;
  const modeScopeBySection = {
    personalMonthly: "personalMonthly",
    personalPeriod: "personalPeriod",
    companyMonthly: "companyMonthly",
    companyPeriod: "companyPeriod",
    companyTerm: "companyTerm",
    employee: "employee"
  };
  const scope = modeScopeBySection[section] || "default";
  const isCohort = getCalcMode(scope) === "cohort";
  const pipeline = getRateDetailPipeline(scope);
  const modeLabel = getCalcModeLabel(getCalcMode(scope));
  cardIds.forEach((cardId, index) => {
    const detail = pipeline[index];
    if (!detail) return;
    const card = document.getElementById(cardId)?.closest(".kpi-v2-card");
    const numeratorKey = isCohort ? COHORT_NUMERATOR_MAP[detail.keyA] : null;
    const numeratorValue = isCohort && numeratorKey && data && data[numeratorKey] !== void 0 ? data[numeratorKey] : data?.[detail.keyA];
    writeRateDetailInline(card, detail.labelA, numeratorValue, detail.labelB, data?.[detail.keyB], modeLabel);
  });
}
function renderPersonalSummary(rangeData, monthOverride) {
  const primary = monthOverride || {};
  const fallback = rangeData || {};
  const primaryAmount = num(primary?.currentAmount ?? primary?.revenue ?? primary?.revenueAmount);
  const fallbackAmount = num(fallback?.currentAmount ?? fallback?.revenue ?? fallback?.revenueAmount);
  const useFallback = primaryAmount === 0 && fallbackAmount > 0;
  const targetPrimary = num(primary?.targetAmount ?? primary?.revenueTarget ?? primary?.target_amount ?? primary?.revenue_target);
  const targetFallback = num(fallback?.targetAmount ?? fallback?.revenueTarget ?? fallback?.target_amount ?? fallback?.revenue_target);
  const summary = {
    achievementRate: num(primary?.achievementRate ?? fallback?.achievementRate),
    currentAmount: useFallback ? fallbackAmount : primaryAmount,
    targetAmount: targetPrimary || targetFallback || 0,
    usedFallback: useFallback
  };
  console.log("[yield] personal revenue summary", { monthOverride, rangeData, summary });
  const periodTarget = goalSettingsService.getPersonalPeriodTarget(
    state.personalEvaluationPeriodId,
    getAdvisorName()
  );
  if (periodTarget?.revenueTarget !== void 0) {
    summary.targetAmount = num(periodTarget.revenueTarget);
  }
  if (summary.targetAmount > 0) {
    summary.achievementRate = Math.round(summary.currentAmount / summary.targetAmount * 100);
  }
  const rateText = summary.targetAmount > 0 ? `${summary.achievementRate}%` : "";
  setText("personalAchievementRate", rateText);
  setText("personalCurrent", `\xA5${summary.currentAmount.toLocaleString()}`);
  setText("personalTarget", `\xA5${summary.targetAmount.toLocaleString()}`);
  const progressFill = document.getElementById("personalAchievementRate")?.closest(".kpi-v2-summary-unified")?.querySelector(".kpi-v2-progress span");
  if (progressFill) {
    const normalized = Math.max(0, Math.min(num(summary.achievementRate), 100));
    progressFill.style.width = `${normalized}%`;
  }
}
function renderPersonalKpis(todayData, summaryData, periodData) {
  const today2 = normalizeTodayKpi(todayData);
  const monthly = summaryData?.monthly || summaryData?.period || summaryData || {};
  const period = periodData?.period || periodData || {};
  state.kpi.today = today2;
  initGoalInputs("monthly");
  renderGoalValues("monthly");
  renderCounts("today", today2);
  renderPersonalMonthlySection(monthly);
  renderPersonalPeriodSection(period);
}
function renderPersonalMonthlySection(data) {
  const monthly = normalizeKpi(data || {}, { rateModeScope: "personalMonthly" });
  state.kpi.monthly = monthly;
  renderCounts("personalMonthly", monthly);
  renderRates("personalMonthly", monthly);
  renderRateDetails("personalMonthly", monthly);
  renderGoalProgress("monthly", monthly);
  renderDeltaBadges("personalMonthly", monthly, {}, { includeRates: true });
  renderPersonalSummary(monthly, monthly);
  updatePersonalPeriodLabels();
  syncEvaluationPeriodLabels();
}
function renderPersonalPeriodSection(data) {
  const period = normalizeKpi(data || {}, { rateModeScope: "personalPeriod" });
  state.kpi.personalPeriod = period;
  renderCounts("personalPeriod", period);
  renderRates("personalPeriod", period);
  renderRateDetails("personalPeriod", period);
  void renderPersonalPeriodRevenueSummary(period);
}
async function resolvePersonalRangeRevenueTarget(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const advisorName = getAdvisorName();
  const periods = getOverlappingEvaluationPeriods(startDate, endDate);
  if (periods.length) {
    await Promise.all(
      periods.map((period) => goalSettingsService.loadPersonalPeriodTarget(period.id, advisorName))
    );
    const weightedTarget = periods.reduce((acc, period) => {
      const target = num(goalSettingsService.getPersonalPeriodTarget(period.id, advisorName)?.revenueTarget);
      if (target <= 0) return acc;
      const periodDays = getRangeDaysInclusive(period.startDate, period.endDate);
      const overlapDays = getRangeOverlapDaysInclusive(
        startDate,
        endDate,
        period.startDate,
        period.endDate
      );
      if (periodDays <= 0 || overlapDays <= 0) return acc;
      return acc + target * (overlapDays / periodDays);
    }, 0);
    if (weightedTarget > 0) return Math.round(weightedTarget);
  }
  if (!state.personalEvaluationPeriodId) return 0;
  const fallback = goalSettingsService.getPersonalPeriodTarget(state.personalEvaluationPeriodId, advisorName) || await goalSettingsService.loadPersonalPeriodTarget(state.personalEvaluationPeriodId, advisorName);
  return num(fallback?.revenueTarget);
}
async function renderPersonalPeriodRevenueSummary(data = state.kpi.personalPeriod) {
  const current = num(data?.currentAmount ?? data?.revenue ?? data?.revenueAmount);
  let targetAmount = num(data?.targetAmount ?? data?.revenueTarget ?? data?.target_amount ?? data?.revenue_target);
  if (targetAmount <= 0) {
    const range = state.ranges.personalPeriod || {};
    targetAmount = await resolvePersonalRangeRevenueTarget(range.startDate, range.endDate);
  }
  const achv = targetAmount > 0 ? Math.round(current / targetAmount * 100) : 0;
  setText("personalPeriodCurrent", `\xA5${current.toLocaleString()}`);
  setText("personalPeriodTarget", `\xA5${targetAmount.toLocaleString()}`);
  setText("personalPeriodAchievementRate", targetAmount > 0 ? `${achv}%` : "");
  const bar = document.getElementById("personalPeriodAchievementBar");
  if (bar) {
    const normalized = Math.max(0, Math.min(achv, 100));
    bar.style.width = `${normalized}%`;
  }
}
function renderCompanyMonthly(data) {
  const titleEl = document.getElementById("companySummaryTitle");
  if (titleEl) titleEl.textContent = getCompanySummaryTitleText();
  state.kpi.companyMonthly = normalizeKpi(data || {}, { rateModeScope: "companyMonthly" });
  renderCounts("companyMonthly", state.kpi.companyMonthly);
  renderRates("companyMonthly", state.kpi.companyMonthly);
  renderRateDetails("companyMonthly", state.kpi.companyMonthly);
  renderDeltaBadges("companyMonthly", state.kpi.companyMonthly, {}, { includeRates: true });
  renderCompanyTargets();
  renderCompanyRateGoals();
}
function renderCompanyPeriod(data) {
  state.kpi.companyPeriod = normalizeKpi(data || {}, { rateModeScope: "companyPeriod" });
  renderCounts("companyPeriod", state.kpi.companyPeriod);
  renderRates("companyPeriod", state.kpi.companyPeriod);
  renderRateDetails("companyPeriod", state.kpi.companyPeriod);
  void renderCompanyPeriodRevenueSummary(state.kpi.companyPeriod);
}
function hasDateRangeOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
}
function getRangeDaysInclusive(startDate, endDate) {
  return enumerateDateRange(startDate, endDate).length;
}
function getRangeOverlapDaysInclusive(startA, endA, startB, endB) {
  if (!hasDateRangeOverlap(startA, endA, startB, endB)) return 0;
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  return getRangeDaysInclusive(start, end);
}
function getOverlappingEvaluationPeriods(startDate, endDate) {
  const periods = Array.isArray(state.evaluationPeriods) && state.evaluationPeriods.length ? state.evaluationPeriods : goalSettingsService.getEvaluationPeriods();
  if (!Array.isArray(periods) || !periods.length) return [];
  return periods.filter(
    (period) => period?.id && period?.startDate && period?.endDate && hasDateRangeOverlap(startDate, endDate, period.startDate, period.endDate)
  );
}
async function resolveCompanyRangeRevenueTarget(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const periods = getOverlappingEvaluationPeriods(startDate, endDate);
  if (periods.length) {
    await Promise.all(
      periods.map((period) => goalSettingsService.loadCompanyPeriodTarget(period.id))
    );
    const weightedTarget = periods.reduce((acc, period) => {
      const target = num(goalSettingsService.getCompanyPeriodTarget(period.id)?.revenueTarget);
      if (target <= 0) return acc;
      const periodDays = getRangeDaysInclusive(period.startDate, period.endDate);
      const overlapDays = getRangeOverlapDaysInclusive(
        startDate,
        endDate,
        period.startDate,
        period.endDate
      );
      if (periodDays <= 0 || overlapDays <= 0) return acc;
      return acc + target * (overlapDays / periodDays);
    }, 0);
    if (weightedTarget > 0) return Math.round(weightedTarget);
  }
  if (!state.companyEvaluationPeriodId) return 0;
  const fallback = goalSettingsService.getCompanyPeriodTarget(state.companyEvaluationPeriodId) || await goalSettingsService.loadCompanyPeriodTarget(state.companyEvaluationPeriodId);
  return num(fallback?.revenueTarget);
}
async function renderCompanyPeriodRevenueSummary(data = state.kpi.companyPeriod) {
  const current = num(data?.currentAmount ?? data?.revenue ?? data?.revenueAmount);
  let targetAmount = num(data?.targetAmount ?? data?.revenueTarget ?? data?.target_amount ?? data?.revenue_target);
  if (targetAmount <= 0) {
    const range = state.ranges.companyPeriod || {};
    targetAmount = await resolveCompanyRangeRevenueTarget(range.startDate, range.endDate);
  }
  const achv = targetAmount > 0 ? Math.round(current / targetAmount * 100) : 0;
  setText("companyPeriodCurrent", `\xA5${current.toLocaleString()}`);
  setText("companyPeriodTarget", `\xA5${targetAmount.toLocaleString()}`);
  setText("companyPeriodAchievementRate", targetAmount > 0 ? `${achv}%` : "");
  const bar = document.getElementById("companyPeriodAchievementBar");
  if (bar) {
    const normalized = Math.max(0, Math.min(achv, 100));
    bar.style.width = `${normalized}%`;
  }
}
function renderCompanyTargets() {
  const target = state.companyEvaluationPeriodId ? goalSettingsService.getCompanyPeriodTarget(state.companyEvaluationPeriodId) || {} : {};
  renderCompanyRevenueSummary(target);
  renderCompanyGoalCards(target, state.kpi.companyMonthly);
}
function renderCompanyRevenueSummary(target = {}) {
  const current = num(state.kpi.companyMonthly?.currentAmount ?? state.kpi.companyMonthly?.revenue ?? state.kpi.companyMonthly?.revenueAmount);
  const targetAmount = num(target.revenueTarget);
  const achv = targetAmount > 0 ? Math.round(current / targetAmount * 100) : 0;
  console.log("[yield] company revenue summary", { target, current, targetAmount, monthly: state.kpi.companyMonthly });
  setText("companyCurrent", `\xA5${current.toLocaleString()}`);
  setText("companyTarget", `\xA5${targetAmount.toLocaleString()}`);
  setText("companyAchievementRate", targetAmount > 0 ? `${achv}%` : "");
  const bar = document.getElementById("companyAchievementBar");
  if (bar) {
    const normalized = Math.max(0, Math.min(achv, 100));
    bar.style.width = `${normalized}%`;
  }
}
function renderCompanyGoalCards(target = {}, actuals = {}) {
  Object.entries(TARGET_TO_DATA_KEY).forEach(([targetKey, dataKey]) => {
    const goalRef = `companyGoal-${dataKey}`;
    const achvRef = `companyAchv-${dataKey}`;
    const rawTarget = target[targetKey];
    const hasValue = rawTarget !== void 0 && rawTarget !== null;
    const goalValue = hasValue ? num(rawTarget) : 0;
    setTextByRef(goalRef, hasValue ? goalValue.toLocaleString() : "");
    const achvEl = document.querySelector(`[data-ref="${achvRef}"]`);
    if (!achvEl) return;
    if (goalValue > 0) {
      const percent = Math.round(num(actuals[dataKey]) / goalValue * 100);
      achvEl.textContent = `${percent}%`;
      setCardAchievementProgress(achvEl, percent);
    } else {
      achvEl.textContent = "";
      setCardAchievementProgress(achvEl, 0);
    }
  });
}
function renderCompanyRateGoals() {
  const targets = state.kpiTargets || {};
  const companyTarget = state.companyEvaluationPeriodId ? goalSettingsService.getCompanyPeriodTarget(state.companyEvaluationPeriodId) || {} : {};
  const rateKeys = [
    "proposalRate",
    "recommendationRate",
    "interviewScheduleRate",
    "interviewHeldRate",
    "offerRate",
    "acceptRate",
    "hireRate"
  ];
  const resolveFallbackTarget = (rateKey) => {
    const entry = Object.entries(TARGET_TO_DATA_KEY).find(([, dataKey]) => dataKey === rateKey);
    const targetKey = entry?.[0];
    if (!targetKey) return void 0;
    const raw = companyTarget[targetKey];
    return raw === void 0 || raw === null ? void 0 : num(raw);
  };
  rateKeys.forEach((key) => {
    const goalRef = `companyGoal-${key}`;
    const el = document.querySelector(`[data-ref="${goalRef}"]`);
    if (el) {
      const fallbackVal = resolveFallbackTarget(key);
      const val = targets[key] !== void 0 && targets[key] !== null ? targets[key] : fallbackVal;
      const hasVal = val !== void 0 && val !== null;
      el.textContent = hasVal ? `${val}%` : "";
      el.style.cursor = "pointer";
      el.style.textDecoration = "underline dotted";
      el.title = "\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u76EE\u6A19\u3092\u8A2D\u5B9A";
      el.onclick = (e) => handleRateGoalClick(e, key, val);
    }
    const achvRef = `companyAchv-${key}`;
    const achvEl = document.querySelector(`[data-ref="${achvRef}"]`);
    if (achvEl) {
      const actual = num(state.kpi.companyMonthly?.[key]);
      const fallbackVal = resolveFallbackTarget(key);
      const resolvedTarget = targets[key] !== void 0 && targets[key] !== null ? targets[key] : fallbackVal;
      const targetVal = num(resolvedTarget);
      if (targetVal > 0) {
        const rate = Math.round(actual / targetVal * 100);
        achvEl.textContent = `${rate}%`;
        setCardAchievementProgress(achvEl, rate);
      } else {
        achvEl.textContent = "";
        setCardAchievementProgress(achvEl, 0);
      }
    }
  });
}
function handleRateGoalClick(e, key, currentVal) {
  const el = e.target;
  const input = document.createElement("input");
  input.type = "number";
  input.value = currentVal !== void 0 && currentVal !== null ? currentVal : "";
  input.style.width = "60px";
  input.style.fontSize = "inherit";
  input.style.textAlign = "right";
  input.onclick = (ev) => ev.stopPropagation();
  const save = async () => {
    const newVal = input.value.trim();
    if (newVal === "") {
      delete state.kpiTargets[key];
    } else {
      state.kpiTargets[key] = Number(newVal);
    }
    renderCompanyRateGoals();
    try {
      await saveKpiTargetsToApi(state.companyEvaluationPeriodId, state.kpiTargets);
    } catch (err) {
      console.error("Save failed", err);
      alert("\u76EE\u6A19\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
    }
  };
  input.onblur = save;
  input.onkeydown = (ev) => {
    if (ev.key === "Enter") {
      input.blur();
    }
  };
  el.textContent = "";
  el.appendChild(input);
  input.focus();
}
async function loadYieldData() {
  const loadToken = ++state.loadSeq;
  const isCurrent = () => state.loadSeq === loadToken;
  try {
    const wantsPersonal = isYieldScope("personal");
    const wantsCompany = isYieldScope("company");
    const wantsAdmin = isYieldScope("admin");
    const preloadTasks = [];
    if (wantsCompany) {
      preloadTasks.push(
        goalSettingsService.loadCompanyPeriodTarget(state.companyEvaluationPeriodId, { force: true })
      );
      preloadTasks.push(
        fetchKpiTargetsFromApi(state.companyEvaluationPeriodId).then((data) => {
          state.kpiTargets = data || {};
        })
      );
    }
    if (wantsPersonal) {
      preloadTasks.push(
        goalSettingsService.loadPersonalPeriodTarget(state.personalEvaluationPeriodId, getAdvisorName(), { force: true }),
        goalSettingsService.loadPersonalDailyTargets(state.personalDailyPeriodId, getAdvisorName(), { force: true })
      );
    }
    if (preloadTasks.length) {
      await Promise.all(preloadTasks);
    }
    if (wantsPersonal) {
      const [todayData, personalSummary, personalRange] = await Promise.all([
        loadTodayPersonalKPIData(),
        loadPersonalSummaryKPIData(),
        loadPersonalKPIData()
      ]);
      if (!isCurrent()) return;
      if (todayData || personalSummary || personalRange) {
        const summaryPayload = personalSummary && Object.keys(personalSummary).length ? personalSummary : personalRange;
        renderPersonalKpis(todayData || {}, summaryPayload || {}, personalRange || {});
      }
    }
    if (wantsCompany) {
      const companyKPI = await loadCompanyKPIData();
      if (!isCurrent()) return;
      if (companyKPI) renderCompanyMonthly(companyKPI);
      await loadCompanyPeriodKPIData();
      if (!isCurrent()) return;
      await loadAndRenderCompanyMs();
      if (!isCurrent()) return;
    }
    if (wantsAdmin) {
      const companyTermRows = await loadCompanyTermEmployeeKpi();
      if (!isCurrent()) return;
      if (companyTermRows?.length) renderCompanyTermTables();
    }
    if (wantsPersonal) {
      await loadAndRenderPersonalDaily();
      if (!isCurrent()) return;
      await loadAndRenderPersonalMs();
      if (!isCurrent()) return;
    }
    if (wantsCompany) {
      await loadAndRenderCompanyDaily();
      if (!isCurrent()) return;
    }
    if (wantsAdmin) {
      await loadAndRenderCompanyMs();
      if (!isCurrent()) return;
      await loadAndRenderCompanyDaily();
      if (!isCurrent()) return;
      await loadEmployeeData(state.ranges.employee.startDate ? state.ranges.employee : {});
      if (!isCurrent()) return;
    }
  } catch (error) {
    console.error("Failed to load yield data:", error);
  }
}
async function loadPersonalKPIData() {
  try {
    const fallbackRange = getCurrentMonthRange();
    const startDate = state.ranges.personalPeriod.startDate || fallbackRange.startDate;
    const endDate = state.ranges.personalPeriod.endDate || fallbackRange.endDate;
    if (!startDate || !endDate) return null;
    const kpi = await fetchPersonalKpiFromApi({ startDate, endDate, calcModeScope: "personalPeriod" });
    if (kpi) return { period: kpi };
  } catch (error) {
    console.error("Failed to load personal KPI data (api):", error);
  }
}
async function loadPersonalSummaryKPIData() {
  try {
    const period = state.evaluationPeriods.find((item) => item.id === state.personalEvaluationPeriodId);
    const startDate = period?.startDate;
    const endDate = period?.endDate;
    if (!startDate || !endDate) return null;
    const kpi = await fetchPersonalKpiFromApi({ startDate, endDate, calcModeScope: "personalMonthly" });
    if (kpi) return { monthly: kpi };
  } catch (error) {
    console.log("Failed to load personal summary KPI data (api):", error);
  }
}
async function loadTodayPersonalKPIData() {
  try {
    const todayStr = isoDate2(/* @__PURE__ */ new Date());
    const kpi = await fetchPersonalKpiFromApi({ startDate: todayStr, endDate: todayStr, planned: true, calcModeScope: "personalMonthly" });
    if (kpi) return { today: kpi };
  } catch (error) {
    console.log("Failed to load today personal KPI data (api):", error);
  }
}
async function loadCompanyKPIData() {
  try {
    const range = getCompanySummaryRange();
    if (!range.startDate || !range.endDate) return null;
    const kpi = await fetchCompanyKpiFromApi({ startDate: range.startDate, endDate: range.endDate, calcModeScope: "companyMonthly" });
    if (kpi) return kpi;
  } catch (error) {
    console.log("Failed to load company KPI data (api):", error);
  }
}
async function loadCompanyPeriodKPIData() {
  try {
    const startDate = state.ranges.companyPeriod.startDate;
    const endDate = state.ranges.companyPeriod.endDate;
    if (!startDate || !endDate) return null;
    const kpi = await fetchCompanyKpiFromApi({ startDate, endDate, calcModeScope: "companyPeriod" });
    if (kpi) {
      renderCompanyPeriod(kpi);
      return kpi;
    }
  } catch (error) {
    console.log("Failed to load company period KPI data (api):", error);
  }
}
async function loadCompanyTermEmployeeKpi() {
  const periodId = state.companyTermPeriodId;
  const period = state.evaluationPeriods.find((item) => item.id === periodId);
  if (!period) {
    state.companyTerm.rows = [];
    return [];
  }
  const items = await fetchCompanyEmployeeKpis({ startDate: period.startDate, endDate: period.endDate, calcModeScope: "companyTerm" });
  const rows = mapEmployeeKpiItems(items, { rateModeScope: "companyTerm" });
  const members = await ensureMembersList();
  const advisorIdSet = new Set(
    members.filter((member) => isAdvisorRole(member.role)).map((member) => String(member.id))
  );
  const filteredRows = advisorIdSet.size ? rows.filter((row) => advisorIdSet.has(String(row.advisorUserId))) : rows;
  const advisorIds = filteredRows.map((row) => row.advisorUserId).filter((id) => Number.isFinite(id) && id > 0);
  if (typeof goalSettingsService.loadPersonalPeriodTargetsBulk === "function") {
    await goalSettingsService.loadPersonalPeriodTargetsBulk(periodId, advisorIds, { force: true });
  }
  state.companyTerm.rows = filteredRows.map((row) => {
    const advisorKey = row.advisorUserId || row.name;
    const target = goalSettingsService.getPersonalPeriodTarget(periodId, advisorKey) || {};
    const goalOrNull = (key) => {
      const raw = target[key];
      return raw === void 0 || raw === null ? null : num(raw);
    };
    return {
      advisorUserId: row.advisorUserId,
      name: row.name,
      newInterviews: row.newInterviews,
      newInterviewsGoal: goalOrNull("newInterviewsTarget"),
      proposals: row.proposals,
      proposalsGoal: goalOrNull("proposalsTarget"),
      recommendations: row.recommendations,
      recommendationsGoal: goalOrNull("recommendationsTarget"),
      interviewsScheduled: row.interviewsScheduled,
      interviewsScheduledGoal: goalOrNull("interviewsScheduledTarget"),
      interviewsHeld: row.interviewsHeld,
      interviewsHeldGoal: goalOrNull("interviewsHeldTarget"),
      offers: row.offers,
      offersGoal: goalOrNull("offersTarget"),
      accepts: row.accepts,
      acceptsGoal: goalOrNull("acceptsTarget"),
      hireRate: row.hireRate,
      hireRateGoal: goalOrNull("hireRateTarget"),
      proposalRate: row.proposalRate,
      proposalRateGoal: goalOrNull("proposalRateTarget"),
      recommendationRate: row.recommendationRate,
      recommendationRateGoal: goalOrNull("recommendationRateTarget"),
      interviewScheduleRate: row.interviewScheduleRate,
      interviewScheduleRateGoal: goalOrNull("interviewScheduleRateTarget"),
      interviewHeldRate: row.interviewHeldRate,
      interviewHeldRateGoal: goalOrNull("interviewHeldRateTarget"),
      offerRate: row.offerRate,
      offerRateGoal: goalOrNull("offerRateTarget"),
      acceptRate: row.acceptRate,
      acceptRateGoal: goalOrNull("acceptRateTarget")
    };
  });
  return state.companyTerm.rows;
}
async function loadAndRenderPersonalDaily() {
  const isMonthlyMode = false;
  const tableTitle = document.getElementById("personalDailySectionTitle");
  const periodSelectLabel = document.getElementById("personalDailyPeriodLabel");
  if (isMonthlyMode) {
    if (periodSelectLabel) periodSelectLabel.style.display = "none";
    const startDate = state.ranges.personalPeriod?.startDate;
    const endDate = state.ranges.personalPeriod?.endDate;
    if (!startDate || !endDate) return;
    const months = enumerateMonthsInRange(startDate, endDate);
    const monthlyDataMap = {};
    await Promise.all(months.map(async (monthStr) => {
      const [year, month] = monthStr.split("-").map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      try {
        const data = await fetchPersonalKpiFromApi({ startDate: isoDate2(start), endDate: isoDate2(end), calcModeScope: "personalPeriod" });
        monthlyDataMap[monthStr] = data || {};
      } catch (err) {
        console.error(`Failed to load month data for ${monthStr}`, err);
        monthlyDataMap[monthStr] = {};
      }
    }));
    renderPersonalMonthlyTable(months, monthlyDataMap);
    renderPersonalTableRates(startDate, endDate);
  } else {
    if (periodSelectLabel) periodSelectLabel.style.display = "";
    const periodId = state.personalDailyPeriodId;
    if (!periodId) return;
    const advisorName = getSession()?.user?.name || null;
    const advisorRole = getSession()?.user?.role || "";
    const period = state.evaluationPeriods.find((item) => item.id === periodId);
    if (!period) return;
    await Promise.all([
      ensureDailyYieldData(periodId, { calcModeScope: "personalPeriod" }),
      goalSettingsService.loadPersonalDailyTargets(periodId, advisorName)
    ]);
    const deptKey = await resolveUserDepartmentKey();
    state.personalDailyMs.departmentKey = deptKey;
    const userId = await resolveAdvisorUserId2();
    if (deptKey && userId) {
      try {
        const items = await goalSettingsService.loadImportantMetrics({
          departmentKey: deptKey,
          userId: Number(userId),
          force: true
        });
        const first = Array.isArray(items) ? items[0] : null;
        const metricKey = first?.metricKey || first?.metric_key || "";
        if (metricKey) {
          if (!state.personalMs.metricKeys) state.personalMs.metricKeys = {};
          state.personalMs.metricKeys[deptKey] = metricKey;
          if (!state.personalMs.importantMetrics) state.personalMs.importantMetrics = {};
          if (!state.personalMs.importantMetrics[deptKey]) state.personalMs.importantMetrics[deptKey] = {};
          state.personalMs.importantMetrics[deptKey][String(userId)] = metricKey;
        }
      } catch (error) {
        console.warn("[yield] failed to load important metric (personal daily)", error);
      }
    }
    const targetDepts = [];
    if (deptKey) targetDepts.push(deptKey);
    if (!targetDepts.includes("revenue")) targetDepts.push("revenue");
    await Promise.all(targetDepts.map(async (dept) => {
      const metrics = dept === "revenue" ? [{ key: "revenue", label: "\u58F2\u4E0A", targetKey: "revenue" }] : getMetricsForDept(dept);
      if (!metrics.length) return;
      await Promise.all(metrics.map((metric) => loadPersonalDailyMsTargets(periodId, dept, metric.key)));
    }));
    const dailyData = state.personalDailyData[periodId] || {};
    renderPersonalDailyTable(periodId, dailyData);
    renderPersonalTableRates(period.startDate, period.endDate);
  }
}
function enumerateMonthsInRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = [];
  const curr = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (curr <= last) {
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, "0");
    months.push(`${y}-${m}`);
    curr.setMonth(curr.getMonth() + 1);
  }
  return months;
}
function renderPersonalMonthlyTable(months, monthlyDataMap) {
  const body = document.getElementById("personalDailyTableBody");
  const headerRow = document.getElementById("personalDailyHeaderRow");
  if (!body || !headerRow) return;
  const cells = months.map((m) => {
    const [y, mon] = m.split("-");
    return `<th scope="col">${y}\u5E74${mon}\u6708</th>`;
  }).join("");
  headerRow.innerHTML = `<th scope="col" class="kpi-v2-sticky-label">\u6307\u6A19</th>${cells}`;
  const rows = [];
  DAILY_FIELDS.forEach((field, index) => {
    const baseLabel = DAILY_LABELS[field.dataKey] || field.dataKey;
    const tripletAlt = index % 2 === 1 ? "daily-triplet-alt" : "";
    const rowCells = months.map((m) => {
      const data = monthlyDataMap[m] || {};
      const value = data[field.dataKey] ?? 0;
      return `<td class="">${formatNumberCell(value)}</td>`;
    }).join("");
    rows.push(`<tr class="${tripletAlt}">
      <th class="kpi-v2-sticky-label" scope="row">${baseLabel}</th>
      ${rowCells}
    </tr>`);
  });
  body.innerHTML = rows.join("");
}
async function renderPersonalTableRates(startDate, endDate) {
  const panel = document.getElementById("personalTableRatePanel");
  if (!panel) return;
  try {
    const kpi = await fetchPersonalKpiFromApi({ startDate, endDate, calcModeScope: "personalPeriod" });
    if (!kpi) {
      panel.innerHTML = "";
      return;
    }
    const rates = [
      { label: "\u63D0\u6848\u7387", value: kpi.proposalRate, unit: "%" },
      { label: "\u63A8\u85A6\u7387", value: kpi.recommendationRate, unit: "%" },
      { label: "\u9762\u8AC7\u8A2D\u5B9A\u7387", value: kpi.interviewScheduleRate, unit: "%" },
      { label: "\u9762\u8AC7\u5B9F\u65BD\u7387", value: kpi.interviewHeldRate, unit: "%" },
      { label: "\u5185\u5B9A\u7387", value: kpi.offerRate, unit: "%" },
      { label: "\u627F\u8AFE\u7387", value: kpi.acceptRate, unit: "%" },
      { label: "\u5165\u793E\u6C7A\u5B9A\u7387", value: kpi.hireRate, unit: "%" }
      // hireRate -> 入社決定率
    ];
    const html = rates.map((r) => `
      <div class="kpi-v2-card is-neutral is-compact">
        <div class="kpi-v2-label">${r.label}</div>
        <div class="kpi-v2-value">${r.value !== void 0 && r.value !== null ? `${r.value}${r.unit}` : ""}</div>
      </div>
    `).join("");
    panel.innerHTML = `<div class="kpi-v2-grid" data-kpi-type="rates" style="margin-bottom:1.5rem">${html}</div>`;
  } catch (e) {
    console.error("Failed to render personal table rates:", e);
    panel.innerHTML = "";
  }
}
async function loadCompanySummaryKPI() {
  const data = await loadCompanyKPIData();
  if (data) renderCompanyMonthly(data);
}
function buildDailyHeaderRow(headerRow, dates, simpleMode = false) {
  if (!headerRow) return;
  const cells = dates.map((date) => {
    const label = formatDayLabel(date);
    return `<th scope="col">${label}</th>`;
  }).join("");
  const categoryHeader = simpleMode ? "" : '<th class="daily-type" scope="col">\u533A\u5206</th>';
  headerRow.innerHTML = `<th scope="col" class="kpi-v2-sticky-label">\u6307\u6A19</th>${categoryHeader}${cells}`;
}
function buildDailyRow(label, cells, { rowClass = "", cellClass = "" } = {}) {
  const cellHtml = cells.map((cell) => {
    const value = typeof cell === "object" ? cell.value : cell;
    const specificClass = typeof cell === "object" ? cell.className || "" : "";
    const className = [cellClass, specificClass].filter(Boolean).join(" ").trim();
    return `<td class="${className}">${value}</td>`;
  }).join("");
  return `<tr class="${rowClass}">${label}${cellHtml}</tr>`;
}
function renderDailyMatrix({ headerRow, body, dates, dailyData, resolveValues, simpleMode = false }) {
  if (!body) return;
  buildDailyHeaderRow(headerRow, dates, simpleMode);
  const rows = [];
  DAILY_FIELDS.forEach((field, index) => {
    const baseLabel = DAILY_LABELS[field.dataKey] || field.dataKey;
    const tripletAlt = index % 2 === 1 ? "daily-triplet-alt" : "";
    const actualNumbers = [];
    const targetNumbers = [];
    let actualSum = 0;
    dates.forEach((date, dateIndex) => {
      const { actual = 0, target = null } = resolveValues(field, date, dateIndex);
      actualSum += num(actual);
      actualNumbers.push(actualSum);
      targetNumbers.push(target === null || target === void 0 ? null : num(target));
    });
    const actualCells = actualNumbers.map(formatNumberCell);
    const thAttr = simpleMode ? `class="kpi-v2-sticky-label" scope="row"` : `class="kpi-v2-sticky-label" scope="row" rowspan="3"`;
    const rowContent = simpleMode ? `<th ${thAttr}>${baseLabel}</th>` : `<th ${thAttr}>${baseLabel}</th><td class="daily-type">\u5B9F\u7E3E</td>`;
    rows.push(
      buildDailyRow(
        rowContent,
        actualCells,
        { rowClass: tripletAlt }
      )
    );
    if (!simpleMode) {
      const targetCells = targetNumbers.map(formatNumberCell);
      const achvCells = targetNumbers.map((target, idx) => {
        if (Number.isFinite(target) && target > 0) {
          const percent = Math.round(actualNumbers[idx] / target * 100);
          return formatAchievementCell(percent);
        }
        return formatAchievementCell(null);
      });
      rows.push(
        buildDailyRow(
          `<td class="daily-type">\u76EE\u6A19</td>`,
          targetCells,
          { rowClass: tripletAlt, cellClass: "daily-muted" }
        )
      );
      rows.push(
        buildDailyRow(
          `<td class="daily-type">\u9032\u6357\u7387</td>`,
          achvCells,
          { rowClass: tripletAlt }
        )
      );
    }
  });
  body.innerHTML = rows.join("");
}
function formatNumberCell(value) {
  if (value === null || value === void 0 || value === "") return "";
  const numeric = num(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : "";
}
function formatCurrencyCell(value) {
  if (value === null || value === void 0 || value === "") return "";
  const numeric = num(value);
  if (!Number.isFinite(numeric)) return "";
  const manyen = Math.round(numeric / 1e4);
  return `\xA5${manyen.toLocaleString()}\u4E07`;
}
function formatAchievementCell(percent) {
  if (percent === null || Number.isNaN(percent)) {
    return { value: "", className: "daily-muted" };
  }
  const className = percent >= 100 ? "daily-achv-high" : "daily-achv-normal";
  return { value: `${percent}%`, className };
}
function formatDayLabel(dateStr) {
  const parsed = parseLocalDate(dateStr);
  if (!parsed || Number.isNaN(parsed)) return dateStr;
  return String(parsed.getDate());
}
function formatMonthDayLabel(dateStr) {
  const parsed = parseLocalDate(dateStr);
  if (!parsed || Number.isNaN(parsed)) return dateStr;
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}
function extractMsMonthFromPeriodId(periodId) {
  const matched = String(periodId || "").match(/^(\d{4}-\d{2})/);
  return matched ? matched[1] : "";
}
function resolveMsSettingsMonthByPeriodId(periodId) {
  const fromId = extractMsMonthFromPeriodId(periodId);
  if (fromId) return fromId;
  const period = state.evaluationPeriods.find((item) => item.id === periodId);
  const refDate = period?.startDate || period?.endDate || "";
  const parsed = new Date(refDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}
function hasMsPeriodSettingForMetric(periodId, metricKey) {
  if (metricKey === "revenue") return true;
  if (!metricKey) return false;
  const monthStr = resolveMsSettingsMonthByPeriodId(periodId);
  if (!monthStr) return false;
  const customPeriod = goalSettingsService.getMsPeriodForMetric(monthStr, metricKey);
  return Boolean(customPeriod?.startDate && customPeriod?.endDate);
}
function buildCumulativeSeries(total, length) {
  const series = [];
  if (!Number.isFinite(total) || length <= 0) return series;
  for (let index = 0; index < length; index += 1) {
    series.push(calcCumulativeValue(total, index, length));
  }
  return series;
}
function calcCumulativeValue(total, index, length) {
  const totalNumber = Number(total);
  if (!Number.isFinite(totalNumber) || totalNumber <= 0 || length <= 0) return 0;
  if (index >= length - 1) return totalNumber;
  return Math.round(totalNumber * (index + 1) / length);
}
function getPersonalDailyTargetMap(deptKey, metricKey) {
  return state.personalDailyMs.targets?.[deptKey]?.[metricKey] || {};
}
function getLastCumulativeTarget(dates, targets = {}, deptKey, periodId, metricKey) {
  let last = 0;
  dates.forEach((date) => {
    const disabled = isDateBeforePersonalDeptStart(date, deptKey, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, deptKey, periodId, metricKey);
    if (disabled) return;
    const value = targets?.[date];
    if (value !== void 0 && value !== null && value !== "") {
      last = num(value);
    }
  });
  return last;
}
async function persistPersonalDailyMsTargets(periodId, deptKey, metricKey) {
  if (!periodId || !deptKey || !metricKey) return;
  const advisorUserId = await resolveAdvisorUserId2();
  const dailyTargets = getPersonalDailyTargetMap(deptKey, metricKey);
  const period = state.evaluationPeriods.find((item) => item.id === periodId);
  const range = resolvePersonalDailyDateRange(periodId, deptKey, metricKey);
  const dates = range.startDate && range.endDate ? enumerateDateRange(range.startDate, range.endDate) : [];
  const targetTotal = state.personalDailyMs.totals?.[deptKey]?.[metricKey] ?? getLastCumulativeTarget(dates, dailyTargets, deptKey, periodId, metricKey);
  try {
    await goalSettingsService.saveMsTargets({
      scope: "personal",
      departmentKey: deptKey,
      metricKey,
      periodId,
      advisorUserId,
      targetTotal,
      dailyTargets
    });
  } catch (error) {
    console.warn("[yield] failed to save personal daily ms targets", error);
  }
}
async function loadPersonalDailyMsTargets(periodId, deptKey, metricKey) {
  if (!periodId || !deptKey || !metricKey) return;
  const advisorUserId = await resolveAdvisorUserId2();
  const monthStr = resolveMsSettingsMonthByPeriodId(periodId);
  if (monthStr && !goalSettingsService.getMsPeriodSettings(monthStr)) {
    await goalSettingsService.loadMsPeriodSettings(monthStr).catch(() => {
    });
  }
  const data = await goalSettingsService.loadMsTargets({
    scope: "personal",
    departmentKey: deptKey,
    metricKey,
    periodId,
    advisorUserId
  });
  if (!data) return;
  if (!state.personalDailyMs.targets) state.personalDailyMs.targets = {};
  if (!state.personalDailyMs.targets[deptKey]) state.personalDailyMs.targets[deptKey] = {};
  state.personalDailyMs.targets[deptKey][metricKey] = data.dailyTargets || {};
  if (!state.personalDailyMs.totals) state.personalDailyMs.totals = {};
  if (!state.personalDailyMs.totals[deptKey]) state.personalDailyMs.totals[deptKey] = {};
  state.personalDailyMs.totals[deptKey][metricKey] = num(data.targetTotal || 0);
}
async function handlePersonalDailyDistribute(event) {
  const button = event.target;
  const deptKey = button.dataset.dept;
  const metricKey = button.dataset.metric;
  const periodId = state.personalDailyPeriodId;
  if (!deptKey || !metricKey || !periodId) return;
  const datesForTotal = (() => {
    const range2 = resolvePersonalDailyDateRange(periodId, deptKey, metricKey);
    return range2.startDate && range2.endDate ? enumerateDateRange(range2.startDate, range2.endDate) : [];
  })();
  const currentTotal = state.personalDailyMs.totals?.[deptKey]?.[metricKey] ?? getLastCumulativeTarget(datesForTotal, getPersonalDailyTargetMap(deptKey, metricKey), deptKey, periodId, metricKey);
  const input = prompt("\u6700\u7D42\u76EE\u6A19\u5024\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044", currentTotal ? String(currentTotal) : "");
  if (input === null) return;
  const total = Number(input);
  if (!Number.isFinite(total) || total < 0) return;
  const range = resolvePersonalDailyDateRange(periodId, deptKey, metricKey);
  if (!range.startDate || !range.endDate) return;
  const dates = enumerateDateRange(range.startDate, range.endDate);
  const activeDates = dates.filter((date) => {
    const disabled = isDateBeforePersonalDeptStart(date, deptKey, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, deptKey, periodId, metricKey);
    return !disabled;
  });
  const cumulative = buildCumulativeSeries(total, activeDates.length);
  const targetMap = {};
  let activeIndex = 0;
  dates.forEach((date) => {
    const disabled = isDateBeforePersonalDeptStart(date, deptKey, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, deptKey, periodId, metricKey);
    if (disabled) return;
    targetMap[date] = cumulative[activeIndex] ?? 0;
    activeIndex += 1;
  });
  if (!state.personalDailyMs.targets) state.personalDailyMs.targets = {};
  if (!state.personalDailyMs.targets[deptKey]) state.personalDailyMs.targets[deptKey] = {};
  state.personalDailyMs.targets[deptKey][metricKey] = targetMap;
  if (!state.personalDailyMs.totals) state.personalDailyMs.totals = {};
  if (!state.personalDailyMs.totals[deptKey]) state.personalDailyMs.totals[deptKey] = {};
  state.personalDailyMs.totals[deptKey][metricKey] = total;
  const dailyData = state.personalDailyData[periodId] || {};
  renderPersonalDailyTable(periodId, dailyData);
  persistPersonalDailyMsTargets(periodId, deptKey, metricKey);
}
function renderPersonalDailyTable(periodId, dailyData = {}) {
  const body = document.getElementById("personalDailyTableBody");
  const headerRow = document.getElementById("personalDailyHeaderRow");
  const labelEl = document.getElementById("personalDailyPeriodLabel");
  const period = state.evaluationPeriods.find((item) => item.id === periodId);
  if (!body || !headerRow) return;
  if (!period) {
    body.innerHTML = "";
    headerRow.innerHTML = "";
    if (labelEl) labelEl.textContent = "";
    return;
  }
  const deptKey = state.personalDailyMs.departmentKey || getDepartmentFromRole(getSession()?.user?.role || "");
  const targetDepts = [];
  if (deptKey) targetDepts.push(deptKey);
  if (!targetDepts.includes("revenue")) {
    targetDepts.push("revenue");
  }
  const useDeptTotals = deptKey === "marketing";
  const effectiveDailyData = useDeptTotals ? buildDailyTotalsAllMetrics(periodId) : dailyData;
  let minDateObj = null;
  let maxDateObj = null;
  targetDepts.forEach((dept) => {
    if (dept === "revenue") {
      const rRange = resolvePersonalDailyDateRange(periodId, "revenue");
      const s = parseLocalDate(rRange.startDate);
      const e = parseLocalDate(rRange.endDate);
      if (s && (!minDateObj || s < minDateObj)) minDateObj = s;
      if (e && (!maxDateObj || e > maxDateObj)) maxDateObj = e;
      return;
    }
    const deptMetrics = getMetricsForDept(dept);
    deptMetrics.forEach((m) => {
      const mRange = resolvePersonalDailyDateRange(periodId, dept, m.key);
      const s = parseLocalDate(mRange.startDate);
      const e = parseLocalDate(mRange.endDate);
      if (s && (!minDateObj || s < minDateObj)) minDateObj = s;
      if (e && (!maxDateObj || e > maxDateObj)) maxDateObj = e;
    });
  });
  if (!minDateObj || !maxDateObj) {
    const fallbackRange = resolvePersonalDailyDateRange(periodId, deptKey);
    minDateObj = parseLocalDate(fallbackRange.startDate);
    maxDateObj = parseLocalDate(fallbackRange.endDate);
  }
  const overallStartDate = isoDate2(minDateObj);
  const overallEndDate = isoDate2(maxDateObj);
  const dates = enumerateDateRange(overallStartDate, overallEndDate);
  const advisorName = getAdvisorName();
  const periodTarget = goalSettingsService.getPersonalPeriodTarget(periodId, advisorName) || {};
  const monthStr = resolveMsSettingsMonthByPeriodId(periodId);
  if (labelEl) {
    const labelText = formatPeriodMonthLabel(period) || "";
    labelEl.textContent = labelText ? `\u8A55\u4FA1\u671F\u9593\uFF1A${labelText}` : "";
  }
  const dateCells = dates.map((date) => `<th scope="col" class="ms-date-header">${formatMonthDayLabel(date)}</th>`).join("");
  headerRow.innerHTML = `
    <th scope="col" class="kpi-v2-sticky-label">\u90E8\u7F72</th>
    <th scope="col" class="kpi-v2-sticky-label kpi-v2-ms-metric">\u6307\u6A19</th>
    <th scope="col" class="daily-type">\u533A\u5206</th>
    ${dateCells}
  `;
  if (!state.personalDailyMs) state.personalDailyMs = { metricKeys: {}, targets: {}, totals: {} };
  const rows = [];
  targetDepts.forEach((dept, deptIndex) => {
    const isRevenue = dept === "revenue";
    const metrics = isRevenue ? [{ key: "revenue", label: "\u58F2\u4E0A\u5408\u8A08", targetKey: "revenue", isCurrency: true }] : getMetricsForDept(dept);
    if (!metrics.length) return;
    const rowsPerMetricArr = metrics.map((m) => {
      if (isRevenue) return 3;
      if (!m.key) return 1;
      return hasMsPeriodSettingForMetric(periodId, m.key) ? 3 : 1;
    });
    const deptRowspan = rowsPerMetricArr.reduce((sum, n) => sum + n, 0);
    const deptLabel = dept === "marketing" ? "\u30DE\u30FC\u30B1" : dept === "cs" ? "CS" : dept === "sales" ? "\u55B6\u696D" : "\u58F2\u4E0A";
    if (!state.personalMs.metricKeys) state.personalMs.metricKeys = {};
    if (!state.personalMs.metricKeys[dept]) {
      state.personalMs.metricKeys[dept] = metrics[0]?.key || "";
    }
    const importantMetricKey = state.personalMs.metricKeys[dept] || "";
    const importantSelect = dept !== "revenue" ? `<select class="kpi-v2-sort-select personal-daily-important-select" data-dept="${dept}">
           ${metrics.map((option) => `<option value="${option.key}" ${option.key === importantMetricKey ? "selected" : ""}>${option.label}</option>`).join("")}
         </select>` : "";
    metrics.forEach((metricOption, metricIndex) => {
      const metricKey = metricOption.key;
      const metricLabel = metricOption.label || "";
      const isImportant = !isRevenue && importantMetricKey && metricKey === importantMetricKey;
      const highlightClass = isImportant ? "ms-important-row" : "";
      const hasMsPeriod = isRevenue || rowsPerMetricArr[metricIndex] === 3;
      if (!hasMsPeriod) {
        const noticeTriplet = (deptIndex + metricIndex) % 2 === 1 ? "daily-triplet-alt" : "";
        const noticeDeptCell = metricIndex === 0 ? `<th scope="row" class="kpi-v2-sticky-label ms-dept-cell" rowspan="${deptRowspan}">
               <div class="ms-metric-cell">
                 <span>${deptLabel}</span>
                 ${importantSelect}
               </div>
             </th>` : "";
        rows.push(`
          <tr class="${noticeTriplet} ${highlightClass}">
            ${noticeDeptCell}
            <th scope="row" class="kpi-v2-sticky-label kpi-v2-ms-metric" rowspan="1">
              <div class="ms-metric-cell"><span>${metricLabel}</span></div>
            </th>
            <td class="daily-type ms-no-period-notice" colspan="${dates.length + 1}">
              \u26A0 ${monthStr || "\u9078\u629E\u6708"} \u306EMS\u671F\u9593\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093
            </td>
          </tr>
        `);
        return;
      }
      const distributeButton = `<div class="ms-distribute-wrap"><button type="button" class="ms-distribute-btn" data-ms-distribute data-scope="personalDaily" data-dept="${dept}" data-metric="${metricKey}">\u65E5\u5272\u308A\u5B9F\u884C</button></div>`;
      const metricCell = `<th scope="row" class="kpi-v2-sticky-label kpi-v2-ms-metric" rowspan="3">
           <div class="ms-metric-cell">
             <span>${metricLabel}</span>
             ${distributeButton}
           </div>
         </th>`;
      const field = DAILY_FIELDS.find((f) => f.dataKey === metricOption.targetKey);
      const periodTargetKey = field?.targetKey || null;
      const storedTotal = state.personalDailyMs.totals?.[dept]?.[metricKey];
      const totalTarget = Number.isFinite(storedTotal) ? num(storedTotal) : periodTargetKey ? num(periodTarget?.[periodTargetKey]) : 0;
      const targetMap = getPersonalDailyTargetMap(dept, metricKey);
      const activeDates = dates.filter((date) => {
        const disabled = isDateBeforePersonalDeptStart(date, dept, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, dept, periodId, metricKey);
        return !disabled;
      });
      const fallbackCumulative = totalTarget > 0 ? buildCumulativeSeries(totalTarget, activeDates.length) : [];
      let activeIndex = 0;
      const cumulativeTargets = dates.map((date) => {
        const isDisabled = isDateBeforePersonalDeptStart(date, dept, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, dept, periodId, metricKey);
        if (isDisabled) return null;
        const saved = targetMap?.[date];
        if (saved !== void 0 && saved !== null && saved !== "") {
          activeIndex += 1;
          return num(saved);
        }
        const fallback = fallbackCumulative[activeIndex] ?? null;
        activeIndex += 1;
        return fallback;
      });
      const dailyActuals = [];
      let actualSum = 0;
      dates.forEach((date) => {
        const isDisabled = isDateBeforePersonalDeptStart(date, dept, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, dept, periodId, metricKey);
        if (isDisabled) {
          dailyActuals.push(null);
          return;
        }
        const dayCounts = effectiveDailyData?.[date] || {};
        const value = getDailyMetricValue(dayCounts, metricOption, metricKey);
        actualSum += num(value);
        dailyActuals.push(num(value));
      });
      const cumulativeActuals = [];
      let running = 0;
      dailyActuals.forEach((value) => {
        if (value === null) {
          cumulativeActuals.push(null);
          return;
        }
        running += num(value);
        cumulativeActuals.push(running);
      });
      const msCells = dates.map((date, idx) => {
        const isDisabled = isDateBeforePersonalDeptStart(date, dept, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, dept, periodId, metricKey);
        if (isDisabled) return `<td class="ms-cell-disabled"></td>`;
        const value = cumulativeTargets[idx];
        const displayValue = Number.isFinite(value) ? value : "";
        return `
          <td class="ms-target-cell">
            <input type="number" class="ms-target-input personal-daily-ms-input"
                   data-dept="${dept}"
                   data-date="${date}"
                   data-metric="${metricKey}"
                   value="${displayValue}"
                   min="0" />
          </td>
        `;
      }).join("");
      const rateCells = dates.map((date, idx) => {
        const isDisabled = isDateBeforePersonalDeptStart(date, dept, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, dept, periodId, metricKey);
        if (isDisabled) return `<td class="ms-cell-disabled"></td>`;
        const cumulativeActual = cumulativeActuals[idx] ?? 0;
        const cumulativeTarget = cumulativeTargets[idx] ?? 0;
        let rateDisplay = "-";
        let rateClass = "";
        if (cumulativeTarget && Number(cumulativeTarget) > 0) {
          const rate = Math.round(cumulativeActual / Number(cumulativeTarget) * 100);
          rateDisplay = `${rate}%`;
          rateClass = rate >= 100 ? "ms-rate-good" : rate >= 80 ? "ms-rate-warn" : "ms-rate-bad";
        }
        return `<td class="ms-rate-cell ${rateClass}">${rateDisplay}</td>`;
      }).join("");
      const actualCells = dates.map((date, idx) => {
        const isDisabled = isDateBeforePersonalDeptStart(date, dept, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, dept, periodId, metricKey);
        if (isDisabled) return `<td class="ms-cell-disabled"></td>`;
        const displayValue = metricOption.isCurrency ? formatCurrencyCell(cumulativeActuals[idx]) : formatNumberCell(cumulativeActuals[idx]);
        return `<td class="ms-actual-cell">${displayValue}</td>`;
      }).join("");
      const tripletAlt = (deptIndex + metricIndex) % 2 === 1 ? "daily-triplet-alt" : "";
      const deptCell = metricIndex === 0 ? `<th scope="row" class="kpi-v2-sticky-label ms-dept-cell" rowspan="${deptRowspan}">
             <div class="ms-metric-cell">
               <span>${deptLabel}</span>
               ${importantSelect}
             </div>
           </th>` : "";
      rows.push(`
        <tr class="${tripletAlt} ${highlightClass}">
          ${deptCell}
          ${metricCell}
          <td class="daily-type">MS</td>
          ${msCells}
        </tr>
      `);
      rows.push(`
        <tr class="${tripletAlt} ${highlightClass}">
          <td class="daily-type">\u9032\u6357\u7387</td>
          ${rateCells}
        </tr>
      `);
      rows.push(`
        <tr class="${tripletAlt} ${highlightClass}">
          <td class="daily-type">\u5B9F\u7E3E</td>
          ${actualCells}
        </tr>
      `);
    });
  });
  body.innerHTML = rows.join("");
  body.querySelectorAll(".personal-daily-ms-input").forEach((input) => {
    if (input.dataset.bound) return;
    input.addEventListener("change", (event) => {
      const el = event.target;
      const { dept, metric, date } = el.dataset;
      if (!dept || !metric || !date) return;
      if (!state.personalDailyMs.targets) state.personalDailyMs.targets = {};
      if (!state.personalDailyMs.targets[dept]) state.personalDailyMs.targets[dept] = {};
      if (!state.personalDailyMs.targets[dept][metric]) state.personalDailyMs.targets[dept][metric] = {};
      state.personalDailyMs.targets[dept][metric][date] = num(el.value);
      if (!state.personalDailyMs.totals) state.personalDailyMs.totals = {};
      if (!state.personalDailyMs.totals[dept]) state.personalDailyMs.totals[dept] = {};
      state.personalDailyMs.totals[dept][metric] = getLastCumulativeTarget(dates, state.personalDailyMs.targets[dept][metric], dept, periodId, metric);
      renderPersonalDailyTable(periodId, dailyData);
      persistPersonalDailyMsTargets(periodId, dept, metric);
    });
    input.dataset.bound = "true";
  });
  body.querySelectorAll(".personal-daily-important-select").forEach((select) => {
    if (select.dataset.bound) return;
    select.addEventListener("change", async (event) => {
      const dept = event.target.dataset.dept;
      const value = event.target.value;
      if (!dept) return;
      if (!state.personalMs.metricKeys) state.personalMs.metricKeys = {};
      state.personalMs.metricKeys[dept] = value;
      const userId = await resolveAdvisorUserId2();
      if (userId) {
        if (!state.personalMs.importantMetrics) state.personalMs.importantMetrics = {};
        if (!state.personalMs.importantMetrics[dept]) state.personalMs.importantMetrics[dept] = {};
        state.personalMs.importantMetrics[dept][String(userId)] = value;
        try {
          await goalSettingsService.saveImportantMetric({
            departmentKey: dept,
            userId: Number(userId),
            metricKey: value
          });
        } catch (error) {
          console.warn("[yield] failed to save important metric (personal daily)", error);
        }
      }
      const monthStr2 = resolveMsSettingsMonthByPeriodId(periodId);
      if (monthStr2) {
        await goalSettingsService.loadMsPeriodSettings(monthStr2, { force: true }).catch(() => {
        });
      }
      renderPersonalDailyTable(periodId, dailyData);
    });
    select.dataset.bound = "true";
  });
  body.querySelectorAll('[data-ms-distribute][data-scope="personalDaily"]').forEach((button) => {
    if (button.dataset.bound) return;
    button.addEventListener("click", handlePersonalDailyDistribute);
    button.dataset.bound = "true";
  });
}
async function loadAndRenderCompanyDaily() {
  const periodId = state.companyDailyPeriodId;
  if (!periodId) return;
  await ensureDailyYieldData(periodId, { calcModeScope: "employee" });
  renderCompanyDailyEmployeeOptions();
  ensureCompanyDailyEmployeeId();
  const employeeId = state.companyDailyEmployeeId;
  if (!employeeId) return;
  await Promise.all([
    goalSettingsService.loadPersonalPeriodTarget(periodId, employeeId),
    goalSettingsService.loadPersonalDailyTargets(periodId, employeeId)
  ]);
  const dailyData = state.companyDailyData[employeeId]?.[periodId] || {};
  renderCompanyDailyTable(periodId, employeeId, dailyData);
}
function renderCompanyDailyTable(periodId, employeeId, dailyData = {}) {
  const body = document.getElementById("companyDailyTableBody");
  const headerRow = document.getElementById("companyDailyHeaderRow");
  const labelEl = document.getElementById("companyDailyPeriodLabel");
  const period = state.evaluationPeriods.find((item) => item.id === periodId);
  if (!body || !headerRow) return;
  if (!period) {
    body.innerHTML = "";
    headerRow.innerHTML = "";
    if (labelEl) labelEl.textContent = "";
    return;
  }
  const dates = enumeratePeriodDates(period);
  const advisorName = employeeId || null;
  const periodTarget = goalSettingsService.getPersonalPeriodTarget(periodId, advisorName) || {};
  const savedTargets = goalSettingsService.getPersonalDailyTargets(periodId, advisorName) || {};
  const cumulativeFallback = DAILY_FIELDS.reduce((acc, field) => {
    const rawTotal = periodTarget[field.targetKey];
    if (rawTotal === void 0 || rawTotal === null) return acc;
    const totalTarget = num(rawTotal);
    acc[field.targetKey] = buildCumulativeSeries(totalTarget, dates.length);
    return acc;
  }, {});
  if (labelEl) labelEl.textContent = `\u8A55\u4FA1\u671F\u9593\uFF1A${period.startDate}\u301C${period.endDate}`;
  renderDailyMatrix({
    headerRow,
    body,
    dates,
    dailyData,
    resolveValues: (field, date, dateIndex) => {
      const actual = dailyData[date] || {};
      const target = savedTargets[date] || {};
      const rawTarget = target[field.targetKey];
      const expected = rawTarget !== void 0 && rawTarget !== null ? num(rawTarget) : cumulativeFallback[field.targetKey] !== void 0 ? cumulativeFallback[field.targetKey][dateIndex] : null;
      return { actual: actual[field.dataKey], target: expected };
    }
  });
  if (labelEl) {
    const labelText = formatPeriodMonthLabel(period) || "";
    labelEl.textContent = labelText ? `\u8A55\u4FA1\u671F\u9593\uFF1A${labelText}` : "";
  }
}
function getMsMetricOption(metricKey) {
  return MS_METRIC_OPTIONS.find((option) => option.key === metricKey) || MS_METRIC_OPTIONS[0];
}
function getAutoCalculatedActual(memberId, date, metricKey) {
  const allMetrics = [...MS_MARKETING_METRICS, ...MS_CS_METRICS, ...MS_SALES_METRICS];
  const metricDef = allMetrics.find((m) => m.key === metricKey);
  const dataKey = metricDef ? metricDef.targetKey : metricKey;
  const snakeKey = dataKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const periodId = state.companyMsPeriodId;
  const dailyData = state.companyDailyDataMs[String(memberId)]?.[periodId]?.[date] ?? state.companyDailyData[String(memberId)]?.[periodId]?.[date];
  if (dailyData) {
    const val = dailyData[dataKey] ?? dailyData[snakeKey];
    if (val !== void 0 && Math.random() < 0.05) console.log(`[DEBUG] AutoCalc hit for ${memberId}/${date}/${metricKey}:`, { dataKey, snakeKey, val, dailyData });
    return val !== void 0 ? Number(val) : 0;
  }
  return 0;
}
function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}
function enumerateDateRange(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const dates = [];
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end || Number.isNaN(start) || Number.isNaN(end)) return [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(isoDate2(d));
  }
  return dates;
}
function resolveCompanyMsRanges(period) {
  const emptyRange = { startDate: "", endDate: "" };
  const emptyResult = {
    salesRange: emptyRange,
    revenueRange: emptyRange,
    marketingRange: emptyRange,
    csRange: emptyRange
  };
  if (!period?.startDate || !period?.endDate) {
    return emptyResult;
  }
  const baseRange = { startDate: period.startDate, endDate: period.endDate };
  const end = new Date(period.endDate);
  if (Number.isNaN(end.getTime())) {
    return {
      salesRange: baseRange,
      revenueRange: baseRange,
      marketingRange: baseRange,
      csRange: baseRange
    };
  }
  const currentYear = end.getFullYear();
  const currentMonth = end.getMonth();
  const marketingStart = new Date(currentYear, currentMonth - 1, 17);
  const marketingEnd = new Date(currentYear, currentMonth, 19);
  const csStart = new Date(currentYear, currentMonth - 1, 18);
  const csEnd = new Date(currentYear, currentMonth, 20);
  const salesStart = new Date(currentYear, currentMonth - 1, 18);
  const salesEnd = new Date(currentYear, currentMonth, 19);
  const revenueStart = new Date(currentYear, currentMonth, 1);
  const revenueEnd = new Date(currentYear, currentMonth + 1, 0);
  const msOverallStart = new Date(currentYear, currentMonth - 1, 17);
  const msOverallEnd = new Date(currentYear, currentMonth + 1, 0);
  return {
    salesRange: { startDate: isoDate2(salesStart), endDate: isoDate2(salesEnd) },
    revenueRange: { startDate: isoDate2(revenueStart), endDate: isoDate2(revenueEnd) },
    marketingRange: { startDate: isoDate2(marketingStart), endDate: isoDate2(marketingEnd) },
    csRange: { startDate: isoDate2(csStart), endDate: isoDate2(csEnd) },
    msOverallRange: { startDate: isoDate2(msOverallStart), endDate: isoDate2(msOverallEnd) }
  };
}
function resolvePersonalMsRangeByDept(periodId, deptKey, fallbackRange = null) {
  const metrics = getMetricsForDept(deptKey);
  let minDateObj = null;
  let maxDateObj = null;
  metrics.forEach((metric) => {
    const range = resolvePersonalDailyDateRange(periodId, deptKey, metric.key);
    const startObj = parseLocalDate(range?.startDate);
    const endObj = parseLocalDate(range?.endDate);
    if (startObj && (!minDateObj || startObj < minDateObj)) minDateObj = startObj;
    if (endObj && (!maxDateObj || endObj > maxDateObj)) maxDateObj = endObj;
  });
  if (!minDateObj || !maxDateObj) {
    const fallback = fallbackRange?.startDate && fallbackRange?.endDate ? fallbackRange : resolvePersonalDailyDateRange(periodId, deptKey);
    minDateObj = parseLocalDate(fallback?.startDate);
    maxDateObj = parseLocalDate(fallback?.endDate);
  }
  if (!minDateObj || !maxDateObj) {
    return { startDate: "", endDate: "", dates: [] };
  }
  const startDate = isoDate2(minDateObj);
  const endDate = isoDate2(maxDateObj);
  return {
    startDate,
    endDate,
    dates: enumerateDateRange(startDate, endDate)
  };
}
if (typeof window !== "undefined") {
  window.__yieldDebug = window.__yieldDebug || {};
  window.__yieldDebug.getCompanyMsRange = () => {
    const period = state.evaluationPeriods.find((p) => p.id === state.companyMsPeriodId);
    return {
      periodId: state.companyMsPeriodId,
      period,
      ranges: resolveCompanyMsRanges(period)
    };
  };
  window.__yieldDebug.getCompanyMsDates = () => ({
    periodId: state.companyMsPeriodId,
    count: state.companyMs?.dates?.length || 0,
    head: (state.companyMs?.dates || []).slice(0, 5),
    tail: (state.companyMs?.dates || []).slice(-5)
  });
  window.__yieldDebug.reloadCompanyMs = () => loadAndRenderCompanyMs();
}
async function resolveAdvisorEmployees() {
  const members = await ensureMembersList();
  const advisors = (members || []).filter((member) => isAdvisorRole(member.role));
  if (advisors.length) {
    return advisors.map((member) => ({
      id: String(member.id),
      name: member.name || `ID:${member.id}`
    }));
  }
  return getCompanyDailyEmployees().map((emp) => ({
    id: String(emp.id),
    name: emp.name || `ID:${emp.id}`
  }));
}
function buildCompanyMsDailyTotalsFromEmployees(employees, employeeIds) {
  const totals = {};
  const allowSet = new Set((employeeIds || []).map((id) => String(id)));
  (employees || []).forEach((emp) => {
    const id = String(emp?.advisorUserId ?? emp?.id ?? "");
    if (!id) return;
    if (allowSet.size && !allowSet.has(id)) return;
    const series = emp?.daily || emp?.dailyData || emp?.series || {};
    Object.entries(series).forEach(([date, counts]) => {
      if (!totals[date]) totals[date] = {};
      Object.entries(counts || {}).forEach(([key, value]) => {
        totals[date][key] = num(totals[date][key]) + num(value);
      });
    });
  });
  return totals;
}
function buildCompanyMsHeaderRow(headerRow, dates) {
  if (!headerRow) return;
  const dateCells = dates.map((date) => {
    const dayLabel = formatMonthDayLabel(date);
    return `<th scope="col" class="ms-date-header">${dayLabel}</th>`;
  }).join("");
  headerRow.innerHTML = `
    <th scope="col" class="kpi-v2-sticky-label">\u90E8\u7F72</th>
    <th scope="col" class="kpi-v2-sticky-label kpi-v2-ms-metric">\u6307\u6A19</th>
    <th scope="col" class="daily-type">\u533A\u5206</th>
    ${dateCells}
  `;
}
function resolvePersonalDailyDateRange(periodId, deptKey, metricKey) {
  const period = state.evaluationPeriods.find((p) => p.id === periodId);
  if (!period?.startDate && !period?.endDate) return { startDate: "", endDate: "" };
  const monthStr = resolveMsSettingsMonthByPeriodId(periodId);
  let currentYear = null;
  let currentMonth = null;
  const monthMatched = String(monthStr).match(/^(\d{4})-(\d{2})$/);
  if (monthMatched) {
    currentYear = Number(monthMatched[1]);
    currentMonth = Number(monthMatched[2]) - 1;
  } else {
    const fallbackDate = new Date(period?.startDate || period?.endDate || "");
    if (Number.isNaN(fallbackDate.getTime())) {
      return { startDate: period?.startDate || "", endDate: period?.endDate || "" };
    }
    currentYear = fallbackDate.getFullYear();
    currentMonth = fallbackDate.getMonth();
  }
  if (metricKey && metricKey !== "revenue") {
    const customPeriod = goalSettingsService.getMsPeriodForMetric(monthStr, metricKey);
    if (customPeriod?.startDate && customPeriod?.endDate) {
      return { startDate: customPeriod.startDate, endDate: customPeriod.endDate };
    }
  }
  if (deptKey === "revenue") {
    return {
      startDate: isoDate2(new Date(currentYear, currentMonth, 1)),
      endDate: isoDate2(new Date(currentYear, currentMonth + 1, 0))
    };
  }
  if (deptKey === "marketing") {
    return {
      startDate: isoDate2(new Date(currentYear, currentMonth - 1, 17)),
      endDate: isoDate2(new Date(currentYear, currentMonth, 19))
    };
  }
  if (deptKey === "cs") {
    return {
      startDate: isoDate2(new Date(currentYear, currentMonth - 1, 18)),
      endDate: isoDate2(new Date(currentYear, currentMonth, 20))
    };
  }
  return {
    startDate: isoDate2(new Date(currentYear, currentMonth - 1, 18)),
    endDate: isoDate2(new Date(currentYear, currentMonth, 19))
  };
}
function isDateBeforePersonalDeptStart(date, deptKey, periodId, metricKey) {
  const range = resolvePersonalDailyDateRange(periodId, deptKey, metricKey);
  if (!range.startDate) return false;
  const dateObj = parseLocalDate(date);
  const startObj = parseLocalDate(range.startDate);
  if (!dateObj || !startObj) return false;
  return dateObj < startObj;
}
function isDateAfterPersonalDeptEnd(date, deptKey, periodId, metricKey) {
  const range = resolvePersonalDailyDateRange(periodId, deptKey, metricKey);
  if (!range.endDate) return false;
  const dateObj = parseLocalDate(date);
  const endObj = parseLocalDate(range.endDate);
  if (!dateObj || !endObj) return false;
  return dateObj > endObj;
}
function isDateBeforeDeptStart(date, deptKey, periodId = state.companyMsPeriodId, metricKey = "") {
  const period = state.evaluationPeriods.find((p) => p.id === periodId);
  if (!period?.endDate) return false;
  const end = new Date(period.endDate);
  const currentYear = end.getFullYear();
  const currentMonth = end.getMonth();
  const dateObj = parseLocalDate(date);
  if (!dateObj) return false;
  if (metricKey) {
    const customRange = resolvePersonalDailyDateRange(periodId, deptKey, metricKey);
    const customStart = parseLocalDate(customRange?.startDate);
    if (customStart) return dateObj < customStart;
  }
  let startDate;
  switch (deptKey) {
    case "marketing":
      startDate = new Date(currentYear, currentMonth - 1, 17);
      break;
    case "cs":
    case "sales":
      startDate = new Date(currentYear, currentMonth - 1, 18);
      break;
    case "revenue":
      startDate = new Date(currentYear, currentMonth, 1);
      break;
    default:
      return false;
  }
  return dateObj < startDate;
}
function isDateAfterDeptEnd(date, deptKey, periodId = state.companyMsPeriodId, metricKey = "") {
  const period = state.evaluationPeriods.find((p) => p.id === periodId);
  if (!period?.endDate) return false;
  const end = new Date(period.endDate);
  const currentYear = end.getFullYear();
  const currentMonth = end.getMonth();
  const dateObj = parseLocalDate(date);
  if (!dateObj) return false;
  if (metricKey) {
    const customRange = resolvePersonalDailyDateRange(periodId, deptKey, metricKey);
    const customEnd = parseLocalDate(customRange?.endDate);
    if (customEnd) return dateObj > customEnd;
  }
  let endDate;
  switch (deptKey) {
    case "marketing":
      endDate = new Date(currentYear, currentMonth, 19);
      break;
    case "cs":
      endDate = new Date(currentYear, currentMonth, 20);
      break;
    case "sales":
      endDate = new Date(currentYear, currentMonth, 19);
      break;
    case "revenue":
      endDate = new Date(currentYear, currentMonth + 1, 0);
      break;
    default:
      return false;
  }
  return dateObj > endDate;
}
function sumTargetValues(targets = {}) {
  return Object.values(targets).reduce((sum, value) => sum + num(value), 0);
}
function getLastCumulativeTargetForCompany(dates, targets = {}, deptKey, periodId = state.companyMsPeriodId, metricKey = "") {
  let last = 0;
  dates.forEach((date) => {
    const disabled = isDateBeforeDeptStart(date, deptKey, periodId, metricKey) || isDateAfterDeptEnd(date, deptKey, periodId, metricKey);
    if (disabled) return;
    const value = targets?.[date];
    if (value !== void 0 && value !== null && value !== "") {
      last = num(value);
    }
  });
  return last;
}
function getCompanyMsTargetMap(deptKey, metricKey) {
  return state.companyMs.msTargets?.[deptKey]?.[metricKey] || {};
}
async function persistCompanyMsTargets(deptKey, metricKey) {
  const periodId = state.companyMsPeriodId;
  if (!periodId || !deptKey || !metricKey) return;
  const dailyTargets = getCompanyMsTargetMap(deptKey, metricKey);
  const dates = state.companyMs.dates || [];
  const targetTotal = state.companyMs.msTargetTotals?.[deptKey]?.[metricKey] ?? (dates.length ? getLastCumulativeTargetForCompany(dates, dailyTargets, deptKey, periodId, metricKey) : sumTargetValues(dailyTargets));
  try {
    await goalSettingsService.saveMsTargets({
      scope: "company",
      departmentKey: deptKey,
      metricKey,
      periodId,
      targetTotal,
      dailyTargets
    });
  } catch (error) {
    console.warn("[yield] failed to save company ms targets", error);
  }
}
async function loadCompanyMsTargets(periodId) {
  if (!periodId) return;
  const tasks = [];
  MS_DEPARTMENTS.forEach((dept) => {
    const isRevenue = dept.key === "revenue";
    const metricKey = isRevenue ? "revenue" : state.companyMs.metricKeys?.[dept.key] || getMetricsForDept(dept.key)[0]?.key;
    if (!metricKey) return;
    tasks.push((async () => {
      const data = await goalSettingsService.loadMsTargets({
        scope: "company",
        departmentKey: dept.key,
        metricKey,
        periodId
      });
      if (!data) return;
      if (!state.companyMs.msTargets) state.companyMs.msTargets = {};
      if (!state.companyMs.msTargets[dept.key]) state.companyMs.msTargets[dept.key] = {};
      state.companyMs.msTargets[dept.key][metricKey] = data.dailyTargets || {};
      if (!state.companyMs.msTargetTotals) state.companyMs.msTargetTotals = {};
      if (!state.companyMs.msTargetTotals[dept.key]) state.companyMs.msTargetTotals[dept.key] = {};
      state.companyMs.msTargetTotals[dept.key][metricKey] = num(data.targetTotal || 0);
    })());
  });
  await Promise.all(tasks);
}
function handleMsTargetInput(event) {
  const input = event.target;
  const { dept, date, metric } = input.dataset;
  const value = Number(input.value) || 0;
  if (!state.companyMs.msTargets) state.companyMs.msTargets = {};
  if (!state.companyMs.msTargets[dept]) state.companyMs.msTargets[dept] = {};
  if (!state.companyMs.msTargets[dept][metric]) state.companyMs.msTargets[dept][metric] = {};
  state.companyMs.msTargets[dept][metric][date] = value;
  if (!state.companyMs.msTargetTotals) state.companyMs.msTargetTotals = {};
  if (!state.companyMs.msTargetTotals[dept]) state.companyMs.msTargetTotals[dept] = {};
  const dates = state.companyMs.dates || [];
  state.companyMs.msTargetTotals[dept][metric] = dates.length ? getLastCumulativeTargetForCompany(dates, state.companyMs.msTargets[dept][metric], dept, state.companyMsPeriodId, metric) : sumTargetValues(state.companyMs.msTargets[dept][metric]);
  renderCompanyMsTable();
  persistCompanyMsTargets(dept, metric);
}
function distributeMsTargets(totalTarget, dates, deptKey, periodId, metricKey = "") {
  const activeDates = dates.filter((date) => {
    const disabled = isDateBeforeDeptStart(date, deptKey, periodId, metricKey) || isDateAfterDeptEnd(date, deptKey, periodId, metricKey);
    return !disabled;
  });
  const cumulative = buildCumulativeSeries(totalTarget, activeDates.length);
  const map = {};
  let activeIndex = 0;
  dates.forEach((date) => {
    const disabled = isDateBeforeDeptStart(date, deptKey, periodId, metricKey) || isDateAfterDeptEnd(date, deptKey, periodId, metricKey);
    if (disabled) return;
    map[date] = cumulative[activeIndex] ?? 0;
    activeIndex += 1;
  });
  return map;
}
function handleCompanyMsDistribute(event) {
  const button = event.target;
  const deptKey = button.dataset.dept;
  const metricKey = button.dataset.metric;
  const periodId = state.companyMsPeriodId;
  if (!deptKey || !metricKey || !periodId) return;
  const dates = state.companyMs.dates || [];
  const currentTotal = state.companyMs.msTargetTotals?.[deptKey]?.[metricKey] ?? (dates.length ? getLastCumulativeTargetForCompany(dates, getCompanyMsTargetMap(deptKey, metricKey), deptKey, periodId, metricKey) : sumTargetValues(getCompanyMsTargetMap(deptKey, metricKey)));
  const input = prompt("\u6700\u7D42\u76EE\u6A19\u5024\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044", currentTotal ? String(currentTotal) : "");
  if (input === null) return;
  const total = Number(input);
  if (!Number.isFinite(total) || total < 0) return;
  const targetMap = distributeMsTargets(total, state.companyMs.dates || [], deptKey, periodId, metricKey);
  if (!state.companyMs.msTargets) state.companyMs.msTargets = {};
  if (!state.companyMs.msTargets[deptKey]) state.companyMs.msTargets[deptKey] = {};
  state.companyMs.msTargets[deptKey][metricKey] = targetMap;
  if (!state.companyMs.msTargetTotals) state.companyMs.msTargetTotals = {};
  if (!state.companyMs.msTargetTotals[deptKey]) state.companyMs.msTargetTotals[deptKey] = {};
  state.companyMs.msTargetTotals[deptKey][metricKey] = total;
  renderCompanyMsTable();
  persistCompanyMsTargets(deptKey, metricKey);
}
function resolveMetricDataKey(metricOption, fallbackKey = "") {
  return metricOption?.targetKey || metricOption?.key || fallbackKey || "";
}
function getDailyMetricValue(dailyCounts, metricOption, fallbackKey = "") {
  if (!dailyCounts) return 0;
  const dataKey = resolveMetricDataKey(metricOption, fallbackKey);
  if (!dataKey) return 0;
  if (dailyCounts[dataKey] !== void 0) return num(dailyCounts[dataKey]);
  const snakeKey = dataKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  if (dailyCounts[snakeKey] !== void 0) return num(dailyCounts[snakeKey]);
  return 0;
}
function buildCumulativeFromDaily(values) {
  const result = [];
  let sum = 0;
  values.forEach((value) => {
    sum += num(value);
    result.push(sum);
  });
  return result;
}
function renderCompanyMsTable() {
  const headerRow = document.getElementById("companyMsHeaderRow");
  const body = document.getElementById("companyMsTableBody");
  if (!headerRow || !body) return;
  const periodId = state.companyMsPeriodId;
  MS_DEPARTMENTS.forEach((dept) => {
    const isRevenue = dept.key === "revenue";
    const deptMetrics = isRevenue ? [{ key: "revenue", label: "\u58F2\u4E0A", targetKey: "revenue" }] : getMetricsForDept(dept.key);
    let metricKey = isRevenue ? "revenue" : state.companyMs.metricKeys?.[dept.key];
    if (!metricKey || !deptMetrics.some((m) => m.key === metricKey)) {
      metricKey = deptMetrics[0]?.key;
      if (metricKey) {
        if (!state.companyMs.metricKeys) state.companyMs.metricKeys = {};
        state.companyMs.metricKeys[dept.key] = metricKey;
      }
    }
  });
  let minDateObj = null;
  let maxDateObj = null;
  MS_DEPARTMENTS.forEach((dept) => {
    const isRevenue = dept.key === "revenue";
    const metricKey = isRevenue ? "revenue" : state.companyMs.metricKeys?.[dept.key];
    if (!metricKey) return;
    const hasMsPeriod = isRevenue || hasMsPeriodSettingForMetric(periodId, metricKey);
    if (!hasMsPeriod) return;
    const rRange = resolvePersonalDailyDateRange(periodId, dept.key, metricKey);
    const s = parseLocalDate(rRange.startDate);
    const e = parseLocalDate(rRange.endDate);
    if (s && (!minDateObj || s < minDateObj)) minDateObj = s;
    if (e && (!maxDateObj || e > maxDateObj)) maxDateObj = e;
  });
  if (!minDateObj || !maxDateObj) {
    const dates2 = state.companyMs.dates || [];
    if (!dates2.length) {
      headerRow.innerHTML = "";
      body.innerHTML = "";
      return;
    }
    minDateObj = parseLocalDate(dates2[0]);
    maxDateObj = parseLocalDate(dates2[dates2.length - 1]);
  }
  const overallStartDate = isoDate2(minDateObj);
  const overallEndDate = isoDate2(maxDateObj);
  const dates = enumerateDateRange(overallStartDate, overallEndDate);
  state.companyMs.dates = dates;
  const thead = headerRow.parentElement;
  if (thead) {
    while (thead.rows.length > 1) {
      thead.deleteRow(1);
    }
  }
  buildCompanyMsHeaderRow(headerRow, dates);
  const rows = [];
  MS_DEPARTMENTS.forEach((dept, index) => {
    const isRevenue = dept.key === "revenue";
    const deptMetrics = isRevenue ? [{ key: "revenue", label: "\u58F2\u4E0A", targetKey: "revenue" }] : getMetricsForDept(dept.key);
    const metricKey = isRevenue ? "revenue" : state.companyMs.metricKeys?.[dept.key];
    if (!metricKey) return;
    const hasMsPeriod = isRevenue || hasMsPeriodSettingForMetric(periodId, metricKey);
    const noticeMonth = resolveMsSettingsMonthByPeriodId(periodId) || "\u9078\u629E\u6708";
    const metricOption = deptMetrics.find((m) => m.key === metricKey);
    const metricLabel = isRevenue ? "\u58F2\u4E0A\uFF08\u6708\u8A08\u4E0A\uFF09" : metricOption?.label || "";
    const optionsHtml = deptMetrics.map(
      (option) => `<option value="${option.key}" ${option.key === metricKey ? "selected" : ""}>${option.label}</option>`
    ).join("");
    const distributeButton = hasMsPeriod ? `<div class="ms-distribute-wrap"><button type="button" class="ms-distribute-btn" data-ms-distribute data-scope="company" data-dept="${dept.key}" data-metric="${metricKey}">\u65E5\u5272\u308A\u5B9F\u884C</button></div>` : "";
    const metricRowspan = hasMsPeriod ? 3 : 1;
    const metricCell = isRevenue ? `<th scope="row" class="kpi-v2-sticky-label kpi-v2-ms-metric" rowspan="${metricRowspan}">
           <div class="ms-metric-cell">
              <span>${metricLabel}</span>
              ${distributeButton}
            </div>
          </th>` : `<th scope="row" class="kpi-v2-sticky-label kpi-v2-ms-metric" rowspan="${metricRowspan}">
            <div class="ms-metric-cell">
              <select class="kpi-v2-sort-select company-ms-metric-select" data-dept="${dept.key}">
                ${optionsHtml}
             </select>
              ${distributeButton}
            </div>
          </th>`;
    if (!hasMsPeriod) {
      const tripletAlt2 = index % 2 === 1 ? "daily-triplet-alt" : "";
      rows.push(`
        <tr class="${tripletAlt2}">
          <th scope="row" class="kpi-v2-sticky-label" rowspan="1">${dept.label}</th>
          ${metricCell}
          <td class="daily-type ms-no-period-notice" colspan="${dates.length + 1}">
            \u26A0 ${noticeMonth} \u306EMS\u671F\u9593\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093
          </td>
        </tr>
      `);
      return;
    }
    const targetMap = state.companyMs.msTargets?.[dept.key]?.[metricKey] || {};
    const cumulativeTargets = [];
    const dailyActuals = [];
    dates.forEach((date) => {
      const isDisabled = isDateBeforePersonalDeptStart(date, dept.key, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, dept.key, periodId, metricKey);
      if (isDisabled) {
        cumulativeTargets.push(null);
        dailyActuals.push(null);
        return;
      }
      const savedMs = targetMap?.[date];
      cumulativeTargets.push(savedMs !== void 0 && savedMs !== null ? num(savedMs) : null);
      const dailyCount = isRevenue ? getDailyMetricValue(state.companyMs.dailyTotals?.[date], null, "revenue") : getDailyMetricValue(state.companyMs.dailyTotals?.[date], metricOption, metricKey || "");
      dailyActuals.push(dailyCount);
    });
    const cumulativeActuals = buildCumulativeFromDaily(dailyActuals.map((value) => value === null ? 0 : value));
    const totalTarget = Number.isFinite(state.companyMs.msTargetTotals?.[dept.key]?.[metricKey]) ? num(state.companyMs.msTargetTotals?.[dept.key]?.[metricKey]) : getLastCumulativeTargetForCompany(dates, targetMap, dept.key, periodId, metricKey);
    const msCells = dates.map((date, idx) => {
      const isDisabled = isDateBeforePersonalDeptStart(date, dept.key, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, dept.key, periodId, metricKey);
      if (isDisabled) return `<td class="ms-cell-disabled"></td>`;
      const savedMs = cumulativeTargets[idx];
      const displayValue = Number.isFinite(savedMs) ? savedMs : "";
      return `
        <td class="ms-target-cell">
          <input type="number" class="ms-target-input company-ms-input"
                 data-dept="${dept.key}"
                 data-date="${date}"
                 data-metric="${metricKey || ""}"
                 value="${displayValue}"
                 min="0" />
        </td>
      `;
    }).join("");
    const rateCells = dates.map((date, idx) => {
      const isDisabled = isDateBeforePersonalDeptStart(date, dept.key, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, dept.key, periodId, metricKey);
      if (isDisabled) return `<td class="ms-cell-disabled"></td>`;
      const cumulativeActual = cumulativeActuals[idx] ?? 0;
      const cumulativeTarget = cumulativeTargets[idx] ?? 0;
      let rateDisplay = "-";
      let rateClass = "";
      if (cumulativeTarget && Number(cumulativeTarget) > 0) {
        const rate = Math.round(cumulativeActual / Number(cumulativeTarget) * 100);
        rateDisplay = `${rate}%`;
        rateClass = rate >= 100 ? "ms-rate-good" : rate >= 80 ? "ms-rate-warn" : "ms-rate-bad";
      }
      return `<td class="ms-rate-cell ${rateClass}">${rateDisplay}</td>`;
    }).join("");
    const actualCells = dates.map((date, idx) => {
      const isDisabled = isDateBeforePersonalDeptStart(date, dept.key, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, dept.key, periodId, metricKey);
      if (isDisabled) return `<td class="ms-cell-disabled"></td>`;
      const displayValue = formatNumberCell(cumulativeActuals[idx]);
      return `<td class="ms-actual-cell">${displayValue}</td>`;
    }).join("");
    const tripletAlt = index % 2 === 1 ? "daily-triplet-alt" : "";
    rows.push(`
      <tr class="${tripletAlt}">
        <th scope="row" class="kpi-v2-sticky-label" rowspan="3">${dept.label}</th>
        ${metricCell}
        <td class="daily-type">MS</td>
        ${msCells}
      </tr>
    `);
    rows.push(`
      <tr class="${tripletAlt}">
        <td class="daily-type">\u9032\u6357\u7387</td>
        ${rateCells}
      </tr>
    `);
    rows.push(`
      <tr class="${tripletAlt}">
        <td class="daily-type">\u5B9F\u7E3E</td>
        ${actualCells}
      </tr>
    `);
  });
  body.innerHTML = rows.join("");
  body.querySelectorAll(".company-ms-metric-select").forEach((select) => {
    const deptKey = select.dataset.dept;
    if (!deptKey) return;
    select.value = state.companyMs.metricKeys?.[deptKey] || getMetricsForDept(deptKey)[0]?.key || "";
    if (select.dataset.bound) return;
    select.addEventListener("change", handleCompanyMsMetricChange);
    select.dataset.bound = "true";
  });
  body.querySelectorAll(".ms-target-input").forEach((input) => {
    if (input.dataset.bound) return;
    input.addEventListener("change", handleMsTargetInput);
    input.dataset.bound = "true";
  });
  body.querySelectorAll('[data-ms-distribute][data-scope="company"]').forEach((button) => {
    if (button.dataset.bound) return;
    button.addEventListener("click", handleCompanyMsDistribute);
    button.dataset.bound = "true";
  });
}
function getMetricsForDept(deptKey) {
  if (deptKey === "marketing") return MS_MARKETING_METRICS;
  if (deptKey === "cs") return MS_CS_METRICS;
  if (deptKey === "sales") return MS_SALES_METRICS;
  return [];
}
function getPersonalMsTargetMap(deptKey, memberId, metricKey) {
  if (!deptKey || !memberId || !metricKey) return {};
  return state.personalMs?.[deptKey]?.msTargets?.[memberId]?.[metricKey] || {};
}
function getPersonalMsTargetTotal(deptKey, memberId, metricKey) {
  if (!deptKey || !memberId || !metricKey) return null;
  return state.personalMs?.[deptKey]?.msTargetTotals?.[memberId]?.[metricKey];
}
async function loadPersonalMsTargetsForMember(deptKey, memberId, metricKey, periodId = state.companyMsPeriodId) {
  if (!deptKey || !memberId || !metricKey || !periodId) return;
  try {
    const data = await goalSettingsService.loadMsTargets({
      scope: "personal",
      departmentKey: deptKey,
      metricKey,
      periodId,
      advisorUserId: Number(memberId)
    });
    if (!data) return;
    if (!state.personalMs[deptKey].msTargets) state.personalMs[deptKey].msTargets = {};
    if (!state.personalMs[deptKey].msTargets[memberId]) state.personalMs[deptKey].msTargets[memberId] = {};
    state.personalMs[deptKey].msTargets[memberId][metricKey] = data.dailyTargets || {};
    if (!state.personalMs[deptKey].msTargetTotals) state.personalMs[deptKey].msTargetTotals = {};
    if (!state.personalMs[deptKey].msTargetTotals[memberId]) state.personalMs[deptKey].msTargetTotals[memberId] = {};
    state.personalMs[deptKey].msTargetTotals[memberId][metricKey] = num(data.targetTotal || 0);
  } catch (error) {
    console.warn("[yield] failed to load personal ms targets", error);
  }
}
async function persistPersonalMsTargets(periodId, deptKey, memberId, metricKey) {
  if (!periodId || !deptKey || !memberId || !metricKey) return;
  const dailyTargets = getPersonalMsTargetMap(deptKey, memberId, metricKey);
  const dates = state.personalMs?.[deptKey]?.dates || [];
  const targetTotal = getPersonalMsTargetTotal(deptKey, memberId, metricKey) ?? getLastCumulativeTarget(dates, dailyTargets, deptKey, periodId, metricKey);
  try {
    await goalSettingsService.saveMsTargets({
      scope: "personal",
      departmentKey: deptKey,
      metricKey,
      periodId,
      advisorUserId: Number(memberId),
      targetTotal,
      dailyTargets
    });
  } catch (error) {
    console.warn("[yield] failed to save personal ms targets", error);
  }
}
async function handlePersonalMsMetricChange(event) {
  const select = event.target;
  const { dept, member } = select.dataset;
  const value = select.value;
  if (!dept || !member || !state.personalMs[dept]) return;
  if (!state.personalMs[dept].metricKeys) {
    state.personalMs[dept].metricKeys = {};
  }
  state.personalMs[dept].metricKeys[member] = value;
  if (!state.personalMs.importantMetrics) state.personalMs.importantMetrics = {};
  if (!state.personalMs.importantMetrics[dept]) state.personalMs.importantMetrics[dept] = {};
  state.personalMs.importantMetrics[dept][member] = value;
  try {
    await goalSettingsService.saveImportantMetric({
      departmentKey: dept,
      userId: Number(member),
      metricKey: value
    });
  } catch (error) {
    console.warn("[yield] failed to save important metric", error);
  }
  await loadPersonalMsTargetsForMember(dept, member, value);
  renderPersonalMsTable(dept);
}
function handlePersonalMsTargetInput(event) {
  const input = event.target;
  const { dept, member, date, metric } = input.dataset;
  const value = Number(input.value) || 0;
  if (!state.personalMs[dept]) return;
  if (!state.personalMs[dept].msTargets[member]) {
    state.personalMs[dept].msTargets[member] = {};
  }
  if (!state.personalMs[dept].msTargets[member][metric]) {
    state.personalMs[dept].msTargets[member][metric] = {};
  }
  state.personalMs[dept].msTargets[member][metric][date] = value;
  if (!state.personalMs[dept].msTargetTotals) state.personalMs[dept].msTargetTotals = {};
  if (!state.personalMs[dept].msTargetTotals[member]) state.personalMs[dept].msTargetTotals[member] = {};
  const dates = state.personalMs[dept]?.dates || [];
  state.personalMs[dept].msTargetTotals[member][metric] = getLastCumulativeTarget(
    dates,
    state.personalMs[dept].msTargets[member][metric],
    dept,
    state.companyMsPeriodId,
    metric
  );
  renderPersonalMsTable(dept);
  persistPersonalMsTargets(state.companyMsPeriodId, dept, member, metric);
}
function handlePersonalMsDistribute(event) {
  const button = event.target;
  const { dept, member, metric } = button.dataset;
  const periodId = state.companyMsPeriodId;
  if (!dept || !member || !metric || !periodId) return;
  const dates = state.personalMs?.[dept]?.dates || [];
  const currentTotal = getPersonalMsTargetTotal(dept, member, metric) ?? getLastCumulativeTarget(dates, getPersonalMsTargetMap(dept, member, metric), dept, periodId, metric);
  const input = prompt("\u6700\u7D42\u76EE\u6A19\u5024\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044", currentTotal ? String(currentTotal) : "");
  if (input === null) return;
  const total = Number(input);
  if (!Number.isFinite(total) || total < 0) return;
  const activeDates = dates.filter((date) => {
    const disabled = isDateBeforeDeptStart(date, dept, periodId, metric) || isDateAfterDeptEnd(date, dept, periodId, metric);
    return !disabled;
  });
  const cumulative = buildCumulativeSeries(total, activeDates.length);
  const targetMap = {};
  let activeIndex = 0;
  dates.forEach((date) => {
    const disabled = isDateBeforeDeptStart(date, dept, periodId, metric) || isDateAfterDeptEnd(date, dept, periodId, metric);
    if (disabled) return;
    targetMap[date] = cumulative[activeIndex] ?? 0;
    activeIndex += 1;
  });
  if (!state.personalMs[dept].msTargets) state.personalMs[dept].msTargets = {};
  if (!state.personalMs[dept].msTargets[member]) state.personalMs[dept].msTargets[member] = {};
  state.personalMs[dept].msTargets[member][metric] = targetMap;
  if (!state.personalMs[dept].msTargetTotals) state.personalMs[dept].msTargetTotals = {};
  if (!state.personalMs[dept].msTargetTotals[member]) state.personalMs[dept].msTargetTotals[member] = {};
  state.personalMs[dept].msTargetTotals[member][metric] = total;
  renderPersonalMsTable(dept);
  persistPersonalMsTargets(periodId, dept, member, metric);
}
function renderPersonalMsTable(deptKey) {
  const deptConfig = {
    marketing: { headerRowId: "marketingPersonalMsHeaderRow", bodyId: "marketingPersonalMsTableBody" },
    cs: { headerRowId: "csPersonalMsHeaderRow", bodyId: "csPersonalMsTableBody" },
    sales: { headerRowId: "salesPersonalMsHeaderRow", bodyId: "salesPersonalMsTableBody" }
  };
  const config = deptConfig[deptKey];
  if (!config) return;
  const headerRow = document.getElementById(config.headerRowId);
  const body = document.getElementById(config.bodyId);
  if (!headerRow || !body) return;
  const deptData = state.personalMs[deptKey];
  if (!deptData) return;
  const periodId = state.companyMsPeriodId;
  const dates = deptData.dates || [];
  const members = deptData.members || [];
  const metrics = getMetricsForDept(deptKey);
  const defaultMetricKey = metrics[0]?.key;
  const thead = headerRow.parentElement;
  if (thead) {
    while (thead.rows.length > 1) {
      thead.deleteRow(1);
    }
  }
  if (!dates.length || !metrics.length) {
    headerRow.innerHTML = "";
    body.innerHTML = '<tr><td colspan="10" class="kpi-v2-empty">\u8868\u793A\u3059\u308B\u30E1\u30F3\u30D0\u30FC\u307E\u305F\u306F\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093</td></tr>';
    return;
  }
  const dateCells = dates.map((date) => {
    const dayLabel = formatMonthDayLabel(date);
    return `<th scope="col" class="ms-date-header">${dayLabel}</th>`;
  }).join("");
  headerRow.innerHTML = `
    <th scope="col" class="kpi-v2-sticky-label">\u30E1\u30F3\u30D0\u30FC</th>
    <th scope="col" class="kpi-v2-sticky-label kpi-v2-ms-metric">\u6307\u6A19</th>
    <th scope="col" class="daily-type">\u533A\u5206</th>
    ${dateCells}
  `;
  if (!members.length) {
    const colSpan = 3 + dates.length;
    body.innerHTML = `<tr><td colspan="${colSpan}" class="kpi-v2-empty">\u8868\u793A\u3059\u308B\u30E1\u30F3\u30D0\u30FC\u307E\u305F\u306F\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093</td></tr>`;
    return;
  }
  const rows = [];
  members.forEach((member, index) => {
    const memberId = String(member.id || "");
    if (!memberId) return;
    const memberName = member.name || `ID:${memberId}`;
    const importantMetricKey = state.personalMs?.importantMetrics?.[deptKey]?.[memberId];
    let currentMetricKey = importantMetricKey || state.personalMs[deptKey].metricKeys?.[memberId] || defaultMetricKey;
    if (!metrics.some((m) => m.key === currentMetricKey)) currentMetricKey = defaultMetricKey;
    if (!state.personalMs[deptKey].metricKeys) state.personalMs[deptKey].metricKeys = {};
    state.personalMs[deptKey].metricKeys[memberId] = currentMetricKey;
    const metricOptionsHtml = metrics.map(
      (m) => `<option value="${m.key}" ${m.key === currentMetricKey ? "selected" : ""}>${m.label}</option>`
    ).join("");
    const hasMsPeriod = hasMsPeriodSettingForMetric(periodId, currentMetricKey);
    const noticeMonth = resolveMsSettingsMonthByPeriodId(periodId) || "\u9078\u629E\u6708";
    const isSingleMetric = metrics.length <= 1;
    const distributeButton = hasMsPeriod ? `<div class="ms-distribute-wrap"><button type="button" class="ms-distribute-btn" data-ms-distribute data-scope="personalMs" data-dept="${deptKey}" data-member="${memberId}" data-metric="${currentMetricKey}">\u65E5\u5272\u308A\u5B9F\u884C</button></div>` : "";
    const metricRowspan = hasMsPeriod ? 3 : 1;
    const metricCell = `
      <th scope="row" class="kpi-v2-sticky-label kpi-v2-ms-metric" rowspan="${metricRowspan}">
        <div class="ms-metric-cell">
          <select class="kpi-v2-sort-select personal-ms-metric-select" 
                  data-dept="${deptKey}" 
                  data-member="${memberId}"
                  ${isSingleMetric ? "disabled" : ""}>
            ${metricOptionsHtml}
          </select>
          ${distributeButton}
        </div>
      </th>
    `;
    if (!hasMsPeriod) {
      const rowAlt2 = index % 2 === 1 ? "daily-triplet-alt" : "";
      rows.push(`
        <tr class="${rowAlt2}">
          <th scope="row" class="kpi-v2-sticky-label" rowspan="1">${memberName}</th>
          ${metricCell}
          <td class="daily-type ms-no-period-notice" colspan="${dates.length + 1}">
            \u26A0 ${noticeMonth} \u306EMS\u671F\u9593\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093
          </td>
        </tr>
      `);
      return;
    }
    const isMetricDateDisabled = (date) => isDateBeforeDeptStart(date, deptKey, periodId, currentMetricKey) || isDateAfterDeptEnd(date, deptKey, periodId, currentMetricKey);
    const targetMap = getPersonalMsTargetMap(deptKey, memberId, currentMetricKey);
    const storedTotal = getPersonalMsTargetTotal(deptKey, memberId, currentMetricKey);
    const totalTarget = Number.isFinite(storedTotal) ? num(storedTotal) : getLastCumulativeTarget(dates, targetMap, deptKey, periodId, currentMetricKey);
    const activeDates = dates.filter((date) => {
      const disabled = isMetricDateDisabled(date);
      return !disabled;
    });
    const fallbackCumulative = totalTarget > 0 ? buildCumulativeSeries(totalTarget, activeDates.length) : [];
    let activeIndex = 0;
    const cumulativeTargets = dates.map((date) => {
      const isDisabled = isMetricDateDisabled(date);
      if (isDisabled) return null;
      const saved = targetMap?.[date];
      if (saved !== void 0 && saved !== null && saved !== "") {
        activeIndex += 1;
        return num(saved);
      }
      const fallback = fallbackCumulative[activeIndex] ?? null;
      activeIndex += 1;
      return fallback;
    });
    const dailyTargets = [];
    let prevTarget = 0;
    cumulativeTargets.forEach((value) => {
      if (value === null) {
        dailyTargets.push(null);
        return;
      }
      const daily = num(value) - num(prevTarget);
      dailyTargets.push(daily);
      prevTarget = num(value);
    });
    const dailyActuals = [];
    dates.forEach((date) => {
      const isDisabled = isMetricDateDisabled(date);
      if (isDisabled) {
        dailyActuals.push(null);
        return;
      }
      const value = getAutoCalculatedActual(memberId, date, currentMetricKey);
      dailyActuals.push(num(value));
    });
    const cumulativeActuals = [];
    let running = 0;
    dailyActuals.forEach((value) => {
      if (value === null) {
        cumulativeActuals.push(null);
        return;
      }
      running += num(value);
      cumulativeActuals.push(running);
    });
    const totalTargetValue = Number.isFinite(storedTotal) ? num(storedTotal) : getLastCumulativeTarget(dates, targetMap, deptKey, periodId, currentMetricKey) || (totalTarget > 0 ? totalTarget : 0);
    const msCells = dates.map((date, idx) => {
      const isDisabled = isMetricDateDisabled(date);
      if (isDisabled) return `<td class="ms-cell-disabled"></td>`;
      const value = cumulativeTargets[idx];
      const displayValue = Number.isFinite(value) ? value : "";
      return `
        <td class="ms-target-cell">
          <input type="number" class="ms-target-input personal-ms-target-input" 
                 data-dept="${deptKey}" 
                 data-member="${memberId}" 
                 data-date="${date}"
                 data-metric="${currentMetricKey}"
                 value="${displayValue}" 
                 min="0" />
        </td>
      `;
    }).join("");
    const rateCells = dates.map((date, idx) => {
      const isDisabled = isMetricDateDisabled(date);
      if (isDisabled) return `<td class="ms-cell-disabled"></td>`;
      const dailyTarget = dailyTargets[idx];
      const dailyActual = dailyActuals[idx] ?? 0;
      const cumulativeActual = cumulativeActuals[idx] ?? 0;
      const useOverall = state.msRateModes?.companyMs === "overall";
      const numerator = useOverall ? cumulativeActual : dailyActual;
      const denominator = useOverall ? totalTargetValue : dailyTarget;
      let rateDisplay = "-";
      let rateClass = "";
      if (denominator && Number(denominator) > 0) {
        const rate = Math.round(numerator / Number(denominator) * 100);
        rateDisplay = `${rate}%`;
        rateClass = rate >= 100 ? "ms-rate-good" : rate >= 80 ? "ms-rate-warn" : "ms-rate-bad";
      }
      return `<td class="ms-rate-cell ${rateClass}">${rateDisplay}</td>`;
    }).join("");
    const actualCells = dates.map((date, idx) => {
      const isDisabled = isMetricDateDisabled(date);
      if (isDisabled) return `<td class="ms-cell-disabled"></td>`;
      return `<td class="ms-actual-cell">${formatNumberCell(cumulativeActuals[idx])}</td>`;
    }).join("");
    const rowAlt = index % 2 === 1 ? "daily-triplet-alt" : "";
    rows.push(`
      <tr class="${rowAlt}">
        <th scope="row" class="kpi-v2-sticky-label" rowspan="3">${memberName}</th>
        ${metricCell}
        <td class="daily-type">MS</td>
        ${msCells}
      </tr>
    `);
    rows.push(`
      <tr class="${rowAlt}">
        <td class="daily-type">\u9032\u6357\u7387</td>
        ${rateCells}
      </tr>
    `);
    rows.push(`
      <tr class="${rowAlt}">
        <td class="daily-type">\u5B9F\u7E3E</td>
        ${actualCells}
      </tr>
    `);
  });
  body.innerHTML = rows.join("");
  body.querySelectorAll(".personal-ms-metric-select").forEach((select) => {
    if (select.dataset.bound) return;
    select.addEventListener("change", handlePersonalMsMetricChange);
    select.dataset.bound = "true";
  });
  body.querySelectorAll(".personal-ms-target-input").forEach((input) => {
    if (input.dataset.bound) return;
    input.addEventListener("change", handlePersonalMsTargetInput);
    input.dataset.bound = "true";
  });
  body.querySelectorAll('[data-ms-distribute][data-scope="personalMs"]').forEach((button) => {
    if (button.dataset.bound) return;
    button.addEventListener("click", handlePersonalMsDistribute);
    button.dataset.bound = "true";
  });
}
function renderAllPersonalMsTables() {
  ["cs", "sales"].forEach((deptKey) => {
    renderPersonalMsTable(deptKey);
  });
}
async function loadPersonalMsData() {
  const periodId = state.companyMsPeriodId;
  const period = state.evaluationPeriods.find((item) => item.id === periodId);
  const marketingSection = document.querySelector('[data-personal-ms="marketing"]');
  if (marketingSection) marketingSection.hidden = true;
  if (!period) {
    state.personalMs.marketing.dates = [];
    state.personalMs.cs.dates = [];
    state.personalMs.sales.dates = [];
    state.personalMs.marketing.members = [];
    state.personalMs.cs.members = [];
    state.personalMs.sales.members = [];
    renderAllPersonalMsTables();
    return;
  }
  const ranges = resolveCompanyMsRanges(period);
  const personalMsRanges = {
    marketing: resolvePersonalMsRangeByDept(periodId, "marketing", ranges.marketingRange),
    cs: resolvePersonalMsRangeByDept(periodId, "cs", ranges.csRange),
    sales: resolvePersonalMsRangeByDept(periodId, "sales", ranges.salesRange)
  };
  const personalMsBounds = Object.values(personalMsRanges).reduce((acc, range) => {
    const startObj = parseLocalDate(range?.startDate);
    const endObj = parseLocalDate(range?.endDate);
    if (startObj && (!acc.start || startObj < acc.start)) acc.start = startObj;
    if (endObj && (!acc.end || endObj > acc.end)) acc.end = endObj;
    return acc;
  }, { start: null, end: null });
  const personalMsOverallRange = personalMsBounds.start && personalMsBounds.end ? { startDate: isoDate2(personalMsBounds.start), endDate: isoDate2(personalMsBounds.end) } : ranges.msOverallRange || ranges.salesRange;
  await ensureDailyYieldData(periodId, {
    msMode: true,
    rangeOverride: personalMsOverallRange
  });
  const members = await ensureMembersList();
  state.personalMs.marketing.dates = personalMsRanges.marketing.dates || [];
  state.personalMs.cs.dates = personalMsRanges.cs.dates || [];
  state.personalMs.sales.dates = personalMsRanges.sales.dates || [];
  state.personalMs.marketing.members = getMembersByDepartment(members, "marketing");
  state.personalMs.cs.members = getMembersByDepartment(members, "cs");
  state.personalMs.sales.members = getMembersByDepartment(members, "sales");
  const deptKeys = ["cs", "sales"];
  if (!state.personalMs.importantMetrics) state.personalMs.importantMetrics = {};
  deptKeys.forEach((deptKey) => {
    state.personalMs.importantMetrics[deptKey] = {};
  });
  await Promise.all(deptKeys.map(async (deptKey) => {
    try {
      const items = await goalSettingsService.loadImportantMetrics({ departmentKey: deptKey, force: true });
      const map = {};
      (items || []).forEach((item) => {
        const userId = String(item?.userId || item?.user_id || "");
        const metricKey = item?.metricKey || item?.metric_key || "";
        if (!userId || !metricKey) return;
        map[userId] = metricKey;
      });
      if (!state.personalMs.importantMetrics) state.personalMs.importantMetrics = {};
      state.personalMs.importantMetrics[deptKey] = map;
    } catch (error) {
      console.warn("[yield] failed to load important metrics", error);
    }
  }));
  const loadPromises = [];
  deptKeys.forEach((deptKey) => {
    const metrics = getMetricsForDept(deptKey);
    const defaultMetricKey = metrics[0]?.key || "";
    const deptState = state.personalMs[deptKey];
    if (!deptState.metricKeys) deptState.metricKeys = {};
    deptState.msTargets = {};
    deptState.msTargetTotals = {};
    (deptState.members || []).forEach((member) => {
      const memberId = String(member.id || "");
      if (!memberId) return;
      const important = state.personalMs?.importantMetrics?.[deptKey]?.[memberId];
      const validImportant = important && metrics.some((m) => m.key === important) ? important : "";
      const selected = validImportant || deptState.metricKeys[memberId] || defaultMetricKey;
      if (!selected) return;
      deptState.metricKeys[memberId] = selected;
      loadPromises.push(loadPersonalMsTargetsForMember(deptKey, memberId, selected, periodId));
    });
  });
  await Promise.all(loadPromises);
  renderAllPersonalMsTables();
}
function buildCompanySalesHeaderRow(headerRow, dates) {
  if (!headerRow) return;
  const cells = dates.map((date) => `<th scope="col">${formatMonthDayLabel(date)}</th>`).join("");
  headerRow.innerHTML = `
    <th scope="col" class="kpi-v2-sticky-label">\u55B6\u696D</th>
    <th scope="col" class="kpi-v2-sticky-label kpi-v2-ms-metric">\u6307\u6A19</th>
    <th scope="col" class="daily-type">\u533A\u5206</th>
    ${cells}
  `;
}
function renderCompanySalesTable() {
  const headerRow = document.getElementById("companySalesHeaderRow");
  const body = document.getElementById("companySalesTableBody");
  if (!headerRow || !body) return;
  const dates = state.companySales.dates || [];
  const employees = state.companySales.employees || [];
  if (!dates.length || !employees.length) {
    headerRow.innerHTML = "";
    body.innerHTML = "";
    return;
  }
  buildCompanySalesHeaderRow(headerRow, dates);
  const optionsHtml = MS_METRIC_OPTIONS.map((option) => `<option value="${option.key}">${option.label}</option>`).join("");
  const periodId = state.companyMsPeriodId;
  const rows = [];
  employees.forEach((employee, index) => {
    const employeeId = String(employee.id || "");
    if (!employeeId) return;
    const metricKey = state.companySales.metricKeys?.[employeeId] || MS_METRIC_OPTIONS[0]?.key;
    const metricOption = metricKey ? getMsMetricOption(metricKey) : null;
    const metricCell = `<th scope="row" class="kpi-v2-sticky-label kpi-v2-ms-metric" rowspan="3">
        <select class="kpi-v2-sort-select company-sales-metric-select" data-employee="${employeeId}">
          ${optionsHtml}
        </select>
      </th>`;
    const actualNumbers = [];
    const targetNumbers = [];
    const achvCells = [];
    let actualSum = 0;
    const series = periodId ? state.companyDailyData[employeeId]?.[periodId] || {} : {};
    const target = metricOption ? goalSettingsService.getPersonalPeriodTarget(periodId, employeeId)?.[metricOption.targetKey] : null;
    dates.forEach((date) => {
      const raw = metricOption ? series?.[date]?.[metricOption.key] : null;
      actualSum += num(raw);
      actualNumbers.push(actualSum);
      const targetValue = target === void 0 || target === null ? null : num(target);
      targetNumbers.push(targetValue);
      if (targetValue > 0) {
        const percent = Math.round(actualSum / targetValue * 100);
        achvCells.push(formatAchievementCell(percent));
      } else {
        achvCells.push(formatAchievementCell(null));
      }
    });
    const tripletAlt = index % 2 === 1 ? "daily-triplet-alt" : "";
    rows.push(
      buildDailyRow(
        `<th scope="row" class="kpi-v2-sticky-label" rowspan="3">${employee.name || `ID:${employeeId}`}</th>
         ${metricCell}
         <td class="daily-type">\u5B9F\u7E3E</td>`,
        actualNumbers.map(formatNumberCell),
        { rowClass: tripletAlt }
      )
    );
    rows.push(
      buildDailyRow(
        `<td class="daily-type">\u76EE\u6A19</td>`,
        targetNumbers.map(formatNumberCell),
        { rowClass: tripletAlt, cellClass: "daily-muted" }
      )
    );
    rows.push(
      buildDailyRow(
        `<td class="daily-type">\u9032\u6357\u7387</td>`,
        achvCells,
        { rowClass: tripletAlt }
      )
    );
  });
  body.innerHTML = rows.join("");
  body.querySelectorAll(".company-sales-metric-select").forEach((select) => {
    const employeeId = select.dataset.employee;
    if (!employeeId) return;
    select.value = state.companySales.metricKeys?.[employeeId] || MS_METRIC_OPTIONS[0]?.key;
    if (select.dataset.bound) return;
    select.addEventListener("change", handleCompanySalesMetricChange);
    select.dataset.bound = "true";
  });
}
async function loadAndRenderCompanyMs() {
  const periodId = state.companyMsPeriodId;
  const period = state.evaluationPeriods.find((item) => item.id === periodId);
  if (!period) {
    state.companyMs = {
      ...state.companyMs,
      dates: [],
      dailyTotals: {},
      companyTarget: {},
      msTargets: {},
      msTargetTotals: {},
      revenue: { actual: 0, target: 0 }
    };
    state.companySales = { ...state.companySales, dates: [], employees: [] };
    renderCompanyMsTable();
    renderCompanySalesTable();
    return;
  }
  const monthStr = resolveMsSettingsMonthByPeriodId(periodId);
  if (monthStr) {
    try {
      await goalSettingsService.loadMsPeriodSettings(monthStr, { force: true });
    } catch (e) {
      console.error("Failed to load MS period settings for company view", e);
    }
  }
  state.companyMs.msTargets = {};
  state.companyMs.msTargetTotals = {};
  const ranges = resolveCompanyMsRanges(period);
  const msOverallRange = ranges.msOverallRange || ranges.salesRange;
  const selectedCompanyMetrics = {
    marketing: state.companyMs.metricKeys?.marketing || getMetricsForDept("marketing")[0]?.key,
    cs: state.companyMs.metricKeys?.cs || getMetricsForDept("cs")[0]?.key,
    sales: state.companyMs.metricKeys?.sales || getMetricsForDept("sales")[0]?.key
  };
  const msBounds = MS_DEPARTMENTS.reduce((acc, dept) => {
    const isRevenue = dept.key === "revenue";
    const metricKey = isRevenue ? "revenue" : selectedCompanyMetrics[dept.key];
    if (!metricKey) return acc;
    const hasMsPeriod = isRevenue || hasMsPeriodSettingForMetric(periodId, metricKey);
    if (!hasMsPeriod) return acc;
    const range = resolvePersonalDailyDateRange(periodId, dept.key, metricKey);
    const startObj = parseLocalDate(range?.startDate);
    const endObj = parseLocalDate(range?.endDate);
    if (startObj && (!acc.start || startObj < acc.start)) acc.start = startObj;
    if (endObj && (!acc.end || endObj > acc.end)) acc.end = endObj;
    return acc;
  }, { start: null, end: null });
  const msDataRange = msBounds.start && msBounds.end ? { startDate: isoDate2(msBounds.start), endDate: isoDate2(msBounds.end) } : msOverallRange;
  const salesRangeForTable = (() => {
    const salesMetric = selectedCompanyMetrics.sales;
    if (salesMetric && hasMsPeriodSettingForMetric(periodId, salesMetric)) {
      return resolvePersonalDailyDateRange(periodId, "sales", salesMetric);
    }
    return ranges.salesRange;
  })();
  state.companyMs = {
    ...state.companyMs,
    metricKeys: selectedCompanyMetrics,
    dates: enumerateDateRange(msDataRange.startDate, msDataRange.endDate),
    marketingDates: enumerateDateRange(ranges.marketingRange?.startDate || "", ranges.msOverallRange?.endDate || ""),
    csDates: enumerateDateRange(ranges.csRange?.startDate || "", ranges.msOverallRange?.endDate || ""),
    salesDates: enumerateDateRange(ranges.salesRange?.startDate || "", ranges.msOverallRange?.endDate || ""),
    revenueDates: enumerateDateRange(ranges.revenueRange?.startDate || "", ranges.msOverallRange?.endDate || ""),
    dailyTotals: {},
    companyTarget: {},
    revenue: { actual: 0, target: 0 }
  };
  state.companySales = {
    ...state.companySales,
    dates: enumerateDateRange(salesRangeForTable?.startDate || "", salesRangeForTable?.endDate || "")
  };
  let payload;
  try {
    payload = await ensureDailyYieldData(periodId, {
      msMode: true,
      rangeOverride: msDataRange
    });
  } catch (error) {
    console.warn("[yield] failed to load daily yield data for MS", error);
    renderCompanyMsTable();
    renderCompanySalesTable();
    return;
  }
  const advisors = await resolveAdvisorEmployees();
  const fallbackAdvisors = (payload?.employees || []).map((emp) => ({
    id: String(emp?.advisorUserId ?? ""),
    name: emp?.name || `ID:${emp?.advisorUserId}`
  })).filter((item) => item.id);
  const effectiveAdvisors = advisors.length ? advisors : fallbackAdvisors;
  const advisorIds = effectiveAdvisors.map((item) => item.id).filter((id) => id);
  const allEmployeeIds = (payload?.employees || []).map((emp) => String(emp?.advisorUserId ?? emp?.id ?? "")).filter((id) => id);
  const dailyTotalsFromPayload = payload?.employees?.length ? buildCompanyMsDailyTotalsFromEmployees(payload.employees, allEmployeeIds) : {};
  const dailyTotals = dailyTotalsFromPayload;
  await goalSettingsService.loadCompanyPeriodTarget(periodId);
  const companyTarget = goalSettingsService.getCompanyPeriodTarget(periodId) || {};
  if (typeof goalSettingsService.loadPersonalPeriodTargetsBulk === "function") {
    await goalSettingsService.loadPersonalPeriodTargetsBulk(periodId, advisorIds, { force: true });
  }
  let revenueActual = 0;
  if (ranges.revenueRange.startDate && ranges.revenueRange.endDate) {
    try {
      const revenueKpi = await fetchCompanyKpiFromApi({
        startDate: ranges.revenueRange.startDate,
        endDate: ranges.revenueRange.endDate,
        msMode: true,
        calcModeScope: "companyMonthly"
      });
      revenueActual = normalizeCounts(revenueKpi || {}).revenue;
    } catch (error) {
      console.warn("[yield] failed to load revenue for MS", error);
      revenueActual = 0;
    }
  }
  state.companyMs = {
    ...state.companyMs,
    dailyTotals,
    companyTarget,
    revenue: {
      actual: revenueActual,
      target: num(companyTarget.revenueTarget ?? 0)
    }
  };
  state.companySales = { ...state.companySales, employees: effectiveAdvisors };
  await loadCompanyMsTargets(periodId);
  renderCompanyMsTable();
  renderCompanySalesTable();
  await loadPersonalMsData();
}
function enumeratePeriodDates(period) {
  if (!period?.startDate || !period?.endDate) return [];
  const dates = [];
  const start = new Date(period.startDate);
  const end = new Date(period.endDate);
  if (Number.isNaN(start) || Number.isNaN(end)) return [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(isoDate2(d));
  }
  return dates;
}
function getCompanySummaryRange() {
  const period = state.evaluationPeriods.find((item) => item.id === state.companyEvaluationPeriodId);
  if (period?.startDate && period?.endDate) {
    return { startDate: period.startDate, endDate: period.endDate };
  }
  const today2 = /* @__PURE__ */ new Date();
  const startOfMonth = new Date(today2.getFullYear(), today2.getMonth(), 1);
  return { startDate: isoDate2(startOfMonth), endDate: isoDate2(today2) };
}
async function loadEmployeeData(rangeFilters = {}) {
  try {
    const range = rangeFilters.startDate ? rangeFilters : state.ranges.employee.startDate ? state.ranges.employee : getCurrentMonthRange();
    state.ranges.employee = { ...range };
    const startInput = document.getElementById("employeeRangeStart");
    const endInput = document.getElementById("employeeRangeEnd");
    if (startInput && range.startDate) startInput.value = range.startDate;
    if (endInput && range.endDate) endInput.value = range.endDate;
    const todayStr = isoDate2(/* @__PURE__ */ new Date());
    const [items, plannedItems, members] = await Promise.all([
      fetchCompanyEmployeeKpis({ startDate: range.startDate, endDate: range.endDate, calcModeScope: "employee" }),
      fetchCompanyEmployeePlannedKpis({ baseDate: todayStr, calcModeScope: "employee" }),
      ensureMembersList()
    ]);
    const rows = mapEmployeeKpiItems(items, { rateModeScope: "employee" });
    const plannedRows = mapEmployeeKpiItems(plannedItems, { rateModeScope: "employee" });
    const plannedMap = new Map(
      plannedRows.map((row) => [String(row?.advisorUserId ?? ""), row])
    );
    const advisorIdSet = new Set(
      (members || []).filter((member) => isAdvisorRole(member.role)).map((member) => String(member.id))
    );
    const filteredRows = advisorIdSet.size ? rows.filter((row) => advisorIdSet.has(String(row?.advisorUserId))) : rows;
    const enrichedRows = filteredRows.map((row) => {
      const planned = plannedMap.get(String(row?.advisorUserId ?? "")) || {};
      return {
        ...row,
        plannedNewInterviews: num(planned.newInterviews),
        plannedProposals: num(planned.proposals),
        plannedRecommendations: num(planned.recommendations),
        plannedInterviewsScheduled: num(planned.interviewsScheduled),
        plannedInterviewsHeld: num(planned.interviewsHeld),
        plannedOffers: num(planned.offers),
        plannedAccepts: num(planned.accepts)
      };
    });
    state.employees.list = [...enrichedRows];
    renderEmployeeRows();
    return enrichedRows;
  } catch (error) {
    console.error("Failed to load employee data (api):", error);
    state.employees.list = [];
    renderEmployeeRows([]);
    return [];
  }
}
function normalizeCounts(src = {}) {
  if (src.revenue || src.currentAmount || src.fee_amount || src.offer_accept_date) console.log("[DEBUG] normalizeCounts src:", src);
  const revenue = num(src.revenue ?? src.currentAmount ?? src.revenueAmount ?? src.current_amount ?? src.revenue_amount);
  const targetAmount = num(src.targetAmount ?? src.revenueTarget ?? src.target_amount ?? src.revenue_target);
  const achievementRate = targetAmount > 0 ? num(src.achievementRate) || Math.round(revenue / targetAmount * 100) : num(src.achievementRate) || 0;
  return {
    newInterviews: num(src.newInterviews ?? src.new_interviews),
    proposals: num(src.proposals),
    recommendations: num(src.recommendations),
    interviewsScheduled: num(src.interviewsScheduled ?? src.interviews_scheduled),
    interviewsHeld: num(src.interviewsHeld ?? src.interviews_held),
    offers: num(src.offers),
    accepts: num(src.accepts ?? src.hires),
    hires: num(src.hires ?? src.accepts),
    revenue,
    currentAmount: revenue,
    targetAmount,
    achievementRate
  };
}
function calcRate(numerator, denominator) {
  const denom = num(denominator);
  if (denom <= 0) return 0;
  return Math.round(num(numerator) / denom * 100);
}
function computeRateValues(counts = {}, mode = getRateCalcMode("default")) {
  const normalizedMode = normalizeRateCalcMode(mode);
  return RATE_CALC_STEPS.reduce((acc, step) => {
    const denomKey = normalizedMode === "step" ? step.stepDenom : "newInterviews";
    acc[step.rateKey] = calcRate(counts?.[step.numerator], counts?.[denomKey]);
    return acc;
  }, {});
}
function buildPrevCounts(prev = {}) {
  return {
    newInterviews: num(prev.prevNewInterviews),
    proposals: num(prev.prevProposals),
    recommendations: num(prev.prevRecommendations),
    interviewsScheduled: num(prev.prevInterviewsScheduled),
    interviewsHeld: num(prev.prevInterviewsHeld),
    offers: num(prev.prevOffers),
    accepts: num(prev.prevAccepts),
    hires: num(prev.prevAccepts)
  };
}
function computePrevRateValues(prevCounts = {}, mode = getRateCalcMode("default")) {
  const rates = computeRateValues(prevCounts, mode);
  return {
    prevProposalRate: rates.proposalRate,
    prevRecommendationRate: rates.recommendationRate,
    prevInterviewScheduleRate: rates.interviewScheduleRate,
    prevInterviewHeldRate: rates.interviewHeldRate,
    prevOfferRate: rates.offerRate,
    prevAcceptRate: rates.acceptRate,
    prevHireRate: rates.hireRate
  };
}
function normalizeRates(src = {}) {
  return {
    proposalRate: num(src.proposalRate),
    recommendationRate: num(src.recommendationRate),
    interviewScheduleRate: num(src.interviewScheduleRate),
    interviewHeldRate: num(src.interviewHeldRate),
    offerRate: num(src.offerRate),
    acceptRate: num(src.acceptRate),
    hireRate: num(src.hireRate ?? src.acceptRate)
  };
}
function normalizePrev(src = {}) {
  return {
    prevNewInterviews: num(src.prevNewInterviews),
    prevProposals: num(src.prevProposals),
    prevRecommendations: num(src.prevRecommendations),
    prevInterviewsScheduled: num(src.prevInterviewsScheduled),
    prevInterviewsHeld: num(src.prevInterviewsHeld),
    prevOffers: num(src.prevOffers),
    prevAccepts: num(src.prevAccepts),
    prevProposalRate: num(src.prevProposalRate),
    prevRecommendationRate: num(src.prevRecommendationRate),
    prevInterviewScheduleRate: num(src.prevInterviewScheduleRate),
    prevInterviewHeldRate: num(src.prevInterviewHeldRate),
    prevOfferRate: num(src.prevOfferRate),
    prevAcceptRate: num(src.prevAcceptRate),
    prevHireRate: num(src.prevHireRate)
  };
}
function normalizeKpi(src = {}, { rateModeScope = "default" } = {}) {
  const counts = normalizeCounts(src);
  const prev = normalizePrev(src);
  const rateMode = getRateCalcMode(rateModeScope);
  const computedRates = computeRateValues(counts, rateMode);
  const computedPrevRates = computePrevRateValues(buildPrevCounts(prev), rateMode);
  return {
    ...counts,
    ...normalizeRates(src),
    ...computedRates,
    ...prev,
    ...computedPrevRates
  };
}
function normalizeTodayKpi(data) {
  const todaySource = data?.today || data?.daily || null;
  const fallback = todaySource || data?.monthly || data || {};
  const prevSource = data?.period || data?.monthly || data || {};
  return { ...normalizeCounts(fallback), ...normalizePrev(prevSource) };
}
function updateEmployeeDisplay(rows) {
  const tableBody = document.getElementById("employeeTableBody");
  if (!tableBody) return;
  tableBody.innerHTML = rows.map((employee) => `
    <tr>
      <td>${employee.name || ""}</td>
      <td>${employee.newInterviews ?? ""}</td>
      <td>${employee.proposals ?? ""}</td>
      <td>${employee.recommendations ?? ""}</td>
      <td>${employee.interviewsScheduled ?? ""}</td>
      <td>${employee.interviewsHeld ?? ""}</td>
      <td>${employee.offers ?? ""}</td>
      <td>${employee.accepts ?? ""}</td>
      <td>${employee.proposalRate ?? ""}%</td>
      <td>${employee.recommendationRate ?? ""}%</td>
      <td>${employee.interviewScheduleRate ?? ""}%</td>
      <td>${employee.interviewHeldRate ?? ""}%</td>
      <td>${employee.offerRate ?? ""}%</td>
      <td>${employee.acceptRate ?? ""}%</td>
      <td>${employee.hireRate ?? ""}%</td>
      <td>${employee.plannedNewInterviews ?? ""}</td>
      <td>${employee.plannedProposals ?? ""}</td>
      <td>${employee.plannedRecommendations ?? ""}</td>
      <td>${employee.plannedInterviewsScheduled ?? ""}</td>
      <td>${employee.plannedInterviewsHeld ?? ""}</td>
      <td>${employee.plannedOffers ?? ""}</td>
      <td>${employee.plannedAccepts ?? ""}</td>
    </tr>
  `).join("");
}
function filterAndSortEmployees(rows) {
  const searchTerm = state.employees.filters.search;
  let filtered = Array.isArray(rows) ? [...rows] : [];
  if (searchTerm) {
    filtered = filtered.filter((employee) => (employee?.name || "").toLowerCase().includes(searchTerm));
  }
  const direction = state.employees.filters.sortOrder === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    const aVal = a?.[state.employees.filters.sortKey];
    const bVal = b?.[state.employees.filters.sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return aVal.localeCompare(bVal) * direction;
    }
    return (num(aVal) - num(bVal)) * direction;
  });
  return filtered;
}
function renderEmployeeRows(source = state.employees.list) {
  const rows = filterAndSortEmployees(source);
  updateEmployeeDisplay(rows);
}
function applyEmployeeSearch(rawValue) {
  state.employees.filters.search = (rawValue || "").trim().toLowerCase();
  renderEmployeeRows();
}
function handleEmployeeSort(event) {
  const raw = event.target.value || "";
  const [key, direction = "desc"] = raw.split("-");
  if (!key) return;
  state.employees.filters.sortKey = key;
  state.employees.filters.sortOrder = direction === "asc" ? "asc" : "desc";
  renderEmployeeRows();
}
function filterAndSortGeneric(rows, filters = {}) {
  let filtered = Array.isArray(rows) ? [...rows] : [];
  const searchTerm = (filters.search || "").toLowerCase();
  if (searchTerm) {
    filtered = filtered.filter((row) => (row?.name || "").toLowerCase().includes(searchTerm));
  }
  const direction = filters.sortOrder === "asc" ? 1 : -1;
  const key = filters.sortKey || "name";
  filtered.sort((a, b) => {
    const aVal = a?.[key];
    const bVal = b?.[key];
    if (typeof aVal === "string" || typeof bVal === "string") {
      return (String(aVal || "") || "").localeCompare(String(bVal || "")) * direction;
    }
    return (num(aVal) - num(bVal)) * direction;
  });
  return filtered;
}
function formatAchvPercent(current, goal) {
  if (goal === null || goal === void 0) return { text: "", className: "daily-muted" };
  if (!Number.isFinite(num(goal)) || num(goal) === 0) return { text: "", className: "daily-muted" };
  const percent = Math.round(num(current) / num(goal) * 100);
  const className = percent >= 100 ? "daily-achv-high" : "daily-achv-normal";
  return { text: `${percent}%`, className };
}
function displayGoal(value) {
  if (value === null || value === void 0) return "";
  return num(value).toLocaleString();
}
function renderCompanyTermTables() {
  const body = document.getElementById("companyTermCombinedBody");
  if (!body) return;
  const rows = filterAndSortGeneric(state.companyTerm.rows || [], state.companyTerm.filters);
  body.innerHTML = rows.map((row) => {
    const achv = (key) => {
      const meta = formatAchvPercent(row[key], row[`${key}Goal`]);
      return `<td class="${meta.className}">${meta.text}</td>`;
    };
    const renderCountCell = (key, goalKey) => `
        <td class="term-count">${num(row[key]).toLocaleString()}</td>
        <td class="term-count term-goal">${displayGoal(row[goalKey])}</td>
        ${achv(key)}
      `;
    const renderRateCell = (key, goalKey) => `
        <td class="term-rate">${num(row[key])}%</td>
        <td class="term-rate term-goal">${displayGoal(row[goalKey])}%</td>
        ${achv(key)}
      `;
    return `
        <tr>
          <td>${row.name}</td>
          ${renderCountCell("newInterviews", "newInterviewsGoal")}
          ${renderCountCell("proposals", "proposalsGoal")}
          ${renderCountCell("recommendations", "recommendationsGoal")}
          ${renderCountCell("interviewsScheduled", "interviewsScheduledGoal")}
          ${renderCountCell("interviewsHeld", "interviewsHeldGoal")}
          ${renderCountCell("offers", "offersGoal")}
          ${renderCountCell("accepts", "acceptsGoal")}
          ${renderRateCell("hireRate", "hireRateGoal")}
          ${renderRateCell("proposalRate", "proposalRateGoal")}
          ${renderRateCell("recommendationRate", "recommendationRateGoal")}
          ${renderRateCell("interviewScheduleRate", "interviewScheduleRateGoal")}
          ${renderRateCell("interviewHeldRate", "interviewHeldRateGoal")}
          ${renderRateCell("offerRate", "offerRateGoal")}
          ${renderRateCell("acceptRate", "acceptRateGoal")}
        </tr>
      `;
  }).join("");
}
function applyCompanyTermSearch(rawValue) {
  state.companyTerm.filters.search = (rawValue || "").trim().toLowerCase();
  renderCompanyTermTables();
}
function handleCompanyTermSort(event) {
  const raw = event.target.value || "";
  const [key, direction = "asc"] = raw.split("-");
  if (!key) return;
  state.companyTerm.filters.sortKey = key;
  state.companyTerm.filters.sortOrder = direction === "asc" ? "asc" : "desc";
  renderCompanyTermTables();
}
function handleCompanyMsMetricChange(event) {
  const next = event.target.value || "";
  const deptKey = event.target.dataset.dept;
  if (deptKey) {
    state.companyMs.metricKeys = {
      ...state.companyMs.metricKeys,
      [deptKey]: next
    };
  }
  if (deptKey && state.companyMsPeriodId) {
    loadCompanyMsTargets(state.companyMsPeriodId).then(() => {
      renderCompanyMsTable();
    });
  } else {
    renderCompanyMsTable();
  }
}
function handleCompanySalesMetricChange(event) {
  const next = event.target.value || "";
  const employeeId = event.target.dataset.employee;
  if (employeeId) {
    state.companySales.metricKeys = {
      ...state.companySales.metricKeys,
      [employeeId]: next
    };
  }
  renderCompanySalesTable();
}
function setCardAchievementProgress(achvElement, percentValue) {
  if (!achvElement) return;
  const card = achvElement.closest(".kpi-v2-card");
  if (!card) return;
  const normalized = Math.max(0, Math.min(num(percentValue), 100));
  card.style.setProperty("--achv-progress", `${normalized}%`);
}
function writeRateDetailInline(cardEl, labelA, valA, labelB, valB, modeLabel = "") {
  if (!cardEl) return;
  let subtext = cardEl.querySelector(".kpi-v2-subtext");
  if (!subtext) {
    subtext = document.createElement("div");
    subtext.className = "kpi-v2-subtext";
    const valueEl = cardEl.querySelector(".kpi-v2-value");
    if (valueEl) {
      valueEl.insertAdjacentElement("afterend", subtext);
    } else {
      const meta = cardEl.querySelector(".kpi-v2-meta");
      if (meta) {
        meta.insertAdjacentElement("beforebegin", subtext);
      } else {
        cardEl.appendChild(subtext);
      }
    }
  }
  const prefix = modeLabel ? `${modeLabel} ` : "";
  subtext.textContent = `${prefix}${labelA} ${num(valA)} / ${labelB} ${num(valB)}`;
}
function initializeKpiTabs() {
  const groups = document.querySelectorAll(".kpi-tab-group[data-kpi-tab-group]");
  groups.forEach((group) => {
    const section = group.closest(".kpi-v2-section");
    if (!section) return;
    const tabs = Array.from(group.querySelectorAll(".kpi-tab[data-kpi-tab]"));
    const localPanels = Array.from(section.querySelectorAll(".kpi-tab-panel[data-kpi-tab-panel]"));
    const scope = group.dataset.kpiTabGroup || "";
    const scopedPanels = scope ? Array.from(document.querySelectorAll(`.kpi-tab-panel[data-kpi-tab-panel^="${scope}-"]`)) : [];
    const panels = scopedPanels.length ? scopedPanels : localPanels;
    const activate = (tabId) => {
      tabs.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.kpiTab === tabId));
      panels.forEach((panel) => {
        const isActive = panel.dataset.kpiTabPanel === tabId;
        panel.classList.toggle("is-active", isActive);
        panel.classList.toggle("is-hidden", !isActive);
        panel.style.display = isActive ? "" : "none";
        panel.hidden = !isActive;
      });
      if (tabId.includes("graphs")) {
        const scope2 = tabId.split("-")[0];
        if (scope2 && state.dashboard[scope2]) {
          setTimeout(() => reloadDashboardData(scope2), 50);
        }
      }
    };
    tabs.forEach((btn) => btn.addEventListener("click", () => activate(btn.dataset.kpiTab)));
    const initial = tabs.find((btn) => btn.classList.contains("is-active")) || tabs[0];
    if (initial) activate(initial.dataset.kpiTab);
  });
}
function initializeEvaluationPeriods() {
  loadEvaluationPeriods();
  const personalSelect = document.getElementById("personalEvaluationPeriodSelect");
  const companySelect = document.getElementById("companyEvaluationPeriodSelect");
  personalSelect?.addEventListener("change", handlePersonalPeriodChange);
  companySelect?.addEventListener("change", handleCompanyPeriodChange);
  document.getElementById("personalDailyPeriodSelect")?.addEventListener("change", handlePersonalDailyPeriodChange);
  document.getElementById("companyDailyPeriodSelect")?.addEventListener("change", handleCompanyDailyPeriodChange);
  document.getElementById("companyDailyEmployeeSelect")?.addEventListener("change", handleCompanyDailyEmployeeChange);
  document.getElementById("companyTermPeriodSelect")?.addEventListener("change", handleCompanyTermPeriodChange);
  document.getElementById("companyMsPeriodSelect")?.addEventListener("change", handleCompanyMsPeriodChange);
  document.getElementById("personalMsPeriodSelect")?.addEventListener("change", handlePersonalMsPeriodChange);
}
function loadEvaluationPeriods() {
  state.evaluationPeriods = goalSettingsService.generateDefaultPeriods({ type: "monthly" });
  goalSettingsService.setEvaluationPeriods(state.evaluationPeriods);
  const todayPeriodId = goalSettingsService.resolvePeriodIdByDate(
    isoDate2(/* @__PURE__ */ new Date()),
    state.evaluationPeriods
  );
  const first = state.evaluationPeriods[0];
  const hasPersonal = state.evaluationPeriods.some((period) => period.id === state.personalEvaluationPeriodId);
  const hasCompany = state.evaluationPeriods.some((period) => period.id === state.companyEvaluationPeriodId);
  const hasPersonalDaily = state.evaluationPeriods.some((period) => period.id === state.personalDailyPeriodId);
  const hasCompanyDaily = state.evaluationPeriods.some((period) => period.id === state.companyDailyPeriodId);
  const hasCompanyTerm = state.evaluationPeriods.some((period) => period.id === state.companyTermPeriodId);
  const hasCompanyMs = state.evaluationPeriods.some((period) => period.id === state.companyMsPeriodId);
  if (!hasPersonal && (todayPeriodId || first)) state.personalEvaluationPeriodId = todayPeriodId || first?.id || "";
  if (!hasCompany && (todayPeriodId || first)) state.companyEvaluationPeriodId = todayPeriodId || first?.id || "";
  if (!hasPersonalDaily && (todayPeriodId || first)) state.personalDailyPeriodId = todayPeriodId || first?.id || "";
  if (!hasCompanyDaily && (todayPeriodId || first)) state.companyDailyPeriodId = todayPeriodId || first?.id || "";
  if (!hasCompanyTerm && (todayPeriodId || first)) state.companyTermPeriodId = todayPeriodId || first?.id || "";
  if (!hasCompanyTerm && (todayPeriodId || first)) state.companyTermPeriodId = todayPeriodId || first?.id || "";
  if (!hasCompanyMs && (todayPeriodId || first)) state.companyMsPeriodId = todayPeriodId || first?.id || "";
  if (state.personalDailyPeriodId && !state.companyMsPeriodId) {
    state.companyMsPeriodId = state.personalDailyPeriodId;
  }
  const hasPersonalMs = state.evaluationPeriods.some((period) => period.id === state.personalMsPeriodId);
  if (!hasPersonalMs && (todayPeriodId || first)) state.personalMsPeriodId = todayPeriodId || first?.id || "";
  ensureCompanyDailyEmployeeId();
  renderEvaluationSelectors();
  applyPersonalEvaluationPeriod(false);
}
function renderEvaluationSelectors() {
  const options = state.evaluationPeriods.map((period) => `<option value="${period.id}">${formatPeriodMonthLabel(period)}</option>`).join("");
  const personalSelect = document.getElementById("personalEvaluationPeriodSelect");
  const companySelect = document.getElementById("companyEvaluationPeriodSelect");
  const personalDailySelect = document.getElementById("personalDailyPeriodSelect");
  const companyDailySelect = document.getElementById("companyDailyPeriodSelect");
  const companyTermSelect = document.getElementById("companyTermPeriodSelect");
  const companyMsSelect = document.getElementById("companyMsPeriodSelect");
  const personalMsSelect = document.getElementById("personalMsPeriodSelect");
  if (personalSelect) {
    personalSelect.innerHTML = options;
    if (state.personalEvaluationPeriodId) personalSelect.value = state.personalEvaluationPeriodId;
  }
  if (companySelect) {
    companySelect.innerHTML = options;
    if (state.companyEvaluationPeriodId) companySelect.value = state.companyEvaluationPeriodId;
  }
  if (personalDailySelect) {
    personalDailySelect.innerHTML = options;
    if (state.personalDailyPeriodId) personalDailySelect.value = state.personalDailyPeriodId;
  }
  if (companyDailySelect) {
    companyDailySelect.innerHTML = options;
    if (state.companyDailyPeriodId) companyDailySelect.value = state.companyDailyPeriodId;
  }
  if (companyTermSelect) {
    companyTermSelect.innerHTML = options;
    if (state.companyTermPeriodId) companyTermSelect.value = state.companyTermPeriodId;
  }
  if (companyMsSelect) {
    companyMsSelect.innerHTML = options;
    if (state.companyMsPeriodId) companyMsSelect.value = state.companyMsPeriodId;
  }
  if (personalMsSelect) {
    personalMsSelect.innerHTML = options;
    if (state.personalMsPeriodId) personalMsSelect.value = state.personalMsPeriodId;
  }
  renderCompanyDailyEmployeeOptions();
  const companyDailyEmployeeSelect = document.getElementById("companyDailyEmployeeSelect");
  if (companyDailyEmployeeSelect && state.companyDailyEmployeeId) {
    companyDailyEmployeeSelect.value = state.companyDailyEmployeeId;
  }
  updatePersonalPeriodLabels();
  syncEvaluationPeriodLabels();
}
function renderCompanyDailyEmployeeOptions() {
  const select = document.getElementById("companyDailyEmployeeSelect");
  if (!select) return;
  const employees = getCompanyDailyEmployees();
  if (!employees.length) {
    select.innerHTML = '<option value="">\u793E\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093</option>';
    return;
  }
  select.innerHTML = employees.map((emp) => `<option value="${emp.id}">${emp.name}</option>`).join("");
  if (state.companyDailyEmployeeId) {
    select.value = state.companyDailyEmployeeId;
  }
  if (!select.value) {
    select.value = String(employees[0].id);
  }
  if (select.value !== state.companyDailyEmployeeId) {
    state.companyDailyEmployeeId = select.value;
  }
}
function initializeCompanyDailyEmployeeSelect() {
  renderCompanyDailyEmployeeOptions();
  const select = document.getElementById("companyDailyEmployeeSelect");
  if (select) {
    select.removeEventListener("change", handleCompanyDailyEmployeeChange);
    select.addEventListener("change", handleCompanyDailyEmployeeChange);
  }
}
function handlePersonalPeriodChange(event) {
  state.personalEvaluationPeriodId = event.target.value || "";
  applyPersonalEvaluationPeriod(true);
}
async function handleCompanyPeriodChange(event) {
  state.companyEvaluationPeriodId = event.target.value || "";
  await goalSettingsService.loadCompanyPeriodTarget(state.companyEvaluationPeriodId);
  renderCompanyTargets();
  void renderCompanyPeriodRevenueSummary(state.kpi.companyPeriod);
  loadCompanySummaryKPI();
}
async function handleCompanyTermPeriodChange(event) {
  state.companyTermPeriodId = event.target.value || "";
  await loadCompanyTermEmployeeKpi();
  renderCompanyTermTables();
}
async function handleCompanyMsPeriodChange(event) {
  state.companyMsPeriodId = event.target.value || "";
  if (state.companyMsPeriodId) {
    state.personalMsPeriodId = state.companyMsPeriodId;
  }
  await loadAndRenderCompanyMs();
}
async function handlePersonalMsPeriodChange(event) {
  state.personalMsPeriodId = event.target.value || "";
  await loadAndRenderPersonalMs();
}
function handlePersonalDailyPeriodChange(event) {
  state.personalDailyPeriodId = event.target.value || "";
  if (state.personalDailyPeriodId) {
    state.companyMsPeriodId = state.personalDailyPeriodId;
  }
  state.personalDisplayMode = "monthly";
  if (state.personalDailyMs) {
    state.personalDailyMs.targets = {};
    state.personalDailyMs.totals = {};
  }
  loadAndRenderPersonalDaily();
  loadAndRenderCompanyMs();
}
function handleCompanyDailyPeriodChange(event) {
  state.companyDailyPeriodId = event.target.value || "";
  loadAndRenderCompanyDaily();
}
function handleCompanyDailyEmployeeChange(event) {
  state.companyDailyEmployeeId = event.target.value || "";
  loadAndRenderCompanyDaily();
}
function applyPersonalEvaluationPeriod(shouldReload = true) {
  state.personalDisplayMode = "monthly";
  seedGoalDefaultsFromSettings();
  initGoalInputs("today");
  initGoalInputs("monthly");
  refreshAchievements("today");
  refreshAchievements("monthly");
  updatePersonalPeriodLabels();
  syncEvaluationPeriodLabels();
  if (shouldReload) {
    loadYieldData();
    loadAndRenderPersonalDaily();
  }
}
function getPersonalSummaryTitleText() {
  const period = state.evaluationPeriods.find((item) => item.id === state.personalEvaluationPeriodId);
  const labelText = formatPeriodMonthLabel(period);
  return labelText ? `${labelText}\u306E\u5B9F\u7E3E\u30B5\u30DE\u30EA\u30FC` : "\u4ECA\u6708\u306E\u5B9F\u7E3E\u30B5\u30DE\u30EA\u30FC";
}
function updatePersonalPeriodLabels() {
  const dailyPeriod = state.evaluationPeriods.find((item) => item.id === state.personalDailyPeriodId);
  const titleEl = document.getElementById("personalSummaryTitle");
  const dailyLabel = document.getElementById("personalDailyPeriodLabel");
  if (titleEl) titleEl.textContent = getPersonalSummaryTitleText();
  if (dailyLabel) {
    if (!dailyPeriod) {
      dailyLabel.textContent = "";
    } else {
      const labelText = formatPeriodMonthLabel(dailyPeriod) || "";
      dailyLabel.textContent = labelText ? `\u8A55\u4FA1\u671F\u9593\uFF1A${labelText}` : "";
    }
  }
}
function syncEvaluationPeriodLabels() {
  const dailyPeriod = state.evaluationPeriods.find((item) => item.id === state.personalDailyPeriodId);
  const titleEl = document.getElementById("personalSummaryTitle");
  const dailyLabel = document.getElementById("personalDailyPeriodLabel");
  if (titleEl) {
    titleEl.textContent = getPersonalSummaryTitleText();
  }
  if (dailyLabel) {
    if (!dailyPeriod) {
      dailyLabel.textContent = "";
    } else {
      const labelText = formatPeriodMonthLabel(dailyPeriod) || "";
      dailyLabel.textContent = labelText ? `\u8A55\u4FA1\u671F\u9593\uFF1A${labelText}` : "";
    }
  }
}
function getCompanySummaryTitleText() {
  const period = state.evaluationPeriods.find((item) => item.id === state.companyEvaluationPeriodId);
  const labelText = formatPeriodMonthLabel(period);
  return labelText ? `${labelText}\u306E\u5B9F\u7E3E\u30B5\u30DE\u30EA\u30FC` : "\u4ECA\u6708\u306E\u5B9F\u7E3E\u30B5\u30DE\u30EA\u30FC";
}
function ensureChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartJsPromise) {
    chartJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js";
      script.async = true;
      script.onload = () => resolve(window.Chart);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return chartJsPromise;
}
async function initializeDashboardSection() {
  const panels = Array.from(document.querySelectorAll(".dashboard-panel[data-dashboard-scope]"));
  const scopes = Array.from(new Set(panels.map((panel) => panel.dataset.dashboardScope).filter((scope) => scope && state.dashboard[scope])));
  if (!scopes.length) return;
  ensureChartJs().then(() => {
    scopes.forEach((scope) => {
      setupDashboardControls(scope);
      reloadDashboardData(scope);
    });
  }).catch((error) => console.error("[yield] failed to load Chart.js", error));
}
async function reloadDashboardData(scope) {
  const range = getDashboardRange(scope);
  const advisorUserId = scope === "personal" ? await resolveAdvisorUserId2() : null;
  const granularity = getDashboardTrendGranularity(scope);
  const calcModeScope = scope === "personal" ? "personalMonthly" : "companyMonthly";
  try {
    const [trend, job, gender, age, media] = await Promise.all([
      fetchYieldTrendFromApi({
        startDate: range.startDate,
        endDate: range.endDate,
        scope,
        advisorUserId,
        granularity,
        calcModeScope
      }),
      fetchYieldBreakdownFromApi({
        startDate: range.startDate,
        endDate: range.endDate,
        scope,
        advisorUserId,
        dimension: "job",
        calcModeScope
      }),
      fetchYieldBreakdownFromApi({
        startDate: range.startDate,
        endDate: range.endDate,
        scope,
        advisorUserId,
        dimension: "gender",
        calcModeScope
      }),
      fetchYieldBreakdownFromApi({
        startDate: range.startDate,
        endDate: range.endDate,
        scope,
        advisorUserId,
        dimension: "age",
        calcModeScope
      }),
      scope === "company" ? fetchYieldBreakdownFromApi({
        startDate: range.startDate,
        endDate: range.endDate,
        scope,
        dimension: "media",
        calcModeScope
      }) : Promise.resolve(null)
    ]);
    state.dashboard[scope].trendData = trend;
    state.dashboard[scope].breakdown = {
      jobCategories: job,
      gender,
      ageGroups: age,
      ...scope === "company" ? { mediaSources: media } : {}
    };
    renderDashboardCharts(scope);
  } catch (error) {
    console.error("[yield] failed to reload dashboard data:", error);
  }
}
function setupDashboardControls(scope) {
  populateDashboardSelects(scope);
  const tabGroup = document.querySelector(`[data-trend-tabs="${scope}"]`);
  tabGroup?.querySelectorAll(".dashboard-tab").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.classList.contains("is-active")) return;
      tabGroup.querySelectorAll(".dashboard-tab").forEach((btn) => btn.classList.remove("is-active"));
      button.classList.add("is-active");
      state.dashboard[scope].trendMode = button.dataset.mode === "year" ? "year" : "month";
      updateTrendSelectState(scope);
      reloadDashboardData(scope);
    });
  });
  const yearSelect = document.getElementById(`${scope}TrendYearSelect`);
  const monthSelect = document.getElementById(`${scope}TrendMonthSelect`);
  yearSelect?.addEventListener("change", () => {
    const selectedYear = Number(yearSelect.value) || state.dashboard[scope].year;
    state.dashboard[scope].year = selectedYear;
    reloadDashboardData(scope);
  });
  monthSelect?.addEventListener("change", () => {
    const selectedMonth = Number(monthSelect.value) || state.dashboard[scope].month;
    state.dashboard[scope].month = selectedMonth;
    if (state.dashboard[scope].trendMode === "month") reloadDashboardData(scope);
  });
  updateTrendSelectState(scope);
}
function populateDashboardSelects(scope) {
  const yearSelect = document.getElementById(`${scope}TrendYearSelect`);
  const monthSelect = document.getElementById(`${scope}TrendMonthSelect`);
  if (yearSelect) {
    yearSelect.innerHTML = DASHBOARD_YEARS.map((year) => `<option value="${year}">${year}\u5E74</option>`).join("");
    yearSelect.value = `${state.dashboard[scope].year}`;
  }
  if (monthSelect) {
    monthSelect.innerHTML = DASHBOARD_MONTHS.map((month) => `<option value="${month}">${String(month).padStart(2, "0")}\u6708</option>`).join("");
    monthSelect.value = `${state.dashboard[scope].month}`;
  }
}
function updateTrendSelectState(scope) {
  const monthSelect = document.getElementById(`${scope}TrendMonthSelect`);
  if (!monthSelect) return;
  const isMonthly = state.dashboard[scope].trendMode === "month";
  monthSelect.disabled = !isMonthly;
  monthSelect.parentElement?.classList.toggle("is-disabled", !isMonthly);
}
function renderDashboardCharts(scope) {
  renderTrendChart(scope);
  renderCategoryChart({ scope, chartId: `${scope}JobChart`, datasetKey: "jobCategories", type: "bar" });
  renderCategoryChart({ scope, chartId: `${scope}GenderChart`, datasetKey: "gender", type: "doughnut" });
  renderCategoryChart({ scope, chartId: `${scope}AgeChart`, datasetKey: "ageGroups", type: "bar" });
  if (scope === "company") {
    renderCategoryChart({ scope, chartId: "companyMediaChart", datasetKey: "mediaSources", type: "bar" });
  }
}
function renderTrendChart(scope) {
  const canvas = document.getElementById(`${scope}TrendChart`);
  if (!canvas || !window.Chart) return;
  const trendCard = canvas.closest(".dashboard-card");
  if (trendCard) {
    trendCard.style.gridColumn = scope === "company" ? "1 / -1" : "span 2";
    trendCard.style.minHeight = scope === "company" ? "480px" : "420px";
  }
  const chartWrap = canvas.closest(".dashboard-chart");
  if (chartWrap) {
    chartWrap.style.height = scope === "company" ? "400px" : "360px";
    chartWrap.style.minHeight = scope === "company" ? "400px" : "360px";
  }
  destroyChart(scope, `${scope}TrendChart`);
  const config = buildTrendChartConfig(scope);
  if (!config) {
    return;
  }
  state.dashboard[scope].charts[`${scope}TrendChart`] = new Chart(canvas, {
    type: "line",
    data: config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true } } },
      scales: { y: { beginAtZero: true, ticks: { callback: (value) => `${value}%` }, suggestedMax: 100 } }
    }
  });
}
function renderCategoryChart({ scope, chartId, datasetKey, type }) {
  const canvas = document.getElementById(chartId);
  if (!canvas || !window.Chart) return;
  const breakdown = state.dashboard[scope]?.breakdown;
  const dataset = breakdown?.[datasetKey];
  if (!dataset || !Array.isArray(dataset.labels) || !Array.isArray(dataset.data) || !dataset.labels.length) {
    destroyChart(scope, chartId);
    return;
  }
  destroyChart(scope, chartId);
  const colors = getChartColors(dataset.labels.length, type === "doughnut" ? 0.9 : 0.25);
  const data = {
    labels: dataset.labels,
    datasets: [
      {
        label: "\u4EBA\u6570",
        data: dataset.data,
        backgroundColor: colors.background,
        borderColor: colors.border,
        borderWidth: type === "doughnut" ? 1 : 1.5,
        hoverOffset: type === "doughnut" ? 8 : void 0
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom" } },
    scales: type === "doughnut" ? {} : { x: { ticks: { font: { size: 11 } } }, y: { beginAtZero: true } }
  };
  state.dashboard[scope].charts[chartId] = new Chart(canvas, {
    type,
    data,
    options: type === "doughnut" ? { ...options, cutout: "55%" } : options
  });
}
function buildTrendChartConfig(scope) {
  const trend = state.dashboard[scope].trendData;
  if (!trend || !Array.isArray(trend.labels) || !Array.isArray(trend.rates) || !trend.labels.length) {
    return null;
  }
  const labels = trend.labels;
  const series = trend.rates;
  const keyMap = {
    \u63D0\u6848\u7387: "proposalRate",
    \u63A8\u85A6\u7387: "recommendationRate",
    \u9762\u8AC7\u8A2D\u5B9A\u7387: "interviewScheduleRate",
    \u9762\u8AC7\u5B9F\u65BD\u7387: "interviewHeldRate",
    \u5185\u5B9A\u7387: "offerRate",
    \u627F\u8AFE\u7387: "acceptRate",
    \u5165\u793E\u6C7A\u5B9A\u7387: "hireRate"
  };
  const datasets = RATE_KEYS.map((label, idx) => {
    let data = [];
    const key = keyMap[label] || null;
    if (key) {
      data = series.map((row) => Number(row[key] || 0));
    } else {
      data = series.map(() => 0);
    }
    return {
      label,
      data,
      borderColor: DASHBOARD_COLORS[idx % DASHBOARD_COLORS.length],
      backgroundColor: hexToRgba(DASHBOARD_COLORS[idx % DASHBOARD_COLORS.length], 0.15),
      tension: 0.35,
      fill: false,
      pointRadius: 2,
      pointHoverRadius: 4
    };
  });
  return { labels, datasets };
}
function getChartColors(count, alpha) {
  const background = [];
  const border = [];
  for (let i = 0; i < count; i += 1) {
    const color = DASHBOARD_COLORS[i % DASHBOARD_COLORS.length];
    border.push(color);
    background.push(hexToRgba(color, alpha));
  }
  return { background, border };
}
function destroyChart(scope, key) {
  const charts = state.dashboard[scope].charts;
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}
function hexToRgba(hex, alpha) {
  const sanitized = hex.replace("#", "");
  const bigint = parseInt(sanitized, 16);
  const r = bigint >> 16 & 255;
  const g = bigint >> 8 & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function isValidRange(range) {
  if (!range.startDate || !range.endDate) return false;
  return new Date(range.startDate) <= new Date(range.endDate);
}
function buildAdvisorMsHeaderRow(headerRow, dates) {
  if (!headerRow) return;
  const dateCells = dates.map((date) => {
    const dayLabel = formatMonthDayLabel(date);
    return `<th scope="col" colspan="2" class="ms-date-header">${dayLabel}</th>`;
  }).join("");
  const subHeaderCells = dates.map(() => `
    <th scope="col" class="ms-sub-header">MS</th>
    <th scope="col" class="ms-sub-header">\u9032\u6357\u7387</th>
  `).join("");
  headerRow.innerHTML = `
    <th scope="col" class="kpi-v2-sticky-label" rowspan="2" style="min-width: 180px; z-index: 10;">
       <div style="text-align: center;">\u30E1\u30F3\u30D0\u30FC\u30FB\u6307\u6A19</div>
    </th>
    ${dateCells}
  `;
  let nextRow = headerRow.nextElementSibling;
  while (nextRow && nextRow.classList.contains("ms-subheader-row")) {
    nextRow.remove();
    nextRow = headerRow.nextElementSibling;
  }
  const subHeaderRow = document.createElement("tr");
  subHeaderRow.classList.add("ms-subheader-row");
  subHeaderRow.innerHTML = subHeaderCells;
  headerRow.parentElement?.appendChild(subHeaderRow);
}
async function loadAndRenderPersonalMs() {
  const periodId = state.personalMsPeriodId;
  const period = state.evaluationPeriods.find((item) => item.id === periodId);
  if (!period) {
    state.personalMs = { ...state.personalMs, dates: [], dailyTotals: {}, companyTarget: {}, revenue: { actual: 0, target: 0 } };
    renderAdvisorMsTable();
    renderAdvisorMsTable();
    return;
  }
  const monthStr = resolveMsSettingsMonthByPeriodId(periodId);
  if (monthStr) {
    console.log("[DEBUG] loadAndRenderPersonalMs: Loading settings", { periodId, monthStr });
    try {
      await goalSettingsService.loadMsPeriodSettings(monthStr, { force: true });
      console.log("[DEBUG] loadAndRenderPersonalMs: Settings loaded");
    } catch (e) {
      console.error("Failed to load MS period settings for advisor view", e);
    }
  }
  const ranges = resolveCompanyMsRanges(period);
  const ensureMetricKey = (deptKey) => {
    const validKeys = getMetricsForDept(deptKey).map((m) => m.key);
    const existingKey = state.personalMs?.metricKeys?.[deptKey];
    if (!existingKey || !validKeys.includes(existingKey)) {
      return validKeys[0]?.key;
    }
    return existingKey;
  };
  const selectedPersonalMetrics = {
    marketing: ensureMetricKey("marketing"),
    cs: ensureMetricKey("cs"),
    sales: ensureMetricKey("sales")
  };
  const msBounds = MS_DEPARTMENTS.reduce((acc, dept) => {
    const isRevenue = dept.key === "revenue";
    const metricKey = isRevenue ? "revenue" : selectedPersonalMetrics[dept.key];
    if (!metricKey) return acc;
    const hasMsPeriod = isRevenue || hasMsPeriodSettingForMetric(periodId, metricKey);
    if (!hasMsPeriod) return acc;
    const range = resolvePersonalDailyDateRange(periodId, dept.key, metricKey);
    const startObj = parseLocalDate(range?.startDate);
    const endObj = parseLocalDate(range?.endDate);
    if (startObj && (!acc.start || startObj < acc.start)) acc.start = startObj;
    if (endObj && (!acc.end || endObj > acc.end)) acc.end = endObj;
    return acc;
  }, { start: null, end: null });
  const msDataRange = msBounds.start && msBounds.end ? { startDate: isoDate2(msBounds.start), endDate: isoDate2(msBounds.end) } : ranges.msOverallRange || ranges.salesRange;
  const [payload, members] = await Promise.all([
    ensureDailyYieldData(periodId, {
      msMode: true,
      rangeOverride: msDataRange
    }),
    ensureMembersList()
  ]);
  const myUserId = await resolveAdvisorUserId2();
  const myEmployee = payload?.employees?.find((e) => String(e.advisorUserId) === String(myUserId));
  const myMemberInfo = members.find((m) => String(m.id) === String(myUserId));
  const advisorIds = myEmployee ? [String(myUserId)] : [];
  const dailyTotals = myEmployee ? buildCompanyMsDailyTotalsFromEmployees([myEmployee], advisorIds) : {};
  const userRole = myMemberInfo?.role || myEmployee?.role || "";
  state.personalMs = {
    ...state.personalMs,
    metricKeys: selectedPersonalMetrics,
    dates: enumerateDateRange(msDataRange.startDate, msDataRange.endDate),
    dailyTotals,
    msTargets: state.personalMs.msTargets || {},
    dailyTotals,
    msTargets: state.personalMs.msTargets || {},
    revenue: { actual: 0, target: 0 },
    userName: myEmployee?.name || myMemberInfo?.name || "\u81EA\u5206",
    userRole
  };
  renderAdvisorMsTable();
}
function renderAdvisorMsTable() {
  const headerRow = document.getElementById("personalMsHeaderRow");
  const body = document.getElementById("personalMsTableBody");
  if (!headerRow || !body) return;
  const periodId = state.personalMsPeriodId;
  if (!periodId) {
    headerRow.innerHTML = "";
    body.innerHTML = "";
    return;
  }
  let targetDepts = MS_DEPARTMENTS;
  const userRole = state.personalMs.userRole || "";
  if (userRole) {
    const roleLower = String(userRole).toLowerCase();
    if (roleLower.includes("marketing") || roleLower.includes("\u30DE\u30FC\u30B1")) {
      targetDepts = MS_DEPARTMENTS.filter((d) => d.key === "marketing" || d.key === "revenue");
    } else if (roleLower.includes("cs") || roleLower.includes("\u30AB\u30B9\u30BF\u30DE\u30FC")) {
      targetDepts = MS_DEPARTMENTS.filter((d) => d.key === "cs" || d.key === "revenue");
    } else if (roleLower.includes("sales") || roleLower.includes("\u55B6\u696D") || roleLower.includes("advisor") || roleLower.includes("\u30A2\u30C9\u30D0\u30A4\u30B6\u30FC")) {
      targetDepts = MS_DEPARTMENTS.filter((d) => d.key === "sales" || d.key === "revenue");
    }
  }
  targetDepts.forEach((dept) => {
    const isRevenue = dept.key === "revenue";
    const deptMetrics = getMetricsForDept(dept.key);
    let metricKey = state.personalMs.metricKeys?.[dept.key];
    if (!metricKey && deptMetrics.length > 0) {
      metricKey = deptMetrics[0].key;
      if (!state.personalMs.metricKeys) state.personalMs.metricKeys = {};
      state.personalMs.metricKeys[dept.key] = metricKey;
    }
  });
  let minDateObj = null;
  let maxDateObj = null;
  targetDepts.forEach((dept) => {
    const isRevenue = dept.key === "revenue";
    const metricKey = isRevenue ? "revenue" : state.personalMs.metricKeys?.[dept.key];
    if (!metricKey) return;
    const hasMsPeriod = isRevenue || hasMsPeriodSettingForMetric(periodId, metricKey);
    if (!hasMsPeriod) return;
    const rRange = resolvePersonalDailyDateRange(periodId, dept.key, metricKey);
    const s = parseLocalDate(rRange.startDate);
    const e = parseLocalDate(rRange.endDate);
    if (s && (!minDateObj || s < minDateObj)) minDateObj = s;
    if (e && (!maxDateObj || e > maxDateObj)) maxDateObj = e;
  });
  if (!minDateObj || !maxDateObj) {
    const dates2 = state.personalMs.dates || [];
    if (!dates2.length) {
      headerRow.innerHTML = "";
      body.innerHTML = "";
      return;
    }
    minDateObj = parseLocalDate(dates2[0]);
    maxDateObj = parseLocalDate(dates2[dates2.length - 1]);
  }
  const overallStartDate = isoDate2(minDateObj);
  const overallEndDate = isoDate2(maxDateObj);
  const dates = enumerateDateRange(overallStartDate, overallEndDate);
  state.personalMs.dates = dates;
  console.log("[DEBUG] renderAdvisorMsTable: calculated range", { minDateObj, maxDateObj, datesCount: dates.length, dates });
  const thead = headerRow.parentElement;
  if (thead) {
    while (thead.rows.length > 1) {
      thead.deleteRow(1);
    }
  }
  buildAdvisorMsHeaderRow(headerRow, dates);
  const rows = [];
  targetDepts.forEach((dept) => {
    const isRevenue = dept.key === "revenue";
    const deptMetrics = getMetricsForDept(dept.key);
    let metricKey = state.personalMs.metricKeys?.[dept.key];
    if (!metricKey && deptMetrics.length > 0) {
      metricKey = deptMetrics[0].key;
    }
    const hasMsPeriod = isRevenue || hasMsPeriodSettingForMetric(periodId, metricKey);
    const noticeMonth = resolveMsSettingsMonthByPeriodId(periodId) || "\u9078\u629E\u6708";
    const metricOption = metricKey ? deptMetrics.find((m) => m.key === metricKey) : null;
    const metricLabel = isRevenue ? "\u58F2\u4E0A" : metricOption?.label || "";
    const optionsHtml = deptMetrics.map(
      (option) => `<option value="${option.key}" ${option.key === metricKey ? "selected" : ""}>${option.label}</option>`
    ).join("");
    const userName = state.personalMs.userName || "\u81EA\u5206";
    const metricCell = isRevenue ? `<th scope="row" class="kpi-v2-sticky-label kpi-v2-ms-metric" rowspan="1" style="min-width: 180px; z-index: 10;">
             <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
               <span style="font-weight: bold; font-size: 0.9em; color: #333;">${userName}</span>
               <span style="font-size: 0.85em; color: #666;">${metricLabel}</span>
             </div>
         </th>` : `<th scope="row" class="kpi-v2-sticky-label kpi-v2-ms-metric" rowspan="1" style="min-width: 180px; z-index: 10;">
           <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
             <span style="font-weight: bold; font-size: 0.9em; color: #333;">${userName}</span>
             <select class="kpi-v2-sort-select personal-ms-metric-select" data-dept="${dept.key}" style="width: 100%;">
               ${optionsHtml}
             </select>
           </div>
         </th>`;
    if (!hasMsPeriod) {
      rows.push(`
        <tr class="ms-metric-row">
          ${metricCell}
          <td class="daily-type ms-no-period-notice" colspan="${dates.length * 2}">
            \u26A0 ${noticeMonth} \u306EMS\u671F\u9593\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093
          </td>
        </tr>
      `);
      return;
    }
    const msAndRateCells = dates.map((date) => {
      const isDisabled = isDateBeforePersonalDeptStart(date, dept.key, periodId, metricKey) || isDateAfterPersonalDeptEnd(date, dept.key, periodId, metricKey);
      if (isDisabled) return '<td class="ms-cell-disabled"></td><td class="ms-cell-disabled"></td>';
      const savedMs = state.personalMs.msTargets?.[dept.key]?.[date] || "";
      const actual = isRevenue ? 0 : state.personalMs.dailyTotals?.[date]?.[metricOption?.key] || 0;
      let rateDisplay = "-";
      let rateClass = "";
      if (savedMs && Number(savedMs) > 0) {
        const rate = Math.round(actual / Number(savedMs) * 100);
        rateDisplay = `${rate}%`;
        rateClass = rate >= 100 ? "ms-rate-good" : rate >= 80 ? "ms-rate-warn" : "ms-rate-bad";
      }
      return `
            <td class="ms-target-cell">
               <input type="number" class="ms-target-input is-readonly" readonly value="${savedMs}">
            </td>
            <td class="ms-actual-cell">
               <div class="ms-actual-value">${formatNumberCell(actual)}</div>
               <div class="ms-progress-rate ${rateClass}">${rateDisplay}</div>
            </td>
        `;
    }).join("");
    rows.push(`
      <tr class="ms-metric-row">
        ${metricCell}
        ${msAndRateCells}
      </tr>
    `);
  });
  body.innerHTML = rows.join("");
  body.querySelectorAll(".personal-ms-metric-select").forEach((select) => {
    select.addEventListener("change", (e) => {
      const key = e.target.getAttribute("data-dept");
      if (state.personalMs.metricKeys) {
        state.personalMs.metricKeys[key] = e.target.value;
        renderAdvisorMsTable();
      }
    });
  });
}

// pages/yield-admin/yield-admin.js
var templateCache = null;
var renderToken = 0;
async function loadTemplateHtml() {
  if (templateCache) return templateCache;
  const url = new URL("../yield/index.html", import.meta.url).href;
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`yield template ${res.status}`);
  }
  templateCache = await res.text();
  return templateCache;
}
function removeCompanyTabs(section, tabIds) {
  tabIds.forEach((tabId) => {
    section.querySelector(`[data-kpi-tab="${tabId}"]`)?.remove();
    section.querySelector(`[data-kpi-tab-panel="${tabId}"]`)?.remove();
  });
}
function activateCompanyTab(section, tabId) {
  const tabs = section.querySelectorAll(".kpi-tab[data-kpi-tab]");
  const panels = section.querySelectorAll(".kpi-tab-panel[data-kpi-tab-panel]");
  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.kpiTab === tabId);
  });
  panels.forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.kpiTabPanel !== tabId);
  });
}
async function renderYieldSection(root, { scope, sectionKey }) {
  const host = root?.querySelector?.("#yieldPageHost") || root;
  if (!host) return;
  const token = String(++renderToken);
  host.dataset.renderToken = token;
  host.innerHTML = "";
  const html = await loadTemplateHtml();
  if (host.dataset.renderToken !== token) return;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const source = doc.querySelector(`[data-yield-section="${sectionKey}"]`);
  if (!source) return;
  const clone = document.importNode(source, true);
  removeCompanyTabs(clone, ["company-metrics", "company-graphs"]);
  activateCompanyTab(clone, "company-period");
  if (host.dataset.renderToken !== token) return;
  const container = document.createElement("section");
  container.className = "kpi-v2-wrapper space-y-6 yield-page";
  container.dataset.kpi = "v2";
  container.dataset.yieldScope = scope;
  container.appendChild(clone);
  host.appendChild(container);
}
async function mount2(root) {
  try {
    await renderYieldSection(root, { scope: "admin", sectionKey: "company" });
  } catch (error) {
    console.warn("[yield-admin] failed to render", error);
  }
  mount(root);
}
function unmount2() {
  unmount();
}
export {
  mount2 as mount,
  unmount2 as unmount
};
