# Peak Assistant System Architecture Flow Review

Date: 2026-05-18

Status: current-code architecture review

Scope:

- System architecture and boot lifecycle
- Main product surfaces and user mental model
- Search / indexing / graph pipeline
- AI Analysis / report generation pipeline
- Chatbot pipeline
- Copilot / Command Center / Auto Review pipeline
- Ambient Push, Vault Lint, Gap Analysis, Precompiled Knowledge

Primary code paths reviewed:

- `main.ts`
- `src/app/context/AppContext.ts`
- `src/app/view/ViewManager.ts`
- `src/app/commands/Register.ts`
- `src/app/commands/PeakCommandActions.ts`
- `src/service/search/**`
- `src/service/agents/**`
- `src/service/chat/**`
- `src/service/copilot/**`
- `src/service/ambient/**`
- `src/service/lint/**`
- `src/ui/view/quick-search/**`
- `src/ui/view/chat-view/**`
- `src/ui/view/copilot/**`
- `src/ui/view/command-center/**`
- `src/ui/view/knowledge-center/**`

Related visual/product specs:

- `docs/superpowers/specs/2026-05-16-copilot-command-center-final-ux-flow.md`
- `docs/superpowers/specs/2026-05-17-copilot-meta-agent-redesign.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/final-ux-flow.html`

## 1. One-Screen Product Model

Current product shape is no longer just "chat with vault search". It is closer to an Obsidian-native knowledge operating layer:

```mermaid
flowchart LR
  User["User in Obsidian"]

  User --> Ask["Ask / discuss"]
  User --> Investigate["Investigate / produce report"]
  User --> Edit["Review / improve current note"]
  User --> Maintain["Maintain / discover vault health"]
  User --> Configure["Configure / operate system"]

  Ask --> Chat["Chat View"]
  Investigate --> QuickSearch["Quick Search + AI Analysis"]
  Edit --> Copilot["Copilot / Auto Review"]
  Maintain --> KnowledgeCenter["Knowledge Center"]
  Maintain --> Ambient["Ambient Push + Morning Briefing"]
  Maintain --> VaultLint["Vault X-Ray"]
  Maintain --> Gap["Gap Analysis"]
  Configure --> CommandCenter["Command Center"]
  Configure --> Settings["Settings"]

  Chat --> VaultMarkdown["Vault markdown chat files"]
  QuickSearch --> AnalysisMarkdown["AI Analysis markdown reports"]
  Copilot --> ReviewHistory["Copilot review history files"]
  KnowledgeCenter --> SQLite["SQLite index + graph"]
  Ambient --> SQLite
  VaultLint --> SQLite
  Gap --> SQLite
```

Review:

- Strong direction: the system has differentiated away from a generic RAG chat plugin.
- Main risk: user-facing names overlap. "Quick Search", "AI Analysis", "Vault Intelligence", "Knowledge Center", "Command Center", "Copilot" are powerful internally, but the mental model needs one sentence per surface.
- Recommended user mental model:
  - `Chat`: ask and continue conversation.
  - `AI Analysis`: investigate a question and turn evidence into a report.
  - `Copilot`: improve the note I am working on.
  - `Knowledge Center`: maintain the knowledge system.
  - `Ambient`: the system notices useful links without being asked.
  - `Command Center`: launcher and operations console.

## 2. Layered System Architecture

The codebase still mostly follows the declared four-layer model, but there are now cross-cutting singletons for agents, context, storage, usage, skills, and MCP.

```mermaid
flowchart TB
  subgraph Obsidian["Obsidian runtime"]
    Main["main.ts Plugin"]
    Workspace["Workspace / Vault / MetadataCache"]
  end

  subgraph AppLayer["app/ integration layer"]
    Commands["commands/Register + PeakCommandActions"]
    Events["events/Register"]
    ViewManager["ViewManager"]
    AppContext["AppContext singleton"]
    Settings["Settings loader + tabs"]
  end

  subgraph UILayer["ui/ React layer"]
    ChatUI["Chat View"]
    SearchUI["Quick Search / AI Analysis"]
    CopilotUI["Copilot modals + review shell"]
    KnowledgeUI["Knowledge Center / Vault X-Ray / Gap"]
    Stores["Zustand stores"]
  end

  subgraph ServiceLayer["service/ business layer"]
    ChatSvc["AIServiceManager + ConversationService"]
    SearchSvc["SearchClient + QueryService + IndexService"]
    Agents["DocSimple / VaultSearchAgentSDK / AIGraph / Report"]
    CopilotSvc["Copilot registry + meta-agent + artifacts"]
    AmbientSvc["Ambient Push + Morning Briefing"]
    LintSvc["VaultLint + Structural Analysis"]
    ContextSvc["SessionContext + ContextPipeline"]
    SkillsMcp["Skills + MCP Client"]
    UsageSvc["UsageTracking"]
  end

  subgraph CoreLayer["core/ framework-agnostic layer"]
    Providers["Provider profiles + Vercel adapters + Agent SDK pool"]
    Docs["Document loaders + resource loaders"]
    Storage["SQLite repos + Vault markdown store"]
    Templates["TemplateManager + PromptService"]
    Schemas["Zod schemas + tool schemas"]
  end

  Main --> AppContext
  Main --> Commands
  Main --> Events
  Main --> ViewManager
  ViewManager --> UILayer
  UILayer --> Stores
  UILayer --> ServiceLayer
  ServiceLayer --> CoreLayer
  CoreLayer --> Workspace
  AppContext --> ServiceLayer
  Commands --> UILayer
  Events --> ServiceLayer
```

