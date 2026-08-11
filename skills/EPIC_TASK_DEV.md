---
name: epic-task-dev
description: Epic 명칭(예: epic1 개발, EPIC-002 개발) 지시 시 해당 Task 명세 추적, 문서 갱신, 소스 구현 및 검증을 일괄 수행하는 에픽 기반 개발 워크플로우 스킬
---

# 🚀 Epic-Driven Task Development Workflow Skill

본 스킬은 사용자가 **"EPIC-001 개발"**, **"epic1 개발"**, **"EPIC-002 개발해줘"**와 같이 Epic 명칭을 지정하여 개발을 요청했을 때, 대칭되는 **Task 명세(`documents/04_tasks/TASK-xxx.md`)를 자동으로 추적**하고, 요구사항 반영 ➔ 소스 코드 구현 ➔ 로컬 검증 ➔ `prod.md` 마스터 매트릭스 갱신을 연속 수행하는 워크플로우 스킬입니다.

---

## 🎯 스킬 발동 조건 (Trigger Keywords)
- **"/epic-dev"** 입력 시
- **"EPIC-xxx 개발"**, **"epic1 개발"**, **"EPIC-002 개발해줘"**, **"에픽 기반 개발 진행해줘"** 지시 시

---

## 📋 표준 워크플로우 수행 절차 (Execution Steps)

### Step 1. 대상 Epic 및 대칭 Task 매핑 추적
- 사용자가 지정한 에픽 명칭(예: `epic1`, `EPIC-002`)을 파악합니다.
- `documents/03_epics/EPIC-xxx.md` 에픽 문서와 1:1 대칭되는 `documents/04_tasks/TASK-xxx.md` 실행 명세서를 탐색 및 로드합니다.

### Step 2. 요구사항 검토 및 관련 문서 갱신 (기본 파이프라인)
- 에픽 개발 요청 시 포함된 신규 요구사항 또는 변경사항을 전체 검토합니다.
- 해당 요구사항이 기존 로직/스펙과 충돌하지 않는지 체크합니다.
- 연관된 Epic 및 Task 명세서에 변경된 범위와 세부 항목을 선제적으로 반영 갱신합니다.

### Step 3. 소스 코드 수술적 구현 (Surgical Code Development)
- `TASK-xxx.md` 세부 구현 항목에 맞춰 백엔드(`server.js` 등) 및 프론트엔드(`App.jsx` 등) 소스 코드를 최소·수술 단위로 구현합니다.
- Gemini 3.5 Flash 고정, 'Feedback' 용어 준수, BigQuery/Dataplex 세이프가드 규칙을 엄격히 준수합니다.

### Step 4. 로컬 기능 검증 및 자율 수복 (Local Testing)
- 로컬 웹 API (Port 3003) 및 React UI 컴포넌트 렌더링/동작 검증을 수행합니다.
- 에러 발생 시 원인을 파악하여 소스 코드를 자율 수복합니다.

### Step 5. `prod.md` 마스터 매트릭스 및 가이드 동기화
- 최상위 마스터 문서 **`prod.md`**의 **Epic-Task 매트릭스 표** 및 진행 상태(COMPLETED 등)를 갱신합니다.
- 변경된 UI/UX 및 기능 스펙을 `DESIGN.md`, `DEVELOPER_GUIDE.md`, `USER_GUIDE.md` 문서에 동기화합니다.

---

## 💡 실행 예시 (Example Output)
```markdown
🎯 1. Target Tracking: EPIC-002 ➔ TASK-002 (BigQuery Harvester) 매핑 추적 완료
📝 2. Requirements & Doc Update: EPIC-002 & TASK-002 세부 기능 스펙 갱신 완료
💻 3. Code Implementation: backend /api/verify-okf & frontend App.jsx 유효기간(1년/3년/영구) 컨트롤 개발 완료
🧪 4. Local Test & Verification: 3003 포트 API 헬스체크 및 Approve 모달 동작 검증 완수
🚀 5. Master Sync: prod.md 매트릭스, DESIGN.md & DEVELOPER_GUIDE.md 동기화 완료
```
