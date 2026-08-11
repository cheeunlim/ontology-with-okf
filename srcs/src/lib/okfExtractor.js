/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * OKF 3-Layer Semantic Extractor Module
 * Transforms raw interview transcripts / CS documents into standard OKF 3-layer Markdown files
 * conforming to Google Cloud Open Knowledge Format (OKF) specification.
 */

const fs = require('fs');
const path = require('path');

class OKFExtractor {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.join(__dirname, '../../okf_store');
    this.ensureDirectory(this.outputDir);
  }

  ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Generates standard OKF 3-Layer Markdown files from raw text and metadata.
   * @param {string} rawText - Interview transcript or CS manual text
   * @param {Object} metadata - Metadata such as domain, target BQ tables, and author
   * @returns {Object} Generated OKF 3-layer file paths & contents
   */
  async extractOKF3Layer(rawText, metadata = {}) {
    const domain = metadata.domain || 'cx_analytics';
    const timestamp = new Date().toISOString();
    const targetBqTables = metadata.targetBqTables || ['seanjung-poc.theLookCommerce.orders'];

    // 1. Layer 1: Summary (배경 요약)
    const summaryYaml = [
      '---',
      `title: "${domain.toUpperCase()} Knowledge Summary"`,
      'type: Summary',
      `created_at: "${timestamp}"`,
      `author: "${metadata.author || 'Ontology Autopilot'}"`,
      'tags: ["summary", "cx", "okf"]',
      '---',
      ''
    ].join('\n');

    const summaryContent = `${summaryYaml}# 📌 ${domain.toUpperCase()} 비즈니스 맥락 및 배경 요약\n\n` +
      `## 1. 개요\n${rawText.slice(0, 300)}...\n\n` +
      `## 2. 주요 핵심 요약\n- 본 문서는 녹음 인터뷰 및 CS 매뉴얼에서 도출된 엔터프라이즈 암묵지 요약본입니다.\n- BigQuery 데이터셋([${targetBqTables[0]}])과 유기적으로 연결됩니다.\n`;

    // 2. Layer 2: Entities (엔티티 & BQ 테이블 1급 시민 매핑)
    const entityYaml = [
      '---',
      `title: "${domain.toUpperCase()} Entities & Physical Schema Mapping"`,
      'type: BigQuery Table',
      `resource_link: "//bigquery.googleapis.com/projects/${targetBqTables[0].split('.')[0]}/datasets/${targetBqTables[0].split('.')[1]}/tables/${targetBqTables[0].split('.')[2] || 'users'}"`,
      'status: ACTIVE',
      '---',
      ''
    ].join('\n');

    const entityContent = `${entityYaml}# 🏷️ ${domain.toUpperCase()} 엔티티 및 스키마 명세\n\n` +
      `## 1. 개체 명세\n- **주요 엔티티**: [[Customer]], [[Order]], [[ReturnTicket]]\n\n` +
      `## 2. BigQuery 물리 테이블 조인 관계\n` +
      `\`\`\`sql\n` +
      `SELECT o.order_id, c.customer_id, o.status\n` +
      `FROM \`${targetBqTables[0]}\` o\n` +
      `JOIN \`seanjung-poc.theLookCommerce.users\` c ON o.user_id = c.id;\n` +
      `\`\`\`\n`;

    // 3. Layer 3: Concepts & Business Rules (비즈니스 예외 규칙)
    const conceptYaml = [
      '---',
      `title: "${domain.toUpperCase()} Business Rules & Exception Concepts"`,
      'type: Concept',
      'version: "1.0.0"',
      '---',
      ''
    ].join('\n');

    const conceptContent = `${conceptYaml}# ⚖️ ${domain.toUpperCase()} 비즈니스 예외 규칙 (Business Rules)\n\n` +
      `## 1. 반품 및 환불 예외 규정\n` +
      `- **규칙 1**: 단순 변심 반품의 경우 출고일 기준 7일 이내에만 접수 가능합니다.\n` +
      `- **규칙 2 (암묵지 예외)**: VIP 고객의 경우 택배 수거 완료 전 선환불 처리([[FastRefundPolicy]])를 승인합니다.\n\n` +
      `## 2. 관련 백링크\n` +
      `- [[Customer]] -> [[FastRefundPolicy]]\n`;

    // Write files to disk
    const domainFolder = path.join(this.outputDir, domain);
    this.ensureDirectory(domainFolder);

    const summaryPath = path.join(domainFolder, '01_summary.md');
    const entityPath = path.join(domainFolder, '02_entities.md');
    const conceptPath = path.join(domainFolder, '03_concepts.md');

    fs.writeFileSync(summaryPath, summaryContent, 'utf-8');
    fs.writeFileSync(entityPath, entityContent, 'utf-8');
    fs.writeFileSync(conceptPath, conceptContent, 'utf-8');

    return {
      domain,
      files: {
        summary: { path: summaryPath, content: summaryContent },
        entities: { path: entityPath, content: entityContent },
        concepts: { path: conceptPath, content: conceptContent }
      }
    };
  }
}

module.exports = OKFExtractor;
