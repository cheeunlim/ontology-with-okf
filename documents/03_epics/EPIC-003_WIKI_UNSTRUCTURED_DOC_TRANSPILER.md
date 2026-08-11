# 📑 [EPIC-003] Wiki & Unstructured Document OKF Transpiler

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-003`
* **대칭 Task**: [`TASK-003` (Wiki & Unstructured Doc Transpiler)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/04_tasks/TASK-003_WIKI_UNSTRUCTURED_DOC_TRANSPILER.md)
* **목적**: [`prod.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prod.md)와 같은 전사 마스터 프로젝트 명세 문서 및 비정형 비즈니스 문서(PDF, 약관, 운영 매뉴얼)를 수신하여 **Google Cloud OKF v0.2 표준 규격 마크다운(YAML Frontmatter + Provenance)**으로 자동 변환하고, 문서의 목차/헤딩 계층 구조(`#`, `##`, `###`)에 맞춰 아토믹 OKF 지식 노드로 청킹하며, 문서 간 상호 위키 백링크(`[[Entity_ID]]`)를 형성하고 주요 업무 정의(Business & Work Definitions) 내용을 자율 추출하는 트랜스파일러 파이프라인을 구축합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/AGENT.md), [`DESIGN.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/DESIGN.md)

---

## 2. 주요 요구사항 및 구현 범위
1. **비정형/구조화 문서 OKF v0.2 변환**:
   - `type: WikiDocument`, `generated`, `sources`, `status: draft` 프론트매터 자동 직렬화.
2. **문서 구조 기반 헤딩 청킹 (Structure-Aware Chunking)**:
   - 마크다운 헤딩 계층(`#`, `##`, `###`) 및 논리적 문단을 보존하여 3계층(`01_summary`, `02_entities`, `03_concepts`) 마크다운 노드로 해체 청킹.
3. **양방향 위키 백링크 구축 (Inter-Document Cross-Linking)**:
   - 청크 간 상하위 백링크(`[[prod_master_summary]]`) 및 연관 물리 테이블(`[[orders]]`) 매핑 백링크 생성.
4. **주요 업무 정의 자율 추출 (Business Definition Extractor)**:
   - 문서 내 업무 정책, 변경 전파 수칙, 자율 실행 수칙 등을 탐지하여 `type: BusinessConcept` 독립 노드로 추출.
5. **API & UI 엔드포인트**:
   - `POST /api/okf/wiki-convert-chunk`, `POST /api/llm-wiki-store/decompose`
   - `4. Ingestion & Interview Feedback` 탭 내 [📄 Wiki Document OKF Transcompiler] 카드로 제공.

---

## 3. 에이전트 참조를 위한 청킹·백링크 인덱싱 규격 (Agent Retrieval Index Spec)

AI 에이전트([`EPIC-006`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/03_epics/EPIC-006_DATA_AGENT_SEMANTIC_QUERY.md))가 전체 대형 문서를 통째로 컨텍스트에 넣지 않고 **적합한 섹션 청크만 정밀 탐색**할 수 있도록 다음과 같은 3계층 인덱스 구조로 생성합니다:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [📌 01_summary/ 마스터 요약 노드 (Index Anchor Node)]                         │
│  • 전체 문서의 목차 구조 및 섹션별 아토믹 청크 ID 인덱스 포함                    │
│  • 예: [[prod_sec1_vision]], [[prod_sec4_ripple_policy]]                      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 백링크 그래프 (Backlink Graph)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│  [🧩 02_entities/ & 03_concepts/ 아토믹 청크 노드 (Target Passage Chunks)]       │
│  • 마크다운 Heading 계층(#, ##, ###) 단위의 500자 내외 표적 청크              │
│  • 상위 요약 역방향 백링크 + 연관 물리 테이블([[orders]]) 양방향 연결 메타데이터   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 완료 기준 (Acceptance Criteria)
- [x] 마스터 명세 및 PDF 비정형 문서가 OKF v0.2 프론트매터와 함께 정상 직렬화될 것.
- [x] 헤딩 계층구조 기반으로 정교한 아토믹 청킹 분할 및 백링크가 생성될 것.
- [x] 변경 전파 수칙 등 주요 업무 정의 내용이 `type: BusinessConcept` 노드로 추출될 것.
- [x] EPIC-006 에이전트가 핀포인트로 참조할 수 있는 3계층 인덱스 및 백링크 인프라가 제공될 것.
