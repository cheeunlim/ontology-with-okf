# 📊 [EPIC-002] BigQuery Physical Metadata & OKF v0.2 Spec Harvester

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-002`
* **대칭 Task**: [`TASK-002` (BigQuery OKF Harvester)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/04_tasks/TASK-002_BIGQUERY_OKF_HARVESTER.md)
* **목적**: Google Cloud BigQuery 데이터셋 내의 물리 테이블 스키마, DDL, 파티셔닝/클러스터링 정보 및 Dataplex 프로파일링 통계를 자동 수집하여 **최신 Google Cloud OKF (Open Knowledge Format) v0.2 표준 규격**으로 변환합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/AGENT.md)
* **참조 규격**: [`references/knowledge-catalog/okf/SPEC.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/references/knowledge-catalog/okf/SPEC.md) (OKF v0.2)

---

## 2. OKF v0.2 핵심 변경 사항 및 신규 요구사항 (Specification Diff)

OKF 공식 upstream v0.2 릴리즈에 따라 기존 v0.1 스펙 대비 다음 변경 요구사항이 본 Epic에 반영됩니다:

### ① Breaking Changes (필수 마이그레이션)
1. **`timestamp` ➔ `generated: { by, at }` 교체**:
   - 레거시 단일 문자열 `timestamp` 필드를 공식 Actor 규격(`by: "reference_agent/gemini-3.5-flash"`) 및 ISO 8601 타임스탬프(`at: "2026-08-02T...Z"`)를 포함하는 `generated` 구조체로 전환.
2. **본문 `# Citations` ➔ 프론트매터 `sources` 패밀리 이전**:
   - 마크다운 본문 하단에 존재하던 플랫 인용 리스트를 YAML 프론트매터의 정형 `sources` 배열로 승격.
   - 각 소스는 `id`, `resource`, `title`, `author`, `last_modified`, `usage_count` 신뢰도 시그널을 포함하며, 본문에서는 각주 표기(`[^id]`)로 상호 참조.

### ② Additive Changes (신규 기능 확장)
1. **신뢰도 및 수명 주기(Trust & Lifecycle) 검토/승인 워크플로우**:
   - **초기 자동 생성 (Initial Draft)**: `status: draft`, `verified` 필드 미포함 (`Unverified` 상태 유지).
   - **OKF Builder 검토 및 승인 (Human Steward Review & Approval)**:
     - 작성자/스튜어드가 OKF Builder 화면에서 초안 명세서를 확인하고 **[✅ 검토 및 승인 (Approve)]** 버튼을 통해 원클릭 승인 수행 (`POST /api/verify-okf`).
     - 승인 시 `status: stable`로 승격되고 `verified: [{ by: "human:<user_id>", at: "ISO8601" }]` 서명이 YAML 프론트매터 및 GCS에 영구 기록·업데이트됨.
   - `stale_after: YYYY-MM-DD` (데이터 신선도 유효기간 검증 및 갱신)
2. **BigQuery 개체 방어 처리 (기존 유지 & 보강)**:
   - `VIEW` 테이블의 `400 Bad Request` 에러 방어 처리 (`SELECT * FROM view LIMIT 10` 폴백).
   - Dataplex Scan 3초 타임아웃 및 10분 TTL 인메모리 캐싱.
3. **Dataplex Data Profile & Quality Scan 상태 시각화 및 온디맨드 수행 요청**:
   - **데이터셋 및 테이블 단위 스캔 상태 탐색 (`GET /api/dataplex/scans`)**:
     - 테이블 목록 및 상세 화면에서 각 테이블별 Dataplex Profile/Quality Scan 완료 여부(`✅ Profiled` vs `⚪ Not Profiled`) 실시간 시각화.
     - 데이터셋 레벨의 Insights Scan 상태 및 총 프로파일링 완료 테이블 비율(`2 / 9 Profiled`) 대시보드 표시.
   - **온디맨드 스캔 수행 요청 (`POST /api/dataplex/run-scan`)**:
     - 미스캔 테이블에 대한 즉시 스캔 요청 버튼(`[🔍 Run Scan]`) 및 데이터셋 전체 일괄 스캔(`[⚡ Batch Scan]`) 지원.
     - 스캔 완료 시 통계 메타데이터(결측률, 고유값 비율, Top 10 값 분포)가 OKF v0.2 마크다운의 `# Data Profile & Quality Insights` 섹션 및 YAML `sources`에 자동 주입.

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] BigQuery 데이터셋 내 모든 테이블이 OKF v0.2 표준 마크다운(`generated`, `sources`, `status`)으로 일괄 변환될 것.
- [x] 생성된 OKF v0.2 번들이 GCS 버킷(`okf-omni-[project-id]`)에 자동 업로드될 것.
- [x] OKF Builder 화면에서 검토자가 `Draft (검토 대기)` 상태를 확인하고 원클릭으로 검토 및 승인(`Approve & Verify`)을 수행할 수 있을 것.
- [x] 승인 시 YAML 프론트매터의 `status: stable` 승격 및 `verified: [{ by: "human:...", at: "ISO8601" }]` 서명이 GCS 파일 및 UI에 즉시 갱신될 것.
- [x] 데이터셋 및 테이블 단위로 Dataplex Profile/Quality 스캔 수행 상태가 실시간 시각화될 것.
- [x] UI에서 개별/일괄 스캔 수행 요청(`Run Scan` / `Batch Scan`)이 가능하며, 스캔 완료 시 OKF 명세서에 프로파일 통계가 자동 수집될 것.
- [x] 레거시 v0.1 포맷 문서 조회 시에도 파서가 `timestamp` 및 `# Citations` 하위 호환 폴백을 지원할 것.
