/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * 🤖 Data Agent Semantic Query & Self-Healing Prompt Module
 * 
 * @module agentChatPrompts
 * @epic EPIC-006 (Data Agent Semantic Query & Self-Healing)
 * @description 자연어 질의 분석, 하이브리드(SQL/GQL) 전략 수립, 오류 시 1회 자율수복(Self-Healing), 4단계 Provenance 최종 리포트 합성 및 SQL/RAG 보조 모듈
 */

/**
 * [EPIC-006] 데이터 에이전트 - 자연어 ➔ SQL/GQL 하이브리드 전략 수립 프롬프트
 * 
 * @epic EPIC-006 (Data Agent Semantic Query & Self-Healing)
 * @menu 🤖 1. Agent Evolution Studio / Data Agent (Dataset Chat) 탭
 * @api POST /api/data-agent-chat (Step 1: Strategy & Query Generation)
 * @param {string} question - 사용자 자연어 질문
 * @param {string} projectId - GCP 프로젝트 ID
 * @param {string} datasetId - BigQuery 데이터셋 ID
 * @param {Object} contextSchema - 스키마 및 위키 맥락 정보
 * @returns {string} Gemini 프롬프트 문자열
 */
export function getSqlGenerationPrompt(question, projectId, datasetId, contextSchema) {
  const defaultGraphName = `${projectId}.${datasetId}.thelookgraph3`;
  return `당신은 BigQuery 및 Property Graph 온톨로지 에이전트 전문가입니다. 사용자의 질문과 제공된 테이블 스키마 및 비즈니스 위키 컨텍스트를 기반으로, 가장 적합한 실행 전략(Strategy)을 결정하고 쿼리/답변 계획을 세우십시오.

전략 결정 가이드:
1. "DIRECT_WIKI": DB 조회 없이 사내 위키 문서, 환불/교환 정책, 단순 비즈니스 규칙 설명만으로 직접 답변 가능한 질문인 경우. (sql 및 gql은 빈 문자열로 설정)
2. "HYBRID": DB 데이터를 조회해야 하는 대부분의 분석 질문. 질문의 수치 통계 분석과 다자간 네트워크 관계 추적을 모두 지원하기 위해, 표준 BigQuery SQL과 Property Graph GQL(\`GRAPH_TABLE\`) 쿼리를 **동시에** 도출하십시오.
   - 단, Property Graph가 존재하지 않거나 단순 1개 테이블 조회인 경우에는 한 쪽 쿼리만 작성하고 나머지는 빈 문자열로 두어도 됩니다.

⚠️ BigQuery Property Graph GQL 엄격 구문 규격 (필수 준수):
- BigQuery GQL 구문 형식:
  SELECT * FROM GRAPH_TABLE(\`${projectId}.${datasetId}.thelookgraph3\`
    MATCH (u:\`User\`)-[p:\`Placed\`]->(o:\`Order\`)-[i:\`OrderedItem\`]->(pr:\`Product\`)
    WHERE o.status = 'Complete'
    RETURN u.id AS user_id, u.first_name AS user_name, o.order_id AS order_id, pr.name AS product_name
  ) LIMIT 10
- **예약어 백틱 감싸기 필수**: BigQuery 예약어 또는 노드/에지 레이블 명칭(\`User\`, \`Order\`, \`Placed\`, \`OrderedItem\`, \`Triggered\`, \`Event\`, \`Product\`)은 반드시 백틱(\`)으로 감싸야 신택스 에러가 발생하지 않습니다.
  - 올바른 예: \`(u:\`User\`)-[p:\`Placed\`]->(o:\`Order\`)\`
  - 잘못된 예: \`(u:User)-[p:Placed]->(o:Order)\` (Order가 예약어로 인식되어 Syntax error 발생!)

반환 포맷:
반드시 아래 JSON 구조 형태로만 출력하십시오. 코드 블록(\`\`\`json ...)으로 감싸서 출력하십시오:
{
  "strategy": "HYBRID" | "DIRECT_WIKI",
  "targetGraph": "${defaultGraphName}",
  "reasoningProcess": "1. 질문 분석 ➔ 2. 백링크 탐색 ➔ 3. 전략 결정...",
  "sql": "실행할 표준 BigQuery SELECT/JOIN SQL (전략이 DIRECT_WIKI이거나 작성 불가 시 빈 문자열)",
  "gql": "실행할 GRAPH_TABLE Property Graph 쿼리 (전략이 DIRECT_WIKI이거나 작성 불가 시 빈 문자열)"
}

사용자 질문: "${question}"
대상 프로젝트.데이터셋: ${projectId}.${datasetId}
기본 Property Graph 이름: ${defaultGraphName}
사용 가능한 스키마 컨텍스트:
${JSON.stringify(contextSchema)}`;
}

