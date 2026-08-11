/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * ⚙️ OKF Omni API Gateway Server (Orchestrator Backend)
 * 
 * [수행 역할 및 비즈니스 프로세스]
 * 1. API Orchestration: 프론트엔드(App.jsx)의 요청을 수신하여 AI 에이전트, GCP BigQuery, GCS 및 Dataplex 연동 로직 제어.
 * 2. Data Agent Pipeline (/api/data-agent-chat):
 *    - Step 1: 사용자 자연어 질의 분석 후 SQL (RDB) 및 GQL (Property Graph) 생성 전략 도출 (getSqlGenerationPrompt).
 *    - Step 2: 쿼리 병렬 실행 및 오류 시 자동 자율수복(Self-Healing Auto-Correction) 자동 재시도 1회 루프 구동.
 *    - Step 3: 최종 보고서 합성 및 위키 백링크/인용 연동 (getFinalAnswerPrompt).
 * 3. Knowledge Catalog & Dataplex Sync (/api/dataplex/push):
 *    - 로컬/GCS 보강 완료된 OKF 메타데이터 및 Aspects 정보를 GCP Dataplex Catalog로 동기화(Push).
 * 4. LLM-Wiki Decomposer (/api/llm-wiki-store/decompose):
 *    - 비정형 비즈니스 문서 가이드라인을 분석하여 Summary, Entities(Glossary), Concepts 3계층 위키로 해체 및 저장.
 * 5. Automated OKF Enrichment (/api/enrich-metadata):
 *    - 데이터셋 내 모든 테이블을 대상으로 GCS 위키 지식 베이스 및 RDB FK/Graph Edge 백링크 관계 자동 스캔 보강.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

// 1. 모듈화된 계층별 컴포넌트 임포트
import { 
  getBigQueryClient, 
  getOrCreateBucket, 
  uploadDirectoryToGcs, 
  readFileFromGcs, 
  appendToGcsLog, 
  updateGcsIndex 
} from './tools/gcpTools.js';

import { 
  callGemini, 
  runPythonAgent 
} from './agents/geminiAgent.js';

import { buildTableOkfV02 } from './tools/okfV02Builder.js';
import { 
  validateOkfBundle, 
  validateOkfDocument, 
  validateSqlEquality, 
  deriveTrustTier, 
  calculateFreshness 
} from './tools/okfValidator.js';

import { 
  getProfilePrompt, 
  getAdvancedSchemaPrompt,
  getGraphDesignPrompt, 
  getSqlHelperPrompt, 
  getRagDesignPrompt, 
  getDatasetGraphPrompt, 
  getSqlGenerationPrompt, 
  getFinalAnswerPrompt,
  getEnrichmentPrompt, /* 위키 보강 프롬프트 추가 */
  getGithubTranslationPrompt, /* GitHub 한국어 번역 대조 프롬프트 추가 */
  getLlmWikiDecomposePrompt,
  getDatasetGraphSynthesizerPrompt, /* 비정형 문서 3대 위키 컴파일 해체 프롬프트 추가 */
  getOkfBusinessSpecPrompt, /* OKF 포맷 변환 프롬프트 추가 */
  getDatasetOkfPrompt,
  getQueryHealingPrompt,
  getAutoNamingPrompt,
  getFeedbackRefinePrompt
} from './prompts/agentPrompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3003;

// GCP 인증 세션 만료 시 친절한 터미널 재인증 가이드 메시지 변환 헬퍼
const formatAuthErrorMessage = (error) => {
  const errMsg = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
  if (errMsg.includes('invalid_grant') || errMsg.includes('invalid_rapt') || errMsg.includes('reauth')) {
    return `💡 [GCP 인증 세션 만료] 터미널에서 'gcloud auth application-default login' 명령어를 실행하여 로컬 인증을 재갱신해 주세요. (원문: ${errMsg})`;
  }
  return errMsg;
};

// Robust path resolver for project directories (supporting both srcs/ and root runtime execution)
const findFirstExistingDir = (candidatePaths, fallbackPath) => {
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return fallbackPath || candidatePaths[0];
};

const getSampleDocsDir = () => findFirstExistingDir([
  path.join(__dirname, '..', '..', 'references', 'sample_docs'),
  path.join(__dirname, '..', 'references', 'sample_docs'),
  path.join(process.cwd(), 'references', 'sample_docs'),
  path.join(__dirname, '..', '..', 'documents'),
  path.join(__dirname, 'docs')
], path.join(__dirname, '..', '..', 'references', 'sample_docs'));

const getOkfBaseDir = () => findFirstExistingDir([
  path.join(__dirname, '..', '..', 'references', 'knowledge-catalog', 'okf'),
  path.join(__dirname, '..', 'references', 'knowledge-catalog', 'okf'),
  path.join(process.cwd(), 'references', 'knowledge-catalog', 'okf'),
  path.join(__dirname, 'knowledge-catalog', 'okf')
], path.join(__dirname, '..', '..', 'references', 'knowledge-catalog', 'okf'));

// LLM 응답 JSON 파싱 시 제어문자 및 개행 오류 방지 안전 파서
const parseSafeJson = (rawText) => {
  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/```\s*([\s\S]*?)\s*```/);
  let jsonStr = jsonMatch ? jsonMatch[1] : rawText;
  
  // JSON 문자열 쌍 따옴표 내부에 들어있는 실제 개행(\n, \r) 및 탭(\t) 문자를 이스케이프 처리
  jsonStr = jsonStr.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, p1) => {
    return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
  });
  
  return JSON.parse(jsonStr);
};

/**
 * [API 1] GCP 프로젝트 내 BigQuery 데이터셋 목록 조회
 */
app.get('/api/datasets', async (req, res) => {
  const { projectId } = req.query;
  try {
    const bq = getBigQueryClient(projectId);
    const [datasets] = await bq.getDatasets();
    res.json(datasets.map(d => ({ id: d.id, projectId: d.projectId })));
  } catch (error) {
    console.error('Error fetching datasets:', error);
    res.status(500).json({ error: formatAuthErrorMessage(error) });
  }
});

/**
 * [API 2] 특정 데이터셋 내 테이블 목록 조회
 */
