# 🧪 [TASK-007] [EXPERIMENTAL] Karpathy LLM-Wiki Engine Prototyping

## 1. Task 개요 & Epic 매핑
* **Task ID**: `TASK-007`
* **연계 Epic**: [`EPIC-007` (Experimental Karpathy LLM-Wiki)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/05_experimental/EPIC-007_EXPERIMENTAL_KARPATHY_LLM_WIKI.md)
* **상태**: 🧪 **`Experimental / Research Prototype` (실제 적용 계획 없음)**
* **담당 컴포넌트**: `src/server.js` (`/api/llm-wiki-store/*`), `src/prompts/agentPrompts.js` (`getLlmWikiDecomposePrompt`), `documents/01_architecture/KARPATHY_LLM_WIKI_GUIDE.md`

---

## 2. 실험적 프로토타입 구현 내역
1. **Karpathy 3-Layer Decomposer 프롬프트**:
   - `getLlmWikiDecomposePrompt`를 통한 `01_summary`, `02_entities`, `03_concepts` 자율 컴파일 구조 연구.
2. **실험용 위키 스토어 API**:
   - `/api/llm-wiki-store/decompose`, `/api/llm-wiki-store/list`, `/api/llm-wiki-store/read` 엔드포인트 구축 및 격리 테스트.
3. **독립성 유지**:
   - 프로덕션 온톨로지 보강 파이프라인([`TASK-003`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/04_tasks/TASK-003_WIKI_UNSTRUCTURED_DOC_TRANSPILER.md))에 영향을 주지 않도록 연구용으로만 격리 유지.

---

## 3. 연구 및 검증 로그
* **검토 결과**: Karpathy 스타일의 3계층 위키 구조는 지식의 단계적 탐색(Progressive Disclosure)에 효과적이나, 실제 프로덕션 온톨로지 보강 플로우와는 분리된 연구 단계로 관리하기로 확정.
