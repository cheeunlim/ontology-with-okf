# LLM Wiki Engine 통합 기술 명세서 & 데이터베이스 아키텍처 바이블
*(3-Tier Hybrid Knowledge Architecture: Standard RAG ➔ BigQuery GraphRAG ➔ Compounding LLM Wiki & Chunk-Level Valid Window)*

---

## 1. 3단 통합 지식 아키텍처 및 컨셉 (3-Tier Hybrid Knowledge Architecture)

**LLM Wiki Engine**은 전통적인 Vector RAG의 한계점(지식의 축적 부재)과 GraphRAG의 높은 구축 비용을 상호 보완하기 위해 **[Standard RAG + BigQuery Property GraphRAG + Compounding LLM Wiki]**의 3단 통합 하이브리드 아키텍처로 구현되었습니다.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             🧠 3단 통합 지식 하이브리드 추론 엔진                           │
├──────────────────────────────┬─────────────────────────────┬─────────────────────────────┤
│ 1단. Standard Vector RAG     │ 2단. BigQuery GraphRAG      │ 3단. Compounding LLM Wiki   │
│ - 청크 단위 의미 벡터 탐색   │ - 청크 간 그래프 릴레이션    │ - Karpathy 3-Layer 영속 위키│
│ - Valid Date Window RAG      │ - GQL (GRAPH_TABLE MATCH)   │ - [[백링크]] 지식 컴파일     │
└──────────────┬───────────────┴──────────────┬──────────────┴──────────────┬──────────────┘
               │                              │                             │
               └──────────────────────────────┼─────────────────────────────┘
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                 📊 융합 답변 도출 & 자율수복(Self-Healing) 한글 리포트 생성                  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 🔄 LLM Wiki Engine 단계별 데이터 라이프사이클 및 파이프라인 (Steps 1~4)

LLM Wiki Engine은 원본 비정형 문서 및 사용자 피드백이 수집되어 최종 BigQuery Property Graph로 컴파일되고 하이브리드 탐색에 사용되기까지 총 4단계의 라이프사이클 파이프라인을 거칩니다.

```text
[Step 1. Cold Start] ──> [Step 2. Fast Ingest] ──> [Step 3. Slow Compile] ──> [Step 4. Hybrid Traversal]
( Taxonomy 정의 )        ( Fast-Path 파싱 )         ( BQ 적재 및 컴파일 )        ( GraphRAG 의미 추론 )
```

---

### Step 1. Cold Start (🌱 01_raw)
* **역할**: 마스터 온톨로지 지식 뼈대(`master_taxonomy.md`)를 구성하여 초기 시스템 기동 시 지식 편향을 방지하고 에이전트의 지식 수집 경계를 정의합니다.

---

### Step 2. Fast Ingest (⚡ Fast-Path)
* **청킹 및 분석 알고리즘**:
  1. 사용자가 원본 텍스트/PDF를 등록하면 `01_raw/business_guidelines/` 아래 마크다운 파일로 우선 저장합니다.
  2. 업로드 직후 사용자 대기 시간을 최소화하기 위해 **Fast-Path 파서**가 기동하여 정규식 또는 Gemini API 초고속 모드를 활용해 문서 내 핵심 엔티티(예: `orders.status`, `OKF 음료`)와 백링크 패턴(`[[백링크]]`)을 1차로 파싱합니다.
* **임시 적재 구조**:
  - 파싱된 정보는 바로 그래프 DB에 인서트되지 않고, 디스크 및 GCS 상의 `logs/changelog.json` 버퍼 큐 파일에 적재됩니다.
  - 신규 데이터의 상태값은 **`PENDING_GRAPH_SYNC`**로 지정되어 다음 Step 3 컴파일러의 대기열로 관리됩니다.

---

### Step 3. Slow Compile & Sync (🤖 Slow-Path Sync)
* **정밀 청킹(Chunking) 알고리즘**:
  - `changelog.json`에 `PENDING_GRAPH_SYNC`인 대기 파일들을 감지하여 배치를 시작합니다.
  - 마크다운 파서를 기동하여 원본 문서를 논리적 조항 단위(Header `#`, `##`, `###`) 또는 줄 바꿈(Paragraph) 기준으로 정밀 쪼개어 세부 청크로 분리하고, 고유 청크 ID(`CHK_YYYY_XXX`)를 매핑합니다.
