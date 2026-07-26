# Contribution Proposal: Backlink Parsing & Relationship Metadata Integration in mdcode

This document provides a technical specification and a TypeScript code contribution snippet for the `mdcode` tool (part of the **Ontology with OKF** platform). The goal is to extend the tool's markdown-parsing capability to extract relational backlinks (RDB FK Joins and Graph Property Edges) and map them to Dataplex Entry relationships or custom aspects.

---

## 1. Background & Context
- The Python-based `reference_agent` leverages table schemas, physical DDL, column profile statistics (null rates, distinct counts), and GCS-based advanced schemas to build detailed, English-localized relational backlinks in generated markdown specifications.
- Currently, the TypeScript-based `mdcode` CLI tool treats the entire generated markdown content as a single text block, syncing it solely as the `content` of the `dataplex-types.global.overview` aspect. It does not parse or extract RDB Foreign Key relationships or Property Graph relationships.
- This proposal introduces a regex-based parser module for `mdcode` (e.g., within `parseMarkdown` or during `sync`) to structuralize these backlinks. The extracted relation metadata can then be mapped to Dataplex Entry Lineage or custom Aspects.

---

## 2. Standard Backlink Specifications
The backlinks injected by the AI agent follow a strict, standardized format under two categories:

### ① 🔗 RDB Foreign Key Backlink (RDB Relational Joins)
- **Purpose**: Identifies physical foreign key join relations.
- **Format**: 
  `🔗 RDB FK Backlink: [target_table](target_table_link.md) (Join Key: source_table.column = target_table.column)`
- **Example**:
  `🔗 RDB FK Backlink: [users](users.md) (Join Key: orders.user_id = users.id)`

### ② 🕸️ Graph Property Edge Link (Property Graph Directed Edges)
- **Purpose**: Identifies node-edge-node relations in BigQuery Property Graphs.
- **Format**: 
  `🕸️ Graph Edge Link: (source_node)-[edge]->(target_node) ➔ [target_table](target_table_link.md) (Edge Label: label_name, Node: node_name)`
- **Example**:
  `🕸️ Graph Edge Link: (u:User)-[p:Placed]->(o:Order) ➔ [users](users.md) (Edge Label: Placed, Node: User)`

---

## 3. Before / After Sample Output

### [Before - Current Synchronization Behavior]
Markdown text is synchronized as raw string content without extracting structural dependencies.
```markdown
# orders.md
This table joins with the users table. Refer to [users](users.md).
```

### [After - Proposed Parser Extracted Output]
The AI agent writes structured backlinks:
```markdown
# orders.md
...
## Relationships & Backlinks
- 🔗 RDB FK Backlink: [users](users.md) (Join Key: orders.user_id = users.id)
- 🕸️ Graph Edge Link: (u:User)-[p:Placed]->(o:Order) ➔ [users](users.md) (Edge Label: Placed, Node: User)
```

With the proposed parser, `mdcode` internally parses the above text block into the following structured JSON output:
```json
{
  "rdbRelations": [
    {
      "targetTable": "users",
      "linkPath": "users.md",
      "joinKey": "orders.user_id = users.id"
    }
  ],
  "graphRelations": [
    {
      "expression": "(u:User)-[p:Placed]->(o:Order)",
      "targetTable": "users",
      "linkPath": "users.md",
      "edgeLabel": "Placed",
      "nodeLabel": "User"
    }
  ]
}
```

---

## 4. Git Contribution Code Snippet (TypeScript)
You can append this snippet directly to `knowledge-catalog/toolbox/mdcode/src/libts/` as a relation helper or incorporate it into the layout utilities in `layouts/documents.ts`.
```typescript
export interface RdbBacklink {
  targetTable: string;
  linkPath: string;
  joinKey?: string;
}

export interface GraphBacklink {
  expression: string;
  targetTable: string;
  linkPath: string;
  edgeLabel?: string;
  nodeLabel?: string;
}

export interface ExtractedBacklinks {
  rdbRelations: RdbBacklink[];
  graphRelations: GraphBacklink[];
}

/**
 * Extracts RDB FK Backlinks and Graph Edge relationship links from Markdown content.
 * 
 * @param markdownContent Raw markdown body
 * @returns Extracted RDB and Graph relationship metadata objects
 */
export function extractBacklinksFromMarkdown(markdownContent: string): ExtractedBacklinks {
  const rdbRelations: RdbBacklink[] = [];
  const graphRelations: GraphBacklink[] = [];
  const lines = markdownContent.split(/\r?\n/);

  // 1. Regex pattern for RDB FK
  const rdbRegex = /🔗\s*RDB\s*FK\s*Backlink:\s*\[([^\]]+)\]\(([^)]+)\)\s*(?:\(Join Key:\s*([^)]+)\))?/i;

  // 2. Regex pattern for Graph Property Edges
  const graphRegex = /🕸️\s*Graph\s*Edge\s*Link:\s*(.+?)\s*➔\s*\[([^\]]+)\]\(([^)]+)\)\s*(?:\((.+?)\))?/i;

  for (const line of lines) {
    // 1) Parse RDB FK Relationships
    const rdbMatch = line.match(rdbRegex);
    if (rdbMatch) {
      rdbRelations.push({
        targetTable: rdbMatch[1].trim(),
        linkPath: rdbMatch[2].trim(),
        joinKey: rdbMatch[3] ? rdbMatch[3].trim() : undefined,
      });
      continue;
    }

    // 2) Parse Graph Property Edge Relationships
    const graphMatch = line.match(graphRegex);
    if (graphMatch) {
      const expr = graphMatch[1].trim();
      const target = graphMatch[2].trim();
      const path = graphMatch[3].trim();
      const meta = graphMatch[4];

      let edgeLabel: string | undefined;
      let nodeLabel: string | undefined;

      if (meta) {
        // Parse metadata formats like "Edge Label: Placed, Node: User"
        const edgeMatch = meta.match(/Edge\s*Label:\s*([^,\s]+)/);
        const nodeMatch = meta.match(/Node:\s*([^)\s]+)/);
        if (edgeMatch) edgeLabel = edgeMatch[1].trim();
        if (nodeMatch) nodeLabel = nodeMatch[1].trim();
      }

      graphRelations.push({
        expression: expr,
        targetTable: target,
        linkPath: path,
        edgeLabel,
        nodeLabel,
      });
    }
  }

  return { rdbRelations, graphRelations };
}
```

---

## 5. Engineering Action Items
1. **Extend `mdcode sync/push`**:
   - Call this utility during the `sync` or `snapshot` build process to structuralize backlinks, mapping them to a custom metadata aspect (e.g., `custom-types.backlinks`) in Dataplex Entry aspects.
2. **Dataplex Catalog Lineage Integration**:
   - Use the extracted target table name and join key parameters to programmatically invoke Dataplex's **Lineage API** to auto-construct physical data lineage maps in the Dataplex UI.
