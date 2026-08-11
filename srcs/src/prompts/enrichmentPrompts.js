/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * 🔮 Cross-Domain OKF Knowledge Enrichment Prompt Module
 * 
 * @module enrichmentPrompts
 * @epic EPIC-004 (Cross-Domain OKF Knowledge Enrichment)
 * @description BigQuery 물리 스키마와 GCS 비정형 위키 지식 간의 상호 메타데이터 보강(Enrichment) 프롬프트 모듈
 */

/**
 * [EPIC-004] GCS 위키 문서셋을 기반으로 기존 테이블 OKF 명세서 내용을 자율 보강(Enrichment)하는 프롬프트
 * 
 * @epic EPIC-004 (Cross-Domain OKF Knowledge Enrichment)
 * @menu 🔮 Knowledge Enrichment 탭 (Dataset Sub-tab & Table Sub-tab)
 * @api POST /api/enrich-metadata
 * @param {string} tableName - 대상 물리 테이블명
 * @param {string} okfContent - 현재 테이블 OKF 명세서 마크다운 텍스트
 * @param {string} wikiDocsJson - 연결된 비즈니스 위키 문서 집합 (JSON)
 * @returns {string} Gemini 프롬프트 문자열
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
