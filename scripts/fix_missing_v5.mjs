#!/usr/bin/env node
/**
 * fix_missing_v5.mjs — 4개 최종 잔여 포스팅
 *
 * v4 개선:
 * 1. '안녕' 타임아웃 25초로 연장
 * 2. 응답 0자이면 재시도 전 추가 대기
 * 3. 프롬프트를 더 단순·추상적으로 교체
 * 4. mountain-vibes: thumb만 필요 (01·02 이미 정상)
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const MIN_OUTPUT_KB = 60;

const TARGETS = [
  {
    slug: 'mountain-vibes-alpine-summer-escape-2026',
    section: 'world-travel',
    // thumb만 필요: 단순한 풍경 프롬프트
    p1: 'bright summer alpine meadow with colorful wildflowers and distant mountain peaks, wide landscape, golden sunlight, no people, no text, 16:9',
    p2: 'misty mountain valley at sunrise with pine forest and clear stream, tranquil nature scene, no text, 16:9',
    p3: 'stone pathway leading through alpine village with flower boxes on windows, European mountain town, no text, 16:9',
  },
  {
    slug: 'smart-inverter-dehumidifier-20260731',
    section: 'trending-picks',
    // 완전히 추상적 프롬프트
    p1: 'clean modern interior of a living room with sunlight streaming through curtains, cozy home atmosphere, no people, no text, 16:9',
    p2: 'three white cylindrical home appliances on a white pedestal, minimal studio background, product display, no text, 16:9',
    p3: 'water droplets on a clear glass surface, close-up macro with bokeh background, fresh concept, no text, 16:9',
  },
  {
    slug: 'magsafe-powerbank-top3-20260807',
    section: 'trending-picks',
    // 제품 직접 언급 피하고 추상적으로
    p1: 'three round flat pebble-like objects in white and gray on a light wood surface, minimalist product display, no text, no logos, 16:9',
    p2: 'glowing LED ring attached to back of a smartphone on a café table, wireless charging glow effect, warm light, no text, 16:9',
    p3: 'small disc-shaped object with soft glow on a dark slate surface, tech accessory, minimal, no text, 16:9',
  },
  {
    slug: 'smart-case-ai-earbuds-trend-2026',
    section: 'it-devices',
    // 별 아이콘 회피: 추상적/일러스트 스타일
    p1: 'abstract illustration of two small oval shapes floating above an open oval container, soft pastel background, tech concept art, no text, 16:9',
    p2: 'three different colored oval pods in matching cases lined up on a white surface, color variety, clean composition, no text, 16:9',
    p3: 'small glowing dot inside a sleek case on a dark surface, ambient LED light, minimalist tech aesthetic, no text, 16:9',
  },
];

async function tryGenerate(session, t, destPaths) {
  const { sharp } = session._deps;

  await session.newConversation();
  session._turnCount = 1;

  // 응답이 올 때까지 최대 25초 대기
  let helloResp = '';
  try {
    helloResp = await session.send('안녕', { timeout: 25000 });
  } catch (e) {
    console.warn(`  ⚠️  안녕 전송 실패: ${e.message?.slice(0, 60)}`);
  }
  console.log(`  💬  안녕 응답: ${(helloResp || '').length}자`);

  // 응답이 0자이면 5초 대기 후 이미지 요청
  if (!helloResp || helloResp.length === 0) {
    console.warn(`  ⏳  Gem 응답 없음 — 5초 추가 대기 후 진행`);
    await new Promise(r => setTimeout(r, 5000));
  }

  session._turnCount = 0;

  await session.useImageMaker(
    `이미지 3장 생성:\n\n[1] ${t.p1}\n\n[2] ${t.p2}\n\n[3] ${t.p3}\n\n규칙: 텍스트·로고 없음, 얼굴 클로즈업 없음, 16:9 가로`
  );

  const buffers = await session.extractImagesFromLastResponse(1, 25000);

  if (buffers.length === 0) return 0;

  console.log(`  📊 raw 버퍼: ${buffers.length}장, 최대 ${Math.round(Math.max(...buffers.map(b => b.length)) / 1024)}KB`);

  const sorted = [...buffers].sort((a, b) => b.length - a.length);
  let savedCount = 0;

  for (let i = 0; i < destPaths.length; i++) {
    const dest = destPaths[i];
    if (fs.existsSync(dest) && fs.statSync(dest).size >= MIN_OUTPUT_KB * 1024) {
      console.log(`  ⏭️  이미 정상: ${path.basename(dest)}`);
      savedCount++;
      continue;
    }
    const buf = sorted[i] ?? sorted[0];
    try {
      await sharp(buf)
        .resize(1280, 720, { fit: 'cover', position: 'centre' })
        .webp({ quality: 90, effort: 6 })
        .toFile(dest);
      const kb = Math.round(fs.statSync(dest).size / 1024);
      if (fs.statSync(dest).size < MIN_OUTPUT_KB * 1024) {
        fs.unlinkSync(dest);
        console.warn(`  🗑️  ${path.basename(dest)} (${kb}KB) — 별 아이콘 제거`);
      } else {
        console.log(`  💾 ${path.basename(dest)} (${kb}KB)`);
        savedCount++;
      }
    } catch (err) {
      console.warn(`  ⚠️  저장 실패: ${err.message}`);
    }
  }

  return savedCount;
}

async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;
  const { execSync } = await import('child_process');

  console.log(`🔄 이미지 재생성 v5 — ${TARGETS.length}개 최종 잔여`);
  const gemUrl = process.env.GEMINI_GEM_URL;
  if (!gemUrl) throw new Error('GEMINI_GEM_URL 미설정');
  console.log(`💎 Gem 모드: ${gemUrl}`);
  const session = new GeminiSession({ headless: false, gemUrl });
  session._deps = { sharp, execSync };
  await session.init();

  let fixed = 0;
  let failed = 0;
  const failedList = [];

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    console.log(`\n[${i + 1}/${TARGETS.length}] 📁 ${t.section}/${t.slug}`);
    const bundleDir = path.join(ROOT, 'content', 'posts', t.section, t.slug);

    if (!fs.existsSync(bundleDir)) {
      console.warn(`  ⚠️  디렉토리 없음 — 건너뜀`);
      failed++; failedList.push(t.slug); continue;
    }

    const img01Path = path.join(bundleDir, `${t.slug}-01.webp`);
    const img02Path = path.join(bundleDir, `${t.slug}-02.webp`);
    const thumbPath = path.join(bundleDir, `${t.slug}-thumb.webp`);

    // 기존 별 아이콘 제거
    for (const p of [img01Path, img02Path, thumbPath]) {
      if (fs.existsSync(p) && fs.statSync(p).size < MIN_OUTPUT_KB * 1024) {
        fs.unlinkSync(p); console.log(`  🗑️  불량 파일 삭제: ${path.basename(p)}`);
      }
    }

    const allOk = [img01Path, img02Path, thumbPath].every(
      p => fs.existsSync(p) && fs.statSync(p).size >= MIN_OUTPUT_KB * 1024
    );
    if (allOk) { console.log(`  ✅ 이미지 정상 — 스킵`); continue; }

    let success = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        console.log(`  🔁 재시도 ${attempt}/3 — ${15 * attempt}초 대기`);
        await new Promise(r => setTimeout(r, 15000 * attempt));
      }
      try {
        success = await tryGenerate(session, t, [img01Path, img02Path, thumbPath]);
        if (success > 0) break;
      } catch (err) {
        console.error(`  💥 attempt ${attempt} 오류: ${err.message}`);
      }
    }

    if (success > 0) {
      fixed++;
      try {
        execSync('git add content/', { cwd: ROOT, stdio: 'inherit' });
        execSync(`git commit -m "feat: ${t.slug} 이미지 생성 (v5)"`, { cwd: ROOT, stdio: 'inherit' });
        execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
        console.log(`  🚀 push 완료`);
      } catch (e) {
        console.error(`  ❌ push 실패: ${e.message}`);
      }
    } else {
      console.warn(`  ⛔ ${t.slug} 최종 실패`);
      failed++; failedList.push(t.slug);
    }

    await new Promise(r => setTimeout(r, 12000));
  }

  await session.close();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 성공: ${fixed}개 / ❌ 실패: ${failed}개`);
  if (failedList.length > 0) {
    console.log(`\n실패:`);
    failedList.forEach(s => console.log(`  - ${s}`));
  }
}

main().catch(err => {
  console.error('💥 치명적 오류:', err);
  process.exit(1);
});
