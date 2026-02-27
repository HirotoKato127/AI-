import { getSession } from '../../scripts/auth.js';
import { authRepo } from '../../scripts/api/repositories/auth.js';
import { goalSettingsService } from '../../scripts/services/goalSettings.js';
import { mount as mountYield } from '../yield/yield.js?v=20260227_01';
import { mount as mountGoalSettings } from '../goal-settings/goal-settings.js';

const MYPAGE_API_BASE = 'https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod';
const MYPAGE_PATH = '/mypage';
const MYPAGE_FETCH_LIMIT = 50;
const CANDIDATES_PAGE_SIZE = 10;

const IMPORTANT_METRIC_MAP = {
  marketing: [
    { key: 'valid_applications', label: '有効応募数' }
  ],
  cs: [
    { key: 'appointments', label: '設定数' },
    { key: 'sitting', label: '着座数' }
  ],
  sales: [
    { key: 'new_interviews', label: '新規面談数' },
    { key: 'proposals', label: '提案数' },
    { key: 'recommendations', label: '推薦数' },
    { key: 'interviews_scheduled', label: '面談設定数' },
    { key: 'interviews_held', label: '面談実施数' },
    { key: 'offers', label: '内定数' },
    { key: 'accepts', label: '承諾数' }
  ]
};

function mapRoleToDepartment(role) {
  const r = String(role || '').toLowerCase();
  if (!r) return '';
  if (
    r.includes('caller') ||
    r.includes('call') ||
    r.includes('teleapo') ||
    r.includes('cs') ||
    r.includes('support') ||
    r.includes('customer_success')
  ) return 'cs';
  if (
    r.includes('marketer') ||
    r.includes('marketing') ||
    r.includes('market') ||
    r.includes('admin')
  ) return 'marketing';
  if (r.includes('advisor') || r.includes('sales')) return 'sales';
  return '';
}

function resolveUserDepartmentKey(session) {
  const roleCandidates = [
    session?.user?.role,
    session?.user?.department,
    session?.user?.division,
    session?.user?.team,
    session?.user?.jobTitle
  ];
  for (const candidate of roleCandidates) {
    const mapped = mapRoleToDepartment(candidate);
    if (mapped) return mapped;
  }
  return 'sales';
}

