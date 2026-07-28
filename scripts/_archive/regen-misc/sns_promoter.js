/**
 * sns_promoter.js — 블로그 발행 후 SNS 자동 홍보 모듈
 *
 * 지원 플랫폼:
 *   Instagram  — Meta Graph API (이미지 + 캡션 + 해시태그)
 *   Threads    — Threads API    (텍스트 + 이미지 링크)
 *   Pinterest  — Pinterest API v5 (핀 생성)
 *   TikTok     — 영상 파일 필수 → 미구현 (별도 영상 파이프라인 필요)
 *
 * 필요한 .env 변수:
 *   META_ACCESS_TOKEN   — Meta 장기 액세스 토큰 (Instagram + Threads 공용)
 *   META_IG_USER_ID     — Instagram Business/Creator 계정 User ID
 *   META_THREADS_USER_ID — Threads User ID (없으면 META_IG_USER_ID 사용)
 *   PINTEREST_ACCESS_TOKEN — Pinterest OAuth 액세스 토큰
 *   PINTEREST_BOARD_ID  — 핀을 올릴 보드 ID
 *   BLOG_BASE_URL       — 예: https://dmazone.github.io/blogauto
 */

import axios from 'axios';

const log = (emoji, msg) => console.log(`${emoji}  ${msg}`);

