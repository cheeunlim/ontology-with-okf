# 🏛️ [EPIC-006] Dataplex Catalog Synchronization & OKF v0.2 Aspect Mapping

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-006`
* **대칭 Task**: [`TASK-006` (Dataplex Catalog Sync)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/04_tasks/TASK-006_DATAPLEX_CATALOG_SYNC.md)
* **목적**: OKF 플랫폼에서 보강된 비즈니스 용어, 도메인 분류, 품질 점수 및 위키 메타데이터를 **최신 Google Cloud OKF v0.2 표준 Aspect 스키마(`okf-aspect.json`)** 기반으로 Google Cloud Dataplex Universal Catalog에 자동 푸시(Push) 및 동기화합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/AGENT.md)
* **참조 규격**: [`references/knowledge-catalog/toolbox/mdcode/demo/okf/okf-aspect.json`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/references/knowledge-catalog/toolbox/mdcode/demo/okf/okf-aspect.json)

---

## 2. OKF v0.2 기반 Dataplex Aspect 변경 사항 (Requirements Diff)

1. **OKF v0.2 Aspect Type 표준 규격화**:
   - `okf_type`: OKF 문서 유형 (예: `BigQuery Dataset`, `Table`, `Attested Computation`).
   - `generated`: `{ by: "string", at: "string" }` (생성 주체 및 ISO 8601 타임스탬프).
   - `sources`: `[{ id: "string", resource: "string", title: "string" }]` (정형 출처 및 백링크 목록).
2. **Dataplex Push API 동기화 (`/api/dataplex/push`)**:
   - GCS 및 로컬의 OKF v0.2 메타데이터를 파싱하여 Dataplex Entry에 `okf` Aspect 타입으로 첨부.
3. **거버넌스 및 토크노믹스 대시보드 연동**:
   - 프론트엔드 `Provenance & Tokenomics` 탭에서 동기화 상태 및 토큰 절감률 실시간 표시.

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] OKF v0.2 Aspect 스키마 규격을 만족하는 페이로드가 Dataplex Entry로 정상 푸시될 것.
- [x] 거버넌스 탭에서 동기화 성공 상태 및 메타데이터가 정상 표시될 것.
