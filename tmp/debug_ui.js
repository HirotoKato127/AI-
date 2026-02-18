const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[pageerror]', err.message));
  page.on('requestfailed', req => console.log('[reqfailed]', req.url(), req.failure()?.errorText));

  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('dashboard.session.v1', JSON.stringify({
      user: { id: '55', name: 'E2E User', email: 'e2e@example.com' },
      role: 'advisor',
      roles: ['advisor'],
      token: 'mock',
      exp: Date.now() + 24 * 60 * 60 * 1000
    }));
    localStorage.setItem('dashboard.apiBase', 'https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod');
    localStorage.setItem('dashboard.mypageApiBase', 'https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod');
  });

  await page.goto('http://localhost:8080/#/mypage', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 5000));
  const info = await page.evaluate(() => ({
    href: location.href,
    hash: location.hash,
    title: document.title,
    bodySnippet: document.body.innerText.slice(0, 500),
    hasMypage: !!document.getElementById('mypagePage'),
    hasLogin: !!document.getElementById('loginForm'),
    rootHtml: document.getElementById('app')?.innerHTML?.slice(0, 500) || ''
  }));
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
