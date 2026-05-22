/**
 * gen_thumbs_and_update_posts.mjs
 *
 * 1. 각 포스트마다 slug-thumb.webp 전용 썸네일 이미지 생성 (Flow)
 * 2. 마크다운 front matter 업데이트:
 *    - cover.image → slug-thumb.webp (전용 썸네일)
 *    - cover.hiddenInSingle: true (본문에 썸네일 미표시)
 *    - 없는 포스트에는 cover 섹션 신규 추가
 */

import { generateFlowImage } from './flow_image_gen.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'static', 'images');
const BASE_URL = 'https://dmazone.github.io/blogauto';

// 포스트 slug → 썸네일 프롬프트 + 마크다운 파일 경로
const POSTS = [
  // ── 최신기술동향 ──
  {
    slug: 'ai-agent-autonomous-2026',
    file: 'content/posts/latest-tech/ai-agent-autonomous-2026.md',
    alt: '2026 자율형 AI 에이전트 썸네일',
    thumbPrompt: 'glowing AI brain circuit network close-up, deep blue neon, magazine cover thumbnail style',
  },
  {
    slug: 'ai-semiconductor-silicon-capacitor',
    file: 'content/posts/latest-tech/ai-semiconductor-silicon-capacitor.md',
    alt: 'AI 반도체 실리콘 커패시터 썸네일',
    thumbPrompt: 'silicon capacitor semiconductor chip extreme macro close-up, golden circuits, editorial thumbnail',
  },
  {
    slug: 'latest-tech-1779345179667',
    file: 'content/posts/latest-tech/latest-tech-1779345179667.md',
    alt: '최신기술동향 썸네일',
    thumbPrompt: 'futuristic holographic tech interface close-up glowing blue, bold graphic thumbnail style',
  },

  // ── 경제 ──
  {
    slug: 'korea-household-debt-2026',
    file: 'content/posts/economy/korea-household-debt-2026.md',
    alt: '한국 가계부채 썸네일',
    thumbPrompt: 'Korean Won currency coins and debt documents close-up, dramatic red financial concept, bold thumbnail',
  },
  {
    slug: 'korea-economy-gdp-growth-2026',
    file: 'content/posts/economy/korea-economy-gdp-growth-2026.md',
    alt: '한국 경제성장률 썸네일',
    thumbPrompt: 'South Korea economic growth graph upward arrow, Seoul skyline silhouette, bold editorial thumbnail',
  },

  // ── 사회 ──
  {
    slug: 'digital-fatigue-disconnection-2026',
    file: 'content/posts/society/digital-fatigue-disconnection-2026.md',
    alt: '디지털 피로 썸네일',
    thumbPrompt: 'hands letting go of smartphone in nature, peaceful forest bokeh, warm lifestyle thumbnail close-up',
  },
  {
    slug: 'society-1779345463486',
    file: 'content/posts/society/society-1779345463486.md',
    alt: '사회 트렌드 썸네일',
    thumbPrompt: 'Korean urban society diverse people street portrait, warm documentary thumbnail style',
  },

  // ── 인문 ──
  {
    slug: 'stoicism-modern-life-2026',
    file: 'content/posts/humanities/stoicism-modern-life-2026.md',
    alt: '스토아철학 썸네일',
    thumbPrompt: 'Marcus Aurelius marble bust portrait close-up dramatic light shadow, editorial magazine thumbnail',
  },
  {
    slug: 'humanities-1779345750738',
    file: 'content/posts/humanities/humanities-1779345750738.md',
    alt: '인문 트렌드 썸네일',
    thumbPrompt: 'open philosophy book with golden light rays, intellectual aesthetic, warm editorial thumbnail',
  },

  // ── 연예이슈 ──
  {
    slug: 'kdrama-global-2026',
    file: 'content/posts/entertainment/kdrama-global-2026.md',
    alt: 'K드라마 글로벌 썸네일',
    thumbPrompt: 'Korean drama clapperboard close-up with dramatic lighting, K-drama global concept thumbnail',
  },
  {
    slug: 'entertainment-1779346062810',
    file: 'content/posts/entertainment/entertainment-1779346062810.md',
    alt: '연예이슈 썸네일',
    thumbPrompt: 'K-pop stage spotlight microphone close-up, vibrant concert lights, bold entertainment thumbnail',
  },

  // ── 건강 ──
  {
    slug: 'office-workout-routine-2026',
    file: 'content/posts/health/office-workout-routine-2026.md',
    alt: '직장인 운동 썸네일',
    thumbPrompt: 'close-up sneakers on office floor workout gear, fresh healthy lifestyle thumbnail, bright minimal',
  },
  {
    slug: 'health-1779346374831',
    file: 'content/posts/health/health-1779346374831.md',
    alt: '건강 트렌드 썸네일',
    thumbPrompt: 'green smoothie healthy food close-up vibrant fresh, wellness lifestyle bold thumbnail',
  },

  // ── IT기기 ──
  {
    slug: 'ai-pc-laptop-guide-2026',
    file: 'content/posts/it-devices/ai-pc-laptop-guide-2026.md',
    alt: 'AI PC 가이드 썸네일',
    thumbPrompt: 'AI laptop keyboard close-up glowing keys NPU chip concept, premium tech editorial thumbnail',
  },
  {
    slug: 'it-devices-1779346652786',
    file: 'content/posts/it-devices/it-devices-1779346652786.md',
    alt: 'IT기기 트렌드 썸네일',
    thumbPrompt: 'latest smartphone close-up product shot, tech gadget flat lay, clean minimalist thumbnail',
  },

  // ── 한국부동산 ──
  {
    slug: 'seoul-realestate-outlook-2026',
    file: 'content/posts/kr-realestate/seoul-realestate-outlook-2026.md',
    alt: '서울 부동산 썸네일',
    thumbPrompt: 'Seoul apartment building facade close-up at sunset, real estate concept bold editorial thumbnail',
  },

  // ── 세계여행지 ──
  {
    slug: 'southeast-asia-japan-travel-2026',
    file: 'content/posts/world-travel/southeast-asia-japan-travel-2026.md',
    alt: '동남아 일본 여행 썸네일',
    thumbPrompt: 'Japanese torii gate cherry blossom close-up, vibrant travel thumbnail, golden hour warm tones',
  },

  // ── 스포츠 ──
  {
    slug: 'worldcup-2026-korea-preview',
    file: 'content/posts/sports/worldcup-2026-korea-preview.md',
    alt: '2026 월드컵 한국 썸네일',
    thumbPrompt: 'FIFA World Cup 2026 soccer ball close-up with dramatic stadium lights, bold sports thumbnail',
  },

  // ── 구 트랙 (track-a) ──
  {
    slug: 'what-is-claude-code',
    file: 'content/posts/track-a/what-is-claude-code.md',
    alt: 'Claude Code 소개 썸네일',
    thumbPrompt: 'AI terminal code prompt glowing screen dark theme, developer tool close-up bold thumbnail',
  },
  {
    slug: 'claude-code-install',
    file: 'content/posts/track-a/claude-code-install.md',
    alt: 'Claude Code 설치 썸네일',
    thumbPrompt: 'npm install command terminal close-up green text dark background, tech tutorial thumbnail',
  },
  {
    slug: 'claude-md-guide',
    file: 'content/posts/track-a/claude-md-guide.md',
    alt: 'CLAUDE.md 가이드 썸네일',
    thumbPrompt: 'markdown file code editor close-up with syntax highlighting, documentation guide thumbnail',
  },
];

