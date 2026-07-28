/**
 * naver_post.js — 네이버 스마트에디터ONE 자동 포스팅
 *
 * 사용법:
 *   import { naverPost } from './naver_post.js';
 *   await naverPost({ title, sections, category, tags });
 *
 * sections 형식:
 *   [
 *     { type: 'text', lines: ['단락1', '단락2'] },
 *     { type: 'heading', text: '소제목' },
 *     { type: 'text', lines: ['단락...'] },
 *   ]
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'data', 'naver_state.json');
const BLOG_ID = 'myubel';
const WRITE_URL = `https://blog.naver.com/PostWriteForm.naver?blogId=${BLOG_ID}`;

// SE3 문서 데이터 빌더 (브라우저 context에서 실행될 코드)
const SE3_BUILD_DOC = (sections) => {
  function seId() {
    return 'SE-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  const textNode = (text) => ({ id: seId(), value: text, '@ctype': 'textNode' });
  const paragraph = (text) => ({ id: seId(), nodes: [textNode(text)], '@ctype': 'paragraph' });
  const textBlock = (lines) => ({
    id: seId(), layout: 'default',
    value: lines.map(l => paragraph(l)),
    '@ctype': 'text'
  });
  const sectionTitle = (text) => ({
    id: seId(), layout: 'default',
    title: [paragraph(text)],
    '@ctype': 'sectionTitle'
  });

  const editor = window.SmartEditor.getEditor(Object.keys(window.SmartEditor._editors)[0]);
  const ds = editor._documentService;
  const currentData = ds.getDocumentData();
  const doc = currentData.document;
  const titleComp = doc.components.find(c => c['@ctype'] === 'documentTitle');

  const components = [titleComp];
  for (const s of sections) {
    if (s.type === 'heading') components.push(sectionTitle(s.text));
    else if (s.type === 'text') components.push(textBlock(s.lines));
  }
  doc.components = components;
  editor.setDocumentData(currentData);
  return editor.getContentText().length;
};

async function withRetry(fn, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === retries - 1) throw e;
      console.warn(`  재시도 ${i + 1}/${retries}: ${e.message}`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

/**
 * @param {object} opts
 * @param {string} opts.title - 포스팅 제목
 * @param {Array}  opts.sections - 섹션 배열 [{type:'text',lines:[]}, {type:'heading',text:''}]
 * @param {string} opts.category - 카테고리명 (예: '부동산/ 재테크', '건강정보')
 * @param {string[]} opts.tags - 태그 배열 (최대 30개)
 * @param {boolean} [opts.headless=true]
 * @returns {Promise<{url: string}>}
 */
export async function naverPost({ title, sections, category = '부동산/ 재테크', tags = [], headless = true }) {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(`로그인 세션 없음. 먼저 실행: node scripts/naver_login.js`);
  }

  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 100 });
  const context = await browser.newContext({ storageState: STATE_FILE });
  const page = await context.newPage();

  try {
    console.log('  📝 네이버 블로그 글쓰기 페이지 이동...');
    await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded' });

    // 로그인 만료 확인
    if (page.url().includes('nidlogin')) {
      throw new Error('세션 만료 — node scripts/naver_login.js 를 다시 실행해 주세요.');
    }

    // SmartEditor 로드 대기
    await page.waitForFunction(() => window.SmartEditor && Object.keys(window.SmartEditor._editors || {}).length > 0, { timeout: 30_000 });
    console.log('  ✅ SmartEditor 로드 완료');

    // 제목 설정
    await page.evaluate((t) => {
      const editor = window.SmartEditor.getEditor(Object.keys(window.SmartEditor._editors)[0]);
      editor.setDocumentTitle(t);
    }, title);

    // 본문 설정
    const contentLen = await page.evaluate(SE3_BUILD_DOC, sections);
    console.log(`  ✅ 본문 설정 완료 (${contentLen}자)`);

    // 도움말 패널 방해 요소 제거
    await page.evaluate(() => {
      const helpPanel = document.querySelector('[class*="container__"]');
      if (helpPanel) helpPanel.style.display = 'none';
    });

    // 발행 다이얼로그 열기
    await withRetry(async () => {
      await page.locator('button[data-click-area="tpb.publish"]').click({ timeout: 5000 });
    });
    await page.waitForSelector('[class*="confirm_btn"]', { timeout: 10_000 });
    console.log('  ✅ 발행 다이얼로그 열림');

    // 카테고리 선택
    const currentCat = await page.locator('[class*="selectbox_button"]').textContent();
    if (!currentCat.includes(category)) {
      await page.locator('[class*="selectbox_button"]').click();
      await page.locator(`li:has-text("${category}")`).first().click();
      console.log(`  ✅ 카테고리: ${category}`);
    } else {
      console.log(`  ✅ 카테고리 이미 선택됨: ${category}`);
    }

    // 태그 입력
    if (tags.length > 0) {
      const tagInput = page.locator('#tag-input');
      for (const tag of tags.slice(0, 30)) {
        await tagInput.fill(tag);
        await tagInput.press('Enter');
        await page.waitForTimeout(200);
      }
      console.log(`  ✅ 태그 ${tags.length}개 입력`);
    }

    // 발행 클릭
    await page.locator('[class*="confirm_btn"]').click();
    console.log('  ✅ 발행 완료!');

    // 발행된 URL 가져오기
    await page.waitForURL(`**/blog.naver.com/${BLOG_ID}/**`, { timeout: 15_000 }).catch(() => {});
    const postUrl = page.url();

    // 세션 갱신 저장
    await context.storageState({ path: STATE_FILE });

    return { url: postUrl };
  } finally {
    await browser.close();
  }
}
