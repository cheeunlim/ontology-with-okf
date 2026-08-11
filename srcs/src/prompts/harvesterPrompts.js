/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * 📦 Physical Schema Harvester Prompt Module
 * 
 * @module harvesterPrompts
 * @epic EPIC-002 (BigQuery Physical Schema Harvester)
 * @description BigQuery 물리 스키마, 데이터 샘플, DDL 및 OKF v0.2 메타데이터 생성을 위한 프롬프트 모듈
 */

/**
 * [EPIC-002] 테이블 데이터 프로파일링 & 품질 분석 프롬프트
 * 
 * @epic EPIC-002 (BigQuery Physical Schema Harvester)
 * @menu Tables 탭 ➔ Schema / Preview 서브 탭
 * @api GET /api/profile-schema
 * @param {string} tableId - BigQuery 테이블 식별자
 * @param {Array} schema - 테이블 스키마 정의 객체 배열
 * @param {Array} rows - 테이블 샘플 데이터 행 배열 (상위 10행)
 * @returns {string} Gemini 프롬프트 문자열
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
 * [EPIC-002] Advanced Schema & Data Insights 수집 프롬프트 (Data Profile, Data Quality, Lineage, Insights, DDL 통합)
 * 
 * @epic EPIC-002 (BigQuery Physical Schema Harvester)
 * @menu Tables 탭 ➔ Catalog Info 서브 탭
 * @api GET /api/advanced-schema
 * @param {string} tableId - BigQuery 테이블 식별자
 * @param {Array} schema - 스키마 정의 객체
 * @param {Array} rows - 샘플 데이터 (상위 10행)
 * @param {string} ddl - BigQuery 테이블 DDL 구문
 * @param {Object} metadataSummary - 테이블 메타데이터 요약 객체
 * @returns {string} Gemini 프롬프트 문자열
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
 * [EPIC-002] 비정형 원본 가이드라인 문서를 OKF 유형 A (BusinessSpecification) 포맷으로 변환하는 프롬프트
 * 
 * @epic EPIC-002 (BigQuery Physical Schema Harvester)
 * @menu OKF Knowledge Store 탭 ➔ OKF Spec Generator
 * @api POST /api/generate-table-okf
 * @param {string} fileName - 원본 문서 파일명
 * @param {string} content - 문서 본문 텍스트
 * @param {string} datasetId - 연관 데이터셋 ID
 * @returns {string} Gemini 프롬프트 문자열
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
 * [EPIC-002] 빅쿼리 데이터셋 메타데이터와 테이블 목록을 기반으로 OKF 데이터셋 명세서(datasets/[datasetId].md)를 생성하는 프롬프트
 * 
 * @epic EPIC-002 (BigQuery Physical Schema Harvester)
 * @menu Dataset Dashboard ➔ ⚡ OKF Builder (Batch) 탭
 * @api POST /api/generate-dataset-okf
 * @param {string} datasetId - 대상 데이터셋 ID
 * @param {Object} bqMetadata - BigQuery 데이터셋 메타데이터 객체
 * @param {Array} tablesList - 하위 테이블 목록
 * @returns {string} Gemini 프롬프트 문자열
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
   - status: stable
   - generated: { by: reference_agent/gemini-3.5-flash, at: [현재 ISO8601 타임스탬프] }
   - sources:
     - id: bq-${datasetId}
       resource: https://console.cloud.google.com/bigquery?d=${datasetId}
       title: "${datasetId} BigQuery Dataset Definition"
       author: process:bigquery-metadata-harvester
2. 본문 구조:
   - # Overview: 이 데이터셋의 비즈니스 목적, 주요 도메인 범위 설명 (한국어로 풍부하게 작성)
   - # Key Tables: 하위 테이블 목록과 각각의 핵심 역할 요약 링크 포함 (예: - [테이블명](/tables/테이블명.md) - 설명)
3. 모든 설명용 텍스트는 반드시 **한국어(Korean)**로 생성하십시오.

출력은 반드시 유효한 마크다운이어야 하며, YAML Frontmatter로 시작해야 합니다. 대화형 인사말이나 코드 블록 펜스는 제외하십시오.`;
}
