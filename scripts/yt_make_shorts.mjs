/**
 * yt_make_shorts.mjs — trending-picks → 1080×1920 YouTube Shorts MP4
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  [지침] 슬라이드 배경 이미지 생성 표준 절차                        ║
 * ║  1. 포스팅 markdown 쿠팡 링크 q= 파라미터(상품명) 파싱             ║
 * ║  2. Pollinations.ai (flux, 1080×1920) 이미지 병렬 생성            ║
 * ║     · bg_intro (s0,s3): 전체 상품 조합                           ║
 * ║     · bg_s1    (s1)   : 1위 상품명                               ║
 * ║     · bg_s2    (s2)   : 2위 상품명                               ║
 * ║  3. 15KB 미만 → 최대 2회 재시도                                   ║
 * ║  4. 실패 → 포스팅 기존 이미지(thumb/01/02)로 폴백                  ║
 * ║  5. HTML 배경 + Playwright 렌더링으로 텍스트 오버레이              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Flags:
 *   --no-preview   영상 생성 후 파일을 자동으로 열지 않음 (배치 처리용)
 *
 * Usage: node scripts/yt_make_shorts.mjs [slug] [--no-preview]
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
const FFMPEG     = 'C:\\Users\\Paydma\\.vscode\\extensions\\kilocode.kilo-code-7.4.16-win32-x64\\bin\\ffmpeg.exe';
const OUT_DIR    = path.join(ROOT, 'data', '1_youtube-shorts');
const BGM_DIR    = path.join(OUT_DIR, 'bgm');
const NO_PREVIEW = process.argv.includes('--no-preview');

// ── 텍스트 유틸 ────────────────────────────────────────────────────

// 한국어 단어 기준으로 maxChars마다 <br> 삽입
function breakText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if ([...candidate].length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return { html: lines.join('<br>'), lines: lines.length };
}

// 텍스트 길이에 따른 동적 폰트 크기
function dynFont(text, base) {
  const len = [...text].length;
  if (len <= 12) return base;
  if (len <= 18) return Math.round(base * 0.88);
  if (len <= 24) return Math.round(base * 0.78);
  return Math.round(base * 0.68);
}

// ── 파싱 ──────────────────────────────────────────────────────────

function toFileUrl(p) { return 'file:///' + p.replace(/\\/g, '/'); }

function findLatestPost() {
  const dir = path.join(ROOT, 'content', 'posts', 'trending-picks');
  return fs.readdirSync(dir)
    .filter(d => d !== '_index.md' && fs.statSync(path.join(dir, d)).isDirectory())
    .sort().reverse()[0];
}

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
  const rows = [...md.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|/gm)].slice(0, 3);
  const urls = [...md.matchAll(/https:\/\/www\.coupang\.com[^\s\)\"\'<>\]]+/g)]
    .map(m => m[0].replace(/[)\]\s,;]+$/, ''));

  const products = rows.map((m, i) => ({
    name:       m[1].trim(),
    price:      m[2].trim().replace(/\\\~/g, '~'),
    imageQuery: coupangQuery(urls[i] || '') || m[1].trim(),
  }));

  const imgDir  = path.join(ROOT, 'content', 'posts', 'trending-picks', slug);
  const fallImg = (name) => {
    const p = path.join(imgDir, name);
    return fs.existsSync(p) ? p : path.join(imgDir, `${slug}-thumb.webp`);
  };
  return {
    title, products,
    fallback: {
      thumb: fallImg(`${slug}-thumb.webp`),
      img01: fallImg(`${slug}-01.webp`),
      img02: fallImg(`${slug}-02.webp`),
    },
  };
}

// ── [지침 2단계] Pollinations.ai 상품 이미지 생성 ─────────────────

async function genImg(query, outPath, maxRetry = 2) {
  const prompt = `${query}, product photography, professional, clean, high quality, vertical 9:16`;
  const url    = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1920&model=flux&nologo=true`;
  for (let i = 1; i <= maxRetry; i++) {
    try {
      console.log(`  🎨 [${i}/${maxRetry}] ${query.slice(0, 28)}...`);
      const r   = await fetch(url, { signal: AbortSignal.timeout(90_000) });
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

// ── HTML 슬라이드 빌더 ────────────────────────────────────────────

// Playwright 헤드리스 모드에서 시스템 폰트 미인식 방지 — @font-face 절대 경로 직접 주입
const MALGUN_URL = 'file:///C:/Windows/Fonts/malgunbd.ttf';

function buildHtml(bgImg, blocks) {
  const elems = blocks.map(b => {
    const fs_  = b.size || 48;
    const maxH = b.maxH ? `max-height:${b.maxH}px;overflow:hidden;` : '';
    return `<div style="
      position:absolute;width:920px;left:80px;top:${b.top}px;
      font-size:${fs_}px;color:${b.color || '#fff'};
      font-weight:${b.weight || 'bold'};text-align:center;
      font-family:'KOR',sans-serif;
      text-shadow:3px 3px 20px rgba(0,0,0,1),0 0 50px rgba(0,0,0,.9);
      line-height:1.35;word-break:keep-all;${maxH}">${b.text}</div>`;
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  /* 헤드리스 Chromium에서 한글 폰트 보장 — 절대 경로 직접 로드 */
  @font-face {
    font-family: 'KOR';
    src: url('${MALGUN_URL}') format('truetype');
    font-weight: bold;
    font-style: normal;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1080px;height:1920px;overflow:hidden;position:relative;
    font-family:'KOR',sans-serif;background:#111}
  .bg{position:absolute;inset:0;
    background:url('${toFileUrl(bgImg)}') center/cover no-repeat;
    filter:brightness(0.52) saturate(0.75)}
  .grad{position:absolute;inset:0;
    background:linear-gradient(180deg,rgba(0,0,0,.6) 0%,rgba(0,0,0,.1) 45%,rgba(0,0,0,.65) 100%)}
</style></head><body>
  <div class="bg"></div><div class="grad"></div>
${elems}
</body></html>`;
}

// ── TTS ───────────────────────────────────────────────────────────

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
      console.log(ok ? `  🔊 ${log.trim() || 'TTS OK'}` : '  ⚠️ TTS 실패 — 무음');
      resolve(ok);
    });
  });
}

// ffprobe 대신 ffmpeg -i 로 Duration 파싱 (ffprobe 미설치 환경 대응)
async function getWavDur(wavPath) {
  return new Promise(resolve => {
    const p = spawn(FFMPEG, ['-i', wavPath, '-f', 'null', '-'], { stdio: 'pipe' });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (m) {
        const dur = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
        resolve(Math.max(1, dur));
      } else {
        resolve(5);
      }
    });
  });
}

function getBgm() {
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
      else { console.error(err.slice(-600)); reject(new Error(`ffmpeg: ${label}`)); }
    });
  });
}

// ── 메인 ─────────────────────────────────────────────────────────

export async function generate(slugArg) {
  const slug = slugArg || process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);
  const resolvedSlug = slug || findLatestPost();
  console.log('📹', resolvedSlug);

  const post = parsePost(resolvedSlug);
  console.log('제목:', post.title);
  console.log('상품:', post.products.map(p => p.name).join(' / '));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp     = path.join(OUT_DIR, `_tmp_${resolvedSlug}`);
  fs.mkdirSync(tmp, { recursive: true });
  const outPath = path.join(OUT_DIR, `${resolvedSlug}.mp4`);

  // ── [지침] 상품별 배경 이미지 병렬 생성 ────────────────────────
  console.log('\n🎨 상품 배경 이미지 생성 (병렬)...');
  const introQ    = post.products.map(p => p.imageQuery).join(', ') || post.title;
  const s1Q       = post.products[0]?.imageQuery || post.title;
  const s2Q       = post.products[1]?.imageQuery || s1Q;
  const bgIF      = path.join(tmp, 'bg_intro.jpg');
  const bgS1F     = path.join(tmp, 'bg_s1.jpg');
  const bgS2F     = path.join(tmp, 'bg_s2.jpg');

  const [introOk, s1Ok, s2Ok] = await Promise.all([
    genImg(introQ, bgIF), genImg(s1Q, bgS1F), genImg(s2Q, bgS2F),
  ]);
  const bgIntro = introOk ? bgIF  : post.fallback.thumb;
  const bgS1    = s1Ok    ? bgS1F : post.fallback.img01;
  const bgS2    = s2Ok    ? bgS2F : post.fallback.img02;

  // ── Playwright 렌더링 ────────────────────────────────────────
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });

  const segs     = [];
  const E        = ['🥇', '🥈', '🥉'];
  const R        = ['1위', '2위', '3위'];
  let   timeline = 0; // 싱크 모니터링용 누적 시간

  // ── 싱크 모니터 출력 ─────────────────────────────────────────
  console.log('\n📋 텍스트/음성 싱크 매핑:');

  async function makeSeg(name, bgImg, blocks, narration, minSec) {
    console.log(`\n▶ [${name}] bg: ${path.basename(bgImg)}`);

    // HTML → PNG
    const htmlFile = path.join(tmp, `${name}.html`);
    const pngFile  = path.join(tmp, `${name}.png`);
    fs.writeFileSync(htmlFile, buildHtml(bgImg, blocks), 'utf-8');
    await page.goto(toFileUrl(htmlFile), { waitUntil: 'load' });
    // 한글 @font-face 로드 완료까지 대기
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.screenshot({ path: pngFile });
    console.log('  📸 렌더링 OK');

    // TTS
    const wavFile = path.join(tmp, `${name}.wav`);
    const ttsOk   = await tts(narration, wavFile);

    let dur = minSec;
    if (ttsOk) {
      const wavDur = await getWavDur(wavFile);
      dur = Math.max(minSec, Math.ceil(wavDur) + 1);
    }

    // 싱크 모니터 로그
    const screenTexts = blocks.map(b => b.text.replace(/<br>/g, ' ')).join(' | ');
    console.log(`  ⏱ ${timeline.toFixed(1)}s - ${(timeline + dur).toFixed(1)}s (${dur}s)`);
    console.log(`  📺 화면: ${screenTexts.slice(0, 80)}`);
    console.log(`  🗣 음성: ${narration.slice(0, 80)}`);
    timeline += dur;

    // PNG + 오디오 → MP4
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
  const titleBroken   = breakText(post.title, 12);
  const titleFontSize = dynFont(post.title, 72);
  const titleHeight   = titleBroken.lines * Math.ceil(titleFontSize * 1.35) + 10;

  await makeSeg('s0', bgIntro, [
    { text: '🔥 오늘의 추천 상품',            top: 140, size: 52,         color: '#FFD700' },
    { text: titleBroken.html,               top: 240, size: titleFontSize, color: '#FFFFFF',
      maxH: titleBroken.lines * 110 + 20 },
    { text: '요즘 제일 핫한 아이템이야',       top: 240 + titleHeight + 80, size: 44, color: '#87CEEB' },
    { text: '▼ 어떤 게 1위인지 확인해봐',     top: 240 + titleHeight + 140, size: 36, color: '#AAAAAA' },
  ],
  `오늘 진짜 핫한 트렌드 상품 소개해줄게. ${post.title}! 어떤 제품이 제일인지 같이 한번 확인해봐.`,
  7);

  // ── 슬라이드 1: TOP3 상품 ────────────────────────────────────
  // 3개 상품을 1920px 안에 균등 배치 (헤더 80, 상품 3개, 하단 채널)
  const prodBlocks = [
    { text: '🏆 TOP 3 인기 상품 비교', top: 60, size: 52, color: '#FFD700' },
  ];
  post.products.forEach((p, i) => {
    const baseY    = 220 + i * 490;
    const nameBr   = breakText(p.name, 14);
    const nameFont = dynFont(p.name, 42);
    const nameH    = nameBr.lines * Math.ceil(nameFont * 1.35) + 10;

    prodBlocks.push({ text: `${E[i]} ${R[i]}`,  top: baseY,            size: 50, color: '#FFD700' });
    prodBlocks.push({ text: nameBr.html,         top: baseY + 70,       size: nameFont, color: '#FFFFFF',
      maxH: Math.max(nameH, 120) });
    prodBlocks.push({ text: p.price,             top: baseY + 70 + Math.max(nameH, 120) + 16,
      size: 36, color: '#87CEEB' });
  });
  prodBlocks.push({ text: '@dmalog', top: 1820, size: 36, color: 'rgba(255,255,255,0.6)', weight: 'normal' });

  const prodNarr = `TOP 3 인기 상품 한번 비교해볼게. ` +
    post.products.map((p, i) => `${R[i]}는 ${p.name}, 가격대는 ${p.price}.`).join(' ');
  await makeSeg('s1', bgS1, prodBlocks, prodNarr, 14);

  // ── 슬라이드 2: CTA ──────────────────────────────────────────
  await makeSeg('s2', bgS2, [
    { text: '📦 자세한 비교 & 리뷰는',   top: 320, size: 52, color: '#FFFFFF' },
    { text: '트렌드줌 블로그에 있어!',    top: 410, size: 66, color: '#FFD700' },
    { text: '쿠팡 최저가 링크도 포함 👇', top: 580, size: 42, color: '#87CEEB' },
    { text: '설명란 링크 한번 들어가봐',  top: 660, size: 36, color: '#AAAAAA' },
    { text: '@dmalog',                  top: 1750, size: 48, color: '#FFFFFF' },
  ],
  '더 자세한 비교랑 쿠팡 최저가 링크는 트렌드줌 블로그에서 확인할 수 있어. 설명란 링크 한번 들어가봐!',
  10);

  // ── 슬라이드 3: 아웃트로 ─────────────────────────────────────
  await makeSeg('s3', bgIntro, [
    { text: '구독 & 좋아요! 👍',         top: 760, size: 84, color: '#FFD700' },
    { text: '🔔 알림 켜놓으면 좋겠어!',  top: 900, size: 52, color: '#FFFFFF' },
    { text: '@dmalog',                  top: 1020, size: 56, color: '#87CEEB' },
  ],
  '구독이랑 좋아요 눌러주면 진짜 힘이 돼. 알림도 켜놓으면 새 영상 바로 받을 수 있어. 고마워!',
  5);

  await browser.close();

  // ── 총 싱크 요약 ─────────────────────────────────────────────
  console.log(`\n📊 총 영상 길이: ${timeline.toFixed(1)}s`);

  // ── concat ────────────────────────────────────────────────
  console.log('\n🔗 합치기...');
  const listFile = path.join(tmp, 'list.txt');
  fs.writeFileSync(listFile, segs.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'));

  const bgmPath = getBgm();
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

  if (!NO_PREVIEW) {
    console.log('📽 미리보기 열기...');
    spawn('cmd', ['/c', 'start', '', outPath], { detached: true, stdio: 'ignore' }).unref();
  }

  console.log(`\n업로드:\nnode scripts/yt_upload.mjs "${outPath}"`);
  return outPath;
}

// 직접 실행 시
if (process.argv[1].endsWith('yt_make_shorts.mjs')) {
  generate().catch(e => { console.error('❌', e.message); process.exit(1); });
}
