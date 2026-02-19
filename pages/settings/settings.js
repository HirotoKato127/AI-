import { getSession } from '../../scripts/auth.js';
import { PRIMARY_API_BASE } from '../../scripts/api/endpoints.js';
import { goalSettingsService } from '../../scripts/services/goalSettings.js';

let screeningForm;
let screeningStatusElement;
let screeningUpdatedAtElement;
let screeningEditToggle;
let screeningEditMode = false;
let screeningSummaryList;
let screeningSummaryNote;

const DEFAULT_SCREENING_RULES = {
  minAge: "",
  maxAge: "",
  targetNationalities: "",
  allowedJlptLevels: ["N1", "N2"],
};
let currentScreeningRules = { ...DEFAULT_SCREENING_RULES };

const SETTINGS_API_BASE = PRIMARY_API_BASE;
const SCREENING_RULES_ENDPOINT = `${SETTINGS_API_BASE}/settings-screening-rules`;

// ===== MS期間設定 =====
let msPeriodForm;
let msPeriodMonthSelect;
let msPeriodStatusEl;

export function mount() {
  // --- タブ切り替え ---
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', handleTabClick);
  });

  // --- スクリーニングルール ---
  screeningForm = document.getElementById("screeningRulesForm");
  screeningStatusElement = document.getElementById("screeningRulesStatus");
  screeningUpdatedAtElement = document.getElementById("screeningRulesUpdatedAt");
  screeningEditToggle = document.getElementById("screeningRulesEditToggle");
  screeningSummaryList = document.getElementById("screeningRulesSummaryList");
  screeningSummaryNote = document.getElementById("screeningRulesSummaryNote");

  if (screeningForm) {
    screeningForm.addEventListener("submit", handleScreeningSave);
  }
  if (screeningEditToggle) {
    screeningEditToggle.addEventListener("click", toggleScreeningEditMode);
  }
  const minUnlimited = document.getElementById("screeningMinAgeUnlimited");
  const maxUnlimited = document.getElementById("screeningMaxAgeUnlimited");
  if (minUnlimited) {
    minUnlimited.addEventListener("change", updateAgeLimitState);
  }
  if (maxUnlimited) {
    maxUnlimited.addEventListener("change", updateAgeLimitState);
  }

  loadScreeningRules();

  // --- MS期間設定 ---
  msPeriodForm = document.getElementById("msPeriodForm");
  msPeriodMonthSelect = document.getElementById("msPeriodMonthSelect");
  msPeriodStatusEl = document.getElementById("msPeriodStatus");

  if (msPeriodMonthSelect) {
    buildMonthOptions(msPeriodMonthSelect);
    msPeriodMonthSelect.addEventListener("change", handleMsPeriodMonthChange);
    // 初期ロード
    loadMsPeriodSettings(msPeriodMonthSelect.value);
  }
  if (msPeriodForm) {
    msPeriodForm.addEventListener("submit", handleMsPeriodSave);
  }
}

export function unmount() {
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.removeEventListener('click', handleTabClick);
  });

  if (screeningForm) {
    screeningForm.removeEventListener("submit", handleScreeningSave);
  }
  if (screeningEditToggle) {
    screeningEditToggle.removeEventListener("click", toggleScreeningEditMode);
  }
  const minUnlimited = document.getElementById("screeningMinAgeUnlimited");
  const maxUnlimited = document.getElementById("screeningMaxAgeUnlimited");
  if (minUnlimited) {
    minUnlimited.removeEventListener("change", updateAgeLimitState);
  }
  if (maxUnlimited) {
    maxUnlimited.removeEventListener("change", updateAgeLimitState);
  }
  if (msPeriodMonthSelect) {
    msPeriodMonthSelect.removeEventListener("change", handleMsPeriodMonthChange);
  }
  if (msPeriodForm) {
    msPeriodForm.removeEventListener("submit", handleMsPeriodSave);
  }
}

// ===== タブ切り替え =====
function handleTabClick(event) {
  const tab = event.currentTarget.dataset.tab;
  if (!tab) return;

  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.settings-tab-panel').forEach(panel => {
    panel.classList.toggle('is-active', panel.dataset.tabPanel === tab);
  });
}

// ===== MS期間設定 =====

