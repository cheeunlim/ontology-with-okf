# 🕸️ [EPIC-004] Property Graph & Knowledge Ontology Integration

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-004`
* **대칭 Task**: [`TASK-004` (Graph Ontology Builder)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/04_tasks/TASK-004_GRAPH_ONTOLOGY_BUILDER.md)
* **목적**: BigQuery Property Graph DDL(`CREATE PROPERTY GRAPH`)과 Spanner Graph DDL을 자동 설계하고, 물리 테이블 노드와 비즈니스 위키 개념 간의 양방향 이중 온톨로지 네트워크를 생성 및 시각화합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/AGENT.md), [`DESIGN.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/DESIGN.md)

---

## 2. 주요 요구사항 및 구현 범위
1. **Property Graph DDL 자동 설계 (`/api/graph/design`)**:
   - `NODE TABLES` 및 `EDGE TABLES` 자동 추론.
   - BigQuery 예약어 백틱(\`) 강제 적용 규칙 준수 (`User`, `Order`, `Placed`, `Product` 등).
2. **이중 백링크 온톨로지 보강 (`/api/enrich-metadata`)**:
   - 물리 테이블(`tables/*.md`)과 비즈니스 규칙(`concepts/*.md`) 간 양방향 상호 참조(`[[link]]`) 주입.
3. **그래프 시각화 캔버스**:
   - Mermaid 다이어그램 기반 안전 렌더링(백화 현상 방지 널 체크).

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] BigQuery 표준 구문을 만족하는 Property Graph DDL이 정상 생성될 것.
- [x] 프론트엔드 `BigQuery & Spanner Graph` 탭에서 그래프 다이어그램이 렌더링될 것.