/**
 * [EPIC-006] 쿼리 오류 발생 시 백엔드 1회 자동 자율 수복(Self-Healing) 교정 쿼리 도출 프롬프트
 * 
 * @epic EPIC-006 (Data Agent Semantic Query & Self-Healing)
 * @menu 🤖 1. Agent Evolution Studio / Data Agent (Dataset Chat) 탭
 * @api POST /api/data-agent-chat (Step 2: Self-Healing Auto-Correction)
 * @param {string} queryType - 쿼리 타입 ("SQL" 또는 "GQL")
 * @param {string} errorMessage - BigQuery가 반환한 오류 메시지
 * @param {string} queryText - 실패한 쿼리 원문
 * @returns {string} Gemini 프롬프트 문자열
 */
export function getQueryHealingPrompt(queryType, errorMessage, queryText) {
  return `방금 도출된 ${queryType} 쿼리에서 BigQuery 오류가 발생했습니다: "${errorMessage}".
에러 원인을 파악하여 예약어 백틱(\`) 감싸기 예외 처리나 표준 구문을 수정한 올바른 쿼리문만 JSON 포맷({ "sql": "수정된 쿼리" })으로 재도출해줘.

실패한 쿼리:
${queryText}`;
}

/**
 * [EPIC-006] 데이터 에이전트 - 쿼리 결과 기반 최종 분석 보고서 작성 프롬프트 (언어 스위치 kr/en 지원)
 * 
 * @epic EPIC-006 (Data Agent Semantic Query & Self-Healing)
 * @menu 🤖 1. Agent Evolution Studio / Data Agent (Dataset Chat) 탭
 * @api POST /api/data-agent-chat (Step 3: Final Answer Generation)
 * @param {string} question - 사용자 자연어 질문
 * @param {string} sqlQuery - 실행된 BigQuery Standard SQL
 * @param {string} sqlError - SQL 실행 에러 메시지 (없으면 null)
 * @param {Array} sqlRows - SQL 실행 결과 데이터 행
 * @param {string} gqlQuery - 실행된 Property Graph GQL
 * @param {string} gqlError - GQL 실행 에러 메시지 (없으면 null)
 * @param {Array} gqlRows - GQL 실행 결과 데이터 행
 * @param {string} [language='kr'] - 응답 도출 언어 스위치 ('kr' 또는 'en')
 * @returns {string} Gemini 프롬프트 문자열
 */
export function getFinalAnswerPrompt(question, sqlQuery, sqlError, sqlRows, gqlQuery, gqlError, gqlRows, language = 'kr') {
  if (language === 'en') {
    return `You are a friendly data analyst agent. Please answer the user's question by combining the execution results of two engines (Standard SQL and Graph GQL) run on BigQuery and the provided GCS wiki knowledge (Feedback Loop context) below.

Answer Guidelines:
1. **Final Analysis Report**: Combine statistical figures (SQL result) and relationship patterns (GQL result) harmoniously to provide a clear and friendly summary.
2. **Comparison & Decision Explanations (Important)**:
   - Check if there are differences in the results of the two queries or if data is only present on one side.
   - Clearly explain in the report the analysis/comparison judgment (Hybrid Decision) regarding which of the SQL and GQL results was used as the basis for your decision, or how they were used complementarily to extract knowledge.
3. **Error Explanation**: If an error occurred during query execution, mention what the issue was.

⚠️ Language & Citation Rules:
- **REQUIRED**: The final answer, analysis, summary, and all explanations MUST be written in **English**.
- **Wiki Document Citations**: If you referenced internal Wiki insights documents (e.g. \`vip_customer_report.md\`), clearly specify the document name at the bottom or in the relevant context (e.g. \`📄 [Reference: vip_customer_report.md]\`).

User Question: "${question}"

[Execution Info]
- Standard SQL Executed:
\`\`\`sql
${sqlQuery || 'Not executed'}
\`\`\`
- SQL Error: ${sqlError || 'None'}
- SQL Rows (Top 30):
${JSON.stringify((sqlRows || []).slice(0, 30))}

- Graph GQL Executed:
\`\`\`sql
${gqlQuery || 'Not executed'}
\`\`\`
- GQL Error: ${gqlError || 'None'}
- GQL Rows (Top 30):
${JSON.stringify((gqlRows || []).slice(0, 30))}

Generate the final analysis report in Markdown format.`;
  }

  // Default: Korean
  return `당신은 친절한 데이터 분석가 에이전트입니다. 빅쿼리에서 실행된 두 가지 엔진(표준 SQL 및 그래프 GQL)의 실행 결과와 아래 함께 제공된 사내 GCS 위키 지식(Feedback Loop 컨텍스트)을 결합하여 사용자의 질문에 답변하십시오.

답변 가이드라인:
1. **최종 분석 리포트**: 통계치(SQL 결과)와 관계 패턴(GQL 결과)을 조화롭게 결합하여 명확하고 친절한 요약을 제공하십시오.
2. **비교 판단 및 의사결정 설명 (중요)**:
   - 두 쿼리의 결과에 다른 부분이 있는지, 혹은 데이터가 한쪽에만 있는지 확인하십시오.
   - SQL 결과와 GQL 결과 중 어떤 것을 근거로 어떤 판단을 내렸는지, 혹은 어떻게 상호 보완적으로 지식을 추출했는지에 대한 분석/비교 판단(Hybrid Decision)을 리포트 내에 명확히 설명하십시오.
3. **에러 설명**: 만약 쿼리 실행 중 에러가 발생했다면 무엇이 문제였는지 언급해주십시오.

⚠️ 언어 및 인용 규칙:
- **필수**: 최종 답변, 분석, 요약 및 모든 설명은 반드시 **한국어(Korean)**로 작성해야 합니다.
- **위키 문서 인용**: 컨텍스트에 포함된 사내 위키 인사이트 문서(예: \`vip_customer_report.md\`)의 비즈니스 규정/인사이트를 참조한 경우, 답변 하단 또는 관련 문맥에 해당 문서명(예: \`📄 [참조: vip_customer_report.md]\`)을 명확히 표시하십시오.

사용자 질문: "${question}"

[실행 정보]
- 실행된 표준 SQL:
\`\`\`sql
${sqlQuery || '실행되지 않음'}
\`\`\`
- SQL 실행 에러: ${sqlError || '없음'}
- SQL 결과 (상위 30개 행):
${JSON.stringify((sqlRows || []).slice(0, 30))}

- 실행된 그래프 GQL:
\`\`\`sql
${gqlQuery || '실행되지 않음'}
\`\`\`
- GQL 실행 에러: ${gqlError || '없음'}
- GQL 결과 (상위 30개 행):
${JSON.stringify((gqlRows || []).slice(0, 30))}

마크다운 형식으로 최종 답변을 생성하십시오.`;
}

