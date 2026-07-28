/**
 * yt_video_maker.mjs
 * trending-picks 포스팅 → Shorts MP4 (1080×1920, ~50s)
 *
 * 파이프라인:
 *   parsePost → generateNarrations → TTS(SAPI) → ffmpeg 슬라이드 → concat → BGM 믹스
 *
 * BGM: data/bgm/*.mp3 파일 중 첫 번째를 자동으로 사용.
 *      없으면 TTS만으로 영상 생성.
 *      추가 방법: YouTube 오디오 보관함에서 무료 음악 다운로드 → data/bgm/ 에 저장
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'content', 'posts', 'trending-picks');
const BGM_DIR   = path.join(ROOT, 'data', 'bgm');
const OUT_DIR   = path.join(ROOT, 'data', 'yt-output');
const WORK_BASE = path.join(ROOT, 'data', 'yt-work');

const FFMPEG_PATH = process.env.FFMPEG_PATH ||
  'C:/Users/Paydma/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe';
const TTS_PS1 = path.join(__dirname, 'yt_tts.ps1');

const log = (e, m) => console.log(`[yt-video] ${e}  ${m}`);

// ── ffmpeg spawn 래퍼 ──────────────────────────────────────────────────────
function ff(args) {
  const r = spawnSync(FFMPEG_PATH, args, { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg 실패:\n${r.stderr?.slice(-1000)}`);
}

// ── PowerShell TTS ─────────────────────────────────────────────────────────
function makeTTS(text, outWav, rate = 1) {
  const r = spawnSync('powershell', [
    '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', TTS_PS1,
    '-Text', text,
    '-OutFile', outWav,
    '-Rate', String(rate),
  ], { encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`TTS 실패: ${r.stderr}`);
}

// ── 마크다운 파싱 ─────────────────────────────────────────────────────────
export function parsePost(slug) {
  const dir     = path.join(POSTS_DIR, slug);
  const mdPath  = path.join(dir, 'index.md');
  const content = fs.readFileSync(mdPath, 'utf-8');

  // front matter
  const fm = content.match(/^---\n([\s\S]+?)\n---/)?.[1] ?? '';
  const title       = fm.match(/^title:\s+"?(.+?)"?\s*$/m)?.[1] ?? slug;
  const description = fm.match(/^description:\s+"?(.+?)"?\s*$/m)?.[1] ?? '';

  // 해시태그
  const hashtagLine = content.match(/#[\w가-힣]+(?:\s+#[\w가-힣]+)*/g) ?? [];
  const hashtags    = hashtagLine.length
    ? hashtagLine[hashtagLine.length - 1].split(/\s+/).map(h => h.replace('#', ''))
    : ['트렌드상품', '쿠팡추천'];

  // H3 제목에서 상품명 추출: "### N) 유형: 상품명"
  const h3Matches = [...content.matchAll(/###\s+\d+\)\s+[^:]+:\s+(.+)/g)];

  // 비교표에서 가격 추출: | **상품명** | 가격 |
  const tableRows = [...content.matchAll(/\|\s*\*\*([^*]+)\*\*\s*\|\s*([^|]+?)\s*\|/g)];

  // 쿠팡 링크 추출
  const coupangLinks = [...content.matchAll(/\[([^\]]+쿠팡[^\]]+)\]\((https:\/\/www\.coupang\.com[^)]+)\)/g)];

  const products = h3Matches.map((m, i) => ({
    name:       m[1].trim(),
    price:      tableRows[i]?.[2]?.trim() ?? '',
    coupangUrl: coupangLinks[i]?.[2] ?? '',
  }));

  return {
    slug,
    title,
    description,
    hashtags,
    products,
    images: {
      thumb: path.join(dir, `${slug}-thumb.webp`),
      img1:  path.join(dir, `${slug}-01.webp`),
      img2:  path.join(dir, `${slug}-02.webp`),
    },
  };
}

