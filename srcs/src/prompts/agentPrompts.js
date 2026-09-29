/**
 * 📝 AI Agents System Prompts Specification (Koreanized & Centralized Prompt Repository)
 * 
 * [수행 역할 및 비즈니스 프로세스]
 * 본 모듈은 온톨로지 플랫폼 내의 모든 AI 에이전트들이 사용하는 핵심 프롬프트 명세들을 단일 관리(SSOT)합니다.
 * 주요 프롬프트 명세:
 * 1. getAdvancedSchemaPrompt & getProfilePrompt: 빅쿼리 스키마/샘플 데이터 기반 데이터 품질 분석 및 OKF 명세 보고서 템플릿.
 * 2. getGraphDesignPrompt & getDatasetGraphPrompt: RDB 외래키 구조 분석 기반 Spanner/BigQuery Property Graph DDL 및 GQL 생성.
 * 3. getSqlGenerationPrompt: 사용자 질의에 적합한 하이브리드 실행 전략(SQL/GQL) 도출 및 예약어 백틱(\`) 자동 이스케이프 주입 규칙 명세.
 * 4. getFinalAnswerPrompt: 데이터 및 위키 지식 연계 최종 종합 한국어/영어 보고서 합성 가이드라인.
 * 5. getEnrichmentPrompt & getLlmWikiDecomposePrompt: 비정형 비즈니스 문서 해체 및 테이블 OKF 명세 자동 상호 참조 백링크(RDB FK, Graph Edge) 보강.
 * 6. getQueryHealingPrompt: 쿼리 오류 대응 자율 수복용 AI 수정 템플릿.
 * 7. getFeedbackRefinePrompt: 사용자 실시간 대화 피드백 반영 교정 템플릿.
 */

/**
 * 테이블 데이터 프로파일링 & 품질 분석 프롬프트
 */
export function getProfilePrompt(tableId, schema, rows) {
  return `당신은 수석 데이터 엔지니어입니다. 다음 빅쿼리 테이블 스키마와 처음 10개 행의 샘플 데이터를 분석하십시오.
마크다운 형식으로 상세한 데이터 프로파일링 및 품질 분석 보고서를 생성하십시오.

⚠️ 언어 규칙:
- **필수**: 모든 분석, 설명, 컬럼별 제언 및 본문은 반드시 **한국어(Korean)**로 작성해야 합니다.
- 기술적 식별자, 테이블명, 컬럼명, 그리고 SQL 코드 블록(예: ASSERT 구문)은 원래의 영어/기술적 형식을 유지해야 합니다.

보고서 구조:
1. 데이터 품질 개요 (Data Quality Overview): Null 비율, 데이터 이상치 가능성, 포맷 오류 분석. (한글로 작성)
2. 필드별 세부 분석 및 제언 (Field-by-field Analysis): 각 컬럼의 의미적 데이터 정합성 판단 및 타입 개선 추천 (예: STRING을 DATE/TIMESTAMP로 변경 권장 여부 등). (한글로 작성)
3. 권장 데이터 품질 검증 규칙 (Suggested Data Quality Rules): 테이블을 실시간 모니터링하기 위한 BigQuery ASSERT 구문 예시 3개 이상 제공. (SQL은 영어, 설명은 한글로 작성)

테이블: ${tableId}
스키마: ${JSON.stringify(schema)}
샘플 데이터: ${JSON.stringify(rows)}`;
}

/**
 * Advanced Schema & Data Insights 수집 프롬프트 (Data Profile, Data Quality, Lineage, Insights, DDL 통합)
 */
