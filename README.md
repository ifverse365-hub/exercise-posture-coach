# AI 운동 자세 분석 코치

AI 기반 실시간 운동 자세 분석 시스템

MediaPipe Pose + KNN 분류기를 활용하여 헬스/웨이트 운동 동작을 실시간으로 분석하고 피드백을 제공하는 웹앱입니다.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Pose-blue?logo=google)
![Supabase](https://img.shields.io/badge/Supabase-Database-green?logo=supabase)

## 주요 기능

### 6가지 헬스 운동 지원

| 운동 | 설명 | 유형 |
|------|------|------|
| 🦵 스쿼트 | 하체 근력 강화의 기본 운동 | 10회 반복 |
| 🚶 런지 | 하체 균형과 근력을 동시에 | 8회 반복 |
| 💪 푸시업 | 상체 전체를 강화하는 기본 운동 | 10회 반복 |
| 🧱 플랭크 | 코어 근력의 기초 | 30초 유지 |
| 🙆 숄더프레스 | 어깨와 팔 근력 강화 | 12회 반복 |
| 🔥 버피 | 전신 유산소 + 근력 운동 | 5회 반복 |

### 두 가지 피드백 방식

- **즉시 연습**: 학습 데이터 없이 규칙 기반 피드백 (카메라만 켜면 바로 시작)
- **AI 연습**: KNN 분류기 기반 정밀 분석 (녹화 데이터 필요)

### 실시간 자세 분석

- 무릎 각도, 상체 정렬, 동작 깊이 등 체크
- 실시간 피드백 메시지
- 점수 및 진행 상황 표시

## 기술 스택

- **프레임워크**: Next.js 14 (App Router)
- **포즈 인식**: MediaPipe Tasks Vision (PoseLandmarker, GPU)
- **분류기**: 자체 구현 KNN (k=5, 유클리드 거리)
- **데이터베이스**: Supabase (PostgreSQL)
- **배포**: Vercel

## 시작하기

### 요구사항

- Node.js 18+
- 웹캠이 있는 기기
- 모던 브라우저 (Chrome, Edge, Safari)

### 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/YOUR_USERNAME/exercise-posture-coach.git
cd exercise-posture-coach

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

http://localhost:3000 에서 앱을 확인할 수 있습니다.

## 배포

### Vercel 배포

1. [Vercel](https://vercel.com)에서 GitHub 저장소 연결
2. 환경 변수 설정:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
3. 자동 배포 완료

### Supabase 설정

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 실행
3. Project Settings > API에서 URL과 anon key 복사
4. Vercel 환경 변수에 추가

## 프로젝트 구조

```
exercise-posture-coach/
├── app/
│   ├── layout.js          # 루트 레이아웃
│   ├── page.js            # 메인 페이지
│   └── globals.css        # 전역 스타일
├── components/
│   └── App.jsx            # 메인 앱 컴포넌트
├── lib/
│   ├── motions.js         # 6가지 운동 정의
│   ├── features.js        # 특성벡터 추출 (114차원)
│   ├── feedback.js        # 규칙 기반 피드백 시스템
│   ├── knn.js             # KNN 분류기
│   ├── session.js         # 연습 세션 관리
│   └── supabase.js        # Supabase 클라이언트
├── supabase/
│   └── schema.sql         # 데이터베이스 스키마
└── package.json
```

## 데이터 흐름

```
카메라 → MediaPipe PoseLandmarker → 33개 랜드마크
    │
    ├─ [즉시 연습] → feedback.js (규칙 기반 체크포인트)
    │                    ↓
    │              실시간 피드백 UI
    │
    └─ [AI 연습] → features.js → KNN 분류
                       ↓
                 session.js (시퀀스/유지시간 추적)
                       ↓
                 운동 기록 저장 (Supabase)
```

## 브라우저 지원

| 브라우저 | 지원 |
|---------|------|
| Chrome (데스크탑/모바일) | O |
| Edge | O |
| Safari (iOS 15+) | O |
| Firefox | 일부 기능 제한 |

## 라이선스

MIT License