// ── front matter 업데이트 ──────────────────────────────────────
function updateFrontMatter(content, slug, alt) {
  const thumbUrl = `${BASE_URL}/images/${slug}-thumb.webp`;

  const newCoverBlock = `cover:\n  image: "${thumbUrl}"\n  alt: "${alt}"\n  hiddenInSingle: true`;

  // 이미 cover: 섹션이 있는 경우 — 전체 cover 블록 교체
  if (/^cover:/m.test(content)) {
    // cover 블록 전체를 새 블록으로 교체 (다음 최상위 키나 --- 까지)
    content = content.replace(
      /^cover:[\s\S]*?(?=^[a-zA-Z]|\n---)/m,
      newCoverBlock + '\n'
    );
    // hiddenInSingle 없으면 추가
    if (!/hiddenInSingle/.test(content)) {
      content = content.replace(
        /^(cover:\n(?:  [^\n]+\n)*)/m,
        `$1  hiddenInSingle: true\n`
      );
    }
    return content;
  }

  // cover 없는 경우 — closing --- 바로 앞에 삽입
  // front matter는 첫 번째 --- 와 두 번째 --- 사이
  const parts = content.split(/^---$/m);
  if (parts.length >= 3) {
    parts[1] = parts[1] + `${newCoverBlock}\n`;
    return parts.join('---');
  }

  return content;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const total = POSTS.length;
  let done = 0;
  let failed = 0;

  console.log(`\n🖼️  썸네일 생성 + 포스트 업데이트 시작 — 총 ${total}개\n`);

  for (const post of POSTS) {
    done++;
    const thumbFile = `${post.slug}-thumb.webp`;
    const thumbPath = path.join(IMAGES_DIR, thumbFile);
    const mdPath = path.join(ROOT, post.file);

    console.log(`[${done}/${total}] ${post.slug}`);

    // 1) 썸네일 이미지 생성
    try {
      await generateFlowImage(post.thumbPrompt, thumbPath);
      const size = (fs.statSync(thumbPath).size / 1024).toFixed(0);
      console.log(`  ✅ 썸네일 생성 (${size}KB)`);
    } catch (err) {
      failed++;
      console.error(`  ❌ 썸네일 생성 실패: ${err.message}`);
    }

    // 2) 마크다운 front matter 업데이트
    if (fs.existsSync(mdPath)) {
      try {
        let content = fs.readFileSync(mdPath, 'utf-8');
        content = updateFrontMatter(content, post.slug, post.alt);
        fs.writeFileSync(mdPath, content, 'utf-8');
        console.log(`  ✅ front matter 업데이트`);
      } catch (err) {
        console.error(`  ❌ 마크다운 업데이트 실패: ${err.message}`);
      }
    } else {
      console.log(`  ⚠️  마크다운 파일 없음 (이미지만 생성): ${post.file}`);
    }

    console.log();
    if (done < total) await sleep(5000);
  }

  console.log('='.repeat(50));
  console.log(`🎉 완료! 성공: ${total - failed}개, 실패: ${failed}개`);
}

main().catch(err => {
  console.error('치명적 오류:', err.message);
  process.exit(1);
});
