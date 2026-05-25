#!/usr/bin/env node
/**
 * save_post.js — Claude Code가 Gemini MCP 세션으로 얻은 본문을 저장·이미지생성·커밋
 *
 * stdin으로 JSON 입력:
 * {
 *   "sectionId": "economy",
 *   "topic":   { "title", "slug", "keyword", "description" },
 *   "outline": { "meta_description", "sections": [], "internal_link": {} },
 *   "body":    "마크다운 본문 (front matter 없이)",
 *   "imgPrompts": ["prompt1", "prompt2", "thumbPrompt"],
 *   "dateOverride": "2026-05-23T07:10:00+09:00"  // optional
 * }
 *
 * 출력 (JSON):
 * { "ok": true, "postPath": "...", "title": "...", "slug": "...", "sectionDir": "..." }
 */

import { getSectionById } from './sections.js';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const claude    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const POSTS_DIR  = path.join(ROOT, 'content', 'posts');
const IMAGES_DIR = path.join(ROOT, 'static', 'images');
const BASE_URL   = (process.env.BLOG_BASE_URL ?? '').replace(/\/$/, '');
const FLOW_SESSION_FILE = path.join(ROOT, '.flow-session', 'session.json');

const log = (e, m) => console.error(`${e}  ${m}`);

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function extractFinalMarkdown(text) {
  const pyMatch = text.match(/content\s*=\s*"""\s*([\s\S]*?)"""/);
  if (pyMatch) return pyMatch[1].trim();
  const mdMatch = text.match(/```(?:markdown|md|plaintext)?\s*([\s\S]*?)```/s);
  if (mdMatch) return mdMatch[1].trim();
  return text.trim();
}

async function withRetry(fn, retries = 3, baseDelay = 10000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try { return await fn(); } catch (err) {
      const msg = err?.message ?? '';
      if ((msg.includes('503') || msg.includes('429')) && attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelay * attempt));
      } else throw err;
    }
  }
}

// ── Front matter 조립 ─────────────────────────────────────────────────────────
function buildFrontMatter(section, topic, outline, dateOverride) {
  const date = dateOverride ?? new Date().toISOString().split('.')[0] + '+09:00';
  const description = (
    outline.meta_description || topic.description ||
    `${topic.keyword}에 대한 2026년 최신 정보와 트렌드를 알아보세요.`
  ).slice(0, 160);
  const rawTags = [topic.keyword, section.name, ...(topic.tags ?? [])];
  const tags = [...new Set(rawTags.filter(Boolean))].slice(0, 6);
  const thumbUrl = `${topic.slug}-thumb.webp`;
  return (
    `---\n` +
    `title: "${topic.title.replace(/"/g, '\\"')}"\n` +
    `date: ${date}\n` +
    `slug: ${topic.slug}\n` +
    `tags: [${tags.map(t => `"${t}"`).join(', ')}]\n` +
    `categories: ["${section.name}"]\n` +
    `series: ["${section.name}"]\n` +
    `description: "${description.replace(/"/g, '\\"')}"\n` +
    `draft: false\n` +
    `cover:\n` +
    `  image: "${thumbUrl}"\n` +
    `  alt: "${topic.title} 썸네일"\n` +
    `  hiddenInSingle: true\n` +
    `---\n\n`
  );
}

