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
import readline      from 'readline';
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
  console.error(`
❌  .env에 YouTube 크레덴셜이 없습니다.

아래 단계를 먼저 수행해주세요:
  1. https://console.cloud.google.com 접속 → 새 프로젝트 생성
  2. "API 및 서비스" → "라이브러리" → "YouTube Data API v3" 활성화
  3. "사용자 인증 정보" → "OAuth 클라이언트 ID" → 유형: "데스크톱 앱"
  4. 다운로드된 JSON에서 client_id, client_secret 복사
  5. .env에 아래 추가:
       YOUTUBE_CLIENT_ID=xxxx
       YOUTUBE_CLIENT_SECRET=xxxx
  6. 이 스크립트 다시 실행
`);
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

console.log('\n아래 URL을 브라우저에서 열고 Google 계정 (paydma)으로 로그인 후 코드를 복사해주세요:\n');
console.log(authUrl);
console.log('');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('코드를 여기에 붙여넣기: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2.getToken(code.trim());
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error('refresh_token 없음 — 이미 인증된 계정. .env에서 기존 토큰 확인');

    // .env에 YOUTUBE_REFRESH_TOKEN 추가/업데이트
    let envContent = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : '';
    if (envContent.match(/^YOUTUBE_REFRESH_TOKEN=/m)) {
      envContent = envContent.replace(/^YOUTUBE_REFRESH_TOKEN=.*/m, `YOUTUBE_REFRESH_TOKEN=${refreshToken}`);
    } else {
      envContent += `\nYOUTUBE_REFRESH_TOKEN=${refreshToken}\n`;
    }
    fs.writeFileSync(ENV_FILE, envContent, 'utf-8');

    console.log('\n✅  인증 완료! YOUTUBE_REFRESH_TOKEN이 .env에 저장되었습니다.');
    console.log('이제 node scripts/yt_uploader.mjs <slug> 로 업로드하세요.');
  } catch (err) {
    console.error('❌  토큰 교환 실패:', err.message);
    process.exit(1);
  }
});
