import { execSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// chrome-cookies-secure는 CommonJS라 require로 불러옴
let chromeCookies;
try {
  chromeCookies = require('chrome-cookies-secure');
} catch (e) {
  console.error('❌ chrome-cookies-secure 설치 필요: npm install chrome-cookies-secure');
  process.exit(1);
}

console.log('🔍 Chrome 쿠키에서 labs.google 쿠키 추출 중...');
console.log('⚠️  Chrome이 실행 중이면 잠시 닫아주세요 (쿠키 DB 잠금 방지)\n');

chromeCookies.getCookies('https://labs.google', 'header', (err, cookies) => {
  if (err) {
    console.error('❌ 쿠키 추출 실패:', err.message);
    console.log('\n💡 Chrome을 완전히 닫은 후 다시 시도하거나,');
    console.log('   수동으로 DevTools > Application > Cookies에서 복사해주세요.');
    process.exit(1);
  }

  if (!cookies || cookies.length < 10) {
    console.log('⚠️  labs.google 쿠키가 너무 적어요. Google 계정 쿠키도 추가로 가져올게요...');
  }

  // Google 계정 쿠키도 함께 가져오기
  chromeCookies.getCookies('https://accounts.google.com', 'header', (err2, googleCookies) => {
    const allCookies = [cookies, googleCookies].filter(Boolean).join('; ');

    if (!allCookies || allCookies.length < 20) {
      console.error('❌ 쿠키를 가져오지 못했어요.');
      process.exit(1);
    }

    console.log('✅ 쿠키 추출 성공! 길이:', allCookies.length, '자');

    // .env 파일 업데이트
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');

    if (envContent.includes('GOOGLE_COOKIE=')) {
      envContent = envContent.replace(/GOOGLE_COOKIE=.*/g, `GOOGLE_COOKIE=${allCookies}`);
    } else {
      envContent += `\nGOOGLE_COOKIE=${allCookies}`;
    }

    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env 파일에 GOOGLE_COOKIE 저장 완료');
    console.log('\n다음 단계: node scripts/test_flow_image.mjs 로 테스트하세요');
  });
});
