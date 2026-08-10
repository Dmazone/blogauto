#!/usr/bin/env node
// smart-case-ai-earbuds-trend-2026 단독 재시도 — 추상 개념 프롬프트
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const SLUG = 'smart-case-ai-earbuds-trend-2026';
const SECTION = 'it-devices';
const MIN_KB = 60;

// 이전 시도와 완전히 다른 추상/개념 프롬프트
const PROMPTS = [
  'glowing digital soundwave visualization on dark background, music technology concept, abstract art, no text, 16:9',
  'futuristic wearable device floating with soft blue light glow on dark gradient background, sci-fi tech concept, no text, 16:9',
  'abstract sound frequency spectrum in vibrant colors on black background, technology concept art, no text, 16:9',
];

async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;
  const { execSync } = await import('child_process');

  const gemUrl = process.env.GEMINI_GEM_URL;
  if (!gemUrl) throw new Error('GEMINI_GEM_URL 미설정');

  console.log(`🔄 smart-case 단독 재시도`);
  console.log(`💎 Gem: ${gemUrl}`);

  const bundleDir = path.join(ROOT, 'content', 'posts', SECTION, SLUG);
  const paths = ['-01', '-02', '-thumb'].map(s => path.join(bundleDir, SLUG + s + '.webp'));

  // 기존 별 아이콘 파일 제거
  for (const p of paths) {
    if (fs.existsSync(p) && fs.statSync(p).size < MIN_KB * 1024) {
      fs.unlinkSync(p);
      console.log(`🗑️  삭제: ${path.basename(p)}`);
    }
  }

  const session = new GeminiSession({ headless: false, gemUrl });
  await session.init();

  let success = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`\n--- attempt ${attempt}/3 ---`);
    if (attempt > 1) await new Promise(r => setTimeout(r, 20000));

    await session.newConversation();
    session._turnCount = 1;

    let helloResp = '';
    try {
      helloResp = await session.send('안녕하세요! 이미지를 만들어 주세요.', { timeout: 25000 });
    } catch (e) {
      console.warn(`안녕 실패: ${e.message?.slice(0, 60)}`);
    }
    console.log(`안녕 응답: ${(helloResp || '').length}자`);
    if (!helloResp?.length) await new Promise(r => setTimeout(r, 8000));

    session._turnCount = 0;

    const prompt = `이미지 3장을 만들어주세요:\n\n[1] ${PROMPTS[0]}\n\n[2] ${PROMPTS[1]}\n\n[3] ${PROMPTS[2]}\n\n규칙: 텍스트 없음, 얼굴 없음, 16:9`;
    await session.useImageMaker(prompt);

    const buffers = await session.extractImagesFromLastResponse(1, 30000);
    if (buffers.length === 0) {
      console.warn(`0장 캡처 — 재시도`);
      continue;
    }

    console.log(`${buffers.length}장 캡처, 최대 ${Math.round(Math.max(...buffers.map(b => b.length)) / 1024)}KB`);
    const sorted = [...buffers].sort((a, b) => b.length - a.length);

    let saved = 0;
    for (let i = 0; i < paths.length; i++) {
      const dest = paths[i];
      if (fs.existsSync(dest) && fs.statSync(dest).size >= MIN_KB * 1024) {
        saved++; continue;
      }
      const buf = sorted[i] ?? sorted[0];
      await sharp(buf).resize(1280, 720, { fit: 'cover', position: 'centre' }).webp({ quality: 90 }).toFile(dest);
      const kb = Math.round(fs.statSync(dest).size / 1024);
      if (fs.statSync(dest).size < MIN_KB * 1024) {
        fs.unlinkSync(dest);
        console.warn(`별 아이콘 삭제: ${path.basename(dest)} (${kb}KB)`);
      } else {
        console.log(`저장: ${path.basename(dest)} (${kb}KB)`);
        saved++;
      }
    }

    if (saved > 0) {
      success = true;
      execSync('git add content/', { cwd: ROOT, stdio: 'inherit' });
      execSync(`git commit -m "feat: ${SLUG} 이미지 생성 (final)"`, { cwd: ROOT, stdio: 'inherit' });
      execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
      console.log(`🚀 push 완료`);
      break;
    }
    console.warn(`모두 별 아이콘 — 재시도`);
  }

  await session.close();
  if (!success) {
    console.log(`\n⛔ 최종 실패 — 이미지 없이 발행 유지`);
  } else {
    console.log(`\n✅ 완료`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
