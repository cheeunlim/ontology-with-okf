# 🎨 Design System & UI/UX Guidelines: Enterprise Agent Platform

본 문서는 **Enterprise Agent Evolution Studio & OKF Graph Platform**의 UI 디자인 철학, 글로벌 5대 메인 탭 메뉴 구조, 컬러 시스템, 컴포넌트 규격을 정의합니다.

---

## 1. 🌐 글로벌 5대 메인 탭 메뉴 구조 (Global Navigation Bar)

1. **🤖 1. Agent Evolution Studio (메인 최상위 뷰어)**:
   - 사용자가 시작하고 도착하는 메인 대시보드.
   - 4단계 에이전트 답변 진화 타임라인(Vanilla RAG ➔ OKF ➔ Data Graph ➔ Refined Feedback).

2. **📄 2. OKF Knowledge Store**:
   - OKF 3계층(`01_summary`, `02_entities`, `03_concepts`) 문서 및 GitHub OKF 스펙 viewer/editor.

3. **⚙️ 3. BigQuery & Spanner Graph**:
   - BigQuery Property Graph DDL 및 Spanner Graph DDL visualizer.

4. **🎙️ 4. Ingestion & Interview Feedback (부속 도구)**:
   - 녹음 인터뷰 / CS 음성 캡처 (Autopilot) 및 현업 예외 규칙 피드백 주입 도구.

5. **📊 5. Provenance & Tokenomics**:
   - 토크노믹스(토큰 -76% 절감), 환각율 0% 및 인용 근거(Citation) 감사 추적 대시보드.

---

## 2. 🎨 컬러 팔레트 & 토큰 (Design Tokens)

- **Background**: Warm Cream `#FAF8F5`, Dark Canvas `#1E1E1E`
- **Primary Accent**: Amber-600 `#D97706` (OKF & Agent Highlights), Blue-600 `#2563EB` (Data Graph)
- **Status Indicators**:
  - Stage 1: Red/Orange `#EF4444` (Unstructured / High Hallucination)
  - Stage 2: Amber `#F59E0B` (OKF Rules Injected)
  - Stage 3: Indigo `#6366F1` (Physical Data Graph Bound)
  - Stage 4: Emerald `#10B981` (Refined Feedback & 100% Citation)
