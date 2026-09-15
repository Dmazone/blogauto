/**
 * yt_fix_titles.mjs — generic 제목 영상 YouTube Studio 일괄 수정
 * 사용: node scripts/yt_fix_titles.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const wait = ms => new Promise(r => setTimeout(r, ms));

// VIDEO_ID → 새 제목 (generic "트렌드 상품 추천 TOP3" 영상들)
const FIXES = [
  { id: '9tSeuaM3Ork', title: '2026 무빙 팜레스트 TOP3 비교 추천 #Shorts' },
  { id: 'mk2l6QxVWBk', title: '2026 고중량 모니터암 TOP3 가성비 비교 #Shorts' },
  { id: 'Qpazqm86Y6Q', title: '2026 초경량 미니 마사지건 TOP3 비교 #Shorts' },
  { id: 'zqg_7ZHxWRc', title: '2026 접이식 미니벨로 TOP3 추천 비교 #Shorts' },
  { id: 'A6G6FC-TjmM', title: '직장인 건강 아이템 TOP3 비교 추천 #Shorts' },
  { id: 'xwY0987dlbo', title: '경추 견인 마사지기 TOP3 가성비 비교 #Shorts' },
  { id: 'kublPp_Gvgk', title: '노이즈캔슬링 헤드폰 TOP3 비교 추천 #Shorts' },
  { id: 'tInbzzmcTJg', title: '2026 접이식 미니벨로 가성비 TOP3 #Shorts' },
];

async function updateTitle(page, videoId, newTitle) {
  const url = `https://studio.youtube.com/video/${videoId}/edit`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(3000);

  // 제목 입력 필드 찾기 (ytcp-social-suggestion-input 또는 #textbox)
  const titleSelector = 'ytcp-social-suggestion-input #textbox, [aria-label="제목 (필수 항목)"]';
  const titleBox = await page.$(titleSelector);
  if (!titleBox) {
    console.log(`  ⚠️  제목 필드 없음: ${videoId}`);
    return false;
  }

  // 기존 제목 확인
  const currentTitle = await titleBox.textContent();
  if (currentTitle?.trim() === newTitle.replace(' #Shorts', '').trim() || currentTitle?.includes(newTitle.replace(' #Shorts', ''))) {
    console.log(`  ✅ 이미 수정됨: ${videoId}`);
    return true;
  }

  // 제목 클리어 후 새 제목 입력
  await titleBox.click();
  await wait(300);
  await page.keyboard.press('Control+a');
  await wait(200);
  await page.keyboard.type(newTitle, { delay: 30 });
  await wait(500);

  // 저장 버튼 클릭
  const saveBtn = await page.$('ytcp-button#save-button, button[aria-label="저장"]');
  if (saveBtn) {
    await saveBtn.click();
    await wait(2000);
    console.log(`  ✅ 저장 완료: ${videoId} → "${newTitle}"`);
    return true;
  } else {
    // keyboard shortcut
    await page.keyboard.press('Tab');
    await wait(300);
    // 저장 버튼 재탐색
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('ytcp-button, button')];
      const save = btns.find(b => b.textContent?.trim() === '저장' || b.getAttribute('aria-label') === '저장');
      save?.click();
    });
    await wait(2000);
    console.log(`  ✅ 저장 완료(fallback): ${videoId} → "${newTitle}"`);
    return true;
  }
}

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false, ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run'], viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  console.log(`🎬 YouTube 제목 수정 시작 — ${FIXES.length}개 영상`);

  let ok = 0, fail = 0;
  for (const { id, title } of FIXES) {
    console.log(`\n[${id}] → "${title}"`);
    try {
      const result = await updateTitle(page, id, title);
      if (result) ok++; else fail++;
    } catch (e) {
      console.log(`  ❌ 오류: ${e.message}`);
      fail++;
    }
    await wait(1000);
  }

  console.log(`\n✅ 완료 — 성공 ${ok}개 / 실패 ${fail}개`);
  await wait(2000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
