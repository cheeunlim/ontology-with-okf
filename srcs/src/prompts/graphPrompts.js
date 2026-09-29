/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * 🕸️ BigQuery & Spanner Graph Synthesis Prompt Module
 * 
 * @module graphPrompts
 * @epic EPIC-005 (Dataset-Level Autonomous Graph DB Synthesizer Agent)
 * @description 테이블 단위 및 데이터셋 전수(물리 스키마 + 위키 지식 + 빈출 SQL 패턴) 지식 융합 기반 BigQuery Property Graph DDL & GQL 템플릿 자율 합성 모듈
 */

/**
 * [EPIC-005] 단일 테이블 단위 그래프 데이터베이스 모델링 및 스키마 설계 프롬프트
 * 
 * @epic EPIC-005 (Dataset-Level Autonomous Graph DB Synthesizer Agent)
 * @menu ⚙️ 3. BigQuery & Spanner Graph 탭 ➔ Table Graph View
 * @api GET /api/graph-design
 * @param {string} tableId - BigQuery 테이블 식별자
 * @param {Array} schema - 테이블 스키마 정의 객체
 * @param {Array} rows - 샘플 데이터 (상위 10행)
 * @returns {string} Gemini 프롬프트 문자열
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
 * [EPIC-005] 다중 테이블 관계 기반 통합 프로퍼티 그래프(Property Graph) DDL 생성 프롬프트
 * 
 * @epic EPIC-005 (Dataset-Level Autonomous Graph DB Synthesizer Agent)
 * @menu ⚙️ 3. BigQuery & Spanner Graph 탭 ➔ Dataset Graphs List
 * @api GET /api/dataset-graphs
 * @param {string} projectId - GCP 프로젝트 ID
 * @param {string} datasetId - 데이터셋 ID
 * @param {Array} tableSchemas - 데이터셋 내 분석 대상 테이블 스키마 배열
 * @param {string} [graphName='thelookgraph'] - 프로퍼티 그래프 이름
 * @returns {string} Gemini 프롬프트 문자열
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
 * [EPIC-005] 데이터셋 전체 스키마 OKF + 연결 위키 + 빈출 SQL 삼중 분석 기반 커스텀 Property Graph DDL 자율 합성 프롬프트
 * 
 * @epic EPIC-005 (Dataset-Level Autonomous Graph DB Synthesizer Agent)
 * @menu ⚙️ 3. BigQuery & Spanner Graph 탭 ➔ 🤖 AI 커스텀 프로퍼티 그래프 자율 합성기 (Custom Graph Synthesizer)
 * @api POST /api/graph/synthesize-dataset
 * @param {Object} params
 * @param {string} params.projectId - GCP 프로젝트 ID
 * @param {string} params.datasetId - BigQuery 데이터셋 ID
 * @param {Array} params.tablesMetadata - 데이터셋 내 모든 물리 테이블 OKF 스키마 메타데이터
 * @param {Array} params.wikiDocs - 연결된 비즈니스 위키 문서 집합
 * @param {Array} params.sqlLogs - 과거 실행된 빈출 SQL 조인 패턴 로그
 * @returns {string} Gemini 프롬프트 문자열
 */
export function getDatasetGraphSynthesizerPrompt({ projectId, datasetId, tablesMetadata, wikiDocs, sqlLogs }) {
  return `You are a Principal BigQuery Property Graph Architect AI.

Task:
Analyze the provided 3-tier knowledge inputs for dataset "${projectId}.${datasetId}":
1. Physical OKF Table Schemas & Column Descriptions
2. Connected Business Wiki Documents (Summary, Entities, Concepts, Policies)
3. Frequently executed SQL JOIN patterns and multi-hop queries

Synthesize a comprehensive, perfectly architected BigQuery Property Graph DDL (named \`okf_custom_synthesized_graph\`) and sample GQL queries.

CRITICAL BIGQUERY GQL SYNTAX RULES:
1. Wrap all node/edge labels and BigQuery keywords in BACKTICKS (\`). For example:
   - AS \`User\` (NOT AS User)
   - AS \`Order\` (NOT AS Order)
   - AS \`Placed\` (NOT AS Placed)
   - AS \`Contains\` (NOT AS Contains)
   - AS \`GovernedBy\` (NOT AS GovernedBy)
2. Follow standard BigQuery PROPERTY GRAPH DDL syntax:
   CREATE OR REPLACE PROPERTY GRAPH \`${projectId}.${datasetId}.okf_custom_synthesized_graph\`
     NODE TABLES ( ... )
     EDGE TABLES ( ... );

Return JSON ONLY matching the following schema structure:
{
  "graphName": "okf_custom_synthesized_graph",
  "customDdl": "CREATE OR REPLACE PROPERTY GRAPH ...",
  "mermaidDiagram": "graph TD\\n  ...",
  "nodes": [
    { "table": "users", "label": "User", "keys": ["id"], "properties": ["id", "first_name", "email"] }
  ],
  "edges": [
    { "table": "orders", "label": "Placed", "sourceTable": "users", "sourceKey": "user_id", "destTable": "orders", "destKey": "order_id", "properties": ["status", "created_at"] }
  ],
  "gqlTemplates": [
    { "title": "Customer Order History & Refund Rules", "gql": "GRAPH_TABLE(...)" }
  ],
  "summary": {
    "okfTablesCount": ${tablesMetadata ? tablesMetadata.length : 0},
    "wikiDocsCount": ${wikiDocs ? wikiDocs.length : 0},
    "sqlPatternsCount": ${sqlLogs ? sqlLogs.length : 0}
  }
}

Knowledge Inputs:
- Physical OKF Tables:
${JSON.stringify(tablesMetadata || [], null, 2).slice(0, 3000)}

- Connected Wiki Documents:
${JSON.stringify(wikiDocs || [], null, 2).slice(0, 2000)}

- Frequent SQL JOIN Patterns:
${JSON.stringify(sqlLogs || [], null, 2).slice(0, 1500)}
`;
}

