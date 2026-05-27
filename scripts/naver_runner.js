/**
 * naver_runner.js — Gemini로 네이버 블로그 포스팅 생성 + 자동 발행
 *
 * 사용법:
 *   node scripts/naver_runner.js
 *   node scripts/naver_runner.js --category 건강정보
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { GeminiSession } from './gemini_browser.js';
import { naverPost } from './naver_post.js';
import { sendTelegram } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// CLI 파라미터 파싱
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};
const CATEGORY = getArg('--category') || '부동산/ 재테크';

// 카테고리별 주제 힌트
const CATEGORY_HINTS = {
  '부동산/ 재테크': '한국 부동산 투자, 재테크, 아파트 시세, 청약, 금리, 주식, 절세',
  '건강정보': '건강 관리, 운동, 식단, 질병 예방, 영양소'
};

async function generateContent(category) {
  const utcNow = new Date().toISOString().substring(0, 16) + ' UTC';
  const hint = CATEGORY_HINTS[category] || category;

  const prompt = `[네이버 블로그: ${category}] 날짜: ${utcNow}

구글 검색으로 지금 이 분야에서 가장 화제인 최신 이슈를 조사하고,
아래 형식으로 네이버 블로그 포스팅을 **한 번에** 완성해줘.

출력 형식 (순서 엄수):
===TOPIC===
{"title":"(28자 이내 SEO 제목)","keyword":"(핵심 키워드)","tags":["태그1","태그2","태그3","태그4","태그5"]}
===BODY===
(마크다운 없이 순수 텍스트 본문, 2000자 이상)
(소제목은 ###소제목### 형식으로 표시)
(소제목 아래 2~4개 단락, 각 단락은 빈줄로 구분)
(소제목 5~6개, 마지막은 요약/정리)
===END===

주제 힌트: ${hint}
금지: 마크다운 기호(##, **, *, -, []), 영어 직역체, 출처없는 수치, 광고성 문구
필수: 자연스러운 한국어, 독자에게 직접 말하는 구어체`;

  console.log('🤖 Gemini에 포스팅 요청 중...');
  const gemini = new GeminiSession();
  await gemini.init();

  try {
    const response = await gemini.send(prompt);
    return response;
  } finally {
    await gemini.close();
  }
}

function parseGeminiResponse(response) {
  const topicMatch = response.match(/===TOPIC===\s*([\s\S]*?)\s*===BODY===/);
  const bodyMatch = response.match(/===BODY===\s*([\s\S]*?)\s*===END===/);

  if (!topicMatch || !bodyMatch) {
    throw new Error('Gemini 응답 파싱 실패 — 형식 불일치');
  }

  const topic = JSON.parse(topicMatch[1].trim());
  const rawBody = bodyMatch[1].trim();

  // 본문을 sections 배열로 변환
  // ###소제목### 패턴으로 분할
  const sections = [];
  const parts = rawBody.split(/###([^#]+)###/);

  // parts[0] = 첫 텍스트 블록 (소제목 전)
  // parts[1] = 첫 소제목, parts[2] = 그 아래 텍스트, ...
  const firstText = parts[0].trim();
  if (firstText) {
    const lines = firstText.split(/\n\n+/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 0) sections.push({ type: 'text', lines });
  }

  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].trim();
    const body = (parts[i + 1] || '').trim();
    if (heading) sections.push({ type: 'heading', text: heading });
    if (body) {
      const lines = body.split(/\n\n+/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length > 0) sections.push({ type: 'text', lines });
    }
  }

  return { title: topic.title, tags: topic.tags || [], sections };
}

async function run() {
  const startTime = Date.now();
  console.log(`\n📝 네이버 블로그 자동화 시작 — ${CATEGORY}`);

  try {
    // 1. Gemini로 콘텐츠 생성
    const geminiResponse = await generateContent(CATEGORY);
    const { title, tags, sections } = parseGeminiResponse(geminiResponse);
    console.log(`\n📌 제목: ${title}`);
    console.log(`🏷️  태그: ${tags.join(', ')}`);
    console.log(`📄 섹션 수: ${sections.length}`);

    // 2. 네이버 블로그 발행
    console.log('\n🚀 네이버 블로그 발행 중...');
    const result = await naverPost({
      title,
      sections,
      category: CATEGORY,
      tags,
      headless: true,
    });

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✅ 발행 완료! (${elapsed}초)`);
    console.log(`🔗 URL: ${result.url}`);

    // 3. 텔레그램 알림
    await sendTelegram(
      `📝 네이버 블로그 발행 완료!\n\n` +
      `제목: ${title}\n` +
      `카테고리: ${CATEGORY}\n` +
      `URL: ${result.url}\n` +
      `소요 시간: ${elapsed}초`
    );
  } catch (err) {
    console.error('\n❌ 오류:', err.message);
    await sendTelegram(`❌ 네이버 블로그 발행 실패\n오류: ${err.message}`);
    process.exit(1);
  }
}

run();