export function getAdvancedSchemaPrompt(tableId, schema, rows, ddl, metadataSummary) {
  return `당신은 Google Cloud 데이터 거버넌스 및 온톨로지 수석 아키텍트입니다.
제공된 BigQuery 테이블의 DDL, 메타데이터, 스키마, 그리고 샘플 데이터를 정밀 심층 분석하여 OKF(Open Knowledge Format) 명세 생성을 위한 [Advanced Schema & Insights 종합 분석 보고서]를 작성하십시오.

⚠️ 언어 규칙:
- **필수**: 보고서의 모든 인사이트 설명, 퀄리티 제언, 데이터 리니지 추론 및 본문은 반드시 **한국어(Korean)**로 작성하십시오.
- 물리 식별자, 테이블명, 컬럼명, DDL 및 SQL 구문은 원본 영문을 유지하십시오.

보고서 구성 항목:
1. 📊 데이터 프로파일링 & 통계 인사이트 (Data Profile & Insights)
   - 데이터 분포, 카디널리티(Cardinality) 분석 및 비즈니스적 핵심 관점(Key Drivers) 도출.
2. 🛡️ 데이터 퀄리티 & 정합성 진단 (Data Quality & Integrity)
   - Null 가능성, 데이터 타당성 검증 규칙(ASSERT 구문 예시) 및 품질 모니터링 가이드.
3. 🔗 추론 데이터 리니지 (Inferred Data Lineage & Relationships)
   - Foreign Key 추정, 업스트림/다운스트림 파이프라인 연관성 및 조인(Join) 키 추천.
4. 📜 BigQuery DDL 구문 (Table DDL Statement)
   - 아래 제공된 DDL 원문을 정갈하게 코드 블록으로 배치하고, 파티셔닝/클러스터링 설계 평가는 한글로 작성.

테이블 ID: ${tableId}
메타데이터 요약: ${JSON.stringify(metadataSummary || {})}
DDL 구문:
\`\`\`sql
${ddl || 'DDL 정보가 존재하지 않습니다.'}
\`\`\`
스키마: ${JSON.stringify(schema)}
샘플 데이터 (10 Rows): ${JSON.stringify(rows)}`;
}

/**
 * 그래프 데이터베이스 모델링 및 스키마 설계 프롬프트
 */
export function getGraphDesignPrompt(tableId, schema, rows) {
  return `당신은 그래프 데이터베이스 아키텍트입니다. 다음 빅쿼리 테이블 스키마와 샘플 데이터를 기반으로, Cypher 기반 그래프 DB(예: Neo4j) 또는 Spanner Graph에 적합한 그래프 데이터베이스 스키마(노드, 관계, 속성)를 설계하십시오.
마크다운 형식으로 상세한 설계 보고서를 생성하십시오.

⚠️ 언어 규칙:
- **필수**: 모든 노드/관계 설명, 설계 근거 및 상세 설명은 반드시 **한국어(Korean)**로 작성해야 합니다.
- 노드 레이블, 관계 타입, 속성명, 그리고 Cypher 코드 블록은 원래의 영어/기술적 형식을 유지해야 합니다.

보고서 구조:
1. 노드 정의 (Node Labels): 각 노드 레이블의 비즈니스적 정의 및 속성(Properties) 목록. (한글로 작성)
2. 관계 정의 (Relationship Types): 노드 간 관계(예: (:User)-[:PLACED]->(:Order)) 및 관계 속성 정의. (한글로 작성)
3. Cypher 코드 예시 (Cypher Examples):
   - 해당 테이블 데이터로부터 그래프 노드/관계를 생성하는 Cypher 구문. (Cypher는 영어로 작성)
   - 일반적인 그래프 탐색 쿼리 예시 (예: 이상 경로 추적, 추천 등). (Cypher는 영어, 설명은 한글로 작성)
4. 설계 근거 (Rationale): 해당 그래프 설계 모델이 비즈니스 지식 관계 규명에 유리한 이유 기술. (한글로 작성)

테이블: ${tableId}
스키마: ${JSON.stringify(schema)}
샘플 데이터: ${JSON.stringify(rows)}`;
}

/**
 * 빅쿼리 최적화 SQL 쿼리 생성 프롬프트
 */
