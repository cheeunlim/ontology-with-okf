# ⚙️ [TASK-006] Semantic Query Agent Implementation

## 1. Task 개요 & Epic 매핑
* **Task ID**: `TASK-006`
* **연계 Epic**: [`EPIC-006` (Data Agent Semantic Query, Attested Computation & Self-Healing)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/03_epics/EPIC-006_DATA_AGENT_SEMANTIC_QUERY.md)
* **상태**: `Completed`
* **담당 컴포넌트**: `srcs/src/server.js` (`/api/data-agent-chat`), `srcs/src/prompts/agentPrompts.js` (`getSqlGenerationPrompt`, `getQueryHealingPrompt`, `getFinalAnswerPrompt`)

---

## 2. 세부 구현 내역
1. 자연어 질의 ➔ SQL 및 GQL 하이브리드 파이프라인.
2. **위키 청킹 & 백링크 기반 표적 탐색 (Pinpoint Retrieval)**:
   - 질의 수신 시 `01_summary/` 목차 인덱스 스캔 ➔ 관련 아토믹 청크(`[[prod_sec4_ripple_policy]]` 등 500자 내외) 다이렉트 홉 로딩.
   - 원본 전체 문서 통째 주입 차단을 통한 토큰 절감(최대 -76%) 및 인용 출처(`[^chunk_id]`) 명확화.
3. 쿼리 오류 발생 시 `getQueryHealingPrompt` 기반 1회 자율수복 루프.
4. Attested Computation 영수증 및 4단계 Provenance 시각화.

---

## 3. 검증 결과 로그
* **결과**: `prod.md` 마스터 위키 참조 질의 시 `prod_sec4_ripple_policy` 아토믹 청크 핀포인트 로딩 및 GQL 쿼리 실행/인용 근거 제시 완료.
