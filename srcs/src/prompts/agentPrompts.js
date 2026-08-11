/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * 📝 AI Agents System Prompts SSOT Proxy (`srcs/src/prompts/agentPrompts.js`)
 * 
 * [수행 역할 및 비즈니스 프로세스]
 * 본 파일은 모듈화된 프롬프트 파일들(`harvesterPrompts.js`, `transpilerPrompts.js`, `enrichmentPrompts.js`,
 * `graphPrompts.js`, `agentChatPrompts.js`, `feedbackPrompts.js`)의 프록시로서 하위 호환성(100% Backward Compatibility)을
 * 보장하며 단일 접근점(Single Source of Truth) 역할을 수행합니다.
 * 
 * [모듈별 상세 에픽 맵핑]
 * 1. EPIC-002: BigQuery Physical Harvester (harvesterPrompts.js)
 *    - getProfilePrompt, getAdvancedSchemaPrompt, getOkfBusinessSpecPrompt, getDatasetOkfPrompt
 * 2. EPIC-003: Wiki & Unstructured Transpiler (transpilerPrompts.js)
 *    - getLlmWikiDecomposePrompt, getAutoNamingPrompt, getGithubTranslationPrompt
 * 3. EPIC-004: Cross-Domain OKF Enrichment (enrichmentPrompts.js)
 *    - getEnrichmentPrompt
 * 4. EPIC-005: Dataset Graph DB Synthesizer Agent (graphPrompts.js)
 *    - getGraphDesignPrompt, getDatasetGraphPrompt, getDatasetGraphSynthesizerPrompt
 * 5. EPIC-006: Data Agent Semantic Query (agentChatPrompts.js)
 *    - getSqlGenerationPrompt, getQueryHealingPrompt, getFinalAnswerPrompt, getSqlHelperPrompt, getRagDesignPrompt
 * 6. EPIC-007: OKF v0.2 Governance & HITL (feedbackPrompts.js)
 *    - getFeedbackRefinePrompt
 */

export * from './index.js';
