import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

// 빌드 대기 후 접속
await page.goto('https://dmazone.github.io/blogauto/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);

const info = await page.evaluate(() => {
  const h = document.querySelector('.header');
  const cs = window.getComputedStyle(h);
  return {
    position: cs.position,
    top: cs.top,
    zIndex: cs.zIndex,
    bodyPaddingTop: window.getComputedStyle(document.body).paddingTop,
    headerHeight: h.getBoundingClientRect().height,
  };
});
console.log('헤더:', info);

// 스크롤 전
await page.screenshot({ path: 'data/fixed_before.png' });
// 스크롤 후
await page.evaluate(() => window.scrollTo(0, 500));
await page.waitForTimeout(600);
await page.screenshot({ path: 'data/fixed_after.png' });
console.log('스크린샷 완료');

await browser.close();
