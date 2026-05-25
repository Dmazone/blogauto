/**
 * regen_images.mjs — 잘못된 이미지 전면 재생성 (Pollinations.ai)
 * 실행: node scripts/regen_images.mjs
 */
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, '..', 'static', 'images');

function downloadUrl(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = proto.get(url, { timeout: 120000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlinkSync(destPath);
        return downloadUrl(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', (e) => { file.close(); try { fs.unlinkSync(destPath); } catch(_) {} reject(e); });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function genImage(prompt, filename, seed, isThumb = false) {
  const w = isThumb ? 800 : 1200;
  const h = isThumb ? 800 : 630;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`;
  const dest = path.join(IMAGES_DIR, filename);
  console.log(`  ⬇️  ${filename} (seed=${seed})`);
  await downloadUrl(url, dest);
  const size = (fs.statSync(dest).size / 1024).toFixed(0);
  console.log(`  ✅ ${filename} (${size}KB)`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 재생성 목록 ──────────────────────────────────────────────────────────────
// [slug, index, prompt, seed, isThumb]
const REGEN_LIST = [

  // ─── 환율 포스트 (economy): Seoul 아파트 이미지 → 외환/시장 이미지
  ['korea-exchange-rate-crisis-2026', '01',
    'Korean foreign exchange trading room, multiple monitors showing dollar won exchange rate at 1500 won, red upward surge graph, dramatic cinematic lighting, photorealistic',
    101, false],
  ['korea-exchange-rate-crisis-2026', '02',
    'Korean supermarket shelves with imported fruits and groceries, price tags showing inflated prices, shopping cart with expensive items, Korean market interior, photorealistic',
    102, false],
  ['korea-exchange-rate-crisis-2026', 'thumb',
    'Korean won and US dollar currency exchange concept, financial chart arrow pointing up at 1500 won level, gold coins and bills, clean infographic style, dark blue background',
    103, true],

  // ─── 1.5가구 포스트 (society): Seoul 아파트 → 코리빙 하우스 내부
  ['one-half-household-lifestyle-2026', '01',
    'Cozy modern co-living private bedroom in Korea, warm sunlight through window, minimalistic Scandinavian furniture, soft white bedding, peaceful atmosphere, photorealistic interior',
    201, false],
  ['one-half-household-lifestyle-2026', '02',
    'Bright modern shared kitchen and lounge in Korean co-living space, young professionals cooking together, warm lighting, clean contemporary design, photorealistic',
    202, false],
  ['one-half-household-lifestyle-2026', 'thumb',
    'Modern Korean co-living apartment concept, split view showing private bedroom and shared living space, warm cozy lighting, architectural illustration style',
    203, true],

  // ─── 웨어러블 생체인식 썸네일: Seoul 아파트 → 스마트워치
  ['wearable-biometric-security-future', 'thumb',
    'Close-up of smartwatch on wrist scanning heartbeat biometric data, glowing blue ECG pulse lines, dark background, futuristic cybersecurity concept, photorealistic',
    301, true],

  // ─── 월드컵 포스트 (sports): 삼성 갤럭시 폰 → 축구 이미지
  ['korea-world-cup-2026-challenge', '01',
    'Korean national football team in red jerseys celebrating goal at FIFA World Cup 2026, packed stadium with fans, dramatic action shot, golden confetti, photorealistic',
    401, false],
  ['korea-world-cup-2026-challenge', '02',
    'South Korean football fans in red T-shirts waving flags at World Cup stadium, sea of red supporters, passionate crowd, sunset lighting, photorealistic',
    402, false],
  ['korea-world-cup-2026-challenge', 'thumb',
    'South Korea national football team badge and FIFA World Cup 2026 trophy concept, dramatic lighting, red and blue colors, sports photography style',
    403, true],

  // ─── 월드컵 미리보기 포스트: 내부 이미지 중복 해결
  ['worldcup-2026-korea-preview', '01',
    'FIFA World Cup 2026 stadium in USA, massive modern arena with North American skyline, green pitch, global football event atmosphere, aerial view photorealistic',
    411, false],
  ['worldcup-2026-korea-preview', '02',
    'South Korean football star striker in action, kicking ball with powerful shot, dynamic pose, World Cup stadium background, sports photography, photorealistic',
    412, false],

  // ─── 인문 트렌드 (humanities-1779345750738): AI 서버룸 → 인문학 이미지
  ['humanities-1779345750738', '01',
    'Ancient Greek philosophy concept, Socrates and students in agora, classical marble architecture, golden hour light, oil painting style illustration',
    501, false],
  ['humanities-1779345750738', '02',
    'Open classic philosophy books spread on wooden library desk, warm lamp light, quill pen, antique globe, intellectual humanities atmosphere, photorealistic',
    502, false],

  // ─── 스토아 철학 (stoicism-modern-life-2026): AI 서버룸 → 철학 이미지
  ['stoicism-modern-life-2026', '01',
    'Stoic philosopher Marcus Aurelius marble bust, ancient Roman temple column in background, dramatic chiaroscuro lighting, philosophy concept art',
    601, false],
  ['stoicism-modern-life-2026', '02',
    'Modern professional person in quiet meditation at minimalist desk, serene expression practicing stoic mindfulness, soft natural light, photorealistic',
    602, false],

  // ─── 스토아+불안 포스트 썸네일: 다이어트 이미지가 들어가 있음
  ['stoic-philosophy-anxiety-2026', 'thumb',
    'Stoic ancient coin with Marcus Aurelius profile and modern anxiety relief concept, calm ocean background, philosophical balance symbol, premium art style',
    611, true],

  // ─── 가계부채 포스트 (economy): 일본 벚꽃 → 가계부채 개념
  ['korea-household-debt-2026', '01',
    'Korean household debt concept, stressed Korean family looking at loan documents and bills, calculator, Korean won banknotes on table, worried expression, photorealistic',
    701, false],
  ['korea-household-debt-2026', '02',
    'Korean real estate mortgage and debt chart, apartment building with increasing debt graph overlay, financial pressure visualization, Korea economy infographic',
    702, false],

  // ─── 최신기술 1779345179667: 일본 벚꽃 → 기술 이미지
  ['latest-tech-1779345179667', '01',
    'Futuristic AI technology concept, glowing neural network connected across holographic display, blue and purple neon tech background, 3D render photorealistic',
    801, false],
  ['latest-tech-1779345179667', '02',
    'Korean tech startup team working on AI development, multiple screens showing code and data, modern Seoul office with city view, photorealistic',
    802, false],

  // ─── IT기기 1779346652786: 내부 중복 이미지 해결
  ['it-devices-1779346652786', '01',
    'Array of latest 2026 tech gadgets flat lay, smartphone tablet laptop smartwatch wireless earbuds, premium product photography on dark background',
    901, false],
  ['it-devices-1779346652786', '02',
    'Modern electronics store display with AI-powered devices, customer comparing smart gadgets, futuristic product showcase, Korean retail interior, photorealistic',
    902, false],

  // ─── 디지털 피로 포스트: ai-agent와 동일 이미지 해결
  ['digital-fatigue-disconnection-2026', '01',
    'Person overwhelmed by smartphone notifications, multiple app icons floating around stressed face, digital overload concept, blurred screen light, photorealistic',
    1001, false],
  ['digital-fatigue-disconnection-2026', '02',
    'Person in nature disconnecting from phone, smartphone left on rock beside peaceful forest stream, digital detox freedom concept, golden hour light, photorealistic',
    1002, false],

  // ─── 연예이슈 1779346062810: 노트북 이미지 제거
  ['entertainment-1779346062810', '01',
    'K-pop idol group performing on stage with colorful lights and confetti, excited Korean fans holding glowsticks, concert hall atmosphere, photorealistic',
    1101, false],
  ['entertainment-1779346062810', '02',
    'Korean drama filming set with director and actors, camera crew on location, behind the scenes K-drama production, photorealistic',
    1102, false],

  // ─── 건강 트렌드 1779346374831: 잘못된 이미지 교체
  ['health-1779346374831', '01',
    'Healthy Korean lifestyle concept, person doing morning yoga on rooftop with Seoul city view, zen wellness atmosphere, golden sunrise, photorealistic',
    1201, false],
  ['health-1779346374831', '02',
    'Nutritious Korean meal prep with colorful vegetables, lean protein, balanced diet portions in containers, clean eating concept, food photography',
    1202, false],

  // ─── 경제성장률 포스트: 잘못된 교차 이미지 해결
  ['korea-economy-gdp-growth-2026', '01',
    'South Korea GDP growth chart rising, Korean economic indicators on financial dashboard, National Assembly building Seoul background, economic data visualization',
    1301, false],
  ['korea-economy-gdp-growth-2026', '02',
    'Korean factory workers in semiconductor fabrication plant, high-tech manufacturing with robotic arms, POSCO steel mill atmosphere, industrial economy, photorealistic',
    1302, false],

  // ─── 여름여행 썸네일: 갤럭시 폰 이미지 교체
  ['summer-travel-cities-2026', 'thumb',
    'Summer travel destination collage, tropical beach city skyline and ancient temple, bright blue sky, vacation wanderlust concept, travel photography',
    1401, true],

  // ─── 갤럭시 S26 포스트 -02: 월드컵 이미지와 동일 해결
  ['galaxy-s26-ai-features-2026', '02',
    'Samsung Galaxy S26 ultra-thin smartphone in hand showing AI assistant interface, vibrant AMOLED display, premium product photography, dark studio background',
    1501, false],

  // ─── 간헐적단식 썸네일: 갤럭시 폰 이미지 교체
  ['intermittent-fasting-diet-2026', 'thumb',
    'Intermittent fasting concept, clock showing eating window with healthy food and empty plate, fork and timer, clean diet lifestyle infographic style',
    1601, true],

  // ─── edge-ai chip: -01과 thumb이 동일 이미지
  ['edge-ai-chip-future-2026', 'thumb',
    'Edge AI microchip glowing concept, tiny semiconductor chip with neural network data flowing, wearable device integration, gold and blue premium tech art',
    1701, true],

  // ─── kdrama-global: -01이 가계부채-02와 동일
  ['kdrama-global-2026', '01',
    'Global streaming platform showing Korean drama series, world map with Netflix icons connected to Korea, international K-drama fans watching, photorealistic',
    1801, false],

  // ─── office-workout: entertainment-01과 동일
  ['office-workout-routine-2026', '01',
    'Office worker doing desk stretching exercises, ergonomic workspace with standing desk, Korean professional doing shoulder roll and neck stretch, photorealistic',
    1901, false],

  // ─── low-birth-housing: korea-rate-change-02와 동일
  ['low-birth-housing-2026', '01',
    'Young Korean couple holding baby and looking worried at apartment building exterior, housing cost and low birth rate concept, urban Korea, photorealistic',
    2001, false],

  // ─── ai-agent-autonomous -02: digital-fatigue-02와 동일
  ['ai-agent-autonomous-2026', '02',
    'Autonomous AI agent working independently on multiple tasks, robotic hand typing on keyboard with digital interface, automation concept, blue glow, 3D render',
    2101, false],

  // ─── society-1779345463486 -01: health-01과 동일
  ['society-1779345463486', '01',
    'Modern Korean society trend analysis concept, diverse group of young Koreans in urban setting, social media influence and lifestyle changes, editorial photography',
    2201, false],
];

async function main() {
  console.log(`\n🎨 이미지 재생성 시작 — 총 ${REGEN_LIST.length}개\n`);
  let ok = 0, fail = 0;

  for (const [slug, idx, prompt, seed, isThumb] of REGEN_LIST) {
    const filename = idx === 'thumb' ? `${slug}-thumb.webp` : `${slug}-${idx}.webp`;
    console.log(`\n📸 [${slug}] ${filename}`);
    try {
      await genImage(prompt, filename, seed, isThumb);
      ok++;
    } catch (err) {
      console.error(`  ❌ 실패: ${err.message}`);
      fail++;
    }
    await sleep(1500); // Pollinations 레이트 리밋 방지
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ 완료: ${ok}개 성공 / ${fail}개 실패`);
  console.log('='.repeat(60));
  console.log('\n다음 명령으로 git 커밋하세요:');
  console.log('  git add static/images/ && git commit -m "fix: 전체 포스팅 이미지 재생성 (내용 일치)"');
}

main().catch(err => { console.error('치명적 오류:', err.message); process.exit(1); });