// 月セレクターのオプションを生成（前後12ヶ月）
function buildMonthOptions(select) {
  const now = new Date();
  const options = [];
  for (let offset = -12; offset <= 12; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const value = `${year}-${month}`;
    const label = `${year}年${month}月`;
    options.push(`<option value="${value}"${offset === 0 ? ' selected' : ''}>${label}</option>`);
  }
  select.innerHTML = options.join('');
}

async function loadMsPeriodSettings(month) {
  if (!month) return;
  showMsPeriodStatus('読み込み中...', 'info');
  try {
    const settings = await goalSettingsService.loadMsPeriodSettings(month, { force: true });
    applyMsPeriodSettings(settings);
    showMsPeriodStatus('設定を読み込みました。', 'success');
  } catch (error) {
    console.error('[settings] failed to load ms period settings', error);
    showMsPeriodStatus('読み込みに失敗しました。', 'error');
  }
}

function applyMsPeriodSettings(settings) {
  // settings: { metricKey: { startDate, endDate }, ... }
  document.querySelectorAll('[data-metric][data-field]').forEach(input => {
    const metricKey = input.dataset.metric;
    const field = input.dataset.field;
    const period = settings?.[metricKey];
    if (field === 'start') {
      input.value = period?.startDate || '';
    } else if (field === 'end') {
      input.value = period?.endDate || '';
    }
  });
}

function handleMsPeriodMonthChange() {
  const month = msPeriodMonthSelect?.value;
  if (month) loadMsPeriodSettings(month);
}

async function handleMsPeriodSave(event) {
  event.preventDefault();
  const month = msPeriodMonthSelect?.value;
  if (!month) return;

  // フォームから設定を収集
  const metricMap = {};
  document.querySelectorAll('[data-metric][data-field]').forEach(input => {
    const metricKey = input.dataset.metric;
    const field = input.dataset.field;
    if (!metricMap[metricKey]) metricMap[metricKey] = {};
    if (field === 'start') metricMap[metricKey].startDate = input.value || null;
    if (field === 'end') metricMap[metricKey].endDate = input.value || null;
  });

  const settings = Object.entries(metricMap).map(([metricKey, period]) => ({
    metricKey,
    startDate: period.startDate || null,
    endDate: period.endDate || null
  }));

  showMsPeriodStatus('保存中...', 'info');
  try {
    await goalSettingsService.saveMsPeriodSettings(month, settings);
    showMsPeriodStatus('保存しました。', 'success');
  } catch (error) {
    console.error('[settings] failed to save ms period settings', error);
    showMsPeriodStatus('保存に失敗しました。', 'error');
  }
}

function showMsPeriodStatus(message, type = 'info') {
  if (!msPeriodStatusEl) return;
  msPeriodStatusEl.textContent = message;
  msPeriodStatusEl.classList.remove('settings-status-success', 'settings-status-error');
  if (type === 'success') msPeriodStatusEl.classList.add('settings-status-success');
  if (type === 'error') msPeriodStatusEl.classList.add('settings-status-error');
}

// ===== スクリーニングルール（既存ロジック） =====

async function loadScreeningRules() {
  if (!screeningForm) return;
  try {
    const session = getSession();
    const headers = session?.token ? { Authorization: `Bearer ${session.token}` } : {};
    const response = await fetch(SCREENING_RULES_ENDPOINT, { headers });
    if (!response.ok) {
      throw new Error("設定の取得に失敗しました。");
    }
    const data = await response.json();
    if (!data || data.exists === false) {
      applyScreeningRules(DEFAULT_SCREENING_RULES);
      updateScreeningUpdatedAt(null);
      showScreeningStatus("まだ設定が登録されていません。", "info");
      return;
    }
    const rules = normalizeScreeningRulesPayload(data);
    applyScreeningRules(rules);
    updateScreeningUpdatedAt(rules.updatedAt);
    showScreeningStatus("保存済みの設定を読み込みました。", "success");
  } catch (error) {
    console.error(error);
    showScreeningStatus("設定の読み込みに失敗しました。", "error");
  }
}

