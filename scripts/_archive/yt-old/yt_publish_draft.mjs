/**
 * yt_publish_draft.mjs — 비공개 저장된 최신 동영상을 공개로 전환
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/pub_${name}.png` });
  console.log(`📸 pub_${name}.png`);
};

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  console.log('1️⃣ 콘텐츠 목록...');
  await p.goto('https://studio.youtube.com/channel/UC/videos/upload?filter=[]&sort={"columnType":"date","sortOrder":"DESCENDING"}',
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(2000);

  // 콘텐츠 페이지로 이동
  await p.goto('https://studio.youtube.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(2000);
  await p.goto('https://studio.youtube.com/videos/upload', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(2000);

  // 실제 콘텐츠 목록
  await p.goto('https://studio.youtube.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(1000);

  try {
    await p.locator('#menu-paper-icon-item-1, a[href*="/videos"]').first().click({ timeout: 5000 });
  } catch {
    await p.evaluate(() => {
      const links = [...document.querySelectorAll('a')];
      const content = links.find(l => l.href?.includes('/videos') || l.textContent?.includes('콘텐츠'));
      if (content) content.click();
    });
  }
  await wait(3000);
  await snap(p, '01_content_list');

  // 최신 비공개 영상 찾기
  console.log('2️⃣ 비공개 영상 편집...');
  const editClicked = await p.evaluate(() => {
    // 비공개 아이콘이나 텍스트 근처의 편집 버튼 찾기
    const rows = [...document.querySelectorAll('ytcp-video-row, tr, [class*="video-list-item"]')];
    for (const row of rows) {
      const text = row.textContent || '';
      if (text.includes('무선') || text.includes('에어') || text.includes('비공개') || text.includes('서큘레이터')) {
        const editBtn = row.querySelector('a[href*="edit"], button[aria-label*="편집"], ytcp-icon-button');
        if (editBtn) { editBtn.click(); return row.textContent.slice(0, 80); }
      }
    }
    // 첫 번째 비공개 영상
    const privacyIcons = [...document.querySelectorAll('ytcp-privacy-dropdown, [class*="privacy"]')];
    if (privacyIcons.length) {
      const row = privacyIcons[0].closest('tr, ytcp-video-row, [class*="video"]');
      if (row) {
        const editBtn = row.querySelector('a[href*="edit"]') || row.querySelector('ytcp-icon-button');
        if (editBtn) { editBtn.click(); return 'first-row'; }
      }
    }
    return null;
  });
  console.log('  편집:', editClicked);
  await wait(3000);
  await snap(p, '02_edit_page');

  // 편집 페이지에서 공개 설정 변경
  console.log('3️⃣ 공개 설정 변경...');

  // 가시성(공개상태) 메뉴 찾기
  const visibilityClicked = await p.evaluate(() => {
    // 드롭다운이나 라디오 버튼
    const selectors = [
      'ytcp-privacy-dropdown',
      '[aria-label*="공개 상태"]',
      '[aria-label*="가시성"]',
      'select[name*="privacy"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { el.click(); return sel; }
    }
    // "비공개" 텍스트가 있는 버튼/드롭다운
    const btns = [...document.querySelectorAll('button, [role="button"], ytcp-button')];
    const priv = btns.find(b => b.textContent?.includes('비공개'));
    if (priv) { priv.click(); return 'found-private-btn'; }
    return null;
  });
  console.log('  가시성 클릭:', visibilityClicked);
  await wait(1500);
  await snap(p, '03_visibility_menu');

  // 공개 선택
  const publicSelected = await p.evaluate(() => {
    const options = [...document.querySelectorAll('[role="option"], tp-yt-paper-item, ytcp-ve, li')];
    const pub = options.find(o => {
      const t = o.textContent?.trim();
      return t === '공개' || t === 'Public';
    });
    if (pub) { pub.click(); return pub.textContent?.trim(); }
    // 라디오 버튼
    const radios = [...document.querySelectorAll('[role="radio"], input[type="radio"]')];
    const pubRadio = radios.find(r =>
      r.getAttribute('value') === 'PUBLIC' ||
      r.closest('label')?.textContent?.includes('공개')
    );
    if (pubRadio) { pubRadio.click(); return 'radio-public'; }
    return null;
  });
  console.log('  공개 선택:', publicSelected);
  await wait(1000);
  await snap(p, '04_public_selected');

  // 저장/게시
  console.log('4️⃣ 저장/게시...');
  const saved = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button, ytcp-button')];
    const saveBtn = btns.find(b => {
      const t = b.textContent?.trim();
      return t === '저장' || t === '게시' || t === 'Save' || t === 'Publish';
    });
    if (saveBtn) { saveBtn.click(); return saveBtn.textContent?.trim(); }
    return null;
  });
  console.log('  저장:', saved);
  await wait(4000);
  await snap(p, '05_saved');

  const finalText = await p.evaluate(() => document.body.innerText);
  if (finalText.includes('공개') || finalText.includes('게시됨') || finalText.includes('저장됨')) {
    console.log('\n✅ 공개 전환 완료!');
  } else {
    console.log('\n현재 상태: data/pub_05_saved.png 확인');
  }

  await wait(8000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
