# 🏛️ [EPIC-001] Foundation Platform & Full-Stack Architecture

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-001`
* **대칭 Task**: [`TASK-001` (Foundation Setup)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/04_tasks/TASK-001_FOUNDATION_SETUP.md)
* **목적**: 엔터프라이즈 온톨로지 플랫폼의 풀스택 아키텍처(React 19 + Express API Gateway + Gemini 3.5 Flash Core)를 구축하고, 무중단 자동 재기동 샌티널 및 GCP 인증 파이프라인을 확립합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/AGENT.md), [`DESIGN.md`](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/DESIGN.md)

---

## 2. 주요 요구사항 및 구현 범위
1. **풀스택 런타임 환경**:
   - 프론트엔드: React 19 + Vite 번들러 (`src/App.jsx`, `src/index.css`)
   - 백엔드 게이트웨이: Express Orchestrator (`src/server.js`)
   - 프로세스 격리: `start_server.sh` 샌티널 스크립트 기반 무중단 상주
2. **GCP 및 Gemini 코어 연동**:
   - Google AI Studio API 키 및 Google Cloud CLI ADC(`gcloud auth application-default login`) 이중 인증 지원 (`src/agents/geminiAgent.js`).
   - `gemini-3.5-flash` 모델 고정 사용 원칙 준수.
3. **디렉토리 분리 표준**:
   - `documents/`: 기획, 사양, 가이드라인, Epic/Task 관리
   - `src/`: 실제 공유 및 배포 소스 코드 관리
   - `references/`: 외부 GitHub 코드 및 참고 자료 격리 관리

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] Vite 프로덕션 빌드(`npm run build`)가 오류 없이 성공할 것.
- [x] Express 서버(`src/server.js`)가 포트 3003에서 정적 파일 및 API를 동시 서빙할 것.
- [x] Gemini API 호출 시 생각의 흐름(Thoughts) 파싱이 정상 동작할 것.