async function handleScreeningSave(event) {
  event.preventDefault();
  if (!screeningForm) return;

  const minUnlimited = Boolean(document.getElementById("screeningMinAgeUnlimited")?.checked);
  const maxUnlimited = Boolean(document.getElementById("screeningMaxAgeUnlimited")?.checked);
  const minAge = minUnlimited ? null : parseOptionalNumber(screeningForm.screeningMinAge?.value);
  const maxAge = maxUnlimited ? null : parseOptionalNumber(screeningForm.screeningMaxAge?.value);
  if (minAge !== null && maxAge !== null && minAge > maxAge) {
    showScreeningStatus("年齢の下限は上限以下にしてください。", "error");
    return;
  }

  const targetNationalities = normalizeCommaText(screeningForm.screeningNationalities?.value);
  const allowedJlptLevels = collectCheckedLevels();

  const body = {
    minAge,
    maxAge,
    allowedJlptLevels,
    targetNationalities,
  };

  try {
    const session = getSession();
    const token = session?.token;

    const response = await fetch(SCREENING_RULES_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || "保存に失敗しました。");
    }
    await loadScreeningRules();
    setScreeningEditMode(false);
    showScreeningStatus("設定を保存しました。", "success");
  } catch (error) {
    console.error(error);
    showScreeningStatus(error.message || "保存に失敗しました。", "error");
  }
}

function normalizeScreeningRulesPayload(payload) {
  const source = payload?.rules || payload?.item || payload?.data || payload || {};
  const nationalitiesRaw =
    source.targetNationalities ??
    source.target_nationalities ??
    source.allowedNationalities ??
    source.allowed_nationalities ??
    source.nationalities;
  const jlptRaw =
    source.allowedJlptLevels ?? source.allowed_jlpt_levels ?? source.allowed_japanese_levels;
  const hasNationalities = nationalitiesRaw !== undefined;
  const hasJlpt = jlptRaw !== undefined;
  return {
    minAge: readNumberValue(source.minAge ?? source.min_age),
    maxAge: readNumberValue(source.maxAge ?? source.max_age),
    targetNationalities: hasNationalities ? normalizeCommaText(nationalitiesRaw) : undefined,
    allowedJlptLevels: hasJlpt ? parseListValue(jlptRaw) : undefined,
    updatedAt: payload?.updatedAt ?? source.updatedAt ?? source.updated_at ?? null,
  };
}

function applyScreeningRules(rules) {
  if (!screeningForm) return;
  const normalized = { ...DEFAULT_SCREENING_RULES, ...(rules || {}) };
  currentScreeningRules = normalized;

  if (screeningForm.screeningMinAge) {
    const minUnlimited = isUnlimitedMinAge(normalized.minAge);
    screeningForm.screeningMinAge.value = minUnlimited ? "" : normalized.minAge ?? "";
    const minUnlimitedEl = document.getElementById("screeningMinAgeUnlimited");
    if (minUnlimitedEl) minUnlimitedEl.checked = minUnlimited;
  }
  if (screeningForm.screeningMaxAge) {
    const maxUnlimited = isUnlimitedMaxAge(normalized.maxAge);
    screeningForm.screeningMaxAge.value = maxUnlimited ? "" : normalized.maxAge ?? "";
    const maxUnlimitedEl = document.getElementById("screeningMaxAgeUnlimited");
    if (maxUnlimitedEl) maxUnlimitedEl.checked = maxUnlimited;
  }
  if (screeningForm.screeningNationalities) {
    screeningForm.screeningNationalities.value = normalized.targetNationalities || "";
  }

  const allowed = new Set((normalized.allowedJlptLevels || []).map((level) => String(level)));
  document.querySelectorAll('input[name="screeningJpLevel"]').forEach((input) => {
    input.checked = allowed.has(String(input.value));
  });

  updateAgeLimitState();
  setScreeningEditMode(false, { silent: true });
  updateScreeningSummary(normalized);
}

function collectCheckedLevels() {
  return Array.from(document.querySelectorAll('input[name="screeningJpLevel"]:checked'))
    .map((input) => input.value)
    .filter(Boolean);
}

function toggleScreeningEditMode() {
  const next = !screeningEditMode;
  if (!next) {
    applyScreeningRules(currentScreeningRules);
  }
  setScreeningEditMode(next);
}

function setScreeningEditMode(isEditing, { silent = false } = {}) {
  screeningEditMode = isEditing;
  if (screeningForm) {
    screeningForm.classList.toggle("is-editing", isEditing);
    const inputs = screeningForm.querySelectorAll("[data-screening-field]");
    inputs.forEach((input) => {
      input.disabled = !isEditing;
    });
    updateAgeLimitState();
  }
  if (screeningEditToggle) {
    screeningEditToggle.textContent = isEditing ? "編集を閉じる" : "編集";
  }
  if (!silent) {
    showScreeningStatus(isEditing ? "編集モードになりました。" : "閲覧モードに戻りました。", "info");
  }
}