export function getSqlHelperPrompt(tableId, schema, rows) {
  return `당신은 빅쿼리 성능 최적화 전문가입니다. 다음 테이블 스키마와 샘플 데이터를 기반으로, 이 테이블에 적합한 최적화된 샘플 SQL 쿼리 3개를 생성하십시오.
마크다운 형식으로 보고서를 생성하십시오.

⚠️ 언어 규칙:
- **필수**: 쿼리가 계산하는 내용에 대한 설명, 성능 최적화 팁 및 모든 해설은 반드시 **한국어(Korean)**로 작성해야 합니다.
- SQL 코드 블록은 영어로 유지해야 합니다.

보고서 구조:
1. Query 1: 기본 분석 (Basic Analysis) - 집계, 단순 필터링 및 정렬. (SQL은 영어, 설명은 한글로 작성)
2. Query 2: 중간 난이도 분석 (Medium Complexity) - 윈도우 함수(Window Functions), 날짜 파티션 기반 분석 등. (SQL은 영어, 설명은 한글로 작성)
3. Query 3: 고급 분석 (Advanced Analysis) - 복잡한 조인, 배열 조작(UNNEST), 또는 정규식 활용. (SQL은 영어, 설명은 한글로 작성)

각 쿼리별 제공 사항:
- SQL 코드 블록.
- 해당 쿼리가 가지는 비즈니스적 의미에 대한 상세 설명. (한글로 작성)
- 성능 팁 (예: 파티셔닝/클러스터링 활용 방법 등). (한글로 작성)

테이블: ${tableId}
스키마: ${JSON.stringify(schema)}
샘플 데이터: ${JSON.stringify(rows)}`;
}

/**
 * 시맨틱 검색 및 RAG 벡터 인덱스 설계 프롬프트
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

/**
 * 다중 테이블 관계 기반 통합 프로퍼티 그래프(Property Graph) DDL 생성 프롬프트
 */
export function getDatasetGraphPrompt(projectId, datasetId, tableSchemas, graphName = 'thelookgraph') {
  return `당신은 수석 그래프 데이터베이스 아키텍트입니다. 다음 테이블들을 연결하는 통합 빅쿼리 프로퍼티 그래프(Property Graph) DDL을 설계하십시오.
이 테이블들 간의 관계(예: user_id, order_id, product_id와 같은 외래 키 및 조인 매핑)를 분석하십시오.

⚠️ BigQuery Property Graph 구문 필수 규칙 (Strict Syntax Rules):
1. **KEY 키워드 및 식별자 규칙**:
   - NODE TABLES 내부에는 반드시 \`KEY (\`id\`)\` 또는 실제 PK 컬럼을 명시하고, 레이블 식별자 및 속성을 \`LABEL \`User\` PROPERTIES (id AS \`id\`, name AS \`name\`)\` 형태로 정의하십시오.
2. **EDGE TABLES 참조 규칙 (중요)**:
   - SOURCE KEY 및 DESTINATION KEY는 반드시 노드 레이블명과 괄호 안의 참조 키를 함께 명시해야 합니다.
   - **올바른 구문 예시 (MUST FOLLOW THIS FORMAT)**:
     \`\`\`sql
     EDGE TABLES (
       \`${projectId}.${datasetId}.orders\` AS \`Order\`
         KEY (\`order_id\`)
         SOURCE KEY (\`user_id\`) REFERENCES \`User\` (\`id\`)
         DESTINATION KEY (\`order_id\`) REFERENCES \`Order\` (\`order_id\`)
         LABEL \`PLACED\` PROPERTIES (created_at AS \`created_at\`, status AS \`status\`),
       \`${projectId}.${datasetId}.order_items\` AS \`OrderedItem\`
         KEY (\`id\`)
         SOURCE KEY (\`order_id\`) REFERENCES \`Order\` (\`order_id\`)
         DESTINATION KEY (\`product_id\`) REFERENCES \`Product\` (\`id\`)
         LABEL \`ORDERED_ITEM\` PROPERTIES (id AS \`id\`, sale_price AS \`sale_price\`)
     )
     \`\`\`
   - **절대 금지 사항**: EDGE TABLES 구문에 'CONTAINS'와 같은 예예약어나 표준 BQ 문법에 맞지 않는 키워드를 사용하지 마십시오. REFERENCES 뒤에는 반드시 이미 정의된 노드 테이블 레이블명(예: \`User\`, \`Order\`, \`Product\`)을 지정하십시오.

⚠️ 언어 규칙:
- 모든 노드/에지 테이블 설명, 관계 정의 근거 및 쿼리 설명은 반드시 **한국어(Korean)**로 작성해야 합니다.
- SQL DDL 구문과 그래프 쿼리는 영어로 유지해야 합니다.

보고서 구조:
1. 노드 테이블 정의 (Node Tables): 한글 설명
2. 에지 테이블 정의 (Edge Tables): 한글 설명
3. 프로퍼티 그래프 생성 DDL (BigQuery Graph DDL):
   반드시 다음의 명시적인 sql 코드 펜스 블록을 포함해야 하며, 그래프 이름은 반드시 \`${projectId}.${datasetId}.${graphName}\` 형식으로 작성해야 합니다:
   \`\`\`sql
   CREATE OR REPLACE PROPERTY GRAPH \`${projectId}.${datasetId}.${graphName}\`
     NODE TABLES ( ... )
     EDGE TABLES ( ... );
   \`\`\`
4. 샘플 그래프 쿼리 3개 (Sample Graph Queries): GRAPH_TABLE 쿼리 예시 3개 (SQL은 영어, 설명은 한글)

분석 대상 테이블 목록:
${JSON.stringify(tableSchemas)}`;
}

