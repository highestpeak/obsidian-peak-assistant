import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';

interface TaskGroup {
  id: number;
  topicLabel: string;
  groupFocus: string;
  color: string;
  stars: StarPoint[];
  facts: Fact[];
}

interface StarPoint {
  id: number;
  path: string;
  isProcessed: boolean;
}

interface Fact {
  id: number;
  text: string;
  quote: string;
  starId: number;
}

const mockGroups: TaskGroup[] = [
  {
    id: 1,
    topicLabel: 'CMS 架构与备份安全',
    groupFocus: '内容管理系统的核心设计与数据保护策略',
    color: '#3b82f6',
    stars: [
      { id: 1, path: '/docs/architecture/database-schema.md', isProcessed: false },
      { id: 2, path: '/docs/backup/strategy.md', isProcessed: false },
      { id: 3, path: '/src/models/User.ts', isProcessed: false },
    ],
    facts: [
      { id: 1, text: '采用 PostgreSQL 作为主数据库', quote: 'PostgreSQL for ACID compliance...', starId: 1 },
      { id: 2, text: '每日自动备份至 S3', quote: 'Daily backups to AWS S3...', starId: 2 },
    ],
  },
  {
    id: 2,
    topicLabel: '认证与支付集成',
    groupFocus: '用户身份验证流程与第三方支付系统对接',
    color: '#8b5cf6',
    stars: [
      { id: 4, path: '/src/api/auth/login.ts', isProcessed: false },
      { id: 5, path: '/src/services/payment/stripe.ts', isProcessed: false },
      { id: 6, path: '/src/hooks/useAuth.ts', isProcessed: false },
    ],
    facts: [
      { id: 3, text: '使用 JWT 进行会话管理', quote: 'JWT tokens with RS256...', starId: 4 },
      { id: 4, text: 'Stripe 支持订阅和一次性支付', quote: 'Subscription and one-time via Stripe...', starId: 5 },
    ],
  },
  {
    id: 3,
    topicLabel: '性能优化与监控',
    groupFocus: '系统性能提升方案与实时监控体系',
    color: '#10b981',
    stars: [
      { id: 7, path: '/docs/performance/optimization.md', isProcessed: false },
      { id: 8, path: '/src/lib/cache/redis.ts', isProcessed: false },
      { id: 9, path: '/docs/monitoring/logs.md', isProcessed: false },
    ],
    facts: [
      { id: 5, text: 'Redis 缓存减少 70% 负载', quote: 'Redis reduces load by 70%...', starId: 8 },
      { id: 6, text: 'CloudWatch 实时监控', quote: 'CloudWatch monitors metrics...', starId: 9 },
    ],
  },
  {
    id: 4,
    topicLabel: '部署与CI/CD',
    groupFocus: '自动化部署流程与持续集成/持续交付',
    color: '#f59e0b',
    stars: [
      { id: 10, path: '/docs/deployment/aws-setup.md', isProcessed: false },
      { id: 11, path: '/docs/ci-cd/pipeline.md', isProcessed: false },
      { id: 12, path: '/src/config/environment.ts', isProcessed: false },
    ],
    facts: [
      { id: 7, text: 'GitHub Actions 自动部署', quote: 'CI/CD pipeline via Actions...', starId: 11 },
      { id: 8, text: 'Docker 容器化部署', quote: 'All services in Docker...', starId: 10 },
    ],
  },
];

