// teleapo.js

// ======== グローバル状態 ========
// 日別のモックデータ（本番ではここをAPI/GASで取得）
let teleapoCompanyDailyData = [];          // [{ date: '2024-11-01', dials, connects, sets, shows }, ...]
let teleapoEmployeeDailyData = {};         // { '佐藤': [{date, dials,...}], '田中': [...], ... }
const teleapoEmployees = ['佐藤', '田中', '山本', '鈴木'];

let teleapoEmployeeData = [];
let teleapoCompanyKPIData = null;

let teleapoHeatmapData = {};
let teleapoHeatmapSelection = null;

const TELEAPO_HEATMAP_DAYS = ['月', '火', '水', '木', '金'];
const TELEAPO_HEATMAP_SLOTS = ['09-11', '11-13', '13-15', '15-17', '17-19'];

let teleapoSummaryScope = {
  type: 'company', // 'company' | 'employee'
  name: '全体'
};

let teleapoGlobalStartDate = null; // 'yyyy-mm-dd'
let teleapoGlobalEndDate = null;   // 'yyyy-mm-dd'

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



// ======== ライフサイクル ========
export function mount() {
  console.log('Teleapo page mounted');

  // ★ 日別モックデータを初期化
  initializeTeleapoMockDailyData();

  initializeTeleapoDatePickers();
  initializeTeleapoHeatmapControls();
  initializeTeleapoLogFilters();
  loadTeleapoData();
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
async function loadTeleapoData() {
  try {
    await loadTeleapoCompanyKPIData();
    await loadTeleapoEmployeeData();
    await loadTeleapoHeatmapData();
    await loadTeleapoLogData();
  } catch (e) {
    console.error('Failed to load teleapo data', e);
  }
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

  // テーブル描画（今は着座数降順）
  sortTeleapoEmployees('shows-desc');

  // もし社員スコープなら、その人のKPIで上部カード＆表絞り込み＆グラフ更新
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

function sortTeleapoEmployees(sortValue) {
  if (!teleapoEmployeeData.length) return;
  const [key, dirStr] = sortValue.split('-');
  const dir = dirStr === 'asc' ? 1 : -1;

  teleapoEmployeeData.sort((a, b) => {
    if (key === 'name') {
      return dir * a.name.localeCompare(b.name, 'ja');
    }
    return dir * (a[key] - b[key]);
  });

  updateTeleapoEmployeeDisplay(teleapoEmployeeData);
}

// 社員行クリック時
function attachTeleapoEmployeeRowHandlers() {
  const rows = document.querySelectorAll('.teleapo-employee-row');
  const chartWrapper = document.getElementById('teleapoEmployeeChartWrapper');

  rows.forEach(row => {
    const name = row.dataset.employeeName;
    if (!name) return;

    row.onclick = () => {
      // 同じ社員をもう一度 → 全体に戻す
      if (teleapoSummaryScope.type === 'employee' && teleapoSummaryScope.name === name) {
        teleapoSummaryScope = { type: 'company', name: '全体' };
        document.querySelectorAll('.teleapo-employee-row-active').forEach(r =>
          r.classList.remove('teleapo-employee-row-active')
        );
        filterTeleapoEmployeeTable(null);
        if (teleapoCompanyKPIData) {
          updateTeleapoSummaryRateCards(teleapoCompanyKPIData, null);
        }
        if (chartWrapper) chartWrapper.classList.add('hidden');
        return;
      }

      // 新しく社員を選択
      document.querySelectorAll('.teleapo-employee-row-active').forEach(r =>
        r.classList.remove('teleapo-employee-row-active')
      );
      row.classList.add('teleapo-employee-row-active');

      const emp = teleapoEmployeeData.find(e => e.name === name);
      if (!emp) return;

      teleapoSummaryScope = { type: 'employee', name };
      updateTeleapoSummaryRateCards(emp, name);
      filterTeleapoEmployeeTable(name);
      renderTeleapoEmployeeTrendChart(emp, name);
      if (chartWrapper) chartWrapper.classList.remove('hidden');
    };
  });

  // 「全体に戻す」ボタン
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

// 社員別時系列グラフ（モック）
function renderTeleapoEmployeeTrendChart(emp, name) {
  const svg = document.getElementById('teleapoEmployeeTrendChart');
  const titleEl = document.getElementById('teleapoEmployeeChartTitle');
  if (!svg) return;

  if (titleEl) {
    titleEl.textContent = `選択期間の ${name} さんの時系列KPI（モック）`;
  }

  const points = [
    { label: '1週目', dials: emp.dials * 0.2, shows: emp.shows * 0.2 },
    { label: '2週目', dials: emp.dials * 0.4, shows: emp.shows * 0.4 },
    { label: '3週目', dials: emp.dials * 0.7, shows: emp.shows * 0.7 },
    { label: '4週目', dials: emp.dials * 0.9, shows: emp.shows * 0.9 },
    { label: '5週目', dials: emp.dials, shows: emp.shows }
  ];

  const maxDials = Math.max(...points.map(p => p.dials), 1);
  const maxShows = Math.max(...points.map(p => p.shows), 1);
  const maxY = Math.max(maxDials, maxShows);

  const width = 800;
  const height = 220;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  const usableWidth = width - paddingLeft - paddingRight;
  const usableHeight = height - paddingTop - paddingBottom;

  const xStep = points.length > 1 ? usableWidth / (points.length - 1) : usableWidth;

  const toX = i => paddingLeft + xStep * i;
  const toY = v => paddingTop + usableHeight * (1 - v / maxY);

  const dialsPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.dials)}`)
    .join(' ');
  const showsPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.shows)}`)
    .join(' ');

  svg.innerHTML = `
    <style>
      .teleapo-axis-label { font-size: 10px; fill: #6b7280; }
      .teleapo-line-dials { fill: none; stroke: #4f46e5; stroke-width: 2; }
      .teleapo-line-shows { fill: none; stroke: #10b981; stroke-width: 2; }
      .teleapo-dot { stroke: #ffffff; stroke-width: 1.5; }
      .teleapo-grid { stroke: #e5e7eb; stroke-width: 1; }
    </style>
    <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
    ${[0.25, 0.5, 0.75, 1].map(r => {
    const y = paddingTop + usableHeight * r;
    return `<line class="teleapo-grid" x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" />`;
  }).join('')}
    <path d="${dialsPath}" class="teleapo-line-dials" />
    ${points.map((p, i) => `<circle class="teleapo-dot" cx="${toX(i)}" cy="${toY(p.dials)}" r="4" fill="#4f46e5" />`).join('')}
    <path d="${showsPath}" class="teleapo-line-shows" />
    ${points.map((p, i) => `<circle class="teleapo-dot" cx="${toX(i)}" cy="${toY(p.shows)}" r="4" fill="#10b981" />`).join('')}
    ${points.map((p, i) => `<text class="teleapo-axis-label" x="${toX(i)}" y="${height - paddingBottom + 16}" text-anchor="middle">${p.label}</text>`).join('')}
    <rect x="${paddingLeft}" y="${paddingTop}" width="12" height="12" fill="#4f46e5" />
    <text x="${paddingLeft + 16}" y="${paddingTop + 10}" class="teleapo-axis-label">架電数（擬似推移）</text>
    <rect x="${paddingLeft + 160}" y="${paddingTop}" width="12" height="12" fill="#10b981" />
    <text x="${paddingLeft + 176}" y="${paddingTop + 10}" class="teleapo-axis-label">着座数（擬似推移）</text>
  `;
}

// ======== ヒートマップ ========
function initializeTeleapoHeatmapControls() {
  const empSelect = document.getElementById('teleapoHeatmapEmployeeFilter');
  const metricSelect = document.getElementById('teleapoHeatmapMetricFilter');

  if (empSelect) empSelect.addEventListener('change', renderTeleapoHeatmap);
  if (metricSelect) metricSelect.addEventListener('change', renderTeleapoHeatmap);
}

async function loadTeleapoHeatmapData() {
  // 全体モック
  teleapoHeatmapData = {
    all: {
      dials: {
        '月': { '09-11': 5, '11-13': 8, '13-15': 6, '15-17': 4, '17-19': 3 },
        '火': { '09-11': 4, '11-13': 7, '13-15': 5, '15-17': 6, '17-19': 2 },
        '水': { '09-11': 3, '11-13': 5, '13-15': 7, '15-17': 5, '17-19': 4 },
        '木': { '09-11': 6, '11-13': 9, '13-15': 8, '15-17': 7, '17-19': 3 },
        '金': { '09-11': 2, '11-13': 4, '13-15': 5, '15-17': 6, '17-19': 1 }
      }
    }
  };

  // 簡略化：個人は全体のスケール違いという扱い
  ['佐藤', '田中', '山本', '鈴木'].forEach((name, i) => {
    const base = teleapoHeatmapData.all.dials;
    const scale = 0.5 + i * 0.1;
    teleapoHeatmapData[name] = {
      dials: Object.fromEntries(
        Object.entries(base).map(([day, slots]) => [
          day,
          Object.fromEntries(
            Object.entries(slots).map(([slot, v]) => [slot, Math.max(0, Math.round(v * scale))])
          )
        ])
      )
    };
  });

  // 他指標はダミー
  Object.keys(teleapoHeatmapData).forEach(key => {
    const d = teleapoHeatmapData[key].dials;
    teleapoHeatmapData[key].connects = d;
    teleapoHeatmapData[key].sets = d;
    teleapoHeatmapData[key].shows = d;
  });

  renderTeleapoHeatmap();
  updateTeleapoHeatmapSelectionLabel();
}

function renderTeleapoHeatmap() {
  const empSelect = document.getElementById('teleapoHeatmapEmployeeFilter');
  const metricSelect = document.getElementById('teleapoHeatmapMetricFilter');
  const tbody = document.getElementById('teleapoHeatmapTableBody');
  if (!tbody || !Object.keys(teleapoHeatmapData).length) return;

  const employee = empSelect?.value || 'all';
  const metric = metricSelect?.value || 'dials';

  const empData = teleapoHeatmapData[employee] || teleapoHeatmapData.all;
  const metricData = empData?.[metric] || teleapoHeatmapData.all.dials;

  let maxValue = 0;
  TELEAPO_HEATMAP_DAYS.forEach(day => {
    TELEAPO_HEATMAP_SLOTS.forEach(slot => {
      const v = metricData?.[day]?.[slot] ?? 0;
      if (v > maxValue) maxValue = v;
    });
  });
  if (maxValue === 0) maxValue = 1;

  tbody.innerHTML = '';

  TELEAPO_HEATMAP_SLOTS.forEach(slot => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = teleapoSlotDisplay(slot);
    th.className = 'px-3 py-2 border border-slate-200 text-left bg-slate-50';
    tr.appendChild(th);

    TELEAPO_HEATMAP_DAYS.forEach(day => {
      const td = document.createElement('td');
      td.className = 'px-1 py-1 border border-slate-200 text-center';
      const value = metricData?.[day]?.[slot] ?? 0;
      const intensity = value / maxValue;
      const cell = document.createElement('div');
      cell.className = 'kpi-v2-heatmap-cell';
      cell.dataset.count = String(value);
      cell.textContent = value === 0 ? '-' : String(value);
      if (teleapoHeatmapSelection && teleapoHeatmapSelection.day === day && teleapoHeatmapSelection.slot === slot) {
        cell.classList.add('kpi-v2-heatmap-cell-active');
      }
      const alpha = 0.2 + 0.5 * intensity;
      cell.style.backgroundColor = `rgba(59,130,246,${alpha.toFixed(2)})`;
      cell.onclick = () => handleTeleapoHeatmapCellClick(day, slot);
      td.appendChild(cell);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

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

function handleTeleapoHeatmapCellClick(day, slot) {
  if (teleapoHeatmapSelection && teleapoHeatmapSelection.day === day && teleapoHeatmapSelection.slot === slot) {
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
    labelEl.textContent = `選択中：${teleapoHeatmapSelection.day}曜 ${teleapoSlotDisplay(teleapoHeatmapSelection.slot)} のログを表示中`;
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

async function loadTeleapoLogData() {
  const rows = document.querySelectorAll('#teleapoLogTableBody tr');
  updateTeleapoLogCount(rows.length);
  filterTeleapoLogRows();
}

function filterTeleapoLogRows() {
  const emp = document.getElementById('teleapoLogEmployeeFilter')?.value || '';
  const result = document.getElementById('teleapoLogResultFilter')?.value || '';
  const target = document.getElementById('teleapoLogTargetSearch')?.value || '';

  const startStr = document.getElementById('teleapoLogRangeStart')?.value || '';
  const endStr = document.getElementById('teleapoLogRangeEnd')?.value || '';

  const startDate = startStr ? new Date(startStr + 'T00:00:00') : null;
  const endDate = endStr ? new Date(endStr + 'T23:59:59') : null;

  const rows = document.querySelectorAll('#teleapoLogTableBody tr');
  let visible = 0;
  const jpDays = ['日', '月', '火', '水', '木', '金', '土'];

  rows.forEach(row => {
    let show = true;
    const cells = row.children;
    const datetimeText = cells[0].textContent.trim(); // 2024/11/13 10:30
    const [datePart, timePartRaw] = datetimeText.split(' ');
    const isoDate = datePart.replace(/\//g, '-');
    const timePart = timePartRaw || '12:00';
    const rowDate = new Date(`${isoDate}T${timePart}:00`);

    if (startDate && rowDate < startDate) show = false;
    if (endDate && rowDate > endDate) show = false;

    if (teleapoHeatmapSelection && show) {
      const rowDayJP = jpDays[rowDate.getDay()];
      const hour = rowDate.getHours();
      const [fromStr, toStr] = teleapoHeatmapSelection.slot.split('-');
      const from = parseInt(fromStr, 10);
      const to = parseInt(toStr, 10);
      if (rowDayJP !== teleapoHeatmapSelection.day) show = false;
      if (hour < from || hour >= to) show = false;
    }

    if (emp && cells[1].textContent !== emp) show = false;
    if (result && !cells[5].textContent.includes(result)) show = false;
    if (target && !cells[2].textContent.toLowerCase().includes(target.toLowerCase())) show = false;

    row.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  updateTeleapoLogCount(visible);
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
