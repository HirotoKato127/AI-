// teleapo.js
console.log("🔥 teleapo.js 読み込み成功！");
// === AI分析機能の有効／無効フラグ ===
const TELEAPO_AI_ANALYSIS_ENABLED = false;

// ======== グローバル状態 ========
// 日別のモックデータ（本番ではここをAPI/GASで取得）
let teleapoCompanyDailyData = [];          // [{ date: '2024-11-01', dials, connects, sets, shows }, ...]
let teleapoEmployeeDailyData = {};         // { '佐藤': [{date, dials,...}], '田中': [...], ... }
const teleapoEmployees = ['佐藤', '田中', '山本', '鈴木'];

let teleapoEmployeeData = [];
let teleapoCompanyKPIData = null;

let teleapoSummaryScope = {
  type: 'company', // 'company' | 'employee'
  name: '全体'
};

let teleapoGlobalStartDate = null; // 'yyyy-mm-dd'
let teleapoGlobalEndDate = null;   // 'yyyy-mm-dd'


// ======== ヒートマップ（指標ごとに別データ） ========

// 軸定義
const TELEAPO_HEATMAP_DAYS = ['月', '火', '水', '木', '金'];
const TELEAPO_HEATMAP_SLOTS = ['09-11', '11-13', '13-15', '15-17', '17-19'];

// 社員別ヒートマップデータ（架電数・通電数・設定数・着座数）
const TELEAPO_HEATMAP_DATA = {
  all: {
    // 架電数
    dials: {
      '月': { '09-11': 10, '11-13': 16, '13-15': 14, '15-17': 9, '17-19': 5 },
      '火': { '09-11': 8, '11-13': 14, '13-15': 13, '15-17': 11, '17-19': 4 },
      '水': { '09-11': 7, '11-13': 12, '13-15': 15, '15-17': 12, '17-19': 6 },
      '木': { '09-11': 12, '11-13': 18, '13-15': 17, '15-17': 13, '17-19': 6 },
      '金': { '09-11': 6, '11-13': 9, '13-15': 11, '15-17': 12, '17-19': 3 }
    },
    // 通電数（架電数の 50〜70% 程度）
    connects: {
      '月': { '09-11': 6, '11-13': 11, '13-15': 9, '15-17': 6, '17-19': 3 },
      '火': { '09-11': 4, '11-13': 9, '13-15': 8, '15-17': 7, '17-19': 2 },
      '水': { '09-11': 4, '11-13': 8, '13-15': 10, '15-17': 8, '17-19': 4 },
      '木': { '09-11': 7, '11-13': 12, '13-15': 11, '15-17': 9, '17-19': 4 },
      '金': { '09-11': 3, '11-13': 6, '13-15': 7, '15-17': 8, '17-19': 2 }
    },
    // 設定数（通電数の 30〜50% 程度）
    sets: {
      '月': { '09-11': 3, '11-13': 5, '13-15': 4, '15-17': 3, '17-19': 1 },
      '火': { '09-11': 2, '11-13': 4, '13-15': 3, '15-17': 3, '17-19': 1 },
      '水': { '09-11': 2, '11-13': 3, '13-15': 4, '15-17': 3, '17-19': 2 },
      '木': { '09-11': 3, '11-13': 6, '13-15': 5, '15-17': 4, '17-19': 2 },
      '金': { '09-11': 1, '11-13': 3, '13-15': 3, '15-17': 3, '17-19': 1 }
    },
    // 着座数（設定数の 70〜90% 程度）
    shows: {
      '月': { '09-11': 2, '11-13': 4, '13-15': 3, '15-17': 2, '17-19': 1 },
      '火': { '09-11': 1, '11-13': 3, '13-15': 2, '15-17': 2, '17-19': 1 },
      '水': { '09-11': 1, '11-13': 2, '13-15': 3, '15-17': 2, '17-19': 1 },
      '木': { '09-11': 2, '11-13': 4, '13-15': 4, '15-17': 3, '17-19': 1 },
      '金': { '09-11': 1, '11-13': 2, '13-15': 2, '15-17': 2, '17-19': 0 }
    }
  },
  // 佐藤さん：全体より少し少ない傾向
  '佐藤': {
    dials: {
      '月': { '09-11': 4, '11-13': 7, '13-15': 6, '15-17': 4, '17-19': 2 },
      '火': { '09-11': 3, '11-13': 6, '13-15': 5, '15-17': 4, '17-19': 2 },
      '水': { '09-11': 3, '11-13': 5, '13-15': 6, '15-17': 5, '17-19': 3 },
      '木': { '09-11': 5, '11-13': 8, '13-15': 7, '15-17': 6, '17-19': 3 },
      '金': { '09-11': 2, '11-13': 4, '13-15': 4, '15-17': 5, '17-19': 1 }
    },
    connects: {
      '月': { '09-11': 2, '11-13': 4, '13-15': 3, '15-17': 2, '17-19': 1 },
      '火': { '09-11': 2, '11-13': 3, '13-15': 3, '15-17': 3, '17-19': 1 },
      '水': { '09-11': 1, '11-13': 3, '13-15': 4, '15-17': 3, '17-19': 2 },
      '木': { '09-11': 3, '11-13': 5, '13-15': 4, '15-17': 3, '17-19': 2 },
      '金': { '09-11': 1, '11-13': 2, '13-15': 3, '15-17': 3, '17-19': 1 }
    },
    sets: {
      '月': { '09-11': 1, '11-13': 2, '13-15': 2, '15-17': 1, '17-19': 0 },
      '火': { '09-11': 1, '11-13': 2, '13-15': 1, '15-17': 1, '17-19': 0 },
      '水': { '09-11': 0, '11-13': 1, '13-15': 2, '15-17': 1, '17-19': 1 },
      '木': { '09-11': 1, '11-13': 2, '13-15': 2, '15-17': 2, '17-19': 1 },
      '金': { '09-11': 0, '11-13': 1, '13-15': 1, '15-17': 1, '17-19': 0 }
    },
    shows: {
      '月': { '09-11': 0, '11-13': 1, '13-15': 1, '15-17': 1, '17-19': 0 },
      '火': { '09-11': 0, '11-13': 1, '13-15': 1, '15-17': 1, '17-19': 0 },
      '水': { '09-11': 0, '11-13': 1, '13-15': 1, '15-17': 0, '17-19': 0 },
      '木': { '09-11': 1, '11-13': 1, '13-15': 2, '15-17': 1, '17-19': 0 },
      '金': { '09-11': 0, '11-13': 0, '13-15': 1, '15-17': 1, '17-19': 0 }
    }
  }
  // 田中・山本・鈴木 は必要になったら追記
};