function resolveUserNumericId(session) {
  const candidates = [
    session?.user?.advisorUserId,
    session?.user?.advisor_user_id,
    session?.user?.employeeId,
    session?.user?.userId,
    session?.user?.id
  ];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function resolveDepartmentLabel(deptKey) {
  if (deptKey === 'marketing') return 'マーケ';
  if (deptKey === 'cs') return 'CS';
  if (deptKey === 'sales') return '営業';
  return deptKey || '';
}

function resolveImportantMetricLabel(deptKey, metricKey) {
  const list = IMPORTANT_METRIC_MAP[deptKey] || [];
  const matched = list.find(item => item.key === metricKey);
  return matched?.label || metricKey || '-';
}

async function buildImportantMetricNotification(session) {
  if (!session || session?.token === 'mock') return null;
  const deptKey = resolveUserDepartmentKey(session);
  const userId = resolveUserNumericId(session);
  if (!deptKey || !userId) return null;
  try {
    const items = await goalSettingsService.loadImportantMetrics({ departmentKey: deptKey, userId });
    const entry = Array.isArray(items) ? items[0] : null;
    const metricKey = entry?.metricKey ?? entry?.metric_key ?? '';
    if (!metricKey) return null;
    const deptLabel = resolveDepartmentLabel(deptKey);
    const metricLabel = resolveImportantMetricLabel(deptKey, metricKey);
    return {
      date: new Date().toISOString(),
      label: `今月の注目指標（${deptLabel}）：${metricLabel}`
    };
  } catch (error) {
    console.warn('[mypage] failed to load important metric', error);
    return null;
  }
}

const state = {
  roleView: 'advisor',
  closedVisible: false,
  closedCandidates: [],
  candidates: [],
  candidatesPage: 1,
  toggleHandler: null,
  eventHandlers: [],
  calendarMonth: null,
  calendarPending: [],
  calendarCompleted: [],
  calendarProgress: [],
  calendarFilters: {
    showCompleted: false,
    showProgress: false
  }
};

export async function mount() {
  const session = await ensureSession();
  if (!session) {
    renderError('ログイン情報が取得できませんでした。');
    return;
  }

  state.roleView = resolveRoleView(session);
  updateRoleBadge();
  const page = document.getElementById('mypagePage');
  if (page) {
    page.classList.toggle('is-compact', state.roleView !== 'advisor');
  }

  await loadMypageData(session);
  bindActions();
}

export function unmount() {
  const toggle = document.getElementById('mypageCandidatesToggleClosed');
  if (toggle && state.toggleHandler) {
    toggle.removeEventListener('click', state.toggleHandler);
  }
  state.toggleHandler = null;
  state.eventHandlers.forEach(({ element, handler }) => {
    element.removeEventListener('click', handler);
  });
  state.eventHandlers = [];
}

async function ensureSession() {
  const existing = getSession();
  if (existing) return existing;
  try {
    return await authRepo.me();
  } catch {
    return null;
  }
}

function resolveRoleView(session) {
  const rawRole = String(session?.role || session?.roles?.[0] || '').toLowerCase();
  return rawRole.includes('caller') ? 'caller' : 'advisor';
}

function updateRoleBadge() {
  const badge = document.getElementById('mypageRoleBadge');
  if (!badge) return;
  badge.textContent = state.roleView;
  badge.classList.toggle('is-caller', state.roleView === 'caller');
}

async function loadMypageData(session, { monthKey } = {}) {
  const userId = session?.user?.id;
  if (!userId) {
    renderError('ユーザー情報が取得できませんでした。');
    return;
  }

  const resolvedMonthKey = resolveMonthKey(monthKey || state.calendarMonth || getMonthKey(new Date()));
  const url = new URL(`${MYPAGE_API_BASE}${MYPAGE_PATH}`);
  url.searchParams.set('userId', String(userId));
  url.searchParams.set('role', state.roleView);
  url.searchParams.set('limit', String(MYPAGE_FETCH_LIMIT));
  url.searchParams.set('month', resolvedMonthKey);

  const headers = { Accept: 'application/json' };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  if (session?.token === 'mock') {
    console.log('[mypage] Using mock data');
    await new Promise(resolve => setTimeout(resolve, 500));
    const mockData = {
      tasksToday: [],
      tasksUpcoming: [],
      calendar: {
        month: resolvedMonthKey,
        pendingTasks: [],
        completedTasks: [],
        progressEvents: []
      },
      notifications: [
        { date: new Date().toISOString(), label: 'デモ通知', candidateName: 'テスト候補者' }
      ],
      candidates: [],
      closedCandidates: []
    };

    renderTaskTable({
      tasks: mockData.tasksToday,
      sectionId: 'mypageTasksSection',
      bodyId: 'mypageTasksBody',
      emptyId: 'mypageTasksEmpty',
      wrapperId: 'mypageTasksTableWrapper'
    });
    renderTaskTable({
      tasks: mockData.tasksUpcoming,
      sectionId: 'mypageUpcomingSection',
      bodyId: 'mypageUpcomingBody',
      emptyId: 'mypageUpcomingEmpty',
      wrapperId: 'mypageUpcomingTableWrapper'
    });
    state.calendarMonth = mockData.calendar.month;
    state.calendarPending = mockData.calendar.pendingTasks;
    state.calendarCompleted = mockData.calendar.completedTasks;
    state.calendarProgress = mockData.calendar.progressEvents;
    state.candidatesPage = 1;
    renderCalendar();
    const importantNotice = await buildImportantMetricNotification(session);
    const notificationList = importantNotice
      ? [importantNotice, ...mockData.notifications]
      : mockData.notifications;
    renderNotifications(notificationList);
    renderCandidates(mockData.candidates, mockData.closedCandidates);
    return;
  }

  try {
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`mypage HTTP ${res.status}`);
    const data = await res.json();

    renderTaskTable({
      tasks: data.tasksToday || [],
      sectionId: 'mypageTasksSection',
      bodyId: 'mypageTasksBody',
      emptyId: 'mypageTasksEmpty',
      wrapperId: 'mypageTasksTableWrapper'
    });
    renderTaskTable({
      tasks: data.tasksUpcoming || data.tasks || [],
      sectionId: 'mypageUpcomingSection',
      bodyId: 'mypageUpcomingBody',
      emptyId: 'mypageUpcomingEmpty',
      wrapperId: 'mypageUpcomingTableWrapper'
    });
    state.calendarMonth = data.calendar?.month || resolvedMonthKey;
    state.calendarPending = data.calendar?.pendingTasks || [];
    state.calendarCompleted = data.calendar?.completedTasks || [];
    state.calendarProgress = data.calendar?.progressEvents || [];
    state.candidatesPage = 1;
    renderCalendar();
    const importantNotice = await buildImportantMetricNotification(session);
    const baseNotifications = data.notifications || [];
    const notificationList = importantNotice
      ? [importantNotice, ...baseNotifications]
      : baseNotifications;
    renderNotifications(notificationList);
    renderCandidates(data.candidates || [], data.closedCandidates || []);
  } catch (error) {
    console.error('[mypage] failed to load data', error);
    renderError('マイページのデータ取得に失敗しました。');
  }
}

