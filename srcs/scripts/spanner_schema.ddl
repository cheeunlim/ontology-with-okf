CREATE TABLE Users (
  user_id STRING(36) NOT NULL,
  email STRING(128),
  vip_tier STRING(20),
  monthly_return_count INT64,
  ltv_amount NUMERIC,
  last_order_days INT64,
  vip_rule_id STRING(36)
) PRIMARY KEY (user_id);

CREATE TABLE Orders (
  user_id STRING(36) NOT NULL,
  order_id STRING(36) NOT NULL,
  status STRING(20),
  returned_at TIMESTAMP,
  policy_id STRING(36)
) PRIMARY KEY (user_id, order_id),
  INTERLEAVE IN PARENT Users ON DELETE CASCADE;

CREATE TABLE RefundPolicies (
  policy_id STRING(36) NOT NULL,
  rule_name STRING(64),
  max_days INT64,
  max_monthly_returns INT64,
  resolution_action STRING(32)
) PRIMARY KEY (policy_id);

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
) PRIMARY KEY (vip_rule_id);

CREATE TABLE DistributionCenters (
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
) PRIMARY KEY (sla_id);

CREATE OR REPLACE PROPERTY GRAPH okf_orders_graph
  NODE TABLES (
    Users AS `User`
      KEY (user_id)
      LABEL `User` PROPERTIES (user_id, email, vip_tier, monthly_return_count),
    Orders AS OrderNode
      KEY (user_id, order_id)
      LABEL `Order` PROPERTIES (order_id, status, returned_at),
    RefundPolicies AS PolicyNode
      KEY (policy_id)
      LABEL RefundPolicy PROPERTIES (policy_id, rule_name, resolution_action)
  )
  EDGE TABLES (
    Orders AS PlacedOrder
      KEY (user_id, order_id)
      SOURCE KEY (user_id) REFERENCES `User` (user_id)
      DESTINATION KEY (user_id, order_id) REFERENCES OrderNode (user_id, order_id)
      LABEL PLACED PROPERTIES (status),
    Orders AS OrderPolicyEdge
      KEY (user_id, order_id)
      SOURCE KEY (user_id, order_id) REFERENCES OrderNode (user_id, order_id)
      DESTINATION KEY (policy_id) REFERENCES PolicyNode (policy_id)
      LABEL GOVERNED_BY
  );

CREATE OR REPLACE PROPERTY GRAPH okf_users_graph
  NODE TABLES (
    Users AS `User` KEY (user_id) LABEL `User` PROPERTIES (user_id, email, ltv_amount, last_order_days),
    Events AS `Event` KEY (user_id, event_id) LABEL SessionEvent PROPERTIES (event_id, event_type),
    VipTierRules AS VipRule KEY (vip_rule_id) LABEL VipTierRule PROPERTIES (tier_name, retention_offer)
  )
  EDGE TABLES (
    Events AS TriggeredEdge
      KEY (user_id, event_id)
      SOURCE KEY (user_id) REFERENCES `User` (user_id)
      DESTINATION KEY (user_id, event_id) REFERENCES `Event` (user_id, event_id)
      LABEL TRIGGERED,
    Users AS UserVipRuleEdge
      KEY (user_id)
      SOURCE KEY (user_id) REFERENCES `User` (user_id)
      DESTINATION KEY (vip_rule_id) REFERENCES VipRule (vip_rule_id)
      LABEL GOVERNED_BY
  );

CREATE OR REPLACE PROPERTY GRAPH okf_products_graph
  NODE TABLES (
    DistributionCenters AS DistCenter KEY (center_id) LABEL DistCenter PROPERTIES (center_id, hub_name, backup_center_id),
    Products AS `Product` KEY (center_id, product_id) LABEL `Product` PROPERTIES (product_id, category, stock_qty),
    FulfillmentSLAs AS SlaRule KEY (sla_id) LABEL FulfillmentSLA PROPERTIES (rule_name, fallback_action)
  )
  EDGE TABLES (
    Products AS StockEdge
      KEY (center_id, product_id)
      SOURCE KEY (center_id) REFERENCES DistCenter (center_id)
      DESTINATION KEY (center_id, product_id) REFERENCES `Product` (center_id, product_id)
      LABEL STOCKS,
    Products AS ProductSlaEdge
      KEY (center_id, product_id)
      SOURCE KEY (center_id, product_id) REFERENCES `Product` (center_id, product_id)
      DESTINATION KEY (sla_id) REFERENCES SlaRule (sla_id)
      LABEL GOVERNED_BY
  );
