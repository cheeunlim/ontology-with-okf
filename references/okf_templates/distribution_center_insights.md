---
type: BusinessSpecification
datasetId: theLookCommerce
targetTables:
  - distribution_centers
  - inventory_items
  - products
tags: [logistics, shipping, inventory]
author: "Supply Chain Management Division"
lastUpdated: "2026-07-10"
---

# 📄 물류 센터 재고 운영 및 배송 효율화 가이드라인

## 1. 개요 (Overview)
본 문서는 theLook 쇼핑몰의 공급망 효율화를 위해 전국 물류 센터별 재고 보유 현황 및 배송 리드 타임 최적화 기준을 제공합니다. 비즈니스 분석가와 물류 운영팀은 본 가이드라인을 참조하여 재고 부족 및 배송 병목을 모니터링해야 합니다.

## 2. 핵심 비즈니스 규칙 & 정책 (Business Rules & Policies)

### 2.1. 물류 창고별 적정 재고 보유량 (Safety Stock)
- 각 물류 창고는 취급하는 상품 종류에 관계없이 항상 특정 수준의 안전 재고를 유지해야 합니다.
- **기준 규칙**: 각 물류 창고(물류센터 ID)가 보유한 재고 물품 중 아직 판매되지 않은 가용 상태(즉, 판매일자가 비어있는 상태)의 개별 상품 수량이 최소 **15개 이상** 유지되어야 합니다.
- 만약 특정 상품의 가용 재고 개수가 15개 미만으로 떨어지는 경우, 자동으로 안전 재고 확보를 위한 구매 요청(PO)이 발행됩니다.

### 2.2. 배송 소요 시간 최적화 (Lead Time Limits)
- 물류 창고 위치와 고객 주소 간의 배송 소요 시간을 관리합니다.
- **기준 규칙**: 주문이 창고에서 발송 처리된 시점부터 고객지에 최종 도착 완료된 시점까지의 차이인 배송 소요 리드 타임이 영업일 기준 **최대 5일**을 초과하지 않아야 합니다. 5일 초과 건이 다수 발생하는 창고는 배송 서비스 개선 패치 대상이 됩니다.
