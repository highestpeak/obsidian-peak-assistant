(function (global) {
  "use strict";

  global.PeakUICatalog = Object.freeze({
    version: 2,
    recording: Object.freeze({
      file: "iShot_2026-08-10_16.23.51.mp4",
      sha256: "87441fc768b532d227cb396965510058cae8017dcb26da794faa23f0752e62df",
      duration: "145.13s",
      viewport: "3456 × 2168"
    }),
    scenes: Object.freeze([
      {
        id: "vault-search",
        title: "Vault Search",
        productJob: "同一份结果 snapshot，在 List / Tree / Graph 之间无损投影。",
        states: [
          { id: "list", label: "List" },
          { id: "tree", label: "Tree" },
          { id: "graph", label: "Graph" }
        ],
        production: [
          "../src/ui/component/result-browser/toolbar/ResultBrowserToolbar.tsx",
          "../src/ui/component/result-browser/list/ResultBrowserListRow.tsx",
          "../src/ui/view/quick-search/components/result-tree/ResultTreeView.tsx",
          "../src/ui/view/quick-search/components/result-graph/ResultGraphView.tsx",
          "../src/ui/view/quick-search/components/inspector/InspectorSidePanel.tsx"
        ],
        designs: ["research/2026-07-07-result-graph-layout/index.html"],
        references: [
          { second: 4, label: "List · 结果与 Inspector", image: "ui-system/evidence/recording-2026-08-10/vault-search-list.jpg" },
          { second: 14, label: "Tree · 层级路径", image: "ui-system/evidence/recording-2026-08-10/vault-search-tree.jpg" },
          { second: 22, label: "Graph · 关系投影", image: "ui-system/evidence/recording-2026-08-10/vault-search-graph.jpg" }
        ]
      },
      {
        id: "ai-search",
        title: "AI Search",
        productJob: "Report 负责结论，Sources 负责证据；图谱是来源关系视图，不是另一次搜索。",
        states: [
          { id: "report", label: "Report" },
          { id: "sources", label: "Sources" },
          { id: "source-graph", label: "Graph" }
        ],
        production: [
          "../src/ui/view/quick-search/SearchModal.tsx",
          "../src/ui/view/quick-search/components/V2ReportView.tsx",
          "../src/ui/view/quick-search/components/V2SourcesView.tsx",
          "../src/ui/view/quick-search/components/V2Footer.tsx"
        ],
        designs: ["gstack/ai-search-report-workspace-2026-07-29/index.html"],
        references: [
          { second: 34, label: "Report · 综合答案", image: "ui-system/evidence/recording-2026-08-10/ai-search-report.jpg" },
          { second: 38, label: "Sources · 引用清单", image: "ui-system/evidence/recording-2026-08-10/ai-search-sources.jpg" }
        ]
      },
      {
        id: "vault-intelligence",
        title: "Vault Intelligence",
        productJob: "把全库发现、Review queue 与可执行下一步收在同一个工作台。",
        states: [
          { id: "overview", label: "Overview" },
          { id: "review", label: "Review" }
        ],
        production: ["../src/ui/view/quick-search/VaultIntelligenceWorkspace.tsx"],
        designs: ["gstack/ai-search-report-workspace-2026-07-29/index.html"],
        references: [
          { second: 52, label: "Vault Intelligence · Overview", image: "ui-system/evidence/recording-2026-08-10/vault-intelligence.jpg" }
        ]
      },
      {
        id: "file-atlas",
        title: "File Atlas",
        productJob: "文件树、关系图与 Inspector 共用 selection，不把浏览和理解拆成三个产品。",
        states: [
          { id: "tree", label: "Tree" },
          { id: "graph", label: "Graph" },
          { id: "ai-graph", label: "AI Graph" }
        ],
        production: [
          "../src/ui/view/file-atlas/FileAtlasPanel.tsx",
          "../src/ui/view/file-atlas/components/FileRail.tsx",
          "../src/ui/view/file-atlas/components/AtlasTree.tsx",
          "../src/ui/view/file-atlas/components/FileAtlasGraph.tsx",
          "../src/ui/view/file-atlas/components/AtlasInspector.tsx"
        ],
        designs: ["gstack/file-atlas-mock-2026-07-08/index-v4.html"],
        references: [
          { second: 58, label: "File Atlas · Tree / Inspector", image: "ui-system/evidence/recording-2026-08-10/file-atlas-tree.jpg" },
          { second: 62, label: "File Atlas · Graph", image: "ui-system/evidence/recording-2026-08-10/file-atlas-graph.jpg" }
        ]
      },
      {
        id: "composer",
        title: "Composer",
        productJob: "文档是主表面；选区工具、公式与 AI 动作附着在内容上，不变成独立编辑器。",
        states: [
          { id: "document", label: "Document" },
          { id: "selection", label: "Selection" },
          { id: "formula", label: "Formula" }
        ],
        production: [
          "../src/ui/view/composer/ComposerRoot.tsx",
          "../src/ui/view/composer/blocks",
          "../src/ui/view/composer/blocks/frontmatter"
        ],
        designs: ["gstack/peak-composer-editing-view-2026-07-09/index.html"],
        references: [
          { second: 70, label: "Composer · Selection", image: "ui-system/evidence/recording-2026-08-10/composer-selection.jpg" }
        ]
      },
      {
        id: "composer-intelligence",
        title: "Composer Intelligence",
        productJob: "Copilot、历史、相关材料与 AI Graph 共享当前文档上下文。",
        states: [
          { id: "copilot", label: "Copilot" },
          { id: "history", label: "History" },
          { id: "materials", label: "Materials" },
          { id: "ai-graph", label: "AI Graph" }
        ],
        production: [
          "../src/ui/view/composer/sidecar/IntelligenceSidecar.tsx",
          "../src/ui/view/composer/sidecar/CopilotView.tsx",
          "../src/ui/view/composer/sidecar/HistoryView.tsx",
          "../src/ui/view/composer/sidecar/RelatedMaterialsModal.tsx",
          "../src/ui/component/ai-graph/ContextualAIGraphView.tsx"
        ],
        designs: ["gstack/ai-graph-artifact-platform-2026-07-28/index.html"],
        references: [
          { second: 78, label: "Intelligence · Sidecar", image: "ui-system/evidence/recording-2026-08-10/composer-intelligence.jpg" },
          { second: 82, label: "Related Materials · Modal", image: "ui-system/evidence/recording-2026-08-10/composer-related-materials.jpg" },
          { second: 96, label: "AI Graph · Modal", image: "ui-system/evidence/recording-2026-08-10/composer-ai-graph.jpg" }
        ]
      },
      {
        id: "chat-studio",
        title: "Chat Studio",
        productJob: "Conversation index、消息流、资源与 composer 构成稳定三栏工作台。",
        states: [
          { id: "empty", label: "Empty" },
          { id: "gallery", label: "Gallery" },
          { id: "states", label: "States" }
        ],
        production: [
          "../src/ui/view/chat-studio-view/ChatStudioView.tsx",
          "../src/ui/view/chat-view/ChatViewComponent.tsx",
          "../src/ui/view/chat-view/components"
        ],
        designs: ["gstack/chat-studio-interactive-2026-07-13/composer-lab.html"],
        references: [
          { second: 120, label: "Chat Studio · Empty", image: "ui-system/evidence/recording-2026-08-10/chat-studio-empty.jpg" },
          { second: 124, label: "Chat Studio · Gallery", image: "ui-system/evidence/recording-2026-08-10/chat-studio-gallery.jpg" },
          { second: 128, label: "Chat Studio · Message states", image: "ui-system/evidence/recording-2026-08-10/chat-studio-states.jpg" }
        ]
      },
      {
        id: "settings-usage",
        title: "Settings & Usage",
        productJob: "Overview 负责状态，Setup 负责配置，Usage 负责成本与模型可见性。",
        states: [
          { id: "overview", label: "Overview" },
          { id: "ai-setup", label: "AI Setup" },
          { id: "media", label: "Media" },
          { id: "usage", label: "Usage" }
        ],
        production: [
          "../src/ui/view/SettingsView.tsx",
          "../src/ui/view/settings/tabs/OverviewTab.tsx",
          "../src/ui/view/settings/tabs/AISetupTab.tsx",
          "../src/ui/view/settings/tabs/MediaGenerationTab.tsx",
          "../src/ui/view/usage-dashboard/UsageDashboard.tsx",
          "../src/ui/view/usage-dashboard/screens/ProviderModel.tsx"
        ],
        designs: ["gstack/settings-onboarding-unified-2026-08-12/settings.html"],
        references: [
          { second: 132, label: "Settings · Overview", image: "ui-system/evidence/recording-2026-08-10/settings-overview.jpg" },
          { second: 134, label: "Settings · AI Setup", image: "ui-system/evidence/recording-2026-08-10/settings-ai-setup.jpg" },
          { second: 136, label: "Settings · Media", image: "ui-system/evidence/recording-2026-08-10/settings-media-generation.jpg" },
          { second: 142, label: "Usage · Provider & Model", image: "ui-system/evidence/recording-2026-08-10/usage-provider-model.jpg" }
        ]
      }
    ])
  });
}(window));
