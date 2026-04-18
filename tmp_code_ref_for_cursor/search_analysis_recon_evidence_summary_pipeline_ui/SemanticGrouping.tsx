import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

interface StarPoint {
  id: number;
  path: string;
  x: number;
  y: number;
  groupId: number;
}

interface TaskGroup {
  id: number;
  topicLabel: string;
  groupFocus: string;
  color: string;
  centerX: number;
  centerY: number;
}

const mockGroups: TaskGroup[] = [
  {
    id: 1,
    topicLabel: 'CMS 架构与备份安全',
    groupFocus: '内容管理系统的核心设计与数据保护策略',
    color: '#3b82f6',
    centerX: 25,
    centerY: 30,
  },
  {
    id: 2,
    topicLabel: '认证与支付集成',
    groupFocus: '用户身份验证流程与第三方支付系统对接',
    color: '#8b5cf6',
    centerX: 75,
    centerY: 30,
  },
  {
    id: 3,
    topicLabel: '性能优化与监控',
    groupFocus: '系统性能提升方案与实时监控体系',
    color: '#10b981',
    centerX: 25,
    centerY: 70,
  },
  {
    id: 4,
    topicLabel: '部署与CI/CD',
    groupFocus: '自动化部署流程与持续集成/持续交付',
    color: '#f59e0b',
    centerX: 75,
    centerY: 70,
  },
];

// 生成初始散乱的星点
const generateStarPoints = (): StarPoint[] => {
  const points: StarPoint[] = [];
  let id = 1;

  mockGroups.forEach((group) => {
    // 每个组3-5个星点
    const count = Math.floor(Math.random() * 3) + 3;
    for (let i = 0; i < count; i++) {
      points.push({
        id: id++,
        path: `/file-${id}.ts`,
        x: Math.random() * 90 + 5,
        y: Math.random() * 90 + 5,
        groupId: group.id,
      });
    }
  });

  return points;
};

