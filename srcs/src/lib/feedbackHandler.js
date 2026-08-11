/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * Feedback Handler & Changelog Manager Module
 * Manages real-time business rule feedback injection, changelog tracking,
 * and graph synchronization status (PENDING_GRAPH_SYNC -> SYNCED).
 */

const fs = require('fs');
const path = require('path');

class FeedbackHandler {
  constructor(options = {}) {
    this.storeDir = options.storeDir || path.join(__dirname, '../../okf_store');
  }

  ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Appends an exception rule to 03_concepts.md and logs it to changelog.json
   */
  async submitFeedback(domain, ruleText, author = 'Biz Specialist', category = 'EXCEPTION_RULE') {
    const domainDir = path.join(this.storeDir, domain);
    this.ensureDirectory(domainDir);

    const conceptPath = path.join(domainDir, '03_concepts.md');
    const changelogPath = path.join(domainDir, 'changelog.json');

    const timestamp = new Date().toISOString();

    // 1. Update 03_concepts.md
    let conceptContent = fs.existsSync(conceptPath)
      ? fs.readFileSync(conceptPath, 'utf-8')
      : `# ⚖️ ${domain.toUpperCase()} Business Exception Rules\n\n`;

    const formattedRule = `\n- **[Rule Feedback - ${timestamp.slice(0, 10)}]** (${category}): ${ruleText} (Author: ${author})\n`;
    conceptContent += formattedRule;
    fs.writeFileSync(conceptPath, conceptContent, 'utf-8');

    // 2. Append to changelog.json
    let changelog = [];
    if (fs.existsSync(changelogPath)) {
      try {
        changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf-8'));
      } catch (e) {
        changelog = [];
      }
    }

    const newLogEntry = {
      id: `rule-${Date.now()}`,
      timestamp,
      author,
      category,
      ruleText,
      status: 'PENDING_GRAPH_SYNC'
    };

    changelog.push(newLogEntry);
    fs.writeFileSync(changelogPath, JSON.stringify(changelog, null, 2), 'utf-8');

    return {
      status: 'SUCCESS',
      entry: newLogEntry,
      totalRules: changelog.length,
      conceptPath,
      changelogPath
    };
  }

  /**
   * Gets all logged feedback rules for a domain
   */
  getFeedbackHistory(domain) {
    const changelogPath = path.join(this.storeDir, domain, 'changelog.json');
    if (!fs.existsSync(changelogPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(changelogPath, 'utf-8'));
    } catch (e) {
      return [];
    }
  }
}

module.exports = FeedbackHandler;
