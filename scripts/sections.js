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
    searchContext: '2026년 AI 모델 출시·업데이트, 반도체 HBM·양산, 빅테크 인수합병, 국내 스타트업 투자, 클라우드 요금·성능 비교, 오픈소스 LLM 신규 릴리스',
    toneHint: '기술 분석·비교·미래 전망, 전문가 인사이트와 독자 생활 영향 연결. 모델명·기업명·날짜 등 구체적 수치 필수.',
    imageStyle: 'futuristic tech atmosphere, dark environment with vivid accent glow, cinematic photorealistic editorial, highly detailed sharp focus',
  },
  {
    id: 'economy',
    group: 1,
    name: '경제',
    dir: 'economy',
    menuUrl: '/posts/economy/',
    searchContext: '2026년 한국 금리 인하 시기, 코스피·코스닥 특정 종목 급등락, 환율 달러 원 흐름, 비트코인 이더리움 가격 전망, 무역 수출입 주요 품목, 인플레이션 생활물가',
    toneHint: '경제 분석, 독자 생활에 미치는 영향, 시장 맥락·배경까지 깊이 있게 해석. 종목명·수치·날짜 기반 롱테일 키워드 중심.',
    imageStyle: 'financial business atmosphere, bold blue and gold color tones, dramatic professional lighting, cinematic depth, highly detailed photorealistic',
  },
  {
    id: 'society',
    group: 1,
    name: '사회',
    dir: 'society',
    menuUrl: '/posts/society/',
    searchContext: '2026년 한국 사회 이슈, 수도권 쓰레기·환경 정책, 저출생 대책 효과, 청년 주거·고용, 교육 입시 변화, 의대 증원 후폭풍, 젠더·세대갈등 구체적 사례',
    toneHint: '직설적이고 강한 의견 톤. 독자가 "맞아, 바로 이거야"라고 공감할 만한 시각. 균형은 지키되 모호하지 않게.',
    viralTone: '직설적 톤 허용 — "이게 말이 되냐", "솔직히 말하면", "당신이 모르는 진실" 등 강한 표현으로 독자 몰입 유도. 단, 팩트 없는 주장은 금지.',
    imageStyle: 'contemporary Korean urban atmosphere, warm natural editorial lighting, documentary photography style, highly detailed, cinematic',
  },
  {
    id: 'humanities',
    group: 1,
    name: '인문',
    dir: 'humanities',
    menuUrl: '/posts/humanities/',
    searchContext: '철학 책 추천 2026, 심리학 행동경제학 실생활 적용, 역사 속 현재 사건과 유사점, 인문학 베스트셀러 핵심 요약, 고전 명언 현대 해석',
    toneHint: '깊이 있는 통찰, 일상과 연결되는 인문학, 독자 사고를 자극하는 새로운 관점. 책 제목·저자명·사례 구체적으로.',
    imageStyle: 'warm intellectual atmosphere, rich amber and golden color tones, soft cinematic depth of field, editorial quality, highly detailed photorealistic',
  },
  {
    id: 'entertainment',
    group: 1,
    name: '연예이슈',
    dir: 'entertainment',
    menuUrl: '/posts/entertainment/',
    searchContext: '2026년 한국 연예인 결혼·이혼·열애 확인, 드라마 시청률 순위, K-POP 아이돌 컴백 일정, 유튜버 논란·구독자, 영화 박스오피스 1위, SNS 팔로워 화제',
    toneHint: '가볍고 재미있되 팩트 중심. 반말 허용("이게 진짜야?", "말 다했지", "솔직히"). 팬심·일반 독자 모두 클릭할 제목.',
    viralTone: '반말체 허용 — "이거 진짜야?", "말 다 했지", "솔직히 말해줄게", "이게 말이 됨?" 등 SNS 바이럴에 어울리는 구어체. 단 사실 왜곡·명예훼손 금지. 제목은 반말 사용 가능.',
    imageStyle: 'Korean entertainment energy atmosphere, vibrant saturated color palette, dynamic bold lighting, cinematic editorial quality, highly detailed photorealistic',
  },
  // ── 그룹 2 (짝수 날 발행) ────────────────────────────────────────────────
  {
    id: 'health',
    group: 2,
    name: '건강',
    dir: 'health',
    menuUrl: '/posts/health/',
    searchContext: '2026년 특정 운동법 효과 논란, 다이어트 식품 성분 분석, 당뇨·고혈압·암 예방 식단, 건강검진 항목 해석, 영양제 조합 부작용, 의학 저널 최신 연구',
    toneHint: '신뢰성 있는 정보, 실천 가능한 팁, 과학적 근거 기반. 연구명·수치·권장량 구체적으로.',
    imageStyle: 'health wellness atmosphere, clean bright composition, fresh green and white color tones, warm natural lighting, photorealistic professional quality, highly detailed',
    subtopics: ['운동', '식단', '질병'],
  },
  {
    id: 'it-devices',
    group: 2,
    name: 'IT기기',
    dir: 'it-devices',
    menuUrl: '/posts/it-devices/',
    searchContext: '2026년 스마트폰 특정 모델 출시일·가격·스펙 비교, 노트북 배터리·발열 실사용 후기, AI 기능 탑재 웨어러블 실제 사용기, 가성비 태블릿 추천, 이어폰·스피커 음질 비교',
    toneHint: '스펙 비교 분석, 실사용자 관점 리뷰, 장단점 솔직하게, 구매 결정에 실질 도움. 모델명·가격·수치 필수.',
    imageStyle: 'consumer electronics product photography atmosphere, dark sleek surface, precision studio lighting, sharp commercial quality, highly detailed cinematic',
  },
  {
    id: 'kr-realestate',
    group: 2,
    name: '한국부동산',
    dir: 'kr-realestate',
    menuUrl: '/posts/kr-realestate/',
    searchContext: '2026년 서울 특정 구·동 아파트 가격 변화, 전세 사기 피해 예방, 청약 당첨 전략, 재개발·재건축 진행 현황, 금리 인하 후 부동산 전망, 1인 가구 소형 주택 수요',
    toneHint: '실수요자·무주택자 관점 중심, 투자 언급 시 중립, 구체적 지역·단지명·가격 포함.',
    imageStyle: 'Korean urban architecture atmosphere, city skyline perspective, cool blue and warm orange color tones, architectural photography style, highly detailed photorealistic',
  },
  {
    id: 'world-travel',
    group: 2,
    name: '세계여행지',
    dir: 'world-travel',
    menuUrl: '/posts/world-travel/',
    searchContext: '2026년 한국인 급부상 여행지, 항공권 최저가 시기, 특정 국가 비자 발급 방법, 여행 경비 현실적 예산, 물가 비싼 도시 vs 가성비 도시, 현지인 맛집·숙소 팁',
    toneHint: '설레는 여행 감성 + 실용적 정보, 직접 가본 듯한 생생한 묘사, 경비·일정 팁 구체적으로. 도시명·가격·교통 정보 필수.',
    imageStyle: 'travel destination atmosphere, vivid natural colors with warm golden hour tones, cinematic wide angle, travel editorial photography, highly detailed photorealistic',
  },
  {
    id: 'sports',
    group: 2,
    name: '스포츠',
    dir: 'sports',
    menuUrl: '/posts/sports/',
    searchContext: '2026년 특정 경기 결과 분석, 선수 이적·부상·복귀 소식, 월드컵·올림픽 특정 경기 전망, K리그·KBO 순위 변동, 해외리그 한국 선수 활약, 스포츠 판정 논란',
    toneHint: '팬 관점의 흥미로운 분석, 경기 결과보다 맥락·의미·배경 해석 중심. 선수명·팀명·날짜 구체적으로.',
    imageStyle: 'sports action atmosphere, dramatic stadium lighting, bold dynamic energy colors, cinematic sports photography, highly detailed photorealistic',
  },
  // ── 글로벌 섹션 ───────────────────────────────────────────────────────────
  {
    id: 'japan-trends',
    group: 1,
    language: 'ja',
    name: '日本トレンド',
    dir: 'japan-trends',
    menuUrl: '/posts/japan-trends/',
    searchContext: '日本の最新トレンド、文化、エンタメ、食、観光、テクノロジー、日韓関係。韓国とのつながりを意識しながら日本発のホットな話題を紹介。',
    toneHint: '日本の読者目線で読みやすく、韓国との文化的つながりも自然に織り交ぜる。信頼性の高い情報、具体的な事例を中心に',
    imageStyle: 'Japanese aesthetic atmosphere, minimalist composition with soft pastel and vibrant accent colors, cinematic photography style, highly detailed photorealistic',
  },
  {
    id: 'us-trends',
    group: 2,
    language: 'en',
    name: 'Global Trends',
    dir: 'us-trends',
    menuUrl: '/posts/us-trends/',
    searchContext: 'Global trends in tech, entertainment, lifestyle, economy, and culture from the US and Western world. Korean connection and K-culture global impact included.',
    toneHint: 'Engaging English writing for global readers. Authoritative yet accessible tone. Include Korean angle and perspective where naturally relevant.',
    imageStyle: 'global contemporary lifestyle atmosphere, bold vivid editorial colors, modern setting with cinematic wide angle composition, highly detailed photorealistic',
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
