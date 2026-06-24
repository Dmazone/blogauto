#!/usr/bin/env node
/**
 * agent_core.js — AI 블로그 자동화 (Gemini 중심, Claude 최소 토큰)
 *
 * CLI:  node agent_core.js --section <section-id>
 *       node agent_core.js --section health --subtopic 운동
 *
 * 라이브러리: import { runForSection } from './agent_core.js'
 *
 * STEP 1: Gemini → 오늘의 토픽 자동 선정
 * STEP 2: Gemini + Google Search → 최신 트렌드 수집
 * STEP 3: Gemini → 교차 검증 & 인사이트 필터링
 * STEP 4: Gemini → SEO 아웃라인 설계
 * STEP 5: Gemini → 본문 전체 집필
 * STEP 6: Gemini 단독 루프 (최대 2회) → SEO 자체 검토 & 수정
 * STEP 7: Claude (1회 · max 800토큰) → 품질 피드백 → Gemini 반영
 * STEP 8: 맥락 기반 이미지 생성 + GitHub 자동 푸시
 */

import { promoteAll } from './sns_promoter.js';
import { SECTIONS, getSectionById, getHealthSubtopic } from './sections.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });


const POSTS_DIR  = path.join(ROOT, 'content', 'posts');
const IMAGES_DIR = path.join(ROOT, 'static', 'images');
const BASE_URL   = (process.env.BLOG_BASE_URL ?? '').replace(/\/$/, '');

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const log = (emoji, msg) => console.log(`${emoji}  ${msg}`);

/** Gemini가 Python/코드블록으로 응답을 감쌀 때 마크다운 본문만 추출 */
function extractFinalMarkdown(text) {
  // Python: content = """---\n...\n---\n..."""
  const pyMatch = text.match(/content\s*=\s*"""\s*([\s\S]*?)"""/);
  if (pyMatch) return stripMarkdownLabel(pyMatch[1].trim());
  // ```markdown / ```md / ``` 코드블록
  const mdMatch = text.match(/```(?:markdown|md|plaintext)?\s*([\s\S]*?)```/s);
  if (mdMatch) return stripMarkdownLabel(mdMatch[1].trim());
  return stripMarkdownLabel(text.trim());
}

/** Gemini가 코드블록 안팎에 "Markdown" 레이블을 붙이는 경우 제거 */
function stripMarkdownLabel(text) {
  return text.replace(/^Markdown\s*\n/, '').replace(/^markdown\s*\n/, '');
}

// ── Gemini 호출 구현체 (기본: API / 교체 가능: 브라우저) ───────────────────
let _geminiImpl = null; // null = API 모드, fn._session = GeminiSession

