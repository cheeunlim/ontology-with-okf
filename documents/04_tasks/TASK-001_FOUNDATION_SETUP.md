# ⚙️ [TASK-001] Foundation Setup & Full-Stack Deployment

## 1. Task 개요 & Epic 매핑
* **Task ID**: `TASK-001`
* **연계 Epic**: [`EPIC-001` (Foundation Platform)](file:///Users/seanjung/.gemini/jetski/scratch/ontology-with-okf/documents/03_epics/EPIC-001_FOUNDATION_PLATFORM.md)
* **상태**: `Completed`
* **담당 컴포넌트**: `src/server.js`, `src/App.jsx`, `start_server.sh`, `Dockerfile`

---

## 2. 세부 구현 내역
1. **Express & React 19 아키텍처 정립**:
   - `src/server.js`에서 `/dist` 정적 서빙 및 API 라우트 통합.
   - 루트 `server.js`를 통해 `src/server.js`로 투명 포워딩 지원.
2. **Sentinel 자동 재기동 구현**:
   - `start_server.sh` 스크립트를 통한 1초 내 자동 수복 루프 구성.
3. **듀얼 인증 체계**:
   - `src/agents/geminiAgent.js`에 `GEMINI_API_KEY` 및 `gcloud ADC` 토큰 지원.

---

## 3. 검증 결과 로그
* **검증 환경**: 
  - 로컬 Node v24.14.0 & Vite v8.1.0 (`http://localhost:3003/`)
  - Google Cloud Run 프로덕션 배포 (`us-central1`, 리비전 `okf-omni-00032-wp4`)
* **빌드 및 배포 결과**:
  - `npm run build` 프로덕션 번들 정상 완료.
  - Cloud Build 컨테이너 이미지 패키징 및 Cloud Run 배포 완료.
* **서버 가용성 검증**:
  - Cloud Run 프로덕션 URL: [https://okf-omni-924723860007.us-central1.run.app](https://okf-omni-924723860007.us-central1.run.app)
  - HTTP GET `/` 및 `/api/datasets` 200 OK 정상 응답 확인.
