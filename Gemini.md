# Gemini AI 연동 명세서 (Gemini Integration Spec)

본 문서는 **Ontology with OKF** 플랫폼의 인공지능(AI) 코어 엔진인 Gemini 모델의 연동 규격, 프롬프트 추적 기법 및 자율 추론 설정을 명문화합니다.

---

## 1. 모델 사양 및 가이드라인
* **기본 탑재 모델**: `gemini-3.5-flash` (고정 사용)
  * 사용자의 비즈니스 사례 정의, 온톨로지 설명 보강, 그리고 다중 에이전트 도구 분석 시 고성능 저지연의 밸런스를 맞추기 위해 본 모델로 격리하여 구동합니다.
* **언어 및 용어 규칙 (Language & Terminology Principle)**:
  * 물리 스펙(테이블명, 스키마 구조, SQL 코드)을 제외한 모든 비즈니스 설명, 데이터 품질 보고서, 추천 요약 등 설명용 텍스트는 반드시 **한국어(Korean)**로 생성하도록 프롬프트를 제한합니다.
  * **[언어 스위치 예외]**: 단, 메인 설정 또는 대화창 헤더의 언어 스위치 토글이 영어(🇺🇸 EN)로 설정되어 요청과 함께 `appLang: "en"` 정보가 전달된 경우, 최종 데이터 에이전트 리포트 답변 생성(`getFinalAnswerPrompt`)에 한하여 본문 및 모든 비즈니스 설명과 추천 요약을 **영어(English)**로 도출하도록 허용합니다.
  * **[용어 엄격 제약]**: **'회류' 단어 사용을 일절 금지**하며, 피드백 관련 모든 레이블, 마크다운 문서, 프롬프트, UI 및 서술문에는 오직 **'Feedback'** 또는 **'피드백'**으로만 표기합니다.

---

## 2. 자율 생각의 흐름 (Thoughts) 추출 메커니즘
본 플랫폼은 단순히 최종 결과물(마크다운, SQL)만 보여주지 않고, AI가 답을 도출하기 위해 거친 내부 추론 단계를 사용자에게 투명하게 공개합니다.

### ① API 호출 설정 (`agents/geminiAgent.js`)
Gemini API 호출 시 `thinkingConfig`를 강제 활성화하여 모델이 결과물 작성 전에 브레인스토밍을 수행하도록 지시합니다.
```javascript
const response = await ai.models.generateContent({
  model: 'gemini-3.5-flash',
  contents: prompt,
  config: {
    // 모델의 내부 생각 흐름 활성화
    thinkingConfig: {
      thinkingBudget: 2048,
    }
  }
});
```

### ② 생각 흐름 파싱
응답 객체 중 `part.thought` 파트를 분리 캡처하여 데이터베이스 및 프론트엔드 API(`/api/enrich-metadata` 등)로 전달하고, 우측 **[AI 에이전트 실시간 추론 추적]** 패널의 `① AI 생각 흐름 (Thoughts)` 탭에 출력합니다.

---

## 3. 프롬프트 단일 소스 관리 (Single Source of Truth)
모든 프롬프트 템플릿은 `prompts/agentPrompts.js` 단일 파일에서 통합 관리하며, 수신된 컨텍스트와 매개변수를 동적으로 결합하여 Gemini 엔진에 주입합니다.

---

## 4. BigQuery 개체별 API 및 GCP 외부 CLI 안전 지침 (VIEW / Dataplex 방어적 프로그래밍)
1. **`VIEW` 개체 특성 예외 처리**:
   * BigQuery API 중 `table.getRows()` 또는 단순 `numRows`/`numBytes` 조회의 경우 `VIEW` 타입에 호출하면 `400 Bad Request (Cannot list a table of type VIEW)` 에러를 반환합니다.
   * 모든 BigQuery 메타데이터 및 행 조회 시 `try-catch` 블록으로 감사하고, `VIEW`인 경우 Direct SQL Fallback(`SELECT * FROM view LIMIT 10`) 또는 기본값(`0` / `Virtual View`)을 반환하도록 예외 처리합니다.