* **의미 임베딩(Embedding) 생성**:
  - 쪼개진 텍스트 청크를 Gemini Embedding API(`text-embedding-004`)에 연동하여 **1,536차원의 고밀도 의미 벡터(Embedding)**를 생성하고 청크 필드에 바인딩합니다.
* **BigQuery 데이터 적재 DDL & DML 실행**:
  - 청크와 엔티티 관계를 BigQuery 테이블로 전송합니다.
  - DDL을 통해 `documents` (원본 문서), `doc_chunks` (청크 및 임베딩 벡터), `entities` (개체), `knowledge_links` (그래프 에지), `entity_attribute_states` (상태전이 테이블)를 생성 및 병합(DML `INSERT`/`MERGE`)합니다.
* **Property Graph 빌드 및 컴파일**:
  - 데이터가 적재된 후, 아래의 `CREATE OR REPLACE PROPERTY GRAPH` DDL을 실행하여 노드 테이블과 에지 테이블을 물리적으로 엮어 최종 그래프 인덱스를 활성화합니다.
  - 동기화 완료 후 `changelog.json` 내 대상 로그들의 상태를 **`SYNCED_TO_BIGQUERY_GRAPH`**로 전환하여 동기화를 수렴합니다.

---

### Step 4. Hybrid Traversal (🔍 GQL GraphRAG)
* **1차: 의미 벡터 탐색 (Vector Similarity Search)**:
  - 사용자의 자연어 질문이 인입되면 동일한 임베딩 API를 거쳐 1,536차원 질문 벡터를 추출합니다.
  - BigQuery `VECTOR_DISTANCE` 함수를 활용해 `doc_chunks` 내 가장 유사한 최상위 청크 노드들을 필터링합니다.
* **2차: 유효기간 윈도우 체크 (Valid Date Window Guard)**:
  - 1차로 필터링된 청크 중 `is_active = TRUE` 및 `CURRENT_DATE()`가 `valid_start_date`와 `valid_end_date` 범위 내에 존재하는 최신 유효 청크들만 수렴하여 구버전 정책에 의한 오답 편향을 차단합니다.
* **3차: GQL 그래프 탐색 (Property Graph GQL Traversal)**:
  - 빅쿼리 그래프 쿼리인 `GRAPH_TABLE`을 사용해 선택된 청크에서 연결된 비즈니스 엔티티 및 동적 상태 노드들을 그래프 경로 탐색으로 추적합니다.
  - GQL 예시: `(c:Chunk)-[rel:LINKED_TO]->(e:Entity)` 매칭을 통해 세부 조건을 탐색합니다.
* **4차: 추론 컨텍스트 및 인용 근거 생성 (Provenance Citation)**:
  - 추출된 최신 서브그래프, DB 스키마, 텍스트를 조합하여 Prompt Context를 생성하고 Gemini 3.5 Flash에 `thinkingConfig`와 함께 전달하여 최종 비즈니스 요약 답변을 렌더링하고 인용 근거를 제시합니다.

---

## 3. 📂 Karpathy 3-Layer 디렉토리 구조 및 역할 규격

Andrej Karpathy의 LLM Wiki 아이디어 파일 명세를 기반으로 3단계 디렉토리 레이어로 소유권을 명확히 분리합니다. 로컬 저장소는 `scratch/llm_wiki_store/` 경로에 대응되며, Google Cloud Storage(GCS)의 `llm_wiki/` 가상 경로 버킷과 실시간으로 양방향 동기화 및 적재가 이루어집니다.

```text
scratch/llm_wiki_store/            <-- 로컬 영속화 저장소 루트 (GCS llm_wiki/ 가상 경로 동기화)
├── 01_raw/                        <-- Layer 1: Raw Sources (사용자/현업 소유 - Read Only)
│   ├── business_guidelines/       <-- 비즈니스 업무 정의서 & 사용자 피드백 문서 ([SAMPLE]_abusive_customer_management.md)
│   └── schema_ddl/                <-- BigQuery DDL 및 물리 스키마 문서
│
├── 02_wiki/                       <-- Layer 2: Compounded LLM Wiki (LLM 전용 소유)
│   ├── index.md                   <-- 위키 전체 지식 카탈로그 인덱스 (백링크 매핑)
│   ├── overview.md                <-- 비즈니스 도메인 종합 개요
│   ├── entities/                  <-- 물리 DB 테이블/개체 (orders.md, users.md)
│   └── concepts/                  <-- 비즈니스 정책/개념 (abusive_return_policy.md)
│
├── 03_schema/                     <-- Layer 3: Governance & Rules (거버넌스 레이어)
│   └── AGENTS.md                  <-- LLM 에이전트의 지식 수집 및 위키 컴파일 행동 수칙
│
└── logs/                          <-- Audit Logs (감사 이력 레이어)
    ├── log.md                     <-- Append-only 타임스탬프 이력 로그
    └── changelog.json             <-- JSON 파싱 변경 이력
```

