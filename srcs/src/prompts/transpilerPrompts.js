/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * 📝 Wiki & Unstructured Document Transpiler Prompt Module
 * 
 * @module transpilerPrompts
 * @epic EPIC-003 (Wiki & Unstructured Document OKF Transpiler)
 * @description 비정형 가이드라인 문서를 3계층 OKF 위키 지식 베이스로 해체, 아토믹 청킹, 자동 파일명 추출 및 GitHub 오리지널 텍스트 번역/대조 모듈
 */

/**
 * [EPIC-003] 비정형 원본 가이드라인 문서를 3가지 영역(요약, 개체/용어, 비즈니스 규칙)으로 해체하는 프롬프트
 * 
 * @epic EPIC-003 (Wiki & Unstructured Document OKF Transpiler)
 * @menu 🎙️ 4. Ingestion & Interview Feedback ➔ Wiki Transpiler
 * @api POST /api/llm-wiki-store/decompose
 * @param {string} fileName - 원본 가이드라인 문서 파일명
 * @param {string} content - 문서 본문 텍스트
 * @param {Object} [existingAspects=null] - 기존 데이터셋 용어/Glossary 참조 컨텍스트
 * @returns {string} Gemini 프롬프트 문자열
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
  "summary": "# [문서제목] 핵심 요약\\n\\n여기에 마크다운 본문 작성...",
  "entities": "# [문서제목] 핵심 용어 및 엔티티 정의\\n\\n여기에 마크다운 본문 작성... (물리 테이블 매핑 포함)",
  "concepts": "# [문서제목] 비즈니스 규칙 및 정책\\n\\n여기에 마크다운 본문 작성... ( RDB 컬럼명 언급하며 조건식 기술)"
}

원본 파일명: ${fileName}
원본 내용:
${content}`;
}

/**
 * [EPIC-003] 업로드된 가이드라인 문서 내용 기반 자동 영문 snake_case 파일명 추출 프롬프트
 * 
 * @epic EPIC-003 (Wiki & Unstructured Document OKF Transpiler)
 * @menu 🎙️ 4. Ingestion & Interview Feedback ➔ File Upload
 * @api POST /api/gcs/auto-name
 * @param {string} content - 업로드된 문서 텍스트
 * @returns {string} Gemini 프롬프트 문자열
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
 * [EPIC-003] GitHub 문서용 영어 설명문 번역 및 오리지널 텍스트 재결합 프롬프트
 * 
 * @epic EPIC-003 (Wiki & Unstructured Document OKF Transpiler)
 * @menu 📄 2. OKF Knowledge Store ➔ GitHub Explorer
 * @api POST /api/github/translate
 * @param {string} fileName - 파일 경로 및 이름
 * @param {string} fileContent - 원본 문서 텍스트
 * @returns {string} Gemini 프롬프트 문자열
 */
export function getGithubTranslationPrompt(fileName, fileContent) {
  return `당신은 번역 전문가이자 전문 테크니컬 라이터(Technical Writer)입니다.
제시된 문서 또는 소스코드("${fileName}")를 분석하여, 코드 영역을 제외한 본문의 모든 영어 문단, 리스트 항목 및 설명 바로 아래에 깔끔하게 **한국어 번역 문단**을 끼워넣어 문단별 대조본(Interleaved Translation Document)을 작성하십시오.

1. **문단별 대조 번역 규칙**:
   - 원문 문단을 그대로 보존하고, 바로 아래에 \`💡 [한국어 번역]\` 접두어를 붙여 자연스럽고 전문적인 한국어 기술 문서조로 번역하십시오.
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
