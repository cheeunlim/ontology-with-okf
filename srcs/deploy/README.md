# 🚀 Cloud Run & Container Deployment Guide

이 폴더는 Google Cloud Run 및 컨테이너 환경 배포를 위한 설정 파일들을 보관합니다.

- `Dockerfile`: Node.js 20 + Google Cloud SDK(gcloud) 통합 배포 컨테이너 이미지 빌드 명세.
- `.dockerignore`: 컨테이너 빌드 시 제외할 로컬 파일 목록.
- `.gcloudignore`: Cloud Build 및 Cloud Run 업로드 시 제외할 파일 목록.

### Cloud Run 배포 명령어 예시:
```bash
gcloud run deploy okf-omni \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="YOUR_KEY"
```