function bindActions() {
  const toggle = document.getElementById('mypageCandidatesToggleClosed');
  if (toggle) {
    state.toggleHandler = () => {
      state.closedVisible = !state.closedVisible;
      state.candidatesPage = 1;
      renderCandidates(state.candidates, state.closedCandidates);
    };
    toggle.addEventListener('click', state.toggleHandler);
  }

  const candidatesPrev = document.getElementById('mypageCandidatesPagePrev');
  if (candidatesPrev) {
    const handler = () => {
      state.candidatesPage = Math.max(1, state.candidatesPage - 1);
      renderCandidates(state.candidates, state.closedCandidates);
    };
    candidatesPrev.addEventListener('click', handler);
    state.eventHandlers.push({ element: candidatesPrev, handler });
  }

  const candidatesNext = document.getElementById('mypageCandidatesPageNext');
  if (candidatesNext) {
    const handler = () => {
      state.candidatesPage += 1;
      renderCandidates(state.candidates, state.closedCandidates);
    };
    candidatesNext.addEventListener('click', handler);
    state.eventHandlers.push({ element: candidatesNext, handler });
  }

  ['mypageTasksBody', 'mypageUpcomingBody', 'mypageCandidatesBody'].forEach((bodyId) => {
    const body = document.getElementById(bodyId);
    if (!body) return;
    const handler = (event) => {
      const row = event.target.closest('tr[data-candidate-id]');
      if (!row) return;
      const candidateId = row.dataset.candidateId;
      if (!candidateId) return;
      navigateToCandidate(candidateId);
    };
    body.addEventListener('click', handler);
    state.eventHandlers.push({ element: body, handler });
  });

  const upcomingSection = document.getElementById('mypageUpcomingSection');
  if (upcomingSection) {
    const handler = (event) => {
      const tab = event.target.closest('[data-upcoming-tab]');
      if (tab) {
        event.preventDefault();
        setUpcomingTab(tab.dataset.upcomingTab || 'detail');
        return;
      }

      const filter = event.target.closest('[data-calendar-filter]');
      if (filter) {
        event.preventDefault();
        toggleCalendarFilter(filter.dataset.calendarFilter || '');
        return;
      }

      const nav = event.target.closest('[data-calendar-nav]');
      if (nav) {
        event.preventDefault();
        const nextMonth = shiftMonth(state.calendarMonth || getMonthKey(new Date()), nav.dataset.calendarNav || 'today');
        loadMypageData(getSession(), { monthKey: nextMonth });
        return;
      }

      const calendarItem = event.target.closest('[data-calendar-candidate-id]');
      if (calendarItem) {
        const candidateId = calendarItem.dataset.calendarCandidateId;
        if (candidateId) navigateToCandidate(candidateId);
      }
    };
    upcomingSection.addEventListener('click', handler);
    state.eventHandlers.push({ element: upcomingSection, handler });
  }
}

