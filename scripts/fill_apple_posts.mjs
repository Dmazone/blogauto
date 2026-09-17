/**
 * fill_apple_posts.mjs — 이미지만 있는 Apple 포스팅 디렉토리에 Gemini로 콘텐츠 생성
 *
 * 사용: node scripts/fill_apple_posts.mjs
 *
 * 처리 대상 (이미지 O, index.md X):
 *   - content/posts/latest-tech/iphone-duo-foldable-full-review-2026/
 *   - content/posts/it-devices/iphone18-pro-vs-duo-camera-specs-2026/
 *   - content/posts/society/iphone-duo-preorder-guide-october-2026/
 *   - content/posts/it-devices/airpods-pro-latest-review-2026/
 *   - content/posts/latest-tech/apple-watch-series10-health-tracking-2026/
 */

import { GeminiSession } from './gemini_browser.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { sendTelegram } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const POSTS_DIR = path.join(__dirname, '..', 'content', 'posts');
const wait = ms => new Promise(r => setTimeout(r, ms));

const APPLE_POSTS = [
  {
    section: 'latest-tech',
    sectionName: '최신기술동향',
    slug: 'iphone-duo-foldable-full-review-2026',
    title: '아이폰 Duo 완전 분석: 애플 첫 폴더블의 스펙·가격·출시일 총정리',
    keyword: '아이폰 Duo 폴더블',
    description: '애플 최초 폴더블폰 아이폰 Duo의 스펙, 가격, 출시일, 폼팩터를 완벽 분석합니다.',
    date: '2026-09-17T05:00:00+09:00',
    tags: ['아이폰Duo', '폴더블폰', '애플신제품'],
  },
  {
    section: 'it-devices',
    sectionName: 'IT기기',
    slug: 'iphone18-pro-vs-duo-camera-specs-2026',
    title: 'iPhone 18 Pro vs Duo 카메라 스펙 완전 비교: 어떤 게 맞을까?',
    keyword: 'iPhone 18 Pro Duo 카메라 비교',
    description: 'iPhone 18 Pro와 iPhone Duo의 카메라 성능을 스펙부터 실사용까지 꼼꼼하게 비교합니다.',
    date: '2026-09-17T05:30:00+09:00',
    tags: ['아이폰18Pro', '아이폰Duo', '카메라비교'],
  },
  {
    section: 'society',
    sectionName: '사회',
    slug: 'iphone-duo-preorder-guide-october-2026',
    title: '아이폰 Duo 사전예약 방법·혜택·일정 완벽 정리 (10월 16일)',
    keyword: '아이폰 Duo 사전예약',
    description: '아이폰 Duo 사전예약 일정(10월 16일)과 통신사별 혜택, 가격, 구매 전략을 정리합니다.',
    date: '2026-09-17T06:00:00+09:00',
    tags: ['아이폰Duo', '사전예약', '애플폴더블'],
  },
  {
    section: 'it-devices',
    sectionName: 'IT기기',
    slug: 'airpods-pro-latest-review-2026',
    title: 'AirPods Pro 3세대 솔직 후기: 노이즈캔슬링·음질·배터리 비교',
    keyword: 'AirPods Pro 3세대',
    description: '2026년 최신 AirPods Pro 3세대의 노이즈캔슬링, 음질, 배터리 성능을 솔직하게 리뷰합니다.',
    date: '2026-09-17T06:30:00+09:00',
    tags: ['에어팟프로', 'AirPodsPro3세대', '애플이어폰'],
  },
  {
    section: 'latest-tech',
    sectionName: '최신기술동향',
    slug: 'apple-watch-series10-health-tracking-2026',
    title: '애플워치 Series 10 건강 기능 총정리: 혈당·수면·심전도 실사용 분석',
    keyword: '애플워치 Series 10 건강',
    description: '애플워치 Series 10의 혈당 측정, 수면 분석, 심전도 기능을 실사용 관점에서 분석합니다.',
    date: '2026-09-17T07:00:00+09:00',
    tags: ['애플워치Series10', '애플워치건강', '스마트워치'],
  },
];

// 섹션 이름 → 카테고리 한국어
const SECTION_KO = {
  'latest-tech': '최신기술동향',
  'it-devices': 'IT기기',
  'society': '사회',
};

