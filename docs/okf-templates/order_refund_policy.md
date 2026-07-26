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

# 📄 주문 환불 및 반품 처리 업무 지침 (유형 C 완결형)

## 1. 개요 (Overview)
본 지침은 theLook 쇼핑몰에서 발생하는 고객의 주문 취소, 반품 접수, 환불 금액 정산 절차 및 악성 환불 어뷰저 방지를 위한 기준을 정의합니다. 본 문서의 가이드는 물리 테이블의 환불 상태값을 검증하고 정산 대상 매출액을 보정하는 시맨틱 모델링의 기초 지식으로 활용됩니다.

## 2. 핵심 비즈니스 규칙 & 정책 (Business Rules & Policies)

### 2.1. 반품 신청 가능 기간 및 환불 수용 규정
고객이 수령한 상품의 반품 수용 여부는 배송이 완료된 시점과 고객의 반품 신청 시점을 기준으로 결정됩니다.
- **일반 반품 (100% 환불)**:
  - 주문서상 배송 완료 일시(Delivery Completed Timestamp)와 고객이 최종 반품 접수를 완료하여 주문 상태가 반품 상태('Returned')로 전환된 날짜의 차이가 **영업일 기준 7일 이내**인 주문 건에 한해 전액 환불을 보장합니다.
- **기간 초과 반품 (80% 부분 환불)**:
  - 배송 완료일 이후 7일을 초과하고 15일 이내에 접수된 단순 변심 반품 건은 재고 감가상각 20% 페널티를 적용하여 상품 판매가(Sale Price)의 80%만 환불 정산합니다. 15일을 초과한 환불 신청은 시스템상 원천 차단됩니다.
- **오배송 / 상품 불량 예외**:
  - 오배송 또는 상품 결함으로 인한 반품의 경우, 7일이 경과하더라도 CS 담당자 승인 이력(CS Memo)이 존재하면 페널티 없이 100% 전액 환불합니다.

### 2.2. 환불 금액 및 결제 수단별 정산 공식
- **정산 대상액 산정**:
  - 반품이 최종 승인되어 개별 주문 품목 상태가 반품 완료('Returned')로 확정되면, 해당 주문 항목의 개별 상품 판매가(Sale Price)를 기준으로 환불 금액을 집계합니다.
- **할인 및 프로모션 차감**:
  - 주문 전체 금액에서 쿠폰 할인 코드나 회원 등급 할인 혜택이 적용된 경우, 할인 적용 비율만큼을 차감한 실제 결제 금액(Actual Paid Amount)만을 환불 원금으로 지정합니다.
  - 부분 반품의 경우, 남은 구매 완료 상품들의 합산 금액이 무료배송 기준 미만으로 떨어지면 초기에 면제되었던 기본 배송비 $3.00를 차감한 잔액을 환불 처리합니다.

### 2.3. 반복적 환불 어뷰징 (Abuse Protection)
- 특정 회원이 단기간 내에 과도하게 반품을 신청하는 행위를 감지하여 CS 부서에 경보를 보냅니다.
- **이상 탐지 규칙**:
  - 특정 회원(User Identifier)의 최근 90일간 주문 이력 중, 최종 상태가 반품('Returned') 또는 취소('Cancelled')로 끝난 주문 횟수가 해당 회원의 전체 누적 주문 횟수의 **40% 이상**이고, 총 반품 금액이 **$300.00 이상**인 경우 '주의 대상 회원'으로 분류합니다.

## 3. 물리 데이터 매핑 & 시맨틱 링크 (Semantic Mappings & Lineage)

### 🔗 물리 조인 키 FK 링크 (Physical FK Links)
- [order_items](order_items.md) -> [orders](orders.md) (조인 키: `order_items.order_id` = `orders.order_id`)
  - 주문서의 배송 완료 상태와 개별 주문 항목의 반품 승인 상태를 대조하고, 환불 판매액(`sale_price`)을 연동하기 위해 조인.
- [orders](orders.md) -> [users](users.md) (조인 키: `orders.user_id` = `users.id`)
  - 특정 사용자의 환불 어뷰징 비율(취소/반품 비율) 산출을 위해 조인.

### 🕸️ 그래프 릴레이션 링크 (Graph Relation Links)
- (u:`User`)-[p:`Placed`]->(o:`Order`) -> [orders](orders.md)
  - 이상 환불 의심 사용자의 누적 주문 네트워크 경로 및 반품 패턴 추적을 위한 릴레이션.
- (o:`Order`)-[c:`Contains`]->(oi:`OrderItem`) -> [order_items](order_items.md)
  - 마스터 주문서와 개별 반품 대상 품목 간의 소속 릴레이션 매핑.
