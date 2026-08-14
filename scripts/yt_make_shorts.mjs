/**
 * yt_make_shorts.mjs v2 — Edge TTS Neural + Playwright 비디오 녹화 + CSS 애니메이션
 *
 * 슬라이드 구조: hook(2.5s) → 1위(4s) → 2위(4s) → 3위(4s) → CTA(2.5s) ≈ 17s
 * TTS: ko-KR-InJoonNeural (Microsoft Edge Neural, 무료)
 * 배경: Gemini 블로그 이미지 우선, 없으면 단색 (#06040f)
 */
import { chromium } from 'playwright';
import pkg from 'msedge-tts';
const { MsEdgeTTS, OUTPUT_FORMAT } = pkg;
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
const FFMPEG     = 'C:\\Users\\Paydma\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe';
const OUT_DIR    = path.join(ROOT, 'data', '1_youtube-shorts');
const BGM_DIR    = path.join(OUT_DIR, 'bgm');
const FONT_URL   = 'file:///C:/Windows/Fonts/malgunbd.ttf';
const TTS_VOICE  = 'ko-KR-InJoonNeural';
const NO_PREVIEW = process.argv.includes('--no-preview');

// ── 유틸 ──────────────────────────────────────────────────────────
function toFileUrl(p) { return 'file:///' + p.replace(/\\/g, '/'); }

function getBgm() {
  if (!fs.existsSync(BGM_DIR)) return null;
  const f = fs.readdirSync(BGM_DIR).find(n => /\.(mp3|wav|aac|m4a)$/i.test(n));
  return f ? path.join(BGM_DIR, f) : null;
}

function findLatestPost() {
  const dir = path.join(ROOT, 'content', 'posts', 'trending-picks');
  return fs.readdirSync(dir)
    .filter(d => d !== '_index.md' && fs.statSync(path.join(dir, d)).isDirectory())
    .sort().reverse()[0];
}

function coupangQuery(url) {
  try { return decodeURIComponent(new URL(url).searchParams.get('q') || '').trim(); }
  catch { return ''; }
}

function parsePost(slug) {
  const md = fs.readFileSync(
    path.join(ROOT, 'content', 'posts', 'trending-picks', slug, 'index.md'), 'utf-8'
  );
  const title = (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || slug;
  const tableRows = [...md.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|/gm)].slice(0, 3);
  const urls = [...md.matchAll(/https:\/\/www\.coupang\.com[^\s\)\"\'<>\]]+/g)]
    .map(m => m[0].replace(/[)\]\s,;]+$/, ''));

  let products;
  if (tableRows.length >= 1) {
    products = tableRows.map((m, i) => ({
      name:  m[1].trim(),
      price: m[2].trim().replace(/\\\~/g, '~'),
      query: coupangQuery(urls[i] || '') || m[1].trim(),
    }));
  } else {
    const headings = [...md.matchAll(/###\s*\d+[)\.]\s*(?:\[[^\]]*\]\s*)?\[?([가-힣A-Za-z0-9\s\(\)\-]+?)\]?(?:\s*\([^)]*\))?\s*[\n\r]/gm)].slice(0, 3);
    products = headings.map((m, i) => ({
      name: m[1].trim().replace(/\s+/g, ' '),
      price: '',
      query: m[1].trim(),
    }));
  }

  const imgDir = path.join(ROOT, 'content', 'posts', 'trending-picks', slug);
  const img = n => { const p = path.join(imgDir, n); return fs.existsSync(p) ? p : null; };
  return {
    title, products,
    bg: {
      thumb: img(`${slug}-thumb.webp`),
      img01: img(`${slug}-01.webp`),
      img02: img(`${slug}-02.webp`),
    },
  };
}

// ── Edge TTS (생성 후 FFmpeg 1.8배속) ────────────────────────────
async function ttsEdge(text, mp3Path) {
  const rawPath = mp3Path.replace(/\.mp3$/, '_raw.mp3');
  return new Promise(async resolve => {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(TTS_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);
      const ws = fs.createWriteStream(rawPath);
      audioStream.pipe(ws);
      ws.on('finish', async () => {
        const ok = fs.existsSync(rawPath) && fs.statSync(rawPath).size > 500;
        if (!ok) { console.log('  ⚠️ TTS 실패'); return resolve(false); }
        // 1.8배속으로 처리
        await runFF(['-i', rawPath, '-filter:a', 'atempo=1.8', '-y', mp3Path], null);
        try { fs.unlinkSync(rawPath); } catch {}
        console.log(`  🔊 Edge TTS OK (1.8x)`);
        resolve(true);
      });
      ws.on('error', () => resolve(false));
      audioStream.on('error', () => resolve(false));
    } catch (e) {
      console.log('  ⚠️ TTS 오류:', e.message);
      resolve(false);
    }
  });
}

async function getAudioDur(filePath) {
  return new Promise(resolve => {
    const p = spawn(FFMPEG, ['-i', filePath, '-f', 'null', '-'], { stdio: 'pipe' });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      resolve(m ? +m[1]*3600 + +m[2]*60 + parseFloat(m[3]) : 3);
    });
  });
}

