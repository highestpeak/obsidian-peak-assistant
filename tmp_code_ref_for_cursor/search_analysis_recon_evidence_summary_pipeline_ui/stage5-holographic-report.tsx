import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

interface HolographicReportProps {
  onLog: (message: string) => void;
}

type Phase = 'blueprint' | 'mermaid' | 'blocks' | 'summary' | 'complete';

export function HolographicReport({ onLog }: HolographicReportProps) {
  const [phase, setPhase] = useState<Phase>('blueprint');
  const [blockProgress, setBlockProgress] = useState<number[]>([]);

  useEffect(() => {
    onLog('启动 SCQA 逻辑引擎...');
    setTimeout(() => onLog('正在对齐 15 个维度的采证结果...'), 500);
    setTimeout(() => {
      onLog('报告蓝图已生成：包含 1 个全局摘要，1 幅实体关系图，4 个深度洞察模块');
      setPhase('blueprint');
    }, 1500);

    setTimeout(() => {
      onLog('正在绘制全局思维导图...');
      setPhase('mermaid');
    }, 3000);

    setTimeout(() => {
      onLog('发现 2 处逻辑盲点，已在图谱中标红提示');
    }, 4000);

    setTimeout(() => {
      onLog('开始并行流式灌注洞察模块...');
      setPhase('blocks');
    }, 5500);

    // Progressive block filling
    [0, 1, 2, 3].forEach((i) => {
      setTimeout(() => {
        setBlockProgress((prev) => [...prev, i]);
        onLog(`洞察模块 ${i + 1} 生成完成`);
      }, 6000 + i * 800);
    });

    setTimeout(() => {
      onLog('所有模块完成，开始提炼执行摘要...');
      setPhase('summary');
    }, 9500);

    setTimeout(() => {
      onLog('报告生成完成！发现 1 个意外洞察 ⚡');
      setPhase('complete');
    }, 11000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="w-full h-full overflow-y-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="space-y-6">
        {/* Executive Summary Skeleton */}
        <motion.div
          className={`rounded-2xl p-6 relative overflow-hidden ${ 
            phase === 'blueprint' || phase === 'mermaid' || phase === 'blocks'
              ? 'border-2 border-dashed border-violet-200 bg-white'
              : 'bg-white border border-gray-200 shadow-sm'
          }`}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Scanning line effect */}
          {phase === 'blueprint' && (
            <motion.div
              className="absolute left-0 right-0 h-0.5 bg-violet-400/40"
              initial={{ top: 0 }}
              animate={{ top: '100%' }}
              transition={{ duration: 2, ease: 'linear' }}
            />
          )}

          {phase === 'blueprint' || phase === 'mermaid' || phase === 'blocks' ? (
            <div className="space-y-3">
              <div className="h-6 w-3/4 bg-gray-100 rounded" />
              <div className="h-4 w-full bg-gray-50 rounded" />
              <div className="h-4 w-5/6 bg-gray-50 rounded" />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-6 bg-violet-500 rounded" />
                <h2 className="text-xl font-semibold text-gray-900">
                  Executive Summary
                </h2>
              </div>
              <motion.p
                className="text-gray-700 leading-relaxed text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                基于多维度证据分析，我们发现客户满意度与运营效率存在强关联性。
                通过优化核心流程，预计可提升整体绩效 40%，并显著改善市场竞争力。
                建议立即启动三大优化举措，预期 6 个月内见效。
              </motion.p>
            </motion.div>
          )}
        </motion.div>

        {/* Mermaid Graph Skeleton */}
        <motion.div
          className={`rounded-2xl p-6 relative overflow-hidden ${
            phase === 'blueprint'
              ? 'border-2 border-dashed border-violet-200 bg-white'
              : phase === 'mermaid'
              ? 'border-2 border-dashed border-violet-300 bg-white'
              : 'bg-white border border-gray-200 shadow-sm'
          }`}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {phase === 'blueprint' && (
            <div className="h-48 flex items-center justify-center">
              <div className="text-gray-400 text-sm">关系图谱预留区</div>
            </div>
          )}

          {phase === 'mermaid' && (
            <MermaidAnimation onComplete={() => {}} />
          )}

          {(phase === 'blocks' || phase === 'summary' || phase === 'complete') && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 bg-violet-500 rounded" />
                <h3 className="text-lg font-semibold text-gray-900">Knowledge Graph</h3>
              </div>
              <MermaidGraphComplete />
            </div>
          )}
        </motion.div>

        {/* Dashboard Blocks */}
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((index) => (
            <motion.div
              key={index}
              className={`rounded-2xl p-5 relative overflow-hidden ${
                phase === 'blueprint' || phase === 'mermaid'
                  ? 'border-2 border-dashed border-violet-200 bg-white'
                  : blockProgress.includes(index)
                  ? 'bg-white border border-gray-200 shadow-sm'
                  : 'border-2 border-dashed border-violet-300 bg-white'
              }`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + index * 0.1 }}
            >
              {/* Streaming glow effect */}
              {phase === 'blocks' && !blockProgress.includes(index) && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400/50"
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}

              {(phase === 'blueprint' || phase === 'mermaid') && (
                <div className="space-y-2">
                  <div className="h-5 w-2/3 bg-gray-100 rounded" />
                  <div className="h-3 w-full bg-gray-50 rounded" />
                  <div className="h-3 w-4/5 bg-gray-50 rounded" />
                </div>
              )}

              {phase === 'blocks' && !blockProgress.includes(index) && (
                <div className="space-y-2">
                  <div className="h-5 w-2/3 bg-gray-100 rounded animate-pulse" />
                  <div className="h-3 w-full bg-gray-50 rounded animate-pulse" />
                </div>
              )}

              {blockProgress.includes(index) && (
                <InsightBlock index={index} />
              )}
            </motion.div>
          ))}
        </div>

        {/* Surprise insight badge */}
        {phase === 'complete' && (
          <motion.div
            className="fixed bottom-8 right-8 bg-violet-600 rounded-full px-5 py-3 shadow-lg shadow-violet-200 flex items-center gap-2"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', duration: 0.8 }}
          >
            <Sparkles className="w-5 h-5 text-white" />
            <span className="text-sm font-medium text-white">Insight Badge</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function MermaidAnimation({ onComplete }: { onComplete: () => void }) {
  const nodes = [
    { id: 1, x: 200, y: 80, label: '客户洞察' },
    { id: 2, x: 400, y: 80, label: '市场趋势' },
    { id: 3, x: 300, y: 180, label: '运营优化' },
  ];

  const [visibleNodes, setVisibleNodes] = useState(0);
  const [visibleEdges, setVisibleEdges] = useState(0);

  useEffect(() => {
    const nodeTimer = setInterval(() => {
      setVisibleNodes((prev) => {
        if (prev >= nodes.length) {
          clearInterval(nodeTimer);
          return prev;
        }
        return prev + 1;
      });
    }, 500);

    setTimeout(() => {
      const edgeTimer = setInterval(() => {
        setVisibleEdges((prev) => {
          if (prev >= 3) {
            clearInterval(edgeTimer);
            onComplete();
            return prev;
          }
          return prev + 1;
        });
      }, 400);
    }, nodes.length * 500);

    return () => clearInterval(nodeTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <svg className="w-full h-48" viewBox="0 0 600 200">
      {/* Edges */}
      {visibleEdges > 0 && (
        <motion.line
          x1="200"
          y1="80"
          x2="400"
          y2="80"
          stroke="#7C3AED"
          strokeWidth="1.5"
          opacity="0.3"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
        />
      )}
      {visibleEdges > 1 && (
        <motion.line
          x1="200"
          y1="80"
          x2="300"
          y2="180"
          stroke="#7C3AED"
          strokeWidth="1.5"
          opacity="0.3"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
        />
      )}
      {visibleEdges > 2 && (
        <motion.line
          x1="400"
          y1="80"
          x2="300"
          y2="180"
          stroke="#7C3AED"
          strokeWidth="1.5"
          opacity="0.3"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
        />
      )}

      {/* Nodes */}
      {nodes.slice(0, visibleNodes).map((node) => (
        <motion.g key={node.id}>
          <motion.circle
            cx={node.x}
            cy={node.y}
            r="30"
            fill="white"
            stroke="#7C3AED"
            strokeWidth="2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring' }}
          />
          <motion.text
            x={node.x}
            y={node.y + 4}
            fill="#374151"
            fontSize="12"
            textAnchor="middle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {node.label}
          </motion.text>
        </motion.g>
      ))}
    </svg>
  );
}

function MermaidGraphComplete() {
  return (
    <svg className="w-full h-48" viewBox="0 0 600 200">
      <line x1="200" y1="80" x2="400" y2="80" stroke="#7C3AED" strokeWidth="1.5" opacity="0.3" />
      <line x1="200" y1="80" x2="300" y2="180" stroke="#7C3AED" strokeWidth="1.5" opacity="0.3" />
      <line x1="400" y1="80" x2="300" y2="180" stroke="#7C3AED" strokeWidth="1.5" opacity="0.3" />
      
      <g>
        <circle cx="200" cy="80" r="30" fill="white" stroke="#7C3AED" strokeWidth="2" />
        <text x="200" y="84" fill="#374151" fontSize="12" textAnchor="middle">
          客户洞察
        </text>
      </g>
      <g>
        <circle cx="400" cy="80" r="30" fill="white" stroke="#8B5CF6" strokeWidth="2" />
        <text x="400" y="84" fill="#374151" fontSize="12" textAnchor="middle">
          市场趋势
        </text>
      </g>
      <g>
        <circle cx="300" cy="180" r="30" fill="white" stroke="#EF4444" strokeWidth="2" />
        <text x="300" y="184" fill="#374151" fontSize="12" textAnchor="middle">
          运营优化
        </text>
        <circle cx="285" cy="165" r="3" fill="#EF4444" opacity="0.8" />
      </g>
    </svg>
  );
}

function InsightBlock({ index }: { index: number }) {
  const insights = [
    {
      title: '客户留存率下降',
      why: '竞品推出更优惠的订阅计划',
      evidence: '40%',
      ref: 'ref_1',
    },
    {
      title: '市场份额增长机会',
      why: '新兴市场需求激增',
      evidence: '2.3x',
      ref: 'ref_2',
    },
    {
      title: '运营成本可优化',
      why: '自动化程度仍然较低',
      evidence: '25%',
      ref: 'ref_3',
    },
    {
      title: '产品创新需求',
      why: '用户期待AI功能集成',
      evidence: '78%',
      ref: 'ref_4',
    },
  ];

  const insight = insights[index];

  return (
    <motion.div
      className="space-y-3"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h4 className="font-semibold text-gray-900 text-sm">{insight.title}</h4>
      <div className="space-y-2">
        <motion.p
          className="text-xs text-gray-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-violet-600 font-medium">Why it matters:</span> {insight.why}
        </motion.p>
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <span className="text-2xl font-bold text-violet-600 px-3 py-1 bg-violet-50 rounded-lg">
            {insight.evidence}
          </span>
          <span className="text-xs text-gray-400">[{insight.ref}]</span>
        </motion.div>
      </div>
    </motion.div>
  );
}