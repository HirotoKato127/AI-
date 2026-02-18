const fs = require('fs');
const puppeteer = require('puppeteer');

(async () => {
  const note = process.env.NOTE;
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  await page.evaluateOnNewDocument(() => {
    const session = {
      user: { id: '55', name: 'E2E User', email: 'e2e@example.com' },
      role: 'advisor',
      roles: ['advisor'],
      token: 'mock',
      exp: Date.now() + 24 * 60 * 60 * 1000
    };
    localStorage.setItem('dashboard.session.v1', JSON.stringify(session));
    localStorage.setItem('dashboard.apiBase', 'https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod');
    localStorage.setItem('dashboard.mypageApiBase', 'https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com/prod');
  });

  await page.goto('http://localhost:8080/#/mypage', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#mypageTasksBody', { timeout: 120000 });
  await page.waitForSelector('#mypageUpcomingBody', { timeout: 120000 });
  await page.waitForSelector('#mypageCalendarGrid .mypage-calendar-item', { timeout: 120000 });

  const result = await page.evaluate((noteText) => {
    const todayRows = Array.from(document.querySelectorAll('#mypageTasksBody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim())
    );

    const upcomingRows = Array.from(document.querySelectorAll('#mypageUpcomingBody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim())
    );

    const calendarItems = Array.from(document.querySelectorAll('#mypageCalendarGrid .mypage-calendar-item')).map((el) => {
      const title = (el.querySelector('.mypage-calendar-item-title')?.textContent || '').trim();
      const meta = (el.querySelector('.mypage-calendar-item-meta')?.textContent || '').trim();
      return { title, meta };
    });

    const todayMatch = todayRows.find((cols) => cols.some((c) => c.includes(noteText)));
    const upcomingMatch = upcomingRows.find((cols) => cols.some((c) => c.includes(noteText)));
    const calendarMatch = calendarItems.find((item) => item.meta.includes(noteText));

    return {
      todayRowsCount: todayRows.length,
      upcomingRowsCount: upcomingRows.length,
      calendarItemsCount: calendarItems.length,
      todayMatch: todayMatch || null,
      upcomingMatch: upcomingMatch || null,
      calendarMatch: calendarMatch || null,
    };
  }, note);

  fs.writeFileSync('/tmp/mypage_ui_result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
