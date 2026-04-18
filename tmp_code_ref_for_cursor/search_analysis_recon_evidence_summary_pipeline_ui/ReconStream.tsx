import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Radar, FileText } from 'lucide-react';

interface Lead {
  id: number;
  path: string;
  summary: string;
  x: number;
  y: number;
}

const mockLeads: Omit<Lead, 'x' | 'y'>[] = [
  { id: 1, path: '/docs/architecture/database-schema.md', summary: '数据库设计模式与安全最佳实践' },
  { id: 2, path: '/src/api/auth/login.ts', summary: '身份验证流程与JWT令牌管理' },
  { id: 3, path: '/docs/security/encryption.md', summary: '端到端加密实现细节' },
  { id: 4, path: '/config/server.yaml', summary: '服务器配置与环境变量' },
  { id: 5, path: '/docs/deployment/aws-setup.md', summary: 'AWS基础设施部署指南' },
  { id: 6, path: '/src/utils/validation.ts', summary: '输入验证与数据清洗规则' },
  { id: 7, path: '/docs/api/rest-endpoints.md', summary: 'RESTful API端点文档' },
  { id: 8, path: '/src/services/payment/stripe.ts', summary: 'Stripe支付集成方案' },
  { id: 9, path: '/docs/analytics/tracking.md', summary: '用户行为分析与追踪' },
  { id: 10, path: '/src/components/Dashboard.tsx', summary: '管理后台核心组件' },
  { id: 11, path: '/docs/testing/e2e-tests.md', summary: '端到端测试策略' },
  { id: 12, path: '/src/hooks/useAuth.ts', summary: '认证状态管理Hook' },
  { id: 13, path: '/docs/performance/optimization.md', summary: '性能优化实践指南' },
  { id: 14, path: '/src/lib/cache/redis.ts', summary: 'Redis缓存层实现' },
  { id: 15, path: '/docs/monitoring/logs.md', summary: '日志系统与监控设置' },
  { id: 16, path: '/src/middleware/ratelimit.ts', summary: 'API速率限制中间件' },
  { id: 17, path: '/docs/backup/strategy.md', summary: '数据备份与恢复策略' },
  { id: 18, path: '/src/models/User.ts', summary: '用户数据模型定义' },
  { id: 19, path: '/docs/compliance/gdpr.md', summary: 'GDPR合规性要求' },
  { id: 20, path: '/src/scripts/migration.ts', summary: '数据迁移脚本' },
  { id: 21, path: '/docs/websocket/realtime.md', summary: '实时通信WebSocket设计' },
  { id: 22, path: '/src/queue/jobs.ts', summary: '后台任务队列管理' },
  { id: 23, path: '/docs/search/elasticsearch.md', summary: '全文搜索引擎配置' },
  { id: 24, path: '/src/email/templates.ts', summary: '邮件模板系统' },
  { id: 25, path: '/docs/mobile/react-native.md', summary: '移动端架构说明' },
  { id: 26, path: '/src/graphql/schema.ts', summary: 'GraphQL Schema定义' },
  { id: 27, path: '/docs/ci-cd/pipeline.md', summary: 'CI/CD流水线配置' },
  { id: 28, path: '/src/storage/s3.ts', summary: '对象存储服务集成' },
  { id: 29, path: '/docs/api/graphql-queries.md', summary: 'GraphQL查询示例' },
  { id: 30, path: '/src/workers/background.ts', summary: '后台工作进程' },
  { id: 31, path: '/docs/notifications/push.md', summary: '推送通知系统' },
  { id: 32, path: '/src/config/environment.ts', summary: '环境配置管理' },
  { id: 33, path: '/docs/seo/optimization.md', summary: 'SEO优化策略' },
  { id: 34, path: '/src/types/global.d.ts', summary: '全局TypeScript类型定义' },
  { id: 35, path: '/docs/localization/i18n.md', summary: '国际化与本地化' },
  { id: 36, path: '/src/analytics/events.ts', summary: '事件追踪系统' },
  { id: 37, path: '/docs/architecture/microservices.md', summary: '微服务架构设计' },
  { id: 38, path: '/src/tests/unit/auth.test.ts', summary: '认证单元测试' },
  { id: 39, path: '/docs/security/penetration-test.md', summary: '渗透测试报告' },
  { id: 40, path: '/src/utils/encryption.ts', summary: '加密工具函数库' },
  { id: 41, path: '/docs/changelog/v2.0.md', summary: '版本2.0更新日志' },
  { id: 42, path: '/src/constants/errors.ts', summary: '错误码常量定义' },
];

