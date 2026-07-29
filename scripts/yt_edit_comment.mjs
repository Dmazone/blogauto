/**
 * yt_edit_comment.mjs — 기존 YouTube 댓글에 쿠팡파트너스 고지 문구 추가
 * Usage: node scripts/yt_edit_comment.mjs <videoId>
 *
 * 해당 영상 첫 번째 내 댓글을 찾아 편집 모드로 열어
 * 고지 문구가 없으면 끝에 추가하고 저장.
 */
import { chromium } from 'playwright';
import os from 'os';
import path from 'path';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const NOTICE  = '※ 이 영상은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
const wait    = ms => new Promise(r => setTimeout(r, ms));

async function editComment(videoId) {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  console.log('🎬 접속:', url);
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(4000);

  // 댓글 섹션으로 스크롤
  await p.evaluate(() => window.scrollBy(0, 700));
  await wait(2500);

  // 내 댓글의 3점 메뉴(더보기) 버튼 클릭
  // YouTube는 자신의 댓글에만 편집/삭제 메뉴가 나타남
  let edited = false;
  try {
    // 댓글 목록에서 액션 메뉴 버튼 찾기
    const actionBtn = p.locator('ytd-comment-thread-renderer #action-menu').first();
    await actionBtn.waitFor({ timeout: 10000 });
    await actionBtn.click();
    await wait(1000);

    // 메뉴 팝업 열릴 때까지 대기
    await wait(1500);

    // 열린 메뉴 항목 텍스트 로깅 (디버그)
    const menuItems = await p.evaluate(() => {
      const items = [...document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item, ytd-menu-navigation-item-renderer')];
      return items.map(el => el.textContent?.trim()).filter(Boolean);
    });
    console.log('📋 메뉴 항목들:', menuItems);

    // "수정" / "편집" / "Edit" 텍스트 메뉴 클릭
    const editMenuItem = p.locator([
      'ytd-menu-service-item-renderer:has-text("수정")',
      'ytd-menu-service-item-renderer:has-text("편집")',
      'ytd-menu-service-item-renderer:has-text("Edit")',
      'tp-yt-paper-item:has-text("수정")',
      'tp-yt-paper-item:has-text("편집")',
    ].join(', ')).first();
    await editMenuItem.click({ timeout: 5000 });
    await wait(1500);

    // 편집 입력창 열림 — 현재 내용 가져오기
    const editor = p.locator('#contenteditable-root[contenteditable="true"]').first();
    const currentText = await editor.innerText();
    console.log('📝 현재 댓글 내용 (앞 100자):', currentText.slice(0, 100));

    if (currentText.includes('파트너스 활동의 일환')) {
      console.log('✅ 이미 고지 문구 포함 — 수정 불필요');
      // 편집 취소
      const cancelBtn = p.locator('ytd-button-renderer#cancel-button button, #cancel-button').first();
      await cancelBtn.click({ timeout: 5000 }).catch(() => p.keyboard.press('Escape'));
    } else {
      // 커서를 끝으로 이동 후 고지 문구 추가
      await editor.click();
      await p.keyboard.press('End');
      await p.keyboard.press('Control+End');
      await wait(300);
      await p.keyboard.type('\n\n' + NOTICE);
      await wait(800);

      // 저장 버튼 클릭
      const saveBtn = p.locator('ytd-button-renderer#submit-button button, #submit-button').first();
      await saveBtn.click({ timeout: 5000 });
      await wait(3000);

      edited = true;
      console.log('✅ 댓글 수정 완료 — 고지 문구 추가됨');
    }
  } catch (e) {
    console.log('⚠️ 댓글 수정 실패:', e.message);
    console.log('💡 YouTube Studio에서 수동으로 댓글을 편집해주세요.');
  }

  await ctx.close();
  return edited;
}

const videoId = process.argv[2];
if (!videoId) {
  console.error('Usage: node yt_edit_comment.mjs <videoId>');
  process.exit(1);
}

console.log(`📹 대상 영상: ${videoId}`);
await editComment(videoId);
