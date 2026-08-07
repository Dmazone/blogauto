#!/usr/bin/env node
/**
 * fix_bad_thumbs.mjs — 잘못 저장된 Gemini UI 캐시 이미지 전체 재생성
 *
 * 원인: "이미지 만들기" 버튼 클릭 시 Gemini UI 캐시 이미지(고딕 서재 남자 등)가
 *       인터셉터에 먼저 잡혀 크기 정렬 후 최상위로 선택됨.
 * 수정: gemini_browser.js에서 preSendCount 방식으로 버튼 클릭 캐시 제거 완료.
 *       이 스크립트는 항상 재생성 (스킵 없음).
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

// 확정 오류 포스팅 (136/157/118KB 캐시 패턴 + 스크린샷 확인)
const TARGETS = [
  // economy
  {
    slug: 'korea-sovereign-wealth-fund-20trillion-2026',
    section: 'economy',
    title: '한국판 국부펀드 20조원 총정리',
    p1: 'South Korea sovereign wealth fund concept, golden coins and rising financial charts, government building silhouette, editorial style, 16:9',
    p2: 'Korea GDP growth bar chart visualization, modern blue infographic, upward trend, no people, 16:9',
    p3: 'gold coins and investment growth concept, dark navy background, financial magazine cover style, 16:9',
  },
  {
    slug: '2026-high-oil-price-saving-strategies',
    section: 'economy',
    title: '2026 고유가 절약법 핵심',
    p1: 'fuel pump nozzle at gas station, orange sky background, no people, editorial photo style, 16:9',
    p2: 'energy saving concept, electric plug and coin stack, blue tones, clean white background, 16:9',
    p3: 'oil price surge concept, gas pump on dramatic orange sunset, 16:9',
  },
  {
    slug: 'korea-july-export-import-trend-2026',
    section: 'economy',
    title: '7월 수출 반등 핵심 3가지',
    p1: 'cargo container ship at industrial seaport, orange sunset, cranes, no people, 16:9',
    p2: 'Korea export trade chart bar graph rising, semiconductor icon, economic data, 16:9',
    p3: 'container port aerial view at dusk, colorful shipping containers arranged, 16:9',
  },
  {
    slug: 'global-ai-energy-infrastructure-boom-2026',
    section: 'economy',
    title: 'AI 전력망 수혜주 2026',
    p1: 'AI data center power infrastructure, massive electric tower with glowing cables, futuristic, 16:9',
    p2: 'electric grid and server farm concept, rising investment chart overlay, blue tech, 16:9',
    p3: 'power transmission tower silhouette at twilight, AI circuit pattern overlay, 16:9',
  },
  {
    slug: 'korea-leverage-etf-limit-regulations-2026',
    section: 'economy',
    title: '레버리지 ETF 제한 이유와 대응법',
    p1: 'candlestick stock chart on dark monitor, ETF trading concept, green and red candles, 16:9',
    p2: 'financial regulation warning concept, stock graph with red alert symbol, 16:9',
    p3: 'ETF investment risk concept, bar chart and caution icon on dark background, 16:9',
  },
  // entertainment
  {
    slug: 'seventeen-dino-pi-cheol-in-solo-album-2026',
    section: 'entertainment',
    title: '세븐틴 디노 솔로 앨범',
    p1: 'vinyl record album cover on wooden surface, studio lights, music concept, no people, 16:9',
    p2: 'concert stage with dramatic spotlight and smoke, music performance setting, no people, 16:9',
    p3: 'K-pop album concept, microphone and neon lights on dark background, 16:9',
  },
  {
    slug: 'entertainment-issue-20260801',
    section: 'entertainment',
    title: '유재석 숏폼 드라마 시즌2',
    p1: 'TV broadcast studio with multiple cameras and colorful stage lighting, empty set, 16:9',
    p2: 'smartphone vertical video filming concept, director chair and equipment, no people, 16:9',
    p3: 'variety show broadcast concept, clapperboard and studio lights, bright colors, 16:9',
  },
  // health
  {
    slug: 'early-onset-diabetes-sugar-spike-2026',
    section: 'health',
    title: '젊은 당뇨 혈당 스파이크 완전정리',
    p1: 'blood glucose monitor device on clean white surface, medical concept, 16:9',
    p2: 'healthy vs unhealthy food comparison, salad and sugary drinks side by side, 16:9',
    p3: 'diabetes glucose meter closeup, digital reading display, clinical background, 16:9',
  },
  // humanities
  {
    slug: 'youth-culture-pass-book-expansion-2026',
    section: 'humanities',
    title: '청년문화예술패스 도서 확대',
    p1: 'wooden bookshelf with colorful books, warm library lamp, cozy reading space, no people, 16:9',
    p2: 'stack of books on wooden desk with cup of tea, still life, warm tones, 16:9',
    p3: 'open book with soft glowing light, knowledge concept, warm background, 16:9',
  },
  {
    slug: 'dh2026-humanities-ai-engagement-2026',
    section: 'humanities',
    title: 'DH2026 디지털인문학 AI',
    p1: 'ancient manuscript pages with digital circuit overlay, digital humanities concept, 16:9',
    p2: 'old book and glowing neural network visualization, AI meets humanities, 16:9',
    p3: 'library books and digital data streams, dark academic background, 16:9',
  },
  // it-devices
  {
    slug: 'rollable-smartphone-next-form-factor-2026',
    section: 'it-devices',
    title: '롤러블폰 출시 임박',
    p1: 'flexible rolling smartphone concept design, extending display, dark tech background, no text, 16:9',
    p2: 'next generation phone form factor concept, sleek device with expandable screen, 16:9',
    p3: 'rollable flexible display tech concept, futuristic device, dark gradient background, 16:9',
  },
  {
    slug: 'galaxy-s26-red-screen-display-issue-2026',
    section: 'it-devices',
    title: '갤럭시S26 붉은 화면 해결',
    p1: 'smartphone display color calibration chart on screen, technical diagnostic, 16:9',
    p2: 'phone screen with color test pattern, display quality check concept, 16:9',
    p3: 'smartphone closeup with display settings, clean dark background, 16:9',
  },
  {
    slug: 'ai-heavy-data-nas-storage-2026',
    section: 'it-devices',
    title: 'AI 데이터 NAS 스토리지',
    p1: 'NAS network storage device with blinking LEDs on clean desk, multiple drive bays, 16:9',
    p2: 'hard drive array inside storage server, technical hardware closeup, dark background, 16:9',
    p3: 'home NAS server unit with blue LED lighting, modern storage device, 16:9',
  },
  {
    slug: 'android-adb-permission-shizuku-issue-2026',
    section: 'it-devices',
    title: '안드로이드 ADB Shizuku',
    p1: 'Android phone showing developer settings screen, terminal code overlay, no face, 16:9',
    p2: 'smartphone with code terminal window, USB cable connected, developer mode, 16:9',
    p3: 'Android developer options concept, phone with circuit pattern overlay, dark tech, 16:9',
  },
  {
    slug: 'foldable-phone-guide-2026',
    section: 'it-devices',
    title: '폴더블폰 완벽 구매 가이드',
    p1: 'foldable smartphone opened flat showing inner display, dark background, no text, 16:9',
    p2: 'phone folding hinge mechanism closeup, premium tech material, 16:9',
    p3: 'folded compact phone beside unfolded version, comparison shot, dark studio, 16:9',
  },
  // japan-trends
  {
    slug: '2026-japan-sora-cruise-jal-sky-museum-open',
    section: 'japan-trends',
    title: 'JAL そらクルーズ',
    p1: 'airplane window view with clouds and blue sky, premium travel concept, no people, 16:9',
    p2: 'airport terminal interior with large windows and planes visible, Japan aviation, 16:9',
    p3: 'airline cockpit dashboard view from behind, sky above clouds, no people, 16:9',
  },
  {
    slug: '2026-japan-august-food-price-hike-korea-comparison',
    section: 'japan-trends',
    title: '8月食品値上げ日韓比較',
    p1: 'Japanese supermarket food shelves with price tags, grocery products, no people, 16:9',
    p2: 'grocery basket with vegetables and packaged food, price tag visible, clean background, 16:9',
    p3: 'food products arranged with price labels, consumer goods concept, 16:9',
  },
  {
    slug: '2026-japan-population-under-120m-foreign-residents-record',
    section: 'japan-trends',
    title: '日本人口1.2億割れ外国人最多',
    p1: 'Japan map silhouette with population data visualization, declining trend, dark background, 16:9',
    p2: 'diverse city pedestrian street scene, silhouettes only, Tokyo urban backdrop, 16:9',
    p3: 'demographic chart concept, population graph with Japan flag colors, 16:9',
  },
  // latest-tech
  {
    slug: 'korea-national-ai-computing-center-breakthrough-2026',
    section: 'latest-tech',
    title: '국가 AI 컴퓨팅센터 착공',
    p1: 'large AI data center under construction, server racks and cooling systems, wide shot, 16:9',
    p2: 'GPU computing cluster with LED lighting, supercomputer infrastructure, 16:9',
    p3: 'data center interior with rows of servers, blue LED glow, 16:9',
  },
  {
    slug: 'aws-ai-capex-surge-2026',
    section: 'latest-tech',
    title: 'AWS AI 투자 2200억불',
    p1: 'Amazon AWS cloud data center exterior, massive server facility at dusk, 16:9',
    p2: 'cloud computing investment concept, dollar sign and server icon with rising chart, 16:9',
    p3: 'cloud server rack closeup with orange Amazon brand colors, tech infrastructure, 16:9',
  },
  // society
  {
    slug: 'ready-core-survival-strategy-2026',
    section: 'society',
    title: '레디코어 생존전략 2026',
    p1: 'emergency preparedness kit bag on floor, water bottles and supplies organized, no people, 16:9',
    p2: 'survival essentials arranged on wooden surface, flashlight and first aid, still life, 16:9',
    p3: 'outdoor survival gear laid flat, prepper lifestyle concept, 16:9',
  },
  // trending-picks
  {
    slug: 'shoulder-massager-top3-2026',
    section: 'trending-picks',
    title: '목어깨 마사지기 TOP3',
    p1: 'neck shoulder massager device on white background, product photography, 16:9',
    p2: 'three massage devices lined up, comparison product shot, clean studio, 16:9',
    p3: 'shiatsu shoulder massager closeup, metallic design, dark background, 16:9',
  },
  {
    slug: 'wireless-calf-massager-top3-2026',
    section: 'trending-picks',
    title: '무선 종아리 마사지기 TOP3',
    p1: 'wireless calf leg massager device on white surface, product photography, 16:9',
    p2: 'calf compression massager three models comparison, clean background, 16:9',
    p3: 'leg massager device closeup, sleek design, dark background, 16:9',
  },
  {
    slug: 'desktop-wireless-cooling-fan-top3-2026',
    section: 'trending-picks',
    title: '탁상용 무선 냉풍기 TOP3',
    p1: 'small compact desk fan on white surface, product photography, clean shadow, 16:9',
    p2: 'three portable desk fans comparison lineup, summer appliances, 16:9',
    p3: 'white mini desktop fan closeup, minimal design, dark background, 16:9',
  },
  {
    slug: 'open-ear-earbuds-top3-20260803',
    section: 'trending-picks',
    title: '오픈형 무선 이어폰 TOP3',
    p1: 'open ear wireless earbuds on white surface, audio product photography, 16:9',
    p2: 'three open ear bluetooth earphones comparison, clean studio background, 16:9',
    p3: 'open ear earphone closeup, sleek design detail, dark background, 16:9',
  },
];

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;

  console.log(`🔄 잘못된 이미지 전체 재생성 — 총 ${TARGETS.length}개 포스팅`);
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

    try {
      await session.newConversation();

      // 중립 워밍업 후 새 대화로 컨텍스트 초기화
      await session.send('이미지를 만들어줘.').catch(() => {});
      await new Promise(r => setTimeout(r, 4000));
      await session.newConversation();
      await new Promise(r => setTimeout(r, 1500));

      await session.useImageMaker(
        `이미지 3장 생성:\n\n[1] ${t.p1}\n\n[2] ${t.p2}\n\n[3] ${t.p3}\n\n규칙: 텍스트·로고 없음, 얼굴 클로즈업 없음, 16:9 가로`
      );

      const buffers = await session.extractImagesFromLastResponse(1, 10000);
      const realImages = buffers.filter(b => b.length >= 30000);

      if (realImages.length === 0) {
        console.warn(`  ⚠️  생성 이미지 없음 (${buffers.length}장 중 30KB 이상 0장)`);
        failed++;
        failedList.push(t.slug);
        continue;
      }

      const sorted = [...realImages].sort((a, b) => b.length - a.length);
      const saves = [
        { buf: sorted[0],        dest: img01Path },
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
          const kb = Math.round(fs.statSync(dest).size / 1024);
          console.log(`  💾 ${path.basename(dest)} (${kb}KB)`);
          savedCount++;
        } catch (err) {
          console.warn(`  ⚠️  저장 실패: ${err.message}`);
        }
      }

      if (savedCount > 0) fixed++;
      else { failed++; failedList.push(t.slug); }

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

  if (fixed > 0) {
    const { execSync } = await import('child_process');
    try {
      execSync('git add content/', { cwd: ROOT, stdio: 'inherit' });
      execSync(`git commit -m "fix: 잘못된 캐시 이미지 재생성 (${fixed}건)"`, { cwd: ROOT, stdio: 'inherit' });
      execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
      console.log('✅ Git push 완료');
    } catch (err) {
      console.error('❌ Git push 실패:', err.message);
    }
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
