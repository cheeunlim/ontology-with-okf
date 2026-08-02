# ⚙️ [TASK-004] Graph Ontology Builder Implementation

## 1. Task 개요 & Epic 매핑
* **Task ID**: `TASK-004`
* **연계 Epic**: [`EPIC-004` (Graph Ontology Builder)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/03_epics/EPIC-004_GRAPH_ONTOLOGY_BUILDER.md)
* **상태**: `Completed`
* **담당 컴포넌트**: `src/server.js`, `src/prompts/agentPrompts.js`, `src/App.jsx`

---

## 2. 세부 구현 내역
1. **Property Graph DDL 생성 엔진**:
   - `getGraphDesignPrompt` 및 `getDatasetGraphPrompt`를 통한 BigQuery/Spanner 표준 Graph DDL 도출.
2. **예약어 백틱 표준화**:
   - SQL/GQL 예약어(`Order`, `User` 등) 백틱 이스케이프 강제 검증.
3. **그래프 UI 컴포넌트**:
   - 노드 및 엣지 선택 시 관련 OKF 위키와 물리 DDL 상호 팝업 지원.

---

## 3. 검증 결과 로그
* **검증 대상**: `seanjung-poc.thelook_ecommerce.thelook_graph`
* **검증 결과**: `NODE (User, Product, Order)` 및 `EDGE (Placed, Contains, Ships)` DDL 생성 및 시각화 검증 완료.
