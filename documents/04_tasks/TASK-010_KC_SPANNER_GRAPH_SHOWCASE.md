# 🛠️ [TASK-010] Standalone Knowledge Catalog & Spanner Graph Showcase Implementation

## 1. 작업 개요 (Task Overview)
* **Task ID**: `TASK-010`
* **대칭 Epic**: [`EPIC-010` (KC & Spanner Graph Showcase)](../03_epics/EPIC-010_KC_SPANNER_GRAPH_SHOWCASE.md)
* **구현 목표**: `/kc-spanner` 독립 라우트 컴포넌트(`KcSpannerDemoPage.jsx`), 전용 스타일시트(`KcSpannerDemoPage.css`), 프롬프트(`getKcSpannerSynthesisPrompt`), 그리고 백엔드 API 3종(`/api/kc-spanner/*`)을 구현 및 검증합니다.

---

## 2. 구현 파일 및 API 명세
1. **Frontend**:
   - [`srcs/src/components/KcSpannerDemoPage.jsx`](../../srcs/src/components/KcSpannerDemoPage.jsx): 3-Column 파이프라인 UI, 3대 도메인 시나리오(`orders`, `users`, `products`), OKF 블록 클릭 시 타겟 하이라이트, Spanner Graph SVG 토폴로지 및 ISO GQL 결과 테이블.
   - [`srcs/src/components/KcSpannerDemoPage.css`](../../srcs/src/components/KcSpannerDemoPage.css): Google Cloud 라이트 테마 기반 미니멀 카드/코드블록 디자인.
   - [`srcs/src/main.jsx`](../../srcs/src/main.jsx) & [`srcs/src/App.jsx`](../../srcs/src/App.jsx): `/kc-spanner` 라우팅 및 상단 헤더 전환 버튼.
2. **Prompts (SSOT)**:
   - [`srcs/src/prompts/graphPrompts.js`](../../srcs/src/prompts/graphPrompts.js) & [`srcs/src/prompts/agentPrompts.js`](../../srcs/src/prompts/agentPrompts.js): `getKcSpannerSynthesisPrompt` 추가 및 리익스포트.
3. **Backend (`srcs/src/server.js`)**:
   - `POST /api/kc-spanner/synthesize`: `gemini-3.5-flash` 호출 및 `part.thought` 추출.
   - `POST /api/kc-spanner/push-kc`: Dataplex Entry 설명 및 `overview` / `okf-governance` Aspect 업데이트.
   - `POST /api/kc-spanner/deploy-spanner`: Spanner `INTERLEAVE IN PARENT` 테이블 및 `CREATE OR REPLACE PROPERTY GRAPH` DDL 검증.

---

## 3. 검증 결과
- [x] `npm run build` 무결성 통과.
- [x] `GET /kc-spanner` HTTP 200 응답 및 `/api/kc-spanner/*` 엔드포인트 정상 동작 확인.
