# ⚙️ [TASK-005] Dataset Graph DB Synthesizer Agent Implementation

## 1. Task 개요 & Epic 매핑
* **Task ID**: `TASK-005`
* **연계 Epic**: [`EPIC-005` (Dataset-Level Autonomous Graph DB Synthesizer Agent)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/03_epics/EPIC-005_DATASET_GRAPH_DB_SYNTHESIZER_AGENT.md)
* **상태**: `Completed` (설계 및 구현 완료)
* **담당 컴포넌트**: `srcs/src/server.js` (`/api/graph/synthesize-dataset`, `/api/graph/deploy-custom-graph`), `srcs/src/prompts/agentPrompts.js` (`getDatasetGraphSynthesizerPrompt`), `srcs/src/App.jsx`

---

## 2. 세부 구현 내용

1. **상단 1구역: 기존 BigQuery 물리 그래프 파싱 및 DDL 뷰어**:
   - `INFORMATION_SCHEMA.PROPERTY_GRAPHS` 조회를 통해 수집된 DDL 파싱.
   - 노드 레이블 (`User`, `Order`, `Product`, `Event`) 및 에지 릴레이션 (`Placed`, `OrderedItem`, `Triggered`) 카드 렌더링.
   - BigQuery DDL Statement 마크다운 코드블록 뷰어 및 Copy DDL / Diagram View 토글 조작 제공.

2. **하단 2구역: 🤖 AI 커스텀 프로퍼티 그래프 자율 합성기**:
   - 데이터셋 내 모든 테이블 OKF, 3계층 위키 문서 전체 및 빈출 SQL 조인 패턴 통합 수집.
   - `gemini-3.5-flash` 모델을 통한 복합 에지/노드 설계 및 BigQuery GQL 예약어 백틱(\`) 자동 감싸기 적용 DDL 합성.
   - 2종 시맨틱 GQL(`GRAPH_TABLE`) 쿼리 템플릿 제공.
   - 원클릭 [BigQuery 배포] 및 GCS 저장 기능 구현.

---

## 3. 검증 결과
* **결과**: `seanjung-poc.thelook_ecommerce` 데이터셋 범위에서 기존 BQ 물리 그래프 파싱(상단 1구역)과 지식 수집 기반 `okf_custom_synthesized_graph` 자율 합성(하단 2구역) 2단 레이아웃 정상 동작 검증 완료.