// ── FFmpeg ────────────────────────────────────────────────────────
async function runFF(args, label) {
  return new Promise((resolve, reject) => {
    if (label) process.stdout.write(`  [${label}] `);
    const p = spawn(FFMPEG, args, { stdio: 'pipe' });
    let err = '';
    p.stderr.on('data', d => { err += d; if (label) process.stdout.write('.'); });
    p.on('close', code => {
      if (label) console.log('');
      if (code === 0) resolve();
      else { console.error(err.slice(-400)); reject(new Error(`ffmpeg ${label}`)); }
    });
  });
}

// ── HTML 공통 래퍼 ────────────────────────────────────────────────
function baseHtml(bgImg, body, css = '') {
  const bgUrl = bgImg ? toFileUrl(bgImg) : null;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
@font-face{font-family:'K';src:url('${FONT_URL}') format('truetype');font-weight:bold}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1920px;overflow:hidden;background:#06040f;font-family:'K',sans-serif;position:relative}
.bg{position:absolute;inset:0;z-index:0}
.bg img{width:100%;height:100%;object-fit:cover;object-position:center;
  filter:brightness(.70) saturate(1.3) contrast(1.05)}
.vign{position:absolute;inset:0;
  background:radial-gradient(ellipse at center,transparent 20%,rgba(0,0,0,.65) 100%)}
.ov{position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(5,0,30,.65) 0%,transparent 22%,transparent 78%,rgba(0,0,20,.75) 100%)}
.stripe{position:absolute;left:0;right:0;height:6px}
.stripe-t{top:0;background:linear-gradient(90deg,#FF0066,#FF6B35,#FFD700,#00DDFF,#FF0066);background-size:200% 100%}
.stripe-b{bottom:0;background:linear-gradient(90deg,#00DDFF,#FFD700,#FF6B35,#FF0066,#00DDFF);background-size:200% 100%}
.wrap{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px}
${css}
</style></head><body>
<div class="bg">${bgUrl ? `<img src="${bgUrl}"/>` : ''}</div>
<div class="vign"></div><div class="ov"></div>
<div class="stripe stripe-t"></div><div class="stripe stripe-b"></div>
<div class="wrap">${body}</div>
</body></html>`;
}

// ── 슬라이드 1: 훅 ────────────────────────────────────────────────
function hookHtml(bgImg, title) {
  const topic = title.replace(/TOP\s*\d+[^가-힣]*/, '').replace(/^[\d년\s]+/, '').trim() || title;
  return baseHtml(bgImg, `
<div class="fire">🔥</div>
<div class="hook">모르면 손해!</div>
<div class="topic">${topic}</div>
<div class="sub">지금 TOP3 다 알려드릴게요 👇</div>`, `
@keyframes zoomBounce{0%{transform:scale(.3) rotate(-15deg);opacity:0}65%{transform:scale(1.2) rotate(3deg)}100%{transform:scale(1) rotate(0);opacity:1}}
@keyframes slideUp{from{transform:translateY(80px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes glow{0%,100%{text-shadow:0 0 30px #FF3333,0 0 60px #FF333388,3px 3px 0 #000}50%{text-shadow:0 0 70px #FF0000,0 0 140px #FF000066,3px 3px 0 #000}}
.fire{font-size:170px;line-height:1;animation:zoomBounce .7s cubic-bezier(.175,.885,.32,1.275) forwards}
.hook{font-size:108px;font-weight:900;color:#FF3333;margin-top:8px;text-align:center;
  animation:slideUp .55s ease .5s both,glow 2s ease-in-out 1.1s infinite;
  word-break:keep-all;padding:0 30px}
.topic{font-size:62px;color:#FFD700;margin-top:28px;text-align:center;
  animation:slideUp .5s ease .9s both;word-break:keep-all;line-height:1.35;padding:0 50px;
  text-shadow:2px 2px 10px rgba(0,0,0,.9)}
.sub{font-size:50px;color:rgba(255,255,255,.88);margin-top:32px;text-align:center;
  animation:slideUp .5s ease 1.3s both}`);
}

// ── 슬라이드 2~4: 제품 ───────────────────────────────────────────
function productHtml(bgImg, product, rank) {
  const { name, price } = product;
  const EMOJI  = ['🥇','🥈','🥉'];
  const COLORS = ['#FFD700','#C8C8C8','#CD7F32'];
  const color  = COLORS[rank];
  const fs_    = name.length > 16 ? 60 : name.length > 12 ? 68 : 76;
  return baseHtml(bgImg, `
<div class="p-badge">${EMOJI[rank]}</div>
<div class="p-ranktext">${rank+1}위</div>
<div class="p-card">
  <div class="p-name">${name}</div>
  ${price ? `<div class="p-price">💰 ${price}</div>` : ''}
</div>
<div class="p-hint">👆 설명란 쿠팡 최저가 링크</div>`, `
@keyframes badgePop{0%{transform:scale(0) rotate(-40deg);opacity:0}70%{transform:scale(1.25) rotate(4deg)}100%{transform:scale(1) rotate(0);opacity:1}}
@keyframes slideRight{from{transform:translateX(-160px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes fadeUp{from{transform:translateY(50px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes rankGlow{0%,100%{text-shadow:0 0 20px ${color}88}50%{text-shadow:0 0 50px ${color},0 0 90px ${color}66}}
.p-badge{font-size:150px;line-height:1;text-align:center;
  animation:badgePop .7s cubic-bezier(.175,.885,.32,1.275) forwards}
.p-ranktext{font-size:64px;font-weight:900;color:${color};text-align:center;margin-top:4px;
  animation:fadeUp .4s ease .55s both,rankGlow 2s ease-in-out 1s infinite;
  text-shadow:0 0 20px ${color}88,2px 2px 0 #000}
.p-card{background:rgba(0,0,0,.80);border:2px solid ${color}66;border-radius:32px;
  padding:44px 56px;margin-top:24px;width:100%;
  animation:slideRight .6s ease .75s both;
  box-shadow:0 8px 60px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08)}
.p-name{font-size:${fs_}px;font-weight:900;color:#fff;word-break:keep-all;
  line-height:1.3;text-shadow:2px 2px 10px rgba(0,0,0,.9)}
.p-price{font-size:52px;color:#87CEEB;font-weight:bold;margin-top:18px;
  animation:fadeUp .4s ease 1.1s both}
.p-hint{font-size:40px;color:rgba(255,255,255,.72);margin-top:32px;text-align:center;
  animation:fadeUp .4s ease 1.4s both}`);
}

// ── 슬라이드 5: CTA ───────────────────────────────────────────────
function ctaHtml(bgImg) {
  return baseHtml(bgImg, `
<div class="c-arrow">👆</div>
<div class="c-main">설명란 링크<br>= 쿠팡 최저가!</div>
<div class="c-gap"></div>
<div class="c-btn">지금 바로 확인 🛒</div>
<div class="c-like">👍 좋아요  🔔 구독  💬 댓글</div>`, `
@keyframes bounceIn{0%{transform:scale(.2);opacity:0}50%{transform:scale(1.18)}80%{transform:scale(.94)}100%{transform:scale(1);opacity:1}}
@keyframes wiggle{0%,100%{transform:rotate(-3deg) scale(1)}50%{transform:rotate(3deg) scale(1.03)}}
.c-arrow{font-size:150px;line-height:1;animation:bounceIn .65s ease forwards}
.c-main{font-size:88px;font-weight:900;color:#FFD700;text-align:center;margin-top:16px;
  animation:bounceIn .65s ease .35s both;word-break:keep-all;line-height:1.25;
  text-shadow:3px 3px 0 #000,0 0 50px #FFD70066}
.c-gap{height:44px}
.c-btn{background:linear-gradient(135deg,#FF0066,#FF6B35);border-radius:999px;
  padding:34px 80px;font-size:62px;font-weight:900;color:#fff;
  animation:bounceIn .65s ease .7s both,wiggle .55s ease 1.6s infinite;
  box-shadow:0 10px 50px rgba(255,0,102,.55);text-shadow:2px 2px 6px rgba(0,0,0,.4)}
.c-like{font-size:48px;color:rgba(255,255,255,.82);margin-top:44px;text-align:center;
  animation:bounceIn .65s ease 1.1s both}`);
}

// ── 슬라이드 → MP4 (Playwright recordVideo) ───────────────────────
async function slideToMp4(browser, { name, html, mp3Path, minDur }, tmp) {
  const audioDur = (mp3Path && fs.existsSync(mp3Path)) ? await getAudioDur(mp3Path) : 0;
  const dur = Math.max(minDur, audioDur + 0.5);

  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    recordVideo: { dir: tmp, size: { width: 1080, height: 1920 } },
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const htmlFile = path.join(tmp, `${name}.html`);
  fs.writeFileSync(htmlFile, html, 'utf-8');
  await page.goto(toFileUrl(htmlFile), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(Math.ceil(dur * 1000));

  await context.close();
  const webmPath = await page.video().path();

  // webm + mp3 → mp4
  const mp4Path = path.join(tmp, `${name}.mp4`);
  if (mp3Path && fs.existsSync(mp3Path) && audioDur > 0) {
    const aacPath = path.join(tmp, `${name}.aac`);
    await runFF(['-i', mp3Path,
      '-af', `afade=t=out:st=${Math.max(0, audioDur - 0.25)}:d=0.25,apad,atrim=duration=${dur}`,
      '-c:a', 'aac', '-b:a', '192k', '-y', aacPath], `${name}:aac`);
    await runFF(['-i', webmPath, '-i', aacPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-t', String(dur), '-y', mp4Path], `${name}:enc`);
  } else {
    await runFF(['-i', webmPath,
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-t', String(dur), '-y', mp4Path], `${name}:enc`);
  }

  try { fs.unlinkSync(webmPath); } catch {}
  return { mp4Path, dur };
}

// ── 메인 ─────────────────────────────────────────────────────────
export async function generate(slugArg) {
  const slug = slugArg
    || process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);
  const resolvedSlug = slug || findLatestPost();
  console.log('📹', resolvedSlug);

  const post = parsePost(resolvedSlug);
  console.log('제목:', post.title);
  console.log('상품:', post.products.map(p => p.name).join(' / '));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp     = path.join(OUT_DIR, `_tmp_${resolvedSlug}`);
  fs.mkdirSync(tmp, { recursive: true });
  const outPath = path.join(OUT_DIR, `${resolvedSlug}.mp4`);

  const { bg, products: P, title } = post;

  // ── TTS 생성 ────────────────────────────────────────────────────
  console.log('\n🔊 Edge Neural TTS 생성 중...');

  // 상품명 압축: 괄호 제거 → 슬래시 첫 번째 → 8글자 단어 단위 제한
  const shortName = n => {
    let s = n.replace(/\s*\([^)]+\)/g, '').split(/\s*[\/,]\s*/)[0].trim();
    const words = s.split(/\s+/);
    let out = '';
    for (const w of words) {
      const next = out ? out + ' ' + w : w;
      if ([...next].length <= 7) out = next; else break;
    }
    return out || words[0].slice(0, 7);
  };
  // 가격 핵심만 (3만~7만 원대 → 3~7만원)
  const shortPrice = p => {
    const m = p.match(/(\d+)\s*만?\s*~\s*(\d+)/);
    if (m) return `${m[1]}~${m[2]}만원`;
    return p.replace(/\s*원대?$/, '').replace(/\s*원$/, '') + '원';
  };

  const narrs = [
    { name: 'hook', text: `지금 TOP3 바로 알려드릴게요!` },
    ...(P[0] ? [{ name: 'p0', text: `1위 ${shortName(P[0].name)}! ${P[0].price ? shortPrice(P[0].price) + ', ' : ''}가성비 최고!` }] : []),
    ...(P[1] ? [{ name: 'p1', text: `2위 ${shortName(P[1].name)}! ${P[1].price ? shortPrice(P[1].price) + ', ' : ''}인기 폭발!` }] : []),
    ...(P[2] ? [{ name: 'p2', text: `3위 ${shortName(P[2].name)}! ${P[2].price ? shortPrice(P[2].price) + ', ' : ''}강력 추천!` }] : []),
    { name: 'cta', text: '설명란 링크로 최저가 바로 확인! 좋아요 구독 부탁드려요!' },
  ];

  const mp3Map = {};
  for (const { name, text } of narrs) {
    const mp3Path = path.join(tmp, `${name}.mp3`);
    console.log(`  ${name}: "${text.slice(0, 45)}..."`);
    const ok = await ttsEdge(text, mp3Path);
    if (ok) mp3Map[name] = mp3Path;
  }

  // ── 배경 이미지 할당 ─────────────────────────────────────────────
  const bgList = [bg.thumb, bg.img01, bg.img02, bg.thumb];
  console.log('\n🎨 배경 이미지:');
  ['thumb','01','02'].forEach(k => console.log(`  ${k}: ${bg[k.replace('01','img01').replace('02','img02').replace('thumb','thumb')] ? '✅' : '⚠️ 단색배경'}`));

  // ── 슬라이드 정의 ────────────────────────────────────────────────
  const slides = [
    { name: 'hook', html: hookHtml(bg.thumb,              title),         mp3Path: mp3Map.hook, minDur: 2.0 },
    ...(P[0] ? [{ name:'p0', html: productHtml(bg.img01,  P[0], 0), mp3Path: mp3Map.p0,   minDur: 2.8 }] : []),
    ...(P[1] ? [{ name:'p1', html: productHtml(bg.img02,  P[1], 1), mp3Path: mp3Map.p1,   minDur: 2.8 }] : []),
    ...(P[2] ? [{ name:'p2', html: productHtml(bg.thumb,  P[2], 2), mp3Path: mp3Map.p2,   minDur: 2.8 }] : []),
    { name: 'cta',  html: ctaHtml(bg.img01),                               mp3Path: mp3Map.cta,  minDur: 2.0 },
  ];

  // ── 녹화 ────────────────────────────────────────────────────────
  console.log('\n🎬 슬라이드 녹화 중 (Playwright + CSS 애니메이션)...');
  const browser = await chromium.launch({ headless: true });
  const mp4s = [];
  let totalDur = 0;
  for (const slide of slides) {
    process.stdout.write(`  ▶ [${slide.name}] `);
    const { mp4Path, dur } = await slideToMp4(browser, slide, tmp);
    mp4s.push(mp4Path);
    totalDur += dur;
    console.log(`${dur.toFixed(1)}s`);
  }
  await browser.close();
  console.log(`\n📊 총 영상 길이: ${totalDur.toFixed(1)}s`);

  // ── concat ───────────────────────────────────────────────────────
  console.log('\n🔗 합치기...');
  const listFile = path.join(tmp, 'list.txt');
  fs.writeFileSync(listFile, mp4s.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));

  const concatTmp = path.join(tmp, 'concat.mp4');
  await runFF(['-f', 'concat', '-safe', '0', '-i', listFile,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-y', concatTmp], 'concat');

  const bgmPath = getBgm();
  if (bgmPath) {
    await runFF(['-i', concatTmp, '-stream_loop', '-1', '-i', bgmPath,
      '-filter_complex', '[1:a]volume=0.12[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]',
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', '-y', outPath], 'bgm');
  } else {
    await runFF(['-i', concatTmp, '-c', 'copy', '-movflags', '+faststart', '-y', outPath], 'faststart');
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

if (process.argv[1].endsWith('yt_make_shorts.mjs')) {
  generate().catch(e => { console.error('❌', e.message); process.exit(1); });
}
