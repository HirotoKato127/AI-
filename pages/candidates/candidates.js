import { PRIMARY_API_BASE } from "../../scripts/api/endpoints.js";
import { getSession } from "../../scripts/auth.js";
import {
  normalizeScreeningRulesPayload as normalizeScreeningRulesPayloadShared,
  computeValidApplication as computeValidApplicationShared,
  resolveValidApplicationRaw as resolveValidApplicationRawShared,
} from "../../scripts/services/validApplication.js?v=20260211_04";

// teleapo ???API Gateway? base

const CANDIDATES_API_BASE = PRIMARY_API_BASE;
const SCREENING_RULES_ENDPOINT = `${CANDIDATES_API_BASE}/settings-screening-rules`;
const SCREENING_RULES_FALLBACK_ENDPOINT = `${CANDIDATES_API_BASE}/settings/screening-rules`;

// 一覧は「/candidates」（末尾スラッシュなし）
const CANDIDATES_LIST_PATH = "/candidates";

// 詳細は「/candidates/{candidateId}」（末尾スラッシュなし）
const candidateDetailPath = (id) => `/candidates/${encodeURIComponent(String(id))}`;

const candidatesApi = (path) => `${CANDIDATES_API_BASE}${path}`;

function getCandidateDetailContainer() {
  return (
    document.getElementById("candidateDetailContent") ||
    document.getElementById("candidateDetailContentPage") ||
    null
  );
}

// =========================
// URLパラメータ（teleapo → candidates の遷移）
// =========================
function getCandidateUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const candidateIdFromUrl = params.get("candidateId");
  const shouldAutoOpenDetail = ["1", "true", "yes"].includes(
    String(params.get("openDetail") || "").toLowerCase()
  );
  return { candidateIdFromUrl, shouldAutoOpenDetail };
}

// =========================
// フィルタ定義
// =========================
const filterConfig = [
  { id: "candidatesFilterStartDate", event: "change" },
  { id: "candidatesFilterEndDate", event: "change" },
  { id: "candidatesFilterSource", event: "change" },
  { id: "candidatesFilterName", event: "input" },
  { id: "candidatesFilterCompany", event: "change" },
  { id: "candidatesFilterAdvisor", event: "change" },
  { id: "candidatesFilterCs", event: "change" },
  { id: "candidatesFilterValid", event: "change" },
  { id: "candidatesFilterPhase", event: "change" },
  { id: "candidatesFilterCsStatus", event: "change" },
];

const reportStatusOptions = ["LINE報告済み", "個人シート反映済み", "請求書送付済み"];
const finalResultOptions = ["----", "リリース(転居不可)", "リリース(精神疾患)", "リリース(人柄)", "飛び", "辞退", "承諾"];
const refundReportOptions = ["LINE報告済み", "企業報告済み"];

// CSステータスの事前定義オプション
const PREDEFINED_CS_STATUS_OPTIONS = [
  "34歳以下メール",
  "34歳以下メール(tech)",
  "35歳以上メール",
  "メール送信済",
  "LINE未追加(日程調整済み)",
  "LINE追加済み(日程調整未)",
  "LINE追加済み(日程調整済)",
  "外国籍メール",
  "重複",
  "設定不可",
  "リリース",
  "事務",
  "面談とび",
  "Spir面談とび",
  "エンポケ地方",
  "見込み(A)",
  "見込み(B)",
];

const modalHandlers = { closeButton: null, overlay: null, keydown: null };

const detailSectionKeys = [
  "nextAction",
  "selection",
  "profile",
  "assignees",
  "hearing",
  "cs",
  "teleapoLogs",
  "money",
  "documents",
];

const employmentStatusOptions = ["未回答", "就業中", "離職中"];
const PHASE_ORDER = [
  "未接触",
  "架電中",
  "SMS送信",
  "通電",
  "面談設定",
  "初回面談設定",
  "実施",
  "書類選考",
  "書類選考中",
  "一次面接調整",
  "一次面接",
  "二次面接調整",
  "二次面接",
  "最終面接",
  "内定承諾待ち",
  "内定承諾済み",
  "内定",
  "成約",
  "入社",
  "失注",
  "辞退",
  "内定後辞退",
  "入社後辞退"
];
const CALENDAR_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const AUTO_OPEN_DETAIL_FROM_URL = false;

let currentSortKey = "registeredAt";
let currentSortOrder = "desc";
let candidateDetailCurrentTab = "nextAction";

const LIST_PAGE_SIZE = 50;
const CALENDAR_BATCH_SIZE = 2000;
const CALENDAR_MAX_ITEMS = 20000; // guardrail

const japaneseLevelOptions = [
  { value: "", label: "未設定" },
  "N1",
  "N2",
  "N3以下",
];

const detailEditState = detailSectionKeys.reduce((state, key) => {
  state[key] = false;
  return state;
}, {});

const detailContentHandlers = { click: null, input: null };

// =========================
// 状態
// =========================
let allCandidates = [];
let filteredCandidates = [];
let selectedCandidateId = null; // 常に String で扱う
let candidatesEditMode = false;
let currentDetailCandidateId = null;
let lastSyncedAt = null;
let pendingInlineUpdates = {};
let openedFromUrlOnce = false;
let masterClients = [];
let masterUsers = [];
let masterCsUsers = [];
let masterAdvisorUsers = [];
let masterCsStatusOptions = [];
let listPage = 1;
let listTotal = 0;
let calendarCandidates = [];
let screeningRules = null;
let screeningRulesLoaded = false;
let screeningRulesLoading = false;
let screeningRulesLoadPromise = null;
let detailAutoSaveTimer = null;
const nextActionCache = new Map();
const contactPreferredTimeCache = new Map();
const validityHydrationCache = new Map();
const validityHydrationInFlight = new Set();
const customCsStatusOptions = new Set();
const deletedDefaultCsStatuses = new Set();
const TABLE_DOUBLE_TAP_INTERVAL_MS = 360;
let activeInlineCsStatusCandidateId = null;
let lastCsStatusTouchInfo = { candidateId: null, timestamp: 0 };
let calendarViewDate = new Date();
calendarViewDate.setDate(1);

// Deduplicate /clients create requests when multiple saves run quickly.
const clientCreateInFlight = new Map();
const pendingDeletedSelectionIds = {}; // Track deleted selectionProgress IDs per candidateId

function normalizeContactPreferredTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (["-", "ー", "未設定", "未入力", "未登録", "未指定"].includes(text)) return "";
  return text;
}

function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    return text === "" ? null : text;
  }
  return value;
}

function normalizeCsStatusOption(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (["-", "ー", "未設定", "未入力", "未登録", "未指定"].includes(text)) return "";
  return text;
}

// CSステータス同期用の定数 (teleapo.js と共通)
const CANDIDATES_CS_STATUS_STORAGE_KEY = 'candidates_custom_cs_statuses';
const CANDIDATES_CS_STATUS_DELETED_KEY = 'candidates_deleted_default_cs_statuses';
const CANDIDATES_CS_STATUS_SYSTEM_KEY = 'CS_STATUS';
let csStatusOptionsLoadPromise = null;
let csStatusStorageListener = null;

function readCsStatusStorage() {
  const custom = new Set();
  const deleted = new Set();
  try {
    const rawCustom = JSON.parse(localStorage.getItem(CANDIDATES_CS_STATUS_STORAGE_KEY) || '[]');
    if (Array.isArray(rawCustom)) {
      rawCustom.forEach(v => { if (v) custom.add(String(v).trim()); });
    }
  } catch (err) { console.warn('CSステータス(custom)読み込み失敗', err); }

  try {
    const rawDeleted = JSON.parse(localStorage.getItem(CANDIDATES_CS_STATUS_DELETED_KEY) || '[]');
    if (Array.isArray(rawDeleted)) {
      rawDeleted.forEach(v => { if (v) deleted.add(String(v).trim()); });
    }
  } catch (err) { console.warn('CSステータス(deleted)読み込み失敗', err); }

  return { custom, deleted };
}

function syncCsStatusManageStateFromStorage() {
  const { custom, deleted } = readCsStatusStorage();
  customCsStatusOptions.clear();
  deletedDefaultCsStatuses.clear();
  custom.forEach((value) => {
    const normalized = normalizeCsStatusOption(value);
    if (normalized) customCsStatusOptions.add(normalized);
  });
  deleted.forEach((value) => {
    const normalized = normalizeCsStatusOption(value);
    if (normalized) deletedDefaultCsStatuses.add(normalized);
  });
}

async function fetchCsStatusOptionsFromApi() {
  try {
    const res = await fetch(`${PRIMARY_API_BASE}/system-options?key=${encodeURIComponent(CANDIDATES_CS_STATUS_SYSTEM_KEY)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const options = data?.item || data?.options || {};
    const custom = Array.isArray(options.custom) ? options.custom : [];
    const deleted = Array.isArray(options.deleted) ? options.deleted : [];

    customCsStatusOptions.clear();
    deletedDefaultCsStatuses.clear();
    custom.forEach((value) => {
      const normalized = normalizeCsStatusOption(value);
      if (normalized) customCsStatusOptions.add(normalized);
    });
    deleted.forEach((value) => {
      const normalized = normalizeCsStatusOption(value);
      if (normalized) deletedDefaultCsStatuses.add(normalized);
    });

    saveCsStatusManageState();
    refreshAllCsStatusSelects();
    renderCsStatusManageList();
  } catch (err) {
    console.error('CSステータスのAPI取得に失敗しました', err);
  }
}

function ensureCsStatusOptionsLoaded({ force = false } = {}) {
  if (force) csStatusOptionsLoadPromise = null;
  if (csStatusOptionsLoadPromise) return csStatusOptionsLoadPromise;
  csStatusOptionsLoadPromise = fetchCsStatusOptionsFromApi()
    .catch((err) => {
      console.error('CSステータス取得エラー:', err);
    });
  return csStatusOptionsLoadPromise;
}

async function persistCsStatusManageStateToApi() {
  try {
    const payload = {
      key: CANDIDATES_CS_STATUS_SYSTEM_KEY,
      options: {
        custom: Array.from(customCsStatusOptions),
        deleted: Array.from(deletedDefaultCsStatuses)
      }
    };
    const res = await fetch(`${PRIMARY_API_BASE}/system-options`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error('CSステータスのAPI登録に失敗しました', err);
  }
}

function rememberCsStatusOption(value, { allowRestore = false } = {}) {
  const normalized = normalizeCsStatusOption(value);
  if (!normalized) return "";

  const { custom, deleted } = readCsStatusStorage();

  // 削除済みを自動復元しない（ユーザーの明示操作のみ復元）
  if (deleted.has(normalized)) {
    if (!allowRestore) return normalized;
    deleted.delete(normalized);
    localStorage.setItem(CANDIDATES_CS_STATUS_DELETED_KEY, JSON.stringify(Array.from(deleted)));
  }

  if (!PREDEFINED_CS_STATUS_OPTIONS.includes(normalized)) {
    custom.add(normalized);
    localStorage.setItem(CANDIDATES_CS_STATUS_STORAGE_KEY, JSON.stringify(Array.from(custom)));
  }
  return normalized;
}

function buildCsStatusOptions(selectedValue = "") {
  const selected = normalizeCsStatusOption(selectedValue);
  const { custom, deleted } = readCsStatusStorage();
  const values = new Set();

  const append = (normalized) => {
    if (normalized && !deleted.has(normalized)) {
      values.add(normalized);
    }
  };

  // 1. デフォルトオプション
  PREDEFINED_CS_STATUS_OPTIONS.forEach(append);
  // 2. サーバーからの取得値
  (masterCsStatusOptions || []).forEach(append);
  // 3. localStorageのカスタム値
  custom.forEach(append);
  // 4. 現在の候補者のデータにある値
  (allCandidates || []).forEach((candidate) => {
    append(normalizeCsStatusOption(candidate?.csStatus ?? candidate?.cs_status));
  });

  const list = Array.from(values).sort((a, b) => a.localeCompare(b, "ja"));
  const options = [{ value: "", label: "未設定" }].concat(
    list.map((value) => ({ value, label: value }))
  );

  if (selected && !list.includes(selected) && !deleted.has(selected)) {
    options.push({ value: selected, label: selected });
  }

  // 削除済みだが現在値に使われているものは、選択肢に復活（表示のみ）
  if (selected && deleted.has(selected) && !list.includes(selected)) {
    options.push({ value: selected, label: `${selected} (削除済み)`, disabled: true });
  }

  return options.map((option) => ({
    ...option,
    selected: String(option.value) === String(selected),
  }));
}

// =========================
// 正規化
// =========================
function normalizeCandidate(candidate, { source = "detail" } = {}) {
  if (!candidate) return candidate;

  // --- 既存のプロパティマッピング ---
  // ★追加: 媒体情報のマッピング
  candidate.source = candidate.source ?? candidate.applyRouteText ?? "";
  candidate.csStatus = normalizeCsStatusOption(candidate.csStatus ?? candidate.cs_status ?? "");
  candidate.cs_status = candidate.csStatus;
  rememberCsStatusOption(candidate.csStatus);
  candidate.createdAt = candidate.createdAt ?? candidate.created_at ?? null;
  candidate.registeredAt =
    candidate.registeredAt ??
    candidate.registered_at ??
    candidate.registeredDate ??
    candidate.registered_date ??
    candidate.createdAt ??
    null;
  candidate.candidateName = candidate.candidateName ?? candidate.candidate_name ?? candidate.name ?? "";
  candidate.hasPastApplication =
    candidate.hasPastApplication ??
    candidate.has_past_application ??
    false;
  candidate.pastApplicationCount = Number(
    candidate.pastApplicationCount ??
    candidate.past_application_count ??
    0
  ) || 0;
  candidate.pastApplicationLatestAt =
    candidate.pastApplicationLatestAt ??
    candidate.past_application_latest_at ??
    null;
  candidate.validApplication =
    candidate.validApplication ??
    candidate.valid_application ??
    candidate.is_effective_application ??
    candidate.isEffective ??
    candidate.active_flag ??
    candidate.valid ??
    null;
  candidate.candidateKana = candidate.candidateKana ?? candidate.name_kana ?? "";
  candidate.birthday = candidate.birthday ?? candidate.birth_date ?? candidate.birthDate ?? null;
  candidate.age = candidate.age ?? candidate.ageText ?? candidate.age_value ?? null;
  candidate.gender = candidate.gender ?? "";
  candidate.nationality = candidate.nationality ?? candidate.nationality_text ?? candidate.nationality_code ?? "";
  candidate.japaneseLevel = candidate.japaneseLevel ?? candidate.japanese_level ?? candidate.jlpt_level ?? candidate.jlptLevel ?? "";
  candidate.education = candidate.education ?? candidate.final_education ?? "";
  candidate.employmentStatus = candidate.employmentStatus ?? candidate.employment_status ?? "";
  candidate.currentIncome = candidate.currentIncome ?? candidate.current_income ?? "";
  candidate.desiredIncome = candidate.desiredIncome ?? candidate.desired_income ?? "";
  candidate.firstInterviewNote =
    candidate.firstInterviewNote ??
    candidate.first_interview_note ??
    candidate.hearingMemo ??
    candidate.hearing?.memo ??
    candidate.memo ??
    "";
  candidate.hearingFreeMemo =
    candidate.hearingFreeMemo ??
    candidate.hearing_free_memo ??
    candidate.hearing?.freeMemo ??
    candidate.hearing?.free_memo ??
    "";
  candidate.careerMotivation = candidate.careerMotivation ?? candidate.career_motivation ?? "";
  candidate.careerReason = candidate.careerReason ?? candidate.career_reason ?? "";
  candidate.transferTiming = candidate.transferTiming ?? candidate.transfer_timing ?? "";
  candidate.otherProcessStatus = candidate.otherProcessStatus ?? candidate.desired_location ?? candidate.other_process_status ?? "";
  candidate.desiredLocation = candidate.desiredLocation ?? candidate.desired_location ?? candidate.otherProcessStatus ?? "";
  candidate.firstInterviewDate = candidate.firstInterviewDate ?? candidate.first_interview_date ?? null;
  candidate.interviewPreferredDate = candidate.interviewPreferredDate ?? candidate.interview_preferred_date ?? "";
  candidate.skills = candidate.skills ?? candidate.skills_text ?? "";
  candidate.personality = candidate.personality ?? candidate.personality_text ?? "";
  candidate.workExperience = candidate.workExperience ?? candidate.work_experience ?? candidate.work_experience_text ?? "";
  candidate.postalCode = candidate.postalCode ?? candidate.postal_code ?? "";
  candidate.addressPref = candidate.addressPref ?? candidate.address_pref ?? "";
  candidate.addressCity = candidate.addressCity ?? candidate.address_city ?? "";
  candidate.addressDetail = candidate.addressDetail ?? candidate.address_detail ?? "";
  candidate.address = candidate.address ?? [candidate.addressPref, candidate.addressCity, candidate.addressDetail]
    .filter(Boolean)
    .join("");
  candidate.contactPreferredTime = normalizeContactPreferredTime(
    candidate.contactPreferredTime ??
    candidate.contact_preferred_time ??
    candidate.contactTime ??
    candidate.contact_time
  );
  candidate.contactTime = candidate.contactPreferredTime;
  candidate.mandatoryInterviewItems = candidate.mandatoryInterviewItems ?? candidate.mandatory_interview_items ?? "";
  candidate.applyCompanyName = candidate.applyCompanyName ?? candidate.apply_company_name ?? "";
  candidate.companyName = candidate.companyName
    ?? candidate.company_name
    ?? candidate.clientName
    ?? candidate.client_name
    ?? candidate.company
    ?? candidate.applyCompany
    ?? "";
  candidate.applyJobName = candidate.applyJobName ?? candidate.apply_job_name ?? candidate.jobName ?? candidate.job_name ?? "";
  candidate.applyRouteText = candidate.applyRouteText ?? candidate.apply_route_text ?? candidate.source ?? "";
  candidate.jobName = candidate.jobName ?? candidate.job_name ?? candidate.applyJobName ?? "";
  candidate.applicationNote = candidate.applicationNote ?? candidate.application_note ?? candidate.remarks ?? "";
  candidate.remarks = candidate.remarks ?? candidate.applicationNote ?? candidate.application_note ?? "";
  candidate.desiredJobType = candidate.desiredJobType ?? candidate.desired_job_type ?? "";
  candidate.otherSelectionStatus = candidate.otherSelectionStatus ?? candidate.other_selection_status ?? "";
  candidate.attendanceConfirmed = candidate.attendanceConfirmed ?? candidate.first_interview_attended ?? null;
  candidate.advisorUserId = candidate.advisorUserId ?? candidate.advisor_user_id ?? null;
  candidate.csUserId =
    candidate.csUserId ??
    candidate.cs_user_id ??
    candidate.partnerUserId ??
    candidate.partner_user_id ??
    null;
  candidate.partnerUserId =
    candidate.partnerUserId ??
    candidate.partner_user_id ??
    candidate.csUserId ??
    candidate.cs_user_id ??
    null;

  // サーバー側で advisorName = partner_name, csName = cs_name とマッピングされている
  candidate.advisorName = candidate.advisorName ?? candidate.partner_name ?? "";
  candidate.csName =
    candidate.csName ??
    candidate.cs_name ??
    candidate.callerName ??
    candidate.caller_name ??
    "";
  candidate.partnerName = candidate.partnerName ?? candidate.partner_name ?? "";
  syncCandidateAssignees(candidate);

  // リスト表示時のスワップロジックは、サーバー側で正しいマッピングを行っているため削除
  // advisorNameは server.js で partner_name カラムからマッピングされている
  /*
  if (source === "list") {
    const listAdvisorName = candidate.advisorName;
    const listPartnerName = candidate.partnerName;
    const listAdvisorUserId = candidate.advisorUserId;
    const listPartnerUserId = candidate.partnerUserId;

    candidate.advisorName = listPartnerName;
    candidate.partnerName = listAdvisorName;
    candidate.advisorUserId = listPartnerUserId;
    candidate.partnerUserId = listAdvisorUserId;
  }
  */

  candidate.meetingPlans = Array.isArray(candidate.meetingPlans) ? candidate.meetingPlans : [];
  candidate.resumeDocuments = Array.isArray(candidate.resumeDocuments) ? candidate.resumeDocuments : [];

  candidate.selectionProgress = Array.isArray(candidate.selectionProgress) ? candidate.selectionProgress : [];
  candidate.selectionProgress = candidate.selectionProgress.map((row = {}) => ({
    ...row,
    id: row.id ?? row.applicationId ?? row.application_id ?? null,
    clientId: row.clientId ?? row.client_id ?? null,
    companyName: row.companyName ?? row.company_name ?? "",
    route: row.route ?? row.applyRoute ?? row.apply_route ?? row.mediaName ?? row.media_name ?? "",
    proposalDate: row.proposalDate ?? row.proposal_date ?? null,
    recommendationDate: row.recommendationDate ?? row.recommended_at ?? null,
    interviewSetupDate: row.interviewSetupDate ?? row.first_interview_set_at ?? null,
    interviewDate: row.interviewDate ?? row.first_interview_at ?? null,
    firstInterviewAdjustDate:
      row.firstInterviewAdjustDate ??
      row.firstInterviewSetAt ??
      row.first_interview_set_at ??
      row.interviewSetupDate ??
      null,
    firstInterviewDate:
      row.firstInterviewDate ??
      row.firstInterviewAt ??
      row.first_interview_at ??
      row.interviewDate ??
      null,
    secondInterviewSetupDate: row.secondInterviewSetupDate ?? row.second_interview_set_at ?? null,
    secondInterviewAdjustDate:
      row.secondInterviewAdjustDate ??
      row.secondInterviewSetAt ??
      row.second_interview_set_at ??
      row.secondInterviewSetupDate ??
      null,
    secondInterviewDate:
      row.secondInterviewDate ??
      row.secondInterviewAt ??
      row.second_interview_at ??
      null,
    finalInterviewAdjustDate:
      row.finalInterviewAdjustDate ??
      row.finalInterviewSetAt ??
      row.final_interview_set_at ??
      row.finalInterviewSetupDate ??
      null,
    finalInterviewDate:
      row.finalInterviewDate ??
      row.finalInterviewAt ??
      row.final_interview_at ??
      null,
    offerDate: row.offerDate ?? row.offer_date ?? null,
    acceptanceDate: row.acceptanceDate ?? row.offer_accept_date ?? null,
    onboardingDate: row.onboardingDate ?? row.join_date ?? null,
    preJoinDeclineDate:
      row.preJoinDeclineDate ??
      row.declinedDate ??
      row.pre_join_decline_at ??
      row.pre_join_withdraw_date ??
      null,
    declinedDate:
      row.declinedDate ??
      row.preJoinDeclineDate ??
      row.pre_join_decline_at ??
      row.pre_join_withdraw_date ??
      null,
    declinedReason:
      row.declinedReason ??
      row.declined_reason ??
      row.preJoinDeclineReason ??
      row.pre_join_withdraw_reason ??
      "",
    preJoinDeclineReason:
      row.preJoinDeclineReason ??
      row.declinedReason ??
      row.declined_reason ??
      row.pre_join_withdraw_reason ??
      "",
    postJoinQuitDate:
      row.postJoinQuitDate ??
      row.earlyTurnoverDate ??
      row.post_join_quit_at ??
      row.post_join_quit_date ??
      null,
    earlyTurnoverDate:
      row.earlyTurnoverDate ??
      row.postJoinQuitDate ??
      row.post_join_quit_at ??
      row.post_join_quit_date ??
      null,
    postJoinQuitReason:
      row.postJoinQuitReason ??
      row.earlyTurnoverReason ??
      row.early_turnover_reason ??
      row.post_join_quit_reason ??
      "",
    earlyTurnoverReason:
      row.earlyTurnoverReason ??
      row.early_turnover_reason ??
      row.postJoinQuitReason ??
      row.post_join_quit_reason ??
      "",
    closeExpectedDate: row.closeExpectedDate ?? row.close_expected_at ?? row.closing_plan_date ?? null,
    closingForecastDate:
      row.closingForecastDate ??
      row.closingForecastAt ??
      row.closeExpectedDate ??
      row.closing_plan_date ??
      null,
    feeAmount: row.feeAmount ?? row.fee_amount ?? row.fee ?? "",
    selectionNote: row.selectionNote ?? row.selection_note ?? "",
    status: row.status ?? row.stage_current ?? "",
  }));

  if (!candidate.companyName && candidate.selectionProgress.length) {
    candidate.companyName = candidate.selectionProgress[0]?.companyName ?? "";
  }
  if (!candidate.applyCompanyName && candidate.companyName) {
    candidate.applyCompanyName = candidate.companyName;
  }
  if (!candidate.companyName && candidate.applyCompanyName) {
    candidate.companyName = candidate.applyCompanyName;
  }

  candidate.teleapoLogs = Array.isArray(candidate.teleapoLogs) ? candidate.teleapoLogs : [];

  candidate.moneyInfo = Array.isArray(candidate.moneyInfo) ? candidate.moneyInfo : [];
  candidate.moneyInfo = candidate.moneyInfo.map((row = {}) => ({
    ...row,
    applicationId: row.applicationId ?? row.application_id ?? null,
    clientId: row.clientId ?? row.client_id ?? null,
    companyName: row.companyName ?? row.company_name ?? "",
    feeAmount: row.feeAmount ?? row.fee_amount ?? "",
    refundAmount: row.refundAmount ?? row.refund_amount ?? "",
    orderDate: row.orderDate ?? row.order_date ?? null,
    withdrawDate: row.withdrawDate ?? row.withdraw_date ?? null,
    joinDate: row.joinDate ?? row.join_date ?? null,
    preJoinWithdrawDate: row.preJoinWithdrawDate ?? row.pre_join_withdraw_date ?? null,
    postJoinQuitDate: row.postJoinQuitDate ?? row.post_join_quit_date ?? null,
    orderReported: row.orderReported ?? row.order_reported ?? null,
    refundReported: row.refundReported ?? row.refund_reported ?? null,
  }));

  candidate.hearing = candidate.hearing || {};
  candidate.afterAcceptance = candidate.afterAcceptance || {};
  candidate.refundInfo = candidate.refundInfo || {};
  candidate.actionInfo = candidate.actionInfo || {};
  const nextActionFromDetail =
    candidate.detail?.actionInfo?.nextActionDate ??
    candidate.detail?.actionInfo?.next_action_date ??
    candidate.detail?.newActionDate ??
    candidate.detail?.new_action_date ??
    null;
  candidate.nextActionNote =
    candidate.nextActionNote ??
    candidate.next_action_note ??
    candidate.actionInfo?.nextActionNote ??
    candidate.actionInfo?.next_action_note ??
    candidate.detail?.actionInfo?.nextActionNote ??
    "";
  candidate.nextActionDate =
    candidate.nextActionDate ??
    candidate.next_action_date ??
    candidate.nextActionDateLegacy ??
    candidate.newActionDate ??
    candidate.actionInfo?.nextActionDate ??
    candidate.actionInfo?.next_action_date ??
    nextActionFromDetail ??
    null;
  if (candidate.nextActionDate === "") candidate.nextActionDate = null;
  const nextActionCacheKey = candidate.id != null ? String(candidate.id) : "";
  if (nextActionCacheKey) {
    if (candidate.nextActionDate) {
      nextActionCache.set(nextActionCacheKey, candidate.nextActionDate);
    } else if (source === "list" && nextActionCache.has(nextActionCacheKey)) {
      const cached = nextActionCache.get(nextActionCacheKey);
      if (cached) candidate.nextActionDate = cached;
    }
  }
  if (candidate.nextActionDate && !candidate.actionInfo.nextActionDate) {
    candidate.actionInfo.nextActionDate = candidate.nextActionDate;
  }
  const contactTimeCacheKey = candidate.id != null ? String(candidate.id) : "";
  if (contactTimeCacheKey) {
    if (candidate.contactPreferredTime) {
      contactPreferredTimeCache.set(contactTimeCacheKey, candidate.contactPreferredTime);
    } else if (contactPreferredTimeCache.has(contactTimeCacheKey)) {
      const cached = contactPreferredTimeCache.get(contactTimeCacheKey);
      if (cached) {
        candidate.contactPreferredTime = cached;
        candidate.contactTime = cached;
      }
    }
  }
  candidate.csChecklist = candidate.csChecklist || {};

  // --- ★ここから追加したロジック（returnの前に行うこと！） ---

  // API (isConnected, smsSentFlag, callCount) -> UI (phoneConnected, smsSent, callCount)
  candidate.phoneConnected = candidate.phoneConnected ?? candidate.isConnected ?? false;
  candidate.smsSent = candidate.smsSent ?? candidate.smsSentFlag ?? false;
  candidate.callCount = candidate.callCount ?? 0;

  // フェーズ自動判定ロジック(resolvePhaseDisplay)が参照する csSummary を補完
  candidate.csSummary = candidate.csSummary || {};
  candidate.csSummary.hasConnected = candidate.csSummary.hasConnected ?? candidate.phoneConnected;
  candidate.csSummary.hasSms = candidate.csSummary.hasSms ?? candidate.smsSent;
  candidate.csSummary.callCount = candidate.csSummary.callCount ?? candidate.callCount;

  // --- ★ここまで ---

  // ★追加: テレアポログのマッピング
  candidate.teleapoLogs = Array.isArray(candidate.teleapoLogs) ? candidate.teleapoLogs : [];
  candidate.csSummary = candidate.csSummary || {};

  // ★追加: ログからサマリを再計算 (サーバー側の集計漏れ対策)
  if (candidate.teleapoLogs.length > 0) {
    const logs = candidate.teleapoLogs;
    // 架電回数の最大値
    const maxCallNo = Math.max(...logs.map((l) => Number(l.callNo || 0)), 0);

    // 通電実績
    const connectedLogs = logs
      .filter((l) => l.result === "通電")
      .sort((a, b) => new Date(b.calledAt) - new Date(a.calledAt));
    const hasConnected = connectedLogs.length > 0;
    const lastConnectedAt = hasConnected ? connectedLogs[0].calledAt : null;

    // サーバー値より計算値を優先（または補完）
    if (maxCallNo > (Number(candidate.csSummary.callCount) || 0)) {
      candidate.csSummary.callCount = maxCallNo;
    }
    if (hasConnected) {
      candidate.csSummary.hasConnected = true;
      if (lastConnectedAt) candidate.csSummary.lastConnectedAt = lastConnectedAt;
    }
  }

  return candidate;
}

function updateMastersFromDetail(detail) {
  const masters = detail?.masters;
  if (!masters) return;
  if (Array.isArray(masters.clients)) masterClients = masters.clients;
  if (Array.isArray(masters.csStatuses)) {
    masterCsStatusOptions = buildUniqueValues(masters.csStatuses);
    masterCsStatusOptions.forEach((status) => rememberCsStatusOption(status));
  }
  if (Array.isArray(masters.users)) {
    masterUsers = masters.users;
    masterCsUsers = Array.isArray(masters.csUsers) ? masters.csUsers : [];
    masterAdvisorUsers = Array.isArray(masters.advisorUsers) ? masters.advisorUsers : [];
    allCandidates.forEach((candidate) => syncCandidateAssignees(candidate));
    filteredCandidates.forEach((candidate) => syncCandidateAssignees(candidate));
  }
}

function resolveUserName(userId) {
  if (!userId) return "";
  const found = (masterUsers || []).find((user) => String(user.id) === String(userId));
  return found?.name ?? "";
}

function resolveUserIdByName(userName) {
  const text = String(userName || "").trim();
  if (!text) return null;
  const candidates = (masterUsers || []).filter(
    (user) => String(user?.name || "").trim() === text
  );
  if (candidates.length !== 1) return null;
  return candidates[0]?.id ?? null;
}

function syncCandidateAssignees(candidate) {
  if (!candidate) return;

  if (!candidate.csUserId) {
    candidate.csUserId = resolveUserIdByName(candidate.csName);
  }
  if (!candidate.advisorUserId) {
    candidate.advisorUserId = resolveUserIdByName(candidate.advisorName);
  }
  if (!candidate.partnerUserId && candidate.csUserId) {
    candidate.partnerUserId = candidate.csUserId;
  }

  if (candidate.csUserId) {
    const resolved = resolveUserName(candidate.csUserId);
    if (resolved) {
      candidate.csName = resolved;
    }
  }
  if (candidate.advisorUserId) {
    const resolved = resolveUserName(candidate.advisorUserId);
    if (resolved) {
      candidate.advisorName = resolved;
      candidate.partnerName = resolved;
    }
  }
}

function resolveClientName(clientId) {
  if (!clientId) return "";
  const found = (masterClients || []).find((client) => String(client.id) === String(clientId));
  return found?.name ?? "";
}

function normalizeClientNameKey(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function findClientByName(name) {
  const key = normalizeClientNameKey(name);
  if (!key) return null;

  const lists = [];
  if (Array.isArray(clientList) && clientList.length) lists.push(clientList);
  if (Array.isArray(masterClients) && masterClients.length) lists.push(masterClients);

  for (const list of lists) {
    const found = list.find((client) => {
      const clientName = client?.name ?? client?.companyName ?? client?.company_name ?? "";
      return normalizeClientNameKey(clientName) === key;
    });
    if (found?.id) return found;
  }
  return null;
}

async function fetchClientIdByNameFromApi(name) {
  const rawName = String(name ?? "").trim();
  if (!rawName) return null;
  try {
    const res = await fetch(`${CANDIDATES_API_BASE}/clients?name=${encodeURIComponent(rawName)}`);
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    // Merge into clientList for later lookups
    results.forEach((item) => {
      const id = item?.id ?? item?.ID;
      const nameVal = item?.name ?? item?.companyName ?? item?.company_name;
      if (!id || !nameVal) return;
      const exists = clientList.some((c) => String(c.id) === String(id));
      if (!exists) clientList.push({ id, name: nameVal });
    });

    const key = normalizeClientNameKey(rawName);
    const exact = results.find((item) => {
      const n = item?.name ?? item?.companyName ?? item?.company_name ?? "";
      return normalizeClientNameKey(n) === key;
    });
    if (exact?.id) return exact.id;

    if (results.length === 1 && results[0]?.id) return results[0].id;
  } catch (err) {
    console.warn("fetchClientIdByNameFromApi failed:", err);
  }
  return null;
}

function findClientById(id) {
  if (id === null || id === undefined || id === "") return null;
  const needle = String(id);

  const lists = [];
  if (Array.isArray(clientList) && clientList.length) lists.push(clientList);
  if (Array.isArray(masterClients) && masterClients.length) lists.push(masterClients);

  for (const list of lists) {
    const found = list.find((client) => String(client?.id) === needle);
    if (found?.id) return found;
  }
  return null;
}

async function ensureClientIdByName(name) {
  const rawName = String(name ?? "").trim();
  if (!rawName) return null;

  const existing = findClientByName(rawName);
  if (existing?.id) return existing.id;

  const apiResolved = await fetchClientIdByNameFromApi(rawName);
  if (apiResolved) return apiResolved;

  const key = normalizeClientNameKey(rawName);
  if (!key) return null;

  if (clientCreateInFlight.has(key)) {
    return clientCreateInFlight.get(key);
  }

  const createPromise = (async () => {
    const res = await fetch(candidatesApi("/clients"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ companyName: rawName }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`clients create failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    const json = await res.json().catch(() => ({}));
    const id = json?.id ?? json?.item?.id ?? json?.item?.clientId ?? json?.item?.client_id ?? null;
    const createdName = json?.item?.name ?? json?.item?.companyName ?? rawName;

    if (!id) {
      throw new Error("clients create returned no id");
    }

    if (Array.isArray(clientList)) {
      const exists = clientList.some((c) => String(c?.id) === String(id));
      if (!exists) clientList.push({ id, name: createdName });
    }

    return id;
  })();

  clientCreateInFlight.set(key, createPromise);
  try {
    return await createPromise;
  } finally {
    clientCreateInFlight.delete(key);
  }
}