---

## 4. 📄 OKF 마크다운 표준 포맷 & RDB/Graph 메타 기반 백링크 생성 규칙

### 1) OKF (Open Knowledge Format) 마크다운 작성 포맷
OKF 파일은 머리말 YAML Frontmatter와 명확한 본문 표준 섹션으로 구성됩니다:
```markdown
---
title: "Master Domain Taxonomy"
type: "okf_domain_definition"
domain: "Enterprise Data & Payment System"
created_at: "2026-07-05"
---

# Master Domain Taxonomy (마스터 지식 뼈대)

## 1. 핵심 비즈니스 도메인 (Core Domains)
- **[[고객_관리]]**: 고객 프로필, 회원 등급, 인증 정보 (`users.md` 매핑)
- **[[주문_정산]]**: 결제 내역, 수수료율, 환불 규정 (`orders.md` 매핑)

## 2. RDB PK/FK 키 리니지 백링크 매핑 (Key Lineage)
- `orders.user_id` (FK) ──(BELONGS_TO)──► `users.id` (PK)
```

### 2) RDB 및 BigQuery Property Graph 기반 [[백링크]] 자동 조립 규칙
1. **RDB Foreign Key 백링크 자동 연결**:
   - RDB/BigQuery 스키마 파싱 시 FK 매핑 관계가 존재하면 `[[orders.md]] ➔ [[users.md]]` 형태의 bidirectional `[[wikilink]]`를 자동 조립합니다.
2. **Graph DB Node-Edge 백링크 생성**:
   - BigQuery Property Graph의 노드(`Chunk`, `Entity`) 및 에지(`chunk_relations`) 메타데이터를 파싱하여 관계형 레이블(`DEFINES`, `REFERENCES`, `SUPERSEDES`)을 `02_wiki/index.md` 카탈로그 백링크로 자동 동기화합니다.

---

## 5. BigQuery 위키 메타데이터 및 청크 릴레이션 DDL (BigQuery Schema Architecture)

### 1) 원본 문서 및 청크 임베딩 테이블 (`documents`, `doc_chunks`)
```sql
-- 1. 원본 문서 관리 테이블
CREATE TABLE IF NOT EXISTS `my-gcp-project.llm_wiki_dataset.documents` (
  doc_id STRING OPTIONS(description="문서 고유 ID"),
  title STRING OPTIONS(description="문서 제목"),
  doc_type STRING OPTIONS(description="문서 유형 (SEED, INBOX, SYNTHESIZED)"),
  content STRING OPTIONS(description="마크다운 원본 본문 텍스트"),
  created_at TIMESTAMP
);

-- 2. 청크 단위 세부 본문 및 의미 벡터 관리 테이블
CREATE TABLE IF NOT EXISTS `my-gcp-project.llm_wiki_dataset.doc_chunks` (
  chunk_id STRING OPTIONS(description="청크 고유 ID"),
  doc_id STRING OPTIONS(description="상위 문서 ID"),
  section_title STRING OPTIONS(description="섹션 조항 제목"),
  chunk_text STRING OPTIONS(description="청크 디테일 본문 내용"),
  embedding ARRAY<FLOAT64> OPTIONS(description="1,536차원의 의미 벡터 임베딩값"),
  valid_start_date DATE OPTIONS(description="지식 유효 시작일"),
  valid_end_date DATE OPTIONS(description="지식 유효 종료일 (기본값: 2099-12-31)"),
  is_active BOOL OPTIONS(description="최신 유효 여부 (TRUE/FALSE)"),
  created_at TIMESTAMP
);
```

