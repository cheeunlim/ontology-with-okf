# 🕸️ [EPIC-010] Standalone Knowledge Catalog & Spanner Graph Pipeline Showcase (`/kc-spanner`)

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-010`
* **대칭 Task**: [`TASK-010` (KC & Spanner Graph Showcase)](../04_tasks/TASK-010_KC_SPANNER_GRAPH_SHOWCASE.md)
* **목적**: 기존 통합 데모 웹페이지(`/`)와 분리된 독립 쇼케이스 페이지(`/kc-spanner`)를 구축하여, 단일 **OKF v0.2 마크다운 명세서**가 어떻게 **① Google Cloud Knowledge Catalog (Dataplex Universal Catalog)**와 **② Google Cloud Spanner Graph (ISO GQL)** 두 곳으로 동시에 주입·컴파일되는지 직관적이고 간결한 3단 파이프라인 UI로 시연합니다.
* **상위 연계 문서**: [`prod.md`](../../prod.md), [`AGENT.md`](../../AGENT.md), [`Design.md`](../../Design.md)

---

## 2. 주요 요구사항 및 화면 구조
1. **독립 페이지 라우팅 (`/kc-spanner`)**:
   - `main.jsx` 내 `RootRouter`를 통해 `/kc-spanner` 독립 URL 및 메인 스튜디오 헤더의 `🕸️ KC & Spanner Demo ↗` 버튼으로 즉시 전환.
2. **3-Column 파이프라인 레이아웃 (Simpler, Less Text, High Clarity)**:
   - **Step 1 (Left — Unified OKF v0.2 Source)**:
     - 4개 클릭형 시맨틱 블록(`① YAML Frontmatter & Trust Tier`, `② Enriched Schema & Keys`, `③ Wiki Policy Backlink`, `④ Attested Computation`)과 `Raw .md` 토글 제공.
     - 블록 클릭 시 우측 Knowledge Catalog 및 Spanner Graph의 매핑 대상이 실시간 하이라이트됨.
   - **Step 2A (Middle — Google Cloud Knowledge Catalog Feed)**:
     - OKF 필드가 Dataplex `@bigquery` 엔트리 설명, `dataplex.overview` Aspect, `okf-governance` 커스텀 Aspect, Business Glossary로 매핑되는 과정 시각화 및 1-Click Push (`POST /api/kc-spanner/push-kc`).
   - **Step 2B (Right — Google Cloud Spanner Graph Feed)**:
     - 물리 테이블 노드(`User`, `Order`, `Product`)와 OKF 정책 노드(`RefundPolicy`, `VipTierRule`, `FulfillmentSLA`)의 결합 토폴로지 SVG 다이어그램.
     - `INTERLEAVE IN PARENT` 물리 DDL, `CREATE OR REPLACE PROPERTY GRAPH` DDL, 그리고 Spanner ISO GQL (`GRAPH ... MATCH ... RETURN ...`) 실행 결과 테이블 제공 (`POST /api/kc-spanner/deploy-spanner`, `POST /api/kc-spanner/synthesize`).

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] 기존 스튜디오(`/`)와 분리된 `/kc-spanner` 독립 페이지 및 양방향 헤더 전환 버튼 동작.
- [x] OKF v0.2 4대 블록 클릭 시 Knowledge Catalog Aspect 및 Spanner Graph 노드/에지 상호 하이라이트.
- [x] `gemini-3.5-flash` 기반 실시간 합성(`/api/kc-spanner/synthesize`) 및 Dataplex/Spanner 배포 API 검증 완료.
