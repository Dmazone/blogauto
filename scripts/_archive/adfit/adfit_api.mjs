import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const ctx = await chromium.launchPersistentContext('data/adfit-session', {
  headless: false,
  args: ['--no-first-run'],
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

// 모든 API 응답 캡처
const captured = [];
page.on('response', async (res) => {
  const url = res.url();
  if (url.includes('adfit') && (url.includes('api') || url.includes('unit') || url.includes('media') || url.includes('ad'))) {
    try {
      const json = await res.json();
      const str = JSON.stringify(json);
      if (str.includes('DAN-') || str.includes('adUnitCode') || str.includes('unitCode') || str.includes('unitId')) {
        captured.push({ url, data: json });
        console.log('API 응답 캡처:', url);
        console.log('내용:', str.slice(0, 500));
      }
    } catch {}
  }
});

// 매체 탭 로드 (API 호출 트리거)
await page.goto('https://adfit.kakao.com/adManagement', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// 광고단위 탭으로 이동 (또 다른 API 호출 트리거)
await page.goto('https://adfit.kakao.com/adManagement?type=ADUNIT', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// 네트워크 탭에서 직접 API 호출 시도
const apis = await page.evaluate(async () => {
  // adfit 내부 API 엔드포인트 시도
  const endpoints = [
    '/api/v1/ad-units',
    '/api/v1/medias',
    '/api/ad-unit/list',
    '/api/media/list',
  ];
  const results = [];
  for (const ep of endpoints) {
    try {
      const r = await fetch(`https://adfit.kakao.com${ep}`, { credentials: 'include' });
      if (r.ok) {
        const json = await r.json();
        results.push({ endpoint: ep, data: JSON.stringify(json).slice(0, 500) });
      }
    } catch {}
  }
  return results;
});
console.log('직접 API 호출 결과:', JSON.stringify(apis, null, 2));

// 캡처된 API 응답 저장
console.log('캡처된 응답 수:', captured.length);
writeFileSync('data/adfit_api.json', JSON.stringify({ captured, apis }, null, 2), 'utf8');

// HTML에서 DAN 코드 찾기 (전체 HTML 소스)
const html = await page.content();
const danInHtml = [...html.matchAll(/DAN-[A-Za-z0-9]+/g)].map(m => m[0]);
console.log('HTML에서 DAN 코드:', danInHtml);

// window 객체에서 찾기
const fromWindow = await page.evaluate(() => {
  const str = JSON.stringify(window.__INITIAL_STATE__ || window.__store || window.adfit || {});
  const matches = [...str.matchAll(/DAN-[A-Za-z0-9]+/g)];
  return matches.map(m => m[0]);
});
console.log('window 객체 DAN 코드:', fromWindow);

await page.waitForTimeout(90000);
await ctx.close();