Review:

- `AppContext` is now the practical DI root. Most services resolve dependencies through it or static getters.
- This improves convenience, but makes lifecycle discipline important: `main.ts` must create `AppContext` before services that call `AppContext.getInstance()`.
- The architecture is service-rich, not view-rich. That is good for agent features, but documentation must explain which service owns which user promise.

## 3. Plugin Boot Lifecycle

Current startup has two important gates:

- The plugin can load without SQLite if the native module is missing.
- Search/index/usage/session-context only become available after `initSqlite()`.

```mermaid
flowchart TD
  Load["Plugin onload()"]
  Templates["register template helpers\nTemplateManager\nmodel registry templates\nstopword templates"]
  Profiles["normalize settings\nProfileRegistry.load()"]
  Manager["AIServiceManager\nChatStorage + PromptService + ContextPipeline"]
  Context["Create AppContext early\nsearchClient is temporary null"]
  Loaders["DocumentLoaderManager.init()"]
  Desktop{"Desktop?"}
  Native["NativeModuleManager\nbetter-sqlite3 setup"]
  SQLite["initSqlite()"]
  SearchInit["initializeSearchService()\nIndexService + SearchClient\nSearchUpdateListener\nCascadeWorker\nIndexInitializer"]
  Usage["UsageTrackingService"]
  Session["SessionContextService\nPatternDiscovery\nSDK warmup"]
  Views["ViewManager.init()\nregister views + ribbon"]
  Commands["register commands"]
  MCP["connect enabled MCP servers"]
  Skills["SkillRegistry.init()"]
  Ambient["AmbientPushService.start()\nstatus bar + gutter"]
  Onboarding{"No profiles?"}
  Wizard["Open OnboardingModal"]
  Ready["Plugin ready"]

  Load --> Templates --> Profiles --> Manager --> Context --> Loaders --> Desktop
  Desktop -->|yes| Native --> SQLite --> SearchInit --> Usage --> Session --> Views
  Desktop -->|no| Views
  Views --> Commands --> MCP --> Skills --> Ambient --> Onboarding
  Onboarding -->|yes| Wizard --> Ready
  Onboarding -->|no| Ready
```

Review:

- Good: native SQLite failure is non-fatal, so setup wizard can recover.
- Important product implication: features depending on `SearchClient` must handle "index not ready" gracefully.
- Current code comments already acknowledge early `AppContext` creation as a previous bug fix. Keep this invariant documented.

## 4. Persistent Data Map

```mermaid
flowchart LR
  subgraph VaultFiles["Vault markdown files"]
    ChatDocs["Chat conversations / projects"]
    ResourceSummaries["Resource summaries"]
    AnalysisDocs["AI Analysis reports"]
    CopilotHistory["Copilot review snapshots"]
    HubDocs["Hub summary docs"]
    UserSkills["_skills markdown"]
    PromptTemplates["Prompt templates / config JSON"]
  end

  subgraph SQLite["vault.sqlite / chat.sqlite"]
    IndexedDocs["indexed_document"]
    Chunks["doc_chunk + FTS"]
    Embeddings["embedding + sqlite-vec"]
    Graph["mobius_node / mobius_edge"]
    Usage["usage_log"]
    AIHistory["AI analysis metadata"]
    AmbientLog["ambient push log"]
    Lint["vault lint findings"]
    Structural["structural analysis"]
    HubQueue["hub_regen_queue / hub_constituent"]
    Clicks["search click history"]
  end

  ChatDocs --> ChatUI["Chat UI"]
  AnalysisDocs --> SearchUI["AI Analysis UI"]
  CopilotHistory --> CopilotUI["Copilot History UI"]
  HubDocs --> SearchBoost["Search hub boost"]
  UserSkills --> SkillRegistry["SkillRegistry"]
  PromptTemplates --> TemplateManager["TemplateManager"]

  IndexedDocs --> Search
  Chunks --> Search
  Embeddings --> Search
  Graph --> Search
  Graph --> Ambient
  Graph --> Gap
  Lint --> VaultXRay
  Structural --> Gap
  Usage --> UsageDashboard
```