function updateAgeLimitState() {
  const minInput = document.getElementById("screeningMinAge");
  const maxInput = document.getElementById("screeningMaxAge");
  const minUnlimited = document.getElementById("screeningMinAgeUnlimited");
  const maxUnlimited = document.getElementById("screeningMaxAgeUnlimited");

  if (minInput && minUnlimited) {
    const shouldDisable = !screeningEditMode || minUnlimited.checked;
    minInput.disabled = shouldDisable;
    if (minUnlimited.checked) minInput.value = "";
  }
  if (maxInput && maxUnlimited) {
    const shouldDisable = !screeningEditMode || maxUnlimited.checked;
    maxInput.disabled = shouldDisable;
    if (maxUnlimited.checked) maxInput.value = "";
  }
}

function isUnlimitedMinAge(value) {
  if (value === null || value === undefined || value === "") return true;
  const num = Number(value);
  return Number.isFinite(num) ? num <= 0 : false;
}

function isUnlimitedMaxAge(value) {
  if (value === null || value === undefined || value === "") return true;
  const num = Number(value);
  return Number.isFinite(num) ? num >= 100 : false;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function readNumberValue(value) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

function parseListValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (value === null || value === undefined) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCommaText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(", ");
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function normalizeNationalityLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.toLowerCase();
  if (normalized === "japan" || normalized === "jpn" || normalized === "jp" || normalized === "japanese") {
    return "日本";
  }
  if (text === "日本国" || text === "日本国籍" || text === "日本人" || text === "日本国民") return "日本";
  return text;
}

function isJapaneseNationalityLabel(value) {
  return normalizeNationalityLabel(value) === "日本";
}

function updateScreeningSummary(rules) {
  if (!screeningSummaryList) return;
  const minUnlimited = isUnlimitedMinAge(rules.minAge);
  const maxUnlimited = isUnlimitedMaxAge(rules.maxAge);
  const ageParts = [];
  if (!minUnlimited && rules.minAge !== "" && rules.minAge !== null) ageParts.push(`${rules.minAge}歳以上`);
  if (!maxUnlimited && rules.maxAge !== "" && rules.maxAge !== null) ageParts.push(`${rules.maxAge}歳以下`);
  const ageText = ageParts.length ? ageParts.join("・") : "制限なし";

  const jlptLevels = (rules.allowedJlptLevels || []).map((level) => String(level).trim()).filter(Boolean);
  const jlptText = jlptLevels.length
    ? `言語レベル: ${jlptLevels.join(", ")}`
    : "言語レベル: 未設定（非日本は全員無効）";

  const nationalities = parseListValue(rules.targetNationalities).map(normalizeNationalityLabel);
  const nonJapaneseTargets = nationalities.filter((value) => value && !isJapaneseNationalityLabel(value));
  const nationalityText = nonJapaneseTargets.length
    ? `非日本国籍の対象: ${nonJapaneseTargets.join(", ")}`
    : "非日本国籍の対象: 指定なし（すべて対象）";

  const lines = [
    `年齢条件: ${ageText}`,
    "日本国籍: 年齢条件のみで有効（言語レベル不要）",
    `日本以外: 年齢条件 + ${jlptText}`,
    nationalityText,
  ];

  screeningSummaryList.innerHTML = lines.map((text) => `<li>${text}</li>`).join("");
  if (screeningSummaryNote) {
    screeningSummaryNote.textContent = "※ 対象国籍は非日本国籍の絞り込みに使います。日本国籍は自動で有効判定対象です。";
  }
}

function showScreeningStatus(message, type = "info") {
  if (!screeningStatusElement) return;
  screeningStatusElement.textContent = message;
  screeningStatusElement.classList.remove(
    "settings-status-success",
    "settings-status-error"
  );
  if (type === "success") {
    screeningStatusElement.classList.add("settings-status-success");
  } else if (type === "error") {
    screeningStatusElement.classList.add("settings-status-error");
  }
}

function updateScreeningUpdatedAt(value) {
  if (!screeningUpdatedAtElement) return;
  screeningUpdatedAtElement.textContent = value ? formatDateTimeJP(value) : "-";
}

function formatDateTimeJP(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}
