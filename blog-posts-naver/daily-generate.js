#!/usr/bin/env node
// 매일 5개 자동생성 — catalog.json 에서 새 상품 5개를 골라 네이버 블로그 글(.txt) 생성
//  · shopick/.env 의 ANTHROPIC_API_KEY 사용 (Claude API 로 본문 작성)
//  · 대표 이미지 다운로드, schedule.json 에 오늘자로 5개 배치, preview.html 재생성
// 사용:  node daily-generate.js [개수=5]
// 크론:  README 참고 (매일 아침 자동 실행)

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = __dirname;
const LP = path.join(DIR, '..');                       // lowest-pick
const IMGDIR = path.join(LP, 'blog-posts', 'images');
const SHOPICK = '/Users/yunjikang/Desktop/개발/shopick';
const STATE = path.join(DIR, 'used-products.json');
const BLUE_RESULT = path.join(DIR, 'bluocean-result.json');
const N = parseInt(process.argv[2] || '5', 10);
const BLOG_ID = 'pppnut';
fs.mkdirSync(IMGDIR, { recursive: true });

// .env
const env = {};
try {
  for (const l of fs.readFileSync(path.join(SHOPICK, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
  }
} catch (e) {}
const API_KEY = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const MODEL = env.SHOPICK_MODEL || 'claude-sonnet-5';
if (!API_KEY) { console.error('❌ ANTHROPIC_API_KEY 없음 (shopick/.env)'); process.exit(1); }
const log = m => console.log(`[자동생성] ${m}`);

// ── 상품 선별 (토스 인기 × 네이버 블루오션 + 중복 제외) ──
const catalog = JSON.parse(fs.readFileSync(path.join(LP, 'catalog.json'), 'utf8'));
const used = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : [];
const usedSet = new Set(used);
let ranked = [];
try {
  log('토스 인기상품의 네이버 블루오션 점수 계산 중...');
  execFileSync('node', [path.join(DIR, 'pick-bluocean.cjs'), '--candidates', String(Math.max(20, N * 4)), '--limit', String(Math.max(12, N * 3))], {
    stdio: 'inherit',
    env: { ...process.env, SHOPICK_DIR: SHOPICK },
  });
  ranked = JSON.parse(fs.readFileSync(BLUE_RESULT, 'utf8'));
} catch (e) {
  log(`⚠️ 네이버 블루오션 평가 실패 → 토스 인기순으로 계속 (${(e.message || '').split('\n')[0]})`);
}
const fallback = catalog
  .filter(p => !p.soldOut && p.url && p.reviews >= 3000 && p.dc >= 25 && p.price >= 1000)
  .sort((a, b) => b.reviews - a.reviews);
const pool = (ranked.length ? ranked : fallback).filter(p => !usedSet.has(p.url));
const byCat = {};
for (const p of pool) (byCat[p.cat] ||= []).push(p);
const picks = [];
let round = 0;
while (picks.length < N && round < 40) {
  for (const c of Object.keys(byCat)) { if (byCat[c][round]) { picks.push(byCat[c][round]); if (picks.length >= N) break; } }
  round++;
}
if (!picks.length) { log('더 뽑을 새 상품이 없어요 (used-products.json 비우면 리셋)'); process.exit(0); }

// ── 관련글 (RSS) ──
let related = [];
try {
  const xml = execFileSync('curl', ['-fsSL', '--max-time', '15', '-A', 'Mozilla/5.0', `https://rss.blog.naver.com/${BLOG_ID}.xml`], { encoding: 'utf8' });
  related = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/g)]
    .map(m => ({ t: m[1].trim(), l: m[2].trim() }));
} catch (e) {}
const relBlock = related.length
  ? '\n\n▼같이 보면 좋은 글▼\n\n' + related.slice(0, 3).map(r => `${r.t}\n(링크: ${r.l})`).join('\n\n')
  : '';

// ── NN 번호 이어가기 ──
const existing = fs.readdirSync(DIR).filter(f => /^\d\d-.*\.txt$/.test(f)).map(f => +f.slice(0, 2));
let nn = (existing.length ? Math.max(...existing) : 0);