Review:

- Strong split: human-readable artifacts live as markdown; retrieval and metrics live in SQLite.
- This is the right Obsidian-native tradeoff.
- Watchpoint: generated markdown folders such as AI Analysis are intentionally skipped by listener indexing to avoid churn.

## 5. Search And Indexing Pipeline

### 5.1 Index Build / Update Flow

```mermaid
flowchart TD
  Trigger["Trigger:\nSetup wizard / Knowledge Center / vault event / manual command"]
  Initializer["IndexInitializer"]
  Scan["DocumentLoaderManager.scanDocuments()"]
  Filter["shouldIndexDocument()"]
  Read["readByPath()"]
  IndexDoc["IndexService.indexDocument()"]
  Tenant["Resolve tenant:\nvault vs chat"]
  Chunk["Chunk + safe length enforcement"]
  OptionalEmbed{"Embeddings enabled?"}
  Embed["embedTexts()"]
  PreSnapshot["Pre-index graph snapshot\nfor cascade debt"]
  Tx["SQLite transaction"]
  PersistDoc["upsert indexed_document"]
  GraphEdges["upsert references / folder / tag / semantic graph edges"]
  FTS["save chunks + FTS + stems"]
  Vector["save embeddings"]
  Deferred["persist deferred flags:\nvector_pending / llm_pending"]
  Cascade["detectChanges() -> cascade debt"]
  Hub["hub_constituent update for hub docs"]
  Maintenance["runMobiusGlobalMaintenance()\nPageRank / semantic PR / folder hubs / structural analysis"]

  Trigger --> Initializer --> Scan --> Filter --> Read --> IndexDoc --> Tenant --> Chunk
  Chunk --> OptionalEmbed
  OptionalEmbed -->|yes| Embed --> PreSnapshot
  OptionalEmbed -->|no| PreSnapshot
  PreSnapshot --> Tx
  Tx --> PersistDoc --> GraphEdges --> FTS
  FTS --> Vector --> Deferred
  Tx --> Cascade --> Hub --> Maintenance
```

### 5.2 Full Pipeline Levels

```mermaid
flowchart LR
  Fast["fast index"]
  Semantic["semantic index"]
  Full["full index"]

  Fast --> FTS["FTS + chunks"]
  Fast --> MaintFast["graph maintenance"]

  Semantic --> FTS2["FTS + chunks"]
  Semantic --> Vectors["pending vector enrichment"]
  Semantic --> MaintSemantic["graph maintenance"]

  Full --> FTS3["FTS + chunks"]
  Full --> Vectors2["pending vector enrichment"]
  Full --> LLM["pending LLM tags + summaries"]
  Full --> MaintFull["graph maintenance"]
```

Review:

- The staged pipeline is well-shaped: fast path keeps startup/search cheap, semantic/full enrich later.
- `IndexService` is now a large god-service. It works, but future changes should keep extracting small helpers around graph upsert, deferred state, and maintenance rather than adding more branches.
- The tenant split (`vault` vs `chat`) is important: chat artifacts and vault notes are indexed differently but share graph/search machinery.

## 6. Search Query Pipeline

The current Search pipeline is no longer a plain FTS/vector search. It is multi-retriever + graph-aware reranking.

```mermaid
flowchart TD
  Query["Search query"]
  Parse["parseQuery()\nterms / phrases / excludes / filters / weights"]
  Registry["RetrieverRegistry.executeAll()"]
  FTS["FTS Retriever"]
  Stem["FTS Stem Retriever"]
  Vector["Vector Retriever"]
  Meta["Meta Retriever"]
  Fuzzy["Fuzzy Retriever"]
  RRF["adaptive RRF merge"]
  PPR{"PPR enabled?"}
  Seeds["Seed from top merged docs\n+ query-node FTS seeds"]
  Edges["PPR edge fetcher:\nreference / semantic / tag / co-citation"]
  Compute["computePPR()"]
  Fuse["Fuse candidate merge rank + PPR rank"]
  Boost["Ranking boosts:\nfrequency / recency / graph / hub_doc / clicks / related hops"]
  Exclude["Exclude filters"]
  Highlight["HighlightEngine"]
  LLM{"LLM rerank requested?"}
  Rerank["Reranker.rerank()"]
  Results["SearchResponse.items"]

  Query --> Parse --> Registry
  Registry --> FTS --> RRF
  Registry --> Stem --> RRF
  Registry --> Vector --> RRF
  Registry --> Meta --> RRF
  Registry --> Fuzzy --> RRF
  RRF --> PPR
  PPR -->|yes| Seeds --> Edges --> Compute --> Fuse --> Boost
  PPR -->|no| Boost
  Boost --> Exclude --> Highlight --> LLM
  LLM -->|yes| Rerank --> Results
  LLM -->|no| Results
```

