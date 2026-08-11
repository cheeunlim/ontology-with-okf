---
name: local-test-and-deploy
description: 로컬 백엔드/프론트엔드 자동 검증, 헬스체크 및 GCP Cloud Run 배포 파이프라인 일괄 실행 스킬
---

# 🚀 Local Test & Cloud Run Deploy Workflow Skill

본 스킬은 **"로컬에서 테스트해줘"** 또는 **"서버에 배포해줘"**라는 유저의 운용 명령어에 응답하여, 백엔드/프론트엔드 빌드 검증, API 헬스체크, 무중단 자동 재기동 및 GCP Cloud Run 배포까지의 절차를 자동으로 패키징하여 수행하는 스킬입니다.

---

## 🎯 스킬 발동 조건 (Trigger Keywords)
- **"/local-test"**, **"로컬 테스트 수행해줘"**, **"서버 헬스체크해줘"**
- **"/cloud-deploy"**, **"Cloud Run에 배포해줘"**, **"프로덕션 배포해줘"**

---

## 📋 업무 단계별 실행 지침

### 🧪 Phase 1. 기능 위주 로컬 테스트 및 브라우저 검증 ("로컬 테스트 해줘")

1. **Step 1. 최근 반영 기능 체크리스트 작성 (Feature Checklist)**
   - 최근 수정/구현된 소스 코드(`srcs/src/`, `server.js` 등) 및 Task 변경 이력을 분석하여 이번 테스트에서 집중 검증할 **신규/변경 기능 리스트**를 작성합니다.

2. **Step 2. 빌드 및 백엔드/ADK 헬스체크**
   - 프론트엔드 컴파일 빌드 (`cd srcs && npm run build`) 검증.
   - 백엔드 3003 API 및 ADK 8085 서버 응답 확인 (서버 미구동 시 `bash start_server.sh` 자동 수복 실행).

3. **Step 3. 브라우저 구동 및 반영 기능 실시간 조작/체크 (Browser Automation)**
   - 실제 브라우저(`browser_subagent` 도구)를 구동하여 `http://localhost:3003/` 접속.
   - Step 1에서 작성한 **반영 기능 리스트 항목을 하나씩 순서대로 클릭/조작하면서 화면 렌더링 및 응답 결과**를 직접 체크합니다.

4. **Step 4. 에러 & 의도 불일치 시 개발 업데이트 및 재테스트 (Auto-Fix & Iterative Dev)**
   - 콘솔 에러, React 백화 현상, API 오류 또는 의도와 다른 동작/디자인 발견 시, **즉각 관련 소스 코드를 수정(개발 업데이트 반영)**합니다.
   - 코드 수정 후 브라우저를 재로딩하여 정상 동작할 때까지 재테스트 루프를 수행합니다.

5. **Step 5. 결과 리포트 및 세이프가드 수칙 검증**
   - 최근 기능 반영 체크리스트 통과 여부 및 방어적 수칙(BQ View Fallback, Dataplex 캐시, Gemini 3.5 Flash 고정 등) 검증 완료 리포트 출력.

### ☁️ Phase 2. Cloud Run 배포 파이프라인 ("서버에 배포해줘")
1. **GCP 인증 및 프로젝트 설정 확인**: `gcloud config get-value project`
2. **Artifact Registry Docker 이미지 빌드 및 푸시**:
   - `docker build -t us-central1-docker.pkg.dev/<PROJECT_ID>/okf-repo/okf-omni:latest .`
   - `docker push us-central1-docker.pkg.dev/<PROJECT_ID>/okf-repo/okf-omni:latest`
3. **Cloud Run 배포 실행**:
   - `gcloud run deploy okf-omni --image ... --port 3003 --memory 2Gi --cpu 2`
4. **배포 후 라이브 URL 접속 헬스체크**: 라이브 Demo URL (https://okf-omni-924723860007.us-central1.run.app/) 200 OK 수신 검증

---

## 💡 실행 예시 (Example Output)
```markdown
📋 1. 최근 반영 기능 체크리스트 작성 완료 (GQL Graph Explorer 탭 렌더링 및 에지 시각화)
⚡ 2. Vite 빌드 및 백엔드 (Port 3003) 헬스체크 200 OK
🌐 3. 브라우저 구동 완료 (http://localhost:3003 접속하여 반영 기능 리스트 하나씩 조작/체크)
🔧 4. 에러 자동 수복: GQL query null 에러 발견 ➔ 백엔드 server.js 파싱 로직 수복 후 재테스트 성공
✅ 5. 로컬 테스트 및 개발 업데이트 완료
```
