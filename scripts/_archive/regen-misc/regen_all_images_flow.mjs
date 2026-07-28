/**
 * regen_all_images_flow.mjs
 * 기존 모든 블로그 포스트 이미지를 Google Flow로 재생성
 *
 * 사용법: node scripts/regen_all_images_flow.mjs
 * 소요시간: 약 30~40분 (이미지 40개 × 45초)
 */

import { generateFlowImage } from './flow_image_gen.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, '..', 'static', 'images');

// 이미지 slug → 프롬프트 전체 목록
const IMAGES = [
  // ── 최신기술동향 ──────────────────────────────────────────
  {
    slug: 'ai-agent-autonomous-2026', prompts: [
      'AI autonomous agent futuristic digital brain network, glowing neural connections, dark blue background, photorealistic',
      'robot AI assistant multitasking holographic screens, sleek modern tech office, cinematic dramatic lighting',
    ]
  },
  {
    slug: 'ai-semiconductor-silicon-capacitor', prompts: [
      'AI semiconductor silicon capacitor chip closeup, circuit board glowing blue, high-tech photorealistic macro',
      'data center server racks with advanced AI chip cooling system, futuristic tech infrastructure, dramatic lighting',
    ]
  },
  {
    slug: 'latest-tech-1779345179667', prompts: [
      'futuristic technology trend 2026 digital innovation, glowing circuit hologram, dark background photorealistic',
      'AI technology dashboard with data visualization, modern tech workspace, blue neon aesthetic',
    ]
  },

  // ── 경제 ──────────────────────────────────────────────────
  {
    slug: 'korea-household-debt-2026', prompts: [
      'South Korea economy household debt financial pressure, Seoul cityscape with financial charts overlay, dramatic sky',
      'Korean family household budget stress, apartment building background, documentary style photography',
    ]
  },
  {
    slug: 'korea-economy-gdp-growth-2026', prompts: [
      'South Korea GDP economic growth chart 2026, Seoul financial district skyscrapers, golden hour aerial view',
      'Korean semiconductor factory export boom, economic recovery concept, modern industrial photography',
    ]
  },

  // ── 사회 ──────────────────────────────────────────────────
  {
    slug: 'digital-fatigue-disconnection-2026', prompts: [
      'person putting down smartphone looking at peaceful nature forest, warm sunlight, lifestyle photography',
      'analog notebook wooden desk smartphone face-down, calm minimalist aesthetic, soft natural light',
    ]
  },
  {
    slug: 'society-1779345463486', prompts: [
      'Korean society modern urban life trend 2026, Seoul street scene diverse crowd, documentary style',
      'social change Korea community gathering, thoughtful candid photography, warm tones',
    ]
  },

  // ── 인문 ──────────────────────────────────────────────────
  {
    slug: 'stoicism-modern-life-2026', prompts: [
      'ancient Roman philosopher marble statue against modern city skyline, dramatic contrast, fine art photography',
      'Marcus Aurelius Meditations open book on modern cafe table, warm ambient light, lifestyle flat lay',
    ]
  },
  {
    slug: 'humanities-1779345750738', prompts: [
      'humanities philosophy books and culture artifacts on library shelf, warm golden light, intellectual aesthetic',
      'person reading classic literature in cozy cafe, thoughtful contemplative mood, film photography style',
    ]
  },

  // ── 연예이슈 ──────────────────────────────────────────────
  {
    slug: 'kdrama-global-2026', prompts: [
      'Korean drama filming set professional cameras and actors, global world map overlay, vibrant colorful cinematic',
      'Netflix streaming screen showing Korean drama series, global audience watching concept, dramatic neon lighting',
    ]
  },
  {
    slug: 'entertainment-1779346062810', prompts: [
      'Korean entertainment industry K-pop idol stage performance, concert lights crowd, professional event photography',
      'Korean celebrity red carpet event, glamorous fashion photography, warm spotlight bokeh',
    ]
  },

  // ── 건강 ──────────────────────────────────────────────────
  {
    slug: 'office-workout-routine-2026', prompts: [
      'office worker stretching exercise at standing desk, bright modern office, healthy lifestyle photography',
      'daily workout routine at home gym, fitness exercise guide, clean bright studio photography',
    ]
  },
  {
    slug: 'health-1779346374831', prompts: [
      'healthy lifestyle wellness 2026, person doing yoga morning sunrise, vibrant energetic photography',
      'nutritious balanced meal prep fresh vegetables fruits, clean kitchen aesthetic, food photography',
    ]
  },

  // ── IT기기 ──────────────────────────────────────────────────
  {
    slug: 'ai-pc-laptop-guide-2026', prompts: [
      '2026 AI PC laptop lineup on minimalist white desk, NPU chip showcase, premium product photography',
      'Intel Core Ultra Apple M4 Snapdragon X chip comparison graphic, modern tech flat lay aesthetic',
    ]
  },
  {
    slug: 'ai-pc-on-device-future', prompts: [
      'on-device AI processing concept, neural network inside laptop, glowing circuits holographic display',
      'future personal AI assistant device, sleek futuristic gadget, sci-fi photorealistic render',
    ]
  },
  {
    slug: 'it-devices-1779346652786', prompts: [
      '2026 latest tech gadgets smartphones tablets smartwatch on desk, product photography flat lay',
      'IT devices innovation technology 2026, futuristic consumer electronics, modern minimalist style',
    ]
  },

  // ── 한국부동산 ──────────────────────────────────────────────
  {
    slug: 'seoul-realestate-outlook-2026', prompts: [
      'Seoul Gangnam apartment skyline aerial view, real estate market chart overlay, golden hour dramatic',
      'Korean apartment complex construction site, real estate investment growth concept, professional photography',
    ]
  },

  // ── 세계여행지 ──────────────────────────────────────────────
  {
    slug: 'southeast-asia-japan-travel-2026', prompts: [
      'Southeast Asia Japan travel collage Bangkok Tokyo Da Nang landmarks, vibrant colorful travel photography',
      'Korean tourist exploring Japan cherry blossom street food market, lifestyle travel photography',
    ]
  },

  // ── 스포츠 ──────────────────────────────────────────────────
  {
    slug: 'worldcup-2026-korea-preview', prompts: [
      'FIFA World Cup 2026 soccer ball USA Canada Mexico host flags, grand stadium background, dramatic lighting',
      'Korea national football team red uniform training session, FIFA World Cup action shot, dynamic sports photography',
    ]
  },

  // ── 구 트랙 포스트 (track-a) ──────────────────────────────
  {
    slug: 'what-is-claude-code', prompts: [
      'AI coding assistant terminal interface on laptop, developer workspace dark theme, professional photography',
      'Claude AI code generation holographic interface, futuristic developer tools, glowing blue aesthetic',
    ]
  },
  {
    slug: 'claude-code-install', prompts: [
      'developer laptop terminal npm install command running, dark IDE workspace, modern tech setup',
      'software installation guide step by step terminal commands, clean developer environment, tech photography',
    ]
  },
  {
    slug: 'claude-md-guide', prompts: [
      'CLAUDE.md markdown file open in code editor, organized project structure sidebar, clean developer workspace',
      'AI project documentation guide notebook and laptop, productivity workspace, minimalist aesthetic',
    ]
  },
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const total = IMAGES.reduce((sum, item) => sum + item.prompts.length, 0);
  let done = 0;
  let failed = 0;

  console.log(`\n🚀 Flow 이미지 재생성 시작 — 총 ${total}개\n`);
  console.log('소요 예상: 약 30~40분\n');

  for (const item of IMAGES) {
    for (let i = 0; i < item.prompts.length; i++) {
      const idx = i + 1;
      const filename = `${item.slug}-0${idx}.webp`;
      const destPath = path.join(IMAGES_DIR, filename);
      const prompt = item.prompts[i];

      done++;
      console.log(`[${done}/${total}] 🎨 ${filename}`);
      console.log(`   프롬프트: ${prompt.substring(0, 70)}...`);

      try {
        await generateFlowImage(prompt, destPath);
        const size = (fs.statSync(destPath).size / 1024).toFixed(0);
        console.log(`   ✅ 완료 (${size}KB)\n`);
      } catch (err) {
        failed++;
        console.error(`   ❌ 실패: ${err.message}\n`);
      }

      // Flow 과부하 방지 — 이미지 간 5초 대기
      if (done < total) await sleep(5000);
    }
  }

  console.log('='.repeat(50));
  console.log(`🎉 완료! 성공: ${total - failed}개, 실패: ${failed}개`);
  console.log('\n다음 단계: git add, commit, push 후 GitHub Pages 확인');
}

main().catch(err => {
  console.error('치명적 오류:', err.message);
  process.exit(1);
});