Consumers:

```mermaid
flowchart LR
  SearchClient["SearchClient.search()"]
  QuickSearch["Vault Search tab"]
  AIAnalysis["AI Analysis pre-search + vault_grep"]
  Copilot["Copilot meta-agent vault_grep"]
  Ambient["Ambient Push"]
  Inspector["Graph inspector tools"]
  ChatTools["Chat agent tools"]

  SearchClient --> QuickSearch
  SearchClient --> AIAnalysis
  SearchClient --> Copilot
  SearchClient --> Ambient
  SearchClient --> Inspector
  SearchClient --> ChatTools
```

Review:

- The Search pipeline is the strongest technical core of the project.
- PPR is correctly placed after candidate retrieval and before final boosts/highlighting.
- Click-through feedback and current-file related hops are good product signals.
- Watchpoint: search quality now depends on index freshness, graph quality, and deferred enrichment completion. UI should explain "fast index vs semantic/full index" in user terms, not implementation terms.

## 7. AI Analysis Pipeline

AI Analysis currently has three modes:

- document-scoped quick answer via `DocSimpleAgent`
- vault-wide report planning via `VaultSearchAgentSDK`
- graph output via `AIGraphAgent`

```mermaid
flowchart TD
  User["User in Quick Search"]
  Query["Search query + mode"]
  Trigger["triggerAnalysis"]
  UseSession["useSearchSession.performAnalysis()"]
  Mode{"analysisMode"}

  User --> Query --> Trigger --> UseSession --> Mode

  Mode -->|doc/simple| DocAgent["DocSimpleAgent\ncurrent file required"]
  DocAgent --> DocTools["content_reader + graph inspector tools\nvia Agent SDK MCP"]
  DocTools --> DocResult["stream answer + title"]

  Mode -->|vaultFull| VaultAgent["VaultSearchAgent -> VaultSearchAgentSDK"]
  VaultAgent --> PreContext["vault intuition + probe search hits"]
  PreContext --> VaultMCP["vault MCP server:\nlist/read/grep/wikilink/submit_plan"]
  VaultMCP --> SDK["queryWithProfile() Agent SDK"]
  SDK --> Plan["vault_submit_plan"]
  Plan --> PlanReady["plan_ready: user reviews sections"]
  PlanReady --> Approve["Approve plan"]
  Approve --> Report["ReportOrchestrator"]
  Report --> Sections["parallel section content agents"]
  Sections --> Summary["summary agent"]
  Summary --> FinalReport["completed report"]

  Mode -->|aiGraph| GraphAgent["AIGraphAgent"]
  GraphAgent --> GraphStore["aiGraphStore"]
  GraphStore --> GraphDoc["save graph markdown"]

  DocResult --> Router["eventDispatcher -> searchSessionStore"]
  SDK --> Router
  FinalReport --> Router
  GraphDoc --> Router
  Router --> UI["SearchResultView / V2 report UI"]
  UI --> Save["auto-save markdown"]
  UI --> Chat["Open in Chat"]
  UI --> Continue["Continue Analysis"]
  UI --> Synthesize["Synthesize rounds"]
  UI --> Background["Detach to background sessions"]
```

### 7.1 Vault Report Generation

```mermaid
flowchart LR
  PlanSections["Plan sections\nfrom vault_submit_plan"]
  Assign["Optional: assign user insights"]
  Evidence["Read evidence files\nper section"]
  Prompts["Render section prompts"]
  Parallel["Fire all section agents in parallel"]
  Stream["Stream section chunks to store"]
  Guard["Repetition guard"]
  Complete["completeSectionContent"]
  Summary["Summary agent"]
  Persist["persistSessionToVault"]

  PlanSections --> Assign --> Evidence --> Prompts --> Parallel --> Stream --> Guard --> Complete --> Summary --> Persist
```

Review:

- Good: the AI Analysis flow separates "find and plan" from "write report"; this is easier to review than one giant answer.
- Good: `eventDispatcher` is pure enough to support foreground and background routing.
- High-priority review item: `useSearchSession` passes `{ webEnabled, signal }` into `vaultAgentRef.current.startSession(...)`, but `VaultSearchAgent.startSession(userQuery)` currently exposes only one parameter and delegates to `VaultSearchAgentSDK.startSession(userQuery)` without options. If this is the live code, web search toggles and abort signals may be ignored on the vault-full path.
- Background sessions are useful, but the queue model should be tested carefully. `tryStartNext()` marks queued sessions as streaming; it does not itself launch a paused generator. If the underlying generator was never paused, "queued" may be only a UI state.

## 8. Chatbot Pipeline