// ── 이미지 생성 ───────────────────────────────────────────────────────────────
async function generateImage(prompt, slug, index, bundleDir) {
  const filename = index === 'thumb' ? `${slug}-thumb.webp` : `${slug}-0${index}.webp`;
  const dir = bundleDir ?? IMAGES_DIR;
  const destPath = path.join(dir, filename);
  fs.mkdirSync(dir, { recursive: true });

  const useFlow = process.env.USE_FLOW !== 'false' && fs.existsSync(FLOW_SESSION_FILE);
  if (useFlow) {
    try {
      const { generateFlowImage } = await import('./flow_image_gen.mjs');
      await generateFlowImage(prompt, destPath);
      log('✅', `  Flow 저장: ${filename}`);
      return;
    } catch (err) { log('⚠️', `  Flow 실패 → Pollinations fallback`); }
  }

  const polUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=630&nologo=true&model=flux`;
  await withRetry(async () => {
    const res = await axios.get(polUrl, { responseType: 'arraybuffer', timeout: 150000 });
    fs.writeFileSync(destPath, Buffer.from(res.data));
    log('✅', `  Pollinations 저장: ${filename}`);
  }, 2, 5000);
}

// ── Claude 이미지 검수 ────────────────────────────────────────────────────────
async function checkAndRegenImage(imagePath, title, label, prompt, slug, index, bundleDir) {
  if (!fs.existsSync(imagePath)) return;
  const stat = fs.statSync(imagePath);
  if (stat.size < 15000) { await generateImage(prompt, slug, index, bundleDir); return; }

  try {
    const imageData = fs.readFileSync(imagePath).toString('base64');
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: imageData } },
        { type: 'text', text: `포스팅 주제: "${title}"\n용도: ${label}\nJSON만: {"ok":true/false,"reason":""}` },
      ]}],
    });
    const result = JSON.parse(msg.content[0].text.match(/\{[\s\S]*?\}/)?.[0] ?? '{"ok":true}');
    if (!result.ok) {
      log('⚠️', `  ${label} 불합격 (${result.reason}) → 재생성`);
      await generateImage(prompt, slug, index, bundleDir);
    } else {
      log('✅', `  ${label} 합격`);
    }
  } catch { log('⚠️', `  이미지 검수 오류 → 통과`); }
}

// ── Claude 본문 검수 ──────────────────────────────────────────────────────────
async function claudeReview(topic, body) {
  log('🎯', 'Claude 본문 검수 중...');
  try {
    const msg = await claude.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 8000,
      messages: [{ role: 'user', content:
        `아래 한국어 블로그 포스팅을 검수하고 직접 수정해서 완성본을 출력해줘.\n\n` +
        `[검수 기준]\n` +
        `1. 제목 "${topic.title}" / 키워드 "${topic.keyword}" 내용 일치\n` +
        `2. AI 상투어 제거: "다양한" "중요합니다" "살펴보겠습니다" "마지막으로" "~드립니다"\n` +
        `3. 출처 없는 수치 삭제 → 정성적 설명으로\n` +
        `4. ## H2 4개, ### H3 2~3개, # H1 금지\n` +
        `5. 문단 사이 빈 줄 1개, 연속 2개 이상 금지\n` +
        `6. 최소 1,500자\n\n` +
        `[절대 유지] 이미지 마크다운, 내부 링크, 해시태그\n\n` +
        `마크다운 본문만 출력 (front matter 없이)\n\n--- 본문 ---\n${body}\n--- 끝 ---`,
      }],
    });
    return extractFinalMarkdown(msg.content[0].text.trim());
  } catch (err) {
    log('⚠️', `Claude 검수 실패 (${err.message}) → 원본 사용`);
    return body;
  }
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  let input = '';
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) input += chunk;

  const { sectionId, topic, outline, body, imgPrompts = [], dateOverride } = JSON.parse(input);
  const section = getSectionById(sectionId);
  if (!section) throw new Error(`알 수 없는 섹션: ${sectionId}`);

  const bundleDir = path.join(POSTS_DIR, section.dir, topic.slug);
  const postPath  = path.join(bundleDir, 'index.md');
  if (fs.existsSync(postPath)) {
    log('⚠️', `이미 존재: ${postPath}`);
    console.log(JSON.stringify({ ok: false, reason: 'already_exists', postPath }));
    return;
  }

  // 이미지 생성
  log('🖼️', '이미지 생성 중 (본문 2장 + 썸네일)...');
  const style = section.imageStyle ?? 'minimalist blog illustration, clean background, flat design, ultra HD, no text';
  const p1 = imgPrompts[0] ?? `${topic.title} concept, ${style}`;
  const p2 = imgPrompts[1] ?? `${topic.keyword} visual, ${style}`;
  const pT = imgPrompts[2] ?? `${topic.title} magazine cover thumbnail, bold colors, no text, 16:9`;

  for (const [prompt, idx] of [[p1,1],[p2,2],[pT,'thumb']]) {
    try { await generateImage(prompt, topic.slug, idx, bundleDir); }
    catch (err) { log('⚠️', `이미지 ${idx} 실패: ${err.message}`); }
  }

  // 이미지 검수
  log('🔍', 'Claude 이미지 검수...');
  await checkAndRegenImage(path.join(bundleDir,`${topic.slug}-01.webp`), topic.title,'본문1',p1,topic.slug,1,bundleDir);
  await checkAndRegenImage(path.join(bundleDir,`${topic.slug}-02.webp`), topic.title,'본문2',p2,topic.slug,2,bundleDir);
  await checkAndRegenImage(path.join(bundleDir,`${topic.slug}-thumb.webp`), topic.title,'썸네일',pT,topic.slug,'thumb',bundleDir);

  // Claude 본문 검수
  const finalBody = await claudeReview(topic, body);

  // 파일 저장
  const fullContent = buildFrontMatter(section, topic, outline, dateOverride) + finalBody;
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(postPath, fullContent, 'utf-8');
  log('✅', `저장: ${postPath}`);

  // Git 커밋 & 푸시
  log('🚀', 'Git 커밋 & 푸시...');
  execSync('git add .', { cwd: ROOT, stdio: 'inherit' });
  execSync(`git commit -m "post: ${topic.title}"`, { cwd: ROOT, stdio: 'inherit' });
  execSync('git push', { cwd: ROOT, stdio: 'inherit' });
  log('✅', '푸시 완료');

  console.log(JSON.stringify({ ok: true, postPath, title: topic.title, slug: topic.slug, sectionDir: section.dir }));
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