async function ensureSelectionProgressClientIds(candidate) {
  if (!candidate || !Array.isArray(candidate.selectionProgress)) return;

  for (const row of candidate.selectionProgress) {
    const companyName = String(row?.companyName ?? row?.company_name ?? "").trim();
    const clientId = row?.clientId ?? row?.client_id ?? null;

    // If we have no company name, we cannot resolve. Keep clientId if present.
    if (!companyName) continue;

    // Backend (Lambda) requires clientId to INSERT new rows.
    // For existing rows, keep clientId unless we can confidently detect a name change.
    let resolvedId = null;
    if (clientId) {
      const current = findClientById(clientId);
      const currentName = current?.name ?? current?.companyName ?? current?.company_name ?? "";
      if (currentName && normalizeClientNameKey(currentName) === normalizeClientNameKey(companyName)) {
        resolvedId = clientId;
      } else if (current) {
        // Name differs from the current clientId mapping; treat companyName as authoritative.
        resolvedId = await ensureClientIdByName(companyName);
      } else {
        // Client list not loaded or missing this id: do not risk auto-creating duplicates.
        resolvedId = clientId;
      }
    } else {
      resolvedId = await ensureClientIdByName(companyName);
    }

    if (!resolvedId) {
      throw new Error(`企業名「${companyName}」に対応する企業ID(clientId)を解決できませんでした。`);
    }

    // Set both camelCase and snake_case to satisfy different backends.
    row.clientId = resolvedId;
    row.client_id = resolvedId;

    // Keep company name fields consistent for downstream mappers.
    row.companyName = companyName;
    row.company_name = companyName;
  }
}

function normalizeMoneyNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const MONEY_MAN_UNIT = 10000;

function convertManToYen(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * MONEY_MAN_UNIT);
}

function normalizeMoneyValueToYen(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const parsed = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(parsed) >= MONEY_MAN_UNIT ? parsed : Math.round(parsed * MONEY_MAN_UNIT);
}

function formatMoneyInputToMan(value) {
  if (value === "" || value === null || value === undefined) return "";
  const parsed = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return value;
  if (Math.abs(parsed) >= MONEY_MAN_UNIT) {
    const man = parsed / MONEY_MAN_UNIT;
    const rounded = Math.round(man * 100) / 100;
    return String(rounded);
  }
  return String(parsed);
}

function isMoneyInputField(fieldPath, sectionKey) {
  if (!fieldPath) return false;
  const key = fieldPath.split(".").slice(-1)[0];
  if (sectionKey === "money") return key === "feeAmount" || key === "refundAmount";
  if (sectionKey === "selection") return key === "fee";
  return false;
}

function normalizeMoneyInputValue(value, fieldPath, sectionKey) {
  if (!isMoneyInputField(fieldPath, sectionKey)) return value;
  return convertManToYen(value);
}

