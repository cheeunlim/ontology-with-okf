/**
 * Google Cloud Platform (GCP) Connectors & Automation Tools
 * 
 * 본 모듈은 BigQuery 및 GCS 연동 클라이언트를 초기화하고,
 * GCS 파일 업로드, 다운로드, 변경 이력(log.md) 기록, 목차 자동 빌드(index.md) 등
 * 전반적인 클라우드 리소스 물리 I/O 작업을 캡슐화합니다.
 */

import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

/**
 * BigQuery 클라이언트 초기화
 */
export function getBigQueryClient(projectId) {
  return new BigQuery({ projectId });
}

/**
 * GCS Storage 클라이언트 초기화
 */
export function getGcsClient() {
  return new Storage();
}

/**
 * 프로젝트 전용 GCS 버킷 획득 또는 신규 생성 (okf-omni-[project-id])
 */
export async function getOrCreateBucket(projectId) {
  const storage = getGcsClient();
  const bucketName = `okf-omni-${projectId.toLowerCase()}`;
  const bucket = storage.bucket(bucketName);
  try {
    const [exists] = await bucket.exists();
    if (!exists) {
      console.log(`Creating GCS bucket: ${bucketName}`);
      await storage.createBucket(bucketName, {
        location: 'US', // 기본 미국 멀티리전 설정
      });
    }
  } catch (err) {
    console.warn(`Warning checking/creating bucket ${bucketName}:`, err.message || err);
  }
  return bucket;
}

/**
 * 단일 파일을 GCS에 업로드
 */
export async function uploadFileToGcs(bucket, localFilePath, destinationPath) {
  console.log(`Uploading ${localFilePath} to gs://${bucket.name}/${destinationPath}`);
  await bucket.upload(localFilePath, {
    destination: destinationPath,
    metadata: {
      cacheControl: 'no-cache',
    }
  });
}

/**
 * 특정 로컬 디렉토리를 재귀적으로 GCS 버킷에 업로드
 */
export async function uploadDirectoryToGcs(bucket, localDir, gcsPrefix = '') {
  const files = fs.readdirSync(localDir);
  for (const file of files) {
    const localPath = path.join(localDir, file);
    const gcsPath = path.join(gcsPrefix, file);
    const stat = fs.statSync(localPath);
    if (stat.isDirectory()) {
      await uploadDirectoryToGcs(bucket, localPath, gcsPath);
    } else {
      await uploadFileToGcs(bucket, localPath, gcsPath);
    }
  }
}

/**
 * GCS 파일 내용 조회 (텍스트 스트링 반환)
 */
export async function readFileFromGcs(bucket, filePath) {
  const file = bucket.file(filePath);
  try {
    const [exists] = await file.exists();
    if (!exists) return null;
    const [content] = await file.download();
    return content.toString('utf8');
  } catch (err) {
    console.error(`Error reading gs://${bucket.name}/${filePath}:`, err);
    return null;
  }
}

/**
 * GCS 내 데이터셋별 격리된 log.md 파일에 변경 이력을 시간 역순으로 기록
 */
export async function appendToGcsLog(bucket, datasetId, entryText) {
  const logFile = bucket.file(`${datasetId}/log.md`);
  let logContent = '';
  try {
    const [exists] = await logFile.exists();
    if (exists) {
      const [content] = await logFile.download();
      logContent = content.toString('utf8');
    } else {
      logContent = `# OKF 지식 번들 변경 이력 (Change Log)\n\n`;
    }

    const today = new Date().toISOString().split('T')[0];
    const newEntry = `## ${today}\n* ${entryText}\n\n`;

    // 최상단(타이틀 줄바꿈 직후)에 새 로그 항목 추가
    const titleEndIdx = logContent.indexOf('\n\n');
    if (titleEndIdx !== -1) {
      logContent = logContent.substring(0, titleEndIdx + 2) + newEntry + logContent.substring(titleEndIdx + 2);
    } else {
      logContent += newEntry;
    }

    await logFile.save(logContent, {
      metadata: { contentType: 'text/markdown', cacheControl: 'no-cache' }
    });
    console.log(`Successfully updated log.md for dataset: ${datasetId}`);
  } catch (err) {
    console.error(`Error updating log.md on GCS for ${datasetId}:`, err);
  }
}

/**
 * GCS 내 특정 데이터셋의 파일을 스캔하여 index.md (디렉토리 목록 카탈로그) 동적 갱신
 */
export async function updateGcsIndex(bucket, datasetId) {
  const indexFile = bucket.file(`${datasetId}/index.md`);
  try {
    // 데이터셋 폴더 내의 모든 파일을 리스팅
    const [files] = await bucket.getFiles({ prefix: `${datasetId}/` });
    
    // index.md와 log.md는 일반 개념 문서 리스트에서 필터링 제외
    const filePaths = files
      .map(f => f.name)
      .filter(name => name !== `${datasetId}/index.md` && name !== `${datasetId}/log.md`);

    const folders = {};
    const rootFiles = [];

    filePaths.forEach(filePath => {
      const relativePath = filePath.substring(datasetId.length + 1); // "datasetId/" 제거
      if (relativePath.includes('/')) {
        const parts = relativePath.split('/');
        const folderName = parts[0];
        const fileName = parts.slice(1).join('/');
        if (!folders[folderName]) folders[folderName] = [];
        if (fileName) folders[folderName].push(fileName);
      } else {
        if (relativePath) rootFiles.push(relativePath);
      }
    });

    let indexContent = `# ${datasetId} 온톨로지 지식 번들 색인 (Index)\n\n`;
    indexContent += `본 문서는 \`${datasetId}\` 지식 번들에 포함된 모든 테이블 명세서 및 비정형 개념 위키의 카탈로그 색인입니다.\n\n`;

    // 하위 폴더별 렌더링 (예: tables/, wiki/)
    for (const [folder, folderFiles] of Object.entries(folders)) {
      indexContent += `## 📂 ${folder}/\n`;
      folderFiles.forEach(file => {
        const cleanName = file.replace(/\.md$/, '');
        indexContent += `* [${cleanName}](./${folder}/${file})\n`;
      });
      indexContent += `\n`;
    }

    // 루트 폴더 기본 파일 렌더링
    if (rootFiles.length > 0) {
      indexContent += `## 📄 기본 지식 문서 (Root Concepts)\n`;
      rootFiles.forEach(file => {
        const cleanName = file.replace(/\.md$/, '');
        indexContent += `* [${cleanName}](./${file})\n`;
      });
      indexContent += `\n`;
    }

    indexContent += `---\n*마지막 갱신 시각: ${new Date().toISOString()}*`;

    await indexFile.save(indexContent, {
      metadata: { contentType: 'text/markdown', cacheControl: 'no-cache' }
    });
    console.log(`Successfully updated index.md for dataset: ${datasetId}`);
  } catch (err) {
    console.error(`Error updating index.md on GCS for ${datasetId}:`, err);
  }
}
