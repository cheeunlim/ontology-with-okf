# 🔮 OKF 기반 엔터프라이즈 컨플루언스(Confluence) 지식 통합 아키텍처 및 설계 가이드

## 1. 개요 및 문제 정의 (The Problem)

현대 기업의 데이터 거버넌스에서 가장 빈번히 실패하는 지점은 **"물리 데이터 스펙(BigQuery 스키마)"**과 **"비즈니스 지식(사내 가이드라인, 기획서)"** 간의 의미적 괴리입니다. 

특히 사내 협업 플랫폼인 **Confluence**에는 엄청난 양의 비즈니스 지식이 적재되지만, 다음과 같은 고질적인 지식 파편화 문제가 발생합니다.

### 🔴 문제 상황 (Pain Points)
1. **작성 주체별 문서 스타일의 불일치**:
   - 기획자(PM)는 유저 시나리오와 기획의 목적 위주로 서술합니다.
   - 개발자(System Architect)는 DDL, ERD, API 명세, 시스템 흐름 위주로 서술합니다.
   - CS/재무팀은 표(Table)를 활용해 세부 업무 규정, 금액 산식, 감가상각 페널티 등을 기입합니다.
2. **구조화와 자유도의 충돌**:
   - **구조화 강제 시 (템플릿 제한)**: 기계적 정확도는 올라가나 현업 작성자가 심각한 작업 귀찮음(UX Frictional Resistance)을 느껴 문서 작성을 기피하거나 템플릿을 무시하여 관리가 방치됩니다.
   - **자유도 방임 시 (포맷 방임)**: 작성은 편하지만 포맷이 완전히 파편화되어 기계나 AI가 문서에서 의미적인 조인 키, 정책 조건식을 자동으로 추출해 내는 것이 원천적으로 불가능해집니다.

---

## 2. 해결 방안: OKF 하이브리드 아키텍처 (The Solution)

Ontology with OKF 플랫폼은 **"작성자는 자유롭게 쓰고, 수집 시점에 AI가 공통 템플릿에 맞추어 사후 구조화"**하는 **하이브리드 지식 파이프라인**을 제안합니다.

```
[Confluence 자유 양식 문서 인입]
  - 기획 PRD / CS 정책 / 개발 설계서 (다양한 패턴)
           │
           ▼
[AI 자율 해체 & 표준 구조화 파이프라인 (OKF Decomposer Engine)]
  - LlmWikiDecomposePrompt 기반 구조화
  - 공통 영역(Frontmatter 힌트)과 본문 자유 서술 영역의 자율 분리
           │
           ▼
[OKF 표준 비즈니스 명세서 변환 (유형 A)]
  - targetTables 및 비즈니스 정책 구조화
           │
           ▼
[빅쿼리 물리 DDL 스캔 (유형 B)] 와 교차 검증 및 시맨틱 추론
           │
           ▼
[최종 보강된 시맨틱 메타데이터 빌드 (유형 C)]
  - 물리 조인 키 FK 링크 및 그래프 릴레이션 GQL 맵핑 자동 주입
```

### 🔑 공통 영역과 자유 영역의 구분 설계
* **공통 영역 (Standardized Metadata)**: 
  - 문서 최상단에 아주 가벼운 YAML Frontmatter 칩(예: 관련 데이터셋 ID, 영향받는 테이블 목록, 태그)을 기입하도록 권장하여 AI가 분석 타겟 범위를 축소할 수 있는 최소한의 가이드라인을 제공합니다.
* **자유 영역 (Flexible Context)**: 
  - 본문 서술 방식은 작성자의 역할과 도메인 특성에 맞추어 자유 양식을 보장하되, 자연어 문맥 속에 중요한 명사(주문번호, 회원ID 등)를 포함하여 작성하도록 유도합니다.

---

## 3. 문서 패턴별 OKF 변환 설계 및 입출력 예시

기업에서 가장 흔히 발견되는 **3가지 컨플루언스 문서 패턴**을 기반으로, 원본 입력값과 AI 변환 이후 생성된 OKF 마크다운 결과물을 대조하여 설명합니다.

---

### 📂 패턴 1: 비즈니스 정책 및 업무 규정 문서 (Business Policy Spec)
* **특징**: 자연어 문장 위주로 흐르며, 조건 제약 규정은 가시성을 위해 **표(Table) 컴포넌트**에 집약하여 작성되는 패턴입니다.
* **대상 부서**: CS 운영팀, 재무/정산팀