export function ReconStream() {
  const [visibleStars, setVisibleStars] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  useEffect(() => {
    // 为每个线索生成随机位置
    const leadsWithPositions: Lead[] = mockLeads.map((lead) => ({
      ...lead,
      x: Math.random() * 90 + 5,
      y: Math.random() * 90 + 5,
    }));

    // 模拟星点逐个出现
    leadsWithPositions.forEach((lead, index) => {
      setTimeout(() => {
        setVisibleStars((prev) => [...prev, lead]);
      }, index * 80);
    });
  }, []);

  return (
    <div className="h-full flex relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-5">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="recon-grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#recon-grid)" />
        </svg>
      </div>

      {/* Left: Star Field */}
      <div className="flex-1 relative">
        <div className="p-6 border-b border-white/10 relative z-10">
          <h2 className="text-xl font-bold mb-2">星点扩散 · 线索扫描</h2>
          <p className="text-gray-400 font-mono text-sm">
            正在全库扫描... 发现 <span className="text-blue-400">{visibleStars.length}</span> 个星点
          </p>
        </div>

        {/* Star field visualization */}
        <div className="absolute inset-0 pt-20">
          <svg className="w-full h-full">
            {visibleStars.map((star) => (
              <g key={star.id}>
                {/* Star point */}
                <motion.circle
                  cx={`${star.x}%`}
                  cy={`${star.y}%`}
                  r="2"
                  fill={selectedLead?.id === star.id ? '#3b82f6' : '#6b7280'}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{
                    scale: 1,
                    opacity: selectedLead?.id === star.id ? 1 : 0.6,
                  }}
                  transition={{ duration: 0.3 }}
                  onClick={() => setSelectedLead(star)}
                  className="cursor-pointer"
                  whileHover={{ scale: 1.5, opacity: 1 }}
                />

                {/* Glow effect */}
                <motion.circle
                  cx={`${star.x}%`}
                  cy={`${star.y}%`}
                  r="4"
                  fill={selectedLead?.id === star.id ? '#3b82f6' : '#6b7280'}
                  opacity="0.2"
                  initial={{ scale: 0 }}
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: selectedLead?.id === star.id ? [0.2, 0.4, 0.2] : [0.1, 0.2, 0.1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: star.id * 0.1,
                  }}
                  style={{ pointerEvents: 'none' }}
                />

                {/* Connection line to selected */}
                {selectedLead?.id === star.id && (
                  <motion.line
                    x1={`${star.x}%`}
                    y1={`${star.y}%`}
                    x2="95%"
                    y2="50%"
                    stroke="#3b82f6"
                    strokeWidth="1"
                    opacity="0.3"
                    strokeDasharray="4,4"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5 }}
                  />
                )}
              </g>
            ))}
          </svg>

          {/* Hover tooltips */}
          {visibleStars.slice(-10).map((star) => (
            <motion.div
              key={`tooltip-${star.id}`}
              className="absolute pointer-events-none"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              transition={{ delay: 0.3 }}
            >
              <div className="relative">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-1 rounded text-xs whitespace-nowrap border border-white/20">
                  {star.path.split('/').pop()}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div className="w-96 border-l border-white/10 bg-white/5 p-6 relative z-10">
        {selectedLead ? (
          <motion.div
            key={selectedLead.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
              <h3 className="font-bold">星点详情</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">文件路径</label>
                <div className="mt-1 p-3 bg-black/30 rounded border border-white/10 font-mono text-sm break-all">
                  {selectedLead.path}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">Tactical Summary</label>
                <div className="mt-1 p-3 bg-black/30 rounded border border-white/10 text-sm text-gray-300">
                  {selectedLead.summary}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">坐标</label>
                <div className="mt-1 p-3 bg-black/30 rounded border border-white/10 text-sm text-gray-300 font-mono">
                  ({selectedLead.x.toFixed(1)}, {selectedLead.y.toFixed(1)})
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">状态</label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm text-green-400">已发现</span>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm text-center">
            <Radar className="w-12 h-12 mb-4 opacity-30" />
            <p>点击星点查看详情</p>
            <p className="text-xs mt-2 text-gray-600">星点代表被扫描到的文件</p>
          </div>
        )}
      </div>
    </div>
  );
}