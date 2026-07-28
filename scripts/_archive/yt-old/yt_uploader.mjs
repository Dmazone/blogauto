/**
 * yt_uploader.mjs — YouTube Shorts 업로드
 *
 * 사용법:
 *   node scripts/yt_uploader.mjs <slug>
 *   node scripts/yt_uploader.mjs trending-picks-20260727
 *
 * 전제: .env에 YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN 설정
 *       data/yt-output/<slug>.mp4 존재
 */

import { google }       from 'googleapis';
import fs               from 'fs';
import path             from 'path';
import { fileURLToPath } from 'url';
import dotenv           from 'dotenv';
import { makeVideo, parsePost } from './yt_video_maker.mjs';

dotenv.config();

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
const OUT_DIR    = path.join(ROOT, 'data', 'yt-output');

const log = (e, m) => console.log(`[yt-upload] ${e}  ${m}`);

function getOAuth2Client() {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    throw new Error('.env에 YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN 필요\n→ node scripts/yt_auth.mjs 실행하여 인증 먼저 완료');
  }
  const oauth2 = new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, 'urn:ietf:wg:oauth:2.0:oob');
  oauth2.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN });
  return oauth2;
}

export async function uploadToYouTube({ videoPath, title, description, tags }) {
  const auth    = getOAuth2Client();
  const youtube = google.youtube({ version: 'v3', auth });

  log('📤', `업로드 시작: ${title}`);
  log('📁', `파일: ${videoPath}`);

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title:       title.length > 100 ? title.slice(0, 97) + '...' : title,
        description: description,
        tags:        tags ?? [],
        categoryId:  '26',  // Howto & Style
      },
      status: { privacyStatus: 'public' },
    },
    media: {
      mimeType: 'video/mp4',
      body:     fs.createReadStream(videoPath),
    },
  });

  const videoId  = res.data.id;
  const videoUrl = `https://www.youtube.com/shorts/${videoId}`;
  log('✅', `업로드 완료: ${videoUrl}`);
  return { videoId, videoUrl };
}

// ── CLI ───────────────────────────────────────────────────────────────────
async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('사용법: node scripts/yt_uploader.mjs <slug>');
    process.exit(1);
  }

  let videoPath = path.join(OUT_DIR, `${slug}.mp4`);
  let meta;

  // 영상 파일이 없으면 먼저 생성
  if (!fs.existsSync(videoPath)) {
    log('🎬', `영상 파일 없음 → yt_video_maker로 생성 중...`);
    meta = await makeVideo(slug);
    videoPath = meta.videoPath;
  } else {
    log('📁', `기존 영상 파일 사용: ${videoPath}`);
    // 메타데이터는 포스팅에서 재구성
    const post = parsePost(slug);
    const descLines = [
      post.description || post.title,
      '',
      '▼ 구매 링크 (쿠팡파트너스)',
      ...post.products.map((p, i) =>
        p.coupangUrl ? `${i + 1}. ${p.name}${p.price ? ' (' + p.price + ')' : ''}\n→ ${p.coupangUrl}` : ''
      ).filter(Boolean),
      '',
      '▼ 더 많은 트렌드 상품 비교',
      `https://dmazone.github.io/blogauto/posts/trending-picks/${slug}/`,
      'https://dmazone.github.io/blogauto/posts/trending-picks/',
      '',
      '※ 이 영상은 쿠팡파트너스 활동의 일환으로 수수료를 제공받을 수 있습니다.',
    ];
    meta = {
      title:       post.title,
      description: descLines.join('\n'),
      tags:        post.hashtags.slice(0, 15),
    };
  }

  const { videoUrl } = await uploadToYouTube({ videoPath, ...meta });
  console.log(`\n🎉 YouTube Shorts 업로드 완료!\n${videoUrl}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('❌', err.message); process.exit(1); });
}
