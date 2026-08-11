/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * 🤝 HITL Feedback Loop & Governance Prompt Module
 * 
 * @module feedbackPrompts
 * @epic EPIC-007 (OKF v0.2 Conformance & HITL Governance)
 * @description 현업 사용자 피드백(Feedback Loop) 반영 교정 및 지식 승약 보강 모듈
 */

/**
 * [EPIC-007] 사용자 피드백 반영 교정 답변 생성 프롬프트
 * 
 * @epic EPIC-007 (OKF v0.2 Conformance & HITL Governance)
 * @menu 🎙️ 4. Ingestion & Interview Feedback ➔ Feedback Loop
 * @api POST /api/feedback/refine
 * @param {string} question - 원본 질문
 * @param {string} feedbackText - 현업 사용자가 입력한 피드백/교정 지침
 * @returns {string} Gemini 프롬프트 문자열
 */
export function getFeedbackRefinePrompt(question, feedbackText) {
  return `You are an expert Data AI Agent. The user provided feedback correction.
User Question: "${question || '대화 결과 분석 질의'}"
User Feedback: "${feedbackText}"

Task:
Write a complete Markdown response in Korean incorporating this feedback.
`;
}