/**
 * [EPIC-006] 빅쿼리 최적화 SQL 쿼리 추천 및 해설 프롬프트
 * 
 * @epic EPIC-006 (Data Agent Semantic Query & Self-Healing)
 * @menu Tables 탭 ➔ Preview 서브 탭 ➔ SQL Helper
 * @api GET /api/sql-helper
 * @param {string} tableId - BigQuery 테이블 ID
 * @param {Array} schema - 테이블 스키마 정의 객체
 * @param {Array} rows - 샘플 데이터 행
 * @returns {string} Gemini 프롬프트 문자열
 */
export function getSqlHelperPrompt(tableId, schema, rows) {
  return `당신은 빅쿼리 성능 최적화 전문가입니다. 다음 테이블 스키마와 샘플 데이터를 기반으로, 이 테이블에 적합한 최적화된 샘플 SQL 쿼리 3개를 생성하십시오.
마크다운 형식으로 보고서를 생성하십시오.

⚠️ 언어 규칙:
- **필수**: 쿼리가 계산하는 내용에 대한 설명, 성능 최적화 팁 및 모든 해설은 반드시 **한국어(Korean)**로 작성해야 합니다.

테이블: ${tableId}
스키마: ${JSON.stringify(schema)}
샘플 데이터: ${JSON.stringify(rows)}`;
}

/**
 * [EPIC-006] 시맨틱 검색 및 RAG 벡터 인덱스 설계 프롬프트
 * 
 * @epic EPIC-006 (Data Agent Semantic Query & Self-Healing)
 * @menu Tables 탭 ➔ Catalog Info ➔ RAG Design
 * @api GET /api/rag-design
 * @param {string} tableId - 테이블 식별자
 * @param {Array} schema - 스키마 정보
 * @param {Array} rows - 샘플 데이터
 * @returns {string} Gemini 프롬프트 문자열
 */
export function getRagDesignPrompt(tableId, schema, rows) {
  return `당신은 RAG (Retrieval-Augmented Generation) 및 벡터 검색을 전문으로 하는 AI 아키텍트입니다.
이 빅쿼리 테이블의 데이터를 사용하여 의미론적 검색(Semantic Search) 또는 RAG 인덱스를 설계하는 방법을 제안하십시오.
마크다운 형식으로 상세한 설계 보고서를 생성하십시오.

⚠️ 언어 규칙:
- **필수**: 모든 임베딩 전략, 저장소 전략, 메타데이터 전략 및 설명은 반드시 **한국어(Korean)**로 작성해야 합니다.
- SQL 코드 블록, technical names 및 컬럼명은 원래의 영어/기술적 형식을 유지해야 합니다.

보고서 구조:
1. 임베딩 전략 (Embedding Strategy): 검색 정확도를 높이기 위해 어떤 컬럼들을 결합하여 텍스트 임베딩으로 변환할 것인가? 추천 임베딩 모델(예: text-embedding-004) 기술. (한글로 작성)
2. 저장소 전략 (Storage Strategy): 벡터 데이터를 어디에 저장하고 인덱싱할 것인가 (예: BigQuery Vector Search, Vertex AI Vector Search 등). (한글로 작성)
3. 메타데이터 필터링 전략 (Metadata Strategy): 하이브리드 검색 또는 사전 필터링을 위해 어떤 컬럼을 메타데이터로 남겨둘 것인가? (한글로 작성)
4. 벡터 검색 SQL 예시 (Query Example): BigQuery의 VECTOR_SEARCH 함수를 사용하여 이 데이터에 대해 의미론적 유사도 검색을 수행하는 SQL 쿼리 예시 작성. (SQL은 영어, 설명은 한글로 작성)

테이블: ${tableId}
스키마: ${JSON.stringify(schema)}
샘플 데이터: ${JSON.stringify(rows)}`;
}
