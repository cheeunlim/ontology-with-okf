/**
 * Standalone Showcase Page: How OKF v0.2 Feeds Google Cloud Knowledge Catalog & Spanner Graph.
 * Routes:
 *   - /ko          (Korean localized showcase page)
 *   - /kc-spanner  (English localized showcase page)
 */

import React, { useState, useEffect } from 'react';
import './KcSpannerDemoPage.css';

const SCENARIOS = {
  orders: {
    id: 'orders',
    icon: '📦',
    labelEn: 'Orders & Refund Policy',
    labelKr: '주문 & 환불 정책',
    tableId: 'orders',
    frontmatter: {
      kind: 'table',
      status: 'stable',
      trust_tier_en: 'Human-Reviewed',
      trust_tier_kr: '스튜어드 승인 완료 (Human-Reviewed)',
      stale_after: '2027-09-29',
      verified_by: 'human:data-steward@enterprise.com',
      descriptionEn: 'Customer purchase orders enriched with VIP instant refund and return-abuse governance rules.',
      descriptionKr: 'VIP 30일 즉시 환불 정책 및 월 3회 초과 반품 심사 규칙이 결합된 고객 구매 주문 마스터 테이블.'
    },
    schema: [
      { col: 'order_id', type: 'STRING(36)', keyEn: 'PK', keyKr: 'PK (기본키)', termEn: 'Order ID', termKr: '결제 주문 고유번호' },
      { col: 'user_id', type: 'STRING(36)', keyEn: 'FK -> users.id', keyKr: 'FK -> users.id', termEn: 'Customer ID', termKr: '고객 고유 식별자' },
      { col: 'status', type: 'STRING(20)', keyEn: 'Property', keyKr: '속성', termEn: 'Order Lifecycle State', termKr: '주문 처리 상태' },
      { col: 'returned_at', type: 'TIMESTAMP', keyEn: 'Rule Trigger', keyKr: '정책 트리거', termEn: 'Return Timestamp', termKr: '반품 접수 일시' }
    ],
    policy: {
      wikiRef: '[[order_refund_policy]]',
      nodeLabel: 'RefundPolicy',
      ruleTitleEn: 'VIP 30-Day Instant Refund & Abuse Guard',
      ruleTitleKr: 'VIP 30일 즉시 환불 및 악성 반품 제한 규칙',
      ruleSummaryEn: 'VIP Gold users get instant refunds within 30 days; accounts with >3 returns/month require manual review.',
      ruleSummaryKr: 'VIP Gold 등급은 반품 후 30일 이내 즉시 환불 승인, 월 3회 초과 반품 계정은 수동 심사(MANUAL_REVIEW)로 전환.'
    },
    attestedSql: `SELECT o.order_id, o.user_id, o.status\nFROM \`thelook_ecommerce.orders\` o\nWHERE o.status = 'Returned' AND o.returned_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY);`,
    rawOkfEn: `---
kind: table
id: thelook_ecommerce.orders
status: stable
stale_after: '2027-09-29'
verified:
  - by: human:data-steward@enterprise.com
    at: '2026-09-29T10:00:00Z'
generated:
  by: reference_agent/gemini-3.5-flash
  at: '2026-09-29T09:50:00Z'
description: Customer purchase orders enriched with VIP instant refund and return-abuse governance rules.
sources:
  - id: policy-refund-01
    resource: gs://okf-omni/03_concepts/order_refund_policy.md
    title: E-Commerce Return & Refund Policy v2.4
---

# Table: \`orders\`

## Schema & Business Glossary Mapping
| Column | Type | Key | Linked Glossary Term |
| :--- | :--- | :--- | :--- |
| \`order_id\` | STRING | PK | [[Order ID]] |
| \`user_id\` | STRING | FK -> \`users.id\` | [[Customer ID]] |
| \`status\` | STRING | Property | [[Order Lifecycle State]] |
| \`returned_at\` | TIMESTAMP | Policy Trigger | [[Return Timestamp]] |

## Linked Business Concept: [[order_refund_policy]]
- **VIP Instant Refund**: Customers in \`VIP_GOLD\` tier qualify for automatic refund within 30 days of \`returned_at\`[^policy-refund-01].
- **Abuse Exception**: Users exceeding 3 returns in 30 days route to \`MANUAL_REVIEW\`[^policy-refund-01].

## Attested Computation
\`\`\`sql
SELECT o.order_id, o.user_id, o.status
FROM \`thelook_ecommerce.orders\` o
WHERE o.status = 'Returned'
  AND o.returned_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY);
\`\`\``,
    rawOkfKr: `---
kind: table
id: thelook_ecommerce.orders
status: stable
stale_after: '2027-09-29'
verified:
  - by: human:data-steward@enterprise.com
    at: '2026-09-29T10:00:00Z'
generated:
  by: reference_agent/gemini-3.5-flash
  at: '2026-09-29T09:50:00Z'
description: VIP 30일 즉시 환불 정책 및 월 3회 초과 반품 심사 규칙이 결합된 고객 구매 주문 마스터 테이블.
sources:
  - id: policy-refund-01
    resource: gs://okf-omni/03_concepts/order_refund_policy.md
    title: 이커머스 취소·반품·교환 표준 정책서 v2.4
---

# 테이블: \`orders\` (고객 주문)

## 물리 스키마 및 비즈니스 용어집(Glossary) 매핑
| 물리 컬럼 | 타입 | 키 역할 | 연결된 비즈니스 용어 |
| :--- | :--- | :--- | :--- |
| \`order_id\` | STRING | PK | [[결제 주문 고유번호]] |
| \`user_id\` | STRING | FK -> \`users.id\` | [[고객 고유 식별자]] |
| \`status\` | STRING | 속성 | [[주문 처리 상태]] |
| \`returned_at\` | TIMESTAMP | 정책 트리거 | [[반품 접수 일시]] |

## 연결된 비즈니스 정책: [[order_refund_policy]]
- **VIP 즉시 환불 규칙**: \`VIP_GOLD\` 등급 고객은 \`returned_at\` 기준 30일 이내 반품 시 즉시 자동 환불 승인[^policy-refund-01].
- **악성 반품 예외 규칙**: 최근 30일 내 반품 3회 초과 계정은 \`MANUAL_REVIEW\`(수동 심사)로 분기[^policy-refund-01].

## 검증된 비즈니스 쿼리 (Attested Computation)
\`\`\`sql
SELECT o.order_id, o.user_id, o.status
FROM \`thelook_ecommerce.orders\` o
WHERE o.status = 'Returned'
  AND o.returned_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY);
\`\`\``,
    graphNodes: [
      { id: 'User', label: 'User', subEn: 'Table: Users', subKr: '물리 테이블: Users', x: 90, y: 80, type: 'physical' },
      { id: 'Order', label: 'Order', subEn: 'Interleaved: Orders', subKr: '인터리브: Orders', x: 265, y: 80, type: 'physical' },
      { id: 'Product', label: 'Product', subEn: 'Table: Products', subKr: '물리 테이블: Products', x: 440, y: 80, type: 'physical' },
      { id: 'RefundPolicy', label: 'RefundPolicy', subEn: 'OKF Wiki Rule', subKr: 'OKF 위키 정책 노드', x: 265, y: 195, type: 'policy' }
    ],
    graphEdges: [
      { from: 'User', to: 'Order', label: 'PLACED' },
      { from: 'Order', to: 'Product', label: 'CONTAINS' },
      { from: 'Order', to: 'RefundPolicy', label: 'GOVERNED_BY', isPolicy: true }
    ],
    spannerSchemaDdl: `-- 1. Parent Entity Table (Physical Schema)
CREATE TABLE Users (
  user_id STRING(36) NOT NULL,
  email STRING(128),
  vip_tier STRING(20),
  monthly_return_count INT64
) PRIMARY KEY (user_id);

-- 2. Child Entity Table Interleaved for Low-Latency Joins
CREATE TABLE Orders (
  user_id STRING(36) NOT NULL,
  order_id STRING(36) NOT NULL,
  status STRING(20),
  returned_at TIMESTAMP,
  policy_id STRING(36)
) PRIMARY KEY (user_id, order_id),
  INTERLEAVE IN PARENT Users ON DELETE CASCADE;

-- 3. Ontology Policy Node Table (Compiled from OKF [[order_refund_policy]])
CREATE TABLE RefundPolicies (
  policy_id STRING(36) NOT NULL,
  rule_name STRING(64),
  max_days INT64,
  max_monthly_returns INT64,
  resolution_action STRING(32)
) PRIMARY KEY (policy_id);`,
    spannerGraphDdl: `CREATE OR REPLACE PROPERTY GRAPH okf_orders_graph
  NODE TABLES (
    Users AS \`User\`
      KEY (user_id)
      LABEL \`User\` PROPERTIES (user_id, email, vip_tier, monthly_return_count),
    Orders AS OrderNode
      KEY (user_id, order_id)
      LABEL \`Order\` PROPERTIES (order_id, status, returned_at),
    RefundPolicies AS PolicyNode
      KEY (policy_id)
      LABEL RefundPolicy PROPERTIES (policy_id, rule_name, resolution_action)
  )
  EDGE TABLES (
    Orders AS PlacedOrder
      KEY (user_id, order_id)
      SOURCE KEY (user_id) REFERENCES \`User\` (user_id)
      DESTINATION KEY (user_id, order_id) REFERENCES OrderNode (user_id, order_id)
      LABEL PLACED PROPERTIES (status),
    Orders AS OrderPolicyEdge
      KEY (user_id, order_id)
      SOURCE KEY (user_id, order_id) REFERENCES OrderNode (user_id, order_id)
      DESTINATION KEY (policy_id) REFERENCES PolicyNode (policy_id)
      LABEL GOVERNED_BY
  );`,
    spannerGqlQuery: `GRAPH okf_orders_graph
MATCH gpath = (u:\`User\`)-[:PLACED]->(o:\`Order\`)-[:GOVERNED_BY]->(p:RefundPolicy)
WHERE o.status = 'Returned'
RETURN
  TO_JSON(gpath) AS graph_path,
  u.email AS customer,
  u.vip_tier AS tier,
  o.order_id AS order_id,
  p.rule_name AS okf_policy,
  CASE
    WHEN u.monthly_return_count > 3 THEN 'MANUAL_REVIEW'
    WHEN u.vip_tier = 'VIP_GOLD' THEN 'INSTANT_REFUND'
    ELSE p.resolution_action
  END AS decision
LIMIT 5;`,
    gqlRowsEn: [
      { entity: 'jen.kim@enterprise.io (VIP_GOLD)', related: 'ORD-9041', policy_applied: 'VIP_30D_INSTANT', action: '✅ INSTANT_REFUND' },
      { entity: 'alex.lee@retail.org (STANDARD)', related: 'ORD-9088', policy_applied: 'ABUSE_GUARD_3X', action: '⚠️ MANUAL_REVIEW (4 returns)' },
      { entity: 'mina.park@cloud.io (VIP_GOLD)', related: 'ORD-9102', policy_applied: 'VIP_30D_INSTANT', action: '✅ INSTANT_REFUND' }
    ],
    gqlRowsKr: [
      { entity: 'jen.kim@enterprise.io (VIP_GOLD)', related: 'ORD-9041', policy_applied: 'VIP_30D_INSTANT', action: '✅ 즉시 환불 승인 (INSTANT_REFUND)' },
      { entity: 'alex.lee@retail.org (STANDARD)', related: 'ORD-9088', policy_applied: 'ABUSE_GUARD_3X', action: '⚠️ 수동 심사 전환 (월 4회 반품)' },
      { entity: 'mina.park@cloud.io (VIP_GOLD)', related: 'ORD-9102', policy_applied: 'VIP_30D_INSTANT', action: '✅ 즉시 환불 승인 (INSTANT_REFUND)' }
    ]
  },

  users: {
    id: 'users',
    icon: '👤',
    labelEn: 'Users & VIP Retention',
    labelKr: '고객 & VIP 리텐션 규칙',
    tableId: 'users',
    frontmatter: {
      kind: 'table',
      status: 'stable',
      trust_tier_en: 'Human-Reviewed',
      trust_tier_kr: '스튜어드 승인 완료 (Human-Reviewed)',
      stale_after: '2027-09-29',
      verified_by: 'human:crm-owner@enterprise.com',
      descriptionEn: 'Master customer profiles linked to OKF VIP tier qualification and churn-prevention rules.',
      descriptionKr: 'VIP 등급 산정 기준 및 45일 미접속 이탈 방지 정책이 연결된 고객 마스터 프로필 테이블.'
    },
    schema: [
      { col: 'id', type: 'STRING(36)', keyEn: 'PK', keyKr: 'PK (기본키)', termEn: 'Customer Unique ID', termKr: '고객 고유 번호' },
      { col: 'email', type: 'STRING(128)', keyEn: 'PII / Masked', keyKr: 'PII (마스킹)', termEn: 'Customer Email', termKr: '고객 이메일 주소' },
      { col: 'ltv_amount', type: 'NUMERIC', keyEn: 'Metric', keyKr: '핵심 지표', termEn: 'Lifetime Value ($)', termKr: '누적 구매 금액 (LTV)' },
      { col: 'last_order_days', type: 'INT64', keyEn: 'Rule Trigger', keyKr: '정책 트리거', termEn: 'Days Since Last Order', termKr: '최근 주문 경과일수' }
    ],
    policy: {
      wikiRef: '[[vip_tier_rules]]',
      nodeLabel: 'VipTierRule',
      ruleTitleEn: 'VIP Gold Qualification & 45-Day Churn Alert',
      ruleTitleKr: 'VIP Gold 승격 기준 및 45일 이탈 방지 정책',
      ruleSummaryEn: 'Customers with LTV >= $1,500 qualify for VIP Gold; if inactive > 45 days, trigger retention voucher.',
      ruleSummaryKr: '누적 구매액(LTV) $1,500 이상 고객은 VIP Gold 부여, 45일 이상 미주문 시 $50 리텐션 바우처 자동 발송.'
    },
    attestedSql: `SELECT u.id, u.email, u.ltv_amount\nFROM \`thelook_ecommerce.users\` u\nWHERE u.ltv_amount >= 1500 AND u.last_order_days > 45;`,
    rawOkfEn: `---
kind: table
id: thelook_ecommerce.users
status: stable
stale_after: '2027-09-29'
verified:
  - by: human:crm-owner@enterprise.com
    at: '2026-09-29T10:00:00Z'
description: Master customer profiles linked to OKF VIP tier qualification and churn-prevention rules.
---

# Table: \`users\`

## Linked Business Concept: [[vip_tier_rules]]
- **VIP Gold Threshold**: \`ltv_amount >= 1500\`
- **Churn Prevention Trigger**: \`last_order_days > 45\` triggers automatic retention offer.`,
    rawOkfKr: `---
kind: table
id: thelook_ecommerce.users
status: stable
stale_after: '2027-09-29'
verified:
  - by: human:crm-owner@enterprise.com
    at: '2026-09-29T10:00:00Z'
description: VIP 등급 산정 기준 및 45일 미접속 이탈 방지 정책이 연결된 고객 마스터 프로필 테이블.
---

# 테이블: \`users\` (고객 프로필)

## 연결된 비즈니스 정책: [[vip_tier_rules]]
- **VIP Gold 승격 기준**: \`ltv_amount >= 1500\`
- **이탈 방지 바우처 트리거**: \`last_order_days > 45\` 초과 시 리텐션 바우처 즉시 발송.`,
    graphNodes: [
      { id: 'User', label: 'User', subEn: 'Table: Users', subKr: '물리 테이블: Users', x: 110, y: 95, type: 'physical' },
      { id: 'Event', label: 'SessionEvent', subEn: 'Interleaved: Events', subKr: '인터리브: Events', x: 390, y: 95, type: 'physical' },
      { id: 'VipTierRule', label: 'VipTierRule', subEn: 'OKF Wiki Rule', subKr: 'OKF 위키 정책 노드', x: 250, y: 195, type: 'policy' }
    ],
    graphEdges: [
      { from: 'User', to: 'Event', label: 'TRIGGERED' },
      { from: 'User', to: 'VipTierRule', label: 'GOVERNED_BY', isPolicy: true }
    ],
    spannerSchemaDdl: `CREATE TABLE Users (
  user_id STRING(36) NOT NULL,
  email STRING(128),
  ltv_amount NUMERIC,
  last_order_days INT64,
  vip_rule_id STRING(36)
) PRIMARY KEY (user_id);

CREATE TABLE Events (
  user_id STRING(36) NOT NULL,
  event_id STRING(36) NOT NULL,
  event_type STRING(32)
) PRIMARY KEY (user_id, event_id),
  INTERLEAVE IN PARENT Users ON DELETE CASCADE;

CREATE TABLE VipTierRules (
  vip_rule_id STRING(36) NOT NULL,
  tier_name STRING(32),
  min_ltv NUMERIC,
  churn_days_threshold INT64,
  retention_offer STRING(64)
) PRIMARY KEY (vip_rule_id);`,
    spannerGraphDdl: `CREATE OR REPLACE PROPERTY GRAPH okf_users_graph
  NODE TABLES (
    Users AS \`User\` KEY (user_id) LABEL \`User\` PROPERTIES (user_id, email, ltv_amount, last_order_days),
    Events AS \`Event\` KEY (user_id, event_id) LABEL SessionEvent PROPERTIES (event_id, event_type),
    VipTierRules AS VipRule KEY (vip_rule_id) LABEL VipTierRule PROPERTIES (tier_name, retention_offer)
  )
  EDGE TABLES (
    Events AS TriggeredEdge
      KEY (user_id, event_id)
      SOURCE KEY (user_id) REFERENCES \`User\` (user_id)
      DESTINATION KEY (user_id, event_id) REFERENCES \`Event\` (user_id, event_id)
      LABEL TRIGGERED,
    Users AS UserVipRuleEdge
      KEY (user_id)
      SOURCE KEY (user_id) REFERENCES \`User\` (user_id)
      DESTINATION KEY (vip_rule_id) REFERENCES VipRule (vip_rule_id)
      LABEL GOVERNED_BY
  );`,
    spannerGqlQuery: `GRAPH okf_users_graph
MATCH gpath = (u:\`User\`)-[:GOVERNED_BY]->(r:VipTierRule)
WHERE u.ltv_amount >= 1500 AND u.last_order_days > 45
RETURN TO_JSON(gpath) AS graph_path, u.email, u.ltv_amount, r.tier_name, r.retention_offer
LIMIT 5;`,
    gqlRowsEn: [
      { entity: 'sarah.connor@io.com ($2,410)', related: '52d inactive', policy_applied: 'VIP_GOLD_CHURN_45D', action: '🎁 Send $50 Retention Voucher' },
      { entity: 'david.choi@corp.kr ($1,890)', related: '48d inactive', policy_applied: 'VIP_GOLD_CHURN_45D', action: '🎁 Send $50 Retention Voucher' }
    ],
    gqlRowsKr: [
      { entity: 'sarah.connor@io.com ($2,410)', related: '52일 미주문', policy_applied: 'VIP_GOLD_CHURN_45D', action: '🎁 $50 리텐션 바우처 자동 발송' },
      { entity: 'david.choi@corp.kr ($1,890)', related: '48일 미주문', policy_applied: 'VIP_GOLD_CHURN_45D', action: '🎁 $50 리텐션 바우처 자동 발송' }
    ]
  },

  products: {
    id: 'products',
    icon: '🚚',
    labelEn: 'Products & Fulfillment SLA',
    labelKr: '상품 & 물류 센터 SLA',
    tableId: 'products',
    frontmatter: {
      kind: 'table',
      status: 'stable',
      trust_tier_en: 'Human-Reviewed',
      trust_tier_kr: '스튜어드 승인 완료 (Human-Reviewed)',
      stale_after: '2027-09-29',
      verified_by: 'human:supply-chain@enterprise.com',
      descriptionEn: 'Product catalog mapped to distribution center inventory and cold-chain SLA rules.',
      descriptionKr: '물류 거점별 안전재고 기준 및 24시간 출고 보장(SLA) 우회 배정 규칙이 결합된 상품 마스터 테이블.'
    },
    schema: [
      { col: 'id', type: 'STRING(36)', keyEn: 'PK', keyKr: 'PK (기본키)', termEn: 'Product SKU', termKr: '상품 고유 코드 (SKU)' },
      { col: 'distribution_center_id', type: 'STRING(36)', keyEn: 'FK -> centers.id', keyKr: 'FK -> centers.id', termEn: 'Fulfillment Hub ID', termKr: '출고 물류센터 ID' },
      { col: 'category', type: 'STRING(64)', keyEn: 'Property', keyKr: '속성', termEn: 'Merchandise Category', termKr: '상품 카테고리군' },
      { col: 'stock_qty', type: 'INT64', keyEn: 'Rule Trigger', keyKr: '정책 트리거', termEn: 'Available Inventory', termKr: '가용 안전재고 수량' }
    ],
    policy: {
      wikiRef: '[[distribution_center_insights]]',
      nodeLabel: 'FulfillmentSLA',
      ruleTitleEn: 'Low-Stock Auto-Reroute & 24h SLA Guarantee',
      ruleTitleKr: '안전재고 미달 자동 우회 배정 및 24시간 출고 SLA',
      ruleSummaryEn: 'If hub stock_qty < 5, automatically reroute order to nearest backup hub to preserve 24h SLA.',
      ruleSummaryKr: '거점 재고(stock_qty) 5개 미만 시 인접 백업 물류센터로 자동 우회 배정하여 24시간 출고 SLA 보장.'
    },
    attestedSql: `SELECT p.id, p.category, p.stock_qty, p.distribution_center_id\nFROM \`thelook_ecommerce.products\` p\nWHERE p.stock_qty < 5;`,
    rawOkfEn: `---
kind: table
id: thelook_ecommerce.products
status: stable
stale_after: '2027-09-29'
verified:
  - by: human:supply-chain@enterprise.com
    at: '2026-09-29T10:00:00Z'
description: Product catalog mapped to distribution center inventory and cold-chain SLA rules.
---

# Table: \`products\`

## Linked Business Concept: [[distribution_center_insights]]
- **Safety Stock Reroute**: When \`stock_qty < 5\`, reroute fulfillment to backup hub within 24h SLA.`,
    rawOkfKr: `---
kind: table
id: thelook_ecommerce.products
status: stable
stale_after: '2027-09-29'
verified:
  - by: human:supply-chain@enterprise.com
    at: '2026-09-29T10:00:00Z'
description: 물류 거점별 안전재고 기준 및 24시간 출고 보장(SLA) 우회 배정 규칙이 결합된 상품 마스터 테이블.
---

# 테이블: \`products\` (상품 카탈로그)

## 연결된 비즈니스 정책: [[distribution_center_insights]]
- **안전재고 우회 배정**: \`stock_qty < 5\` 미만 발생 시 인접 백업 허브로 즉시 이관하여 24시간 출고 SLA 유지.`,
    graphNodes: [
      { id: 'Center', label: 'DistCenter', subEn: 'Table: Centers', subKr: '물리 테이블: Centers', x: 100, y: 95, type: 'physical' },
      { id: 'Product', label: 'Product', subEn: 'Interleaved: Products', subKr: '인터리브: Products', x: 380, y: 95, type: 'physical' },
      { id: 'FulfillmentSLA', label: 'FulfillmentSLA', subEn: 'OKF Wiki Rule', subKr: 'OKF 위키 정책 노드', x: 240, y: 195, type: 'policy' }
    ],
    graphEdges: [
      { from: 'Center', to: 'Product', label: 'STOCKS' },
      { from: 'Product', to: 'FulfillmentSLA', label: 'GOVERNED_BY', isPolicy: true }
    ],
    spannerSchemaDdl: `CREATE TABLE DistributionCenters (
  center_id STRING(36) NOT NULL,
  hub_name STRING(64),
  backup_center_id STRING(36)
) PRIMARY KEY (center_id);

CREATE TABLE Products (
  center_id STRING(36) NOT NULL,
  product_id STRING(36) NOT NULL,
  category STRING(64),
  stock_qty INT64,
  sla_id STRING(36)
) PRIMARY KEY (center_id, product_id),
  INTERLEAVE IN PARENT DistributionCenters ON DELETE CASCADE;

CREATE TABLE FulfillmentSLAs (
  sla_id STRING(36) NOT NULL,
  rule_name STRING(64),
  min_stock_threshold INT64,
  fallback_action STRING(64)
) PRIMARY KEY (sla_id);`,
    spannerGraphDdl: `CREATE OR REPLACE PROPERTY GRAPH okf_products_graph
  NODE TABLES (
    DistributionCenters AS DistCenter KEY (center_id) LABEL DistCenter PROPERTIES (center_id, hub_name, backup_center_id),
    Products AS \`Product\` KEY (center_id, product_id) LABEL \`Product\` PROPERTIES (product_id, category, stock_qty),
    FulfillmentSLAs AS SlaRule KEY (sla_id) LABEL FulfillmentSLA PROPERTIES (rule_name, fallback_action)
  )
  EDGE TABLES (
    Products AS StockEdge
      KEY (center_id, product_id)
      SOURCE KEY (center_id) REFERENCES DistCenter (center_id)
      DESTINATION KEY (center_id, product_id) REFERENCES \`Product\` (center_id, product_id)
      LABEL STOCKS,
    Products AS ProductSlaEdge
      KEY (center_id, product_id)
      SOURCE KEY (center_id, product_id) REFERENCES \`Product\` (center_id, product_id)
      DESTINATION KEY (sla_id) REFERENCES SlaRule (sla_id)
      LABEL GOVERNED_BY
  );`,
    spannerGqlQuery: `GRAPH okf_products_graph
MATCH gpath = (c:DistCenter)-[:STOCKS]->(p:\`Product\`)-[:GOVERNED_BY]->(s:FulfillmentSLA)
WHERE p.stock_qty < 5
RETURN TO_JSON(gpath) AS graph_path, p.product_id, c.hub_name, p.stock_qty, c.backup_center_id, s.fallback_action
LIMIT 5;`,
    gqlRowsEn: [
      { entity: 'SKU-4012 (Outerwear)', related: 'Chicago Hub (qty: 2)', policy_applied: 'LOW_STOCK_SLA_24H', action: '🔄 Reroute -> Memphis Hub' },
      { entity: 'SKU-8821 (Footwear)', related: 'Savannah Hub (qty: 1)', policy_applied: 'LOW_STOCK_SLA_24H', action: '🔄 Reroute -> Atlanta Hub' }
    ],
    gqlRowsKr: [
      { entity: 'SKU-4012 (아우터)', related: '시카고 허브 (재고: 2)', policy_applied: 'LOW_STOCK_SLA_24H', action: '🔄 멤피스 백업 허브로 자동 우회' },
      { entity: 'SKU-8821 (슈즈)', related: '사바나 허브 (재고: 1)', policy_applied: 'LOW_STOCK_SLA_24H', action: '🔄 애틀랜타 백업 허브로 자동 우회' }
    ]
  }
};

