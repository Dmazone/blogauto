/**
 * sections.js — 블로그 10개 섹션 정의
 * 각 섹션은 daily_runner.js가 하루 1개 글을 자동 발행하는 단위
 */

export const SECTIONS = [
  // ── 그룹 1 (홀수 날 발행) ────────────────────────────────────────────────
  {
    id: 'latest-tech',
    group: 1,
    name: '최신기술동향',
    dir: 'latest-tech',
    menuUrl: '/posts/latest-tech/',
    searchContext: '2026년 AI, 반도체, 클라우드, 오픈소스, 빅테크, 스타트업 최신 기술 동향',
    toneHint: '기술 분석·비교·미래 전망, 전문가 인사이트와 독자 생활 영향 연결',
    imageStyle: 'futuristic tech concept illustration, circuit board, glowing neon blue lines, clean white background, flat design',
  },
  {
    id: 'economy',
    group: 1,
    name: '경제',
    dir: 'economy',
    menuUrl: '/posts/economy/',
    searchContext: '2026년 한국·세계 경제, 금리, 환율, 주식시장, 가상자산, 무역, 인플레이션',
    toneHint: '경제 분석, 독자 생활에 미치는 영향, 시장 맥락·배경까지 깊이 있게 해석',
    imageStyle: 'economy and finance concept, stock market graph, minimalist flat design, clean white background, professional illustration',
  },
  {
    id: 'society',
    group: 1,
    name: '사회',
    dir: 'society',
    menuUrl: '/posts/society/',
    searchContext: '2026년 한국 사회 이슈, 인구구조 변화, 복지, 교육, 노동, 젠더, 세대갈등',
    toneHint: '균형 있는 시각, 다양한 입장 소개, 독자 삶과 직결되는 분석',
    imageStyle: 'society and community concept, diverse people, soft pastel colors, flat illustration, clean white background',
  },
  {
    id: 'humanities',
    group: 1,
    name: '인문',
    dir: 'humanities',
    menuUrl: '/posts/humanities/',
    searchContext: '철학, 역사, 심리학, 인문학 베스트셀러, 고전 재해석, 인문학 트렌드 2026',
    toneHint: '깊이 있는 통찰, 일상과 연결되는 인문학, 독자 사고를 자극하는 새로운 관점',
    imageStyle: 'humanities and philosophy concept, open book, ancient and modern fusion, warm tones, flat minimalist illustration',
  },
  {
    id: 'entertainment',
    group: 1,
    name: '연예이슈',
    dir: 'entertainment',
    menuUrl: '/posts/entertainment/',
    searchContext: '2026년 한국 연예계, K-POP, 드라마, 영화, 웹툰, 유튜버, SNS 트렌드',
    toneHint: '재미있고 가벼운 톤, 팩트 중심, 팬 관점과 일반 독자 관점 균형, 맥락 해석 포함',
    imageStyle: 'entertainment and pop culture concept, colorful stage lights, K-pop idol silhouette, vibrant flat illustration',
  },
  // ── 그룹 2 (짝수 날 발행) ────────────────────────────────────────────────
  {
    id: 'health',
    group: 2,
    name: '건강',
    dir: 'health',
    menuUrl: '/posts/health/',
    searchContext: '운동 방법, 식단 관리, 질병 예방, 건강 트렌드 2026, 의학 최신 정보',
    toneHint: '신뢰성 있는 정보, 실천 가능한 팁, 과학적 근거 기반, 일상 적용 방법까지',
    imageStyle: 'health and wellness concept, human body, clean medical illustration, green and white palette, flat design',
    subtopics: ['운동', '식단', '질병'],
  },
  {
    id: 'it-devices',
    group: 2,
    name: 'IT기기',
    dir: 'it-devices',
    menuUrl: '/posts/it-devices/',
    searchContext: '2026년 최신 스마트폰, 노트북, 태블릿, AI 기기, 웨어러블, 가성비 리뷰',
    toneHint: '스펙 비교 분석, 실사용자 관점 리뷰, 장단점 솔직하게, 구매 결정에 실질 도움',
    imageStyle: 'modern tech gadgets, smartphone and laptop mockup, sleek product design, minimalist white background, flat illustration',
  },
  {
    id: 'kr-realestate',
    group: 2,
    name: '한국부동산',
    dir: 'kr-realestate',
    menuUrl: '/posts/kr-realestate/',
    searchContext: '2026년 한국 부동산 시장, 아파트 가격, 전세, 월세, 청약, 재개발, 정부 정책',
    toneHint: '실수요자 관점, 투자 관련 언급 시 중립적 표현, 시장 흐름과 독자 선택지까지',
    imageStyle: 'Korean apartment building, real estate concept, city skyline, clean flat illustration, blue and white palette',
  },
  {
    id: 'world-travel',
    group: 2,
    name: '세계여행지',
    dir: 'world-travel',
    menuUrl: '/posts/world-travel/',
    searchContext: '2026년 한국인 인기 해외 여행지, 항공편, 비자, 환율, 현지 물가, 여행 팁',
    toneHint: '설레는 여행 감성 + 실용적 정보, 직접 가본 듯한 생생한 묘사, 경비·일정 팁 구체적으로',
    imageStyle: 'world travel destination, scenic landscape, passport and map, vibrant colors, flat travel illustration',
  },
  {
    id: 'sports',
    group: 2,
    name: '스포츠',
    dir: 'sports',
    menuUrl: '/posts/sports/',
    searchContext: '2026년 한국 스포츠 이슈, 축구(K리그, 해외리그), 야구(KBO), 올림픽, 국제대회',
    toneHint: '팬 관점의 흥미로운 분석, 경기 결과보다 맥락·의미·배경 해석 중심',
    imageStyle: 'sports concept, athlete in action, dynamic movement, bold colors, flat sports illustration',
  },
];

/** 섹션 ID로 섹션 찾기 */
export function getSectionById(id) {
  return SECTIONS.find((s) => s.id === id) ?? null;
}

/** 건강 섹션 서브토픽 롤링 (날짜 기반 순환) */
export function getHealthSubtopic() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const subtopics = ['운동', '식단', '질병'];
  return subtopics[dayOfYear % 3];
}
