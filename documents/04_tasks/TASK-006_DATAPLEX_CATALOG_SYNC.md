# ⚙️ [TASK-006] Dataplex Knowledge Catalog Sync (OKF v0.2 Aspect)

## 1. Task 개요 & Epic 매핑
* **Task ID**: `TASK-006`
* **연계 Epic**: [`EPIC-006` (Dataplex Catalog Sync)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/03_epics/EPIC-006_DATAPLEX_CATALOG_SYNC.md)
* **상태**: `Completed`
* **담당 컴포넌트**: `src/server.js` (`/api/dataplex/push`), `src/tools/gcpTools.js`, `src/App.jsx`
* **참조 규격**: [`references/knowledge-catalog/toolbox/mdcode/demo/okf/okf-aspect.json`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/references/knowledge-catalog/toolbox/mdcode/demo/okf/okf-aspect.json)

---

## 2. 세부 구현 내역
1. **OKF v0.2 Aspect 페이로드 빌더**:
   - `okf_type`, `generated: { by, at }`, `sources` 레코드 구조 자동 변환.
2. **Dataplex Aspect 동기화 핸들러**:
   - Google Cloud SDK CLI 및 Dataplex Entry Aspect API 호출.
3. **토크노믹스 대시보드 UI 연계**:
   - 탭 5(`Provenance & Tokenomics`)에 OKF v0.2 Aspect 동기화 이력 표시.

---

## 3. 검증 결과 로그
* **검증 대상**: `seanjung-poc.dataplex.thelook_catalog`
* **동기화 결과**: `okf_ontology_aspect` (v0.2 규격) 엔트리 생성 및 프론트엔드 연동 확인 완료.
