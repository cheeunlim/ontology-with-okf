# 🎨 [DESIGN SYSTEM] UI/UX Guidelines & Component Standards (`DESIGN.md`)

본 문서는 **OKF Omni (Enterprise Ontology Integration Platform)**의 전사 UI/UX 디자인 철학, 글로벌 5대 메인 탭 메뉴 구조, 디자인 토큰, 컴포넌트 일관성 수칙 및 변경 이력을 정의합니다.

본 문서는 [`prod.md`](./prod.md)의 하위 핵심 디자인 철학 문서로서, 프론트엔드 UI/UX와 관련된 모든 시각적·기능적 표준을 관리합니다.

---

## 1. 🌐 글로벌 헤더 및 5대 메인 탭 메뉴 구조 (Global Header & Navigation)

### ① 상단 글로벌 헤더 & OKF version 0.2 표준 규격 배지 (Header Brand & Spec Indicator)
- **로고 & 버전 배지**:
  - `OKF Omni` 로고 타이틀 바로 우측에 Google Cloud 공식 OKF version 0.2 규격 적용 상태를 알리는 인디케이터 배지(**`OKF version 0.2`**)를 상시 노출.
  - 배지 스타일: Soft Blue Accent (`#eff6ff`), Border (`#bfdbfe`), Text (`#1d4ed8`), 활성 블루 닷 (`#2563eb`).
  - 우측 유틸리티: 전사 한/영 언어 스위치 토글 (🇰🇷 KR / 🇺🇸 EN).

### ② 글로벌 5대 메인 탭 메뉴 구조
1. **🤖 1. Agent Evolution Studio (메인 최상위 뷰어)**:
   - 사용자가 시작하고 도착하는 메인 대시보드 및 지능형 챗 인터페이스.
   - 4단계 에이전트 답변 진화 타임라인(Vanilla RAG ➔ OKF ➔ Data Graph ➔ Refined Feedback) 비교 렌더링.
   - 우측 AI 생각의 흐름(Thoughts), 생성 쿼리(GQL/SQL), 지식 패시지 인용(Citations) 실시간 추적 패널.

2. **📄 2. OKF Knowledge Store**:
   - Google Cloud OKF 3계층(`01_summary`, `02_entities`, `03_concepts`) 문서 뷰어 및 마크다운 편집기.
   - GitHub OKF 공식 스펙과의 실시간 대조 및 자동 번역/동기화 뷰어.

3. **⚙️ 3. BigQuery & Spanner Graph**:
   - BigQuery Property Graph DDL 및 Google Cloud Spanner Graph DDL 시각화 캔버스.
   - 물리적 RDB 외래키(FK) 및 온톨로지 에지(Edge) 네트워크 다이어그램 렌더링.

4. **🎙️ 4. Ingestion & Interview Feedback (지식 주입 및 피드백)**:
   - 비정형 PDF 업무 문서 및 인터뷰/CS 음성 텍스트 자동 3계층 위키 해체 주입기.
   - 현업 예외 규칙 수기 주입 및 위키 지식베이스 실시간 갱신 도구.

5. **📊 5. Provenance & Tokenomics**:
   - 프롬프트 토큰 절감률(최대 -76%), 환각율 0% 및 인용 근거(Citation Backlinks) 전수 감사 대시보드.
   - Dataplex Aspects 푸시 및 메타데이터 카탈로그 상태 실시간 모니터링.

---

## 2. 🎨 디자인 토큰 및 컬러 팔레트 (Design Tokens)

* **배경 테마 (Backgrounds)**:
  * Warm Cream: `#FAF8F5` (소프트 라이트 모드)
  * Dark Canvas: `#1E1E1E` (전문가용 다크 모드)
  * Card Surface: `#2D3139` / `#FFFFFF`
* **브랜드 액센트 (Primary Accents)**:
  * Amber Gold: `#D97706` / `#F59E0B` (OKF 지식 베이스 및 에이전트 하이라이트)
  * Deep Blue: `#2563EB` / `#3B82F6` (물리 데이터 그래프 및 SQL 파이프라인)
  * Spec Blue Pill: `#eff6ff` / `#bfdbfe` (OKF version 0.2 상단 헤더 규격 배지)
* **진화 단계별 상태 인디케이터 (Evolution Stages)**:
  * Stage 1 (Vanilla RAG): `#EF4444` (비정형 문서 단순 검색 / 환각 가능성)
  * Stage 2 (OKF Injected): `#F59E0B` (비즈니스 규칙 및 용어 사전 주입)
  * Stage 3 (Data Graph Bound): `#6366F1` (BigQuery Property Graph 물리 스키마 결합)
  * Stage 4 (Refined Feedback): `#10B981` (현업 피드백 반영 및 100% 검증 근거 제시)

---

## 3. 🧩 UI 통일성 및 인터랙션 패턴 수칙 (Consistency Principles)

1. **전체 화면 네비게이션 체크**:
   - 신규 기능을 추가하거나 레이아웃을 수정할 때 전체 화면을 네비게이션하여 다음 요소가 일관되게 적용되었는지 점검합니다:
     - **버튼 스타일 및 계층**: Primary (Amber/Blue Gradient), Secondary (Outline Slate), Danger (Soft Crimson), Ghost (Subtle Gray).
     - **공통 기능 버튼**: 새로고침(Refresh), 닫기(Close), 확장(Expand), 복사(Copy) 등의 아이콘 및 위치 규격.
     - **카드/모달 헤더 및 여백**: 모서리 곡률(`border-radius: 12px`), 내부 패딩(`p-4` ~ `p-6`), 그림자(`box-shadow: 0 4px 20px rgba(0,0,0,0.15)`).
