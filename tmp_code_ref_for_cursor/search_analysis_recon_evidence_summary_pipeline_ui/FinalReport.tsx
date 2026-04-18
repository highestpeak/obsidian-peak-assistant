import { motion } from 'motion/react';
import { FileText, Download, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface FinalReportProps {
  onReset: () => void;
}

interface ReportSection {
  id: number;
  topicLabel: string;
  color: string;
  summary: string;
  keyFindings: string[];
  stars: { id: number; path: string; x: number; y: number }[];
}

const reportSections: ReportSection[] = [
  {
    id: 1,
    topicLabel: 'CMS 架构与备份安全',
    color: '#3b82f6',
    summary:
      '系统采用现代化的内容管理架构，以PostgreSQL作为核心数据库，确保ACID特性。备份策略完善，采用自动化每日备份至AWS S3，并启用加密保护。',
    keyFindings: [
      'PostgreSQL 数据库提供强大的ACID合规性',
      '自动化每日备份至 AWS S3',
      '备份数据采用加密存储',
      '用户模型设计规范，支持扩展',
    ],
    stars: [
      { id: 1, path: '/docs/architecture/database-schema.md', x: 20, y: 25 },
      { id: 2, path: '/docs/backup/strategy.md', x: 25, y: 30 },
      { id: 3, path: '/src/models/User.ts', x: 18, y: 35 },
    ],
  },
  {
    id: 2,
    topicLabel: '认证与支付集成',
    color: '#8b5cf6',
    summary:
      '身份验证系统采用JWT令牌机制，使用RS256算法签名确保安全性。支付功能通过Stripe集成，支持订阅制和一次性支付两种模式，满足不同业务需求。',
    keyFindings: [
      'JWT 会话管理，RS256 算法签名',
      'Stripe 支付集成，支持订阅和一次性支付',
      '自定义认证 Hook 简化状态管理',
      'API 速率限制中间件防护',
    ],
    stars: [
      { id: 4, path: '/src/api/auth/login.ts', x: 75, y: 22 },
      { id: 5, path: '/src/services/payment/stripe.ts', x: 80, y: 28 },
      { id: 6, path: '/src/hooks/useAuth.ts', x: 78, y: 34 },
    ],
  },
  {
    id: 3,
    topicLabel: '性能优化与监控',
    color: '#10b981',
    summary:
      '系统性能优化采用Redis缓存层，显著降低数据库负载约70%。监控体系基于AWS CloudWatch，实现对关键指标的实时追踪和自动告警，确保系统稳定运行。',
    keyFindings: [
      'Redis 缓存减少 70% 数据库负载',
      'CloudWatch 实时监控系统健康',
      '性能优化文档详细记录最佳实践',
      '日志系统完善，便于问题排查',
    ],
    stars: [
      { id: 7, path: '/docs/performance/optimization.md', x: 22, y: 70 },
      { id: 8, path: '/src/lib/cache/redis.ts', x: 28, y: 75 },
      { id: 9, path: '/docs/monitoring/logs.md', x: 20, y: 80 },
    ],
  },
  {
    id: 4,
    topicLabel: '部署与CI/CD',
    color: '#f59e0b',
    summary:
      '采用现代化的容器化部署方案，所有服务运行在Docker容器中。CI/CD流程基于GitHub Actions，实现从测试到生产环境的自动化部署，确保部署一致性和效率。',
    keyFindings: [
      'GitHub Actions 自动化部署流程',
      'Docker 容器化保证环境一致性',
      'AWS 基础设施配置规范',
      '环境变量管理安全可靠',
    ],
    stars: [
      { id: 10, path: '/docs/deployment/aws-setup.md', x: 77, y: 68 },
      { id: 11, path: '/docs/ci-cd/pipeline.md', x: 82, y: 74 },
      { id: 12, path: '/src/config/environment.ts', x: 80, y: 80 },
    ],
  },
];

export function FinalReport({ onReset }: FinalReportProps) {
  const [highlightedSection, setHighlightedSection] = useState<number | null>(null);
  const [highlightedFinding, setHighlightedFinding] = useState<{ sectionId: number; findingIndex: number } | null>(null);

  const allStars = reportSections.flatMap((section) => 
    section.stars.map((star) => ({ ...star, sectionId: section.id, color: section.color }))
  );

  return (
    <div className="h-full flex relative overflow-hidden">
      {/* Background star field */}
      <div className="absolute inset-0 opacity-10">
        <svg width="100%" height="100%">
          {allStars.map((star) => {
            const isHighlighted = 
              highlightedSection === star.sectionId || 
              (highlightedFinding && highlightedFinding.sectionId === star.sectionId);

            return (
              <g key={star.id}>
                <motion.circle
                  cx={`${star.x}%`}
                  cy={`${star.y}%`}
                  r="1"
                  fill={star.color}
                  animate={{
                    opacity: isHighlighted ? 0.8 : 0.2,
                    scale: isHighlighted ? 1.5 : 1,
                  }}
                  transition={{ duration: 0.3 }}
                />
                {isHighlighted && (
                  <motion.circle
                    cx={`${star.x}%`}
                    cy={`${star.y}%`}
                    r="3"
                    fill="none"
                    stroke={star.color}
                    strokeWidth="0.5"
                    initial={{ opacity: 0.8, scale: 1 }}
                    animate={{ opacity: 0, scale: 2 }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </g>
            );
          })}

          {/* Constellation connections */}
          {highlightedSection && reportSections.find((s) => s.id === highlightedSection)?.stars.map((star, index, arr) => {
            if (index === 0) return null;
            const prevStar = arr[index - 1];
            const section = reportSections.find((s) => s.id === highlightedSection);
            
            return (
              <motion.line
                key={`${star.id}-line`}
                x1={`${prevStar.x}%`}
                y1={`${prevStar.y}%`}
                x2={`${star.x}%`}
                y2={`${star.y}%`}
                stroke={section?.color}
                strokeWidth="0.5"
                opacity="0.4"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5 }}
              />
            );
          })}
        </svg>
      </div>

      {/* Left: Collapsed Cards */}
      <motion.div
        initial={{ width: '50%' }}
        animate={{ width: '280px' }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
        className="border-r border-white/10 p-6 bg-gradient-to-b from-black/40 to-black/20 backdrop-blur-sm overflow-y-auto relative z-10"
      >
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
            星座拓扑
          </h3>
        </div>
        <div className="space-y-3">
          {reportSections.map((section, index) => (
            <motion.div
              key={section.id}
              initial={{ x: 0, opacity: 1 }}
              animate={{
                x: 0,
                opacity: highlightedSection === section.id ? 1 : 0.5,
              }}
              transition={{ delay: index * 0.1 }}
              onHoverStart={() => setHighlightedSection(section.id)}
              onHoverEnd={() => setHighlightedSection(null)}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                highlightedSection === section.id
                  ? 'border-white/40 bg-white/10 shadow-lg'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full animate-pulse"
                  style={{ backgroundColor: section.color }}
                />
                <span className="text-xs text-gray-400">{section.stars.length} 星点</span>
              </div>
              <div className="text-sm font-medium">{section.topicLabel}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Right: Report */}
      <motion.div
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="flex-1 overflow-y-auto relative z-10"
      >
        <div className="max-w-4xl mx-auto p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <motion.div 
                  className="p-3 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500"
                  animate={{
                    boxShadow: [
                      '0 0 20px rgba(59, 130, 246, 0.5)',
                      '0 0 40px rgba(139, 92, 246, 0.5)',
                      '0 0 20px rgba(59, 130, 246, 0.5)',
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <FileText className="w-6 h-6" />
                </motion.div>
                <div>
                  <h1 className="text-3xl font-bold">全息蓝图 · 分析报告</h1>
                  <p className="text-sm text-gray-400">
                    生成时间: {new Date().toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onReset}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  新建搜索
                </button>
                <button className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  导出报告
                </button>
              </div>
            </div>

            <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg backdrop-blur-sm">
              <h2 className="font-bold mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                执行摘要
              </h2>
              <p className="text-sm text-gray-300 leading-relaxed">
                本次分析共识别出 <span className="text-blue-400 font-semibold">{reportSections.length}</span> 个核心主题星座，
                涵盖 <span className="text-purple-400 font-semibold">{allStars.length}</span> 个知识星点。
                通过深度采证和拓扑重构，为系统评估提供了全面的数据支撑。
              </p>
            </div>
          </div>

          {/* Report Sections */}
          <div className="space-y-8">
            {reportSections.map((section, index) => (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: highlightedSection === section.id ? 1.02 : 1,
                }}
                transition={{ delay: index * 0.15 }}
                onMouseEnter={() => setHighlightedSection(section.id)}
                onMouseLeave={() => setHighlightedSection(null)}
                className={`p-6 rounded-xl border-2 transition-all backdrop-blur-sm ${
                  highlightedSection === section.id
                    ? 'border-white/30 bg-white/10 shadow-2xl'
                    : 'border-white/10 bg-white/5'
                }`}
                style={{
                  boxShadow: highlightedSection === section.id 
                    ? `0 0 30px ${section.color}40`
                    : 'none',
                }}
              >
                <div className="flex items-start gap-4 mb-4">
                  <motion.div 
                    className="w-8 h-8 rounded-lg flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${section.color}, ${section.color}CC)`,
                    }}
                    animate={{
                      boxShadow: highlightedSection === section.id
                        ? [`0 0 10px ${section.color}`, `0 0 20px ${section.color}`, `0 0 10px ${section.color}`]
                        : `0 0 5px ${section.color}40`,
                    }}
                    transition={{ duration: 2, repeat: highlightedSection === section.id ? Infinity : 0 }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="text-xl font-bold">{section.topicLabel}</h2>
                      <span className="text-xs text-gray-500 font-mono">
                        ({section.stars.length} 星点)
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{section.summary}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <div className="w-1 h-4 rounded" style={{ backgroundColor: section.color }} />
                    关键发现
                  </h3>
                  <ul className="space-y-2">
                    {section.keyFindings.map((finding, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.15 + i * 0.05 }}
                        onMouseEnter={() => setHighlightedFinding({ sectionId: section.id, findingIndex: i })}
                        onMouseLeave={() => setHighlightedFinding(null)}
                        className="flex items-start gap-3 p-2 rounded cursor-pointer transition-colors hover:bg-white/5"
                      >
                        <div 
                          className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                          style={{ backgroundColor: section.color }}
                        />
                        <span className="text-sm text-gray-300">{finding}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>

                {/* Star paths when highlighted */}
                {highlightedSection === section.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 pt-4 border-t border-white/10"
                  >
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                      知识星点轨迹
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {section.stars.map((star) => (
                        <div
                          key={star.id}
                          className="px-2 py-1 rounded text-xs font-mono border"
                          style={{
                            backgroundColor: section.color + '20',
                            borderColor: section.color + '40',
                            color: section.color,
                          }}
                        >
                          {star.path.split('/').pop()}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-white/10 text-center text-sm text-gray-500">
            <p>报告由任务指挥中心自动生成 · 动态星图拓扑重构系统</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}