Chat is the conversational surface. It uses vault markdown storage, a context pipeline, and Vercel streaming for the chat response.

```mermaid
flowchart TD
  User["User submits message"]
  Hook["useChatSubmit()"]
  Ensure["ensureConversation()\ncreate pending conversation if needed"]
  Upload["upload files -> resource refs"]
  SaveUser["save user message\nChatStorageService"]
  UIUser["update Zustand stores immediately"]
  Stream["useStreamChat()"]
  ConvSvc["ConversationService.streamChat()"]
  Prepare["prepareChatRequest()"]
  Context["ContextPipeline.assemble(ChatProfile)"]
  Slots["SystemPrompt\nUserProfile\nConvSummary\nRecentMessages\nWorkingContext\nActivityIndex\nPrevAnalysis\nResourceIndex\nVaultIntuition\nCurrentFile"]
  Mode{"chat mode"}
  Tools["buildChatTools()\nonly in agent mode"]
  Provider["vercelStreamChat()"]
  Events["text / reasoning / tool events"]
  FinalMsg["create final assistant message"]
  SaveAI["save assistant message"]
  Topic["TopicAggregationService.maybeAggregate()"]

  User --> Hook --> Ensure --> Upload --> SaveUser --> UIUser --> Stream --> ConvSvc --> Prepare --> Context --> Slots --> Mode
  Mode -->|chat| Provider
  Mode -->|plan| Provider
  Mode -->|agent| Tools --> Provider
  Provider --> Events --> FinalMsg --> SaveAI --> Topic
```

Storage and sync:

```mermaid
flowchart LR
  ChatUI["Chat UI"]
  DataStore["chatDataStore + chatViewStore"]
  ConvSvc["ConversationService"]
  VaultStore["ChatStorageService"]
  Markdown["Vault markdown conversation files"]
  EventBus["EventBus"]
  ContextUpdate["ContextUpdateService"]

  ChatUI --> DataStore
  ChatUI --> ConvSvc
  ConvSvc --> VaultStore --> Markdown
  ConvSvc --> EventBus --> ContextUpdate
  ContextUpdate --> VaultStore
```

Review:

- Good: Chat context is modular through slots, which makes it easier to add or remove context sources.
- Good: message lifecycle and streaming state are kept visible in UI stores.
- Watchpoint: user-facing `chat / agent / plan` modes should be simplified in product language. Users should not need to know "allowedTools + maxSteps" to choose correctly.
- Watchpoint: Chat uses Vercel provider streaming, while AI Analysis and Copilot Auto use Agent SDK. This is technically valid, but model routing docs need to explain why.

## 9. Copilot / Command Center Pipeline

### 9.1 Entry And Intent Hub

Command Center is a launcher. Copilot Picker is the intent hub for current-note, vault, and system scopes.

```mermaid
flowchart TD
  Entry["Obsidian command / ribbon / Command Center"]
  Center["CommandCenterModal"]
  Hubs{"User intent"}
  Assistant["Assistant commands"]
  Search["Quick Search"]
  CopilotOpen["Open Copilot"]
  Knowledge["Knowledge tools"]
  Setup["Usage / setup / settings"]
  Advanced["Advanced maintenance"]

  Entry --> Center --> Hubs
  Hubs --> Assistant
  Hubs --> Search
  Hubs --> CopilotOpen
  Hubs --> Knowledge
  Hubs --> Setup
  Hubs --> Advanced

  CopilotOpen --> Picker["CopilotPickerModal"]
  Picker --> Context["DocumentContextBuilder\nactive file + selection + stats"]
  Context --> Tabs["Document / Vault / Setting tabs"]
  Tabs --> Auto["Fast / Auto Review"]
  Tabs --> Recommended["Recommended actions\nranked by relevance"]
  Tabs --> Catalog["All capabilities + custom prompts"]
```

### 9.2 Manual Copilot Action Flow

```mermaid
flowchart TD
  Select["User selects manual capability"]
  Registry["CopilotActionRegistry"]
  Action["CopilotAction.execute()"]
  Type{"Action implementation"}
  Text["queryTextStream()\nVercel single-turn"]
  Structured["queryStructured()\nVercel JSON"]
  Agent["buildCopilotAgentStream()\nAgent SDK + vault tools"]
  Local["local graph/search/tag logic"]
  Result["ActionResult"]
  Panel["Action-specific ResultPanel"]

  Select --> Registry --> Action --> Type
  Type --> Text --> Result
  Type --> Structured --> Result
  Type --> Agent --> Result
  Type --> Local --> Result
  Result --> Panel
```

Current built-in action families:

- Document: tags, links, graph links, split, review, correct, polish, format, summarize, concepts, translate, task list.
- Vault: related files, knowledge gaps, synthesize topic, vault health, vault summary, todos, duplicates, find/solve tasks, smart connections, detect/file, prompt audit, workflow.
- Writing: continue writing, rewrite selection, add evidence, writing plan, write article.
- Extension point: custom prompts loaded from vault.

