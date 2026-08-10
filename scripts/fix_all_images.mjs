#!/usr/bin/env node
/**
 * fix_all_images.mjs — 전체 섹션 이미지 일괄 복구
 * 썸네일/본문 이미지 누락·별 아이콘(< 60KB) 자동 감지 → Gemini 재생성
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const MIN_KB = 60;
const SECTIONS = [
  'latest-tech','economy','society','humanities','entertainment',
  'japan-trends','health','it-devices','kr-realestate',
  'world-travel','sports','us-trends','trending-picks'
];

// 섹션별 이미지 스타일 가이드
const SECTION_STYLE = {
  'latest-tech':  'abstract technology concept art, glowing circuits, dark background, futuristic, no text',
  'economy':      'clean business concept, financial charts or city skyline, professional, no text',
  'society':      'modern Korean urban scene or social concept, realistic, no text',
  'humanities':   'open book or library interior or philosophical concept, warm light, no text',
  'entertainment':'stage spotlight or concert atmosphere, colorful lights, no face close-up, no text',
  'japan-trends': 'Japanese cultural scene or nature landscape, soft colors, no text',
  'health':       'wellness and health concept, bright clean background, medical or nature, no text',
  'it-devices':   'tech gadget or device concept, studio lighting, clean background, no text, no logos',
  'kr-realestate':'Korean apartment complex or urban skyline, modern architecture, no text',
  'world-travel': 'travel destination landscape, vibrant colors, wide angle, no people, no text',
  'sports':       'sports stadium or action silhouette, dramatic lighting, no text',
  'us-trends':    'American city skyline or business concept, clean modern style, no text',
  'trending-picks':'lifestyle product flat-lay or home scene, clean background, no text, no logos',
};

// 제목에서 핵심 키워드 추출 → 프롬프트 생성
function makePrompts(title, section, slug) {
  const style = SECTION_STYLE[section] || 'concept illustration, clean background, no text';

  // 키워드 기반 맞춤 프롬프트
  const kw = (title + ' ' + slug).toLowerCase();

  let scene1, scene2, scene3;

  if (kw.match(/keyboard|키보드/)) {
    scene1 = `premium wireless mechanical keyboard on clean desk, soft ambient light, no brand logos, 16:9`;
    scene2 = `three compact keyboards side by side on white surface, comparison product shot, no text, 16:9`;
    scene3 = `close-up of backlit keyboard keys glowing softly in dark studio, 16:9`;
  } else if (kw.match(/typhoon|台風|태풍/)) {
    scene1 = `dramatic satellite view of spiral typhoon over dark ocean, weather concept, 16:9`;
    scene2 = `empty Japanese train platform in heavy rain, overcast sky, no people, no text, 16:9`;
    scene3 = `Japanese torii gate in strong wind and rain, stormy atmosphere, no text, 16:9`;
  } else if (kw.match(/화사|hwasa|jensen|손편지|handwritten/)) {
    scene1 = `elegant handwritten letter on aged paper with fountain pen, warm close-up light, no text visible, 16:9`;
    scene2 = `colorful concert stage with spotlight beams and crowd silhouettes, no identifiable people, 16:9`;
    scene3 = `tech conference stage with large screen and audience, no identifiable faces, 16:9`;
  } else if (kw.match(/heatwave|폭염|야간운동|night.*workout|workout.*night/)) {
    scene1 = `empty city street at night with heat haze effect under yellow streetlights, summer atmosphere, no people, 16:9`;
    scene2 = `silhouette of runner on urban road at dusk, city lights background, no face visible, 16:9`;
    scene3 = `close-up of red thermometer showing extreme temperature, outdoor summer, no text, 16:9`;
  } else if (kw.match(/bus.*house|버스하우스|청년주택/)) {
    scene1 = `creative housing from converted buses parked in urban area, modern adaptive reuse concept, 16:9`;
    scene2 = `compact micro-apartment interior with smart furniture, minimalist modern design, no people, 16:9`;
    scene3 = `modern affordable housing complex exterior, urban neighborhood, blue sky, no text, 16:9`;
  } else if (kw.match(/spain|스페인|airport.*strike|파업/)) {
    scene1 = `busy international airport departure hall with crowds and luggage, travel scene, no readable text, 16:9`;
    scene2 = `flight departure board with multiple cancelled entries, airport interior, blurred text, 16:9`;
    scene3 = `grounded airplane at terminal gate with empty tarmac, overcast sky, 16:9`;
  } else if (kw.match(/tariff|관세|supply.*chain|무역/)) {
    scene1 = `cargo shipping containers stacked at port with crane, global trade concept, 16:9`;
    scene2 = `circuit boards and microchips on industrial line, tech manufacturing, no text, 16:9`;
    scene3 = `abstract world map with trade route lines and tech icons, concept illustration, no text, 16:9`;
  } else if (kw.match(/robot.*vacuum|로봇청소기/)) {
    scene1 = `round robot vacuum cleaner on light wood floor, minimal living room, no text, 16:9`;
    scene2 = `three different robot vacuum models on white surface, product comparison, no logos, 16:9`;
    scene3 = `robot vacuum docked at charging station glowing LED, close-up, dark background, 16:9`;
  } else if (kw.match(/laptop|노트북|pc|컴퓨터/)) {
    scene1 = `sleek thin laptop open on clean wooden desk, natural daylight, no screen content, 16:9`;
    scene2 = `three different laptops side by side comparison, studio white background, no logos, 16:9`;
    scene3 = `laptop with glowing keyboard in dark room, RGB backlight, no text, 16:9`;
  } else if (kw.match(/galaxy|갤럭시/)) {
    scene1 = `slim modern smartphone on white marble surface, soft studio light, no brand logos, 16:9`;
    scene2 = `two smartphones side by side showing screens, tech comparison, blurred screens, no text, 16:9`;
    scene3 = `smartphone displaying colorful abstract screen wallpaper, close-up detail, no text, 16:9`;
  } else if (kw.match(/smartwatch|스마트워치|watch/)) {
    scene1 = `premium smartwatch on wrist of person running outdoors, sport lifestyle, no face shown, 16:9`;
    scene2 = `three smartwatches lined up on white surface, tech comparison, no brand logos, no text, 16:9`;
    scene3 = `smartwatch showing health metrics on blurred display, close-up on dark background, 16:9`;
  } else if (kw.match(/realestate|부동산|apartment|아파트|주택|전세|임대/)) {
    scene1 = `modern Korean high-rise apartment buildings against blue sky, urban skyline, no text, 16:9`;
    scene2 = `aerial view of residential apartment complex with park, urban planning concept, 16:9`;
    scene3 = `clean real estate office interior with city view through window, professional, no text, 16:9`;
  } else if (kw.match(/health|건강|diet|다이어트|운동|의료|병원/)) {
    scene1 = `fresh healthy vegetables and fruits on white table, nutrition concept, bright studio light, 16:9`;
    scene2 = `wellness concept with yoga mat and water bottle in natural light, no people, 16:9`;
    scene3 = `clean medical white background with health symbols, minimal, no text, 16:9`;
  } else if (kw.match(/etf|주식|투자|코스피|금융|경제/)) {
    scene1 = `abstract financial chart with rising trend lines on dark background, no text, 16:9`;
    scene2 = `modern business district skyline at golden hour, Seoul-style urban, no text, 16:9`;
    scene3 = `close-up of coins and growth chart concept, economy illustration, clean, no text, 16:9`;
  } else if (kw.match(/travel|여행|스페인|유럽|europe/)) {
    scene1 = `scenic European street or landmark wide-angle, warm golden light, no people, no text, 16:9`;
    scene2 = `airplane window view with clouds and landscape below, travel concept, 16:9`;
    scene3 = `travel suitcases and passport on world map, adventure concept, no text, 16:9`;
  } else if (kw.match(/soccer|football|축구|월드컵|worldcup|손흥민|kim.*min|바이에른/)) {
    scene1 = `dramatic football stadium under floodlights at night, green pitch, no text, 16:9`;
    scene2 = `football flying toward goal net in stadium, action shot, no identifiable players, 16:9`;
    scene3 = `empty team bench in large stadium with crowd in background, sports atmosphere, 16:9`;
  } else if (kw.match(/japan|일본|nisa|니사|오본/)) {
    scene1 = `traditional Japanese torii gate with cherry blossom or seasonal scene, peaceful, no text, 16:9`;
    scene2 = `Tokyo cityscape at dusk with neon reflections, modern Japan, no text, 16:9`;
    scene3 = `Japanese temple garden with stone path and greenery, serene, no text, 16:9`;
  } else if (kw.match(/ai|인공지능|humanoid|robot|로봇/)) {
    scene1 = `futuristic AI concept with glowing neural network visualization, dark background, no text, 16:9`;
    scene2 = `abstract machine learning concept with glowing data nodes, blue tones, no text, 16:9`;
    scene3 = `modern server room with blue lighting, technology infrastructure, no text, 16:9`;
  } else {
    // 기본 섹션 스타일 프롬프트
    const base = style.replace(/, no text$/, '');
    scene1 = `${base}, wide landscape composition, vibrant, 16:9, no text`;
    scene2 = `${base}, close-up detail shot, dramatic lighting, 16:9, no text`;
    scene3 = `${base}, overhead flat-lay perspective, clean, 16:9, no text`;
  }

  return [scene1, scene2, scene3];
}

// 누락/불량 포스팅 스캔
function scanMissing() {
  const targets = [];
  for (const section of SECTIONS) {
    const dir = path.join(ROOT, 'content', 'posts', section);
    if (!fs.existsSync(dir)) continue;
    for (const slug of fs.readdirSync(dir)) {
      const d = path.join(dir, slug);
      if (!fs.statSync(d).isDirectory()) continue;
      const mdPath = path.join(d, 'index.md');
      if (!fs.existsSync(mdPath)) continue;
      const p01 = path.join(d, `${slug}-01.webp`);
      const p02 = path.join(d, `${slug}-02.webp`);
      const pth = path.join(d, `${slug}-thumb.webp`);
      const check = p => fs.existsSync(p) && fs.statSync(p).size >= MIN_KB * 1024;
      if (check(p01) && check(p02) && check(pth)) continue;
      const md = fs.readFileSync(mdPath, 'utf8');
      const m = md.match(/^title:\s*["']?(.+?)["']?\s*$/m);
      const title = m ? m[1].replace(/["']/g, '').trim() : slug;
      targets.push({ slug, section, title, paths: { p01, p02, pth } });
    }
  }
  return targets;
}

async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;
  const { execSync } = await import('child_process');

  const targets = scanMissing();
  console.log(`🔍 스캔 결과: ${targets.length}개 이미지 누락/불량\n`);

  const gemUrl = process.env.GEMINI_GEM_URL;
  if (!gemUrl) throw new Error('GEMINI_GEM_URL 미설정');
  console.log(`💎 Gem: ${gemUrl}\n`);

  const session = new GeminiSession({ headless: false, gemUrl });
  await session.init();

  let fixed = 0, failed = 0;
  const failedList = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const { slug, section, title, paths: { p01, p02, pth } } = t;
    console.log(`\n[${i + 1}/${targets.length}] [${section}] ${title.substring(0, 50)}`);

    // 기존 불량 파일 제거
    for (const p of [p01, p02, pth]) {
      if (fs.existsSync(p) && fs.statSync(p).size < MIN_KB * 1024) {
        fs.unlinkSync(p);
      }
    }

    // 이미 정상인 파일 목록
    const checkOk = p => fs.existsSync(p) && fs.statSync(p).size >= MIN_KB * 1024;
    if (checkOk(p01) && checkOk(p02) && checkOk(pth)) {
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
        const dests = [
          { buf: sorted[0], dest: p01 },
          { buf: sorted[1] ?? sorted[0], dest: p02 },
          { buf: sorted[2] ?? sorted[0], dest: pth },
        ].filter(({ dest }) => !checkOk(dest));

        for (const { buf, dest } of dests) {
          await sharp(buf)
            .resize(1280, 720, { fit: 'cover', position: 'centre' })
            .webp({ quality: 90, effort: 6 })
            .toFile(dest);
          const kb = Math.round(fs.statSync(dest).size / 1024);
          if (fs.statSync(dest).size < MIN_KB * 1024) {
            fs.unlinkSync(dest);
            console.warn(`  🗑️  ${path.basename(dest)} (${kb}KB) 별 아이콘`);
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
      try {
        execSync('git add content/', { cwd: ROOT, stdio: 'inherit' });
        execSync(`git commit -m "feat: ${slug} 이미지 재생성"`, { cwd: ROOT, stdio: 'inherit' });
        execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
        console.log(`  🚀 push 완료`);
      } catch (e) { console.error(`  ❌ push: ${e.message?.slice(0, 80)}`); }
    } else {
      failed++; failedList.push(`[${section}] ${slug}`);
    }

    await new Promise(r => setTimeout(r, 8000));
  }

  await session.close();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ 성공: ${fixed} / ❌ 실패: ${failed}`);
  if (failedList.length) {
    console.log('\n실패:');
    failedList.forEach(s => console.log('  ' + s));
  }
}

main().catch(e => { console.error('💥', e); process.exit(1); });
