# ⚙️ [TASK-007] OKF v0.2 Conformance Validator & HITL Workflow Implementation

## 1. Task 개요 & Epic 매핑
* **Task ID**: `TASK-007`
* **연계 Epic**: [`EPIC-007` (OKF v0.2 Conformance, Attestation & Human-in-the-Loop Governance)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/03_epics/EPIC-007_OKF_V02_CONFORMANCE_GOVERNANCE.md)
* **상태**: `Completed`
* **담당 컴포넌트**: `srcs/src/server.js` (`/api/okf/validate-bundle`, `/api/verify-okf`), `srcs/src/tools/okfValidator.js`

---

## 2. 세부 구현 내역
1. OKF v0.2 정적 린터 알고리즘 및 API 라우트 개발.
2. UniversalMarkdownViewer UI 내 4대 유효기간 프리셋(1년/3년/영구/직접) 라디오 바 및 단일 [검토 및 승인] 버튼 구축.
3. 디지털 서명(`verified`) 및 `stale_after` GCS 영구 저장.

---

## 3. 검증 결과 로그
* **결과**: `orders`, `users` OKF 문서 적합성 린팅 및 1년 프리셋 기반 승인 서명 저장 검증 완료.
