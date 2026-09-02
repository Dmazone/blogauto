#!/usr/bin/env node
/**
 * fix_short_posts.mjs — 분량 부족 포스팅 Gemini 확장 재집필
 *
 * 사용: node scripts/fix_short_posts.mjs [--limit N] [--min-chars N]
 *   --limit N       : 최대 N개 처리 (기본 5)
 *   --min-chars N   : N자 미만인 것만 처리 (기본 2500)
 *   --section sec   : 특정 섹션만
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const SECTIONS = [
  'latest-tech','economy','society','humanities','entertainment',
  'japan-trends','health','it-devices','kr-realestate',
  'world-travel','sports','us-trends',
];

const LIMIT     = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '5');
const MIN_CHARS = parseInt(process.argv.find(a => a.startsWith('--min-chars='))?.split('=')[1] ?? '2500');
const ONLY_SEC  = process.argv.find(a => a.startsWith('--section='))?.split('=')[1];
const CUTOFF    = new Date('2026-08-19'); // 최근 14일 이내만

// 대상 수집
function scanShortPosts() {
  const targets = [];
  const secs = ONLY_SEC ? [ONLY_SEC] : SECTIONS;

  for (const sec of secs) {
    const dir = path.join(ROOT, 'content', 'posts', sec);
    if (!fs.existsSync(dir)) continue;
    for (const slug of fs.readdirSync(dir)) {
      const d = path.join(dir, slug);
      if (!fs.statSync(d).isDirectory()) continue;
      const mdPath = path.join(d, 'index.md');
      if (!fs.existsSync(mdPath)) continue;
      const md = fs.readFileSync(mdPath, 'utf8');

      const dateM = md.match(/^date:\s*(.+)/m);
      if (!dateM) continue;
      const postDate = new Date(dateM[1].trim().replace(/['"]/g, ''));
      if (postDate < CUTOFF) continue;

      const bodyStart = md.indexOf('---', 3);
      const body = bodyStart > -1 ? md.slice(bodyStart + 3) : md;
      const charCount = body.replace(/\s+/g, '').length;
      if (charCount >= MIN_CHARS) continue;

      const titleM = md.match(/^title:\s*["']?(.+?)["']?\s*$/m);
      targets.push({ sec, slug, mdPath, md, charCount, title: titleM ? titleM[1].replace(/["']/g, '').trim() : slug });
    }
  }

  targets.sort((a, b) => a.charCount - b.charCount);
  return targets.slice(0, LIMIT);
}

function buildExpandPrompt(sec, title, currentBody) {
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const secName = {
    'latest-tech': '최신기술동향', 'economy': '경제', 'society': '사회',
    'humanities': '인문', 'entertainment': '연예이슈', 'japan-trends': '日本トレンド',
    'health': '건강', 'it-devices': 'IT기기', 'kr-realestate': '한국부동산',
    'world-travel': '세계여행지', 'sports': '스포츠', 'us-trends': 'Global Trends',
  }[sec] || sec;

  return `[오늘 날짜: ${today}] [섹션: ${secName}] [글 제목: ${title}]

아래는 기존에 작성된 블로그 글입니다. **공백 제외 2,500자 이상**이 되도록 내용을 충실히 보강해줘.

## 보강 원칙
- 기존 사실·논조·제목·이미지 마크다운·내부 링크·해시태그는 유지
- 각 H2 섹션마다 300자 이상 + 구체적 사례·수치·날짜 1개 이상 추가
- AI 냄새 완전 제거: "다양한", "중요합니다", "살펴보겠습니다" 금지
- 볼드 강조, 인용구(>), 불릿(-) 적극 활용
- H2 4~6개 유지 (없으면 추가), H3 최소 2개 추가
- 해시태그: 마지막 줄에 #태그 7개 이상 유지

## 기존 본문
\`\`\`markdown
${currentBody.trim()}
\`\`\`

보강된 완성본을 아래 형식으로 출력:
\`\`\`markdown
[보강된 전체 본문]
\`\`\``;
}

function extractMarkdown(text) {
  const m = text.match(/```(?:markdown|md)?\s*([\s\S]*?)```/s);
  return m ? m[1].trim() : text.trim();
}

async function main() {
  const targets = scanShortPosts();
  if (targets.length === 0) {
    console.log('✅ 분량 부족 포스팅 없음 (최근 14일, 2500자 이상)');
    process.exit(0);
  }

  console.log(`\n📋 재집필 대상: ${targets.length}건`);
  targets.forEach((t, i) => console.log(`  [${i+1}] ${t.charCount}자 [${t.sec}] ${t.title}`));
  console.log();

  const gemUrl = process.env.GEMINI_GEM_URL;
  if (!gemUrl) { console.error('❌ GEMINI_GEM_URL 미설정'); process.exit(1); }

  const { GeminiSession } = await import('./gemini_browser.js');
  const session = new GeminiSession({ headless: false, gemUrl });
  await session.init();

  let fixed = 0;
  const failed = [];

  for (let i = 0; i < targets.length; i++) {
    const { sec, slug, mdPath, md, charCount, title } = targets[i];
    console.log(`\n[${i+1}/${targets.length}] ${charCount}자 → [${sec}] ${title.slice(0, 40)}`);

    const bodyStart = md.indexOf('---', 3);
    const frontmatter = bodyStart > -1 ? md.slice(0, bodyStart + 3) : '';
    const body = bodyStart > -1 ? md.slice(bodyStart + 3) : md;

    try {
      await session.newConversation();
      session._turnCount = 0;

      const prompt = buildExpandPrompt(sec, title, body);
      const response = await session.send(prompt, { timeout: 120000 });
      const expanded = extractMarkdown(response);

      const newLen = expanded.replace(/\s+/g, '').length;
      if (newLen < 2000) {
        console.warn(`  ⚠️ 확장 후에도 ${newLen}자 — 재시도`);
        const retryResp = await session.send(
          `글이 아직 부족해. 각 H2 섹션에 최소 2단락 이상 추가해서 2,500자가 되도록 다시 써줘.\n\n\`\`\`markdown 형식으로 출력.`,
          { timeout: 120000 }
        );
        const retried = extractMarkdown(retryResp);
        const retriedLen = retried.replace(/\s+/g, '').length;
        if (retriedLen >= 2000) {
          const newMd = frontmatter + '\n\n' + retried;
          fs.writeFileSync(mdPath, newMd);
          console.log(`  ✅ 재시도 성공: ${charCount}자 → ${retriedLen}자`);
          fixed++;
        } else {
          console.warn(`  ❌ 재시도도 부족 (${retriedLen}자) — 원본 유지`);
          failed.push(`[${sec}] ${slug} (${charCount}자, 확장 실패)`);
        }
      } else {
        const newMd = frontmatter + '\n\n' + expanded;
        fs.writeFileSync(mdPath, newMd);
        console.log(`  ✅ ${charCount}자 → ${newLen}자`);
        fixed++;
      }
    } catch (err) {
      console.error(`  ❌ 오류: ${err.message?.slice(0, 80)}`);
      failed.push(`[${sec}] ${slug}`);
    }

    await new Promise(r => setTimeout(r, 8000));
  }

  await session.close();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 성공: ${fixed} / ❌ 실패: ${failed.length}`);
  if (failed.length) failed.forEach(f => console.log('  ·', f));

  if (fixed > 0) {
    try {
      execSync(
        `git add content/ && git commit -m "fix: 분량 부족 포스팅 ${fixed}건 확장 재집필 (2500자 기준)" --no-verify`,
        { cwd: ROOT, stdio: 'inherit' }
      );
      execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
      console.log('📤 git push 완료');
    } catch (e) {
      console.error('git push 실패:', e.message);
    }
  }

  try {
    const { sendTelegram } = await import('./telegram.js');
    await sendTelegram(`✅ 분량 부족 재집필 완료: ${fixed}건 성공 / ${failed.length}건 실패`);
  } catch {}
}

main().catch(e => { console.error('💥', e); process.exit(1); });
