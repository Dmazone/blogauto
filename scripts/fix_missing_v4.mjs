#!/usr/bin/env node
/**
 * fix_missing_v4.mjs — 7개 잔여 실패 포스팅 재처리
 *
 * 개선점:
 * 1. 0-캡처 케이스를 앞에 배치 (Gemini가 '신선한' 상태에서 처리)
 * 2. 별 아이콘 유발 프롬프트를 lifestyle/scene 방식으로 교체
 * 3. 재시도 로직 추가 (0-캡처 시 1회 재시도)
 * 4. 대기 시간 증가
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const MIN_OUTPUT_KB = 60;

// 0-캡처 케이스 먼저, 별 아이콘 케이스 나중에
const TARGETS = [
  // --- 0-캡처 케이스 (먼저 처리) ---
  {
    slug: 'ai-mini-pc-trend-guide-2026',
    section: 'it-devices',
    p1: 'small compact computer on a wooden desk with a large monitor, home office workspace, soft window light, no text, 16:9',
    p2: 'three different small form factor computers on a white shelf, tech comparison setup, clean background, no text, 16:9',
    p3: 'inside view of a tiny computer case showing colorful components and circuits, tech close-up, dark background, 16:9',
  },
  {
    slug: 'mountain-vibes-alpine-summer-escape-2026',
    section: 'world-travel',
    p1: 'wide alpine panorama with green meadows and snow-capped mountain peaks, bright summer day, no people, no text, 16:9',
    p2: 'narrow mountain trail winding through a lush valley with wildflowers, summer hiking scene, golden hour light, 16:9',
    p3: 'rustic wooden chalet exterior surrounded by tall pine trees and mountain backdrop, alpine village, no text, 16:9',
  },
  {
    slug: 'deskterior-setup-top3-20260728',
    section: 'trending-picks',
    p1: 'tidy home desk with monitor arm, wireless keyboard and mouse, soft natural light from window, no text, no logos, 16:9',
    p2: 'flat lay of desk accessories on a white surface — small charging stand, cable holder, monitor riser, pastel tones, 16:9',
    p3: 'cozy work corner with light wood desk, warm ambient lamp, small plant, minimal decor, no text, 16:9',
  },
  {
    slug: 'smart-inverter-dehumidifier-20260731',
    section: 'trending-picks',
    p1: 'white home appliance standing in a bright living room with wooden floor, clean interior scene, no text, 16:9',
    p2: 'three different home humidifier appliances lined up side by side, white background, studio lighting, no text, 16:9',
    p3: 'transparent water container being removed from an appliance, droplets visible, bright kitchen background, no text, 16:9',
  },
  // --- 별 아이콘 케이스 (lifestyle 프롬프트) ---
  {
    slug: 'it-devices-issue-20260804',
    section: 'it-devices',
    p1: 'person unfolding a large screen book-style device at a café table, side view, no face shown, warm natural light, 16:9',
    p2: 'two slim book-style devices side by side on a dark surface, glowing screens, no text on screens, 16:9',
    p3: 'close-up of a hinge mechanism between two display panels, silver metallic texture, dark studio backdrop, 16:9',
  },
  {
    slug: 'magsafe-powerbank-top3-20260807',
    section: 'trending-picks',
    p1: 'circular wireless charger attached to the back of a black smartphone, on a café table next to a coffee cup, no text, 16:9',
    p2: 'three round portable chargers in pastel colors on a light wood surface, minimal flat lay, no logos, no text, 16:9',
    p3: 'hand holding a thin disc-shaped charger with a glowing LED ring, no face shown, dark background, no text, 16:9',
  },
  {
    slug: 'smart-case-ai-earbuds-trend-2026',
    section: 'it-devices',
    p1: 'white earbuds resting inside an open white case on a marble surface, soft shadow, studio lighting, no text, 16:9',
    p2: 'three open earbuds cases side by side in different colors, clean white background, top-down view, no text, 16:9',
    p3: 'earbuds charging case with a small glowing LED indicator, placed on a dark wood surface at night, no text, 16:9',
  },
];

async function generateWithRetry(session, t, bundleDir) {
  const img01Path = path.join(bundleDir, `${t.slug}-01.webp`);
  const img02Path = path.join(bundleDir, `${t.slug}-02.webp`);
  const thumbPath = path.join(bundleDir, `${t.slug}-thumb.webp`);
  const { sharp, execSync } = session._deps;

  // 기존 불량 이미지 제거
  for (const p of [img01Path, img02Path, thumbPath]) {
    if (fs.existsSync(p) && fs.statSync(p).size < MIN_OUTPUT_KB * 1024) {
      fs.unlinkSync(p);
      console.log(`  🗑️  불량 파일 삭제: ${path.basename(p)}`);
    }
  }

  // 이미 정상 파일이 있으면 그것은 건드리지 않음
  const existing = [img01Path, img02Path, thumbPath].filter(
    p => fs.existsSync(p) && fs.statSync(p).size >= MIN_OUTPUT_KB * 1024
  );
  if (existing.length === 3) {
    console.log(`  ✅ 이미지 정상 존재 — 스킵`);
    return 'skip';
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      console.log(`  🔁 재시도 (attempt ${attempt})...`);
      await new Promise(r => setTimeout(r, 5000));
    }

    try {
      await session.newConversation();
      session._turnCount = 1;
      await session.send('안녕', { timeout: 12000 }).catch(() => {});
      session._turnCount = 0;

      await session.useImageMaker(
        `이미지 3장 생성:\n\n[1] ${t.p1}\n\n[2] ${t.p2}\n\n[3] ${t.p3}\n\n규칙: 텍스트·로고 없음, 얼굴 클로즈업 없음, 16:9 가로`
      );

      const buffers = await session.extractImagesFromLastResponse(1, 20000);

      if (buffers.length === 0) {
        console.warn(`  ⚠️  캡처된 이미지 없음 (attempt ${attempt})`);
        continue;
      }

      console.log(`  📊 raw 버퍼: ${buffers.length}장, 최대 ${Math.round(Math.max(...buffers.map(b => b.length)) / 1024)}KB`);

      const sorted = [...buffers].sort((a, b) => b.length - a.length);

      // 필요한 파일만 저장 (이미 정상인 파일은 스킵)
      const needsSave = [
        { buf: sorted[0], dest: img01Path },
        { buf: sorted[1] ?? sorted[0], dest: img02Path },
        { buf: sorted[2] ?? sorted[0], dest: thumbPath },
      ].filter(({ dest }) => !fs.existsSync(dest) || fs.statSync(dest).size < MIN_OUTPUT_KB * 1024);

      let savedCount = 0;
      for (const { buf, dest } of needsSave) {
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

      if (savedCount > 0) {
        return savedCount;
      }

      // 모두 별 아이콘이면 재시도
      console.warn(`  ⛔ 전체 별 아이콘 — attempt ${attempt} 실패`);
    } catch (err) {
      console.error(`  💥 오류 (attempt ${attempt}): ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 8000));
  }

  return 0;
}

async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;
  const { execSync } = await import('child_process');

  console.log(`🔄 이미지 재생성 v4 — ${TARGETS.length}개 잔여 실패 포스팅`);
  const gemUrl = process.env.GEMINI_GEM_URL;
  if (!gemUrl) throw new Error('GEMINI_GEM_URL 미설정 — .env 확인 필요');
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

    const result = await generateWithRetry(session, t, bundleDir);

    if (result === 'skip') {
      // already complete
      continue;
    } else if (result > 0) {
      fixed++;
      try {
        execSync('git add content/', { cwd: ROOT, stdio: 'inherit' });
        execSync(`git commit -m "feat: ${t.slug} 이미지 생성 (v4)"`, { cwd: ROOT, stdio: 'inherit' });
        execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
        console.log(`  🚀 push 완료 → ${t.slug}`);
      } catch (e) {
        console.error(`  ❌ push 실패: ${e.message}`);
      }
    } else {
      console.warn(`  ⛔ ${t.slug} 최종 실패`);
      failed++; failedList.push(t.slug);
    }

    await new Promise(r => setTimeout(r, 10000));
  }

  await session.close();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 성공: ${fixed}개 / ❌ 실패: ${failed}개`);
  if (failedList.length > 0) {
    console.log(`\n실패 목록:`);
    failedList.forEach(s => console.log(`  - ${s}`));
  }
}

main().catch(err => {
  console.error('💥 치명적 오류:', err);
  process.exit(1);
});
