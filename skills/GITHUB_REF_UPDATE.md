---
name: github-ref-update
description: references/ 폴더 내 외부 GitHub 레포지토리 및 레퍼런스 코드를 최신 upstream 코드로 동기화 및 갱신하는 스킬
---

# 🔄 GitHub Reference Update Workflow Skill

본 스킬은 **"깃헙 레퍼런스 업데이트 해줘"** 또는 **"/github-ref-update"** 지시 시, `references/` 디렉토리 하위에 포함된 외부 GitHub 레포지토리 및 레퍼런스 폴더(예: `google/adk-python`, `knowledge-catalog`, `okf_templates` 등)의 원본 업스트림(Upstream) 변경 사항을 조회하고 최신 신규 코드로 갱신(Update)하는 워크플로우 스킬입니다.

---

## 🎯 스킬 발동 조건 (Trigger Keywords)
- **"/github-ref-update"**
- **"깃헙 레퍼런스 업데이트 해줘"**, **"레퍼런스 레포지토리 갱신해줘"**, **"외부 레퍼런스 코드 최신화해줘"**

---

## 📋 표준 워크플로우 수행 절차 (Execution Steps)

### Step 1. 레퍼런스 디렉토리 및 업스트림 상태 스캔 (Scan References)
- `references/` 및 `references/README.md` 내에 등록된 외부 GitHub 레포지토리 목록을 스캔합니다.
- 대상 폴더:
  - `references/knowledge-catalog/` (Google Cloud OKF 및 Dataplex Agent 샘플)
  - `references/knowledge-catalog/okf/` (`google/adk-python` 기반 OKF 템플릿)
  - 기타 `references/` 하위 외부 Git 저장소 및 사양 폴더

### Step 2. Upstream 최신 커밋 / 릴리스 변경 사항 조회 (Fetch Updates)
- Git Submodule 또는 Git Remote가 설정된 경우 `git fetch` / `git log` 명령으로 최신 릴리스 및 변경 사항을 확인합니다.
- 원본 레포지토리(예: `https://github.com/google/adk-python` 등)의 최신 릴리스 타겟 및 커밋 변경 내역을 수집합니다.

### Step 3. 신규 코드로 레퍼런스 갱신 (Update Reference Files)
- Git 저장소인 경우 `git pull origin main` 또는 Submodule 업데이트 (`git submodule update --remote`) 수행.
- 스크립트 또는 가져온 템플릿 코드 파일인 경우 최신 파이썬/마크다운 명세 구조로 동기화 갱신합니다.

### Step 4. 프로젝트 호환성 & 회귀 검증 (Regression & Compatibility Check)
- 갱신된 레퍼런스 코드/명세가 현재 프로젝트 소스(`srcs/src/`, `srcs/server.js`) 및 OKF v0.2 스펙과 충돌하지 않는지 검증합니다.
- `npm run build`를 실행하여 렌더링 및 번들링 붕괴(White Screen Crash) 여부를 재귀 검증합니다.

### Step 5. 레퍼런스 문서 (`references/README.md`) & 변경 이력 최신화 (Documentation Update)
- `references/README.md`에 갱신된 레퍼런스의 버전, 최신 커밋 ID 또는 갱신 일자(Timestamp)를 업데이트합니다.
- 개발자 가이드(`DEVELOPER_GUIDE.md`)에 레퍼런스 최신 갱신 내역을 동기화 기록합니다.

---

## 💡 실행 예시 (Example Output)
```markdown
🔍 1. references/ 하위 외부 GitHub 레포지토리 스캔 완료 (google/adk-python, knowledge-catalog)
📥 2. Upstream 변경 사항 조회 완료 (최신 커밋/릴리스 확인)
🔄 3. 레퍼런스 폴더 신규 코드로 갱신 완료 (references/knowledge-catalog 최신화)
🧪 4. 프로젝트 호환성 & npm run build 검증 완료 (Build Succeeded in 85ms)
📝 5. references/README.md & DEVELOPER_GUIDE.md 문서 동기화 업데이트 완료
```
