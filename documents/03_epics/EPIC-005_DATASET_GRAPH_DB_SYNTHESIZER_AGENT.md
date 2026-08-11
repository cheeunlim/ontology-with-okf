# 🕸️ [EPIC-005] Dataset-Level Autonomous Graph DB Synthesizer Agent

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-005`
* **대칭 Task**: [`TASK-005` (Dataset Graph DB Synthesizer Agent)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/04_tasks/TASK-005_DATASET_GRAPH_DB_SYNTHESIZER_AGENT.md)
* **목적**: 기존 BigQuery에 이미 생성되어 있는 물리 프로퍼티 그래프(`INFORMATION_SCHEMA.PROPERTY_GRAPHS`)의 DDL 파싱 및 실물 온톨로지 구조 조회를 상단 1구역으로 상시 유지(Image 1)하고, 그 하단 2구역에 **① 전 대상 테이블의 OKF v0.2 스키마 메타데이터**, **② 연결된 모든 비즈니스 위키 문서(Summary, Entities, Concepts)**, 그리고 **③ 빈출 SQL 조인 패턴**을 전수 수집·분석하여 전사 도메인 지식이 완벽하게 융합된 **최적의 커스텀 프로퍼티 그래프(AI-Synthesized Custom Property Graph DDL & GQL)**를 자율 설계하고 원클릭으로 BigQuery에 배포하는 2단 통합 UI 및 AI 에이전트 파이프라인(Image 2)을 구축합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/AGENT.md), [`DESIGN.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/DESIGN.md)

---

## 2. 그래프 탭 화면 2단 레이아웃 아키텍처 (Screen & Layout Specification)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 📌 [상단 1구역: 기존 BigQuery 물리 그래프 파싱 및 DDL 뷰어 (Existing Graph Inspection)]    │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 🕸️ Property Graphs in Dataset (theLookCommerce) 목록 테이블                       │  │
│  │  • Graph ID: thelookgraph3 | Creation Time: 7/1/2026 | Type: PROPERTY GRAPH       │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┬───────────────────────────────────────┐  │
│  │ 📌 DDL 실시간 파싱 요약                   │ 📜 BigQuery DDL Statement             │  │
│  │  • 🎯 비즈니스 목적 및 용도 파싱 서술문     │  • [📋 Copy DDL] [🎨 Diagram View]    │  │
│  │  • 🔵 노드 레이블 (User, Order, Product)   │  • CREATE PROPERTY GRAPH `...`       │  │
│  │  • 🟣 에지 릴레이션 (Placed, OrderedItem)  │    NODE TABLES ( ... ) EDGE TABLES (...)│  │
│  └───────────────────────────────────────────┴───────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🚀 [하단 2구역: 🤖 AI 커스텀 프로퍼티 그래프 자율 합성기 (Custom Synthesizer Agent)]     │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 🤖 [EPIC-005] AI 커스텀 프로퍼티 그래프 자율 합성기       [🚀 1-Click 커스텀 DB 자율 합성] │  │
│  │ 📊 수집 지식 소스: 물리 OKF 테이블 5개 | 연결 위키 문서 3개 | 빈출 SQL 패턴 3개            │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┬───────────────────────────────────────┐  │
│  │ 📜 합성된 BigQuery Property Graph DDL     │ ⚡ 대표 비즈니스 질의용 GQL 템플릿     │  │
│  │  • CREATE OR REPLACE PROPERTY GRAPH `...` │  1. 고객별 최다 구매 상품 탐색        │  │
│  │  • [🚀 BigQuery에 커스텀 그래프 실시간 배포]│     GRAPH_TABLE( ... MATCH ... )      │  │
│  │                                           │  2. 이탈 가능 고객 예외 정책 매핑      │  │
│  └───────────────────────────────────────────┴───────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 세부 요구사항 및 기능 명세 (Specification)

### ① [상단 1구역] 기존 BigQuery 물리 그래프 파싱 및 DDL 뷰어
* **물리 그래프 목록 및 DDL 파싱**:
  - `GET /api/dataset-graphs?projectId={projectId}&datasetId={datasetId}` 호출.
  - 선택된 물리 그래프(예: `thelookgraph3`)의 DDL을 분석하여 **노드 레이블 (Node Tables)**과 **에지 릴레이션 (Edge Tables & Relationships)**을 실시간 파싱 및 카드로 렌더링.
  - 비즈니스 용도 및 목적 서술문 자동 추출 표시.
  - 우측 2컬럼에 `CREATE PROPERTY GRAPH` 마크다운 DDL 스테이트먼트 뷰어 및 `🎨 Diagram View` 토글 조작 제공.

### ② [하단 2구역] AI 커스텀 그래프 DDL 자율 합성기 (Custom Synthesizer)
* **삼중 지식 전수 수집 및 분석 (`POST /api/graph/synthesize-dataset`)**:
  1. **전 물리 테이블 OKF 메타데이터**: PK/FK 구조, 컬럼 타입, 비즈니스 설명.
  2. **연결된 전 위키 문서 스택**: `01_summary`, `02_entities`, `03_concepts` 위키에 정의된 비즈니스 룰, 전결 기준, 환불/배송 정책.
  3. **빈출 SQL 쿼리 로그**: 과거 실행된 다중 조인(Multi-hop JOIN) 구문에서 자주 함께 조회되는 핵심 외래키/조회 조건 축출.
* **GQL 백틱(\`) 규격 자동 적용 DDL 생성**:
  - BigQuery GQL 예약어 및 노드/에지 라벨(`User`, `Order`, `Placed`, `Contains`, `Product`, `RefundPolicy`)에 백틱(\`)을 엄격히 감싸 생성.
* **대표 비즈니스 질의용 GQL (`GRAPH_TABLE`) 템플릿 도출**:
  - 1. 고객별 최다 구매 상품 및 주문 상태 탐색
  - 2. 이탈 가능성이 높은 고객의 비즈니스 예외 환불 정책 매핑
* **원클릭 BigQuery 배포 및 GCS 보관 (`POST /api/graph/deploy-custom-graph`)**:
  - `🚀 BigQuery에 커스텀 그래프 실시간 배포` 버튼 클릭 시 BigQuery 개체 생성 및 GCS 버킷 보관.

---

## 4. 완료 기준 (Acceptance Criteria)
- [x] 기존 BQ 그래프 목록 파싱/조회(상단 1구역)와 AI 커스텀 그래프 자율 합성(하단 2구역)을 함께 유지하는 2단 화면 명세 수립.
- [x] OKF 스키마 + 위키 전체 + 빈출 SQL 패턴을 전수 합성하는 BigQuery GQL 표준 DDL 생성 에이전트 명세 확립.
- [x] GQL 백틱(\`) 감싸기 규칙 준수 DDL 및 GQL `GRAPH_TABLE` 샘플 쿼리 도출 명세 작성 완료.
- [x] 원클릭 BigQuery 배포 및 GCS DDL 저장 액션 명세 완료.
