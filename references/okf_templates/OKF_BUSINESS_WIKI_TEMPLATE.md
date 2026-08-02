# 🔮 OKF (Open Knowledge Format) 비즈니스 지식 정의서 템플릿

본 문서는 **Ontology with OKF** 플랫폼의 지식 확장성을 위해, 사내 비정형 비즈니스 위키(Wiki) 가이드라인 문서를 자율 데이터 파싱 및 AI 지식 보강(Enrichment)에 최적화된 **OKF 표준 규격**으로 구조화하기 위한 템플릿 스펙입니다.

---

## 1. 🔗 비즈니스 정의서와 물리 스키마 연계 아키텍처 (A, B, C 유형 비교)

비즈니스 현업이 작성하는 정의서와 시스템 물리 테이블은 아래와 같이 **AI 에이전트(Gemini)**의 의미적 추론 파이프라인을 거쳐 유기적으로 결합됩니다. 

이해를 돕기 위해 **"주문 반품 및 환불 지침"**을 기준으로 각 유형의 실제 마크다운 코드 예시를 제공합니다.

---

### 📄 [유형 A] 원본 비즈니스 정의서 (현업 위키 예시)
* **작성자**: 현업 기획자, CS 운영팀, 비즈니스 아키텍트
* **특징**: 물리 테이블 이름이나 외래키 같은 IT 개발 지식은 배제하고, **순수 비즈니스 로직(환불 규정)만 자연어(한글)**로 편하게 적습니다. 최초 작성 시 물리 조인 키나 그래프 링크 섹션은 적지 않습니다.

#### 💡 실제 마크다운 예시 (`docs/okf-templates/order_refund_policy.md` 원본)
```markdown
---
type: BusinessSpecification
datasetId: theLookCommerce
targetTables:
  - orders
  - order_items
  - users
tags: [sales, refunds, cs_policy]
author: "CS Operations & Finance Division"
lastUpdated: "2026-07-10"
---

# 📄 주문 환불 및 반품 처리 업무 지침

## 1. 개요
본 지침은 theLook 쇼핑몰에서 발생하는 고객의 주문 취소, 반품 접수, 환불 금액 정산 절차 및 악성 환불 어뷰저 방지를 위한 기준을 정의합니다.

## 2. 핵심 비즈니스 규칙 & 정책
- **반품 신청 가능 기간 및 환불 수용 규정**
  - 주문서상 배송 완료 일시와 고객이 최종 반품 접수를 완료하여 주문 상태가 반품 상태('Returned')로 전환된 날짜의 차이가 **영업일 기준 7일 이내**인 주문 건에 한해 전액 환불을 보장합니다.
  - 배송 완료일 이후 7일을 초과하고 15일 이내에 접수된 단순 변심 반품 건은 재고 감가상각 20% 페널티를 적용하여 상품 판매가의 80%만 환불 정산합니다.
- **환불 금액 및 결제 수단별 정산 공식**
  - 개별 주문 품목 상태가 반품 완료('Returned')로 확정되면, 해당 주문 항목의 개별 상품 판매가(Sale Price)를 기준으로 환불 금액을 집계합니다.
- **반복적 환불 어뷰징 (Abuse Protection)**
  - 특정 회원의 최근 90일간 주문 이력 중, 최종 상태가 반품('Returned') 또는 취소('Cancelled')로 끝난 주문 횟수가 해당 회원의 전체 누적 주문 횟수의 **40% 이상**이고, 총 반품 금액이 **$300.00 이상**인 경우 '주의 대상 회원'으로 분류합니다.
```

---

### 📊 [유형 B] 기존 물리 테이블 명세서 (기계적 메타 예시)
* **작성자**: 시스템 자동 생성 (BigQuery DDL 스캔)
* **특징**: 데이터베이스 스펙만 기계적으로 수집되어 생성된 상태입니다. 이 단계에서는 이 테이블이 어떤 비즈니스 업무 규칙(7일 이내 반품 등)과 연계되는지 메타데이터 정보가 전혀 없습니다.

#### 💡 실제 마크다운 예시 (`tables/orders.md` 원본)
```markdown
---
type: PhysicalTableSpecification
datasetId: theLookCommerce
tableId: orders
---

# 📊 Table: orders

## 1. Description
BigQuery physical table containing master order records.

## 2. Schema
| Field Name | Type | Description |
| :--- | :--- | :--- |
| order_id | INT64 | Unique order identifier |
| user_id | INT64 | User identifier who placed the order |
| status | STRING | Order status (e.g. Processing, Complete, Returned) |
| created_at | TIMESTAMP | Order timestamp |
| delivered_at | TIMESTAMP | Delivery completed timestamp |
```

