# 📌 Knowledge Catalog & OKF File Linking Agent Specification

본 문서는 `https://github.com/seanjungG/ontology-with-okf` 리파지토리 기반으로, 향후 **Knowledge Catalog(GCP Dataplex Catalog)**와 **OKF 3계층 온톨로지 파일**을 자율 연결하는 Agent를 구축할 때 참조하기 위해 작성된 **분석 및 개발 명세서(Reference Spec)**입니다.

---

## 1. 🎯 주요 연결 목적 (Core Purpose)

- **물리 데이터 스키마와 온톨로지의 유기적 융합**:
  BigQuery / Spanner의 물리 데이터베이스 스키마(테이블, 컬럼, 타입)와 `01_summary`, `02_entities`, `03_concepts` OKF 온톨로지 파일 및 현업 암묵지 피드백(`03_feedback/`)을 상호 백링크(`[[table.md]]`, `[[Entity]]`)로 연결합니다.
- **Dataplex Catalog Aspects 동기화**:
  보강된 로컬 OKF 지식을 Dataplex Catalog의 Overview 및 Table Description Aspect로 동기화(Push/Sync)하여 기업 전사 지식 카탈로그를 완성합니다.

---

## 2. 🧩 핵심 프롬프트 엔진 참조 ([prompts/agentPrompts.js](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prompts/agentPrompts.js))

1. **`getLlmWikiDecomposePrompt`**: 비정형 지식 3계층 마크다운 분해/합성
2. **`getEnrichmentPrompt`**: 스키마 보강 및 이중 백링크 형성
3. **`getSqlGenerationPrompt`**: 하이브리드 Standard SQL + GQL `GRAPH_TABLE` 질의 전략 도출
4. **`getFinalAnswerPrompt`**: 최종 추론 Provenance 보고서 작성

---

## 3. 🛠️ GCP SDK 및 클라이언트 도구 참조 ([tools/gcpTools.js](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/tools/gcpTools.js))

- **BigQuery Schema Discovery**: DDL / Table Field Metadata 가져오기
- **Dataplex Catalog Aspect Push/Diff**: OKF 마크다운 ➔ Dataplex Aspects 양방향 Diff 및 갱신
- **GCS OKF Store Connector**: GCS 버킷 및 로컬 `okf_store/` CRUD 연동

---

## 4. 🐍 Agent Development Kit (ADK) Python 참조 (google/adk-python)

- **공식 레퍼런스 저장소**: [google/adk-python](https://github.com/google/adk-python)
- **로컬 레퍼런스 구현체**: [`references/knowledge-catalog/okf/`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/references/knowledge-catalog/okf)
- **주요 툴셋 & 의존성**: `google-adk>=2.0` (Python 3.11+)
- **핵심 역할**:
  - OKF(Open Knowledge Format) 번들을 자율 생성하는 Reference Agent 라이브러리 연동
  - `google.adk.cli` 및 `google.adk` 에이전트 러너를 통한 온톨로지 하베스팅 및 지식 카탈로그 동기화 연동 참조

---

## 5. 🧭 Agent 개발 시 활용 체크리스트

- [x] OKF 3계층 마크다운 수집 및 저장 파이프라인 (`01_raw`, `02_okf`, `03_feedback`)
- [x] 구글 ADK Python 레퍼런스([google/adk-python](https://github.com/google/adk-python)) 및 `references/knowledge-catalog/` 툴셋 이식
- [ ] Dataplex Catalog Aspects SDK 래퍼 릴레이션 연동
- [ ] GQL Property Graph 에지 상호 참조 매핑
- [ ] 5단계 Provenance 추론 파이프라인 결합

*본 문서는 애플리케이션 실행 코드와 무관하게 지식 참조 및 향후 에이전트 개발 준비를 위해 저장소에 안전하게 킵(Keep)되었습니다.*
