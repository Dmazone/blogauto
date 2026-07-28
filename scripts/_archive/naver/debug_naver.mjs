// 클립보드 HTML 붙여넣기 실제 동작 확인
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');
const SS = path.join(DATA, 'debug-screenshots');
fs.mkdirSync(SS, { recursive: true });

const context = await chromium.launchPersistentContext(
  path.join(DATA, 'naver-profile'),
  { headless: false, viewport: { width: 1280, height: 900 }, args: ['--disable-blink-features=AutomationControlled'] }
);
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
await context.addCookies(JSON.parse(fs.readFileSync(path.join(DATA, 'naver-cookies.json'), 'utf-8')));

const postReqs = [];
page.on('request', req => {
  if (req.method() === 'POST') {
    const n = req.url().split('/').pop().split('?')[0];
    if (['RabbitWrite.naver','RabbitAutoSaveWrite.naver','RabbitAutoSaveDelete.naver'].includes(n)) {
      postReqs.push(n);
    }
  }
});

await page.goto('https://blog.naver.com/PostWriteForm.naver?blogId=myubel', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const cancel = await page.$('.se-popup-button-cancel');
if (cancel) { await cancel.click(); await page.waitForTimeout(800); }

// 기존 내용 지우기
const coords = await page.evaluate(() => {
  const b = document.querySelector('.se-main-container .se-section:not(.se-section-documentTitle)');
  const r = b?.getBoundingClientRect();
  return { bx: r ? Math.round(r.x + r.width/2) : 450, by: r ? Math.round(r.y + 30) : 400 };
});
await page.mouse.click(coords.bx, coords.by);
await page.keyboard.press('Control+a');
await page.keyboard.press('Backspace');

// 제목 입력
const titleCoords = await page.evaluate(() => {
  const t = document.querySelector('.se-title-text');
  const r = t?.getBoundingClientRect();
  return { tx: r ? Math.round(r.x + r.width/3) : 315, ty: r ? Math.round(r.y + r.height/2) : 248 };
});
await page.mouse.click(titleCoords.tx, titleCoords.ty);
await page.waitForTimeout(300);
await page.keyboard.type('클립보드 HTML 테스트');
await page.waitForTimeout(300);

// 간단한 HTML 설정
const simpleHtml = `<h2>첫 번째 소제목</h2><p>첫 번째 단락 내용입니다. 내용이 잘 들어가는지 확인합니다.</p><h2>두 번째 소제목</h2><p>두 번째 단락 내용입니다.</p>`;

const clipResult = await page.evaluate(async (html) => {
  try {
    const hb = new Blob([html], { type: 'text/html' });
    const tb = new Blob([html.replace(/<[^>]+>/g,' ')], { type: 'text/plain' });
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': hb, 'text/plain': tb })]);
    // 실제로 읽혀지는지 확인
    const items = await navigator.clipboard.read();
    const types = items[0]?.types ?? [];
    return `OK, clipboard types: ${types.join(',')}`;
  } catch (e) { return `FAIL: ${e.message}`; }
}, simpleHtml);
console.log('클립보드:', clipResult);

// 본문 클릭 후 붙여넣기
await page.mouse.click(coords.bx, coords.by + 40);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(SS, '01-before-paste.png') });
await page.keyboard.press('Control+v');
await page.waitForTimeout(3000);  // 3초 대기
await page.screenshot({ path: path.join(SS, '02-after-paste.png') });

// SE3 내부 상태 확인
const state = await page.evaluate(() => {
  const sections = Array.from(document.querySelectorAll('.se-main-container .se-section'));
  return sections.map(s => ({
    cls: s.className.slice(0, 60),
    empty: s.classList.contains('se-is-empty'),
    text: s.innerText?.slice(0, 100),
    children: s.querySelectorAll('.__se-node').length,
  }));
});
console.log('\nSE3 섹션 상태:');
state.forEach(s => console.log(JSON.stringify(s)));

await context.close();