let teleapoHeatmapSelection = null;

function initializeTeleapoHeatmapControls() {
  const empSelect = document.getElementById('teleapoHeatmapEmployeeFilter');
  const metricSelect = document.getElementById('teleapoHeatmapMetricFilter');

  if (metricSelect) {
    metricSelect.value = 'connectRate'; // 初期は「通電率」
  }

  if (empSelect) {
    empSelect.addEventListener('change', () => {
      renderTeleapoHeatmap();
    });
  }
  if (metricSelect) {
    metricSelect.addEventListener('change', () => {
      renderTeleapoHeatmap();
    });
  }
}
// ヒートマップ描画（通電率 / 設定率 を平均との差で青／赤グラデーション）
// 記録なし（架電/通電/設定すべて0）の時間帯は無色（ニュートラル）で表示
function renderTeleapoHeatmap() {
  const empSelect = document.getElementById('teleapoHeatmapEmployeeFilter');
  const metricSelect = document.getElementById('teleapoHeatmapMetricFilter');
  const tbody = document.getElementById('teleapoHeatmapTableBody');
  if (!tbody) return;

  const employeeKey = empSelect?.value || 'all';             // all / 佐藤 / ...
  const metricKey = metricSelect?.value || 'connectRate';  // connectRate / setRate

  // 架電数 / 通電数 / 設定数 の元データ（TELEAPO_HEATMAP_DATA は件数）
  const empCounts = TELEAPO_HEATMAP_DATA[employeeKey] || TELEAPO_HEATMAP_DATA.all;
  const dialsData = empCounts.dials || {};
  const connectsData = empCounts.connects || {};
  const setsData = empCounts.sets || {};

  const rateMap = {}; // day -> slot -> rate (0〜100 or null)
  const hasData = {}; // day -> slot -> boolean（記録があるか）
  let sumRate = 0;
  let cellCount = 0;

  // 1. 各セルの率を計算（記録なしセルは平均計算から除外）
  TELEAPO_HEATMAP_DAYS.forEach(day => {
    rateMap[day] = {};
    hasData[day] = {};
    TELEAPO_HEATMAP_SLOTS.forEach(slot => {
      const dials = dialsData[day]?.[slot] ?? 0;
      const connects = connectsData[day]?.[slot] ?? 0;
      const sets = setsData[day]?.[slot] ?? 0;

      // 「記録なし」条件：架電・通電・設定がすべて 0
      const noRecord = dials === 0 && connects === 0 && sets === 0;

      if (noRecord) {
        rateMap[day][slot] = null;
        hasData[day][slot] = false;
        return;
      }

      let rate = 0;
      if (metricKey === 'connectRate') {
        // 通電率 = 通電数 / 架電数
        rate = dials > 0 ? (connects / dials) * 100 : 0;
      } else if (metricKey === 'setRate') {
        // 設定率 = 設定数 / 通電数
        rate = connects > 0 ? (sets / connects) * 100 : 0;
      }

      rateMap[day][slot] = rate;
      hasData[day][slot] = true;
      sumRate += rate;
      cellCount += 1;
    });
  });

  const avgRate = cellCount > 0 ? sumRate / cellCount : 0;

  // 2. 平均との差の最大絶対値を計算（記録ありセルのみ対象）
  let maxAbsDiff = 0;
  TELEAPO_HEATMAP_DAYS.forEach(day => {
    TELEAPO_HEATMAP_SLOTS.forEach(slot => {
      if (!hasData[day][slot]) return;
      const diff = rateMap[day][slot] - avgRate;
      const abs = Math.abs(diff);
      if (abs > maxAbsDiff) maxAbsDiff = abs;
    });
  });
  if (maxAbsDiff === 0) maxAbsDiff = 1; // 全セル同じレートのときのゼロ除算防止

  // 3. テーブル描画
  tbody.innerHTML = '';

  TELEAPO_HEATMAP_SLOTS.forEach(slot => {
    const tr = document.createElement('tr');

    const th = document.createElement('th');
    th.textContent = `${slot}時`;
    th.className = 'px-3 py-2 border border-slate-200 text-left bg-slate-50';
    tr.appendChild(th);

    TELEAPO_HEATMAP_DAYS.forEach(day => {
      const td = document.createElement('td');
      td.className = 'px-1 py-1 border border-slate-200 text-center';

      const rate = rateMap[day][slot];
      const has = hasData[day][slot];

      const cell = document.createElement('div');
      cell.className = 'kpi-v2-heatmap-cell';

      if (!has) {
        // ★ 記録なし：ハイフン＋ほぼ無色
        cell.textContent = '-';
        cell.style.backgroundColor = 'rgba(248, 250, 252, 1)'; // #f8fafc（ごく薄いグレー）
      } else {
        const diff = rate - avgRate;                      // 平均との差（pt）
        const t = Math.min(1, Math.abs(diff) / maxAbsDiff);  // 0〜1 正規化

        cell.dataset.count = rate.toFixed(1);
        cell.textContent = `${rate.toFixed(0)}%`;

        let bgColor;
        if (Math.abs(diff) < 1) {
          // 平均±1pt以内 → ニュートラル
          bgColor = 'rgba(248, 250, 252, 1)';
        } else if (diff > 0) {
          // 平均より高い → 青系 (#2563eb)
          const alpha = 0.2 + 0.6 * t; // 0.2〜0.8
          bgColor = `rgba(37, 99, 235, ${alpha.toFixed(2)})`;
        } else {
          // 平均より低い → 赤系 (#ef4444)
          const alpha = 0.2 + 0.6 * t;
          bgColor = `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
        }

        cell.style.backgroundColor = bgColor;
      }

      td.appendChild(cell);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}



//（必要なら）セルクリック用の関数もそのまま再利用
function handleTeleapoHeatmapCellClick(day, slot) {
  if (teleapoHeatmapSelection &&
    teleapoHeatmapSelection.day === day &&
    teleapoHeatmapSelection.slot === slot) {
    teleapoHeatmapSelection = null;
  } else {
    teleapoHeatmapSelection = { day, slot };
  }
  renderTeleapoHeatmap();
  updateTeleapoHeatmapSelectionLabel();
  filterTeleapoLogRows();
}

function updateTeleapoHeatmapSelectionLabel() {
  const labelEl = document.getElementById('teleapoHeatmapSelectionLabel');
  if (!labelEl) return;
  if (!teleapoHeatmapSelection) {
    labelEl.textContent = '※セルをクリックすると、その曜日・時間帯のログだけを下のテーブルに表示します（もう一度クリックで解除）。';
  } else {
    labelEl.textContent = `選択中：${teleapoHeatmapSelection.day}曜 ${teleapoHeatmapSelection.slot}時 のログを表示中`;
  }
}

// ★ 過去60日分くらいの日別モックデータを作る
function initializeTeleapoMockDailyData() {
  if (teleapoCompanyDailyData.length) return; // 二重実行防止

  const today = new Date();
  const daysBack = 60; // 過去60日分

  teleapoCompanyDailyData = [];
  teleapoEmployeeDailyData = {};
  teleapoEmployees.forEach(name => {
    teleapoEmployeeDailyData[name] = [];
  });

  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // 会社全体の日別モック（曜日などで少し変動させる）
    const dayOfWeek = d.getDay(); // 0:日〜6:土
    const baseDials = 40 + (dayOfWeek === 1 || dayOfWeek === 2 ? 10 : 0); // 月火はちょい多め
    const noise = (Math.sin(i * 1.3) + 1) * 5; // 0〜10くらいの揺れ
    const dials = Math.round(baseDials + noise);

    const connects = Math.round(dials * (0.45 + 0.1 * Math.sin(i * 0.7)));
    const sets = Math.round(connects * (0.30 + 0.05 * Math.cos(i * 0.9)));
    const shows = Math.round(sets * (0.80 + 0.05 * Math.sin(i * 0.5)));

    teleapoCompanyDailyData.push({ date: dateStr, dials, connects, sets, shows });

    // 社員ごとに適当な分配（4人で分けるイメージ）
    teleapoEmployees.forEach((name, idx) => {
      // 比率を少し変える
      const ratio = 0.2 + idx * 0.15; // 0.2, 0.35, 0.5, 0.65
      const eDials = Math.max(1, Math.round((dials * ratio) / teleapoEmployees.length));
      const eConnects = Math.round(eDials * (0.45 + 0.08 * Math.sin((i + idx) * 0.6)));
      const eSets = Math.round(eConnects * (0.30 + 0.04 * Math.cos((i + idx) * 0.7)));
      const eShows = Math.round(eSets * (0.80 + 0.05 * Math.sin((i + idx) * 0.4)));

      teleapoEmployeeDailyData[name].push({
        date: dateStr,
        dials: eDials,
        connects: eConnects,
        sets: eSets,
        shows: eShows
      });
    });
  }
}

let teleapoEmployeeSortInitialized = false;

function initializeTeleapoEmployeeSortControls() {
  const sortSelect = document.getElementById('teleapoEmployeeSortSelect');
  if (!sortSelect) return;

  // 初期値は着座率（高い順）
  sortSelect.value = 'showRate-desc';

  sortSelect.onchange = (event) => {
    const sortKey = event.target.value; // 例: 'connectRate-desc'
    sortTeleapoEmployees(sortKey);
  };
}


// ======== ライフサイクル ========
export function mount() {
  console.log('Teleapo page mounted');

  initializeTeleapoMockDailyData();
  initializeTeleapoDatePickers();

  initializeTeleapoHeatmapControls();
  renderTeleapoHeatmap();   // ★ これで初期表示

  initializeTeleapoLogFilters();
  loadTeleapoCompanyKPIData();
  loadTeleapoEmployeeData();
  initializeTeleapoEmployeeSortControls();
}



export function unmount() {
  console.log('Teleapo page unmounted');
  cleanupTeleapoEventListeners();
}

// ======== 日付・期間指定 ========
function initializeTeleapoDatePickers() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const firstOfMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstOfMonthStr = firstOfMonthDate.toISOString().split('T')[0];

  const companyStart = document.getElementById('teleapoCompanyRangeStart');
  const companyEnd = document.getElementById('teleapoCompanyRangeEnd');
  const logStart = document.getElementById('teleapoLogRangeStart');
  const logEnd = document.getElementById('teleapoLogRangeEnd');

  // 初期値：当月1日〜今日
  [companyStart, logStart].forEach(el => el && (el.value = firstOfMonthStr));
  [companyEnd, logEnd].forEach(el => el && (el.value = todayStr));

  teleapoGlobalStartDate = firstOfMonthStr;
  teleapoGlobalEndDate = todayStr;

  [companyStart, companyEnd, logStart, logEnd].forEach(el => {
    if (el) el.addEventListener('change', handleTeleapoDateRangeChange);
  });

  // プリセットボタン
  const presetButtons = document.querySelectorAll('.kpi-v2-range-presets .kpi-v2-range-btn');
  presetButtons.forEach(btn => btn.addEventListener('click', handleTeleapoPresetClick));

  updateTeleapoPeriodLabels();
}

// 「今日/今週/今月」プリセットの選択状態をクリア
function clearTeleapoPresetButtonsActive() {
  const presetButtons = document.querySelectorAll('.kpi-v2-range-presets .kpi-v2-range-btn');
  presetButtons.forEach(btn => {
    btn.classList.remove('kpi-v2-range-btn-active');
  });
}

function handleTeleapoPresetClick(event) {
  const btn = event.currentTarget;
  const preset = btn.dataset.preset; // 'today' | 'thisWeek' | 'thisMonth'
  if (!preset) return;

  // ボタングループ内のアクティブ切り替え
  const group = btn.closest('.kpi-v2-range-presets');
  if (group) {
    group.querySelectorAll('.kpi-v2-range-btn').forEach(b => b.classList.remove('kpi-v2-range-btn-active'));
    btn.classList.add('kpi-v2-range-btn-active');
  }

  const { startStr, endStr } = getDateRangeByPreset(preset);
  if (!startStr || !endStr) return;

  const companyStart = document.getElementById('teleapoCompanyRangeStart');
  const companyEnd = document.getElementById('teleapoCompanyRangeEnd');
  const logStart = document.getElementById('teleapoLogRangeStart');
  const logEnd = document.getElementById('teleapoLogRangeEnd');

  if (companyStart) companyStart.value = startStr;
  if (companyEnd) companyEnd.value = endStr;
  if (logStart) logStart.value = startStr;
  if (logEnd) logEnd.value = endStr;

  teleapoGlobalStartDate = startStr;
  teleapoGlobalEndDate = endStr;

  updateTeleapoPeriodLabels();
  loadTeleapoData();
  filterTeleapoLogRows();
}

function getDateRangeByPreset(preset) {
  const today = new Date();
  let startDate = new Date(today);
  let endDate = new Date(today);

  if (preset === 'today') {
    // そのまま
  } else if (preset === 'thisWeek') {
    const day = today.getDay(); // 0:日〜6:土
    const diffToMonday = (day + 6) % 7;
    startDate = new Date(today);
    startDate.setDate(today.getDate() - diffToMonday);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
  } else if (preset === 'thisMonth') {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  }

  const toStr = d => d.toISOString().split('T')[0];
  return { startStr: toStr(startDate), endStr: toStr(endDate) };
}
function handleTeleapoDateRangeChange(event) {
  const id = event.target.id || '';

  const companyStart = document.getElementById('teleapoCompanyRangeStart');
  const companyEnd = document.getElementById('teleapoCompanyRangeEnd');
  const logStart = document.getElementById('teleapoLogRangeStart');
  const logEnd = document.getElementById('teleapoLogRangeEnd');

  if (id === 'teleapoCompanyRangeStart' || id === 'teleapoCompanyRangeEnd') {
    const startStr = companyStart?.value || '';
    const endStr = companyEnd?.value || '';
    if (logStart && startStr) logStart.value = startStr;
    if (logEnd && endStr) logEnd.value = endStr;
    teleapoGlobalStartDate = startStr || null;
    teleapoGlobalEndDate = endStr || null;
  }

  if (id === 'teleapoLogRangeStart' || id === 'teleapoLogRangeEnd') {
    const startStr = logStart?.value || '';
    const endStr = logEnd?.value || '';
    if (companyStart && startStr) companyStart.value = startStr;
    if (companyEnd && endStr) companyEnd.value = endStr;
    teleapoGlobalStartDate = startStr || null;
    teleapoGlobalEndDate = endStr || null;
  }

  // ★ 日付が手動で変えられたので、プリセットの active は解除する
  clearTeleapoPresetButtonsActive();

  updateTeleapoPeriodLabels();
  loadTeleapoData();
  filterTeleapoLogRows();
}

function updateTeleapoPeriodLabels() {
  const companyStart = document.getElementById('teleapoCompanyRangeStart')?.value;
  const companyEnd = document.getElementById('teleapoCompanyRangeEnd')?.value;
  const label = document.getElementById('teleapoCompanyPeriodLabel');

  if (label && companyStart && companyEnd) {
    label.textContent = `選択期間：${companyStart.replace(/-/g, '/')} 〜 ${companyEnd.replace(/-/g, '/')}`;
  }

  // ★ ヒートマップ用ラベルも更新
  updateTeleapoHeatmapPeriodLabel();
}


// ヒートマップ対象期間ラベル更新
function updateTeleapoHeatmapPeriodLabel() {
  const label = document.getElementById('teleapoHeatmapPeriodLabel');
  if (!label) return;

  if (!teleapoGlobalStartDate || !teleapoGlobalEndDate) {
    label.textContent = '';
    return;
  }

  const s = teleapoGlobalStartDate.replace(/-/g, '/');
  const e = teleapoGlobalEndDate.replace(/-/g, '/');
  label.textContent = `ヒートマップ対象期間：${s} 〜 ${e}`;
}


function getTeleapoRangeDays() {
  if (!teleapoGlobalStartDate || !teleapoGlobalEndDate) return 30;
  const start = new Date(teleapoGlobalStartDate + 'T00:00:00');
  const end = new Date(teleapoGlobalEndDate + 'T23:59:59');
  const diffMs = end - start;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(days, 1);
}

// ======== データ読み込み（モック） ========
// Teleapo データ全体の読み込み
// Teleapo データ全体の読み込み（必ずログまで到達するようにする）
function loadTeleapoData() {
  console.log('loadTeleapoData: start');

  try {
    if (typeof loadTeleapoPersonalKPIData === 'function') {
      loadFileTimePersonalKPI();
    }
  } catch (e) {
    console.error('loadTeleapoPersonalKPIData でエラー:', e);
  }

  try {
    if (typeof loadTeleapoCompanyKPIData === 'function') {
      loadTeleapoCompanyKPIDisplayFromEmployees?.();
      // もし上の関数を使っていない場合は、元の loadTeleapoCompanyKPIData を呼んでもOKです
      loadTeleapoCompanyKPIData();
    }
  } catch (e) {
    console.error('loadTeleapoCompanyKPIData でエラー:', e);
  }

  try {
    if (typeof loadTeleapoEmployeeData === 'function') {
      loadTeleapoEmployeeData();
    }
  } catch (e) {
    console.error('loadTeleapoEmployeeData でエラー:', e);
  }

  // ---- ここが一番大事：ログを必ず描画する ----
  try {
    if (typeof loadTeleapoLogData === 'function') {
      loadTeleapoLogData();
    } else {
      console.warn('loadTeleapoData: loadTeleapoLogData が見つかりません');
    }
  } catch (e) {
    console.error('loadTeleapoLogData でエラー:', e);
  }

  try {
    if (typeof loadTeleapoHeatmapData === 'function') {
      loadTeleapoHeatmapData();
    }
  } catch (e) {
    console.error('loadTeleapoHeatmapData でエラー:', e);
  }

  console.log('loadTeleapoData: end');
}



// 全体KPI（期間に応じてスケール）
async function loadTeleapoCompanyKPIData() {
  if (!teleapoCompanyDailyData.length) {
    console.warn('teleapoCompanyDailyData is empty');
    return;
  }

  const start = teleapoGlobalStartDate
    ? new Date(teleapoGlobalStartDate + 'T00:00:00')
    : new Date(teleapoCompanyDailyData[0].date + 'T00:00:00');
  const end = teleapoGlobalEndDate
    ? new Date(teleapoGlobalEndDate + 'T23:59:59')
    : new Date(teleapoCompanyDailyData[teleapoCompanyDailyData.length - 1].date + 'T23:59:59');

  let dialsSum = 0;
  let connectsSum = 0;
  let setsSum = 0;
  let showsSum = 0;

  teleapoCompanyDailyData.forEach(row => {
    const d = new Date(row.date + 'T12:00:00');
    if (d < start || d > end) return;
    dialsSum += row.dials;
    connectsSum += row.connects;
    setsSum += row.sets;
    showsSum += row.shows;
  });

  if (dialsSum === 0) {
    // データがない期間（週末だけ選んだ、とか）の保険
    teleapoCompanyKPIData = {
      dials: 0,
      connects: 0,
      sets: 0,
      shows: 0,
      connectRate: 0,
      setRate: 0,
      showRate: 0
    };
  } else {
    teleapoCompanyKPIData = {
      dials: dialsSum,
      connects: connectsSum,
      sets: setsSum,
      shows: showsSum,
      connectRate: (connectsSum / dialsSum) * 100,
      setRate: connectsSum > 0 ? (setsSum / connectsSum) * 100 : 0,
      showRate: setsSum > 0 ? (showsSum / setsSum) * 100 : 0
    };
  }

  // スコープに応じて上部カード更新
  if (teleapoSummaryScope.type === 'company') {
    updateTeleapoSummaryRateCards(teleapoCompanyKPIData, null);
  }
}


// 社員成績（期間に応じてスケール）
async function loadTeleapoEmployeeData() {
  const start = teleapoGlobalStartDate
    ? new Date(teleapoGlobalStartDate + 'T00:00:00')
    : null;
  const end = teleapoGlobalEndDate
    ? new Date(teleapoGlobalEndDate + 'T23:59:59')
    : null;

  const employeeData = teleapoEmployees.map(name => {
    const daily = teleapoEmployeeDailyData[name] || [];
    let dialsSum = 0;
    let connectsSum = 0;
    let setsSum = 0;
    let showsSum = 0;

    daily.forEach(row => {
      const d = new Date(row.date + 'T12:00:00');
      if (start && d < start) return;
      if (end && d > end) return;
      dialsSum += row.dials;
      connectsSum += row.connects;
      setsSum += row.sets;
      showsSum += row.shows;
    });

    const connectRate = dialsSum > 0 ? (connectsSum / dialsSum) * 100 : 0;
    const setRate = connectsSum > 0 ? (setsSum / connectsSum) * 100 : 0;
    const showRate = setsSum > 0 ? (showsSum / setsSum) * 100 : 0;

    return {
      name,
      dials: dialsSum,
      connects: connectsSum,
      sets: setsSum,
      shows: showsSum,
      connectRate,
      setRate,
      showRate
    };
  });

  teleapoEmployeeData = employeeData;

  // ★ 初期表示は「着座率（高い順）」で並び替え＆表示
  sortTeleapoEmployees('showRate-desc');

  // ★ テーブルができた後で、ソートセレクトにイベントをつける
  initializeTeleapoEmployeeSortControls();

  // ★ 社員スコープだった場合の処理（既存のものをそのまま下に残す）
  if (teleapoSummaryScope.type === 'employee') {
    const currentName = teleapoSummaryScope.name;
    const emp = teleapoEmployeeData.find(e => e.name === currentName);
    if (emp) {
      updateTeleapoSummaryRateCards(emp, currentName);
      filterTeleapoEmployeeTable(currentName);
      renderTeleapoEmployeeTrendChart(emp, currentName);
      const chartWrapper = document.getElementById('teleapoEmployeeChartWrapper');
      if (chartWrapper) chartWrapper.classList.remove('hidden');
    }
  }
}


// 社員テーブル表示
function updateTeleapoEmployeeDisplay(data) {
  const tbody = document.getElementById('teleapoEmployeeTableBody');
  if (!tbody) return;

  tbody.innerHTML = data
    .map(
      emp => `
    <tr class="teleapo-employee-row hover:bg-slate-50 cursor-pointer" data-employee-name="${emp.name}">
      <td class="font-medium text-slate-800">${emp.name}</td>
      <td class="text-right">${emp.dials}</td>
      <td class="text-right">${emp.connects}</td>
      <td class="text-right">${emp.sets}</td>
      <td class="text-right font-semibold text-green-700">${emp.shows}</td>
      <td class="text-right">${emp.connectRate.toFixed(1)}%</td>
      <td class="text-right">${emp.setRate.toFixed(1)}%</td>
      <td class="text-right">${emp.showRate.toFixed(1)}%</td>
    </tr>
  `
    )
    .join('');

  attachTeleapoEmployeeRowHandlers();
}

function sortTeleapoEmployees(sortValue = 'showRate-desc') {
  if (!teleapoEmployeeData || !teleapoEmployeeData.length) return;

  const [key, dirStr] = sortValue.split('-'); // 例: 'connectRate-desc'
  const dir = dirStr === 'asc' ? 1 : -1;

  // ★ 元データからコピーしてソート（安全のため）
  const sorted = [...teleapoEmployeeData].sort((a, b) => {
    if (key === 'name') {
      return dir * a.name.localeCompare(b.name, 'ja');
    }
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    return dir * (av - bv);
  });

  // ★ ソート済みデータでテーブルを再描画
  updateTeleapoEmployeeDisplay(sorted);

  // セレクトの表示を現在のソートに合わせる
  const sortSelect = document.getElementById('teleapoEmployeeSortSelect');
  if (sortSelect) {
    sortSelect.value = sortValue;
  }
}

function attachTeleapoEmployeeRowHandlers() {
  const rows = document.querySelectorAll('.teleapo-employee-row');
  const chartWrapper = document.getElementById('teleapoEmployeeChartWrapper');

  rows.forEach(row => {
    const name = row.dataset.employeeName;
    if (!name) return;

    row.onclick = () => {
      const emp = teleapoEmployeeData.find(e => e.name === name);
      if (!emp) return;

      // ★ 既存の社員選択ロジック（クラス付け・KPI更新・グラフ表示）はそのまま
      // ...（teleapoSummaryScope の更新、updateTeleapoSummaryRateCards、filterTeleapoEmployeeTable 等）
      teleapoSummaryScope = { type: 'employee', name };
      updateTeleapoSummaryRateCards(emp, name);
      filterTeleapoEmployeeTable(name);
      renderTeleapoEmployeeTrendChart(emp, name);
      if (chartWrapper) chartWrapper.classList.remove('hidden');

      // ★ グラフはここまでで完結

      // ★ AI分析はオプション：有効なときだけ非同期で呼ぶ
      if (TELEAPO_AI_ANALYSIS_ENABLED && typeof requestTeleapoEmployeeAnalysis === 'function') {
        // ここは「投げっぱなし」でOK（awaitしない）
        requestTeleapoEmployeeAnalysis(emp, name);
      }
    };
  });

  // 「全体に戻す」ボタンの処理は既存のまま
  const resetBtn = document.getElementById('teleapoSummaryResetBtn');
  if (resetBtn) {
    resetBtn.onclick = () => {
      teleapoSummaryScope = { type: 'company', name: '全体' };
      document.querySelectorAll('.teleapo-employee-row-active').forEach(r =>
        r.classList.remove('teleapo-employee-row-active')
      );
      filterTeleapoEmployeeTable(null);
      if (teleapoCompanyKPIData) {
        updateTeleapoSummaryRateCards(teleapoCompanyKPIData, null);
      }
      const chartWrapper = document.getElementById('teleapoEmployeeChartWrapper');
      if (chartWrapper) chartWrapper.classList.add('hidden');
    };
  }
}
async function requestTeleapoEmployeeAnalysis(emp, name) {
  const statusEl = document.getElementById('teleapoEmployeeAnalysisStatus');
  const textEl = document.getElementById('teleapoEmployeeAnalysisText');
  if (!statusEl || !textEl) return;

  statusEl.textContent = 'AI分析中...';
  textEl.textContent = '';

  try {
    const payload = {
      employeeName: name,
      period: {
        start: teleapoGlobalStartDate,
        end: teleapoGlobalEndDate
      },
      kpiSummary: {
        dials: emp.dials,
        connects: emp.connects,
        sets: emp.sets,
        shows: emp.shows,
        connectRate: emp.connectRate,
        setRate: emp.setRate,
        showRate: emp.showRate
      }
    };

    const res = await fetch('/api/teleapo/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error('AI analysis API error: ' + res.status);
    }

    const data = await res.json();
    textEl.textContent = data.analysisText || '分析結果を取得できませんでした。';
    statusEl.textContent = '最新の分析結果';
  } catch (err) {
    console.error('AI analysis failed:', err);
    statusEl.textContent = '分析エラー';
    textEl.textContent = 'AI分析の取得に失敗しました（バックエンド未実装の可能性があります）。';
  }
}


function filterTeleapoEmployeeTable(targetName) {
  const rows = document.querySelectorAll('.teleapo-employee-row');
  rows.forEach(row => {
    const name = row.dataset.employeeName;
    if (!targetName) {
      row.style.display = '';
    } else {
      row.style.display = name === targetName ? '' : 'none';
    }
  });
}

// 上部サマリーカード更新（全体 or 社員）
function updateTeleapoSummaryRateCards(data, employeeName = null) {
  const titleEl = document.getElementById('teleapoSummaryTitle');
  const scopeLabelEl = document.getElementById('teleapoSummaryScopeLabel');

  const connectEl = document.getElementById('teleapoSummaryConnectRate');
  const setEl = document.getElementById('teleapoSummarySetRate');
  const showEl = document.getElementById('teleapoSummaryShowRate');

  const connectMetaEl = document.getElementById('teleapoSummaryConnectMeta');
  const setMetaEl = document.getElementById('teleapoSummarySetMeta');
  const showMetaEl = document.getElementById('teleapoSummaryShowMeta');

  const dialsEl = document.getElementById('teleapoSummaryDials');
  const connectsEl = document.getElementById('teleapoSummaryConnects');
  const setsEl = document.getElementById('teleapoSummarySets');
  const showsEl = document.getElementById('teleapoSummaryShows');

  if (!connectEl || !setEl || !showEl) return;

  const isCompany = !employeeName;

  if (titleEl) {
    titleEl.textContent = isCompany
      ? '選択期間の全体KPI（率）'
      : `選択期間の${employeeName}さんのKPI（率）`;
  }

  if (scopeLabelEl) {
    scopeLabelEl.textContent = isCompany ? '全体' : employeeName;
  }

  const connectText = data.connectRate.toFixed(1) + '%';
  const setText = data.setRate.toFixed(1) + '%';
  const showText = data.showRate.toFixed(1) + '%';

  connectEl.textContent = connectText;
  setEl.textContent = setText;
  showEl.textContent = showText;

  const metaText = isCompany ? '選択期間・全社員' : '選択期間・個人';
  if (connectMetaEl) connectMetaEl.textContent = metaText;
  if (setMetaEl) setMetaEl.textContent = metaText;
  if (showMetaEl) showMetaEl.textContent = metaText;

  const fmt = v => (typeof v === 'number' ? v.toLocaleString() : v ?? '-');

  if (dialsEl) dialsEl.textContent = fmt(data.dials);
  if (connectsEl) connectsEl.textContent = fmt(data.connects);
  if (setsEl) setsEl.textContent = fmt(data.sets);
  if (showsEl) showsEl.textContent = fmt(data.shows);
}

// 社員別 時系列グラフ（期間に応じて X 軸粒度を切り替え）
// ・1日          → 時間帯（〜時）
// ・〜7日         → 曜日（〜曜）
// ・〜31日        → 週（1〜5週目）
// ・それ以上      → 月（YYYY/MM）
function renderTeleapoEmployeeTrendChart(emp, name) {
  const svg = document.getElementById('teleapoEmployeeTrendChart');
  const titleEl = document.getElementById('teleapoEmployeeChartTitle');
  if (!svg) return;

  // タイトル
  if (titleEl) {
    titleEl.textContent = `選択期間の ${name} さんのKPI（通電率・設定率・着座率）`;
  }

  // 1. 日別データを取得して期間内に絞る
  const dailyAll = teleapoEmployeeDailyData[name] || [];

  let startDate = teleapoGlobalStartDate
    ? new Date(teleapoGlobalStartDate + 'T00:00:00')
    : null;
  let endDate = teleapoGlobalEndDate
    ? new Date(teleapoGlobalEndDate + 'T23:59:59')
    : null;

  if (!startDate && dailyAll.length) {
    startDate = new Date(dailyAll[0].date + 'T00:00:00');
  }
  if (!endDate && dailyAll.length) {
    endDate = new Date(dailyAll[dailyAll.length - 1].date + 'T23:59:59');
  }

  const daily = dailyAll.filter(row => {
    const d = new Date(row.date + 'T12:00:00');
    return (!startDate || d >= startDate) && (!endDate || d <= endDate);
  });

  if (!daily.length) {
    // データがない場合は全期間の平均レートをフラットに表示
    const flatPoints = Array.from({ length: 5 }).map((_, i) => ({
      label: `${i + 1}`,
      connectRate: emp.connectRate || 0,
      setRate: emp.setRate || 0,
      showRate: emp.showRate || 0
    }));
    drawTeleapoEmployeeRateLines(svg, flatPoints);
    return;
  }

  // 2. 期間の長さ（日数）を算出
  const startMid = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );
  const endMid = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
  );
  const oneDayMs = 24 * 60 * 60 * 1000;
  const inclusiveDays = Math.floor((endMid - startMid) / oneDayMs) + 1;

  let points = [];

  // 3. 粒度ごとに points を生成
  if (inclusiveDays <= 1) {
    // === 1日 → 時間帯（〜時）
    // 日全体のレートを時間帯に均等コピー（形状よりラベリング重視）
    const bucket = { dials: 0, connects: 0, sets: 0, shows: 0 };
    daily.forEach(row => {
      bucket.dials += row.dials;
      bucket.connects += row.connects;
      bucket.sets += row.sets;
      bucket.shows += row.shows;
    });
    const connectRate = bucket.dials > 0 ? (bucket.connects / bucket.dials) * 100 : 0;
    const setRate = bucket.connects > 0 ? (bucket.sets / bucket.connects) * 100 : 0;
    const showRate = bucket.sets > 0 ? (bucket.shows / bucket.sets) * 100 : 0;

    const hourLabels = ['9時', '11時', '13時', '15時', '17時'];
    points = hourLabels.map(label => ({
      label,
      connectRate,
      setRate,
      showRate
    }));
  } else if (inclusiveDays <= 7) {
    // === 〜7日 → 曜日（〜曜）
    const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

    // 日付順にソートして、各日のレートを計算
    const sorted = [...daily].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    points = sorted.map(row => {
      const d = new Date(row.date + 'T00:00:00');
      const label = DAY_LABELS[d.getDay()] + '曜';
      const connectRate = row.dials > 0 ? (row.connects / row.dials) * 100 : 0;
      const setRate = row.connects > 0 ? (row.sets / row.connects) * 100 : 0;
      const showRate = row.sets > 0 ? (row.shows / row.sets) * 100 : 0;
      return { label, connectRate, setRate, showRate };
    });
  } else if (inclusiveDays <= 31) {
    // === 〜31日 → 週ごとの推移（1〜5週目）
    const firstDate = new Date(daily[0].date + 'T00:00:00');
    const lastDate = new Date(daily[daily.length - 1].date + 'T23:59:59');
    const diffMs = lastDate - firstDate;
    const totalDays = Math.max(1, Math.floor(diffMs / oneDayMs) + 1);
    const numWeeks = 5;
    const segmentSize = Math.max(1, Math.ceil(totalDays / numWeeks));

    const weekBuckets = Array.from({ length: numWeeks }).map(() => ({
      dials: 0,
      connects: 0,
      sets: 0,
      shows: 0
    }));

    daily.forEach(row => {
      const d = new Date(row.date + 'T00:00:00');
      const offsetDays = Math.floor((d - firstDate) / oneDayMs);
      const idx = Math.min(numWeeks - 1, Math.floor(offsetDays / segmentSize));
      weekBuckets[idx].dials += row.dials;
      weekBuckets[idx].connects += row.connects;
      weekBuckets[idx].sets += row.sets;
      weekBuckets[idx].shows += row.shows;
    });

    points = weekBuckets.map((w, i) => {
      const connectRate = w.dials > 0 ? (w.connects / w.dials) * 100 : 0;
      const setRate = w.connects > 0 ? (w.sets / w.connects) * 100 : 0;
      const showRate = w.sets > 0 ? (w.shows / w.sets) * 100 : 0;
      return {
        label: `${i + 1}週目`,
        connectRate,
        setRate,
        showRate
      };
    });
  } else {
    // === 31日超 → 月単位（YYYY/MM）
    // 月ごとに集計
    const monthBuckets = {}; // key: 'YYYY-MM' → 集計値

    daily.forEach(row => {
      const d = new Date(row.date + 'T00:00:00');
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!monthBuckets[key]) {
        monthBuckets[key] = { dials: 0, connects: 0, sets: 0, shows: 0 };
      }
      monthBuckets[key].dials += row.dials;
      monthBuckets[key].connects += row.connects;
      monthBuckets[key].sets += row.sets;
      monthBuckets[key].shows += row.shows;
    });

    const sortedKeys = Object.keys(monthBuckets).sort(); // 'YYYY-MM' 昇順

    points = sortedKeys.map(key => {
      const w = monthBuckets[key];
      const connectRate = w.dials > 0 ? (w.connects / w.dials) * 100 : 0;
      const setRate = w.connects > 0 ? (w.sets / w.connects) * 100 : 0;
      const showRate = w.sets > 0 ? (w.shows / w.sets) * 100 : 0;

      // ラベルは YYYY/MM 形式に
      const [y, m] = key.split('-');
      const label = `${y}/${m}`;

      return {
        label,
        connectRate,
        setRate,
        showRate
      };
    });
  }

  // 4. 共通描画関数で3本線を描画
  drawTeleapoEmployeeRateLines(svg, points);
}

// 週次の通電率・設定率・着座率の3本線を描画
// 週次の通電率・設定率・着座率の3本線を描画（points: {label, connectRate, setRate, showRate}[])
function drawTeleapoEmployeeRateLines(svg, points) {
  if (!svg) return;

  // 最大値をざっくり決める（0〜100%が基本）
  let maxRate = 0;
  points.forEach(p => {
    maxRate = Math.max(maxRate, p.connectRate || 0, p.setRate || 0, p.showRate || 0);
  });
  maxRate = Math.max(10, Math.ceil(maxRate / 10) * 10); // 10刻みで切り上げ

  const width = 800;
  const height = 260;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;

  const usableWidth = width - paddingLeft - paddingRight;
  const usableHeight = height - paddingTop - paddingBottom;

  const n = points.length;
  const xStep = n > 1 ? usableWidth / (n - 1) : usableWidth;

  const toX = i => paddingLeft + xStep * i;
  const toY = v => paddingTop + usableHeight * (1 - v / maxRate);

  // 各線のパスを作成
  const connectPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.connectRate || 0)}`)
    .join(' ');
  const setPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.setRate || 0)}`)
    .join(' ');
  const showPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.showRate || 0)}`)
    .join(' ');

  svg.innerHTML = `
    <style>
      .teleapo-axis-label { font-size: 10px; fill: #6b7280; }
      .teleapo-line-connect { fill: none; stroke: #3b82f6; stroke-width: 2; } /* 青：通電率 */
      .teleapo-line-set     { fill: none; stroke: #f59e0b; stroke-width: 2; } /* オレンジ：設定率 */
      .teleapo-line-show    { fill: none; stroke: #10b981; stroke-width: 2; } /* 緑：着座率 */
      .teleapo-dot { stroke: #ffffff; stroke-width: 1.5; }
      .teleapo-grid { stroke: #e5e7eb; stroke-width: 1; }
    </style>
    <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
    ${[0, 0.25, 0.5, 0.75, 1].map(r => {
    const y = paddingTop + usableHeight * r;
    const val = Math.round(maxRate * (1 - r));
    return `
        <line class="teleapo-grid" x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" />
        <text class="teleapo-axis-label" x="${paddingLeft - 8}" y="${y + 3}" text-anchor="end">${val}%</text>
      `;
  }).join('')}
    <!-- 通電率 -->
    <path d="${connectPath}" class="teleapo-line-connect" />
    ${points.map((p, i) => `
      <circle class="teleapo-dot" cx="${toX(i)}" cy="${toY(p.connectRate || 0)}" r="4" fill="#3b82f6" />
    `).join('')}
    <!-- 設定率 -->
    <path d="${setPath}" class="teleapo-line-set" />
    ${points.map((p, i) => `
      <circle class="teleapo-dot" cx="${toX(i)}" cy="${toY(p.setRate || 0)}" r="4" fill="#f59e0b" />
    `).join('')}
    <!-- 着座率 -->
    <path d="${showPath}" class="teleapo-line-show" />
    ${points.map((p, i) => `
      <circle class="teleapo-dot" cx="${toX(i)}" cy="${toY(p.showRate || 0)}" r="4" fill="#10b981" />
    `).join('')}
    <!-- X軸ラベル -->
    ${points.map((p, i) => `
      <text class="teleapo-axis-label" x="${toX(i)}" y="${height - paddingBottom + 16}" text-anchor="middle">
        ${p.label}
      </text>
    `).join('')}
    <!-- 凡例 -->
    <rect x="${paddingLeft}" y="${paddingTop}" width="12" height="12" fill="#3b82f6" />
    <text x="${paddingLeft + 18}" y="${paddingTop + 10}" class="teleapo-axis-label">通電率</text>
    <rect x="${paddingLeft + 90}" y="${paddingTop}" width="12" height="12" fill="#f59e0b" />
    <text x="${paddingLeft + 108}" y="${paddingTop + 10}" class="teleapo-axis-label">設定率</text>
    <rect x="${paddingLeft + 180}" y="${paddingTop}" width="12" height="12" fill="#10b981" />
    <text x="${paddingLeft + 198}" y="${paddingTop + 10}" class="teleapo-axis-label">着座率</text>
  `;
}


// ======== ヒートマップ ========



function teleapoSlotDisplay(slot) {
  switch (slot) {
    case '09-11': return '09-11時';
    case '11-13': return '11-13時';
    case '13-15': return '13-15時';
    case '15-17': return '15-17時';
    case '17-19': return '17-19時';
    default: return slot;
  }
}


// ======== 架電ログ（フィルタ＋件数） ========
function initializeTeleapoLogFilters() {
  const empFilter = document.getElementById('teleapoLogEmployeeFilter');
  const resultFilter = document.getElementById('teleapoLogResultFilter');
  const targetSearch = document.getElementById('teleapoLogTargetSearch');
  const resetBtn = document.getElementById('teleapoLogFilterReset');

  if (empFilter) empFilter.addEventListener('change', filterTeleapoLogRows);
  if (resultFilter) resultFilter.addEventListener('change', filterTeleapoLogRows);
  if (targetSearch) targetSearch.addEventListener('input', filterTeleapoLogRows);
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (empFilter) empFilter.value = '';
    if (resultFilter) resultFilter.value = '';
    if (targetSearch) targetSearch.value = '';
    filterTeleapoLogRows();
  });

  const sortable = document.querySelectorAll('#teleapoLogTable .sortable');
  sortable.forEach(h => h.addEventListener('click', handleTeleapoLogSort));
}

