# BigQuery Property Graph 기반 LLM Wiki 지식 그래프 설계 제안서

본 문서는 **Ontology with OKF** 플랫폼의 지식 관리 아키텍처를 고도화하기 위한 방안으로, BigQuery의 초거대 인프라와 표준 그래프 기능(Property Graph)을 융합하여 LLM Wiki(Karpathy LLM-Wiki 컨셉)의 관리 복잡성을 줄이고 대규모 데이터 증가에 따른 성능 저하 문제를 근본적으로 해결하기 위한 설계 접근안을 제안합니다.

---

## 1. 배경 및 문제 정의 (Background & Problem Definition)

### LLM Wiki와 지식 연결의 가치
- **LLM Wiki**는 LLM(대형 언어 모델)이 원본 문서(Inbox)로부터 개념, 사건, 인물 등의 개체(Entity)를 파싱하고, 이들 간의 의미적 연결 관계를 정의하여 스스로 성장시키는 지식베이스입니다.
- 이 시스템의 핵심 가치는 문서 간의 단순 링크를 넘어, **"문서 ➔ 개념 ➔ 다른 개념 ➔ 관련 문서"**로 이어지는 다차원 지식 그래프망을 형성하여 사용자에게 다차원적 피드백과 지식 탐색 경로를 제공하는 데 있습니다.

### 기존 아키텍처의 한계
1. **성능 저하 (Join Explosion)**: 데이터가 수백만 건 이상으로 증가함에 따라 관계형 데이터베이스(RDB)의 다중 조인(Multi-way Join)을 통한 그래프 추적은 쿼리 속도의 지연을 초래합니다.
2. **인프라 관리 복잡성**: 그래프 쿼리를 위해 별도의 전용 그래프 데이터베이스(예: Neo4j)를 도입할 경우, 데이터 동기화 파이프라인의 구축, 분산 환경에서의 일관성 유지, 라이선스 및 인프라 운영 비용이 급격히 증가합니다.
3. **확장성(Scalability) 제약**: LLM Wiki의 문서와 엔티티가 기하급수적으로 축적될 때, 메모리 기반 그래프 엔진은 스케일아웃(Scale-out) 시점에서 한계에 직면합니다.

---

## 2. BigQuery 기반 해결 방안 (The BigQuery Solution)

Google Cloud의 **BigQuery Property Graph**는 별도의 그래프 데이터베이스를 구동하지 않고, BigQuery 고유의 분산 스토리지와 서버리스 쿼리 엔진 상에서 직접 노드(Node)와 에지(Edge) 관계를 선언하는 기술입니다. 

이를 통해 **초대용량 확장성**과 **SQL/GQL(Graph Query Language)의 단일 쿼리 융합**이라는 이점을 동시에 얻을 수 있습니다.

### ① 물리 테이블 설계 (Physical Schema Definitions)

BigQuery 상에 원본 문서, 추출된 엔티티, 그리고 이들의 연결 관계를 나타내는 4개의 물리 테이블을 설계합니다.

```sql
-- 1. 원본 문서 노드 테이블 (00_inbox 및 합성 위키 문서)
CREATE TABLE `my_project.llm_wiki.documents` (
  doc_id STRING,            -- 예: 'DOC_20260704_001'
  title STRING,             -- 예: '결제 실패 장애 보고서'
  doc_type STRING,          -- 'INBOX', 'SYNTHESIZED_WIKI'
  content STRING,           -- 마크다운 원본 텍스트
  created_at TIMESTAMP
);

-- 2. 엔티티 노드 테이블 (파싱된 개념/객체)
CREATE TABLE `my_project.llm_wiki.entities` (
  entity_id STRING,         -- 예: 'ENT_CUST_1234', 'ENT_PROD_PHONE'
  name STRING,              -- 예: '고객 1234', '스마트폰'
  entity_type STRING,       -- 'Customer', 'Product', 'Incident'
  summary STRING,           -- 엔티티 설명 요약
  aliases ARRAY<STRING>     -- 별칭 목록 ['휴대폰', '스마트폰']
);

-- 3. [에지 1] 문서 ➔ 엔티티 언급 관계 (Mentions Edge)
CREATE TABLE `my_project.llm_wiki.doc_mentions` (
  doc_id STRING,
  entity_id STRING,
  mentioned_at TIMESTAMP
);

-- 4. [에지 2] 엔티티 ➔ 엔티티 백링크 관계 (Backlinks Edge)
CREATE TABLE `my_project.llm_wiki.entity_backlinks` (
  source_entity_id STRING,
  target_entity_id STRING,
  relation_type STRING      -- 'AFFECTS', 'PURCHASED', 'RELATED_TO'
);
```

### ② Property Graph DDL 생성 (Property Graph Definition)

