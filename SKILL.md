---
name: ontology-with-okf-master-skill
description: OKF Omni 프로젝트의 Epic 기반 Task 수술적 개발, 로컬 API/UI 테스트 및 GCP Cloud Run 배포 마스터 워크플로우 스킬
---

# 🌐 OKF Omni Master Development & Workflow Skill

본 문서는 **OKF Omni (Ontology with OKF)** 프로젝트의 개발 수칙 준수, **Epic 기반 Task 추적 및 소스 개발**, **로컬 API/UI 헬스체크** 및 **GCP Cloud Run 배포 파이프라인**을 관장하는 프로젝트 최상위 마스터 스킬 지침서입니다.

---

## 🎯 1. 워크플로우별 트리거 단축어 (Trigger Shortcuts)

| 스킬 명칭 | 단축 키워드 | 주요 자동화 역할 |
| :--- | :--- | :--- |
| 🚀 **Epic-Driven Task Dev** | `/epic-dev` 또는 `"EPIC-xxx 개발"`, `"epic1 개발"` | 에픽 명칭 지시 시 대칭 `04_tasks/` 추적 ➔ 기본 요구사항 검토/갱신 ➔ 소스 코드 개발 ➔ 검증 ➔ `prod.md` 반영 |
| 🧪 **Local Test** | `/local-test` 또는 `"로컬 테스트해줘"` | 최근 반영 기능 체크리스트 생성 ➔ Vite 빌드 & 헬스체크 ➔ 브라우저 렌더링/동작 검증 ➔ 에러 시 개발 수복 |
| ☁️ **Cloud Run Deploy** | `/cloud-deploy` 또는 `"서버에 배포해줘"` | Docker 컨테이너 빌드 ➔ Artifact Registry 푸시 ➔ GCP Cloud Run 배포 ➔ 라이브 URL 검증 |
| 🐙 **GitHub Push** | `/github-push` 또는 `"GitHub에 배포해줘"` | 미사용 코드 정돈 ➔ 템프 파일 삭제 ➔ Gemini API 키 보안 스캔 ➔ 깃 구조 확인 ➔ Git Push |
| 🔄 **GitHub Ref Update** | `/github-ref-update` 또는 `"깃헙 레퍼런스 업데이트 해줘"` | `references/` 하위 외부 GitHub 레포지토리 최신 코드 조회 ➔ Upstream 동기화 ➔ 빌드/호환성 검증 ➔ 문서 최신화 |
| 🛡️ **QA & Dev Check** | `/dev-check` 또는 `"개발 수칙 점검해줘"` | Gemini 3.5 Flash 고정, 'Feedback' 용어 규칙, BQ View Fallback & Dataplex 캐시 린트 일괄 검사 |

---

## 📋 2. 상세 워크플로우 수행 지침

### 🚀 Workflow A. Epic 지정 Task 개발 파이프라인 (`/epic-dev`)
1. **Epic & Task 매핑 추적**: 사용자 지시("epic1 개발", "EPIC-002 개발")에 해당하는 `documents/03_epics/EPIC-xxx.md` 및 대칭되는 `documents/04_tasks/TASK-xxx.md` 문서 추적.
2. **요구사항 검토 & 문서 갱신 (기본 파이프라인)**: 요청 내용에 맞춰 Epic/Task 명세서 요구사항 및 범위를 검토하고 필요 시 선제 반영.
3. **소스 코드 수술적 구현 & 개발**: Task 세부 범위에 맞춰 백엔드/프론트엔드 코드 최소·수술 단위 구현 진행.
4. **로컬 검증 & 자율 수복**: 로컬 3003 API/UI 헬스체크 및 브라우저 동작 검증 수행.
5. **`prod.md` SSOT 매트릭스 & 가이드 동기화**: `prod.md` 에픽-태스크 매핑 상태, `DEVELOPER_GUIDE.md`, `USER_GUIDE.md`, `DESIGN.md` 문서 동기화.

### 🧪 Workflow B. 기능 위주 로컬 테스트 및 브라우저 검증 (`/local-test`)
1. **반영 기능 체크리스트 생성**: 최근 수정/구현된 소스 및 Task 요구사항 기반 테스트 대상 기능 리스트 작성.
2. **빌드 & 헬스체크**: Vite 빌드 검증 및 3003/8085 서버 헬스체크 (`bash start_server.sh` 자동 수복).
3. **브라우저 구동 & 시각적 조작 검증**: `browser_subagent`로 `http://localhost:3003` 접속하여 반영 기능 리스트 하나씩 조작 및 체크.
4. **에러 발생 시 개발 자동 수복**: 콘솔 에러, UI 깨짐, 의도 불일치 발견 시 즉각 코드 수정(개발 업데이트) 후 재테스트.
5. **결과 리포트 출력**: 체크리스트 검증 결과 및 세이프가드 규칙 준수 리포트 작성.

### ☁️ Workflow C. GCP Cloud Run 배포 (`/cloud-deploy`)
1. GCP 인증 및 프로젝트 ID 확인 (`gcloud config get-value project`).
2. Docker 이미지 빌드 및 Artifact Registry 푸시.
3. GCP Cloud Run 배포: `gcloud run deploy okf-omni --image ... --port 3003 --memory 2Gi --cpu 2`.
4. 라이브 URL 접속 검증 (https://okf-omni-924723860007.us-central1.run.app/).

### 🐙 Workflow D. GitHub 커밋 & Push (`/github-push`)
1. **코드 정돈**: 불필요한 미사용 코드 및 디버그용 console.log 정리.
2. **템프 파일 정단**: `.DS_Store`, 임시 캐시 파일 청소 및 `.gitignore` 점검.
3. **Gemini API 키 보안 점검**: API Key (`AIza...`) 및 시크릿 하드코딩 유무 전수 스캔 (환경변수 주입 보장).
4. **Git 구조 정합성 검증**: 기존 깃헙 코드 구조(`srcs/`, `documents/`, `references/`, `SKILL.md` 등) 정합성 확인.
5. **Git Push 실행**: `git add .` ➔ `git commit` ➔ `git push origin main` 실행 (직접 수행 불가 시 터미널 명령어 가이드 제시).

### 🔄 Workflow E. GitHub 레퍼런스 최신 갱신 파이프라인 (`/github-ref-update`)
1. **레퍼런스 스캔**: `references/` 하위 외부 GitHub 레포지토리 및 레퍼런스 폴더(`google/adk-python`, `knowledge-catalog` 등) 목록 확인.
2. **Upstream 동기화**: 업스트림 최신 릴리스 및 커밋 변경 내역 조회 후 최신 신규 코드로 갱신.
3. **호환성 검증**: `npm run build` 및 기존 OKF v0.2 스펙과의 회귀 충돌 여부 체크.
4. **문서 동기화**: `references/README.md` 및 `DEVELOPER_GUIDE.md`에 갱신 버전 및 타임스탬프 기록.

---

## 🛠️ 서브 스킬 참조 문서 (Sub-Skill Specs)
- [`skills/EPIC_TASK_DEV.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/skills/EPIC_TASK_DEV.md)
- [`skills/LOCAL_TEST_AND_DEPLOY.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/skills/LOCAL_TEST_AND_DEPLOY.md)
- [`skills/GITHUB_PUSH.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/skills/GITHUB_PUSH.md)
- [`skills/GITHUB_REF_UPDATE.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/skills/GITHUB_REF_UPDATE.md)
- [`skills/DEV_WORKFLOW.md`](file:///Users/seanjung/.gemini/antigravity-demo-archive/antigravity-demo-2026-8-2-118/scratch/ontology-with-okf/skills/DEV_WORKFLOW.md)