### 9.3 Auto Review Meta-Agent Flow

Current implementation has moved from "planner chooses N capability loops" toward one meta-agent that emits typed artifacts through explicit MCP output tools.

```mermaid
flowchart TD
  Auto["Fast / Auto clicked"]
  Modal["CopilotAutoRunModal"]
  Session["runCopilotReview()"]
  Signal["buildSignalReport()\nrule-based pre-flight"]
  Round["Round loop"]
  Prompt["buildMetaAgentSystemPrompt()\nmode + signal + previous rounds"]
  Subject["subject note pasted into user prompt"]
  VaultMCP["vault MCP:\nlist/read/grep/wikilink"]
  OutputMCP["copilot output MCP:\npropose_insight\npropose_change\npropose_source\nattach_chat_followup\nnote_finding\nsubmit_review"]
  SDK["queryWithProfile()\nAgent SDK"]
  Collector["CopilotOutputCollector"]
  Snapshot["ReviewSessionSnapshot"]
  Artifacts["buildReviewArtifacts()\nchanges / insights / sources / trace"]
  Shell["CopilotReviewShell"]
  Apply["applyCopilotArtifactsToContext()\nexact substring replacement"]
  History["CopilotReviewHistoryService\nprogressive markdown checkpoint"]

  Auto --> Modal --> Session --> Signal --> Round --> Prompt --> Subject --> SDK
  SDK --> VaultMCP
  SDK --> OutputMCP --> Collector --> Snapshot --> Artifacts --> Shell
  Shell --> Apply
  Snapshot --> History
  Round -->|submit_review.continue=true| Round
  Round -->|complete / cancel / error| Shell
```

### 9.4 Artifact Review Surface

```mermaid
flowchart LR
  Collector["collector proposals"]
  Changes["ChangeArtifact\nbefore/after blocks"]
  Insights["InsightArtifact\nmarkdown body + followups"]
  Sources["SourceArtifact\npath + excerpt + relevance"]
  Trace["TraceArtifact\nplan / reads / findings / propose roots"]
  UI["CopilotReviewShell"]
  UserDecision["Apply selected / apply reviewed / reject / continue chat"]

  Collector --> Changes --> UI
  Collector --> Insights --> UI
  Collector --> Sources --> UI
  Collector --> Trace --> UI
  UI --> UserDecision
```

Review:

- Strong: `propose_*` tools remove guesswork. The agent explicitly publishes artifacts instead of relying on result adapters to infer UI output.
- Strong: nothing is applied automatically. Change application is review-first.
- High-priority review item: current `CopilotReviewSession` uses `UNCAPPED_MAX_TURNS = 999` and `ABSOLUTE_ROUND_SAFETY_CAP = 20`. This differs from the earlier spec's bounded Fast/Complete budget. It may be intentional, but cost/latency UX should be reviewed.
- Watchpoint: `applyCopilotArtifactsToContext()` uses exact substring replacement. That is safe, but fragile when the note changed after the agent read it. The UI should show conflicts, not only "No matching changes were applied."
- Watchpoint: Auto Review is desktop-only by UI guard, while manual actions may still depend on desktop search/SQLite. Mobile affordance needs explicit handling.

## 10. Ambient / Knowledge Maintenance Pipeline

### 10.1 Ambient Push

Ambient Push is the "system notices useful notes while I write" surface.

```mermaid
flowchart TD
  Editor["User edits / opens note"]
  Trigger["AmbientTrigger"]
  Context["extractContext()\ncurrent paragraph + outlinks + timing"]
  Search["ambientSearch()"]
  Query["SearchClient.search()\ncurrent paragraph scoped by currentFilePath"]
  Filter["filter self / already linked / recent pushes"]
  Signals["signals:\ntext overlap\nlearned feedback\nserendipity"]
  Explain["template explanation\noptional LLM micro-explanation"]
  Store["ambientPushStore"]
  Panel["AmbientPushPanel + CM6 gutter + status bar"]
  Log["AmbientPushRepo log"]

  Editor --> Trigger --> Context --> Search --> Query --> Filter --> Signals --> Explain --> Store --> Panel
  Store --> Log
```

### 10.2 Morning Briefing

```mermaid
flowchart TD
  SQLiteReady["SQLite ready after startup"]
  Timer["3s delayed tryShow()"]
  Settings{"enabled + 4h gap?"}
  Queries["briefing queries in parallel"]
  Unresolved["unresolved connections"]
  Hubs["changed hubs"]
  Decay["decaying engagement notes"]
  Store["morningBriefingStore"]
  Modal["MorningBriefingModal"]

  SQLiteReady --> Timer --> Settings
  Settings -->|yes| Queries
  Queries --> Unresolved --> Store
  Queries --> Hubs --> Store
  Queries --> Decay --> Store
  Store --> Modal
  Settings -->|no| Stop["no-op"]
```

