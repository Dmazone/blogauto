/**
 * yt_auth.mjs — YouTube OAuth2 일회성 인증 (최초 1회만 실행)
 *
 * 사용법:
 *   1. Google Cloud Console → 프로젝트 생성 → YouTube Data API v3 활성화
 *   2. 사용자 인증 정보 → OAuth 클라이언트 ID → 데스크톱 앱 유형으로 생성
 *   3. client_id, client_secret을 .env에 저장
 *   4. node scripts/yt_auth.mjs 실행 → URL 방문 → 코드 붙여넣기
 *   5. YOUTUBE_REFRESH_TOKEN이 .env에 자동 추가됨
 */

import { google }   from 'googleapis';
import http          from 'http';
import fs            from 'fs';
import path          from 'path';
import { fileURLToPath } from 'url';
import dotenv        from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE  = path.join(__dirname, '..', '.env');

const CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌  .env에 YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET 없음');
  process.exit(1);
}

const PORT     = 8080;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });

console.log('\n🔗 아래 URL을 브라우저에서 여세요 (paydma 계정으로 로그인):\n');
console.log(authUrl);
console.log('\n✋ 브라우저에서 허용 클릭 후 자동으로 토큰을 받습니다...\n');

// 로컬 서버로 인증 코드 자동 수신
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth2callback') {
    res.end('Not found'); return;
  }
  const code = url.searchParams.get('code');
  const err  = url.searchParams.get('error');
  if (err) {
    res.end(`<h1>인증 실패: ${err}</h1>`);
    server.close();
    process.exit(1);
  }
  try {
    const { tokens } = await oauth2.getToken(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      res.end('<h1>refresh_token 없음. prompt=consent로 재시도 필요</h1>');
      server.close(); return;
    }
    let envContent = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : '';
    if (envContent.match(/^YOUTUBE_REFRESH_TOKEN=/m)) {
      envContent = envContent.replace(/^YOUTUBE_REFRESH_TOKEN=.*/m, `YOUTUBE_REFRESH_TOKEN=${refreshToken}`);
    } else {
      envContent += `\nYOUTUBE_REFRESH_TOKEN=${refreshToken}\n`;
    }
    fs.writeFileSync(ENV_FILE, envContent, 'utf-8');
    console.log('\n✅  YOUTUBE_REFRESH_TOKEN .env 저장 완료!');
    console.log('이제 node scripts/yt_uploader.mjs <slug> 로 업로드하세요.');
    res.end('<h1>✅ 인증 완료! 이 창을 닫으세요.</h1>');
    server.close();
    process.exit(0);
  } catch (e) {
    res.end(`<h1>토큰 교환 실패: ${e.message}</h1>`);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`로컬 서버 대기 중: http://localhost:${PORT}`);
});
