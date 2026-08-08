#!/usr/bin/env node
/**
 * fix_missing_v3.mjs — 16개 실패 포스팅 재처리 (GEMINI_GEM_URL u/2→u/1 수정 후)
 *
 * fix_missing_v2 에서 실패한 16개만 대상.
 * Gem ID cca9fca55f60은 동일 — gemini_browser.js가 u/N 자동 보정함.
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
    slug: 'it-devices-issue-20260804',
    section: 'it-devices',
    p1: 'modern foldable smartphone fully open on white studio surface, AMOLED screen, product photography, no text, 16:9',
    p2: 'three foldable smartphones lined up showing different fold states, tech comparison, studio lighting, 16:9',
    p3: 'smartphone hinge mechanism close-up, metallic silver finish, dark studio background, premium detail, 16:9',
  },
  {
    slug: 'kim-min-jae-bayern-munich-aston-villa-goal-2026',
    section: 'sports',
    p1: 'dramatic header goal in packed European football stadium, stadium lights, crowd blurred, no identifiable players, 16:9',
    p2: 'European football club red jersey hanging in locker room, Champions League atmosphere, no text, 16:9',
    p3: 'professional football stadium wide angle night match, floodlights, green pitch, no text, 16:9',
  },
  {
    slug: '2026-google-deepmind-restructuring-demis-hassabis-agi',
    section: 'us-trends',
    p1: 'abstract neural network visualization glowing blue nodes on dark background, AI concept, 16:9',
    p2: 'futuristic research lab with glowing servers and circuit pathways, dark blue background, no text, 16:9',
    p3: 'interconnected glowing nodes forming abstract mind shape, AI concept art, dark background, 16:9',
  },
  {
    slug: 'early-onset-diabetes-sugar-spike-2026',
    section: 'health',
    p1: 'blood glucose meter on wooden table with fruit background, health concept, soft lighting, no text, 16:9',
    p2: 'healthy food and medical symbols on white background, health infographic style, soft colors, 16:9',
    p3: 'medical health monitoring wearable device, neutral background, health tracking technology, 16:9',
  },
  {
    slug: 'magsafe-powerbank-top3-20260807',
    section: 'trending-picks',
    p1: 'three circular magnetic wireless power banks on white studio surface, no brand logos, no text, 16:9',
    p2: 'magnetic wireless charger attached to smartphone back, tech product in use, clean white background, 16:9',
    p3: 'compact magnetic power bank close-up detail, portable charging concept, dark background, 16:9',
  },
  {
    slug: 'open-ear-earbuds-top3-20260803',
    section: 'trending-picks',
    p1: 'three open-ear sports earbuds on white studio surface, audio products, no brand text, 16:9',
    p2: 'open-ear earbuds during outdoor running, wearable audio, blurred background, no face shown, 16:9',
    p3: 'open-ear earbuds next to smartphone, audio wearable concept, clean desk setup, 16:9',
  },
  {
    slug: 'dopamine-detox-humanities-2026',
    section: 'humanities',
    p1: 'minimalist desk with closed notebook and pen, digital detox concept, warm natural light, no text, 16:9',
    p2: 'quiet forest path with soft sunlight through trees, mindfulness concept, peaceful nature, no people, 16:9',
    p3: 'abstract brain reset illustration on soft blue background, neuroscience concept, clean minimal, no text, 16:9',
  },
  {
    slug: 'sign-language-hate-speech-philosophy-2026',
    section: 'humanities',
    p1: 'two hands forming communication gesture, soft gradient background, language concept, no text, 16:9',
    p2: 'open book with speech bubbles and scales of justice illustration, language ethics concept, clean design, 16:9',
    p3: 'diverse hands together symbolizing inclusion and communication, social concept, warm lighting, 16:9',
  },
  {
    slug: 'ai-mini-pc-trend-guide-2026',
    section: 'it-devices',
    p1: 'compact mini PC on desk with monitor in background, clean studio lighting, no text, 16:9',
    p2: 'three small form factor computers lined up on white surface, comparison shot, studio light, no text, 16:9',
    p3: 'mini PC rear ports close-up, cooling vents detail, dark studio background, 16:9',
  },
  {
    slug: 'compact-premium-mini-tablet-trend-2026',
    section: 'it-devices',
    p1: 'small premium tablet on white desk with stylus, compact device, studio lighting, no text, 16:9',
    p2: 'two mini tablets side by side showing vivid display, portable device comparison, clean background, 16:9',
    p3: 'small tablet held in one hand showing display, form factor concept, no face shown, 16:9',
  },
  {
    slug: 'smart-case-ai-earbuds-trend-2026',
    section: 'it-devices',
    p1: 'premium wireless earbuds in open charging case on white surface, product photography, studio lighting, no text, 16:9',
    p2: 'three earbuds charging cases lined up, smart case comparison, clean white background, no text, 16:9',
    p3: 'earbuds case with LED indicator charging, tech product close-up, dark reflective surface, 16:9',
  },
  {
    slug: 'smart-ring-comparison-2026',
    section: 'it-devices',
    p1: 'two smart rings on white surface, wearable health tech comparison, studio photography, no text, 16:9',
    p2: 'smart ring worn on finger showing sensor detail, wearable close-up, neutral background, no face shown, 16:9',
    p3: 'collection of smart rings on dark reflective surface, product lineup photography, no text, 16:9',
  },
  {
    slug: 'spatial-3d-display-xr-device-2026',
    section: 'it-devices',
    p1: 'holographic 3D display projecting floating UI elements in dark room, spatial computing concept, 16:9',
    p2: 'XR headset on pedestal with volumetric display light rays concept, tech photography, 16:9',
    p3: 'abstract spatial computing with floating windows on dark blue background, no text, 16:9',
  },
  {
    slug: 'mountain-vibes-alpine-summer-escape-2026',
    section: 'world-travel',
    p1: 'dramatic alpine mountain peaks with wildflower meadow in foreground, summer escape concept, no text, 16:9',
    p2: 'mountain hiking trail with panoramic alpine valley view, summer travel destination, wide landscape, 16:9',
    p3: 'cozy wooden mountain lodge exterior with snow-capped peaks backdrop, alpine retreat, no text, 16:9',
  },
  {
    slug: 'deskterior-setup-top3-20260728',
    section: 'trending-picks',
    p1: 'clean minimal desk with wireless keyboard mouse and monitor arm, natural daylight, no text, no brand logos, 16:9',
    p2: 'premium desk accessories flat lay — wireless charger stand, cable clips, monitor riser, product photography, 16:9',
    p3: 'aesthetic home office corner with wood desk and ambient LED lighting, work from home setup, no text, 16:9',
  },
  {
    slug: 'smart-inverter-dehumidifier-20260731',
    section: 'trending-picks',
    p1: 'modern white dehumidifier on wooden floor in bright living room, home appliance product photography, no text, 16:9',
    p2: 'three dehumidifiers side by side on white background, home appliance lineup, studio lighting, no text, 16:9',
    p3: 'dehumidifier water tank being removed showing collected water, appliance function close-up, bright background, 16:9',
  },
];

async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;
  const { execSync } = await import('child_process');

  console.log(`🔄 이미지 재생성 v3 — ${TARGETS.length}개 실패 포스팅`);
  const gemUrl = process.env.GEMINI_GEM_URL;
  if (!gemUrl) throw new Error('GEMINI_GEM_URL 미설정 — .env 확인 필요');
  console.log(`💎 Gem 모드: ${gemUrl}`);
  const session = new GeminiSession({ headless: false, gemUrl });
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

    const allExist = [img01Path, img02Path, thumbPath].every(
      p => fs.existsSync(p) && fs.statSync(p).size >= MIN_OUTPUT_KB * 1024
    );
    if (allExist) {
      console.log(`  ✅ 이미지 정상 존재 — 스킵`);
      continue;
    }

    // 기존 불량 이미지 제거
    for (const p of [img01Path, img02Path, thumbPath]) {
      if (fs.existsSync(p) && fs.statSync(p).size < MIN_OUTPUT_KB * 1024) {
        fs.unlinkSync(p);
      }
    }

    try {
      await session.newConversation();
      session._turnCount = 1;
      await session.send('안녕', { timeout: 10000 }).catch(() => {});
      session._turnCount = 0;

      await session.useImageMaker(
        `이미지 3장 생성:\n\n[1] ${t.p1}\n\n[2] ${t.p2}\n\n[3] ${t.p3}\n\n규칙: 텍스트·로고 없음, 얼굴 클로즈업 없음, 16:9 가로`
      );

      const buffers = await session.extractImagesFromLastResponse(1, 15000);

      if (buffers.length === 0) {
        console.warn(`  ⚠️  캡처된 이미지 없음 — 건너뜀`);
        failed++; failedList.push(t.slug); continue;
      }

      console.log(`  📊 raw 버퍼: ${buffers.length}장, 최대 ${Math.round(Math.max(...buffers.map(b => b.length)) / 1024)}KB`);

      const sorted = [...buffers].sort((a, b) => b.length - a.length);
      const saves = [
        { buf: sorted[0],              dest: img01Path },
        { buf: sorted[1] ?? sorted[0], dest: img02Path },
        { buf: sorted[2] ?? sorted[0], dest: thumbPath },
      ];

      let savedCount = 0;
      for (const { buf, dest } of saves) {
        try {
          await sharp(buf)
            .resize(1280, 720, { fit: 'cover', position: 'centre' })
            .webp({ quality: 90, effort: 6 })
            .toFile(dest);
          const outputBytes = fs.statSync(dest).size;
          const kb = Math.round(outputBytes / 1024);
          if (outputBytes < MIN_OUTPUT_KB * 1024) {
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
        fixed++;
        try {
          execSync('git add content/', { cwd: ROOT, stdio: 'inherit' });
          execSync(`git commit -m "feat: ${t.slug} 이미지 생성 (v3)"`, { cwd: ROOT, stdio: 'inherit' });
          execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
          console.log(`  🚀 push 완료 → ${t.slug}`);
        } catch (e) {
          console.error(`  ❌ push 실패: ${e.message}`);
        }
      } else {
        console.warn(`  ⛔ ${t.slug} 전체 실패 (저품질 이미지)`);
        failed++; failedList.push(t.slug);
      }
    } catch (err) {
      console.error(`  💥 오류: ${err.message}`);
      failed++; failedList.push(t.slug);
    }

    await new Promise(r => setTimeout(r, 8000));
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
