const puppeteer = require('puppeteer');

const APP_URL = process.argv[2] || 'http://127.0.0.1:8080';
const CANDIDATE_ID = '259152';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  const today = new Date().toISOString().slice(0,10);
  const note = `DEBUG_${Date.now()}`;

  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/candidates/')) {
      const body = req.postData() || '';
      console.log('PUT_REQ_URL', req.url());
      console.log('PUT_REQ_BODY', body.slice(0, 600));
    }
  });
  page.on('response', async (res) => {
    if (res.request().method() === 'PUT' && res.url().includes('/candidates/')) {
      console.log('PUT_RES_STATUS', res.status(), res.url());
      try {
        const txt = await res.text();
        console.log('PUT_RES_BODY', txt.slice(0, 300));
      } catch {}
    }
  });
  page.on('dialog', async (d) => { console.log('DIALOG', d.message()); await d.accept(); });

  await page.goto(APP_URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const session = { user:{id:'56',name:'E2E',email:'e2e@example.com'}, role:'member', roles:['member'], token:'e2e-token', exp:Date.now()+3600_000 };
    localStorage.setItem('dashboard.session.v1', JSON.stringify(session));
  });

  await page.goto(`${APP_URL}/#/candidate-detail?id=${CANDIDATE_ID}`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('button[data-detail-tab="nextAction"]');
  await page.click('button[data-detail-tab="nextAction"]');
  await page.click('button[data-section-edit="nextAction"]');
  await page.waitForSelector('input[data-detail-field="nextActionDate"]');

  const valuesBefore = await page.evaluate(() => {
    const d = document.querySelector('input[data-detail-field="nextActionDate"]');
    const n = document.querySelector('input[data-detail-field="nextActionNote"], textarea[data-detail-field="nextActionNote"]');
    return { d: d?.value || '', n: n?.value || '' };
  });
  console.log('VALUES_BEFORE', valuesBefore);

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

  const valuesAfter = await page.evaluate(() => {
    const d = document.querySelector('input[data-detail-field="nextActionDate"]');
    const n = document.querySelector('input[data-detail-field="nextActionNote"], textarea[data-detail-field="nextActionNote"]');
    return { d: d?.value || '', n: n?.value || '' };
  });
  console.log('VALUES_AFTER', valuesAfter, {today, note});

  await page.click('button[data-section-edit="nextAction"]');
  await sleep(2500);
  await browser.close();
})();
