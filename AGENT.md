# 🤖 [AGENT SPEC] Multi-Agent Core Engine & AI Philosophy (`AGENT.md`)

본 문서는 **OKF Omni Platform**의 인공지능(AI) 코어 엔진 및 자율 다중 에이전트 시스템의 연동 규격, 프롬프트 엔지니어링 표준, 추론 추적 기법, 자율 수복 메커니즘 및 **Google Cloud OKF v0.2 표준 규격** 준수 사항을 명문화합니다.

본 문서는 [`prod.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prod.md)의 하위 핵심 개발 철학 문서로서, AI 에이전트와 관련된 모든 동작 기준을 정의합니다.

---

## 1. AI 모델 사양 및 기본 구동 원칙 (Model Specification)

* **기본 탑재 모델**: `gemini-3.5-flash` (고정 사용)
  * 사용자의 비즈니스 사례 정의, 온톨로지 설명 보강, GQL/SQL 쿼리 생성 및 다중 에이전트 도구 분석 시 **고성능·저지연**의 밸런스를 맞추기 위해 본 모델로 격리하여 구동합니다.
* **이중 인증 폴백 (Dual Authentication Client)**:
  * Google AI Studio API 키(`GEMINI_API_KEY`)가 전달되면 direct REST 엔드포인트를 사용합니다.
  * API 키가 부재할 경우, Google Cloud CLI ADC(`gcloud auth application-default login`)를 통해 발급받은 OAuth2 Access Token으로 Vertex AI REST API 엔드포인트(`us-central1`)로 자동 폴백 연동합니다.

---

## 2. OKF v0.2 표준 명세 생성 원칙 (OKF v0.2 Compliance)

에이전트가 생성하는 모든 온톨로지 마크다운 및 메타데이터는 **OKF v0.2 ([`references/knowledge-catalog/okf/SPEC.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/references/knowledge-catalog/okf/SPEC.md))** 표준을 준수합니다.

### ① Actor 및 타임스탬프 표준 (`generated`)
* 레거시 `timestamp` 필드 대신 `generated: { by, at }` 구조를 필수 사용합니다:
  ```yaml
  generated:
    by: reference_agent/gemini-3.5-flash
    at: '2026-08-02T10:15:00Z'
  ```

### ② 출처 및 신뢰도 시그널 (`sources`)
* 본문 하단 플랫 리스트 대신 YAML 프론트매터의 `sources` 패밀리를 생성하고, 본문에서는 각주(`[^source-id]`)로 인용합니다:
  ```yaml
  sources:
    - id: source-1
      resource: https://cloud.google.com/bigquery
      title: BigQuery Documentation
      author: team:data-governance
  ```

### ④ 위키 청킹 & 백링크 기반 표적 탐색 수칙 (Pinpoint Chunk Traversal)
* 대형 위키 문서 참조 시 전체 문서를 통째로 프롬프트에 주입하는 것을 엄격히 금지합니다.
* `01_summary/` 목차 인덱스 노드의 청크 앵커(`[[chunk_id]]`)를 1차 스캔한 후, 자연어 질의 키워드와 연관된 아토믹 섹션 청크(500자 내외) 1~2개 및 연결 백링크만 표적 로딩하여 주입합니다.
* 프롬프트 토큰 절감률(최대 -76%) 및 인용 근거 각주(`[^chunk_id]`)를 4단계 Provenance 리포트에 필수 표기합니다.

### ③ Attested Computation 지원 (§10)
* 검증된 비즈니스 쿼리는 `type: Attested Computation` 형식으로 생성하여 실행 런타임(`runtime: bigquery`), 매개변수, `# Computation` 본문 헤딩을 포함합니### ① API 호출 설정 (`srcs/src/agents/geminiAgent.js`)
```javascript
const body = {
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: {
    thinkingConfig: {
      thinkingBudget: 2048 // 생각 예산 할당
    }
  }
};
```

### ② 생각 흐름 파싱 및 실시간 스트리밍
* Gemini 응답 중 `part.thought` 파트를 분리 캡처하여 프론트엔드로 전달합니다.
* 프론트엔드 우측 **[AI 에이전트 실시간 추론 추적]** 패널의 `① AI 생각 흐름 (Thoughts)` 탭에 출력됩니다.

---

## 5. 프롬프트 단일 소스 관리 (Single Source of Truth, SSOT)

모든 프롬프트 템플릿은 **`srcs/src/prompts/`** 디렉토리 하위의 기능별 모듈 파일로 관리되며, **`srcs/src/prompts/index.js`** 및 **`agentPrompts.js`**(SSOT Proxy)를 통해 통일성 있게 제공됩니다.

### 📁 모듈별 프롬프트 명세 & 에픽 매핑

1. **`harvesterPrompts.js` [EPIC-002: BigQuery Physical Harvester]**:
   * `getProfilePrompt`: Tables ➔ Schema 탭 | 물리 스키마/데이터 샘플 기반 프로파일링 & ASSERT 퀄리티 룰 도출
   * `getAdvancedSchemaPrompt`: Tables ➔ Catalog Info 탭 | DDL, 스키마, Insights & Lineage 심층 파싱
   * `getDatasetOkfPrompt`: Dataset Dashboard ➔ ⚡ OKF Builder (Batch) 탭 | 데이터셋 OKF v0.2 마크다운 생성
   * `getOkfBusinessSpecPrompt`: OKF Knowledge Store ➔ OKF Spec Generator | 비정형 문서 ➔ OKF 유형 A 포맷 변환

