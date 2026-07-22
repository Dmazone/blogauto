/**
 * tistory_auth.mjs — 티스토리 OAuth 액세스 토큰 발급 헬퍼
 *
 * 사전 준비:
 *   1. https://www.tistory.com/guide/api/manage/register 에서 앱 등록
 *   2. .env에 TISTORY_CLIENT_ID, TISTORY_CLIENT_SECRET, TISTORY_REDIRECT_URI 입력
 *   3. node scripts/tistory_auth.mjs → 인증 URL 출력 → 브라우저에서 접속
 *   4. 리다이렉트된 URL의 code= 값 복사 후 아래 입력
 *   5. 출력된 TISTORY_ACCESS_TOKEN을 .env에 저장
 *
 * 환경변수:
 *   TISTORY_CLIENT_ID      앱 ID
 *   TISTORY_CLIENT_SECRET  앱 시크릿
 *   TISTORY_REDIRECT_URI   콜백 URI (예: https://dmazone.github.io/blogauto/)
 */

import https from 'https';
import readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const CLIENT_ID     = process.env.TISTORY_CLIENT_ID;
const CLIENT_SECRET = process.env.TISTORY_CLIENT_SECRET;
const REDIRECT_URI  = process.env.TISTORY_REDIRECT_URI ?? 'https://dmazone.github.io/blogauto/';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ .env에 TISTORY_CLIENT_ID와 TISTORY_CLIENT_SECRET을 먼저 입력하세요.');
  console.error('   → https://www.tistory.com/guide/api/manage/register 에서 앱 등록');
  process.exit(1);
}

const authUrl = `https://www.tistory.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`;

console.log('\n📋 아래 URL을 브라우저에서 열어 티스토리 로그인 + 허용:\n');
console.log(authUrl);
console.log('\n리다이렉트된 URL에서 ?code=XXXXXX 부분의 코드를 복사하세요.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('code 값 입력: ', async (code) => {
  rl.close();
  code = code.trim();
  if (!code) { console.error('code가 없습니다.'); process.exit(1); }

  const tokenUrl = `https://www.tistory.com/oauth/access_token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}&grant_type=authorization_code`;

  https.get(tokenUrl, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      const match = data.match(/access_token=([^&]+)/);
      if (match) {
        console.log('\n✅ 발급 완료! 아래 값을 .env에 추가하세요:\n');
        console.log(`TISTORY_ACCESS_TOKEN=${match[1]}`);
        console.log(`TISTORY_BLOG=YOUR_BLOG_NAME  # (예: myblog → myblog.tistory.com)\n`);
      } else {
        console.error('❌ 토큰 발급 실패:', data);
      }
    });
  }).on('error', err => console.error('❌', err.message));
});
