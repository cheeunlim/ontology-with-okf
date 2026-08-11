# 🌐 OKF Omni: Enterprise Ontology Integration Platform

**[🇺🇸 English Guide (README_EN.md)](./README_EN.md) | [🇰🇷 한국어 문서 (README.md)](./README.md)**

[![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial-red.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/🚀_Cloud_Run_Live_Demo-Click_to_Launch-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://okf-omni-924723860007.us-central1.run.app/)
[![Project Master](https://img.shields.io/badge/Master_Spec-prod.md-FF6F00?style=for-the-badge&logo=markdown&logoColor=white)](./prod.md)
[![Agent Spec](https://img.shields.io/badge/AI_Engine-AGENT.md-34A853?style=for-the-badge&logo=googlegemini&logoColor=white)](./AGENT.md)
[![Design System](https://img.shields.io/badge/Design_System-DESIGN.md-9333EA?style=for-the-badge&logo=figma&logoColor=white)](./DESIGN.md)

**OKF Omni**는 엔터프라이즈의 정형 데이터 메타데이터(BigQuery 스키마, DDL, Property Graph)와 비정형 비즈니스 지식(사내 가이드라인, 위키 문서, 정책 PDF)을 유기적으로 융합하여 상호 참조 온톨로지(Ontology)를 구축하고 지능형 데이터 분석(GQL/SQL/RAG)을 지원하는 플랫폼입니다.

---

## ⚡ 1-Click Live Demo 체험하기
아래 버튼을 클릭하면 Google Cloud Run 환경에 실시간으로 배포되어 동작하는 **OKF Omni 라이브 플랫폼**을 바로 체험하실 수 있습니다.

[![Launch Demo App](https://img.shields.io/badge/👉_https://okf--omni--924723860007.us--central1.run.app/-ENTER_PLATFORM-FF6F00?style=for-the-badge&logo=googlechrome&logoColor=white)](https://okf-omni-924723860007.us-central1.run.app/)

---

## 🏛️ 프로젝트 마스터 문서 체계 (Architecture & Documentation System)

본 프로젝트는 요구사항, 사양, 소스 코드, 외부 레퍼런스가 엄격히 분리된 표준 아키텍처 체계로 운영됩니다.

| 영역 | 핵심 파일 / 디렉토리 | 설명 및 역할 |
| :--- | :--- | :--- |
| 🚀 **Project Master** | **[`prod.md`](./prod.md)** | **[SSOT]** 전체 프로젝트 마스터 요구사항, 4계층 토폴로지, 에픽/태스크 매트릭스 및 변경 전파 규격 |
| 🤖 **AI Agent Core** | **[`AGENT.md`](./AGENT.md)** | 다중 에이전트 아키텍처, `gemini-3.5-flash` 모델 규격, 생각 흐름(Thoughts) 추출 및 자율 수복 표준 |
| 🛠️ **Workflow Skills** | **[`SKILL.md`](./SKILL.md)** | **[Skills Master]** Epic/Task 동기화, 로컬 테스트, GCP Cloud Run 배포 마스터 워크플로우 스킬 |
| 🎨 **Design System** | **[`DESIGN.md`](./DESIGN.md)** | 5대 글로벌 메인 탭 구조, Rich Aesthetic 디자인 토큰, 컴포넌트 일관성 수칙 및 변경 로그 |
| 📑 **Documents** | **[`documents/`](./documents/)** | 개발 사양(01), 가이드라인(02), 메인 에픽(03), 대칭 태스크(04) 관리 전용 폴더 |
| 💻 **Source Code** | **[`src/`](./src/)** | GitHub 공유용 백엔드 게이트웨이, 에이전트, 프롬프트, 도구 및 React 프론트엔드 전체 소스 |
| 📚 **References** | **[`references/`](./references/)** | 외부 오픈소스 프레임워크([`google/adk-python`](https://github.com/google/adk-python), `knowledge-catalog`), 비즈니스 샘플 PDF, OKF 템플릿 격리 보관소 |

---

## 📂 디렉토리 구조 (Directory Structure)

본 프로젝트는 최상위 루트 디렉토리를 커뮤니케이션 및 작업 명세 중심으로 극대화하여 정돈하고, 모든 소스 코드 및 패키지 레벨 파일들을 `srcs/` 하위 폴더로 격리 배치하였습니다.

```text
ontology-with-okf/
├── .gitignore                # 🛡️ Git 형상 관리 제외 규칙
├── LICENSE                   # 📜 PolyForm Noncommercial 1.0.0 라이선스
├── AGENT.md                  # 🤖 AI 에이전트 아키텍처 및 Gemini 모델 표준
├── DESIGN.md                 # 🎨 UI/UX 디자인 시스템 및 5대 탭 표준
├── GEMINI.md                 # 🧠 Gemini AI 연동 명세서 및 자율 추론 설정
├── prod.md                   # 🚀 [SSOT] 전체 프로젝트 마스터 요구사항 및 에픽 매핑
├── SKILL.md                  # 🛠️ [Skills Master] 마스터 워크플로우 스킬 정의서
├── README.md                 # 🌐 프로젝트 메인 리드미 (한국어)
├── README_EN.md              # 🌐 Project Overview & Guide (English)
│
├── skills/                   # 🛠️ [개발/운영 워크플로우 스킬 모음]
│   ├── EPIC_TASK_DEV.md      # 🚀 Epic 기반 Task 추적 및 소스 구현 연속 개발 스킬
│   ├── LOCAL_TEST_AND_DEPLOY.md # 🚀 기능 위주 로컬 브라우저 테스트 & Cloud Run 배포 스킬
│   ├── GITHUB_PUSH.md        # 🐙 코드 정돈, API키 보안 스캔 & GitHub Push 스킬
│   ├── GITHUB_REF_UPDATE.md  # 🔄 외부 GitHub 레퍼런스 최신 신규 코드 갱신 스킬
│   └── DEV_WORKFLOW.md       # 🛡️ 5대 개발 수칙 검증 스킬
│
├── documents/                # 📑 [1. 개발 사양 및 플랜 관리]
│   ├── 01_architecture/      # 아키텍처 로드맵 및 LLM-Wiki 엔진 설계서
│   ├── 02_guidelines/        # 개발자 가이드, 사용자 가이드, 검증 체크리스트
│   ├── 03_epics/             # 메인 Epic 명세서 (EPIC-001 ~ EPIC-008)
│   └── 04_tasks/             # Epic 1:1 대칭 Task 명세서 (TASK-001 ~ TASK-008)
│
├── references/               # 📚 [2. 외부 레퍼런스 및 참고 자료]
│   ├── knowledge-catalog/    # Google Cloud OKF 외부 레포지토리
│   ├── sample_docs/          # 비즈니스 샘플 PDF 문서
│   ├── okf_templates/        # OKF 표준 템플릿 마크다운
│   └── specifications/       # 외부 정책 YAML 및 설계 제안서
│
└── srcs/                     # 💻 [3. 전체 애플리케이션 소스 및 패키지 관리]
    ├── package.json          # 📦 Node.js 프로젝트 설정 및 의존성
    ├── package-lock.json     # 🔒 의존성 락 파일
    ├── vite.config.js        # ⚡ Vite 번들러 설정 (port: 3003)
    ├── server.js             # ⚙️ 백엔드 진입점 게이트웨이
    ├── start_server.sh       # 🛡️ 무중단 자동 재기동 샌티널 스크립트
    ├── Dockerfile            # 🐳 Cloud Run 배포용 컨테이너 빌드 명세서
    ├── index.html            # 🌐 React HTML 엔트리포인트
    ├── deploy/               # 🚀 배포 설정 파일
    ├── scripts/              # 🔧 유틸리티 스크립트
    ├── scratch/              # 🧪 로컬 캐시 및 임시 파일 저장소
    ├── dist/                 # 🏗️ 프론트엔드 빌드 아티팩트
    ├── public/               # 🎨 정적 리소스 및 파비콘
    └── src/                  # 🧩 React 프론트엔드 및 백엔드 코어 모듈
        ├── agents/           # Gemini 3.5 Flash 에이전트 클라이언트 (geminiAgent.js)
        ├── prompts/          # 프롬프트 단일 관리 모듈 (agentPrompts.js)
        ├── tools/            # GCP BigQuery, GCS, Dataplex 도구 (gcpTools.js)
        ├── components/       # React UI 컴포넌트 모음
        ├── lib/              # 유틸리티 함수
        ├── assets/           # 이미지 및 에셋
        ├── server.js         # Express API 게이트웨이 서버 본체
        ├── App.jsx           # React 메인 애플리케이션
        ├── App.css           # 컴포넌트 스타일시트
        ├── index.css         # 글로벌 디자인 토큰
        └── main.jsx          # React 렌더링 진입점
```

---

## 🚀 로컬 실행 방법 (Quick Start)

### 1. 패키지 설치 및 빌드
```bash
# srcs 폴더로 이동 후 의존성 설치 및 프로덕션 빌드
cd srcs
npm install
npm run build
```

### 2. 백엔드 및 웹 서버 구동
```bash
# srcs 폴더 내에서 단일 포트(3003)로 API Gateway 및 웹 UI 동시 구동
node server.js

# 또는 자동 재기동 샌티널 구동
bash start_server.sh
```
* **로컬 웹 접속 주소**: [http://localhost:3003/](http://localhost:3003/)

---

## 📜 라이선스 및 이용 정책 (License & Terms of Use)

본 프로젝트는 **[PolyForm Noncommercial License 1.0.0](LICENSE)** 하에 배포 및 관리됩니다.

### ✅ 비영리 목적 허용 범위 (Permitted Noncommercial Use)
- **개인 학습 및 학술 연구**: 학생, 연구원, 개발자의 개인 학습, 연구, 비영리 실험 및 테스트 목적의 코드 활용과 복제는 자유롭게 허용됩니다.
- **비영리 단체 및 교육 기관**: 공공 연구기관, 비영리 교육기관의 비영리 학술 프로젝트 활용이 허용됩니다.
- **템플릿 및 아키텍처 학습**: OKF v0.2 및 LLM-Wiki 온톨로지 참조 구현체로서의 학습 및 비영리 프로토타이핑이 가능합니다.

### 🚫 상업적 이용 엄격 금지 (Commercial Use Strictly Prohibited)
- **상용 서비스 탑재 및 유료 호스팅**: 본 소프트웨어 또는 그 파생 저작물을 유료 서비스, 상용 SaaS 솔루션, 상업용 클라우드 제품 등에 탑재하거나 호스팅하는 행위는 엄격히 금지됩니다.
- **영리 기업 내 프로덕션 배포**: 영리 기업의 사내 상용 업무 시스템 또는 영리 목적의 데이터 파이프라인에 무단 도입 및 사용하는 것은 제한됩니다.
- **재라이선싱 및 판매**: 본 소프트웨어 코드 및 파생 결과물을 제3자에게 유상 판매, 서브라이선스 발행, 상업적 번들링하는 행위는 금지됩니다.

### 💼 상업용 라이선스 문의 (Commercial Inquiries)
기업 내 상용 시스템 도입, 프로덕션 상업적 연동 또는 별도의 상용 라이선스가 필요한 경우 아래 저작권자에게 문의하여 주시기 바랍니다.
* **저작권자 / 유지관리자**: `seanjung` (<seanjung@google.com>)
* **라이선스 전문 확인**: [`LICENSE`](./LICENSE)