2. **Dataplex CLI 서브프로세스 지연 차단 (인메모리 캐시 & 타임아웃)**:
   * 테이블 상세 조회 시 Dataplex 프로파일 스캔 결과(`gcloud dataplex datascans list`)를 동기/지연 조회하면 CLI 처리 속도로 인해 HTTP 요청이 타임아웃되거나 응답 지연이 발생할 수 있습니다.
   * `3초 타임아웃` 및 `10분 TTL 인메모리 캐시`(`global.dataplexScanCache`)를 적용하여 어떤 테이블을 눌러도 즉각적인 100ms 이내 초고속 메타데이터 응답성을 유지합니다.
3. **Cloud Run 배포 시 Dataplex 및 gcloud CLI 종속성 및 IAM 권한**:
   * 본 플랫폼의 Glossary 탭 및 Dataplex 프로파일 조회 기능은 내부적으로 `exec`를 통해 `gcloud dataplex` CLI 명령을 실행합니다.
   * 이를 위해 배포용 `Dockerfile`에 Google Cloud SDK(`google-cloud-cli`) 설치 프로세스가 반드시 보장되어야 합니다.
   * Cloud Run 서비스 계정(Service Account)에는 Dataplex Entry 조회를 위해 최소한 **`roles/dataplex.viewer`** (Dataplex 뷰어) 및 **Aspect 푸시/동기화를 위한 `roles/dataplex.editor` / `roles/dataplex.catalogEditor`** (`dataplex.entries.update`) 권한이 부여되어야 정상 작동합니다.
4. **BigQuery Property Graph DDL 및 GQL 생성 표준 규격 & 예약어 백틱 감싸기**:
   * AI가 생성하는 Property Graph DDL 및 GQL(`GRAPH_TABLE`) 구문은 반드시 BigQuery 표준 그래프 레퍼런스 구문을 준수해야 합니다.
   * BigQuery 예약어 및 노드/에지 레이블 명칭(`Order`, `User`, `Placed`, `OrderedItem`, `Triggered`, `Event`, `Product`)은 GQL 패턴 작성 시 반드시 **백틱(\`)**으로 감싸야 합니다 (예: `(u:\`User\`)-[p:\`Placed\`]->(o:\`Order\`)`). 백틱 누락 시 `Syntax error: Unexpected keyword ORDER` 에러가 발생하므로 템플릿 프롬프트(`agentPrompts.js`)에 이를 강제 보장합니다.
5. **Data Agent 쿼리 실행 자동 재시도 (Auto-Retry Loop)**:
   * Data Agent가 생성한 SQL/GQL 쿼리 실행 중 문법/예약어 오류가 발생할 경우, 사용자에게 오류를 수동 수정하도록 미루지 않고 백엔드(`server.js`)에서 1회 자동 재시도를 수행합니다.
   * 에러 메시지를 Gemini에 다시 전달하여 예약어 백틱 감싸기 및 구문 보완 조치가 적용된 수정 쿼리를 받아 재실행 후 결과를 자동 복구 및 반환합니다.
6. **React Frontend 안전 렌더링 수칙 (백화 현상 방지)**:
   * React 컴포넌트 렌더링 시 정의되지 않은 가상 컴포넌트(예: `MermaidDiagram`) 호출로 인한 `ReferenceError` 런타임 렌더링 붕괴(White Screen Crash)를 엄격히 금지합니다.
   * 모든 마크다운 및 머메이드 다이어그램은 이미 검증된 `MarkdownRenderer` 컴포넌트를 사용하고, 반드시 세이프 가드 널 체크(`activeGraph?.ddl || ''`)를 적용합니다.

---

## 5. 서버 가용성 및 프로세스 격리 수칙
* 백엔드 API 서버(`server.js`, 3003 포트)는 자동 재기동 샌티널 셸 스크립트(`start_server.sh`)를 통해 백그라운드로 항시 상주 구동합니다.
* 개발 과정에서 코드 변경 후 프로세스가 다운되더라도 1초 이내에 자동 수복되어 `Failed to fetch` 접속 단절 장애가 재발하지 않습니다.
