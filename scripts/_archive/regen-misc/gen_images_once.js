import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IMAGES_DIR = path.join(__dirname, '..', 'static', 'images');

const IMAGES = [
  { slug: 'ai-agent-autonomous-2026', prompts: [
    'AI autonomous agent futuristic digital brain network, glowing neural connections, dark blue background, photorealistic',
    'robot AI assistant working on multiple tasks, holographic screens, modern tech office, cinematic lighting',
  ]},
  { slug: 'korea-household-debt-2026', prompts: [
    'South Korea economy household debt financial crisis, Seoul cityscape with financial charts overlay, dramatic sky',
    'Korean family worried about housing loan debt, apartment building background, documentary style photo',
  ]},
  { slug: 'digital-fatigue-disconnection-2026', prompts: [
    'person putting down smartphone looking at beautiful nature, peaceful forest, warm sunlight, lifestyle photography',
    'analog diary paper notebook wooden desk, smartphone turned off, calm minimalist style',
  ]},
  { slug: 'stoicism-modern-life-2026', prompts: [
    'ancient Roman philosopher marble statue against modern city skyline background, dramatic contrast, artistic',
    'open book Marcus Aurelius Meditations on modern cafe table, warm ambient light, lifestyle',
  ]},
  { slug: 'kdrama-global-2026', prompts: [
    'Korean drama filming set with cameras and actors, global world map in background, vibrant colors',
    'Netflix OTT screen showing Korean drama, global audience watching, dramatic lighting',
  ]},
  { slug: 'office-workout-routine-2026', prompts: [
    'office worker doing stretching exercise at desk, professional modern office environment, healthy lifestyle',
    'daily workout routine guide illustration, gym exercises in office clothes, clean infographic style',
  ]},
  { slug: 'ai-pc-laptop-guide-2026', prompts: [
    '2026 AI PC laptop comparison lineup on clean white desk, NPU chip visible, premium tech photography',
    'Intel Core Ultra vs Apple M4 vs Snapdragon X comparison graphic, modern tech aesthetic',
  ]},
  { slug: 'seoul-realestate-outlook-2026', prompts: [
    'Seoul Gangnam apartment buildings skyline aerial view, real estate market chart overlay, golden hour',
    'Korean apartment complex construction site, real estate investment concept, professional photography',
  ]},
  { slug: 'southeast-asia-japan-travel-2026', prompts: [
    'Southeast Asia Japan travel destinations collage, Bangkok Tokyo Danang landmarks, vibrant colorful',
    'Korean tourist enjoying travel in Japan street food market, cherry blossom, lifestyle photography',
  ]},
  { slug: 'worldcup-2026-korea-preview', prompts: [
    'FIFA World Cup 2026 soccer ball with USA Canada Mexico flags, stadium background, dramatic lighting',
    'Korea national football team players in red uniform training, FIFA World Cup concept, action shot',
  ]},
];

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  for (const item of IMAGES) {
    for (let i = 0; i < item.prompts.length; i++) {
      const idx = i + 1;
      const filename = `${item.slug}-0${idx}.webp`;
      const destPath = path.join(IMAGES_DIR, filename);

      if (fs.existsSync(destPath)) {
        console.log(`⏭️  이미 존재: ${filename}`);
        continue;
      }

      const prompt = item.prompts[i];
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=630&nologo=true&model=flux`;

      console.log(`🖼️  생성 중: ${filename}`);
      try {
        await downloadImage(url, destPath);
        const size = (fs.statSync(destPath).size / 1024).toFixed(0);
        console.log(`✅ 저장됨: ${filename} (${size}KB)`);
      } catch (err) {
        console.error(`❌ 실패: ${filename} - ${err.message}`);
      }

      await sleep(2000);
    }
  }

  console.log('\n🎉 이미지 생성 완료!');
}

main();
