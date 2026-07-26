# 🛠️ OKF Omni 개발자 가이드 (Developer Guide)

본 문서는 **OKF Omni (Enterprise Ontology Platform)**를 설치, 개발, 확장, 테스트 및 Cloud Run 환경에 배포하고자 하는 개발자를 위한 기술 명세서 및 모범 사례 가이드입니다.

---

## 🧭 목차 (Table of Contents)
1. [시스템 아키텍처 & 기술 스택](#1-시스템-아키텍처--기술-스택)
2. [개발 환경 구성 & 로컬 실행](#2-개발-환경-구성--로컬-실행)
3. [프로젝트 디렉토리 구조](#3-프로젝트-디렉토리-구조)
4. [핵심 AI & 아키텍처 규칙 (Single Source of Truth)](#4-핵심-ai--아키텍처-규칙-single-source-of-truth)
5. [백엔드 API 라우트 규격](#5-백엔드-api-라우트-규격)
6. [방어적 프로그래밍 & 예외 처리 수칙](#6-방어적-프로그래밍--예외-처리-수칙)
7. [Cloud Run 배포 가이드](#7-cloud-run-배포-가이드)

---

## 1. 시스템 아키텍처 & 기술 스택

### 🏗️ 기술 스택 (Tech Stack)
- **Frontend**: React (Vite, Javascript ES Modules), Vanilla CSS Design System, Lucide Icons
- **Backend**: Express.js Gateway, Node.js (`server.js`, Port 3003)
- **AI Engine**: Google **Gemini 3.5 Flash** (`gemini-3.5-flash` 고정)
- **GCP Data Ecosystem**: Google Cloud BigQuery, BigQuery Property Graph (GQL), Cloud Storage (GCS), GCP Dataplex Data Catalog
- **Automation / Watchdog**: Sentinal Shell Script (`start_server.sh`)

---

## 2. 개발 환경 구성 & 로컬 실행

### ① 사전 요구사항 (Prerequisites)
- Node.js v18+ 및 npm
- Google Cloud SDK (`gcloud` CLI)
- BigQuery 및 GCS 접근 권한이 있는 GCP 계정

### ② GCP 인증 & ADC 설정
```bash
# GCP 로그인 및 Application Default Credentials 발급
gcloud auth login
gcloud auth application-default login

# GCP 프로젝트 설정
gcloud config set project <YOUR_PROJECT_ID>
```

### ③ 패키지 설치 & 로컬 서버 구동
```bash
# 디렉토리 이동 및 의존성 설치
npm install

# 프론트엔드 에셋 빌드 (React Vite)
npm run build

# 백엔드 API 게이트웨이 기동 (Port 3003)
node server.js

# 또는 자동 재기동 샌티널 스크립트로 기동
chmod +x start_server.sh
./start_server.sh
```

---

## 3. 프로젝트 디렉토리 구조

```
ontology-with-okf/
├── agents/
│   └── geminiAgent.js         # Gemini 3.5 Flash API 호출 클라이언트 & Thoughts 수집 모듈
├── prompts/
│   └── agentPrompts.js        # 모든 AI 프롬프트 템플릿의 단일 소스 (SSOT)
├── tools/
│   └── gcpTools.js            # BigQuery, GCS SDK Wrapper & 헬퍼 함수 모듈
├── docs/
│   ├── USER_GUIDE.md          # 사용자 가이드
│   ├── DEVELOPER_GUIDE.md     # 개발자 가이드 (본 문서)
│   └── okf-templates/         # OKF 명세 템플릿 샘플
├── src/
│   ├── App.jsx                # 메인 React 컴포넌트 (8개 탭 상태 & Provenance 추적)
│   ├── App.css                # CSS 스타일 및 Glassmorphism 디자인 토큰
│   └── main.jsx               # React 진입점
├── Design.md                  # UI 디자인 가이드 & 컬러 시스템
├── GEMINI.md                  # Gemini 연동 명세 & 방어적 프로그래밍 수칙
├── README.md                  # 프로젝트 최상단 개요 & Quick Links
├── Dockerfile                 # Cloud Run 배포용 Dockerfile (Google Cloud CLI 포함)
├── package.json               # Node.js 패키지 정의
└── server.js                  # Express API 게이트웨이 (Port 3003)
```

---

## 4. 핵심 AI & 아키텍처 규칙 (Single Source of Truth)

1. **Gemini 모델 지정 규칙**:
   - 모든 AI 요청은 반드시 **`gemini-3.5-flash`** 모델을 고정하여 사용합니다 (`agents/geminiAgent.js`).
2. **프롬프트 단일 소스 관리 (SSOT)**:
   - 프롬프트 구문을 코드 곳곳에 하드코딩하지 않으며, 오직 `prompts/agentPrompts.js`에서 작성 및 보완합니다.
3. **언어 및 용어 수칙**:
   - 물리적 스펙(테이블명, SQL 구문) 외 모든 비즈니스 설명/품질 리포트는 **한국어** 생성을 기본으로 합니다. (단 `appLang: "en"` 전달 시 영어 도출 허용).
   - **'회류' 단어 사용을 엄격히 금지**하며, 피드백 레이블 및 모든 코드/문서에는 **'Feedback'** 또는 **'피드백'**으로 표기합니다.
4. **AI 생각 흐름 (`part.thought`) 파싱**:
   - `thinkingConfig: { thinkingBudget: 2048 }` 설정을 켜서 Gemini의 브레인스토밍 과정을 추출하고 프론트엔드 Provenance 패널에 실시간 렌더링합니다.

---

## 5. 백엔드 API 라우트 규격

| API 라우트 | 메서드 | 설명 |
| :--- | :--- | :--- |
| `/api/datasets` | GET | GCP BigQuery 데이터셋 목록 조회 |
| `/api/tables` | GET | 데이터셋 내 테이블 & VIEW 개체 목록 및 스키마 조회 |
| `/api/data-agent-chat` | POST | 하이브리드(SQL/GQL) 질의 처리 및 5단계 Provenance 리포트 생성 |
| `/api/enrich-metadata` | POST | BigQuery 물리 스키마 + GCS 위키 연동 OKF 명세서 자동 생성 |
| `/api/dataplex/push` | POST | 보강 완료된 OKF 지식을 Dataplex Catalog Aspect로 동기화 |
| `/api/llm-wiki-store/decompose` | POST | 비정형 PDF/문서를 Summary, Entities, Concepts 3계층 위키로 해체 |
| `/api/feedback/refine` | POST | 현업 피드백 및 예외 룰 반영 지식 갱신 |

---

## 6. 방어적 프로그래밍 & 예외 처리 수칙

1. **BigQuery VIEW 개체 처리**:
   - `VIEW` 타입 테이블의 경우 `table.getRows()` API 호출 시 `400 Bad Request` 에러가 발생합니다.
   - 모든 BigQuery 행 조회 로직은 `try-catch`로 감싸고 VIEW인 경우 Direct SQL Fallback(`SELECT * FROM view LIMIT 10`) 또는 기본값(`0`)을 반환합니다 (`server.js`).
2. **Dataplex CLI 지연 차단 (In-Memory Cache & Timeout)**:
   - CLI 실행 시 지연을 방지하기 위해 3초 타임아웃 및 10분 TTL 인메모리 캐시(`global.dataplexScanCache`)를 적용합니다.
3. **Data Agent 쿼리 Auto-Retry Loop**:
   - GQL/SQL 생성 쿼리에 예약어 키워드(e.g., `Order`, `User`)가 포함되어 쿼리 에러 발생 시, 1회 자율수복(Auto-Correction) 루프를 백엔드에서 자동 실행합니다.
4. **React White Screen Crash 방지**:
   - 정의되지 않은 가상 컴포넌트 호출을 금지하며, `activeGraph?.ddl || ''` 형태의 세이프가드 널 체크를 의무 적용합니다.

---

## 7. Cloud Run 배포 가이드

### Dockerfile 빌드 및 GCP Artifact Registry 푸시
```bash
# GCP Container/Artifact Registry 로그인
gcloud auth configure-docker us-central1-docker.pkg.dev

# 이미시 빌드 & 태그 지정
docker build -t us-central1-docker.pkg.dev/<YOUR_PROJECT_ID>/okf-repo/okf-omni:latest .

# 푸시
docker push us-central1-docker.pkg.dev/<YOUR_PROJECT_ID>/okf-repo/okf-omni:latest
```

### Cloud Run 배포
```bash
gcloud run deploy okf-omni \
  --image us-central1-docker.pkg.dev/<YOUR_PROJECT_ID>/okf-repo/okf-omni:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 3003 \
  --memory 2Gi \
  --cpu 2
```

> [!NOTE]
> Cloud Run 서비스 계정(Service Account)에는 Dataplex 및 BigQuery 조회를 위해 최소한 **`roles/dataplex.viewer`**, **`roles/bigquery.admin`**, **`roles/storage.objectAdmin`** 권한이 부여되어야 합니다.
