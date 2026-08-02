# mdcode 도구 백링크 추출 및 관계 메타데이터 동기화 기여 제안서 (Contribution Proposal)

본 문서는 **Ontology with OKF** 플랫폼의 지식 생성 엔진에서 도출된 마크다운 스펙을 기반으로, 기존 TypeScript 기반 `mdcode` 도구에 백링크 및 관계 메타데이터 파싱 능력을 보완하여 Dataplex Entry 관계(Lineage 또는 Custom Aspects)와 동기화할 수 있도록 지원하는 기술 명세 및 코드 기여(Contribution) 스니핏을 다룹니다.

---

## 1. 배경 및 필요성 (Background & Context)
- 현재 Python 기반의 지식 에이전트(`reference_agent`)는 테이블 스키마 외에도 **물리 DDL**, **컬럼 프로파일(null rate, distinct count)** 및 GCS 상의 **어드밴스드 메타데이터**를 융합하여 LLM 추론을 거쳐 한국어로 정형화된 백링크 매핑 섹션을 생성합니다.
- 그러나 현재 TypeScript 기반의 `mdcode` CLI 도구는 생성된 마크다운을 단순히 하나의 텍스트 블록(`dataplex-types.global.overview`의 `content` 필드)으로 간주하여 Dataplex에 동기화할 뿐, 마크다운 내에 정의된 물리 관계 정보(RDB FK) 및 그래프 관계 정보(Graph Property Edge)를 구문 분석(Parsing)하여 Dataplex Entry 관계망이나 정형 데이터(Aspects)로 모델링하지 못합니다.
- 본 기여 제안은 `mdcode`가 마크다운을 파싱하는 단계(`parseMarkdown`) 또는 동기화 단계(`sync`)에서 정형화된 백링크를 파싱해 내어 데이터 구조체로 모델링하고 활용할 수 있도록 정규식 기반 구문 분석 유틸리티를 제공합니다.

---

## 2. 백링크 표준 표정 규격 (Standard Backlink Specifications)
지식 에이전트가 마크다운 내에 생성하는 정형 백링크 섹션은 아래 두 가지 규격으로 약속되어 있습니다.

### ① 🔗 RDB Foreign Key 백링크 (RDB Relational Joins)
- **목적**: 물리 테이블 구조 상의 외래키(FK) 및 조인 관계를 명시합니다.
- **포맷**: 
  `🔗 RDB FK 백링크: [대상_테이블](대상_테이블_경로.md) (조인 키: 소스_테이블.컬럼 = 대상_테이블.컬럼)`
- **예시**:
  `🔗 RDB FK 백링크: [users](users.md) (조인 키: orders.user_id = users.id)`

### ② 🕸️ Graph Property Edge 링크 (Property Graph Directed Edges)
- **목적**: BigQuery Property Graph 스펙 상의 노드-에지 방향성 그래프 릴레이션을 정의합니다.
- **포맷**: 
  `🕸️ Graph Edge 링크: (소스_노드)-[에지]->(대상_노드) ➔ [대상_테이블](대상_테이블_경로.md) (에지 라벨: 라벨_명칭, 노드: 노드_명칭)`
- **예시**:
  `🕸️ Graph Edge 링크: (u:User)-[p:Placed]->(o:Order) ➔ [users](users.md) (에지 라벨: Placed, 노드: User)`

---

## 3. 전/후 예시 및 결과 (Before / After Sample Output)

### [Before - 기존 마크다운 연동 방식]
마크다운 문서 내에 단순히 자연어 텍스트와 일반 하이퍼링크가 혼재되어, 도구가 의미를 식별하지 못하고 전체 마크다운 본문을 문자열로만 전달했습니다.
```markdown
# orders.md
이 테이블은 유저 테이블을 참조합니다. [users](users.md) 문서를 참고하세요.
```

### [After - 신규 규격 기반 마크다운 및 파싱 결과 예시]
지식 에이전트가 아래와 같이 정형화된 메타 백링크 문구를 본문에 생성합니다.
```markdown
# orders.md
...
## Relationships & Backlinks
- 🔗 RDB FK 백링크: [users](users.md) (조인 키: orders.user_id = users.id)
- 🕸️ Graph Edge 링크: (u:User)-[p:Placed]->(o:Order) ➔ [users](users.md) (에지 라벨: Placed, 노드: User)
```

이 본문을 아래 기여 코드로 추출하면, `mdcode` 내부적으로 다음과 같은 정형화된 JSON 데이터 구조를 획득하게 됩니다.
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
`knowledge-catalog/toolbox/mdcode/src/libts/` 경로 내에 관계 메타데이터 파싱 헬퍼 모듈로 추가하거나, `layouts/documents.ts` 내에 유틸리티 함수로 결합할 수 있는 스니핏입니다.
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
 * 마크다운 본문 텍스트에서 RDB FK 백링크 및 Graph Edge 링크 관계를 추출합니다.
 * 
 * @param markdownContent 마크다운 본문 문자열
 * @returns 추출된 RDB 및 Graph 관계 메타데이터 객체
 */
export function extractBacklinksFromMarkdown(markdownContent: string): ExtractedBacklinks {
  const rdbRelations: RdbBacklink[] = [];
  const graphRelations: GraphBacklink[] = [];
  const lines = markdownContent.split(/\r?\n/);

  // 1. RDB FK 패턴 정규식
  const rdbRegex = /🔗\s*RDB\s*FK\s*백링크:\s*\[([^\]]+)\]\(([^)]+)\)\s*(?:\(조인 키:\s*([^)]+)\))?/i;

  // 2. Graph Edge 패턴 정규식
  const graphRegex = /🕸️\s*Graph\s*Edge\s*링크:\s*(.+?)\s*➔\s*\[([^\]]+)\]\(([^)]+)\)\s*(?:\((.+?)\))?/i;

  for (const line of lines) {
    // 1) RDB FK 라인 파싱
    const rdbMatch = line.match(rdbRegex);
    if (rdbMatch) {
      rdbRelations.push({
        targetTable: rdbMatch[1].trim(),
        linkPath: rdbMatch[2].trim(),
        joinKey: rdbMatch[3] ? rdbMatch[3].trim() : undefined,
      });
      continue;
    }

    // 2) Graph Edge 라인 파싱
    const graphMatch = line.match(graphRegex);
    if (graphMatch) {
      const expr = graphMatch[1].trim();
      const target = graphMatch[2].trim();
      const path = graphMatch[3].trim();
      const meta = graphMatch[4];

      let edgeLabel: string | undefined;
      let nodeLabel: string | undefined;

      if (meta) {
        // "에지 라벨: Placed, 노드: User" 형태 파싱
        const edgeMatch = meta.match(/에지\s*라벨:\s*([^,\s]+)/);
        const nodeMatch = meta.match(/노드:\s*([^)\s]+)/);
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

## 5. 엔지니어링 활용 제안 (Engineering Action Item)
1. **`mdcode sync/push` 연동**:
   - `Sync` 또는 `Snapshot` 빌드 과정에서 위 유틸리티를 호출하여 백링크 관계를 정형화하고, 이를 Dataplex의 **`Entry.aspects`** 내 Custom Metadata Aspect(예: `custom-types.backlinks`)에 매핑하여 업로드하도록 확장합니다.
2. **Dataplex Catalog Lineage 연동**:
   - 추출된 RDB FK의 조인 키와 대상 테이블명을 바탕으로 Dataplex의 정식 **Lineage API**를 호출하여 물리적인 데이터 흐름(Data Lineage Map)을 백그라운드에서 자동 연계 구축하는 데 활용할 수 있습니다.