async function withRetry(fn, retries = 4, baseDelay = 15000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err?.message ?? '';
      const retryable =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED');

      if (retryable && attempt < retries) {
        // API가 알려주는 retryDelay 파싱 (예: "50s" → 50000ms)
        let delay = baseDelay * attempt;
        const retryMatch = msg.match(/"retryDelay":"(\d+)s"/);
        if (retryMatch) delay = Math.max(delay, (parseInt(retryMatch[1]) + 5) * 1000);

        log('⏳', `API 과부하 → ${Math.round(delay / 1000)}초 후 재시도 (${attempt}/${retries - 1})...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

async function geminiCall(prompt, opts = {}) {
  if (!_geminiImpl) throw new Error('Gemini 브라우저 세션이 초기화되지 않았습니다. daily_runner.js를 통해 실행하세요.');
  return await withRetry(() => _geminiImpl(prompt), 3, 5000);
}

/** 해당 섹션에 이미 존재하는 슬러그 목록 (.md 파일 + 페이지 번들 디렉토리 모두 포함) */
function existingSlugsForSection(section) {
  const dir = path.join(POSTS_DIR, section.dir);
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const slugs = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== '_index.md') {
      slugs.push(entry.name.replace(/\.md$/, ''));
    } else if (entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'index.md'))) {
      slugs.push(entry.name);
    }
  }
  return slugs;
}

// ────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
// STEP 7.5: 마크다운 렌더링 검증 (취소선·따옴표·괄호 오류)
// ────────────────────────────────────────────────────────────────────────────
async function validateAndFixMarkdown(body, topic) {
  const issues = [];

  // 한국어 범위 표기 ~ 자동 이스케이프 (goldmark 취소선 오인식 방지)
  // 이미 이스케이프된 \~ 와 이중 ~~ 는 건드리지 않음
  body = body.replace(/(?<!\\)(?<!~)~(?!~)/g, '\\~');

  // 의도치 않은 취소선 (~~텍스트~~)
  const strikeMatches = body.match(/~~[^~\n]{1,100}~~/g);
  if (strikeMatches) {
    issues.push(`의도치 않은 취소선(가운데 줄) 발견: ${strikeMatches.slice(0, 3).join(', ')}`);
  }

  // 짝이 맞지 않는 마크다운 링크 괄호
  const linkBroken = body.match(/\[[^\]]*\]\s*\([^)]*$/m);
  if (linkBroken) issues.push('닫히지 않은 링크 괄호 발견');

  // YAML front matter 내 따옴표 없는 콜론 값 (본문에서는 무시)
  const curlyUnmatched = (body.match(/\{/g) || []).length !== (body.match(/\}/g) || []).length;
  if (curlyUnmatched) issues.push('중괄호 { } 짝 불일치');

  // 연속 빈 줄 3개 이상 (모바일 가독성 저해)
  if (/\n{4,}/.test(body)) issues.push('연속 빈 줄 3개 이상 (모바일 가독성 저해) — 최대 1개 빈 줄만 허용');

  // H1 본문 사용 금지
  if (/^#\s+[^#]/m.test(body)) issues.push('본문에 # H1 사용 금지');

  if (issues.length === 0) {
    log('✅', '[STEP 7.5] 마크다운 검증 통과');
    return body;
  }

  log('⚠️', `[STEP 7.5] 마크다운 이슈 ${issues.length}개 발견 → Gemini 수정 요청`);
  issues.forEach((i) => log('  ·', i));

  const fixed = extractFinalMarkdown(await geminiCall(
    `아래 마크다운 본문에서 발견된 렌더링 오류를 수정해줘.\n` +
    `이미지 마크다운, 내부 링크, 해시태그는 반드시 그대로 유지해.\n\n` +
    `[수정 필요 항목]\n${issues.map((i, n) => `${n + 1}. ${i}`).join('\n')}\n\n` +
    `[수정 규칙]\n` +
    `- 취소선(~~): 완전히 제거하고 일반 텍스트로 변환\n` +
    `- 닫히지 않은 괄호: 올바르게 닫기\n` +
    `- 연속 빈 줄: 최대 빈 줄 1개로 줄이기\n` +
    `- H1 (#): ## 또는 ### 으로 변경\n\n` +
    `[현재 본문]\n${body}\n\n수정된 본문만 출력해줘.`,
    { temperature: 0.3 }
  ));

  log('✅', '[STEP 7.5] 마크다운 수정 완료');
  return fixed;
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 1: Gemini → 오늘의 토픽 자동 선정
// ────────────────────────────────────────────────────────────────────────────
async function pickTodayTopic(section, subtopic) {
  log('💡', `[STEP 1] "${section.name}" 오늘의 토픽 선정 중...`);

  const utcNow = new Date().toUTCString();
  const existing = existingSlugsForSection(section);
  const subtopicHint = subtopic ? `서브토픽: ${subtopic} (오늘은 이 주제로 한정해서 선정)` : '';
  const avoidList = existing.length
    ? `\n이미 발행된 슬러그(중복 금지): ${existing.join(', ')}`
    : '';

  const raw = await geminiCall(
    `현재 UTC 시간: ${utcNow}\n` +
    `한국어 블로그 "${section.name}" 섹션 포스팅 주제를 1개 선정해줘.\n` +
    `위 UTC 시간 기준 최근 24~48시간 내 가장 화제가 된 이슈를 구글 검색으로 파악하여 선정.\n\n` +
    `섹션 컨텍스트: ${section.searchContext}\n` +
    `${subtopicHint}${avoidList}\n\n` +
    `조건:\n` +
    `- 2026년 현재 가장 화제가 되는 최신 이슈 또는 독자가 궁금해할 주제\n` +
    `- 구글 SEO 검색 트래픽이 높을 만한 롱테일 키워드 포함\n` +
    `- 제목 SEO 최적화 필수:\n` +
    `  · 핵심 키워드를 제목 앞쪽에 배치\n` +
    `  · 숫자(년도·순위·개수), 의문형("~인가", "~할까"), 이익 강조("완전 정리", "핵심만") 중 1개 이상 활용\n` +
    `  · 한국어 28자 이내 (구글 검색결과 잘림 방지)\n` +
    `  · 클릭을 유도하는 감성 단어 포함 ("진짜", "숨은", "바뀌는", "충분한" 등)\n` +
    `- slug는 영어 소문자 + 하이픈, 5단어 이내\n` +
    `- description은 핵심 키워드 + 독자 혜택 중심 160자 이내\n\n` +
    `유효한 JSON만 출력:\n` +
    `{"title": "...", "keyword": "...", "slug": "...", "description": "..."}`,
    { temperature: 0.7 }
  );

  try {
    const jsonStr = raw.match(/\{[\s\S]*?\}/)?.[0] ?? '{}';
    const topic   = JSON.parse(jsonStr);
    if (!topic.title || !topic.slug) throw new Error('필드 누락');

    // 슬러그 중복 방지 — 이미 있으면 날짜 접미사 추가
    if (existing.includes(topic.slug)) {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      topic.slug = `${topic.slug}-${today}`;
    }

    log('✅', `토픽 선정: "${topic.title}" (slug: ${topic.slug})`);
    return topic;
  } catch {
    log('⚠️', '토픽 JSON 파싱 실패 → 기본 주제 사용');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return {
      title:   `${section.name} 최신 트렌드 ${today}`,
      keyword: section.name,
      slug:    `${section.dir}-${today}`,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 2: Gemini + Google Search → 최신 트렌드 수집
// ────────────────────────────────────────────────────────────────────────────
async function searchTrends(section, topic) {
  log('🔍', `[STEP 2] Gemini Search — "${topic.keyword}" 트렌드 수집 중...`);

  const searchPrompt =
    `[구글 검색 필수] 2026년 현재 기준 "${topic.keyword}" 최신 동향·트렌드·실제 사례·주요 이슈를 ` +
    `한국 독자 관점에서 구체적으로 조사해줘. 반드시 최신 뉴스와 실제 데이터를 인용해.\n` +
    `섹션 컨텍스트: ${section.searchContext}\n` +
    `글의 핵심 관점: ${section.toneHint}`;

  let rawText, sources = [];

  rawText = await withRetry(() => _geminiImpl(searchPrompt), 3, 5000);

  log('✅', `트렌드 수집 완료${sources.length ? ` (출처 ${sources.length}개)` : ''}`);
  return { rawText, sources };
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 3: Gemini → 교차 검증 & 인사이트 필터링
// ────────────────────────────────────────────────────────────────────────────
async function validateTrends(topic, trendData) {
  log('🔬', '[STEP 3] Gemini 교차 검증 중...');

  const raw = await geminiCall(
    `주제: "${topic.keyword}"\n\n` +
    `아래 수집된 데이터에서:\n` +
    `1. 2026년 현재 유효한 최신 정보만 남기기\n` +
    `2. 추측성·출처 불명 정보 제거\n` +
    `3. 한국 독자에게 실용적 가치 있는 것만\n` +
    `4. 중복 통합\n\n` +
    `수집 데이터:\n${trendData.rawText}\n\n` +
    `유효한 JSON만:\n` +
    `{"validated_insights":["..."],"key_facts":["..."],"recommended_angle":"..."}`,
    { temperature: 0.2 }
  );

  try {
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    const result  = JSON.parse(jsonStr);
    log('✅', `교차 검증 완료 (인사이트 ${result.validated_insights?.length ?? 0}개)`);
    return result;
  } catch {
    log('⚠️', '검증 JSON 파싱 실패 → 원문으로 계속');
    return { validated_insights: [trendData.rawText], key_facts: [], recommended_angle: '' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 4: Gemini → SEO 아웃라인 설계
// ────────────────────────────────────────────────────────────────────────────
async function generateOutline(section, topic, validated) {
  log('📐', '[STEP 4] Gemini SEO 아웃라인 설계 중...');

  const raw = await geminiCall(
    `한국어 블로그 포스팅 SEO 아웃라인을 JSON으로 만들어줘.\n\n` +
    `섹션: ${section.name}\n` +
    `제목: ${topic.title}\n` +
    `핵심 키워드: ${topic.keyword}\n` +
    `검증된 인사이트:\n${(validated.validated_insights ?? []).join('\n')}\n` +
    `추천 관점: ${validated.recommended_angle ?? ''}\n\n` +
    `조건:\n` +
    `- 구글 애드센스 고품질 승인 기준 충족\n` +
    `- 비교 분석, 장단점, 경험적 어조(리뷰 형태) 반드시 포함\n` +
    `- H2 섹션 5~6개, 각 H2 아래 H3 2~3개\n` +
    `- 메타 디스크립션 160자 이내\n` +
    `- 동일 섹션 내 내부 링크 anchor 1개\n\n` +
    `유효한 JSON만:\n` +
    `{"meta_description":"...","sections":[{"h2":"...","h3s":["..."],"tone":"비교분석|장단점|경험담|튜토리얼"}],"internal_link":{"anchor":"...","path":"/posts/${section.dir}/"}}`,
    { temperature: 0.4 }
  );

  try {
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    const outline = JSON.parse(jsonStr);
    log('✅', `아웃라인 완료 (H2 ${outline.sections?.length ?? 0}개)`);
    return outline;
  } catch {
    log('⚠️', '아웃라인 JSON 파싱 실패 → 빈 아웃라인');
    return {
      sections: [],
      meta_description: `${topic.keyword}에 대한 2026년 최신 정보와 분석.`,
      internal_link: { anchor: '관련 글 보기', path: `/posts/${section.dir}/` },
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 5: Gemini → 본문 전체 집필
// ────────────────────────────────────────────────────────────────────────────
async function writeArticle(section, topic, outline, validated) {
  log('✍️', '[STEP 5] Gemini 본문 집필 중...');

  const sectionsText = (outline.sections ?? [])
    .map((s) => `- H2: ${s.h2}\n  - H3: ${s.h3s?.join(', ')}\n  - 톤: ${s.tone}`)
    .join('\n');

  const body = await geminiCall(
    `너는 한국어 블로그 전문 작가야. 아래 지침을 100% 지켜서 Hugo 블로그 포스팅 본문(front matter 제외)을 작성해줘.\n\n` +
    `[Technical SEO 구조 — 반드시 준수]\n` +
    `- 도입부 첫 문단: 핵심 키워드 자연스럽게 포함\n` +
    `- 헤딩: ## (H2) 5~6개, 각 H2 아래 ### (H3) 2~3개 — # (H1) 본문 금지, 숫자 번호 방식 금지\n` +
    `- 이미지: 도입부 직후 1장, 두 번째 ## 섹션 직후 1장 (지정 URL 정확히 삽입)\n` +
    `- 내부 링크: 본문 적절한 위치에 1개 이상\n` +
    `- 맨 마지막 줄: 해시태그 7개 이상 (#키워드1 #키워드2 ...)\n\n` +
    `[블로그 운영 지침]\n` +
    `- 구어체+문어체 중간 톤, 독자에게 직접 말하기 (~해보세요, ~할 수 있어요)\n` +
    `- 비교 분석·장단점·경험적 어조 반드시 포함\n` +
    `- 터미널 명령어는 \`\`\`bash 블록\n` +
    `- 출처 없는 수치 사용 금지\n` +
    `- 영어 직역체 금지, 자연스러운 한국어\n` +
    `- **볼드**, 인용구(>), 불릿(-) 적극 활용\n` +
    `- 금지 표현: "다양한", "중요합니다", "살펴보겠습니다", "마지막으로", "~드립니다"\n` +
    `- 글자수 목표: 2,500자 이상 (최소 2,000자)\n\n` +
    `[포스팅 정보]\n` +
    `- 섹션: ${section.name}\n` +
    `- 제목: ${topic.title}\n` +
    `- 핵심 키워드: ${topic.keyword}\n` +
    `- 글의 관점: ${section.toneHint}\n\n` +
    `[검증된 핵심 인사이트]\n` +
    `${(validated.validated_insights ?? []).join('\n')}\n\n` +
    `[SEO 아웃라인]\n${sectionsText}\n` +
    `내부 링크: [${outline.internal_link?.anchor}](${outline.internal_link?.path})\n\n` +
    `[이미지 삽입 — 반드시 아래 마크다운을 본문에 포함]\n` +
    `1. 도입부 직후: ![${topic.title} 대표 이미지](${topic.slug}-01.webp)\n` +
    `2. 2번째 H2 직후: ![${topic.keyword} 관련 이미지](${topic.slug}-02.webp)\n\n` +
    `마크다운 본문만 출력해줘. front matter 없이.\n맨 마지막 줄에 반드시 #해시태그 7개 이상 포함.`,
    { temperature: 0.7 }
  );

  log('✅', `본문 집필 완료 (${body.length}자)`);
  return body;
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 6: Gemini 단독 SEO 검토 & 수정 루프 (최대 2회)
// ────────────────────────────────────────────────────────────────────────────
async function geminiRefineLoop(topic, outline, draft, maxRounds = 2) {
  log('🔄', '[STEP 6] Gemini SEO 자체 검토 루프 시작...');
  let current = draft;

  for (let round = 1; round <= maxRounds; round++) {
    log('↩️', `  Round ${round}/${maxRounds}: SEO 검토 중...`);

    let review;
    try {
      const raw = await geminiCall(
        `아래 한국어 블로그 포스팅의 SEO 품질을 검토하고 JSON으로만 출력해줘.\n` +
        `핵심 키워드: ${topic.keyword}\n` +
        `기대 H2: ${(outline.sections ?? []).map((s) => s.h2).join(', ')}\n\n` +
        `--- 본문 ---\n${current}\n--- 끝 ---\n\n` +
        `{"score":0-100,"issues":["..."],"pass":true/false}`,
        { temperature: 0.2 }
      );
      const jsonStr = raw.match(/\{[\s\S]*?\}/)?.[0] ?? '{"score":85,"issues":[],"pass":true}';
      review = JSON.parse(jsonStr);
    } catch {
      review = { score: 85, issues: [], pass: true };
    }

    log('📊', `  SEO 점수: ${review.score}/100`);
    if (review.pass || !review.issues?.length) {
      log('✅', `  Round ${round}: 통과 → 루프 종료`);
      break;
    }

    log('✏️', `  이슈 ${review.issues.length}개 반영 중...`);
    current = await geminiCall(
      `아래 SEO 이슈를 반영해 블로그 본문을 개선해줘.\n` +
      `이미지 마크다운과 내부 링크는 반드시 그대로 유지해.\n\n` +
      `[SEO 개선 이슈]\n${review.issues.map((i, n) => `${n + 1}. ${i}`).join('\n')}\n\n` +
      `[현재 본문]\n${current}\n\n개선된 본문만 출력해줘.`,
      { temperature: 0.5 }
    );
    log('✅', `  Round ${round} 완료`);
  }

  return current;
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 7: Gemini 본문 최종 검수 (Claude API 불필요 — Gemini 추가 턴)
// ────────────────────────────────────────────────────────────────────────────
async function claudeFullReviewAndFix(topic, body) {
  // Gemini Turn 4에서 이미 자체 검수 완료 — 추가 턴 불필요 (원본 그대로 반환)
  log('✅', '[STEP 7] 검수 스킵 (Gemini Turn 4 자체검수 완료)');
  return body;
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 8c: 이미지 기본 검수 (파일 크기만 체크 — API 없음)
// ────────────────────────────────────────────────────────────────────────────
async function claudeCheckAndRegenImage(imagePath, postTitle, label, prompt, slug, index, bundleDir, sectionName = '', description = '', _retried = false) {
  if (!fs.existsSync(imagePath)) {
    log('⚠️', `  [이미지 검수] 파일 없음 → 재생성: ${label}`);
    await generateImage(prompt, slug, index, bundleDir);
    if (!_retried) await claudeCheckAndRegenImage(imagePath, postTitle, label, prompt, slug, index, bundleDir, sectionName, description, true);
    return;
  }

  const stat = fs.statSync(imagePath);
  if (stat.size < 15000) {
    log('⚠️', `  [이미지 검수] 파일 너무 작음 (${stat.size}B) → 재생성: ${label}`);
    await generateImage(prompt, slug, index, bundleDir);
    if (!_retried) await claudeCheckAndRegenImage(imagePath, postTitle, label, prompt, slug, index, bundleDir, sectionName, description, true);
    return;
  }

  log('✅', `  [이미지 검수] ${label} — OK (${Math.round(stat.size / 1024)}KB)`);
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 8a: 이미지 위치 맥락 분석 → 연관 프롬프트 생성
// ────────────────────────────────────────────────────────────────────────────
async function generateContextualImagePrompts(section, topic, body) {
  const style = section.imageStyle ??
    'minimalist blog illustration, clean white background, flat design, ultra HD quality, no text overlay';

  // 섹션 스타일의 핵심 첫 구절 (Flux는 프롬프트 앞 단어에 가장 높은 가중치 부여)
  const styleAnchor = style.split(',')[0].trim();

  const matches = [...body.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)].slice(0, 2);
  const clean = (s) => s.replace(/[#*`>_~]/g, '').replace(/\s+/g, ' ').trim();
  const contexts = matches.map((m, i) => {
    const pos    = m.index;
    const before = clean(body.slice(Math.max(0, pos - 500), pos)).slice(-300);
    const after  = clean(body.slice(pos + m[0].length, pos + m[0].length + 300)).slice(0, 200);
    return { idx: i + 1, alt: m[1], before, after };
  });

  // 이미지 없이도 섹션 스타일 앵커를 유지하는 폴백
  if (!contexts.length) {
    return [
      `${style}, ${topic.keyword} introductory concept scene, no text overlay, landscape 16:9`,
      `${style}, ${topic.keyword} comparison analysis visualization, different composition, no text overlay, landscape 16:9`,
      `${style}, ${topic.keyword} editorial cover concept, bold symbolic design, no text overlay, landscape 16:9`,
    ];
  }

  log('🎨', '  Gemini 맥락 기반 이미지 프롬프트 생성 중...');

  const raw = await geminiCall(
    `아래 블로그 글의 이미지 위치에 맞는 영어 이미지 생성 프롬프트 3개를 만들어줘.\n\n` +
    `[섹션] ${section.name} (${section.id})\n` +
    `[글 주제] "${topic.title}" (키워드: ${topic.keyword})\n` +
    `[섹션 스타일 — 모든 프롬프트 반드시 이 구절로 시작]: ${style}\n\n` +
    contexts.map((c) =>
      `[본문 이미지 ${c.idx}]\nalt: ${c.alt}\n앞 내용: ${c.before}\n뒤 내용: ${c.after}`
    ).join('\n\n---\n\n') +
    `\n\n[규칙]\n` +
    `1. 모든 프롬프트를 반드시 섹션 스타일 앵커로 시작: "${styleAnchor}, [구체 묘사]"\n` +
    `2. 앞뒤 내용에서 핵심 장면·개념을 구체적으로 묘사 ("a smartphone showing X", "diagram of Y")\n` +
    `3. 영어 1~2문장, landscape 16:9, 텍스트·워터마크 없음\n` +
    `4. 본문이미지1: 도입 개념형 / 본문이미지2: 비교·분석형 (이미지1과 시각 구도 다르게)\n` +
    `5. 썸네일: ⛔ NO face, NO person, NO woman, NO man, NO portrait, NO human body (절대 금지). 반드시 사물·아이콘·개념·장면·추상 디자인만. 프롬프트에 "no face, no person, no human" 명시 필수.\n` +
    `6. 섹션이 다른 글(경제 글에 건강 이미지 등)과 절대 혼동되지 않아야 함\n\n` +
    `JSON만 출력: {"prompts":["본문이미지1","본문이미지2","썸네일"]}`,
    { temperature: 0.5 }
  );

  try {
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    const result  = JSON.parse(jsonStr);
    const prompts = result.prompts ?? [];
    while (prompts.length < 2) prompts.push(`${style}, ${topic.keyword} concept scene, landscape 16:9`);
    if (prompts.length < 3) prompts.push(`${style}, ${topic.keyword} editorial cover, bold symbolic design, landscape 16:9`);
    log('✅', `  프롬프트 생성 완료 (본문 2장 + 썸네일 1장)`);
    return prompts;
  } catch {
    return [
      `${style}, ${topic.keyword} introductory concept scene, no text overlay, landscape 16:9`,
      `${style}, ${topic.keyword} comparison analysis visualization, different composition, no text overlay, landscape 16:9`,
      `${style}, ${topic.keyword} editorial cover concept, bold symbolic design, no text overlay, landscape 16:9`,
    ];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 8b: Flow(ImageFX) → NanoBanana → Pollinations.ai 순서 이미지 생성
// ────────────────────────────────────────────────────────────────────────────
const FLOW_SESSION_FILE = path.join(__dirname, '..', '.flow-session', 'session.json');

async function generateImage(prompt, slug, index, bundleDir) {
  // index가 'thumb'이면 slug-thumb.webp, 숫자면 slug-01.webp 형태
  const filename = index === 'thumb' ? `${slug}-thumb.webp` : `${slug}-0${index}.webp`;
  const dir = bundleDir ?? IMAGES_DIR;
  const destPath = path.join(dir, filename);
  fs.mkdirSync(dir, { recursive: true });

  // 1) Google Flow (세션 파일 있을 때만 시도)
  const useFlow = process.env.USE_FLOW !== 'false' && fs.existsSync(FLOW_SESSION_FILE);
  if (useFlow) {
    log('🎨', `  Flow 이미지 생성 중: ${filename}`);
    try {
      const { generateFlowImage } = await import('./flow_image_gen.mjs');
      await generateFlowImage(prompt, destPath);
      log('✅', `  Flow 저장: ${filename}`);
      return { localPath: `/images/${filename}`, sourceUrl: 'flow' };
    } catch (err) {
      log('⚠️', `  Flow 실패 (${err.message}) → NanoBanana/Pollinations fallback`);
    }
  }

  // 2) NanoBanana
  const nanoBananaKey = process.env.NANOBANANA_API_KEY;
  const nanoBananaUrl = process.env.NANOBANANA_API_URL ?? 'https://api.nanobanana.io/v1/generate';

  if (nanoBananaKey) {
    log('🍌', `  NanoBanana 이미지 생성 중: ${filename}`);
    try {
      const res = await axios.post(
        nanoBananaUrl,
        { prompt, width: 1280, height: 720, format: 'webp' },
        { headers: { Authorization: `Bearer ${nanoBananaKey}`, 'Content-Type': 'application/json' }, timeout: 90000 }
      );
      const imageUrl = res.data?.url ?? res.data?.image_url ?? res.data?.data?.url;
      if (!imageUrl) throw new Error('응답에 이미지 URL 없음');
      const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
      fs.writeFileSync(destPath, Buffer.from(imgRes.data));
      log('✅', `  NanoBanana 저장: ${filename}`);
      return { localPath: `/images/${filename}`, sourceUrl: imageUrl };
    } catch (err) {
      log('⚠️', `  NanoBanana 실패 (${err.message}) → HuggingFace fallback`);
    }
  }

  // 3) Pollinations.ai (무료, API 키 불필요, 1280×720 직접 생성)
  // enhance=false: AI 프롬프트 재작성 비활성화 — 섹션 스타일 그대로 유지
  const sharpLib = (await import('sharp')).default;
  // 썸네일/본문 모두 얼굴·인물 완전 배제 (Flux는 프롬프트 내 negative 키워드로 억제)
  const qualityPrompt = `${prompt}, highly detailed, sharp focus, 16:9 landscape, no text, no watermark, no logo, no people, no face, no portrait, no human figure, no person`;
  const negativeParam = encodeURIComponent('face,person,woman,man,human,portrait,people,body,nude');

  for (let attempt = 1; attempt <= 2; attempt++) {
    log('🖼️', `  Pollinations.ai 이미지 생성 중: ${filename} (시도 ${attempt}/2)`);
    try {
      const encodedPrompt = encodeURIComponent(qualityPrompt);
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&model=flux&nologo=true&seed=${Date.now()}&negative=${negativeParam}`;
      const imgRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000 });
      if (imgRes.status !== 200) throw new Error(`HTTP ${imgRes.status}`);

      await sharpLib(Buffer.from(imgRes.data))
        .resize(1280, 720, { fit: 'cover', position: 'centre' })
        .webp({ quality: 90, effort: 5 })
        .toFile(destPath);

      const stat = fs.statSync(destPath);
      if (stat.size < 15000) throw new Error(`파일 크기 너무 작음 (${stat.size}B)`);

      log('✅', `  Pollinations.ai 저장: ${filename} (${Math.round(stat.size / 1024)}KB)`);
      return { localPath: `/images/${filename}`, sourceUrl: 'pollinations' };
    } catch (err) {
      log('⚠️', `  Pollinations.ai 시도 ${attempt} 실패: ${err.message}`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 5000));
    }
  }

  log('⚠️', `  이미지 생성 2회 실패 — ${filename} 없이 텍스트만 발행`);
  return { localPath: '', sourceUrl: '' };
}

// ────────────────────────────────────────────────────────────────────────────
// Hugo front matter 조립
// ────────────────────────────────────────────────────────────────────────────
function buildFrontMatter(section, topic, outline, dateOverride) {
  const lc = getLangConfig(section);
  const date = dateOverride ?? new Date().toISOString().split('.')[0] + '+09:00';
  const description = (
    outline.meta_description ||
    topic.description ||
    lc.descFallback(topic.keyword)
  ).slice(0, 160);

  // 중복 제거 및 섹션명·키워드 기반 태그
  const rawTags = [topic.keyword, section.name, ...(topic.tags ?? [])];
  const tags = [...new Set(rawTags.filter(Boolean))].slice(0, 6);

  const thumbUrl = `${topic.slug}-thumb.webp`;
  const coverAlt = lc.coverAlt(topic.title);

  return (
    `---\n` +
    `title: "${topic.title.replace(/"/g, '\\"')}"\n` +
    `date: ${date}\n` +
    `slug: ${topic.slug}\n` +
    `tags: [${tags.map((t) => `"${t}"`).join(', ')}]\n` +
    `categories: ["${section.name}"]\n` +
    `series: ["${section.name}"]\n` +
    `description: "${description.replace(/"/g, '\\"')}"\n` +
    `draft: false\n` +
    `cover:\n` +
    `  image: "${thumbUrl}"\n` +
    `  alt: "${coverAlt}"\n` +
    `  hiddenInSingle: true\n` +
    `---\n\n`
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Git 커밋 & 푸시
// ────────────────────────────────────────────────────────────────────────────
function gitPush(title) {
  log('🚀', '[STEP 8] GitHub 자동 커밋 & 푸시 중...');
  // git add . 대신 content/ 만 스테이징 (스크린샷·temp 파일 실수 커밋 방지)
  execSync('git add content/', { cwd: ROOT, stdio: 'inherit' });
  execSync(`git commit -m "post: ${title}"`, { cwd: ROOT, stdio: 'inherit' });
  execSync('git push', { cwd: ROOT, stdio: 'inherit' });
  log('✅', '푸시 완료');
}

// ────────────────────────────────────────────────────────────────────────────
// 언어별 설정 (한국어 기본 / 일본어 / 영어)
// ────────────────────────────────────────────────────────────────────────────
function getLangConfig(section) {
  const lang = section.language ?? 'ko';
  if (lang === 'ja') return {
    lang: 'ja',
    label: '日本語',
    cultureCenter: '日本',
    koreanLink: '韓国との関係や韓国の視点も自然に織り交ぜる',
    titleMaxLen: '30文字以内',
    titleSeoRules: [
      '- 核心キーワードをタイトルの先頭近くに配置',
      '- 数字（年/ランキング/個数）、疑問形（「〜か？」）、メリット強調（「完全まとめ」「徹底解説」）のいずれか1つ以上',
      '- クリックを誘うキーワード（「本当の」「知られざる」「2026年最新」「完全版」など）',
      '- 30文字以内（Google検索結果の省略防止）',
    ],
    writingInstruction: '⚠️ この記事は全文日本語で執筆すること。韓国語・英語は一切使用禁止。',
    lengthGuide: '1,500〜2,500文字（空白除く）',
    forbiddenExpr: '「さまざまな」「重要です」「見ていきましょう」「最後に」「〜です。〜です。」の単調な繰り返し',
    hashtagNote: '日本語ハッシュタグを7個以上（例：#日本トレンド #2026 #韓国 ...）',
    qualityCheck5: '5. **自然な日本語** — 直訳調の表現を除去、流暢な日本語に修正',
    descFallback: (kw) => `${kw}に関する2026年最新情報とトレンドをご紹介します。`,
    coverAlt: (title) => `${title} サムネイル`,
  };
  if (lang === 'en') return {
    lang: 'en',
    label: 'English',
    cultureCenter: 'Western/global',
    koreanLink: 'Include Korean perspective or connection where naturally relevant',
    titleMaxLen: '60 characters max',
    titleSeoRules: [
      '- Place the main keyword near the beginning of the title',
      '- Include a number, question, or benefit phrase ("Complete Guide", "Top 5", "Why...")',
      '- Use engaging words ("Best", "Hidden", "2026", "Essential", "Ultimate")',
      '- Under 60 characters (prevents truncation in Google search results)',
    ],
    writingInstruction: '⚠️ Write the ENTIRE article in English only. No Korean or Japanese text anywhere.',
    lengthGuide: '1,200~2,000 words',
    forbiddenExpr: '"various", "it\'s important to note", "let\'s look at", "in conclusion", "needless to say"',
    hashtagNote: 'English hashtags 7 or more (e.g.: #GlobalTrends #Korea #2026 ...)',
    qualityCheck5: '5. **Natural English** — Remove awkward phrasing, ensure fluent native-level English',
    descFallback: (kw) => `Explore the latest 2026 trends and insights on ${kw}.`,
    coverAlt: (title) => `${title} thumbnail`,
  };
  return {
    lang: 'ko',
    label: '한국어',
    cultureCenter: '한국',
    koreanLink: '',
    titleMaxLen: '28자 이내',
    titleSeoRules: [
      '- 핵심 키워드를 제목 앞쪽 배치',
      '- 숫자(년도/순위/개수), 의문형("~인가", "~할까"), 이익 강조("완전 정리", "핵심만") 중 1개 이상',
      '- 클릭 유도 감성 단어 포함 ("진짜", "숨은", "바뀌는", "충분한" 등)',
      '- 28자 이내 (구글 검색결과 잘림 방지)',
    ],
    writingInstruction: '',
    lengthGuide: '1,500~2,500자 (공백 제외)',
    forbiddenExpr: '"다양한" "중요합니다" "살펴보겠습니다" "마지막으로" "~드립니다" 영어 직역체',
    hashtagNote: '한국어 해시태그 7개 이상 (예: #키워드1 #키워드2 #키워드3 ...)',
    qualityCheck5: '5. **한국어 자연스러움** — 번역체 표현 제거',
    descFallback: (kw) => `${kw}에 대한 2026년 최신 정보와 트렌드를 알아보세요.`,
    coverAlt: (title) => `${title} 썸네일`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 웹 파이프라인 (브라우저 모드 전용) — 6턴 멀티턴 대화
// ────────────────────────────────────────────────────────────────────────────
async function runWebPipeline(section, dateOverride) {
  const session = _geminiImpl._session; // GeminiSession 객체
  const lc = getLangConfig(section);
  const existing = existingSlugsForSection(section).join(', ') || '없음';
  const subtopicLine = section.subtopics
    ? `오늘 서브토픽: ${section.subtopics[Math.floor(Date.now() / 86400000) % section.subtopics.length]}`
    : '';

  // ── TURN 1: 트렌드 조사 ────────────────────────────────────────────────────
  log('🔍', '[Turn 1] 트렌드 조사 중...');
  session._turnCount = 0; // 새 대화
  const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await session.send(
    `[섹션: ${section.name}] [작성 언어: ${lc.label}] 오늘 날짜: ${todayKst}
${subtopicLine}
${lc.lang !== 'ko' ? `⚠️ 이 섹션은 ${lc.label}로 전체 포스팅을 작성합니다. ${lc.cultureCenter} 중심 주제를 선정하되, ${lc.koreanLink}.` : ''}

구글 검색으로 이 섹션에서 현재 가장 화제가 되는 트렌드 주제를 3개 조사해줘.
각 주제별로: ① 왜 지금 핫한지 ② 독자 관심도 ③ 구글 애드센스 노출 가능성 평가
이미 발행된 슬러그(중복 금지): ${existing}`
  );

  // ── TURN 2: 주제 확정 + 아웃라인 ──────────────────────────────────────────
  log('📐', '[Turn 2] 주제 확정 + 아웃라인...');
  const t2 = await session.send(
    `가장 잠재력 있는 주제 1개를 선택하고, 아래 형식으로 출력해줘.

[JSON 블록]
\`\`\`json
{"title":"${lc.lang === 'ko' ? 'SEO최적화제목(28자이내)' : `Title in ${lc.label} (${lc.titleMaxLen})`}","slug":"english-slug-here","keyword":"${lc.lang === 'ko' ? '핵심키워드' : 'main keyword in ' + lc.label}","description":"description under 160 chars in ${lc.label}"}
\`\`\`

제목 SEO 필수 규칙:
${lc.titleSeoRules.join('\n')}

[SEO 아웃라인]
${lc.lang !== 'ko' ? `⚠️ H2/H3 제목 모두 ${lc.label}로 작성\n` : ''}## H2 섹션 4개, 각 H2 아래 ### H3 2~3개
각 섹션의 톤: 비교분석/장단점/경험담/튜토리얼 중 명시`
  );

  // JSON 파싱 (3단계: 코드블록 → 중첩JSON → 개별 필드 추출 → 재시도 턴)
  let topic = { title: '', slug: '', keyword: '', description: '' };
  let t2Parsed = false;

  const tryParseJson = (text) => {
    // 1) ```json 코드블록
    const m1 = text.match(/```json\s*([\s\S]*?)```/s);
    if (m1) { try { return JSON.parse(m1[1]); } catch {} }
    // 2) 첫 번째 { } 블록 (중첩 포함)
    const start = text.indexOf('{');
    if (start >= 0) {
      let depth = 0, end = -1;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end > start) { try { return JSON.parse(text.slice(start, end + 1)); } catch {} }
    }
    // 3) 개별 필드 추출 (파싱 완전 실패 시 최후 수단)
    const titleM = text.match(/"title"\s*:\s*"([^"]+)"/);
    const slugM  = text.match(/"slug"\s*:\s*"([a-z0-9-]+)"/);
    const kwM    = text.match(/"keyword"\s*:\s*"([^"]+)"/);
    const descM  = text.match(/"description"\s*:\s*"([^"]+)"/);
    if (titleM && slugM) {
      return {
        title: titleM[1], slug: slugM[1],
        keyword: kwM?.[1] ?? '', description: descM?.[1] ?? '',
      };
    }
    return null;
  };

  const parsed = tryParseJson(t2);
  if (parsed?.title && parsed?.slug) {
    topic = { ...topic, ...parsed };
    t2Parsed = true;
  }

  // 파싱 실패 시 재시도 턴
  if (!t2Parsed || !topic.title || !topic.slug) {
    log('⚠️', '[Turn 2] JSON 파싱 실패 → 재시도 중...');
    const t2Retry = await session.send(
      `앞에서 선택한 주제의 JSON 정보만 아래 형식 그대로 출력해줘. 다른 텍스트 없이 JSON 코드 블록만.\n\n` +
      `\`\`\`json\n{"title":"SEO최적화제목(28자이내)","slug":"english-slug-lowercase-hyphens","keyword":"핵심키워드","description":"160자이내설명"}\n\`\`\``
    );
    const retryParsed = tryParseJson(t2Retry);
    if (retryParsed?.title && retryParsed?.slug) {
      topic = { ...topic, ...retryParsed };
      t2Parsed = true;
    }
  }

  if (!t2Parsed || !topic.title || !topic.slug) {
    log('❌', '[Turn 2] JSON 재시도도 실패 — 타임스탬프 슬러그로 대체');
  }

  // 슬러그 중복 방지
  const existing2 = existingSlugsForSection(section);
  if (!topic.slug || existing2.includes(topic.slug)) {
    topic.slug = `${section.dir}-${Date.now()}`;
  }
  if (!topic.title) topic.title = `${section.name} 최신 트렌드`;
  if (!topic.keyword) topic.keyword = section.name;
  if (!topic.description) topic.description = '';

  log('✅', `확정 주제: "${topic.title}" / slug: ${topic.slug}`);

  // 이미지 URL 삽입용 (page bundle — 상대 경로)
  const img1Url = `${topic.slug}-01.webp`;
  const img2Url = `${topic.slug}-02.webp`;

  // ── TURN 3: 본문 집필 ──────────────────────────────────────────────────────
  log('✍️', '[Turn 3] 본문 집필 중...');
  await session.send(
    `${lc.writingInstruction ? lc.writingInstruction + '\n\n' : ''}아웃라인대로 Hugo 마크다운 본문을 작성해줘. front matter 없이.

[Technical SEO 구조 — 100% 준수 필수]
① 도입부 2~3문장: 첫 문단 안에 핵심 키워드 자연스럽게 포함
② 도입부 바로 아래 (빈 줄 없이):
   ![${topic.title}](${img1Url})
③ 헤딩 규칙 — 절대 준수:
   - ## (H2) 4개, 각 H2 아래 ### (H3) 2~3개
   - # (H1) 본문에 절대 금지 (제목이 H1)
   - "1. 제목", "2. 제목" 같은 숫자 번호 방식 금지 — 반드시 ## ### 마크다운 문법만
④ 두 번째 ## 섹션 바로 아래 (빈 줄 없이):
   ![${topic.keyword}](${img2Url})
⑤ 본문 안 적절한 위치에: [관련 글 보기](/posts/${section.dir}/)
⑥ 분량: ${lc.lengthGuide}
⑦ **볼드**, > 인용구, - 불릿 적극 활용 (가독성·체류시간 향상)
⑧ 출처 없는 수치·통계 금지, 구체적 사례 반드시 포함
⑨ 맨 마지막 줄: ${lc.hashtagNote}

[금지 표현]
${lc.forbiddenExpr}`
  );

  // ── TURN 4: 애드센스 품질 자체검토 ───────────────────────────────────────
  log('🔍', '[Turn 4] 애드센스 품질 자체검토 중...');
  await session.send(
    `방금 쓴 글을 다시 읽고, 아래 항목을 모두 점검해서 수정해줘:

1. **AI 냄새** — ${lc.forbiddenExpr} 등 금지 표현 제거
2. **뻔한 문장** — 교과서적이거나 누구나 아는 정보는 더 생생하고 독창적으로
3. **애드센스 위험 요소** — 광고성 표현, 근거 없는 주장, 얕은 정보 수정
4. **이미지 마크다운** — ![...](${img1Url}) 와 ![...](${img2Url}) 두 개 모두 본문에 있는지 확인, 없으면 추가
${lc.qualityCheck5}
6. **헤딩 구조** — ## H2 4개와 ### H3가 올바른 마크다운 문법으로 사용됐는지 확인 (숫자 번호 방식이면 ## 문법으로 교체)
7. **해시태그** — 글 맨 마지막 줄에 ${lc.hashtagNote} 확인, 없으면 반드시 추가

수정 후 어떤 부분을 바꿨는지 2~3줄로 요약해줘.`
  );

  // ── TURN 5: 최종 마크다운 추출 ────────────────────────────────────────────
  log('📝', '[Turn 5] 최종 마크다운 추출 중...');
  const _t5Raw = await session.send(
    `최종 완성된 본문을 반드시 아래 형식의 코드블록으로 출력해줘:

\`\`\`markdown
[완성된 마크다운 본문 전체]
\`\`\`

규칙: 코드블록 안에 마크다운 본문만 넣을 것. front matter 없이. 코드블록 앞뒤로 설명·요약 없이.`
  );
  let finalBody = extractFinalMarkdown(_t5Raw);

  // H2 부족 감지 → 즉시 재추출 (가장 흔한 실패 원인)
  if ((finalBody.match(/^## /gm) ?? []).length < 3) {
    log('⚠️', `[Turn 5] H2 ${(finalBody.match(/^## /gm) ?? []).length}개 감지 → 재출력 요청`);
    const _t5Retry = await session.send(
      `직전에 수정한 최종 마크다운 본문 전체를 아래 코드블록에 그대로 출력해줘.\n` +
      `## H2 헤딩이 반드시 4개 이상 포함되어야 함. front matter 없이.\n\n` +
      `\`\`\`markdown\n[전체 본문]\n\`\`\``
    );
    const retried = extractFinalMarkdown(_t5Retry);
    if ((retried.match(/^## /gm) ?? []).length >= 3) {
      finalBody = retried;
      log('✅', '[Turn 5] 재출력으로 H2 복구 성공');
    } else {
      log('⚠️', `[Turn 5] 재출력도 H2 부족 (${(retried.match(/^## /gm) ?? []).length}개) — 품질 게이트로 최종 판정`);
    }
  }

  // ── TURN 6: 이미지 프롬프트 생성 (본문 2장 + 썸네일 1장) ────────────────
  log('🎨', '[Turn 6] 이미지 프롬프트 생성 중 (본문 2장 + 썸네일)...');
  const t6 = await session.send(
    `글에 삽입된 이미지 2개와 블로그 커버 썸네일 1개를 위한 AI 이미지 생성 프롬프트를 만들어줘.

⚠️ 필수 규칙:
- 프롬프트는 반드시 영어로만 작성. 한국어 한 글자도 포함 금지.
- 모든 이미지: 가로 와이드 landscape 16:9 비율 필수 (세로·정사각형 금지)
- 이미지 스타일: ${section.imageStyle}

이미지별 용도와 내용:
[이미지 1 — 도입부 직후] 글의 첫 번째 주요 개념·현상을 구체적으로 시각화하는 장면.
  → 앞뒤 본문 내용을 파악해서 해당 개념이 실제로 어떻게 보이는지 묘사.
  → "a developer doing X", "diagram showing Y" 처럼 구체적 장면으로.
  → ⚠️ NO FACE, NO PORTRAIT, NO PERSON. Objects, scenes, icons only.
[이미지 2 — 2번째 H2 직후] 비교·분석·데이터 또는 두 번째 핵심 내용을 시각화.
  → 두 가지를 나란히 비교하거나, 차트·흐름도 스타일의 장면.
  → 이미지 1과 시각적으로 명확히 달라야 함 (색감, 구도, 소재 모두 다르게).
  → ⚠️ NO FACE, NO PORTRAIT, NO PERSON.
[썸네일] 글 전체를 한눈에 상징하는 커버 이미지.
  → ⛔ ABSOLUTE PROHIBITION: no face, no person, no woman, no man, no human body, no portrait. ZERO human subjects.
  → ✅ ONLY: objects, icons, symbols, abstract design, scene, landscape, product, concept art.
  → bold colors, no text overlay, 16:9 landscape, strictly no human whatsoever.

JSON만 출력 (prompts 배열은 반드시 3개):
\`\`\`json
{"prompts":["body_image_1_landscape_16:9","body_image_2_landscape_16:9","thumbnail_landscape_16:9"]}
\`\`\``
  );

  const defaultStyle = section.imageStyle ?? 'blog editorial illustration, clean design, professional';
  let imgPrompts = [
    `${topic.keyword} concept visualization, landscape 16:9, ${defaultStyle}, no text overlay, no face, no person, no portrait`,
    `${topic.keyword} comparison analysis chart, landscape 16:9, ${defaultStyle}, no text overlay, no face, no person`,
    `${topic.keyword} editorial magazine cover, bold colors, no text overlay, landscape 16:9, no face, no person, no human, abstract symbolic design`,
  ];
  try {
    const m = t6.match(/```json\s*([\s\S]*?)```/);
    if (m) {
      const p = JSON.parse(m[1]).prompts ?? [];
      if (p.length >= 3) imgPrompts = p;
      else if (p.length >= 2) { imgPrompts[0] = p[0]; imgPrompts[1] = p[1]; }
    }
  } catch {}

  // Claude 완전 검수 & 직접 수정
  const finalValidated = await claudeFullReviewAndFix(topic, finalBody).catch(() => finalBody);

  // Front matter에 필요한 outline 형태 조립
  const outline = { meta_description: topic.description, sections: [], internal_link: { anchor: '관련 글', path: `/posts/${section.dir}/` } };

  return {
    topic:        { ...topic, track: section.dir },
    outline,
    finalBody:    finalValidated,
    imgPrompts,
  };
}

// ── 브라우저 세션에 _session 참조 저장용 래퍼 ─────────────────────────────
export function setGeminiBrowserSession(session) {
  if (session) {
    const callFn = (prompt) => session.send(prompt);
    callFn._session = session;
    _geminiImpl = callFn;
    log('🌐', '브라우저 모드 활성화 (제미나이 웹 Gem)');
  } else {
    _geminiImpl = null;
    log('🔑', 'API 모드 활성화');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 핵심 공개 함수: 특정 섹션에 대해 글 1개 생성·발행
// ────────────────────────────────────────────────────────────────────────────
export async function runForSection(section, options = {}) {
  const {
    subtopic    = null,    // 건강 섹션 서브토픽
    dateOverride = null,   // front matter date 강제 지정
    skipSns     = false,   // SNS 홍보 스킵
  } = options;

  log('📂', `\n${'─'.repeat(50)}`);
  log('📂', `섹션: [${section.name}]`);
  log('📂', `${'─'.repeat(50)}`);

  let topic, outline, final, prompts, validated = null;

  // ── 브라우저 모드: 제미나이 Gem 멀티턴 파이프라인 ──────────────────────────
  if (_geminiImpl?._session) {
    const result = await runWebPipeline(section, dateOverride);
    topic   = result.topic;
    outline = result.outline;
    final   = result.finalBody;
    prompts = result.imgPrompts;

  // ── API 모드: 기존 단계별 파이프라인 ─────────────────────────────────────
  } else {
    const topicObj  = await pickTodayTopic(section, subtopic);         // STEP 1
    topic = topicObj;
    const trendData = await searchTrends(section, topic);              // STEP 2
    validated       = await validateTrends(topic, trendData);          // STEP 3
    outline         = await generateOutline(section, topic, validated); // STEP 4
    const draft     = await writeArticle(section, topic, outline, validated); // STEP 5
    const refined   = await geminiRefineLoop(topic, outline, draft);   // STEP 6
    final           = await validateAndFixMarkdown(refined, topic);    // STEP 7.5 (MD 검증)
    prompts         = await generateContextualImagePrompts(section, topic, final);
    // STEP 7 (Claude 완전 검수)는 이미지 생성 완료 후 실행
  }

  const bundleDir = path.join(POSTS_DIR, section.dir, topic.slug);
  const postPath  = path.join(bundleDir, 'index.md');
  if (fs.existsSync(postPath)) {
    log('⚠️', `이미 존재: ${postPath} → 스킵`);
    return;
  }

  // STEP 8: 이미지 생성 — 본문 2장 + 썸네일 1장 (포스팅 완료 직후 즉시)
  log('🖼️', '[STEP 8] 이미지 생성 중 (본문 2장 + 썸네일 1장)...');
  let img1 = { localPath: '', sourceUrl: '' };
  const imgStyle = section?.imageStyle ?? 'blog editorial illustration, clean design, professional';
  const p1 = prompts[0] ?? `${topic.keyword} concept illustration, ${imgStyle}`;
  const p2 = prompts[1] ?? `${topic.keyword} visual representation, ${imgStyle}`;
  const pThumb = prompts[2] ??
    `${topic.keyword} editorial magazine cover, bold colors, no text overlay, 16:9`;

  // 본문 이미지 1
  try {
    img1 = await generateImage(p1, topic.slug, 1, bundleDir);
  } catch (err) {
    log('⚠️', `  본문 이미지 1 생성 실패 (${err.message})`);
  }
  // 본문 이미지 2
  try {
    await generateImage(p2, topic.slug, 2, bundleDir);
  } catch (err) {
    log('⚠️', `  본문 이미지 2 생성 실패 (${err.message})`);
  }
  // 썸네일
  try {
    await generateImage(pThumb, topic.slug, 'thumb', bundleDir);
    log('✅', `  썸네일 생성 완료`);
  } catch (err) {
    log('⚠️', `  썸네일 생성 실패 (${err.message})`);
  }

  // STEP 8c: Claude 비전으로 각 이미지 검수 → 불합격 시 재생성
  log('🔍', '[STEP 8c] Claude 이미지 품질·주제 적합성 검수...');
  const img1Path    = path.join(bundleDir, `${topic.slug}-01.webp`);
  const img2Path    = path.join(bundleDir, `${topic.slug}-02.webp`);
  const thumbPath   = path.join(bundleDir, `${topic.slug}-thumb.webp`);
  await claudeCheckAndRegenImage(img1Path,   topic.title, '본문 이미지 1', p1,     topic.slug, 1,       bundleDir, section.name, topic.description);
  await claudeCheckAndRegenImage(img2Path,   topic.title, '본문 이미지 2', p2,     topic.slug, 2,       bundleDir, section.name, topic.description);
  await claudeCheckAndRegenImage(thumbPath,  topic.title, '썸네일',       pThumb, topic.slug, 'thumb', bundleDir, section.name, topic.description);

  // STEP 7: Claude 본문 완전 검수 & 직접 수정 (이미지 완료 후)
  const preReviewBody = final;
  final = await claudeFullReviewAndFix(topic, final);
  // 안전장치: 검수 후 H2가 사라진 경우(innerText 렌더링 버그 등) 검수 전 본문 복원
  if ((final.match(/^## /gm) ?? []).length === 0 && (preReviewBody.match(/^## /gm) ?? []).length > 0) {
    log('⚠️', '[STEP 7] 검수 후 H2 소실 감지 → 검수 전 본문으로 복원');
    log('⚠️', `  검수 결과 앞 200자: ${final.slice(0, 200).replace(/\n/g, '↵')}`);
    final = preReviewBody;
  }

  // 품질 게이트: 저장 전 H2 개수 + 분량 확인
  const h2Count  = (final.match(/^## /gm) ?? []).length;
  const charCount = final.replace(/\s/g, '').length;
  if (h2Count < 3) {
    log('❌', `품질 게이트 실패: H2 ${h2Count}개 (최소 3개 필요) → 저장 취소`);
    log('❌', `  본문 앞 300자: ${final.slice(0, 300).replace(/\n/g, '↵')}`);
    throw new Error(`H2 부족 (${h2Count}개): "${topic.title}"`);
  }
  if (charCount < 1200) {
    log('❌', `품질 게이트 실패: 본문 ${charCount}자 (최소 1,200자 필요) → 저장 취소`);
    throw new Error(`분량 부족 (${charCount}자): "${topic.title}"`);
  }
  log('✅', `품질 게이트 통과: H2 ${h2Count}개, ${charCount}자`);

  // 파일 저장
  const fullContent = buildFrontMatter(section, topic, outline, dateOverride) + final;
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(postPath, fullContent, 'utf-8');
  log('✅', `포스팅 저장: ${postPath}`);

  gitPush(topic.title);

  console.log(`\n${'='.repeat(50)}`);
  log('🎉', `"${topic.title}" 배포 성공!`);
  console.log(`${'='.repeat(50)}\n`);

  if (!skipSns) {
    log('📣', '[STEP 9] SNS 자동 홍보 시작...');
    try {
      await promoteAll({
        post:    { ...topic, track: section.dir },
        outline,
        validated,
        imageUrl: img1.sourceUrl,
        deployWaitSec: Number(process.env.SNS_DEPLOY_WAIT_SEC ?? 90),
      });
    } catch (err) {
      log('⚠️', `[STEP 9] SNS 홍보 실패 (포스팅은 정상 발행됨): ${err.message}`);
    }
  }

  return { title: topic.title, slug: topic.slug, sectionDir: section.dir };
}

// ────────────────────────────────────────────────────────────────────────────
// CLI 진입점: node agent_core.js --section <id> [--subtopic <name>]
// ────────────────────────────────────────────────────────────────────────────
async function main() {


  const args      = process.argv.slice(2);
  const sectionIdx = args.indexOf('--section');
  const subtopicIdx = args.indexOf('--subtopic');
  const sectionId  = sectionIdx >= 0 ? args[sectionIdx + 1] : null;
  const subtopic   = subtopicIdx >= 0 ? args[subtopicIdx + 1] : null;

  if (!sectionId) {
    console.error('❌ --section <id> 인자 필요\n예: node agent_core.js --section economy');
    console.log('사용 가능한 섹션:', SECTIONS.map((s) => s.id).join(', '));
    process.exit(1);
  }

  const section = getSectionById(sectionId);
  if (!section) {
    console.error(`❌ 알 수 없는 섹션: ${sectionId}`);
    console.log('사용 가능:', SECTIONS.map((s) => s.id).join(', '));
    process.exit(1);
  }

  try {
    await runForSection(section, { subtopic });
  } catch (err) {
    console.error(`\n❌ 오류: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

// ESM 가드: 직접 실행 시에만 main() 호출 (import 시 실행 방지)
const isMain = process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) main();