function navigateToCandidate(candidateId) {
  if (!candidateId) return;
  window.location.hash = `#/candidate-detail?id=${encodeURIComponent(String(candidateId))}`;
}

function normalizeTaskRows(tasks) {
  const rows = [];
  (tasks || []).forEach((item) => {
    if (Array.isArray(item.tasks)) {
      item.tasks.forEach((action) => {
        rows.push({ ...item, nextAction: action });
      });
      return;
    }
    if (item.nextAction) {
      rows.push(item);
      return;
    }
    if (item.actionDate || item.actionName) {
      rows.push({
        ...item,
        nextAction: { date: item.actionDate, type: item.actionName }
      });
    }
  });
  return rows;
}

function renderTaskTable({ tasks, sectionId, bodyId, emptyId, wrapperId }) {
  const section = document.getElementById(sectionId);
  const body = document.getElementById(bodyId);
  const empty = document.getElementById(emptyId);
  const tableWrapper = document.getElementById(wrapperId);

  if (!section || !body || !empty || !tableWrapper) return;

  if (state.roleView !== 'advisor') {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  const taskRows = normalizeTaskRows(tasks);
  const todayKey = toDateKey(new Date());

  taskRows.sort((a, b) => {
    const aDateKey = toDateKey(a.nextAction?.date) || '';
    const bDateKey = toDateKey(b.nextAction?.date) || '';
    const aIsFuture = aDateKey && todayKey && aDateKey >= todayKey;
    const bIsFuture = bDateKey && todayKey && bDateKey >= todayKey;

    if (aIsFuture !== bIsFuture) return aIsFuture ? -1 : 1;
    if (aDateKey && bDateKey && aDateKey !== bDateKey) {
      return aIsFuture ? (aDateKey < bDateKey ? -1 : 1) : (aDateKey > bDateKey ? -1 : 1);
    }
    return String(a.candidateName || '').localeCompare(String(b.candidateName || ''), 'ja');
  });

  if (!taskRows.length) {
    body.innerHTML = '';
    empty.classList.add('is-visible');
    // tableWrapper.hidden = true; // Removed to keep wrapper style visible for empty message
    return;
  }

  // tableWrapper.hidden = false; // Removed
  empty.classList.remove('is-visible');
  body.innerHTML = taskRows
    .map((row) => {
      const actionDate = row.nextAction?.date ? formatDateJP(row.nextAction.date) : '-';
      const actionDateKey = row.nextAction?.date ? toDateKey(row.nextAction.date) : null;
      const isOverdue = actionDateKey && todayKey && actionDateKey < todayKey;
      const actionName = row.nextAction?.type || row.nextAction?.label || '-';
      return `
        <tr class="mypage-task-row${isOverdue ? ' is-overdue' : ''}" data-candidate-id="${escapeHtml(String(row.candidateId || ''))}">
          <td class="mypage-task-date">${escapeHtml(actionDate)}</td>
          <td>${escapeHtml(actionName)}</td>
          <td>${escapeHtml(row.candidateName || '-')}</td>
          <td><span class="mypage-phase-pill">${escapeHtml(row.phase || '-')}</span></td>
          <td>${escapeHtml(row.partnerName || '-')}</td>
        </tr>
      `;
    })
    .join('');
}

function resolveMonthKey(rawMonth) {
  if (!rawMonth) return getMonthKey(new Date());
  const text = String(rawMonth).trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : getMonthKey(new Date());
}

function getMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function shiftMonth(monthKey, direction) {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    return getMonthKey(new Date());
  }
  const base = new Date(year, monthIndex, 1);
  if (direction === 'prev') base.setMonth(base.getMonth() - 1);
  if (direction === 'next') base.setMonth(base.getMonth() + 1);
  if (direction === 'today') return getMonthKey(new Date());
  return getMonthKey(base);
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  if (!year || !month) return monthKey;
  return `${year}年${Number(month)}月`;
}

function toDateKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.split('T')[0];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setUpcomingTab(tabKey) {
  const tabs = document.querySelectorAll('[data-upcoming-tab]');
  const panels = document.querySelectorAll('[data-upcoming-panel]');
  tabs.forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.upcomingTab === tabKey);
  });
  panels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.upcomingPanel === tabKey);
  });
}

function toggleCalendarFilter(filterKey) {
  if (filterKey === 'pending') {
    state.calendarFilters.showCompleted = false;
    state.calendarFilters.showProgress = false;
  }
  if (filterKey === 'completed') {
    state.calendarFilters.showCompleted = !state.calendarFilters.showCompleted;
  }
  if (filterKey === 'progress') {
    state.calendarFilters.showProgress = !state.calendarFilters.showProgress;
  }
  renderCalendarFilters();
  renderCalendar();
}

function renderCalendarFilters() {
  const pendingButton = document.querySelector('[data-calendar-filter="pending"]');
  const completedButton = document.querySelector('[data-calendar-filter="completed"]');
  const progressButton = document.querySelector('[data-calendar-filter="progress"]');
  if (pendingButton) {
    pendingButton.classList.toggle(
      'is-active',
      !state.calendarFilters.showCompleted && !state.calendarFilters.showProgress
    );
  }
  if (completedButton) {
    completedButton.classList.toggle('is-active', state.calendarFilters.showCompleted);
  }
  if (progressButton) {
    progressButton.classList.toggle('is-active', state.calendarFilters.showProgress);
  }
}