function normalizeMoneyBoolean(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function syncMoneyInfoFromSelectionProgress(candidate) {
  if (!candidate || !Array.isArray(candidate.selectionProgress)) return;

  const existing = Array.isArray(candidate.moneyInfo) ? candidate.moneyInfo : [];
  const moneyByAppId = new Map();

  existing.forEach((row = {}) => {
    const appId = row.applicationId ?? row.application_id;
    if (appId === null || appId === undefined || appId === "") return;
    moneyByAppId.set(String(appId), { ...row });
  });

  candidate.selectionProgress.forEach((row = {}) => {
    const appId = row.id ?? row.applicationId ?? row.application_id;
    if (appId === null || appId === undefined || appId === "") return;

    const key = String(appId);
    const prev = moneyByAppId.get(key) || { applicationId: appId };
    const next = { ...prev };

    const clientId = row.clientId ?? row.client_id ?? prev.clientId ?? prev.client_id ?? null;
    const companyName = row.companyName ?? row.company_name ?? prev.companyName ?? prev.company_name ?? "";

    next.applicationId = prev.applicationId ?? appId;
    next.application_id = prev.application_id ?? appId;
    next.clientId = clientId;
    next.client_id = clientId;
    next.companyName = companyName;
    next.company_name = companyName;

    if (hasOwn(row, "feeAmount") || hasOwn(row, "fee_amount") || hasOwn(row, "fee")) {
      const feeAmount = normalizeMoneyNumber(row.feeAmount ?? row.fee_amount ?? row.fee);
      next.feeAmount = feeAmount;
      next.fee_amount = feeAmount;
    }

    if (hasOwn(row, "refundAmount") || hasOwn(row, "refund_amount")) {
      const refundAmount = normalizeMoneyNumber(row.refundAmount ?? row.refund_amount);
      next.refundAmount = refundAmount;
      next.refund_amount = refundAmount;
    }

    if (hasOwn(row, "orderDate") || hasOwn(row, "order_date")) {
      const orderDate = row.orderDate ?? row.order_date ?? null;
      next.orderDate = orderDate;
      next.order_date = orderDate;
    }

    if (hasOwn(row, "withdrawDate") || hasOwn(row, "withdraw_date")) {
      const withdrawDate = row.withdrawDate ?? row.withdraw_date ?? null;
      next.withdrawDate = withdrawDate;
      next.withdraw_date = withdrawDate;
    }

    if (hasOwn(row, "orderReported") || hasOwn(row, "order_reported")) {
      const orderReported = normalizeMoneyBoolean(row.orderReported ?? row.order_reported);
      next.orderReported = orderReported;
      next.order_reported = orderReported;
    }

    if (hasOwn(row, "refundReported") || hasOwn(row, "refund_reported")) {
      const refundReported = normalizeMoneyBoolean(row.refundReported ?? row.refund_reported);
      next.refundReported = refundReported;
      next.refund_reported = refundReported;
    }

    if (hasOwn(row, "preJoinWithdrawDate") || hasOwn(row, "pre_join_withdraw_date") || hasOwn(row, "preJoinDeclineDate")) {
      const preJoinWithdrawDate = row.preJoinWithdrawDate ?? row.pre_join_withdraw_date ?? row.preJoinDeclineDate ?? null;
      next.preJoinWithdrawDate = preJoinWithdrawDate;
      next.pre_join_withdraw_date = preJoinWithdrawDate;
    }

    if (hasOwn(row, "postJoinQuitDate") || hasOwn(row, "post_join_quit_date")) {
      const postJoinQuitDate = row.postJoinQuitDate ?? row.post_join_quit_date ?? null;
      next.postJoinQuitDate = postJoinQuitDate;
      next.post_join_quit_date = postJoinQuitDate;
    }

    moneyByAppId.set(key, next);
  });

  candidate.moneyInfo = Array.from(moneyByAppId.values());
}

function buildSelectOptions(list, selectedValue, { blankLabel = "選択" } = {}) {
  const base = Array.isArray(list) ? list : [];
  const options = [{ value: "", label: blankLabel }].concat(
    base.map((item) => ({
      value: item.id ?? item.value ?? "",
      label: item.name ?? item.label ?? "",
      disabled: Boolean(item?.disabled),
    }))
  );
  return options.map((option) => ({
    value: option.value,
    label: option.label,
    disabled: option.disabled,
    selected: String(option.value) === String(selectedValue ?? ""),
  }));
}

function buildClientOptions(selectedId, selectedName) {
  if (Array.isArray(masterClients) && masterClients.length > 0) {
    return buildSelectOptions(masterClients, selectedId, { blankLabel: "企業を選択" });
  }
  const fallback = selectedId ? [{ id: selectedId, name: selectedName || "-" }] : [];
  return buildSelectOptions(fallback, selectedId, { blankLabel: "企業を選択" });
}

function normalizeRoleValue(role) {
  return String(role || "").trim().toLowerCase();
}

function buildUserOptions(selectedId, selectedName = "", { allowedRoles = null, blankLabel = "担当者を選択", sourceList = null } = {}) {
  let users = Array.isArray(sourceList) ? [...sourceList] : (Array.isArray(masterUsers) ? [...masterUsers] : []);
  const allow = Array.isArray(allowedRoles) ? allowedRoles.map((r) => normalizeRoleValue(r)).filter(Boolean) : null;
  if (allow && allow.length > 0) {
    users = users.filter((user) => allow.includes(normalizeRoleValue(user?.role)));
  }
  if (selectedId && !users.some((user) => String(user.id) === String(selectedId))) {
    // Show current value even if it is not selectable (role mismatch, deleted user, etc.).
    users.push({
      id: selectedId,
      name: selectedName ? `${selectedName} (選択不可)` : String(selectedId),
      disabled: true,
    });
  }
  return buildSelectOptions(users, selectedId, { blankLabel });
}

function buildBooleanOptions(value, { trueLabel = "報告済み", falseLabel = "未報告", blankLabel = "-" } = {}) {
  const options = [
    { value: "", label: blankLabel },
    { value: "true", label: trueLabel },
    { value: "false", label: falseLabel },
  ];
  return options.map((option) => ({
    ...option,
    selected: String(option.value) === String(value ?? ""),
  }));
}

// =========================
// マウント / アンマウント
// =========================
export function mount() {
  loadCsStatusManageState(); // ローカルストレージから削除済みステータス等を復元
  void ensureCsStatusOptionsLoaded({ force: true }); // 架電管理の最新CSステータスを取得（強制更新）

  if (!csStatusStorageListener) {
    csStatusStorageListener = (event) => {
      if (!event || !event.key) return;
      if (![CANDIDATES_CS_STATUS_STORAGE_KEY, CANDIDATES_CS_STATUS_DELETED_KEY].includes(event.key)) return;
      syncCsStatusManageStateFromStorage();
      refreshAllCsStatusSelects();
      renderCsStatusManageList();
    };
    window.addEventListener("storage", csStatusStorageListener);
  }

  initializeCandidatesFilters();
  initializeSearchableDropdowns();
  initializeSortControl();
  initializeTableInteraction();
  initializePaginationControls();
  initializeCandidatesTabs();
  initializeDetailModal();
  initializeDetailContentListeners();

  openedFromUrlOnce = false;
  void loadScreeningRulesForCandidates({ force: true });
  restoreListContextFromReturnState();
  void loadFilterMasters();
  // まず一覧ロード（ページング）
  loadCandidatesData();
  // 初期表示がカレンダーの場合は、カレンダーも別ロード
  if (isCandidatesTabActive("calendar")) {
    void loadCandidatesCalendarData();
  }
}

export function unmount() {
  cleanupCandidatesEventListeners();
}

// =========================
// 詳細ページ用マウント（別ページで表示する場合）
// =========================
export async function mountDetailPage(candidateId) {
  if (!candidateId) {
    console.error("候補者IDが指定されていません");
    return false;
  }

  // イベントリスナー初期化
  initializeDetailContentListeners();

  // 候補者データを取得して表示
  try {
    await loadScreeningRulesForCandidates({ force: true });
    const detail = await fetchCandidateDetailById(String(candidateId), { includeMaster: true });
    if (!detail) {
      setCandidateDetailLoading("候補者データが見つかりません。");
      return false;
    }

    const normalized = normalizeCandidate(detail, { source: "detail" });
    refreshCandidateValidity(normalized);
    updateMastersFromDetail(detail);

    // 正規化した候補者をグローバルリストにも追加（編集時に必要）
    const existingIndex = allCandidates.findIndex(c => String(c.id) === String(normalized.id));
    if (existingIndex >= 0) {
      allCandidates[existingIndex] = { ...allCandidates[existingIndex], ...normalized };
    } else {
      allCandidates.push(normalized);
    }

    selectedCandidateId = String(normalized.id);
    renderCandidateDetail(normalized, { preserveEditState: false });
    return true;
  } catch (error) {
    console.error("候補者データの取得に失敗:", error);
    setCandidateDetailLoading("データの取得に失敗しました。");
    return false;
  }
}

export function unmountDetailPage() {
  detailSectionKeys.forEach((key) => (detailEditState[key] = false));
  selectedCandidateId = null;
  currentDetailCandidateId = null;
}

// =========================
// 初期化
// =========================
function initializeCandidatesFilters() {
  filterConfig.forEach(({ id, event }) => {
    const element = document.getElementById(id);
    if (element) element.addEventListener(event, handleFilterChange);
  });

  const resetButton = document.getElementById("candidatesFilterReset");
  if (resetButton) resetButton.addEventListener("click", handleFilterReset);

  // フェーズフィルターの初期化（一覧の内容に合わせて後で更新）
  setFilterSelectOptions("candidatesFilterPhase", []);

  // CSステータスフィルターの初期化（保存済み/削除済みを反映）
  refreshAllCsStatusSelects();
}

/**
 * 検索機能付きプルダウン（求職者名、応募企業名）の初期化
 */
function initializeSearchableDropdowns() {
  // 1. 求職者名 (既にInputなのでDropdown機能を追加)
  setupSearchableDropdown(
    "candidatesFilterName",
    "candidatesFilterNameDropdown",
    null,
    () => {
      // 現在ロードされている候補者から名前を抽出してサジェスト
      const names = Array.from(new Set(allCandidates.map(c => c.candidateName).filter(Boolean)));
      return names.sort((a, b) => a.localeCompare(b, "ja"));
    }
  );

  // 2. 応募企業名 (Hidden Select と連動する Input)
  setupSearchableDropdown(
    "candidatesFilterCompanySearch",
    "candidatesFilterCompanyDropdown",
    "candidatesFilterCompany",
    () => {
      // masterから取得された企業リスト
      const select = document.getElementById("candidatesFilterCompany");
      if (!select) return [];
      return Array.from(select.options)
        .map(opt => ({ value: opt.value, label: opt.textContent }))
        .filter(opt => opt.value !== "" && opt.value !== "すべて"); // 「すべて」は除外
    }
  );

  // 3. CSステータス (Hidden Select と連動する Input)
  setupSearchableDropdown(
    "candidatesFilterCsStatusSearch",
    "candidatesFilterCsStatusDropdown",
    "candidatesFilterCsStatus",
    () => {
      const select = document.getElementById("candidatesFilterCsStatus");
      if (!select) return [];
      return Array.from(select.options)
        .map(opt => ({ value: opt.value, label: opt.textContent }))
        .filter(opt => opt.value !== "" && opt.value !== "すべて");
    }
  );
}

/**
 * 検索機能付きプルダウンのコアロジック
 */
function setupSearchableDropdown(inputId, dropdownId, hiddenId, getOptionsFn) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const hiddenSelect = hiddenId ? document.getElementById(hiddenId) : null;

  if (!input || !dropdown) return;

  const showDropdown = () => {
    const options = getOptionsFn();
    const query = input.value.trim().toLowerCase();

    // フィルタリング
    const filtered = options.filter(opt => {
      const label = typeof opt === "string" ? opt : opt.label;
      return label.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      if (!query) {
        dropdown.classList.add("hidden");
        return;
      }
      dropdown.innerHTML = `<div class="searchable-dropdown-empty">一致する候補がありません</div>`;
    } else {
      dropdown.innerHTML = filtered.map(opt => {
        const value = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        const isActive = hiddenSelect && String(hiddenSelect.value) === String(value) ? "is-active" : "";
        return `<div class="searchable-dropdown-item ${isActive}" data-value="${escapeHtmlAttr(String(value))}">${escapeHtml(label)}</div>`;
      }).join("");
    }

    dropdown.classList.remove("hidden");
  };

  const hideDropdown = () => {
    // クリックイベントが先に発火するように少し遅延させる
    setTimeout(() => {
      dropdown.classList.add("hidden");
    }, 200);
  };

  input.addEventListener("focus", showDropdown);
  input.addEventListener("input", showDropdown);
  input.addEventListener("blur", hideDropdown);

  dropdown.addEventListener("click", (e) => {
    const item = e.target.closest(".searchable-dropdown-item");
    if (!item) return;

    const value = item.dataset.value;
    const label = item.textContent;

    input.value = label;
    if (hiddenSelect) {
      hiddenSelect.value = value;
      // 既存の change イベントを手動で発火
      hiddenSelect.dispatchEvent(new Event("change"));
    } else {
      // hiddenSelectがない場合はinput自体のイベントを発火
      input.dispatchEvent(new Event("input"));
    }
    dropdown.classList.add("hidden");
  });
}

function buildSelectionCompanyOptions(candidate) {
  const nameSet = new Set();
  clientList.forEach((item) => {
    if (item?.name) nameSet.add(item.name);
  });
  if (candidate?.applyCompanyName) nameSet.add(candidate.applyCompanyName);
  if (candidate?.companyName) nameSet.add(candidate.companyName);
  (candidate?.selectionProgress || []).forEach((row) => {
    if (row?.companyName) nameSet.add(row.companyName);
  });
  return Array.from(nameSet).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja"));
}

function initializeSelectionCompanyDropdowns(candidate) {
  const container = getCandidateDetailContainer();
  if (!container) return;
  const inputs = container.querySelectorAll('[data-selection-company-input="true"]');
  if (!inputs.length) return;
  const optionsFn = () => buildSelectionCompanyOptions(candidate);
  inputs.forEach((input) => {
    const dropdownId = input.dataset.dropdownId;
    if (!dropdownId || !input.id) return;
    setupSearchableDropdown(input.id, dropdownId, null, optionsFn);
  });
}

async function loadFilterMasters() {
  // Best-effort: on AWS, `/candidates?view=masters` returns facet lists.
  // On local server implementations this might 404; ignore in that case.
  try {
    const url = candidatesApi(`${CANDIDATES_LIST_PATH}?view=masters`);
    const res = await fetch(url);
    if (!res.ok) return;
    const json = await res.json();
    if (!json || typeof json !== "object") return;

    const sources = Array.isArray(json.sources) ? json.sources : [];
    const companies = Array.isArray(json.companies) ? json.companies : [];
    const advisors = Array.isArray(json.advisors) ? json.advisors : [];
    const phases = Array.isArray(json.phases) ? json.phases : [];
    const csStatuses = Array.isArray(json.csStatuses) ? json.csStatuses : [];

    if (sources.length) setFilterSelectOptions("candidatesFilterSource", sources);
    if (companies.length) setFilterSelectOptions("candidatesFilterCompany", companies);
    const facetsCsUsers = Array.isArray(json.csUsers) ? json.csUsers : [];

    let masterDataUsers = Array.isArray(json.users) ? json.users : null;

    if (!masterDataUsers) {
      try {
        const listRes = await fetch(candidatesApi(`${CANDIDATES_LIST_PATH}?limit=1`));
        if (listRes.ok) {
          const listJson = await listRes.json();
          if (listJson.items && listJson.items.length > 0) {
            const sampleId = listJson.items[0].id;
            const detailRes = await fetch(candidatesApi(`${CANDIDATES_LIST_PATH}/${sampleId}?includeMaster=true`));
            if (detailRes.ok) {
              const detailJson = await detailRes.json();
              if (detailJson && detailJson.masters && Array.isArray(detailJson.masters.users)) {
                masterDataUsers = detailJson.masters.users;
              }
            }
          }
        }
      } catch (e) {
        console.warn("Fallback master user fetch failed:", e);
      }
    }

    if (Array.isArray(masterDataUsers)) {
      masterUsers = masterDataUsers;
      const filteredAdvisors = masterDataUsers.filter(u => u.role === 'advisor' && u.active !== false).map(u => u.name);
      const filteredCsUsers = masterDataUsers.filter(u => u.role === 'caller' && u.active !== false).map(u => u.name);
      if (filteredAdvisors.length) setFilterSelectOptions("candidatesFilterAdvisor", filteredAdvisors);
      if (filteredCsUsers.length) setFilterSelectOptions("candidatesFilterCs", filteredCsUsers);
    } else {
      if (advisors.length) {
        setFilterSelectOptions("candidatesFilterAdvisor", advisors);
      }
      if (facetsCsUsers.length || advisors.length) {
        setFilterSelectOptions("candidatesFilterCs", facetsCsUsers.length ? facetsCsUsers : advisors);
      }
    }
    if (csStatuses.length) {
      masterCsStatusOptions = buildUniqueValues(csStatuses);
      masterCsStatusOptions.forEach((status) => rememberCsStatusOption(status));
    }
    // 事前定義オプションを常に追加する
    PREDEFINED_CS_STATUS_OPTIONS.forEach((status) => rememberCsStatusOption(status));
    refreshAllCsStatusSelects();

    // フェーズは一覧の内容に合わせて更新するため、ここでは設定しない
  } catch (e) {
    // ignore
  }
}

function initializeSortControl() {
  const sortSelect = document.getElementById("candidatesSortOrder");
  if (!sortSelect) return;
  // Server-side paging uses a fixed order (created_at DESC). Disable client sorting UI.
  sortSelect.value = "desc";
  sortSelect.disabled = true;
  const label = sortSelect.closest("label");
  if (label) label.classList.add("hidden");
}

function initializeTableInteraction() {
  const tableBody = document.getElementById("candidatesTableBody");
  if (tableBody) {
    tableBody.addEventListener("click", handleTableClick);
    // ダブルクリック・ダブルタップでのCSステータス編集は廃止
    tableBody.addEventListener("input", handleInlineEdit);
    tableBody.addEventListener("change", handleInlineEdit);
  }

  const tableHead = document.querySelector(".candidates-table-card thead");
  if (tableHead) {
    tableHead.addEventListener("click", handleCandidatesHeaderClick);
  }

  const toggleButton = document.getElementById("candidatesToggleEdit");
  if (toggleButton) toggleButton.addEventListener("click", toggleCandidatesEditMode);

  ensureNextActionColumnPriority();
  updateHeaderSortStyles();
}

function initializePaginationControls() {
  const prevBtn = document.getElementById("candidatesPagePrev");
  const nextBtn = document.getElementById("candidatesPageNext");
  if (prevBtn) prevBtn.addEventListener("click", () => gotoCandidatesPage(listPage - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => gotoCandidatesPage(listPage + 1));
}

function initializeCandidatesTabs() {
  const tabButtons = document.querySelectorAll("[data-candidates-tab]");
  tabButtons.forEach((button) => {
    button.addEventListener("click", handleCandidatesTabClick);
  });

  const calendarNavButtons = document.querySelectorAll("[data-calendar-nav]");
  calendarNavButtons.forEach((button) => {
    button.addEventListener("click", handleCalendarNavClick);
  });

  const calendarBody = document.getElementById("candidatesCalendarBody");
  if (calendarBody) {
    calendarBody.addEventListener("click", handleCalendarEventClick);
  }

  const restoredTab = getReturnTabFromDetail() || "calendar";
  setCandidatesActiveTab(restoredTab);
}

function isCandidatesTabActive(tabKey) {
  return Boolean(document.querySelector(`[data-candidates-tab].is-active[data-candidates-tab="${CSS.escape(String(tabKey))}"]`));
}

// =========================
// 一覧取得（RDS連携）
// =========================
async function loadCandidatesData(filtersOverride = {}) {
  const filters = { ...collectFilters(), ...filtersOverride };
  const offset = Math.max(0, (listPage - 1) * LIST_PAGE_SIZE);
  const queryString = buildCandidatesQuery(filters, { limit: LIST_PAGE_SIZE, offset });

  try {
    const url = queryString
      ? candidatesApi(`${CANDIDATES_LIST_PATH}?${queryString}`)   // /candidates/?...
      : candidatesApi(`${CANDIDATES_LIST_PATH}`);                // /candidates/

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();

    // 一覧再取得時は詳細由来の有効応募キャッシュを一旦クリアして、
    // 画面ごとに最新データで再評価する。
    validityHydrationCache.clear();

    allCandidates = Array.isArray(result.items)
      ? result.items.map((item) => normalizeCandidate({ ...item, id: String(item.id) }, { source: "list" }))
      : [];

    if (screeningRules) {
      allCandidates.forEach((candidate) => {
        candidate.validApplicationComputed = computeValidApplication(candidate, screeningRules);
      });
    }
    // Server-side filtering/paging: keep current page as-is, but allow local sort.
    const phaseFiltered = filters.phase
      ? applyCandidatesFilters(allCandidates, { phase: filters.phase })
      : allCandidates;
    filteredCandidates = sortCandidates(phaseFiltered.slice(), currentSortKey, currentSortOrder);
    updatePhaseFilterOptionsFromList(filteredCandidates);
    pendingInlineUpdates = {};

    renderCandidatesTable(filteredCandidates);
    updateHeaderSortStyles();
    const totalCount = filters.phase
      ? filteredCandidates.length
      : Number(result.total ?? filteredCandidates.length ?? 0);
    listTotal = totalCount;
    updateCandidatesCount(totalCount);
    renderCandidatesPagination({ total: totalCount, page: listPage, pageSize: LIST_PAGE_SIZE, count: filteredCandidates.length });
    if (screeningRules) {
      void hydrateValidApplicationsFromDetail(filteredCandidates);
    }

    lastSyncedAt = result.lastSyncedAt || null;
    updateLastSyncedDisplay(lastSyncedAt);

    refreshSelectionState();
    closeCandidateModal({ clearSelection: true, force: true });

    restoreScrollToCandidate();

    const { candidateIdFromUrl, shouldAutoOpenDetail } = getCandidateUrlParams();
    // ★ teleapo → candidates で ?candidateId= が来ている場合の自動詳細は明示時のみ
    if (AUTO_OPEN_DETAIL_FROM_URL && !openedFromUrlOnce && candidateIdFromUrl && shouldAutoOpenDetail) {
      openedFromUrlOnce = true;
      try {
        await openCandidateById(candidateIdFromUrl);
      } catch (e) {
        console.error("open by url failed:", e);
      }
    }
  } catch (error) {
    console.error("候補者データの取得に失敗しました。", error);
    allCandidates = [];
    filteredCandidates = [];
    renderCandidatesTable([]);
    listTotal = 0;
    updateCandidatesCount(0);
    renderCandidatesPagination({ total: 0, page: 1, pageSize: LIST_PAGE_SIZE, count: 0 });
    updateLastSyncedDisplay(null);
  }
}

function renderCandidatesPagination({ total = 0, page = 1, pageSize = LIST_PAGE_SIZE, count = 0 } = {}) {
  const prevBtn = document.getElementById("candidatesPagePrev");
  const nextBtn = document.getElementById("candidatesPageNext");
  const info = document.getElementById("candidatesPageInfo");
  const bar = document.getElementById("candidatesPaginationBar");

  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min((safePage - 1) * pageSize + Math.max(0, count), total);

  if (info) info.textContent = total === 0 ? "-" : `${start}-${end}件 / 全${total}件（${safePage}/${totalPages}ページ）`;
  if (prevBtn) prevBtn.disabled = safePage <= 1;
  if (nextBtn) nextBtn.disabled = safePage >= totalPages;
  if (bar) bar.classList.toggle("hidden", total === 0);
}

function gotoCandidatesPage(nextPage) {
  const totalPages = listTotal > 0 ? Math.max(1, Math.ceil(listTotal / LIST_PAGE_SIZE)) : 1;
  const target = Math.min(Math.max(1, Number(nextPage) || 1), totalPages);
  if (target === listPage) return;
  listPage = target;
  loadCandidatesData();
}

const RETURN_STATE_KEY = "candidates.returnState";

function saveReturnState(candidateId) {
  try {
    const activeTab = document.querySelector("[data-candidates-tab].is-active")?.dataset?.candidatesTab || "list";
    const payload = {
      tab: activeTab,
      candidateId: String(candidateId || ""),
      page: listPage,
      filters: collectFilters(),
      calendarYear: calendarViewDate.getFullYear(),
      calendarMonth: calendarViewDate.getMonth(),
    };
    sessionStorage.setItem(RETURN_STATE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function peekReturnState() {
  try {
    const raw = sessionStorage.getItem(RETURN_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function restoreListContextFromReturnState() {
  const state = peekReturnState();
  if (!state) return;
  const filters = state.filters || {};
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = String(value);
  };
  setValue("candidatesFilterStartDate", filters.startDate || "");
  setValue("candidatesFilterEndDate", filters.endDate || "");
  setValue("candidatesFilterSource", filters.source || "");
  setValue("candidatesFilterName", filters.name || "");
  setValue("candidatesFilterCompany", filters.company || "");
  setValue("candidatesFilterAdvisor", filters.advisor || "");
  setValue("candidatesFilterValid", filters.valid || "");
  setValue("candidatesFilterPhase", filters.phase || "");
  const page = Number(state.page || 1);
  if (Number.isFinite(page) && page > 0) listPage = Math.trunc(page);
  if (Number.isFinite(state.calendarYear) && Number.isFinite(state.calendarMonth)) {
    calendarViewDate = new Date(Number(state.calendarYear), Number(state.calendarMonth), 1);
  }
}

function consumeReturnState() {
  try {
    const raw = sessionStorage.getItem(RETURN_STATE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RETURN_STATE_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getReturnTabFromDetail() {
  let state = null;
  try {
    const raw = sessionStorage.getItem(RETURN_STATE_KEY);
    state = raw ? JSON.parse(raw) : null;
  } catch {
    state = null;
  }
  if (!state) return null;
  // Always return to list when coming back from detail
  return "list";
}

let pendingReturnCandidateId = null;

function restoreScrollToCandidate() {
  if (pendingReturnCandidateId) return;
  const state = consumeReturnState();
  if (!state?.candidateId) return;
  pendingReturnCandidateId = state.candidateId;
  requestAnimationFrame(() => {
    const row = document.querySelector(`.candidate-item[data-id="${CSS.escape(pendingReturnCandidateId)}"]`);
    if (row) {
      setCandidatesActiveTab("list");
      row.scrollIntoView({ block: "center" });
      row.classList.add("is-highlighted");
      setTimeout(() => row.classList.remove("is-highlighted"), 1200);
    }
    pendingReturnCandidateId = null;
  });
}

async function prefetchNextActionDates(candidates) {
  const targets = (candidates || []).filter((candidate) => {
    const id = String(candidate?.id ?? "");
    if (!id) return false;
    if (candidate.nextActionDate) return false;
    if (nextActionCache.has(id)) return false;
    return true;
  });
  if (targets.length === 0) return;

  const queue = targets.slice();
  const updates = [];
  const concurrency = Math.min(4, queue.length);

  const worker = async () => {
    while (queue.length) {
      const candidate = queue.shift();
      if (!candidate) return;
      const id = String(candidate.id);
      if (nextActionCache.has(id)) continue;
      try {
        const detail = await fetchCandidateDetailById(id, { includeMaster: false });
        if (!detail) continue;
        nextActionCache.set(id, detail.nextActionDate ?? null);
        if (detail.nextActionDate) updates.push(detail);
      } catch (error) {
        console.error("次回アクション日の事前取得に失敗しました。", error);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  if (updates.length > 0) {
    batchApplyCandidateUpdates(updates, { preserveDetailState: true, renderDetail: false });
  }
}

function handleFilterChange() {
  // Reset list paging when filters change.
  listPage = 1;
  loadCandidatesData();
  if (isCandidatesTabActive("calendar")) {
    void loadCandidatesCalendarData();
  }
}

function collectFilters() {
  return {
    startDate: getElementValue("candidatesFilterStartDate"),
    endDate: getElementValue("candidatesFilterEndDate"),
    source: getElementValue("candidatesFilterSource"),
    name: getElementValue("candidatesFilterName"),
    company: getElementValue("candidatesFilterCompany"),
    advisor: getElementValue("candidatesFilterAdvisor"),
    cs: getElementValue("candidatesFilterCs"),
    valid: getElementValue("candidatesFilterValid"),
    phase: getElementValue("candidatesFilterPhase"),
    csStatus: getElementValue("candidatesFilterCsStatus"),
    sortOrder: getElementValue("candidatesSortOrder") || "desc",
  };
}

function resolveCandidateDateValue(candidate) {
  return (
    candidate.registeredAt ??
    candidate.createdAt ??
    candidate.registeredDate ??
    candidate.created_date ??
    candidate.created_at ??
    null
  );
}

function parseCandidateDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = String(value).match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveValidApplication(candidate) {
  const rawValue = resolveValidApplicationRaw(candidate);
  if (rawValue === true || rawValue === false) return rawValue;
  const computed = candidate?.validApplicationComputed;
  if (computed === true || computed === false) return computed;
  if (screeningRules) {
    const computedValue = computeValidApplication(candidate, screeningRules);
    if (computedValue === true || computedValue === false) {
      if (candidate) candidate.validApplicationComputed = computedValue;
      return computedValue;
    }
  }
  const cacheKey = candidate?.id != null ? String(candidate.id) : "";
  if (cacheKey && validityHydrationCache.has(cacheKey)) {
    const cached = validityHydrationCache.get(cacheKey);
    if (cached === true || cached === false) return cached;
  }
  return rawValue;
}

function resolveValidApplicationRaw(candidate) {
  return resolveValidApplicationRawShared(candidate);
}

function normalizeScreeningRulesPayload(payload) {
  return normalizeScreeningRulesPayloadShared(payload);
}

function computeValidApplication(candidate, rules) {
  return computeValidApplicationShared(candidate, rules);
}

function syncScreeningInputsFromDetail(target, source) {
  if (!target || !source) return;
  const fields = ["birthday", "age", "ageText", "age_value", "nationality", "japaneseLevel", "japanese_level"];
  fields.forEach((field) => {
    const value = source[field];
    if (value === undefined || value === null || value === "") return;
    target[field] = value;
  });
}

function refreshCandidateValidity(candidate) {
  if (!candidate || !screeningRules) return;
  const computed = computeValidApplication(candidate, screeningRules);
  if (computed === true || computed === false) {
    candidate.validApplicationComputed = computed;
    return;
  }
  const cacheKey = candidate?.id != null ? String(candidate.id) : "";
  if (cacheKey && validityHydrationCache.has(cacheKey)) {
    const cached = validityHydrationCache.get(cacheKey);
    if (cached === true || cached === false) {
      candidate.validApplicationComputed = cached;
      return;
    }
  }
  candidate.validApplicationComputed = null;
}

function applyScreeningRulesToCandidates() {
  if (!screeningRules || !allCandidates.length) return;
  allCandidates.forEach((candidate) => {
    refreshCandidateValidity(candidate);
  });
  const filters = collectFilters();
  filteredCandidates = applyLocalFilters(allCandidates, filters);
  filteredCandidates = sortCandidates(filteredCandidates, currentSortKey, currentSortOrder);
  renderCandidatesTable(filteredCandidates);
  updateHeaderSortStyles();
  updateCandidatesCount(filteredCandidates.length);
  void hydrateValidApplicationsFromDetail(filteredCandidates);
}

async function hydrateValidApplicationsFromDetail(list) {
  if (!screeningRules || !Array.isArray(list) || list.length === 0) return;

  const targets = list.filter((candidate) => {
    const id = String(candidate?.id ?? "");
    if (!id) return false;
    if (validityHydrationCache.has(id)) {
      const cached = validityHydrationCache.get(id);
      if (cached === true || cached === false) {
        candidate.validApplicationComputed = cached;
      }
      return false;
    }
    return !validityHydrationInFlight.has(id);
  });

  if (targets.length === 0) return;

  const concurrency = 6;
  let index = 0;
  const runWorker = async () => {
    while (index < targets.length) {
      const current = targets[index++];
      const id = String(current?.id ?? "");
      if (!id) continue;
      if (validityHydrationInFlight.has(id)) continue;
      validityHydrationInFlight.add(id);
      try {
        const detail = await fetchCandidateDetailById(id, { includeMaster: false });
        const computedFromDetail = computeValidApplication(detail, screeningRules);
        const detailValue =
          computedFromDetail === true || computedFromDetail === false
            ? computedFromDetail
            : resolveValidApplicationRaw(detail);
        if (detailValue === true || detailValue === false) {
          validityHydrationCache.set(id, detailValue);
          const target = allCandidates.find((item) => String(item.id) === id);
          if (target) {
            syncScreeningInputsFromDetail(target, detail);
            target.validApplicationComputed = detailValue;
          }
          syncScreeningInputsFromDetail(current, detail);
          current.validApplicationComputed = detailValue;
        } else {
          validityHydrationCache.set(id, null);
          const target = allCandidates.find((item) => String(item.id) === id);
          if (target) {
            syncScreeningInputsFromDetail(target, detail);
            target.validApplicationComputed = null;
          }
          syncScreeningInputsFromDetail(current, detail);
          current.validApplicationComputed = null;
        }
      } catch (error) {
        console.warn(`[candidates] validity hydration failed for ${id}:`, error);
      } finally {
        validityHydrationInFlight.delete(id);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, runWorker));
  renderCandidatesTable(filteredCandidates);
  updateHeaderSortStyles();
}

async function loadScreeningRulesForCandidates({ force = false } = {}) {
  if (!force && screeningRulesLoaded) return screeningRules;
  if (screeningRulesLoadPromise) return screeningRulesLoadPromise;

  if (force) {
    screeningRulesLoaded = false;
    validityHydrationCache.clear();
    validityHydrationInFlight.clear();
  }

  screeningRulesLoading = true;
  screeningRulesLoadPromise = (async () => {
    try {
      const token = getSession()?.token;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      let response = await fetch(SCREENING_RULES_ENDPOINT, {
        headers,
        cache: "no-store",
      });
      if (!response.ok && SCREENING_RULES_FALLBACK_ENDPOINT) {
        response = await fetch(SCREENING_RULES_FALLBACK_ENDPOINT, {
          headers,
          cache: "no-store",
        });
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      screeningRules = normalizeScreeningRulesPayload(data);
      screeningRulesLoaded = true;
    } catch (error) {
      console.error("有効応募判定ルールの取得に失敗しました。", error);
      screeningRules = null;
    } finally {
      screeningRulesLoading = false;
      screeningRulesLoadPromise = null;
      applyScreeningRulesToCandidates();
    }
    return screeningRules;
  })();

  return screeningRulesLoadPromise;
}

function resolvePhaseValues(candidate) {
  const raw = candidate?.phases ?? candidate?.phaseList ?? candidate?.phase ?? "";
  if (Array.isArray(raw)) return raw.map((value) => String(value).trim()).filter(Boolean);
  const text = String(raw || "");
  const split = text.split(/[,/、|]/).map((value) => value.trim()).filter(Boolean);
  return split.length ? split : [resolvePhaseDisplay(candidate)];
}

function applyLocalFilters(list, filters) {
  const baseList = applyCandidatesFilters(list, filters);
  const year = normalizeFilterText(filters.year);
  const month = normalizeFilterText(filters.month);
  const day = normalizeFilterText(filters.day);

  if (!year && !month && !day) return baseList;

  return baseList.filter((candidate) => {
    const registeredDate = parseCandidateDate(resolveCandidateDateValue(candidate));
    if (!registeredDate) return false;
    const yearValue = String(registeredDate.getFullYear());
    const monthValue = String(registeredDate.getMonth() + 1).padStart(2, "0");
    const dayValue = String(registeredDate.getDate()).padStart(2, "0");
    if (year && yearValue !== year) return false;
    if (month && monthValue !== month) return false;
    if (day && dayValue !== day) return false;
    return true;
  });
}

function sortCandidates(list, key, order) {
  const direction = order === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    let aVal, bVal;

    switch (key) {
      case "registeredAt":
        const aDate = parseCandidateDate(resolveCandidateDateValue(a));
        const bDate = parseCandidateDate(resolveCandidateDateValue(b));
        aVal = aDate ? aDate.getTime() : 0;
        bVal = bDate ? bDate.getTime() : 0;
        break;
      case "nextAction":
        const aNext = pickNextAction(a);
        const bNext = pickNextAction(b);
        const MAX_TS = 8640000000000000;
        if (order === "asc") {
          aVal = aNext ? aNext.date.getTime() : MAX_TS;
          bVal = bNext ? bNext.date.getTime() : MAX_TS;
        } else {
          aVal = aNext ? aNext.date.getTime() : 0;
          bVal = bNext ? bNext.date.getTime() : 0;
        }
        break;
      case "validApplication":
        aVal = resolveValidApplication(a) === true ? 1 : 0;
        bVal = resolveValidApplication(b) === true ? 1 : 0;
        break;
      case "candidateName":
      case "csName":
      case "advisorName":
      case "partnerName":
      case "source":
      case "phase":
      case "csStatus":
        aVal = String(a[key] || "");
        bVal = String(b[key] || "");
        break;
      default:
        aVal = a[key] || "";
        bVal = b[key] || "";
    }

    if (aVal === bVal) return 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return direction * aVal.localeCompare(bVal, "ja");
    }
    return direction * (aVal - bVal);
  });
}

function handleCandidatesHeaderClick(event) {
  const header = event.target.closest("th[data-sort-key]");
  if (!header) return;
  const key = header.dataset.sortKey;
  if (!key) return;
  handleHeaderSort(key);
}

function handleHeaderSort(key) {
  if (currentSortKey === key) {
    currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
  } else {
    currentSortKey = key;
    currentSortOrder = "desc";
  }

  // Update filteredCandidates directly and re-render
  filteredCandidates = sortCandidates(filteredCandidates, currentSortKey, currentSortOrder);
  renderCandidatesTable(filteredCandidates);
  updateHeaderSortStyles();
}

function updateHeaderSortStyles() {
  const headers = document.querySelectorAll(".candidates-table-card thead th[data-sort-key]");
  headers.forEach(th => {
    th.classList.remove("is-sorted", "bg-slate-100", "text-slate-900");
    th.removeAttribute("data-sort-dir");

    // Clean up text content if it has text arrows
    let label = th.textContent.replace(/[▲▼]/g, "").trim();
    th.textContent = label;

    const key = th.dataset.sortKey;
    if (key === currentSortKey) {
      th.classList.add("is-sorted");
      th.setAttribute("data-sort-dir", currentSortOrder);
    }
  });
}

function buildCandidatesQuery(filters, { limit = LIST_PAGE_SIZE, offset = 0, view = "" } = {}) {
  const p = new URLSearchParams();
  if (filters.startDate) p.set("from", filters.startDate);
  if (filters.endDate) p.set("to", filters.endDate);
  if (filters.source) p.set("source", filters.source);
  // phaseは表示フェーズ（クライアント計算）なのでローカルフィルタで扱う
  if (filters.csStatus) p.set("csStatus", filters.csStatus);
  if (filters.advisor) p.set("advisor", filters.advisor);
  if (filters.cs) p.set("cs", filters.cs);
  if (filters.name) p.set("name", filters.name);
  if (filters.company) p.set("company", filters.company);
  if (filters.valid) p.set("valid", filters.valid);
  if (view) p.set("view", view);
  p.set("limit", String(limit));
  p.set("offset", String(offset));
  return p.toString();
}

function hasActiveFilters(filters) {
  return Boolean(
    filters.startDate
    || filters.endDate
    || filters.source
    || filters.phase
    || filters.advisor
    || filters.cs
    || filters.name
    || filters.company
    || filters.valid
  );
}

function normalizeFilterText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function includesFilterText(value, query) {
  const normalizedQuery = normalizeFilterText(query);
  if (!normalizedQuery) return true;
  return normalizeFilterText(value).includes(normalizedQuery);
}

function matchesSelectValue(value, selectedValue) {
  if (!selectedValue) return true;
  return normalizeFilterText(value) === normalizeFilterText(selectedValue);
}

function getCandidateCompanyName(candidate) {
  return (
    candidate?.applyCompanyName
    || candidate?.companyName
    || candidate?.clientName
    || candidate?.client_name
    || candidate?.company
    || candidate?.selectionProgress?.[0]?.companyName
    || ""
  );
}

function getCandidateAdvisorName(candidate) {
  return candidate?.advisorName || resolveUserName(candidate?.advisorUserId) || "";
}

function getCandidateSourceName(candidate) {
  return candidate?.applyRouteText || candidate?.applyRoute || candidate?.source || candidate?.mediaName || "";
}

function getCandidateRegisteredDate(candidate) {
  const value = candidate?.createdAt || candidate?.registeredAt || candidate?.registeredDate || null;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseFilterDate(value, { isEnd } = {}) {
  if (!value) return null;
  const suffix = isEnd ? "T23:59:59.999" : "T00:00:00";
  const date = new Date(`${value}${suffix}`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getCandidatePhaseList(candidate) {
  const list = resolveCurrentPhases(candidate);
  return Array.from(new Set(list.map((value) => String(value).trim()).filter(Boolean)));
}

function applyCandidatesFilters(list, filters) {
  const startDate = parseFilterDate(filters.startDate, { isEnd: false });
  const endDate = parseFilterDate(filters.endDate, { isEnd: true });
  const validTarget = String(filters.valid || "");

  return list.filter((candidate) => {
    if (filters.name && !includesFilterText(candidate.candidateName, filters.name)) return false;
    if (filters.company && !matchesSelectValue(getCandidateCompanyName(candidate), filters.company)) return false;
    if (filters.advisor && !matchesSelectValue(getCandidateAdvisorName(candidate), filters.advisor)) return false;
    if (filters.cs && !matchesSelectValue(candidate.csName, filters.cs)) return false;
    if (filters.source && !matchesSelectValue(getCandidateSourceName(candidate), filters.source)) return false;

    if (validTarget) {
      const resolved = resolveValidApplication(candidate);
      const isValid = resolved === true;
      if (validTarget === "true" && !isValid) return false;
      if (validTarget === "false" && isValid) return false;
    }

    if (filters.phase) {
      const phases = getCandidatePhaseList(candidate);
      if (!phases.some((phase) => String(phase) === String(filters.phase))) return false;
    }

    if (filters.csStatus) {
      const candidateCs = normalizeCsStatusOption(candidate.csStatus ?? candidate.cs_status ?? "");
      if (normalizeFilterText(candidateCs) !== normalizeFilterText(filters.csStatus)) return false;
    }

    if (startDate || endDate) {
      const date = getCandidateRegisteredDate(candidate);
      if (!date) return false;
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
    }

    return true;
  });
}

function buildUniqueValues(values) {
  const map = new Map();
  values.forEach((value) => {
    const label = String(value ?? "").trim();
    if (!label) return;
    const key = normalizeFilterText(label);
    if (!map.has(key)) map.set(key, label);
  });
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "ja"));
}

function setFilterSelectOptions(selectId, values, { blankLabel = "すべて" } = {}) {
  const element = document.getElementById(selectId);
  if (!element) return;
  const currentValue = element.value;
  const options = [`<option value="">${blankLabel}</option>`]
    .concat(values.map((value) => `<option value="${escapeHtmlAttr(value)}">${escapeHtml(value)}</option>`))
    .join("");
  element.innerHTML = options;
  if (currentValue && values.includes(currentValue)) {
    element.value = currentValue;
  } else {
    element.value = "";
  }

  // 応募企業名の場合、Searchボックスの表示も同期
  if (selectId === "candidatesFilterCompany") {
    const searchInput = document.getElementById("candidatesFilterCompanySearch");
    if (searchInput) {
      const selectedOpt = Array.from(element.options).find(o => o.value === element.value);
      searchInput.value = (selectedOpt && selectedOpt.value) ? selectedOpt.textContent : "";
    }
  }

  // CSステータスの場合、Searchボックスの表示も同期
  if (selectId === "candidatesFilterCsStatus") {
    const searchInput = document.getElementById("candidatesFilterCsStatusSearch");
    if (searchInput) {
      const selectedOpt = Array.from(element.options).find(o => o.value === element.value);
      searchInput.value = (selectedOpt && selectedOpt.value) ? selectedOpt.textContent : "";
    }
  }
}

function updateFilterSelectOptions(list) {
  const sources = [];
  const companies = [];
  const advisors = [];
  const phases = [];

  list.forEach((candidate) => {
    const source = getCandidateSourceName(candidate);
    const company = getCandidateCompanyName(candidate);
    const advisor = getCandidateAdvisorName(candidate);
    const phaseList = getCandidatePhaseList(candidate);

    if (source) sources.push(source);
    if (company) companies.push(company);
    if (advisor) advisors.push(advisor);
    if (Array.isArray(phaseList)) phases.push(...phaseList);
  });

  const uniquePhases = buildUniqueValues([...PHASE_ORDER, ...phases]);
  const orderedPhases = [
    ...PHASE_ORDER,
    ...uniquePhases.filter((phase) => !PHASE_ORDER.includes(phase)),
  ];

  setFilterSelectOptions("candidatesFilterSource", buildUniqueValues(sources));
  setFilterSelectOptions("candidatesFilterCompany", buildUniqueValues(companies));
  setFilterSelectOptions("candidatesFilterAdvisor", buildUniqueValues(advisors));
  setFilterSelectOptions("candidatesFilterPhase", orderedPhases);
}

function updatePhaseFilterOptionsFromList(list) {
  const phases = [];
  list.forEach((candidate) => {
    const phaseList = getCandidatePhaseList(candidate);
    if (Array.isArray(phaseList)) phases.push(...phaseList);
  });

  const uniquePhases = buildUniqueValues(phases);
  const orderedPhases = [
    ...PHASE_ORDER.filter((phase) => uniquePhases.includes(phase)),
    ...uniquePhases.filter((phase) => !PHASE_ORDER.includes(phase)),
  ];
  setFilterSelectOptions("candidatesFilterPhase", orderedPhases);
}

function getElementValue(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function handleCandidatesTabClick(event) {
  const tabKey = event.currentTarget?.dataset?.candidatesTab;
  if (!tabKey) return;

  setCandidatesActiveTab(tabKey);
}

function setCandidatesActiveTab(tabKey) {
  document.querySelectorAll("[data-candidates-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.candidatesTab === tabKey);
  });

  document.querySelectorAll("[data-candidates-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.candidatesPanel === tabKey);
  });

  if (tabKey === "calendar") {
    // Calendar is loaded separately from the list paging dataset.
    renderNextActionCalendar(calendarCandidates);
    void loadCandidatesCalendarData();
  }
}

function handleCalendarNavClick(event) {
  const action = event.currentTarget?.dataset?.calendarNav;
  if (!action) return;

  const base = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), 1);
  if (action === "prev") {
    base.setMonth(base.getMonth() - 1);
  } else if (action === "next") {
    base.setMonth(base.getMonth() + 1);
  } else if (action === "today") {
    const today = new Date();
    base.setFullYear(today.getFullYear(), today.getMonth(), 1);
  }

  calendarViewDate = new Date(base.getFullYear(), base.getMonth(), 1);
  renderNextActionCalendar(calendarCandidates);
  if (isCandidatesTabActive("calendar")) {
    void loadCandidatesCalendarData();
  }
}

function handleCalendarEventClick(event) {
  const card = event.target.closest("[data-candidate-id]");
  if (!card) return;
  const id = card.dataset.candidateId;
  if (!id) return;
  saveReturnState(id);
  window.location.hash = `#/candidate-detail?id=${encodeURIComponent(id)}`;
}

function toDateKey(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const date = parseDateValue(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveMonthRange(date) {
  const base = date instanceof Date ? date : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { from: formatDateYmd(start), to: formatDateYmd(end) };
}

async function loadCandidatesCalendarData(filtersOverride = {}) {
  try {
    const filters = { ...collectFilters(), ...filtersOverride };
    const { from, to } = resolveMonthRange(calendarViewDate);

    const items = [];
    let offset = 0;
    let total = 0;

    while (items.length < CALENDAR_MAX_ITEMS) {
      const qs = new URLSearchParams();
      qs.set("view", "calendar");
      qs.set("limit", String(CALENDAR_BATCH_SIZE));
      qs.set("offset", String(offset));
      qs.set("nextActionFrom", from);
      qs.set("nextActionTo", to);
      if (filters.name) qs.set("name", filters.name);

      // Optional: carry other filters as hints (backend may ignore).
      if (filters.source) qs.set("source", filters.source);
      if (filters.company) qs.set("company", filters.company);
      if (filters.advisor) qs.set("advisor", filters.advisor);
      if (filters.valid) qs.set("valid", filters.valid);

      const url = candidatesApi(`${CANDIDATES_LIST_PATH}?${qs.toString()}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const batch = Array.isArray(json.items) ? json.items : [];
      total = Number(json.total ?? batch.length ?? 0);

      batch.forEach((item) => {
        items.push(normalizeCandidate({ ...item, id: String(item.id) }, { source: "list" }));
      });

      offset += batch.length;
      if (batch.length === 0) break;
      if (items.length >= total) break;
    }

    calendarCandidates = filters.phase
      ? applyCandidatesFilters(items, { phase: filters.phase })
      : items;
    renderNextActionCalendar(calendarCandidates);
  } catch (e) {
    console.error("カレンダーデータの取得に失敗しました。", e);
    calendarCandidates = [];
    renderNextActionCalendar(calendarCandidates);
  }
}

function buildNextActionMap(list) {
  const map = new Map();
  (list || []).forEach((candidate) => {
    const key = toDateKey(candidate?.nextActionDate);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: candidate.id,
      name: candidate.candidateName || "-",
      advisorName: candidate.advisorName || "-",
      partnerName: candidate.partnerName || "-",
      note: candidate.nextActionNote || "",
    });
  });

  map.forEach((items) => {
    items.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  });
  return map;
}

function renderNextActionCalendar(list) {
  const container = document.getElementById("candidatesCalendarBody");
  if (!container) return;

  const viewYear = calendarViewDate.getFullYear();
  const viewMonth = calendarViewDate.getMonth();
  const title = document.getElementById("candidatesCalendarTitle");
  if (title) title.textContent = `${viewYear}年${viewMonth + 1}月`;

  const eventsMap = buildNextActionMap(list);
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
  const todayKey = toDateKey(new Date());

  const cells = [];
  CALENDAR_WEEKDAYS.forEach((label) => {
    cells.push(`<div class="candidates-calendar-weekday">${label}</div>`);
  });

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const key = toDateKey(date);
    const isOutside = date.getMonth() !== viewMonth;
    const isToday = key && key === todayKey;
    const dayNumber = date.getDate();
    const events = key ? (eventsMap.get(key) || []) : [];
    const visibleEvents = events.slice(0, 3);
    const overflow = events.length - visibleEvents.length;
    const eventsHtml = visibleEvents
      .map(
        (item) => `
          <button type="button" class="calendar-event" data-candidate-id="${escapeHtmlAttr(String(item.id))}">
            <span class="calendar-event-name">${escapeHtml(item.name)}</span>
            ${item.note ? `<div class="text-[10px] text-slate-500 truncate" title="${escapeHtml(item.note)}">${escapeHtml(item.note)}</div>` : ""}
            <span class="calendar-event-meta">CS: ${escapeHtml(item.partnerName)} / PT: ${escapeHtml(item.advisorName)}</span>
          </button>
        `
      )
      .join("");
    const overflowHtml =
      overflow > 0
        ? `<div class="calendar-event calendar-event--more">+${overflow}件</div>`
        : "";

    cells.push(`
      <div class="candidates-calendar-day${isOutside ? " is-outside" : ""}${isToday ? " is-today" : ""}">
        <div class="candidates-calendar-day-number">${dayNumber}</div>
        ${eventsHtml}
        ${overflowHtml}
      </div>
    `);
  }

  container.innerHTML = `<div class="candidates-calendar-grid">${cells.join("")}</div>`;
}

// =========================
// テーブル描画
// =========================
function renderCandidatesTable(list) {
  const tableBody = document.getElementById("candidatesTableBody");
  if (!tableBody) return;
  activeInlineCsStatusCandidateId = null;

  if (list.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center text-slate-500 py-6">条件に一致する候補者が見つかりません。</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = list.map((candidate) => buildTableRow(candidate)).join("");
  highlightSelectedRow();
}

function buildTableRow(candidate) {
  return `
    <tr class="candidate-item" data-id="${escapeHtmlAttr(String(candidate.id))}">
      ${renderTextCell(candidate, "registeredAt", {
    format: (value, row) => formatDateTimeJP(value || row.registeredDate || row.createdAt),
    readOnly: true,
  })}
      ${renderTextCell(candidate, "phase", {
    allowHTML: true,
    format: (_, row) => renderPhasePills(row),
    readOnly: true,
  })}
      ${renderTextCell(candidate, "csStatus")}
      
      ${renderTextCell(candidate, "source", {
    readOnly: true,
    format: (_, row) => getCandidateSourceName(row),
  })}

      ${renderCheckboxCell(candidate, "validApplication", "有効応募")}
      ${renderCandidateNameCell(candidate)}
      ${renderTextCell(candidate, "csName", { readOnly: true })}
      ${renderTextCell(candidate, "advisorName", { readOnly: true })}
      ${renderNextActionCell(candidate)}
    </tr>
  `;
}

function renderCandidateNameCell(candidate) {
  const name = formatDisplayValue(candidate?.candidateName);
  const hasPastApplication = Boolean(candidate?.hasPastApplication);
  const pastCount = Number(candidate?.pastApplicationCount || 0);
  const latestAt = candidate?.pastApplicationLatestAt ? formatDateTimeJP(candidate.pastApplicationLatestAt) : "";
  const tooltipParts = ["過去応募あり"];
  if (pastCount > 0) tooltipParts.push(`過去応募 ${pastCount}件`);
  if (latestAt && latestAt !== "-") tooltipParts.push(`最新: ${latestAt}`);
  const tooltip = tooltipParts.join(" / ");

  return `
    <td>
      <div class="candidate-name-cell">
        <span class="font-semibold text-slate-900">${escapeHtml(name)}</span>
        ${hasPastApplication
      ? `<span class="candidate-repeat-badge" title="${escapeHtmlAttr(tooltip)}" aria-label="過去応募あり">再</span>`
      : ""
    }
      </div>
    </td>
  `;
}

function renderNextActionCell(candidate) {
  const nextAction = pickNextAction(candidate);
  if (!nextAction) {
    return '<td class="candidate-next-action-cell"><span class="candidate-next-action-empty">未設定</span></td>';
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const actionDate = new Date(nextAction.date.getFullYear(), nextAction.date.getMonth(), nextAction.date.getDate());
  const isExpired = actionDate < today;

  return `
    <td class="candidate-next-action-cell">
      <div class="candidate-next-action-stack">
        <span class="candidate-next-action-date ${isExpired ? "text-red-600 font-bold" : ""}">${isExpired ? "⚠️ " : ""}${escapeHtml(formatDateJP(nextAction.date))}</span>
        ${nextAction.note
      ? `<span class="candidate-next-action-label text-slate-600 font-medium" title="${escapeHtml(nextAction.note)}">${escapeHtml(nextAction.note)}</span>`
      : `<span class="candidate-next-action-label">${escapeHtml(nextAction.label)}</span>`
    }
      </div>
    </td>
  `;
}

function ensureNextActionColumnPriority() {
  const table = document.querySelector(".candidates-table-card table");
  if (!table) return;
  if (table.dataset.nextActionPriority === "true") return;

  const headRow = table.querySelector("thead tr");
  if (!headRow) return;

  const headers = Array.from(headRow.querySelectorAll("th"));
  const nextIndex = headers.findIndex((th) => th.dataset.sortKey === "nextAction");
  if (nextIndex === -1) return;

  const nextHeader = headers[nextIndex];
  nextHeader.classList.add("next-action-head");
  headRow.appendChild(nextHeader);

  const colgroup = table.querySelector("colgroup");
  if (colgroup) {
    const cols = Array.from(colgroup.querySelectorAll("col"));
    if (cols[nextIndex]) colgroup.appendChild(cols[nextIndex]);
  }

  table.dataset.nextActionPriority = "true";
}

function renderCheckboxCell(candidate, field, label) {
  const checked = field === "validApplication"
    ? resolveValidApplication(candidate) === true
    : Boolean(candidate[field]);
  if (!candidatesEditMode) {
    const badgeLabel = checked
      ? label
      : label.includes("有効")
        ? label.replace("有効", "無効")
        : `未${label}`;
    return `<td class="text-center">${renderStatusPill(badgeLabel, checked ? "success" : "muted")}</td>`;
  }
  const editable = candidatesEditMode ? "" : "disabled";
  const dataAttr = candidatesEditMode ? `data-field="${field}"` : "";
  return `
    <td>
      <label class="table-checkbox">
        <input type="checkbox" ${checked ? "checked" : ""} ${editable} ${dataAttr}>
        <span class="sr-only">${label}</span>
      </label>
    </td>
  `;
}

function findCandidateById(id) {
  const idStr = String(id ?? "");
  if (!idStr) return null;
  return (
    allCandidates.find((item) => String(item.id) === idStr) ||
    filteredCandidates.find((item) => String(item.id) === idStr) ||
    null
  );
}

function buildCsStatusOptionsHtml(selectedValue = "") {
  return buildCsStatusOptions(selectedValue)
    .map((option) => {
      const value = option?.value ?? "";
      const label = option?.label ?? "";
      const selected = option?.selected ? "selected" : "";
      const disabled = option?.disabled ? "disabled" : "";
      return `<option value="${escapeHtmlAttr(value)}" ${selected} ${disabled}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function renderCsStatusDisplayCell(candidate) {
  const candidateId = String(candidate?.id ?? "");
  const normalized = normalizeCsStatusOption(candidate?.csStatus ?? candidate?.cs_status ?? "");
  const display = normalized || "-";
  return `
    <td class="candidate-cs-status-cell" data-cs-status-cell data-candidate-id="${escapeHtmlAttr(candidateId)}">
      <button
        type="button"
        class="candidate-cs-status-trigger"
        data-cs-status-open
        title="ダブルクリック/ダブルタップで編集"
        aria-label="CSステータスを編集"
      >
        <span class="candidate-cs-status-value">${escapeHtml(display)}</span>
        <span class="candidate-cs-status-hint">編集</span>
      </button>
    </td>
  `;
}

function renderInlineCsStatusEditor(candidate) {
  const options = buildCsStatusOptionsHtml(candidate?.csStatus ?? candidate?.cs_status ?? "");
  return `
    <div class="candidate-cs-status-editor" data-cs-status-editor-inline>
      <select class="table-inline-input candidate-cs-status-select" data-cs-status-select>
        ${options}
      </select>
      <div class="candidate-cs-status-editor-row">
        <input
          type="text"
          class="table-inline-input candidate-cs-status-input"
          data-cs-status-new-input
          placeholder="新しいCSステータスを追加"
        >
        <button type="button" class="table-action-btn candidate-cs-status-add" data-cs-status-add-inline>追加</button>
      </div>
      <div class="candidate-cs-status-editor-actions">
        <button type="button" class="table-action-btn is-active" data-cs-status-save-inline>保存</button>
        <button type="button" class="table-action-btn" data-cs-status-cancel-inline>キャンセル</button>
      </div>
    </div>
  `;
}

function getCandidateTableRow(candidateId) {
  const idStr = String(candidateId ?? "");
  if (!idStr) return null;
  return Array.from(document.querySelectorAll("#candidatesTableBody tr[data-id]"))
    .find((row) => String(row.dataset.id) === idStr) || null;
}

function closeInlineCsStatusEditor({ rerenderTable = true } = {}) {
  if (!activeInlineCsStatusCandidateId) return;
  activeInlineCsStatusCandidateId = null;
  if (rerenderTable) {
    renderCandidatesTable(filteredCandidates);
  }
}

function openInlineCsStatusEditor(candidateId) {
  const idStr = String(candidateId ?? "");
  if (!idStr) return;

  if (activeInlineCsStatusCandidateId && activeInlineCsStatusCandidateId !== idStr) {
    closeInlineCsStatusEditor({ rerenderTable: true });
  }
  if (activeInlineCsStatusCandidateId === idStr) {
    return;
  }

  const candidate = findCandidateById(idStr);
  if (!candidate) return;

  const row = getCandidateTableRow(idStr);
  if (!row) return;
  const cell = row.querySelector("[data-cs-status-cell]");
  if (!cell) return;

  activeInlineCsStatusCandidateId = idStr;
  cell.classList.add("is-editing");
  cell.innerHTML = renderInlineCsStatusEditor(candidate);

  const select = cell.querySelector("[data-cs-status-select]");
  if (select) select.focus();
}

function handleInlineCsStatusOptionAdd(button) {
  const editor = button?.closest("[data-cs-status-editor-inline]");
  if (!editor) return;

  const input = editor.querySelector("[data-cs-status-new-input]");
  const select = editor.querySelector("[data-cs-status-select]");
  const value = normalizeCsStatusOption(input?.value);
  if (!value || !select) return;

  rememberCsStatusOption(value, { allowRestore: true });
  const exists = Array.from(select.options || []).some((option) => String(option.value) === value);
  if (!exists) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = value;

  if (input) {
    input.value = "";
    input.focus();
  }
}

async function handleInlineCsStatusSave(button) {
  const row = button?.closest("tr[data-id]");
  if (!row) return;

  const candidateId = String(row.dataset.id ?? "");
  if (!candidateId) return;

  const candidate = findCandidateById(candidateId);
  if (!candidate) return;

  const editor = row.querySelector("[data-cs-status-editor-inline]");
  const select = editor?.querySelector("[data-cs-status-select]");
  if (!select) return;

  const statusValue = normalizeCsStatusOption(select.value);
  const oldStatus = candidate.csStatus;
  const MAIL_TRIGGER_STATUSES = ["34歳以下メール(tech)", "35歳以上メール", "外国籍メール"];

  if (statusValue !== oldStatus && MAIL_TRIGGER_STATUSES.includes(statusValue)) {
    if (!window.confirm(`CSステータスを「${statusValue}」に変更すると、候補者へ自動メールが送信されます。\n本当によろしいですか？`)) {
      select.value = oldStatus || "";
      return;
    }
  }

  candidate.csStatus = statusValue;
  candidate.cs_status = statusValue;
  rememberCsStatusOption(statusValue);

  const prevLabel = button.textContent;
  button.disabled = true;
  button.textContent = "保存中...";
  try {
    activeInlineCsStatusCandidateId = null;
    await saveCandidateRecord(candidate);
    lastCsStatusTouchInfo = { candidateId: null, timestamp: 0 };
  } catch (error) {
    console.error("CSステータスの保存に失敗しました。", error);
    alert("CSステータスの保存に失敗しました。");
    button.disabled = false;
    button.textContent = prevLabel;
    activeInlineCsStatusCandidateId = candidateId;
  }
}

function renderTextCell(candidate, field, options = {}) {
  const raw = candidate[field] ?? "";

  // CSステータスは候補者管理では編集不可（架電管理画面のステータスを表示のみ）
  if (field === "csStatus" || field === "cs_status") {
    const display = normalizeCsStatusOption(raw) || "-";
    return `<td class="candidate-cs-status-cell"><span class="candidate-cs-status-value">${escapeHtml(display)}</span></td>`;
  }

  if (!candidatesEditMode || options.readOnly) {
    const formatted = options.format ? options.format(raw, candidate) : formatDisplayValue(raw);
    const content = options.allowHTML ? formatted : escapeHtml(formatted);
    const wrapperStart = options.strong ? '<span class="font-semibold text-slate-900">' : "";
    const wrapperEnd = options.strong ? "</span>" : "";
    return `<td>${wrapperStart}${content}${wrapperEnd}</td>`;
  }

  if (options.input === "textarea") {
    return `<td><textarea class="table-inline-textarea" data-field="${field}">${escapeHtml(raw)}</textarea></td>`;
  }

  const type = options.type || "text";
  return `<td><input type="${type}" class="table-inline-input" data-field="${field}" value="${escapeHtmlAttr(raw)}"></td>`;
}

// =========================
// CSステータス管理パネル
// =========================

// ユーザーが追加したカスタムCSステータスをセッション内で保持するセット（既存のcustomCsStatusOptionsを使用）
// PREDEFINED_CS_STATUS_OPTIONS は定数として定義済み

function renderCsStatusManageList() {
  const listEl = document.getElementById("csStatusManageList");
  if (!listEl) return;
  syncCsStatusManageStateFromStorage();

  // 表示するオプション（事前定義 + ユーザー追加）から削除済みのものを除外
  const activePredefined = PREDEFINED_CS_STATUS_OPTIONS.filter(s => !deletedDefaultCsStatuses.has(s));
  const activeCustom = Array.from(customCsStatusOptions).filter(s => !deletedDefaultCsStatuses.has(s));

  const allOptions = buildUniqueValues([
    ...activePredefined,
    ...activeCustom,
  ]);

  if (allOptions.length === 0) {
    listEl.innerHTML = '<span class="cs-status-manage-empty">登録されているステータスはありません</span>';
    return;
  }

  listEl.innerHTML = allOptions.map((status) => {
    return `
      <span class="cs-status-manage-tag">
        <span class="cs-status-manage-tag-label">${escapeHtml(status)}</span>
        <button type="button" class="cs-status-manage-tag-remove" data-cs-status-delete="${escapeHtmlAttr(status)}" title="削除" aria-label="${escapeHtmlAttr(status)}を削除">×</button>
      </span>
    `;
  }).join("");
}

function toggleCsStatusManagePanel(show) {
  const panel = document.getElementById("csStatusManagePanel");
  if (!panel) return;

  if (show) {
    panel.style.display = "";
    panel.removeAttribute("aria-hidden");
    renderCsStatusManageList();

    // 「追加」ボタンのイベントを設定（重複登録防止）
    const addBtn = document.getElementById("csStatusManageAddBtn");
    if (addBtn) {
      addBtn.onclick = handleCsStatusManageAdd;
    }
    const input = document.getElementById("csStatusManageInput");
    if (input) {
      input.onkeydown = (e) => { if (e.key === "Enter") handleCsStatusManageAdd(); };
    }

    // 「削除」ボタンのイベントをリストに設定（イベント委譲）
    const listEl = document.getElementById("csStatusManageList");
    if (listEl) {
      listEl.onclick = (e) => {
        const btn = e.target.closest("[data-cs-status-delete]");
        if (btn) handleCsStatusManageDelete(btn.dataset.csStatusDelete);
      };
    }
  } else {
    panel.style.display = "none";
    panel.setAttribute("aria-hidden", "true");
    // 入力欄をクリア
    const input = document.getElementById("csStatusManageInput");
    if (input) input.value = "";
  }
}

function handleCsStatusManageAdd() {
  const input = document.getElementById("csStatusManageInput");
  if (!input) return;

  const value = normalizeCsStatusOption(input.value);
  if (!value) return;

  // 重複チェック
  const all = buildUniqueValues([...PREDEFINED_CS_STATUS_OPTIONS, ...Array.from(customCsStatusOptions)]);
  if (all.includes(value)) {
    alert(`「${value}」は既に登録されています。`);
    return;
  }

  customCsStatusOptions.add(value);
  deletedDefaultCsStatuses.delete(value); // もし削除済みリストにあれば復帰させる
  rememberCsStatusOption(value, { allowRestore: true });
  saveCsStatusManageState(); // 保存
  void persistCsStatusManageStateToApi();
  input.value = "";

  // パネルのリストを再描画
  renderCsStatusManageList();

  // テーブル全行のCSステータスプルダウンも更新
  refreshAllCsStatusSelects();
}

function handleCsStatusManageDelete(status) {
  if (!status) return;
  if (!confirm(`「${status}」を削除しますか？\n（現在このステータスが設定されている候補者には影響しません）`)) return;

  if (customCsStatusOptions.has(status)) {
    customCsStatusOptions.delete(status);
  }
  deletedDefaultCsStatuses.add(status);
  saveCsStatusManageState(); // 保存
  void persistCsStatusManageStateToApi();

  // パネルのリストを再描画
  renderCsStatusManageList();

  // テーブル全行のCSステータスプルダウンも更新
  refreshAllCsStatusSelects();
}

function refreshAllCsStatusSelects() {
  syncCsStatusManageStateFromStorage();
  // テーブル内の全CSステータスselectの選択肢を再構築する
  const selects = document.querySelectorAll("[data-cs-status-select-edit]");
  selects.forEach((select) => {
    const row = select.closest("tr[data-id]");
    const candidateId = row?.dataset.id;
    const candidate = candidateId ? findCandidateById(candidateId) : null;
    const currentValue = candidate?.csStatus ?? select.value ?? "";
    select.innerHTML = buildCsStatusOptionsHtml(currentValue);
  });

  // 詳細パネル内のCSステータスselectも更新
  const detailSelects = document.querySelectorAll(
    'select[data-detail-field="csStatus"], select[data-detail-field="cs_status"]'
  );
  detailSelects.forEach((select) => {
    const currentValue = select.value ?? "";
    select.innerHTML = buildCsStatusOptionsHtml(currentValue);
    if (currentValue) select.value = currentValue;
  });

  // フィルタープルダウンも更新
  const activePredefined = PREDEFINED_CS_STATUS_OPTIONS.filter(s => !deletedDefaultCsStatuses.has(s));
  const activeCustom = Array.from(customCsStatusOptions).filter(s => !deletedDefaultCsStatuses.has(s));
  const activeMaster = (masterCsStatusOptions || []).filter(s => !deletedDefaultCsStatuses.has(s));
  const allCsStatuses = buildUniqueValues([
    ...activePredefined,
    ...activeCustom,
    ...activeMaster,
  ]);
  setFilterSelectOptions("candidatesFilterCsStatus", allCsStatuses);
}

// 状態をLocalStorageに保存するヘルパー
function saveCsStatusManageState() {
  try {
    localStorage.setItem('candidates_custom_cs_statuses', JSON.stringify(Array.from(customCsStatusOptions)));
    localStorage.setItem('candidates_deleted_default_cs_statuses', JSON.stringify(Array.from(deletedDefaultCsStatuses)));
  } catch (e) {
    console.warn("Failed to save CS status options to localStorage", e);
  }
}

// 状態をLocalStorageから復元するヘルパー
function loadCsStatusManageState() {
  try {
    syncCsStatusManageStateFromStorage();
  } catch (e) {
    console.warn("Failed to load CS status options from localStorage", e);
  }
}

// =========================
// 編集モード（一覧インライン）
// =========================
async function toggleCandidatesEditMode() {
  const nextState = !candidatesEditMode;
  candidatesEditMode = nextState;

  const button = document.getElementById("candidatesToggleEdit");
  if (button) {
    button.textContent = candidatesEditMode ? "編集完了" : "編集";
    button.classList.toggle("is-active", candidatesEditMode);
  }

  // CSステータス管理パネルは候補者管理では使用しない（架電管理で管理）

  // テーブル再描画（他の編集フィールドのため）
  renderCandidatesTable(filteredCandidates);

  if (!nextState) {
    await persistInlineEdits();
  }
}

function handleInlineEdit(event) {
  const control = event.target.closest("[data-field]");
  if (!control) return;

  const row = control.closest("tr[data-id]");
  if (!row) return;

  const candidate = allCandidates.find((item) => String(item.id) === String(row.dataset.id));
  if (!candidate) return;

  const field = control.dataset.field;

  // CSステータスはeditModeに関係なく常に即時保存する
  if (field === "csStatus" || field === "cs_status") {
    if (event.type !== "change") {
      return;
    }

    const normalized = normalizeCsStatusOption(control.value);
    const oldStatus = candidate.csStatus ?? candidate.cs_status ?? "";
    const MAIL_TRIGGER_STATUSES = ["34歳以下メール(tech)", "35歳以上メール", "外国籍メール"];

    if (normalized !== oldStatus && MAIL_TRIGGER_STATUSES.includes(normalized)) {
      if (!window.confirm(`CSステータスを「${normalized}」に変更すると、候補者へ自動メールが送信されます。\n本当によろしいですか？`)) {
        control.value = oldStatus || "";
        return;
      }
    }

    if (normalized === oldStatus) {
      return;
    }

    candidate.csStatus = normalized;
    candidate.cs_status = normalized;
    rememberCsStatusOption(normalized);

    const selectEl = control;
    selectEl.disabled = true;
    saveCandidateRecord(candidate)
      .catch((err) => {
        console.error("CSステータスの保存に失敗しました。", err);
        alert("CSステータスの保存に失敗しました。");
      })
      .finally(() => {
        selectEl.disabled = false;
      });
    return;
  }

  // 以下はeditModeが必要な通常フィールド
  if (!candidatesEditMode) return;

  candidate[field] = control.type === "checkbox" ? control.checked : control.value;

  if (field === "validApplication") {
    candidate.validApplicationComputed = candidate.validApplication;
  }

  markCandidateDirty(candidate.id);

  if (field === "birthday") candidate.age = calculateAge(candidate.birthday);
}

function markCandidateDirty(id) {
  if (!id) return;
  pendingInlineUpdates[String(id)] = true;
}

async function persistInlineEdits() {
  const dirtyIds = Object.keys(pendingInlineUpdates);
  if (dirtyIds.length === 0) return;

  const failures = {};
  for (const id of dirtyIds) {
    const candidate = allCandidates.find((item) => String(item.id) === String(id));
    if (!candidate) continue;
    try {
      await saveCandidateRecord(candidate);
      delete pendingInlineUpdates[id];
    } catch (e) {
      console.error("候補者の保存に失敗しました。", e);
      failures[id] = true;
    }
  }

  if (Object.keys(failures).length > 0) {
    pendingInlineUpdates = failures;
    alert("一部の候補者の保存に失敗しました。再度お試しください。");
  } else {
    pendingInlineUpdates = {};
  }
}

// =========================
// 件数 / 最終同期
// =========================
function updateCandidatesCount(count) {
  const element = document.getElementById("candidatesResultCount");
  if (element) element.textContent = `${count}件`;
}

function updateLastSyncedDisplay(ts) {
  const element = document.getElementById("candidatesLastSynced");
  if (!element) return;
  element.textContent = ts ? `最終同期: ${formatDateTimeJP(ts)}` : "最終同期: -";
}

// =========================
// 行クリック：必ず詳細APIを叩く（重要）
// =========================
async function fetchCandidateDetailById(id, { includeMaster = true } = {}) {
  const query = includeMaster ? "?includeMaster=true" : "";
  const url = candidatesApi(`${candidateDetailPath(id)}${query}`); // /candidates/{candidateId}
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Candidate detail HTTP ${res.status}: ${text}`);
  }
  const raw = await res.json();
  if (includeMaster) {
    updateMastersFromDetail(raw);
  }
  const detail = normalizeCandidate(raw);
  if (detail?.masters) delete detail.masters;
  return detail;
}

function setCandidateDetailLoading(message = "読み込み中...") {
  const container = getCandidateDetailContainer();
  if (!container) return;
  container.innerHTML = `
    <div class="candidate-detail-empty">
      <p class="text-sm text-slate-500">${escapeHtml(message)}</p>
    </div>
  `;
}

async function openCandidateById(id) {
  const idStr = String(id);
  selectedCandidateId = idStr;

  setCandidateDetailLoading("候補者詳細を取得しています...");
  openCandidateModal();
  highlightSelectedRow();

  try {
    const detail = await fetchCandidateDetailById(idStr, { includeMaster: true });

    // 一覧にも反映（あれば更新、無ければ詳細モーダルだけでも表示できる）
    applyCandidateUpdate(detail, { preserveDetailState: true });

    // 明示的に描画（applyCandidateUpdate 内でも描画されるが、安全に二重でOK）
    renderCandidateDetail(detail, { preserveEditState: false });
    openCandidateModal();
    highlightSelectedRow();
  } catch (e) {
    console.error("candidate detail fetch error", e);
    const fallback = filteredCandidates.find((c) => String(c.id) === idStr)
      || allCandidates.find((c) => String(c.id) === idStr);
    if (fallback) {
      renderCandidateDetail(fallback, { preserveEditState: false });
      openCandidateModal();
      highlightSelectedRow();
    } else {
      setCandidateDetailLoading("詳細の取得に失敗しました。ネットワーク状態を確認してください。");
      openCandidateModal();
    }
  }
}

// ダブルクリックによるCSステータス編集は廃止
// eslint-disable-next-line no-unused-vars
function handleTableDoubleClick(_event) {
  // ダブルクリックでのCSステータス編集機能は廃止した。
  // 「編集」ボタンで編集モードを有効にしてください。
}

// ダブルタップによるCSステータス編集は廃止
// eslint-disable-next-line no-unused-vars
function handleTableTouchEnd(_event) {
  // ダブルタップでのCSステータス編集機能は廃止した。
  // 「編集」ボタンで編集モードを有効にしてください。
}

async function handleTableClick(event) {
  if (event.target.closest("[data-field]")) return;

  const row = event.target.closest("tr[data-id]");
  if (!row) return;

  const id = row.dataset.id;
  if (!id) return;

  // 新しい詳細ページに遷移
  saveReturnState(id);
  window.location.hash = `#/candidate-detail?id=${encodeURIComponent(id)}`;
}

// =========================
// フィルタリセット
// =========================
function handleFilterReset() {
  filterConfig.forEach(({ id }) => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });

  // 追加: 検索用入力欄もクリア
  const companySearch = document.getElementById("candidatesFilterCompanySearch");
  if (companySearch) companySearch.value = "";

  const csStatusSearch = document.getElementById("candidatesFilterCsStatusSearch");
  if (csStatusSearch) csStatusSearch.value = "";

  const sortSelect = document.getElementById("candidatesSortOrder");
  if (sortSelect) sortSelect.value = "desc";

  selectedCandidateId = null;
  closeCandidateModal({ clearSelection: false });
  handleFilterChange();
}



// クライアント一覧（オートコンプリート用）
let clientList = [];

// =========================
// 初期化
// =========================
document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([
    fetchCandidates(),
    fetchClients(), // クライアント一覧取得
  ]);

  // URLパラメータのチェック (id指定があれば詳細を開く)
  const urlParams = new URLSearchParams(window.location.search);
  const detailId = urlParams.get("id");
  if (detailId) {
    await openCandidateById(detailId);
  }
});

async function fetchClients() {
  try {
    const res = await fetch(candidatesApi("/clients"));
    if (!res.ok) throw new Error("Failed to fetch clients");
    clientList = await res.json();
  } catch (err) {
    console.error(err);
  }
}

// =========================
// 選択状態の復元
// =========================
function refreshSelectionState() {
  if (!selectedCandidateId) {
    highlightSelectedRow();
    return;
  }

  const candidate = filteredCandidates.find((item) => String(item.id) === String(selectedCandidateId));
  if (!candidate) {
    // 候補者が一覧にいなくても、モーダルを勝手に閉じない（deep link対応）
    highlightSelectedRow();
    return;
  }

  if (isCandidateModalOpen()) {
    renderCandidateDetail(candidate, { preserveEditState: true });
  }
  highlightSelectedRow();
}

function highlightSelectedRow() {
  const rows = document.querySelectorAll("#candidatesTableBody .candidate-item");
  const modalOpen = isCandidateModalOpen();
  rows.forEach((row) => {
    const active = modalOpen && selectedCandidateId && String(row.dataset.id) === String(selectedCandidateId);
    row.classList.toggle("is-active", Boolean(active));
  });
}

// =========================
// 詳細モーダル描画
// =========================
function renderCandidateDetail(candidate, { preserveEditState = false } = {}) {
  const container = getCandidateDetailContainer();
  if (!container) return;

  if (!candidate) {
    currentDetailCandidateId = null;
    resetDetailEditState();
    container.innerHTML = getCandidateDetailPlaceholder();
    return;
  }

  const contactTimeCacheKey = candidate.id != null ? String(candidate.id) : "";
  let resolvedContactTime = normalizeContactPreferredTime(
    candidate.contactPreferredTime ??
    candidate.contact_preferred_time ??
    candidate.contactTime ??
    candidate.contact_time
  );
  if (!resolvedContactTime && contactTimeCacheKey) {
    const cached = contactPreferredTimeCache.get(contactTimeCacheKey);
    if (cached) resolvedContactTime = cached;
  }
  if (resolvedContactTime !== undefined) {
    candidate.contactPreferredTime = resolvedContactTime;
    candidate.contactTime = resolvedContactTime;
  }
  if (contactTimeCacheKey && resolvedContactTime) {
    contactPreferredTimeCache.set(contactTimeCacheKey, resolvedContactTime);
  }

  if (!preserveEditState && String(candidate.id) !== String(currentDetailCandidateId)) {
    resetDetailEditState();
  }
  currentDetailCandidateId = String(candidate.id);

  const resolvedValid = resolveValidApplication(candidate);
  const validBadgeText = resolvedValid ? "有効応募" : "無効応募";
  const validValueClass = resolvedValid ? " summary-status-value--valid" : " summary-status-value--invalid";

  // 1. シンプルな戻るボタン (Modal only)
  const showInlineBackButton = Boolean(document.getElementById("candidateDetailModal"));
  const backButtonHtml = showInlineBackButton
    ? `
      <div class="mb-4">
        <button type="button" class="detail-back-btn" onclick="closeCandidateModal()">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"/>
          </svg>
          候補者一覧に戻る
        </button>
      </div>
    `
    : "";

  // 2. 統合サマリーカード (Candidate Info + Meeting Info)
  // 面談実施日・着座確認の値を準備
  const attendanceValue = candidate.attendanceConfirmed ?? false;
  const interviewDate = formatDateJP(candidate.firstInterviewDate) || "-";
  const phaseDisplay = resolvePhaseDisplay(candidate) || "-";
  const csStatusDisplay = normalizeCsStatusOption(candidate.csStatus ?? candidate.cs_status ?? "") || "-";
  const phaseValueClass = phaseDisplay === "-" ? " is-empty" : "";
  const csStatusValueClass = csStatusDisplay === "-" ? " is-empty" : "";

  const summaryCardHtml = `
    <div class="candidate-summary-card">
      <div class="summary-main-row">
        <div class="summary-candidate-info">
          <h2 class="summary-candidate-name">${escapeHtml(candidate.candidateName || "-")}</h2>
          <div class="summary-status-line">
            <div class="summary-status-item">
              <span class="summary-status-label">選考フェーズ</span>
              <span class="summary-status-value summary-status-value--phase${phaseValueClass}">${escapeHtml(phaseDisplay)}</span>
            </div>
            <div class="summary-status-item">
              <span class="summary-status-label">CSステータス</span>
              <span class="summary-status-value summary-status-value--cs${csStatusValueClass}">${escapeHtml(csStatusDisplay)}</span>
            </div>
            <div class="summary-status-item">
              <span class="summary-status-label">有効応募可否</span>
              <span class="summary-status-value${validValueClass}">${escapeHtml(validBadgeText)}</span>
            </div>
          </div>
        </div>
        <div class="summary-meta-info">
           <div class="summary-meta-item">
             <span class="meta-label">登録日</span>
             <span class="meta-value">${formatDateTimeJP(candidate.createdAt || candidate.registeredAt || candidate.registeredDate)}</span>
           </div>
           <div class="summary-meta-item">
             <span class="meta-label">担当CS</span>
             <span class="meta-value">${escapeHtml(candidate.csName || "-")}</span>
           </div>
           <div class="summary-meta-item">
             <span class="meta-label">担当パートナー</span>
             <span class="meta-value">${escapeHtml(candidate.advisorName || "-")}</span>
           </div>
        </div>
      </div>
      
      <div class="summary-divider"></div>

      <div class="summary-meeting-row">
        <div class="summary-meeting-item">
          <span class="meeting-label">面談実施日</span>
          <span class="meeting-value font-bold">${escapeHtml(interviewDate)}</span>
        </div>
        <div class="summary-meeting-item">
          <span class="meeting-label">着座確認</span>
          <span class="status-badge ${attendanceValue ? 'status-badge--valid' : 'status-badge--invalid'}">
            ${attendanceValue ? "確認済" : "未確認"}
          </span>
        </div>
      </div>
    </div>
  `;

  // アンカーナビゲーション（絵文字なし）
  const tabItems = [
    { key: "nextAction", label: "次回アクション" },
    { key: "selection", label: "選考進捗" },
    { key: "profile", label: "基本情報" },
    { key: "hearing", label: "面談メモ" },
    { key: "cs", label: "架電結果" },
    { key: "money", label: "売上・返金" },
    { key: "documents", label: "書類作成" },
  ];

  const activeTabKey = tabItems.some(item => item.key === candidateDetailCurrentTab)
    ? candidateDetailCurrentTab
    : "nextAction";

  const tabsHtml = `
    <div class="detail-tabs candidate-detail-tabs">
      ${tabItems.map((item, index) => `
        <button type="button" class="detail-tab ${item.key === activeTabKey ? "is-active" : ""}" data-detail-tab="${item.key}">
          ${item.label}
        </button>
      `).join("")}
    </div>
  `;

  const tabContentMap = {
    nextAction: renderDetailCard("次回アクション", renderNextActionSection(candidate), "nextAction"),
    selection: renderDetailCard("選考進捗", renderSelectionProgressSection(candidate), "selection"),
    profile: renderDetailCard("基本情報", renderApplicantInfoSection(candidate), "profile") +
      renderDetailCard("担当者", renderAssigneeSection(candidate), "assignees"),
    hearing: renderDetailCard("面談メモ", renderHearingSection(candidate), "hearing"),
    cs: renderDetailCard("架電結果", renderCsSection(candidate), "cs") +
      renderDetailCard("テレアポログ一覧", renderTeleapoLogsSection(candidate), "teleapoLogs", { editable: false }),
    money: renderDetailCard("売上・返金", renderMoneySection(candidate), "money"),
    documents: renderDetailCard("書類作成", renderDocumentsSection(candidate), "documents"),
  };

  const tabPanelsHtml = `
    <div class="detail-tab-panels">
      ${tabItems.map((item) => `
        <div class="detail-tab-panel ${item.key === activeTabKey ? "is-active" : ""}" data-detail-panel="${item.key}">
          ${tabContentMap[item.key] || ""}
        </div>
      `).join("")}
    </div>
  `;



  container.innerHTML = `
    <div class="candidate-detail-wrapper">
      ${backButtonHtml}
      ${summaryCardHtml}
      <div class="sticky-nav-wrapper">
        ${tabsHtml}
      </div>
      ${tabPanelsHtml}
    </div>
  `;

  initializeDetailContentListeners();
  initializeDetailTabs(activeTabKey); // タブリスナー初期化
  initializeSelectionCompanyDropdowns(candidate);
}

// タブナビゲーションの初期化
function initializeDetailTabs(defaultKey = "nextAction") {
  const tabs = Array.from(document.querySelectorAll('[data-detail-tab]'));
  const panels = Array.from(document.querySelectorAll('[data-detail-panel]'));
  if (!tabs.length || !panels.length) return;

  const activate = (key) => {
    candidateDetailCurrentTab = key;
    tabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.detailTab === key);
    });
    panels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.detailPanel === key);
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const key = tab.dataset.detailTab;
      if (key) activate(key);
    });
  });

  const initial = tabs.find(tab => tab.dataset.detailTab === defaultKey) || tabs[0];
  if (initial?.dataset.detailTab) activate(initial.dataset.detailTab);
}

// 新しいカードレンダー関数（絵文字なし、統一デザイン）
function renderDetailCard(title, body, key, options = {}) {
  const editing = detailEditState[key];
  const editable = options.editable !== false;

  const cardClass = editing
    ? "detail-card ring-2 ring-indigo-200"
    : "detail-card";

  const editBtn = editable
    ? `<button type="button" class="detail-edit-btn--outlined ${editing ? 'is-active' : ''}" data-section-edit="${key}">
        ${editing ? "保存" : "編集"}
       </button>`
    : "";

  const editingBadge = editing
    ? `<span class="ml-2 status-badge status-badge--phase">編集中</span>`
    : "";

  return `
    <section class="${cardClass}" id="section-${key}" data-section="${key}">
      <header class="detail-card-header">
        <div class="flex items-center">
          <h4>${title}</h4>
          ${editingBadge}
        </div>
        ${editBtn}
      </header>
      <div class="detail-card-body">
        ${body}
      </div>
    </section>
  `;
}

// フェーズバッジ（絵文字なし）
function renderPhaseBadges(candidate) {
  const phases = resolveCurrentPhases(candidate);
  if (phases.length === 0) return "";
  return phases.map(phase =>
    `<span class="status-badge status-badge--phase">${escapeHtml(phase)}</span>`
  ).join("");
}

function getCandidateDetailPlaceholder() {
  return `
    <div class="candidate-detail-empty">
      <p class="text-sm text-slate-500">候補者行をクリックすると詳細が表示されます。</p>
      <p class="text-xs text-slate-400">求職者情報・共有面談・選考進捗・CS項目をまとめて確認できます。</p>
    </div>
    `;
}

function setCandidateDetailPlaceholder() {
  const container = getCandidateDetailContainer();
  if (container) container.innerHTML = getCandidateDetailPlaceholder();
  currentDetailCandidateId = null;
  resetDetailEditState();
}

function renderDetailSection(title, body, key, options = {}) {
  const editing = detailEditState[key];
  const editable = options.editable !== false;

  // 状態に応じたスタイル定義
  const sectionBase = "candidate-detail-section rounded-xl shadow-sm border transition-all duration-200";
  const sectionColor = editing
    ? "bg-indigo-50/30 border-indigo-400 ring-2 ring-indigo-100"
    : "bg-white border-slate-100";

  const headerBase = "candidate-detail-section-header px-4 py-3 flex items-center justify-between rounded-t-xl transition-colors duration-200";
  const headerColor = editing
    ? "bg-indigo-100/50 border-b border-indigo-200"
    : "bg-slate-50 border-b border-slate-100"; // 元のbg-slate-50を維持

  const actions = editable
    ? `
    <button type="button" class="detail-edit-btn ${editing ? "is-active bg-indigo-600 text-white border-transparent hover:bg-indigo-700 shadow-sm" : ""}" data-section-edit="${key}">
      ${editing ? "完了して保存" : "編集"}
    </button>
    `
    : "";

  const editingBadge = editing
    ? `<span class="ml-2 px-2 py-0.5 text-xs font-bold text-indigo-700 bg-indigo-100 rounded-full border border-indigo-200">編集中</span>`
    : "";

  return `
    <section class="${sectionBase} ${sectionColor}" data-section="${key}">
      <header class="${headerBase} ${headerColor}">
        <div class="flex items-center">
          <h4 class="font-semibold text-slate-800 ${editing ? 'text-indigo-900' : ''}">${title}</h4>
          ${editingBadge}
        </div>
        <div class="detail-section-actions">
          ${actions}
        </div>
      </header>
      <div class="candidate-detail-section-body">
        ${body}
      </div>
    </section>
    `;
}

function renderDetailSubsection(title, body, className = "") {
  return `
    <div class="detail-subsection bg-slate-50 rounded-lg p-4 ${className}">
      <div class="detail-subsection-header">
        <h5>${escapeHtml(title)}</h5>
      </div>
      <div class="detail-subsection-body">
        ${body}
      </div>
    </div>
    `;
}

function renderDetailSubsectionToggle(title, body, { className = "", open = false } = {}) {
  return `
    <details class="detail-subsection detail-subsection--toggle ${className}" ${open ? "open" : ""}>
      <summary class="detail-subsection-header detail-subsection-toggle">
        <h5>${escapeHtml(title)}</h5>
        <span class="detail-subsection-toggle-text"></span>
      </summary>
      <div class="detail-subsection-body">
        ${body}
      </div>
    </details>
  `;
}

function renderStatusPill(label, variant = "muted") {
  return `<span class="status-pill status-pill--${variant}">${escapeHtml(label)}</span>`;
}

function renderBooleanPill(value, { trueLabel = "はい", falseLabel = "いいえ" } = {}) {
  if (value === null || value === undefined) return renderStatusPill("-", "muted");
  return value
    ? renderStatusPill(trueLabel, "success")
    : renderStatusPill(falseLabel, "muted");
}

function resolveSelectionStatusVariant(status) {
  const value = String(status || "");
  if (!value) return "muted";
  if (value.includes("内定") || value.includes("入社")) return "success";
  if (value.includes("辞退") || value.includes("退社") || value.includes("クローズ")) return "muted";
  return "warning";
}

function resolveSelectionStageValue(row = {}) {
  if (row.postJoinQuitDate) return "入社後辞退";
  if (row.onboardingDate) return "入社";
  if (row.preJoinDeclineDate) return "内定後辞退";
  if (row.acceptanceDate) return "内定承諾済み";
  if (row.offerDate) return "内定承諾待ち";
  if (row.secondInterviewDate) return "二次面接";
  if (row.secondInterviewSetupDate) return "二次面接調整";
  if (row.interviewDate) return "一次面接";
  if (row.interviewSetupDate) return "一次面接調整";
  // ★追加: 推薦日が入っていたら「書類選考」にする
  if (row.recommendationDate) return "書類選考";
  return "";
}

function resolveSelectionPhaseFromProgress(candidate) {
  const rows = Array.isArray(candidate?.selectionProgress) ? candidate.selectionProgress : [];
  if (!rows.length) return null;

  let bestStage = null;
  let bestIndex = -1;
  let fallback = null;

  rows.forEach((row) => {
    if (!row) return;
    const rawStage =
      resolveSelectionStageValue(row) ||
      row.status ||
      row.selectionStatus ||
      row.selection_status ||
      "";
    const stage = String(rawStage || "").trim();
    if (!stage) return;

    const idx = PHASE_ORDER.indexOf(stage);
    if (idx >= 0) {
      if (idx > bestIndex) {
        bestIndex = idx;
        bestStage = stage;
      }
      return;
    }

    if (!fallback) fallback = stage;
  });

  return bestStage || fallback || null;
}

function updateSelectionStatusCell(index, status) {
  const root = getCandidateDetailContainer() || document;
  const row = root.querySelector(`[data-selection-row="${index}"]`);
  if (!row) return;
  const cell = row.querySelector("[data-selection-status]");
  if (!cell) return;
  cell.innerHTML = renderStatusPill(status || "-", resolveSelectionStatusVariant(status));
}

// -----------------------
// 必須：保存APIのURLを統一
// -----------------------


// -----------------------
// フェーズ表示ロジック
// -----------------------
function resolveCurrentPhases(candidate) {
  const selectionPhase = resolveSelectionPhaseFromProgress(candidate);
  if (selectionPhase) {
    return [selectionPhase];
  }

  let phases = Array.isArray(candidate.phaseList) ? candidate.phaseList : (candidate.phase ? [candidate.phase] : []);
  phases = phases.map((phase) => (String(phase).trim() === "新規" ? "未接触" : phase));

  // 通電等の接触履歴がある場合は「未接触」を除外する
  const hasContact = candidate.hasConnected || candidate.hasSms || (candidate.callCount > 0);
  if (hasContact) {
    phases = phases.filter(p => p !== "未接触");
  }
  return phases;
}

function resolvePhaseDisplay(candidate) {
  const phases = resolveCurrentPhases(candidate);
  return phases.length > 0 ? phases[0] : "-";
}

function renderPhasePills(candidate) {
  const phases = resolveCurrentPhases(candidate);
  if (phases.length === 0) return "-";
  return `<div class="candidate-phase-list">
    ${phases.map(phase => `<span class="candidate-phase-pill">${escapeHtml(phase)}</span>`).join("")}
  </div>`;
}

async function saveCandidateRecord(candidate, { preserveDetailState = true, includeDetail = false } = {}) {
  if (!candidate || !candidate.id) throw new Error("保存対象の候補者が見つかりません。");

  // ---------------------------------------------------------
  // DOMからの強制同期処理 (全入力フィールド)
  // Inputイベント漏れを防ぐため、保存直前に画面の値を正として取り込む
  // ---------------------------------------------------------
  const detailContainer = getCandidateDetailContainer();
  if (detailContainer) {
    // 1. 一般フィールド (data-detail-fieldを持つもの)
    const inputs = detailContainer.querySelectorAll("[data-detail-field]");
    inputs.forEach((input) => {
      // 選考進捗テーブル内のフィールドは後続の処理で扱うためスキップ(二重処理防止)
      if (input.closest(".selection-card[data-selection-row]")) return;

      const path = input.dataset.detailField;
      if (!path) return;

      let value;
      if (input.type === "checkbox") {
        value = input.checked;
      } else {
        value = input.value;
      }

      // 値の型変換 (handleDetailFieldChangeと同等の簡易処理)
      if (input.dataset.valueType === "number") {
        value = value === "" ? "" : Number(value);
      } else if (input.dataset.valueType === "boolean") {
        value = value === "true" || value === true;
      }

      const sectionKey = input.dataset.detailSection;
      value = normalizeMoneyInputValue(value, path, sectionKey);

      updateCandidateFieldValue(candidate, path, value);

      // 特殊フィールドの同期
      if (path === "nextActionDate") {
        candidate.nextActionDate = value;
        if (!candidate.actionInfo) candidate.actionInfo = {};
        candidate.actionInfo.nextActionDate = value;
      }
      if (path === "nextActionNote") {
        candidate.nextActionNote = value;
      }
    });
  }

  // ---------------------------------------------------------
  // 選考進捗の実DOMからの強制同期
  // ---------------------------------------------------------
  const selectionRows = detailContainer
    ? detailContainer.querySelectorAll(".selection-card[data-selection-row]")
    : document.querySelectorAll(".selection-card[data-selection-row]");
  if (selectionRows.length > 0) {
    const newProgress = [];
    selectionRows.forEach((row) => {
      const originalIndex = Number(row.dataset.selectionRow);
      // 元のオブジェクトがあればそれをベースにする（隠しプロパティ維持のため）
      const originalData = candidate.selectionProgress?.[originalIndex] || {};
      const newData = { ...originalData };

      const inputs = row.querySelectorAll("[data-detail-field]");
      let hasInput = false;

      inputs.forEach((input) => {
        const fieldPath = input.dataset.detailField;
        if (!fieldPath) return;

        const parts = fieldPath.split(".");
        const key = parts[parts.length - 1];

        // Lambda(DB)が期待するキー名へ変換
        const keyMap = {
          "recommendationDate": "recommendedAt",
          "firstInterviewAdjustDate": "firstInterviewSetAt",
          "firstInterviewDate": "firstInterviewAt",
          "secondInterviewAdjustDate": "secondInterviewSetAt",
          "secondInterviewDate": "secondInterviewAt",
          "finalInterviewAdjustDate": "finalInterviewSetAt",
          "finalInterviewDate": "finalInterviewAt",
          "offerDate": "offerDate",
          "offerAcceptedDate": "offerAcceptDate",
          "joinedDate": "joinDate",
          "declinedDate": "declinedAfterOfferAt",
          "earlyTurnoverDate": "earlyTurnoverAt",
          "closingForecastDate": "closeExpectedAt"
        };
        const mappedKey = keyMap[key] || key;

        let rawValue = input.value;
        if (input.dataset.valueType === "number") {
          rawValue = rawValue === "" ? null : Number(rawValue);
        }
        if (["fee", "feeAmount", "refundAmount"].includes(mappedKey)) {
          rawValue = convertManToYen(rawValue);
        }
        newData[mappedKey] = rawValue;
        if (rawValue !== "" && rawValue !== null && rawValue !== undefined) hasInput = true;
      });

      const fixedRoute = getCandidateSourceName(candidate);
      if (fixedRoute) {
        newData.route = fixedRoute;
        newData.applyRoute = fixedRoute;
        newData.apply_route = fixedRoute;
      }

      // スネークケース(フォールバック)
      if (newData.clientId) newData.client_id = newData.clientId;
      if (newData.companyName) newData.company_name = newData.companyName;
      newData.selection_status = newData.status || newData.selectionStatus;

      if (newData.clientId || hasInput) {
        newProgress.push(newData);
      }
    });

    candidate.selectionProgress = newProgress;
  }

  normalizeCandidate(candidate);

  console.log("[saveCandidateRecord] Before ensureSelectionProgressClientIds, selectionProgress:", candidate.selectionProgress);

  // Ensure selection progress rows include clientId (Lambda requires it for INSERT).
  // This also supports free-text companyName input by resolving/creating clients.
  if (includeDetail) {
    await ensureSelectionProgressClientIds(candidate);
    syncMoneyInfoFromSelectionProgress(candidate);
  }

  console.log("[saveCandidateRecord] After ensureSelectionProgressClientIds, selectionProgress:", candidate.selectionProgress);

  const payload = includeDetail
    ? buildCandidateDetailPayload(candidate)
    : {
      id: candidate.id,
      validApplication: resolveValidApplication(candidate),
      csStatus: (candidate.csStatus ?? candidate.cs_status) || null,
      cs_status: (candidate.csStatus ?? candidate.cs_status) || null,
    };

  // ★ Lambdaが必須とするフラグ
  if (includeDetail) {
    payload.detailMode = true;
    payload.selection_progress = candidate.selectionProgress;
  }

  // ★ Lambdaが必須とするフラグを確実にセット
  if (includeDetail) {
    payload.detailMode = true;
    const deletedIds = pendingDeletedSelectionIds[currentDetailCandidateId];
    if (Array.isArray(deletedIds) && deletedIds.length > 0) {
      payload.deletedSelectionProgressIds = deletedIds;
    }
  }

  if (payload?.masters) delete payload.masters;

  console.log("Saving payload:", payload); // Debug log

  const response = await fetch(candidatesApi(candidateDetailPath(candidate.id)), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText} - ${text.slice(0, 200)} `);
  }

  // Clear deletion cache on success
  delete pendingDeletedSelectionIds[currentDetailCandidateId];

  const rawUpdated = await response.json();
  if (rawUpdated.cs_mail_sent) {
    window.alert("🎉 自動メールを送信しました！\n（※反映まで少し時間がかかる場合があります）");
  }
  const updated = normalizeCandidate(rawUpdated);

  // サーバーからのレスポンスにローカルで変更したselectionProgressを上書き
  // （サーバーが空の配列を正しく返さない場合への対策）
  if (includeDetail && Array.isArray(candidate.selectionProgress)) {
    updated.selectionProgress = candidate.selectionProgress;
    console.log("[saveCandidateRecord] Preserved local selectionProgress:", updated.selectionProgress);
  }

  delete pendingInlineUpdates[String(candidate.id)];
  applyCandidateUpdate(updated, { preserveDetailState });
  return updated;
}

function buildCandidateDetailPayload(candidate) {
  const address =
    candidate.address ||
    [candidate.addressPref, candidate.addressCity, candidate.addressDetail]
      .filter(Boolean)
      .join("");
  const contactTime = candidate.contactPreferredTime || candidate.contactTime || "";
  const companyName = candidate.applyCompanyName || candidate.companyName || "";
  const jobName = candidate.applyJobName || candidate.jobName || "";
  const source = candidate.applyRouteText || candidate.source || "";
  const remarks = candidate.applicationNote ?? candidate.remarks ?? "";
  const hearingMemo =
    candidate.firstInterviewNote || candidate.hearing?.memo || candidate.hearingMemo || "";
  const hearingFreeMemo =
    candidate.hearingFreeMemo || candidate.hearing?.freeMemo || candidate.hearing?.free_memo || "";
  const hearing = {
    ...(candidate.hearing || {}),
    memo: hearingMemo,
    freeMemo: hearingFreeMemo,
    mandatoryInterviewItems: candidate.mandatoryInterviewItems,
    desiredLocation: candidate.desiredLocation,
    desiredJobType: candidate.desiredJobType,
    currentIncome: candidate.currentIncome,
    desiredIncome: candidate.desiredIncome,
    employmentStatus: candidate.employmentStatus,
    careerReason: candidate.careerReason,
    careerMotivation: candidate.careerMotivation,
    transferTiming: candidate.transferTiming,
    skills: candidate.skills,
    personality: candidate.personality,
    workExperience: candidate.workExperience,
    otherSelectionStatus: candidate.otherSelectionStatus,
    desiredInterviewDates: candidate.desiredInterviewDates,
    recommendationText: candidate.recommendationText,
    jobChangeAxis: candidate.jobChangeAxis,
    jobChangeTiming: candidate.jobChangeTiming,
    futureVision: candidate.futureVision,
    mandatoryInterviewItems: candidate.mandatoryInterviewItems,
    sharedInterviewDate: candidate.sharedInterviewDate,
  };
  const actionInfo = {
    ...(candidate.actionInfo || {}),
    nextActionDate: candidate.nextActionDate || candidate.actionInfo?.nextActionDate || null,
  };

  const payload = {
    id: candidate.id,
    detailMode: true,
    validApplication: resolveValidApplication(candidate),

    // 基本情報
    candidateName: candidate.candidateName,
    candidateKana: candidate.candidateKana,
    gender: candidate.gender,
    birthDate: candidate.birthday, // Lambda expects birthDate equivalent
    phone: candidate.phone,
    email: candidate.email,
    postalCode: candidate.postalCode,
    addressPref: candidate.addressPref,
    addressCity: candidate.addressCity,
    addressDetail: candidate.addressDetail,
    education: candidate.education, // finalEducation mapped to education

    // 詳細
    nationality: candidate.nationality,
    japaneseLevel: candidate.japaneseLevel,
    contactPreferredTime: candidate.contactPreferredTime || contactTime,
    nextActionDate: candidate.nextActionDate || actionInfo.nextActionDate || null,
    nextActionNote: candidate.nextActionNote || null,
    contactTime,
    firstContactPlannedAt: candidate.firstContactPlannedAt,
    scheduleConfirmedAt: candidate.scheduleConfirmedAt,
    firstInterviewDate: candidate.firstInterviewDate,
    attendanceConfirmed: candidate.attendanceConfirmed,
    desiredLocation: candidate.desiredLocation,
    desiredJobType: candidate.desiredJobType,
    skills: candidate.skills,
    personality: candidate.personality,
    workExperience: candidate.workExperience,
    employmentStatus: candidate.employmentStatus,
    currentIncome: candidate.currentIncome,
    desiredIncome: candidate.desiredIncome,
    careerMotivation: candidate.careerMotivation,
    careerReason: candidate.careerReason,
    transferTiming: candidate.transferTiming,
    otherSelectionStatus: candidate.otherSelectionStatus,
    interviewPreferredDate: candidate.interviewPreferredDate,
    mandatoryInterviewItems: candidate.mandatoryInterviewItems,
    applyCompanyName: candidate.applyCompanyName || companyName,
    applyJobName: candidate.applyJobName || jobName,
    applyRouteText: candidate.applyRouteText || source,
    applicationNote: candidate.applicationNote ?? remarks, // 備考入力は applicationNote で行われるため優先
    firstInterviewNote: candidate.firstInterviewNote || hearingMemo,
    firstInterviewNote: candidate.firstInterviewNote || hearingMemo,
    recommendationText: candidate.recommendationText,
    jobChangeAxis: candidate.jobChangeAxis,
    jobChangeTiming: candidate.jobChangeTiming,
    futureVision: candidate.futureVision,
    otherSelectionStatus: candidate.otherSelectionStatus,
    hasChronicDisease: candidate.hasChronicDisease,
    chronicDiseaseDetail: candidate.chronicDiseaseDetail,
    relocationPossible: candidate.relocationPossible,
    relocationImpossibleReason: candidate.relocationImpossibleReason,
    personalConcerns: candidate.personalConcerns,
    desiredInterviewDates: candidate.desiredInterviewDates,
    mandatoryInterviewItems: candidate.mandatoryInterviewItems,
    sharedInterviewDate: candidate.sharedInterviewDate,
    advisorUserId: candidate.advisorUserId,
    csUserId: candidate.csUserId,
    partnerUserId: candidate.partnerUserId ?? candidate.csUserId ?? null,
    csStatus: (candidate.csStatus ?? candidate.cs_status) || null,
    cs_status: (candidate.csStatus ?? candidate.cs_status) || null,

    // その他（後方互換性のため残すものもあるが、Lambdaが使うものだけで良い）
    advisorName: candidate.advisorName,
    partnerName: candidate.partnerName,
    companyName,
    jobName,
    source,
    remarks,
    address,
    memoDetail: candidate.memoDetail,
    hearing,
    hearingMemo,
    hearingFreeMemo,
    meetingPlans: candidate.meetingPlans,
    resumeDocuments: candidate.resumeDocuments,
    selectionProgress: candidate.selectionProgress,
    afterAcceptance: candidate.afterAcceptance,
    refundInfo: candidate.refundInfo,
    moneyInfo: candidate.moneyInfo,
    actionInfo,
    csChecklist: candidate.csChecklist,
  };

  payload.advisor_user_id = candidate.advisorUserId ?? null;
  payload.cs_user_id = candidate.csUserId ?? null;
  payload.partner_user_id = candidate.partnerUserId ?? candidate.csUserId ?? null;
  payload.japanese_level = candidate.japaneseLevel;
  payload.next_action_date = payload.nextActionDate;

  return payload;
}

// -----------------------
// applyCandidateUpdate
// -----------------------
function mergeCandidateUpdate(updated) {
  if (!updated || !updated.id) return null;

  const mergeIntoList = (list) => {
    const index = list.findIndex((item) => String(item.id) === String(updated.id));
    if (index !== -1) {
      Object.assign(list[index], updated);
      return list[index];
    }
    return null;
  };

  return mergeIntoList(allCandidates) || mergeIntoList(filteredCandidates) || updated;
}

function applyCandidateUpdate(updated, { preserveDetailState = true } = {}) {
  const mergedCandidate = mergeCandidateUpdate(updated);
  if (!mergedCandidate) return;

  refreshCandidateValidity(mergedCandidate);
  renderCandidatesTable(filteredCandidates);

  if (selectedCandidateId && String(selectedCandidateId) === String(mergedCandidate.id)) {
    renderCandidateDetail(mergedCandidate, { preserveEditState: preserveDetailState });
  }
  highlightSelectedRow();
}

function batchApplyCandidateUpdates(
  updates,
  { preserveDetailState = true, renderDetail = true } = {}
) {
  if (!Array.isArray(updates) || updates.length === 0) return;
  updates.forEach((updated) => {
    const merged = mergeCandidateUpdate(updated);
    if (merged) refreshCandidateValidity(merged);
  });
  renderCandidatesTable(filteredCandidates);
  if (renderDetail && selectedCandidateId) {
    const selected = getSelectedCandidate();
    if (selected) {
      renderCandidateDetail(selected, { preserveEditState: preserveDetailState });
    }
  }
  highlightSelectedRow();
}

// =========================
// イベントハンドラ等
// =========================
function initializeDetailContentListeners() {
  const container = getCandidateDetailContainer();
  if (!container) return;

  if (detailContentHandlers.click) {
    container.removeEventListener("click", detailContentHandlers.click);
  }
  if (detailContentHandlers.input) {
    container.removeEventListener("input", detailContentHandlers.input);
    container.removeEventListener("change", detailContentHandlers.input);
  }

  detailContentHandlers.click = handleDetailContentClick;
  detailContentHandlers.input = handleDetailFieldChange;

  container.addEventListener("click", detailContentHandlers.click);
  container.addEventListener("input", detailContentHandlers.input);
  container.addEventListener("change", detailContentHandlers.input);

  // console.log('[candidates] Detail listeners attached');
}
function escapeHtmlAttr(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatDateJP(dateLike) {
  if (!dateLike) return "-";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return dateLike;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year} /${month}/${day} `;
}
function formatDateTimeJP(dateTimeLike) {
  if (!dateTimeLike) return "-";
  const date = new Date(dateTimeLike);
  if (Number.isNaN(date.getTime())) return dateTimeLike;
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${formatDateJP(dateTimeLike)} ${hours}:${minutes} `;
}
function formatDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

function formatMoneyToMan(value) {
  if (value === null || value === undefined || value === "") return "-";
  const text = String(value).trim();
  if (!text) return "-";
  const hasMan = text.includes("万");
  const nums = text.match(/-?\d[\d,]*/g);
  if (!nums || !nums.length) return text;

  const toMan = (raw) => {
    const cleaned = String(raw).replace(/,/g, "");
    const num = Number(cleaned);
    if (!Number.isFinite(num)) return null;
    if (hasMan) return Math.round(num);
    if (num >= 10000) return Math.floor(num / 10000);
    return Math.round(num);
  };

  if (nums.length >= 2 && /[~\\-ー]/.test(text)) {
    const min = toMan(nums[0]);
    const max = toMan(nums[1]);
    if (min === null || max === null) return text;
    return `${min} -${max} 万円`;
  }

  const single = toMan(nums[0]);
  if (single === null) return text;
  return `${single} 万円`;
}
function calculateAge(birthday) {
  if (!birthday) return null;
  const birthDate = new Date(birthday);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

// -----------------------
// モーダル
// -----------------------
function initializeDetailModal() {
  const modal = document.getElementById("candidateDetailModal");
  const closeButton = document.getElementById("candidateDetailClose");

  if (modal) {
    modalHandlers.overlay = (event) => {
      if (event.target === modal) closeCandidateModal();
    };
    modal.addEventListener("click", modalHandlers.overlay);
  }

  if (closeButton) {
    modalHandlers.closeButton = () => closeCandidateModal();
    closeButton.addEventListener("click", modalHandlers.closeButton);
  }

  modalHandlers.keydown = (event) => {
    if (event.key === "Escape" && isCandidateModalOpen()) closeCandidateModal();
  };
  document.addEventListener("keydown", modalHandlers.keydown);
}
function openCandidateModal() {
  const modal = document.getElementById("candidateDetailModal");
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal-open");
}
function resolveCandidateForConfirm() {
  const selected = getSelectedCandidate();
  if (selected) return selected;
  if (currentDetailCandidateId) {
    const fromAll = allCandidates.find((item) => String(item.id) === String(currentDetailCandidateId));
    if (fromAll) return fromAll;
    const fromFiltered = filteredCandidates.find((item) => String(item.id) === String(currentDetailCandidateId));
    if (fromFiltered) return fromFiltered;
  }
  return null;
}

export function confirmCandidateDetailClose() {
  const candidate = resolveCandidateForConfirm();
  if (!candidate) return true;
  const tasks = candidate.tasks ?? candidate.detail?.tasks ?? [];
  const hasIncompleteTasks = Array.isArray(tasks) && tasks.some((t) => !t.isCompleted);
  const hasNextActionDate = Boolean(
    candidate.nextActionDate ??
    candidate.actionInfo?.nextActionDate ??
    candidate.detail?.actionInfo?.nextActionDate ??
    candidate.detail?.actionInfo?.next_action_date ??
    null
  );
  if (!hasIncompleteTasks && !hasNextActionDate) {
    return confirm("⚠️ 次回アクションが未設定です。\n\n・選考継続中：新規アクションを追加して保存してください。\n・選考終了：「選考完了」ボタンを押してください。\n\nこのまま画面を閉じますか？");
  }
  return true;
}

function closeCandidateModal({ clearSelection = true, force = false } = {}) {
  const modal = document.getElementById("candidateDetailModal");
  if (!modal) return;

  // バリデーション（強制クローズでない場合）
  if (!force) {
    if (!confirmCandidateDetailClose()) return;
  }

  const wasOpen = modal.classList.contains("is-open");
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  if (wasOpen) setCandidateDetailPlaceholder();
  document.body.classList.remove("has-modal-open");
  if (clearSelection) selectedCandidateId = null;
  highlightSelectedRow();
}
window.closeCandidateModal = closeCandidateModal;
function isCandidateModalOpen() {
  const modal = document.getElementById("candidateDetailModal");
  return modal ? modal.classList.contains("is-open") : false;
}

function resetDetailEditState() {
  detailSectionKeys.forEach((key) => (detailEditState[key] = false));
}

// -----------------------
// 後片付け
// -----------------------
function cleanupCandidatesEventListeners() {
  closeCandidateModal({ clearSelection: false, force: true });

  filterConfig.forEach(({ id, event }) => {
    const element = document.getElementById(id);
    if (element) element.removeEventListener(event, handleFilterChange);
  });


  const resetButton = document.getElementById("candidatesFilterReset");
  if (resetButton) resetButton.removeEventListener("click", handleFilterReset);

  const sortSelect = document.getElementById("candidatesSortOrder");
  if (sortSelect) sortSelect.removeEventListener("change", handleFilterChange);

  const tableBody = document.getElementById("candidatesTableBody");
  if (tableBody) {
    tableBody.removeEventListener("click", handleTableClick);
    tableBody.removeEventListener("dblclick", handleTableDoubleClick);
    tableBody.removeEventListener("touchend", handleTableTouchEnd);
    tableBody.removeEventListener("input", handleInlineEdit);
    tableBody.removeEventListener("change", handleInlineEdit);
  }
  const tableHead = document.querySelector(".candidates-table-card thead");
  if (tableHead) tableHead.removeEventListener("click", handleCandidatesHeaderClick);

  const toggleButton = document.getElementById("candidatesToggleEdit");
  if (toggleButton) toggleButton.removeEventListener("click", toggleCandidatesEditMode);

  const tabButtons = document.querySelectorAll("[data-candidates-tab]");
  tabButtons.forEach((button) => {
    button.removeEventListener("click", handleCandidatesTabClick);
  });
  const calendarNavButtons = document.querySelectorAll("[data-calendar-nav]");
  calendarNavButtons.forEach((button) => {
    button.removeEventListener("click", handleCalendarNavClick);
  });
  const calendarBody = document.getElementById("candidatesCalendarBody");
  if (calendarBody) calendarBody.removeEventListener("click", handleCalendarEventClick);

  const modal = document.getElementById("candidateDetailModal");
  const closeButton = document.getElementById("candidateDetailClose");

  if (modal && modalHandlers.overlay) {
    modal.removeEventListener("click", modalHandlers.overlay);
    modalHandlers.overlay = null;
  }
  if (closeButton && modalHandlers.closeButton) {
    closeButton.removeEventListener("click", modalHandlers.closeButton);
    modalHandlers.closeButton = null;
  }
  if (modalHandlers.keydown) {
    document.removeEventListener("keydown", modalHandlers.keydown);
    modalHandlers.keydown = null;
  }

  const detailContent = document.getElementById("candidateDetailContent");
  const detailContentPage = document.getElementById("candidateDetailContentPage");
  [detailContent, detailContentPage].filter(Boolean).forEach((el) => {
    if (detailContentHandlers.click) el.removeEventListener("click", detailContentHandlers.click);
    if (detailContentHandlers.input) {
      el.removeEventListener("input", detailContentHandlers.input);
      el.removeEventListener("change", detailContentHandlers.input);
    }
  });
  detailContentHandlers.click = null;
  detailContentHandlers.input = null;

  if (csStatusStorageListener) {
    window.removeEventListener("storage", csStatusStorageListener);
    csStatusStorageListener = null;
  }
}

// ====== Detail Content Handlers ======

function handleDetailContentClick(event) {
  const editBtn = event.target.closest("[data-section-edit]");
  if (editBtn) {
    toggleDetailSectionEdit(editBtn.dataset.sectionEdit);
    return;
  }

  const addCsStatusOptionBtn = event.target.closest("[data-add-cs-status-option]");
  if (addCsStatusOptionBtn) {
    handleAddCsStatusOption(addCsStatusOptionBtn);
    return;
  }

  const addBtn = event.target.closest("[data-add-row]");
  if (addBtn) {
    handleDetailAddRow(addBtn.dataset.addRow);
    return;
  }

  const removeBtn = event.target.closest("[data-remove-row]");
  console.log("[handleDetailContentClick] removeBtn check:", removeBtn, "target:", event.target);
  if (removeBtn) {
    console.log("[handleDetailContentClick] removeBtn found:", removeBtn.dataset);
    // Prevent duplicate handling by document-level handlers
    event.stopPropagation();
    handleDetailRemoveRow(
      removeBtn.dataset.removeRow,
      Number(removeBtn.dataset.index)
    );
    return;
  }

  // 完了登録ボタン（新しいtaskId方式）
  const completeBtn = event.target.closest("[data-complete-task-id]");
  if (completeBtn) {
    const taskId = completeBtn.dataset.completeTaskId;
    handleCompleteTask(taskId);
    return;
  }

  const deleteTaskBtn = event.target.closest("[data-delete-task-id]");
  if (deleteTaskBtn) {
    const taskId = deleteTaskBtn.dataset.deleteTaskId;
    handleDeleteTask(taskId);
    return;
  }

  // 選考完了ボタン（強制クローズ）
  const selectionCompleteBtn = event.target.closest("[data-selection-complete]");
  if (selectionCompleteBtn) {
    if (confirm("選考を完了として画面を閉じますか？")) {
      closeCandidateModal({ force: true });
    }
    return;
  }

  // PDF ダウンロードボタン
  const resumeBtn = event.target.closest("[data-download-resume]");
  if (resumeBtn) {
    const candidate = getSelectedCandidate();
    if (candidate && candidate.id) {
      window.open(candidatesApi(`${candidateDetailPath(candidate.id)}/resume.pdf`), "_blank");
    }
    return;
  }

  const cvBtn = event.target.closest("[data-download-cv]");
  if (cvBtn) {
    const candidate = getSelectedCandidate();
    if (candidate && candidate.id) {
      window.open(candidatesApi(`${candidateDetailPath(candidate.id)}/cv.pdf`), "_blank");
    }
    return;
  }
}

function handleAddCsStatusOption(button) {
  if (!button) return;
  const fieldPath = String(button.dataset.addCsStatusOption || "csStatus");
  const editor = button.closest("[data-cs-status-editor]");
  if (!editor) return;

  const input = editor.querySelector("[data-cs-status-new]");
  const select = editor.querySelector(`select[data-detail-field="${fieldPath}"]`) || editor.querySelector("select[data-detail-field]");
  const value = normalizeCsStatusOption(input?.value);
  if (!value) return;

  rememberCsStatusOption(value, { allowRestore: true });

  if (select) {
    const exists = Array.from(select.options || []).some((option) => String(option.value) === value);
    if (!exists) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const candidate = getSelectedCandidate();
  if (candidate) {
    candidate.csStatus = value;
    candidate.cs_status = value;
  }

  if (input) input.value = "";
}

function syncDetailSectionInputs(sectionKey) {
  if (!sectionKey) return;
  const section = document.querySelector(`.candidate-detail-section[data-section="${sectionKey}"], .detail-card[data-section="${sectionKey}"]`);
  if (!section) {
    console.error(`[candidates] syncDetailSectionInputs: Section not found for key "${sectionKey}". Please reload.`);
    alert("画面の状態が古いため保存できませんでした。ページをリロードしてください。");
    return;
  }
  const inputs = section.querySelectorAll("[data-detail-field], [data-array-field]");
  if (inputs.length === 0) {
    console.warn(`[candidates] syncDetailSectionInputs: No inputs found in section "${sectionKey}"`);
  }
  inputs.forEach((input) => {
    handleDetailFieldChange({ target: input });
  });
}

async function toggleDetailSectionEdit(sectionKey) {
  try {
    console.log("[toggleDetailSectionEdit] called for:", sectionKey);
    if (!sectionKey || !(sectionKey in detailEditState)) return;

    const wasEditing = detailEditState[sectionKey];
    // 切り替え後の状態
    const nextState = !wasEditing;

    const candidate = getSelectedCandidate();
    if (!candidate) return;

    if (wasEditing) {
      // 編集モード終了時 (保存処理)

      // 1. まず同期 (これでcandidateオブジェクトが更新される)
      try {
        syncDetailSectionInputs(sectionKey);
      } catch (syncError) {
        console.error("Sync inputs error:", syncError);
        // エラーでも続行し、下のsaveCandidateRecord内のDOMスクレイピングに賭ける
      }

      // 2. 保存実行 (DOMがまだ編集モードの状態で呼ぶ！これによりスクレイピングが機能する)
      // 状態は保存成功までとりあえず変えないでおく、あるいは保存成功後に変える
      // ここでは一時的に状態を変えず、保存に成功したら nextState (false) にする

      try {
        // 保存時はまだ編集モードのDOMが必要
        const updated = await saveCandidateRecord(candidate, { preserveDetailState: false, includeDetail: true });

        // 3. 成功したら状態を閲覧モードへ
        detailEditState[sectionKey] = false;

        renderCandidatesTable(filteredCandidates);
        highlightSelectedRow();
        renderCandidateDetail(updated, { preserveEditState: false });

      } catch (error) {
        console.error("詳細の保存に失敗しました。", error);
        alert(`保存に失敗しました。ネットワーク状態を確認してください。\n${error.message}`);
        // 保存失敗時は編集モードのままにする (DOMは残っているので何もしなくてよい)
        // ただし状態変数は戻す必要なし(まだ変えていないから)

        // もし sync で中途半端に更新されていたら？
        // DOMが残っているのでユーザーは再試行できる。
      }

    } else {
      // 編集モード開始時
      detailEditState[sectionKey] = true;
      renderCandidateDetail(candidate, { preserveEditState: true });
    }

  } catch (e) {
    console.error("toggleDetailSectionEdit unexpected error:", e);
    alert(`予期せぬエラーが発生しました: ${e.message}`);
  }
}

function handleDetailAddRow(type) {
  const candidate = getSelectedCandidate();
  if (!candidate) return;

  switch (type) {
    case "meetingPlans": {
      candidate.meetingPlans = candidate.meetingPlans || [];
      const list = candidate.meetingPlans;
      const nextSequence = list.length + 2;
      list.push({ sequence: nextSequence, plannedDate: "", attendance: false });
      break;
    }
    case "resumeDocuments": {
      candidate.resumeDocuments = candidate.resumeDocuments || [];
      const docs = candidate.resumeDocuments;
      docs.push({ label: `経歴書${docs.length + 1} `, value: "" });
      break;
    }
    case "selectionProgress": {
      candidate.selectionProgress = candidate.selectionProgress || [];
      candidate.selectionProgress.push({});
      break;
    }
    default:
      break;
  }

  const current = getSelectedCandidate();
  if (current) renderCandidateDetail(current, { preserveEditState: true });
}

function handleDetailRemoveRow(type, index) {
  console.log("[handleDetailRemoveRow] called:", { type, index });
  const candidate = getSelectedCandidate();
  console.log("[handleDetailRemoveRow] candidate:", candidate);
  if (!candidate || Number.isNaN(index)) {
    console.warn("[handleDetailRemoveRow] Early return - candidate:", !!candidate, "index:", index);
    return;
  }

  switch (type) {
    case "meetingPlans": {
      const list = candidate.meetingPlans || [];
      list.splice(index, 1);
      list.forEach((plan, idx) => (plan.sequence = idx + 2));
      candidate.meetingPlans = list;
      break;
    }
    case "resumeDocuments": {
      const docs = candidate.resumeDocuments || [];
      docs.splice(index, 1);
      candidate.resumeDocuments = docs;
      break;
    }
    case "selectionProgress": {
      if (!confirm("この選考プロセスを削除しますか？")) return;
      const rows = candidate.selectionProgress || [];
      const removedRow = rows[index];
      const removedId =
        removedRow?.id ??
        removedRow?.ID ??
        removedRow?.applicationId ??
        removedRow?.application_id;
      if (removedId && currentDetailCandidateId) {
        if (!pendingDeletedSelectionIds[currentDetailCandidateId]) {
          pendingDeletedSelectionIds[currentDetailCandidateId] = [];
        }
        const existing = pendingDeletedSelectionIds[currentDetailCandidateId];
        if (!existing.includes(removedId)) {
          existing.push(removedId);
        }
      }
      rows.splice(index, 1);
      candidate.selectionProgress = rows;
      break;
    }
    default:
      break;
  }

  console.log("[handleDetailRemoveRow] After deletion, selectionProgress length:", candidate.selectionProgress?.length);
  // 変更を加えたのと同じcandidateオブジェクトを使って再描画
  renderCandidateDetail(candidate, { preserveEditState: true });
}

async function handleCompleteTask(taskId) {
  const candidate = getSelectedCandidate();
  if (!candidate || !taskId) return;

  if (!confirm('このタスクを完了としてマークしますか？')) {
    return;
  }

  try {
    const normalizedTaskId = String(taskId);
    // completeTaskIdをpayloadに含めて保存
    const payload = {
      id: candidate.id,
      detailMode: true,
      completeTaskId: taskId,
    };

    const response = await fetch(candidatesApi(candidateDetailPath(candidate.id)), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText} - ${text.slice(0, 200)}`);
    }

    const updated = normalizeCandidate(await response.json(), { source: "detail" });

    const fallbackTasks = Array.isArray(updated.tasks)
      ? updated.tasks
      : Array.isArray(updated.detail?.tasks)
        ? updated.detail.tasks
        : Array.isArray(candidate.tasks)
          ? candidate.tasks
          : [];

    const tasksAfterComplete = (fallbackTasks || []).map((task) => {
      if (String(task?.id) !== normalizedTaskId) return task;
      return {
        ...task,
        isCompleted: true,
      };
    });

    const hasIncompleteTasks = tasksAfterComplete.some((task) => !task.isCompleted);

    if (!hasIncompleteTasks) {
      updated.nextActionDate = null;
      if (!updated.actionInfo) updated.actionInfo = {};
      updated.actionInfo.nextActionDate = null;
      if (candidate.id != null) {
        nextActionCache.set(String(candidate.id), null);
      }
    }

    if (!Array.isArray(updated.tasks) && Array.isArray(candidate.tasks)) {
      updated.tasks = tasksAfterComplete;
    }

    applyCandidateUpdate(updated, { preserveDetailState: true });

  } catch (error) {
    console.error('タスク完了登録に失敗しました:', error);
    alert(`タスク完了登録に失敗しました。\n${error.message}`);
  }
}


async function handleDeleteTask(taskId) {
  const candidate = getSelectedCandidate();
  if (!candidate || !taskId) return;

  if (!confirm('この予定を削除しますか？')) {
    return;
  }

  console.log("Starting handleDeleteTask", { taskId, candidateId: candidate.id });

  try {
    const currentTasks = candidate.tasks || [];
    const newTasks = currentTasks.filter(t => String(t.id) !== String(taskId));
    console.log("Tasks filtering:", { before: currentTasks.length, after: newTasks.length });

    // Also filter meetingPlans if they share the same ID space (likely)
    const currentMeetingPlans = candidate.meetingPlans || [];
    const newMeetingPlans = currentMeetingPlans.filter(p => String(p.id) !== String(taskId));
    console.log("MeetingPlans filtering:", { before: currentMeetingPlans.length, after: newMeetingPlans.length });

    const payload = {
      id: candidate.id,
      detailMode: true,
      tasks: newTasks,
      meetingPlans: newMeetingPlans,
      deleteTaskId: taskId // Keep legacy/command key
    };

    console.log("Sending DELETE payload:", payload);

    const response = await fetch(candidatesApi(candidateDetailPath(candidate.id)), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log("Response status:", response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error("Delete failed response:", text);
      throw new Error(`HTTP ${response.status} ${response.statusText} - ${text.slice(0, 200)}`);
    }

    const json = await response.json();
    console.log("Response JSON:", json);

    const updated = normalizeCandidate(json);
    applyCandidateUpdate(updated, { preserveDetailState: true });
    console.log("Candidate updated successfully.");

  } catch (error) {
    console.error('タスク削除に失敗しました:', error);
    alert(`タスク削除に失敗しました。\n${error.message}`);
  }
}

function handleDetailFieldChange(event) {
  const target = event.target;
  if (!target) return;
  const candidate = getSelectedCandidate();
  if (!candidate) return;
  const oldCsStatus = candidate.csStatus;

  // checkbox群（配列に入れるタイプ）
  const arrayField = target.dataset.arrayField;
  if (arrayField) {
    updateCandidateArrayField(
      candidate,
      arrayField,
      target.dataset.arrayValue,
      target.checked
    );
    return;
  }

  const fieldPath = target.dataset.detailField;
  if (!fieldPath) return;

  let value;
  if (target.type === "checkbox") {
    value = target.checked;
  } else {
    value = target.value;
  }

  const valueType = target.dataset.valueType;
  if (valueType === "number") {
    if (value === "") {
      value = "";
    } else {
      const parsed = Number(value);
      value = Number.isFinite(parsed) ? parsed : "";
    }
  }
  if (valueType === "boolean") {
    if (value === "" || value === null || value === undefined) {
      value = null;
    } else {
      value = value === true || value === "true";
    }
  }

  const sectionKey = target.dataset.detailSection;
  value = normalizeMoneyInputValue(value, fieldPath, sectionKey);

  updateCandidateFieldValue(candidate, fieldPath, value);

  if (fieldPath === "attendanceConfirmed") {
    scheduleDetailAutoSave(candidate);
  }

  if (fieldPath === "birthday") {
    candidate.age = calculateAge(candidate.birthday);
  }

  if (fieldPath === "advisorUserId") {
    candidate.advisorName = resolveUserName(candidate.advisorUserId);
    candidate.partnerName = candidate.advisorName;
  }
  if (fieldPath === "csUserId") {
    candidate.csName = resolveUserName(candidate.csUserId);
    candidate.partnerUserId = candidate.csUserId;
  }
  if (fieldPath === "partnerUserId") {
    candidate.partnerName = resolveUserName(candidate.partnerUserId);
  }
  if (fieldPath === "csStatus" || fieldPath === "cs_status") {
    const normalized = normalizeCsStatusOption(value);
    const MAIL_TRIGGER_STATUSES = ["34歳以下メール(tech)", "35歳以上メール", "外国籍メール"];
    if (normalized !== oldCsStatus && MAIL_TRIGGER_STATUSES.includes(normalized)) {
      if (!window.confirm(`「${normalized}」に変更すると、保存時に候補者へ自動メールが送信されます。\n本当によろしいですか？`)) {
        target.value = oldCsStatus || "";
        return;
      }
    }
    candidate.csStatus = normalized;
    candidate.cs_status = normalized;
    rememberCsStatusOption(normalized);
  }
  if (fieldPath === "contactPreferredTime") {
    const normalized = normalizeContactPreferredTime(value);
    candidate.contactPreferredTime = normalized;
    candidate.contactTime = normalized;
    if (candidate.id != null) {
      const cacheKey = String(candidate.id);
      if (normalized) contactPreferredTimeCache.set(cacheKey, normalized);
      else contactPreferredTimeCache.delete(cacheKey);
    }
  }
  if (fieldPath === "applyCompanyName") {
    candidate.companyName = value;
  }
  if (fieldPath === "applyJobName") {
    candidate.jobName = value;
  }
  if (fieldPath === "applyRouteText") {
    candidate.source = value;
  }
  if (fieldPath === "applicationNote") {
    candidate.remarks = value;
  }
  if (fieldPath === "nextActionDate") {
    candidate.actionInfo = candidate.actionInfo || {};
    candidate.actionInfo.nextActionDate = value;
  }
  if (fieldPath === "firstInterviewNote") {
    candidate.hearing = candidate.hearing || {};
    candidate.hearing.memo = value;
    candidate.hearingMemo = value;
  }
  if (fieldPath === "hearingFreeMemo") {
    candidate.hearing = candidate.hearing || {};
    candidate.hearing.freeMemo = value;
    candidate.hearingFreeMemo = value;
  }

  const selectionMatch = fieldPath.match(/^selectionProgress\.(\d+)\./);
  if (selectionMatch) {
    const index = Number(selectionMatch[1]);
    const row = candidate.selectionProgress?.[index];
    if (row) {
      if (fieldPath.endsWith(".companyName") || fieldPath.endsWith(".company_name")) {
        const resolved = findClientByName(row.companyName);
        if (resolved?.id) {
          row.clientId = resolved.id;
          row.client_id = resolved.id;
        }
      }
      if (fieldPath.endsWith(".clientId")) {
        row.companyName = resolveClientName(row.clientId);
      }
      const status = resolveSelectionStageValue(row);
      row.status = status;
      updateSelectionStatusCell(index, status);
    }
  }
}

function scheduleDetailAutoSave(candidate) {
  if (!candidate) return;
  if (detailAutoSaveTimer) window.clearTimeout(detailAutoSaveTimer);
  detailAutoSaveTimer = window.setTimeout(async () => {
    try {
      await saveCandidateRecord(candidate, { preserveDetailState: true, includeDetail: true });
      renderCandidatesTable(filteredCandidates);
      highlightSelectedRow();
    } catch (error) {
      console.error("詳細の保存に失敗しました。", error);
    }
  }, 200);
}

function updateCandidateArrayField(candidate, fieldPath, optionValue, checked) {
  if (!optionValue) return;
  const { container, key } = getFieldContainer(candidate, fieldPath);
  if (!container) return;

  if (!Array.isArray(container[key])) container[key] = [];
  const list = container[key];

  const exists = list.includes(optionValue);
  if (checked && !exists) list.push(optionValue);
  if (!checked && exists) list.splice(list.indexOf(optionValue), 1);
}

function updateCandidateFieldValue(candidate, fieldPath, value) {
  const { container, key } = getFieldContainer(candidate, fieldPath);
  if (!container) return;

  if (Array.isArray(container)) {
    const index = Number(key);
    container[index] = value;
  } else {
    container[key] = value;
    // applicationNote / remarks 同期
    if (key === "applicationNote") {
      container["remarks"] = value;
    }
    if (key === "remarks") {
      container["applicationNote"] = value;
    }
  }
}

// "a.b.0.c" のようなパスを辿って、代入先の container と key を返す
function getFieldContainer(target, path) {
  const segments = path.split(".");
  let current = target;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    const nextKey = segments[i + 1];
    const nextIsIndex = /^\d+$/.test(nextKey);

    if (Array.isArray(current)) {
      const idx = Number(key);
      if (!current[idx]) current[idx] = nextIsIndex ? [] : {};
      current = current[idx];
      continue;
    }

    if (current[key] === undefined || current[key] === null) {
      current[key] = nextIsIndex ? [] : {};
    }
    current = current[key];
  }

  return { container: current, key: segments[segments.length - 1] };
}

function getSelectedCandidate() {
  if (!selectedCandidateId) return null;
  return (
    allCandidates.find((item) => String(item.id) === String(selectedCandidateId)) ||
    filteredCandidates.find((item) => String(item.id) === String(selectedCandidateId)) ||
    null
  );
}

// ====== /Detail Content Handlers ======

// -----------------------
// 詳細セクション
// -----------------------
function renderRegistrationSection(candidate) {
  const resolvedValid = resolveValidApplication(candidate);
  const fields = [
    { label: "登録日時", value: candidate.createdAt || candidate.registeredAt || candidate.registeredDate, type: "datetime", displayFormatter: formatDateTimeJP },
    { label: "担当者", value: candidate.advisorName },
    { label: "担当パートナー", value: candidate.partnerName },
    { label: "有効応募", value: resolvedValid, displayFormatter: (v) => (v ? "有効" : "無効") },
  ];
  return renderDetailGridFields(fields, "registration");
}

function renderMeetingSection(candidate) {
  return renderCsSection(candidate);
}

function renderAssigneeSection(candidate) {
  const fields = [
    {
      label: "担当CS",
      value: candidate.csUserId ?? "",
      input: "select",
      options: buildUserOptions(candidate.csUserId, candidate.csName, {
        allowedRoles: ["caller"], // role=caller is CS in this app
        blankLabel: "未設定",
        sourceList: masterCsUsers,
      }),
      valueType: "number",
      path: "csUserId",
      displayFormatter: () => candidate.csName || "-",
      span: 3,
    },
    {
      label: "担当アドバイザー",
      value: candidate.advisorUserId ?? "",
      input: "select",
      options: buildUserOptions(candidate.advisorUserId, candidate.advisorName, {
        allowedRoles: ["advisor"],
        blankLabel: "未設定",
        sourceList: masterAdvisorUsers,
      }),
      valueType: "number",
      path: "advisorUserId",
      displayFormatter: () => candidate.advisorName || "-",
      span: 3,
    },
  ];
  return renderDetailGridFields(fields, "assignees");
}

function renderApplicantInfoSection(candidate) {
  const age = calculateAge(candidate.birthday);
  const ageDisplay = age !== null ? `${age} 歳` : candidate.age ? `${candidate.age} 歳` : "-";
  const address = candidate.address || [candidate.addressPref, candidate.addressCity, candidate.addressDetail].filter(Boolean).join("");
  const basicFields = [
    { label: "求職者名", value: candidate.candidateName, path: "candidateName", span: 3 },
    { label: "ヨミガナ", value: candidate.candidateKana, path: "candidateKana", span: 3 },
    { label: "性別", value: candidate.gender, input: "select", options: ["男性", "女性", "未回答"], path: "gender", span: 1 },
    { label: "国籍", value: candidate.nationality, path: "nationality", span: 1 },
    { label: "言語レベル", value: candidate.japaneseLevel, input: "select", options: japaneseLevelOptions, path: "japaneseLevel", span: 1 },
    { label: "生年月日", value: candidate.birthday, type: "date", path: "birthday", displayFormatter: formatDateJP, span: 1 },
    { label: "年齢", value: ageDisplay, editable: false, span: 1 },
    { label: "郵便番号", value: candidate.postalCode, path: "postalCode", span: 1 },
    { label: "都道府県", value: candidate.addressPref, path: "addressPref", span: 1 },
    { label: "市区町村", value: candidate.addressCity, path: "addressCity", span: 1 },
    { label: "番地・建物", value: candidate.addressDetail, path: "addressDetail", span: "full" },
    { label: "最終学歴", value: candidate.education, path: "education", span: "full" },
  ];
  const contactFields = [
    { label: "電話番号", value: candidate.phone, type: "tel", path: "phone", span: 2 },
    { label: "メール", value: candidate.email, type: "email", path: "email", span: 2 },
    { label: "連絡希望時間帯", value: candidate.contactPreferredTime, path: "contactPreferredTime", span: 2 },
  ];
  const applicationFields = [
    { label: "応募企業名", value: candidate.applyCompanyName, path: "applyCompanyName", span: 2, editable: false },
    { label: "応募求人名", value: candidate.applyJobName, path: "applyJobName", span: 2 },
    { label: "応募経路", value: candidate.applyRouteText, path: "applyRouteText", span: 2, editable: false },
    { label: "備考", value: candidate.applicationNote, input: "textarea", path: "applicationNote", span: "full" },
  ];
  return [
    renderDetailSubsection("基本情報", renderDetailGridFields(basicFields, "profile")),
    renderDetailSubsection("連絡情報", renderDetailGridFields(contactFields, "profile")),
    renderDetailSubsection("応募情報・その他", renderDetailGridFields(applicationFields, "profile")),
  ].join("");
}

function resolveTeleapoHandoverMemo(candidate) {
  const logs = Array.isArray(candidate?.teleapoLogs) ? candidate.teleapoLogs : [];
  if (!logs.length) return "";
  const memoEntries = logs
    .map((log, index) => {
      const memo = String(log?.memo ?? log?.note ?? "").trim();
      if (!memo) return null;
      const rawDate = log?.calledAt ?? log?.called_at ?? log?.datetime ?? "";
      const ts = rawDate ? new Date(rawDate).getTime() : NaN;
      return { memo, ts: Number.isNaN(ts) ? null : ts, index };
    })
    .filter(Boolean);
  if (!memoEntries.length) return "";
  memoEntries.sort((a, b) => {
    if (a.ts !== null && b.ts !== null) return b.ts - a.ts;
    if (a.ts !== null) return -1;
    if (b.ts !== null) return 1;
    return a.index - b.index;
  });
  return memoEntries[0].memo;
}

function renderHearingSection(candidate) {
  const attendanceValue = candidate.attendanceConfirmed ?? false;
  const editing = detailEditState.hearing;
  const confirmationFields = [
    {
      label: "初回面談日時",
      value: candidate.firstInterviewDate,
      type: "datetime-local",
      path: "firstInterviewDate",
      displayFormatter: formatDateTimeJP,
      span: 1,
    },
    {
      label: "着座確認",
      value: attendanceValue,
      input: "checkbox",
      checkboxLabel: "確認済",
      path: "attendanceConfirmed",
      displayFormatter: (v) => (v ? "確認済" : "未"),
      span: 1,
    },
  ];

  const hearingFreeFields = [
    {
      label: "ヒアリング自由記述欄",
      value: candidate.hearingFreeMemo || candidate.hearing?.freeMemo || "",
      input: "textarea",
      path: "hearingFreeMemo",
      span: "full",
    },
  ];

  const hearingFields = [
    { label: "新規面談マスト項目", value: candidate.mandatoryInterviewItems, input: "textarea", path: "mandatoryInterviewItems", span: "full" },
    { label: "希望エリア", value: candidate.desiredLocation, path: "desiredLocation", span: 2 },
    { label: "希望職種", value: candidate.desiredJobType, path: "desiredJobType", span: 2 },
    { label: "現年収", value: candidate.currentIncome, path: "currentIncome", span: 1, displayFormatter: formatMoneyToMan },
    { label: "希望年収", value: candidate.desiredIncome, path: "desiredIncome", span: 1, displayFormatter: formatMoneyToMan },
    { label: "就業ステータス", value: candidate.employmentStatus, input: "select", options: employmentStatusOptions, path: "employmentStatus", span: 2 },
    { label: "転職理由", value: candidate.careerReason, input: "textarea", path: "careerReason", span: "full" },
    { label: "転職軸", value: candidate.careerMotivation, input: "textarea", path: "careerMotivation", span: "full" },
    { label: "転職時期", value: candidate.transferTiming, path: "transferTiming", span: 2 },
    { label: "将来のビジョン・叶えたいこと", value: candidate.futureVision, input: "textarea", path: "futureVision", span: "full" },
    { label: "資格・スキル", value: candidate.skills, input: "textarea", path: "skills", span: "full" },
    { label: "人物像・性格", value: candidate.personality, input: "textarea", path: "personality", span: "full" },
    { label: "実務経験", value: candidate.workExperience, input: "textarea", path: "workExperience", span: "full" },
    { label: "推薦文", value: candidate.firstInterviewNote, input: "textarea", path: "firstInterviewNote", span: "full" },
    {
      label: "面談メモ",
      value: candidate.firstInterviewNote || candidate.memo || "",
      input: "textarea",
      path: "firstInterviewNote",
      span: "full",
    },
    { label: "面接希望日", value: candidate.interviewPreferredDate, input: "textarea", path: "interviewPreferredDate", span: "full" },
  ];

  const newHearingFields = [
    {
      label: "他社選考状況", value: candidate.otherSelectionStatus, input: "select", options: [
        { value: "", label: "未選択" },
        { value: "0", label: "0" },
        { value: "1", label: "1" },
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
        { value: "5", label: "5" },
        { value: "6以上", label: "6以上" }
      ], path: "otherSelectionStatus", span: 2
    },
    {
      label: "持病", value: candidate.hasChronicDisease, input: "select", valueType: "boolean", options: [
        { value: "", label: "未確認" },
        { value: "true", label: "有り" },
        { value: "false", label: "無し" }
      ], path: "hasChronicDisease", span: 2,
      displayFormatter: (v) => v === true || v === "true" ? "有り" : v === false || v === "false" ? "無し" : "未確認"
    },
    { label: "持病の詳細", value: candidate.chronicDiseaseDetail, input: "textarea", path: "chronicDiseaseDetail", span: "full" },
    {
      label: "転居", value: candidate.relocationPossible, input: "select", valueType: "boolean", options: [
        { value: "", label: "未確認" },
        { value: "true", label: "可" },
        { value: "false", label: "不可" }
      ], path: "relocationPossible", span: 2,
      displayFormatter: (v) => v === true || v === "true" ? "可" : v === false || v === "false" ? "不可" : "未確認"
    },
    { label: "転居不可の理由", value: candidate.relocationImpossibleReason, input: "textarea", path: "relocationImpossibleReason", span: "full" },
    { label: "人物懸念", value: candidate.personalConcerns, input: "textarea", path: "personalConcerns", span: "full" },
  ];

  const handoverMemo = resolveTeleapoHandoverMemo(candidate);
  const handoverFields = [
    {
      label: "CSステータス",
      value: candidate.csStatus ?? "",
      span: 3,
      editable: false,
      displayFormatter: (v) => normalizeCsStatusOption(v) || "-",
    },
    {
      label: "架電メモ",
      value: handoverMemo,
      span: "full",
      editable: false,
    },
  ];
  return [
    renderDetailSubsection("面談実施確認", renderDetailGridFields(confirmationFields, "hearing"), "detail-subsection--confirm"),
    renderDetailSubsection("CS引継ぎ項目", renderDetailGridFields(handoverFields, "hearing")),
    renderDetailSubsection("追加ヒアリング項目", renderDetailGridFields(newHearingFields, "hearing")),
    renderDetailSubsection("ヒアリング自由記述欄", renderDetailGridFields(hearingFreeFields, "hearing")),
    renderDetailSubsectionToggle("ヒアリング項目", renderDetailGridFields(hearingFields, "hearing"), { open: editing }),
  ].join("");
}

function renderSelectionProgressSection(candidate) {
  const rows = candidate.selectionProgress || [];
  const editing = detailEditState.selection;
  const fixedRoute = getCandidateSourceName(candidate);
  const addButton = editing
    ? `<button type="button" class="repeatable-add-btn" data-add-row="selectionProgress"> 追加</button>`
    : "";

  // ---------------------------------------------------------
  // 閲覧モード (Visual Flowchart)
  // ---------------------------------------------------------
  if (!editing) {
    if (rows.length === 0) {
      return `
        <div class="candidate-detail-empty p-8 text-center bg-slate-50 rounded-lg border border-slate-100">
          <p class="text-slate-500">企業の進捗は登録されていません。</p>
        </div>
      `;
    }

    const cardsHtml = rows
      .map((row) => renderSelectionFlowCard({ ...row, route: fixedRoute || row.route }))
      .join("");
    return `
      <div class="selection-flow-container space-y-6">
        ${cardsHtml}
      </div>
    `;
  }

  // ---------------------------------------------------------
  // 編集モード (Table Input)
  // ---------------------------------------------------------
  // ---------------------------------------------------------
  // 編集モード (Card Layout)
  // ---------------------------------------------------------
  const cardsHtml = rows.map((row, index) => {
    const pathPrefix = `selectionProgress.${index}`;
    const r = normalizeSelectionRow(row);
    const deleteBtn = `<button type="button" class="text-red-600 hover:text-red-800 text-sm font-medium" data-remove-row="selectionProgress" data-index="${index}">削除</button>`;
    const companyInputId = `selectionCompanyInput-${candidate.id}-${index}`;
    const companyDropdownId = `selectionCompanyDropdown-${candidate.id}-${index}`;
    const companyInputValue = r.companyName === 0 ? "0" : formatInputValue(r.companyName, "text");
    const companyInput = `
      <div class="searchable-dropdown-container">
        <input
          id="${companyInputId}"
          type="text"
          class="detail-table-input"
          value="${escapeHtmlAttr(companyInputValue)}"
          data-detail-field="${pathPrefix}.companyName"
          data-detail-section="selection"
          data-selection-company-input="true"
          data-dropdown-id="${companyDropdownId}"
          autocomplete="off"
        >
        <div id="${companyDropdownId}" class="searchable-dropdown-list hidden"></div>
      </div>
    `;

    return `
      <div class="selection-card bg-white rounded-lg border border-slate-200 shadow-sm p-4 mb-4 relative" data-selection-row="${index}">
        <div class="flex justify-between items-start mb-4 border-b border-slate-100 pb-2">
          <h4 class="text-sm font-bold text-slate-700 flex items-center gap-2">
            <span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs">申込 ${index + 1}</span>
            ${escapeHtml(r.companyName || "企業未設定")}
          </h4>
          ${deleteBtn}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
          <!-- 基本情報 (3 cols) -->
          <div class="lg:col-span-3 space-y-3">
            <div class="form-group">
              <label class="block text-xs font-medium text-slate-500 mb-1" for="${companyInputId}">企業名</label>
              ${companyInput}
            </div>
            <div class="form-group">
              <label class="block text-xs font-medium text-slate-500 mb-1">応募経路（媒体・固定）</label>
              <div class="detail-value text-sm">${escapeHtml(formatDisplayValue(fixedRoute || "-"))}</div>
            </div>
          </div>

          <!-- スケジュール (7 cols) -->
          <div class="lg:col-span-7 grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded">
             <div class="col-span-2 md:col-span-1">
                <label class="block text-xs font-medium text-slate-500 mb-1">提案日</label>
                ${renderTableInput(r.proposalDate, `${pathPrefix}.proposalDate`, "date", "selection")}
             </div>
             <div class="col-span-2 md:col-span-1">
                <label class="block text-xs font-medium text-slate-500 mb-1">推薦日</label>
                ${renderTableInput(r.recommendationDate, `${pathPrefix}.recommendationDate`, "date", "selection")}
             </div>
             <div class="col-span-2 md:col-span-1"></div> <!-- Spacer -->
             <div class="col-span-2 md:col-span-1"></div> <!-- Spacer -->

             <!-- 1次 -->
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">一次面接調整日時</label>
                ${renderTableInput(r.firstInterviewAdjustDate, `${pathPrefix}.firstInterviewAdjustDate`, "date", "selection")}
             </div>
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">一次面接日時</label>
                ${renderTableInput(r.firstInterviewDate, `${pathPrefix}.firstInterviewDate`, "date", "selection")}
             </div>

             <!-- 2次 -->
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">二次面接調整日時</label>
                ${renderTableInput(r.secondInterviewAdjustDate, `${pathPrefix}.secondInterviewAdjustDate`, "date", "selection")}
             </div>
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">二次面接日時</label>
                ${renderTableInput(r.secondInterviewDate, `${pathPrefix}.secondInterviewDate`, "date", "selection")}
             </div>

             <!-- 最終 -->
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">最終面接調整日時</label>
                ${renderTableInput(r.finalInterviewAdjustDate, `${pathPrefix}.finalInterviewAdjustDate`, "date", "selection")}
             </div>
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">最終面接日時</label>
                ${renderTableInput(r.finalInterviewDate, `${pathPrefix}.finalInterviewDate`, "date", "selection")}
             </div>
             <div class="col-span-2"></div>
          </div>

          <!-- 成果 (2 cols) -->
          <div class="lg:col-span-2 space-y-3">
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">FEE (万円)</label>
                <div class="relative">
                  ${renderTableInput(formatMoneyInputToMan(r.fee), `${pathPrefix}.fee`, "number", "selection", "number")}
                  <span class="absolute right-2 top-1.5 text-xs text-slate-400">万</span>
                </div>
             </div>
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">Closing予定</label>
                ${renderTableInput(r.closingForecastDate, `${pathPrefix}.closingForecastDate`, "date", "selection")}
             </div>
          </div>
          
          <!-- Outcome Row (Full Width in Grid) -->
          <div class="lg:col-span-12 grid grid-cols-2 md:grid-cols-6 gap-3 border-t border-slate-100 pt-3 mt-1">
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">内定</label>
                ${renderTableInput(r.offerDate, `${pathPrefix}.offerDate`, "date", "selection")}
             </div>
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">承諾</label>
                ${renderTableInput(r.offerAcceptedDate, `${pathPrefix}.offerAcceptedDate`, "date", "selection")}
             </div>
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">入社</label>
                ${renderTableInput(r.joinedDate, `${pathPrefix}.joinedDate`, "date", "selection")}
             </div>
             <div>
                <label class="block text-xs font-medium text-slate-500 mb-1">辞退日</label>
                ${renderTableInput(r.declinedDate, `${pathPrefix}.declinedDate`, "date", "selection")}
             </div>
             <div class="md:col-span-2">
                <label class="block text-xs font-medium text-slate-500 mb-1">辞退理由</label>
                ${renderTableInput(r.declinedReason, `${pathPrefix}.declinedReason`, "text", "selection")}
             </div>
          </div>

           <!-- Turnover -->
          <div class="lg:col-span-12 grid grid-cols-2 md:grid-cols-6 gap-3 border-t border-slate-100 pt-3">
             <div>
                <label class="block text-xs font-medium text-red-400 mb-1">短期離職</label>
                ${renderTableInput(r.earlyTurnoverDate, `${pathPrefix}.earlyTurnoverDate`, "date", "selection")}
             </div>
             <div class="md:col-span-2">
                <label class="block text-xs font-medium text-red-400 mb-1">離職理由</label>
                ${renderTableInput(r.earlyTurnoverReason, `${pathPrefix}.earlyTurnoverReason`, "text", "selection")}
             </div>
           
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="repeatable-header flex justify-between items-center mb-4">
      <h5 class="text-lg font-bold text-slate-800">企業ごとの進捗 (編集モード)</h5>
      ${addButton}
    </div>
    <div class="selection-card-container">
      <datalist id="client-list">
        ${clientList.map(c => `<option value="${escapeHtml(c.name)}"></option>`).join("")}
      </datalist>
      ${cardsHtml || `<div class="p-8 text-center text-slate-400 bg-slate-50 rounded border border-dashed border-slate-300">企業進捗が登録されていません。<br>「追加」ボタンから登録してください。</div>`}
    </div>
  `;
}

// ---------------------------------------------------------
// Helper: Selection Flow Card & Chart
// ---------------------------------------------------------

function normalizeSelectionRow(row) {
  return {
    companyName: row.companyName,
    route: row.route ?? row.source,
    status: resolveSelectionStageValue(row) || row.status, // Pill表示用
    proposalDate: row.proposalDate ?? row.proposal_date,
    recommendationDate: row.recommendationDate,
    firstInterviewAdjustDate: row.firstInterviewAdjustDate ?? row.firstInterviewSetAt ?? row.interviewSetupDate,
    firstInterviewDate: row.firstInterviewDate ?? row.firstInterviewAt ?? row.interviewDate,
    secondInterviewAdjustDate: row.secondInterviewAdjustDate ?? row.secondInterviewSetAt ?? row.secondInterviewSetupDate,
    secondInterviewDate: row.secondInterviewDate ?? row.secondInterviewAt,
    finalInterviewAdjustDate: row.finalInterviewAdjustDate ?? row.finalInterviewSetAt ?? row.finalInterviewSetupDate,
    finalInterviewDate: row.finalInterviewDate ?? row.finalInterviewAt,
    offerDate: row.offerDate ?? row.offerAt,
    offerAcceptedDate: row.offerAcceptedDate ?? row.offerAcceptedAt ?? row.acceptanceDate,
    joinedDate: row.joinedDate ?? row.joinedAt ?? row.onboardingDate,
    declinedDate:
      row.declinedDate ??
      row.declinedAfterOfferDate ??
      row.preJoinDeclineDate,
    declinedReason:
      row.declinedReason ??
      row.declined_reason ??
      row.declinedAfterOfferReason ??
      row.preJoinDeclineReason,
    earlyTurnoverDate:
      row.earlyTurnoverDate ??
      row.earlyTurnoverAt ??
      row.postJoinQuitDate,
    earlyTurnoverReason:
      row.earlyTurnoverReason ??
      row.early_turnover_reason ??
      row.earlyTurnoverAt ??
      row.postJoinQuitReason,
    closingForecastDate: row.closingForecastDate ?? row.closingForecastAt ?? row.closeExpectedDate ?? row.closingPlanDate,
    fee: row.fee ?? row.feeAmount ?? row.fee_amount,
    note: row.note ?? row.selectionNote,
  };
}

function renderSelectionFlowCard(rawRow) {
  const r = normalizeSelectionRow(rawRow);
  const statusVariant = resolveSelectionStatusVariant(r.status);
  const statusLabel = r.status || "未設定";

  // Flow Steps Definition
  const steps = [
    { label: "提案", date: r.proposalDate, sub: null, keywords: ["提案"] },
    { label: "推薦", date: r.recommendationDate, sub: null, keywords: ["推薦", "書類"] },
    { label: "一次面接", date: r.firstInterviewDate, sub: r.firstInterviewAdjustDate ? `(調) ${formatDateJP(r.firstInterviewAdjustDate)}` : null, keywords: ["一次"] },
    { label: "二次面接", date: r.secondInterviewDate, sub: r.secondInterviewAdjustDate ? `(調) ${formatDateJP(r.secondInterviewAdjustDate)}` : null, keywords: ["二次"] },
    { label: "最終面接", date: r.finalInterviewDate, sub: r.finalInterviewAdjustDate ? `(調) ${formatDateJP(r.finalInterviewAdjustDate)}` : null, keywords: ["最終"] },
    { label: "内定", date: r.offerDate, sub: null, keywords: ["内定", "オファー"] },
    { label: "承諾/入社", date: r.joinedDate || r.offerAcceptedDate, sub: null, keywords: ["承諾", "入社"] },
  ];

  // Detect Drop/Failure Status
  const isDropped = ["辞退", "不合格", "失注", "破談", "終了"].some(k => (r.status || "").includes(k));

  // Find "Current" step based on Status Text matching (fallback to dates)
  let statusIndex = -1;
  if (r.status) {
    steps.forEach((step, idx) => {
      if (step.keywords && step.keywords.some(k => r.status.includes(k))) {
        statusIndex = idx;
      }
    });
  }

  // Find the last step that has a confirmed date (Progress tracking)
  let lastDateIndex = -1;
  steps.forEach((step, idx) => {
    if (step.date) lastDateIndex = idx;
  });

  // Decide the "Active" limit
  // If we have a matching status, usage corresponding index. 
  // Otherwise use the last date index.
  // Exception: If we have disjoint dates (e.g. 1 and 6), lastDateIndex is 5.
  const activeLimitIndex = (statusIndex > lastDateIndex) ? statusIndex : lastDateIndex;

  const flowHtml = steps.map((step, idx) => {
    const hasDate = Boolean(step.date);
    // Logic: Step is "reached" if index <= activeLimitIndex
    const isReached = idx <= activeLimitIndex;

    // Logic: Step is "Current" if it matches activeLimitIndex
    const isCurrent = idx === activeLimitIndex;

    // Logic: Dropped at this step?
    const isDropStep = isDropped && isCurrent;

    // Circle Color
    let circleClass = "bg-slate-200 text-slate-400"; // default (future)
    if (isReached) {
      if (isDropStep) {
        circleClass = "bg-red-500 text-white ring-4 ring-red-100 scale-110"; // Dropped
      } else if (isCurrent) {
        // Active/Current
        circleClass = "bg-indigo-600 text-white ring-4 ring-indigo-200 scale-110";
      } else {
        // Passed
        circleClass = hasDate
          ? "bg-indigo-600 text-white"
          : "bg-white border-2 border-indigo-600 text-indigo-600"; // Skipped (Hollow)
      }
    }

    // Bar Color (Connector to next)
    // Connecting idx to idx+1
    let barHtml = "";
    if (idx < steps.length - 1) {
      let barClass = "bg-slate-200 h-0.5"; // default
      // If next step is also reached, we color the bar
      if (idx < activeLimitIndex) {
        // Check if next step was skipped (no date) -> Dashed line?
        const nextHasDate = Boolean(steps[idx + 1].date);

        if (isDropped && idx === activeLimitIndex - 1) {
          // Line leading to drop step is solid Red? Or just Indigo?
          // Usually Indigo up to the fail point.
          barClass = "bg-indigo-600 h-0.5";
        } else {
          // Normal connection
          barClass = nextHasDate ? "bg-indigo-600 h-0.5" : "border-t-2 border-indigo-400 border-dashed h-0 bg-transparent";
        }
      }
      barHtml = `<div class="absolute top-3 left-1/2 w-full ${barClass} -z-0"></div>`;
    }

    const dateStr = formatDateJP(step.date);
    const dateHtml = hasDate
      ? `<div class="text-[10px] font-bold ${isDropStep ? 'text-red-600' : 'text-indigo-700'} mt-1">${dateStr}</div>`
      : `<div class="text-[10px] text-slate-300 mt-1">-</div>`;

    let labelClass = "text-slate-700";
    if (isDropStep) labelClass = "text-red-700 font-bold";
    else if (isCurrent) labelClass = "text-indigo-800 font-bold";

    const subHtml = step.sub ? `<div class="text-[9px] text-slate-400">${step.sub}</div>` : "";

    return `
      <div class="flex-1 relative group">
        <!-- Connector Bar -->
        ${barHtml}
        
        <div class="relative z-10 flex flex-col items-center">
          <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${circleClass} z-10">
            ${idx + 1}
          </div>
          <div class="mt-2 text-xs font-medium ${labelClass} transition-colors">${step.label}</div>
          ${dateHtml}
          ${subHtml}
        </div>
      </div>
    `;
  }).join("");

  // 詳細情報 (辞退理由や備考)
  const details = [];
  if (r.route) details.push({ label: "経由", value: r.route });
  if (r.fee) details.push({ label: "FEE", value: formatMoneyToMan(r.fee) });
  if (r.closingForecastDate) details.push({ label: "着地予定", value: formatDateJP(r.closingForecastDate) });

  // Warning Alerts
  let alerts = "";
  if (r.declinedDate || r.declinedReason) {
    alerts += `
      <div class="mt-3 text-xs bg-red-50 text-red-700 px-3 py-2 rounded border border-red-100 flex items-start">
        <span class="font-bold mr-2 whitespace-nowrap">辞退/失注:</span>
        <div>
          ${r.declinedDate ? `<span class="mr-2">日: ${formatDateJP(r.declinedDate)}</span>` : ""}
          <span>理由: ${escapeHtml(r.declinedReason || "不明")}</span>
        </div>
      </div>`;
  }
  if (r.earlyTurnoverDate || r.earlyTurnoverReason) {
    alerts += `
      <div class="mt-2 text-xs bg-orange-50 text-orange-700 px-3 py-2 rounded border border-orange-100 flex items-start">
        <span class="font-bold mr-2 whitespace-nowrap">早期退職:</span>
        <div>
          ${r.earlyTurnoverDate ? `<span class="mr-2">日: ${formatDateJP(r.earlyTurnoverDate)}</span>` : ""}
          <span>理由: ${escapeHtml(r.earlyTurnoverReason || "不明")}</span>
        </div>
      </div>`;
  }

  // 備考エリア
  const noteHtml = r.note
    ? `<div class="mt-3 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 whitespace-pre-wrap"><span class="font-bold text-slate-500 mr-1">備考:</span>${escapeHtml(r.note)}</div>`
    : "";

  return `
    <div class="selection-card bg-white rounded-lg border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <h4 class="text-lg font-bold text-slate-800">${escapeHtml(r.companyName || "企業名未設定")}</h4>
          ${renderStatusPill(statusLabel, statusVariant)}
        </div>
        <div class="flex gap-4 text-xs text-slate-500">
           ${details.map(d => `<div><span class="text-slate-400 mr-1">${d.label}:</span><span class="font-semibold text-slate-700">${escapeHtml(formatDisplayValue(d.value))}</span></div>`).join("")}
        </div>
      </div>
      
      <!-- Flow Chart -->
      <div class="flex justify-between items-start w-full px-2 mb-2">
        ${flowHtml}
      </div>

      <!-- Alerts & Notes -->
      ${alerts}
      ${noteHtml}
    </div>
  `;
}

function renderTeleapoLogsSection(candidate) {
  const rows = candidate.teleapoLogs || [];
  const latestResult = rows.length > 0 ? rows[0].result : (candidate.teleapoResult || "");

  const resultHtml = latestResult
    ? `<div class="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-md">
         <div class="text-xs text-blue-500 font-bold mb-1">最新の架電結果</div>
         <div class="text-sm text-slate-700">${escapeHtml(latestResult)}</div>
       </div>`
    : "";

  if (rows.length === 0) {
    return `
    ${resultHtml}
  <div class="detail-table-wrapper">
    <table class="detail-table">
      <thead>
        <tr><th>架電回数</th><th>担当者</th><th>結果</th><th>日時</th></tr>
      </thead>
      <tbody>
        <tr><td colspan="4" class="detail-empty-row text-center py-3">テレアポログはありません。</td></tr>
      </tbody>
    </table>
  </div>
  `;
  }

  const bodyHtml = rows
    .map((row) => {
      const cells = [
        row.callNo,
        row.callerName,
        row.result,
        formatDateTimeJP(row.calledAt),
      ]
        .map((v) => `<td><span class="detail-value">${escapeHtml(formatDisplayValue(v))}</span></td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    ${resultHtml}
  <div class="detail-table-wrapper">
    <table class="detail-table">
      <thead>
        <tr><th>架電回数</th><th>担当者</th><th>結果</th><th>日時</th></tr>
      </thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  </div>
  `;
}

function renderMoneySection(candidate) {
  const editing = detailEditState.money;
  const progress = candidate.selectionProgress || [];
  const moneyRows = Array.isArray(candidate.moneyInfo) ? candidate.moneyInfo : [];
  const moneyMap = new Map();
  moneyRows.forEach((row = {}) => {
    const appId = row.applicationId ?? row.application_id;
    if (appId === null || appId === undefined || appId === "") return;
    moneyMap.set(String(appId), row);
  });

  const resolveMoneyValue = (item, keys) => {
    const appId = item.id ?? item.applicationId ?? item.application_id;
    const money = moneyMap.get(String(appId)) || {};
    for (const key of keys) {
      if (hasOwn(item, key)) return item[key];
    }
    for (const key of keys) {
      if (hasOwn(money, key)) return money[key];
    }
    return null;
  };

  const toAmount = (value) => normalizeMoneyValueToYen(value);

  // 受注情報の抽出 (内定承諾 or 入社 or 入社後辞退)
  const orderRows = progress
    .map((item, index) => ({ ...item, originalIndex: index }))
    .filter((item) => {
      const stage = resolveSelectionStageValue(item);
      // 内定承諾済み以降のステータスを表示対象とする
      return ["内定承諾済み", "入社", "入社後辞退", "早期退職"].includes(stage);
    });

  // 返金情報の抽出 (内定後辞退, 入社後辞退, 早期退職)
  const refundRows = progress
    .map((item, index) => ({ ...item, originalIndex: index }))
    .filter((item) => {
      const stage = resolveSelectionStageValue(item);
      return ["内定後辞退", "入社後辞退", "早期退職"].includes(stage) || (Number(item.refundAmount) > 0);
    });

  const renderOrderRow = (row) => {
    const idx = row.originalIndex;
    const feeAmount = resolveMoneyValue(row, ["feeAmount", "fee_amount"]);
    const orderDate = resolveMoneyValue(row, ["orderDate", "order_date"]);
    const orderReported = resolveMoneyValue(row, ["orderReported", "order_reported"]);
    const refundAmount = resolveMoneyValue(row, ["refundAmount", "refund_amount"]);
    const netAmount = toAmount(feeAmount) - toAmount(refundAmount);
    const isRecognized = Boolean(orderDate);

    // 編集中かつ、まだ確定していない(編集中は常に編集可で良いか)
    const canEdit = editing;

    const feeCell = canEdit
      ? renderTableInput(formatMoneyInputToMan(feeAmount), `selectionProgress.${idx}.feeAmount`, "number", "money", "number")
      : `<span class="detail-value">${escapeHtml(formatMoneyToMan(feeAmount))}</span>`;

    const reportCell = canEdit
      // boolean options: true="済", false="未"
      ? renderTableSelect(buildBooleanOptions(orderReported), `selectionProgress.${idx}.orderReported`, "money", "boolean")
      : renderBooleanPill(orderReported, { trueLabel: "済", falseLabel: "未" });

    const orderDateCell = canEdit
      ? renderTableInput(orderDate, `selectionProgress.${idx}.orderDate`, "date", "money")
      : `<span class="detail-value">${escapeHtml(formatDateJP(orderDate))}</span>`;

    const recognizedCell = renderBooleanPill(isRecognized, { trueLabel: "計上済", falseLabel: "未計上" });
    const netCell = `<span class="detail-value">${escapeHtml(formatMoneyToMan(netAmount))}</span>`;

    return `
      <tr>
        <td class="font-medium text-slate-900">${escapeHtml(formatDisplayValue(row.companyName))}</td>
        <td class="text-right">${feeCell}</td>
        <td class="text-right">${netCell}</td>
        <td class="text-center text-slate-500">${orderDateCell}</td>
        <td class="text-center">${recognizedCell}</td>
        <td class="text-center">${reportCell}</td>
      </tr>
    `;
  };

  const renderRefundRow = (row) => {
    const idx = row.originalIndex;
    const refundAmount = resolveMoneyValue(row, ["refundAmount", "refund_amount"]);
    const withdrawDate = resolveMoneyValue(row, ["withdrawDate", "withdraw_date"]);
    const refundReported = resolveMoneyValue(row, ["refundReported", "refund_reported"]);

    // 退職日等の判定
    const retirementDate = row.earlyTurnoverDate || row.postJoinQuitDate || row.preJoinWithdrawDate;
    const stage = resolveSelectionStageValue(row);

    const canEdit = editing;

    const amountCell = canEdit
      ? renderTableInput(formatMoneyInputToMan(refundAmount), `selectionProgress.${idx}.refundAmount`, "number", "money", "number")
      : `<span class="detail-value text-red-600 font-semibold">${escapeHtml(formatMoneyToMan(refundAmount))}</span>`;

    const reportCell = canEdit
      ? renderTableSelect(buildBooleanOptions(refundReported), `selectionProgress.${idx}.refundReported`, "money", "boolean")
      : renderBooleanPill(refundReported, { trueLabel: "済", falseLabel: "未" });

    const withdrawDateCell = canEdit
      ? renderTableInput(withdrawDate, `selectionProgress.${idx}.withdrawDate`, "date", "money")
      : `<span class="detail-value text-slate-500">${escapeHtml(formatDateJP(withdrawDate))}</span>`;

    return `
      <tr>
        <td class="font-medium text-slate-900">${escapeHtml(formatDisplayValue(row.companyName))}</td>
        <td class="text-right">${amountCell}</td>
        <td class="text-center text-slate-500">${withdrawDateCell}</td>
        <td class="text-center text-slate-500">${escapeHtml(formatDateJP(retirementDate))}</td>
        <td class="text-center"><span class="status-pill status-pill--warning">${escapeHtml(stage)}</span></td>
        <td class="text-center">${reportCell}</td>
      </tr>
    `;
  };

  const orderBody = orderRows.length > 0
    ? orderRows.map(renderOrderRow).join("")
    : `<tr><td colspan="6" class="detail-empty-row text-center py-3">受注対象の案件はありません。</td></tr>`;

  const refundBody = refundRows.length > 0
    ? refundRows.map(renderRefundRow).join("")
    : `<tr><td colspan="6" class="detail-empty-row text-center py-3">返金・減額対象の案件はありません。</td></tr>`;

  const summaryTotals = (() => {
    let totalFee = 0;
    let totalRefund = 0;
    let recognizedFee = 0;
    let recognizedRefund = 0;

    progress.forEach((row) => {
      const feeAmount = resolveMoneyValue(row, ["feeAmount", "fee_amount"]);
      const refundAmount = resolveMoneyValue(row, ["refundAmount", "refund_amount"]);
      const orderDate = resolveMoneyValue(row, ["orderDate", "order_date"]);
      const withdrawDate = resolveMoneyValue(row, ["withdrawDate", "withdraw_date"]);

      totalFee += toAmount(feeAmount);
      totalRefund += toAmount(refundAmount);

      if (orderDate) recognizedFee += toAmount(feeAmount);
      if (withdrawDate) recognizedRefund += toAmount(refundAmount);
    });

    return {
      totalFee,
      totalRefund,
      netTotal: totalFee - totalRefund,
      recognizedNet: recognizedFee - recognizedRefund,
    };
  })();

  const summaryHtml = `
    <div class="money-summary-grid">
      <div class="money-summary-card">
        <div class="money-summary-label">受注合計 (万円)</div>
        <div class="money-summary-value">${formatMoneyToMan(summaryTotals.totalFee)}</div>
      </div>
      <div class="money-summary-card">
        <div class="money-summary-label">返金合計 (万円)</div>
        <div class="money-summary-value is-negative">${formatMoneyToMan(summaryTotals.totalRefund)}</div>
      </div>
      <div class="money-summary-card">
        <div class="money-summary-label">収支 (万円)</div>
        <div class="money-summary-value is-net">${formatMoneyToMan(summaryTotals.netTotal)}</div>
      </div>
      <div class="money-summary-card">
        <div class="money-summary-label">計上済み収支 (万円)</div>
        <div class="money-summary-value">${formatMoneyToMan(summaryTotals.recognizedNet)}</div>
      </div>
    </div>
  `;

  const hasMoneyRows = orderRows.length > 0 || refundRows.length > 0;
  const orderConfirmed = hasMoneyRows
    ? orderRows.some((row) => Boolean(resolveMoneyValue(row, ["orderReported", "order_reported"])))
    : null;
  const revenueConverted = hasMoneyRows
    ? orderRows.some((row) => Boolean(resolveMoneyValue(row, ["orderDate", "order_date"])))
    : null;
  const advisorMissing = !candidate?.advisorUserId;
  const advisorWarningHtml = advisorMissing
    ? `<div class="money-warning">担当アドバイザーが設定されていないので、売り上げに計上されていません。</div>`
    : "";
  const statusHtml = `
    <div class="money-status-row">
      <div class="money-status-item">
        <span class="money-status-label">受注確定状況</span>
        ${renderBooleanPill(orderConfirmed, { trueLabel: "確定済", falseLabel: "未確定" })}
      </div>
      <div class="money-status-item">
        <span class="money-status-label">売上計上状況</span>
        ${renderBooleanPill(revenueConverted, { trueLabel: "計上済", falseLabel: "未計上" })}
      </div>
    </div>
  `;

  const orderTable = `
    <div class="money-summary-section">
      <div class="money-summary-header">
        <h5 class="money-summary-title">候補者別収支サマリー</h5>
      </div>
      ${summaryHtml}
      ${statusHtml}
      ${advisorWarningHtml}
    </div>
    <div class="detail-table-wrapper mb-8">
      <h5 class="font-bold mb-3 text-slate-700">入社承諾案件 (売上)</h5>
      <table class="detail-table">
        <thead>
          <tr>
            <th class="w-1/4">紹介先企業</th>
            <th class="w-1/6">受注額 (税抜)</th>
            <th class="w-1/6">収支金額</th>
            <th class="w-1/6">計上予定日</th>
            <th class="w-1/6 text-center">計上</th>
            <th class="w-1/6 text-center">報告</th>
          </tr>
        </thead>
        <tbody>${orderBody}</tbody>
      </table>
    </div>
  `;

  const refundTable = `
    <div class="detail-table-wrapper">
      <h5 class="font-bold mb-3 text-slate-700">返金・減額対象</h5>
      <table class="detail-table">
        <thead>
          <tr>
            <th class="w-1/4">紹介先企業</th>
            <th class="w-1/6">返金額 (万円)</th>
            <th class="w-1/6">返金処理日</th>
            <th class="w-1/6">離職/辞退日</th>
            <th class="w-1/6">ステータス</th>
            <th class="w-1/6 text-center">報告</th>
          </tr>
        </thead>
        <tbody>${refundBody}</tbody>
      </table>
    </div>
  `;

  return `
    <div class="space-y-6">
      ${orderTable}
      ${refundTable}
    </div>
  `;
}

function renderAfterAcceptanceSection(candidate) {
  const data = candidate.afterAcceptance || {};
  const fields = [
    { label: "受注金額 (万円)", value: data.amount, span: 3, displayFormatter: formatMoneyToMan },
    { label: "職種", value: data.jobCategory, span: 3 },
  ];
  const reportStatuses =
    (data.reportStatuses || [])
      .map((s) => `< span class="cs-pill is-active" > ${escapeHtml(s)}</span > `)
      .join("") || "-";
  return `
    ${renderDetailGridFields(fields, "afterAcceptance")}
  <div class="detail-pill-list">${reportStatuses}</div>
  `;
}

function renderRefundSection(candidate) {
  const listFromCandidate =
    Array.isArray(candidate.refundInfoList) && candidate.refundInfoList.length > 0
      ? candidate.refundInfoList
      : null;
  const fallbackInfo = candidate.refundInfo || {};
  const fallbackList =
    !listFromCandidate &&
      (fallbackInfo.resignationDate || fallbackInfo.refundAmount || fallbackInfo.reportStatus)
      ? [
        {
          companyName: "",
          resignationDate: fallbackInfo.resignationDate,
          refundAmount: fallbackInfo.refundAmount,
          reportStatus: fallbackInfo.reportStatus,
        },
      ]
      : [];
  const items = listFromCandidate || fallbackList;

  if (!items.length) {
    return `
    < div class="detail-table-wrapper" >
      <table class="detail-table">
        <thead>
          <tr><th>企業名</th><th>退職日</th><th>返金・減額 (万円)</th><th>返金報告</th></tr>
        </thead>
        <tbody>
          <tr><td colspan="4" class="detail-empty-row text-center py-3">返金情報はありません。</td></tr>
        </tbody>
      </table>
      </div >
    `;
  }

  const bodyHtml = items
    .map((item) => {
      const cells = [
        item.companyName || "-",
        formatDateJP(item.resignationDate),
        formatMoneyToMan(item.refundAmount),
        item.reportStatus || "-",
      ]
        .map((v) => `< td > <span class="detail-value">${escapeHtml(formatDisplayValue(v))}</span></td > `)
        .join("");
      return `< tr > ${cells}</tr > `;
    })
    .join("");

  return `
    < div class="detail-table-wrapper" >
      <table class="detail-table">
        <thead>
          <tr><th>企業名</th><th>退職日</th><th>返金・減額 (万円)</th><th>返金報告</th></tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div >
    `;
}

function renderNextActionSection(candidate) {
  // タスクリストを取得（未完了/完了で分ける）
  const allTasks = candidate.tasks || [];
  const incompleteTasks = allTasks.filter(t => !t.isCompleted);
  const completedTasks = allTasks.filter(t => t.isCompleted);

  // 現在の次回アクション（未完了の最初のタスク）
  const currentTask = incompleteTasks.length > 0 ? incompleteTasks[0] : null;

  // サマリー表示
  let displayTask = currentTask;
  if (!displayTask && candidate.nextActionDate) {
    displayTask = {
      actionDate: candidate.nextActionDate,
      actionNote: candidate.nextActionContent || candidate.nextActionNote || "（内容未設定）",
      id: null // 仮想タスク
    };
  }

  const summaryHtml = displayTask
    ? `
    <div class="next-action-card bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4 mb-4">
      <div class="flex items-center justify-between">
        <div>
          <span class="next-action-date text-lg font-bold text-indigo-900">次回アクション: ${escapeHtml(formatDateJP(displayTask.actionDate))}</span>
        </div>
        ${displayTask.id ? `
        <div class="flex items-center gap-2">
          <button type="button" class="px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 font-medium shadow-sm transition-colors" data-complete-task-id="${displayTask.id}">
            ✓ 完了登録
          </button>
          <button type="button" class="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-md text-sm hover:bg-red-50 font-medium shadow-sm transition-colors" data-delete-task-id="${displayTask.id}">
            削除
          </button>
        </div>
        ` : ''}
      </div>
      <div class="mt-2 text-sm text-slate-700">${escapeHtml(displayTask.actionNote || '-')}</div>
    </div>
    `
    : `
    <div class="next-action-card bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-amber-600 text-lg">⚠️</span>
            <span class="text-amber-900 font-bold">次回アクションが未設定です</span>
          </div>
          <p class="text-xs text-amber-800">次回アクションを設定するか、選考終了の場合は「選考完了」を押してください。</p>
        </div>
        <button type="button" class="px-3 py-1.5 bg-slate-600 text-white rounded-md text-sm hover:bg-slate-700 font-medium shadow-sm transition-colors whitespace-nowrap" data-selection-complete="true">
          🏁 選考完了
        </button>
      </div>
    </div>
    `;

  // 新規アクション追加エリア
  const addTaskHtml = `
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
      <p class="text-xs text-blue-800 mb-2">💡 新しいアクションを追加するには、以下を入力して「編集」→「完了して保存」してください。</p>
    </div>
    `;

  const fields = [
    { label: "次回アクション日", value: candidate.nextActionDate || "", path: "nextActionDate", type: "date", displayFormatter: formatDateJP, span: 3 },
    { label: "次回アクション内容", value: candidate.nextActionNote || "", path: "nextActionNote", span: 3 },
  ];

  // 未完了タスク一覧（現在のもの以外）
  const remainingTasks = incompleteTasks.slice(1);
  const remainingTasksHtml = remainingTasks.length > 0
    ? `
    <div class="mt-4">
      <h5 class="text-sm font-semibold text-slate-700 mb-2">📋 予定中のアクション</h5>
      <div class="space-y-2">
        ${remainingTasks.map((task) => `
          <div class="bg-white border border-slate-200 rounded-lg p-3" data-task-id="${task.id}">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-medium text-slate-900">${escapeHtml(formatDateJP(task.actionDate))}</span>
              <span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">予定</span>
            </div>
            <div class="text-sm text-slate-700">${escapeHtml(task.actionNote || '-')}</div>
            <div class="mt-2 flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
              <button type="button" class="text-xs px-2 py-1 bg-white border border-green-200 text-green-700 hover:bg-green-50 rounded" data-complete-task-id="${task.id}">完了</button>
              <button type="button" class="text-xs px-2 py-1 bg-white border border-red-200 text-red-700 hover:bg-red-50 rounded" data-delete-task-id="${task.id}">削除</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    `
    : '';

  // 完了済みタスク履歴
  const completedTasksHtml = completedTasks.length > 0
    ? `
    <div class="mt-6">
      <h5 class="text-sm font-semibold text-slate-700 mb-3">✅ 完了したアクション (${completedTasks.length}件)</h5>
      <div class="space-y-2">
        ${completedTasks.map((task) => `
          <div class="bg-white border border-slate-200 rounded-lg p-3 opacity-75" data-task-id="${task.id}">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-medium text-slate-900">${escapeHtml(formatDateJP(task.actionDate))}</span>
              <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">完了</span>
            </div>
            <div class="text-sm text-slate-700">${escapeHtml(task.actionNote || '-')}</div>
            <div class="text-xs text-slate-400 mt-1">完了日時: ${escapeHtml(formatDateTimeJP(task.completedAt))}</div>
            <div class="mt-2 flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
              <button type="button" class="text-xs px-2 py-1 bg-white border border-red-200 text-red-700 hover:bg-red-50 rounded" data-delete-task-id="${task.id}">削除</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    `
    : '';

  return `
    ${summaryHtml}
    ${addTaskHtml}
    ${renderDetailGridFields(fields, "nextAction")}
    ${remainingTasksHtml}
    ${completedTasksHtml}
  `;
}

function renderCsSection(candidate) {
  const csSummary = candidate.csSummary || {};
  const hasConnected = Boolean(csSummary.hasConnected ?? candidate.phoneConnected);
  const callCount = csSummary.callCount ?? candidate.callCount ?? 0;
  const lastConnectedAt = candidate.callDate ?? csSummary.lastConnectedAt ?? null;
  const csStatusDisplay = normalizeCsStatusOption(candidate.csStatus ?? candidate.cs_status ?? "") || "-";
  const editing = detailEditState.cs;

  // 設定日の自動解決: 架電ログから「設定」を含む最新のものを優先する
  let scheduleConfirmedAt = candidate.scheduleConfirmedAt;

  if (Array.isArray(candidate.teleapoLogs)) {
    // 日付降順にソートされている前提でfind (されてなければsortが必要だが通常新しい順)
    const settingLog = candidate.teleapoLogs.find(l => l.result && l.result.includes("設定"));
    if (settingLog) {
      scheduleConfirmedAt = settingLog.calledAt;
    }
  }

  const items = [
    { label: "CSステータス", html: `<span class="cs-status-chip${csStatusDisplay === "-" ? " is-empty" : ""}">${escapeHtml(csStatusDisplay)}</span>` },
    { label: "架電回数", value: Number(callCount) > 0 ? `${callCount} 回` : "-" },
    { label: "通電", html: renderBooleanPill(hasConnected, { trueLabel: "通電済", falseLabel: "未通電" }) },
    { label: "通電日", value: formatDateJP(lastConnectedAt) },
    { label: "設定日", value: scheduleConfirmedAt, path: "scheduleConfirmedAt", type: "date" },
    { label: "初回面談日時", value: candidate.firstInterviewDate, path: "firstInterviewDate", type: "datetime-local" },

  ];

  return `
    <div class="cs-summary-grid">
      ${items
      .map(
        (item) => {
          let content = "";
          if (editing && item.path) {
            content = renderDetailFieldInput({ path: item.path, type: item.type }, candidate[item.path], "cs");
          } else if (item.html) {
            content = item.html;
          } else {
            const val = item.value !== undefined ? item.value : candidate[item.path];
            if (item.type === "date") content = formatDateJP(val);
            else if (item.type === "datetime-local") content = formatDateTimeJP(val);
            else content = escapeHtml(formatDisplayValue(val));
          }

          return `
            <div class="cs-summary-item">
              <span class="cs-summary-label">${escapeHtml(item.label)}</span>
              <div class="cs-summary-value">
                ${content}
              </div>
            </div>
          `;
        }
      )
      .join("")
    }
    </div>
    `;
}

// ========== 書類作成セクション ==========
// ========== 書類作成セクション ==========
function renderDocumentsSection(candidate) {
  return `
    <div class="p-12 text-center">
      <div class="text-4xl mb-4">🚧</div>
      <h3 class="text-lg font-semibold text-slate-700 mb-2">Coming Soon...</h3>
      <p class="text-slate-500">書類作成機能は現在開発中です。</p>
    </div>
  `;
}

function formatMonthValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()} -${String(d.getMonth() + 1).padStart(2, '0')} `;
}

function formatMonthJP(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}年${d.getMonth() + 1} 月`;
}

function parseDateValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function pickNextAction(candidate) {
  const now = new Date();
  const upcoming = [];

  const pushIfUpcoming = (label, value) => {
    const date = parseDateValue(value);
    if (!date) return;
    // Include past events to show as expired/warning at the top
    upcoming.push({ label, date });
  };

  const explicitNextAction = parseDateValue(candidate.nextActionDate);
  if (explicitNextAction) {
    return {
      label: "次回アクション日",
      date: explicitNextAction,
      note: candidate.nextActionNote || null
    };
  }

  pushIfUpcoming("新規接触予定", candidate.firstContactPlannedAt);
  pushIfUpcoming("面接希望", candidate.interviewPreferredDate);
  pushIfUpcoming("共有面談実施日", candidate.firstInterviewDate);
  pushIfUpcoming("設定日", candidate.scheduleConfirmedAt);

  (candidate.selectionProgress || []).forEach((row) => {
    const prefix = row.companyName ? `${row.companyName} ` : "";
    pushIfUpcoming(`${prefix} 面接設定日`, row.interviewSetupDate);
    pushIfUpcoming(`${prefix} 面接日`, row.interviewDate);
    pushIfUpcoming(`${prefix} 二次面接調整日`, row.secondInterviewSetupDate);
    pushIfUpcoming(`${prefix} 二次面接日`, row.secondInterviewDate);
    pushIfUpcoming(`${prefix} 内定日`, row.offerDate);
    pushIfUpcoming(`${prefix} 内定承諾日`, row.acceptanceDate);
    pushIfUpcoming(`${prefix} 入社日`, row.onboardingDate);
    pushIfUpcoming(`${prefix} クロージング予定日`, row.closeExpectedDate);
  });

  if (upcoming.length === 0) return null;
  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
  return upcoming[0];
}

function renderMemoSection(candidate) {
  const editing = detailEditState.memo;
  // 初回面談日時 (架電管理画面等で設定された値)
  const firstInterviewAt = candidate.firstInterviewAt ? formatDateTimeJP(candidate.firstInterviewAt) : "-";

  if (editing) {
    return `
    <div class="mb-4 border-b border-slate-100 pb-4">
      <label class="block text-xs font-bold text-slate-500 mb-1">初回面談日時</label>
      <div class="text-base text-slate-900">${escapeHtml(firstInterviewAt)}</div>
      <p class="text-xs text-slate-400 mt-1">※日時の変更は基本情報または選考進捗から行ってください。</p>
    </div>
    <label class="detail-textarea-field">
      <span>自由メモ</span>
      ${renderTableTextarea(candidate.memoDetail, "memoDetail", "memo")}
    </label>
    `;
  }
  return `
    <div class="mb-4 border-b border-slate-100 pb-4">
      <label class="block text-xs font-bold text-slate-500 mb-1">初回面談日時</label>
      <div class="text-base text-slate-900 font-medium">${escapeHtml(firstInterviewAt)}</div>
    </div>
    <label class="detail-textarea-field">
      <span>自由メモ</span>
      <span class="detail-value">${escapeHtml(candidate.memoDetail || "-")}</span>
    </label>
    `;
}

function resolveDetailGridSpanClass(field) {
  const span = field.span || (field.input === "textarea" ? "full" : null);
  if (span === "full") return "col-span-full";
  if (typeof span === "number") {
    const smSpan = Math.min(span, 2);
    return `col-span-full sm:col-span-${smSpan} lg:col-span-${span}`;
  }
  return "col-span-full sm:col-span-2 lg:col-span-2";
}

function renderDetailGridFields(fields, sectionKey, options = {}) {
  const editing = Boolean(detailEditState[sectionKey]);
  const gridClass = [
    "detail-grid",
    "grid",
    "grid-cols-1",
    "sm:grid-cols-2",
    "lg:grid-cols-6",
    "gap-x-6",
    "gap-y-4",
    options.gridClass,
  ]
    .filter(Boolean)
    .join(" ");
  return `
    <dl class="${gridClass}">
      ${fields
      .map((field) => {
        const value = field.value;
        const spanClass = resolveDetailGridSpanClass(field);
        const sizeClass = field.path === "hearingFreeMemo" ? " detail-grid-item--large" : "";

        // 編集モードで編集可能なフィールド
        if (editing && field.path && field.editable !== false) {
          return `
              <div class="detail-grid-item ${spanClass}${sizeClass}">
                <dt>${field.label}</dt>
                <dd>${renderDetailFieldInput(field, value, sectionKey)}</dd>
              </div>
            `;
        }

        // 閲覧モード（または編集不可フィールド）
        const displayValue = field.displayFormatter ? field.displayFormatter(value) : formatDisplayValue(value);
        const inner =
          field.link && value
            ? `<a href="${value}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`
            : escapeHtml(displayValue);

        // editable: false のフィールドは編集不可スタイル
        const isReadOnly = field.editable === false;
        const containerClass = isReadOnly
          ? "bg-slate-100 text-slate-600 -mx-2 px-2 py-1 rounded cursor-not-allowed"
          : "group relative cursor-pointer hover:bg-slate-100 -mx-2 px-2 py-1 rounded transition-colors";
        const editIcon = isReadOnly
          ? ""
          : `<span class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 opacity-0 group-hover:opacity-100 text-xs">✎</span>`;

        return `
            <div class="detail-grid-item ${spanClass}${sizeClass}">
              <dt>${field.label}</dt>
              <dd>
                <div class="${containerClass}" ${isReadOnly ? '' : `data-section-edit="${sectionKey}" title="クリックして編集"`}>
                  <span class="detail-value">${inner}</span>
                  ${editIcon}
                </div>
              </dd>
            </div>
          `;
      })
      .join("")
    }
    </dl>
    `;
}

function renderDetailFieldInput(field, value, sectionKey) {
  const dataset = field.path ? `data-detail-field="${field.path}" data-detail-section="${sectionKey}"` : "";
  const valueType = field.valueType ? ` data-value-type="${field.valueType}"` : "";

  const renderSelectOptionsHtml = () =>
    (field.options || [])
      .map((option) => {
        const isObject = option && typeof option === "object";
        const optValue = isObject ? option.value : option;
        const optLabel = isObject ? option.label : option;
        const isDisabled = Boolean(isObject && option.disabled);
        const isSelected = isObject && "selected" in option
          ? option.selected
          : String(optValue ?? "") === String(value ?? "");
        return `<option value="${escapeHtmlAttr(optValue ?? "")}" ${isSelected ? "selected" : ""} ${isDisabled ? "disabled" : ""}>${escapeHtml(optLabel ?? "")}</option>`;
      })
      .join("");

  if (field.input === "textarea") {
    const extraClass = field?.path === "hearingFreeMemo" ? " detail-inline-textarea--large" : "";
    return `<textarea class="detail-inline-input detail-inline-textarea${extraClass}" ${dataset}${valueType}>${escapeHtml(value || "")}</textarea>`;
  }
  if (field.input === "creatable-select") {
    const placeholder = escapeHtmlAttr(field.placeholder || "新しい選択肢を入力");
    const addLabel = escapeHtml(field.addLabel || "追加");
    const fieldPath = escapeHtmlAttr(field.path || "");
    return `
    <div class="cs-status-editor" data-cs-status-editor="${fieldPath}">
      <select class="detail-inline-input" ${dataset}${valueType}>
        ${renderSelectOptionsHtml()}
      </select>
      <div class="cs-status-editor-row">
        <input type="text" class="detail-inline-input" data-cs-status-new placeholder="${placeholder}">
        <button type="button" class="table-action-btn cs-status-add-btn" data-add-cs-status-option="${fieldPath}">${addLabel}</button>
      </div>
    </div>
    `;
  }
  if (field.input === "select") {
    return `
    <select class="detail-inline-input" ${dataset}${valueType}>
      ${renderSelectOptionsHtml()}
      </select>
    `;
  }
  if (field.input === "checkbox") {
    return `
    <label class="meeting-check">
      <input type="checkbox" ${value ? "checked" : ""} ${dataset} ${valueType || 'data-value-type="boolean"'}>
        <span>${field.checkboxLabel || "済"}</span>
      </label>
  `;
  }
  const type = field.type === "datetime" ? "datetime-local" : field.type || "text";
  return `<input type="${type}" class="detail-inline-input" value="${escapeHtmlAttr(formatInputValue(value, type))}" ${dataset}${valueType}>`;
}

function renderTableInput(value, path, type = "text", sectionKey, valueType, listId) {
  const dataset = path ? `data-detail-field="${path}" data-detail-section="${sectionKey}"` : "";
  const valueTypeAttr = valueType ? ` data-value-type="${valueType}"` : "";
  const listAttr = listId ? ` list="${listId}"` : "";
  const inputType = type === "datetime" ? "datetime-local" : type;
  const inputValue = value === 0 ? "0" : formatInputValue(value, inputType);
  return `<input type="${inputType}" class="detail-table-input" value="${escapeHtmlAttr(inputValue)}" ${dataset}${valueTypeAttr}${listAttr}>`;
}

function renderTableTextarea(value, path, sectionKey) {
  const dataset = path ? `data-detail-field="${path}" data-detail-section="${sectionKey}"` : "";
  return `<textarea class="detail-table-input" ${dataset}>${escapeHtml(value || "")}</textarea>`;
}

function renderTableSelect(options, path, sectionKey, valueType) {
  const dataset = path ? `data-detail-field="${path}" data-detail-section="${sectionKey}"` : "";
  const valueTypeAttr = valueType ? ` data-value-type="${valueType}"` : "";
  const selectedValue = (options || []).find((option) => option && typeof option === "object" && option.selected)?.value;
  const html = (options || [])
    .map((option) => {
      const isObject = option && typeof option === "object";
      const optValue = isObject ? option.value : option;
      const optLabel = isObject ? option.label : option;
      const isDisabled = Boolean(isObject && option.disabled);
      const isSelected = isObject && "selected" in option
        ? option.selected
        : String(optValue ?? "") === String(selectedValue ?? "");
      return `<option value="${escapeHtmlAttr(optValue ?? "")}" ${isSelected ? "selected" : ""} ${isDisabled ? "disabled" : ""}>${escapeHtml(optLabel ?? "")}</option>`;
    })
    .join("");
  return `<select class="detail-table-input" ${dataset}${valueTypeAttr}>${html}</select>`;
}

// =========================
// クライアント検索 (Datalist連係)
// =========================
let clientSearchDebounceTimer = null;

async function loadClientsByName(query) {
  const q = String(query || "").trim();
  if (!q || q.length < 1) return;

  try {
    const res = await fetch(`${CANDIDATES_API_BASE}/clients?name=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error("Search failed");
    const results = await res.json();

    // 検索結果を clientList に合流 (重複排除)
    if (Array.isArray(results)) {
      results.forEach(newC => {
        const idStr = String(newC.id || newC.ID);
        const nameVal = newC.name || newC.companyName;
        if (!nameVal) return;

        const exists = clientList.some(oldC => String(oldC.id || oldC.ID) === idStr);
        if (!exists) {
          clientList.push({ id: idStr, name: nameVal });
        }
      });
      refreshClientDatalist();
    }
  } catch (err) {
    console.warn("Client search failed:", err);
  }
}

function refreshClientDatalist() {
  const datalist = document.getElementById("client-list");
  if (!datalist) return;

  // 名前でユニークにしてソート
  const uniqueNames = Array.from(new Set(clientList.map(c => c.name))).filter(Boolean).sort();
  datalist.innerHTML = uniqueNames.map(name => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function formatInputValue(value, type) {
  if (!value) return "";
  if (type === "date") return String(value).slice(0, 10);
  if (type === "datetime-local" || type === "datetime") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${hh}:${mm}`;
  }
  return value;
}

// Utility functions for escaping HTML
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ==========================================================================
   EVENT HANDLERS & STATE MANAGEMENT (ADDED FOR DETAIL INTERACTIVITY)
   ========================================================================== */

function setupCandidateDetailEventHandlers() {
  // Use document level delegation for better reliability with dynamic content
  document.addEventListener("click", handleCandidateDetailClick);
  document.addEventListener("input", handleCandidateDetailFieldChange);
  document.addEventListener("change", handleCandidateDetailFieldChange);
}

async function handleCandidateDetailClick(e) {
  // 1. Tab Switching
  const tabBtn = e.target.closest("[data-detail-tab]");
  if (tabBtn) {
    const key = tabBtn.dataset.detailTab;
    if (key) {
      candidateDetailCurrentTab = key;
      const candidate = allCandidates.find(c => String(c.id) === currentDetailCandidateId);
      if (candidate) renderCandidateDetail(candidate, { preserveEditState: true });
    }
    return;
  }

  // 2. Edit Toggle
  const editBtn = e.target.closest("[data-section-edit]");
  if (editBtn) {
    // Skip - handled by handleDetailContentClick to avoid double-toggle
    return;
    const key = editBtn.dataset.sectionEdit;
    if (key && detailEditState.hasOwnProperty(key)) {
      if (detailEditState[key]) {
        // Save logic: "完了して保存" or "保存" clicked
        const candidate = allCandidates.find(c => String(c.id) === currentDetailCandidateId);
        if (candidate) {
          // Persist changes
          try {
            await saveCandidateRecord(candidate);
          } catch (err) {
            console.error("Save failed", err);
            alert("保存に失敗しました");
            return; // Don't toggle off input if failed
          }
        }
      }

      // Toggle state
      detailEditState[key] = !detailEditState[key];
      const candidate = allCandidates.find(c => String(c.id) === currentDetailCandidateId);
      if (candidate) renderCandidateDetail(candidate, { preserveEditState: true });
    }
    return;
  }

  // 3. Add Selection Row
  if (e.target.closest("[data-add-selection-row]")) {
    const candidate = allCandidates.find(c => String(c.id) === currentDetailCandidateId);
    if (candidate) {
      if (!candidate.selectionProgress) candidate.selectionProgress = [];
      candidate.selectionProgress.push({}); // Add to bottom for stability
      renderCandidateDetail(candidate, { preserveEditState: true });
    }
    return;
  }

  // 4. Remove Selection Row
  const removeBtn = e.target.closest("[data-remove-row]");
  if (removeBtn) {
    const field = removeBtn.dataset.removeRow; // e.g. "selectionProgress"
    const index = parseInt(removeBtn.dataset.index, 10);
    const candidate = allCandidates.find(c => String(c.id) === currentDetailCandidateId);

    if (candidate && field === "selectionProgress" && candidate.selectionProgress) {
      if (confirm("この選考プロセスを削除しますか？")) {
        const removedRow = candidate.selectionProgress[index];
        const removedId = removedRow?.id || removedRow?.ID;
        if (removedId) {
          if (!pendingDeletedSelectionIds[currentDetailCandidateId]) {
            pendingDeletedSelectionIds[currentDetailCandidateId] = [];
          }
          pendingDeletedSelectionIds[currentDetailCandidateId].push(removedId);
        }

        candidate.selectionProgress.splice(index, 1);
        renderCandidateDetail(candidate, { preserveEditState: true });
      }
    }
    return;
  }
}

function handleCandidateDetailFieldChange(e) {
  const target = e.target;
  const fieldPath = target.dataset.detailField;
  if (!fieldPath) return;

  const candidate = allCandidates.find(c => String(c.id) === currentDetailCandidateId);
  if (!candidate) return;

  const valueType = target.dataset.valueType;
  let value = target.type === "checkbox" ? target.checked : target.value;

  if (valueType === "number") value = value === "" ? null : Number(value);
  if (valueType === "boolean") value = value === "true" || value === true;

  const sectionKey = target.dataset.detailSection;
  value = normalizeMoneyInputValue(value, fieldPath, sectionKey);

  // Date/Time handling if needed, but value is usually string

  updateCandidateDetailFieldValue(candidate, fieldPath, value);

  // クライアント検索のトリガー
  const isCompanySearchInput =
    target.getAttribute("list") === "client-list" ||
    target.dataset.selectionCompanyInput === "true";
  if (isCompanySearchInput && e.type === "input") {
    clearTimeout(clientSearchDebounceTimer);
    const queryValue = String(value || "").trim();
    clientSearchDebounceTimer = setTimeout(() => {
      void loadClientsByName(queryValue);
    }, 500);
  }
}

function updateCandidateDetailFieldValue(candidate, path, value) {
  const parts = path.split(".");
  let current = candidate;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextKey = parts[i + 1];

    // Auto-create object or array if missing
    if (!current[key]) {
      current[key] = isNaN(Number(nextKey)) ? {} : [];
    }
    current = current[key];
  }
  const lastKey = parts[parts.length - 1];
  current[lastKey] = value;
}

// Initialize listeners
// Initialize listeners
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupCandidateDetailEventHandlers);
} else {
  setupCandidateDetailEventHandlers();
}

// Debug Log
console.log("Candidate Detail Event Handlers Initialized");