### 10.3 Vault Lint And Structural Hole Analysis

```mermaid
flowchart LR
  VaultXRay["Vault X-Ray"]
  LintSvc["VaultLintService"]
  Detectors["SignalRegistry detectors:\norphan / broken link / empty / stub / untagged"]
  Score["HealthScoreEngine"]
  Repo["VaultLintRepo"]
  XRayUI["VaultXRayPanel"]

  GapUI["Gap Analysis View"]
  Structural["runStructuralAnalysis()"]
  Graph["buildAnalysisGraph()"]
  Brandes["Brandes betweenness"]
  Louvain["Louvain community"]
  Burt["Burt constraint"]
  Holes["detectStructuralHoles()"]
  StructuralRepo["StructuralAnalysisRepo"]

  VaultXRay --> LintSvc --> Detectors --> Score --> Repo --> XRayUI
  GapUI --> Structural --> Graph --> Brandes --> Louvain --> Burt --> Holes --> StructuralRepo --> GapUI
```

Review:

- Ambient, Vault Lint, Gap Analysis, Hub summaries, and PPR search are now all using the same underlying graph/index substrate. That is a good platform effect.
- User-facing language should avoid exposing every algorithm. The visible promise is "connections, gaps, health, stale hubs, useful notes".
- Search and Ambient both depend on graph/search freshness; Knowledge Center should remain the place that explains and fixes index state.

## 11. End-to-End User Mental Model Flow

This is the product-level map the UI should teach.

```mermaid
flowchart TB
  Start["I am in Obsidian"]

  Start --> Q1{"What am I trying to do?"}

  Q1 -->|Ask something / continue thinking| Chat["Open Assistant"]
  Chat --> ChatFlow["Conversation with context slots\nand optional agent tools"]
  ChatFlow --> ChatOutcome["Saved conversation / project / starred info"]

  Q1 -->|Research a question / make report| Analysis["Quick Search -> AI Analysis"]
  Analysis --> AnalysisFlow["Agent finds sources -> proposes plan -> user approves -> report generated"]
  AnalysisFlow --> AnalysisOutcome["Saved report / open in chat / continue / synthesize"]

  Q1 -->|Improve this note| Copilot["Copilot Document tab"]
  Copilot --> CopilotFlow["Auto or manual intent -> agent reads vault -> artifacts"]
  CopilotFlow --> CopilotOutcome["Apply reviewed changes / inspect sources / save history"]

  Q1 -->|Understand or maintain vault| Knowledge["Knowledge Center / Vault tab"]
  Knowledge --> KnowledgeFlow["Index, health, gaps, hubs, related notes"]
  KnowledgeFlow --> KnowledgeOutcome["Repair opportunities / graph insights / refreshed knowledge substrate"]

  Q1 -->|Operate the system| System["Command Center / Settings"]
  System --> SystemFlow["Profiles, models, MCP, skills, index, usage, maintenance"]
  SystemFlow --> SystemOutcome["System ready and observable"]

  Q1 -->|Let it help proactively| Ambient["Ambient Push / Morning Briefing"]
  Ambient --> AmbientFlow["Trigger -> search -> explanation -> related-note cards"]
  AmbientFlow --> AmbientOutcome["Open/link/dismiss feedback loop"]
```

Review:

- The product should not ask users to choose between "RAG", "PPR", "Agent SDK", "MCP", "FTS", or "Graph". Those belong in trace/provenance and settings.
- The user should choose intent: ask, investigate, improve, maintain, operate, or receive proactive help.
- Copilot and AI Analysis should remain distinct:
  - Copilot starts from current note and produces reviewable artifacts.
  - AI Analysis starts from a question and produces a report.
  - Chat starts from a conversation and produces continuity.

## 12. Main Technical Strategy Review

| Area | Current strategy | Review |
| --- | --- | --- |
| Storage | Markdown for human artifacts; SQLite for index/graph/metrics | Correct Obsidian-native split. Keep generated files readable and re-loadable. |
| Search | Multi-retriever + RRF + PPR + ranking boosts | Strong core. Avoid adding new search paths outside `SearchClient`. |
| Indexing | Fast / semantic / full staged enrichment | Good. UI needs plain-language status and upgrade prompts. |
| Agents | Agent SDK for tool-heavy work; Vercel path for chat and simple single-turn calls | Valid but needs routing documentation so model/profile settings are understandable. |
| Copilot | Intent hub + explicit artifact output tools | Strong direction. Keep manual actions as initial intents, not separate product silos. |
| AI Analysis | Plan-first report generation with approval | Good reviewability. Watch option passing and background-session queue semantics. |
| Chat | Context slots + markdown persistence + optional tools in agent mode | Good foundation. Product language for modes needs simplification. |
| Ambient | Low-interruption proactive suggestions using same Search substrate | Differentiating. Needs careful dedupe and explanation quality. |
| Knowledge health | Vault Lint + Gap + Hub summaries + Cascade | Strong "knowledge maintenance" pillar. Needs one combined dashboard narrative. |
| Observability | Usage tracking, trace artifacts, debug stores | Good, but scattered. Product-level trace should remain readable. |

