---
type: BusinessSpecification
datasetId: theLookCommerce
targetTables:
  - users
  - orders
tags: [security, fraud, user_abuse]
author: "E-Commerce Fraud Prevention Unit"
lastUpdated: "2026-07-10"
---

# 📄 악성 어뷰징 유저 탐지 및 거래 제한 정책

## 1. 개요 (Overview)
본 문서는 쇼핑몰 내 결제 대피, 허위 거래 생성, 불법 다중 계정 가입 등 비정상적인 어뷰징 행동 패턴을 가진 악성 사용자를 정의하고 이에 대한 차단 및 거래 제한 시스템 기준을 설명합니다. 데이터 엔지니어 및 사기방지팀은 본 사양을 기반으로 이상 유저 데이터를 BigQuery에서 추출해야 합니다.

## 2. 핵심 비즈니스 규칙 & 정책 (Business Rules & Policies)

### 2.1. 비정상 주문 취소 / 반품 반복 어뷰징
- **기준 규칙**: 최근 30일 이내에 생성된 주문들 중 결제 후 취소 또는 반품 처리된 비율이 전체 주문의 **50% 이상**인 고객을 모니터링 대상으로 지정합니다.
- **비즈니스 설명**: 주문 생성일 기준으로 한 달 내 데이터 중, 주문 상태가 'Cancelled'(취소) 또는 'Returned'(반품) 상태에 도달한 주문 건의 총 비율을 계산하여 어뷰저를 탐지합니다.

### 2.2. 불법 다중 계정 어뷰징 (Multi-Account Fraud)
- 동일한 배송 주소 또는 동일한 이메일 도메인 패턴을 활용해 다수의 임시 아이디를 생성하는 행위를 차단합니다.
- **기준 규칙**: 가입일이 동일한 다수의 회원 계정이 동일한 배송지에 3명 이상 묶여 있거나, 이메일 주소의 도메인 부분이 일회성 이메일 서비스(예: tempmail.com, yopmail.com 등)를 사용하는 경우 악성 어뷰징 회원 그룹으로 규정합니다.
