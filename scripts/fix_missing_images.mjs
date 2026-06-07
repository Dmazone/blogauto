/**
 * fix_missing_images.mjs
 * 누락 이미지 복구 — Stable Horde 병렬 제출 + 병렬 폴링
 * 익명 키 제한: width/height ≤ 640 → sharp로 1280x720 업스케일
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const IMAGES = [
  // economy
  { dir:'content/posts/economy/won-dollar-1540-fx-investment', file:'won-dollar-1540-fx-investment-01.webp',
    prompt:'US dollar Korean won exchange rate surging arrow graph financial crisis concept, wide landscape' },
  { dir:'content/posts/economy/won-dollar-1540-fx-investment', file:'won-dollar-1540-fx-investment-02.webp',
    prompt:'investor analyzing forex currency chart dollar investment strategy professional office, wide landscape' },
  { dir:'content/posts/economy/won-dollar-1540-fx-investment', file:'won-dollar-1540-fx-investment-thumb.webp',
    prompt:'dollar exchange rate Korea financial editorial cover, bold colors, wide landscape, no text' },

  // entertainment - ki-an84
  { dir:'content/posts/entertainment/ki-an84-netflix-variety-2026', file:'ki-an84-netflix-variety-2026-01.webp',
    prompt:'Netflix variety show filming set production camera crew Korean entertainment broadcast studio, wide landscape' },
  { dir:'content/posts/entertainment/ki-an84-netflix-variety-2026', file:'ki-an84-netflix-variety-2026-02.webp',
    prompt:'streaming platform success rating chart comparison variety show analytics, wide landscape, no text' },
  { dir:'content/posts/entertainment/ki-an84-netflix-variety-2026', file:'ki-an84-netflix-variety-2026-thumb.webp',
    prompt:'Netflix Korean variety show entertainment editorial cover, bold vibrant colors, wide landscape, no text' },

  // entertainment - park-seo-jin
  { dir:'content/posts/entertainment/park-seo-jin-weight-gain-2026', file:'park-seo-jin-weight-gain-2026-01.webp',
    prompt:'Korean actor fitness body transformation workout gym training health lifestyle photography, wide landscape' },
  { dir:'content/posts/entertainment/park-seo-jin-weight-gain-2026', file:'park-seo-jin-weight-gain-2026-02.webp',
    prompt:'body transformation fitness journey progress visual comparison before after, wide landscape, no text' },
  { dir:'content/posts/entertainment/park-seo-jin-weight-gain-2026', file:'park-seo-jin-weight-gain-2026-thumb.webp',
    prompt:'Korean entertainment celebrity fitness transformation editorial cover, bold colors, wide landscape, no text' },

  // health - hyrox
  { dir:'content/posts/health/hyrox-hybrid-fitness-trend-2026', file:'hyrox-hybrid-fitness-trend-2026-01.webp',
    prompt:'HYROX hybrid fitness race athletes running rowing functional training competition, wide landscape' },
  { dir:'content/posts/health/hyrox-hybrid-fitness-trend-2026', file:'hyrox-hybrid-fitness-trend-2026-02.webp',
    prompt:'functional fitness training stations obstacle course hybrid workout guide, wide landscape, no text' },
  { dir:'content/posts/health/hyrox-hybrid-fitness-trend-2026', file:'hyrox-hybrid-fitness-trend-2026-thumb.webp',
    prompt:'HYROX hybrid fitness 2026 sport editorial cover, bold dynamic colors, wide landscape, no text' },

  // humanities - ai era
  { dir:'content/posts/humanities/ai-era-humanities-prompting-skills-2026', file:'ai-era-humanities-prompting-skills-2026-01.webp',
    prompt:'human asking questions AI digital brain concept philosophy technology warm minimal aesthetic, wide landscape' },
  { dir:'content/posts/humanities/ai-era-humanities-prompting-skills-2026', file:'ai-era-humanities-prompting-skills-2026-02.webp',
    prompt:'critical thinking questioning skills vs AI automation comparison diagram visual, wide landscape, no text' },
  { dir:'content/posts/humanities/ai-era-humanities-prompting-skills-2026', file:'ai-era-humanities-prompting-skills-2026-thumb.webp',
    prompt:'humanities questioning AI era intellectual editorial cover, warm bold colors, wide landscape, no text' },

  // humanities - slow reading
  { dir:'content/posts/humanities/slow-reading-ai-literacy-2026', file:'slow-reading-ai-literacy-2026-01.webp',
    prompt:'person reading book slowly cafe window light mindful reading cozy warm atmosphere, wide landscape' },
  { dir:'content/posts/humanities/slow-reading-ai-literacy-2026', file:'slow-reading-ai-literacy-2026-02.webp',
    prompt:'slow deep reading vs fast digital scrolling comparison book vs phone visual, wide landscape, no text' },
  { dir:'content/posts/humanities/slow-reading-ai-literacy-2026', file:'slow-reading-ai-literacy-2026-thumb.webp',
    prompt:'slow reading literacy editorial cover, warm earthy tones books, wide landscape, no text' },

  // it-devices - mini pc
  { dir:'content/posts/it-devices/ai-mini-pc-trend-guide-2026', file:'ai-mini-pc-trend-guide-2026-01.webp',
    prompt:'compact mini PC computer AI chip small form factor on clean desk tech product photography, wide landscape' },
  { dir:'content/posts/it-devices/ai-mini-pc-trend-guide-2026', file:'ai-mini-pc-trend-guide-2026-02.webp',
    prompt:'mini PC lineup comparison 2026 models side by side clean white background tech review, wide landscape' },
  { dir:'content/posts/it-devices/ai-mini-pc-trend-guide-2026', file:'ai-mini-pc-trend-guide-2026-thumb.webp',
    prompt:'AI mini PC 2026 compact powerful computer editorial cover, bold tech colors, wide landscape, no text' },

  // kr-realestate
  { dir:'content/posts/kr-realestate/land-transaction-permit-residence-relaxation-2026', file:'land-transaction-permit-residence-relaxation-2026-01.webp',
    prompt:'Korean government policy real estate regulation change Seoul apartment buildings urban, wide landscape' },
  { dir:'content/posts/kr-realestate/land-transaction-permit-residence-relaxation-2026', file:'land-transaction-permit-residence-relaxation-2026-02.webp',
    prompt:'land transaction permit relaxation policy comparison Korean real estate map diagram, wide landscape, no text' },
  { dir:'content/posts/kr-realestate/land-transaction-permit-residence-relaxation-2026', file:'land-transaction-permit-residence-relaxation-2026-thumb.webp',
    prompt:'Korean land transaction real estate policy 2026 editorial cover, bold professional colors, wide landscape, no text' },

  // latest-tech - anthropic
  { dir:'content/posts/latest-tech/anthropic-ipo-wall-street-ai-clash', file:'anthropic-ipo-wall-street-ai-clash-01.webp',
    prompt:'Anthropic AI company IPO Wall Street stock market bull tech startup finance concept, wide landscape' },
  { dir:'content/posts/latest-tech/anthropic-ipo-wall-street-ai-clash', file:'anthropic-ipo-wall-street-ai-clash-02.webp',
    prompt:'AI company stock market valuation chart comparison IPO data visualization graph, wide landscape, no text' },
  { dir:'content/posts/latest-tech/anthropic-ipo-wall-street-ai-clash', file:'anthropic-ipo-wall-street-ai-clash-thumb.webp',
    prompt:'Anthropic IPO AI stock market editorial cover, bold blue gold colors, wide landscape, no text' },

  // latest-tech - physical ai
  { dir:'content/posts/latest-tech/physical-ai-humanoid-robotics-2026', file:'physical-ai-humanoid-robotics-2026-01.webp',
    prompt:'humanoid robot walking factory warehouse 2026 physical AI real world deployment futuristic, wide landscape' },
  { dir:'content/posts/latest-tech/physical-ai-humanoid-robotics-2026', file:'physical-ai-humanoid-robotics-2026-02.webp',
    prompt:'humanoid robot models comparison multiple brands side by side 2026 technology, wide landscape, no text' },
  { dir:'content/posts/latest-tech/physical-ai-humanoid-robotics-2026', file:'physical-ai-humanoid-robotics-2026-thumb.webp',
    prompt:'physical AI humanoid robot 2026 editorial cover, dark tech blue, wide landscape, no text' },

  // society - AX
  { dir:'content/posts/society/ax-organization-human-role-2026', file:'ax-organization-human-role-2026-01.webp',
    prompt:'AX AI transformation organization humans working alongside AI tools modern office 2026, wide landscape' },
  { dir:'content/posts/society/ax-organization-human-role-2026', file:'ax-organization-human-role-2026-02.webp',
    prompt:'human skills vs AI automation organizational chart comparison Venn diagram, wide landscape, no text' },
  { dir:'content/posts/society/ax-organization-human-role-2026', file:'ax-organization-human-role-2026-thumb.webp',
    prompt:'AX organization AI era human role editorial cover, bold modern colors, wide landscape, no text' },

  // society - slow aging
  { dir:'content/posts/society/slow-aging-diet-wellness-2026', file:'slow-aging-diet-wellness-2026-01.webp',
    prompt:'longevity anti-aging diet colorful whole foods vegetables fruits Mediterranean plate healthy, wide landscape' },
  { dir:'content/posts/society/slow-aging-diet-wellness-2026', file:'slow-aging-diet-wellness-2026-02.webp',
    prompt:'slow aging diet comparison healthy vs processed food lifestyle visual, wide landscape, no text' },
  { dir:'content/posts/society/slow-aging-diet-wellness-2026', file:'slow-aging-diet-wellness-2026-thumb.webp',
    prompt:'slow aging diet wellness 2026 longevity editorial cover, fresh green colors, wide landscape, no text' },

  // sports - leekangin (only 02 and thumb missing)
  { dir:'content/posts/sports/leekangin-transfer-market-2026-worldcup', file:'leekangin-transfer-market-2026-worldcup-02.webp',
    prompt:'elite soccer player transfer big club Champions League stadium lights world football, wide landscape' },
  { dir:'content/posts/sports/leekangin-transfer-market-2026-worldcup', file:'leekangin-transfer-market-2026-worldcup-thumb.webp',
    prompt:'Korean soccer star transfer World Cup 2026 editorial cover, bold dynamic colors, wide landscape, no text' },

  // world-travel
  { dir:'content/posts/world-travel/micro-retirement-sabbatical-slow-travel-2026', file:'micro-retirement-sabbatical-slow-travel-2026-01.webp',
    prompt:'remote work slow travel digital nomad cozy apartment abroad one month living scenic city view, wide landscape' },
  { dir:'content/posts/world-travel/micro-retirement-sabbatical-slow-travel-2026', file:'micro-retirement-sabbatical-slow-travel-2026-02.webp',
    prompt:'hidden slow travel destinations 2026 affordable long stay locations scenic landscape, wide landscape, no text' },
  { dir:'content/posts/world-travel/micro-retirement-sabbatical-slow-travel-2026', file:'micro-retirement-sabbatical-slow-travel-2026-thumb.webp',
    prompt:'slow travel micro retirement 2026 hidden destination editorial cover, vibrant travel colors, wide landscape, no text' },
];

function apiCall(method, p, body) {
  return new Promise((res, rej) => {
    const pl = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'stablehorde.net', path: p, method,
      headers: { 'Content-Type': 'application/json', apikey: '0000000000',
        ...(pl ? { 'Content-Length': Buffer.byteLength(pl) } : {}) },
      timeout: 30000
    }, r => { let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res({ s: r.statusCode, b: JSON.parse(d) }); } catch { res({ s: r.statusCode, b: d }); } }); });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
    if (pl) req.write(pl); req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function processOne(img) {
  const dest = path.join(ROOT, img.dir, img.file);

  // 이미 존재하면 스킵
  if (fs.existsSync(dest) && fs.statSync(dest).size > 20000) {
    console.log(`  ⏭️  ${img.file} 존재 스킵`);
    return true;
  }

  // 제출
  const sub = await apiCall('POST', '/api/v2/generate/async', {
    prompt: img.prompt,
    params: { width: 640, height: 384, steps: 20, n: 1, sampler_name: 'k_euler' },
    models: ['stable_diffusion'], r2: false, shared: true
  });
  if (sub.s !== 202) {
    console.log(`  ❌ ${img.file} 제출 실패 ${sub.s}: ${JSON.stringify(sub.b).slice(0,100)}`);
    return false;
  }
  const id = sub.b.id;
  console.log(`  📤 ${img.file} 제출됨 (job: ${id.slice(0,8)}...)`);

  // 최대 30분 폴링
  const deadline = Date.now() + 1800000;
  while (Date.now() < deadline) {
    await sleep(15000);
    const c = await apiCall('GET', `/api/v2/generate/check/${id}`);
    if (c.b.faulted) { console.log(`  ❌ ${img.file} faulted`); return false; }
    if (c.b.done) break;
  }

  const result = await apiCall('GET', `/api/v2/generate/status/${id}`);
  const b64 = result.b.generations?.[0]?.img;
  if (!b64) {
    console.log(`  ❌ ${img.file} no data (generations: ${result.b.generations?.length ?? 'null'})`);
    return false;
  }

  fs.mkdirSync(path.join(ROOT, img.dir), { recursive: true });
  await sharp(Buffer.from(b64, 'base64'))
    .resize(1280, 720, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toFile(dest);

  const sz = fs.statSync(dest).size;
  console.log(`  ✅ ${img.file} (${Math.round(sz / 1024)}KB)`);
  return true;
}

// ── STEP 1: 순차 제출 (600ms 간격 — 초당 2개 제한 준수) ──────────────────
// ── STEP 2: 전체 폴링 병렬 처리 ───────────────────────────────────────────

async function submitOne(img) {
  const dest = path.join(ROOT, img.dir, img.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 20000) {
    return { img, jobId: null, skip: true };
  }
  let retries = 3;
  while (retries-- > 0) {
    const sub = await apiCall('POST', '/api/v2/generate/async', {
      prompt: img.prompt,
      params: { width: 640, height: 384, steps: 20, n: 1, sampler_name: 'k_euler' },
      models: ['stable_diffusion'], r2: false, shared: true
    });
    if (sub.s === 202) {
      console.log(`  📤 ${img.file} (job ${sub.b.id.slice(0,8)}...)`);
      return { img, jobId: sub.b.id, skip: false };
    }
    if (sub.s === 429) { await sleep(1000); continue; }
    console.log(`  ❌ ${img.file} 제출 실패 ${sub.s}`);
    return { img, jobId: null, skip: false };
  }
  console.log(`  ❌ ${img.file} 제출 재시도 초과`);
  return { img, jobId: null, skip: false };
}

async function pollAndSave({ img, jobId, skip }) {
  if (skip) { console.log(`  ⏭️  ${img.file} 존재 스킵`); return true; }
  if (!jobId) return false;

  const dest = path.join(ROOT, img.dir, img.file);
  const deadline = Date.now() + 1800000; // 30분
  while (Date.now() < deadline) {
    await sleep(15000);
    const c = await apiCall('GET', `/api/v2/generate/check/${jobId}`);
    if (c.b.faulted) { console.log(`  ❌ ${img.file} faulted`); return false; }
    if (c.b.done) break;
  }

  const result = await apiCall('GET', `/api/v2/generate/status/${jobId}`);
  const b64 = result.b.generations?.[0]?.img;
  if (!b64) { console.log(`  ❌ ${img.file} no data`); return false; }

  fs.mkdirSync(path.join(ROOT, img.dir), { recursive: true });
  await sharp(Buffer.from(b64, 'base64'))
    .resize(1280, 720, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toFile(dest);

  console.log(`  ✅ ${img.file} (${Math.round(fs.statSync(dest).size/1024)}KB)`);
  return true;
}

let done = 0, failed = 0;
console.log(`\n🚀 ${IMAGES.length}장 이미지 복구 시작\n`);
console.log('STEP 1: 순차 제출 중 (600ms 간격)...');

const jobs = [];
for (const img of IMAGES) {
  jobs.push(await submitOne(img));
  await sleep(600);
}

console.log(`\nSTEP 2: ${jobs.filter(j=>j.jobId).length}개 작업 병렬 폴링 시작...\n`);
const results = await Promise.all(jobs.map(pollAndSave));
results.forEach(ok => ok ? done++ : failed++);

console.log(`\n✅ 전체 완료 — 성공 ${done}개 / 실패 ${failed}개`);
