# Karpathy 스타일 LLM Wiki 구축 및 운영 가이드 (Karpathy LLM Wiki Guide)

본 가이드는 **Andrej Karpathy의 LLM Wiki 아이디어 파일 명세(llm-wiki.md)**를 기반으로, 데이터 분석 및 온톨로지 플랫폼(`Ontology with OKF`) 환경에서 LLM 지식베이스를 효과적으로 구축하고 운영하기 위한 실전 가이드라인입니다.

---

## 💡 1. 핵심 개념: Chunk-Level Valid Date Window & Intra-Chunk Relations

속성별 복잡한 상태 전이 대신, **청크(Chunk) 단위의 유효 기간(`valid_start_date`, `valid_end_date`, `is_active`)**과 **청크 간/엔티티 간 그래프 릴레이션 네트워크(`chunk_relations`)**를 관리하는 직관적인 지식 아키텍처입니다.

```text
[신규 문서 업로드 (01_raw/)]
          │
          ├─► 1. doc_chunks 분할 (valid_start_date: 2026-07-01, is_active: TRUE)
          │
          └─► 2. chunk_relations 릴레이션 매핑
                - [Chunk A] ──(REFERENCES)──► [Chunk B]
                - [Chunk A] ──(DEFINES)─────► [Entity: orders]
```

### 🎯 3대 탐색 원칙
1. **Valid Date Window Filtering**:
   - `WHERE is_active = TRUE AND CURRENT_DATE() BETWEEN valid_start_date AND valid_end_date` 조건으로 만료된 옛날 정책을 자동 걸러내고 최신 유효 지식을 우선 제공.
2. **Intra-Chunk Graph Traversal**:
   - 문서 내 조항 청크들 간의 참조 관계(`REFERENCES`, `SUPERSEDES`, `DERIVED_FROM`)를 GQL 그래프 조인으로 추적.
3. **Compounded User Feedback Alignment**:
   - 사용자의 `👍` / `👎` 피드백이 `01_raw/business_guidelines/feedback_{timestamp}.md` 청크 지식으로 누적되어 차후 질의 시 자동 탐색.

---

## 🏗️ 2. Karpathy 3-Layer 디렉토리 구조 명세

```text
llm-wiki-knowledge-base/
├── 01_raw/                        <-- Layer 1: Raw Sources Layer (Immutable)
│   ├── business_guidelines/       <-- 업무 정의서 & 피드백 지침 (feedback_178318.md)
│   ├── schema_ddl/                <-- BigQuery DDL (예: theLookCommerce_ddl.sql)
│   └── assets/                    <-- 원본 이미지 및 캡처 데이터
│
├── 02_wiki/                       <-- Layer 2: Compounded LLM Wiki Layer (LLM Owned)
│   ├── index.md                   <-- 지식 목록 카탈로그 (전체 페이지 1줄 요약 & 링크)
│   ├── overview.md                <-- 전체 지식 개요
│   ├── entities/                  <-- 물리 DB 테이블/개체 (orders.md, users.md)
│   ├── concepts/                  <-- 비즈니스 용어/정책 (abusive_return_policy.md)
│   └── comparisons/               <-- AI 도출 비교 분석 리포트 저장소
│
├── 03_schema/                     <-- Layer 3: Governance & Rules
│   └── AGENTS.md                  <-- LLM 컴파일/인제스트/린트 행동 규칙
│
└── logs/                          <-- Audit Logs
    ├── log.md                     <-- Append-only 시간순 이력로그 (## [YYYY-MM-DD] feedback_refine | Title)
    └── changelog.json             <-- JSON 파싱 이력
```

---

## 📌 3. 참고 자료 및 표준 링크
* Andrej Karpathy LLM-Wiki Gist: `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`
* Open Knowledge Format (OKF) Specification Spec.

---
*가이드 작성 일시: 2026-07-05*  
*엔진: Antigravity AI Engine (Model: gemini-3.5-flash)*
