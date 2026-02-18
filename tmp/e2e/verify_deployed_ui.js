const puppeteer = require('puppeteer');

const APP_URL = 'https://ai-ivory-five-21.vercel.app';
const API_BASE = 'https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod';
const CANDIDATE_ID = '259152';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

(async () => {
  const results = {
    dropdown: { csOptions: 0, advisorOptions: 0, ok: false },
    nextActionSave: { ok: false, date: '', note: '', taskMatched: false },
    mypage: { today: false, upcomingDetail: false, calendar: false, ok: false },
    dialogs: []
  };

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;
  const note = `E2E_UI_${Date.now()}`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  page.on('dialog', async (dialog) => {
    results.dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });

    await page.evaluate(() => {
      const exp = Date.now() + 6 * 60 * 60 * 1000;
      const session = {
        user: { id: '56', name: 'E2E User', email: 'e2e@example.com' },
        role: 'member',
        roles: ['member'],
        token: 'e2e-token',
        exp
      };
      localStorage.setItem('dashboard.session.v1', JSON.stringify(session));
      localStorage.removeItem('dashboard.apiBase');
      localStorage.removeItem('dashboard.mypageApiBase');
    });

    await page.goto(`${APP_URL}/#/candidate-detail?id=${encodeURIComponent(CANDIDATE_ID)}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('button[data-detail-tab="profile"]');
    await page.click('button[data-detail-tab="profile"]');

    await page.waitForSelector('button[data-section-edit="assignees"]');
    await page.click('button[data-section-edit="assignees"]');
    await page.waitForSelector('select[data-detail-field="csUserId"]');
    await page.waitForSelector('select[data-detail-field="advisorUserId"]');

    const dropdown = await page.evaluate(() => {
      const enabledNonEmpty = (sel) => Array.from(sel.options || []).filter((o) => !o.disabled && String(o.value || '').trim() !== '').length;
      const cs = document.querySelector('select[data-detail-field="csUserId"]');
      const advisor = document.querySelector('select[data-detail-field="advisorUserId"]');
      return {
        csOptions: cs ? enabledNonEmpty(cs) : 0,
        advisorOptions: advisor ? enabledNonEmpty(advisor) : 0
      };
    });
    results.dropdown = {
      ...dropdown,
      ok: dropdown.csOptions > 0 && dropdown.advisorOptions > 0
    };

    await page.evaluate(() => {
      const pickFirst = (sel) => {
        if (!sel) return;
        const first = Array.from(sel.options || []).find((o) => !o.disabled && String(o.value || '').trim() !== '');
        if (!first) return;
        sel.value = first.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      };
      pickFirst(document.querySelector('select[data-detail-field="csUserId"]'));
      pickFirst(document.querySelector('select[data-detail-field="advisorUserId"]'));
    });

    await page.click('button[data-section-edit="assignees"]');
    await sleep(1500);

    await page.click('button[data-detail-tab="nextAction"]');
    await page.waitForSelector('button[data-section-edit="nextAction"]');
    await page.click('button[data-section-edit="nextAction"]');
    await page.waitForSelector('input[data-detail-field="nextActionDate"]');
    await page.waitForSelector('input[data-detail-field="nextActionNote"], textarea[data-detail-field="nextActionNote"]');

    await page.$eval('input[data-detail-field="nextActionDate"]', (el, val) => {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, today);

    await page.$eval('input[data-detail-field="nextActionNote"], textarea[data-detail-field="nextActionNote"]', (el, val) => {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, note);

    await page.click('button[data-section-edit="nextAction"]');
    await sleep(4500);

    const saved = await apiGet(`/candidates/${CANDIDATE_ID}?includeMaster=true`);
    const savedDate = String(saved?.nextActionDate || '');
    const savedDateYmd = savedDate ? new Date(savedDate).toISOString().slice(0, 10) : '';
    const tasks = Array.isArray(saved?.tasks) ? saved.tasks : [];
    const taskMatched = tasks.some((t) => String(t?.actionNote || '') === note && String(new Date(t?.actionDate || '').toISOString().slice(0, 10)) === today);

    results.nextActionSave = {
      ok: taskMatched,
      date: savedDateYmd,
      note,
      taskMatched
    };

    const advisorUserId = String(saved?.advisorUserId || '56');
    await page.evaluate((uid) => {
      const raw = localStorage.getItem('dashboard.session.v1');
      const session = raw ? JSON.parse(raw) : {};
      session.user = session.user || {};
      session.user.id = uid;
      session.role = 'member';
      session.roles = ['member'];
      if (!session.token || session.token === 'mock') session.token = 'e2e-token';
      session.exp = Date.now() + 6 * 60 * 60 * 1000;
      localStorage.setItem('dashboard.session.v1', JSON.stringify(session));
    }, advisorUserId);

    await page.goto(`${APP_URL}/#/mypage`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#mypageTasksBody');
    await sleep(1500);

    const mypageFlags = await page.evaluate((cid) => {
      const hasIn = (selector) => {
        const rows = Array.from(document.querySelectorAll(selector));
        return rows.some((row) => String(row.getAttribute('data-candidate-id') || '') === String(cid));
      };
      return {
        today: hasIn('#mypageTasksBody tr[data-candidate-id]'),
        upcomingDetail: hasIn('#mypageUpcomingBody tr[data-candidate-id]')
      };
    }, CANDIDATE_ID);

    await page.click('button[data-upcoming-tab="calendar"]');
    await page.waitForSelector('#mypageCalendarGrid');
    await sleep(1200);

    const calendarHas = await page.evaluate((cid) => Boolean(document.querySelector(`[data-calendar-candidate-id="${cid}"]`)), CANDIDATE_ID);

    results.mypage = {
      today: mypageFlags.today,
      upcomingDetail: mypageFlags.upcomingDetail,
      calendar: calendarHas,
      ok: mypageFlags.today && mypageFlags.upcomingDetail && calendarHas
    };

    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('E2E_ERROR', error && error.stack ? error.stack : String(error));
    console.log(JSON.stringify(results, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
