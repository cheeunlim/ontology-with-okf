# 🤖 [EPIC-006] Data Agent Semantic Query, Attested Computation & Self-Healing

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-006`
* **대칭 Task**: [`TASK-006` (Semantic Query Agent)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/04_tasks/TASK-006_DATA_AGENT_SEMANTIC_QUERY.md)
* **목적**: OKF 지식 메타데이터와 BigQuery Property Graph 스키마를 유기적으로 결합하여, 사용자의 자연어 질의에 대해 **Standard SQL과 GQL(`GRAPH_TABLE`)을 병렬 생성 및 실행**하고, [`EPIC-003`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/03_epics/EPIC-003_WIKI_UNSTRUCTURED_DOC_TRANSPILER.md)에서 청킹 및 백링크 구조로 직렬화된 위키 지식베이스에서 **질의에 필요한 적합한 파트만 표적 추적(Pinpoint Chunk Traversal Retrieval)**하여 인용하며, OKF v0.2 `type: Attested Computation` 공인 쿼리를 지원하고 쿼리 오류 발생 시 **1회 자동 재시도 자율 수복(Self-Healing)** 파이프라인을 운영합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/AGENT.md)

---

## 2. 주요 요구사항 및 구현 범위
1. **하이브리드 추론 엔진 (`/api/data-agent-chat`)**:
   - `getSqlGenerationPrompt`를 통해 자연어 질문 ➔ SQL / GQL 선택적 실행.
   - `getFinalAnswerPrompt`를 통한 4단계 Provenance 타임라인 리포트 생성.
2. **위키 청킹 & 백링크 그래프 기반 정밀 참조 탐색 (Structure-Aware Chunking & Backlink GraphRAG Retrieval)**:
   - 전체 수만 자 분량의 위키 문서를 프롬프트에 모두 주입하지 않고, 청킹 및 백링크 그래프 구조를 탐색하여 질문과 직접 관련된 **아토믹 섹션 청크 1~2개만 표적 로딩**.
3. **Attested Computation 지원 (§10)**:
   - 검증된 SQL/GQL 질의를 `type: Attested Computation` 개념으로 자동 승격 (`runtime: bigquery`).
4. **자율 수복(Self-Healing) 자동 재시도 루프**:
   - GQL/SQL 실행 중 문법 또는 백틱 누락 에러 발생 시 백엔드에서 1회 자율 재시도 수정 실행 후 결과 반환.

---

## 3. 위키 청킹 & 백링크 기반 표적 탐색 메커니즘 (Pinpoint Retrieval Pipeline)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [🔍 1. 자연어 질의 키워드 파싱 (User Query Parsing)]                         │
│  • 예: "요구사항 변경 전파 규칙(Ripple Policy)과 관련된 테이블 및 수행 가이드"  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│  [🗺️ 2. 마스터 요약 노드 목차 스캔 (01_summary/ Index Scan)]                    │
│  • 01_summary/prod_master_summary.md의 목차 인덱스를 1차 탐색                  │
│  • 탐색 대상 청크 ID 식별: [[prod_sec4_ripple_policy]]                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│  [🎯 3. 백링크 그래프 다이렉트 홉 (Backlink Direct Traversal)]                   │
│  • [[prod_sec4_ripple_policy]] 아토믹 마크다운 청크(약 500자)만 핀포인트 로딩  │
│  • 청크 내 백링크([[AGENT.md]], [[DESIGN.md]], [[prod.md]]) 인라인 연결 탐색  │
│  • 프롬프트 토큰 사용량 최대 76% 절감 (거대 원본 문서 통째 주입 차단)          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│  [⚡ 4. 표적 청크 기반 SQL/GQL 생성 & Provenance 출처 명시 (Citation)]       │
│  • 표적 청크의 정확한 비즈니스 룰 및 컬럼 힌트로 Standard SQL/GQL 생성         │
│  • 4단계 Provenance 타임라인에 근거 인용구 [^prod_sec4_ripple_policy] 100% 명시│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 완료 기준 (Acceptance Criteria)
- [x] 위키 문서를 참조할 때 전체 문서를 통째로 넣지 않고, 3계층 목차 인덱스 및 백링크 그래프를 추적하여 질문에 적합한 아토믹 청크만 핀포인트로 탐색 및 주입할 것.
- [x] 프롬프트 토큰 절감률(최대 -76%) 및 인용 근거 카드가 UI Provenance 패널에 시각화될 것.
- [x] 자연어 질의에 대해 SQL 및 GQL 쿼리가 성공적으로 생성 및 실행될 것.
- [x] 쿼리 실행 오류 발생 시 백엔드에서 1회 자동 수복 루프가 정상 동작할 것.
