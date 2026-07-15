(function () {
  window.ChatStudioFixtures = {
    pinned: [
      { id: 'conversation-catalog', title: '消息与产物组件目录', meta: '12 类', icon: 'layout-grid', entryKind: 'conversation', conversationType: { kind: 'custom', label: '组件审阅' } },
      { id: 'product-strategy', title: 'Chat Studio 产品定位', meta: '研究', icon: 'route', entryKind: 'document', href: './product-strategy.html' },
      { id: 'conversation-evidence', title: 'Story Cards 证据梳理', meta: '今天', icon: 'bookmark', entryKind: 'conversation', conversationType: { kind: 'chat' } },
      { id: 'conversation-architecture', title: 'Context architecture review', meta: '7月7日', icon: 'git-branch', entryKind: 'conversation', conversationType: { kind: 'agent' } },
      { id: 'conversation-composer-lab', title: 'Composer 交互研究', meta: '独立稿', icon: 'sliders', entryKind: 'document', href: './composer-lab.html' }
    ],
    projects: [
      {
        id: 'project-interview',
        name: 'NZ Software Interview',
        icon: 'briefcase',
        open: true,
        summary: '把分散在 Vault 中的真实项目证据整理成可检索、可追问、可复述的面试材料。',
        description: '项目负责约束回答边界、聚合面试资料，并保留每一轮讨论产生的 Story Card、追问与计划。',
        stats: { conversations: 4, messages: 38, starred: 6, resources: 5 },
        resources: [
          { title: 'interview-story-bank.md', meta: 'Vault 文档 · 3,865 words', kind: 'file-text' },
          { title: 'NZ Software Engineer CV.pdf', meta: 'PDF · 6 pages', kind: 'file' },
          { title: 'Interview evidence matrix', meta: 'Base · 18 entries', kind: 'database' },
          { title: 'System design diagrams', meta: 'Excalidraw · 4 drawings', kind: 'network' },
          { title: 'Behavioural question bank.md', meta: 'Vault 文档 · 32 questions', kind: 'book-open' }
        ],
        starred: [
          { title: 'Story Card 的三层证据结构', meta: '来自“把项目经历整理成 Story Cards” · 10:38' },
          { title: '无状态改造的约束与取舍', meta: '来自“System design follow-up” · 周一' }
        ],
        plans: [
          { title: '优先完成 3 张证据最完整的 Story Card', meta: '进行中 · 2 / 3', progress: 67 },
          { title: '把核心故事改写成 90 秒口语版本', meta: '下一步 · 0 / 3', progress: 0 },
          { title: '针对系统设计故事补齐故障场景追问', meta: '待开始 · 0 / 5', progress: 0 }
        ],
        conversations: [
          { id: 'conversation-story', title: '把项目经历整理成 Story Cards', time: '10:42', conversationType: { kind: 'chat' } },
          { id: 'conversation-intro', title: '三分钟英文自我介绍', time: '昨天', conversationType: { kind: 'template', templateId: 'spoken-intro', templateName: '口语练习' } },
          { id: 'conversation-system', title: 'System design follow-up', time: '周一', conversationType: { kind: 'agent' } },
          { id: 'conversation-behavioural', title: 'Behavioural follow-up bank', time: '周一', conversationType: { kind: 'custom', label: '追问题库' } }
        ]
      },
      {
        id: 'project-research',
        name: 'Product Research',
        icon: 'flask',
        open: false,
        conversations: [
          { id: 'conversation-ui', title: 'AI workspace UI patterns', time: '7月9日', conversationType: { kind: 'canvas' } },
          { id: 'conversation-notes', title: 'Research notes synthesis', time: '7月8日', conversationType: { kind: 'agent' } },
          { id: 'conversation-composer', title: 'Composer interaction matrix', time: '7月8日', conversationType: { kind: 'plan' } }
        ]
      },
      {
        id: 'project-modernization',
        name: 'Peak Modernization',
        icon: 'layers',
        open: false,
        conversations: [
          { id: 'conversation-runtime', title: 'Runtime ownership audit', time: '7月6日', conversationType: { kind: 'agent' } },
          { id: 'conversation-boundary', title: 'Boundary retirement wave', time: '7月5日', conversationType: { kind: 'plan' } }
        ]
      },
      {
        id: 'project-job',
        name: 'NZ Job Search',
        icon: 'map-pin',
        open: false,
        conversations: [
          { id: 'conversation-capture', title: 'Daily job capture workflow', time: '7月4日', conversationType: { kind: 'plan' } },
          { id: 'conversation-cv', title: 'CV evidence alignment', time: '7月2日', conversationType: { kind: 'chat' } }
        ]
      }
    ],
    recents: [
      {
        label: '今天',
        conversations: [
          { id: 'conversation-input-patterns', title: 'Composer context patterns', time: '11:20', icon: 'sliders', conversationType: { kind: 'canvas' } },
          { id: 'conversation-vault-query', title: 'Vault 高级搜索语法', time: '09:18', icon: 'search', conversationType: { kind: 'chat' } },
          { id: 'conversation-file-atlas', title: 'File Atlas interactions', time: '08:31', icon: 'network', conversationType: { kind: 'custom', label: '交互审阅' } }
        ]
      },
      {
        label: '过去 7 天',
        conversations: [
          { id: 'conversation-architecture', title: 'Context architecture review', time: '7月7日', icon: 'git-branch', conversationType: { kind: 'agent' } },
          { id: 'conversation-search', title: 'Vault search debugging', time: '7月5日', icon: 'search', conversationType: { kind: 'chat' } },
          { id: 'conversation-dashboard', title: 'Usage dashboard review', time: '7月4日', icon: 'chart', conversationType: { kind: 'canvas' } },
          { id: 'conversation-onboarding', title: 'Onboarding flow critique', time: '7月3日', icon: 'route', conversationType: { kind: 'template', templateId: 'ux-review', templateName: 'UX Review' } },
          { id: 'conversation-agent', title: 'Agent harness boundaries', time: '7月2日', icon: 'bot', conversationType: { kind: 'agent' } }
        ]
      },
      {
        label: '较早',
        conversations: [
          { id: 'conversation-prompt', title: 'Prompt registry source of truth', time: '6月29日', icon: 'file-code', conversationType: { kind: 'chat' } },
          { id: 'conversation-quickpick', title: 'QuickPick hierarchy notes', time: '6月28日', icon: 'list-tree', conversationType: { kind: 'plan' } },
          { id: 'conversation-stream', title: 'Streaming event normalization', time: '6月26日', icon: 'activity', conversationType: { kind: 'agent' } },
          { id: 'conversation-docs', title: 'Documentation navigation map', time: '6月24日', icon: 'book-open', conversationType: { kind: 'template', templateId: 'doc-map', templateName: '文档导航' } }
        ]
      }
    ],
    activeConversation: {
      id: 'conversation-story',
      title: '把项目经历整理成 Story Cards',
      alternateTitle: 'Story Card 证据与追问地图',
      scope: 'NZ Software Interview',
      date: '今天',
      previousUser: '先不要直接写面试答案。只根据我现有的项目文档，帮我建立一个可以快速回忆的证据索引。',
      previousAssistantIntro: '明白。我会把 Story Card 当作检索入口，而不是包装过度的成稿。每张卡先固定三层信息：',
      previousPoints: [
        '事实层：你实际做了什么，哪些材料可以支撑。',
        '决策层：当时有哪些约束，为什么选择这条路径。',
        '追问层：面试官继续深挖时，哪些细节可以安全展开。'
      ],
      user: '我想把现有项目材料整理成面试时能快速调用的 Story Cards。先帮我确认哪些经历证据最完整。',
      assistantIntro: '可以。先不润色答案，我会把材料按“证据完整度”和“可追问深度”分组。当前最值得优先整理的是这三类：',
      points: [
        '性能优化：问题、技术决策和结果链条完整。',
        '无状态改造：架构取舍明确，适合展开系统设计追问。',
        '工程效率：能说明你如何推动团队采用可重复流程。'
      ],
      suggestedNext: [
        '先整理性能优化 Story Card',
        '打开并核对证据矩阵',
        '只显示证据最完整的三段经历',
        '把这一轮结论保存到项目 Vault'
      ]
    },
    catalogConversation: {
      id: 'conversation-catalog',
      title: '消息与产物组件目录',
      alternateTitle: 'Chat 内容类型与交互目录',
      scope: 'Chat Studio UI/UX',
      date: '组件审阅'
    },
    topics: [
      {
        id: 'topic-evidence',
        title: '证据与故事选择',
        count: 4,
        open: true,
        rows: [
          { kind: 'message-user', title: 'Story Cards 的目标与边界', time: '10:38' },
          { kind: 'message', title: '证据索引的三层结构', time: '10:38' },
          { kind: 'message-user', title: '筛选最完整经历', time: '10:42' },
          { kind: 'message', title: '证据完整度分组', time: '10:43' }
        ]
      },
      {
        id: 'topic-next',
        title: '下一轮整理',
        count: 2,
        open: false,
        rows: [
          { kind: 'message', title: '建议的整理顺序', time: '10:44' },
          { kind: 'message-user', title: '先从性能优化开始', time: '10:45' }
        ]
      }
    ],
    catalogTopics: [
      {
        id: 'topic-inputs',
        title: '输入资源',
        count: 5,
        open: true,
        rows: [
          { kind: 'image', title: '图片组合与预览', time: 'Image' },
          { kind: 'paperclip', title: 'PDF / DOCX / Markdown', time: 'File' },
          { kind: 'link', title: '链接富预览', time: 'URL' },
          { kind: 'book-open', title: 'Vault 文档与 [[wikilink]]', time: 'Context' },
          { kind: 'folder', title: '项目级上下文', time: 'Project' }
        ]
      },
      {
        id: 'topic-rich',
        title: '富内容回答',
        count: 6,
        open: true,
        rows: [
          { kind: 'table', title: '表格与结构化数据', time: 'Table' },
          { kind: 'code', title: '代码与 Diff', time: 'Code' },
          { kind: 'diagram', title: 'Mermaid / 图表', time: 'Diagram' },
          { kind: 'image', title: '生成图片', time: 'Image' },
          { kind: 'file', title: '生成文档', time: 'Document' },
          { kind: 'database', title: 'Obsidian Bases', time: 'Base' }
        ]
      },
      {
        id: 'topic-runtime',
        title: '运行过程与动作',
        count: 4,
        open: false,
        rows: [
          { kind: 'brain', title: 'Reasoning disclosure', time: 'Process' },
          { kind: 'wrench', title: 'Tool sequence', time: 'Process' },
          { kind: 'bot', title: 'Agent / Persona identity', time: 'Identity' },
          { kind: 'sparkles', title: 'Suggested next / Capability', time: 'Action' }
        ]
      }
    ],
    artifacts: [
      { title: 'Story Card · 性能优化.md', type: 'Markdown', state: '已保存', kind: 'file' },
      { title: 'Interview evidence matrix', type: 'Table', state: '草稿', kind: 'table' }
    ],
    catalogArtifacts: [
      { title: 'chat-studio-flow.png', type: 'Image', state: '已生成', kind: 'image' },
      { title: 'context-routing.mmd', type: 'Mermaid', state: '可全屏', kind: 'diagram' },
      { title: 'evidence-matrix.csv', type: 'Table', state: '可下载', kind: 'table' },
      { title: 'Story Cards.docx', type: 'Document', state: '已保存', kind: 'file' },
      { title: 'interview-pack.pdf', type: 'PDF', state: '已生成', kind: 'file' },
      { title: 'plan-board.canvas', type: 'Canvas', state: '可打开', kind: 'canvas' },
      { title: 'system-map.excalidraw', type: 'Excalidraw', state: '可打开', kind: 'excalidraw' },
      { title: 'story-card-schema.json', type: 'Code', state: '可复制', kind: 'code' },
      { title: 'interview-index.base', type: 'Bases', state: 'Save & Open', kind: 'database' }
    ],
    reviewStates: [
      { hash: 'active', label: 'Active conversation' },
      { hash: 'project', label: 'Project overview' },
      { hash: 'catalog', label: 'Component catalog' },
      { hash: 'new', label: 'New conversation' },
      { hash: 'streaming', label: 'Streaming' },
      { hash: 'tool-run', label: 'Tool run' },
      { hash: 'resources', label: 'Resources' },
      { hash: 'artifacts', label: 'Artifacts' },
      { hash: 'empty', label: 'Empty conversation' }
    ]
  };
}());
