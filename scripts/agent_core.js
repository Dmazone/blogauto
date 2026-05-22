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

import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
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

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? 'placeholder' });
const claude  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const POSTS_DIR  = path.join(ROOT, 'content', 'posts');
const IMAGES_DIR = path.join(ROOT, 'static', 'images');
const BASE_URL   = (process.env.BLOG_BASE_URL ?? '').replace(/\/$/, '');

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const log = (emoji, msg) => console.log(`${emoji}  ${msg}`);

/** Gemini가 Python/코드블록으로 응답을 감쌀 때 마크다운 본문만 추출 */
function extractFinalMarkdown(text) {
  // Python: content = """---\n...\n---\n..."""
  const pyMatch = text.match(/content\s*=\s*"""\s*([\s\S]*?)"""/);
  if (pyMatch) return pyMatch[1].trim();
  // ```markdown / ```md / ``` 코드블록
  const mdMatch = text.match(/```(?:markdown|md|plaintext)?\s*([\s\S]*?)```/s);
  if (mdMatch) return mdMatch[1].trim();
  return text.trim();
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
  // 브라우저 모드: 제미나이 웹 UI 사용
  if (_geminiImpl) {
    return await withRetry(() => _geminiImpl(prompt), 3, 5000);
  }
  // API 모드: Gemini API 직접 호출
  const response = await withRetry(() =>
    gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: opts.temperature ?? 0.5,
        ...(opts.tools ? { tools: opts.tools } : {}),
      },
    })
  );
  return response.text;
}

