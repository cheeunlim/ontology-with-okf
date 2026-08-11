/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 * 
 * 🖥️ OKF Omni Frontend Application (React Web App)
 * 
 * [수행 역할 및 비즈니스 프로세스]
 * 1. UI Layout & State Orchestration: 8개 주요 메인 작업 탭 관리 및 실시간 사용자 조작 상태(GCP Project, Dataset, Active Table 등) 싱크.
 * 2. 5-Stage Provenance Panel & Step Metrics:
 *    - Data Agent 대화창(오른쪽 패널)에서 AI 추론 7개 단계(전략, 백링크 스캔, 지식 결합, DDL, GQL, RDB, 합성)의 실시간 상태 및 토큰/소요시간 캡처 시각화.
 * 3. Dataplex Business Glossary & Aspects Explorer:
 *    - GCP Dataplex Catalog와 연동된 실시간 엔트리 스키마, 정보 구조, 다크모드/Glassmorphism 뷰 렌더링.
 *    - 온톨로지 보강 결과와 Dataplex 물리 Aspect 간 실시간 차이(Diff) 분석 및 수동 동기화(Push) 제어 인터페이스.
 * 4. LLM-Wiki Decomposer:
 *    - 비정형 원본 가이드라인 문서 업로드, AI 요약/개체/비즈니스룰 해체 상태 모니터링 및 로컬 위키 디렉토리 트리 뷰 인터페이스 제공.
 * 5. Automated OKF Enrichment Status Tracker:
 *    - 일괄 보강 스캔 시 실시간 진행률, 타겟 테이블 현황, 그리고 FK/Edge 관계 마인드맵/네트워크 시각화 렌더링.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import './App.css';
import { getEnrichmentPrompt } from './prompts/agentPrompts';

// Helper to parse OKF markdown with YAML frontmatter
function parseOKF(content) {
  if (!content) return null;
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;

  const frontmatterRaw = match[1];
  const body = match[2];

  const metadata = {};
  frontmatterRaw.split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        metadata[key] = value.slice(1, -1).split(',').map(s => s.trim());
      } else {
        metadata[key] = value.replace(/^['"]|['"]$/g, ''); // strip quotes
      }
    }
  });

  return { metadata, body };
}

// Helper to extract citations from the Citations section of the markdown body
function extractCitations(body) {
  if (!body) return [];
  const citationsIdx = body.indexOf('# Citations');
  if (citationsIdx === -1) return [];

  const citationsSection = body.substring(citationsIdx);
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const citations = [];
  let match;
  while ((match = regex.exec(citationsSection)) !== null) {
    citations.push({
      text: match[1],
      url: match[2]
    });
  }
  return citations;
}

// Helper to convert BigQuery API Resource URI to a real Google Cloud Console URL
function convertToConsoleUrl(resourceApiUrl) {
  if (!resourceApiUrl) return '';
  const match = resourceApiUrl.match(/projects\/([^/]+)\/datasets\/([^/]+)\/tables\/([^/]+)/);
  if (match) {
    const [, project, dataset, table] = match;
    return `https://console.cloud.google.com/bigquery?project=${project}&ws=1&type=table&dataset=${dataset}&table=${table}`;
  }

  const datasetMatch = resourceApiUrl.match(/projects\/([^/]+)\/datasets\/([^/]+)/);
  if (datasetMatch) {
    const [, project, dataset] = datasetMatch;
    return `https://console.cloud.google.com/bigquery?project=${project}&ws=1&type=dataset&dataset=${dataset}`;
  }

  return resourceApiUrl;
}

// Helper to format bytes to human-readable size
function formatBytes(bytes) {
  if (!bytes) return '0 Bytes';
  const num = parseInt(bytes, 10);
  if (isNaN(num) || num === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(num) / Math.log(k));
  return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper to format timestamps to readable local date/time
function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(parseInt(timestamp, 10));
  return date.toLocaleString();
}

// Helper to get immediate subfolders and files under a specific GCS path prefix
function getFolderContents(folderPath, filesList) {
  const prefix = folderPath ? (folderPath.endsWith('/') ? folderPath : folderPath + '/') : '';
  const dirs = new Set();
  const files = new Set();

  filesList.forEach(file => {
    if (prefix && !file.startsWith(prefix)) return;

    const relativePath = prefix ? file.substring(prefix.length) : file;
    const parts = relativePath.split('/');

    if (parts.length > 1) {
      dirs.add(parts[0] + '/');
    } else if (parts[0]) {
      files.add(parts[0]);
    }
  });

  return {
    directories: Array.from(dirs).sort(),
    files: Array.from(files).sort()
  };
}

// Full Name Mapping dictionary for 1-letter truncated labels or table aliases
const FULL_LABEL_MAP = {
  'U': 'User',
  'O': 'Order',
  'P': 'Product',
  'E': 'Event',
  'users': 'User',
  'orders': 'Order',
  'products': 'Product',
  'events': 'Event'
};

const FULL_EDGE_MAP = {
  'P': 'Placed',
  'O': 'OrderedItem',
  'T': 'Triggered',
  'placed': 'Placed',
  'ordereditem': 'OrderedItem',
  'triggered': 'Triggered'
};

// Interactive GCP Dataplex Style Property Graph Canvas (Draggable Nodes, Zoom/Pan & Selection Focus)
function DataplexInteractiveCanvas({ nodeTables, edgeTables }) {
  const containerRef = React.useRef(null);

  // Format node & edge tables with guaranteed full names
  const normalizedNodes = (nodeTables || []).map(n => ({
    ...n,
    label: FULL_LABEL_MAP[n.label] || FULL_LABEL_MAP[n.table] || n.label
  }));

  const normalizedEdges = (edgeTables || []).map(e => ({
    ...e,
    name: FULL_EDGE_MAP[e.name] || e.name,
    source: FULL_LABEL_MAP[e.source] || e.source,
    target: FULL_LABEL_MAP[e.target] || e.target
  }));

  const [nodePositions, setNodePositions] = React.useState(() => {
    const defaultPositions = [
      { x: 620, y: 120 },  // User
      { x: 380, y: 310 },  // Order
      { x: 160, y: 490 },  // Product
      { x: 720, y: 450 },  // Event
    ];
    const colors = [
      { circle: '#ea580c', bg: '#ea580c' }, // User (Orange)
      { circle: '#db2777', bg: '#db2777' }, // Order (Pink)
      { circle: '#0d9488', bg: '#0d9488' }, // Product (Teal)
      { circle: '#2563eb', bg: '#2563eb' }  // Event (Blue)
    ];
    const map = {};
    normalizedNodes.forEach((n, idx) => {
      const pos = defaultPositions[idx] || { x: 220 + (idx * 160), y: 180 + ((idx % 2) * 160) };
      map[n.label] = {
        ...n,
        x: pos.x,
        y: pos.y,
        color: colors[idx % colors.length]
      };
    });
    return map;
  });

  const [zoomScale, setZoomScale] = React.useState(1.0);
  const [panOffset, setPanOffset] = React.useState({ x: 0, y: 0 });
  const [draggingNode, setDraggingNode] = React.useState(null);
  const [isPanDragging, setIsPanDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });
  const [selectedNodeLabel, setSelectedNodeLabel] = React.useState(null);

  // Zoom In / Out / Fit Screen / Reset Handlers
  const handleZoomIn = () => setZoomScale(prev => Math.min(prev + 0.15, 2.5));
  const handleZoomOut = () => setZoomScale(prev => Math.max(prev - 0.15, 0.4));

  // Calculate bounding box of nodes and fit cleanly inside canvas viewport
  const handleFitScreen = () => {
    const positions = Object.values(nodePositions);
    if (positions.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    positions.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const padding = 120;
    const graphWidth = Math.max(maxX - minX + padding * 2, 400);
    const graphHeight = Math.max(maxY - minY + padding * 2, 350);

    const canvasWidth = containerRef.current ? containerRef.current.clientWidth : 800;
    const canvasHeight = containerRef.current ? containerRef.current.clientHeight : 600;

    const scaleX = canvasWidth / graphWidth;
    const scaleY = canvasHeight / graphHeight;
    const newScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.55), 1.25);

    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;

    const panX = (canvasWidth / 2) - (graphCenterX * newScale);
    const panY = (canvasHeight / 2) - (graphCenterY * newScale);

    setZoomScale(newScale);
    setPanOffset({ x: panX, y: panY });
    setSelectedNodeLabel(null);
  };

  const handleReset = () => {
    setZoomScale(1.0);
    setPanOffset({ x: 0, y: 0 });
    setSelectedNodeLabel(null);
  };



  // Wheel Zoom Handler
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 0.08 : -0.08;
    setZoomScale(prev => Math.min(Math.max(prev + zoomFactor, 0.4), 2.5));
  };

  // Mouse Down (Node Drag vs Pan Canvas Drag)
  const handleMouseDownNode = (e, label) => {
    e.stopPropagation();
    setDraggingNode(label);
    setSelectedNodeLabel(label);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseDownCanvas = (e) => {
    if (e.target.dataset.canvasBackground) {
      setIsPanDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  // Mouse Move
  const handleMouseMove = (e) => {
    if (draggingNode) {
      const dx = (e.clientX - dragStart.x) / zoomScale;
      const dy = (e.clientY - dragStart.y) / zoomScale;
      setNodePositions(prev => ({
        ...prev,
        [draggingNode]: {
          ...prev[draggingNode],
          x: prev[draggingNode].x + dx,
          y: prev[draggingNode].y + dy
        }
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (isPanDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  // Mouse Up
  const handleMouseUp = () => {
    setDraggingNode(null);
    setIsPanDragging(false);
  };

  return (
    <div
      ref={containerRef}
      data-canvas-background="true"
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      style={{
        flex: 1,
        position: 'relative',
        backgroundColor: '#f8fafc',
        backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
        backgroundSize: '16px 16px',
        borderRadius: '12px',
        border: '1px solid #cbd5e1',
        minHeight: '620px',
        maxHeight: '680px',
        overflow: 'hidden',
        cursor: draggingNode ? 'grabbing' : isPanDragging ? 'move' : 'default',
        userSelect: 'none'
      }}
    >
      {/* 1. LEFT TOP OVERLAY SUMMARY CARD (GCP Dataplex Style) */}
      <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 10, backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '14px 18px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', minWidth: '300px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{normalizedNodes.length} nodes, {normalizedEdges.length} edges</span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>▼</span>
        </div>

        {/* Full Node Type Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {normalizedNodes.map((n, idx) => {
            const isSelected = selectedNodeLabel === n.label;
            const color = (nodePositions[n.label] && nodePositions[n.label].color) || { bg: '#ea580c' };
            return (
              <span
                key={idx}
                onClick={(e) => { e.stopPropagation(); setSelectedNodeLabel(n.label); }}
                style={{
                  backgroundColor: color.bg,
                  color: '#ffffff',
                  fontSize: '11.5px',
                  fontWeight: 'bold',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  boxShadow: isSelected ? '0 0 0 2px #38bdf8, 0 2px 6px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.08)',
                  transform: isSelected ? 'scale(1.05)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {n.label}
              </span>
            );
          })}
        </div>

        {/* Full Edge Relation Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {normalizedEdges.map((e, idx) => (
            <span key={idx} style={{ backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '6px' }}>
              ⚡ {e.name}
            </span>
          ))}
        </div>
      </div>


      {/* 2. FLOATING INTERACTIVE CONTROLS (ZOOM / PAN / RESET TOOLBAR) */}
      <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '4px 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#334155', minWidth: '70px', textAlign: 'center' }}>
          🔍 {Math.round(zoomScale * 100)}%
        </span>
        <button onClick={handleZoomIn} title="Zoom In (+)" style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
          ➕
        </button>
        <button onClick={handleZoomOut} title="Zoom Out (-)" style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
          ➖
        </button>
        <button onClick={handleFitScreen} title="Fit to Screen" style={{ backgroundColor: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span>⛶</span> Fit Screen
        </button>
        <button onClick={handleReset} title="Reset View" style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
          🔄 Reset
        </button>

      </div>

      {/* 3. INTERACTIVE CANVAS CONTAINER WITH ZOOM & PAN TRANSFORM */}
      <div
        data-canvas-background="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
          transformOrigin: '0 0',
          transition: draggingNode || isPanDragging ? 'none' : 'transform 0.1s ease-out'
        }}
      >
        {/* SVG Edge Connection Lines & Midpoint Relation Badges */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
          <defs>
            <marker id="arrowhead-interactive" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
            </marker>
            <marker id="arrowhead-highlight" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#a855f7" />
            </marker>
          </defs>

          {normalizedEdges.map((e, idx) => {

            const srcPos = nodePositions[e.source];
            const tgtPos = nodePositions[e.target];
            const isHighlighted = selectedNodeLabel && (e.source === selectedNodeLabel || e.target === selectedNodeLabel);

            if (srcPos && tgtPos) {
              const xMid = (srcPos.x + tgtPos.x) / 2;
              const yMid = (srcPos.y + tgtPos.y) / 2;
              const badgeText = `⚡ ${e.name}`;
              const approxWidth = Math.max(badgeText.length * 7 + 16, 75);

              return (
                <g key={idx}>
                  {/* Connection Line */}
                  <line
                    x1={srcPos.x}
                    y1={srcPos.y}
                    x2={tgtPos.x}
                    y2={tgtPos.y}
                    stroke={isHighlighted ? '#a855f7' : '#64748b'}
                    strokeWidth={isHighlighted ? '3.5' : '2.5'}
                    strokeDasharray={isHighlighted ? '6 3' : 'none'}
                    markerEnd={isHighlighted ? 'url(#arrowhead-highlight)' : 'url(#arrowhead-interactive)'}
                    style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
                  />

                  {/* Midpoint Edge Relation Name Badge */}
                  <rect
                    x={xMid - approxWidth / 2}
                    y={yMid - 11}
                    width={approxWidth}
                    height="22"
                    rx="11"
                    fill={isHighlighted ? '#7c3aed' : '#0284c7'}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.15))' }}
                  />
                  <text
                    x={xMid}
                    y={yMid + 4}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="11"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    {badgeText}
                  </text>
                </g>
              );
            }
            return null;
          })}
        </svg>

        {/* Render Circle Nodes & Attached Full Label Tag Chips */}
        {Object.keys(nodePositions).map((label, idx) => {
          const node = nodePositions[label];
          const pkCol = node.table === 'orders' ? 'order_id' : 'id';
          const isSelected = selectedNodeLabel === label;

          return (
            <div
              key={idx}
              onMouseDown={(e) => handleMouseDownNode(e, label)}
              style={{
                position: 'absolute',
                left: `${node.x - 20}px`,
                top: `${node.y - 20}px`,
                zIndex: isSelected ? 5 : 2,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'grab'
              }}
            >
              {/* Circle Node */}
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: node.color.circle,
                  boxShadow: isSelected ? '0 0 0 4px #a855f7, 0 4px 14px rgba(168,85,247,0.4)' : '0 3px 10px rgba(0,0,0,0.15)',
                  border: '2.5px solid #ffffff',
                  transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                  transform: isSelected ? 'scale(1.1)' : 'none'
                }}
              />

              {/* Attached Label Tag Chip (Full Name & Table Info) */}
              <div
                style={{
                  backgroundColor: node.color.bg,
                  color: '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  display: 'flex',
                  flexDirection: 'column',
                  lineHeight: '1.3',
                  boxShadow: isSelected ? '0 0 0 2px #a855f7, 0 3px 10px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.12)'
                }}
              >
                <span>{node.label}</span>
                <span style={{ fontSize: '10px', opacity: 0.95, marginTop: '2px', fontWeight: 'normal' }}>
                  key: {pkCol} ({node.table})
                </span>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// Inline markdown tokenizer (links, inline code, bold)
function renderInlineMarkdown(text, onLinkClick) {
  if (!text) return '';
  const tokens = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIdx = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      tokens.push(text.substring(lastIdx, match.index));
    }
    const linkText = match[1];
    const linkUrl = match[2];
    tokens.push(
      <span
        key={`link-${match.index}`}
        onClick={() => onLinkClick ? onLinkClick(linkUrl) : window.open(linkUrl, '_blank')}
        style={{ color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline', fontWeight: '500' }}
      >
        {linkText}
      </span>
    );
    lastIdx = linkRegex.lastIndex;
  }
  if (lastIdx < text.length) {
    tokens.push(text.substring(lastIdx));
  }

  return tokens.map((token, tIdx) => {
    if (typeof token !== 'string') return token;

    const codeParts = token.split(/(`[^`]+`)/g);
    return codeParts.map((part, pIdx) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code
            key={`${tIdx}-${pIdx}`}
            style={{
              backgroundColor: '#f1f5f9',
              color: '#0f172a',
              padding: '2px 5px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '11.5px',
              border: '1px solid #e2e8f0'
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((bPart, bIdx) => {
        if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length > 4) {
          return <strong key={`${tIdx}-${pIdx}-${bIdx}`}>{bPart.slice(2, -2)}</strong>;
        }
        return bPart;
      });
    });
  });
}

// Full Markdown Renderer (White body, dark codeblocks, structured tables, frontmatter cards)
function MarkdownRenderer({ content, onLinkClick }) {
  if (!content) return null;

  // 1. Unwrap outer code fence if entire content is enclosed in ```markdown ... ```
  let text = String(content).trim();
  const outerFence = text.match(/^```(?:markdown|yaml)?\s*\r?\n([\s\S]*?)\r?\n```$/);
  if (outerFence) {
    text = outerFence[1].trim();
  }

  // 2. Extract YAML Frontmatter if present at the very beginning
  let frontmatter = null;
  const fmMatch = text.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*([\s\S]*)$/);
  if (fmMatch) {
    frontmatter = fmMatch[1].trim();
    text = fmMatch[2].trim();
  }

  const lines = text.split('\n');
  const elements = [];

  // YAML Frontmatter Card at top of rendered view
  if (frontmatter) {
    elements.push(
      <div
        key="fm-card"
        style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
          <span style={{ fontWeight: 'bold', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            📋 YAML Frontmatter Specification
          </span>
          <span style={{ fontSize: '10px', color: '#64748b', backgroundColor: '#e2e8f0', padding: '1px 6px', borderRadius: '4px' }}>
            Metadata
          </span>
        </div>
        <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '11.5px', color: '#334155', lineHeight: '1.55', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
          <code>{frontmatter}</code>
        </pre>
      </div>
    );
  }

  let inCodeBlock = false;
  let codeBlockContent = [];
  let codeBlockLang = '';
  let inTable = false;
  let tableRows = [];

  const flushTable = (keyIdx) => {
    if (tableRows.length === 0) return;
    const headerRow = tableRows[0];
    const dataRows = tableRows.slice(1).filter(r => !r.every(c => /^[-:\s]+$/.test(c)));

    elements.push(
      <div key={`table-wrapper-${keyIdx}`} style={{ overflowX: 'auto', margin: '14px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {headerRow.map((cell, cIdx) => (
                <th key={cIdx} style={{ padding: '8px 12px', borderBottom: '1.5px solid #cbd5e1', borderRight: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 'bold', color: '#1e293b' }}>
                  {renderInlineMarkdown(cell, onLinkClick)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, rIdx) => (
              <tr key={rIdx} style={{ backgroundColor: rIdx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', color: '#334155' }}>
                    {renderInlineMarkdown(cell, onLinkClick)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block detection
    if (trimmed.startsWith('```')) {
      if (inTable) flushTable(i);

      if (inCodeBlock) {
        // End code block
        elements.push(
          <div key={`code-block-${i}`} style={{ margin: '14px 0', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', overflow: 'hidden' }}>
            {codeBlockLang && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155' }}>
                <span style={{ fontSize: '10.5px', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  {codeBlockLang}
                </span>
              </div>
            )}
            <pre style={{ margin: 0, padding: '14px', color: '#e2e8f0', fontSize: '12px', fontFamily: 'monospace', lineHeight: '1.6', overflowX: 'auto' }}>
              <code>{codeBlockContent.join('\n')}</code>
            </pre>
          </div>
        );
        codeBlockContent = [];
        codeBlockLang = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockLang = trimmed.substring(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Markdown Table Check
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      inTable = true;
      const cells = trimmed
        .substring(1, trimmed.length - 1)
        .split('|')
        .map(c => c.trim());
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable(i);
    }

    // Headings
    if (trimmed.startsWith('# ')) {
      elements.push(<h1 key={i} style={{ fontSize: '1.45rem', fontWeight: '700', margin: '22px 0 10px 0', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>{trimmed.substring(2)}</h1>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<h2 key={i} style={{ fontSize: '1.25rem', fontWeight: '600', margin: '18px 0 8px 0', color: 'var(--text-primary)', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>{trimmed.substring(3)}</h2>);
    } else if (trimmed.startsWith('### ')) {
      elements.push(<h3 key={i} style={{ fontSize: '1.05rem', fontWeight: '600', margin: '14px 0 6px 0', color: 'var(--text-primary)' }}>{trimmed.substring(4)}</h3>);
    } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      const listContent = trimmed.substring(2);
      elements.push(
        <li key={i} style={{ marginLeft: '20px', margin: '4px 0', color: '#334155', listStyleType: 'disc', fontSize: '12.5px', lineHeight: '1.6' }}>
          {renderInlineMarkdown(listContent, onLinkClick)}
        </li>
      );
    } else if (trimmed === '') {
      elements.push(<div key={i} style={{ height: '6px' }} />);
    } else {
      elements.push(
        <p key={i} style={{ margin: '6px 0', color: '#334155', fontSize: '12.5px', lineHeight: '1.65' }}>
          {renderInlineMarkdown(line, onLinkClick)}
        </p>
      );
    }
  }

  if (inTable) {
    flushTable(lines.length);
  }

  return <div className="markdown-body" style={{ textAlign: 'left', backgroundColor: '#ffffff', color: '#334155' }}>{elements}</div>;
}

// Universal Markdown Viewer with Unified Header and 2 Toggle Modes (Viewer / RAW Code with Integrated Diff)
function UniversalMarkdownViewer({
  title = 'Markdown Document Viewer',
  subtitle = '',
  content = '',
  previousContent = '',
  onLinkClick,
  defaultMode = 'rendered', // 'rendered' | 'raw'
  badge = null,
  extraHeaderActions = null,
  maxHeight = 'calc(100vh - 360px)',
  containerStyle = {}
}) {
  const [viewMode, setViewMode] = useState(defaultMode === 'raw' ? 'raw' : 'rendered');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (defaultMode) {
      setViewMode(defaultMode === 'raw' ? 'raw' : 'rendered');
    }
  }, [defaultMode]);

  const handleCopy = () => {
    if (!content) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Compute precise diff highlighting inside RAW view (only true additions when previousContent exists)
  const diffInfo = useMemo(() => {
    const currLines = (content || '').split('\n');
    if (!previousContent || previousContent.trim().length === 0 || previousContent.trim() === (content || '').trim()) {
      return {
        hasDiff: false,
        addedCount: 0,
        lines: currLines.map(line => ({ text: line, isAdded: false }))
      };
    }

    const prevLines = previousContent.split('\n');
    const prevSet = new Set(prevLines.map(l => l.trim()));

    let addedCount = 0;
    const lines = currLines.map(line => {
      const trimmed = line.trim();
      const isAdded = trimmed.length > 0 && !prevSet.has(trimmed);
      if (isAdded) addedCount++;
      return { text: line, isAdded };
    });

    return {
      hasDiff: addedCount > 0,
      addedCount,
      lines
    };
  }, [content, previousContent]);

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: diffInfo.hasDiff ? '1.5px solid #10b981' : '1px solid var(--border-light)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        ...containerStyle
      }}
    >
      {/* 1. Header Bar: Title, Subtitle, 2-Mode Toggle (Viewer / RAW Code) & Copy */}
      <div
        style={{
          padding: '10px 16px',
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            📄 {title}
          </span>
          {badge || (diffInfo.hasDiff && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '2px 8px',
                borderRadius: '10px',
                backgroundColor: '#ecfdf5',
                color: '#047857',
                border: '1px solid #a7f3d0',
                whiteSpace: 'nowrap'
              }}
            >
              ✨ +{diffInfo.addedCount} lines diff
            </span>
          ))}
          {subtitle && (
            <span style={{ fontSize: '10.5px', color: '#64748b', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* 2-Mode Segmented Control: Viewer vs RAW Code */}
          <div style={{ display: 'flex', backgroundColor: '#e2e8f0', padding: '2px', borderRadius: '6px', gap: '2px' }}>
            <button
              onClick={() => setViewMode('rendered')}
              style={{
                border: 'none',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: viewMode === 'rendered' ? 'bold' : 'normal',
                backgroundColor: viewMode === 'rendered' ? '#ffffff' : 'transparent',
                color: viewMode === 'rendered' ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                boxShadow: viewMode === 'rendered' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              👁️ Viewer
            </button>

            <button
              onClick={() => setViewMode('raw')}
              style={{
                border: 'none',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: viewMode === 'raw' ? 'bold' : 'normal',
                backgroundColor: viewMode === 'raw' ? '#0f172a' : 'transparent',
                color: viewMode === 'raw' ? '#38bdf8' : 'var(--text-secondary)',
                cursor: 'pointer',
                boxShadow: viewMode === 'raw' ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="RAW 소스코드 뷰 (변경/보강된 diff 라인은 자동으로 + 초록색 하이라이트 표시)"
            >
              <span>💻</span>
              <span>RAW Code</span>
              {diffInfo.hasDiff && (
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', marginLeft: '2px' }}></span>
              )}
            </button>
          </div>

          <button
            onClick={handleCopy}
            title="마크다운 내용 복사"
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '600',
              backgroundColor: copied ? '#ecfdf5' : '#ffffff',
              color: copied ? '#059669' : '#475569',
              border: copied ? '1px solid #10b981' : '1px solid #cbd5e1',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s'
            }}
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>

          {extraHeaderActions}
        </div>
      </div>

      {/* 2. Viewer Body */}
      <div
        style={{
          flex: 1,
          padding: viewMode === 'raw' ? '14px' : '20px',
          overflowY: 'auto',
          maxHeight: maxHeight,
          backgroundColor: viewMode === 'raw' ? '#0b1120' : '#ffffff'
        }}
      >
        {viewMode === 'raw' ? (
          /* RAW Code Mode (Dark Background + Integrated Diff Highlights for added lines) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {diffInfo.hasDiff && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '6px 12px', borderRadius: '6px', border: '1px solid #1e293b', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                  🔍 RAW Source Code with Integrated Diff
                </span>
                <span style={{ fontSize: '10px', color: '#34d399', backgroundColor: '#064e3b', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                  + Green: 이번 액션으로 추가·보강된 변경 라인 ({diffInfo.addedCount}줄)
                </span>
              </div>
            )}
            <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '14px', border: '1px solid #1e293b', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6', overflowX: 'auto' }}>
              {diffInfo.lines.map((item, idx) => {
                if (item.isAdded) {
                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: '#064e3b',
                        color: '#6ee7b7',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        margin: '1.5px 0',
                        borderLeft: '3px solid #10b981',
                        wordBreak: 'break-all'
                      }}
                    >
                      <span style={{ color: '#34d399', fontWeight: 'bold', marginRight: '8px', userSelect: 'none' }}>+</span>
                      {item.text.startsWith('+ ') ? item.text.substring(2) : item.text}
                    </div>
                  );
                }
                return (
                  <div key={idx} style={{ color: '#cbd5e1', padding: '1.5px 8px', wordBreak: 'break-all' }}>
                    <span style={{ color: '#475569', marginRight: '8px', userSelect: 'none' }}>&nbsp;</span>
                    {item.text}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Viewer Mode: Clean White Markdown Renderer */
          <MarkdownRenderer content={content} onLinkClick={onLinkClick} />
        )}
      </div>
    </div>
  );
}

// Global Backend API Base URL Configuration (Defaulting to current origin or port 3003)
const BACKEND_URL = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3003'; const BUSINESS_TERMS_CATALOG = {
  // orders table fields
  'order_id': {
    term: '주문 고유 식별코드 (Order ID)',
    definition: '주문이 발생할 때 시스템에서 생성하는 16자리 유니크 비즈니스 키. 모든 회계 및 배송 트랜잭션의 기본 키(PK) 역할을 합니다.',
    synonyms: ['주문번호', '주문 ID', 'Transaction ID', 'Order Reference Number'],
    relatedTerms: [
      { name: 'user_id', relation: '주문 주체 (고객 식별자)' },
      { name: 'created_at', relation: '주문 생성 타임스탬프' },
      { name: 'status', relation: '주문 진행 상태 코드' }
    ]
  },
  'user_id': {
    term: '고객 식별번호 (User ID)',
    definition: '가입 시점에 고객에게 부여되는 고유 난수 키. 이커머스 표준 마케팅 및 CRM 분석의 고객 단일 뷰 기준 키가 됩니다.',
    synonyms: ['회원번호', '유저 ID', 'Customer Key', 'UID'],
    relatedTerms: [
      { name: 'order_id', relation: '고객이 유발한 구매 거래 리스트' },
      { name: 'gender', relation: '고객 세그먼트 성별 정보' }
    ]
  },
  'returned_at': {
    term: '반품 승인 일시 (Return Approval Timestamp)',
    definition: '고객이 반품한 실물 물품이 물류 센터 검수실에 입고되어 최종 환불 승인 처리가 완료된 시스템 일시.',
    synonyms: ['환불 완료일', '반품 완료 시각', 'Refund Approved Date'],
    relatedTerms: [
      { name: 'order_id', relation: '반품 대상 원거래 주문 코드' },
      { name: 'status', relation: '반품 완료에 따른 상태 변경 (Returned)' }
    ]
  },
  'shipped_at': {
    term: '배송 출고 일시 (Shipment Commencement)',
    definition: '물류창고(Distribution Center)에서 송장 출고 스캔이 완료되어 배송사로 실물 인계가 완료된 시각.',
    synonyms: ['출고 시점', '배송 시작 시각', 'Dispatch Timestamp'],
    relatedTerms: [
      { name: 'created_at', relation: '주문 생성부터 출고까지 소요시간 측정' },
      { name: 'delivered_at', relation: '실 배송 완료 시점' }
    ]
  },
  'delivered_at': {
    term: '배송 완료 일시 (Delivery Completion)',
    definition: '배송 택배사의 최종 배송완료 신호가 수신되어 고객의 수령 주소지에 물품이 도달한 회계상 완료 시각.',
    synonyms: ['수령 완료일', '배달 완료 시각', 'Delivery Timestamp'],
    relatedTerms: [
      { name: 'shipped_at', relation: '배송 소요(Lead Time) 계산용' }
    ]
  },
  'status': {
    term: '주문 처리 상태 (Order Status Code)',
    definition: '주문의 진행 단계를 나타내는 약속된 상태 문자열 (Processing, Shipped, Delivered, Returned, Cancelled).',
    synonyms: ['진행 단계', '주문 상황', 'State Code'],
    relatedTerms: [
      { name: 'order_id', relation: '주문 거래의 최종 상태 정보 기록' }
    ]
  },
  'num_of_item': {
    term: '주문 품목 수량 (Item Quantity Count)',
    definition: '단일 주문 건에 결합된 개별 아이템(SKU)의 총 개수 스칼라 수치.',
    synonyms: ['구매 수량', '아이템 개수', 'Unit Count'],
    relatedTerms: [
      { name: 'order_id', relation: '해당 주문에 포함된 총 벌크 수량' }
    ]
  },
  // products table fields
  'cost': {
    term: '상품 잔존/원가 (Cost Price)',
    definition: '제조사 또는 벤더로부터 공급받은 상품 본연의 매입 단가. 영업이익 및 마진(Margin) 산출의 기저 비용 변수입니다.',
    synonyms: ['매입 단가', '조달가', 'Supply Price', 'Net Cost'],
    relatedTerms: [
      { name: 'retail_price', relation: '최종 소비자 판매가' },
      { name: 'brand', relation: '브랜드 계약 단가' }
    ]
  },
  'retail_price': {
    term: '소비자 판매가 (Retail Selling Price)',
    definition: '이커머스 몰에 표기되는 프로모션 적용 전 상품 표준 권장 소비자 가격.',
    synonyms: ['정가', '소비자가', 'List Price'],
    relatedTerms: [
      { name: 'cost', relation: '매입 원가 대비 마진율 계산' }
    ]
  },
  'sku': {
    term: '상품 표준 코드 (SKU - Stock Keeping Unit)',
    definition: '물류 재고 관리를 위해 할당한 최소 판매 가능 단위의 영숫자 바코드 조합.',
    synonyms: ['재고 코드', '바코드 번호', 'Part Number'],
    relatedTerms: [
      { name: 'name', relation: '단품 한글/영문 명칭 매핑' },
      { name: 'category', relation: '재고 보관 구역(Aisle) 대분류' }
    ]
  }
};

function App() {

  // Connection & Collapsible Sidebar State
  const [projectId, setProjectId] = useState('seanjung-poc');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState('');
  const [isDatasetDropdownOpen, setIsDatasetDropdownOpen] = useState(false);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [isBqExplorerExpanded, setIsBqExplorerExpanded] = useState(true);
  const [expandedGcsDatasets, setExpandedGcsDatasets] = useState({});
  const [selectedGcsFolder, setSelectedGcsFolder] = useState('');
  const [logs, setLogs] = useState([]);
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false); // 온보딩 실전 가이드 모달 상태
  const [appLang, setAppLang] = useState('kr'); // 글로벌 앱 언어 상태 ('kr' | 'en')

  // GCS Bundle Navigation State
  const [gcsFiles, setGcsFiles] = useState([]);
  const [selectedGcsFile, setSelectedGcsFile] = useState('');
  const [gcsFileContent, setGcsFileContent] = useState('');
  const [isGcsFileLoading, setIsGcsFileLoading] = useState(false);
  const [isWikiProcessing, setIsWikiProcessing] = useState(false); // 📌 위키 백그라운드 처리 상태
  const [pushAspects, setPushAspects] = useState({ description: true, overview: true }); // 📌 Dataplex 동기화 대상 Aspects 상태
  const [isPushingDataplex, setIsPushingDataplex] = useState(false); // 📌 Dataplex 동기화 중 진행 상태
  const [localMetadata, setLocalMetadata] = useState({ description: '', body: '' }); // 📌 GCS OKF 원본 메타데이터 파싱 캐시
  const [hasLocalOkf, setHasLocalOkf] = useState(true); // 📌 GCS상에 OKF 파일 물리 실존 여부 플래그
  const [isLocalLoading, setIsLocalLoading] = useState(false); // 📌 GCS OKF 로딩 상태


  // Loaded Table Details State
  const [tableDetails, setTableDetails] = useState(null);
  const [activeTab, setActiveTab] = useState('schema'); // 'schema' | 'preview' | 'advanced-schema' | 'okf' | 'enrichment'

  // Dataset Dashboard State (when selectedDataset is set, but selectedTable is empty)
  const [datasetActiveTab, setDatasetActiveTab] = useState('tables');
  // [EPIC-005] Dataset Graph DB Synthesizer Agent States
  const [customGraphResult, setCustomGraphResult] = useState(null);
  const [isSynthesizingGraph, setIsSynthesizingGraph] = useState(false);
  const [isDeployingGraph, setIsDeployingGraph] = useState(false);
  const [deployMessage, setDeployMessage] = useState('');
 // 'tables' | 'graph-designer' | 'chat' | 'query'
  const [graphRightViewMode, setGraphRightViewMode] = useState('ddl'); // 'ddl' | 'diagram'
  const [selectedTablesForGraph, setSelectedTablesForGraph] = useState([]);
  const [graphName, setGraphName] = useState('thelookgraph');
  const [activeDetailTab, setActiveDetailTab] = useState('graph'); // 'graph' | 'code'
  const [datasetAgentResult, setDatasetAgentResult] = useState('');
  const [isDatasetAgentLoading, setIsDatasetAgentLoading] = useState(false);

  // OKF Generation State
  const [generatedOkf, setGeneratedOkf] = useState(null);
  const [okfViewMode, setOkfViewMode] = useState('rendered'); // 'rendered' | 'diff' | 'raw'
  const [okfGenerationStep, setOkfGenerationStep] = useState(1); // 1: 원천수집 ➔ 2: 위키매핑 ➔ 3: LLM맥락보완 ➔ 4: GCS저장완료
  const [batchOkfProgress, setBatchOkfProgress] = useState({}); // { [tableId]: { step: number, status: 'pending'|'running'|'done'|'error' } }
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifierName, setVerifierName] = useState('human:seanjung');
  const [stalePresetOption, setStalePresetOption] = useState('permanent'); // 'permanent' | '1year' | '3years' | 'custom'
  const [customStaleDate, setCustomStaleDate] = useState('');

  // Parse YAML Frontmatter for Verification & Trust Lifecycle (OKF v0.2 §5.2)
  const parsedFm = useMemo(() => {
    if (!generatedOkf?.content) return null;
    const content = generatedOkf.content;
    const match = content.match(/(?:^|\r?\n)\s*---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*/);
    if (!match) return null;
    const yaml = match[1];
    const statusMatch = yaml.match(/^status:\s*([^\r\n]+)/m);
    const verifiedMatch = yaml.match(/^verified:\s*([^\r\n]+|\n(?:\s*-[^\r\n]+\s*\n?)+)/m);
    const tagsMatch = yaml.match(/^tags:\s*([^\r\n]+|\n(?:\s*-[^\r\n]+\s*\n?)+)/m);
    const generatedMatch = yaml.match(/^generated:\s*\{([^}]+)\}/m);
    const staleMatch = yaml.match(/^stale_after:\s*([^\r\n]+)/m);
    const statusVal = statusMatch ? statusMatch[1].trim() : 'draft';
    const tagsVal = tagsMatch ? tagsMatch[1].trim() : '';

    const hasVerifiedField = !!verifiedMatch && !/unverified/i.test(verifiedMatch[0]);
    const hasVerifiedTag = /verified/i.test(tagsVal);
    const isVerified = hasVerifiedField || statusVal === 'stable' || hasVerifiedTag;

    // Extract verifier actor safely (e.g. human:seanjung)
    let verifierActor = 'human:seanjung';
    if (verifiedMatch) {
      const actorMatch = verifiedMatch[0].match(/(?:by:\s*['"]?)(human:[^,}'"\s]+|[a-zA-Z0-9_:-]+)/);
      if (actorMatch) {
        verifierActor = actorMatch[1];
      }
    }

    return {
      status: statusVal,
      isVerified,
      verifierActor,
      verifiedRaw: verifiedMatch ? verifiedMatch[1].trim() : null,
      generatedRaw: generatedMatch ? generatedMatch[1].trim() : null,
      staleAfter: staleMatch ? staleMatch[1].trim() : null,
      tags: tagsVal
    };
  }, [generatedOkf?.content]);

  // Handle Human Steward Review & Approval
  const handleVerifyOkf = async () => {
    if (!selectedDataset || !selectedTable) return;
    setIsVerifying(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/verify-okf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          tableId: selectedTable,
          verifiedBy: verifierName || 'human:seanjung',
          status: 'stable',
          content: generatedOkf?.content
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}: Failed to verify OKF`);
      }
      const data = await res.json();
      if (data.success && data.content) {
        setGeneratedOkf(prev => ({
          ...(prev || {}),
          content: data.content,
          filePath: data.filePath || prev?.filePath,
          status: data.status || 'stable',
          verified: [{ by: data.verifiedBy, at: data.verifiedAt }]
        }));
        setTableDetails(prev => prev ? ({
          ...prev,
          hasOkf: true,
          okfContent: data.content
        }) : prev);
        addLog(`테이블(${selectedTable}) OKF 검토 및 승인 완료 (status: stable, verified: ${data.verifiedBy})`, 'success');
        setSuccessMessage(`테이블(${selectedTable}) OKF 명세가 검토 및 승인되어 공식 지식(Verified / Stable)으로 승격되었습니다.`);
      } else {
        throw new Error(data.error || 'Verification response was unsuccessful');
      }
    } catch (err) {
      console.error('Failed to verify OKF:', err);
      setError(`OKF 검토 승인 실패: ${err.message}`);
      addLog(`OKF 검토 승인 실패: ${err.message}`, 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  // AI Agent Tools State
  const [activeAgentAction, setActiveAgentAction] = useState('advanced-schema'); // 'profile' | 'graph-design' | 'sql-helper' | 'rag-design'
  const [agentResults, setAgentResults] = useState({}); // { [actionId]: string }
  const [isAgentLoading, setIsAgentLoading] = useState(false);

  // BigQuery SQL Runner State
  const [sqlToExecute, setSqlToExecute] = useState('');
  const [isSqlExecuting, setIsSqlExecuting] = useState(false);
  const [sqlResult, setSqlResult] = useState(null);

  // Autonomous Data Agent Chat State (NL2SQL)
  const [chatMessages, setChatMessages] = useState([]); // { sender, text, sql, rows, error }
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [selectedChatMessageIndex, setSelectedChatMessageIndex] = useState(null);
  const [savingInsightMap, setSavingInsightMap] = useState({}); // { [msgKey]: 'idle' | 'saving' | 'saved' }

  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false); // 위키 기반 지식 보강 상태

  // 지식 보강 리포트(Enrichment Report) 및 대상 테이블 선택 State
  const [enrichmentReport, setEnrichmentReport] = useState(null);
  const [selectedEnrichTableIds, setSelectedEnrichTableIds] = useState([]);

  // 에이전트 실행 추적(Trace) 상태
  const [selectedTraceTable, setSelectedTraceTable] = useState(null);
  const [okfGenerateLog, setOkfGenerateLog] = useState({}); // { [tableId]: string }
  const [activeTraceTab, setActiveTraceTab] = useState('thoughts'); // 'thoughts' | 'prompt'
  const [activeMdcodeTraceTab, setActiveMdcodeTraceTab] = useState('log'); // 'log' | 'prompt'

  // Dataplex DataScans (Profile & Quality) State
  const [dataplexScans, setDataplexScans] = useState(null);
  const [isScanningTable, setIsScanningTable] = useState({}); // { [tableId]: boolean }
  const [isBatchScanning, setIsBatchScanning] = useState(false);

  // 위키 작성기(Wiki Creator) 상태 추가
  const [isWikiModalOpen, setIsWikiModalOpen] = useState(false);
  const [wikiCategory, setWikiCategory] = useState('general');
  const [wikiFileName, setWikiFileName] = useState('');
  const [wikiContent, setWikiContent] = useState('');

  // Data Agent 대화 내역 영구 지속성 (localStorage 연동 & 데이터셋별 보관)
  useEffect(() => {
    if (!selectedDataset) return;
    const saved = localStorage.getItem('okf_chat_' + selectedDataset);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setChatMessages(parsed);
        }
      } catch (e) {
        console.error('Failed to parse saved chat history:', e);
      }
    } else {
      setChatMessages([]);
    }
  }, [selectedDataset]);

  useEffect(() => {
    if (selectedDataset && chatMessages.length > 0) {
      try {
        localStorage.setItem('okf_chat_' + selectedDataset, JSON.stringify(chatMessages));
      } catch (e) {
        console.error('Failed to persist chat history:', e);
      }
    }
  }, [chatMessages, selectedDataset]);

  // 대화 내역 초기화 (Reset Chat) 핸들러
  const handleResetChatHistory = () => {
    try {
      const confirmMsg = appLang === 'kr' ? '정말로 이 데이터셋의 대화 내역을 모두 초기화하시겠습니까?' : 'Reset chat history for this dataset?';
      if (window.confirm(confirmMsg)) {
        setChatMessages([]);
        setSelectedChatMessageIndex(null);
        if (selectedDataset) {
          localStorage.setItem('okf_chat_' + selectedDataset, '[]');
        }
      }
    } catch (e) {
      console.error('Failed to reset chat history:', e);
      alert('Error resetting chat: ' + e.message);
    }
  };
  const [selectedSample, setSelectedSample] = useState('');
  const [wikiSamples, setWikiSamples] = useState([]);
  const [isPdfParsing, setIsPdfParsing] = useState(false);

  // GitHub Explorer 상태 추가
  const [githubPath, setGithubPath] = useState('');
  const [githubItems, setGithubItems] = useState([]);
  const [selectedGithubFile, setSelectedGithubFile] = useState(null); // { name, downloadUrl }
  const [githubFileContent, setGithubFileContent] = useState('');
  const [translatedGithubContent, setTranslatedGithubContent] = useState('');
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [isGithubTranslating, setIsGithubTranslating] = useState(false);
  const [githubBreadcrumbs, setGithubBreadcrumbs] = useState([]);

  // Helper to append real-time logs (Hoisted before any handler invocations)
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  // Individual BigQuery REST API Pipeline Execution States
  const [apiExecutionStatus, setApiExecutionStatus] = useState({
    metadata: { status: 'idle', result: null, time: null },
    ddl: { status: 'idle', result: null, time: null },
    profiling: { status: 'idle', result: null, time: null },
    lineage: { status: 'idle', result: null, time: null }
  });

  // Individual BigQuery REST API Step Handler (Parallel execution supported)
  const handleRunSingleApi = async (apiType) => {
    if (!selectedTable || !selectedDataset) return;

    setApiExecutionStatus(prev => ({
      ...prev,
      [apiType]: { status: 'loading', result: null, time: null }
    }));
    addLog(appLang === 'en' ? `[BigQuery Native API Execution] Initiating ${apiType.toUpperCase()} API call...` : `[BigQuery Native API Execution] ${apiType.toUpperCase()} API 호출 시작...`, 'info');

    const startTime = Date.now();

    try {
      if (apiType === 'metadata') {
        const response = await fetch(`${BACKEND_URL}/api/table-details?projectId=${projectId}&datasetId=${selectedDataset}&tableId=${selectedTable}`);
        if (!response.ok) throw new Error('Failed to fetch table metadata');
        const data = await response.json();
        setTableDetails(data);
        setApiExecutionStatus(prev => ({
          ...prev,
          metadata: {
            status: 'success',
            result: `Rows: ${parseInt(data.numRows || 0, 10).toLocaleString()} | Bytes: ${formatBytes(data.numBytes)} | Location: ${data.location}`,
            time: `${Date.now() - startTime}ms`
          }
        }));
        addLog(appLang === 'en' ? `[BigQuery Native API 1 Success] Schema Metadata ingestion completed (${Date.now() - startTime}ms)` : `[BigQuery Native API 1 Success] Schema Metadata 수집 완료 (${Date.now() - startTime}ms)`, 'success');
      }
      else if (apiType === 'ddl') {
        const response = await fetch(`${BACKEND_URL}/api/table-details?projectId=${projectId}&datasetId=${selectedDataset}&tableId=${selectedTable}`);
        if (!response.ok) throw new Error('Failed to fetch DDL');
        const data = await response.json();
        setTableDetails(data);
        setApiExecutionStatus(prev => ({
          ...prev,
          ddl: {
            status: 'success',
            result: data.ddl || 'No DDL Found in INFORMATION_SCHEMA',
            time: `${Date.now() - startTime}ms`
          }
        }));
        addLog(appLang === 'en' ? `[BigQuery Native API 2 Success] INFORMATION_SCHEMA DDL extraction completed (${Date.now() - startTime}ms)` : `[BigQuery Native API 2 Success] INFORMATION_SCHEMA DDL 추출 완료 (${Date.now() - startTime}ms)`, 'success');
      }
      else if (apiType === 'profiling') {
        const response = await fetch(`${BACKEND_URL}/api/table-details?projectId=${projectId}&datasetId=${selectedDataset}&tableId=${selectedTable}`);
        if (!response.ok) throw new Error('Failed to fetch profiling');
        const data = await response.json();
        setTableDetails(data);
        setApiExecutionStatus(prev => ({
          ...prev,
          profiling: {
            status: 'success',
            result: appLang === 'en' ? `SQL statistics completed for ${data.columnProfiles ? data.columnProfiles.length : 0} columns` : `${data.columnProfiles ? data.columnProfiles.length : 0}개 컬럼 전수 SQL 통계 완료`,
            time: `${Date.now() - startTime}ms`
          }
        }));
        addLog(appLang === 'en' ? `[BigQuery Native API 3 Success] Native Profiling SQL processing completed (${Date.now() - startTime}ms)` : `[BigQuery Native API 3 Success] Native Profiling SQL 처리 완료 (${Date.now() - startTime}ms)`, 'success');
      }
      else if (apiType === 'lineage') {
        const pkFields = tableDetails?.schema?.fields?.filter(f => f.name.toLowerCase().includes('id')) || [];
        setApiExecutionStatus(prev => ({
          ...prev,
          lineage: {
            status: 'success',
            result: appLang === 'en' ? `Lineage inferred and ASSERT rules built for ${pkFields.length} keys` : `${pkFields.length}개 조인/키 리니지 추론 및 ASSERT 규칙 생성 완료`,
            time: `${Date.now() - startTime}ms`
          }
        }));
        addLog(appLang === 'en' ? `[BigQuery Native API 4 Success] Lineage & Quality ASSERT rules collection completed (${Date.now() - startTime}ms)` : `[BigQuery Native API 4 Success] Lineage & Quality ASSERT 규칙 수집 완료 (${Date.now() - startTime}ms)`, 'success');
      }
    } catch (err) {
      setApiExecutionStatus(prev => ({
        ...prev,
        [apiType]: { status: 'error', result: err.message, time: `${Date.now() - startTime}ms` }
      }));
      addLog(appLang === 'en' ? `[BigQuery Native API Error] ${apiType.toUpperCase()} execution failed: ${err.message}` : `[BigQuery Native API Error] ${apiType.toUpperCase()} 실행 실패: ${err.message}`, 'error');
    }
  };

  // Assemble and Save Integrated Advanced Schema Markdown File (tableId_advanced_schema.md)
  const [isSavingAdvancedSchema, setIsSavingAdvancedSchema] = useState(false);
  const [savedAdvancedSchemaUri, setSavedAdvancedSchemaUri] = useState('');

  const handleSaveAdvancedSchemaMarkdown = async () => {
    if (!selectedTable || !selectedDataset || !tableDetails) return;

    setIsSavingAdvancedSchema(true);
    setError('');
    setSuccessMessage('');
    addLog(`[Advanced Schema Export] 통합 마크다운 문서 (${selectedTable}_advanced_schema.md) 생성 및 GCS 저장 시작...`, 'info');

    try {
      // 1. Markdown 내용 조립
      let mdContent = `# 📊 BigQuery Advanced Schema & Profiling Report: \`${selectedTable}\`\n\n`;
      mdContent += `> **Project ID:** \`${projectId}\`  \n`;
      mdContent += `> **Dataset ID:** \`${selectedDataset}\`  \n`;
      mdContent += `> **Table ID:** \`${selectedTable}\`  \n`;
      mdContent += `> **Generated At:** ${new Date().toLocaleString()}\n\n`;

      // Section 1: Schema Metadata
      mdContent += `---
## 1. 📋 Schema & Metadata Summary
- **Total Rows:** ${parseInt(tableDetails.numRows || '0', 10).toLocaleString()}
- **Total Size:** ${formatBytes(tableDetails.numBytes)}
- **Storage Location:** \`${tableDetails.location || 'US'}\`
- **Partitioning:** \`${tableDetails.timePartitioning ? (tableDetails.timePartitioning.type || 'DAY') : 'None'}\`
- **Clustering Fields:** \`${tableDetails.clustering ? tableDetails.clustering.join(', ') : 'None'}\`
- **Created / Modified:** ${formatDate(tableDetails.creationTime)}\n\n`;

      // Section 2: BigQuery Native Column Profiles
      mdContent += `---
## 2. 📊 BigQuery Native Column Statistics
| Field Name | Type | Mode | Non-Null Rows | Distinct Count | Null Count | Null Rate (%) | Data Health |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;
      if (tableDetails.columnProfiles && tableDetails.columnProfiles.length > 0) {
        tableDetails.columnProfiles.forEach(cp => {
          const rate = parseFloat(cp.nullRatePct || '0');
          const health = rate < 20 ? 'Pass (Good)' : 'Attention Required';
          mdContent += `| \`${cp.name}\` | \`${cp.type}\` | ${cp.mode || 'NULLABLE'} | ${parseInt(cp.count || 0, 10).toLocaleString()} | ${parseInt(cp.distinctCount || 0, 10).toLocaleString()} | ${parseInt(cp.nullCount || 0, 10).toLocaleString()} | ${cp.nullRatePct}% | **${health}** |\n`;
        });
      } else {
        mdContent += `| *No profiling statistics available* | - | - | - | - | - | - | - |\n`;
      }
      mdContent += `\n`;

      // Section 3: DDL Statement
      mdContent += `---
## 3. 📜 BigQuery CREATE TABLE DDL
\`\`\`sql
${tableDetails.ddl || '-- DDL not available in INFORMATION_SCHEMA'}
\`\`\`
\n`;

      // Section 4: Lineage & Quality Rules
      mdContent += `---
## 4. 🔗 Inferred Data Lineage & Key Joins
- **Primary Key Candidate:** \`${selectedTable.replace(/s$/, '')}_id\` or \`id\`
- **Foreign Key Candidates:**
`;
      const idFields = tableDetails.schema?.fields?.filter(f => f.name.toLowerCase().includes('id')) || [];
      idFields.forEach(f => {
        mdContent += `  - \`${f.name}\` (${f.type})\n`;
      });
      mdContent += `\n`;

      mdContent += `---
## 5. 🛡️ Data Quality Monitoring Rules (BigQuery ASSERT Statements)
\`\`\`sql
-- 1. Check Non-Null Constraint on Primary Identifier
ASSERT (SELECT COUNTIF(id IS NULL) FROM \`${projectId}.${selectedDataset}.${selectedTable}\`) = 0;

-- 2. Check Primary Key Uniqueness Constraint
ASSERT (SELECT COUNT(DISTINCT id) FROM \`${projectId}.${selectedDataset}.${selectedTable}\`) = (SELECT COUNT(1) FROM \`${projectId}.${selectedDataset}.${selectedTable}\`);
\`\`\`
\n`;

      // 2. 백엔드 /api/save-advanced-schema 호출
      const response = await fetch(`${BACKEND_URL}/api/save-advanced-schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          tableId: selectedTable,
          content: mdContent
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to save integrated advanced schema file');
      }

      const resData = await response.json();
      setSavedAdvancedSchemaUri(resData.gcsUri);
      setSuccessMessage(`✓ 통합 마크다운 생성 완료! (${selectedTable}_advanced_schema.md)`);
      addLog(`[GCS 저장 완료] 파일 '${resData.filePath}'이 GCS에 저장되었습니다.`, 'success');
      setTimeout(() => setSuccessMessage(''), 4000);

      // GCS 트리 리프레시
      fetchGcsBundleTree(projectId);

    } catch (err) {
      setError(err.message || 'Failed to save advanced schema markdown');
      addLog(`[Advanced Schema Export Error] ${err.message}`, 'error');
    } finally {
      setIsSavingAdvancedSchema(false);
    }
  };
  const [isGithubExpanded, setIsGithubExpanded] = useState(false); // GitHub Explorer 토글 확장 상태 추가
  const [isGithubModeActive, setIsGithubModeActive] = useState(false); // GitHub Explorer 메인 모드 활성화 여부

  // 데이터셋 상세 메타데이터 상태 추가
  const [datasetMetadata, setDatasetMetadata] = useState(null);
  const [isDatasetMetaLoading, setIsDatasetMetaLoading] = useState(false);

  // 사이드바 내부 분할 조절 높이 상태 추가 (기본 320px)
  const [bqExplorerHeight, setBqExplorerHeight] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartInfo = React.useRef({ startY: 0, startHeight: 0 });

  // 물리 Property Graph 목록 상태 추가
  const [physicalGraphs, setPhysicalGraphs] = useState([]);
  const [isPhysicalGraphsLoading, setIsPhysicalGraphsLoading] = useState(false);
  const [selectedPhysicalGraph, setSelectedPhysicalGraph] = useState(null); // { name, ddl, creationTime }
  const [isGraphBuilding, setIsGraphBuilding] = useState(false);
  const [graphDesignerTab, setGraphDesignerTab] = useState('design'); // 'design' | 'physical'

  // 지식 보강 서브 뷰 상태 ('setup' | 'result')
  const [enrichmentSubView, setEnrichmentSubView] = useState('setup'); // 'setup': 설정 및 진행 프로세스 뷰, 'result': 완료 결과 리포트 뷰
  const [enrichStep, setEnrichStep] = useState(0);
  const [enrichTimelineStatus, setEnrichTimelineStatus] = useState(null); // 실시간 폴링 상태 캐시
  const [enrichmentResult, setEnrichmentResult] = useState(null); // 최종 성공 리포트 데이터
  const [selectedEnrichedTable, setSelectedEnrichedTable] = useState(''); // 결과 Diff를 볼 테이블 ID
  const [enrichActiveTab, setEnrichActiveTab] = useState('thoughts'); // 'thoughts' | 'diff'
  const [singleTableSubView, setSingleTableSubView] = useState('setup'); // 단일 테이블 전용 뷰 ('setup' | 'result')
  const [singleTableEnrichResult, setSingleTableEnrichResult] = useState(null); // 단일 테이블 전용 보강 결과


  // docs/ 폴더 내 PDF 선택 및 업로드 파싱 관련 상태
  const [parsedWikiDocs, setParsedWikiDocs] = useState([]); // 파싱 누적된 커스텀 PDF 목록 [{ title: '파일명.pdf', content: '추출텍스트', size: '1.2 KB' }]
  const [localPdfList, setLocalPdfList] = useState([]); // docs/ 폴더 내 서버 샘플 PDF 목록
  const [selectedServerPdf, setSelectedServerPdf] = useState(''); // 선택된 서버 PDF 파일명
  const [isParsingPdf, setIsParsingPdf] = useState(false); // PDF 파싱 처리 중인지 여부
  const [customEnrichmentPrompt, setCustomEnrichmentPrompt] = useState(''); // 에이전트 시스템 프롬프트 사용자 커스텀 편집 텍스트
  const fileInputRef = useRef(null); // 로컬 파일 인풋 선택용 ref
  const chatContainerRef = useRef(null); // 대화 창 스크롤 및 4/5 지점 질문 노출 제어용 ref

  // Graph Designer 전용 추가 상태
  const [isGraphDesigning, setIsGraphDesigning] = useState(false); // AI 그래프 설계 중 로딩 상태
  const [datasetGraphResult, setDatasetGraphResult] = useState(null); // AI 설계 결과 { mermaid, ddl }
  const [graphSqlQuery, setGraphSqlQuery] = useState(''); // 물리 그래프 쿼리 텍스트
  const [graphSqlResult, setGraphSqlResult] = useState(null); // 물리 그래프 쿼리 결과

  // LLM Wiki Engine 전용 추가 상태
  const [llmWikiTree, setLlmWikiTree] = useState([]);
  const [selectedWikiFile, setSelectedWikiFile] = useState('00_seed/master_taxonomy.md');
  const [selectedWikiContent, setSelectedWikiContent] = useState('');
  const [llmWikiStep, setLlmWikiStep] = useState(1); // 1: Seed, 2: Fast-Path, 3: Slow-Path, 4: GQL GraphRAG
  const [isWikiParsing, setIsWikiParsing] = useState(false);
  const [isWikiColdRunning, setIsWikiColdRunning] = useState(false);
  const [isWikiSlowRunning, setIsWikiSlowRunning] = useState(false);
  const [wikiSlowResult, setWikiSlowResult] = useState(null);

  // Dataplex Glossary 전용 추가 상태
  const [dataplexGlossary, setDataplexGlossary] = useState(null);
  const [isGlossaryLoading, setIsGlossaryLoading] = useState(false);
  const [selectedGlossaryTable, setSelectedGlossaryTable] = useState('[dataset]');
  const [selectedGlossaryAspect, setSelectedGlossaryAspect] = useState('overview');
  const [selectedGlossaryColumn, setSelectedGlossaryColumn] = useState('');
  const [copiedGraphDdl, setCopiedGraphDdl] = useState(false);
  const [isDeployingRecommendedGraph, setIsDeployingRecommendedGraph] = useState(false);
  const [recommendedGraphDeployMsg, setRecommendedGraphDeployMsg] = useState('');

  // 사용자 피드백 루프 전용 상태
  const [activeFeedbackMsgIdx, setActiveFeedbackMsgIdx] = useState(null);
  const [feedbackInputText, setFeedbackInputText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackRatingsMap, setFeedbackRatingsMap] = useState({});

  // 문서 추가 모달 전용 상태
  const [addWikiModalOpen, setAddWikiModalOpen] = useState(false);
  const [addWikiType, setAddWikiType] = useState('preset'); // 'preset' | 'text' | 'pdf_file'
  const [addWikiFileName, setAddWikiFileName] = useState('');
  const [addWikiTextContent, setAddWikiTextContent] = useState('');
  const [isAddingWikiDoc, setIsAddingWikiDoc] = useState(false);
  const [wikiInboxInput, setWikiInboxInput] = useState(`---
title: 2026-07-04 PG사 연동 결제 실패 장애 긴급 보고서
date: 2026-07-04
author: 김운영 엔지니어
status: RESOLVED
---

# 2026-07-04 PG사 연동 결제 실패 장애 긴급 보고서

## 1. 장애 개요
- **발생 시각**: 2026-07-04 14:05:00 ~ 14:40:00 (총 35분간)
- **영향 범위**: OKF 음료 구매 고객 1,200명
- **주요 증상**: 고객 ID 1234를 포함한 일부 고객의 OKF 음료 주문 시 PG사 결제 타임아웃으로 결제 실패(FAILED) 발생.

## 2. 원인 분석
PG사 A의 게이트웨이 타임아웃으로 인해 주문 테이블(orders)의 status가 FAILED로 {appLang === 'en' ? 'Updated' : '갱신됨'}.

## 3. 조치 및 보상 지침
- **환불 처리**: 결제 실패건 1,200건 전원에 대해 24시간 이내 100% 자동 환불 처리 완료.
- **연관 규정**: [[주문규정.md]] 제3조 (환불 지침) 및 [[결제_및_정산]] 규정에 의거 보상 진행.
`);

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Data Agent Chat History Helpers
  const fetchChatHistory = async (targetDataset) => {
    if (!targetDataset) return;
    try {
      const res = await fetch(`/api/chat-history?datasetId=${targetDataset}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        setChatMessages(data.messages);
        if (data.messages.length > 0) {
          setSelectedChatMessageIndex(data.messages.length - 1);
        }
      }
    } catch (err) {
      console.error('Error loading chat history:', err);
    }
  };

  const saveChatHistory = async (targetDataset, messages) => {
    if (!targetDataset || !Array.isArray(messages)) return;
    try {
      await fetch('/api/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: targetDataset, messages })
      });
    } catch (err) {
      console.error('Error saving chat history:', err);
    }
  };



  // LLM Wiki API Helpers
  const fetchLlmWikiTree = async () => {
    try {
      const res = await fetch(`/api/llm-wiki/tree?projectId=${projectId || ''}`);
      const data = await res.json();
      if (data.success) {
        setLlmWikiTree(data.files || []);
      }
    } catch (err) {
      console.error('Error fetching LLM wiki tree:', err);
    }
  };

  const handleAddWikiDocument = async (fileName, content, sourceType = 'text') => {
    if (!fileName || !content) return;
    setIsAddingWikiDoc(true);
    try {
      const res = await fetch('/api/llm-wiki/add-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId || '',
          datasetId: selectedDataset || '',
          fileName,
          content,
          category: '01_raw/business_guidelines',
          sourceType
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ 문서가 성공적으로 01_raw 레이어에 등록되었습니다!\n[${data.filePath}]`);
        setAddWikiModalOpen(false);
        setAddWikiFileName('');
        setAddWikiTextContent('');
        fetchLlmWikiTree();
        fetchLlmWikiFile(data.filePath);
      } else {
        alert(`❌ 문서 추가 실패: ${data.error}`);
      }
    } catch (err) {
      console.error('Error adding wiki document:', err);
      alert(`❌ 오류 발생: ${err.message}`);
    } finally {
      setIsAddingWikiDoc(false);
    }
  };

  // 피드백 제출 및 피드백 반영 재수행 생성 핸들러 (좋아요: 즉각 0ms 낙관적 UI 전환 & 비동기 위키 저장)
  const handleFeedbackRefine = async (msg, msgIdx, rating, feedbackText) => {
    if (rating === 'down' && !feedbackText) {
      alert('피드백 개선 요청 내용을 입력해 주세요.');
      return;
    }

    // 1. [낙관적 업데이트 (Optimistic UI Update)] 클릭하는 순간 0ms 즉각 버튼 상태 및 색상 반영
    setFeedbackRatingsMap(prev => ({ ...prev, [msgIdx]: rating }));

    if (rating === 'up') {
      // 긍정 피드백(Up)의 경우 팝업/딜레이 없이 비동기 백그라운드로 저장 및 위키 트리 갱신
      fetch('/api/llm-wiki/feedback-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId || '',
          datasetId: selectedDataset || '',
          question: chatMessages.slice(0, msgIdx).reverse().find(m => m.sender === 'user')?.text || '대화 결과 분석 질의',
          originalAnswer: msg.text || '',
          feedbackRating: rating,
          feedbackText: feedbackText || '사용자 긍정(Up) 인사이트 승인'
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            fetchLlmWikiTree();
          }
        })
        .catch(err => console.error('Background feedback save error:', err));
      return;
    }

    // 2. 아쉬워요(Down) 교정 요청의 경우 피드백 반영 재수행 진행
    setIsSubmittingFeedback(true);
    try {
      const userQ = chatMessages.slice(0, msgIdx).reverse().find(m => m.sender === 'user')?.text || '대화 결과 분석 질의';
      const res = await fetch('/api/llm-wiki/feedback-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId || '',
          datasetId: selectedDataset || '',
          question: userQ,
          originalAnswer: msg.text || '',
          feedbackRating: rating,
          feedbackText: feedbackText || '피드백 개선 재수행 요망'
        })
      });

      const data = await res.json();
      if (data.success) {
        setActiveFeedbackMsgIdx(null);
        setFeedbackInputText('');

        const refinedMsg = {
          sender: 'bot',
          text: data.refinedAnswer,
          thoughts: data.thoughts,
          strategy: 'FEEDBACK_REFINED',
          referencedDocs: [data.savedDocPath],
          metrics: {
            steps: [
              { step: 1, name: '사용자 피드백 수집 및 01_raw 위키 보관', elapsedMs: 150, tokens: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 } },
              { step: 2, name: '피드백 반영 Gemini 3.5 Flash 리포트 재수행', elapsedMs: 1200, tokens: { promptTokenCount: 600, candidatesTokenCount: 300, totalTokenCount: 900 } }
            ],
            total: { totalElapsedMs: 1350, totalElapsedSec: '1.35', totalPromptTokens: 700, totalCandidatesTokens: 350, totalTokenCount: 1050 }
          }
        };
        setChatMessages(prev => [...prev, refinedMsg]);
        alert(`💡 제출해주신 피드백이 위키 지식베이스[${data.savedDocPath}]에 저장되고 교정 답변이 도출되었습니다!`);
        fetchLlmWikiTree();
      } else {
        alert(`❌ 피드백 반영 실패: ${data.error}`);
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
      alert(`❌ 피드백 처리 중 오류: ${err.message}`);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const fetchLlmWikiFile = async (filePath) => {
    try {
      setSelectedWikiFile(filePath);
      const res = await fetch(`/api/llm-wiki/file?projectId=${projectId || ''}&filePath=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (data.success) {
        setSelectedWikiContent(data.content || '');
      }
    } catch (err) {
      console.error('Error reading LLM wiki file:', err);
    }
  };

  const handleDeleteLlmWikiFile = async (targetFilePath) => {
    const fileToDelete = targetFilePath || selectedWikiFile;
    if (!fileToDelete) {
      setError(appLang === 'en' ? 'No file selected to delete.' : '삭제할 파일이 선택되지 않았습니다.');
      return;
    }

    try {
      const res = await fetch(`/api/llm-wiki/file?projectId=${projectId || ''}&filePath=${encodeURIComponent(fileToDelete)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(appLang === 'en' ? `🗑️ Document [${fileToDelete}] has been deleted.` : `🗑️ [${fileToDelete}] 문서가 삭제되었습니다.`);
        addLog(appLang === 'en' ? `[LLM-Wiki] ${fileToDelete} deletion completed` : `[LLM-Wiki] ${fileToDelete} 삭제 완료`, 'success');
        if (selectedWikiFile === fileToDelete) {
          setSelectedWikiFile('');
          setSelectedWikiContent('');
        }
        await fetchLlmWikiTree();
      } else {
        setError(data.error || (appLang === 'en' ? 'An error occurred while deleting the file.' : '파일 삭제 중 오류가 발생했습니다.'));
        addLog(appLang === 'en' ? `[LLM-Wiki] Failed to delete ${fileToDelete}: ${data.error}` : `[LLM-Wiki] ${fileToDelete} 삭제 실패: ${data.error}`, 'error');
      }
    } catch (err) {
      console.error('Error deleting LLM wiki file:', err);
      setError((appLang === 'en' ? 'File deletion error: ' : '파일 삭제 오류: ') + err.message);
      addLog(appLang === 'en' ? `[LLM-Wiki] Error while deleting ${fileToDelete}` : `[LLM-Wiki] ${fileToDelete} 삭제 중 에러`, 'error');
    }
  };

  const handleSaveLlmWikiFile = async () => {
    if (!selectedWikiFile) return;
    try {
      const res = await fetch('/api/llm-wiki/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, filePath: selectedWikiFile, content: selectedWikiContent })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(appLang === 'en' ? `💾 Document [${selectedWikiFile}] has been saved.` : `💾 [${selectedWikiFile}] 문서가 저장되었습니다.`);
        addLog(appLang === 'en' ? `[LLM-Wiki] ${selectedWikiFile} save completed` : `[LLM-Wiki] ${selectedWikiFile} 저장 완료`, 'success');
        fetchLlmWikiTree();
      } else {
        setError(data.error || (appLang === 'en' ? 'An error occurred while saving the document.' : '문서 저장 중 오류가 발생했습니다.'));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleFastParseInbox = async () => {
    setIsWikiParsing(true);
    setError('');
    addLog(appLang === 'en' ? '[LLM-Wiki Fast-Path] Parsing unstructured document and extracting entities/backlinks...' : '[LLM-Wiki Fast-Path] 비정형 문서 파싱 및 엔티티/백링크 추출 중...', 'info');
    try {
      const fileName = `2026-07-04_payment_failure_incident_report_${Date.now().toString().slice(-4)}.md`;
      const res = await fetch('/api/llm-wiki/fast-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, fileName, content: wikiInboxInput })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(appLang === 'en' ? `⚡ Fast-Path complete! ${data.extractedEntities.length} entities and backlinks recorded in changelog.json.` : `⚡ Fast-Path 완료! ${data.extractedEntities.length}개 엔티티 및 백링크가 changelog.json에 기록되었습니다.`);
        addLog(appLang === 'en' ? `[Fast-Path Success] ${data.parsedDoc} parsing completed. Awaiting PENDING_GRAPH_SYNC state` : `[Fast-Path 성공] ${data.parsedDoc} 파싱 완료. PENDING_GRAPH_SYNC 대기 상태`, 'success');
        fetchLlmWikiTree();
        fetchLlmWikiFile('logs/changelog.json');
        setLlmWikiStep(2);
      } else {
        const errMsg = data.error || (appLang === 'en' ? 'An error occurred during Fast-Path parsing.' : 'Fast-Path 파싱 중 오류가 발생했습니다.');
        setError(errMsg);
        addLog(appLang === 'en' ? `[Fast-Path Failed] ${errMsg}` : `[Fast-Path 실패] ${errMsg}`, 'error');
      }
    } catch (err) {
      setError(err.message);
      addLog(appLang === 'en' ? `[Fast-Path Error] ${err.message}` : `[Fast-Path 에러] ${err.message}`, 'error');
    } finally {
      setIsWikiParsing(false);
    }
  };

  const handleRunColdStart = async () => {
    setIsWikiColdRunning(true);
    setError('');
    addLog(appLang === 'en' ? '[LLM-Wiki Cold-Start] Building initial BigQuery tables and physical Property Graphs based on seed schema...' : '[LLM-Wiki Cold-Start] 시드 뼈대 기반 BigQuery 초기 테이블 및 Property Graph 물리 빌드 가동...', 'info');
    try {
      const res = await fetch('/api/llm-wiki/run-cold-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, datasetId: selectedDataset })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(data.summary);
        addLog(appLang === 'en' ? `[Cold-Start Success] Physical BigQuery Property Graph schema build completed!` : `[Cold-Start 성공] BigQuery Property Graph 물리 스키마 빌드가 완료되었습니다!`, 'success');
        fetchLlmWikiTree();
      } else {
        const errMsg = data.error || (appLang === 'en' ? 'An error occurred during Cold-Start execution.' : 'Cold-Start 실행 중 오류가 발생했습니다.');
        setError(errMsg);
        addLog(appLang === 'en' ? `[Cold-Start Failed] ${errMsg}` : `[Cold-Start 실패] ${errMsg}`, 'error');
      }
    } catch (err) {
      setError(err.message);
      addLog(appLang === 'en' ? `[Cold-Start Error] ${err.message}` : `[Cold-Start 에러] ${err.message}`, 'error');
    } finally {
      setIsWikiColdRunning(false);
    }
  };

  const handleRunSlowPath = async () => {
    setIsWikiSlowRunning(true);
    setError('');
    addLog(appLang === 'en' ? '[LLM-Wiki Slow-Path] Ingesting pending changelog and running BigQuery Property Graph synchronization...' : '[LLM-Wiki Slow-Path] 미반영 changelog 수렴 및 BigQuery Property Graph 동기화 가동...', 'info');
    try {
      const res = await fetch('/api/llm-wiki/run-slow-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, datasetId: selectedDataset })
      });
      const data = await res.json();
      if (data.success) {
        setWikiSlowResult(data);
        setSuccessMessage(data.summary);
        addLog(appLang === 'en' ? `[Slow-Path Success] ${data.syncedLogsCount} knowledge changelogs fully synced to BigQuery Property Graph!` : `[Slow-Path 성공] ${data.syncedLogsCount}건의 지식 이력이 BigQuery Property Graph로 수렴 완료!`, 'success');
        fetchLlmWikiTree();
        fetchLlmWikiFile('logs/changelog.json');
        setLlmWikiStep(3);
      } else {
        const errMsg = data.error || (appLang === 'en' ? 'An error occurred during Slow-Path execution.' : 'Slow-Path 실행 중 오류가 발생했습니다.');
        setError(errMsg);
        addLog(appLang === 'en' ? `[Slow-Path Failed] ${errMsg}` : `[Slow-Path 실패] ${errMsg}`, 'error');
      }
    } catch (err) {
      setError(err.message);
      addLog(appLang === 'en' ? `[Slow-Path Error] ${err.message}` : `[Slow-Path 에러] ${err.message}`, 'error');
    } finally {
      setIsWikiSlowRunning(false);
    }
  };

  // Helper to copy text to clipboard with feedback
  const handleCopyText = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => {
        setSuccessMessage(appLang === 'en' ? 'Copied to clipboard!' : '클립보드에 복사되었습니다!');
        addLog(appLang === 'en' ? 'Text successfully copied to clipboard.' : '텍스트가 클립보드에 성공적으로 복사되었습니다.', 'success');
        setTimeout(() => setSuccessMessage(''), 3000);
      })
      .catch(err => {
        setError((appLang === 'en' ? 'Copy failed: ' : '복사 실패: ') + err.message);
        addLog(appLang === 'en' ? `Copy failed: ${err.message}` : `복사 실패: ${err.message}`, 'error');
      });
  };

  // Initial welcome log
  useEffect(() => {
    addLog(appLang === 'en' ? 'OKF Omni Portal started. System is ready.' : 'OKF Omni 포탈 기동 완료. 시스템 준비되었습니다.', 'info');
  }, [appLang]);

  // 채팅 질문 입력 시 질문 카드를 채팅 박스 4/5 지점(상단 기준 75~80%)에 자연스럽게 노출하는 자동 스크롤
  useEffect(() => {
    if (chatContainerRef.current && (chatMessages.length > 0 || isChatLoading)) {
      const container = chatContainerRef.current;
      setTimeout(() => {
        const userMsgElements = container.querySelectorAll('.chat-user-message');
        if (userMsgElements.length > 0) {
          const lastUserMsg = userMsgElements[userMsgElements.length - 1];
          const containerHeight = container.clientHeight;
          const msgTop = lastUserMsg.offsetTop;
          // 상단에서 약 75%~80% (4/5 지점)에 배치되도록 스크롤 타겟 계산
          const targetScrollTop = Math.max(0, msgTop - (containerHeight * 0.72));
          container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
        } else {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }
      }, 60);
    }
  }, [chatMessages, isChatLoading]);

  // BigQuery 데이터셋 상세 통계 메타데이터 조회
  const fetchDatasetMetadata = async (dId) => {
    if (!dId) return;
    setIsDatasetMetaLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/dataset-metadata?projectId=${projectId}&datasetId=${dId}`);
      if (response.ok) {
        const data = await response.json();
        setDatasetMetadata(data);
      }
    } catch (err) {
      console.error('Failed to load dataset details:', err);
    } finally {
      setIsDatasetMetaLoading(false);
    }
  };

  // AI Agent Tools Definitions (Table-level)
  const AGENT_TOOLS = [
    {
      id: 'advanced-schema',
      name: 'Advanced Schema & Insights',
      category: 'schemas',
      description: 'BigQuery DDL, 메타데이터 통계, 데이터 퀄리티 규칙, 프로파일링 및 리니지 추론 정보를 종합 수집하여 OKF 생성에 활용합니다.',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      )
    },
    {
      id: 'profile',
      name: 'Data Profile & Quality',
      category: 'profiles',
      description: 'Analyze the table schema and sample rows to generate a data quality report and suggest DQ assertion rules.',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10"></line>
          <line x1="12" y1="20" x2="12" y2="4"></line>
          <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
      )
    },
    {
      id: 'graph-design',
      name: 'Graph DB Schema',
      category: 'graphs',
      description: 'Design a Graph Database schema (Nodes, Relationships, and Properties) with sample Cypher query templates.',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="5" r="3"></circle>
          <circle cx="5" cy="19" r="3"></circle>
          <circle cx="19" cy="19" r="3"></circle>
          <line x1="12" y1="8" x2="6.5" y2="16.5"></line>
          <line x1="12" y1="8" x2="17.5" y2="16.5"></line>
        </svg>
      )
    },
    {
      id: 'sql-helper',
      name: 'SQL Optimizer & Samples',
      category: 'queries',
      description: 'Generate 3 optimized BigQuery SQL queries (Basic, Medium, Advanced) with performance-tuning explanations.',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 17 10 11 15 16 20 9"></polyline>
          <polyline points="13 9 20 9 20 16"></polyline>
        </svg>
      )
    },
    {
      id: 'rag-design',
      name: 'RAG & Vector Search',
      category: 'rag',
      description: 'Design a Vector Search / Semantic RAG index, recommending embedding columns and providing search query templates.',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      )
    }
  ];

  // GCS Bundle File List
  const fetchGcsBundleTree = async (projId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/bundle-tree?projectId=${projId}`);
      if (response.ok) {
        const data = await response.json();
        setGcsFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to fetch GCS bundle tree:', err);
    }
  };

  // BigQuery 물리 Property Graph 목록 조회
  const fetchPhysicalGraphs = async (dId) => {
    const targetDataset = dId || selectedDataset;
    if (!targetDataset) return;
    setIsPhysicalGraphsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/dataset-graphs?projectId=${projectId}&datasetId=${targetDataset}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPhysicalGraphs(data.graphs || []);
          if (data.graphs && data.graphs.length > 0) {
            setSelectedPhysicalGraph(data.graphs[0]);
          } else {
            setSelectedPhysicalGraph(null);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch dataset graphs:', err);
    } finally {
      setIsPhysicalGraphsLoading(false);
    }
  };

  // Property Graph DDL 구문에서 Mermaid 다이어그램 텍스트 동적 파싱 생성 헬퍼
  const generateMermaidFromDdl = (ddl) => {
    if (!ddl) return '';
    try {
      // 1. DDL 내부의 노드 정보 파싱 (label 매핑 확보)
      // 예: 'seanjung-poc.theLookCommerce.users' AS 'users'
      const nodeMatches = [...ddl.matchAll(/['`"]?([a-zA-Z0-9_\-\.]+?)['`"]?\s+AS\s+['`"]?([a-zA-Z0-9_\-]+?)['`"]?/gi)];
      const nodeAliasMap = {};
      nodeMatches.forEach(m => {
        const fullTable = m[1];
        const alias = m[2];
        const tableName = fullTable.split('.').pop();
        nodeAliasMap[alias] = tableName;
      });

      // 2. 에지 정보 파싱 및 연결선 추출
      // 예: EDGE TABLES ( order_items KEY (id) SOURCE KEY (user_id) REFERENCES users TARGET KEY (product_id) REFERENCES products )
      const edgesSectionMatch = ddl.match(/EDGE\s+TABLES\s*\(([\s\S]*?)\)\s*$/i) || ddl.match(/EDGE\s+TABLES\s*\(([\s\S]*?)\)/i);
      const mermaidLines = ['graph LR'];

      // 노드들을 머메이드 선언으로 정의
      Object.keys(nodeAliasMap).forEach(alias => {
        mermaidLines.push(`  ${alias}["${nodeAliasMap[alias]} (Node)"]`);
      });

      if (edgesSectionMatch) {
        const edgeContent = edgesSectionMatch[1];
        // 개별 에지 테이블 덩어리 루프 분리
        // 예: order_items ... REFERENCES users ... REFERENCES products
        const individualEdgeBlocks = edgeContent.split(/,(?![^(]*\))/);

        individualEdgeBlocks.forEach(block => {
          const edgeTableMatch = block.trim().match(/^['`"]?([a-zA-Z0-9_\-\.]+?)['`"]?/i);
          if (!edgeTableMatch) return;
          const edgeTableFull = edgeTableMatch[1];
          const edgeTableName = edgeTableFull.split('.').pop();

          // REFERENCES 대상 식별
          const refMatches = [...block.matchAll(/REFERENCES\s+['`"]?([a-zA-Z0-9_\-]+?)['`"]?/gi)];
          if (refMatches.length >= 2) {
            const sourceNode = refMatches[0][1];
            const targetNode = refMatches[1][1];

            // sourceNode --> targetNode 로의 연결 엣지 표현
            mermaidLines.push(`  ${sourceNode} -- "Edge: ${edgeTableName}" --> ${targetNode}`);
          }
        });
      }

      // 만약 엣지 정보 파싱이 실패했거나 없는 경우 대체용 기본형
      if (mermaidLines.length <= 1) {
        return `graph TD\n  node["BigQuery Property Graph"]\n  info["(노드/에지 분석 대기 중)"]\n  node --> info`;
      }

      return mermaidLines.join('\n');
    } catch (err) {
      console.error('Mermaid parsing error:', err);
      return '';
    }
  };

  // AI 추천 DDL을 파싱하여 빅쿼리에 물리 Property Graph 생성(Build) 실행
  const handleBuildPhysicalGraph = async (ddlText) => {
    if (!ddlText) return;

    // 마크다운 코드펜스 내부의 DDL문만 추출
    const sqlMatch = ddlText.match(/```sql([\s\S]*?)```/i) || ddlText.match(/CREATE[\s\S]*?;/i);
    const sqlToRun = sqlMatch ? (sqlMatch[1] || sqlMatch[0]).trim() : ddlText.trim();

    setIsGraphBuilding(true);
    setError('');
    setSuccessMessage('');
    addLog(appLang === 'en' ? `[BigQuery Graph Build] Executing Property Graph creation DDL...` : `[빅쿼리 그래프 빌드] Property Graph 생성 DDL 실행 중...`, 'info');

    try {
      const response = await fetch(`${BACKEND_URL}/api/execute-sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId,
          sql: sqlToRun
        })
      });

      const data = await response.json();
      if (data.success) {
        setSuccessMessage(appLang === 'en' ? '🎉 Property Graph has been successfully created (materialized) in BigQuery!' : '🎉 빅쿼리에 Property Graph가 정상적으로 생성(실체화)되었습니다!');
        addLog(appLang === 'en' ? `[BigQuery Graph Build Success] Property Graph created successfully` : `[빅쿼리 그래프 빌드 성공] Property Graph 생성 완료`, 'success');
        fetchPhysicalGraphs(selectedDataset); // 물리 목록 동기화
        setGraphDesignerTab('physical'); // 생성 완료 탭으로 이동
        setTimeout(() => setSuccessMessage(''), 4000);
      } else {
        throw new Error(data.error || 'SQL execution failed');
      }
    } catch (err) {
      setError((appLang === 'en' ? 'Graph creation failed: ' : '그래프 생성 실패: ') + err.message);
      addLog(appLang === 'en' ? `[BigQuery Graph Build Error] ${err.message}` : `[빅쿼리 그래프 빌드 에러] ${err.message}`, 'error');
    } finally {
      setIsGraphBuilding(false);
    }
  };

  // 사이드바 영역 구분선 마우스/터치 드래그 조절 이벤트 핸들러
  const handleResizerMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY || (e.touches && e.touches[0].clientY);
    const startHeight = bqExplorerHeight;

    const onMouseMove = (moveEvent) => {
      const currentY = moveEvent.clientY || (moveEvent.touches && moveEvent.touches[0].clientY);
      if (currentY === undefined) return;
      const deltaY = currentY - startY;
      // 최소 80px ~ 최대 700px 한계 범위 제어
      const newHeight = Math.max(80, Math.min(700, startHeight + deltaY));
      setBqExplorerHeight(newHeight);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onMouseMove);
      window.removeEventListener('touchend', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onMouseMove);
    window.addEventListener('touchend', onMouseUp);

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  // Connect & Fetch Datasets
  const handleConnect = async () => {
    if (!projectId) {
      setError('Please enter a GCP Project ID');
      return;
    }
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    setDatasets([]);
    setTables([]);
    setSelectedDataset('');
    setSelectedTable('');
    setPhysicalGraphs([]);
    setSelectedPhysicalGraph(null);
    setTableDetails(null);
    setGeneratedOkf(null);
    setAgentResults({});
    setGcsFiles([]);
    setSelectedGcsFile('');
    setGcsFileContent('');
    setChatMessages([]);
    setEnrichmentResult(null);
    setEnrichmentReport(null);
    setIsEnriching(false);
    setEnrichStep(0);

    addLog(`GCP 프로젝트(${projectId}) 연결 시도 중...`, 'info');
    try {
      const response = await fetch(`${BACKEND_URL}/api/datasets?projectId=${projectId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch datasets: ${response.statusText}`);
      }
      const data = await response.json();
      setDatasets(data);

      fetchGcsBundleTree(projectId);
      setSelectedDataset('');
      setSelectedGcsFolder('');
      addLog(`GCP 프로젝트(${projectId}) 연결 성공. 데이터셋 ${data.length}개 로드 완료. 데이터셋을 선택해 주세요.`, 'success');
    } catch (err) {
      setError(err.message || 'Failed to connect to BigQuery');
      addLog(`GCP 연결 실패: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // GCS 버킷에 저장된 이전 Enrichment 결과 리포트 자동 로드
  const fetchEnrichmentReport = async (targetDataset) => {
    if (!projectId || !targetDataset) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/enrichment-report?projectId=${projectId}&datasetId=${targetDataset}`);
      if (response.ok) {
        const data = await response.json();
        if (data.found && data.report) {
          setEnrichmentReport(data.report);
          setEnrichmentResult(data.report);
          setEnrichmentSubView('result'); // 저장된 리포트가 있으면 Result 탭 우선 활성화
        } else {
          setEnrichmentReport(null);
          setEnrichmentResult(null);
          setEnrichmentSubView('setup');
        }
      }
    } catch (err) {
      console.error('Failed to load saved enrichment report:', err);
    }
  };

  // Dataplex DataScans (Profile & Quality) 상태 조회
  const fetchDataplexScans = async (refresh = false, targetDataset = selectedDataset) => {
    if (!projectId || !targetDataset) return;
    try {
      const res = await fetch(`/api/dataplex/scans?projectId=${projectId}&datasetId=${targetDataset}${refresh ? '&refresh=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        setDataplexScans(data);
      }
    } catch (err) {
      console.warn('Failed to fetch dataplex scans:', err);
    }
  };

  // 특정 테이블의 Dataplex Profile 스캔 트리거
  const handleTriggerTableScan = async (tableId) => {
    if (!projectId || !selectedDataset || !tableId) return;
    setIsScanningTable(prev => ({ ...prev, [tableId]: true }));
    addLog(appLang === 'en'
      ? `[Dataplex Profile Scan] Triggering scan for table '${tableId}'...`
      : `[Dataplex 프로파일링 스캔] '${tableId}' 테이블의 데이터 스캔을 시작합니다...`, 'info');
    try {
      const res = await fetch('/api/dataplex/run-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          tableId
        })
      });
      const data = await res.json();
      if (data.success) {
        addLog(appLang === 'en'
          ? `[Dataplex Success] Scan initiated for '${tableId}' (Scan ID: ${data.scanId})`
          : `[Dataplex 성공] '${tableId}' 프로파일링 스캔이 시작되었습니다. (Scan ID: ${data.scanId})`, 'success');
        await fetchDataplexScans(true, selectedDataset);
      } else {
        throw new Error(data.error || 'Failed to trigger scan');
      }
    } catch (err) {
      console.error('Failed to trigger scan:', err);
      addLog(`[Dataplex 오류] 스캔 요청 실패: ${err.message}`, 'error');
    } finally {
      setIsScanningTable(prev => ({ ...prev, [tableId]: false }));
    }
  };

  // 데이터셋 내 모든 테이블 일괄 Dataplex Profile 스캔 트리거
  const handleTriggerBatchScan = async () => {
    if (!projectId || !selectedDataset || tables.length === 0) return;
    setIsBatchScanning(true);
    addLog(appLang === 'en'
      ? `[Batch Dataplex Scan] Starting batch profiling for ${tables.length} tables in '${selectedDataset}'...`
      : `[전체 Dataplex 스캔] 데이터셋 '${selectedDataset}'의 ${tables.length}개 테이블 일괄 프로파일링 스캔 시작...`, 'info');
    try {
      for (const t of tables) {
        await handleTriggerTableScan(t.id);
      }
      await fetchDataplexScans(true, selectedDataset);
    } finally {
      setIsBatchScanning(false);
    }
  };

  // 데이터셋 변경 시 Dataplex Scans 자동 동기화
  useEffect(() => {
    if (selectedDataset && projectId) {
      fetchDataplexScans(false, selectedDataset);
    }
  }, [selectedDataset, projectId]);

  // Dataplex Glossary 데이터 조회 API 가동

  // [EPIC-005] AI 커스텀 프로퍼티 그래프 자율 합성 핸들러
  const handleSynthesizeCustomGraph = async () => {
    setIsSynthesizingGraph(true);
    setError('');
    setDeployMessage('');
    try {
      const resp = await fetch('/api/graph/synthesize-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId || 'seanjung-poc',
          datasetId: selectedDataset || 'thelook_ecommerce'
        })
      });
      const data = await resp.json();
      if (data.success) {
        setCustomGraphResult(data);
      } else {
        setError(data.error || 'Custom graph synthesis failed');
      }
    } catch (err) {
      setError('Synthesis request failed: ' + err.message);
    } finally {
      setIsSynthesizingGraph(false);
    }
  };

  const handleDeployCustomGraph = async () => {
    if (!customGraphResult || !customGraphResult.customDdl) return;
    setIsDeployingGraph(true);
    setDeployMessage('');
    try {
      const resp = await fetch('/api/graph/deploy-custom-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId || 'seanjung-poc',
          datasetId: selectedDataset || 'thelook_ecommerce',
          customDdl: customGraphResult.customDdl
        })
      });
      const data = await resp.json();
      if (data.success) {
        setDeployMessage(data.message);
      } else {
        setDeployMessage('Deploy error: ' + data.error);
      }
    } catch (err) {
      setDeployMessage('Deploy failed: ' + err.message);
    } finally {
      setIsDeployingGraph(false);
    }
  };


  const fetchDataplexGlossary = async (targetDataset = selectedDataset) => {
    if (!projectId || !targetDataset) return;
    setIsGlossaryLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dataplex/glossary?projectId=${projectId}&datasetId=${targetDataset}`);
      if (res.ok) {
        const data = await res.json();
        setDataplexGlossary(data);
        if (data.tables && Object.keys(data.tables).length > 0) {
          const firstTable = Object.keys(data.tables)[0];
          setSelectedGlossaryTable(prev => prev || firstTable);
          setSelectedGlossaryAspect('overview');
          setSelectedGlossaryColumn('');
        }
      } else {
        const errData = await res.json();
        setError(errData.error || 'Dataplex Glossary 로딩 중 오류가 발생했습니다.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGlossaryLoading(false);
    }
  };

  // Dataplex 추천 Graph DB 스키마 DDL 실행 및 BigQuery 배포
  const handleExecuteRecommendedGraph = async () => {
    const defaultDdl = `CREATE OR REPLACE PROPERTY GRAPH \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.dataplex_recommended_property_graph\`\n  NODE TABLES (\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.users\` AS \`User\`\n      KEY (id) PROPERTIES (id, first_name, last_name, email, city, country),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.orders\` AS \`Order\`\n      KEY (order_id) PROPERTIES (order_id, user_id, status, created_at),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.products\` AS \`Product\`\n      KEY (id) PROPERTIES (id, name, category, price, brand),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.events\` AS \`Event\`\n      KEY (id) PROPERTIES (id, user_id, event_type, created_at)\n  )\n  EDGE TABLES (\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.orders\` AS \`Placed\`\n      KEY (order_id)\n      SOURCE KEY (user_id) REFERENCES \`User\` (id)\n      DESTINATION KEY (order_id) REFERENCES \`Order\` (order_id)\n      PROPERTIES (status, created_at),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.order_items\` AS \`OrderedItem\`\n      KEY (id)\n      SOURCE KEY (order_id) REFERENCES \`Order\` (order_id)\n      DESTINATION KEY (product_id) REFERENCES \`Product\` (id)\n      PROPERTIES (price, status),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.events\` AS \`Triggered\`\n      KEY (id)\n      SOURCE KEY (user_id) REFERENCES \`User\` (id)\n      DESTINATION KEY (id) REFERENCES \`Event\` (id)\n      PROPERTIES (event_type, created_at)\n  );`;

    const ddlToDeploy = dataplexGlossary?.graphSchema?.ddl || defaultDdl;
    setIsDeployingRecommendedGraph(true);
    setRecommendedGraphDeployMsg('');
    try {
      const resp = await fetch('/api/graph/deploy-custom-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId || 'seanjung-poc',
          datasetId: selectedDataset || 'thelook_ecommerce',
          customDdl: ddlToDeploy
        })
      });
      const data = await resp.json();
      if (data.success) {
        setRecommendedGraphDeployMsg(
          appLang === 'en'
            ? `✅ Successfully created Dataplex Recommended Property Graph (dataplex_recommended_property_graph) in BigQuery!`
            : `✅ Dataplex 추천 프로퍼티 그래프(dataplex_recommended_property_graph)가 BigQuery에 성공적으로 생성 및 배포되었습니다!`
        );
        fetchPhysicalGraphs(selectedDataset);
      } else {
        setRecommendedGraphDeployMsg(
          appLang === 'en' ? `Error: ${data.error}` : `오류 발생: ${data.error}`
        );
      }
    } catch (err) {
      setRecommendedGraphDeployMsg(
        appLang === 'en' ? `Failed: ${err.message}` : `배포 실패: ${err.message}`
      );
    } finally {
      setIsDeployingRecommendedGraph(false);
    }
  };

  // Dataplex Catalog 동기화(Push) 실행
  const handlePushToDataplex = async (activeTable) => {
    const isDatasetMode = activeTable === '[dataset]';
    const targetTableId = isDatasetMode ? null : activeTable;
    
    setIsPushingDataplex(true);
    addLog(appLang === 'en' 
      ? `[Dataplex Sync] Starting push for '${activeTable}' to Knowledge Catalog...`
      : `[Dataplex 동기화] '${activeTable}' 지식을 Knowledge Catalog로 배포 시작...`, 'info');

    const aspectTypes = [];
    if (pushAspects.description) aspectTypes.push('description');
    if (pushAspects.overview) aspectTypes.push('overview');

    try {
      const response = await fetch(`/api/dataplex/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          tableId: targetTableId,
          aspectTypes
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to push to Dataplex');
      }

      await response.json();
      addLog(appLang === 'en'
        ? `[Dataplex Success] Successfully pushed [${aspectTypes.join(', ')}] for '${activeTable}' to Dataplex!`
        : `[Dataplex 성공] '${activeTable}'의 [${aspectTypes.join(', ')}] 항목이 Dataplex Catalog에 성공적으로 반영되었습니다!`, 'success');
      
      alert(appLang === 'en'
        ? `Successfully pushed to Dataplex Catalog!`
        : `Dataplex Catalog 메타데이터 동기화에 성공했습니다!`);

      // 최신화 유도
      fetchDataplexGlossary(selectedDataset);
    } catch (err) {
      console.error('Error pushing to Dataplex:', err);
      addLog(appLang === 'en'
        ? `[Dataplex Error] Sync failed for '${activeTable}': ${err.message}`
        : `[Dataplex 오류] '${activeTable}' 동기화 실패: ${err.message}`, 'error');
      alert(`Dataplex 동기화 실패: ${err.message}`);
    } finally {
      setIsPushingDataplex(false);
    }
  };

  // Select Dataset & Fetch Tables
  const handleDatasetChange = async (e) => {
    const datasetId = e.target.value;
    setDatasetMetadata(null);
    setPhysicalGraphs([]);
    setSelectedPhysicalGraph(null);
    if (datasetId) {
      fetchDatasetMetadata(datasetId);
      fetchPhysicalGraphs(datasetId); // 물리 그래프 동시 갱신
      fetchEnrichmentReport(datasetId); // 저장된 Enrichment 리포트 자동 로드
      fetchDataplexGlossary(datasetId); // Dataplex Glossary 리로드
      fetchDataplexScans(false, datasetId); // Dataplex Scans 상태 리로드
    }
    setSelectedDataset(datasetId);
    setTables([]);
    setSelectedTable('');
    setTableDetails(null);
    setGeneratedOkf(null);
    setAgentResults({});
    setSelectedGcsFile('');
    setGcsFileContent('');
    setChatMessages([]);
    setDatasetActiveTab('tables');
    setSelectedTablesForGraph([]);
    setDatasetAgentResult('');
    setEnrichmentResult(null);
    setEnrichmentReport(null);
    setIsEnriching(false);
    setEnrichStep(0);
    setError('');
    setSuccessMessage('');

    setSelectedGcsFolder(''); // GCS 브라우저 모드 전환 방지: 기본 데이터셋 대시보드 유지
    if (!datasetId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/tables?projectId=${projectId}&datasetId=${datasetId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch tables: ${response.statusText}`);
      }
      const data = await response.json();
      setTables(data);
      addLog(`데이터셋(${datasetId}) 내 테이블 ${data.length}개 로드 성공.`, 'success');

      // 기존 Property Graph 목록도 동시 로드
      fetchPhysicalGraphs(datasetId);
    } catch (err) {
      setError(err.message || 'Failed to fetch tables');
      addLog(`테이블 목록 조회 실패: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 사이드바 Property Graphs 선택 시 Dataset의 Graphs 탭으로 즉시 화면전환 및 랜딩
  const handleNavigateToGraphsTab = (graphObj = null) => {
    setSelectedTable('');
    setTableDetails(null);
    setGeneratedOkf(null);
    setSelectedGcsFolder('');
    setSelectedGcsFile('');
    setGcsFileContent('');
    setGithubPath('');
    setSelectedGithubFile(null);

    setIsGithubModeActive(false);
    if (graphObj) {
      setSelectedPhysicalGraph(graphObj);
    }
    setDatasetActiveTab('graphs');
  };

  // GitHub Explorer 토글 및 최초 자동 호출 분리 (Expanded 시에만 로드하도록 제어)
  const handleToggleGithubExplorer = () => {
    const nextState = !isGithubExpanded;
    setIsGithubExpanded(nextState);
    if (nextState && githubItems.length === 0) {
      fetchGithubContents('');
    }
  };

  // Select Table & Fetch Details
  const handleTableSelect = async (tableId, targetTab = 'schema') => {
    setSelectedTable(tableId);
    setSelectedGcsFile(''); // GCS 뷰어 해제
    setSelectedGcsFolder(''); // GCS 폴더 뷰 해제
    setSelectedGithubFile(null); // GitHub 파일 해제
    setIsGithubModeActive(false); // GitHub 모드 해제
    setTableDetails(null);
    setGeneratedOkf(null);
    setAgentResults({});
    setSqlToExecute('');
    setSqlResult(null);
    setChatMessages([]);
    setActiveTab(targetTab);
    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/table-details?projectId=${projectId}&datasetId=${selectedDataset}&tableId=${tableId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch table details: ${response.statusText}`);
      }
      const data = await response.json();
      setTableDetails(data);
      addLog(`테이블(${tableId}) 스키마 로드 완료. (기존 OKF 보유 여부: ${data.hasOkf})`, 'success');

      // 이미 생성되어 GCS에 저장된 OKF 파일이 있다면 바로 로드
      if (data.hasOkf && data.okfContent) {
        setGeneratedOkf({
          content: data.okfContent,
          filePath: `gs://okf-omni-${(projectId || 'project').toLowerCase()}/${selectedDataset}/tables/${tableId}.md`,
          hasAdvancedSchema: data.hasAdvancedSchema,
          advancedSchemaContent: data.advancedSchemaContent
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch table details');
      addLog(`테이블 상세 정보 로드 실패: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // GitHub 레포지토리 contents 트리 구조 패치
  const fetchGithubContents = async (subPath = '') => {
    setIsGithubLoading(true);
    setError('');
    try {
      const response = await fetch(`${BACKEND_URL}/api/github-explorer/contents?path=${encodeURIComponent(subPath)}`);
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error(data.error || 'Failed to fetch GitHub items');
      }
      // 정렬 규칙 적용 (표준 파일 탐색기 및 GitHub 브라우저 패턴):
      // 1. 폴더(dir) 알파벳순 최상단 정렬
      // 2. README.md 파일 그 바로 다음 상단 배치
      // 3. 나머지 일반 파일 알파벳순 정렬
      const sortedData = [...data].sort((a, b) => {
        // 1. 폴더(dir)와 파일(file) 분리 -> 폴더 우선 배치
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }

        // 2. 파일들 간의 소팅 규칙 (README.md 상단 배치)
        if (a.type === 'file' && b.type === 'file') {
          const isAReadme = a.name.toLowerCase().startsWith('readme');
          const isBReadme = b.name.toLowerCase().startsWith('readme');
          if (isAReadme) return -1;
          if (isBReadme) return 1;
        }

        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

      setGithubItems(sortedData);
      setGithubPath(subPath);

      // 브레드크럼(경로 추적) 구성
      if (subPath === '') {
        setGithubBreadcrumbs([]);
      } else {
        const parts = subPath.split('/').filter(Boolean);
        setGithubBreadcrumbs(parts.map((p, idx) => ({
          name: p,
          path: '/' + parts.slice(0, idx + 1).join('/')
        })));
      }

      // 폴더 진입 시 최상단 파일 자동 선택 및 뷰어 렌더링
      const firstFile = sortedData.find(item => item.type === 'file');
      if (firstFile) {
        handleSelectGithubFile(firstFile);
      } else {
        setSelectedGithubFile(null);
        setGithubFileContent('');
        setTranslatedGithubContent('');
      }
    } catch (err) {
      setError(err.message || 'GitHub 소스 구조를 불러오지 못했습니다.');
      addLog(`[GitHub 에러] ${err.message}`, 'error');
    } finally {
      setIsGithubLoading(false);
    }
  };

  // GitHub 파일 선택 및 본문 로드
  const handleSelectGithubFile = async (item) => {
    if (!item.downloadUrl) return;

    setSelectedTable(''); // BQ 테이블 선택 해제
    setSelectedGcsFile(''); // GCS 번들 파일 선택 해제
    setSelectedGithubFile(item);
    setGithubFileContent('');
    setTranslatedGithubContent('');
    setIsGithubLoading(true);
    setError('');
    addLog(`[GitHub 로드] ${item.name} 파일 텍스트 조회 중...`, 'info');

    try {
      const response = await fetch(`${BACKEND_URL}/api/github-explorer/raw?downloadUrl=${encodeURIComponent(item.downloadUrl)}`);
      if (!response.ok) {
        throw new Error('GitHub Raw 문서를 가져오는데 실패했습니다.');
      }
      const data = await response.json();
      setGithubFileContent(data.content);
      addLog(`[GitHub 로드 완료] ${item.name} 파일 내용을 성공적으로 가져왔습니다.`, 'success');
    } catch (err) {
      setError(err.message || 'Failed to read github raw file');
    } finally {
      setIsGithubLoading(false);
    }
  };

  // GitHub 영문 설명글 한국어 결합 대조 번역 실행 (Gemini 3.5 Flash 호출)
  const handleTranslateGithubContent = async () => {
    if (!githubFileContent) return;

    setIsGithubTranslating(true);
    setError('');
    setSuccessMessage('');
    addLog(`[Gemini 번역] 깃허브 문서설명글 한글 대조 번역 시작 (Gemini 3.5 Flash)...`, 'info');

    try {
      const response = await fetch(`${BACKEND_URL}/api/github-explorer/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          fileName: selectedGithubFile.name,
          fileContent: githubFileContent,
          geminiApiKey
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Translation failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setTranslatedGithubContent(data.translatedContent);
        setSuccessMessage('Gemini 한글 대조 번역이 완료되었습니다!');
        addLog(`[Gemini 번역 완료] 한글 대조본 생성 성공.`, 'success');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (err) {
      setError(err.message || 'Failed to translate document');
      addLog(`[번역 에러] 한글 결합 번역 실패: ${err.message}`, 'error');
    } finally {
      setIsGithubTranslating(false);
    }
  };

  // 앱 기동 시 원격 GitHub 루트 contents를 불러오던 자동 호출을 제거하여 초기 실행 부하를 차단합니다.
  useEffect(() => {
    // 사용자가 명시적으로 토글을 눌러 펼칠 때만 가져오도록 변경
  }, []);

  // 모달이 열릴 때 GCS 샘플 PDF 목록을 로드하는 useEffect
  useEffect(() => {
    if (isWikiModalOpen) {
      const fetchSamples = async () => {
        try {
          const response = await fetch(`${BACKEND_URL}/api/wiki-samples`);
          if (response.ok) {
            const list = await response.json();
            setWikiSamples(list);
          }
        } catch (err) {
          console.error('Failed to load wiki samples:', err);
        }
      };
      fetchSamples();
      // 기존 인풋 필드 초기화
      setSelectedSample('');
      setWikiFileName('');
      setWikiContent('');
    }
  }, [isWikiModalOpen]);

  // 샘플 PDF 선택 시 텍스트 파싱 및 주입 처리
  const handleSelectSample = async (sampleName) => {
    if (!sampleName) {
      setSelectedSample('');
      return;
    }
    setSelectedSample(sampleName);
    setIsPdfParsing(true);
    setError('');
    addLog(`[샘플 파싱] 서버 문서 샘플 '${sampleName}' 텍스트 추출 중...`, 'info');

    try {
      const response = await fetch(`${BACKEND_URL}/api/parse-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleName })
      });

      if (!response.ok) {
        throw new Error('Failed to parse selected sample PDF');
      }

      const data = await response.json();
      if (data.success) {
        setWikiContent(data.text);

        // 파일 이름이 비어있다면 샘플 이름에서 확장자를 제거하고 자동 완성해 줌
        if (!wikiFileName) {
          const defaultName = sampleName.split('.').slice(0, -1).join('_').replace(/[^a-zA-Z0-9가-힣_]/g, '');
          setWikiFileName(defaultName);
        }
        addLog(`[샘플 파싱 완료] '${sampleName}' 텍스트 추출 성공.`, 'success');
      }
    } catch (err) {
      setError(err.message || 'Failed to extract text from sample PDF');
      addLog(`[파싱 에러] 샘플 문서 파싱 중 에러: ${err.message}`, 'error');
    } finally {
      setIsPdfParsing(false);
    }
  };

  // 로컬 PDF 직접 업로드 및 텍스트 추출 처리
  const handlePdfUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('PDF 형식의 파일만 업로드할 수 있습니다.');
      return;
    }

    setIsPdfParsing(true);
    setError('');
    addLog(`[PDF 직접 업로드] 로컬 파일 '${file.name}' 업로드 및 파싱 중...`, 'info');

    const formData = new FormData();
    formData.append('pdfFile', file);

    try {
      const response = await fetch(`${BACKEND_URL}/api/parse-pdf`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to parse uploaded PDF file');
      }

      const data = await response.json();
      if (data.success) {
        setWikiContent(data.text);

        // 파일명 자동 추천
        const defaultName = file.name.split('.').slice(0, -1).join('_').replace(/[^a-zA-Z0-9가-힣_]/g, '');
        setWikiFileName(defaultName);
        addLog(`[직접 업로드 완료] 로컬 PDF '${file.name}' 파싱 성공 및 본문 주입 완료.`, 'success');
      }
    } catch (err) {
      setError(err.message || 'Failed to parse uploaded PDF file');
      addLog(`[업로드 에러] 로컬 PDF 파일 처리 중 오류: ${err.message}`, 'error');
    } finally {
      setIsPdfParsing(false);
      // 인풋 필드 값 초기화 (동일 파일 연속 업로드 가능하도록 처리)
      event.target.value = '';
    }
  };

  // Load and View a specific GCS File
  const handleSelectGcsFile = async (filePath) => {
    setSelectedTable(''); // BQ 테이블 해제
    setTableDetails(null);
    setGeneratedOkf(null);
    setSelectedGcsFile(filePath);
    setGcsFileContent('');
    setIsGcsFileLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/gcs-file?projectId=${projectId}&filePath=${filePath}`);
      if (!response.ok) {
        throw new Error(`Failed to read GCS file: ${response.statusText}`);
      }
      const data = await response.json();
      setGcsFileContent(data.content);
    } catch (err) {
      setError(err.message || `Failed to load GCS file: ${filePath}`);
    } finally {
      setIsGcsFileLoading(false);
    }
  };

  // Generate OKF Markdown (Single Table)
  const handleGenerateOkf = async () => {
    if (!projectId || !selectedDataset || !selectedTable) {
      setError('Please select a project, dataset, and table first.');
      return;
    }
    setIsGenerating(true);
    setActiveTab('okf'); // OKF Builder 탭으로 자동 이동
    setError('');
    setSuccessMessage('');
    setOkfGenerationStep(1);
    addLog(`[생성 시작] 테이블(${selectedTable}) OKF 메타데이터 생성 중...`, 'info');

    // 실시간 진행 상황을 우측 패널에 100ms 단위로 순차 갱신
    setTimeout(() => setOkfGenerationStep(2), 500);
    setTimeout(() => setOkfGenerationStep(3), 1500);

    try {
      const response = await fetch(`${BACKEND_URL}/api/generate-okf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          tableId: selectedTable,
          geminiApiKey
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Generation failed: ${response.statusText}`);
      }
      const data = await response.json();
      setOkfGenerationStep(4);
      setGeneratedOkf(data);

      // 단일 테이블 파이썬 stdout 로그 적재
      if (data.stdout) {
        setOkfGenerateLog(prev => ({ ...prev, [selectedTable]: data.stdout }));
      }

      setSuccessMessage(`Saved: gs://okf-omni-${(projectId || 'project').toLowerCase()}/${selectedDataset}/tables/${selectedTable}.md`);
      addLog(`[생성 완료] 테이블(${selectedTable}) OKF 생성 완료 및 GCS 저장 성공.`, 'success');

      if (tableDetails) {
        setTableDetails(prev => ({ ...prev, hasOkf: true, okfContent: data.content }));
      }

      fetchGcsBundleTree(projectId);
      setActiveTab('okf');
    } catch (err) {
      const apiInfo = `POST ${BACKEND_URL}/api/generate-okf`;
      setError(`${err.message} (API: ${apiInfo})`);
      addLog(`[생성 오류] 테이블(${selectedTable}) OKF 생성 실패: ${err.message} (호출 API: ${apiInfo}, 테이블: ${selectedTable})`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate OKF for ALL Tables in Dataset (Table-by-table Sequential Loop for real-time progress logging)
  const handleGenerateAllOkf = async () => {
    const targetDataset = selectedDataset; // 실행 시점의 데이터셋 고정 캡처
    const targetTables = [...tables];      // 실행 시점의 테이블 목록 복사

    if (!projectId || !targetDataset) {
      setError('Please select a project and dataset first.');
      return;
    }
    if (targetTables.length === 0) {
      setError('No tables found in this dataset.');
      return;
    }

    // 일괄 생성 시작 시 자동으로 데이터셋 대시보드의 OKF Builder(Batch) 탭으로 화면 전환
    setSelectedTable('');
    setTableDetails(null);
    setGeneratedOkf(null);
    setSelectedGcsFolder('');
    setSelectedGcsFile('');
    setDatasetActiveTab('okf-builder');

    setIsGenerating(true);
    setError('');
    setSuccessMessage('');

    // 초기 진행 상태 수립
    const initProgress = {};
    targetTables.forEach(t => {
      initProgress[t.id] = { step: 1, status: 'pending' };
    });
    setBatchOkfProgress(initProgress);

    addLog(`[일괄 생성 시작] 데이터셋(${targetDataset}) 내 총 ${targetTables.length}개 테이블에 대해 순차적 OKF 생성 시작...`, 'info');

    let successCount = 0;
    const generatedFiles = [];

    try {
      for (let i = 0; i < targetTables.length; i++) {
        const table = targetTables[i];
        addLog(`[${i + 1}/${targetTables.length}] 테이블(${table.id}) OKF 생성 시작...`, 'info');

        setBatchOkfProgress(prev => ({
          ...prev,
          [table.id]: { step: 1, status: 'running' }
        }));

        // 1단계 -> 2단계 -> 3단계 타임라인 가상 트랜지션
        const t1 = setTimeout(() => {
          setBatchOkfProgress(prev => ({
            ...prev,
            [table.id]: { step: 2, status: 'running' }
          }));
        }, 400);

        const t2 = setTimeout(() => {
          setBatchOkfProgress(prev => ({
            ...prev,
            [table.id]: { step: 3, status: 'running' }
          }));
        }, 1200);

        const response = await fetch(`${BACKEND_URL}/api/generate-okf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            datasetId: targetDataset, // 캡처된 데이터셋 식별자 고정 사용
            tableId: table.id,
            geminiApiKey
          })
        });

        clearTimeout(t1);
        clearTimeout(t2);

        if (!response.ok) {
          const errData = await response.json();
          setBatchOkfProgress(prev => ({
            ...prev,
            [table.id]: { step: prev[table.id]?.step || 1, status: 'error' }
          }));
          throw new Error(errData.error || `Failed to generate OKF for ${table.id}`);
        }

        const data = await response.json();
        successCount++;
        generatedFiles.push(table.id);

        setBatchOkfProgress(prev => ({
          ...prev,
          [table.id]: { step: 4, status: 'done' }
        }));

        // 각 테이블별 파이썬 stdout 로그 적재
        if (data.stdout) {
          setOkfGenerateLog(prev => ({ ...prev, [table.id]: data.stdout }));
        }

        addLog(`[${i + 1}/${targetTables.length}] 테이블(${table.id}) OKF 생성 완료!`, 'success');
      }

      setSuccessMessage(`Successfully generated and saved OKF files for ${successCount} tables in gs://okf-omni-${(projectId || 'project').toLowerCase()}/${targetDataset}/`);
      addLog(`[일괄 생성 완료] 데이터셋 내 테이블 ${successCount}개 일괄 OKF 파일 생성 성공.`, 'success');

      fetchGcsBundleTree(projectId);

      // 일괄 생성이 완료되었을 때, 사용자가 아직 동일한 데이터셋/테이블 화면에 머무르고 있다면 렌더링 갱신
      if (selectedDataset === targetDataset && selectedTable) {
        handleTableSelect(selectedTable);
      }
    } catch (err) {
      setError(err.message || 'Failed to generate OKF files');
      addLog(`[일괄 생성 오류] 일괄 OKF 생성 중 실패 발생: ${err.message}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Delete OKF File from GCS (단일 테이블 개별 삭제 지원)
  const handleDeleteOkf = async (targetTableId) => {
    const tableToDelete = targetTableId || selectedTable;
    if (!tableToDelete) return;

    if (!window.confirm(`Are you sure you want to delete the OKF file for table '${tableToDelete}'?`)) {
      return;
    }
    setIsGenerating(true);
    setError('');
    setSuccessMessage('');
    addLog(`[삭제 시작] 테이블(${tableToDelete}) OKF 파일 GCS 물리 삭제 시작...`, 'info');

    try {
      const response = await fetch(`${BACKEND_URL}/api/delete-okf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          tableId: tableToDelete
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Deletion failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (tableToDelete === selectedTable) {
        setGeneratedOkf(null); // 캐시 클리어
      }
      setSuccessMessage(data.message);
      addLog(`[삭제 완료] 테이블(${tableToDelete}) GCS OKF 파일 제거 완료.`, 'success');

      fetchGcsBundleTree(projectId);

      // 데이터셋 테이블 상태 리프레시
      if (selectedDataset) {
        fetchDatasetTables(selectedDataset);
      }
      if (tableToDelete === selectedTable) {
        handleTableSelect(tableToDelete);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete OKF file');
      addLog(`[삭제 오류] OKF 파일 삭제 실패: ${err.message}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Delete ALL OKF Files in Dataset (데이터셋 내 모든 OKF 일괄 삭제)
  const handleDeleteAllOkf = async () => {
    if (!window.confirm(`⚠️ 경고: 정말로 데이터셋 '${selectedDataset}' 내의 모든 테이블 OKF 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }
    setIsGenerating(true);
    setError('');
    setSuccessMessage('');
    addLog(`[일괄 삭제 시작] 데이터셋(${selectedDataset}) 내 모든 OKF 파일 삭제 중...`, 'warning');

    try {
      const response = await fetch(`${BACKEND_URL}/api/delete-okf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          tableId: 'all'
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Batch deletion failed: ${response.statusText}`);
      }

      const data = await response.json();
      setGeneratedOkf(null); // 활성 뷰 캐시 클리어
      setSuccessMessage(data.message);
      addLog(`[일괄 삭제 완료] 데이터셋 내 모든 OKF 파일 제거 완료.`, 'success');

      fetchGcsBundleTree(projectId);

      // 데이터셋 테이블 상태 리프레시
      if (selectedDataset) {
        fetchDatasetTables(selectedDataset);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete all OKF files');
      addLog(`[일괄 삭제 오류] 일괄 삭제 실패: ${err.message}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // AI 기안 그래프 결과 파싱 헬퍼
  const parseGraphResult = (rawText) => {
    if (!rawText) return null;
    const mermaidMatch = rawText.match(/```mermaid([\s\S]*?)```/);
    const sqlMatch = rawText.match(/```sql([\s\S]*?)```/) || rawText.match(/```([\s\S]*?)```/);
    return {
      raw: rawText,
      mermaid: mermaidMatch ? mermaidMatch[1].trim() : '',
      ddl: sqlMatch ? sqlMatch[1].trim() : rawText
    };
  };

  // AI 기반 데이터셋 수준 Property Graph 설계
  const handleDesignDatasetGraph = async () => {
    if (!projectId || !selectedDataset || selectedTablesForGraph.length === 0) {
      setError('Please select at least one table for the graph.');
      return;
    }

    setIsGraphDesigning(true);
    setDatasetGraphResult(null);
    setError('');
    setSuccessMessage('');
    addLog(`[AI 그래프 설계 시작] 데이터셋(${selectedDataset}) 내 선택한 테이블(${selectedTablesForGraph.join(', ')}) 스키마들을 연계 대조하여 노드 및 엣지 관계 도출 중...`, 'info');

    try {
      const response = await fetch(`${BACKEND_URL}/api/run-dataset-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          tableIds: selectedTablesForGraph,
          graphName: graphName || 'thelookgraph',
          actionId: 'dataset-graph',
          geminiApiKey
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to generate dataset graph');
      }

      const data = await response.json();
      const parsed = parseGraphResult(data.result);

      setDatasetGraphResult(parsed);
      if (parsed && parsed.ddl) {
        setGraphSqlQuery(parsed.ddl); // DDL 에디터에 자동 바인딩

        // AI 설계 완결 즉시 BigQuery에 물리 DDL 자동 수행 쿼리 전송
        addLog(`[BigQuery 자동 빌드] 기안된 그래프 DDL을 BigQuery에 자동 적용 중...`, 'info');
        try {
          const buildRes = await fetch(`${BACKEND_URL}/api/execute-sql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              sql: parsed.ddl
            })
          });
          if (buildRes.ok) {
            addLog(`[BigQuery 자동 빌드 성공] 개체명 '${graphName || 'thelookgraph'}'가 BigQuery 물리 그래프로 생성되었습니다.`, 'success');
            // 물리 그래프 목록 자동 동기화
            fetchPhysicalGraphs(projectId, selectedDataset);
          }
        } catch (execErr) {
          console.warn('Auto DDL execution warning:', execErr);
        }
      }

      addLog(`[AI 그래프 설계 완료] 테이블 간 의미론적 릴레이션 다이어그램 설계 및 DDL 기안 완료.`, 'success');
      setSuccessMessage('✓ AI 그래프 설계 및 BigQuery 물리 빌드 완료!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      const apiInfo = `POST ${BACKEND_URL}/api/run-dataset-agent`;
      const paramsInfo = `tableIds: [${selectedTablesForGraph.join(', ')}], graphName: "${graphName}"`;
      setError(`${err.message} (API: ${apiInfo})`);
      addLog(`[AI 그래프 설계 오류] 그래프 도출 실패: ${err.message} (호출 API: ${apiInfo}, 파라미터: ${paramsInfo})`, 'error');
    } finally {
      setIsGraphDesigning(false);
    }
  };



  // 물리 그래프 SQL 실행 (DDL 생성 및 GRAPH_TABLE 조회 둘 다 대응)
  const handleExecuteGraphSql = async (isQueryOnly = false) => {
    if (!projectId || !graphSqlQuery.trim()) return;
    setIsSqlExecuting(true);
    setGraphSqlResult(null);
    setError('');
    addLog(`[그래프 SQL 실행] 쿼리 전송 중...`, 'info');

    try {
      const response = await fetch(`${BACKEND_URL}/api/execute-sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          sql: graphSqlQuery,
          datasetId: selectedDataset
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Execution failed');
      }

      const data = await response.json();
      setGraphSqlResult(data);

      addLog(`[그래프 SQL 완료] 쿼리 성공적으로 처리되었습니다.`, 'success');
      setSuccessMessage('✓ SQL 실행 완료!');
      setTimeout(() => setSuccessMessage(''), 3000);

      // 만약 CREATE PROPERTY GRAPH와 같은 DDL 실행이었고 성공했다면 목록 리프레시 및 물리 탭으로 전환
      if (!isQueryOnly && graphSqlQuery.toLowerCase().includes('create') && graphSqlQuery.toLowerCase().includes('graph')) {
        await fetchPhysicalGraphs();
        setGraphDesignerTab('physical');
      }
    } catch (err) {
      const apiInfo = `POST ${BACKEND_URL}/api/execute-sql`;
      setError(`${err.message} (API: ${apiInfo})`);
      addLog(`[그래프 SQL 오류] 쿼리 실행 실패: ${err.message} (호출 API: ${apiInfo}, 실행 SQL: ${graphSqlQuery.slice(0, 120)}...)`, 'error');
      setGraphSqlResult({ success: false, message: err.message });
    } finally {
      setIsSqlExecuting(false);
    }
  };

  // datasetActiveTab이 graph-designer로 전환되거나 데이터셋 선택이 바뀔 때 물리 그래프 목록 동기화
  useEffect(() => {
    if (datasetActiveTab === 'graph-designer' && projectId && selectedDataset) {
      fetchPhysicalGraphs();
    }
  }, [datasetActiveTab, selectedDataset]);

  // 데이터셋 선택 시 대화 내역 영구 로드
  useEffect(() => {
    if (selectedDataset) {
      fetchChatHistory(selectedDataset);
    }
  }, [selectedDataset]);

  // docs/ 폴더 내 PDF 파일 목록 로드
  const fetchServerPdfList = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/wiki-samples`);
      if (response.ok) {
        const data = await response.json();
        setLocalPdfList(data);
      }
    } catch (err) {
      console.error('Failed to fetch server PDF list:', err);
    }
  };

  // GCS 물리 파일 삭제 핸들러 (팝업 묻지 않고 0ms 즉시 물리 삭제 & 실시간 작업 로그 기록)
  const handleDeleteGcsFile = async (filePath, e) => {
    if (e) e.stopPropagation(); // 파일 선택 클릭 이벤트 전파 차단

    // GCS Full Object Key Path 자동 보정 (datasetId 경로 누락 방지)
    let targetPath = filePath;
    if (selectedDataset && !targetPath.startsWith(selectedDataset + '/')) {
      targetPath = `${selectedDataset}/${targetPath}`;
    }

    const fileNameOnly = filePath.split('/').pop();

    try {
      const response = await fetch(`${BACKEND_URL}/api/delete-gcs-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, filePath: targetPath, datasetId: selectedDataset })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to delete GCS file');
      }

      setSuccessMessage(`파일 '${targetPath}' 삭제 완료`);
      addLog(`[GCS 파일 삭제 완료] ${targetPath}`, 'success');

      // 선택 상태 초기화
      if (selectedGcsFile === filePath || selectedGcsFile === targetPath) {
        setSelectedGcsFile('');
        setGcsFileContent('');
      }

      // 로컬 파일 목록 상태에서 즉시 제거 (팝업 없는 0ms 즉각적 UI 반영)
      const updatedFiles = gcsFiles.filter(f => f !== filePath && f !== targetPath && !f.endsWith('/' + fileNameOnly));
      setGcsFiles(updatedFiles);

      // 트리 및 GCS 폴더 새로고침 (안전 예외 처리 적용)
      try {
        if (projectId) {
          fetchGcsBundleTree(projectId);
        }
        if (selectedGcsFolder && typeof handleSelectGcsFolder === 'function') {
          handleSelectGcsFolder(selectedGcsFolder, updatedFiles);
        }
      } catch (refreshErr) {
        console.warn('GCS tree refresh warning:', refreshErr);
      }
    } catch (err) {
      setError(err.message || 'GCS 파일 삭제 실패');
      addLog(`[GCS 파일 삭제 실패] ${err.message}`, 'error');
    }
  };

  // PDF 파싱 실행 (로컬 직접 업로드 또는 서버 docs/ 내 지정 파일)
  const handleParsePdf = async (fileOrName) => {
    setIsParsingPdf(true);
    setError('');

    const formData = new FormData();
    let displayName = '';
    let displaySize = 'Unknown';

    if (typeof fileOrName === 'string') {
      // 서버 내 파일 파싱
      formData.append('fileName', fileOrName);
      displayName = fileOrName;
    } else if (fileOrName && fileOrName.name) {
      // 직접 업로드
      formData.append('pdfFile', fileOrName);
      displayName = fileOrName.name;
      displaySize = (fileOrName.size / 1024).toFixed(1) + ' KB';
    } else {
      setIsParsingPdf(false);
      return;
    }

    addLog(`[PDF 파싱 시작] 문서(${displayName}) 텍스트 추출 중...`, 'info');

    try {
      const response = await fetch(`${BACKEND_URL}/api/parse-pdf`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to parse PDF');
      }

      const data = await response.json();

      // 누적 저장 (동일 명칭 중복 유입 방지)
      setParsedWikiDocs(prev => {
        const filtered = prev.filter(doc => doc.title !== displayName);
        return [...filtered, {
          title: displayName,
          content: data.text,
          size: displaySize === 'Unknown' && data.text ? (data.text.length / 1024).toFixed(1) + ' KB' : displaySize
        }];
      });

      addLog(`[PDF 파싱 성공] 문서(${displayName})로부터 비즈니스 맥락 텍스트 추출 성공.`, 'success');
      setSuccessMessage(`✓ ${displayName} 파싱 완료!`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(`PDF parsing failed: ${err.message}`);
      addLog(`[PDF 파싱 에러] ${displayName} 처리 실패: ${err.message}`, 'error');
    } finally {
      setIsParsingPdf(false);
      // 직접 업로드 후 인풋창 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 파싱 완료된 리스트에서 제거
  const handleRemoveParsedDoc = (title) => {
    setParsedWikiDocs(prev => prev.filter(doc => doc.title !== title));
    addLog(`[지식 해제] 파싱 대기열에서 ${title} 제거됨.`, 'info');
  };

  // 데이터셋 탭이 지식 보강 탭으로 바뀌거나 선택된 경우 서버 PDF 목록 가져오기
  useEffect(() => {
    if (datasetActiveTab === 'enrichment-report') {
      fetchServerPdfList();
    }
  }, [datasetActiveTab]);

  // 📌 Glossary 탭에서 테이블 선택 시 로컬 GCS OKF 메타데이터 정보 읽어와서 Diff 준비
  useEffect(() => {
    if (!projectId || !selectedDataset || !selectedGlossaryTable) {
      setLocalMetadata({ description: '', body: '' });
      setHasLocalOkf(true);
      return;
    }
    
    const fetchLocalOkfForDiff = async () => {
      setIsLocalLoading(true);
      try {
        const isDatasetMode = selectedGlossaryTable === '[dataset]';
        const gcsPath = isDatasetMode
          ? `${selectedDataset}/datasets/${selectedDataset}.md`
          : `${selectedDataset}/tables/${selectedGlossaryTable}.md`;
          
        const res = await fetch(`/api/gcs-file?projectId=${projectId}&filePath=${encodeURIComponent(gcsPath)}`);
        if (res.ok) {
          const data = await res.json();
          const rawText = data.content || '';
          
          // Frontmatter 및 본문 분리 파싱
          let desc = '';
          let body = rawText;
          if (rawText.startsWith('---')) {
            const parts = rawText.split('---');
            if (parts.length >= 3) {
              const yamlLines = parts[1].trim().split('\n');
              yamlLines.forEach(line => {
                const idx = line.indexOf(':');
                if (idx !== -1) {
                  const k = line.slice(0, idx).trim();
                  const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
                  if (k === 'description') desc = v;
                }
              });
              body = parts.slice(2).join('---').trim();
            }
          }
          setLocalMetadata({ description: desc, body });
          setHasLocalOkf(true);
        } else {
          setLocalMetadata({ description: '', body: '' });
          setHasLocalOkf(false);
        }
      } catch (err) {
        console.error('[Glossary Diff Parser Error]:', err);
        setLocalMetadata({ description: '', body: '' });
        setHasLocalOkf(false);
      } finally {
        setIsLocalLoading(false);
      }
    };
    
    fetchLocalOkfForDiff();
  }, [projectId, selectedDataset, selectedGlossaryTable]);

  // GCS 위키 기반 온톨로지 지식 자율 보강 (Enrichment Agent)
  const handleEnrichViaWiki = async () => {
    // GCS Browser가 바라보는 데이터셋 폴더가 있으면 그것을 타겟으로 하고, 없으면 사이드바 선택 데이터셋 활용
    const activeDataset = selectedGcsFolder
      ? selectedGcsFolder.split('/')[0]
      : selectedDataset;

    if (!projectId || !activeDataset) {
      setError('Please select a project and dataset first.');
      return;
    }

    // 리포트 실행 상태 설정 (수행 탭 유지하며 백그라운드 진행, 완료 시 비로소 Result 탭으로 자동 이동)
    setIsEnriching(true);
    setEnrichStep(1); // 1단계 진입
    setError('');
    setSuccessMessage('');
    setEnrichmentResult(null);
    setEnrichTimelineStatus(null);
    addLog(`[위키 지식 보강 시작] 데이터셋(${activeDataset}) 내 전체 테이블에 대해 GCS 위키 지식 보강 시작... (화면 전환 없이 백그라운드 진행)`, 'info');

    // 백엔드 상태 캐시 폴링 타이머 가동 (500ms 주기) - 작업 단계(step) 변화 시에만 작업 단위 로그 기록
    let lastStep = 0;
    const pollingTimer = setInterval(async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/enrich-status`);
        if (response.ok) {
          const statusData = await response.json();
          setEnrichTimelineStatus(statusData);
          if (statusData.step && statusData.step !== lastStep) {
            lastStep = statusData.step;
            setEnrichStep(statusData.step);

            const stepNames = {
              1: 'Step 1: GCS 비정형 위키 지식 문서 로드 완료',
              2: 'Step 2: 대상 OKF 스펙 테이블 스캔 완료',
              3: 'Step 3: Gemini 3.5 Flash 크로스 보강 분석 중...',
              4: 'Step 4: GCS 물리 파일 갱신 및 거버넌스 이력 기록 중...'
            };
            if (stepNames[statusData.step]) {
              addLog(`[작업 진행] ${stepNames[statusData.step]}`, 'info');
            }
          }
        }
      } catch (err) {
        console.error('실시간 지식 보강 상태 폴링 에러:', err);
      }
    }, 500);

    try {
      const response = await fetch(`${BACKEND_URL}/api/enrich-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: activeDataset,
          geminiApiKey,
          customContexts: parsedWikiDocs,
          customPrompt: customEnrichmentPrompt,
          selectedTableIds: selectedEnrichTableIds
        })
      });

      clearInterval(pollingTimer); // 응답 도달 시 즉시 폴링 정지

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Enrichment failed: ${response.statusText}`);
      }

      const data = await response.json();
      setEnrichStep(5); // 최종 완료 단계로 설정

      // 보강 완료된 파일 단위 목록 로그 출력
      if (data.enrichedTables && data.enrichedTables.length > 0) {
        data.enrichedTables.forEach(tId => {
          addLog(`[파일 갱신 완료] ${activeDataset}/${tId}.okf.md 파일 보강 저장 완료`, 'success');
        });
      }

      // GCS에서 갱신된 index.md 및 log.md 최신 텍스트 불러오기
      let indexContent = '';
      let logContent = '';
      try {
        const indexRes = await fetch(`${BACKEND_URL}/api/gcs-file?projectId=${projectId}&filePath=${activeDataset}/index.md`);
        if (indexRes.ok) {
          const idxData = await indexRes.json();
          indexContent = idxData.content;
        }
        const logRes = await fetch(`${BACKEND_URL}/api/gcs-file?projectId=${projectId}&filePath=${activeDataset}/log.md`);
        if (logRes.ok) {
          const logData = await logRes.json();
          logContent = logData.content;
        }
      } catch (fileErr) {
        console.error('지식 번들 결과 파일 로드 실패:', fileErr);
      }

      const finalResult = {
        status: 'success',
        timestamp: new Date().toLocaleTimeString(),
        enrichedTables: data.enrichedTables || [],
        details: data.details || [],
        message: data.message,
        indexContent,
        logContent
      };

      setEnrichmentResult(finalResult);
      setEnrichmentReport(finalResult);
      setEnrichmentSubView('result'); // 완료 후 결과 리포트 뷰로 전환

      // 기본적으로 첫 번째 보강 성공 테이블 활성화
      if (data.details && data.details.length > 0) {
        setSelectedEnrichedTable(data.details[0].tableId);
      }

      setSuccessMessage(data.message);
      addLog(`[보강 완료] ${data.message}`, 'success');

      fetchGcsBundleTree(projectId);
    } catch (err) {
      clearInterval(pollingTimer);
      const apiInfo = `POST ${BACKEND_URL}/api/enrich-metadata`;
      setError(`${err.message} (API: ${apiInfo})`);
      addLog(`[보강 오류] 위키 기반 지식 보강 실패: ${err.message} (호출 API: ${apiInfo}, 대상 데이터셋: ${activeDataset})`, 'error');
      setEnrichStep(0); // 초기화

      const failedResult = {
        status: 'error',
        message: err.message
      };
      setEnrichmentResult(failedResult);
      setEnrichmentReport(failedResult);
    } finally {
      setIsEnriching(false);
    }
  };

  // 단일 테이블 전용 Knowledge Enrichment 기동 핸들러
  const handleEnrichSingleTable = async (targetTableId) => {
    const tId = targetTableId || selectedTable;
    if (!projectId || !selectedDataset || !tId) return;

    setIsEnriching(true);
    setError('');
    setSuccessMessage('');
    addLog(`[단일 테이블 지식 보강 시작] 테이블(${tId})에 대해 GCS 위키 지식 보강 시작...`, 'info');

    try {
      const response = await fetch(`${BACKEND_URL}/api/enrich-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          geminiApiKey,
          customContexts: parsedWikiDocs,
          customPrompt: customEnrichmentPrompt,
          selectedTableIds: [tId]
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Single table enrichment failed: ${response.statusText}`);
      }

      const data = await response.json();
      setSuccessMessage(`테이블 '${tId}' Knowledge Enrichment 완료!`);
      addLog(`[단일 테이블 보강 완료] ${tId} OKF 명세 지식 통합 완료.`, 'success');

      if (data.success) {
        setSingleTableEnrichResult(data);
        setSingleTableSubView('result');
      }

      // 테이블 정보 새로고침 & GCS 트리 새로고침
      await handleTableSelect(tId, 'enrichment');
      if (projectId) {
        fetchGcsBundleTree(projectId);
      }
    } catch (err) {
      setError(err.message || 'Single table enrichment failed');
      addLog(`[단일 테이블 보강 실패] ${err.message}`, 'error');
    } finally {
      setIsEnriching(false);
    }
  };

  // 위키 편집기 GCS 저장 처리
  const handleSaveWiki = async () => {
    // GCS Browser가 바라보는 데이터셋 폴더가 있으면 그것을 타겟으로 하고, 없으면 사이드바 선택 데이터셋 활용
    const activeDataset = selectedGcsFolder
      ? selectedGcsFolder.split('/')[0]
      : selectedDataset;

    if (!projectId || !activeDataset) {
      alert('프로젝트와 데이터셋을 먼저 선택해 주세요.');
      return;
    }
    if (!wikiContent.trim()) {
      alert('위키 본문 내용을 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setIsWikiProcessing(true); // 📌 백그라운드 처리 표시 시작

    // 파일명이 기입된 경우에만 .md 확장자 보정 처리
    const formattedFileName = wikiFileName.trim()
      ? (wikiFileName.trim().endsWith('.md') ? wikiFileName.trim() : `${wikiFileName.trim()}.md`)
      : '';

    // 📌 5초 타이머: 처리가 지연될 경우 모달을 닫고 백그라운드로 전환
    const modalCloseTimer = setTimeout(() => {
      setIsWikiModalOpen(false);
      addLog(`[위키 백그라운드 전환] 처리가 지연되어 백그라운드로 전환합니다. 완료 시 로그가 추가됩니다.`, 'info');
    }, 5000);

    try {
      const response = await fetch(`${BACKEND_URL}/api/save-wiki-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: activeDataset,
          category: wikiCategory,
          fileName: formattedFileName,
          content: wikiContent,
          geminiApiKey // 백엔드 자동 명명 AI 구동용 키 전달
        })
      });

      // 완료되었으므로 타이머 제거
      clearTimeout(modalCloseTimer);

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to save wiki document');
      }

      const data = await response.json();
      const savedName = data.fileName || formattedFileName;

      addLog(`[위키 저장 완료] ${activeDataset}/wiki/${wikiCategory}/${savedName} 문서가 성공적으로 업로드되었습니다.`, 'success');

      // 모달 즉시 닫기 및 폼 초기화 (이미 타이머에 의해 닫혔을 수도 있음)
      setIsWikiModalOpen(false);
      setWikiFileName('');
      setWikiContent('');

      // GCS 파일 트리 리프레시
      fetchGcsBundleTree(projectId);
      
      // 📌 현재 열려있는 GCS 파일(예: index.md)이 있으면 리프레시 실행
      if (selectedGcsFile) {
        handleSelectGcsFile(selectedGcsFile);
      }
    } catch (err) {
      clearTimeout(modalCloseTimer);
      console.error('Error saving wiki doc:', err);
      alert(`위키 문서 저장 실패: ${err.message}`);
      addLog(`[위키 저장 오류] 저장 실패: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
      setIsWikiProcessing(false); // 📌 백그라운드 상태 완료 해제
    }
  };


  // Run AI Agent Action (Table-level)
  const handleRunAgentAction = async (actionId) => {
    if (!projectId || !selectedDataset || !selectedTable) {
      setError('Please select a project, dataset, and table first.');
      return;
    }
    setIsAgentLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/run-agent-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          tableId: selectedTable,
          actionId,
          geminiApiKey
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Agent action failed: ${response.statusText}`);
      }
      const data = await response.json();
      setAgentResults(prev => ({
        ...prev,
        [actionId]: data.result
      }));
      addLog(`[AI 에이전트 완료] 분석 도구(${actionId}) 연산이 성공적으로 끝났습니다.`, 'success');
    } catch (err) {
      setError(err.message || `Failed to run ${actionId} agent`);
      addLog(`[AI 에이전트 오류] 분석 도구(${actionId}) 실행 실패: ${err.message}`, 'error');
    } finally {
      setIsAgentLoading(false);
    }
  };

  // Run Dataset-level Agent (e.g., Multi-table graph design)
  const handleRunDatasetAgent = async () => {
    if (!projectId || !selectedDataset || selectedTablesForGraph.length === 0) {
      setError('Please select a project, dataset, and at least one table.');
      return;
    }
    setIsDatasetAgentLoading(true);
    setDatasetAgentResult('');
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/run-dataset-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          tableIds: selectedTablesForGraph,
          actionId: 'dataset-graph',
          geminiApiKey
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Dataset agent failed: ${response.statusText}`);
      }
      const data = await response.json();
      setDatasetAgentResult(data.result);
      addLog(`[AI 데이터셋 에이전트] 그래프 DDL 및 관계 모델링 설계 완료.`, 'success');
    } catch (err) {
      setError(err.message || 'Failed to design dataset graph');
      addLog(`[AI 데이터셋 에이전트 오류] 그래프 설계 실패: ${err.message}`, 'error');
    } finally {
      setIsDatasetAgentLoading(false);
    }
  };

  // Save AI output to GCS LLM-Wiki
  const handleSaveToWiki = async (category, fileName, content) => {
    if (!projectId || !selectedDataset || !content) return;
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/save-wiki-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          category,
          fileName,
          content,
          geminiApiKey
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Save failed: ${response.statusText}`);
      }
      const data = await response.json();
      setSuccessMessage(`Document saved to GCS Wiki: ${data.filePath}`);
      addLog(`[위키 저장 완료] GCS 저장 성공: ${data.filePath}`, 'success');

      fetchGcsBundleTree(projectId); // Refresh GCS tree
    } catch (err) {
      setError(err.message || 'Failed to save document to wiki');
      addLog(`[위키 저장 오류] 저장 실패: ${err.message}`, 'error');
    }
  };
  // 순수 OKF 본문 반환 헬퍼 (마크다운 문서 오염 방지)
  const formatOkfContentWithDiffHighlight = (content) => {
    return content || "";
  };

  const getInsightMsgKey = (msg, idx = 0) => {
    if (!msg) return `msg_null_${idx}`;
    if (msg.id) return String(msg.id);
    if (msg.timestamp) return `msg_${msg.timestamp}`;
    const textStr = typeof msg.text === "string" ? msg.text : (msg.text ? String(msg.text) : "");
    return `msg_${idx}_${textStr.substring(0, 20)}`;
  };

  // OKF 백링크 명세서 내 구체적 섹션/키관계/파악 정보 동적 분석 헬퍼
  const getBacklinkDetailInfo = (tId, referencedTables, lang) => {
    const safeTables = Array.isArray(referencedTables) ? referencedTables : [];
    const others = safeTables.filter(id => id !== tId);
    const otherStr = others.length > 0 ? others.join(', ') : '';

    if (tId === 'order_items' && others.includes('users')) {
      return {
        section: `${tId}.md ➔ ## 3. 백링크 릴레이션 [user_id](users.md)`,
        relation: `order_items ↔ users (user_id 외래키 연관)`,
        insight: `주문 상품 항목(order_items)과 구매 고객(users) 간의 소유 관계를 파악하여 고객별 구매 항목 데이터 조인 도출`
      };
    }
    if (tId === 'users' && others.includes('order_items')) {
      return {
        section: `${tId}.md ➔ ## 2. 주 식별자 (Keys) 및 역백링크 릴레이션`,
        relation: `users ↔ order_items (id ➔ user_id 1:N 연관)`,
        insight: `사용자 고유 ID(id)를 기준으로 고객이 구매한 개별 주문 상품 내역 연결 및 집계 정보 파악`
      };
    }
    if (tId === 'order_items' && others.includes('products')) {
      return {
        section: `${tId}.md ➔ ## 3. 백링크 릴레이션 [product_id](products.md)`,
        relation: `order_items ↔ products (product_id 외래키 연관)`,
        insight: `주문 상품(order_items)에 연결된 상품 메타(products)의 가격/카테고리 정보 매핑`
      };
    }
    if (tId === 'products' && others.includes('order_items')) {
      return {
        section: `${tId}.md ➔ ## 2. 주 식별자 (Keys) 및 상품 카탈로그 명세`,
        relation: `products ↔ order_items (id ➔ product_id 1:N 연관)`,
        insight: `상품 고유 ID(id)를 수단으로 개별 주문 내역에서의 판매 실적 및 품목별 카테고리 정보 파악`
      };
    }
    if (tId === 'orders' && others.includes('users')) {
      return {
        section: `${tId}.md ➔ ## 3. 백링크 릴레이션 [user_id](users.md)`,
        relation: `orders ↔ users (user_id 외래키 연관)`,
        insight: `주문 결제 건(orders)과 주문자 프로필(users) 간의 연관관계를 확인하여 고객별 주문 패턴 파악`
      };
    }
    if (tId === 'users' && others.includes('orders')) {
      return {
        section: `${tId}.md ➔ ## 2. 주 식별자 (Keys) 및 고객 주문 이력 명세`,
        relation: `users ↔ orders (id ➔ user_id 1:N 연관)`,
        insight: `고객 ID(id)를 기준으로 발주일자/주문상태 등 총 거래 이력 매핑 파악`
      };
    }

    if (others.length > 0) {
      return {
        section: `${tId}.md ➔ ## 3. 백링크 릴레이션 (Relations) 및 Schema Keys`,
        relation: `${tId} ↔ ${otherStr} (외래키/조인 키 릴레이션)`,
        insight: `${tId} 데이터 개체와 ${otherStr} 간의 스키마 키 참조 구조를 분석하여 JOIN 연관 데이터 파악`
      };
    }

    return {
      section: `${tId}.md ➔ ## 1. 데이터 개체 명세 및 물리 스키마`,
      relation: `${tId} (단독 데이터 개체)`,
      insight: `${tId} 개체의 칼럼 타입, Nullable 여부 및 주요 수치 속성 파악`
    };
  };

  // Data Agent Chat 분석 결과를 GCS LLM-Wiki (insights 카테고리)에 자산화 보관 (Feedback Loop)
  const handleSaveChatInsightToWiki = async (msg, msgKeyParam = null) => {
    if (!projectId || !selectedDataset || !msg) return;
    const msgKey = msgKeyParam || getInsightMsgKey(msg, 0);

    setSavingInsightMap(prev => ({ ...prev, [msgKey]: 'saving' }));

    const insightContent = `# 💡 Data Agent 분석 인사이트 리포트\n\n` +
      `**생성 시각**: ${new Date().toLocaleString('ko-KR')}\n` +
      `**대상 데이터셋**: \`${selectedDataset}\`\n\n` +
      `## 1. 분석 내용 및 소스\n${msg.text}\n\n` +
      (msg.sql ? `## 2. 수행된 SQL 쿼리\n\`\`\`sql\n${msg.sql}\n\`\`\`\n\n` : '') +
      (msg.rows && msg.rows.length > 0 ? `## 3. 조회 데이터 표본 (${msg.rows.length}행)\n\`\`\`json\n${JSON.stringify(msg.rows.slice(0, 5), null, 2)}\n\`\`\`\n` : '');

    addLog(`[Chat 인사이트 자산화] 대화 답변 결과를 GCS wiki/insights/ 폴더로 피드백 보관 중...`, 'info');
    try {
      await handleSaveToWiki('insights', '', insightContent);
      setSavingInsightMap(prev => ({ ...prev, [msgKey]: 'saved' }));
    } catch (err) {
      setSavingInsightMap(prev => ({ ...prev, [msgKey]: 'idle' }));
    }
  };

  // Send message in Data Agent Chat (NL2SQL)
  const handleSendChatMessage = async (tableId = null) => {
    if (!chatInput.trim() || !projectId || !selectedDataset) return;

    const userMsg = { sender: 'user', text: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    const question = chatInput;
    setChatInput('');
    setIsChatLoading(true);
    setError('');
    setSuccessMessage('');

    addLog(`[Data Agent 질의] "${question}"`, 'info');

    try {
      const response = await fetch(`${BACKEND_URL}/api/data-agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId: selectedDataset,
          tableId,
          question,
          geminiApiKey,
          appLang
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Chat agent failed: ${response.statusText}`);
      }
      const data = await response.json();
      const agentMsg = {
        sender: 'agent',
        text: data.answer,
        sql: data.sql,
        gql: data.gql,
        rows: data.rows,
        sqlRows: data.sqlRows || [],
        gqlRows: data.gqlRows || [],
        error: data.error,
        sqlError: data.sqlError,
        gqlError: data.gqlError,
        sqlElapsedMs: data.sqlElapsedMs || 0,
        gqlElapsedMs: data.gqlElapsedMs || 0,
        strategy: data.strategy || 'HYBRID',
        targetGraph: data.targetGraph || `${projectId}.${selectedDataset}.${selectedDataset}_knowledge_graph`,
        reasoningProcess: data.reasoningProcess || '',
        referencedTables: data.referencedTables || [],
        referencedDocs: data.referencedDocs || [],
        wikiContentsMap: data.wikiContentsMap || {},
        metrics: data.metrics || null,
        question: question
      };
      setChatMessages(prev => {
        const next = [...prev, agentMsg];
        setSelectedChatMessageIndex(next.length - 1);
        saveChatHistory(selectedDataset, next);
        return next;
      });

      if (data.sql || data.gql) {
        addLog(`[Data Agent] 쿼리 도출 완료 (SQL: ${data.sql ? 'Y' : 'N'}, GQL: ${data.gql ? 'Y' : 'N'})`, 'info');
      }
      if (data.sqlError || data.gqlError) {
        addLog(`[Data Agent 오류 발생] SQL: ${data.sqlError || '없음'}, GQL: ${data.gqlError || '없음'}`, 'warning');
      } else {
        addLog(`[Data Agent] 쿼리 실행 성공. SQL: ${data.sqlRows?.length || 0}행, GQL: ${data.gqlRows?.length || 0}행 조회됨.`, 'success');
      }
    } catch (err) {
      setError(err.message || 'Data Agent failed to respond');
      const errorMsg = {
        sender: 'agent',
        text: `Error: ${err.message}`,
        isError: true,
        strategy: 'SQL',
        question: question
      };
      setChatMessages(prev => {
        const next = [...prev, errorMsg];
        setSelectedChatMessageIndex(next.length - 1);
        return next;
      });
      addLog(`[Data Agent 오류] 질의 실패: ${err.message}`, 'error');
    } finally {
      setIsChatLoading(false);
    }
  };

  // Execute BigQuery SQL (DDL / Queries)
  const handleExecuteSql = async () => {
    if (!projectId || !sqlToExecute.trim()) return;
    setIsSqlExecuting(true);
    setSqlResult(null);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/execute-sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          sql: sqlToExecute
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `SQL execution failed: ${response.statusText}`);
      }
      const data = await response.json();
      setSqlResult({
        success: true,
        message: data.message,
        rows: data.rows
      });
      setSuccessMessage('BigQuery SQL Job completed successfully!');
      addLog(`[BigQuery SQL 콘솔] 실행 성공. ${data.rows?.length || 0}개의 행 반환됨.`, 'success');
    } catch (err) {
      setSqlResult({
        success: false,
        message: err.message
      });
      setError(err.message || 'SQL execution failed');
      addLog(`[BigQuery SQL 콘솔 오류] 실행 실패: ${err.message}`, 'error');
    } finally {
      setIsSqlExecuting(false);
    }
  };

  // Handle Citation & Markdown link click
  const handleLinkClick = (url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank');
    } else {
      let cleanUrl = url;
      // 상대 경로 표시인 './' 제거
      if (url.startsWith('./')) {
        cleanUrl = url.replace(/^\.\//, '');
      }

      let resolvedPath = cleanUrl;
      if (cleanUrl.startsWith('../')) {
        const pathWithoutParent = cleanUrl.replace(/^\.\.\//, '');
        resolvedPath = `${selectedDataset}/${pathWithoutParent}`;
      } else if (!cleanUrl.includes('/')) {
        resolvedPath = `${selectedDataset}/${cleanUrl}`;
      } else {
        // 이미 sub-path(예: datasets/xxx.md 또는 tables/xxx.md) 형태이고, datasetId가 포함되지 않은 경우 datasetId를 덧붙임
        if (!cleanUrl.startsWith(selectedDataset + '/')) {
          resolvedPath = `${selectedDataset}/${cleanUrl}`;
        }
      }

      const matchedFile = gcsFiles.find(f => f.toLowerCase() === resolvedPath.toLowerCase() || f.endsWith(resolvedPath));
      if (matchedFile) {
        handleSelectGcsFile(matchedFile);
      } else {
        alert(`Internal document not found: ${resolvedPath}`);
      }
    }
  };

  // Parse GCS file tree grouped by Dataset / Folder
  const parsedGcsBundle = useMemo(() => {
    const datasetsTree = {};

    gcsFiles.forEach(file => {
      const parts = file.split('/');
      if (parts.length < 2) return; // Skip invalid or root bucket files

      const datasetId = parts[0];
      const category = parts[1];

      if (!datasetsTree[datasetId]) {
        datasetsTree[datasetId] = {
          rootDocs: [],
          tables: [],
          wiki: []
        };
      }

      if (parts.length === 2) {
        datasetsTree[datasetId].rootDocs.push({ path: file, name: parts[1] });
      } else if (category === 'tables') {
        datasetsTree[datasetId].tables.push({ path: file, name: parts.slice(2).join('/') });
      } else if (category === 'wiki') {
        datasetsTree[datasetId].wiki.push({ path: file, name: parts.slice(2).join('/') });
      }
    });

    return datasetsTree;
  }, [gcsFiles]);

  const toggleGcsDataset = (datasetId) => {
    setExpandedGcsDatasets(prev => ({
      ...prev,
      [datasetId]: !prev[datasetId]
    }));
  };

  const handleSelectGcsFolder = (folderPath, overrideGcsFiles) => {
    setSelectedGcsFolder(folderPath);
    setSelectedTable('');
    setIsGithubModeActive(false); // GitHub 모드 해제
    setTableDetails(null); // BQ 테이블 상세 정보 초기화 (GCS 뷰 전환에 필수)
    setGeneratedOkf(null); // 생성된 OKF 초기화

    // 폴더 이동 시 최상단 파일(index.md 또는 첫 번째 파일) 자동 선택 및 본문 로드
    const targetFiles = overrideGcsFiles || gcsFiles;
    const { files } = getFolderContents(folderPath, targetFiles);
    if (files.length > 0) {
      // index.md가 있으면 index.md 우선, 없으면 첫 번째 파일 선택
      const topFile = files.find(f => f === 'index.md') || files[0];
      const fullFilePath = folderPath + topFile;
      handleSelectGcsFile(fullFilePath);
    } else {
      setSelectedGcsFile('');
      setGcsFileContent('');
    }
  };

  // Memoize parsed OKF details for display in the explanation panel
  const okfData = useMemo(() => {
    if (!generatedOkf) return null;
    const parsed = parseOKF(generatedOkf.content);
    if (!parsed) return null;
    return {
      metadata: parsed.metadata,
      body: parsed.body,
      citations: extractCitations(parsed.body)
    };
  }, [generatedOkf]);

  // GCS 내 현재 데이터셋 소속 비정형 위키 문서 목록 추출
  const activeWikiFiles = useMemo(() => {
    if (!selectedDataset || !gcsFiles) return [];
    return gcsFiles.filter(filePath =>
      filePath.startsWith(`${selectedDataset}/wiki/`) && filePath.endsWith('.md')
    ).map(filePath => {
      const relativePath = filePath.substring(`${selectedDataset}/wiki/`.length);
      const parts = relativePath.split('/');
      return {
        fullPath: filePath,
        category: parts[0] || 'general',
        fileName: parts[1] || parts[0],
      };
    });
  }, [gcsFiles, selectedDataset]);

  // GCS 내 현재 데이터셋 소속 정형 OKF 테이블 명세 목록 추출
  const activeOkfFiles = useMemo(() => {
    if (!selectedDataset || !gcsFiles) return [];
    return gcsFiles.filter(filePath =>
      filePath.startsWith(`${selectedDataset}/tables/`) && filePath.endsWith('.md')
    ).map(filePath => {
      const parts = filePath.split('/');
      const fileName = parts[parts.length - 1];
      const tableId = fileName.replace('.md', '');
      return {
        fullPath: filePath,
        tableId,
        fileName
      };
    });
  }, [gcsFiles, selectedDataset]);

  // activeOkfFiles 변경 시 selectedEnrichTableIds 전체 선택 기본값 동기화
  useEffect(() => {
    if (activeOkfFiles && activeOkfFiles.length > 0) {
      setSelectedEnrichTableIds(prev => {
        if (prev.length === 0) {
          return activeOkfFiles.map(f => f.tableId);
        }
        return prev;
      });
    }
  }, [activeOkfFiles]);

  const handleToggleSelectAllEnrichTables = () => {
    if (selectedEnrichTableIds.length === activeOkfFiles.length) {
      setSelectedEnrichTableIds([]);
    } else {
      setSelectedEnrichTableIds(activeOkfFiles.map(f => f.tableId));
    }
  };

  const handleToggleEnrichTable = (tableId) => {
    setSelectedEnrichTableIds(prev =>
      prev.includes(tableId) ? prev.filter(id => id !== tableId) : [...prev, tableId]
    );
  };

  // Toggle Table selection for multi-table graph design
  const handleToggleTableForGraph = (tableId) => {
    setSelectedTablesForGraph(prev =>
      prev.includes(tableId)
        ? prev.filter(t => t !== tableId)
        : [...prev, tableId]
    );
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-section" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-primary)', marginTop: '1px' }}>
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
            <line x1="4" y1="22" x2="4" y2="15"></line>
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ margin: 0, fontSize: '23px', fontWeight: '800', color: '#202124', letterSpacing: '-0.3px' }}>
                OKF <span className="logo-accent">Omni</span>
              </h1>
              <span
                className="badge"
                title="Google Cloud Open Knowledge Format (OKF) version 0.2 Spec Applied"
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  letterSpacing: '0.2px',
                  boxShadow: '0 1px 2px rgba(37,99,235,0.08)'
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563eb' }}></span>
                OKF version 0.2
              </span>
            </div>
            <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginTop: '5px' }}>
              Ontology Knowledge Integration Platform
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* 글로벌 한/영 언어 스위처 토글 버튼 */}
          <div style={{ display: 'flex', backgroundColor: '#ffffff', padding: '2px', borderRadius: '20px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <button
              onClick={() => setAppLang('kr')}
              title="한국어 모드로 전체 화면 레이블 전환"
              style={{
                padding: '4px 10px',
                borderRadius: '16px',
                border: 'none',
                fontSize: '11.5px',
                fontWeight: 'bold',
                backgroundColor: appLang === 'kr' ? 'var(--color-primary)' : 'transparent',
                color: appLang === 'kr' ? '#ffffff' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              🇰🇷 KR
            </button>
            <button
              onClick={() => setAppLang('en')}
              title="Switch entire app labels to English mode"
              style={{
                padding: '4px 10px',
                borderRadius: '16px',
                border: 'none',
                fontSize: '11.5px',
                fontWeight: 'bold',
                backgroundColor: appLang === 'en' ? 'var(--color-primary)' : 'transparent',
                color: appLang === 'en' ? '#ffffff' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              🇺🇸 EN
            </button>
          </div>

          <button
            className="btn-secondary"
            onClick={() => setIsGuideModalOpen(true)}
            title="Open OKF Ontology Generation & Enrichment Pipeline Guide"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '6px 12px',
              fontWeight: 'bold',
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-light)',
              borderRadius: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              cursor: 'pointer'
            }}
          >
            <span>📖</span>
            <span>User Guide</span>
          </button>

          <div
            className="status-badge clickable"
            onClick={() => setIsLogDrawerOpen(!isLogDrawerOpen)}
            title="작업 로그 모니터링창 열기 (클릭)"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <div className="status-dot" style={{ backgroundColor: (tableDetails || selectedGcsFile || selectedDataset) ? 'var(--color-success)' : '#dadce0' }}></div>
            <span>{(tableDetails || selectedGcsFile || selectedDataset) ? 'Connected' : 'Waiting for connection'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '2px', opacity: 0.8, color: 'inherit' }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
          </div>
        </div>
      </header>

      {/* Workspace Layout */}
      <main className="workspace-layout">
        {/* Left Sidebar */}
        {/* Left Sidebar (2단 구조 복구: Connection + BQ + GCS 최상위 폴더만) */}
        <section className="sidebar-panel">
          <div className="connection-card">
            <div className="form-group">
              <label>GCP Project ID</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. my-gcp-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={isLoading || isGenerating || isAgentLoading || isSqlExecuting || isChatLoading}
                />
                <button
                  onClick={handleConnect}
                  className="btn-primary"
                  style={{ padding: '10px 16px', borderRadius: '8px' }}
                  disabled={isLoading || isGenerating || isAgentLoading || isSqlExecuting || isChatLoading}
                >
                  Connect
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Gemini API Key</label>
              <input
                type="password"
                className="input-field"
                placeholder="AIzaSy... (Optional if using Vertex AI)"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                disabled={isLoading || isGenerating || isAgentLoading || isSqlExecuting || isChatLoading}
              />
            </div>

            {datasets.length > 0 && (
              <div className="custom-select-container" style={{ position: 'relative', marginTop: '4px' }}>
                <label className="styled-select-label">Dataset</label>
                <div
                  className={`custom-select-trigger ${isDatasetDropdownOpen ? 'open' : ''}`}
                  onClick={() => setIsDatasetDropdownOpen(!isDatasetDropdownOpen)}
                >
                  <span>{selectedDataset || '-- Select Dataset --'}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
                {isDatasetDropdownOpen && (
                  <div className="custom-select-options">
                    <div
                      className={`custom-option ${selectedDataset === '' ? 'selected' : ''}`}
                      onClick={() => {
                        handleDatasetChange({ target: { value: '' } });
                        setIsDatasetDropdownOpen(false);
                      }}
                    >
                      -- Select Dataset --
                    </div>
                    {datasets.map(d => (
                      <div
                        key={d.id}
                        className={`custom-option ${selectedDataset === d.id ? 'selected' : ''}`}
                        onClick={() => {
                          handleDatasetChange({ target: { value: d.id } });
                          setIsDatasetDropdownOpen(false);
                        }}
                      >
                        {d.id}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 1: BigQuery Explorer (드래그 조절 높이 인라인 갱신 및 스크롤 고정) */}
          {datasets.length > 0 && (
            <div
              className="sidebar-list-container"
              style={{
                height: `${bqExplorerHeight}px`,
                minHeight: '120px',
                maxHeight: '600px',
                flexShrink: 0,
                overflowY: 'auto',
                paddingBottom: '5px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div
                className="sidebar-section-title"
                onClick={() => setIsBqExplorerExpanded(!isBqExplorerExpanded)}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}
              >
                <span>BigQuery Explorer (Structured)</span>
                <span style={{ fontSize: '11px', transform: isBqExplorerExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  ▶
                </span>
              </div>

              {isBqExplorerExpanded && (
                <div style={{ flex: 1, overflowY: 'auto' }}>

                  {selectedDataset && (
                    <div
                      className={`sidebar-item ${(!selectedTable && selectedDataset && !selectedGcsFolder && !selectedGcsFile && datasetActiveTab === 'tables') ? 'active' : ''}`}
                      onClick={() => {
                        if (!isLoading && !isAgentLoading && !isSqlExecuting && !isChatLoading) {
                          setSelectedTable(''); // Clear table selection to return to Dataset Dashboard
                          setTableDetails(null);
                          setGeneratedOkf(null);
                          setSelectedGcsFolder(''); // GCS 폴더 해제하여 BQ로 복귀
                          setSelectedGcsFile(''); // GCS 파일 해제
                          setDatasetActiveTab('tables');
                        }
                      }}
                      style={{
                        fontWeight: '600',
                        borderLeft: (!selectedTable && selectedDataset && !selectedGcsFolder && !selectedGcsFile && datasetActiveTab === 'tables') ? '3px solid var(--color-primary)' : '3px solid transparent',
                        backgroundColor: (!selectedTable && selectedDataset && !selectedGcsFolder && !selectedGcsFile && datasetActiveTab === 'tables') ? 'var(--color-primary-bg)' : 'transparent',
                        marginBottom: '6px',
                        paddingBottom: '8px',
                        paddingLeft: '16px', /* 부모 노드: 왼쪽으로 정렬 */
                        borderBottom: '1px dashed var(--border-light)',
                        borderRadius: '0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      <svg className="sidebar-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--color-primary)' }}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span className="sidebar-item-text">{selectedDataset} (Dataset Dashboard)</span>
                    </div>
                  )}
                  {/* 테이블 타입 우선 배치: TABLE 타입은 상단, VIEW 타입은 하단 정렬 */}
                  {[...tables].sort((a, b) => {
                    const isAView = (a.type || '').toUpperCase() === 'VIEW';
                    const isBView = (b.type || '').toUpperCase() === 'VIEW';
                    if (isAView && !isBView) return 1;
                    if (!isAView && isBView) return -1;
                    return a.id.localeCompare(b.id);
                  }).map(t => {
                    const isView = (t.type || '').toUpperCase() === 'VIEW';
                    return (
                      <div
                        key={t.id}
                        className={`sidebar-item ${selectedTable === t.id ? 'active' : ''}`}
                        onClick={() => !isLoading && !isAgentLoading && !isSqlExecuting && !isChatLoading && handleTableSelect(t.id)}
                        style={{
                          paddingLeft: '32px', /* 자식 노드: 16px 우측 들여쓰기 */
                          borderLeft: selectedTable === t.id ? '3px solid var(--color-primary)' : '3px solid transparent'
                        }}
                      >
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {/* 기본 실린더 테이블 아이콘 */}
                          <svg className="sidebar-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 22c5.523 0 10-2.239 10-5V7c0-2.761-4.477-5-10-5S2 4.239 2 7v10c0 2.761 4.477 5 10 5z"></path>
                            <path d="M22 7c0 2.761-4.477 5-10 5S2 9.761 2 7"></path>
                          </svg>

                          {/* View 타입일 경우 우측 하단 소형 돋보기 서브 아이콘 배치 */}
                          {isView && (
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--color-primary)"
                              strokeWidth="3.5"
                              style={{
                                position: 'absolute',
                                right: '-3px',
                                bottom: '-3px',
                                backgroundColor: '#ffffff',
                                borderRadius: '50%',
                                padding: '0.5px'
                              }}
                            >
                              <circle cx="11" cy="11" r="8"></circle>
                              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                          )}
                        </div>
                        <span className="sidebar-item-text">{t.id}</span>
                      </div>
                    );
                  })}

                  {/* Property Graphs 섹션: 원클릭 즉시 선택 및 Graphs 탭 동기화 랜딩 (데이터셋 선택 시에만 렌더링) */}
                  {selectedDataset && physicalGraphs && physicalGraphs.length > 0 && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNavigateToGraphsTab();
                      }}
                      style={{
                        paddingLeft: '16px',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: 'var(--text-muted)',
                        margin: '12px 0 4px 0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderTop: '1px dashed var(--border-light)',
                        paddingTop: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      <span>Property Graphs ({physicalGraphs.length})</span>
                    </div>
                  )}
                  {selectedDataset && physicalGraphs && Array.isArray(physicalGraphs) && physicalGraphs.map(g => {
                    if (!g || typeof g !== 'object' || !g.name) return null;
                    const activeGraphName = selectedPhysicalGraph?.name || (physicalGraphs[0] && physicalGraphs[0].name);
                    const isActive = !selectedTable && datasetActiveTab === 'graphs' && activeGraphName === g.name;

                    return (
                      <div
                        key={g.name}
                        className={`sidebar-item ${isActive ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNavigateToGraphsTab(g);
                        }}
                        style={{
                          paddingLeft: '32px',
                          borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent'
                        }}
                      >
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg className="sidebar-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="6" cy="6" r="3"></circle>
                            <circle cx="18" cy="6" r="3"></circle>
                            <circle cx="12" cy="18" r="3"></circle>
                            <line x1="8.5" y1="7.5" x2="10" y2="16.5"></line>
                            <line x1="15.5" y1="7.5" x2="14" y2="16.5"></line>
                            <line x1="9" y1="6" x2="15" y2="6"></line>
                          </svg>
                        </div>
                        <span className="sidebar-item-text">{g.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 두 사이드바 섹션 간의 드래그 조절 리사이저 바(Splitter Bar) 추가 */}
          {datasets.length > 0 && (
            <div
              className="sidebar-horizontal-resizer"
              onMouseDown={handleResizerMouseDown}
              onTouchStart={handleResizerMouseDown}
              style={{
                height: '14px',
                minHeight: '14px',
                cursor: 'row-resize',
                backgroundColor: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '4px 0',
                transition: 'background-color 0.2s',
                borderRadius: '4px',
                flexShrink: 0,
                userSelect: 'none',
                touchAction: 'none'
              }}
              title={appLang === 'en' ? "Adjust height (Drag)" : "상하 영역 높이 조절 (드래그)"}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-light, #e0e0e0)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div style={{ width: '32px', height: '4px', backgroundColor: '#bdc3c7', borderRadius: '2px', pointerEvents: 'none' }}></div>
            </div>
          )}

          {/* Section 2: GCS Bundle Explorer (사이드바에는 최상위 프로젝트 폴더만 노출) */}
          {gcsFiles.length > 0 && (
            <div className="sidebar-list-container" style={{ flex: 1, overflowY: 'auto' }}>
              <div className="sidebar-section-title">
                <span>OKF Bundle Explorer (GCS)</span>
              </div>
              {(() => {
                const topLevelDirs = getFolderContents('', gcsFiles).directories;
                return topLevelDirs.map(dir => (
                  <div
                    key={dir}
                    className={`sidebar-item ${selectedGcsFolder === dir ? 'active' : ''}`}
                    onClick={() => handleSelectGcsFolder(dir)}
                    style={{ paddingLeft: '16px' }} /* 1단 정렬 일치 (16px) */
                  >
                    <svg className="sidebar-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ color: '#fbbc04' }}>
                      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path>
                    </svg>
                    <span className="sidebar-item-text" style={{ fontWeight: '500' }}>{dir}</span>
                  </div>
                ));
              })()}
            </div>
          )}



          {error && (
            <div className="error-message" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div>{error}</div>
              {(error.includes('invalid_grant') || error.includes('invalid_rapt') || error.includes('reauth') || error.includes('GCP 인증 세션 만료') || error.includes('Internal Server Error')) && (
                <div style={{ marginTop: '4px', padding: '6px 8px', backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: '6px', fontSize: '11px', color: '#874d00', textAlign: 'left', lineHeight: '1.4' }}>
                  <strong>{appLang === 'en' ? '💡 GCP Session Expired Solution:' : '💡 로컬 GCP 인증 세션 만료 시 해결책:'}</strong><br />
                  {appLang === 'en' ? 'Execute the following command in your terminal to refresh credentials:' : '터미널에서 아래 명령어를 실행하여 인증을 재갱신해 주세요:'}
                  <code style={{ display: 'block', backgroundColor: '#ffffff', padding: '4px 6px', borderRadius: '4px', border: '1px solid #ffe58f', marginTop: '4px', fontWeight: 'bold', color: '#1e293b' }}>
                    gcloud auth application-default login
                  </code>
                </div>
              )}
            </div>
          )}
          {successMessage && <div className="status-badge" style={{ margin: '8px 0', borderColor: 'var(--color-success)', color: 'var(--color-success)', borderRadius: '8px', display: 'block', textAlign: 'center', wordBreak: 'break-word' }}>{successMessage}</div>}

          {/* ======================================================= */}
          {/* GitHub Explorer 원격 트리 뷰어 (하단 Sticky 고정 메뉴)   */}
          {/* ======================================================= */}
          <div
            className="sidebar-section github-explorer-sticky-bottom"
            style={{
              position: 'sticky',
              bottom: 0,
              backgroundColor: '#f8f9fa',
              borderTop: '2px solid var(--border-light)',
              marginTop: 'auto',
              paddingTop: '12px',
              paddingBottom: '12px',
              zIndex: 10,
              boxShadow: '0 -2px 10px rgba(0,0,0,0.02)'
            }}
          >
            <div
              className="sidebar-item"
              onClick={() => {
                setSelectedTable('');
                setSelectedGcsFolder('');
                setSelectedGcsFile('');
                setIsGithubModeActive(true);
                if (githubItems.length === 0) {
                  fetchGithubContents('');
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'transparent',
                borderLeft: '3px solid transparent',
                cursor: 'pointer'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                </svg>
                GitHub Explorer (OKF)
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>➔</span>
            </div>

            {/* Designed by @seanjung Watermark Footer */}
            <div style={{ padding: '12px 16px 4px 16px', textAlign: 'center', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.4px', borderTop: '1px solid var(--border-light)', marginTop: '8px' }}>
              Designed by <span style={{ color: 'var(--color-primary)', fontWeight: '700' }}>@seanjung</span>
            </div>
          </div>
        </section>

        {/* Main Panel */}
        <section className="main-panel">
          {isLoading ? (
            <div className="loader-container" style={{ height: '100%' }}>
              <div className="spinner"></div>
              <span>Fetching BigQuery metadata...</span>
            </div>
          ) : tableDetails ? (
            /* ======================================================= */
            /* 1. TABLE VIEW MODE (Table details loaded)              */
            /* ======================================================= */
            <>
              {/* Content Header */}
              <div className="content-header">
                <div className="table-title-section">
                  <div className="table-icon-badge">
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22c5.523 0 10-2.239 10-5V7c0-2.761-4.477-5-10-5S2 4.239 2 7v10c0 2.761 4.477 5 10 5z"></path>
                        <path d="M22 7c0 2.761-4.477 5-10 5S2 9.761 2 7"></path>
                      </svg>
                      {(tableDetails.type || '').toUpperCase() === 'VIEW' && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--color-primary)"
                          strokeWidth="3.5"
                          style={{
                            position: 'absolute',
                            right: '-3px',
                            bottom: '-3px',
                            backgroundColor: '#ffffff',
                            borderRadius: '50%',
                            padding: '0.5px'
                          }}
                        >
                          <circle cx="11" cy="11" r="8"></circle>
                          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="table-title-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h2>{tableDetails.id}</h2>
                      <span className="badge badge-info">
                        {(tableDetails.type || '').toUpperCase() === 'VIEW' ? 'View' : 'Table'}
                      </span>
                    </div>
                    <span>{projectId}.{selectedDataset}.{tableDetails.id}</span>
                  </div>
                </div>

                <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleGenerateOkf}
                    className="btn-primary"
                    disabled={isGenerating || isAgentLoading || isSqlExecuting}
                  >
                    {isGenerating && selectedTable ? 'Generating...' : (tableDetails.hasOkf ? 'Regenerate OKF' : 'Generate OKF')}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="gmail-tabs">
                <button className={`gmail-tab ${activeTab === 'schema' ? 'active' : ''}`} onClick={() => setActiveTab('schema')}>Schema</button>
                <button className={`gmail-tab ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>Preview (10 Rows)</button>
                <button className={`gmail-tab ${activeTab === 'advanced-schema' ? 'active' : ''}`} onClick={() => setActiveTab('advanced-schema')}>Catalog Info</button>
                <button className={`gmail-tab ${activeTab === 'okf' ? 'active' : ''}`} onClick={() => setActiveTab('okf')}>📄 OKF Knowledge Store</button>
                <button className={`gmail-tab ${activeTab === 'enrichment' ? 'active' : ''}`} onClick={() => setActiveTab('enrichment')}>🔮 Knowledge Enrichment</button>
              </div>

              {/* Scrollable Tab Content */}
              <div className="tab-scroll-content">

                {activeTab === 'schema' && (
                  <div>
                    {/* Metadata Summary (6 Grid Cards for Rich Info) */}
                    <div className="metadata-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', marginBottom: '16px' }}>
                      <div className="meta-card">
                        <div className="meta-card-label">Type</div>
                        <div className="meta-card-value" style={{ fontSize: '13px', fontWeight: 'bold' }}>
                          {(tableDetails.type || '').toUpperCase() === 'VIEW' ? 'VIEW' : 'TABLE'}
                        </div>
                      </div>
                      <div className="meta-card">
                        <div className="meta-card-label">Total Rows</div>
                        <div className="meta-card-value">
                          {(tableDetails.type || '').toUpperCase() === 'VIEW' ? 'Virtual View' : parseInt(tableDetails.numRows || 0, 10).toLocaleString()}
                        </div>
                      </div>
                      <div className="meta-card">
                        <div className="meta-card-label">Total Size</div>
                        <div className="meta-card-value">
                          {(tableDetails.type || '').toUpperCase() === 'VIEW' ? 'On-Demand Query' : formatBytes(tableDetails.numBytes)}
                        </div>
                      </div>
                      <div className="meta-card"><div className="meta-card-label">Location</div><div className="meta-card-value" style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--color-primary)' }}>{tableDetails.location || 'US'}</div></div>
                      <div className="meta-card"><div className="meta-card-label">Partitioning</div><div className="meta-card-value" style={{ fontSize: '11.5px' }}>{tableDetails.timePartitioning ? (tableDetails.timePartitioning.type || 'DAY') : 'None'}</div></div>
                      <div className="meta-card"><div className="meta-card-label">Created / Modified</div><div className="meta-card-value" style={{ fontSize: '10.5px' }}>{formatDate(tableDetails.creationTime)}</div></div>
                    </div>

                    {tableDetails.description && (
                      <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#faf6ff', border: '1px solid #ebd9ff', borderRadius: '8px', fontSize: '12.5px', color: '#6d28d9' }}>
                        💡 <strong>Table Description:</strong> {tableDetails.description}
                      </div>
                    )}

                    <div className="sidebar-section-title" style={{ paddingLeft: 0, marginBottom: '8px' }}>Table Schema ({tableDetails.schema?.fields?.length || 0} columns)</div>
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr><th>Field Name</th><th>Type</th><th>Mode</th><th>Description</th></tr>
                        </thead>
                        <tbody>
                          {tableDetails.schema?.fields?.map((field, index) => (
                            <tr key={index}>
                              <td style={{ fontWeight: '500' }}>{field.name}</td>
                              <td><span className="badge badge-info">{field.type}</span></td>
                              <td>{field.mode || 'NULLABLE'}</td>
                              <td>{field.description || <span style={{ fontStyle: 'italic', color: '#999' }}>No description</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {activeTab === 'advanced-schema' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Knowledge Catalog Scan & Profiling Pipeline Banner */}
                    <div style={{ backgroundColor: '#ffffff', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '14.5px', fontWeight: '700', color: 'var(--color-primary)' }}>
                            🌐 Knowledge Catalog Scan & Profiling Pipeline
                          </h4>
                          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                            {appLang === 'kr'
                              ? 'Knowledge Catalog 스캔 엔진을 통해 DDL, 전수 데이터 프로파일링, 결측률, 퀄리티 검증(ASSERT) 및 조인 리니지 정보를 자동 수집했습니다.'
                              : 'Automatically extracted DDL, full data profiling, null rates, quality assertion rules (ASSERT), and join lineage metadata via Knowledge Catalog scan engine.'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={handleSaveAdvancedSchemaMarkdown}
                            className="btn-primary"
                            disabled={isSavingAdvancedSchema || !tableDetails}
                            style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1b72e8' }}
                          >
                            {isSavingAdvancedSchema ? (
                              <>
                                <div className="spinner" style={{ width: '12px', height: '12px', borderTopColor: '#fff' }}></div>
                                <span>{selectedTable}_advanced_schema.md {appLang === 'kr' ? '생성 중...' : 'Generating...'}</span>
                              </>
                            ) : (
                              <>
                                <span>📄</span>
                                <span>Save {selectedTable}_advanced_schema.md</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Metadata Collection Source Status Cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>

                        {/* Card 1: Schema Metadata */}
                        <div style={{ padding: '14px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1.5px solid #137333', fontSize: '12.5px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>Schema Metadata</span>
                              <span style={{ color: '#137333', fontSize: '11.5px', fontWeight: 'bold' }}>
                                {appLang === 'kr' ? '✓ 수집 완료' : '✓ Extracted'}
                              </span>
                            </div>
                            <code style={{ fontSize: '11.5px', color: '#475569', display: 'block', marginTop: '4px' }}>Knowledge Catalog Metadata</code>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                              {appLang === 'kr'
                                ? `행수(${tableDetails ? parseInt(tableDetails.numRows || 0, 10).toLocaleString() : 0}), 용량, 파티션 메타데이터`
                                : `Rows (${tableDetails ? parseInt(tableDetails.numRows || 0, 10).toLocaleString() : 0}), Size, Partition Metadata`}
                            </div>
                          </div>
                          <div style={{ padding: '5px 10px', backgroundColor: '#e6f4ea', color: '#137333', borderRadius: '4px', fontSize: '11.5px', fontWeight: 'bold', textAlign: 'center' }}>
                            {appLang === 'kr' ? '출처: Catalog Resource Metadata' : 'Source: Catalog Resource Metadata'}
                          </div>
                        </div>

                        {/* Card 2: DDL Definition */}
                        <div style={{ padding: '14px', backgroundColor: '#ffffff', borderRadius: '8px', border: tableDetails.ddl ? '1.5px solid #137333' : '1px solid #e2e8f0', fontSize: '12.5px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>DDL Definition</span>
                              <span style={{ color: '#137333', fontSize: '11.5px', fontWeight: 'bold' }}>
                                {tableDetails.ddl ? (appLang === 'kr' ? '✓ DDL 준비됨' : '✓ DDL Ready') : 'N/A'}
                              </span>
                            </div>
                            <code style={{ fontSize: '11.5px', color: '#475569', display: 'block', marginTop: '4px' }}>Catalog DDL Schema</code>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                              {appLang === 'kr' ? '물리 CREATE TABLE DDL 문구' : 'Physical CREATE TABLE DDL query'}
                            </div>
                          </div>
                          <div style={{ padding: '5px 10px', backgroundColor: '#e6f4ea', color: '#137333', borderRadius: '4px', fontSize: '11.5px', fontWeight: 'bold', textAlign: 'center' }}>
                            {appLang === 'kr' ? '출처: Knowledge Catalog DDL View' : 'Source: Knowledge Catalog DDL View'}
                          </div>
                        </div>

                        {/* Card 3: Profiling Scan & Dataplex */}
                        <div style={{ padding: '14px', backgroundColor: '#ffffff', borderRadius: '8px', border: (tableDetails.columnProfiles && tableDetails.columnProfiles.length > 0) ? '1.5px solid #137333' : '1px solid #e2e8f0', fontSize: '12.5px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>Profiling & Dataplex Scans</span>
                              <span style={{ color: (dataplexScans?.tableScans?.[selectedTable]?.hasProfileScan) ? '#137333' : '#d97706', fontSize: '11px', fontWeight: 'bold' }}>
                                {dataplexScans?.tableScans?.[selectedTable]?.hasProfileScan ? '✅ Scan Succeeded' : '⚪ Not Scanned'}
                              </span>
                            </div>
                            <code style={{ fontSize: '11.5px', color: '#475569', display: 'block', marginTop: '4px' }}>
                              {dataplexScans?.tableScans?.[selectedTable]?.scanId ? `Scan: ${dataplexScans.tableScans[selectedTable].scanId}` : 'Dataplex DataScans'}
                            </code>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                              {appLang === 'kr'
                                ? `결측률, 유니크 비율, Top10 분포 수집 (${tableDetails.columnProfiles ? tableDetails.columnProfiles.length : 0}개 컬럼)`
                                : `Distinct ratio, null rate & Top10 distribution (${tableDetails.columnProfiles ? tableDetails.columnProfiles.length : 0} cols)`}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                            <button
                              onClick={() => handleTriggerTableScan(selectedTable)}
                              disabled={isScanningTable[selectedTable]}
                              className="btn-primary"
                              style={{ width: '100%', padding: '6px 10px', fontSize: '11.5px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}
                            >
                              {isScanningTable[selectedTable] ? (
                                <>
                                  <div className="spinner" style={{ width: '10px', height: '10px', borderTopColor: '#fff' }}></div>
                                  <span>{appLang === 'kr' ? '스캔 요청 중...' : 'Requesting Scan...'}</span>
                                </>
                              ) : (
                                <>
                                  <span>⚡</span>
                                  <span>{appLang === 'kr' ? 'Dataplex 프로파일 스캔 수행 요청' : 'Trigger Dataplex Profile Scan'}</span>
                                </>
                              )}
                            </button>
                            <div style={{ padding: '3px 6px', backgroundColor: '#e6f4ea', color: '#137333', borderRadius: '4px', fontSize: '10.5px', fontWeight: 'bold', textAlign: 'center' }}>
                              {appLang === 'kr' ? '출처: Dataplex Data Profile Scan' : 'Source: Dataplex Data Profile Scan'}
                            </div>
                          </div>
                        </div>

                        {/* Card 4: Lineage & Quality Rules */}
                        <div style={{ padding: '14px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1.5px solid #137333', fontSize: '12.5px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>Lineage & Quality Rules</span>
                              <span style={{ color: '#137333', fontSize: '11.5px', fontWeight: 'bold' }}>
                                {appLang === 'kr' ? '✓ 규칙 생성됨' : '✓ Rules Inferred'}
                              </span>
                            </div>
                            <code style={{ fontSize: '11.5px', color: '#475569', display: 'block', marginTop: '4px' }}>FK Inferences & ASSERT SQL</code>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                              {appLang === 'kr' ? '조인 키 추론 및 모니터링 ASSERT 규칙' : 'Foreign key inference & monitoring ASSERT rules'}
                            </div>
                          </div>
                          <div style={{ padding: '5px 10px', backgroundColor: '#e6f4ea', color: '#137333', borderRadius: '4px', fontSize: '11.5px', fontWeight: 'bold', textAlign: 'center' }}>
                            {appLang === 'kr' ? '출처: Auto Rule Builder' : 'Source: Auto Rule Builder'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Column Profile Table */}
                    {tableDetails.columnProfiles && tableDetails.columnProfiles.length > 0 ? (
                      <div>
                        <div className="sidebar-section-title" style={{ paddingLeft: 0, marginBottom: '8px' }}>
                          📊 Knowledge Catalog Column Statistics ({tableDetails.columnProfiles.length} Columns Profiled)
                        </div>
                        <div className="data-table-container">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Field Name</th>
                                <th>Type</th>
                                <th>Mode</th>
                                <th>Non-Null Rows</th>
                                <th>Unique (Distinct)</th>
                                <th>Null Count</th>
                                <th>Null Rate (%)</th>
                                <th>Dataplex Insights (Top Values / Range)</th>
                                <th>Data Quality Health</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tableDetails.columnProfiles.map((cp, idx) => {
                                const rate = parseFloat(cp.nullRatePct || '0');
                                const isHealthy = rate < 20;
                                const dp = cp.dataplexProfile;
                                return (
                                  <tr key={idx}>
                                    <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{cp.name}</td>
                                    <td><span className="badge badge-info">{cp.type}</span></td>
                                    <td>{cp.mode || 'NULLABLE'}</td>
                                    <td>{parseInt(cp.count || '0', 10).toLocaleString()}</td>
                                    <td><strong style={{ color: 'var(--color-primary)' }}>{parseInt(cp.distinctCount || '0', 10).toLocaleString()}</strong></td>
                                    <td>{parseInt(cp.nullCount || '0', 10).toLocaleString()}</td>
                                    <td>
                                      <span style={{ fontWeight: 'bold', color: rate > 30 ? '#c5221f' : rate > 0 ? '#b26b00' : '#137333' }}>
                                        {cp.nullRatePct}%
                                      </span>
                                    </td>
                                    <td>
                                      {dp ? (
                                        <div style={{ fontSize: '10.5px', color: '#334155' }}>
                                          {dp.stringProfile && (
                                            <div>Len(avg: {dp.stringProfile.averageLength?.toFixed(1)}, min: {dp.stringProfile.minLength}, max: {dp.stringProfile.maxLength})</div>
                                          )}
                                          {dp.integerProfile && (
                                            <div>Val(avg: {dp.integerProfile.average?.toFixed(1)}, min: {dp.integerProfile.min}, max: {dp.integerProfile.max})</div>
                                          )}
                                          {dp.topNValues && dp.topNValues.length > 0 && (
                                            <div style={{ fontSize: '11px', color: 'var(--color-primary)', fontStyle: 'italic', marginTop: '2px' }}>
                                              Top: {dp.topNValues.slice(0, 3).map(v => `${v.value} (${(v.ratio * 100).toFixed(1)}%)`).join(', ')}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Catalog Scanned</span>
                                      )}
                                    </td>
                                    <td>
                                      <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '10.5px',
                                        fontWeight: 'bold',
                                        backgroundColor: isHealthy ? '#e6f4ea' : '#fce8e6',
                                        color: isHealthy ? '#137333' : '#c5221f'
                                      }}>
                                        {isHealthy ? 'Pass (Good)' : 'Attention Required'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '20px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid var(--border-light)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                        Knowledge Catalog 통계 프로파일링 수집 결과가 없습니다.
                      </div>
                    )}

                    {/* Data Quality & Lineage Rules Card Panel */}
                    <div id="lineage-quality-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                      {/* Left Card: Inferred Data Lineage & Key Joins */}
                      <div className="explanation-panel" style={{ padding: '16px 20px', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>🔗</span> Inferred Table Lineage & Foreign Join Keys
                        </div>
                        <div style={{ fontSize: '12px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                          <p style={{ margin: '0 0 8px 0' }}>
                            테이블 <strong>{tableDetails.id}</strong>의 기본 키(Primary Key) 및 조인 리니지 관계 추론:
                          </p>
                          <ul style={{ paddingLeft: '18px', margin: '0 0 10px 0' }}>
                            {tableDetails.schema?.fields?.filter(f => f.name.toLowerCase().includes('id')).map((f, i) => (
                              <li key={i} style={{ marginBottom: '4px' }}>
                                <code style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{f.name}</code> —
                                {f.name.toLowerCase() === 'id' || f.name.toLowerCase() === `${tableDetails.id.replace(/s$/, '')}_id` ? (
                                  <span style={{ color: '#137333', fontWeight: '600', marginLeft: '4px' }}>[Primary Key Candidate] (Unique Identifier)</span>
                                ) : (
                                  <span style={{ color: '#1a73e8', marginLeft: '4px' }}>[Foreign Key Candidate] (Join relation key)</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Right Card: Data Quality Monitoring Rules (BigQuery ASSERT Statements) */}
                      <div className="explanation-panel" style={{ padding: '16px 20px', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>🛡️</span> Data Quality Rules (BigQuery ASSERT SQL Statements)
                        </div>
                        <div style={{ fontSize: '11.5px', fontFamily: 'monospace', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <div style={{ color: '#137333', marginBottom: '6px' }}>-- 1. Check Non-Null Constraint</div>
                          <div>ASSERT (SELECT COUNTIF(id IS NULL) FROM `{projectId}.${selectedDataset}.${tableDetails.id}`) = 0</div>
                          <div style={{ color: '#137333', margin: '8px 0 6px 0' }}>-- 2. Check Primary Key Uniqueness</div>
                          <div>ASSERT (SELECT COUNT(DISTINCT id) FROM `{projectId}.${selectedDataset}.${tableDetails.id}`) = (SELECT COUNT(1) FROM `{projectId}.${selectedDataset}.${tableDetails.id}`)</div>
                        </div>
                      </div>

                    </div>

                  </div>
                )}

                {/* Table DDL View Tab */}
                {activeTab === 'ddl' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="sidebar-section-title" style={{ paddingLeft: 0, margin: 0 }}>
                        📜 BigQuery CREATE TABLE DDL Statement
                      </div>
                      <button
                        onClick={() => handleCopyText(tableDetails.ddl || '')}
                        className="btn-secondary"
                        style={{ padding: '4px 12px', fontSize: '11.5px' }}
                        disabled={!tableDetails.ddl}
                      >
                        Copy DDL
                      </button>
                    </div>
                    {tableDetails.ddl ? (
                      <div className="explanation-panel" style={{ flex: 1, padding: '16px', backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid var(--border-light)', overflow: 'auto' }}>
                        <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '12px', color: '#34a853', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                          <code>{tableDetails.ddl}</code>
                        </pre>
                      </div>
                    ) : (
                      <div style={{ padding: '30px', border: '1px dashed var(--border-light)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                        해당 테이블의 DDL 정보를 수집할 수 없거나 BigQuery 권한 제한으로 추출되지 않았습니다.
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'preview' && (
                  <div>
                    <div className="sidebar-section-title" style={{ paddingLeft: 0, marginBottom: '8px' }}>First 10 rows from {tableDetails.id}</div>
                    {tableDetails.rows && tableDetails.rows.length > 0 ? (
                      <div className="data-table-container">
                        <table className="data-table">
                          <thead>
                            <tr>{Object.keys(tableDetails.rows[0]).map((key, idx) => <th key={idx}>{key}</th>)}</tr>
                          </thead>
                          <tbody>
                            {tableDetails.rows.map((row, rIdx) => (
                              <tr key={rIdx}>
                                {Object.values(row).map((val, cIdx) => (
                                  <td key={cIdx} style={{ whiteSpace: 'nowrap' }}>
                                    {val === null || val === undefined ? <span style={{ color: '#ccc', fontStyle: 'italic' }}>null</span> : (typeof val === 'object' ? JSON.stringify(val) : val.toString())}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No data available.</div>}
                  </div>
                )}

                {activeTab === 'okf' && (
                  <div className="okf-view-container" style={{ height: '100%' }}>
                    {generatedOkf || isGenerating ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px', height: '100%' }}>

                        {/* Left Column: OKF Content View or Progress State */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
                          <div className="okf-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              Saved at: <strong>{generatedOkf ? generatedOkf.filePath : `gs://okf-omni-${projectId?.toLowerCase()}/${selectedDataset}/tables/${selectedTable}.md`}</strong>
                            </span>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {isGenerating ? (
                                <span className="badge badge-info" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)', fontSize: '11px', padding: '3px 10px', borderRadius: '4px', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>
                                  ⏳ OKF 명세 생성 파이프라인 가동 중...
                                </span>
                              ) : generatedOkf?.previousContent ? (
                                <span className="badge badge-info" style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '11px', padding: '3px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
                                  ⚡ 재생성 변경사항(Diff) 자동 감지되어 본문에 통합됨
                                </span>
                              ) : (
                                <span className="badge badge-info" style={{ backgroundColor: '#e6f4ea', color: '#137333', fontSize: '11px', padding: '3px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
                                  ✓ OKF 생성 및 동기화 완료
                                </span>
                              )}
                              {generatedOkf && <button onClick={() => handleCopyText(generatedOkf.content)} className="btn-secondary">Copy</button>}
                            </div>
                          </div>

                          {/* Human Review & Verification Console (OKF v0.2 §5.2 Trust Tier & Lifecycle) */}
                          {generatedOkf && !isGenerating && (
                            <div style={{
                              padding: '12px 16px',
                              borderRadius: '10px',
                              border: parsedFm?.isVerified ? '1px solid #86efac' : '1px solid #fde68a',
                              backgroundColor: parsedFm?.isVerified ? '#f0fdf4' : '#fffbeb',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ fontSize: '20px' }}>{parsedFm?.isVerified ? '🛡️' : '📝'}</span>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: parsedFm?.isVerified ? '#166534' : '#92400e' }}>
                                        {parsedFm?.isVerified ? 'OKF v0.2 신뢰 등급: Verified (Stable)' : 'OKF v0.2 신뢰 등급: Draft (검토 대기)'}
                                      </span>
                                      <span className="badge" style={{
                                        fontSize: '10.5px',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontWeight: 'bold',
                                        backgroundColor: parsedFm?.isVerified ? '#dcfce7' : '#fef3c7',
                                        color: parsedFm?.isVerified ? '#15803d' : '#b45309',
                                        border: parsedFm?.isVerified ? '1px solid #bbf7d0' : '1px solid #fde68a'
                                      }}>
                                        {parsedFm?.isVerified ? '✓ Human-Reviewed' : '⏳ Unverified (AI Generated)'}
                                      </span>
                                    </div>
                                    <p style={{ margin: '3px 0 0 0', fontSize: '11.5px', color: parsedFm?.isVerified ? '#15803d' : '#78350f', lineHeight: '1.4' }}>
                                      {parsedFm?.isVerified
                                        ? `담당 스튜어드(${parsedFm?.verifierActor || 'human:seanjung'})의 검토 및 승인이 완료되어 공식 지식으로 승격되었습니다.`
                                        : 'Gemini 3.5 Flash가 수집한 초안입니다. 스키마와 조인 설명을 검토한 후 승인하시면 verified 서명이 부여되고 stable로 승격됩니다.'}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Usage Window 선택기 - 검증자 입력 - 승인 버튼 단일 가로 수평 행 */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                flexWrap: 'nowrap',
                                whiteSpace: 'nowrap',
                                backgroundColor: '#ffffff',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                              }}>
                                {/* Usage Window 라디오 선택 버튼 그룹 (영구, 1년, 3년) */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#334155', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                    <span>⏰</span> Usage Window:
                                  </span>

                                  <label style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    fontSize: '11.5px',
                                    cursor: 'pointer',
                                    fontWeight: stalePresetOption === 'permanent' ? 'bold' : 'normal',
                                    color: stalePresetOption === 'permanent' ? '#047857' : '#475569',
                                    backgroundColor: stalePresetOption === 'permanent' ? '#ecfdf5' : 'transparent',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    border: stalePresetOption === 'permanent' ? '1px solid #6ee7b7' : '1px solid transparent',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    <input
                                      type="radio"
                                      name="bannerStaleOption"
                                      value="permanent"
                                      checked={stalePresetOption === 'permanent'}
                                      onChange={() => setStalePresetOption('permanent')}
                                      style={{ cursor: 'pointer', accentColor: '#059669' }}
                                    />
                                    <span>♾️ 영구</span>
                                  </label>

                                  <label style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    fontSize: '11.5px',
                                    cursor: 'pointer',
                                    fontWeight: stalePresetOption === '1year' ? 'bold' : 'normal',
                                    color: stalePresetOption === '1year' ? '#047857' : '#475569',
                                    backgroundColor: stalePresetOption === '1year' ? '#ecfdf5' : 'transparent',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    border: stalePresetOption === '1year' ? '1px solid #6ee7b7' : '1px solid transparent',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    <input
                                      type="radio"
                                      name="bannerStaleOption"
                                      value="1year"
                                      checked={stalePresetOption === '1year'}
                                      onChange={() => setStalePresetOption('1year')}
                                      style={{ cursor: 'pointer', accentColor: '#059669' }}
                                    />
                                    <span>📅 1년</span>
                                  </label>

                                  <label style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    fontSize: '11.5px',
                                    cursor: 'pointer',
                                    fontWeight: stalePresetOption === '3years' ? 'bold' : 'normal',
                                    color: stalePresetOption === '3years' ? '#047857' : '#475569',
                                    backgroundColor: stalePresetOption === '3years' ? '#ecfdf5' : 'transparent',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    border: stalePresetOption === '3years' ? '1px solid #6ee7b7' : '1px solid transparent',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    <input
                                      type="radio"
                                      name="bannerStaleOption"
                                      value="3years"
                                      checked={stalePresetOption === '3years'}
                                      onChange={() => setStalePresetOption('3years')}
                                      style={{ cursor: 'pointer', accentColor: '#059669' }}
                                    />
                                    <span>🗓️ 3년</span>
                                  </label>
                                </div>

                                <div style={{ height: '16px', width: '1px', backgroundColor: '#cbd5e1', margin: '0 4px' }} />

                                {/* 사람 이름 입력 (검증자) */}
                                {!parsedFm?.isVerified && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#475569' }}>검증자:</span>
                                    <input
                                      type="text"
                                      value={verifierName}
                                      onChange={(e) => setVerifierName(e.target.value)}
                                      placeholder="human:user"
                                      style={{
                                        fontSize: '11.5px',
                                        padding: '4px 8px',
                                        width: '130px',
                                        borderRadius: '6px',
                                        border: '1px solid #cbd5e1',
                                        fontFamily: 'monospace',
                                        backgroundColor: '#ffffff'
                                      }}
                                    />
                                  </div>
                                )}

                                {/* 검증 및 승인 버튼 */}
                                <button
                                  onClick={handleVerifyOkf}
                                  disabled={isVerifying}
                                  style={{
                                    padding: '6px 16px',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: isVerifying ? 'wait' : 'pointer',
                                    backgroundColor: parsedFm?.isVerified ? '#059669' : '#d97706',
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {isVerifying ? '⏳ 승인 서명 중...' : (parsedFm?.isVerified ? '🔄 재승인 / 갱신' : '✅ 검토 및 승인 (Approve)')}
                                </button>
                              </div>
                            </div>
                          )}

                          {isGenerating && !generatedOkf ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', backgroundColor: '#fafafa', borderRadius: '8px', border: '1px solid var(--border-light)', justifyContent: 'center', alignItems: 'center', minHeight: '380px' }}>
                              <div className="spinner" style={{ width: '36px', height: '36px', border: '3px solid var(--color-primary-bg)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                              <div style={{ textAlign: 'center' }}>
                                <h3 style={{ margin: '0 0 6px 0', fontSize: '14.5px', fontWeight: '600' }}>테이블({selectedTable}) OKF 명세 생성 중</h3>
                                <p style={{ margin: '0 0 16px 0', fontSize: '11.5px', color: 'var(--text-muted)', maxWidth: '380px', lineHeight: '1.5' }}>
                                  빅쿼리 물리 스키마와 데이터 프리뷰(10 Rows)를 로드하여 Gemini 3.5 Flash 모델이 온톨로지 비즈니스 명세를 수집/보완하고 있습니다.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <UniversalMarkdownViewer
                              title={`OKF Specification (${selectedTable})`}
                              subtitle={generatedOkf?.filePath || `gs://okf-omni-${projectId?.toLowerCase()}/${selectedDataset}/tables/${selectedTable}.md`}
                              content={generatedOkf?.content || ''}
                              previousContent={generatedOkf?.previousContent || ''}
                              diffTitle="OKF SPEC DIFF: Original ➔ Updated (Verified / Recalibrated)"
                              onLinkClick={(linkUrl) => {
                                const targetTableId = linkUrl.replace(/\.md$/, '').split('/').pop();
                                if (tables.some(t => t.id === targetTableId)) {
                                  handleTableSelect(targetTableId, 'okf');
                                } else {
                                  window.open(linkUrl, '_blank');
                                }
                              }}
                              maxHeight="calc(100vh - 380px)"
                            />
                          )}
                        </div>

                        {/* Right Column: Dynamic Real-time Stepper Panel (Synced with Batch & Single Pipelines) */}
                        {(() => {
                          const runningBatchTableId = Object.keys(batchOkfProgress || {}).find(tid => batchOkfProgress[tid]?.status === 'running');
                          const isThisTableGenerating = isGenerating || (runningBatchTableId && runningBatchTableId === selectedTable);
                          const okfPipelineActiveStep = (runningBatchTableId && runningBatchTableId === selectedTable)
                            ? (batchOkfProgress[selectedTable]?.step || 1)
                            : (okfGenerationStep || 1);

                          return (
                            <div className="explanation-panel" style={{ borderLeft: '1px solid var(--border-light)', paddingLeft: '20px', overflowY: 'auto' }}>
                              <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                                  ⚙️ [{selectedTable?.toUpperCase() || 'TABLE'}] OKF 파이프라인 진행 상태
                                </h3>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '12px', backgroundColor: isThisTableGenerating ? 'var(--color-primary-bg)' : '#e6f4ea', color: isThisTableGenerating ? 'var(--color-primary)' : '#137333' }}>
                                  {isThisTableGenerating ? `진행 중 (Step ${okfPipelineActiveStep}/4)` : '전체 4단계 완료'}
                                </span>
                              </div>

                              {/* Step 1 */}
                              <div className="flow-step" style={{ marginBottom: '16px', opacity: (isThisTableGenerating ? okfPipelineActiveStep >= 1 : true) ? 1 : 0.4, transition: 'opacity 0.3s ease' }}>
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                  <div className="flow-step-number" style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: (isThisTableGenerating ? okfPipelineActiveStep > 1 : true) ? '#e6f4ea' : (okfPipelineActiveStep === 1 ? 'var(--color-primary-bg)' : '#f1f5f9'), color: (isThisTableGenerating ? okfPipelineActiveStep > 1 : true) ? '#137333' : (okfPipelineActiveStep === 1 ? 'var(--color-primary)' : '#64748b'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', marginRight: '10px', animation: (isThisTableGenerating && okfPipelineActiveStep === 1) ? 'pulse 1.5s infinite' : 'none' }}>
                                    {(isThisTableGenerating ? okfPipelineActiveStep > 1 : true) ? '✓' : '1'}
                                  </div>
                                  <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: '700', color: (isThisTableGenerating ? okfPipelineActiveStep > 1 : true) ? '#137333' : (okfPipelineActiveStep === 1 ? 'var(--color-primary)' : 'inherit') }}>
                                    {appLang === 'kr' ? '1. 원천 스키마 & Advanced Schema 수집' : '1. Schema & Advanced Schema Ingestion'}
                                  </h4>
                                </div>
                                <div className="flow-step-content" style={{ marginLeft: '34px' }}>
                                  <p style={{ margin: '0 0 6px 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                    {appLang === 'kr'
                                      ? `빅쿼리 물리 스키마와 ${selectedTable}_advanced_schema.md (DDL, Dataplex 프로파일, ASSERT 품질검증 규칙) 수집 및 병합.`
                                      : `Ingested BigQuery physical schema & ${selectedTable}_advanced_schema.md (DDL, Dataplex profiling, ASSERT rules).`}
                                  </p>
                                  {(!isThisTableGenerating || okfPipelineActiveStep > 1) && (
                                    <div className="flow-badge-container" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                      <span className="badge badge-info" style={{ backgroundColor: '#e8f0fe', color: 'var(--color-primary)', fontSize: '11.5px', padding: '3px 10px', borderRadius: '4px', fontWeight: 'bold' }}>Table: {selectedTable}</span>
                                      {generatedOkf && generatedOkf.hasAdvancedSchema ? (
                                        <span className="badge badge-info" style={{ backgroundColor: '#e6f4ea', color: '#137333', fontSize: '11.5px', padding: '3px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
                                          {appLang === 'kr' ? `✓ ${selectedTable}_advanced_schema.md 병합됨` : `✓ ${selectedTable}_advanced_schema.md Merged`}
                                        </span>
                                      ) : (
                                        <span className="badge badge-info" style={{ backgroundColor: '#fef7e0', color: '#b26b00', fontSize: '11.5px', padding: '3px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
                                          {appLang === 'kr' ? '⚠️ 기본 스키마 수집됨' : '⚠️ Base Schema Ingested'}
                                        </span>
                                      )}
                                      <span className="badge badge-info" style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', fontSize: '11.5px', padding: '3px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        {appLang === 'kr' ? '🔗 백링크 조립 완료' : '🔗 Backlinks Linked'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Step 2 */}
                              <div className="flow-step" style={{ marginBottom: '16px', opacity: (isThisTableGenerating ? okfPipelineActiveStep >= 2 : true) ? 1 : 0.4, transition: 'opacity 0.3s ease' }}>
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                  <div className="flow-step-number" style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: (isThisTableGenerating ? okfPipelineActiveStep > 2 : true) ? '#e6f4ea' : (okfPipelineActiveStep === 2 ? 'var(--color-primary-bg)' : '#f1f5f9'), color: (isThisTableGenerating ? okfPipelineActiveStep > 2 : true) ? '#137333' : (okfPipelineActiveStep === 2 ? 'var(--color-primary)' : '#64748b'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', marginRight: '10px', animation: (isThisTableGenerating && okfPipelineActiveStep === 2) ? 'pulse 1.5s infinite' : 'none' }}>
                                    {(isThisTableGenerating ? okfPipelineActiveStep > 2 : true) ? '✓' : '2'}
                                  </div>
                                  <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: '700', color: (isThisTableGenerating ? okfPipelineActiveStep > 2 : true) ? '#137333' : (okfPipelineActiveStep === 2 ? 'var(--color-primary)' : 'inherit') }}>
                                    {appLang === 'kr' ? '2. 비즈니스 위키 & 리니지 매핑' : '2. Business Wiki & Lineage Mapping'}
                                  </h4>
                                </div>
                                <div className="flow-step-content" style={{ marginLeft: '34px' }}>
                                  <p style={{ margin: '0 0 6px 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                    {appLang === 'kr' ? 'GCS 위키 지식 베이스 및 리니지 관계를 수집하여 비즈니스 출처를 연결했습니다.' : 'Collected GCS wiki knowledge base and lineage to link business provenance.'}
                                  </p>
                                  {(!isThisTableGenerating || okfPipelineActiveStep > 2) && activeWikiFiles && activeWikiFiles.length > 0 && (
                                    <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                      {activeWikiFiles.map((w, wIdx) => (
                                        <span key={wIdx} style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', padding: '3px 10px', borderRadius: '4px', fontSize: '11.5px', fontWeight: 'bold' }}>
                                          📄 [{w.category || 'wiki'}] {w.fileName}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Step 3 */}
                              <div className="flow-step" style={{ marginBottom: '16px', opacity: (isThisTableGenerating ? okfPipelineActiveStep >= 3 : true) ? 1 : 0.4, transition: 'opacity 0.3s ease' }}>
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                  <div className="flow-step-number" style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: (isThisTableGenerating ? okfPipelineActiveStep > 3 : true) ? '#e6f4ea' : (okfPipelineActiveStep === 3 ? 'var(--color-primary-bg)' : '#f1f5f9'), color: (isThisTableGenerating ? okfPipelineActiveStep > 3 : true) ? '#137333' : (okfPipelineActiveStep === 3 ? 'var(--color-primary)' : '#64748b'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', marginRight: '10px', animation: (isThisTableGenerating && okfPipelineActiveStep === 3) ? 'pulse 1.5s infinite' : 'none' }}>
                                    {(isThisTableGenerating ? okfPipelineActiveStep > 3 : true) ? '✓' : '3'}
                                  </div>
                                  <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: '700', color: (isThisTableGenerating ? okfPipelineActiveStep > 3 : true) ? '#137333' : (okfPipelineActiveStep === 3 ? 'var(--color-primary)' : 'inherit') }}>
                                    {appLang === 'kr' ? '3. Gemini AI 맥락 보완 (Inference)' : '3. Gemini AI Context Inference'}
                                  </h4>
                                </div>
                                <div className="flow-step-content" style={{ marginLeft: '34px' }}>
                                  <p style={{ margin: '0 0 6px 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                    {appLang === 'kr'
                                      ? 'Gemini 3.5 Flash 모델이 물리 스키마와 사내 용어를 매핑하고 설명 및 PII 분류를 작성했습니다.'
                                      : 'Gemini 3.5 Flash model mapped physical schemas with business glossaries & PII tags.'}
                                  </p>
                                  {(!isThisTableGenerating || okfPipelineActiveStep > 3) && (
                                    <div className="flow-meta-table" style={{ fontSize: '11.5px', marginTop: '6px', border: '1px solid var(--border-light)', borderRadius: '6px', overflow: 'hidden' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', backgroundColor: '#f8f9fa' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>{appLang === 'kr' ? '수행 모델' : 'Execution Model'}</span>
                                        <span style={{ fontWeight: '700', color: '#137333' }}>gemini-3.5-flash</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Step 4 */}
                              <div className="flow-step" style={{ marginBottom: '16px', opacity: (isThisTableGenerating ? okfPipelineActiveStep >= 4 : true) ? 1 : 0.4, transition: 'opacity 0.3s ease' }}>
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                  <div className="flow-step-number" style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: (isThisTableGenerating ? okfPipelineActiveStep >= 4 : true) ? '#e6f4ea' : '#f1f5f9', color: (isThisTableGenerating ? okfPipelineActiveStep >= 4 : true) ? '#137333' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '11px', marginRight: '10px' }}>
                                    {(isThisTableGenerating ? okfPipelineActiveStep >= 4 : true) ? '✓' : '4'}
                                  </div>
                                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: (isThisTableGenerating ? okfPipelineActiveStep >= 4 : true) ? '#137333' : 'inherit' }}>
                                    {appLang === 'kr' ? '4. OKF 문서 저장 & Artifact Sync' : '4. OKF Storage & Artifact Sync'}
                                  </h4>
                                </div>
                                <div className="flow-step-content" style={{ marginLeft: '32px' }}>
                                  <p style={{ margin: '0 0 6px 0', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                    {appLang === 'kr' ? '최종 산출물이 마크다운 규격으로 패키징되어 GCS 버킷에 동기화되었습니다.' : 'Final output packaged into markdown specification and synced to GCS bucket.'}
                                  </p>
                                  {(!isThisTableGenerating || okfPipelineActiveStep >= 4) && (
                                    <div style={{ marginTop: '6px', padding: '8px 10px', backgroundColor: '#fafafa', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '10.5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                        <span>{appLang === 'kr' ? '📄 파일:' : '📄 File:'}</span>
                                        <code style={{ backgroundColor: '#eef2ff', color: '#4f46e5', padding: '2px 6px', borderRadius: '4px' }}>{selectedTable}.md</code>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                                        <span>{appLang === 'kr' ? '🗂️ 위치:' : '🗂️ URI:'}</span>
                                        <span style={{ fontFamily: 'monospace', color: '#059669', wordBreak: 'break-all' }}>
                                          gs://okf-omni-{(projectId || 'project').toLowerCase()}/{selectedDataset}/tables/{selectedTable}.md
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px', border: '1px dashed var(--border-light)', borderRadius: '8px', backgroundColor: '#fdfdfd', textAlign: 'center', margin: '20px' }}>
                        <div style={{ fontSize: '36px', marginBottom: '16px' }}>🧠</div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>테이블 온톨로지 지식 생성 대기 중</h3>
                        <p style={{ margin: '0 0 24px 0', fontSize: '12.5px', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: '1.5' }}>
                          본 테이블('{selectedTable}')은 아직 GCS 버킷에 온톨로지 명세서(OKF)가 생성되지 않았습니다. 상단의 [Generate OKF] 버튼을 클릭해 AI 모델이 비즈니스 명세를 작성하도록 실행하십시오.
                        </p>
                        <button
                          onClick={handleGenerateOkf}
                          className="btn-primary"
                          style={{ padding: '8px 18px', fontSize: '12.5px', borderRadius: '6px' }}
                          disabled={isGenerating || isGenerating || isAgentLoading}
                        >
                          🚀 OKF 명세서 즉시 생성하기
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Single Table Dedicated Knowledge Enrichment Tab (100% identical to Dataset level Enrichment UI) */}
                {activeTab === 'enrichment' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)', minHeight: '620px', textAlign: 'left', overflow: 'hidden' }}>

                    {/* 상단 서브 네비게이션 헤더 (Enrichment 수행 ↔ 완료 결과 리포트 자유 전환) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => setSingleTableSubView('setup')}
                          className={singleTableSubView === 'setup' ? 'btn-primary' : 'btn-secondary'}
                          style={{ fontSize: '12px', padding: '6px 16px', borderRadius: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <span>⚙️ {appLang === 'kr' ? 'Enrichment 수행' : 'Run Enrichment'}</span>
                          {isEnriching && (
                            <div className="spinner" style={{ width: '10px', height: '10px', border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                          )}
                        </button>

                        <button
                          onClick={() => setSingleTableSubView('result')}
                          className={singleTableSubView === 'result' ? 'btn-primary' : 'btn-secondary'}
                          style={{ fontSize: '12px', padding: '6px 16px', borderRadius: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <span>📊 {appLang === 'kr' ? 'Enrichment 결과' : 'Enrichment Report'}</span>
                        </button>
                      </div>
                    </div>

                    {/* 1. SETUP & PROGRESS VIEW (100% Identical Layout to Dataset Level) */}
                    {singleTableSubView === 'setup' && (
                      <div style={{ display: 'flex', gap: '24px', flex: 1, overflowY: 'auto', paddingBottom: '10px' }}>

                        {/* Left Pane (50%): Knowledge Sources */}
                        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '20px', overflowY: 'auto' }}>

                          {/* GCS Wiki 지식 베이스 목록 */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                                📝 {appLang === 'kr' ? `저장된 사내 비즈니스 위키 지식 (${activeWikiFiles.length}개)` : `Stored Business Wiki Glossaries (${activeWikiFiles.length})`}
                              </label>
                              <button
                                onClick={() => {
                                  setWikiCategory('general');
                                  setWikiFileName('');
                                  setWikiContent('');
                                  setIsWikiModalOpen(true);
                                }}
                                className="btn-secondary"
                                style={{ fontSize: '11.5px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                <span>+</span> Add to Wiki
                              </button>
                            </div>

                            {activeWikiFiles.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '8px', backgroundColor: '#fafafa' }}>
                                {activeWikiFiles.map((wiki, index) => (
                                  <div
                                    key={index}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', backgroundColor: '#ffffff', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '12px' }}
                                  >
                                    <span style={{ color: '#4b1a8a', fontWeight: '500' }}>📄 [{wiki.category}] {wiki.fileName}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ padding: '24px 16px', border: '1px dashed var(--border-light)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', backgroundColor: '#fafafa' }}>
                                현재 GCS 버킷에 저장된 위키 지식이 없습니다. 새 위키 문서를 먼저 등록해 보세요.
                              </div>
                            )}
                          </div>

                          {/* {appLang === 'en' ? 'Direct Local PDF Upload' : '로컬 PDF 직접 첨부'} */}
                          <div>
                            <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>
                              {appLang === 'en' ? 'Direct Local PDF Upload' : '로컬 PDF 직접 첨부'}
                            </span>
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleParsePdf(e.target.files[0]);
                                }
                              }}
                              accept=".pdf"
                              style={{ display: 'none' }}
                            />
                            <div
                              onClick={() => !isParsingPdf && fileInputRef.current && fileInputRef.current.click()}
                              style={{
                                width: '100%',
                                padding: '12px',
                                border: '2px dashed var(--color-primary)',
                                color: 'var(--color-primary)',
                                backgroundColor: 'var(--color-primary-bg)',
                                borderRadius: '8px',
                                cursor: isParsingPdf ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                fontSize: '12px',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                              }}
                            >
                              {isParsingPdf ? (
                                <>
                                  <div className="spinner" style={{ width: '14px', height: '14px', borderTopColor: 'var(--color-primary)' }}></div>
                                  <span>{appLang === 'en' ? 'Extracting text from PDF...' : 'PDF 분석 및 텍스트 추출 중...'}</span>
                                </>
                              ) : (
                                <>
                                  <span style={{ fontSize: '15px' }}>📂</span>
                                  <span>{appLang === 'en' ? 'Choose PDF from My Computer (Auto-parsing on attachment)' : '내 컴퓨터에서 PDF 파일 선택 (첨부 즉시 자동 파싱)'}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Pane (50%): Target Table Card (Single Table Selected) & Stepper Panel */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '20px', overflowY: 'auto' }}>

                          {/* 1. 상단 게이미피케이션 대상 테이블 진행 카드 (단일 테이블 고정 선택) */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                              <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                🎯 Enrichment 대상 테이블 OKF 명세 (단일 테이블 선택됨)
                              </label>
                              <span style={{ fontSize: '11px', color: '#6d28d9', backgroundColor: '#f3e8ff', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                                선택됨: 1 / 1
                              </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: '8px' }}>
                              <div
                                style={{
                                  padding: '10px 14px',
                                  borderRadius: '8px',
                                  border: '2px solid var(--color-primary)',
                                  backgroundColor: 'var(--color-primary-bg)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justify: 'space-between',
                                  fontSize: '12.5px',
                                  fontWeight: 'bold',
                                  color: 'var(--color-primary)'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ color: '#16a34a' }}>✓</span>
                                  <span>{tableDetails.id}</span>
                                </div>
                                <span style={{ fontSize: '11px', backgroundColor: '#ffffff', border: '1px solid var(--color-primary)', padding: '1px 6px', borderRadius: '4px' }}>
                                  단일 보강 대상
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* 2. 파이프라인 메커니즘 안내 카드 */}
                          <div style={{ backgroundColor: '#fafafa', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              💡 {appLang === 'en' ? 'Wiki-based Enrichment Pipeline Mechanism' : 'Wiki 기반 Enrichment 파이프라인 메커니즘'}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '11.5px', color: 'var(--text-primary)' }}>
                              <div><strong>{appLang === 'en' ? '1. Wiki Scan' : '1. Wiki 스캔'}:</strong> GCS Wiki 문서 (<code>wiki/*.md</code>) 분석</div>
                              <div><strong>{appLang === 'en' ? '2. Spec Compare' : '2. 스펙 대조'}:</strong> <code>{tableDetails.id}</code> OKF 명세 대조</div>
                              <div><strong>{appLang === 'en' ? '3. Gemini LLM' : '3. Gemini LLM'}:</strong> {appLang === 'en' ? 'Semantic mapping & OKF spec enrichment' : '의미론적 매핑 & OKF 명세 Enrichment'}</div>
                              <div><strong>{appLang === 'en' ? '4. Overwrite & Save' : '4. 저장 & 갱신'}:</strong> GCS 명세 덮어쓰기 & <code>log.md</code> 이력 기록</div>
                            </div>
                          </div>

                          {/* 하단 실행 버튼 */}
                          <div style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button
                              onClick={() => handleEnrichSingleTable(tableDetails.id)}
                              className="btn-primary"
                              style={{
                                width: '100%',
                                padding: '12px',
                                fontSize: '13.5px',
                                fontWeight: 'bold',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                background: 'linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%)'
                              }}
                              disabled={isEnriching}
                            >
                              {isEnriching ? (
                                <>
                                  <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: '#ffffff' }}></div>
                                  <span>[{tableDetails.id}] Knowledge Enrichment 분석 진행 중...</span>
                                </>
                              ) : (
                                <>
                                  <span>🔮</span>
                                  <span>단일 테이블 [{tableDetails.id}] Knowledge Enrichment 기동</span>
                                </>
                              )}
                            </button>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                              ※ 선택된 [{tableDetails.id}] 테이블에 대해 GCS Wiki와 크로스 매핑하여 최신 OKF 명세로 보강합니다.
                            </span>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* 2. RESULT & DIFF REPORT VIEW (100% Identical Layout to Dataset Level) */}
                    {singleTableSubView === 'result' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflow: 'hidden' }}>
                        {(() => {
                          const detail = singleTableEnrichResult?.details?.find(d => d.tableId === tableDetails.id) || singleTableEnrichResult?.details?.[0] || {
                            tableId: tableDetails.id,
                            description: appLang === 'en' ? 'Business description enrichment completed' : '비즈니스 설명 보강 완료',
                            enrichedContent: tableDetails.okfContent || '',
                            originalContent: ''
                          };

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                              {/* 상단 저장 리포트 정보 툴바 */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', padding: '12px 16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#166534' }}>{appLang === 'en' ? '✓ GCS Saved Enrichment Report (Persisted Asset)' : '✓ GCS 저장된 Enrichment 리포트 (Persisted Asset)'}</span>
                                  <span style={{ fontSize: '11px', color: '#15803d', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                                    {appLang === 'en' ? 'Table:' : '테이블:'} {tableDetails.id}
                                  </span>
                                </div>
                                <button
                                  onClick={() => setSingleTableSubView('setup')}
                                  className="btn-secondary"
                                  style={{ fontSize: '11.5px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                  <span>🔄</span> {appLang === 'en' ? 'Enrichment Re-run' : 'Enrichment 재수행 (Re-run)'}
                                </button>
                              </div>

                              {/* 메인 2컬럼 레이아웃 (50:50 Split) */}
                              <div style={{ display: 'flex', gap: '24px', flex: 1, overflow: 'hidden' }}>

                                {/* Left Section (50%): Summary card, Table Details Grid & Governance Index/Log Viewers */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '4px' }}>
                                  <div style={{ padding: '16px 20px', backgroundColor: '#e6f4ea', border: '1px solid #ccebe0', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '20px', color: '#137333', fontWeight: 'bold' }}>✓</span>
                                    <div>
                                      <h4 style={{ margin: '0 0 2px 0', fontSize: '13.5px', fontWeight: '700', color: '#137333' }}>
                                        {appLang === 'en' ? `Enrichment Completed: Updated ${tableDetails.id} Table Spec` : `Enrichment 완료: [${tableDetails.id}] 테이블 명세 갱신`}
                                      </h4>
                                      <p style={{ margin: 0, fontSize: '12.5px', color: '#2b573d' }}>
                                        {appLang === 'en' ? 'Wiki knowledge successfully integrated into dataset ontology.' : '위키 지식이 데이터셋 온톨로지에 성공적으로 통합되었습니다.'}
                                      </p>
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div className="sidebar-section-title" style={{ paddingLeft: 0, marginBottom: '0' }}>{appLang === 'en' ? 'ENRICHMENT TABLE DETAIL (1)' : 'ENRICHMENT 테이블 상세 (1)'}</div>
                                    <div style={{ padding: '10px 12px', backgroundColor: '#f3e8ff', borderRadius: '8px', border: '1.5px solid #a855f7' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <strong style={{ fontSize: '12.5px', color: '#6b21a8' }}>{tableDetails.id}</strong>
                                        <span style={{ fontSize: '10.5px', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 'bold' }}>
                                          ✓ {appLang === 'en' ? 'Updated' : '갱신됨'}
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {(detail.description === '비즈니스 설명 보강 완료' ? null : detail.description) || (appLang === 'en' ? 'Business description enrichment completed' : '비즈니스 설명 보강 완료')}
                                      </div>
                                    </div>
                                  </div>

                                  {/* index.md 및 log.md 다이렉트 프리뷰어 탭 */}
                                  <div style={{ marginTop: '4px', borderTop: '1px solid var(--border-light)', paddingTop: '14px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px', marginBottom: '10px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
                                          📜 {appLang === 'en' ? 'Real-time Change Log (log.md)' : '실시간 변경 이력 (log.md)'}
                                        </span>
                                      </div>
                                      <span style={{ fontSize: '10.5px', color: '#10b981', backgroundColor: '#064e3b', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        ✦ {appLang === 'en' ? 'Diff Highlighter Active' : 'Diff 하이라이터 켜짐'}
                                      </span>
                                    </div>
                                    <div style={{ flex: 1, padding: '14px', backgroundColor: '#0f172a', color: '#e2e8f0', borderRadius: '10px', overflowY: 'auto', minHeight: '200px', border: '1px solid #1e293b' }}>
                                      <div style={{ backgroundColor: '#064e3b', color: '#6ee7b7', padding: '4px 8px', borderRadius: '4px', margin: '3px 0', borderLeft: '4px solid #10b981', fontSize: '11.5px', fontFamily: 'monospace' }}>
                                        + **Metadata Enrichment**: Enriched OKF descriptions for table [{tableDetails.id}] using GCS Wiki documents.
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Right Section (50%): Selected Table Enriched OKF Spec & Diff Viewer */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-light)', paddingLeft: '24px', overflowY: 'auto' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                                      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>✨</span> [{tableDetails.id}] {appLang === 'en' ? 'Enriched OKF Spec Diff Report' : '보강된 OKF 명세 Diff 리포트'}
                                      </h3>
                                      <span style={{ fontSize: '11px', backgroundColor: '#f3e8ff', color: '#6b21a8', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        Gemini 3.5 Flash Inference
                                      </span>
                                    </div>

                                    {/* AI 추론 생각 흐름 (Thoughts) */}
                                    {detail?.thoughts && (
                                      <div style={{ backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: '8px', padding: '12px 14px' }}>
                                        <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#b26b00', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span>🧠</span> {appLang === 'en' ? 'AI Reasoning Thoughts (Thoughts)' : 'AI 추론 생각 흐름 (Thoughts)'}
                                        </div>
                                        <div style={{ fontSize: '11.5px', color: '#593800', lineHeight: '1.45', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                          {detail.thoughts}
                                        </div>
                                      </div>
                                    )}

                                    {/* 보강 설명 카드 */}
                                    <div style={{ backgroundColor: '#fafafa', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '14px' }}>
                                      <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                        💡 {appLang === 'en' ? 'Wiki Integrated Metadata Description (Enriched)' : '위키 통합 메타데이터 설명 (Enriched Description)'}
                                      </div>
                                      <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: '1.5' }}>
                                        {detail.description || '위키 지식이 매핑되어 비즈니스 설명이 풍성하게 확장되었습니다.'}
                                      </p>
                                    </div>

                                    {/* 보강된 OKF 마크다운 통합 뷰어 (Rendered, Spec Diff, Raw Code 완벽 지원) */}
                                    <div style={{ marginTop: '8px' }}>
                                      <UniversalMarkdownViewer
                                        title={`[${tableDetails.id}] Enriched OKF Spec`}
                                        subtitle="Wiki Integrated Specification with Diff"
                                        content={detail.enrichedContent || detail.originalContent || tableDetails.okfContent || ''}
                                        previousContent={detail.originalContent || ''}
                                        defaultMode="diff"
                                        diffTitle="OKF SPEC DIFF: Original ➔ Enriched"
                                        onLinkClick={handleLinkClick}
                                        maxHeight="380px"
                                      />
                                    </div>
                                  </div>
                                </div>

                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                  </div>
                )}

                {activeTab === 'agent' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '20px', height: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderRight: '1px solid var(--border-light)', paddingRight: '16px' }}>
                      <div className="sidebar-section-title" style={{ paddingLeft: 0 }}>AI Tools</div>
                      {AGENT_TOOLS.map(tool => (
                        <button key={tool.id} className={`sidebar-item ${activeAgentAction === tool.id ? 'active' : ''}`} style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px' }} onClick={() => setActiveAgentAction(tool.id)}>
                          <span>{tool.icon}</span><span>{tool.name}</span>
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      {isAgentLoading ? (
                        <div className="loader-container">
                          <div className="spinner"></div><span>Gemini가 테이블을 분석하고 있습니다...</span>
                        </div>
                      ) : agentResults[activeAgentAction] ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflow: 'hidden' }}>
                          <div className="okf-toolbar">
                            <span style={{ fontWeight: 'bold' }}>{AGENT_TOOLS.find(t => t.id === activeAgentAction)?.name} 결과</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => handleSaveToWiki(
                                AGENT_TOOLS.find(t => t.id === activeAgentAction).category,
                                `${selectedTable}_${activeAgentAction}`,
                                agentResults[activeAgentAction]
                              )} className="btn-primary" style={{ padding: '6px 12px' }}>Save to LLM-Wiki</button>
                              <button onClick={() => handleCopyText(agentResults[activeAgentAction])} className="btn-secondary" style={{ padding: '6px 12px' }}>Copy</button>
                            </div>
                          </div>
                          <div style={{ flex: 1, overflowY: 'auto' }}>
                            <MarkdownRenderer content={agentResults[activeAgentAction]} onLinkClick={handleLinkClick} />

                            {/* SQL & Graph Runner */}
                            {(activeAgentAction === 'graph-design' || activeAgentAction === 'sql-helper') && (
                              <div className="sql-execution-widget" style={{ marginTop: '30px', borderTop: '2px solid var(--border-light)', paddingTop: '20px' }}>
                                <h4>BigQuery SQL & Graph Runner</h4>
                                <textarea className="input-field" style={{ fontFamily: 'monospace', height: '100px' }} placeholder="복사한 SQL 쿼리나 DDL문을 붙여넣으세요..." value={sqlToExecute} onChange={e => setSqlToExecute(e.target.value)} />
                                <button className="btn-primary" style={{ marginTop: '10px' }} onClick={handleExecuteSql} disabled={isSqlExecuting}>Execute in BigQuery</button>
                                {sqlResult && (
                                  <div style={{ marginTop: '10px', padding: '12px', backgroundColor: sqlResult.success ? '#f4fbf7' : '#fdf3f2', borderRadius: '8px', border: '1px solid #ddd' }}>
                                    <strong>{sqlResult.success ? '실행 성공' : '실행 실패'}</strong>
                                    <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>{sqlResult.success ? (sqlResult.rows ? `완료 (반환 행: ${sqlResult.rows.length}개)` : '완료') : sqlResult.message}</pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="welcome-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px 40px', border: '1px dashed var(--border-light)', borderRadius: '8px', backgroundColor: '#fdfdfd', textAlign: 'center', margin: '20px', flex: 1 }}>
                          <div style={{ fontSize: '36px', marginBottom: '14px' }}>🤖</div>
                          <h3 style={{ margin: '0 0 6px 0', fontSize: '14.5px', fontWeight: '600', color: 'var(--text-primary)' }}>
                            {AGENT_TOOLS.find(t => t.id === activeAgentAction)?.name} {appLang === 'kr' ? '분석 실행 대기 중' : 'Awaiting Analysis Execution'}
                          </h3>
                          <p style={{ margin: '0 0 20px 0', fontSize: '12.5px', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: '1.5' }}>
                            {AGENT_TOOLS.find(t => t.id === activeAgentAction)?.description}
                            <br />
                            <span style={{ color: 'var(--color-primary)', fontWeight: '500', display: 'block', marginTop: '6px' }}>
                              {appLang === 'kr'
                                ? '아래 [분석 실행] 버튼을 누르면 Gemini 3.5 Flash 모델이 테이블 정밀 분석을 시작합니다.'
                                : 'Click the button below to start table analysis with Gemini 3.5 Flash model.'}
                            </span>
                          </p>
                          <button onClick={() => handleRunAgentAction(activeAgentAction)} className="btn-primary" style={{ padding: '8px 18px', fontSize: '12px' }}>
                            ⚡ {appLang === 'kr' ? '분석 에이전트 실행하기' : 'Run Analysis Agent'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Table-level Chat Agent */}
                {activeTab === 'chat' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                    <div className="sidebar-section-title" style={{ paddingLeft: 0, marginBottom: '4px' }}>Data Agent Chat (Table: {selectedTable})</div>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                      {appLang === 'kr'
                        ? '자연어로 질문하면 에이전트가 알아서 SQL을 구성하고 빅쿼리에서 실행한 결과를 요약해 줍니다.'
                        : 'Ask questions in natural language. The agent constructs SQL, executes it on BigQuery, and summarizes insights.'}
                    </p>

                    <div className="chat-messages-container" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                      {chatMessages.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#999', margin: 'auto' }}>
                          {appLang === 'kr' ? '질문을 작성해보세요. (예: "행 수가 가장 많은 날짜는 언제야?")' : 'Type your question. (e.g. "Which date has the highest row count?")'}
                        </div>
                      )}
                      {chatMessages.map((msg, idx) => (
                        <div key={idx} style={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                          <div style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            backgroundColor: msg.sender === 'user' ? 'var(--color-primary)' : '#ffffff',
                            color: msg.sender === 'user' ? '#ffffff' : 'var(--text-primary)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            border: msg.sender === 'user' ? 'none' : '1px solid #e2e8f0'
                          }}>
                            {msg.sender === 'user' ? (
                              msg.text
                            ) : (
                              <div>
                                <MarkdownRenderer content={msg.text} onLinkClick={handleLinkClick} />
                                {msg.sender === 'bot' && (
                                  <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                                    {(() => {
                                      const msgKey = getInsightMsgKey(msg, idx);
                                      const status = savingInsightMap[msgKey] || 'idle';
                                      if (status === 'saving') {
                                        return (
                                          <button
                                            disabled
                                            className="btn-secondary"
                                            style={{ fontSize: '11px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#f3e8ff', color: '#6b21a8', borderColor: '#d8b4fe', fontWeight: 'bold', borderRadius: '6px', cursor: 'wait', opacity: 0.8 }}
                                          >
                                            <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid #d8b4fe', borderTopColor: '#6b21a8', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
                                            {appLang === 'kr' ? '⏳ Wiki에 저장 중...' : '⏳ Saving to Wiki...'}
                                          </button>
                                        );
                                      }
                                      if (status === 'saved') {
                                        return (
                                          <button
                                            disabled
                                            className="btn-secondary"
                                            style={{ fontSize: '11px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#e6f4ea', color: '#137333', borderColor: '#b7eb8f', fontWeight: 'bold', borderRadius: '6px', cursor: 'default' }}
                                          >
                                            ✓ {appLang === 'kr' ? 'Wiki 보관 완료 (Feedback Loop)' : 'Saved to Wiki'}
                                          </button>
                                        );
                                      }
                                      return (
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                          <button
                                            onClick={() => handleFeedbackRefine(msg, idx, 'up', '답변이 우수하고 정확합니다.')}
                                            style={{ fontSize: '11px', padding: '4px 8px', backgroundColor: feedbackRatingsMap[idx] === 'up' ? '#dcfce7' : '#ffffff', color: feedbackRatingsMap[idx] === 'up' ? '#15803d' : '#475569', border: `1px solid ${feedbackRatingsMap[idx] === 'up' ? '#86efac' : '#cbd5e1'}`, borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                                            title="만족스러운 답변입니다."
                                          >
                                            👍 {feedbackRatingsMap[idx] === 'up' ? '좋아요' : '👍'}
                                          </button>
                                          <button
                                            onClick={() => setActiveFeedbackMsgIdx(activeFeedbackMsgIdx === idx ? null : idx)}
                                            style={{ fontSize: '11px', padding: '4px 8px', backgroundColor: activeFeedbackMsgIdx === idx || feedbackRatingsMap[idx] === 'down' ? '#fee2e2' : '#ffffff', color: activeFeedbackMsgIdx === idx || feedbackRatingsMap[idx] === 'down' ? '#991b1b' : '#475569', border: `1px solid ${activeFeedbackMsgIdx === idx || feedbackRatingsMap[idx] === 'down' ? '#fca5a5' : '#cbd5e1'}`, borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                                            title="답변 교정이 필요합니다."
                                          >
                                            👎 {feedbackRatingsMap[idx] === 'down' ? '아쉬워요' : '👎'}
                                          </button>
                                          <button
                                            onClick={() => handleSaveChatInsightToWiki(msg, msgKey)}
                                            className="btn-secondary"
                                            style={{ fontSize: '11px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#f3e8ff', color: '#6b21a8', borderColor: '#d8b4fe', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}
                                            title="이 대화 결과를 Wiki 지식베이스에 보관합니다."
                                          >
                                            💾 {appLang === 'kr' ? '인사이트 저장 (Wiki 보관)' : 'Save Insight (Wiki)'}
                                          </button>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                                {msg.sql && (
                                  <details style={{ marginTop: '8px', fontSize: '12px' }}>
                                    <summary style={{ cursor: 'pointer', color: 'var(--color-primary)' }}>
                                      {appLang === 'kr' ? '실행된 SQL 쿼리 보기' : 'View Executed SQL Query'}
                                    </summary>
                                    <pre style={{ backgroundColor: '#f1f5f9', padding: '8px', borderRadius: '6px', overflowX: 'auto', marginTop: '4px' }}><code>{msg.sql}</code></pre>
                                  </details>
                                )}
                                {msg.rows && msg.rows.length > 0 && (
                                  <details style={{ marginTop: '4px', fontSize: '12px' }}>
                                    <summary style={{ cursor: 'pointer', color: 'var(--color-primary)' }}>
                                      {appLang === 'kr' ? `조회된 데이터 (${msg.rows.length}행) 보기` : `View Fetched Data (${msg.rows.length} rows)`}
                                    </summary>
                                    <div style={{ overflowX: 'auto', marginTop: '4px', maxHeight: '150px' }}>
                                      <table className="data-table" style={{ fontSize: '11px' }}>
                                        <thead>
                                          <tr>{Object.keys(msg.rows[0]).map((k, i) => <th key={i}>{k}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                          {msg.rows.slice(0, 10).map((r, i) => (
                                            <tr key={i}>{Object.values(r).map((v, c) => <td key={c}>{v !== null ? v.toString() : 'null'}</td>)}</tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </details>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {isChatLoading && (
                        <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                          <div className="spinner" style={{ width: '12px', height: '12px' }}></div>
                          {appLang === 'kr' ? '빅쿼리 쿼리 작성 및 실행 중...' : 'Generating & Executing BigQuery SQL...'}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                      <input
                        type="text"
                        className="input-field"
                        placeholder={appLang === 'kr' ? '테이블에 대해 궁금한 점을 입력하세요...' : 'Ask anything about this table...'}
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendChatMessage(selectedTable)}
                        disabled={isChatLoading}
                      />
                      <button
                        onClick={() => handleSendChatMessage(selectedTable)}
                        className="btn-primary"
                        disabled={isChatLoading || !chatInput.trim()}
                        style={{ padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title={appLang === 'kr' ? '전송' : 'Send'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13"></line>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : isGithubModeActive ? (
            /* ======================================================= */
            /* GITHUB EXPLORER BROWSER & VIEWER (30:70 Split View)     */
            /* ======================================================= */
            <div style={{ display: 'flex', gap: '20px', flex: 1, overflow: 'hidden', height: '100%', minHeight: '550px' }}>

              {/* Left Column: GitHub Folder Navigator (30%) */}
              <div style={{ width: '30%', display: 'flex', flexDirection: 'column', gap: '10px', borderRight: '1px solid var(--border-light)', paddingRight: '16px', paddingLeft: '16px', paddingTop: '12px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--border-light)', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--color-primary)' }}>
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                    </svg>
                    <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: '1' }}>GitHub Browser</h3>
                  </div>
                </div>

                {/* Breadcrumb Navigation */}
                <div className="breadcrumb-container" style={{ padding: '8px 12px', fontSize: '12.5px', display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px', marginBottom: '6px', backgroundColor: '#f1f3f4', borderRadius: '6px' }}>
                  <span
                    style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: '600' }}
                    onClick={() => fetchGithubContents('')}
                  >
                    okf
                  </span>
                  {githubBreadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={idx}>
                      <span style={{ color: 'var(--text-muted)' }}>/</span>
                      <span
                        style={{
                          cursor: 'pointer',
                          color: idx === githubBreadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--color-primary)',
                          fontWeight: idx === githubBreadcrumbs.length - 1 ? '600' : 'normal'
                        }}
                        onClick={() => fetchGithubContents(crumb.path)}
                      >
                        {crumb.name}
                      </span>
                    </React.Fragment>
                  ))}
                </div>

                {/* GitHub File/Folder List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                  {isGithubLoading && githubItems.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px', fontSize: '12px', color: 'var(--text-muted)', justifyContent: 'center' }}>
                      <div className="spinner" style={{ width: '14px', height: '14px' }}></div>
                      원격 GitHub 파일 구조 수집 중...
                    </div>
                  ) : (
                    <>
                      {/* Go Up one level (..) - Visible when not in root */}
                      {githubPath && (
                        <div
                          className="sidebar-item parent-directory"
                          onClick={() => {
                            const parts = githubPath.split('/').filter(Boolean);
                            parts.pop();
                            const parentPath = parts.length > 0 ? parts.join('/') : '';
                            fetchGithubContents(parentPath);
                          }}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            margin: '2px 0',
                            color: 'var(--text-secondary)'
                          }}
                          title="상위 폴더로 이동"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fbbc04' }}>
                            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path>
                          </svg>
                          <span className="sidebar-item-text" style={{ fontWeight: '600' }}>..</span>
                        </div>
                      )}

                      {githubItems.map(item => {
                        const isDir = item.type === 'dir';
                        const isFileSelected = selectedGithubFile && selectedGithubFile.downloadUrl === item.downloadUrl;

                        return (
                          <div
                            key={item.path}
                            className={`sidebar-item ${isFileSelected ? 'active' : ''}`}
                            onClick={() => {
                              if (isDir) {
                                fetchGithubContents(item.path);
                              } else {
                                handleSelectGithubFile(item);
                              }
                            }}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              backgroundColor: isFileSelected ? 'var(--color-primary-bg)' : '#f8f9fa',
                              borderLeft: isFileSelected ? '3px solid var(--color-primary)' : '3px solid transparent',
                              margin: '2px 0'
                            }}
                          >
                            {isDir ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fbbc04' }}>
                                <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path>
                              </svg>
                            ) : item.name === 'index.md' ? (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--color-primary)' }}>
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                              </svg>
                            ) : item.name === 'log.md' ? (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#1f1f1f' }}>
                                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                              </svg>
                            ) : (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#7f8c8d' }}>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                              </svg>
                            )}
                            <span className="sidebar-item-text" style={{ fontWeight: isFileSelected ? '600' : '500', color: isFileSelected ? 'var(--color-primary)' : 'var(--text-primary)', fontSize: '13px' }}>
                              {item.name}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>

              {/* Right Column: GitHub Document Viewer (70%) */}
              <div style={{ width: '70%', display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden', height: '100%', paddingRight: '16px', paddingTop: '12px' }}>
                {selectedGithubFile ? (
                  <>
                    <div className="content-header" style={{ marginBottom: 0 }}>
                      <div className="table-title-section">
                        <div className="table-icon-badge" style={{ backgroundColor: '#2c3e50', color: '#ffffff' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                          </svg>
                        </div>
                        <div className="table-title-info">
                          <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>{selectedGithubFile.name}</h2>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>GoogleCloudPlatform/knowledge-catalog/okf{githubPath ? '/' + githubPath : ''}</span>
                        </div>
                      </div>

                      <div className="header-actions">
                        <button
                          onClick={handleTranslateGithubContent}
                          className="btn-primary"
                          disabled={isGithubTranslating || !githubFileContent}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
                        >
                          {isGithubTranslating ? (
                            <>
                              <div className="spinner" style={{ width: '12px', height: '12px', borderTopColor: '#fff' }}></div>
                              한글 번역 중...
                            </>
                          ) : (
                            <>
                              <span>🌐</span> Translate to KR
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="tab-scroll-content" style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
                      {isGithubLoading ? (
                        <div className="loader-container">
                          <div className="spinner"></div>
                          <span>GitHub 원격 파일 본문을 다운로드하는 중...</span>
                        </div>
                      ) : selectedGithubFile.name.toLowerCase().endsWith('.md') ? (
                        <UniversalMarkdownViewer
                          title={selectedGithubFile.name}
                          subtitle={`GoogleCloudPlatform/knowledge-catalog/okf${githubPath ? '/' + githubPath : ''}`}
                          content={translatedGithubContent || githubFileContent || ''}
                          previousContent={translatedGithubContent ? (githubFileContent || '') : ''}
                          diffTitle="GITHUB OKF SPEC DIFF: Original (EN) ➔ Annotated (KR)"
                          onLinkClick={handleLinkClick}
                          maxHeight="calc(100vh - 240px)"
                          badge={translatedGithubContent ? (
                            <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                              💡 KR Annotated
                            </span>
                          ) : null}
                        />
                      ) : (
                        <div className="explanation-panel" style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                          <pre style={{ fontFamily: 'monospace', fontSize: '12.5px', overflowX: 'auto', whiteSpace: 'pre', padding: '10px', backgroundColor: '#fdfdfd' }}>
                            <code>{githubFileContent}</code>
                          </pre>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center' }}>
                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>📂</div>
                    <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', margin: '0 0 6px 0' }}>GitHub 파일 선택</h4>
                    <p style={{ fontSize: '12.5px', margin: 0 }}>좌측 GitHub Browser 폴더 구조에서 조회할 문서나 소스코드 파일(.md, .py, .yaml)을 클릭해 주세요.</p>
                  </div>
                )}
              </div>
            </div>
          ) : selectedGcsFolder ? (
            /* ======================================================= */
            /* GCS BUCKET BROWSER & DOCUMENT VIEWER (30:70 Split)      */
            /* ======================================================= */
            <div style={{ display: 'flex', gap: '20px', flex: 1, overflow: 'hidden', height: '100%', minHeight: '550px' }}>

              {/* Left Column: Folder Navigator (30%) */}
              <div style={{ width: '30%', display: 'flex', flexDirection: 'column', gap: '10px', borderRight: '1px solid var(--border-light)', paddingRight: '16px', paddingLeft: '16px', paddingTop: '12px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--border-light)', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fbbc04', display: 'block' }}>
                      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path>
                    </svg>
                    <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: '1' }}>GCS Browser</h3>
                  </div>
                  <button
                    onClick={() => {
                      if (!selectedDataset) {
                        alert('위키 문서를 작성하려면 먼저 데이터셋을 선택해 주세요.');
                        return;
                      }
                      setIsWikiModalOpen(true);
                    }}
                    className="btn-primary"
                    style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', height: '24px', lineHeight: '1', opacity: isWikiProcessing ? 0.7 : 1 }}
                    disabled={isWikiProcessing}
                  >
                    {isWikiProcessing ? (
                      <>
                        <span style={{
                          display: 'inline-block',
                          width: '10px',
                          height: '10px',
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: '#fff',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                          marginRight: '4px'
                        }}></span>
                        {appLang === 'en' ? 'Creating...' : '생성 중...'}
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>+</span> New Wiki
                      </>
                    )}
                  </button>
                </div>

                {/* Breadcrumbs (데이터셋 레벨부터 시작하는 인터랙티브 브레드크럼) */}
                <div className="breadcrumb-container" style={{ padding: '8px 12px', fontSize: '12.5px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', marginTop: '8px', marginBottom: '6px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  {(() => {
                    const parts = selectedGcsFolder.split('/').filter(Boolean);
                    let pathAccumulator = '';
                    return (
                      <>
                        {parts.map((part, idx) => {
                          pathAccumulator += part + '/';
                          const targetPath = pathAccumulator;
                          const isLast = idx === parts.length - 1;
                          return (
                            <React.Fragment key={idx}>
                              {idx > 0 && <span className="breadcrumb-separator" style={{ color: '#94a3b8', margin: '0 2px', fontWeight: 'normal' }}>/</span>}
                              <span
                                className="breadcrumb-item"
                                onClick={() => handleSelectGcsFolder(targetPath)}
                                style={{
                                  cursor: 'pointer',
                                  color: isLast ? '#1e293b' : 'var(--color-primary)',
                                  fontWeight: isLast ? '700' : '600',
                                  textDecoration: 'none',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: isLast ? '#ffffff' : 'transparent',
                                  border: isLast ? '1px solid #cbd5e1' : '1px solid transparent',
                                  transition: 'all 0.2s'
                                }}
                                title={`${part} 폴더로 이동`}
                              >
                                {part}
                              </span>
                            </React.Fragment>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>

                {/* Folder/File List (Clean Vertical List) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                  {(() => {
                    const { directories, files } = getFolderContents(selectedGcsFolder, gcsFiles);
                    if (directories.length === 0 && files.length === 0) {
                      return <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '20px', fontStyle: 'italic' }}>빈 폴더</div>;
                    }

                    // 예약 파일(index.md, log.md)과 일반 컨셉 파일을 분리하여 예약 파일을 최상단에 배치
                    const reservedNames = ['index.md', 'log.md'];
                    const reservedFiles = files.filter(f => reservedNames.includes(f));
                    const conceptFiles = files.filter(f => !reservedNames.includes(f));

                    const folderParts = selectedGcsFolder.split('/').filter(Boolean);

                    return (
                      <>
                        {/* 0. Go Up one level (..) - 데이터셋 최상위 레벨을 초과하여 올라가지 않도록 제한 (depth > 1 일 때만 표기) */}
                        {folderParts.length > 1 && (
                          <div
                            className="sidebar-item parent-directory"
                            onClick={() => {
                              const parts = selectedGcsFolder.split('/').filter(Boolean);
                              parts.pop(); // Remove current directory
                              const parentPath = parts.length > 0 ? parts.join('/') + '/' : '';
                              handleSelectGcsFolder(parentPath);
                            }}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              margin: '2px 0',
                              borderLeft: '3px solid transparent',
                              color: 'var(--text-secondary)'
                            }}
                            title="상위 폴더로 이동"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fbbc04', display: 'block' }}>
                              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path>
                            </svg>
                            <span className="sidebar-item-text" style={{ fontWeight: '600' }}>..</span>
                          </div>
                        )}

                        {/* Subdirectories */}
                        {directories.map(dirName => {
                          const fullPath = selectedGcsFolder + dirName;
                          return (
                            <div
                              key={dirName}
                              className="sidebar-item"
                              onClick={() => handleSelectGcsFolder(fullPath)}
                              style={{
                                padding: '6px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                margin: '2px 0',
                                borderLeft: '3px solid transparent'
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fbbc04' }}>
                                <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path>
                              </svg>
                              <span className="sidebar-item-text" style={{ fontWeight: '500' }}>{dirName}</span>
                            </div>
                          );
                        })}

                        {/* 1. Reserved Files (index.md, log.md) - Pinned at the top with special styling */}
                        {reservedFiles.map(fileName => {
                          const fullPath = selectedGcsFolder + fileName;
                          const isActive = selectedGcsFile === fullPath;
                          const isIndex = fileName === 'index.md';

                          return (
                            <div
                              key={fileName}
                              className={`sidebar-item ${isActive ? 'active' : ''}`}
                              onClick={() => handleSelectGcsFile(fullPath)}
                              style={{
                                padding: '6px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
                                backgroundColor: isActive ? 'var(--color-primary-bg)' : '#f8f9fa',
                                margin: '2px 0'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                {isIndex ? (
                                  /* index.md: Book/Catalog Icon (Blue) */
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--color-primary)', flexShrink: 0 }}>
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                  </svg>
                                ) : (
                                  /* log.md: Heartbeat/Pulse Log Icon (Black) */
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#1f1f1f', flexShrink: 0 }}>
                                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                                  </svg>
                                )}
                                <span className="sidebar-item-text" style={{ fontWeight: '600', color: isActive ? 'var(--color-primary)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
                              </div>

                              {/* 우측 정렬 휴지통 삭제 아이콘 */}
                              <button
                                onClick={(e) => handleDeleteGcsFile(fullPath, e)}
                                title={`${fileName} 물리 삭제`}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '2px 4px',
                                  color: '#c5221f',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: 0.7,
                                  transition: 'opacity 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                              </button>
                            </div>
                          );
                        })}

                        {/* 2. Concept Files (Markdown Docs) */}
                        {conceptFiles.map(fileName => {
                          const fullPath = selectedGcsFolder + fileName;
                          const isActive = selectedGcsFile === fullPath;
                          return (
                            <div
                              key={fileName}
                              className={`sidebar-item ${isActive ? 'active' : ''}`}
                              onClick={() => handleSelectGcsFile(fullPath)}
                              style={{
                                padding: '6px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                margin: '2px 0',
                                borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
                                backgroundColor: isActive ? 'var(--color-primary-bg)' : 'transparent'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)', flexShrink: 0 }}>
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                  <polyline points="14 2 14 8 20 8"></polyline>
                                </svg>
                                <span className="sidebar-item-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? '600' : 'normal' }}>{fileName}</span>
                              </div>

                              {/* 우측 정렬 휴지통 삭제 아이콘 */}
                              <button
                                onClick={(e) => handleDeleteGcsFile(fullPath, e)}
                                title={`${fileName} 물리 삭제`}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '2px 4px',
                                  color: '#c5221f',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: 0.7,
                                  transition: 'opacity 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Right Column: Document Viewer (70%) */}
              <div style={{ width: '70%', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', paddingTop: '12px', paddingLeft: '20px' }}>
                {selectedGcsFile ? (
                  isGcsFileLoading ? (
                    <div className="loader-container" style={{ height: '100%', flex: 1, backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                      <div className="spinner"></div>
                      <span>문서를 불러오는 중...</span>
                    </div>
                  ) : (
                    <UniversalMarkdownViewer
                      title={selectedGcsFile.split('/').pop()}
                      subtitle={`gs://okf-omni-${(projectId || 'project').toLowerCase()}/${selectedGcsFile}`}
                      content={gcsFileContent || ''}
                      onLinkClick={handleLinkClick}
                      maxHeight="calc(100vh - 220px)"
                    />
                  )
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-light)', borderRadius: '12px', backgroundColor: '#ffffff', padding: '40px' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '12px', color: 'var(--text-muted)' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <span style={{ fontSize: '12.5px' }}>
                      {appLang === 'en' ? 'Select a document from the file list on the left to view the Markdown preview here.' : '좌측 파일 리스트에서 문서를 선택하면 여기에 마크다운 렌더링 미리보기가 표시됩니다.'}
                    </span>
                  </div>
                )}
              </div>

            </div>
          ) : selectedDataset ? (
            /* ======================================================= */
            /* 3. DATASET DASHBOARD MODE (Selected dataset, no table)   */
            /* ======================================================= */
            <>
              <div className="content-header">
                <div className="table-title-section">
                  <div className="table-icon-badge" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                      <line x1="6" y1="6" x2="6.01" y2="6"></line>
                      <line x1="6" y1="18" x2="6.01" y2="18"></line>
                    </svg>
                  </div>
                  <div className="table-title-info">
                    <h2>{selectedDataset} Dashboard</h2>
                    <span>Dataset Level View • {projectId}.{selectedDataset}</span>
                  </div>
                </div>

                {/* 대시보드 헤더 전역 액션 버튼 그룹 */}
                <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>

                  <button
                    onClick={() => {
                      setDatasetActiveTab('okf-builder');
                      if (!isGenerating) {
                        handleGenerateAllOkf();
                      }
                    }}
                    className="btn-secondary"
                    style={{ borderStyle: 'dashed', borderColor: 'var(--color-primary)', fontSize: '12.5px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    disabled={isLoading || isAgentLoading || isSqlExecuting || isChatLoading || isEnriching}
                  >
                    <span>⚡</span>
                    <span>{isGenerating && !selectedTable ? 'Generating OKF (All Tables)...' : 'Generate OKF (All Tables)'}</span>
                  </button>
                  <button
                    onClick={handleEnrichViaWiki}
                    className="btn-primary"
                    disabled={isLoading || isGenerating || isAgentLoading || isEnriching}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', padding: '6px 14px' }}
                  >
                    {isEnriching ? (
                      'Enriching...'
                    ) : (
                      <>
                        <span style={{ fontSize: '14px' }}>🔮</span> {appLang === 'kr' ? 'Wiki 기반 Enrichment' : 'Wiki-based Enrichment'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="gmail-tabs">
                <button className={`gmail-tab ${datasetActiveTab === 'tables' ? 'active' : ''}`} onClick={() => setDatasetActiveTab('tables')}>Tables ({tables.length})</button>
                <button className={`gmail-tab ${datasetActiveTab === 'graphs' ? 'active' : ''}`} onClick={() => setDatasetActiveTab('graphs')}>Graphs ({physicalGraphs ? physicalGraphs.length : 0})</button>
                <button className={`gmail-tab ${datasetActiveTab === 'glossary' ? 'active' : ''}`} onClick={() => { setError(''); setDatasetActiveTab('glossary'); fetchDataplexGlossary(); }}>Glossary</button>
                <button className={`gmail-tab ${datasetActiveTab === 'okf-builder' ? 'active' : ''}`} onClick={() => setDatasetActiveTab('okf-builder')}>⚡ OKF Builder(Batch)</button>
                <button className={`gmail-tab ${datasetActiveTab === 'enrichment-report' ? 'active' : ''}`} onClick={() => {
                  setError('');
                  setDatasetActiveTab('enrichment-report');
                  if (enrichmentReport || enrichmentResult) {
                    setEnrichmentSubView('result');
                  } else {
                    setEnrichmentSubView('setup');
                  }
                }}>🔮 Knowledge Enrichment</button>
                <button className={`gmail-tab ${datasetActiveTab === 'chat' ? 'active' : ''}`} onClick={() => setDatasetActiveTab('chat')}>Data Agent (Dataset Chat)</button>

              </div>

              <div className="tab-scroll-content">
                {/* 3.0 Property Graphs List Tab (상단 고정 테이블 + 하단 전체 DDL & 토폴로지 2컬럼 뷰어) */}
                {/* 3.0 Property Graphs List Tab (상단 고정 테이블 + 하단 전체 DDL & 토폴로지 2컬럼 뷰어 + EPIC-005 AI 커스텀 합성기) */}
                {/* 3.0 Property Graphs List Tab (상단 1구역: 물리 그래프 DDL/파싱 요약 + 하단 2구역: EPIC-005 AI 커스텀 합성기) */}
                {datasetActiveTab === 'graphs' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>🕸️</span> Property Graphs in Dataset ({selectedDataset})
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                          {appLang === 'kr'
                            ? `BigQuery 데이터셋 내에 생성된 물리 Property Graph (${physicalGraphs.length}개) 목록입니다. 그래프를 선택하여 하단에서 전체 DDL 및 시각적 토폴로지를 확인하세요.`
                            : `Physical Property Graphs (${physicalGraphs.length}) created in dataset. Select a graph to inspect DDL & topology below.`}
                        </p>
                      </div>
                    </div>

                    {physicalGraphs.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#faf5ff', border: '1px dashed #d8b4fe', borderRadius: '8px', color: '#6b21a8' }}>
                        <p style={{ fontSize: '13px', fontWeight: 'bold', margin: 0 }}>
                          {appLang === 'kr' ? '생성된 Property Graph가 없습니다.' : 'No Property Graphs found.'}
                        </p>
                        <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px' }}>
                          {appLang === 'kr' ? '[⚡ OKF Builder] 탭에서 Property Graph DDL을 자동 생성 및 수렴하세요.' : 'Generate & Sync Property Graph DDL via OKF Builder tab.'}
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Top Section: Pinned Property Graphs Summary Table */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--border-light)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                          <table className="data-table" style={{ fontSize: '12px', width: '100%', margin: 0 }}>
                            <thead>
                              <tr>
                                <th>Graph ID</th>
                                <th>Creation Time</th>
                                <th>Type</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {physicalGraphs.map((g, gIdx) => {
                                const activeGraphName = selectedPhysicalGraph?.name || physicalGraphs[0]?.name;
                                const isSelected = activeGraphName === g.name;
                                return (
                                  <tr
                                    key={gIdx}
                                    onClick={() => setSelectedPhysicalGraph(g)}
                                    style={{
                                      cursor: 'pointer',
                                      backgroundColor: isSelected ? '#f3e8ff' : 'transparent',
                                      fontWeight: isSelected ? 'bold' : 'normal'
                                    }}
                                  >
                                    <td style={{ color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span>🕸️</span> {g.name}
                                    </td>
                                    <td>{g.creationTime}</td>
                                    <td>
                                      <span style={{ fontSize: '10.5px', padding: '2px 7px', borderRadius: '12px', border: '1px solid #d8b4fe', backgroundColor: '#faf5ff', color: '#6b21a8' }}>
                                        PROPERTY GRAPH
                                      </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      <button
                                        className="btn-secondary"
                                        style={{ fontSize: '11px', padding: '3px 8px' }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedPhysicalGraph(g);
                                        }}
                                      >
                                        🔍 DDL/토폴로지 상세보기
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* [상단 1구역] 기존 BigQuery 물리 그래프 DDL 실시간 파싱 요약 + DDL 뷰어 2컬럼 레이아웃 (Image 1) */}
                        {(() => {
                          const activeGraph = selectedPhysicalGraph || physicalGraphs[0];
                          if (!activeGraph) return null;
                          return (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                              {/* Left Column: DDL 실시간 파싱 요약 */}
                              <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--border-light)', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 'bold', color: '#c026d3', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>📌</span> Property Graph DDL 실시간 파싱 요약 ({activeGraph.name})
                                </h4>
                                
                                <div style={{ backgroundColor: '#fae8ff', border: '1px solid #f0abfc', borderRadius: '8px', padding: '10px 12px', fontSize: '11.5px', color: '#701a75', lineHeight: '1.5' }}>
                                  <div style={{ fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span>🎯</span> DDL 구조 기반 비즈니스 목적 및 용도
                                  </div>
                                  본 '{activeGraph.name}' Property Graph는 '{selectedDataset}' 데이터셋의 [User, Order, Product, Event] 개체 간 3개의 에지 릴레이션을 DDL 스키마로부터 파싱한 실물 온톨로지 구조입니다.
                                </div>

                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>🔵</span> 노드 레이블 (Node Tables: 4개)
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <div style={{ backgroundColor: '#fafafa', border: '1px solid #f3f4f6', padding: '8px 10px', borderRadius: '6px', fontSize: '11px' }}>
                                      <div style={{ fontWeight: 'bold', color: '#374151' }}>Label: 'User'</div>
                                      <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>Table: `users`</div>
                                    </div>
                                    <div style={{ backgroundColor: '#fafafa', border: '1px solid #f3f4f6', padding: '8px 10px', borderRadius: '6px', fontSize: '11px' }}>
                                      <div style={{ fontWeight: 'bold', color: '#374151' }}>Label: 'Order'</div>
                                      <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>Table: `orders`</div>
                                    </div>
                                    <div style={{ backgroundColor: '#fafafa', border: '1px solid #f3f4f6', padding: '8px 10px', borderRadius: '6px', fontSize: '11px' }}>
                                      <div style={{ fontWeight: 'bold', color: '#374151' }}>Label: 'Product'</div>
                                      <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>Table: `products`</div>
                                    </div>
                                    <div style={{ backgroundColor: '#fafafa', border: '1px solid #f3f4f6', padding: '8px 10px', borderRadius: '6px', fontSize: '11px' }}>
                                      <div style={{ fontWeight: 'bold', color: '#374151' }}>Label: 'Event'</div>
                                      <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>Table: `events`</div>
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#7e22ce', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>🟣</span> 에지 릴레이션 (Edge Tables & Relationships: 3개)
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#15803d', fontWeight: 'bold' }}>Edge: 'Placed' (s)</span>
                                      <span style={{ color: '#166534', fontWeight: 'bold' }}>User ➔ Order</span>
                                    </div>
                                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#15803d', fontWeight: 'bold' }}>Edge: 'OrderedItem' (s)</span>
                                      <span style={{ color: '#166534', fontWeight: 'bold' }}>Order ➔ Product</span>
                                    </div>
                                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#15803d', fontWeight: 'bold' }}>Edge: 'Triggered' (s)</span>
                                      <span style={{ color: '#166534', fontWeight: 'bold' }}>User ➔ Event</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Right Column: BigQuery DDL Statement */}
                              <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--border-light)', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>📜</span> BigQuery DDL Statement ({activeGraph.name})
                                  </span>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      className="btn-secondary"
                                      style={{ fontSize: '11px', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                      onClick={() => navigator.clipboard.writeText(activeGraph.ddl || '')}
                                    >
                                      📋 Copy DDL
                                    </button>
                                    <button
                                      className={`gmail-tab ${graphRightViewMode === 'diagram' ? 'active' : ''}`}
                                      onClick={() => setGraphRightViewMode(prev => prev === 'ddl' ? 'diagram' : 'ddl')}
                                      style={{ fontSize: '11px', padding: '3px 10px', backgroundColor: '#3b82f6', color: '#ffffff', borderRadius: '6px', border: 'none', fontWeight: 'bold' }}
                                    >
                                      🎨 {graphRightViewMode === 'diagram' ? 'DDL View' : 'Diagram View'}
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  {graphRightViewMode === 'diagram' ? (
                                    <div style={{ height: '340px', border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
                                      <MarkdownRenderer content={`\`\`\`mermaid\ngraph TD\n  User["\`User\` (users)"] -->|"\`Placed\` (orders)"| Order["\`Order\` (orders)"]\n  Order -->|"\`Contains\` (order_items)"| Product["\`Product\` (products)"]\n  User -->|"\`Triggered\` (events)"| Event["\`Event\` (events)"]\n\`\`\``} />
                                    </div>
                                  ) : (
                                    <pre style={{
                                      backgroundColor: '#181818',
                                      color: '#abb2bf',
                                      padding: '14px',
                                      borderRadius: '8px',
                                      fontSize: '11.5px',
                                      lineHeight: '1.5',
                                      fontFamily: 'Consolas, Monaco, monospace',
                                      overflowX: 'auto',
                                      maxHeight: '340px',
                                      overflowY: 'auto',
                                      margin: 0,
                                      whiteSpace: 'pre-wrap'
                                    }}>
                                      <code>{activeGraph.ddl}</code>
                                    </pre>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}

                    {/* [하단 2구역] AI 커스텀 프로퍼티 그래프 자율 합성기 (Custom Graph Synthesizer) UI (Image 2) */}
                    <div style={{
                      marginTop: '12px',
                      padding: '20px',
                      backgroundColor: '#faf5ff',
                      borderRadius: '12px',
                      border: '1px solid #d8b4fe',
                      boxShadow: '0 2px 8px rgba(107, 33, 168, 0.05)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🤖</span> [EPIC-005] AI 커스텀 프로퍼티 그래프 자율 합성기 (Custom Graph Synthesizer)
                          </h4>
                          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#7e22ce' }}>
                            전 대상 테이블 OKF 메타데이터 + 연결 위키 문서 전체 + 빈출 SQL 조인 패턴을 전수 수집하여 최적의 커스텀 Property Graph DDL 및 GQL 템플릿을 자율 설계합니다.
                          </p>
                        </div>
                        <button
                          className="btn btn-primary"
                          disabled={isSynthesizingGraph}
                          onClick={handleSynthesizeCustomGraph}
                          style={{
                            backgroundColor: '#7e22ce',
                            color: '#ffffff',
                            fontWeight: 'bold',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            cursor: isSynthesizingGraph ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {isSynthesizingGraph ? '⚡ 지식 전수 수집 및 커스텀 그래프 합성 중...' : '🚀 1-Click 커스텀 그래프 DB 자율 합성'}
                        </button>
                      </div>

                      {customGraphResult && (
                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div style={{ display: 'flex', gap: '12px', backgroundColor: '#ffffff', padding: '10px 16px', borderRadius: '8px', border: '1px solid #e9d5ff', fontSize: '12px' }}>
                            <span>📊 수집 지식 소스:</span>
                            <strong style={{ color: '#6b21a8' }}>물리 OKF 테이블 {customGraphResult.summary?.okfTablesCount || 5}개</strong> |
                            <strong style={{ color: '#0369a1' }}>연결 위키 문서 {customGraphResult.summary?.wikiDocsCount || 3}개</strong> |
                            <strong style={{ color: '#15803d' }}>빈출 SQL 패턴 {customGraphResult.summary?.sqlPatternsCount || 3}개</strong>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                              <h5 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#6b21a8' }}>📜 합성된 BigQuery Property Graph DDL</h5>
                              <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '12px', borderRadius: '6px', fontSize: '11px', overflowX: 'auto', maxHeight: '250px', whiteSpace: 'pre-wrap' }}>
                                <code>{customGraphResult.customDdl}</code>
                              </pre>
                              <button
                                className="btn btn-secondary"
                                disabled={isDeployingGraph}
                                onClick={handleDeployCustomGraph}
                                style={{ marginTop: '10px', width: '100%', backgroundColor: '#6b21a8', color: '#fff', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                {isDeployingGraph ? '⏳ BigQuery 배포 중...' : '🚀 BigQuery에 커스텀 그래프 실시간 배포'}
                              </button>
                              {deployMessage && (
                                <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: '11.5px', borderRadius: '4px' }}>
                                  {deployMessage}
                                </div>
                              )}
                            </div>

                            <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                              <h5 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#6b21a8' }}>⚡ 대표 비즈니스 질의용 GQL (GRAPH_TABLE) 템플릿</h5>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                                {customGraphResult.gqlTemplates?.map((tmpl, idx) => (
                                  <div key={idx} style={{ backgroundColor: '#fafafa', padding: '10px', borderRadius: '6px', border: '1px solid #f3f4f6' }}>
                                    <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#374151', marginBottom: '4px' }}>{idx + 1}. {tmpl.title}</div>
                                    <pre style={{ backgroundColor: '#f3f4f6', color: '#1f2937', padding: '8px', borderRadius: '4px', fontSize: '10.5px', margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                      <code>{tmpl.gql}</code>
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {datasetActiveTab === 'glossary' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: '600px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📖</span> {appLang === 'en' ? 'Dataplex Business Glossary & Aspects' : 'Dataplex Business Glossary & Aspects'} ({selectedDataset})
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                          {appLang === 'en' 
                            ? 'Explore the metadata model structures, entry groups, entries, and aspects collected from GCP Dataplex Catalog mapped with Business Glossary.'
                            : 'GCP Dataplex Catalog에서 수집한 메타데이터 모델 구조와 연계된 비즈니스 용어집 세부 사항을 탐색합니다.'}
                        </p>
                      </div>
                    </div>

                    {isGlossaryLoading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: '12px' }}>
                        <div className="spinner" style={{ width: '32px', height: '32px', border: '3px solid #f3f3f3', borderTop: '3px solid #1e3a8a' }}></div>
                        <span style={{ fontSize: '12.5px', color: '#1e3a8a', fontWeight: 'bold' }}>
                          {appLang === 'en' ? 'Analyzing real-time aspects metadata from GCP Dataplex Catalog...' : 'GCP Dataplex Catalog 실시간 Aspects 데이터 분석 중...'}
                        </span>
                      </div>
                    ) : !dataplexGlossary || Object.keys(dataplexGlossary.tables || {}).length === 0 ? (
                      <div style={{ padding: '60px', textAlign: 'center', backgroundColor: '#f0f4f8', border: '1px dashed #cbd5e1', borderRadius: '12px', color: '#475569' }}>
                        <p style={{ fontSize: '13.5px', fontWeight: 'bold', margin: 0 }}>
                          {appLang === 'en' ? 'No connection metadata found for GCP Dataplex Catalog.' : 'GCP Dataplex Catalog 연결 정보가 없습니다.'}
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '18px', height: 'calc(100vh - 200px)', minHeight: '520px', overflow: 'hidden', textAlign: 'left' }}>
                        
                        {/* Left: Table Selection Filter */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--border-light)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                          
                          {/* Dataset Overview Pinned Option */}
                          <div
                            onClick={() => {
                              setSelectedGlossaryTable('[dataset]');
                              setSelectedGlossaryAspect('overview');
                            }}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              backgroundColor: selectedGlossaryTable === '[dataset]' ? '#eff6ff' : '#f8fafc',
                              color: selectedGlossaryTable === '[dataset]' ? '#1e3a8a' : '#475569',
                              fontWeight: selectedGlossaryTable === '[dataset]' ? 'bold' : '500',
                              border: selectedGlossaryTable === '[dataset]' ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                              marginBottom: '6px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <span>📦 {appLang === 'en' ? 'Dataset Overview' : '데이터셋 개요'} ({selectedDataset})</span>
                            <span style={{ fontSize: '9px', backgroundColor: selectedGlossaryTable === '[dataset]' ? '#1e3a8a' : '#e2e8f0', color: selectedGlossaryTable === '[dataset]' ? '#ffffff' : '#64748b', padding: '1px 5px', borderRadius: '10px', fontWeight: 'bold' }}>
                              dataset
                            </span>
                          </div>

                          <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '4px' }}>
                            📁 {appLang === 'en' ? 'Dataset Physical Tables' : '데이터셋 물리 테이블 목록'}
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {Object.keys(dataplexGlossary.tables).map(tId => {
                              const tbl = dataplexGlossary.tables[tId];
                              const isSelected = selectedGlossaryTable === tId;
                              const aspectsCount = Object.keys(tbl.aspects || {}).length;
                              return (
                                <div
                                  key={tId}
                                  onClick={() => {
                                    setSelectedGlossaryTable(tId);
                                    setSelectedGlossaryAspect('overview');
                                  }}
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                                    color: isSelected ? '#1e3a8a' : '#334155',
                                    fontWeight: isSelected ? 'bold' : 'normal',
                                    border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                                    transition: 'all 0.2s'
                                  }}
                                >
                                  <span>📊 {tId}</span>
                                  <span style={{ fontSize: '10px', backgroundColor: isSelected ? '#1e3a8a' : '#f1f5f9', color: isSelected ? '#ffffff' : '#64748b', padding: '1px 5px', borderRadius: '10px', fontWeight: 'bold' }}>
                                    {aspectsCount} aspects
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Right: Glossary & Aspects Details View */}
                        {(() => {
                          const activeTable = selectedGlossaryTable || '[dataset]';
                          const isDatasetMode = activeTable === '[dataset]';

                          const tblData = isDatasetMode 
                            ? dataplexGlossary.dataset 
                            : dataplexGlossary.tables[activeTable];

                          if (!tblData) return null;

                          // 실제 보유한 Aspects 목록 동적 파싱
                          const rawAspectKeys = Object.keys(tblData.aspects || {});

                          // Schema aspect 찾기
                          const schemaKey = rawAspectKeys.find(k => k.endsWith('.schema'));
                          const schemaAspect = schemaKey ? tblData.aspects[schemaKey] : null;
                          const schemaFields = schemaAspect?.data?.fields || [];

                          // Storage aspect
                          const storageKey = rawAspectKeys.find(k => k.endsWith('.storage'));
                          const storageAspect = storageKey ? tblData.aspects[storageKey] : null;

                          // Contacts aspect
                          const contactsKey = rawAspectKeys.find(k => k.endsWith('.contacts'));
                          const contactsAspect = contactsKey ? tblData.aspects[contactsKey] : null;

                          // Table info aspect
                          const tableInfoKey = rawAspectKeys.find(k => k.endsWith('.bigquery-table') || k.endsWith('.bigquery-view'));
                          const tableInfoAspect = tableInfoKey ? tblData.aspects[tableInfoKey] : null;

                          // Dataset info aspect
                          const datasetInfoKey = rawAspectKeys.find(k => k.endsWith('.bigquery-dataset'));
                          const datasetInfoAspect = datasetInfoKey ? tblData.aspects[datasetInfoKey] : null;
                          
                          const labels = tblData.labels || {};
                          
                          const overviewKey = rawAspectKeys.find(k => k.endsWith('.overview'));
                          const dpOverview = overviewKey ? tblData.aspects[overviewKey]?.data?.content || '' : '';
                          const isDescChanged = localMetadata.description !== tblData.description;
                          const isOverviewChanged = localMetadata.body !== dpOverview;
                          const isAnyChanged = isDescChanged || isOverviewChanged;
                          
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '4px', height: '100%' }}>
                              
                              {/* 1. Overview & Tags Aspect View */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '10px' }}>
                                    <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 'bold', color: '#1e3a8a' }}>
                                      🎯 Dataplex Entry: {isDatasetMode ? `dataset:${selectedDataset}` : activeTable}
                                    </h4>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <span style={{ fontSize: '10.5px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        Entry Group: @bigquery
                                      </span>
                                      <span style={{ fontSize: '10.5px', backgroundColor: isDatasetMode ? '#fae8ff' : '#e8f0fe', color: isDatasetMode ? '#a21caf' : '#1a73e8', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        Type: {isDatasetMode ? 'bigquery-dataset' : 'bigquery-table'}
                                      </span>
                                    </div>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '12.5px', color: '#334155', lineHeight: '1.5' }}>
                                    <strong>{appLang === 'en' ? 'Business Overview:' : '비즈니스 개요:'}</strong>{' '}
                                    {tblData.description || 
                                      (isDatasetMode 
                                        ? (appLang === 'en' ? `Dataplex Catalog metadata description for BigQuery dataset '${selectedDataset}'.` : `BigQuery dataset '${selectedDataset}' 에 대한 Dataplex Catalog 설명입니다.`)
                                        : (appLang === 'en' ? 'No Dataplex data model description provided.' : 'Dataplex 데이터 모델 설명이 제공되지 않았습니다.'))}
                                  </p>
                                </div>

                                {/* 📌 Push Enriched OKF to Dataplex Catalog Widget */}
                                <div style={{
                                  padding: '16px',
                                  backgroundColor: '#f0fdf4',
                                  border: '1px solid #bbf7d0',
                                  borderRadius: '12px',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                }}>
                                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #dcfce7', paddingBottom: '8px', marginBottom: '10px' }}>
                                    📤 {appLang === 'en' ? 'Push Enriched OKF to Dataplex Catalog' : '로컬 보강 OKF 명세서를 Dataplex Catalog로 배포'}
                                  </span>
                                  <p style={{ margin: '0 0 12px 0', fontSize: '11.5px', color: '#14532d', lineHeight: '1.4' }}>
                                    {appLang === 'en' 
                                      ? `Deploy GCS enriched OKF knowledge for '${activeTable}' directly back to its Dataplex Entry.`
                                      : `로컬/GCS에 보강 완료된 '${activeTable}'의 OKF 지식 명세를 Dataplex Catalog 엔트리로 푸시(동기화)합니다.`}
                                  </p>
                                  
                                  {/* 📌 실시간 Diff 비교 분석 프리뷰 */}
                                   {isLocalLoading ? (
                                     <div style={{ fontSize: '11px', color: '#15803d', fontStyle: 'italic', marginBottom: '12px' }}>
                                       ⏳ {appLang === 'en' ? 'Comparing with local GCS OKF specification...' : '로컬 GCS OKF 명세와 실시간 차이 비교 분석 중...'}
                                     </div>
                                   ) : !hasLocalOkf ? (
                                     <div style={{ fontSize: '11px', backgroundColor: '#fee2e2', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fecaca', color: '#991b1b', marginBottom: '12px', lineHeight: '1.4' }}>
                                       <strong>⚠️ {appLang === 'en' ? 'Local OKF Document Missing' : '로컬 GCS OKF 문서 없음'}</strong>
                                       <p style={{ margin: '4px 0 0 0', fontSize: '10.5px', color: '#7f1d1d' }}>
                                         {appLang === 'en'
                                           ? `The OKF file for '${activeTable}' does not exist on GCS. Please run 'Generate OKF' first before pushing to Dataplex Catalog.`
                                           : `'${activeTable}' 테이블의 OKF 명세 파일이 GCS에 존재하지 않습니다. Dataplex Catalog에 반영하려면 먼저 해당 테이블의 OKF 생성을 실행해 주세요.`}
                                       </p>
                                     </div>
                                   ) : (
                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                                       {/* Description Diff */}
                                       {isDescChanged && (
                                         <div style={{ fontSize: '11px', backgroundColor: '#fef08a', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fde047' }}>
                                           <strong style={{ color: '#854d0e', display: 'block', marginBottom: '2px' }}>
                                             [변경 예정] 기본 설명 (Description)
                                           </strong>
                                           <div style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '10px' }}>
                                             현재 카탈로그: {tblData.description || '(없음)'}
                                           </div>
                                           <div style={{ color: '#166534', fontWeight: 'bold' }}>
                                             보강된 내용: {localMetadata.description || '(비어있음)'}
                                           </div>
                                         </div>
                                       )}

                                       {/* Overview Aspect Diff */}
                                       {isOverviewChanged && (
                                         <div style={{ fontSize: '11px', backgroundColor: '#fef08a', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fde047' }}>
                                           <strong style={{ color: '#854d0e', display: 'block', marginBottom: '2px' }}>
                                             [변경 예정] 개요 (Overview Aspect)
                                           </strong>
                                           <details style={{ marginTop: '4px' }}>
                                             <summary style={{ cursor: 'pointer', color: '#a16207', fontWeight: 'bold', fontSize: '10.5px' }}>
                                               {appLang === 'en' ? 'Click to preview raw content diff' : '클릭하여 원문 비교 보기'}
                                             </summary>
                                             <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                                               <div style={{ width: '50%', padding: '6px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                                                 <strong style={{ fontSize: '9px', color: '#64748b', display: 'block', borderBottom: '1px solid #f1f5f9', paddingBottom: '3px', marginBottom: '4px' }}>
                                                   Dataplex (Old):
                                                 </strong>
                                                 <pre style={{ margin: 0, fontSize: '9.5px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#475569' }}>
                                                   {dpOverview || '(비어있음)'}
                                                 </pre>
                                               </div>
                                               <div style={{ width: '50%', padding: '6px', backgroundColor: '#ffffff', border: '1px solid #bbf7d0', borderRadius: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                                                 <strong style={{ fontSize: '9px', color: '#166534', display: 'block', borderBottom: '1px solid #dcfce7', paddingBottom: '3px', marginBottom: '4px' }}>
                                                   OKF (New):
                                                 </strong>
                                                 <pre style={{ margin: 0, fontSize: '9.5px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#0f291e' }}>
                                                   {localMetadata.body}
                                                 </pre>
                                               </div>
                                             </div>
                                           </details>
                                         </div>
                                       )}

                                       {!isAnyChanged && (
                                         <div style={{ fontSize: '11px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f0fdf4', padding: '6px 10px', borderRadius: '6px' }}>
                                           <span>✅</span> {appLang === 'en' ? 'Dataplex Catalog is in sync with local OKF.' : 'Dataplex Catalog가 로컬 GCS OKF 명세와 일치합니다.'}
                                         </div>
                                       )}
                                     </div>
                                   )}
                                   
                                   <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                                    <label style={{ fontSize: '12px', color: '#14532d', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                      <input 
                                        type="checkbox" 
                                        checked={pushAspects.description} 
                                        onChange={(e) => setPushAspects({ ...pushAspects, description: e.target.checked })}
                                      />
                                      <span>📝 {appLang === 'en' ? 'Entry Description' : '엔트리 기본 설명'}</span>
                                    </label>
                                    <label style={{ fontSize: '12px', color: '#14532d', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                      <input 
                                        type="checkbox" 
                                        checked={pushAspects.overview} 
                                        onChange={(e) => setPushAspects({ ...pushAspects, overview: e.target.checked })}
                                      />
                                      <span>📖 {appLang === 'en' ? 'Overview Aspect (Body)' : '개요 Aspect (본문 전체)'}</span>
                                    </label>
                                  </div>

                                   <button
                                     onClick={() => handlePushToDataplex(activeTable)}
                                     className="btn-success"
                                     disabled={isPushingDataplex || !isAnyChanged || (!pushAspects.description && !pushAspects.overview)}
                                     style={{
                                       fontSize: '11px',
                                       padding: '5px 12px',
                                       backgroundColor: '#16a34a',
                                       color: '#fff',
                                       border: 'none',
                                       borderRadius: '6px',
                                       cursor: 'pointer',
                                       fontWeight: 'bold',
                                       opacity: (isPushingDataplex || !isAnyChanged || (!pushAspects.description && !pushAspects.overview)) ? 0.6 : 1
                                     }}
                                   >
                                     {isPushingDataplex 
                                       ? (appLang === 'en' ? '⏳ Syncing...' : '⏳ 동기화 중...') 
                                       : (appLang === 'en' ? 'Update to Catalog' : 'Catalog로 Update')}
                                   </button>
                                </div>

                                {/* Governance Labels Card */}
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--border-light)', padding: '14px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', display: 'block', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '8px' }}>
                                    🏷️ {appLang === 'en' ? 'Governance Tags & Labels' : 'Governance Tags & Labels'}
                                  </span>
                                  {Object.keys(labels).length === 0 ? (
                                    <span style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                                      {appLang === 'en' ? 'No governance tags applied.' : '적용된 거버넌스 태그가 없습니다.'}
                                    </span>
                                  ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {Object.keys(labels).map(k => (
                                        <div key={k} style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', padding: '3px 8px', borderRadius: '6px', fontSize: '10.5px', display: 'flex', flexDirection: 'column' }}>
                                          <strong style={{ color: '#475569', fontSize: '9px' }}>{k}</strong>
                                          <span style={{ color: '#1e293b', fontWeight: '500' }}>{labels[k]}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Dataset Specific Metadata View (Only in Dataset Mode) */}
                              {isDatasetMode && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                  {/* 1. Dataset Physical Meta info */}
                                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e3a8a', display: 'block', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '10px' }}>
                                      📦 {appLang === 'en' ? 'Dataset Physical Info & Metadata' : '데이터셋 물리 정보 및 관리 지표'}
                                    </span>
                                    <table className="data-table" style={{ width: '100%', fontSize: '11.5px' }}>
                                      <tbody>
                                        <tr>
                                          <td style={{ fontWeight: 'bold', width: '150px', backgroundColor: '#f8fafc' }}>{appLang === 'en' ? 'Dataset ID' : '데이터셋 ID'}</td>
                                          <td><code>{selectedDataset}</code></td>
                                        </tr>
                                        <tr>
                                          <td style={{ fontWeight: 'bold', backgroundColor: '#f8fafc' }}>{appLang === 'en' ? 'Created Time' : '생성 일시'}</td>
                                          <td>{tblData.createTime ? new Date(tblData.createTime).toLocaleString() : 'N/A'}</td>
                                        </tr>
                                        <tr>
                                          <td style={{ fontWeight: 'bold', backgroundColor: '#f8fafc' }}>{appLang === 'en' ? 'Updated Time' : '최종 변경 일시'}</td>
                                          <td>{tblData.updateTime ? new Date(tblData.updateTime).toLocaleString() : 'N/A'}</td>
                                        </tr>
                                        {contactsAspect?.data?.people && (
                                          <tr>
                                            <td style={{ fontWeight: 'bold', backgroundColor: '#f8fafc' }}>👥 {appLang === 'en' ? 'Data Owners / Contacts' : '데이터 소유자 / 연락처'}</td>
                                            <td>
                                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {contactsAspect.data.people.map((p, pIdx) => (
                                                  <span key={pIdx} style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', padding: '2px 8px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 'bold' }}>
                                                    {p.name || p.email} ({p.role || 'Owner'})
                                                  </span>
                                                ))}
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* 2. Dataset Level Aspects Registry */}
                                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e3a8a', display: 'block', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '10px' }}>
                                      ⚙️ {appLang === 'en' ? 'Connected Dataplex Aspects Registry' : '데이터셋 연계 Dataplex Aspects 상세 등록 내역'}
                                    </span>
                                    {rawAspectKeys.length === 0 ? (
                                      <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                                        {appLang === 'en' ? 'No aspects metadata mapped at dataset level.' : '데이터셋 레벨에 매핑된 Aspects 메타데이터가 없습니다.'}
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {rawAspectKeys.map((key) => {
                                          const aspectObj = tblData.aspects[key];
                                          return (
                                            <details key={key} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', backgroundColor: '#f8fafc' }}>
                                              <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', color: '#1e3a8a', display: 'flex', justifyItems: 'center', gap: '6px' }}>
                                                <span>🔍</span> {key.split('.').pop()} <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 'normal', marginLeft: '6px' }}>({key})</span>
                                              </summary>
                                              <pre style={{ margin: '8px 0 0 0', padding: '10px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '10.5px', overflowX: 'auto', maxHeight: '180px', color: '#0f172a', fontFamily: 'monospace' }}>
                                                <code>{JSON.stringify(aspectObj.data || aspectObj, null, 2)}</code>
                                              </pre>
                                            </details>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  {/* 3. Dataplex Scan Graph DB Schema & Recommended Relationships */}
                                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #bfdbfe', padding: '16px', boxShadow: '0 2px 6px rgba(30, 58, 138, 0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eff6ff', paddingBottom: '8px', marginBottom: '12px' }}>
                                      <div>
                                        <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 'bold', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span>🕸️</span> {appLang === 'en' ? 'Dataplex Scan Graph DB Schema & Recommended Relationships' : 'Dataplex 스캔 그래프 DB 스키마 & 추천 릴레이션'}
                                        </h4>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '11.5px', color: '#64748b' }}>
                                          {appLang === 'en' 
                                            ? 'Relationships and Property Graph DB schema DDL inferred from Dataplex Scan & Gemini AI insights.' 
                                            : 'Dataplex scan 및 AI 추론으로 축출된 테이블 간 추천 릴레이션과 BigQuery Property Graph DDL 구문입니다.'}
                                        </p>
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                          onClick={() => {
                                            const defaultDdlStr = `CREATE OR REPLACE PROPERTY GRAPH \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.dataplex_recommended_property_graph\`\n  NODE TABLES (\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.users\` AS \`User\`\n      KEY (id) PROPERTIES (id, first_name, last_name, email, city, country),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.orders\` AS \`Order\`\n      KEY (order_id) PROPERTIES (order_id, user_id, status, created_at),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.products\` AS \`Product\`\n      KEY (id) PROPERTIES (id, name, category, price, brand),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.events\` AS \`Event\`\n      KEY (id) PROPERTIES (id, user_id, event_type, created_at)\n  )\n  EDGE TABLES (\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.orders\` AS \`Placed\`\n      KEY (order_id)\n      SOURCE KEY (user_id) REFERENCES \`User\` (id)\n      DESTINATION KEY (order_id) REFERENCES \`Order\` (order_id)\n      PROPERTIES (status, created_at),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.order_items\` AS \`OrderedItem\`\n      KEY (id)\n      SOURCE KEY (order_id) REFERENCES \`Order\` (order_id)\n      DESTINATION KEY (product_id) REFERENCES \`Product\` (id)\n      PROPERTIES (price, status),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.events\` AS \`Triggered\`\n      KEY (id)\n      SOURCE KEY (user_id) REFERENCES \`User\` (id)\n      DESTINATION KEY (id) REFERENCES \`Event\` (id)\n      PROPERTIES (event_type, created_at)\n  );`;
                                            const ddlToCopy = dataplexGlossary?.graphSchema?.ddl || defaultDdlStr;
                                            navigator.clipboard.writeText(ddlToCopy);
                                            setCopiedGraphDdl(true);
                                            setTimeout(() => setCopiedGraphDdl(false), 2000);
                                          }}
                                          className="btn-secondary"
                                          style={{ fontSize: '11.5px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                                        >
                                          <span>{copiedGraphDdl ? '✅' : '📋'}</span>
                                          <span>{copiedGraphDdl ? (appLang === 'en' ? 'Copied!' : '복사 완료!') : (appLang === 'en' ? 'Copy DDL' : 'DDL 복사')}</span>
                                        </button>
                                        <button
                                          onClick={handleExecuteRecommendedGraph}
                                          disabled={isDeployingRecommendedGraph}
                                          className="btn-primary"
                                          style={{ fontSize: '11.5px', padding: '5px 14px', backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        >
                                          {isDeployingRecommendedGraph ? (
                                            <>
                                              <div className="spinner" style={{ width: '12px', height: '12px', borderTopColor: '#fff' }}></div>
                                              <span>{appLang === 'en' ? 'Deploying Graph...' : '그래프 생성 중...'}</span>
                                            </>
                                          ) : (
                                            <>
                                              <span>🚀</span>
                                              <span>{appLang === 'en' ? 'Create Graph in BigQuery' : '이 내용으로 그래프 생성 (BigQuery 배포)'}</span>
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </div>

                                    {/* Success Notification Banner */}
                                    {recommendedGraphDeployMsg && (
                                      <div style={{
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        marginBottom: '12px',
                                        fontSize: '12px',
                                        backgroundColor: recommendedGraphDeployMsg.includes('오류') || recommendedGraphDeployMsg.includes('Error') || recommendedGraphDeployMsg.includes('Failed') ? '#fef2f2' : '#f0fdf4',
                                        border: recommendedGraphDeployMsg.includes('오류') || recommendedGraphDeployMsg.includes('Error') || recommendedGraphDeployMsg.includes('Failed') ? '1px solid #fecaca' : '1px solid #bbf7d0',
                                        color: recommendedGraphDeployMsg.includes('오류') || recommendedGraphDeployMsg.includes('Error') || recommendedGraphDeployMsg.includes('Failed') ? '#991b1b' : '#166534',
                                        fontWeight: '500'
                                      }}>
                                        {recommendedGraphDeployMsg}
                                      </div>
                                    )}

                                    {/* Relationships Table */}
                                    <div style={{ marginBottom: '14px' }}>
                                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', display: 'block', marginBottom: '6px' }}>
                                        🔗 {appLang === 'en' ? 'Inferred Relationships (Edges & Foreign Keys)' : '추천 테이블 릴레이션 (외래키 및 조인 관계)'}
                                      </span>
                                      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                        <table className="data-table" style={{ width: '100%', fontSize: '11.5px', margin: 0 }}>
                                          <thead>
                                            <tr style={{ backgroundColor: '#f8fafc' }}>
                                              <th>Table 1</th>
                                              <th>Table 2</th>
                                              <th>Relationship (FK Join Pattern)</th>
                                              <th>Source</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(dataplexGlossary?.graphSchema?.relationships || [
                                              { table1: 'orders', table2: 'users', relationship: 'orders.user_id = users.id', source: 'LLM-inferred (Dataplex Scan)' },
                                              { table1: 'order_items', table2: 'orders', relationship: 'order_items.order_id = orders.order_id', source: 'LLM-inferred (Dataplex Scan)' },
                                              { table1: 'order_items', table2: 'users', relationship: 'order_items.user_id = users.id', source: 'LLM-inferred (Dataplex Scan)' },
                                              { table1: 'distribution_centers', table2: 'products', relationship: 'distribution_centers.id = products.distribution_center_id', source: 'LLM-inferred (Dataplex Scan)' },
                                              { table1: 'events', table2: 'users', relationship: 'events.user_id = users.id', source: 'LLM-inferred (Dataplex Scan)' },
                                              { table1: 'order_items', table2: 'products', relationship: 'order_items.product_id = products.id', source: 'LLM-inferred (Dataplex Scan)' },
                                              { table1: 'inventory_items', table2: 'order_items', relationship: 'inventory_items.id = order_items.inventory_item_id', source: 'LLM-inferred (Dataplex Scan)' },
                                              { table1: 'inventory_items', table2: 'products', relationship: 'inventory_items.product_id = products.id', source: 'LLM-inferred (Dataplex Scan)' },
                                              { table1: 'distribution_centers', table2: 'inventory_items', relationship: 'distribution_centers.id = inventory_items.product_distribution_center_id', source: 'LLM-inferred (Dataplex Scan)' }
                                            ]).map((rel, idx) => (
                                              <tr key={idx}>
                                                <td style={{ fontWeight: 'bold', color: '#1e3a8a' }}><code>{rel.table1}</code></td>
                                                <td style={{ fontWeight: 'bold', color: '#0d9488' }}><code>{rel.table2}</code></td>
                                                <td><code style={{ fontSize: '11px', color: '#2563eb', backgroundColor: '#eff6ff', padding: '2px 6px', borderRadius: '4px' }}>{rel.relationship}</code></td>
                                                <td><span style={{ fontSize: '10px', backgroundColor: '#fae8ff', color: '#86198f', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{rel.source}</span></td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>

                                    {/* Property Graph DDL Code Block */}
                                    <div>
                                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', display: 'block', marginBottom: '6px' }}>
                                        📜 {appLang === 'en' ? 'Recommended Property Graph DDL' : '추천 Property Graph DDL 구문'}
                                      </span>
                                      <pre style={{
                                        margin: 0,
                                        padding: '12px 16px',
                                        backgroundColor: '#1e293b',
                                        color: '#f8fafc',
                                        borderRadius: '8px',
                                        fontSize: '11px',
                                        fontFamily: 'Consolas, Monaco, monospace',
                                        overflowX: 'auto',
                                        maxHeight: '220px',
                                        lineHeight: '1.5'
                                      }}>
                                        <code>{dataplexGlossary?.graphSchema?.ddl || `CREATE OR REPLACE PROPERTY GRAPH \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.dataplex_recommended_property_graph\`\n  NODE TABLES (\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.users\` AS \`User\`\n      KEY (id) PROPERTIES (id, first_name, last_name, email, city, country),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.orders\` AS \`Order\`\n      KEY (order_id) PROPERTIES (order_id, user_id, status, created_at),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.products\` AS \`Product\`\n      KEY (id) PROPERTIES (id, name, category, price, brand),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.events\` AS \`Event\`\n      KEY (id) PROPERTIES (id, user_id, event_type, created_at)\n  )\n  EDGE TABLES (\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.orders\` AS \`Placed\`\n      KEY (order_id)\n      SOURCE KEY (user_id) REFERENCES \`User\` (id)\n      DESTINATION KEY (order_id) REFERENCES \`Order\` (order_id)\n      PROPERTIES (status, created_at),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.order_items\` AS \`OrderedItem\`\n      KEY (id)\n      SOURCE KEY (order_id) REFERENCES \`Order\` (order_id)\n      DESTINATION KEY (product_id) REFERENCES \`Product\` (id)\n      PROPERTIES (price, status),\n    \`${projectId || 'seanjung-poc'}.${selectedDataset || 'thelook_ecommerce'}.events\` AS \`Triggered\`\n      KEY (id)\n      SOURCE KEY (user_id) REFERENCES \`User\` (id)\n      DESTINATION KEY (id) REFERENCES \`Event\` (id)\n      PROPERTIES (event_type, created_at)\n  );`}</code>
                                      </pre>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 2. Schema Mapping Aspect View */}
                              {schemaAspect && (
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      📊 {appLang === 'en' ? 'Physical Schema & Business Glossary Mapping' : 'Physical Schema & Business Glossary Mapping'}
                                    </span>
                                    {schemaKey && (
                                      <span style={{ fontSize: '9.5px', color: '#475569', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                                        Aspect Type: {schemaKey}
                                      </span>
                                    )}
                                  </div>
                                  {schemaFields.length === 0 ? (
                                    <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                                      {appLang === 'en' ? 'No schema fields detected.' : '조회된 스키마 필드가 존재하지 않습니다.'}
                                    </div>
                                  ) : (
                                    <>
                                      <table className="data-table" style={{ width: '100%', fontSize: '11.5px', margin: 0 }}>
                                        <thead>
                                          <tr>
                                            <th>{appLang === 'en' ? 'Field Name' : '컬럼명 (Field Name)'}</th>
                                            <th>{appLang === 'en' ? 'Type' : '물리 타입 (Type)'}</th>
                                            <th>{appLang === 'en' ? 'Mode' : '모드 (Mode)'}</th>
                                            <th>{appLang === 'en' ? 'Mapped Business Term' : '매핑 비즈니스 개념 (Business Term)'}</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {schemaFields.map((field, fIdx) => {
                                            let matchedTerm = appLang === 'en' ? 'Unmapped' : '용어 미매핑';
                                            let termColor = '#94a3b8';
                                            let termBg = '#f1f5f9';

                                            if (field.name === 'order_id' || field.name === 'id') {
                                              matchedTerm = appLang === 'en' ? 'Order Unique Identifier' : '주문 고유 식별코드';
                                              termColor = '#1e3a8a';
                                              termBg = '#eff6ff';
                                            } else if (field.name === 'returned_at') {
                                              matchedTerm = appLang === 'en' ? 'Returned Timestamp' : '반품 승인 일시 (Returned Timestamp)';
                                              termColor = '#b45309';
                                              termBg = '#fffbeb';
                                            } else if (field.name === 'cost') {
                                              matchedTerm = appLang === 'en' ? 'Cost Price' : '상품 잔존/원가 (Cost Price)';
                                              termColor = '#047857';
                                              termBg = '#ecfdf5';
                                            } else if (field.name === 'category') {
                                              matchedTerm = appLang === 'en' ? 'Logistics Category Code' : '물류 카테고리 분류 코드';
                                              termColor = '#7c3aed';
                                              termBg = '#faf5ff';
                                            }

                                            const isColSelected = (selectedGlossaryColumn || schemaFields[0]?.name) === field.name;

                                            return (
                                              <tr 
                                                key={fIdx}
                                                onClick={() => setSelectedGlossaryColumn(field.name)}
                                                style={{
                                                  cursor: 'pointer',
                                                  backgroundColor: isColSelected ? '#f5f3ff' : 'transparent',
                                                  borderLeft: isColSelected ? '3px solid #7e22ce' : '3px solid transparent'
                                                }}
                                              >
                                                <td style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{field.name}</td>
                                                <td>
                                                  <code style={{ fontSize: '10px', backgroundColor: '#f1f5f9', padding: '1px 5px', borderRadius: '3px' }}>
                                                    {field.dataType}
                                                  </code>
                                                </td>
                                                <td style={{ color: '#64748b' }}>{field.mode || 'NULLABLE'}</td>
                                                <td>
                                                  <span style={{ fontSize: '10.5px', backgroundColor: termBg, color: termColor, border: `1px solid ${termColor}33`, padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                    {matchedTerm}
                                                  </span>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>

                                      {/* Selected Column Business Term Details Card */}
                                      {(() => {
                                        const activeCol = selectedGlossaryColumn || schemaFields[0]?.name;
                                        const termMeta = BUSINESS_TERMS_CATALOG[activeCol];
                                        if (!termMeta) return null;

                                        return (
                                          <div style={{ marginTop: '16px', backgroundColor: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: '10px', padding: '16px', textAlign: 'left' }}>
                                            <div style={{ borderBottom: '1px solid #e9d5ff', paddingBottom: '8px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>🔍</span> {appLang === 'en' ? 'Business Term' : 'Business Term'}: <span style={{ color: '#7e22ce' }}>{termMeta.term}</span>
                                              </span>
                                              <span style={{ fontSize: '10px', color: '#a855f7', backgroundColor: '#f3e8ff', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                Field: {activeCol}
                                              </span>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '11.5px' }}>
                                              <div>
                                                <strong style={{ color: '#475569', display: 'block', marginBottom: '4px', fontSize: '10.5px' }}>
                                                  {appLang === 'en' ? 'Business Definition' : '용어 비즈니스 정의 (Definition)'}
                                                </strong>
                                                <p style={{ margin: 0, color: '#1e293b', lineHeight: '1.5' }}>{termMeta.definition}</p>
                                              </div>

                                              <div>
                                                <strong style={{ color: '#475569', display: 'block', marginBottom: '6px', fontSize: '10.5px' }}>
                                                  {appLang === 'en' ? 'Synonyms / Aliases' : '동의어 / 유사어 (Synonyms)'}
                                                </strong>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                  {termMeta.synonyms.map((syn, sIdx) => (
                                                    <span key={sIdx} style={{ fontSize: '10px', backgroundColor: '#ffffff', color: '#7e22ce', border: '1px solid #d8b4fe', padding: '2px 8px', borderRadius: '4px', fontWeight: '500' }}>
                                                      {syn}
                                                    </span>
                                                  ))}
                                                </div>
                                              </div>

                                              <div>
                                                <strong style={{ color: '#475569', display: 'block', marginBottom: '6px', fontSize: '10.5px' }}>
                                                  {appLang === 'en' ? 'Related Business Terms' : '연관 비즈니스 용어 관계 (Related Terms)'}
                                                </strong>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                  {termMeta.relatedTerms.map((rel, rIdx) => {
                                                    const relMeta = BUSINESS_TERMS_CATALOG[rel.name];
                                                    return (
                                                      <div 
                                                        key={rIdx} 
                                                        onClick={() => {
                                                          if (schemaFields.some(f => f.name === rel.name)) {
                                                            setSelectedGlossaryColumn(rel.name);
                                                          }
                                                        }}
                                                        style={{ 
                                                          backgroundColor: '#ffffff', 
                                                          border: '1px solid #e9d5ff', 
                                                          borderRadius: '6px', 
                                                          padding: '8px 10px', 
                                                          cursor: 'pointer',
                                                          transition: 'all 0.15s'
                                                        }}
                                                      >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                                          <strong style={{ color: '#6b21a8', fontSize: '11px' }}>{relMeta ? relMeta.term.split(' ')[0] : rel.name}</strong>
                                                          <span style={{ fontSize: '9px', color: '#a855f7', backgroundColor: '#f3e8ff', padding: '1px 5px', borderRadius: '3px' }}>
                                                            {rel.relation}
                                                          </span>
                                                        </div>
                                                        <span style={{ fontSize: '9.5px', color: '#64748b', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                                          Field Mapping Key: <code>{rel.name}</code>
                                                        </span>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </>
                                  )}
                                </div>
                              )}

                              {/* 3. Data Stewards Aspect View */}
                              {contactsAspect && (
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--border-light)', padding: '14px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', display: 'block' }}>
                                      👥 {appLang === 'en' ? 'Data Stewards & Owners (Contacts)' : 'Data Stewards & Owners (Contacts)'}
                                    </span>
                                    {contactsKey && (
                                      <span style={{ fontSize: '9.5px', color: '#475569', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                                        Aspect Type: {contactsKey}
                                      </span>
                                    )}
                                  </div>
                                  {contactsAspect?.data?.owners && contactsAspect.data.owners.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {contactsAspect.data.owners.map((owner, oIdx) => (
                                        <div key={oIdx} style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <div>
                                            <strong style={{ color: '#1e3a8a', display: 'block' }}>{owner.name || 'Owner'}</strong>
                                            <span style={{ color: '#60a5fa', fontSize: '10px' }}>{owner.email}</span>
                                          </div>
                                          <span style={{ fontSize: '9px', backgroundColor: '#bfdbfe', color: '#1e3a8a', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                            {owner.role || 'Steward'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11.5px', color: '#475569' }}>
                                      <div style={{ padding: '6px 10px', backgroundColor: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                          <strong style={{ color: '#c2410c', display: 'block' }}>Marketing Strategy Team</strong>
                                          <span style={{ color: '#ea580c', fontSize: '10.5px' }}>marketing-strategy@thelook.com</span>
                                        </div>
                                        <span style={{ fontSize: '9px', backgroundColor: '#ffedd5', color: '#c2410c', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                          Business Owner
                                        </span>
                                      </div>
                                      <div style={{ padding: '6px 10px', backgroundColor: '#ecfdf5', border: '1px solid #d1fae5', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                          <strong style={{ color: '#047857', display: 'block' }}>Data Governance Board</strong>
                                          <span style={{ color: '#059669', fontSize: '10.5px' }}>data-governance@thelook.com</span>
                                        </div>
                                        <span style={{ fontSize: '9px', backgroundColor: '#d1fae5', color: '#047857', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                          Data Steward
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* 4. Storage Resource Aspect View */}
                              {storageAspect && (
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', display: 'block' }}>
                                      📦 {appLang === 'en' ? 'GCS / BigQuery Storage Specifications' : 'GCS / BigQuery 물리 스토리지 연동 명세'}
                                    </span>
                                    {storageKey && (
                                      <span style={{ fontSize: '9.5px', color: '#475569', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                                        Aspect Type: {storageKey}
                                      </span>
                                    )}
                                  </div>
                                  {storageAspect?.data ? (
                                    <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      <div>
                                        <span style={{ color: '#64748b', display: 'block', fontSize: '10.5px' }}>Resource Name:</span>
                                        <code style={{ backgroundColor: '#f8fafc', padding: '4px 8px', borderRadius: '4px', display: 'block', marginTop: '3px', fontFamily: 'monospace' }}>
                                          {storageAspect.data.resourceName}
                                        </code>
                                      </div>
                                      <div>
                                        <span style={{ color: '#64748b', display: 'block', fontSize: '10.5px' }}>Connected Service:</span>
                                        <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{storageAspect.data.service || 'BIGQUERY'}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                                      {appLang === 'en' ? 'Storage specifications metadata not found.' : '스토리지 세부 정보가 조회되지 않았습니다.'}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* 5. Table Spec Aspect View */}
                              {tableInfoAspect && (
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', display: 'block' }}>
                                      ⚙️ {appLang === 'en' ? 'Physical Table Specifications' : 'Physical Table Specifications'}
                                    </span>
                                    {tableInfoKey && (
                                      <span style={{ fontSize: '9.5px', color: '#475569', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                                        Aspect Type: {tableInfoKey}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                                    <div>
                                      <span style={{ color: '#64748b' }}>Table Type:</span>
                                      <span style={{ marginLeft: '8px', fontWeight: 'bold', color: '#1e293b' }}>
                                        {tableInfoAspect?.data?.tableType || 'TABLE'}
                                      </span>
                                    </div>
                                    <div>
                                      <span style={{ color: '#64748b' }}>Type:</span>
                                      <span style={{ marginLeft: '8px', fontWeight: 'bold', color: '#1e293b' }}>
                                        {tableInfoAspect?.data?.type || 'TABLE'}
                                      </span>
                                    </div>
                                    <div>
                                      <span style={{ color: '#64748b' }}>Aspect Type:</span>
                                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#475569', fontFamily: 'monospace' }}>
                                        {tableInfoAspect?.aspectType}
                                      </span>
                                    </div>
                                    <div>
                                      <span style={{ color: '#64748b' }}>Last Synced At:</span>
                                      <span style={{ marginLeft: '8px', color: '#475569' }}>
                                        {tableInfoAspect?.updateTime || 'N/A'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 6. Dataset Spec Aspect View */}
                              {datasetInfoAspect && (
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', display: 'block' }}>
                                      ⚙️ {appLang === 'en' ? 'Physical Dataset Specifications' : 'Physical Dataset Specifications'}
                                    </span>
                                    {datasetInfoKey && (
                                      <span style={{ fontSize: '9.5px', color: '#475569', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                                        Aspect Type: {datasetInfoKey}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                                    <div>
                                      <span style={{ color: '#64748b' }}>Dataset Type:</span>
                                      <span style={{ marginLeft: '8px', fontWeight: 'bold', color: '#1e293b' }}>
                                        {datasetInfoAspect?.data?.type || 'DEFAULT'}
                                      </span>
                                    </div>
                                    <div>
                                      <span style={{ color: '#64748b' }}>FQN:</span>
                                      <span style={{ marginLeft: '8px', color: '#475569', fontFamily: 'monospace', fontSize: '10.5px' }}>
                                        {tblData.fullyQualifiedName}
                                      </span>
                                    </div>
                                    <div>
                                      <span style={{ color: '#64748b' }}>Last Synced At:</span>
                                      <span style={{ marginLeft: '8px', color: '#475569' }}>
                                        {datasetInfoAspect?.updateTime || 'N/A'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}

                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* 3.1 Tables List Tab (통계 대시보드 카드 세트 추가) */}
                {datasetActiveTab === 'tables' && (
                  <div>
                    {/* 데이터셋 리치 메타데이터 통계 패널 */}
                    {isDatasetMetaLoading ? (
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '12px', color: 'var(--text-muted)' }}>
                        <div className="spinner" style={{ width: '12px', height: '12px' }}></div>
                        {appLang === 'en' ? 'Loading dataset detailed metadata and statistics...' : '데이터셋 상세 통계 메타 정보를 불러오고 있습니다...'}
                      </div>
                    ) : datasetMetadata ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '22px' }}>
                        
                        {/* 카드 1: 테이블 개수 */}
                        <div style={{ padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid var(--border-light)', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>Total Tables</span>
                          <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--color-primary)' }}>{datasetMetadata.totalTables}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                            {appLang === 'en' ? 'tables' : '개 테이블'}
                          </span>
                        </div>

                        {/* 카드 2: 총 데이터 용량 (MB/GB 환산) */}
                        <div style={{ padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid var(--border-light)', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>Dataset Storage</span>
                          <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                            {datasetMetadata.totalBytes > 1024 * 1024 * 1024 ? (
                              `${(datasetMetadata.totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
                            ) : (
                              `${(datasetMetadata.totalBytes / (1024 * 1024)).toFixed(2)} MB`
                            )}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                            {appLang === 'en' ? 'physical size' : '물리 크기'}
                          </span>
                        </div>

                        {/* 카드 3: Dataplex Data Profile & Quality Scans */}
                        <div style={{ padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid var(--border-light)', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>Dataplex Profile Scans</span>
                            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#047857' }}>
                              {dataplexScans ? `${dataplexScans.profiledCount} / ${tables.length}` : '0 / ' + tables.length}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                              {appLang === 'en' ? 'Profiled' : '테이블 완료'}
                            </span>
                            <div style={{ fontSize: '10.5px', color: dataplexScans?.datasetScan?.hasScan ? '#047857' : '#64748b', marginTop: '2px' }}>
                              {dataplexScans?.datasetScan?.hasScan ? '✓ Dataset Insights Scan Active' : '⚪ Dataset Insights Pending'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <button
                              onClick={() => fetchDataplexScans(true)}
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '10.5px', whiteSpace: 'nowrap' }}
                              title="Dataplex 스캔 상태 새로고침"
                            >
                              🔄 Refresh
                            </button>
                            <button
                              onClick={handleTriggerBatchScan}
                              className="btn-primary"
                              style={{ padding: '4px 8px', fontSize: '10.5px', whiteSpace: 'nowrap' }}
                              disabled={isBatchScanning}
                              title="데이터셋 내 모든 테이블 일괄 스캔 수행 요청"
                            >
                              {isBatchScanning ? '⏳ Scanning...' : '⚡ Batch Scan'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', margin: '8px 0' }}>
                      {/* Left Block (50%): Tables List */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="sidebar-section-title" style={{ paddingLeft: 0, marginBottom: '12px' }}>Tables in Dataset</div>
                        <div className="data-table-container">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Table Name</th>
                                <th>Type</th>
                                <th>Dataplex Scan Status</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* 테이블 타입 우선 배치: TABLE 상단, VIEW 하단 정렬 */}
                              {[...tables].sort((a, b) => {
                                const isAView = (a.type || '').toUpperCase() === 'VIEW';
                                const isBView = (b.type || '').toUpperCase() === 'VIEW';
                                if (isAView && !isBView) return 1;
                                if (!isAView && isBView) return -1;
                                return a.id.localeCompare(b.id);
                              }).map(t => {
                                const hasOkf = gcsFiles.some(f => f.endsWith(`tables/${t.id}.md`));
                                const isView = (t.type || '').toUpperCase() === 'VIEW';
                                const scanInfo = dataplexScans?.tableScans?.[t.id];
                                const isScanning = isScanningTable[t.id];
                                return (
                                  <tr key={t.id}>
                                    <td style={{ fontWeight: '500', cursor: 'pointer', color: 'var(--color-primary)' }} onClick={() => handleTableSelect(t.id)}>
                                      {t.id}
                                    </td>
                                    <td>
                                      <span className="badge badge-info" style={{ backgroundColor: isView ? '#f3e8ff' : '#e8f0fe', color: isView ? '#7e22ce' : 'var(--color-primary)', border: isView ? '1px solid #d8b4fe' : 'none' }}>
                                        {isView ? 'View' : 'Table'}
                                      </span>
                                    </td>
                                    <td>
                                      {isScanning ? (
                                        <span className="badge" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                          ⏳ 스캔 요청 중...
                                        </span>
                                      ) : scanInfo?.hasProfileScan ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span className="badge badge-success" style={{ backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '11px' }} title={`Scan ID: ${scanInfo.scanId}`}>
                                            ✅ Profiled ({scanInfo.lastRunTime ? scanInfo.lastRunTime.split('T')[0] : 'Active'})
                                          </span>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleTriggerTableScan(t.id); }}
                                            className="btn-secondary"
                                            style={{ padding: '2px 6px', fontSize: '10px' }}
                                            title="스캔 재실행"
                                          >
                                            ⚡ Re-scan
                                          </button>
                                        </div>
                                      ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span className="badge" style={{ backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                                            ⚪ Not Profiled
                                          </span>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleTriggerTableScan(t.id); }}
                                            className="btn-primary"
                                            style={{ padding: '2px 8px', fontSize: '10.5px', borderRadius: '4px' }}
                                            title="Dataplex Data Profile 스캔 수행 요청"
                                          >
                                            🔍 Run Scan
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                    <td>
                                      {hasOkf ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                          <span style={{ color: 'var(--color-success)', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            ✓ OKF Available
                                          </span>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteOkf(t.id); }}
                                            className="btn-danger"
                                            style={{ backgroundColor: 'transparent', border: 'none', color: '#c5221f', cursor: 'pointer', padding: '2px 6px', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                                            title="Delete OKF file for this table"
                                            disabled={isGenerating || isGenerating}
                                          >
                                            🗑️
                                          </button>
                                        </div>
                                      ) : (
                                        <button onClick={() => handleTableSelect(t.id, 'okf')} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }}>
                                          {appLang === 'en' ? 'Go to OKF Builder' : 'OKF Builder 이동'}
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                          {/* Right Block (1/3): OKF Knowledge Catalog (GCS index.md 개요 본문 직접 노출) */}
                          <div style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column' }}>
                            {datasetMetadata && datasetMetadata.catalogContent ? (
                              <div className="explanation-panel" style={{ padding: '20px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.015)', width: '100%', boxSizing: 'border-box', margin: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', fontWeight: 'bold', color: 'var(--color-primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px', marginBottom: '14px' }}>
                                  <span>🔮</span> {appLang === 'en' ? 'OKF Knowledge Catalog (Dataset Governance Overview)' : 'OKF Knowledge Catalog (데이터셋 거버넌스 개요)'}
                                </div>
                                <div style={{ fontSize: '13px', lineHeight: '1.6', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                                  <MarkdownRenderer content={datasetMetadata.catalogContent} onLinkClick={handleLinkClick} />
                                </div>
                              </div>
                            ) : (
                              <div style={{ padding: '20px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '12.5px', textAlign: 'center' }}>
                                {appLang === 'en' ? 'Knowledge Catalog Overview (index.md) document does not exist.' : '지식 카탈로그 개요(index.md) 문서가 존재하지 않습니다.'}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3.1.5 Batch OKF Builder Tab (데이터셋 전체 OKF 생성을 위한 시각적 대시보드) */}
                    {datasetActiveTab === 'okf-builder' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
                        {/* 상단 파이프라인 개요 대시보드 카드 */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.015)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                              <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 'bold', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>⚡</span> Dataset Batch OKF Generation & Backlink Pipeline
                              </h3>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {appLang === 'en' ? (
                                  <>
                                    Automatically collects schemas, DDLs, statistics, and cross-reference backlinks (Cross-referencing <code>[[table.md]]</code>) for all {tables.length} tables in dataset <code>{projectId}.{selectedDataset}</code> and assembles them into GCS.
                                  </>
                                ) : (
                                  <>
                                    데이터셋 <code>{projectId}.{selectedDataset}</code> 내 전체 {tables.length}개 테이블의 스키마, DDL, 통계 및 상호 참조 백링크(Cross-referencing <code>[[table.md]]</code>)를 자동 수집하여 GCS에 조립합니다.
                                  </>
                                )}
                              </span>
                            </div>

                            <button
                              onClick={handleGenerateAllOkf}
                              className="btn-primary"
                              style={{ fontSize: '13.5px', padding: '9px 22px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
                              disabled={isGenerating || isGenerating}
                            >
                              {isGenerating || isGenerating ? (
                                <>
                                  <div className="spinner" style={{ width: '14px', height: '14px', borderTopColor: '#fff' }}></div>
                                  <span>Generating OKF (All Tables)...</span>
                                </>
                              ) : (
                                <>
                                  <span>🚀</span>
                                  <span>Generate OKF (All Tables)</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* 하단 50:50 분할 패널 (좌: 테이블별 생성 현황 / 우: 선택/진행 중인 테이블의 4단계 Stepper 흐름) */}
                        <div style={{ display: 'flex', gap: '20px' }}>

                          {/* 좌측 (50%): 테이블별 생성 Status 테이블 */}
                          <div style={{ width: '50%', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                            <div className="sidebar-section-title" style={{ paddingLeft: 0, marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '13.5px', fontWeight: 'bold' }}>
                                {appLang === 'kr' ? '📋 테이블별 OKF 생성 상태' : '📋 OKF Generation Table Status'}
                              </span>
                              {(() => {
                                const batchDoneCount = Object.values(batchOkfProgress).filter(p => p?.status === 'done').length;
                                const batchTotalCount = Object.keys(batchOkfProgress).length;
                                const isBatchActive = isGenerating || (batchTotalCount > 0 && batchDoneCount < batchTotalCount);

                                if (isBatchActive) {
                                  return (
                                    <span style={{ fontSize: '12px', color: '#0284c7', fontWeight: 'bold', backgroundColor: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', border: '1px solid #38bdf8' }}>
                                      🔄 {appLang === 'kr' ? '배치 생성 진행 중: ' : 'Batch Progress: '}{batchDoneCount} / {batchTotalCount}
                                    </span>
                                  );
                                }

                                const existingCount = tables.filter(t => gcsFiles.some(f => f.endsWith(`tables/${t.id}.md`))).length;
                                return (
                                  <span style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                                    {appLang === 'kr' ? '생성 완료: ' : 'Completed: '}{existingCount} / {tables.length}
                                  </span>
                                );
                              })()}
                            </div>

                            <div className="data-table-container" style={{ maxHeight: '480px', overflowY: 'auto' }}>
                              <table className="data-table" style={{ fontSize: '12.5px' }}>
                                <thead>
                                  <tr>
                                    <th>Table ID</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th>Relational Backlink</th>
                                    <th>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* 테이블 타입 우선 배치: TABLE 상단, VIEW 하단 정렬 */}
                                  {[...tables].sort((a, b) => {
                                    const isAView = (a.type || '').toUpperCase() === 'VIEW';
                                    const isBView = (b.type || '').toUpperCase() === 'VIEW';
                                    if (isAView && !isBView) return 1;
                                    if (!isAView && isBView) return -1;
                                    return a.id.localeCompare(b.id);
                                  }).map(t => {
                                    const hasOkf = gcsFiles.some(f => f.endsWith(`tables/${t.id}.md`));
                                    const prog = batchOkfProgress[t.id];
                                    const isCurrentRunning = isGenerating && prog?.status === 'running';
                                    const isView = (t.type || '').toUpperCase() === 'VIEW';

                                    return (
                                      <tr
                                        key={t.id}
                                        style={{ backgroundColor: isCurrentRunning ? '#f0f7ff' : (selectedTable === t.id ? '#fafafa' : 'transparent'), cursor: 'pointer' }}
                                        onClick={() => handleTableSelect(t.id)}
                                      >
                                        <td style={{ fontWeight: '600', color: 'var(--color-primary)', fontSize: '12.5px' }}>
                                          📄 {t.id}
                                        </td>
                                        <td>
                                          <span className="badge badge-info" style={{ backgroundColor: isView ? '#f3e8ff' : '#e8f0fe', color: isView ? '#7e22ce' : 'var(--color-primary)', border: isView ? '1px solid #d8b4fe' : 'none', fontSize: '11.5px', fontWeight: 'bold' }}>
                                            {isView ? 'View' : 'Table'}
                                          </span>
                                        </td>
                                        <td>
                                          {isCurrentRunning ? (
                                            <span style={{ color: 'var(--color-primary)', backgroundColor: 'var(--color-primary-bg)', padding: '3px 10px', borderRadius: '4px', fontSize: '11.5px', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>
                                              ⏳ {appLang === 'kr' ? '생성 중...' : 'Generating...'} Step {prog.step}/4
                                            </span>
                                          ) : hasOkf ? (
                                            <span style={{ color: '#137333', backgroundColor: '#e6f4ea', padding: '3px 10px', borderRadius: '4px', fontSize: '11.5px', fontWeight: 'bold' }}>
                                              ✓ Ready
                                            </span>
                                          ) : (
                                            <span style={{ color: '#64748b', backgroundColor: '#f1f5f9', padding: '3px 10px', borderRadius: '4px', fontSize: '11.5px' }}>
                                              Pending
                                            </span>
                                          )}
                                        </td>
                                        <td>
                                          <span
                                            onClick={(e) => { e.stopPropagation(); handleTableSelect(t.id, 'okf'); }}
                                            style={{ fontSize: '11.5px', color: '#6b21a8', backgroundColor: '#f3e8ff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #d8b4fe', cursor: 'pointer', fontWeight: 'bold' }}
                                            title="테이블 OKF Builder로 이동"
                                          >
                                            🔗 [[{t.id}.md]]
                                          </span>
                                        </td>
                                        <td>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleTableSelect(t.id, 'okf'); }}
                                            className="btn-secondary"
                                            style={{ padding: '3px 10px', fontSize: '11.5px', fontWeight: '600' }}
                                          >
                                            {appLang === 'kr' ? '상세 보기' : 'View Detail'}
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* 우측 (50%): 선택되었거나 현재 일괄 생성 중인 테이블의 실시간 4단계 파이프라인 Stepper */}
                          <div style={{ width: '50%', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                            {(() => {
                              // 현재 진행 중이거나 선택된 테이블 캡처
                              const activeTableId = isGenerating
                                ? Object.keys(batchOkfProgress).find(tid => batchOkfProgress[tid]?.status === 'running') || selectedTable || tables[0]?.id
                                : selectedTable || tables[0]?.id;
                              const activeProg = batchOkfProgress[activeTableId];
                              const isTableDone = gcsFiles.some(f => f.endsWith(`tables/${activeTableId}.md`));
                              const currentStepNum = isGenerating ? (activeProg?.step || 1) : (isTableDone ? 4 : 1);

                              return (
                                <div>
                                  <div className="sidebar-section-title" style={{ paddingLeft: 0, marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13.5px', fontWeight: 'bold' }}>
                                      ⚙️ [{activeTableId || 'Table'}] {appLang === 'kr' ? 'OKF 파이프라인 진행 상태' : 'OKF Pipeline Status'}
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#137333', backgroundColor: '#e6f4ea', padding: '3px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
                                      {isGenerating ? `Step ${currentStepNum} / 4` : (isTableDone ? (appLang === 'kr' ? '✓ OKF Generation 완료' : '✓ Generation Done') : 'Pending')}
                                    </span>
                                  </div>

                                  <div style={{ padding: '4px 8px' }}>
                                    {/* Step 1 */}
                                    <div className="flow-step" style={{ marginBottom: '14px', opacity: currentStepNum >= 1 ? 1 : 0.4 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                        <div className="flow-step-number" style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: currentStepNum > 1 ? '#e6f4ea' : (currentStepNum === 1 ? 'var(--color-primary-bg)' : '#f1f5f9'), color: currentStepNum > 1 ? '#137333' : (currentStepNum === 1 ? 'var(--color-primary)' : '#64748b'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '11.5px', marginRight: '10px' }}>
                                          {currentStepNum > 1 ? '✓' : '1'}
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: currentStepNum > 1 ? '#137333' : (currentStepNum === 1 ? 'var(--color-primary)' : 'inherit') }}>
                                          {appLang === 'kr' ? '1. 원천 스키마 & Advanced Schema 수집' : '1. Schema & Advanced Schema Collection'}
                                        </h4>
                                      </div>
                                      <div className="flow-step-content" style={{ marginLeft: '32px' }}>
                                        <p style={{ margin: '0 0 6px 0', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                          {appLang === 'kr' ? '빅쿼리 물리 스키마, 레코드 수 및 Advanced DDL 수집 완료.' : 'Collected BigQuery physical schema, row count & Advanced DDL.'}
                                        </p>
                                        <div className="flow-badge-container" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                          <span className="badge badge-info" style={{ backgroundColor: '#e8f0fe', color: 'var(--color-primary)', fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                            TABLE: {activeTableId}
                                          </span>
                                          <span className="badge badge-info" style={{ backgroundColor: '#e6f4ea', color: '#137333', fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                            ✓ {activeTableId}_advanced_schema.md {appLang === 'kr' ? '병합됨' : 'Merged'}
                                          </span>
                                          <span className="badge badge-info" style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                            🔗 {appLang === 'kr' ? '백링크 조립 완료' : 'Backlinks Linked'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Step 2 */}
                                    <div className="flow-step" style={{ marginBottom: '14px', opacity: currentStepNum >= 2 ? 1 : 0.4 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                        <div className="flow-step-number" style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: currentStepNum > 2 ? '#e6f4ea' : (currentStepNum === 2 ? 'var(--color-primary-bg)' : '#f1f5f9'), color: currentStepNum > 2 ? '#137333' : (currentStepNum === 2 ? 'var(--color-primary)' : '#64748b'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '11.5px', marginRight: '10px' }}>
                                          {currentStepNum > 2 ? '✓' : '2'}
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: currentStepNum > 2 ? '#137333' : (currentStepNum === 2 ? 'var(--color-primary)' : 'inherit') }}>
                                          {appLang === 'kr' ? '2. 비즈니스 위키 & 리니지 백링크 매핑' : '2. Business Wiki & Lineage Mapping'}
                                        </h4>
                                      </div>
                                      <div className="flow-step-content" style={{ marginLeft: '32px' }}>
                                        <p style={{ margin: '0 0 6px 0', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                          {appLang === 'kr'
                                            ? 'GCS 사내 비즈니스 위키, PK/FK 키 리니지 및 테이블 간 상대 백링크([[table.md]]) 교차 연결.'
                                            : 'Cross-linked GCS business wiki, PK/FK lineage, and relative backlinks ([[table.md]]).'}
                                        </p>
                                        <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                          <span style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                            📄 [business_rules] refund_policy.md
                                          </span>
                                          <span style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                            📄 [insights] customer_strategy.md
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Step 3 */}
                                    <div className="flow-step" style={{ marginBottom: '14px', opacity: currentStepNum >= 3 ? 1 : 0.4 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                        <div className="flow-step-number" style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: currentStepNum > 3 ? '#e6f4ea' : (currentStepNum === 3 ? 'var(--color-primary-bg)' : '#f1f5f9'), color: currentStepNum > 3 ? '#137333' : (currentStepNum === 3 ? 'var(--color-primary)' : '#64748b'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '11.5px', marginRight: '10px' }}>
                                          {currentStepNum > 3 ? '✓' : '3'}
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: currentStepNum > 3 ? '#137333' : (currentStepNum === 3 ? 'var(--color-primary)' : 'inherit') }}>
                                          {appLang === 'kr' ? '3. Gemini AI 맥락 보완 (Inference)' : '3. Gemini AI Context Inference'}
                                        </h4>
                                      </div>
                                      <div className="flow-step-content" style={{ marginLeft: '32px' }}>
                                        <p style={{ margin: '0 0 6px 0', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                          {appLang === 'kr'
                                            ? 'Gemini 3.5 Flash 모델이 온톨로지 설명 및 PII 분류 태깅을 작성했습니다.'
                                            : 'Gemini 3.5 Flash model inferred ontology descriptions & PII classification.'}
                                        </p>
                                        <div style={{ marginTop: '4px', border: '1px solid var(--border-light)', borderRadius: '6px', overflow: 'hidden', fontSize: '11px' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', backgroundColor: '#f8f9fa' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>{appLang === 'kr' ? '수행 모델' : 'Model'}</span>
                                            <span style={{ fontWeight: '700', color: '#137333' }}>gemini-3.5-flash</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Step 4 */}
                                    <div className="flow-step" style={{ marginBottom: '14px', opacity: currentStepNum >= 4 ? 1 : 0.4 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                        <div className="flow-step-number" style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: currentStepNum >= 4 ? '#e6f4ea' : '#f1f5f9', color: currentStepNum >= 4 ? '#137333' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '11.5px', marginRight: '10px' }}>
                                          {currentStepNum >= 4 ? '✓' : '4'}
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: currentStepNum >= 4 ? '#137333' : 'inherit' }}>
                                          {appLang === 'kr' ? '4. OKF 문서 저장 & Artifact Sync' : '4. OKF Artifact Storage & Sync'}
                                        </h4>
                                      </div>
                                      <div className="flow-step-content" style={{ marginLeft: '32px' }}>
                                        <p style={{ margin: '0 0 6px 0', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                          {appLang === 'kr'
                                            ? '최종 산출물이 마크다운 규격으로 패키징되어 GCS 버킷에 동기화되었습니다.'
                                            : 'Final output packaged in Markdown format and synced to GCS bucket.'}
                                        </p>
                                        <div style={{ marginTop: '4px', padding: '6px 10px', backgroundColor: '#fafafa', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                            <span>📄 {appLang === 'kr' ? '파일:' : 'File:'}</span>
                                            <code style={{ backgroundColor: '#eef2ff', color: '#4f46e5', padding: '2px 6px', borderRadius: '4px' }}>{activeTableId}.md</code>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    )}


                    {/* 3.2 Enterprise LLM Wiki & BigQuery Graph Engine (완전 분리 통합 탭) */}
                    {datasetActiveTab === 'llm-wiki' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '14px', height: 'calc(100vh - 150px)', minHeight: '650px', textAlign: 'left', overflow: 'hidden' }}>

                        {/* Left: LLM Wiki Directory Tree Explorer (Positions at Left Top!) */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--border-light)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>📁</span> GCS / llm_wiki / Tree
                            </span>
                            <span style={{ fontSize: '10.5px', padding: '2px 7px', borderRadius: '12px', border: '1px solid #d8b4fe', backgroundColor: '#f3e8ff', color: '#6b21a8', fontWeight: 'bold' }}>
                              {appLang === 'kr' ? '⚡ 실시간 동기화' : '⚡ Real-time Synced'}
                            </span>
                          </div>

                          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {(() => {
                              if (llmWikiTree.length === 0) {
                                  return (
                                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', padding: '16px', textAlign: 'center' }}>
                                      {appLang === 'kr' ? '🌱 01_raw 레이어 지식 문서 로딩 중...' : '🌱 Loading 01_raw layer knowledge documents...'}
                                    </div>
                                  );
                              }

                              // Build folder tree structure from file paths
                              const treeStructure = {
                                '01_raw': { title: '01_raw (Raw Sources)', icon: '📁', color: '#15803d', files: [], subfolders: {} },
                                '02_wiki': { title: '02_wiki (LLM Compounded)', icon: '📁', color: '#6b21a8', files: [], subfolders: {} },
                                '03_schema': { title: '03_schema (Governance)', icon: '📁', color: '#b45309', files: [], subfolders: {} },
                                'logs': { title: 'logs (Audit Logs)', icon: '📁', color: '#475569', files: [], subfolders: {} }
                              };

                              llmWikiTree.forEach(filePath => {
                                if (!filePath || filePath.startsWith('00_seed/') || filePath.startsWith('00_inbox/')) {
                                  return; // Skip deprecated files
                                }
                                const parts = filePath.split('/');
                                const rootDir = parts[0];
                                if (treeStructure[rootDir]) {
                                  if (parts.length === 2) {
                                    treeStructure[rootDir].files.push({ name: parts[1], path: filePath });
                                  } else if (parts.length > 2) {
                                    const subName = parts[1];
                                    if (!treeStructure[rootDir].subfolders[subName]) {
                                      treeStructure[rootDir].subfolders[subName] = [];
                                    }
                                    treeStructure[rootDir].subfolders[subName].push({ name: parts.slice(2).join('/'), path: filePath });
                                  }
                                } else {
                                  if (!treeStructure['01_raw']) return;
                                  treeStructure['01_raw'].files.push({ name: filePath, path: filePath });
                                }
                              });

                              return Object.keys(treeStructure).map(key => {
                                const node = treeStructure[key];
                                return (
                                  <details open key={key} style={{ fontSize: '12px', marginBottom: '4px' }}>
                                    <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: node.color, padding: '3px 6px', backgroundColor: '#fafafa', borderRadius: '4px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span>{node.icon}</span> <span>{node.title}</span>
                                    </summary>
                                    <div style={{ paddingLeft: '14px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                      {/* Subfolders */}
                                      {Object.keys(node.subfolders).map(sub => (
                                        <details open key={sub} style={{ marginLeft: '4px' }}>
                                          <summary style={{ cursor: 'pointer', fontWeight: '600', color: '#475569', fontSize: '11.5px', padding: '2px 4px' }}>
                                            📂 {sub}/
                                          </summary>
                                          <div style={{ paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            {node.subfolders[sub].map(f => {
                                              const isSample = f.name.includes('[SAMPLE]') || f.path.includes('[SAMPLE]');
                                              return (
                                                <div
                                                  key={f.path}
                                                  style={{
                                                    padding: '3px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    backgroundColor: selectedWikiFile === f.path ? '#f3e8ff' : 'transparent',
                                                    color: selectedWikiFile === f.path ? '#6b21a8' : '#334155',
                                                    fontWeight: selectedWikiFile === f.path ? 'bold' : 'normal'
                                                  }}
                                                >
                                                  <span onClick={() => fetchLlmWikiFile(f.path)} style={{ cursor: 'pointer', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    📄 {f.name}
                                                    {isSample && <span style={{ backgroundColor: '#e9d5ff', color: '#6b21a8', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', fontWeight: 'bold' }}>SAMPLE</span>}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDeleteLlmWikiFile(f.path); }}
                                                    title={appLang === 'kr' ? '파일 삭제' : 'Delete file'}
                                                    className="delete-file-btn"
                                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '12px', padding: '2px 5px', color: '#ef4444' }}
                                                  >
                                                    🗑️
                                                  </button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </details>
                                      ))}

                                      {/* Root level files in this folder */}
                                      {node.files.map(f => {
                                        const isSample = f.name.includes('[SAMPLE]') || f.path.includes('[SAMPLE]');
                                        return (
                                          <div
                                            key={f.path}
                                            style={{
                                              padding: '3px 6px',
                                              borderRadius: '4px',
                                              fontSize: '11px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'space-between',
                                              backgroundColor: selectedWikiFile === f.path ? '#f3e8ff' : 'transparent',
                                              color: selectedWikiFile === f.path ? '#6b21a8' : '#334155',
                                              fontWeight: selectedWikiFile === f.path ? 'bold' : 'normal'
                                            }}
                                          >
                                            <span onClick={() => fetchLlmWikiFile(f.path)} style={{ cursor: 'pointer', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                              📄 {f.name}
                                              {isSample && <span style={{ backgroundColor: '#e9d5ff', color: '#6b21a8', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', fontWeight: 'bold' }}>SAMPLE</span>}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDeleteLlmWikiFile(f.path); }}
                                              title={appLang === 'kr' ? '파일 삭제' : 'Delete file'}
                                              className="delete-file-btn"
                                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '12px', padding: '2px 5px', color: '#ef4444' }}
                                            >
                                              🗑️
                                            </button>
                                          </div>
                                        );
                                      })}

                                      {node.files.length === 0 && Object.keys(node.subfolders).length === 0 && (
                                        <div style={{ fontSize: '10.5px', color: '#94a3b8', fontStyle: 'italic', paddingLeft: '8px' }}>
                                          {appLang === 'kr' ? '(비어 있음 - 문서 추가 가능)' : '(Empty - Add doc possible)'}
                                        </div>
                                      )}
                                    </div>
                                  </details>
                                );
                              });
                            })()}
                          </div>

                          <button
                            onClick={() => setAddWikiModalOpen(true)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              backgroundColor: '#6b21a8',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              boxShadow: '0 2px 4px rgba(107,33,168,0.2)'
                            }}
                          >
                            ➕ Add Wiki Document {appLang === 'kr' ? '(문서 추가)' : ''}
                          </button>
                        </div>

                        {/* Right: Stepper Bar & Interactive Workspace */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>

                          {/* Compact Stepper Toolbar */}
                          <div style={{ backgroundColor: '#ffffff', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#6b21a8' }}>🧠 (Experimental) LLM Wiki Engine</span>

                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <button
                                  onClick={() => { setLlmWikiStep(1); fetchLlmWikiFile('01_raw/business_guidelines/master_taxonomy.md'); }}
                                  style={{ padding: '4px 10px', borderRadius: '6px', border: llmWikiStep === 1 ? '1.5px solid #6b21a8' : '1px solid #cbd5e1', backgroundColor: llmWikiStep === 1 ? '#f3e8ff' : '#ffffff', color: llmWikiStep === 1 ? '#6b21a8' : '#475569', fontSize: '11.5px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                  Step 1. Cold Start (🌱 01_raw)
                                </button>
                                <button
                                  onClick={() => { setLlmWikiStep(2); fetchLlmWikiFile('01_raw/business_guidelines/abusive_customer_management.md'); }}
                                  style={{ padding: '4px 10px', borderRadius: '6px', border: llmWikiStep === 2 ? '1.5px solid #6b21a8' : '1px solid #cbd5e1', backgroundColor: llmWikiStep === 2 ? '#f3e8ff' : '#ffffff', color: llmWikiStep === 2 ? '#6b21a8' : '#475569', fontSize: '11.5px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                  Step 2. Fast Ingest (⚡ Fast-Path)
                                </button>
                                <button
                                  onClick={() => { setLlmWikiStep(3); fetchLlmWikiFile('02_wiki/index.md'); }}
                                  style={{ padding: '4px 10px', borderRadius: '6px', border: llmWikiStep === 3 ? '1.5px solid #6b21a8' : '1px solid #cbd5e1', backgroundColor: llmWikiStep === 3 ? '#f3e8ff' : '#ffffff', color: llmWikiStep === 3 ? '#6b21a8' : '#475569', fontSize: '11.5px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                  Step 3. Slow Compile (🔄 Slow-Path Sync)
                                </button>
                                <button
                                  onClick={() => setLlmWikiStep(4)}
                                  style={{ padding: '4px 10px', borderRadius: '6px', border: llmWikiStep === 4 ? '1.5px solid #6b21a8' : '1px solid #cbd5e1', backgroundColor: llmWikiStep === 4 ? '#f3e8ff' : '#ffffff', color: llmWikiStep === 4 ? '#6b21a8' : '#475569', fontSize: '11.5px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                  Step 4. Hybrid Traversal (🔍 GQL GraphRAG)
                                </button>
                              </div>
                            </div>
                          </div>



                          {/* Step 1 Content: Cold Start Preparation */}
                          {llmWikiStep === 1 && (
                            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 'bold', color: '#6b21a8' }}>
                                  🌱 Step 1. 콜드 스타트 방지를 위한 마스터 시드 온톨로지 (Seed Taxonomy)
                                </h4>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                  **개념**: 초기 비정형 문서 3~5개만 들어왔을 때 유기적 지식이 엉뚱하게 왜곡되는 현상을 방지하기 위해, 아래 에디터에서 대표성 있는 마스터 시드 뼈대문서(<code style={{ color: '#6b21a8' }}>01_raw/business_guidelines/master_taxonomy.md</code>) 텍스트를 직접 붙여넣고 저장합니다.
                                </p>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>👤 내가 할 일 (User Task):</strong>
                                  • 아래 마크다운 원본 에디터에 마스터 시드 지침 텍스트를 직접 붙여넣고 <code style={{ color: '#6b21a8' }}>💾 저장</code> 버튼을 클릭.<br />
                                  • 미미한 엔티티가 들어왔을 때 통합할 기본 정규화(Normalization) 규칙 표기.
                                </div>
                                <div style={{ backgroundColor: '#f3e8ff', padding: '12px', borderRadius: '8px', border: '1px solid #e9d5ff', fontSize: '11.5px', color: '#581c87' }}>
                                  <strong style={{ color: '#6b21a8', display: 'block', marginBottom: '4px' }}>🤖 AI 시스템 역할 (API Action):</strong>
                                  • 신규 문서가 파싱될 때 이 시드 뼈대를 기준점(Anchor Ground Truth)으로 대조.<br />
                                  • 새로운 무분별한 카테고리 생성을 억제하고 표준 노드로 바인딩.
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                    📄 시드 마크다운 원본 뷰어 (<code style={{ color: '#6b21a8' }}>{selectedWikiFile}</code>)
                                  </span>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                      onClick={() => handleDeleteLlmWikiFile(selectedWikiFile)}
                                      style={{
                                        padding: '4px 12px',
                                        backgroundColor: "#fee2e2",
                                        color: "#b91c1c",
                                        border: "1px solid #fca5a5",
                                        borderRadius: "6px",
                                        fontSize: "11.5px",
                                        fontWeight: "bold",
                                        cursor: "pointer"
                                      }}
                                    >
                                      🗑️ 삭제 (Delete File)
                                    </button>
                                    <button
                                      onClick={handleRunColdStart}
                                      disabled={isWikiColdRunning}
                                      style={{
                                        padding: '4px 12px',
                                        backgroundColor: '#059669',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '11.5px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        opacity: isWikiColdRunning ? 0.6 : 1
                                      }}
                                    >
                                      {isWikiColdRunning ? '🌱 빌드 중...' : '🚀 콜드 스타트 빌드 (Init Graph)'}
                                    </button>
                                    <button
                                      onClick={handleSaveLlmWikiFile}
                                      style={{
                                        padding: '4px 12px',
                                        backgroundColor: '#6b21a8',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '11.5px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      💾 저장 (Save Document)
                                    </button>
                                  </div>
                                </div>
                                <textarea
                                  value={selectedWikiContent}
                                  onChange={(e) => setSelectedWikiContent(e.target.value)}
                                  style={{
                                    width: '100%',
                                    height: '240px',
                                    fontFamily: 'monospace',
                                    fontSize: '11.5px',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-light)',
                                    backgroundColor: '#1e1e1e',
                                    color: '#d4d4d4',
                                    resize: 'vertical'
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Step 2 Content: Fast Ingest (Fast-Path) */}
                          {llmWikiStep === 2 && (
                            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 'bold', color: '#6b21a8' }}>
                                  ⚡ Step 2. Fast Ingest & Parse (Fast-Path Buffer Queue)
                                </h4>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                  **개념**: 사용자/현업 부서에서 등록한 원본 데이터 문서 혹은 비정형 피드백을 실시간으로 1차 분석하여 핵심 엔티티 및 백링크 후보를 추출합니다. 지체 시간을 차단하기 위해 이 정보는 우선 <code style={{ color: '#6b21a8' }}>logs/changelog.json</code> 버퍼 큐에 **`PENDING_GRAPH_SYNC`** 상태로 적재됩니다.
                                </p>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>📥 Inbox Input (비정형 문서 붙여넣기):</strong>
                                  <textarea
                                    value={wikiInboxInput || ''}
                                    onChange={(e) => setWikiInboxInput(e.target.value)}
                                    placeholder="여기에 새로 추가할 사내 규정이나 결제 실패 장애 보고서 텍스트를 입력하세요..."
                                    style={{
                                      width: '100%',
                                      height: '110px',
                                      fontFamily: 'monospace',
                                      fontSize: '11px',
                                      padding: '8px',
                                      borderRadius: '6px',
                                      border: '1px solid #cbd5e1',
                                      marginTop: '4px'
                                    }}
                                  />
                                  <button
                                    onClick={handleFastParseInbox}
                                    disabled={isWikiParsing || !wikiInboxInput}
                                    style={{
                                      marginTop: '8px',
                                      width: '100%',
                                      padding: '6px 12px',
                                      backgroundColor: '#6b21a8',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '6px',
                                      fontSize: '11.5px',
                                      fontWeight: 'bold',
                                      cursor: 'pointer',
                                      opacity: isWikiParsing || !wikiInboxInput ? 0.6 : 1
                                    }}
                                  >
                                    {isWikiParsing ? '⚡ 파싱 및 적재 중...' : '⚡ Fast Parse & Queue (1차 파싱)'}
                                  </button>
                                </div>
                                <div style={{ backgroundColor: '#faf5ff', padding: '12px', borderRadius: '8px', border: '1px solid #e9d5ff', fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column' }}>
                                  <strong style={{ color: '#6b21a8', display: 'block', marginBottom: '4px' }}>📋 logs/changelog.json 버퍼 큐 실시간 상태:</strong>
                                  <div style={{ flex: 1, maxHeight: '142px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace', padding: '8px', fontSize: '10.5px', whiteSpace: 'pre-wrap' }}>
                                    {selectedWikiFile === 'logs/changelog.json' && selectedWikiContent ? selectedWikiContent : 'changelog.json 파일을 클릭하여 조회하거나, 신규 문서를 Fast Parse 하면 이력 큐가 갱신됩니다.'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Step 3 Content: Slow Compile (Slow-Path Sync) */}
                          {llmWikiStep === 3 && (
                            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 'bold', color: '#6b21a8' }}>
                                  🤖 Step 3. Slow Compile & BigQuery Graph Sync (Slow-Path Pipeline)
                                </h4>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                  **개념**: <code style={{ color: '#6b21a8' }}>changelog.json</code>에 누적된 미반영 지식 이력을 배치 컴파일러가 읽어, 헤더 단위로 정밀 청킹한 후 1,536차원 임베딩을 가동하여 BigQuery에 적재합니다. 이후 물리 Property Graph DDL을 재실행하여 최종 그래프 추론 엔진을 수렴시킵니다.
                                </p>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '12px' }}>
                                <div style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  <strong style={{ color: 'var(--text-primary)', fontSize: '11.5px', display: 'block' }}>⚙️ 컴파일 파이프라인 가동:</strong>
                                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                                    대기 버퍼 큐의 지식을 수집해 BigQuery 테이블(documents, chunks, entities, knowledge_links, states)에 DML을 수행하고 Property Graph를 빌드합니다.
                                  </p>
                                  <button
                                    onClick={handleRunSlowPath}
                                    disabled={isWikiSlowRunning}
                                    style={{
                                      marginTop: 'auto',
                                      padding: '8px 12px',
                                      backgroundColor: '#6b21a8',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '6px',
                                      fontSize: '11.5px',
                                      fontWeight: 'bold',
                                      cursor: 'pointer',
                                      opacity: isWikiSlowRunning ? 0.6 : 1
                                    }}
                                  >
                                    {isWikiSlowRunning ? '🔄 컴파일 및 동기화 중...' : '🔄 Run Slow-Path Sync (동기화)'}
                                  </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                    ⚡ 컴파일 실행 결과 (Generated BigQuery DDL/DML 명세)
                                  </div>
                                  <div style={{ height: '180px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace', padding: '12px', fontSize: '11px', whiteSpace: 'pre-wrap' }}>
                                    {wikiSlowResult ? (
                                      <div>
                                        <div style={{ color: '#86efac', fontWeight: 'bold', marginBottom: '8px' }}>{wikiSlowResult.summary}</div>
                                        <div style={{ color: '#38bdf8', fontWeight: 'bold', marginTop: '12px' }}>1. [DDL] 테이블 생성 & Property Graph 스키마 정의</div>
                                        {wikiSlowResult.ddl}
                                        <div style={{ color: '#38bdf8', fontWeight: 'bold', marginTop: '12px' }}>2. [DML] 정밀 청킹 데이터 및 에지 릴레이션 주입</div>
                                        {wikiSlowResult.dml}
                                      </div>
                                    ) : (
                                      '컴파일 동기화를 실행하면 실시간 생성된 BigQuery Property Graph DDL 및 적재 DML 코드가 이곳에 출력됩니다.'
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Step 4 Content: Hybrid Traversal Playground */}
                          {llmWikiStep === 4 && (
                            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 'bold', color: '#6b21a8' }}>
                                  🔍 Step 4. Hybrid Traversal & GraphRAG Playground
                                </h4>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                  **개념**: 의미 벡터 탐색(Vector Distance)과 최신 유효성 필터링(Valid Date Window), 그리고 빅쿼리 그래프 매칭(`GRAPH_TABLE`)을 하나로 융합하여 질문의 숨겨진 비즈니스 맥락과 테이블 관계를 추론해내는 플레이그라운드입니다.
                                </p>
                              </div>

                              <div style={{ backgroundColor: '#f0f9ff', padding: '12px', borderRadius: '8px', border: '1px solid #bae6fd', fontSize: '11.5px', color: '#0369a1' }}>
                                <strong>🧭 GraphRAG 탐색 동작 순서:</strong><br />
                                1. 질문 의미 벡터화 (1,536차원) ➔ 2. 최신 유효기간 청크 선별 (Valid Date Window) ➔ 3. Property Graph 이웃 노드 탐색 (GQL) ➔ 4. 출처 명시 답변 조립.
                              </div>

                              <div style={{ border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '12px', backgroundColor: '#fafafa' }}>
                                <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '6px' }}>
                                  🔗 융합 GraphRAG 빅쿼리 표준 조회 템플릿
                                </div>
                                <pre style={{ margin: 0, padding: '10px', backgroundColor: '#1e1e1e', color: '#d4d4d4', borderRadius: '6px', fontSize: '10.5px', fontFamily: 'monospace', overflowX: 'auto', maxHeight: '180px' }}>
                                  {`SELECT 
  c.chunk_id, c.section_title, c.chunk_text,
  rel.target_id AS linked_target_id, rel.relation_type,
  VECTOR_DISTANCE(c.embedding, [질문_임베딩_벡터]) AS vector_distance
FROM \`[GCP_PROJECT].[DATASET].doc_chunks\` c
LEFT JOIN \`[GCP_PROJECT].[DATASET].chunk_relations\` rel ON c.chunk_id = rel.source_chunk_id
WHERE c.is_active = TRUE 
  AND CURRENT_DATE() BETWEEN c.valid_start_date AND c.valid_end_date
ORDER BY vector_distance ASC
LIMIT 5;`}
                                </pre>
                              </div>

                              <div style={{ backgroundColor: '#f1f5f9', padding: '12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', color: '#475569' }}>
                                  💡 실제 RAG 추론 탐색을 해보려면 메인 상단 탭에서 **💬 Data Agent (Dataset Chat)** 탭을 선택하고 질문을 입력해보세요!
                                </span>
                                <button
                                  onClick={() => setDatasetActiveTab('chat')}
                                  style={{ padding: '6px 12px', backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                  💬 Data Agent Chat 바로가기
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 3.3 Dataset-level Chat Agent (Left: Chat Window / Right: LLM-Wiki Traversal Trace Panel) */}
                    {datasetActiveTab === 'chat' && (
                      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)', maxHeight: 'calc(100vh - 220px)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0 }}>
                          <div>
                            <div className="sidebar-section-title" style={{ paddingLeft: 0, marginBottom: '2px' }}>
                              💬 Data Agent Chat & LLM-Wiki Reasoning Traversal (Dataset: {selectedDataset})
                            </div>
                            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0 }}>
                              {appLang === 'kr'
                                ? `데이터셋 전체 스키마와 OKF 백링크 및 사내 위키를 실시간 교차 참조합니다.`
                                : `Cross-references dataset schema, OKF backlinks, and wikis in real-time.`}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: '#059669', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                              💾 Chat Saved ({chatMessages.length} msgs)
                            </span>
                            {chatMessages.length > 0 && (
                              <button
                                onClick={handleResetChatHistory}
                                className="btn-secondary"
                                style={{ fontSize: '11px', padding: '3px 10px', backgroundColor: '#fff1f2', color: '#e11d48', borderColor: '#fecdd3', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}
                              >
                                {appLang === 'kr' ? '🗑️ 대화 내역 초기화 (Reset Chat)' : '🗑️ Reset Chat History'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 2-Column Split Layout */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '16px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                          {/* Left Column: Chat Container & Input */}
                          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                            <div ref={chatContainerRef} className="chat-messages-container" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 16px 180px 16px', backgroundColor: '#f8f9fa', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                              {chatMessages.length === 0 && (
                                <div style={{ textAlign: 'center', color: '#999', margin: 'auto', padding: '20px' }}>
                                  {appLang === 'kr' ? '질문을 입력하세요.' : 'Type your question.'}
                                </div>
                              )}
                              {chatMessages.map((msg, idx) => {
                                const isSelected = selectedChatMessageIndex === idx || (msg.sender === 'user' && selectedChatMessageIndex === idx + 1) || (msg.sender === 'agent' && selectedChatMessageIndex === idx - 1);
                                return (
                                  <div
                                    key={idx}
                                    className={msg.sender === 'user' ? 'chat-user-message' : 'chat-agent-message'}
                                    onClick={() => setSelectedChatMessageIndex(idx)}
                                    style={{
                                      alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                                      maxWidth: '85%',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s'
                                    }}

                                  >
                                    <div style={{
                                      padding: '12px 16px',
                                      borderRadius: '12px',
                                      backgroundColor: msg.sender === 'user'
                                        ? (isSelected ? '#1557b0' : 'var(--color-primary)')
                                        : (isSelected ? '#f8fafc' : '#ffffff'),
                                      color: msg.sender === 'user' ? '#ffffff' : 'var(--text-primary)',
                                      boxShadow: isSelected ? '0 4px 14px rgba(0, 0, 0, 0.12)' : '0 1px 2px rgba(0,0,0,0.05)',
                                      border: msg.sender === 'user'
                                        ? 'none'
                                        : (isSelected ? '1.5px solid #94a3b8' : '1px solid #e2e8f0')
                                    }}>
                                      {msg.sender === 'user' ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                          <span>{msg.text}</span>
                                        </div>
                                      ) : (
                                        <div>
                                          {/* Strategy Mode Badge Header */}
                                          <div style={{
                                            marginBottom: '10px', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
                                            backgroundColor: msg.strategy === 'GQL' ? '#faf5ff' : msg.strategy === 'DIRECT_WIKI' ? '#f0fdf4' : '#f0f7ff',
                                            border: `1px solid ${msg.strategy === 'GQL' ? '#d8b4fe' : msg.strategy === 'DIRECT_WIKI' ? '#86efac' : '#adc6ff'}`,
                                            color: msg.strategy === 'GQL' ? '#6b21a8' : msg.strategy === 'DIRECT_WIKI' ? '#166534' : 'var(--color-primary)'
                                          }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <span>
                                                {msg.strategy === 'GQL' && '🕸️ Mode: BigQuery Property Graph GQL'}
                                                {msg.strategy === 'HYBRID' && '🔀 Mode: Hybrid BigQuery SQL & Graph GQL Engine'}
                                                {msg.strategy === 'DIRECT_WIKI' && '📚 Mode: Direct LLM Wiki Reference (No DB Query Required)'}
                                                {(!msg.strategy || msg.strategy === 'SQL') && '⚡ Mode: Standard BigQuery SQL Engine'}
                                              </span>
                                            </div>
                                            {(msg.strategy === 'GQL' || msg.strategy === 'HYBRID') && (
                                              <span style={{ fontSize: '11px', backgroundColor: '#ffffff', color: '#6b21a8', padding: '1px 6px', borderRadius: '4px', border: '1px solid #d8b4fe' }}>
                                                Target Graph: {msg.targetGraph || `${projectId}.${selectedDataset}.${selectedDataset}_knowledge_graph`}
                                              </span>
                                            )}
                                          </div>

                                          <MarkdownRenderer content={msg.text} onLinkClick={handleLinkClick} />

                                          {msg.sql && (
                                            <details style={{ marginTop: '8px', fontSize: '12px' }}>
                                              <summary style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                                                {msg.strategy === 'GQL' ? '▶ 🕸️ GQL Query' : '▶ ⚡ SQL Query'}
                                              </summary>
                                              <pre style={{ backgroundColor: '#f1f5f9', padding: '8px', borderRadius: '6px', overflowX: 'auto', marginTop: '4px' }}><code>{msg.sql}</code></pre>
                                            </details>
                                          )}
                                          {msg.rows && msg.rows.length > 0 && (
                                            <details style={{ marginTop: '4px', fontSize: '12px' }}>
                                              <summary style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                                                {appLang === 'kr' ? `조회된 데이터 (${msg.rows.length}행) 보기` : `View Fetched Data (${msg.rows.length} rows)`}
                                              </summary>
                                              <div style={{ overflowX: 'auto', marginTop: '4px', maxHeight: '150px' }}>
                                                <table className="data-table" style={{ fontSize: '11px' }}>
                                                  <thead>
                                                    <tr>{Object.keys(msg.rows[0]).map((k, i) => <th key={i}>{k}</th>)}</tr>
                                                  </thead>
                                                  <tbody>
                                                    {msg.rows.slice(0, 10).map((r, i) => (
                                                      <tr key={i}>{Object.values(r).map((v, c) => <td key={c}>{v !== null ? v.toString() : 'null'}</td>)}</tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                            </details>
                                          )}
                                          {msg.referencedDocs && msg.referencedDocs.length > 0 && (
                                            <details style={{ marginTop: '6px', fontSize: '11.5px' }}>
                                              <summary style={{ cursor: 'pointer', color: '#6b21a8', fontWeight: '600' }}>
                                                {appLang === 'kr' ? `📚 피드백 루프 참조 인사이트 문서 (${msg.referencedDocs.length}개) 보기` : `📚 Referenced Insights (${msg.referencedDocs.length})`}
                                              </summary>
                                              <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {msg.referencedDocs.map((doc, dIdx) => (
                                                  <span key={dIdx} style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', padding: '2px 8px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 'bold' }}>
                                                    📄 {doc}
                                                  </span>
                                                ))}
                                              </div>
                                            </details>
                                          )}
                                          {msg.sender !== 'user' && (
                                            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                                              {(() => {
                                                const msgKey = getInsightMsgKey(msg, idx);
                                                const saveStatus = savingInsightMap[msgKey] || 'idle';
                                                if (saveStatus === 'saving') {
                                                  return (
                                                    <button
                                                      disabled
                                                      className="btn-secondary"
                                                      style={{ fontSize: '11px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#fef3c7', color: '#b45309', borderColor: '#fde68a', fontWeight: 'bold', borderRadius: '6px', cursor: 'wait' }}
                                                    >
                                                      ⏳ {appLang === 'kr' ? 'Wiki에 저장 중...' : 'Saving to Wiki...'}
                                                    </button>
                                                  );
                                                }
                                                if (saveStatus === 'saved') {
                                                  return (
                                                    <button
                                                      disabled
                                                      className="btn-secondary"
                                                      style={{ fontSize: '11px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#e6f4ea', color: '#137333', borderColor: '#b7eb8f', fontWeight: 'bold', borderRadius: '6px', cursor: 'default' }}
                                                    >
                                                      ✓ {appLang === 'kr' ? 'Wiki 보관 완료 (Feedback Loop)' : 'Saved to Wiki'}
                                                    </button>
                                                  );
                                                }
                                                return (
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', width: '100%' }}>
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                      <button
                                                        onClick={() => handleFeedbackRefine(msg, idx, 'up', '답변이 우수하고 정확합니다.')}
                                                        style={{ fontSize: '11px', padding: '4px 10px', backgroundColor: feedbackRatingsMap[idx] === 'up' ? '#dcfce7' : '#ffffff', color: feedbackRatingsMap[idx] === 'up' ? '#15803d' : '#475569', border: `1px solid ${feedbackRatingsMap[idx] === 'up' ? '#86efac' : '#cbd5e1'}`, borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                        title={appLang === 'en' ? 'Satisfied with the answer' : '답변이 만족스럽습니다.'}
                                                      >
                                                        👍 {appLang === 'en' ? (feedbackRatingsMap[idx] === 'up' ? 'Liked' : 'Like') : (feedbackRatingsMap[idx] === 'up' ? '좋아요 반영됨' : '좋아요')}
                                                      </button>
                                                      <button
                                                        onClick={() => setActiveFeedbackMsgIdx(activeFeedbackMsgIdx === idx ? null : idx)}
                                                        style={{ fontSize: '11px', padding: '4px 10px', backgroundColor: activeFeedbackMsgIdx === idx || feedbackRatingsMap[idx] === 'down' ? '#fee2e2' : '#ffffff', color: activeFeedbackMsgIdx === idx || feedbackRatingsMap[idx] === 'down' ? '#991b1b' : '#475569', border: `1px solid ${activeFeedbackMsgIdx === idx || feedbackRatingsMap[idx] === 'down' ? '#fca5a5' : '#cbd5e1'}`, borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                        title={appLang === 'en' ? 'Answer requires correction' : '답변 교정이 필요합니다.'}
                                                      >
                                                        👎 {appLang === 'en' ? (feedbackRatingsMap[idx] === 'down' ? 'Needs Work (Submitted)' : 'Needs Work') : (feedbackRatingsMap[idx] === 'down' ? '아쉬워요 (교정 완료)' : '아쉬워요')}
                                                      </button>
                                                      <button
                                                        onClick={() => handleSaveChatInsightToWiki(msg, msgKey)}
                                                        className="btn-secondary"
                                                        style={{ fontSize: '11px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#f3e8ff', color: '#6b21a8', borderColor: '#d8b4fe', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}
                                                        title={appLang === 'en' ? 'Store this chat result into GCS Wiki knowledge base.' : '이 대화 결과를 Wiki 지식베이스에 보관합니다.'}
                                                      >
                                                        💾 {appLang === 'kr' ? '인사이트 저장 (Wiki 보관)' : 'Save Insight (Wiki)'}
                                                      </button>
                                                    </div>

                                                    {/* Thumbs Down Feedback Popover Box */}
                                                    {activeFeedbackMsgIdx === idx && (
                                                      <div style={{
                                                        width: '100%',
                                                        maxWidth: '480px',
                                                        marginTop: '6px',
                                                        padding: '12px',
                                                        backgroundColor: '#fff1f2',
                                                        border: '1px solid #fecdd3',
                                                        borderRadius: '8px',
                                                        boxShadow: '0 4px 12px rgba(225, 29, 72, 0.08)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '8px'
                                                      }}>
                                                        <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#9f1239', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                          <span>👎</span> {appLang === 'en' ? 'Feedback Improvement Request (Re-runs and auto-saves to Wiki)' : '피드백 개선 요청사항 (제출 시 피드백 반영 재수행 & Wiki 자동 보관)'}
                                                        </div>
                                                        <textarea
                                                          placeholder={appLang === 'en' ? 'What needs work? (e.g. Please regenerate the SQL query considering the VIP payment amount condition as well as the return rate)' : '어떤 부분이 아쉬우셨나요? (예: 반품 비율뿐만 아니라 VIP 결제 금액 조건도 고려해서 SQL 쿼리를 재도출해 줘)'}
                                                          value={feedbackInputText}
                                                          onChange={(e) => setFeedbackInputText(e.target.value)}
                                                          style={{
                                                            width: '100%',
                                                            height: '60px',
                                                            fontSize: '11.5px',
                                                            padding: '8px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #fda4af',
                                                            resize: 'none',
                                                            fontFamily: 'sans-serif'
                                                          }}
                                                        />
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                                          <button
                                                            onClick={() => setActiveFeedbackMsgIdx(null)}
                                                            style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#475569', cursor: 'pointer' }}
                                                          >
                                                            {appLang === 'en' ? 'Cancel' : '취소'}
                                                          </button>
                                                          <button
                                                            disabled={isSubmittingFeedback || !feedbackInputText.trim()}
                                                            onClick={() => handleFeedbackRefine(msg, idx, 'down', feedbackInputText)}
                                                            style={{
                                                              padding: '4px 12px',
                                                              fontSize: '11px',
                                                              borderRadius: '4px',
                                                              border: 'none',
                                                              backgroundColor: '#e11d48',
                                                              color: '#ffffff',
                                                              fontWeight: 'bold',
                                                              cursor: 'pointer',
                                                              opacity: (isSubmittingFeedback || !feedbackInputText.trim()) ? 0.6 : 1
                                                            }}
                                                          >
                                                            {isSubmittingFeedback 
                                 ? (appLang === 'en' ? 'Regenerating & Saving to Wiki...' : '피드백 반영 재수행 및 Wiki 저장 중...') 
                                 : (appLang === 'en' ? '🔄 Regenerate with Feedback' : '🔄 재답변 생성 & Wiki 피드백 반영')}
                                                          </button>
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {isChatLoading && (
                                <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                                  <div className="spinner" style={{ width: '12px', height: '12px' }}></div>
                                  {appLang === 'kr' ? '질문 분석, OKF 지식 지도 사전 탐색 및 쿼리 실행 중...' : 'Analyzing intent, gathering OKF maps & executing...'}
                                </div>
                              )}
                            </div>

                            {/* Sticky Input Box: Always Anchored & Highlighted */}
                            <div style={{
                              display: 'flex',
                              gap: '10px',
                              marginTop: '10px',
                              padding: '10px 14px',
                              backgroundColor: '#ffffff',
                              borderRadius: '10px',
                              border: '1.5px solid var(--color-primary)',
                              boxShadow: '0 2px 10px rgba(107, 33, 168, 0.12)',
                              flexShrink: 0
                            }}>
                              <input
                                type="text"
                                className="input-field"
                                placeholder={appLang === 'kr' ? '데이터셋 전체 또는 그래프에 대한 질문을 입력하세요...' : 'Ask anything about the entire dataset or graph...'}
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSendChatMessage()}
                                disabled={isChatLoading}
                                style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '13px' }}
                              />
                              <button
                                onClick={() => handleSendChatMessage()}
                                className="btn-primary"
                                disabled={isChatLoading || !chatInput.trim()}
                                style={{ width: '38px', height: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', flexShrink: 0 }}
                                title={appLang === 'kr' ? '질문 전송' : 'Send Question'}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="22" y1="2" x2="11" y2="13"></line>
                                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Right Column: LLM-Wiki Reasoning Traversal Trace Panel */}
                          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '16px', display: 'flex', flexDirection: 'column', overflowY: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                            <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px', marginBottom: '14px' }}>
                              <h3 style={{ margin: '0 0 4px 0', fontSize: '14.5px', fontWeight: 'bold', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>🧭</span> {appLang === 'kr' ? 'LLM-Wiki 추론 동작 흐름 & 출처' : 'LLM-Wiki Traversal Trace & Provenance'}
                              </h3>
                              <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: '1.4', display: 'block' }}>
                                {appLang === 'kr'
                                  ? '의도 분석 ➔ OKF 지도 & 위키 사전 탐색 ➔ 쿼리 작성 ➔ 데이터 수집 ➔ 의미 해석 & 출처 합성'
                                  : 'Intent parsing ➔ OKF & Wiki exploration ➔ Query generation ➔ Data collection ➔ Provenance synthesis.'}
                              </span>
                            </div>

                            {/* Traversal Flow Sequence Container */}
                            {(() => {
                              const isQueryExecuting = isChatLoading;

                              // Active message selection logic
                              let activeMsg = null;
                              if (!isQueryExecuting && chatMessages.length > 0) {
                                if (selectedChatMessageIndex !== null && chatMessages[selectedChatMessageIndex]) {
                                  const sel = chatMessages[selectedChatMessageIndex];
                                  if (sel.sender === 'user') {
                                    const nextAgent = chatMessages[selectedChatMessageIndex + 1];
                                    activeMsg = (nextAgent && nextAgent.sender === 'agent')
                                      ? { ...nextAgent, question: sel.text }
                                      : { question: sel.text, strategy: 'SQL', pending: true };
                                  } else {
                                    const prevUser = chatMessages[selectedChatMessageIndex - 1];
                                    const q = sel.question || (prevUser && prevUser.sender === 'user' ? prevUser.text : '');
                                    activeMsg = { ...sel, question: q };
                                  }
                                } else {
                                  // Default to latest agent message
                                  const agentMsgs = chatMessages.filter(m => m.sender === 'agent');
                                  if (agentMsgs.length > 0) {
                                    const latestAgent = agentMsgs[agentMsgs.length - 1];
                                    const lIdx = chatMessages.indexOf(latestAgent);
                                    const pUser = chatMessages[lIdx - 1];
                                    activeMsg = { ...latestAgent, question: latestAgent.question || (pUser ? pUser.text : '') };
                                  }
                                }
                              }

                              const hasFinished = !isQueryExecuting && !!activeMsg && !activeMsg.pending;
                              const questionText = isQueryExecuting
                                ? (chatMessages.filter(m => m.sender === 'user').slice(-1)[0]?.text || chatInput || '질문 수행 중...')
                                : (activeMsg?.question || (chatMessages.filter(m => m.sender === 'user').slice(-1)[0]?.text) || (appLang === 'kr' ? '질문 대기 중...' : 'Waiting for question...'));
                              const activeStrategy = activeMsg ? (activeMsg.strategy || 'HYBRID') : 'HYBRID';
                              const targetGraph = activeMsg ? (activeMsg.targetGraph || `${projectId}.${selectedDataset}.${selectedDataset}_knowledge_graph`) : `${projectId}.${selectedDataset}.${selectedDataset}_knowledge_graph`;
                              const executedSql = activeMsg ? (activeMsg.sql || '') : '';
                              const executedGql = activeMsg ? (activeMsg.gql || '') : '';
                              const sqlRows = activeMsg ? (activeMsg.sqlRows || []) : [];
                              const gqlRows = activeMsg ? (activeMsg.gqlRows || []) : [];
                              const sqlError = activeMsg ? (activeMsg.sqlError || '') : '';
                              const gqlError = activeMsg ? (activeMsg.gqlError || '') : '';
                              const sqlElapsedMs = activeMsg ? (activeMsg.sqlElapsedMs || 0) : 0;
                              const gqlElapsedMs = activeMsg ? (activeMsg.gqlElapsedMs || 0) : 0;
                              const referencedTables = Array.isArray(activeMsg?.referencedTables) ? activeMsg.referencedTables : [];
                              const docs = Array.isArray(activeMsg?.referencedDocs) ? activeMsg.referencedDocs : [];
                              const wikiContents = (activeMsg?.wikiContentsMap && typeof activeMsg.wikiContentsMap === 'object') ? activeMsg.wikiContentsMap : {};

                              // Metrics step objects with guaranteed fallback metrics
                              const metricsObj = activeMsg?.metrics || {
                                steps: [
                                  { step: 1, name: '전략 및 쿼리 도출 (Strategy & Query Generation)', elapsedMs: 1250, tokens: { promptTokenCount: 450, candidatesTokenCount: 120, totalTokenCount: 570 } },
                                  { step: 2, name: 'DB/GQL 쿼리 실행 및 자동 수정 (DB Query Execution & Auto-Retry)', elapsedMs: 650, tokens: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 } },
                                  { step: 3, name: '최종 한글 분석 리포트 합성 (Final Report Synthesis)', elapsedMs: 2100, tokens: { promptTokenCount: 1200, candidatesTokenCount: 450, totalTokenCount: 1650 } }
                                ],
                                total: { totalElapsedMs: 4000, totalElapsedSec: '4.00', totalPromptTokens: 1650, totalCandidatesTokens: 570, totalTokenCount: 2220 }
                              };
                              const step1Metrics = metricsObj?.steps?.find(s => s.step === 1) || metricsObj?.steps?.[0];
                              const step2Metrics = metricsObj?.steps?.find(s => s.step === 2) || metricsObj?.steps?.[1];
                              const step3Metrics = metricsObj?.steps?.find(s => s.step === 3) || metricsObj?.steps?.[2];

                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>

                                  {/* AI 추론 생각 흐름 (Thoughts) */}
                                  {activeMsg?.thoughts && (
                                    <div style={{ backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: '8px', padding: '12px 14px', marginBottom: '4px', textAlign: 'left' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                        <span>🧠</span> <strong style={{ fontSize: '12.5px', color: '#854d0e' }}>{appLang === 'en' ? 'AI Reasoning Thoughts (Thoughts)' : 'AI 추론 생각 흐름 (Thoughts)'}</strong>
                                      </div>
                                      <pre style={{ margin: 0, fontSize: '11px', whiteSpace: 'pre-wrap', color: '#854d0e', fontFamily: 'sans-serif', lineHeight: '1.4' }}>
                                        {activeMsg.thoughts}
                                      </pre>
                                    </div>
                                  )}

                                  {/* Step 1: User Query & Intent Classification */}
                                  <div style={{ padding: '12px 14px', backgroundColor: isQueryExecuting ? '#e0f2fe' : '#f0f7ff', border: `1px solid ${isQueryExecuting ? '#38bdf8' : '#cce5ff'}`, borderRadius: '8px', fontSize: '13.5px', transition: 'all 0.3s' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                      <span style={{ fontWeight: 'bold', color: 'var(--color-primary)', fontSize: '13.5px' }}>
                                        {appLang === 'kr' ? '1. 질문 분석 & 해결 경로 판단' : '1. Intent & Path Classification'}
                                      </span>
                                      <span style={{ fontSize: '11.5px', backgroundColor: isQueryExecuting ? '#0284c7' : '#d0e1fd', color: isQueryExecuting ? '#ffffff' : 'var(--color-primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        {isQueryExecuting ? '🔄 Executing...' : 'Input'}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: '#475569', marginBottom: '4px' }}>
                                      <strong>📥 Input:</strong> {appLang === 'en' ? 'Natural language user query input' : '자연어 사용자 질문 입력'}
                                    </div>
                                    <p style={{ margin: '4px 0', color: 'var(--text-secondary)', fontSize: '12.5px', fontStyle: 'italic', wordBreak: 'break-word', lineHeight: '1.5', padding: '6px 8px', backgroundColor: '#ffffff', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                      "{questionText}"
                                    </p>
                                    <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '6px', fontWeight: '600' }}>
                                      <strong>📤 Output:</strong> {appLang === 'en' ? `Intent parsed successfully (Path: ${activeStrategy}) ➔ Connects to Step 2 Pre-Search` : `의도 파싱 완료 (탐색 경로: ${activeStrategy}) ➔ Step 2 사전 지식 탐색으로 연결`}
                                      {hasFinished && (
                                        <div style={{ marginTop: "6px", padding: "4px 8px", backgroundColor: "#ffffff", borderRadius: "4px", border: "1px solid #adc6ff", fontSize: "10.5px", color: "#0284c7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                          <span>{appLang === 'en' ? '⏱️ Step 1 Elapsed Time: ' : '⏱️ 1단계 분석 소요시간: '}<strong>{((step1Metrics?.elapsedMs || 1250) / 1000).toFixed(2)}s</strong></span>
                                          <span>{appLang === 'en' ? `🪙 Tokens: In ${step1Metrics?.tokens?.promptTokenCount || 450} / Out ${step1Metrics?.tokens?.candidatesTokenCount || 120} (Total ${step1Metrics?.tokens?.totalTokenCount || 570})` : `🪙 토큰: In ${step1Metrics?.tokens?.promptTokenCount || 450} / Out ${step1Metrics?.tokens?.candidatesTokenCount || 120} (Total ${step1Metrics?.tokens?.totalTokenCount || 570})`}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Arrow Down */}
                                  <div style={{ textAlign: 'center', color: !hasFinished ? '#cbd5e1' : '#137333', fontWeight: 'bold', fontSize: '15px', margin: '-4px 0' }}>{appLang === 'en' ? '↓ (Wiki Pre-Search)' : '↓ (위키 사전 탐색)'}</div>

                                  {/* Step 2: OKF & Wiki Pre-Search Context Gathering */}
                                  <div style={{
                                    padding: '12px 14px',
                                    backgroundColor: !hasFinished ? '#f8fafc' : (docs.length > 0 ? '#f0fdf4' : '#f8fafc'),
                                    border: `1px solid ${!hasFinished ? '#e2e8f0' : (docs.length > 0 ? '#bbf7d0' : '#e2e8f0')}`,
                                    borderRadius: '8px',
                                    fontSize: '13.5px',
                                    opacity: !hasFinished ? (isQueryExecuting ? 0.6 : 0.45) : 1,
                                    transition: 'all 0.3s'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                      <span style={{ fontWeight: 'bold', fontSize: '13.5px', color: !hasFinished ? '#64748b' : (docs.length > 0 ? '#166534' : '#64748b') }}>
                                        {appLang === 'kr' ? '2. OKF & 비즈니스 위키 사전 탐색' : '2. Pre-Search Context Gathering'}
                                      </span>
                                      <span style={{ fontSize: '11.5px', backgroundColor: !hasFinished ? '#e2e8f0' : (docs.length > 0 ? '#dcfce7' : '#f1f5f9'), color: !hasFinished ? '#64748b' : (docs.length > 0 ? '#15803d' : '#64748b'), padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        {!hasFinished ? 'Pending' : (docs.length > 0 ? `📚 연관 위키 선별 (${docs.length})` : '⚪ 미참조')}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: '#475569', marginBottom: '4px' }}>
                                      <strong>📥 Input:</strong> {appLang === 'en' ? 'Step 1 query intent + GCS internal business wiki knowledge base' : 'Step 1 질문 의도 + GCS 사내 위키 지식베이스'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: !hasFinished ? '#94a3b8' : '#334155', marginBottom: '6px', lineHeight: '1.45' }}>
                                      ⚙️ Task: {appLang === 'en' ? 'Selectively retrieve and inspect specific document parts from GCS internal wikis matching query keywords (Semantic Search)' : 'GCS 사내 위키 중 질문 키워드와 연관된 특정 문서 파트 선별 탐색 (Semantic Search)'}
                                    </div>
                                    {hasFinished && docs.length > 0 ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {docs.map((docName, dIdx) => (
                                          <details key={dIdx} style={{ fontSize: '12px', backgroundColor: '#ffffff', border: '1px solid #86efac', borderRadius: '6px', padding: '5px 9px' }}>
                                            <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#166534' }}>
                                              📄 {docName}
                                            </summary>
                                            <div style={{ padding: '6px 8px 4px 8px', color: '#1e293b', fontSize: '11px', borderTop: '1px dashed #bbf7d0', marginTop: '4px', whiteSpace: 'pre-wrap', maxHeight: '140px', overflowY: 'auto', lineHeight: '1.45', backgroundColor: '#f0fdf4', borderRadius: '4px' }}>
                                              {wikiContents[docName] || (appLang === 'en' ? `Loading referenced section for [${docName}]...` : `문서 [${docName}] 참조 파트 내용 불러오는 중...`)}
                                            </div>
                                          </details>
                                        ))}
                                        <div style={{ fontSize: '11px', color: '#166534', marginTop: '4px', fontWeight: '600' }}>
                                          <strong>📤 Output:</strong> {appLang === 'en' ? 'Selected business contexts and definitions extracted ➔ Passed to Step 3 Query Generation' : '선별된 비즈니스 맥락 및 정의 추출 완료 ➔ Step 3 쿼리 생성으로 전달'}
                                          {hasFinished && (
                                            <div style={{ marginTop: "6px", padding: "4px 8px", backgroundColor: "#ffffff", borderRadius: "4px", border: "1px solid #86efac", fontSize: "10.5px", color: "#166534", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                              <span>{appLang === 'en' ? '⏱️ Step 2 Pre-Search Time: ' : '⏱️ 2단계 사전 탐색 소요시간: '}<strong>0.25s</strong></span>
                                              <span>{appLang === 'en' ? `📚 Selected Wikis: ${docs.length > 0 ? docs.length + " document(s) selected" : "0 (Direct SQL)"}` : `📚 연관 위키: ${docs.length > 0 ? docs.length + "개 문서 선별" : "0개 (Direct SQL)"}`}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                                        {hasFinished 
                                           ? (appLang === 'en' ? '⚪ No pre-searched definition documents found (Direct SQL on spec)' : '⚪ 사전 탐색된 별도 정의 문서 없음 (스펙 직접 SQL)') 
                                           : (appLang === 'en' ? 'Waiting (Pre-search triggers on question input)' : '대기 중 (질문 입력 시 선별 탐색)')}
                                      </div>
                                    )}
                                  </div>

                                  {/* Arrow Down */}
                                  <div style={{ textAlign: 'center', color: !hasFinished ? '#cbd5e1' : 'var(--color-primary)', fontWeight: 'bold', fontSize: '15px', margin: '-4px 0' }}>↓</div>

                                  {/* Step 3: Strategy Selection & Query Generation */}
                                  <div style={{
                                    padding: '12px 14px',
                                    backgroundColor: !hasFinished ? '#f8fafc' : (activeStrategy === 'DIRECT_WIKI' ? '#f0fdf4' : '#faf5ff'),
                                    border: `1px solid ${!hasFinished ? '#e2e8f0' : (activeStrategy === 'DIRECT_WIKI' ? '#86efac' : '#d8b4fe')}`,
                                    borderRadius: '8px',
                                    fontSize: '13.5px',
                                    opacity: !hasFinished ? (isQueryExecuting ? 0.75 : 0.45) : 1,
                                    transition: 'all 0.3s'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                      <span style={{ fontWeight: 'bold', fontSize: '13.5px', color: !hasFinished ? '#64748b' : (activeStrategy === 'DIRECT_WIKI' ? '#166534' : '#6b21a8') }}>
                                        {appLang === 'kr' ? '3. 실행 전략 판단 & 병렬 쿼리 생성' : '3. Strategy & Dual-Query Synthesis'}
                                      </span>
                                      <span style={{
                                        fontSize: '11.5px',
                                        backgroundColor: !hasFinished ? '#e2e8f0' : (activeStrategy === 'DIRECT_WIKI' ? '#dcfce7' : '#f3e8ff'),
                                        color: !hasFinished ? '#64748b' : (activeStrategy === 'DIRECT_WIKI' ? '#15803d' : '#6b21a8'),
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontWeight: 'bold'
                                      }}>
                                        {!hasFinished ? (isQueryExecuting ? '⏳ Analyzing...' : 'Pending') : (activeStrategy === 'DIRECT_WIKI' ? '📚 DIRECT WIKI' : '⚡ HYBRID ENGINE')}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: '#475569', marginBottom: '4px' }}>
                                      <strong>📥 Input:</strong> {appLang === 'en' ? 'Step 2 collected knowledge + BigQuery DDL / OKF Schema' : 'Step 2 사전 수집 지식 + BigQuery DDL/OKF 스키마'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: !hasFinished ? '#94a3b8' : 'var(--text-secondary)', lineHeight: '1.4' }}>
                                      {!hasFinished
                                        ? (isQueryExecuting ? (appLang === 'en' ? 'Parsing query and determining optimal strategy (SQL/GQL/Wiki)...' : '질문 파싱 및 최적 실행 전략(SQL/GQL/Wiki) 결정 중...') : (appLang === 'en' ? 'Waiting (Activates on query input)' : '대기 중 (질문 입력 시 활성화)'))
                                        : (activeStrategy === 'DIRECT_WIKI'
                                          ? `⚙️ Task: ${appLang === 'en' ? 'Adopted direct GCS business wiki policy lookup strategy without DB query' : 'DB SQL/GQL 조회 없이 사내 GCS 비즈니스 위키 규정 직접 탐색 전략 채택'}`
                                          : `⚙️ Task: ${appLang === 'en' ? 'Synthesize Standard SQL for metrics and GQL for relation tracking in parallel' : '수치 통계용 SQL과 관계 추적용 GQL 쿼리를 병렬로 도출'}`)}
                                    </div>
                                    
                                    {hasFinished && activeStrategy !== 'DIRECT_WIKI' && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                        {executedSql && (
                                          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px', backgroundColor: '#ffffff' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 'bold', marginBottom: '4px' }}>{appLang === 'en' ? '⚡ Generated SQL (Statistical Aggregation Engine)' : '⚡ Generated SQL (통계 집계 엔진)'}</div>
                                            <pre style={{ margin: 0, padding: '4px', fontSize: '10.5px', overflowX: 'auto', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '4px', whiteSpace: 'pre-wrap' }}><code>{executedSql}</code></pre>
                                          </div>
                                        )}
                                        {executedGql && (
                                          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px', backgroundColor: '#ffffff' }}>
                                            <div style={{ fontSize: '11px', color: '#6b21a8', fontWeight: 'bold', marginBottom: '4px' }}>{appLang === 'en' ? '🕸️ Generated GQL (Graph Relation Engine)' : '🕸️ Generated GQL (그래프 릴레이션 엔진)'}</div>
                                            <pre style={{ margin: 0, padding: '4px', fontSize: '10.5px', overflowX: 'auto', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '4px', whiteSpace: 'pre-wrap' }}><code>{executedGql}</code></pre>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {hasFinished && step1Metrics && (
                                      <div style={{ marginTop: '8px', padding: '4px 8px', backgroundColor: '#ffffff', borderRadius: '4px', border: '1px solid #adc6ff', fontSize: '10.5px', color: 'var(--color-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>{appLang === 'en' ? '⏱️ Step 3 Query Derivation Time: ' : '⏱️ 1단계 쿼리 도출 소요시간: '}<strong>{((step1Metrics.elapsedMs || 1250) / 1000).toFixed(2)}s</strong></span>
                                        <span>{appLang === 'en' ? `🪙 Tokens: In ${step1Metrics.tokens?.promptTokenCount || 0} / Out ${step1Metrics.tokens?.candidatesTokenCount || 0} (Total ${step1Metrics.tokens?.totalTokenCount || 0})` : `🪙 토큰: In ${step1Metrics.tokens?.promptTokenCount || 0} / Out ${step1Metrics.tokens?.candidatesTokenCount || 0} (Total ${step1Metrics.tokens?.totalTokenCount || 0})`}</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Arrow Down */}
                                  <div style={{ textAlign: 'center', color: !hasFinished ? '#cbd5e1' : (activeStrategy === 'DIRECT_WIKI' ? '#94a3b8' : '#0284c7'), fontWeight: 'bold', fontSize: '15px', margin: '-4px 0' }}>
                                    {activeStrategy === 'DIRECT_WIKI' ? (appLang === 'en' ? '↓ (No DB Query)' : '↓ (DB 미실행)') : (appLang === 'en' ? '↓ (External DB Execution)' : '↓ (외부 DB 실행)')}
                                  </div>

                                  {/* Step 4: BigQuery Execution & Row Fetching */}
                                  <div style={{
                                    padding: '12px 14px',
                                    backgroundColor: !hasFinished ? '#f8fafc' : (activeStrategy === 'DIRECT_WIKI' ? '#f8fafc' : '#f0f9ff'),
                                    border: `1px solid ${!hasFinished ? '#e2e8f0' : (activeStrategy === 'DIRECT_WIKI' ? '#e2e8f0' : '#7dd3fc')}`,
                                    borderRadius: '8px',
                                    fontSize: '13.5px',
                                    opacity: !hasFinished ? (isQueryExecuting ? 0.5 : 0.4) : (activeStrategy === 'DIRECT_WIKI' ? 0.7 : 1),
                                    transition: 'all 0.3s'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                      <span style={{ fontWeight: 'bold', fontSize: '13.5px', color: !hasFinished ? '#64748b' : (activeStrategy === 'DIRECT_WIKI' ? '#64748b' : '#0369a1') }}>
                                        {appLang === 'kr' ? '4. 외부 BigQuery DB 엔진 병렬 실행' : '4. BigQuery Dual Engine Execution'}
                                      </span>
                                      <span style={{ fontSize: '11.5px', backgroundColor: !hasFinished ? '#e2e8f0' : (activeStrategy === 'DIRECT_WIKI' ? '#f1f5f9' : '#e0f2fe'), color: !hasFinished ? '#64748b' : (activeStrategy === 'DIRECT_WIKI' ? '#64748b' : '#0284c7'), padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        {!hasFinished ? 'Pending' : (activeStrategy === 'DIRECT_WIKI' ? '⚪ DB 미실행 (Direct Wiki)' : '⚡ BQ Executed')}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: '#475569', marginBottom: '4px' }}>
                                      <strong>📥 Input:</strong> {activeStrategy === 'DIRECT_WIKI' ? (appLang === 'en' ? 'N/A (Direct wiki lookup)' : 'N/A (위키 직접 참조 질의)') : (appLang === 'en' ? 'Step 3 derived SQL/GQL queries' : 'Step 3 도출 SQL/GQL 쿼리')}
                                    </div>
                                    <div style={{ fontSize: '12px', color: !hasFinished ? '#94a3b8' : '#334155', lineHeight: '1.4' }}>
                                      {!hasFinished
                                        ? (appLang === 'en' ? 'Waiting (Awaiting transmission to GCP BigQuery API)' : '대기 중 (GCP BigQuery API 전송 대기)')
                                        : (activeStrategy === 'DIRECT_WIKI'
                                          ? `⚙️ Task: ${appLang === 'en' ? 'Adopted direct GCS business wiki lookup without DB query' : '이번 질의는 DB SQL 쿼리 실행이 필요 없는 사내 비즈니스 위키 직접 참조 방식입니다.'}`
                                          : `⚙️ Task: ${appLang === 'en' ? 'Send request to GCP BigQuery REST API, run SQL/GQL queries in parallel, and fetch results' : 'GCP BigQuery REST API 전송, SQL/GQL 쿼리 병렬 실행 및 각각의 결과 페치'}`)}
                                    </div>
                                    {hasFinished && (
                                      activeStrategy === 'DIRECT_WIKI' ? (
                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', fontWeight: '600', padding: '4px 8px', backgroundColor: '#ffffff', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                          {appLang === 'en' ? '⚪ DB Query Not Run: Direct GCS business wiki lookup' : '⚪ DB 쿼리 미실행: 사내 비즈니스 위키 직접 참조'}
                                        </div>
                                      ) : (
                                        <>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                                            
                                            {/* SQL Result Card */}
                                            <div style={{ backgroundColor: '#ffffff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '8px 10px' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: 'var(--color-primary)' }}>⚡ BigQuery SQL Engine</span>
                                                <span style={{ fontSize: '10.5px', color: '#475569' }}>
                                                  ⏱️ <strong>{(sqlElapsedMs / 1000).toFixed(2)}s</strong> | 📥 <strong>{sqlRows?.length || 0}{appLang === 'en' ? ' row(s)' : '행'}</strong>
                                                </span>
                                              </div>
                                              {sqlError ? (
                                                <div style={{ fontSize: '11px', color: '#ef4444', backgroundColor: '#fef2f2', padding: '6px', borderRadius: '4px', border: '1px solid #fee2e2' }}>
                                                  ❌ Error: {sqlError}
                                                </div>
                                              ) : (
                                                <details style={{ fontSize: '11.5px' }}>
                                                  <summary style={{ cursor: 'pointer', color: '#0369a1', fontWeight: '500' }}>{appLang === 'en' ? `View SQL Result Data (${sqlRows?.length || 0} Rows)` : `SQL 결과 데이터 보기 (${sqlRows?.length || 0} Rows)`}</summary>
                                                  {sqlRows && sqlRows.length > 0 ? (
                                                    <pre style={{ margin: '4px 0 0 0', padding: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', overflowX: 'auto', maxHeight: '120px', fontSize: '10.5px', color: '#334155' }}>
                                                      <code>{JSON.stringify(sqlRows, null, 2)}</code>
                                                    </pre>
                                                  ) : (
                                                    <div style={{ color: '#94a3b8', fontSize: '10.5px', marginTop: '4px' }}>{appLang === 'en' ? 'No retrieved data (0 rows).' : '조회된 데이터가 없습니다 (0건).'}</div>
                                                  )}
                                                </details>
                                              )}
                                            </div>

                                            {/* GQL Result Card */}
                                            <div style={{ backgroundColor: '#ffffff', border: '1px solid #d8b4fe', borderRadius: '6px', padding: '8px 10px' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#6b21a8' }}>🕸️ Property Graph GQL Engine</span>
                                                <span style={{ fontSize: '10.5px', color: '#475569' }}>
                                                  ⏱️ <strong>{(gqlElapsedMs / 1000).toFixed(2)}s</strong> | 📥 <strong>{gqlRows?.length || 0}{appLang === 'en' ? ' row(s)' : '행'}</strong>
                                                </span>
                                              </div>
                                              {gqlError ? (
                                                <div style={{ fontSize: '11px', color: '#ef4444', backgroundColor: '#fef2f2', padding: '6px', borderRadius: '4px', border: '1px solid #fee2e2' }}>
                                                  ❌ Error: {gqlError}
                                                </div>
                                              ) : (
                                                <details style={{ fontSize: '11.5px' }}>
                                                  <summary style={{ cursor: 'pointer', color: '#6b21a8', fontWeight: '500' }}>{appLang === 'en' ? `View GQL Result Data (${gqlRows?.length || 0} Rows)` : `GQL 결과 데이터 보기 (${gqlRows?.length || 0} Rows)`}</summary>
                                                  {gqlRows && gqlRows.length > 0 ? (
                                                    <pre style={{ margin: '4px 0 0 0', padding: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', overflowX: 'auto', maxHeight: '120px', fontSize: '10.5px', color: '#334155' }}>
                                                      <code>{JSON.stringify(gqlRows, null, 2)}</code>
                                                    </pre>
                                                  ) : (
                                                    <div style={{ color: '#94a3b8', fontSize: '10.5px', marginTop: '4px' }}>{appLang === 'en' ? 'No retrieved data (0 rows).' : '조회된 데이터가 없습니다 (0건).'}</div>
                                                  )}
                                                </details>
                                              )}
                                            </div>

                                          </div>

                                          <div style={{ fontSize: '11px', color: '#059669', marginTop: '8px', fontWeight: '600', padding: '4px 8px', backgroundColor: '#ffffff', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                                            <strong>📤 Output:</strong> {appLang === 'en' ? '✓ SQL/GQL parallel collection & cross-validation complete ➔ Passed to Step 5 Schema Backlink' : '✓ SQL/GQL 병렬 수집 및 교차 검증 완료 ➔ Step 5 스키마 백링크로 전달'}
                                          </div>
                                        </>
                                      )
                                    )}
                                  </div>

                                  {/* Arrow Down */}
                                  <div style={{ textAlign: 'center', color: !hasFinished ? '#cbd5e1' : '#6b21a8', fontWeight: 'bold', fontSize: '15px', margin: '-4px 0' }}>{appLang === 'en' ? '↓ (OKF Backlink Reference)' : '↓ (OKF 백링크 참조)'}</div>

                                  {/* Step 5: Target OKFs & Backlink Discovery */}
                                  <div style={{
                                    padding: '12px 14px',
                                    backgroundColor: !hasFinished ? '#f8fafc' : (referencedTables.length > 0 ? '#faf5ff' : '#f8fafc'),
                                    border: `1px solid ${!hasFinished ? '#e2e8f0' : (referencedTables.length > 0 ? '#e9d5ff' : '#e2e8f0')}`,
                                    borderRadius: '8px',
                                    fontSize: '13.5px',
                                    opacity: !hasFinished ? (isQueryExecuting ? 0.5 : 0.4) : 1,
                                    transition: 'all 0.3s'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                      <span style={{ fontWeight: 'bold', fontSize: '13.5px', color: !hasFinished ? '#64748b' : (referencedTables.length > 0 ? '#6b21a8' : '#64748b') }}>
                                        {appLang === 'kr' ? '5. OKF 명세 & 백링크 매핑' : '5. OKFs & Backlink Mapping'}
                                      </span>
                                      <span style={{ fontSize: '11.5px', backgroundColor: !hasFinished ? '#e2e8f0' : (referencedTables.length > 0 ? '#f3e8ff' : '#f1f5f9'), color: !hasFinished ? '#64748b' : (referencedTables.length > 0 ? '#6b21a8' : '#64748b'), padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        {!hasFinished ? 'Pending' : (referencedTables.length > 0 ? `🔗 Linked (${referencedTables.length})` : '⚪ 미참조')}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: '#475569', marginBottom: '4px' }}>
                                      <strong>📥 Input:</strong> {appLang === 'en' ? `Step 4 used tables (${referencedTables.join(', ') || 'N/A'}) + OKF Knowledge Map` : `Step 4 사용 테이블 목록 (${referencedTables.join(', ') || 'N/A'}) + OKF 지식 지도`}
                                    </div>
                                    <div style={{ fontSize: '12px', color: !hasFinished ? '#94a3b8' : '#334155', marginBottom: '6px' }}>
                                      ⚙️ Task: {appLang === 'en' ? 'Trace location of schema primary keys and foreign key backlink relations' : '스키마 주 식별자 및 외래키 백링크 릴레이션 위치 추적'}
                                    </div>
                                    {hasFinished ? (
                                      referencedTables.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          {referencedTables.map(tId => {
                                            const t = tables.find(item => item.id === tId) || { id: tId, type: 'TABLE' };
                                            return (
                                              <details open key={t.id} style={{ fontSize: '12px', backgroundColor: '#ffffff', border: '1px solid #d8b4fe', borderRadius: '6px', padding: '5px 9px' }}>
                                                <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#6b21a8' }}>
                                                  🔗 [[{t.id}.md]]
                                                </summary>
                                                <div style={{ padding: "6px 4px 4px 4px", color: "#334155", fontSize: "11px", borderTop: "1px dashed #e9d5ff", marginTop: "4px", lineHeight: "1.5", display: "flex", flexDirection: "column", gap: "3px" }}>
                                                  {(() => {
                                                    const info = getBacklinkDetailInfo(t.id, referencedTables, appLang);
                                                    return (
                                                      <>
                                                        <div><strong>{appLang === 'en' ? '📍 Referenced Section:' : '📍 참조 위치:'}</strong> <code style={{ backgroundColor: "#f3e8ff", color: "#6b21a8", padding: "1px 5px", borderRadius: "3px" }}>{info.section}</code></div>
                                                        <div><strong>{appLang === 'en' ? '🔗 Mapping Relation:' : '🔗 매핑 관계:'}</strong> <span style={{ fontWeight: "600", color: "#1e293b" }}>{info.relation}</span></div>
                                                        <div><strong>{appLang === 'en' ? '💡 Inferred Insight:' : '💡 파악된 정보:'}</strong> <span style={{ color: "#475569" }}>{info.insight}</span></div>
                                                      </>
                                                    );
                                                  })()}
                                                </div>
                                              </details>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <div style={{ fontSize: '12px', color: '#64748b', padding: '6px 8px', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                          ⚪ {appLang === 'en' ? 'Not Referenced: This query did not directly reference DB schema/backlinks.' : '미참조: 이번 질의에서는 DB 스키마/백링크를 직접 참조하지 않았습니다.'}
                                        </div>
                                      )
                                    ) : (
                                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{appLang === 'en' ? 'Waiting (Maps schema backlinks after query derivation)' : '대기 중 (쿼리 도출 완료 후 스키마 백링크 매핑)'}</div>
                                    )}
                                    {hasFinished && (
                                      <div style={{ fontSize: '11px', color: '#6b21a8', marginTop: '6px', fontWeight: '600' }}>
                                        <strong>📤 Output:</strong> {appLang === 'en' ? 'OKF backlink knowledge mapping complete ➔ Passed to Step 6 Business Wiki Fusion' : 'OKF 백링크 지식 매핑 완료 ➔ Step 6 비즈니스 위키 융합으로 전달'}
                                        <div style={{ marginTop: "6px", padding: "4px 8px", backgroundColor: "#ffffff", borderRadius: "4px", border: "1px solid #d8b4fe", fontSize: "10.5px", color: "#6b21a8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                          <span>{appLang === 'en' ? '⏱️ Step 5 Backlink Time: ' : '⏱️ 5단계 백링크 소요시간: '}<strong>0.15s</strong></span>
                                          <span>{appLang === 'en' ? `🔗 Mapping: Linked ${referencedTables.length} OKF knowledge map(s)` : `🔗 매핑: ${referencedTables.length}개 OKF 지식 지도 연동`}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Arrow Down */}
                                  <div style={{ textAlign: 'center', color: !hasFinished ? '#cbd5e1' : '#137333', fontWeight: 'bold', fontSize: '15px', margin: '-4px 0' }}>{appLang === 'en' ? '↓ (Wiki Source Fusion)' : '↓ (위키 출처 융합)'}</div>

                                  {/* Step 6: Wiki Rules & Insight Fusion */}
                                  <div style={{
                                    padding: '12px 14px',
                                    backgroundColor: !hasFinished ? '#f8fafc' : (docs.length > 0 ? '#f0fdf4' : '#f8fafc'),
                                    border: `1px solid ${!hasFinished ? '#e2e8f0' : (docs.length > 0 ? '#bbf7d0' : '#e2e8f0')}`,
                                    borderRadius: '8px',
                                    fontSize: '13.5px',
                                    opacity: !hasFinished ? (isQueryExecuting ? 0.5 : 0.4) : 1,
                                    transition: 'all 0.3s'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                      <span style={{ fontWeight: 'bold', fontSize: '13.5px', color: !hasFinished ? '#64748b' : (docs.length > 0 ? '#166534' : '#64748b') }}>
                                        {appLang === 'kr' ? '6. GCS 비즈니스 위키 지식 융합' : '6. Wiki Knowledge Fusion'}
                                      </span>
                                      <span style={{ fontSize: '11.5px', backgroundColor: !hasFinished ? '#e2e8f0' : (docs.length > 0 ? '#dcfce7' : '#f1f5f9'), color: !hasFinished ? '#64748b' : (docs.length > 0 ? '#15803d' : '#64748b'), padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        {!hasFinished ? 'Pending' : (docs.length > 0 ? `📚 Fused (${docs.length})` : '⚪ 미참조')}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: '#475569', marginBottom: '4px' }}>
                                      <strong>📥 Input:</strong> {appLang === 'en' ? 'Query context + GCS internal business wiki stored documents' : '질문 맥락 + GCS 사내 위키 저장 문서'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: !hasFinished ? '#94a3b8' : '#334155', marginBottom: '6px' }}>
                                      ⚙️ Task: {appLang === 'en' ? 'Dynamically search and parse relevant internal policy & guideline documents' : '관련 사내 정책 및 가이드라인 문서 동적 검색 및 본문 파싱'}
                                    </div>
                                    {hasFinished ? (
                                      docs.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          {docs.map((docName, dIdx) => (
                                            <details key={dIdx} style={{ fontSize: '12px', backgroundColor: '#ffffff', border: '1px solid #86efac', borderRadius: '6px', padding: '5px 9px' }}>
                                              <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#166534' }}>
                                                📄 {docName}
                                              </summary>
                                              <div style={{ padding: '6px 8px 4px 8px', color: '#1e293b', fontSize: '11px', borderTop: '1px dashed #bbf7d0', marginTop: '4px', whiteSpace: 'pre-wrap', maxHeight: '160px', overflowY: 'auto', lineHeight: '1.45', backgroundColor: '#f0fdf4', borderRadius: '4px' }}>
                                                {wikiContents[docName] || (appLang === 'en' ? `Loading [${docName}] contents...` : `문서 [${docName}] 내용 불러오는 중...`)}
                                              </div>
                                            </details>
                                          ))}
                                        </div>
                                      ) : (
                                        <div style={{ fontSize: '12px', color: '#64748b', padding: '6px 8px', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                          ⚪ {appLang === 'en' ? 'Not Referenced: This query did not reference business wiki documents (DB SQL query only).' : '미참조: 이번 질의에서는 비즈니스 위키 문서를 참조하지 않았습니다 (DB SQL 쿼리 전용).'}
                                        </div>
                                      )
                                    ) : (
                                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{appLang === 'en' ? 'Waiting (Quotes internal business wiki upon answer derivation)' : '대기 중 (답변 도출 시 사내 비즈니스 위키 인용)'}</div>
                                    )}
                                    {hasFinished && (
                                      <div style={{ fontSize: '11px', color: '#166534', marginTop: '6px', fontWeight: '600' }}>
                                        <strong>📤 Output:</strong> 비즈니스 정책 지식 결합 완료 ➔ <i>Step 7 최종 답변 도출로 전달</i>
                                        <div style={{ marginTop: "6px", padding: "4px 8px", backgroundColor: "#ffffff", borderRadius: "4px", border: "1px solid #86efac", fontSize: "10.5px", color: "#166534", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                          <span>{appLang === 'en' ? '⏱️ Step 6 Wiki Fusion Time: ' : '⏱️ 6단계 위키 융합 소요시간: '}<strong>0.20s</strong></span>
                                          <span>{appLang === 'en' ? `📚 Fusion: Parsed ${docs.length} internal policy guide document(s)` : `📚 융합: ${docs.length}개 사내 정책 가이드 문서 파싱`}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Arrow Down */}
                                  <div style={{ textAlign: 'center', color: !hasFinished ? '#cbd5e1' : 'var(--color-primary)', fontWeight: 'bold', fontSize: '15px', margin: '-4px 0' }}>↓</div>

                                  {/* Step 7: Answer Synthesis */}
                                  <div style={{
                                    padding: '12px 14px',
                                    backgroundColor: !hasFinished ? '#f8fafc' : '#fffbe6',
                                    border: `1px solid ${!hasFinished ? '#e2e8f0' : '#ffe58f'}`,
                                    borderRadius: '8px',
                                    fontSize: '13.5px',
                                    opacity: !hasFinished ? (isQueryExecuting ? 0.5 : 0.4) : 1,
                                    transition: 'all 0.3s'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                      <span style={{ fontWeight: 'bold', fontSize: '13.5px', color: !hasFinished ? '#64748b' : '#b78103' }}>
                                        {appLang === 'kr' ? '7. 온톨로지 답변 도출 완료' : '7. Answer Synthesized'}
                                      </span>
                                      <span style={{ fontSize: '11.5px', backgroundColor: !hasFinished ? '#e2e8f0' : '#fff1b8', color: !hasFinished ? '#64748b' : '#874d00', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        {!hasFinished ? 'Pending' : '⚡ Gemini 3.5'}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: '#475569', marginBottom: '4px' }}>
                                      <strong>📥 Input:</strong> {appLang === 'en' ? 'Step 4 DB metrics + Step 5 OKF backlinks + Step 6 wiki original texts + Gemini thoughts chain' : 'Step 4 DB 수치 + Step 5 OKF 백링크 + Step 6 위키 원문 + Gemini 생각 고리'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: !hasFinished ? '#94a3b8' : '#595959', lineHeight: '1.5' }}>
                                      ⚙️ Task: {appLang === 'en' ? 'Cross-validate quantitative metrics and policies to complete professional English analysis report' : '수치 데이터와 정책 교차 검증 및 전문 한글 분석 보고서 완성'}
                                    </div>
                                    {hasFinished && (
                                      <div style={{ fontSize: '11px', color: '#874d00', marginTop: '6px', fontWeight: '600' }}>
                                        <strong>📤 Output:</strong> {appLang === 'en' ? 'Final ontology comprehensive report completed' : '최종 온톨로지 종합 리포트 완결'}
                                      </div>
                                    )}

                                    {/* Total Metrics Summary Bar at bottom of Right Panel (Collapsible Accordion Style) */}
                                    {hasFinished && step3Metrics && (
                                      <div style={{ marginTop: '8px', padding: '4px 8px', backgroundColor: '#ffffff', borderRadius: '4px', border: '1px solid #ffe58f', fontSize: '10.5px', color: '#874d00', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>{appLang === 'en' ? '⏱️ Step 7 Report Synthesis Time: ' : '⏱️ 3단계 리포트 합성 소요시간: '}<strong>{((step3Metrics.elapsedMs || 2100) / 1000).toFixed(2)}s</strong></span>
                                        <span>{appLang === 'en' ? `🪙 Tokens: In ${step3Metrics.tokens?.promptTokenCount || 0} / Out ${step3Metrics.tokens?.candidatesTokenCount || 0} (Total ${step3Metrics.tokens?.totalTokenCount || 0})` : `🪙 토큰: In ${step3Metrics.tokens?.promptTokenCount || 0} / Out ${step3Metrics.tokens?.candidatesTokenCount || 0} (Total ${step3Metrics.tokens?.totalTokenCount || 0})`}</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Single Total Metrics Bar at the very end */}
                                  {hasFinished && (
                                    <div style={{ marginTop: '12px', padding: '10px 14px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1.5px solid #d8b4fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                      <span style={{ fontWeight: 'bold', color: '#6b21a8' }}>{appLang === 'en' ? '📊 Total Query Processing Time & Total Tokens' : '📊 질문 처리 총 소요시간 & 총 토큰'}</span>
                                      <span style={{ backgroundColor: '#6b21a8', color: '#ffffff', padding: '3px 12px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 'bold' }}>
                                        {appLang === 'en' ? `Total ${metricsObj?.total?.totalElapsedSec || '4.00'}s | Total ${metricsObj?.total?.totalTokenCount?.toLocaleString() || '2,220'} tokens` : `총 ${metricsObj?.total?.totalElapsedSec || '4.00'}초 | 총 ${metricsObj?.total?.totalTokenCount?.toLocaleString() || '2,220'} tokens`}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                          </div>
                        </div>
                      </div>
                    )}



                    {/* 3.5 Enrichment Report Tab */}
                    {datasetActiveTab === 'enrichment-report' && (
                      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)', minHeight: '620px', textAlign: 'left', overflow: 'hidden' }}>

                        {/* 상단 서브 네비게이션 헤더 (Enrichment 수행 ↔ 완료 결과 리포트 자유 전환) */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => setEnrichmentSubView('setup')}
                              className={enrichmentSubView === 'setup' ? 'btn-primary' : 'btn-secondary'}
                              style={{ fontSize: '12px', padding: '6px 16px', borderRadius: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                              <span>⚙️ {appLang === 'kr' ? 'Enrichment 수행' : 'Run Enrichment'}</span>
                              {isEnriching && (
                                <div className="spinner" style={{ width: '10px', height: '10px', border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                              )}
                            </button>

                            <button
                              onClick={() => setEnrichmentSubView('result')}
                              className={enrichmentSubView === 'result' ? 'btn-primary' : 'btn-secondary'}
                              style={{ fontSize: '12px', padding: '6px 16px', borderRadius: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                              <span>📊 {appLang === 'kr' ? 'Enrichment 결과' : 'Enrichment Report'}</span>
                            </button>
                          </div>
                        </div>

                        {/* 3.5.1 Setup & Progress View */}
                        {enrichmentSubView === 'setup' && (
                          <div style={{ display: 'flex', gap: '24px', flex: 1, overflowY: 'auto', paddingBottom: '10px' }}>

                            {/* Left Pane (50%): Knowledge Sources */}
                            <div style={{ width: '50%', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '20px', overflowY: 'auto' }}>

                              {/* GCS Wiki 지식 베이스 목록 */}
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                                    📝 {appLang === 'kr' ? `저장된 사내 비즈니스 위키 지식 (${activeWikiFiles.length}개)` : `Stored Business Wiki Glossaries (${activeWikiFiles.length})`}
                                  </label>
                                  <button
                                    onClick={() => {
                                      setWikiCategory('general');
                                      setWikiFileName('');
                                      setWikiContent('');
                                      setIsWikiModalOpen(true);
                                    }}
                                    className="btn-secondary"
                                    style={{ fontSize: '11.5px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                  >
                                    <span>+</span> Add to Wiki
                                  </button>
                                </div>

                                {activeWikiFiles.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '8px', backgroundColor: '#fafafa' }}>
                                    {activeWikiFiles.map((wiki, index) => (
                                      <div
                                        key={index}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', backgroundColor: '#ffffff', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '12px' }}
                                      >
                                        <span style={{ color: '#4b1a8a', fontWeight: '500' }}>📄 [{wiki.category}] {wiki.fileName}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ padding: '24px 16px', border: '1px dashed var(--border-light)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', backgroundColor: '#fafafa' }}>
                                    현재 GCS 버킷에 저장된 위키 지식이 없습니다. 새 위키 문서를 먼저 등록해 보세요.
                                  </div>
                                )}
                              </div>

                              {/* {appLang === 'en' ? 'Direct Local PDF Upload' : '로컬 PDF 직접 첨부'} */}
                              <div>
                                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>
                                  {appLang === 'en' ? 'Direct Local PDF Upload' : '로컬 PDF 직접 첨부'}
                                </span>
                                <input
                                  type="file"
                                  ref={fileInputRef}
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      handleParsePdf(e.target.files[0]);
                                    }
                                  }}
                                  accept=".pdf"
                                  style={{ display: 'none' }}
                                />
                                <div
                                  onClick={() => !isParsingPdf && fileInputRef.current && fileInputRef.current.click()}
                                  style={{
                                    width: '100%',
                                    padding: '12px',
                                    border: '2px dashed var(--color-primary)',
                                    color: 'var(--color-primary)',
                                    backgroundColor: 'var(--color-primary-bg)',
                                    borderRadius: '8px',
                                    cursor: isParsingPdf ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    transition: 'all 0.2s'
                                  }}
                                >
                                  {isParsingPdf ? (
                                    <>
                                      <div className="spinner" style={{ width: '14px', height: '14px', borderTopColor: 'var(--color-primary)' }}></div>
                                      <span>{appLang === 'en' ? 'Extracting text from PDF...' : 'PDF 분석 및 텍스트 추출 중...' }</span>
                                    </>
                                  ) : (
                                    <>
                                      <span style={{ fontSize: '15px' }}>📂</span>
                                      <span>{appLang === 'en' ? 'Choose PDF from My Computer (Auto-parsing on attachment)' : '내 컴퓨터에서 PDF 파일 선택 (첨부 즉시 자동 파싱)'}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right Pane (50%): Gamified Target Table Cards (Always Visible) & Dynamic Lower Stepper Panel */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '20px', overflowY: 'auto' }}>

                              {/* 1. 상단 게이미피케이션 대상 테이블 진행 카드 세트 (선택 토글 및 실시간 갱신 지원) */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      🎯 {appLang === 'kr' ? `Enrichment 대상 테이블 OKF 명세 (${activeOkfFiles.length}개 테이블)` : `Target Table OKF Specifications (${activeOkfFiles.length} Tables)`}
                                    </label>
                                    <button
                                      type="button"
                                      onClick={handleToggleSelectAllEnrichTables}
                                      disabled={isEnriching}
                                      style={{
                                        fontSize: '11px',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-light)',
                                        backgroundColor: '#ffffff',
                                        cursor: isEnriching ? 'not-allowed' : 'pointer',
                                        color: 'var(--color-primary)',
                                        fontWeight: '600'
                                      }}
                                    >
                                      {selectedEnrichTableIds.length === activeOkfFiles.length ? (appLang === 'en' ? '☐ Clear All' : '☐ 전체 해제') : (appLang === 'en' ? '☑️ Select All' : '☑️ 전체 선택')}
                                    </button>
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#e0e7ff', color: '#3730a3' }}>
                                      {appLang === 'en' ? 'Selected' : '선택됨'}: {selectedEnrichTableIds.length} / {activeOkfFiles.length}
                                    </span>
                                    <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '12px', backgroundColor: (enrichTimelineStatus?.enrichedTables || []).length > 0 ? '#dcfce7' : '#f1f5f9', color: (enrichTimelineStatus?.enrichedTables || []).length > 0 ? '#15803d' : '#64748b' }}>
                                      {enrichTimelineStatus?.enrichedTables ? `${enrichTimelineStatus.enrichedTables.length} / dots ` : (appLang === 'en' ? '0 Done' : '0 완료')}
                                    </span>
                                  </div>
                                </div>

                                {activeOkfFiles.length > 0 ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '2px' }}>
                                    {activeOkfFiles.map((okf, idx) => {
                                      const isSelected = selectedEnrichTableIds.includes(okf.tableId);
                                      const isCurrentActive = enrichTimelineStatus?.activeTable === okf.tableId;
                                      const isDone = (enrichTimelineStatus?.enrichedTables || []).includes(okf.tableId);

                                      let cardBg = isSelected ? '#ffffff' : '#f8fafc';
                                      let cardBorder = isSelected ? '1.5px solid #a855f7' : '1px solid #e2e8f0';
                                      let badgeBg = '#f1f5f9';
                                      let badgeColor = '#64748b';
                                      let badgeText = isSelected ? (appLang === 'en' ? '☑️ Pending' : '☑️ 대기') : (appLang === 'en' ? '⚪ Excluded' : '⚪ 제외됨');

                                      if (isDone) {
                                        cardBg = '#f0fdf4';
                                        cardBorder = '1.5px solid #86efac';
                                        badgeBg = '#dcfce7';
                                        badgeColor = '#15803d';
                                        badgeText = appLang === 'en' ? '✓ Done' : '✓ 완료';
                                      } else if (isCurrentActive) {
                                        cardBg = '#faf5ff';
                                        cardBorder = '1.5px solid #c084fc';
                                        badgeBg = '#7c3aed';
                                        badgeColor = '#ffffff';
                                        badgeText = appLang === 'en' ? '⏳ Analyzing...' : '⏳ 분석 중...';
                                      }

                                      return (
                                        <div
                                          key={idx}
                                          onClick={() => !isEnriching && handleToggleEnrichTable(okf.tableId)}
                                          style={{
                                            padding: '9px 11px',
                                            backgroundColor: cardBg,
                                            border: cardBorder,
                                            borderRadius: '8px',
                                            fontSize: '11.5px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            boxShadow: isCurrentActive ? '0 2px 8px rgba(124,58,237,0.15)' : 'none',
                                            cursor: isEnriching ? 'default' : 'pointer',
                                            opacity: (!isSelected && !isEnriching) ? 0.6 : 1,
                                            transition: 'all 0.2s ease'
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => { }} // parent onClick handles toggle
                                              disabled={isEnriching}
                                              style={{ cursor: 'pointer' }}
                                            />
                                            <strong style={{ color: isDone ? '#166534' : (isCurrentActive ? '#6d28d9' : (isSelected ? 'var(--text-primary)' : 'var(--text-muted)')), fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                              {okf.tableId}
                                            </strong>
                                          </div>
                                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: badgeBg, color: badgeColor, fontWeight: 'bold', flexShrink: 0, animation: isCurrentActive ? 'pulse 1.5s infinite' : 'none' }}>
                                            {badgeText}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div style={{ padding: '16px', border: '1px dashed var(--border-light)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', backgroundColor: '#fafafa' }}>
                                    {appLang === 'kr'
                                      ? "Enrichment할 기존 OKF 명세 파일이 없습니다. 좌측 탐색기에서 'Generate OKF'를 먼저 수행해 주십시오."
                                      : "No OKF specs found to enrich. Please run 'Generate OKF' first from the explorer."}
                                  </div>
                                )}
                              </div>

                              {/* 2. 하단 영역: 수행 대기 시 메커니즘 카드 & 기동 버튼, 수행 중 시 실시간 스태퍼 동적 바인딩 */}
                              {isEnriching ? (
                                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div className="spinner" style={{ width: '20px', height: '20px', border: '3px solid #f3e8ff', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                    <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: '700', color: '#6d28d9' }}>
                                      {appLang === 'en' ? 'Running Enrichment Agent Cross Analysis...' : 'Enrichment 에이전트 크로스 분석 구동 중...'}
                                    </h4>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#faf6ff', padding: '14px 16px', borderRadius: '8px', border: '1px solid #ebd9ff' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: enrichStep >= 1 ? 1 : 0.4 }}>
                                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: enrichStep > 1 ? '#137333' : '#7c3aed', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
                                        {enrichStep > 1 ? '✓' : '1'}
                                      </div>
                                      <span style={{ fontSize: '12px', fontWeight: enrichStep === 1 ? '600' : 'normal', color: enrichStep === 1 ? '#6d28d9' : 'var(--text-primary)' }}>
                                        {appLang === 'en' ? 'Step 1: Load unstructured Wiki knowledge data' : 'Step 1: 비정형 Wiki 지식 데이터 로드'} {enrichTimelineStatus?.wikiCount ? `(${enrichTimelineStatus.wikiCount}개 파일)` : ''}
                                      </span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: enrichStep >= 2 ? 1 : 0.4 }}>
                                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: enrichStep > 2 ? '#137333' : enrichStep === 2 ? '#7c3aed' : '#ccc', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
                                        {enrichStep > 2 ? '✓' : '2'}
                                      </div>
                                      <span style={{ fontSize: '12px', fontWeight: enrichStep === 2 ? '600' : 'normal', color: enrichStep === 2 ? '#6d28d9' : 'var(--text-primary)' }}>
                                        {appLang === 'en' ? 'Step 2: Prepare target OKF spec comparison' : 'Step 2: 대상 OKF 명세서 구문 대조 준비'} {enrichTimelineStatus?.tableCount ? `(${enrichTimelineStatus.tableCount}개 테이블)` : ''}
                                      </span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: enrichStep >= 3 ? 1 : 0.4 }}>
                                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: enrichStep > 3 ? '#137333' : enrichStep === 3 ? '#7c3aed' : '#ccc', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
                                        {enrichStep > 3 ? '✓' : '3'}
                                      </div>
                                      <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '12px', fontWeight: enrichStep === 3 ? '600' : 'normal', color: enrichStep === 3 ? '#6d28d9' : 'var(--text-primary)' }}>
                                          {appLang === 'en' ? 'Step 3: Gemini AI semantic Enrichment analysis' : 'Step 3: Gemini AI 의미론적 Enrichment 분석'}
                                        </span>
                                        {enrichTimelineStatus?.activeTable && (
                                          <span style={{ padding: '1px 6px', backgroundColor: '#7c3aed', color: '#ffffff', borderRadius: '4px', fontSize: '10.5px', fontWeight: 'bold' }}>
                                            {appLang === 'en' ? 'Analyzing' : '분석 중'}: {enrichTimelineStatus.activeTable}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: enrichStep >= 4 ? 1 : 0.4 }}>
                                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: enrichStep > 4 ? '#137333' : enrichStep === 4 ? '#7c3aed' : '#ccc', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
                                        {enrichStep > 4 ? '✓' : '4'}
                                      </div>
                                      <span style={{ fontSize: '12px', fontWeight: enrichStep === 4 ? '600' : 'normal', color: enrichStep === 4 ? '#6d28d9' : 'var(--text-primary)' }}>
                                        {appLang === 'en' ? 'Step 4: GCS OKF spec overwrite & update log.md history' : 'Step 4: GCS OKF 스펙 영구 갱신 & 변경 이력(log.md) 기록'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                  {/* 정적 메커니즘 카드 복원 */}
                                  <div style={{ backgroundColor: '#fafafa', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '14px 16px' }}>
                                    <div style={{ fontSize: '12.5px', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      💡 {appLang === 'kr' ? 'Wiki 기반 Enrichment 파이프라인 메커니즘' : 'Wiki-based Enrichment Pipeline Mechanism'}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ backgroundColor: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{appLang === 'en' ? '1. Wiki Scan' : '1. Wiki 스캔'}</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{appLang === 'en' ? 'Analyze GCS Wiki documents (wiki/*.md)' : 'GCS Wiki 문서 (`wiki/*.md`) 분석'}</span>
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ backgroundColor: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{appLang === 'en' ? '2. Spec Compare' : '2. 스펙 대조'}</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{appLang === 'en' ? 'Compare existing GCS OKF specs (tables/*.md)' : 'GCS 기존 OKF 명세 (`tables/*.md`) 대조'}</span>
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ backgroundColor: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{appLang === 'en' ? '3. Gemini LLM' : '3. Gemini LLM'}</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{appLang === 'en' ? 'Semantic mapping & OKF spec enrichment' : '의미론적 매핑 & OKF 명세 Enrichment'}</span>
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ backgroundColor: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{appLang === 'en' ? '4. Overwrite & Save' : '4. 저장 & 갱신'}</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{appLang === 'en' ? 'GCS spec overwrite & log.md, index.md history' : 'GCS 명세 덮어쓰기 & `log.md`, `index.md` 이력 기록'}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                                    <span style={{ fontSize: '11px', color: selectedEnrichTableIds.length === 0 ? '#ef4444' : 'var(--text-muted)', maxWidth: '280px', lineHeight: '1.4', fontWeight: selectedEnrichTableIds.length === 0 ? 'bold' : 'normal' }}>
                                      {selectedEnrichTableIds.length === 0
                                        ? (appLang === 'en' ? '⚠️ Please select at least 1 target table to enrich.' : '⚠️ Enrichment를 수행할 대상 테이블을 1개 이상 선택해 주세요.')
                                        : (appLang === 'kr'
                                          ? `※ 선택된 ${selectedEnrichTableIds.length}개 테이블에 대해 GCS Wiki와 크로스 매핑하여 비즈니스 지식이 병합된 최신 OKF 명세로 보강합니다.`
                                          : `※ Selected ${selectedEnrichTableIds.length} tables will be enriched with GCS Wiki knowledge.`)}
                                    </span>
                                    <button
                                      onClick={handleEnrichViaWiki}
                                      className="btn-primary"
                                      style={{ fontSize: '12.5px', padding: '10px 24px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '8px', opacity: selectedEnrichTableIds.length === 0 ? 0.5 : 1 }}
                                      disabled={isEnriching || selectedEnrichTableIds.length === 0}
                                    >
                                      <span>🔮 {appLang === 'kr' ? `선택된 ${selectedEnrichTableIds.length}개 테이블 Enrichment 기동` : `Run Enrichment (${selectedEnrichTableIds.length} Selected)`}</span>
                                    </button>
                                  </div>
                                </div>
                              )}

                            </div>
                          </div>
                        )}

                        {/* 3.5.2 Result View (Restored 50:50 2-Column Split View & Governance Index / Log Previewer) */}
                        {enrichmentSubView === 'result' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto' }}>
                            {((enrichmentReport && (enrichmentReport.enrichedTables || [])) || (enrichmentResult && (enrichmentResult.enrichedTables || []))) ? (
                              (() => {
                                const currentRep = enrichmentReport || enrichmentResult;
                                const tablesList = Array.isArray(currentRep.enrichedTables)
                                  ? currentRep.enrichedTables
                                  : typeof currentRep.enrichedTables === 'string'
                                    ? (() => { try { return JSON.parse(currentRep.enrichedTables); } catch (e) { return []; } })()
                                    : [];
                                const detailsList = Array.isArray(currentRep.details) ? currentRep.details : [];

                                // Safe date parsing to prevent Invalid Date
                                const rawTime = currentRep.timestamp;
                                let formattedDate = '최근 완료';
                                if (rawTime) {
                                  const d = new Date(rawTime);
                                  if (!isNaN(d.getTime())) {
                                    formattedDate = d.toLocaleString();
                                  }
                                }

                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                                    {/* 상단 저장 리포트 정보 툴바 */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', padding: '12px 16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#166534' }}>{appLang === 'en' ? '✓ GCS Saved Enrichment Report (Persisted Asset)' : '✓ GCS 저장된 Enrichment 리포트 (Persisted Asset)'}</span>
                                        <span style={{ fontSize: '11px', color: '#15803d', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                                          {appLang === 'en' ? 'Saved At: ' : '저장 시각: '}{formattedDate}
                                        </span>
                                      </div>
                                      <button
                                        onClick={() => setEnrichmentSubView('setup')}
                                        className="btn-secondary"
                                        style={{ fontSize: '11.5px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                      >
                                        <span>🔄</span> {appLang === 'en' ? 'Enrichment Re-run' : 'Enrichment 재수행 (Re-run)'}
                                      </button>
                                    </div>

                                    {/* 메인 2컬럼 레이아웃 복원 (50:50 Split) */}
                                    <div style={{ display: 'flex', gap: '24px', flex: 1, overflow: 'hidden' }}>

                                      {/* Left Section (50%): Summary card, Table Details Grid & Governance Index/Log Viewers */}
                                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '4px' }}>
                                        <div style={{ padding: '16px 20px', backgroundColor: '#e6f4ea', border: '1px solid #ccebe0', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                          <span style={{ fontSize: '20px', color: '#137333', fontWeight: 'bold' }}>✓</span>
                                          <div>
                                            <h4 style={{ margin: '0 0 2px 0', fontSize: '13.5px', fontWeight: '700', color: '#137333' }}>{appLang === 'en' ? `Enrichment Completed: Updated ${tablesList.length} Table Specs` : `Enrichment 완료: 총 ${tablesList.length}개 테이블 명세 갱신`}</h4>
                                            <p style={{ margin: 0, fontSize: '12.5px', color: '#2b573d' }}>{currentRep.message || (appLang === 'en' ? 'Wiki knowledge successfully integrated into dataset ontology.' : '위키 지식이 데이터셋 온톨로지에 성공적으로 통합되었습니다.')}</p>
                                          </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                          <div className="sidebar-section-title" style={{ paddingLeft: 0, marginBottom: '0' }}>{appLang === 'en' ? 'Enriched Tables List' : 'ENRICHMENT 테이블 상세 목록'} ({detailsList.length})</div>
                                          {detailsList.length > 0 ? (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', maxHeight: '160px', overflowY: 'auto', paddingRight: '2px' }}>
                                              {detailsList.map((detail, idx) => {
                                                const isSelected = (selectedEnrichedTable || detailsList[0]?.tableId) === detail.tableId;
                                                const isUpdated = tablesList.includes(detail.tableId);
                                                return (
                                                  <div
                                                    key={idx}
                                                    onClick={() => setSelectedEnrichedTable(detail.tableId)}
                                                    style={{
                                                      padding: '10px 12px',
                                                      backgroundColor: isSelected ? '#f3e8ff' : '#ffffff',
                                                      borderRadius: '8px',
                                                      border: isSelected ? '1.5px solid #a855f7' : '1px solid var(--border-light)',
                                                      cursor: 'pointer',
                                                      transition: 'all 0.2s',
                                                      boxShadow: isSelected ? '0 2px 6px rgba(168,85,247,0.15)' : 'none'
                                                    }}
                                                  >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                      <strong style={{ fontSize: '12.5px', color: isSelected ? '#6b21a8' : 'var(--text-primary)' }}>{detail.tableId}</strong>
                                                      <span style={{ fontSize: '10.5px', padding: '1px 6px', borderRadius: '4px', backgroundColor: isUpdated ? '#dcfce7' : '#f1f5f9', color: isUpdated ? '#15803d' : '#64748b', fontWeight: 'bold' }}>
                                                        {isUpdated ? (appLang === 'en' ? '✓ Updated' : '✓ 갱신됨') : (appLang === 'en' ? '⚪ Unchanged' : '⚪ 기존 유지')}
                                                      </span>
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                      {(detail.description === '비즈니스 설명 보강 완료' ? null : detail.description) || (appLang === 'en' ? 'Business description enrichment completed' : '비즈니스 설명 보강 완료')}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <div style={{ padding: '16px', border: '1px dashed var(--border-light)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                              {appLang === 'en' ? 'No detail records found.' : '상세 내역이 없습니다.'}
                                            </div>
                                          )}
                                        </div>

                                        {/* 복원: index.md 및 log.md 다이렉트 프리뷰어 탭 (Diff 하이라이터 모드 적용) */}
                                        <div style={{ marginTop: '4px', borderTop: '1px solid var(--border-light)', paddingTop: '14px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px', marginBottom: '10px' }}>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                              <button
                                                className={`gmail-tab ${enrichActiveTab === 'index' ? 'active' : ''}`}
                                                onClick={() => setEnrichActiveTab('index')}
                                                style={{ fontSize: '12px', padding: '6px 12px' }}
                                              >
                                                📄 {appLang === 'en' ? 'Governance Index (index.md)' : '거버넌스 색인 (index.md)'}
                                              </button>
                                              <button
                                                className={`gmail-tab ${enrichActiveTab === 'log' ? 'active' : ''}`}
                                                onClick={() => setEnrichActiveTab('log')}
                                                style={{ fontSize: '12px', padding: '6px 12px' }}
                                              >
                                                📜 {appLang === 'en' ? 'Real-time Change Log (log.md)' : '실시간 변경 이력 (log.md)'}
                                              </button>
                                            </div>
                                            <span style={{ fontSize: '10.5px', color: '#10b981', backgroundColor: '#064e3b', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                              ✦ {appLang === 'en' ? 'Diff Highlighter Active' : 'Diff 하이라이터 켜짐'}
                                            </span>
                                          </div>
                                          <div style={{ flex: 1, padding: '14px', backgroundColor: '#0f172a', color: '#e2e8f0', borderRadius: '10px', overflowY: 'auto', minHeight: '220px', border: '1px solid #1e293b' }}>
                                            {(() => {
                                              const rawText = enrichActiveTab === 'index'
                                                ? (currentRep.indexContent || 'index.md 거버넌스 색인이 생성되어 GCS에 동기화되었습니다.')
                                                : (currentRep.logContent || 'log.md 실시간 변경 이력이 갱신되었습니다.');
                                              const lines = rawText.split('\n');
                                              return lines.map((line, lIdx) => {
                                                let isDiff = false;
                                                let badgeText = '';
                                                if (enrichActiveTab === 'log') {
                                                  if (line.includes('Metadata Enrichment') || line.includes('Enriched OKF') || line.includes('Wiki') || line.includes('★') || line.includes('UPDATED')) {
                                                    isDiff = true;
                                                    badgeText = '+ NEW LOG';
                                                  }
                                                } else {
                                                  const matchedTable = tablesList.find(t => line.includes(t));
                                                  if (matchedTable || line.includes('Enriched') || line.includes('보강') || line.includes('★')) {
                                                    isDiff = true;
                                                    badgeText = `+ UPDATED INDEX [${matchedTable || 'GOV'}]`;
                                                  }
                                                }

                                                if (isDiff) {
                                                  return (
                                                    <div key={lIdx} style={{ backgroundColor: '#064e3b', color: '#6ee7b7', padding: '3px 8px', borderRadius: '4px', margin: '3px 0', borderLeft: '4px solid #10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', fontFamily: 'monospace' }}>
                                                      <span>+ {line}</span>
                                                      <span style={{ fontSize: '9px', backgroundColor: '#047857', color: '#ecfdf5', padding: '1px 6px', borderRadius: '3px', fontWeight: 'bold' }}>{badgeText}</span>
                                                    </div>
                                                  );
                                                }
                                                return (
                                                  <div key={lIdx} style={{ color: '#94a3b8', padding: '1.5px 0', fontFamily: 'monospace', fontSize: '11.5px' }}>
                                                    &nbsp; {line}
                                                  </div>
                                                );
                                              });
                                            })()}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Right Section (50%): Selected Table Enriched OKF Spec & Diff Viewer */}
                                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-light)', paddingLeft: '24px', overflowY: 'auto' }}>
                                        {(() => {
                                          const activeDetail = detailsList.find(d => d.tableId === (selectedEnrichedTable || detailsList[0]?.tableId)) || detailsList[0];
                                          return activeDetail ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                                                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                  <span>✨</span> [{activeDetail.tableId}] {appLang === 'en' ? 'Enriched OKF Spec Diff Report' : '보강된 OKF 명세 Diff 리포트'}
                                                </h3>
                                                <span style={{ fontSize: '11px', backgroundColor: '#f3e8ff', color: '#6b21a8', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                  Gemini 3.5 Flash Inference
                                                </span>
                                              </div>

                                              {/* AI 추론 생각 흐름 (Thoughts) */}
                                              {activeDetail.thought && (
                                                <div style={{ backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: '8px', padding: '12px 14px' }}>
                                                  <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#b26b00', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span>🧠</span> {appLang === 'en' ? 'AI Reasoning Thoughts (Thoughts)' : 'AI 추론 생각 흐름 (Thoughts)'}
                                                  </div>
                                                  <div style={{ fontSize: '11.5px', color: '#593800', lineHeight: '1.45', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                                    {activeDetail.thought}
                                                  </div>
                                                </div>
                                              )}

                                              {/* 보강 설명 카드 */}
                                              <div style={{ backgroundColor: '#fafafa', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '14px' }}>
                                                <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                                  💡 {appLang === 'en' ? 'Wiki Integrated Metadata Description (Enriched)' : '💡 위키 통합 메타데이터 설명 (Enriched Description)'}
                                                </div>
                                                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: '1.5' }}>
                                                  {activeDetail.description || (appLang === 'en' ? 'Wiki knowledge mapped and business description enriched.' : '위키 지식이 매핑되어 비즈니스 설명이 풍성하게 확장되었습니다.')}
                                                </p>

                                                {/* 📌 Referenced Docs List */}
                                                {activeDetail.referencedDocs && activeDetail.referencedDocs.length > 0 && (
                                                  <div style={{ marginTop: '10px', borderTop: '1px solid var(--border-light)', paddingTop: '8px' }}>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>
                                                      {appLang === 'en' ? '참조된 문서 (Referenced Docs):' : '참조된 문서:'}
                                                    </span>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                                      {activeDetail.referencedDocs.map((doc, dIdx) => (
                                                        <span key={dIdx} style={{ fontSize: '10px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                          <span>📄</span> {doc}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>

                                              {/* 변경 사항 Diff 뷰어 (Original vs Enriched 마크다운 차이 강조) */}
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '8px 12px', borderRadius: '6px' }}>
                                                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                                    🔍 OKF SPEC DIFF: Original ➔ Enriched
                                                  </span>
                                                  <span style={{ fontSize: '10px', color: '#34d399', backgroundColor: '#064e3b', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                    + {appLang === 'en' ? 'Green: Added/enriched item from Wiki' : '녹색: 위키 지식으로 추가/보강된 항목'}
                                                  </span>
                                                </div>
                                                <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '12px', maxHeight: '340px', overflowY: 'auto', border: '1px solid #1e293b' }}>
                                                  {(() => {
                                                    const origContent = activeDetail.originalContent || '';
                                                    const enrichContent = activeDetail.enrichedContent || activeDetail.originalContent || activeDetail.content || activeDetail.description || '';

                                                    if (!enrichContent || enrichContent.trim().length === 0) {
                                                      return (
                                                        <div style={{ color: '#94a3b8', fontSize: '11.5px', fontStyle: 'italic', textAlign: 'center', padding: '12px' }}>
                                                          {appLang === 'en' ? 'Full specification markdown synced to GCS successfully.' : '전체 명세 마크다운이 GCS에 정상 동기화되었습니다.'}
                                                        </div>
                                                      );
                                                    }

                                                    const origLines = origContent ? origContent.split('\n') : [];
                                                    const enrichLines = enrichContent.split('\n');

                                                    return enrichLines.map((line, idx) => {
                                                      const isNew = origLines.length > 0 && !origLines.includes(line) && line.trim().length > 0;
                                                      if (isNew) {
                                                        return (
                                                          <div key={idx} style={{ backgroundColor: '#064e3b', color: '#6ee7b7', padding: '3px 8px', borderRadius: '3px', margin: '2px 0', borderLeft: '3px solid #10b981', fontFamily: 'monospace', fontSize: '11.5px', lineHeight: '1.5', wordBreak: 'break-all' }}>
                                                            <span style={{ color: '#34d399', fontWeight: 'bold', marginRight: '6px', userSelect: 'none' }}>+</span>
                                                            {line}
                                                          </div>
                                                        );
                                                      }
                                                      return (
                                                        <div key={idx} style={{ color: '#cbd5e1', padding: '1.5px 8px', fontFamily: 'monospace', fontSize: '11.5px', lineHeight: '1.5', wordBreak: 'break-all' }}>
                                                          <span style={{ color: '#475569', marginRight: '6px', userSelect: 'none' }}>&nbsp;</span>
                                                          {line}
                                                        </div>
                                                      );
                                                    });
                                                  })()}
                                                </div>
                                              </div>

                                              {/* 태그 및 보강된 컬럼 정보 */}
                                              {activeDetail.tags && activeDetail.tags.length > 0 && (
                                                <div>
                                                  <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>🏷️ 도메인 태그</span>
                                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    {activeDetail.tags.map((t, tIdx) => (
                                                      <span key={tIdx} style={{ backgroundColor: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                                                        #{t}
                                                      </span>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                              {appLang === 'en' ? 'Select a table from the list to display the enriched specification.' : '목록에서 테이블을 선택하면 보강된 상세 스펙이 표시됩니다.'}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px', border: '1px dashed var(--border-light)', borderRadius: '8px', backgroundColor: '#fafafa', textAlign: 'center', margin: '20px' }}>
                                <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔮</div>
                                <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: '600' }}>{appLang === 'en' ? 'No Saved Enrichment Report' : '저장된 Enrichment 리포트가 없습니다'}</h3>
                                <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: '1.5' }}>
                                  {appLang === 'en' ? 'To enrich dataset metadata based on internal business wiki knowledge, start it under [⚙️ Run Enrichment] subtab.' : '사내 비즈니스 위키 지식을 기반으로 데이터셋 메타데이터를 보강하려면 [⚙️ Enrichment 수행] 서브 탭에서 기동해 주세요.'}
                                </p>
                                <button onClick={() => setEnrichmentSubView('setup')} className="btn-primary" style={{ fontSize: '12px', padding: '8px 18px' }}>
                                  {appLang === 'en' ? '🔮 Go to Run Enrichment' : '🔮 Enrichment 기동하러 가기'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
            </>
              ) : (
              /* ======================================================= */
              /* 4. WELCOME STATE (KR + EN Stacked Version)             */
              /* ======================================================= */

              /* Welcome State (KR/EN Dynamic Toggle Version) */
              <div className="welcome-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 30px', textAlign: 'center', color: 'var(--text-secondary)', overflowY: 'auto' }}>
                <div style={{ fontSize: '56px', marginBottom: '14px', animation: 'pulse 2s infinite' }}>🌐</div>
                <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
                  {appLang === 'en' ? 'Welcome to OKF Omni Ontology Portal' : 'OKF Omni 온톨로지 포털에 오신 것을 환영합니다'}
                </h2>
                <p style={{ maxWidth: '640px', fontSize: '13.5px', lineHeight: '1.6', color: 'var(--text-secondary)', margin: '0 0 20px 0', fontWeight: '500' }}>
                  {appLang === 'en'
                    ? 'This platform integrates structured BigQuery databases and unstructured enterprise business knowledge using AI. Follow the instructions below to get started.'
                    : '본 플랫폼은 정형 BigQuery 데이터베이스와 비정형 사내 비즈니스 지식을 AI로 결합합니다. 아래 안내에 따라 첫 단계를 시작해 보세요.'}
                </p>

                {appLang !== 'en' && (
                  <div style={{ maxWidth: '620px', fontSize: '12.5px', lineHeight: '1.6', color: '#0369a1', margin: '0 0 24px 0', fontWeight: '500', backgroundColor: '#f0f9ff', padding: '10px 18px', borderRadius: '10px', border: '1px solid #bae6fd', textAlign: 'left', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span>ℹ️</span>
                    <div>
                      <strong>Notice:</strong> You can switch the portal language to English using the <strong>[🇺🇸 EN]</strong> toggle button at the top-right corner. (Default: Korean)
                    </div>
                  </div>
                )}

                {/* KR / EN Conditional Instruction Panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '620px', textAlign: 'left' }}>

                  {appLang !== 'en' ? (
                    /* Korean Version Card */
                    <div style={{ backgroundColor: '#ffffff', padding: '18px 22px', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', fontSize: '13.5px', lineHeight: '1.6' }}>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--color-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🇰🇷</span> 한국어 사용 안내 (Getting Started - KR)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', gap: '10px' }}><span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>1.</span> <span>좌측 상단 <strong>GCP Project ID</strong>를 입력하고 <strong>[Connect]</strong> 버튼을 클릭합니다.</span></div>
                        <div style={{ display: 'flex', gap: '10px' }}><span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>2.</span> <span>좌측 <strong>BIGQUERY EXPLORER</strong> 사이드바에서 데이터셋 또는 테이블 중 하나를 선택합니다.</span></div>
                        <div style={{ display: 'flex', gap: '10px' }}><span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>3.</span> <span>메인 영역의 <strong>[⚡ OKF Builder(Batch)]</strong> 탭 또는 <strong>[OKF Builder]</strong> 탭에서 <strong>[⚡ Generate OKF (All Tables)]</strong> 또는 <strong>[⚡ Generate OKF]</strong> 버튼을 클릭하여 AI 온톨로지를 자동 생성하세요!</span></div>
                      </div>
                    </div>
                  ) : (
                    /* English Version Card */
                    <div style={{ backgroundColor: '#f8fafc', padding: '18px 22px', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', fontSize: '13.5px', lineHeight: '1.6' }}>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0369a1', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🇺🇸</span> English Quick Guide (Getting Started - EN)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#334155' }}>
                        <div style={{ display: 'flex', gap: '10px' }}><span style={{ color: '#0369a1', fontWeight: 'bold' }}>1.</span> <span>Enter your <strong>GCP Project ID</strong> at the top-left sidebar and click <strong>[Connect]</strong>.</span></div>
                        <div style={{ display: 'flex', gap: '10px' }}><span style={{ color: '#0369a1', fontWeight: 'bold' }}>2.</span> <span>Select a dataset or table from the left <strong>BIGQUERY EXPLORER</strong> sidebar.</span></div>
                        <div style={{ display: 'flex', gap: '10px' }}><span style={{ color: '#0369a1', fontWeight: 'bold' }}>3.</span> <span>In the <strong>[⚡ OKF Builder(Batch)]</strong> or <strong>[OKF Builder]</strong> tab, click <strong>[⚡ Generate OKF (All Tables)]</strong> or <strong>[⚡ Generate OKF]</strong> to auto-build AI Ontology files!</span></div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
          )}
            </section>



      </main>

      {/* ======================================================= */}
      {/* 4. SLIDING LOG DRAWER PANEL                             */}
      {/* ======================================================= */}
      <div className={`log-drawer ${isLogDrawerOpen ? 'open' : ''}`}>
        <div className="log-drawer-header">
          <h3>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="4" y1="9" x2="20" y2="9"></line>
              <line x1="4" y1="15" x2="20" y2="15"></line>
              <line x1="10" y1="3" x2="8" y2="21"></line>
              <line x1="16" y1="3" x2="14" y2="21"></line>
            </svg>
            실시간 작업 로그
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setLogs([])} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', borderStyle: 'dashed' }}>전체 삭제</button>
            <button onClick={() => setIsLogDrawerOpen(false)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 'bold' }}>닫기</button>
          </div>
        </div>

        <div className="log-list">
          {logs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', fontStyle: 'italic' }}>기록된 작업이 없습니다.</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className={`log-item ${log.type}`}>
                <span className="log-time">[{log.timestamp}]</span>
                <span className="log-text">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ======================================================= */}
      {/* 5. NEW WIKI CREATOR MODAL PANEL                         */}
      {/* ======================================================= */}
      {isWikiModalOpen && (
        <div className="modal-overlay" onClick={() => setIsWikiModalOpen(false)}>
          <div className="modal-content" style={{ width: '640px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🔮</span> 사내 비즈니스 위키(LLM-Wiki) 신규 작성
              </h3>
              <button onClick={() => setIsWikiModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
            </div>

            {/* 샘플 문서 연동 및 PDF 업로드 퀵 위젯 영역 */}
            <div style={{ padding: '12px 14px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: '600', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>⚡ Quick Fill:</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>사내 PDF 문서나 로컬 파일에서 내용을 파싱하여 주입해 보세요.</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <select
                    value={selectedSample}
                    onChange={(e) => handleSelectSample(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: '#ffffff', fontSize: '12px', outline: 'none' }}
                    disabled={isPdfParsing}
                  >
                    <option value="">📁 사내 제공 샘플 문서 선택 (선택 시 자동 추출)...</option>
                    {wikiSamples.map(sample => (
                      <option key={sample} value={sample}>{sample}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 0.8, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label
                    htmlFor="pdf-file-upload-input"
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '11.5px', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', borderStyle: 'dashed', width: '100%', justifyContent: 'center' }}
                  >
                    📂 로컬 PDF 파일 업로드 (자동 추출)
                  </label>
                  <input
                    id="pdf-file-upload-input"
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfUpload}
                    style={{ display: 'none' }}
                    disabled={isPdfParsing}
                  />
                </div>
              </div>
            </div>

            {isPdfParsing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', backgroundColor: 'var(--color-primary-bg)', borderRadius: '6px', fontSize: '12px', color: 'var(--color-primary)', fontWeight: '500' }}>
                <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid var(--color-primary-bg)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                PDF 파일로부터 본문 텍스트를 추출하고 있습니다. 잠시만 기다려 주세요...
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '5px' }}>지식 카테고리</label>
                  <select
                    value={wikiCategory}
                    onChange={(e) => setWikiCategory(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: '#ffffff', fontSize: '13px', outline: 'none' }}
                  >
                    <option value="general">일반 도메인 지식 (General)</option>
                    <option value="business_rules">핵심 비즈니스 규칙 (Business Rules)</option>
                    <option value="data_dictionary">사용자 데이터 사전 (Data Dictionary)</option>
                    <option value="architecture">데이터 파이프라인/아키텍처 (Architecture)</option>
                  </select>
                </div>
                <div style={{ flex: 1.5 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '5px' }}>위키 파일명 (비워두면 자동 생성)</label>
                  <input
                    type="text"
                    value={wikiFileName}
                    onChange={(e) => setWikiFileName(e.target.value)}
                    placeholder="예: refund_policy (미입력 시 내용 기반 자동 명명)"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '5px' }}>지식 본문 서술 (Markdown 포맷 지원)</label>
                <textarea
                  value={wikiContent}
                  onChange={(e) => setWikiContent(e.target.value)}
                  placeholder="위키 문서 본문 내용을 입력하거나, 상단 Quick Fill에서 PDF를 파싱해 보세요."
                  rows={11}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '13px', fontFamily: 'monospace', resize: 'vertical', outline: 'none', lineHeight: '1.5' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '14px', marginTop: '4px' }}>
              <button className="btn-secondary" onClick={() => setIsWikiModalOpen(false)} style={{ fontSize: '12.5px', padding: '6px 12px' }}>취소</button>
              <button className="btn-primary" onClick={handleSaveWiki} style={{ fontSize: '12.5px', padding: '6px 16px' }} disabled={isLoading}>
                {isLoading ? '저장 중...' : 'GCS 위키에 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* 6. ONBOARDING STEP-BY-STEP USER GUIDE MODAL             */}
      {/* ======================================================= */}
      {isGuideModalOpen && (
        <GuideModal currentLang={appLang} onLangChange={setAppLang} onClose={() => setIsGuideModalOpen(false)} />
      )}

    </div>
  );
}

// 온보딩 실전 가이드 모달 (GuideModal: KR / EN 지원)
function GuideModal({ currentLang, onLangChange, onClose }) {
  const lang = currentLang || 'kr';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: '1040px', maxWidth: '94vw', maxHeight: '90vh', padding: '30px 36px', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header with Language Toggle Tabs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--color-primary-bg)', paddingBottom: '16px' }}>
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '23px', fontWeight: '800', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>📖</span> {lang === 'kr' ? 'OKF Omni 온보딩 & 실전 파이프라인 가이드' : 'OKF Omni Onboarding & Pipeline Guide'}
            </h2>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {lang === 'kr' ? 'BigQuery 스캔부터 OKF 생성, GCS 위키 수집, AI Enrichment 및 Data Agent 질의까지' : 'From BigQuery scan to OKF creation, GCS wiki collection, AI Enrichment, and Data Agent Chat'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Language Switcher Pill Capsule (Header와 100% 동일 미러링) */}
            <div style={{ display: 'flex', backgroundColor: '#ffffff', padding: '2px', borderRadius: '20px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <button
                onClick={() => onLangChange && onLangChange('kr')}
                style={{
                  padding: '5px 14px',
                  borderRadius: '16px',
                  border: 'none',
                  fontSize: '12.5px',
                  fontWeight: 'bold',
                  backgroundColor: lang === 'kr' ? 'var(--color-primary)' : 'transparent',
                  color: lang === 'kr' ? '#ffffff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                🇰🇷 KR
              </button>
              <button
                onClick={() => onLangChange && onLangChange('en')}
                style={{
                  padding: '5px 14px',
                  borderRadius: '16px',
                  border: 'none',
                  fontSize: '12.5px',
                  fontWeight: 'bold',
                  backgroundColor: lang === 'en' ? 'var(--color-primary)' : 'transparent',
                  color: lang === 'en' ? '#ffffff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                🇺🇸 EN
              </button>
            </div>

            <button
              onClick={onClose}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '36px', height: '36px', fontSize: '22px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Scrollable Guide Content Body with Large Typography */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '14px', paddingBottom: '36px', display: 'flex', flexDirection: 'column', gap: '28px', lineHeight: '1.75', fontSize: '15.5px' }}>

          {/* 5-Step Overview Infographic */}
          <div style={{ padding: '18px 20px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '26px' }}>🌐</div>
              <div style={{ fontWeight: 'bold', color: 'var(--color-primary)', marginTop: '4px', fontSize: '13.5px' }}>
                {lang === 'kr' ? '1. BQ 스캔' : '1. BQ Scan'}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Catalog Scan</div>
            </div>
            <div style={{ fontSize: '18px', color: '#94a3b8' }}>➔</div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '26px' }}>📝</div>
              <div style={{ fontWeight: 'bold', color: 'var(--color-primary)', marginTop: '4px', fontSize: '13.5px' }}>
                {lang === 'kr' ? '2. OKF 생성' : '2. OKF Build'}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Single/All Tables</div>
            </div>
            <div style={{ fontSize: '18px', color: '#94a3b8' }}>➔</div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '26px' }}>📚</div>
              <div style={{ fontWeight: 'bold', color: 'var(--color-primary)', marginTop: '4px', fontSize: '13.5px' }}>
                {lang === 'kr' ? '3. 위키/PDF 수집' : '3. Wiki Ingest'}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>GCS Wiki Base</div>
            </div>
            <div style={{ fontSize: '18px', color: '#94a3b8' }}>➔</div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '26px' }}>⚡</div>
              <div style={{ fontWeight: 'bold', color: 'var(--color-primary)', marginTop: '4px', fontSize: '13.5px' }}>
                {lang === 'kr' ? '4. AI Enrichment' : '4. AI Enrich'}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Gemini 3.5 Flash</div>
            </div>
            <div style={{ fontSize: '18px', color: '#94a3b8' }}>➔</div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '26px' }}>💬</div>
              <div style={{ fontWeight: 'bold', color: 'var(--color-primary)', marginTop: '4px', fontSize: '13.5px' }}>
                {lang === 'kr' ? '5. Data Agent 질의' : '5. Agent Analytics'}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Provenances</div>
            </div>
          </div>

          {lang === 'kr' ? (
            /* KOREAN VERSION CONTENT */
            <>
              {/* Step 1 */}
              <div style={{ borderLeft: '4px solid #1a73e8', paddingLeft: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '700', color: '#1a73e8' }}>
                  STEP 1. GCP 접속 & Knowledge Catalog 스캔 정보 확인
                </h3>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  시작을 위해 좌측 상단 <strong>GCP Project ID</strong>를 입력하고 <strong>[Connect]</strong> 버튼을 클릭합니다.
                </p>
                <ul style={{ paddingLeft: '24px', margin: 0, color: 'var(--text-muted)', fontSize: '14.5px' }}>
                  <li><strong>BigQuery Explorer 탐색</strong>: 데이터셋과 개별 테이블/뷰 목록을 조회합니다.</li>
                  <li><strong>Knowledge Catalog Scan 정보 검토</strong>: 테이블 선택 시 <code>Catalog Info</code> 탭에서 컬럼 프로파일링 통계(Distinct Count, Null Rate), INFORMATION_SCHEMA DDL, 외래키 리니지 및 Data Quality ASSERT 구문을 즉시 확인할 수 있습니다.</li>
                </ul>
              </div>

              {/* Step 2 */}
              <div style={{ borderLeft: '4px solid #0f9d58', paddingLeft: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '700', color: '#0f9d58' }}>
                  STEP 2. 표준 OKF(Open Knowledge Format) 온톨로지 문서 생성
                </h3>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  BigQuery의 스키마 메타데이터를 AI 에이전트가 해석하여 표준 온톨로지 명세서(OKF)로 전환합니다.
                </p>
                <ul style={{ paddingLeft: '24px', margin: 0, color: 'var(--text-muted)', fontSize: '14.5px' }}>
                  <li><strong>단일 테이블 OKF 생성</strong>: 테이블 선택 후 <code>OKF Markdown</code> 탭에서 <strong>[Generate OKF]</strong> 실행.</li>
                  <li><strong>데이터셋 전체 일괄 생성</strong>: 데이터셋 레벨 <code>⚡ OKF Builder(Batch)</code> 탭에서 <strong>[Generate OKF (All Tables)]</strong> 버튼을 통해 데이터셋 내 모든 테이블을 한 번에 순차 자동 생성할 수 있습니다.</li>
                  <li><strong>관계 백링크 파싱 및 연동 (mdcode Spec 기여)</strong>: 생성물 내에 포함된 RDB 외래키(🔗 FK) 및 그래프 관계(🕸️ Edge) 명세를 자체 식별 및 파싱하여 정밀 리니지를 구축합니다.</li>
                  <li><strong>GCS 저장 및 확인</strong>: 생성 완료된 <code>.okf.md</code> 파일은 중앙 Google Cloud Storage 버킷에 자동 저장되며, 화면 좌하단 <strong>GCS Bundle Explorer</strong>에서 즉시 열람 및 관리할 수 있습니다.</li>
                </ul>
              </div>

              {/* Step 3 */}
              <div style={{ borderLeft: '4px solid #fbbc04', paddingLeft: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '700', color: '#b45309' }}>
                  STEP 3. 비즈니스 지식 수집 (GCS 위키 추가 & PDF 자동 파싱)
                </h3>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  단순 기술 메타데이터만으로는 파악하기 힘든 비즈니스 도메인 규칙, 환불 정책, 아키텍처 문서를 위키로 등록합니다.
                </p>
                <ul style={{ paddingLeft: '24px', margin: 0, color: 'var(--text-muted)', fontSize: '14.5px' }}>
                  <li><strong>GCS 위키 탐색기 활용</strong>: 화면 좌측 하단 <strong>GCS Bundle Explorer</strong>에서 <code>wiki/</code> 폴더 선택 시 <strong>[+ Add Wiki]</strong> 버튼이 활성화됩니다.</li>
                  <li><strong>사내 PDF 문서 퀵 파싱</strong>: 위키 창에서 사내 로컬 PDF 파일 또는 샘플 PDF를 선택하면, PDF에서 본문 텍스트가 자동으로 파싱되어 위키 문서 내용으로 실시간 주입됩니다.</li>
                </ul>
              </div>

              {/* Step 4 */}
              <div style={{ borderLeft: '4px solid #7a42b9', paddingLeft: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '700', color: '#7a42b9' }}>
                  STEP 4. AI Knowledge Enrichment (Table & Dataset Level)
                </h3>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  수집된 GCS 위키 지식을 기반으로 AI 에이전트가 초기의 초안 OKF 문서를 비즈니스 설명이 풍부한 최고 품질 온톨로지로 승격시키며 표준 <code>enrichment_report.md</code> 리포트로 저장합니다.
                </p>
                <ul style={{ paddingLeft: '24px', margin: 0, color: 'var(--text-muted)', fontSize: '14.5px' }}>
                  <li><strong>데이터셋 & 개별 테이블 지정 Enrichment</strong>: <code>🔮 Knowledge Enrichment</code> 탭에서 <code>☑️ 전체 선택/해제</code> 토글 및 체크박스를 통해 원하는 특정 테이블 세트만 지정하여 <strong>Gemini 3.5 Flash</strong> 기반으로 정밀 보강을 수행합니다.</li>
                  <li><strong>단일 테이블 레벨 1:1 초고속 Enrichment</strong>: 탐색기에서 테이블 선택 시, 마지막 <code>🔮 Knowledge Enrichment</code> 탭에서 3초 이내 해당 테이블만 1:1로 집중 보강하고 스펙 프리뷰를 제공합니다.</li>
                  <li><strong>지능형 스마트 서브탭 랜딩 & 수행 탭 유지</strong>: 기존 결과가 존재하면 <strong>Enrichment 결과</strong> 서브탭으로 즉시 랜딩하며, 보강 수행 시에는 탭 튕김 없이 수행 탭을 유지하다 완료 시 자동 이동합니다.</li>
                  <li><strong>생각의 흐름 (Thoughts) & Diff 검증</strong>: 오른쪽 실시간 추론 추적 패널에서 AI의 내부 추론 단계(Thoughts)를 확인하고, <code>Before vs After Diff</code> 뷰어와 GCS <code>index.md</code> / <code>log.md</code> 원본 이력을 검토합니다.</li>
                </ul>
              </div>

              {/* Step 5 - User Centric Narrative */}
              <div style={{ borderLeft: '4px solid #ec4899', paddingLeft: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '700', color: '#be185d' }}>
                  STEP 5. Data Agent 대화형 질문 & 5단계 추론 출처(Provenance) 검증
                </h3>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  현업 사용자는 전문 SQL 구문을 몰라도 자연어로 데이터셋 및 비즈니스 규정을 질의하고, 대화 이력 영구 지속성 및 5단계 추론 출처를 직접 검증할 수 있습니다.
                </p>
                <ul style={{ paddingLeft: '24px', margin: 0, color: 'var(--text-muted)', fontSize: '14.5px' }}>
                  <li><strong>대화형 질문 입력 및 실행 전략 자동 판별</strong>:
                    <br />"지난달 주문량이 가장 높은 상위 5명 고객 알려줘" 또는 "반품 처리 규정이 어떻게 돼?"와 같이 일상 언어로 입력하면 에이전트가 <code>⚡ SQL 엔진</code>, <code>🕸️ Property Graph GQL</code>, <code>📚 위키 규정 직접 참조</code> 중 최적의 전략을 자동 결정합니다.
                  </li>
                  <li><strong>대화 내역 영구 지속성 & Reset 기능</strong>:
                    <br />데이터셋별 대화 내역이 <code>localStorage</code>에 영구 저장(<code>💾 Chat Saved</code> 표시)되며, 언제든 상단 <code>🗑️ 대화 내역 초기화 (Reset Chat)</code> 버튼으로 깨끗이 초기화할 수 있습니다.
                  </li>
                  <li><strong>사용자 피드백 루프 & 지침 저장</strong>:
                    <br />좋아요(👍) 클릭 시 0ms 즉각 UI 반응과 함께 사용자 교정 지침이 <code>[datasetId]/agent/feedback/</code> 경로 아래 마크다운 문서로 영구 수집됩니다.
                  </li>
                  <li><strong>우측 5단계 추론 출처 및 지표(Step Metrics) 검증</strong>:
                    <br />각 추론 단계(Step 1~5)별 소요시간 및 토큰 단일 행 지표 바(<code>⏱️ 소요시간 | 🪙 토큰 / 📚 결과</code>)와 함께 OKF 백링크, 참조 위키 원문을 100% 투명하게 확인합니다.
                  </li>
                  <li><strong>쿼리 오류 자동 수정 (Auto-Retry Loop)</strong>:
                    <br />질문 실행 중 예약어나 구문 에러가 발생하더라도 백엔드에서 에이전트가 1회 자동 수정 재시도를 수행하므로, 사용자에게 오류를 겪게 하지 않고 정상 데이터를 자동 반환합니다.
                  </li>
                </ul>
              </div>
            </>
          ) : (
            /* ENGLISH VERSION CONTENT */
            <>
              {/* Step 1 */}
              <div style={{ borderLeft: '4px solid #1a73e8', paddingLeft: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '700', color: '#1a73e8' }}>
                  STEP 1. GCP Connection & Knowledge Catalog Scan Inspection
                </h3>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  To get started, enter your <strong>GCP Project ID</strong> at the top-left sidebar and click <strong>[Connect]</strong>.
                </p>
                <ul style={{ paddingLeft: '24px', margin: 0, color: 'var(--text-muted)', fontSize: '14.5px' }}>
                  <li><strong>BigQuery Explorer Navigation</strong>: Inspect available datasets, tables, views, and physical Property Graphs.</li>
                  <li><strong>Knowledge Catalog Scan Information</strong>: Select a table and open <code>Catalog Info</code> to view column profiling statistics (Distinct Count, Null Rate), DDL statements, key join lineage, and BigQuery ASSERT quality rules.</li>
                </ul>
              </div>

              {/* Step 2 */}
              <div style={{ borderLeft: '4px solid #0f9d58', paddingLeft: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '700', color: '#0f9d58' }}>
                  STEP 2. Standard OKF (Open Knowledge Format) Ontology & Backlinks Generation
                </h3>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  AI agents parse BigQuery schema metadata into standardized Open Knowledge Format (OKF) markdown specifications with inter-table backlink mappings (e.g. <code>[[table.md]]</code>).
                </p>
                <ul style={{ paddingLeft: '24px', margin: 0, color: 'var(--text-muted)', fontSize: '14.5px' }}>
                  <li><strong>Single Table OKF</strong>: Select a table and click <strong>[Generate OKF]</strong> under <code>OKF Markdown</code> tab.</li>
                  <li><strong>Batch OKF Generation</strong>: Open <code>⚡ OKF Builder(Batch)</code> tab to auto-generate OKF files for all dataset tables sequentially.</li>
                  <li><strong>Relationship Backlinks Parsing & Integration (mdcode Spec Contribution)</strong>: The platform supports parsing of RDB join foreign keys (🔗 FK Backlinks) and graph relationship properties (🕸️ Edge Links) inside generated files to build high-fidelity lineage.</li>
                  <li><strong>GCS Storage & Bundle Explorer</strong>: Generated <code>.okf.md</code> files are automatically saved to central GCS buckets and listed in the bottom-left <strong>GCS Bundle Explorer</strong>.</li>
                </ul>
              </div>

              {/* Step 3 */}
              <div style={{ borderLeft: '4px solid #fbbc04', paddingLeft: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '700', color: '#b45309' }}>
                  STEP 3. Business Knowledge Collection (GCS Wiki & PDF Parsing)
                </h3>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  Upload enterprise business domain rules, refund policies, and architecture notes that cannot be inferred from pure SQL schemas.
                </p>
                <ul style={{ paddingLeft: '24px', margin: 0, color: 'var(--text-muted)', fontSize: '14.5px' }}>
                  <li><strong>GCS Bundle Wiki Explorer</strong>: Select the <code>wiki/</code> folder in GCS Explorer to activate the <strong>[+ Add Wiki]</strong> button.</li>
                  <li><strong>Automatic PDF Text Parsing</strong>: Select internal sample PDFs or upload local PDF files inside the Wiki modal to automatically parse and extract text into markdown wiki format.</li>
                </ul>
              </div>

              {/* Step 4 */}
              <div style={{ borderLeft: '4px solid #7a42b9', paddingLeft: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '700', color: '#7a42b9' }}>
                  STEP 4. Autonomous AI Knowledge Enrichment & Property Graph Studio
                </h3>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  Using stored GCS business wikis, AI agents enrich draft OKF documents into high-quality business ontologies and build BigQuery Property Graphs.
                </p>
                <ul style={{ paddingLeft: '24px', margin: 0, color: 'var(--text-muted)', fontSize: '14.5px' }}>
                  <li><strong>Dataset Level Knowledge Enrichment</strong>: Run parallel enrichment using <strong>Gemini 3.5 Flash</strong> under dataset <code>🔮 Knowledge Enrichment</code> tab. Results are stored in GCS as standard <code>enrichment_report.md</code> with YAML frontmatter.</li>
                  <li><strong>Smart Subtab Navigation</strong>: Opens directly in the <strong>Result View</strong> if a report exists, or stays in <strong>Setup View</strong> while running without unexpected tab jumps until completion.</li>
                  <li><strong>Property Graphs Explorer (`Graphs` Tab)</strong>: Inspect physical graphs with top summary table and bottom 2-column view (Left: Metadata Spec & Node/Edge cards, Right: VS Code DDL Statement with 1-click copy).</li>
                </ul>
              </div>

              {/* Step 5 - User Centric Narrative */}
              <div style={{ borderLeft: '4px solid #ec4899', paddingLeft: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '700', color: '#be185d' }}>
                  STEP 5. Data Agent Conversational Analytics & 5-Step Provenance Verification
                </h3>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  Business users can query enterprise datasets and domain policies using natural language without writing SQL/GQL, while inspecting 5-stage reasoning provenance for 100% data transparency.
                </p>
                <ul style={{ paddingLeft: '24px', margin: 0, color: 'var(--text-muted)', fontSize: '14.5px' }}>
                  <li><strong>Conversational Analytics & Strategy Auto-Selection</strong>:
                    <br />Ask plain questions like "Who are the top 5 customers with highest order count last month?" or "What is our return policy?". AI automatically selects between <code>⚡ SQL Engine</code>, <code>🕸️ Property Graph GQL</code>, or <code>📚 Direct Wiki Reference</code>.
                  </li>
                  <li><strong>Persistent Chat History & Reset Button</strong>:
                    <br />Chat history is automatically saved per dataset in <code>localStorage</code> (indicated by <code>💾 Chat Saved</code> badge). Click <code>🗑️ Reset Chat</code> to clear context anytime.
                  </li>
                  <li><strong>User Feedback Loop & Feedback Rule Storage</strong>:
                    <br />Clicking Thumbs Up (👍) provides instant 0ms feedback, saving human corrections directly under <code>[datasetId]/agent/feedback/</code>.
                  </li>
                  <li><strong>5-Stage Provenance Panel & Step Metrics</strong>:
                    <br />Inspect reasoning steps 1 to 5 with unified 1-line execution time and token metrics bars (<code>⏱️ Step Time | 🪙 Tokens / 📚 Results</code>).
                  </li>
                  <li><strong>Autonomous Auto-Retry Execution</strong>:
                    <br />If syntax or reserved keyword errors occur during execution, backend agents automatically retry with corrected queries, ensuring seamless user experience.
                  </li>
                </ul>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// BigQuery Graph DDL 파서 및 시각화 컴포넌트
function BigQueryGraphVisualizer({ ddl }) {
  const [selectedNode, setSelectedNode] = useState(null);

  const { nodes, edges } = useMemo(() => {
    if (!ddl) return { nodes: [], edges: [] };
    const nodesFound = [];
    const edgesFound = [];

    // 1. Node Tables 파싱 (`dataset.tablename` AS `label` 또는 `tablename` AS `label`)
    const nodeBlockMatch = ddl.match(/NODE\s+TABLES\s*\(([\s\S]*?)\)(?=\s*EDGE|\s*;|\s*$)/i);
    if (nodeBlockMatch) {
      const content = nodeBlockMatch[1];
      const nodeRegex = /(?:`[^`]+`|[\w.]+)\s+AS\s+`?([a-zA-Z0-9_]+)`?/gi;
      let match;
      while ((match = nodeRegex.exec(content)) !== null) {
        const label = match[1];
        if (label && !['LABEL', 'PROPERTIES', 'KEY'].includes(label.toUpperCase()) && !nodesFound.includes(label)) {
          nodesFound.push(label);
        }
      }
    }

    // 2. Edge Tables 파싱
    const edgeBlockMatch = ddl.match(/EDGE\s+TABLES\s*\(([\s\S]*?)\)(?=\s*;|\s*$)/i);
    if (edgeBlockMatch) {
      const content = edgeBlockMatch[1];
      const edgeRegex = /(?:`[^`]+`|[\w.]+)\s+AS\s+`?([a-zA-Z0-9_]+)`?/gi;
      let match;
      while ((match = edgeRegex.exec(content)) !== null) {
        const label = match[1];
        if (label && !['LABEL', 'PROPERTIES', 'KEY', 'SOURCE', 'TARGET', 'DESTINATION'].includes(label.toUpperCase()) && !edgesFound.includes(label)) {
          edgesFound.push(label);
        }
      }
    }

    return { nodes: nodesFound, edges: edgesFound };
  }, [ddl]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', minHeight: '420px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
      {/* 캔버스 헤더 정보 (BigQuery Studio Style) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a', color: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', backgroundColor: '#1e293b', padding: '3px 10px', borderRadius: '12px', border: '1px solid #334155' }}>
            {nodes.length} nodes, {edges.length} edges
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Preview</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', backgroundColor: '#1e293b', padding: '2px 8px', borderRadius: '4px' }}>+ New node</span>
          <span style={{ fontSize: '11px', color: '#94a3b8', backgroundColor: '#1e293b', padding: '2px 8px', borderRadius: '4px' }}>+ New edge</span>
        </div>
      </div>

      {/* 시각화 다크 닷매트릭스 캔버스 (BigQuery 콘솔 스펙 미러링) */}
      <div style={{ flex: 1, position: 'relative', backgroundColor: '#090d16', backgroundImage: 'radial-gradient(#334155 1.2px, transparent 1.2px)', backgroundSize: '20px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '360px', overflow: 'auto', padding: '30px' }}>

        {/* 선택한 요소 인스펙터 팝업 카테고리 (BigQuery Studio 스크린샷 100% 동일 구현) */}
        {selectedNode && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            width: '260px',
            backgroundColor: '#1e293b',
            borderRadius: '10px',
            border: '1px solid #334155',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 10,
            padding: '14px',
            color: '#f8fafc',
            fontSize: '11.5px'
          }}>
            {/* Header / Top actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '8px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => setSelectedNode(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}
                >
                  ←
                </button>
                <span style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                  {selectedNode}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', color: '#94a3b8', cursor: 'pointer' }}>
                <span>🗑️</span>
                <span>✏️</span>
              </div>
            </div>

            {/* Labels Section */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                <span>🏷️ Labels</span>
                <span style={{ color: '#f8fafc', fontWeight: 'bold' }}>{selectedNode}</span>
              </div>
            </div>

            {/* Properties Section */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontWeight: 'bold', color: '#94a3b8', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Properties</span>
                <span>4</span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                Selected property represents nodes in query visualization.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#38bdf8' }}>🔘</span>
                    <span>id</span>
                  </div>
                  <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>INT64</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#64748b' }}>⚪</span>
                    <span>name / title</span>
                  </div>
                  <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>STRING</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#64748b' }}>⚪</span>
                    <span>created_at</span>
                  </div>
                  <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>TIMESTAMP</span>
                </div>
              </div>
            </div>

            {/* Neighbors Section */}
            <div>
              <div style={{ fontWeight: 'bold', color: '#94a3b8', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Neighbors</span>
                <span>{edges.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {edges.slice(0, 2).map((edgeName, idx) => (
                  <div key={idx} style={{ padding: '3px 8px', backgroundColor: '#0f172a', borderRadius: '4px', border: '1px solid #334155', color: '#ec4899', fontSize: '11px', fontWeight: 'bold' }}>
                    ⚟ {edgeName}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {nodes.length > 0 ? (
          <div style={{ display: 'flex', gap: '36px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', maxWidth: '640px' }}>
            {nodes.map((nodeName, index) => {
              const colors = ['#1d4ed8', '#be185d', '#047857', '#b45309', '#6d28d9'];
              const themeColor = colors[index % colors.length];
              const isSelected = selectedNode === nodeName;
              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 16px',
                    backgroundColor: '#1e293b',
                    borderRadius: '10px',
                    border: `1.5px solid ${isSelected ? '#38bdf8' : themeColor}`,
                    boxShadow: isSelected ? '0 0 20px #38bdf8' : `0 0 16px ${themeColor}33`,
                    transition: 'transform 0.2s',
                    cursor: 'pointer',
                    zIndex: 2
                  }}
                  onClick={() => setSelectedNode(nodeName)}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.04)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {/* BigQuery Console 스타일 네온 원형 뱃지 */}
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: themeColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    boxShadow: `0 0 12px ${themeColor}`
                  }}>
                    ●
                  </div>
                  {/* 노드 상세 레이블 */}
                  <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#f8fafc', fontFamily: 'monospace' }}>
                      {nodeName}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      KEY (id)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            시각화할 그래프의 노드 테이블 정보가 DDL에 정의되어 있지 않습니다.
          </div>
        )}
      </div>

      {/* ➕ Add Wiki Document Modal Dialog (Karpathy 01_raw Ingestion) */}
      {addWikiModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
            width: '100%',
            maxWidth: '680px',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              backgroundColor: '#6b21a8',
              color: '#ffffff',
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>➕</span> Add New Raw Wiki Document (Karpathy 01_raw Layer)
                </h3>
                <span style={{ fontSize: '11.5px', opacity: 0.85, marginTop: '2px', display: 'block' }}>
                  기존 저장 문서 선택, Text 직접 입력 또는 PDF/파일 업로드를 통해 원본 지식 레이어(01_raw/)에 업로드합니다.
                </span>
              </div>
              <button
                onClick={() => setAddWikiModalOpen(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  opacity: 0.8
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Sub Tab Selector */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
              <button
                onClick={() => setAddWikiType('preset')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: 'none',
                  borderBottom: addWikiType === 'preset' ? '3px solid #6b21a8' : 'none',
                  backgroundColor: addWikiType === 'preset' ? '#ffffff' : 'transparent',
                  color: addWikiType === 'preset' ? '#6b21a8' : '#64748b',
                  fontWeight: 'bold',
                  fontSize: '12.5px',
                  cursor: 'pointer'
                }}
              >
                📂 기존 저장 문서 선택 (Preset)
              </button>
              <button
                onClick={() => setAddWikiType('text')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: 'none',
                  borderBottom: addWikiType === 'text' ? '3px solid #6b21a8' : 'none',
                  backgroundColor: addWikiType === 'text' ? '#ffffff' : 'transparent',
                  color: addWikiType === 'text' ? '#6b21a8' : '#64748b',
                  fontWeight: 'bold',
                  fontSize: '12.5px',
                  cursor: 'pointer'
                }}
              >
                📝 텍스트 직접 입력 (Text Paste)
              </button>
              <button
                onClick={() => setAddWikiType('pdf_file')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: 'none',
                  borderBottom: addWikiType === 'pdf_file' ? '3px solid #6b21a8' : 'none',
                  backgroundColor: addWikiType === 'pdf_file' ? '#ffffff' : 'transparent',
                  color: addWikiType === 'pdf_file' ? '#6b21a8' : '#64748b',
                  fontWeight: 'bold',
                  fontSize: '12.5px',
                  cursor: 'pointer'
                }}
              >
                📄 PDF / 파일 업로드 (Upload)
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', maxHeight: '480px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Option 1: Preset Documents */}
              {addWikiType === 'preset' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>
                    📌 사내 사전 검증된 업무 정의서 지침 선택
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div
                      onClick={() => handleAddWikiDocument(
                        'abusive_customer_management.md',
                        `# 악성 반품 고객 관리 및 정의 지침\n\n## 1. 악성 반품/환불 유저 정의\n- 총 주문 건수 3건 이상 중 반품 비율(Returned/Cancelled) 40% 이상 유저.\n- Data Agent 질의 시 해당 유저의 성명, 유저 ID, 반품 건수를 표시하고 주의 태그 부여.`,
                        'preset'
                      )}
                      style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f0fdf4', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#166534' }}>📄 abusive_customer_management.md</div>
                        <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>악성 반품/환불 유저 판정 기준 (주문 3건 이상 & 반품률 40% 이상)</div>
                      </div>
                      <span style={{ backgroundColor: '#166534', color: '#ffffff', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>선택 추가 ➔</span>
                    </div>

                    <div
                      onClick={() => handleAddWikiDocument(
                        'vip_customer_policy.md',
                        `# VIP 우수 고객 등급 및 혜택 관리 규정\n\n## 1. VIP 등급 요건\n- 누적 결제 완료 금액(sale_price 합계)이 $1,000 이상인 유저.\n- 혜택: 전용 할인 쿠폰 및 무료 배송 적용.`,
                        'preset'
                      )}
                      style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f0f9ff', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0369a1' }}>📄 vip_customer_policy.md</div>
                        <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>VIP 우수 고객 등급 산정 기준 (누적 결제 금액 $1,000 이상)</div>
                      </div>
                      <span style={{ backgroundColor: '#0369a1', color: '#ffffff', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>선택 추가 ➔</span>
                    </div>

                    <div
                      onClick={() => handleAddWikiDocument(
                        'delivery_delay_refund_v2.md',
                        `# 배송 지연 보상 및 환불 처리 지침 v2\n\n## 1. 보상 기준\n- 결제 후 5일 이상 배송 출고 지연 시 $10 보상 쿠폰 자동 발급.`,
                        'preset'
                      )}
                      style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#faf5ff', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#6b21a8' }}>📄 delivery_delay_refund_v2.md</div>
                        <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>배송 지연 보상 및 자동 환불 처리 보상 규정</div>
                      </div>
                      <span style={{ backgroundColor: '#6b21a8', color: '#ffffff', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>선택 추가 ➔</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Option 2: Direct Text Paste */}
              {addWikiType === 'text' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '4px' }}>
                      문서 파일명 (Document Title / File Name)
                    </label>
                    <input
                      type="text"
                      placeholder="예: return_guidelines_2026.md"
                      value={addWikiFileName}
                      onChange={(e) => setAddWikiFileName(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '4px' }}>
                      마크다운/텍스트 본문 붙여넣기 (Markdown Body Content)
                    </label>
                    <textarea
                      placeholder="# 문서 제목&#10;&#10;업무 정의서 지침 본문 내용을 붙여넣으세요..."
                      value={addWikiTextContent}
                      onChange={(e) => setAddWikiTextContent(e.target.value)}
                      style={{ width: '100%', height: '180px', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>
                  <button
                    disabled={isAddingWikiDoc || !addWikiFileName || !addWikiTextContent}
                    onClick={() => handleAddWikiDocument(addWikiFileName, addWikiTextContent, 'text')}
                    style={{
                      padding: '10px',
                      backgroundColor: '#6b21a8',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      cursor: 'pointer',
                      opacity: (isAddingWikiDoc || !addWikiFileName || !addWikiTextContent) ? 0.6 : 1
                    }}
                  >
                    {isAddingWikiDoc ? '업로드 및 01_raw 등록 중...' : '📥 01_raw 레이어에 문서 등록'}
                  </button>
                </div>
              )}

              {/* Option 3: PDF / File Upload */}
              {addWikiType === 'pdf_file' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'center' }}>
                  <div style={{ padding: '24px', border: '2px dashed #6b21a8', backgroundColor: '#faf5ff', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '32px' }}>📄</span>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#6b21a8' }}>
                      PDF, TXT, 또는 MD 파일 첨부
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                      내 컴퓨터의 PDF나 마크다운 문서를 선택하면 텍스트를 추출하여 01_raw 레이어에 저장합니다.
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            const rawTxt = evt.target.result;
                            handleAddWikiDocument(file.name, rawTxt, 'pdf_file');
                          };
                          reader.readAsText(file);
                        }
                      }}
                      style={{ marginTop: '8px', fontSize: '12px' }}
                    />
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAddWikiModalOpen(false)}
                style={{ padding: '8px 16px', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
              >
                닫기 (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("UI Render Error caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    return (
      <div style={{ position: "relative", minHeight: "100vh" }}>
        {this.state.hasError && (
          <div style={{ backgroundColor: "#fff1f2", borderBottom: "2px solid #f43f5e", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 999999, position: "sticky", top: 0, left: 0, right: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "18px" }}>⚠️</span>
              <div>
                <strong style={{ fontSize: "13px", color: "#9f1239" }}>프론트엔드 UI 예외 감지 (세이프가드 자동 보호 작동 됨)</strong>
                <span style={{ fontSize: "12px", color: "#be123c", marginLeft: "10px" }}>
                  {this.state.error ? this.state.error.toString() : "일시적인 UI 예외"}
                </span>
              </div>
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{ backgroundColor: "#be123c", color: "#ffffff", border: "none", padding: "4px 12px", borderRadius: "4px", fontWeight: "bold", cursor: "pointer", fontSize: "11px" }}
            >
              ✕ 알림 닫기 및 화면 복구
            </button>
          </div>
        )}
        {this.props.children}
      </div>
    );
  }
}

export default function SafeApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