/**
 * 데이터 에이전트 - 자연어 ➔ SQL 변환 프롬프트
 */
export function getSqlGenerationPrompt(question, projectId, datasetId, contextSchema) {
  const defaultGraphName = `${projectId}.${datasetId}.thelookgraph3`;
  return `당신은 BigQuery 및 Property Graph 온톨로지 에이전트 전문가입니다. 사용자의 질문과 제공된 테이블 스키마 및 비즈니스 위키 컨텍스트를 기반으로, 가장 적합한 실행 전략(Strategy)을 결정하고 쿼리/답변 계획을 세우십시오.

전략 결정 가이드:
1. "DIRECT_WIKI": DB 조회 없이 사내 위키 문서, 환불/교환 정책, 단순 비즈니스 규칙 설명만으로 직접 답변 가능한 질문인 경우. (sql 및 gql은 빈 문자열로 설정)
2. "HYBRID": DB 데이터를 조회해야 하는 대부분의 분석 질문. 질문의 수치 통계 분석과 다자간 네트워크 관계 추적을 모두 지원하기 위해, 표준 BigQuery SQL과 Property Graph GQL(\`GRAPH_TABLE\`) 쿼리를 **동시에** 도출하십시오.
   - 단, Property Graph가 존재하지 않거나 단순 1개 테이블 조회인 경우에는 한 쪽 쿼리만 작성하고 나머지는 빈 문자열로 두어도 됩니다.

⚠️ BigQuery Property Graph GQL 엄격 구문 규격 (필수 준수):
- 기본 Property Graph: \`${defaultGraphName}\`
- 노드(Node) 테이블 및 레이블:
  - \`User\`: (u:\`User\`) 속성: id, first_name, last_name, email, age, gender, state, city, country, traffic_source
  - \`Order\`: (o:\`Order\`) 속성: order_id, status, created_at, num_of_item
  - \`Product\`: (pr:\`Product\`) 속성: id, cost, category, name, brand, retail_price, department
  - \`Event\`: (ev:\`Event\`) 속성: id, session_id, created_at, ip_address, browser, traffic_source, uri, event_type
- 에지(Edge) 테이블 및 레이블 (대소문자/언더스코어 엄격 일치 필수):
  - \`PLACED\`: (u:\`User\`)-[p:\`PLACED\`]->(o:\`Order\`) (속성: created_at, status)
  - \`ORDERED_ITEM\`: (o:\`Order\`)-[oi:\`ORDERED_ITEM\`]->(pr:\`Product\`) (속성: id, status, sale_price, created_at, shipped_at, delivered_at)
  - \`TRIGGERED_EVENT\`: (u:\`User\`)-[te:\`TRIGGERED_EVENT\`]->(ev:\`Event\`) (속성: created_at, event_type)
- ⚠️ GQL GRAPH_TABLE 핵심 제약 사항 (위반 시 Syntax Error 발생):
  1. GRAPH_TABLE(...) 내부에는 \`GROUP BY\` 또는 \`HAVING\`을 절대 작성할 수 없습니다!
  2. 집계(SUM, COUNT)나 그룹화, HAVING 조건 필터링이 필요할 경우, 반드시 GRAPH_TABLE 결과를 외부 표준 SQL 서브쿼리로 감싸서 처리하십시오:
     [올바른 예시]:
     SELECT user_id, user_name, COUNT(DISTINCT order_id) AS total_orders, SUM(sale_price) AS total_spend
     FROM GRAPH_TABLE(\`${defaultGraphName}\`
       MATCH (u:\`User\`)-[p:\`PLACED\`]->(o:\`Order\`)-[oi:\`ORDERED_ITEM\`]->(pr:\`Product\`)
       WHERE o.status = 'Complete'
       RETURN u.id AS user_id, u.first_name AS user_name, o.order_id AS order_id, oi.sale_price AS sale_price
     ) AS T
     GROUP BY user_id, user_name
     HAVING total_spend >= 1000
     ORDER BY total_spend DESC
     LIMIT 10;
- **예약어 백틱 감싸기 필수**: BigQuery 예약어 또는 노드/에지 레이블 명칭(\`User\`, \`Order\`, \`Product\`, \`Event\`, \`PLACED\`, \`ORDERED_ITEM\`, \`TRIGGERED_EVENT\`)은 반드시 백틱(\`)으로 감싸야 합니다.

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
 * 데이터 에이전트 - 쿼리 결과 기반 최종 한글 분석 답변 생성 프롬프트
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
- Executed Standard SQL:
\`\`\`sql
${sqlQuery || 'Not executed'}
\`\`\`
- SQL Execution Error: ${sqlError || 'None'}
- SQL Result (Top 30 rows):
${JSON.stringify((sqlRows || []).slice(0, 30))}

- Executed Graph GQL:
\`\`\`sql
${gqlQuery || 'Not executed'}
\`\`\`
- GQL Execution Error: ${gqlError || 'None'}
- GQL Result (Top 30 rows):
${JSON.stringify((gqlRows || []).slice(0, 30))}

Generate the final answer in Markdown format.`;
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
 * 비정형 원본 가이드라인 문서를 OKF 유형 A (BusinessSpecification) 포맷으로 변환하는 프롬프트
 */
export function getOkfBusinessSpecPrompt(fileName, content, datasetId) {
  return `당신은 데이터 거버넌스 및 OKF(Open Knowledge Format) 전문가입니다.
제시된 비정형 비즈니스 문서 "${fileName}"를 분석하여 OKF 유형 A (BusinessSpecification) 포맷으로 변환하십시오.

⚠️ 지침:
1. 문서 최상단에 YAML Frontmatter를 추가하십시오.
   - type: BusinessSpecification
   - datasetId: ${datasetId || '알수없음'}
   - targetTables: [관련 물리 테이블 목록 추출]
   - tags: [관련 태그 추출]
2. 본문 내용은 기존 의미를 유지하되, 명확한 헤더와 서브 타이틀을 사용하여 구조화하십시오.
3. 모든 설명과 내용은 **한국어(Korean)**로 유지하십시오.

출력은 반드시 유효한 마크다운이어야 하며, YAML Frontmatter로 시작해야 합니다. 대화형 인사말이나 코드 블록 펜스는 제외하십시오.`;
}

/**
 * 빅쿼리 데이터셋 메타데이터와 테이블 목록을 기반으로 OKF 데이터셋 명세서(datasets/[datasetId].md)를 생성하는 프롬프트
 */
export function getDatasetOkfPrompt(datasetId, bqMetadata, tablesList) {
  return `당신은 데이터 거버넌스 및 OKF(Open Knowledge Format) 전문가입니다.
제시된 빅쿼리 데이터셋 메타데이터와 하위 테이블 정보를 분석하여 OKF 데이터셋 명세서(BigQuery Dataset)를 작성하십시오.

데이터셋 ID: ${datasetId}
BigQuery 메타데이터:
- 설명: ${bqMetadata.description || '없음'}
- 위치: ${bqMetadata.location || 'UNKNOWN'}
- 생성 시각: ${bqMetadata.creationTime || 'UNKNOWN'}

하위 테이블 목록:
${JSON.stringify(tablesList, null, 2)}

⚠️ 지침:
1. 문서 최상단에 YAML Frontmatter를 작성하십시오.
   - type: BigQuery Dataset
   - title: ${datasetId} Dataset
   - description: 데이터셋의 핵심 역할을 1문장으로 요약
   - resource: https://console.cloud.google.com/bigquery?d=${datasetId}
   - tags: [관련 태그 목록]
2. 본문 구조:
   - # Overview: 이 데이터셋의 비즈니스 목적, 주요 도메인 범위 설명 (한글로 풍부하게 작성)
   - # Key Tables: 하위 테이블 목록과 각각의 핵심 역할 요약 링크 포함 (예: - [테이블명](/tables/테이블명.md) - 설명)
3. 모든 설명용 텍스트는 반드시 **한국어(Korean)**로 생성하십시오.

출력은 반드시 유효한 마크다운이어야 하며, YAML Frontmatter로 시작해야 합니다. 대화형 인사말이나 코드 블록 펜스는 제외하십시오.`;
}

/**
 * GCS 위키 문서셋을 기반으로 기존 테이블 OKF 명세서 내용을 자율 보강(Enrichment)하는 프롬프트
 */
export function getEnrichmentPrompt(tableName, okfContent, wikiDocsJson) {
  return `당신은 수석 데이터 스튜어드(Data Steward)입니다. 귀하의 임무는 제공된 사내 비즈니스 위키 문서를 활용하여 빅쿼리 테이블 "${tableName}"의 OKF(Open Knowledge Format) 명세서 문서를 풍부하게 보강(Enrich)하는 것입니다.

대상 테이블: ${tableName}

현재 OKF 명세서 내용:
\`\`\`markdown
${okfContent}
\`\`\`

사내 비즈니스 위키 문서 세트 (지식베이스):
${wikiDocsJson}

지침:
1. 위키 문서를 분석하여 대상 테이블 "${tableName}"과 관련된 비즈니스 규칙, 컬럼 정의, 계산 로직 또는 맥락을 찾으십시오.
2. 관련 정보를 찾은 경우, OKF 문서의 YAML frontmatter 내 "description", 본문 설명, 그리고 "# Schema"의 각 컬럼 설명을 보강하십시오.
3. **보강 출처 명시 (Enriched By)**:
   - 보강된 내용이 있다면, YAML frontmatter에 \`enrichedBy\` 필드를 추가하거나 업데이트하여 참고한 위키 문서 파일명(예: \`abusive_return_policy.md\`)을 리스트 형태로 기입하십시오.
4. **상호 참조 백링크 이중 구분 작성 (MANDATORY)**:
   - **🔗 RDB FK 백링크**: 물리 테이블 간의 외래키 조인 관계 (예: RDB FK 백링크: [users](users.md) (조인 키: orders.user_id = users.id)).
   - **🕸️ Graph Property Edge 링크**: Property Graph 상의 노드-에지 방향성 릴레이션 관계 (예: Graph Edge 링크: (u:User)-[p:Placed]->(o:Order) -> [users](users.md) (에지 라벨: Placed)).
5. **필수 규칙**:
   - 보강된 모든 설명, 비즈니스 맥락 및 해설은 반드시 **한국어(Korean)**로 작성해야 합니다.
   - 기술적 식별자, 컬럼명 및 SQL 코드 블록은 영어 원문을 유지해야 합니다.
   - 절대 임의의 사실을 꾸며내지 마십시오. 오직 위키 문서에 명시적으로 존재하는 정보만 사용하십시오.
   - 업데이트된 **전체** OKF 문서를 마크다운 형식으로 반환하십시오. 대화형 인사말을 추가하거나 마크다운 외의 추가 코드 블록으로 감싸지 마십시오.
6. 위키 문서에서 관련 정보를 찾을 수 없는 경우, 현재 OKF 명세서 내용("Current OKF Content")을 수정 없이 그대로 반환하십시오.`;
}

/**
 * GitHub 문서용 영어 설명문 번역 및 오리지널 텍스트 재결합 프롬프트
 */
export function getGithubTranslationPrompt(fileName, fileContent) {
  return `당신은 번역 전문가이자 전문 테크니컬 라이터(Technical Writer)입니다.
제시된 문서 또는 소스코드("${fileName}")를 분석하여, 코드 영역을 제외한 본문의 모든 영어 문단, 리스트 항목 및 설명 바로 아래에 깔끔하게 **한국어 번역 문단**을 끼워넣어 문단별 대조본(Interleaved Translation Document)을 작성하십시오.

⚠️ 지침 & 구성 규칙:
1. **문단별 1:1 대조 배치 (Paragraph-by-Paragraph Insertion)**:
   - 원문 영문 문단(Paragraph)이나 항목 바로 아래 줄에 **"💡 [한국어 번역]"** 서두 뱃지와 함께 한국어 번역 텍스트를 끼워 넣으십시오.
   - 예시:
     Open Knowledge Format (OKF) is a universal format for representing knowledge.
     
     💡 [한국어 번역] 오픈 노리지 포맷(OKF)은 지식을 표현하기 위한 범용 프레임워크입니다.

2. **코드 및 기술적 식별자 완전 보존**:
   - 코드 블록(\`\`\`js, \`\`\`python, \`\`\`sql, \`\`\`yaml 등) 내의 실제 실행 코드는 절대 수정/번역하지 말고 원문 그대로 보존하십시오.
   - 변수명, API 이름, 파일 경로, 식별자 등은 원문 영문을 유지하십시오.

3. **인사말 및 부연설명 금지**:
   - 대화식 인사말이나 "번역이 완료되었습니다" 같은 불필요한 메타 텍스트 없이 오직 완성된 마크다운 텍스트 본문만 반환하십시오.

파일명: ${fileName}
원본 내용:
${fileContent}`;
}

/**
 * 비정형 원본 가이드라인 문서를 3가지 영역(요약, 개체/용어, 비즈니스 규칙)으로 분해하는 프롬프트
 */
export function getLlmWikiDecomposePrompt(fileName, content, existingAspects = null) {
  let existingContext = '';
  if (existingAspects) {
    existingContext = `\n\n💡 [참조] 기존 데이터셋에 정의된 용어 및 스펙 (Existing Aspects/Glossary):\n${JSON.stringify(existingAspects, null, 2)}`;
  }

  return `당신은 데이터 거버넌스 및 지식 엔지니어링 수석 아키텍트입니다.
제시된 원본 비정형 문서 "${fileName}"를 정밀 분석하여, 지식 복리 축적을 위한 3가지 전용 지식 마크다운 문서 파일로 해체 및 재구성하십시오.${existingContext}

⚠️ 중요 언어 규칙:
- **필수**: 모든 설명, 요약, 개념 정의, 테이블 매핑은 반드시 **한국어(Korean)**로 작성해야 합니다.
- 기술적 식별자, 컬럼명, 파일 경로는 영문 원문을 보존하십시오.

⚠️ **Glossary (Entities) 추출 특별 지침**:
- **기존 스펙 참조**: 제공된 "기존 데이터셋에 정의된 용어 및 스펙"이 있다면, 해당 내용의 **형식, 스타일, 그리고 정의된 용어들을 최대한 참조**하십시오.
- **상호 보완적 보완**: 기존에 정의된 용어와 중복되는 경우, 기존 정의를 해치지 않으면서 **새로운 맥락이나 규칙을 보완**하는 형태로 작성하십시오.
- **일관성 유지**: 기존에 사용된 용어의 영문 병기나 포맷팅 스타일을 준수하십시오.

분해할 3가지 구성 요소:
1. **요약 (Summary)**: 문서의 배경, 핵심 주제 및 비즈니스 목적을 깔끔하게 정리한 문서.
2. **엔티티 (Entities)**: 문서에서 식별된 핵심 명사, 용어(Term), 비즈니스 개체, 또는 물리적 BigQuery 테이블/컬럼에 대한 의미 매핑과 설명 리스트. 기존 스펙을 참고하여 보완 형태로 작성.
3. **콘셉트 (Concepts)**: 문서가 규정하는 구체적인 비즈니스 룰, 할인율, 환불 조건, 승인 단계 등의 핵심 논리(Logic) 및 정책 리스트.

반환 포맷:
반드시 아래 JSON 구조 형태로만 출력하십시오. 코드 블록(\`\`\`json ...)으로 감싸서 출력하십시오.
⚠️ 중요: JSON 객체의 문자열 값 내에 있는 모든 개행(줄바꿈) 문자는 반드시 이스케이프된 '\\n' 형태로 변환되어야 하며, 실제 줄바꿈(raw newline) 문자 그대로 출력되어선 안 됩니다.

{
  "summary": "# [문서제목] 핵심 요약\n\n여기에 마크다운 본문 작성...",
  "entities": "# [문서제목] 핵심 용어 및 엔티티 정의\n\n여기에 마크다운 본문 작성... (물리 테이블 매핑 포함)",
  "concepts": "# [문서제목] 비즈니스 규칙 및 정책\n\n여기에 마크다운 본문 작성... ( RDB 컬럼명 언급하며 조건식 기술)"
}

원본 파일명: ${fileName}
원본 내용:
${content}`;
}

/**
 * 쿼리 오류 발생 시 자율 수복(Self-Healing)을 위한 쿼리 재도출 프롬프트
 */
export function getQueryHealingPrompt(queryType, errorMessage, queryText) {
  return `방금 도출된 ${queryType} 쿼리에서 BigQuery 오류가 발생했습니다: "${errorMessage}".
에러 원인을 분석하여 다음 필수 규칙을 반영한 수정 쿼리를 JSON 포맷({ "sql": "수정된 SQL", "gql": "수정된 GQL" })으로만 재도출하십시오:
1. GQL의 경우 노드/에지 레이블 대소문자(\`User\`, \`Order\`, \`Product\`, \`Event\`, \`PLACED\`, \`ORDERED_ITEM\`, \`TRIGGERED_EVENT\`) 및 백틱(\`) 감싸기 확인.
2. GRAPH_TABLE(...) 내부에는 GROUP BY 또는 HAVING을 절대 쓰지 말고, 필요 시 외부 SQL(SELECT ... FROM GRAPH_TABLE(...) AS T GROUP BY ... HAVING ...)로 감싸서 집계할 것.

실패한 쿼리:
${queryText}`;
}

/**
 * 업로드된 가이드라인 문서 내용 기반 자동 영문 snake_case 파일명 추출 프롬프트
 */
export function getAutoNamingPrompt(content) {
  return `You are an intelligent document archiving agent. Analyze the following Markdown document content, identify its primary title and key business domain topic (e.g., terms of service, refund policy, user retention logic, order shipping rules).

Generate a concise, descriptive, and clean English snake_case file name (2 to 4 words max, e.g., "e_commerce_terms_and_refund_policy", "user_retention_rules", "monthly_sales_logic").

CRITICAL RULES:
1. Do NOT just take the first few letters or slice random text. Understand the actual semantic meaning and document title!
2. Do NOT include file extensions (like .md).
3. Return ONLY the file name string itself in snake_case format. No explanations, no quotes, no markdown wrappers.

Document Content:
"""
${content.slice(0, 3000)}
"""`;
}

/**
 * 사용자 피드백 반영 교정 답변 생성 프롬프트
 */
export function getFeedbackRefinePrompt(question, feedbackText) {
  return `You are an expert Data AI Agent. The user provided feedback correction.
User Question: "${question || '대화 결과 분석 질의'}"
User Feedback: "${feedbackText}"

Task:
Write a complete Markdown response in Korean incorporating this feedback.
`;
}

export { getDatasetGraphSynthesizerPrompt, getKcSpannerSynthesisPrompt } from './graphPrompts.js';