---

### 🔮 [유형 C] 보강된 최종 명세서 (AI Enrichment 결과물 예시)
* **작성자**: **AI 에이전트 (Gemini)의 자율 생성**
* **특징**: AI가 **[유형 A]** 위키를 읽고 **[유형 B]** 물리 명세서에 비즈니스 규칙을 매핑하여 설명을 풍부하게 보강하고, 맨 하단에 테이블 간의 조인 키 및 그래프 릴레이션 정보를 자율적으로 기입하여 최종 지식 카탈로그를 구축합니다.

#### 💡 실제 마크다운 예시 (`tables/orders.md` 보강 완료본)
```markdown
---
type: PhysicalTableSpecification
datasetId: theLookCommerce
tableId: orders
enrichedBy: order_refund_policy.md
---

# 📊 Table: orders

## 1. Description
BigQuery physical table containing master order records.
* **[Business Rule 추가됨]**: 배송 완료일(`delivered_at`) 이후 7일 이내에만 100% 전액 환불 반품 수용. 7일 초과 시 20% 페널티 차감정산. (📄 [참조: order_refund_policy.md])

## 2. Schema
| Field Name | Type | Description |
| :--- | :--- | :--- |
| order_id | INT64 | Unique order identifier |
| user_id | INT64 | User identifier who placed the order |
| status | STRING | Order status. *[Business Context]* `'Returned'` 상태는 배송완료 후 7일 이내 접수 건만 전액 환불 유효. |
| created_at | TIMESTAMP | Order timestamp |
| delivered_at | TIMESTAMP | Delivery completed timestamp |

## 3. 물리 데이터 매핑 & 시맨틱 링크 (AI Inferred)

### 🔗 물리 조인 키 FK 링크 (Physical FK Links)
* [order_items](order_items.md) -> [orders](orders.md) (조인 키: `order_items.order_id` = `orders.order_id`)
  - 개별 품목의 반품 여부와 마스터 주문의 최종 상태 비교를 위해 연결.

### 🕸️ 그래프 릴레이션 링크 (Graph Relation Links)
* (u:`User`)-[p:`Placed`]->(o:`Order`) -> [orders](orders.md)
  - 특정 사용자의 다차원 반품 비율 탐색을 위한 Spanner Graph GQL 패턴 매핑.
```

---

## 2. OKF 비즈니스 정의서 표준 템플릿 규격 (Specification)

현업 실무자가 사내 비즈니스 위키 문서를 작성할 때 사용하는 **순수 비즈니스 관점의 표준 템플릿** 구조입니다.

```markdown
---
type: BusinessSpecification           # 문서 종류 고정 (BusinessSpecification 또는 BusinessRule)
datasetId: [BIGQUERY_DATASET_ID]      # 연관된 BigQuery 물리 데이터셋 ID
targetTables:                         # 연관된 물리 테이블 식별자 목록
  - [table_id_1]
  - [table_id_2]
tags: [[tag1], [tag2]]                # 검색 및 검색 엔진(RAG) 분류 태그
author: [작성부서 또는 작성자]
lastUpdated: [YYYY-MM-DD]
---

# 📄 [비즈니스 가이드라인 제목]

## 1. 개요 (Overview)
- 본 비즈니스 프로세스 또는 규정이 존재하는 목적과 업무적 배경을 서술합니다.
- *언어 규칙*: 모든 설명은 반드시 **한국어(Korean)**로 서술합니다.

## 2. 핵심 비즈니스 규칙 & 정책 (Business Rules & Policies)
업무 현장에서 적용되는 구체적인 규정 및 연산 공식을 명시합니다. 
물리 데이터 매핑을 돕기 위해 비즈니스 설명 문맥 속에 연관된 컬럼의 명칭(예: 주문상태, 가입일 등)을 자연스럽게 함께 노출해 주는 것이 좋습니다.

- **규칙 1: [규칙 요약]**
  - 상세 비즈니스 조건 기술 (예: 고객 가입일 기준으로 30일 이내에...)
- **규칙 2: [산식 또는 조건]**
  - 계산 공식 정의 (예: 매출액 = 개별 상품 판매가의 합산)
```