#### 📥 [Confluence 입력 원본]
```markdown
---
type: BusinessSpecification
datasetId: theLookCommerce
targetTables: [orders, order_items]
tags: [cs_refund, promo_policy]
---
# [정산-정책] 주문 취소 및 환불 정산 운영 규칙

본 문서는 쇼핑몰 주문의 결제 이후 취소, 반품 시 정산 금액 차감 기준을 정의합니다.

## 1. 반품 기한 및 환불 한도
고객이 수령한 상품의 반품 가능 여부는 배송이 완료된 시점을 기준으로 측정합니다.
- 배송 완료일 이후 7일 이내에 반품 접수가 완료되어 주문상태가 'Returned'로 바뀌면 전액(100%) 환불합니다.
- 7일 초과 15일 이내 접수 건은 20%의 감가상각 페널티를 차감한 80%만 부분 환불합니다.

## 2. 환불금 산정 공식
반품이 최종 완료된 개별 품목의 최종 결제된 판매가(Sale Price)를 기준으로 환불액을 합산합니다.
```

#### 📤 [변환 후 OKF 비즈니스 명세 (유형 A)]
```markdown
# 📄 비즈니스 정책: 주문 취소 및 환불 정산 운영 규칙
- **문서 유형**: BusinessSpecification
- **연관 물리 테이블**: `orders`, `order_items`

## 핵심 비즈니스 규칙 및 조건
1. **일반 반품 (100% 환불)**:
   - 조건: `orders.delivered_at`로부터 `orders.status`가 `'Returned'`로 변경된 시점의 차이 <= 7 days
2. **지연 반품 (80% 환불)**:
   - 조건: 7 days < `orders.delivered_at`로부터 `orders.status`가 `'Returned'`로 변경된 시점의 차이 <= 15 days
   - 공식: 환불금 = `order_items.sale_price` * 0.8
```

---

### 📂 패턴 2: 기술적 시스템 설계서 (Technical System Design)
* **특징**: 스키마 구조, 데이터 파이프라인 흐름, DDL 및 SQL 조인 공식이 코드 및 식별자 위주로 작성되는 패턴입니다.
* **대상 부서**: 데이터 엔지니어링팀, 백엔드 아키텍처팀

#### 📥 [Confluence 입력 원본]
```markdown
---
type: TechnicalDesign
datasetId: theLookCommerce
targetTables: [orders, users, products]
---
# 주문 및 배송 관리 시스템 데이터 파이프라인 아키텍처

본 문서는 주문 발생 시 회원 정보와 연계하여 배송을 처리하기 위한 데이터 흐름을 정의합니다.

## 1. 관계 스키마 결합 정의 (Joins)
- 주문서의 상세 품목은 주문 마스터와 결합됩니다. 
  - `orders` 테이블의 `order_id` 컬럼과 `order_items` 테이블의 `order_id` 컬럼을 맵핑합니다.
- 주문을 수행한 고객의 가입일자 및 상세 정보를 조회하기 위해 회원 마스터 테이블을 결합합니다.
  - `orders` 테이블의 `user_id`를 기준으로 `users` 테이블의 `id` 컬럼을 조인 키로 정의합니다.
```

#### 📤 [변환 후 OKF 기술 명세 (유형 A)]
```markdown
# 📄 기술 설계: 주문 및 배송 관리 데이터 파이프라인 아키텍처
- **문서 유형**: TechnicalDesign
- **연관 물리 테이블**: `orders`, `order_items`, `users`

## 시스템 조인 리니지 (System Join Lineage)
1. **orders ↔ order_items 결합**:
   - `orders.order_id` = `order_items.order_id` (1:N Cardinality)
2. **orders ↔ users 결합**:
   - `orders.user_id` = `users.id` (N:1 Cardinality)
```

---

### 📂 패턴 3: 요구사항 정의서 (Product Requirement Document - PRD)
* **특징**: 화면 레이아웃, 신규 사용자 시나리오, 상태값 추가 요건 등이 문장식 기획어로 서술되는 패턴입니다.
* **대상 부서**: 서비스 기획팀, Product Owner