/** 해당 섹션에 이미 존재하는 슬러그 목록 */
function existingSlugsForSection(section) {
  const dir = path.join(POSTS_DIR, section.dir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== '_index.md')
    .map((f) => f.replace(/\.md$/, ''));
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 1: Gemini → 오늘의 토픽 자동 선정
// ────────────────────────────────────────────────────────────────────────────
async function pickTodayTopic(section, subtopic) {
  log('💡', `[STEP 1] "${section.name}" 오늘의 토픽 선정 중...`);

  const existing = existingSlugsForSection(section);
  const subtopicHint = subtopic ? `서브토픽: ${subtopic} (오늘은 이 주제로 한정해서 선정)` : '';
  const avoidList = existing.length
    ? `\n이미 발행된 슬러그(중복 금지): ${existing.join(', ')}`
    : '';

  const raw = await geminiCall(
    `한국어 블로그 "${section.name}" 섹션의 오늘(2026-05-21) 포스팅 주제를 1개 선정해줘.\n\n` +
    `섹션 컨텍스트: ${section.searchContext}\n` +
    `${subtopicHint}${avoidList}\n\n` +
    `조건:\n` +
    `- 2026년 현재 가장 화제가 되는 최신 이슈 또는 독자가 궁금해할 주제\n` +
    `- 구글 SEO 검색 트래픽이 높을 만한 롱테일 키워드 포함\n` +
    `- 제목은 한국어 30자 이내, 클릭하고 싶게\n` +
    `- slug는 영어 소문자 + 하이픈, 5단어 이내\n\n` +
    `유효한 JSON만 출력:\n` +
    `{"title": "...", "keyword": "...", "slug": "..."}`,
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

  if (_geminiImpl) {
    // 브라우저 모드: 제미나이 웹이 자동으로 구글 검색 수행
    rawText = await withRetry(() => _geminiImpl(searchPrompt), 3, 5000);
  } else {
    // API 모드: Google Search 도구 명시
    const response = await withRetry(() =>
      gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: searchPrompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.3 },
      })
    );
    rawText  = response.text;
    sources  = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((c) => c.web?.uri).filter(Boolean) ?? [];
  }

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
    `- H2 섹션 4개, 각 H2 아래 H3 2~3개\n` +
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
    `- 헤딩: ## (H2) 4개, 각 H2 아래 ### (H3) 2~3개 — # (H1) 본문 금지, 숫자 번호 방식 금지\n` +
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
    `- 글자수 목표: 1,500~2,500자\n\n` +
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
    `1. 도입부 직후: ![${topic.title} 대표 이미지](${BASE_URL}/images/${topic.slug}-01.webp)\n` +
    `2. 2번째 H2 직후: ![${topic.keyword} 관련 이미지](${BASE_URL}/images/${topic.slug}-02.webp)\n\n` +
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
// STEP 7: Claude 최종 품질 피드백 (1회 · max 800 토큰)
// ────────────────────────────────────────────────────────────────────────────
async function claudeFinalReviewAndApply(topic, body) {
  log('🎯', '[STEP 7] Claude 최종 품질 검토 중 (800 토큰)...');

  let feedback = '';
  try {
    const msg = await claude.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content:
          `아래 한국어 블로그 초안의 문제점을 짧게 번호 목록으로만 나열해줘 (최대 5개).\n` +
          `검토 항목: ① AI 냄새 나는 상투적 표현 ② 어색한 한국어 ③ 애드센스 저품질 위험 요소 ④ 영어 직역체\n` +
          `문제가 없으면 "통과"라고만 써줘.\n\n` +
          `--- 본문 (앞 1500자) ---\n${body.slice(0, 1500)}`,
      }],
    });
    feedback = msg.content[0].text.trim();
    log('✅', `Claude 피드백: ${feedback.slice(0, 60)}...`);
  } catch (err) {
    log('⚠️', `Claude 검토 실패 (${err.message}) → Gemini 단독 최종본 사용`);
    return body;
  }

  if (feedback === '통과' || feedback.startsWith('통과')) {
    log('✅', 'Claude: 통과 → 수정 없이 최종본 확정');
    return body;
  }

  log('✏️', '[STEP 7b] Gemini가 Claude 피드백 반영 중...');
  const final = extractFinalMarkdown(await geminiCall(
    `아래 피드백을 반영해 블로그 본문을 수정해줘.\n` +
    `이미지 마크다운과 내부 링크는 반드시 그대로 유지해.\n\n` +
    `[Claude 피드백]\n${feedback}\n\n` +
    `[현재 본문]\n${body}\n\n수정된 본문만 출력해줘.`,
    { temperature: 0.5 }
  ));

  log('✅', '최종본 완성');
  return final;
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 8a: 이미지 위치 맥락 분석 → 연관 프롬프트 생성
// ────────────────────────────────────────────────────────────────────────────
async function generateContextualImagePrompts(section, topic, body) {
  const style = section.imageStyle ??
    'minimalist blog illustration, clean white background, flat design, ultra HD quality, no text overlay';

  const matches = [...body.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)].slice(0, 2);
  const clean = (s) => s.replace(/[#*`>_~]/g, '').replace(/\s+/g, ' ').trim();
  const contexts = matches.map((m, i) => {
    const pos    = m.index;
    const before = clean(body.slice(Math.max(0, pos - 500), pos)).slice(-300);
    const after  = clean(body.slice(pos + m[0].length, pos + m[0].length + 300)).slice(0, 200);
    return { idx: i + 1, alt: m[1], before, after };
  });

  if (!contexts.length) {
    return [
      `${topic.title} concept illustration, ${style}`,
      `${topic.keyword} visual representation, ${style}`,
    ];
  }

  log('🎨', '  Gemini 맥락 기반 이미지 프롬프트 생성 중...');

  const raw = await geminiCall(
    `아래 블로그 글의 이미지 삽입 위치 앞뒤 내용을 분석해서, 각 위치에 딱 맞는 구체적인 이미지 생성 프롬프트를 영어로 만들어줘.\n\n` +
    `블로그 주제: "${topic.title}" (키워드: ${topic.keyword})\n` +
    `이미지 스타일 고정: ${style}\n\n` +
    contexts.map((c) =>
      `[이미지 ${c.idx}]\nalt: ${c.alt}\n앞 내용: ${c.before}\n뒤 내용: ${c.after}`
    ).join('\n\n---\n\n') +
    `\n\n[조건]\n` +
    `- 앞뒤 내용에서 핵심 개념·장면을 파악해 구체적으로 묘사\n` +
    `- "a developer doing X", "diagram showing Y" 처럼 구체적으로\n` +
    `- 각 프롬프트는 영어 1~2문장\n\n` +
    `JSON만: {"prompts":["프롬프트1","프롬프트2"]}`,
    { temperature: 0.6 }
  );

  try {
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    const result  = JSON.parse(jsonStr);
    const prompts = result.prompts ?? [];
    while (prompts.length < 2) prompts.push(`${topic.keyword} concept, ${style}`);
    log('✅', `  프롬프트 생성 완료 (${prompts.length}개)`);
    return prompts;
  } catch {
    return [
      `${topic.title} concept illustration, ${style}`,
      `${topic.keyword} visual representation, ${style}`,
    ];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 8b: Flow(ImageFX) → NanoBanana → Pollinations 순서 이미지 생성
// ────────────────────────────────────────────────────────────────────────────
const FLOW_SESSION_FILE = path.join(__dirname, '..', '.flow-session', 'session.json');

async function generateImage(prompt, slug, index) {
  const filename = `${slug}-0${index}.webp`;
  const destPath = path.join(IMAGES_DIR, filename);
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

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
        { prompt, width: 1200, height: 630, format: 'webp' },
        { headers: { Authorization: `Bearer ${nanoBananaKey}`, 'Content-Type': 'application/json' }, timeout: 90000 }
      );
      const imageUrl = res.data?.url ?? res.data?.image_url ?? res.data?.data?.url;
      if (!imageUrl) throw new Error('응답에 이미지 URL 없음');
      const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
      fs.writeFileSync(destPath, Buffer.from(imgRes.data));
      log('✅', `  NanoBanana 저장: ${filename}`);
      return { localPath: `/images/${filename}`, sourceUrl: imageUrl };
    } catch (err) {
      log('⚠️', `  NanoBanana 실패 (${err.message}) → Pollinations fallback`);
    }
  }

  // 3) Pollinations.ai fallback (타임아웃 150초, 최대 2회 재시도)
  log('🖼️', `  Pollinations fallback: ${filename}`);
  const polUrl =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=1200&height=630&nologo=true&model=flux`;

  return await withRetry(async () => {
    const imgRes = await axios.get(polUrl, { responseType: 'arraybuffer', timeout: 150000 });
    fs.writeFileSync(destPath, Buffer.from(imgRes.data));
    log('✅', `  Pollinations 저장: ${filename}`);
    return { localPath: `/images/${filename}`, sourceUrl: polUrl };
  }, 2, 5000);
}

// ────────────────────────────────────────────────────────────────────────────
// Hugo front matter 조립
// ────────────────────────────────────────────────────────────────────────────
function buildFrontMatter(section, topic, outline, dateOverride) {
  const date = dateOverride ?? new Date().toISOString().split('.')[0] + '+09:00';
  const description = (
    outline.meta_description ||
    topic.description ||
    `${topic.keyword}에 대한 2026년 최신 정보와 트렌드를 알아보세요.`
  ).slice(0, 160);

  // 중복 제거 및 섹션명·키워드 기반 태그
  const rawTags = [topic.keyword, section.name, ...(topic.tags ?? [])];
  const tags = [...new Set(rawTags.filter(Boolean))].slice(0, 6);

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
    `---\n\n`
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Git 커밋 & 푸시
// ────────────────────────────────────────────────────────────────────────────
function gitPush(title) {
  log('🚀', '[STEP 8] GitHub 자동 커밋 & 푸시 중...');
  execSync('git add .', { cwd: ROOT, stdio: 'inherit' });
  execSync(`git commit -m "post: ${title}"`, { cwd: ROOT, stdio: 'inherit' });
  execSync('git push', { cwd: ROOT, stdio: 'inherit' });
  log('✅', '푸시 완료');
}

// ────────────────────────────────────────────────────────────────────────────
// 웹 파이프라인 (브라우저 모드 전용) — 6턴 멀티턴 대화
// ────────────────────────────────────────────────────────────────────────────
async function runWebPipeline(section, dateOverride) {
  const session = _geminiImpl._session; // GeminiSession 객체
  const existing = existingSlugsForSection(section).join(', ') || '없음';
  const subtopicLine = section.subtopics
    ? `오늘 서브토픽: ${section.subtopics[Math.floor(Date.now() / 86400000) % section.subtopics.length]}`
    : '';

  // ── TURN 1: 트렌드 조사 ────────────────────────────────────────────────────
  log('🔍', '[Turn 1] 트렌드 조사 중...');
  session._turnCount = 0; // 새 대화
  await session.send(
    `[섹션: ${section.name}] 오늘 날짜: 2026-05-21
${subtopicLine}

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
{"title":"제목(30자이내)","slug":"english-slug-here","keyword":"핵심키워드","description":"메타설명 160자이내"}
\`\`\`

[SEO 아웃라인]
## H2 섹션 4개, 각 H2 아래 ### H3 2~3개
각 섹션의 톤: 비교분석/장단점/경험담/튜토리얼 중 명시`
  );

  // JSON 파싱
  let topic = { title: '', slug: '', keyword: '', description: '' };
  try {
    const m = t2.match(/```json\s*([\s\S]*?)```/);
    if (m) topic = { ...topic, ...JSON.parse(m[1]) };
  } catch {}

  // 슬러그 중복 방지
  const existing2 = existingSlugsForSection(section);
  if (!topic.slug || existing2.includes(topic.slug)) {
    topic.slug = `${section.dir}-${Date.now()}`;
  }
  if (!topic.title) topic.title = `${section.name} 트렌드 분석`;
  if (!topic.keyword) topic.keyword = section.name;

  log('✅', `확정 주제: "${topic.title}" / slug: ${topic.slug}`);

  // 이미지 URL 삽입용
  const img1Url = `${BASE_URL}/images/${topic.slug}-01.webp`;
  const img2Url = `${BASE_URL}/images/${topic.slug}-02.webp`;

  // ── TURN 3: 본문 집필 ──────────────────────────────────────────────────────
  log('✍️', '[Turn 3] 본문 집필 중...');
  await session.send(
    `아웃라인대로 Hugo 마크다운 본문을 작성해줘. front matter 없이.

[Technical SEO 구조 — 100% 준수 필수]
① 도입부 2~3문장: 첫 문단 안에 핵심 키워드 자연스럽게 포함
② 도입부 바로 아래 (빈 줄 없이):
   ![${topic.title} 대표이미지](${img1Url})
③ 헤딩 규칙 — 절대 준수:
   - ## (H2) 4개, 각 H2 아래 ### (H3) 2~3개
   - # (H1) 본문에 절대 금지 (제목이 H1)
   - "1. 제목", "2. 제목" 같은 숫자 번호 방식 금지 — 반드시 ## ### 마크다운 문법만
④ 두 번째 ## 섹션 바로 아래 (빈 줄 없이):
   ![${topic.keyword} 관련이미지](${img2Url})
⑤ 본문 안 적절한 위치에: [관련 글 보기](/posts/${section.dir}/)
⑥ 분량: 1,500~2,500자 (공백 제외)
⑦ **볼드**, > 인용구, - 불릿 적극 활용 (가독성·체류시간 향상)
⑧ 출처 없는 수치·통계 금지, 구체적 사례 반드시 포함
⑨ 맨 마지막 줄: 해시태그 7개 이상 (예: #키워드1 #키워드2 #키워드3 ...)

[금지 표현]
"다양한" "중요합니다" "살펴보겠습니다" "마지막으로" "~드립니다" 영어 직역체`
  );

  // ── TURN 4: 애드센스 품질 자체검토 ───────────────────────────────────────
  log('🔍', '[Turn 4] 애드센스 품질 자체검토 중...');
  await session.send(
    `방금 쓴 글을 다시 읽고, 아래 항목을 모두 점검해서 수정해줘:

1. **AI 냄새** — "다양한", "중요합니다", "살펴보겠습니다", "마지막으로" 등 금지 표현 제거
2. **뻔한 문장** — 교과서적이거나 누구나 아는 정보는 더 생생하고 독창적으로
3. **애드센스 위험 요소** — 광고성 표현, 근거 없는 주장, 얕은 정보 수정
4. **이미지 마크다운** — ![...](${img1Url}) 와 ![...](${img2Url}) 두 개 모두 본문에 있는지 확인, 없으면 추가
5. **한국어 자연스러움** — 번역체 표현 제거
6. **헤딩 구조** — ## H2 4개와 ### H3가 올바른 마크다운 문법으로 사용됐는지 확인 (숫자 번호 방식이면 ## 문법으로 교체)
7. **해시태그** — 글 맨 마지막 줄에 #태그 7개 이상 있는지 확인, 없으면 반드시 추가

수정 후 어떤 부분을 바꿨는지 2~3줄로 요약해줘.`
  );

  // ── TURN 5: 최종 마크다운 추출 ────────────────────────────────────────────
  log('📝', '[Turn 5] 최종 마크다운 추출 중...');
  const _t5Raw = await session.send(
    `최종 완성된 본문을 마크다운 형식으로만 출력해줘.
추가 설명·요약·앞말 없이 마크다운 본문 코드만. front matter 없이.`
  );
  const finalBody = extractFinalMarkdown(_t5Raw);

  // ── TURN 6: 이미지 프롬프트 생성 ─────────────────────────────────────────
  log('🎨', '[Turn 6] 이미지 프롬프트 생성 중...');
  const t6 = await session.send(
    `글에 삽입된 이미지 2개를 위한 AI 이미지 생성 프롬프트를 영어로 만들어줘.

이미지 스타일 고정: ${section.imageStyle}
각 이미지 삽입 위치의 앞뒤 글 내용을 참고해서 구체적 장면을 묘사해.
"a developer doing X", "diagram showing Y" 처럼 구체적으로.

JSON만 출력:
\`\`\`json
{"prompts":["프롬프트1","프롬프트2"]}
\`\`\``
  );

  let imgPrompts = [`${topic.title} concept, ${section.imageStyle}`, `${topic.keyword} visual, ${section.imageStyle}`];
  try {
    const m = t6.match(/```json\s*([\s\S]*?)```/);
    if (m) {
      const p = JSON.parse(m[1]).prompts ?? [];
      if (p.length >= 2) imgPrompts = p;
    }
  } catch {}

  // Claude 최종 검토 (선택)
  const finalValidated = await claudeFinalReviewAndApply(topic, finalBody).catch(() => finalBody);

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
    const topicObj  = await pickTodayTopic(section, subtopic);    // STEP 1
    topic = topicObj;
    const trendData = await searchTrends(section, topic);          // STEP 2
    validated       = await validateTrends(topic, trendData);      // STEP 3
    outline         = await generateOutline(section, topic, validated); // STEP 4
    const draft     = await writeArticle(section, topic, outline, validated); // STEP 5
    const refined   = await geminiRefineLoop(topic, outline, draft);    // STEP 6
    final           = await claudeFinalReviewAndApply(topic, refined);  // STEP 7
    prompts         = await generateContextualImagePrompts(section, topic, final);
  }

  const postPath = path.join(POSTS_DIR, section.dir, `${topic.slug}.md`);
  if (fs.existsSync(postPath)) {
    log('⚠️', `이미 존재: ${postPath} → 스킵`);
    return;
  }

  // 이미지 생성 (실패해도 글 저장은 계속)
  log('🖼️', '이미지 생성 중...');
  let img1 = { localPath: '', sourceUrl: '' };
  try {
    img1 = await generateImage(prompts[0], topic.slug, 1);
  } catch (err) {
    log('⚠️', `  이미지 1 생성 실패 (${err.message}) → 스킵`);
  }
  try {
    await generateImage(prompts[1], topic.slug, 2);
  } catch (err) {
    log('⚠️', `  이미지 2 생성 실패 (${err.message}) → 스킵`);
  }

  // 파일 저장
  const fullContent = buildFrontMatter(section, topic, outline, dateOverride) + final;
  fs.mkdirSync(path.dirname(postPath), { recursive: true });
  fs.writeFileSync(postPath, fullContent, 'utf-8');
  log('✅', `포스팅 저장: ${postPath}`);

  gitPush(topic.title);

  console.log(`\n${'='.repeat(50)}`);
  log('🎉', `"${topic.title}" 배포 성공!`);
  console.log(`${'='.repeat(50)}\n`);

  if (!skipSns) {
    log('📣', '[STEP 9] SNS 자동 홍보 시작...');
    await promoteAll({
      post:    { ...topic, track: section.dir },
      outline,
      validated,
      imageUrl: img1.sourceUrl,
      deployWaitSec: Number(process.env.SNS_DEPLOY_WAIT_SEC ?? 90),
    });
  }

  return { title: topic.title, slug: topic.slug, sectionDir: section.dir };
}

// ────────────────────────────────────────────────────────────────────────────
// CLI 진입점: node agent_core.js --section <id> [--subtopic <name>]
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  const missing = ['GEMINI_API_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`❌ 누락된 환경변수: ${missing.join(', ')}`);
    process.exit(1);
  }

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