/**
 * [EPIC-010] OKF v0.2 번들 기반 Knowledge Catalog Aspect & Spanner Graph (DDL + ISO GQL) 통합 합성 프롬프트
 *
 * @epic EPIC-010 (OKF to Knowledge Catalog & Spanner Graph Pipeline Showcase)
 * @api POST /api/kc-spanner/synthesize
 * @param {Object} params
 * @param {string} params.projectId - GCP 프로젝트 ID
 * @param {string} params.datasetId - 데이터셋 ID
 * @param {string} params.scenarioId - 시나리오 식별자 (orders | users | products)
 * @param {string} params.okfMarkdown - 원본 OKF v0.2 마크다운 문서
 * @param {string} [params.appLang='en'] - 응답 언어 ('en' | 'kr')
 * @returns {string} Gemini 프롬프트 문자열
 */
export function getKcSpannerSynthesisPrompt({ projectId, datasetId, scenarioId, okfMarkdown, appLang = 'en' }) {
  const langRule = appLang === 'en'
    ? 'Write all explanations and rationale in concise English.'
    : 'SQL/DDL/GQL 코드 및 식별자를 제외한 설명 문구는 한국어(Korean)로 간결하게 작성하십시오.';

  return `You are a Principal Google Cloud Data Governance & Spanner Graph Architect AI (gemini-3.5-flash).
Analyze the provided OKF v0.2 (Open Knowledge Format) specification for scenario "${scenarioId}" in "${projectId}.${datasetId}" and compile it into:
1. A Google Cloud Knowledge Catalog (Dataplex Universal Catalog) Aspect payload (overview + okf-governance aspect).
2. A Google Cloud Spanner Graph schema (Spanner CREATE TABLE with INTERLEAVE IN PARENT + CREATE OR REPLACE PROPERTY GRAPH DDL + ISO GQL query).

Language Rule:
- ${langRule}

CRITICAL SPANNER GRAPH SYNTAX RULES:
1. Spanner tables must use PRIMARY KEY (...) and child tables should use INTERLEAVE IN PARENT <ParentTable> ON DELETE CASCADE.
2. Spanner Property Graph DDL must use:
   CREATE OR REPLACE PROPERTY GRAPH okf_${scenarioId}_graph
     NODE TABLES ( ... )
     EDGE TABLES ( ... );
3. Spanner GQL queries must start with:
   GRAPH okf_${scenarioId}_graph
   MATCH ...
   RETURN ...

Return JSON ONLY matching this exact schema:
{
  "rationale": "1-2 sentence summary of how OKF bridges Knowledge Catalog and Spanner Graph for this domain.",
  "kcGovernanceAspect": {
    "validation_status": "ATTESTED",
    "trust_tier": "Human-Reviewed",
    "valid_until": "2027-09-29T00:00:00Z",
    "governance_policy": "Summary of the linked business policy from OKF",
    "attested_by": "human:data-steward@enterprise.com"
  },
  "spannerSchemaDdl": "CREATE TABLE ...",
  "spannerGraphDdl": "CREATE OR REPLACE PROPERTY GRAPH ...",
  "spannerGqlQuery": "GRAPH okf_${scenarioId}_graph\\nMATCH ...",
  "gqlSampleRows": [
    { "entity": "...", "related": "...", "policy_applied": "...", "action": "..." }
  ]
}

OKF v0.2 Source Markdown:
${(okfMarkdown || '').slice(0, 3500)}
`;
}

