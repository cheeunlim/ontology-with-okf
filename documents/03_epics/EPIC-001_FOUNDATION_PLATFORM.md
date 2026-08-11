# 🏗️ [EPIC-001] Foundation Platform & Multi-Agent Architecture

## 1. 개요 및 목적 (Epic Overview)
* **Epic ID**: `EPIC-001`
* **대칭 Task**: [`TASK-001` (Foundation Setup)](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/documents/04_tasks/TASK-001_FOUNDATION_SETUP.md)
* **목적**: OKF Omni 지식 파이프라인의 기반이 되는 풀스택 디렉토리 구조(`documents/`, `references/`, `srcs/`), Express.js API 게이트웨이(Port 3003), React Vite 프론트엔드, Sentinel 프로세스 모니터링(`start_server.sh`) 및 `gemini-3.5-flash` 모델 연동 기반을 구축합니다.
* **상위 연계 문서**: [`prod.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/prod.md), [`AGENT.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/AGENT.md)

---

## 2. 주요 요구사항 및 구현 범위
1. **풀스택 디렉토리 분리**:
   - `documents/`: 설계, 아키텍처, 가이드라인, Epic 및 Task 문서 관리.
   - `references/`: Google Cloud 공식 OKF v0.2 스펙 및 카탈로그 레퍼런스.
   - `srcs/`: React 프론트엔드 및 Node.js 백엔드 소스 코드.
2. **AI 엔진 & 이중 인증 구조**:
   - `gemini-3.5-flash` 모델 고정 구동.
   - Direct REST API Key 및 Google Cloud CLI ADC(OAuth2 Access Token) 이중 폴백 클라이언트.
3. **서버 가용성 샌티널**:
   - `start_server.sh` 스크립트를 통한 1초 이내 자동 수복 백그라운드 구동.

---

## 3. 완료 기준 (Acceptance Criteria)
- [x] 풀스택 디렉토리 구조 분리 및 로컬 헬스체크 통과.
- [x] Express API 서버(Port 3003) 상시 구동 확인.
