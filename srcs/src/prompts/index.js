/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * 🗂️ OKF Omni Modular Prompts Central Index (`srcs/src/prompts/index.js`)
 * 
 * [모듈별 맵핑 및 Epic 연결 구조]
 * 1. harvesterPrompts.js (EPIC-002: BigQuery Physical Schema Harvester)
 *    - getProfilePrompt, getAdvancedSchemaPrompt, getOkfBusinessSpecPrompt, getDatasetOkfPrompt
 * 2. transpilerPrompts.js (EPIC-003: Wiki & Unstructured Document Transpiler)
 *    - getLlmWikiDecomposePrompt, getAutoNamingPrompt, getGithubTranslationPrompt
 * 3. enrichmentPrompts.js (EPIC-004: Cross-Domain OKF Knowledge Enrichment)
 *    - getEnrichmentPrompt
 * 4. graphPrompts.js (EPIC-005: Dataset-Level Autonomous Graph DB Synthesizer Agent)
 *    - getGraphDesignPrompt, getDatasetGraphPrompt, getDatasetGraphSynthesizerPrompt
 * 5. agentChatPrompts.js (EPIC-006: Data Agent Semantic Query & Self-Healing)
 *    - getSqlGenerationPrompt, getQueryHealingPrompt, getFinalAnswerPrompt, getSqlHelperPrompt, getRagDesignPrompt
 * 6. feedbackPrompts.js (EPIC-007: OKF v0.2 Conformance & HITL Governance)
 *    - getFeedbackRefinePrompt
 */

export * from './harvesterPrompts.js';
export * from './transpilerPrompts.js';
export * from './enrichmentPrompts.js';
export * from './graphPrompts.js';
export * from './agentChatPrompts.js';
export * from './feedbackPrompts.js';
