#!/usr/bin/env node
/**
 * setup_gem.js — Gemini에 '블로그포스팅' Gem을 자동 생성하고
 *                Gem URL을 .env에 저장하는 1회성 셋업 스크립트
 *
 * 실행: node scripts/setup_gem.js
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT        = path.join(__dirname, '..');
const SESSION_DIR = path.join(os.homedir(), '.gemini-blog-session');
const ENV_PATH    = path.join(ROOT, '.env');

dotenv.config({ path: ENV_PATH });

const log = (e, m) => console.log(`${e}  ${m}`);

// ── 블로그포스팅 Gem 시스템 프롬프트 ────────────────────────────────────────
const GEM_NAME = '블로그포스팅';

const GEM_INSTRUCTIONS = `너는 '트렌드줌' 한국어 블로그의 전담 작가야.

[블로그 정보]
• 블로그명: 트렌드줌 (dmazone.github.io/blogauto)
• 섹션: 최신기술동향 / 경제 / 사회 / 인문 / 연예이슈 / 건강 / IT기기 / 한국부동산 / 세계여행지 / 스포츠
• 목적: 구글 애드센스 승인 + SEO 자연 유입

[핵심 작성 원칙]
1. 독창성: 단순 사실 나열 금지. 비교 분석·장단점·실제 사례·경험적 어조 필수
2. 자연스러운 한국어: 번역체·AI 냄새 완전 배제
3. 구조: Hugo 마크다운, ## H2 4개, ### H3 각 2~3개
4. SEO: 핵심 키워드를 제목/첫문단/소제목/마지막문단에 자연스럽게 배치
5. 분량: 1,500~2,500자

[절대 금지 표현]
다양한 / 중요합니다 / 살펴보겠습니다 / 마지막으로 / ~드립니다 / 알아보겠습니다 / ~에 대해

[애드센스 품질 체크리스트] ← 모든 글에 스스로 적용할 것
✓ 광고성·홍보성 표현 없음
✓ 출처 없는 수치/통계 미사용
✓ 독자가 읽고 나서 실질적 가치를 얻는 정보
✓ 글 전체가 일관된 하나의 주제
✓ 도입부에서 독자의 문제/궁금증 먼저 제시

[이미지 마크다운 형식]
도입부 직후: ![제목 대표이미지](BLOG_URL/images/SLUG-01.webp)
2번째 H2 직후: ![키워드 관련이미지](BLOG_URL/images/SLUG-02.webp)
→ BLOG_URL은 https://dmazone.github.io/blogauto, SLUG는 요청에서 지정됨

나는 단계별로 지시받을 때마다 충실히 수행하며, 항상 이 원칙을 적용한다.`;

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
function waitForEnter(prompt = '') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
}

function saveEnvVar(key, value) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
  log('💾', `.env 저장: ${key}=${value}`);
}

// ── Gem 생성 로직 ─────────────────────────────────────────────────────────────
async function createGem(page) {
  log('🔍', 'Gems 페이지로 이동 중...');

  // 방법 1: 직접 URL 접근
  await page.goto('https://gemini.google.com/gems', { waitUntil: 'domcontentloaded', timeout: 20000 })
    .catch(() => {});

  await page.waitForTimeout(3000);

  // "새 Gem 만들기" 버튼 찾기
  const createSelectors = [
    'a[href*="/gems/new"]',
    'button:has-text("새 Gem")',
    'button:has-text("Create a Gem")',
    'button:has-text("New Gem")',
    '[aria-label*="Create"]',
    'a[href*="gems/new"]',
  ];

  let created = false;
  for (const sel of createSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 })) {
        await btn.click();
        await page.waitForTimeout(2000);
        created = true;
        log('✅', `Gem 만들기 버튼 클릭: ${sel}`);
        break;
      }
    } catch {}
  }

  if (!created) {
    // 방법 2: gems/new 직접 이동
    await page.goto('https://gemini.google.com/gems/new', { waitUntil: 'domcontentloaded', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(2000);
  }

  // Gem 이름 입력
  log('✏️', 'Gem 이름 입력 중...');
  const nameSelectors = [
    'input[placeholder*="name" i]',
    'input[placeholder*="이름" i]',
    'input[aria-label*="name" i]',
    'input[name="name"]',
    'input[type="text"]',
  ];

  for (const sel of nameSelectors) {
    try {
      const input = page.locator(sel).first();
      if (await input.isVisible({ timeout: 3000 })) {
        await input.click();
        await input.fill(GEM_NAME);
        log('✅', `이름 입력 완료: ${sel}`);
        break;
      }
    } catch {}
  }

  // Gem 지침 입력
  log('✏️', 'Gem 지침(시스템 프롬프트) 입력 중...');
  const instrSelectors = [
    'textarea[placeholder*="instruction" i]',
    'textarea[placeholder*="지침" i]',
    'div[contenteditable="true"][aria-multiline="true"]',
    '[data-test-id="gem-instructions"]',
    'textarea',
  ];

  for (const sel of instrSelectors) {
    try {
      const field = page.locator(sel).first();
      if (await field.isVisible({ timeout: 3000 })) {
        await field.click();
        // 클립보드로 붙여넣기 (긴 텍스트)
        await page.evaluate((text) => navigator.clipboard.writeText(text), GEM_INSTRUCTIONS)
          .catch(() => {});
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(1000);
        log('✅', `지침 입력 완료: ${sel}`);
        break;
      }
    } catch {}
  }

  // 저장 버튼 클릭
  log('💾', 'Gem 저장 중...');
  const saveSelectors = [
    'button:has-text("저장")',
    'button:has-text("Save")',
    'button[type="submit"]',
    '[data-test-id="save-gem"]',
    'button:has-text("확인")',
  ];

  for (const sel of saveSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 })) {
        await btn.click();
        await page.waitForTimeout(3000);
        log('✅', 'Gem 저장 완료');
        break;
      }
    } catch {}
  }

  // 저장 후 URL 추출
  const gemUrl = page.url();
  log('🔗', `Gem URL: ${gemUrl}`);
  return gemUrl;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  // 이미 Gem URL이 있으면 스킵
  if (process.env.GEMINI_GEM_URL && !process.argv.includes('--force')) {
    log('ℹ️', `이미 Gem이 설정돼 있어요: ${process.env.GEMINI_GEM_URL}`);
    log('ℹ️', '재생성하려면 --force 옵션을 추가하세요.');
    return;
  }

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });

  const page = await context.newPage();

  try {
    // 로그인 확인
    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    if (page.url().includes('accounts.google.com') || page.url().includes('signin')) {
      log('🔐', '구글 계정 로그인이 필요합니다.');
      log('📋', 'paydma 계정으로 로그인한 후 Enter를 누르세요.');
      await waitForEnter('  → Enter: ');
    }

    log('🚀', `'${GEM_NAME}' Gem 생성 시작...`);
    console.log('\n--- Gem 지침 미리보기 ---');
    console.log(GEM_INSTRUCTIONS.slice(0, 200) + '...');
    console.log('---\n');

    const gemUrl = await createGem(page);

    if (gemUrl && gemUrl.includes('gem')) {
      saveEnvVar('GEMINI_GEM_URL', gemUrl);
      log('🎉', `셋업 완료! Gem URL: ${gemUrl}`);
    } else {
      log('⚠️', 'Gem URL을 자동으로 감지하지 못했어요.');
      log('📋', '브라우저에서 Gem을 직접 확인하고 URL을 복사한 뒤 Enter를 누르세요.');
      const url = await waitForEnter('  → Gem URL 수동 입력 후 Enter (아니면 그냥 Enter): ');
      if (url?.trim()) saveEnvVar('GEMINI_GEM_URL', url.trim());
    }

    log('✅', '이제 node scripts/daily_runner.js 를 실행하세요.');
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error('❌ 셋업 실패:', err.message);
  process.exit(1);
});
