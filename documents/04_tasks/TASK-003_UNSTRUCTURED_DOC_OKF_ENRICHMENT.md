# ⚙️ [TASK-003] Unstructured Business Document & OKF Knowledge Enrichment Implementation

## 1. Task 개요 & Epic 매핑
* **Task ID**: `TASK-003`
* **연계 Epic**: [`EPIC-003` (Document OKF Enrichment)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/03_epics/EPIC-003_UNSTRUCTURED_DOC_OKF_ENRICHMENT.md)
* **상태**: `Completed`
* **담당 컴포넌트**: `src/server.js` (`/api/enrich-metadata`), `src/prompts/agentPrompts.js` (`getEnrichmentPrompt`), `src/tools/gcpTools.js`

---

## 2. 세부 구현 내역
1. **문서 기반 지식 보강 파이프라인**:
   - `getEnrichmentPrompt`를 사용하여 업로드된 비정형 문서의 정책 내용을 BigQuery 테이블 스키마와 결합하여 보강된 한국어 비즈니스 설명 도출.
2. **OKF v0.2 표준 규격 적용**:
   - `generated: { by, at }`, `sources: [{ id, resource, title }]` 프론트매터 자동 생성.
3. **GCS 저장 및 백링크 결합**:
   - GCS 버킷 내 `tables/<table_name>.md`로 자동 업로드 및 테이블 간 상호 참조 백링크(`[[table.md]]`) 주입.

---

## 3. 검증 결과 로그
* **검증 시나리오**: `seanjung-poc.thelook_ecommerce` 테이블에 `[가상문서] The Look e-commerce 이용약관 및 취소_반품_교환 정책.pdf` 지식 주입 및 보강.
* **결과**: `orders`, `order_items` 테이블에 반품/취소 정책 비즈니스 룰 정상 보강 및 OKF v0.2 마크다운 생성 확인 완료.