// ── 나레이션 스크립트 생성 ────────────────────────────────────────────────
function generateNarrations({ title, description, products }) {
  const p = products;
  const cat = title.replace(/ ?TOP\d+| ?비교| ?추천| ?상품/g, '').trim();

  return [
    {
      imageKey: 'thumb',
      duration: 10,
      topText:  '지금 뜨는 꿀템',
      mainText: title,
      subText:  '',
      tts: `${description || cat + ' TOP3 비교해드립니다!'} 지금 바로 확인하세요!`,
    },
    {
      imageKey: 'img1',
      duration: 15,
      topText:  p[0] ? `3위  ${p[0].name}` : '제품 비교',
      mainText: p[1] ? `2위  ${p[1].name}` : '',
      subText:  [p[0]?.price, p[1]?.price].filter(Boolean).join(' vs '),
      tts: [
        p[0] ? `3위는 ${p[0].name}. ${p[0].price ? p[0].price + ',' : ''} 가성비 입문용입니다.` : '',
        p[1] ? `2위는 ${p[1].name}. ${p[1].price ? p[1].price + ',' : ''} 밸런스 추천 모델이에요.` : '',
      ].filter(Boolean).join(' '),
    },
    {
      imageKey: 'img2',
      duration: 15,
      topText:  '1위 최종 선택',
      mainText: p[2] ? p[2].name : (p[1] ? p[1].name : ''),
      subText:  p[2]?.price ?? p[1]?.price ?? '',
      tts: p[2]
        ? `1위는 단연 ${p[2].name}! ${p[2].price ? p[2].price + ',' : ''} 프리미엄 기능과 성능을 한 번에 잡은 최고의 선택입니다!`
        : '이 중에서 하나만 고른다면 단연 최고의 제품을 선택하세요!',
    },
    {
      imageKey: 'thumb',
      duration: 10,
      topText:  '구매 링크 설명란 확인',
      mainText: '트렌드줌 상품 목록 방문',
      subText:  '더 많은 꿀템 비교',
      tts: '구매 링크는 아래 설명란에서 확인하세요! 트렌드줌에서 더 많은 꿀템 비교도 만나보세요!',
    },
  ];
}

// ── 슬라이드 이미지 생성 (1080×1920 Shorts) ──────────────────────────────
// ffmpeg: 블러 배경 합성 / PowerShell System.Drawing: 한국어 텍스트 오버레이
function makeSlideImage({ sourceImage, workDir, slideIdx, topText, mainText, subText }) {
  const src     = sourceImage.replace(/\\/g, '/');
  const bgFile  = path.join(workDir, `bg_${slideIdx}.png`);
  const fgFile  = path.join(workDir, `fg_${slideIdx}.png`);
  const baseFile = path.join(workDir, `base_${slideIdx}.png`);
  const outFile = path.join(workDir, `slide_${slideIdx}.png`);

  // 1. 블러 배경 (소스 이미지를 1080×1920으로 채우고 블러)
  ff(['-y', '-i', src,
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=50:5',
    '-frames:v', '1', bgFile]);

  // 2. 전경 이미지 (1080 폭 유지, 비율 보존)
  ff(['-y', '-i', src, '-vf', 'scale=1080:-2', '-frames:v', '1', fgFile]);

  // 3. 오버레이 (배경 + 전경, 텍스트 없이)
  ff(['-y', '-i', bgFile, '-i', fgFile,
    '-filter_complex', '[0:v][1:v]overlay=0:(H-h)/2[out]',
    '-map', '[out]', '-frames:v', '1', baseFile]);

  // 4. 텍스트 오버레이 — PowerShell System.Drawing (한국어 완벽 지원)
  const ps = spawnSync('powershell', [
    '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'yt_text_overlay.ps1'),
    '-InputPng',  baseFile,
    '-OutputPng', outFile,
    '-TopText',   topText  || '',
    '-MainText',  mainText || '',
    '-SubText',   subText  || '',
  ], { encoding: 'utf-8' });
  if (ps.status !== 0) throw new Error(`텍스트 오버레이 실패: ${ps.stderr}`);

  return outFile;
}

// ── WAV에서 재생 시간(초) 추출 ────────────────────────────────────────────
function getWavDuration(wavPath) {
  const probe = FFMPEG_PATH.replace('ffmpeg.exe', 'ffprobe.exe');
  const r = spawnSync(probe, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', wavPath,
  ], { encoding: 'utf-8' });
  return Math.ceil(parseFloat(r.stdout) || 3) + 1; // 최소 1초 여유
}

// ── 슬라이드 + TTS → MP4 세그먼트 ────────────────────────────────────────
function makeSegment({ slideImg, wavFile, duration, workDir, idx }) {
  const out = path.join(workDir, `seg_${idx}.mp4`);
  ff(['-y',
    '-loop', '1', '-t', String(duration), '-i', slideImg,
    '-i', wavFile,
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-vf', 'fps=24,scale=1080:1920',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest', out]);
  return out;
}

// ── 세그먼트 concat ───────────────────────────────────────────────────────
function concatSegments(segments, workDir) {
  const listFile = path.join(workDir, 'concat.txt');
  const listContent = segments.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(listFile, listContent, 'utf-8');

  const out = path.join(workDir, 'combined.mp4');
  ff(['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c', 'copy', out]);
  return out;
}

