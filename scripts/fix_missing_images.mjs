#!/usr/bin/env node
/**
 * fix_missing_images.mjs — 오늘 발행 포스팅 이미지 자동 복구
 * daily_runner.js 에서 7개 발행 후 자동 실행됨.
 * Pollinations 완전 폐기 → Gemini Pro 전용, 60KB 임계값
 *
 * 동작:
 *  1. 오늘 KST 날짜 기준으로 발행된 포스팅만 스캔 (빠름)
 *  2. -01 / -02 / -thumb.webp 가 없거나 60KB 미만이면 Gemini 재생성
 *  3. 커밋은 하지 않음 — daily_runner.js 가 후처리에서 git add/commit/push
 *  4. 실패 항목 있으면 텔레그램 알림
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const MIN_KB = 60;
const MIN_BYTES = MIN_KB * 1024;

const SECTIONS = [
  'latest-tech','economy','society','humanities','entertainment',
  'japan-trends','health','it-devices','kr-realestate',
  'world-travel','sports','us-trends','trending-picks',
];

const SECTION_STYLE = {
  'latest-tech':   'abstract technology concept art, glowing circuits, dark background, futuristic, no text',
  'economy':       'clean business concept, financial charts or city skyline, professional, no text',
  'society':       'modern Korean urban scene or social concept, realistic, no text',
  'humanities':    'open book or library interior or philosophical concept, warm light, no text',
  'entertainment': 'stage spotlight or concert atmosphere, colorful lights, no face close-up, no text',
  'japan-trends':  'Japanese cultural scene or nature landscape, soft colors, no text',
  'health':        'wellness and health concept, bright clean background, medical or nature, no text',
  'it-devices':    'tech gadget or device concept, studio lighting, clean background, no text, no logos',
  'kr-realestate': 'Korean apartment complex or urban skyline, modern architecture, no text',
  'world-travel':  'travel destination landscape, vibrant colors, wide angle, no people, no text',
  'sports':        'sports stadium or action silhouette, dramatic lighting, no text',
  'us-trends':     'American city skyline or business concept, clean modern style, no text',
  'trending-picks':'lifestyle product flat-lay or home scene, clean background, no text, no logos',
};

function makePrompts(title, section, slug) {
  const style = SECTION_STYLE[section] || 'concept illustration, clean background, no text';
  const kw = (title + ' ' + slug).toLowerCase();

  let s1, s2, s3;

  if (kw.match(/keyboard|키보드/)) {
    s1 = 'premium wireless mechanical keyboard on clean desk, soft ambient light, no brand logos, 16:9';
    s2 = 'three compact keyboards side by side on white surface, comparison product shot, no text, 16:9';
    s3 = 'close-up of backlit keyboard keys glowing softly in dark studio, 16:9';
  } else if (kw.match(/typhoon|台風|태풍/)) {
    s1 = 'dramatic satellite view of spiral typhoon over dark ocean, weather concept, 16:9';
    s2 = 'empty Japanese train platform in heavy rain, overcast sky, no people, no text, 16:9';
    s3 = 'Japanese torii gate in strong wind and rain, stormy atmosphere, no text, 16:9';
  } else if (kw.match(/robot.*vacuum|로봇청소기/)) {
    s1 = 'round robot vacuum cleaner on light wood floor, minimal living room, no text, 16:9';
    s2 = 'three different robot vacuum models on white surface, product comparison, no logos, 16:9';
    s3 = 'robot vacuum docked at charging station glowing LED, close-up, dark background, 16:9';
  } else if (kw.match(/laptop|노트북|mini.*pc|minipc/)) {
    s1 = 'sleek thin laptop open on clean wooden desk, natural daylight, no screen content, 16:9';
    s2 = 'three different laptops side by side comparison, studio white background, no logos, 16:9';
    s3 = 'laptop with glowing keyboard in dark room, RGB backlight, no text, 16:9';
  } else if (kw.match(/smartphone|phone|갤럭시|galaxy|아이폰|iphone/)) {
    s1 = 'slim modern smartphone on white marble surface, soft studio light, no brand logos, 16:9';
    s2 = 'two smartphones side by side showing screens, tech comparison, blurred screens, no text, 16:9';
    s3 = 'smartphone displaying colorful abstract screen wallpaper, close-up detail, no text, 16:9';
  } else if (kw.match(/smartwatch|스마트워치|watch|워치/)) {
    s1 = 'premium smartwatch on wrist of person running outdoors, sport lifestyle, no face shown, 16:9';
    s2 = 'three smartwatches lined up on white surface, tech comparison, no brand logos, no text, 16:9';
    s3 = 'smartwatch showing health metrics on blurred display, close-up on dark background, 16:9';
  } else if (kw.match(/earbuds|이어버즈|earphone|이어폰|headphone|헤드폰/)) {
    s1 = 'wireless earbuds in open charging case on clean surface, studio light, no logos, 16:9';
    s2 = 'three pairs of wireless earbuds comparison, white background, product shot, no text, 16:9';
    s3 = 'close-up earbuds with sound wave visualization, dark background, no text, 16:9';
  } else if (kw.match(/vacuum|청소기|dehumidifier|제습기|humidifier|가습기/)) {
    s1 = 'modern home appliance on clean floor, minimal interior, studio light, no logos, 16:9';
    s2 = 'three home appliance models side by side, white background, product comparison, 16:9';
    s3 = 'appliance detail with status LED glowing, dark background, 16:9';
  } else if (kw.match(/massager|안마기|마사지/)) {
    s1 = 'wireless massage device on white surface, lifestyle product shot, no text, 16:9';
    s2 = 'three massage products comparison, clean background, no logos, 16:9';
    s3 = 'massage device close-up with vibration effect visualization, dark background, 16:9';
  } else if (kw.match(/cooling|fan|선풍기|쿨링/)) {
    s1 = 'sleek desk fan on modern workspace, minimal, no logos, 16:9';
    s2 = 'three portable fans comparison on white background, product shot, 16:9';
    s3 = 'fan blades with motion blur effect, close-up, dark background, 16:9';
  } else if (kw.match(/powerbank|보조배터리|charger|충전기|magsafe/)) {
    s1 = 'portable power bank with cables on clean desk, product shot, no logos, 16:9';
    s2 = 'three charger products comparison, white background, no text, 16:9';
    s3 = 'power bank glowing LED indicator, dark background, close-up, 16:9';
  } else if (kw.match(/realestate|부동산|apartment|아파트|전세|임대|주택/)) {
    s1 = 'modern Korean high-rise apartment buildings against blue sky, urban skyline, no text, 16:9';
    s2 = 'aerial view of residential apartment complex with park, urban planning concept, 16:9';
    s3 = 'clean real estate office interior with city view through window, professional, no text, 16:9';
  } else if (kw.match(/health|건강|diet|다이어트|운동|의료|병원|exercise/)) {
    s1 = 'fresh healthy vegetables and fruits on white table, nutrition concept, bright studio light, 16:9';
    s2 = 'wellness concept with yoga mat and water bottle in natural light, no people, 16:9';
    s3 = 'clean medical white background with health symbols, minimal, no text, 16:9';
  } else if (kw.match(/etf|주식|투자|코스피|금융|경제|stock/)) {
    s1 = 'abstract financial chart with rising trend lines on dark background, no text, 16:9';
    s2 = 'modern business district skyline at golden hour, Seoul-style urban, no text, 16:9';
    s3 = 'close-up of coins and growth chart concept, economy illustration, clean, no text, 16:9';
  } else if (kw.match(/travel|여행|유럽|europe|japan|일본/)) {
    s1 = 'scenic travel destination wide-angle, warm golden light, no people, no text, 16:9';
    s2 = 'airplane window view with clouds and landscape below, travel concept, 16:9';
    s3 = 'travel suitcases and passport on world map, adventure concept, no text, 16:9';
  } else if (kw.match(/soccer|football|축구|스포츠|sports|baseball|야구/)) {
    s1 = 'dramatic sports stadium under floodlights at night, green field, no text, 16:9';
    s2 = 'ball flying toward goal net, action shot, no identifiable players, 16:9';
    s3 = 'empty team bench in large stadium with crowd in background, sports atmosphere, 16:9';
  } else if (kw.match(/ai|인공지능|humanoid|robot|로봇|tech|technology/)) {
    s1 = 'futuristic AI concept with glowing neural network visualization, dark background, no text, 16:9';
    s2 = 'abstract machine learning concept with glowing data nodes, blue tones, no text, 16:9';
    s3 = 'modern server room with blue lighting, technology infrastructure, no text, 16:9';
  } else if (kw.match(/deskterior|desk|workspace|홈오피스|홈카페/)) {
    s1 = 'aesthetic minimalist desk setup with monitor and plants, cozy workspace, no text, 16:9';
    s2 = 'flat-lay of desk accessories on white surface, lifestyle product shot, no text, 16:9';
    s3 = 'warm desk lamp lighting on wooden desk at night, cozy atmosphere, 16:9';
  } else {
    const base = style.replace(/, no text$/, '');
    s1 = `${base}, wide landscape composition, vibrant, 16:9, no text`;
    s2 = `${base}, close-up detail shot, dramatic lighting, 16:9, no text`;
    s3 = `${base}, overhead flat-lay perspective, clean, 16:9, no text`;
  }

  return [s1, s2, s3];
}

// 오늘 KST 날짜 (YYYY-MM-DD)
function todayKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function scanTodayMissing() {
  const today = todayKST();
  const targets = [];

  for (const section of SECTIONS) {
    const dir = path.join(ROOT, 'content', 'posts', section);
    if (!fs.existsSync(dir)) continue;

    for (const slug of fs.readdirSync(dir)) {
      const d = path.join(dir, slug);
      if (!fs.statSync(d).isDirectory()) continue;
      const mdPath = path.join(d, 'index.md');
      if (!fs.existsSync(mdPath)) continue;

      const md = fs.readFileSync(mdPath, 'utf8');
      // 오늘 날짜 포스팅만 처리
      const dateMatch = md.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m);
      if (!dateMatch || dateMatch[1] !== today) continue;

      const p01 = path.join(d, `${slug}-01.webp`);
      const p02 = path.join(d, `${slug}-02.webp`);
      const pth = path.join(d, `${slug}-thumb.webp`);
      const ok = p => fs.existsSync(p) && fs.statSync(p).size >= MIN_BYTES;

      if (ok(p01) && ok(p02) && ok(pth)) continue;

      const m = md.match(/^title:\s*["']?(.+?)["']?\s*$/m);
      const title = m ? m[1].replace(/["']/g, '').trim() : slug;
      targets.push({ slug, section, title, p01, p02, pth });
    }
  }
  return targets;
}

async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;

  const targets = scanTodayMissing();

  if (targets.length === 0) {
    console.log('✅ 오늘 발행 포스팅 이미지 모두 정상 (60KB↑)');
    process.exit(0);
  }

  console.log(`🔍 오늘 발행 이미지 누락/불량: ${targets.length}개 포스팅\n`);

  const gemUrl = process.env.GEMINI_GEM_URL;
  if (!gemUrl) {
    console.error('❌ GEMINI_GEM_URL 미설정 — 자동복구 불가');
    try {
      const { sendTelegram } = await import('./telegram.js');
      const list = targets.map(t => `  · [${t.section}] ${t.slug}`).join('\n');
      await sendTelegram(`⚠️ 오늘 발행 이미지 ${targets.length}건 누락\nGEMINI_GEM_URL 미설정\n${list}`);
    } catch {}
    process.exit(1);
  }

  console.log(`💎 Gem: ${gemUrl}\n`);

  const session = new GeminiSession({ headless: false, gemUrl });
  await session.init();

  let fixed = 0;
  const failedList = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const { slug, section, title, p01, p02, pth } = t;
    console.log(`\n[${i + 1}/${targets.length}] [${section}] ${title.substring(0, 50)}`);

    const ok = p => fs.existsSync(p) && fs.statSync(p).size >= MIN_BYTES;

    // 불량 파일 제거
    for (const p of [p01, p02, pth]) {
      if (fs.existsSync(p) && fs.statSync(p).size < MIN_BYTES) {
        fs.unlinkSync(p);
        console.log(`  🗑️  삭제: ${path.basename(p)}`);
      }
    }

    if (ok(p01) && ok(p02) && ok(pth)) {
      console.log('  ✅ 이미 정상 — 스킵');
      continue;
    }

    const [s1, s2, s3] = makePrompts(title, section, slug);
    const prompt = `이미지 3장 생성:\n\n[1] ${s1}\n\n[2] ${s2}\n\n[3] ${s3}\n\n규칙: 텍스트·로고 없음, 얼굴 클로즈업 없음, 16:9 가로`;

    let savedCount = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt === 2) {
        console.log('  🔁 재시도...');
        await new Promise(r => setTimeout(r, 15000));
      }
      try {
        await session.newConversation();
        session._turnCount = 1;
        let resp = '';
        try { resp = await session.send('안녕', { timeout: 25000 }); } catch {}
        if (!resp?.length) await new Promise(r => setTimeout(r, 5000));
        session._turnCount = 0;

        await session.useImageMaker(prompt);
        const buffers = await session.extractImagesFromLastResponse(1, 25000);

        if (buffers.length === 0) {
          console.warn(`  ⚠️  0장 캡처 (attempt ${attempt})`);
          continue;
        }

        const sorted = [...buffers].sort((a, b) => b.length - a.length);
        const needFix = [
          { buf: sorted[0],           dest: p01 },
          { buf: sorted[1] ?? sorted[0], dest: p02 },
          { buf: sorted[2] ?? sorted[0], dest: pth },
        ].filter(({ dest }) => !ok(dest));

        for (const { buf, dest } of needFix) {
          await sharp(buf)
            .resize(1280, 720, { fit: 'cover', position: 'centre' })
            .webp({ quality: 90, effort: 6 })
            .toFile(dest);
          const kb = Math.round(fs.statSync(dest).size / 1024);
          if (fs.statSync(dest).size < MIN_BYTES) {
            fs.unlinkSync(dest);
            console.warn(`  🗑️  ${path.basename(dest)} (${kb}KB) — 별 아이콘`);
          } else {
            console.log(`  💾 ${path.basename(dest)} (${kb}KB)`);
            savedCount++;
          }
        }
        if (savedCount > 0) break;
      } catch (err) {
        console.error(`  💥 attempt ${attempt}: ${err.message?.slice(0, 80)}`);
      }
    }

    if (savedCount > 0) {
      fixed++;
    } else {
      failedList.push(`[${section}] ${slug}`);
    }

    await new Promise(r => setTimeout(r, 8000));
  }

  await session.close();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 복구 성공: ${fixed} / ❌ 실패: ${failedList.length}`);

  if (failedList.length > 0) {
    console.log('\n실패 목록:');
    failedList.forEach(s => console.log('  · ' + s));
    try {
      const { sendTelegram } = await import('./telegram.js');
      const list = failedList.map(s => `  · ${s}`).join('\n');
      await sendTelegram(
        `⚠️ 오늘 이미지 자동복구 완료\n✅ 성공: ${fixed}개\n❌ 실패: ${failedList.length}개\n${list}\n→ 수동 복구: node scripts/fix_bad_thumbs.mjs`
      );
    } catch {}
  } else if (fixed > 0) {
    try {
      const { sendTelegram } = await import('./telegram.js');
      await sendTelegram(`✅ 오늘 이미지 자동복구 완료: ${fixed}개 성공`);
    } catch {}
  }
}

main().catch(e => { console.error('💥', e); process.exit(1); });
