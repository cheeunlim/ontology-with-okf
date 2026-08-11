# ⚙️ [TASK-003] Wiki & Unstructured Doc Transpiler Implementation

## 1. Task 개요 & Epic 매핑
* **Task ID**: `TASK-003`
* **연계 Epic**: [`EPIC-003` (Wiki & Unstructured Document OKF Transpiler)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/03_epics/EPIC-003_WIKI_UNSTRUCTURED_DOC_TRANSPILER.md)
* **상태**: `Completed`
* **담당 컴포넌트**: `srcs/src/server.js` (`/api/okf/wiki-convert-chunk`, `/api/llm-wiki-store/decompose`), `srcs/src/prompts/agentPrompts.js` (`getWikiChunkingPrompt`, `getBusinessDefinitionExtractPrompt`, `getLlmWikiDecomposePrompt`), `srcs/src/components/IngestionTab.jsx`

---

## 2. 세부 구현 내역
1. 마크다운 `#`, `##`, `###` 헤딩 계층 분석 및 아토믹 청크 분할.
2. OKF v0.2 프론트매터 (`type: WikiDocument`, `generated`, `sources`, `status`) 직렬화.
3. 문서 간 상호 위키 백링크 (`[[Link]]`) 및 주요 업무 정의 (`type: BusinessConcept`) 자동 추출.
4. **에이전트 표적 탐색 인덱스(01_summary 목차 앵커) 생성**:
   - `EPIC-006` Data Agent가 필요한 500자 내외 적합 파트만 추적할 수 있도록 `01_summary/` 목차 인덱스 앵커 배치.
5. `Ingestion & Interview Feedback` 탭 UI 카드 구성 및 시각화.

---

## 3. 검증 결과 로그
* **결과**: `prod.md` 및 이용약관 PDF 입력 시 청킹, 백링크, 업무 정의 추출 검증 완료.
