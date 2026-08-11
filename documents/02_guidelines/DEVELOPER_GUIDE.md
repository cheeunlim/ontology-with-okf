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
8. [OKF 확장 메타데이터 Aspect Type 설계 규격](#8-okf-확장-메타데이터-aspect-type-설계-규격)
9. [GCP Dataplex Business Glossary Native 연동 파이프라인](#9-gcp-dataplex-business-glossary-native-연동-파이프라인)

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
├── documents/                 # 설계, 가이드라인, Epic 및 Task 명세
│   ├── 01_architecture/       # 아키텍처 및 로드맵 문서
│   ├── 02_guidelines/         # 개발자/사용자 가이드
│   ├── 03_epics/              # EPIC-001 ~ EPIC-008 마스터 명세 (프로덕션)
│   ├── 04_tasks/              # TASK-001 ~ TASK-008 실행 명세 (프로덕션)
│   └── 05_experimental/       # 🧪 EPIC-007 / TASK-007 실험적 R&D 아카이브 폴더
├── skills/                    # 스킬 모음 (EPIC_TASK_DEV, LOCAL_TEST, GITHUB_PUSH, GITHUB_REF_UPDATE 등)
├── references/                # 공식 레퍼런스 및 외부 upstream 소스 격리 (google/adk-python 포함)
│   ├── knowledge-catalog/okf/ # Google Cloud OKF v0.2 공식 스펙 및 테스트 (`google-adk>=2.0`)
│   └── README.md              # External & Framework References 안내 ([google/adk-python](https://github.com/google/adk-python))
├── srcs/                      # 실제 프로덕션 소스 코드 및 배포 에셋
│   ├── src/
│   │   ├── agents/            # Gemini 3.5 Flash API 클라이언트 & Thoughts 수집
│   │   ├── prompts/           # 모듈화 프롬프트 모음 (harvester, transpiler, enrichment, graph, agentChat, feedback & index.js)
│   │   ├── tools/             # gcpTools.js, okfV02Builder.js
│   │   ├── App.jsx            # 메인 React UI 컴포넌트 (5대 글로벌 탭)
│   │   └── index.css          # Glassmorphism 디자인 토큰 & 스타일
│   ├── Dockerfile             # Cloud Run 배포용 컨테이너 명세 (Google Cloud SDK 포함)
│   ├── package.json           # 의존성 및 빌드 스크립트 정의
│   ├── server.js              # Express API 게이트웨이 (Port 3003)
│   ├── start_server.sh        # 자동 재기동 샌티널 스크립트
│   └── vite.config.js         # Vite 번들러 설정
├── AGENT.md                   # AI 에이전트 철학 & 모델 명세 (gemini-3.5-flash 고정)
├── DESIGN.md                  # UI/UX 디자인 가이드 & 컬러 시스템
├── GEMINI.md                  # Gemini 연동 명세 & 방어적 프로그래밍 수칙
├── README.md                  # 프로젝트 최상단 개요 & Quick Links
└── prod.md                    # 전체 프로젝트 단일 진실 소스 (SSOT)
```

---

## 4. 핵심 AI & 아키텍처 규칙 (Single Source of Truth)

1. **Gemini 모델 지정 규칙**:
   - 모든 AI 요청은 반드시 **`gemini-3.5-flash`** 모델을 고정하여 사용합니다 (`agents/geminiAgent.js`).
2. **프롬프트 단일 소스 관리 (SSOT)**:
   - 프롬프트 구문을 코드 곳곳에 하드코딩하지 않으며, 오직 `prompts/` 모듈 파일에서 기능/에픽별로 분리 작성 및 보완합니다.
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
| `/api/data-agent-chat` | POST | 하이브리드(SQL/GQL) 질의 처리, Attested SQL 실행 및 4단계 Provenance 리포트 생성 |
| `/api/enrich-metadata` | POST | BigQuery 물리 스키마 + GCS 위키 연동 OKF 명세서 자동 생성 |
| `/api/verify-okf` | POST | 현업 스튜어드 승인 서명(`verified`) 및 Usage Window (영구/1년/3년) 프리셋 기반 `stale_after` 유효기간 영구 갱신 |
| `/api/okf/validate-bundle` | POST | 번들 내 모든 문서의 OKF v0.2 적합성(필수 키, 깨진 링크, 각주 일치성, 만료일) 정적 린트 |
| `/api/dataplex/scans` | GET | Dataplex 데이터 프로파일 & 품질 스캔 상태 실시간 조회 |
| `/api/dataplex/run-scan` | POST | 온디맨드 개별/일괄 Dataplex 데이터 프로파일링 스캔 실행 요청 |
| `/api/dataplex/push` | POST | 보강 완료된 OKF 지식을 Dataplex Catalog Aspect로 동기화 |
| `/api/llm-wiki-store/decompose` | POST | 비정형 PDF/문서를 Summary, Entities, Concepts 3계층 위키로 해체 |
| `/api/feedback/refine` | POST | 현업 피드백 및 예외 룰 반영 지식 갱신 |
| `/api/okf/wiki-convert-chunk` | POST | [EPIC-003] 마스터 문서 Wiki OKF v0.2 변환, 헤딩 hierarchy 기반 아토믹 청킹, 백링크 visualizer & 주요 업무 정의 추출 |
| `/api/graph/synthesize-dataset` | POST | [EPIC-005] 선택된 데이터셋 내 OKF 메타데이터 + 연결 위키 + 빈출 SQL 쿼리 분석 기반 Property Graph DDL & GQL 템플릿 자율 합성 |
| `/api/graph/deploy-custom-graph` | POST | [EPIC-005] 자율 합성된 커스텀 프로퍼티 그래프 DDL BigQuery 배포 및 GCS 버킷 보관 |

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

---

## 8. OKF 확장 메타데이터 Aspect Type 설계 규격

Dataplex Knowledge Catalog에서 OKF 신규 스펙(검증 상태, 유효기간, 거버넌스 정책, Attested SQL)을 Native 관리하기 위한 `okf_governance_aspect` 스키마 규격입니다.

```json
{
  "name": "okf_governance",
  "type": "record",
  "recordFields": [
    {
      "name": "validation_status",
      "type": "string",
      "annotations": {
        "displayName": "검증 상태 (Validation Status)",
        "description": "OKF 온톨로지 규칙 검증 상태 (e.g. DRAFT, PENDING, ATTESTED, REJECTED)"
      }
    },
    {
      "name": "valid_until",
      "type": "string",
      "annotations": {
        "displayName": "유효기간 (Valid Until)",
        "description": "비즈니스 룰 및 Attested SQL의 만료 일시 (ISO 8601 string)"
      }
    },
    {
      "name": "attested_sql",
      "type": "string",
      "annotations": {
        "displayName": "검증 완료된 SQL (Attested SQL)",
        "description": "검증 완료된 Standard SQL 및 GQL GRAPH_TABLE 쿼리 문구"
      }
    },
    {
      "name": "governance_policy",
      "type": "string",
      "annotations": {
        "displayName": "적용 정책 (Governance Policy)",
        "description": "데이터 보안, 접근 권한 및 규제준수 정책 규칙"
      }
    },
    {
      "name": "attested_by",
      "type": "string",
      "annotations": {
        "displayName": "검증 승인자 (Attested By)",
        "description": "해당 룰과 SQL을 승인한 데이터 아키텍트/도메인 오너 ID"
      }
    }
  ],
  "annotations": {
    "displayName": "OKF Governance & Attested Spec",
    "description": "OKF 검증, 유효기간(staleAfterOption: permanent | 1year | 3years | custom), 정책, Attested SQL 전용 확장 Aspect"
  }
}
```

---

## 9. GCP Dataplex Business Glossary Native 연동 파이프라인

### 📌 Overview
GCP Dataplex Data Catalog의 Business Glossary (비즈니스 용어집) 및 Custom Aspect Types를 OKF Omni 플랫폼과 양방향 연동하는 백엔드 API 및 프론트엔드 통합 카드 명세입니다.

### 🔌 API Endpoints
1. **`GET /api/dataplex-glossary/terms`**:
   - **설명**: GCP Dataplex CLI (`gcloud dataplex entries search` / `gcloud dataplex glossaries list`)를 호출하거나 인메모리 캐시를 통해 비즈니스 용어집(Business Glossary) 엔트리 목록을 조회합니다.
   - **Fallback**: CLI 응답 지연/권한 부재 시 `mockDataplexTerms` (고객 고유번호, 결제 주문번호, 이탈 예측 점수 등)로 100ms 내 초고속 응답을 보장합니다.

2. **`POST /api/dataplex-glossary/sync`**:
   - **설명**: 로컬 OKF 지식 명세를 Dataplex Entry의 Custom Aspect (`overview`, `governance`, `schema`) 및 Description 태그로 1-Click 동기화(Push)합니다.
   - **Parameters**: `{ tableId, aspects: { description: boolean, overview: boolean } }`

3. **`GET /api/dataplex-aspects/:tableId`**:
   - **설명**: 특정 물리 테이블에 연결된 Dataplex Entry Group (`@bigquery`) 및 부착된 5종 Aspect 연결 상태를 조회합니다.

### 🎨 Frontend Integration (Catalog Info Tab)
- `App.jsx` 내 `activeTab === 'advanced-schema'` 탭에 **`☁️ Dataplex Business Glossary & Aspects (${selectedTable})`** 섹션을 렌더링합니다.
- 2-Column Grid 레이아웃:
  - **Left**: Live Push Sync Card (체크박스로 엔트리 기본 설명 / 개요 Aspect 선택 후 1-Click Push 수행)
  - **Right**: Connected Aspect Types Card (Overview, Schema, OKF Governance 등 5개 Aspect 연결 현황 표시)
- 하단: **Physical Schema & Business Glossary Mapping Table** (상위 10개 물리 컬럼과 자동 매핑된 비즈니스 용어 표기).


