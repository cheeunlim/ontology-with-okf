# 🔗 [EPIC-004] Cross-Domain OKF Knowledge Enrichment

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-004`
* **대칭 Task**: [`TASK-004` (Cross-Domain OKF Enrichment)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/04_tasks/TASK-004_CROSS_DOMAIN_OKF_ENRICHMENT.md)
* **목적**: BigQuery 물리 데이터셋 스키마(테이블/컬럼)와 위키/비정형 문서에서 추출된 비즈니스 규칙 및 개념(`03_concepts/`)을 결합하여, **BigQuery 물리 테이블 설명과 컬럼 주석, 업무 예외 지침 및 데이터 품질 힌트를 상호 보강(Enrichment)**하는 핵심 파이프라인을 구동합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/AGENT.md)

---

## 2. 주요 요구사항 및 구현 범위
1. **물리 스키마와 위키 지식 결합 (Metadata Enrichment)**:
   - `getEnrichmentPrompt`를 사용하여 테이블/컬럼 스키마와 위키 문서 내 도메인 지식(환불 기한, VIP 등급 기준, 배송 프로세스 등)을 매핑.
   - 한국어 비즈니스 설명, 데이터 품질 힌트, 엣지 케이스 처리 지침을 메타데이터에 자동 주입.
2. **이중 백링크 온톨로지 구성**:
   - 보강된 물리 테이블 문서(`tables/<table_name>.md`)와 비즈니스 위키 문서(`concepts/<concept_name>.md`) 간 양방향 상호 백링크(`[[link]]`) 주입.
3. **GCS 저장 파이프라인**:
   - 보강 결과물을 GCS 버킷(`okf-omni-[project-id]`)에 저장하고 위키 저장소 동기화.

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] 비정형 문서 및 위키 정책 추가 시 BigQuery 테이블의 OKF 마크다운에 비즈니스 지식이 보강(Enrich)될 것.
- [x] 보강된 테이블 메타데이터에 OKF v0.2 `generated`, `sources` 프론트매터 및 상호 백링크가 반영될 것.
