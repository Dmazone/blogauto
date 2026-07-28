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
const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/upload_${name}.png` });
  console.log(`📸 upload_${name}.png`);
};

async function main() {
  const videoPath = path.resolve(process.argv[2] || '');
  if (!videoPath || !fs.existsSync(videoPath)) {
    console.error('Usage: node yt_upload.mjs <videoPath>');
    process.exit(1);
  }

  // title/description from args or filename
  const slug = path.basename(videoPath, '.mp4');
  const title = process.argv[3] || `트렌드 상품 추천 TOP3 #Shorts`;
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

  // 파일 선택 input
  console.log('4️⃣ 파일 선택...');
  const fileInput = await p.locator('input[type="file"]').first();
  await fileInput.setInputFiles(videoPath);
  console.log('  파일 전송됨, 업로드 대기...');
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

  // 공개 설정 → 공개
  console.log('8️⃣ 공개 설정...');
  // 공개 라디오 버튼 — YouTube Studio는 paper-radio-button 사용
  let pubOk = false;
  // 방법 1: tp-yt-paper-radio-button 중 "공개" 텍스트
  try {
    const radioItems = await p.locator('tp-yt-paper-radio-button').all();
    for (const radio of radioItems) {
      const txt = await radio.textContent();
      if (txt?.trim() === '공개' || txt?.trim() === 'Public') {
        await radio.click();
        pubOk = true;
        console.log('  ✅ 공개 radio 클릭');
        break;
      }
    }
  } catch {}
  // 방법 2: ytcp-privacy-dropdown 드롭다운
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
  // 방법 3: JS evaluate
  if (!pubOk) {
    await p.evaluate(() => {
      const all = [...document.querySelectorAll('[role="radio"], tp-yt-paper-radio-button, [role="menuitem"]')];
      const pub = all.find(el => el.textContent?.trim() === '공개' || el.textContent?.trim() === 'Public');
      if (pub) pub.click();
    });
  }
  await wait(1000);
  await snap(p, '07_public');

  // 게시 버튼
  console.log('9️⃣ 게시...');
  let publishOk = false;
  try {
    // "게시" 또는 "저장" 버튼
    const doneBtn = p.locator('ytcp-button#done-button').first();
    await doneBtn.click({ timeout: 8000 });
    publishOk = true;
    console.log('  ✅ done-button 클릭');
  } catch {}
  if (!publishOk) {
    try {
      const btns = await p.locator('ytcp-button').all();
      for (const btn of btns) {
        const t = await btn.textContent();
        if (t?.trim() === '게시' || t?.trim() === '저장' || t?.trim() === 'Publish' || t?.trim() === 'Save') {
          await btn.click(); publishOk = true;
          console.log('  ✅', t.trim(), '클릭');
          break;
        }
      }
    } catch {}
  }
  await wait(5000);
  await snap(p, '08_published');

  const finalText = await p.evaluate(() => document.body.innerText);
  if (finalText.includes('게시됨') || finalText.includes('published') || finalText.includes('동영상이')) {
    console.log('\n✅ 업로드 + 게시 완료!');
  } else {
    console.log('\n최종 상태 확인: data/upload_08_published.png');
  }

  await wait(8000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