### 2) 비즈니스 엔티티 및 지식 그래프 링크 테이블 (`entities`, `knowledge_links`)
```sql
-- 3. 비즈니스 엔티티 노드 테이블 (Customer, Product, Incident, Log 등)
CREATE TABLE IF NOT EXISTS `my-gcp-project.llm_wiki_dataset.entities` (
  entity_id STRING OPTIONS(description="엔티티 고유 ID"),
  name STRING OPTIONS(description="엔티티 명칭 (e.g. OKF 음료, PG사 A)"),
  entity_type STRING OPTIONS(description="엔티티 유형"),
  summary STRING OPTIONS(description="엔티티 비즈니스 요약")
);

-- 4. 그래프 에지 및 백링크 연결 관계 테이블 (지식 간의 링크 관계 정의)
CREATE TABLE IF NOT EXISTS `my-gcp-project.llm_wiki_dataset.knowledge_links` (
  source_id STRING OPTIONS(description="출발 노드 ID"),
  source_label STRING OPTIONS(description="Document, Chunk, Entity"),
  target_id STRING OPTIONS(description="도착 노드 ID"),
  target_label STRING OPTIONS(description="Document, Chunk, Entity"),
  relation_type STRING OPTIONS(description="GOVERNED_BY, MENTIONS, LINKED_TO, APPLIES_TO")
);
```

### 3) 🌟 범용 엔티티-속성 상태 전이 테이블 (`entity_attribute_states`)
```sql
-- 5. 가변/비정형 속성 및 정책 상태 변화 대응용 만능 상태 테이블 (임의의 비정형 변화 수용)
CREATE TABLE IF NOT EXISTS `my-gcp-project.llm_wiki_dataset.entity_attribute_states` (
  state_id STRING OPTIONS(description="상태 레코드 고유 ID"),
  entity_name STRING OPTIONS(description="대상 엔티티 (e.g. 결제시스템, 물류센터, orders)"),
  attribute_name STRING OPTIONS(description="속성 명칭 (e.g. 담당자, 배송위치, 수수료율, 환불기간)"),
  value STRING OPTIONS(description="최신 바뀐 값 (e.g. 이영희 팀장, 이천 센터, 3.0%, 10일)"),
  status STRING OPTIONS(description="ACTIVE (최신 유효) | SUPERSEDED (구버전 과거)"),
  change_reason STRING OPTIONS(description="변경 발생 사유"),
  fact_vector ARRAY<FLOAT64> OPTIONS(description="1,536차원 의미 벡터 좌표 (단어가 달라도 적중)"),
  updated_at TIMESTAMP
);
```

### 4) 🕸️ BigQuery Property Graph 생성 DDL (`llm_wiki_graph`)
```sql
-- 6. BigQuery Property Graph 생성 DDL
CREATE OR REPLACE PROPERTY GRAPH `my-gcp-project.llm_wiki_dataset.llm_wiki_graph`
  NODE TABLES (
    `my-gcp-project.llm_wiki_dataset.documents`
      KEY (doc_id)
      LABEL `Document`
      PROPERTIES (doc_id, title, doc_type, content),
    `my-gcp-project.llm_wiki_dataset.doc_chunks`
      KEY (chunk_id)
      LABEL `Chunk`
      PROPERTIES (chunk_id, doc_id, section_title, chunk_text, valid_start_date, valid_end_date, is_active),
    `my-gcp-project.llm_wiki_dataset.entities`
      KEY (entity_id)
      LABEL `Entity`
      PROPERTIES (entity_id, name, entity_type, summary),
    `my-gcp-project.llm_wiki_dataset.entity_attribute_states`
      KEY (state_id)
      LABEL `DynamicFact`
      PROPERTIES (state_id, entity_name, attribute_name, value, status)
  )
  EDGE TABLES (
    `my-gcp-project.llm_wiki_dataset.knowledge_links`
      KEY (source_id, target_id, relation_type)
      SOURCE KEY (source_id) REFERENCES `documents`(doc_id)
      DESTINATION KEY (target_id) REFERENCES `entities`(entity_id)
      LABEL `LINKED_TO`
      PROPERTIES (relation_type)
  );
```