## 13. Architecture Risks / Review Findings

### P0 / P1

1. `VaultSearchAgent.startSession()` option mismatch

   - Caller path: `src/ui/view/quick-search/hooks/useSearchSession.ts`
   - Callee path: `src/service/agents/VaultSearchAgent.ts`
   - Observed issue: caller passes `webEnabled` and `signal`, wrapper signature only accepts `userQuery` and does not forward options to `VaultSearchAgentSDK`.
   - Product impact: web search toggle and cancellation may not work in vault-full AI Analysis.
   - Recommendation: update wrapper signature to accept options and forward to SDK; add a narrow test or type check around it.

2. Agent SDK `pluginId` accessor drift

   - Observed paths: `src/service/agents/DocSimpleAgent.ts`, `src/service/agents/FollowupChatAgent.ts`, `src/service/workflow/WorkflowAgent.ts`, `src/service/agents/intuition-helper/intuition.recon.ts`, `src/service/ambient/RelevanceExplainer.ts`
   - Observed issue: several call sites reference `ctx.pluginId` or `AppContext.getPluginId()`, but current `AppContext` exposes `plugin.manifest.id`, not a `pluginId` property or static `getPluginId()` method.
   - Product impact: tool-heavy agent calls can fail compile-time or runtime depending on how these paths are bundled/executed.
   - Recommendation: standardize on `AppContext.getInstance().plugin.manifest.id` or add one explicit `AppContext.getPluginId()` helper and migrate all call sites.

3. Copilot Auto Review budget drift

   - Current path: `src/service/copilot/CopilotReviewSession.ts`
   - Observed issue: code uses uncapped per-round turns (`999`) and round safety cap `20`, while earlier product spec described bounded Fast/Complete behavior.
   - Product impact: unpredictable latency/cost and possible long-running runs.
   - Recommendation: decide explicitly whether "agent decides" is allowed to be long. If yes, show budget/cost guard in UI; if no, restore practical caps.

4. Too many product surfaces with overlapping names

   - Command Center, Copilot, Vault Intelligence, Knowledge Center, Quick Search, AI Analysis, Ambient Push.
   - Product impact: users may not know where to start.
   - Recommendation: teach the six-intent mental model in UI labels and docs: Ask, Investigate, Improve, Maintain, Operate, Proactive.

### P2

4. Exact-substring apply is safe but conflict-prone

   - Path: `src/service/copilot/CopilotArtifactApply.ts`
   - Current behavior: if `before` is not found, block is skipped.
   - Recommendation: expose unmatched blocks as conflicts with "copy patch / retry review" options.

5. Search freshness is now a cross-system dependency

   - Search, AI Analysis, Copilot search tools, Ambient, Gap, Vault Lint, Hub summaries all depend on index/graph quality.
   - Recommendation: Knowledge Center should surface index level, pending vector/LLM enrichment, graph maintenance debt, and last structural analysis time in one place.

6. Agent routing is hard to explain

   - Chat and simple Copilot actions use Vercel provider streaming.
   - AI Analysis and Copilot Auto use Agent SDK with MCP tools.
   - Recommendation: create a short model-routing doc: Chat model, Agent model, Copilot model, Embedding model, Web Search model, and which surface uses each.

7. Background session queue semantics need a real-flow test

   - Path: `src/service/BackgroundSessionManager.ts`
   - Recommendation: test close modal during vault-full analysis, run 3+ sessions, restore plan-ready session, approve plan, verify events and saved markdown remain correct.

## 14. Recommended Next Documentation / Implementation Steps

1. Create a user-facing "Which surface should I use?" doc based on Section 11.
2. Fix or verify the `VaultSearchAgent.startSession()` option mismatch.
3. Standardize Agent SDK `pluginId` access across agent services.
4. Decide Copilot Auto Review budget policy and align code/spec/UI copy.
5. Add Knowledge Center status cards for pending enrichment and graph maintenance debt.
6. Add conflict UI for Copilot artifact apply.
7. Create a model-routing reference under `docs/` or Settings help.
8. Use this architecture review as the map for Phase 11 tutorial docs:
   - Graph inspector / AI Analysis tutorial
   - Model selection best practice
   - Copilot Auto Review tutorial
