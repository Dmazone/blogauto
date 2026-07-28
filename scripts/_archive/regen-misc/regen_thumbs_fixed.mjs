/**
 * regen_thumbs_fixed.mjs
 * 각 포스트 주제에 맞는 썸네일을 Pollinations.ai로 재생성
 * Flow 혼용 문제로 이미지가 섞인 것을 완전 교체
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'static', 'images');

// 포스트별 썸네일 프롬프트 (주제 완전 명시)
const POSTS = [
  // ── 최신기술동향 ──
  {
    slug: 'ai-agent-autonomous-2026',
    prompt: 'autonomous AI robot agent working at futuristic computer, glowing neural network hologram, dark blue tech aesthetic, 4k editorial thumbnail',
  },
  {
    slug: 'ai-semiconductor-silicon-capacitor',
    prompt: 'extreme macro closeup silicon semiconductor chip wafer golden circuits on dark background, AI processor technology, editorial magazine thumbnail',
  },
  {
    slug: 'latest-tech-1779345179667',
    prompt: 'holographic technology interface floating screens neon glow, futuristic smart city concept, bold tech editorial thumbnail 2026',
  },

  // ── 경제 ──
  {
    slug: 'korea-economy-gdp-growth-2026',
    prompt: 'South Korea Seoul skyline financial district Yeouido skyscrapers at dusk, economic growth chart upward arrows, editorial financial magazine thumbnail',
  },
  {
    slug: 'korea-household-debt-2026',
    prompt: 'Korean won currency banknotes and credit cards scattered on dark surface, debt financial stress concept, dramatic red tones editorial thumbnail',
  },

  // ── 사회 ──
  {
    slug: 'digital-fatigue-disconnection-2026',
    prompt: 'person peacefully sitting in green forest holding broken smartphone, digital detox freedom concept, warm golden hour editorial thumbnail',
  },
  {
    slug: 'society-1779345463486',
    prompt: 'diverse Korean young people walking busy urban street Seoul, modern Korean society community lifestyle, warm candid editorial thumbnail',
  },

  // ── 인문 ──
  {
    slug: 'stoicism-modern-life-2026',
    prompt: 'ancient marble Marcus Aurelius philosopher bust with dramatic chiaroscuro lighting, stoic philosophy wisdom, editorial magazine thumbnail',
  },
  {
    slug: 'humanities-1779345750738',
    prompt: 'stack of philosophy books with golden light rays and reading glasses, warm intellectual aesthetic, humanities editorial thumbnail',
  },

  // ── 연예이슈 ──
  {
    slug: 'kdrama-global-2026',
    prompt: 'Korean drama filming set clapperboard with cinematic lights and camera, K-drama hallyu wave global concept, vibrant editorial thumbnail',
  },
  {
    slug: 'entertainment-1779346062810',
    prompt: 'K-pop concert stage spectacular light show microphone stand, vibrant colorful idol performance, entertainment editorial thumbnail',
  },

  // ── 건강 ──
  {
    slug: 'office-workout-routine-2026',
    prompt: 'office worker doing quick desk stretching exercise at standing desk, bright modern workplace fitness routine, healthy lifestyle editorial thumbnail',
  },
  {
    slug: 'health-1779346374831',
    prompt: 'vibrant healthy Korean meal bowl with vegetables fruits smoothie, wellness nutrition lifestyle, fresh bright health editorial thumbnail',
  },

  // ── IT기기 ──
  {
    slug: 'ai-pc-laptop-guide-2026',
    prompt: 'sleek AI-powered laptop with glowing NPU chip concept display, premium technology product shot dark background, editorial tech thumbnail 2026',
  },
  {
    slug: 'it-devices-1779346652786',
    prompt: 'latest tech gadgets flat lay smartwatch earbuds tablet smartphone on dark surface, clean minimalist product photography editorial thumbnail',
  },

  // ── 한국부동산 ──
  {
    slug: 'seoul-realestate-outlook-2026',
    prompt: 'Seoul apartment residential towers at sunset Han River view, Korean real estate housing market concept, editorial architectural thumbnail',
  },

  // ── 세계여행지 ──
  {
    slug: 'southeast-asia-japan-travel-2026',
    prompt: 'Japanese torii gate Fushimi Inari with cherry blossoms, vibrant orange red travel destination, warm editorial travel thumbnail Japan',
  },

  // ── 스포츠 ──
  {
    slug: 'worldcup-2026-korea-preview',
    prompt: 'FIFA World Cup 2026 soccer ball dramatic spotlight on stadium field, Korean national team concept, bold sports editorial thumbnail',
  },
];

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = proto.get(url, { timeout: 120000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        const size = fs.statSync(destPath).size;
        if (size < 10000) {
          fs.unlinkSync(destPath);
          return reject(new Error(`파일 너무 작음 (${size}B)`));
        }
        resolve();
      });
    });
    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('요청 타임아웃'));
    });
  });
}

async function generateWithPollinations(prompt, destPath, seed) {
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1280&height=720&seed=${seed}&nologo=true&enhance=true&model=flux`;
  await downloadImage(url, destPath);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const total = POSTS.length;
  let done = 0;
  let failed = [];

  console.log(`\n🖼️  썸네일 재생성 시작 — 총 ${total}개 (Pollinations)\n`);

  for (const post of POSTS) {
    done++;
    const thumbFile = `${post.slug}-thumb.webp`;
    const thumbPath = path.join(IMAGES_DIR, thumbFile);

    console.log(`[${done}/${total}] ${post.slug}`);

    let ok = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const seed = Math.floor(Math.random() * 99999) + done * 1000;
        await generateWithPollinations(post.prompt, thumbPath, seed);
        const size = (fs.statSync(thumbPath).size / 1024).toFixed(0);
        console.log(`  ✅ 생성 완료 (${size}KB)`);
        ok = true;
        break;
      } catch (err) {
        console.log(`  ⚠️  시도 ${attempt}/3 실패: ${err.message}`);
        if (attempt < 3) await sleep(5000);
      }
    }

    if (!ok) {
      failed.push(post.slug);
      console.log(`  ❌ 최종 실패`);
    }

    console.log();
    if (done < total) await sleep(3000);
  }

  console.log('='.repeat(50));
  console.log(`🎉 완료! 성공: ${total - failed.length}개, 실패: ${failed.length}개`);
  if (failed.length > 0) {
    console.log('실패 목록:', failed.join(', '));
  }
}

main().catch(err => {
  console.error('치명적 오류:', err.message);
  process.exit(1);
});