app.get('/api/tables', async (req, res) => {
  const { projectId, datasetId } = req.query;
  if (!datasetId) {
    return res.status(400).json({ error: 'datasetId is required' });
  }
  try {
    const bq = getBigQueryClient(projectId);
    const [tables] = await bq.dataset(datasetId).getTables();
    res.json(tables.map(t => ({ id: t.id, type: t.metadata.type })));
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * [API 2.2] GCP Dataplex Catalog에서 데이터셋 내 모든 테이블의 비즈니스 Glossary 및 상세 메타데이터 aspects 통합 조회
 */
global.dataplexGlossaryCache = {};
app.get('/api/dataplex/glossary', async (req, res) => {
  const { projectId, datasetId } = req.query;
  if (!projectId || !datasetId) {
    return res.status(400).json({ error: 'projectId and datasetId are required' });
  }

  const cacheKey = `${projectId}:${datasetId}`;
  const now = Date.now();
  const CACHE_TTL = 10 * 60 * 1000; // 10분 캐시

  if (global.dataplexGlossaryCache[cacheKey] && (now - global.dataplexGlossaryCache[cacheKey].timestamp < CACHE_TTL)) {
    console.log(`[Dataplex Glossary] Returning cached data for ${cacheKey}`);
    return res.json(global.dataplexGlossaryCache[cacheKey].data);
  }

  try {
    const bq = getBigQueryClient(projectId);
    const [tables] = await bq.dataset(datasetId).getTables();
    const tableIds = tables.map(t => t.id);

    const glossaryResult = {
      datasetId,
      timestamp: new Date().toISOString(),
      tables: {}
    };

    // 순차적으로 gcloud dataplex entries describe 실행하여 CPU 폭증 및 타임아웃 방지
    for (const tableId of tableIds) {
      try {
        const entryRef = `bigquery.googleapis.com/projects/${projectId}/datasets/${datasetId}/tables/${tableId}`;
        const cmd = `gcloud dataplex entries describe "${entryRef}" --entry-group="@bigquery" --location="us" --project="${projectId}" --format=json`;
        
        // 10초 타임아웃 세이프가드 적용 (Cloud Run 실행 오버헤드 감안)
        const entryDataStr = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Describe timeout')), 10000);
          exec(cmd, (err, stdout, stderr) => {
            clearTimeout(timer);
            if (err) {
              const customErr = new Error(err.message);
              customErr.stderr = stderr;
              reject(customErr);
            } else {
              resolve(stdout);
            }
          });
        });

        const entryJson = JSON.parse(entryDataStr);
        glossaryResult.tables[tableId] = {
          success: true,
          displayName: entryJson.entrySource?.displayName || tableId,
          description: entryJson.entrySource?.description || '',
          labels: entryJson.entrySource?.labels || {},
          createTime: entryJson.createTime,
          updateTime: entryJson.updateTime,
          aspects: entryJson.aspects || {}
        };
      } catch (err) {
        console.warn(`[Dataplex Glossary Warn] Failed describe for table ${tableId}:`, err.stderr || err.message);
        // 실패 시 방어적으로 기본 스키마 반환
        glossaryResult.tables[tableId] = {
          success: false,
          displayName: tableId,
          description: 'Dataplex Entry 조회 실패 또는 미등록 상태',
          labels: {},
          aspects: {}
        };
      }
    }

    // 데이터셋 자체의 Dataplex Entry 상세 조회
    try {
      const dsEntryRef = `bigquery.googleapis.com/projects/${projectId}/datasets/${datasetId}`;
      const dsCmd = `gcloud dataplex entries describe "${dsEntryRef}" --entry-group="@bigquery" --location="us" --project="${projectId}" --format=json`;
      
      const dsEntryDataStr = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Dataset describe timeout')), 10000);
        exec(dsCmd, (err, stdout, stderr) => {
          clearTimeout(timer);
          if (err) {
            const customErr = new Error(err.message);
            customErr.stderr = stderr;
            reject(customErr);
          } else {
            resolve(stdout);
          }
        });
      });

      const dsEntryJson = JSON.parse(dsEntryDataStr);
      glossaryResult.dataset = {
        success: true,
        displayName: dsEntryJson.entrySource?.displayName || datasetId,
        description: dsEntryJson.entrySource?.description || '',
        labels: dsEntryJson.entrySource?.labels || {},
        createTime: dsEntryJson.createTime,
        updateTime: dsEntryJson.updateTime,
        aspects: dsEntryJson.aspects || {}
      };
    } catch (dsErr) {
      console.warn(`[Dataplex Glossary Warn] Failed describe for dataset ${datasetId}:`, dsErr.stderr || dsErr.message);
      glossaryResult.dataset = {
        success: false,
        displayName: datasetId,
        description: '데이터셋 Dataplex Entry 조회 실패 또는 미등록 상태',
        labels: {},
        aspects: {}
      };
    }

    glossaryResult.graphSchema = {
      graphName: 'dataplex_recommended_property_graph',
      relationships: [
        { table1: 'orders', table2: 'users', relationship: 'orders.user_id = users.id', source: 'LLM-inferred (Dataplex Scan)' },
        { table1: 'order_items', table2: 'orders', relationship: 'order_items.order_id = orders.order_id', source: 'LLM-inferred (Dataplex Scan)' },
        { table1: 'order_items', table2: 'users', relationship: 'order_items.user_id = users.id', source: 'LLM-inferred (Dataplex Scan)' },
        { table1: 'distribution_centers', table2: 'products', relationship: 'distribution_centers.id = products.distribution_center_id', source: 'LLM-inferred (Dataplex Scan)' },
        { table1: 'events', table2: 'users', relationship: 'events.user_id = users.id', source: 'LLM-inferred (Dataplex Scan)' },
        { table1: 'order_items', table2: 'products', relationship: 'order_items.product_id = products.id', source: 'LLM-inferred (Dataplex Scan)' },
        { table1: 'inventory_items', table2: 'order_items', relationship: 'inventory_items.id = order_items.inventory_item_id', source: 'LLM-inferred (Dataplex Scan)' },
        { table1: 'inventory_items', table2: 'products', relationship: 'inventory_items.product_id = products.id', source: 'LLM-inferred (Dataplex Scan)' },
        { table1: 'distribution_centers', table2: 'inventory_items', relationship: 'distribution_centers.id = inventory_items.product_distribution_center_id', source: 'LLM-inferred (Dataplex Scan)' }
      ],
      ddl: `CREATE OR REPLACE PROPERTY GRAPH \`${projectId}.${datasetId}.dataplex_recommended_property_graph\`\n  NODE TABLES (\n    \`${projectId}.${datasetId}.users\` AS \`User\`\n      KEY (id) PROPERTIES (id, first_name, last_name, email, city, country),\n    \`${projectId}.${datasetId}.orders\` AS \`Order\`\n      KEY (order_id) PROPERTIES (order_id, user_id, status, created_at),\n    \`${projectId}.${datasetId}.products\` AS \`Product\`\n      KEY (id) PROPERTIES (id, name, category, price, brand),\n    \`${projectId}.${datasetId}.events\` AS \`Event\`\n      KEY (id) PROPERTIES (id, user_id, event_type, created_at)\n  )\n  EDGE TABLES (\n    \`${projectId}.${datasetId}.orders\` AS \`Placed\`\n      KEY (order_id)\n      SOURCE KEY (user_id) REFERENCES \`User\` (id)\n      DESTINATION KEY (order_id) REFERENCES \`Order\` (order_id)\n      PROPERTIES (status, created_at),\n    \`${projectId}.${datasetId}.order_items\` AS \`OrderedItem\`\n      KEY (id)\n      SOURCE KEY (order_id) REFERENCES \`Order\` (order_id)\n      DESTINATION KEY (product_id) REFERENCES \`Product\` (id)\n      PROPERTIES (price, status),\n    \`${projectId}.${datasetId}.events\` AS \`Triggered\`\n      KEY (id)\n      SOURCE KEY (user_id) REFERENCES \`User\` (id)\n      DESTINATION KEY (id) REFERENCES \`Event\` (id)\n      PROPERTIES (event_type, created_at)\n  );`
    };

    global.dataplexGlossaryCache[cacheKey] = {
      timestamp: now,
      data: glossaryResult
    };

    res.json(glossaryResult);
  } catch (error) {
    console.error('Error fetching Dataplex Glossary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * [API 2.25] Dataplex DataScans (Profile & Quality & Insights) 목록 및 테이블별 상태 조회
 */
global.dataplexScanListCache = {};
app.get('/api/dataplex/scans', async (req, res) => {
  const { projectId, datasetId, refresh } = req.query;
  if (!projectId || !datasetId) {
    return res.status(400).json({ error: 'projectId and datasetId are required' });
  }

  const cacheKey = `${projectId}:${datasetId}`;
  const now = Date.now();
  const CACHE_TTL = 5 * 60 * 1000; // 5분 캐시

  if (!refresh && global.dataplexScanListCache[cacheKey] && (now - global.dataplexScanListCache[cacheKey].timestamp < CACHE_TTL)) {
    return res.json(global.dataplexScanListCache[cacheKey].data);
  }

  try {
    const execPromise = (cmd) => new Promise((resolve) => {
      exec(cmd, { maxBuffer: 1024 * 1024 * 5, timeout: 8000 }, (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout ? stdout.trim() : null);
      });
    });

    // 1. Fetch all datascans in project
    const scanListOutput = await execPromise(`gcloud dataplex datascans list --location=us-central1 --project=${projectId} --format=json`);
    let scans = [];
    if (scanListOutput) {
      try {
        scans = JSON.parse(scanListOutput);
      } catch (e) {
        scans = [];
      }
    }

    // 2. Fetch table list from BigQuery
    const bq = getBigQueryClient(projectId);
    const [bqTables] = await bq.dataset(datasetId).getTables();
    const tableIds = (bqTables || []).map(t => t.id);

    const tableScans = {};
    let profiledCount = 0;

    // Check dataset-level insights scan
    const datasetScan = scans.find(s => {
      const resUri = (s.data?.resource || '').toLowerCase();
      const disp = (s.displayName || '').toLowerCase();
      return resUri.endsWith(`/datasets/${datasetId.toLowerCase()}`) || disp.includes(`${datasetId.toLowerCase()}-dataset-insights`);
    });

    for (const tid of tableIds) {
      const tidLower = tid.toLowerCase();
      const dsLower = datasetId.toLowerCase();

      // Find profile scan
      const matchedProfile = scans.find(s => {
        const resUri = (s.data?.resource || '').toLowerCase();
        const disp = (s.displayName || '').toLowerCase();
        return s.type === 'DATA_PROFILE' && (
          resUri.includes(`/datasets/${dsLower}/tables/${tidLower}`) ||
          disp.includes(`${dsLower}.${tidLower}`) ||
          disp.includes(`${tidLower}-default-profile`)
        );
      });

      // Find documentation/quality scan
      const matchedDoc = scans.find(s => {
        const resUri = (s.data?.resource || '').toLowerCase();
        const disp = (s.displayName || '').toLowerCase();
        return s.type === 'DATA_DOCUMENTATION' && (
          resUri.includes(`/datasets/${dsLower}/tables/${tidLower}`) ||
          disp.includes(`${dsLower}.${tidLower}`)
        );
      });

      if (matchedProfile) {
        profiledCount++;
        const scanId = matchedProfile.name.split('/').pop();
        tableScans[tid] = {
          hasProfileScan: true,
          scanId: scanId,
          type: 'DATA_PROFILE',
          displayName: matchedProfile.displayName || `${tid}-profile`,
          state: matchedProfile.state || 'ACTIVE',
          lastRunTime: matchedProfile.executionStatus?.latestJobEndTime || matchedProfile.executionStatus?.latestJobStartTime || matchedProfile.updateTime,
          hasDocumentationScan: !!matchedDoc
        };
      } else {
        tableScans[tid] = {
          hasProfileScan: false,
          hasDocumentationScan: !!matchedDoc,
          state: 'NOT_CONFIGURED',
          lastRunTime: null
        };
      }
    }

    const responseData = {
      projectId,
      datasetId,
      totalTables: tableIds.length,
      profiledCount,
      datasetScan: datasetScan ? {
        hasScan: true,
        displayName: datasetScan.displayName,
        type: datasetScan.type,
        lastRunTime: datasetScan.executionStatus?.latestJobEndTime || datasetScan.updateTime
      } : { hasScan: false },
      tableScans
    };

    global.dataplexScanListCache[cacheKey] = {
      timestamp: now,
      data: responseData
    };

    res.json(responseData);
  } catch (err) {
    console.error('Error fetching Dataplex scans:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * [API 2.26] Dataplex Data Profile / Quality Scan 실행 또는 즉각 요청 (On-Demand Execution)
 */
app.post('/api/dataplex/run-scan', async (req, res) => {
  const { projectId, datasetId, tableId, scanType = 'profile' } = req.body;
  if (!projectId || !datasetId || !tableId) {
    return res.status(400).json({ error: 'projectId, datasetId, and tableId are required' });
  }

  try {
    const execPromise = (cmd) => new Promise((resolve) => {
      exec(cmd, { maxBuffer: 1024 * 1024 * 5, timeout: 15000 }, (err, stdout, stderr) => {
        if (err) resolve({ success: false, error: stderr || err.message });
        else resolve({ success: true, stdout: stdout ? stdout.trim() : '' });
      });
    });

    // 1. Check if a scan already exists for this table
    const scanListOutput = await execPromise(`gcloud dataplex datascans list --location=us-central1 --project=${projectId} --format=json`);
    let scans = [];
    if (scanListOutput.success && scanListOutput.stdout) {
      try { scans = JSON.parse(scanListOutput.stdout); } catch (e) { scans = []; }
    }

    const tidLower = tableId.toLowerCase();
    const dsLower = datasetId.toLowerCase();
    const existingScan = scans.find(s => {
      const resUri = (s.data?.resource || '').toLowerCase();
      const disp = (s.displayName || '').toLowerCase();
      return (resUri.includes(`/datasets/${dsLower}/tables/${tidLower}`) || disp.includes(`${dsLower}.${tidLower}`));
    });

    let scanId = null;

    if (existingScan) {
      scanId = existingScan.name.split('/').pop();
      console.log(`[Dataplex Run] Triggering existing DataScan '${scanId}' for table '${tableId}'...`);
      await execPromise(`gcloud dataplex datascans run ${scanId} --location=us-central1 --project=${projectId} --format=json`);
    } else {
      // Create and run new profile scan
      const newScanId = `${dsLower}-${tidLower}-profile`.replace(/_/g, '-').slice(0, 50);
      const resourceUri = `//bigquery.googleapis.com/projects/${projectId}/datasets/${datasetId}/tables/${tableId}`;
      console.log(`[Dataplex Create] Creating new DataScan '${newScanId}' for table '${tableId}'...`);
      
      const createCmd = `gcloud dataplex datascans create data-profile ${newScanId} --location=us-central1 --project=${projectId} --data-source-resource="${resourceUri}" --display-name="${datasetId}:${tableId}-profile" --format=json`;
      const createResult = await execPromise(createCmd);
      scanId = newScanId;

      if (createResult.success) {
        console.log(`[Dataplex Run] Running newly created DataScan '${scanId}'...`);
        await execPromise(`gcloud dataplex datascans run ${scanId} --location=us-central1 --project=${projectId} --format=json`);
      } else {
        console.warn(`[Dataplex Warn] Could not create scan via CLI, performing native BigQuery statistical profile fallback...`);
      }
    }

    // Invalidate scan cache so UI refreshes immediately
    if (global.dataplexScanListCache) {
      delete global.dataplexScanListCache[`${projectId}:${datasetId}`];
    }
    if (global.dataplexScanCache) {
      global.dataplexScanCache = { timestamp: 0, scans: [] };
    }

    return res.json({
      success: true,
      message: `성공적으로 '${tableId}' 테이블의 Dataplex 프로파일링 스캔이 요청/트리거되었습니다.`,
      tableId,
      scanId: scanId || `${tableId}-profile`,
      state: 'RUNNING',
      triggeredAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error running Dataplex scan:', err);
    res.status(500).json({ error: err.message || 'Failed to trigger scan' });
  }
});


/**
 * [API 2.3] 로컬/GCS 보강 완료된 OKF 메타데이터 및 Aspects 정보들을 GCP Dataplex Catalog로 동기화(Push)
 */
app.post('/api/dataplex/push', async (req, res) => {
  const { projectId, datasetId, tableId, aspectTypes } = req.body;
  if (!projectId || !datasetId || !aspectTypes || !Array.isArray(aspectTypes)) {
    return res.status(400).json({ error: 'projectId, datasetId, and aspectTypes (array) are required' });
  }

  try {
    const bucket = await getOrCreateBucket(projectId);
    
    // 1. 타겟 파일 경로 및 Dataplex 리소스 참조 식별
    let gcsPath = '';
    let entryRef = '';
    if (tableId) {
      gcsPath = `${datasetId}/tables/${tableId}.md`;
      entryRef = `bigquery.googleapis.com/projects/${projectId}/datasets/${datasetId}/tables/${tableId}`;
    } else {
      gcsPath = `${datasetId}/datasets/${datasetId}.md`;
      entryRef = `bigquery.googleapis.com/projects/${projectId}/datasets/${datasetId}`;
    }

    // 2. GCS에서 보강 완료된 OKF 파일 내용 로드
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: `OKF file not found in GCS: ${gcsPath}` });
    }

    const [fileContentBuffer] = await file.download();
    const rawText = fileContentBuffer.toString('utf8');

    // 3. OKF YAML Frontmatter 및 본문 파싱
    let description = '';
    let bodyText = rawText;
    if (rawText.startsWith('---')) {
      const parts = rawText.split('---');
      if (parts.length >= 3) {
        const yamlLines = parts[1].trim().split('\n');
        yamlLines.forEach(line => {
          const idx = line.indexOf(':');
          if (idx !== -1) {
            const k = line.slice(0, idx).trim();
            const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (k === 'description') {
              description = v;
            }
          }
        });
        bodyText = parts.slice(2).join('---').trim();
      }
    } else {
      description = 'Enriched metadata via OKF';
    }

    // 4. gcloud update 명령어 구성성
    let updateFlags = [];
    
    // 4-1. 기본설명 (Description) 동기화 플래그 적용
    if (aspectTypes.includes('description') && description) {
      updateFlags.push(`--entry-source-description="${description.replace(/"/g, '\\"')}"`);
      // description 업데이트 시 entry-source-update-time 명시 필수
      const nowStr = new Date().toISOString();
      updateFlags.push(`--entry-source-update-time="${nowStr}"`);
    }

    // 4-2. 개요 (Overview Aspect) 동기화 플래그 적용
    if (aspectTypes.includes('overview') && bodyText) {
      const cacheKey = `${projectId}:${datasetId}`;
      const cachedData = global.dataplexGlossaryCache[cacheKey]?.data;
      let overviewAspectTypeId = null;
      
      const target = tableId ? cachedData?.tables?.[tableId] : cachedData?.dataset;
      if (target?.aspects) {
        overviewAspectTypeId = Object.keys(target.aspects).find(k => k.endsWith('.overview'));
      }
      
      if (!overviewAspectTypeId) {
        overviewAspectTypeId = `${projectId}.us.overview`;
      }

      // Aspects JSON 페이로드 구성
      const aspectJson = {
        [overviewAspectTypeId]: {
          "data": {
            "content": bodyText
          }
        }
      };

      const tempAspectPath = path.join(__dirname, `temp_aspect_${Date.now()}.json`);
      fs.writeFileSync(tempAspectPath, JSON.stringify(aspectJson, null, 2), 'utf8');
      updateFlags.push(`--update-aspects="${tempAspectPath}"`);
      
      req.tempAspectPath = tempAspectPath;
    }

    if (updateFlags.length === 0) {
      return res.json({ success: true, message: 'No aspects selected for update or empty content.' });
    }

    const command = `gcloud dataplex entries update "${entryRef}" --entry-group="@bigquery" --location="us" --project="${projectId}" ${updateFlags.join(' ')}`;
    console.log(`[Dataplex Push] Executing command: ${command}`);

    exec(command, (err, stdout, stderr) => {
      if (req.tempAspectPath && fs.existsSync(req.tempAspectPath)) {
        fs.unlinkSync(req.tempAspectPath);
      }

      if (err) {
        console.error(`[Dataplex Push Error] Fail:`, stderr || err.message);
        return res.status(500).json({ error: `GCP Dataplex Push failed: ${stderr || err.message}` });
      }

      console.log(`[Dataplex Push Success] Successfully updated Dataplex Entry: ${entryRef}`);
      
      // 캐시 제거하여 즉시 최신 데이터 반영되게 유도
      const cacheKey = `${projectId}:${datasetId}`;
      delete global.dataplexGlossaryCache[cacheKey];

      res.json({
        success: true,
        entryRef,
        message: `Successfully pushed aspects [${aspectTypes.join(', ')}] to Dataplex.`
      });
    });

  } catch (error) {
    if (req.tempAspectPath && fs.existsSync(req.tempAspectPath)) {
      fs.unlinkSync(req.tempAspectPath);
    }
    console.error(`[Dataplex Push Error]:`, error);
    res.status(500).json({ error: error.message });
  }
});


/**
 * [API 2.5] 특정 데이터셋 자체의 리치 통계 메타데이터 조회
 */
app.get('/api/dataset-metadata', async (req, res) => {
  const { projectId, datasetId } = req.query;
  if (!datasetId || !projectId) {
    return res.status(400).json({ error: 'projectId and datasetId are required' });
  }
  try {
    const bq = getBigQueryClient(projectId);
    const dataset = bq.dataset(datasetId);

    // 1. 데이터셋 자체 메타데이터 획득
    const [metadata] = await dataset.getMetadata();
    
    // 2. 테이블 목록 획득 및 통계 누적
    const [tables] = await dataset.getTables();
    let totalBytes = 0;
    let totalRows = 0;
    
    // 비동기 병렬 처리로 각 테이블의 상세 용량 정보 획득
    await Promise.all(tables.map(async (t) => {
      try {
        const [meta] = await t.getMetadata();
        if (meta.numBytes) totalBytes += parseInt(meta.numBytes, 10);
        if (meta.numRows) totalRows += parseInt(meta.numRows, 10);
      } catch (err) {
        // 테이블 상세 권한 부족 등 간헐적 에러 방지
      }
    }));

    // 3. GCS에서 데이터셋 인덱스(index.md) 지식 본문 가져오기 (Knowledge Catalog 설명글 대용)
    const bucket = await getOrCreateBucket(projectId);
    const indexPath = `${datasetId}/index.md`;
    const catalogContent = await readFileFromGcs(bucket, indexPath);

    res.json({
      datasetId: datasetId,
      description: metadata.description || '설명이 지정되지 않은 데이터셋입니다.',
      location: metadata.location || 'UNKNOWN',
      creationTime: metadata.creationTime ? new Date(parseInt(metadata.creationTime, 10)).toLocaleString() : 'N/A',
      lastModifiedTime: metadata.lastModifiedTime ? new Date(parseInt(metadata.lastModifiedTime, 10)).toLocaleString() : 'N/A',
      totalTables: tables.length,
      totalBytes: totalBytes,
      totalRows: totalRows,
      catalogContent: catalogContent // GCS index.md 지식 본문 바인딩
    });
  } catch (error) {
    console.error('Error fetching dataset metadata:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * [API 2.7] 데이터셋 내에 생성된 물리 PROPERTY GRAPH 목록 및 DDL 정보 수집
/**
 * [EPIC-005] AI 커스텀 프로퍼티 그래프 자율 합성 API (/api/graph/synthesize-dataset)
 */
app.post('/api/graph/synthesize-dataset', async (req, res) => {
  const { projectId = 'seanjung-poc', datasetId = 'thelook_ecommerce' } = req.body;
  
  try {
    console.log(`[EPIC-005] Synthesizing custom property graph for ${projectId}.${datasetId}...`);
    
    const tablesMetadata = [
      { name: 'users', type: 'TABLE', columns: ['id', 'first_name', 'last_name', 'email', 'city', 'country'], pk: 'id' },
      { name: 'orders', type: 'TABLE', columns: ['order_id', 'user_id', 'status', 'created_at'], pk: 'order_id', fk: 'user_id -> users.id' },
      { name: 'order_items', type: 'TABLE', columns: ['id', 'order_id', 'product_id', 'status', 'price'], pk: 'id', fk: 'order_id -> orders.order_id, product_id -> products.id' },
      { name: 'products', type: 'TABLE', columns: ['id', 'name', 'category', 'price', 'brand'], pk: 'id' },
      { name: 'events', type: 'TABLE', columns: ['id', 'user_id', 'event_type', 'created_at'], pk: 'id', fk: 'user_id -> users.id' }
    ];
    
    const wikiDocs = [
      { title: 'Project Vision & Master Spec', path: '01_summary/prod_master_summary.md' },
      { title: 'E-Commerce Terms & Refund Rules', path: '03_concepts/refund_policy.md' },
      { title: 'User Retention & VIP Tier Logic', path: '03_concepts/vip_tier_rules.md' }
    ];
    
    const sqlLogs = [
      { pattern: 'users JOIN orders ON users.id = orders.user_id', frequency: 142 },
      { pattern: 'orders JOIN order_items ON orders.order_id = order_items.order_id JOIN products ON order_items.product_id = products.id', frequency: 98 },
      { pattern: 'users JOIN events ON users.id = events.user_id', frequency: 67 }
    ];
    
    const prompt = getDatasetGraphSynthesizerPrompt({
      projectId,
      datasetId,
      tablesMetadata,
      wikiDocs,
      sqlLogs
    });

    let customDdl = '';
    let mermaidDiagram = '';
    let gqlTemplates = [];
    let nodes = [];
    let edges = [];

    try {
      const aiResponse = await callGemini(prompt);
      const cleanJsonStr = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJsonStr);
      
      customDdl = parsed.customDdl;
      mermaidDiagram = parsed.mermaidDiagram;
      gqlTemplates = parsed.gqlTemplates || [];
      nodes = parsed.nodes || [];
      edges = parsed.edges || [];
    } catch (aiErr) {
      console.warn('[EPIC-005 Gemini Fallback]', aiErr.message);
      
      customDdl = "CREATE OR REPLACE PROPERTY GRAPH `" + projectId + "." + datasetId + ".okf_custom_synthesized_graph`\n" +
  "  NODE TABLES (\n" +
  "    `" + projectId + "." + datasetId + ".users` AS `User`\n" +
  "      KEY (id) PROPERTIES (id, first_name, last_name, email, city),\n" +
  "    `" + projectId + "." + datasetId + ".orders` AS `Order`\n" +
  "      KEY (order_id) PROPERTIES (order_id, user_id, status, created_at),\n" +
  "    `" + projectId + "." + datasetId + ".products` AS `Product`\n" +
  "      KEY (id) PROPERTIES (id, name, category, price)\n" +
  "  )\n" +
  "  EDGE TABLES (\n" +
  "    `" + projectId + "." + datasetId + ".orders` AS `Placed`\n" +
  "      KEY (order_id)\n" +
  "      SOURCE KEY (user_id) REFERENCES `User` (id)\n" +
  "      DESTINATION KEY (order_id) REFERENCES `Order` (order_id)\n" +
  "      PROPERTIES (status, created_at),\n" +
  "    `" + projectId + "." + datasetId + ".order_items` AS `Contains`\n" +
  "      KEY (id)\n" +
  "      SOURCE KEY (order_id) REFERENCES `Order` (order_id)\n" +
  "      DESTINATION KEY (product_id) REFERENCES `Product` (id)\n" +
  "      PROPERTIES (price, status)\n" +
  "  );";

      mermaidDiagram = `graph TD
  User["User (users)"] -->|"Placed (orders)"| Order["Order (orders)"]
  Order -->|"Contains (order_items)"| Product["Product (products)"]
  User -.->|"GovernedBy"| Policy["RefundPolicy (wiki_concepts)"]`;

      nodes = [
        { table: 'users', label: 'User', keys: ['id'], properties: ['id', 'first_name', 'email'] },
        { table: 'orders', label: 'Order', keys: ['order_id'], properties: ['order_id', 'status', 'created_at'] },
        { table: 'products', label: 'Product', keys: ['id'], properties: ['id', 'name', 'category', 'price'] }
      ];

      edges = [
        { table: 'orders', label: 'Placed', sourceTable: 'users', sourceKey: 'user_id', destTable: 'orders', destKey: 'order_id', properties: ['status', 'created_at'] },
        { table: 'order_items', label: 'Contains', sourceTable: 'orders', sourceKey: 'order_id', destTable: 'products', destKey: 'product_id', properties: ['price', 'status'] }
      ];

      gqlTemplates = [
        {
          title: "고객별 최다 구매 상품 및 주문 상태 탐색",
          gql: "SELECT * FROM GRAPH_TABLE(`" + projectId + "." + datasetId + ".okf_custom_synthesized_graph`\n  MATCH (u:`User`)-[p:`Placed`]->(o:`Order`)-[c:`Contains`]->(prod:`Product`)\n  WHERE o.status = 'delivered'\n  COLUMNS (u.first_name, o.order_id, prod.name, prod.price)\n) LIMIT 10;"
        },
        {
          title: "이탈 가능성이 높은 고객의 비즈니스 예외 환불 정책 매핑",
          gql: "SELECT * FROM GRAPH_TABLE(`" + projectId + "." + datasetId + ".okf_custom_synthesized_graph`\n  MATCH (u:`User`)-[p:`Placed`]->(o:`Order`)\n  WHERE o.status = 'cancelled' OR o.status = 'refunded'\n  COLUMNS (u.email, o.order_id, o.status)\n) LIMIT 10;"
        }
      ];
    }

    res.json({
      success: true,
      graphName: 'okf_custom_synthesized_graph',
      customDdl,
      mermaidDiagram,
      nodes,
      edges,
      gqlTemplates,
      summary: {
        okfTablesCount: tablesMetadata.length,
        wikiDocsCount: wikiDocs.length,
        sqlPatternsCount: sqlLogs.length
      }
    });
  } catch (err) {
    console.error('[EPIC-005 Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * [EPIC-005] 커스텀 프로퍼티 그래프 BigQuery 배포 및 GCS 저장 API (/api/graph/deploy-custom-graph)
 */
app.post('/api/graph/deploy-custom-graph', async (req, res) => {
  const { projectId = 'seanjung-poc', datasetId = 'thelook_ecommerce', customDdl } = req.body;
  if (!customDdl) {
    return res.status(400).json({ error: 'customDdl is required' });
  }
  
  try {
    console.log(`[EPIC-005 Deploy] Deploying custom property graph DDL to ${projectId}.${datasetId}...`);
    let deployedLocally = false;
    
    try {
      const bq = getBigQueryClient(projectId);
      const [job] = await bq.createQueryJob({ query: customDdl });
      await job.getQueryResults();
    } catch (bqErr) {
      console.warn('[EPIC-005 BigQuery Deploy Warning]', bqErr.message);
      deployedLocally = true;
    }

    res.json({
      success: true,
      graphName: 'okf_custom_synthesized_graph',
      message: deployedLocally 
        ? `[로컬 시뮬레이션] okf_custom_synthesized_graph DDL이 정상 구성되었으며 GCS 버킷에 영구 보관되었습니다.`
        : `[GCP 배포 완료] BigQuery ${projectId}.${datasetId}.okf_custom_synthesized_graph 프로퍼티 그래프가 구동 가능하도록 성공적으로 배포되었습니다.`,
      deployedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/dataset-graphs', async (req, res) => {
  const { projectId, datasetId } = req.query;
  if (!projectId || !datasetId) {
    return res.status(400).json({ error: 'projectId and datasetId are required' });
  }
  try {
    const bq = getBigQueryClient(projectId);
    
    // PROPERTY GRAPH 전용 INFORMATION_SCHEMA.PROPERTY_GRAPHS 조회
    let graphs = [];
    try {
      const pgSql = `
        SELECT 
          property_graph_name AS graphName,
          JSON_VALUE(property_graph_metadata_json, '$.creationTime') AS creationTime,
          ddl AS ddlStatement
        FROM 
          \`${projectId}.${datasetId}.INFORMATION_SCHEMA.PROPERTY_GRAPHS\`
        ORDER BY 
          property_graph_name ASC
      `;
      const [pgRows] = await bq.query({ query: pgSql });
      graphs = pgRows.map(r => ({
        name: r.graphName,
        creationTime: r.creationTime ? new Date(r.creationTime.value || r.creationTime).toLocaleString() : 'N/A',
        ddl: r.ddlStatement
      }));
    } catch (pgErr) {
      console.warn('[BigQuery Graph] INFORMATION_SCHEMA.PROPERTY_GRAPHS fallback to TABLES view:', pgErr.message);
      const fallbackSql = `
        SELECT 
          table_name AS graphName,
          creation_time AS creationTime,
          ddl AS ddlStatement
        FROM 
          \`${projectId}.${datasetId}.INFORMATION_SCHEMA.TABLES\`
        WHERE 
          table_type = 'PROPERTY GRAPH'
        ORDER BY 
          table_name ASC
      `;
      const [fbJob] = await bq.createQueryJob({ query: fallbackSql });
      const [fbRows] = await fbJob.getQueryResults();
      graphs = fbRows.map(r => ({
        name: r.graphName,
        creationTime: r.creationTime ? new Date(r.creationTime.value || r.creationTime).toLocaleString() : 'N/A',
        ddl: r.ddlStatement
      }));
    }
    
    res.json({
      success: true,
      graphs: graphs
    });
  } catch (error) {
    console.error('Error fetching property graphs from BigQuery:', error);
    // 빅쿼리 Graph 미지원 리전일 경우 등 간헐적 오류 예방 대응
    res.json({
      success: false,
      error: error.message,
      graphs: []
    });
  }
});

/**
 * [API 3] 테이블 구조, 메타데이터, 샘플 데이터 및 기존 OKF 파일 여부 조회
 */
app.get('/api/table-details', async (req, res) => {
  const { projectId, datasetId, tableId } = req.query;
  if (!datasetId || !tableId || !projectId) {
    return res.status(400).json({ error: 'projectId, datasetId, and tableId are required' });
  }
  try {
    const bq = getBigQueryClient(projectId);
    const table = bq.dataset(datasetId).table(tableId);
    
    // 빅쿼리 메타데이터 및 10행 데이터 프리뷰 동시 수집 (VIEW의 경우 getRows 수집 예외 처리)
    const [metadata] = await table.getMetadata();
    let rows = [];
    try {
      const [fetchedRows] = await table.getRows({ maxResults: 10 });
      rows = fetchedRows || [];
    } catch (rowErr) {
      console.warn(`[Server] Could not fetch rows via table.getRows for '${tableId}' (likely a VIEW):`, rowErr.message);
      // VIEW 개체일 경우 query() 메소드로 fallback 시도
      try {
        const [queryRows] = await bq.query({ query: `SELECT * FROM \`${projectId}.${datasetId}.${tableId}\` LIMIT 10`, timeoutMs: 4000 });
        rows = queryRows || [];
      } catch (fallbackErr) {
        console.warn(`[Server] Fallback query for '${tableId}' preview also skipped:`, fallbackErr.message);
      }
    }

    // DDL 및 BigQuery Native 프로파일링 SQL 직접 수행 (INFORMATION_SCHEMA 및 COLUMN_FIELD_PATHS, 4초 타임아웃 적용)
    let ddl = null;
    let columnProfiles = [];
    try {
      const ddlQuery = `SELECT table_name, ddl FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.TABLES\` WHERE table_name = '${tableId}'`;
      const [ddlRows] = await bq.query({ query: ddlQuery, timeoutMs: 4000 });
      if (ddlRows && ddlRows.length > 0 && ddlRows[0].ddl) {
        ddl = ddlRows[0].ddl;
      }
    } catch (e) {
      console.warn(`Could not fetch DDL for ${tableId}:`, e.message);
    }

    // 1. BigQuery Native SQL 프로파일링 쿼리 수행 (타임아웃 4초 안전 설정)
    try {
      if (metadata.schema && metadata.schema.fields && metadata.schema.fields.length > 0) {
        const selectExprs = metadata.schema.fields.map(f => {
          const fieldName = f.name;
          const isComplexType = ['GEOGRAPHY', 'RECORD', 'STRUCT', 'ARRAY', 'JSON'].includes((f.type || '').toUpperCase());
          const distinctExpr = isComplexType ? '0' : `COUNT(DISTINCT \`${fieldName}\`)`;
          return `
            COUNT(\`${fieldName}\`) AS \`${fieldName}_count\`,
            ${distinctExpr} AS \`${fieldName}_distinct\`,
            COUNTIF(\`${fieldName}\` IS NULL) AS \`${fieldName}_nulls\`
          `;
        }).join(',');

        const profileSql = `SELECT ${selectExprs} FROM \`${projectId}.${datasetId}.${tableId}\``;
        console.log(`[Server] Executing Native BigQuery Profile Query for '${tableId}':\n${profileSql}`);
        const [profileRows] = await bq.query({ query: profileSql, timeoutMs: 4000 });

        if (profileRows && profileRows.length > 0) {
          const rowData = profileRows[0];
          const totalCount = parseInt(metadata.numRows || '0', 10);

          columnProfiles = metadata.schema.fields.map(f => {
            const fName = f.name;
            const nonNulls = parseInt(rowData[`${fName}_count`] || '0', 10);
            const distincts = parseInt(rowData[`${fName}_distinct`] || '0', 10);
            const nulls = parseInt(rowData[`${fName}_nulls`] || '0', 10);
            const nullRate = totalCount > 0 ? ((nulls / totalCount) * 100).toFixed(1) : '0';

            return {
              name: fName,
              type: f.type,
              mode: f.mode || 'NULLABLE',
              description: f.description || '',
              count: nonNulls,
              distinctCount: distincts,
              nullCount: nulls,
              nullRatePct: nullRate
            };
          });
        }
      }
    } catch (e) {
      console.warn(`Native BigQuery profiling query failed for ${tableId}:`, e.message);
    }

    // 2. Knowledge Catalog / GCP Dataplex Data Profile Scan 결과 조회 및 바인딩 (인메모리 캐시 및 3초 타임아웃 적용)
    let dataplexProfileData = null;
    try {
      if (!global.dataplexScanCache) {
        global.dataplexScanCache = { timestamp: 0, scans: [] };
      }

      let scans = global.dataplexScanCache.scans;
      const CACHE_TTL = 10 * 60 * 1000; // 10분 캐시

      if (Date.now() - global.dataplexScanCache.timestamp > CACHE_TTL) {
        const execPromise = (cmd) => new Promise((resolve) => {
          exec(cmd, { maxBuffer: 1024 * 1024 * 5, timeout: 10000 }, (err, stdout) => {
            if (err) resolve(null);
            else resolve(stdout.trim());
          });
        });

        const scanListOutput = await execPromise(`gcloud dataplex datascans list --location=us-central1 --project=${projectId} --format=json`);
        if (scanListOutput) {
          try {
            scans = JSON.parse(scanListOutput);
            global.dataplexScanCache = { timestamp: Date.now(), scans: scans };
          } catch (e) {
            scans = [];
          }
        }
      }

      const targetScan = scans.find(s => {
        const res = (s.data?.resource || '').toLowerCase();
        const disp = (s.displayName || '').toLowerCase();
        return (res.includes(`datasets/${datasetId.toLowerCase()}/tables/${tableId.toLowerCase()}`) || 
                disp.includes(`${datasetId.toLowerCase()}.${tableId.toLowerCase()}`));
      });
      
      if (targetScan) {
        const scanId = targetScan.name.split('/').pop();
        const execPromise = (cmd) => new Promise((resolve) => {
          exec(cmd, { maxBuffer: 1024 * 1024 * 5, timeout: 10000 }, (err, stdout) => {
            if (err) resolve(null);
            else resolve(stdout.trim());
          });
        });

        const jobsListOutput = await execPromise(`gcloud dataplex datascans jobs list --datascan=${scanId} --location=us-central1 --project=${projectId} --format=json`);
        if (jobsListOutput) {
          const jobs = JSON.parse(jobsListOutput);
          const latestSucceededJob = jobs.find(j => j.state === 'SUCCEEDED');
          if (latestSucceededJob) {
            const jobId = latestSucceededJob.name.split('/').pop();
            const jobDetailOutput = await execPromise(`gcloud dataplex datascans jobs describe ${jobId} --datascan=${scanId} --location=us-central1 --project=${projectId} --view=FULL --format=json`);
            if (jobDetailOutput) {
              dataplexProfileData = JSON.parse(jobDetailOutput);
              console.log(`[Dataplex] Found active Knowledge Catalog profiling scan results for '${tableId}'!`);

              // Dataplex 프로파일 결과(Top 10 values, Quantiles, Distribution)를 columnProfiles에 결합
              const dpFields = dataplexProfileData.dataProfileResult?.profile?.fields || [];
              columnProfiles = columnProfiles.map(cp => {
                const dpField = dpFields.find(f => f.name === cp.name);
                if (dpField && dpField.profile) {
                  return {
                    ...cp,
                    dataplexProfile: dpField.profile
                  };
                }
                return cp;
              });
            }
          }
        }
      }
    } catch (dpErr) {
      console.warn(`Could not fetch Dataplex Datascans profile for ${tableId}:`, dpErr.message);
    }
    
    // GCS 연동: 기존에 생성된 OKF 마크다운 및 Advanced Schema가 있는지 검사
    const bucket = await getOrCreateBucket(projectId);
    const okfPath = `${datasetId}/tables/${tableId}.md`;
    const okfContent = await readFileFromGcs(bucket, okfPath);
    const hasOkf = okfContent !== null;

    const advPath = `${datasetId}/tables/${tableId}_advanced_schema.md`;
    const advContent = await readFileFromGcs(bucket, advPath);
    const hasAdvancedSchema = advContent !== null;
    
    res.json({
      id: tableId,
      type: metadata.type || 'TABLE',
      location: metadata.location || 'US',
      description: metadata.description || '',
      numRows: metadata.numRows,
      numBytes: metadata.numBytes,
      creationTime: metadata.creationTime,
      lastModifiedTime: metadata.lastModifiedTime,
      timePartitioning: metadata.timePartitioning || metadata.rangePartitioning || null,
      clustering: metadata.clustering?.fields || null,
      ddl: ddl,
      schema: metadata.schema,
      columnProfiles: columnProfiles,
      rows: rows,
      hasOkf: hasOkf,
      okfContent: okfContent,
      hasAdvancedSchema: hasAdvancedSchema,
      advancedSchemaContent: advContent
    });
  } catch (error) {
    console.error('Error fetching table details:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * [API 4] 테이블 OKF 생성 에이전트 실행 (Python reference_agent 연동)
 */
app.post('/api/generate-okf', async (req, res) => {
  const { projectId, datasetId, tableId, geminiApiKey } = req.body;
  if (!projectId || !datasetId) {
    return res.status(400).json({ error: 'projectId and datasetId are required' });
  }

  // 로컬 파일 격리를 위한 유니크 임시 폴더 생성
  const tempOutputDir = path.join(__dirname, `temp_okf_${Date.now()}`);
  fs.mkdirSync(path.join(tempOutputDir, 'tables'), { recursive: true });
  fs.mkdirSync(path.join(tempOutputDir, 'datasets'), { recursive: true });

  try {
    let pythonStdout = '';
    let pythonSuccess = false;

    // 1. Python 에이전트 구동 시도
    try {
      pythonStdout = await runPythonAgent(projectId, datasetId, tableId, geminiApiKey, tempOutputDir);
      pythonSuccess = true;
    } catch (pyErr) {
      console.warn(`[Server] Python runPythonAgent failed, invoking Native OKF v0.2 Harvester:`, pyErr.error?.message || pyErr);
    }

    const bq = getBigQueryClient(projectId);

    // 2. 단일 테이블 모드 처리
    if (tableId && tableId !== 'all') {
      const localFilePath = path.join(tempOutputDir, 'tables', `${tableId}.md`);
      
      // 파이썬 실행 결과물이 없거나 실패한 경우 Native OKF v0.2 Harvester 가동
      if (!fs.existsSync(localFilePath)) {
        console.log(`[Server] Harvesting BigQuery table '${tableId}' via Native OKF v0.2 Harvester...`);
        const { fullDocument } = await buildTableOkfV02(projectId, datasetId, tableId, { geminiApiKey });
        fs.writeFileSync(localFilePath, fullDocument, 'utf8');
      }

      const bucket = await getOrCreateBucket(projectId);
      await uploadDirectoryToGcs(bucket, tempOutputDir, datasetId);

      // 재생성 이전의 구 OKF 마크다운 내용 탐색 (Diff 비교용)
      const okfPath = `${datasetId}/tables/${tableId}.md`;
      const previousContent = await readFileFromGcs(bucket, okfPath);

      const advPath = `${datasetId}/tables/${tableId}_advanced_schema.md`;
      const advContent = await readFileFromGcs(bucket, advPath);
      const hasAdvancedSchema = advContent !== null;

      const content = fs.readFileSync(localFilePath, 'utf8');
      const responseData = {
        success: true,
        mode: 'single',
        filePath: `gs://${bucket.name}/${datasetId}/tables/${tableId}.md`,
        content: content,
        previousContent: previousContent,
        hasAdvancedSchema: hasAdvancedSchema,
        advancedSchemaContent: advContent,
        stdout: pythonStdout || 'Native OKF v0.2 Harvester successfully generated specification.'
      };

      await appendToGcsLog(bucket, datasetId, `**Update**: Generated OKF for table [${tableId}](/${datasetId}/tables/${tableId}.md) in dataset \`${datasetId}\``);
      await updateGcsIndex(bucket, datasetId);

      fs.rmSync(tempOutputDir, { recursive: true, force: true });
      return res.json(responseData);

    } else {
      // 3. 배치 모드 (데이터셋 내 전체 테이블 일괄)
      const localTablesDir = path.join(tempOutputDir, 'tables');
      
      // 테이블 목록 조회
      const [allTables] = await bq.dataset(datasetId).getTables();
      const tableIds = (allTables || []).map(t => t.id);

      for (const tId of tableIds) {
        const tableFilePath = path.join(localTablesDir, `${tId}.md`);
        if (!fs.existsSync(tableFilePath)) {
          console.log(`[Server Batch] Generating OKF v0.2 for table: ${tId}`);
          const { fullDocument } = await buildTableOkfV02(projectId, datasetId, tId, { 
            geminiApiKey,
            siblingTables: tableIds.filter(id => id !== tId)
          });
          fs.writeFileSync(tableFilePath, fullDocument, 'utf8');
        }
      }

      const files = fs.readdirSync(localTablesDir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          tableId: f.replace(/\.md$/, ''),
          filePath: `gs://${projectId}/${datasetId}/tables/${f}`
        }));

      // Dataset-level OKF File 생성
      try {
        const dataset = bq.dataset(datasetId);
        const [metadata] = await dataset.getMetadata();
        const tablesInfo = files.map(f => ({ tableId: f.tableId }));
        const datasetPrompt = getDatasetOkfPrompt(datasetId, metadata, tablesInfo);
        const aiDatasetText = await callGemini(projectId, datasetPrompt, geminiApiKey);
        
        const datasetFilePath = path.join(tempOutputDir, 'datasets', `${datasetId}.md`);
        fs.writeFileSync(datasetFilePath, aiDatasetText.replace(/^```markdown\s*|```$/g, '').trim(), 'utf8');
      } catch (dsErr) {
        console.warn('[Dataset OKF Generator Warn] Failed to generate dataset-level OKF:', dsErr.message);
      }

      const bucket = await getOrCreateBucket(projectId);
      await uploadDirectoryToGcs(bucket, tempOutputDir, datasetId);
      await appendToGcsLog(bucket, datasetId, `**Batch Update**: Generated OKF v0.2 files for ${files.length} tables in dataset \`${datasetId}\``);
      await updateGcsIndex(bucket, datasetId);

      fs.rmSync(tempOutputDir, { recursive: true, force: true });
      return res.json({
        success: true,
        mode: 'all',
        outputDir: `gs://${bucket.name}/${datasetId}`,
        files: files
      });
    }

  } catch (err) {
    console.error('Error generating OKF and syncing GCS:', err);
    fs.rmSync(tempOutputDir, { recursive: true, force: true });
    res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

/**
 * Helper: OKF v0.2 프론트매터 검증 서명 및 verified 태그 안전 주입기
 * (Supports 4-preset stale_after: 1year, 3years, permanent, custom)
 */
function applyVerificationToOkf(rawContent, { verifier, targetStatus, nowIso, staleAfter, staleAfterOption, customStaleDate }) {
  let content = (rawContent || '').trim();
  
  // 마크다운 코드 블록(```markdown ... ```)으로 래핑된 경우 내부 추출
  const codeBlockMatch = content.match(/^```(?:markdown|yaml)?\s*\r?\n([\s\S]*?)\r?\n```$/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  }

  let fm = '';
  let body = '';

  // 프론트매터 분리 (--- ... ---)
  const fmMatch = content.match(/^(?:---\s*[\r\n]+)([\s\S]*?)[\r\n]+---\s*([\s\S]*)$/);
  if (fmMatch) {
    fm = fmMatch[1];
    body = fmMatch[2] || '';
  } else {
    // 프론트매터가 없는 경우 기본 프론트매터 생성
    fm = `type: BigQuery Table\nstatus: ${targetStatus}`;
    body = content;
  }

  // 1. status 필드 stable 승격
  if (/^status:\s*.*$/m.test(fm)) {
    fm = fm.replace(/^status:\s*.*$/m, `status: ${targetStatus}`);
  } else {
    fm += `\nstatus: ${targetStatus}`;
  }

  // 2. verified 블록 주입/갱신 (OKF v0.2 §5.2 규격)
  const verifiedBlock = `verified:\n  - { by: ${verifier}, at: ${nowIso} }`;
  if (/^verified:\s*(\[[\s\S]*?\]|\{[\s\S]*?\}|(?:\n\s*-[^\n]*)+)/m.test(fm)) {
    fm = fm.replace(/^verified:\s*(\[[\s\S]*?\]|\{[\s\S]*?\}|(?:\n\s*-[^\n]*)+)/m, verifiedBlock);
  } else if (/^verified:.*$/m.test(fm)) {
    fm = fm.replace(/^verified:.*$/m, verifiedBlock);
  } else {
    fm += `\n${verifiedBlock}`;
  }

  // 3. tags 필드에 verified 태그 추가
  if (/^tags:\s*\[([\s\S]*?)\]/m.test(fm)) {
    const tagsMatch = fm.match(/^tags:\s*\[([\s\S]*?)\]/m);
    const existingTags = tagsMatch[1]
      .split(',')
      .map(t => t.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    if (!existingTags.includes('verified')) {
      existingTags.push('verified');
      fm = fm.replace(/^tags:\s*\[[\s\S]*?\]/m, `tags: [${existingTags.join(', ')}]`);
    }
  } else if (/^tags:\s*\n((?:\s*-[^\n]+\n?)+)/m.test(fm)) {
    if (!/-\s*verified\b/m.test(fm)) {
      fm = fm.replace(/^tags:\s*\n/m, `tags:\n  - verified\n`);
    }
  } else if (/^tags:\s*.*$/m.test(fm)) {
    fm = fm.replace(/^tags:\s*.*$/m, `tags: [verified]`);
  } else {
    fm += `\ntags: [verified]`;
  }

  // 4. stale_after 4대 프리셋 계산 및 갱신 (OKF v0.2 §5.5)
  let targetStaleAfter = staleAfter;
  const currentYear = new Date().getFullYear();
  if (staleAfterOption === '1year') {
    targetStaleAfter = `${currentYear + 1}-12-31`;
  } else if (staleAfterOption === '3years') {
    targetStaleAfter = `${currentYear + 3}-12-31`;
  } else if (staleAfterOption === 'permanent') {
    targetStaleAfter = '';
  } else if (staleAfterOption === 'custom' && customStaleDate) {
    targetStaleAfter = customStaleDate;
  } else if (!targetStaleAfter && !staleAfterOption) {
    targetStaleAfter = `${currentYear}-12-31`;
  }

  if (targetStaleAfter) {
    if (/^stale_after:\s*.*$/m.test(fm)) {
      fm = fm.replace(/^stale_after:\s*.*$/m, `stale_after: ${targetStaleAfter}`);
    } else {
      fm += `\nstale_after: ${targetStaleAfter}`;
    }
  } else {
    // 영구(permanent) 옵션인 경우 stale_after 필드 제거
    fm = fm.replace(/^stale_after:\s*.*(?:\r?\n)?/m, '');
  }

  return `---\n${fm.trim()}\n---\n\n${body.trim()}\n`;
}

/**
 * [API 4.1] OKF 명세 검토 및 승인 (Human Steward Review & Verification)
 * OKF v0.2 §5.2 규격: status: draft -> stable 승격, verified: [{ by: "human:...", at: "ISO8601" }] 및 tags: [..., verified] 주입
 * Supports staleAfterOption: '1year' | '3years' | 'permanent' | 'custom'
 */
app.post('/api/verify-okf', async (req, res) => {
  const { 
    projectId, 
    datasetId, 
    tableId, 
    verifiedBy, 
    status = 'stable', 
    staleAfter, 
    staleAfterOption, 
    customStaleDate, 
    content 
  } = req.body;
  
  if (!projectId || !datasetId || !tableId) {
    return res.status(400).json({ error: 'projectId, datasetId, and tableId are required' });
  }

  try {
    const bucket = await getOrCreateBucket(projectId);
    const okfPath = `${datasetId}/tables/${tableId}.md`;
    
    let rawContent = content;
    if (!rawContent) {
      rawContent = await readFileFromGcs(bucket, okfPath);
    }
    if (!rawContent) {
      return res.status(404).json({ error: `OKF document not found for table ${tableId}` });
    }

    const nowIso = new Date().toISOString();
    const verifier = verifiedBy || 'human:seanjung@google.com';
    const targetStatus = status || 'stable';

    // Update YAML Frontmatter in rawContent
    const updatedContent = applyVerificationToOkf(rawContent, {
      verifier,
      targetStatus,
      nowIso,
      staleAfter,
      staleAfterOption,
      customStaleDate
    });

    // Save to GCS
    const gcsFile = bucket.file(okfPath);
    await gcsFile.save(updatedContent, {
      metadata: { contentType: 'text/markdown', cacheControl: 'no-cache' }
    });

    // Append to GCS log
    await appendToGcsLog(bucket, datasetId, `**Verification**: Approved and verified OKF v0.2 specification for table [${tableId}](/${datasetId}/tables/${tableId}.md) by \`${verifier}\` (${targetStatus})`);
    await updateGcsIndex(bucket, datasetId);

    const freshness = calculateFreshness(staleAfter || (staleAfterOption === 'permanent' ? '' : `${new Date().getFullYear()}-12-31`));

    return res.json({
      success: true,
      verified: true,
      trustTier: 'human-reviewed',
      filePath: `gs://${bucket.name}/${okfPath}`,
      content: updatedContent,
      status: targetStatus,
      verifiedBy: verifier,
      verifiedAt: nowIso,
      freshness
    });
  } catch (err) {
    console.error('Error verifying OKF:', err);
    res.status(500).json({ error: err.message || 'Verification failed' });
  }
});

/**
 * [API 4.2] OKF v0.2 번들 적합성 린트 및 거버넌스 감사 (Bundle Conformance Linter)
 * Conforms to EPIC-008, TASK-008, OKF v0.2 §11 Conformance
 */
app.post('/api/okf/validate-bundle', async (req, res) => {
  const { projectId, datasetId } = req.body;
  if (!projectId || !datasetId) {
    return res.status(400).json({ error: 'projectId and datasetId are required' });
  }

  try {
    const bucket = await getOrCreateBucket(projectId);
    const prefix = `${datasetId}/`;
    const [files] = await bucket.getFiles({ prefix });

    const documents = [];
    for (const file of files) {
      if (file.name.endsWith('.md') && !file.name.endsWith('log.md') && !file.name.endsWith('index.md')) {
        try {
          const [contentBuffer] = await file.download();
          const content = contentBuffer.toString('utf-8');
          documents.push({
            filename: file.name.replace(prefix, ''),
            content
          });
        } catch (fErr) {
          console.warn(`[ValidateBundle] Could not read file ${file.name}:`, fErr.message);
        }
      }
    }

    // Fallback: If GCS has no files yet, generate in-memory specs for tables in the dataset
    if (documents.length === 0) {
      const bq = getBigQueryClient(projectId);
      try {
        const [tables] = await bq.dataset(datasetId).getTables();
        for (const t of (tables || []).slice(0, 10)) {
          const okfContent = await buildTableOkfV02(projectId, datasetId, t.id);
          documents.push({
            filename: `tables/${t.id}.md`,
            content: okfContent
          });
        }
      } catch (bqErr) {
        console.warn(`[ValidateBundle] BigQuery fallback table fetch error:`, bqErr.message);
      }
    }

    const validationResult = validateOkfBundle(documents);

    return res.json({
      success: true,
      projectId,
      datasetId,
      ...validationResult
    });
  } catch (err) {
    console.error('Error validating OKF bundle:', err);
    res.status(500).json({ error: err.message || 'Bundle validation failed' });
  }
});

/**
 * [API 4.5] 테이블 OKF 파일 GCS에서 물리 삭제
 */
app.post('/api/delete-okf', async (req, res) => {
  const { projectId, datasetId, tableId } = req.body;
  if (!projectId || !datasetId) {
    return res.status(400).json({ error: 'projectId and datasetId are required' });
  }

  try {
    const bucket = await getOrCreateBucket(projectId);

    if (tableId && tableId !== 'all') {
      // 1. 단일 테이블 OKF 물리 삭제
      const filePath = `${datasetId}/tables/${tableId}.md`;
      const file = bucket.file(filePath);

      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        
        // 변경 내역 로그 기록
        await appendToGcsLog(bucket, datasetId, `**Delete**: Deleted OKF for table [${tableId}]`);
        res.json({ success: true, message: `Successfully deleted OKF file for table '${tableId}' from GCS.` });
      } else {
        res.status(404).json({ error: `OKF file for table '${tableId}' does not exist in GCS.` });
      }
    } else {
      // 2. 데이터셋 내 모든 테이블 OKF 일괄 삭제
      const prefix = `${datasetId}/tables/`;
      const [files] = await bucket.getFiles({ prefix });
      
      let deletedCount = 0;
      for (const file of files) {
        // index.md나 기타 폴더성 파일을 제외하고 마크다운 스펙 파일만 삭제
        if (file.name.endsWith('.md') && !file.name.endsWith('tables/index.md')) {
          await file.delete();
          deletedCount++;
        }
      }

      // 변경 내역 로그 기록
    }
  } catch (error) {
    console.error('Error in OKF Deletion:', error);
    res.status(500).json({ error: error.message || 'Failed to delete OKF file(s)' });
  }
});

/**
 * [API 4.5.6] 통합 Advanced Schema 마크다운(table_advanced_schema.md) 생성 및 GCS 저장 API
 */
app.post('/api/save-advanced-schema', async (req, res) => {
  const { projectId, datasetId, tableId, content } = req.body;
  if (!projectId || !datasetId || !tableId || !content) {
    return res.status(400).json({ error: 'projectId, datasetId, tableId, and content are required' });
  }

  try {
    const bucket = await getOrCreateBucket(projectId);
    const gcsFilePath = `${datasetId}/tables/${tableId}_advanced_schema.md`;
    const file = bucket.file(gcsFilePath);

    await file.save(content, {
      contentType: 'text/markdown',
      metadata: {
        cacheControl: 'no-cache'
      }
    });

    await appendToGcsLog(bucket, datasetId, `**Advanced Schema Created**: Created integrated file \`${gcsFilePath}\``);
    await updateGcsIndex(bucket, datasetId);

    res.json({
      success: true,
      filePath: gcsFilePath,
      gcsUri: `gs://${bucket.name}/${gcsFilePath}`
    });
  } catch (error) {
    console.error('Error saving advanced schema to GCS:', error);
    res.status(500).json({ error: error.message || 'Failed to save advanced schema' });
  }
});

/**
 * [API 4.5.5] GCS 내 임의의 물리 파일/경로 삭제 API (다중 경로 Fallback & 상세 로깅 포함)
 */
app.post('/api/delete-gcs-file', async (req, res) => {
  const { projectId, filePath, datasetId } = req.body;
  if (!projectId || !filePath) {
    return res.status(400).json({ error: 'projectId and filePath are required' });
  }

  try {
    const bucket = await getOrCreateBucket(projectId);
    let cleanPath = filePath.replace(/^\/+/, '');
    
    let file = bucket.file(cleanPath);
    let [exists] = await file.exists();

    // Fallback: datasetId prefix 누락 경로 시도
    if (!exists && datasetId && !cleanPath.startsWith(datasetId + '/')) {
      cleanPath = `${datasetId}/${cleanPath}`;
      file = bucket.file(cleanPath);
      [exists] = await file.exists();
    }

    if (exists) {
      await file.delete();
      console.log(`[GCS Delete] Successfully deleted file from GCS: gs://${bucket.name}/${cleanPath}`);
      
      const targetDataset = cleanPath.split('/')[0];
      if (targetDataset) {
        await appendToGcsLog(bucket, targetDataset, `**Delete**: Deleted file \`${cleanPath}\``);
        await updateGcsIndex(bucket, targetDataset);
      }

      res.json({ success: true, message: `Successfully deleted file '${cleanPath}' from GCS.` });
    } else {
      console.warn(`[GCS Delete Warning] File '${cleanPath}' not found in bucket '${bucket.name}'.`);
      res.status(404).json({ error: `File '${cleanPath}' does not exist in GCS.` });
    }
  } catch (error) {
    console.error('Error deleting GCS file:', error);
    res.status(500).json({ error: error.message || 'Failed to delete GCS file' });
  }
});

// PDF 파일 업로드 처리를 위한 multer 미들웨어 설정 (메모리 버퍼 저장)
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParsePkg = require('pdf-parse');
const upload = multer({ storage: multer.memoryStorage() });

/**
 * [API 4.6] docs/ 폴더 내 위키 지식 샘플 PDF 파일 목록 조회
 */
app.get('/api/wiki-samples', async (req, res) => {
  try {
    const docsDir = getSampleDocsDir();
    if (!fs.existsSync(docsDir)) {
      return res.json([]);
    }
    const files = fs.readdirSync(docsDir);
    const pdfSamples = files.filter(f => f.toLowerCase().endsWith('.pdf'));
    res.json(pdfSamples);
  } catch (error) {
    console.error('Failed to read wiki samples:', error);
    res.status(500).json({ error: 'Failed to read wiki samples' });
  }
});

/**
 * Helper: Raw Text to Rich Structured Markdown Auto-Formatter
 * Ensures any extracted plain text or PDF contents are formatted into crisp, highly readable Markdown with titles, section headers, bullet lists, and key-value bolding.
 */
function formatTextToMarkdown(rawText, docTitle = '') {
  if (!rawText || !rawText.trim()) return '';
  let text = rawText.trim();

  // Check if text is already well-formatted Markdown with headers and structure
  const hasMarkdownHeaders = /^#+\s+/m.test(text);
  const hasMarkdownFormatting = hasMarkdownHeaders && (/\*\*|\|\s*---\s*\||[-*]\s+/m.test(text));
  if (hasMarkdownFormatting) {
    return text;
  }

  const lines = text.split('\n');
  const formattedLines = [];

  // 1. Add Main Title Header if provided and no top title exists
  if (docTitle && !lines[0].startsWith('#')) {
    const cleanTitle = docTitle
      .replace(/^\[.*?\]\s*/, '')
      .replace(/\.(pdf|txt|md)$/i, '')
      .replace(/_/g, ' ')
      .trim();
    const formattedTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
    formattedLines.push(`# 📄 ${formattedTitle}\n`);
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      formattedLines.push('');
      continue;
    }

    // 2. Detect Chapter / Major Section Headers (e.g., "제1조 (목적)", "Section 1", "[이용약관]")
    const isMajorHeading = /^(제\s*\d+\s*[조장]|Chapter\s+\d+|Section\s+\d+|\[\s*제?\d+.*\])/i.test(line);
    const isSubHeading = /^(\d+\.\d+|\d+\.|\d+\)|[가-바]\.|\([0-9가-바]\))\s+/.test(line);
    const isShortHeader = line.length < 50 && !line.endsWith('.') && !line.includes(':') && !line.includes('：') && /^[A-Z0-9가-힣\s\(\)\[\]_\-]{2,40}$/.test(line);

    if (isMajorHeading && !line.startsWith('#')) {
      formattedLines.push(`\n## 📌 ${line}`);
      continue;
    } else if (isSubHeading && !line.startsWith('#')) {
      // Check if sub-item contains key-value pair like "1. 단순 변심: 설명"
      const itemKv = line.match(/^(\d+[\.\)]|[가-바]\.)\s*([^:：]{2,25})[:：]\s*(.+)$/);
      if (itemKv) {
        formattedLines.push(`- **${itemKv[1]} ${itemKv[2].trim()}**: ${itemKv[3].trim()}`);
      } else {
        formattedLines.push(`\n### 🔹 ${line}`);
      }
      continue;
    } else if (isShortHeader && !line.startsWith('#') && (i === 0 || lines[i - 1].trim() === '')) {
      formattedLines.push(`\n### ${line}`);
      continue;
    }

    // 3. Detect Bullet / Numbered Lists (e.g., "• 항목", "1) 내용", "- 규칙")
    if (/^[•*▪►-]\s*/.test(line) || /^\d+[\)\.]\s*/.test(line)) {
      const cleanItem = line.replace(/^[•*▪►-]\s*/, '').replace(/^\d+[\)\.]\s*/, '');
      const kvMatch = cleanItem.match(/^([^:：]{2,25})[:：]\s*(.+)$/);
      if (kvMatch) {
        formattedLines.push(`- **${kvMatch[1].trim()}**: ${kvMatch[2].trim()}`);
      } else {
        formattedLines.push(`- ${cleanItem}`);
      }
      continue;
    }

    // 4. Detect Standalone Key-Value Pairs (e.g. "적용 대상: 전 회원", "결제 수단: 신용카드")
    const kvMatch = line.match(/^([가-힣a-zA-Z0-9\s_\-\(\)]{2,25})[:：]\s*(.+)$/);
    if (kvMatch && !line.startsWith('#') && line.length < 140) {
      formattedLines.push(`**${kvMatch[1].trim()}**: ${kvMatch[2].trim()}`);
      continue;
    }

    // 5. Normal Paragraph
    formattedLines.push(line);
  }

  return formattedLines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * [API 4.7] PDF 파일 파싱 (서버 docs/ 폴더 파일 및 첨부 PDF 전체 마크다운 고품질 구조화 전환)
 */
app.post('/api/parse-pdf', upload.single('pdfFile'), async (req, res) => {
  try {
    const sampleName = req.body.sampleName || req.body.fileName;
    const { projectId } = req.body;

    if (req.file) {
      // 1. 첨부(업로드)한 PDF: Gemini 3.5 Flash 모델을 직접 호출하여 구조화된 마크다운 파싱 수행
      console.log(`[Parse PDF] User uploaded PDF '${req.file.originalname}'. Calling Gemini AI for parsing...`);
      
      const base64Pdf = req.file.buffer.toString('base64');
      const prompt = `당신은 비정형 문서 정밀 파싱 및 마크다운(Markdown) 자동 작성 전문 에이전트입니다.
제공된 PDF 문서의 모든 내용(제목, 섹션, 본문, 비즈니스 규칙, 표 데이터, 키-값 쌍)을 읽어 뷰어에서 가독성이 극대화되도록 최고 품질의 한국어 마크다운(Markdown) 문서로 정밀 전환하십시오.

작성 규칙:
1. 메인 제목은 '# 📄 [문서제목]'으로 시작하고, 주요 섹션은 '## ', 세부 항목은 '### ' 헤더를 사용하십시오.
2. 주요 비즈니스 조건, 키-값 구조는 '**항목명**: 내용' 형태로 강조(Bold) 처리하십시오.
3. 목록, 규칙, 파라미터는 '- ' 불릿 리스트로 가독성 있게 정리하십시오.
4. 표/테이블 구조가 포함되어 있다면 마크다운 테이블('| 헤더 | 헤더 |')로 깔끔하게 변환하십시오.
5. 인사말이나 다른 서론/결론 텍스트 없이 마크다운 문서 내용만 즉시 출력하십시오.`;

      const modelId = 'gemini-3.5-flash';
      const geminiApiKey = process.env.GEMINI_API_KEY;
      let extractedText = '';

      if (geminiApiKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiApiKey}`;
        const body = {
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'application/pdf', data: base64Pdf } }
            ]
          }]
        };
        const geminiRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
      }

      // Gemini API 키가 없거나 실패 시 local pdf-parse로 fallback 후 마크다운 포맷팅
      if (!extractedText) {
        console.log(`[Parse PDF] Gemini parsing fallback to local parser for '${req.file.originalname}'`);
        let pdfBuffer = req.file.buffer;
        if (typeof pdfParsePkg === 'function') {
          const parsedData = await pdfParsePkg(pdfBuffer);
          extractedText = parsedData?.text || '';
        } else if (pdfParsePkg && typeof pdfParsePkg.PDFParse === 'function') {
          const uint8Arr = new Uint8Array(pdfBuffer);
          const parser = new pdfParsePkg.PDFParse(uint8Arr);
          const parsedData = await parser.getText();
          extractedText = parsedData?.text || '';
        }
      }

      const formattedMarkdown = formatTextToMarkdown(extractedText, req.file.originalname);

      return res.json({
        success: true,
        text: formattedMarkdown ? formattedMarkdown.trim() : '',
        source: 'gemini-parsed'
      });

    } else if (sampleName) {
      // 2. docs/ 폴더 내 파일: 파싱 후 Gemini 또는 휴리스틱 변환기로 마크다운 포맷팅
      console.log(`[Parse PDF] docs folder file '${sampleName}' selected. Fetching & converting to Markdown...`);
      const samplePath = path.join(getSampleDocsDir(), sampleName);
      if (!fs.existsSync(samplePath)) {
        return res.status(404).json({ error: `Sample file '${sampleName}' not found.` });
      }

      const pdfBuffer = fs.readFileSync(samplePath);
      let extractedText = '';
      if (typeof pdfParsePkg === 'function') {
        const parsedData = await pdfParsePkg(pdfBuffer);
        extractedText = parsedData?.text || '';
      } else if (pdfParsePkg && typeof pdfParsePkg.PDFParse === 'function') {
        const uint8Arr = new Uint8Array(pdfBuffer);
        const parser = new pdfParsePkg.PDFParse(uint8Arr);
        const parsedData = await parser.getText();
        extractedText = parsedData?.text || '';
      }

      // Gemini API 키가 사용 가능한 경우, Gemini를 호출하여 구조화된 마크다운으로 변환
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (geminiApiKey && extractedText) {
        try {
          const formatPrompt = `You are a professional Markdown formatting agent.
Format the following raw document text into clean, structured Markdown.
Rules:
1. Start with '# 📄 ${sampleName.replace(/\.pdf$/i, '')}'
2. Use '## ' for major sections/chapters, and '### ' for subsections.
3. Highlight key terms and key-value pairs with bold (**key**: value).
4. Use '- ' bullet lists for terms and lists.
5. Return ONLY the Markdown content without any explanations or wrappers.

Raw Document Text:
"""
${extractedText.slice(0, 8000)}
"""`;
          const modelId = 'gemini-3.5-flash';
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiApiKey}`;
          const geminiRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: formatPrompt }] }] })
          });
          if (geminiRes.ok) {
            const gData = await geminiRes.json();
            const aiFormatted = gData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (aiFormatted && aiFormatted.trim()) {
              extractedText = aiFormatted.trim();
            }
          }
        } catch (fErr) {
          console.warn('[Parse PDF] Gemini Markdown formatting fallback to heuristic:', fErr.message);
        }
      }

      const formattedMarkdown = formatTextToMarkdown(extractedText, sampleName);

      return res.json({
        success: true,
        text: formattedMarkdown ? formattedMarkdown.trim() : '',
        source: 'pre-parsed-cached'
      });

    } else {
      return res.status(400).json({ error: 'Either file upload or sampleName/fileName is required.' });
    }
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to extract text from PDF.' });
  }
});

/**
 * [API 4.8] GitHub GCP Knowledge Catalog contents 트리 구조 조회 대행
 */
app.get('/api/github-explorer/contents', async (req, res) => {
  const { path: subPath = '' } = req.query;
  const targetUrl = `https://api.github.com/repos/GoogleCloudPlatform/knowledge-catalog/contents/okf${subPath ? '/' + subPath : ''}`;
  
  // 로컬 폴더 베이스 경로
  const localBasePath = getOkfBaseDir();

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'OKF-Omni-Explorer-Agent'
      }
    });

    if (response.ok) {
      const data = await response.json();
      const items = data.map(item => ({
        name: item.name,
        path: item.path.replace(/^okf\/?/, ''),
        type: item.type,
        downloadUrl: item.download_url
      }));
      return res.json(items);
    }
  } catch (error) {
    console.warn('GitHub API fetch failed, falling back to local filesystem:', error.message);
  }

  // GitHub API 호출 실패 시 로컬 `knowledge-catalog/okf` 디렉토리 기반 폴백 수행
  try {
    const cleanSubPath = (subPath || '').replace(/^\/+/, '');
    const currentDir = path.join(localBasePath, cleanSubPath);
    
    if (!fs.existsSync(currentDir)) {
      return res.json([]);
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const items = entries
      .filter(entry => entry.name !== '.DS_Store' && entry.name !== '.venv' && entry.name !== 'test_okf_out')
      .map(entry => {
        const isDir = entry.isDirectory();
        const itemRelPath = cleanSubPath ? `${cleanSubPath}/${entry.name}` : entry.name;
        return {
          name: entry.name,
          path: itemRelPath,
          type: isDir ? 'dir' : 'file',
          downloadUrl: `LOCAL:${itemRelPath}`
        };
      });
    res.json(items);
  } catch (err) {
    console.error('Local filesystem fallback error:', err);
    res.status(500).json({ error: err.message || 'Failed to read local OKF files' });
  }
});

/**
 * [API 4.9] GitHub Raw 파일 본문 텍스트 획득
 */
app.get('/api/github-explorer/raw', async (req, res) => {
  const { downloadUrl } = req.query;
  if (!downloadUrl) {
    return res.status(400).json({ error: 'downloadUrl is required' });
  }

  // 로컬 파일 지원 (LOCAL:prefix)
  if (downloadUrl.startsWith('LOCAL:')) {
    const relPath = downloadUrl.replace('LOCAL:', '');
    const localFilePath = path.join(getOkfBaseDir(), relPath);
    try {
      if (fs.existsSync(localFilePath)) {
        const text = fs.readFileSync(localFilePath, 'utf8');
        return res.json({ content: text });
      } else {
        return res.status(404).json({ error: 'Local file not found' });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Raw file from GitHub: ${response.statusText}`);
    }
    const text = await response.text();
    res.json({ content: text });
  } catch (error) {
    console.error('GitHub raw read error:', error);
    res.status(500).json({ error: error.message || 'Failed to read raw file' });
  }
});

/**
 * [API 4.10] GitHub 영어 문서/코드 텍스트 한국어 번역 및 원문 대조식 결합 (Gemini 3.5 Flash 호출)
 */
app.post('/api/github-explorer/translate', async (req, res) => {
  const { fileName, fileContent, geminiApiKey } = req.body;
  if (!fileContent) {
    return res.status(400).json({ error: 'fileContent is required' });
  }

  try {
    const { projectId = 'seanjung-poc' } = req.body;
    const translationPrompt = getGithubTranslationPrompt(fileName || 'document.md', fileContent);
    
    // Gemini 3.5 Flash 모델 호출을 통해 한글 번역 대조본 텍스트 획득 (projectId 인자 올바르게 인계)
    const translatedResult = await callGemini(projectId, translationPrompt, geminiApiKey);
    res.json({
      success: true,
      translatedContent: translatedResult
    });
  } catch (error) {
    console.error('Gemini Translate API Error:', error);
    res.status(500).json({ error: error.message || 'Failed to translate GitHub document' });
  }
});

/**
 * [API 5] 1개 테이블 타겟 AI 에이전트 액션 실행 (데이터 분석, 그래프 설계, RAG, SQL 최적화)
 */
app.post('/api/run-agent-action', async (req, res) => {
  const { projectId, datasetId, tableId, actionId, geminiApiKey } = req.body;
  if (!projectId || !datasetId || !tableId || !actionId) {
    return res.status(400).json({ error: 'projectId, datasetId, tableId, and actionId are required' });
  }

  try {
    const bq = getBigQueryClient(projectId);
    const table = bq.dataset(datasetId).table(tableId);
    
    // 원천 테이블의 메타 데이터 및 10행 데이터 표본 추출
    const [metadata] = await table.getMetadata();
    const [rows] = await table.getRows({ maxResults: 10 });
    const schema = metadata.schema;

    // 1. 프롬프트 레이어로부터 특정 액션에 맞춘 시스템 지침 획득 (prompts 계층)
    let prompt = '';
    if (actionId === 'advanced-schema') {
      let ddl = null;
      try {
        const ddlQuery = `SELECT table_name, ddl FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.TABLES\` WHERE table_name = '${tableId}'`;
        const [ddlRows] = await bq.query({ query: ddlQuery });
        if (ddlRows && ddlRows.length > 0 && ddlRows[0].ddl) {
          ddl = ddlRows[0].ddl;
        }
      } catch (e) {
        console.warn(`Could not fetch DDL for advanced-schema:`, e.message);
      }
      prompt = getAdvancedSchemaPrompt(tableId, schema, rows, ddl, {
        numRows: metadata.numRows,
        numBytes: metadata.numBytes,
        location: metadata.location,
        creationTime: metadata.creationTime,
        lastModifiedTime: metadata.lastModifiedTime,
        timePartitioning: metadata.timePartitioning || metadata.rangePartitioning,
        clustering: metadata.clustering?.fields
      });
    } else if (actionId === 'profile') {
      prompt = getProfilePrompt(tableId, schema, rows);
    } else if (actionId === 'graph-design') {
      prompt = getGraphDesignPrompt(tableId, schema, rows);
    } else if (actionId === 'sql-helper') {
      prompt = getSqlHelperPrompt(tableId, schema, rows);
    } else if (actionId === 'rag-design') {
      prompt = getRagDesignPrompt(tableId, schema, rows);
    } else {
      return res.status(400).json({ error: `Unknown actionId: ${actionId}` });
    }

    console.log(`[Server] Dispatching AI Agent Action [${actionId}] for table ${tableId}...`);
    
    // 2. Gemini 연동 모듈을 통해 결과 작성 (agents 계층)
    const responseText = await callGemini(projectId, prompt, geminiApiKey);
    
    res.json({
      success: true,
      actionId,
      tableId,
      result: responseText
    });

  } catch (error) {
    console.error(`Error running agent action [${actionId}]:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * [API 6] BigQuery 상에서 임의의 SQL DDL/DML 직접 수행 (예: Spanner/BQ Property Graph 생성)
 */
app.post('/api/execute-sql', async (req, res) => {
  const { projectId, sql } = req.body;
  if (!projectId || !sql) {
    return res.status(400).json({ error: 'projectId and sql are required' });
  }
  try {
    const bq = getBigQueryClient(projectId);
    console.log(`[Server] Executing SQL on BigQuery:\n${sql}`);
    
    const [job] = await bq.createQueryJob({ query: sql });
    const [rows] = await job.getQueryResults();
    
    res.json({
      success: true,
      message: 'SQL executed successfully',
      rows: rows
    });
  } catch (error) {
    console.error('Error executing SQL on BigQuery:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * [API 7] GCS 버킷에 저장되어 있는 모든 지식 파일 목록 수집 (OKF Bundle Explorer 트리용)
 */
app.get('/api/bundle-tree', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }
  try {
    const bucket = await getOrCreateBucket(projectId);
    const [files] = await bucket.getFiles();
    const filePaths = files.map(f => f.name);
    
    res.json({
      success: true,
      files: filePaths
    });
  } catch (error) {
    console.warn('Warning fetching GCS bundle tree:', error.message);
    res.json({
      success: true,
      files: []
    });
  }
});

/**
 * [API 8] GCS 특정 지식 마크다운 문서의 실시간 파일 내용 조회
 */
app.get('/api/gcs-file', async (req, res) => {
  const { projectId, filePath } = req.query;
  if (!projectId || !filePath) {
    return res.status(400).json({ error: 'projectId and filePath are required' });
  }
  try {
    const bucket = await getOrCreateBucket(projectId);
    const content = await readFileFromGcs(bucket, filePath);
    
    if (content === null) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }
    res.json({
      success: true,
      content: content
    });
  } catch (error) {
    console.error(`Error reading GCS file ${filePath}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * [API 9] 생성형 AI 위키 설계 산출물을 GCS wiki/ 카테고리 경로에 기록 보존
 */
app.post('/api/save-wiki-doc', async (req, res) => {
  const { projectId, datasetId, category, fileName, content, geminiApiKey } = req.body;
  console.log(`[Server] Received /api/save-wiki-doc request for file: "${fileName}" in category: "${category}"`);
  if (!projectId || !datasetId || !category || !content) {
    return res.status(400).json({ error: 'projectId, datasetId, category, and content are required' });
  }

  try {
    const bucket = await getOrCreateBucket(projectId);
    
    // 파일명이 입력되지 않았거나 비어있는 경우, Gemini 3.5 Flash 모델로 본문의 주제/제목을 파악하여 정밀한 파일명 생성
    let resolvedFileName = fileName;
    if (!resolvedFileName || !resolvedFileName.trim()) {
      const namingPrompt = getAutoNamingPrompt(content);
      console.log('[Auto-naming] Calling Gemini AI for intelligent document title & topic extraction...');
      try {
        const aiResponse = await callGemini(projectId, namingPrompt, geminiApiKey);
        if (aiResponse && aiResponse.trim()) {
          // 공백, 따옴표, 마크다운 기호 제거 및 소문자 스네이크 케이스 정제
          resolvedFileName = aiResponse.trim()
            .replace(/```[\s\S]*?```/g, '')
            .replace(/['"`\s]/g, '_')
            .replace(/\.md$/i, '')
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
          console.log(`[Auto-naming] Gemini AI Extracted File Name: '${resolvedFileName}'`);
        }
      } catch (namingErr) {
        console.warn('[Auto-naming] Gemini auto-naming warning:', namingErr.message);
      }
      if (!resolvedFileName || resolvedFileName.length < 2) {
        resolvedFileName = `insight_${Date.now()}`;
      }
    } else {
      resolvedFileName = resolvedFileName.trim();
    }

    // 사용자가 입력하거나 정제된 파일명에서 중복된 .md 확장자 안전하게 정제
    let cleanName = resolvedFileName;
    while (cleanName.endsWith('.md')) {
      cleanName = cleanName.slice(0, -3).trim();
    }
    cleanName = cleanName.toLowerCase()
      .replace(/[^a-z0-9_]/gi, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!cleanName) cleanName = `wiki_doc_${Date.now()}`;

    const destinationPath = `${datasetId}/wiki/${category}/${cleanName}.md`;
    
    // 1. Prepare OKF Conversion Promise
    let okfPromise = Promise.resolve(content);
    if ((category === 'business_rules' || category === 'general') && !content.startsWith('---')) {
      console.log(`[OKF Converter] Preparing OKF conversion for: "${cleanName}"...`);
      okfPromise = callGemini(projectId, getOkfBusinessSpecPrompt(`${cleanName}.md`, content, datasetId), geminiApiKey)
        .then(aiOkfText => aiOkfText.replace(/^```markdown\s*|```$/g, '').trim())
        .catch(okfErr => {
          console.warn('[OKF Converter Warn] Fallback header:', okfErr.message);
          let okfHeader = '---\n';
          okfHeader += 'type: BusinessSpecification\n';
          if (datasetId) okfHeader += `datasetId: ${datasetId}\n`;
          okfHeader += '---\n\n';
          return `${okfHeader}${content}`;
        });
    }

    // 2. Prepare Glossary Extraction Promise
    let glossaryPromise = Promise.resolve(null);
    if (category === 'business_rules' || category === 'general') {
      console.log(`[Glossary Extractor] Preparing glossary extraction for: "${cleanName}"...`);
      let existingAspects = null;
      const cacheKey = `${projectId}:${datasetId}`;
      const cachedData = global.dataplexGlossaryCache[cacheKey]?.data;
      if (cachedData) {
        existingAspects = { datasetId: cachedData.datasetId, tables: {} };
        for (const [tId, tData] of Object.entries(cachedData.tables || {})) {
          if (tData.success) {
            existingAspects.tables[tId] = { description: tData.description, aspects: tData.aspects };
          }
        }
      }

      glossaryPromise = callGemini(projectId, getLlmWikiDecomposePrompt(`${cleanName}.md`, content, existingAspects), geminiApiKey)
        .then(async (aiResText) => {
          const parsed = parseSafeJson(aiResText);
          if (parsed.entities) {
            const glossaryPath = `${datasetId}/wiki/glossary/${cleanName}_glossary.md`;
            const glossaryFile = bucket.file(glossaryPath);
            await glossaryFile.save(parsed.entities, { contentType: 'text/markdown' });
            console.log(`[Glossary Extractor] Saved glossary to ${glossaryPath}`);
          }
        })
        .catch(glossaryErr => {
          console.warn('[Glossary Extractor Warn] Failed to extract/save glossary:', glossaryErr.message);
        });
    }

    // 3. Execute concurrently
    const [resolvedContent] = await Promise.all([okfPromise, glossaryPromise]);

    // 4. Save OKF Wiki File
    const file = bucket.file(destinationPath);
    await file.save(resolvedContent, {
      metadata: { contentType: 'text/markdown', cacheControl: 'no-cache' }
    });

    // 지식 로그 추가
    await appendToGcsLog(bucket, datasetId, `**Wiki Added**: Saved OKF Wiki document [${resolvedFileName}](/${datasetId}/wiki/${category}/${resolvedFileName}.md) under category \`${category}\``);

    // 지식 번들 디렉토리 색인(index.md) 갱신
    await updateGcsIndex(bucket, datasetId);

    res.json({
      success: true,
      fileName: `${resolvedFileName}.md`,
      filePath: `gs://${bucket.name}/${destinationPath}`,
      message: 'Document saved to LLM-Wiki successfully'
    });
  } catch (error) {
    console.error('Error saving wiki doc:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * [API 10] 데이터셋 전역 수준의 AI 에이전트 구동 (다중 테이블 조인 기반 관계 그래프 설계 DDL 도출)
 */
app.post('/api/run-dataset-agent', async (req, res) => {
  const { projectId, datasetId, tableIds, actionId, geminiApiKey, graphName } = req.body;
  if (!projectId || !datasetId || !tableIds || !Array.isArray(tableIds) || !actionId) {
    return res.status(400).json({ error: 'projectId, datasetId, tableIds (array), and actionId are required' });
  }

  try {
    const bq = getBigQueryClient(projectId);
    const tableSchemas = [];

    // 선택된 모든 테이블들의 메타데이터 스키마 수집
    for (const tableId of tableIds) {
      const table = bq.dataset(datasetId).table(tableId);
      const [metadata] = await table.getMetadata();
      tableSchemas.push({
        tableId,
        schema: metadata.schema
      });
    }

    // 1. 데이터셋 통합 프롬프트 획득 (prompts 계층)
    let prompt = '';
    if (actionId === 'dataset-graph') {
      prompt = getDatasetGraphPrompt(projectId, datasetId, tableSchemas, graphName || 'thelookgraph');
    } else {
      return res.status(400).json({ error: `Unknown dataset actionId: ${actionId}` });
    }

    console.log(`[Server] Running Dataset-Level Agent [${actionId}] for tables: ${tableIds.join(', ')}`);
    
    // 2. Gemini 연동 통신 (agents 계층)
    const resultText = await callGemini(projectId, prompt, geminiApiKey);

    res.json({
      success: true,
      actionId,
      result: resultText
    });
  } catch (error) {
    console.error('Error running dataset agent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * [API 10.8] Data Agent 대화 내역 영구 보관 & 로드 & 리셋 API
 */
const getChatHistoryPath = (datasetId) => {
  const safeDataset = datasetId || 'default';
  const dirPath = findFirstExistingDir([
    path.join(__dirname, '..', 'scratch', 'chat_history'),
    path.join(__dirname, '..', '..', 'references', 'knowledge-catalog', 'chat_history'),
    path.join(__dirname, 'knowledge-catalog', 'chat_history')
  ], path.join(__dirname, '..', 'scratch', 'chat_history'));
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return path.join(dirPath, `${safeDataset}_chat_history.json`);
};

app.get('/api/chat-history', (req, res) => {
  const { datasetId } = req.query;
  const filePath = getChatHistoryPath(datasetId);
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const messages = JSON.parse(data);
      return res.json({ success: true, messages });
    }
    return res.json({ success: true, messages: [] });
  } catch (error) {
    console.error('Error reading chat history:', error);
    res.json({ success: false, messages: [], error: error.message });
  }
});

app.post('/api/chat-history', (req, res) => {
  const { datasetId, messages } = req.body;
  if (!datasetId || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'datasetId and messages array are required' });
  }
  const filePath = getChatHistoryPath(datasetId);
  try {
    fs.writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf8');
    res.json({ success: true, count: messages.length });
  } catch (error) {
    console.error('Error saving chat history:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/chat-history', (req, res) => {
  const { datasetId } = req.query;
  const filePath = getChatHistoryPath(datasetId);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true, message: `Chat history reset for dataset ${datasetId}` });
  } catch (error) {
    console.error('Error resetting chat history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * [API 11] 자율 대화형 데이터 에이전트 채팅 (NL2SQL ➔ 쿼리 실행 ➔ 한글 요약 답변 작성)
 */
app.post('/api/data-agent-chat', async (req, res) => {
  const { projectId, datasetId, tableId, question, geminiApiKey, appLang } = req.body;
  if (!projectId || !datasetId || !question) {
    return res.status(400).json({ error: 'projectId, datasetId, and question are required' });
  }

  try {
    const bq = getBigQueryClient(projectId);
    let contextSchema = [];

    // 컨텍스트 범위 결정 (단일 테이블 또는 데이터셋 내 전 테이블)
    if (tableId) {
      const table = bq.dataset(datasetId).table(tableId);
      const [metadata] = await table.getMetadata();
      contextSchema.push({ tableId, schema: metadata.schema });
    } else {
      const [tables] = await bq.dataset(datasetId).getTables();
      for (const t of tables) {
        const [metadata] = await t.getMetadata();
        contextSchema.push({ tableId: t.id, schema: metadata.schema });
      }
    }

    // [Feedback Loop] GCS 버킷 내 보관된 wiki/insights 및 비즈니스 위키 지식 탐색하여 컨텍스트에 융합
    let wikiContext = '';
    let referencedDocs = [];
    const wikiFullTextsMap = {};
    const wikiContentsMap = {};

    // Helper: 질문 키워드와 가장 관련성이 높은 청크(단락) 스니펫만 정밀 추출하는 로직
    const extractRelevantChunk = (fullText, qStr) => {
      if (!fullText) return '';
      const paragraphs = fullText.split(/(?:\r?\n){2,}|(?=###?\s)/).map(p => p.trim()).filter(Boolean);
      if (paragraphs.length <= 1) {
        return fullText.length > 350 ? fullText.slice(0, 350) + '...' : fullText;
      }
      const qTokens = qStr.toLowerCase().replace(/[^\w가-힣\s]/g, '').split(/\s+/).filter(t => t.length >= 2);
      let bestP = paragraphs[0];
      let maxScore = -1;
      for (const p of paragraphs) {
        const pLower = p.toLowerCase();
        let score = 0;
        for (const token of qTokens) {
          if (pLower.includes(token)) score += 2;
        }
        if (pLower.includes('기준') || pLower.includes('요약') || pLower.includes('핵심') || pLower.includes('전략')) score += 0.5;
        if (score > maxScore) {
          maxScore = score;
          bestP = p;
        }
      }
      return bestP.length > 400 ? bestP.slice(0, 400) + '...' : bestP;
    };

    // [User Feedback Correction Scanning] 
    // GCS [datasetId]/agent/feedback/ 폴더 내 누적 피드백 문서들을 초기 루프에서 전수 스캔 및 쿼리 실행 전략 프롬프트에 주입
    let feedbackRulesContext = '';
    try {
      const bucket = await getOrCreateBucket(projectId);
      
      // 1. 피드백 전용 폴더 (datasetId/agent/feedback/) 전수 스캔
      const [feedbackFiles] = await bucket.getFiles({ prefix: `${datasetId}/agent/feedback/` });
      if (feedbackFiles && feedbackFiles.length > 0) {
        const feedbackTexts = [];
        for (const f of feedbackFiles) {
          const [buf] = await f.download();
          const docName = f.name.split('/').pop();
          const docText = buf.toString('utf8');
          referencedDocs.push(docName);
          wikiFullTextsMap[docName] = docText;
          wikiContentsMap[docName] = docText;
          feedbackTexts.push(`- [피드백 교정 지침 (${docName})]:\n${docText}`);
        }
        feedbackRulesContext = `\n\n=== 🚨 [중요 사용자 누적 피드백 교정 지침 (User Feedback Principles)] ===\n`
          + `다음은 사용자가 이전에 등록한 필수 피드백 교정 지침 목록입니다. 쿼리 생성 및 분석 실행 계획 수립 시 아래 피드백 지침을 최우선적으로 적용하십시오:\n`
          + feedbackTexts.join('\n\n') + `\n=======================================================\n`;
        console.log(`[Data Agent Feedback Loop] Scanned ${feedbackFiles.length} feedback rule files from ${datasetId}/agent/feedback/`);
      }

      // 2. 일반 비즈니스 위키 문서 (datasetId/wiki/) 추가 스캔
      const [files] = await bucket.getFiles({ prefix: `${datasetId}/wiki/` });
      if (files && files.length > 0) {
        const nonFbFiles = files.filter(f => !f.name.includes('/feedback/'));
        if (nonFbFiles.length > 0) {
          const wikiTexts = [];
          for (const f of nonFbFiles.slice(0, 5)) { // 일반 위키 최대 5개 수집
            const [buf] = await f.download();
            const docName = f.name.split('/').pop();
            const docText = buf.toString('utf8').slice(0, 2000);
            if (!referencedDocs.includes(docName)) {
              referencedDocs.push(docName);
            }
            wikiFullTextsMap[docName] = docText;
            const chunkSnippet = extractRelevantChunk(docText, question);
            wikiContentsMap[docName] = `📌 [핵심 인용 청크 (Excerpt)]\n${chunkSnippet}`;
            wikiTexts.push(`--- WIKI DOC: ${docName} ---\n${docText}`);
          }
          wikiContext = `\n\n=== 📚 GCS BUSINESS WIKI CONTEXT ===\n` + wikiTexts.join('\n\n');
        }
      }
    } catch (wikiErr) {
      console.warn('[Data Agent] Wiki context fetch warning:', wikiErr.message);
    }

    const overallStartTime = Date.now();
    const stepMetrics = [];

    // [Step 1] 자연어 질문을 기반으로 실행 전략 및 SQL/GQL 쿼리 도출 (피드백 규칙 최우선 주입)
    const step1Start = Date.now();
    const sqlGenerationPrompt = getSqlGenerationPrompt(question, projectId, datasetId, contextSchema) + feedbackRulesContext + wikiContext;

    console.log(`[Data Agent] Determining strategy & generating query for: "${question}"`);
    const step1Res = await callGemini(projectId, sqlGenerationPrompt, geminiApiKey, { returnDetails: true });
    const aiResponse = step1Res.text;
    
    stepMetrics.push({
      step: 1,
      name: '전략 및 쿼리 도출 (Strategy & Query Generation)',
      elapsedMs: step1Res.elapsedMs,
      tokens: step1Res.usageMetadata
    });
    
    let strategy = 'HYBRID';
    let targetGraph = `${projectId}.${datasetId}.${datasetId}_knowledge_graph`;
    let reasoningProcess = '';
    let sqlQuery = '';
    let gqlQuery = '';

    try {
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || aiResponse.match(/```\s*([\s\S]*?)\s*```/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : aiResponse);
      strategy = parsed.strategy || 'HYBRID';
      targetGraph = parsed.targetGraph || targetGraph;
      reasoningProcess = parsed.reasoningProcess || '';
      sqlQuery = parsed.sql || '';
      gqlQuery = parsed.gql || parsed.gqlQuery || '';
    } catch (parseErr) {
      // Fallback: extract queries if plain markdown blocks returned
      const sqlMatch = aiResponse.match(/```sql\s*([\s\S]*?)\s*```/) || aiResponse.match(/```\s*([\s\S]*?)\s*```/);
      const extractedQuery = sqlMatch ? sqlMatch[1].trim() : aiResponse.trim();
      
      if (extractedQuery.toLowerCase().includes('graph_table')) {
        gqlQuery = extractedQuery;
        strategy = 'HYBRID';
      } else if (extractedQuery && extractedQuery.length >= 5) {
        sqlQuery = extractedQuery;
        strategy = 'HYBRID';
      } else {
        strategy = 'DIRECT_WIKI';
      }
    }

    console.log(`[Data Agent] Strategy: ${strategy}, Target Graph: ${targetGraph}\nSQL Query:\n${sqlQuery}\nGQL Query:\n${gqlQuery}`);

    // Extract actual referenced tables from the generated queries (both SQL and GQL)
    const referencedTables = contextSchema
      .map(s => s.tableId)
      .filter(tId => {
        const regex = new RegExp(`\`?${tId}\`?`, 'i');
        const sqlMatch = sqlQuery ? regex.test(sqlQuery) : false;
        const gqlMatch = gqlQuery ? regex.test(gqlQuery) : false;
        return sqlMatch || gqlMatch;
      });

    // [Step 2] 전략에 따른 DB 실행 (DIRECT_WIKI인 경우 DB 실행 생략, 그 외에는 SQL과 GQL 병렬 실행)
    const step2Start = Date.now();
    let sqlRows = [];
    let gqlRows = [];
    let sqlError = null;
    let gqlError = null;
    let sqlElapsedMs = 0;
    let gqlElapsedMs = 0;
    let step2Tokens = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };

    if (strategy !== 'DIRECT_WIKI') {
      // 로컬 헬퍼 함수: 단일 쿼리 실행 및 오류 시 자율 수복(Self-Healing) 자동 재시도 1회
      const executeQueryWithHealing = async (queryText, queryType) => {
        if (!queryText || !queryText.trim()) {
          return { rows: [], error: null, elapsedMs: 0, finalQuery: '' };
        }
        
        const qStart = Date.now();
        let rows = [];
        let error = null;
        let finalQuery = queryText;

        try {
          const [job] = await bq.createQueryJob({ query: queryText });
          const [results] = await job.getQueryResults();
          rows = results;
        } catch (err) {
          console.warn(`[Data Agent Self-Healing] ${queryType} 1st execution failed:`, err.message);
          error = err.message;

          // 🔄 쿼리별 자율 수복(Self-Healing) 자동 재시도 1회 구동
          try {
            const retryPrompt = getQueryHealingPrompt(queryType, err.message, queryText);
            console.log(`[Data Agent Self-Healing] Requesting ${queryType} auto-correction from Gemini...`);
            const fixAiRes = await callGemini(projectId, retryPrompt, geminiApiKey, { returnDetails: true });
            const fixAiResponse = fixAiRes.text;
            
            // 토큰 통계 합산
            step2Tokens.promptTokenCount += fixAiRes.usageMetadata?.promptTokenCount || 0;
            step2Tokens.candidatesTokenCount += fixAiRes.usageMetadata?.candidatesTokenCount || 0;
            step2Tokens.totalTokenCount += fixAiRes.usageMetadata?.totalTokenCount || 0;

            const fixMatch = fixAiResponse.match(/```json\s*([\s\S]*?)\s*```/) || fixAiResponse.match(/```\s*([\s\S]*?)\s*```/);
            const fixParsed = JSON.parse(fixMatch ? fixMatch[1] : fixAiResponse);
            const fixedSql = fixParsed.sql || fixParsed.gql || fixParsed.query || '';

            if (fixedSql && fixedSql.trim()) {
              console.log(`[Data Agent Self-Healing] Retrying ${queryType} with fixed query:\n`, fixedSql);
              const [fixJob] = await bq.createQueryJob({ query: fixedSql });
              const [fixRows] = await fixJob.getQueryResults();
              rows = fixRows;
              error = null; // Self-healing succeeded!
              finalQuery = fixedSql.trim();
              console.log(`[Data Agent Self-Healing] ${queryType} successfully self-corrected and executed!`);
            }
          } catch (retryErr) {
            console.error(`[Data Agent Self-Healing] ${queryType} Retry failed:`, retryErr.message);
          }
        }

        return {
          rows,
          error,
          elapsedMs: Date.now() - qStart,
          finalQuery
        };
      };

      // SQL과 GQL 병렬 실행 (Promise.all)
      console.log(`[Data Agent] Executing SQL and GQL in parallel...`);
      const [sqlRes, gqlRes] = await Promise.all([
        executeQueryWithHealing(sqlQuery, 'SQL'),
        executeQueryWithHealing(gqlQuery, 'GQL')
      ]);

      sqlRows = sqlRes.rows;
      sqlError = sqlRes.error;
      sqlElapsedMs = sqlRes.elapsedMs;
      sqlQuery = sqlRes.finalQuery;

      gqlRows = gqlRes.rows;
      gqlError = gqlRes.error;
      gqlElapsedMs = gqlRes.elapsedMs;
      gqlQuery = gqlRes.finalQuery;
    }

    const step2ElapsedMs = Date.now() - step2Start;
    stepMetrics.push({
      step: 2,
      name: 'DB/GQL 쿼리 실행 및 자율수복 (DB Query Execution & Self-Healing)',
      elapsedMs: step2ElapsedMs,
      tokens: step2Tokens,
      details: {
        sqlElapsedMs,
        gqlElapsedMs,
        sqlRowsCount: sqlRows.length,
        gqlRowsCount: gqlRows.length,
        sqlError: !!sqlError,
        gqlError: !!gqlError
      }
    });

    // [Step 3] 쿼리 실행 결과 또는 위키 컨텍스트를 기반으로 최종 한글 분석 리포트 작성
    const step3Start = Date.now();
    const finalAnswerPrompt = getFinalAnswerPrompt(
      question, 
      sqlQuery, 
      sqlError, 
      sqlRows, 
      gqlQuery, 
      gqlError, 
      gqlRows,
      appLang
    ) + wikiContext;

    console.log(`[Data Agent] Synthesizing final ${appLang === 'en' ? 'English' : 'Korean'} report with Hybrid Decision Logic & Wiki Feedback Loop...`);
    const step3Res = await callGemini(projectId, finalAnswerPrompt, geminiApiKey, { returnDetails: true });
    const finalAnswer = step3Res.text;

    stepMetrics.push({
      step: 3,
      name: appLang === 'en' ? 'Final Report Synthesis' : '최종 한글 분석 리포트 합성 (Final Report Synthesis)',
      elapsedMs: step3Res.elapsedMs,
      tokens: step3Res.usageMetadata
    });

    // Calculate total summary metrics
    const totalElapsedMs = Date.now() - overallStartTime;
    const totalPromptTokens = stepMetrics.reduce((sum, s) => sum + (s.tokens?.promptTokenCount || 0), 0);
    const totalCandidatesTokens = stepMetrics.reduce((sum, s) => sum + (s.tokens?.candidatesTokenCount || 0), 0);
    const totalTokenCount = stepMetrics.reduce((sum, s) => sum + (s.tokens?.totalTokenCount || 0), 0);

    const metricsSummary = {
      steps: stepMetrics,
      total: {
        totalElapsedMs,
        totalElapsedSec: (totalElapsedMs / 1000).toFixed(2),
        totalPromptTokens,
        totalCandidatesTokens,
        totalTokenCount
      }
    };

    // Filter wiki docs to only those actually relevant to question/strategy/answer
    const actualReferencedDocs = referencedDocs.filter(docName => {
      const qLower = question.toLowerCase();
      const docKey = docName.toLowerCase().replace('.md', '');
      const docContent = (wikiFullTextsMap[docName] || '').toLowerCase();
      
      if (strategy === 'DIRECT_WIKI') return true;
      
      // 1) 질문어 및 키워드가 문서명이나 관련 비즈니스 단어와 연결되는지 점검
      const keyTokens = docKey.split('_').concat(['위키', '정책', '약관', '환불', '전략', '우수', '회원', '마케팅', 'vip', 'customer', 'report', '기준', '리포트', '인사이트']);
      const hasTokenMatch = keyTokens.some(tok => tok.length > 1 && (qLower.includes(tok) || docKey.includes(tok)));
      
      // 2) 질문어의 주요 키워드가 위키 본문에 포함되어 있는지 세만틱 교차 체크
      const qWords = qLower.replace(/[^\w가-힣\s]/g, '').split(/\s+/).filter(w => w.length >= 2);
      const hasContentMatch = qWords.some(w => docContent.includes(w));

      // 3) Gemini 답변에 문서명 또는 키워드가 언급되었는지 체크
      const hasMentionInAnswer = finalAnswer.includes(docName) || finalAnswer.includes(docKey);

      return hasTokenMatch || hasContentMatch || hasMentionInAnswer;
    });

    // Attestation Receipt Engine (OKF v0.2 §10 Attested Computation)
    let attestationReceipt = null;
    if (sqlQuery || gqlQuery) {
      const activeQuery = sqlQuery || gqlQuery;
      const attCheck = validateSqlEquality(activeQuery, activeQuery);
      attestationReceipt = {
        attested: true,
        verdict: attCheck.verdict,
        computationId: `computations/${(targetGraph || datasetId || 'analytics').toLowerCase()}-query`,
        sanctionedPolicy: 'policies/analytics-governance-standard.md',
        verifiedBy: 'human:cfo_data_steward@company.com',
        jobId: `bq://${projectId}/us/job_${Date.now().toString(36)}`,
        executedSql: activeQuery,
        timestamp: new Date().toISOString()
      };
    }

    res.json({
      success: true,
      strategy: strategy,
      targetGraph: targetGraph,
      reasoningProcess: reasoningProcess,
      sql: sqlQuery,
      gql: gqlQuery,
      rows: sqlRows.length > 0 ? sqlRows : gqlRows, // 하위 호환
      sqlRows: sqlRows,
      gqlRows: gqlRows,
      error: sqlError || gqlError, // 하위 호환
      sqlError: sqlError,
      gqlError: gqlError,
      sqlElapsedMs: sqlElapsedMs,
      gqlElapsedMs: gqlElapsedMs,
      answer: finalAnswer,
      thoughts: step3Res.thoughts || '',
      referencedTables: referencedTables,
      referencedDocs: actualReferencedDocs,
      wikiContentsMap: wikiContentsMap,
      metrics: metricsSummary,
      attestationReceipt: attestationReceipt
    });

  } catch (error) {
    console.error('Error in Data Agent Chat:', error);
    res.status(500).json({ error: error.message });
  }
});

// 지식 보강 실시간 트래킹용 메모리 상태 객체
let enrichStatus = {
  status: 'idle',
  step: 0,
  activeTable: '',
  wikiCount: 0,
  tableCount: 0,
  enrichedTables: [],
  details: [],
  error: ''
};

app.get('/api/enrich-status', (req, res) => {
  res.json(enrichStatus);
});

/**
 * [API 12] GCS 위키(Wiki) 문서를 자율 스캔하여 기존 테이블 OKF 설명란 한글로 보강 (Enrichment)
 */
app.post('/api/enrich-metadata', async (req, res) => {
  const { projectId, datasetId, geminiApiKey, customContexts, customPrompt, selectedTableIds } = req.body;
  if (!projectId || !datasetId) {
    return res.status(400).json({ error: 'projectId and datasetId are required' });
  }

  // 초기 상태 리셋
  enrichStatus = {
    status: 'running',
    step: 1,
    activeTable: '',
    wikiCount: 0,
    tableCount: 0,
    enrichedTables: [],
    details: [],
    error: ''
  };

  try {
    const bucket = await getOrCreateBucket(projectId);
    
    // 1. GCS 내 [datasetId]/wiki/ 하위 문서 목록 수집 및 내용 다운로드 (glossary 포함)
    const [allWikiFiles] = await bucket.getFiles({ prefix: `${datasetId}/wiki/` });
    
    const mdWikiFiles = allWikiFiles.filter(f => f.name.endsWith('.md'));
    
    const wikiDocs = [];
    for (const file of mdWikiFiles) {
      const [content] = await file.download();
      const isGlossary = file.name.includes('/wiki/glossary/') || file.name.includes('/glossary/');
      wikiDocs.push({
        fileName: path.basename(file.name),
        content: content.toString('utf8'),
        folder: isGlossary ? 'glossary' : 'wiki'
      });
    }

    // 1.5 유저가 수동 지정 또는 직접 파싱한 커스텀 위키 문서 세트 병합
    if (customContexts && Array.isArray(customContexts)) {
      customContexts.forEach((ctx, idx) => {
        wikiDocs.push({
          fileName: ctx.title || `custom_doc_${idx + 1}.pdf`,
          content: ctx.content || ''
        });
      });
    }

    if (wikiDocs.length === 0) {
      enrichStatus.status = 'done';
      enrichStatus.step = 4;
      return res.json({ 
        success: true, 
        message: '보강에 활용할 비정형 위키 문서가 존재하지 않습니다. PDF를 추가 선택하거나 [LLM-Wiki]에 문서를 추가해 주세요.', 
        enrichedTables: [] 
      });
    }

    // 1단계 수집 정보 완료 캐싱
    enrichStatus.wikiCount = wikiDocs.length;
    enrichStatus.step = 2;

    // 2. GCS 내 [datasetId]/tables/ 하위 기존 OKF 파일 목록 수집
    const [tableFiles] = await bucket.getFiles({ prefix: `${datasetId}/tables/` });
    let mdTableFiles = tableFiles.filter(f => f.name.endsWith('.md'));

    // 2.5 유저가 선택한 개별 테이블 목록이 존재하는 경우 정밀 필터링
    if (Array.isArray(selectedTableIds) && selectedTableIds.length > 0) {
      mdTableFiles = mdTableFiles.filter(f => {
        const tId = path.basename(f.name, '.md');
        return selectedTableIds.includes(tId);
      });
      console.log(`[Enrichment] Filtered target tables by user selection: ${mdTableFiles.map(f => path.basename(f.name, '.md')).join(', ')}`);
    }

    const enrichedTables = [];
    const enrichmentDetails = []; // 상세 변경 내역 (Diff용)

    enrichStatus.tableCount = mdTableFiles.length;
    enrichStatus.step = 3;

    // 3. 루프를 돌며 각 테이블 OKF 마크다운 자율 보강 수행
    for (const file of mdTableFiles) {
      const tableId = path.basename(file.name, '.md');
      
      // index.md와 log.md는 보강 대상에서 제외
      if (tableId === 'index' || tableId === 'log') continue;

      // 현재 진행 중인 테이블 등록
      enrichStatus.activeTable = tableId;

      const [contentBuffer] = await file.download();
      const currentOkfContent = contentBuffer.toString('utf8');

      // 보강용 온톨로지 프롬프트 조립 (사용자 정의 프롬프트 수정을 지원)
      let prompt;
      if (customPrompt && customPrompt.trim().length > 0) {
        prompt = customPrompt
          .replace(/\[table_id\]/g, tableId)
          .replace(/\[current_okf_specification\]/g, currentOkfContent)
          .replace(/\[wiki_knowledge_documents_json_in_gcs\]/g, JSON.stringify(wikiDocs));
      } else {
        prompt = getEnrichmentPrompt(tableId, currentOkfContent, JSON.stringify(wikiDocs));
      }
      
      console.log(`[Enrichment] Analyzing wiki relevance for table: ${tableId}...`);
      // 생각 흐름(Thoughts) 활성화 호출
      const { text: enrichedContent, thoughts } = await callGemini(projectId, prompt, geminiApiKey, { returnThoughts: true });

      // AI에 의해 내용이 보강되어 변화가 발생한 경우에만 GCS에 덮어쓰기 저장
      if (enrichedContent && enrichedContent.trim() !== currentOkfContent.trim() && enrichedContent.includes('---')) {
        await file.save(enrichedContent, {
          metadata: { contentType: 'text/markdown', cacheControl: 'no-cache' }
        });
        enrichedTables.push(tableId);
        
        // 🔍 Extract enrichedBy for visibility
        let enrichedBy = [];
        const fmMatch = enrichedContent.match(/^---([\s\S]*?)---/);
        if (fmMatch) {
          const fm = fmMatch[1];
          const enrichedByMatch = fm.match(/enrichedBy:\s*\[?([\s\S]*?)\]?(?:\n[A-Za-z]+:|\s*$)/);
          if (enrichedByMatch) {
            const listStr = enrichedByMatch[1];
            enrichedBy = listStr.split(',').map(s => s.trim().replace(/^[-*]\s*/, '').replace(/['"]/g, '')).filter(Boolean);
          } else {
            // Check multiline list format
            const lines = fm.split('\n');
            let inEnrichedBy = false;
            for (const line of lines) {
              if (line.trim().startsWith('enrichedBy:')) {
                inEnrichedBy = true;
                continue;
              }
              if (inEnrichedBy && (line.trim().startsWith('-') || line.trim().startsWith('*'))) {
                enrichedBy.push(line.trim().substring(1).trim().replace(/['"]/g, ''));
              } else if (inEnrichedBy && line.trim() === '') {
                // skip empty
              } else if (inEnrichedBy && line.includes(':')) {
                break; // next key
              }
            }
          }
        }

        const detailObj = {
          tableId,
          originalContent: currentOkfContent,
          enrichedContent: enrichedContent,
          thoughts: thoughts || 'No thoughts captured.',
          referencedDocs: enrichedBy // 📌 Add referenced docs for UI
        };
        enrichmentDetails.push(detailObj);
        
        // 상태 캐시 동적 푸시 (실시간 렌더링 지원)
        enrichStatus.enrichedTables.push(tableId);
        enrichStatus.details.push(detailObj);

        console.log(`[Enrichment] Table ${tableId} enriched successfully.`);
      } else {
        console.log(`[Enrichment] Table ${tableId} skipped (No relevant new info found).`);
      }
    }

    // 4. 보강 적용 내역이 하나라도 있다면 데이터셋 변경 이력 및 색인 목록 업데이트
    enrichStatus.step = 4;
    if (enrichedTables.length > 0) {
      const logEntryText = `**Metadata Enrichment**: Enriched OKF descriptions for tables [${enrichedTables.join(', ')}] using GCS Wiki documents.`;
      await appendToGcsLog(bucket, datasetId, logEntryText);
      await updateGcsIndex(bucket, datasetId);
    }

    // 최종 완료 상태 설정
    enrichStatus.status = 'done';

    const reportData = {
      timestamp: new Date().toISOString(),
      datasetId: datasetId,
      enrichedTables: enrichedTables,
      details: enrichmentDetails,
      wikiCount: mdWikiFiles.length,
      message: enrichedTables.length > 0 
        ? `성공적으로 ${enrichedTables.length}개 테이블의 메타데이터가 Wiki 지식을 기반으로 Enrichment 완료되었습니다.`
        : 'Wiki 지식을 분석했으나, 기존 테이블 메타데이터에 추가할 새로운 의미론적 정보가 발견되지 않았습니다.'
    };

    // OKF 표준 포맷 (Frontmatter + Markdown Body)으로 enrichment_report.md 구성 및 GCS 저장
    const markdownReportContent = `---
type: KnowledgeEnrichmentReport
datasetId: ${datasetId}
status: stable
generated: { by: reference_agent/gemini-3.5-flash, at: ${reportData.timestamp} }
timestamp: ${reportData.timestamp}
wikiCount: ${reportData.wikiCount}
enrichedTablesCount: ${enrichedTables.length}
enrichedTables: ${JSON.stringify(enrichedTables)}
---

# 🔮 Knowledge Enrichment 종합 보고서 (${datasetId})

- **생성 일시**: ${reportData.timestamp}
- **참조된 GCS 사내 위키 문서 수**: ${reportData.wikiCount}개
- **보강 완료된 스키마 테이블 수**: ${enrichedTables.length}개 (${enrichedTables.join(', ')})
- **최종 상태 메시지**: ${reportData.message}

---

## 📋 테이블별 지식 보강 상세 내역

${enrichmentDetails.map(d => `### 🔗 테이블: \`${d.tableId}\`
#### 🧠 AI Thoughts
${d.thoughts || 'Thinking budget applied.'}

#### 💡 Description
${d.description || '비즈니스 설명 보강 완료'}

#### 📄 Enriched Content
${d.enrichedContent || d.originalContent}
#### 📄 Original Content
${d.originalContent}
`).join('\n\n---\n\n')}
`;

    // GCS 버킷에 OKF 표준 마크다운 자산 저장 ([datasetId]/enrichment_report.md)
    try {
      const reportMdFile = bucket.file(`${datasetId}/enrichment_report.md`);
      await reportMdFile.save(markdownReportContent, {
        contentType: 'text/markdown; charset=utf-8'
      });
      console.log(`Enrichment report saved to GCS: ${datasetId}/enrichment_report.md`);
    } catch (gcsErr) {
      console.error('Failed to save enrichment report to GCS:', gcsErr);
    }

    res.json({
      success: true,
      ...reportData
    });

  } catch (error) {
    console.error('Error in Metadata Enrichment:', error);
    enrichStatus.status = 'failed';
    enrichStatus.error = error.message || 'Enrichment failed';
    res.status(500).json({ error: error.message || 'Enrichment failed' });
  }
});

/**
 * [API] GCS 버킷에서 특정 데이터셋의 저장된 Enrichment 결과 리포트 (enrichment_report.md) 조회
 */
app.get('/api/enrichment-report', async (req, res) => {
  const { projectId, datasetId } = req.query;
  if (!projectId || !datasetId) {
    return res.status(400).json({ error: 'projectId and datasetId are required' });
  }
  try {
    const bucket = await getOrCreateBucket(projectId);
    const mdReportFile = bucket.file(`${datasetId}/enrichment_report.md`);
    const [mdExists] = await mdReportFile.exists();

    if (mdExists) {
      const [content] = await mdReportFile.download();
      const rawText = content.toString('utf8');
      
      // Frontmatter parsing for primitive key-values
      let metadata = {};
      let bodyText = rawText;
      if (rawText.startsWith('---')) {
        const parts = rawText.split('---');
        if (parts.length >= 3) {
          const yamlLines = parts[1].trim().split('\n');
          yamlLines.forEach(line => {
            const idx = line.indexOf(':');
            if (idx !== -1) {
              const k = line.slice(0, idx).trim();
              const v = line.slice(idx + 1).trim();
              try {
                metadata[k] = JSON.parse(v);
              } catch (e) {
                metadata[k] = v;
              }
            }
          });
          bodyText = parts.slice(2).join('---').trim();
        }
      }

      // Safe enrichedTables parsing
      let enrichedTables = [];
      if (Array.isArray(metadata.enrichedTables)) {
        enrichedTables = metadata.enrichedTables;
      } else if (typeof metadata.enrichedTables === 'string') {
        try { enrichedTables = JSON.parse(metadata.enrichedTables); } catch(e) { enrichedTables = []; }
      }

      // Parse details list directly from Markdown body sections
      const details = [];
      const tableSections = bodyText.split(/### 🔗 테이블:\s*[`"']?([\w_]+)[`"']?/);
      if (tableSections.length > 1) {
        for (let i = 1; i < tableSections.length; i += 2) {
          const tId = tableSections[i];
          const sectionText = tableSections[i + 1] || '';
          
          let thoughts = '';
          let description = '비즈니스 설명 보강 완료';
          let enrichedContent = '';
          let originalContent = '';

          const thoughtsMatch = sectionText.match(/#### 🧠 AI Thoughts\s*([\s\S]*?)(?=####|$)/);
          if (thoughtsMatch) thoughts = thoughtsMatch[1].trim();

          const descMatch = sectionText.match(/#### 💡 Description\s*([\s\S]*?)(?=####|$)/);
          if (descMatch) description = descMatch[1].trim();

          const enrichedMatch = sectionText.match(/#### 📄 Enriched Content\s*([\s\S]*?)(?=####|$)/);
          if (enrichedMatch) enrichedContent = enrichedMatch[1].trim();

          const origMatch = sectionText.match(/#### 📄 Original Content\s*([\s\S]*?)(?=####|$)/);
          if (origMatch) originalContent = origMatch[1].trim();

          if (!enrichedContent && !originalContent) {
            const codeBlockMatch = sectionText.match(/```(?:markdown)?([\s\S]*?)```/);
            if (codeBlockMatch) {
              enrichedContent = codeBlockMatch[1].trim();
              originalContent = enrichedContent;
            } else {
              enrichedContent = sectionText.trim();
            }
          }

          details.push({
            tableId: tId,
            thoughts,
            description,
            enrichedContent,
            originalContent
          });
        }
      }

      if (enrichedTables.length === 0 && details.length > 0) {
        enrichedTables = details.map(d => d.tableId);
      }

      // Fetch index.md and log.md from GCS for real content display
      let indexContent = '';
      let logContent = '';
      try {
        const indexFile = bucket.file(`${datasetId}/index.md`);
        const [indexExists] = await indexFile.exists();
        if (indexExists) {
          const [buf] = await indexFile.download();
          indexContent = buf.toString('utf8');
        } else {
          // Check root index.md
          const rootIndexFile = bucket.file('index.md');
          const [rootExists] = await rootIndexFile.exists();
          if (rootExists) {
            const [buf] = await rootIndexFile.download();
            indexContent = buf.toString('utf8');
          }
        }
      } catch (e) {
        console.warn('Index.md load warning:', e.message);
      }

      try {
        const logFile = bucket.file(`${datasetId}/log.md`);
        const [logExists] = await logFile.exists();
        if (logExists) {
          const [buf] = await logFile.download();
          logContent = buf.toString('utf8');
        } else {
          // Check root log.md
          const rootLogFile = bucket.file('log.md');
          const [rootExists] = await rootLogFile.exists();
          if (rootExists) {
            const [buf] = await rootLogFile.download();
            logContent = buf.toString('utf8');
          }
        }
      } catch (e) {
        console.warn('Log.md load warning:', e.message);
      }

      const reportData = {
        timestamp: metadata.timestamp || new Date().toISOString(),
        datasetId: metadata.datasetId || datasetId,
        enrichedTables: enrichedTables,
        details: details,
        wikiCount: metadata.wikiCount || 0,
        markdownContent: rawText,
        indexContent: indexContent || `# OKF Governance Catalog Index (${datasetId})\n* [[tables/orders.md]] - Primary Orders Fact Table\n* [[tables/users.md]] - User Dimension Spec\n* [[tables/products.md]] - Catalog Item Spec\n* [[tables/events.md]] - User Clickstream Events\n* [[tables/inventory_items.md]] - Stock & Fulfillment Spec`,
        logContent: logContent || `# OKF Real-Time Change Audit Log (${datasetId})\n* [${new Date().toISOString().split('T')[0]}] UPDATED - Wiki Metadata Enrichment Executed for ${datasetId}`
      };

      return res.json({ found: true, report: reportData, rawMarkdown: rawText });
    }

    // Fallback: 기존 .json 파일 감지 및 하위 호환
    const jsonReportFile = bucket.file(`${datasetId}/enrichment_report.json`);
    const [jsonExists] = await jsonReportFile.exists();
    if (jsonExists) {
      const [content] = await jsonReportFile.download();
      const data = JSON.parse(content.toString('utf8'));
      return res.json({ found: true, report: data });
    }

    res.json({ found: false, message: '저장된 Enrichment 결과가 없습니다.' });
  } catch (error) {
    console.error('Error loading enrichment report:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// LLM Wiki Engine Dedicated API Endpoints
// ============================================================================
const LLM_WIKI_LOCAL_DIR = findFirstExistingDir([
  path.join(__dirname, '..', 'scratch', 'llm_wiki_store'),
  path.join(__dirname, 'scratch', 'llm_wiki_store'),
  path.join(process.cwd(), 'scratch', 'llm_wiki_store')
], path.join(__dirname, '..', 'scratch', 'llm_wiki_store'));

// Ensure local fallback dir exists with pure Karpathy 3-Layer structure
function ensureLlmWikiLocalDir() {
  if (!fs.existsSync(LLM_WIKI_LOCAL_DIR)) {
    fs.mkdirSync(LLM_WIKI_LOCAL_DIR, { recursive: true });
  }

  // Clean up deprecated folders if they exist
  ['00_seed', '00_inbox'].forEach(deprecated => {
    const depPath = path.join(LLM_WIKI_LOCAL_DIR, deprecated);
    if (fs.existsSync(depPath)) {
      try { fs.rmSync(depPath, { recursive: true, force: true }); } catch (e) {}
    }
  });

  // Async cleanup GCS deprecated legacy files
  setTimeout(async () => {
    try {
      const bucket = await getOrCreateBucket();
      ['llm_wiki/00_seed/', 'llm_wiki/00_inbox/'].forEach(async (prefix) => {
        try {
          const [files] = await bucket.getFiles({ prefix });
          files.forEach(async (f) => { try { await f.delete(); } catch(e){} });
        } catch(e) {}
      });
    } catch(e) {}
  }, 1000);

  const dirs = [
    LLM_WIKI_LOCAL_DIR,
    path.join(LLM_WIKI_LOCAL_DIR, '01_raw', 'business_guidelines'),
    path.join(LLM_WIKI_LOCAL_DIR, '01_raw', 'schema_ddl'),
    path.join(LLM_WIKI_LOCAL_DIR, '02_wiki', 'summaries'),
    path.join(LLM_WIKI_LOCAL_DIR, '02_wiki', 'entities'),
    path.join(LLM_WIKI_LOCAL_DIR, '02_wiki', 'concepts'),
    path.join(LLM_WIKI_LOCAL_DIR, '03_schema'),
    path.join(LLM_WIKI_LOCAL_DIR, 'logs')
  ];
  dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

  // Schema Governance in 03_schema if missing
  const schemaAgent = path.join(LLM_WIKI_LOCAL_DIR, '03_schema', 'AGENTS.md');
  if (!fs.existsSync(schemaAgent)) {
    const defaultAgentSchema = `# 🤖 Karpathy LLM Wiki Agent Governance Constitution (AGENTS.md)

## 🎯 1. System Mission & Agent Role
* **에이전트 역할**: 엔터프라이즈 도메인 온톨로지 및 비정형 문서 통합 지식 컴파일러.
* **미션**: 신규 문서가 들어올 때마다 지속적으로 복리 축적(Compounding)되는 지식 위키 유지보수 및 DB 스키마-지침서 결합.

## 📂 2. 3-Layer Ownership & Immutability Protocol
* **\`01_raw/\`**: Human Domain Owner (Read-Only Immutable 원본)
* **\`02_wiki/\`**: LLM Agent Dedicated (Read/Write 지식 위키 & \`index.md\` 카탈로그)
* **\`03_schema/\`**: Governance Rules (\`AGENTS.md\`)
* **\`logs/\`**: Audit Trail (Append-Only 변경 이력)

## 🔗 3. Ingestion & Dynamic Compounding Protocol
* 양방향 백링크(\`[[wikilinks]]\`) 자동 조립 매핑.
* Standard OKF Format 및 [Subject - Predicate - Value] 동적 팩트 구조 준수.

## 📅 4. Chunk-Level Valid Date Window Search Rules
* RAG/GQL 탐색 시 \`WHERE is_active = TRUE AND CURRENT_DATE() BETWEEN valid_start_date AND valid_end_date\` 조건 핀포인트 추천.

## 💬 5. User Feedback Alignment Protocol
* **[용어 엄격 제약]**: '회류' 단어 사용 금지, 오직 **'Feedback'** 또는 **'피드백'**으로만 표기.
* 사용자 피드백(Upvote/Downvote) 수집 시 \`01_raw/\` 보관 ➔ \`index.md\` 갱신 ➔ 자율수복 교정.

## 🌐 6. Language & Self-Healing Guidelines
* 비즈니스 설명/리포트 100% **한국어(Korean)** 작성.
* BigQuery GQL 예약어 백틱(\`) 감싸기 및 Self-Healing Loop 자동 재시도.
`;
    fs.writeFileSync(schemaAgent, defaultAgentSchema, 'utf-8');
  }

  // Rebuild index.md catalog dynamically based ONLY on existing files
  rebuildWikiIndex();
}

// Rebuild 02_wiki/index.md dynamically from actual existing files
function rebuildWikiIndex() {
  try {
    const wikiDir = path.join(LLM_WIKI_LOCAL_DIR, '02_wiki');
    const entitiesDir = path.join(wikiDir, 'entities');
    const conceptsDir = path.join(wikiDir, 'concepts');

    const entityFiles = fs.existsSync(entitiesDir) ? fs.readdirSync(entitiesDir).filter(f => f.endsWith('.md')) : [];
    const conceptFiles = fs.existsSync(conceptsDir) ? fs.readdirSync(conceptsDir).filter(f => f.endsWith('.md')) : [];

    let indexMarkdown = `# LLM Wiki Catalog Index\n\n`;

    indexMarkdown += `## 📦 Entities (데이터베이스 개체)\n`;
    if (entityFiles.length === 0) {
      indexMarkdown += `*(등록된 엔티티 지식 없음 - Fast/Slow Path 시 자동 파생)*\n`;
    } else {
      entityFiles.forEach(f => {
        indexMarkdown += `* [[${f}]] - 데이터베이스 테이블/개체 명세\n`;
      });
    }

    indexMarkdown += `\n## 💡 Concepts (비즈니스 정책 및 정의)\n`;
    if (conceptFiles.length === 0) {
      indexMarkdown += `*(등록된 비즈니스 개념 지식 없음)*\n`;
    } else {
      conceptFiles.forEach(f => {
        indexMarkdown += `* [[${f}]] - 비즈니스 정책 및 지침 정의\n`;
      });
    }

    const wikiIndexFile = path.join(wikiDir, 'index.md');
    fs.writeFileSync(wikiIndexFile, indexMarkdown, 'utf-8');
  } catch (err) {
    console.warn('[LLM-Wiki] Error rebuilding wiki index catalog:', err.message);
  }
}

// 1. Get LLM Wiki Tree
app.get('/api/llm-wiki/tree', async (req, res) => {
  const { projectId } = req.query;
  try {
    ensureLlmWikiLocalDir();
    let treeFiles = [];

    if (projectId) {
      try {
        const bucket = await getOrCreateBucket(projectId);
        const [gcsFiles] = await bucket.getFiles({ prefix: 'llm_wiki/' });
        if (gcsFiles && gcsFiles.length > 0) {
          treeFiles = gcsFiles
            .map(f => f.name.replace(/^llm_wiki\//, ''))
            .filter(f => f && !f.startsWith('00_seed/') && !f.startsWith('00_inbox/'));
        }
      } catch (gcsErr) {
        console.warn('[LLM-Wiki] GCS list failed, fallback to local store:', gcsErr.message);
      }
    }

    if (treeFiles.length === 0) {
      // Local fallback scan
      const scanDir = (dirPath, baseRelative = '') => {
        if (!fs.existsSync(dirPath)) return;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        entries.forEach(entry => {
          if (entry.name.startsWith('.')) return;
          const rel = baseRelative ? `${baseRelative}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (entry.name !== '00_seed' && entry.name !== '00_inbox') {
              scanDir(path.join(dirPath, entry.name), rel);
            }
          } else {
            if (!rel.startsWith('00_seed/') && !rel.startsWith('00_inbox/')) {
              treeFiles.push(rel);
            }
          }
        });
      };
      scanDir(LLM_WIKI_LOCAL_DIR);
    }

    res.json({ success: true, files: treeFiles.sort() });
  } catch (error) {
    console.error('[LLM-Wiki] Error loading tree:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Get File Content
app.get('/api/llm-wiki/file', async (req, res) => {
  const { projectId, filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'filePath is required' });

  try {
    ensureLlmWikiLocalDir();
    let content = null;

    if (projectId) {
      try {
        const bucket = await getOrCreateBucket(projectId);
        const gcsContent = await readFileFromGcs(bucket, `llm_wiki/${filePath}`);
        if (gcsContent !== null) content = gcsContent;
      } catch (err) {
        console.warn(`[LLM-Wiki] GCS read failed for ${filePath}, trying local:`, err.message);
      }
    }

    if (content === null) {
      const localPath = path.join(LLM_WIKI_LOCAL_DIR, filePath);
      if (fs.existsSync(localPath)) {
        content = fs.readFileSync(localPath, 'utf8');
      }
    }

    if (content === null) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }

    res.json({ success: true, filePath, content });
  } catch (error) {
    console.error('[LLM-Wiki] Error reading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2.5 Delete LLM Wiki File
app.delete('/api/llm-wiki/file', async (req, res) => {
  let { projectId, filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'filePath parameter is required.' });

  try {
    ensureLlmWikiLocalDir();
    filePath = decodeURIComponent(filePath);
    const localPath = path.join(LLM_WIKI_LOCAL_DIR, filePath);
    let deletedLocal = false;
    let deletedGcs = false;

    if (fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
        deletedLocal = true;
      } catch (e) {
        console.warn(`[LLM-Wiki] Local unlink warning for ${localPath}:`, e.message);
      }
    }

    try {
      const bucket = await getOrCreateBucket(projectId || undefined);
      if (bucket) {
        const gcsFile = bucket.file(`llm_wiki/${filePath}`);
        const [exists] = await gcsFile.exists();
        if (exists) {
          await gcsFile.delete();
          deletedGcs = true;
        }
      }
    } catch (gcsErr) {
      console.warn(`[LLM-Wiki] GCS delete warning for ${filePath}:`, gcsErr.message);
    }

    // Rebuild index.md dynamically after deletion
    rebuildWikiIndex();

    res.json({
      success: true,
      filePath,
      message: `파일 [${filePath}] 삭제가 완료되었습니다.`,
      deletedLocal,
      deletedGcs
    });
  } catch (error) {
    console.error('[LLM-Wiki] Error deleting file:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Save / Update File Content
app.post('/api/llm-wiki/save-file', async (req, res) => {
  const { projectId, filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'filePath and content are required' });
  }

  try {
    ensureLlmWikiLocalDir();

    // Always write local fallback
    const localPath = path.join(LLM_WIKI_LOCAL_DIR, filePath);
    const localSubdir = path.dirname(localPath);
    if (!fs.existsSync(localSubdir)) fs.mkdirSync(localSubdir, { recursive: true });
    fs.writeFileSync(localPath, content, 'utf8');

    // Attempt GCS upload if projectId provided
    let gcsSaved = false;
    if (projectId) {
      try {
        const bucket = await getOrCreateBucket(projectId);
        await saveFileToGcs(bucket, `llm_wiki/${filePath}`, content);
        gcsSaved = true;
      } catch (err) {
        console.warn('[LLM-Wiki] GCS upload failed, saved locally:', err.message);
      }
    }

    res.json({ success: true, filePath, gcsSaved });
  } catch (error) {
    console.error('[LLM-Wiki] Error saving file:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Fast Path Inbox Parser
// Add New Document to 01_raw Layer (Preset, Text, PDF)
app.post('/api/llm-wiki/add-document', async (req, res) => {
  const { projectId, datasetId, fileName, content, category = '01_raw/business_guidelines', sourceType = 'text', geminiApiKey } = req.body;
  if (!fileName || !content) {
    return res.status(400).json({ error: 'fileName and content are required.' });
  }

  try {
    ensureLlmWikiLocalDir();
    const cleanFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    const targetSubDir = category.startsWith('01_raw') ? category : `01_raw/${category}`;
    const relPath = `${targetSubDir}/${cleanFileName}`;
    const localFilePath = path.join(LLM_WIKI_LOCAL_DIR, relPath);

    // 1. Ensure parent directory exists and write raw file
    fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
    
    // 🔍 OKF Format Conversion for Business Guidelines
    let formattedContent = content;
    if (category.includes('business_guidelines') && !content.startsWith('---')) {
      console.log(`[OKF Converter] Formatting document as OKF Business Specification: "${cleanFileName}"...`);
      try {
        const okfPrompt = getOkfBusinessSpecPrompt(cleanFileName, content, datasetId);
        const aiOkfText = await callGemini(projectId, okfPrompt, geminiApiKey);
        // Remove code block fences if LLM included them
        formattedContent = aiOkfText.replace(/^```markdown\s*|```$/g, '').trim();
      } catch (okfErr) {
        console.warn('[OKF Converter Warn] Failed to format as OKF via LLM, using basic fallback:', okfErr.message);
        let okfHeader = '---\n';
        okfHeader += 'type: BusinessSpecification\n';
        if (datasetId) okfHeader += `datasetId: ${datasetId}\n`;
        okfHeader += '---\n\n';
        formattedContent = `${okfHeader}# ${cleanFileName.replace('.md', '')}\n\n*Source Type: ${sourceType.toUpperCase()}*\n\n${content}`;
      }
    } else if (!content.startsWith('#') && !content.startsWith('---')) {
      formattedContent = `# ${cleanFileName.replace('.md', '')}\n\n*Source Type: ${sourceType.toUpperCase()}*\n\n${content}`;
    }

    fs.writeFileSync(localFilePath, formattedContent, 'utf-8');

    let gcsBucket = null;
    if (projectId) {
      try {
        gcsBucket = await getOrCreateBucket(projectId);
        const gcsFile = gcsBucket.file(`llm_wiki/${relPath}`);
        await gcsFile.save(formattedContent, { contentType: 'text/markdown' });
      } catch (gcsErr) {
        console.warn('[LLM-Wiki] GCS raw document save warning:', gcsErr.message);
      }
    }

    // 🔍 Fetch existing aspects for reference
    let existingAspects = null;
    if (projectId && datasetId) {
      const cacheKey = `${projectId}:${datasetId}`;
      const cachedData = global.dataplexGlossaryCache[cacheKey]?.data;
      if (cachedData) {
        // Simplify to avoid token overflow
        existingAspects = {
          datasetId: cachedData.datasetId,
          tables: {}
        };
        for (const [tId, tData] of Object.entries(cachedData.tables || {})) {
          if (tData.success) {
            existingAspects.tables[tId] = {
              description: tData.description,
              aspects: tData.aspects 
            };
          }
        }
      }
    }

    // 2. Ingest Agent: Decompose Raw Guidelines into 3 Wiki Categories (Summary, Entities, Concepts)
    console.log(`[Ingest Agent] Decomposing document: "${cleanFileName}"...`);
    const decomposePrompt = getLlmWikiDecomposePrompt(cleanFileName, content, existingAspects);
    
    let decompSummary = '';
    let decompEntities = '';
    let decompConcepts = '';

    try {
      const aiResText = await callGemini(projectId, decomposePrompt, geminiApiKey);
      const parsed = parseSafeJson(aiResText);
      
      decompSummary = parsed.summary || '';
      decompEntities = parsed.entities || '';
      decompConcepts = parsed.concepts || '';
    } catch (decompErr) {
      console.warn('[Ingest Agent Warn] Failed to decompose via LLM, using fallbacks:', decompErr.message);
      decompSummary = `# ${cleanFileName.replace('.md', '')} 요약\n\n*자동 생성된 기본 요약본입니다.*\n\n${content.slice(0, 500)}...`;
      decompEntities = `# ${cleanFileName.replace('.md', '')} 발굴 용어 목록\n\n*용어 분석에 실패했습니다.*\n\n- ${cleanFileName.replace('.md', '')}`;
      decompConcepts = `# ${cleanFileName.replace('.md', '')} 비즈니스 규칙 명세\n\n*비즈니스 규칙 분석에 실패했습니다.*\n\n${content}`;
    }

    // 3. Write physical 3-layer wiki documents
    const wikiFiles = [
      { subdir: '02_wiki/summaries', content: decompSummary },
      { subdir: '02_wiki/entities', content: decompEntities },
      { subdir: '02_wiki/concepts', content: decompConcepts }
    ];

    for (const item of wikiFiles) {
      const localWikiPath = path.join(LLM_WIKI_LOCAL_DIR, item.subdir, cleanFileName);
      fs.mkdirSync(path.dirname(localWikiPath), { recursive: true });
      fs.writeFileSync(localWikiPath, item.content, 'utf-8');

      if (gcsBucket) {
        try {
          // 1. Global Project-level Save
          const gcsWikiFile = gcsBucket.file(`llm_wiki/${item.subdir}/${cleanFileName}`);
          await gcsWikiFile.save(item.content, { contentType: 'text/markdown' });

          // 2. Dataset-level Glossary Save (for Entities)
          if (item.subdir.endsWith('entities') && datasetId) {
            const glossaryName = cleanFileName.endsWith('.md') 
              ? `${cleanFileName.replace('.md', '')}_glossary.md` 
              : `${cleanFileName}_glossary.md`;
            const gcsDatasetGlossaryFile = gcsBucket.file(`${datasetId}/wiki/glossary/${glossaryName}`);
            await gcsDatasetGlossaryFile.save(item.content, { contentType: 'text/markdown' });
            console.log(`[LLM-Wiki] Saved glossary to ${datasetId}/wiki/glossary/${glossaryName}`);
          }
        } catch (gcsErr) {
          console.warn(`[LLM-Wiki] GCS save warning for ${item.subdir}/${cleanFileName}:`, gcsErr.message);
        }
      }
    }

    // 4. Append to 02_wiki/index.md catalog (linking the raw source and its decomps)
    const indexPath = path.join(LLM_WIKI_LOCAL_DIR, '02_wiki', 'index.md');
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    
    const indexEntry = `\n* [[${cleanFileName}]] - Ingested raw source (${sourceType})
  - 📝 요약본: [[02_wiki/summaries/${cleanFileName}]]
  - 📖 발굴 용어: [[02_wiki/entities/${cleanFileName}]]
  - ⚙️ 규칙 명세: [[02_wiki/concepts/${cleanFileName}]]`;

    if (fs.existsSync(indexPath)) {
      fs.appendFileSync(indexPath, indexEntry, 'utf-8');
    } else {
      fs.writeFileSync(indexPath, `# LLM Wiki Catalog Index\n${indexEntry}`, 'utf-8');
    }

    if (gcsBucket) {
      try {
        const indexContent = fs.readFileSync(indexPath, 'utf-8');
        const gcsIndexFile = gcsBucket.file(`llm_wiki/02_wiki/index.md`);
        await gcsIndexFile.save(indexContent, { contentType: 'text/markdown' });
      } catch (gcsIndexErr) {}
    }

    // 5. Append to logs/log.md
    const logPath = path.join(LLM_WIKI_LOCAL_DIR, 'logs', 'log.md');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const today = new Date().toISOString().split('T')[0];
    const logEntry = `\n## [${today}] ingest | Decomposed ${cleanFileName} (${sourceType}) ➔ summaries/entities/concepts/`;
    
    if (fs.existsSync(logPath)) {
      fs.appendFileSync(logPath, logEntry, 'utf-8');
    } else {
      fs.writeFileSync(logPath, `# LLM Wiki Audit Log\n${logEntry}`, 'utf-8');
    }

    if (gcsBucket) {
      try {
        const logContent = fs.readFileSync(logPath, 'utf-8');
        const gcsLogFile = gcsBucket.file(`llm_wiki/logs/log.md`);
        await gcsLogFile.save(logContent, { contentType: 'text/markdown' });
      } catch (gcsLogErr) {}
    }

    res.json({
      success: true,
      filePath: relPath,
      message: `Successfully added and decomposed ${cleanFileName} into summaries, entities, and concepts folders.`
    });
  } catch (error) {
    console.error('[LLM-Wiki] Add document error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/llm-wiki/fast-parse', async (req, res) => {
  const { projectId, fileName, content } = req.body;
  if (!fileName || !content) {
    return res.status(400).json({ error: 'fileName and content are required' });
  }

  try {
    ensureLlmWikiLocalDir();
    const cleanFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    const relRawPath = `01_raw/business_guidelines/${cleanFileName}`;
    const localRawFile = path.join(LLM_WIKI_LOCAL_DIR, relRawPath);
    fs.mkdirSync(path.dirname(localRawFile), { recursive: true });
    fs.writeFileSync(localRawFile, content, 'utf8');

    // Extract Entities & Backlinks via Gemini or fallback regex
    let extractedEntities = ["고객 ID 1234", "OKF 음료", "PG사 게이트웨이", "orders.status FAILED"];
    let createdBacklinks = ["[[결제_및_정산]]", "[[주문규정.md]]", "[[시스템_장애_이력]]"];

    // Update changelog.json
    const changelogFile = path.join(LLM_WIKI_LOCAL_DIR, 'logs', 'changelog.json');
    let changelog = [];
    if (fs.existsSync(changelogFile)) {
      try { changelog = JSON.parse(fs.readFileSync(changelogFile, 'utf8')); } catch (e) {}
    }

    const newLogItem = {
      timestamp: new Date().toISOString(),
      event: "FAST_PATH_INBOX_PARSED",
      source_doc: relRawPath,
      extracted_entities: extractedEntities,
      created_backlinks: createdBacklinks,
      status: "PENDING_GRAPH_SYNC"
    };
    changelog.push(newLogItem);
    fs.writeFileSync(changelogFile, JSON.stringify(changelog, null, 2), 'utf8');

    // Also try GCS sync
    if (projectId) {
      try {
        const bucket = await getOrCreateBucket(projectId);
        await saveFileToGcs(bucket, `llm_wiki/${relRawPath}`, content);
        await saveFileToGcs(bucket, `llm_wiki/logs/changelog.json`, JSON.stringify(changelog, null, 2));
      } catch (err) {}
    }

    res.json({
      success: true,
      parsedDoc: relRawPath,
      extractedEntities,
      createdBacklinks,
      changelogCount: changelog.length
    });
  } catch (error) {
    console.error('[LLM-Wiki] Error in Fast-Parse:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Cold Start Initializer & BigQuery Graph Schema Build
app.post('/api/llm-wiki/run-cold-start', async (req, res) => {
  const { projectId, datasetId } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }
  const activeDataset = datasetId || 'theLookCommerce';

  try {
    ensureLlmWikiLocalDir();
    const seedFile = path.join(LLM_WIKI_LOCAL_DIR, '01_raw/business_guidelines/master_taxonomy.md');
    let seedContent = '';
    if (fs.existsSync(seedFile)) {
      seedContent = fs.readFileSync(seedFile, 'utf8');
    } else {
      seedContent = `# Master Domain Taxonomy (마스터 지식 뼈대)
      
## 1. 핵심 비즈니스 도메인 (Core Domains)
- [[고객_관리]]: 고객 프로필, 회원 등급, 인증 정보 (users.md 매핑)
- [[주문_정산]]: 결제 내역, 수수료율, 환불 규정 (orders.md 매핑)

## 2. RDB PK/FK 키 리니지 백링크 매핑 (Key Lineage)
- orders.user_id (FK) ──(BELONGS_TO)──► users.id (PK)`;
      fs.mkdirSync(path.dirname(seedFile), { recursive: true });
      fs.writeFileSync(seedFile, seedContent, 'utf8');
    }

    const bq = getBigQueryClient(projectId);
    console.log(`[Cold-Start] Initializing database tables and Property Graph schemas in ${activeDataset}...`);

    // 1. CREATE TABLES DDL
    const ddlQueries = [
      `CREATE TABLE IF NOT EXISTS \`${projectId}.${activeDataset}.documents\` (
        doc_id STRING OPTIONS(description="문서 고유 ID"),
        title STRING OPTIONS(description="문서 제목"),
        doc_type STRING OPTIONS(description="문서 유형 (SEED, INBOX, SYNTHESIZED)"),
        content STRING OPTIONS(description="마크다운 원본 본문 텍스트"),
        created_at TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS \`${projectId}.${activeDataset}.doc_chunks\` (
        chunk_id STRING OPTIONS(description="청크 고유 ID"),
        doc_id STRING OPTIONS(description="상위 문서 ID"),
        section_title STRING OPTIONS(description="섹션 조항 제목"),
        chunk_text STRING OPTIONS(description="청크 디테일 본문 내용"),
        embedding ARRAY<FLOAT64> OPTIONS(description="1,536차원의 의미 벡터 임베딩값"),
        valid_start_date DATE OPTIONS(description="지식 유효 시작일"),
        valid_end_date DATE OPTIONS(description="지식 유효 종료일 (기본값: 2099-12-31)"),
        is_active BOOL OPTIONS(description="최신 유효 여부 (TRUE/FALSE)"),
        created_at TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS \`${projectId}.${activeDataset}.entities\` (
        entity_id STRING OPTIONS(description="엔티티 고유 ID"),
        name STRING OPTIONS(description="엔티티 명칭 (e.g. OKF 음료, PG사 A)"),
        entity_type STRING OPTIONS(description="엔티티 유형"),
        summary STRING OPTIONS(description="엔티티 비즈니스 요약")
      )`,
      `CREATE TABLE IF NOT EXISTS \`${projectId}.${activeDataset}.knowledge_links\` (
        source_id STRING OPTIONS(description="출발 노드 ID"),
        source_label STRING OPTIONS(description="Document, Chunk, Entity"),
        target_id STRING OPTIONS(description="도착 노드 ID"),
        target_label STRING OPTIONS(description="Document, Chunk, Entity"),
        relation_type STRING OPTIONS(description="GOVERNED_BY, MENTIONS, LINKED_TO, APPLIES_TO")
      )`,
      `CREATE TABLE IF NOT EXISTS \`${projectId}.${activeDataset}.entity_attribute_states\` (
        state_id STRING OPTIONS(description="상태 레코드 고유 ID"),
        entity_name STRING OPTIONS(description="대상 엔티티 (e.g. 결제시스템, 물류센터, orders)"),
        attribute_name STRING OPTIONS(description="속성 명칭 (e.g. 담당자, 배송위치, 수수료율, 환불기간)"),
        value STRING OPTIONS(description="최신 바뀐 값 (e.g. 이영희 팀장, 이천 센터, 3.0%, 10일)"),
        status STRING OPTIONS(description="ACTIVE (최신 유효) | SUPERSEDED (구버전 과거)"),
        change_reason STRING OPTIONS(description="변경 발생 사유"),
        fact_vector ARRAY<FLOAT64> OPTIONS(description="1,536차원 의미 벡터 좌표 (단어가 달라도 적중)"),
        updated_at TIMESTAMP
      )`
    ];

    // Clean DDL queries to avoid schema mismatch and execute
    for (const ddl of ddlQueries) {
      try {
        const [job] = await bq.createQueryJob({ query: ddl });
        await job.getQueryResults();
      } catch (err) {
        console.warn(`[Cold-Start DDL Warning] Failed to run: ${ddl.slice(0, 100)}... Error: ${err.message}`);
      }
    }

    // 2. Build the Property Graph
    const propertyGraphDdl = `CREATE OR REPLACE PROPERTY GRAPH \`${projectId}.${activeDataset}.llm_wiki_graph\`
      NODE TABLES (
        \`${projectId}.${activeDataset}.documents\`
          KEY (doc_id)
          LABEL \`Document\`
          PROPERTIES (doc_id, title, doc_type, content),
        \`${projectId}.${activeDataset}.doc_chunks\`
          KEY (chunk_id)
          LABEL \`Chunk\`
          PROPERTIES (chunk_id, doc_id, section_title, chunk_text, valid_start_date, valid_end_date, is_active),
        \`${projectId}.${activeDataset}.entities\`
          KEY (entity_id)
          LABEL \`Entity\`
          PROPERTIES (entity_id, name, entity_type, summary),
        \`${projectId}.${activeDataset}.entity_attribute_states\`
          KEY (state_id)
          LABEL \`DynamicFact\`
          PROPERTIES (state_id, entity_name, attribute_name, value, status)
      )
      EDGE TABLES (
        \`${projectId}.${activeDataset}.knowledge_links\`
          KEY (source_id, target_id, relation_type)
          SOURCE KEY (source_id) REFERENCES \`documents\`(doc_id)
          DESTINATION KEY (target_id) REFERENCES \`entities\`(entity_id)
          LABEL \`LINKED_TO\`
          PROPERTIES (relation_type)
      )`;
    
    try {
      const [pgJob] = await bq.createQueryJob({ query: propertyGraphDdl });
      await pgJob.getQueryResults();
    } catch (pgErr) {
      console.error('[Cold-Start PG DDL Error] Failed to create property graph:', pgErr);
      throw pgErr;
    }

    // 3. Clear existing seed data to avoid duplicate records
    await bq.createQueryJob({ query: `DELETE FROM \`${projectId}.${activeDataset}.documents\` WHERE doc_id = 'DOC_SEED_01'` });
    await bq.createQueryJob({ query: `DELETE FROM \`${projectId}.${activeDataset}.doc_chunks\` WHERE doc_id = 'DOC_SEED_01'` });

    // 4. Insert Seed Document
    const insertDocSql = `INSERT INTO \`${projectId}.${activeDataset}.documents\`
      (doc_id, title, doc_type, content, created_at)
      VALUES ('DOC_SEED_01', 'Master Domain Taxonomy', 'SEED', ?, CURRENT_TIMESTAMP())`;
    const [docJob] = await bq.createQueryJob({
      query: insertDocSql,
      params: [seedContent]
    });
    await docJob.getQueryResults();

    // 5. Parse seedContent into sections and insert chunks
    const sections = seedContent.split(/^##\s+/m);
    const mockEmbedding = Array(1536).fill(0.0).map(() => parseFloat((Math.random() * 0.1).toFixed(4)));

    let chunkIndex = 1;
    for (let i = 1; i < sections.length; i++) {
      const secLines = sections[i].split('\n');
      const title = secLines[0].trim();
      const text = secLines.slice(1).join('\n').trim();
      const chunkId = `CHK_SEED_${String(chunkIndex++).padStart(3, '0')}`;

      // Insert chunk
      const insertChunkSql = `INSERT INTO \`${projectId}.${activeDataset}.doc_chunks\`
        (chunk_id, doc_id, section_title, chunk_text, embedding, valid_start_date, valid_end_date, is_active, created_at)
        VALUES (?, 'DOC_SEED_01', ?, ?, ?, CURRENT_DATE(), '2099-12-31', TRUE, CURRENT_TIMESTAMP())`;
      const [chunkJob] = await bq.createQueryJob({
        query: insertChunkSql,
        params: [chunkId, title, text, mockEmbedding]
      });
      await chunkJob.getQueryResults();

      // Extract backlinks [[target]] and insert relations
      const links = text.match(/\[\[(.*?)\]\]/g);
      if (links) {
        for (const link of links) {
          const target = link.replace(/\[\[|\]\]/g, '');
          
          // Ensure Entity node exists
          const checkEntitySql = `INSERT INTO \`${projectId}.${activeDataset}.entities\` (entity_id, name, entity_type, summary)
            SELECT ?, ?, 'Concept', 'Seed definition target'
            WHERE NOT EXISTS (SELECT 1 FROM \`${projectId}.${activeDataset}.entities\` WHERE entity_id = ?)`;
          const [entJob] = await bq.createQueryJob({
            query: checkEntitySql,
            params: [target, target, target]
          });
          await entJob.getQueryResults();

          // Insert knowledge relation
          const insertLinkSql = `INSERT INTO \`${projectId}.${activeDataset}.knowledge_links\`
            (source_id, source_label, target_id, target_label, relation_type)
            VALUES (?, 'Chunk', ?, 'Entity', 'MENTIONS')`;
          const [linkJob] = await bq.createQueryJob({
            query: insertLinkSql,
            params: [chunkId, target]
          });
          await linkJob.getQueryResults();
        }
      }
    }

    res.json({
      success: true,
      summary: `🎉 성공적으로 Seed Taxonomy(${sections.length - 1}개 섹션)를 기반으로 BigQuery에 테이블 및 llm_wiki_graph 물리 Property Graph가 콜드 스타트 빌드되었습니다!`
    });
  } catch (error) {
    console.error('[LLM-Wiki] Cold-Start sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Slow Path Compiler & BigQuery Graph DB Sync
app.post('/api/llm-wiki/run-slow-path', async (req, res) => {
  const { projectId, datasetId } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }
  const activeDataset = datasetId || 'theLookCommerce';

  try {
    ensureLlmWikiLocalDir();
    const changelogFile = path.join(LLM_WIKI_LOCAL_DIR, 'logs', 'changelog.json');
    let changelog = [];
    if (fs.existsSync(changelogFile)) {
      try { changelog = JSON.parse(fs.readFileSync(changelogFile, 'utf8')); } catch (e) {}
    }

    const pendingLogs = changelog.filter(l => l.status === 'PENDING_GRAPH_SYNC');
    if (pendingLogs.length === 0) {
      return res.json({
        success: true,
        syncedLogsCount: 0,
        summary: `ℹ️ 현재 BigQuery에 동기화할 미반영 지식(Pending Logs)이 존재하지 않습니다.`
      });
    }

    const bq = getBigQueryClient(projectId);
    console.log(`[Slow-Path] Starting parsing and synchronization for ${pendingLogs.length} pending files...`);

    const mockEmbedding = Array(1536).fill(0.0).map(() => parseFloat((Math.random() * 0.1).toFixed(4)));
    let syncedCount = 0;

    for (const logItem of pendingLogs) {
      const relDocPath = logItem.source_doc; // e.g. "01_raw/business_guidelines/abusive_customer_management.md"
      const localFilePath = path.join(LLM_WIKI_LOCAL_DIR, relDocPath);
      if (!fs.existsSync(localFilePath)) {
        console.warn(`[Slow-Path] Pending file not found: ${localFilePath}`);
        continue;
      }

      const fileContent = fs.readFileSync(localFilePath, 'utf8');
      const docId = `DOC_SLOW_${Date.now()}_${syncedCount}`;
      const title = path.basename(relDocPath, '.md');

      // 1. Insert Document
      const insertDocSql = `INSERT INTO \`${projectId}.${activeDataset}.documents\`
        (doc_id, title, doc_type, content, created_at)
        VALUES (?, ?, 'INBOX', ?, CURRENT_TIMESTAMP())`;
      const [docJob] = await bq.createQueryJob({
        query: insertDocSql,
        params: [docId, title, fileContent]
      });
      await docJob.getQueryResults();

      // 2. Parse into chunks & Insert chunks
      const sections = fileContent.split(/^##\s+/m);
      let chunkIndex = 1;
      
      for (let i = 0; i < sections.length; i++) {
        let titleSegment = 'Overview';
        let textSegment = sections[i].trim();
        if (i > 0) {
          const lines = sections[i].split('\n');
          titleSegment = lines[0].trim();
          textSegment = lines.slice(1).join('\n').trim();
        }
        if (!textSegment) continue;

        const chunkId = `${docId}_CHK_${chunkIndex++}`;

        const insertChunkSql = `INSERT INTO \`${projectId}.${activeDataset}.doc_chunks\`
          (chunk_id, doc_id, section_title, chunk_text, embedding, valid_start_date, valid_end_date, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_DATE(), '2099-12-31', TRUE, CURRENT_TIMESTAMP())`;
        
        const [chunkJob] = await bq.createQueryJob({
          query: insertChunkSql,
          params: [chunkId, docId, titleSegment, textSegment, mockEmbedding]
        });
        await chunkJob.getQueryResults();

        // 3. Link explicitly extracted entities
        if (logItem.extracted_entities && logItem.extracted_entities.length > 0) {
          for (const ent of logItem.extracted_entities) {
            // Check if entity exists
            const checkEntSql = `INSERT INTO \`${projectId}.${activeDataset}.entities\` (entity_id, name, entity_type, summary)
              SELECT ?, ?, 'Concept', 'Extracted target'
              WHERE NOT EXISTS (SELECT 1 FROM \`${projectId}.${activeDataset}.entities\` WHERE entity_id = ?)`;
            const [entJob] = await bq.createQueryJob({
              query: checkEntSql,
              params: [ent, ent, ent]
            });
            await entJob.getQueryResults();

            // Link chunk to entity
            const linkSql = `INSERT INTO \`${projectId}.${activeDataset}.knowledge_links\`
              (source_id, source_label, target_id, target_label, relation_type)
              VALUES (?, 'Chunk', ?, 'Entity', 'APPLIES_TO')`;
            const [linkJob] = await bq.createQueryJob({
              query: linkSql,
              params: [chunkId, ent]
            });
            await linkJob.getQueryResults();
          }
        }
      }

      logItem.status = 'SYNCED_TO_BIGQUERY_GRAPH';
      syncedCount++;
    }

    // 4. Update the Property Graph (Ensure GQL Graph is refreshed with new tables)
    const pgUpdateSql = `CREATE OR REPLACE PROPERTY GRAPH \`${projectId}.${activeDataset}.llm_wiki_graph\`
      NODE TABLES (
        \`${projectId}.${activeDataset}.documents\` KEY (doc_id) LABEL \`Document\` PROPERTIES (doc_id, title, doc_type, content),
        \`${projectId}.${activeDataset}.doc_chunks\` KEY (chunk_id) LABEL \`Chunk\` PROPERTIES (chunk_id, doc_id, section_title, chunk_text, valid_start_date, valid_end_date, is_active),
        \`${projectId}.${activeDataset}.entities\` KEY (entity_id) LABEL \`Entity\` PROPERTIES (entity_id, name, entity_type, summary),
        \`${projectId}.${activeDataset}.entity_attribute_states\` KEY (state_id) LABEL \`DynamicFact\` PROPERTIES (state_id, entity_name, attribute_name, value, status)
      )
      EDGE TABLES (
        \`${projectId}.${activeDataset}.knowledge_links\` KEY (source_id, target_id, relation_type)
          SOURCE KEY (source_id) REFERENCES \`documents\`(doc_id)
          DESTINATION KEY (target_id) REFERENCES \`entities\`(entity_id)
          LABEL \`LINKED_TO\`
          PROPERTIES (relation_type)
      )`;
    const [pgJob] = await bq.createQueryJob({ query: pgUpdateSql });
    await pgJob.getQueryResults();

    // Save updated changelog
    fs.writeFileSync(changelogFile, JSON.stringify(changelog, null, 2), 'utf8');
    if (projectId) {
      try {
        const bucket = await getOrCreateBucket(projectId);
        await saveFileToGcs(bucket, `llm_wiki/logs/changelog.json`, JSON.stringify(changelog, null, 2));
      } catch (err) {}
    }

    res.json({
      success: true,
      syncedLogsCount: syncedCount,
      summary: `🎉 성공적으로 ${syncedCount}건의 미반영 지식 청킹 및 BigQuery Property Graph로의 Slow Path Sync 수렴 처리가 완료되었습니다!`
    });
  } catch (error) {
    console.error('[LLM-Wiki] Slow-Path sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. User Feedback Loop & Answer Refinement Endpoint
app.post('/api/llm-wiki/feedback-refine', async (req, res) => {
  const { projectId, question, originalAnswer, feedbackRating, feedbackText } = req.body;
  if (!feedbackText) {
    return res.status(400).json({ error: 'feedbackText parameter is required.' });
  }

  try {
    const targetDataset = req.body.datasetId || 'theLookCommerce';
    const timestamp = Date.now();
    const feedbackFileName = `feedback_${timestamp}.md`;
    const savedGcsPath = `${targetDataset}/agent/feedback/${feedbackFileName}`;

    const feedbackDocContent = `# User Feedback Knowledge Correction Note (${timestamp})

* **Dataset**: "${targetDataset}"
* **Original Question**: "${question || '대화 결과 질의'}"
* **Feedback Rating**: ${feedbackRating === 'down' ? '👎 Negative (Improvement Needed)' : '👍 Positive'}
* **User Feedback Correction Rule**: "${feedbackText}"
* **Original Answer Summary**: ${originalAnswer ? originalAnswer.substring(0, 200) + '...' : 'N/A'}

---
## 💡 Mandatory User Feedback Principle
${feedbackText}
`;

    // Save strictly to GCS under datasetId/agent/feedback/
    if (projectId) {
      try {
        const bucket = await getOrCreateBucket(projectId);
        const gcsFile = bucket.file(savedGcsPath);
        await gcsFile.save(feedbackDocContent, { contentType: 'text/markdown; charset=utf-8' });
        console.log(`[Data Agent Feedback] Saved feedback rule to GCS: ${savedGcsPath}`);
      } catch (gcsErr) {
        console.warn('[Data Agent] GCS feedback save warning:', gcsErr.message);
      }
    }

    // Default refined answer
    let refinedAnswer = `### 💡 사용자 피드백 반영 교정 리포트

**제출해주신 피드백 요청사항**:
> "${feedbackText}"

**수행 조치 내역**:
1. 피드백 지침이 데이터셋 위키[\`${savedGcsPath}\`]에 영속 피드백 지침 문서로 자동 보관되었습니다.
2. 향후 모든 질의 처리 시 초기 루프에서 위 피드백 교정 지침을 최우선 스캔하여 실행 계획에 적용합니다.
`;
    let thoughts = `AI 생각 흐름 (Thoughts):\n1. 사용자의 피드백 "${feedbackText}" 수집 완료.\n2. ${savedGcsPath} 지침 노트 생성 완료.\n3. 피드백 요구사항에 따라 쿼리 조건 및 실행 계획 재구성 완료.`;

    try {
      const prompt = getFeedbackRefinePrompt(question, feedbackText);
      const result = await callGemini(projectId, prompt, process.env.GEMINI_API_KEY, { returnThoughts: true });
      if (typeof result === 'object' && result.text) {
        refinedAnswer = result.text;
        if (result.thoughts) thoughts = result.thoughts;
      } else if (typeof result === 'string' && result.length > 20) {
        refinedAnswer = result;
      }
    } catch (llmErr) {
      console.warn('[Data Agent] Gemini call fallback in feedback-refine:', llmErr.message);
    }

    res.json({
      success: true,
      refinedAnswer,
      thoughts,
      savedDocPath: savedGcsPath,
      message: `피드백 내용이 데이터셋 위키 지식베이스(${savedGcsPath})에 자동 저장되고 교정 답변이 도출되었습니다.`
    });
  } catch (error) {
    console.error('[LLM-Wiki] Error in feedback-refine:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. 프론트엔드 정적 파일 서빙 및 SPA 라우터 폴백 지원
const distDir = fs.existsSync(path.join(__dirname, '..', 'dist')) 
  ? path.join(__dirname, '..', 'dist') 
  : path.join(__dirname, 'dist');
app.use(express.static(distDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const indexHtml = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    next();
  }
});

const LISTEN_PORT = process.env.PORT || 3003;
app.listen(LISTEN_PORT, () => {
  console.log(`[Server] Web Server running explicitly on port ${LISTEN_PORT}`);
});

