# 📑 [EPIC-003] Unstructured Business Document & OKF Knowledge Enrichment

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-003`
* **대칭 Task**: [`TASK-003` (Document OKF Enrichment)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/04_tasks/TASK-003_UNSTRUCTURED_DOC_OKF_ENRICHMENT.md)
* **목적**: 기업 내 비정형 비즈니스 문서(약관 PDF, CS 가이드라인, 운영 매뉴얼)를 업로드/추가하여 **BigQuery 물리 테이블 설명과 컬럼 주석, 비즈니스 규칙 및 OKF v0.2 메타데이터를 상호 보강(Enrichment)**하는 실제 프로덕션 핵심 파이프라인을 운영합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/AGENT.md)
* **분리 원칙**: 순수 실험적 연구인 카파시(Karpathy)식 LLM-Wiki 해체/컴파일러 엔진은 독립된 별도 연구 에픽인 [`EPIC-007` (Experimental Karpathy LLM-Wiki)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/03_epics/EPIC-007_EXPERIMENTAL_KARPATHY_LLM_WIKI.md)로 완전히 분리되어 관리됩니다.

---

## 2. 주요 요구사항 및 구현 범위 (Production Enrichment Pipeline)

1. **비정형 문서 업로드 및 텍스트 파싱**:
   - 기업 정책 문서(PDF/TXT) 업로드 시 텍스트 및 핵심 도메인 규칙 추출.
2. **BigQuery 물리 테이블과의 상호 지식 보강 (Metadata Enrichment)**:
   - 문서 내 업무 정책(예: 환불 기한, VIP 등급 기준, 배송 프로세스)과 BigQuery 물리 테이블(`orders`, `users` 등)을 매핑.
   - `getEnrichmentPrompt`를 통해 테이블 설명, 컬럼 비즈니스 정의, 데이터 품질 힌트를 자동 보강.
3. **OKF v0.2 표준 지식 번들 직렬화**:
   - `generated: { by: "reference_agent/gemini-3.5-flash", at: "..." }`
   - `sources: [{ id, resource, title }]` 및 본문 각주(`[^id]`) 결합.
   - `status: "stable"`, `verified: { by, at }`
4. **GCS 영구 저장 및 백링크 결합**:
   - 보강된 OKF 마크다운 문서를 GCS 버킷(`okf-omni-[project-id]`)에 자동 업로드하고 상호 백링크(`[[table.md]]` ↔ `[[policy.md]]`) 주입.

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] 비정형 문서 추가 시 BigQuery 테이블의 OKF 마크다운에 비즈니스 지식이 정상 보강(Enrich)될 것.
- [x] 보강된 테이블 메타데이터에 OKF v0.2 `generated`, `sources` 프론트매터가 올바르게 주입될 것.
- [x] GCS 버킷에 보강 결과물이 정상 동기화될 것.