### 5) [DML & GQL] 데이터 인입 및 융합 탐색 쿼리 스펙
```sql
-- 7. [DML] 신규 청크 유효기간 지정 및 청크 간 릴레이션 그래프 연결 INSERT 예시
INSERT INTO `my-gcp-project.llm_wiki_dataset.doc_chunks`
  (chunk_id, doc_id, section_title, chunk_text, valid_start_date, valid_end_date, is_active, embedding, created_at)
VALUES 
  ('CHK_2026_001', 'DOC_ABUSIVE_01', '악성 반품 고객 관리 지침', '총 주문 3건 이상 중 반품율 40% 이상 유저 주의 조치...', '2026-01-01', '2099-12-31', TRUE, [0.012, -0.34, 0.77, 0.15], CURRENT_TIMESTAMP());

-- 8. [GQL] Valid Date Window (최신 유효 기간 청크) + 의미 벡터(Embedding Similarity) 융합 탐색 쿼리
SELECT 
  c.chunk_id,
  c.section_title,
  c.chunk_text,
  c.valid_start_date,
  c.valid_end_date,
  VECTOR_DISTANCE(c.embedding, [0.011, -0.33, 0.76, 0.14]) AS vector_distance
FROM `my-gcp-project.llm_wiki_dataset.doc_chunks` c
WHERE c.is_active = TRUE 
  AND CURRENT_DATE() BETWEEN c.valid_start_date AND c.valid_end_date
ORDER BY vector_distance ASC
LIMIT 5;
```

### 6) 🌟 메타-RDB 통합 하이브리드 그래프 아키텍처 및 GQL (Hybrid Graph Solution)
메타 지식 문서(Documents, Entities)와 실제 운영 비즈니스 테이블(Users, Orders 등)은 개별 그래프로 쪼갤 필요 없이, **단일 BigQuery Property Graph**에 동시에 노드로 등록하고 이를 에지로 연결하여 공존시킬 수 있습니다.

#### ① 통합 물리 매핑 테이블 추가 (`entity_to_rdb_mappings`)
비정형 문서에서 파싱된 추상화된 `Entity` 노드와 실제 BigQuery RDB에 보관된 고유 ID(`users.id`, `products.id` 등)를 매핑하는 징검다리 테이블(Entity Resolution Link)을 선언합니다.

```sql
-- 9. 엔티티와 실제 RDB 기본 키(Primary Key) 매핑 테이블
CREATE TABLE IF NOT EXISTS `my-gcp-project.llm_wiki_dataset.entity_to_rdb_mappings` (
  entity_id STRING OPTIONS(description="메타 엔티티 ID (e.g. ENT_CUST_1234)"),
  rdb_table_name STRING OPTIONS(description="실제 물리 테이블명 (e.g. users, products)"),
  rdb_primary_key STRING OPTIONS(description="실제 물리 테이블의 기본 키 값 (e.g. 1234)")
);
```

#### ② 메타-RDB 통합 Property Graph DDL
기존 메타 노드들과 함께 실제 BigQuery에 적재되어 있는 비즈니스 테이블(`users`, `orders`, `products`)을 노드로 추가 정의하고, 이들을 가로지르는 에지 테이블을 바인딩합니다.

```sql
-- 10. 메타 데이터와 실제 RDB 비즈니스 데이터가 융합된 통합 프로퍼티 그래프
CREATE OR REPLACE PROPERTY GRAPH `my-gcp-project.llm_wiki_dataset.llm_wiki_graph`
  NODE TABLES (
    -- [메타 영역 노드]
    `my-gcp-project.llm_wiki_dataset.documents` KEY (doc_id) LABEL `Document`,
    `my-gcp-project.llm_wiki_dataset.entities` KEY (entity_id) LABEL `Entity`,
    
    -- [비즈니스 RDB 영역 노드]
    `my-gcp-project.ecommerce.users` KEY (id) LABEL `User`,
    `my-gcp-project.ecommerce.orders` KEY (order_id) LABEL `Order`,
    `my-gcp-project.ecommerce.products` KEY (id) LABEL `Product`
  )
  EDGE TABLES (
    -- [메타 ➔ 메타 연결 에지]
    `my-gcp-project.llm_wiki_dataset.knowledge_links`
      KEY (source_id, target_id, relation_type)
      SOURCE KEY (source_id) REFERENCES `documents`(doc_id)
      DESTINATION KEY (target_id) REFERENCES `entities`(entity_id)
      LABEL `LINKED_TO`
      PROPERTIES (relation_type),

    -- [메타 ➔ RDB 연결 에지 (Entity Resolution Link)]
    `my-gcp-project.llm_wiki_dataset.entity_to_rdb_mappings`
      KEY (entity_id, rdb_primary_key)
      SOURCE KEY (entity_id) REFERENCES `entities`(entity_id)
      DESTINATION KEY (rdb_primary_key) REFERENCES `users`(id)
      LABEL `RESOLVED_TO_USER`,

    `my-gcp-project.llm_wiki_dataset.entity_to_rdb_mappings`
      KEY (entity_id, rdb_primary_key)
      SOURCE KEY (entity_id) REFERENCES `entities`(entity_id)
      DESTINATION KEY (rdb_primary_key) REFERENCES `products`(id)
      LABEL `RESOLVED_TO_PRODUCT`,

    -- [RDB ➔ RDB 비즈니스 관계 에지]
    `my-gcp-project.ecommerce.orders`
      KEY (order_id)
      SOURCE KEY (user_id) REFERENCES `users`(id)
      DESTINATION KEY (order_id) REFERENCES `orders`(order_id)
      LABEL `PLACED`
  );
```