// 요일별 각도 로테이션 (톤은 쇼픽 그대로, 각도만 바뀜)
const ANGLES = [
  { key: '가볍게 발견담형', lead: '그냥 구경하다가 가격 보고 멈칫한 제품' },      // 0 일
  { key: '생활 고민 해결형', lead: '요즘 이거 때문에 은근 스트레스였는데' },        // 1 월
  { key: '가격 발견형', lead: '가격 보다가 이건 좀 괜찮다 싶어서 저장해둔 제품' },  // 2 화
  { key: '비교 체크형', lead: '비슷한 제품 많아서 볼 때 이 부분부터 봐야 함' },     // 3 수
  { key: '리뷰 분석형', lead: '리뷰 많은 제품은 좋은데, 아쉬운 말도 같이 봐야 해서' }, // 4 목
  { key: '주말 준비형', lead: '주말 전에 사두면 편할 것 같은 것들' },              // 5 금
  { key: '선물/집안템 큐레이션형', lead: '내 돈 쓰기 전에 한번 걸러보는 쇼핑 메모' }, // 6 토
];

function aiWrite(p) {
  const fmt = n => n ? n.toLocaleString('ko-KR') : '?';
  const angle = ANGLES[new Date().getDay()];
  const affiliateNotice = /toss\.im\//i.test(p.url)
    ? '이 포스팅은 토스쇼핑 제휴 활동의 일환으로, 구매 발생 시 수수료를 제공받을 수 있습니다.'
    : '이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 판매 발생 시 수수료를 제공받습니다.';
  const prompt = `너는 네이버 블로그 "쇼픽"의 운영자야. 자동 광고글이 아니라 "쇼핑 큐레이터가 직접 골라주는 글"처럼 써.
핵심 정체성: 매일 다른 사람이 아니라, 같은 쇼픽이 매일 다른 기준으로 고르는 느낌.

오늘의 각도: [${angle.key}]  (첫 문장 느낌 예: "${angle.lead}…")

[상품]
- 상품명: ${p.name}
- 브랜드: ${p.brand || ''} / 카테고리: ${p.cat}
- 정가 ${fmt(p.orig)}원 → ${fmt(p.price)}원 (${p.dc}% 할인)
- 리뷰 ${fmt(p.reviews)}개
- 핵심 검색 키워드: ${p.contentKeyword || p.kw || p.name}
- 선정 근거: 토스쇼핑 인기도 ${p.popularityScore != null ? p.popularityScore + '점' : '상위'} / 네이버 블루오션 ${p.naverScore != null ? p.naverScore + '점' : '미집계'}
- 링크: ${p.url}

[형식 — 매우 중요]
· 마크다운 절대 금지 (###, **, > 쓰지 마). 네이버에 그대로 붙일 일반 텍스트.
· 한 문장마다 줄바꿈. 말투는 쇼픽 톤 유지: ~더라고요, ~거든요, ~했어요ㅎㅎ, 은근, 확.
· ★성의있게: 두루뭉술하게 쓰지 말고, 구체적 상황·숫자·"여기서 사람들이 놓치는 것"·실전 팁을 촘촘히. 독자가 진짜 궁금해할 걸 먼저 짚어주고, 왜 그런지까지 설명. 따뜻하지만 솔직하게.
· ★구분선: 섹션 사이마다 "──────────────" 한 줄을 넣어 구분(고지 뒤, 제목후보 뒤, 각 번호 섹션 사이, 링크 앞뒤, 태그 앞).
· 맨 위 첫 줄에 정확히(대가성 고지 고정): ${affiliateNotice}
· 그다음 "[제목 후보]" 줄, 아래 1. 2. 3. 제목 3개.
· 그다음 ────────────── 한 줄.
· 첫 문장은 오늘 각도(${angle.key})에 맞게 시작. 매번 같은 도입 금지.
· ★반드시 글 중간에 "왜 이 상품을 골랐는지"를 진짜 사람이 고른 이유처럼 2~3줄 넣기 (큐레이터의 판단).
· 상품글이어도 아래 중 최소 하나는 넣기: 비교 기준 / 주의할 점 / 이런 사람한테 맞음·안 맞음.
· ★구조를 매번 다르게. 아래 중 하나를 골라 뼈대 자체를 바꿔: (a)단계별 실전 가이드형 (b)체크리스트 기준3개형 (c)문답 Q&A형 (d)경험담 서사형(소제목 최소) (e)비교+FAQ형. 매번 같은 소제목 순서(도입→뭐가다름→종류→왜골랐는지→체크포인트→이런분께) 절대 반복 금지.
· ★SEO: 핵심 검색 키워드를 제목 맨 앞 + 첫 문장 + 본문에 2~3번 자연스럽게. 억지 반복(키워드 도배)은 금지.
· 사진 자리 표시: 맨 위 대표 자리엔 [사진: 대표] (사용자가 직접 찍은 사진 넣는 자리), 그 외 [사진: 설명] 1~2곳.
· 상품 링크는:  🔻(한 줄 소개 문구)🔻  다음 줄  (링크: ${p.url})
· 맨 아래 해시태그 8~12개만 (30개 금지 — 봇 느낌). 상품·카테고리·핵심 키워드 위주.
· 반복 표현 금지: "가격 잘못 본 줄", "리뷰 보고 놀람", "지금 사야 하는 이유" 같은 뻔한 문구 쓰지 마.
· 정직성: 직접 써본 경험 지어내기 금지. 확실치 않으면 ~할 수 있어요. 단점도 솔직하게.
· 전체 1800~2600자.

지금 바로 글 본문만 출력해. (설명·머리말 없이)`;

  const body = JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] });
  const tmp = path.join(os.tmpdir(), `dg_${Date.now()}_${Math.random().toString(36).slice(2,6)}.json`);
  fs.writeFileSync(tmp, body);
  try {
    const raw = execFileSync('curl', ['-fsSL', '--max-time', '180',
      'https://api.anthropic.com/v1/messages',
      '-H', `x-api-key: ${API_KEY}`, '-H', 'anthropic-version: 2023-06-01',
      '-H', 'content-type: application/json', '-d', `@${tmp}`], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const res = JSON.parse(raw);
    return (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
}

const slug = s => s.replace(/[^가-힣A-Za-z0-9]/g, '').slice(0, 8);
const newNNs = [];
for (const p of picks) {
  nn++;
  const NNs = String(nn).padStart(2, '0');
  log(`(${NNs}) ${p.name.slice(0, 24)} 작성 중...`);
  let text;
  try { text = aiWrite(p); } catch (e) { log(`  ❌ 생성 실패: ${(e.message||'').slice(0,80)}`); nn--; continue; }
  if (!text || text.length < 300) { log('  ❌ 응답 부실, 건너뜀'); nn--; continue; }
  if (!/같이 보면 좋은 글/.test(text)) text += relBlock;
  fs.writeFileSync(path.join(DIR, `${NNs}-${slug(p.name)}.txt`), text);
  // 대표 이미지
  if (p.img) {
    try {
      execFileSync('curl', ['-fsSL', '-o', path.join(IMGDIR, `product-${NNs}.jpg`), '--max-time', '25',
        '-A', 'Mozilla/5.0', '-e', 'https://shopping.naver.com/', p.img.split('?')[0] + '?type=o1000'], { stdio: 'pipe' });
    } catch (e) {}
  }
  used.push(p.url); newNNs.push(NNs);
}
fs.writeFileSync(STATE, JSON.stringify(used, null, 0));

// ── schedule.json 에 오늘자 추가 ──
const sch = fs.existsSync(path.join(DIR, 'schedule.json'))
  ? JSON.parse(fs.readFileSync(path.join(DIR, 'schedule.json'), 'utf8'))
  : { perDay: N, days: [] };
const d = new Date(), z = n => String(n).padStart(2, '0');
const today = `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
const existDay = sch.days.find(x => x.date === today);
if (existDay) existDay.posts.push(...newNNs);
else sch.days.push({ date: today, posts: newNNs });
fs.writeFileSync(path.join(DIR, 'schedule.json'), JSON.stringify(sch, null, 2));

// ── 미리보기 재생성 ──
try { execFileSync('node', [path.join(DIR, 'preview-gen.js')], { stdio: 'inherit' }); } catch (e) {}
log(`✅ ${newNNs.length}개 생성 완료 (${today}) → http://localhost:8899/blog-posts-naver/preview.html`);
