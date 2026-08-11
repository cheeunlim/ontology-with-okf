/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * 🛡️ OKF v0.2 Conformance Validator & Attestation Engine
 * 
 * Implements:
 * - EPIC-008: OKF v0.2 Conformance, Attestation & Human-in-the-Loop Governance
 * - TASK-008: Conformance Validator & Human Verification Console
 * - references/knowledge-catalog/okf/SPEC.md (§5 Provenance/Trust, §10 Attestation, §11 Conformance)
 */

/**
 * Parses Frontmatter and Body from an OKF Markdown string using pure native JS.
 */
export function parseOkfContent(content = '') {
  let text = (content || '').trim();

  // Strip wrapping markdown code blocks if present
  const codeBlockMatch = text.match(/^```(?:markdown|yaml)?\s*\r?\n([\s\S]*?)\r?\n```$/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  const fmMatch = text.match(/^(?:---\s*[\r\n]+)([\s\S]*?)[\r\n]+---\s*([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: text, rawFrontmatter: '' };
  }

  const rawFm = fmMatch[1];
  const body = fmMatch[2] || '';
  const parsedFm = {};

  // Pure Native YAML Frontmatter Parser
  const lines = rawFm.split(/\r?\n/);
  let currentKey = null;
  let currentList = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check list item under currentKey
    if (trimmed.startsWith('-') && currentKey) {
      const itemVal = trimmed.replace(/^-\s*/, '').trim();
      if (!currentList) {
        currentList = [];
        parsedFm[currentKey] = currentList;
      }

      // Check inline object: - { by: human:..., at: ... } or - id: foo
      if (itemVal.startsWith('{') && itemVal.endsWith('}')) {
        const objStr = itemVal.slice(1, -1);
        const obj = {};
        objStr.split(',').forEach(part => {
          const [k, ...vParts] = part.split(':');
          if (k) obj[k.trim()] = vParts.join(':').trim();
        });
        currentList.push(obj);
      } else if (itemVal.includes(':')) {
        const [k, ...vParts] = itemVal.split(':');
        const obj = { [k.trim()]: vParts.join(':').trim() };
        currentList.push(obj);
      } else {
        currentList.push(itemVal);
      }
      continue;
    }

    // Top-level key: value
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
      const key = line.slice(0, colonIdx).trim();
      const valStr = line.slice(colonIdx + 1).trim();
      currentKey = key;
      currentList = null;

      if (!valStr) {
        // Will be filled by list or multiline block
        parsedFm[key] = [];
        currentList = parsedFm[key];
      } else if (valStr.startsWith('[') && valStr.endsWith(']')) {
        // Inline array: [tag1, tag2]
        const items = valStr.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        parsedFm[key] = items;
      } else if (valStr.startsWith('{') && valStr.endsWith('}')) {
        // Inline object: { by: ..., at: ... }
        const obj = {};
        valStr.slice(1, -1).split(',').forEach(p => {
          const [ok, ...ov] = p.split(':');
          if (ok) obj[ok.trim()] = ov.join(':').trim().replace(/^['"]|['"]$/g, '');
        });
        parsedFm[key] = obj;
      } else {
        // Scalar string / number
        parsedFm[key] = valStr.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return { frontmatter: parsedFm, body, rawFrontmatter: rawFm };
}

/**
 * Calculates derived Trust Tier according to OKF v0.2 §5.3:
 * - human-reviewed: contains verified entry with 'human:<id>'
 * - machine-confirmed: verified entry with 'process:<id>' or has dataplex scan
 * - unverified: no verified entries
 */
export function deriveTrustTier(frontmatter = {}) {
  const verified = frontmatter.verified;
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];

  if (Array.isArray(verified) && verified.length > 0) {
    const hasHuman = verified.some(v => {
      const by = typeof v === 'object' ? (v.by || '') : String(v);
      return by.startsWith('human:');
    });
    if (hasHuman) return 'human-reviewed';

    const hasProcess = verified.some(v => {
      const by = typeof v === 'object' ? (v.by || '') : String(v);
      return by.startsWith('process:') || by.startsWith('reference_agent/');
    });
    if (hasProcess) return 'machine-confirmed';
  }

  if (tags.includes('dataplex-profiled') || tags.includes('verified')) {
    return 'machine-confirmed';
  }

  return 'unverified';
}

/**
 * Calculates Freshness & Days Remaining for stale_after (OKF v0.2 §5.5).
 */
export function calculateFreshness(staleAfter) {
  if (!staleAfter) {
    return { isStale: false, daysRemaining: null, label: 'Permanent' };
  }

  const targetDate = new Date(staleAfter);
  if (isNaN(targetDate.getTime())) {
    return { isStale: false, daysRemaining: null, label: 'Invalid Date' };
  }

  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    isStale: daysRemaining < 0,
    daysRemaining,
    label: daysRemaining < 0 
      ? `Expired (${Math.abs(daysRemaining)}d ago)` 
      : `D-${daysRemaining}`
  };
}

/**
 * Validates a single OKF Document against OKF v0.2 standards.
 */
export function validateOkfDocument(content, filename = 'document.md', knownEntities = []) {
  const issues = [];
  const { frontmatter, body } = parseOkfContent(content);

  // 1. Required 'type' field (§11 Conformance)
  if (!frontmatter.type) {
    issues.push({
      file: filename,
      severity: 'error',
      code: 'MISSING_TYPE',
      message: "필수 프론트매터 'type' 필드가 누락되었습니다. (§11 Conformance)"
    });
  }

  // 2. Status check (§5.4 Lifecycle)
  const validStatuses = ['draft', 'stable', 'deprecated'];
  if (frontmatter.status && !validStatuses.includes(frontmatter.status)) {
    issues.push({
      file: filename,
      severity: 'warning',
      code: 'INVALID_STATUS',
      message: `status '${frontmatter.status}'는 표준 규격(draft, stable, deprecated)이 아닙니다.`
    });
  }

  // 3. Provenance & Footnotes matching (§5.1)
  const footnoteMatches = body.match(/\[\^([a-zA-Z0-9_-]+)\]/g) || [];
  const usedFootnoteIds = Array.from(new Set(footnoteMatches.map(m => m.replace(/\[\^|\]/g, ''))));
  
  const sources = Array.isArray(frontmatter.sources) ? frontmatter.sources : [];
  const declaredSourceIds = sources.map(s => (typeof s === 'object' ? s.id : '')).filter(Boolean);

  for (const fnId of usedFootnoteIds) {
    if (declaredSourceIds.length > 0 && !declaredSourceIds.includes(fnId)) {
      issues.push({
        file: filename,
        severity: 'warning',
        code: 'FOOTNOTE_SOURCE_MISMATCH',
        message: `본문 각주 [^${fnId}]가 YAML 프론트매터의 sources 리스트에 선언되어 있지 않습니다.`
      });
    }
  }

  // 4. Broken Wiki Links detection
  const wikiLinkMatches = body.match(/\[\[([a-zA-Z0-9_\-\/]+)\]\]/g) || [];
  if (knownEntities.length > 0) {
    for (const link of wikiLinkMatches) {
      const entityName = link.replace(/\[\[|\]\]/g, '').split('/').pop();
      const exists = knownEntities.some(k => k === entityName || k.endsWith(entityName) || k.includes(entityName));
      if (!exists) {
        issues.push({
          file: filename,
          severity: 'warning',
          code: 'BROKEN_WIKI_LINK',
          message: `참조된 위키 백링크 [[${entityName}]] 대상이 번들 내에 존재하지 않습니다.`
        });
      }
    }
  }

  // 5. Freshness & Stale After scan (§5.5)
  const freshness = calculateFreshness(frontmatter.stale_after);
  if (freshness.isStale) {
    issues.push({
      file: filename,
      severity: 'warning',
      code: 'STALE_EXPIRED',
      message: `유효기간(stale_after: ${frontmatter.stale_after})이 만료되어 재검증(Re-certification)이 필요합니다.`
    });
  }

  // 6. Derived Trust Tier
  const trustTier = deriveTrustTier(frontmatter);

  return {
    file: filename,
    type: frontmatter.type || 'Unknown',
    title: frontmatter.title || filename,
    status: frontmatter.status || 'draft',
    trustTier,
    staleAfter: frontmatter.stale_after || null,
    freshness,
    issues,
    valid: issues.filter(i => i.severity === 'error').length === 0
  };
}

/**
 * Validates an entire bundle of OKF documents.
 */
export function validateOkfBundle(documents = []) {
  const knownEntities = documents.map(d => d.filename.replace(/\.md$/, '').split('/').pop());
  const details = [];
  const allIssues = [];

  let unverifiedCount = 0;
  let machineConfirmedCount = 0;
  let humanReviewedCount = 0;
  let staleCount = 0;

  for (const doc of documents) {
    const docResult = validateOkfDocument(doc.content, doc.filename, knownEntities);
    details.push(docResult);
    allIssues.push(...docResult.issues);

    if (docResult.trustTier === 'human-reviewed') humanReviewedCount++;
    else if (docResult.trustTier === 'machine-confirmed') machineConfirmedCount++;
    else unverifiedCount++;

    if (docResult.freshness.isStale) staleCount++;
  }

  const errorCount = allIssues.filter(i => i.severity === 'error').length;
  const total = documents.length;
  const conformanceScore = total > 0 ? Math.max(0, Math.round(100 - (errorCount * 25) - (allIssues.length * 5))) : 100;

  return {
    totalDocuments: total,
    conformanceScore: Math.min(100, Math.max(0, conformanceScore)),
    trustTiers: {
      humanReviewed: humanReviewedCount,
      machineConfirmed: machineConfirmedCount,
      unverified: unverifiedCount
    },
    staleCount,
    totalIssues: allIssues.length,
    issues: allIssues,
    details
  };
}

/**
 * Deterministic Attestation: Verifies canonical SQL equality (§10.2).
 */
export function validateSqlEquality(executedSql = '', sanctionedSql = '') {
  const normalizeSql = (sql) => {
    return (sql || '')
      // Remove SQL comments
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Replace multiple whitespaces with single space
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  const normExec = normalizeSql(executedSql);
  const normSanc = normalizeSql(sanctionedSql);

  const isMatch = normExec.length > 0 && normExec === normSanc;

  return {
    match: isMatch,
    verdict: isMatch ? 'ok' : 'rejected',
    executedNormalized: normExec,
    sanctionedNormalized: normSanc
  };
}
