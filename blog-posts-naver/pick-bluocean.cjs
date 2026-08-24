#!/usr/bin/env node
// 토스쇼핑 인기상품 중 네이버 블루오션 주제를 선정한다.
//
// 1) ../catalog.json의 하루특가·베스트 상품을 리뷰·할인율·순위로 1차 선별
// 2) 네이버 데이터랩 검색 수요 + 블로그 글 수(경쟁도)로 2차 평가
// 3) 상품 인기점수와 네이버 기회점수를 합쳐 bluocean-result.json에 저장
//
// 사용:
//   node pick-bluocean.cjs
//   node pick-bluocean.cjs --candidates 24 --limit 12
//   node pick-bluocean.cjs --include-used

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ROOT = path.join(DIR, '..');
const SHOPICK = process.env.SHOPICK_DIR || '/Users/yunjikang/Desktop/개발/shopick';
const CATALOG_FILE = path.join(ROOT, 'catalog.json');
const USED_FILE = path.join(DIR, 'used-products.json');
const OUTPUT_FILE = path.join(DIR, 'bluocean-result.json');
const naver = require(path.join(SHOPICK, 'naver-trend'));

const argv = process.argv.slice(2);
const flag = name => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const CANDIDATE_LIMIT = Math.max(5, opt('--candidates', 24));
const RESULT_LIMIT = Math.max(1, opt('--limit', 12));
const INCLUDE_USED = flag('--include-used');

naver.loadEnv(SHOPICK);
if (!naver.hasKeys()) {
  console.error(`NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 이 없습니다 (${SHOPICK}/.env)`);
  process.exit(1);
}
if (!fs.existsSync(CATALOG_FILE)) {
  console.error(`catalog.json이 없습니다: ${CATALOG_FILE}`);
  process.exit(1);
}

const readJSON = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
};
const used = new Set(INCLUDE_USED ? [] : readJSON(USED_FILE, []));

// 제품명에서 옵션·수량·광고성 표현을 덜어내 검색어로 쓴다.
// catalog.name은 toss-sync에서 브랜드를 이미 분리한 값이다.
const CORE_TERMS = [
  '노이즈 캔슬링 무선 이어폰', '블루투스 이어폰', '무선 이어폰', '무선청소기', '무선충전기',
  '캡슐세제', '세탁세제', '섬유유연제', '물티슈',
  '베이킹소다', '땅콩버터', '양배추즙', '소갈비살', '구운란', '생수', '중목 양말', '양말',
  '볶음밥', '감자탕', '삼겹살', '닭가슴살', '제습제', '와이퍼', '칫솔살균기', '하수구 트랩',
  '음식물 쓰레기통', '허리보호대', '폼롤러', '콜라겐', '유산균', '핸드워시', '키친타올',
  '캣타워', '모니터받침대', '층간소음매트', '아기 래쉬가드', '기저귀백팩', '크록스',
  '이불압축팩', '수납트롤리', '호텔수건', '슬랙스', '에그쿠커', '접이식카트', '카트',
];
const KEYWORD_ALIASES = [
  [/글레이즈드|도넛/, '미니 도넛'],
  [/미니\s*도너츠|도너츠/, '미니 도넛'],
  [/샴푸앤트리트먼트바|샴푸바/, '샴푸바'],
  [/밀크씨슬/, '밀크씨슬'],
  [/루테인/, '루테인'],
  [/선크림/, '선크림'],
];

function keywordOf(product) {
  const first = String(product.name || product.fullName || '')
    .split(',')[0]
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:ml|l|kg|g|cm|mm|m|w|v|개입|개|팩|봉|병|구|켤레|세트)(?=\s|$)/gi, ' ')
    .replace(/\b(?:1\+1|2\+1|무료배송|단독특가|한정특가|오늘만|파우치형|실내건조형)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const alias = KEYWORD_ALIASES.find(([pattern]) => pattern.test(first));
  if (alias) return alias[1];
  const matched = CORE_TERMS.find(term => first.includes(term));
  if (matched) return matched;
  const tokens = first.split(/\s+/).filter(t => t.length > 1 && !/^[A-Z0-9_-]+$/i.test(t));
  return tokens.slice(-2).join(' ') || first || product.cat;
}

function popularityScore(p) {
  const review = Math.min(Math.log10(1 + (p.reviews || 0)) / 5 * 25, 25);
  const discount = Math.min(Math.max(p.dc || 0, 0) / 100 * 10, 10);
  const rank = p.rank > 0 ? Math.max(0, 10 - (p.rank - 1) / 10) : 0;
  const source = p.source === 'today' ? 3 : p.source === 'best' ? 2 : 0;
  return Math.round((review + discount + rank + source) * 10) / 10;
}