export function SemanticGrouping() {
  const [stars, setStars] = useState<StarPoint[]>([]);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const [showBubbles, setShowBubbles] = useState(false);

  useEffect(() => {
    // 初始化星点
    setStars(generateStarPoints());

    // 2秒后开始引力塌缩
    setTimeout(() => {
      setIsCollapsing(true);
    }, 2000);

    // 3秒后显示气泡
    setTimeout(() => {
      setShowBubbles(true);
    }, 3500);
  }, []);

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 opacity-5">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="group-grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <circle cx="25" cy="25" r="0.5" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#group-grid)" />
        </svg>
      </div>

      <div className="max-w-6xl w-full relative">
        {/* Status Text */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8 relative z-20"
        >
          <h2 className="text-2xl font-bold mb-2">引力塌缩 · 语义聚合</h2>
          <p className="text-gray-400 font-mono text-sm">
            {isCollapsing
              ? `星点正在向 ${mockGroups.length} 个中心聚合...`
              : '检测星点分布中...'}
          </p>
        </motion.div>

        {/* Main visualization area */}
        <div className="relative w-full aspect-[4/3] max-w-5xl mx-auto">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Gravitational field lines */}
            {isCollapsing &&
              mockGroups.map((group) => (
                <g key={`field-${group.id}`}>
                  {[1, 2, 3].map((ring) => (
                    <motion.circle
                      key={ring}
                      cx={group.centerX}
                      cy={group.centerY}
                      r={ring * 5}
                      fill="none"
                      stroke={group.color}
                      strokeWidth="0.1"
                      opacity="0.2"
                      strokeDasharray="2,2"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 0.2, scale: 1 }}
                      transition={{ duration: 1, delay: ring * 0.2 }}
                    />
                  ))}
                </g>
              ))}

            {/* Star points */}
            {stars.map((star) => {
              const targetGroup = mockGroups.find((g) => g.id === star.groupId);
              if (!targetGroup) return null;

              // 计算聚合后的位置（围绕中心的圆形分布）
              const angle = (star.id / stars.length) * Math.PI * 2;
              const orbitRadius = 8;
              const targetX = targetGroup.centerX + Math.cos(angle) * orbitRadius;
              const targetY = targetGroup.centerY + Math.sin(angle) * orbitRadius;

              return (
                <g key={star.id}>
                  {/* Attraction path */}
                  {isCollapsing && (
                    <motion.line
                      x1={star.x}
                      y1={star.y}
                      x2={targetX}
                      y2={targetY}
                      stroke={targetGroup.color}
                      strokeWidth="0.05"
                      opacity="0.3"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.5, delay: star.id * 0.05 }}
                    />
                  )}

                  {/* Star */}
                  <motion.circle
                    cx={star.x}
                    cy={star.y}
                    r="0.8"
                    fill={targetGroup.color}
                    initial={{ cx: star.x, cy: star.y }}
                    animate={{
                      cx: isCollapsing ? targetX : star.x,
                      cy: isCollapsing ? targetY : star.y,
                    }}
                    transition={{
                      duration: 1.5,
                      delay: star.id * 0.05,
                      type: 'spring',
                      stiffness: 100,
                    }}
                  />

                  {/* Glow trail */}
                  {isCollapsing && (
                    <motion.circle
                      cx={star.x}
                      cy={star.y}
                      r="1.5"
                      fill={targetGroup.color}
                      opacity="0.3"
                      initial={{ cx: star.x, cy: star.y }}
                      animate={{
                        cx: isCollapsing ? targetX : star.x,
                        cy: isCollapsing ? targetY : star.y,
                        opacity: [0.3, 0, 0.3],
                      }}
                      transition={{
                        duration: 1.5,
                        delay: star.id * 0.05,
                      }}
                    />
                  )}
                </g>
              );
            })}

            {/* Group bubbles */}
            {showBubbles &&
              mockGroups.map((group) => {
                const groupStars = stars.filter((s) => s.groupId === group.id);
                const bubbleRadius = 12;

                return (
                  <g key={`bubble-${group.id}`}>
                    {/* Bubble */}
                    <motion.circle
                      cx={group.centerX}
                      cy={group.centerY}
                      r={bubbleRadius}
                      fill={group.color}
                      opacity="0.15"
                      stroke={group.color}
                      strokeWidth="0.3"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 0.15 }}
                      transition={{ duration: 0.8, type: 'spring' }}
                    />

                    {/* Bubble glow */}
                    <motion.circle
                      cx={group.centerX}
                      cy={group.centerY}
                      r={bubbleRadius}
                      fill="none"
                      stroke={group.color}
                      strokeWidth="0.2"
                      opacity="0.5"
                      initial={{ scale: 1, opacity: 0.5 }}
                      animate={{ scale: 1.2, opacity: 0 }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />

                    {/* Center core */}
                    <motion.circle
                      cx={group.centerX}
                      cy={group.centerY}
                      r="1.5"
                      fill={group.color}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.5, delay: 0.3 }}
                    />
                  </g>
                );
              })}
          </svg>

          {/* Bubble labels */}
          {showBubbles && (
            <div className="absolute inset-0">
              {mockGroups.map((group) => (
                <motion.div
                  key={`label-${group.id}`}
                  className="absolute"
                  style={{
                    left: `${group.centerX}%`,
                    top: `${group.centerY}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                >
                  <div className="text-center max-w-xs">
                    {/* Topic label above */}
                    <div
                      className="px-4 py-2 rounded-lg font-bold text-sm mb-2 backdrop-blur-sm"
                      style={{
                        backgroundColor: group.color + '40',
                        color: group.color,
                        border: `1px solid ${group.color}`,
                      }}
                    >
                      {group.topicLabel}
                    </div>

                    {/* Group focus below */}
                    <motion.div
                      className="px-3 py-1 bg-black/60 rounded text-xs text-gray-300 backdrop-blur-sm border border-white/20"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                    >
                      {group.groupFocus}
                    </motion.div>

                    {/* Star count */}
                    <motion.div
                      className="mt-2 text-xs font-mono opacity-60"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.6 }}
                      transition={{ delay: 1.2 }}
                    >
                      {stars.filter((s) => s.groupId === group.id).length} 个文件
                    </motion.div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
