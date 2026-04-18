import { motion } from 'motion/react';
import { Check } from 'lucide-react';

type Stage = 'idle' | 'dimension' | 'recon' | 'grouping' | 'evidence' | 'report';

interface StageProgressProps {
  currentStage: Stage;
}

const stages = [
  { id: 'dimension', label: '维度解构', key: 'Classify' },
  { id: 'recon', label: '流式侦察', key: 'Recon' },
  { id: 'grouping', label: '智能归并', key: 'Planning' },
  { id: 'evidence', label: '深度采证', key: 'Evidence' },
];

export function StageProgress({ currentStage }: StageProgressProps) {
  const getCurrentIndex = () => {
    const index = stages.findIndex((s) => s.id === currentStage);
    return index === -1 ? 0 : index;
  };

  const currentIndex = getCurrentIndex();

  return (
    <div className="flex items-center justify-between max-w-4xl mx-auto">
      {stages.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isUpcoming = index > currentIndex;

        return (
          <div key={stage.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              {/* Circle */}
              <motion.div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  isCompleted
                    ? 'bg-green-500 border-green-500'
                    : isCurrent
                    ? 'bg-blue-500 border-blue-500'
                    : 'bg-transparent border-white/20'
                }`}
                initial={false}
                animate={{
                  scale: isCurrent ? [1, 1.1, 1] : 1,
                }}
                transition={{
                  duration: 2,
                  repeat: isCurrent ? Infinity : 0,
                }}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span className={`text-sm font-mono ${isUpcoming ? 'text-gray-500' : ''}`}>
                    {index + 1}
                  </span>
                )}
              </motion.div>

              {/* Label */}
              <div className="mt-2 text-center">
                <div className={`text-sm font-medium ${isCurrent ? 'text-blue-400' : isCompleted ? 'text-green-400' : 'text-gray-500'}`}>
                  {stage.label}
                </div>
                <div className="text-xs text-gray-600 font-mono">{stage.key}</div>
              </div>
            </div>

            {/* Connector Line */}
            {index < stages.length - 1 && (
              <div className="flex-1 h-0.5 bg-white/10 mx-4 relative overflow-hidden">
                {isCompleted && (
                  <motion.div
                    className="absolute inset-0 bg-green-500"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.5 }}
                    style={{ originX: 0 }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
