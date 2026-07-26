import React, { useState } from 'react';

export default function AgentEvolutionStudio() {
  const [query, setQuery] = useState("VIP 고객 정소이 상무님의 출고 3일 후 단순 변심 반품 시 선환불 조치 및 관련 BigQuery 테이블은?");
  const [activeStage, setActiveStage] = useState(4);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const stagesData = [
    {
      stage: 1,
      name: 'Stage 1: Base Agent (Vanilla RAG)',
      badge: 'Unstructured / High Risk',
      badgeColor: 'bg-red-100 text-red-700 border-red-200',
      accuracy: '40%',
      tokens: '2,500 token',
      hallucination: 'HIGH (60%)',
      response: '기본 반품 규정에 따라 상품 수거 및 검수가 완료된 후 환불이 진행됩니다. VIP 전용 특혜나 예외 규정은 확인되지 않습니다.',
      citations: []
    },
    {
      stage: 2,
      name: 'Stage 2: + OKF 3-Layer Biz Rules',
      badge: 'OKF Rules Injected',
      badgeColor: 'bg-amber-100 text-amber-700 border-amber-200',
      accuracy: '75%',
      tokens: '800 token (-68%)',
      hallucination: 'MEDIUM (25%)',
      response: 'OKF 지식 파일(03_concepts.md) 참조 결과, VIP 고객 대상 선환불 가이드라인([[FastRefundPolicy]])이 존재합니다. 단, BQ 물리 테이블 연결이 없어 고객 ID 조회가 불가능합니다.',
      citations: ['[[FastRefundPolicy]]', '03_concepts.md']
    },
    {
      stage: 3,
      name: 'Stage 3: + Physical Data Graph (BQ/Spanner)',
      badge: 'Data Graph Bound',
      badgeColor: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      accuracy: '90%',
      tokens: '950 token',
      hallucination: 'LOW (10%)',
      response: 'BigQuery seanjung-poc.theLookCommerce.orders 및 users 테이블 조인 결과, 해당 고객은 VIP 등급입니다. 수거 완료 전 선환불 대상이나 반품 수수료 면제 여부는 확인 필요합니다.',
      citations: ['seanjung-poc.theLookCommerce.orders', 'users', '02_entities.md']
    },
    {
      stage: 4,
      name: 'Stage 4: + Refined Feedback (Perfect Accuracy)',
      badge: 'Feedback Refined & 100% Citation',
      badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      accuracy: '100%',
      tokens: '600 token (-76%)',
      hallucination: 'ZERO (0%)',
      response: '[현업 피드백 반영 완료]: VIP 고객의 3일 이내 반품 건은 수거 완료 전 즉시 100% 선환불 쿠폰이 발급되며, 반품 수수료가 전액 면제됩니다. (출처: changelog.json 피드백 이력 및 BQ Graph 조인)',
      citations: ['changelog.json', 'orders_graph', '03_concepts.md']
    }
  ];

  const handleRunEvaluation = () => {
    setIsEvaluating(true);
    setTimeout(() => {
      setIsEvaluating(false);
    }, 800);
  };

  return (
    <div className="flex flex-col h-full bg-[#FAF8F5] p-6 gap-6 font-sans">
      {/* Top Header & Query Input Console */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-stone-200 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-stone-900 flex items-center gap-2">
              <span>🤖</span> Enterprise Agent Evolution Studio
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              에이전트에서 시작하여 에이전트로 끝나는 4단계 지식/데이터 진화 및 답변 비교 대시보드
            </p>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold rounded-full">
              Tokenomics: -76% Token Saved
            </span>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-full">
              Hallucination: 0% (Exact Citation)
            </span>
          </div>
        </div>

        {/* Universal Query Console */}
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="에이전트에 질의할 비즈니스/데이터 질문을 입력하세요..."
            className="flex-1 px-4 py-3 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
          />
          <button
            onClick={handleRunEvaluation}
            disabled={isEvaluating}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm rounded-lg transition-colors flex items-center gap-2 shadow-sm"
          >
            {isEvaluating ? '진화 추론 중...' : '🚀 4단계 진화 질의 실행'}
          </button>
        </div>
      </div>

      {/* 4-Stage Agent Evolution Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
        {stagesData.map((stage) => (
          <div
            key={stage.stage}
            onClick={() => setActiveStage(stage.stage)}
            className={`cursor-pointer rounded-xl p-5 border transition-all flex flex-col justify-between ${
              activeStage === stage.stage
                ? 'bg-white border-amber-500 shadow-md ring-2 ring-amber-500/20'
                : 'bg-white/80 border-stone-200 hover:border-stone-300 shadow-sm'
            }`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${stage.badgeColor}`}>
                  {stage.badge}
                </span>
                <span className="text-xs font-semibold text-stone-400 font-mono">
                  Stage {stage.stage}
                </span>
              </div>

              <h3 className="text-sm font-bold text-stone-800">
                {stage.name}
              </h3>

              <div className="grid grid-cols-2 gap-2 text-[11px] bg-stone-50 p-2.5 rounded-lg border border-stone-100 font-mono">
                <div>
                  <span className="text-stone-400 block">정확도</span>
                  <span className="font-bold text-stone-700">{stage.accuracy}</span>
                </div>
                <div>
                  <span className="text-stone-400 block font-sans">사용 토큰</span>
                  <span className="font-bold text-amber-600">{stage.tokens}</span>
                </div>
              </div>

              <div className="text-xs text-stone-700 bg-stone-50/50 p-3 rounded-lg border border-stone-100 leading-relaxed font-sans min-h-[100px]">
                {stage.response}
              </div>
            </div>

            {/* Citations */}
            <div className="mt-4 pt-3 border-t border-stone-100 flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold text-stone-400 font-mono">근거 인용 (Citations):</span>
              <div className="flex flex-wrap gap-1">
                {stage.citations.length > 0 ? (
                  stage.citations.map((c, idx) => (
                    <span key={idx} className="text-[10px] px-2 py-0.5 bg-stone-100 text-stone-600 font-mono rounded border border-stone-200">
                      {c}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-stone-400 italic">근거 없음 (Vanilla RAG)</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