async function withRetry(fn, retries = 3, baseDelay = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable =
        err?.response?.status === 503 ||
        err?.response?.status === 429 ||
        err?.message?.includes('UNAVAILABLE') ||
        err?.message?.includes('high demand');
      if (retryable && attempt < retries) {
        const delay = baseDelay * attempt;
        log('⏳', `API 과부하 → ${delay / 1000}초 후 재시도 (${attempt}/${retries - 1})...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Gemini로 플랫폼별 홍보 문구 생성
// ────────────────────────────────────────────────────────────────────────────
function generateSnsContent(post, blogUrl, insights) {
  const fallback = `${post.title} — 자세한 내용은 블로그에서! ${blogUrl}`;
  return {
    instagram: { caption: `${fallback}\n\n#트렌드줌 #${post.keyword ?? ''} #블로그 #최신이슈\n\n🔗 링크는 프로필에!` },
    threads:   { text: fallback },
    pinterest: { title: post.title, description: `${post.keyword ?? ''} 관련 최신 정보. ${blogUrl}` },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Instagram 포스팅 (Meta Graph API)
// ────────────────────────────────────────────────────────────────────────────
async function postToInstagram(caption, imageUrl) {
  const token  = process.env.META_ACCESS_TOKEN;
  const userId = process.env.META_IG_USER_ID;
  if (!token || !userId) {
    log('⏭️', '  Instagram: META_ACCESS_TOKEN 또는 META_IG_USER_ID 미설정 → 건너뜀');
    return null;
  }

  log('📸', '  Instagram 포스팅 중...');

  // 1단계: 미디어 컨테이너 생성
  const createRes = await axios.post(
    `https://graph.facebook.com/v21.0/${userId}/media`,
    null,
    {
      params: {
        image_url:   imageUrl,
        caption,
        access_token: token,
      },
      timeout: 30000,
    }
  );

  const creationId = createRes.data?.id;
  if (!creationId) throw new Error('Instagram 미디어 컨테이너 ID 없음');

  // 2단계: 발행
  const publishRes = await axios.post(
    `https://graph.facebook.com/v21.0/${userId}/media_publish`,
    null,
    {
      params: {
        creation_id:  creationId,
        access_token: token,
      },
      timeout: 30000,
    }
  );

  const postId = publishRes.data?.id;
  log('✅', `  Instagram 발행 완료 (post_id: ${postId})`);
  return postId;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Threads 포스팅 (Threads API via Meta Graph)
// ────────────────────────────────────────────────────────────────────────────
async function postToThreads(text, imageUrl) {
  const token  = process.env.META_ACCESS_TOKEN;
  const userId = process.env.META_THREADS_USER_ID ?? process.env.META_IG_USER_ID;
  if (!token || !userId) {
    log('⏭️', '  Threads: META_ACCESS_TOKEN 또는 User ID 미설정 → 건너뜀');
    return null;
  }

  log('🧵', '  Threads 포스팅 중...');

  // 1단계: Threads 미디어 객체 생성
  const params = {
    media_type:   imageUrl ? 'IMAGE' : 'TEXT',
    text,
    access_token: token,
  };
  if (imageUrl) params.image_url = imageUrl;

  const createRes = await axios.post(
    `https://graph.threads.net/v1.0/${userId}/threads`,
    null,
    { params, timeout: 30000 }
  );

  const creationId = createRes.data?.id;
  if (!creationId) throw new Error('Threads 미디어 컨테이너 ID 없음');

  // 잠깐 대기 (Meta 권장)
  await new Promise((r) => setTimeout(r, 3000));

  // 2단계: 발행
  const publishRes = await axios.post(
    `https://graph.threads.net/v1.0/${userId}/threads_publish`,
    null,
    {
      params: { creation_id: creationId, access_token: token },
      timeout: 30000,
    }
  );

  const postId = publishRes.data?.id;
  log('✅', `  Threads 발행 완료 (post_id: ${postId})`);
  return postId;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Pinterest 핀 생성 (Pinterest API v5)
// ────────────────────────────────────────────────────────────────────────────
async function postToPinterest(title, description, imageUrl, blogUrl) {
  const token   = process.env.PINTEREST_ACCESS_TOKEN;
  const boardId = process.env.PINTEREST_BOARD_ID;
  if (!token || !boardId) {
    log('⏭️', '  Pinterest: 토큰 또는 보드 ID 미설정 → 건너뜀');
    return null;
  }

  log('📌', '  Pinterest 핀 생성 중...');

  const res = await axios.post(
    'https://api.pinterest.com/v5/pins',
    {
      board_id: boardId,
      title:    title.slice(0, 100),
      description: description.slice(0, 500),
      link:     blogUrl,
      media_source: {
        source_type: 'image_url',
        url:         imageUrl,
      },
    },
    {
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const pinId = res.data?.id;
  log('✅', `  Pinterest 핀 생성 완료 (pin_id: ${pinId})`);
  return pinId;
}

// ────────────────────────────────────────────────────────────────────────────
// 메인 오케스트레이터 — agent_core.js에서 호출
// ────────────────────────────────────────────────────────────────────────────
export async function promoteAll({ post, outline, validated, imageUrl, deployWaitSec = 90 }) {
  const blogBaseUrl = (process.env.BLOG_BASE_URL ?? '').replace(/\/$/, '');
  if (!blogBaseUrl) {
    log('⚠️', 'BLOG_BASE_URL 미설정 → SNS 홍보 건너뜀');
    return;
  }

  const blogUrl   = `${blogBaseUrl}/posts/${post.track}/${post.slug}/`;
  const publicImg = `${blogBaseUrl}/images/${post.slug}-01.webp`;

  // GitHub Pages 배포 완료 대기
  log('⏳', `[SNS] GitHub Pages 배포 대기 중 (${deployWaitSec}초)...`);
  await new Promise((r) => setTimeout(r, deployWaitSec * 1000));

  log('📣', '[SNS] 홍보 시작...');

  // 플랫폼별 문구 생성
  const insights = validated?.validated_insights ?? [];
  const content  = await generateSnsContent(post, blogUrl, insights);

  const results = { instagram: null, threads: null, pinterest: null };

  // Instagram
  try {
    results.instagram = await withRetry(() =>
      postToInstagram(content.instagram?.caption ?? '', imageUrl ?? publicImg)
    );
  } catch (err) {
    log('❌', `  Instagram 실패: ${err.message}`);
  }

  // Threads
  try {
    results.threads = await withRetry(() =>
      postToThreads(content.threads?.text ?? '', imageUrl ?? publicImg)
    );
  } catch (err) {
    log('❌', `  Threads 실패: ${err.message}`);
  }

  // Pinterest
  try {
    results.pinterest = await withRetry(() =>
      postToPinterest(
        content.pinterest?.title ?? post.title,
        content.pinterest?.description ?? '',
        imageUrl ?? publicImg,
        blogUrl
      )
    );
  } catch (err) {
    log('❌', `  Pinterest 실패: ${err.message}`);
  }

  // 결과 요약
  const successCount = Object.values(results).filter(Boolean).length;
  log('📊', `[SNS] 홍보 완료 — ${successCount}/3 플랫폼 성공`);
  if (results.instagram) log('✅', `  Instagram: https://www.instagram.com/`);
  if (results.threads)   log('✅', `  Threads:   https://www.threads.net/`);
  if (results.pinterest) log('✅', `  Pinterest: https://www.pinterest.com/`);

  return results;
}
