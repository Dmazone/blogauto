/**
 * yt_upload.mjs — YouTube Studio Playwright 업로드
 * Usage: node scripts/yt_upload.mjs <videoPath> [title] [description]
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION   = path.join(os.homedir(), '.yt-ekaledma-session');
// --schedule=2026-07-28T15:00  (ISO datetime, KST) → YouTube 예약 업로드
const scheduleArg  = process.argv.find(a => a.startsWith('--schedule='));
const SCHEDULE_ISO = scheduleArg ? scheduleArg.replace('--schedule=', '') : null;
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/3_screenshots/upload_${name}.png` });
  console.log(`📸 upload_${name}.png`);
};

async function main() {
  const videoPath = path.resolve(process.argv[2] || '');
  if (!videoPath || !fs.existsSync(videoPath)) {
    console.error('Usage: node yt_upload.mjs <videoPath>');
    process.exit(1);
  }

  // title/description from args or index.md frontmatter
  const slug = path.basename(videoPath, '.mp4');
  let autoTitle = null;
  const indexMd = path.join(__dirname, '..', 'content', 'posts', 'trending-picks', slug, 'index.md');
  if (fs.existsSync(indexMd)) {
    const m = fs.readFileSync(indexMd, 'utf8').match(/^title:\s*"(.+?)"/m);
    if (m) autoTitle = m[1].trim() + ' #Shorts';
  }
  const title = process.argv[3] || autoTitle || `트렌드 상품 추천 TOP3 #Shorts`;
  const description = process.argv[4] || `지금 가장 인기 있는 트렌드 상품을 비교·추천합니다.\n자세한 내용은 트렌드줌 블로그에서 확인하세요.\n\n#Shorts #트렌드 #쿠팡추천`;

  console.log('📤 업로드:', path.basename(videoPath));
  console.log('제목:', title);

  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const p = await ctx.newPage();

  // YouTube Studio — @dmalog 채널 직접 접속
  const CHANNEL_ID = 'UCZA_nUdouXfwAF0vuSG74_w';
  console.log('1️⃣ YouTube Studio 접속 (@dmalog)...');
  await p.goto(`https://studio.youtube.com/channel/${CHANNEL_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(3000);
  await snap(p, '01_studio');

  // 업로드 버튼 클릭 (카메라+ 아이콘)
  console.log('2️⃣ 업로드 버튼 클릭...');
  try {
    await p.locator('#create-icon, [aria-label="만들기"], ytcp-button#create-icon').first().click({ timeout: 8000 });
  } catch {
    await p.evaluate(() => {
      const btn = document.querySelector('#create-icon') ||
                  [...document.querySelectorAll('button, [role="button"]')]
                    .find(b => b.textContent?.includes('만들기') || b.getAttribute('aria-label')?.includes('만들기'));
      if (btn) btn.click();
    });
  }
  await wait(2000);
  await snap(p, '02_create_menu');

  // "동영상 업로드" 메뉴
  console.log('3️⃣ 동영상 업로드 선택...');
  try {
    await p.locator('tp-yt-paper-item, [role="menuitem"]').filter({ hasText: '동영상 업로드' }).first().click({ timeout: 5000 });
  } catch {
    await p.evaluate(() => {
      const items = [...document.querySelectorAll('tp-yt-paper-item, [role="menuitem"], a')];
      const upload = items.find(i => i.textContent?.trim().includes('동영상 업로드') || i.textContent?.trim().includes('Upload video'));
      if (upload) upload.click();
    });
  }
  await wait(3000);
  await snap(p, '03_upload_dialog');

  // 파일 선택 — filechooser 이벤트 방식 (hidden input 직접 접근 불가 대응)
  console.log('4️⃣ 파일 선택...');
  try {
    const [chooser] = await Promise.all([
      p.waitForEvent('filechooser', { timeout: 20000 }),
      p.locator('button:has-text("파일 선택")').first().click({ timeout: 10000 })
        .catch(() => p.evaluate(() => {
          const b = [...document.querySelectorAll('button')]
            .find(b => b.textContent?.trim().includes('파일 선택'));
          if (b) b.click();
        })),
    ]);
    await chooser.setFiles(videoPath);
    console.log('  파일 전송됨 (filechooser)');
  } catch {
    // 폴백: 직접 input 접근
    await p.locator('input[type="file"]').first().setInputFiles(videoPath, { timeout: 20000 });
    console.log('  파일 전송됨 (direct input)');
  }
  console.log('  업로드 대기...');
  await wait(5000);
  await snap(p, '04_uploading');

  // 제목 입력 (업로드 다이얼로그)
  console.log('5️⃣ 제목 입력...');
  // 제목 필드 클리어 후 입력
  try {
    const titleInput = p.locator('#textbox, [aria-label="제목 (필수 항목)"], [aria-label*="제목"]').first();
    await titleInput.click({ timeout: 8000 });
    await p.keyboard.selectAll();
    await p.keyboard.type(title, { delay: 30 });
  } catch {
    await p.evaluate((t) => {
      const inp = document.querySelector('#textbox') ||
                  [...document.querySelectorAll('[contenteditable]')]
                    .find(el => el.getAttribute('aria-label')?.includes('제목'));
      if (inp) { inp.focus(); inp.textContent = t; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    }, title);
  }
  await wait(1000);

  // 설명 입력
  console.log('6️⃣ 설명 입력...');
  try {
    const descInputs = await p.locator('[contenteditable="true"]').all();
    if (descInputs.length > 1) {
      await descInputs[1].click();
      await p.keyboard.type(description, { delay: 20 });
    }
  } catch (e) {
    console.log('  ⚠️ 설명 입력 실패:', e.message);
  }
  await wait(1000);
  await snap(p, '05_details');

  // "시청자가 어린이용 콘텐츠인지" → 아니오
  console.log('7️⃣ 어린이 아님 선택...');
  try {
    await p.locator('[value="VIDEO_MADE_FOR_KIDS_NOT_MFK"], [name="no"]').first().click({ timeout: 5000 });
  } catch {}

  // 다음 버튼 (세 번)
  for (let i = 0; i < 3; i++) {
    try {
      const next = p.locator('ytcp-button#next-button, button:has-text("다음"), button:has-text("Next")').first();
      await next.click({ timeout: 5000 });
      console.log(`  다음 ${i + 1}/3`);
      await wait(2000);
    } catch {
      break;
    }
  }
  await snap(p, '06_review');

  if (SCHEDULE_ISO) {
    // ── 예약 업로드 모드 ────────────────────────────────────────────
    console.log(`8️⃣ 예약 설정: ${SCHEDULE_ISO}`);
    const dt = new Date(SCHEDULE_ISO + ':00+09:00'); // KST
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const HH = String(dt.getHours()).padStart(2, '0');
    const MI = String(dt.getMinutes()).padStart(2, '0');
    const dateStr = `${yy}. ${mm}. ${dd}.`; // YouTube Studio 한국어 형식
    const timeStr = `${HH}:${MI}`;

    // "예약"은 라디오가 아닌 아코디언 섹션 — 클릭해서 확장
    console.log('  예약 섹션 확장 중...');
    let expanded = false;
    try {
      await p.locator('ytcp-publish-at-section').first().click({ timeout: 4000 });
      expanded = true; console.log('  ✅ ytcp-publish-at-section 클릭');
    } catch {}
    if (!expanded) {
      try {
        // 텍스트 "예약"이 포함된 헤더 요소 클릭 (아코디언 헤더)
        await p.evaluate(() => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
          while (walker.nextNode()) {
            const el = walker.currentNode;
            const txt = el.textContent?.trim();
            if (txt === '예약' || txt === 'Schedule') {
              const h = el.offsetHeight;
              if (h > 0 && h < 60) { el.click(); return; }
            }
          }
        });
        expanded = true; console.log('  ✅ 텍스트 기반 클릭');
      } catch {}
    }
    await wait(2000);
    await snap(p, '07a_schedule_expanded');

    // 날짜 입력 — ytcp-date-picker 클릭 후 shadow DOM 내부 input 또는 키보드 타이핑
    let dateOk = false;
    try {
      await p.locator('ytcp-date-picker').first().click({ timeout: 5000 });
      await wait(600);
      // shadow DOM 내부 input 직접 설정
      dateOk = await p.evaluate((dStr) => {
        const el = document.querySelector('ytcp-date-picker');
        const inp = el?.shadowRoot?.querySelector('input') || el?.querySelector('input');
        if (inp) {
          inp.focus(); inp.select();
          inp.value = dStr;
          inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, dateStr);
      if (dateOk) await p.keyboard.press('Tab');
    } catch {}
    // 폴백: 키보드 타이핑
    if (!dateOk) {
      try {
        await p.locator('ytcp-date-picker').first().click({ timeout: 3000 });
        await wait(400);
        await p.keyboard.selectAll();
        await p.keyboard.type(dateStr, { delay: 40 });
        await p.keyboard.press('Tab');
        await wait(500);
        dateOk = true;
      } catch {}
    }
    console.log(dateOk ? `  📅 날짜: ${dateStr}` : '  ⚠️ 날짜 입력 실패');

    // 시간 입력 — ytcp-time-of-day-picker 클릭 후 shadow DOM 또는 키보드
    // YouTube Studio 시간 형식: "오전 HH:MM" / "오후 HH:MM" (24시간 직접 입력도 가능)
    let timeOk = false;
    try {
      await p.locator('ytcp-time-of-day-picker').first().click({ timeout: 5000 });
      await wait(600);
      timeOk = await p.evaluate((tStr) => {
        const el = document.querySelector('ytcp-time-of-day-picker');
        const inp = el?.shadowRoot?.querySelector('input') || el?.querySelector('input');
        if (inp) {
          inp.focus(); inp.select();
          inp.value = tStr;
          inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, timeStr);
      if (timeOk) await p.keyboard.press('Tab');
    } catch {}
    if (!timeOk) {
      try {
        await p.locator('ytcp-time-of-day-picker').first().click({ timeout: 3000 });
        await wait(400);
        await p.keyboard.selectAll();
        await p.keyboard.type(timeStr, { delay: 40 });
        await p.keyboard.press('Tab');
        await wait(500);
        timeOk = true;
      } catch {}
    }
    console.log(timeOk ? `  ⏰ 시간: ${timeStr}` : '  ⚠️ 시간 입력 실패');

    await snap(p, '07_schedule');

    if (!dateOk || !timeOk) {
      // 예약 실패 → 즉시 공개 방지를 위해 비공개 저장
      console.log('  ⚠️ 예약 설정 실패 → 비공개 저장 (YouTube Studio에서 수동 예약 필요)');
      try {
        const radios = await p.locator('tp-yt-paper-radio-button').all();
        for (const r of radios) {
          if ((await r.textContent())?.includes('비공개')) { await r.click(); break; }
        }
      } catch {}
      await p.locator('ytcp-button#done-button').first().click({ timeout: 5000 }).catch(() => {});
      await wait(3000);
      await snap(p, '08_saved_private');
      console.log('\n⚠️ 비공개 저장됨 — YouTube Studio에서 예약 수동 설정 필요');
    } else {
      // "게시 예약" 버튼 클릭
      let schedDone = false;
      try {
        await p.locator('ytcp-button#done-button').first().click({ timeout: 5000 });
        schedDone = true; console.log('  ✅ done-button (게시 예약)');
      } catch {}
      if (!schedDone) {
        const btns = await p.locator('ytcp-button').all();
        for (const btn of btns) {
          const t = await btn.textContent().catch(() => '');
          if (['게시 예약', '예약 설정', 'Schedule'].some(s => t?.trim().includes(s))) {
            await btn.click(); schedDone = true;
            console.log(`  ✅ ${t.trim()}`); break;
          }
        }
      }
      await wait(5000);
      await snap(p, '08_scheduled');
      console.log(`\n✅ 예약 업로드 완료: ${SCHEDULE_ISO} KST 공개 예정`);
    }

  } else {
    // ── 즉시 공개 모드 ──────────────────────────────────────────────
    console.log('8️⃣ 공개 설정...');
    let pubOk = false;
    try {
      const radioItems = await p.locator('tp-yt-paper-radio-button').all();
      for (const radio of radioItems) {
        const txt = await radio.textContent();
        if (txt?.trim() === '공개' || txt?.trim() === 'Public') {
          await radio.click(); pubOk = true;
          console.log('  ✅ 공개 radio 클릭');
          break;
        }
      }
    } catch {}
    if (!pubOk) {
      try {
        await p.locator('ytcp-privacy-dropdown').click({ timeout: 3000 });
        await wait(800);
        const opts = await p.locator('tp-yt-paper-item').all();
        for (const opt of opts) {
          const t = await opt.textContent();
          if (t?.trim() === '공개' || t?.trim() === 'Public') {
            await opt.click(); pubOk = true;
            console.log('  ✅ 드롭다운 공개 선택');
            break;
          }
        }
      } catch {}
    }
    if (!pubOk) {
      await p.evaluate(() => {
        const all = [...document.querySelectorAll('[role="radio"], tp-yt-paper-radio-button')];
        const pub = all.find(el => el.textContent?.trim() === '공개' || el.textContent?.trim() === 'Public');
        if (pub) pub.click();
      });
    }
    await wait(1000);
    await snap(p, '07_public');

    console.log('9️⃣ 게시...');
    let publishOk = false;
    try {
      await p.locator('ytcp-button#done-button').first().click({ timeout: 8000 });
      publishOk = true;
      console.log('  ✅ done-button');
    } catch {}
    if (!publishOk) {
      const btns = await p.locator('ytcp-button').all();
      for (const btn of btns) {
        const t = await btn.textContent();
        if (['게시', '저장', 'Publish', 'Save'].includes(t?.trim())) {
          await btn.click(); publishOk = true;
          console.log('  ✅', t.trim());
          break;
        }
      }
    }
    await wait(5000);
    await snap(p, '08_published');
    console.log('\n✅ 업로드 + 게시 완료!');
  }

  // ── 업로드 완료 후 video ID 추출 — 콘텐츠 목록 최신 항목에서 추출 ──
  await wait(5000);
  let videoId = null;

  // 1차: 업로드 다이얼로그 내 링크에서 추출
  try {
    const href = await p.evaluate(() => {
      const dialog = document.querySelector(
        'ytcp-uploads-still-processing-dialog, ytcp-video-share-dialog, ytcp-uploads-dialog'
      );
      const scope = dialog || document;
      const links = [...scope.querySelectorAll('a[href*="shorts/"], a[href*="watch?v="]')];
      return links.map(l => l.href).find(Boolean) || '';
    });
    const m = href.match(/shorts\/([a-zA-Z0-9_-]{11})|[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) videoId = m[1] || m[2];
  } catch {}

  // 2차: 콘텐츠 목록 페이지 이동 → 날짜 내림차순 최신 항목 ID 추출
  if (!videoId) {
    try {
      await p.goto(
        `https://studio.youtube.com/channel/${CHANNEL_ID}/videos/short?filter=%5B%5D&sort=%7B%22columnType%22%3A%22date%22%2C%22sortOrder%22%3A%22DESCENDING%22%7D`,
        { waitUntil: 'domcontentloaded', timeout: 20000 }
      );
      await wait(4000);
      const editHref = await p.evaluate(() => {
        const links = [...document.querySelectorAll('a[href*="/video/"][href*="/edit"]')];
        return links[0]?.href || '';
      });
      const m = editHref.match(/\/video\/([a-zA-Z0-9_-]{11})\//);
      if (m) videoId = m[1];
    } catch {}
  }

  // 파싱 가능한 포맷으로 출력 (daily_runner.js가 캡처해 댓글 달기에 사용)
  console.log(`VIDEO_ID:${videoId || 'unknown'}`);

  await wait(3000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
