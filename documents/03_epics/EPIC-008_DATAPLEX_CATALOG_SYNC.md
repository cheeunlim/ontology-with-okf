# 🌐 [EPIC-008] GCP Dataplex Universal Catalog Sync

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-008`
* **대칭 Task**: [`TASK-008` (Dataplex Catalog Sync)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/04_tasks/TASK-008_DATAPLEX_CATALOG_SYNC.md)
* **목적**: OKF Omni에서 보강되고 스튜어드 승인이 완료된 OKF v0.2 메타데이터(`status`, `stale_after`, `verified`, 비즈니스 설명, 도메인 백링크)를 **GCP Dataplex Universal Catalog(Aspect: `okf-aspect.json`)로 원클릭/실시간 동기화(Live Sync)**하여 전사 데이터 거버넌스를 확립합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/AGENT.md)

---

## 2. 주요 요구사항 및 구현 범위
1. **Dataplex Aspect 푸시 파이프라인 (`POST /api/dataplex/push`)**:
   - `okf-aspect.json` 메타데이터 Aspect 타입 규격 설계.
   - Dataplex Entry Group(@bigquery)에 OKF Aspect 실시간 주입 (`gcloud dataplex entries update`).
   - Cloud Run 서비스 계정에 `roles/dataplex.editor` 및 `roles/dataplex.catalogEditor` (`dataplex.entries.update`) IAM 권한 부여.
2. **Dataplex CLI 지연 차단 (In-Memory Cache & Timeout)**:
   - 3초 타임아웃 및 10분 TTL 인메모리 캐시(`global.dataplexScanCache`)를 적용하여 100ms 이내 응답 속도 보장.
3. **Dataplex Business Glossary Native 연동 카드**:
   - 프론트엔드 Catalog Info 탭 내 Dataplex 메타데이터 및 Business Glossary 매핑 표 렌더링.

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] OKF v0.2 메타데이터 및 승인 정보가 Dataplex Catalog Aspect로 동기화될 것.
- [x] Dataplex 프로파일 스캔 및 카탈로그 조회가 100ms 이내 초고속 응답을 보장할 것.
- [x] Cloud Run 서비스 계정에 Dataplex Catalog Editor IAM 권한이 정밀 연결되어 푸시 에러가 해소될 것.

