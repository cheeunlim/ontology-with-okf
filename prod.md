# 🚀 [PROJECT MASTER] OKF Omni: Enterprise Ontology Platform (`prod.md`)

본 문서는 **OKF Omni (Enterprise Ontology Integration Platform)**의 **전체 프로젝트 단일 진실 소스(Single Source of Truth, SSOT)**이자 모든 요구사항의 최상위 마스터 명세서입니다.

최신 **Google Cloud Open Knowledge Format (OKF v0.2)** 공식 릴리즈([`references/knowledge-catalog/okf/SPEC.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/references/knowledge-catalog/okf/SPEC.md)) 규격이 반영되어 관리됩니다.

---

## 1. 프로젝트 비전 및 핵심 목적 (Vision & Purpose)

**OKF Omni Platform**은 기업의 **BigQuery Data Lake (정형 데이터셋 및 물리 테이블)**와 **비정형 업무 문서 (PDF, CS 매뉴얼, 정책 가이드라인)**를 **Google Cloud OKF v0.2 표준 마크다운(YAML Frontmatter + Wiki Backlinks `[[Entity]]` + Attested Computation)** 지식 네트워크로 상호 융합합니다.

### 🌟 핵심 가치 & 프로덕션 표준
1. **정형·비정형 지식 융합 및 보강 (Production Flow)**:
   - 물리 DB 스키마(BigQuery DDL, Dataplex Scan)와 비정형 비즈니스 문서(약관, CS 가이드라인, 매뉴얼)를 결합하여 테이블 및 컬럼의 OKF 메타데이터를 상호 보강([`EPIC-003`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/03_epics/EPIC-003_WIKI_UNSTRUCTURED_DOC_TRANSPILER.md)).
2. **OKF v0.2 정형 Provenance & 신뢰 수명주기(Trust Tier & Lifecycle)**:
   - `generated: { by: "reference_agent/gemini-3.5-flash", at: "ISO8601" }`
   - `sources: [{ id, resource, title, author, usage_count, last_modified }]` 및 본문 각주(`[^id]`)
   - **신뢰 등급(Trust Tier) 및 검증 정책 (OKF v0.2 §5.2 규격 준수)**:
     - **초기 자동 수집/생성 시 (Initial Draft)**: `status: draft`, `verified` 필드 미포함 (`unverified` 상태 유지, 임의의 하드코딩 금지).
     - **사용자(Human Data Steward) 검토 및 승인 시**: `status: stable` 승격 및 `verified: [{ by: "human:<user_id>", at: "ISO8601" }]` 기록 (`human-reviewed` 승격).
     - **신선도 만료 기준**: `stale_after: YYYY-MM-DD` (유효기간 초과 시 재검증 필요).
3. **Attested Computation 지원 (§10)**:
   - 검증된 비즈니스 SQL/GQL 질의를 `type: Attested Computation` 개념으로 자동 승격 (`runtime: bigquery`, `parameters`, `executor`, `attester`).
4. **자율 다중 에이전트 (Multi-Agent Core)**: `gemini-3.5-flash` 모델 기반으로 SQL 생성, Property Graph GQL(`GRAPH_TABLE`) 도출, 지식 검색(GraphRAG)을 유기적으로 조율.
5. **자율 수복(Self-Healing) 및 피드백 진화**: 쿼리 실패 시 AI 1회 자동 재시도 복구 루프와 현업 사용자 피드백 기반 위키 지식 영구 강화.
6. **전사 데이터 거버넌스 연동**: 보강된 OKF v0.2 지식을 GCP Dataplex Universal Catalog(Aspect: `okf-aspect.json`) 및 BigQuery Property Graph로 동기화.
7. **실험적 R&D 파이프라인의 명확한 분리**:
   - 카파시(Karpathy)식 3계층 LLM-Wiki 해체/컴파일러 엔진은 독립된 별도 연구 에픽([`EPIC-007`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/05_experimental/EPIC-007_EXPERIMENTAL_KARPATHY_LLM_WIKI.md))으로 격리하여 탐색하며, 실제 프로덕션 적용 계획은 두지 않습니다.

---

## 2. 핵심 철학 및 가이드라인 연계 (Core Philosophy Links)

* **🤖 AI 에이전트 개발 철학 & 모델 명세**: [`AGENT.md`](./AGENT.md)
  * `gemini-3.5-flash` 고정 사용 원칙, 생각의 흐름(Thoughts) 추출, 프롬프트 에픽별 모듈화 단일 관리([`srcs/src/prompts/`](./srcs/src/prompts/)), SQL/GQL 예약어 백틱 표준화, 오류 1회 자동 자율수복 루프.
* **🎨 UI/UX 디자인 시스템 & 5대 탭 표준**: [`DESIGN.md`](./DESIGN.md)
  * 글로벌 5대 네비게이션 탭 구조, Rich Aesthetic 컬러 토큰, 컴포넌트 일관성, 다이어그램 시각화 표준, 변경 이력.
* **🛠️ 마스터 워크플로우 스킬 명세**: [`SKILL.md`](./SKILL.md) & [`skills/`](./skills/)
  * `/epic-dev` (에픽 지정 태스크 개발), `/local-test` (로컬 헬스체크 & 브라우저 검증), `/cloud-deploy` (GCP Cloud Run 배포), `/github-push` (GitHub 푸시), `/github-ref-update` (외부 깃헙 레퍼런스 최신 갱신).
* **📚 시스템 아키텍처 명세서**: [`documents/01_architecture/ARCHITECTURE_&_ROADMAP.md`](./documents/01_architecture/ARCHITECTURE_&_ROADMAP.md)
* **💻 개발자 통합 가이드**: [`documents/02_guidelines/DEVELOPER_GUIDE.md`](./documents/02_guidelines/DEVELOPER_GUIDE.md)
* **📖 사용자 매뉴얼 & 워크스루**: [`documents/02_guidelines/USER_GUIDE.md`](./documents/02_guidelines/USER_GUIDE.md)
* **📑 공식 OKF v0.2 레퍼런스 규격**: [`references/knowledge-catalog/okf/SPEC.md`](./references/knowledge-catalog/okf/SPEC.md)

---

## 3. 메인 에픽(Epic)과 태스크(Task) 1:1 대칭 매핑 매트릭스

본 프로젝트의 모든 세부 업무 방향은 `documents/03_epics/`의 메인 **Epic**으로 정의되며, 개발 및 테스트 실행은 이에 정확히 대칭되는 `documents/04_tasks/`의 **Task**로 수행됩니다.

| Epic ID | Epic 문서 링크 | Task ID | Task 명세서 링크 | 목표 인도물 및 세부 범위 | 진행 상태 |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **`EPIC-001`** | [EPIC-001: Foundation Platform](./documents/03_epics/EPIC-001_FOUNDATION_PLATFORM.md) | **`TASK-001`** | [TASK-001: Foundation Setup](./documents/04_tasks/TASK-001_FOUNDATION_SETUP.md) | 풀스택 프로젝트 아키텍처 (`documents/` / `references/` / `srcs/` 분리) | **Completed** |
| **`EPIC-002`** | [EPIC-002: BigQuery Physical Harvester](./documents/03_epics/EPIC-002_BIGQUERY_OKF_HARVESTER.md) | **`TASK-002`** | [TASK-002: BigQuery Harvester](./documents/04_tasks/TASK-002_BIGQUERY_OKF_HARVESTER.md) | BigQuery 물리 스키마/뷰 수집, OKF v0.2 프론트매터 자동 직렬화 및 VIEW 400 에러 예외 처리 | **Completed** |
| **`EPIC-003`** | [EPIC-003: Wiki & Unstructured Transpiler](./documents/03_epics/EPIC-003_WIKI_UNSTRUCTURED_DOC_TRANSPILER.md) | **`TASK-003`** | [TASK-003: Wiki & Unstructured Transpiler](./documents/04_tasks/TASK-003_WIKI_UNSTRUCTURED_DOC_TRANSPILER.md) | 마스터 위키(`prod.md` 등) 및 PDF 문서의 OKF v0.2 변환, 헤딩 청킹, 양방향 백링크 & 업무 정의 추출 | **Completed** |
| **`EPIC-004`** | [EPIC-004: Cross-Domain OKF Enrichment](./documents/03_epics/EPIC-004_CROSS_DOMAIN_OKF_ENRICHMENT.md) | **`TASK-004`** | [TASK-004: Cross-Domain OKF Enrichment](./documents/04_tasks/TASK-004_CROSS_DOMAIN_OKF_ENRICHMENT.md) | 비정형 위키 지식과 BigQuery 물리 스키마 간 상호 메타데이터 보강 및 GCS 저장 | **Completed** |
| **`EPIC-005`** | [EPIC-005: Dataset Graph DB Synthesizer Agent](./documents/03_epics/EPIC-005_DATASET_GRAPH_DB_SYNTHESIZER_AGENT.md) | **`TASK-005`** | [TASK-005: Dataset Graph DB Synthesizer Agent](./documents/04_tasks/TASK-005_DATASET_GRAPH_DB_SYNTHESIZER_AGENT.md) | 데이터셋 OKF, 연결 위키, 빈출 SQL 삼중 분석 기반 BigQuery Property Graph DDL & GQL 템플릿 자율 설계 및 BQ/GCS 배포 | **Completed** |
| **`EPIC-006`** | [EPIC-006: Data Agent Semantic Query](./documents/03_epics/EPIC-006_DATA_AGENT_SEMANTIC_QUERY.md) | **`TASK-006`** | [TASK-006: Semantic Query Agent](./documents/04_tasks/TASK-006_DATA_AGENT_SEMANTIC_QUERY.md) | 하이브리드(SQL/GQL) 질의 처리, Attested Computation, 1회 자동 자율수복 및 4단계 Provenance 리포트 | **Completed** |
| **`EPIC-007`** | [EPIC-007: OKF v0.2 Conformance Governance](./documents/03_epics/EPIC-007_OKF_V02_CONFORMANCE_GOVERNANCE.md) | **`TASK-007`** | [TASK-007: Conformance Validator & HITL Workflow](./documents/04_tasks/TASK-007_OKF_V02_CONFORMANCE_GOVERNANCE.md) | OKF v0.2 적합성 린터, 4대 유효기간 프리셋, 디지털 승약 서명 및 Attestation 영수증 검증 | **Completed** |
| **`EPIC-008`** | [EPIC-008: GCP Dataplex Catalog Sync](./documents/03_epics/EPIC-008_DATAPLEX_CATALOG_SYNC.md) | **`TASK-008`** | [TASK-008: Dataplex Catalog Sync](./documents/04_tasks/TASK-008_DATAPLEX_CATALOG_SYNC.md) | OKF v0.2 Aspect 기반 GCP Dataplex Universal Catalog Live Sync & Business Glossary Native 매핑 | **Completed** |
| 🧪 **`EPIC-009-EXP`** | [EPIC-009-EXP: Experimental Karpathy LLM-Wiki](./documents/05_experimental/EPIC-009_EXPERIMENTAL_KARPATHY_LLM_WIKI.md) | 🧪 **`TASK-009-EXP`** | [TASK-009-EXP: Experimental LLM-Wiki](./documents/05_experimental/TASK-009_EXPERIMENTAL_KARPATHY_LLM_WIKI.md) | **[실험적 R&D 전용 / 05_experimental/ 보관]** Karpathy식 3계층 지식 컴파일러 연구 | 🧪 **Experimental** |

---

## 4. 요구사항 전달 및 변경 전파 규칙 (Requirement & Ripple Policy)

1. **최상위 프로젝트 요구사항 전달**:
   - 사용자는 전체 프로젝트 방향, 전략적 목표, 공통 기준 변경 시 **`prod.md`**를 참조하여 요구사항을 전달합니다.
2. **에픽(Epic) 레벨 변경 및 개발/테스트 커뮤니케이션**:
   - 단위 기능 추가, 수정, 리팩토링, 검증은 해당하는 `documents/03_epics/EPIC-xxx.md` 및 `documents/04_tasks/TASK-xxx.md`를 중심으로 소통하고 개발을 진행합니다.
3. **교차 에픽 영향 및 상위 전파 (Ripple-Up Policy)**:
   - 만약 특정 Epic의 변경 요구사항이 다른 Epic에 영향을 주거나 프로젝트 전반의 기술 사양/디자인을 변경해야 하는 경우:
     - **AI/모델/추론/프롬프트 영향**: [`AGENT.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/AGENT.md)로 자동 확산 업데이트.
     - **UI/UX/화면/네비게이션 영향**: [`DESIGN.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/DESIGN.md)로 자동 확산 업데이트.
     - **전체 아키텍처/마스터 현황 영향**: [`prod.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prod.md)로 자동 확산 갱신.

---

## 5. 시스템 명령어 자율 실행 및 안전 권한 수칙 (Autonomous Execution & Safety Policy)

1. **일반 시스템 명령어 자율 실행 (Autonomous Execution)**:
   - 개발, 빌드, 로컬/원격 테스트, 코드 무결성 검증, 메타데이터 조회, API 호출, 프로세스 점검 등 일상적인 명령어(`node`, `npm`, `python`, `pytest`, `git`, `curl`, `bq`, `gcloud` 조회 등)는 사용자 확인 요청 없이 자율적으로 신속히 수행합니다.
2. **파괴적 삭제 작업의 엄격한 승인 격리 (Destructive Guard)**:
   - 로컬 파일 삭제, 디렉토리 삭제, 클라우드 리소스 영구 삭제(`rm`, `rmdir`, `DROP TABLE`, `TRUNCATE`, `DELETE`, `gcloud storage rm` 등) 데이터 손실 또는 비가역적 변경을 유발할 수 있는 작업에 한해서만 사용자 사전 확인 및 승인을 거쳐 실행합니다.

