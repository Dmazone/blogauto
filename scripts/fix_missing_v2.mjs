#!/usr/bin/env node
/**
 * fix_missing_v2.mjs — 이미지 완전 누락 포스팅 Gemini 이미지 생성
 *
 * fix_bad_thumbs.mjs 완료 후 실행.
 * 이미지 파일 자체가 없는 포스팅 8개 대상.
 * Pollinations 절대 금지 — Gemini Pro 전용.
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
    slug: 'iphone-18-pro-price-hike-analysis-2026',
    section: 'it-devices',
    title: '아이폰18 프로 가격 폭등',
    p1: 'new flagship smartphone in premium box with price increase concept, white studio lighting, product photography, no text, 16:9',
    p2: 'smartphone market price comparison graph with upward trend arrow, tech financial concept, clean background, 16:9',
    p3: 'close-up of high-end smartphone rear camera triple lens array on dark reflective surface, premium tech detail, 16:9',
  },
  {
    slug: 'it-devices-issue-20260804',
    section: 'it-devices',
    title: '삼성 갤럭시 Z8 사전판매',
    p1: 'foldable smartphone fully open on white studio surface, AMOLED folding screen unfolded, product photography, no text, 16:9',
    p2: 'three foldable Galaxy phones lined up showing different fold states, tech comparison, studio lighting, 16:9',
    p3: 'foldable smartphone hinge mechanism close-up, metallic silver finish, dark studio background, premium detail, 16:9',
  },
  {
    slug: '2026-realestate-tax-reform-living-requirement',
    section: 'kr-realestate',
    title: '2026 부동산 세제개편',
    p1: 'miniature house model next to tax document on wooden desk, real estate policy concept, soft lighting, no text, 16:9',
    p2: 'aerial view of apartment complex models arranged on map, real estate tax reform overview concept, 16:9',
    p3: 'residential high-rise apartment buildings against clear blue sky, Korean urban real estate, wide shot, no text, 16:9',
  },
  {
    slug: 'seoul-apartment-price-gangbuk-surge-2026',
    section: 'kr-realestate',
    title: '서울 강북 아파트 급등',
    p1: 'dense Seoul apartment towers skyline from elevated viewpoint, urban north district, daytime, no text, 16:9',
    p2: 'real estate price surge graph with Korean apartment silhouette, housing market concept, clean design, 16:9',
    p3: 'Korean high-rise residential towers golden hour, street-level view looking up, urban real estate, no text, 16:9',
  },
  {
    slug: 'kim-min-jae-bayern-munich-aston-villa-goal-2026',
    section: 'sports',
    title: '김민재 뮌헨 헤더골',
    p1: 'dramatic header goal moment in packed European football stadium, stadium lights, crowd blurred, no identifiable players, 16:9',
    p2: 'Bayern Munich red jersey hanging in team locker room, European club football atmosphere, no text, 16:9',
    p3: 'professional football stadium wide angle night match, Champions League atmosphere floodlights, no text, 16:9',
  },
  {
    slug: 'running-smartwatch-top3-20260808',
    section: 'trending-picks',
    title: '2026 러닝 스마트워치 TOP3',
    p1: 'three running GPS smartwatches side by side on white studio surface, sports wearable comparison shot, no text, 16:9',
    p2: 'smartwatch GPS screen showing running pace and heart rate data on athletic track surface, fitness concept, 16:9',
    p3: 'wrist wearing sport smartwatch during outdoor run, motion blurred track background, no face shown, 16:9',
  },
  {
    slug: '2026-google-deepmind-restructuring-demis-hassabis-agi',
    section: 'us-trends',
    title: 'Google DeepMind AGI 2026',
    p1: 'abstract AI neural network brain visualization glowing blue nodes on dark background, deep learning concept, 16:9',
    p2: 'futuristic AI research lab concept with glowing chip and connected neural pathways, dark blue background, no text, 16:9',
    p3: 'artificial general intelligence concept art, interconnected glowing nodes forming abstract mind shape, 16:9',
  },
  {
    slug: 'europe-flight-delay-cancellation-ec261-compensation-guide-2026',
    section: 'world-travel',
    title: '유럽 비행기 지연 결항 보상',
    p1: 'airport departure board showing delayed flights red status lights, European terminal interior, natural window light, 16:9',
    p2: 'airline passenger compensation claim document on airport seating area, travel disruption concept, 16:9',
    p3: 'airplane on rainy tarmac under grey cloudy sky seen from terminal window, flight delay atmosphere, no text, 16:9',
  },
  // === fix_bad_thumbs 실패 8건 재시도 ===
  {
    slug: 'early-onset-diabetes-sugar-spike-2026',
    section: 'health',
    title: '젊은 당뇨 혈당 스파이크',
    p1: 'blood glucose meter on wooden table with healthy food in background, diabetes management concept, soft studio lighting, no text, 16:9',
    p2: 'sugar spike graph concept with fruits vegetables and medical icons on clean white background, health infographic style, 16:9',
    p3: 'continuous glucose monitor worn on arm, medical wearable health tracking, neutral background, no face shown, 16:9',
  },
  {
    slug: 'youth-culture-pass-book-expansion-2026',
    section: 'humanities',
    title: '청년문화패스 도서 확대',
    p1: 'stack of books with reading glasses on wooden desk, warm library atmosphere, youth culture concept, no text, 16:9',
    p2: 'young person browsing bookstore shelves, cultural policy benefit concept, soft natural lighting, no face shown, 16:9',
    p3: 'open book with cultural icons around it — music notes, palette, film reel, on soft gradient background, 16:9',
  },
  {
    slug: 'ai-heavy-data-nas-storage-2026',
    section: 'it-devices',
    title: 'AI 데이터 NAS 스토리지 2026',
    p1: 'network attached storage NAS device glowing blue LED on dark server rack, data storage concept, 16:9',
    p2: 'rows of hard drives inside opened NAS enclosure, enterprise storage close-up, dark background with tech lighting, 16:9',
    p3: 'abstract data flow visualization with storage nodes and AI chip concept art, dark blue background, no text, 16:9',
  },
  {
    slug: 'magsafe-powerbank-top3-20260807',
    section: 'trending-picks',
    title: '2026 맥세이프 보조배터리 TOP3',
    p1: 'three MagSafe compatible wireless power banks on white studio surface, MagSafe circular magnet visible, no text, 16:9',
    p2: 'MagSafe power bank attached to back of smartphone wirelessly charging, tech product in use, clean background, 16:9',
    p3: 'compact magnetic wireless charger power bank close-up detail, premium portable charging concept, dark background, 16:9',
  },
  {
    slug: '2026-anthropic-custom-ai-chips-in-house-silicon',
    section: 'us-trends',
    title: 'Anthropic 자체 AI 칩 개발',
    p1: 'custom AI processor chip on circuit board with glowing blue nodes, silicon semiconductor concept, dark background, 16:9',
    p2: 'abstract AI chip design concept with neural network pathways etched into silicon, tech manufacturing, 16:9',
    p3: 'futuristic AI data center server room with custom chip architecture concept, cool blue lighting, no text, 16:9',
  },
  {
    slug: 'kbo-heatwave-cancellation-2026-schedule-change',
    section: 'sports',
    title: 'KBO 폭염 취소 일정 변경',
    p1: 'empty baseball stadium during extreme heat summer day, KBO professional baseball, wide aerial shot, no text, 16:9',
    p2: 'baseball field with thermometer showing extreme temperature concept, sports schedule disruption, 16:9',
    p3: 'scoreboard showing canceled game message in empty stadium, sports event cancellation concept, 16:9',
  },
  {
    slug: 'open-ear-earbuds-top3-20260803',
    section: 'trending-picks',
    title: '2026 오픈형 이어버즈 TOP3',
    p1: 'three open-ear sports earbuds side by side on white studio surface, bone conduction and air conduction types, no text, 16:9',
    p2: 'open-ear earbuds worn during outdoor running exercise, wearable audio product, no face shown, blurred background, 16:9',
    p3: 'open-ear earbuds next to smartphone showing fitness app, audio health wearable concept, clean desk, 16:9',
  },
  {
    slug: 'legion-go-bios-update-brick-issue-2026',
    section: 'it-devices',
    title: '리전고 BIOS 벽돌 이슈 2026',
    p1: 'handheld gaming PC on dark background with warning error screen concept, BIOS brick issue concept, no text, 16:9',
    p2: 'portable gaming device with system update screen concept art, firmware failure concept, dramatic lighting, 16:9',
    p3: 'compact gaming handheld console on dark reflective surface, RGB lighting, product photography, no text, 16:9',
  },
  // === 추가 누락 포스팅 ===
  {
    slug: 'kim-seon-tae-don-seon-tae-kbs-departure-2026',
    section: 'entertainment',
    title: 'KBS 탈출 연예인 현황',
    p1: 'empty broadcast studio set with microphone and camera on tripod, TV production concept, dramatic studio lighting, no text, 16:9',
    p2: 'television network logo concept with departure arrow symbol, entertainment industry news concept, clean design, 16:9',
    p3: 'broadcast camera and spotlight in empty studio, media industry concept, dark dramatic lighting, no text, 16:9',
  },
  {
    slug: 'dopamine-detox-humanities-2026',
    section: 'humanities',
    title: '도파민 디톡스 인문학',
    p1: 'minimalist desk with turned-off phone and open journal, digital detox concept, warm natural light, no text, 16:9',
    p2: 'person meditating in quiet forest clearing, mindfulness dopamine reset concept, peaceful nature atmosphere, no face, 16:9',
    p3: 'brain illustration with reset/refresh symbol, neuroscience detox concept art, clean blue background, no text, 16:9',
  },
  {
    slug: 'sign-language-hate-speech-philosophy-2026',
    section: 'humanities',
    title: '수어와 혐오발언 철학',
    p1: 'two hands forming sign language gesture against soft gradient background, communication philosophy concept, no text, 16:9',
    p2: 'open book with speech bubble symbols and scales of justice concept, language ethics philosophy, clean design, 16:9',
    p3: 'diverse hands joined together symbolizing inclusion and communication, social philosophy concept, warm lighting, 16:9',
  },
  {
    slug: 'ai-mini-pc-trend-guide-2026',
    section: 'it-devices',
    title: 'AI 미니 PC 트렌드 가이드 2026',
    p1: 'compact mini PC on desk with glowing RGB accents beside monitor setup, clean studio lighting, no text, 16:9',
    p2: 'three mini PCs lined up on white surface comparison shot, small form factor computers, studio light, no text, 16:9',
    p3: 'mini PC rear ports and cooling vents close-up, premium small computer detail, dark background, 16:9',
  },
  {
    slug: 'compact-premium-mini-tablet-trend-2026',
    section: 'it-devices',
    title: '2026 미니 태블릿 트렌드',
    p1: 'small premium tablet on minimalist white desk with stylus, compact device concept, studio lighting, no text, 16:9',
    p2: 'two mini tablets side by side showing screen comparison, portable device trend, clean background, 16:9',
    p3: 'mini tablet held in one hand showing vivid display, small form factor premium gadget, no face shown, 16:9',
  },
  {
    slug: 'smart-case-ai-earbuds-trend-2026',
    section: 'it-devices',
    title: 'AI 이어버즈 스마트 케이스 트렌드',
    p1: 'premium wireless earbuds in open charging case on white surface, product photography, studio lighting, no text, 16:9',
    p2: 'three different earbuds cases lined up showing AI features display, smart case comparison, clean background, 16:9',
    p3: 'earbuds case with glowing LED indicator charging, tech product close-up, dark reflective surface, 16:9',
  },
  {
    slug: 'smart-ring-comparison-2026',
    section: 'it-devices',
    title: '스마트링 비교 2026',
    p1: 'two smart rings side by side on white surface, wearable health tech comparison, studio photography, no text, 16:9',
    p2: 'smart ring worn on finger showing health sensor, wearable tech close-up, neutral background, no face shown, 16:9',
    p3: 'collection of smart rings different sizes on dark reflective surface, product lineup photography, 16:9',
  },
  {
    slug: 'spatial-3d-display-xr-device-2026',
    section: 'it-devices',
    title: '2026 공간 3D 디스플레이 XR',
    p1: 'futuristic holographic 3D display projecting floating UI elements in dark room, spatial computing concept, 16:9',
    p2: 'XR headset on pedestal with light rays showing volumetric display concept, tech product photography, 16:9',
    p3: 'abstract spatial computing visualization with floating windows and 3D content, dark blue background, no text, 16:9',
  },
  {
    slug: 'latest-tech-issue-20260801',
    section: 'latest-tech',
    title: 'Anthropic AI 1100억 투자 유치',
    p1: 'abstract AI investment concept with glowing neural network and financial graph on dark background, tech finance, 16:9',
    p2: 'futuristic AI research facility concept with glowing servers and chip design, startup investment mood, 16:9',
    p3: 'abstract technology funding concept with ascending graph and digital network, venture capital AI theme, 16:9',
  },
  {
    slug: 'us-trends-issue-20260802',
    section: 'us-trends',
    title: 'US-Iran 긴장 & 중동 정세',
    p1: 'abstract geopolitical map concept with Middle East region highlighted in soft glow, no flags no text, 16:9',
    p2: 'diplomatic negotiation table concept with global map in background, international relations theme, 16:9',
    p3: 'oil tanker on open sea horizon at sunset, global trade and geopolitics concept, no text, 16:9',
  },
  {
    slug: 'mongolia-coolcation-summer-travel-boom-2026',
    section: 'world-travel',
    title: '몽골 여름 여행 붐 2026',
    p1: 'vast Mongolian grassland steppe under dramatic blue sky with white clouds, coolcation travel concept, no text, 16:9',
    p2: 'traditional Mongolian ger yurt camp on green plain at golden hour, travel destination concept, 16:9',
    p3: 'travelers hiking in scenic Mongolian mountain landscape, adventure coolcation concept, wide shot, no face, 16:9',
  },
  {
    slug: 'mountain-vibes-alpine-summer-escape-2026',
    section: 'world-travel',
    title: '알프스 여름 피서 2026',
    p1: 'dramatic alpine mountain peaks with wildflower meadow in foreground, European summer escape concept, no text, 16:9',
    p2: 'mountain hiking trail with panoramic alpine valley view, summer travel destination, wide landscape, 16:9',
    p3: 'cozy mountain lodge exterior with snow-capped peaks backdrop, alpine retreat concept, no text, 16:9',
  },
  // === trending-picks 추가 누락 ===
  {
    slug: 'deskterior-setup-top3-20260728',
    section: 'trending-picks',
    title: '2026 데스크테리어 무선 셋업 TOP3',
    p1: 'clean minimal desk setup with wireless keyboard mouse and monitor arm, deskterior style, natural daylight, no text, 16:9',
    p2: 'premium desk accessories laid out flat — wireless charger stand, cable management clips, monitor riser, product photography, 16:9',
    p3: 'aesthetic home office corner with wood desk and ambient LED lighting, work from home deskterior, no text, 16:9',
  },
  {
    slug: 'smart-inverter-dehumidifier-20260731',
    section: 'trending-picks',
    title: '2026 인버터 제습기 TOP3',
    p1: 'modern white smart dehumidifier on wooden floor in bright living room, home appliance product photography, no text, 16:9',
    p2: 'three dehumidifiers side by side on white background comparison shot, home appliance lineup, studio lighting, no text, 16:9',
    p3: 'dehumidifier water tank being removed showing collected water, appliance function close-up, bright background, 16:9',
  },
  {
    slug: 'smart-ring-health-tracker-top3-2026',
    section: 'trending-picks',
    title: '2026 스마트링 건강 트래커 TOP3',
    p1: 'three smart health tracker rings on white studio surface, wearable comparison photography, no text, 16:9',
    p2: 'smart ring worn on ring finger showing health monitoring, wearable tech close-up, neutral background, no face shown, 16:9',
    p3: 'smart ring next to smartphone health app showing heart rate sleep data, health tracking concept, clean desk, 16:9',
  },
  {
    slug: 'trending-picks-20260727',
    section: 'trending-picks',
    title: '트렌드 상품 추천 TOP3',
    p1: 'three trendy consumer products arranged on white studio surface — gadget lifestyle concept, no text, 16:9',
    p2: 'popular tech products lineup on minimal background, trend product recommendation concept, clean photography, 16:9',
    p3: 'shopping concept with curated product selection on wooden desk, consumer trend recommendation, no text, 16:9',
  },
];

async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;
  const { execSync } = await import('child_process');

  console.log(`🔄 이미지 생성 — 총 ${TARGETS.length}개 누락 포스팅 (Gemini Pro 전용)`);
  const session = new GeminiSession({ headless: false });
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

    // 이미 정상 이미지가 있으면 스킵
    const allExist = [img01Path, img02Path, thumbPath].every(
      p => fs.existsSync(p) && fs.statSync(p).size >= MIN_OUTPUT_KB * 1024
    );
    if (allExist) {
      console.log(`  ✅ 이미지 정상 존재 — 스킵`);
      continue;
    }

    try {
      await session.newConversation();
      session._turnCount = 1;
      await session.send('안녕', { timeout: 10000 }).catch(() => {});
      session._turnCount = 0;

      await session.useImageMaker(
        `이미지 3장 생성:\n\n[1] ${t.p1}\n\n[2] ${t.p2}\n\n[3] ${t.p3}\n\n규칙: 텍스트·로고 없음, 얼굴 클로즈업 없음, 16:9 가로`
      );

      const buffers = await session.extractImagesFromLastResponse(1, 10000);

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
            console.warn(`  🗑️  ${path.basename(dest)} (${kb}KB) — 별 아이콘 폴백 제거`);
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
          execSync(`git commit -m "feat: ${t.slug} 이미지 생성"`, { cwd: ROOT, stdio: 'inherit' });
          execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
          console.log(`  🚀 즉시 push 완료 → ${t.slug}`);
        } catch (e) {
          console.error(`  ❌ push 실패: ${e.message}`);
        }
      } else {
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
}

main().catch(e => {
  console.error('❌ 오류:', e.message);
  process.exit(1);
});