function renderCalendar() {
  const grid = document.getElementById('mypageCalendarGrid');
  const empty = document.getElementById('mypageCalendarEmpty');
  const label = document.getElementById('mypageCalendarMonthLabel');
  if (!grid) return;

  const monthKey = state.calendarMonth || getMonthKey(new Date());
  if (label) label.textContent = formatMonthLabel(monthKey);
  renderCalendarFilters();

  const events = [];
  state.calendarPending.forEach((item) => {
    events.push({ ...item, kind: 'pending' });
  });
  if (state.calendarFilters.showCompleted) {
    state.calendarCompleted.forEach((item) => {
      events.push({ ...item, kind: 'completed' });
    });
  }
  if (state.calendarFilters.showProgress) {
    state.calendarProgress.forEach((item) => {
      events.push({ ...item, kind: 'progress' });
    });
  }

  const eventsByDate = new Map();
  const kindOrder = { pending: 0, completed: 1, progress: 2 };
  events.forEach((event) => {
    const key = toDateKey(event.date);
    if (!key) return;
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key).push(event);
  });

  eventsByDate.forEach((items) => {
    items.sort((a, b) => {
      const order = kindOrder[a.kind] - kindOrder[b.kind];
      if (order !== 0) return order;
      return String(a.candidateName || '').localeCompare(String(b.candidateName || ''), 'ja');
    });
  });

  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, monthIndex, 1 - startOffset);
  const todayKey = toDateKey(new Date());
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  const cells = weekdays.map((labelText) => `<div class="mypage-calendar-weekday">${labelText}</div>`);

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const key = toDateKey(date);
    const isOutside = date.getMonth() !== monthIndex;
    const isToday = key === todayKey;
    const dayNumber = date.getDate();
    const eventsForDay = key ? (eventsByDate.get(key) || []) : [];
    const visible = eventsForDay.slice(0, 3);
    const overflow = eventsForDay.length - visible.length;
    const eventsHtml = visible
      .map((event) => {
        const labelText = event.kind === 'progress'
          ? `進捗: ${event.type || ''}`.trim()
          : event.type || '次回アクション';
        return `
          <button type="button" class="mypage-calendar-item is-${event.kind}" data-calendar-candidate-id="${escapeHtml(String(event.candidateId || ''))}" title="${escapeHtml(`${event.candidateName || '-'} / ${labelText}`)}">
            <span class="mypage-calendar-item-title">${escapeHtml(event.candidateName || '-')}</span>
            <span class="mypage-calendar-item-meta">${escapeHtml(labelText)}</span>
          </button>
        `;
      })
      .join('');
    const overflowHtml = overflow > 0
      ? `<div class="mypage-calendar-more">+${overflow}件</div>`
      : '';

    cells.push(`
      <div class="mypage-calendar-day${isOutside ? ' is-outside' : ''}${isToday ? ' is-today' : ''}">
        <div class="mypage-calendar-day-number">${dayNumber}</div>
        <div class="mypage-calendar-events">
          ${eventsHtml}
          ${overflowHtml}
        </div>
      </div>
    `);
  }

  grid.innerHTML = cells.join('');
  if (empty) {
    empty.classList.toggle('is-visible', events.length === 0);
  }
}

function renderNotifications(notifications) {
  const list = document.getElementById('mypageNotificationsList');
  const empty = document.getElementById('mypageNotificationsEmpty');
  if (!list || !empty) return;

  if (!notifications.length) {
    list.innerHTML = '';
    empty.classList.add('is-visible');
    return;
  }

  empty.classList.remove('is-visible');
  list.innerHTML = notifications
    .map((note) => {
      const date = formatDateJP(note.date);
      const name = note.candidateName ? ` - ${note.candidateName}` : '';
      return `
        <li class="mypage-list-item">
          <span>${escapeHtml(note.label || '更新')}${escapeHtml(name)}</span>
          <span class="mypage-list-meta">${escapeHtml(date)}</span>
        </li>
      `;
    })
    .join('');
}

