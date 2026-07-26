# Design Proposal: BigQuery Property Graph-Based LLM Wiki Knowledge Graph

This document proposes a design approach for upgrading the knowledge management architecture of the **Ontology with OKF** platform. It integrates Google Cloud BigQuery's massive infrastructure and standard Property Graph capabilities to mitigate management complexity and solve the performance degradation issues commonly caused by large-scale data growth in LLM Wikis (based on the Karpathy LLM-Wiki concept).

---

## 1. Background & Problem Definition

### The Value of LLM Wiki and Knowledge Connectivity
- An **LLM Wiki** is a self-evolving knowledge base where a Large Language Model (LLM) parses entities (e.g., concepts, incidents, individuals) from raw incoming documents (Inbox) and establishes semantic linkages between them.
- The core value of this system extends beyond simple hyperlinks between pages. It forms a multi-dimensional knowledge graph network representing **"Document ➔ Entity ➔ Other Entity ➔ Related Document"** to provide users with deep exploration paths and contextual feedback.

### Limitations of Existing Architectures
1. **Performance Degradation (Join Explosion)**: As the volume of data grows into millions of records, querying graph paths using relational databases (RDBs) via multi-way joins causes significant query latency.
2. **Infrastructure Management Complexity**: Introducing a dedicated graph database (such as Neo4j) requires maintaining data synchronization pipelines, resolving consistency across distributed systems, and managing high licensing and infrastructure operation costs.
3. **Scalability Bottlenecks**: As wiki documents and entities accumulate exponentially, memory-bound graph engines face performance limits when scaling out.

---

## 2. The BigQuery-Based Solution

Google Cloud's **BigQuery Property Graph** allows users to declare Node and Edge relationships directly within BigQuery's native distributed storage and serverless query engine without running a separate graph database cluster.

This architecture simultaneously delivers **petabyte-scale scalability** and **unified hybrid querying (SQL + GQL)**.

### ① Physical Schema Definitions

We design four physical tables in BigQuery to store source documents, extracted entities, and their relational links.

```sql
-- 1. Source Document Node Table (Inbox & Synthesized Wiki Documents)
CREATE TABLE `my_project.llm_wiki.documents` (
  doc_id STRING,            -- e.g., 'DOC_20260704_001'
  title STRING,             -- e.g., 'Payment Failure Incident Report'
  doc_type STRING,          -- 'INBOX', 'SYNTHESIZED_WIKI'
  content STRING,           -- Raw markdown content
  created_at TIMESTAMP
);

-- 2. Entity Node Table (Parsed concepts, objects, or systems)
CREATE TABLE `my_project.llm_wiki.entities` (
  entity_id STRING,         -- e.g., 'ENT_CUST_1234', 'ENT_PROD_PHONE'
  name STRING,              -- e.g., 'Customer 1234', 'SmartPhone'
  entity_type STRING,       -- 'Customer', 'Product', 'Incident'
  summary STRING,           -- Brief summary of the entity
  aliases ARRAY<STRING>     -- List of aliases, e.g., ['SmartPhone', 'Mobile Phone']
);

-- 3. [Edge 1] Document ➔ Entity Mention Relationship (Mentions Edge)
CREATE TABLE `my_project.llm_wiki.doc_mentions` (
  doc_id STRING,
  entity_id STRING,
  mentioned_at TIMESTAMP
);

-- 4. [Edge 2] Entity ➔ Entity Backlink Relationship (Backlinks Edge)
CREATE TABLE `my_project.llm_wiki.entity_backlinks` (
  source_entity_id STRING,
  target_entity_id STRING,
  relation_type STRING      -- 'AFFECTS', 'PURCHASED', 'RELATED_TO'
);
```

### ② Property Graph DDL Creation

We define the standard GQL Property Graph that encapsulates the physical tables. To prevent conflicts with reserved keywords and to guarantee successful compilation in BigQuery, all node and edge labels are enclosed in **backticks (\`)**.

```sql
CREATE OR REPLACE PROPERTY GRAPH `my_project.llm_wiki.knowledge_graph`
  -- Node Definitions
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
  -- Edge Definitions
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

## 3. Knowledge Discovery via GQL Query (Example)

Once the BigQuery Property Graph is created, you can execute complex path traversal and backlink queries directly inside SQL using the `GRAPH_TABLE` function and `MATCH` patterns.

### Example: Retrieve documents mentioning 'SmartPhone' and find other entities linked to it via the 'AFFECTS' relationship
```sql
SELECT *
FROM GRAPH_TABLE(
  `my_project.llm_wiki.knowledge_graph`
  MATCH (d:`Document`)-[m:`MENTIONS`]->(e1:`Entity` {name: 'SmartPhone'})-[r:`LINKED_TO` {relation_type: 'AFFECTS'}]->(e2:`Entity`)
  COLUMNS(d.title AS doc_title, e1.name AS source_entity, r.relation_type AS relation, e2.name AS target_entity)
);
```

---

## 4. Architectural Benefits

1. **Infinite Scalability (Serverless Scale-out)**:
   - Dedicated graph engines require expensive memory-intensive hardware as the graph size grows. BigQuery runs on a decoupled storage and compute architecture, allowing it to execute parallel queries over petabytes of data effortlessly.
2. **Zero O&M (Operations & Maintenance) Overhead**:
   - There are no VMs or database clusters to manage or keep running. You are billed purely for storage and query execution, resulting in minimal administrative cost.
3. **Unified SQL & GQL Execution**:
   - You can seamlessly combine graph traversal (GQL) with relational data analytics, aggregations, and window functions (SQL) in a single query (using CTEs or JOINs).
4. **Enterprise Security & Governance**:
   - The knowledge graph inherits BigQuery's robust, production-proven security models, including Identity and Access Management (IAM), data encryption, and Dataplex catalog integration.

---

## 5. Challenges & Future Roadmap

1. **Physical Indexing Optimization (Clustering & Partitioning)**:
   - Since BigQuery does not use traditional B-tree indexes, we must optimize query costs and speeds by implementing physical partitioning (e.g., partition edge tables by `created_at` or `mentioned_at`) and clustering (e.g., cluster tables by `doc_id` and `entity_id`).
2. **Real-time / Incremental Metadata Pipelines**:
   - When new documents are ingested into the `inbox` or synthesized by the LLM, we need automated pipelines (such as Dataform or Cloud Composer) to extract entities/edges and run incremental merges into the underlying tables.
3. **Integration with Vector Search (Graph RAG)**:
   - By combining BigQuery Vector Search and Property Graph capabilities, the system can evolve into a advanced **Graph RAG** architecture. In this setup, user queries retrieve semantically similar documents via Vector Search, navigate relationships using GQL, and compile the entire graph context to prompt the LLM for highly context-aware responses.
