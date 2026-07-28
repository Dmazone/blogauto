/**
 * yt_make_shorts.mjs
 * trending-picks 최신 포스팅 → 1080×1920 YouTube Shorts MP4
 * HTML → Playwright 스크린샷 → Windows SAPI TTS → FFmpeg 합성
 * Usage: node scripts/yt_make_shorts.mjs [slug]
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FFMPEG = 'C:\\Users\\Paydma\\.vscode\\extensions\\kilocode.kilo-code-7.4.16-win32-x64\\bin\\ffmpeg.exe';
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

function parsePost(slug) {
  const md = fs.readFileSync(
    path.join(ROOT, 'content', 'posts', 'trending-picks', slug, 'index.md'), 'utf-8'
  );
  const title = (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || slug;
  const products = [...md.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|/gm)]
    .map(m => ({ name: m[1].trim(), price: m[2].trim() })).slice(0, 3);
  const imgDir = path.join(ROOT, 'content', 'posts', 'trending-picks', slug);
  const img = (name) => {
    const p = path.join(imgDir, name);
    return fs.existsSync(p) ? p : path.join(imgDir, `${slug}-thumb.webp`);
  };
  return {
    title, products,
    thumb: img(`${slug}-thumb.webp`),
    img01: img(`${slug}-01.webp`),
    img02: img(`${slug}-02.webp`),
  };
}

// 슬라이드 HTML 생성 (Malgun Gothic → 한국어 완벽 렌더링)
function buildHtml(bgImg, blocks) {
  const elems = blocks.map(b => {
    const st = [
      'position:absolute', 'width:900px', 'left:90px',
      `top:${b.top}px`,
      `font-size:${b.size || 48}px`,
      `color:${b.color || '#fff'}`,
      `font-weight:${b.weight || 'bold'}`,
      'text-align:center',
      'text-shadow:2px 2px 16px rgba(0,0,0,1),0 0 40px rgba(0,0,0,.8)',
      'line-height:1.35',
      'word-break:keep-all',
    ].join(';');
    return `<div style="${st}">${b.text}</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    width:1080px;height:1920px;overflow:hidden;position:relative;
    font-family:'Malgun Gothic','맑은 고딕',sans-serif;background:#111;
  }
  .bg{
    position:absolute;inset:0;
    background:url('${toFileUrl(bgImg)}') center/cover no-repeat;
    filter:brightness(0.55) saturate(0.8);
  }
  .grad{
    position:absolute;inset:0;
    background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,.1) 45%,rgba(0,0,0,.55) 100%);
  }
</style></head><body>
  <div class="bg"></div>
  <div class="grad"></div>
${elems}
</body></html>`;
}

// Windows SAPI TTS → WAV (한국어 음성 우선)
async function tts(text, wavPath) {
  return new Promise(resolve => {
    const safe = text.replace(/"/g, "'").replace(/\n/g, ' ').trim();
    const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$kov = $s.GetInstalledVoices() | Where-Object {$_.Enabled -and $_.VoiceInfo.Culture -like 'ko*'} | Select-Object -First 1
if ($kov) { $s.SelectVoice($kov.VoiceInfo.Name); Write-Host "Voice: $($kov.VoiceInfo.Name)" }
else { Write-Host "Voice: default" }
$s.Rate = 0
$s.SetOutputToWaveFile("${wavPath.replace(/\\/g, '/')}")
$s.Speak("${safe}")
$s.Dispose()
`.trim();
    const proc = spawn('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe' });
    let log = '';
    proc.stdout.on('data', d => { log += d; });
    proc.stderr.on('data', d => { log += d; });
    proc.on('close', code => {
      const ok = code === 0 && fs.existsSync(wavPath) && fs.statSync(wavPath).size > 1000;
      console.log(ok ? `  🔊 TTS: ${log.trim()}` : '  ⚠️ TTS 실패 — 무음 처리');
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

async function ff(args, label) {
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

async function main() {
  let slug = process.argv[2];
  if (!slug) slug = findLatestPost();
  console.log('📹 슬러그:', slug);

  const post = parsePost(slug);
  console.log('제목:', post.title);
  console.log('상품:', post.products.map(p => p.name).join(' / '));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp = path.join(OUT_DIR, `_tmp_${slug}`);
  fs.mkdirSync(tmp, { recursive: true });
  const outPath = path.join(OUT_DIR, `${slug}.mp4`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });

  const segs = [];

  // ─── 슬라이드 생성 헬퍼 ─────────────────────────────────────
  async function makeSeg(name, bgImg, blocks, narration, minSec) {
    console.log(`\n▶ 슬라이드 [${name}]`);

    // HTML → PNG (한국어 텍스트 완벽 렌더링)
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

    // 슬라이드 길이 결정 (TTS 길이 + 여유 1초)
    let dur = minSec;
    if (ttsOk) {
      const wavDur = await getWavDur(wavFile);
      dur = Math.max(minSec, Math.ceil(wavDur) + 1);
    }
    console.log(`  ⏱ ${dur}s`);

    const mp4File = path.join(tmp, `${name}.mp4`);

    if (ttsOk) {
      // WAV → AAC (dur초로 맞춤 + 무음 패딩)
      const aacFile = path.join(tmp, `${name}.aac`);
      await ff([
        '-i', wavFile,
        '-af', `apad,atrim=duration=${dur}`,
        '-c:a', 'aac', '-b:a', '128k', '-y', aacFile,
      ], 'aac');
      // PNG + AAC → MP4 세그먼트
      await ff([
        '-loop', '1', '-t', String(dur), '-i', pngFile,
        '-i', aacFile,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
        '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'copy', '-y', mp4File,
      ], 'seg');
    } else {
      // 무음 MP4
      await ff([
        '-loop', '1', '-t', String(dur), '-i', pngFile,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
        '-pix_fmt', 'yuv420p', '-r', '30',
        '-c:a', 'aac', '-b:a', '128k', '-t', String(dur), '-y', mp4File,
      ], 'seg(무음)');
    }
    segs.push(mp4File);
  }

  const E = ['🥇', '🥈', '🥉'];
  const R = ['1위', '2위', '3위'];

  // ─── 슬라이드 0 : 제목 (8s) ─────────────────────────────────
  await makeSeg('s0', post.thumb, [
    { text: '🔥 오늘의 추천 상품', top: 180, size: 54, color: '#FFD700' },
    { text: post.title,              top: 310, size: 60, color: '#FFFFFF' },
    { text: '지금 가장 핫한 아이템',   top: 700, size: 42, color: '#87CEEB' },
    { text: '▼ 아래에서 확인해봐',     top: 790, size: 34, color: '#AAAAAA' },
  ],
  `오늘의 추천 상품 알려줄게. ${post.title}! 지금 가장 인기 있는 아이템 소개해줄게.`,
  7);

  // ─── 슬라이드 1 : TOP3 상품 (12s) ───────────────────────────
  const prodBlocks = [
    { text: '🏆 TOP 3 인기 상품 비교', top: 100, size: 52, color: '#FFD700' },
  ];
  post.products.forEach((p, i) => {
    const y = 360 + i * 440;
    prodBlocks.push({ text: `${E[i]} ${R[i]}`,  top: y,       size: 48, color: '#FFD700' });
    prodBlocks.push({ text: p.name,              top: y + 70,  size: 42, color: '#FFFFFF' });
    prodBlocks.push({ text: p.price,             top: y + 130, size: 36, color: '#87CEEB' });
  });
  const prodNarr = `TOP 3 인기 상품 비교야. ` +
    post.products.map((p, i) => `${R[i]}는 ${p.name}, 가격은 ${p.price}.`).join(' ');
  await makeSeg('s1', post.img01, prodBlocks, prodNarr, 12);

  // ─── 슬라이드 2 : CTA (10s) ─────────────────────────────────
  await makeSeg('s2', post.img02, [
    { text: '📦 자세한 비교 & 리뷰는', top: 300, size: 50, color: '#FFFFFF' },
    { text: '트렌드줌 블로그에서!',     top: 390, size: 62, color: '#FFD700' },
    { text: '쿠팡 최저가 링크 포함 👇', top: 550, size: 40, color: '#87CEEB' },
    { text: '@dmalog',                 top: 1700, size: 46, color: '#FFFFFF' },
  ],
  '자세한 비교랑 쿠팡 최저가 링크는 트렌드줌 블로그에서 확인해봐! 설명란 링크 클릭해봐.',
  10);

  // ─── 슬라이드 3 : 아웃트로 (5s) ────────────────────────────
  await makeSeg('s3', post.thumb, [
    { text: '구독 & 좋아요! 👍',    top: 740, size: 80, color: '#FFD700' },
    { text: '🔔 알림도 켜놔!',    top: 870, size: 50, color: '#FFFFFF' },
    { text: '@dmalog',            top: 1000, size: 54, color: '#87CEEB' },
  ],
  '구독이랑 좋아요 눌러줘! 알림도 꼭 켜놔. 고마워!',
  5);

  await browser.close();

  // ─── concat ─────────────────────────────────────────────────
  console.log('\n🔗 합치기...');
  const listFile = path.join(tmp, 'list.txt');
  fs.writeFileSync(listFile, segs.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'));

  const bgmPath = getBgmPath();
  if (bgmPath) {
    const concatTmp = path.join(tmp, 'concat.mp4');
    await ff([
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-y', concatTmp,
    ], 'concat');
    console.log('  🎵 BGM 믹싱...');
    await ff([
      '-i', concatTmp,
      '-stream_loop', '-1', '-i', bgmPath,
      '-filter_complex', '[1:a]volume=0.12[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]',
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-y', outPath,
    ], 'bgm');
  } else {
    await ff([
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '128k', '-y', outPath,
    ], 'concat');
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅ ${path.basename(outPath)} (${mb}MB)`);

  // 업로드 전 미리보기 — 기본 비디오 플레이어로 열기
  console.log('📽 미리보기 열기...');
  spawn('cmd', ['/c', 'start', '', outPath], { detached: true, stdio: 'ignore' }).unref();

  console.log(`\n업로드:\nnode scripts/yt_upload.mjs "${outPath}"`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
