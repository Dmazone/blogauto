/**
 * yt_publish_short.mjs — Shorts 초안을 공개로 전환
 * Channel: UCQ07-tWWRq4jcpOZbTQpscA
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const CHANNEL_ID = 'UCQ07-tWWRq4jcpOZbTQpscA';
const TARGET_TITLE = '무선 에어 서큘레이터';
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/pub2_${name}.png` });
  console.log(`📸 pub2_${name}.png`);
};

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  // Shorts 목록 직접 접근
  const shortsUrl = `https://studio.youtube.com/channel/${CHANNEL_ID}/videos/short`;
  console.log('1️⃣ Shorts 목록:', shortsUrl);
  await p.goto(shortsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(4000);
  await snap(p, '01_list');

  // "초안 수정" 버튼 또는 편집 아이콘 클릭
  console.log('2️⃣ 편집 버튼 탐색...');

  // 방법 1: "초안 수정" 텍스트 버튼
  const editClicked = await p.evaluate((targetTitle) => {
    // 모든 행 탐색
    const rows = document.querySelectorAll('ytcp-video-row');
    for (const row of rows) {
      if (row.textContent?.includes(targetTitle)) {
        // 초안 수정 버튼
        const editBtn = [...row.querySelectorAll('ytcp-button, button, a')]
          .find(b => b.textContent?.trim().includes('초안 수정') || b.textContent?.trim().includes('Edit draft'));
        if (editBtn) { editBtn.click(); return `초안수정: ${editBtn.textContent.trim()}`; }

        // 편집 링크
        const editLink = row.querySelector('a[href*="/edit/"]');
        if (editLink) { editLink.click(); return `link: ${editLink.href}`; }

        // 점 3개 메뉴 → 편집
        const menuBtn = row.querySelector('ytcp-icon-button[id*="action"], #action-menu-button');
        if (menuBtn) { menuBtn.click(); return 'menu'; }
      }
    }
    return null;
  }, TARGET_TITLE);
  console.log('  클릭:', editClicked);
  await wait(3000);
  await snap(p, '02_after_click');

  // 팝업 메뉴가 열렸으면 편집 클릭
  if (editClicked === 'menu') {
    await p.evaluate(() => {
      const items = [...document.querySelectorAll('tp-yt-paper-item, [role="menuitem"]')];
      const edit = items.find(i => i.textContent?.includes('세부정보 수정') || i.textContent?.includes('Edit'));
      if (edit) edit.click();
    });
    await wait(2000);
    await snap(p, '02b_menu');
  }

  // 현재 URL 확인
  const currentUrl = p.url();
  console.log('현재 URL:', currentUrl);

  // 편집 페이지인지 확인
  if (currentUrl.includes('/edit/') || currentUrl.includes('edit?')) {
    console.log('✅ 편집 페이지 진입');
    await wait(2000);
    await snap(p, '03_edit');

    // 공개 상태 드롭다운
    console.log('3️⃣ 공개 상태 변경...');
    try {
      await p.locator('ytcp-privacy-dropdown').first().click({ timeout: 5000 });
      await wait(1000);
      await snap(p, '04_dropdown');

      const items = await p.locator('tp-yt-paper-item').all();
      for (const item of items) {
        const t = await item.textContent();
        if (t?.trim() === '공개' || t?.trim() === 'Public') {
          await item.click();
          console.log('✅ 공개 선택');
          break;
        }
      }
      await wait(500);
    } catch (e) {
      console.log('⚠️ 드롭다운:', e.message);
    }

    // 저장 버튼
    console.log('4️⃣ 저장...');
    try {
      await p.locator('#save-button').first().click({ timeout: 5000 });
      console.log('✅ 저장 클릭');
    } catch {
      try {
        const btns = await p.locator('ytcp-button').all();
        for (const btn of btns) {
          const t = await btn.textContent();
          if (t?.trim() === '저장' || t?.trim() === 'Save') {
            await btn.click();
            console.log('✅', t.trim());
            break;
          }
        }
      } catch (e2) {
        console.log('⚠️ 저장 버튼:', e2.message);
      }
    }
    await wait(3000);
    await snap(p, '05_saved');
  } else {
    // 편집 페이지가 아닌 경우 — Shorts 목록에서 직접 편집 URL 추출
    console.log('편집 페이지 미진입, URL 추출 시도...');
    const editUrl = await p.evaluate((targetTitle) => {
      const links = [...document.querySelectorAll('a[href*="/edit/"]')];
      return links.find(l => {
        const row = l.closest('ytcp-video-row');
        return row?.textContent?.includes(targetTitle);
      })?.href || links[0]?.href;
    }, TARGET_TITLE);

    if (editUrl) {
      console.log('직접 이동:', editUrl);
      await p.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(3000);
      await snap(p, '03_direct_edit');

      // 공개 변경 + 저장
      try {
        await p.locator('ytcp-privacy-dropdown').first().click({ timeout: 5000 });
        await wait(800);
        const items = await p.locator('tp-yt-paper-item').all();
        for (const item of items) {
          const t = await item.textContent();
          if (t?.trim() === '공개' || t?.trim() === 'Public') {
            await item.click();
            console.log('✅ 공개');
            break;
          }
        }
        await wait(500);
        await p.locator('#save-button').first().click({ timeout: 5000 });
        await wait(3000);
        await snap(p, '04_final');
      } catch (e) {
        console.log('⚠️', e.message);
        await snap(p, '04_error');
      }
    } else {
      console.log('❌ 편집 링크 없음');
      await snap(p, '03_no_link');
    }
  }

  const finalText = await p.evaluate(() => document.body.innerText);
  if (finalText.includes('공개') && !finalText.includes('초안')) {
    console.log('\n🎉 공개 게시 완료!');
  } else {
    console.log('\n→ 스크린샷 확인 필요');
  }

  await wait(10000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