#### ③ 하이브리드 탐색 GQL 쿼리 예시
"결제실패 장애 문서(`DOC_ABUSIVE_01`)에서 언급된 고객 엔티티(`Entity`)를 찾아, 실제 물리 고객 테이블(`User`)의 정보 및 해당 고객이 최근에 구매 시도한 실제 주문 상세 정보(`Order`)를 그래프로 추적 조회"

```sql
SELECT 
  doc_title, 
  customer_name, 
  order_id, 
  order_status,
  order_amount
FROM GRAPH_TABLE(
  `my-gcp-project.llm_wiki_dataset.llm_wiki_graph`,
  MATCH 
    -- 1. 문서에서 언급된 엔티티 탐색 (메타 영역)
    (d:`Document` {doc_id: 'DOC_ABUSIVE_01'})-[:`LINKED_TO`]->(e:`Entity`)
    -- 2. 엔티티를 실제 RDB User 노드로 해소 (매핑 영역)
    -[:`RESOLVED_TO_USER`]->(u:`User`)
    -- 3. RDB User가 실제로 생성한 RDB Order 노드 추적 (비즈니스 영역)
    -[:`PLACED`]->(o:`Order`)
  RETURN 
    d.title AS doc_title,
    u.name AS customer_name,
    o.order_id AS order_id,
    o.status AS order_status,
    o.amount AS order_amount
);
```
이렇게 설계하면 메타 정보와 실제 상세 정형 데이터를 따로 관리하면서도, BigQuery Graph Engine 상에서 하나의 컨텍스트로 통일하여 세부적인 쿼리가 온전히 가능합니다.

### 7) 🌟 하이브리드 프로퍼티 그래프 설계 및 구축 의사결정 가이드라인 (Decision Matrix)
모든 데이터셋의 전 테이블을 무리하게 그래프 노드로 엮는 것은 설계 복잡도를 과도하게 높이고 유지보수를 불가능하게 만듭니다. 아키텍처 수립 시 아래의 명확한 판단 기준에 따라 그래프 편입 대상을 선별합니다.

#### ① 기본 범위 (Scope Principle)
- **BigQuery Dataset 단위로 1개의 통합 Property Graph(`llm_wiki_graph`)를 생성하는 것을 원칙**으로 합니다.
- 데이터셋 내 모든 테이블이 아니라, 아래 기준에 의해 선별된 **핵심 Anchor 테이블 및 메타 테이블**만 그래프의 노드/에지로 엮습니다.

#### ② 노드(Node) 편입 대상 선별 기준 (What to Include as Nodes)

| 편입 여부 | 대상 유형 | 구체적 예시 | 선별 기준 및 비즈니스 이유 |
|---|---|---|---|
| **이동 (Node 편입)** | 핵심 비즈니스 앵커 테이블 | `users`, `orders`, `products` | 서비스 비즈니스의 중심이 되는 핵심 팩트/디멘션 개체. 비즈니스 용어집(Glossary) 및 메타 위키의 엔티티 명세와 일대일 매핑되는 실체. |
| **이동 (Node 편입)** | 지식 메타 테이블 | `documents`, `entities`, `doc_chunks` | 비정형 지식 소스 및 청크. 메타-RDB 융합 탐색의 출발점 역할을 함. |
| **제외 (SQL 조인)** | 단순 세부 로그 및 이력 테이블 | `clickstream_logs`, `address_histories`, `order_status_logs` | 관계의 트래버싱(추적)이 필요 없으며 데이터 크기가 무겁고 단순 적재 위주인 테이블. GQL 쿼리 완료 후 필요에 따라 사후 SQL JOIN으로 엮어 씁니다. |
| **제외 (SQL 조인)** | 단순 스태틱 코드성 테이블 | `zip_codes`, `payment_method_codes` | 그래프의 토폴로지를 변화시키지 않는 정적 매핑 코드값. 노드 테이블로 선언 시 불필요한 그래프 뷰 용량만 낭비합니다. |