2. **`transpilerPrompts.js` [EPIC-003: Wiki & Unstructured Transpiler]**:
   * `getLlmWikiDecomposePrompt`: Ingestion ➔ Wiki Transpiler | 비정형 문서를 Summary, Entities, Concepts 3계층 OKF 위키로 해체
   * `getAutoNamingPrompt`: Ingestion ➔ File Upload | 문서 의미 파악 기반 영문 snake_case 파일명 자율 추출
   * `getGithubTranslationPrompt`: OKF Knowledge Store ➔ GitHub Explorer | 오리지널 텍스트 한국어 문단별 대조 번역

3. **`enrichmentPrompts.js` [EPIC-004: Cross-Domain OKF Knowledge Enrichment]**:
   * `getEnrichmentPrompt`: Knowledge Enrichment 탭 | 물리 스키마와 GCS 비정형 위키 지식 간의 상호 메타데이터 보강

4. **`graphPrompts.js` [EPIC-005: Dataset Graph DB Synthesizer Agent]**:
   * `getGraphDesignPrompt`: BigQuery & Spanner Graph ➔ Table Graph View | 단일 테이블 노드/에지 프로퍼티 그래프 DDL 디자인
   * `getDatasetGraphPrompt`: BigQuery & Spanner Graph ➔ Dataset Graphs List | 다중 테이블 관계 기반 통합 Property Graph DDL 생성
   * `getDatasetGraphSynthesizerPrompt`: BigQuery & Spanner Graph ➔ 🤖 AI 커스텀 합성기 | 물리 OKF + 연결 위키 + 빈출 SQL 삼중 전수 지식 융합 기반 Custom Property Graph DDL & GQL 템플릿 자율 합성

5. **`agentChatPrompts.js` [EPIC-006: Data Agent Semantic Query & Self-Healing]**:
   * `getSqlGenerationPrompt`: Agent Evolution Studio / Data Agent Chat | 자연어 질의 ➔ Standard SQL 및 Property Graph GQL 하이브리드 전략 수립
   * `getQueryHealingPrompt`: Agent Evolution Studio / Data Agent Chat | GQL/SQL 실행 오류 발생 시 1회 자율수복 및 백틱(`) 보완
   * `getFinalAnswerPrompt`: Agent Evolution Studio / Data Agent Chat | 쿼리 실행 결과 + 위키 인용 근거 합성 4단계 Provenance 리포트 생성 (kr/en 지원)
   * `getSqlHelperPrompt`: Tables ➔ Preview ➔ SQL Helper | 빅쿼리 최적화 추천 SQL 쿼리 생성
   * `getRagDesignPrompt`: Tables ➔ Catalog Info ➔ RAG Design | 의미론적 벡터 검색 & RAG 인덱스 설계

6. **`feedbackPrompts.js` [EPIC-007: OKF v0.2 Governance & HITL]**:
   * `getFeedbackRefinePrompt`: Ingestion & Feedback ➔ HITL Feedback Loop | 현업 사용자 피드백 반영 지식 영구 갱신 및 답변 교정

---

## 6. 자율 수복 및 안전 쿼리 표준 (Self-Healing & Safety Standards)

1. **Data Agent 쿼리 1회 자동 자율수복 루프 (Auto-Retry Self-Healing Loop)**:
   * Data Agent가 생성한 SQL/GQL 쿼리 실행 중 문법 또는 예약어 오류가 발생할 경우, 백엔드(`srcs/src/server.js`)에서 자동으로 1회 재시도합니다.
   * 실패 원인 에러 메시지와 직전 쿼리를 Gemini에게 다시 전달하여 수정된 쿼리를 획득 후 재실행합니다.
2. **BigQuery Property Graph GQL 예약어 백틱(\`) 표준화**:
   * BigQuery 예약어 및 노드/에지 레이블(`Order`, `User`, `Placed`, `OrderedItem`, `Product`, `Event`, `Triggered`)은 GQL 패턴 작성 시 반드시 백틱(\`)으로 감쌉니다.
3. **BigQuery `VIEW` 개체 방어적 프로그래밍**:
   * `VIEW` 테이블에 `table.getRows()`를 직접 호출하면 발생하는 `400 Bad Request` 에러를 방지하기 위해 Direct SQL Fallback(`SELECT * FROM view LIMIT 10`)을 적용합니다.
4. **Dataplex CLI 서브프로세스 3초 타임아웃 & 10분 TTL 캐시**:
   * Dataplex 프로파일 스캔 조회 시 발생하는 CLI 지연을 방지하기 위해 인메모리 캐시(`global.dataplexScanCache`) 및 타임아웃을 적용하여 100ms 이내 초고속 응답을 보장합니다.

---

## 7. 서버 가용성 및 프로세스 격리 수칙

* 백엔드 API 서버(`srcs/src/server.js`, 포트 3003)는 자동 재기동 샌티널 셸 스크립트(`srcs/start_server.sh`)를 통해 백그라운드로 항시 상주 구동됩니다.
* 코드 수정이나 환경 변화로 프로세스가 종료되더라도 1초 이내에 자동 수복되어 API 접속 단절을 원천 방지합니다.
** 패널의 `① AI 생각 흐름 (Thoughts)` 탭에 출력됩니다.

---

