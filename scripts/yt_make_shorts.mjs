/**
 * yt_make_shorts.mjs
 * trending-picks 최신 포스팅 → 1080×1920 YouTube Shorts MP4
 * Usage: node scripts/yt_make_shorts.mjs [slug]
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FFMPEG = path.join(
  'C:', 'Users', 'Paydma', '.vscode', 'extensions',
  'kilocode.kilo-code-7.4.16-win32-x64', 'bin', 'ffmpeg.exe'
);
const FONT = 'C:/Windows/Fonts/malgunbd.ttf';
const OUT_DIR = path.join(ROOT, 'data', 'shorts');

function escText(t) {
  // FFmpeg drawtext 이스케이프: 콜론, 작은따옴표, 백슬래시
  return String(t)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '%%');
}

function findLatestPost() {
  const dir = path.join(ROOT, 'content', 'posts', 'trending-picks');
  return fs.readdirSync(dir)
    .filter(d => d !== '_index.md' && fs.statSync(path.join(dir, d)).isDirectory())
    .sort().reverse()[0];
}

function parsePost(slug) {
  const md = fs.readFileSync(
    path.join(ROOT, 'content', 'posts', 'trending-picks', slug, 'index.md'), 'utf-8'
  );
  const title = (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || slug;
  const products = [...md.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|/gm)]
    .map(m => ({ name: m[1].trim(), price: m[2].trim() })).slice(0, 3);

  const imgDir = path.join(ROOT, 'content', 'posts', 'trending-picks', slug);
  return {
    title,
    products,
    thumb: path.join(imgDir, `${slug}-thumb.webp`),
    img01: path.join(imgDir, `${slug}-01.webp`),
    img02: path.join(imgDir, `${slug}-02.webp`),
  };
}

function dt(text, x, y, size, color = 'white') {
  const t = escText(text);
  return `drawtext=fontfile='${FONT}'\\:text='${t}'\\:x=${x}\\:y=${y}\\:fontsize=${size}\\:fontcolor=${color}\\:box=1\\:boxcolor=black@0.55\\:boxborderw=10`;
}

async function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    console.log('\n📍 FFmpeg 인수:', args.slice(-3).join(' '));
    const ff = spawn(FFMPEG, args, { stdio: 'pipe' });
    let err = '';
    ff.stderr.on('data', d => { err += d; process.stdout.write('.'); });
    ff.on('close', code => {
      console.log('');
      if (code === 0) resolve();
      else {
        console.error('❌ exit:', code);
        console.error(err.slice(-800));
        reject(new Error('ffmpeg failed'));
      }
    });
  });
}

async function generate(slug) {
  if (!slug) slug = findLatestPost();
  console.log('📹 슬러그:', slug);
  const post = parsePost(slug);
  console.log('제목:', post.title);
  console.log('상품:', post.products.map(p => p.name).join(', '));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmpDir = path.join(OUT_DIR, 'tmp_' + slug);
  fs.mkdirSync(tmpDir, { recursive: true });
  const outPath = path.join(OUT_DIR, `${slug}.mp4`);

  const W = 1080, H = 1920;
  const scale = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;

  // 각 슬라이드를 개별 mp4로 생성
  const slides = [];

  async function makeSlide(name, imgPath, duration, filters) {
    const out = path.join(tmpDir, `${name}.mp4`);
    const vf = [scale, ...filters].join(',');
    await runFFmpeg([
      '-loop', '1', '-t', String(duration), '-i', imgPath,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-r', '30', '-y', out,
    ]);
    slides.push(out);
    return out;
  }

  // 슬라이드 0: 제목 (thumb, 8s)
  const titleLines = [];
  const chars = [...post.title];
  let line = '';
  for (const c of chars) {
    line += c;
    if (line.length >= 13) { titleLines.push(line); line = ''; }
  }
  if (line) titleLines.push(line);

  const titleFilters = titleLines.slice(0, 3).map((l, i) =>
    dt(l, `(w-tw)/2`, String(280 + i * 90), 72, 'white')
  );
  titleFilters.push(dt('지금 가장 인기 있는 상품은?', `(w-tw)/2`, '620', 42, '#FFD700'));

  console.log('\n슬라이드 0: 제목');
  await makeSlide('s0', post.thumb, 8, titleFilters);

  // 슬라이드 1: TOP3 목록 (img01, 14s)
  const prod1Filters = [
    dt('🏆 TOP3 인기 상품 비교', `(w-tw)/2`, '160', 54, '#FFD700'),
  ];
  post.products.forEach((p, i) => {
    const emoji = ['①', '②', '③'][i];
    prod1Filters.push(dt(`${emoji} ${p.name}`, '80', String(360 + i * 130), 46, 'white'));
    prod1Filters.push(dt(p.price, '80', String(420 + i * 130), 38, '#87CEEB'));
  });

  console.log('\n슬라이드 1: 상품 목록');
  await makeSlide('s1', post.img01, 14, prod1Filters);

  // 슬라이드 2: 추천 멘트 (img02, 12s)
  const cta2Filters = [
    dt('📦 자세한 비교는', `(w-tw)/2`, '300', 56, 'white'),
    dt('트렌드줌 블로그에서!', `(w-tw)/2`, '380', 56, '#FFD700'),
    dt('쿠팡 최저가 링크 포함', `(w-tw)/2`, '500', 40, '#87CEEB'),
    dt('@dmalog', `(w-tw)/2`, String(H - 180), 52, 'white'),
  ];

  console.log('\n슬라이드 2: CTA');
  await makeSlide('s2', post.img02, 12, cta2Filters);

  // 슬라이드 3: 구독 유도 (thumb, 5s)
  const outroFilters = [
    dt('구독 & 좋아요!', `(w-tw)/2`, String(H / 2 - 60), 88, '#FFD700'),
    dt('@dmalog', `(w-tw)/2`, String(H / 2 + 60), 62, 'white'),
  ];

  console.log('\n슬라이드 3: 아웃트로');
  await makeSlide('s3', post.thumb, 5, outroFilters);

  // concat
  console.log('\n🔗 슬라이드 합치기...');
  const listFile = path.join(tmpDir, 'list.txt');
  fs.writeFileSync(listFile, slides.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'));

  await runFFmpeg([
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-y', outPath,
  ]);

  const size = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅ 완료: ${outPath} (${size}MB)`);
  console.log(`다음: node scripts/yt_upload.mjs "${outPath}"`);

  // 임시 파일 정리
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return outPath;
}

const slug = process.argv[2];
generate(slug).catch(e => { console.error(e.message); process.exit(1); });
