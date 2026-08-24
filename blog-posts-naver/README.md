# 블로그 샘플 미리보기 + 자동생성 워크플로

네이버 붙여넣기용 글(.txt)을 만들고, 로컬 HTML 미리보기로 날짜별로 본다.

## 파일
- `NN-주제.txt` — 글 (마크다운 없음, 한 문장 줄바꿈, 소제목 `N.`, `[사진:]`/`[상품사진:]`, `🔻`+`(링크:)`, 태그 30개, `▼같이 보면 좋은 글▼`)
- `schedule.json` — 발행 캘린더 (날짜별 5개 배치)
- `used-products.json` — 이미 쓴 상품(중복 방지)
- `preview-gen.js` — 미리보기 생성 (이미지 자동배치 + 날짜별 묶기)
- `daily-generate.js` — 매일 5개 자동생성 (Claude API)
- `pick-bluocean.cjs` — 토스쇼핑 인기상품을 네이버 검색수요·블로그 경쟁도로 재정렬
- `crawl-images.sh` — 상품 이미지 크롤(로컬, 상품당 5장)

## 미리보기 띄우기
```
node preview-gen.js
cd .. && python3 -m http.server 8899      # 한 번만. 이후엔 새로고침
# → http://localhost:8899/blog-posts-naver/preview.html
```
목차(날짜별) 이동, PC/모바일 폭 전환 지원.

## 상품 이미지 크롤 (로컬)
```
bash crawl-images.sh        # Chrome 켜둔 상태에서. 상품당 5장 → product-NN-1..5.jpg
node preview-gen.js         # 사진 자리에 자동 배치됨
```
※ 크롤은 반드시 로컬에서. (원격/샌드박스는 네이버 커머스 페이지 차단)

## 매일 5개 자동생성
```
node daily-generate.js 5    # 새 상품 5개 골라 글 생성 + 이미지 + 오늘자 캘린더 배치 + 미리보기 갱신
```
- 상품 선정은 `catalog.json`의 토스쇼핑 리뷰·할인·순위와 네이버 데이터랩 검색 수요·블로그 경쟁도를 합산한다.
- 선정만 다시 실행: `node pick-bluocean.cjs --candidates 24 --limit 12`
- 네이버 API가 실패하면 리뷰수 기반 토스 인기순으로 자동 대체한다.
- 리셋: `used-products.json` 을 `[]` 로 비우면 처음부터 다시 뽑음.

### 매일 아침 자동 실행 (launchd, 예: 오전 8시)
`~/Library/LaunchAgents/com.shopick.daily.plist` 만들고:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.shopick.daily</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/yunjikang/Desktop/토스/lowest-pick/blog-posts-naver/daily-generate.js</string>
    <string>5</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/tmp/shopick-daily.log</string>
  <key>StandardErrorPath</key><string>/tmp/shopick-daily.err</string>
</dict></plist>
```
등록: `launchctl load ~/Library/LaunchAgents/com.shopick.daily.plist`
(node 경로는 `which node` 로 확인해서 맞추기)

## 발행은 수동
네이버 자동 발행은 로그인·대행이 필요해 스크립트가 대신 못 함.
미리보기에서 글 확인 → 네이버 에디터에 붙여넣기 → 이미지 업로드 → 발행.
