/**
 * gen_section5to10_images.mjs — sections 5~10 이미지 생성
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

const IMAGES = [
  // ─── Section 5: entertainment - netflix-kdrama-global-2026
  ['netflix-kdrama-global-2026-01.webp', 'Korean drama Netflix streaming global success 2026, cinematic poster style, two Korean actors in dramatic scene, neon city backdrop, photorealistic', 5101, false],
  ['netflix-kdrama-global-2026-02.webp', 'Behind the scenes K-drama production in Seoul studio, director and camera crew filming emotional scene, professional film set, photorealistic', 5102, false],
  ['netflix-kdrama-global-2026-thumb.webp', 'Netflix K-drama global trend 2026, world map with streaming lines connecting to Korea, Korean drama poster collage, vibrant editorial style, red and dark background', 5103, true],

  // ─── Section 6: health - spring-allergy-symptoms-2026
  ['spring-allergy-symptoms-2026-01.webp', 'Person suffering from spring allergies, sneezing with tissue, pollen particles visible in air, soft spring background, photorealistic health concept', 6101, false],
  ['spring-allergy-symptoms-2026-02.webp', 'Allergy symptoms concept, red irritated eyes and runny nose closeup, springtime pollen flowers background, medical health illustration style', 6102, false],
  ['spring-allergy-symptoms-2026-thumb.webp', 'Spring allergy prevention concept, pollen particles and antihistamine pills, clean medical infographic style, green and white tones, minimalist design', 6103, true],

  // ─── Section 7: it-devices - foldable-phone-guide-2026
  ['foldable-phone-guide-2026-01.webp', 'Foldable smartphone 2026 open and closed comparison, Galaxy Z Fold style, premium dark studio photography, futuristic sleek design', 7101, false],
  ['foldable-phone-guide-2026-02.webp', 'Foldable phone durability test, hinge close-up, multiple fold iterations display, technical product photography, blue and silver tones', 7102, false],
  ['foldable-phone-guide-2026-thumb.webp', 'Foldable phone 2026 buying guide concept, phone folding in half showing large and small screens, tech product art style, dark premium background', 7103, true],

  // ─── Section 8: kr-realestate - apartment-subscription-guide-2026
  ['apartment-subscription-guide-2026-01.webp', 'Korean apartment subscription application form with pen, Korean won banknotes and apartment building model on desk, real estate concept, photorealistic', 8101, false],
  ['apartment-subscription-guide-2026-02.webp', 'Korean apartment complex aerial view with subscription lottery concept, digital score board, Korean real estate market, architectural photography', 8102, false],
  ['apartment-subscription-guide-2026-thumb.webp', 'Korean apartment subscription guide 2026, checklist and apartment building illustration, blue and white clean infographic style, minimalist design', 8103, true],

  // ─── Section 9: world-travel - europe-summer-travel-guide-2026
  ['europe-summer-travel-guide-2026-01.webp', 'Summer travel in Europe, Eiffel Tower Paris and Colosseum Rome collage, vibrant summer sky, tourists enjoying sightseeing, travel photography', 9101, false],
  ['europe-summer-travel-guide-2026-02.webp', 'Hidden gem European small town, Croatia Dubrovnik or Slovenia Ljubljana waterfront, warm sunset light, travel photography editorial style', 9102, false],
  ['europe-summer-travel-guide-2026-thumb.webp', 'Europe summer travel guide 2026, map of Europe with iconic landmarks, passport and airplane ticket, warm golden travel poster style', 9103, true],

  // ─── Section 10: sports - kbo-baseball-hot-team-2026
  ['kbo-baseball-hot-team-2026-01.webp', 'Korean KBO baseball game action shot, batter hitting ball with dramatic lighting, packed stadium with Korean fans cheering, sports photography', 10101, false],
  ['kbo-baseball-hot-team-2026-02.webp', 'KBO baseball stadium full of fans during evening game, colorful team banners and light sticks, electric atmosphere, wide angle sports photography', 10102, false],
  ['kbo-baseball-hot-team-2026-thumb.webp', 'KBO 2026 baseball season concept, baseball and Korean league logo, stadium lights dramatic background, sports graphic design style', 10103, true],
];

async function main() {
  console.log(`\n🎨 섹션 5~10 이미지 생성 시작 — 총 ${IMAGES.length}개\n`);
  let ok = 0, fail = 0;

  for (const [filename, prompt, seed, isThumb] of IMAGES) {
    console.log(`\n📸 ${filename}`);
    try {
      await genImage(prompt, filename, seed, isThumb);
      ok++;
    } catch (err) {
      console.error(`  ❌ 실패: ${err.message}`);
      fail++;
    }
    await sleep(1500);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ 완료: ${ok}개 성공 / ${fail}개 실패`);
  console.log('='.repeat(60));
}

main().catch(err => { console.error('오류:', err.message); process.exit(1); });
