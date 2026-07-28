/**
 * yt_make_shorts.mjs — trending-picks → 1080×1920 YouTube Shorts MP4
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  [지침] 슬라이드 배경 이미지 생성 표준 절차                        ║
 * ║                                                                  ║
 * ║  1. 포스팅 markdown에서 쿠팡 링크 q= 파라미터(상품명) 파싱         ║
 * ║  2. 상품명으로 Pollinations.ai (flux, 1080×1920) 이미지 병렬 생성 ║
 * ║     · bg_intro (s0, s3) : 전체 상품명 조합                       ║
 * ║     · bg_s1    (s1)     : 1위 상품명                             ║
 * ║     · bg_s2    (s2)     : 2위 상품명                             ║
 * ║  3. 15KB 미만 → 최대 2회 재시도                                   ║
 * ║  4. 생성 실패 시 → 포스팅 기존 이미지(thumb/01/02)로 폴백          ║
 * ║  5. 생성된 상품 이미지를 Playwright HTML 배경으로 깔고 텍스트 오버레이║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Usage: node scripts/yt_make_shorts.mjs [slug]
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.join(__dirname, '..');
const FFMPEG  = 'C:\\Users\\Paydma\\.vscode\\extensions\\kilocode.kilo-code-7.4.16-win32-x64\\bin\\ffmpeg.exe';
const FFPROBE = FFMPEG.replace('ffmpeg.exe', 'ffprobe.exe');
const OUT_DIR = path.join(ROOT, 'data', '1_youtube-shorts');
const BGM_DIR = path.join(OUT_DIR, 'bgm');

function toFileUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/');
}

function findLatestPost() {
  const dir = path.join(ROOT, 'content', 'posts', 'trending-picks');
  return fs.readdirSync(dir)
    .filter(d => d !== '_index.md' && fs.statSync(path.join(dir, d)).isDirectory())
    .sort().reverse()[0];
}

// 쿠팡 링크 q= 파라미터에서 상품 검색어 추출
function coupangQuery(url) {
  try {
    return decodeURIComponent(new URL(url).searchParams.get('q') || '').replace(/\+/g, ' ').trim();
  } catch { return ''; }
}

function parsePost(slug) {
  const md = fs.readFileSync(
    path.join(ROOT, 'content', 'posts', 'trending-picks', slug, 'index.md'), 'utf-8'
  );
  const title = (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || slug;

  // 상품 테이블 행 파싱 (**굵게** 표시된 첫 번째 컬럼)
  const productRows = [...md.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|/gm)].slice(0, 3);

  // 쿠팡 링크 URL 순서대로 추출
  const coupangUrls = [...md.matchAll(/https:\/\/www\.coupang\.com[^\s\)\"\'<>\]]+/g)]
    .map(m => m[0].replace(/[)\]\s,;]+$/, ''));

  const products = productRows.map((m, i) => ({
    name: m[1].trim(),
    price: m[2].trim(),
    // 쿠팡 q= 파라미터 → 없으면 상품명 그대로 사용
    imageQuery: coupangQuery(coupangUrls[i] || '') || m[1].trim(),
  }));

  const imgDir = path.join(ROOT, 'content', 'posts', 'trending-picks', slug);
  const fallback = (name) => {
    const p = path.join(imgDir, name);
    return fs.existsSync(p) ? p : path.join(imgDir, `${slug}-thumb.webp`);
  };

  return {
    title, products,
    fallback: {
      thumb: fallback(`${slug}-thumb.webp`),
      img01: fallback(`${slug}-01.webp`),
      img02: fallback(`${slug}-02.webp`),
    },
  };
}

// ── [지침 2단계] Pollinations.ai 상품 이미지 생성 ─────────────────
async function genProductImg(query, outPath, maxRetry = 2) {
  const prompt = `${query}, product photography, professional quality, clean background, vertical 9:16 format, high resolution`;
  const url    = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1920&model=flux&nologo=true`;

  for (let i = 1; i <= maxRetry; i++) {
    try {
      console.log(`  🎨 [${i}/${maxRetry}] ${query.slice(0, 30)}...`);
      const r = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 15_000) throw new Error(`너무 작음 ${buf.length}B`);
      fs.writeFileSync(outPath, buf);
      console.log(`  ✅ ${(buf.length / 1024).toFixed(0)}KB`);
      return true;
    } catch (e) {
      console.log(`  ⚠️ 실패 [${i}/${maxRetry}]: ${e.message}`);
    }
  }
  return false;
}

// ── HTML 슬라이드 빌드 (Malgun Gothic → 한국어 완벽 렌더링) ─────────
function buildHtml(bgImg, blocks) {
  const elems = blocks.map(b => `<div style="
    position:absolute;width:900px;left:90px;top:${b.top}px;
    font-size:${b.size || 48}px;color:${b.color || '#fff'};
    font-weight:${b.weight || 'bold'};text-align:center;
    text-shadow:2px 2px 16px rgba(0,0,0,1),0 0 40px rgba(0,0,0,.8);
    line-height:1.35;word-break:keep-all;">${b.text}</div>`).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1080px;height:1920px;overflow:hidden;position:relative;
    font-family:'Malgun Gothic','맑은 고딕',sans-serif;background:#111}
  .bg{position:absolute;inset:0;
    background:url('${toFileUrl(bgImg)}') center/cover no-repeat;
    filter:brightness(0.55) saturate(0.8)}
  .grad{position:absolute;inset:0;
    background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,.1) 45%,rgba(0,0,0,.55) 100%)}
</style></head><body>
  <div class="bg"></div><div class="grad"></div>
${elems}
</body></html>`;
}

// ── Windows SAPI TTS (한국어 음성 우선) ──────────────────────────
async function tts(text, wavPath) {
  return new Promise(resolve => {
    const safe = text.replace(/"/g, "'").replace(/\n/g, ' ').trim();
    const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | Where-Object {$_.Enabled -and $_.VoiceInfo.Culture -like 'ko*'} | Select-Object -First 1
if ($v) { $s.SelectVoice($v.VoiceInfo.Name); Write-Host "Voice: $($v.VoiceInfo.Name)" }
$s.Rate = 0
$s.SetOutputToWaveFile("${wavPath.replace(/\\/g, '/')}")
$s.Speak("${safe}")
$s.Dispose()`.trim();

    const proc = spawn('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe' });
    let log = '';
    proc.stdout.on('data', d => { log += d; });
    proc.stderr.on('data', d => { log += d; });
    proc.on('close', code => {
      const ok = code === 0 && fs.existsSync(wavPath) && fs.statSync(wavPath).size > 1000;
      console.log(ok ? `  🔊 TTS: ${log.trim()}` : '  ⚠️ TTS 실패 — 무음');
      resolve(ok);
    });
  });
}

async function getWavDur(wavPath) {
  return new Promise(resolve => {
    const p = spawn(FFPROBE, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', wavPath,
    ], { stdio: 'pipe' });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('close', () => resolve(Math.max(1, parseFloat(out.trim()) || 5)));
  });
}

function getBgmPath() {
  if (!fs.existsSync(BGM_DIR)) return null;
  const f = fs.readdirSync(BGM_DIR).find(n => /\.(mp3|wav|aac|m4a)$/i.test(n));
  return f ? path.join(BGM_DIR, f) : null;
}

async function runFF(args, label) {
  return new Promise((resolve, reject) => {
    if (label) process.stdout.write(`  [${label}] `);
    const p = spawn(FFMPEG, args, { stdio: 'pipe' });
    let err = '';
    p.stderr.on('data', d => { err += d; if (label) process.stdout.write('.'); });
    p.on('close', code => {
      if (label) console.log('');
      if (code === 0) resolve();
      else { console.error(err.slice(-500)); reject(new Error(`ffmpeg: ${label}`)); }
    });
  });
}

// ── 메인 ─────────────────────────────────────────────────────────
async function main() {
  let slug = process.argv[2];
  if (!slug) slug = findLatestPost();
  console.log('📹', slug);

  const post = parsePost(slug);
  console.log('제목:', post.title);
  console.log('상품:', post.products.map(p => p.name).join(' / '));
  console.log('이미지 쿼리:', post.products.map(p => p.imageQuery).join(' / '));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp     = path.join(OUT_DIR, `_tmp_${slug}`);
  fs.mkdirSync(tmp, { recursive: true });
  const outPath = path.join(OUT_DIR, `${slug}.mp4`);

  // ── [지침 1~4단계] 상품 이미지 병렬 생성 ─────────────────────
  console.log('\n🎨 배경 이미지 생성 (병렬)...');
  const introQuery = post.products.map(p => p.imageQuery).join(', ') || post.title;
  const s1Query    = post.products[0]?.imageQuery || post.title;
  const s2Query    = post.products[1]?.imageQuery || s1Query;

  const bgIntroFile = path.join(tmp, 'bg_intro.jpg');
  const bgS1File    = path.join(tmp, 'bg_s1.jpg');
  const bgS2File    = path.join(tmp, 'bg_s2.jpg');

  const [introOk, s1Ok, s2Ok] = await Promise.all([
    genProductImg(introQuery, bgIntroFile),
    genProductImg(s1Query,    bgS1File),
    genProductImg(s2Query,    bgS2File),
  ]);

  // [지침 4단계] 실패 시 포스팅 기존 이미지로 폴백
  const bgIntro = introOk ? bgIntroFile : post.fallback.thumb;
  const bgS1    = s1Ok    ? bgS1File    : post.fallback.img01;
  const bgS2    = s2Ok    ? bgS2File    : post.fallback.img02;

  // ── Playwright (한국어 HTML 렌더링) ────────────────────────
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });

  const segs = [];
  const E    = ['🥇', '🥈', '🥉'];
  const R    = ['1위', '2위', '3위'];

  async function makeSeg(name, bgImg, blocks, narration, minSec) {
    console.log(`\n▶ [${name}]`);

    // HTML → PNG
    const htmlFile = path.join(tmp, `${name}.html`);
    const pngFile  = path.join(tmp, `${name}.png`);
    fs.writeFileSync(htmlFile, buildHtml(bgImg, blocks), 'utf-8');
    await page.goto(toFileUrl(htmlFile), { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: pngFile });
    console.log('  📸 렌더링 OK');

    // TTS → WAV
    const wavFile = path.join(tmp, `${name}.wav`);
    const ttsOk   = await tts(narration, wavFile);

    // 슬라이드 길이 = TTS 길이 + 여유 1초 (최소 minSec)
    let dur = minSec;
    if (ttsOk) {
      const wavDur = await getWavDur(wavFile);
      dur = Math.max(minSec, Math.ceil(wavDur) + 1);
    }
    console.log(`  ⏱ ${dur}s`);

    // PNG + 오디오 → MP4 세그먼트
    const mp4File = path.join(tmp, `${name}.mp4`);
    if (ttsOk) {
      const aacFile = path.join(tmp, `${name}.aac`);
      await runFF(['-i', wavFile, '-af', `apad,atrim=duration=${dur}`,
        '-c:a', 'aac', '-b:a', '128k', '-y', aacFile], 'aac');
      await runFF(['-loop', '1', '-t', String(dur), '-i', pngFile,
        '-i', aacFile, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
        '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'copy', '-y', mp4File], 'seg');
    } else {
      await runFF(['-loop', '1', '-t', String(dur), '-i', pngFile,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
        '-pix_fmt', 'yuv420p', '-r', '30',
        '-c:a', 'aac', '-b:a', '128k', '-t', String(dur), '-y', mp4File], 'seg(무음)');
    }
    segs.push(mp4File);
  }

  // ── 슬라이드 0: 제목 ─────────────────────────────────────────
  await makeSeg('s0', bgIntro, [
    { text: '🔥 오늘의 추천 상품',          top: 180, size: 54, color: '#FFD700' },
    { text: post.title,                   top: 310, size: 60, color: '#FFFFFF' },
    { text: '요즘 제일 핫한 아이템이야',     top: 700, size: 42, color: '#87CEEB' },
    { text: '▼ 어떤 게 1위인지 확인해봐',   top: 790, size: 34, color: '#AAAAAA' },
  ],
  `오늘 진짜 핫한 트렌드 상품 소개해줄게. ${post.title}! 어떤 제품이 최고인지 같이 한번 확인해봐.`,
  7);

  // ── 슬라이드 1: TOP3 상품 ────────────────────────────────────
  const prodBlocks = [
    { text: '🏆 TOP 3 인기 상품 비교', top: 100, size: 52, color: '#FFD700' },
  ];
  post.products.forEach((p, i) => {
    const y = 360 + i * 440;
    prodBlocks.push({ text: `${E[i]} ${R[i]}`,  top: y,       size: 48, color: '#FFD700' });
    prodBlocks.push({ text: p.name,              top: y + 70,  size: 42, color: '#FFFFFF' });
    prodBlocks.push({ text: p.price,             top: y + 130, size: 36, color: '#87CEEB' });
  });
  const prodNarr = `TOP 3 인기 상품 한번 비교해볼게. ` +
    post.products.map((p, i) => `${R[i]}는 ${p.name}, 가격대는 ${p.price}.`).join(' ');
  await makeSeg('s1', bgS1, prodBlocks, prodNarr, 12);

  // ── 슬라이드 2: CTA ──────────────────────────────────────────
  await makeSeg('s2', bgS2, [
    { text: '📦 자세한 비교 & 리뷰는',    top: 300, size: 50, color: '#FFFFFF' },
    { text: '트렌드줌 블로그에 있어!',     top: 390, size: 62, color: '#FFD700' },
    { text: '쿠팡 최저가 링크도 포함 👇',  top: 550, size: 40, color: '#87CEEB' },
    { text: '@dmalog',                   top: 1700, size: 46, color: '#FFFFFF' },
  ],
  '더 자세한 비교랑 쿠팡 최저가 링크는 트렌드줌 블로그에서 확인할 수 있어. 설명란 링크 한번 들어가봐!',
  10);

  // ── 슬라이드 3: 아웃트로 ─────────────────────────────────────
  await makeSeg('s3', bgIntro, [
    { text: '구독 & 좋아요! 👍',           top: 740, size: 80, color: '#FFD700' },
    { text: '🔔 알림 켜놓으면 좋겠어!',    top: 870, size: 50, color: '#FFFFFF' },
    { text: '@dmalog',                    top: 1000, size: 54, color: '#87CEEB' },
  ],
  '구독이랑 좋아요 눌러주면 진짜 힘이 돼. 알림도 켜놓으면 새 영상 바로 받을 수 있어. 고마워!',
  5);

  await browser.close();

  // ── concat ────────────────────────────────────────────────
  console.log('\n🔗 합치기...');
  const listFile = path.join(tmp, 'list.txt');
  fs.writeFileSync(listFile, segs.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'));

  const bgmPath = getBgmPath();
  if (bgmPath) {
    const concatTmp = path.join(tmp, 'concat.mp4');
    await runFF(['-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-y', concatTmp], 'concat');
    await runFF(['-i', concatTmp, '-stream_loop', '-1', '-i', bgmPath,
      '-filter_complex', '[1:a]volume=0.12[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]',
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-y', outPath], 'bgm');
  } else {
    await runFF(['-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '128k', '-y', outPath], 'concat');
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅ ${path.basename(outPath)} (${mb}MB)`);

  // 업로드 전 미리보기 — 기본 플레이어로 열기
  console.log('📽 미리보기 열기...');
  spawn('cmd', ['/c', 'start', '', outPath], { detached: true, stdio: 'ignore' }).unref();

  console.log(`\n업로드:\nnode scripts/yt_upload.mjs "${outPath}"`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
