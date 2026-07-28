/**
 * yt_check_and_publish.mjs
 * YouTube Studio에서 비공개/임시저장 Shorts 찾아서 공개 게시
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/chk_${name}.png` });
  console.log(`📸 chk_${name}.png`);
};

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  await p.goto('https://studio.youtube.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(3000);
  await snap(p, '00_studio');

  // 콘텐츠 메뉴 클릭
  await p.evaluate(() => {
    const links = [...document.querySelectorAll('a, [role="link"]')];
    const c = links.find(l => l.textContent?.trim() === '콘텐츠' || l.getAttribute('aria-label')?.includes('콘텐츠'));
    if (c) c.click();
  });
  await wait(3000);
  await snap(p, '01_content');

  // Shorts 탭 클릭
  console.log('Shorts 탭 클릭...');
  try {
    await p.locator('tp-yt-paper-tab, [role="tab"]').filter({ hasText: 'Shorts' }).first().click({ timeout: 5000 });
    await wait(2000);
    await snap(p, '02_shorts_tab');
  } catch {
    console.log('  Shorts 탭 없음');
  }

  // 동영상 목록 전체 텍스트
  const listText = await p.evaluate(() => document.body.innerText);
  console.log('콘텐츠 목록:\n', listText.slice(0, 600));

  // 비공개 영상 찾기
  const rows = await p.evaluate(() => {
    const result = [];
    // 비디오 행 탐색
    const allRows = [
      ...document.querySelectorAll('ytcp-video-row'),
      ...document.querySelectorAll('tr[class*="video"]'),
      ...document.querySelectorAll('[class*="video-list-item"]'),
    ];
    for (const row of allRows) {
      const title = row.querySelector('[class*="title"]')?.textContent?.trim();
      const privacy = row.querySelector('[class*="privacy"], ytcp-privacy-dropdown')?.textContent?.trim();
      const editLink = row.querySelector('a[href*="/edit/"]')?.href;
      result.push({ title, privacy, editLink });
    }
    return result;
  });
  console.log('발견된 행:', JSON.stringify(rows, null, 2));

  // 편집 링크로 이동
  const editable = rows.find(r => r.editLink);
  if (editable?.editLink) {
    console.log('편집 페이지:', editable.editLink);
    await p.goto(editable.editLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(3000);
    await snap(p, '03_edit');

    // 공개 상태 드롭다운 클릭
    try {
      await p.locator('ytcp-privacy-dropdown').first().click({ timeout: 5000 });
      await wait(1000);
      await snap(p, '04_privacy_open');

      // 공개 선택
      const items = await p.locator('tp-yt-paper-item').all();
      for (const item of items) {
        const t = await item.textContent();
        if (t?.trim() === '공개' || t?.trim() === 'Public') {
          await item.click();
          console.log('✅ 공개 선택');
          break;
        }
      }
      await wait(1000);
      await snap(p, '05_public');

      // 저장
      await p.locator('ytcp-button#save-button, #save-button').first().click({ timeout: 5000 });
      console.log('저장 클릭');
      await wait(3000);
      await snap(p, '06_saved');
    } catch (e) {
      console.log('공개 설정 실패:', e.message);
      await snap(p, '03b_error');
    }
  } else {
    console.log('편집 링크를 찾지 못함 → 스크린샷 확인');
    // URL에서 채널 ID 추출 후 직접 Shorts 비디오 탭 접근
    const url = p.url();
    console.log('현재 URL:', url);
    const channelMatch = url.match(/channel\/(UC[A-Za-z0-9_-]+)/);
    if (channelMatch) {
      const channelId = channelMatch[1];
      const shortsUrl = `https://studio.youtube.com/channel/${channelId}/videos/short`;
      console.log('Shorts 직접 URL:', shortsUrl);
      await p.goto(shortsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(3000);
      await snap(p, '04_shorts_direct');
      const txt = await p.evaluate(() => document.body.innerText);
      console.log(txt.slice(0, 500));
    }
  }

  await wait(10000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
