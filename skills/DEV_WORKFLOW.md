---
name: okf-dev-workflow
description: OKF Omni 프로젝트의 개발 수칙 준수, 로컬 헬스체크, 5대 규칙 검증 및 가이드 문서 자동 동기화 스킬
---

# 🚀 OKF Omni Standard Development & Ops Workflow Skill

본 스킬은 **OKF Omni (Ontology with OKF)** 프로젝트 개발 시, 유저가 매번 길게 가이드라인이나 5대 개발 수칙을 설명하지 않아도 에이전트가 단일 키워드 또는 작업 시작/완료 시점에 자동 발동하여 표준 워크플로우를 완벽히 이행하도록 돕는 커스텀 스킬입니다.

---

## 🎯 스킬 발동 조건 (Trigger Conditions)
- 사용자가 **"개발 수칙 점검해줘"**, **"서버 헬스체크 및 문서 동기화해줘"**, **"/dev-check"**, **"QA 검증 수행해줘"** 등을 입력할 때
- 신규 기능 구현 직후 메인 플로우 재귀 테스트 및 가이드 문서 업데이트 상태를 일괄 검증할 때

---

## 📋 핵심 체크리스트 & 자동화 지침

### 1. 🧠 사전 수칙 및 SSOT 검증 (Think & Single Source of Truth)
- [ ] AI 모델이 **`gemini-3.5-flash`**로 고정되어 있는지 확인 (`srcs/src/agents/geminiAgent.js`)
- [ ] 모든 Gemini 프롬프트가 **`prompts/agentPrompts.js`** 단일 파일에서 수집/관리되는지 점검
- [ ] 용어 규칙 준수: **'회류' 단어 사용 엄격 금지**, 반드시 **'Feedback'** 또는 **'피드백'**으로 표기

### 2. 🛡️ 방어적 프로그래밍 수칙 검증 (Defensive Safe-guards)
- [ ] **BigQuery VIEW 개체 예외 처리**: `table.getRows()` 400 에러 대비 Direct SQL Fallback / default값 반환 확인
- [ ] **Dataplex CLI 지연 차단**: 3초 타임아웃 및 10분 TTL 인메모리 캐시(`global.dataplexScanCache`) 유지
- [ ] **Data Agent 쿼리 Auto-Retry**: GQL/SQL 예약어 백틱(\`) 감싸기 및 자동 수복 재시도 1회 루프 포함
- [ ] **React Safe-Guard**: `activeGraph?.ddl || ''` 세이프 체크를 통한 White Screen Crash 방지

### 3. ⚡ 로컬 서버 헬스체크 & 자동 재기동
```bash
# 백엔드 API 게이트웨이 (Port 3003) 헬스체크
curl -s http://localhost:3003/api/datasets

# 필요 시 센티널 무중단 스크립트 실행
cd srcs && bash start_server.sh
```

### 4. 📚 가이드 문서 자동 동기화 (Documentation Sync)
코드 변경 사항이 발생하면 즉시 아래 4개 가이드 문서에 변경 반영 필요 여부를 검토하고 갱신합니다.
1. `README.md` (프로젝트 개요 및 외부 레퍼런스 표)
2. `documents/02_guidelines/DEVELOPER_GUIDE.md` (개발자 API 라우트 및 아키텍처)
3. `documents/02_guidelines/USER_GUIDE.md` (사용자 UI 사용법)
4. `DESIGN.md` (5대 메인 탭 및 디자인 토큰 변경 로그)

---

## 🛠️ 실행 명령 숏컷 (Quick Script Reference)
```bash
# 1. API 서버 3003 응답 확인
curl -I http://localhost:3003/

# 2. ADK Python Dev UI (8085) 확인
curl -I http://127.0.0.1:8085/
```
