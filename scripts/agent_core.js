#!/usr/bin/env node
/**
 * agent_core.js — AI 블로그 자동화 (Gemini 중심, Claude 최소 토큰)
 *
 * STEP 1: Gemini 2.5 Flash + Google Search  →  2026 실시간 트렌드 수집
 * STEP 2: Gemini                             →  교차 검증 & 인사이트 필터링
 * STEP 3: Gemini                             →  SEO 아웃라인 설계
 * STEP 4: Gemini                             →  본문 전체 집필
 * STEP 5: Gemini 단독 루프 (최대 2회)       →  SEO 자체 검토 & 수정
 * STEP 6: Claude (1회 · max 800 토큰)       →  최종 품질 피드백만
 *          Gemini                            →  피드백 반영 최종본 완성
 * STEP 7: 이미지 생성 + GitHub 자동 푸시
 */

import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { promoteAll } from './sns_promoter.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

// ── 클라이언트 초기화 ────────────────────────────────────────────────────────
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const claude  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONTENTS_PLAN_PATH = path.join(ROOT, 'CONTENTS_PLAN.md');
const CLAUDE_MD_PATH     = path.join(ROOT, 'CLAUDE.md');
const POSTS_DIR          = path.join(ROOT, 'content', 'posts');
const IMAGES_DIR         = path.join(ROOT, 'static', 'images');

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const log = (emoji, msg) => console.log(`${emoji}  ${msg}`);