#### 📥 [Confluence 입력 원본]
```markdown
---
type: ProductRequirement
datasetId: theLookCommerce
targetTables: [orders]
---
# [기획서] 배송 지연 안내 자동화 및 주문 상태 추적 기능 개선

## 1. 개요 및 유저 시나리오
쇼핑몰 고객이 물건을 구매하고 배송이 늦어질 경우 마이페이지에 경보를 띄우고 지연 안내 문자를 발송합니다.

## 2. 상세 정책 및 시스템 조건
- 주문이 완료되어 `'Processing'` 상태가 된 생성 시간 기준으로 3일이 지났음에도 배송 시작 시간이 비어있다면 시스템이 배송 지연 상태로 감지해야 합니다.
```

#### 📤 [변환 후 OKF 기획 명세 (유형 A)]
```markdown
# 📄 기획 사양: 배송 지연 안내 자동화 및 주문 상태 추적 기능 개선
- **문서 유형**: ProductRequirement
- **연관 물리 테이블**: `orders`

## 도출 비즈니스 로직
1. **배송 지연 경보 조건**:
   - 조건: `orders.status`가 `'Processing'`이고, 현재시간 - `orders.created_at` > 3 days 이며, `orders.shipped_at`이 `NULL`인 대상자 추출.
```

---

## 4. 🔮 시맨틱 그래프 릴레이션 연계 최종 결과 (유형 C Enriched Spec)

AI 에이전트는 위의 3가지 서로 다른 성격의 문서(패턴 1, 2, 3)를 모두 수집하고 통합 분석하여, 최하단의 BigQuery 물리 스키마 명세인 **`tables/orders.md`**에 비즈니스 규칙과 시맨틱 관계망을 완벽하게 융합 보강해 냅니다.

#### 💡 실제 생성된 Enriched OKF 물리 명세서 (`tables/orders.md` 최종본)
```markdown
---
type: PhysicalTableSpecification
datasetId: theLookCommerce
tableId: orders
enrichedBy: 
  - order_refund_policy.md (패턴 1)
  - pipeline_architecture.md (패턴 2)
  - shipping_alert_prd.md (패턴 3)
---

# 📊 Table: orders

## 1. Description
BigQuery physical table containing master order records.

### 🛡️ 비즈니스 정책 및 규칙 연계 (Business Rules & Mappings)
- **배송 상태 트래킹 규칙**: 주문 상태가 `'Processing'`이고 생성일(`created_at`) 기준 3일 초과 지연 시 배송 경보 발송. (📄 [참조: shipping_alert_prd.md])
- **반품 기한 규정**: 배송 완료일(`delivered_at`) 이후 7일 이내 반품 접수 상태(`status` = `'Returned'`) 전환 시 100% 환불. 15일 이내 접수 시 20% 페널티 차감 후 80% 부분 환불. (📄 [참조: order_refund_policy.md])

## 2. Schema
| Field Name | Type | Description |
| :--- | :--- | :--- |
| order_id | INT64 | Unique order identifier. *[System Join]* `order_items.order_id`와 1:N 결합. (📄 [참조: pipeline_architecture.md]) |
| user_id | INT64 | User identifier. *[System Join]* `users.id`와 N:1 결합. 어뷰저 추적 기준 키. |
| status | STRING | Order status. *[Context]* `'Returned'`는 반품 기한 규정의 영향을 받음. |
| created_at | TIMESTAMP | Order timestamp. 배송 지연 계산의 기준 시간. |
| delivered_at | TIMESTAMP | Delivery completed timestamp. 반품 가능일(7일 이내) 계산의 시작점. |

## 3. 물리 데이터 매핑 & 시맨틱 링크 (AI Inferred)

### 🔗 물리 조인 키 FK 링크 (Physical FK Links)
* [order_items](order_items.md) -> [orders](orders.md) (조인 키: `order_items.order_id` = `orders.order_id`)
  - 개별 품목의 환불 여부 대조 및 판매가(`sale_price`)의 합산 정산을 위해 조인. (📄 [참조: pipeline_architecture.md])
* [orders](orders.md) -> [users](users.md) (조인 키: `orders.user_id` = `users.id`)
  - 반복적 반품 어뷰징 회원 식별을 위해 회원 마스터와 결합. (📄 [참조: order_refund_policy.md])

### 🕸️ 그래프 릴레이션 링크 (Graph Relation Links)
* (u:`User`)-[p:`Placed`]->(o:`Order`) -> [orders](orders.md)
  - 특정 사용자의 반품 패턴 추적을 위한 Spanner Graph GQL 패턴 매핑.
* (o:`Order`)-[c:`Contains`]->(oi:`OrderItem`) -> [order_items](order_items.md)
  - 마스터 주문서와 개별 반품 대상 품목 간의 포함 릴레이션 매핑.
```
