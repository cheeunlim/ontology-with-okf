# ⚙️ [TASK-002] BigQuery OKF v0.2 Harvester Implementation

## 1. Task 개요 & Epic 매핑
* **Task ID**: `TASK-002`
* **연계 Epic**: [`EPIC-002` (BigQuery OKF v0.2 Harvester)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/03_epics/EPIC-002_BIGQUERY_OKF_HARVESTER.md)
* **상태**: `Completed`
* **담당 컴포넌트**: `src/server.js`, `src/tools/okfV02Builder.js`, `src/prompts/agentPrompts.js`, `src/tools/gcpTools.js`
* **참조 규격**: [`references/knowledge-catalog/okf/SPEC.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/references/knowledge-catalog/okf/SPEC.md)

---

## 2. 세부 구현 내역
1. **OKF v0.2 메타데이터 빌더 탑재 (`/api/generate-okf`, `/api/enrich-metadata`)**:
   - `src/tools/okfV02Builder.js`: Native BigQuery Harvester 기반 OKF v0.2 명세 빌더 탑재.
   - `generated: { by: "reference_agent/gemini-3.5-flash", at: new Date().toISOString() }` 적용.
   - `sources` YAML 구조화 및 본문 `[^id]` 각주 렌더링.
   - `status: "stable"`, `verified: [{ by: "human:seanjung", at: "..." }]`, `stale_after` 메타데이터 부여.
2. **BigQuery Harvester 안전 로직 & Fallback 회복성**:
   - `INFORMATION_SCHEMA` 쿼리 + `VIEW` 타입 Fallback 로직 적용.
   - `global.dataplexScanCache` 기반 3초 타임아웃 캐싱.
   - Python 가상환경 부재 시에도 Native BigQuery OKF v0.2 Harvester 자동 폴백 가동 (`POST /api/generate-okf`).
3. **하위 호환성 폴백 레이어**:
   - `timestamp`와 `generated.at` 상호 호환 파싱 지원.
4. **Human Steward 검토 및 승인 워크플로우 (`/api/verify-okf`)**:
   - OKF Builder 화면 상단에 검토/승인 콘솔(Review & Verification Console) 탑재.
   - 초안(`status: draft`, `unverified`) 상태 확인 후 스튜어드가 **[✅ 검토 및 승인 (Approve)]** 버튼 클릭 시 `status: stable` 승격 및 `verified: [{ by: "human:<user_id>", at: "ISO8601" }]` 서명, 그리고 `tags: [..., verified]` 태그가 YAML 프론트매터 및 GCS에 안전하게 영구 저장·동기화됨 (`applyVerificationToOkf`).
   - 프론트엔드 `parsedFm` 및 `handleVerifyOkf` 상태 동기화로 승인 즉시 UI 및 마크다운 파일에 `✓ Human-Reviewed` / `Verified (Stable)` 상태가 실시간 반영됨.
5. **Dataplex Data Profile & Quality Scan 상태 시각화 및 온디맨드 수행 요청 (`GET /api/dataplex/scans`, `POST /api/dataplex/run-scan`)**:
   - 데이터셋 대시보드 테이블 목록 및 테이블 Catalog Info에 스캔 상태(`✅ Profiled` vs `⚪ Not Profiled`) 및 실행 요청 버튼(`Run Scan` / `Batch Scan`) 구현.
   - 스캔 완료된 통계(결측률, 유니크 비율, Top10 분포)를 OKF v0.2 마크다운 `# Data Profile & Quality Insights` 섹션에 자동 하베스팅.

---

## 3. 검증 결과 로그
* **검증 대상**: `seanjung-poc.thelook_ecommerce` (테이블: `orders`, `users`, `order_items`, `events_*` 와일드카드, 가상 `VIEW`)
* **생성 규격**: OKF v0.2 YAML Frontmatter + Markdown Body + 양방향 위키 백링크 정상 검증 완료.
* **단위 및 통합 테스트 결과**:
  1. **Python OKF v0.2 단위/통합 테스트 (`references/knowledge-catalog/okf/tests/`)**:
     - `test_epic002_bq_okf_v02_conversion.py`: 7/7 PASSED (BigQuery Source Harvester, VIEW 쿼리 폴백, 와일드카드 축약, `generated: { by, at }`, `sources` 승격, Trust Tier/Lifecycle, v0.1 하위 호환성).
     - 전체 테스트 슈트: 46/46 ALL PASSED (`test_bigquery_source.py`, `test_bundle_tools.py`, `test_document.py`, `test_index.py`, `test_viewer.py`, `test_web_fetcher.py`, `test_web_tools.py`).
  2. **Node.js 변환 파이프라인 검증 (`scratch/test_epic002_conversion.mjs`)**:
     - BigQuery 물리 메타데이터 ➔ OKF v0.2 마크다운 변환 및 YAML Frontmatter 규격(§11 Conformance) 100% 일치 확인.
     - `# Schema`, 파티셔닝/클러스터링 블록, `# Common query patterns`, `# Joins` 백링크, 각주 `[^id]` 정상 바인딩.
     - 가상 `VIEW` 테이블 변환 시 400 Bad Request 방어 및 폴백 카운트 정상 작동 확인.
