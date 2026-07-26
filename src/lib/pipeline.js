/**
 * OKF & Knowledge Graph End-to-End Pipeline Manager
 * Handles user scenarios: Ingestion -> OKF 3-Layer Extraction -> Rule Feedback -> BQ/Spanner Graph DDL Generation
 */

const OKFExtractor = require('./okfExtractor');
const fs = require('fs');
const path = require('path');

class EnterprisePipelineManager {
  constructor(options = {}) {
    this.extractor = new OKFExtractor(options);
    this.storeDir = options.storeDir || path.join(__dirname, '../../okf_store');
  }

  /**
   * Scenario Step 1 & 2: Process Raw Interview Transcript -> OKF 3-Layer Generation
   */
  async processInterviewIngestion(transcript, metadata = {}) {
    const result = await this.extractor.extractOKF3Layer(transcript, metadata);
    return {
      status: 'SUCCESS',
      step: 'OKF_3LAYER_EXTRACTED',
      domain: result.domain,
      files: result.files
    };
  }

  /**
   * Scenario Step 2-B: Inject Business Exception Rule (Biz Feedback Loop)
   */
  async injectBusinessRule(domain, newRuleText, author = 'Biz Expert') {
    const domainDir = path.join(this.storeDir, domain);
    const conceptPath = path.join(domainDir, '03_concepts.md');
    const changelogPath = path.join(domainDir, 'changelog.json');

    let conceptContent = fs.existsSync(conceptPath) ? fs.readFileSync(conceptPath, 'utf-8') : '';
    
    // Append Exception Rule
    const ruleEntry = `\n- **[예외 피드백 - ${new Date().toLocaleDateString()}]**: ${newRuleText} (by ${author})\n`;
    conceptContent += ruleEntry;
    fs.writeFileSync(conceptPath, conceptContent, 'utf-8');

    // Update Changelog
    let changelog = [];
    if (fs.existsSync(changelogPath)) {
      try { changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf-8')); } catch (e) {}
    }
    changelog.push({
      timestamp: new Date().toISOString(),
      author,
      rule: newRuleText,
      status: 'PENDING_GRAPH_SYNC'
    });
    fs.writeFileSync(changelogPath, JSON.stringify(changelog, null, 2), 'utf-8');

    return {
      status: 'SUCCESS',
      step: 'RULE_INJECTED',
      domain,
      conceptPath,
      updatedRulesCount: changelog.length
    };
  }

  /**
   * Scenario Step 3: Auto-generate BigQuery Property Graph DDL & Spanner Graph DDL
   */
  generateGraphDDL(domain, tables = ['orders', 'users', 'returns']) {
    const bqGraphDDL = [
      `-- BigQuery Property Graph DDL for Domain: ${domain}`,
      `CREATE OR REPLACE PROPERTY GRAPH \`seanjung-poc.theLookCommerce.${domain}_graph\``,
      `NODE TABLES (`,
      `  \`seanjung-poc.theLookCommerce.users\` KEY (id) LABEL User,`,
      `  \`seanjung-poc.theLookCommerce.orders\` KEY (order_id) LABEL Order`,
      `)`,
      `EDGE TABLES (`,
      `  \`seanjung-poc.theLookCommerce.orders\` `,
      `    KEY (order_id) `,
      `    SOURCE KEY (user_id) REFERENCES \`seanjung-poc.theLookCommerce.users\` (id)`,
      `    DESTINATION KEY (order_id) REFERENCES \`seanjung-poc.theLookCommerce.orders\` (order_id)`,
      `    LABEL PLACED_ORDER`,
      `);`
    ].join('\n');

    const spannerGraphDDL = [
      `-- Spanner Graph DDL for Domain: ${domain}`,
      `CREATE TABLE Users (`,
      `  UserId STRING(36) NOT NULL,`,
      `  Name STRING(100)`,
      `) PRIMARY KEY (UserId);`,
      ``,
      `CREATE TABLE Orders (`,
      `  OrderId STRING(36) NOT NULL,`,
      `  UserId STRING(36) NOT NULL,`,
      `  TotalAmount NUMERIC`,
      `) PRIMARY KEY (UserId, OrderId),`,
      `  INTERLEAVE IN PARENT Users ON DELETE CASCADE;`
    ].join('\n');

    return {
      status: 'SUCCESS',
      step: 'GRAPH_DDL_GENERATED',
      domain,
      bigqueryGraphDDL: bqGraphDDL,
      spannerGraphDDL: spannerGraphDDL
    };
  }
}

module.exports = EnterprisePipelineManager;
