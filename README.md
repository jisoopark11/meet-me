# 약속 잡기 (meet-me)

Google 캘린더의 빈 시간만 공개하고, 약속 요청을 메일로 받는 1인용 예약 페이지.

- **DB 없음** — 예약 요청 상태는 서명된 링크에 담깁니다
- **월 운영비 0원** — Vercel Hobby + Resend 무료 티어 + Cloudflare Turnstile 무료
- **일정 내용 비공개** — Google FreeBusy API는 응답에 제목·참석자·설명을 아예 포함하지 않습니다

```
방문자가 시간 선택 → 나에게 요청 메일 → '수락' 클릭 → 캘린더 자동 등록 + 신청자에게 카톡 링크 발송
```

---

## 설정 (30~40분)

### 1. Google 서비스 계정

OAuth 대신 서비스 계정을 씁니다. **토큰 갱신이 없어서 방치해도 죽지 않습니다.**
(개인용 OAuth 앱은 테스트 모드에서 refresh token이 7일마다 만료됩니다.)

1. [Google Cloud Console](https://console.cloud.google.com) → 새 프로젝트 생성
2. **API 및 서비스 → 라이브러리** → `Google Calendar API` 검색 → **사용 설정**
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → 서비스 계정**
   - 이름은 아무거나 (`meet-me` 등). 역할 부여는 건너뛰어도 됩니다.
4. 만들어진 서비스 계정 클릭 → **키 탭 → 키 추가 → 새 키 만들기 → JSON** → 파일 다운로드
5. JSON 안의 `client_email`(`...@....iam.gserviceaccount.com`)을 복사

### 2. 캘린더 공유

1. [Google 캘린더](https://calendar.google.com) → 내 캘린더에 마우스 올리고 **⋮ → 설정 및 공유**
2. **특정 사용자와 공유** → 위에서 복사한 서비스 계정 메일 추가
3. 권한: **일정 변경** (조회만 하면 수락 시 등록이 안 됩니다)
4. 같은 페이지 아래 **캘린더 통합**에서 **캘린더 ID** 복사 (보통 본인 Gmail 주소)

> 이 프로젝트에서는 캘린더를 "공개"로 바꿀 필요가 **없습니다.** 서비스 계정에만 공유하면 됩니다.

### 3. 메일 (Resend)

1. [resend.com](https://resend.com) 가입 → **API Keys**에서 키 발급
2. **Domains**에서 도메인 인증 (DNS에 레코드 3개 추가)
   - 도메인이 없다면 `onboarding@resend.dev`로 일단 테스트 가능합니다. 단, **가입한 본인 주소로만** 발송됩니다.

### 4. 봇 차단 (Cloudflare Turnstile)

[dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile** → 사이트 추가 → 사이트 키 / 시크릿 키 발급.
공개된 메일 폼은 봇이 금방 찾아냅니다. 무료니까 꼭 켜세요.

### 5. 환경변수

```bash
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # TOKEN_SECRET 생성
```

`.env.local`을 채웁니다. `GOOGLE_PRIVATE_KEY`는 JSON의 `private_key` 값을 **`\n`이 들어간 그대로** 큰따옴표로 감싸서 붙여넣으세요.

### 6. 실행

```bash
npm install
npm run dev   # http://localhost:3000
```

로컬에서는 Turnstile 키를 비워두면 봇 검증을 건너뜁니다.

---

## 배포 (Vercel)

```bash
git init && git add -A && git commit -m "init"
gh repo create meet-me --public --source=. --push   # 또는 GitHub에서 수동으로
```

[vercel.com](https://vercel.com) → **Import Git Repository** → 레포 선택 →
**Environment Variables**에 `.env.local`의 내용을 그대로 입력 → Deploy.

배포 후 `NEXT_PUBLIC_SITE_URL`을 실제 주소로 고치고 **재배포**하세요.
이 값이 틀리면 수락 링크가 잘못된 주소를 가리킵니다.

> **공개 레포이므로** `.env.local`과 서비스 계정 JSON은 절대 커밋하지 마세요.
> `.gitignore`에 이미 막아뒀지만, `git status`로 한 번 확인하는 습관을 권합니다.

---

## 시간 설정 바꾸기

`config/availability.ts` **한 파일만** 고치면 됩니다.

```ts
export const WEEKLY_WINDOWS = {
  0: [[10, 20]],  // 일 10:00~20:00
  5: [[19, 22]],  // 금 19:00~22:00
  6: [[10, 20]],  // 토
  1: [], 2: [], 3: [], 4: [],   // 평일 닫음
};
```

| 설정 | 기본값 | 설명 |
|---|---|---|
| `SLOT_MINUTES` | 60 | 약속 길이 |
| `BUFFER_MINUTES` | 30 | 기존 일정 앞뒤 여유. 붙어있는 슬롯은 자동 제외 |
| `MIN_NOTICE_HOURS` | 24 | 이 시간 이내 슬롯은 노출 안 함 |
| `HORIZON_DAYS` | 45 | 며칠 앞까지 열지 |
| `BLOCKED_DATES` | `[]` | 통째로 막을 날짜 (`"2026-08-15"`) |

하루에 여러 구간도 가능합니다: `6: [[10, 13], [15, 20]]`

---

## 구조

```
config/availability.ts   ← 설정은 여기만
lib/
  time.ts       KST(UTC+9 고정) 시간 계산
  google.ts     서비스 계정 인증, FreeBusy 조회, 일정 등록
  slots.ts      후보 슬롯 생성 → 버퍼 적용 → 겹치는 것 제거
  token.ts      HMAC 서명 토큰 (DB 대신)
  mail.ts       Resend 발송 + HTML 이스케이프
app/api/
  slots         GET   빈 시간 목록 (5분 CDN 캐시)
  request       POST  요청 접수 → 나 + 신청자에게 메일
  accept        POST  캘린더 등록 → 신청자에게 카톡 링크 발송
app/accept      수락 확인 페이지 (메일 스캐너 오작동 방지용 한 단계)
```

### 설계 메모

**왜 DB가 없나** — 예약 요청 내용(시간·이름·메일·용건)을 HMAC으로 서명해 수락 링크 자체에 담습니다.
서버는 서명만 검증하면 되므로 저장소가 필요 없습니다. 관리할 것도, 요금이 붙을 것도 없습니다.

**중복 수락 방지** — 이벤트 ID를 토큰의 SHA-256에서 결정적으로 생성합니다.
같은 링크를 두 번 눌러도 Google이 409로 거절하므로 일정이 두 개 생기지 않습니다.

**수락이 GET이 아닌 이유** — 일부 메일 클라이언트와 보안 스캐너가 링크를 미리 열어봅니다.
GET으로 바로 등록하면 열어보지도 않았는데 수락 처리될 수 있어, 확인 페이지에서 버튼을 한 번 더 누르게 했습니다.

**요청 시각 재검증** — 클라이언트가 보낸 시간을 믿지 않고 `/api/request`에서 다시 계산합니다.
목록을 본 뒤 폼을 채우는 사이에 캘린더에 일정이 생겼을 수도 있습니다.

**서비스 계정과 참석자** — 서비스 계정은 도메인 전체 위임 없이 일정에 참석자를 추가할 수 없습니다.
그래서 신청자 정보는 일정 설명에 넣고, 안내는 Resend로 따로 보냅니다.

---

## 무료 한도

| | 한도 | 예상 사용량 |
|---|---|---|
| Vercel Hobby | 100GB 대역폭/월 | 넉넉함 |
| Resend | 3,000통/월 | 예약 1건당 3통 |
| Google Calendar API | 1,000,000회/일 | `/api/slots`는 5분 캐시됨 |
| Cloudflare Turnstile | 무제한 | — |

실질 비용은 도메인 값(연 1~2만원)뿐입니다.

---

## 나중에 붙일 만한 것

- **취소/변경 링크** — 확정 메일에도 서명 토큰 링크를 넣으면 DB 없이 가능
- **거절 링크** — 지금은 메일 답장으로 처리 (`reply-to`가 신청자로 설정돼 있음)
- **여러 약속 유형** — 30분/1시간 등. `config`를 배열로 바꾸고 URL에 타입을 넘기면 됩니다
- **요청 이력** — 필요해지면 Supabase 무료 티어. 그 전까지는 메일함이 곧 이력입니다
