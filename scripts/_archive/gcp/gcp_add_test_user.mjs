/**
 * gcp_add_test_user.mjs — hokiku-yt 프로젝트 대상(Audience)에 테스트 사용자 추가
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION = path.join(os.homedir(), '.gemini-blog-session');
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/testuser_${name}.png` });
  console.log(`📸 ${name}`);
};

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  // hokiku-yt 프로젝트의 대상(Audience) 페이지 직접 이동
  console.log('1️⃣ hokiku-yt 프로젝트 대상 페이지 이동...');
  await p.goto(
    'https://console.cloud.google.com/auth/audience?project=hokiku-yt',
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  );
  await wait(5000);
  await snap(p, '01_audience');

  // 현재 프로젝트 확인
  const projectBtn = await p.evaluate(() => {
    const btn = document.querySelector('[aria-label*="프로젝트"], [aria-label*="project"]');
    return btn?.textContent?.trim();
  });
  console.log('현재 프로젝트:', projectBtn);

  // 프로젝트가 hokiku-yt가 아니면 전환
  const url = p.url();
  console.log('현재 URL:', url);

  // 페이지 전체 텍스트 확인
  const bodyText = await p.evaluate(() => document.body.innerText);
  console.log('페이지 텍스트 (일부):', bodyText.slice(0, 500));

  await snap(p, '02_page_state');

  // "테스트 사용자 추가" 버튼 찾기 (JS 포함)
  console.log('2️⃣ 테스트 사용자 추가 버튼 탐색...');
  const addBtnInfo = await p.evaluate(() => {
    const result = [];
    function scan(root) {
      for (const el of root.querySelectorAll('button, a[role="button"], [role="button"]')) {
        const t = el.textContent?.trim() || '';
        const l = el.getAttribute('aria-label') || '';
        if (t.includes('사용자') || t.includes('User') || t.includes('테스트') || t.includes('Test') ||
            t.includes('추가') || t.includes('Add')) {
          result.push({ text: t.slice(0, 50), label: l, tag: el.tagName });
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) scan(el.shadowRoot);
      }
    }
    scan(document.body);
    return result;
  });
  console.log('관련 버튼:', JSON.stringify(addBtnInfo));

  // 테스트 사용자 섹션으로 스크롤 후 추가 버튼 클릭
  const clicked = await p.evaluate(() => {
    function scan(root) {
      for (const btn of root.querySelectorAll('button, [role="button"]')) {
        const t = btn.textContent?.trim() || '';
        if (t.includes('사용자 추가') || t.includes('Add users') || t.includes('Add test users')) {
          btn.scrollIntoView();
          btn.click();
          return t;
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const r = scan(el.shadowRoot);
          if (r) return r;
        }
      }
      return null;
    }
    return scan(document.body);
  });
  console.log('클릭 결과:', clicked);
  await wait(2000);
  await snap(p, '03_after_click');

  // 이메일 입력 필드 탐색
  const emailSet = await p.evaluate(() => {
    function findAndFill(root) {
      for (const inp of root.querySelectorAll('input, textarea')) {
        const type = inp.type || '';
        const placeholder = inp.placeholder || '';
        if (type === 'email' || placeholder.toLowerCase().includes('email') || placeholder.includes('이메일')) {
          inp.focus();
          inp.value = 'paydma@gmail.com';
          inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return `filled: ${inp.placeholder || inp.type}`;
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const r = findAndFill(el.shadowRoot);
          if (r) return r;
        }
      }
      return null;
    }
    return findAndFill(document.body);
  });
  console.log('이메일 입력:', emailSet);
  await wait(1000);
  await snap(p, '04_email');

  // 추가/저장 버튼
  const saved = await p.evaluate(() => {
    function scan(root) {
      for (const btn of root.querySelectorAll('button')) {
        const t = btn.textContent?.trim() || '';
        if (t === '추가' || t === 'Add' || t === '저장' || t === 'Save') {
          btn.click();
          return t;
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) { const r = scan(el.shadowRoot); if (r) return r; }
      }
      return null;
    }
    return scan(document.body);
  });
  console.log('저장:', saved);
  await wait(3000);
  await snap(p, '05_result');

  const result = await p.evaluate(() => document.body.innerText);
  if (result.includes('paydma@gmail.com')) {
    console.log('\n✅ paydma@gmail.com 테스트 사용자 추가 완료!');
    console.log('다음: node scripts/yt_auth.mjs 재실행');
  } else {
    console.log('\n페이지 상태 (하단 500자):');
    console.log(result.slice(-500));
    console.log('\n스크린샷: data/testuser_*.png 확인');
  }

  await wait(15000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
