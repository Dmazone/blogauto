#!/usr/bin/env node
/**
 * 자동 포스팅 스크립트
 * CONTENTS_PLAN.md에서 "예정" 항목을 찾아 Claude API로 포스팅 생성 후 GitHub에 푸시
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT, '.env') });

const CONTENTS_PLAN_PATH = path.join(ROOT, 'CONTENTS_PLAN.md');
const CLAUDE_MD_PATH = path.join(ROOT, 'CLAUDE.md');
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const IMAGES_DIR = path.join(ROOT, 'static', 'images');

// ─── 1. CONTENTS_PLAN.md 파싱 ────────────────────────────────────────────────

function findNextPost() {
  const content = fs.readFileSync(CONTENTS_PLAN_PATH, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    // | A-01 | slug | 제목 | 키워드 | 예정 |
    const match = line.match(
      /^\|\s*((?:A|B)-\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*예정\s*\|/
    );
    if (match) {
      const id = match[1].trim();
      const track = id.startsWith('A') ? 'track-a' : 'track-b';
      return {
        id,
        track,
        slug: match[2].trim(),
        title: match[3].trim(),
        keyword: match[4].trim(),
        originalLine: line,
      };
    }
  }
  return null;
}

// ─── 2. CONTENTS_PLAN.md 상태 업데이트 ──────────────────────────────────────

function markAsCompleted(originalLine) {
  const content = fs.readFileSync(CONTENTS_PLAN_PATH, 'utf-8');
  const updated = content.replace(originalLine, originalLine.replace('| 예정 |', '| 완료 |'));
  fs.writeFileSync(CONTENTS_PLAN_PATH, updated, 'utf-8');
}

// ─── 3. Pollinations API로 이미지 다운로드 ──────────────────────────────────

async function downloadImage(prompt, destPath) {
  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1200&height=630&nologo=true&model=flux`;

  console.log(`  이미지 다운로드 중: ${path.basename(destPath)}`);

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status} ${url}`);

  const buffer = await res.arrayBuffer();
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, Buffer.from(buffer));
  console.log(`  ✓ 저장 완료: ${destPath}`);
}

// ─── 4. Claude API로 포스팅 생성 ────────────────────────────────────────────

async function generatePost(post, claudeMd) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const trackLabel = post.track === 'track-a' ? '트랙 A (기초편)' : '트랙 B (활용편)';
  const imageRef1 = `/images/${post.slug}-01.webp`;
  const imageRef2 = `/images/${post.slug}-02.webp`;

  const systemPrompt = `당신은 Claude Code 전문 한국어 기술 블로그 작가입니다.
아래 블로그 운영 규칙을 반드시 따라서 포스팅을 작성하세요.

${claudeMd}`;

  const userPrompt = `다음 조건에 맞는 Hugo 블로그 포스팅 **본문만** 작성해주세요. front matter는 포함하지 마세요.

- 트랙: ${trackLabel}
- 슬러그: ${post.slug}
- 제목: ${post.title}
- 핵심 키워드: ${post.keyword}
- 이미지 경로 (반드시 본문에 삽입):
  - 도입부 직후: ![${post.title} 관련 이미지](${imageRef1})
  - 본문 중간: ![${post.title} 설명 이미지](${imageRef2})

작성 규칙:
1. 도입부(2~3문장): 독자의 문제/궁금증 먼저 언급, 핵심 키워드 포함
2. H2/H3 헤딩으로 본문 구조화 (최소 3개 H2 섹션)
3. 각 섹션 300~500자
4. 터미널 명령어는 \`\`\`bash 블록 사용
5. 마무리 섹션: 핵심 키워드 재언급 + 다음 포스팅 예고
6. 내부 링크 최소 1개 포함 (/posts/ 경로 사용)
7. 구어체와 문어체 중간 톤, 2인칭("~해보세요", "~할 수 있어요")
8. 복잡한 개념은 비유 먼저, 기술 설명 후
9. 영어 직역체 금지, 자연스러운 한국어로 작성

본문만 마크다운으로 출력하세요.`;

  console.log('  Claude API 호출 중...');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  return message.content[0].text;
}

// ─── 5. Hugo front matter 조립 ───────────────────────────────────────────────

function buildFrontMatter(post) {
  const today = new Date().toISOString().split('T')[0];
  const category = post.track === 'track-a' ? '기초편' : '활용편';
  const series = post.track === 'track-a' ? 'Track A — 기초편' : 'Track B — 활용편';

  const descriptionMap = {
    'track-a': `${post.keyword}에 대해 궁금하신가요? ${post.title}을 통해 핵심 개념을 빠르게 이해해보세요.`,
    'track-b': `${post.keyword}를 활용해 Claude Code로 더 강력한 자동화를 구현하는 방법을 알아보세요.`,
  };

  return `---
title: "${post.title}"
date: ${today}
slug: ${post.slug}
tags: ["Claude Code", "${post.keyword}", "${category}"]
categories: ["${category}"]
series: ["${series}"]
description: "${descriptionMap[post.track]}"
draft: false
---

`;
}

// ─── 6. 이미지 프롬프트 생성 ─────────────────────────────────────────────────

function buildImagePrompts(post) {
  const base = `minimalist tech blog illustration, clean white background, soft colors, flat design style, Korean developer theme`;
  return [
    `${post.title}, Claude Code AI terminal interface, ${base}`,
    `${post.keyword} concept visualization, coding workflow, ${base}`,
  ];
}

// ─── 7. Git 커밋 & 푸시 ─────────────────────────────────────────────────────

function gitPush(post) {
  console.log('\n  Git 커밋 & 푸시 중...');
  execSync('git add .', { cwd: ROOT, stdio: 'inherit' });
  execSync(`git commit -m "post: ${post.title}"`, { cwd: ROOT, stdio: 'inherit' });
  execSync('git push', { cwd: ROOT, stdio: 'inherit' });
  console.log('  ✓ 푸시 완료');
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY가 .env 파일에 없습니다.');
    process.exit(1);
  }

  console.log('📋 CONTENTS_PLAN.md 확인 중...');
  const post = findNextPost();
  if (!post) {
    console.log('✅ 예정된 포스팅이 없습니다. 모두 완료되었습니다!');
    process.exit(0);
  }

  console.log(`\n📝 선택된 포스팅: [${post.id}] ${post.title}`);
  console.log(`   슬러그: ${post.slug} | 트랙: ${post.track}`);

  const postDir = path.join(POSTS_DIR, post.track);
  const postPath = path.join(postDir, `${post.slug}.md`);

  if (fs.existsSync(postPath)) {
    console.log(`⚠️  이미 파일이 존재합니다: ${postPath}`);
    console.log('   CONTENTS_PLAN.md 상태만 "완료"로 업데이트합니다.');
    markAsCompleted(post.originalLine);
    process.exit(0);
  }

  // 이미지 생성
  console.log('\n🖼️  이미지 생성 중...');
  const imagePrompts = buildImagePrompts(post);
  await downloadImage(imagePrompts[0], path.join(IMAGES_DIR, `${post.slug}-01.webp`));
  await downloadImage(imagePrompts[1], path.join(IMAGES_DIR, `${post.slug}-02.webp`));

  // 포스팅 생성
  console.log('\n✍️  포스팅 생성 중...');
  const claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');
  const body = await generatePost(post, claudeMd);

  // 파일 저장
  const frontMatter = buildFrontMatter(post);
  fs.mkdirSync(postDir, { recursive: true });
  fs.writeFileSync(postPath, frontMatter + body, 'utf-8');
  console.log(`  ✓ 포스팅 저장: ${postPath}`);

  // CONTENTS_PLAN.md 업데이트
  markAsCompleted(post.originalLine);
  console.log('  ✓ CONTENTS_PLAN.md 상태 업데이트 (예정 → 완료)');

  // Git 푸시
  gitPush(post);

  console.log(`\n🎉 완료! [${post.id}] "${post.title}" 포스팅이 배포되었습니다.`);
  console.log(`   URL: https://dmazone.github.io/blogauto/posts/${post.track}/${post.slug}/`);
}

main().catch((err) => {
  console.error('❌ 오류 발생:', err.message);
  process.exit(1);
});
