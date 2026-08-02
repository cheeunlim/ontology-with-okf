# 🤖 [EPIC-005] Multi-Modal Data Agent & Attested Computation (OKF v0.2)

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-005`
* **대칭 Task**: [`TASK-005` (Data Agent Semantic Query)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/04_tasks/TASK-005_DATA_AGENT_SEMANTIC_QUERY.md)
* **목적**: 자연어 비즈니스 질의를 분석하여 BigQuery SQL 및 Property Graph GQL(`GRAPH_TABLE`)을 생성하고, 검증된 쿼리를 **OKF v0.2의 핵심 신규 개념인 `Attested Computation`**으로 자동 승격·패키징하며, 오류 시 1회 자율수복(Self-Healing) 및 4단계 진화 타임라인 보고서를 도출합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/AGENT.md)
* **참조 규격**: [`references/knowledge-catalog/okf/SPEC.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/references/knowledge-catalog/okf/SPEC.md) (§10 Attested Computation)

---

## 2. OKF v0.2 기반 신규 요구사항 (Requirements Diff)

1. **`type: Attested Computation` 개념 지원**:
   - 실행 및 검증이 완료된 핵심 비즈니스 SQL/GQL 질의를 단순 텍스트가 아닌 OKF v0.2의 **Attested Computation** 개념으로 포맷팅:
     - `runtime: bigquery`
     - `parameters: [{ name, type, required }]`
     - `executor: { resource: "references/skills/run-on-bq.md", receipt: ["job_id", "executed_sql", "result"] }`
     - `attester: { resource: "references/attesters/sql-equality.py" }`
     - 본문 헤딩: `# Computation`
2. **1회 자동 자율수복 루프 (Auto-Retry Self-Healing Loop)**:
   - 쿼리 실행 실패 시 백엔드에서 에러 메시지를 Gemini에 전달하여 수정 쿼리를 받아 자동 재실행.
3. **4단계 답변 진화 타임라인 & 생각의 흐름(Thoughts) 파싱**:
   - Vanilla RAG ➔ OKF Injected ➔ Data Graph Bound ➔ Refined Feedback 4단계 비교 렌더링.
   - `thinkingBudget: 2048` 기반 생각 흐름 투명 공개.

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] 자연어 질의에 따라 정형 SQL 및 GQL 쿼리가 정상 도출 및 실행될 것.
- [x] 산출된 검증 쿼리가 OKF v0.2 `Attested Computation` 구조로 직렬화 가능할 것.
- [x] 쿼리 실행 에러 발생 시 사용자 개입 없이 1회 자동 수복될 것.