// 架電ログデータの読み込み
// 架電ログデータの読み込み（期間内モックを生成）
// 架電ログデータの読み込み（まずは必ず表示されるモック）
// 架電ログデータの読み込み（まずはモックを必ず表示する）
// 架電ログデータの読み込み（モックを必ず表示）
async function loadTeleapoLogData() {
  const tbody = document.getElementById('teleapoLogTableBody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr');
  updateTeleapoLogCount(rows.length);

  // 初期状態はフィルタなしで全件表示
  rows.forEach(row => row.style.display = '');
}



function updateTeleapoLogCount(count) {
  const el = document.getElementById('teleapoLogFilterCount');
  if (el) el.textContent = `${count}件`;
}

function handleTeleapoLogSort(event) {
  const header = event.currentTarget;
  const sortField = header.dataset.sort;
  const currentDir = header.dataset.direction || 'asc';
  const newDir = currentDir === 'asc' ? 'desc' : 'asc';

  document.querySelectorAll('#teleapoLogTable .sortable').forEach(h => {
    h.dataset.direction = '';
    const ind = h.querySelector('.ml-1');
    if (ind) ind.textContent = '↕';
  });

  header.dataset.direction = newDir;
  const indicator = header.querySelector('.ml-1');
  if (indicator) indicator.textContent = newDir === 'asc' ? '▲' : '▼';

  sortTeleapoLogTable(sortField, newDir);
}