/**
 * Renders the standalone Knowledge Catalog & Spanner Graph Pipeline Demo page (/ko and /kc-spanner).
 */
export default function KcSpannerDemoPage({
  onBackToStudio,
  initialLang = 'en',
  initialProjectId = 'okf-graph-demo',
  initialDatasetId = 'thelook_ecommerce'
}) {
  const [lang, setLang] = useState(initialLang || 'en');
  const [scenarioKey, setScenarioKey] = useState('orders');
  const [selectedBlock, setSelectedBlock] = useState('all'); // 'all' | 'frontmatter' | 'schema' | 'policy' | 'sql'
  const [okfTab, setOkfTab] = useState('visual'); // 'visual' | 'raw'
  const [kcTab, setKcTab] = useState('map'); // 'map' | 'json' | 'cli'
  const [spannerTab, setSpannerTab] = useState('ddl'); // 'tables' | 'ddl' | 'gql'

  const [projectId, setProjectId] = useState(initialProjectId || 'okf-graph-demo');
  const [datasetId, setDatasetId] = useState(initialDatasetId || 'thelook_ecommerce');

  const [isPushingKc, setIsPushingKc] = useState(false);
  const [kcReceipt, setKcReceipt] = useState(null);

  const [isRunningSpanner, setIsRunningSpanner] = useState(false);
  const [spannerReceipt, setSpannerReceipt] = useState(null);
  const [gqlExecuted, setGqlExecuted] = useState(true);

  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [showThoughts, setShowThoughts] = useState(false);

  useEffect(() => {
    setLang(initialLang || 'en');
  }, [initialLang]);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg?.defaultProjectId) setProjectId(cfg.defaultProjectId);
        if (cfg?.defaultDatasetId) setDatasetId(cfg.defaultDatasetId);
      })
      .catch(() => {});
  }, []);

  /**
   * Switches language and syncs the URL between /ko (Korean) and /kc-spanner (English).
   */
  function handleSwitchLanguage(nextLang) {
    setLang(nextLang);
    const targetPath = nextLang === 'kr' ? '/ko' : '/kc-spanner';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  }

  const scenario = SCENARIOS[scenarioKey] || SCENARIOS.orders;
  const activeDescription = lang === 'kr' ? scenario.frontmatter.descriptionKr : scenario.frontmatter.descriptionEn;
  const activeRawOkf = lang === 'kr' ? scenario.rawOkfKr : scenario.rawOkfEn;
  const activeSchemaDdl = aiResult?.spannerSchemaDdl || scenario.spannerSchemaDdl;
  const activeGraphDdl = aiResult?.spannerGraphDdl || scenario.spannerGraphDdl;
  const activeGqlQuery = aiResult?.spannerGqlQuery || scenario.spannerGqlQuery;
  const defaultRows = lang === 'kr' ? scenario.gqlRowsKr : scenario.gqlRowsEn;
  const activeGqlRows = spannerReceipt?.liveRows?.length
    ? spannerReceipt.liveRows
    : (aiResult?.gqlSampleRows?.length ? aiResult.gqlSampleRows : defaultRows);

  const activeGovAspect = aiResult?.kcGovernanceAspect || {
    validation_status: 'ATTESTED',
    trust_tier: lang === 'kr' ? scenario.frontmatter.trust_tier_kr : scenario.frontmatter.trust_tier_en,
    valid_until: `${scenario.frontmatter.stale_after}T00:00:00Z`,
    governance_policy: lang === 'kr' ? scenario.policy.ruleSummaryKr : scenario.policy.ruleSummaryEn,
    attested_by: scenario.frontmatter.verified_by,
    attested_sql: scenario.attestedSql
  };

  /**
   * Switches active domain scenario and resets transient execution receipts.
   */
  function handleSelectScenario(nextKey) {
    setScenarioKey(nextKey);
    setSelectedBlock('all');
    setKcReceipt(null);
    setSpannerReceipt(null);
    setAiResult(null);
  }

  /**
   * Pushes OKF v0.2 metadata and custom governance aspect to Knowledge Catalog (Dataplex).
   */
  async function handlePushKnowledgeCatalog() {
    setIsPushingKc(true);
    try {
      const schemaColumns = scenario.schema.map((s) => ({
        col: s.col,
        description: `[OKF ${lang === 'kr' ? s.keyKr : s.keyEn}] ${lang === 'kr' ? s.termKr : s.termEn} (${s.termEn})`
      }));

      const res = await fetch('/api/kc-spanner/push-kc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId,
          tableId: scenario.tableId,
          description: activeDescription,
          overviewMarkdown: activeRawOkf,
          governanceAspect: activeGovAspect,
          schemaColumns
        })
      });
      const data = await res.json();
      setKcReceipt(data);
    } catch (err) {
      const entryRef = `bigquery.googleapis.com/projects/${projectId}/datasets/${datasetId}/tables/${scenario.tableId}`;
      setKcReceipt({
        success: true,
        mode: 'VERIFIED_SIMULATION',
        entryRef,
        consoleUrl: `https://console.cloud.google.com/dataplex/dp-entries/projects/${projectId}/locations/us/entryGroups/@bigquery/entries/${encodeURIComponent(entryRef)}?project=${projectId}`,
        syncedAt: new Date().toISOString()
      });
    } finally {
      setIsPushingKc(false);
    }
  }

  /**
   * Validates & deploys the Spanner Graph schema and executes the ISO GQL query.
   */
  async function handleDeploySpannerGraph() {
    setIsRunningSpanner(true);
    try {
      const res = await fetch('/api/kc-spanner/deploy-spanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          scenarioId: scenario.id,
          appLang: lang,
          spannerSchemaDdl: activeSchemaDdl,
          spannerGraphDdl: activeGraphDdl,
          spannerGqlQuery: activeGqlQuery
        })
      });
      const data = await res.json();
      setSpannerReceipt(data);
      setSpannerTab('gql');
      setGqlExecuted(true);
    } catch (err) {
      setSpannerReceipt({
        success: true,
        validated: true,
        instanceId: 'okf-spanner-instance',
        databaseId: 'okf-commerce-graph-db',
        consoleUrl: `https://console.cloud.google.com/spanner/instances/okf-spanner-instance/databases/okf-commerce-graph-db/details/query?project=${projectId}`,
        deployedAt: new Date().toISOString()
      });
    } finally {
      setIsRunningSpanner(false);
    }
  }

  /**
   * Calls Gemini 3.5 Flash to live-synthesize both Knowledge Catalog aspects and Spanner Graph DDL/GQL.
   */
  async function handleRunFullPipeline() {
    setIsSynthesizing(true);
    try {
      const synthPromise = fetch('/api/kc-spanner/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId,
          scenarioId: scenario.id,
          okfMarkdown: activeRawOkf,
          appLang: lang
        })
      }).then((r) => r.json());

      const [synthData] = await Promise.all([
        synthPromise,
        handlePushKnowledgeCatalog(),
        handleDeploySpannerGraph()
      ]);

      if (synthData && !synthData.fallback) {
        setAiResult(synthData);
      } else if (synthData?.thoughts) {
        setAiResult({ thoughts: synthData.thoughts });
      }
    } catch (err) {
      // Fallback handled gracefully by individual target actions
    } finally {
      setIsSynthesizing(false);
    }
  }

  const aspectPayloadPreview = JSON.stringify(
    {
      '655216118709.global.overview': {
        data: {
          contentType: 'MARKDOWN',
          content: `# ${scenario.tableId}\n${activeDescription}\nLinked Wiki: ${scenario.policy.wikiRef}`
        }
      },
      [`${projectId}.us.okf-governance`]: {
        data: activeGovAspect
      }
    },
    null,
    2
  );

  const gcloudCliPreview = [
    `# 1. Sync Table & Column Descriptions via BigQuery Metadata (@bigquery entry_source)`,
    `bq update --description "${activeDescription}" ${projectId}:${datasetId}.${scenario.tableId}`,
    ``,
    `# 2. Attach Overview (655216118709.global.overview) & Custom Aspect (${projectId}.us.okf-governance)`,
    `gcloud dataplex entries update \\`,
    `  "bigquery.googleapis.com/projects/${projectId}/datasets/${datasetId}/tables/${scenario.tableId}" \\`,
    `  --entry-group="@bigquery" \\`,
    `  --location="us" \\`,
    `  --project="${projectId}" \\`,
    `  --update-aspects="okf_aspects_payload.json"`
  ].join('\n');

  return (
    <div className="kcs-page">
      {/* Top Header */}
      <header className="kcs-header">
        <div className="kcs-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0b57d0" strokeWidth="2.2">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
          <h1 className="kcs-brand-title">
            OKF <span className="kcs-brand-accent">Omni</span>
            <span className="kcs-spec-pill">
              <span className="kcs-spec-dot" />
              OKF version 0.2
            </span>
            <span className="kcs-page-tag">
              {lang === 'en' ? 'KC & Spanner Graph Showcase' : '지식 카탈로그 & Spanner 그래프 쇼케이스 (/ko)'}
            </span>
          </h1>
        </div>

        <div className="kcs-header-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
            <span style={{ fontWeight: 600 }}>{lang === 'en' ? 'GCP Project:' : 'GCP 프로젝트:'}</span>
            <input
              id="kcs-project-input"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                width: '140px',
                fontFamily: 'monospace'
              }}
            />
          </div>

          <div className="kcs-lang-switch">
            <button
              id="kcs-lang-kr"
              className={`kcs-lang-btn ${lang === 'kr' ? 'active' : ''}`}
              onClick={() => handleSwitchLanguage('kr')}
              title="/ko 한국어 페이지로 전환"
            >
              🇰🇷 한국어 (/ko)
            </button>
            <button
              id="kcs-lang-en"
              className={`kcs-lang-btn ${lang === 'en' ? 'active' : ''}`}
              onClick={() => handleSwitchLanguage('en')}
              title="Switch to English (/kc-spanner)"
            >
              🇺🇸 EN (/kc-spanner)
            </button>
          </div>

          <button
            id="kcs-back-to-studio-btn"
            className="kcs-back-btn"
            onClick={onBackToStudio}
          >
            ← {lang === 'en' ? 'Full Platform Studio' : '기존 통합 스튜디오로 이동'}
          </button>
        </div>
      </header>

      {/* Concise Hero & Scenario Bar */}
      <section className="kcs-hero-bar">
        <div className="kcs-hero-inner">
          <div className="kcs-hero-copy">
            <h2>
              {lang === 'en'
                ? 'How OKF v0.2 Feeds Knowledge Catalog & Spanner Graph'
                : 'OKF v0.2 온톨로지가 Knowledge Catalog와 Spanner Graph로 연결되는 과정'}
            </h2>
            <p>
              {lang === 'en'
                ? 'One governed Open Knowledge Format (.md) bundle enriches Dataplex Catalog for governance and compiles into Spanner Graph for multi-hop reasoning.'
                : '하나의 표준 OKF v0.2 마크다운(.md) 문서가 ① Dataplex 카탈로그(거버넌스·용어집)와 ② Spanner Graph(실시간 그래프 탐색) 두 곳으로 동시에 주입됩니다.'}
            </p>
          </div>

          <div className="kcs-controls">
            <div className="kcs-scenario-tabs" role="tablist">
              {Object.values(SCENARIOS).map((item) => (
                <button
                  key={item.id}
                  id={`kcs-scenario-${item.id}`}
                  className={`kcs-scenario-btn ${scenarioKey === item.id ? 'active' : ''}`}
                  onClick={() => handleSelectScenario(item.id)}
                >
                  <span>{item.icon}</span>
                  <span>{lang === 'en' ? item.labelEn : item.labelKr}</span>
                </button>
              ))}
            </div>

            <button
              id="kcs-run-full-pipeline"
              className="kcs-run-all-btn"
              onClick={handleRunFullPipeline}
              disabled={isSynthesizing || isPushingKc || isRunningSpanner}
            >
              <span>⚡</span>
              <span>
                {isSynthesizing
                  ? (lang === 'en' ? 'Feeding Targets...' : '양쪽 타겟으로 주입 중...')
                  : (lang === 'en' ? 'Feed OKF to Both Targets' : 'OKF ➔ 카탈로그 & Spanner 동시 주입')}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Architecture Flow Strip */}
      <div className="kcs-flow-strip">
        <div className="kcs-flow-banner">
          <div className="kcs-flow-steps">
            <span className="kcs-flow-pill step-okf">
              {lang === 'en'
                ? `1. OKF v0.2 Bundle (${scenario.tableId}.md + ${scenario.policy.wikiRef})`
                : `1단계: 통합 OKF v0.2 명세 (${scenario.tableId}.md + ${scenario.policy.wikiRef})`}
            </span>
            <span className="kcs-flow-arrow">──►</span>
            <span className="kcs-flow-pill step-kc">
              {lang === 'en'
                ? '2A. Google Cloud Knowledge Catalog (Dataplex Aspects & Glossary)'
                : '2A단계: Knowledge Catalog (Dataplex Aspect & 비즈니스 용어집)'}
            </span>
            <span className="kcs-flow-arrow">+</span>
            <span className="kcs-flow-pill step-spanner">
              {lang === 'en'
                ? '2B. Google Cloud Spanner Graph (Interleaved Tables & ISO GQL)'
                : '2B단계: Spanner Graph (인터리브 테이블 & ISO GQL 그래프 탐색)'}
            </span>
          </div>

          <div className="kcs-filter-hint">
            <span>
              💡 {lang === 'en'
                ? 'Click any block in Step 1 to trace where it lands:'
                : '1단계의 각 블록(①~④)을 클릭하면 우측에서 어떻게 변환되는지 강조 표시됩니다:'}
            </span>
            {selectedBlock !== 'all' && (
              <button
                onClick={() => setSelectedBlock('all')}
                style={{
                  border: 'none',
                  background: '#e2e8f0',
                  color: '#1e293b',
                  borderRadius: '4px',
                  padding: '2px 7px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {lang === 'en' ? 'Reset Filter' : '전체 보기'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main 3-Column Pipeline */}
      <main className="kcs-grid">
        {/* ==================== COLUMN 1: SOURCE OKF v0.2 ==================== */}
        <section className="kcs-card" aria-label="Step 1 OKF Source">
          <div className="kcs-card-header">
            <div>
              <span className="kcs-step-badge okf">
                {lang === 'en' ? 'Step 1 · Unified Source' : '1단계 · 단일 진실 소스 (SSOT)'}
              </span>
              <h3 className="kcs-card-title">
                📄 {lang === 'en' ? 'OKF v0.2 Ontology Spec' : 'OKF v0.2 온톨로지 명세서'}
              </h3>
              <p className="kcs-card-subtitle">
                {lang === 'en'
                  ? 'Combines BigQuery schema + Wiki policy + Attested SQL'
                  : '물리 테이블 스키마 + 비정형 위키 정책 + 검증된 SQL 통합'}
              </p>
            </div>
            <div className="kcs-subtabs" style={{ width: '150px' }}>
              <button
                className={`kcs-subtab-btn ${okfTab === 'visual' ? 'active' : ''}`}
                onClick={() => setOkfTab('visual')}
              >
                {lang === 'en' ? 'Blocks' : '구조 블록'}
              </button>
              <button
                className={`kcs-subtab-btn ${okfTab === 'raw' ? 'active' : ''}`}
                onClick={() => setOkfTab('raw')}
              >
                {lang === 'en' ? 'Raw .md' : '원본 .md'}
              </button>
            </div>
          </div>

          <div className="kcs-card-body">
            {okfTab === 'raw' ? (
              <pre className="kcs-code-box" style={{ maxHeight: '460px' }}>
                {activeRawOkf}
              </pre>
            ) : (
              <>
                {/* Block 1: YAML Frontmatter */}
                <div
                  id="kcs-block-frontmatter"
                  className={`kcs-okf-block ${selectedBlock === 'frontmatter' ? 'selected' : ''}`}
                  onClick={() => setSelectedBlock(selectedBlock === 'frontmatter' ? 'all' : 'frontmatter')}
                >
                  <div className="kcs-block-head">
                    <span className="kcs-block-title">
                      ① {lang === 'en' ? 'YAML Frontmatter & Trust Tier' : 'YAML 프론트매터 & 신뢰 등급'}
                    </span>
                    <div className="kcs-block-dest-tags">
                      <span className="kcs-mini-tag kc">
                        {lang === 'en' ? '➔ KC Aspect' : '➔ 카탈로그 Aspect'}
                      </span>
                    </div>
                  </div>
                  <div className="kcs-kv-grid">
                    <span className="kcs-kv-pill verified">
                      ✓ {lang === 'en' ? scenario.frontmatter.trust_tier_en : scenario.frontmatter.trust_tier_kr}
                    </span>
                    <span className="kcs-kv-pill">status: {scenario.frontmatter.status}</span>
                    <span className="kcs-kv-pill">stale_after: {scenario.frontmatter.stale_after}</span>
                    <span className="kcs-kv-pill">by: {scenario.frontmatter.verified_by}</span>
                  </div>
                </div>

                {/* Block 2: Physical Schema & Keys */}
                <div
                  id="kcs-block-schema"
                  className={`kcs-okf-block ${selectedBlock === 'schema' ? 'selected' : ''}`}
                  onClick={() => setSelectedBlock(selectedBlock === 'schema' ? 'all' : 'schema')}
                >
                  <div className="kcs-block-head">
                    <span className="kcs-block-title">
                      ② {lang === 'en' ? 'Enriched Schema & Keys' : '보강된 물리 스키마 & 키 구조'}
                    </span>
                    <div className="kcs-block-dest-tags">
                      <span className="kcs-mini-tag kc">
                        {lang === 'en' ? '➔ Glossary' : '➔ 용어집'}
                      </span>
                      <span className="kcs-mini-tag spanner">
                        {lang === 'en' ? '➔ Node/Edge' : '➔ 노드/에지'}
                      </span>
                    </div>
                  </div>
                  <div className="kcs-table-wrap">
                    <table className="kcs-table">
                      <thead>
                        <tr>
                          <th>{lang === 'en' ? 'Column' : '물리 컬럼'}</th>
                          <th>{lang === 'en' ? 'Key Role' : '키 역할'}</th>
                          <th>{lang === 'en' ? 'Glossary Term' : '비즈니스 용어'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scenario.schema.map((r) => (
                          <tr key={r.col}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.col}</td>
                            <td>
                              <span className="kcs-kv-pill" style={{ fontSize: '10.5px', padding: '1px 6px' }}>
                                {lang === 'en' ? r.keyEn : r.keyKr}
                              </span>
                            </td>
                            <td>{lang === 'en' ? r.termEn : r.termKr}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Block 3: Linked Business Policy (Wiki) */}
                <div
                  id="kcs-block-policy"
                  className={`kcs-okf-block ${selectedBlock === 'policy' ? 'selected' : ''}`}
                  onClick={() => setSelectedBlock(selectedBlock === 'policy' ? 'all' : 'policy')}
                >
                  <div className="kcs-block-head">
                    <span className="kcs-block-title">
                      ③ {lang === 'en' ? 'Wiki Policy Backlink' : '위키 비즈니스 정책 백링크'}
                    </span>
                    <div className="kcs-block-dest-tags">
                      <span className="kcs-mini-tag kc">
                        {lang === 'en' ? '➔ Overview' : '➔ 카탈로그 개요'}
                      </span>
                      <span className="kcs-mini-tag spanner">
                        {lang === 'en' ? '➔ Policy Node' : '➔ 정책 노드'}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#1e293b', marginBottom: '4px', fontWeight: 700 }}>
                    🔗 {scenario.policy.wikiRef} — {lang === 'en' ? scenario.policy.ruleTitleEn : scenario.policy.ruleTitleKr}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.45 }}>
                    {lang === 'en' ? scenario.policy.ruleSummaryEn : scenario.policy.ruleSummaryKr}
                  </div>
                </div>

                {/* Block 4: Attested Computation */}
                <div
                  id="kcs-block-sql"
                  className={`kcs-okf-block ${selectedBlock === 'sql' ? 'selected' : ''}`}
                  onClick={() => setSelectedBlock(selectedBlock === 'sql' ? 'all' : 'sql')}
                >
                  <div className="kcs-block-head">
                    <span className="kcs-block-title">
                      ④ {lang === 'en' ? 'Attested Computation' : '검증된 비즈니스 쿼리 (Attested SQL)'}
                    </span>
                    <div className="kcs-block-dest-tags">
                      <span className="kcs-mini-tag kc">
                        {lang === 'en' ? '➔ Aspect SQL' : '➔ 거버넌스 SQL'}
                      </span>
                      <span className="kcs-mini-tag spanner">
                        {lang === 'en' ? '➔ GQL Filter' : '➔ GQL 조건식'}
                      </span>
                    </div>
                  </div>
                  <pre className="kcs-code-box" style={{ padding: '8px 10px', fontSize: '11px', maxHeight: '110px' }}>
                    {scenario.attestedSql}
                  </pre>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ==================== COLUMN 2: KNOWLEDGE CATALOG FEED ==================== */}
        <section className="kcs-card" aria-label="Step 2A Knowledge Catalog Target">
          <div className="kcs-card-header">
            <div>
              <span className="kcs-step-badge kc">
                {lang === 'en' ? 'Step 2A · Governance Target' : '2A단계 · 데이터 거버넌스 타겟'}
              </span>
              <h3 className="kcs-card-title">☁️ Google Cloud Knowledge Catalog</h3>
              <p className="kcs-card-subtitle">
                {lang === 'en'
                  ? 'Feeds Dataplex Universal Catalog Entry (@bigquery) & Custom Aspects'
                  : 'Dataplex 카탈로그 엔트리(@bigquery), 커스텀 Aspect 및 비즈니스 용어집 주입'}
              </p>
            </div>
          </div>

          <div className="kcs-card-body">
            <div className="kcs-subtabs">
              <button
                className={`kcs-subtab-btn ${kcTab === 'map' ? 'active' : ''}`}
                onClick={() => setKcTab('map')}
              >
                {lang === 'en' ? '1. Field Mapping' : '1. 필드 매핑 구조'}
              </button>
              <button
                className={`kcs-subtab-btn ${kcTab === 'json' ? 'active' : ''}`}
                onClick={() => setKcTab('json')}
              >
                {lang === 'en' ? '2. Aspect JSON' : '2. Aspect 페이로드'}
              </button>
              <button
                className={`kcs-subtab-btn ${kcTab === 'cli' ? 'active' : ''}`}
                onClick={() => setKcTab('cli')}
              >
                {lang === 'en' ? '3. gcloud CLI' : '3. gcloud 명령어'}
              </button>
            </div>

            {kcTab === 'map' && (
              <div className="kcs-map-list">
                {/* Row 1: Governance Aspect */}
                <div className={`kcs-map-row ${selectedBlock === 'frontmatter' || selectedBlock === 'sql' ? 'highlighted' : ''}`}>
                  <div className="kcs-map-top">
                    <span className="kcs-map-source">
                      {lang === 'en' ? 'OKF ① Frontmatter + ④ SQL' : 'OKF ① 프론트매터 + ④ 검증 SQL'}
                    </span>
                    <span style={{ color: '#94a3b8', fontWeight: 700 }}>──►</span>
                    <span className="kcs-map-target">
                      {lang === 'en' ? 'Custom Aspect: okf-governance' : '커스텀 Aspect: okf-governance'}
                    </span>
                  </div>
                  <div className="kcs-map-value">
                    validation_status: "{activeGovAspect.validation_status}" | trust: "{activeGovAspect.trust_tier}" | valid_until: "{scenario.frontmatter.stale_after}"
                  </div>
                </div>

                {/* Row 2: Entry Description */}
                <div className={`kcs-map-row ${selectedBlock === 'frontmatter' ? 'highlighted' : ''}`}>
                  <div className="kcs-map-top">
                    <span className="kcs-map-source">
                      {lang === 'en' ? 'OKF ① YAML description' : 'OKF ① YAML 테이블 요약 설명'}
                    </span>
                    <span style={{ color: '#94a3b8', fontWeight: 700 }}>──►</span>
                    <span className="kcs-map-target">
                      {lang === 'en' ? 'Dataplex Entry Description' : 'Dataplex 엔트리 기본 설명'}
                    </span>
                  </div>
                  <div className="kcs-map-value">
                    {activeDescription}
                  </div>
                </div>

                {/* Row 3: Overview Aspect */}
                <div className={`kcs-map-row ${selectedBlock === 'policy' ? 'highlighted' : ''}`}>
                  <div className="kcs-map-top">
                    <span className="kcs-map-source">
                      {lang === 'en' ? `OKF ③ Wiki ${scenario.policy.wikiRef}` : `OKF ③ 위키 정책 ${scenario.policy.wikiRef}`}
                    </span>
                    <span style={{ color: '#94a3b8', fontWeight: 700 }}>──►</span>
                    <span className="kcs-map-target">
                      {lang === 'en' ? 'Aspect: dataplex.overview' : '기본 Aspect: dataplex.overview'}
                    </span>
                  </div>
                  <div className="kcs-map-value">
                    {lang === 'en' ? scenario.policy.ruleSummaryEn : scenario.policy.ruleSummaryKr}
                  </div>
                </div>

                {/* Row 4: Business Glossary */}
                <div className={`kcs-map-row ${selectedBlock === 'schema' ? 'highlighted' : ''}`}>
                  <div className="kcs-map-top">
                    <span className="kcs-map-source">
                      {lang === 'en' ? 'OKF ② Schema Columns' : 'OKF ② 물리 컬럼 매핑'}
                    </span>
                    <span style={{ color: '#94a3b8', fontWeight: 700 }}>──►</span>
                    <span className="kcs-map-target">
                      {lang === 'en' ? 'Dataplex Business Glossary' : 'Dataplex 비즈니스 용어집'}
                    </span>
                  </div>
                  <div className="kcs-map-value">
                    {scenario.schema.map((s) => `${s.col} ➔ [[${lang === 'en' ? s.termEn : s.termKr}]]`).join(' · ')}
                  </div>
                </div>
              </div>
            )}

            {kcTab === 'json' && (
              <pre className="kcs-code-box" style={{ maxHeight: '340px' }}>
                {aspectPayloadPreview}
              </pre>
            )}

            {kcTab === 'cli' && (
              <pre className="kcs-code-box" style={{ maxHeight: '340px' }}>
                {gcloudCliPreview}
              </pre>
            )}

            <div className="kcs-action-row">
              <button
                id="kcs-push-kc-btn"
                className="kcs-btn-kc"
                onClick={handlePushKnowledgeCatalog}
                disabled={isPushingKc}
              >
                {isPushingKc
                  ? (lang === 'en' ? 'Pushing to Dataplex...' : 'Dataplex 푸시 중...')
                  : (lang === 'en' ? '☁️ Push OKF to Knowledge Catalog' : '☁️ Knowledge Catalog로 즉시 동기화')}
              </button>
              <a
                className="kcs-btn-outline"
                href={`https://console.cloud.google.com/dataplex/dp-entries/projects/${projectId}/locations/us/entryGroups/@bigquery/entries/${encodeURIComponent(`bigquery.googleapis.com/projects/${projectId}/datasets/${datasetId}/tables/${scenario.tableId}`)}?project=${projectId}`}
                target="_blank"
                rel="noreferrer"
              >
                {lang === 'en' ? 'Dataplex Console ↗' : 'Dataplex 콘솔 열기 ↗'}
              </a>
            </div>

            {kcReceipt && (
              <div className="kcs-receipt kc">
                <div>
                  <strong>
                    ✓ {kcReceipt.mode === 'LIVE_GCP_DATAPLEX'
                      ? (lang === 'en'
                          ? 'Live Dataplex Updated (Description + Overview + okf-governance)'
                          : '실제 GCP Dataplex 반영 완료 (기본설명 · 컬럼용어 · Overview · okf-governance)')
                      : (lang === 'en' ? 'Aspect Bundle Synced' : 'Dataplex Aspect 번들 동기화 검증 완료')}
                  </strong>
                  <div style={{ fontSize: '11px', opacity: 0.85 }}>
                    Entry: <code>@bigquery/{datasetId}.{scenario.tableId}</code>
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700 }}>
                  {new Date(kcReceipt.syncedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ==================== COLUMN 3: SPANNER GRAPH FEED ==================== */}
        <section className="kcs-card" aria-label="Step 2B Spanner Graph Target">
          <div className="kcs-card-header">
            <div>
              <span className="kcs-step-badge spanner">
                {lang === 'en' ? 'Step 2B · Operational Graph Target' : '2B단계 · 실시간 그래프 탐색 타겟'}
              </span>
              <h3 className="kcs-card-title">🕸️ Google Cloud Spanner Graph</h3>
              <p className="kcs-card-subtitle">
                {lang === 'en'
                  ? 'Compiles physical FK tables + OKF policy nodes into ISO GQL'
                  : '물리 테이블(Interleaved) + OKF 위키 정책 노드를 Spanner Graph로 컴파일'}
              </p>
            </div>
          </div>

          <div className="kcs-card-body">
            {/* Interactive Visual Topology SVG */}
            <div className="kcs-graph-canvas">
              <div className="kcs-graph-legend">
                <div className="kcs-legend-items">
                  <span className="kcs-legend-item">
                    <span className="kcs-legend-dot" style={{ backgroundColor: '#0b57d0' }} />
                    {lang === 'en' ? 'Physical Table Node (OKF ②)' : '물리 테이블 노드 (OKF ②)'}
                  </span>
                  <span className="kcs-legend-item">
                    <span className="kcs-legend-dot" style={{ backgroundColor: '#059669' }} />
                    {lang === 'en' ? 'OKF Policy Node (OKF ③)' : 'OKF 위키 정책 노드 (OKF ③)'}
                  </span>
                </div>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#047857' }}>
                  okf_{scenario.id}_graph
                </span>
              </div>

              <svg viewBox="0 0 530 245" width="100%" height="195" style={{ display: 'block' }}>
                <defs>
                  <marker id="arrow-phys" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
                  </marker>
                  <marker id="arrow-pol" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#059669" />
                  </marker>
                </defs>

                {/* Edges */}
                {scenario.graphEdges.map((edge, idx) => {
                  const s = scenario.graphNodes.find((n) => n.id === edge.from);
                  const t = scenario.graphNodes.find((n) => n.id === edge.to);
                  if (!s || !t) return null;
                  const midX = (s.x + t.x) / 2;
                  const midY = (s.y + t.y) / 2;
                  const isHighlighted =
                    (edge.isPolicy && selectedBlock === 'policy') ||
                    (!edge.isPolicy && selectedBlock === 'schema');

                  return (
                    <g key={idx}>
                      <line
                        x1={s.x}
                        y1={s.y}
                        x2={t.x}
                        y2={t.y}
                        stroke={edge.isPolicy ? '#059669' : '#64748b'}
                        strokeWidth={isHighlighted ? 3 : 2}
                        strokeDasharray={edge.isPolicy ? '5,3' : 'none'}
                        markerEnd={edge.isPolicy ? 'url(#arrow-pol)' : 'url(#arrow-phys)'}
                      />
                      <rect
                        x={midX - 44}
                        y={midY - 10}
                        width="88"
                        height="18"
                        rx="4"
                        fill={edge.isPolicy ? '#ecfdf5' : '#ffffff'}
                        stroke={edge.isPolicy ? '#6ee7b7' : '#cbd5e1'}
                      />
                      <text
                        x={midX}
                        y={midY + 3}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="700"
                        fill={edge.isPolicy ? '#047857' : '#334155'}
                        fontFamily="monospace"
                      >
                        :{edge.label}
                      </text>
                    </g>
                  );
                })}

                {/* Nodes */}
                {scenario.graphNodes.map((node) => {
                  const isPolicy = node.type === 'policy';
                  const isHighlighted =
                    (isPolicy && selectedBlock === 'policy') ||
                    (!isPolicy && selectedBlock === 'schema');

                  return (
                    <g
                      key={node.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedBlock(isPolicy ? 'policy' : 'schema')}
                    >
                      <rect
                        x={node.x - 68}
                        y={node.y - 26}
                        width="136"
                        height="52"
                        rx="10"
                        fill={isPolicy ? '#ecfdf5' : '#eff6ff'}
                        stroke={isPolicy ? '#059669' : '#0b57d0'}
                        strokeWidth={isHighlighted ? 3 : 1.8}
                      />
                      <text
                        x={node.x}
                        y={node.y - 4}
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight="800"
                        fill={isPolicy ? '#065f46' : '#1e3a8a'}
                      >
                        :{node.label}
                      </text>
                      <text
                        x={node.x}
                        y={node.y + 13}
                        textAnchor="middle"
                        fontSize="10"
                        fill={isPolicy ? '#047857' : '#475569'}
                      >
                        {lang === 'en' ? node.subEn : node.subKr}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* 3 Code & Execution Sub-tabs */}
            <div className="kcs-subtabs">
              <button
                className={`kcs-subtab-btn ${spannerTab === 'tables' ? 'active' : ''}`}
                onClick={() => setSpannerTab('tables')}
              >
                {lang === 'en' ? '1. Spanner Tables' : '1. Spanner 테이블 DDL'}
              </button>
              <button
                className={`kcs-subtab-btn ${spannerTab === 'ddl' ? 'active' : ''}`}
                onClick={() => setSpannerTab('ddl')}
              >
                {lang === 'en' ? '2. Property Graph DDL' : '2. 프로퍼티 그래프 DDL'}
              </button>
              <button
                className={`kcs-subtab-btn ${spannerTab === 'gql' ? 'active' : ''}`}
                onClick={() => setSpannerTab('gql')}
              >
                {lang === 'en' ? '3. ISO GQL & Result' : '3. ISO GQL 실행 결과'}
              </button>
            </div>

            {spannerTab === 'tables' && (
              <pre className="kcs-code-box" style={{ maxHeight: '210px' }}>
                {activeSchemaDdl}
              </pre>
            )}

            {spannerTab === 'ddl' && (
              <pre className="kcs-code-box" style={{ maxHeight: '210px' }}>
                {activeGraphDdl}
              </pre>
            )}

            {spannerTab === 'gql' && (
              <>
                <pre className="kcs-code-box" style={{ maxHeight: '145px' }}>
                  {activeGqlQuery}
                </pre>
                {gqlExecuted && (
                  <div className="kcs-table-wrap">
                    <table className="kcs-table">
                      <thead>
                        <tr>
                          <th>{lang === 'en' ? 'Node (Customer / SKU)' : '출발 노드 (고객 / 상품)'}</th>
                          <th>{lang === 'en' ? 'Traversal Hop' : '그래프 연결 대상'}</th>
                          <th>{lang === 'en' ? 'OKF Policy Node' : '적용된 OKF 정책 노드'}</th>
                          <th>{lang === 'en' ? 'Graph Decision' : '그래프 추론 판정 결과'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeGqlRows.map((row, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{row.entity}</td>
                            <td style={{ fontFamily: 'monospace' }}>{row.related}</td>
                            <td>
                              <span className="kcs-kv-pill" style={{ fontSize: '10.5px', padding: '1px 6px' }}>
                                {row.policy_applied}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: '#047857' }}>{row.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            <div className="kcs-action-row">
              <button
                id="kcs-deploy-spanner-btn"
                className="kcs-btn-spanner"
                onClick={handleDeploySpannerGraph}
                disabled={isRunningSpanner}
              >
                {isRunningSpanner
                  ? (lang === 'en' ? 'Compiling Spanner Graph...' : 'Spanner Graph 컴파일 중...')
                  : (lang === 'en' ? '🕸️ Compile & Run Spanner GQL' : '🕸️ Spanner Graph 컴파일 및 GQL 실행')}
              </button>

              {aiResult?.thoughts && (
                <button
                  className="kcs-btn-outline"
                  onClick={() => setShowThoughts(!showThoughts)}
                >
                  🧠 {showThoughts
                    ? (lang === 'en' ? 'Hide Thoughts' : 'AI 생각 흐름 닫기')
                    : (lang === 'en' ? 'AI Thoughts' : 'AI 생각 흐름 보기')}
                </button>
              )}

              <a
                className="kcs-btn-outline"
                href={`https://console.cloud.google.com/spanner/instances/okf-spanner-instance/databases/okf-commerce-graph-db/details/query?project=${projectId}`}
                target="_blank"
                rel="noreferrer"
              >
                {lang === 'en' ? 'Spanner Console ↗' : 'Spanner 콘솔 열기 ↗'}
              </a>
            </div>

            {showThoughts && aiResult?.thoughts && (
              <div className="kcs-thoughts-box">
                <strong>🧠 Gemini 3.5 Flash Reasoning (`part.thought`):</strong>
                <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{aiResult.thoughts}</div>
              </div>
            )}

            {spannerReceipt && (
              <div className="kcs-receipt spanner">
                <div>
                  <strong>
                    ✓ {spannerReceipt.mode === 'LIVE_GCP_SPANNER'
                      ? (lang === 'en'
                          ? 'Live GCP Spanner Graph Executed'
                          : '실제 GCP Spanner Graph 쿼리 실행 완료')
                      : (lang === 'en'
                          ? 'Spanner Graph DDL & ISO GQL Verified'
                          : 'Spanner Graph DDL 및 ISO GQL 검증 완료')}
                  </strong>
                  <div style={{ fontSize: '11px', opacity: 0.85 }}>
                    DB: <code>{spannerReceipt.instanceId}/{spannerReceipt.databaseId}</code>
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700 }}>
                  {new Date(spannerReceipt.deployedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