export function EvidenceMining() {
  const [groups, setGroups] = useState<TaskGroup[]>(mockGroups);
  const [activeGroupId, setActiveGroupId] = useState<number>(1);
  const [extractedFacts, setExtractedFacts] = useState<Fact[]>([]);
  const [processingStarId, setProcessingStarId] = useState<number | null>(null);

  useEffect(() => {
    let currentGroupIndex = 0;
    let currentStarIndex = 0;

    const processNextStar = () => {
      if (currentGroupIndex >= mockGroups.length) return;

      const group = mockGroups[currentGroupIndex];
      setActiveGroupId(group.id);

      if (currentStarIndex < group.stars.length) {
        const star = group.stars[currentStarIndex];
        setProcessingStarId(star.id);

        // 标记为已处理
        setTimeout(() => {
          setGroups((prev) =>
            prev.map((g) =>
              g.id === group.id
                ? {
                    ...g,
                    stars: g.stars.map((s) =>
                      s.id === star.id ? { ...s, isProcessed: true } : s
                    ),
                  }
                : g
            )
          );

          // 提取该星点的facts
          const starFacts = group.facts.filter((f) => f.starId === star.id);
          starFacts.forEach((fact, i) => {
            setTimeout(() => {
              setExtractedFacts((prev) => [...prev, fact]);
            }, i * 300);
          });

          setProcessingStarId(null);
          currentStarIndex++;
          setTimeout(processNextStar, 1200);
        }, 800);
      } else {
        // 移到下一个组
        currentGroupIndex++;
        currentStarIndex = 0;
        setTimeout(processNextStar, 800);
      }
    };

    processNextStar();
  }, []);

  const activeGroup = groups.find((g) => g.id === activeGroupId);

  return (
    <div className="h-full flex gap-6 p-8 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 opacity-5">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="evidence-grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <circle cx="30" cy="30" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#evidence-grid)" />
        </svg>
      </div>

      {/* Left: Bubble Groups */}
      <div className="w-1/2 relative">
        <div className="mb-4 relative z-10">
          <h2 className="text-xl font-bold mb-1">能量汲取 · 深度采证</h2>
          <p className="text-sm text-gray-400">正在从气泡中提取证据...</p>
        </div>

        <div className="relative w-full h-[600px]">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {groups.map((group, index) => {
              const positions = [
                { x: 30, y: 25 },
                { x: 70, y: 25 },
                { x: 30, y: 65 },
                { x: 70, y: 65 },
              ];
              const pos = positions[index];
              const isActive = group.id === activeGroupId;
              const radius = isActive ? 18 : 12;

              return (
                <g key={group.id}>
                  {/* Bubble */}
                  <motion.circle
                    cx={pos.x}
                    cy={pos.y}
                    r={radius}
                    fill={group.color}
                    opacity={isActive ? 0.25 : 0.1}
                    stroke={group.color}
                    strokeWidth={isActive ? '0.5' : '0.2'}
                    animate={{
                      r: radius,
                      opacity: isActive ? [0.25, 0.3, 0.25] : 0.1,
                    }}
                    transition={{
                      duration: 2,
                      repeat: isActive ? Infinity : 0,
                    }}
                  />

                  {/* Energy pulse when active */}
                  {isActive && (
                    <motion.circle
                      cx={pos.x}
                      cy={pos.y}
                      r={radius}
                      fill="none"
                      stroke={group.color}
                      strokeWidth="0.3"
                      initial={{ r: radius, opacity: 0.8 }}
                      animate={{ r: radius + 5, opacity: 0 }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  )}

                  {/* Stars inside bubble */}
                  {group.stars.map((star, starIndex) => {
                    const angle = (starIndex / group.stars.length) * Math.PI * 2;
                    const orbitR = radius * 0.5;
                    const starX = pos.x + Math.cos(angle) * orbitR;
                    const starY = pos.y + Math.sin(angle) * orbitR;
                    const isProcessing = processingStarId === star.id;

                    return (
                      <g key={star.id}>
                        <motion.circle
                          cx={starX}
                          cy={starY}
                          r="1"
                          fill={star.isProcessed ? '#10b981' : group.color}
                          animate={{
                            scale: isProcessing ? [1, 1.5, 1] : 1,
                          }}
                          transition={{
                            duration: 0.5,
                            repeat: isProcessing ? Infinity : 0,
                          }}
                        />

                        {/* Processing glow */}
                        {isProcessing && (
                          <motion.circle
                            cx={starX}
                            cy={starY}
                            r="1"
                            fill={group.color}
                            initial={{ r: 1, opacity: 0.8 }}
                            animate={{ r: 3, opacity: 0 }}
                            transition={{ duration: 1, repeat: Infinity }}
                          />
                        )}

                        {/* Connection line to evidence panel */}
                        {star.isProcessed && group.facts.some((f) => f.starId === star.id) && (
                          <motion.line
                            x1={starX}
                            y1={starY}
                            x2="95"
                            y2="50"
                            stroke={group.color}
                            strokeWidth="0.1"
                            opacity="0.4"
                            strokeDasharray="2,2"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.8 }}
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* Center label */}
                  <text
                    x={pos.x}
                    y={pos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="2"
                    fill="white"
                    opacity={isActive ? 0.8 : 0.4}
                    fontWeight="bold"
                  >
                    {group.id}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Group labels */}
          <div className="absolute inset-0 pointer-events-none">
            {groups.map((group, index) => {
              const positions = [
                { x: 30, y: 25 },
                { x: 70, y: 25 },
                { x: 30, y: 65 },
                { x: 70, y: 65 },
              ];
              const pos = positions[index];
              const isActive = group.id === activeGroupId;

              return (
                <div
                  key={`label-${group.id}`}
                  className="absolute"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y - 25}%`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  <motion.div
                    className="text-xs font-bold text-center px-2 py-1 rounded backdrop-blur-sm"
                    style={{
                      backgroundColor: group.color + (isActive ? '60' : '30'),
                      color: isActive ? 'white' : group.color,
                      border: `1px solid ${group.color}`,
                    }}
                    animate={{
                      scale: isActive ? 1.05 : 1,
                    }}
                  >
                    {group.topicLabel}
                  </motion.div>

                  {isActive && (
                    <motion.div
                      className="mt-2 text-xs text-center text-gray-400 max-w-xs"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      {group.groupFocus}
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Processing indicator */}
          {activeGroup && processingStarId && (
            <motion.div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 rounded-lg border border-blue-500/50 backdrop-blur-sm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400 animate-pulse" />
                <span className="text-xs font-mono text-gray-300">
                  Reading [
                  {activeGroup.stars.find((s) => s.id === processingStarId)?.path}
                  ]...
                </span>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Right: Evidence Library */}
      <div className="w-1/2 flex flex-col relative z-10">
        <div className="mb-4">
          <h3 className="text-xl font-bold mb-1">证据库</h3>
          <p className="text-sm text-gray-400">
            已提取 <span className="text-green-400">{extractedFacts.length}</span> 条证据
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          <AnimatePresence>
            {extractedFacts.map((fact) => {
              const group = groups.find((g) => g.facts.some((f) => f.id === fact.id));

              return (
                <motion.div
                  key={fact.id}
                  initial={{ opacity: 0, x: 20, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative"
                >
                  {/* Charge particle effect */}
                  <motion.div
                    className="absolute -left-2 top-1/2 w-1 h-1 rounded-full"
                    style={{ backgroundColor: group?.color }}
                    initial={{ x: -100, opacity: 1 }}
                    animate={{ x: 0, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  />

                  <div
                    className="p-4 rounded-lg border backdrop-blur-sm"
                    style={{
                      backgroundColor: (group?.color || '#fff') + '20',
                      borderColor: (group?.color || '#fff') + '40',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-2 h-2 rounded-full mt-2 flex-shrink-0 animate-pulse"
                        style={{ backgroundColor: group?.color }}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-2">{fact.text}</p>
                        <div className="text-xs text-gray-400 italic border-l-2 pl-2 mt-2"
                          style={{ borderColor: group?.color }}
                        >
                          "{fact.quote}"
                        </div>
                        <div className="text-xs text-gray-500 font-mono mt-2">
                          来源: {group?.stars.find((s) => s.id === fact.starId)?.path}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