위의 물리 테이블들을 묶어 BigQuery 표준 GQL Graph로 정의합니다. DDL 작성 시 BigQuery 예약어 충돌을 방지하고 구문을 보장하기 위해 노드 및 에지 레이블은 **백틱(\`)**으로 감싸 선언합니다.

```sql
CREATE OR REPLACE PROPERTY GRAPH `my_project.llm_wiki.knowledge_graph`
  -- 노드(Node) 정의
  NODE TABLES (
    `my_project.llm_wiki.documents`
      KEY (doc_id)
      LABEL `Document`
      PROPERTIES (doc_id, title, doc_type, content),
      
    `my_project.llm_wiki.entities`
      KEY (entity_id)
      LABEL `Entity`
      PROPERTIES (entity_id, name, entity_type, summary)
  )
  -- 에지(Edge) 정의
  EDGE TABLES (
    `my_project.llm_wiki.doc_mentions`
      KEY (doc_id, entity_id)
      SOURCE KEY (doc_id) REFERENCES `documents`(doc_id)
      DESTINATION KEY (entity_id) REFERENCES `entities`(entity_id)
      LABEL `MENTIONS`,
      
    `my_project.llm_wiki.entity_backlinks`
      KEY (source_entity_id, target_entity_id, relation_type)
      SOURCE KEY (source_entity_id) REFERENCES `entities`(entity_id)
      DESTINATION KEY (target_entity_id) REFERENCES `entities`(entity_id)
      LABEL `LINKED_TO`
      PROPERTIES (relation_type)
  );
```

---

## 3. GQL 쿼리를 활용한 지식 탐색 예시 (Knowledge Discovery Query)

BigQuery Property Graph가 구축되면 아래와 같이 `GRAPH_TABLE` 함수와 `MATCH` 패턴 구문을 사용하여 복잡한 경로 추적 및 백링크 조회를 SQL 내에서 쉽고 빠르게 수행할 수 있습니다.

### 예시: '스마트폰' 엔티티를 언급한 문서와, 해당 엔티티와 연관된('AFFECTS' 관계) 다른 엔티티 목록 조회
```sql
SELECT *
FROM GRAPH_TABLE(
  `my_project.llm_wiki.knowledge_graph`
  MATCH (d:`Document`)-[m:`MENTIONS`]->(e1:`Entity` {name: '스마트폰'})-[r:`LINKED_TO` {relation_type: 'AFFECTS'}]->(e2:`Entity`)
  COLUMNS(d.title AS doc_title, e1.name AS source_entity, r.relation_type AS relation, e2.name AS target_entity)
);
```

---

## 4. 아키텍처적 이점 (Architectural Benefits)

1. **무한한 확장성 (Serverless Scale-out)**:
   - 전용 그래프 엔진(Neo4j 등)은 지식 그래프 크기가 커지면 고사양 메모리 인프라가 강제되지만, BigQuery는 컴퓨팅과 스토리지가 분리된 아키텍처 상에서 페타바이트급 데이터도 병렬 분산 처리합니다.
2. **O&M(운영 및 관리) 비용 제로화**:
   - 별도의 VM이나 클러스터를 상시 구동할 필요가 없으며, 사용한 쿼리량 및 스토리지 용량에 대해서만 비용을 지불하므로 운영 부담이 매우 낮습니다.
3. **SQL & GQL의 단일 쿼리 융합**:
   - 그래프 탐색 결과(GQL)와 정형 메타데이터 분석 및 빅데이터 집계 기능(SQL)을 단일 쿼리 안에서 결합(Join, CTE 등)하여 처리할 수 있습니다.
4. **강력한 데이터 보안 및 거버넌스**:
   - IAM, 데이터 암호화, Dataplex 연동 등 Google Cloud의 검증된 엔터프라이즈 보안 및 거버넌스 체계를 지식 그래프에 그대로 적용할 수 있습니다.

---

## 5. 남은 과제 및 발전 방향 (Challenges & Future Roadmaps)

1. **물리 인덱싱 전략 최적화 (Clustering & Partitioning)**:
   - BigQuery는 RDB식 B-Tree 인덱스가 없으므로, 대규모 그래프 매칭 쿼리 성능을 보장하기 위해 노드/에지 테이블의 물리 파티셔닝(예: `created_at` 기준) 및 클러스터링(예: `doc_id`, `entity_id` 기준) 설계를 면밀히 적용해야 합니다.
2. **실시간/증분 메타데이터 파이프라인 연계**:
   - 신규 문서가 `inbox`에 추가되거나 LLM이 위키 문서를 합성할 때, 파싱된 엔티티 및 에지 관계 정보만을 발라내어 에지 테이블에 점진적으로 삽입(Incremental Merge)하는 자동화 파이프라인(Dataform 또는 Cloud Composer) 구축이 필요합니다.
3. **Vector Search와의 융합 (Graph RAG)**:
   - BigQuery Vector Search 기능과 Property Graph를 결합하여, 사용자의 자연어 질문에 대해 유사도가 높은 문서를 검색(Vector Search)하고, 그와 연결된 지식 노드를 추적(Graph 탐색)하여 LLM에 프롬프트 컨텍스트로 전달하는 고도화된 **Graph RAG** 아키텍처로 진화할 수 있습니다.
