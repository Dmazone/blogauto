#!/usr/bin/env node
/**
 * fix_bad_thumbs.mjs — 잘못 저장된 이미지 전체 재생성
 *
 * 문제 유형 1: "고딕 서재 남자" (158KB+) — Gemini UI 캐시 이미지 → preSendCount 수정으로 해결
 * 문제 유형 2: "별 아이콘" (32KB) — Gemini가 1장만 반환하는 폴백 이미지
 *
 * 수정: 60KB 미만 이미지는 폴백 아이콘으로 간주하여 저장 거부.
 *       유효 이미지 없으면 기존 소형 파일 삭제 후 건너뜀 (이미지 없음 > 잘못된 아이콘).
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const MIN_OUTPUT_KB = 60; // sharp 변환 후 출력 파일 60KB 미만 = 별 아이콘 폴백으로 간주

const TARGETS = [
  // ── Batch 1 (committed, 32KB bad) — 7개 ─────────────────────────────────
  {
    slug: '2026-high-oil-price-saving-strategies',
    section: 'economy',
    title: '고유가 생활비 절약 전략 2026',
    p1: 'car fuel gauge needle pointing to red empty zone, gas station nozzle, warm sunset light, no text, 16:9',
    p2: 'household budget coins and utility bills spread on wooden table, financial planning, overhead view, no text, 16:9',
    p3: 'industrial oil storage tanks at sunset with price down concept, energy sector, wide shot, no text, 16:9',
  },
  {
    slug: 'korea-leverage-etf-limit-regulations-2026',
    section: 'economy',
    title: '레버리지 ETF 규제 2026',
    p1: 'stock market trading terminal screen with ETF fund charts, financial office, large windows, no faces, 16:9',
    p2: 'financial document stack with bar chart showing limit cap line, investment regulation concept, clean desk, 16:9',
    p3: 'investment graph rising steeply then hitting a ceiling barrier, financial market concept, white background, no text, 16:9',
  },
  {
    slug: 'early-onset-diabetes-sugar-spike-2026',
    section: 'health',
    title: '20~30대 당뇨 혈당스파이크 2026',
    p1: 'blood glucose monitor device on white surface next to test strip and lancet, medical health concept, no text, 16:9',
    p2: 'overhead flat lay comparing white rice and sugary snacks versus fresh vegetables and water, food nutrition, no text, 16:9',
    p3: 'smartwatch wrist shot showing glucose spike graph, digital health monitoring close-up, no face, no text, 16:9',
  },
  {
    slug: 'youth-culture-pass-book-expansion-2026',
    section: 'humanities',
    title: '청소년 문화이용권 도서 확대 2026',
    p1: 'neatly stacked pile of colorful books with a voucher card on wooden desk, education concept, no text, 16:9',
    p2: 'public library interior with warm ceiling light illuminating bookshelves, quiet reading environment, no people, 16:9',
    p3: 'young person reading book in cozy library corner, back view only no face visible, bookshelves around, 16:9',
  },
  {
    slug: 'rollable-smartphone-next-form-factor-2026',
    section: 'it-devices',
    title: '롤러블 스마트폰 차세대 폼팩터 2026',
    p1: 'flexible OLED display material curling and unrolling on dark reflective surface, futuristic technology, no text, 16:9',
    p2: 'three prototype concept smartphones showing different screen expansion states on clean white studio surface, 16:9',
    p3: 'close-up of flexible display panel edge rolling mechanism, advanced material and hinge detail, dark background, 16:9',
  },
  {
    slug: 'ai-heavy-data-nas-storage-2026',
    section: 'it-devices',
    title: 'AI 대용량 NAS 스토리지 2026',
    p1: 'home NAS server tower with multiple drive bays and glowing LED indicators, dark room, no text, 16:9',
    p2: 'three network attached storage devices side by side on white surface, product comparison photography, 16:9',
    p3: 'open NAS enclosure showing hard drive array inside, warm LED ambient lighting, storage detail, no text, 16:9',
  },
  {
    slug: 'android-adb-permission-shizuku-issue-2026',
    section: 'it-devices',
    title: 'Android ADB Shizuku 권한 이슈 2026',
    p1: 'Android smartphone on dark desk with developer options screen visible, USB cable to laptop, no face, 16:9',
    p2: 'laptop screen showing terminal ADB command window, smartphone connected by USB cable, developer setup, 16:9',
    p3: 'close-up of USB debugging notification on Android phone screen, developer tools interface, dark background, 16:9',
  },

  // ── Batch 2 (on disk, 32KB bad, uncommitted) — 7개 ───────────────────────
  {
    slug: '2026-japan-population-under-120m-foreign-residents-record',
    section: 'japan-trends',
    title: '日本人口1.2億割れ外国人最多',
    p1: 'quiet rural Japanese village with traditional houses along narrow lane, autumn leaves, no people visible, 16:9',
    p2: 'diverse pedestrian silhouettes walking busy Shibuya-style scramble crossing, Tokyo urban backdrop at dusk, 16:9',
    p3: 'abandoned traditional Japanese farmhouse with overgrown garden, rural depopulation atmosphere, no text, 16:9',
  },
  {
    slug: 'aws-ai-capex-surge-2026',
    section: 'latest-tech',
    title: 'AWS AI 자본지출 급증 2026',
    p1: 'massive modern cloud data center facility exterior with large white building and cooling towers, tech campus at dusk, no text, 16:9',
    p2: 'server room interior with long rows of racks under cool blue and orange accent lighting, data infrastructure, 16:9',
    p3: 'upward trending investment bar chart with server rack silhouette in background, digital growth concept, blue background, 16:9',
  },
  {
    slug: 'shoulder-massager-top3-2026',
    section: 'trending-picks',
    title: '목어깨 마사지기 TOP3 2026',
    p1: 'shiatsu neck shoulder massager device on clean white surface, product photography side view, no text, 16:9',
    p2: 'three electric shoulder massage devices arranged in a row for comparison, studio lighting, white background, no text, 16:9',
    p3: 'neck massager heat node detail close-up, black device on light gray surface, top-down product view, no text, 16:9',
  },
  {
    slug: 'desktop-wireless-cooling-fan-top3-2026',
    section: 'trending-picks',
    title: '탁상용 무선 냉풍기 TOP3 2026',
    p1: 'small portable rechargeable desk fan on white studio surface, front view product shot, shadow detail, no text, 16:9',
    p2: 'three different compact desktop fans in a row on white background, product comparison photography, no text, 16:9',
    p3: 'mini desktop fan running near laptop on office desk, summer cooling setup, no face visible, no text, 16:9',
  },
  {
    slug: 'open-ear-earbuds-top3-20260803',
    section: 'trending-picks',
    title: '오픈형 무선 이어폰 TOP3 2026',
    p1: 'open-ear bone conduction wireless earphones on white reflective surface, product photography, no text, 16:9',
    p2: 'three pairs of different open-ear Bluetooth earbuds arranged side by side, comparison product shot, clean background, 16:9',
    p3: 'single open-ear earphone hook design close-up detail, silver metallic finish, dark studio background, no text, 16:9',
  },
  {
    slug: 'nogak-detox-diet-heatwave-bloating-2026',
    section: 'health',
    title: '노각 해독 식단 폭염 부기 2026',
    p1: 'fresh large Korean old cucumber whole and sliced on wooden cutting board, water droplets glistening, natural light, 16:9',
    p2: 'green detox salad bowl with sliced cucumber and herb garnish, overhead view, bright kitchen background, no text, 16:9',
    p3: 'cooling summer vegetables on ice: cucumber slices mint leaves green herbs, refreshing wellness concept, no text, 16:9',
  },
  {
    slug: 'legion-go-bios-update-brick-issue-2026',
    section: 'it-devices',
    title: '리전고 BIOS 먹통 복구 2026',
    p1: 'handheld gaming PC device with blank error screen on desk, USB flash drive plugged in for recovery, no text, 16:9',
    p2: 'laptop screen showing BIOS recovery utility interface window, gaming device connected via USB cable, tech repair setup, 16:9',
    p3: 'computer motherboard chip close-up with precision screwdriver repair concept, electronic hardware detail, no text, 16:9',
  },

  // ── Batch 2 미처리 (killed/not started) — 4개 ────────────────────────────
  {
    slug: 'kbo-heatwave-cancellation-2026-schedule-change',
    section: 'sports',
    title: 'KBO 폭염 취소 사태 2026',
    p1: 'empty professional baseball stadium under intense summer sun, field shimmer from heat, no players, wide shot, 16:9',
    p2: 'baseball diamond home plate area with heat waves visible, game cancelled feeling, harsh afternoon sun, 16:9',
    p3: 'stadium electronic scoreboard with cancellation notice concept, blazing summer sky behind, no text, 16:9',
  },
  {
    slug: 'magsafe-powerbank-top3-20260807',
    section: 'trending-picks',
    title: '2026 맥세이프 보조배터리 TOP3',
    p1: 'slim MagSafe wireless power bank magnetically snapped onto back of smartphone, white clean background, no text, 16:9',
    p2: 'three different MagSafe Qi2 power banks arranged side by side for comparison, studio lighting, no text, 16:9',
    p3: 'compact magnetic battery pack on outdoor cafe table next to phone, lifestyle product shot, no face, no text, 16:9',
  },
  {
    slug: '2026-anthropic-custom-ai-chips-in-house-silicon',
    section: 'us-trends',
    title: 'Anthropic Custom AI Chips 2026',
    p1: 'futuristic custom AI semiconductor chip with neural circuit pattern on silicon wafer, teal blue glow, no text, 16:9',
    p2: 'clean room semiconductor manufacturing concept with chip design blueprint on glowing monitor, no people, 16:9',
    p3: 'abstract glowing blue circuit pathways on dark background neural network AI chip concept, no text, 16:9',
  },
  {
    slug: '2026-august-fuel-surcharge-flight-price-guide',
    section: 'world-travel',
    title: '8월 항공 유류할증료 25% 인하',
    p1: 'commercial airliner wing tip over white clouds clear blue sky, travel freedom concept, no text, 16:9',
    p2: 'airport departure terminal hall with digital flight boards and natural window light, no people, 16:9',
    p3: 'airplane lifting off at golden sunset horizon, fuel cost reduction concept, dramatic sky, no text, 16:9',
  },
];

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;
  const { execSync } = await import('child_process');

  console.log(`🔄 이미지 재생성 — 총 ${TARGETS.length}개 포스팅 (60KB 미만 폴백 아이콘 거부)`);
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
      failed++;
      failedList.push(t.slug);
      continue;
    }

    const img01Path = path.join(bundleDir, `${t.slug}-01.webp`);
    const img02Path = path.join(bundleDir, `${t.slug}-02.webp`);
    const thumbPath = path.join(bundleDir, `${t.slug}-thumb.webp`);

    try {
      // 워밍업: _turnCount=1로 강제 설정해 send() 내부 newConversation() 재호출 방지
      await session.newConversation();
      session._turnCount = 1;
      await session.send('안녕', { timeout: 10000 }).catch(() => {});
      session._turnCount = 0; // useImageMaker를 위해 리셋

      await session.useImageMaker(
        `이미지 3장 생성:\n\n[1] ${t.p1}\n\n[2] ${t.p2}\n\n[3] ${t.p3}\n\n규칙: 텍스트·로고 없음, 얼굴 클로즈업 없음, 16:9 가로`
      );

      const buffers = await session.extractImagesFromLastResponse(1, 10000);

      if (buffers.length === 0) {
        console.warn(`  ⚠️  캡처된 이미지 없음 — 건너뜀`);
        failed++; failedList.push(t.slug); continue;
      }
      console.log(`  📊 raw 버퍼: ${buffers.length}장, 최대 ${Math.round(Math.max(...buffers.map(b=>b.length))/1024)}KB`);

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
            console.warn(`  🗑️  ${path.basename(dest)} (${kb}KB) — 출력 너무 작음, 별 아이콘 제거`);
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
        // 즉시 commit + push
        try {
          execSync('git add content/', { cwd: ROOT, stdio: 'inherit' });
          execSync(`git commit -m "fix: ${t.slug} 이미지 재생성"`, { cwd: ROOT, stdio: 'inherit' });
          execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
          console.log(`  🚀 즉시 push 완료 → ${t.slug}`);
        } catch (e) {
          console.error(`  ❌ push 실패: ${e.message}`);
        }
      } else {
        // 출력이 전부 소형 → 기존 파일도 소형이면 삭제
        for (const imgPath of [img01Path, img02Path, thumbPath]) {
          if (fs.existsSync(imgPath) && fs.statSync(imgPath).size < MIN_OUTPUT_KB * 1024) {
            fs.unlinkSync(imgPath);
            console.warn(`  🗑️  기존 별 아이콘 삭제: ${path.basename(imgPath)}`);
          }
        }
        failed++; failedList.push(t.slug);
      }

    } catch (err) {
      console.error(`  ❌ 오류: ${err.message}`);
      failed++;
      failedList.push(t.slug);
    }

    if (i < TARGETS.length - 1) {
      console.log('  ⏳ 10초 대기...');
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  await session.close?.();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ 완료: ${fixed}개 성공 / ${failed}개 실패`);
  if (failedList.length > 0) {
    console.log(`❌ 실패:\n${failedList.map(s => `  - ${s}`).join('\n')}`);
  }

  console.log('(각 포스팅 완료 시 즉시 push 완료됨)');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