#### ③ 에지(Edge) 연결선 선별 기준 (When to Connect with Edges)
1. **외래 키(FK) 리니지**: 물리 스키마상 명확하게 성립하는 `orders.user_id ➔ users.id`와 같은 정형 부모-자식 관계.
2. **개체식별 관계(Entity Resolution Link)**: 메타 지식층의 추상 엔티티(`Entity`)가 실제 RDB의 특정 행(`User`, `Product`)으로 환원되는 매핑선 (`entity_to_rdb_mappings`).
3. **규칙/정책 적용선**: 특정 정책 문서 조항(`Chunk`)이 실제 어떤 테이블이나 엔티티 속성에 규제/제약을 가하는지를 정의하는 연결선 (`governed_by`, `applies_to`).

#### ④ AI 에이전트 자율 추천 컴파일러 전략 (Auto-Generation Strategy)
설계의 공수를 줄이기 위해 개발자가 수동으로 DDL을 짜는 대신, **LLM Wiki Engine의 Slow-Path 컴파일러가 자동 추론**하도록 아키텍처를 유도합니다.
- **1단계**: 데이터셋 내 물리 테이블들의 Schema와 Foreign Key를 스캔하여 기본 RDB 노드/에지 관계 1차 도출.
- **2단계**: `02_wiki/index.md` 및 `01_raw/` 위키 문서 내의 `[[백링크]]` 및 텍스트 언급 맥락을 LLM이 정밀 분석하여 `Entity Resolution` 연결고리(`entity_to_rdb_mappings`)를 2차로 자동 빌드 및 GQL DDL 완성.

---

## 6. REST API 명세 (Feedback Loop 및 파일 삭제 포함)

| REST API 엔드포인트 | 메서드 | 파라미터 | 주요 역할 및 처리 내용 |
|---|---|---|---|
| `/api/llm-wiki/tree` | `GET` | `projectId` | Karpathy 3-Layer 디렉토리 구조 트리 반환 |
| `/api/llm-wiki/file` | `POST` | `filePath` | 선택한 마크다운 파일 원문 조회 |
| `/api/llm-wiki/file` | `DELETE` | `projectId`, `filePath` | **선택한 마크다운/샘플 파일 개별 삭제 및 GCS 동기화** |
| `/api/llm-wiki/save-file` | `POST` | `filePath`, `content` | 사용자가 수정한 마크다운 원문 저장 |
| `/api/llm-wiki/add-document` | `POST` | `fileName`, `content`, `sourceType` | Preset, Text Paste, PDF 업로드 원본을 `01_raw/`에 등록 및 `index.md` 갱신 |
| `/api/llm-wiki/feedback-refine` | `POST` | `question`, `originalAnswer`, `feedbackRating`, `feedbackText` | **피드백을 `01_raw/`에 보관 ➔ `02_wiki/index.md` 인덱싱 ➔ Gemini 3.5 Flash 교정 재답변 재생성** |
| `/api/llm-wiki/run-slow-path`| `POST` | `projectId`, `datasetId` | BigQuery DDL/Graph Sync & 청크 릴레이션 융합 |

---

## 7. 개발자 구현 & 운영 수칙 (Developer Guidelines)

1. **[SAMPLE] 샘플 파일 관리 & 개별 삭제**:
   - 데모용 파일에는 파일명 및 UI 레이블에 `[SAMPLE]` 태그를 표기하며, 사용자가 삭제(`DELETE /api/llm-wiki/file`) 버튼을 클릭하여 개별 삭제 가능합니다.
2. **Valid Date Window 탐색 규칙**:
   - RAG 질의 처리 시 반드시 `WHERE c.is_active = TRUE AND CURRENT_DATE() BETWEEN c.valid_start_date AND c.valid_end_date` 조건을 적용하여 구버전 무효 지식이 답변에 섞이지 않도록 합니다.
3. **AI 모델 및 생각 추출 규칙**:
   - `gemini-3.5-flash` 모델만 고정 사용하며, `thinkingConfig` (thinkingBudget: 2048)를 활성화합니다.

---
*통합 명세서 개정 일시: 2026-07-05*  
*작성 엔진: Antigravity AI Engine (Model: gemini-3.5-flash)*
