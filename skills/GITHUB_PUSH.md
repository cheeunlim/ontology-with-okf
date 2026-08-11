---
name: github-push
description: 코드 정돈, 템프 파일 청소, Gemini API 키 노출 점검, 깃헙 구조 확인 및 GitHub Push 수행 스킬
---

# 🐙 GitHub Push & Deployment Workflow Skill

본 스킬은 **"GitHub에 배포해줘"** 또는 **"/github-push"** 지시 시, 소스 코드 내 불필요한 요소 정돈, 템프 파일 삭제, **Gemini API 키 및 민감 시크릿 노출 방지 보안 점검**을 완료한 후, GitHub 저장소로 안전하게 Push를 진행하는 배포 워크플로우 스킬입니다.

---

## 🎯 스킬 발동 조건 (Trigger Keywords)
- **"/github-push"**
- **"GitHub에 배포해줘"**, **"깃헙 코드 커밋하고 푸시해줘"**, **"GitHub 업데이트해줘"**

---

## 📋 표준 워크플로우 수행 절차 (Execution Steps)

### Step 1. 코드 정돈 & 불필요한 영역 점검 (Code Cleaning)
- 소스 코드(`srcs/src/`, `server.js` 등) 전체를 점검하여 디버그용 `console.log` 잔여물, 미사용 함수/주석 및 불필요하게 추가된 테스트 코드를 정리합니다.

### Step 2. 임시/템프 파일 정구 & `.gitignore` 검증 (Temp File Cleanup)
- `.DS_Store`, `*.log`, `scratch/` 임시 캐시, `.env` 및 `node_modules` 등 깃에 포함되지 말아야 할 템프 파일 삭제 및 `.gitignore` 설정 상태를 점검합니다.
- `git status`를 실행하여 깃에 포함될 변경 파일 목록을 확인합니다.

### Step 3. 🚨 보안 점검 - Gemini API 키 & 시크릿 노출 Audit (Security Audit)
- 소스 코드, 프롬프트, Markdown 문서 내에 **Gemini API Key (`AIza...`)**, GCP 서비스 계정 키, 인증 토큰 등이 하드코딩되었는지 전수 스캔합니다.
- API Key는 오직 환경변수(`process.env.GEMINI_API_KEY`)를 통해서만 주입되도록 보장합니다.

### Step 4. 기존 GitHub 리포지토리 구조 정합성 체크 (Repo Structure Audit)
- `git remote -v` 및 `git branch`를 조회하여 리포지토리 연결 상태를 확인합니다.
- 프로젝트 표준 구조(`srcs/`, `documents/`, `references/`, `SKILL.md`, `prod.md` 등)의 일관성이 유지되고 있는지 검증합니다.

### Step 5. Git 커밋 및 GitHub Push 실행 (Commit & Push)
1. 변경 사항 스테이징: `git add .`
2. 직관적인 커밋 메시지 작성: `git commit -m "feat: [기능 명칭] 및 문서 동기화"`
3. GitHub 푸시 실행: `git push origin main` (또는 해당 작업 브랜치)

> [!IMPORTANT]
> **터미널 실행 권한 제한으로 에이전트가 Push 명령을 직접 완료하지 못하는 경우**, 사용자가 터미널에서 즉시 복사하여 실행할 수 있는 명령어 스크립트를 명확히 제시합니다:
> ```bash
> git add .
> git commit -m "feat: [기능 명칭] 및 스킬/문서 동기화"
> git push origin main
> ```

---

## 💡 실행 예시 (Example Output)
```markdown
🧹 1. 불필요한 코드 & 디버그 로그 정돈 완료
🗑️ 2. .DS_Store 및 임시 캐시 파일 정단 완료 (.gitignore 정상)
🔒 3. 보안 점검 완료: Gemini API 키 하드코딩 없음 (환경변수 주입 보장)
📂 4. GitHub 저장소 구조 정합성 검증 완료 (srcs/ 격리 및 master SKILL.md 정상)
🚀 5. GitHub Push 실행 완료 (git push origin main)
```
