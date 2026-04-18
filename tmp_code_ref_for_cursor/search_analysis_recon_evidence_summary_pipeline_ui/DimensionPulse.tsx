import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

interface DimensionPulseProps {
  query: string;
}

const dimensions = [
  { id: 1, label: '变现逻辑', color: '#3b82f6' },
  { id: 2, label: '风险评估', color: '#8b5cf6' },
  { id: 3, label: '技术架构', color: '#10b981' },
  { id: 4, label: '用户体验', color: '#f59e0b' },
  { id: 5, label: '数据安全', color: '#ef4444' },
  { id: 6, label: '合规性', color: '#6366f1' },
  { id: 7, label: '扩展性', color: '#14b8a6' },
  { id: 8, label: '性能指标', color: '#a855f7' },
  { id: 9, label: '成本分析', color: '#f97316' },
  { id: 10, label: '竞品对比', color: '#84cc16' },
  { id: 11, label: '市场定位', color: '#ec4899' },
  { id: 12, label: '团队结构', color: '#0ea5e9' },
  { id: 13, label: '迭代策略', color: '#d946ef' },
  { id: 14, label: '用户反馈', color: '#059669' },
  { id: 15, label: '增长路径', color: '#eab308' },
];

export function DimensionPulse({ query }: DimensionPulseProps) {
  const [activeDimensions, setActiveDimensions] = useState<number[]>([]);
  const [showBeams, setShowBeams] = useState(false);

  useEffect(() => {
    // 模拟逐个激活维度
    dimensions.forEach((dim, index) => {
      setTimeout(() => {
        setActiveDimensions((prev) => [...prev, dim.id]);
      }, index * 100);
    });

    // 1.5秒后开始发射光束
    setTimeout(() => setShowBeams(true), 1500);
  }, []);

  const centerX = 50;
  const centerY = 50;
  const radius = 35;

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-10">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="max-w-6xl w-full relative">
        {/* Status Text */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 relative z-10"
        >
          <h2 className="text-2xl font-bold mb-3">粒子扩散 · 原初星云</h2>
          <p className="text-gray-400 font-mono text-sm">
            奇点炸裂，{activeDimensions.length} 颗卫星已就位
          </p>
          <div className="mt-4 px-6 py-3 bg-white/5 rounded-lg border border-white/10 inline-block">
            <span className="text-gray-500">Query:</span>{' '}
            <span className="text-blue-400 font-mono">{query}</span>
          </div>
        </motion.div>

        {/* Star Chart SVG */}
        <div className="relative w-full aspect-square max-w-3xl mx-auto">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Central singularity */}
            <motion.circle
              cx={centerX}
              cy={centerY}
              r="0.5"
              fill="white"
              initial={{ r: 3, opacity: 1 }}
              animate={{ r: 0.5, opacity: 0.8 }}
              transition={{ duration: 1 }}
            />
            <motion.circle
              cx={centerX}
              cy={centerY}
              r="2"
              fill="none"
              stroke="white"
              strokeWidth="0.1"
              initial={{ r: 0, opacity: 1 }}
              animate={{ r: 10, opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity }}
            />

            {/* Dimension satellites */}
            {dimensions.map((dimension, index) => {
              const angle = (index / dimensions.length) * Math.PI * 2 - Math.PI / 2;
              const x = centerX + Math.cos(angle) * radius;
              const y = centerY + Math.sin(angle) * radius;
              const isActive = activeDimensions.includes(dimension.id);

              return (
                <g key={dimension.id}>
                  {/* Connection line to center */}
                  {isActive && (
                    <motion.line
                      x1={centerX}
                      y1={centerY}
                      x2={x}
                      y2={y}
                      stroke={dimension.color}
                      strokeWidth="0.1"
                      opacity="0.3"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                    />
                  )}

                  {/* Satellite */}
                  <motion.circle
                    cx={x}
                    cy={y}
                    r="1.5"
                    fill={dimension.color}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: isActive ? 1 : 0,
                      opacity: isActive ? 1 : 0,
                    }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  />

                  {/* Pulse ring */}
                  {isActive && (
                    <motion.circle
                      cx={x}
                      cy={y}
                      r="1.5"
                      fill="none"
                      stroke={dimension.color}
                      strokeWidth="0.2"
                      initial={{ r: 1.5, opacity: 0.8 }}
                      animate={{ r: 3, opacity: 0 }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        delay: index * 0.1,
                      }}
                    />
                  )}

                  {/* Light beams shooting outward */}
                  {isActive && showBeams && (
                    <>
                      {[0, 1, 2].map((beamIndex) => {
                        const beamAngle = angle + (beamIndex - 1) * 0.3;
                        const beamEndX = x + Math.cos(beamAngle) * 15;
                        const beamEndY = y + Math.sin(beamAngle) * 15;
                        
                        return (
                          <motion.line
                            key={beamIndex}
                            x1={x}
                            y1={y}
                            x2={beamEndX}
                            y2={beamEndY}
                            stroke={dimension.color}
                            strokeWidth="0.05"
                            opacity="0.6"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{
                              pathLength: [0, 1, 1],
                              opacity: [0, 0.6, 0],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              delay: index * 0.1 + beamIndex * 0.3,
                              times: [0, 0.5, 1],
                            }}
                          />
                        );
                      })}
                    </>
                  )}
                </g>
              );
            })}

            {/* Rotating orbit */}
            <motion.circle
              cx={centerX}
              cy={centerY}
              r={radius}
              fill="none"
              stroke="white"
              strokeWidth="0.05"
              opacity="0.1"
              strokeDasharray="2,2"
              initial={{ rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={{
                duration: 60,
                repeat: Infinity,
                ease: 'linear',
              }}
              style={{ transformOrigin: `${centerX}% ${centerY}%` }}
            />
          </svg>

          {/* Dimension labels */}
          <div className="absolute inset-0">
            {dimensions.map((dimension, index) => {
              const angle = (index / dimensions.length) * Math.PI * 2 - Math.PI / 2;
              const labelRadius = radius + 8;
              const x = 50 + Math.cos(angle) * labelRadius;
              const y = 50 + Math.sin(angle) * labelRadius;
              const isActive = activeDimensions.includes(dimension.id);

              return (
                <motion.div
                  key={dimension.id}
                  className="absolute"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{
                    opacity: isActive ? 1 : 0,
                    scale: isActive ? 1 : 0.8,
                  }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <div
                    className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap"
                    style={{
                      backgroundColor: dimension.color + '40',
                      color: dimension.color,
                      border: `1px solid ${dimension.color}80`,
                    }}
                  >
                    {dimension.label}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}