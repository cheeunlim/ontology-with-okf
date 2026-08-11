# 📥 [EPIC-002] BigQuery Physical Schema OKF Harvester

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-002`
* **대칭 Task**: [`TASK-002` (BigQuery Harvester)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/04_tasks/TASK-002_BIGQUERY_OKF_HARVESTER.md)
* **목적**: Google Cloud BigQuery 물리 데이터셋, 테이블, 뷰(VIEW) 개체의 스키마 메타데이터를 정밀 수집하고, **OKF v0.2 표준 프론트매터(YAML)** 및 기초 지식 문서로 자동 변환하는 하베스팅(Harvesting) 파이프라인을 운영합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/AGENT.md)

---

## 2. 주요 요구사항 및 구현 범위
1. **BigQuery 개체 수집 및 VIEW 방어 프로그래밍**:
   - `GET /api/datasets`, `GET /api/tables` 라우트를 통한 스키마 하베스팅.
   - VIEW 타입 개체 수집 시 `400 Bad Request` 에러를 방지하는 Direct SQL Fallback 예외 처리.
2. **OKF v0.2 프론트매터 자동 직렬화**:
   - `generated: { by: "reference_agent/gemini-3.5-flash", at: "ISO8601" }`
   - `sources: [{ id, resource, title }]` 및 본문 각주(`[^id]`) 결합.
   - `status: "draft"` (미검증 상태 유지).
3. **Dataplex Scan Graph DB 스키마 뷰어 및 그래프 생성 파이프라인**:
   - Dataplex Scan / LLM 추론 결과 릴레이션 및 추천 Property Graph DB DDL을 Glossary 탭에 표출.
   - DDL 복사 및 원클릭 BigQuery 그래프 생성 실행(`POST /api/graph/deploy-custom-graph`) 지원.

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] BigQuery 데이터셋 내 테이블/뷰 메타데이터가 OKF v0.2 규격 마크다운으로 자동 수집될 것.
- [x] VIEW 개체 조회 시 백엔드 붕괴 없이 안전 렌더링될 것.
- [x] Glossary 탭에서 Dataplex 추천 Graph DB 스키마 표출, DDL 복사 및 BigQuery 배포 생성이 정상 작동할 것.
