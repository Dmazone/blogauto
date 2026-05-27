/**
 * threads_engagement.js
 * Threads 스하리1000명프로젝트 자동 참여 스크립트
 *
 * 사용법:
 *   Claude Code가 claude-in-chrome MCP로 실행 (Playwright 불필요)
 *   아래 함수들을 javascript_tool로 주입하여 사용
 *
 * 실행 순서:
 *   1. #스하리1000명프로젝트 피드 탐색
 *   2. 게시물마다 스하리(좋아요) + 스팔(팔로우)
 *   3. 목표: 하루 100건 스하리 + 50건 스팔
 */

// ─── 주입용 JS (claude-in-chrome javascript_tool에 복사해서 사용) ─────────

const ENGAGEMENT_JS = {

  /** 초기화: 세션 카운터 리셋 */
  init: `
    window._threads_liked = window._threads_liked || 0;
    window._threads_followed = window._threads_followed || 0;
    window._threads_seen = window._threads_seen || new Set();
    'init ok';
  `,

  /** 현재 화면의 좋아요 버튼 전체 클릭 (아직 안 누른 것만) */
  likeAll: `
    (async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const svgs = [...document.querySelectorAll('svg[aria-label="좋아요"]')];
      let count = 0;
      for (const svg of svgs) {
        const btn = svg.closest('button');
        if (!btn) continue;
        // 이미 좋아요 된 것 = fill 빨간색
        const filled = svg.querySelector('path[fill="rgb(255, 48, 64)"]');
        if (filled) continue;
        const key = btn.closest('article')?.dataset?.id || btn.offsetTop;
        if (window._threads_seen.has(key)) continue;
        window._threads_seen.add(key);
        btn.click();
        window._threads_liked++;
        count++;
        await sleep(900 + Math.random() * 600);
      }
      return count + '개 스하리 완료 / 누적: ' + window._threads_liked;
    })()
  `,

  /** 현재 화면의 팔로우 버튼 클릭 (이미 팔로잉 아닌 것만) */
  followAll: `
    (async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const btns = [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === '팔로우');
      let count = 0;
      for (const btn of btns) {
        btn.click();
        window._threads_followed++;
        count++;
        await sleep(1200 + Math.random() * 800);
      }
      return count + '개 스팔 완료 / 누적: ' + window._threads_followed;
    })()
  `,

  /** 스크롤 다운 (피드 추가 로드) */
  scroll: `
    window.scrollBy(0, window.innerHeight * 0.8);
    window.scrollY + ' / ' + document.body.scrollHeight;
  `,

  /** 현재 상태 확인 */
  status: `
    '스하리: ' + (window._threads_liked||0) + '건 / 스팔: ' + (window._threads_followed||0) + '건'
  `,
};

// ─── 포스팅 템플릿 ───────────────────────────────────────────────────────────

const POST_TEMPLATES = {
  /** 스하리1000명프로젝트 참여 선언 게시물 */
  intro: `안녕 스치니들 👋
나 IT기기, 건강, 부동산, 여행, 스포츠 정보 매일 올리는 블로그 운영 중이야.
유용한 정보 같이 나누고 싶어서 스레드 시작했어!

관심사 비슷한 스친이들 같이 성장하자 🔥
스 = 반 = 또
뒷삭 없음, 댓글 달면 바로 달려갈게 💨

#스하리1000명프로젝트 #스팔맞팔`,

  /** 정보 + 스하리 조합 게시물 */
  infoHook: (topic, tip) => `${topic} 아는 스친이 있어? 👀

${tip}

관련 정보 매일 올리고 있어, 같이 성장하자!
스 = 반 = 또 🔥 뒷삭 없어

#스하리1000명프로젝트 #스팔맞팔`,
};

// ─── 검색 URL ────────────────────────────────────────────────────────────────

const SEARCH_URLS = {
  main: 'https://www.threads.com/search?q=%EC%8A%A4%ED%95%98%EB%A6%AC1000%EB%AA%85%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8&serp_type=default',
  spalmalppal: 'https://www.threads.com/search?q=%EC%8A%A4%ED%8C%94%EB%A7%9E%ED%8C%94&serp_type=default',
  recent: 'https://www.threads.com/search?q=%EC%8A%A4%ED%95%98%EB%A6%AC1000%EB%AA%85%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8&serp_type=default&selected_filter=recent',
};

// ─── 일일 목표 ───────────────────────────────────────────────────────────────
const DAILY_GOAL = {
  likes: 100,     // 스하리 목표
  follows: 50,    // 스팔 목표
  posts: 1,       // 내 게시물 목표
};

module.exports = { ENGAGEMENT_JS, POST_TEMPLATES, SEARCH_URLS, DAILY_GOAL };