async function withRetry(fn, retries = 4, baseDelay = 6000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable =
        err?.message?.includes('503') ||
        err?.message?.includes('UNAVAILABLE') ||
        err?.message?.includes('high demand') ||
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED');
      if (retryable && attempt < retries) {
        const delay = baseDelay * attempt;
        log('⏳', `API 과부하 → ${delay / 1000}초 후 재시도 (${attempt}/${retries - 1})...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

// ── CONTENTS_PLAN.md 파싱 ────────────────────────────────────────────────────
function findNextPost() {
  const content = fs.readFileSync(CONTENTS_PLAN_PATH, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(
      /^\|\s*((?:A|B)-\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*예정\s*\|/
    );
    if (m) {
      const id = m[1].trim();
      return {
        id,
        track:    id.startsWith('A') ? 'track-a' : 'track-b',
        slug:     m[2].trim(),
        title:    m[3].trim(),
        keyword:  m[4].trim(),
        originalLine: line,
      };
    }
  }
  return null;
}

function markAsCompleted(originalLine) {
  const content = fs.readFileSync(CONTENTS_PLAN_PATH, 'utf-8');
  fs.writeFileSync(
    CONTENTS_PLAN_PATH,
    content.replace(originalLine, originalLine.replace('| 예정 |', '| 완료 |')),
    'utf-8'
  );
}

// ── Gemini 공통 호출 헬퍼 ────────────────────────────────────────────────────
async function geminiCall(prompt, opts = {}) {
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

// ────────────────────────────────────────────────────────────────────────────
// STEP 1: Gemini + Google Search → 2026 실시간 트렌드 수집
// ────────────────────────────────────────────────────────────────────────────
async function searchTrends(post) {
  log('🔍', `[STEP 1] Gemini Google Search — "${post.keyword}" 2026 트렌드 수집 중...`);

  const response = await withRetry(() =>
    gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        `2026년 현재 기준 "${post.keyword}" 최신 동향·트렌드·실제 사용 사례·주요 업데이트를 ` +
        `한국 IT 개발자 관점에서 구체적으로 조사해줘. ` +
        `Claude Code, AI 자동화 도구와의 연관성도 포함해서 정리해줘.`,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.3,
      },
    })
  );

  const rawText = response.text;
  const sources =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((c) => c.web?.uri)
      .filter(Boolean) ?? [];

  log('✅', `트렌드 수집 완료 (출처 ${sources.length}개)`);
  return { rawText, sources };
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 2: Gemini → 교차 검증 & 인사이트 필터링 (Claude 없음)
// ────────────────────────────────────────────────────────────────────────────
async function validateTrends(post, trendData) {
  log('🔬', '[STEP 2] Gemini 교차 검증 중...');

  const raw = await geminiCall(
    `주제: "${post.keyword}"\n\n` +
    `아래 수집된 트렌드 데이터에서 다음 기준으로 필터링해줘:\n` +
    `1. 2026년 현재 유효한 최신 정보만 남기기 (구식 제거)\n` +
    `2. 추측성·출처 불명 정보 제거\n` +
    `3. 한국 개발자 블로그 독자에게 실용적 가치 있는 것만\n` +
    `4. 중복 통합\n\n` +
    `수집 데이터:\n${trendData.rawText}\n\n` +
    `출력은 반드시 유효한 JSON만:\n` +
    `{\n` +
    `  "validated_insights": ["인사이트1", "인사이트2", ...],\n` +
    `  "key_facts": ["핵심사실1", ...],\n` +
    `  "recommended_angle": "가장 독창적으로 다룰 관점"\n` +
    `}`,
    { temperature: 0.2 }
  );

  try {
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    const result  = JSON.parse(jsonStr);
    log('✅', `교차 검증 완료 (인사이트 ${result.validated_insights?.length ?? 0}개)`);
    return result;
  } catch {
    log('⚠️', '검증 JSON 파싱 실패 → 원문으로 계속');
    return { validated_insights: [raw], key_facts: [], recommended_angle: '' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 3: Gemini → SEO 아웃라인 설계
// ────────────────────────────────────────────────────────────────────────────
async function generateOutline(post, validated) {
  log('📐', '[STEP 3] Gemini SEO 아웃라인 설계 중...');

  const raw = await geminiCall(
    `한국어 기술 블로그 포스팅 SEO 아웃라인을 JSON으로 만들어줘.\n\n` +
    `제목: ${post.title}\n` +
    `핵심 키워드: ${post.keyword}\n` +
    `검증된 인사이트:\n${(validated.validated_insights ?? []).join('\n')}\n` +
    `추천 관점: ${validated.recommended_angle ?? ''}\n\n` +
    `조건:\n` +
    `- 구글 애드센스 고품질 승인 기준 충족\n` +
    `- 비교 분석, 장단점, 경험적 어조(리뷰 형태) 반드시 포함\n` +
    `- H2 섹션 4개, 각 H2 아래 H3 2~3개\n` +
    `- 메타 디스크립션 160자 이내\n` +
    `- 내부 링크 anchor 1개\n\n` +
    `유효한 JSON만 출력:\n` +
    `{\n` +
    `  "meta_description": "...",\n` +
    `  "sections": [\n` +
    `    { "h2": "...", "h3s": ["...", "..."], "tone": "비교분석|장단점|경험담|튜토리얼" }\n` +
    `  ],\n` +
    `  "internal_link": { "anchor": "...", "path": "/posts/" }\n` +
    `}`,
    { temperature: 0.4 }
  );

  try {
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    const outline = JSON.parse(jsonStr);
    log('✅', `아웃라인 완료 (H2 ${outline.sections?.length ?? 0}개)`);
    return outline;
  } catch {
    log('⚠️', '아웃라인 JSON 파싱 실패 → 빈 아웃라인으로 진행');
    return { sections: [], meta_description: '', internal_link: { anchor: '관련 글', path: '/posts/' } };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 4: Gemini → 본문 전체 집필
// ────────────────────────────────────────────────────────────────────────────
async function writeArticle(post, outline, validated) {
  log('✍️', '[STEP 4] Gemini 본문 집필 중...');

  const claudeMd     = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');
  const sectionsText = (outline.sections ?? [])
    .map((s) => `- H2: ${s.h2}\n  - H3: ${s.h3s.join(', ')}\n  - 톤: ${s.tone}`)
    .join('\n');

  const body = await geminiCall(
    `너는 한국어 기술 블로그 전문 작가야. 아래 지침을 100% 지켜서 Hugo 블로그 포스팅 본문(front matter 제외)을 작성해줘.\n\n` +
    `[블로그 운영 지침 요약]\n` +
    `- 구어체+문어체 중간 톤, 2인칭("~해보세요", "~할 수 있어요")\n` +
    `- 비교 분석·장단점·경험적 어조 반드시 포함\n` +
    `- 터미널 명령어는 \`\`\`bash 블록\n` +
    `- 출처 없는 수치 사용 금지\n` +
    `- 영어 직역체 금지, 자연스러운 한국어\n` +
    `- H2/H3 헤딩 적극 활용, 인용구(>), 불릿, 볼드체로 가독성 최대화\n` +
    `- AI 냄새 나는 상투적 표현 금지: "다양한", "중요합니다", "살펴보겠습니다", "마지막으로" 등\n\n` +
    `[포스팅 정보]\n` +
    `- 제목: ${post.title}\n` +
    `- 핵심 키워드: ${post.keyword}\n` +
    `- 트랙: ${post.track === 'track-a' ? '트랙 A (기초편 — 입문자)' : '트랙 B (활용편 — 중급 개발자)'}\n\n` +
    `[검증된 핵심 인사이트]\n` +
    `${(validated.validated_insights ?? []).join('\n')}\n\n` +
    `[SEO 아웃라인]\n${sectionsText}\n` +
    `내부 링크: [${outline.internal_link?.anchor}](${outline.internal_link?.path})\n\n` +
    `[이미지 삽입 — 반드시 아래 마크다운을 본문에 포함]\n` +
    `1. 도입부 직후: ![${post.title} 대표 이미지](${process.env.BLOG_BASE_URL?.replace(/\/$/, '') ?? ''}/images/${post.slug}-01.webp)\n` +
    `2. 2번째 H2 직후: ![${post.keyword} 개념 설명](${process.env.BLOG_BASE_URL?.replace(/\/$/, '') ?? ''}/images/${post.slug}-02.webp)\n\n` +
    `마크다운 본문만 출력해줘. front matter 없이.`,
    { temperature: 0.7 }
  );

  log('✅', `본문 집필 완료 (${body.length}자)`);
  return body;
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 5: Gemini 단독 SEO 검토 & 수정 루프 (최대 2회)
// ────────────────────────────────────────────────────────────────────────────
async function geminiRefineLoop(post, draft, outline, maxRounds = 2) {
  log('🔄', '[STEP 5] Gemini SEO 자체 검토 루프 시작...');
  let current = draft;

  for (let round = 1; round <= maxRounds; round++) {
    log('↩️', `  Round ${round}/${maxRounds}: SEO 검토 중...`);

    let review;
    try {
      const raw = await geminiCall(
        `아래 한국어 블로그 포스팅의 SEO 품질을 검토하고 JSON으로만 출력해줘.\n\n` +
        `핵심 키워드: ${post.keyword}\n` +
        `기대 H2: ${(outline.sections ?? []).map((s) => s.h2).join(', ')}\n\n` +
        `--- 본문 ---\n${current}\n--- 끝 ---\n\n` +
        `{"score": 0-100, "issues": ["개선사항1", ...], "pass": true/false}`,
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

    log('✏️', `  이슈 ${review.issues.length}개 Gemini 자체 반영 중...`);
    current = await geminiCall(
      `아래 SEO 이슈를 반영해 블로그 본문을 개선해줘.\n` +
      `이미지 마크다운과 내부 링크는 반드시 그대로 유지해.\n\n` +
      `[SEO 개선 이슈]\n${review.issues.map((i, n) => `${n + 1}. ${i}`).join('\n')}\n\n` +
      `[현재 본문]\n${current}\n\n` +
      `개선된 본문만 출력해줘.`,
      { temperature: 0.5 }
    );
    log('✅', `  Round ${round} 완료`);
  }

  return current;
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 6: Claude 최종 품질 피드백 (1회 · max 800 토큰)
//         → Gemini가 피드백 반영해 최종본 완성
// ────────────────────────────────────────────────────────────────────────────
async function claudeFinalReviewAndApply(post, body) {
  log('🎯', '[STEP 6] Claude 최종 품질 검토 중 (800 토큰)...');

  let feedback = '';
  try {
    const msg = await claude.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content:
            `아래 한국어 블로그 초안의 문제점을 짧게 번호 목록으로만 나열해줘 (최대 5개).\n` +
            `검토 항목: ① AI 냄새 나는 상투적 표현 ② 어색한 한국어 ③ 애드센스 저품질 위험 요소 ④ 영어 직역체\n` +
            `문제가 없으면 "통과"라고만 써줘.\n\n` +
            `--- 본문 (앞 1500자) ---\n${body.slice(0, 1500)}`,
        },
      ],
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

  log('✏️', '[STEP 6b] Gemini가 Claude 피드백 반영 중...');
  const final = await geminiCall(
    `아래 피드백을 반영해 블로그 본문을 수정해줘.\n` +
    `이미지 마크다운과 내부 링크는 반드시 그대로 유지해.\n\n` +
    `[Claude 피드백]\n${feedback}\n\n` +
    `[현재 본문]\n${body}\n\n` +
    `수정된 본문만 출력해줘.`,
    { temperature: 0.5 }
  );

  log('✅', '최종본 완성');
  return final;
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 7a: 이미지 프롬프트 추출
// ────────────────────────────────────────────────────────────────────────────
function extractImagePrompts(post, body) {
  const h2Titles = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const base = 'minimalist tech blog illustration, clean white background, flat design, Korean developer theme, ultra HD';
  return [
    `${post.title} — Claude Code AI terminal interface glowing blue, futuristic workspace, ${base}`,
    `${post.keyword} concept — ${h2Titles[1] ?? post.keyword} workflow diagram with arrows, ${base}`,
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 7b: NanoBanana API 이미지 생성 (Pollinations fallback)
// ────────────────────────────────────────────────────────────────────────────
async function generateImage(prompt, slug, index) {
  const filename = `${slug}-0${index}.webp`;
  const destPath = path.join(IMAGES_DIR, filename);
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const nanoBananaKey = process.env.NANOBANANA_API_KEY;
  const nanoBananaUrl = process.env.NANOBANANA_API_URL ?? 'https://api.nanobanana.io/v1/generate';

  if (nanoBananaKey) {
    log('🍌', `  NanoBanana 이미지 생성 중: ${filename}`);
    try {
      const res = await axios.post(
        nanoBananaUrl,
        { prompt, width: 1200, height: 630, format: 'webp' },
        {
          headers: { Authorization: `Bearer ${nanoBananaKey}`, 'Content-Type': 'application/json' },
          timeout: 90000,
        }
      );
      const imageUrl = res.data?.url ?? res.data?.image_url ?? res.data?.data?.url;
      if (!imageUrl) throw new Error('응답에 이미지 URL 없음');
      const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
      fs.writeFileSync(destPath, Buffer.from(imgRes.data));
      log('✅', `  NanoBanana 저장 완료: ${filename}`);
      return { localPath: `/images/${filename}`, sourceUrl: imageUrl };
    } catch (err) {
      log('⚠️', `  NanoBanana 실패 (${err.message}) → Pollinations fallback`);
    }
  }

  // Pollinations.ai fallback
  log('🖼️', `  Pollinations fallback: ${filename}`);
  const polUrl =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=1200&height=630&nologo=true&model=flux`;
  const imgRes = await axios.get(polUrl, { responseType: 'arraybuffer', timeout: 90000 });
  fs.writeFileSync(destPath, Buffer.from(imgRes.data));
  log('✅', `  Pollinations 저장 완료: ${filename}`);
  return { localPath: `/images/${filename}`, sourceUrl: polUrl };
}

// ────────────────────────────────────────────────────────────────────────────
// Hugo front matter 조립
// ────────────────────────────────────────────────────────────────────────────
function buildFrontMatter(post, outline) {
  const today       = new Date().toISOString().split('T')[0];
  const category    = post.track === 'track-a' ? '기초편' : '활용편';
  const series      = post.track === 'track-a' ? 'Track A — 기초편' : 'Track B — 활용편';
  const description = (
    outline.meta_description ??
    `${post.keyword}에 대해 2026년 최신 트렌드와 실전 활용법을 알아보세요.`
  ).slice(0, 160);

  return (
    `---\n` +
    `title: "${post.title}"\n` +
    `date: ${today}\n` +
    `slug: ${post.slug}\n` +
    `tags: ["Claude Code", "${post.keyword}", "${category}"]\n` +
    `categories: ["${category}"]\n` +
    `series: ["${series}"]\n` +
    `description: "${description}"\n` +
    `draft: false\n` +
    `---\n\n`
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 7c: Git 커밋 & 푸시
// ────────────────────────────────────────────────────────────────────────────
function gitPush(post) {
  log('🚀', '[STEP 7] GitHub 자동 커밋 & 푸시 중...');
  execSync('git add .', { cwd: ROOT, stdio: 'inherit' });
  execSync(`git commit -m "post: ${post.title}"`, { cwd: ROOT, stdio: 'inherit' });
  execSync('git push', { cwd: ROOT, stdio: 'inherit' });
  log('✅', '푸시 완료');
}

// ────────────────────────────────────────────────────────────────────────────
// 메인
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  const missing = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`❌ 누락된 환경변수: ${missing.join(', ')}`);
    process.exit(1);
  }

  log('📋', 'CONTENTS_PLAN.md 확인 중...');
  const post = findNextPost();
  if (!post) {
    log('✅', '예정된 포스팅이 없습니다. 모두 완료!');
    process.exit(0);
  }

  log('📝', `선택된 포스팅: [${post.id}] ${post.title}`);
  log('📂', `슬러그: ${post.slug} | 트랙: ${post.track} | 키워드: ${post.keyword}`);

  const postPath = path.join(POSTS_DIR, post.track, `${post.slug}.md`);
  if (fs.existsSync(postPath)) {
    log('⚠️', '이미 존재하는 파일 → CONTENTS_PLAN만 완료로 업데이트');
    markAsCompleted(post.originalLine);
    process.exit(0);
  }

  try {
    const trendData  = await searchTrends(post);           // STEP 1
    const validated  = await validateTrends(post, trendData); // STEP 2
    const outline    = await generateOutline(post, validated); // STEP 3
    const draft      = await writeArticle(post, outline, validated); // STEP 4
    const refined    = await geminiRefineLoop(post, draft, outline); // STEP 5
    const final      = await claudeFinalReviewAndApply(post, refined); // STEP 6

    // STEP 7 — 이미지 생성
    log('🖼️', '[STEP 7] 이미지 생성 중...');
    const prompts   = extractImagePrompts(post, final);
    const img1      = await generateImage(prompts[0], post.slug, 1);
    await generateImage(prompts[1], post.slug, 2);

    // 파일 저장
    const fullContent = buildFrontMatter(post, outline) + final;
    fs.mkdirSync(path.dirname(postPath), { recursive: true });
    fs.writeFileSync(postPath, fullContent, 'utf-8');
    log('✅', `포스팅 저장: ${postPath}`);

    markAsCompleted(post.originalLine);
    log('✅', 'CONTENTS_PLAN.md 업데이트 완료 (예정 → 완료)');

    gitPush(post);

    console.log('\n' + '─'.repeat(60));
    log('🎉', `완료! [${post.id}] "${post.title}" 배포 성공`);
    console.log('─'.repeat(60));

    // STEP 8 — SNS 자동 홍보
    log('📣', '[STEP 8] SNS 자동 홍보 시작...');
    await promoteAll({
      post,
      outline,
      validated,
      imageUrl: img1.sourceUrl,
      deployWaitSec: Number(process.env.SNS_DEPLOY_WAIT_SEC ?? 90),
    });
  } catch (err) {
    console.error(`\n❌ 오류 발생: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();