function extractMarkdownBody(text) {
  const m = text.match(/```markdown\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  // 코드블록 없으면 ## 이 있는 줄부터 끝까지
  const lines = text.split('\n');
  const h2Idx = lines.findIndex(l => l.startsWith('## '));
  if (h2Idx >= 0) return lines.slice(h2Idx).join('\n').trim();
  return text.trim();
}

async function generateContentForPost(session, post) {
  const today = '2026-09-17';
  session._turnCount = 0;

  // Turn 1: 연구 컨텍스트 (짧게)
  const t1 = await session.send(
    `[섹션: ${post.sectionName}] [작성 언어: 한국어] [오늘 날짜: ${today}]
🎯 주제: ${post.title}
핵심 키워드: ${post.keyword}

이 주제에 대해 구글 검색으로 최신 정보를 조사해줘:
① 최신 스펙/가격/출시일 정보
② 독자가 가장 궁금해하는 점 3가지
③ 경쟁 제품/이전 모델과의 차이점
④ SEO에 적합한 롱테일 키워드 3개`
  );

  // Turn 2: 아웃라인
  const t2 = await session.send(
    `위 조사 내용을 바탕으로 아래 글의 SEO 아웃라인을 작성해줘.

제목: ${post.title}
섹션: ${post.sectionName}

## H2 섹션 4~5개, 각 H2 아래 ### H3 2~3개로 구성
- H2 각각 300자 이상 분량
- 숫자·날짜·구체적 스펙 포함 예정
- 마지막 H2는 "구매 가이드" 또는 "추천 대상" 형식`
  );

  // Turn 3: 본문 집필
  const t3 = await session.send(
    `아웃라인대로 Hugo 마크다운 본문을 작성해줘. front matter 없이.

요구사항:
- 분량: 2,500자 이상
- H2 4개 이상, 각 H2마다 H3 2~3개
- **볼드**, > 인용구, - 불릿 적극 활용
- "다양한", "중요합니다", "살펴보겠습니다" 등 AI 냄새 표현 절대 금지
- 실제 스펙·날짜·가격 명시 (불확실하면 "추정"이라고 표기)
- 마지막 줄: 해시태그 7개 이상 (#아이폰Duo #폴더블폰 등)

이미지 삽입 위치: 첫 번째 H2 직후 ![](${post.slug}-01.webp), 두 번째 H2 직후 ![](${post.slug}-02.webp)

\`\`\`markdown
[완성된 마크다운 본문 전체]
\`\`\``
  );

  // Turn 4: 품질검토
  const t4 = await session.send(
    `방금 쓴 글을 다시 읽고 수정해줘:
1. AI 냄새 표현 제거 ("다양한", "중요합니다" 등)
2. 분량 2,500자 미만이면 H2 섹션 보강
3. 구체적 수치/날짜 없는 H2 보강
4. 해시태그 7개 미만이면 추가

\`\`\`markdown
[수정된 최종 마크다운 전체]
\`\`\``
  );

  // Turn 5: 최종 추출
  const t5 = await session.send(
    `최종 완성본을 코드블록으로 출력해줘:
\`\`\`markdown
[완성된 마크다운 본문 전체]
\`\`\``
  );

  // Turn 3, 4, 5 중 가장 긴 추출본 선택
  const candidates = [t3, t4, t5].map(extractMarkdownBody);
  const body = candidates.reduce((a, b) => (b.length > a.length ? b : a), '');
  const h2Count = (body.match(/^## /gm) ?? []).length;
  const charCount = body.replace(/\s/g, '').length;

  console.log(`  ✅ H2 ${h2Count}개, ${charCount}자`);

  if (h2Count < 2 || charCount < 1000) {
    throw new Error(`품질 미달: H2 ${h2Count}개, ${charCount}자`);
  }

  return body;
}

function buildFrontMatter(post, body) {
  // 내부 링크 (간단히 2개)
  const internalLinks = [];

  return `---
title: "${post.title}"
date: ${post.date}
slug: ${post.slug}
tags: ${JSON.stringify(post.tags)}
categories: ["${SECTION_KO[post.section] ?? post.sectionName}"]
series: ["${SECTION_KO[post.section] ?? post.sectionName}"]
description: "${post.description}"
draft: false
cover:
  image: ${post.slug}-thumb.webp
  alt: "${post.title}"
  hiddenInSingle: true
---

${body}`;
}

async function main() {
  const gemUrl = process.env.GEMINI_GEM_URL;
  if (!gemUrl) throw new Error('GEMINI_GEM_URL 미설정');

  const pending = APPLE_POSTS.filter(p => {
    const indexPath = path.join(POSTS_DIR, p.section, p.slug, 'index.md');
    if (fs.existsSync(indexPath)) {
      console.log(`⏭️  스킵 (이미 존재): ${p.slug}`);
      return false;
    }
    return true;
  });

  if (pending.length === 0) {
    console.log('✅ 모든 Apple 포스팅 완료');
    return;
  }

  console.log(`\n🍎 Apple 포스팅 콘텐츠 생성 시작 (${pending.length}개)\n`);

  const session = new GeminiSession({ headless: false, gemUrl });
  await session.init();

  let successCount = 0;
  for (let i = 0; i < pending.length; i++) {
    const post = pending[i];
    console.log(`\n[${i + 1}/${pending.length}] ${post.slug}`);

    try {
      const body = await generateContentForPost(session, post);
      const fullContent = buildFrontMatter(post, body);
      const bundleDir = path.join(POSTS_DIR, post.section, post.slug);
      fs.mkdirSync(bundleDir, { recursive: true });
      fs.writeFileSync(path.join(bundleDir, 'index.md'), fullContent, 'utf8');
      console.log(`  💾 저장: ${path.join(bundleDir, 'index.md')}`);
      successCount++;

      // git 커밋
      try {
        execSync(`git add content/posts/${post.section}/${post.slug}/index.md`, { stdio: 'pipe' });
        execSync(`git commit -m "post: ${post.title}"`, { stdio: 'pipe' });
        execSync('git push origin main', { stdio: 'pipe' });
        console.log(`  🚀 GitHub 푸시 완료`);
      } catch (e) {
        console.log(`  ⚠️  git 오류: ${e.message}`);
      }
    } catch (e) {
      console.log(`  ❌ 실패: ${e.message}`);
    }

    if (i < pending.length - 1) {
      console.log('  ⏸️  3분 대기...');
      await wait(3 * 60 * 1000);
    }
  }

  await session.close();

  const msg = `🍎 Apple 포스팅 콘텐츠 생성 완료\n✅ ${successCount}/${pending.length}개 성공`;
  console.log('\n' + msg);
  await sendTelegram(msg).catch(() => {});
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
