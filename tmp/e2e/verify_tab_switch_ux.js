const puppeteer = require('puppeteer');

const APP_URL = 'http://127.0.0.1:8080';
const ROUTES = [
  'mypage',
  'yield-personal',
  'yield-company',
  'yield-admin',
  'candidates',
  'referral',
  'ad-performance',
  'teleapo',
  'settings',
  'goal-settings',
  'members',
  'candidates'
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTransitionProbe(page, target) {
  return page.evaluate(async ({ target }) => {
    const app = document.getElementById('app');
    const getOverlay = () => document.getElementById('routeLoadingOverlay');
    const getCssLink = () => document.querySelector('head link[data-page-css], head link[data-page-c-s-s]');
    const getCssPage = (link) => link?.getAttribute('data-page-css') || link?.getAttribute('data-page-c-s-s') || '';
    const anomalies = [];
    const start = performance.now();
    let stopped = false;

    const sample = () => {
      if (stopped) return;
      const overlay = getOverlay();
      const currentPage = app?.dataset?.page || '';
      const cssLink = getCssLink();
      const cssPage = getCssPage(cssLink);
      const cssReady = Boolean(cssLink?.sheet);
      const appHasRendered = Boolean(app && app.children.length > 0);
      const hasInlineLink = Boolean(app?.querySelector('link[rel="stylesheet"]'));
      const overlayVisible = Boolean(overlay && !overlay.hidden);
      const pageNeedsCss = Boolean(currentPage && currentPage !== 'login');
      const cssMismatchWhileVisible = pageNeedsCss && appHasRendered && !overlayVisible && cssPage !== currentPage;
      const cssNotReadyWhileVisible = pageNeedsCss && appHasRendered && !overlayVisible && !cssReady;

      if (cssMismatchWhileVisible || cssNotReadyWhileVisible || hasInlineLink) {
        anomalies.push({
          t: Math.round(performance.now() - start),
          currentPage,
          cssPage,
          cssReady,
          overlayVisible,
          appHasRendered,
          hasInlineLink,
          cssMismatchWhileVisible,
          cssNotReadyWhileVisible
        });
      }

      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);

    const button = document.querySelector(`[data-target="${target}"]`);
    if (button) {
      button.click();
    } else {
      location.hash = `#/${target}`;
    }

    const timeoutMs = 18000;
    let timedOut = false;

    while (performance.now() - start < timeoutMs) {
      const overlay = getOverlay();
      const overlayHidden = !overlay || overlay.hidden;
      if ((app?.dataset?.page || '') === target && overlayHidden) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if ((app?.dataset?.page || '') !== target) {
      timedOut = true;
    }

    stopped = true;

    const finalCssPage = getCssPage(getCssLink());
    const finalOverlay = getOverlay();

    return {
      target,
      timedOut,
      elapsedMs: Math.round(performance.now() - start),
      finalPage: app?.dataset?.page || '',
      finalCssPage,
      overlayVisibleAtEnd: Boolean(finalOverlay && !finalOverlay.hidden),
      inlineStylesheetInApp: Boolean(app?.querySelector('link[rel="stylesheet"]')),
      anomalyCount: anomalies.length,
      anomalies
    };
  }, { target });
}

(async () => {
  const report = {
    url: APP_URL,
    timestamp: new Date().toISOString(),
    pass: false,
    transitions: [],
    pageErrors: [],
    consoleErrors: []
  };

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  page.on('pageerror', (err) => {
    report.pageErrors.push(String(err?.stack || err?.message || err));
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      report.consoleErrors.push(msg.text());
    }
  });

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle2' });

    // Ensure deterministic session
    await page.evaluate(() => {
      const session = {
        user: { id: '1', name: 'UX Test', email: 'ux-test@example.com' },
        role: 'admin',
        roles: ['admin'],
        token: 'mock',
        exp: Date.now() + (6 * 60 * 60 * 1000)
      };
      localStorage.setItem('dashboard.session.v1', JSON.stringify(session));
      localStorage.setItem('dashboard.devAutoLogin', 'true');
      localStorage.setItem('dashboard.mypageApiFallback', 'off');
    });

    await page.goto(`${APP_URL}/#/candidates`, { waitUntil: 'networkidle2' });
    await sleep(500);

    for (const route of ROUTES) {
      const result = await runTransitionProbe(page, route);
      report.transitions.push(result);
      await sleep(200);
    }

    const hasTransitionFailure = report.transitions.some((t) =>
      t.timedOut ||
      t.finalPage !== t.target ||
      t.overlayVisibleAtEnd ||
      t.inlineStylesheetInApp ||
      t.anomalyCount > 0
    );

    report.pass = !hasTransitionFailure;

    console.log(JSON.stringify(report, null, 2));

    if (!report.pass) {
      process.exitCode = 1;
    }
  } catch (error) {
    report.pass = false;
    report.fatal = String(error?.stack || error);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