2. **프론트엔드 안전 렌더링 수칙 (백화 현상 방지)**:
   - 미정의 컴포넌트 직접 호출로 인한 런타임 크래시(`ReferenceError`)를 원천 차단합니다.
   - 모든 마크다운과 머메이드 다이어그램은 검증된 `MarkdownRenderer` 컴포넌트를 사용하고, 안전한 널 체크(`activeGraph?.ddl || ''`)를 적용합니다.

3. **통합 마크다운 뷰어 디자인 표준 (Universal Markdown Viewer Standard)**:
   - **적용 대상**: `OKF Knowledge Store`, `Knowledge Enrichment`, `GCS Bundle Explorer`, `GitHub Explorer` 등 플랫폼 내 모든 마크다운(`.md`) 파일 및 명세 뷰어.
   - **상단 통합 제어 바**:
     - 좌측: 문서 파일명/타이틀 + GCS/GitHub 경로 + (변경점 감지 시 `✨ +N lines diff` 배지).
     - 우측 **2-Mode 세그먼트 토글**:
       - `👁️ Viewer`: 기본 마크다운 렌더링 모드 (깔끔한 화이트 배경 + YAML 사양 카드 + 표 서식 + 검정 코드블록)
       - `💻 RAW Code`: 마크다운 RAW 소스코드 모드 (검정 테마 배경, 이번 액션으로 추가·보강된 변경 라인만 자동으로 `+` 초록색 하이라이트 표시)
     - 우측 유틸리티: `📋 Copy` 클립보드 복사 버튼 (`✓ Copied!` 피드백).
   - **본문 렌더링 표준 (Viewer Mode)**:
     - **배경**: Clean White (`#ffffff`), 텍스트: Slate (`#334155`), 줄간격 `1.65`.
     - **YAML Frontmatter**: 최상단 사양 카드 (`#f8fafc` 배경, `#e2e8f0` 경계선, 모노스페이스 메타데이터 블록).
     - **마크다운 테이블**: 정형 HTML 표 (`<th>` `#f8fafc` 헤더, `<td>` `#ffffff`/`#fafafa` 교차 행, 얇은 슬레이트 경계선).
     - **코드 블록 (Dark Code Blocks)**: 다크 테마 (`#0f172a` 배경, `#e2e8f0` 텍스트, 언어 배지, 라운드 코너 `8px`).
   - **RAW Code Mode (Integrated Diff) 표준**:
     - 다크 터미널 테마 (`#0b1120` 배경, `#1e293b` 경계선).
     - 이전 버전 대비 이번 프로세스/액션(Enrichment, Verification 등)에서 실제로 추가·보강된 라인만 정확하게 에메랄드 그린(`+`, `#064e3b` 배경, `#6ee7b7` 텍스트, `borderLeft: 3px solid #10b981`)으로 강조 표시.
     - 이전 버전이 없거나 변경점이 없는 경우 정상 RAW 소스코드(`#cbd5e1`)로 렌더링(전체 녹색 표시 방지).

---

## 4. 📝 디자인 변경 이력 (Design Change Log)

| 일자 | 버전 | 변경 요약 | 반영 문서/컴포넌트 |
| :--- | :--- | :--- | :--- |
| **2026-07-28** | `v1.0.0` | 엔터프라이즈 에이전트 플랫폼 초기 디자인 시스템 구축 | `src/index.css`, `src/App.css` |
| **2026-07-29** | `v1.5.0` | 5대 글로벌 탭 네비게이션 구조 및 4단계 진화 타임라인 정의 | `src/App.jsx`, `DESIGN.md` |
| **2026-07-30** | `v2.0.0` | OKF Knowledge Store 및 Property Graph 뷰어 디자인 토큰 통합 | `src/components/`, `DESIGN.md` |
| **2026-07-31** | `v2.5.0` | 실시간 생각 흐름(Thoughts) 패널 및 피드백 에디터 UI 일관성 보강 | `src/App.jsx`, `DESIGN.md` |
| **2026-08-02** | `v3.0.0` | `prod.md` 기반 문서/소스 완전 분리 체계에 맞춘 디자인 가이드 전면 개편 | `DESIGN.md`, `prod.md` |
| **2026-08-02** | `v3.1.0` | 화면 최상단 헤더에 OKF v0.2 공식 규격 적용 인디케이터 배지 디자인 탑재 | `src/App.jsx`, `DESIGN.md` |
| **2026-08-02** | `v3.2.0` | OKF 검토 승인(Approve) 시 Verified (Stable) 배지 및 서명·태그 실시간 동기화 보강 | `src/App.jsx`, `src/server.js`, `DESIGN.md` |
| **2026-08-02** | `v3.3.0` | 글로벌 상단 헤더 규격 배지 레이블을 `OKF version 0.2`로 직관적 갱신 | `src/App.jsx`, `DESIGN.md` |
| **2026-08-02** | `v3.4.0` | 전사 마크다운 뷰어 통일 (화이트 본문, 다크 코드블록, 그린 diff 라인, 3-Mode 토글 탑재) | `src/App.jsx`, `DESIGN.md`, `prod.md` |
| **2026-08-02** | `v3.5.0` | 뷰어를 [Viewer / RAW Code] 2개 토글로 간소화하고, RAW Code 모드 내 실질 변경분만 자동 Green Diff로 통합 | `src/App.jsx`, `DESIGN.md` |