// 원본 카탈로그는 상품명 규칙 분류라 "아토워시 캡슐세제"가 화장미용으로 잡히는 경우가 있다.
// 블로그 게시판에서 명확한 품목만 보수적으로 보정한다.
function blogCategoryOf(product) {
  const kw = product.kw || '';
  if (/도넛/.test(kw)) return '식품';
  if (/세제|섬유유연제|베이킹소다|제습제|와이퍼|옷걸이|핸드워시|키친타올|호텔수건/.test(kw)) return '생활리빙';
  if (/무선 이어폰|무선충전기|칫솔살균기|에그쿠커|모니터받침대/.test(kw)) return '디지털가전';
  return product.cat;
}

// 인기순만 쓰면 생수·식품으로 몰리므로, 카테고리별 라운드로 후보를 뽑는다.
const catalog = readJSON(CATALOG_FILE, []);
const eligible = catalog
  .filter(p => p && !p.soldOut && p.url && p.price >= 1000 && p.reviews >= 300 && p.dc >= 15 && !used.has(p.url))
  .map(p => {
    const item = { ...p, kw: keywordOf(p), popularityScore: popularityScore(p) };
    item.cat = blogCategoryOf(item);
    return item;
  })
  .sort((a, b) => b.popularityScore - a.popularityScore);

const byCat = new Map();
for (const p of eligible) {
  if (!byCat.has(p.cat)) byCat.set(p.cat, []);
  byCat.get(p.cat).push(p);
}
const candidates = [];
const seenKeywords = new Set();
let round = 0;
while (candidates.length < CANDIDATE_LIMIT) {
  let added = false;
  for (const items of byCat.values()) {
    if (items[round] && !seenKeywords.has(items[round].kw)) {
      candidates.push(items[round]);
      seenKeywords.add(items[round].kw);
      added = true;
      if (candidates.length >= CANDIDATE_LIMIT) break;
    }
  }
  if (!added) break;
  round++;
}

if (!candidates.length) {
  console.log('평가할 새 상품이 없어요. used-products.json을 확인해주세요.');
  fs.writeFileSync(OUTPUT_FILE, '[]\n');
  process.exit(0);
}

console.log(`토스상품 ${catalog.length}개 → 조건충족 ${eligible.length}개 → 네이버 평가 ${candidates.length}개`);
console.log(`기준 키워드: "${naver.ANCHOR}" (검색량 100 = 이 키워드와 동급)\n`);

// 동일 키워드(예: 생수)는 한 번만 조회한다.
const keywords = [...new Set(candidates.map(p => p.kw))];
const trends = naver.checkTrends(keywords);
const competitionByKeyword = new Map();
for (const kw of keywords) {
  const contentKeyword = `${kw} 추천`;
  competitionByKeyword.set(kw, naver.checkCompetition(contentKeyword));
}

const rows = candidates.map(p => {
  const trend = trends.get(p.kw) || null;
  const competition = competitionByKeyword.get(p.kw);
  const naverScore = naver.score({ trend, competition });
  const totalScore = Math.round((naverScore + p.popularityScore) * 10) / 10;
  const row = {
    ...p,
    contentKeyword: `${p.kw} 추천`,
    trend,
    competition,
    comp: competition, // 예전 결과 형식 호환
    naverScore,
    totalScore,
    score: totalScore,
    selectedAt: new Date().toISOString(),
  };
  console.log(`조회: ${p.kw}${naver.badges({ trend, competition })} · 상품 ${p.popularityScore}점 → ${totalScore}점`);
  return row;
});

rows.sort((a, b) => b.totalScore - a.totalScore || b.popularityScore - a.popularityScore);
const result = rows.slice(0, RESULT_LIMIT);

console.log('\n=== 토스 인기 × 네이버 블루오션 순위 ===');
result.forEach((r, i) => {
  console.log(`${i + 1}. [${r.cat}] ${r.contentKeyword} [${r.totalScore}점]${naver.badges({ trend: r.trend, competition: r.competition })}`);
  console.log(`   ${r.fullName || r.name} · 리뷰 ${(r.reviews || 0).toLocaleString('ko-KR')} · ${r.dc}% 할인 · ${r.url}`);
});

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2) + '\n');
console.log(`\n저장됨 → ${OUTPUT_FILE}`);