function renderCandidates(candidates, closedCandidates) {
  const head = document.getElementById('mypageCandidatesHead');
  const body = document.getElementById('mypageCandidatesBody');
  const empty = document.getElementById('mypageCandidatesEmpty');
  const subtitle = document.getElementById('mypageCandidatesSubtitle');
  const toggle = document.getElementById('mypageCandidatesToggleClosed');
  const pagination = document.getElementById('mypageCandidatesPagination');
  const pageInfo = document.getElementById('mypageCandidatesPageInfo');
  const pagePrev = document.getElementById('mypageCandidatesPagePrev');
  const pageNext = document.getElementById('mypageCandidatesPageNext');

  if (!head || !body || !empty || !subtitle || !toggle || !pagination || !pageInfo || !pagePrev || !pageNext) return;

  state.candidates = candidates;
  state.closedCandidates = closedCandidates;

  const isAdvisor = state.roleView === 'advisor';

  subtitle.textContent = isAdvisor
    ? '担当CSが自分の候補者（クローズは非表示）'
    : '担当パートナーが自分で、通電前の候補者';

  if (isAdvisor) {
    toggle.hidden = false;
    toggle.disabled = closedCandidates.length === 0;
    toggle.textContent = state.closedVisible
      ? `クローズを非表示 (${closedCandidates.length})`
      : `クローズを表示 (${closedCandidates.length})`;
  } else {
    toggle.hidden = false;
    toggle.disabled = true;
    toggle.textContent = 'クローズを表示 (0)';
  }

  head.innerHTML = isAdvisor
    ? `
      <tr>
        <th>求職者名</th>
        <th>フェーズ</th>
        <th>前回アクション</th>
        <th>次回アクション</th>
      </tr>
    `
    : `
      <tr>
        <th>求職者名</th>
        <th>前回アクション</th>
      </tr>
    `;

  const visibleCandidates = state.closedVisible && isAdvisor
    ? candidates.concat(closedCandidates)
    : candidates;

  const totalCount = visibleCandidates.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / CANDIDATES_PAGE_SIZE));
  state.candidatesPage = Math.min(Math.max(1, state.candidatesPage), totalPages);
  const startIndex = (state.candidatesPage - 1) * CANDIDATES_PAGE_SIZE;
  const endIndex = Math.min(startIndex + CANDIDATES_PAGE_SIZE, totalCount);
  const pageCandidates = visibleCandidates.slice(startIndex, endIndex);

  pagination.hidden = totalCount <= CANDIDATES_PAGE_SIZE;
  pagePrev.disabled = state.candidatesPage <= 1;
  pageNext.disabled = state.candidatesPage >= totalPages;
  pageInfo.textContent = totalCount === 0
    ? '0件'
    : `${startIndex + 1}-${endIndex} / ${totalCount}件`;

  if (!pageCandidates.length) {
    body.innerHTML = '';
    empty.classList.add('is-visible');
    pagination.hidden = true;
    return;
  }

  empty.classList.remove('is-visible');
  body.innerHTML = pageCandidates
    .map((candidate) => {
      const name = escapeHtml(candidate.candidateName || '-');
      const phaseLabel = escapeHtml(candidate.phase || '-');
      const phaseClass = candidate.phase ? '' : ' is-muted';
      if (isAdvisor) {
        return `
          <tr class="mypage-candidate-row" data-candidate-id="${escapeHtml(String(candidate.candidateId || ''))}">
            <td>
              <div class="mypage-candidate-name">${name}</div>
            </td>
            <td>
              <span class="mypage-phase-pill${phaseClass}">${phaseLabel}</span>
            </td>
            <td>${formatActionCell(candidate.lastAction)}</td>
            <td>${formatActionCell(candidate.nextAction)}</td>
          </tr>
        `;
      }
      return `
        <tr class="mypage-candidate-row" data-candidate-id="${escapeHtml(String(candidate.candidateId || ''))}">
          <td>
            <div class="mypage-candidate-name">${name}</div>
          </td>
          <td>${formatActionCell(candidate.lastAction)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderError(message) {
  const tasksEmpty = document.getElementById('mypageTasksEmpty');
  const upcomingEmpty = document.getElementById('mypageUpcomingEmpty');
  const calendarEmpty = document.getElementById('mypageCalendarEmpty');
  const notificationsEmpty = document.getElementById('mypageNotificationsEmpty');
  const candidatesEmpty = document.getElementById('mypageCandidatesEmpty');
  [tasksEmpty, upcomingEmpty, calendarEmpty, notificationsEmpty, candidatesEmpty].forEach((el) => {
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-visible');
  });
}

function formatDateJP(dateKey) {
  if (!dateKey) return '-';
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}


function formatActionCell(action) {
  if (!action?.date) {
    return '<span class="mypage-action-empty">-</span>';
  }
  const date = escapeHtml(formatDateJP(action.date));
  const label = action.type ? escapeHtml(action.type) : '';
  return `
    <div class="mypage-action">
      <span class="mypage-action-date">${date}</span>
      ${label ? `<span class="mypage-action-label">${label}</span>` : ''}
    </div>
  `;
}

function formatAction(action) {
  if (!action?.date) return '-';
  const date = escapeHtml(formatDateJP(action.date));
  const label = action.type ? ` (${escapeHtml(action.type)})` : '';
  return `${date}${label}`;
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
