const puppeteer = require('puppeteer');

const APP_URL = 'http://127.0.0.1:8080';
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
    dropdown: { ok: false, csOptions: 0, advisorOptions: 0 },
    nextActionSave: { ok: false, note: '', taskMatched: false },
    mypage: { ok: false, today: false, upcomingDetail: false, calendar: false },
    dialogs: []
  };

  const today = new Date().toISOString().slice(0, 10);
  const note = `E2E_LOCAL_${Date.now()}`;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  page.on('dialog', async (d) => { results.dialogs.push(`${d.type()}: ${d.message()}`); await d.accept(); });

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      const session = { user:{id:'56',name:'E2E',email:'e2e@example.com'}, role:'member', roles:['member'], token:'e2e-token', exp:Date.now()+6*3600_000 };
      localStorage.setItem('dashboard.session.v1', JSON.stringify(session));
      localStorage.setItem('dashboard.mypageApiFallback', 'off');
    });

    await page.goto(`${APP_URL}/#/candidate-detail?id=${CANDIDATE_ID}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('button[data-detail-tab="profile"]');
    await page.click('button[data-detail-tab="profile"]');
    await page.click('button[data-section-edit="assignees"]');
    await page.waitForSelector('select[data-detail-field="csUserId"]');

    const d = await page.evaluate(() => {
      const count = (s) => Array.from(s?.options || []).filter((o) => !o.disabled && String(o.value||'').trim() !== '').length;
      const cs = document.querySelector('select[data-detail-field="csUserId"]');
      const ad = document.querySelector('select[data-detail-field="advisorUserId"]');
      return { csOptions: count(cs), advisorOptions: count(ad) };
    });
    results.dropdown = { ...d, ok: d.csOptions > 0 && d.advisorOptions > 0 };

    await page.evaluate(() => {
      const pickFirst = (sel) => {
        if (!sel) return;
        const first = Array.from(sel.options || []).find((o) => !o.disabled && String(o.value||'').trim() !== '');
        if (!first) return;
        sel.value = first.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      };
      pickFirst(document.querySelector('select[data-detail-field="csUserId"]'));
      pickFirst(document.querySelector('select[data-detail-field="advisorUserId"]'));
    });
    await page.click('button[data-section-edit="assignees"]');
    await sleep(1200);

    await page.click('button[data-detail-tab="nextAction"]');
    await page.click('button[data-section-edit="nextAction"]');
    await page.waitForSelector('input[data-detail-field="nextActionDate"]');
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
    const taskMatched = (saved.tasks || []).some((t) => String(t?.actionNote || '') === note && new Date(t?.actionDate || '').toISOString().slice(0, 10) === today);
    results.nextActionSave = { ok: taskMatched, note, taskMatched };

    const advisorUserId = String(saved?.advisorUserId || '56');
    await page.evaluate((uid) => {
      const s = JSON.parse(localStorage.getItem('dashboard.session.v1') || '{}');
      s.user = s.user || {};
      s.user.id = uid;
      s.role = 'member';
      s.roles = ['member'];
      s.token = 'e2e-token';
      s.exp = Date.now() + 6 * 3600_000;
      localStorage.setItem('dashboard.session.v1', JSON.stringify(s));
      localStorage.setItem('dashboard.mypageApiFallback', 'off');
    }, advisorUserId);

    await page.goto(`${APP_URL}/#/mypage`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#mypageTasksBody');
    await sleep(1200);

    const flags = await page.evaluate((cid) => {
      const inSel = (sel) => Array.from(document.querySelectorAll(sel)).some((r) => String(r.getAttribute('data-candidate-id')||'') === String(cid));
      return {
        today: inSel('#mypageTasksBody tr[data-candidate-id]'),
        upcomingDetail: inSel('#mypageUpcomingBody tr[data-candidate-id]')
      };
    }, CANDIDATE_ID);
    await page.click('button[data-upcoming-tab="calendar"]');
    await page.waitForSelector('#mypageCalendarGrid');
    await sleep(1000);
    const cal = await page.evaluate((cid) => Boolean(document.querySelector(`[data-calendar-candidate-id="${cid}"]`)), CANDIDATE_ID);
    results.mypage = { ...flags, calendar: cal, ok: flags.today && flags.upcomingDetail && cal };

    console.log(JSON.stringify(results, null, 2));
  } catch (e) {
    console.error('E2E_ERROR', e.stack || String(e));
    console.log(JSON.stringify(results, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
