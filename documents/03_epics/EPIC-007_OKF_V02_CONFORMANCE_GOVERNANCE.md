# 🛡️ [EPIC-007] OKF v0.2 Conformance, Attestation & Human-in-the-Loop Governance

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-007`
* **대칭 Task**: [`TASK-007` (OKF v0.2 Conformance Validator & HITL Workflow)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/04_tasks/TASK-007_OKF_V02_CONFORMANCE_GOVERNANCE.md)
* **목적**: Google Cloud OKF(Open Knowledge Format) v0.2 공식 레퍼런스 규격 준수 여부를 자동 감사(Automated Conformance Linting)하고, `stale_after` 유효기간 만료 감지, Attestation 증명 영수증(Receipt) 검증, 그리고 현업 데이터 스튜어드의 원클릭 디지털 서명 및 신뢰 등급 승격 워크플로우(Human-in-the-Loop Governance)를 확립합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/AGENT.md), [`DESIGN.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/DESIGN.md)

---

## 2. 주요 요구사항 및 구현 명세
1. **번들 적합성 자동 린터 (`POST /api/okf/validate-bundle`)**:
   - 필수 프론트매터 키(`type`), 위키 백링크 무결성, Provenance 각주 정합성 및 `stale_after` 신선도 만료 검사.
2. **Human-in-the-Loop 승인 & 4대 유효기간 프리셋 콘솔**:
   - 4대 유효기간 프리셋(1년, 3년, 영구, 직접지정) 기반 `stale_after` 원클릭 승인 (`POST /api/verify-okf`).
   - `status: stable` 승격 및 `verified: [{ by: "human:<user_id>", at: "ISO8601" }]` 서명 영구 기록.
3. **Attestation Receipt 검증 영수증 UI**:
   - 공인 SQL 실행 증명 영수증(Receipt) 시각화 카드 제공.

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] OKF v0.2 규격 적합성 린팅 API 및 신뢰 등급 뱃지가 노출될 것.
- [x] 4대 유효기간 프리셋 기반 원클릭 디지털 승약 서명이 저장될 것.
