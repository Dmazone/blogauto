/**
 * yt_publish_video.mjs — 특정 영상 ID를 공개 게시
 * Usage: node yt_publish_video.mjs <videoId>
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const CHANNEL_ID = 'UCZA_nUdouXfwAF0vuSG74_w'; // @dmalog (DMAZON)
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/pv_${name}.png` });
  console.log(`📸 pv_${name}.png`);
};

async function clickNext(p) {
  try {
    await p.locator('ytcp-button#next-button').first().click({ timeout: 4000 });
    console.log('  다음 ✅');
    await wait(2000);
    return true;
  } catch {
    // 텍스트로 찾기
    try {
      const btns = await p.locator('ytcp-button').all();
      for (const btn of btns) {
        const t = await btn.textContent();
        if (t?.trim() === '다음' || t?.trim() === 'Next') {
          await btn.click();
          console.log('  다음(텍스트) ✅');
          await wait(2000);
          return true;
        }
      }
    } catch {}
    return false;
  }
}

async function main() {
  const videoId = process.argv[2] || 'FEByDK1VYuk';
  console.log('🎬 영상 ID:', videoId);

  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  // 초안 편집 URL로 바로 접근
  const draftUrl = `https://studio.youtube.com/channel/${CHANNEL_ID}/videos/short?d=ud&filter=%5B%5D&sort=%7B%22columnType%22%3A%22date%22%2C%22sortOrder%22%3A%22DESCENDING%22%7D&udvid=${videoId}`;
  console.log('1️⃣ 초안 편집 열기...');
  await p.goto(draftUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(5000);
  await snap(p, '01_draft');

  // 다이얼로그가 열렸는지 확인
  const dialogOpen = await p.evaluate(() => {
    return !!document.querySelector('ytcp-uploads-dialog, ytcp-video-upload-dialog, [id*="dialog"]');
  });
  console.log('다이얼로그:', dialogOpen);

  // 다음 버튼 3번 클릭 (세부정보 → 동영상요소 → 검토 → 공개상태)
  console.log('2️⃣ 단계 이동 (다음 × 3)...');
  for (let i = 0; i < 3; i++) {
    const ok = await clickNext(p);
    if (!ok) console.log(`  다음 ${i+1} 실패`);
  }
  await snap(p, '02_public_step');

  // 공개 라디오 버튼 선택
  console.log('3️⃣ 공개 선택...');
  let pubOk = false;

  // tp-yt-paper-radio-button 중 "공개"
  try {
    const radios = await p.locator('tp-yt-paper-radio-button').all();
    for (const radio of radios) {
      const t = await radio.textContent();
      if (t?.trim() === '공개' || t?.trim() === 'Public') {
        await radio.click();
        pubOk = true;
        console.log('  ✅ 공개 radio');
        break;
      }
    }
  } catch {}

  // ytcp-privacy-dropdown 시도
  if (!pubOk) {
    try {
      await p.locator('ytcp-privacy-dropdown').first().click({ timeout: 3000 });
      await wait(800);
      const items = await p.locator('tp-yt-paper-item').all();
      for (const item of items) {
        const t = await item.textContent();
        if (t?.trim() === '공개' || t?.trim() === 'Public') {
          await item.click();
          pubOk = true;
          console.log('  ✅ 드롭다운 공개');
          break;
        }
      }
    } catch {}
  }

  // JS fallback
  if (!pubOk) {
    await p.evaluate(() => {
      const all = [
        ...document.querySelectorAll('tp-yt-paper-radio-button'),
        ...document.querySelectorAll('[role="radio"]'),
      ];
      for (const el of all) {
        if (el.textContent?.trim() === '공개' || el.textContent?.trim() === 'Public') {
          el.click(); break;
        }
      }
    });
  }
  await wait(1000);
  await snap(p, '03_public_selected');

  // 게시/저장 버튼
  console.log('4️⃣ 게시...');
  let published = false;
  try {
    await p.locator('ytcp-button#done-button').first().click({ timeout: 5000 });
    published = true;
    console.log('  ✅ done-button');
  } catch {}

  if (!published) {
    const btns = await p.locator('ytcp-button').all();
    for (const btn of btns) {
      const t = await btn.textContent();
      if (t?.trim() === '게시' || t?.trim() === '저장' || t?.trim() === 'Publish' || t?.trim() === 'Save') {
        await btn.click();
        published = true;
        console.log('  ✅', t.trim());
        break;
      }
    }
  }

  await wait(5000);
  await snap(p, '04_result');

  const txt = await p.evaluate(() => document.body.innerText);
  if (txt.includes('게시됨') || txt.includes('공개') || !txt.includes('초안')) {
    console.log('\n🎉 공개 게시 완료!');
    console.log('URL: https://youtube.com/shorts/' + videoId);
  } else if (published) {
    console.log('\n✅ 게시 버튼 클릭됨 — YouTube 처리 중');
    console.log('URL: https://youtube.com/shorts/' + videoId);
  } else {
    console.log('\n→ data/pv_*.png 확인 필요');
  }

  await wait(8000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