function sortTeleapoLogTable(field, dir) {
  const tbody = document.getElementById('teleapoLogTableBody');
  const rows = Array.from(tbody.querySelectorAll('tr'));

  rows.sort((a, b) => {
    let av, bv;
    if (field === 'datetime') {
      av = a.children[0].textContent;
      bv = b.children[0].textContent;
    } else if (field === 'employee') {
      av = a.children[1].textContent;
      bv = b.children[1].textContent;
    } else if (field === 'target') {
      av = a.children[2].textContent;
      bv = b.children[2].textContent;
    } else if (field === 'result') {
      av = a.children[5].textContent;
      bv = b.children[5].textContent;
    } else {
      return 0;
    }
    const cmp = av.localeCompare(bv, 'ja');
    return dir === 'asc' ? cmp : -cmp;
  });

  tbody.innerHTML = '';
  rows.forEach(r => tbody.appendChild(r));
}

function applyTeleapoLogFilter() {
  filterTeleapoLogRows();
}

// シンプルなログフィルタ（担当者 / 結果 / 相手名 だけ見る）
function filterTeleapoLogRows() {
  const emp = document.getElementById('teleapoLogEmployeeFilter')?.value || '';
  const result = document.getElementById('teleapoLogResultFilter')?.value || '';
  const target = document.getElementById('teleapoLogTargetSearch')?.value || '';

  const rows = document.querySelectorAll('#teleapoLogTableBody tr');
  let visible = 0;

  rows.forEach(row => {
    let show = true;
    const cells = row.children;

    // 担当者
    const empName = cells[1] ? cells[1].textContent.trim() : '';
    if (emp && empName !== emp) {
      show = false;
    }

    // アポ結果（バッジ内テキスト）
    const resultText = cells[5] ? cells[5].textContent.trim() : '';
    if (result && !resultText.includes(result)) {
      show = false;
    }

    // 相手名に含まれるか
    const targetText = cells[2] ? cells[2].textContent.toLowerCase() : '';
    if (target && !targetText.includes(target.toLowerCase())) {
      show = false;
    }

    row.style.display = show ? '' : 'none';
    if (show) {
      visible += 1;
    }
  });

  updateTeleapoLogCount(visible);
}

// ======== クリーンアップ ========
function cleanupTeleapoEventListeners() {
  const ids = [
    'teleapoCompanyRangeStart',
    'teleapoCompanyRangeEnd',
    'teleapoLogRangeStart',
    'teleapoLogRangeEnd',
    'teleapoHeatmapEmployeeFilter',
    'teleapoHeatmapMetricFilter',
    'teleapoLogEmployeeFilter',
    'teleapoLogResultFilter',
    'teleapoLogTargetSearch',
    'teleapoLogFilterReset',
    'teleapoSummaryResetBtn'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentNode) {
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
    }
  });
}
