# 🤖 [AGENT SPEC] Multi-Agent Core Engine & AI Philosophy (`AGENT.md`)

본 문서는 **OKF Omni Platform**의 인공지능(AI) 코어 엔진 및 자율 다중 에이전트 시스템의 연동 규격, 프롬프트 엔지니어링 표준, 추론 추적 기법, 자율 수복 메커니즘 및 **Google Cloud OKF v0.2 표준 규격** 준수 사항을 명문화합니다.

본 문서는 [`prod.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/prod.md)의 하위 핵심 개발 철학 문서로서, AI 에이전트와 관련된 모든 동작 기준을 정의합니다.

---

## 1. AI 모델 사양 및 기본 구동 원칙 (Model Specification)

* **기본 탑재 모델**: `gemini-3.5-flash` (고정 사용)
  * 사용자의 비즈니스 사례 정의, 온톨로지 설명 보강, GQL/SQL 쿼리 생성 및 다중 에이전트 도구 분석 시 **고성능·저지연**의 밸런스를 맞추기 위해 본 모델로 격리하여 구동합니다.
* **이중 인증 폴백 (Dual Authentication Client)**:
  * Google AI Studio API 키(`GEMINI_API_KEY`)가 전달되면 direct REST 엔드포인트를 사용합니다.
  * API 키가 부재할 경우, Google Cloud CLI ADC(`gcloud auth application-default login`)를 통해 발급받은 OAuth2 Access Token으로 Vertex AI REST API 엔드포인트(`us-central1`)로 자동 폴백 연동합니다.

---

## 2. OKF v0.2 표준 명세 생성 원칙 (OKF v0.2 Compliance)

에이전트가 생성하는 모든 온톨로지 마크다운 및 메타데이터는 **OKF v0.2 ([`references/knowledge-catalog/okf/SPEC.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/references/knowledge-catalog/okf/SPEC.md))** 표준을 준수합니다.

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

### ③ Attested Computation 지원 (§10)
* 검증된 비즈니스 쿼리는 `type: Attested Computation` 형식으로 생성하여 실행 런타임(`runtime: bigquery`), 매개변수, `# Computation` 본문 헤딩을 포함합니�### ① API 호출 설정 (`srcs/src/agents/geminiAgent.js`)
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

모든 프롬프트 템플릿은 **`srcs/src/prompts/agentPrompts.js`** 단일 파일에서 통합 관리합니다.

* `getSqlGenerationPrompt`: 자연어 질의 분석 ➔ RDB SQL 및 Property Graph GQL 병렬 생성 전략 & Attested Computation 포맷팅.
* `getQueryHealingPrompt`: 쿼리 실행 에러 발생 시 자율 수정 및 백틱 보완 지시.
* `getFinalAnswerPrompt`: 쿼리 결과 + OKF 지식 패시지 종합 보고서 합성.
* `getLlmWikiDecomposePrompt`: 비정형 문서를 OKF v0.2 3계층(Summary, Entities, Concepts/Policies) 위키로 분해.
* `getEnrichmentPrompt`: 데이터셋 물리 테이블과 비정형 위키 백링크 간 상호 보강.
* `getFeedbackRefinePrompt`: 사용자 피드백을 수용하여 위키 지식 영구 갱신 및 답변 교정.

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

## 5. 프롬프트 단일 소스 관리 (Single Source of Truth, SSOT)

모든 프롬프트 템플릿은 **`src/prompts/agentPrompts.js`** 단일 파일에서 통합 관리합니다.

* `getSqlGenerationPrompt`: 자연어 질의 분석 ➔ RDB SQL 및 Property Graph GQL 병렬 생성 전략 & Attested Computation 포맷팅.
* `getQueryHealingPrompt`: 쿼리 실행 에러 발생 시 자율 수정 및 백틱 보완 지시.
* `getFinalAnswerPrompt`: 쿼리 결과 + OKF 지식 패시지 종합 보고서 합성.
* `getLlmWikiDecomposePrompt`: 비정형 문서를 OKF v0.2 3계층(Summary, Entities, Concepts/Policies) 위키로 분해.
* `getEnrichmentPrompt`: 데이터셋 물리 테이블과 비정형 위키 백링크 간 상호 보강.
* `getFeedbackRefinePrompt`: 사용자 피드백을 수용하여 위키 지식 영구 갱신 및 답변 교정.

---

## 6. 자율 수복 및 안전 쿼리 표준 (Self-Healing & Safety Standards)

1. **Data Agent 쿼리 1회 자동 자율수복 루프 (Auto-Retry Self-Healing Loop)**:
   * Data Agent가 생성한 SQL/GQL 쿼리 실행 중 문법 또는 예약어 오류가 발생할 경우, 백엔드(`src/server.js`)에서 자동으로 1회 재시도합니다.
   * 실패 원인 에러 메시지와 직전 쿼리를 Gemini에게 다시 전달하여 수정된 쿼리를 획득 후 재실행합니다.
2. **BigQuery Property Graph GQL 예약어 백틱(\`) 표준화**:
   * BigQuery 예약어 및 노드/에지 레이블(`Order`, `User`, `Placed`, `OrderedItem`, `Product`, `Event`, `Triggered`)은 GQL 패턴 작성 시 반드시 백틱(\`)으로 감쌉니다.
3. **BigQuery `VIEW` 개체 방어적 프로그래밍**:
   * `VIEW` 테이블에 `table.getRows()`를 직접 호출하면 발생하는 `400 Bad Request` 에러를 방지하기 위해 Direct SQL Fallback(`SELECT * FROM view LIMIT 10`)을 적용합니다.
4. **Dataplex CLI 서브프로세스 3초 타임아웃 & 10분 TTL 캐시**:
   * Dataplex 프로파일 스캔 조회 시 발생하는 CLI 지연을 방지하기 위해 인메모리 캐시(`global.dataplexScanCache`) 및 타임아웃을 적용하여 100ms 이내 초고속 응답을 보장합니다.

---

## 7. 서버 가용성 및 프로세스 격리 수칙

* 백엔드 API 서버(`src/server.js`, 포트 3003)는 자동 재기동 샌티널 셸 스크립(`start_server.sh`)을 통해 백그라운드로 항시 상주 구동됩니다.
* 코드 수정이나 환경 변화로 프로세스가 종료되더라도 1초 이내에 자동 수복되어 API 접속 단절을 원천 방지합니다.