// ── BGM 믹싱 ─────────────────────────────────────────────────────────────
function mixBGM(inputMp4, totalDuration, workDir) {
  if (!fs.existsSync(BGM_DIR)) return inputMp4;
  const bgmFiles = fs.readdirSync(BGM_DIR).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
  if (!bgmFiles.length) {
    log('⚠️', 'data/bgm/ 에 음악 파일 없음 — TTS만으로 진행 (YouTube 오디오 보관함 다운로드 후 저장)');
    return inputMp4;
  }
  const bgmPath = path.join(BGM_DIR, bgmFiles[0]);
  const out = path.join(workDir, 'with_bgm.mp4');
  const fadeSec = Math.max(0, totalDuration - 2);
  ff(['-y', '-i', inputMp4, '-i', bgmPath,
    '-filter_complex',
    `[1:a]volume=0.12,aloop=loop=-1:size=2000000000,atrim=0:${totalDuration},afade=t=out:st=${fadeSec}:d=2[bgm];[0:a][bgm]amix=inputs=2:duration=first[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', out]);
  log('🎵', `BGM 믹싱 완료: ${bgmFiles[0]}`);
  return out;
}

// ── 메인: 포스팅 → MP4 ───────────────────────────────────────────────────
export async function makeVideo(slug) {
  fs.mkdirSync(OUT_DIR,  { recursive: true });
  fs.mkdirSync(WORK_BASE, { recursive: true });

  const workDir = path.join(WORK_BASE, slug);
  fs.mkdirSync(workDir, { recursive: true });

  log('📖', `포스팅 파싱: ${slug}`);
  const post = parsePost(slug);
  log('📝', `제목: ${post.title} / 상품 ${post.products.length}개`);

  const narrations = generateNarrations(post);
  const segments = [];
  let totalDuration = 0;

  for (let i = 0; i < narrations.length; i++) {
    const n = narrations[i];
    log('🎙️', `슬라이드 ${i + 1}/${narrations.length}: ${n.topText}`);

    // TTS
    const wavFile = path.join(workDir, `tts_${i}.wav`);
    makeTTS(n.tts, wavFile);
    const ttsDuration = getWavDuration(wavFile);
    const duration    = Math.max(n.duration, ttsDuration);

    // 슬라이드 이미지
    const srcImg = post.images[n.imageKey];
    const slideImg = makeSlideImage({
      sourceImage: srcImg,
      workDir,
      slideIdx: i,
      topText:  n.topText,
      mainText: n.mainText,
      subText:  n.subText,
    });

    // 세그먼트
    const segMp4 = makeSegment({ slideImg, wavFile, duration, workDir, idx: i });
    segments.push(segMp4);
    totalDuration += duration;
  }

  log('🔗', `세그먼트 ${segments.length}개 연결 중...`);
  const combined = concatSegments(segments, workDir);

  log('🎵', 'BGM 합성 중...');
  const finalMp4 = mixBGM(combined, totalDuration, workDir);

  const outPath = path.join(OUT_DIR, `${slug}.mp4`);
  fs.copyFileSync(finalMp4, outPath);

  log('✅', `영상 완성: ${outPath} (${totalDuration}초)`);

  // 업로드용 메타데이터
  const description = buildDescription(post);
  return {
    videoPath:   outPath,
    title:       post.title,
    description,
    tags:        post.hashtags.slice(0, 15),
    totalSeconds: totalDuration,
  };
}

// ── YouTube 설명란 생성 ───────────────────────────────────────────────────
function buildDescription({ title, description, products, slug }) {
  const lines = [
    description || title,
    '',
    '▼ 구매 링크 (쿠팡파트너스)',
  ];
  products.forEach((p, i) => {
    if (p.coupangUrl) lines.push(`${i + 1}. ${p.name} ${p.price ? '(' + p.price + ')' : ''}\n→ ${p.coupangUrl}`);
  });
  lines.push('');
  lines.push('▼ 더 많은 트렌드 상품 비교');
  lines.push(`https://dmazone.github.io/blogauto/posts/trending-picks/${slug}/`);
  lines.push('https://dmazone.github.io/blogauto/posts/trending-picks/');
  lines.push('');
  lines.push('※ 이 영상은 쿠팡파트너스 활동의 일환으로 수수료를 제공받을 수 있습니다.');
  return lines.join('\n');
}

// ── CLI 직접 실행: node scripts/yt_video_maker.mjs <slug> ─────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const slug = process.argv[2];
  if (!slug) {
    console.error('사용법: node scripts/yt_video_maker.mjs <slug>');
    process.exit(1);
  }
  makeVideo(slug).then(meta => {
    console.log('\n=== 영상 생성 완료 ===');
    console.log('파일:', meta.videoPath);
    console.log('제목:', meta.title);
    console.log('길이:', meta.totalSeconds + '초');
    console.log('\n업로드: node scripts/yt_uploader.mjs', slug);
  }).catch(err => {
    console.error('❌ 오류:', err.message);
    process.exit(1);
  });
}
