# ⚙️ [TASK-002] BigQuery Harvester Implementation

## 1. Task 개요 & Epic 매핑
* **Task ID**: `TASK-002`
* **연계 Epic**: [`EPIC-002` (BigQuery Physical Schema OKF Harvester)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/03_epics/EPIC-002_BIGQUERY_OKF_HARVESTER.md)
* **상태**: `Completed`
* **담당 컴포넌트**: `srcs/src/server.js` (`/api/datasets`, `/api/tables`), `srcs/src/tools/gcpTools.js`

---

## 2. 세부 구현 내역
1. BigQuery API 연동 및 데이터셋/테이블/뷰 메타데이터 하베스팅.
2. VIEW 개체 400 에러 방지를 위한 Direct SQL Fallback 예외 처리 적용.
3. OKF v0.2 `generated`, `sources`, `status` 프론트매터 자동 생성.
4. Dataplex Scan / LLM 추론 릴레이션 및 추천 Property Graph DB DDL을 Glossary 탭에 연결하고, DDL 복사 및 원클릭 BigQuery 그래프 생성 실행(`POST /api/graph/deploy-custom-graph`) 구현.

---

## 3. 검증 결과 로그
* **결과**: `seanjung-poc.thelook_ecommerce` 데이터셋 수집, OKF 마크다운 직렬화 및 Dataplex 추천 Property Graph DB DDL 표출/원클릭 생성 배포 기능 구현 완료.
