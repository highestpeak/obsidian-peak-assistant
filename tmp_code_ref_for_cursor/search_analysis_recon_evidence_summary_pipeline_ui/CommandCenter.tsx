import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StageProgress } from './StageProgress';
import { DimensionPulse } from './DimensionPulse';
import { ReconStream } from './ReconStream';
import { SemanticGrouping } from './SemanticGrouping';
import { EvidenceMining } from './EvidenceMining';
import { FinalReport } from './FinalReport';
import { Search } from 'lucide-react';

type Stage = 'idle' | 'dimension' | 'recon' | 'grouping' | 'evidence' | 'report';

export function CommandCenter() {
  const [stage, setStage] = useState<Stage>('idle');
  const [query, setQuery] = useState('');

  const handleStart = () => {
    if (query.trim()) {
      setStage('dimension');
      // 自动推进演示流程
      setTimeout(() => setStage('recon'), 3000);
      setTimeout(() => setStage('grouping'), 7000);
      setTimeout(() => setStage('evidence'), 11000);
      setTimeout(() => setStage('report'), 18000);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-8 py-6 border-b border-white/10">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          任务指挥中心
        </h1>
        <p className="text-sm text-gray-400 mt-1">智能搜索与证据采集系统</p>
      </header>

      {/* Progress Bar */}
      {stage !== 'idle' && (
        <div className="px-8 py-4 border-b border-white/10">
          <StageProgress currentStage={stage} />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {stage === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex items-center justify-center"
            >
              <div className="max-w-2xl w-full px-8">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 mb-6">
                    <Search className="w-10 h-10 text-blue-400" />
                  </div>
                  <h2 className="text-3xl font-bold mb-3">开始你的智能搜索</h2>
                  <p className="text-gray-400">
                    输入你的问题，系统将自动进行维度解构、线索侦察、语义归并和深度采证
                  </p>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleStart()}
                    placeholder="请输入你的问题..."
                    className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500/50 transition-colors font-mono text-lg"
                  />
                  <button
                    onClick={handleStart}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-md hover:opacity-90 transition-opacity"
                  >
                    开始分析
                  </button>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
                  <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-blue-400 font-semibold mb-1">15+ 维度</div>
                    <div className="text-gray-400">智能维度解构</div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-purple-400 font-semibold mb-1">语义聚类</div>
                    <div className="text-gray-400">自动归并关联</div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-green-400 font-semibold mb-1">流式侦察</div>
                    <div className="text-gray-400">全库快速扫描</div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-orange-400 font-semibold mb-1">深度采证</div>
                    <div className="text-gray-400">精准证据提取</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {stage === 'dimension' && (
            <motion.div
              key="dimension"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <DimensionPulse query={query} />
            </motion.div>
          )}

          {stage === 'recon' && (
            <motion.div
              key="recon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <ReconStream />
            </motion.div>
          )}

          {stage === 'grouping' && (
            <motion.div
              key="grouping"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <SemanticGrouping />
            </motion.div>
          )}

          {stage === 'evidence' && (
            <motion.div
              key="evidence"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <EvidenceMining />
            </motion.div>
          )}

          {stage === 'report' && (
            <motion.div
              key="report"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <FinalReport onReset={() => { setStage('idle'); setQuery(''); }} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
