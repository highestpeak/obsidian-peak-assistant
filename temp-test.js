var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// test/stubs/obsidian-stub.cjs
var require_obsidian_stub = __commonJS({
  "test/stubs/obsidian-stub.cjs"(exports2, module2) {
    "use strict";
    function normalizePath6(p) {
      return String(p ?? "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
    }
    var TAbstractFile2 = class {
    };
    var TFile19 = class extends TAbstractFile2 {
      constructor() {
        super();
        this.extension = "md";
      }
    };
    var TFolder4 = class extends TAbstractFile2 {
      constructor() {
        super();
        this.children = [];
      }
    };
    module2.exports = { normalizePath: normalizePath6, TAbstractFile: TAbstractFile2, TFile: TFile19, TFolder: TFolder4 };
  }
});

// src/core/po/graph.po.ts
var GraphNodeType = {
  TopicTag: "topic_tag",
  FunctionalTag: "functional_tag",
  KeywordTag: "keyword_tag",
  /** LLM time/geo/person context tags (prefix labels Time* / Geo* / Person*). */
  ContextTag: "context_tag",
  Document: "document",
  /** Non-note vault entities (e.g. file attachments as graph nodes). Distinct from {@link Folder}. */
  Resource: "resource",
  /** Vault folder path node for hierarchy `contains` edges (parent folder → child or document). */
  Folder: "folder",
  HubDoc: "hub_doc"
};
var GraphEdgeType = {
  References: "references",
  /**
   * Inferred / rule-based / LLM-derived doc→doc relation (not a wiki link).
   * Distinct from {@link References}; use `attributes_json` for provenance.
   */
  SemanticRelated: "semantic_related",
  TaggedTopic: "tagged_topic",
  TaggedFunctional: "tagged_functional",
  TaggedKeyword: "tagged_keyword",
  TaggedContext: "tagged_context",
  Contains: "contains"
};
var GRAPH_TAGGED_EDGE_TYPES = [
  GraphEdgeType.TaggedTopic,
  GraphEdgeType.TaggedFunctional,
  GraphEdgeType.TaggedKeyword,
  GraphEdgeType.TaggedContext
];
var GRAPH_SEMANTIC_DOC_EDGE_TYPES = [GraphEdgeType.SemanticRelated];
var GRAPH_INDEXED_NOTE_NODE_TYPES = [
  GraphNodeType.Document,
  GraphNodeType.HubDoc
];
var GRAPH_DOCUMENT_LIKE_NODE_TYPES = [
  GraphNodeType.Document,
  GraphNodeType.HubDoc
];
var GRAPH_TAG_NODE_TYPES = [
  GraphNodeType.TopicTag,
  GraphNodeType.FunctionalTag,
  GraphNodeType.KeywordTag,
  GraphNodeType.ContextTag
];
function isIndexedNoteNodeType(type) {
  return type === GraphNodeType.Document || type === GraphNodeType.HubDoc;
}

// src/core/constant.ts
var VAULT_DB_FILENAME = "vault.sqlite";
var CHAT_DB_FILENAME = "chat.sqlite";
var INDEX_STATE_KEYS = {
  builtAt: "index_built_at",
  indexedDocs: "indexed_docs"
};
var MOBIUS_MAINTENANCE_STATE_KEYS = {
  dirtyScore: "mobius_maintenance_dirty_score",
  needed: "mobius_maintenance_needed",
  lastFullAt: "mobius_maintenance_last_full_at"
};
var MOBIUS_MAINTENANCE_DEBT_INDEX_DOC = 1;
var MOBIUS_MAINTENANCE_DEBT_PER_DELETE = 2;
var MOBIUS_MAINTENANCE_DEBT_RENAME = 1;
var MOBIUS_MAINTENANCE_DIRTY_THRESHOLD = 30;
var INDEX_FRONTMATTER_KEYS = {
  updatedAt: "updated_at",
  updated: "updated",
  createdAt: "created_at",
  created: "created"
};
var HUB_FRONTMATTER_KEYS = {
  /** When false, maintenance skips overwriting body (user-edited hub). */
  autoHub: "peak_auto_hub",
  /** When true, full auto-updates are disabled (user takeover). */
  userOwned: "peak_user_owned"
};
var MANUAL_HUB_FRONTMATTER_KEYS = {
  /** Overrides semantic hub role when value is a known hub role string. */
  hubRole: "hub_role",
  /**
   * Extra member note paths for coverage / assembly hints (string[] or single string).
   * Resolved like cluster member paths.
   */
  hubSourcePaths: "hub_source_paths"
};
var HUB_MATERIALIZE_CONCURRENCY = 4;
var HUB_DISCOVER_LIMIT_MIN = 40;
var HUB_DISCOVER_LIMIT_MAX = 200;
var HUB_DISCOVER_LIMIT_SQRT_SCALE = 3;
var HUB_DISCOVER_GREEDY_SELECTION = {
  /** First N selected hubs use looser rules so the running coverage union is not empty too early. */
  earlyFillSlots: 8,
  /** After this many hubs are selected, reject weak candidates unless they are strong or add coverage. */
  strictFilterStartCount: 6,
  /** `rankingScore` at or above this still passes when marginal coverage gain is low. */
  strongHubScore: 0.48,
  /** Marginal gain must be at least `minCoverageGain * usefulGainFactor` to count as “useful new coverage”. */
  usefulGainFactor: 0.45
};
var HUB_DISCOVER_REMAINING_CANDIDATE_SCORE_WEIGHT = 0.15;
var HUB_DISCOVER_FOLDER_MAX_CANDIDATES = 15;
var HUB_DISCOVER_CLUSTER_MIN_SIZE = 3;
var HUB_DISCOVER_CLUSTER_SEMANTIC_NEIGHBOR_CAP = 20;
var HUB_SOURCE_CONSENSUS_MAX = 0.12;
var HUB_SOURCE_CONSENSUS_PER_EXTRA = 0.04;
var FOLDER_HUB_MIN_DOCS = 4;
var FOLDER_HUB_STATS_DOC_PAGE_SIZE = 200;
var INDEX_LONG_RANGE_LCA_MAX_DEPTH = 1;
var HUB_ANTI_EXPLOSION_MAX_NEW_NODES = 32;
var HUB_ANTI_EXPLOSION_MIN_NOVELTY_RATIO = 0.05;
var LOCAL_HUB_GRAPH = {
  maxNodes: 80,
  maxEdges: 400,
  defaultMaxDepth: 4,
  /** Row cap for `listEdgesByTypesIncidentToAnyNode` per BFS layer. */
  edgeQueryLimit: 12e3,
  crossFolderPenalty: {
    incompletePaths: 0.15,
    acrossSubtree: 0.45
  },
  folderCohesion: {
    defaultWhenMissing: 0.5,
    insideCenterFolder: 1,
    outsideCenterFolder: 0.35
  },
  bridgeDegree: {
    /** Treat as “high hub connectivity” when both inc/out reach this (bridge penalty). */
    highThreshold: 10,
    penalty: 0.35
  },
  nodeWeight: {
    depthDecayPerHop: 0.35,
    defaultTagAlignment: 0.5,
    cohesionBlendCohesion: 0.55,
    cohesionBlendAlignment: 0.45,
    quarter: 0.25,
    pagerankScale: 3,
    semanticPagerankScale: 1.2,
    bridgePenaltyScale: 0.15
  },
  edgeWeight: {
    defaultBase: 0.5,
    references: 1,
    contains: 0.85,
    semanticRelated: 0.7,
    other: 0.5,
    crossPenaltyScale: 0.35
  },
  tagAlignmentBlend: {
    neutralEmptyAnchors: 0.5,
    topics: 0.5,
    functionals: 0.3,
    keywords: 0.2
  },
  roleHint: {
    boundaryMinDepth: 3,
    bridgeMinInc: 8,
    bridgeMinOut: 8,
    leafMaxTotalDegree: 2,
    bridgeMinTotalDegree: 12
  },
  clusterHub: {
    memberDepth: 1,
    memberDistancePenalty: 0.3,
    memberCohesion: 0.9,
    memberWeightBase: 0.5,
    memberWeightSpread: 0.5,
    centerHubWeight: 1,
    stoppedAtDepth: 1
  },
  /** Extra downweight for hints.deprioritizedBridgeNodeIds. */
  deprioritizedBridgeMultiplier: 0.65
};
var PAGERANK_ALGORITHM_VERSION = 1;
var SEMANTIC_PAGERANK_ALGORITHM_VERSION = 1;
var PAGERANK_EDGE_BATCH_SIZE = 5e3;
var RRF_K = 60;
var GRAPH_RRF_WEIGHTS = {
  // Connection density (how well connected a node is)
  density: 1,
  // Update time (how recently the node was modified)
  updateTime: 1.2,
  // Slightly higher weight for recency
  // Richness score (content quality indicator)
  richness: 0.8,
  // Open count (how often the user accesses this node)
  openCount: 0.9,
  // Last open time (how recently the user accessed this node)
  lastOpen: 0.7,
  // Similarity score (only for semantic neighbors, measures semantic closeness)
  similarity: 1.1
  // Higher weight for semantic relevance in BFS traversal
};
var PHYSICAL_CONNECTION_BONUS = 0.1;
var PATH_FINDING_CONSTANTS = {
  /**
   * Default number of iterations for hybrid path discovery.
   * Balances diversity and computational cost.
   * - 1st iteration: Finds most direct path
   * - 2nd iteration: Discovers one alternative path
   * - 3rd iteration: Provides additional exploration perspective
   */
  DEFAULT_ITERATIONS: 5,
  /**
   * Maximum hop limit to prevent semantic drift.
   * Limits path length to maintain result relevance and prevent excessive computation.
   */
  MAX_HOPS_LIMIT: 5
};
var KEY_NODES_RRF_K = 60;
var GRAPH_INSPECT_STEP_TIME_LIMIT = 1e4;
var RRF_RANKING_POOL_SIZE = 500;
var VAULT_DESCRIPTION_FILENAME = "vault-description.md";
var GLOBAL_TAG_CLOUD_TOP_TAGS_COUNT = 50;
var SLICE_CAPS = {
  hub: {
    /** Cluster / member path lists in hub discovery, assembly, YAML, and local graph. */
    clusterMemberPaths: 48,
    /** Hex prefix length for stable cluster id from SHA256 (and MD5 UUID grouping below). */
    clusterHashHexPrefix: 16,
    /** Merged folder + local-graph member path sample. */
    memberPathsMergedSample: 48,
    /** Weighted document paths in hub assembly from local graph nodes. */
    assemblyMemberPathsSample: 32,
    /** Wiki-style member list lines in hub markdown skeleton. */
    markdownMemberWikiLines: 24,
    /** `hub_cluster_members` frontmatter list length. */
    frontmatterClusterMembers: 48,
    /** Routes / cluster paths embedded in Hub LLM metadata JSON. */
    llmMetadataRoutes: 24,
    /** Member notes to read snippets from for Hub LLM excerpts. */
    llmClusterMemberSnippets: 6,
    /** Hub draft markdown body chars sent to LLM. */
    llmDraftBodyChars: 28e3,
    /** Paths processed per discover round. */
    discoverRoundPaths: 120,
    /** Top folder-prefix buckets in local hub graph coverage. */
    localGraphTopFolderPrefixes: 8,
    /** Boundary node ids in frontier summary. */
    localGraphBoundaryNodes: 48,
    /** Path segment depth for folder aggregation (e.g. `a/b`). */
    pathFolderSegmentParts: 2
  },
  indexing: {
    structuredChunkTop: 8
  },
  semanticEdges: {
    mermaidSafeLabel: 56,
    items: 14,
    nodeIdFallbackLabel: 12
  },
  aiSearch: {
    graphNodeLabels: 20,
    topicSources: 5,
    topicGraphLabels: 20,
    topicResults: 10
  },
  vaultDoc: {
    aiSearchAnalysisGraphNodes: 40,
    aiSearchAnalysisGraphEdges: 80
  },
  sqlite: {
    operationDescription: 500
  },
  utils: {
    logExpressionPreview: 80,
    chunkSlugFallback: 24,
    mermaidQuotedLabel: 80
  },
  modelId: {
    openaiPrefixSegments: 2,
    claudePrefixSegments: 3
  },
  date: {
    /** `toISOString().slice(0, n)` for `YYYY-MM-DD`. */
    isoDateChars: 10
  },
  /** Cumulative end indices for MD5 hex → UUID-style `8-4-4-4-12` grouping. */
  hash: {
    md5UuidSliceEnds: [8, 12, 16, 20, 32]
  },
  agent: {
    sourcePathsSample: 30,
    claimKey: 80,
    tacticalSummary: 400,
    dimensionIntent: 80,
    groupFocus: 200,
    sharedContext: 300,
    evidencePaths: 12,
    extractionTasks: 30,
    extractionFocus: 120,
    slotRecallDimensions: 10,
    summaryFacts: 500,
    docSimpleTitle: 80,
    suggestQuestions: 2,
    dashboardBlocks: 10,
    reportPlanMarkdown: 200
  },
  highlight: {
    fallbackShort: 200,
    fallbackLong: 220
  },
  inspector: {
    exploreFolderPaths: 2e3,
    pathFindQueueLevel: 5,
    pathFindHubs: 3,
    pathFindCommonParents: 3
  },
  searchWeb: {
    snippetShort: 200,
    snippetLong: 300
  },
  chat: {
    sourcesList: 10
  },
  graphViz: {
    candidatePathsToolbar: 30,
    candidatePathsPanel: 20,
    formatItems: 80,
    formatDocs: 80,
    formatEdges: 120,
    formatNodes: 60,
    debugTouchSample: 3,
    graphPatchFocus: 8,
    shortestPathNeighbors: 6,
    shortestPathDebugIds: 10
  },
  ui: {
    promptOptions: 20,
    resourcePreviewLines: 10,
    followupMarkdown: 300,
    followupAnswer: 200,
    tabSearchLabel: 48,
    saveAnalyzeMd: 120,
    knowledgeGraphItems: 120,
    searchPipelineBlocks: 12,
    sourcesSummaries: 3,
    sourcesFacts: 8,
    topicMenuSources: 6,
    analysisTitleSanitize: 80,
    analysisTitlePath: 200,
    analysisSearchText: 300,
    analysisSummary: 500,
    analysisSummaryInSearch: 400,
    analysisGraphNodes: 8,
    analysisSourcesSummary: 6,
    analysisBlocksSummary: 5,
    analysisNodeLabels: 30,
    analysisItemsPreview: 5,
    analysisBlockMarkdown: 200,
    analysisSourcesList: 10,
    analysisDisplayTitle: 48,
    analysisDisplayTitleTrim: 60
  },
  mocks: {
    mockTitle: 45,
    mockQuery: 50,
    mockQueryShort: 30,
    mockAIServiceSummary: 300,
    mockAIServiceTitle: 40
  },
  build: {
    esbuildLogInputs: 50
  }
};

// src/core/document/helper/TagService.ts
var import_v32 = require("zod/v3");

// src/service/prompt/PromptId.ts
var CONFIGURABLE_PROMPT_IDS = [
  // Chat summary prompts - users may want different models for summaries
  "conversation-summary-short" /* ConversationSummaryShort */,
  "conversation-summary-full" /* ConversationSummaryFull */,
  "project-summary-short" /* ProjectSummaryShort */,
  "project-summary-full" /* ProjectSummaryFull */,
  // Search prompts - users may want specialized models for search
  // AiAnalysis* prompts are in SEARCH_AI_ANALYSIS_PROMPT_IDS, not here
  "search-rerank-rank-gpt" /* SearchRerankRankGpt */,
  // Application prompts - title generation may benefit from different models
  "application-generate-title" /* ApplicationGenerateTitle */,
  // Memory/Profile prompts
  "memory-extract-candidates-json" /* MemoryExtractCandidatesJson */,
  // Prompt rewrite prompts
  "prompt-quality-eval-json" /* PromptQualityEvalJson */,
  "prompt-rewrite-with-library" /* PromptRewriteWithLibrary */,
  // Document analysis prompts - users may want different models for different document types
  "doc-summary" /* DocSummary */,
  "doc-summary-short" /* DocSummaryShort */,
  "doc-summary-full" /* DocSummaryFull */,
  "image-description" /* ImageDescription */,
  "image-summary" /* ImageSummary */,
  "folder-project-summary" /* FolderProjectSummary */,
  // Classify document type: principle, profile, index, daily, project, note, or other
  "doc-type-classify-json" /* DocTypeClassifyJson */,
  "doc-tag-generate-json" /* DocTagGenerateJson */,
  "hub-doc-summary" /* HubDocSummary */,
  "hub-discover-judge" /* HubDiscoverJudge */,
  "hub-discover-round-review" /* HubDiscoverRoundReview */
];

// src/core/utils/date-utils.ts
function humanReadableTime(timestamp) {
  const now = Date.now();
  const dateObj = new Date(timestamp);
  const nowDate = new Date(now);
  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const isBeforeToday = timestamp < today.getTime();
  if (isBeforeToday) {
    const diffMs = now - timestamp;
    const diffSeconds = Math.floor(diffMs / 1e3);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    if (diffDays < 7) {
      return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
    } else if (diffWeeks < 4) {
      return `${diffWeeks} ${diffWeeks === 1 ? "week" : "weeks"} ago`;
    } else if (diffMonths < 12) {
      return `${diffMonths} ${diffMonths === 1 ? "month" : "months"} ago`;
    } else {
      return "more than one year ago";
    }
  } else {
    const diffMs = now - timestamp;
    const diffSeconds = Math.floor(diffMs / 1e3);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffSeconds < 60) {
      return "just now";
    } else if (diffMinutes < 60) {
      return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
    } else {
      return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
    }
  }
}
function parseSemanticDateRange(semantic) {
  const now = /* @__PURE__ */ new Date();
  switch (semantic) {
    case "today": {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    case "yesterday": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - 1);
      return d;
    }
    case "this_week": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = d.getDay();
      d.setDate(d.getDate() - dayOfWeek);
      return d;
    }
    case "this_month": {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    case "last_3_months": {
      return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    }
    case "this_year": {
      return new Date(now.getFullYear(), 0, 1);
    }
    default: {
      throw new Error("Unknown semantic date filter: " + semantic);
    }
  }
}
function parseLooseTimestampToMs(value) {
  if (value == null) return void 0;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    if (value < 1e10) return Math.round(value * 1e3);
    return Math.round(value);
  }
  if (typeof value === "string") {
    const compact = parseInferCreatedAtStringToMs(value);
    if (compact !== void 0) return compact;
    const t = Date.parse(value.trim());
    if (!Number.isNaN(t)) return t;
  }
  return void 0;
}
function parseInferCreatedAtStringToMs(raw) {
  const s = raw.trim();
  if (!s) return void 0;
  const m = s.match(
    /^(\d{4})(\d{2})(\d{2})(?:[\sT]?(\d{2})(\d{2})(\d{2}))?$/
  );
  if (!m) return void 0;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return void 0;
  const hh = m[4] !== void 0 ? Number(m[4]) : 0;
  const mm = m[5] !== void 0 ? Number(m[5]) : 0;
  const ss = m[6] !== void 0 ? Number(m[6]) : 0;
  if (hh > 23 || mm > 59 || ss > 59) return void 0;
  const dt = new Date(y, mo - 1, d, hh, mm, ss, 0);
  const t = dt.getTime();
  return Number.isNaN(t) ? void 0 : t;
}

// src/core/schemas/agents/search-agent-schemas.ts
var import_v3 = require("zod/v3");

// src/core/utils/file-utils.ts
function normalizeFilePath(path3) {
  return path3.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}
function basenameFromPath(path3) {
  if (!path3) return "";
  const i = path3.lastIndexOf("/");
  return i >= 0 ? path3.slice(i + 1) : path3;
}
function folderPrefixOfPath(path3) {
  const i = path3.lastIndexOf("/");
  return i > 0 ? path3.slice(0, i) : "";
}
function getFileNameFromPath(path3) {
  const s = String(path3 ?? "").trim();
  return s.replace(/^\/+/, "").replace(/\/+$/, "").split("/").pop() ?? "";
}

// src/core/schemas/agents/search-agent-schemas.ts
var SEMANTIC_DIMENSION_IDS = [
  "essence_definition",
  "history_origin",
  "why_mechanism",
  "evidence_source",
  "pitfall_misconception",
  "how_method",
  "example_case",
  "options_comparison",
  "cost_risk_limit",
  "applicable_condition",
  "impact_consequence",
  "related_extension",
  "next_action",
  "trend_future",
  "tool_resource"
];
var AXIS_TOPOLOGY_ID = "inventory_mapping";
var AXIS_TEMPORAL_ID = "temporal_mapping";
var ALL_DIMENSION_IDS = [...SEMANTIC_DIMENSION_IDS, AXIS_TOPOLOGY_ID, AXIS_TEMPORAL_ID];
var semanticDimensionIdsEnum = import_v3.z.enum(SEMANTIC_DIMENSION_IDS).describe(
  `One of the 15 dimension ids, grouped as follows:

1. **Base (essence & origin)**
   - essence_definition: Core identity, definition, concept; "what it is". e.g. Define "first principle" as "decomposing from basic truths".
   - history_origin: Development, source, background; "where it came from". e.g. First principle from Aristotle, later popularized by Elon Musk.

2. **Causal (mechanism & verification)**
   - why_mechanism: Cause, mechanism, principle; "why". e.g. Information clutter reduces density due to cognitive switching cost.
   - evidence_source: Evidence, citation, supporting data; "what supports it". e.g. Cite Shannon information theory.
   - pitfall_misconception: Common pitfalls, misconceptions, traps. e.g. Mistaking that every problem needs all slots.

3. **Practice (method & example)**
   - how_method: Method, procedure, how-to; "how to do". e.g. Decompose: define first, then mechanism.
   - example_case: Examples, cases, stories; concrete illustration. e.g. Use "quantum computing" to demonstrate.

4. **Evaluation (options & cost)**
   - options_comparison: Alternatives, comparison, options; "what choices". e.g. Separate slots vs mixed.
   - cost_risk_limit: Cost, risk, limit, boundary, tradeoff. e.g. Too many slots fragments information.

5. **Context (applicability & impact)**
   - applicable_condition: Who it is for, when, scenario; "when to use". e.g. For complex decisions like AI prompt design.
   - impact_consequence: Impact, consequence, outcome; "what follows". e.g. Using slots can improve efficiency 20\u201340%.
   - related_extension: Related concepts, links, further reading. e.g. Link to "Chain of Thought" prompting.

6. **Action (future & resource)**
   - next_action: Next step, action suggestion; immediately actionable. e.g. Try slots on one problem.
   - trend_future: Trend, future, prediction, potential. e.g. In the AI era, slot frameworks may automate.
   - tool_resource: Tools, resources, books, software. e.g. Use Mind Maps to visualize dimensions.`
);
var scopeConstraintSchema = import_v3.z.object({
  path: import_v3.z.string().describe('Folder or file path to lock this dimension to; use "" when none.'),
  tags: import_v3.z.array(import_v3.z.string()).describe(
    "Topic tags and/or functional tags for recall; use [] when none. Prefer functional tags from the provided mapping."
  ),
  anchor_entity: import_v3.z.string().describe(
    'Main subject/entity this dimension is about; use "" when none. Agent 2 uses it as a retrieval hook.'
  )
}).nullable();
var semanticDimensionChoiceSchema = import_v3.z.object({
  id: semanticDimensionIdsEnum,
  intent_description: import_v3.z.string().min(1, "intent_description is required.").describe(
    'Concrete search task for this dimension: state what to search/retrieve in imperative form (e.g. "Search for notes that define X and list\u2026", "Find content comparing A with B\u2026"). Not a topic label or passive summary\u2014must read as an actionable retrieval instruction.'
  ),
  scope_constraint: scopeConstraintSchema.describe("Search scope for this dimension."),
  retrieval_orientation: import_v3.z.enum(["relational", "chronological", "statistical", "categorical"]).nullable().describe(
    "Retrieval tendency: relational (links/paths), chronological (recent/history), statistical (data), categorical (definitions/tags). Use null when no preference."
  )
});
var topologyDimensionChoiceSchema = import_v3.z.object({
  intent_description: import_v3.z.string().min(1).describe(
    'Only WHAT to scan and WHERE. No WHY (e.g. no "for comparison", "to evaluate"). MUST include "regardless of status or quality" and "list ALL items to ensure no omission". Forbidden: quality/success filters (successful, good, relevant, best).'
  ),
  scope_constraint: scopeConstraintSchema.describe(
    "Physical boundary. Path is the most stable anchor; tags are valid as navigation/dimension. When using tags, prefer user-mentioned or vault-known names to avoid empty results."
  )
});
var temporalDimensionChoiceSchema = import_v3.z.object({
  intent_description: import_v3.z.string().min(1).describe("Goal: compare recent vs historical change/evolution."),
  scope_constraint: scopeConstraintSchema
});
var USER_APPEAL_TYPES = [
  "cognitive_learning",
  "task_instrumental",
  "emotional_resonance",
  "identity_validation",
  "risk_aversion",
  "inspiration_perspective",
  "existential_meaning",
  "control_framework",
  "moral_tribal"
];
var queryClassifierOutputSchema = import_v3.z.object({
  /** Semantic depth axis: one or more of the 15 dimension ids. */
  semantic_dimensions: import_v3.z.array(semanticDimensionChoiceSchema).min(1).describe(
    "Semantic axis. One or more dimension targets. Same id may repeat with different intent_description. Each may have scope_constraint and retrieval_orientation."
  ),
  /** Topology breadth axis: inventory/audit (full list), not semantic search. Required; use [] when point-type only. */
  topology_dimensions: import_v3.z.array(topologyDimensionChoiceSchema).min(1).describe(
    "Topology axis: physical inventory of entities under path/tag. List-first, no quality filter. Empty array only if query is strictly point-type (single entity), not surface-type (collection)."
  ),
  /** Temporal dynamic axis: change/evolution comparison. Required; use [] when not applicable. */
  temporal_dimensions: import_v3.z.array(temporalDimensionChoiceSchema).min(1).describe(
    "Temporal axis. Zero or more temporal_mapping targets. Empty array if no change/trend/evolution intent."
  ),
  user_persona_config: import_v3.z.object({
    appeal: import_v3.z.enum(USER_APPEAL_TYPES).nullable().describe("User appeal type."),
    detail_level: import_v3.z.enum(["concise", "comprehensive", "technical"]).nullable().describe("Output detail level; use null for default.")
  }).nullable().describe("Global preference for summary style only."),
  is_cross_domain: import_v3.z.boolean().describe(
    "When true, Agent 2 may break out of scope_constraint to correlate across the whole vault."
  )
});
var dimensionChoiceSchema = import_v3.z.object({
  id: import_v3.z.enum(ALL_DIMENSION_IDS),
  intent_description: import_v3.z.string().min(1),
  scope_constraint: scopeConstraintSchema,
  retrieval_orientation: import_v3.z.enum(["relational", "chronological", "statistical", "categorical"]).nullable(),
  output_format: import_v3.z.enum(["list", "tree"]).nullable(),
  mustIncludeKeywords: import_v3.z.array(import_v3.z.string()).nullable()
});
var physicalSearchTaskSchema = import_v3.z.object({
  unified_intent: import_v3.z.string().min(1).describe('Synthesized search instruction (not a keyword list): one imperative retrieval mission that merges the intent_description of all covered dimensions. Same style as dimension intent\u2014e.g. "Search for notes that define X, compare alternatives, and state applicable conditions and trends."'),
  covered_dimension_ids: import_v3.z.array(import_v3.z.enum(ALL_DIMENSION_IDS)).min(1).describe("Logical dimension ids that this task will feed; results are mapped back to each."),
  search_priority: import_v3.z.number().int().min(0).describe("Execution order; lower = higher priority."),
  scope_constraint: scopeConstraintSchema.describe("Merged path/tags/anchor for this task; use intersection or dominant scope of covered dimensions.")
});
var searchArchitectOutputSchema = import_v3.z.object({
  physical_tasks: import_v3.z.array(physicalSearchTaskSchema).min(1).describe("Physical recon tasks; each runs once and results map to covered_dimension_ids.")
});
var defaultClassify = {
  semantic_dimensions: [
    {
      id: "essence_definition",
      intent_description: "Semantic axis: Focuses on the core subject, concept, or content being queried. Used for \u201Cwhat is/topic/content\u201D type questions and summarization of main points or purposes.",
      scope_constraint: null,
      retrieval_orientation: null
    }
  ],
  topology_dimensions: [
    {
      intent_description: 'Topological breadth axis: Determines whether the query targets a "point" (a specific entity) or a "surface" (a set or collection). If it involves collections (such as all/list/directory/relationships), the Inventory_Mapping dimension is activated to enumerate all relevant entities/paths (highest priority).',
      scope_constraint: null
    }
  ],
  temporal_dimensions: [
    {
      intent_description: 'Spatiotemporal dynamics axis: Determines if the query concerns "change/recent/evolution/comparison/trend". If so, the Delta_Comparison dimension is activated to focus on differences, versions, or historical shifts.',
      scope_constraint: null
    }
  ],
  user_persona_config: {
    appeal: "cognitive_learning",
    detail_level: "comprehensive"
  },
  is_cross_domain: false
};
var battlefieldAssessmentSchema = import_v3.z.object({
  search_density: import_v3.z.enum(["High", "Medium", "Low"]).nullable(),
  match_quality: import_v3.z.enum(["Exact", "Fuzzy", "None"]).nullable(),
  suggestion: import_v3.z.string().max(400).nullable().describe("Short hint for evidence phase; ~50 words max")
});
var submitReconPathsSchema = import_v3.z.object({
  paths: import_v3.z.array(import_v3.z.string()).describe("Full set of in-scope, relevant paths from that tool result (no sample/subset). Prefer one call; if splitting, use large batches (e.g. 100-200).")
});
var rawSearchReportSchema = import_v3.z.object({
  tactical_summary: import_v3.z.string().max(2e3).describe("Short summary or compact manifest; max 300 words. Prefer signal over length."),
  discovered_leads: import_v3.z.array(import_v3.z.string()).describe("Paths or entity names for deeper evidence collection. No fixed maximum; include all relevant items for this dimension; prefer comprehensive coverage."),
  battlefield_assessment: battlefieldAssessmentSchema.nullable()
});
var leadStrategySchema = import_v3.z.object({
  must_expand_prefixes: import_v3.z.array(import_v3.z.string()).describe('Folder path prefixes to expand to full file list (e.g. "kb2-learn-prd/B-2-\u521B\u610F\u548C\u60F3\u6CD5\u7BA1\u7406/A-All Ideas/"). Code will list every file under each prefix.'),
  include_path_regex: import_v3.z.array(import_v3.z.string()).nullable().describe("Optional: include only paths matching any of these regexes (applied to vault paths). Use null when not needed."),
  exclude_path_regex: import_v3.z.array(import_v3.z.string()).nullable().describe("Optional: exclude paths matching any of these regexes. Use null when not needed."),
  max_expand_results: import_v3.z.number().min(1).max(1e4).nullable().describe("Cap total paths from expansion (default 5000). Use null for default.")
});
var searchPlanItemSchema = import_v3.z.object({
  scope_path: import_v3.z.string().describe('Folder path to search within (e.g. "kb2-learn-prd/B-2-\u521B\u610F\u548C\u60F3\u6CD5\u7BA1\u7406/").'),
  query: import_v3.z.string().describe("Search query (keywords or semantic description)."),
  search_mode: import_v3.z.enum(["fulltext", "vector", "hybrid"]).nullable().describe("Search mode. Use null for default fulltext."),
  top_k: import_v3.z.number().min(1).max(200).nullable().describe("Max results. Use null for default 80.")
});
var pathSubmitOutputSchema = import_v3.z.object({
  tactical_summary: import_v3.z.string().max(2e3).describe("Short summary or compact inventory from this round; max 300 words."),
  battlefield_assessment: battlefieldAssessmentSchema.nullable(),
  lead_strategy: leadStrategySchema.nullable().describe("How to acquire paths by expanding folders and/or filtering vault paths by regex. Use null when not needed."),
  search_plan: import_v3.z.array(searchPlanItemSchema).nullable().describe("Scoped searches to run; code will execute each and collect result paths. Use null when not needed."),
  discovered_leads: import_v3.z.array(import_v3.z.string()).max(20).nullable().describe("At most 20 scattered .md file paths only. Do not list images, excalidraw, or paths under must_expand_prefixes (those are auto-expanded). Use null when not needed."),
  /** When true, recon loop ends after this round; system will generate the final report. Set from battlefield + coverage assessment. */
  should_submit_report: import_v3.z.boolean().describe("True when coverage is complete, round budget is reached, or further exploration adds no new leads; false to continue next round.")
});
var evidenceFactSchema = import_v3.z.object({
  claim: import_v3.z.string().describe("One-sentence claim from the source"),
  quote: import_v3.z.string().describe("Exact quote supporting the claim"),
  confidence: import_v3.z.enum(["high", "medium", "low"]).nullable()
});
var evidencePackSchema = import_v3.z.object({
  origin: import_v3.z.object({
    tool: import_v3.z.string().describe("Tool that produced this source (e.g. content_reader, local_search)"),
    path_or_url: import_v3.z.string().describe("File path or URL of the source")
  }),
  summary: import_v3.z.string().nullable().describe("Short summary of this pack"),
  facts: import_v3.z.array(evidenceFactSchema).describe("1\u20135 facts with claim+quote"),
  snippet: import_v3.z.object({ type: import_v3.z.enum(["extract", "condensed"]), content: import_v3.z.string() }).nullable().describe("Key excerpt from source")
});
var submitEvidencePackInputSchema = import_v3.z.object({
  packs: import_v3.z.array(evidencePackSchema).min(1).max(12).describe("3\u20138 evidence packs; each with origin, facts, optional snippet")
});
var markTaskCompletedInputSchema = import_v3.z.object({
  taskId: import_v3.z.string().describe("ID of the task that is now completed")
});
var consolidatedTaskSchema = import_v3.z.object({
  path: import_v3.z.string(),
  relevant_dimension_ids: import_v3.z.array(
    /** Consolidator: one path, which dimensions need it, synthesized focus, priority. taskId assigned by runner. */
    import_v3.z.object({
      id: import_v3.z.enum(ALL_DIMENSION_IDS),
      intent: import_v3.z.string().describe("From original dimension intent_description or merged extraction intent")
    })
  ),
  extraction_focus: import_v3.z.string().describe("Synthesized focus for Evidence Agent for this file"),
  priority: import_v3.z.enum(["Crucial", "Secondary"]).describe("Crucial if 3+ dimensions need it; Secondary or drop if marginal"),
  task_load: import_v3.z.enum(["high", "medium", "low"]).nullable().describe("For grouping and concurrency")
});
var consolidatorOutputSchema = import_v3.z.object({
  consolidated_tasks: import_v3.z.array(consolidatedTaskSchema),
  global_recon_insight: import_v3.z.string().describe("up to 500 words summary of current recon state")
});
var groupContextItemSchema = import_v3.z.object({
  topic_anchor: import_v3.z.string().describe("Unified theme for this group of files"),
  group_focus: import_v3.z.string().describe("Instruction for Evidence Agent: what to compare and dig for when reading these files")
});
var setGroupContextInputSchema = import_v3.z.object({
  group_index: import_v3.z.number().int().min(0).describe("0-based index of the group"),
  topic_anchor: import_v3.z.string().describe("Unified theme for this group of files"),
  group_focus: import_v3.z.string().describe("Instruction for Evidence Agent: what to compare and dig for")
});
var groupContextRefinementOutputSchema = import_v3.z.object({
  groups: import_v3.z.array(groupContextItemSchema).describe("One item per input group, same order")
});
var FUNCTIONAL_TAG_CORE = [
  "current_state",
  "goal_intent",
  "constraint",
  "resource",
  "skill_stack",
  "past_attempt",
  "idea_candidate",
  "decision_opinion"
];
var FUNCTIONAL_TAG_ENHANCEMENT = [
  "timeline_event",
  "external_context",
  "emotion_attitude",
  "evidence_data"
];
var FUNCTIONAL_TAG_IDS = [...FUNCTIONAL_TAG_CORE, ...FUNCTIONAL_TAG_ENHANCEMENT];
var SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS = {
  essence_definition: ["current_state", "idea_candidate"],
  history_origin: ["timeline_event", "external_context", "past_attempt"],
  why_mechanism: ["goal_intent", "constraint", "evidence_data", "decision_opinion"],
  evidence_source: ["evidence_data"],
  pitfall_misconception: ["constraint", "past_attempt"],
  how_method: ["skill_stack", "idea_candidate"],
  example_case: ["idea_candidate", "evidence_data"],
  options_comparison: ["decision_opinion", "idea_candidate"],
  cost_risk_limit: ["constraint", "resource"],
  applicable_condition: ["current_state", "external_context", "constraint"],
  impact_consequence: ["decision_opinion", "evidence_data", "current_state"],
  related_extension: ["external_context", "idea_candidate"],
  next_action: ["past_attempt", "idea_candidate", "resource", "goal_intent"],
  trend_future: ["timeline_event", "external_context"],
  tool_resource: ["resource", "skill_stack"]
};
var suggestedFollowUpQuestionsSchema = import_v3.z.object({
  questions: import_v3.z.array(import_v3.z.string()).describe("Follow-up questions the user might ask next")
});
var OVERVIEW_NODE_KINDS = ["nucleus", "decision", "fact", "heuristic"];
var OVERVIEW_EDGE_RELATIONS = ["cause", "prerequisite", "conflict", "feedback", "correlate", "synergy"];
var OVERVIEW_NODES_MIN = 6;
var OVERVIEW_NODES_MAX = 12;
var overviewLogicModelNucleusSchema = import_v3.z.object({
  nodeIndex: import_v3.z.number().int().min(0).describe("Index of the nucleus node in the nodes array (0-based); Mermaid phase will assign id N1, N2, ... by order"),
  statement: import_v3.z.string().describe("Core tension or central claim"),
  hiddenOpposition: import_v3.z.string().nullable().describe("Implicit opposite (e.g. cost vs benefit)")
});
var overviewLogicModelNodeSchema = import_v3.z.object({
  label: import_v3.z.string().max(60).describe("Short display label"),
  kind: import_v3.z.enum(OVERVIEW_NODE_KINDS),
  importance: import_v3.z.number().min(0).max(10),
  confidence: import_v3.z.enum(["high", "medium", "low"]),
  sourceRefs: import_v3.z.array(import_v3.z.string()).describe("Fact refs e.g. F1, F2 or source ids"),
  clusterId: import_v3.z.string().nullable()
});
var overviewLogicModelEdgeSchema = import_v3.z.object({
  fromIndex: import_v3.z.number().int().min(0),
  toIndex: import_v3.z.number().int().min(0),
  relation: import_v3.z.enum(OVERVIEW_EDGE_RELATIONS),
  label: import_v3.z.string().max(40),
  rationaleFactRefs: import_v3.z.array(import_v3.z.string()).nullable()
});
var overviewLogicModelClusterSchema = import_v3.z.object({
  id: import_v3.z.string(),
  title: import_v3.z.string().max(30),
  nodeIndices: import_v3.z.array(import_v3.z.number().int().min(0))
});
var overviewLogicModelTimelineSchema = import_v3.z.object({
  phases: import_v3.z.array(import_v3.z.object({
    phaseId: import_v3.z.string(),
    label: import_v3.z.string(),
    nodeIndices: import_v3.z.array(import_v3.z.number().int().min(0))
  })).nullable()
}).nullable();
var overviewLogicModelSchema = import_v3.z.object({
  nucleus: overviewLogicModelNucleusSchema,
  nodes: import_v3.z.array(overviewLogicModelNodeSchema).min(OVERVIEW_NODES_MIN).max(OVERVIEW_NODES_MAX),
  edges: import_v3.z.array(overviewLogicModelEdgeSchema),
  clusters: import_v3.z.array(overviewLogicModelClusterSchema).nullable(),
  timeline: overviewLogicModelTimelineSchema
}).superRefine((data, ctx) => {
  const hasConflictOrFeedback = data.edges.some((e) => e.relation === "conflict" || e.relation === "feedback");
  if (!hasConflictOrFeedback) {
    ctx.addIssue({
      code: import_v3.z.ZodIssueCode.custom,
      message: 'At least one edge must have relation "conflict" or "feedback". Rescan evidence for tensions or loops.'
    });
  }
  const n = data.nodes.length;
  if (data.nucleus.nodeIndex >= n) {
    ctx.addIssue({
      code: import_v3.z.ZodIssueCode.custom,
      message: `nucleus.nodeIndex ${data.nucleus.nodeIndex} must be < nodes.length (${n}).`
    });
  }
  for (const e of data.edges) {
    if (e.fromIndex >= n || e.toIndex >= n) {
      ctx.addIssue({
        code: import_v3.z.ZodIssueCode.custom,
        message: `Edge fromIndex ${e.fromIndex} toIndex ${e.toIndex} must be < nodes.length (${n}).`
      });
      break;
    }
  }
  for (const c of data.clusters ?? []) {
    for (const i of c.nodeIndices) {
      if (i >= n) {
        ctx.addIssue({
          code: import_v3.z.ZodIssueCode.custom,
          message: `Cluster ${c.id} nodeIndex ${i} must be < nodes.length (${n}).`
        });
        break;
      }
    }
  }
});
var needMoreDashboardBlocksInputSchema = import_v3.z.object({
  reason: import_v3.z.string().describe("The reason why we need more dashboard blocks.")
});
var TOPICS_PLAN_MAX = 50;
var BLOCK_PLAN_MAX = 12;
var dashboardUpdatePlanSchema = import_v3.z.object({
  topicsPlan: import_v3.z.array(import_v3.z.string()).max(TOPICS_PLAN_MAX).nullable().describe("5-50 short topic instructions; avoid exhaustive lists"),
  blockPlan: import_v3.z.array(import_v3.z.string()).max(BLOCK_PLAN_MAX).nullable().describe("3-12 block instructions"),
  note: import_v3.z.string().nullable()
});
var submitTopicsPlanInputSchema = import_v3.z.object({
  plan: import_v3.z.array(import_v3.z.string()).max(8).describe("5\u20138 topic instructions; theme synthesis, not isolated topics.")
}).describe("Each plan describes a topic to be created or updated.");
var submitBlocksPlanInputSchema = import_v3.z.object({
  plan: import_v3.z.array(import_v3.z.string()).describe(
    "Block instructions. Each string MUST reference Confirmed Facts by index (e.g. 'Based on Fact #3 and #5') and, when the block needs vault content, include the data source path or a clear lookup hint so the Blocks agent can call_search_agent."
  )
}).describe("Submit the blocks update plan with evidence binding and optional source paths.");
var REPORT_PLAN_PHASE_IDS = [
  "intent_insight",
  "summary_spec",
  "overview_mermaid",
  "topics",
  "body_intent_insight",
  "body_scqa",
  "body_methodology",
  "body_insight_pillar",
  "body_recommendations_roadmap",
  "body_risks_dependencies",
  "body_next_actions",
  "body_followup_questions",
  "appendices",
  "actions_todo_list",
  "actions_followup_questions"
];
var REPORT_PLAN_BODY_PHASE_IDS = REPORT_PLAN_PHASE_IDS.filter(
  (id) => id.startsWith("body_")
);
var submitReportPhaseInputSchema = import_v3.z.object({
  phaseId: import_v3.z.string().describe(
    "Current section phase id (chapter). Same phase can be submitted multiple times for multiple pages; use status to control when to advance."
  ),
  planMarkdown: import_v3.z.string().min(1).describe(
    "Plan for this page/slide of the section: purpose, output shape, evidence binding, word/structural constraints, citation format. One page per call."
  ),
  dependencies: import_v3.z.array(import_v3.z.string()).nullable().describe("BlockIds, Fact #N, or SourceIDs this section depends on."),
  status: import_v3.z.enum(["draft", "final"]).nullable().default("final").describe(
    "Use 'draft' to submit another page for the same phase (you receive the same phaseId again). Use 'final' when this phase has no more pages (you receive the next phase)."
  )
});
var bodyBlockSpecSchema = import_v3.z.object({
  blockId: import_v3.z.string().describe("Stable id for this block (no colons); used for (#block-<id>) anchors."),
  title: import_v3.z.string().describe("Block display title."),
  role: import_v3.z.string().describe("Role: e.g. SCQA, methodology, pillar, recommendations, risks, next_actions, followup_questions."),
  paragraphSkeleton: import_v3.z.string().nullable().describe("SCQA or narrative skeleton; bullet/paragraph structure."),
  evidenceBinding: import_v3.z.string().nullable().describe("Fact #N, [[path]], or SourceID binding rules."),
  chartOrTableShape: import_v3.z.string().nullable().describe("Table headers or mermaid diagram type + node/label hints."),
  risksUncertaintyHint: import_v3.z.string().nullable().describe("Gaps, assumptions, or uncertainty to surface."),
  wordTarget: import_v3.z.number().nullable().describe("Target word count (e.g. 300-500).")
});
var appendicesBlockSpecSchema = import_v3.z.object({
  blockId: import_v3.z.string(),
  title: import_v3.z.string(),
  role: import_v3.z.string().describe("e.g. data_tables, sensitivity_analysis, methodology_deep_dive, glossary, references."),
  contentHint: import_v3.z.string().nullable().describe("What to include; surprise-high markers if applicable.")
});
var reportPlanSchema = import_v3.z.object({
  intentInsight: import_v3.z.string().nullable().describe("One paragraph: user subtext, assumed context, success criteria, confidence."),
  summarySpec: import_v3.z.string().nullable().describe("Constraints: ~1000 words, answer-first, key recommendations, 3-5 rationale bullets, so-what impact, block anchors."),
  overviewMermaidSpec: import_v3.z.string().nullable().describe("Top 10 core nodes; diagram type; node naming and citation rules."),
  topicsSpec: import_v3.z.string().nullable().describe("3-6 MECE pillars; one conclusion + why + block refs per pillar."),
  bodyBlocksSpec: import_v3.z.array(bodyBlockSpecSchema).nullable().default([]),
  appendicesBlocksSpec: import_v3.z.array(appendicesBlockSpecSchema).nullable().default([]),
  actionItemsSpec: import_v3.z.string().nullable().describe("TODO list rules from evidence next_action / implicitly suggested."),
  followupQuestionsSpec: import_v3.z.string().nullable().describe("High-value follow-up rules: fill gaps, blind spots, alternatives."),
  sourcesViewsSpec: import_v3.z.string().nullable().describe("List / graph / evidence cards generation; reuse SourcesSection where possible.")
});
var visualTaskTypeSchema = import_v3.z.enum([
  "compare",
  "trend",
  "composition",
  "distribution",
  "relationship",
  "hierarchy",
  "process",
  "roadmap",
  "table",
  "network",
  "other"
]);
var mermaidDiagramTypeSchema = import_v3.z.enum([
  "flowchart",
  "mindmap",
  "timeline",
  "gantt",
  "quadrantChart",
  "pie",
  "xyChart",
  "treemap",
  "other"
]);
var visualDiagramPrescriptionSchema = import_v3.z.object({
  diagramType: mermaidDiagramTypeSchema.describe("Mermaid diagram type."),
  reason: import_v3.z.string().nullable().describe("Why this chart; guideline reference."),
  dataMapping: import_v3.z.string().nullable().describe("X/category, Y/size, or axis mapping."),
  mermaidDirectiveCard: import_v3.z.string().nullable().describe("Short instruction for section agent: syntax + constraints.")
});
var audiencePrecisionSchema = import_v3.z.enum(["scan", "analyst"]);
var visualDataTypeSchema = import_v3.z.enum(["qualitative", "quantitative", "mixed"]);
var visualPrescriptionSchema = import_v3.z.object({
  blockId: import_v3.z.string().describe("Stable block id from report plan."),
  title: import_v3.z.string().describe("Block display title."),
  audiencePrecision: audiencePrecisionSchema.nullable().describe("Who consumes: scan or analyst."),
  dataType: visualDataTypeSchema.nullable().describe("Qualitative, quantitative, or mixed."),
  needVisual: import_v3.z.boolean().describe("Whether this block should include a diagram."),
  primary: visualDiagramPrescriptionSchema.nullable().describe("Main diagram prescription."),
  secondary: visualDiagramPrescriptionSchema.nullable().describe("Optional second diagram."),
  warnings: import_v3.z.array(import_v3.z.string()).nullable().describe("e.g. avoid pie, prefer bar; qualitative \u2192 mindmap.")
});
var reportVisualBlueprintSchema = import_v3.z.object({
  blocks: import_v3.z.array(visualPrescriptionSchema).default([]).describe("Per-block prescriptions."),
  globalStyleNotes: import_v3.z.string().nullable().describe("Global diversity/consistency notes.")
});
var submitPrescriptionInputSchema = import_v3.z.object({
  blockId: import_v3.z.string().describe("Current block id."),
  title: import_v3.z.string().nullable().describe("Block title."),
  prescriptionMarkdown: import_v3.z.string().nullable().describe("Human-readable prescription."),
  prescription: visualPrescriptionSchema.nullable().describe("Structured prescription."),
  status: import_v3.z.enum(["draft", "final"]).nullable().default("final").describe("final = done with this block, advance to next.")
});
var DEFAULT_PLACEHOLDER = "Untitled";
var NO_MEANINGFUL_CONTENT_MESSAGE = "has no meaningful content, discarding";
var overviewMermaidInputSchema = import_v3.z.preprocess(
  (val) => typeof val === "object" && val !== null && "input" in val && typeof val.input === "string" ? val.input : val,
  import_v3.z.string().describe(
    "Raw Mermaid diagram code (e.g. flowchart TD\\n  A[label] --> B[label])"
  )
);
var updateSourceScoresInputSchema = import_v3.z.object({
  scores: import_v3.z.array(
    import_v3.z.object({
      sourceId: import_v3.z.string().describe("Source id or path to match"),
      score: import_v3.z.number().min(0).max(100).describe("Relevance score 0-100; 0 for low relevance")
    })
  ).describe("Source-score pairs to batch update")
});
var DASHBOARD_BLOCK_CONTENT_SCHEMAS = {
  MARKDOWN: import_v3.z.object({
    renderEngine: import_v3.z.literal("MARKDOWN"),
    markdown: import_v3.z.string().min(1, "Markdown content is required for MARKDOWN engine")
  }),
  MERMAID: import_v3.z.object({
    renderEngine: import_v3.z.literal("MERMAID"),
    mermaidCode: import_v3.z.string().min(1, "Mermaid code is required for MERMAID engine")
  }),
  TILE: import_v3.z.object({
    renderEngine: import_v3.z.literal("TILE"),
    items: import_v3.z.array(
      import_v3.z.object({
        id: import_v3.z.string().default(
          () => `item:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        ),
        title: import_v3.z.string().default(DEFAULT_PLACEHOLDER),
        description: import_v3.z.string().nullable(),
        icon: import_v3.z.string().nullable(),
        color: import_v3.z.string().nullable()
      })
    ).min(1, "Items are required for TILE engine").describe(
      'Items of the block. It will be displayed in the UI. eg: "item1", "item2", etc.'
    )
  }),
  ACTION_GROUP: import_v3.z.object({
    renderEngine: import_v3.z.literal("ACTION_GROUP"),
    items: import_v3.z.array(
      import_v3.z.object({
        id: import_v3.z.string().default(
          () => `item:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        ),
        title: import_v3.z.string().default(DEFAULT_PLACEHOLDER),
        description: import_v3.z.string().nullable(),
        icon: import_v3.z.string().nullable(),
        color: import_v3.z.string().nullable()
      })
    ).min(1, "Items are required for ACTION_GROUP engine").describe(
      "Action items: next steps, experiments, or TODOs. Same shape as TILE items."
    )
  })
};
var BlockContentSchema = import_v3.z.discriminatedUnion("renderEngine", [
  DASHBOARD_BLOCK_CONTENT_SCHEMAS.MARKDOWN,
  DASHBOARD_BLOCK_CONTENT_SCHEMAS.MERMAID,
  DASHBOARD_BLOCK_CONTENT_SCHEMAS.TILE,
  DASHBOARD_BLOCK_CONTENT_SCHEMAS.ACTION_GROUP
]);
var topicItemSchema = import_v3.z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const o = raw;
    const label = o.label ?? o.name ?? o.title;
    return { ...o, label: label ? String(label).trim() : void 0 };
  },
  import_v3.z.object({
    label: import_v3.z.string().default(DEFAULT_PLACEHOLDER),
    weight: import_v3.z.number().min(0).max(1).nullable().describe(
      "How important this topic is. eg: 0.5, 0.75, 1.0"
    ),
    suggestQuestions: import_v3.z.array(import_v3.z.string()).nullable().describe(
      'Suggested questions to ask about this topic. Please provide at least 3 questions. at most 5 questions. Each question should be a single sentence no more than 10 words.eg: "What is the main idea of the topic?"'
    )
  }).superRefine((data, ctx) => {
    if ((!data.label || data.label === DEFAULT_PLACEHOLDER) && data.weight === void 0) {
      ctx.addIssue({
        code: import_v3.z.ZodIssueCode.custom,
        message: NO_MEANINGFUL_CONTENT_MESSAGE
      });
    }
  })
);
var DEFAULT_NODE_TYPE = "cosmo";
var FILE_NODE_TYPE = /* @__PURE__ */ new Set(["file", "document", "doc"]);
var OTHER_NODE_TYPE = /* @__PURE__ */ new Set([
  DEFAULT_NODE_TYPE,
  "concept",
  "tag",
  "topic"
]);
var RECOMMENDED_TYPES = /* @__PURE__ */ new Set([
  ...Array.from(OTHER_NODE_TYPE),
  ...Array.from(FILE_NODE_TYPE)
]);
function humanizeNodeLabel(raw) {
  if (!raw || typeof raw !== "string") return raw;
  let s = raw.trim();
  if (!s) return s;
  if (s.toLowerCase().startsWith("node_")) s = s.slice(5).trim();
  s = s.replace(/[_\u2013\u2014-]+/g, " ").replace(/\s+/g, " ").trim();
  return s || raw;
}
function looksLikeFilePath(path3) {
  if (!path3 || typeof path3 !== "string") return false;
  const p = path3.trim();
  return p.includes("/") || /\.(md|markdown)$/i.test(p);
}
function stripTypedPrefixForDisplay(text) {
  if (!text || typeof text !== "string") return text;
  const s = text.trim();
  const lower = s.toLowerCase();
  const prefixes = [
    "file:",
    "concept:",
    "tag:",
    "topic:",
    "cosmo:",
    "node:",
    "document:"
  ];
  for (const p of prefixes) {
    if (lower.startsWith(p)) {
      return s.slice(p.length).replace(/^-+|\s+/g, " ").trim() || s;
    }
  }
  return s;
}
var normalizeSpecialKey = (raw) => {
  const text = String(raw ?? "").trim().toLowerCase();
  return text.replace(/[_\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
};
var toNormalizedCosmoNodeId = (type, idOrPath) => `${type}:${normalizeSpecialKey(idOrPath)}`;
var isPlaceholder = (s) => !s || s.trim() === "" || s === DEFAULT_PLACEHOLDER || s === "Untitled";
var graphNodeItemSchema = import_v3.z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const o = raw;
    const type = o.type ?? o.nodeType;
    const label = o.label ?? o.nodeName ?? o.title;
    return {
      ...o,
      type: type ? String(type).trim() : void 0,
      label: label ? String(label).trim() : void 0
    };
  },
  import_v3.z.object({
    id: import_v3.z.string().nullable(),
    type: import_v3.z.string().default(DEFAULT_NODE_TYPE).describe(
      `Type of the node. Recommended: ${Array.from(RECOMMENDED_TYPES).join(", ")}. You can also use custom types if appropriate.`
    ),
    label: import_v3.z.string().default(DEFAULT_PLACEHOLDER).describe(
      "The label of the node. It will be displayed in the graph."
    ),
    path: import_v3.z.string().nullable().describe(
      `${FILE_NODE_TYPE.size > 0 ? Array.from(FILE_NODE_TYPE).join(", ") : "document"} nodes must have a valid path.`
    ),
    attributes: import_v3.z.record(import_v3.z.any()).default(() => ({})).describe(
      "Attributes of the node. It will be used to store the node's metadata. User can see this via a hover tooltip."
    )
  })
).transform((data) => {
  const d = data;
  if (d.path && !isPlaceholder(String(d.path)) && looksLikeFilePath(d.path)) {
    d.type = "file";
  }
  if (FILE_NODE_TYPE.has(d.type)) {
    if (!d.path || isPlaceholder(String(d.path ?? ""))) {
      const attrsPath = d?.attributes?.path;
      const derivedPath = attrsPath && !isPlaceholder(String(attrsPath)) ? attrsPath : (() => {
        const rawId = String(d.id ?? "").trim();
        if (rawId.startsWith("file:")) {
          const pathFromId = rawId.slice("file:".length).replace(/^\/+/, "").trim();
          if (pathFromId && !isPlaceholder(pathFromId))
            return pathFromId;
        }
        return null;
      })();
      if (derivedPath) d.path = derivedPath;
    }
  }
  if (isPlaceholder(String(d.label ?? ""))) {
    const normalizedPath = normalizeFilePath(
      d.path ?? ""
    );
    const basename = normalizedPath.split("/").filter(Boolean).pop() ?? normalizedPath;
    const displayName = basename.replace(/\.(md|markdown)$/i, "") || basename;
    d.label = displayName;
  }
  if (d.label && d.label !== DEFAULT_PLACEHOLDER && d.label !== "Untitled") {
    d.label = humanizeNodeLabel(d.label);
  }
  const findFileNodeType = Array.from(FILE_NODE_TYPE).find(
    (type) => d.id && String(d.id).startsWith(type + ":")
  );
  if (findFileNodeType) {
    d.id = toNormalizedCosmoNodeId(
      "file",
      String(d.id).slice(findFileNodeType.length + 1)
    );
  } else {
    const findOtherNodeType = Array.from(OTHER_NODE_TYPE).find(
      (type) => d.id && String(d.id).startsWith(type + ":")
    );
    if (findOtherNodeType) {
      d.id = toNormalizedCosmoNodeId(
        findOtherNodeType,
        String(d.id).slice(findOtherNodeType.length + 1)
      );
    }
  }
  const fallbackId = toNormalizedCosmoNodeId(
    FILE_NODE_TYPE.has(d.type) ? "file" : d.type,
    d.path ? normalizeFilePath(d.path) : d.label
  );
  if (!d.id || d.id === DEFAULT_PLACEHOLDER) d.id = fallbackId;
  let displayTitle = stripTypedPrefixForDisplay(
    String(d.label ?? d.id ?? "")
  );
  if (FILE_NODE_TYPE.has(d.type) && displayTitle && (displayTitle.includes("/") || /\.(md|markdown)$/i.test(displayTitle))) {
    const base = displayTitle.split("/").filter(Boolean).pop() ?? displayTitle;
    displayTitle = base.replace(/\.(md|markdown)$/i, "") || base;
  }
  d.title = displayTitle || d.label || d.id;
  return d;
}).superRefine((data, ctx) => {
  const type = data.type;
  if (FILE_NODE_TYPE.has(type)) {
    if (!data.path || isPlaceholder(String(data.path ?? ""))) {
      ctx.addIssue({
        code: import_v3.z.ZodIssueCode.custom,
        message: "Document/file nodes must have a valid path.",
        path: ["path"]
      });
      return;
    }
  } else if (type === "concept" || type === "tag") {
    if (data.path === DEFAULT_PLACEHOLDER || data.path === "Untitled")
      data.path = void 0;
    const rawLabel = String(data.label || "").trim();
    if (isPlaceholder(rawLabel)) {
      ctx.addIssue({
        code: import_v3.z.ZodIssueCode.custom,
        message: "Concept/tag nodes must have a non-empty label or title (not Untitled).",
        path: ["label"]
      });
      return;
    }
  }
  if (data.label === DEFAULT_PLACEHOLDER && (!data.path || data.path === DEFAULT_PLACEHOLDER) && (!data.attributes || Object.keys(data.attributes).length === 0)) {
    ctx.addIssue({
      code: import_v3.z.ZodIssueCode.custom,
      message: NO_MEANINGFUL_CONTENT_MESSAGE
    });
  }
});
var graphEdgeItemSchema = import_v3.z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const o = raw;
    const source = o.source ?? o.sourceId ?? o.startNode ?? o.from_node_id;
    const target = o.target ?? o.targetId ?? o.endNode ?? o.to_node_id;
    return {
      ...o,
      source: source ? String(source).trim() : void 0,
      target: target ? String(target).trim() : void 0
    };
  },
  import_v3.z.object({
    id: import_v3.z.string().default(
      () => `edge:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    ),
    source: import_v3.z.string().nullable().describe("The source node id or path."),
    target: import_v3.z.string().nullable().describe("The target node id or path."),
    type: import_v3.z.string().default("link").describe(
      "The type of the edge. Recommended: physical_link, semantic_link, inspire, brainstorm, etc."
    ),
    label: import_v3.z.string().default("").describe(
      "The label of the edge. It will be displayed in the graph."
    ),
    attributes: import_v3.z.record(import_v3.z.any()).default(() => ({})).describe(
      "Attributes of the edge. It will be used to store the edge's metadata. User can see this via a hover tooltip."
    )
  }).refine((data) => data.source && data.target, {
    message: "source and target are required",
    path: ["source"]
  })
);
var sourceItemSchema = import_v3.z.object({
  id: import_v3.z.string().default(
    () => `src:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  ),
  title: import_v3.z.string().default(DEFAULT_PLACEHOLDER),
  path: import_v3.z.string().default(DEFAULT_PLACEHOLDER).describe(
    "The path of the source. It will be used to open the source in the file explorer."
  ),
  reasoning: import_v3.z.string().default(DEFAULT_PLACEHOLDER).describe(
    "Why it was selected or rejected. Please provide a detailed explanation. but no more than 100 words."
  ),
  badges: import_v3.z.array(import_v3.z.string()).default(() => []).describe(
    'Badges of the source. It will be used to display the source in the UI. eg: "important", "relevant", "interesting", etc. but please use your imagination to create more badges.'
  ),
  score: import_v3.z.preprocess(
    (val) => {
      if (typeof val === "number")
        return { average: val, physical: val, semantic: val };
      if (val && typeof val === "object") {
        const o = val;
        const avg = o.average ?? 0;
        return {
          physical: o.physical ?? avg,
          semantic: o.semantic ?? avg,
          average: avg
        };
      }
      return val;
    },
    import_v3.z.object({
      physical: import_v3.z.number().min(0).max(100).nullable(),
      semantic: import_v3.z.number().min(0).max(100).nullable(),
      average: import_v3.z.number().min(0).max(100).nullable()
    }).nullable()
  )
}).superRefine((data, ctx) => {
  if (data.title === DEFAULT_PLACEHOLDER && (!data.path || data.path === DEFAULT_PLACEHOLDER) && (!data.reasoning || data.reasoning === DEFAULT_PLACEHOLDER) && (!data.badges || data.badges.length === 0)) {
    ctx.addIssue({
      code: import_v3.z.ZodIssueCode.custom,
      message: NO_MEANINGFUL_CONTENT_MESSAGE
    });
  }
});
var dashboardBlockItemSchema = import_v3.z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const o = raw;
    const title = o.title != null ? String(o.title).trim() : void 0;
    let engine = String(o.renderEngine ?? "MARKDOWN").toUpperCase();
    let markdown = o.markdown != null ? String(o.markdown).trim() : "";
    const summary = o.summary != null ? String(o.summary).trim() : "";
    const topics = Array.isArray(o.topics) ? o.topics : [];
    if (engine === "MARKDOWN" && !markdown) {
      if (summary) markdown = summary;
      if (topics.length > 0) {
        const bulletLines = topics.map((t) => {
          const tObj = t;
          const label = tObj?.label ?? tObj?.name ?? tObj?.title ?? String(t);
          return `- ${typeof label === "string" ? label : String(label)}`;
        });
        markdown = markdown ? `${markdown}

${bulletLines.join("\n")}` : bulletLines.join("\n");
      }
      if (!markdown && title) markdown = title;
      if (!markdown) markdown = "Content not yet generated.";
    }
    return {
      ...o,
      title: title ?? void 0,
      renderEngine: engine,
      markdown: markdown || void 0
    };
  },
  import_v3.z.intersection(
    import_v3.z.object({
      id: import_v3.z.string().default(
        () => `block:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      ),
      title: import_v3.z.string().nullable().describe("The title of the block. It will be displayed."),
      weight: import_v3.z.number().min(0).max(10).nullable().describe(
        "Used for grid layout. 0-10; 1-3 small, 4-6 medium, 7-10 full-width."
      )
    }),
    BlockContentSchema
  )
);

// src/core/document/helper/TagService.ts
var functionalSet = new Set(FUNCTIONAL_TAG_IDS);
var EMPTY_TAGS_BLOB = {
  topicTags: [],
  functionalTagEntries: [],
  keywordTags: [],
  timeTags: [],
  geoTags: [],
  personTags: []
};
var CONTEXT_LABEL_PATTERN = {
  time: /^Time[A-Z][a-zA-Z0-9_]*$/,
  geo: /^Geo[A-Z][a-zA-Z0-9_]*$/,
  person: /^Person[A-Z][a-zA-Z0-9_]*$/
};
var MAX_CONTEXT_TAGS_PER_AXIS = 8;
var MAX_FUNCTIONAL_LABEL_LEN = 240;
var MAX_TOPIC_ID_LEN = 120;
var MAX_TOPIC_LABEL_LEN = 240;
function sanitizeContextTagsForAxis(axis, labels) {
  const re = CONTEXT_LABEL_PATTERN[axis];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of labels) {
    const s = String(raw).trim();
    if (!s || !re.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_CONTEXT_TAGS_PER_AXIS) break;
  }
  return out;
}
function graphKeywordTagsForMobius(meta2) {
  if (meta2.userKeywordTags !== void 0) return meta2.userKeywordTags;
  return meta2.keywordTags ?? [];
}
function encodeIndexedTagsBlob(blob) {
  const {
    topicTags,
    topicTagEntries,
    functionalTagEntries,
    keywordTags,
    userKeywordTags,
    textrankKeywordTerms,
    timeTags,
    geoTags,
    personTags
  } = blob;
  if (!topicTags.length && !(topicTagEntries?.length ?? 0) && !functionalTagEntries.length && !keywordTags.length && !(userKeywordTags?.length ?? 0) && !(textrankKeywordTerms?.length ?? 0) && !timeTags.length && !geoTags.length && !personTags.length) {
    return null;
  }
  const payload = {
    topicTags,
    functionalTagEntries,
    keywordTags,
    timeTags,
    geoTags,
    personTags
  };
  if (topicTagEntries?.length) {
    payload.topicTagEntries = topicTagEntries;
  }
  if (userKeywordTags?.length) {
    payload.userKeywordTags = userKeywordTags;
  }
  if (textrankKeywordTerms?.length) {
    payload.textrankKeywordTerms = textrankKeywordTerms;
  }
  return JSON.stringify(payload);
}
function asStrArr(v) {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}
function parseTopicTagEntriesFromUnknown(topicTagEntriesRaw, legacyTopicTags) {
  const fromObjects = [];
  if (Array.isArray(topicTagEntriesRaw)) {
    const seen = /* @__PURE__ */ new Set();
    for (const item of topicTagEntriesRaw) {
      if (!item || typeof item !== "object") continue;
      const o = item;
      const id = String(o.id ?? "").trim().slice(0, MAX_TOPIC_ID_LEN);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const labelRaw = o.label;
      const label = typeof labelRaw === "string" ? labelRaw.trim().slice(0, MAX_TOPIC_LABEL_LEN) : "";
      fromObjects.push(label ? { id, label } : { id });
    }
    if (fromObjects.length) return fromObjects;
  }
  const legacy = asStrArr(legacyTopicTags).map((s) => s.trim().slice(0, MAX_TOPIC_ID_LEN)).filter(Boolean);
  return legacy.map((id) => ({ id }));
}
function parseFunctionalTagEntriesFromUnknown(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item;
    const id = String(o.id ?? "").trim();
    if (!id || !functionalSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    const labelRaw = o.label;
    const label = typeof labelRaw === "string" ? labelRaw.trim().slice(0, MAX_FUNCTIONAL_LABEL_LEN) : "";
    out.push(label ? { id, label } : { id });
  }
  return out;
}
function decodeIndexedTagsBlob(raw) {
  if (raw == null || raw === "") {
    return { ...EMPTY_TAGS_BLOB };
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        topicTags: parsed.map(String).filter(Boolean),
        functionalTagEntries: [],
        keywordTags: [],
        timeTags: [],
        geoTags: [],
        personTags: []
      };
    }
    if (parsed && typeof parsed === "object") {
      const o = parsed;
      const fromObjects = parseFunctionalTagEntriesFromUnknown(o.functionalTagEntries);
      const legacyIds = asStrArr(o.functionalTags).filter((id) => functionalSet.has(id));
      const functionalTagEntries = fromObjects.length > 0 ? fromObjects : legacyIds.map((id) => ({ id }));
      const topicTagEntries = parseTopicTagEntriesFromUnknown(o.topicTagEntries, o.topicTags);
      const topicIds = topicTagEntries.map((e) => e.id);
      const keywordTags = asStrArr(o.keywordTags);
      const userKw = o.userKeywordTags !== void 0 ? asStrArr(o.userKeywordTags) : void 0;
      const trKw = o.textrankKeywordTerms !== void 0 ? asStrArr(o.textrankKeywordTerms) : void 0;
      return {
        topicTags: topicIds.length ? topicIds : asStrArr(o.topicTags),
        topicTagEntries: topicTagEntries.length ? topicTagEntries : void 0,
        functionalTagEntries,
        keywordTags,
        ...userKw !== void 0 ? { userKeywordTags: userKw } : {},
        ...trKw !== void 0 ? { textrankKeywordTerms: trKw } : {},
        timeTags: asStrArr(o.timeTags),
        geoTags: asStrArr(o.geoTags),
        personTags: asStrArr(o.personTags)
      };
    }
  } catch {
  }
  return { ...EMPTY_TAGS_BLOB };
}
function filterValidTopicTagEntries(entries) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const e of entries) {
    const id = typeof e?.id === "string" ? e.id.trim().slice(0, MAX_TOPIC_ID_LEN) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = typeof e.label === "string" ? e.label.trim().slice(0, MAX_TOPIC_LABEL_LEN) : "";
    out.push(label ? { id, label } : { id });
    if (out.length >= 12) break;
  }
  return out;
}
function filterValidFunctionalTagEntries(entries) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const e of entries) {
    if (!e?.id || !functionalSet.has(e.id)) continue;
    const id = e.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const label = typeof e.label === "string" ? e.label.trim().slice(0, MAX_FUNCTIONAL_LABEL_LEN) : "";
    out.push(label ? { id, label } : { id });
  }
  return out;
}
var functionalTagEntrySchema = import_v32.z.object({
  id: import_v32.z.enum(FUNCTIONAL_TAG_IDS),
  label: import_v32.z.string().max(MAX_FUNCTIONAL_LABEL_LEN).optional()
});
var topicTagEntrySchema = import_v32.z.object({
  id: import_v32.z.string().max(MAX_TOPIC_ID_LEN),
  label: import_v32.z.string().max(MAX_TOPIC_LABEL_LEN).optional()
});
var docTagResponseSchema = import_v32.z.object({
  topicTagEntries: import_v32.z.array(topicTagEntrySchema).max(12).default([]),
  /** @deprecated LLM may still return plain strings; mapped to `{ id }` when topicTagEntries is empty. */
  topicTags: import_v32.z.array(import_v32.z.string()).max(12).optional(),
  functionalTagEntries: import_v32.z.array(functionalTagEntrySchema).max(5).default([]),
  timeTags: import_v32.z.array(import_v32.z.string()).max(12).default([]),
  geoTags: import_v32.z.array(import_v32.z.string()).max(12).default([]),
  personTags: import_v32.z.array(import_v32.z.string()).max(12).default([]),
  /**
   * Best estimate of first authorship / event start. Prefer compact text: `yyyyMMdd` or `yyyyMMdd HHmmss`
   * (24h). Omit or null if unknown.
   */
  inferCreatedAt: import_v32.z.string().max(48).optional().nullable()
});
function buildDimensionFunctionalHintsTable() {
  const lines = [];
  for (const dim of SEMANTIC_DIMENSION_IDS) {
    const hints = SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS[dim];
    lines.push(`- ${dim}: ${hints.join(", ")}`);
  }
  return lines.join("\n");
}
async function extractTopicAndFunctionalTags(text, ai, options) {
  const empty = {
    topicTagEntries: [],
    topicTags: [],
    functionalTagEntries: [],
    timeTags: [],
    geoTags: [],
    personTags: []
  };
  if (!text.trim()) {
    return empty;
  }
  const functionalHintsTable = buildDimensionFunctionalHintsTable();
  const variables = {
    content: text,
    title: options?.title ?? "",
    existingTopicTags: options?.existingTopicTags?.length ? options.existingTopicTags.join(", ") : "",
    existingUserTags: options?.existingUserTags?.trim() ?? "",
    ...options?.textrankKeywords?.trim() ? { textrankKeywords: options.textrankKeywords.trim() } : {},
    ...options?.textrankSentences?.trim() ? { textrankSentences: options.textrankSentences.trim() } : {},
    functionalHintsTable,
    functionalTagList: FUNCTIONAL_TAG_IDS.join(", ")
  };
  let normalized;
  try {
    normalized = await ai.streamObjectWithPrompt(
      "doc-tag-generate-json" /* DocTagGenerateJson */,
      variables,
      docTagResponseSchema,
      options?.provider && options?.modelId ? { provider: options.provider, modelId: options.modelId } : void 0
    );
  } catch {
    return empty;
  }
  let inferCreatedAtMs;
  if (normalized.inferCreatedAt != null && String(normalized.inferCreatedAt).trim()) {
    const raw = String(normalized.inferCreatedAt).trim();
    inferCreatedAtMs = parseInferCreatedAtStringToMs(raw) ?? parseLooseTimestampToMs(raw);
  }
  const fromLlmObjects = normalized.topicTagEntries.map((e) => ({
    id: e.id,
    ...e.label ? { label: e.label } : {}
  }));
  const legacyStrings = (normalized.topicTags ?? []).map((id) => ({ id }));
  const topicTagEntries = filterValidTopicTagEntries(
    fromLlmObjects.length > 0 ? fromLlmObjects : legacyStrings
  );
  const topicTags = topicTagEntries.map((e) => e.id);
  return {
    topicTagEntries,
    topicTags,
    functionalTagEntries: filterValidFunctionalTagEntries(normalized.functionalTagEntries),
    timeTags: sanitizeContextTagsForAxis("time", normalized.timeTags),
    geoTags: sanitizeContextTagsForAxis("geo", normalized.geoTags),
    personTags: sanitizeContextTagsForAxis("person", normalized.personTags),
    ...inferCreatedAtMs !== void 0 ? { inferCreatedAtMs } : {}
  };
}

// src/core/storage/sqlite/SqliteStoreManager.ts
var import_path = __toESM(require("path"));

// src/core/storage/sqlite/ddl.ts
function migrateSqliteSchema(db) {
  const tryExec = (sql4) => {
    try {
      db.exec(sql4);
    } catch (error) {
      if (sql4.includes("vec_embeddings")) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[DDL] Failed to create vec_embeddings virtual table. Vector similarity search will not be available. This requires sqlite-vec extension to be loaded. Error: ${errorMsg}`
        );
        return;
      }
    }
  };
  db.exec(`
		CREATE TABLE IF NOT EXISTS index_state (
			key TEXT PRIMARY KEY,
			value TEXT
		);
		CREATE TABLE IF NOT EXISTS embedding (
			id TEXT PRIMARY KEY,
			doc_id TEXT NOT NULL,
			chunk_id TEXT,
			chunk_index INTEGER,
			chunk_type TEXT,
			content_hash TEXT NOT NULL,
			ctime INTEGER NOT NULL,
			mtime INTEGER NOT NULL,
			embedding BLOB NOT NULL,
			embedding_model TEXT NOT NULL,
			embedding_len INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_embedding_doc_id ON embedding(doc_id);
		CREATE INDEX IF NOT EXISTS idx_embedding_chunk_id ON embedding(chunk_id);
		CREATE INDEX IF NOT EXISTS idx_embedding_content_hash ON embedding(content_hash);
		CREATE TABLE IF NOT EXISTS user_profile_processed_hash (
			content_hash TEXT PRIMARY KEY,
			processed_at INTEGER NOT NULL
		);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS doc_chunk (
			chunk_id TEXT PRIMARY KEY,
			doc_id TEXT NOT NULL,
			chunk_index INTEGER NOT NULL,
			chunk_type TEXT NOT NULL DEFAULT 'body_raw',
			chunk_meta_json TEXT,
			title TEXT,
			mtime INTEGER,
			content_raw TEXT,
			content_fts_norm TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_doc_chunk_doc_id ON doc_chunk(doc_id);
		CREATE INDEX IF NOT EXISTS idx_doc_chunk_doc_id_chunk ON doc_chunk(doc_id, chunk_index);
	`);
  tryExec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
			chunk_id UNINDEXED,
			doc_id UNINDEXED,
			content
		);
	`);
  tryExec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS doc_meta_fts USING fts5(
			doc_id UNINDEXED,
			path,
			title
		);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS chat_project (
			project_id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			folder_rel_path TEXT NOT NULL UNIQUE,
			created_at_ts INTEGER NOT NULL,
			updated_at_ts INTEGER NOT NULL,
			archived_rel_path TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_project_folder_path ON chat_project(folder_rel_path);
		CREATE INDEX IF NOT EXISTS idx_chat_project_updated_at ON chat_project(updated_at_ts);
		CREATE TABLE IF NOT EXISTS chat_conversation (
			conversation_id TEXT PRIMARY KEY,
			project_id TEXT,
			title TEXT NOT NULL,
			file_rel_path TEXT NOT NULL UNIQUE,
			created_at_ts INTEGER NOT NULL,
			updated_at_ts INTEGER NOT NULL,
		active_model TEXT,
		active_provider TEXT,
		token_usage_total INTEGER,
		title_manually_edited INTEGER NOT NULL DEFAULT 0,
		title_auto_updated INTEGER NOT NULL DEFAULT 0,
		context_last_updated_ts INTEGER,
		context_last_message_index INTEGER,
		archived_rel_path TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_conversation_project_id ON chat_conversation(project_id);
		CREATE INDEX IF NOT EXISTS idx_chat_conversation_file_path ON chat_conversation(file_rel_path);
		CREATE INDEX IF NOT EXISTS idx_chat_conversation_updated_at ON chat_conversation(updated_at_ts);
		CREATE TABLE IF NOT EXISTS chat_message (
			message_id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL,
			role TEXT NOT NULL,
			content_hash TEXT,
			created_at_ts INTEGER NOT NULL,
			created_at_zone TEXT,
			model TEXT,
			provider TEXT,
			starred INTEGER NOT NULL DEFAULT 0,
			is_error INTEGER NOT NULL DEFAULT 0,
			is_visible INTEGER NOT NULL DEFAULT 1,
			gen_time_ms INTEGER,
			token_usage_json TEXT,
			thinking TEXT,
			content_preview TEXT,
			attachment_summary TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_message_conversation_id ON chat_message(conversation_id);
		CREATE INDEX IF NOT EXISTS idx_chat_message_created_at ON chat_message(created_at_ts);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS chat_message_resource (
			id TEXT PRIMARY KEY,
			message_id TEXT NOT NULL,
			source TEXT NOT NULL,
			kind TEXT,
			summary_note_rel_path TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_message_resource_message_id ON chat_message_resource(message_id);
		CREATE TABLE IF NOT EXISTS chat_star (
			source_message_id TEXT PRIMARY KEY,
			id TEXT NOT NULL,
			conversation_id TEXT NOT NULL,
			project_id TEXT,
			created_at_ts INTEGER NOT NULL,
			active INTEGER NOT NULL DEFAULT 1
		);
		CREATE INDEX IF NOT EXISTS idx_chat_star_active ON chat_star(active);
		CREATE INDEX IF NOT EXISTS idx_chat_star_conversation_id ON chat_star(conversation_id);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS ai_analysis_record (
			id TEXT PRIMARY KEY,
			vault_rel_path TEXT NOT NULL UNIQUE,
			query TEXT,
			title TEXT,
			created_at_ts INTEGER NOT NULL,
			web_enabled INTEGER NOT NULL DEFAULT 0,
			estimated_tokens INTEGER,
			sources_count INTEGER,
			topics_count INTEGER,
			graph_nodes_count INTEGER,
			graph_edges_count INTEGER,
			duration INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_ai_analysis_record_created_at ON ai_analysis_record(created_at_ts);
		CREATE INDEX IF NOT EXISTS idx_ai_analysis_record_vault_path ON ai_analysis_record(vault_rel_path);
	`);
  tryExec(`ALTER TABLE ai_analysis_record ADD COLUMN duration INTEGER`);
  tryExec(`ALTER TABLE ai_analysis_record DROP COLUMN meta_json`);
  tryExec(`ALTER TABLE ai_analysis_record ADD COLUMN title TEXT`);
  tryExec(`ALTER TABLE ai_analysis_record ADD COLUMN analysis_preset TEXT`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS mobius_node (
			node_id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			label TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			infer_created_at INTEGER,
			updated_at INTEGER NOT NULL,
			last_open_ts INTEGER,
			open_count INTEGER,
			path TEXT UNIQUE,
			title TEXT,
			size INTEGER,
			mtime INTEGER,
			ctime INTEGER,
			content_hash TEXT,
			summary TEXT,
			tags_json TEXT,
			word_count INTEGER,
			char_count INTEGER,
			language TEXT,
			richness_score REAL,
			doc_incoming_cnt INTEGER,
			doc_outgoing_cnt INTEGER,
			other_incoming_cnt INTEGER,
			other_outgoing_cnt INTEGER,
			tag_doc_count INTEGER,
			pagerank REAL,
			pagerank_updated_at INTEGER,
			pagerank_version INTEGER,
			semantic_pagerank REAL,
			semantic_pagerank_updated_at INTEGER,
			semantic_pagerank_version INTEGER,
			attributes_json TEXT NOT NULL DEFAULT '{}'
		);
		CREATE INDEX IF NOT EXISTS idx_mobius_node_type_node_id ON mobius_node(type, node_id);
		CREATE INDEX IF NOT EXISTS idx_mobius_node_path ON mobius_node(path);
		CREATE INDEX IF NOT EXISTS idx_mobius_node_updated_at ON mobius_node(updated_at);
		CREATE TABLE IF NOT EXISTS mobius_edge (
			id TEXT PRIMARY KEY,
			from_node_id TEXT NOT NULL,
			to_node_id TEXT NOT NULL,
			type TEXT NOT NULL,
			label TEXT,
			weight REAL NOT NULL DEFAULT 1.0,
			attributes_json TEXT NOT NULL DEFAULT '{}',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_from_type ON mobius_edge(from_node_id, type);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_to_type ON mobius_edge(to_node_id, type);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_type_to ON mobius_edge(type, to_node_id);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_from_to_type ON mobius_edge(from_node_id, to_node_id, type);
		CREATE TABLE IF NOT EXISTS mobius_operation (
			id TEXT PRIMARY KEY,
			operation_type TEXT NOT NULL,
			operation_desc TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			related_kind TEXT,
			related_id TEXT,
			important_level INTEGER,
			continuous_group_id TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_mobius_operation_created_at ON mobius_operation(created_at);
		CREATE INDEX IF NOT EXISTS idx_mobius_operation_type_created_at ON mobius_operation(operation_type, created_at);
		CREATE INDEX IF NOT EXISTS idx_mobius_operation_group ON mobius_operation(continuous_group_id);
	`);
}

// src/core/storage/sqlite/better-sqlite3-adapter/BetterSqliteStore.ts
var import_kysely = require("kysely");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var CustomSqliteDriver = class {
  constructor(adapter) {
    this.adapter = adapter;
  }
  async init() {
  }
  async acquireConnection() {
    return {
      executeQuery: this.executeQuery.bind(this),
      streamQuery: this.streamQuery.bind(this)
    };
  }
  async beginTransaction() {
    this.adapter.exec("BEGIN TRANSACTION");
  }
  async commitTransaction() {
    this.adapter.exec("COMMIT");
  }
  async rollbackTransaction() {
    this.adapter.exec("ROLLBACK");
  }
  async releaseConnection() {
  }
  async destroy() {
  }
  async executeQuery(compiledQuery) {
    const { sql: sql4, parameters } = compiledQuery;
    const stmt = this.adapter.prepare(sql4);
    let result;
    if (parameters && parameters.length > 0) {
      if (stmt.reader) {
        result = stmt.all(...parameters);
      } else {
        result = stmt.run(...parameters);
      }
    } else {
      if (stmt.reader) {
        result = stmt.all();
      } else {
        result = stmt.run();
      }
    }
    if (Array.isArray(result)) {
      return {
        rows: result,
        insertId: void 0,
        numAffectedRows: void 0
      };
    } else {
      return {
        rows: [],
        insertId: result.lastInsertRowid ? BigInt(result.lastInsertRowid) : void 0,
        numAffectedRows: result.changes ? BigInt(result.changes) : void 0
      };
    }
  }
  async *streamQuery(compiledQuery, chunkSize) {
    const result = await this.executeQuery(compiledQuery);
    if (result.rows && Array.isArray(result.rows)) {
      if (chunkSize && chunkSize > 0) {
        for (let i = 0; i < result.rows.length; i += chunkSize) {
          const chunk2 = result.rows.slice(i, i + chunkSize);
          yield { ...result, rows: chunk2 };
        }
      } else {
        yield result;
      }
    } else {
      yield result;
    }
  }
};
var CustomSqliteDialect = class {
  constructor(db) {
    this.db = db;
  }
  createDriver() {
    return new CustomSqliteDriver({
      exec: (sql4) => this.db.exec(sql4),
      prepare: (sql4) => this.db.prepare(sql4)
    });
  }
  createQueryCompiler() {
    return new import_kysely.SqliteQueryCompiler();
  }
  createAdapter() {
    return new import_kysely.SqliteAdapter();
  }
  createIntrospector(db) {
    return new import_kysely.SqliteIntrospector(db);
  }
};
var BetterSqliteStore = class _BetterSqliteStore {
  static {
    // Cache for better-sqlite3 module if successfully loaded
    this.cachedBetterSqlite3 = null;
  }
  /**
   * Clear the cached better-sqlite3 module.
   * Call from plugin onunload to release memory.
   */
  static clearInstance() {
    _BetterSqliteStore.cachedBetterSqlite3 = null;
  }
  constructor(db) {
    this.db = db;
    this.kyselyInstance = new import_kysely.Kysely({
      dialect: new CustomSqliteDialect(db)
    });
  }
  /**
   * Check if better-sqlite3 is available and working.
   * 
   * Note: In Obsidian (Electron) environment, better-sqlite3 may fail to load
   * if the native module (.node file) is not compatible with Electron's Node.js version.
   * 
   * @param app - Obsidian app instance (optional, used for vault path resolution)
   * @returns Promise resolving to true if better-sqlite3 is available and working
   */
  static async checkAvailable(app) {
    try {
      let betterSqlite3;
      try {
        betterSqlite3 = require("better-sqlite3");
      } catch (requireError) {
        console.warn(
          "[BetterSqliteStore] Failed to require better-sqlite3. Trying to load from possible paths...",
          "Error message:",
          requireError.message,
          "Code:",
          requireError.code
        );
        if (requireError.code === "MODULE_NOT_FOUND") {
          const possiblePaths = _BetterSqliteStore.getPossiblePaths(app);
          for (const modulePath of possiblePaths) {
            betterSqlite3 = _BetterSqliteStore.loadFromPath(modulePath);
            if (betterSqlite3) {
              console.log(`[BetterSqliteStore] Loaded better-sqlite3 from: ${modulePath}`);
              break;
            }
          }
          if (!betterSqlite3) {
            console.warn(
              [
                "[BetterSqliteStore] better-sqlite3 is not installed or not accessible.",
                `Tried paths: ${JSON.stringify(possiblePaths)}`,
                "To use better-sqlite3:",
                "1. Navigate to: .obsidian/plugins/obsidian-peak-assistant/",
                "2. Run: npm install better-sqlite3",
                "3. Rebuild for Electron (see README.md for details)",
                "better-sqlite3 is required for this plugin."
              ].join("\n")
            );
            return false;
          }
        } else {
          return false;
        }
      }
      const Database = betterSqlite3.default || betterSqlite3;
      if (typeof Database !== "function") {
        console.warn("[BetterSqliteStore] better-sqlite3 is not a function");
        return false;
      }
      try {
        const testDb = new Database(":memory:");
        testDb.close();
        console.debug("[BetterSqliteStore] better-sqlite3 native module is working");
        _BetterSqliteStore.cachedBetterSqlite3 = betterSqlite3;
        return true;
      } catch (error) {
        console.warn(
          "[BetterSqliteStore] better-sqlite3 module found but native binding failed. This is usually because the native module is missing or incompatible with Electron's Node.js version. To fix: Rebuild better-sqlite3 for Electron using electron-rebuild. See src/core/storage/README.md for detailed instructions. better-sqlite3 is required for this plugin.",
          error
        );
        return false;
      }
    } catch (error) {
      console.warn("[BetterSqliteStore] Unexpected error checking better-sqlite3:", error);
      return false;
    }
  }
  /**
   * Get possible paths to better-sqlite3 module.
   * Tries multiple strategies to find the plugin's node_modules directory.
   */
  static getPossiblePaths(app) {
    const paths = [];
    if (app) {
      const basePath = app.vault.adapter?.basePath;
      if (basePath) {
        paths.push(path.join(basePath, ".obsidian", "plugins", "obsidian-peak-assistant", "node_modules", "better-sqlite3"));
      }
    }
    if (typeof process !== "undefined" && process.cwd) {
      const cwd = process.cwd();
      if (cwd && cwd !== "/") {
        paths.push(path.join(cwd, "node_modules", "better-sqlite3"));
      }
    }
    if (typeof process !== "undefined" && process.env) {
      if (process.env.HOME) {
        paths.push(path.join(process.env.HOME, ".obsidian", "plugins", "obsidian-peak-assistant", "node_modules", "better-sqlite3"));
      }
      if (process.env.USERPROFILE) {
        paths.push(path.join(process.env.USERPROFILE, ".obsidian", "plugins", "obsidian-peak-assistant", "node_modules", "better-sqlite3"));
      }
    }
    return paths;
  }
  /**
   * Load better-sqlite3 from a specific path.
   * Returns the module if successful, null otherwise.
   */
  static loadFromPath(modulePath) {
    try {
      const packageJsonPath = path.join(modulePath, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        return null;
      }
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      const mainFile = packageJson.main || "index.js";
      const mainPath = path.join(modulePath, mainFile);
      if (fs.existsSync(mainPath)) {
        return require(mainPath);
      }
    } catch (error) {
    }
    return null;
  }
  /**
   * Dynamically load better-sqlite3 module.
   * 
   * Priority:
   * 1. Use cached module (if available)
   * 2. Try normal require (works if node_modules is in require path)
   * 3. Try loading from require.cache (if already loaded)
   * 4. Try loading from absolute paths (fallback)
   */
  static loadBetterSqlite3(app) {
    if (_BetterSqliteStore.cachedBetterSqlite3) {
      console.debug("[BetterSqliteStore] Using cached better-sqlite3");
      return _BetterSqliteStore.cachedBetterSqlite3;
    }
    try {
      const module2 = require("better-sqlite3");
      _BetterSqliteStore.cachedBetterSqlite3 = module2;
      return module2;
    } catch (requireError) {
      if (typeof require !== "undefined" && require.cache) {
        for (const modulePath in require.cache) {
          if (modulePath.includes("better-sqlite3") && modulePath.includes("node_modules")) {
            const cachedModule = require.cache[modulePath];
            if (cachedModule && cachedModule.exports) {
              const exports2 = cachedModule.exports;
              let Database = null;
              if (typeof exports2 === "function") {
                Database = exports2;
              } else if (exports2 && typeof exports2 === "object") {
                Database = exports2.default || exports2.Database;
              }
              if (Database && typeof Database === "function") {
                const module2 = { default: Database, Database };
                _BetterSqliteStore.cachedBetterSqlite3 = module2;
                console.debug(`[BetterSqliteStore] Using better-sqlite3 from require.cache: ${modulePath}`);
                return module2;
              }
            }
          }
        }
      }
      if (requireError.code === "MODULE_NOT_FOUND") {
        const possiblePaths = _BetterSqliteStore.getPossiblePaths(app);
        for (const modulePath of possiblePaths) {
          const betterSqlite3 = _BetterSqliteStore.loadFromPath(modulePath);
          if (betterSqlite3) {
            _BetterSqliteStore.cachedBetterSqlite3 = betterSqlite3;
            console.debug(`[BetterSqliteStore] Loaded better-sqlite3 from: ${modulePath}`);
            return betterSqlite3;
          }
        }
        throw new Error(
          "better-sqlite3 is not installed or not accessible. Please install it in the plugin directory: .obsidian/plugins/obsidian-peak-assistant/ Run: npm install better-sqlite3"
        );
      }
      throw requireError;
    }
  }
  /**
   * Open a new database connection.
   * 
   * @param params - Database parameters
   * @param params.dbFilePath - Path to the SQLite database file
   * @returns Promise resolving to object with store instance and sqliteVecAvailable flag
   * @throws Error if better-sqlite3 native module cannot be loaded
   */
  static async open(params) {
    const BetterSqlite3 = _BetterSqliteStore.loadBetterSqlite3(params.app);
    const Database = BetterSqlite3.default || BetterSqlite3;
    let db;
    try {
      db = new Database(params.dbFilePath, {
        // Enable WAL mode for better concurrency
        // This is the default, but we make it explicit
      });
      try {
        db.pragma("wal_checkpoint(TRUNCATE)");
        console.debug("[BetterSqliteStore] Initial WAL checkpoint completed");
      } catch (checkpointError) {
        console.warn("[BetterSqliteStore] Initial WAL checkpoint failed:", checkpointError);
      }
    } catch (error) {
      if (error instanceof Error && (error.message.includes("indexOf") || error.message.includes("bindings"))) {
        throw new Error(
          `better-sqlite3 native module failed to load. This usually means the .node file is missing or incompatible. Please ensure better-sqlite3 is properly installed in the plugin directory, Install and rebuild better-sqlite3 in the plugin directory. Original error: ${error.message}`
        );
      }
      throw error;
    }
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    try {
      const walCheckpoint = db.pragma("wal_checkpoint(TRUNCATE)");
      console.debug("[BetterSqliteStore] WAL checkpoint result:", walCheckpoint);
    } catch (error) {
      console.warn("[BetterSqliteStore] WAL checkpoint failed (may be normal):", error);
    }
    const sqliteVecAvailable = _BetterSqliteStore.tryLoadSqliteVec(db, params.app);
    migrateSqliteSchema(db);
    return { store: new _BetterSqliteStore(db), sqliteVecAvailable };
  }
  /**
   * Finds the path to sqlite-vec extension file.
   * Tries getLoadablePath() first, then falls back to manual path resolution.
   */
  static findSqliteVecExtensionPath(sqliteVec, app) {
    if (sqliteVec.getLoadablePath && typeof sqliteVec.getLoadablePath === "function") {
      try {
        const extensionPath = sqliteVec.getLoadablePath();
        if (fs.existsSync(extensionPath)) {
          console.debug(`[BetterSqliteStore] getLoadablePath() returned: ${extensionPath}`);
          return extensionPath;
        }
      } catch (pathError) {
        console.debug(`[BetterSqliteStore] getLoadablePath() failed: ${pathError instanceof Error ? pathError.message : String(pathError)}`);
      }
    }
    const platform = process.platform;
    const arch = process.arch;
    let packageName;
    let fileExt;
    if (platform === "darwin") {
      packageName = arch === "arm64" ? "sqlite-vec-darwin-arm64" : "sqlite-vec-darwin-x64";
      fileExt = "dylib";
    } else if (platform === "linux") {
      packageName = arch === "arm64" ? "sqlite-vec-linux-arm64" : "sqlite-vec-linux-x64";
      fileExt = "so";
    } else if (platform === "win32") {
      packageName = "sqlite-vec-windows-x64";
      fileExt = "dll";
    } else {
      throw new Error(`Unsupported platform: ${platform}-${arch}`);
    }
    const possiblePaths = [];
    if (app) {
      const basePath = app.vault.adapter?.basePath;
      if (basePath) {
        possiblePaths.push(
          path.join(basePath, ".obsidian", "plugins", "obsidian-peak-assistant", "node_modules", packageName, `vec0.${fileExt}`)
        );
      }
    }
    try {
      possiblePaths.push(
        path.join(process.cwd(), "node_modules", packageName, `vec0.${fileExt}`)
      );
    } catch {
    }
    console.debug(`[BetterSqliteStore] Trying alternative paths: ${possiblePaths.join(", ")}`);
    for (const altPath of possiblePaths) {
      if (fs.existsSync(altPath)) {
        console.debug(`[BetterSqliteStore] Found extension at: ${altPath}`);
        return altPath;
      }
    }
    return null;
  }
  /**
   * Attempts to manually load sqlite-vec extension using db.loadExtension().
   */
  static tryManualLoadExtension(db, sqliteVec, app) {
    if (!db.loadExtension) {
      return false;
    }
    try {
      const extensionPath = this.findSqliteVecExtensionPath(sqliteVec, app);
      if (!extensionPath) {
        console.warn(`[BetterSqliteStore] Could not find extension file.`);
        return false;
      }
      console.debug(`[BetterSqliteStore] Loading extension manually from: ${extensionPath}`);
      db.loadExtension(extensionPath);
      const versionResult = db.prepare("SELECT vec_version() as version").get();
      if (versionResult) {
        console.debug(`[BetterSqliteStore] sqlite-vec extension loaded manually (version: ${versionResult.version})`);
        return true;
      }
      return false;
    } catch (manualError) {
      console.warn(`[BetterSqliteStore] Manual loading failed: ${manualError instanceof Error ? manualError.message : String(manualError)}`);
      return false;
    }
  }
  /**
   * Try to load sqlite-vec extension for vector similarity search.
   * If loading fails, returns false but doesn't throw error.
   * This allows database to work without vector search (fulltext search still works).
   * 
   * @param db - Database instance to load extension into
   * @returns true if extension loaded successfully, false otherwise
   */
  static tryLoadSqliteVec(db, app) {
    try {
      const sqliteVec = require("sqlite-vec");
      const loadFn = sqliteVec.load || sqliteVec.default?.load;
      if (typeof loadFn !== "function") {
        console.warn(
          "[BetterSqliteStore] sqlite-vec.load function not found. Vector similarity search will not be available."
        );
        return false;
      }
      try {
        loadFn(db);
        const versionResult = db.prepare("SELECT vec_version() as version").get();
        if (versionResult) {
          console.debug(`[BetterSqliteStore] sqlite-vec extension loaded successfully (version: ${versionResult.version})`);
          return true;
        }
        console.warn("[BetterSqliteStore] sqlite-vec.load() succeeded but vec_version() failed. Extension may not be fully loaded.");
      } catch (loadError) {
        const errorMsg = loadError instanceof Error ? loadError.message : String(loadError);
        if (this.tryManualLoadExtension(db, sqliteVec, app)) {
          return true;
        }
        console.warn(
          `[BetterSqliteStore] Failed to load sqlite-vec extension. Vector similarity search will not be available. According to sqlite-vec docs, platform packages should be automatically handled. If this error persists, ensure sqlite-vec and platform-specific packages are installed. Error: ${errorMsg}. Fulltext search will still work.`
        );
      }
      return false;
    } catch (requireError) {
      if (requireError.code === "MODULE_NOT_FOUND") {
        console.warn(
          "[BetterSqliteStore] sqlite-vec extension is not installed. Vector similarity search will not be available. To enable it, install: npm install sqlite-vec"
        );
      } else {
        const errorMsg = requireError instanceof Error ? requireError.message : String(requireError);
        console.warn(
          `[BetterSqliteStore] Failed to require sqlite-vec. Vector similarity search will not be available. Error: ${errorMsg}. Fulltext search will still work.`
        );
      }
      return false;
    }
  }
  /**
   * Close the database connection and release resources.
   */
  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch (e) {
        console.warn("[BetterSqliteStore] Error closing database:", e);
      }
      this.db = null;
    }
    if (this.kyselyInstance) {
      this.kyselyInstance = null;
    }
  }
  /**
   * Check if the database is open.
   */
  isOpen() {
    return this.db !== null && this.db.open;
  }
  exec(sql4) {
    this.db.exec(sql4);
  }
  prepare(sql4) {
    return this.db.prepare(sql4);
  }
  kysely() {
    return this.kyselyInstance;
  }
  databaseType() {
    return "better-sqlite3";
  }
};

// src/core/utils/vault-utils.ts
var import_obsidian = __toESM(require_obsidian_stub());
async function ensureFolder(app, folderPath) {
  const normalized = (0, import_obsidian.normalizePath)(folderPath.trim());
  if (!normalized) {
    throw new Error("Invalid folder path");
  }
  await ensureFolderRecursive(app, normalized);
  if (app.isMock) {
    return null;
  }
  const folder = app.vault.getAbstractFileByPath(normalized);
  if (folder instanceof import_obsidian.TFolder) {
    return folder;
  }
  throw new Error(`Unable to create or access folder: ${normalized}`);
}
async function ensureFolderRecursive(app, folderPath) {
  const parts = folderPath.split("/").filter((p) => p.length > 0);
  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    let existing = app.vault.getAbstractFileByPath(currentPath);
    if (!existing) {
      try {
        await app.vault.createFolder(currentPath);
        console.log(`[vault-utils] Created folder: ${currentPath}`);
      } catch (error) {
        existing = app.vault.getAbstractFileByPath(currentPath);
        if (existing instanceof import_obsidian.TFolder) {
          continue;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isAlreadyExistsError = errorMessage.includes("already exist");
        if (isAlreadyExistsError) {
          existing = app.vault.getAbstractFileByPath(currentPath);
          if (existing instanceof import_obsidian.TFolder) {
            console.log(`[vault-utils] Folder already exists (caught error): ${currentPath}`);
            continue;
          }
        }
        console.error(`[vault-utils] Failed to create folder: ${currentPath}`, {
          error: errorMessage,
          isAlreadyExistsError,
          path: currentPath
        });
        throw error;
      }
    } else if (!(existing instanceof import_obsidian.TFolder)) {
      throw new Error(`Path exists but is not a folder: ${currentPath}`);
    }
  }
}
async function readVaultTextSnippet(app, vaultPath, maxChars) {
  const p = (0, import_obsidian.normalizePath)(vaultPath);
  if (!p || p.startsWith("__hub_cluster__")) return null;
  const f = app.vault.getAbstractFileByPath(p);
  if (!(f instanceof import_obsidian.TFile)) return null;
  try {
    const raw = await app.vault.cachedRead(f);
    return raw.length <= maxChars ? raw : `${raw.slice(0, maxChars)}

[truncated]`;
  } catch {
    return null;
  }
}

// src/core/storage/sqlite/repositories/IndexedDocumentRepo.ts
var INDEXED_NOTE_ROW_TYPES = [GraphNodeType.Document, GraphNodeType.HubDoc];
var IndexedDocumentRepo = class {
  constructor(db) {
    this.db = db;
  }
  parseDocAttrs(json) {
    try {
      return JSON.parse(json || "{}");
    } catch {
      return {};
    }
  }
  /** Merge indexed-document fields into `attributes_json` (ddl-backed document attrs). */
  buildDocumentAttributesJson(params) {
    const prev = this.parseDocAttrs(params.existingJson ?? "{}");
    const next = {
      ...prev,
      docType: params.docType !== void 0 ? params.docType : prev.docType,
      frontmatter_json: params.frontmatter_json !== void 0 ? params.frontmatter_json : prev.frontmatter_json,
      last_processed_at: params.last_processed_at !== void 0 ? params.last_processed_at : prev.last_processed_at,
      path: params.path !== void 0 ? params.path : prev.path,
      full_summary: params.full_summary !== void 0 ? params.full_summary : prev.full_summary,
      hub_tier: params.hub_tier !== void 0 ? params.hub_tier : prev.hub_tier,
      summary_generated_at: params.summary_generated_at !== void 0 ? params.summary_generated_at : prev.summary_generated_at,
      heading_skeleton: params.heading_skeleton !== void 0 ? params.heading_skeleton : prev.heading_skeleton
    };
    return JSON.stringify(next);
  }
  /**
   * Merges index-time extras (tiered summaries) into the document row without dropping other attrs.
   */
  async mergeIndexedSummaryFields(docId, patch) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", docId).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).executeTakeFirst();
    if (!row) return;
    const attrs = this.buildDocumentAttributesJson({
      existingJson: row.attributes_json,
      full_summary: patch.full_summary,
      hub_tier: patch.hub_tier,
      summary_generated_at: patch.summary_generated_at,
      heading_skeleton: patch.heading_skeleton
    });
    await this.db.updateTable("mobius_node").set({
      summary: patch.summary !== void 0 ? patch.summary : row.summary,
      attributes_json: attrs,
      updated_at: Date.now()
    }).where("node_id", "=", docId).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
  }
  /** Build {@link IndexedDocumentRecord} from a document `mobius_node` row. */
  rowToIndexedDocument(row) {
    if (!isIndexedNoteNodeType(row.type) || !row.path) return null;
    const extra = this.parseDocAttrs(row.attributes_json);
    return {
      id: row.node_id,
      path: row.path,
      type: extra.docType ?? null,
      title: row.title,
      size: row.size,
      mtime: row.mtime,
      ctime: row.ctime,
      infer_created_at: row.infer_created_at,
      content_hash: row.content_hash,
      summary: row.summary,
      full_summary: extra.full_summary ?? null,
      tags: row.tags_json,
      last_processed_at: extra.last_processed_at ?? null,
      frontmatter_json: extra.frontmatter_json ?? null
    };
  }
  docNodeQuery() {
    return this.db.selectFrom("mobius_node").where("type", "in", [...INDEXED_NOTE_ROW_TYPES]);
  }
  async existsByPath(path3) {
    const row = await this.docNodeQuery().select("node_id").where("path", "=", path3).executeTakeFirst();
    return row !== void 0;
  }
  async insert(doc) {
    const now = Date.now();
    const rowUpdatedAt = doc.row_updated_at ?? now;
    const attrs = this.buildDocumentAttributesJson({
      docType: doc.type,
      frontmatter_json: doc.frontmatter_json ?? null,
      last_processed_at: doc.last_processed_at,
      path: doc.path,
      full_summary: doc.full_summary ?? null
    });
    const graphType = doc.mobiusGraphNodeType === GraphNodeType.HubDoc ? GraphNodeType.HubDoc : GraphNodeType.Document;
    await this.db.insertInto("mobius_node").values({
      node_id: doc.id,
      type: graphType,
      label: doc.title ?? doc.path,
      created_at: now,
      infer_created_at: doc.infer_created_at ?? null,
      updated_at: rowUpdatedAt,
      last_open_ts: doc.last_open_ts ?? null,
      open_count: null,
      path: doc.path,
      title: doc.title,
      size: doc.size,
      mtime: doc.mtime,
      ctime: doc.ctime,
      content_hash: doc.content_hash,
      summary: doc.summary,
      tags_json: doc.tags,
      word_count: doc.word_count ?? null,
      char_count: doc.char_count ?? null,
      language: null,
      richness_score: null,
      doc_incoming_cnt: null,
      doc_outgoing_cnt: null,
      other_incoming_cnt: null,
      other_outgoing_cnt: null,
      tag_doc_count: null,
      pagerank: null,
      pagerank_updated_at: null,
      pagerank_version: null,
      semantic_pagerank: null,
      semantic_pagerank_updated_at: null,
      semantic_pagerank_version: null,
      attributes_json: attrs
    }).execute();
  }
  async updateById(id, updates) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", id).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).executeTakeFirst();
    if (!row) return;
    const nextAttrs = this.buildDocumentAttributesJson({
      existingJson: row.attributes_json,
      docType: updates.type,
      frontmatter_json: updates.frontmatter_json,
      last_processed_at: updates.last_processed_at,
      full_summary: updates.full_summary
    });
    const nextUpdatedAt = updates.row_updated_at !== void 0 ? updates.row_updated_at ?? Date.now() : Date.now();
    await this.db.updateTable("mobius_node").set({
      title: updates.title !== void 0 ? updates.title : row.title,
      size: updates.size !== void 0 ? updates.size : row.size,
      mtime: updates.mtime !== void 0 ? updates.mtime : row.mtime,
      ctime: updates.ctime !== void 0 ? updates.ctime : row.ctime,
      content_hash: updates.content_hash !== void 0 ? updates.content_hash : row.content_hash,
      summary: updates.summary !== void 0 ? updates.summary : row.summary,
      tags_json: updates.tags !== void 0 ? updates.tags : row.tags_json,
      label: updates.title !== void 0 ? updates.title ?? row.path ?? row.label : row.label,
      attributes_json: nextAttrs,
      updated_at: nextUpdatedAt,
      word_count: updates.word_count !== void 0 ? updates.word_count : row.word_count,
      char_count: updates.char_count !== void 0 ? updates.char_count : row.char_count,
      last_open_ts: updates.last_open_ts !== void 0 ? updates.last_open_ts : row.last_open_ts,
      infer_created_at: updates.infer_created_at !== void 0 ? updates.infer_created_at : row.infer_created_at
    }).where("node_id", "=", id).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
  }
  async updatePathById(id, newPath) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", id).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).executeTakeFirst();
    if (!row) return;
    const attrs = this.buildDocumentAttributesJson({
      existingJson: row.attributes_json,
      path: newPath
    });
    const title = row.title;
    await this.db.updateTable("mobius_node").set({
      path: newPath,
      attributes_json: attrs,
      label: title ?? newPath,
      updated_at: Date.now()
    }).where("node_id", "=", id).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
  }
  async updateByPath(path3, updates) {
    const row = await this.docNodeQuery().select("node_id").where("path", "=", path3).executeTakeFirst();
    if (!row) return;
    await this.updateById(row.node_id, updates);
  }
  async upsert(doc) {
    if (!doc.id) {
      throw new Error(`doc.id is required for IndexedDocumentRepo.upsert. Path: ${doc.path}`);
    }
    const exists = await this.existsByPath(doc.path);
    if (exists) {
      await this.updateById(doc.id, {
        type: doc.type ?? null,
        title: doc.title ?? null,
        size: doc.size ?? null,
        mtime: doc.mtime ?? null,
        ctime: doc.ctime ?? null,
        content_hash: doc.content_hash ?? null,
        // Preserve LLM/indexed summary when the loader did not produce one (e.g. genCacheContent index path).
        summary: doc.summary !== void 0 && doc.summary !== null ? doc.summary : void 0,
        full_summary: doc.full_summary !== void 0 ? doc.full_summary : void 0,
        tags: doc.tags ?? null,
        last_processed_at: doc.last_processed_at ?? null,
        frontmatter_json: doc.frontmatter_json ?? null,
        word_count: doc.word_count,
        char_count: doc.char_count,
        last_open_ts: doc.last_open_ts,
        row_updated_at: doc.row_updated_at,
        ...doc.infer_created_at !== void 0 ? { infer_created_at: doc.infer_created_at } : {}
      });
      const patch = {
        path: doc.path,
        updated_at: doc.row_updated_at ?? Date.now()
      };
      if (doc.mobiusGraphNodeType === GraphNodeType.HubDoc || doc.mobiusGraphNodeType === GraphNodeType.Document) {
        patch.type = doc.mobiusGraphNodeType;
      }
      await this.db.updateTable("mobius_node").set(patch).where("node_id", "=", doc.id).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
    } else {
      await this.insert({
        id: doc.id,
        path: doc.path,
        type: doc.type ?? null,
        title: doc.title ?? null,
        size: doc.size ?? null,
        mtime: doc.mtime ?? null,
        ctime: doc.ctime ?? null,
        content_hash: doc.content_hash ?? null,
        summary: doc.summary ?? null,
        full_summary: doc.full_summary ?? null,
        tags: doc.tags ?? null,
        last_processed_at: doc.last_processed_at ?? null,
        frontmatter_json: doc.frontmatter_json ?? null,
        word_count: doc.word_count,
        char_count: doc.char_count,
        last_open_ts: doc.last_open_ts,
        row_updated_at: doc.row_updated_at,
        infer_created_at: doc.infer_created_at,
        mobiusGraphNodeType: doc.mobiusGraphNodeType
      });
    }
  }
  async deleteByPaths(paths) {
    if (!paths.length) return;
    await this.db.deleteFrom("mobius_node").where("path", "in", paths).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
  }
  async deleteAll() {
    await this.db.deleteFrom("mobius_node").where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
  }
  async getAllIndexedPaths() {
    const rows = await this.docNodeQuery().select(["path", "mtime"]).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (!row.path) continue;
      result.set(row.path, row.mtime ?? 0);
    }
    return result;
  }
  async getIndexedPathsBatch(offset, limit) {
    const rows = await this.docNodeQuery().select(["path", "mtime"]).offset(offset).limit(limit).execute();
    return rows.filter((row) => row.path != null).map((row) => ({
      path: row.path,
      mtime: row.mtime ?? 0
    }));
  }
  async batchCheckIndexed(paths) {
    if (!paths.length) return /* @__PURE__ */ new Map();
    const rows = await this.docNodeQuery().select(["path", "mtime", "content_hash"]).where("path", "in", paths).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (!row.path) continue;
      result.set(row.path, {
        mtime: row.mtime ?? 0,
        content_hash: row.content_hash ?? null
      });
    }
    return result;
  }
  async getByPath(path3) {
    const row = await this.docNodeQuery().selectAll().where("path", "=", path3).executeTakeFirst();
    return row ? this.rowToIndexedDocument(row) : null;
  }
  async getByPaths(paths) {
    if (!paths.length) return /* @__PURE__ */ new Map();
    const rows = await this.docNodeQuery().selectAll().where("path", "in", paths).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const dm = this.rowToIndexedDocument(row);
      if (dm) result.set(dm.path, dm);
    }
    return result;
  }
  async getIdsByPaths(paths) {
    if (!paths.length) return [];
    const rows = await this.docNodeQuery().select(["node_id", "path"]).where("path", "in", paths).execute();
    return rows.filter((row) => row.path != null).map((row) => ({ id: row.node_id, path: row.path }));
  }
  async getIdsByFolderPath(folderPath) {
    if (folderPath === "") return [];
    const rows = await this.docNodeQuery().select(["node_id", "path"]).where(
      (eb) => eb.or([eb("path", "like", `${folderPath}/%`), eb("path", "=", folderPath)])
    ).execute();
    return rows.filter((row) => row.path != null).map((row) => ({ id: row.node_id, path: row.path }));
  }
  async countByFolderPath(folderPath) {
    if (folderPath === "") return 0;
    const row = await this.docNodeQuery().select(({ fn }) => fn.count("node_id").as("cnt")).where(
      (eb) => eb.or([eb("path", "like", `${folderPath}/%`), eb("path", "=", folderPath)])
    ).executeTakeFirst();
    return Number(row?.cnt ?? 0);
  }
  async getIdsByPathPrefixes(prefixes) {
    if (!prefixes.length) return [];
    const rows = await this.docNodeQuery().select(["node_id", "path"]).where(
      (eb) => eb.or(
        prefixes.map((p) => {
          const folderLike = p.endsWith("/") ? p : p + "/";
          const exact = folderLike.slice(0, -1);
          return eb.or([eb("path", "like", `${folderLike}%`), eb("path", "=", exact)]);
        })
      )
    ).execute();
    return rows.filter((row) => row.path != null).map((row) => ({ id: row.node_id, path: row.path }));
  }
  async getByIds(ids) {
    if (!ids.length) return [];
    const rows = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "in", ids).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
    return rows.map((r) => this.rowToIndexedDocument(r)).filter((m) => m != null);
  }
  async getByContentHash(contentHash) {
    const rows = await this.docNodeQuery().selectAll().where("content_hash", "=", contentHash).execute();
    return rows.map((r) => this.rowToIndexedDocument(r)).filter((m) => m != null);
  }
  async batchGetByContentHashes(contentHashes) {
    if (!contentHashes.length) return /* @__PURE__ */ new Set();
    const rows = await this.docNodeQuery().select(["content_hash"]).where("content_hash", "in", contentHashes).where("content_hash", "is not", null).execute();
    return new Set(rows.map((row) => row.content_hash).filter(Boolean));
  }
};

// src/core/storage/sqlite/repositories/DocChunkRepo.ts
var DocChunkRepo = class {
  constructor(db, rawDb) {
    this.db = db;
    this.rawDb = rawDb;
  }
  /**
   * Delete chunks by doc_id.
   */
  async deleteByDocId(docId) {
    await this.db.deleteFrom("doc_chunk").where("doc_id", "=", docId).execute();
  }
  /**
   * Delete chunks by doc_ids (batch).
   */
  async deleteByDocIds(docIds) {
    if (!docIds.length) return;
    await this.db.deleteFrom("doc_chunk").where("doc_id", "in", docIds).execute();
  }
  /**
   * Delete all chunks.
   */
  async deleteAll() {
    await this.db.deleteFrom("doc_chunk").execute();
  }
  /**
   * Delete FTS rows by doc_id.
   */
  deleteFtsByDocId(docId) {
    const stmt = this.rawDb.prepare(`DELETE FROM doc_fts WHERE doc_id = ?`);
    stmt.run(docId);
  }
  /**
   * Delete FTS rows by doc_ids (batch).
   */
  deleteFtsByDocIds(docIds) {
    if (!docIds.length) return;
    const stmt = this.rawDb.prepare(`DELETE FROM doc_fts WHERE doc_id IN (${docIds.map(() => "?").join(",")})`);
    stmt.run(...docIds);
  }
  /**
   * Delete meta FTS row by doc_id.
   */
  deleteMetaFtsByDocId(docId) {
    const stmt = this.rawDb.prepare(`DELETE FROM doc_meta_fts WHERE doc_id = ?`);
    stmt.run(docId);
  }
  /**
   * Delete meta FTS rows by doc_ids (batch).
   */
  deleteMetaFtsByDocIds(docIds) {
    if (!docIds.length) return;
    const stmt = this.rawDb.prepare(`DELETE FROM doc_meta_fts WHERE doc_id IN (${docIds.map(() => "?").join(",")})`);
    stmt.run(...docIds);
  }
  /**
   * Delete all FTS rows.
   */
  deleteAllFts() {
    const stmt = this.rawDb.prepare(`DELETE FROM doc_fts`);
    stmt.run();
  }
  /**
   * Delete all meta FTS rows.
   */
  deleteAllMetaFts() {
    const stmt = this.rawDb.prepare(`DELETE FROM doc_meta_fts`);
    stmt.run();
  }
  /**
   * Remove orphan doc_meta_fts rows (doc_id not linked to a document mobius node).
   */
  cleanupOrphanMetaFts() {
    const ph = GRAPH_INDEXED_NOTE_NODE_TYPES.map(() => "?").join(", ");
    const stmt = this.rawDb.prepare(
      `DELETE FROM doc_meta_fts WHERE doc_id NOT IN (SELECT node_id FROM mobius_node WHERE type IN (${ph}))`
    );
    const result = stmt.run(...GRAPH_INDEXED_NOTE_NODE_TYPES);
    return result.changes;
  }
  /**
   * Remove orphan doc_fts rows (doc_id not linked to a document mobius node).
   */
  cleanupOrphanFts() {
    const ph = GRAPH_INDEXED_NOTE_NODE_TYPES.map(() => "?").join(", ");
    const stmt = this.rawDb.prepare(
      `DELETE FROM doc_fts WHERE doc_id NOT IN (SELECT node_id FROM mobius_node WHERE type IN (${ph}))`
    );
    const result = stmt.run(...GRAPH_INDEXED_NOTE_NODE_TYPES);
    return result.changes;
  }
  /**
   * Remove orphan doc_chunk rows (doc_id not linked to a document mobius node).
   */
  async cleanupOrphanChunks() {
    const result = await this.db.deleteFrom("doc_chunk").where(
      "doc_id",
      "not in",
      this.db.selectFrom("mobius_node").select("node_id").where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES])
    ).executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0);
  }
  /**
   * Insert FTS row.
   */
  /**
   * Insert FTS row for content.
   */
  insertFts(params) {
    const stmt = this.rawDb.prepare(`
			INSERT INTO doc_fts (chunk_id, doc_id, content)
			VALUES (@chunk_id, @doc_id, @content)
		`);
    stmt.run(params);
  }
  /**
   * Insert FTS row for document metadata (title/path).
   * Only one row per document.
   */
  insertMetaFts(params) {
    const stmt = this.rawDb.prepare(`
			INSERT INTO doc_meta_fts (doc_id, path, title)
			VALUES (@doc_id, @path, @title)
		`);
    stmt.run(params);
  }
  /**
   * Replace meta FTS row for a document (e.g. after vault rename). FTS5 has no in-place path update.
   */
  replaceMetaFts(params) {
    const del = this.rawDb.prepare(`DELETE FROM doc_meta_fts WHERE doc_id = ?`);
    del.run(params.doc_id);
    this.insertMetaFts(params);
  }
  /**
   * Check if chunk exists by chunk_id.
   */
  async existsByChunkId(chunkId) {
    const row = await this.db.selectFrom("doc_chunk").select("chunk_id").where("chunk_id", "=", chunkId).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new chunk.
   */
  async insert(chunk2) {
    await this.db.insertInto("doc_chunk").values({
      chunk_id: chunk2.chunk_id,
      doc_id: chunk2.doc_id,
      chunk_index: chunk2.chunk_index,
      chunk_type: chunk2.chunk_type,
      chunk_meta_json: chunk2.chunk_meta_json,
      title: chunk2.title,
      mtime: chunk2.mtime,
      content_raw: chunk2.content_raw,
      content_fts_norm: chunk2.content_fts_norm
    }).execute();
  }
  /**
   * Update existing chunk by chunk_id.
   */
  async updateByChunkId(chunkId, updates) {
    await this.db.updateTable("doc_chunk").set(updates).where("chunk_id", "=", chunkId).execute();
  }
  /**
   * Upsert chunk.
   */
  async upsertChunk(chunk2) {
    const exists = await this.existsByChunkId(chunk2.chunk_id);
    if (exists) {
      await this.updateByChunkId(chunk2.chunk_id, {
        doc_id: chunk2.doc_id,
        chunk_index: chunk2.chunk_index,
        chunk_type: chunk2.chunk_type,
        chunk_meta_json: chunk2.chunk_meta_json,
        title: chunk2.title,
        mtime: chunk2.mtime,
        content_raw: chunk2.content_raw,
        content_fts_norm: chunk2.content_fts_norm
      });
    } else {
      await this.insert(chunk2);
    }
  }
  /**
   * Chunk rows for resolving vector hits. Prefers `doc_chunk` (SSOT); falls back to `doc_fts` for legacy rows.
   */
  async getByChunkIds(chunkIds) {
    if (!chunkIds.length) return [];
    const rows = await this.db.selectFrom("doc_chunk").select(["chunk_id", "doc_id", "chunk_type", "title", "content_raw", "mtime"]).where("chunk_id", "in", chunkIds).execute();
    const map = new Map(rows.map((r) => [r.chunk_id, r]));
    const missing = chunkIds.filter((id) => !map.has(id));
    if (missing.length) {
      const placeholders = missing.map(() => "?").join(",");
      const stmt = this.rawDb.prepare(`
				SELECT chunk_id, doc_id, content AS content_raw
				FROM doc_fts
				WHERE chunk_id IN (${placeholders})
			`);
      const ftsRows = stmt.all(...missing);
      for (const fr of ftsRows) {
        map.set(fr.chunk_id, {
          chunk_id: fr.chunk_id,
          doc_id: fr.doc_id,
          chunk_type: "body_raw",
          title: null,
          content_raw: fr.content_raw,
          mtime: null
        });
      }
    }
    return chunkIds.map((id) => map.get(id)).filter((x) => x != null);
  }
  /**
   * Search FTS (full-text search).
   * Returns chunk_id, doc_id, and path. Caller should fetch indexed document path/title separately to avoid JOIN.
   * 
   * @param term - Search term (normalized for FTS)
   * @param limit - Maximum number of results
   * @param scopeMode - Scope mode for filtering
   * @param scopeValue - Scope value for filtering
   */
  searchFts(term, limit, scopeMode, scopeValue, excludeFolderPrefixes) {
    let pathFilter = "";
    const pathParams = [];
    if (scopeMode === "inFile" && scopeValue?.currentFilePath) {
      pathFilter = "AND dm.path = ?";
      pathParams.push(scopeValue.currentFilePath);
    } else if (scopeMode === "inFolder" && scopeValue?.folderPath) {
      const folderPath = (scopeValue.folderPath ?? "").trim().replace(/\/+$/, "") || void 0;
      if (folderPath) {
        pathFilter = "AND (dm.path = ? OR dm.path LIKE ?)";
        pathParams.push(folderPath, `${folderPath}/%`);
      }
    }
    if (excludeFolderPrefixes?.length) {
      for (const p of excludeFolderPrefixes) {
        const folderLike = p.endsWith("/") ? p : p + "/";
        const exact = folderLike.slice(0, -1);
        pathFilter += " AND NOT (dm.path LIKE ? OR dm.path = ?)";
        pathParams.push(`${folderLike}%`, exact);
      }
    }
    const sql4 = `
			SELECT
				f.chunk_id as chunkId,
				f.doc_id as docId,
				dm.path as path,
				dm.title as title,
				f.content as content,
				bm25(doc_fts) as bm25
			FROM doc_fts f
			INNER JOIN mobius_node dm ON f.doc_id = dm.node_id AND dm.type IN ('${GraphNodeType.Document}', '${GraphNodeType.HubDoc}')
			WHERE doc_fts MATCH ?
			${pathFilter}
			ORDER BY bm25 ASC
			LIMIT ?
		`;
    const stmt = this.rawDb.prepare(sql4);
    return stmt.all(term, ...pathParams, limit);
  }
  /**
   * Search document metadata (title/path) using FTS5.
   *
   * @param term - Search term (normalized for FTS)
   * @param limit - Maximum number of results
   * @param scopeMode - Scope mode for filtering
   * @param scopeValue - Scope value for filtering
   */
  searchMetaFts(term, limit, scopeMode, scopeValue, excludeFolderPrefixes) {
    let pathFilter = "";
    const pathParams = [];
    if (scopeMode === "inFile" && scopeValue?.currentFilePath) {
      pathFilter = "AND mf.path = ?";
      pathParams.push(scopeValue.currentFilePath);
    } else if (scopeMode === "inFolder" && scopeValue?.folderPath) {
      const folderPath = (scopeValue.folderPath ?? "").trim().replace(/\/+$/, "") || void 0;
      if (folderPath) {
        pathFilter = "AND (mf.path = ? OR mf.path LIKE ?)";
        pathParams.push(folderPath, `${folderPath}/%`);
      }
    }
    if (excludeFolderPrefixes?.length) {
      for (const p of excludeFolderPrefixes) {
        const folderLike = p.endsWith("/") ? p : p + "/";
        const exact = folderLike.slice(0, -1);
        pathFilter += " AND NOT (mf.path LIKE ? OR mf.path = ?)";
        pathParams.push(`${folderLike}%`, exact);
      }
    }
    const sql4 = `
			SELECT
				mf.doc_id as docId,
				mf.path as path,
				mf.title as title,
				bm25(doc_meta_fts) as bm25
			FROM doc_meta_fts mf
			WHERE doc_meta_fts MATCH ?
			${pathFilter}
			ORDER BY bm25 ASC
			LIMIT ?
		`;
    const stmt = this.rawDb.prepare(sql4);
    return stmt.all(term, ...pathParams, limit);
  }
};

// src/core/errors.ts
var BusinessError = class extends Error {
  constructor(code, message, cause) {
    super(message);
    this.code = code;
    this.name = "BusinessError";
    if (cause) {
      this.stack = cause.stack;
    }
  }
};

// src/service/search/index/chunkTypes.ts
var SEMANTIC_CHUNK_TYPE_ORDER = [
  "summary_short",
  "summary_full",
  "salient_textrank_sentence",
  "body_raw"
];
var SEMANTIC_EDGE_CHUNK_TYPE_WEIGHT = {
  summary_short: 1.25,
  summary_full: 1.15,
  salient_textrank_sentence: 1.1,
  body_raw: 1
};

// src/core/storage/sqlite/repositories/EmbeddingRepo.ts
var EmbeddingRepo = class {
  constructor(db, rawDb, indexedDocumentRepo) {
    this.db = db;
    this.rawDb = rawDb;
    this.indexedDocumentRepo = indexedDocumentRepo;
    // Cache for vec_embeddings table state (checked once on plugin startup)
    this.vecEmbeddingsTableExists = null;
    this.vecEmbeddingsTableDimension = null;
  }
  /**
   * Convert number[] to Buffer (BLOB format).
   */
  arrayToBuffer(arr) {
    const buffer = Buffer.allocUnsafe(arr.length * 4);
    for (let i = 0; i < arr.length; i++) {
      buffer.writeFloatLE(arr[i], i * 4);
    }
    return buffer;
  }
  /**
   * Convert Buffer (BLOB format) to number[].
   */
  bufferToArray(buffer) {
    const arr = [];
    for (let i = 0; i < buffer.length; i += 4) {
      arr.push(buffer.readFloatLE(i));
    }
    return arr;
  }
  /**
   * Get embedding rowids by specific file paths.
   */
  async getEmbeddingRowidsByPath(paths) {
    const docIds = (await this.indexedDocumentRepo.getIdsByPaths(paths)).map((d) => d.id);
    return this.getEmbeddingRowidsByDocIds(docIds);
  }
  /**
   * Get embedding rowids by folder path (including subfolders).
   */
  async getEmbeddingRowidsByFolder(folderPath) {
    const docIds = (await this.indexedDocumentRepo.getIdsByFolderPath(folderPath)).map((d) => d.id);
    return this.getEmbeddingRowidsByDocIds(docIds);
  }
  /**
   * Get embedding rowids for docs whose path is under any of the given folder prefixes.
   * Used for exclude-folder filtering in KNN query.
   */
  async getEmbeddingRowidsByPathPrefixes(prefixes) {
    if (!prefixes.length) return [];
    const docs = await this.indexedDocumentRepo.getIdsByPathPrefixes(prefixes);
    return this.getEmbeddingRowidsByDocIds(docs.map((d) => d.id));
  }
  /**
   * Get embedding rowids by embedding IDs.
   */
  getEmbeddingRowidsByIds(ids) {
    if (!ids.length) return [];
    const embeddingStmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding
			WHERE id IN (${ids.map(() => "?").join(",")})
		`);
    const embeddings = embeddingStmt.all(...ids);
    return embeddings.map((e) => e.rowid);
  }
  /**
   * Get embedding rowids by document IDs.
   */
  getEmbeddingRowidsByDocIds(docIds) {
    if (!docIds.length) return [];
    const embeddingStmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding
			WHERE doc_id IN (${docIds.map(() => "?").join(",")})
		`);
    const embeddings = embeddingStmt.all(...docIds);
    return embeddings.map((e) => e.rowid);
  }
  /**
   * Initialize vec_embeddings table state cache.
   * Should be called once on plugin startup to avoid frequent table checks.
   */
  initializeVecEmbeddingsTableCache() {
    const checkStmt = this.rawDb.prepare(`
			SELECT name FROM sqlite_master 
			WHERE type='table' AND name='vec_embeddings'
		`);
    this.vecEmbeddingsTableExists = checkStmt.get() !== void 0;
    if (this.vecEmbeddingsTableExists) {
      this.vecEmbeddingsTableDimension = null;
    }
  }
  /**
   * Re-check vec_embeddings table state (fallback when error occurs).
   */
  recheckVecEmbeddingsTableState() {
    const checkStmt = this.rawDb.prepare(`
			SELECT name FROM sqlite_master 
			WHERE type='table' AND name='vec_embeddings'
		`);
    this.vecEmbeddingsTableExists = checkStmt.get() !== void 0;
    this.vecEmbeddingsTableDimension = null;
  }
  /**
   * Recreate vec_embeddings table with new dimension.
   * This will delete all existing vector data in vec_embeddings.
   * Note: This does NOT delete embedding records from the embedding table.
   * 
   * @param dimension - New dimension for the table
   */
  recreateVecEmbeddingsTable(dimension) {
    console.warn(
      `[EmbeddingRepo] Recreating vec_embeddings table with dimension ${dimension}. All existing vector data in vec_embeddings will be lost (embedding table records are preserved).`
    );
    this.rawDb.exec(`DROP TABLE IF EXISTS vec_embeddings`);
    this.rawDb.exec(`
			CREATE VIRTUAL TABLE vec_embeddings USING vec0(
				embedding float[${dimension}]
			)
		`);
    this.vecEmbeddingsTableExists = true;
    this.vecEmbeddingsTableDimension = dimension;
    console.log(`[EmbeddingRepo] Recreated vec_embeddings table with dimension ${dimension}`);
  }
  /**
   * Ensure vec_embeddings table exists with correct dimension.
   * Uses cached state to avoid frequent table checks.
   * If table doesn't exist, create it with the specified dimension.
   */
  ensureVecEmbeddingsTable(dimension) {
    if (this.vecEmbeddingsTableExists === null) {
      this.initializeVecEmbeddingsTableCache();
    }
    if (!this.vecEmbeddingsTableExists) {
      this.rawDb.exec(`
				CREATE VIRTUAL TABLE vec_embeddings USING vec0(
					embedding float[${dimension}]
				)
			`);
      console.log(`[EmbeddingRepo] Created vec_embeddings table with dimension ${dimension}`);
      this.vecEmbeddingsTableExists = true;
      this.vecEmbeddingsTableDimension = dimension;
    }
  }
  /**
   * Get embedding rowid by id.
   * Returns null if not found.
   */
  getEmbeddingRowid(id) {
    const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding WHERE id = ?
		`);
    const result = stmt.get(id);
    return result?.rowid ?? null;
  }
  /**
   * Sync embedding to vec_embeddings virtual table.
   * This performs DELETE then INSERT (virtual tables don't support UPDATE).
   */
  syncToVecEmbeddings(embeddingRowid, embeddingBuffer, logContext) {
    const checkStmt = this.rawDb.prepare(`
			SELECT rowid FROM vec_embeddings WHERE rowid = CAST(? AS INTEGER)
		`);
    const existing = checkStmt.get(embeddingRowid);
    if (existing) {
      const deleteStmt = this.rawDb.prepare(`
				DELETE FROM vec_embeddings WHERE rowid = CAST(? AS INTEGER)
			`);
      deleteStmt.run(embeddingRowid);
    }
    const insertStmt = this.rawDb.prepare(`
			INSERT INTO vec_embeddings(rowid, embedding)
			VALUES (CAST(? AS INTEGER), ?)
		`);
    insertStmt.run(embeddingRowid, embeddingBuffer);
  }
  /**
   * Handle errors from syncToVecEmbeddings and retry if needed.
   */
  handleSyncError(error, embeddingRowid, embeddingBuffer, embeddingDimension) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : new Error(String(error));
    if (errorMsg.includes("no such table: vec_embeddings")) {
      this.recheckVecEmbeddingsTableState();
      if (!this.vecEmbeddingsTableExists) {
        throw new BusinessError(
          "VEC_EMBEDDINGS_TABLE_MISSING" /* VEC_EMBEDDINGS_TABLE_MISSING */,
          "vec_embeddings virtual table does not exist. This requires sqlite-vec extension to be loaded. Please ensure sqlite-vec is installed and the extension is loaded during database initialization.",
          cause
        );
      }
      this.syncToVecEmbeddings(embeddingRowid, embeddingBuffer, "retry after table missing");
      return;
    }
    if (errorMsg.includes("Dimension mismatch")) {
      const dimensionMatch = errorMsg.match(/Expected (\d+) dimensions/);
      const expectedDimension = dimensionMatch ? dimensionMatch[1] : "unknown";
      console.warn(
        `[EmbeddingRepo] Dimension mismatch detected: table expects ${expectedDimension} dimensions, but received ${embeddingDimension} dimensions. This usually happens when the embedding model was changed. Automatically recreating vec_embeddings table with correct dimension...`
      );
      this.recreateVecEmbeddingsTable(embeddingDimension);
      this.syncToVecEmbeddings(embeddingRowid, embeddingBuffer, "retry after dimension mismatch");
      console.log(`[EmbeddingRepo] Successfully inserted embedding after recreating table`);
      return;
    }
    this.recheckVecEmbeddingsTableState();
    throw new BusinessError(
      "UNKNOWN_ERROR" /* UNKNOWN_ERROR */,
      `Failed to sync embedding to vec_embeddings: ${errorMsg}`,
      cause
    );
  }
  /**
   * Check if embedding exists by id.
   */
  async existsById(id) {
    const row = await this.db.selectFrom("embedding").select("id").where("id", "=", id).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new embedding record.
   */
  async insert(embedding) {
    const insertStmt = this.rawDb.prepare(`
			INSERT INTO embedding (
				id, doc_id, chunk_id, chunk_index, chunk_type,
				content_hash, ctime, mtime, embedding,
				embedding_model, embedding_len
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
    const result = insertStmt.run(
      embedding.id,
      embedding.doc_id,
      embedding.chunk_id,
      embedding.chunk_index,
      embedding.chunk_type ?? null,
      embedding.content_hash,
      embedding.ctime,
      embedding.mtime,
      embedding.embedding,
      embedding.embedding_model,
      embedding.embedding_len
    );
    return result.lastInsertRowid;
  }
  /**
   * Update existing embedding record by id.
   */
  async updateById(id, updates) {
    await this.db.updateTable("embedding").set(updates).where("id", "=", id).execute();
  }
  /**
   * Upsert an embedding record.
   *
   * Also syncs the embedding vector to vec_embeddings virtual table for KNN search.
   * vec_embeddings.rowid corresponds to embedding table's implicit rowid (integer).
   * This allows direct association: we get embedding.rowid after insert, then use it as vec_embeddings.rowid.
   *
   * Note: embedding table stores vectors as BLOB (binary format), while vec_embeddings virtual table
   * uses JSON format (as required by sqlite-vec vec0).
   */
  async upsert(embedding) {
    const embeddingBuffer = this.arrayToBuffer(embedding.embedding);
    const exists = await this.existsById(embedding.id);
    let embeddingRowid;
    if (exists) {
      embeddingRowid = this.getEmbeddingRowid(embedding.id);
      await this.updateById(embedding.id, {
        doc_id: embedding.doc_id,
        chunk_id: embedding.chunk_id ?? null,
        chunk_index: embedding.chunk_index ?? null,
        chunk_type: embedding.chunk_type ?? null,
        content_hash: embedding.content_hash,
        mtime: embedding.mtime,
        embedding: embeddingBuffer,
        embedding_model: embedding.embedding_model,
        embedding_len: embedding.embedding_len
      });
    } else {
      embeddingRowid = await this.insert({
        id: embedding.id,
        doc_id: embedding.doc_id,
        chunk_id: embedding.chunk_id ?? null,
        chunk_index: embedding.chunk_index ?? null,
        chunk_type: embedding.chunk_type ?? null,
        content_hash: embedding.content_hash,
        ctime: embedding.ctime,
        mtime: embedding.mtime,
        embedding: embeddingBuffer,
        embedding_model: embedding.embedding_model,
        embedding_len: embedding.embedding_len
      });
    }
    const embeddingDimension = embedding.embedding.length;
    this.ensureVecEmbeddingsTable(embeddingDimension);
    try {
      this.syncToVecEmbeddings(embeddingRowid, embeddingBuffer);
    } catch (error) {
      this.handleSyncError(error, embeddingRowid, embeddingBuffer, embeddingDimension);
    }
  }
  /**
   * Get embedding by ID.
   */
  async getById(id) {
    const row = await this.db.selectFrom("embedding").selectAll().where("id", "=", id).executeTakeFirst();
    return row ?? null;
  }
  /**
   * Get embeddings by file ID.
   */
  async getByDocId(docId) {
    return await this.db.selectFrom("embedding").selectAll().where("doc_id", "=", docId).execute();
  }
  /**
   * Distinct document ids that have at least one embedding row (batch semantic neighbor jobs).
   */
  async listDistinctDocIdsWithEmbeddings() {
    const rows = await this.db.selectFrom("embedding").select("doc_id").groupBy("doc_id").execute();
    return rows.map((r) => r.doc_id);
  }
  /**
   * Get embeddings by IDs (batch).
   * Used to fetch embedding records by their primary key (id).
   * Returns embedding as Buffer (BLOB format).
   */
  async getByIds(ids) {
    if (!ids.length) return [];
    const rows = await this.db.selectFrom("embedding").select(["id", "doc_id", "chunk_id", "chunk_type", "embedding"]).where("id", "in", ids).execute();
    return rows.map((r) => ({
      id: r.id,
      doc_id: r.doc_id,
      chunk_id: r.chunk_id ?? null,
      chunk_type: r.chunk_type ?? null,
      embedding: r.embedding
    }));
  }
  /**
   * Get embeddings by chunk IDs (batch).
   * Returns embedding as Buffer (BLOB format).
   */
  async getByChunkIds(chunkIds) {
    if (!chunkIds.length) return [];
    const rows = await this.db.selectFrom("embedding").select(["id", "doc_id", "chunk_id", "embedding"]).where("chunk_id", "in", chunkIds).execute();
    return rows.filter((r) => r.chunk_id != null);
  }
  async searchSimilarAndGetId(queryEmbedding, limit, scopeMode, scopeValue, excludeFolderPrefixes) {
    const searchResults = await this.searchSimilar(queryEmbedding, limit, scopeMode, scopeValue, excludeFolderPrefixes);
    if (!searchResults.length) {
      return [];
    }
    const distanceMap = /* @__PURE__ */ new Map();
    for (const result of searchResults) {
      distanceMap.set(result.embedding_id, result.distance);
    }
    const embeddingRows = await this.getByIds(searchResults.map((r) => r.embedding_id));
    return embeddingRows.map((row) => {
      const embeddingId = row.id;
      const distance = distanceMap.get(embeddingId) ?? Number.MAX_SAFE_INTEGER;
      return {
        ...row,
        distance,
        // Convert distance to similarity score: 1 / (1 + distance)
        similarity: 1 / (1 + distance)
      };
    });
  }
  /**
   * Vector similarity search using sqlite-vec KNN search.
   * 
   * This uses the vec0 virtual table with MATCH operator for efficient KNN search
   * without loading all embeddings into memory.
   * 
   * Explanation of rowid:
   * - `rowid` is SQLite's implicit integer primary key for each table
   * - vec_embeddings.rowid = embedding.rowid (they share the same rowid)
   * - This allows direct association: we can use vec_embeddings.rowid to query embedding table
   * 
   * Why do we need vec_embeddings virtual table?
   * - sqlite-vec requires a vec0 virtual table for KNN search (it provides optimized vector indexing)
   * - vec_embeddings stores vectors as native float[] format for efficient KNN search
   * - Both embedding table and vec_embeddings use BLOB format (binary float[]) for efficiency
   * 
   * @param queryEmbedding The query embedding vector (as number[] or Buffer)
   * @param limit Maximum number of results to return
   * @param scopeMode Optional scope mode for filtering
   * @param scopeValue Optional scope value for filtering
   * @returns Array of results with embedding_id (from embedding table) and distance
   */
  async searchSimilar(queryEmbedding, limit, scopeMode, scopeValue, excludeFolderPrefixes) {
    const checkStmt = this.rawDb.prepare(`
			SELECT name FROM sqlite_master 
			WHERE type='table' AND name='vec_embeddings'
		`);
    const result = checkStmt.get();
    if (!result) {
      throw new BusinessError(
        "VEC_EMBEDDINGS_TABLE_MISSING" /* VEC_EMBEDDINGS_TABLE_MISSING */,
        "vec_embeddings virtual table does not exist. Vector similarity search requires sqlite-vec extension. Please ensure sqlite-vec is installed (npm install sqlite-vec) and the extension is loaded during database initialization."
      );
    }
    const embeddingBuffer = Buffer.isBuffer(queryEmbedding) ? queryEmbedding : this.arrayToBuffer(queryEmbedding);
    let scopedRowids = null;
    if (scopeMode === "inFile" && scopeValue?.currentFilePath) {
      scopedRowids = await this.getEmbeddingRowidsByPath([scopeValue.currentFilePath]);
    } else if (scopeMode === "inFolder" && scopeValue?.folderPath) {
      const folderPath = (scopeValue.folderPath ?? "").trim().replace(/\/+$/, "") || void 0;
      if (folderPath) {
        scopedRowids = await this.getEmbeddingRowidsByFolder(folderPath);
      }
    } else if (scopeMode === "limitIdsSet" && scopeValue?.limitIdsSet) {
      scopedRowids = this.getEmbeddingRowidsByIds(Array.from(scopeValue.limitIdsSet));
    }
    let excludeRowids = [];
    if (scopeMode === "excludeDocIdsSet" && scopeValue?.excludeDocIdsSet && scopeValue.excludeDocIdsSet.size > 0) {
      excludeRowids = this.getEmbeddingRowidsByDocIds(Array.from(scopeValue.excludeDocIdsSet));
    }
    if (excludeFolderPrefixes?.length) {
      const prefixRowids = await this.getEmbeddingRowidsByPathPrefixes(excludeFolderPrefixes);
      excludeRowids = [...excludeRowids, ...prefixRowids];
    }
    let rowidFilter = "";
    if (scopedRowids && scopedRowids.length > 0) {
      rowidFilter = `AND ve.rowid IN (${scopedRowids.map(() => "?").join(",")})`;
    }
    if (excludeRowids.length > 0) {
      rowidFilter += ` AND ve.rowid NOT IN (${excludeRowids.map(() => "?").join(",")})`;
    }
    let sql4;
    let knnParams;
    sql4 = `
			SELECT
				ve.rowid,
				ve.distance
			FROM vec_embeddings ve
			WHERE ve.embedding MATCH ?
				AND k = ?
				${rowidFilter}
			ORDER BY ve.distance
		`;
    knnParams = [embeddingBuffer, limit];
    if (scopedRowids && scopedRowids.length > 0) {
      knnParams.push(...scopedRowids);
    }
    if (excludeRowids.length > 0) {
      knnParams.push(...excludeRowids);
    }
    const knnStmt = this.rawDb.prepare(sql4);
    const knnResults = knnStmt.all(...knnParams);
    if (!knnResults.length) {
      return [];
    }
    const rowids = knnResults.map((r) => r.rowid);
    const embeddingSql = `
			SELECT rowid, id FROM embedding
			WHERE rowid IN (${rowids.map(() => "?").join(",")})
		`;
    const embeddingStmt = this.rawDb.prepare(embeddingSql);
    const embeddings = embeddingStmt.all(...rowids);
    const rowidToEmbeddingId = new Map(embeddings.map((e) => [e.rowid, e.id]));
    return knnResults.map((r) => {
      const embeddingId = rowidToEmbeddingId.get(r.rowid);
      return embeddingId ? {
        embedding_id: embeddingId,
        distance: r.distance
      } : null;
    }).filter((r) => r !== null);
  }
  /**
   * Get embeddings by file IDs (batch).
   */
  async getByDocIds(docIds) {
    if (!docIds.length) return /* @__PURE__ */ new Map();
    const rows = await this.db.selectFrom("embedding").selectAll().where("doc_id", "in", docIds).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const arr = result.get(row.doc_id) ?? [];
      arr.push(row);
      result.set(row.doc_id, arr);
    }
    return result;
  }
  /**
   * Get embedding by chunk ID.
   */
  async getByChunkId(chunkId) {
    const row = await this.db.selectFrom("embedding").selectAll().where("chunk_id", "=", chunkId).executeTakeFirst();
    return row ?? null;
  }
  /**
   * Get embedding by content hash.
   */
  async getByContentHash(contentHash) {
    const row = await this.db.selectFrom("embedding").selectAll().where("content_hash", "=", contentHash).executeTakeFirst();
    return row ?? null;
  }
  /**
   * Delete embeddings and their corresponding vec_embeddings records by rowids.
   * This is a private helper method that ensures both tables stay in sync.
   */
  async deleteEmbeddingsAndVecEmbeddingsByRowids(rowids) {
    if (!rowids.length) return;
    const placeholders = rowids.map(() => "?").join(",");
    const deleteEmbeddingStmt = this.rawDb.prepare(`
			DELETE FROM embedding WHERE rowid IN (${placeholders})
		`);
    deleteEmbeddingStmt.run(...rowids);
    if (this.vecEmbeddingsTableExists) {
      const deleteVecStmt = this.rawDb.prepare(`
				DELETE FROM vec_embeddings WHERE rowid IN (${placeholders})
			`);
      deleteVecStmt.run(...rowids);
    }
  }
  /**
   * Delete embeddings by file ID.
   */
  async deleteByDocId(docId) {
    const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding WHERE doc_id = ?
		`);
    const rows = stmt.all(docId);
    if (rows.length > 0) {
      const rowids = rows.map((r) => r.rowid);
      await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
    }
  }
  /**
   * Delete embeddings by doc IDs (batch).
   */
  async deleteByDocIds(docIds) {
    if (!docIds.length) return;
    const placeholders = docIds.map(() => "?").join(",");
    const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding WHERE doc_id IN (${placeholders})
		`);
    const rows = stmt.all(...docIds);
    if (rows.length > 0) {
      const rowids = rows.map((r) => r.rowid);
      await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
    }
  }
  /**
   * Remove orphan embedding rows (doc_id not linked to a document mobius node).
   */
  async cleanupOrphanEmbeddings() {
    const ph = GRAPH_INDEXED_NOTE_NODE_TYPES.map(() => "?").join(", ");
    const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding WHERE doc_id NOT IN (SELECT node_id FROM mobius_node WHERE type IN (${ph}))
		`);
    const rows = stmt.all(...GRAPH_INDEXED_NOTE_NODE_TYPES);
    if (rows.length > 0) {
      const rowids = rows.map((r) => r.rowid);
      await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
    }
    return rows.length;
  }
  /**
   * Delete all embeddings.
   */
  async deleteAll() {
    const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding
		`);
    const rows = stmt.all();
    if (rows.length > 0) {
      const rowids = rows.map((r) => r.rowid);
      await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
    }
  }
  /**
   * Delete embedding by ID.
   */
  async deleteById(id) {
    const rowid = this.getEmbeddingRowid(id);
    if (rowid !== null) {
      await this.deleteEmbeddingsAndVecEmbeddingsByRowids([rowid]);
    }
  }
  /**
   * Delete embeddings by IDs (batch).
   */
  async deleteByIds(ids) {
    if (!ids.length) return;
    const rowids = [];
    for (const id of ids) {
      const rowid = this.getEmbeddingRowid(id);
      if (rowid !== null) {
        rowids.push(rowid);
      }
    }
    if (rowids.length > 0) {
      await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
    }
  }
  /**
   * Computes the global mean semantic embedding vector for a document (Global Mean Pooling).
   * Feature code should use {@link getEmbeddingForSemanticSearch} for doc-level KNN; this is a fallback
   * when no prioritized typed chunk has an embedding.
   *
   * [Mathematical Principle & Representational Power]
   * This method operates under the "semantic centroid" assumption: in vector space, the arithmetic mean of a set of vectors represents their geometric centroid.
   * When a document's theme is highly coherent (such as a single-topic technical doc or focused essay), this mean vector effectively captures and compresses the document's essential theme,
   * providing a single, summary-level vector fingerprint for the document.
   *
   * [Semantic Dilution Risk]
   * For long or heterogeneous documents containing multiple unrelated semantic centers, averaging can cause "semantic collapse."
   * The resulting mean vector may fall in a region of vector space that doesn't exist in reality, significantly reducing retrieval accuracy.
   *   Common failure cases:
   *   1. Extreme topic shifts: If the first half discusses "pasta recipes" and the second half "Java multithreading," the mean vector drifts to a noisy space 
   *      that represents neither cooking nor programming, causing both keyword searches to miss.
   *   2. Localized key info: In a 5000-word annual report with only a short mention of "company layoffs," the mean dilutes this signal among ordinary content, 
   *      masking critical features.
   *   3. Contradictory semantics: Discussing both "extreme heat" and "extreme cold" may yield a mean vector closer to "moderate climate," losing the extremes.
   *
   * [Optimization Suggestions] todo implement
   * 1. Head-Chunk pooling: For overly long documents, compute average on the first N chunks (where title/intro often concentrates core context).
   * 2. Salience weighting: Use chunk position or IDF to weight the mean.
   * 3. Multi-center representation: For long/heterogeneous docs, store multiple cluster centroids or raw chunk embeddings instead of a single mean.
   *
   * @param docId - Unique document identifier
   * @returns High-dimensional vector (number[]) representing the document's global semantics, or null if none found
   */
  async getAverageEmbeddingForDoc(docId) {
    const embeddings = await this.getByDocId(docId);
    if (!embeddings.length) {
      return null;
    }
    const embeddingDim = embeddings[0].embedding_len;
    const averageVector = new Array(embeddingDim).fill(0);
    for (const embedding of embeddings) {
      const buffer = embedding.embedding;
      for (let i = 0; i < buffer.length; i += 4) {
        const floatValue = buffer.readFloatLE(i);
        averageVector[i / 4] += floatValue;
      }
    }
    for (let i = 0; i < averageVector.length; i++) {
      averageVector[i] /= embeddings.length;
    }
    return averageVector;
  }
  /**
   * **Single entry point** for doc-level semantic retrieval (KNN, inspector neighbors, path/grouping,
   * batch semantic edges). Call sites must not pick chunks via {@link getByDocId} for query vectors.
   *
   * Priority (first embedding found wins): `summary_short` → `summary_full` →
   * `salient_textrank_sentence` → `body_raw` (see {@link SEMANTIC_CHUNK_TYPE_ORDER}).
   * If none of those carry a vector, falls back to {@link getAverageEmbeddingForDoc} (mean of all chunks).
   */
  async getEmbeddingForSemanticSearch(docId) {
    const rows = await this.getByDocId(docId);
    if (!rows.length) return null;
    const byType = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const t = r.chunk_type ?? "body_raw";
      const arr = byType.get(t) ?? [];
      arr.push(r);
      byType.set(t, arr);
    }
    for (const t of SEMANTIC_CHUNK_TYPE_ORDER) {
      const list = byType.get(t);
      const first = list?.find((x) => x.embedding);
      if (first?.embedding) {
        return this.bufferToArray(first.embedding);
      }
    }
    return this.getAverageEmbeddingForDoc(docId);
  }
  /**
   * Clean up orphaned vec_embeddings records that exist in vec_embeddings table
   * but not in embedding table. This fixes data inconsistency issues.
   *
   * @returns Object with cleanup statistics: { found: number, deleted: number }
   */
  async cleanupOrphanedVecEmbeddings() {
    let found = 0;
    let deleted = 0;
    try {
      const checkStmt = this.rawDb.prepare(`
				SELECT name FROM sqlite_master
				WHERE type='table' AND name='vec_embeddings'
			`);
      const tableExists = checkStmt.get() !== void 0;
      if (!tableExists) {
        console.log("[EmbeddingRepo] vec_embeddings table does not exist, nothing to clean up");
        return { found: 0, deleted: 0 };
      }
      const orphanedStmt = this.rawDb.prepare(`
				SELECT ve.rowid
				FROM vec_embeddings ve
				LEFT JOIN embedding e ON ve.rowid = e.rowid
				WHERE e.rowid IS NULL
			`);
      const orphanedRecords = orphanedStmt.all();
      found = orphanedRecords.length;
      if (found === 0) {
        console.log("[EmbeddingRepo] No orphaned vec_embeddings records found");
        return { found: 0, deleted: 0 };
      }
      console.log(`[EmbeddingRepo] Found ${found} orphaned vec_embeddings records`);
      const rowids = orphanedRecords.map((r) => r.rowid);
      const placeholders = rowids.map(() => "?").join(",");
      const deleteStmt = this.rawDb.prepare(`
				DELETE FROM vec_embeddings WHERE rowid IN (${placeholders})
			`);
      deleteStmt.run(...rowids);
      deleted = rowids.length;
      console.log(`[EmbeddingRepo] Successfully deleted ${deleted} orphaned vec_embeddings records`);
    } catch (error) {
      console.error("[EmbeddingRepo] Error during cleanup:", error);
      throw error;
    }
    return { found, deleted };
  }
};

// src/core/storage/sqlite/repositories/IndexStateRepo.ts
var IndexStateRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Check if index state exists by key.
   */
  async existsByKey(key) {
    const row = await this.db.selectFrom("index_state").select("key").where("key", "=", key).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new index state.
   */
  async insert(state) {
    await this.db.insertInto("index_state").values(state).execute();
  }
  /**
   * Update existing index state by key.
   */
  async updateByKey(key, value) {
    await this.db.updateTable("index_state").set({ value }).where("key", "=", key).execute();
  }
  async get(key) {
    const row = await this.db.selectFrom("index_state").select(["value"]).where("key", "=", key).executeTakeFirst();
    return row?.value != null ? String(row.value) : null;
  }
  async set(key, value) {
    const exists = await this.existsByKey(key);
    if (exists) {
      await this.updateByKey(key, value);
    } else {
      await this.insert({ key, value });
    }
  }
  /**
   * Clear all index state entries.
   */
  async clearAll() {
    await this.db.deleteFrom("index_state").execute();
  }
};

// src/core/storage/sqlite/repositories/MobiusNodeRepo.ts
var import_kysely2 = require("kysely");
var MOBIUS_PATH_GAP_PREFIX_SQL = import_kysely2.sql`CASE WHEN instr(mobius_node.path, '/') = 0 THEN mobius_node.path ELSE substr(mobius_node.path, 1, instr(mobius_node.path, '/') - 1) || '/' || substr(substr(mobius_node.path, instr(mobius_node.path, '/') + 1), 1, CASE WHEN instr(substr(mobius_node.path, instr(mobius_node.path, '/') + 1), '/') > 0 THEN instr(substr(mobius_node.path, instr(mobius_node.path, '/') + 1), '/') - 1 ELSE length(substr(mobius_node.path, instr(mobius_node.path, '/') + 1)) END) END`;
var MobiusNodeRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * One **SQL page** of `node_id` values (not a full-table load).
   * Query shape: `WHERE type IN (…) AND node_id > cursor ORDER BY node_id LIMIT pageSize`.
   * Callers implement pagination by passing `afterNodeId = last id from the previous page` until this returns `[]`.
   */
  async listNodeIdsByTypesKeyset(types, afterNodeId, limit) {
    const typeList = [...types];
    let q = this.db.selectFrom("mobius_node").select("node_id").where("type", "in", typeList).orderBy("node_id").limit(limit);
    if (afterNodeId != null && afterNodeId !== "") {
      q = q.where("node_id", ">", afterNodeId);
    }
    const rows = await q.execute();
    return rows.map((r) => r.node_id);
  }
  /**
   * Iterates all `mobius_node` rows matching `types` using keyset pagination (`listNodeIdsByTypesKeyset` in a loop).
   * @param betweenPages Optional hook after each page (e.g. yield to the event loop).
   */
  async forEachNodeIdsByTypesKeyset(types, pageSize, onPage, betweenPages) {
    let afterNodeId = null;
    let pageIndex = 0;
    for (; ; ) {
      const ids = await this.listNodeIdsByTypesKeyset(types, afterNodeId, pageSize);
      if (!ids.length) break;
      await onPage(ids, pageIndex++);
      afterNodeId = ids[ids.length - 1];
      await betweenPages?.();
    }
  }
  /** All `document` / `hub_doc` node ids (vault PageRank vertex set). */
  async listAllDocLikeNodeIds() {
    const rows = await this.db.selectFrom("mobius_node").select("node_id").where("type", "in", [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]).execute();
    return rows.map((r) => r.node_id);
  }
  /**
   * Vertex ids for semantic PageRank (same doc-like set as reference PageRank).
   */
  async listDocLikeSemanticPageRankVertices() {
    return this.listAllDocLikeNodeIds();
  }
  /**
   * Document-like rows with cached `doc_outgoing_cnt` (wiki references to doc-like targets).
   * Call after degree refresh so counts match the `references` subgraph used by streaming PageRank.
   */
  async listDocLikePageRankVertices() {
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "doc_outgoing_cnt"]).where("type", "in", [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]).execute();
    return rows.map((r) => ({
      node_id: r.node_id,
      doc_outgoing_cnt: Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0)))
    }));
  }
  /**
   * Merges keys into `attributes_json` for an indexed note row without dropping existing fields.
   */
  async mergeJsonAttributesForIndexedNoteNode(nodeId, merge, now = Date.now()) {
    const row = await this.db.selectFrom("mobius_node").select("attributes_json").where("node_id", "=", nodeId).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).executeTakeFirst();
    if (!row) return;
    let prev = {};
    try {
      prev = JSON.parse(row.attributes_json || "{}");
    } catch {
      prev = {};
    }
    const next = { ...prev, ...merge };
    await this.db.updateTable("mobius_node").set({
      attributes_json: JSON.stringify(next),
      updated_at: now
    }).where("node_id", "=", nodeId).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).execute();
  }
  /**
   * Clears cached semantic Mermaid overlay (and bumps rule version) on all document-like nodes
   * before a full vector-based `semantic_related` rebuild.
   */
  async clearSemanticOverlayFieldsForIndexedNotes(now, ruleVersion) {
    const ids = await this.listAllDocLikeNodeIds();
    let i = 0;
    for (const id of ids) {
      await this.mergeJsonAttributesForIndexedNoteNode(
        id,
        {
          semantic_overlay_mermaid: null,
          semantic_edge_rule_version: ruleVersion
        },
        now
      );
      i++;
      if (i % 200 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  /** Logical {@link DbSchema.graph_nodes} row from a `mobius_node` record. */
  graphNodeFromMobius(row) {
    return {
      id: row.node_id,
      type: row.type,
      label: row.label,
      attributes: row.attributes_json,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
  /** Logical {@link DbSchema.doc_statistics} from a document `mobius_node` row. */
  docStatisticsFromMobius(row) {
    if (!isIndexedNoteNodeType(row.type)) return null;
    return {
      doc_id: row.node_id,
      word_count: row.word_count,
      char_count: row.char_count,
      language: row.language,
      richness_score: row.richness_score,
      last_open_ts: row.last_open_ts,
      open_count: row.open_count,
      updated_at: row.updated_at
    };
  }
  /** Full `mobius_node` insert row from graph-upsert input (tag, category, placeholder doc, …). */
  mobiusRowFromGraphUpsert(node) {
    let path3 = null;
    try {
      const a = JSON.parse(node.attributes);
      if (typeof a?.path === "string") path3 = a.path;
    } catch {
      path3 = null;
    }
    return {
      node_id: node.id,
      type: node.type,
      label: node.label,
      created_at: node.created_at,
      infer_created_at: null,
      updated_at: node.updated_at,
      last_open_ts: null,
      open_count: null,
      path: isIndexedNoteNodeType(node.type) || node.type === GraphNodeType.Folder ? path3 : null,
      title: null,
      size: null,
      mtime: null,
      ctime: null,
      content_hash: null,
      summary: null,
      tags_json: null,
      word_count: null,
      char_count: null,
      language: null,
      richness_score: null,
      doc_incoming_cnt: null,
      doc_outgoing_cnt: null,
      other_incoming_cnt: null,
      other_outgoing_cnt: null,
      tag_doc_count: null,
      pagerank: null,
      pagerank_updated_at: null,
      pagerank_version: null,
      semantic_pagerank: null,
      semantic_pagerank_updated_at: null,
      semantic_pagerank_version: null,
      attributes_json: node.attributes || "{}"
    };
  }
  async existsByNodeId(nodeId) {
    const row = await this.db.selectFrom("mobius_node").select("node_id").where("node_id", "=", nodeId).executeTakeFirst();
    return row !== void 0;
  }
  /** Alias for {@link existsByNodeId} (graph-node id). */
  async existsById(id) {
    return this.existsByNodeId(id);
  }
  async getByNodeId(nodeId) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", nodeId).executeTakeFirst();
    return row ?? null;
  }
  /** Document row by vault path (unique when set). */
  /** Prefer indexed document row when multiple nodes could share display paths. */
  async getByPath(path3) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("path", "=", path3).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).executeTakeFirst();
    return row ?? null;
  }
  // --- Graph node DTO (`graph_nodes` shape on `mobius_node`) ---
  async insert(graphNode) {
    const row = this.mobiusRowFromGraphUpsert(graphNode);
    await this.db.insertInto("mobius_node").values(row).execute();
  }
  async updateById(id, updates) {
    const patch = {};
    if (updates.type !== void 0) patch.type = updates.type;
    if (updates.label !== void 0) patch.label = updates.label;
    if (updates.attributes !== void 0) patch.attributes_json = updates.attributes;
    if (updates.updated_at !== void 0) patch.updated_at = updates.updated_at;
    if (!Object.keys(patch).length) return;
    await this.db.updateTable("mobius_node").set(patch).where("node_id", "=", id).execute();
  }
  /**
   * Upsert a graph node; document rows merge `attributes_json` so indexed-document columns are preserved.
   */
  async upsert(graphNode) {
    const now = Date.now();
    const exists = await this.existsById(graphNode.id);
    if (exists && isIndexedNoteNodeType(graphNode.type)) {
      const existing = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", graphNode.id).executeTakeFirst();
      if (existing) {
        let prevAttrs = {};
        try {
          prevAttrs = JSON.parse(existing.attributes_json || "{}");
        } catch {
          prevAttrs = {};
        }
        let incomingAttrs = {};
        try {
          incomingAttrs = JSON.parse(graphNode.attributes);
        } catch {
          incomingAttrs = { raw: graphNode.attributes };
        }
        const merged = { ...prevAttrs, ...incomingAttrs };
        let path3 = existing.path;
        if (typeof incomingAttrs.path === "string") path3 = incomingAttrs.path;
        await this.db.updateTable("mobius_node").set({
          label: graphNode.label,
          attributes_json: JSON.stringify(merged),
          path: path3 ?? existing.path,
          updated_at: graphNode.updated_at ?? now
        }).where("node_id", "=", graphNode.id).execute();
        return;
      }
    }
    if (exists) {
      if (graphNode.type === GraphNodeType.Folder) {
        let folderPath = null;
        try {
          const a = JSON.parse(graphNode.attributes);
          if (typeof a?.path === "string") folderPath = a.path;
        } catch {
          folderPath = null;
        }
        await this.db.updateTable("mobius_node").set({
          type: graphNode.type,
          label: graphNode.label,
          attributes_json: graphNode.attributes,
          path: folderPath,
          updated_at: graphNode.updated_at ?? now
        }).where("node_id", "=", graphNode.id).execute();
        return;
      }
      await this.updateById(graphNode.id, {
        type: graphNode.type,
        label: graphNode.label,
        attributes: graphNode.attributes,
        updated_at: graphNode.updated_at ?? now
      });
    } else {
      await this.insert({
        id: graphNode.id,
        type: graphNode.type,
        label: graphNode.label,
        attributes: graphNode.attributes,
        created_at: graphNode.created_at ?? now,
        updated_at: graphNode.updated_at ?? now
      });
    }
  }
  async getById(id) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", id).executeTakeFirst();
    return row ? this.graphNodeFromMobius(row) : null;
  }
  async getByIds(ids) {
    if (!ids.length) return /* @__PURE__ */ new Map();
    const rows = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "in", ids).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      result.set(row.node_id, this.graphNodeFromMobius(row));
    }
    return result;
  }
  async getByType(type) {
    const rows = await this.db.selectFrom("mobius_node").selectAll().where("type", "=", type).execute();
    return rows.map((r) => this.graphNodeFromMobius(r));
  }
  async getByTypeAndLabels(type, labels) {
    if (!labels.length) return [];
    const rows = await this.db.selectFrom("mobius_node").selectAll().where("type", "=", type).where("label", "in", labels).execute();
    return rows.map((r) => this.graphNodeFromMobius(r));
  }
  async getIdsByIdsAndTypes(ids, types) {
    if (!ids.length || !types.length) return [];
    const rows = await this.db.selectFrom("mobius_node").select(["node_id"]).where("node_id", "in", ids).where("type", "in", types).execute();
    return rows.map((row) => row.node_id);
  }
  async deleteById(id) {
    await this.db.deleteFrom("mobius_node").where("node_id", "=", id).execute();
  }
  async deleteByIds(ids) {
    if (!ids.length) return;
    await this.deleteByNodeIds(ids);
  }
  async deleteByType(type) {
    await this.db.deleteFrom("mobius_node").where("type", "=", type).execute();
  }
  /**
   * Upsert a mobius node (insert or full replace of scalar fields).
   */
  async upsertMobiusRow(row) {
    const exists = await this.existsByNodeId(row.node_id);
    if (exists) {
      await this.db.updateTable("mobius_node").set({
        type: row.type,
        label: row.label,
        infer_created_at: row.infer_created_at,
        updated_at: row.updated_at,
        last_open_ts: row.last_open_ts,
        open_count: row.open_count,
        path: row.path,
        title: row.title,
        size: row.size,
        mtime: row.mtime,
        ctime: row.ctime,
        content_hash: row.content_hash,
        summary: row.summary,
        tags_json: row.tags_json,
        word_count: row.word_count,
        char_count: row.char_count,
        language: row.language,
        richness_score: row.richness_score,
        doc_incoming_cnt: row.doc_incoming_cnt,
        doc_outgoing_cnt: row.doc_outgoing_cnt,
        other_incoming_cnt: row.other_incoming_cnt,
        other_outgoing_cnt: row.other_outgoing_cnt,
        tag_doc_count: row.tag_doc_count,
        pagerank: row.pagerank,
        pagerank_updated_at: row.pagerank_updated_at,
        pagerank_version: row.pagerank_version,
        semantic_pagerank: row.semantic_pagerank,
        semantic_pagerank_updated_at: row.semantic_pagerank_updated_at,
        semantic_pagerank_version: row.semantic_pagerank_version,
        attributes_json: row.attributes_json
      }).where("node_id", "=", row.node_id).execute();
    } else {
      await this.db.insertInto("mobius_node").values(row).execute();
    }
  }
  async updatePathAndDocumentFields(nodeId, updates) {
    await this.db.updateTable("mobius_node").set({
      path: updates.path,
      label: updates.label,
      title: updates.title,
      mtime: updates.mtime,
      attributes_json: updates.attributes_json,
      updated_at: updates.updated_at
    }).where("node_id", "=", nodeId).execute();
  }
  /**
   * Increment open_count and set last_open_ts for indexed note rows (`document` / `hub_doc`).
   */
  async recordOpen(docId, ts) {
    await this.db.updateTable("mobius_node").set({
      last_open_ts: ts,
      open_count: import_kysely2.sql`coalesce(open_count, 0) + 1`,
      updated_at: ts
    }).where("node_id", "=", docId).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).execute();
  }
  async deleteByNodeIds(nodeIds) {
    if (!nodeIds.length) return;
    await this.db.deleteFrom("mobius_node").where("node_id", "in", nodeIds).execute();
  }
  async deleteAll() {
    await this.db.deleteFrom("mobius_node").execute();
  }
  // --- Document statistics (DTO `doc_statistics` on document `mobius_node` rows) ---
  docStatisticsRowQuery() {
    return this.db.selectFrom("mobius_node").where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]);
  }
  async existsByDocId(docId) {
    const row = await this.docStatisticsRowQuery().select("node_id").where("node_id", "=", docId).executeTakeFirst();
    return row !== void 0;
  }
  async insertDocumentStatistics(stats) {
    await this.updateDocumentStatisticsByDocId(stats.doc_id, {
      word_count: stats.word_count,
      char_count: stats.char_count,
      language: stats.language,
      richness_score: stats.richness_score,
      last_open_ts: stats.last_open_ts,
      updated_at: stats.updated_at
    });
  }
  async updateDocumentStatisticsByDocId(docId, updates) {
    const patch = {};
    if (updates.word_count !== void 0) patch.word_count = updates.word_count;
    if (updates.char_count !== void 0) patch.char_count = updates.char_count;
    if (updates.language !== void 0) patch.language = updates.language;
    if (updates.richness_score !== void 0) patch.richness_score = updates.richness_score;
    if (updates.last_open_ts !== void 0) patch.last_open_ts = updates.last_open_ts;
    if (updates.updated_at !== void 0) patch.updated_at = updates.updated_at;
    if (!Object.keys(patch).length) return;
    await this.db.updateTable("mobius_node").set(patch).where("node_id", "=", docId).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).execute();
  }
  async upsertDocumentStatistics(stats) {
    const exists = await this.existsByDocId(stats.doc_id);
    if (exists) {
      await this.updateDocumentStatisticsByDocId(stats.doc_id, {
        word_count: stats.word_count ?? null,
        char_count: stats.char_count ?? null,
        language: stats.language ?? null,
        richness_score: stats.richness_score ?? null,
        last_open_ts: stats.last_open_ts ?? null,
        updated_at: stats.updated_at
      });
    }
  }
  async getRecent(topK) {
    const limit = Math.max(1, topK || 20);
    const rows = await this.docStatisticsRowQuery().select(["node_id", "last_open_ts", "open_count"]).where("last_open_ts", "is not", null).orderBy("last_open_ts", "desc").limit(limit).execute();
    return rows.map((row) => ({
      docId: String(row.node_id),
      lastOpenTs: Number(row.last_open_ts ?? 0),
      openCount: Number(row.open_count ?? 0)
    }));
  }
  async getSignalsForDocIds(docIds) {
    if (!docIds.length) return /* @__PURE__ */ new Map();
    const rows = await this.docStatisticsRowQuery().select([
      "node_id",
      "type",
      "last_open_ts",
      "open_count",
      "doc_incoming_cnt",
      "pagerank_version"
    ]).where("node_id", "in", docIds).execute();
    const out = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const pv = row.pagerank_version;
      out.set(String(row.node_id), {
        lastOpenTs: Number(row.last_open_ts ?? 0),
        openCount: Number(row.open_count ?? 0),
        docIncomingCnt: Number(row.doc_incoming_cnt ?? 0),
        mobiusNodeType: String(row.type ?? ""),
        pagerankVersion: typeof pv === "number" ? pv : void 0
      });
    }
    return out;
  }
  /**
   * Persists vault PageRank scalars on document-like rows (`pagerank*` columns, not `attributes_json`).
   */
  async setPageRankForDocLikeNode(nodeId, fields, now = Date.now()) {
    await this.db.updateTable("mobius_node").set({
      pagerank: fields.pagerank,
      pagerank_updated_at: fields.pagerank_updated_at,
      pagerank_version: fields.pagerank_version,
      updated_at: now
    }).where("node_id", "=", nodeId).where("type", "in", [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]).execute();
  }
  /**
   * Persists weighted semantic PageRank on `semantic_related` (`semantic_pagerank*` columns).
   */
  async setSemanticPageRankForDocLikeNode(nodeId, fields, now = Date.now()) {
    await this.db.updateTable("mobius_node").set({
      semantic_pagerank: fields.semantic_pagerank,
      semantic_pagerank_updated_at: fields.semantic_pagerank_updated_at,
      semantic_pagerank_version: fields.semantic_pagerank_version,
      updated_at: now
    }).where("node_id", "=", nodeId).where("type", "in", [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]).execute();
  }
  async getByDocId(docId) {
    const row = await this.docStatisticsRowQuery().selectAll().where("node_id", "=", docId).executeTakeFirst();
    return row ? this.docStatisticsFromMobius(row) : null;
  }
  async getByDocIds(docIds) {
    if (!docIds.length) return /* @__PURE__ */ new Map();
    const rows = await this.docStatisticsRowQuery().selectAll().where("node_id", "in", docIds).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const s = this.docStatisticsFromMobius(row);
      if (s) result.set(s.doc_id, s);
    }
    return result;
  }
  async deleteDocumentStatisticsByDocId(docId) {
    await this.db.updateTable("mobius_node").set({
      word_count: null,
      char_count: null,
      language: null,
      richness_score: null,
      last_open_ts: null,
      open_count: null,
      updated_at: Date.now()
    }).where("node_id", "=", docId).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).execute();
  }
  async deleteDocumentStatisticsByDocIds(docIds) {
    if (!docIds.length) return;
    for (const id of docIds) await this.deleteDocumentStatisticsByDocId(id);
  }
  /** Clears statistic columns on all document rows (does not delete nodes). */
  async clearAllDocumentStatistics() {
    await this.db.updateTable("mobius_node").set({
      word_count: null,
      char_count: null,
      language: null,
      richness_score: null,
      last_open_ts: null,
      open_count: null,
      updated_at: Date.now()
    }).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).execute();
  }
  async cleanupOrphanStats() {
    return 0;
  }
  async getTopByRichness(limit) {
    const rows = await this.docStatisticsRowQuery().selectAll().orderBy("richness_score", "desc").limit(limit).execute();
    return rows.map((r) => this.docStatisticsFromMobius(r)).filter((s) => s != null);
  }
  async countAllDocumentStatisticsRows() {
    const r = await this.docStatisticsRowQuery().select(({ fn }) => fn.countAll().as("c")).executeTakeFirst();
    return Number(r?.c ?? 0);
  }
  async getTopRecentEditedByDocIds(docIds, limit) {
    if (docIds !== void 0 && docIds.length === 0) return [];
    let q = this.docStatisticsRowQuery().select(["node_id", "updated_at"]).where("updated_at", "is not", null).orderBy("updated_at", "desc").limit(limit);
    if (docIds !== void 0) q = q.where("node_id", "in", docIds);
    const rows = await q.execute();
    return rows.map((r) => ({ doc_id: r.node_id, updated_at: r.updated_at }));
  }
  async getTopWordCountByDocIds(docIds, limit) {
    if (docIds !== void 0 && docIds.length === 0) return [];
    let q = this.docStatisticsRowQuery().select(["node_id", "word_count"]).where("word_count", "is not", null).orderBy("word_count", "desc").limit(limit);
    if (docIds !== void 0) q = q.where("node_id", "in", docIds);
    const rows = await q.execute();
    return rows.map((r) => ({ doc_id: r.node_id, word_count: Number(r.word_count) }));
  }
  async getTopCharCountByDocIds(docIds, limit) {
    if (docIds !== void 0 && docIds.length === 0) return [];
    let q = this.docStatisticsRowQuery().select(["node_id", "char_count"]).where("char_count", "is not", null).orderBy("char_count", "desc").limit(limit);
    if (docIds !== void 0) q = q.where("node_id", "in", docIds);
    const rows = await q.execute();
    return rows.map((r) => ({ doc_id: r.node_id, char_count: Number(r.char_count) }));
  }
  async getTopRichnessByDocIds(docIds, limit) {
    if (docIds !== void 0 && docIds.length === 0) return [];
    let q = this.docStatisticsRowQuery().select(["node_id", "richness_score"]).where("richness_score", "is not", null).orderBy("richness_score", "desc").limit(limit);
    if (docIds !== void 0) q = q.where("node_id", "in", docIds);
    const rows = await q.execute();
    return rows.map((r) => ({ doc_id: r.node_id, richness_score: Number(r.richness_score) }));
  }
  async getLanguageStatsByDocIds(docIds) {
    if (docIds !== void 0 && docIds.length === 0) return [];
    let q = this.docStatisticsRowQuery().select(({ fn }) => ["language", fn.count("node_id").as("count")]).where("language", "is not", null).groupBy("language");
    if (docIds !== void 0) q = q.where("node_id", "in", docIds);
    const rows = await q.execute();
    return rows;
  }
  /**
   * Refresh degree columns for tag nodes touched by these tag node ids (cheaper than full recompute).
   */
  async refreshTagDocCountsForTagNodeIds(tagNodeIds, now = Date.now()) {
    for (const id of tagNodeIds) {
      await import_kysely2.sql`
				UPDATE mobius_node SET
					tag_doc_count = (
						SELECT COUNT(DISTINCT e.from_node_id)
						FROM mobius_edge e
						WHERE e.to_node_id = ${id} AND (
							e.type = ${GraphEdgeType.TaggedTopic}
							OR e.type = ${GraphEdgeType.TaggedFunctional}
							OR e.type = ${GraphEdgeType.TaggedKeyword}
						)
					),
					updated_at = ${now}
				WHERE type IN (${GraphNodeType.TopicTag}, ${GraphNodeType.FunctionalTag}, ${GraphNodeType.KeywordTag}) AND node_id = ${id}
			`.execute(this.db);
    }
  }
  /**
   * Sets outgoing degree counts from indexer (matches edges written for this document).
   */
  async setDocumentOutgoingDegreeCounts(nodeId, docOutgoingCnt, otherOutgoingCnt, now = Date.now()) {
    await this.db.updateTable("mobius_node").set({
      doc_outgoing_cnt: docOutgoingCnt,
      other_outgoing_cnt: otherOutgoingCnt,
      updated_at: now
    }).where("node_id", "=", nodeId).where("type", "in", [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]).execute();
  }
  /**
   * Per-target counts for incoming edges (`to_node_id` in batch): References vs other.
   * Treats `References` as doc↔doc wiki links only (no `mobius_node` lookup).
   */
  async computeIncomingDocDegreeCountsBatch(nodeIds) {
    const out = /* @__PURE__ */ new Map();
    for (const id of nodeIds) out.set(id, { doc: 0, other: 0 });
    if (!nodeIds.length) return out;
    const ref = GraphEdgeType.References;
    const rows = await this.db.selectFrom("mobius_edge").select([
      "to_node_id",
      import_kysely2.sql`sum(case when type = ${ref} then 1 else 0 end)`.as("doc_cnt"),
      import_kysely2.sql`sum(case when type = ${ref} then 0 else 1 end)`.as("other_cnt")
    ]).where("to_node_id", "in", nodeIds).groupBy("to_node_id").execute();
    for (const row of rows) {
      const b = out.get(row.to_node_id);
      if (!b) continue;
      b.doc = Number(row.doc_cnt);
      b.other = Number(row.other_cnt);
    }
    return out;
  }
  /**
   * Per-source counts for outgoing edges (`from_node_id` in batch): References vs other.
   * Same invariant as {@link computeIncomingDocDegreeCountsBatch}.
   */
  async computeOutgoingDocDegreeCountsBatch(nodeIds) {
    const out = /* @__PURE__ */ new Map();
    for (const id of nodeIds) out.set(id, { doc: 0, other: 0 });
    if (!nodeIds.length) return out;
    const ref = GraphEdgeType.References;
    const rows = await this.db.selectFrom("mobius_edge").select([
      "from_node_id",
      import_kysely2.sql`sum(case when type = ${ref} then 1 else 0 end)`.as("doc_cnt"),
      import_kysely2.sql`sum(case when type = ${ref} then 0 else 1 end)`.as("other_cnt")
    ]).where("from_node_id", "in", nodeIds).groupBy("from_node_id").execute();
    for (const row of rows) {
      const b = out.get(row.from_node_id);
      if (!b) continue;
      b.doc = Number(row.doc_cnt);
      b.other = Number(row.other_cnt);
    }
    return out;
  }
  /**
   * Recomputes incoming degree columns from `mobius_edge` for document/hub nodes (after neighbors add/remove edges).
   */
  async refreshDocumentIncomingDegreesForNodeIds(nodeIds, now = Date.now()) {
    if (!nodeIds.length) return;
    const d = GraphNodeType.Document;
    const h = GraphNodeType.HubDoc;
    const incoming = await this.computeIncomingDocDegreeCountsBatch(nodeIds);
    for (const id of nodeIds) {
      const b = incoming.get(id);
      await this.db.updateTable("mobius_node").set({
        doc_incoming_cnt: b.doc,
        other_incoming_cnt: b.other,
        updated_at: now
      }).where("node_id", "=", id).where("type", "in", [d, h]).execute();
    }
  }
  /**
   * Full recompute of all four degree columns from edges (repair / batch refresh; prefer {@link setDocumentOutgoingDegreeCounts} + {@link refreshDocumentIncomingDegreesForNodeIds} on index).
   */
  async refreshDocumentDegreesForNodeIds(nodeIds, now = Date.now()) {
    if (!nodeIds.length) return;
    const d = GraphNodeType.Document;
    const h = GraphNodeType.HubDoc;
    const [incoming, outgoing] = await Promise.all([
      this.computeIncomingDocDegreeCountsBatch(nodeIds),
      this.computeOutgoingDocDegreeCountsBatch(nodeIds)
    ]);
    for (const id of nodeIds) {
      const inc = incoming.get(id);
      const out = outgoing.get(id);
      await this.db.updateTable("mobius_node").set({
        doc_outgoing_cnt: out.doc,
        doc_incoming_cnt: inc.doc,
        other_outgoing_cnt: out.other,
        other_incoming_cnt: inc.other,
        updated_at: now
      }).where("node_id", "=", id).where("type", "in", [d, h]).execute();
    }
  }
  // --- Hub discovery & local hub graph (read-only helpers) ---
  /**
   * Document counts grouped by gap path prefix (same bucketing as hub discovery round-summary gaps).
   */
  async listDocumentGapPrefixCounts() {
    const gapInner = this.db.selectFrom("mobius_node").select(MOBIUS_PATH_GAP_PREFIX_SQL.as("path_prefix")).where("type", "=", GraphNodeType.Document).where("path", "is not", null).as("gap_inner");
    const rows = await this.db.selectFrom(gapInner).select((eb) => ["path_prefix", eb.fn.countAll().as("c")]).groupBy("path_prefix").execute();
    return rows.map((r) => ({
      pathPrefix: String(r.path_prefix),
      documentCount: Number(r.c)
    }));
  }
  /**
   * Sample document paths in one gap bucket excluding already-covered nodes (bounded repeated scans).
   */
  async listSampleUncoveredPathsForGapPrefix(gapPrefix, isCovered, sampleLimit) {
    const lim = Math.max(1, Math.min(50, sampleLimit));
    const out = [];
    let fetchLimit = 100;
    const maxFetch = 1e4;
    while (out.length < lim && fetchLimit <= maxFetch) {
      const rows = await this.db.selectFrom("mobius_node").select(["path", "node_id"]).where("type", "=", GraphNodeType.Document).where("path", "is not", null).where(import_kysely2.sql`(${MOBIUS_PATH_GAP_PREFIX_SQL}) = ${gapPrefix}`).orderBy("path").limit(fetchLimit).execute();
      for (const r of rows) {
        const p = r.path ?? "";
        if (!p) continue;
        if (isCovered(r.node_id)) continue;
        out.push(p);
        if (out.length >= lim) break;
      }
      if (rows.length < fetchLimit) break;
      fetchLimit = Math.min(maxFetch, Math.ceil(fetchLimit * 1.5));
    }
    return out;
  }
  /**
   * Lightweight document list for hub coverage bitsets (same filter as hub discovery: document + non-null path).
   * Ordinals are stable row indices (ordered by `node_id`).
   */
  async listDocumentNodeIdPathForCoverageIndex() {
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "path"]).where("type", "=", GraphNodeType.Document).where("path", "is not", null).orderBy("node_id").execute();
    return rows;
  }
  /** Columns used when ranking documents for automatic hub candidates. */
  async listDocumentNodesForHubDiscovery() {
    const rows = await this.db.selectFrom("mobius_node").select([
      "node_id",
      "path",
      "label",
      "type",
      "doc_incoming_cnt",
      "doc_outgoing_cnt",
      "pagerank",
      "semantic_pagerank",
      "word_count"
    ]).where("type", "=", GraphNodeType.Document).where("path", "is not", null).execute();
    return rows;
  }
  /**
   * Clears materialized hub stats on folder nodes (`tag_doc_count`, `pagerank`, `semantic_pagerank`, doc degrees reused for folder rollup).
   */
  async clearFolderHubMaterializedStatsColumns(now = Date.now()) {
    await this.db.updateTable("mobius_node").set({
      tag_doc_count: null,
      pagerank: null,
      semantic_pagerank: null,
      doc_incoming_cnt: null,
      doc_outgoing_cnt: null,
      updated_at: now
    }).where("type", "=", GraphNodeType.Folder).execute();
  }
  /**
   * One keyset page of document rows used to rebuild folder hub aggregates (after PageRank is persisted).
   * Excludes paths under `hubSummaryFolder` (same predicate as {@link listTopDocumentNodesForHubDiscovery}).
   */
  async listDocumentRowsForFolderHubStatsKeyset(afterNodeId, limit, hubSummaryFolder) {
    const lim = Math.max(1, limit);
    const hub = hubSummaryFolder.trim();
    const likeUnderHub = hub ? `${hub}/%` : "";
    let q = this.db.selectFrom("mobius_node").select([
      "node_id",
      "path",
      "pagerank",
      "semantic_pagerank",
      "doc_incoming_cnt",
      "doc_outgoing_cnt"
    ]).where("type", "=", GraphNodeType.Document).where("path", "is not", null).orderBy("node_id").limit(lim);
    if (hub) {
      q = q.where((eb) => eb.and([eb("path", "!=", hub), eb("path", "not like", likeUnderHub)]));
    }
    if (afterNodeId != null && afterNodeId !== "") {
      q = q.where("node_id", ">", afterNodeId);
    }
    const rows = await q.execute();
    return rows.map((r) => ({
      node_id: r.node_id,
      path: r.path,
      pagerank: r.pagerank,
      semantic_pagerank: r.semantic_pagerank,
      doc_incoming_cnt: r.doc_incoming_cnt,
      doc_outgoing_cnt: r.doc_outgoing_cnt
    }));
  }
  /**
   * Persists one folder node's materialized hub stats (reused columns; see hub docs).
   */
  async updateFolderNodeHubMaterializedStats(nodeId, stats, now = Date.now()) {
    await this.db.updateTable("mobius_node").set({
      tag_doc_count: stats.tagDocCount,
      pagerank: stats.avgPagerank,
      semantic_pagerank: stats.avgSemanticPagerank,
      doc_incoming_cnt: stats.maxDocIncoming,
      doc_outgoing_cnt: stats.maxDocOutgoing,
      updated_at: now
    }).where("node_id", "=", nodeId).where("type", "=", GraphNodeType.Folder).execute();
  }
  /**
   * Top folder hub candidates from materialized columns on `type=folder` (excludes Hub-Summaries subtree).
   * Scoring matches folder branch in hub discovery; computed in SQL and ordered before limit.
   */
  async listTopFolderNodesForHubDiscovery(limit, hubSummaryFolder) {
    const lim = Math.max(1, limit);
    const hub = hubSummaryFolder.trim();
    const likeUnderHub = hub ? `${hub}/%` : "";
    const hubPhysical = import_kysely2.sql`min(1.0, coalesce(pagerank, 0.0) * 2.2)`;
    const hubOrg = import_kysely2.sql`min(1.0, ln(1.0 + coalesce(tag_doc_count, 0)) * 0.18 + coalesce(doc_outgoing_cnt, 0) * 0.04)`;
    const hubSem = import_kysely2.sql`min(1.0, coalesce(semantic_pagerank, 0.0) * 1.0)`;
    const hubGraph = import_kysely2.sql`min(1.0, (${hubPhysical} * 0.3) + (${hubOrg} * 0.45) + (${hubSem} * 0.25))`;
    let q = this.db.selectFrom("mobius_node").select([
      "node_id",
      "path",
      "label",
      "tag_doc_count",
      "pagerank",
      "semantic_pagerank",
      "doc_incoming_cnt",
      "doc_outgoing_cnt",
      hubPhysical.as("hub_physical_authority_score"),
      hubOrg.as("hub_organizational_score"),
      hubSem.as("hub_semantic_centrality_score"),
      hubGraph.as("hub_graph_score")
    ]).where("type", "=", GraphNodeType.Folder).where("path", "is not", null).where("tag_doc_count", ">=", FOLDER_HUB_MIN_DOCS);
    if (hub) {
      q = q.where((eb) => eb.and([eb("path", "!=", hub), eb("path", "not like", likeUnderHub)]));
    }
    const rows = await q.orderBy("hub_graph_score", "desc").limit(lim).execute();
    return rows;
  }
  /**
   * Top `document` rows by hub graph score, excluding paths under `hubSummaryFolder` (Hub-Summaries subtree).
   * Scoring matches in-app `HubCandidateDiscoveryService.scoreDocumentRow`; computed in SQL to avoid full-table loads.
   *
   * Let `pr = coalesce(pagerank,0)`, `wc = coalesce(word_count,0)`, `inc = coalesce(doc_incoming_cnt,0)`,
   * `out = coalesce(doc_outgoing_cnt,0)`, `spr = coalesce(semantic_pagerank,0)` (all in SQL).
   *
   * - `longDocWeak = min(0.08, (wc / 50000) * 0.08)`
   * - `hub_physical_authority_score = min(1, pr * 2.5 + longDocWeak)`
   * - `hub_organizational_score = min(1, inc * 0.035 + out * 0.055)`
   * - `hub_semantic_centrality_score = min(1, spr * 1.2)`
   * - `hub_graph_score = min(1, hub_physical_authority_score * 0.35 + hub_organizational_score * 0.25 + hub_semantic_centrality_score * 0.35)`
   *
   * Rows are ordered by `hub_graph_score` descending, then limited to `limit`.
   */
  async listTopDocumentNodesForHubDiscovery(limit, hubSummaryFolder) {
    const lim = Math.max(1, limit);
    const hub = hubSummaryFolder.trim();
    const likeUnderHub = hub ? `${hub}/%` : "";
    const hubPhysical = import_kysely2.sql`min(1.0, (coalesce(pagerank, 0) * 2.5) + min(0.08, (coalesce(word_count, 0) / 50000.0) * 0.08))`;
    const hubOrg = import_kysely2.sql`min(1.0, (coalesce(doc_incoming_cnt, 0) * 0.035) + (coalesce(doc_outgoing_cnt, 0) * 0.055))`;
    const hubSem = import_kysely2.sql`min(1.0, coalesce(semantic_pagerank, 0) * 1.2)`;
    const hubGraph = import_kysely2.sql`min(1.0, (${hubPhysical} * 0.35) + (${hubOrg} * 0.25) + (${hubSem} * 0.35))`;
    let q = this.db.selectFrom("mobius_node").select([
      "node_id",
      "path",
      "label",
      "type",
      "doc_incoming_cnt",
      "doc_outgoing_cnt",
      "pagerank",
      "semantic_pagerank",
      "word_count",
      hubPhysical.as("hub_physical_authority_score"),
      hubOrg.as("hub_organizational_score"),
      hubSem.as("hub_semantic_centrality_score"),
      hubGraph.as("hub_graph_score")
    ]).where("type", "=", GraphNodeType.Document).where("path", "is not", null);
    if (hub) {
      q = q.where(
        (eb) => eb.and([eb("path", "!=", hub), eb("path", "not like", likeUnderHub)])
      );
    }
    const rows = await q.orderBy("hub_graph_score", "desc").limit(lim).execute();
    return rows;
  }
  /** Single `document` row by vault path (hub discovery helpers). */
  async getDocumentNodeForHubByPath(vaultPath) {
    const row = await this.db.selectFrom("mobius_node").select([
      "node_id",
      "path",
      "label",
      "type",
      "doc_incoming_cnt",
      "doc_outgoing_cnt",
      "pagerank",
      "semantic_pagerank",
      "word_count"
    ]).where("path", "=", vaultPath).where("type", "=", GraphNodeType.Document).executeTakeFirst();
    return row;
  }
  /** Indexed note row by path (`document` or `hub_doc`) for manual Hub-Summaries/Manual notes. */
  async getIndexedHubOrDocumentRowByPath(vaultPath) {
    const row = await this.db.selectFrom("mobius_node").select([
      "node_id",
      "path",
      "label",
      "type",
      "doc_incoming_cnt",
      "doc_outgoing_cnt",
      "pagerank",
      "semantic_pagerank",
      "word_count"
    ]).where("path", "=", vaultPath).where("type", "in", [GraphNodeType.Document, GraphNodeType.HubDoc]).executeTakeFirst();
    return row;
  }
  /** Seeds for semantic cluster hubs: top documents by `semantic_pagerank`. */
  async listDocumentNodesForHubClusterSeeds(limit) {
    const lim = Math.max(1, limit);
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "path", "label", "semantic_pagerank", "doc_incoming_cnt", "pagerank"]).where("type", "=", GraphNodeType.Document).where("path", "is not", null).orderBy("semantic_pagerank desc").limit(lim).execute();
    return rows;
  }
  /** Resolve paths for a set of document node ids (cluster member listing). */
  async listDocumentNodeIdPathByIds(nodeIds) {
    if (!nodeIds.length) return [];
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "path"]).where("node_id", "in", nodeIds).where("type", "=", GraphNodeType.Document).execute();
    return rows;
  }
  /** Resolve document `node_id` from vault path (hub coverage / inspector). */
  async getDocumentNodeIdByVaultPath(vaultPath) {
    const row = await this.db.selectFrom("mobius_node").select("node_id").where("path", "=", vaultPath).where("type", "=", GraphNodeType.Document).executeTakeFirst();
    return row?.node_id;
  }
  /** Resolve `document` or `hub_doc` node id from vault path (manual hubs / inspector). */
  async getHubOrDocumentNodeIdByVaultPath(vaultPath) {
    const row = await this.db.selectFrom("mobius_node").select("node_id").where("path", "=", vaultPath).where("type", "in", [GraphNodeType.Document, GraphNodeType.HubDoc]).executeTakeFirst();
    return row?.node_id;
  }
  /**
   * Batch-resolve `document` or `hub_doc` rows by vault path (`WHERE path IN (...)`), one round-trip.
   */
  async listHubOrDocumentNodeIdsByVaultPaths(vaultPaths) {
    const paths = [...new Set(vaultPaths.filter(Boolean))];
    if (paths.length === 0) return [];
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "path"]).where("path", "in", paths).where("type", "in", [GraphNodeType.Document, GraphNodeType.HubDoc]).execute();
    const out = [];
    for (const r of rows) {
      const p = r.path ?? "";
      if (!p) continue;
      out.push({ path: p, node_id: r.node_id });
    }
    return out;
  }
  /** Documents under a path prefix (folder hub coverage estimate). */
  async listDocumentNodeIdPathByPathPrefix(pathPrefix, limit) {
    const lim = Math.max(1, limit);
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "path"]).where("type", "=", GraphNodeType.Document).where("path", "like", `${pathPrefix}%`).limit(lim).execute();
    return rows;
  }
  /** Sample document vault paths under a folder prefix (HubDoc member list). */
  async listDocumentPathsByPathPrefix(pathPrefix, limit) {
    const lim = Math.max(1, limit);
    const rows = await this.db.selectFrom("mobius_node").select("path").where("type", "=", GraphNodeType.Document).where("path", "like", `${pathPrefix}%`).limit(lim).execute();
    return rows.map((r) => r.path ?? "").filter(Boolean);
  }
  /**
   * Sample document paths under a folder hub vault path (HubDoc assembly).
   * Normalizes to a trailing-slash prefix so LIKE matches children only.
   */
  async listFolderHubDocMemberPathsSample(folderPath, limit = 40) {
    const prefix = folderPath.endsWith("/") ? folderPath : `${folderPath}/`;
    return this.listDocumentPathsByPathPrefix(prefix, limit);
  }
  /** Batch load fields needed for weighted local hub graph nodes. */
  async listHubLocalGraphNodeMeta(nodeIds) {
    if (!nodeIds.length) return [];
    const rows = await this.db.selectFrom("mobius_node").select([
      "node_id",
      "path",
      "label",
      "type",
      "doc_incoming_cnt",
      "doc_outgoing_cnt",
      "pagerank",
      "semantic_pagerank",
      "tags_json"
    ]).where("node_id", "in", nodeIds).execute();
    return rows;
  }
  /** Count `mobius_node` rows with `type = document` (vault-backed notes). */
  async countDocumentNodes() {
    const r = await this.db.selectFrom("mobius_node").select(({ fn }) => fn.countAll().as("c")).where("type", "=", GraphNodeType.Document).executeTakeFirst();
    return Number(r?.c ?? 0);
  }
  /** Center node row for local hub graph expansion. */
  async getHubLocalGraphCenterMeta(nodeId) {
    const row = await this.db.selectFrom("mobius_node").select([
      "node_id",
      "path",
      "label",
      "type",
      "doc_incoming_cnt",
      "doc_outgoing_cnt",
      "pagerank",
      "semantic_pagerank",
      "tags_json"
    ]).where("node_id", "=", nodeId).executeTakeFirst();
    return row;
  }
};

// src/core/storage/sqlite/repositories/MobiusEdgeRepo.ts
var import_kysely3 = require("kysely");

// src/core/utils/id-utils.ts
var import_crypto = require("crypto");
var import_uuid = require("uuid");
function generateUuidWithoutHyphens() {
  return (0, import_uuid.v4)().replace(/-/g, "");
}
function generateStableUuid(input) {
  const hash = (0, import_crypto.createHash)("md5").update(input).digest("hex");
  const e = SLICE_CAPS.hash.md5UuidSliceEnds;
  const uuidWithHyphens = `${hash.slice(0, e[0])}-${hash.slice(e[0], e[1])}-${hash.slice(e[1], e[2])}-${hash.slice(e[2], e[3])}-${hash.slice(e[3], e[4])}`;
  return uuidWithHyphens.replace(/-/g, "");
}
function generateDocIdFromPath(path3) {
  return generateStableUuid(path3 ?? "");
}
function stableDocumentNodeIdTimeFallback(path3, timestampMs) {
  return generateStableUuid(`${path3}\0${timestampMs}`);
}
function stableMobiusFolderNodeId(tenant, folderPath) {
  return generateStableUuid(`mobius-folder:${tenant}:${folderPath}`);
}
function stableMobiusEdgeId(fromNodeId, toNodeId, edgeType) {
  return generateStableUuid(fromNodeId + toNodeId + edgeType);
}
function stableTopicTagNodeId(tag) {
  return generateStableUuid(`tag:${tag}`);
}
function stableFunctionalTagNodeId(tag) {
  return generateStableUuid(`functional:${tag}`);
}
function stableKeywordTagNodeId(tag) {
  return generateStableUuid(`keyword:${tag}`);
}
function stableContextTagNodeId(axis, label) {
  return generateStableUuid(`context:${axis}:${label}`);
}
function stableHubClusterNodeId(tenant, hash) {
  return generateStableUuid(`hub-cluster:${tenant}:${hash}`);
}

// src/core/storage/sqlite/repositories/MobiusEdgeRepo.ts
var MobiusEdgeRepo = class _MobiusEdgeRepo {
  constructor(db) {
    this.db = db;
  }
  /** Logical {@link DbSchema.graph_edges} row from stored `mobius_edge` (or raw SELECT). */
  graphEdgeFromMobius(row) {
    return {
      id: row.id,
      from_node_id: row.from_node_id,
      to_node_id: row.to_node_id,
      type: row.type,
      weight: row.weight,
      attributes: row.attributes_json ?? row.attributes ?? "{}",
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
  /**
   * Generate edge ID (now returns a UUID instead of composite string for better storage efficiency).
   */
  static generateEdgeId(fromNodeId, toNodeId, type) {
    return stableMobiusEdgeId(fromNodeId, toNodeId, type);
  }
  /**
   * Check if graph edge exists by id.
   */
  async existsById(id) {
    const row = await this.db.selectFrom("mobius_edge").select("id").where("id", "=", id).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new graph edge.
   */
  async insert(edge) {
    await this.db.insertInto("mobius_edge").values({
      id: edge.id,
      from_node_id: edge.from_node_id,
      to_node_id: edge.to_node_id,
      type: edge.type,
      label: null,
      weight: edge.weight,
      attributes_json: edge.attributes,
      created_at: edge.created_at,
      updated_at: edge.updated_at
    }).execute();
  }
  /**
   * Update existing graph edge by id.
   */
  async updateById(id, updates) {
    const patch = {};
    if (updates.weight !== void 0) patch.weight = updates.weight;
    if (updates.attributes !== void 0) patch.attributes_json = updates.attributes;
    if (updates.updated_at !== void 0) patch.updated_at = updates.updated_at;
    if (!Object.keys(patch).length) return;
    await this.db.updateTable("mobius_edge").set(patch).where("id", "=", id).execute();
  }
  /**
   * Upsert a graph edge.
   */
  async upsert(edge) {
    const now = Date.now();
    const id = edge.id ?? _MobiusEdgeRepo.generateEdgeId(edge.from_node_id, edge.to_node_id, edge.type);
    const exists = await this.existsById(id);
    if (exists) {
      await this.updateById(id, {
        weight: edge.weight ?? 1,
        attributes: edge.attributes,
        updated_at: edge.updated_at ?? now
      });
    } else {
      await this.insert({
        id,
        from_node_id: edge.from_node_id,
        to_node_id: edge.to_node_id,
        type: edge.type,
        weight: edge.weight ?? 1,
        attributes: edge.attributes,
        created_at: edge.created_at ?? now,
        updated_at: edge.updated_at ?? now
      });
    }
  }
  /**
   * Get edge by ID.
   */
  async getById(id) {
    const row = await this.db.selectFrom("mobius_edge").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.graphEdgeFromMobius(row) : null;
  }
  /**
   * Get edges by from_node_id.
   */
  async getByFromNode(fromNodeId) {
    const rows = await this.db.selectFrom("mobius_edge").selectAll().where("from_node_id", "=", fromNodeId).execute();
    return rows.map((row) => this.graphEdgeFromMobius(row));
  }
  /**
   * Get edges by from_node_id (batch).
   */
  async getByFromNodes(fromNodeIds) {
    if (!fromNodeIds.length) return [];
    const rows = await this.db.selectFrom("mobius_edge").selectAll().where("from_node_id", "in", fromNodeIds).execute();
    return rows.map((row) => this.graphEdgeFromMobius(row));
  }
  /**
   * Get edges by from_node_ids and types (batch).
   * todo we may need pagination for large result.
   */
  async getByFromNodesAndTypes(fromNodeIds, types) {
    if (!fromNodeIds.length || !types.length) return [];
    const rows = await this.db.selectFrom("mobius_edge").select(["to_node_id", "from_node_id", "type", "attributes_json"]).where("from_node_id", "in", fromNodeIds).where("type", "in", types).execute();
    return rows.map((r) => ({
      to_node_id: r.to_node_id,
      from_node_id: r.from_node_id,
      type: r.type,
      attributes: r.attributes_json ?? "{}"
    }));
  }
  /**
   * Get edges by to_node_ids and types (batch). No join.
   */
  async getByToNodesAndTypes(toNodeIds, types) {
    if (!toNodeIds.length || !types.length) return [];
    return await this.db.selectFrom("mobius_edge").select(["to_node_id", "from_node_id"]).where("to_node_id", "in", toNodeIds).where("type", "in", types).execute();
  }
  /**
   * Edge-only aggregate: filter by type, group by to_node_id, count. No join.
   * Caller should then look up mobius_node by to_node_id and sum counts by (type, label).
   */
  async getTagCategoryEdgeCountsByToNode(fromNodeIds) {
    let q = this.db.selectFrom("mobius_edge").select(["to_node_id", import_kysely3.sql`count(*)`.as("count")]).where("type", "in", [...GRAPH_TAGGED_EDGE_TYPES]).groupBy("to_node_id");
    if (fromNodeIds !== void 0 && fromNodeIds.length > 0) {
      q = q.where("from_node_id", "in", fromNodeIds);
    }
    const rows = await q.execute();
    return rows.map((r) => ({
      to_node_id: r.to_node_id,
      count: Number(r.count)
    }));
  }
  /**
   * Incoming edge counts. When `type` is omitted, uses `mobius_node` doc/other columns for document nodes
   * (aggregate columns rebuilt by {@link IndexService.runMobiusGlobalMaintenance} / per-index incoming refresh;
   * `semantic_related` edges by {@link IndexService.runMobiusGlobalMaintenance});
   * non-document ids fall back to `mobius_edge`.
   * When `type` is set, always aggregates from `mobius_edge` (cannot derive from cached columns).
   */
  async countInComingEdges(nodeIds, type) {
    if (!nodeIds.length) return /* @__PURE__ */ new Map();
    if (type !== void 0) {
      return this.countIncomingEdgesFromEdgeTable(nodeIds, type);
    }
    return this.countIncomingEdgesFromNodeColumns(nodeIds);
  }
  /**
   * Outgoing edge counts; same caching rules as {@link countInComingEdges}.
   */
  async countOutgoingEdges(nodeIds, type) {
    if (!nodeIds.length) return /* @__PURE__ */ new Map();
    if (type !== void 0) {
      return this.countOutgoingEdgesFromEdgeTable(nodeIds, type);
    }
    return this.countOutgoingEdgesFromNodeColumns(nodeIds);
  }
  async countIncomingEdgesFromEdgeTable(nodeIds, edgeType) {
    let query = this.db.selectFrom("mobius_edge").select(({ fn }) => [fn.count("id").as("count"), "to_node_id"]).where("to_node_id", "in", nodeIds);
    if (edgeType !== void 0) {
      query = query.where("type", "=", edgeType);
    }
    const rows = await query.groupBy(["to_node_id"]).execute();
    const map = /* @__PURE__ */ new Map();
    for (const row of rows) {
      map.set(row.to_node_id, row.count);
    }
    return map;
  }
  async countOutgoingEdgesFromEdgeTable(nodeIds, edgeType) {
    let query = this.db.selectFrom("mobius_edge").select(({ fn }) => [fn.count("id").as("count"), "from_node_id"]).where("from_node_id", "in", nodeIds);
    if (edgeType !== void 0) {
      query = query.where("type", "=", edgeType);
    }
    const rows = await query.groupBy(["from_node_id"]).execute();
    const map = /* @__PURE__ */ new Map();
    for (const row of rows) {
      map.set(row.from_node_id, row.count);
    }
    return map;
  }
  async countIncomingEdgesFromNodeColumns(nodeIds) {
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "type", "doc_incoming_cnt", "other_incoming_cnt"]).where("node_id", "in", nodeIds).execute();
    const byId = new Map(rows.map((r) => [r.node_id, r]));
    const fallback = /* @__PURE__ */ new Set();
    const map = /* @__PURE__ */ new Map();
    for (const id of nodeIds) {
      const r = byId.get(id);
      if (!r || !isIndexedNoteNodeType(r.type)) {
        fallback.add(id);
        continue;
      }
      map.set(id, (r.doc_incoming_cnt ?? 0) + (r.other_incoming_cnt ?? 0));
    }
    if (fallback.size) {
      const sub = await this.countIncomingEdgesFromEdgeTable([...fallback], void 0);
      for (const [k, v] of sub) map.set(k, v);
    }
    for (const id of nodeIds) {
      if (!map.has(id)) map.set(id, 0);
    }
    return map;
  }
  async countOutgoingEdgesFromNodeColumns(nodeIds) {
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "type", "doc_outgoing_cnt", "other_outgoing_cnt"]).where("node_id", "in", nodeIds).execute();
    const byId = new Map(rows.map((r) => [r.node_id, r]));
    const fallback = /* @__PURE__ */ new Set();
    const map = /* @__PURE__ */ new Map();
    for (const id of nodeIds) {
      const r = byId.get(id);
      if (!r || !isIndexedNoteNodeType(r.type)) {
        fallback.add(id);
        continue;
      }
      map.set(id, (r.doc_outgoing_cnt ?? 0) + (r.other_outgoing_cnt ?? 0));
    }
    if (fallback.size) {
      const sub = await this.countOutgoingEdgesFromEdgeTable([...fallback], void 0);
      for (const [k, v] of sub) map.set(k, v);
    }
    for (const id of nodeIds) {
      if (!map.has(id)) map.set(id, 0);
    }
    return map;
  }
  /**
   * group count node's edges by type.
   * return a map: node_id -> count
   */
  async countEdges(nodeIds, type) {
    const incoming = await this.countInComingEdges(nodeIds, type);
    const outgoing = await this.countOutgoingEdges(nodeIds, type);
    const total = /* @__PURE__ */ new Map();
    for (const nodeId of nodeIds) {
      total.set(nodeId, (incoming.get(nodeId) ?? 0) + (outgoing.get(nodeId) ?? 0));
    }
    return { incoming, outgoing, total };
  }
  /**
   * Batch get neighbor node IDs for multiple nodes.
   *
   * Returns a map: node_id -> neighbor_id[]
   */
  async getNeighborIdsMap(nodeIds) {
    if (!nodeIds.length) return /* @__PURE__ */ new Map();
    const rows = await this.db.selectFrom("mobius_edge").select(["from_node_id", "to_node_id"]).where("from_node_id", "in", nodeIds).execute();
    const out = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const key = String(r.from_node_id);
      const arr = out.get(key) ?? [];
      arr.push(String(r.to_node_id));
      out.set(key, arr);
    }
    return out;
  }
  /**
   * Get edges by to_node_id.
   */
  async getByToNode(toNodeId) {
    const rows = await this.db.selectFrom("mobius_edge").selectAll().where("to_node_id", "=", toNodeId).execute();
    return rows.map((row) => this.graphEdgeFromMobius(row));
  }
  /**
   * Get edges between two nodes.
   */
  async getBetweenNodes(fromNodeId, toNodeId) {
    const rows = await this.db.selectFrom("mobius_edge").selectAll().where("from_node_id", "=", fromNodeId).where("to_node_id", "=", toNodeId).execute();
    return rows.map((row) => this.graphEdgeFromMobius(row));
  }
  /**
   * Get edges by type.
   */
  async getByType(type) {
    const rows = await this.db.selectFrom("mobius_edge").selectAll().where("type", "=", type).execute();
    return rows.map((row) => this.graphEdgeFromMobius(row));
  }
  /**
   * Keyset-ordered batches of `references` edges (no JOIN). Callers filter by doc-like node ids in memory.
   */
  async *iterateReferenceEdgeBatches(batchSize) {
    const limit = Math.max(1, batchSize);
    let afterId = null;
    for (; ; ) {
      let q = this.db.selectFrom("mobius_edge").select(["id", "from_node_id", "to_node_id"]).where("type", "=", GraphEdgeType.References);
      if (afterId != null) {
        q = q.where("id", ">", afterId);
      }
      const rows = await q.orderBy("id", "asc").limit(limit).execute();
      if (rows.length === 0) {
        return;
      }
      yield rows.map((r) => ({
        from_node_id: String(r.from_node_id),
        to_node_id: String(r.to_node_id)
      }));
      afterId = String(rows[rows.length - 1].id);
      if (rows.length < limit) {
        return;
      }
    }
  }
  /**
   * Keyset-ordered batches of `semantic_related` edges with weights (weighted PageRank).
   */
  async *iterateSemanticRelatedEdgeBatches(batchSize) {
    const limit = Math.max(1, batchSize);
    let afterId = null;
    for (; ; ) {
      let q = this.db.selectFrom("mobius_edge").select(["id", "from_node_id", "to_node_id", "weight"]).where("type", "=", GraphEdgeType.SemanticRelated);
      if (afterId != null) {
        q = q.where("id", ">", afterId);
      }
      const rows = await q.orderBy("id", "asc").limit(limit).execute();
      if (rows.length === 0) {
        return;
      }
      yield rows.map((r) => ({
        from_node_id: String(r.from_node_id),
        to_node_id: String(r.to_node_id),
        weight: Number(r.weight ?? 0)
      }));
      afterId = String(rows[rows.length - 1].id);
      if (rows.length < limit) {
        return;
      }
    }
  }
  /**
   * Get edges by custom WHERE clause (table is `mobius_edge`; column is `attributes_json`).
   */
  async getByCustomWhere(whereClause) {
    if (!whereClause.trim()) return [];
    const compiledQuery = {
      sql: `SELECT * FROM mobius_edge WHERE ${whereClause}`,
      parameters: [],
      query: {}
      // Add required query property
    };
    console.log("[MobiusEdgeRepo.getByCustomWhere] compiledQuery", compiledQuery);
    const result = await this.db.executeQuery(compiledQuery);
    const rows = result.rows;
    return rows.map((row) => this.graphEdgeFromMobius(row));
  }
  /**
   * Get source node IDs that are connected to ALL specified target node IDs.
   * Uses GROUP BY and HAVING to find nodes that have edges to all required targets.
   * Since target node IDs are unique (tags and categories have different IDs),
   * we don't need to filter by edge type.
   * @param targetNodeIds Array of target node IDs to match against
   */
  async getSourceNodesConnectedToAllTargets(targetNodeIds) {
    if (targetNodeIds.length === 0) return [];
    const result = await this.db.selectFrom("mobius_edge").select("from_node_id").where("to_node_id", "in", targetNodeIds).groupBy("from_node_id").having(import_kysely3.sql`COUNT(DISTINCT to_node_id)`, "=", targetNodeIds.length).execute();
    return result.map((row) => row.from_node_id);
  }
  /**
   * Nodes with no outgoing edges. Document rows use `doc_outgoing_cnt` + `other_outgoing_cnt`;
   * other node types use `NOT EXISTS` on `mobius_edge` (no cached out-degree on tags/categories).
   */
  async getNodesWithZeroOutDegree(limit) {
    const cap = limit ?? 1e7;
    const d = GraphNodeType.Document;
    const h = GraphNodeType.HubDoc;
    const result = await import_kysely3.sql`
			SELECT n.node_id AS node_id FROM mobius_node n
			WHERE (
				(n.type IN (${d}, ${h}) AND IFNULL(n.doc_outgoing_cnt,0) + IFNULL(n.other_outgoing_cnt,0) = 0)
				OR (n.type NOT IN (${d}, ${h}) AND NOT EXISTS (SELECT 1 FROM mobius_edge e WHERE e.from_node_id = n.node_id))
			)
			LIMIT ${cap}
		`.execute(this.db);
    return result.rows.map((r) => r.node_id);
  }
  /**
   * Nodes with no incoming edges; same caching rules as {@link getNodesWithZeroOutDegree}.
   */
  async getNodesWithZeroInDegree(limit) {
    const cap = limit ?? 1e7;
    const d = GraphNodeType.Document;
    const h = GraphNodeType.HubDoc;
    const result = await import_kysely3.sql`
			SELECT n.node_id AS node_id FROM mobius_node n
			WHERE (
				(n.type IN (${d}, ${h}) AND IFNULL(n.doc_incoming_cnt,0) + IFNULL(n.other_incoming_cnt,0) = 0)
				OR (n.type NOT IN (${d}, ${h}) AND NOT EXISTS (SELECT 1 FROM mobius_edge e WHERE e.to_node_id = n.node_id))
			)
			LIMIT ${cap}
		`.execute(this.db);
    return result.rows.map((r) => r.node_id);
  }
  /**
   * Hard orphan: zero in- and out-degree. Documents use cached columns; other types use `NOT EXISTS` on both directions.
   */
  async getHardOrphanNodeIds(limit) {
    const cap = limit ?? 1e7;
    const d = GraphNodeType.Document;
    const h = GraphNodeType.HubDoc;
    const result = await import_kysely3.sql`
			SELECT n.node_id AS node_id FROM mobius_node n
			WHERE (
				(
					n.type IN (${d}, ${h})
					AND IFNULL(n.doc_outgoing_cnt,0) + IFNULL(n.other_outgoing_cnt,0) = 0
					AND IFNULL(n.doc_incoming_cnt,0) + IFNULL(n.other_incoming_cnt,0) = 0
				)
				OR (
					n.type NOT IN (${d}, ${h})
					AND NOT EXISTS (SELECT 1 FROM mobius_edge e WHERE e.from_node_id = n.node_id)
					AND NOT EXISTS (SELECT 1 FROM mobius_edge e WHERE e.to_node_id = n.node_id)
				)
			)
			LIMIT ${cap}
		`.execute(this.db);
    return result.rows.map((r) => r.node_id);
  }
  /**
   * Get hard orphan nodes with full node information.
   * Uses separate queries to avoid JOIN operations.
   * @param limit Maximum number of orphans to return
   */
  async getHardOrphans(limit) {
    const orphanIds = await this.getHardOrphanNodeIds(limit);
    if (orphanIds.length === 0) {
      return [];
    }
    return orphanIds;
  }
  /**
   * Get nodes with low degree (1-2 total connections).
   * TODO: Implement using `mobius_node` doc_incoming_cnt / doc_outgoing_cnt (or aggregate from mobius_edge).
   *
   * @param maxConnections Maximum total connections (default: 2)
   * @param limit Maximum number of nodes to return
   */
  async getNodesWithLowDegree(maxConnections = 2, limit) {
    return [];
  }
  /**
   * Get top nodes by degree metrics (in-degree, out-degree). Queries in and out separately.
   *
   * @param limit Max nodes per degree type. Omitted = return all.
   * @param nodeIdFilter Optional node IDs to restrict to.
   * @param edgeType Optional edge relationship type (e.g. 'references', 'tagged') to filter by; not node type.
   */
  async getTopNodeIdsByDegree(limit, nodeIdFilter, edgeType) {
    let outDegreeQuery = this.db.selectFrom("mobius_edge").select([
      "from_node_id as nodeId",
      ({ fn }) => fn.count("id").as("outDegree")
    ]).groupBy("from_node_id").orderBy("outDegree", "desc");
    let inDegreeQuery = this.db.selectFrom("mobius_edge").select([
      "to_node_id as nodeId",
      ({ fn }) => fn.count("id").as("inDegree")
    ]).groupBy("to_node_id").orderBy("inDegree", "desc");
    if (edgeType !== void 0) {
      outDegreeQuery = outDegreeQuery.where("type", "=", edgeType);
      inDegreeQuery = inDegreeQuery.where("type", "=", edgeType);
    }
    if (nodeIdFilter && nodeIdFilter.length > 0) {
      outDegreeQuery = outDegreeQuery.where("from_node_id", "in", nodeIdFilter);
      inDegreeQuery = inDegreeQuery.where("to_node_id", "in", nodeIdFilter);
    }
    if (limit !== void 0) {
      outDegreeQuery = outDegreeQuery.limit(limit);
      inDegreeQuery = inDegreeQuery.limit(limit);
    }
    const [outDegreeStats, inDegreeStats] = await Promise.all([
      outDegreeQuery.execute(),
      inDegreeQuery.execute()
    ]);
    return {
      topByOutDegree: outDegreeStats,
      topByInDegree: inDegreeStats
    };
  }
  /**
   * Delete edge by ID.
   */
  async deleteById(id) {
    await this.db.deleteFrom("mobius_edge").where("id", "=", id).execute();
  }
  /**
   * Delete edges by from_node_id.
   */
  async deleteByFromNode(fromNodeId) {
    await this.db.deleteFrom("mobius_edge").where("from_node_id", "=", fromNodeId).execute();
  }
  /**
   * Delete outgoing edges of a given type (e.g. re-materialize `semantic_related` on reindex).
   */
  async deleteByFromNodeAndType(fromNodeId, type) {
    await this.db.deleteFrom("mobius_edge").where("from_node_id", "=", fromNodeId).where("type", "=", type).execute();
  }
  /**
   * Document ids linked to a topic tag node (excluding one doc), for semantic peer discovery.
   */
  async listDocIdsFromTaggedTopicExcluding(tagNodeId, excludeDocId, limit) {
    const lim = Math.max(1, limit);
    const rows = await this.db.selectFrom("mobius_edge").select("from_node_id").where("to_node_id", "=", tagNodeId).where("type", "=", GraphEdgeType.TaggedTopic).where("from_node_id", "!=", excludeDocId).limit(lim).execute();
    return [...new Set(rows.map((r) => String(r.from_node_id)))];
  }
  /**
   * Delete edges by to_node_id.
   */
  async deleteByToNode(toNodeId) {
    await this.db.deleteFrom("mobius_edge").where("to_node_id", "=", toNodeId).execute();
  }
  /**
   * Delete edges between two nodes.
   */
  async deleteBetweenNodes(fromNodeId, toNodeId) {
    await this.db.deleteFrom("mobius_edge").where("from_node_id", "=", fromNodeId).where("to_node_id", "=", toNodeId).execute();
  }
  /**
   * Delete edges by type.
   */
  async deleteByType(type) {
    await this.db.deleteFrom("mobius_edge").where("type", "=", type).execute();
  }
  /**
   * Delete edges where from_node_id or to_node_id matches any of the given node IDs.
   */
  async deleteByNodeIds(nodeIds) {
    if (!nodeIds.length) return;
    await this.db.deleteFrom("mobius_edge").where((eb) => eb.or([eb("from_node_id", "in", nodeIds), eb("to_node_id", "in", nodeIds)])).execute();
  }
  /**
   * Get limited edges by node ID, grouped by type.
   * Optionally exclude a set of types.
   * Returns edges where each type (for the remaining types, or all if not provided) is limited to the specified limit per type.
   * Uses SQLite window functions to rank edges within each type group.
   * @param nodeId - The node ID to fetch edges for
   * // todo we should limit by statistics weight. some doc are more important than others. not just simple order
   * //  so we should add some data to the graph edge, node table. like weight
   * @param limitPerType - Maximum number of edges per type to return
   * @param typesExclude - Types to exclude (edges of these types will not be included)
   */
  async getAllEdgesForNode(nodeId, limitPerType, typesExclude) {
    const directionExpr = import_kysely3.sql`case when from_node_id = ${nodeId} then 'out' else 'in' end`;
    const query = this.db.with("ranked_edges", (qb) => {
      let baseQb = qb.selectFrom("mobius_edge").select([
        "id",
        "from_node_id",
        "to_node_id",
        "type",
        "weight",
        "attributes_json",
        "created_at",
        "updated_at",
        // 1. define direction explicitly: if the edge is outgoing from the current node, mark as 'out', otherwise mark as 'in'
        directionExpr.as("direction"),
        // 2. add type and direction to partitionBy
        import_kysely3.sql`row_number() over(
							partition by type, ${directionExpr} 
							order by updated_at desc
						)`.as("dir_type_rank")
      ]).where(
        (eb) => eb.or([
          eb("from_node_id", "=", nodeId),
          eb("to_node_id", "=", nodeId)
        ])
      );
      if (typesExclude && typesExclude.length > 0) {
        baseQb = baseQb.where("type", "not in", typesExclude);
      }
      return baseQb;
    }).selectFrom("ranked_edges").selectAll().where("dir_type_rank", "<=", limitPerType).orderBy("updated_at", "desc");
    const raw = await query.execute();
    return raw.map(
      (r) => this.graphEdgeFromMobius({
        id: r.id,
        from_node_id: r.from_node_id,
        to_node_id: r.to_node_id,
        type: r.type,
        weight: r.weight,
        attributes_json: r.attributes_json ?? "{}",
        created_at: r.created_at,
        updated_at: r.updated_at
      })
    );
  }
  /**
   * Top tags by `mobius_node.tag_doc_count` (distinct documents per tag, maintained with edges).
   */
  async getTopTaggedNodes(limit = 50) {
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "tag_doc_count"]).where("type", "in", [...GRAPH_TAG_NODE_TYPES]).where("tag_doc_count", "is not", null).where("tag_doc_count", ">", 0).orderBy("tag_doc_count", "desc").limit(limit).execute();
    return rows.map((r) => ({ tagId: r.node_id, count: Number(r.tag_doc_count) }));
  }
  /**
   * count in-degree and out-degree for target node ids.
   * Chunks nodeIds to avoid SQL variable limit; merges in memory.
   */
  async getDegreeMapsByNodeIdsChunked(nodeIds, edgeType = GraphEdgeType.References) {
    const inMap = /* @__PURE__ */ new Map();
    const outMap = /* @__PURE__ */ new Map();
    const CHUNK = 400;
    for (let i = 0; i < nodeIds.length; i += CHUNK) {
      const c = nodeIds.slice(i, i + CHUNK);
      const [inChunk, outChunk] = await Promise.all([
        this.countInComingEdges(c, edgeType),
        this.countOutgoingEdges(c, edgeType)
      ]);
      for (const [nid, count] of inChunk) inMap.set(nid, (inMap.get(nid) ?? 0) + count);
      for (const [nid, count] of outChunk) outMap.set(nid, (outMap.get(nid) ?? 0) + count);
    }
    return { inMap, outMap };
  }
  /**
   * Returns all edges that have *both* endpoints in the given node set ("intra" = within the set).
   * Used when drawing a subgraph (e.g. top-N nodes): we need every link between those nodes.
   *
   * Why two queries?
   * - getByFromNodesAndTypes(nodeIds): edges whose *source* is in nodeIds. That gives us A→B when A is in the set
   *   (B may be outside). We then keep only edges where B is also in nodeIds.
   * - getByToNodesAndTypes(nodeIds): edges whose *target* is in nodeIds. That gives us C→D when D is in the set.
   *   We then keep only edges where C is also in nodeIds. So we get edges that would be missed if we only queried by from.
   * The same edge can appear in both result sets, so we dedupe by (from_node_id, to_node_id) before returning.
   *
   * @param nodeIds - Node IDs that define the subgraph (e.g. top 20 by degree).
   * @param edgeType - Edge type to filter (default 'references').
   * @returns List of edges { from_node_id, to_node_id } with both ends in nodeIds, no duplicates.
   */
  async getIntraEdges(nodeIds, edgeType = GraphEdgeType.References) {
    if (!nodeIds.length) return [];
    const types = [edgeType];
    const [fromEdges, toEdges] = await Promise.all([
      this.getByFromNodesAndTypes(nodeIds, types),
      this.getByToNodesAndTypes(nodeIds, types)
    ]);
    const nodeSet = new Set(nodeIds);
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const e of fromEdges) {
      if (!nodeSet.has(e.to_node_id)) continue;
      const key = `${e.from_node_id}	${e.to_node_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(e);
    }
    for (const e of toEdges) {
      if (!nodeSet.has(e.from_node_id)) continue;
      const key = `${e.from_node_id}	${e.to_node_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(e);
    }
    return result;
  }
  /**
   * For a set of "internal" nodes (e.g. docs in the group's folders), returns the top external nodes
   * that are most connected to this set—both directions. Used to draw "Group → external" and
   * "external → Group" links in the shared-context Mermaid graph.
   *
   * - extOut: nodes that internal nodes link *to* (outgoing). Sorted by number of edges from internal to that node; top limitK.
   * - extIn: nodes that link *into* internal nodes (incoming). Sorted by number of edges from that node to internal; top limitK.
   *
   * Why chunk? internalIds can be large (all docs under several folders). We avoid a single huge IN (...)
   * by splitting into chunks of 400, querying edges for each chunk, and aggregating counts in memory.
   * No SQL JOIN with indexed document table; internal set is passed in by the caller (from IndexedDocumentRepo).
   *
   * @param internalIds - Document/node IDs considered "inside" the group (e.g. from getIdsByPathPrefixes).
   * @param edgeType - Edge type (default 'references').
   * @param limitK - Max number of external nodes to return per direction.
   * @returns { extOut: [{ to_node_id, count }], extIn: [{ from_node_id, count }] } sorted by count descending.
   */
  async getExternalEdgeCountsChunked(internalIds, edgeType = GraphEdgeType.References, limitK) {
    const internalSet = new Set(internalIds);
    const outByTo = /* @__PURE__ */ new Map();
    const inByFrom = /* @__PURE__ */ new Map();
    const CHUNK = 400;
    const types = [edgeType];
    for (let i = 0; i < internalIds.length; i += CHUNK) {
      const c = internalIds.slice(i, i + CHUNK);
      const [outEdges, inEdges] = await Promise.all([
        this.getByFromNodesAndTypes(c, types),
        this.getByToNodesAndTypes(c, types)
      ]);
      for (const e of outEdges) {
        if (!internalSet.has(e.to_node_id)) outByTo.set(e.to_node_id, (outByTo.get(e.to_node_id) ?? 0) + 1);
      }
      for (const e of inEdges) {
        if (!internalSet.has(e.from_node_id)) inByFrom.set(e.from_node_id, (inByFrom.get(e.from_node_id) ?? 0) + 1);
      }
    }
    const extOut = [...outByTo.entries()].sort((a, b) => b[1] - a[1]).slice(0, limitK).map(([to_node_id, count]) => ({ to_node_id, count }));
    const extIn = [...inByFrom.entries()].sort((a, b) => b[1] - a[1]).slice(0, limitK).map(([from_node_id, count]) => ({ from_node_id, count }));
    return { extOut, extIn };
  }
  /**
   * Delete all graph edges.
   */
  async deleteAll() {
    await this.db.deleteFrom("mobius_edge").execute();
  }
  // --- Hub discovery & local hub graph (read-only) ---
  /** Reference edges touching a node (hub coverage estimate). */
  async listReferenceEdgesIncidentToNode(nodeId, limit) {
    const lim = Math.max(1, limit);
    const rows = await this.db.selectFrom("mobius_edge").select(["from_node_id", "to_node_id"]).where("type", "=", GraphEdgeType.References).where((eb) => eb.or([eb("from_node_id", "=", nodeId), eb("to_node_id", "=", nodeId)])).limit(lim).execute();
    return rows;
  }
  /** Semantic-related edges touching a node (cluster hub neighbors). */
  async listSemanticRelatedEdgesIncidentToNode(nodeId, limit) {
    const lim = Math.max(1, limit);
    const rows = await this.db.selectFrom("mobius_edge").select(["from_node_id", "to_node_id"]).where("type", "=", GraphEdgeType.SemanticRelated).where((eb) => eb.or([eb("from_node_id", "=", nodeId), eb("to_node_id", "=", nodeId)])).limit(lim).execute();
    return rows;
  }
  /**
   * Edges of given types where at least one endpoint is in `nodeIds` (local hub BFS frontier).
   */
  async listEdgesByTypesIncidentToAnyNode(nodeIds, edgeTypes, limit) {
    if (!nodeIds.length || !edgeTypes.length) return [];
    const lim = Math.max(1, limit);
    const rows = await this.db.selectFrom("mobius_edge").select(["from_node_id", "to_node_id", "type", "weight"]).where("type", "in", edgeTypes).where((eb) => eb.or([eb("from_node_id", "in", nodeIds), eb("to_node_id", "in", nodeIds)])).limit(lim).execute();
    return rows;
  }
};

// src/core/storage/sqlite/repositories/MobiusOperationRepo.ts
var MobiusOperationType = {
  AI_ANALYSIS: "ai_analysis"
};
var MobiusOperationRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Log an AI Quick Search analysis run (links to `ai_analysis_record`).
   */
  async insertAiAnalysisOperation(params) {
    const desc = (params.query ?? params.title ?? "").slice(0, SLICE_CAPS.sqlite.operationDescription) || "(ai analysis)";
    const row = {
      id: generateUuidWithoutHyphens(),
      operation_type: MobiusOperationType.AI_ANALYSIS,
      operation_desc: desc,
      created_at: params.createdAtTs,
      related_kind: "ai_analysis_record",
      related_id: params.recordId,
      important_level: null,
      continuous_group_id: null,
      meta_json: JSON.stringify({ vault_rel_path: params.vaultRelPath })
    };
    await this.db.insertInto("mobius_operation").values(row).execute();
  }
  /**
   * Low-level insert; add a dedicated method when introducing a new operation kind.
   */
  async insertRow(row) {
    await this.db.insertInto("mobius_operation").values(row).execute();
  }
};

// src/core/storage/sqlite/repositories/GraphRepo.ts
function parseFunctionalQualifierFromEdgeAttributes(attributesJson) {
  try {
    const a = JSON.parse(attributesJson || "{}");
    if (typeof a.qualifier === "string" && a.qualifier.trim()) return a.qualifier.trim();
  } catch {
  }
  return void 0;
}
var GraphRepo = class {
  constructor(nodeRepo, edgeRepo) {
    this.nodeRepo = nodeRepo;
    this.edgeRepo = edgeRepo;
  }
  // ===== Node Operations =====
  /**
   * Upsert a node.
   */
  async upsertNode(node) {
    const now = Date.now();
    await this.nodeRepo.upsert({
      id: node.id,
      type: node.type,
      label: node.label,
      attributes: JSON.stringify(node.attributes),
      created_at: now,
      updated_at: now
    });
  }
  async getNode(id) {
    return this.nodeRepo.getById(id);
  }
  async deleteNode(id) {
    await this.edgeRepo.deleteByFromNode(id);
    await this.edgeRepo.deleteByToNode(id);
    await this.nodeRepo.deleteById(id);
  }
  async getNodesByType(type) {
    return this.nodeRepo.getByType(type);
  }
  // ===== Edge Operations =====
  async upsertEdge(edge) {
    const now = Date.now();
    const edgeId = MobiusEdgeRepo.generateEdgeId(edge.fromNodeId, edge.toNodeId, edge.type);
    const existingEdge = await this.edgeRepo.getById(edgeId);
    let weight = edge.weight ?? 1;
    if (existingEdge) {
      weight = existingEdge.weight + (edge.weight ?? 1);
    }
    await this.edgeRepo.upsert({
      id: edgeId,
      from_node_id: edge.fromNodeId,
      to_node_id: edge.toNodeId,
      type: edge.type,
      weight,
      attributes: JSON.stringify(edge.attributes ?? {}),
      created_at: existingEdge?.created_at ?? now,
      updated_at: now
    });
  }
  async getOutgoingEdges(nodeId) {
    return this.edgeRepo.getByFromNode(nodeId);
  }
  async getIncomingEdges(nodeId) {
    return this.edgeRepo.getByToNode(nodeId);
  }
  async deleteEdge(fromNodeId, toNodeId, type) {
    const edgeId = MobiusEdgeRepo.generateEdgeId(fromNodeId, toNodeId, type);
    await this.edgeRepo.deleteById(edgeId);
  }
  async getNeighborIds(nodeId) {
    const edges = await this.getOutgoingEdges(nodeId);
    return edges.map((e) => e.to_node_id);
  }
  async getRelatedNodeIds(startNodeId, maxHops = 2) {
    const visited = /* @__PURE__ */ new Set([startNodeId]);
    let frontier = /* @__PURE__ */ new Set([startNodeId]);
    for (let hop = 0; hop < maxHops; hop++) {
      const next = /* @__PURE__ */ new Set();
      const neighborMap = await this.edgeRepo.getNeighborIdsMap(Array.from(frontier));
      for (const [, neighbors] of neighborMap) {
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            next.add(neighborId);
          }
        }
      }
      frontier = next;
      if (!frontier.size) break;
    }
    visited.delete(startNodeId);
    return visited;
  }
  async upsertDocument(params) {
    await this.upsertNode({
      id: params.id,
      type: GraphNodeType.Document,
      label: params.path,
      attributes: {
        path: params.path,
        docType: params.docType
      }
    });
  }
  async removeDocument(id) {
    await this.deleteNode(id);
  }
  async getRelatedFilePaths(params) {
    const relatedNodeIds = await this.getRelatedNodeIds(params.currentFilePath, params.maxHops ?? 2);
    const documentIds = await this.nodeRepo.getIdsByIdsAndTypes(
      Array.from(relatedNodeIds),
      [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]
    );
    return new Set(documentIds);
  }
  async getPreview(params) {
    const maxNodes = params.maxNodes ?? 30;
    const maxHops = Math.max(0, Number(params.maxHops ?? 2));
    const startNode = await this.getNode(params.currentFilePath);
    if (!startNode) {
      return { nodes: [], edges: [] };
    }
    const keep = /* @__PURE__ */ new Set([params.currentFilePath]);
    let frontier = /* @__PURE__ */ new Set([params.currentFilePath]);
    for (let hop = 0; hop < maxHops; hop++) {
      const next = /* @__PURE__ */ new Set();
      const neighborMap = await this.edgeRepo.getNeighborIdsMap(Array.from(frontier));
      for (const [, neighbors] of neighborMap) {
        for (const nid of neighbors) {
          if (!keep.has(nid)) {
            keep.add(nid);
            next.add(nid);
          }
        }
      }
      frontier = next;
      if (!frontier.size) break;
    }
    const nodes = [];
    const nodeMap = await this.nodeRepo.getByIds(Array.from(keep));
    for (const [id, nodeRow] of nodeMap) {
      if (nodes.length >= maxNodes) break;
      const node = {
        id: nodeRow.id,
        type: nodeRow.type,
        label: nodeRow.label
      };
      let label = node.label;
      if (node.type === GraphNodeType.TopicTag) {
        label = `#${node.label}`;
      }
      nodes.push({ id, label, type: node.type });
    }
    const nodeSet = new Set(nodes.map((n) => n.id));
    const edges = [];
    const outgoingEdges = await this.edgeRepo.getByFromNodes(Array.from(nodeSet));
    for (const e of outgoingEdges) {
      if (nodeSet.has(e.to_node_id)) {
        edges.push({
          from_node_id: e.from_node_id,
          to_node_id: e.to_node_id,
          weight: e.weight
        });
      }
    }
    return { nodes, edges };
  }
  /**
   * Per-doc tag bundles and global-ish counts. Uses `mobius_edge.type` (tagged_topic / functional / keyword / context).
   */
  async getTagsByDocIds(docIds) {
    const emptyMaps = () => ({
      idMapToTags: /* @__PURE__ */ new Map(),
      topicTagCounts: /* @__PURE__ */ new Map(),
      functionalTagCounts: /* @__PURE__ */ new Map(),
      keywordTagCounts: /* @__PURE__ */ new Map(),
      timeTagCounts: /* @__PURE__ */ new Map(),
      geoTagCounts: /* @__PURE__ */ new Map(),
      personTagCounts: /* @__PURE__ */ new Map()
    });
    if (docIds === void 0) {
      const edgeCounts = await this.edgeRepo.getTagCategoryEdgeCountsByToNode();
      if (!edgeCounts.length) {
        return emptyMaps();
      }
      const toNodeIds = [...new Set(edgeCounts.map((e) => e.to_node_id))];
      const nodeMap = await this.nodeRepo.getByIds(toNodeIds);
      const topicTagCounts2 = /* @__PURE__ */ new Map();
      const functionalTagCounts2 = /* @__PURE__ */ new Map();
      const keywordTagCounts2 = /* @__PURE__ */ new Map();
      const timeTagCounts2 = /* @__PURE__ */ new Map();
      const geoTagCounts2 = /* @__PURE__ */ new Map();
      const personTagCounts2 = /* @__PURE__ */ new Map();
      for (const { to_node_id, count } of edgeCounts) {
        const node = nodeMap.get(to_node_id);
        if (!node) continue;
        if (node.type === GraphNodeType.TopicTag) {
          topicTagCounts2.set(node.label, (topicTagCounts2.get(node.label) ?? 0) + count);
        } else if (node.type === GraphNodeType.FunctionalTag) {
          functionalTagCounts2.set(node.label, (functionalTagCounts2.get(node.label) ?? 0) + count);
        } else if (node.type === GraphNodeType.KeywordTag) {
          keywordTagCounts2.set(node.label, (keywordTagCounts2.get(node.label) ?? 0) + count);
        } else if (node.type === GraphNodeType.ContextTag) {
          const ax = contextAxisFromGraphNode(node);
          if (ax === "time") {
            timeTagCounts2.set(node.label, (timeTagCounts2.get(node.label) ?? 0) + count);
          } else if (ax === "geo") {
            geoTagCounts2.set(node.label, (geoTagCounts2.get(node.label) ?? 0) + count);
          } else if (ax === "person") {
            personTagCounts2.set(node.label, (personTagCounts2.get(node.label) ?? 0) + count);
          }
        }
      }
      return {
        idMapToTags: /* @__PURE__ */ new Map(),
        topicTagCounts: topicTagCounts2,
        functionalTagCounts: functionalTagCounts2,
        keywordTagCounts: keywordTagCounts2,
        timeTagCounts: timeTagCounts2,
        geoTagCounts: geoTagCounts2,
        personTagCounts: personTagCounts2
      };
    }
    const taggedEdges = await this.edgeRepo.getByFromNodesAndTypes(docIds, [...GRAPH_TAGGED_EDGE_TYPES]);
    const nodeById = await this.nodeRepo.getByIds(taggedEdges.map((edge) => edge.to_node_id));
    const topicTagCounts = /* @__PURE__ */ new Map();
    const functionalTagCounts = /* @__PURE__ */ new Map();
    const keywordTagCounts = /* @__PURE__ */ new Map();
    const timeTagCounts = /* @__PURE__ */ new Map();
    const geoTagCounts = /* @__PURE__ */ new Map();
    const personTagCounts = /* @__PURE__ */ new Map();
    for (const edge of taggedEdges) {
      const node = nodeById.get(edge.to_node_id);
      if (!node) continue;
      if (edge.type === GraphEdgeType.TaggedTopic) {
        topicTagCounts.set(node.label, (topicTagCounts.get(node.label) ?? 0) + 1);
      } else if (edge.type === GraphEdgeType.TaggedFunctional) {
        functionalTagCounts.set(node.label, (functionalTagCounts.get(node.label) ?? 0) + 1);
      } else if (edge.type === GraphEdgeType.TaggedKeyword) {
        keywordTagCounts.set(node.label, (keywordTagCounts.get(node.label) ?? 0) + 1);
      } else if (edge.type === GraphEdgeType.TaggedContext) {
        const ax = contextAxisFromGraphNode(node);
        if (ax === "time") {
          timeTagCounts.set(node.label, (timeTagCounts.get(node.label) ?? 0) + 1);
        } else if (ax === "geo") {
          geoTagCounts.set(node.label, (geoTagCounts.get(node.label) ?? 0) + 1);
        } else if (ax === "person") {
          personTagCounts.set(node.label, (personTagCounts.get(node.label) ?? 0) + 1);
        }
      }
    }
    const map = /* @__PURE__ */ new Map();
    for (const edge of taggedEdges) {
      const n = nodeById.get(edge.to_node_id);
      if (!n) continue;
      if (!map.has(edge.from_node_id)) {
        map.set(edge.from_node_id, {
          topicTags: [],
          topicTagEntries: [],
          functionalTagEntries: [],
          keywordTags: [],
          timeTags: [],
          geoTags: [],
          personTags: []
        });
      }
      const row = map.get(edge.from_node_id);
      if (edge.type === GraphEdgeType.TaggedTopic) {
        const qualifier = parseFunctionalQualifierFromEdgeAttributes(edge.attributes);
        const entry = qualifier ? { id: n.label, label: qualifier } : { id: n.label };
        row.topicTagEntries.push(entry);
        row.topicTags.push(n.label);
      } else if (edge.type === GraphEdgeType.TaggedFunctional) {
        const qualifier = parseFunctionalQualifierFromEdgeAttributes(edge.attributes);
        row.functionalTagEntries.push(
          qualifier ? { id: n.label, label: qualifier } : { id: n.label }
        );
      } else if (edge.type === GraphEdgeType.TaggedKeyword) {
        row.keywordTags.push(n.label);
      } else if (edge.type === GraphEdgeType.TaggedContext) {
        const ax = contextAxisFromGraphNode(n);
        if (ax === "time") row.timeTags.push(n.label);
        else if (ax === "geo") row.geoTags.push(n.label);
        else if (ax === "person") row.personTags.push(n.label);
      }
    }
    return {
      idMapToTags: map,
      topicTagCounts,
      functionalTagCounts,
      keywordTagCounts,
      timeTagCounts,
      geoTagCounts,
      personTagCounts
    };
  }
};
function contextAxisFromGraphNode(node) {
  if (node.type !== GraphNodeType.ContextTag) return null;
  try {
    const a = JSON.parse(node.attributes || "{}");
    if (a.axis === "time" || a.axis === "geo" || a.axis === "person") return a.axis;
  } catch {
  }
  if (node.label.startsWith("Time")) return "time";
  if (node.label.startsWith("Geo")) return "geo";
  if (node.label.startsWith("Person")) return "person";
  return null;
}

// src/core/storage/sqlite/repositories/ChatProjectRepo.ts
var ChatProjectRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Check if project exists by project_id.
   */
  async existsByProjectId(projectId) {
    const row = await this.db.selectFrom("chat_project").select("project_id").where("project_id", "=", projectId).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new chat project.
   */
  async insert(project) {
    await this.db.insertInto("chat_project").values(project).execute();
  }
  /**
   * Update existing chat project by project_id.
   */
  async updateByProjectId(projectId, updates) {
    await this.db.updateTable("chat_project").set(updates).where("project_id", "=", projectId).execute();
  }
  /**
   * Upsert project metadata.
   */
  async upsertProject(params) {
    const exists = await this.existsByProjectId(params.projectId);
    if (exists) {
      await this.updateByProjectId(params.projectId, {
        name: params.name,
        folder_rel_path: params.folderRelPath,
        updated_at_ts: params.updatedAtTs,
        archived_rel_path: params.archivedRelPath ?? null,
        meta_json: params.metaJson ?? null
      });
    } else {
      await this.insert({
        project_id: params.projectId,
        name: params.name,
        folder_rel_path: params.folderRelPath,
        created_at_ts: params.createdAtTs,
        updated_at_ts: params.updatedAtTs,
        archived_rel_path: params.archivedRelPath ?? null,
        meta_json: params.metaJson ?? null
      });
    }
  }
  /**
   * Get project by ID.
   */
  async getById(projectId) {
    const row = await this.db.selectFrom("chat_project").selectAll().where("project_id", "=", projectId).executeTakeFirst();
    return row ?? null;
  }
  /**
   * Get project by folder path.
   */
  async getByFolderPath(folderRelPath) {
    const row = await this.db.selectFrom("chat_project").selectAll().where("folder_rel_path", "=", folderRelPath).executeTakeFirst();
    return row ?? null;
  }
  /**
   * List all projects (excluding archived by default).
   */
  async listProjects(includeArchived = false) {
    let query = this.db.selectFrom("chat_project").selectAll();
    if (!includeArchived) {
      query = query.where("archived_rel_path", "is", null);
    }
    return query.orderBy("updated_at_ts", "desc").execute();
  }
  /**
   * Update folder path when project is moved/renamed.
   */
  async updatePathsOnMove(projectId, newFolderRelPath, newArchivedRelPath) {
    await this.db.updateTable("chat_project").set({
      folder_rel_path: newFolderRelPath,
      archived_rel_path: newArchivedRelPath ?? null
    }).where("project_id", "=", projectId).execute();
  }
};

// src/core/storage/sqlite/repositories/ChatConversationRepo.ts
var ChatConversationRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Check if conversation exists by conversation_id.
   */
  async existsByConversationId(conversationId) {
    const row = await this.db.selectFrom("chat_conversation").select("conversation_id").where("conversation_id", "=", conversationId).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new chat conversation.
   */
  async insert(conversation) {
    await this.db.insertInto("chat_conversation").values(conversation).execute();
  }
  /**
   * Update existing chat conversation by conversation_id.
   */
  async updateByConversationId(conversationId, updates) {
    await this.db.updateTable("chat_conversation").set(updates).where("conversation_id", "=", conversationId).execute();
  }
  /**
   * Upsert conversation metadata.
   */
  async upsertConversation(params) {
    const exists = await this.existsByConversationId(params.conversationId);
    if (exists) {
      await this.updateByConversationId(params.conversationId, {
        project_id: params.projectId ?? null,
        title: params.title,
        file_rel_path: params.fileRelPath,
        updated_at_ts: params.updatedAtTs,
        active_model: params.activeModel ?? null,
        active_provider: params.activeProvider ?? null,
        token_usage_total: params.tokenUsageTotal ?? null,
        title_manually_edited: params.titleManuallyEdited ? 1 : 0,
        title_auto_updated: params.titleAutoUpdated ? 1 : 0,
        context_last_updated_ts: params.contextLastUpdatedTimestamp ?? null,
        context_last_message_index: params.contextLastMessageIndex ?? null,
        archived_rel_path: params.archivedRelPath ?? null,
        meta_json: params.metaJson ?? null
      });
    } else {
      await this.insert({
        conversation_id: params.conversationId,
        project_id: params.projectId ?? null,
        title: params.title,
        file_rel_path: params.fileRelPath,
        created_at_ts: params.createdAtTs,
        updated_at_ts: params.updatedAtTs,
        active_model: params.activeModel ?? null,
        active_provider: params.activeProvider ?? null,
        token_usage_total: params.tokenUsageTotal ?? null,
        title_manually_edited: params.titleManuallyEdited ? 1 : 0,
        title_auto_updated: params.titleAutoUpdated ? 1 : 0,
        context_last_updated_ts: params.contextLastUpdatedTimestamp ?? null,
        context_last_message_index: params.contextLastMessageIndex ?? null,
        archived_rel_path: params.archivedRelPath ?? null,
        meta_json: params.metaJson ?? null
      });
    }
  }
  /**
   * Get conversation by ID.
   */
  async getById(conversationId) {
    const row = await this.db.selectFrom("chat_conversation").selectAll().where("conversation_id", "=", conversationId).executeTakeFirst();
    return row ?? null;
  }
  /**
   * List conversations by project (null for root conversations).
   */
  async listByProject(projectId, includeArchived = false, limit, offset) {
    let query = this.db.selectFrom("chat_conversation").selectAll();
    if (projectId === null) {
      query = query.where("project_id", "is", null);
    } else {
      query = query.where("project_id", "=", projectId);
    }
    if (!includeArchived) {
      query = query.where("archived_rel_path", "is", null);
    }
    query = query.orderBy("updated_at_ts", "desc");
    if (offset !== void 0) {
      query = query.offset(offset);
    }
    if (limit !== void 0) {
      query = query.limit(limit);
    }
    return query.execute();
  }
  /**
   * Count conversations by project (null for root conversations).
   */
  async countByProject(projectId, includeArchived = false) {
    let query = this.db.selectFrom("chat_conversation").select(this.db.fn.countAll().as("count"));
    if (projectId === null) {
      query = query.where("project_id", "is", null);
    } else {
      query = query.where("project_id", "=", projectId);
    }
    if (!includeArchived) {
      query = query.where("archived_rel_path", "is", null);
    }
    const result = await query.executeTakeFirst();
    return Number(result?.count ?? 0);
  }
  /**
   * Update file path when conversation is moved/renamed.
   */
  async updateFilePath(conversationId, newFileRelPath, newArchivedRelPath) {
    await this.db.updateTable("chat_conversation").set({
      file_rel_path: newFileRelPath,
      archived_rel_path: newArchivedRelPath ?? null
    }).where("conversation_id", "=", conversationId).execute();
  }
  /**
   * Get all conversations with file paths (for orphan cleanup).
   */
  async getAllWithFilePaths() {
    return this.db.selectFrom("chat_conversation").select(["conversation_id", "file_rel_path", "archived_rel_path"]).execute();
  }
  /**
   * Delete conversations by IDs.
   */
  async deleteByConversationIds(conversationIds) {
    if (conversationIds.length === 0) return;
    await this.db.deleteFrom("chat_conversation").where("conversation_id", "in", conversationIds).execute();
  }
};

// src/core/utils/hash-utils.ts
var import_crypto2 = require("crypto");
function computeHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}
function hashString(str, minLength = 8) {
  const hash = computeHash(str);
  return Math.abs(hash).toString(16).padStart(minLength, "0");
}
function generateContentHash(content) {
  return hashString(content, 8);
}
function binaryContentHash(data) {
  let buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (data instanceof ArrayBuffer) {
    buffer = Buffer.from(data);
  } else {
    buffer = Buffer.from(data);
  }
  return (0, import_crypto2.createHash)("md5").update(buffer).digest("hex");
}
function hashMD5(str) {
  try {
    return (0, import_crypto2.createHash)("md5").update(str).digest("hex");
  } catch (error) {
    console.warn("MD5 hash not available, using simple hash fallback:", error);
    return hashString(str, 32);
  }
}
function hashSHA256(str) {
  return (0, import_crypto2.createHash)("sha256").update(str, "utf8").digest("hex");
}

// src/core/storage/sqlite/repositories/ChatMessageRepo.ts
var ChatMessageRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Check if message exists by message_id.
   */
  async existsByMessageId(messageId) {
    const row = await this.db.selectFrom("chat_message").select("message_id").where("message_id", "=", messageId).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new chat message.
   */
  async insert(message) {
    await this.db.insertInto("chat_message").values(message).execute();
  }
  /**
   * Update existing chat message by message_id.
   */
  async updateByMessageId(messageId, updates) {
    await this.db.updateTable("chat_message").set(updates).where("message_id", "=", messageId).execute();
  }
  /**
   * Upsert messages for a conversation.
   */
  async upsertMessages(conversationId, messages) {
    if (messages.length === 0) return;
    for (const msg of messages) {
      const messageData = {
        message_id: msg.id,
        conversation_id: conversationId,
        role: msg.role,
        content_hash: hashMD5(msg.content),
        created_at_ts: msg.createdAtTimestamp,
        created_at_zone: msg.createdAtZone,
        model: msg.model ?? null,
        provider: msg.provider ?? null,
        starred: msg.starred ? 1 : 0,
        is_error: msg.isErrorMessage ? 1 : 0,
        is_visible: msg.isVisible !== false ? 1 : 0,
        gen_time_ms: msg.genTimeMs ?? null,
        token_usage_json: msg.tokenUsage ? JSON.stringify(msg.tokenUsage) : null,
        thinking: msg.thinking ?? null
      };
      const exists = await this.existsByMessageId(msg.id);
      if (exists) {
        await this.updateByMessageId(msg.id, {
          conversation_id: conversationId,
          role: msg.role,
          content_hash: hashMD5(msg.content),
          created_at_ts: msg.createdAtTimestamp,
          created_at_zone: msg.createdAtZone,
          model: msg.model ?? null,
          provider: msg.provider ?? null,
          starred: msg.starred ? 1 : 0,
          is_error: msg.isErrorMessage ? 1 : 0,
          is_visible: msg.isVisible !== false ? 1 : 0,
          gen_time_ms: msg.genTimeMs ?? null,
          token_usage_json: msg.tokenUsage ? JSON.stringify(msg.tokenUsage) : null,
          thinking: msg.thinking ?? null
        });
      } else {
        await this.insert(messageData);
      }
    }
  }
  /**
   * List messages for a conversation, ordered by creation time.
   */
  async listByConversation(conversationId) {
    return this.db.selectFrom("chat_message").selectAll().where("conversation_id", "=", conversationId).orderBy("created_at_ts", "asc").execute();
  }
  /**
   * Update starred status for a message.
   * Optionally updates content preview and attachment summary when starring.
   */
  async updateStarred(messageId, starred, contentPreview, attachmentSummary) {
    const updateData = {
      starred: starred ? 1 : 0
    };
    if (starred) {
      if (contentPreview !== void 0) {
        updateData.content_preview = contentPreview || null;
      }
      if (attachmentSummary !== void 0) {
        updateData.attachment_summary = attachmentSummary || null;
      }
    } else {
      updateData.content_preview = null;
      updateData.attachment_summary = null;
    }
    await this.db.updateTable("chat_message").set(updateData).where("message_id", "=", messageId).execute();
  }
  /**
   * List starred messages for a project by joining with chat_conversation table.
   */
  async listStarredByProject(projectId) {
    return this.db.selectFrom("chat_message").innerJoin("chat_conversation", "chat_message.conversation_id", "chat_conversation.conversation_id").selectAll("chat_message").where("chat_conversation.project_id", "=", projectId).where("chat_message.starred", "=", 1).orderBy("chat_message.created_at_ts", "desc").execute();
  }
  /**
   * Count messages for a conversation (lightweight operation).
   */
  async countByConversation(conversationId) {
    const result = await this.db.selectFrom("chat_message").select(({ fn }) => fn.count("message_id").as("count")).where("conversation_id", "=", conversationId).where("is_visible", "=", 1).executeTakeFirst();
    return result?.count ?? 0;
  }
  /**
   * Delete all messages for the given conversation IDs.
   */
  async deleteByConversationIds(conversationIds) {
    if (conversationIds.length === 0) return;
    await this.db.deleteFrom("chat_message").where("conversation_id", "in", conversationIds).execute();
  }
};

// src/core/storage/sqlite/repositories/ChatMessageResourceRepo.ts
var ChatMessageResourceRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Replace all resources for a message (delete old, insert new).
   */
  async replaceForMessage(messageId, resources) {
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom("chat_message_resource").where("message_id", "=", messageId).execute();
      if (resources.length > 0) {
        const values = resources.map((res) => ({
          id: res.id || `${messageId}-${res.source}`,
          message_id: messageId,
          source: res.source,
          kind: res.kind ?? null,
          summary_note_rel_path: res.summaryNotePath ?? null,
          meta_json: null
          // Reserved for future extension
        }));
        await trx.insertInto("chat_message_resource").values(values).execute();
      }
    });
  }
  /**
   * Get all resources for a message.
   */
  async getByMessageId(messageId) {
    return this.db.selectFrom("chat_message_resource").selectAll().where("message_id", "=", messageId).execute();
  }
  /**
   * Get resources for multiple messages.
   */
  async getByMessageIds(messageIds) {
    if (messageIds.length === 0) return /* @__PURE__ */ new Map();
    const rows = await this.db.selectFrom("chat_message_resource").selectAll().where("message_id", "in", messageIds).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const existing = result.get(row.message_id) || [];
      existing.push(row);
      result.set(row.message_id, existing);
    }
    return result;
  }
  /**
   * Delete resources for the given message IDs.
   */
  async deleteByMessageIds(messageIds) {
    if (messageIds.length === 0) return;
    await this.db.deleteFrom("chat_message_resource").where("message_id", "in", messageIds).execute();
  }
};

// src/core/storage/sqlite/repositories/ChatStarRepo.ts
var ChatStarRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Check if star record exists by source_message_id.
   */
  async existsBySourceMessageId(sourceMessageId) {
    const row = await this.db.selectFrom("chat_star").select("source_message_id").where("source_message_id", "=", sourceMessageId).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new chat star record.
   */
  async insert(star) {
    await this.db.insertInto("chat_star").values(star).execute();
  }
  /**
   * Update existing chat star record by source_message_id.
   */
  async updateBySourceMessageId(sourceMessageId, updates) {
    await this.db.updateTable("chat_star").set(updates).where("source_message_id", "=", sourceMessageId).execute();
  }
  /**
   * Upsert a star record (keyed by source_message_id).
   */
  async upsert(params) {
    const exists = await this.existsBySourceMessageId(params.sourceMessageId);
    if (exists) {
      await this.updateBySourceMessageId(params.sourceMessageId, {
        conversation_id: params.conversationId,
        project_id: params.projectId ?? null,
        active: params.active ? 1 : 0
      });
    } else {
      await this.insert({
        source_message_id: params.sourceMessageId,
        id: params.id,
        conversation_id: params.conversationId,
        project_id: params.projectId ?? null,
        created_at_ts: params.createdAtTs,
        active: params.active ? 1 : 0
      });
    }
  }
  /**
   * Set star active flag for a message.
   */
  async setActive(sourceMessageId, active) {
    await this.db.updateTable("chat_star").set({ active: active ? 1 : 0 }).where("source_message_id", "=", sourceMessageId).execute();
  }
  /**
   * List all active starred messages.
   */
  async listActive() {
    return this.db.selectFrom("chat_star").selectAll().where("active", "=", 1).orderBy("created_at_ts", "desc").execute();
  }
  /**
   * Get star record by message id.
   */
  async getBySourceMessageId(sourceMessageId) {
    const row = await this.db.selectFrom("chat_star").selectAll().where("source_message_id", "=", sourceMessageId).executeTakeFirst();
    return row ?? null;
  }
  /**
   * Delete star records for the given conversation IDs.
   */
  async deleteByConversationIds(conversationIds) {
    if (conversationIds.length === 0) return;
    await this.db.deleteFrom("chat_star").where("conversation_id", "in", conversationIds).execute();
  }
};

// src/core/storage/sqlite/repositories/AIAnalysisRepo.ts
var AIAnalysisRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Insert a record. If vault_rel_path already exists, do nothing.
   */
  async insertOrIgnore(record) {
    await this.db.insertInto("ai_analysis_record").values(record).onConflict((oc) => oc.column("vault_rel_path").doNothing()).execute();
  }
  /**
   * List records ordered by created_at_ts desc.
   */
  async list(params) {
    const limit = Math.max(1, Math.min(200, params.limit || 20));
    const offset = Math.max(0, params.offset || 0);
    return this.db.selectFrom("ai_analysis_record").selectAll().orderBy("created_at_ts", "desc").limit(limit).offset(offset).execute();
  }
  /**
   * Count records.
   */
  async count() {
    const row = await this.db.selectFrom("ai_analysis_record").select((eb) => eb.fn.countAll().as("cnt")).executeTakeFirst();
    return Number(row?.cnt ?? 0);
  }
  /**
   * Delete all records (metadata only).
   */
  async deleteAll() {
    await this.db.deleteFrom("ai_analysis_record").execute();
  }
};

// src/core/storage/sqlite/repositories/UserProfileProcessedHashRepo.ts
var UserProfileProcessedHashRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Insert a hash (idempotent: ignore if exists).
   */
  async insert(contentHash) {
    const now = Date.now();
    await this.db.insertInto("user_profile_processed_hash").values({ content_hash: contentHash, processed_at: now }).onConflict((oc) => oc.column("content_hash").doNothing()).execute();
  }
  /**
   * Insert multiple hashes in one go.
   */
  async insertMany(hashes) {
    if (hashes.length === 0) return;
    const now = Date.now();
    await this.db.insertInto("user_profile_processed_hash").values(hashes.map((content_hash) => ({ content_hash, processed_at: now }))).onConflict((oc) => oc.column("content_hash").doNothing()).execute();
  }
  /**
   * Check if hash exists (single lookup).
   */
  async has(contentHash) {
    const row = await this.db.selectFrom("user_profile_processed_hash").select("content_hash").where("content_hash", "=", contentHash).executeTakeFirst();
    return row != null;
  }
  /**
   * Load all hashes into a Set (for batch filter). Or return array.
   */
  async loadAllHashes() {
    const rows = await this.db.selectFrom("user_profile_processed_hash").select("content_hash").execute();
    return new Set(rows.map((r) => r.content_hash));
  }
  /**
   * Clear all records (e.g. for full re-run).
   */
  async clearAll() {
    await this.db.deleteFrom("user_profile_processed_hash").execute();
  }
};

// src/core/storage/sqlite/SqliteStoreManager.ts
var SqliteStoreManager = class _SqliteStoreManager {
  constructor() {
    // Database connections
    this.searchStore = null;
    this.metaStore = null;
    this.app = null;
    this.isVectorSearchAvailable = false;
    /** Set at start of close() so getters throw and no new work starts; avoids in-flight DB ops after close. */
    this.closing = false;
    // Search database repositories (search.sqlite) — vault index tenant
    this.indexedDocumentRepo = null;
    this.docChunkRepo = null;
    this.embeddingRepo = null;
    this.indexStateRepo = null;
    this.graphRepo = null;
    this.userProfileProcessedHashRepo = null;
    // Meta database index repositories (meta.sqlite) — chat index tenant (ChatFolder)
    this.indexedDocumentRepoChat = null;
    this.docChunkRepoChat = null;
    this.embeddingRepoChat = null;
    this.indexStateRepoChat = null;
    this.graphRepoChat = null;
    this.mobiusNodeRepo = null;
    this.mobiusEdgeRepo = null;
    this.mobiusNodeRepoChat = null;
    this.mobiusEdgeRepoChat = null;
    /** User operation log; uses meta.sqlite (same as chat/ai tables). */
    this.mobiusOperationRepo = null;
    // Meta database repositories (meta.sqlite) — chat/ai tables only
    this.chatProjectRepo = null;
    this.chatConversationRepo = null;
    this.chatMessageRepo = null;
    this.chatMessageResourceRepo = null;
    this.chatStarRepo = null;
    this.aiAnalysisRepo = null;
  }
  static {
    this.instance = null;
  }
  static getInstance() {
    if (!_SqliteStoreManager.instance) {
      _SqliteStoreManager.instance = new _SqliteStoreManager();
    }
    return _SqliteStoreManager.instance;
  }
  static clearInstance() {
    if (_SqliteStoreManager.instance) {
      _SqliteStoreManager.instance.close();
      _SqliteStoreManager.instance = null;
    }
  }
  /**
   * Create a database connection with the specified path and settings.
   */
  async createDatabaseConnection(dbFilePath, settings) {
    await this.selectBackend(settings?.sqliteBackend);
    const result = await BetterSqliteStore.open({ dbFilePath, app: this.app ?? void 0 });
    this.isVectorSearchAvailable = result.sqliteVecAvailable;
    return result.store;
  }
  /**
   * Ensures better-sqlite3 is available. Throws if not (no fallback backend).
   */
  async selectBackend(userSetting) {
    const available = await BetterSqliteStore.checkAvailable(this.app ?? void 0);
    if (!available) {
      throw new Error(
        "better-sqlite3 is required but not available. Install it in the plugin directory (e.g. npm install better-sqlite3) and rebuild for Electron."
      );
    }
    if (userSetting === "better-sqlite3") {
      console.log("[SqliteStoreManager] Using better-sqlite3 (user preference)");
    } else {
      console.log("[SqliteStoreManager] Using better-sqlite3 (auto-detected)");
    }
  }
  /**
   * Calculate database file path with proper storage folder handling.
   */
  async buildDatabasePath(app, storageFolder, dbFilename) {
    const basePath = app.vault.adapter?.basePath ?? "";
    const normalizedStorageFolder = (storageFolder ?? "").trim().replace(/^\/+/, "");
    if (normalizedStorageFolder) {
      await ensureFolderRecursive(app, normalizedStorageFolder);
    }
    const dbPath = basePath ? normalizedStorageFolder ? import_path.default.join(basePath, normalizedStorageFolder, dbFilename) : import_path.default.join(basePath, dbFilename) : null;
    if (!dbPath) {
      throw new Error(`SqliteStoreManager init failed: ${dbFilename} database path is missing and vault basePath is unavailable`);
    }
    return dbPath;
  }
  /**
   * Initialize the database connection.
   * Should be called once during plugin initialization.
   *
   * Requires better-sqlite3 (no other backend).
   *
   * @param app - Obsidian app instance
   * @param storageFolder - Storage folder path (relative to vault root)
   * @param filename - Database filename (default: SEARCH_DB_FILENAME)
   * @param settings - Optional plugin settings (sqliteBackend is ignored; kept for API compatibility)
   */
  async init(params) {
    if (this.searchStore || this.metaStore) {
      console.warn("SqliteStoreManager already initialized, closing existing connections");
      this.close();
    }
    this.app = params.app;
    const searchDbPath = await this.buildDatabasePath(params.app, params.storageFolder, VAULT_DB_FILENAME);
    this.searchStore = await this.createDatabaseConnection(searchDbPath, params.settings);
    const metaDbPath = await this.buildDatabasePath(params.app, params.storageFolder, CHAT_DB_FILENAME);
    this.metaStore = await this.createDatabaseConnection(metaDbPath, params.settings);
    const searchKdb = this.searchStore.kysely();
    const searchRawDb = this.searchStore;
    this.indexedDocumentRepo = new IndexedDocumentRepo(searchKdb);
    this.docChunkRepo = new DocChunkRepo(searchKdb, searchRawDb);
    this.embeddingRepo = new EmbeddingRepo(searchKdb, searchRawDb, this.indexedDocumentRepo);
    this.embeddingRepo.initializeVecEmbeddingsTableCache();
    this.indexStateRepo = new IndexStateRepo(searchKdb);
    this.mobiusNodeRepo = new MobiusNodeRepo(searchKdb);
    this.mobiusEdgeRepo = new MobiusEdgeRepo(searchKdb);
    this.graphRepo = new GraphRepo(this.mobiusNodeRepo, this.mobiusEdgeRepo);
    this.userProfileProcessedHashRepo = new UserProfileProcessedHashRepo(searchKdb);
    const metaKdb = this.metaStore.kysely();
    this.chatProjectRepo = new ChatProjectRepo(metaKdb);
    this.chatConversationRepo = new ChatConversationRepo(metaKdb);
    this.chatMessageRepo = new ChatMessageRepo(metaKdb);
    this.chatMessageResourceRepo = new ChatMessageResourceRepo(metaKdb);
    this.chatStarRepo = new ChatStarRepo(metaKdb);
    this.aiAnalysisRepo = new AIAnalysisRepo(metaKdb);
    this.indexedDocumentRepoChat = new IndexedDocumentRepo(metaKdb);
    this.docChunkRepoChat = new DocChunkRepo(metaKdb, this.metaStore);
    this.embeddingRepoChat = new EmbeddingRepo(metaKdb, this.metaStore, this.indexedDocumentRepoChat);
    this.embeddingRepoChat.initializeVecEmbeddingsTableCache();
    this.indexStateRepoChat = new IndexStateRepo(metaKdb);
    this.mobiusNodeRepoChat = new MobiusNodeRepo(metaKdb);
    this.mobiusEdgeRepoChat = new MobiusEdgeRepo(metaKdb);
    this.graphRepoChat = new GraphRepo(this.mobiusNodeRepoChat, this.mobiusEdgeRepoChat);
    this.mobiusOperationRepo = new MobiusOperationRepo(metaKdb);
  }
  /**
   * Get the Kysely instance for database queries.
   * Returns the search database connection for backward compatibility.
   * Throws error if not initialized.
   */
  getSearchContext() {
    return this.getIndexContext("vault");
  }
  /**
   * Get Kysely for the given index tenant (vault = search.sqlite, chat = meta.sqlite).
   */
  getIndexContext(tenant = "vault") {
    if (this.closing) throw new Error("SqliteStoreManager not initialized or is closing.");
    const store = tenant === "chat" ? this.metaStore : this.searchStore;
    if (!store) throw new Error("SqliteStoreManager not initialized or is closing.");
    return store.kysely();
  }
  /**
   * Get the search database backend type.
   */
  getSearchStore() {
    return this.searchStore;
  }
  /**
   * Get the meta database backend type.
   */
  getMetaStore() {
    return this.metaStore;
  }
  /**
   * Check if the stores are initialized.
   */
  isInitialized() {
    return !this.closing && this.searchStore !== null && this.metaStore !== null;
  }
  /**
   * Get IndexedDocumentRepo for the given index tenant (default: vault).
   */
  getIndexedDocumentRepo(tenant = "vault") {
    if (this.closing) throw new Error("SqliteStoreManager not initialized or is closing.");
    const repo = tenant === "chat" ? this.indexedDocumentRepoChat : this.indexedDocumentRepo;
    if (!repo) throw new Error("SqliteStoreManager not initialized or is closing.");
    return repo;
  }
  /**
   * Get DocChunkRepo for the given index tenant (default: vault).
   */
  getDocChunkRepo(tenant = "vault") {
    if (this.closing) throw new Error("SqliteStoreManager not initialized or is closing.");
    const repo = tenant === "chat" ? this.docChunkRepoChat : this.docChunkRepo;
    if (!repo) throw new Error("SqliteStoreManager not initialized or is closing.");
    return repo;
  }
  /**
   * Get EmbeddingRepo for the given index tenant (default: vault).
   */
  getEmbeddingRepo(tenant = "vault") {
    if (this.closing) throw new Error("SqliteStoreManager not initialized or is closing.");
    const repo = tenant === "chat" ? this.embeddingRepoChat : this.embeddingRepo;
    if (!repo) throw new Error("SqliteStoreManager not initialized or is closing.");
    return repo;
  }
  /**
   * Check if vector similarity search is available.
   * This requires sqlite-vec extension to be loaded successfully.
   */
  isVectorSearchEnabled() {
    return this.isVectorSearchAvailable;
  }
  /**
   * Get IndexStateRepo for the given index tenant (default: vault).
   */
  getIndexStateRepo(tenant = "vault") {
    if (this.closing) throw new Error("SqliteStoreManager not initialized or is closing.");
    const repo = tenant === "chat" ? this.indexStateRepoChat : this.indexStateRepo;
    if (!repo) throw new Error("SqliteStoreManager not initialized or is closing.");
    return repo;
  }
  /**
   * Graph semantics (preview, tags, N-hop) for the given index tenant (default: vault).
   */
  getGraphRepo(tenant = "vault") {
    if (this.closing) throw new Error("SqliteStoreManager not initialized or is closing.");
    const repo = tenant === "chat" ? this.graphRepoChat : this.graphRepo;
    if (!repo) throw new Error("SqliteStoreManager not initialized or is closing.");
    return repo;
  }
  /**
   * Mobius node repo for the given index tenant (vault = search.sqlite, chat = meta.sqlite index).
   */
  getMobiusNodeRepo(tenant = "vault") {
    if (this.closing) throw new Error("SqliteStoreManager not initialized or is closing.");
    const repo = tenant === "chat" ? this.mobiusNodeRepoChat : this.mobiusNodeRepo;
    if (!repo) throw new Error("SqliteStoreManager not initialized or is closing.");
    return repo;
  }
  /**
   * Mobius edge repo for the given index tenant.
   */
  getMobiusEdgeRepo(tenant = "vault") {
    if (this.closing) throw new Error("SqliteStoreManager not initialized or is closing.");
    const repo = tenant === "chat" ? this.mobiusEdgeRepoChat : this.mobiusEdgeRepo;
    if (!repo) throw new Error("SqliteStoreManager not initialized or is closing.");
    return repo;
  }
  /**
   * Append-only operation log (meta.sqlite).
   */
  getMobiusOperationRepo() {
    if (this.closing || !this.mobiusOperationRepo) {
      throw new Error("SqliteStoreManager not initialized or is closing.");
    }
    return this.mobiusOperationRepo;
  }
  /**
   * Get UserProfileProcessedHashRepo instance (search DB).
   */
  getUserProfileProcessedHashRepo() {
    if (this.closing || !this.userProfileProcessedHashRepo) {
      throw new Error("SqliteStoreManager not initialized or is closing.");
    }
    return this.userProfileProcessedHashRepo;
  }
  /**
   * Get ChatProjectRepo instance.
   */
  getChatProjectRepo() {
    if (this.closing || !this.chatProjectRepo) {
      throw new Error("SqliteStoreManager not initialized or is closing.");
    }
    return this.chatProjectRepo;
  }
  /**
   * Get ChatConversationRepo instance.
   */
  getChatConversationRepo() {
    if (this.closing || !this.chatConversationRepo) {
      throw new Error("SqliteStoreManager not initialized or is closing.");
    }
    return this.chatConversationRepo;
  }
  /**
   * Get ChatMessageRepo instance.
   */
  getChatMessageRepo() {
    if (this.closing || !this.chatMessageRepo) {
      throw new Error("SqliteStoreManager not initialized or is closing.");
    }
    return this.chatMessageRepo;
  }
  /**
   * Get ChatMessageResourceRepo instance.
   */
  getChatMessageResourceRepo() {
    if (this.closing || !this.chatMessageResourceRepo) {
      throw new Error("SqliteStoreManager not initialized or is closing.");
    }
    return this.chatMessageResourceRepo;
  }
  /**
   * Get ChatStarRepo instance.
   */
  getChatStarRepo() {
    if (this.closing || !this.chatStarRepo) {
      throw new Error("SqliteStoreManager not initialized or is closing.");
    }
    return this.chatStarRepo;
  }
  /**
   * Get AIAnalysisRepo instance (meta.sqlite).
   */
  getAIAnalysisRepo() {
    if (this.closing || !this.aiAnalysisRepo) {
      throw new Error("SqliteStoreManager not initialized or is closing.");
    }
    return this.aiAnalysisRepo;
  }
  /**
   * No-op for compatibility. better-sqlite3 persists to file automatically.
   */
  save() {
  }
  close() {
    this.closing = true;
    try {
      if (this.searchStore) {
        this.searchStore.close();
        this.searchStore = null;
      }
      if (this.metaStore) {
        this.metaStore.close();
        this.metaStore = null;
      }
    } catch (e) {
      console.warn("[SqliteStoreManager] Error during close (ignored):", e);
    }
    this.app = null;
    this.indexedDocumentRepo = null;
    this.docChunkRepo = null;
    this.embeddingRepo = null;
    this.indexStateRepo = null;
    this.graphRepo = null;
    this.indexedDocumentRepoChat = null;
    this.docChunkRepoChat = null;
    this.embeddingRepoChat = null;
    this.indexStateRepoChat = null;
    this.graphRepoChat = null;
    this.mobiusNodeRepo = null;
    this.mobiusEdgeRepo = null;
    this.mobiusNodeRepoChat = null;
    this.mobiusEdgeRepoChat = null;
    this.mobiusOperationRepo = null;
    this.chatProjectRepo = null;
    this.chatConversationRepo = null;
    this.chatMessageRepo = null;
    this.chatMessageResourceRepo = null;
    this.chatStarRepo = null;
    this.aiAnalysisRepo = null;
    this.userProfileProcessedHashRepo = null;
  }
};
var sqliteStoreManager = SqliteStoreManager.getInstance();

// src/service/search/index/helper/hub/hubDiscover.ts
var import_obsidian19 = __toESM(require_obsidian_stub());

// src/core/eventBus.ts
var EventBus = class _EventBus {
  constructor(app) {
    /** All active unsubscribe fns; cleared and invoked in offAll() so workspace refs are released. */
    this.subscribers = [];
    this.app = app;
  }
  static {
    this.instance = null;
  }
  /**
   * Get singleton instance
   */
  static getInstance(app) {
    if (!_EventBus.instance) {
      _EventBus.instance = new _EventBus(app);
    }
    return _EventBus.instance;
  }
  /**
   * Remove all subscriptions from workspace, then clear singleton.
   * Call from plugin onunload so old refs are released and next load gets a fresh instance.
   */
  static destroyInstance() {
    if (_EventBus.instance) {
      _EventBus.instance.offAll();
      _EventBus.instance = null;
    }
  }
  /** Unregister every subscription so workspace no longer holds refs to plugin closures. */
  offAll() {
    const list = this.subscribers;
    this.subscribers.length = 0;
    for (const fn of list) {
      try {
        fn();
      } catch (e) {
        console.warn("[EventBus] offAll: unsubscribe threw", e);
      }
    }
  }
  /**
   * Dispatch an event
   */
  dispatch(event) {
    this.app.workspace.trigger(event.type, event);
  }
  on(eventType, callback) {
    const ref = this.app.workspace.on(eventType, callback);
    const unsubscribe = () => this.app.workspace.offref(ref);
    this.subscribers.push(unsubscribe);
    return () => {
      const i = this.subscribers.indexOf(unsubscribe);
      if (i !== -1) this.subscribers.splice(i, 1);
      unsubscribe();
    };
  }
};

// src/core/schemas/zod-types.ts
var import_v33 = require("zod/v3");
var ZodError = import_v33.z.ZodError;

// src/core/schemas/hubDiscoverLlm.ts
var import_v34 = require("zod/v3");
var hubDiscoverJudgeLlmSchema = import_v34.z.object({
  accept: import_v34.z.boolean().describe("Whether this candidate should be materialized as a hub_doc"),
  confidence: import_v34.z.number().min(0).max(1).describe("Confidence in the decision"),
  reason: import_v34.z.string().max(500).describe("Short English rationale")
});
var hubDiscoverRoundReviewLlmSchema = import_v34.z.object({
  coverageSufficient: import_v34.z.boolean().describe("Whether selected hubs adequately cover the vault for navigation"),
  quality: import_v34.z.enum(["good", "acceptable", "poor"]).describe("Overall quality of the hub set"),
  needAnotherRound: import_v34.z.boolean().describe("Whether another discovery round would likely add value"),
  confidence: import_v34.z.number().min(0).max(1).describe("Confidence in this assessment"),
  summary: import_v34.z.string().max(800).describe("Short English summary"),
  strengths: import_v34.z.array(import_v34.z.string()).max(10).describe("What works well"),
  issues: import_v34.z.array(import_v34.z.string()).max(10).describe("Gaps or structural problems"),
  nextDirections: import_v34.z.array(import_v34.z.string()).max(10).describe("Concrete directions for further discovery"),
  suggestedDiscoveryModes: import_v34.z.array(import_v34.z.enum(["folder", "document", "cluster", "manual_seed"])).max(10).describe("Which discovery modes to emphasize next"),
  targetPathPrefixes: import_v34.z.array(import_v34.z.string()).max(20).describe("Vault path prefixes to prioritize"),
  stopReason: import_v34.z.string().max(500).describe("Why stopping or continuing")
});
var hubAssemblyHintsLlmSchema = import_v34.z.object({
  hubs: import_v34.z.array(
    import_v34.z.object({
      stableKey: import_v34.z.string().max(512),
      preferredChildHubNodeIds: import_v34.z.array(import_v34.z.string()).max(48).optional(),
      stopAtChildHub: import_v34.z.boolean().optional(),
      expectedTopology: import_v34.z.enum(["hierarchical", "clustered", "mixed"]).optional(),
      deprioritizedBridgeNodeIds: import_v34.z.array(import_v34.z.string()).max(48).optional(),
      rationale: import_v34.z.string().max(800).optional()
    })
  ).max(64)
});
var hubDocSummaryLlmSchema = import_v34.z.object({
  shortSummary: import_v34.z.string(),
  fullSummary: import_v34.z.string(),
  coreFacts: import_v34.z.array(import_v34.z.string()).default([]),
  queryAnchors: import_v34.z.array(import_v34.z.string()).default([]),
  tagTopicDistribution: import_v34.z.string(),
  timeDimension: import_v34.z.string(),
  keyPatterns: import_v34.z.string().optional()
}).refine((d) => d.shortSummary.trim().length > 0 || d.fullSummary.trim().length > 0, {
  message: "At least one of shortSummary or fullSummary must be non-empty"
});

// src/core/schemas/tools/searchWeb.ts
var import_v35 = require("zod/v3");
var localWebSearchInputSchema = import_v35.z.object({
  query: import_v35.z.string().describe("The search query"),
  limit: import_v35.z.number().int().positive().max(50, "Maximum number of results is 50").default(10).describe("Maximum number of results to return").nullable()
});
var perplexityWebSearchInputSchema = import_v35.z.object({
  query: import_v35.z.string().describe("The search query")
});

// src/core/schemas/tools/searchGraphInspector.ts
var import_v36 = require("zod/v3");
var SorterOption = import_v36.z.enum([
  "result_rank_desc",
  "result_rank_asc",
  "created_desc",
  "created_asc",
  "modified_desc",
  "modified_asc",
  "total_links_count_desc",
  "total_links_count_asc",
  "backlinks_count_desc",
  "backlinks_count_asc",
  "outlinks_count_desc",
  "outlinks_count_asc"
]);
var TIME_WITHIN_VALUES = [
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "last_3_months",
  "this_year"
];
var TimeWithinEnum = import_v36.z.enum(TIME_WITHIN_VALUES);
var TIME_WITHIN_NORMALIZE = {
  last_3_years: "this_year",
  last_2_years: "this_year",
  last_year: "this_year",
  last_6_months: "last_3_months",
  last_month: "this_month",
  last_week: "this_week",
  recent: "this_month"
};
function normalizeTimeWithin(val) {
  if (val == null) return void 0;
  const s = String(val).trim().toLowerCase();
  if (TIME_WITHIN_VALUES.includes(s))
    return s;
  return TIME_WITHIN_NORMALIZE[s] ?? "this_year";
}
var FilterOption = import_v36.z.object({
  // tag_category_boolean_expression: z
  // 	.string()
  // 	.nullable()
  // 	.describe(
  // 		"Complex boolean expression for filtering. Use only tag:value, category:value, AND, OR, NOT, and parentheses. " +
  // 			"Each value must be a single word (no spaces, no special characters). " +
  // 			"Example: tag:javascript AND category:programming or (tag:react OR tag:vue) AND category:frontend."
  // 	),
  type: import_v36.z.enum(["note", "folder", "file", "all"]).nullable().default("all").describe(
    "note (markdown only), file (attachments), folder, or all (everything). Default is 'all'."
  ),
  path: import_v36.z.string().nullable().describe("Regex or prefix for file paths"),
  modified_within: import_v36.z.preprocess((val) => normalizeTimeWithin(val), TimeWithinEnum.nullable()),
  created_within: import_v36.z.preprocess((val) => normalizeTimeWithin(val), TimeWithinEnum.nullable())
});
var SemanticFilter = import_v36.z.object({
  query: import_v36.z.string().describe(
    "A descriptive phrase of the concept you're looking for. Example: 'advanced machine learning optimization' (don't use single keywords)."
  ),
  topK: import_v36.z.number().min(1).max(50).default(20).describe("Number of top similar nodes to keep")
});
var ResponseFormat = import_v36.z.object({
  response_format: import_v36.z.enum(["structured", "markdown", "hybrid"]).default("hybrid").describe(
    "Choose 'markdown' if you need to reason about relationships, summarize content, or present findings. Choose 'structured' if you are performing multi-step operations for programmatic piping (e.g., getting IDs for another tool).Choose 'hybrid' if you need to get both data and context. But avoid this as it may cause context overflow(especially for graph_traversal)."
  )
});
var BaseLimit = import_v36.z.object({
  limit: import_v36.z.number().min(1).max(100).nullable().default(20).describe(
    "Maximum number of results(each step inner also. not so strictly.)"
  )
});
var SemanticOptions = import_v36.z.object({
  include_semantic_paths: import_v36.z.boolean().nullable().default(true).describe(
    "Include document semantic connection paths (vector-similar neighbors). Prefer true for richer discovery; set false only when you need physical links only."
  ),
  semantic_filter: SemanticFilter.nullable().describe(
    "Semantic pruning/relevance filtering. The conceptual anchor for filtering. Instead of 'AI', use 'Large language model architecture and training' to ensure vector relevance."
  )
});
var inspectNoteContextInputSchema = import_v36.z.object({
  note_path: import_v36.z.string()
}).merge(BaseLimit).extend({
  include_semantic_paths: SemanticOptions.shape.include_semantic_paths,
  response_format: ResponseFormat.shape.response_format.default("structured")
});
var graphTraversalInputSchema = import_v36.z.object({
  start_note_path: import_v36.z.string(),
  hops: import_v36.z.number().min(1).max(3).default(1).describe(
    "3 hops is usually enough to cover a vast knowledge cluster. start with 1-2 hops. Only escalate to 3 hops if the results are too sparse."
  )
}).merge(SemanticOptions).extend({
  filters: FilterOption.nullable().describe(
    "Only filter document nodes in each level."
  ),
  sorter: SorterOption.nullable().describe("Only sort document nodes in each level."),
  response_format: ResponseFormat.shape.response_format.default("structured"),
  limit: import_v36.z.number().min(1).max(100).nullable().default(15).describe(
    "Maximum number of results. do not set too large as it may cause context overflow."
  )
});
var hubLocalGraphInputSchema = import_v36.z.object({
  center_note_path: import_v36.z.string().describe("Vault-relative note path used as hub center."),
  max_depth: import_v36.z.number().min(1).max(6).nullable().default(4).describe(
    "Maximum local expansion depth for the hub neighborhood. Start with 2-4 and only increase when the graph is too sparse."
  )
}).extend({
  response_format: ResponseFormat.shape.response_format.default("structured")
});
var findPathInputSchema = import_v36.z.object({
  start_note_path: import_v36.z.string(),
  end_note_path: import_v36.z.string()
}).merge(BaseLimit).extend({
  filters: FilterOption.nullable().describe(
    "Filter nodes in the path. May cost much more time and resources. As the graph algorithm is time-consuming."
  ),
  include_semantic_paths: SemanticOptions.shape.include_semantic_paths,
  response_format: ResponseFormat.shape.response_format.default("structured")
});
var findKeyNodesInputSchema = import_v36.z.object({}).merge(BaseLimit).extend({
  filters: FilterOption.nullable(),
  sorter: SorterOption.nullable().default("backlinks_count_desc"),
  semantic_filter: SemanticOptions.shape.semantic_filter.nullable(),
  response_format: ResponseFormat.shape.response_format.default("markdown")
});
var findOrphansInputSchema = import_v36.z.object({}).extend({
  limit: import_v36.z.number().min(1).max(1e3).nullable().default(50).describe("Maximum number of results."),
  filters: FilterOption.nullable(),
  sorter: SorterOption.nullable(),
  response_format: ResponseFormat.shape.response_format.default("markdown")
});
var searchByDimensionsInputSchema = import_v36.z.object({
  boolean_expression: import_v36.z.string().describe(
    "Complex boolean expression for filtering. Use only tag:value, functional:value, AND, OR, NOT, and parentheses. Each value must be a single word (no spaces, no special characters). Example: tag:javascript AND functional:programming or (tag:react OR tag:vue) AND functional:frontend. If no results are found, try relaxing the boolean constraints or switching to OR logic."
  )
}).merge(BaseLimit).extend({
  filters: FilterOption.omit({
    // tag_category_boolean_expression: true
  }).nullable(),
  sorter: SorterOption.nullable(),
  response_format: ResponseFormat.shape.response_format.default("structured")
});
var exploreFolderInputSchema = import_v36.z.object({
  folderPath: import_v36.z.string().default("/").describe(
    "Folder path to inspect (relative to vault root, use '/' for root)"
  ),
  recursive: import_v36.z.boolean().default(true),
  max_depth: import_v36.z.number().min(1).max(3).nullable().default(2).describe(
    "Only active when recursive: true. Use max_depth: 1 for quick navigation, use max_depth: 3 only for deep structure mapping."
  )
}).merge(BaseLimit).extend({
  limit: import_v36.z.number().min(1).max(100).nullable().default(50).describe("Per-folder item cap; use \u226550 for inventory/full-list breadth."),
  filters: FilterOption.nullable(),
  sorter: SorterOption.nullable(),
  response_format: ResponseFormat.shape.response_format.default("markdown")
});
var grepFileTreeInputSchema = import_v36.z.object({
  pattern: import_v36.z.string().min(1).describe("Search pattern (substring or regex) to match against vault file paths. Use to find anchor paths or folder names quickly."),
  limit: import_v36.z.number().min(1).max(500).nullable().default(200).describe("Max number of matching paths to return (default 200).")
});
var recentChangesWholeVaultInputSchema = import_v36.z.object({}).merge(BaseLimit).extend({
  filters: FilterOption.nullable(),
  sorter: SorterOption.nullable(),
  response_format: ResponseFormat.shape.response_format.default("markdown")
});
var localSearchWholeVaultInputSchema = import_v36.z.object({
  query: import_v36.z.string().describe("The query to search for"),
  searchMode: import_v36.z.enum(["fulltext", "vector", "hybrid"]).nullable().default("fulltext").describe(
    "Search mode: 'fulltext' (text only), 'vector' (embedding-based), or 'hybrid' (combine both)."
  ),
  scopeMode: import_v36.z.enum(["vault", "inFile", "inFolder", "limitIdsSet"]).nullable().default("vault").describe(
    "Scope of search: 'vault' (entire vault), 'inFile' (current file), 'inFolder' (a folder and its subnotes), or 'limitIdsSet' (specific note ids set)."
  ),
  current_file_path: import_v36.z.string().nullable().nullable().describe(
    "Current file path (if any). Used for inFile mode and directory boost."
  ),
  folder_path: import_v36.z.string().nullable().nullable().describe("Folder path (if inFolder mode)."),
  limit_ids_set: import_v36.z.array(import_v36.z.string()).nullable().describe(
    "Set of note/document ids to limit search within (if limitIdsSet mode)."
  ),
  limit: import_v36.z.number().min(1).max(100).nullable().default(20).describe(
    "Maximum number of results. Use 15-25 for broader coverage; 8-12 for fast narrow search."
  )
}).extend({
  filters: FilterOption.nullable(),
  sorter: SorterOption.nullable(),
  response_format: ResponseFormat.shape.response_format.default("structured")
});

// src/core/schemas/tools/contentReader.ts
var import_v37 = require("zod/v3");
function makeContentReaderInputSchema(params) {
  const { shortSummaryLength, fullSummaryLength } = params;
  return import_v37.z.object({
    path: import_v37.z.string().describe("path related to vault root."),
    mode: import_v37.z.enum(["fullContent", "shortSummary", "fullSummary", "range", "grep", "meta"]).default("shortSummary").describe(
      `reading mode: prefer 'shortSummary', 'grep', or 'range'; 'fullContent' only for small files (see size limit), 'shortSummary' get short summary, len <${shortSummaryLength} 'fullSummary' get full summary, len <${fullSummaryLength} 'range' get specific lines (1-based, inclusive), 'grep' search within a single file and return matched lines`
    ),
    lineRange: import_v37.z.object({
      start: import_v37.z.number().describe("The start line (1-based). Must be positive.").int().positive(),
      end: import_v37.z.number().describe("The end line (1-based). Must be positive and >= start.").int().positive()
    }).refine(
      (obj) => typeof obj.start === "number" && typeof obj.end === "number" && obj.end >= obj.start,
      { message: "end must be greater than or equal to start" }
    ).nullable().describe("the range of lines of parsed document content to read."),
    query: import_v37.z.string().nullable().describe(
      "Search query used by grep mode. Treated as RegExp by default; falls back to literal match if invalid."
    ),
    case_sensitive: import_v37.z.boolean().nullable().default(true).describe("Case sensitive search for grep mode. Default true."),
    max_matches: import_v37.z.number().int().min(1).max(50).nullable().default(50).describe("Maximum number of matches for grep mode (hard cap 50).")
  }).superRefine((data, ctx) => {
    if (data.mode === "range") {
      if (!data.lineRange) {
        ctx.addIssue({ code: import_v37.z.ZodIssueCode.custom, path: ["lineRange"], message: "lineRange is required when mode is 'range'" });
      }
    }
    if (data.mode === "grep") {
      if (!data.query || !data.query.trim()) {
        ctx.addIssue({ code: import_v37.z.ZodIssueCode.custom, path: ["query"], message: "query is required when mode is 'grep'" });
      }
    }
  });
}

// src/core/schemas/tools/searchMemoryStore.ts
var import_v38 = require("zod/v3");
var searchMemoryStoreInputSchema = import_v38.z.object({
  query: import_v38.z.string().describe("Search query (keyword or phrase)"),
  maxChars: import_v38.z.number().min(100).max(8e3).nullable().describe("Max chars to return (default 4000)")
});
var getAnalysisMessageCountInputSchema = import_v38.z.object({});

// src/core/schemas/tools/callAgentTool.ts
var import_v39 = require("zod/v3");

// src/core/schemas/tools/submitFinalAnswer.ts
var import_v310 = require("zod/v3");
var submitFinalAnswerInputSchema = import_v310.z.object({});

// src/core/schemas/tools/submitOverviewLogicModel.ts
var import_v311 = require("zod/v3");
var submitOverviewLogicModelInputSchema = import_v311.z.object({
  logicModel: overviewLogicModelSchema
});

// src/core/schemas/tools/updateResultOperations.ts
var import_v312 = require("zod/v3");

// src/core/template-engine-helper.ts
var import_handlebars = __toESM(require("handlebars"));
var import_js_yaml = __toESM(require("js-yaml"));
function compileTemplate(template) {
  registerTemplateEngineHelpers();
  return import_handlebars.default.compile(template);
}
var MAX_COMPILE_CACHE = 64;
var buildResponseCompileCache = /* @__PURE__ */ new Map();
function getCompiledBounded(template) {
  let fn = buildResponseCompileCache.get(template);
  if (!fn) {
    if (buildResponseCompileCache.size >= MAX_COMPILE_CACHE) {
      const firstKey = buildResponseCompileCache.keys().next().value;
      if (firstKey !== void 0) buildResponseCompileCache.delete(firstKey);
    }
    fn = compileTemplate(template);
    buildResponseCompileCache.set(template, fn);
  }
  return fn;
}
var helpersRegistered = false;
function registerTemplateEngineHelpers() {
  if (helpersRegistered) return;
  helpersRegistered = true;
  import_handlebars.default.registerHelper(
    "join",
    (array, separator) => Array.isArray(array) ? array.join(separator ?? ",") : String(array ?? "")
  );
  import_handlebars.default.registerHelper("take", (arr, n) => {
    if (!Array.isArray(arr)) return [];
    const limit = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    return arr.slice(0, limit);
  });
  import_handlebars.default.registerHelper("truncate", (str, maxLen) => {
    const s = typeof str === "string" ? str : String(str ?? "");
    const len = typeof maxLen === "number" ? maxLen : 300;
    if (s.length <= len) return s;
    return s.slice(0, len) + "...";
  });
  import_handlebars.default.registerHelper("toJson", (value) => {
    if (value === void 0 || value === null) return "";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  });
  import_handlebars.default.registerHelper("humanReadableTime", function(timestamp) {
    return timestamp ? humanReadableTime(timestamp) : "N/A";
  });
  import_handlebars.default.registerHelper("eq", function(a, b) {
    return a === b;
  });
  import_handlebars.default.registerHelper("gt", function(a, b) {
    return a > b;
  });
  import_handlebars.default.registerHelper("lt", function(a, b) {
    return a < b;
  });
  import_handlebars.default.registerHelper("gte", function(a, b) {
    return a >= b;
  });
  import_handlebars.default.registerHelper("lte", function(a, b) {
    return a <= b;
  });
  import_handlebars.default.registerHelper("similarLabel", function(count) {
    const n = typeof count === "number" ? count : 0;
    return n > 1 ? ` _(${n} similar)_` : "";
  });
  import_handlebars.default.registerHelper("lookup", function(obj, key) {
    return obj != null && typeof obj === "object" && key != null ? obj[key] : void 0;
  });
  import_handlebars.default.registerHelper("nonEmpty", (arr) => Array.isArray(arr) && arr.length > 0);
  import_handlebars.default.registerHelper("flattenEvidenceFacts", (packs) => {
    if (!Array.isArray(packs)) return [];
    const out = [];
    let n = 0;
    for (let i = 0; i < packs.length; i++) {
      const p = packs[i];
      const sourceId = `S${i + 1}`;
      const facts = Array.isArray(p?.facts) ? p.facts : [];
      for (const f of facts) {
        n++;
        const claim = (f?.claim ?? "").trim();
        out.push({ n, claim, sourceId });
      }
    }
    return out;
  });
  import_handlebars.default.registerHelper("formatNodeLabel", function(label, type) {
    switch (type) {
      case GraphNodeType.TopicTag:
        return `#${label}`;
      case GraphNodeType.FunctionalTag:
        return `\u{1F4C1}${label}`;
      case GraphNodeType.Document:
      default:
        return `[[${label}]]`;
    }
  });
  import_handlebars.default.registerHelper("hasNodeType", function(nodes, nodeType) {
    return nodes.some((node) => node.nodeType === nodeType);
  });
  import_handlebars.default.registerHelper("inc", function(value) {
    return parseInt(value) + 1;
  });
  import_handlebars.default.registerHelper("indent", function(depth) {
    const d = Number(depth) || 0;
    return " ".repeat(4 * d);
  });
  import_handlebars.default.registerHelper("toYaml", (jsonStr, baseIndent) => {
    try {
      const obj = JSON.parse(jsonStr);
      const rawYaml = import_js_yaml.default.dump(obj, {
        indent: 2,
        skipInvalid: true,
        // disable automatic wrapping
        lineWidth: -1,
        noRefs: true,
        // force double quotes instead of block mode
        quotingType: '"'
      }).trim();
      const spaces = " ".repeat(typeof baseIndent === "number" ? baseIndent : 0);
      return rawYaml.split("\n").map((line) => `${spaces}${line}`).join("\n");
    } catch {
      return jsonStr;
    }
  });
}

// src/core/template/TemplateRegistry.ts
var ToolTemplateId = {
  LocalSearch: "local-search",
  SearchByDimensions: "search-by-dimensions",
  RecentChanges: "recent-changes",
  GraphPathFinding: "graph-path-finding",
  InspectNoteContext: "inspect-note-context",
  ExploreFolder: "explore-folder",
  OrphanNotes: "orphan-notes",
  FindKeyNodes: "find-key-nodes",
  GraphTraversal: "graph-traversal"
};
var AgentTemplateId = {
  ResultSnapshot: "result-snapshot",
  EvidenceHint: "evidence-hint",
  EvidenceGroupSharedContext: "evidence-group-shared-context",
  /** Weaved context from recon merged paths (structure + mesh). */
  WeavePathsContext: "weave-paths-context",
  ReportBlockBlueprintLine: "report-block-blueprint-line"
};
var IndexingTemplateId = {
  CodeStopwords: "indexing-code-stopwords",
  /** Hub-discover deterministic next-direction hint; render with `{ gapPrefixes: string[] }`. */
  HubDiscoverNextDirections: "indexing-hub-discover-next-directions"
};
var CATEGORY_PREFIX = {
  prompts: "templates/prompts",
  tools: "templates/tools",
  agents: "templates/agents",
  ui: "templates/ui",
  indexing: "templates/indexing"
};
function meta(category, fileStem, opts) {
  const ext = "md";
  return {
    category,
    path: `${CATEGORY_PREFIX[category]}/${fileStem}.${ext}`,
    ...opts
  };
}
var TEMPLATE_METADATA = {
  // --- Prompts (category prompts) ---
  "conversation-system": meta("prompts", "conversation-system"),
  "conversation-summary-short": meta("prompts", "conversation-summary-short"),
  "conversation-summary-full": meta("prompts", "conversation-summary-full"),
  "project-summary-short": meta("prompts", "project-summary-short"),
  "project-summary-full": meta("prompts", "project-summary-full"),
  "search-rerank-rank-gpt": meta("prompts", "search-rerank-rank-gpt"),
  "application-generate-title": meta("prompts", "application-generate-title"),
  "memory-extract-candidates-json": meta("prompts", "memory-extract-candidates-json", { expectsJson: true, jsonConstraint: "Return only the JSON array, nothing else." }),
  "prompt-quality-eval-json": meta("prompts", "prompt-quality-eval-json", { expectsJson: true, jsonConstraint: "Return only the JSON object, nothing else." }),
  "prompt-rewrite-with-library": meta("prompts", "prompt-rewrite-with-library"),
  "doc-summary": meta("prompts", "doc-summary"),
  "doc-summary-short": meta("prompts", "doc-summary-short"),
  "doc-summary-full": meta("prompts", "doc-summary-full"),
  "ai-analysis-session-summary": meta("prompts", "ai-analysis-session-summary"),
  "image-description": meta("prompts", "image-description"),
  "image-summary": meta("prompts", "image-summary"),
  "folder-project-summary": meta("prompts", "folder-project-summary"),
  "ai-analysis-followup": meta("prompts", "ai-analysis-followup"),
  "ai-analysis-followup-system": meta("prompts", "ai-analysis-followup-system"),
  "ai-analysis-title": meta("prompts", "ai-analysis-dashboard-title"),
  "ai-analysis-doc-simple-scope": meta("prompts", "ai-analysis-doc-simple-scope"),
  "ai-analysis-doc-simple-system": meta("prompts", "ai-analysis-doc-simple-system"),
  "ai-analysis-suggest-follow-up-questions-system": meta("prompts", "ai-analysis-suggest-follow-up-questions-system"),
  "ai-analysis-suggest-follow-up-questions": meta("prompts", "ai-analysis-suggest-follow-up-questions", { systemPromptId: "ai-analysis-suggest-follow-up-questions-system" }),
  "ai-analysis-query-classifier-system": meta("prompts", "ai-analysis-query-classifier-system"),
  "ai-analysis-query-classifier": meta("prompts", "ai-analysis-query-classifier", { expectsJson: true, jsonConstraint: "Return only the JSON object, no markdown or explanation.", systemPromptId: "ai-analysis-query-classifier-system" }),
  "ai-analysis-search-architect-system": meta("prompts", "ai-analysis-search-architect-system"),
  "ai-analysis-search-architect": meta("prompts", "ai-analysis-search-architect", { expectsJson: true, jsonConstraint: "Return only the JSON object with physical_tasks, no markdown or explanation.", systemPromptId: "ai-analysis-search-architect-system" }),
  "ai-analysis-dimension-recon-system": meta("prompts", "ai-analysis-dimension-recon-system"),
  "ai-analysis-dimension-recon": meta("prompts", "ai-analysis-dimension-recon", { systemPromptId: "ai-analysis-dimension-recon-system" }),
  "ai-analysis-recon-loop-plan-system": meta("prompts", "ai-analysis-recon-loop-plan-system"),
  "ai-analysis-recon-loop-plan": meta("prompts", "ai-analysis-recon-loop-plan", { systemPromptId: "ai-analysis-recon-loop-plan-system" }),
  "ai-analysis-recon-loop-path-submit-system": meta("prompts", "ai-analysis-recon-loop-path-submit-system"),
  "ai-analysis-recon-loop-report-system": meta("prompts", "ai-analysis-recon-loop-report-system"),
  "ai-analysis-dimension-evidence-system": meta("prompts", "ai-analysis-dimension-evidence-system"),
  "ai-analysis-dimension-evidence": meta("prompts", "ai-analysis-dimension-evidence", { systemPromptId: "ai-analysis-dimension-evidence-system" }),
  "ai-analysis-task-consolidator-system": meta("prompts", "ai-analysis-task-consolidator-system"),
  "ai-analysis-task-consolidator": meta("prompts", "ai-analysis-task-consolidator", { expectsJson: true, jsonConstraint: "Return only the JSON object, no markdown or explanation.", systemPromptId: "ai-analysis-task-consolidator-system" }),
  "ai-analysis-group-context-system": meta("prompts", "ai-analysis-group-context-system"),
  "ai-analysis-group-context-single": meta("prompts", "ai-analysis-group-context-single", { expectsJson: true, jsonConstraint: "Return only the JSON object with topic_anchor and group_focus, no markdown or explanation.", systemPromptId: "ai-analysis-group-context-system" }),
  "ai-analysis-dimension-evidence-batch": meta("prompts", "ai-analysis-dimension-evidence-batch", { systemPromptId: "ai-analysis-dimension-evidence-system" }),
  "ai-analysis-summary-system": meta("prompts", "ai-analysis-dashboard-result-summary-system"),
  "search-ai-summary": meta("prompts", "ai-analysis-dashboard-result-summary", { systemPromptId: "ai-analysis-summary-system" }),
  "ai-analysis-overview-regenerate": meta("prompts", "ai-analysis-overview-regenerate"),
  "ai-analysis-overview-logic-model-system": meta("prompts", "ai-analysis-overview-logic-model-system"),
  "ai-analysis-overview-logic-model": meta("prompts", "ai-analysis-overview-logic-model", { expectsJson: true, jsonConstraint: "Return only the JSON object, no markdown or explanation.", systemPromptId: "ai-analysis-overview-logic-model-system" }),
  "ai-analysis-overview-logic-model-from-recon-system": meta("prompts", "ai-analysis-overview-logic-model-from-recon-system"),
  "ai-analysis-overview-logic-model-from-recon": meta("prompts", "ai-analysis-overview-logic-model-from-recon", { systemPromptId: "ai-analysis-overview-logic-model-from-recon-system" }),
  "ai-analysis-overview-mermaid-render-system": meta("prompts", "ai-analysis-overview-mermaid-render-system"),
  "ai-analysis-overview-mermaid-render": meta("prompts", "ai-analysis-overview-mermaid-render", { systemPromptId: "ai-analysis-overview-mermaid-render-system" }),
  "ai-analysis-dashboard-update-topics-system": meta("prompts", "ai-analysis-dashboard-update-topics-system"),
  "ai-analysis-dashboard-update-topics": meta("prompts", "ai-analysis-dashboard-update-topics", { systemPromptId: "ai-analysis-dashboard-update-topics-system" }),
  "ai-analysis-dashboard-update-blocks-system": meta("prompts", "ai-analysis-dashboard-update-blocks-system"),
  "ai-analysis-dashboard-update-blocks": meta("prompts", "ai-analysis-dashboard-update-blocks", { systemPromptId: "ai-analysis-dashboard-update-blocks-system" }),
  "ai-analysis-review-blocks-system": meta("prompts", "ai-analysis-review-blocks-system"),
  "ai-analysis-review-blocks": meta("prompts", "ai-analysis-review-blocks", { systemPromptId: "ai-analysis-review-blocks-system" }),
  "ai-analysis-dashboard-update-plan-system": meta("prompts", "ai-analysis-dashboard-update-plan-system"),
  "ai-analysis-dashboard-update-plan": meta("prompts", "ai-analysis-dashboard-update-plan", { systemPromptId: "ai-analysis-dashboard-update-plan-system" }),
  "ai-analysis-report-plan-system": meta("prompts", "ai-analysis-report-plan-system"),
  "ai-analysis-report-plan": meta("prompts", "ai-analysis-report-plan", { systemPromptId: "ai-analysis-report-plan-system" }),
  "ai-analysis-visual-blueprint-system": meta("prompts", "ai-analysis-visual-blueprint-system"),
  "ai-analysis-visual-blueprint": meta("prompts", "ai-analysis-visual-blueprint", { systemPromptId: "ai-analysis-visual-blueprint-system" }),
  "ai-analysis-report-body-blocks-system": meta("prompts", "ai-analysis-report-body-blocks-system"),
  "ai-analysis-report-body-blocks": meta("prompts", "ai-analysis-report-body-blocks", { systemPromptId: "ai-analysis-report-body-blocks-system" }),
  "ai-analysis-report-appendices-blocks-system": meta("prompts", "ai-analysis-report-appendices-blocks-system"),
  "ai-analysis-report-appendices-blocks": meta("prompts", "ai-analysis-report-appendices-blocks", { systemPromptId: "ai-analysis-report-appendices-blocks-system" }),
  "ai-analysis-mermaid-fix-system": meta("prompts", "ai-analysis-mermaid-fix-system"),
  "ai-analysis-mermaid-fix": meta("prompts", "ai-analysis-mermaid-fix", { systemPromptId: "ai-analysis-mermaid-fix-system" }),
  "ai-analysis-save-filename": meta("prompts", "ai-analysis-save-filename"),
  "ai-analysis-save-folder": meta("prompts", "ai-analysis-save-folder"),
  "doc-type-classify-json": meta("prompts", "doc-type-classify-json", { expectsJson: true, jsonConstraint: "Return only the JSON object, nothing else." }),
  "doc-tag-generate-json": meta("prompts", "doc-tag-generate-json", {
    expectsJson: true,
    jsonConstraint: "Return only the JSON object with topicTagEntries, functionalTagEntries, context tag arrays, and optional inferCreatedAt string, nothing else."
  }),
  "hub-doc-summary-system": meta("prompts", "hub-doc-summary-system"),
  "hub-doc-summary": meta("prompts", "hub-doc-summary", {
    expectsJson: true,
    jsonConstraint: "Return exactly one JSON object with keys shortSummary, fullSummary, coreFacts, queryAnchors, tagTopicDistribution, timeDimension, keyPatterns. No markdown fences.",
    systemPromptId: "hub-doc-summary-system"
  }),
  "hub-discover-judge-system": meta("prompts", "hub-discover-judge-system"),
  "hub-discover-judge": meta("prompts", "hub-discover-judge", {
    expectsJson: true,
    jsonConstraint: "Return only JSON: { accept, confidence, reason }.",
    systemPromptId: "hub-discover-judge-system"
  }),
  "hub-discover-round-review-system": meta("prompts", "hub-discover-round-review-system"),
  "hub-discover-round-review": meta("prompts", "hub-discover-round-review", {
    expectsJson: true,
    jsonConstraint: "Return only JSON: coverageSufficient, quality, needAnotherRound, confidence, summary, strengths, issues, nextDirections, suggestedDiscoveryModes, targetPathPrefixes, stopReason.",
    systemPromptId: "hub-discover-round-review-system"
  }),
  "context-memory": meta("prompts", "context-memory"),
  "user-profile-context": meta("prompts", "user-profile-context"),
  "profile-from-vault-json": meta("prompts", "profile-from-vault-json", { expectsJson: true, jsonConstraint: "Return only the JSON array, nothing else." }),
  "user-profile-organize-markdown": meta("prompts", "user-profile-organize-markdown"),
  "message-resources": meta("prompts", "message-resources"),
  // --- Tools ---
  [ToolTemplateId.LocalSearch]: meta("tools", "local-search"),
  [ToolTemplateId.SearchByDimensions]: meta("tools", "search-by-dimensions"),
  [ToolTemplateId.RecentChanges]: meta("tools", "recent-changes"),
  [ToolTemplateId.GraphPathFinding]: meta("tools", "graph-path-finding"),
  [ToolTemplateId.InspectNoteContext]: meta("tools", "inspect-note-context"),
  [ToolTemplateId.ExploreFolder]: meta("tools", "explore-folder"),
  [ToolTemplateId.OrphanNotes]: meta("tools", "orphan-notes"),
  [ToolTemplateId.FindKeyNodes]: meta("tools", "find-key-nodes"),
  [ToolTemplateId.GraphTraversal]: meta("tools", "graph-traversal"),
  // --- Agents ---
  [AgentTemplateId.ResultSnapshot]: meta("agents", "result-snapshot"),
  [AgentTemplateId.EvidenceHint]: meta("agents", "evidence-hint"),
  [AgentTemplateId.EvidenceGroupSharedContext]: meta("agents", "evidence-group-shared-context"),
  [AgentTemplateId.WeavePathsContext]: meta("agents", "weave-paths-context"),
  [AgentTemplateId.ReportBlockBlueprintLine]: meta("agents", "report-block-blueprint-line"),
  // --- Indexing (Handlebars; loaded at plugin boot for markdown chunking helpers) ---
  [IndexingTemplateId.CodeStopwords]: meta("indexing", "code-stopwords"),
  [IndexingTemplateId.HubDiscoverNextDirections]: meta("indexing", "hub-discover-next-directions")
};

// src/service/tools/types.ts
var TOOL_TEMPLATE_IDS = new Set(Object.values(ToolTemplateId));
function isToolTemplateId(s) {
  return TOOL_TEMPLATE_IDS.has(s);
}
function safeAgentTool(tool) {
  return {
    description: tool.description,
    inputSchema: tool.inputSchema,
    execute: async (parameters) => {
      const start = Date.now();
      try {
        const parsedParameters = parameters ? tool.inputSchema.parse(parameters) : void 0;
        return {
          result: await tool.execute(parsedParameters),
          durationMs: Date.now() - start
        };
      } catch (error) {
        if (error instanceof ZodError) {
          const details = error.errors.map((e) => e.message).join("; ");
          return {
            error: "FAILED: Invalid or missing parameters. " + details + " Fix and re-run the tool with the required fields.",
            durationMs: Date.now() - start
          };
        }
        console.error("[Tool Safe Wrapper] Unknown internal error: ", error);
        return {
          error: "[Tool Safe Wrapper] Unknown internal error: " + error.message,
          durationMs: Date.now() - start
        };
      }
    }
  };
}
async function withTimeoutMessage(operation, timeoutMs, operationName = "Operation") {
  return Promise.race([
    operation.then((data) => ({ success: true, data })),
    new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: false,
          message: `${operationName} timed out after ${timeoutMs}ms. The operation took too long to complete.`
        });
      }, timeoutMs);
    })
  ]);
}
async function buildResponse(responseFormat, templateOrId, result, options) {
  if (responseFormat === "structured") {
    return result;
  }
  let rendered;
  if (templateOrId !== void 0) {
    const useTemplateManager = typeof templateOrId === "string" ? isToolTemplateId(templateOrId) : true;
    if (useTemplateManager) {
      const tm = options?.templateManager ?? AppContext.getInstance().manager.getTemplateManager?.();
      if (tm) {
        rendered = await tm.render(templateOrId, result);
      }
    } else {
      rendered = getCompiledBounded(templateOrId)(result);
    }
  }
  switch (responseFormat) {
    case "markdown":
      return rendered ?? result;
    case "hybrid":
      return { data: result, template: rendered ?? result };
    default:
      throw new Error(`Invalid response format: ${responseFormat}`);
  }
}

// src/core/utils/collection-utils.ts
function mapGetAll(map, keys) {
  const result = [];
  for (const key of keys) {
    if (map.has(key)) {
      result.push(map.get(key));
    }
  }
  return result;
}
var EMPTY_SET = /* @__PURE__ */ new Set();
var EMPTY_MAP = /* @__PURE__ */ new Map();
function emptyMap() {
  return EMPTY_MAP;
}

// src/core/utils/obsidian-utils.ts
var import_obsidian2 = __toESM(require_obsidian_stub());
async function readFileAsText(filePath) {
  try {
    const app = AppContext.getInstance().app;
    const normalizedPath = (0, import_obsidian2.normalizePath)(filePath.startsWith("/") ? filePath.slice(1) : filePath);
    const file = app.vault.getAbstractFileByPath(normalizedPath);
    if (file && file instanceof import_obsidian2.TFile) {
      return await app.vault.read(file);
    }
  } catch (error) {
    console.warn(`[obsidian-utils] Failed to read file as text: ${filePath}`, error);
  }
  return null;
}
function getFileTypeByPath(filePath) {
  const app = AppContext.getInstance().app;
  const path3 = filePath;
  const abstractFile = app.vault.getAbstractFileByPath(path3);
  let itemType = "folder";
  if (abstractFile) {
    if ("extension" in abstractFile) {
      itemType = abstractFile.extension === "md" ? "note" : "file";
    } else {
      itemType = "folder";
    }
  }
  return itemType ?? null;
}

// src/service/tools/search-graph-inspector/boolean-expression-parser.ts
var BooleanExpressionParser = class {
  constructor(expression) {
    this.pos = 0;
    this.tokens = [];
    this.expression = expression == null ? "" : String(expression).trim();
    if (!this.expression) {
      throw new Error("Empty expression");
    }
    this.ast = this.parse(this.expression);
  }
  parse(expression) {
    this.pos = 0;
    const input = expression == null ? "" : String(expression).trim();
    this.tokens = this.tokenize(input);
    const result = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token at end of expression: ${this.tokens[this.pos]}`);
    }
    return result;
  }
  /** Extract topic, functional, and keyword values from the AST. */
  extractDimensions() {
    const tags = [];
    const functionals = [];
    const keywords = [];
    const traverse = (expr) => {
      switch (expr.type) {
        case "tag":
          if (expr.value && !tags.includes(expr.value)) tags.push(expr.value);
          break;
        case "functional":
          if (expr.value && !functionals.includes(expr.value)) functionals.push(expr.value);
          break;
        case "keyword":
          if (expr.value && !keywords.includes(expr.value)) keywords.push(expr.value);
          break;
        case "and":
        case "or":
          if (expr.left) traverse(expr.left);
          if (expr.right) traverse(expr.right);
          break;
        case "not":
          if (expr.left) traverse(expr.left);
          break;
      }
    };
    traverse(this.ast);
    return { tags, functionals, keywords };
  }
  buildEdgeConditions(tagLookup, functionalLookup, keywordLookup) {
    const buildConditions = (expr) => {
      switch (expr.type) {
        case "tag": {
          if (!expr.value) return [];
          const id = tagLookup.get(expr.value);
          return id ? [`(type = '${GraphEdgeType.TaggedTopic}' AND to_node_id = '${id}')`] : [];
        }
        case "functional": {
          if (!expr.value) return [];
          const id = functionalLookup.get(expr.value);
          return id ? [`(type = '${GraphEdgeType.TaggedFunctional}' AND to_node_id = '${id}')`] : [];
        }
        case "keyword": {
          if (!expr.value) return [];
          const id = keywordLookup.get(expr.value);
          return id ? [`(type = '${GraphEdgeType.TaggedKeyword}' AND to_node_id = '${id}')`] : [];
        }
        case "and":
          if (!expr.left || !expr.right) return [];
          const leftAnd = buildConditions(expr.left);
          const rightAnd = buildConditions(expr.right);
          if (leftAnd.length === 0 || rightAnd.length === 0) return [];
          return [`(${leftAnd.join(" OR ")}) AND (${rightAnd.join(" OR ")})`];
        case "or":
          if (!expr.left || !expr.right) return [];
          return [...buildConditions(expr.left), ...buildConditions(expr.right)];
        case "not":
          return expr.left ? buildConditions(expr.left) : [];
        default:
          return [];
      }
    };
    return buildConditions(this.ast).join(" OR ");
  }
  rootEvaluate(note) {
    const topic = note.topicTags ?? note.tags ?? [];
    const functionalTagEntries = note.functionalTagEntries?.length ? note.functionalTagEntries : note.category ? [{ id: note.category }] : [];
    const keyword = note.keywordTags ?? [];
    const normalized = { topicTags: topic, functionalTagEntries, keywordTags: keyword };
    return this.evaluate(this.ast, normalized);
  }
  evaluate(expression, note) {
    switch (expression.type) {
      case "tag":
        return note.topicTags?.includes(expression.value) ?? false;
      case "functional":
        return note.functionalTagEntries?.some((e) => e.id === expression.value) ?? false;
      case "keyword":
        return note.keywordTags?.includes(expression.value) ?? false;
      case "and":
        return this.evaluate(expression.left, note) && this.evaluate(expression.right, note);
      case "or":
        return this.evaluate(expression.left, note) || this.evaluate(expression.right, note);
      case "not":
        return !this.evaluate(expression.left, note);
      default:
        return false;
    }
  }
  tokenize(input) {
    const tokens = [];
    const lower = input.toLowerCase();
    let i = 0;
    while (i < input.length) {
      const char = input[i];
      if (/\s/.test(char)) {
        i++;
        continue;
      }
      if (char === "(" || char === ")") {
        tokens.push(char);
        i++;
        continue;
      }
      if (lower.substring(i, i + 3) === "and") {
        tokens.push("AND");
        i += 3;
        continue;
      }
      if (lower.substring(i, i + 2) === "or") {
        tokens.push("OR");
        i += 2;
        continue;
      }
      if (lower.substring(i, i + 3) === "not") {
        tokens.push("NOT");
        i += 3;
        continue;
      }
      if (lower.substring(i, i + 4) === "tag:") {
        const start = i;
        i += 4;
        while (i < input.length && !/\s/.test(input[i]) && input[i] !== ")" && input[i] !== "(") {
          i++;
        }
        const token = input.substring(start, i);
        if (token.length === 4) {
          throw new Error(`Invalid tag expression: ${token} (missing value after tag:)`);
        }
        tokens.push("tag:" + token.slice(4));
        continue;
      }
      if (lower.substring(i, i + 11) === "functional:") {
        const start = i;
        i += 11;
        while (i < input.length && !/\s/.test(input[i]) && input[i] !== ")" && input[i] !== "(") {
          i++;
        }
        const token = input.substring(start, i);
        if (token.length === 11) {
          throw new Error(`Invalid functional expression: ${token} (missing value after functional:)`);
        }
        tokens.push("functional:" + token.slice(11));
        continue;
      }
      if (lower.substring(i, i + 8) === "keyword:") {
        const start = i;
        i += 8;
        while (i < input.length && !/\s/.test(input[i]) && input[i] !== ")" && input[i] !== "(") {
          i++;
        }
        const token = input.substring(start, i);
        if (token.length === 8) {
          throw new Error(`Invalid keyword expression: ${token} (missing value after keyword:)`);
        }
        tokens.push("keyword:" + token.slice(8));
        continue;
      }
      throw new Error(`Invalid character at position ${i}: ${char}`);
    }
    return tokens;
  }
  parseExpression() {
    let result = this.parseTerm();
    while (this.pos < this.tokens.length && (this.tokens[this.pos] === "AND" || this.tokens[this.pos] === "OR")) {
      const operator = this.tokens[this.pos++];
      const right = this.parseTerm();
      result = {
        type: operator === "AND" ? "and" : "or",
        left: result,
        right
      };
    }
    return result;
  }
  parseTerm() {
    if (this.tokens[this.pos] === "NOT") {
      this.pos++;
      return {
        type: "not",
        left: this.parseTerm()
      };
    }
    if (this.tokens[this.pos] === "(") {
      this.pos++;
      const expr = this.parseExpression();
      if (this.tokens[this.pos] !== ")") {
        throw new Error("Expected closing parenthesis");
      }
      this.pos++;
      return expr;
    }
    if (this.tokens[this.pos].startsWith("tag:")) {
      const value = this.tokens[this.pos++].substring(4);
      return { type: "tag", value };
    }
    if (this.tokens[this.pos].startsWith("functional:")) {
      const value = this.tokens[this.pos++].substring(11);
      return { type: "functional", value };
    }
    if (this.tokens[this.pos].startsWith("keyword:")) {
      const value = this.tokens[this.pos++].substring(8);
      return { type: "keyword", value };
    }
    throw new Error(`Unexpected token: ${this.tokens[this.pos]}`);
  }
};

// src/core/utils/format-utils.ts
var LRUCache = class {
  /**
   * @param ttl 10min
   * @param cleanupInterval 5s
   */
  constructor(maxSize = 100, ttl = 6e5, cleanupInterval = 5e3) {
    this.cache = /* @__PURE__ */ new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cleanupInterval = cleanupInterval;
    this.startCleanupTimer();
  }
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttl) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.cache.delete(key));
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return void 0;
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return void 0;
    }
    this.cache.delete(key);
    this.cache.set(key, { value: entry.value, timestamp: now });
    return entry.value;
  }
  set(key, value) {
    const now = Date.now();
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, timestamp: now });
  }
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
  clear() {
    this.cache.clear();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = void 0;
    }
  }
  size() {
    this.cleanup();
    return this.cache.size;
  }
};
var regexCache = new LRUCache(50);
function globToRegexPattern(glob) {
  return glob.split("").map((c) => {
    if (c === "*") return ".*";
    if (c === "?") return ".";
    if (/[.+^${}()|[\]\\]/.test(c)) return "\\" + c;
    return c;
  }).join("");
}
function getCachedRegex(pattern) {
  let regex = regexCache.get(pattern);
  if (!regex) {
    try {
      regex = new RegExp(pattern);
      regexCache.set(pattern, regex);
    } catch (e) {
      try {
        const asRegex = globToRegexPattern(pattern);
        regex = new RegExp(asRegex);
        regexCache.set(pattern, regex);
      } catch (e2) {
        console.error("[getCachedRegex] Error compiling regex:", e);
        regex = /^$/;
      }
    }
  }
  return regex;
}
var semanticDateRangeCache = new LRUCache(30);
var booleanExpressionCache = new LRUCache(50);
function getCachedBooleanExpression(expression) {
  if (!expression) return null;
  const trimmed = String(expression).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return null;
  let parser = booleanExpressionCache.get(expression);
  if (!parser) {
    try {
      parser = new BooleanExpressionParser(expression);
      booleanExpressionCache.set(expression, parser);
    } catch (e) {
      console.warn("[getCachedBooleanExpression] Invalid expression, skipping filter:", trimmed.slice(0, SLICE_CAPS.utils.logExpressionPreview), e);
      return null;
    }
  }
  return parser;
}

// src/service/tools/search-graph-inspector/common.ts
async function getSemanticNeighbors(docId, limit, filterDocIds = EMPTY_SET, tenant = "vault") {
  const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
  const queryVector = await embeddingRepo.getEmbeddingForSemanticSearch(docId);
  if (!queryVector) {
    return [];
  }
  const searchResults = await embeddingRepo.searchSimilarAndGetId(
    queryVector,
    limit * 2,
    "excludeDocIdsSet",
    { excludeDocIdsSet: filterDocIds }
  );
  const resultDocIds = Array.from(new Set(searchResults.map((r) => r.doc_id)));
  const resultDocNodesMap = await sqliteStoreManager.getMobiusNodeRepo(tenant).getByIds(resultDocIds);
  return searchResults.map((r) => {
    const docId2 = r.doc_id;
    const resultDocNode = resultDocNodesMap.get(docId2);
    if (!resultDocNode) return null;
    return {
      ...resultDocNode,
      // easier to understand for Agent (and user) in percentage form
      similarity: `${(r.similarity * 100).toFixed(1)}%`
    };
  }).filter((n) => n !== null).filter((n) => n.id !== docId).filter((n) => !filterDocIds.has(n.id)).slice(0, limit);
}
async function distillClusterNodesData(nodes, limit, ignoreDocumentNodes = false) {
  const typeNodeMap = {};
  for (const node of nodes) {
    const type = node.type;
    if (!typeNodeMap[type]) {
      typeNodeMap[type] = [];
    }
    typeNodeMap[type].push(node);
  }
  let documentNodes = typeNodeMap[GraphNodeType.Document];
  let omittedDocNodeCnt = 0;
  if (!ignoreDocumentNodes && documentNodes && documentNodes.length > 0) {
    const nodeIds = documentNodes.map((node) => node.id);
    const densityMap = await sqliteStoreManager.getMobiusEdgeRepo().countEdges(nodeIds);
    const docStatisticsMap = await sqliteStoreManager.getMobiusNodeRepo().getByDocIds(nodeIds);
    documentNodes = calculateDocumentRRF(documentNodes, densityMap.total, docStatisticsMap).sort((a, b) => b.rrfScore - a.rrfScore);
    const originalCount = documentNodes.length;
    if (originalCount > limit) {
      documentNodes = documentNodes.slice(0, limit);
      omittedDocNodeCnt = originalCount - limit;
    }
  }
  const tagNodes = typeNodeMap[GraphNodeType.TopicTag];
  const categoryNodes = typeNodeMap[GraphNodeType.FunctionalTag];
  return {
    documentNodes,
    // for all nodes parse tags, categories to one line to save tokens. we do not need to list their details.
    tagDesc: tagNodes?.map((n) => n.label).join(", "),
    categoryDesc: categoryNodes?.map((n) => n.label).join(", "),
    omittedDocNodeCnt: omittedDocNodeCnt > 0 ? omittedDocNodeCnt : void 0
  };
}
function calculateDocumentRRF(nodes, densityMap, docStatisticsMap) {
  const densityRankMap = new Map(
    [...nodes].sort((a, b) => (densityMap.get(b.id) || 0) - (densityMap.get(a.id) || 0)).map((node, index) => [node.id, index + 1])
  );
  const updateTimeRankMap = new Map(
    [...nodes].sort((a, b) => b.updated_at - a.updated_at).map((node, index) => [node.id, index + 1])
  );
  const richnessRankMap = new Map(
    [...nodes].sort((a, b) => {
      const aRich = docStatisticsMap.get(a.id)?.richness_score || 0;
      const bRich = docStatisticsMap.get(b.id)?.richness_score || 0;
      return bRich - aRich;
    }).map((node, index) => [node.id, index + 1])
  );
  const openCountRankMap = new Map(
    [...nodes].sort((a, b) => {
      const aOpens = docStatisticsMap.get(a.id)?.open_count || 0;
      const bOpens = docStatisticsMap.get(b.id)?.open_count || 0;
      return bOpens - aOpens;
    }).map((node, index) => [node.id, index + 1])
  );
  const lastOpenRankMap = new Map(
    [...nodes].sort((a, b) => {
      const aLast = docStatisticsMap.get(a.id)?.last_open_ts || 0;
      const bLast = docStatisticsMap.get(b.id)?.last_open_ts || 0;
      return bLast - aLast;
    }).map((node, index) => [node.id, index + 1])
  );
  const semanticNodes = nodes.filter((n) => n.foundBy === "semantic_neighbors");
  const similarityRankMap = semanticNodes.length > 0 ? new Map(
    [...semanticNodes].sort((a, b) => {
      const aSim = parseFloat(a.similarity) || 0;
      const bSim = parseFloat(b.similarity) || 0;
      return bSim - aSim;
    }).map((node, index) => [node.id, index + 1])
  ) : null;
  return nodes.map((node) => {
    const stats = docStatisticsMap.get(node.id);
    const extendedNode = node;
    const densityRank = (densityRankMap.get(node.id) || nodes.length) - 1;
    const updateTimeRank = (updateTimeRankMap.get(node.id) || nodes.length) - 1;
    const richnessRank = (richnessRankMap.get(node.id) || nodes.length) - 1;
    const openCountRank = (openCountRankMap.get(node.id) || nodes.length) - 1;
    const lastOpenRank = (lastOpenRankMap.get(node.id) || nodes.length) - 1;
    const richnessScore = stats?.richness_score || 0;
    const openCount = stats?.open_count || 0;
    const lastOpenTs = stats?.last_open_ts || 0;
    const densityScore = GRAPH_RRF_WEIGHTS.density * (1 / (RRF_K + densityRank));
    const updateTimeScore = GRAPH_RRF_WEIGHTS.updateTime * (1 / (RRF_K + updateTimeRank));
    const richnessScore_rrf = richnessScore > 0 ? GRAPH_RRF_WEIGHTS.richness * (1 / (RRF_K + richnessRank)) : 0;
    const openCountScore = openCount > 0 ? GRAPH_RRF_WEIGHTS.openCount * (1 / (RRF_K + openCountRank)) : 0;
    const lastOpenScore = lastOpenTs > 0 ? GRAPH_RRF_WEIGHTS.lastOpen * (1 / (RRF_K + lastOpenRank)) : 0;
    let similarityScore_rrf = 0;
    if (extendedNode.foundBy === "semantic_neighbors" && extendedNode.similarity) {
      const similarityScore = parseFloat(extendedNode.similarity) || 0;
      if (similarityScore > 0) {
        const similarityRank = (similarityRankMap?.get(node.id) || semanticNodes.length) - 1;
        similarityScore_rrf = GRAPH_RRF_WEIGHTS.similarity * (1 / (RRF_K + similarityRank));
      }
    }
    const physicalBonus = extendedNode.foundBy === "physical_neighbors" ? PHYSICAL_CONNECTION_BONUS : 0;
    const rrfScore = densityScore + updateTimeScore + richnessScore_rrf + openCountScore + lastOpenScore + similarityScore_rrf + physicalBonus;
    return { ...node, rrfScore };
  });
}
async function getSemanticSearchResults(semanticFilter, scopeMode = "vault", scopeValue) {
  if (!semanticFilter) {
    return [];
  }
  const { query, topK } = semanticFilter;
  try {
    const searchClient = AppContext.getInstance().searchClient;
    const vectorResults = await searchClient.vectorSearch({
      text: query,
      topK: Math.min(topK, 100),
      scopeMode,
      scopeValue
    });
    const paths = vectorResults.items.map((result) => result.path);
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
    const pathToDocMap = await indexedDocumentRepo.getByPaths(paths);
    const docIdMap = /* @__PURE__ */ new Map();
    for (const [path3, docMeta] of pathToDocMap) {
      docIdMap.set(path3, docMeta.id);
    }
    const semanticResults = vectorResults.items.map((result) => {
      const docId = docIdMap.get(result.path);
      if (!docId) return null;
      return {
        nodeId: docId,
        score: result.finalScore || result.score || 0
      };
    }).filter((result) => result !== null);
    return semanticResults;
  } catch (error) {
    console.warn("[getSemanticSearchResults] Semantic search failed:", error);
    return [];
  }
}
function getPathFromNode(node) {
  if (!node) return "";
  return JSON.parse(node.attributes || "{}").path;
}
async function getDefaultItemFiledGetter(nodeIds, filters, sorter) {
  const nodesMap = await sqliteStoreManager.getMobiusNodeRepo().getByIds(nodeIds);
  const tagsTripleMap = filters?.tag_category_boolean_expression ? (await sqliteStoreManager.getGraphRepo().getTagsByDocIds(nodeIds)).idMapToTags : emptyMap();
  const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const { incoming: inCominglinksCountMap, outgoing: outGoinglinksCountMap, total: totalLinksCountMap } = sorter === "backlinks_count_asc" || sorter === "backlinks_count_desc" || sorter === "outlinks_count_asc" || sorter === "outlinks_count_desc" ? await edgeRepo.countEdges(nodeIds) : { incoming: emptyMap(), outgoing: emptyMap(), total: emptyMap() };
  return (node) => ({
    getPath: () => getPathFromNode(nodesMap.get(node.id)),
    getModified: () => new Date(nodesMap.get(node.id)?.updated_at || Date.now()),
    getCreated: () => new Date(nodesMap.get(node.id)?.created_at || Date.now()),
    getTopicTags: () => tagsTripleMap.get(node.id)?.topicTags ?? [],
    getFunctionalTagEntries: () => tagsTripleMap.get(node.id)?.functionalTagEntries ?? [],
    getFunctionalTags: () => tagsTripleMap.get(node.id)?.functionalTagEntries.map((e) => e.id) ?? [],
    getKeywordTags: () => tagsTripleMap.get(node.id)?.keywordTags ?? [],
    getTags: () => {
      const t = tagsTripleMap.get(node.id);
      return [
        ...t?.topicTags ?? [],
        ...t?.keywordTags ?? [],
        ...t?.timeTags ?? [],
        ...t?.geoTags ?? [],
        ...t?.personTags ?? []
      ];
    },
    getCategory: () => tagsTripleMap.get(node.id)?.functionalTagEntries?.[0]?.id,
    // all same rank
    getResultRank: () => 0,
    getTotalLinksCount: () => totalLinksCountMap.get(node.id) || 0,
    getInCominglinksCount: () => inCominglinksCountMap.get(node.id) || 0,
    getOutgoingCount: () => outGoinglinksCountMap.get(node.id) || 0
  });
}
function applyFiltersAndSorters(items, filters, sorter, limit, itemFiledGetter) {
  let filteredItems = [...items];
  if (filters) {
    filteredItems = filteredItems.filter((item) => shouldIncludeItem(item, filters, itemFiledGetter));
  }
  if (sorter) {
    const compareFn = getCompareFn(sorter, itemFiledGetter);
    filteredItems.sort(compareFn);
  }
  if (limit && limit > 0) {
    filteredItems = filteredItems.slice(0, limit);
  }
  return filteredItems;
}
function shouldIncludeItem(item, filters, itemFiledGetter) {
  const path3 = itemFiledGetter?.(item).getPath?.();
  if (filters.type && filters.type !== "all" && path3 !== void 0) {
    const itemType = getFileTypeByPath(path3);
    if (filters.type === "note" && itemType !== "note") return false;
    if (filters.type === "file" && itemType !== "file") return false;
    if (filters.type === "folder" && itemType !== "folder") return false;
  }
  if (filters.path && path3 !== void 0) {
    try {
      if (filters.path.startsWith("/")) {
        if (!path3.startsWith(filters.path)) return false;
      } else {
        const pathPattern = getCachedRegex(filters.path.slice(1));
        if (!pathPattern.test(path3)) return false;
      }
    } catch (e) {
      console.warn("[shouldIncludeItem] Invalid regex:", e);
      if (!path3.startsWith(filters.path)) return false;
    }
  }
  const itemModified = itemFiledGetter?.(item).getModified?.();
  const itemCreated = itemFiledGetter?.(item).getCreated?.();
  const { timeToFilter, timeFilterTarget } = filters.modified_within ? { timeToFilter: itemModified, timeFilterTarget: filters.modified_within } : filters.created_within ? { timeToFilter: itemCreated, timeFilterTarget: filters.created_within } : { timeToFilter: void 0, timeFilterTarget: void 0 };
  if (timeToFilter && timeFilterTarget) {
    const timeToFilterTime = timeToFilter;
    const timeFilterTargetTime = parseSemanticDateRange(timeFilterTarget);
    if (timeToFilterTime.getTime() < timeFilterTargetTime.getTime()) return false;
  }
  const g = itemFiledGetter?.(item);
  const tagCategoryBooleanExpression = getCachedBooleanExpression(filters?.tag_category_boolean_expression);
  if (tagCategoryBooleanExpression) {
    const hasSplit = typeof g?.getTopicTags === "function" || typeof g?.getKeywordTags === "function" || typeof g?.getFunctionalTags === "function";
    const topicTags = hasSplit ? g?.getTopicTags?.() ?? [] : g?.getTags?.() ?? [];
    const keywordTags = hasSplit ? g?.getKeywordTags?.() ?? [] : [];
    const functionalTagEntries = g?.getFunctionalTagEntries?.() ?? (g?.getFunctionalTags?.() ?? []).map((id) => ({ id }));
    return tagCategoryBooleanExpression.rootEvaluate({
      topicTags,
      functionalTagEntries,
      keywordTags,
      tags: topicTags,
      category: functionalTagEntries[0]?.id ?? g?.getCategory?.()
    });
  }
  return true;
}
var SORTER_WHITELIST = [
  "result_rank_asc",
  "result_rank_desc",
  "modified_asc",
  "modified_desc",
  "created_asc",
  "created_desc",
  "total_links_count_asc",
  "total_links_count_desc",
  "backlinks_count_asc",
  "backlinks_count_desc",
  "outlinks_count_asc",
  "outlinks_count_desc"
];
function getCompareFn(sorter, itemFiledGetter) {
  const normalized = typeof sorter === "string" ? sorter.trim() : "";
  const sorterKey = SORTER_WHITELIST.includes(normalized) ? normalized : sorter;
  let valToCompareGetter = null;
  switch (sorterKey) {
    case "result_rank_asc":
    case "result_rank_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getResultRank?.() || 0;
      break;
    case "modified_asc":
    case "modified_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getModified?.()?.getTime() || 0;
      break;
    case "created_asc":
    case "created_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getCreated?.()?.getTime() || 0;
      break;
    case "total_links_count_asc":
    case "total_links_count_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getTotalLinksCount?.() || 0;
      break;
    case "backlinks_count_asc":
    case "backlinks_count_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getInCominglinksCount?.() || 0;
      break;
    case "outlinks_count_asc":
    case "outlinks_count_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getOutgoingCount?.() || 0;
      break;
    default:
      throw new Error(`Invalid sorter: ${sorter}`);
  }
  if (sorterKey.endsWith("_desc")) {
    return (a, b) => {
      const aVal = valToCompareGetter(a);
      const bVal = valToCompareGetter(b);
      return compareNumbers(bVal, aVal);
    };
  } else {
    return (a, b) => {
      const aVal = valToCompareGetter(a);
      const bVal = valToCompareGetter(b);
      return compareNumbers(aVal, bVal);
    };
  }
}
function compareNumbers(a, b) {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

// src/service/tools/search-graph-inspector/inspect-note-context.ts
async function inspectNoteContext(params, templateManager) {
  const { note_path, limit, include_semantic_paths, response_format } = params;
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const docMeta = await indexedDocumentRepo.getByPath(note_path);
  if (!docMeta) {
    return `Note not found in database: ${note_path}`;
  }
  const inAndOutEdges = await sqliteStoreManager.getMobiusEdgeRepo().getAllEdgesForNode(docMeta.id, limit);
  const inComingNode = inAndOutEdges.filter((e) => e.to_node_id === docMeta.id).map((e) => e.from_node_id);
  const outGoingNode = inAndOutEdges.filter((e) => e.from_node_id === docMeta.id).map((e) => e.to_node_id);
  const connectedNodesMap = await sqliteStoreManager.getMobiusNodeRepo().getByIds([...inComingNode, ...outGoingNode]);
  const { idMapToTags } = await sqliteStoreManager.getGraphRepo().getTagsByDocIds([docMeta.id]);
  const functionalTagEntries = idMapToTags.get(docMeta.id)?.functionalTagEntries ?? [];
  let topicTags = [];
  let keywordTags = [];
  let timeTags = [];
  let geoTags = [];
  let personTags = [];
  let neighborDocumentsIds = /* @__PURE__ */ new Set();
  for (const nodeVal of connectedNodesMap.values()) {
    if (nodeVal.type === GraphNodeType.TopicTag) {
      topicTags.push(nodeVal.label);
    }
    if (nodeVal.type === GraphNodeType.KeywordTag) {
      keywordTags.push(nodeVal.label);
    }
    if (nodeVal.type === GraphNodeType.ContextTag) {
      const ax = contextAxisFromInspectNode(nodeVal);
      if (ax === "time") timeTags.push(nodeVal.label);
      else if (ax === "geo") geoTags.push(nodeVal.label);
      else if (ax === "person") personTags.push(nodeVal.label);
    }
    if (nodeVal.type === GraphNodeType.Document) {
      neighborDocumentsIds.add(nodeVal.id);
    }
  }
  const semanticNeighbors = include_semantic_paths ? await getSemanticNeighbors(docMeta.id, limit, neighborDocumentsIds) : [];
  const data = {
    note_path,
    topicTags,
    functionalTagEntries,
    keywordTags,
    timeTags,
    geoTags,
    personTags,
    tags: [
      ...topicTags,
      ...keywordTags,
      ...timeTags,
      ...geoTags,
      ...personTags,
      ...functionalTagEntries.map((e) => e.id)
    ],
    categories: functionalTagEntries.map((e) => e.id),
    incoming: await distillClusterNodesData(
      mapGetAll(connectedNodesMap, inComingNode),
      limit
    ),
    outgoing: await distillClusterNodesData(
      mapGetAll(connectedNodesMap, outGoingNode),
      limit
    ),
    semanticNeighbors: await distillClusterNodesData(
      semanticNeighbors,
      limit
    )
  };
  return buildResponse(response_format, ToolTemplateId.InspectNoteContext, data, { templateManager });
}
function contextAxisFromInspectNode(node) {
  try {
    const a = JSON.parse(node.attributes || "{}");
    if (a.axis === "time" || a.axis === "geo" || a.axis === "person") return a.axis;
  } catch {
  }
  if (node.label.startsWith("Time")) return "time";
  if (node.label.startsWith("Geo")) return "geo";
  if (node.label.startsWith("Person")) return "person";
  return null;
}

// src/service/tools/search-graph-inspector/graph-traversal.ts
async function graphTraversal(params, templateManager) {
  const { start_note_path, hops, include_semantic_paths, limit, response_format, filters, sorter } = params;
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const startIndexedDoc = await sqliteStoreManager.getIndexedDocumentRepo().getByPath(start_note_path);
  if (!startIndexedDoc) {
    return `Graph Traversal Failed. Start note "${start_note_path}" not found in database.`;
  }
  const startNode = await mobiusNodeRepo.getById(startIndexedDoc.id);
  if (!startNode) {
    return `Graph Traversal Failed. Start note node "${start_note_path}" not found in graph database.`;
  }
  const visited = /* @__PURE__ */ new Set([startNode.id]);
  let isTimeOut = false;
  const startTime = Date.now();
  const queue = [
    { ...startNode, depth: 0, foundBy: "physical_neighbors" }
  ];
  const result = [];
  const collectedEdges = [];
  while (queue.length > 0) {
    if (Date.now() - startTime > GRAPH_INSPECT_STEP_TIME_LIMIT) {
      isTimeOut = true;
      break;
    }
    const current = queue.shift();
    if (current.depth > hops)
      continue;
    result.push(current);
    if (current.depth === hops) {
      continue;
    }
    const physicalInAndOutEdges = await mobiusEdgeRepo.getAllEdgesForNode(current.id, limit);
    for (const edge of physicalInAndOutEdges) {
      collectedEdges.push({
        from_node_id: edge.from_node_id,
        to_node_id: edge.to_node_id,
        type: edge.type,
        weight: edge.weight
      });
    }
    const inComingNode = physicalInAndOutEdges.filter((e) => e.to_node_id === current.id).map((e) => e.from_node_id);
    const outGoingNode = physicalInAndOutEdges.filter((e) => e.from_node_id === current.id).map((e) => e.to_node_id);
    let semanticLimit = limit;
    if (include_semantic_paths && current.depth > 0) {
      const decayMap = [limit, 3, 1];
      semanticLimit = decayMap[current.depth] ?? 0;
    }
    const semanticFilterSet = /* @__PURE__ */ new Set([...inComingNode, ...outGoingNode]);
    const semanticNodes = include_semantic_paths && current.type === "document" ? await getSemanticNeighbors(current.id, semanticLimit, semanticFilterSet) : [];
    const connectedNodesMap = await sqliteStoreManager.getMobiusNodeRepo().getByIds([...inComingNode, ...outGoingNode]);
    for (const [nodeId, node] of connectedNodesMap) {
      if (!visited.has(nodeId)) {
        visited.add(nodeId);
        queue.push({
          ...node,
          depth: current.depth + 1,
          foundBy: "physical_neighbors"
        });
      }
    }
    for (const node of semanticNodes) {
      if (!visited.has(node.id)) {
        visited.add(node.id);
        queue.push({
          ...node,
          depth: current.depth + 1,
          similarity: node.similarity,
          foundBy: "semantic_neighbors"
        });
        collectedEdges.push({
          from_node_id: current.id,
          to_node_id: node.id,
          type: "semantic",
          weight: parseFloat(node.similarity || "0") || 0.5
        });
      }
    }
  }
  const groupedByDepth = result.reduce((acc, node) => {
    if (!acc.has(node.depth)) {
      acc.set(node.depth, []);
    }
    acc.get(node.depth).push(node);
    return acc;
  }, /* @__PURE__ */ new Map());
  const levels = await Promise.all(
    Array.from(groupedByDepth.entries()).map(async ([depth, levelData]) => ({
      depth,
      // ignore document nodes filter as we have already filtered them before. also we want more semantic neighbors for each level.
      ...await distillClusterNodesData(levelData, limit, true)
    }))
  );
  if (filters) {
    const itemFiledGetter = await getDefaultItemFiledGetter(
      levels.flatMap((level) => level.documentNodes?.map((node) => node.id) ?? []),
      filters,
      sorter
    );
    for (const level of levels) {
      if (level.documentNodes) {
        level.documentNodes = applyFiltersAndSorters(level.documentNodes, filters, sorter, limit, itemFiledGetter);
      }
    }
  }
  const visitedNodeIds = new Set(result.map((n) => n.id));
  const graphVisualizationNodes = result.map((node) => {
    let path3;
    try {
      const attrs = typeof node.attributes === "string" ? JSON.parse(node.attributes || "{}") : node.attributes;
      if (attrs && typeof attrs === "object" && typeof attrs.path === "string" && attrs.path.trim()) {
        path3 = attrs.path.trim();
      }
    } catch {
    }
    return {
      id: node.id,
      label: node.label || node.id,
      type: node.type,
      depth: node.depth,
      foundBy: node.foundBy,
      ...path3 ? { path: path3 } : {},
      ...node.attributes ? { attributes: typeof node.attributes === "string" ? (() => {
        try {
          return JSON.parse(node.attributes);
        } catch {
          return {};
        }
      })() : node.attributes } : {}
    };
  });
  const graphVisualizationEdges = collectedEdges.filter(
    (edge) => visitedNodeIds.has(edge.from_node_id) && visitedNodeIds.has(edge.to_node_id)
  );
  const data = {
    isTimeOut,
    start_note_path,
    hops,
    levels,
    graph: {
      nodes: graphVisualizationNodes,
      edges: graphVisualizationEdges
    }
  };
  return buildResponse(response_format, ToolTemplateId.GraphTraversal, data, { templateManager });
}

// src/service/tools/search-graph-inspector/find-path.ts
async function getIndexedDocumentById(id) {
  const results = await sqliteStoreManager.getIndexedDocumentRepo().getByIds([id]);
  return results.length > 0 ? results[0] : null;
}
async function getIndexedDocumentsByIds(ids) {
  const results = await sqliteStoreManager.getIndexedDocumentRepo().getByIds(ids);
  const map = /* @__PURE__ */ new Map();
  for (const meta2 of results) {
    map.set(meta2.id, meta2);
  }
  return map;
}
var EDGE_WEIGHTS = {
  physical: 1,
  semantic: 1.5,
  consecutiveSemantic: 2
  // Reduced from 3.0 to allow more semantic paths
};
var SIMILARITY_THRESHOLD = 0.5;
var SCORE_WEIGHTS = {
  physicalRatio: 0.35,
  freshness: 0.25,
  domainJumps: 0.2,
  uniqueness: 0.15,
  lengthPenalty: 0.05
};
var PATH_STRING_SEPARATOR = " -> ";
async function findPath(params, templateManager) {
  const { start_note_path, end_note_path, limit, include_semantic_paths, response_format, filters } = params;
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const [startIndexedDoc, endIndexedDoc] = await Promise.all([
    sqliteStoreManager.getIndexedDocumentRepo().getByPath(start_note_path),
    sqliteStoreManager.getIndexedDocumentRepo().getByPath(end_note_path)
  ]);
  if (!startIndexedDoc || !endIndexedDoc) {
    return `# Path Finding Failed

${!startIndexedDoc ? `Start note "${start_note_path}" not found.` : ""}${!endIndexedDoc ? `End note "${end_note_path}" not found.` : ""}`;
  }
  const [startNode, endNode] = await Promise.all([
    mobiusNodeRepo.getById(startIndexedDoc.id),
    mobiusNodeRepo.getById(endIndexedDoc.id)
  ]);
  if (!startNode || !endNode) {
    return `# Path Finding Failed

${!startNode ? `Start node "${start_note_path}" not found in graph.` : ""}${!endNode ? `End node "${end_note_path}" not found in graph.` : ""}`;
  }
  const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
  const [startVector, endVector] = await Promise.all([
    embeddingRepo.getEmbeddingForSemanticSearch(startNode.id),
    embeddingRepo.getEmbeddingForSemanticSearch(endNode.id)
  ]);
  const context = {
    startId: startNode.id,
    endId: endNode.id,
    startVector,
    endVector,
    maxHops: PATH_FINDING_CONSTANTS.MAX_HOPS_LIMIT,
    filters,
    forbiddenEdges: /* @__PURE__ */ new Set(),
    includeSemantic: include_semantic_paths ?? false,
    excludedDocIds: /* @__PURE__ */ new Set()
  };
  const timeoutResult = await withTimeoutMessage(
    executeMultiStrategySearch(context, limit ?? 5),
    GRAPH_INSPECT_STEP_TIME_LIMIT,
    `Path finding from "${start_note_path}" to "${end_note_path}"`
  );
  if (!timeoutResult.success) {
    return `# Path Finding Timeout

**${timeoutResult.message}**

Try these solutions:
- Reduce search complexity by using notes with fewer connections
- Disable semantic path finding if enabled
- Choose different start/end notes with clearer relationships
- The search may be exploring too many possible paths`;
  }
  const { scoredPaths, hubAnalysis, contextIntersection } = timeoutResult.data;
  if (hubAnalysis.length > 0) {
    const hubNodeIds = hubAnalysis.map((h) => h.nodeId);
    const hubNodesMap = await mobiusNodeRepo.getByIds(hubNodeIds);
    for (const hub of hubAnalysis) {
      const node = hubNodesMap.get(hub.nodeId);
      if (node && isIndexedNoteNodeType(node.type)) {
        try {
          hub.label = JSON.parse(node.attributes).path || hub.nodeId;
        } catch {
          hub.label = hub.nodeId;
        }
      } else {
        hub.label = node ? node.type + node.label : hub.nodeId;
      }
    }
  }
  const formattedPaths = await formatPathsForOutput(scoredPaths, mobiusNodeRepo);
  const templatePaths = formattedPaths.slice(0, limit).map((pathData, index) => {
    const originalPath = scoredPaths[index];
    return {
      index: index + 1,
      steps: pathData.path.length - 1,
      pathString: pathData.path.map((node) => `[[${node}]]`).join(PATH_STRING_SEPARATOR),
      connectionDetails: pathData.connectionDetails,
      strategy: pathData.strategy,
      insightLabel: pathData.insightLabel,
      score: pathData.score.toFixed(1),
      reasoning: originalPath?.reasoning || "Selected for optimal quality metrics."
    };
  });
  const analysisSection = buildAnalysisSection(hubAnalysis, contextIntersection);
  const data = {
    start_note_path,
    end_note_path,
    paths: templatePaths,
    analysis: analysisSection
  };
  return buildResponse(response_format, ToolTemplateId.GraphPathFinding, data, { templateManager });
}
async function executeMultiStrategySearch(context, maxResults) {
  const allPaths = [];
  console.debug("[findPath] Phase 1: Reliable Strategy");
  const reliablePaths = await reliableStrategy(context);
  console.debug("[findPath] reliablePaths found:", reliablePaths.length);
  allPaths.push(...reliablePaths);
  if (context.includeSemantic && context.startVector && context.endVector) {
    console.debug("[findPath] Phase 2: FastTrack Strategy");
    const fastTrackPaths = await fastTrackStrategy(context);
    console.debug("[findPath] fastTrackPaths found:", fastTrackPaths.length);
    allPaths.push(...fastTrackPaths);
  }
  if (context.includeSemantic) {
    console.debug("[findPath] Phase 3: Brainstorm Strategy");
    const brainstormPaths = await brainstormStrategy(context);
    console.debug("[findPath] brainstormPaths found:", brainstormPaths.length);
    allPaths.push(...brainstormPaths);
  }
  console.debug("[findPath] Phase 4: Temporal Strategy");
  const temporalStartTime = Date.now();
  const temporalPaths = await temporalStrategy(context);
  const temporalDuration = Date.now() - temporalStartTime;
  console.debug("[findPath] temporalPaths found:", temporalPaths.length, "in", temporalDuration, "ms");
  allPaths.push(...temporalPaths);
  if (allPaths.length === 0) {
    console.debug("[findPath] No paths found, attempting fallback strategy");
    const fallbackPaths = await fallbackStrategy(context);
    console.debug("[findPath] fallbackPaths found:", fallbackPaths.length);
    allPaths.push(...fallbackPaths);
  }
  const uniquePaths = deduplicatePaths(allPaths);
  const scoredPaths = await scorePaths(uniquePaths, allPaths);
  for (const path3 of scoredPaths) {
    path3.reasoning = generatePathReasoning(path3);
  }
  scoredPaths.sort((a, b) => b.score.totalScore - a.score.totalScore);
  const diversePaths = ensureStrategyDiversity(scoredPaths, maxResults);
  const hubAnalysis = analyzeHubs(diversePaths);
  const contextIntersection = await analyzeContextIntersection(context.startId, context.endId);
  return { scoredPaths: diversePaths, hubAnalysis, contextIntersection };
}
async function reliableStrategy(context) {
  const paths = [];
  const forbiddenEdges = /* @__PURE__ */ new Set();
  for (let i = 0; i < 3; i++) {
    const path3 = await bidirectionalBFS(
      context.startId,
      context.endId,
      forbiddenEdges,
      false,
      // Physical only
      context.maxHops,
      context.filters,
      context.excludedDocIds
    );
    if (!path3) break;
    paths.push({
      segments: path3,
      strategy: "reliable",
      score: createEmptyScore(),
      insightLabel: "This is the most direct logical chain in your knowledge base.",
      reasoning: "Pure physical connections provide the most reliable and trustworthy path."
    });
    const edgeToBlock = identifyKeyEdge(path3);
    if (edgeToBlock) {
      forbiddenEdges.add(edgeToBlock);
    } else {
      break;
    }
  }
  return paths;
}
async function fastTrackStrategy(context) {
  if (!context.startVector || !context.endVector) {
    return [];
  }
  const paths = [];
  const path3 = await aStarSearch(context);
  if (path3) {
    paths.push({
      segments: path3,
      strategy: "fastTrack",
      score: createEmptyScore(),
      insightLabel: "Through semantic bridging, these two ideas share a common conceptual core.",
      reasoning: "A* algorithm found optimal balance between path length and semantic relevance."
    });
  }
  return paths;
}
async function aStarSearch(context) {
  const { startId, endId, startVector, endVector, maxHops, filters } = context;
  if (!startVector || !endVector) return null;
  const openSet = [];
  const closedSet = /* @__PURE__ */ new Set();
  const nodeMap = /* @__PURE__ */ new Map();
  const startNode = {
    nodeId: startId,
    gCost: 0,
    hCost: await calculateHeuristic(startId, endVector, 0, maxHops),
    fCost: 0,
    parent: null,
    connectionType: "physical_neighbors"
  };
  startNode.fCost = startNode.gCost + startNode.hCost;
  openSet.push(startNode);
  nodeMap.set(startId, startNode);
  let step = 0;
  let consecutiveSemanticCount = 0;
  while (openSet.length > 0 && step < maxHops * 50) {
    step++;
    openSet.sort((a, b) => a.fCost - b.fCost);
    const current = openSet.shift();
    if (current.nodeId === endId) {
      return reconstructAStarPath(current);
    }
    closedSet.add(current.nodeId);
    if (current.connectionType === "semantic_neighbors") {
      consecutiveSemanticCount++;
    } else {
      consecutiveSemanticCount = 0;
    }
    const neighbors = await getSmartNeighbors(
      current.nodeId,
      true,
      // Include semantic
      consecutiveSemanticCount >= 4,
      // More permissive than default 3
      context.excludedDocIds
    );
    let filteredNeighbors = neighbors;
    if (filters) {
      const itemFieldGetter = await getDefaultItemFiledGetter(
        neighbors.map((n) => n.id),
        filters
      );
      filteredNeighbors = applyFiltersAndSorters(neighbors, filters, void 0, void 0, itemFieldGetter);
    }
    for (const neighbor of filteredNeighbors) {
      if (closedSet.has(neighbor.id)) continue;
      const edgeWeight = neighbor.foundBy === "physical_neighbors" ? EDGE_WEIGHTS.physical : consecutiveSemanticCount >= 1 ? EDGE_WEIGHTS.consecutiveSemantic : EDGE_WEIGHTS.semantic;
      if (neighbor.foundBy === "semantic_neighbors" && neighbor.similarity) {
        const sim = parseFloat(neighbor.similarity) / 100;
        if (sim < SIMILARITY_THRESHOLD) continue;
      }
      const tentativeGCost = current.gCost + edgeWeight;
      let existingNode = nodeMap.get(neighbor.id);
      if (!existingNode) {
        const progress = step / (maxHops * 2);
        const hCost = await calculateHeuristic(neighbor.id, endVector, progress, maxHops);
        const allowSemantic = consecutiveSemanticCount < 4;
        const newNode = {
          nodeId: neighbor.id,
          gCost: tentativeGCost,
          hCost,
          fCost: tentativeGCost + hCost,
          parent: current,
          connectionType: neighbor.foundBy,
          similarity: neighbor.similarity
        };
        openSet.push(newNode);
        nodeMap.set(neighbor.id, newNode);
      } else if (tentativeGCost < existingNode.gCost) {
        existingNode.gCost = tentativeGCost;
        existingNode.fCost = tentativeGCost + existingNode.hCost;
        existingNode.parent = current;
        existingNode.connectionType = neighbor.foundBy;
        existingNode.similarity = neighbor.similarity;
      }
    }
  }
  return null;
}
async function calculateHeuristic(nodeId, endVector, progress, maxHops) {
  const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
  const nodeVector = await embeddingRepo.getEmbeddingForSemanticSearch(nodeId);
  if (!nodeVector) {
    return 2;
  }
  const similarity = cosineSimilarity(nodeVector, endVector);
  const distance = Math.max(0, 1 - similarity);
  return distance * 1;
}
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
function reconstructAStarPath(endNode) {
  const path3 = [];
  let current = endNode;
  while (current) {
    path3.unshift({
      nodeId: current.nodeId,
      type: current.connectionType,
      similarity: current.similarity
    });
    current = current.parent;
  }
  return path3;
}
async function fallbackStrategy(context) {
  const paths = [];
  const path3 = await bidirectionalBFS(
    context.startId,
    context.endId,
    /* @__PURE__ */ new Set(),
    // No forbidden edges
    true,
    // Always include semantic
    Math.max(context.maxHops * 2, 8),
    // Double hop limit, minimum 8
    context.filters,
    context.excludedDocIds
  );
  if (path3) {
    paths.push({
      segments: path3,
      strategy: "fastTrack",
      // Label as fastTrack for UI consistency
      score: createEmptyScore(),
      insightLabel: "Found through extended search - this connection exists but may be indirect.",
      reasoning: "Fallback search found this path after other strategies failed. Consider it as a distant connection."
    });
  }
  return paths;
}
async function brainstormStrategy(context) {
  const paths = [];
  const brainstormForbiddenEdges = /* @__PURE__ */ new Set();
  const [startMeta, endMeta] = await Promise.all([
    getIndexedDocumentById(context.startId),
    getIndexedDocumentById(context.endId)
  ]);
  if (!startMeta || !endMeta) return paths;
  const startFolder = getParentFolder(startMeta.path);
  const endFolder = getParentFolder(endMeta.path);
  for (let i = 0; i < 3; i++) {
    const forceCrossDomain = startFolder === endFolder || i === 0;
    const path3 = await bidirectionalBFSWithDomainPreference(
      context.startId,
      context.endId,
      brainstormForbiddenEdges,
      context.includeSemantic,
      context.maxHops,
      context.filters,
      forceCrossDomain ? endFolder : null,
      context.excludedDocIds
    );
    if (!path3) break;
    const nodeIds = path3.map((s) => s.nodeId);
    const metasMap = await getIndexedDocumentsByIds(nodeIds);
    const domains = /* @__PURE__ */ new Set();
    let semanticConnections = 0;
    let totalSimilarity = 0;
    for (const segment of path3) {
      const meta2 = metasMap.get(segment.nodeId);
      if (meta2) {
        domains.add(getParentFolder(meta2.path));
      }
      if (segment.type === "semantic_neighbors") {
        semanticConnections++;
        if (segment.similarity) {
          const sim = parseFloat(segment.similarity) / 100;
          totalSimilarity += sim;
        }
      }
    }
    const avgSimilarity = semanticConnections > 0 ? totalSimilarity / semanticConnections : 0;
    const shouldAccept = domains.size > 1 || semanticConnections > 0 && avgSimilarity > 0.7;
    if (shouldAccept) {
      const domainCount = domains.size;
      let insightMessage = "";
      if (domainCount > 1) {
        insightMessage = `Crossing ${domainCount} different domains, this connection may spark unexpected inspiration.`;
      } else if (semanticConnections > 0) {
        insightMessage = `Through creative semantic connections (avg ${Math.round(avgSimilarity * 100)}% similarity), these ideas form an unexpected bridge.`;
      } else {
        insightMessage = `This path reveals hidden connections through creative exploration.`;
      }
      paths.push({
        segments: path3,
        strategy: "brainstorm",
        score: createEmptyScore(),
        insightLabel: insightMessage,
        reasoning: "Selected for cross-domain exploration and creative connection discovery."
      });
      const edgeToBlock = identifyKeyEdge(path3);
      if (edgeToBlock) {
        brainstormForbiddenEdges.add(edgeToBlock);
      } else {
        break;
      }
    } else {
      const edgeToBlock = identifyKeyEdge(path3);
      if (edgeToBlock) {
        brainstormForbiddenEdges.add(edgeToBlock);
      } else {
        break;
      }
    }
  }
  return paths;
}
function getParentFolder(path3) {
  const lastSlash = path3.lastIndexOf("/");
  return lastSlash > 0 ? path3.substring(0, lastSlash) : "/";
}
async function bidirectionalBFSWithDomainPreference(startId, endId, forbiddenEdges, includeSemantic, maxHops, filters, avoidFolder, excludedDocIds) {
  const startVisited = /* @__PURE__ */ new Map();
  const endVisited = /* @__PURE__ */ new Map();
  startVisited.set(startId, { parentId: null, type: "physical_neighbors" });
  endVisited.set(endId, { parentId: null, type: "physical_neighbors" });
  let startQueue = [startId];
  let endQueue = [endId];
  let hops = 0;
  while (startQueue.length > 0 && endQueue.length > 0 && hops < maxHops) {
    const startResult = await expandFrontierWithDomainPreference(
      startQueue,
      startVisited,
      endVisited,
      forbiddenEdges,
      includeSemantic,
      filters,
      avoidFolder,
      excludedDocIds
    );
    if (startResult.found && startResult.intersectId) {
      return reconstructPath(startResult.intersectId, startVisited, endVisited);
    }
    const endResult = await expandFrontierWithDomainPreference(
      endQueue,
      endVisited,
      startVisited,
      forbiddenEdges,
      includeSemantic,
      filters,
      avoidFolder,
      excludedDocIds
    );
    if (endResult.found && endResult.intersectId) {
      return reconstructPath(endResult.intersectId, startVisited, endVisited);
    }
    hops++;
  }
  return null;
}
async function temporalStrategy(context) {
  const paths = [];
  const [startMeta, endMeta] = await Promise.all([
    getIndexedDocumentById(context.startId),
    getIndexedDocumentById(context.endId)
  ]);
  if (!startMeta || !endMeta) return paths;
  const startTime = startMeta.mtime ?? startMeta.ctime ?? Date.now();
  const endTime = endMeta.mtime ?? endMeta.ctime ?? Date.now();
  const isForward = startTime <= endTime;
  const path3 = await temporalBFS(
    context.startId,
    context.endId,
    Math.max(context.maxHops * 1.5, context.maxHops + 2),
    // Increase hop limit for temporal
    isForward,
    context.filters,
    context.excludedDocIds
  );
  if (path3 && path3.length > 0) {
    const startDate = new Date(startTime).toLocaleDateString();
    const endDate = new Date(endTime).toLocaleDateString();
    paths.push({
      segments: path3,
      strategy: "temporal",
      score: createEmptyScore(),
      insightLabel: `This is your thought evolution from ${startDate} to ${endDate}.`,
      reasoning: "Temporal ordering reveals your knowledge development trajectory."
    });
  }
  return paths;
}
async function temporalBFS(startId, endId, maxHops, isForward, filters, excludedDocIds) {
  const visited = /* @__PURE__ */ new Map();
  const [startMeta, endMeta] = await Promise.all([
    getIndexedDocumentById(startId),
    getIndexedDocumentById(endId)
  ]);
  if (!startMeta || !endMeta) return null;
  const startTimestamp = startMeta.mtime ?? startMeta.ctime ?? Date.now();
  const endTimestamp = endMeta.mtime ?? endMeta.ctime ?? Date.now();
  visited.set(startId, { parentId: null, type: "physical_neighbors", timestamp: startTimestamp });
  let queue = [{
    id: startId,
    timestamp: startTimestamp,
    heuristicScore: 0
  }];
  let hops = 0;
  const TIME_WINDOW_HOURS = 24 * 7;
  const startTime = Date.now();
  const TIMEOUT_MS = 3e3;
  while (queue.length > 0 && hops < maxHops) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      console.warn("[Temporal] Strategy timeout, returning partial results");
      break;
    }
    queue.sort((a, b) => a.heuristicScore - b.heuristicScore);
    const nextQueue = [];
    const currentLevelNodes = queue.slice(0, SLICE_CAPS.inspector.pathFindQueueLevel);
    queue = queue.slice(5);
    for (const current of currentLevelNodes) {
      let neighbors = await getPhysicalNeighbors(current.id, 10, excludedDocIds);
      if (neighbors.length < 3) {
        const physicalIds = new Set(neighbors.map((n) => n.id));
        if (excludedDocIds?.size) excludedDocIds.forEach((id) => physicalIds.add(id));
        const semanticNeighbors = await getSemanticNeighbors(current.id, 3, physicalIds);
        for (const s of semanticNeighbors) {
          if (excludedDocIds?.has(s.id)) continue;
          neighbors.push({ id: s.id, foundBy: "semantic_neighbors", similarity: s.similarity });
        }
      }
      let filteredNeighbors = neighbors;
      if (filters) {
        const itemFieldGetter = await getDefaultItemFiledGetter(
          neighbors.map((n) => n.id),
          filters
        );
        filteredNeighbors = applyFiltersAndSorters(neighbors, filters, void 0, void 0, itemFieldGetter);
      }
      const neighborIds = filteredNeighbors.map((n) => n.id);
      const neighborMetasMap = await getIndexedDocumentsByIds(neighborIds);
      const scoredNeighbors = filteredNeighbors.filter((neighbor) => {
        if (visited.has(neighbor.id)) return false;
        const neighborMeta = neighborMetasMap.get(neighbor.id);
        if (!neighborMeta) return false;
        const neighborTime = neighborMeta.mtime ?? neighborMeta.ctime ?? Date.now();
        const timeDiff = neighborTime - current.timestamp;
        const timeDiffHours = timeDiff / (1e3 * 60 * 60);
        const isValidTemporal = isForward ? timeDiffHours >= -TIME_WINDOW_HOURS : timeDiffHours <= TIME_WINDOW_HOURS;
        return isValidTemporal;
      }).map((neighbor) => {
        const neighborMeta = neighborMetasMap.get(neighbor.id);
        const neighborTime = neighborMeta.mtime ?? neighborMeta.ctime ?? Date.now();
        const temporalDistance = Math.abs(neighborTime - endTimestamp);
        const heuristicScore = temporalDistance / (1e3 * 60 * 60);
        return {
          neighbor,
          neighborTime,
          heuristicScore
        };
      }).sort((a, b) => a.heuristicScore - b.heuristicScore).slice(0, SLICE_CAPS.inspector.pathFindQueueLevel);
      for (const { neighbor, neighborTime, heuristicScore } of scoredNeighbors) {
        const connectionType = neighbor.foundBy === "physical_neighbors" ? "physical_neighbors" : "semantic_neighbors";
        visited.set(neighbor.id, {
          parentId: current.id,
          type: connectionType,
          timestamp: neighborTime
        });
        if (neighbor.id === endId) {
          return reconstructTemporalPath(endId, visited);
        }
        nextQueue.push({
          id: neighbor.id,
          timestamp: neighborTime,
          heuristicScore
        });
      }
    }
    queue = nextQueue;
    hops++;
  }
  return null;
}
function reconstructTemporalPath(endId, visited) {
  const path3 = [];
  let currentId = endId;
  while (currentId) {
    const info = visited.get(currentId);
    if (!info) break;
    path3.unshift({
      nodeId: currentId,
      type: info.type,
      timestamp: info.timestamp
    });
    currentId = info.parentId;
  }
  return path3;
}
async function bidirectionalBFS(startId, endId, forbiddenEdges, includeSemantic, maxHops, filters, excludedDocIds) {
  const startVisited = /* @__PURE__ */ new Map();
  const endVisited = /* @__PURE__ */ new Map();
  startVisited.set(startId, { parentId: null, type: "physical_neighbors" });
  endVisited.set(endId, { parentId: null, type: "physical_neighbors" });
  let startQueue = [startId];
  let endQueue = [endId];
  let hops = 0;
  while (startQueue.length > 0 && endQueue.length > 0 && hops < maxHops) {
    const startResult = await expandFrontier(
      startQueue,
      startVisited,
      endVisited,
      forbiddenEdges,
      includeSemantic,
      filters,
      excludedDocIds
    );
    if (startResult.found && startResult.intersectId) {
      return reconstructPath(startResult.intersectId, startVisited, endVisited);
    }
    const endResult = await expandFrontier(
      endQueue,
      endVisited,
      startVisited,
      forbiddenEdges,
      includeSemantic,
      filters,
      excludedDocIds
    );
    if (endResult.found && endResult.intersectId) {
      return reconstructPath(endResult.intersectId, startVisited, endVisited);
    }
    hops++;
  }
  return null;
}
async function expandFrontier(queue, myVisited, otherVisited, forbiddenEdges, includeSemantic, filters, excludedDocIds) {
  const nextQueue = [];
  for (const currentId of queue) {
    let neighbors = includeSemantic ? await getMixedNeighbors(currentId, true, 20, excludedDocIds) : await getPhysicalNeighbors(currentId, 20, excludedDocIds);
    if (filters) {
      const itemFieldGetter = await getDefaultItemFiledGetter(
        neighbors.map((n) => n.id),
        filters
      );
      neighbors = applyFiltersAndSorters(neighbors, filters, void 0, void 0, itemFieldGetter);
    }
    for (const neighbor of neighbors) {
      const edgeKey = `${currentId}->${neighbor.id}`;
      if (forbiddenEdges.has(edgeKey)) continue;
      if (!myVisited.has(neighbor.id)) {
        myVisited.set(neighbor.id, {
          parentId: currentId,
          type: neighbor.foundBy,
          similarity: neighbor.similarity
        });
        nextQueue.push(neighbor.id);
        if (otherVisited.has(neighbor.id)) {
          return { found: true, intersectId: neighbor.id };
        }
      }
    }
  }
  queue.length = 0;
  queue.push(...nextQueue);
  return { found: false };
}
async function expandFrontierWithDomainPreference(queue, myVisited, otherVisited, forbiddenEdges, includeSemantic, filters, avoidFolder, excludedDocIds) {
  const nextQueue = [];
  for (const currentId of queue) {
    let neighbors = includeSemantic ? await getMixedNeighbors(currentId, true, 20, excludedDocIds) : await getPhysicalNeighbors(currentId, 20, excludedDocIds);
    if (avoidFolder) {
      const neighborIds = neighbors.map((n) => n.id);
      const metasMap = await getIndexedDocumentsByIds(neighborIds);
      const neighborsWithMeta = neighbors.map((n) => {
        const meta2 = metasMap.get(n.id);
        return { ...n, folder: meta2 ? getParentFolder(meta2.path) : "" };
      });
      neighborsWithMeta.sort((a, b) => {
        const aInAvoid = a.folder === avoidFolder ? 1 : 0;
        const bInAvoid = b.folder === avoidFolder ? 1 : 0;
        return aInAvoid - bInAvoid;
      });
      neighbors = neighborsWithMeta;
    }
    if (filters) {
      const itemFieldGetter = await getDefaultItemFiledGetter(
        neighbors.map((n) => n.id),
        filters
      );
      neighbors = applyFiltersAndSorters(neighbors, filters, void 0, void 0, itemFieldGetter);
    }
    for (const neighbor of neighbors) {
      const edgeKey = `${currentId}->${neighbor.id}`;
      if (forbiddenEdges.has(edgeKey)) continue;
      if (!myVisited.has(neighbor.id)) {
        myVisited.set(neighbor.id, {
          parentId: currentId,
          type: neighbor.foundBy,
          similarity: neighbor.similarity
        });
        nextQueue.push(neighbor.id);
        if (otherVisited.has(neighbor.id)) {
          return { found: true, intersectId: neighbor.id };
        }
      }
    }
  }
  queue.length = 0;
  queue.push(...nextQueue);
  return { found: false };
}
async function getPhysicalNeighbors(nodeId, limit = 20, excludedDocIds) {
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const neighbors = [];
  const physicalEdges = await mobiusEdgeRepo.getAllEdgesForNode(nodeId, limit);
  const seenIds = /* @__PURE__ */ new Set();
  for (const edge of physicalEdges) {
    const neighborId = edge.from_node_id === nodeId ? edge.to_node_id : edge.from_node_id;
    if (excludedDocIds?.has(neighborId)) continue;
    if (!seenIds.has(neighborId)) {
      seenIds.add(neighborId);
      neighbors.push({ id: neighborId, foundBy: "physical_neighbors" });
    }
  }
  return neighbors;
}
async function getMixedNeighbors(nodeId, includeSemantic, limit = 20, excludedDocIds) {
  const neighbors = [];
  const physicalNeighbors = await getPhysicalNeighbors(nodeId, limit, excludedDocIds);
  neighbors.push(...physicalNeighbors);
  const physicalIds = new Set(physicalNeighbors.map((n) => n.id));
  if (excludedDocIds) excludedDocIds.forEach((id) => physicalIds.add(id));
  if (includeSemantic) {
    const semanticNeighbors = await getSemanticNeighbors(
      nodeId,
      Math.max(5, limit - neighbors.length),
      physicalIds
    );
    for (const neighbor of semanticNeighbors) {
      if (excludedDocIds?.has(neighbor.id)) continue;
      neighbors.push({
        id: neighbor.id,
        foundBy: "semantic_neighbors",
        similarity: neighbor.similarity
      });
    }
  }
  return neighbors;
}
async function getSmartNeighbors(nodeId, includeSemantic, throttleSemantic, excludedDocIds) {
  const neighbors = [];
  const physicalNeighbors = await getPhysicalNeighbors(nodeId, 20, excludedDocIds);
  neighbors.push(...physicalNeighbors);
  if (includeSemantic && !throttleSemantic && physicalNeighbors.length < 3) {
    const physicalIds = new Set(physicalNeighbors.map((n) => n.id));
    if (excludedDocIds) excludedDocIds.forEach((id) => physicalIds.add(id));
    const semanticNeighbors = await getSemanticNeighbors(nodeId, 15, physicalIds);
    for (const neighbor of semanticNeighbors) {
      if (excludedDocIds?.has(neighbor.id)) continue;
      neighbors.push({
        id: neighbor.id,
        foundBy: "semantic_neighbors",
        similarity: neighbor.similarity
      });
    }
  }
  return neighbors;
}
function reconstructPath(intersectId, startVisited, endVisited) {
  const path3 = [];
  let currentId = intersectId;
  const startPath = [];
  while (currentId) {
    const info = startVisited.get(currentId);
    if (!info) break;
    startPath.unshift({
      nodeId: currentId,
      type: info.type,
      similarity: info.similarity
    });
    currentId = info.parentId;
  }
  currentId = intersectId;
  const endPath = [];
  while (currentId) {
    const info = endVisited.get(currentId);
    if (!info) break;
    endPath.push({
      nodeId: currentId,
      type: info.type,
      similarity: info.similarity
    });
    currentId = info.parentId;
  }
  path3.push(...startPath);
  if (endPath.length > 1) {
    path3.push(...endPath.slice(1));
  }
  return path3;
}
function createEmptyScore() {
  return {
    totalScore: 0,
    physicalRatio: 0,
    avgSimilarity: 0,
    uniqueness: 1,
    freshness: 0,
    domainJumps: 0,
    length: 0
  };
}
async function scorePaths(paths, allPaths) {
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  for (const path3 of paths) {
    const segments = path3.segments;
    const length = segments.length - 1;
    const physicalCount = segments.filter((s) => s.type === "physical_neighbors").length;
    const physicalRatio = length > 0 ? (physicalCount - 1) / length : 1;
    const semanticSegments = segments.filter((s) => s.type === "semantic_neighbors" && s.similarity);
    const avgSimilarity = semanticSegments.length > 0 ? semanticSegments.reduce((sum, s) => sum + parseFloat(s.similarity) / 100, 0) / semanticSegments.length : 0;
    const uniqueness = calculateUniqueness(segments, allPaths);
    let freshnessSum = 0;
    const nodeIds = segments.map((s) => s.nodeId);
    const statsMap = await mobiusNodeRepo.getByDocIds(nodeIds);
    const now = Date.now();
    const oneMonthMs = 30 * 24 * 60 * 60 * 1e3;
    for (const nodeId of nodeIds) {
      const stats = statsMap.get(nodeId);
      if (stats?.last_open_ts) {
        const age = now - stats.last_open_ts;
        freshnessSum += Math.max(0, 1 - age / oneMonthMs);
      } else {
        freshnessSum += 0.5;
      }
    }
    const freshness = nodeIds.length > 0 ? freshnessSum / nodeIds.length : 0;
    const domainJumps = await countDomainJumps(segments);
    const totalScore = physicalRatio * SCORE_WEIGHTS.physicalRatio * 100 + freshness * SCORE_WEIGHTS.freshness * 100 + Math.min(domainJumps, 3) / 3 * SCORE_WEIGHTS.domainJumps * 100 + uniqueness * SCORE_WEIGHTS.uniqueness * 100 - length * SCORE_WEIGHTS.lengthPenalty * 10;
    path3.score = {
      totalScore,
      physicalRatio,
      avgSimilarity,
      uniqueness,
      freshness,
      domainJumps,
      length
    };
  }
  return paths;
}
function generatePathReasoning(path3) {
  const score = path3.score;
  const reasons = [];
  if (score.physicalRatio > 0.8) {
    reasons.push("High physical connectivity ensures reliability");
  } else if (score.physicalRatio > 0.5) {
    reasons.push("Balanced physical and semantic connections");
  } else {
    reasons.push("Creative semantic bridging for discovery");
  }
  if (score.freshness > 0.7) {
    reasons.push("Includes recently accessed knowledge");
  }
  if (score.domainJumps > 0) {
    reasons.push(`Crosses ${score.domainJumps} knowledge domains`);
  }
  if (score.uniqueness > 0.8) {
    reasons.push("Unique path not overlapping with others");
  }
  if (score.length <= 3) {
    reasons.push("Direct and concise connection");
  }
  return reasons.length > 0 ? reasons.join(". ") + "." : "Selected for balanced quality metrics.";
}
function calculateUniqueness(segments, allPaths) {
  const myNodes = new Set(segments.map((s) => s.nodeId));
  let maxOverlap = 0;
  for (const other of allPaths) {
    if (other.segments === segments) continue;
    const otherNodes = new Set(other.segments.map((s) => s.nodeId));
    let overlap = 0;
    for (const node of myNodes) {
      if (otherNodes.has(node)) overlap++;
    }
    const overlapRatio = overlap / Math.max(myNodes.size, otherNodes.size);
    maxOverlap = Math.max(maxOverlap, overlapRatio);
  }
  return 1 - maxOverlap;
}
async function countDomainJumps(segments) {
  const nodeIds = segments.map((s) => s.nodeId);
  const metasMap = await getIndexedDocumentsByIds(nodeIds);
  let jumps = 0;
  let prevFolder = null;
  for (const segment of segments) {
    const meta2 = metasMap.get(segment.nodeId);
    if (!meta2) continue;
    const folder = getParentFolder(meta2.path);
    if (prevFolder !== null && folder !== prevFolder) {
      jumps++;
    }
    prevFolder = folder;
  }
  return jumps;
}
function identifyKeyEdge(path3) {
  if (path3.length < 2) return "";
  const parseSimilarity = (similarity) => {
    if (!similarity) return 0;
    const parsed = parseFloat(similarity.replace("%", ""));
    return isNaN(parsed) ? 0 : parsed;
  };
  let bestEdge = "";
  let bestScore = -1;
  for (let i = 0; i < path3.length - 1; i++) {
    const current = path3[i];
    const next = path3[i + 1];
    let score = 0;
    if (current.type === "physical_neighbors" && next.type === "physical_neighbors") {
      score = 100 + Math.max(parseSimilarity(current.similarity), parseSimilarity(next.similarity));
    } else if (current.type === "semantic_neighbors" && next.type === "semantic_neighbors") {
      score = Math.max(parseSimilarity(current.similarity), parseSimilarity(next.similarity));
    } else {
      score = 50 + Math.max(parseSimilarity(current.similarity), parseSimilarity(next.similarity)) * 0.5;
    }
    if (score > bestScore) {
      bestScore = score;
      bestEdge = `${current.nodeId}->${next.nodeId}`;
    }
  }
  return bestEdge;
}
function deduplicatePaths(paths) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const path3 of paths) {
    const key = path3.segments.map((s) => s.nodeId).join("->");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(path3);
    }
  }
  return unique;
}
function ensureStrategyDiversity(paths, maxResults) {
  const byStrategy = {
    reliable: [],
    fastTrack: [],
    brainstorm: [],
    temporal: []
  };
  for (const path3 of paths) {
    byStrategy[path3.strategy].push(path3);
  }
  const result = [];
  const strategies = ["reliable", "fastTrack", "brainstorm", "temporal"];
  for (const strategy of strategies) {
    if (byStrategy[strategy].length > 0 && result.length < maxResults) {
      result.push(byStrategy[strategy].shift());
    }
  }
  const remaining = paths.filter((p) => !result.includes(p));
  remaining.sort((a, b) => b.score.totalScore - a.score.totalScore);
  for (const path3 of remaining) {
    if (result.length >= maxResults) break;
    result.push(path3);
  }
  return result;
}
function analyzeHubs(paths) {
  const nodeCount = /* @__PURE__ */ new Map();
  for (const path3 of paths) {
    for (let i = 1; i < path3.segments.length - 1; i++) {
      const nodeId = path3.segments[i].nodeId;
      nodeCount.set(nodeId, (nodeCount.get(nodeId) || 0) + 1);
    }
  }
  const hubs = [];
  for (const [nodeId, count] of nodeCount) {
    if (count >= 2) {
      hubs.push({
        nodeId,
        label: nodeId,
        // Will be replaced with actual label in formatting
        occurrenceCount: count,
        betweennessCentrality: count / paths.length
      });
    }
  }
  return hubs.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}
async function analyzeContextIntersection(startId, endId) {
  const [startMeta, endMeta] = await Promise.all([
    getIndexedDocumentById(startId),
    getIndexedDocumentById(endId)
  ]);
  if (!startMeta || !endMeta) return null;
  const physicalAncestor = analyzePhysicalAncestor(startMeta.path, endMeta.path);
  const commonTags = analyzeTagIntersection(startMeta.tags, endMeta.tags);
  const commonParents = await analyzeCommonParents(startId, endId);
  const isDistant = physicalAncestor.depth <= 1 && (commonTags.length > 0 || commonParents.length > 0);
  let primaryContext;
  if (commonTags.length > 0) {
    primaryContext = commonTags[0];
  } else if (commonParents.length > 0) {
    primaryContext = commonParents[0].label;
  }
  console.debug("[ContextAnalysis]", {
    startPath: startMeta.path,
    endPath: endMeta.path,
    startTags: startMeta.tags,
    endTags: endMeta.tags,
    commonTags: commonTags.length,
    commonParents: commonParents.length,
    physicalDepth: physicalAncestor.depth,
    isDistant,
    primaryContext
  });
  return {
    physicalAncestor,
    commonTags,
    commonParents,
    isDistant,
    primaryContext
  };
}
function analyzePhysicalAncestor(startPath, endPath) {
  const startParts = startPath.split("/");
  const endParts = endPath.split("/");
  let commonParts = [];
  for (let i = 0; i < Math.min(startParts.length, endParts.length); i++) {
    if (startParts[i] === endParts[i]) {
      commonParts.push(startParts[i]);
    } else {
      break;
    }
  }
  const ancestorPath = commonParts.length > 0 ? commonParts.join("/") : "/";
  return {
    ancestorPath,
    startPath,
    endPath,
    depth: commonParts.length
  };
}
function analyzeTagIntersection(startTags, endTags) {
  if (!startTags || !endTags) return [];
  let startTagArray = [];
  let endTagArray = [];
  try {
    const parsedStart = JSON.parse(startTags);
    const parsedEnd = JSON.parse(endTags);
    startTagArray = Array.isArray(parsedStart) ? parsedStart : [];
    endTagArray = Array.isArray(parsedEnd) ? parsedEnd : [];
  } catch {
    startTagArray = startTags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
    endTagArray = endTags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }
  const commonTags = startTagArray.filter((tag) => endTagArray.includes(tag));
  return commonTags;
}
async function analyzeCommonParents(startId, endId) {
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const [startEdges, endEdges] = await Promise.all([
    mobiusEdgeRepo.getAllEdgesForNode(startId, 50),
    mobiusEdgeRepo.getAllEdgesForNode(endId, 50)
  ]);
  const startReferrerIds = new Set(
    startEdges.filter((edge) => edge.to_node_id === startId && edge.from_node_id !== endId).map((edge) => edge.from_node_id)
  );
  const endReferrerIds = new Set(
    endEdges.filter((edge) => edge.to_node_id === endId && edge.from_node_id !== startId).map((edge) => edge.from_node_id)
  );
  const commonParentIds = Array.from(startReferrerIds).filter((id) => endReferrerIds.has(id));
  if (commonParentIds.length === 0) return [];
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const parentNodes = await mobiusNodeRepo.getByIds(commonParentIds);
  const result = commonParentIds.map((parentId) => {
    const node = parentNodes.get(parentId);
    if (!node) return null;
    const startConnections = startEdges.filter(
      (edge) => edge.from_node_id === parentId && edge.to_node_id === startId
    ).length;
    const endConnections = endEdges.filter(
      (edge) => edge.from_node_id === parentId && edge.to_node_id === endId
    ).length;
    const connectionCount = startConnections + endConnections;
    let label = node.label;
    if (isIndexedNoteNodeType(node.type)) {
      try {
        const attributes = JSON.parse(node.attributes);
        label = attributes.path || label;
      } catch {
      }
    }
    return {
      nodeId: parentId,
      label,
      type: node.type,
      connectionCount
    };
  }).filter(Boolean).sort((a, b) => (b?.connectionCount || 0) - (a?.connectionCount || 0));
  return result;
}
function buildAnalysisSection(hubs, contextIntersection) {
  let section = "";
  if (hubs.length > 0) {
    section += "\n\n## Knowledge Hubs\n\n";
    section += "These nodes appear in multiple paths, acting as central connectors:\n\n";
    for (const hub of hubs.slice(0, SLICE_CAPS.inspector.pathFindHubs)) {
      section += `- **[[${hub.label}]]** (appears in ${hub.occurrenceCount} paths)
`;
    }
  }
  if (contextIntersection) {
    const hasValuableContent = contextIntersection.commonTags.length > 0 || contextIntersection.commonParents.length > 0 || contextIntersection.physicalAncestor.depth > 1 || contextIntersection.isDistant;
    if (hasValuableContent) {
      section += "\n\n## Shared Context Analysis\n\n";
      const physical = contextIntersection.physicalAncestor;
      if (contextIntersection.commonTags.length > 0) {
        section += `**Common Tags:** ${contextIntersection.commonTags.map((tag) => `\`${tag}\``).join(", ")}

`;
      }
      if (contextIntersection.commonParents.length > 0) {
        section += "**Common Reference Points:**\n";
        for (const parent of contextIntersection.commonParents.slice(0, SLICE_CAPS.inspector.pathFindCommonParents)) {
          const nodeLink = isIndexedNoteNodeType(parent.type) ? `[[${parent.label}]]` : `**${parent.label}**`;
          section += `- ${nodeLink} (${parent.connectionCount} connections)
`;
        }
        section += "\n";
      }
      if (physical.depth > 1) {
        section += `**Shared Location:** Both notes are in \`${physical.ancestorPath}\`

`;
      }
      if (contextIntersection.isDistant) {
        section += "**Cross-Domain Insight:** Despite different locations, these notes share ";
        if (contextIntersection.primaryContext) {
          section += `**${contextIntersection.primaryContext}**`;
        } else {
          section += "semantic connections";
        }
        section += ".\n\n";
      }
    }
  }
  return section;
}
async function formatPathsForOutput(paths, mobiusNodeRepo) {
  const allNodeIds = /* @__PURE__ */ new Set();
  for (const scoredPath of paths) {
    for (const segment of scoredPath.segments) {
      allNodeIds.add(segment.nodeId);
    }
  }
  const nodesMap = await mobiusNodeRepo.getByIds(Array.from(allNodeIds));
  return paths.map((scoredPath) => {
    const nodeLabels = [];
    for (const segment of scoredPath.segments) {
      try {
        const node = nodesMap.get(segment.nodeId);
        if (!node) {
          nodeLabels.push(segment.nodeId);
        } else if (isIndexedNoteNodeType(node.type)) {
          nodeLabels.push(JSON.parse(node.attributes).path || segment.nodeId);
        } else {
          nodeLabels.push(node.type + node.label);
        }
      } catch {
        nodeLabels.push(segment.nodeId);
      }
    }
    const connectionDetails = scoredPath.segments.slice(0, -1).map((segment, i) => {
      const nextSegment = scoredPath.segments[i + 1];
      const type = segment.type === "physical_neighbors" && nextSegment.type === "physical_neighbors" ? "physical" : "semantic";
      const similarity = segment.similarity || nextSegment.similarity;
      return similarity ? `${type} (${similarity})` : type;
    }).join(" \u2192 ");
    const strategyNames = {
      reliable: "\u{1F517} Reliable",
      fastTrack: "\u{1F680} Fast Track",
      brainstorm: "\u{1F4A1} Brainstorm",
      temporal: "\u23F3 Temporal"
    };
    return {
      path: nodeLabels,
      connectionDetails,
      strategy: strategyNames[scoredPath.strategy],
      insightLabel: scoredPath.insightLabel,
      score: scoredPath.score.totalScore
    };
  });
}

// src/service/tools/search-graph-inspector/find-key-nodes.ts
async function getNodeCategoryConnections(nodeIds) {
  if (!nodeIds.length) return /* @__PURE__ */ new Map();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const categoryConnections = await mobiusEdgeRepo.getByFromNodesAndTypes(nodeIds, [...GRAPH_TAGGED_EDGE_TYPES]);
  const categoryCountMap = /* @__PURE__ */ new Map();
  for (const edge of categoryConnections) {
    const count = categoryCountMap.get(edge.from_node_id) || 0;
    categoryCountMap.set(edge.from_node_id, count + 1);
  }
  return categoryCountMap;
}
async function findKeyNodes(params, templateManager) {
  const { limit, semantic_filter, response_format, filters, sorter } = params;
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const { topByOutDegree: allOutDegreeStats, topByInDegree: allInDegreeStats } = await mobiusEdgeRepo.getTopNodeIdsByDegree(RRF_RANKING_POOL_SIZE);
  const semanticResults = await getSemanticSearchResults(
    semantic_filter,
    "limitIdsSet",
    {
      limitIdsSet: /* @__PURE__ */ new Set([
        ...allOutDegreeStats.map((stat) => stat.nodeId),
        ...allInDegreeStats.map((stat) => stat.nodeId)
      ])
    }
  );
  const sortedNodes = await calculateKeyNoteRRFScores(
    semanticResults,
    allOutDegreeStats,
    allInDegreeStats,
    !!semantic_filter,
    limit
  );
  const candidateNodeIds = sortedNodes.map((node) => node.nodeId);
  const { topByOutDegree: candidateOutDegrees, topByInDegree: candidateInDegrees } = await mobiusEdgeRepo.getTopNodeIdsByDegree(limit, candidateNodeIds);
  const nodeMap = await mobiusNodeRepo.getByIds(candidateNodeIds);
  const nodeMetadataMap = new Map(
    sortedNodes.map((node) => [node.nodeId, {
      nodeType: node.nodeType,
      uniqueCategories: node.uniqueCategories
    }])
  );
  let allKeyNodes = [];
  for (const stat of candidateOutDegrees) {
    const nodeInfo = nodeMap.get(stat.nodeId);
    const metadata = nodeMetadataMap.get(stat.nodeId) || { nodeType: "balanced", uniqueCategories: 0 };
    allKeyNodes.push({
      id: stat.nodeId,
      label: nodeInfo?.label || stat.nodeId,
      type: nodeInfo?.type || "unknown",
      degree: stat.outDegree,
      direction: "out",
      nodeType: metadata.nodeType,
      uniqueCategories: metadata.uniqueCategories
    });
  }
  for (const stat of candidateInDegrees) {
    const nodeInfo = nodeMap.get(stat.nodeId);
    const metadata = nodeMetadataMap.get(stat.nodeId) || { nodeType: "balanced", uniqueCategories: 0 };
    allKeyNodes.push({
      id: stat.nodeId,
      label: nodeInfo?.label || stat.nodeId,
      type: nodeInfo?.type || "unknown",
      degree: stat.inDegree,
      direction: "in",
      nodeType: metadata.nodeType,
      uniqueCategories: metadata.uniqueCategories
    });
  }
  if (filters) {
    const itemFiledGetter = await getDefaultItemFiledGetter(candidateNodeIds, filters, sorter);
    allKeyNodes = applyFiltersAndSorters(allKeyNodes, filters, sorter, void 0, itemFiledGetter);
  }
  const data = { key_nodes: allKeyNodes };
  return buildResponse(response_format, ToolTemplateId.FindKeyNodes, data, { templateManager });
}
async function calculateKeyNoteRRFScores(semanticResults, allOutDegreeStats, allInDegreeStats, semanticEnabled, candidateLimit) {
  const outDegreeRankMap = /* @__PURE__ */ new Map();
  const inDegreeRankMap = /* @__PURE__ */ new Map();
  const semanticRankMap = /* @__PURE__ */ new Map();
  allOutDegreeStats.forEach((stat, index) => {
    outDegreeRankMap.set(stat.nodeId, index + 1);
  });
  allInDegreeStats.forEach((stat, index) => {
    inDegreeRankMap.set(stat.nodeId, index + 1);
  });
  semanticResults.forEach((result, index) => {
    semanticRankMap.set(result.nodeId, index + 1);
  });
  const outDegreeMap = new Map(allOutDegreeStats.map((stat) => [stat.nodeId, stat.outDegree]));
  const inDegreeMap = new Map(allInDegreeStats.map((stat) => [stat.nodeId, stat.inDegree]));
  const allNodeIds = /* @__PURE__ */ new Set([
    ...allOutDegreeStats.map((stat) => stat.nodeId),
    ...allInDegreeStats.map((stat) => stat.nodeId)
  ]);
  const categoryConnections = await getNodeCategoryConnections(Array.from(allNodeIds));
  const nodeScores = /* @__PURE__ */ new Map();
  const degreeNodeIds = /* @__PURE__ */ new Set([
    ...allOutDegreeStats.map((stat) => stat.nodeId),
    ...allInDegreeStats.map((stat) => stat.nodeId)
  ]);
  for (const nodeId of allNodeIds) {
    const outDegree = outDegreeMap.get(nodeId) || 0;
    const inDegree = inDegreeMap.get(nodeId) || 0;
    const uniqueCategories = categoryConnections.get(nodeId) || 0;
    const outDegreeRank = outDegreeRankMap.get(nodeId) || Number.MAX_SAFE_INTEGER;
    const inDegreeRank = inDegreeRankMap.get(nodeId) || Number.MAX_SAFE_INTEGER;
    const semanticRank = semanticRankMap.get(nodeId) || Number.MAX_SAFE_INTEGER;
    const semanticContribution = semanticEnabled ? 1 / (KEY_NODES_RRF_K + semanticRank) : 0;
    const outContribution = 1 / (KEY_NODES_RRF_K + outDegreeRank);
    const inContribution = 1 / (KEY_NODES_RRF_K + inDegreeRank);
    const degreeContribution = Math.max(outContribution, inContribution);
    let nodeType;
    if (uniqueCategories >= 2) {
      nodeType = "bridge";
    } else if (outDegree > inDegree * 1.2 && outDegree > 3) {
      nodeType = "hub";
    } else if (inDegree > outDegree * 1.2 && inDegree > 3) {
      nodeType = "authority";
    } else {
      nodeType = "balanced";
    }
    const bridgeBonus = nodeType === "bridge" ? 0.1 : 0;
    const rrfScore = semanticContribution + degreeContribution + bridgeBonus;
    nodeScores.set(nodeId, {
      nodeId,
      outDegree,
      inDegree,
      semanticScore: semanticRank < Number.MAX_SAFE_INTEGER ? semanticContribution : 0,
      rrfScore,
      nodeType,
      uniqueCategories
    });
  }
  return Array.from(nodeScores.values()).sort((a, b) => b.rrfScore - a.rrfScore).slice(0, candidateLimit * 2);
}

// src/service/tools/search-graph-inspector/find-orphans.ts
async function findOrphanNotes(params, templateManager) {
  const { filters, sorter, limit, response_format } = params;
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const hardOrphanIds = await mobiusEdgeRepo.getHardOrphans(params.limit || 100);
  let filteredHardOrphans = [];
  if (hardOrphanIds.length > 0) {
    const hardOrphanNodeMap = await mobiusNodeRepo.getByIds(hardOrphanIds);
    const hardOrphanNodes = Array.from(hardOrphanNodeMap.values()).map((node) => ({
      ...node,
      orphanType: "hard"
    }));
    const itemFiledGetter2 = await getDefaultItemFiledGetter(hardOrphanIds, filters, sorter);
    filteredHardOrphans = applyFiltersAndSorters(hardOrphanNodes, filters, sorter, limit, itemFiledGetter2);
  }
  const cadidateAllOrphanNodes = [
    ...filteredHardOrphans
    /*...filteredSoftOrphans*/
  ];
  const itemFiledGetter = await getDefaultItemFiledGetter(cadidateAllOrphanNodes.map((node) => node.id), filters, sorter);
  const finalAllOrphanNodes = applyFiltersAndSorters(cadidateAllOrphanNodes, filters, sorter, limit, itemFiledGetter);
  const orphanRevivalSuggestions = await findRevivalSuggestions(finalAllOrphanNodes);
  const hardOrphans = finalAllOrphanNodes.map((orphan, i) => {
    const suggestion = orphanRevivalSuggestions.get(orphan.id);
    return {
      index: i + 1,
      modified: orphan.modified,
      label: orphan.label,
      revival_suggestion: suggestion ? {
        title: suggestion.suggestedNode.title,
        reason: suggestion.reason
      } : null
    };
  });
  const data = {
    total_count: cadidateAllOrphanNodes.length,
    filtered_count: finalAllOrphanNodes.length,
    hard_orphans: hardOrphans
  };
  return buildResponse(response_format, ToolTemplateId.OrphanNotes, data, { templateManager });
}
async function findRevivalSuggestions(orphans) {
  const suggestions = /* @__PURE__ */ new Map();
  const orphanIds = new Set(orphans.map((o) => o.id));
  for (const orphan of orphans) {
    if (!isIndexedNoteNodeType(orphan.type)) continue;
    try {
      const semanticNeighbors = await getSemanticNeighbors(orphan.id, 10, /* @__PURE__ */ new Set([orphan.id]));
      const closestNonOrphan = semanticNeighbors.filter((neighbor) => !orphanIds.has(neighbor.id)).sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))[0];
      if (closestNonOrphan) {
        suggestions.set(orphan.id, {
          suggestedNode: {
            path: closestNonOrphan.attributes ? JSON.parse(closestNonOrphan.attributes)?.path : closestNonOrphan.id,
            title: closestNonOrphan.label,
            similarity: parseFloat(closestNonOrphan.similarity)
          },
          reason: `High semantic similarity (${closestNonOrphan.similarity}) - suggests potential connection`
        });
      }
    } catch (error) {
      console.warn(`[findRevivalSuggestions] Failed to find suggestion for orphan ${orphan.id}:`, error);
    }
  }
  return suggestions;
}

// src/service/tools/search-graph-inspector/search-by-dimensions.ts
async function searchByDimensions(params, templateManager) {
  const { boolean_expression, semantic_filter, filters, sorter, limit, response_format } = params;
  const expr = typeof boolean_expression === "string" ? boolean_expression.trim() : "";
  if (!expr) {
    return "No search dimensions specified. Please specify a boolean_expression like 'tag:javascript AND functional:programming'.";
  }
  let parser;
  try {
    parser = new BooleanExpressionParser(expr);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Invalid boolean_expression: ${msg}. Use only tag:value, functional:value, AND, OR, NOT, and parentheses. Example: tag:javascript AND functional:programming. Attention. Only one word. do not use space. do not use special characters.`;
  }
  const { tags: expressionTags, functionals: expressionFunctionals, keywords: expressionKeywords } = parser.extractDimensions();
  if (expressionTags.length === 0 && expressionFunctionals.length === 0 && expressionKeywords.length === 0) {
    return "Boolean expression must contain at least one tag:functional: or keyword: filter.";
  }
  const { success: matchingDocumentsSuccess, message: matchingDocumentsMessage, data: matchingExpressionDocNodes } = await findByExpressionWhere(expressionTags, expressionFunctionals, expressionKeywords);
  if (!matchingDocumentsSuccess || !matchingExpressionDocNodes) {
    return matchingDocumentsMessage || "Error finding matching documents.";
  }
  let docsAlignToSemantic = matchingExpressionDocNodes;
  if (semantic_filter) {
    const semanticSearchResults = await getSemanticSearchResults(
      semantic_filter,
      "limitIdsSet",
      { limitIdsSet: new Set(Array.from(matchingExpressionDocNodes.values()).map((document) => document.id)) }
    );
    if (semanticSearchResults && semanticSearchResults.length > 0) {
      let semanticScoreMap = new Map(semanticSearchResults.map((res) => [res.nodeId, res.score]));
      docsAlignToSemantic = new Map(
        Array.from(matchingExpressionDocNodes.entries()).filter(([id]) => semanticScoreMap.has(id)).map(([id, docNode]) => {
          return [id, { ...docNode, score: semanticScoreMap.get(id) }];
        })
      );
    }
  }
  const itemFiledGetter = await getDefaultItemFiledGetter(
    Array.from(docsAlignToSemantic.keys()),
    filters,
    sorter
  );
  const filtered = applyFiltersAndSorters(
    Array.from(docsAlignToSemantic.values()),
    filters,
    sorter,
    limit || 20,
    itemFiledGetter
  );
  const data = {
    boolean_expression,
    items: filtered,
    total_found: matchingExpressionDocNodes.size,
    semantic_filtered_cnt: matchingExpressionDocNodes.size - docsAlignToSemantic.size,
    all_filtered_cnt: matchingExpressionDocNodes.size - filtered.length
  };
  return buildResponse(response_format, ToolTemplateId.SearchByDimensions, data, { templateManager });
}
async function findByExpressionWhere(expressionTags, expressionFunctionals, expressionKeywords) {
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const tagLookupMap = await mobiusNodeRepo.getByTypeAndLabels(GraphNodeType.TopicTag, expressionTags).then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));
  const functionalLookupMap = await mobiusNodeRepo.getByTypeAndLabels(GraphNodeType.FunctionalTag, expressionFunctionals).then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));
  const keywordLookupMap = await mobiusNodeRepo.getByTypeAndLabels(GraphNodeType.KeywordTag, expressionKeywords).then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));
  const allTargetNodeIds = [];
  tagLookupMap.forEach((id) => allTargetNodeIds.push(id));
  functionalLookupMap.forEach((id) => allTargetNodeIds.push(id));
  keywordLookupMap.forEach((id) => allTargetNodeIds.push(id));
  if (allTargetNodeIds.length === 0) {
    return { success: false, message: "No valid tag/functional/keyword nodes found for expression." };
  }
  const documentIds = await mobiusEdgeRepo.getSourceNodesConnectedToAllTargets(allTargetNodeIds);
  if (documentIds.length === 0) {
    return { success: false, message: "No documents found matching all criteria." };
  }
  return {
    success: true,
    data: await mobiusNodeRepo.getByIds(documentIds)
  };
}

// src/app/settings/types.ts
var import_obsidian3 = __toESM(require_obsidian_stub());

// src/service/search/index/helper/hub/types.ts
var SOURCE_PRIORITY = {
  manual: 4,
  folder: 3,
  document: 2,
  cluster: 1
};
var DEFAULT_HUB_DISCOVER_SETTINGS = {
  enableLlmJudge: false,
  maxJudgeCalls: 20,
  minCoverageGain: 0.04,
  maxRounds: 3,
  judgeGrayZoneMin: 0.32,
  judgeGrayZoneMax: 0.58
};

// src/app/settings/types.ts
var DEFAULT_CHUNKING_SETTINGS = {
  maxChunkSize: 1e3,
  chunkOverlap: 200,
  minDocumentSizeForChunking: 1500,
  skipCodeBlocksInChunking: false,
  codeBlockPlaceholder: "\n\n[code omitted]\n\n",
  maxCodeChunkChars: 0
};
var DEFAULT_INSPECTOR_LINKS_SETTINGS = {
  keywordTopN: 8,
  tagTopN: 8,
  folderGroupingEnabled: true,
  folderGroupMinCount: 6,
  folderGroupMaxDepth: 4
};
var DEFAULT_SEARCH_SETTINGS = {
  autoIndex: false,
  // Default to manual indexing
  includeDocumentTypes: {
    markdown: true,
    pdf: true,
    image: true,
    // All other document types default to false
    csv: false,
    json: false,
    html: false,
    xml: false,
    txt: false,
    docx: false,
    xlsx: false,
    pptx: false,
    conv: false,
    project: false,
    prompt: false,
    excalidraw: true,
    canvas: false,
    dataloom: false,
    folder: false,
    url: false,
    unknown: false
  },
  chunking: DEFAULT_CHUNKING_SETTINGS,
  ignorePatterns: [
    ".git/",
    "node_modules/",
    ".obsidian/",
    "A-control/",
    "*.tmp",
    "*.temp",
    "*.log",
    ".DS_Store",
    "Thumbs.db"
  ],
  searchSummaryModel: {
    provider: "openai",
    modelId: "gpt-4o-mini"
  },
  aiAnalysisModel: {
    thoughtAgentModel: {
      provider: "openai",
      modelId: "gpt-4o-mini"
    },
    searchAgentModel: {
      provider: "openai",
      modelId: "gpt-4o-mini"
    }
  },
  indexRefreshInterval: 5e3,
  // 5 seconds
  aiAnalysisWebSearchImplement: "local_chromium",
  shortSummaryLength: 150,
  fullSummaryLength: 2e3,
  maxMultiAgentIterations: 10,
  aiAnalysisSessionSummaryWordCount: 3e3,
  aiAnalysisAutoSaveEnabled: true,
  aiAnalysisAutoSaveFolder: "ChatFolder/AI-Analysis",
  aiAnalysisExcludeAutoSaveFolderFromSearch: true,
  aiAnalysisHistoryLimit: 5,
  inspectorLinks: DEFAULT_INSPECTOR_LINKS_SETTINGS,
  hubDiscover: { ...DEFAULT_HUB_DISCOVER_SETTINGS }
};
var AI_PATH_SUBFOLDERS = {
  Prompts: "Prompts",
  Attachments: "Attachments",
  ResourcesSummary: "resources-summary-cache",
  HubSummaries: "Hub-Summaries",
  /** User-authored hub notes live here; not auto-overwritten by maintenance. */
  ManualHubNotes: "Manual",
  UserProfile: "system/User-Profile.md"
};
function aiNormalizedRootFolder() {
  const trimmed = AppContext.getInstance().settings.ai.rootFolder.trim();
  if (!trimmed) {
    throw new BusinessError("CONFIGURATION_MISSING" /* CONFIGURATION_MISSING */, "AI rootFolder is empty; ensure settings are initialized.");
  }
  return (0, import_obsidian3.normalizePath)(trimmed.replace(/\/+$/, ""));
}
function getAIPromptFolder() {
  return (0, import_obsidian3.normalizePath)(`${aiNormalizedRootFolder()}/${AI_PATH_SUBFOLDERS.Prompts}`);
}
function getAIHubSummaryFolder() {
  return (0, import_obsidian3.normalizePath)(`${aiNormalizedRootFolder()}/${AI_PATH_SUBFOLDERS.HubSummaries}`);
}
function getAIManualHubFolder() {
  return (0, import_obsidian3.normalizePath)(`${getAIHubSummaryFolder()}/${AI_PATH_SUBFOLDERS.ManualHubNotes}`);
}
var DEFAULT_AI_SERVICE_SETTINGS = {
  rootFolder: "ChatFolder",
  defaultModel: {
    provider: "openai",
    modelId: "gpt-4o-mini"
  },
  llmProviderConfigs: {},
  profileEnabled: true,
  promptRewriteEnabled: false,
  // Programmatically initialize promptModelMap with defaultModel only for configurable prompt IDs
  promptModelMap: (() => {
    const defaultModel = { provider: "openai", modelId: "gpt-4o-mini" };
    const map = {};
    for (const promptId of CONFIGURABLE_PROMPT_IDS) {
      map[promptId] = { ...defaultModel };
    }
    return map;
  })(),
  attachmentHandlingDefault: "direct",
  // Default to direct for user experience.
  defaultOutputControl: {
    temperature: 1,
    topP: 0.9,
    topK: 50,
    presencePenalty: 0,
    frequencyPenalty: 0,
    maxOutputTokens: 4096,
    reasoningEffort: "medium",
    textVerbosity: "medium",
    timeoutTotalMs: 3e5,
    // 5 minutes
    timeoutStepMs: 3e4
    // 30 seconds
  }
};

// src/core/utils/pathTreeCompact.ts
var INDENT_STEP = "        ";
function buildPathTree(paths) {
  const root = { segment: "", files: [], children: /* @__PURE__ */ new Map() };
  for (const p of paths) {
    const i = p.lastIndexOf("/");
    const dirPath = i >= 0 ? p.slice(0, i) : "";
    const file = i >= 0 ? p.slice(i + 1) : p;
    const segments = dirPath ? dirPath.split("/") : [];
    let node = root;
    for (const seg of segments) {
      if (!node.children.has(seg)) {
        node.children.set(seg, { segment: seg, files: [], children: /* @__PURE__ */ new Map() });
      }
      node = node.children.get(seg);
    }
    node.files.push(file);
  }
  return root;
}
function getCommonPrefixPath(node) {
  const path3 = [];
  let cur = node;
  while (cur.children.size === 1 && cur.files.length === 0) {
    const onlyChild = Array.from(cur.children.entries())[0];
    path3.push(onlyChild[0]);
    cur = onlyChild[1];
  }
  return path3;
}
function buildPathTreeWithSuffix(items) {
  const root = { segment: "", files: [], children: /* @__PURE__ */ new Map() };
  for (const { path: p, suffix } of items) {
    const i = p.lastIndexOf("/");
    const dirPath = i >= 0 ? p.slice(0, i) : "";
    const name = i >= 0 ? p.slice(i + 1) : p;
    const segments = dirPath ? dirPath.split("/") : [];
    let node = root;
    for (const seg of segments) {
      if (!node.children.has(seg)) {
        node.children.set(seg, { segment: seg, files: [], children: /* @__PURE__ */ new Map() });
      }
      node = node.children.get(seg);
    }
    node.files.push({ name, suffix });
  }
  return root;
}
function getCommonPrefixPathWithSuffix(node) {
  const path3 = [];
  let cur = node;
  while (cur.children.size === 1 && cur.files.length === 0) {
    const onlyChild = Array.from(cur.children.entries())[0];
    path3.push(onlyChild[0]);
    cur = onlyChild[1];
  }
  return path3;
}
function serializePathTreeWithSuffix(node, indent, segmentPrefix, ctx) {
  const sortedChildEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
  const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  const hasChildren = sortedChildEntries.length > 0;
  const hasFiles = sortedFiles.length > 0;
  if (node.segment) {
    if (hasFiles && !hasChildren) {
      const filePart = sortedFiles.map((f) => f.name + f.suffix).join(", ");
      const line = indent + segmentPrefix + node.segment + "/[" + filePart + "]";
      if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
      ctx.lines.push(line);
      ctx.pathsShown += sortedFiles.length;
      ctx.totalChars += line.length + 1;
      return;
    }
    if (hasChildren || hasFiles) {
      const line = indent + segmentPrefix + node.segment + "/";
      if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
      ctx.lines.push(line);
      ctx.totalChars += line.length + 1;
    }
  }
  if (hasFiles && hasChildren) {
    const filePart = sortedFiles.map((f) => f.name + f.suffix).join(", ");
    const line = indent + "[" + filePart + "]";
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
    ctx.lines.push(line);
    ctx.pathsShown += sortedFiles.length;
    ctx.totalChars += line.length + 1;
  }
  const nextIndent = indent + INDENT_STEP;
  for (const [, child] of sortedChildEntries) {
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
    serializePathTreeWithSuffix(child, nextIndent, "/", ctx);
  }
}
function compactPathsWithSuffix(items, maxLines = 40, maxChars = 3500) {
  if (items.length === 0) return "";
  const root = buildPathTreeWithSuffix(items);
  const ctx = { lines: [], totalChars: 0, pathsShown: 0, maxLines, maxChars, totalPaths: items.length };
  const commonSegments = getCommonPrefixPathWithSuffix(root);
  const commonPrefix = commonSegments.length > 0 ? commonSegments.join("/") + "/" : "";
  let node = root;
  for (const seg of commonSegments) {
    node = node.children.get(seg);
  }
  if (commonPrefix && (node.files.length > 0 || node.children.size > 0)) {
    const line = commonPrefix;
    if (ctx.totalChars + line.length + 1 <= ctx.maxChars) {
      ctx.lines.push(line);
      ctx.totalChars += line.length + 1;
    }
  }
  const sortedEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
  const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  if (sortedFiles.length > 0) {
    const filePart = sortedFiles.map((f) => f.name + f.suffix).join(", ");
    const line = INDENT_STEP + "[" + filePart + "]";
    if (ctx.lines.length < ctx.maxLines && ctx.totalChars + line.length + 1 <= ctx.maxChars) {
      ctx.lines.push(line);
      ctx.pathsShown += sortedFiles.length;
      ctx.totalChars += line.length + 1;
    }
  }
  for (const [, child] of sortedEntries) {
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
    serializePathTreeWithSuffix(child, INDENT_STEP, "", ctx);
  }
  if (ctx.pathsShown < items.length && ctx.lines.length < maxLines) {
    const remaining = items.length - ctx.pathsShown;
    const tail = "... and " + remaining + " more";
    if (ctx.totalChars + tail.length + 1 <= ctx.maxChars) ctx.lines.push(tail);
  }
  return ctx.lines.join("\n");
}
function serializePathTree(node, indent, segmentPrefix, ctx) {
  const sortedChildEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
  const sortedFiles = [...node.files].sort((a, b) => a.localeCompare(b));
  const hasChildren = sortedChildEntries.length > 0;
  const hasFiles = sortedFiles.length > 0;
  if (node.segment) {
    if (hasFiles && !hasChildren) {
      const line = indent + segmentPrefix + node.segment + "/[" + sortedFiles.join(", ") + "]";
      if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
      ctx.lines.push(line);
      ctx.pathsShown += sortedFiles.length;
      ctx.totalChars += line.length + 1;
      return;
    }
    if (hasChildren || hasFiles) {
      const line = indent + segmentPrefix + node.segment + "/";
      if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
      ctx.lines.push(line);
      ctx.totalChars += line.length + 1;
    }
  }
  if (hasFiles && hasChildren) {
    const line = indent + "[" + sortedFiles.join(", ") + "]";
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
    ctx.lines.push(line);
    ctx.pathsShown += sortedFiles.length;
    ctx.totalChars += line.length + 1;
  }
  const nextIndent = indent + INDENT_STEP;
  for (const [, child] of sortedChildEntries) {
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
    serializePathTree(child, nextIndent, "/", ctx);
  }
}
function compactPathsForPrompt(paths, maxLines = 60, maxChars = 4e3) {
  if (paths.length === 0) return "";
  const root = buildPathTree(paths);
  const ctx = { lines: [], totalChars: 0, pathsShown: 0, maxLines, maxChars, totalPaths: paths.length };
  const commonSegments = getCommonPrefixPath(root);
  const commonPrefix = commonSegments.length > 0 ? commonSegments.join("/") + "/" : "";
  let node = root;
  for (const seg of commonSegments) {
    node = node.children.get(seg);
  }
  if (commonPrefix && (node.files.length > 0 || node.children.size > 0)) {
    const line = commonPrefix;
    if (ctx.totalChars + line.length + 1 <= ctx.maxChars) {
      ctx.lines.push(line);
      ctx.totalChars += line.length + 1;
    }
  }
  const sortedEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
  const sortedFiles = [...node.files].sort((a, b) => a.localeCompare(b));
  if (sortedFiles.length > 0) {
    const line = INDENT_STEP + "[" + sortedFiles.join(", ") + "]";
    if (ctx.lines.length < ctx.maxLines && ctx.totalChars + line.length + 1 <= ctx.maxChars) {
      ctx.lines.push(line);
      ctx.pathsShown += sortedFiles.length;
      ctx.totalChars += line.length + 1;
    }
  }
  for (const [, child] of sortedEntries) {
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
    serializePathTree(child, INDENT_STEP, "", ctx);
  }
  if (ctx.pathsShown < paths.length && ctx.lines.length < maxLines) {
    const remaining = paths.length - ctx.pathsShown;
    const tail = "... and " + remaining + " more path(s)";
    if (ctx.totalChars + tail.length + 1 <= ctx.maxChars) ctx.lines.push(tail);
  }
  return ctx.lines.join("\n");
}

// src/service/tools/search-graph-inspector/explore-folder.ts
var import_obsidian4 = __toESM(require_obsidian_stub());
var DEFAULT_LIMIT = 50;
async function exploreFolder(params, templateManager) {
  const { folderPath, recursive, max_depth, limit, response_format } = params;
  const perFolderLimit = Math.max(1, Number(limit) ?? DEFAULT_LIMIT);
  const vault = AppContext.getInstance().app.vault;
  const normalizedPath = normalizeVaultFolderPath(folderPath);
  const exclusions = getExploreFolderExclusions();
  if (exclusions.enabled && isPathExcluded(normalizedPath, exclusions.excludedPathPrefixes)) {
    return renderExploreFolderExcludedMarkdown(folderPath, exclusions.excludedPathPrefixes);
  }
  const targetFolder = normalizedPath === "" ? vault.getRoot() : vault.getAbstractFileByPath(normalizedPath);
  if (!targetFolder || !(targetFolder instanceof import_obsidian4.TFolder)) {
    return `Folder not found: ${folderPath}`;
  }
  const fullTree = getFolderStructure(
    targetFolder,
    recursive,
    max_depth ?? 3,
    0,
    exclusions.enabled ? exclusions.excludedPathPrefixes : void 0
  );
  const allCandidateFilePaths = getAllFilePaths(fullTree);
  if (!allCandidateFilePaths.length) {
    return "No files found in the folder";
  }
  const { items: finalFileTree, omitted: rootOmitted } = limitAndSortTree(fullTree, perFolderLimit);
  const visibleFilePaths = getAllFilePaths(finalFileTree);
  const { tagDesc, userKeywordTagDesc, categoryDesc } = exclusions.enabled ? await getTagsAndCategoriesByDocPaths(visibleFilePaths, perFolderLimit) : await getTagsAndCategoriesByFolderPath(normalizedPath, perFolderLimit);
  const docStats = exclusions.enabled ? await getDocStatisticsByDocPaths(visibleFilePaths, perFolderLimit) : await getDocStatisticsByFolderPath(normalizedPath, perFolderLimit);
  const sameGroupCountByPath = buildSameGroupCountByPath(finalFileTree);
  const compactFileTree = compactPathsForPrompt(visibleFilePaths, 80, 6e3);
  const compactRecentEdited = docStats.topRecentEdited.items.length > 0 ? compactPathsWithSuffix(
    docStats.topRecentEdited.items.map((i) => ({
      path: i.path,
      suffix: ` (${humanReadableTime(i.updated_at)})${(i.sameGroupCount ?? 0) > 1 ? ` _(${i.sameGroupCount} similar)_` : ""}`
    })),
    40,
    3500
  ) : "";
  const compactWordCount = docStats.topWordCount.length > 0 ? compactPathsWithSuffix(docStats.topWordCount.map((i) => ({ path: i.path, suffix: `: ${i.word_count} words` })), 40, 3500) : "";
  const compactCharCount = docStats.topCharCount.length > 0 ? compactPathsWithSuffix(docStats.topCharCount.map((i) => ({ path: i.path, suffix: `: ${i.char_count} characters` })), 40, 3500) : "";
  const compactRichness = docStats.topRichness.length > 0 ? compactPathsWithSuffix(docStats.topRichness.map((i) => ({ path: i.path, suffix: `: ${i.richness_score} richness` })), 40, 3500) : "";
  const compactTopLinksIn = docStats.topLinksIn.length > 0 ? compactPathsWithSuffix(docStats.topLinksIn.map((i) => ({ path: i.path, suffix: `: ${i.inDegree}` })), 40, 3500) : "";
  const compactTopLinksOut = docStats.topLinksOut.length > 0 ? compactPathsWithSuffix(docStats.topLinksOut.map((i) => ({ path: i.path, suffix: `: ${i.outDegree}` })), 40, 3500) : "";
  const data = {
    current_path: folderPath,
    recursive,
    max_depth: max_depth || 3,
    fileTree: finalFileTree,
    compactFileTree,
    compactRecentEdited,
    compactWordCount,
    compactCharCount,
    compactRichness,
    compactTopLinksIn,
    compactTopLinksOut,
    sameGroupCountByPath,
    rootOmitted,
    tagDesc,
    userKeywordTagDesc,
    categoryDesc,
    docStats
  };
  return buildExploreFolderResponse(response_format, data, templateManager);
}
function getFolderStructure(folder, recursive, maxDepth, currentDepth, excludedPathPrefixes) {
  const result = [];
  for (const child of folder.children) {
    if (excludedPathPrefixes?.length && isPathExcluded(child.path, excludedPathPrefixes)) {
      continue;
    }
    const mtime = child.stat?.mtime ?? 0;
    const name = child.path.split("/").pop() ?? child.path;
    const base = { path: child.path, name, mtime };
    if (child instanceof import_obsidian4.TFolder) {
      const folderItem = {
        ...base,
        type: "folder",
        linkPath: "",
        depth: 0
      };
      if (recursive && currentDepth < maxDepth - 1) {
        folderItem.children = getFolderStructure(child, recursive, maxDepth, currentDepth + 1, excludedPathPrefixes);
      }
      result.push(folderItem);
    } else if (child instanceof import_obsidian4.TFile) {
      result.push({
        ...base,
        type: "file",
        linkPath: "",
        depth: 0
      });
    }
  }
  return result;
}
function linkPathRelativeTo(fullPath, parentPath) {
  if (!parentPath) return fullPath;
  const prefix = parentPath + "/";
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}
function compressFileSiblings(items, rest = []) {
  const files = items.filter((it) => it.type === "file");
  if (files.length === 0) return items;
  const keyToGroup = /* @__PURE__ */ new Map();
  for (const f of files) {
    const basename = f.name ?? f.path.split("/").pop() ?? "";
    const key = normalizeRecentEditedKey(basename);
    const arr = keyToGroup.get(key) ?? [];
    arr.push(f);
    keyToGroup.set(key, arr);
  }
  const restCountByKey = /* @__PURE__ */ new Map();
  for (const it of rest) {
    if (it.type !== "file") continue;
    const basename = it.name ?? it.path.split("/").pop() ?? "";
    if (!basename) continue;
    const key = normalizeRecentEditedKey(basename);
    restCountByKey.set(key, (restCountByKey.get(key) ?? 0) + 1);
  }
  const keyToRep = /* @__PURE__ */ new Map();
  for (const [key, group] of keyToGroup) {
    const sorted = [...group].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
    const rep = sorted[0];
    const ext = rep.path.split(".").pop() ?? "";
    const patternName = ext ? `${key}.${ext}` : key;
    const restCount = restCountByKey.get(key) ?? 0;
    const total = group.length + restCount;
    const repObj = {
      type: rep.type,
      path: rep.path,
      name: rep.name,
      linkPath: rep.linkPath,
      depth: rep.depth,
      mtime: rep.mtime,
      sameGroupCount: total,
      ...total > 1 ? { patternName } : {}
    };
    keyToRep.set(key, repObj);
  }
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const it of items) {
    if (it.type === "folder") {
      result.push(it);
      continue;
    }
    const basename = it.name ?? it.path.split("/").pop() ?? "";
    const key = normalizeRecentEditedKey(basename);
    if (seen.has(key)) continue;
    seen.add(key);
    const rep = keyToRep.get(key);
    if (rep) result.push(rep);
  }
  return result;
}
function limitAndSortTree(nodes, limit, parentPath = "", depth = 0) {
  const sorted = [...nodes].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
  const taken = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const omitted = rest.length ? summarizeOmitted(rest) : void 0;
  const rawItems = taken.map((node) => {
    const linkPath = linkPathRelativeTo(node.path, parentPath);
    if (node.type === "file") {
      return {
        type: "file",
        path: node.path,
        name: node.name,
        linkPath,
        depth,
        mtime: node.mtime
      };
    }
    const { items: childItems, omitted: childOmitted } = limitAndSortTree(
      node.children ?? [],
      limit,
      node.path,
      depth + 1
    );
    return {
      type: "folder",
      path: node.path,
      name: node.name,
      linkPath,
      depth,
      mtime: node.mtime,
      children: childItems,
      omitted: childOmitted
    };
  });
  const items = compressFileSiblings(rawItems, rest);
  return { items, omitted, rest };
}
function summarizeOmitted(rest) {
  const byExt = {};
  let folderCount = 0;
  for (const item of rest) {
    if (item.type === "folder") {
      folderCount++;
    } else {
      const ext = item.path.split(".").pop()?.toLowerCase() ?? "unknown";
      byExt[ext] = (byExt[ext] ?? 0) + 1;
    }
  }
  return { total: rest.length, byExt, folderCount };
}
function normalizeRecentEditedKey(basename) {
  if (!basename || typeof basename !== "string") return basename || "";
  const withoutExt = basename.replace(/\.[^.]+$/, "");
  return withoutExt.replace(/^\d+\s*-\s*/, "*").replace(/\d{6,}(\s*-\s*)?/g, "*").trim() || withoutExt;
}
function compressRecentEdited(items) {
  if (items.length === 0) {
    return { items: [], totalItems: 0, totalGroups: 0 };
  }
  const keyToGroup = /* @__PURE__ */ new Map();
  for (const it of items) {
    const basename = it.path.split("/").pop() ?? it.path;
    const key = normalizeRecentEditedKey(basename);
    const arr = keyToGroup.get(key) ?? [];
    arr.push(it);
    keyToGroup.set(key, arr);
  }
  const result = [];
  for (const group of keyToGroup.values()) {
    const sorted = [...group].sort((a, b) => b.updated_at - a.updated_at);
    const representative = sorted[0];
    result.push({
      path: representative.path,
      updated_at: representative.updated_at,
      sameGroupCount: group.length
    });
  }
  result.sort((a, b) => b.updated_at - a.updated_at);
  return {
    items: result,
    totalItems: items.length,
    totalGroups: result.length
  };
}
function getAllFilePaths(fileTree) {
  const filePaths = [];
  for (const item of fileTree) {
    if (item.type === "file") filePaths.push(item.path);
    else if (item.children) filePaths.push(...getAllFilePaths(item.children));
  }
  return filePaths;
}
function buildSameGroupCountByPath(tree) {
  const out = {};
  function walk(nodes) {
    for (const node of nodes) {
      if (node.type === "file" && node.path && typeof node.sameGroupCount === "number") {
        const n = node.sameGroupCount;
        if (n > 1) out[node.path] = n;
      }
      if (node.children?.length) walk(node.children);
    }
  }
  walk(tree);
  return out;
}
async function getTagsAndCategoriesByFolderPath(pathPrefix, topN = 20) {
  const graphRepo = sqliteStoreManager.getGraphRepo();
  const docIds = pathPrefix === "" ? void 0 : (await sqliteStoreManager.getIndexedDocumentRepo().getIdsByFolderPath(pathPrefix)).map((m) => m.id);
  if (docIds !== void 0 && docIds.length === 0) {
    return { tagDesc: "", userKeywordTagDesc: "", categoryDesc: "" };
  }
  const { topicTagCounts, functionalTagCounts, keywordTagCounts } = await graphRepo.getTagsByDocIds(docIds);
  const tagDesc = Array.from(topicTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([name, count]) => `${name}(${count})`).join(", ");
  const userKeywordTagDesc = Array.from(keywordTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([name, count]) => `${name}(${count})`).join(", ");
  const categoryDesc = Array.from(functionalTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([name, count]) => `${name}(${count})`).join(", ");
  return { tagDesc, userKeywordTagDesc, categoryDesc };
}
async function getDocStatisticsByFolderPath(pathPrefix, topK = 5) {
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const docIdsMaps = pathPrefix === "" ? null : await indexedDocumentRepo.getIdsByFolderPath(pathPrefix);
  const docIds = docIdsMaps === null ? void 0 : docIdsMaps.map((m) => m.id);
  if (docIds !== void 0 && docIds.length === 0) {
    return {
      totalFiles: 0,
      topRecentEdited: { items: [], totalItems: 0, totalGroups: 0, compressedCount: 0 },
      topWordCount: [],
      topCharCount: [],
      topRichness: [],
      topLinksIn: [],
      topLinksOut: [],
      hasTopLinks: false,
      languageStats: void 0
    };
  }
  const [
    topRecentEditedRaw,
    topWordCount,
    topCharCount,
    topRichness,
    languageStatsRows,
    totalFiles,
    { topLinksInRaw, topLinksOutRaw }
  ] = await Promise.all([
    mobiusNodeRepo.getTopRecentEditedByDocIds(docIds, topK),
    mobiusNodeRepo.getTopWordCountByDocIds(docIds, topK),
    mobiusNodeRepo.getTopCharCountByDocIds(docIds, topK),
    mobiusNodeRepo.getTopRichnessByDocIds(docIds, topK),
    mobiusNodeRepo.getLanguageStatsByDocIds(docIds),
    docIds === void 0 ? mobiusNodeRepo.countAllDocumentStatisticsRows() : Promise.resolve(docIds.length),
    // Edge type in graph_edges is relationship type (e.g. 'references', 'tagged'), not node type; use no filter to count all edges.
    pathPrefix === "" ? mobiusEdgeRepo.getTopNodeIdsByDegree(topK, void 0, GraphEdgeType.References).then((r) => ({
      topLinksInRaw: r.topByInDegree.map((x) => ({ node_id: x.nodeId, inDegree: x.inDegree })),
      topLinksOutRaw: r.topByOutDegree.map((x) => ({ node_id: x.nodeId, outDegree: x.outDegree }))
    })) : mobiusEdgeRepo.countEdges(docIds).then(({ incoming, outgoing }) => ({
      topLinksInRaw: [...incoming.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([node_id, inDegree]) => ({ node_id, inDegree })),
      topLinksOutRaw: [...outgoing.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([node_id, outDegree]) => ({ node_id, outDegree }))
    }))
  ]);
  const allDocIdsFromTops = [
    ...topRecentEditedRaw.map((r) => r.doc_id),
    ...topWordCount.map((r) => r.doc_id),
    ...topCharCount.map((r) => r.doc_id),
    ...topRichness.map((r) => r.doc_id),
    ...topLinksInRaw.map((r) => r.node_id),
    ...topLinksOutRaw.map((r) => r.node_id)
  ];
  const uniqueIds = [...new Set(allDocIdsFromTops)];
  const idToPathMap = docIdsMaps !== null ? new Map(docIdsMaps.map((m) => [m.id, m.path])) : new Map((uniqueIds.length ? await indexedDocumentRepo.getByIds(uniqueIds) : []).map((m) => [m.id, m.path]));
  const languageStats = {};
  for (const row of languageStatsRows) {
    languageStats[row.language] = row.count;
  }
  const topRecentEditedList = topRecentEditedRaw.map((item) => ({
    path: idToPathMap.get(item.doc_id) ?? item.doc_id,
    updated_at: item.updated_at
  }));
  const topRecentEdited = compressRecentEdited(topRecentEditedList);
  return {
    totalFiles,
    topRecentEdited: {
      ...topRecentEdited,
      compressedCount: topRecentEdited.totalItems - topRecentEdited.totalGroups
    },
    topWordCount: topWordCount.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, word_count: item.word_count })),
    topCharCount: topCharCount.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, char_count: item.char_count })),
    topRichness: topRichness.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, richness_score: item.richness_score })),
    topLinksIn: topLinksInRaw.map((item) => ({
      path: idToPathMap.get(item.node_id) ?? item.node_id,
      inDegree: item.inDegree
    })),
    topLinksOut: topLinksOutRaw.map((item) => ({
      path: idToPathMap.get(item.node_id) ?? item.node_id,
      outDegree: item.outDegree
    })),
    hasTopLinks: topLinksInRaw.length > 0 || topLinksOutRaw.length > 0,
    languageStats: Object.keys(languageStats).length > 0 ? languageStats : void 0
  };
}
function normalizeVaultFolderPath(folderPath) {
  const raw = folderPath == null ? "" : String(folderPath).trim();
  if (raw === "" || raw === "/") return "";
  return raw.replace(/^\/+|\/+$/g, "");
}
function isPathExcluded(path3, excludedPathPrefixes) {
  if (!excludedPathPrefixes.length) return false;
  const p = normalizeVaultFolderPath(path3);
  if (p === "") return false;
  const hub = normalizeVaultFolderPath(getAIHubSummaryFolder());
  if (hub && (p === hub || p.startsWith(hub + "/"))) {
    return false;
  }
  for (const rawPrefix of excludedPathPrefixes) {
    const prefix = normalizeVaultFolderPath(rawPrefix);
    if (!prefix) continue;
    if (p === prefix) return true;
    if (p.startsWith(prefix + "/")) return true;
  }
  return false;
}
function getExploreFolderExclusions() {
  const settings = AppContext.getInstance().settings;
  const enabled = settings.search.aiAnalysisExcludeAutoSaveFolderFromSearch ?? true;
  if (!enabled) return { enabled: false, excludedPathPrefixes: [] };
  const rootFolder = normalizeVaultFolderPath(settings.ai.rootFolder);
  const autoSaveFolder = normalizeVaultFolderPath(settings.search.aiAnalysisAutoSaveFolder);
  const excludedPathPrefixes = Array.from(new Set([rootFolder, autoSaveFolder].filter(Boolean)));
  return { enabled: excludedPathPrefixes.length > 0, excludedPathPrefixes };
}
function getFullVaultFilePathsForGrep() {
  const vault = AppContext.getInstance().app.vault;
  const root = vault.getRoot();
  const exclusions = getExploreFolderExclusions();
  const tree = getFolderStructure(
    root,
    true,
    50,
    0,
    exclusions.enabled ? exclusions.excludedPathPrefixes : void 0
  );
  return getAllFilePaths(tree);
}
function renderExploreFolderExcludedMarkdown(requestedFolderPath, excludedPrefixes) {
  const req = requestedFolderPath == null ? "" : String(requestedFolderPath);
  const list = excludedPrefixes.map((p) => `- \`${p}\``).join("\n");
  return [
    `## explore_folder`,
    ``,
    `The requested folder is excluded by settings and cannot be explored.`,
    ``,
    `- Requested: \`${req}\``,
    `- Excluded prefixes:`,
    list || `- (none)`
  ].join("\n");
}
async function buildExploreFolderResponse(responseFormat, data, templateManager) {
  if (responseFormat === "structured") return data;
  const markdown = await renderExploreFolderMarkdown(data, templateManager);
  if (responseFormat === "markdown") return markdown;
  return { data, template: markdown };
}
async function renderExploreFolderMarkdown(data, templateManager) {
  const tm = templateManager ?? AppContext.getInstance().manager.getTemplateManager?.();
  if (tm) {
    try {
      const rendered = await tm.render(ToolTemplateId.ExploreFolder, data);
      if (typeof rendered === "string" && rendered.trim() !== "") return rendered;
    } catch {
    }
  }
  return fallbackExploreFolderMarkdown(data);
}
function fallbackExploreFolderMarkdown(data) {
  const root = data?.current_path ?? "/";
  const maxDepth = data?.max_depth ?? 3;
  const recursive = Boolean(data?.recursive);
  const lines = [];
  lines.push(`## Folder: \`${root}\``);
  lines.push(``);
  lines.push(`- recursive: \`${String(recursive)}\``);
  lines.push(`- max_depth: \`${String(maxDepth)}\``);
  lines.push(``);
  lines.push(`\`\`\``);
  const tree = Array.isArray(data?.fileTree) ? data.fileTree : [];
  for (const node of tree) {
    lines.push(...renderTreeLines(node));
  }
  if (!tree.length) lines.push("(empty)");
  lines.push(`\`\`\``);
  const omitted = data?.rootOmitted;
  if (omitted?.total) {
    lines.push(``);
    lines.push(`- omitted_at_root: ${omitted.total} item(s) (folders: ${omitted.folderCount})`);
  }
  return lines.join("\n");
}
function renderTreeLines(node) {
  const indent = "  ".repeat(Math.max(0, node.depth ?? 0));
  const suffix = node.type === "folder" ? "/" : "";
  const group = node.sameGroupCount && node.sameGroupCount > 1 ? ` (x${node.sameGroupCount}${node.patternName ? `, ${node.patternName}` : ""})` : "";
  const line = `${indent}${node.name}${suffix}${group}`;
  const out = [line];
  if (node.type === "folder" && node.children?.length) {
    for (const child of node.children) {
      out.push(...renderTreeLines(child));
    }
  }
  return out;
}
async function getTagsAndCategoriesByDocPaths(paths, topN = 20) {
  const uniquePaths = [...new Set(paths)].filter(Boolean);
  if (!uniquePaths.length) return { tagDesc: "", userKeywordTagDesc: "", categoryDesc: "" };
  const docIdsMaps = await sqliteStoreManager.getIndexedDocumentRepo().getIdsByPaths(uniquePaths);
  const docIds = docIdsMaps.map((m) => m.id);
  if (!docIds.length) return { tagDesc: "", userKeywordTagDesc: "", categoryDesc: "" };
  const { topicTagCounts, functionalTagCounts, keywordTagCounts } = await sqliteStoreManager.getGraphRepo().getTagsByDocIds(docIds);
  const tagDesc = Array.from(topicTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([name, count]) => `${name}(${count})`).join(", ");
  const userKeywordTagDesc = Array.from(keywordTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([name, count]) => `${name}(${count})`).join(", ");
  const categoryDesc = Array.from(functionalTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([name, count]) => `${name}(${count})`).join(", ");
  return { tagDesc, userKeywordTagDesc, categoryDesc };
}
async function getDocStatisticsByDocPaths(paths, topK = 5) {
  const uniquePaths = [...new Set(paths)].filter(Boolean);
  if (!uniquePaths.length) {
    return {
      totalFiles: 0,
      topRecentEdited: { items: [], totalItems: 0, totalGroups: 0, compressedCount: 0 },
      topWordCount: [],
      topCharCount: [],
      topRichness: [],
      topLinksIn: [],
      topLinksOut: [],
      hasTopLinks: false,
      languageStats: void 0
    };
  }
  const cappedPaths = uniquePaths.slice(0, SLICE_CAPS.inspector.exploreFolderPaths);
  const docIdsMaps = await sqliteStoreManager.getIndexedDocumentRepo().getIdsByPaths(cappedPaths);
  const docIds = docIdsMaps.map((m) => m.id);
  if (!docIds.length) {
    return {
      totalFiles: 0,
      topRecentEdited: { items: [], totalItems: 0, totalGroups: 0, compressedCount: 0 },
      topWordCount: [],
      topCharCount: [],
      topRichness: [],
      topLinksIn: [],
      topLinksOut: [],
      hasTopLinks: false,
      languageStats: void 0
    };
  }
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const idToPathMap = new Map(docIdsMaps.map((m) => [m.id, m.path]));
  const [
    topRecentEditedRaw,
    topWordCount,
    topCharCount,
    topRichness,
    languageStatsRows,
    { topLinksInRaw, topLinksOutRaw }
  ] = await Promise.all([
    mobiusNodeRepo.getTopRecentEditedByDocIds(docIds, topK),
    mobiusNodeRepo.getTopWordCountByDocIds(docIds, topK),
    mobiusNodeRepo.getTopCharCountByDocIds(docIds, topK),
    mobiusNodeRepo.getTopRichnessByDocIds(docIds, topK),
    mobiusNodeRepo.getLanguageStatsByDocIds(docIds),
    mobiusEdgeRepo.countEdges(docIds).then(({ incoming, outgoing }) => ({
      topLinksInRaw: [...incoming.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([node_id, inDegree]) => ({ node_id, inDegree })),
      topLinksOutRaw: [...outgoing.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([node_id, outDegree]) => ({ node_id, outDegree }))
    }))
  ]);
  const languageStats = {};
  for (const row of languageStatsRows) {
    languageStats[row.language] = row.count;
  }
  const topRecentEditedList = topRecentEditedRaw.map((item) => ({
    path: idToPathMap.get(item.doc_id) ?? item.doc_id,
    updated_at: item.updated_at
  }));
  const topRecentEdited = compressRecentEdited(topRecentEditedList);
  return {
    totalFiles: docIds.length,
    topRecentEdited: {
      ...topRecentEdited,
      compressedCount: topRecentEdited.totalItems - topRecentEdited.totalGroups
    },
    topWordCount: topWordCount.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, word_count: item.word_count })),
    topCharCount: topCharCount.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, char_count: item.char_count })),
    topRichness: topRichness.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, richness_score: item.richness_score })),
    topLinksIn: topLinksInRaw.map((item) => ({
      path: idToPathMap.get(item.node_id) ?? item.node_id,
      inDegree: item.inDegree
    })),
    topLinksOut: topLinksOutRaw.map((item) => ({
      path: idToPathMap.get(item.node_id) ?? item.node_id,
      outDegree: item.outDegree
    })),
    hasTopLinks: topLinksInRaw.length > 0 || topLinksOutRaw.length > 0,
    languageStats: Object.keys(languageStats).length > 0 ? languageStats : void 0
  };
}

// src/service/tools/search-graph-inspector/grep-file-tree.ts
var DEFAULT_LIMIT2 = 200;
async function grepFileTree(params) {
  const limit = Math.min(DEFAULT_LIMIT2, Math.max(1, Number(params.limit) ?? DEFAULT_LIMIT2));
  const pattern = String(params.pattern).trim();
  const allPaths = getFullVaultFilePathsForGrep();
  let matched;
  try {
    const asRegex = new RegExp(pattern, "i");
    matched = allPaths.filter((p) => asRegex.test(p));
  } catch {
    matched = allPaths.filter((p) => p.toLowerCase().includes(pattern.toLowerCase()));
  }
  const slice = matched.slice(0, limit);
  const total = matched.length;
  const lines = slice.map((p) => `- ${p}`);
  const header = [
    "## grep_file_tree",
    "",
    `Pattern: \`${pattern}\``,
    `Matches: ${slice.length}${total > limit ? ` (showing first ${limit} of ${total})` : ""}`,
    ""
  ].join("\n");
  return header + lines.join("\n");
}

// src/service/tools/search-graph-inspector/recent-change-whole-vault.ts
async function getRecentChanges(params, templateManager) {
  const { limit, response_format, filters, sorter } = params;
  const candidateItems = await AppContext.getInstance().searchClient.getRecent(limit);
  const itemFiledGetter = await getDefaultItemFiledGetter(candidateItems.map((item) => item.id), filters, sorter);
  const finalItems = applyFiltersAndSorters(candidateItems, filters, sorter, limit, itemFiledGetter);
  const data = { items: finalItems };
  return buildResponse(response_format, ToolTemplateId.RecentChanges, data, { templateManager });
}

// src/service/tools/search-graph-inspector/local-search.ts
function convertHighlightToText(highlight) {
  if (!highlight || !highlight.text) {
    return "";
  }
  if (!highlight.highlights || highlight.highlights.length === 0) {
    return highlight.text;
  }
  const sortedHighlights = [...highlight.highlights].sort((a, b) => b.start - a.start);
  let result = highlight.text;
  for (const span of sortedHighlights) {
    const start = span.start;
    const end = span.end;
    result = result.slice(0, end) + "**" + result.slice(end);
    result = result.slice(0, start) + "**" + result.slice(start);
  }
  return result;
}
function slimSearchResults(items) {
  return items.map((item) => {
    const {
      content,
      highlight,
      ...rest
    } = item;
    return {
      ...rest,
      highlightedText: convertHighlightToText(highlight)
    };
  });
}
async function getSearchResultItemFieldGetter(items, filters, sorter) {
  const paths = items.map((item) => item.path);
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const pathToMetaMap = await indexedDocumentRepo.getByPaths(paths);
  let tagsTripleByPath = /* @__PURE__ */ new Map();
  if (filters?.tag_category_boolean_expression) {
    const docIds = Array.from(pathToMetaMap.values()).map((meta2) => meta2.id);
    const graphData = await sqliteStoreManager.getGraphRepo().getTagsByDocIds(docIds);
    const docIdToData = graphData.idMapToTags;
    for (const [path3, meta2] of pathToMetaMap) {
      const data = docIdToData.get(meta2.id);
      if (data) {
        tagsTripleByPath.set(path3, data);
      }
    }
  }
  return (item) => ({
    getPath: () => item.path,
    getModified: () => {
      const meta2 = pathToMetaMap.get(item.path);
      return meta2?.mtime ? new Date(meta2.mtime) : new Date(item.lastModified);
    },
    getCreated: () => {
      const meta2 = pathToMetaMap.get(item.path);
      const createTime = meta2?.ctime ?? meta2?.mtime;
      return createTime ? new Date(createTime) : void 0;
    },
    getTopicTags: () => tagsTripleByPath.get(item.path)?.topicTags ?? [],
    getFunctionalTagEntries: () => tagsTripleByPath.get(item.path)?.functionalTagEntries ?? [],
    getFunctionalTags: () => tagsTripleByPath.get(item.path)?.functionalTagEntries.map((e) => e.id) ?? [],
    getKeywordTags: () => tagsTripleByPath.get(item.path)?.keywordTags ?? [],
    getTags: () => {
      const t = tagsTripleByPath.get(item.path);
      return [
        ...t?.topicTags ?? [],
        ...t?.keywordTags ?? [],
        ...t?.timeTags ?? [],
        ...t?.geoTags ?? [],
        ...t?.personTags ?? []
      ];
    },
    getCategory: () => tagsTripleByPath.get(item.path)?.functionalTagEntries?.[0]?.id,
    getResultRank: () => item.finalScore || item.score || 0,
    getTotalLinksCount: () => 0,
    // Not available for search results
    getInCominglinksCount: () => 0,
    getOutgoingCount: () => 0
  });
}
async function localSearch(params, templateManager) {
  const { query, searchMode, scopeMode, scopeValue, limit, response_format, filters, sorter } = params;
  const { items: rawItems, duration } = await AppContext.getInstance().searchClient.search({
    text: query,
    searchMode,
    scopeMode,
    scopeValue,
    topK: limit,
    indexTenant: "vault"
  });
  const itemFieldGetter = await getSearchResultItemFieldGetter(rawItems, filters, sorter);
  const filteredItems = applyFiltersAndSorters(rawItems, filters, sorter, limit, itemFieldGetter);
  const slimResults = slimSearchResults(filteredItems);
  const data = {
    query,
    results: slimResults,
    searchTime: duration
  };
  return buildResponse(response_format, ToolTemplateId.LocalSearch, data, { templateManager });
}

// src/service/search/index/helper/hub/hubDocServices.ts
var import_obsidian18 = __toESM(require_obsidian_stub());

// src/core/utils/markdown-utils.ts
var import_gray_matter = __toESM(require("gray-matter"));
var import_remark = require("remark");
var import_remark_frontmatter = __toESM(require("remark-frontmatter"));
var import_remark_gfm = __toESM(require("remark-gfm"));
var import_remark_wiki_link = __toESM(require("remark-wiki-link"));
var import_unist_util_visit = require("unist-util-visit");
function parseFrontmatter(text) {
  const parsed = (0, import_gray_matter.default)(text);
  if (parsed.matter === "") {
    return null;
  }
  return {
    data: parsed.data,
    body: parsed.content
  };
}
async function parseMarkdownWithRemark(content, options) {
  const processor = (0, import_remark.remark)().use(import_remark_frontmatter.default, ["yaml"]).use(import_remark_gfm.default).use(import_remark_wiki_link.default, {
    pageResolver: (name) => [name],
    hrefTemplate: (permalink) => permalink,
    wikiLinkClassName: null,
    newClassName: null,
    aliasDivider: "|"
  });
  const ast = processor.parse(content);
  const validAst = !ast || !ast.children ? {
    type: "root",
    children: [{
      type: "paragraph",
      children: [{ type: "text", value: content }]
    }]
  } : ast;
  let frontmatter = null;
  let title = null;
  const tags = /* @__PURE__ */ new Set();
  const outgoingRefs = [];
  const embeddings = [];
  const resolveToFullPath = (linkTarget) => {
    if (options?.resolveWikiLinkToPath) {
      const resolved = options.resolveWikiLinkToPath(linkTarget);
      if (resolved) return resolved;
    }
    return linkTarget;
  };
  (0, import_unist_util_visit.visit)(validAst, (node, index, parent) => {
    switch (node.type) {
      case "yaml":
        try {
          const yamlContent = node.value;
          const parsed = (0, import_gray_matter.default)(`---
${yamlContent}
---`);
          frontmatter = Object.keys(parsed.data).length > 0 ? parsed.data : null;
          if (frontmatter?.tags) {
            const frontmatterTags = Array.isArray(frontmatter.tags) ? frontmatter.tags : String(frontmatter.tags).split(",");
            frontmatterTags.forEach((tag) => tags.add(String(tag).trim()));
          }
          if (frontmatter?.title && !title) {
            title = String(frontmatter.title).trim().replace(/^["']|["']$/g, "");
          }
        } catch (e) {
        }
        break;
      // case 'heading':
      // 	// Extract title from first h1 if not already set
      // 	if (!title && (node as Heading).depth === 1) {
      // 		title = toString(node);
      // 	}
      // 	break;
      case "wikiLink":
        const target = node.value || node.data?.permalink || node.data?.value || node.url;
        if (target) {
          const isEmbed = node.data?.isEmbed || typeof node.value === "string" && node.value.startsWith("!") || node.data?.embed;
          if (isEmbed) {
            embeddings.push(resolveToFullPath(target.replace(/^!/, "")));
          } else {
            outgoingRefs.push({ fullPath: resolveToFullPath(target) });
          }
        }
        break;
      case "link":
        const linkNode = node;
        if (linkNode.url && !linkNode.url.startsWith("http") && !linkNode.url.startsWith("#")) {
          outgoingRefs.push({ fullPath: linkNode.url });
        }
        break;
      case "image":
        const imageNode = node;
        if (imageNode.url && !imageNode.url.startsWith("http")) {
          embeddings.push(imageNode.url);
        }
        break;
      case "text":
        if (parent && ["code", "inlineCode", "link"].includes(parent.type)) {
          return;
        }
        if (node.value.includes("[[")) {
          const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
          const wikiMatches = node.value.matchAll(wikiLinkRegex);
          for (const match of wikiMatches) {
            const content2 = match[1];
            const pipeIndex = content2.indexOf("|");
            let target2 = pipeIndex !== -1 ? content2.substring(0, pipeIndex).trim() : content2.trim();
            if (target2.startsWith("!")) {
              target2 = target2.substring(1).trim();
              const hashIndex2 = target2.indexOf("#");
              const filePath = hashIndex2 !== -1 ? target2.substring(0, hashIndex2).trim() : target2;
              if (filePath && filePath.length > 0 && filePath.length <= 200 && !filePath.startsWith("@") && !filePath.includes("\n") && /[a-zA-Z\u4e00-\u9fff]/.test(filePath)) {
                embeddings.push(filePath);
              }
              continue;
            }
            const hashIndex = target2.indexOf("#");
            const fullPath = hashIndex !== -1 ? target2.substring(0, hashIndex).trim() : target2;
            if (fullPath && fullPath.length > 0 && fullPath.length <= 200 && !fullPath.startsWith("@") && !fullPath.includes("\n") && /[a-zA-Z\u4e00-\u9fff]/.test(fullPath)) {
              outgoingRefs.push({ fullPath: resolveToFullPath(fullPath) });
            }
          }
        }
        const hashtagRegex = /#([a-zA-Z\u4e00-\u9fff][\w\u4e00-\u9fff_-]*)/g;
        const matches = node.value.matchAll(hashtagRegex);
        for (const match of matches) {
          const tag = match[1];
          if (tag && tag.length >= 2) {
            tags.add(tag);
          }
        }
        break;
    }
  });
  const references = {
    outgoing: outgoingRefs,
    incoming: []
    // Will be populated by indexing process
  };
  return {
    frontmatter,
    title,
    tags: Array.from(tags),
    references,
    embeddings,
    ast: validAst
  };
}
var DEFAULT_CODE_BLOCK_PLACEHOLDER = "\n\n[code omitted]\n\n";
var CODE_KEYWORD_TOP_N = 6;
var MIN_TOKEN_LEN = 2;
var codeStopwordsSet = null;
function getCodeStopwords() {
  return codeStopwordsSet ?? /* @__PURE__ */ new Set();
}
var IDENT_RE = /[A-Za-z_][A-Za-z0-9_]{1,63}/g;
function parseFenceLang(infoLine) {
  const raw = infoLine.trim().split(/\s+/)[0] ?? "";
  if (!raw) return "unknown";
  const cleaned = raw.replace(/[^a-zA-Z0-9.+#-]/g, "").toLowerCase();
  return cleaned.slice(0, SLICE_CAPS.utils.chunkSlugFallback) || "unknown";
}
function expandIdentifier(id) {
  const withSplits = id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
  return withSplits.split(/[^a-zA-Z0-9_]+/).filter((p) => p.length >= MIN_TOKEN_LEN);
}
function extractCodeKeywordsForIndex(code, topN) {
  const counts = /* @__PURE__ */ new Map();
  let m;
  const re = new RegExp(IDENT_RE.source, "g");
  while ((m = re.exec(code)) !== null) {
    const id = m[0];
    for (const part of expandIdentifier(id)) {
      const w = part.toLowerCase();
      if (w.length < MIN_TOKEN_LEN) continue;
      if (/^\d+$/.test(w)) continue;
      if (getCodeStopwords().has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [w] of ranked) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= topN) break;
  }
  return out;
}
function buildCodeOmittedPlaceholder(infoLine, inner) {
  const lang = parseFenceLang(infoLine);
  const lines = inner.length === 0 ? 0 : inner.split(/\r?\n/).length;
  const chars = inner.length;
  const kw = extractCodeKeywordsForIndex(inner, CODE_KEYWORD_TOP_N);
  const kwPart = kw.length ? ` kw=${kw.join(",")}` : "";
  return `

[code omitted lang=${lang} lines=${lines} chars=${chars}${kwPart}]

`;
}
function replaceFencedCodeBlocks(content, maxKeep, fallbackPlaceholder, useRichOmit) {
  const re = /```([^\n]*)\n([\s\S]*?)```/g;
  return content.replace(re, (_full, infoLine, inner) => {
    if (maxKeep <= 0) {
      return useRichOmit ? buildCodeOmittedPlaceholder(infoLine, inner) : fallbackPlaceholder;
    }
    if (inner.length <= maxKeep) return "```" + infoLine + "\n" + inner + "\n```";
    return "```" + infoLine + "\n" + inner.slice(0, maxKeep) + "\n...\n```";
  });
}
function preprocessMarkdownForChunking(content, settings) {
  const skip = settings.skipCodeBlocksInChunking === true;
  if (!skip) return content;
  const configured = settings.codeBlockPlaceholder;
  const fallbackPlaceholder = configured ?? DEFAULT_CODE_BLOCK_PLACEHOLDER;
  const useRichOmit = configured === void 0 || configured === DEFAULT_CODE_BLOCK_PLACEHOLDER;
  const maxKeep = Math.max(0, settings.maxCodeChunkChars ?? 0);
  return replaceFencedCodeBlocks(content, maxKeep, fallbackPlaceholder, useRichOmit);
}

// src/core/storage/vault/hub-docs/HubDocLlmMarkdown.ts
function hubDocMarkdownBodyForLlm(markdown) {
  const parsed = parseFrontmatter(markdown);
  return parsed ? parsed.body : markdown;
}
function replaceMarkdownH2Section(markdown, title, body, nextTitle) {
  const head = `# ${title}

`;
  const next = `
# ${nextTitle}`;
  const i = markdown.indexOf(head);
  if (i < 0) return markdown;
  const start = i + head.length;
  const j = markdown.indexOf(next, start);
  if (j < 0) return markdown;
  const trimmed = body.trim();
  return markdown.slice(0, start) + trimmed + markdown.slice(j);
}
function formatNumberedFacts(facts) {
  if (!facts.length) return "_No facts extracted._";
  return facts.map((f, idx) => `${idx + 1}. ${f.trim()}`).join("\n");
}
function formatBulletAnchors(phrases) {
  if (!phrases.length) return "_None._";
  return phrases.map((p) => `- ${p.trim()}`).join("\n");
}
function applyHubDocLlmPayloadToMarkdown(markdown, p) {
  let out = markdown;
  out = replaceMarkdownH2Section(out, "Short Summary", p.shortSummary, "Full Summary");
  out = replaceMarkdownH2Section(out, "Full Summary", p.fullSummary, "Topology Routes");
  let coreBlock = formatNumberedFacts(p.coreFacts);
  if (p.keyPatterns?.trim()) {
    coreBlock += `

**Key patterns**

${p.keyPatterns.trim()}`;
  }
  out = replaceMarkdownH2Section(out, "Core Facts", coreBlock, "Tag / Topic Distribution");
  out = replaceMarkdownH2Section(out, "Tag / Topic Distribution", p.tagTopicDistribution, "Time Dimension");
  out = replaceMarkdownH2Section(out, "Time Dimension", p.timeDimension, "Mermaid");
  out = replaceMarkdownH2Section(out, "Query Anchors", formatBulletAnchors(p.queryAnchors), "Source scope");
  return out;
}

// src/core/utils/concurrent-utils.ts
async function mapWithConcurrency(items, limitOrOptions, fn) {
  if (items.length === 0) return [];
  const options = typeof limitOrOptions === "number" ? { limit: limitOrOptions } : limitOrOptions;
  const pool = Math.max(1, Math.min(options.limit, items.length));
  const results = new Array(items.length);
  const timedRows = [];
  const enableTiming = Boolean(options.stopwatch);
  const noopTrace = {
    start() {
    },
    stop() {
    }
  };
  let nextIndex = 0;
  async function worker() {
    for (; ; ) {
      const i = nextIndex++;
      if (i >= items.length) return;
      const item = items[i];
      if (!enableTiming) {
        results[i] = await fn(item, i, noopTrace);
        continue;
      }
      const startedAt = Date.now();
      const steps = [];
      let currentStep = null;
      const closeCurrentStep = () => {
        if (!currentStep) return;
        steps.push({
          label: currentStep.label,
          durationMs: Date.now() - currentStep.startedAt
        });
        currentStep = null;
      };
      const trace = {
        start(label) {
          closeCurrentStep();
          currentStep = { label, startedAt: Date.now() };
        },
        stop() {
          closeCurrentStep();
        }
      };
      try {
        const result = await fn(item, i, trace);
        closeCurrentStep();
        results[i] = result;
        timedRows.push({
          item,
          index: i,
          label: `task.${i + 1}`,
          result,
          totalMs: Date.now() - startedAt,
          steps
        });
      } catch (error) {
        closeCurrentStep();
        throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: pool }, () => worker()));
  if (enableTiming) {
    appendTimingToStopwatch(options.stopwatch, timedRows, options);
  }
  return results;
}
function appendTimingToStopwatch(sw, rows, options) {
  const prefix = sw.getCurrentSegmentLabel() ?? "concurrent";
  const slowestCount = 3;
  const stepMap = /* @__PURE__ */ new Map();
  rows.forEach((row) => {
    sw.addSegmentDetail(`${prefix}.${row.label}.total`, row.totalMs);
    for (const step of row.steps) {
      sw.addSegmentDetail(`${prefix}.${row.label}.step.${step.label}`, step.durationMs);
      const prev = stepMap.get(step.label);
      if (!prev) {
        stepMap.set(step.label, {
          count: 1,
          totalMs: step.durationMs,
          maxMs: step.durationMs
        });
      } else {
        prev.count += 1;
        prev.totalMs += step.durationMs;
        prev.maxMs = Math.max(prev.maxMs, step.durationMs);
      }
    }
  });
  const totalMs = rows.reduce((acc, row) => acc + row.totalMs, 0);
  sw.addSegmentDetail(`${prefix}.summary.task.avg`, rows.length > 0 ? totalMs / rows.length : 0);
  const stepSummaries = [...stepMap.entries()].map(([label, agg]) => ({
    label,
    count: agg.count,
    avgMs: agg.totalMs / agg.count,
    maxMs: agg.maxMs
  })).sort((a, b) => b.avgMs - a.avgMs);
  for (const step of stepSummaries) {
    sw.addSegmentDetail(`${prefix}.summary.step.${step.label}.avg.${step.count}`, step.avgMs);
    sw.addSegmentDetail(`${prefix}.summary.step.${step.label}.max.${step.count}`, step.maxMs);
  }
  [...rows].sort((a, b) => b.totalMs - a.totalMs).slice(0, slowestCount).forEach((row, index) => {
    sw.addSegmentDetail(`${prefix}.summary.slowest.${index + 1} ${row.label}`, row.totalMs);
  });
}

// src/core/utils/Stopwatch.ts
var Stopwatch = class {
  constructor(name = "Stopwatch") {
    this.segments = [];
    this.currentSegment = null;
    this.name = name;
  }
  /**
   * Start a new timing segment with the given label.
   * If a segment is already running, it will be stopped first.
   */
  start(label) {
    if (this.currentSegment) {
      this.stop();
    }
    const startTime = Date.now();
    this.currentSegment = { label, startTime, details: [] };
  }
  /**
   * add to current segment.
   */
  addSegmentDetail(label, duration) {
    if (!this.currentSegment) {
      return;
    }
    this.currentSegment.details?.push({ label, duration });
  }
  /**
   * Stop the current timing segment.
   * If no segment is running, this is a no-op.
   */
  stop() {
    if (!this.currentSegment) {
      return;
    }
    const endTime = Date.now();
    const duration = endTime - this.currentSegment.startTime;
    this.segments.push({
      label: this.currentSegment.label,
      startTime: this.currentSegment.startTime,
      endTime,
      duration,
      details: this.currentSegment.details
    });
    this.currentSegment = null;
  }
  getLastDuration() {
    if (this.segments.length === 0) {
      return 0;
    }
    return this.segments[this.segments.length - 1].duration ?? 0;
  }
  /**
   * Get the current running segment label, if any.
   */
  getCurrentSegmentLabel() {
    return this.currentSegment?.label ?? null;
  }
  /**
   * Get the total elapsed time from the first segment start to now (or last segment end).
   */
  getTotalElapsed() {
    if (this.segments.length === 0) {
      return 0;
    }
    const firstStart = this.segments[0].startTime;
    const lastEnd = this.currentSegment ? Date.now() : this.segments[this.segments.length - 1].endTime ?? Date.now();
    return lastEnd - firstStart;
  }
  /**
   * Print all timing segments to console.
   * Format: [Stopwatch: name] label: duration ms (total: X ms)
   */
  print(debug = true) {
    const total = this.getTotalElapsed();
    const lines = [];
    lines.push(`[${this.name}] Total: ${total.toFixed(2)} ms`);
    for (const segment of this.segments) {
      const duration = segment.duration ?? 0;
      lines.push(`  - ${segment.label}: ${duration.toFixed(2)} ms`);
      if (segment.details) {
        for (const detail of segment.details) {
          lines.push(`    - ${detail.label}: ${detail.duration.toFixed(2)} ms`);
        }
      }
    }
    if (this.currentSegment) {
      const runningDuration = Date.now() - this.currentSegment.startTime;
      lines.push(`  - ${this.currentSegment.label}: ${runningDuration.toFixed(2)} ms (running)`);
      if (this.currentSegment.details) {
        for (const detail of this.currentSegment.details) {
          lines.push(`    - ${detail.label}: ${detail.duration.toFixed(2)} ms`);
        }
      }
    }
    if (debug) {
      console.debug(lines.join("\n"));
    } else {
      console.log(lines.join("\n"));
    }
  }
  /**
   * Get a formatted string with all timing information.
   */
  toString() {
    const total = this.getTotalElapsed();
    const lines = [];
    lines.push(`[${this.name}] Total: ${total.toFixed(2)} ms`);
    for (const segment of this.segments) {
      const duration = segment.duration ?? 0;
      lines.push(`  - ${segment.label}: ${duration.toFixed(2)} ms`);
    }
    if (this.currentSegment) {
      const runningDuration = Date.now() - this.currentSegment.startTime;
      lines.push(`  - ${this.currentSegment.label}: ${runningDuration.toFixed(2)} ms (running)`);
    }
    return lines.join("\n");
  }
  /**
   * Reset the stopwatch, clearing all segments.
   */
  reset() {
    this.segments = [];
    this.currentSegment = null;
  }
};

// src/core/utils/mermaid-utils.ts
var import_mermaid = __toESM(require("mermaid"));
import_mermaid.default.initialize?.({ startOnLoad: false });
function escapeMermaidQuotedLabel(s) {
  return s.replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").slice(0, SLICE_CAPS.utils.mermaidQuotedLabel);
}

// src/service/search/support/segmenter.ts
function stripCombiningMarks(text) {
  try {
    return text.replace(/\p{M}+/gu, "");
  } catch {
    return text;
  }
}
function normalizeForSearch(text) {
  if (!text) return "";
  const normalized = text.normalize("NFKD");
  return stripCombiningMarks(normalized).toLowerCase();
}
function segmentToWhitespace(text, locale) {
  if (!text) return "";
  const input = text.replace(/\s+/g, " ").trim();
  if (!input) return "";
  const Seg = Intl?.Segmenter;
  if (!Seg) return input;
  try {
    const seg = new Seg(locale ? [locale] : void 0, { granularity: "word" });
    const out = [];
    for (const part of seg.segment(input)) {
      const s = String(part.segment ?? "").trim();
      if (!s) continue;
      if (part.isWordLike === false) {
        if (/^\p{P}+$/u.test(s)) continue;
      }
      out.push(s);
    }
    return out.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return input;
  }
}
function normalizeTextForFts(text, locale) {
  return normalizeForSearch(segmentToWhitespace(text, locale));
}
function tokenizePathOrLabel(text, locale) {
  const withSpaces = (text || "").trim().replace(/[-_\s/.[\]]+/g, " ").replace(/\s+/g, " ").trim();
  if (!withSpaces) return [];
  return normalizeTextForFts(withSpaces).split(/\s+/).filter(Boolean);
}
var EN_STOPWORDS = /* @__PURE__ */ new Set(["the", "and"]);
function filterTokensForGraph(tokens) {
  return tokens.filter(
    (t) => t.length >= 2 && !EN_STOPWORDS.has(t.toLowerCase()) && !/^\d+$/.test(t)
  );
}

// src/service/search/index/helper/documentPageRank.ts
var DEFAULT_DAMPING = 0.85;
var DEFAULT_MAX_ITER = 100;
var DEFAULT_TOL = 1e-6;
async function computeVaultPageRankStreaming(nodeIds, outDeg, scanReferenceEdges, options) {
  const d = options?.damping ?? DEFAULT_DAMPING;
  const maxIter = options?.maxIterations ?? DEFAULT_MAX_ITER;
  const tol = options?.tolerance ?? DEFAULT_TOL;
  const n = nodeIds.length;
  if (n === 0) {
    return /* @__PURE__ */ new Map();
  }
  if (outDeg.length !== n) {
    throw new Error("computeVaultPageRankStreaming: outDeg length must match nodeIds");
  }
  const idToIndex = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    idToIndex.set(nodeIds[i], i);
  }
  let r = new Float64Array(n);
  const invN = 1 / n;
  r.fill(invN);
  const base = (1 - d) / n;
  for (let iter = 0; iter < maxIter; iter++) {
    const rNext = new Float64Array(n);
    rNext.fill(base);
    let danglingMass = 0;
    for (let j = 0; j < n; j++) {
      if (outDeg[j] === 0) {
        danglingMass += r[j];
      }
    }
    await scanReferenceEdges((from, to) => {
      const fi = idToIndex.get(from);
      const ti = idToIndex.get(to);
      if (fi === void 0 || ti === void 0) return;
      const deg = outDeg[fi];
      if (deg > 0) {
        rNext[ti] += d * r[fi] / deg;
      }
    }, iter);
    if (danglingMass > 0) {
      const add = d * danglingMass / n;
      for (let i = 0; i < n; i++) {
        rNext[i] += add;
      }
    }
    let diff = 0;
    for (let i = 0; i < n; i++) {
      diff += Math.abs(rNext[i] - r[i]);
    }
    r = rNext;
    if (diff < tol) break;
  }
  const scores = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    scores.set(nodeIds[i], r[i]);
  }
  return scores;
}
async function accumulateSemanticOutgoingWeightSums(nodeIds, scanAllSemanticEdges) {
  const n = nodeIds.length;
  const idToIndex = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    idToIndex.set(nodeIds[i], i);
  }
  const sums = new Float64Array(n);
  await scanAllSemanticEdges((from, to, w) => {
    const fi = idToIndex.get(from);
    const ti = idToIndex.get(to);
    if (fi === void 0 || ti === void 0) return;
    const ww = Number.isFinite(w) && w > 0 ? w : 0;
    if (ww > 0) sums[fi] += ww;
  });
  return sums;
}
async function computeSemanticPageRankStreaming(nodeIds, outgoingWeightSum, scanSemanticEdges, options) {
  const d = options?.damping ?? DEFAULT_DAMPING;
  const maxIter = options?.maxIterations ?? DEFAULT_MAX_ITER;
  const tol = options?.tolerance ?? DEFAULT_TOL;
  const n = nodeIds.length;
  if (n === 0) {
    return /* @__PURE__ */ new Map();
  }
  if (outgoingWeightSum.length !== n) {
    throw new Error("computeSemanticPageRankStreaming: outgoingWeightSum length must match nodeIds");
  }
  const idToIndex = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    idToIndex.set(nodeIds[i], i);
  }
  let r = new Float64Array(n);
  const invN = 1 / n;
  r.fill(invN);
  const base = (1 - d) / n;
  for (let iter = 0; iter < maxIter; iter++) {
    const rNext = new Float64Array(n);
    rNext.fill(base);
    let danglingMass = 0;
    for (let j = 0; j < n; j++) {
      if (outgoingWeightSum[j] <= 0) {
        danglingMass += r[j];
      }
    }
    await scanSemanticEdges((from, to, weight) => {
      const fi = idToIndex.get(from);
      const ti = idToIndex.get(to);
      if (fi === void 0 || ti === void 0) return;
      const sumW = outgoingWeightSum[fi];
      if (sumW <= 0) return;
      const w = Number.isFinite(weight) && weight > 0 ? weight : 0;
      if (w <= 0) return;
      rNext[ti] += d * r[fi] * w / sumW;
    }, iter);
    if (danglingMass > 0) {
      const add = d * danglingMass / n;
      for (let i = 0; i < n; i++) {
        rNext[i] += add;
      }
    }
    let diff = 0;
    for (let i = 0; i < n; i++) {
      diff += Math.abs(rNext[i] - r[i]);
    }
    r = rNext;
    if (diff < tol) break;
  }
  const scores = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    scores.set(nodeIds[i], r[i]);
  }
  return scores;
}

// src/core/document/loader/helper/DocumentLoaderManager.ts
var import_obsidian17 = __toESM(require_obsidian_stub());

// src/service/search/IgnoreService.ts
var import_ignore = __toESM(require("ignore"));
var IgnoreService = class _IgnoreService {
  constructor(ignorePatterns = []) {
    this.patterns = [];
    this.ig = (0, import_ignore.default)();
    this.updateSettings(ignorePatterns);
  }
  static {
    this.instance = null;
  }
  /**
   * Get the global singleton instance.
   * Must be initialized with init() before first use.
   */
  static getInstance() {
    if (!_IgnoreService.instance) {
      throw new Error("IgnoreService not initialized. Call init() first.");
    }
    return _IgnoreService.instance;
  }
  /**
   * Clear the global singleton instance.
   * Call from plugin onunload to release memory.
   */
  static clearInstance() {
    _IgnoreService.instance = null;
  }
  /**
   * Initialize the global singleton instance.
   * Should be called once during plugin initialization.
   */
  static init(ignorePatterns = []) {
    if (_IgnoreService.instance) {
      console.warn("IgnoreService already initialized. Reinitializing with new patterns.");
    }
    _IgnoreService.instance = new _IgnoreService(ignorePatterns);
    return _IgnoreService.instance;
  }
  /**
   * Update ignore patterns and reload the service.
   * Should be called when ignore patterns are updated.
   */
  updateSettings(ignorePatterns) {
    this.patterns = ignorePatterns;
    this.ig = (0, import_ignore.default)();
    if (ignorePatterns && ignorePatterns.length > 0) {
      this.ig.add(ignorePatterns);
    }
  }
  /**
   * Check if a path should be ignored.
   * @param path Relative path to check (should be relative to vault root)
   * @returns true if the path should be ignored, false otherwise
   */
  shouldIgnore(path3) {
    const normalizedPath = path3.replace(/\\/g, "/");
    const cleanPath = normalizedPath.startsWith("/") ? normalizedPath.slice(1) : normalizedPath;
    return this.ig.ignores(cleanPath);
  }
  /**
   * Filter an array of paths, removing ignored ones.
   * @param paths Array of relative paths to filter
   * @returns Array of paths that are not ignored
   */
  filterPaths(paths) {
    return this.ig.filter(paths);
  }
  /**
   * Get the current ignore patterns.
   * @returns Array of current ignore patterns
   */
  getPatterns() {
    return this.patterns;
  }
  /**
   * Test ignore functionality with detailed result.
   * @param path Path to test
   * @returns Test result with ignore status and rule information
   */
  test(path3) {
    const normalizedPath = path3.replace(/\\/g, "/");
    const cleanPath = normalizedPath.startsWith("/") ? normalizedPath.slice(1) : normalizedPath;
    return this.ig.test(cleanPath);
  }
};

// src/core/document/loader/MarkdownDocumentLoader.ts
var import_obsidian5 = __toESM(require_obsidian_stub());
var import_textsplitters = require("@langchain/textsplitters");

// src/core/document/loader/helper/DocumentLoaderHelpers.ts
function resolveTextrankContext(document, options) {
  const custom = document.metadata?.custom;
  let kw = options?.textrankKeywords;
  if (kw === void 0 && custom) {
    if (typeof custom.textrankKeywords === "string") {
      kw = custom.textrankKeywords;
    } else if (Array.isArray(custom.textrankKeywordsStructured) && custom.textrankKeywordsStructured.length) {
      kw = custom.textrankKeywordsStructured.map((t) => t.term).join(", ");
    }
  }
  kw = kw ?? "";
  let sent = options?.textrankSentences;
  if (sent === void 0 && custom) {
    if (typeof custom.textrankSentences === "string") {
      sent = custom.textrankSentences;
    } else if (Array.isArray(custom.textrankSentencesStructured) && custom.textrankSentencesStructured.length) {
      const arr = custom.textrankSentencesStructured;
      sent = arr.map((s, i) => `${i + 1}. ${s.text}`).join("\n");
    }
  }
  sent = sent ?? "";
  return { textrankKeywords: kw, textrankSentences: sent };
}
async function getDefaultDocumentSummary(doc, aiServiceManager, provider, modelId, options) {
  if (!aiServiceManager) {
    throw new Error("getDefaultDocumentSummary requires AIServiceManager to generate summaries");
  }
  let document;
  if (typeof doc === "string") {
    document = {
      cacheFileInfo: {
        content: doc
      },
      sourceFileInfo: {
        content: doc
      },
      metadata: {
        title: "",
        topicTags: [],
        functionalTagEntries: [],
        keywordTags: []
      }
    };
  } else {
    document = doc;
  }
  const content = document.cacheFileInfo.content || document.sourceFileInfo.content;
  const title = document.metadata.title || document.sourceFileInfo.name;
  const path3 = document.sourceFileInfo.path;
  const search = AppContext.getInstance().settings.search;
  const shortW = options?.shortWordCount ?? search.shortSummaryLength;
  const fullW = options?.fullWordCount ?? search.fullSummaryLength;
  const mode = options?.mode ?? "short_then_full_if_long";
  const { textrankKeywords, textrankSentences } = resolveTextrankContext(document, options);
  const shortVars = {
    content,
    title,
    path: path3,
    maxWords: String(shortW),
    ...textrankKeywords.trim() ? { textrankKeywords } : {},
    ...textrankSentences.trim() ? { textrankSentences } : {}
  };
  const fullVarsBase = {
    content,
    title,
    path: path3,
    targetWords: String(fullW),
    ...textrankKeywords.trim() ? { textrankKeywords } : {},
    ...textrankSentences.trim() ? { textrankSentences } : {}
  };
  const needFull = mode === "short_then_full_if_long" && content.length > search.fullSummaryLength;
  const [shortSummary, fullSummary] = await Promise.all([
    aiServiceManager.chatWithPrompt("doc-summary-short" /* DocSummaryShort */, shortVars, provider, modelId),
    needFull ? aiServiceManager.chatWithPrompt("doc-summary-full" /* DocSummaryFull */, fullVarsBase, provider, modelId) : Promise.resolve(void 0)
  ]);
  return { shortSummary, fullSummary };
}

// src/core/document/loader/helper/textRank.ts
var EMPTY_TEXTRANK_RESULT = {
  topTerms: [],
  topSentences: []
};
var DEFAULT_OPTS = {
  maxContentChars: 12e4,
  wordWindow: 4,
  maxTerms: 20,
  maxSentences: 8,
  maxSentencesInGraph: 80,
  damping: 0.85,
  iterations: 40,
  minWordLength: 2
};
var STOP = new Set(
  `the a an and or but if in on at to for of as is are was were be been being it its this that these those with from by not no
		i you he she they we our their my your what which who whom when where why how all each both than then so too very can could
		will would should may might must shall do does did done having have has had
	`.split(/\s+/).filter(Boolean)
);
function stripForTextRank(markdown) {
  let s = markdown.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`[^`\n]+`/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
function tokenizeForTextRank(text, minWordLength) {
  const lower = text.toLowerCase();
  const out = [];
  const re = new RegExp(`[a-z]{${minWordLength},}|[\\u4e00-\\u9fff]`, "g");
  let m;
  while ((m = re.exec(lower)) !== null) {
    const t = m[0];
    if (/^[a-z]+$/.test(t) && STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}
function buildWordGraph(tokens, windowSize) {
  const adj = /* @__PURE__ */ new Map();
  const addEdge = (a, b) => {
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    if (!adj.has(x)) adj.set(x, /* @__PURE__ */ new Map());
    if (!adj.has(y)) adj.set(y, /* @__PURE__ */ new Map());
    const mx = adj.get(x);
    const my = adj.get(y);
    mx.set(y, (mx.get(y) ?? 0) + 1);
    my.set(x, (my.get(x) ?? 0) + 1);
  };
  for (let i = 0; i < tokens.length; i++) {
    const end = Math.min(i + windowSize, tokens.length);
    for (let j = i + 1; j < end; j++) {
      addEdge(tokens[i], tokens[j]);
    }
  }
  return adj;
}
function outWeightSum(node, adj) {
  const m = adj.get(node);
  if (!m) return 0;
  let s = 0;
  for (const w of m.values()) s += w;
  return s;
}
function pageRankWeighted(nodes, adj, options) {
  const n = nodes.length;
  if (n === 0) return /* @__PURE__ */ new Map();
  const nodeSet = new Set(nodes);
  let scores = /* @__PURE__ */ new Map();
  const init = 1 / n;
  for (const v of nodes) scores.set(v, init);
  for (let it = 0; it < options.iterations; it++) {
    const next = /* @__PURE__ */ new Map();
    for (const vi of nodes) {
      let sum = 0;
      const neighbors = adj.get(vi);
      if (neighbors) {
        for (const [j, wji] of neighbors) {
          if (!nodeSet.has(j)) continue;
          const outJ = outWeightSum(j, adj);
          if (outJ <= 0) continue;
          const sj = scores.get(j) ?? 0;
          sum += wji / outJ * sj;
        }
      }
      const val = (1 - options.damping) / n + options.damping * sum;
      next.set(vi, val);
    }
    scores = next;
  }
  return scores;
}
function splitSentences(text) {
  const parts = text.split(/(?<=[.!?。！？])\s+|\n+/);
  const out = [];
  for (const p of parts) {
    const t = p.trim().replace(/\s+/g, " ");
    if (t.length >= 12) out.push(t);
  }
  return out;
}
function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter++;
  }
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}
function buildSentenceGraph(sentences, tokenize) {
  const adj = /* @__PURE__ */ new Map();
  const sets = sentences.map((s) => new Set(tokenize(s)));
  const n = sentences.length;
  const addEdge = (i, j, w) => {
    if (i === j || w <= 0) return;
    const a = String(i);
    const b = String(j);
    if (!adj.has(a)) adj.set(a, /* @__PURE__ */ new Map());
    if (!adj.has(b)) adj.set(b, /* @__PURE__ */ new Map());
    const ma = adj.get(a);
    const mb = adj.get(b);
    const cur = ma.get(b) ?? 0;
    ma.set(b, cur + w);
    mb.set(a, cur + w);
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = jaccard(sets[i], sets[j]);
      if (sim > 0) addEdge(i, j, sim);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    addEdge(i, i + 1, 0.05);
  }
  return adj;
}
function sentenceNodeIds(n) {
  return Array.from({ length: n }, (_, i) => String(i));
}
function extractTextRankFeatures(rawText, options) {
  const o = { ...DEFAULT_OPTS, ...options };
  let text = stripForTextRank(rawText);
  if (text.length > o.maxContentChars) {
    text = text.slice(0, o.maxContentChars);
  }
  const tokens = tokenizeForTextRank(text, o.minWordLength);
  if (tokens.length === 0) {
    return { topTerms: [], topSentences: [] };
  }
  const wordAdj = buildWordGraph(tokens, o.wordWindow);
  const vocab = [...new Set(tokens)];
  const wordScores = pageRankWeighted(vocab, wordAdj, { damping: o.damping, iterations: o.iterations });
  const topTerms = [...wordScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, o.maxTerms).map(([term, score]) => ({ term, score }));
  let sentences = splitSentences(text);
  if (sentences.length > o.maxSentencesInGraph) {
    sentences = sentences.slice(0, o.maxSentencesInGraph);
  }
  const tok = (s) => tokenizeForTextRank(s, o.minWordLength);
  if (sentences.length < 2) {
    const one = sentences[0];
    return {
      topTerms,
      topSentences: one ? [{ text: one, score: 1, index: 0 }] : []
    };
  }
  const sentAdj = buildSentenceGraph(sentences, tok);
  const sentIds = sentenceNodeIds(sentences.length);
  const sentScores = pageRankWeighted(sentIds, sentAdj, { damping: o.damping, iterations: o.iterations });
  const topSentences = [...sentScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, o.maxSentences).map(([id, score]) => ({
    text: sentences[Number(id)] ?? "",
    score,
    index: Number(id)
  })).filter((x) => x.text.length > 0);
  return { topTerms, topSentences };
}
var KEYWORD_TAGS_MAX_TOTAL = 40;
var KEYWORD_TAGS_MAX_TEXTRANK = 20;
function computeKeywordTagBundles(userTags, topTerms) {
  const seen = /* @__PURE__ */ new Set();
  const lower = (s) => s.toLowerCase();
  const mergedKeywordTags = [];
  for (const u of userTags) {
    const k = lower(u);
    if (seen.has(k)) continue;
    seen.add(k);
    mergedKeywordTags.push(u);
  }
  const userKeywordTags = [...mergedKeywordTags];
  const textrankKeywordTerms = [];
  let trAdded = 0;
  for (const { term } of topTerms) {
    if (mergedKeywordTags.length >= KEYWORD_TAGS_MAX_TOTAL) break;
    const k = lower(term);
    if (seen.has(k)) continue;
    seen.add(k);
    mergedKeywordTags.push(term);
    textrankKeywordTerms.push(term);
    trAdded++;
    if (trAdded >= KEYWORD_TAGS_MAX_TEXTRANK) break;
  }
  return { userKeywordTags, textrankKeywordTerms, mergedKeywordTags };
}

// src/core/document/loader/helper/assembleIndexedChunks.ts
function assembleIndexedChunks(doc, bodyChunks) {
  const out = bodyChunks.map((c, i) => ({
    ...c,
    chunkType: c.chunkType ?? "body_raw",
    chunkIndex: c.chunkIndex ?? i
  }));
  let idx = out.length;
  const short = doc.summary?.trim();
  if (short) {
    out.push({
      docId: doc.id,
      chunkType: "summary_short",
      content: short,
      chunkId: generateUuidWithoutHyphens(),
      chunkIndex: idx++,
      title: "Short summary",
      chunkMeta: { summarySource: "llm" }
    });
  }
  const full = doc.fullSummary?.trim();
  if (full) {
    out.push({
      docId: doc.id,
      chunkType: "summary_full",
      content: full,
      chunkId: generateUuidWithoutHyphens(),
      chunkIndex: idx++,
      title: "Full summary",
      chunkMeta: { summarySource: "llm" }
    });
  }
  const structured = doc.metadata?.custom?.textrankSentencesStructured;
  if (Array.isArray(structured) && structured.length) {
    const top = structured.slice(0, SLICE_CAPS.indexing.structuredChunkTop);
    for (const s of top) {
      const t = s.text?.trim();
      if (!t) continue;
      out.push({
        docId: doc.id,
        chunkType: "salient_textrank_sentence",
        content: t,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: idx++,
        chunkMeta: { textrankScore: s.score, textrankIndex: s.index }
      });
    }
  }
  return out;
}

// src/core/document/loader/MarkdownDocumentLoader.ts
var MarkdownDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
  }
  getDocumentType() {
    return "markdown";
  }
  getSupportedExtensions() {
    return ["md", "markdown"];
  }
  /**
   * Read a markdown document by its path.
   * Returns core Document model.
   */
  async readByPath(path3, genCacheContent) {
    const file = this.app.vault.getAbstractFileByPath(path3);
    if (!file || !(file instanceof import_obsidian5.TFile)) return null;
    if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
    return await this.readMarkdownFile(file, genCacheContent);
  }
  /**
   * Splits markdown body with RecursiveCharacterTextSplitter, then appends summary / TextRank chunks for indexing.
   */
  async chunkContent(doc, settings) {
    let content = doc.sourceFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(doc, [{
        docId: doc.id,
        chunkType: "body_raw",
        content
      }]);
    }
    content = preprocessMarkdownForChunking(content, settings);
    const splitter = import_textsplitters.RecursiveCharacterTextSplitter.fromLanguage("markdown", {
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = [];
    for (let i = 0; i < langchainDocs.length; i++) {
      const langchainDoc = langchainDocs[i];
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: langchainDoc.pageContent,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: i
      });
    }
    return assembleIndexedChunks(doc, chunks);
  }
  /**
   * Scan markdown documents metadata without loading content.
   * Returns lightweight metadata: path, mtime, type.
   */
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const supportedExts = this.getSupportedExtensions();
    const files = this.app.vault.getFiles().filter((f) => supportedExts.includes(f.extension.toLowerCase())).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "markdown"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  /**
   * Read a markdown file and convert to core Document model.
   */
  async readMarkdownFile(file, genCacheContent) {
    try {
      const content = await this.app.vault.cachedRead(file);
      const contentHash = generateContentHash(content);
      const parseResult = await parseMarkdownWithRemark(content, {
        resolveWikiLinkToPath: (linkText) => {
          const dest = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
          return dest?.path ?? null;
        }
      });
      let title = parseResult.title || file.basename;
      const userKeywordTags = [...new Set(parseResult.tags.map((t) => String(t).trim()).filter(Boolean))];
      let mergedKeywordTags = userKeywordTags;
      let textrankKeywordTerms = [];
      let textRankSnapshot = EMPTY_TEXTRANK_RESULT;
      if (!genCacheContent) {
        textRankSnapshot = extractTextRankFeatures(content);
        const bundles = computeKeywordTagBundles(userKeywordTags, textRankSnapshot.topTerms);
        mergedKeywordTags = bundles.mergedKeywordTags;
        textrankKeywordTerms = bundles.textrankKeywordTerms;
      }
      const textrankKeywordsStructured = textRankSnapshot.topTerms.map(({ term, score }) => ({ term, score }));
      const textrankSentencesStructured = textRankSnapshot.topSentences.map((s) => ({
        text: s.text,
        score: s.score,
        index: s.index
      }));
      const textrankKeywordsForLlm = textrankKeywordsStructured.map((t) => t.term).join(", ");
      const textrankSentencesForLlm = textrankSentencesStructured.length ? textrankSentencesStructured.map((s, i) => `${i + 1}. ${s.text}`).join("\n") : "";
      const summaryDocStub = {
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title,
          topicTags: [],
          topicTagEntries: [],
          functionalTagEntries: [],
          keywordTags: mergedKeywordTags,
          userKeywordTags,
          ...textrankKeywordTerms.length ? { textrankKeywordTerms } : {},
          custom: {
            textrankKeywordsStructured,
            textrankSentencesStructured
          }
        }
      };
      const [tagRes, summaryContent] = await Promise.all([
        this.aiServiceManager && !genCacheContent ? extractTopicAndFunctionalTags(content, this.aiServiceManager, {
          title,
          existingUserTags: userKeywordTags.length ? userKeywordTags.join(", ") : void 0,
          textrankKeywords: textrankKeywordsForLlm || void 0,
          textrankSentences: textrankSentencesForLlm || void 0
        }).catch((err) => {
          console.warn("[MarkdownDocumentLoader] extractTopicAndFunctionalTags failed:", err);
          return {
            topicTagEntries: [],
            topicTags: [],
            functionalTagEntries: [],
            timeTags: [],
            geoTags: [],
            personTags: []
          };
        }) : Promise.resolve({
          topicTagEntries: [],
          topicTags: [],
          functionalTagEntries: [],
          timeTags: [],
          geoTags: [],
          personTags: []
        }),
        genCacheContent || !this.aiServiceManager ? Promise.resolve({ shortSummary: "", fullSummary: void 0 }) : getDefaultDocumentSummary(summaryDocStub, this.aiServiceManager)
      ]);
      return {
        id: generateDocIdFromPath(file.path),
        type: "markdown",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title,
          topicTags: tagRes.topicTags,
          topicTagEntries: tagRes.topicTagEntries.length ? tagRes.topicTagEntries : void 0,
          functionalTagEntries: tagRes.functionalTagEntries,
          keywordTags: mergedKeywordTags,
          userKeywordTags,
          ...textrankKeywordTerms.length ? { textrankKeywordTerms } : {},
          timeTags: tagRes.timeTags,
          geoTags: tagRes.geoTags,
          personTags: tagRes.personTags,
          inferCreatedAt: tagRes.inferCreatedAtMs ?? null,
          frontmatter: parseResult.frontmatter ? { ...parseResult.frontmatter } : void 0,
          custom: {
            textrankKeywordsStructured,
            textrankSentencesStructured
          }
        },
        summary: summaryContent.shortSummary?.trim() ? summaryContent.shortSummary : null,
        fullSummary: summaryContent.fullSummary ?? null,
        contentHash,
        references: parseResult.references,
        lastProcessedAt: Date.now()
      };
    } catch (error) {
      console.error("Error reading markdown file:", error);
      return null;
    }
  }
  /**
   * Get summary for a markdown document
   * // todo implement getSummary. many types: raw knowledge base markdown, conv and project markdown, resources markdown
   */
  async getSummary(source, provider, modelId) {
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
};

// src/core/document/loader/TextDocumentLoader.ts
var import_obsidian6 = __toESM(require_obsidian_stub());
var import_textsplitters2 = require("@langchain/textsplitters");
var TextDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
  }
  getDocumentType() {
    return "txt";
  }
  getSupportedExtensions() {
    return ["txt"];
  }
  async readByPath(path3) {
    const file = this.app.vault.getAbstractFileByPath(path3);
    if (!file || !(file instanceof import_obsidian6.TFile)) return null;
    if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
    return await this.readTextFile(file);
  }
  async chunkContent(doc, settings) {
    const content = doc.sourceFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(doc, [{
        docId: doc.id,
        chunkType: "body_raw",
        content
      }]);
    }
    const splitter = new import_textsplitters2.RecursiveCharacterTextSplitter({
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = [];
    for (let i = 0; i < langchainDocs.length; i++) {
      const langchainDoc = langchainDocs[i];
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: langchainDoc.pageContent,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: i
      });
    }
    return assembleIndexedChunks(doc, chunks);
  }
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const supportedExts = this.getSupportedExtensions();
    const files = this.app.vault.getFiles().filter((f) => supportedExts.includes(f.extension.toLowerCase())).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "txt"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  /**
   * Get summary for a text document
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("TextDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("TextDocumentLoader.getSummary requires a Document, not a string");
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
  async readTextFile(file) {
    try {
      const content = await this.app.vault.cachedRead(file);
      const contentHash = generateContentHash(content);
      return {
        id: generateDocIdFromPath(file.path),
        type: "txt",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/TableDocumentLoader.ts
var import_obsidian7 = __toESM(require_obsidian_stub());
var TableDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
  }
  getDocumentType() {
    return "csv";
  }
  getSupportedExtensions() {
    return ["csv", "xlsx"];
  }
  async readByPath(path3) {
    const file = this.app.vault.getAbstractFileByPath(path3);
    if (!file || !(file instanceof import_obsidian7.TFile)) return null;
    if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
    return await this.readTableFile(file);
  }
  async chunkContent(doc, settings) {
    const content = doc.sourceFileInfo.content;
    const rows = content.split("\n").filter((row) => row.trim().length > 0);
    const maxChunkSize = settings.maxChunkSize;
    const overlap = settings.chunkOverlap;
    const chunks = [];
    let chunkIndex = 0;
    for (const row of rows) {
      if (row.length <= maxChunkSize) {
        chunks.push({
          docId: doc.id,
          chunkType: "body_raw",
          content: row,
          chunkId: generateUuidWithoutHyphens(),
          chunkIndex: chunkIndex++
        });
      } else {
        let start = 0;
        while (start < row.length) {
          const end = Math.min(start + maxChunkSize, row.length);
          const chunkContent = row.substring(start, end);
          chunks.push({
            docId: doc.id,
            chunkType: "body_raw",
            content: chunkContent,
            chunkId: generateUuidWithoutHyphens(),
            chunkIndex: chunkIndex++
          });
          start = end - overlap;
          if (start >= row.length) break;
        }
      }
    }
    return assembleIndexedChunks(doc, chunks);
  }
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const supportedExts = this.getSupportedExtensions();
    const files = this.app.vault.getFiles().filter((f) => supportedExts.includes(f.extension.toLowerCase())).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "csv"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  /**
   * Get summary for a table document (CSV/XLSX)
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("TableDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("TableDocumentLoader.getSummary requires a Document, not a string");
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
  async readTableFile(file) {
    try {
      let content = "";
      const ext = file.extension.toLowerCase();
      const supportedExts = this.getSupportedExtensions();
      if (ext === "csv") {
        content = await this.app.vault.cachedRead(file);
      } else if (supportedExts.includes("xlsx") && ext === "xlsx") {
        return null;
      }
      const contentHash = generateContentHash(content);
      return {
        id: generateDocIdFromPath(file.path),
        type: "csv",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/JsonDocumentLoader.ts
var import_obsidian8 = __toESM(require_obsidian_stub());
var import_textsplitters3 = require("@langchain/textsplitters");
var JsonDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
  }
  getDocumentType() {
    return "json";
  }
  getSupportedExtensions() {
    return ["json"];
  }
  async readByPath(path3) {
    const file = this.app.vault.getAbstractFileByPath(path3);
    if (!file || !(file instanceof import_obsidian8.TFile)) return null;
    if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
    return await this.readJsonFile(file);
  }
  async chunkContent(doc, settings) {
    const content = doc.sourceFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        const chunks2 = [];
        for (let i = 0; i < parsed.length; i++) {
          const itemContent = JSON.stringify(parsed[i], null, 2);
          chunks2.push({
            docId: doc.id,
            chunkType: "body_raw",
            content: itemContent,
            chunkId: generateUuidWithoutHyphens(),
            chunkIndex: i
          });
        }
        return assembleIndexedChunks(doc, chunks2);
      }
      if (content.length <= minSize) {
        return assembleIndexedChunks(doc, [{
          docId: doc.id,
          chunkType: "body_raw",
          content
        }]);
      }
      const splitter = new import_textsplitters3.RecursiveCharacterTextSplitter({
        chunkSize: settings.maxChunkSize,
        chunkOverlap: settings.chunkOverlap
      });
      const langchainDocs = await splitter.createDocuments([content]);
      const chunks = [];
      for (let i = 0; i < langchainDocs.length; i++) {
        const langchainDoc = langchainDocs[i];
        chunks.push({
          docId: doc.id,
          chunkType: "body_raw",
          content: langchainDoc.pageContent,
          chunkId: generateUuidWithoutHyphens(),
          chunkIndex: i
        });
      }
      return assembleIndexedChunks(doc, chunks);
    } catch {
      if (content.length <= minSize) {
        return assembleIndexedChunks(doc, [{
          docId: doc.id,
          chunkType: "body_raw",
          content
        }]);
      }
      const splitter = new import_textsplitters3.RecursiveCharacterTextSplitter({
        chunkSize: settings.maxChunkSize,
        chunkOverlap: settings.chunkOverlap
      });
      const langchainDocs = await splitter.createDocuments([content]);
      const chunks = [];
      for (let i = 0; i < langchainDocs.length; i++) {
        const langchainDoc = langchainDocs[i];
        chunks.push({
          docId: doc.id,
          chunkType: "body_raw",
          content: langchainDoc.pageContent,
          chunkId: generateUuidWithoutHyphens(),
          chunkIndex: i
        });
      }
      return assembleIndexedChunks(doc, chunks);
    }
  }
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const supportedExts = this.getSupportedExtensions();
    const files = this.app.vault.getFiles().filter((f) => supportedExts.includes(f.extension.toLowerCase())).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "json"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  /**
   * Get summary for a JSON document
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("JsonDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("JsonDocumentLoader.getSummary requires a Document, not a string");
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
  async readJsonFile(file) {
    try {
      const content = await this.app.vault.cachedRead(file);
      const contentHash = generateContentHash(content);
      return {
        id: generateDocIdFromPath(file.path),
        type: "json",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/HtmlXmlDocumentLoader.ts
var import_obsidian9 = __toESM(require_obsidian_stub());
var HtmlXmlDocumentLoader = class _HtmlXmlDocumentLoader {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
    const tagsPattern = _HtmlXmlDocumentLoader.MEANINGFUL_TAGS.join("|");
    this.tagPattern = new RegExp(`(<(?:${tagsPattern})[^>]*>)([\\s\\S]*?)(</(?:${tagsPattern})>)`, "gi");
  }
  static {
    this.MEANINGFUL_TAGS = ["div", "section", "article", "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th"];
  }
  getDocumentType() {
    return "html";
  }
  getSupportedExtensions() {
    return ["html", "htm", "xml"];
  }
  async readByPath(path3) {
    const file = this.app.vault.getAbstractFileByPath(path3);
    if (!file || !(file instanceof import_obsidian9.TFile)) return null;
    if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
    return await this.readHtmlXmlFile(file);
  }
  async chunkContent(doc, settings) {
    const content = doc.sourceFileInfo.content;
    const maxChunkSize = settings.maxChunkSize;
    const overlap = settings.chunkOverlap;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(doc, [{
        docId: doc.id,
        chunkType: "body_raw",
        content
      }]);
    }
    const chunks = [];
    let chunkIndex = 0;
    const segments = [];
    let lastIndex = 0;
    let match;
    this.tagPattern.lastIndex = 0;
    while ((match = this.tagPattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const beforeText = content.substring(lastIndex, match.index);
        if (beforeText.trim()) {
          segments.push(beforeText.trim());
        }
      }
      const tagContent = match[2]?.trim();
      if (tagContent) {
        segments.push(tagContent);
      }
      lastIndex = this.tagPattern.lastIndex;
    }
    if (lastIndex < content.length) {
      const remaining = content.substring(lastIndex).trim();
      if (remaining) {
        segments.push(remaining);
      }
    }
    if (segments.length === 0) {
      let start = 0;
      while (start < content.length) {
        const end = Math.min(start + maxChunkSize, content.length);
        const chunkContent = content.substring(start, end);
        chunks.push({
          docId: doc.id,
          chunkType: "body_raw",
          content: chunkContent,
          chunkId: generateUuidWithoutHyphens(),
          chunkIndex: chunkIndex++
        });
        start = end - overlap;
        if (start >= content.length) break;
      }
      return assembleIndexedChunks(doc, chunks);
    }
    let currentChunk = "";
    for (const segment of segments) {
      if (segment.length > maxChunkSize) {
        if (currentChunk.length > 0) {
          chunks.push({
            docId: doc.id,
            chunkType: "body_raw",
            content: currentChunk,
            chunkId: generateUuidWithoutHyphens(),
            chunkIndex: chunkIndex++
          });
          currentChunk = "";
        }
        let segStart = 0;
        while (segStart < segment.length) {
          const segEnd = Math.min(segStart + maxChunkSize, segment.length);
          const chunkContent = segment.substring(segStart, segEnd);
          chunks.push({
            docId: doc.id,
            chunkType: "body_raw",
            content: chunkContent,
            chunkId: generateUuidWithoutHyphens(),
            chunkIndex: chunkIndex++
          });
          segStart = segEnd - overlap;
          if (segStart >= segment.length) break;
        }
      } else if (currentChunk.length + segment.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push({
          docId: doc.id,
          chunkType: "body_raw",
          content: currentChunk,
          chunkId: generateUuidWithoutHyphens(),
          chunkIndex: chunkIndex++
        });
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + "\n" + segment;
      } else {
        currentChunk += (currentChunk ? "\n" : "") + segment;
      }
    }
    if (currentChunk.length > 0) {
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: currentChunk,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: chunkIndex++
      });
    }
    return assembleIndexedChunks(doc, chunks);
  }
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const supportedExts = this.getSupportedExtensions();
    const files = this.app.vault.getFiles().filter((f) => supportedExts.includes(f.extension.toLowerCase())).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "html"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  /**
   * Get summary for an HTML/XML document
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("HtmlXmlDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("HtmlXmlDocumentLoader.getSummary requires a Document, not a string");
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
  async readHtmlXmlFile(file) {
    try {
      const content = await this.app.vault.cachedRead(file);
      const contentHash = generateContentHash(content);
      return {
        id: generateDocIdFromPath(file.path),
        type: "html",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/PdfDocumentLoader.ts
var import_obsidian10 = __toESM(require_obsidian_stub());
var import_textsplitters4 = require("@langchain/textsplitters");
var PDFJS_CDN_VERSION = "5.4.394";
var PDF_JS_DOC_OPTIONS = {
  standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_CDN_VERSION}/standard_fonts/`,
  cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_CDN_VERSION}/cmaps/`,
  cMapPacked: true
};
var pdfWorkerSrcConfigured = false;
function ensurePdfWorkerSrc() {
  if (pdfWorkerSrcConfigured) return;
  try {
    const pdfjs = require("pdfjs-dist");
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_CDN_VERSION}/build/pdf.worker.mjs`;
      pdfWorkerSrcConfigured = true;
    }
  } catch (e) {
    console.warn("[PdfDocumentLoader] pdfjs-dist not available (external); PDF text extraction will fail.", e);
  }
}
async function extractTextFromPdfBuffer(arrayBuffer) {
  ensurePdfWorkerSrc();
  const pdfjs = require("pdfjs-dist");
  const uint8Array = new Uint8Array(arrayBuffer);
  const loadingOptions = {
    data: uint8Array,
    ...PDF_JS_DOC_OPTIONS
  };
  const loadingTask = pdfjs.getDocument(loadingOptions);
  try {
    const pdfDocument = await loadingTask.promise;
    const pageTexts = [];
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      try {
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str ?? "").join(" ");
        pageTexts.push(pageText);
      } finally {
        if (typeof page.cleanup === "function") page.cleanup();
      }
    }
    if (typeof pdfDocument.cleanup === "function") pdfDocument.cleanup();
    return pageTexts.join("\n\n");
  } finally {
    if (typeof loadingTask.destroy === "function") loadingTask.destroy();
  }
}
var PdfDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
  }
  getDocumentType() {
    return "pdf";
  }
  getSupportedExtensions() {
    return ["pdf"];
  }
  async readByPath(filePath, genCacheContent) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof import_obsidian10.TFile)) return null;
    if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
    return await this.readPdfFile(file, genCacheContent);
  }
  async chunkContent(doc, settings) {
    const content = doc.cacheFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(doc, [{
        docId: doc.id,
        chunkType: "body_raw",
        content
      }]);
    }
    const splitter = new import_textsplitters4.RecursiveCharacterTextSplitter({
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = [];
    for (let i = 0; i < langchainDocs.length; i++) {
      const langchainDoc = langchainDocs[i];
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: langchainDoc.pageContent,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: i
      });
    }
    return assembleIndexedChunks(doc, chunks);
  }
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const supportedExts = this.getSupportedExtensions();
    const files = this.app.vault.getFiles().filter((f) => supportedExts.includes(f.extension.toLowerCase())).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "pdf"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("PdfDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("PdfDocumentLoader.getSummary requires a Document, not a string");
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
  async readPdfFile(file, genCacheContent) {
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const sourceContentHash = binaryContentHash(arrayBuffer);
      let cacheContent = "";
      if (genCacheContent) {
        cacheContent = await extractTextFromPdfBuffer(arrayBuffer);
      }
      return {
        id: generateDocIdFromPath(file.path),
        type: "pdf",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: ""
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: cacheContent
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash: sourceContentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch (error) {
      console.error("[PdfDocumentLoader] error reading PDF file:", file.path, error);
      return null;
    }
  }
};

// src/core/document/loader/ImageDocumentLoader.ts
var import_obsidian11 = __toESM(require_obsidian_stub());
var import_textsplitters5 = require("@langchain/textsplitters");
var ImageDocumentLoader = class {
  constructor(app, settings, aiServiceManager) {
    this.app = app;
    this.settings = settings;
    this.aiServiceManager = aiServiceManager;
  }
  getDocumentType() {
    return "image";
  }
  getSupportedExtensions() {
    return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
  }
  async readByPath(filePath, genCacheContent) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof import_obsidian11.TFile)) return null;
    const ext = file.extension.toLowerCase();
    if (!this.getSupportedExtensions().includes(ext)) return null;
    return await this.readImageFile(file, genCacheContent);
  }
  async chunkContent(doc, settings) {
    const content = doc.cacheFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(doc, [{
        docId: doc.id,
        chunkType: "body_raw",
        content
      }]);
    }
    const splitter = new import_textsplitters5.RecursiveCharacterTextSplitter({
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = [];
    for (let i = 0; i < langchainDocs.length; i++) {
      const langchainDoc = langchainDocs[i];
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: langchainDoc.pageContent,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: i
      });
    }
    return assembleIndexedChunks(doc, chunks);
  }
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const supportedExts = this.getSupportedExtensions();
    const files = this.app.vault.getFiles().filter((f) => supportedExts.includes(f.extension.toLowerCase())).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "image"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  /**
   * Get summary for an image document
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("ImageDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("ImageDocumentLoader.getSummary requires a Document, not a string");
    }
    const doc = source;
    const content = doc.cacheFileInfo.content;
    const title = doc.metadata.title || doc.sourceFileInfo.name;
    const path3 = doc.sourceFileInfo.path;
    const shortSummary = await this.aiServiceManager.chatWithPrompt(
      "image-summary" /* ImageSummary */,
      { content, title, path: path3 },
      provider,
      modelId
    );
    return { shortSummary, fullSummary: shortSummary };
  }
  async readImageFile(file, genCacheContent) {
    try {
      if (genCacheContent) {
        console.debug("[ImageDocumentLoader] reading image file:", file.path, "genCacheContent:", genCacheContent);
      }
      const realContent = await this.app.vault.readBinary(file);
      const realContentHash = binaryContentHash(realContent);
      const cacheContent = genCacheContent ? await this.generateImageDescription(file) : "";
      return {
        id: generateDocIdFromPath(file.path),
        type: "image",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: ""
          // Image has no text content in source
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: cacheContent
          // OCR and AI description
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash: realContentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
  /**
   * Generate image description using AI service or return placeholder.
   */
  async generateImageDescription(file) {
    if (!this.aiServiceManager) {
      return `[Image: ${file.basename}]`;
    }
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const mimeType = this.getMimeType(file.extension);
      const response = await this.aiServiceManager.chatWithPrompt(
        "image-description" /* ImageDescription */,
        null,
        // No variables needed for image description
        void 0,
        void 0,
        [
          {
            type: "image",
            data: arrayBuffer,
            mediaType: mimeType
          }
        ]
      );
      console.debug("[ImageDocumentLoader] response:", response);
      return response || `[Image: ${file.basename}]`;
    } catch (error) {
      console.error("Error generating image description with AI:", error);
      return `[Image: ${file.basename}]`;
    }
  }
  /**
   * Get MIME type for image extension.
   */
  getMimeType(extension) {
    const ext = extension.toLowerCase();
    const mimeTypes = {
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "png": "image/png",
      "gif": "image/gif",
      "webp": "image/webp",
      "bmp": "image/bmp",
      "svg": "image/svg+xml"
    };
    return mimeTypes[ext] || "image/jpeg";
  }
};

// src/core/document/loader/DocxDocumentLoader.ts
var import_obsidian12 = __toESM(require_obsidian_stub());
var import_textsplitters6 = require("@langchain/textsplitters");
var import_mammoth = __toESM(require("mammoth"));
var DocxDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
  }
  getDocumentType() {
    return "docx";
  }
  getSupportedExtensions() {
    return ["docx", "doc"];
  }
  async readByPath(filePath, genCacheContent) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof import_obsidian12.TFile)) return null;
    if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
    return await this.readDocxFile(file, genCacheContent);
  }
  async chunkContent(doc, settings) {
    const content = doc.cacheFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(doc, [{
        docId: doc.id,
        chunkType: "body_raw",
        content
      }]);
    }
    const splitter = new import_textsplitters6.RecursiveCharacterTextSplitter({
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = [];
    for (let i = 0; i < langchainDocs.length; i++) {
      const langchainDoc = langchainDocs[i];
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: langchainDoc.pageContent,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: i
      });
    }
    return assembleIndexedChunks(doc, chunks);
  }
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const supportedExts = this.getSupportedExtensions();
    const files = this.app.vault.getFiles().filter((f) => supportedExts.includes(f.extension.toLowerCase())).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "docx"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  /**
   * Get summary for a DOCX document
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("DocxDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("DocxDocumentLoader.getSummary requires a Document, not a string");
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
  async readDocxFile(file, genCacheContent) {
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const buffer = Buffer.from(arrayBuffer);
      const sourceContentHash = binaryContentHash(arrayBuffer);
      let cacheContent = "";
      if (genCacheContent) {
        const result = await import_mammoth.default.extractRawText({ buffer });
        cacheContent = result.value;
      }
      return {
        id: generateDocIdFromPath(file.path),
        type: "docx",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: ""
          // DOCX has no text content in source
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: cacheContent
          // Extracted text content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash: sourceContentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/PptxDocumentLoader.ts
var import_obsidian13 = __toESM(require_obsidian_stub());
var import_textsplitters7 = require("@langchain/textsplitters");
var import_officeparser = __toESM(require("officeparser"));
var PptxDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
  }
  getDocumentType() {
    return "pptx";
  }
  getSupportedExtensions() {
    return ["pptx"];
  }
  async readByPath(filePath, genCacheContent) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof import_obsidian13.TFile)) return null;
    if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
    return await this.readPptxFile(file, genCacheContent);
  }
  async chunkContent(doc, settings) {
    const content = doc.cacheFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(doc, [{
        docId: doc.id,
        chunkType: "body_raw",
        content
      }]);
    }
    const splitter = new import_textsplitters7.RecursiveCharacterTextSplitter({
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = [];
    for (let i = 0; i < langchainDocs.length; i++) {
      const langchainDoc = langchainDocs[i];
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: langchainDoc.pageContent,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: i
      });
    }
    return assembleIndexedChunks(doc, chunks);
  }
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const supportedExts = this.getSupportedExtensions();
    const files = this.app.vault.getFiles().filter((f) => supportedExts.includes(f.extension.toLowerCase())).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "pptx"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  /**
   * Get summary for a PPTX document
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("PptxDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("PptxDocumentLoader.getSummary requires a Document, not a string");
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
  async readPptxFile(file, genCacheContent) {
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const buffer = Buffer.from(arrayBuffer);
      const sourceContentHash = binaryContentHash(arrayBuffer);
      let cacheContent = "";
      if (genCacheContent) {
        const content = await import_officeparser.default.parseOfficeAsync(buffer);
        cacheContent = content;
      }
      return {
        id: generateDocIdFromPath(file.path),
        type: "pptx",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: ""
          // PPTX has no text content in source
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: cacheContent
          // Extracted text content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash: sourceContentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/ExcalidrawDocumentLoader.ts
var import_obsidian14 = __toESM(require_obsidian_stub());
var import_textsplitters8 = require("@langchain/textsplitters");
var ExcalidrawDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
  }
  getDocumentType() {
    return "excalidraw";
  }
  getSupportedExtensions() {
    return ["excalidraw", "excalidraw.md"];
  }
  /**
   * Check if a file path matches any of the supported extensions.
   * For excalidraw, we check the full path suffix since extensions can be compound.
   */
  isSupportedPath(path3) {
    const supportedExts = this.getSupportedExtensions();
    return supportedExts.some((ext) => path3.endsWith("." + ext));
  }
  isExcalidrawMarkdown(content) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      return /^plugin:\s*excalidraw-plugin/m.test(frontmatter) || /^excalidraw-plugin/m.test(frontmatter);
    }
    return false;
  }
  async readByPath(filePath) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof import_obsidian14.TFile)) return null;
    if (!this.isSupportedPath(filePath)) return null;
    return await this.readExcalidrawFile(file);
  }
  async chunkContent(doc, settings) {
    const content = doc.sourceFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(doc, [{
        docId: doc.id,
        chunkType: "body_raw",
        content
      }]);
    }
    const splitter = new import_textsplitters8.RecursiveCharacterTextSplitter({
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = [];
    for (let i = 0; i < langchainDocs.length; i++) {
      const langchainDoc = langchainDocs[i];
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: langchainDoc.pageContent,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: i
      });
    }
    return assembleIndexedChunks(doc, chunks);
  }
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const files = this.app.vault.getFiles().filter((f) => this.isSupportedPath(f.path)).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "excalidraw"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  /**
   * Get summary for an Excalidraw document
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("ExcalidrawDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("ExcalidrawDocumentLoader.getSummary requires a Document, not a string");
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
  async readExcalidrawFile(file) {
    try {
      let content = await this.app.vault.cachedRead(file);
      if (file.path.endsWith(".excalidraw.md")) {
        if (this.isExcalidrawMarkdown(content)) {
          content = content.replace(/```excalidraw[\s\S]*?```/g, "");
          content = content.replace(/```json[\s\S]*?```/g, "");
        }
      }
      const contentHash = generateContentHash(content);
      return {
        id: generateDocIdFromPath(file.path),
        type: "excalidraw",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/CanvasDocumentLoader.ts
var import_obsidian15 = __toESM(require_obsidian_stub());
var import_textsplitters9 = require("@langchain/textsplitters");
var CanvasDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
  }
  getDocumentType() {
    return "canvas";
  }
  getSupportedExtensions() {
    return ["canvas"];
  }
  /**
   * Check if a file path matches any of the supported extensions.
   */
  isSupportedPath(path3) {
    const supportedExts = this.getSupportedExtensions();
    return supportedExts.some((ext) => path3.endsWith("." + ext));
  }
  async readByPath(filePath, genCacheContent) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof import_obsidian15.TFile)) return null;
    if (!this.isSupportedPath(filePath)) return null;
    return await this.readCanvasFile(file, genCacheContent);
  }
  async chunkContent(doc, settings) {
    const content = doc.sourceFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(doc, [{
        docId: doc.id,
        chunkType: "body_raw",
        content
      }]);
    }
    const splitter = new import_textsplitters9.RecursiveCharacterTextSplitter({
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = [];
    for (let i = 0; i < langchainDocs.length; i++) {
      const langchainDoc = langchainDocs[i];
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: langchainDoc.pageContent,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: i
      });
    }
    return assembleIndexedChunks(doc, chunks);
  }
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const files = this.app.vault.getFiles().filter((f) => this.isSupportedPath(f.path)).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "canvas"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  /**
   * Get summary for a Canvas document
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("CanvasDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("CanvasDocumentLoader.getSummary requires a Document, not a string");
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
  async readCanvasFile(file, genCacheContent) {
    try {
      const fileContents = await this.app.vault.cachedRead(file);
      const canvas = fileContents ? JSON.parse(fileContents) : {};
      const texts = [];
      for (const node of canvas.nodes ?? []) {
        if (node.type === "text" && node.text) {
          texts.push(node.text);
        } else if (node.type === "file" && node.file) {
          texts.push(node.file);
        }
      }
      for (const edge of (canvas.edges ?? []).filter((e) => !!e.label)) {
        texts.push(edge.label);
      }
      const content = texts.join("\r\n");
      const contentHash = generateContentHash(content);
      return {
        id: generateDocIdFromPath(file.path),
        type: "canvas",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/DataloomDocumentLoader.ts
var import_obsidian16 = __toESM(require_obsidian_stub());
var import_textsplitters10 = require("@langchain/textsplitters");
var DataloomDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
  }
  getDocumentType() {
    return "dataloom";
  }
  getSupportedExtensions() {
    return ["loom", "dataloom"];
  }
  /**
   * Check if a file path matches any of the supported extensions.
   */
  isSupportedPath(path3) {
    const supportedExts = this.getSupportedExtensions();
    return supportedExts.some((ext) => path3.endsWith("." + ext));
  }
  async readByPath(filePath) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof import_obsidian16.TFile)) return null;
    if (!this.isSupportedPath(filePath)) return null;
    return await this.readDataloomFile(file);
  }
  async chunkContent(doc, settings) {
    const content = doc.sourceFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(doc, [{
        docId: doc.id,
        chunkType: "body_raw",
        content
      }]);
    }
    const splitter = new import_textsplitters10.RecursiveCharacterTextSplitter({
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = [];
    for (let i = 0; i < langchainDocs.length; i++) {
      const langchainDoc = langchainDocs[i];
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: langchainDoc.pageContent,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: i
      });
    }
    return assembleIndexedChunks(doc, chunks);
  }
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const files = this.app.vault.getFiles().filter((f) => this.isSupportedPath(f.path)).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({
        path: file.path,
        mtime: file.stat.mtime,
        type: "dataloom"
      });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  /**
   * Get summary for a Dataloom document
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("DataloomDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("DataloomDocumentLoader.getSummary requires a Document, not a string");
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
  async readDataloomFile(file) {
    try {
      const data = JSON.parse(await this.app.vault.cachedRead(file));
      const texts = [];
      const iterate = (obj) => {
        for (const key in obj) {
          if (typeof obj[key] === "object" && obj[key] !== null) {
            iterate(obj[key]);
          } else if (key === "content") {
            texts.push(obj[key]);
          }
        }
      };
      iterate(data);
      const content = texts.join("\r\n");
      const contentHash = generateContentHash(content);
      return {
        id: generateDocIdFromPath(file.path),
        type: "dataloom",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch (e) {
      console.error("Error while parsing Dataloom file", file.path, e);
      return null;
    }
  }
};

// src/core/document/loader/UrlDocumentLoader.ts
var import_playwright = require("@langchain/community/document_loaders/web/playwright");
var import_textsplitters11 = require("@langchain/textsplitters");
var UrlDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
    this.playwrightConfig = {
      launchOptions: {
        headless: true
      },
      gotoOptions: {
        waitUntil: "domcontentloaded"
      }
    };
  }
  getDocumentType() {
    return "url";
  }
  getSupportedExtensions() {
    return ["url"];
  }
  async readByPath(path3, genCacheContent) {
    if (!this.isValidUrl(path3)) return null;
    return await this.readUrl(path3, genCacheContent);
  }
  async chunkContent(doc, settings) {
    const content = doc.cacheFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(doc, [{
        docId: doc.id,
        chunkType: "body_raw",
        content
      }]);
    }
    const splitter = new import_textsplitters11.RecursiveCharacterTextSplitter({
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = [];
    for (let i = 0; i < langchainDocs.length; i++) {
      const langchainDoc = langchainDocs[i];
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: langchainDoc.pageContent,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: i
      });
    }
    return assembleIndexedChunks(doc, chunks);
  }
  async *scanDocuments(params) {
    yield [];
  }
  /**
   * Get summary for a URL document
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("UrlDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("UrlDocumentLoader.getSummary requires a Document, not a string");
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  async readUrl(url, genCacheContent) {
    if (!this.isValidUrl(url)) {
      return null;
    }
    try {
      let content = "";
      const contentHash = generateContentHash(url);
      let title = "";
      if (genCacheContent) {
        const loader = new import_playwright.PlaywrightWebBaseLoader(url, this.playwrightConfig);
        const docs = await loader.load();
        content = docs.map((doc) => doc.pageContent).join("\n\n");
        const urlObj = new URL(url);
        title = urlObj.hostname + urlObj.pathname;
      }
      return {
        id: generateDocIdFromPath(url),
        type: "url",
        sourceFileInfo: {
          path: url,
          name: url,
          extension: "url",
          size: content.length,
          mtime: Date.now(),
          ctime: Date.now(),
          content: ""
          // URL has no source content
        },
        cacheFileInfo: {
          path: url,
          name: url,
          extension: "url",
          size: content.length,
          mtime: Date.now(),
          ctime: Date.now(),
          content
          // Extracted web content
        },
        metadata: {
          title,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch (error) {
      console.error("Error loading URL:", url, error);
      return null;
    }
  }
};

// src/core/document/loader/helper/DocumentLoaderManager.ts
var DocumentLoaderManager = class _DocumentLoaderManager {
  constructor(app, settings, aiServiceManager) {
    this.loaderMap = /* @__PURE__ */ new Map();
    this.extensionToLoaderMap = /* @__PURE__ */ new Map();
    this.app = app;
    this.settings = settings;
    this.aiServiceManager = aiServiceManager;
    IgnoreService.init(settings.ignorePatterns);
    this.registerAllLoaders();
  }
  static {
    this.instance = null;
  }
  /**
   * Get the global singleton instance.
   * Must be initialized with init() before first use.
   */
  static getInstance() {
    if (!_DocumentLoaderManager.instance) {
      throw new Error("DocumentLoaderManager not initialized. Call init() first.");
    }
    return _DocumentLoaderManager.instance;
  }
  /**
   * Clear the global singleton instance.
   * Call from plugin onunload to release memory.
   */
  static clearInstance() {
    _DocumentLoaderManager.instance = null;
  }
  /**
   * Initialize the global singleton instance.
   * Should be called once during plugin initialization.
   * @param aiServiceManager Optional AI service manager for loaders that need AI capabilities (e.g., image description).
   */
  static init(app, settings, aiServiceManager) {
    if (_DocumentLoaderManager.instance) {
      console.warn("DocumentLoaderManager already initialized. Reinitializing with new settings.");
    }
    _DocumentLoaderManager.instance = new _DocumentLoaderManager(app, settings, aiServiceManager);
    return _DocumentLoaderManager.instance;
  }
  /**
   * Register all document loaders.
   */
  registerAllLoaders() {
    this.registerLoader(new MarkdownDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new TextDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new TableDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new JsonDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new HtmlXmlDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new PdfDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new ImageDocumentLoader(this.app, this.settings, this.aiServiceManager));
    this.registerLoader(new DocxDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new PptxDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new ExcalidrawDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new CanvasDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new DataloomDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new UrlDocumentLoader(this.app, this.aiServiceManager));
  }
  /**
   * Update settings and reload all loaders.
   * Should be called when search settings are updated.
   */
  updateSettings(settings) {
    this.settings = settings;
    IgnoreService.getInstance().updateSettings(settings.ignorePatterns);
    this.registerAllLoaders();
  }
  /**
   * Register a custom document loader.
   * Automatically maps file extensions to loaders.
   */
  registerLoader(loader) {
    const docType = loader.getDocumentType();
    this.loaderMap.set(docType, loader);
    for (const ext of loader.getSupportedExtensions()) {
      this.extensionToLoaderMap.set(ext.toLowerCase(), loader);
    }
  }
  /**
   * Get the appropriate loader for a file extension.
   */
  getLoaderForExtension(extension) {
    return this.extensionToLoaderMap.get(extension.toLowerCase()) || null;
  }
  /**
   * Get the appropriate loader for a document type.
   */
  getLoaderForDocumentType(documentType) {
    return this.loaderMap.get(documentType) || null;
  }
  /**
   * Get the appropriate loader for a file.
   */
  getLoaderForFile(file) {
    if (!(file instanceof import_obsidian17.TFile)) return null;
    const extension = file.extension.toLowerCase();
    return this.getLoaderForExtension(extension);
  }
  getTypeForPath(path3) {
    if (path3.endsWith(".excalidraw.md") || path3.endsWith(".excalidraw")) {
      return "excalidraw";
    }
    if (path3.startsWith("http://") || path3.startsWith("https://")) {
      return "url";
    }
    const extension = path3.split(".").pop()?.toLowerCase() || "";
    return this.getLoaderForExtension(extension)?.getDocumentType() || null;
  }
  /**
   * Read a document by its path using the appropriate loader.
   * Returns core Document model.
   */
  async readByPath(path3, genCacheContent) {
    if (genCacheContent === void 0 || genCacheContent === null) {
      genCacheContent = true;
    }
    const type = this.getTypeForPath(path3);
    if (!type) return null;
    const loader = this.loaderMap.get(type);
    if (!loader) return null;
    return await loader.readByPath(path3, genCacheContent);
  }
  /**
   * Check if a document should be indexed based on settings and ignore patterns.
   */
  shouldIndexDocument(doc) {
    if (!(this.settings.includeDocumentTypes[doc.type] && this.loaderMap.has(doc.type))) {
      return false;
    }
    if (doc.sourceFileInfo?.path) {
      const ignoreService = IgnoreService.getInstance();
      return !ignoreService.shouldIgnore(doc.sourceFileInfo.path);
    }
    return true;
  }
  /**
   * Stream all documents from all registered loaders.
   * Returns core Document models filtered by settings.
   * Uses scanDocuments to get file list, then loads content on demand.
   */
  async *loadAllDocuments(params) {
    const batchSize = params?.batchSize ?? 25;
    let currentBatch = [];
    let batchReadStart;
    for await (const scanBatch of this.scanDocuments(params)) {
      batchReadStart = performance.now();
      for (const docMeta of scanBatch) {
        const partialDoc = {
          type: docMeta.type,
          sourceFileInfo: { path: docMeta.path }
        };
        if (!this.shouldIndexDocument(partialDoc)) {
          continue;
        }
        const doc = await this.readByPath(docMeta.path);
        if (doc) {
          currentBatch.push(doc);
          if (currentBatch.length >= batchSize) {
            console.log(
              `[DocumentLoaderManager] Yielded a batch of documents, read time: ${(performance.now() - batchReadStart).toFixed(2)} ms`
            );
            yield currentBatch;
            currentBatch = [];
            batchReadStart = performance.now();
          }
        }
      }
    }
    if (currentBatch.length > 0) {
      console.log(
        `[DocumentLoaderManager] Yielded final batch of documents, read time: ${(performance.now() - (batchReadStart ?? performance.now())).toFixed(2)} ms`
      );
      yield currentBatch;
    }
  }
  /**
   * Scan all documents metadata without loading content.
   * Returns lightweight metadata: path, mtime, type.
   * This is used for efficient index change detection.
   */
  async *scanDocuments(params) {
    const processedLoaders = /* @__PURE__ */ new Set();
    for (const loader of this.loaderMap.values()) {
      if (processedLoaders.has(loader)) continue;
      for await (const batch of loader.scanDocuments(params)) {
        yield batch;
      }
      processedLoaders.add(loader);
    }
  }
};

// src/service/search/index/helper/semanticRelatedEdges.ts
var SEMANTIC_EDGE_RULE_VERSION = 4;
var SEMANTIC_VECTOR_TOP_K_PER_DOC = 12;
var SEMANTIC_VECTOR_KNN_LIMIT = 150;
var SEMANTIC_VECTOR_MIN_SIMILARITY = 0.38;
var SemanticRelatedEdgesOverlayService = class {
  static escapeMermaidLabel(s) {
    return s.replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").slice(0, SLICE_CAPS.semanticEdges.mermaidSafeLabel);
  }
  /**
   * Compact Mermaid flowchart for local neighborhood (stored on document node; not the graph SSOT).
   */
  static buildMermaid(centerLabel, items) {
    const lines = ["flowchart LR", `  center["${this.escapeMermaidLabel(centerLabel)}"]`];
    items.slice(0, SLICE_CAPS.semanticEdges.items).forEach((it, idx) => {
      const nid = `n${idx}`;
      const el = it.edge === "vec" ? "vec" : it.edge === "topic" ? "topic" : "ref";
      lines.push(`  ${nid}["${this.escapeMermaidLabel(it.label)}"]`);
      lines.push(`  center -->|${el}| ${nid}`);
    });
    return lines.join("\n");
  }
  /** Build mermaid text from collected writes + resolved neighbor labels. */
  static async buildMermaidForWrites(centerLabel, writes, mobiusNodeRepo) {
    if (writes.length === 0) return null;
    const ids = [...new Set(writes.map((w) => w.toNodeId))];
    const nodes = await mobiusNodeRepo.getByIds(ids);
    const items = [];
    for (const w of writes) {
      const n = nodes.get(w.toNodeId);
      const label = n?.label ?? w.toNodeId.slice(0, SLICE_CAPS.semanticEdges.nodeIdFallbackLabel);
      const rule = w.attributes.rule;
      const edge = rule === "chunk_knn_max" || rule === "vector_knn" || rule === "typed_weighted_knn" || rule === "semantic_doc_center_knn" ? "vec" : rule === "shared_topic_tag" ? "topic" : "ref";
      items.push({ label, edge });
    }
    return this.buildMermaid(centerLabel, items);
  }
  /** Build mermaid from a loaded {@link Document} (title from doc metadata / path). */
  static async buildMermaidForDocument(doc, writes, mobiusNodeRepo) {
    const center = doc.metadata.title ?? getFileNameFromPath(doc.sourceFileInfo.path);
    return this.buildMermaidForWrites(center, writes, mobiusNodeRepo);
  }
};
var SemanticRelatedEdgesRebuildService = class {
  static async yieldToMainThread() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  /**
   * Rebuilds all `semantic_related` edges for one index tenant using vector similarity.
   * Clears existing edges of this type, clears cached Mermaid overlays, then writes new edges and overlays.
   *
   * Uses one query vector per source doc via {@link EmbeddingRepo.getEmbeddingForSemanticSearch} and one KNN;
   * target chunk types are weighted only at aggregation time.
   */
  static async rebuildForTenant(tenant, options) {
    if (!sqliteStoreManager.isVectorSearchEnabled()) {
      return {
        tenant,
        documentsProcessed: 0,
        edgesWritten: 0,
        skipped: true,
        reason: "Vector search (sqlite-vec) is not enabled."
      };
    }
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    let docIds;
    try {
      docIds = await embeddingRepo.listDistinctDocIdsWithEmbeddings();
    } catch (e) {
      return {
        tenant,
        documentsProcessed: 0,
        edgesWritten: 0,
        skipped: true,
        reason: e instanceof Error ? e.message : String(e)
      };
    }
    if (!docIds.length) {
      return { tenant, documentsProcessed: 0, edgesWritten: 0, skipped: false };
    }
    const probeId = docIds[0];
    const probeVec = await embeddingRepo.getEmbeddingForSemanticSearch(probeId);
    if (probeVec) {
      try {
        await embeddingRepo.searchSimilarAndGetId(probeVec, 1, "excludeDocIdsSet", {
          excludeDocIdsSet: /* @__PURE__ */ new Set([probeId])
        });
      } catch (e) {
        if (e instanceof BusinessError && e.code === "VEC_EMBEDDINGS_TABLE_MISSING" /* VEC_EMBEDDINGS_TABLE_MISSING */) {
          return {
            tenant,
            documentsProcessed: 0,
            edgesWritten: 0,
            skipped: true,
            reason: e.message
          };
        }
        throw e;
      }
    }
    const yieldEvery = options?.yieldEveryDocs ?? 40;
    const total = docIds.length;
    let edgesWritten = 0;
    let processed = 0;
    const now = Date.now();
    await mobiusEdgeRepo.deleteByType(GraphEdgeType.SemanticRelated);
    await mobiusNodeRepo.clearSemanticOverlayFieldsForIndexedNotes(now, SEMANTIC_EDGE_RULE_VERSION);
    for (const fromId of docIds) {
      processed++;
      options?.onProgress?.({ tenant, processed, total });
      const queryVector = await embeddingRepo.getEmbeddingForSemanticSearch(fromId);
      if (!queryVector) {
        if (processed % yieldEvery === 0) await this.yieldToMainThread();
        continue;
      }
      let results;
      try {
        results = await embeddingRepo.searchSimilarAndGetId(
          queryVector,
          SEMANTIC_VECTOR_KNN_LIMIT,
          "excludeDocIdsSet",
          { excludeDocIdsSet: /* @__PURE__ */ new Set([fromId]) }
        );
      } catch (e) {
        console.warn("[semanticRelatedEdges] KNN failed:", fromId, e);
        if (processed % yieldEvery === 0) await this.yieldToMainThread();
        continue;
      }
      const byNeighbor = /* @__PURE__ */ new Map();
      for (const r of results) {
        if (r.doc_id === fromId) continue;
        if (r.similarity < SEMANTIC_VECTOR_MIN_SIMILARITY) continue;
        const targetChunkType = r.chunk_type ?? "body_raw";
        const w = SEMANTIC_EDGE_CHUNK_TYPE_WEIGHT[targetChunkType];
        const weighted = r.similarity * w;
        const prev = byNeighbor.get(r.doc_id);
        if (!prev || weighted > prev.bestWeighted) {
          byNeighbor.set(r.doc_id, {
            bestWeighted: weighted,
            bestDistance: r.distance,
            bestSimilarity: r.similarity,
            targetChunkType
          });
        }
      }
      const ranked = [...byNeighbor.entries()].filter(([, v]) => v.bestSimilarity >= SEMANTIC_VECTOR_MIN_SIMILARITY).sort((a, b) => b[1].bestWeighted - a[1].bestWeighted).slice(0, SEMANTIC_VECTOR_TOP_K_PER_DOC);
      const toIds = ranked.map(([id]) => id);
      const targetNodes = await mobiusNodeRepo.getByIds(toIds);
      const writes = [];
      for (const [toId, agg] of ranked) {
        const target = targetNodes.get(toId);
        if (!target || !isIndexedNoteNodeType(target.type)) continue;
        writes.push({
          toNodeId: toId,
          weight: Math.min(1, agg.bestWeighted),
          attributes: {
            source: "vector",
            rule: "semantic_doc_center_knn",
            ruleVersion: SEMANTIC_EDGE_RULE_VERSION,
            bestDistance: agg.bestDistance,
            bestSimilarity: agg.bestSimilarity,
            targetChunkType: agg.targetChunkType,
            bestWeightedSimilarity: agg.bestWeighted
          }
        });
      }
      for (const w of writes) {
        await mobiusEdgeRepo.upsert({
          id: MobiusEdgeRepo.generateEdgeId(fromId, w.toNodeId, GraphEdgeType.SemanticRelated),
          from_node_id: fromId,
          to_node_id: w.toNodeId,
          type: GraphEdgeType.SemanticRelated,
          weight: w.weight,
          attributes: JSON.stringify({ ...w.attributes, updatedAt: now })
        });
        edgesWritten++;
      }
      if (writes.length > 0) {
        const centerNode = await mobiusNodeRepo.getByNodeId(fromId);
        const centerLabel = centerNode?.label ?? fromId.slice(0, SLICE_CAPS.semanticEdges.nodeIdFallbackLabel);
        const mermaid2 = await SemanticRelatedEdgesOverlayService.buildMermaidForWrites(centerLabel, writes, mobiusNodeRepo);
        await mobiusNodeRepo.mergeJsonAttributesForIndexedNoteNode(
          fromId,
          {
            semantic_overlay_mermaid: mermaid2 ?? null,
            semantic_edge_rule_version: SEMANTIC_EDGE_RULE_VERSION
          },
          now
        );
      }
      if (processed % yieldEvery === 0) await this.yieldToMainThread();
    }
    return { tenant, documentsProcessed: processed, edgesWritten, skipped: false };
  }
};

// src/core/utils/vault-path-utils.ts
function normalizeVaultPath(path3) {
  return path3.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}
function pathSegments(path3) {
  const n = normalizeVaultPath(path3);
  if (!n) return [];
  return n.split("/").filter(Boolean);
}
function pathLcaDepth(a, b) {
  const sa = pathSegments(a);
  const sb = pathSegments(b);
  let i = 0;
  while (i < sa.length && i < sb.length && sa[i] === sb[i]) {
    i++;
  }
  return i;
}
function crossesTopLevelFolder(a, b) {
  const sa = pathSegments(a);
  const sb = pathSegments(b);
  if (!sa.length || !sb.length) return false;
  return sa[0] !== sb[0];
}

// src/service/search/index/helper/mobiusTagEdges.ts
async function upsertOneTagEdge(mobiusNodeRepo, mobiusEdgeRepo, docNodeId, edgeType, nodeType, tagId, label, nodeAttributes, edgeAttributes = {}) {
  await mobiusNodeRepo.upsert({
    id: tagId,
    type: nodeType,
    label,
    attributes: JSON.stringify(nodeAttributes)
  });
  await mobiusEdgeRepo.upsert({
    id: MobiusEdgeRepo.generateEdgeId(docNodeId, tagId, edgeType),
    from_node_id: docNodeId,
    to_node_id: tagId,
    type: edgeType,
    weight: 1,
    attributes: JSON.stringify(edgeAttributes)
  });
}
async function upsertDocumentTagEdges(tenant, docNodeId, spec) {
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
  switch (spec.nodeType) {
    case GraphNodeType.TopicTag:
      for (const { id, label } of spec.items) {
        const qualifier = label?.trim();
        await upsertOneTagEdge(
          mobiusNodeRepo,
          mobiusEdgeRepo,
          docNodeId,
          GraphEdgeType.TaggedTopic,
          spec.nodeType,
          stableTopicTagNodeId(id),
          id,
          { tagName: id },
          qualifier ? { qualifier } : {}
        );
      }
      break;
    case GraphNodeType.FunctionalTag:
      for (const { id, label } of spec.items) {
        const qualifier = label?.trim();
        await upsertOneTagEdge(
          mobiusNodeRepo,
          mobiusEdgeRepo,
          docNodeId,
          GraphEdgeType.TaggedFunctional,
          spec.nodeType,
          stableFunctionalTagNodeId(id),
          id,
          { functionalTag: id },
          qualifier ? { qualifier } : {}
        );
      }
      break;
    case GraphNodeType.KeywordTag:
      for (const kw of spec.items) {
        await upsertOneTagEdge(
          mobiusNodeRepo,
          mobiusEdgeRepo,
          docNodeId,
          GraphEdgeType.TaggedKeyword,
          spec.nodeType,
          stableKeywordTagNodeId(kw),
          kw,
          { keywordTag: kw },
          {}
        );
      }
      break;
    case GraphNodeType.ContextTag:
      for (const { axis, label } of spec.items) {
        await upsertOneTagEdge(
          mobiusNodeRepo,
          mobiusEdgeRepo,
          docNodeId,
          GraphEdgeType.TaggedContext,
          spec.nodeType,
          stableContextTagNodeId(axis, label),
          label,
          { axis, contextTag: label },
          {}
        );
      }
      break;
  }
}

// src/core/utils/hub-path-utils.ts
function isVaultPathUnderPrefix(path3, prefix) {
  const p = normalizeVaultPath(path3);
  const pre = normalizeVaultPath(prefix);
  if (!pre) return false;
  if (p === pre) return true;
  return p.startsWith(pre + "/");
}
function pathMatchesAnyPrefix(path3, prefixes) {
  if (!prefixes.length) return true;
  const p = normalizeVaultPath(path3.trim());
  if (!p) return false;
  for (const raw of prefixes) {
    const pref = normalizeVaultPath(raw.trim());
    if (!pref) continue;
    if (p === pref || p.startsWith(`${pref}/`) || pref.startsWith(`${p}/`)) return true;
  }
  return false;
}

// src/service/search/index/indexService.ts
function getIndexTenantForPath(path3) {
  const ctx = AppContext.getInstance();
  const hubFolder = getAIHubSummaryFolder();
  if (hubFolder && isVaultPathUnderPrefix(path3, hubFolder)) {
    return "vault";
  }
  const rootFolder = ctx.settings.ai.rootFolder.trim();
  const normalized = path3.replace(/^\/+/, "");
  const prefix = rootFolder.endsWith("/") ? rootFolder.replace(/\/+$/, "") : rootFolder;
  return normalized === prefix || normalized.startsWith(prefix + "/") ? "chat" : "vault";
}
var DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE = 200;
async function yieldForLargePass() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
var IndexCrudService = class {
  /**
   * Delete documents by paths. Removes chunks, embeddings, indexed document rows on Mobius, and document graph nodes/edges for those ids.
   *
   * Notes:
   * - Does not delete tag/hub nodes shared by other documents (only edges from removed docs are cleared via node delete scope).
   * - Runs in a per-tenant transaction.
   */
  async deleteDocuments(paths, onAfterMutation) {
    if (!paths.length) return;
    const byTenant = /* @__PURE__ */ new Map();
    for (const p of paths) {
      const t = getIndexTenantForPath(p);
      const list = byTenant.get(t) ?? [];
      list.push(p);
      byTenant.set(t, list);
    }
    for (const [tenant, tenantPaths] of byTenant) {
      const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
      const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
      const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
      const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
      const kdb = sqliteStoreManager.getIndexContext(tenant);
      const metaMap = await indexedDocumentRepo.getByPaths(tenantPaths);
      const docIds = Array.from(metaMap.values()).map((m) => m.id);
      await kdb.transaction().execute(async () => {
        docChunkRepo.deleteFtsByDocIds(docIds);
        docChunkRepo.deleteMetaFtsByDocIds(docIds);
        await docChunkRepo.deleteByDocIds(docIds);
        await embeddingRepo.deleteByDocIds(docIds);
        await mobiusNodeRepo.deleteDocumentStatisticsByDocIds(docIds);
        await mobiusEdgeRepo.deleteByNodeIds(docIds);
        await indexedDocumentRepo.deleteByPaths(tenantPaths);
        await mobiusNodeRepo.deleteByIds(docIds);
      });
      if (docIds.length > 0) {
        await this.addMaintenanceDebt(tenant, MOBIUS_MAINTENANCE_DEBT_PER_DELETE * docIds.length);
      }
    }
    onAfterMutation?.(["sqlite", "graph"]);
  }
  /**
   * Clear all index data: chunks, embeddings, Mobius nodes/edges (via repos), and index_state.
   * Destructive and cannot be undone.
   */
  async clearAllIndexData(onAfterMutation) {
    const tenants = ["vault", "chat"];
    for (const tenant of tenants) {
      const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
      const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
      const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
      const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
      const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);
      docChunkRepo.deleteAllFts();
      docChunkRepo.deleteAllMetaFts();
      await docChunkRepo.deleteAll();
      await embeddingRepo.deleteAll();
      await mobiusNodeRepo.clearAllDocumentStatistics();
      await mobiusEdgeRepo.deleteAll();
      await indexedDocumentRepo.deleteAll();
      await mobiusNodeRepo.deleteAll();
      await indexStateRepo.clearAll();
    }
    onAfterMutation?.(["sqlite", "graph"]);
  }
  /**
   * Clean up orphan FTS/chunk/embedding rows and stray document nodes on Mobius when no indexed document remains for that path set.
   */
  async cleanupOrphanedSearchIndexData() {
    const tenants = ["vault", "chat"];
    let metaFts = 0;
    let fts = 0;
    let chunks = 0;
    let embeddings = 0;
    let stats = 0;
    let graphNodes = 0;
    for (const tenant of tenants) {
      const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
      const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
      const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
      const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
      const kdb = sqliteStoreManager.getIndexContext(tenant);
      await kdb.transaction().execute(async () => {
        metaFts += docChunkRepo.cleanupOrphanMetaFts();
        fts += docChunkRepo.cleanupOrphanFts();
        chunks += await docChunkRepo.cleanupOrphanChunks();
        embeddings += await embeddingRepo.cleanupOrphanEmbeddings();
        stats += await mobiusNodeRepo.cleanupOrphanStats();
        const pathMap = await indexedDocumentRepo.getAllIndexedPaths();
        const paths = Array.from(pathMap.keys());
        const idRows = paths.length > 0 ? await indexedDocumentRepo.getIdsByPaths(paths) : [];
        const validDocIds = new Set(idRows.map((r) => r.id));
        const orphanDocNodes = [];
        for (const t of GRAPH_DOCUMENT_LIKE_NODE_TYPES) {
          const nodes = await mobiusNodeRepo.getByType(t);
          orphanDocNodes.push(...nodes.filter((n) => !validDocIds.has(n.id)).map((n) => n.id));
        }
        if (orphanDocNodes.length > 0) {
          await mobiusEdgeRepo.deleteByNodeIds(orphanDocNodes);
          await mobiusNodeRepo.deleteByIds(orphanDocNodes);
          graphNodes += orphanDocNodes.length;
        }
      });
    }
    return { metaFts, fts, chunks, embeddings, stats, graphNodes };
  }
  /** Index build timestamp and document count (vault tenant). */
  async getIndexStatus() {
    const indexStateRepo = sqliteStoreManager.getIndexStateRepo("vault");
    const builtAtRaw = await indexStateRepo.get(INDEX_STATE_KEYS.builtAt);
    const indexedRaw = await indexStateRepo.get(INDEX_STATE_KEYS.indexedDocs);
    const indexBuiltAt = builtAtRaw != null ? Number(builtAtRaw) : null;
    const indexedDocs = indexedRaw != null ? Number(indexedRaw) : null;
    return {
      indexBuiltAt: Number.isFinite(indexBuiltAt) ? indexBuiltAt : null,
      indexedDocs: Number.isFinite(indexedDocs) ? indexedDocs : null,
      isReady: Boolean(builtAtRaw)
    };
  }
  /**
   * Updates path on the indexed document (Mobius + FTS + graph node attributes) without changing node id.
   * @returns true if a row was updated under oldPath.
   */
  async renameDocumentPath(oldPath, newPath) {
    const tenantOld = getIndexTenantForPath(oldPath);
    const tenantNew = getIndexTenantForPath(newPath);
    if (tenantOld !== tenantNew) return false;
    const tenant = tenantOld;
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
    const meta2 = await indexedDocumentRepo.getByPath(oldPath);
    if (!meta2) return false;
    const docId = meta2.id;
    const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const kdb = sqliteStoreManager.getIndexContext(tenant);
    const title = meta2.title ?? getFileNameFromPath(newPath);
    const normTitle = normalizeTextForFts(title);
    const ts = Date.now();
    await kdb.transaction().execute(async () => {
      await indexedDocumentRepo.updatePathById(docId, newPath);
      docChunkRepo.replaceMetaFts({ doc_id: docId, path: newPath, title: normTitle });
      const gn = await mobiusNodeRepo.getById(docId);
      if (gn) {
        let attrs = {};
        try {
          attrs = JSON.parse(gn.attributes);
        } catch {
          attrs = {};
        }
        attrs.path = newPath;
        await mobiusNodeRepo.updateById(docId, {
          label: title,
          attributes: JSON.stringify(attrs),
          updated_at: ts
        });
      }
    });
    await this.addMaintenanceDebt(tenant, MOBIUS_MAINTENANCE_DEBT_RENAME);
    return true;
  }
  /** True when maintenance debt reached the threshold in vault or chat DB. */
  async isMobiusMaintenanceRecommended() {
    for (const tenant of ["vault", "chat"]) {
      const v = await sqliteStoreManager.getIndexStateRepo(tenant).get(MOBIUS_MAINTENANCE_STATE_KEYS.needed);
      if (v === "1") return true;
    }
    return false;
  }
  /** Accumulate maintenance debt after successful incremental graph/search writes. */
  async addMaintenanceDebt(tenant, delta) {
    if (delta <= 0) return;
    if (!sqliteStoreManager.isInitialized()) return;
    const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);
    const raw = await indexStateRepo.get(MOBIUS_MAINTENANCE_STATE_KEYS.dirtyScore);
    const prev = Number(raw ?? 0);
    const base = Number.isFinite(prev) && prev >= 0 ? prev : 0;
    const next = base + delta;
    await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.dirtyScore, String(next));
    if (next >= MOBIUS_MAINTENANCE_DIRTY_THRESHOLD) {
      await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.needed, "1");
    }
  }
};
var IndexSingleService = class {
  constructor(aiServiceManager, crud) {
    this.aiServiceManager = aiServiceManager;
    this.crud = crud;
  }
  /**
   * Index a document by path with chunking strategy applied.
   * This method handles document loading and chunking internally based on settings.
   */
  async indexDocument(docPath, settings) {
    const sw = new Stopwatch(`[IndexService] Indexing: ${docPath}`);
    console.debug(`[IndexService] Index document: ${docPath}`);
    try {
      const loaderManager = DocumentLoaderManager.getInstance();
      const partialDoc = {
        type: loaderManager.getTypeForPath(docPath) ?? "unknown",
        sourceFileInfo: { path: docPath }
      };
      if (!loaderManager.shouldIndexDocument(partialDoc)) {
        console.warn(`[IndexService] Skipping indexing for path: ${docPath}, type: ${partialDoc.type} (should not be indexed or has no loader)`);
        return;
      }
      sw.start("Read document");
      const doc = await loaderManager.readByPath(docPath, true);
      sw.stop();
      if (!doc) {
        console.warn(`[IndexService] Failed to load document: ${docPath}`);
        return;
      }
      const tenant = getIndexTenantForPath(doc.sourceFileInfo.path);
      doc.id = await this.resolveDocumentNodeId(doc.sourceFileInfo.path, tenant);
      if (IndexService.isCancelled()) {
        console.log(`[IndexService] Indexing cancelled for ${doc.sourceFileInfo.path}`);
        return;
      }
      const loader = loaderManager.getLoaderForDocumentType(doc.type);
      if (!loader) {
        console.warn(`No loader found for document type: ${doc.type}`);
        return;
      }
      sw.start("Chunk content");
      const chunks = await loader.chunkContent(doc, settings.chunking);
      sw.stop();
      const vectorSearchAvailable = sqliteStoreManager.isVectorSearchEnabled();
      const embeddingModel = settings.chunking.embeddingModel;
      const embeddingModelName = embeddingModel ? `${embeddingModel.provider}:${embeddingModel.modelId}` : void 0;
      if (embeddingModel && vectorSearchAvailable) {
        sw.start("Generate embeddings");
        await this.generateAndFillEmbeddings(chunks, embeddingModel);
        sw.stop();
      } else {
        console.debug(
          `[IndexService] Skipping embedding generation for ${doc.sourceFileInfo.path}. Vector search may not be available (sqlite-vec extension not loaded). `
        );
      }
      sw.start("Persist index (transaction: mobius + FTS + graph + aggregates + index_state)");
      console.debug(`[IndexService] Persist index for: ${docPath} (tenant: ${tenant})`);
      const pathToIndexedDocInfo = await this.loadPathToIndexedDocInfoMap(doc, tenant);
      const indexedByTargetId = await this.loadIndexedRecordsForOutgoingTargets(doc, tenant, pathToIndexedDocInfo);
      const kdb = sqliteStoreManager.getIndexContext(tenant);
      await kdb.transaction().execute(async () => {
        await this.upsertIndexedDocument(doc, tenant);
        await this.upsertGraphEdgesForDocument(doc, tenant, pathToIndexedDocInfo, indexedByTargetId);
        await this.upsertFolderContainsEdgesForDocument(doc, tenant);
        await this.refreshMobiusAggregatesForIndexedDocument(doc, tenant, pathToIndexedDocInfo);
        await this.saveSearchData(
          doc.id,
          doc.sourceFileInfo.path,
          doc.metadata.title,
          chunks,
          embeddingModelName,
          tenant
        );
        await this.updateIndexState(tenant);
      });
      await this.crud.addMaintenanceDebt(tenant, MOBIUS_MAINTENANCE_DEBT_INDEX_DOC);
      sw.stop();
    } catch (error) {
      console.error(`[IndexService] Error indexing document:`, {
        docPath,
        message: error.message ?? void 0,
        stack: error.stack ?? void 0
      });
    } finally {
      sw.print();
    }
  }
  /**
   * Stable node_id for a vault path: reuse existing indexed document on `mobius_node`, else allocate.
   * First tries path-stable id; on collision, one fallback using path + timestamp seed.
   */
  async resolveDocumentNodeId(path3, tenant) {
    const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const existing = await mobiusRepo.getByPath(path3);
    if (existing && isIndexedNoteNodeType(existing.type)) {
      return existing.node_id;
    }
    const tryCandidate = async (candidate) => {
      const row = await mobiusRepo.getByNodeId(candidate);
      if (!row) return candidate;
      if (row.path === path3 && isIndexedNoteNodeType(row.type)) return candidate;
      return null;
    };
    const primary = generateDocIdFromPath(path3);
    const first = await tryCandidate(primary);
    if (first !== null) return first;
    const ts = Date.now();
    const fallback = stableDocumentNodeIdTimeFallback(path3, ts);
    const second = await tryCandidate(fallback);
    if (second !== null) return second;
    throw new Error(`[IndexService] Failed to allocate document node id for path: ${path3}`);
  }
  /**
   * Generate embeddings for chunks and fill them into chunk objects.
   * 
   * @param chunks - Chunks to generate embeddings for
   * @param embeddingModel - Embedding model configuration (provider and modelId)
   */
  async generateAndFillEmbeddings(chunks, embeddingModel) {
    if (!chunks.length) return;
    try {
      const multiProviderChatService = this.aiServiceManager.getMultiChat();
      const embeddings = await multiProviderChatService.generateEmbeddings(
        chunks.map((chunk2) => chunk2.content),
        embeddingModel.modelId,
        embeddingModel.provider
      );
      for (let i = 0; i < chunks.length && i < embeddings.length; i++) {
        chunks[i].embedding = embeddings[i];
      }
    } catch (error) {
      console.error(`[IndexService] Failed to generate embeddings:`, error);
    }
  }
  /**
   * Save search data (FTS and embeddings) to database.
   */
  async saveSearchData(docId, path3, title, chunks, embeddingModel, tenant = "vault") {
    const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
    const now = Date.now();
    docChunkRepo.deleteFtsByDocId(docId);
    docChunkRepo.deleteMetaFtsByDocId(docId);
    await docChunkRepo.deleteByDocId(docId);
    await embeddingRepo.deleteByDocIds([docId]);
    const normTitle = normalizeTextForFts(title ?? "");
    docChunkRepo.insertMetaFts({
      doc_id: docId,
      path: path3,
      title: normTitle
    });
    for (const chunk2 of chunks) {
      const chunkId = chunk2.chunkId ?? generateUuidWithoutHyphens();
      const chunkIndex = Number(chunk2.chunkIndex ?? 0);
      const normContent = normalizeTextForFts(chunk2.content ?? "");
      const metaJson = chunk2.chunkMeta && Object.keys(chunk2.chunkMeta).length > 0 ? JSON.stringify(chunk2.chunkMeta) : null;
      await docChunkRepo.upsertChunk({
        chunk_id: chunkId,
        doc_id: docId,
        chunk_index: chunkIndex,
        chunk_type: chunk2.chunkType,
        chunk_meta_json: metaJson,
        title: chunk2.title ?? null,
        mtime: now,
        content_raw: chunk2.content ?? null,
        content_fts_norm: normContent
      });
      docChunkRepo.insertFts({
        chunk_id: chunkId,
        doc_id: docId,
        content: normContent
      });
      if (Array.isArray(chunk2.embedding) && chunk2.embedding.length > 0) {
        await embeddingRepo.upsert({
          id: chunkId,
          doc_id: docId,
          chunk_id: chunkId,
          chunk_index: chunkIndex,
          chunk_type: chunk2.chunkType,
          content_hash: "",
          ctime: now,
          mtime: now,
          embedding: chunk2.embedding,
          embedding_model: embeddingModel ?? "unknown",
          embedding_len: chunk2.embedding.length
        });
      }
    }
  }
  /**
   * Computes word/char counts and timestamps for the document row on `mobius_node`.
   */
  computeDocumentStatistics(doc) {
    const content = doc.sourceFileInfo.content ?? "";
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const charCount = content.length;
    const fm = doc.metadata.frontmatter;
    const fromFmUpdated = parseLooseTimestampToMs(fm?.[INDEX_FRONTMATTER_KEYS.updatedAt]) ?? parseLooseTimestampToMs(fm?.[INDEX_FRONTMATTER_KEYS.updated]);
    const updatedAt = fromFmUpdated !== void 0 ? fromFmUpdated : doc.sourceFileInfo.ctime ?? doc.sourceFileInfo.mtime ?? Date.now();
    return {
      word_count: wordCount > 0 ? wordCount : null,
      char_count: charCount > 0 ? charCount : null,
      last_open_ts: updatedAt,
      row_updated_at: updatedAt
    };
  }
  /**
   * `mobius_node.type` for indexed notes: `hub_doc` for everything under `{root}/Hub-Summaries`
   * (including auto `Hub-*.md` and user `Manual/*.md`).
   */
  resolveMobiusGraphNodeTypeForPath(path3) {
    const hub = getAIHubSummaryFolder();
    if (hub && isVaultPathUnderPrefix(path3, hub)) return GraphNodeType.HubDoc;
    return GraphNodeType.Document;
  }
  /**
   * Upserts the indexed document row on `mobius_node` via IndexedDocumentRepo (document or hub_doc; stats columns).
   */
  async upsertIndexedDocument(doc, tenant = "vault") {
    const startTime = Date.now();
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
    const stats = this.computeDocumentStatistics(doc);
    const llmInferCreated = doc.metadata.inferCreatedAt;
    try {
      await indexedDocumentRepo.upsert({
        id: doc.id,
        path: doc.sourceFileInfo.path,
        type: doc.type,
        title: doc.metadata.title ?? doc.id,
        mtime: doc.sourceFileInfo.mtime ?? 0,
        size: doc.sourceFileInfo.size ?? null,
        ctime: doc.sourceFileInfo.ctime ?? null,
        content_hash: doc.contentHash ?? null,
        summary: doc.summary ?? null,
        full_summary: doc.fullSummary ?? null,
        tags: encodeIndexedTagsBlob({
          topicTags: doc.metadata.topicTags ?? [],
          topicTagEntries: doc.metadata.topicTagEntries,
          functionalTagEntries: doc.metadata.functionalTagEntries ?? [],
          keywordTags: doc.metadata.keywordTags ?? [],
          ...doc.metadata.userKeywordTags !== void 0 ? { userKeywordTags: doc.metadata.userKeywordTags } : {},
          ...doc.metadata.textrankKeywordTerms?.length ? { textrankKeywordTerms: doc.metadata.textrankKeywordTerms } : {},
          timeTags: doc.metadata.timeTags ?? [],
          geoTags: doc.metadata.geoTags ?? [],
          personTags: doc.metadata.personTags ?? []
        }),
        word_count: stats.word_count,
        char_count: stats.char_count,
        last_open_ts: stats.last_open_ts,
        row_updated_at: stats.row_updated_at,
        ...typeof llmInferCreated === "number" && Number.isFinite(llmInferCreated) ? { infer_created_at: llmInferCreated } : {},
        mobiusGraphNodeType: this.resolveMobiusGraphNodeTypeForPath(doc.sourceFileInfo.path)
      });
      const elapsed = Date.now() - startTime;
      if (elapsed > 100) {
        console.warn(`[IndexService] upsertIndexedDocument took ${elapsed}ms for ${doc.sourceFileInfo.path}`);
      }
    } catch (error) {
      console.error(`[IndexService] Error upserting indexed document for ${doc.sourceFileInfo.path}:`, error);
      throw error;
    }
  }
  /**
   * Update index state (document count and build timestamp).
   */
  async updateIndexState(tenant = "vault") {
    const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);
    const now = Date.now();
    const indexedCount = await indexStateRepo.get(INDEX_STATE_KEYS.indexedDocs);
    const newCount = Number(indexedCount ?? 0) + 1;
    await indexStateRepo.set(INDEX_STATE_KEYS.indexedDocs, String(newCount));
    await indexStateRepo.set(INDEX_STATE_KEYS.builtAt, String(now));
  }
  /**
   * Batch-load indexed document id + title for outgoing link targets that omit `docId`, so edges use the same node id as the DB (e.g. after path collision handling / renames).
   */
  async loadPathToIndexedDocInfoMap(doc, tenant) {
    const paths = [...new Set(doc.references.outgoing.filter((r) => !r.docId).map((r) => r.fullPath))];
    if (paths.length === 0) return /* @__PURE__ */ new Map();
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
    const byPath = await indexedDocumentRepo.getByPaths(paths);
    const out = /* @__PURE__ */ new Map();
    for (const p of paths) {
      const row = byPath.get(p);
      if (row) out.set(p, { id: row.id, title: row.title });
    }
    return out;
  }
  /**
   * Loads indexed rows for all resolved outgoing target node ids (covers refs with `docId` and path-based resolution).
   */
  async loadIndexedRecordsForOutgoingTargets(doc, tenant, pathMap) {
    const ids = /* @__PURE__ */ new Set();
    for (const ref of doc.references.outgoing) {
      ids.add(this.resolveOutgoingTargetNodeId(ref, pathMap));
    }
    if (ids.size === 0) return /* @__PURE__ */ new Map();
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
    const rows = await indexedDocumentRepo.getByIds([...ids]);
    return new Map(rows.map((r) => [r.id, r]));
  }
  /** Resolves Mobius document node id for an outgoing reference (parser id, indexed row, or path-stable fallback). */
  resolveOutgoingTargetNodeId(ref, pathMap) {
    return ref.docId ?? pathMap.get(ref.fullPath)?.id ?? generateDocIdFromPath(ref.fullPath);
  }
  /**
   * Upserts tag nodes (topic / functional / keyword) and ref edges for this document. The document `mobius_node` row is written only by {@link upsertIndexedDocument}.
   */
  async upsertGraphEdgesForDocument(doc, tenant, pathMap, indexedByTargetId) {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const docNodeId = doc.id;
    const lcaMax = INDEX_LONG_RANGE_LCA_MAX_DEPTH;
    const sourcePath = doc.sourceFileInfo.path;
    for (const ref of doc.references.outgoing) {
      const targetNodeId = this.resolveOutgoingTargetNodeId(ref, pathMap);
      const fallbackLabel = getFileNameFromPath(ref.fullPath);
      const indexed = indexedByTargetId.get(targetNodeId);
      const label = indexed?.title?.trim() ? indexed.title.trim() : fallbackLabel;
      await mobiusNodeRepo.upsert({
        id: targetNodeId,
        type: GraphNodeType.Document,
        label,
        attributes: JSON.stringify({ path: ref.fullPath })
      });
      const lcaDepth = pathLcaDepth(sourcePath, ref.fullPath);
      const crosses = crossesTopLevelFolder(sourcePath, ref.fullPath);
      const longRange = crosses && lcaDepth <= lcaMax;
      await mobiusEdgeRepo.upsert({
        id: MobiusEdgeRepo.generateEdgeId(docNodeId, targetNodeId, GraphEdgeType.References),
        from_node_id: docNodeId,
        to_node_id: targetNodeId,
        type: GraphEdgeType.References,
        weight: 1,
        attributes: JSON.stringify({ longRange, lcaDepth })
      });
    }
    for (const t of [
      GraphEdgeType.TaggedTopic,
      GraphEdgeType.TaggedFunctional,
      GraphEdgeType.TaggedKeyword,
      GraphEdgeType.TaggedContext
    ]) {
      await mobiusEdgeRepo.deleteByFromNodeAndType(docNodeId, t);
    }
    const functionalSanitized = filterValidFunctionalTagEntries(doc.metadata.functionalTagEntries ?? []);
    const topicItems = doc.metadata.topicTagEntries?.length ? doc.metadata.topicTagEntries : (doc.metadata.topicTags ?? []).map((id) => ({ id }));
    await upsertDocumentTagEdges(tenant, docNodeId, {
      nodeType: GraphNodeType.TopicTag,
      items: topicItems
    });
    await upsertDocumentTagEdges(tenant, docNodeId, {
      nodeType: GraphNodeType.FunctionalTag,
      items: functionalSanitized
    });
    await upsertDocumentTagEdges(tenant, docNodeId, {
      nodeType: GraphNodeType.KeywordTag,
      items: graphKeywordTagsForMobius(doc.metadata)
    });
    const contextTriples = [
      ...(doc.metadata.timeTags ?? []).map((label) => ({ axis: "time", label })),
      ...(doc.metadata.geoTags ?? []).map((label) => ({ axis: "geo", label })),
      ...(doc.metadata.personTags ?? []).map((label) => ({ axis: "person", label }))
    ];
    await upsertDocumentTagEdges(tenant, docNodeId, {
      nodeType: GraphNodeType.ContextTag,
      items: contextTriples
    });
  }
  /**
   * Adds folder hierarchy `contains` edges (Folder nodes → child folder or document).
   */
  async upsertFolderContainsEdgesForDocument(doc, tenant) {
    const path3 = doc.sourceFileInfo.path;
    const parts = pathSegments(path3);
    if (parts.length < 2) {
      return;
    }
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const now = Date.now();
    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = parts.slice(0, i + 1).join("/");
      const folderId = stableMobiusFolderNodeId(tenant, folderPath);
      const label = parts[i] ?? folderPath;
      await mobiusNodeRepo.upsert({
        id: folderId,
        type: GraphNodeType.Folder,
        label,
        attributes: JSON.stringify({ path: folderPath }),
        created_at: now,
        updated_at: now
      });
      if (i > 0) {
        const parentFolderPath = parts.slice(0, i).join("/");
        const parentId = stableMobiusFolderNodeId(tenant, parentFolderPath);
        await mobiusEdgeRepo.upsert({
          id: MobiusEdgeRepo.generateEdgeId(parentId, folderId, GraphEdgeType.Contains),
          from_node_id: parentId,
          to_node_id: folderId,
          type: GraphEdgeType.Contains,
          weight: 1,
          attributes: JSON.stringify({})
        });
      }
    }
    const lastFolderPath = parts.slice(0, -1).join("/");
    const lastFolderId = stableMobiusFolderNodeId(tenant, lastFolderPath);
    await mobiusEdgeRepo.upsert({
      id: MobiusEdgeRepo.generateEdgeId(lastFolderId, doc.id, GraphEdgeType.Contains),
      from_node_id: lastFolderId,
      to_node_id: doc.id,
      type: GraphEdgeType.Contains,
      weight: 1,
      attributes: JSON.stringify({})
    });
  }
  /**
   * After edges are written: set this doc's outgoing counts from the parsed graph, recompute incoming for this doc and linked doc nodes, refresh tag_doc_count for touched tags.
   */
  async refreshMobiusAggregatesForIndexedDocument(doc, tenant, pathMap) {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const now = Date.now();
    const docOutgoing = doc.references.outgoing.length;
    const functionalN = filterValidFunctionalTagEntries(doc.metadata.functionalTagEntries ?? []).length;
    const ctxN = (doc.metadata.timeTags ?? []).length + (doc.metadata.geoTags ?? []).length + (doc.metadata.personTags ?? []).length;
    const otherOutgoing = (doc.metadata.topicTags ?? []).length + functionalN + (doc.metadata.keywordTags ?? []).length + ctxN;
    const outgoing = { doc_outgoing_cnt: docOutgoing, other_outgoing_cnt: otherOutgoing };
    await mobiusNodeRepo.setDocumentOutgoingDegreeCounts(
      doc.id,
      outgoing.doc_outgoing_cnt,
      outgoing.other_outgoing_cnt,
      now
    );
    const docIdsForIncoming = Array.from(
      /* @__PURE__ */ new Set([
        doc.id,
        ...doc.references.outgoing.map((r) => this.resolveOutgoingTargetNodeId(r, pathMap))
      ])
    );
    await mobiusNodeRepo.refreshDocumentIncomingDegreesForNodeIds(docIdsForIncoming, now);
    const tagNodeIds = [
      ...(doc.metadata.topicTags ?? []).map((t) => stableTopicTagNodeId(t)),
      ...filterValidFunctionalTagEntries(doc.metadata.functionalTagEntries ?? []).map(
        (e) => stableFunctionalTagNodeId(e.id)
      ),
      ...graphKeywordTagsForMobius(doc.metadata).map((k) => stableKeywordTagNodeId(k)),
      ...(doc.metadata.timeTags ?? []).map((label) => stableContextTagNodeId("time", label)),
      ...(doc.metadata.geoTags ?? []).map((label) => stableContextTagNodeId("geo", label)),
      ...(doc.metadata.personTags ?? []).map((label) => stableContextTagNodeId("person", label))
    ];
    if (tagNodeIds.length) {
      await mobiusNodeRepo.refreshTagDocCountsForTagNodeIds(tagNodeIds, now);
    }
  }
};
var GlobalMaintenanceService = class {
  /** Clears debt after a successful full maintenance pass for the given tenants. */
  async resetMaintenanceDebtAfterFullMaintenance(tenants) {
    const now = Date.now();
    for (const tenant of tenants) {
      const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);
      await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.dirtyScore, "0");
      await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.needed, "0");
      await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.lastFullAt, String(now));
    }
  }
  /**
   * Full Mobius maintenance: aggregate columns, reference-graph PageRank, `semantic_related` rebuild, then weighted semantic PageRank.
   */
  async runMobiusGlobalMaintenance(tenants = ["vault", "chat"], options) {
    const onProgress = options?.onProgress;
    const sw = new Stopwatch("[IndexService] runMobiusGlobalMaintenance");
    sw.start("mobius_aggregates");
    for (const tenant of tenants) {
      await this.refreshMobiusAggregatesInternal(tenant, onProgress);
    }
    sw.stop();
    sw.start("mobius_pagerank");
    for (const tenant of tenants) {
      await this.computeAndPersistVaultPageRankInternal(tenant, onProgress);
    }
    sw.stop();
    sw.start("semantic_related_edges");
    const semanticRebuildResults = [];
    for (const tenant of tenants) {
      const r = await SemanticRelatedEdgesRebuildService.rebuildForTenant(tenant, {
        onProgress: !onProgress ? void 0 : (p) => onProgress({
          tenant: p.tenant,
          phase: "semantic_related",
          processed: p.processed,
          total: p.total
        })
      });
      semanticRebuildResults.push(r);
      await yieldForLargePass();
    }
    sw.stop();
    sw.start("semantic_pagerank");
    for (let i = 0; i < tenants.length; i++) {
      const tenant = tenants[i];
      const rebuild = semanticRebuildResults[i];
      if (rebuild?.skipped) continue;
      await this.computeAndPersistSemanticPageRankInternal(tenant, onProgress);
    }
    sw.stop();
    if (tenants.includes("vault")) {
      sw.start("folder_hub_stats");
      await this.rebuildFolderHubStatsForVaultInternal(onProgress);
      sw.stop();
    }
    if (tenants.includes("vault")) {
      sw.start("hub_docs");
      await this.generateAndIndexHubDocsInternal(onProgress);
      sw.stop();
    }
    sw.print();
    await this.resetMaintenanceDebtAfterFullMaintenance(tenants);
  }
  async generateAndIndexHubDocsInternal(onProgress) {
    const ctx = AppContext.getInstance();
    const hub = new HubDocService(() => ctx.settings.search);
    await hub.generateAndIndexHubDocsForMaintenance({
      onProgress: (ev) => {
        onProgress?.({
          tenant: "vault",
          phase: ev.phase,
          batchIndex: ev.batchIndex,
          idsInBatch: ev.idsInBatch
        });
      }
    });
  }
  /**
   * Rebuild tag_doc_count and document degree columns via **paged SQL** (keyset on `node_id`, LIMIT = {@link DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE}).
   */
  async refreshMobiusAggregatesInternal(tenant, onProgress) {
    const now = Date.now();
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    await mobiusNodeRepo.forEachNodeIdsByTypesKeyset(
      GRAPH_TAG_NODE_TYPES,
      DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE,
      async (ids, batchIndex) => {
        await mobiusNodeRepo.refreshTagDocCountsForTagNodeIds(ids, now);
        onProgress?.({
          tenant,
          phase: "tag_doc_count",
          batchIndex,
          idsInBatch: ids.length
        });
      },
      yieldForLargePass
    );
    await mobiusNodeRepo.forEachNodeIdsByTypesKeyset(
      GRAPH_DOCUMENT_LIKE_NODE_TYPES,
      DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE,
      async (ids, batchIndex) => {
        await mobiusNodeRepo.refreshDocumentDegreesForNodeIds(ids, now);
        onProgress?.({
          tenant,
          phase: "document_degrees",
          batchIndex,
          idsInBatch: ids.length
        });
      },
      yieldForLargePass
    );
  }
  /**
   * Runs global PageRank on the directed **references** subgraph (wiki links between document-like nodes)
   * and writes `pagerank` / `pagerank_updated_at` / `pagerank_version` on `mobius_node` (dedicated columns).
   *
   * **Why not load the whole graph into memory?** The math needs many iterations; each iteration
   * re-scans `mobius_edge` in batches and only keeps O(N) state (ranks + out-degrees), not O(E) adjacency lists.
   *
   * **Out-degree source:** `doc_outgoing_cnt` on `mobius_node` — it counts reference edges to other
   * document-like targets. This run should follow `refreshDocumentDegreesForNodeIds` in full maintenance
   * so counts match the edges we scan.
   */
  async computeAndPersistVaultPageRankInternal(tenant, onProgress) {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const vertices = await mobiusNodeRepo.listDocLikePageRankVertices();
    const nodeIds = vertices.map((v) => v.node_id);
    const outDeg = new Int32Array(vertices.length);
    for (let i = 0; i < vertices.length; i++) {
      outDeg[i] = vertices[i].doc_outgoing_cnt;
    }
    const scores = await computeVaultPageRankStreaming(
      nodeIds,
      outDeg,
      async (visit2, iterIndex) => {
        let edgeBatchIndex = 0;
        for await (const batch of mobiusEdgeRepo.iterateReferenceEdgeBatches(PAGERANK_EDGE_BATCH_SIZE)) {
          for (const e of batch) {
            visit2(e.from_node_id, e.to_node_id);
          }
          if (iterIndex === 0) {
            onProgress?.({
              tenant,
              phase: "pagerank_edges",
              batchIndex: edgeBatchIndex++,
              idsInBatch: batch.length
            });
          }
          await yieldForLargePass();
        }
      }
    );
    const now = Date.now();
    const version = PAGERANK_ALGORITHM_VERSION;
    const persistChunk = 200;
    let n = 0;
    let persistBatchIndex = 0;
    for (const id of nodeIds) {
      const score = scores.get(id) ?? 0;
      await mobiusNodeRepo.setPageRankForDocLikeNode(
        id,
        {
          pagerank: score,
          pagerank_updated_at: now,
          pagerank_version: version
        },
        now
      );
      n++;
      if (n % persistChunk === 0) {
        onProgress?.({
          tenant,
          phase: "pagerank_persist",
          batchIndex: persistBatchIndex++,
          idsInBatch: persistChunk
        });
        await yieldForLargePass();
      }
    }
    const remainder = n % persistChunk;
    if (remainder > 0) {
      onProgress?.({
        tenant,
        phase: "pagerank_persist",
        batchIndex: persistBatchIndex++,
        idsInBatch: remainder
      });
    }
  }
  /**
   * Weighted PageRank on `semantic_related` (edge weights = similarity). Runs after semantic edge rebuild.
   */
  async computeAndPersistSemanticPageRankInternal(tenant, onProgress) {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const nodeIds = await mobiusNodeRepo.listDocLikeSemanticPageRankVertices();
    if (!nodeIds.length) return;
    const outgoingWeightSum = await accumulateSemanticOutgoingWeightSums(nodeIds, async (visit2) => {
      for await (const batch of mobiusEdgeRepo.iterateSemanticRelatedEdgeBatches(PAGERANK_EDGE_BATCH_SIZE)) {
        for (const e of batch) {
          visit2(e.from_node_id, e.to_node_id, e.weight);
        }
        await yieldForLargePass();
      }
    });
    const scores = await computeSemanticPageRankStreaming(
      nodeIds,
      outgoingWeightSum,
      async (visit2, iterIndex) => {
        let edgeBatchIndex = 0;
        for await (const batch of mobiusEdgeRepo.iterateSemanticRelatedEdgeBatches(PAGERANK_EDGE_BATCH_SIZE)) {
          for (const e of batch) {
            visit2(e.from_node_id, e.to_node_id, e.weight);
          }
          if (iterIndex === 0) {
            onProgress?.({
              tenant,
              phase: "semantic_pagerank_edges",
              batchIndex: edgeBatchIndex++,
              idsInBatch: batch.length
            });
          }
          await yieldForLargePass();
        }
      }
    );
    const now = Date.now();
    const version = SEMANTIC_PAGERANK_ALGORITHM_VERSION;
    const persistChunk = 200;
    let n = 0;
    let persistBatchIndex = 0;
    for (const id of nodeIds) {
      const score = scores.get(id) ?? 0;
      await mobiusNodeRepo.setSemanticPageRankForDocLikeNode(
        id,
        {
          semantic_pagerank: score,
          semantic_pagerank_updated_at: now,
          semantic_pagerank_version: version
        },
        now
      );
      n++;
      if (n % persistChunk === 0) {
        onProgress?.({
          tenant,
          phase: "semantic_pagerank_persist",
          batchIndex: persistBatchIndex++,
          idsInBatch: persistChunk
        });
        await yieldForLargePass();
      }
    }
    const remainder = n % persistChunk;
    if (remainder > 0) {
      onProgress?.({
        tenant,
        phase: "semantic_pagerank_persist",
        batchIndex: persistBatchIndex++,
        idsInBatch: remainder
      });
    }
  }
  /**
   * Rolls up document PageRank / degrees into materialized columns on `folder` nodes (vault only).
   * Must run after reference + semantic PageRank are persisted on documents.
   */
  async rebuildFolderHubStatsForVaultInternal(onProgress) {
    const tenant = "vault";
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const now = Date.now();
    await mobiusNodeRepo.clearFolderHubMaterializedStatsColumns(now);
    const hubFolder = getAIHubSummaryFolder();
    const byFolder = /* @__PURE__ */ new Map();
    let afterNodeId = null;
    let docPageIndex = 0;
    for (; ; ) {
      const page = await mobiusNodeRepo.listDocumentRowsForFolderHubStatsKeyset(
        afterNodeId,
        FOLDER_HUB_STATS_DOC_PAGE_SIZE,
        hubFolder
      );
      if (!page.length) break;
      for (const r of page) {
        const path3 = r.path ?? "";
        if (!path3) continue;
        const pr = typeof r.pagerank === "number" && Number.isFinite(r.pagerank) ? r.pagerank : 0;
        const spr = typeof r.semantic_pagerank === "number" && Number.isFinite(r.semantic_pagerank) ? r.semantic_pagerank : 0;
        const inc = Math.max(0, Math.floor(Number(r.doc_incoming_cnt ?? 0)));
        const outd = Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0)));
        let cur = path3;
        for (; ; ) {
          const slash = cur.lastIndexOf("/");
          if (slash <= 0) break;
          const folder = cur.slice(0, slash);
          if (hubFolder && isVaultPathUnderPrefix(folder, hubFolder)) break;
          let agg = byFolder.get(folder);
          if (!agg) {
            agg = { count: 0, sumPr: 0, sumSpr: 0, maxInc: 0, maxOut: 0 };
            byFolder.set(folder, agg);
          }
          agg.count += 1;
          agg.sumPr += pr;
          agg.sumSpr += spr;
          agg.maxInc = Math.max(agg.maxInc, inc);
          agg.maxOut = Math.max(agg.maxOut, outd);
          cur = folder;
        }
      }
      afterNodeId = page[page.length - 1].node_id;
      onProgress?.({
        tenant,
        phase: "folder_hub_stats",
        batchIndex: docPageIndex++,
        idsInBatch: page.length
      });
      await yieldForLargePass();
    }
    const writeAt = Date.now();
    let folderWriteIndex = 0;
    for (const [folderPath, agg] of byFolder) {
      const nodeId = stableMobiusFolderNodeId(tenant, folderPath);
      const n = agg.count;
      const avgPr = agg.sumPr / Math.max(1, n);
      const avgSpr = agg.sumSpr / Math.max(1, n);
      await mobiusNodeRepo.updateFolderNodeHubMaterializedStats(
        nodeId,
        {
          tagDocCount: n,
          avgPagerank: avgPr,
          avgSemanticPagerank: avgSpr,
          maxDocIncoming: agg.maxInc,
          maxDocOutgoing: agg.maxOut
        },
        writeAt
      );
      folderWriteIndex++;
      if (folderWriteIndex % 150 === 0) {
        await yieldForLargePass();
      }
    }
  }
};
var IndexService = class _IndexService {
  constructor() {
    this.crud = new IndexCrudService();
    this.single = null;
    this.globalMaintenance = new GlobalMaintenanceService();
  }
  static {
    this.instance = null;
  }
  static {
    this.isIndexingCancelled = false;
  }
  ensureSingle() {
    if (!this.aiServiceManager) {
      throw new Error("[IndexService] init(AIServiceManager) must be called before indexing");
    }
    if (!this.single) {
      this.single = new IndexSingleService(this.aiServiceManager, this.crud);
    }
    return this.single;
  }
  static getInstance() {
    if (!_IndexService.instance) {
      _IndexService.instance = new _IndexService();
    }
    return _IndexService.instance;
  }
  /**
   * Clear the global singleton instance.
   * Call from plugin onunload to release memory.
   */
  static clearInstance() {
    _IndexService.instance = null;
  }
  /**
   * Initialize IndexService with AIServiceManager for embedding generation.
   * This should be called once during plugin initialization in main.ts.
   * Can also be called when settings are updated to refresh the service instance.
   */
  init(aiServiceManager) {
    this.aiServiceManager = aiServiceManager;
    this.single = new IndexSingleService(aiServiceManager, this.crud);
  }
  /** Cancel ongoing indexing operations. */
  static cancelIndexing() {
    _IndexService.isIndexingCancelled = true;
  }
  /** Reset the cancellation flag. */
  static resetCancellation() {
    _IndexService.isIndexingCancelled = false;
  }
  /** Check if indexing has been cancelled. */
  static isCancelled() {
    return _IndexService.isIndexingCancelled;
  }
  async indexDocument(docPath, settings) {
    return this.ensureSingle().indexDocument(docPath, settings);
  }
  async deleteDocuments(paths, onAfterMutation) {
    return this.crud.deleteDocuments(paths, onAfterMutation);
  }
  async clearAllIndexData(onAfterMutation) {
    return this.crud.clearAllIndexData(onAfterMutation);
  }
  async cleanupOrphanedSearchIndexData() {
    return this.crud.cleanupOrphanedSearchIndexData();
  }
  async getIndexStatus() {
    return this.crud.getIndexStatus();
  }
  async renameDocumentPath(oldPath, newPath) {
    return this.crud.renameDocumentPath(oldPath, newPath);
  }
  async isMobiusMaintenanceRecommended() {
    return this.crud.isMobiusMaintenanceRecommended();
  }
  async runMobiusGlobalMaintenance(tenants = ["vault", "chat"], options) {
    return this.globalMaintenance.runMobiusGlobalMaintenance(tenants, options);
  }
};

// src/service/search/index/helper/hub/hubDocServices.ts
var HubDocService = class {
  constructor(getSearchSettings) {
    this.getSearchSettings = getSearchSettings;
    this.discovery = new HubCandidateDiscoveryService();
    this.markdown = new HubMarkdownService();
  }
  /**
   * Run hub discovery (merged sources, greedy coverage selection, optional whole-round LLM review), then LLM fill, materialize/update, reindex (vault only).
   * Discovery caps come from {@link computeHubDiscoverBudgets} inside {@link HubCandidateDiscoveryService.discoverAllHubCandidates}.
   */
  async generateAndIndexHubDocsForMaintenance(options) {
    const sw = new Stopwatch("HubDocService.generateAndIndexHubDocsForMaintenance");
    const app = AppContext.getApp();
    const hubPath = getAIHubSummaryFolder();
    const manualHubFolder = getAIManualHubFolder();
    const searchSettings = this.getSearchSettings();
    const indexService = IndexService.getInstance();
    sw.start("ensureHubFolders");
    await ensureFolder(app, hubPath);
    await ensureFolder(app, manualHubFolder);
    sw.stop();
    sw.start("indexManualHubDocs");
    for (const p of listMarkdownPathsUnderFolder(manualHubFolder)) {
      await indexService.indexDocument(p, searchSettings);
    }
    sw.stop();
    sw.start("discoverAllHubCandidates");
    const candidates = await this.discovery.discoverAllHubCandidates();
    sw.stop();
    options?.onProgress?.({
      phase: "hub_discovery",
      batchIndex: 0,
      idsInBatch: candidates.length
    });
    const hubNodeIdSet = new Set(
      candidates.filter((c) => c.sourceKind === "document" || c.sourceKind === "manual").map((c) => c.nodeId)
    );
    let materializeCompleted = 0;
    sw.start("materializeAndIndexHubDocs");
    const materializeResults = await mapWithConcurrency(
      candidates,
      {
        limit: HUB_MATERIALIZE_CONCURRENCY,
        stopwatch: sw
      },
      async (c, _index, trace) => {
        if (c.sourceKind === "manual") {
          trace.start("indexManual");
          await indexService.indexDocument(c.path, searchSettings);
          trace.stop();
          materializeCompleted++;
          options?.onProgress?.({
            phase: "hub_materialize",
            batchIndex: materializeCompleted,
            idsInBatch: candidates.length
          });
          return { writtenPath: null, skippedUserOwned: 0 };
        }
        const name = `Hub-${hashString(c.stableKey, 12)}.md`;
        const fullPath = (0, import_obsidian18.normalizePath)(`${hubPath}/${name}`);
        trace.start("assembly");
        const assembly = await resolveHubDocAssembly(c, hubNodeIdSet);
        trace.stop();
        trace.start("buildMd");
        let body = this.markdown.buildHubDocMarkdown({
          candidate: c,
          generatedAt: Date.now(),
          assembly
        });
        trace.stop();
        trace.start("llm");
        body = await this.markdown.fillHubDocWithLLMSummary(body, c);
        trace.stop();
        trace.start("vaultLookup");
        const existing = app.vault.getAbstractFileByPath(fullPath);
        trace.stop();
        if (existing instanceof import_obsidian18.TFile) {
          trace.start("vaultRead");
          const prev = await app.vault.read(existing);
          trace.stop();
          if (peekUserOwnedOrAutoOff(prev)) {
            materializeCompleted++;
            options?.onProgress?.({
              phase: "hub_materialize",
              batchIndex: materializeCompleted,
              idsInBatch: candidates.length
            });
            return { writtenPath: null, skippedUserOwned: 1 };
          }
          trace.start("vaultWrite");
          await app.vault.modify(existing, body);
          trace.stop();
        } else {
          trace.start("vaultWrite");
          await app.vault.create(fullPath, body);
          trace.stop();
        }
        trace.start("indexDoc");
        await indexService.indexDocument(fullPath, searchSettings);
        trace.stop();
        materializeCompleted++;
        options?.onProgress?.({
          phase: "hub_materialize",
          batchIndex: materializeCompleted,
          idsInBatch: candidates.length
        });
        return { writtenPath: fullPath, skippedUserOwned: 0 };
      }
    );
    sw.stop();
    const written = [];
    let skippedUserOwned = 0;
    for (const r of materializeResults) {
      if (r.writtenPath) written.push(r.writtenPath);
      skippedUserOwned += r.skippedUserOwned;
    }
    options?.onProgress?.({
      phase: "hub_index",
      batchIndex: written.length,
      idsInBatch: written.length
    });
    sw.print(false);
    return { written, skippedUserOwned };
  }
};
var HUB_DOC_LLM_MAX_NOTE_CHARS = 14e3;
var HUB_DOC_LLM_MAX_CLUSTER_SNIPPET = 4e3;
var HubMarkdownService = class {
  /**
   * Full HubDoc markdown body + YAML frontmatter.
   */
  buildHubDocMarkdown(params) {
    const { candidate, generatedAt, assembly } = params;
    const cs = candidate.candidateScore;
    const fm = {
      type: "hub_doc",
      source_kind: candidate.sourceKind,
      hub_source_kinds: candidate.sourceKinds,
      hub_source_consensus: Number(candidate.sourceConsensusScore.toFixed(4)),
      hub_ranking_score: Number(candidate.rankingScore.toFixed(4)),
      source_path: candidate.path,
      source_node_id: candidate.nodeId,
      hub_role: candidate.role,
      hub_score: Number(candidate.graphScore.toFixed(4)),
      [HUB_FRONTMATTER_KEYS.autoHub]: true,
      [HUB_FRONTMATTER_KEYS.userOwned]: false,
      generated_at: generatedAt
    };
    if (cs) {
      fm.hub_physical_authority = Number(cs.physicalAuthorityScore.toFixed(4));
      fm.hub_organizational = Number(cs.organizationalScore.toFixed(4));
      fm.hub_semantic_centrality = Number(cs.semanticCentralityScore.toFixed(4));
      fm.hub_manual_boost = Number(cs.manualBoost.toFixed(4));
    }
    const lg = assembly?.localHubGraph;
    if (lg) {
      fm.hub_local_graph_nodes = lg.nodes.length;
      fm.hub_local_graph_edges = lg.edges.length;
      fm.hub_frontier_reason = lg.frontierSummary.reason;
      fm.hub_frontier_depth = lg.frontierSummary.stoppedAtDepth;
    }
    const routes = assembly?.childHubRoutes ?? candidate.childHubRoutes;
    if (routes?.length) {
      fm.hub_child_routes = routes.map((r) => `${r.path}::${r.nodeId}`);
    }
    const ah = candidate.assemblyHints;
    if (ah) {
      fm.hub_assembly_topology = ah.expectedTopology;
      fm.hub_assembly_stop_at_child = ah.stopAtChildHub;
      if (ah.anchorTopicTags.length) {
        fm.hub_anchor_topic_tags = ah.anchorTopicTags.slice(0, 16);
      }
      if (ah.preferredChildHubNodeIds.length) {
        fm.hub_preferred_child_hub_ids = ah.preferredChildHubNodeIds.slice(0, 16);
      }
    }
    const members = assembly?.clusterMemberPaths ?? candidate.clusterMemberPaths;
    if (members?.length) {
      fm.hub_cluster_members = members.slice(0, SLICE_CAPS.hub.frontmatterClusterMembers);
    }
    const yamlLines = Object.entries(fm).filter(([, v]) => v !== void 0 && v !== null).map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}: [${v.map((p) => JSON.stringify(p)).join(", ")}]`;
      }
      if (typeof v === "string") {
        return `${k}: ${JSON.stringify(v)}`;
      }
      if (typeof v === "boolean") {
        return `${k}: ${v}`;
      }
      return `${k}: ${v}`;
    }).join("\n");
    const topoLines = routes?.map((r) => `- Sub-hub: [[${r.path}]] (${escapeMermaidQuotedLabel(r.label)})`).join("\n") ?? `- Scope: \`${candidate.path}\``;
    const memberBlock = (members ?? assembly?.memberPathsSample ?? []).slice(0, SLICE_CAPS.hub.markdownMemberWikiLines).map((p) => `- [[${p}]]`).join("\n") || "_N/A_";
    return `---
${yamlLines}
---

# Short Summary

_TODO: one or two sentences for retrieval anchors._

# Full Summary

_TODO: 1000\u20131500 chars dense overview._

# Topology Routes

${topoLines}

# Cluster / members

${memberBlock}

# Core Facts

1. _TODO_

# Tag / Topic Distribution

_TODO_

# Time Dimension

_TODO_

# Mermaid

\`\`\`mermaid
flowchart LR
  center["${escapeMermaidQuotedLabel(candidate.label)}"]
\`\`\`

# Query Anchors

_TODO: high-recall phrases._

# Source scope

- [[${candidate.path}]]
`;
  }
  /**
   * Fill sections via {@link PromptId.HubDocSummary} and structured output; returns original markdown on failure.
   */
  async fillHubDocWithLLMSummary(markdown, candidate) {
    try {
      const ctx = AppContext.getInstance();
      if (ctx.isMockEnv) return markdown;
      const ai = ctx.settings.ai;
      if (!ai?.defaultModel?.provider?.trim() || !ai?.defaultModel?.modelId?.trim()) {
        console.warn("[fillHubDocWithLLMSummary] No defaultModel; skipping LLM fill.");
        return markdown;
      }
      const excerpts = await this.buildHubVaultExcerpts(candidate);
      const bodyPreview = hubDocMarkdownBodyForLlm(markdown).slice(0, SLICE_CAPS.hub.llmDraftBodyChars);
      const hubMetadataJson = JSON.stringify({
        label: candidate.label,
        path: candidate.path,
        sourceKind: candidate.sourceKind,
        sourceKinds: candidate.sourceKinds,
        sourceConsensusScore: candidate.sourceConsensusScore,
        rankingScore: candidate.rankingScore,
        sourceEvidence: candidate.sourceEvidence,
        role: candidate.role,
        graphScore: candidate.graphScore,
        candidateScore: candidate.candidateScore ?? null,
        pagerank: candidate.pagerank,
        semanticPagerank: candidate.semanticPagerank,
        docIncomingCnt: candidate.docIncomingCnt,
        docOutgoingCnt: candidate.docOutgoingCnt,
        childHubRoutes: candidate.childHubRoutes?.slice(0, SLICE_CAPS.hub.llmMetadataRoutes) ?? [],
        clusterMemberPaths: candidate.clusterMemberPaths?.slice(0, SLICE_CAPS.hub.llmMetadataRoutes) ?? [],
        assemblyHints: candidate.assemblyHints ?? null
      });
      const parsed = await ctx.manager.streamObjectWithPrompt(
        "hub-doc-summary" /* HubDocSummary */,
        {
          hubMetadataJson,
          draftMarkdownBody: bodyPreview,
          vaultExcerpts: excerpts || "_No excerpts available._"
        },
        hubDocSummaryLlmSchema
      );
      return applyHubDocLlmPayloadToMarkdown(markdown, parsed);
    } catch (e) {
      console.warn("[fillHubDocWithLLMSummary] LLM fill failed:", e);
      return markdown;
    }
  }
  async buildHubVaultExcerpts(candidate) {
    const app = AppContext.getApp();
    const chunks = [];
    const primary = await readVaultTextSnippet(app, candidate.path, HUB_DOC_LLM_MAX_NOTE_CHARS);
    if (primary) {
      chunks.push(`### Primary path: ${candidate.path}
${primary}`);
    }
    if (candidate.clusterMemberPaths?.length) {
      let budget = HUB_DOC_LLM_MAX_CLUSTER_SNIPPET * 3;
      for (const mp of candidate.clusterMemberPaths.slice(0, SLICE_CAPS.hub.llmClusterMemberSnippets)) {
        if (budget <= 0) break;
        const sn = await readVaultTextSnippet(
          app,
          mp,
          Math.min(HUB_DOC_LLM_MAX_CLUSTER_SNIPPET, budget)
        );
        if (sn) {
          chunks.push(`### Member: ${mp}
${sn}`);
          budget -= sn.length;
        }
      }
    }
    return chunks.join("\n\n---\n\n");
  }
};
function peekUserOwnedOrAutoOff(body) {
  const parsed = parseFrontmatter(body);
  if (!parsed) return false;
  const d = parsed.data;
  const userOwned = d[HUB_FRONTMATTER_KEYS.userOwned];
  if (userOwned === true || userOwned === "true") return true;
  const autoHub = d[HUB_FRONTMATTER_KEYS.autoHub];
  if (autoHub === false || autoHub === "false") return true;
  return false;
}

// src/service/tools/search-graph-inspector/hub-local-graph.ts
async function hubLocalGraph(params, templateManager) {
  const centerPath = String(params.center_note_path ?? "").trim();
  if (!centerPath) {
    return "Hub local graph failed. center_note_path is required.";
  }
  const tenant = getIndexTenantForPath(centerPath);
  const maxDepth = Math.max(1, Math.min(6, Number(params.max_depth ?? 4) || 4));
  const local = await buildLocalHubGraphForPath({
    tenant,
    centerPath,
    hubNodeIdSet: /* @__PURE__ */ new Set(),
    maxDepth
  });
  if (!local) {
    return `Hub local graph failed. Start note "${centerPath}" not found in database.`;
  }
  const data = {
    center_note_path: centerPath,
    max_depth: maxDepth,
    frontierSummary: local.frontierSummary,
    coverageSummary: local.coverageSummary,
    graph: {
      nodes: local.nodes.map((node) => ({
        id: node.nodeId,
        label: node.label,
        type: node.type,
        depth: node.depth,
        foundBy: "physical_neighbors",
        path: node.path,
        attributes: {
          hubNodeWeight: node.hubNodeWeight,
          distancePenalty: node.distancePenalty,
          cohesionScore: node.cohesionScore,
          bridgePenalty: node.bridgePenalty,
          roleHint: node.roleHint,
          expandPriority: node.expandPriority
        }
      })),
      edges: local.edges.map((edge) => ({
        from_node_id: edge.fromNodeId,
        to_node_id: edge.toNodeId,
        type: edge.edgeType,
        weight: edge.hubEdgeWeight,
        attributes: {
          weight: edge.hubEdgeWeight,
          hubEdgeWeight: edge.hubEdgeWeight,
          edgeTypeWeight: edge.edgeTypeWeight,
          semanticSupport: edge.semanticSupport,
          crossBoundaryPenalty: edge.crossBoundaryPenalty
        }
      }))
    }
  };
  const markdownTemplate = [
    "# Hub local graph",
    "",
    "- Center: `{{center_note_path}}`",
    "- Max depth: `{{max_depth}}`",
    "- Nodes: `{{graph.nodes.length}}`",
    "- Edges: `{{graph.edges.length}}`",
    "- Stop reason: `{{frontierSummary.reason}}`"
  ].join("\n");
  return buildResponse(params.response_format ?? "structured", markdownTemplate, data, {
    templateManager
  });
}

// src/service/tools/search-graph-inspector.ts
function inspectNoteContextTool(templateManager) {
  return safeAgentTool({
    description: `[Deep Dive] [detailed analysis] Use this tool to understand a single note's identity (tags, connections, location). Includes 'get_note_connections', 'get_note_tags', 'get_note_categories'.`,
    inputSchema: inspectNoteContextInputSchema,
    execute: async (params) => {
      return await inspectNoteContext({ ...params, mode: "inspect_note_context" }, templateManager);
    }
  });
}
function inspectNoteContextToolMarkdownOnly(templateManager) {
  return safeAgentTool({
    description: `[Deep Dive] Use this tool to understand a single note's identity (tags, connections, location). Returns Markdown only.`,
    inputSchema: inspectNoteContextInputSchema,
    execute: async (params) => {
      return await inspectNoteContext(
        { ...params, response_format: "markdown", mode: "inspect_note_context" },
        templateManager
      );
    }
  });
}
function graphTraversalTool(templateManager) {
  return safeAgentTool({
    description: `[Relational Discovery] Explore related notes within N degrees of separation (hops). Find knowledge clusters and neighborhood.`,
    inputSchema: graphTraversalInputSchema,
    execute: async (params) => {
      return await graphTraversal({ ...params, mode: "graph_traversal" }, templateManager);
    }
  });
}
function graphTraversalToolMarkdownOnly(templateManager) {
  return safeAgentTool({
    description: `[Relational Discovery] Explore related notes within N degrees of separation (hops). Returns Markdown only.`,
    inputSchema: graphTraversalInputSchema,
    execute: async (params) => {
      return await graphTraversal(
        { ...params, response_format: "markdown", mode: "graph_traversal" },
        templateManager
      );
    }
  });
}
function hubLocalGraphTool(templateManager) {
  return safeAgentTool({
    description: `[Hub Local Graph] Build a weighted local graph around one note to inspect how a hub should expand, where it should stop, and which nodes/edges matter most.`,
    inputSchema: hubLocalGraphInputSchema,
    execute: async (params) => {
      return await hubLocalGraph(params, templateManager);
    }
  });
}
function findPathTool(templateManager) {
  return safeAgentTool({
    description: `Discover connection paths between two specific notes. Useful for finding how two concepts are related.`,
    inputSchema: findPathInputSchema,
    execute: async (params) => {
      return await findPath({ ...params, mode: "find_path" }, templateManager);
    }
  });
}
function findKeyNodesTool(templateManager) {
  return safeAgentTool({
    description: `Identify influential notes (high connectivity nodes, hubs) in the vault.`,
    inputSchema: findKeyNodesInputSchema,
    execute: async (params) => {
      return await findKeyNodes({ ...params, mode: "find_key_nodes" }, templateManager);
    }
  });
}
function findOrphansTool(templateManager) {
  return safeAgentTool({
    description: `Find disconnected/unlinked notes (orphans) in the vault.`,
    inputSchema: findOrphansInputSchema,
    execute: async (params) => {
      return await findOrphanNotes({ ...params, mode: "find_orphans" }, templateManager);
    }
  });
}
function searchByDimensionsTool(templateManager) {
  return safeAgentTool({
    description: `Complex multi-criteria searches. Advanced filtering by tags, folders, time ranges with boolean logic. Use only tag:value, functional:value, AND, OR, NOT, and parentheses. Each value must be a single word (no spaces, no special characters). Example: tag:javascript AND functional:programming or (tag:react OR tag:vue) AND functional:frontend`,
    inputSchema: searchByDimensionsInputSchema,
    execute: async (params) => {
      return await searchByDimensions({ ...params, mode: "search_by_dimensions" }, templateManager);
    }
  });
}
function exploreFolderTool(templateManager) {
  return safeAgentTool({
    description: `Inspect vault structure with spatial navigation. Use this to 'walk' through folders. Best paired with 'response_format: markdown' to visualize the directory tree clearly.Use this when you need to:
- Browse folders and understand vault organization
- Check folder contents before moving or organizing notes
- Discover vault structure for better context understanding`,
    inputSchema: exploreFolderInputSchema,
    execute: async (params) => {
      return await exploreFolder({ ...params, mode: "explore_folder" }, templateManager);
    }
  });
}
function exploreFolderToolMarkdownOnly(templateManager) {
  return safeAgentTool({
    description: `Inspect vault structure with spatial navigation (Markdown-only output). This tool will always return Markdown regardless of response_format.`,
    inputSchema: exploreFolderInputSchema,
    execute: async (params) => {
      return await exploreFolder(
        { ...params, response_format: "markdown", mode: "explore_folder" },
        templateManager
      );
    }
  });
}
function grepFileTreeTool() {
  return safeAgentTool({
    description: `[Anchor phase] Grep the full vault file tree by pattern (substring or regex). Returns matching paths so you can choose which folders to explore_folder or which nodes to graph_traversal. Use in recon to quickly find anchor paths or directory names.`,
    inputSchema: grepFileTreeInputSchema,
    execute: async (params) => grepFileTree(params)
  });
}
function recentChangesWholeVaultTool(templateManager) {
  return safeAgentTool({
    description: `View recently modified notes in the whole vault. Great for understanding users' current focus.`,
    inputSchema: recentChangesWholeVaultInputSchema,
    execute: async (params) => {
      return await getRecentChanges({ ...params, mode: "recent_changes_whole_vault" }, templateManager);
    }
  });
}
function localSearchWholeVaultTool(templateManager) {
  return safeAgentTool({
    description: `Full-text and semantic search across the vault. Use keywords or semantic description to find relevant notes.`,
    inputSchema: localSearchWholeVaultInputSchema,
    execute: async (params) => {
      const rawFolder = params.folder_path;
      const folderPath = rawFolder != null && String(rawFolder).trim() !== "" ? String(rawFolder).trim().replace(/\/+$/, "") : void 0;
      const scopeValue = {
        currentFilePath: params.current_file_path,
        folderPath,
        limitIdsSet: params.limit_ids_set
      };
      return await localSearch(
        { ...params, scopeValue, mode: "local_search_whole_vault" },
        templateManager
      );
    }
  });
}

// src/core/providers/types.ts
function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}
var EMPTY_USAGE = emptyUsage();
function mergeTokenUsage(usage1, usage2) {
  const u1 = usage1 ?? EMPTY_USAGE;
  const u2 = usage2 ?? EMPTY_USAGE;
  return {
    inputTokens: (u1.inputTokens ?? 0) + (u2.inputTokens ?? 0) || void 0,
    outputTokens: (u1.outputTokens ?? 0) + (u2.outputTokens ?? 0) || void 0,
    totalTokens: (u1.totalTokens ?? 0) + (u2.totalTokens ?? 0) || void 0,
    reasoningTokens: (u1.reasoningTokens ?? 0) + (u2.reasoningTokens ?? 0) || void 0,
    cachedInputTokens: (u1.cachedInputTokens ?? 0) + (u2.cachedInputTokens ?? 0) || void 0
  };
}

// src/core/utils/functions.ts
function refreshableMemoizeSupplier(supplier, stateProvider, checkIsChanged) {
  let cache;
  let lastState;
  let isComputed = false;
  return () => {
    const currentState = stateProvider();
    if (!isComputed || checkIsChanged(lastState, currentState)) {
      cache = supplier();
      lastState = currentState;
      isComputed = true;
    }
    return cache;
  };
}

// src/service/tools/content-reader.ts
function escapeRegExpLiteral(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildAutoRegex(query, caseSensitive) {
  const flags = caseSensitive ? "g" : "gi";
  try {
    return { regex: new RegExp(query, flags), isLiteralFallback: false };
  } catch {
    return { regex: new RegExp(escapeRegExpLiteral(query), flags), isLiteralFallback: true };
  }
}
function contentReaderTool() {
  const settings = AppContext.getInstance().settings.search;
  const inputSchema = makeContentReaderInputSchema({
    shortSummaryLength: settings.shortSummaryLength,
    fullSummaryLength: settings.fullSummaryLength
  });
  return safeAgentTool({
    description: "Read the content of a specific file (note) by its path.",
    inputSchema,
    execute: async ({ path: path3, mode, lineRange, query, case_sensitive, max_matches }) => {
      const isMetaLoad = mode === "meta";
      if (!isMetaLoad && (mode === "shortSummary" || mode === "fullSummary")) {
        try {
          const tenant = getIndexTenantForPath(path3);
          const indexed = await sqliteStoreManager.getIndexedDocumentRepo(tenant).getByPath(path3);
          if (indexed) {
            if (mode === "shortSummary" && indexed.summary?.trim()) {
              return indexed.summary;
            }
            if (mode === "fullSummary") {
              const full = indexed.full_summary?.trim() || indexed.summary?.trim();
              if (full) {
                return full;
              }
            }
          }
        } catch {
        }
      }
      const document = await DocumentLoaderManager.getInstance().readByPath(path3, !isMetaLoad);
      if (!document) {
        return {
          path: path3,
          content: "File not found or not readable or not supported."
        };
      }
      if (isMetaLoad) {
        return document.metadata;
      }
      const { cacheFileInfo, sourceFileInfo, summary } = document;
      const fullContent = (sourceFileInfo?.content ?? cacheFileInfo?.content ?? "No content found").toString();
      if (mode === "fullContent") {
        const FULL_CONTENT_MAX_CHARS = 4e4;
        if (fullContent.length > FULL_CONTENT_MAX_CHARS) {
          return {
            path: path3,
            content: `fullContent refused: file is too large (${fullContent.length} chars, max ${FULL_CONTENT_MAX_CHARS}). Use mode 'shortSummary', 'grep' (with query), or 'range' (with lineRange) instead.`
          };
        }
        return fullContent || "";
      }
      if (mode === "shortSummary" && document.summary) {
        return summary;
      }
      if (mode === "fullSummary") {
        return document.cacheFileInfo.content;
      }
      if (mode === "range") {
        const contentLines = (fullContent || "").split(/\r?\n/);
        const startLine = Math.max(1, lineRange.start);
        const endLine = Math.max(startLine, lineRange.end);
        const startIdx = startLine - 1;
        const endIdxExclusive = Math.min(contentLines.length, endLine);
        return contentLines.slice(startIdx, endIdxExclusive).join("\n");
      }
      if (mode === "grep") {
        const contentLines = (fullContent || "").split(/\r?\n/);
        const cap = Math.min(50, max_matches ?? 50);
        const { regex, isLiteralFallback } = buildAutoRegex(query, case_sensitive ?? true);
        const matches = [];
        for (let i = 0; i < contentLines.length; i++) {
          const lineText = contentLines[i] ?? "";
          regex.lastIndex = 0;
          let guard = 0;
          let m;
          while ((m = regex.exec(lineText)) !== null) {
            const col = (m.index ?? 0) + 1;
            matches.push({ path: path3, line: i + 1, col, text: lineText });
            if (matches.length >= cap) break;
            if (m[0]?.length === 0) {
              regex.lastIndex = Math.min(lineText.length, regex.lastIndex + 1);
            }
            guard++;
            if (guard > 1e4) break;
          }
          if (matches.length >= cap) break;
        }
        return { matches };
      }
      return fullContent || "";
    }
  });
}

// src/service/agents/search-agent-helper/AgentContextManager.ts
var ANALYSIS_HISTORY_STAGES = [
  "Classify",
  "Dimensions",
  "Recon",
  "Consolidator",
  "EvidenceGroups",
  "Evidence"
];
var DEFAULT_GREP_MAX_MATCHES = 50;
function escapeRegExpLiteral2(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildAutoRegex2(query, caseSensitive) {
  const flags = caseSensitive ? "g" : "gi";
  try {
    return { regex: new RegExp(query, flags), isLiteralFallback: false };
  } catch {
    return { regex: new RegExp(escapeRegExpLiteral2(query), flags), isLiteralFallback: true };
  }
}
var AgentContextManager = class {
  constructor(aiServiceManager) {
    this.aiServiceManager = aiServiceManager;
    /** Initial prompt. */
    this.initialPrompt = "";
    /** Verified paths (exist in vault/DB or appeared in tool outputs). */
    this.verifiedPaths = /* @__PURE__ */ new Set();
    /** 
     * Recall pipeline snapshot: dimensions after classify, 
     */
    this.recallDimensions = [];
    /** 
     * After Classify before Recon. User persona from classifier (appeal, detail_level). Persisted after classify for report phases. 
     */
    this.userPersonaConfig = null;
    /**
     * After Recon. Recon reports per dimension (persisted after batchStreamRecon for dossier/finish).
     */
    this.reconReports = [];
    /**
     * After Recon. Weaved context markdown (structure + mesh) from mergePaths; set by SlotRecallAgent onReconFinish.
     */
    this.reconWeavedContext = void 0;
    /** 
     * After Recon before Evidence. Consolidator output (persisted after streamTaskConsolidator for dossier/finish). 
     */
    this.consolidatorOutput = null;
    /** 
     * Recall pipeline snapshot: evidenceGroups after recon. 
     */
    this.recallEvidenceTaskGroups = [];
    /** 
     * Recall pipeline snapshot: then final evidencePacks. 
     */
    this.recallEvidencePacks = [];
    /** 
     * Report pipeline snapshot: Topics from search agent (after report plan). 
     */
    this.topics = [];
    /** 
     * Report pipeline snapshot: Sources from search agent (after report plan). 
     */
    this.sources = [];
    /** 
     * Report pipeline snapshot: Dashboard blocks from dashboard blocks agent (after report plan). 
     */
    this.dashboardBlocks = [];
    /** 
     * Report pipeline snapshot: Summary from summary agent (after report plan). 
     */
    this.summary = "";
    /** Report pipeline: short display title (e.g. for save filename, recent list). */
    this.title = "";
    this.totalTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    /** Full memory as single text from structured sections (for keyword grep fallback). */
    this.fullMemoryTextSupplier = refreshableMemoizeSupplier(
      () => {
        const prompt = this.initialPrompt ?? "";
        const parts = ["[User]\n" + prompt];
        for (const stage of ANALYSIS_HISTORY_STAGES) {
          const text = this.getSectionText(stage, {});
          if (text.trim()) parts.push(`[${stage}]
${text}`);
        }
        return parts.join("\n\n");
      },
      () => this.verifiedPaths.size + this.recallDimensions.length + this.reconReports.length + (this.consolidatorOutput ? 1 : 0) + this.recallEvidenceTaskGroups.length + this.recallEvidencePacks.length,
      (a, b) => a !== b
    );
  }
  resetAgentMemory(initialPrompt) {
    this.initialPrompt = initialPrompt ?? "";
    this.totalTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    this.title = "";
    this.summary = "";
    this.topics = [];
    this.sources = [];
    this.dashboardBlocks = [];
    this.suggestedFollowUpQuestions = void 0;
    this.mermaidOverviewFromEvidenceWeaved = void 0;
    this.reportPlan = void 0;
    this.reportVisualBlueprint = void 0;
    this.reportBlockBlueprintItems = void 0;
    this.verifiedPaths.clear();
    this.recallDimensions = [];
    this.recallEvidenceTaskGroups = [];
    this.recallEvidencePacks = [];
    this.reconReports = [];
    this.reconWeavedContext = void 0;
    this.consolidatorOutput = null;
    this.userPersonaConfig = null;
  }
  /** Report pipeline: title (used for save filename, recent list). */
  getTitle() {
    return this.title ?? "";
  }
  setTitle(value) {
    this.title = (value ?? "").trim() || "";
  }
  getSummary() {
    return this.summary ?? "";
  }
  setSummary(value) {
    this.summary = value ?? "";
  }
  getTopics() {
    return this.topics ?? [];
  }
  setTopics(value) {
    this.topics = value ?? [];
  }
  getSources() {
    return this.sources ?? [];
  }
  setSources(value) {
    this.sources = value ?? [];
  }
  getDashboardBlocks() {
    return this.dashboardBlocks ?? [];
  }
  setDashboardBlocks(value) {
    this.dashboardBlocks = value ?? [];
  }
  getSuggestedFollowUpQuestions() {
    return this.suggestedFollowUpQuestions ?? [];
  }
  setSuggestedFollowUpQuestions(value) {
    this.suggestedFollowUpQuestions = value ?? void 0;
  }
  getEvidenceWeavedMermaidOverview() {
    return (this.mermaidOverviewFromEvidenceWeaved ?? "").trim();
  }
  setEvidenceWeavedMermaidOverviewAgent(value) {
    this.mermaidOverviewFromEvidenceWeaved = value;
  }
  getReportPlan() {
    return this.reportPlan;
  }
  setReportPlan(value) {
    this.reportPlan = value;
  }
  /**
   * Build a compact markdown "plan" so Summary can preview the report structure
   * and reference blocks naturally via #block-<id> anchors.
   *
   * Prefers ReportPlan (body/appendices specs). Falls back to current dashboard blocks.
   */
  buildDashboardBlockPlanMarkdown() {
    const plan = this.reportPlan;
    const blocks = this.dashboardBlocks ?? [];
    const lines = [];
    if (plan && ((plan.bodyBlocksSpec?.length ?? 0) > 0 || (plan.appendicesBlocksSpec?.length ?? 0) > 0)) {
      lines.push("Body blocks:");
      for (const b of plan.bodyBlocksSpec ?? []) {
        const parts = [];
        parts.push(`- [${b.title}](#block-${b.blockId}) (id: ${b.blockId}; role: ${b.role}${b.wordTarget ? `; target: ~${b.wordTarget}w` : ""})`);
        if (b.paragraphSkeleton) parts.push(`  - skeleton: ${b.paragraphSkeleton}`);
        if (b.evidenceBinding) parts.push(`  - evidence: ${b.evidenceBinding}`);
        if (b.risksUncertaintyHint) parts.push(`  - uncertainty: ${b.risksUncertaintyHint}`);
        lines.push(...parts);
      }
      if ((plan.appendicesBlocksSpec?.length ?? 0) > 0) {
        lines.push("", "Appendices blocks:");
        for (const a of plan.appendicesBlocksSpec ?? []) {
          const parts = [];
          parts.push(`- [${a.title}](#block-${a.blockId}) (id: ${a.blockId}; role: ${a.role})`);
          if (a.contentHint) parts.push(`  - hint: ${a.contentHint}`);
          lines.push(...parts);
        }
      }
    } else if (blocks.length > 0) {
      lines.push("Current blocks:");
      for (const b of blocks) {
        const id = (b.id ?? "").trim();
        if (!id) continue;
        const title = (b.title ?? "").trim() || "(untitled)";
        const engine = (b.renderEngine ?? "MARKDOWN").toUpperCase();
        lines.push(`- [${title}](#block-${id}) (id: ${id}; engine: ${engine})`);
      }
    }
    const text = lines.join("\n").trim();
    return text ? text : void 0;
  }
  getReportVisualBlueprint() {
    return this.reportVisualBlueprint;
  }
  setReportVisualBlueprint(value) {
    this.reportVisualBlueprint = value;
  }
  /** Final weaved report block blueprint items (structured; internal report generation only). */
  getReportBlockBlueprintItems() {
    return this.reportBlockBlueprintItems ?? [];
  }
  setReportBlockBlueprintItems(value) {
    this.reportBlockBlueprintItems = value ?? [];
  }
  /** Persist user persona from classifier (appeal, detail_level). Used by report phases for style. */
  setUserPersonaConfig(config) {
    this.userPersonaConfig = config && (config.appeal != null || config.detail_level != null) ? config : null;
  }
  getUserPersonaConfig() {
    return this.userPersonaConfig;
  }
  /** Persist recon reports (from RawSearchAgent after batchStreamRecon). */
  setReconReports(reports) {
    this.reconReports = reports ?? [];
  }
  /** Persist recon from physical-task flow: mergedPaths applied per dimension for compatibility with getReconReports(). */
  setReconReportsFromPhysicalTasks(physicalTasks, mergedPaths) {
    const expanded = [];
    for (const task of physicalTasks) {
      for (const dimId of task.covered_dimension_ids) {
        expanded.push({
          dimension: dimId,
          tactical_summary: "",
          discovered_leads: mergedPaths,
          battlefield_assessment: null
        });
      }
    }
    this.reconReports = expanded;
  }
  addReconReport(report) {
    this.reconReports.push(report);
  }
  getReconReports() {
    return this.reconReports;
  }
  setReconWeavedContext(value) {
    this.reconWeavedContext = value;
  }
  getReconWeavedContext() {
    return this.reconWeavedContext;
  }
  /** Persist consolidator output (from RawSearchAgent after streamTaskConsolidator). */
  setConsolidatorOutput(out) {
    this.consolidatorOutput = out ?? null;
  }
  getConsolidatorOutput() {
    return this.consolidatorOutput;
  }
  /** Set dimensions extracted after classify (for recall pipeline snapshot). */
  setRecallDimensions(dimensions) {
    this.recallDimensions = dimensions ?? [];
  }
  /** Set evidence groups after recon + grouping (for recall pipeline snapshot). */
  setRecallEvidenceTaskGroups(groups) {
    this.recallEvidenceTaskGroups = groups ?? [];
  }
  /** Set final evidence packs after evidence phase (for recall pipeline snapshot). */
  setRecallEvidencePacks(packs) {
    this.recallEvidencePacks = packs ?? [];
  }
  addRecallEvidencePack(pack) {
    this.recallEvidencePacks.push(pack);
  }
  getRecallDimensions() {
    return this.recallDimensions;
  }
  getRecallEvidenceTaskGroups() {
    return this.recallEvidenceTaskGroups;
  }
  getRecallEvidencePacks() {
    return this.recallEvidencePacks;
  }
  accumulateTokenUsage(usage) {
    if (!usage) return;
    this.totalTokenUsage = mergeTokenUsage(this.totalTokenUsage, usage);
  }
  getTotalTokenUsage() {
    return this.totalTokenUsage;
  }
  getInitialPrompt() {
    return this.initialPrompt ?? "";
  }
  yieldAgentResult() {
    return {
      extra: {
        currentResult: this.getAgentResult()
      }
    };
  }
  /**
   * Returns a result view so that update-result tools mutate the same arrays (topics, sources, dashboardBlocks).
   * Stream complete / UI still get a snapshot via this object; arrays are live references.
   */
  getAgentResult() {
    const self = this;
    return {
      get title() {
        return self.title || void 0;
      },
      set title(v) {
        self.setTitle(v);
      },
      get summary() {
        return self.summary ?? "";
      },
      set summary(v) {
        self.setSummary(v);
      },
      get topics() {
        return self.topics ?? [];
      },
      set topics(v) {
        self.setTopics(v ?? []);
      },
      get sources() {
        return self.sources ?? [];
      },
      set sources(v) {
        self.setSources(v ?? []);
      },
      get dashboardBlocks() {
        return self.dashboardBlocks ?? [];
      },
      set dashboardBlocks(v) {
        self.setDashboardBlocks(v ?? []);
      },
      get suggestedFollowUpQuestions() {
        return self.suggestedFollowUpQuestions;
      },
      set suggestedFollowUpQuestions(v) {
        self.setSuggestedFollowUpQuestions(v);
      },
      get evidenceMermaidOverviewAgent() {
        return self.mermaidOverviewFromEvidenceWeaved;
      },
      set evidenceMermaidOverviewAgent(v) {
        self.setEvidenceWeavedMermaidOverviewAgent(v);
      },
      get reportPlan() {
        return self.reportPlan;
      },
      set reportPlan(v) {
        self.setReportPlan(v);
      },
      get reportVisualBlueprint() {
        return self.reportVisualBlueprint;
      },
      set reportVisualBlueprint(v) {
        self.setReportVisualBlueprint(v);
      },
      get evidenceIndex() {
        const packs = self.getRecallEvidencePacks();
        const index = {};
        for (const p of packs) {
          const path3 = p.origin?.path_or_url ?? "";
          if (!path3) continue;
          if (!index[path3]) index[path3] = { summaries: [], facts: [] };
          if (p.summary) index[path3].summaries.push(p.summary);
          for (const f of p.facts ?? []) {
            index[path3].facts.push({ claim: f.claim, quote: f.quote });
          }
        }
        return index;
      }
    };
  }
  getVerifiedPaths() {
    return this.verifiedPaths;
  }
  appendVerifiedPaths(paths) {
    if (!paths) return;
    const arr = typeof paths === "string" ? [paths] : paths;
    for (const p of arr) {
      const t = p?.trim();
      if (t) this.verifiedPaths.add(t);
    }
  }
  /**
   * Serializable snapshot of current search memory for debug (e.g. window.__peakSearchDebug.getSnapshot()).
   */
  getDebugSnapshot() {
    const maxPromptPreview = 300;
    const paths = Array.from(this.verifiedPaths);
    return {
      initialPromptPreview: (this.initialPrompt ?? "").slice(0, maxPromptPreview),
      totalTokenUsage: this.totalTokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      agentResult: {
        title: this.title ?? "",
        summaryLength: (this.summary ?? "").length,
        topicsCount: (this.topics ?? []).length,
        sourcesCount: (this.sources ?? []).length,
        dashboardBlocksCount: (this.dashboardBlocks ?? []).length,
        suggestedFollowUpQuestionsCount: (this.suggestedFollowUpQuestions ?? []).length
      },
      verifiedPaths: paths,
      dossier: {
        verifiedPathsCount: paths.length,
        sourcePathsSample: paths.slice(0, SLICE_CAPS.agent.sourcePathsSample)
      },
      recallPipeline: this.recallDimensions.length > 0 || this.recallEvidenceTaskGroups.length > 0 || this.recallEvidencePacks.length > 0 ? {
        dimensionsCount: this.recallDimensions.length,
        evidenceGroupsCount: this.recallEvidenceTaskGroups.length,
        evidencePacksCount: this.recallEvidencePacks.length
      } : void 0
    };
  }
  /**
   * Verified fact sheet as lines: grouped by pathRef (once per path), then summary line(s), then each claim + quote per line. No snippet.
   * Returns string[] so callers can join or slice as needed.
   */
  getVerifiedFactSheet() {
    const packs = this.recallEvidencePacks;
    if (packs.length === 0) return [];
    const maxQuoteLen = 200;
    const byPath = /* @__PURE__ */ new Map();
    const seenClaimsByPath = /* @__PURE__ */ new Map();
    for (const p of packs) {
      const path3 = p.origin.path_or_url ?? "";
      const pathRef = path3 ? `[[${path3}]]` : "";
      if (!byPath.has(path3)) {
        byPath.set(path3, { pathRef, summaries: [], factEntries: [] });
        seenClaimsByPath.set(path3, /* @__PURE__ */ new Set());
      }
      const group = byPath.get(path3);
      const seenClaims = seenClaimsByPath.get(path3);
      const summary = (p.summary ?? "").trim();
      if (summary) group.summaries.push(summary);
      for (const f of p.facts ?? []) {
        const claim = (f.claim ?? "").trim();
        const quote = (f.quote ?? "").slice(0, maxQuoteLen);
        const key = claim.slice(0, SLICE_CAPS.agent.claimKey);
        if (!claim || seenClaims.has(key)) continue;
        seenClaims.add(key);
        group.factEntries.push({ claim, quote });
      }
    }
    const lines = [];
    for (const group of byPath.values()) {
      lines.push(group.pathRef);
      for (const s of group.summaries) lines.push(`  Summary: ${s}`);
      for (const { claim, quote } of group.factEntries) {
        const suffix = quote.length >= maxQuoteLen ? "..." : "";
        lines.push(`  - ${claim}: "${quote}${suffix}"`);
      }
    }
    return lines;
  }
  /** Recon briefing from consolidator + per-dimension tactical summaries. */
  getReconBriefing() {
    const parts = [];
    const consolidator = this.consolidatorOutput;
    if (consolidator?.global_recon_insight) {
      parts.push("Recon briefing (recon view, not final conclusions):");
      parts.push(consolidator.global_recon_insight.trim());
    }
    const reports = this.reconReports;
    if (reports.length > 0) {
      parts.push("Per-dimension tactical summary:");
      for (const r of reports) {
        const t = (r.tactical_summary ?? "").trim().slice(0, SLICE_CAPS.agent.tacticalSummary);
        if (t) parts.push(`[${r.dimension}] ${t}`);
      }
    }
    return parts.join("\n\n");
  }
  /** Classify section: initial prompt + dimensions chosen (from recall pipeline). */
  getClassifySectionText() {
    const prompt = (this.initialPrompt ?? "").trim();
    const dims = this.recallDimensions;
    const dimLine = dims.length > 0 ? `Dimensions chosen: ${dims.map((d) => `${d.id} (${(d.intent_description ?? "").slice(0, SLICE_CAPS.agent.dimensionIntent)})`).join("; ")}` : "";
    return [prompt, dimLine].filter(Boolean).join("\n");
  }
  /** Evidence task group index (paths per group) for prompt context. */
  getEvidenceGroupIndex() {
    const groups = this.recallEvidenceTaskGroups;
    if (groups.length === 0) return "";
    const lines = ["Evidence task group index (input to evidence phase; paths to read per group):"];
    groups.forEach((eg, i) => {
      const id = eg.groupId ?? `group-${i}`;
      const paths = [...new Set((eg.tasks ?? []).map((t) => t.path).filter(Boolean))];
      const focus = (eg.group_focus ?? "").slice(0, SLICE_CAPS.agent.groupFocus);
      const shared = eg.sharedContext ? `
  sharedContext (excerpt): ${eg.sharedContext.slice(0, SLICE_CAPS.agent.sharedContext)}...` : "";
      lines.push(`- ${id} | topic_anchor: ${eg.topic_anchor} | group_focus: ${focus}${shared}
  paths: ${paths.slice(0, SLICE_CAPS.agent.evidencePaths).join(", ")}`);
    });
    return lines.join("\n");
  }
  /** Source map: unique paths from evidence packs, or verified paths when no packs. */
  getSourceMap() {
    const packs = this.recallEvidencePacks;
    if (packs.length > 0) {
      return [...new Set(packs.map((p) => p.origin.path_or_url).filter(Boolean))].join("\n");
    }
    return Array.from(this.verifiedPaths).join("\n");
  }
  /** Confirmed facts list derived from evidence packs (summary or first claim per pack). */
  getConfirmedFacts() {
    const packs = this.recallEvidencePacks;
    if (packs.length === 0) return [];
    return packs.map((p) => p.summary ?? p.facts[0]?.claim ?? "").filter(Boolean);
  }
  /** Dossier gaps (currently unused; reserved for future). */
  getDossierGaps() {
    return [];
  }
  /**
   * Returns full dossier for Summary/Dashboard when multiple fields are needed at once.
   * Prefer individual getters (getVerifiedFactSheet, getReconBriefing, etc.) when only a subset is needed.
   */
  getDossierForSummary() {
    return {
      verifiedFactSheet: this.getVerifiedFactSheet().join("\n"),
      reconBriefing: this.getReconBriefing(),
      evidenceGroupIndex: this.getEvidenceGroupIndex(),
      sourceMap: this.getSourceMap(),
      lastDecision: "",
      confirmedFacts: this.getConfirmedFacts(),
      gaps: this.getDossierGaps(),
      userPersonaConfig: this.userPersonaConfig ?? void 0
    };
  }
  getAgentMemoryTool() {
    const self = this;
    return {
      search_analysis_context: safeAgentTool({
        description: `Search the structured analysis session. Query: "list" or empty (overview), "stage:<Classify|Dimensions|Recon|Consolidator|EvidenceGroups|Evidence>", "path:<path>", "dimension:<id>", "group:<id>", or free-text keyword. E.g. "stage:Recon", "path:foo.md", or keywords (topic names, file paths).`,
        inputSchema: searchMemoryStoreInputSchema,
        execute: async (input) => {
          const result = self.searchHistory(input.query, { maxChars: input.maxChars });
          return { content: result };
        }
      }),
      content_reader: contentReaderTool()
    };
  }
  /**
   * Single section text for a stage, optionally filtered by path/dimension/group.
   * Used by fullMemoryTextSupplier and searchHistory.
   */
  getSectionText(stage, filters) {
    const pathLower = filters.path?.toLowerCase() ?? "";
    const dim = filters.dimension ?? "";
    const groupId = filters.group ?? "";
    switch (stage) {
      case "Classify": {
        const raw = this.getClassifySectionText();
        if (dim && this.recallDimensions.some((d) => d.id === dim)) {
          const d = this.recallDimensions.find((d2) => d2.id === dim);
          return `${d.id}: ${d.intent_description ?? ""}`;
        }
        return raw;
      }
      case "Dimensions": {
        const lines = this.recallDimensions.map((d) => `${d.id}: ${d.intent_description ?? ""}`);
        if (dim) return lines.filter((l) => l.startsWith(dim + ":")).join("\n") || "";
        return lines.join("\n");
      }
      case "Recon": {
        const reports = this.reconReports;
        if (reports.length === 0) return "";
        let out = reports;
        if (dim) out = out.filter((r) => r.dimension === dim);
        if (pathLower) out = out.filter((r) => (r.discovered_leads ?? []).some((p) => p.toLowerCase().includes(pathLower)));
        if (out.length === 0) return "";
        return out.map((r) => `[${r.dimension}] ${(r.tactical_summary ?? "").trim().slice(0, SLICE_CAPS.agent.tacticalSummary)}`).join("\n");
      }
      case "Consolidator": {
        const c = this.consolidatorOutput;
        if (!c) return "";
        const tasks = (c.consolidated_tasks ?? []).filter((t) => {
          if (pathLower && !t.path.toLowerCase().includes(pathLower)) return false;
          if (dim && !(t.relevant_dimension_ids ?? []).some((d) => d.id === dim)) return false;
          return true;
        });
        const insight = pathLower || dim ? "" : (c.global_recon_insight ?? "").trim();
        const taskLines = tasks.slice(0, SLICE_CAPS.agent.extractionTasks).map((t) => `${t.path}: ${(t.extraction_focus ?? "").slice(0, SLICE_CAPS.agent.extractionFocus)}`);
        return [insight, ...taskLines].filter(Boolean).join("\n");
      }
      case "EvidenceGroups": {
        const groups = this.recallEvidenceTaskGroups;
        if (groups.length === 0) return "";
        let gs = groups;
        if (groupId) gs = gs.filter((eg) => (eg.groupId ?? "").includes(groupId) || groups.indexOf(eg) === parseInt(groupId, 10));
        if (pathLower) gs = gs.filter((eg) => (eg.tasks ?? []).some((t) => (t.path ?? "").toLowerCase().includes(pathLower)));
        if (gs.length === 0) return "";
        return gs.map((eg, i) => {
          const id = eg.groupId ?? `group-${i}`;
          const paths = [...new Set((eg.tasks ?? []).map((t) => t.path).filter(Boolean))];
          return `${id} | ${eg.topic_anchor} | ${(eg.group_focus ?? "").slice(0, SLICE_CAPS.agent.groupFocus)}
  paths: ${paths.slice(0, SLICE_CAPS.agent.evidencePaths).join(", ")}`;
        }).join("\n");
      }
      case "Evidence": {
        const lines = this.getVerifiedFactSheet();
        if (lines.length === 0) return "";
        if (pathLower) {
          const result = [];
          let inBlock = false;
          for (const l of lines) {
            if (l.startsWith("[[") && l.toLowerCase().includes(pathLower)) inBlock = true;
            if (inBlock) result.push(l);
            if (inBlock && l.startsWith("[[") && !l.toLowerCase().includes(pathLower)) inBlock = false;
          }
          return result.length > 0 ? result.join("\n") : lines.filter((l) => l.toLowerCase().includes(pathLower)).join("\n");
        }
        if (groupId) {
          const g = this.recallEvidenceTaskGroups.find((eg, i) => eg.groupId === groupId || `group-${i}` === groupId);
          const paths = new Set((g?.tasks ?? []).map((t) => t.path).filter(Boolean));
          if (paths.size === 0) return lines.join("\n");
          return lines.filter((l) => Array.from(paths).some((p) => l.includes(p))).join("\n");
        }
        return lines.join("\n");
      }
      default:
        return "";
    }
  }
  /**
   * Parse query mini-language: id:XXX, stage:X, path:X, dimension:X, group:X, list (or empty = list).
   */
  parseSearchQuery(query) {
    const q = (query ?? "").trim();
    const result = {};
    if (!q || q.toLowerCase() === "list") {
      result.list = true;
      return result;
    }
    let rest = q;
    const idMatch = rest.match(/\bid:(\S+)/i);
    if (idMatch) {
      result.id = idMatch[1].trim();
      rest = rest.replace(idMatch[0], "").trim();
    }
    const stageMatch = rest.match(/\bstage:(\S+)/i);
    if (stageMatch) {
      result.stage = stageMatch[1].trim();
      rest = rest.replace(stageMatch[0], "").trim();
    }
    const pathMatch = rest.match(/\bpath:(\S+)/i);
    if (pathMatch) {
      result.path = pathMatch[1].trim().replace(/^\[\[|\]\]$/g, "");
      rest = rest.replace(pathMatch[0], "").trim();
    }
    const dimMatch = rest.match(/\bdimension:(\S+)/i);
    if (dimMatch) {
      result.dimension = dimMatch[1].trim();
      rest = rest.replace(dimMatch[0], "").trim();
    }
    const groupMatch = rest.match(/\bgroup:(\S+)/i);
    if (groupMatch) {
      result.group = groupMatch[1].trim();
      rest = rest.replace(groupMatch[0], "").trim();
    }
    if (rest.length > 0) result.keyword = rest;
    return result;
  }
  /**
   * Search structured analysis by query: list (overview), stage:/path:/dimension:/group: (filter), or keyword (grep on full memory).
   */
  searchHistory(query, options) {
    const maxChars = options?.maxChars ?? 4e3;
    const parsed = this.parseSearchQuery(query);
    if (parsed.id) {
      return `id: is not supported. Use "list" for overview or "stage:Classify|Dimensions|Recon|Consolidator|EvidenceGroups|Evidence", "path:<path>", "dimension:<id>", "group:<id>", or keyword.`.slice(0, maxChars);
    }
    if (parsed.list) {
      const has = (stage2) => this.getSectionText(stage2, {}).trim().length > 0;
      const stageLines = ANALYSIS_HISTORY_STAGES.map((s) => `  ${s}: ${has(s) ? "yes" : "no"}`).join("\n");
      return `Analysis overview (query by stage/path/dimension/group or keyword)
Stages:
${stageLines}
Use: stage:<Classify|Dimensions|Recon|Consolidator|EvidenceGroups|Evidence>, path:<path>, dimension:<id>, group:<id>, or free text.`.slice(0, maxChars);
    }
    const filters = {
      path: parsed.path,
      dimension: parsed.dimension,
      group: parsed.group
    };
    const stage = parsed.stage?.trim();
    let candidateText = "";
    if (stage && ANALYSIS_HISTORY_STAGES.includes(stage)) {
      candidateText = this.getSectionText(stage, filters);
    } else if (parsed.path || parsed.dimension || parsed.group) {
      const parts = [];
      for (const s of ANALYSIS_HISTORY_STAGES) {
        const t = this.getSectionText(s, filters);
        if (t.trim()) parts.push(`[${s}]
${t}`);
      }
      candidateText = parts.join("\n\n");
    } else {
      candidateText = this.fullMemoryTextSupplier();
    }
    if (parsed.keyword) {
      const searchIn = candidateText.length > 0 ? candidateText : this.fullMemoryTextSupplier();
      const matches = this.grepInMemoryText(searchIn, parsed.keyword, { contextLines: 2, maxMatches: 15 });
      if (matches.length > 0) {
        return matches.map((m) => `Line ${m.line}:
${m.text}`).join("\n---\n").slice(0, maxChars);
      }
      if (candidateText.trim()) return candidateText.slice(0, maxChars);
      return `No matches for "${parsed.keyword}". Use "list" to see available stages.`.slice(0, maxChars);
    }
    if (candidateText.trim()) return candidateText.slice(0, maxChars);
    return `No content for the query. Use "list" to see available stages (Classify, Dimensions, Recon, Consolidator, EvidenceGroups, Evidence).`.slice(0, maxChars);
  }
  /** Grep over full memory text (fallback when entry filter returns no hits). */
  grepInMemoryText(fullText, query, options) {
    const cap = Math.min(DEFAULT_GREP_MAX_MATCHES, options?.maxMatches ?? DEFAULT_GREP_MAX_MATCHES);
    const contextLines = options?.contextLines ?? 2;
    const { regex } = buildAutoRegex2(query, options?.caseSensitive ?? false);
    const lines = fullText.split(/\r?\n/);
    const matches = [];
    for (let i = 0; i < lines.length && matches.length < cap; i++) {
      const lineText = lines[i] ?? "";
      regex.lastIndex = 0;
      let guard = 0;
      let m;
      while ((m = regex.exec(lineText)) !== null) {
        const start = Math.max(0, i - contextLines);
        const end = Math.min(lines.length, i + contextLines + 1);
        const context = lines.slice(start, end).join("\n");
        matches.push({ line: i + 1, text: context });
        if (matches.length >= cap) break;
        if (m[0]?.length === 0) {
          regex.lastIndex = Math.min(lineText.length, regex.lastIndex + 1);
        }
        guard++;
        if (guard > 1e4) break;
      }
    }
    return matches;
  }
};

// src/service/agents/search-agent-helper/helpers/search-ui-events.ts
function stageToTriggerName(stage) {
  const map = {
    recall: "search-slot-recall-agent" /* SEARCH_SLOT_RECALL_AGENT */,
    classify: "search-slot-recall-agent" /* SEARCH_SLOT_RECALL_AGENT */,
    recon: "search-raw-agent-recon" /* SEARCH_RAW_AGENT_RECON */,
    consolidate: "search-raw-agent-task-consolidator" /* SEARCH_RAW_AGENT_TASK_CONSOLIDATOR */,
    grouping: "search-raw-agent-task-consolidator" /* SEARCH_RAW_AGENT_TASK_CONSOLIDATOR */,
    groupContext: "search-raw-agent-task-consolidator" /* SEARCH_RAW_AGENT_TASK_CONSOLIDATOR */,
    evidence: "search-raw-agent-evidence" /* SEARCH_RAW_AGENT_EVIDENCE */,
    overview: "search-overview-mermaid" /* SEARCH_OVERVIEW_MERMAID */,
    report: "search-ai-agent" /* SEARCH_AI_AGENT */,
    reportPlan: "search-report-plan-agent" /* SEARCH_REPORT_PLAN_AGENT */,
    visualBlueprint: "search-visual-blueprint-agent" /* SEARCH_VISUAL_BLUEPRINT_AGENT */,
    reportBlock: "search-dashboard-update-agent" /* SEARCH_DASHBOARD_UPDATE_AGENT */,
    summary: "search-summary" /* SEARCH_SUMMARY */,
    sourcesStreaming: "search-sources-from-verified-paths" /* SEARCH_SOURCES_FROM_VERIFIED_PATHS */
  };
  return map[stage];
}
function makeStepId(meta2) {
  const base = `search:${meta2.runStepId}:${meta2.stage}`;
  if (meta2.lane) {
    return `${base}:${meta2.lane.laneType}:${meta2.lane.laneId}`;
  }
  return base;
}
function makeStepExtra(meta2) {
  return { meta: { ...meta2 } };
}
function uiStepStart(meta2, opts) {
  const triggerName = opts.triggerName ?? stageToTriggerName(meta2.stage);
  return {
    type: "ui-step",
    uiType: "steps-display" /* STEPS_DISPLAY */,
    stepId: makeStepId(meta2),
    title: opts.title,
    description: opts.description ?? "",
    triggerName,
    triggerTimestamp: Date.now(),
    extra: makeStepExtra(meta2)
  };
}
function uiStageSignal(meta2, opts) {
  const triggerName = opts.triggerName ?? stageToTriggerName(meta2.stage);
  const entityId = `${meta2.stage}${meta2.lane ? `:${meta2.lane.laneId}` : ""}`;
  const kind = opts.status === "complete" ? "complete" /* COMPLETE */ : opts.status === "progress" ? "progress" /* PROGRESS */ : "stage" /* STAGE */;
  return {
    type: "ui-signal",
    channel: "search-stage" /* SEARCH_STAGE */,
    kind,
    entityId,
    stepId: makeStepId(meta2),
    payload: {
      status: opts.status,
      stage: meta2.stage,
      lane: meta2.lane,
      ...opts.payload
    },
    triggerName,
    triggerTimestamp: Date.now(),
    extra: makeStepExtra(meta2)
  };
}

// src/service/agents/search-agent-helper/SlotRecallAgent.ts
var import_ai4 = require("ai");

// src/service/tools/system-info.ts
function getVaultStatistics() {
  const app = AppContext.getInstance().app;
  const vaultName = app.vault.getName();
  const allFiles = app.vault.getFiles();
  const markdownFiles = allFiles.filter((f) => f.extension === "md");
  const otherFiles = allFiles.filter((f) => f.extension !== "md");
  return {
    vaultName,
    totalFiles: allFiles.length,
    markdownFiles: markdownFiles.length,
    otherFiles: otherFiles.length
  };
}
async function getVaultDescription() {
  try {
    const descriptionPath = `${getAIPromptFolder()}/${VAULT_DESCRIPTION_FILENAME}`;
    const content = await readFileAsText(descriptionPath);
    return content?.trim() || void 0;
  } catch (error) {
    console.warn("[system-info] Error reading vault description:", error);
    return void 0;
  }
}
async function getTagCloud() {
  try {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
    const topTagStats = await mobiusEdgeRepo.getTopTaggedNodes(GLOBAL_TAG_CLOUD_TOP_TAGS_COUNT);
    if (topTagStats.length === 0) {
      return "";
    }
    const tagIds = topTagStats.map((stat) => stat.tagId);
    const tagNodesMap = await mobiusNodeRepo.getByIds(tagIds);
    return topTagStats.map((stat) => {
      const tagNode = tagNodesMap.get(stat.tagId);
      if (!tagNode) return null;
      return `#${tagNode.label}(${stat.count})`;
    }).filter((item) => item !== null).join(", ");
  } catch (error) {
    console.warn("[system-info] Error getting tag cloud:", error);
    return "";
  }
}
async function getVaultPersona() {
  const [vaultDescription, tagCloud] = await Promise.all([
    getVaultDescription(),
    getTagCloud()
  ]);
  const stats = getVaultStatistics();
  const tm = AppContext.getInstance().manager.getTemplateManager?.();
  const exploreResult = await exploreFolder(
    { folderPath: "/", recursive: true, max_depth: 2, limit: 100, response_format: "markdown" },
    tm
  );
  return {
    description: vaultDescription,
    domain: [],
    structure: exploreResult,
    topTags: tagCloud || "(none)",
    capabilities: `${stats.markdownFiles} markdown, ${stats.otherFiles} other files` + (stats.totalFiles < 20 ? `small vault; consider external search if needed` : ``)
  };
}

// src/core/providers/adapter/ai-sdk-adapter.ts
var import_ai = require("ai");
function generateToolCallId() {
  return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
function getToolErrorMessage(chunk2) {
  return typeof chunk2.error === "string" ? chunk2.error : chunk2.error?.message ?? JSON.stringify(chunk2.error);
}

// src/core/providers/helpers/message-helper.ts
function buildToolResultStreamEventFromChunk(chunk2, triggerName) {
  const errMsg = getToolErrorMessage(chunk2);
  const toolName = chunk2.toolName ?? "unknown";
  return {
    type: "error",
    toolName,
    error: new Error(`Tool ${toolName} failed: ${errMsg}`),
    extra: { toolName, toolCallId: chunk2.toolCallId },
    triggerName
  };
}

// src/core/providers/helpers/stream-helper.ts
function buildPromptTraceDebugEvent(triggerName, system, prompt) {
  return {
    type: "pk-debug",
    debugName: "prompt-trace",
    triggerName,
    extra: {
      // no system prompt show in debug. as system is immutable in most cases (design this for cache)
      // system: system ?? 'undefined',
      prompt: prompt ?? "undefined",
      systemLen: system?.length ?? "undefined",
      promptLen: prompt?.length ?? "undefined"
    }
  };
}
async function* streamTransform(fullStream, triggerName, eventProcessor) {
  let manualToolTokenUsage = emptyUsage();
  let startTime = Date.now();
  let deltaStartTimestamp = Date.now();
  let deltaTextChunks = [];
  for await (const chunk2 of fullStream) {
    if (!checkIfModeDeltaEvent(chunk2.type) && deltaTextChunks.length > 0) {
      yield {
        type: "pk-debug",
        debugName: "delta-text-flush",
        extra: {
          deltaText: deltaTextChunks.join(""),
          durationMs: Date.now() - deltaStartTimestamp
        }
      };
      deltaStartTimestamp = Date.now();
      deltaTextChunks = [];
    }
    eventProcessor.chunkEventInterceptor?.(chunk2);
    let yieldEvent = void 0;
    let deltaText = void 0;
    let lastToolCallId;
    switch (chunk2.type) {
      case "text-start": {
        deltaStartTimestamp = Date.now();
        deltaTextChunks = [];
        yieldEvent = {
          type: "text-start"
        };
        break;
      }
      case "text-delta": {
        const text = chunk2.text ?? chunk2.textDelta ?? "";
        deltaText = text;
        deltaTextChunks.push(text);
        yieldEvent = {
          type: "text-delta",
          text,
          triggerName
        };
        break;
      }
      case "text-end": {
        yieldEvent = {
          type: "text-end",
          extra: {
            deltaText: deltaTextChunks.join(""),
            durationMs: Date.now() - deltaStartTimestamp
          }
        };
        deltaTextChunks = [];
        break;
      }
      case "reasoning-start": {
        deltaTextChunks = [];
        deltaStartTimestamp = Date.now();
        yieldEvent = {
          type: "reasoning-start"
        };
        break;
      }
      case "reasoning-delta":
        deltaText = chunk2.text;
        deltaTextChunks.push(deltaText);
        yieldEvent = {
          type: "reasoning-delta",
          text: chunk2.text,
          triggerName
        };
        break;
      case "reasoning-end": {
        yieldEvent = {
          type: "reasoning-end",
          extra: {
            deltaText: deltaTextChunks.join(""),
            durationMs: Date.now() - deltaStartTimestamp
          }
        };
        deltaTextChunks = [];
        break;
      }
      case "tool-call": {
        lastToolCallId = chunk2.toolCallId ?? generateToolCallId();
        yieldEvent = {
          type: "tool-call",
          id: lastToolCallId,
          toolName: chunk2.toolName,
          input: chunk2.input,
          triggerName
        };
        break;
      }
      case "tool-input-start": {
        deltaStartTimestamp = Date.now();
        deltaTextChunks = [];
        break;
      }
      case "tool-input-delta": {
        deltaText = chunk2.delta;
        deltaTextChunks.push(deltaText);
        break;
      }
      case "tool-input-end": {
        yieldEvent = {
          type: "pk-debug",
          debugName: "tool-input-end-duration",
          extra: {
            deltaText: deltaTextChunks.join(""),
            durationMs: Date.now() - deltaStartTimestamp
          }
        };
        deltaTextChunks = [];
        break;
      }
      case "tool-result": {
        if (eventProcessor.manualToolCallHandlers?.[chunk2.toolName]) {
          break;
        }
        const toolName = chunk2.toolName;
        const toolCallId = chunk2.toolCallId ?? generateToolCallId();
        yieldEvent = {
          ...{
            type: "tool-result",
            id: toolCallId,
            toolName,
            input: chunk2.input,
            output: chunk2.output,
            triggerName
          },
          ...eventProcessor.toolResultChunkPostProcessor ? eventProcessor.toolResultChunkPostProcessor(chunk2) : {}
        };
        break;
      }
      case "tool-error": {
        yieldEvent = buildToolResultStreamEventFromChunk(
          chunk2,
          triggerName
        );
        break;
      }
      case "finish": {
        const usage = chunk2.totalUsage ?? chunk2.usage;
        const finishReason = chunk2.finishReason ?? "unknown";
        yieldEvent = {
          type: "on-step-finish",
          text: `${triggerName} finish.`,
          finishReason,
          durationMs: Date.now() - startTime,
          usage: mergeTokenUsage(usage ?? emptyUsage(), manualToolTokenUsage),
          triggerName
        };
        break;
      }
      case "error": {
        const err = chunk2.error;
        yieldEvent = {
          type: "error",
          error: err instanceof Error ? err : new Error(String(err)),
          triggerName
        };
        break;
      }
      default:
        break;
    }
    if (yieldEvent) {
      yield* yieldChunkEvent(yieldEvent, eventProcessor, triggerName, chunk2, deltaText);
    }
    if (chunk2.type === "tool-call") {
      const manualToolHandler = eventProcessor.manualToolCallHandlers?.[chunk2.toolName];
      if (manualToolHandler) {
        const resultCollector = {};
        yield* manualToolHandler.handle(chunk2.input, resultCollector);
        manualToolTokenUsage = mergeTokenUsage(manualToolTokenUsage, resultCollector.stepTokenUsage);
        const toolCallId = lastToolCallId ?? generateToolCallId();
        const toolResultOutput = manualToolHandler.outputGetter?.(resultCollector) ?? resultCollector;
        yield* yieldChunkEvent(
          {
            type: "tool-result",
            id: toolCallId,
            toolName: chunk2.toolName,
            input: chunk2.input,
            output: toolResultOutput
          },
          eventProcessor,
          triggerName,
          // manual create tool-result chunk to align with chunk type
          {
            type: "tool-result",
            toolCallId,
            toolName: chunk2.toolName,
            input: chunk2.input,
            output: toolResultOutput
          },
          deltaText
        );
      }
    }
  }
}
async function* yieldChunkEvent(yieldEvent, eventProcessor, triggerName, chunk2, deltaText) {
  const uiStep = eventProcessor.yieldUIStep;
  const eventPostProcessorResult = eventProcessor.yieldEventPostProcessor ? eventProcessor.yieldEventPostProcessor(chunk2) : {};
  yieldEvent = {
    ...yieldEvent,
    ...eventPostProcessorResult,
    extra: "extra" in eventPostProcessorResult && eventPostProcessorResult.extra != null ? { ...yieldEvent.extra, ...eventPostProcessorResult.extra } : yieldEvent.extra,
    triggerName
  };
  yield yieldEvent;
  if (uiStep && deltaText !== void 0) {
    const uiEvent = uiStep.uiEventGenerator?.(chunk2);
    if (uiEvent) {
      if (Array.isArray(uiEvent)) {
        for (const e of uiEvent) {
          yield {
            ...e,
            stepId: uiStep.stepId,
            triggerName
          };
        }
      } else {
        yield {
          ...uiEvent,
          stepId: uiStep.stepId,
          triggerName
        };
      }
    } else {
      yield {
        type: "ui-step-delta",
        uiType: uiStep.uiType,
        stepId: uiStep.stepId,
        descriptionDelta: deltaText,
        triggerName
      };
    }
  }
  const extra = eventProcessor.yieldExtraAfterEvent?.(chunk2);
  if (extra !== void 0 && extra !== null) {
    if (Array.isArray(extra)) {
      for (const e of extra)
        yield {
          ...e,
          triggerName
        };
    } else {
      yield {
        ...extra,
        triggerName
      };
    }
  }
}
var DELTA_EVENT_TYPES = /* @__PURE__ */ new Set(["text-delta", "reasoning-delta", "prompt-stream-delta", "tool-input-delta", "ui-step-delta"]);
function checkIfModeDeltaEvent(type) {
  return type === "text-delta" || type === "reasoning-delta" || type === "tool-input-delta";
}
async function* parallelStream(sourcesOrFactories, options) {
  const useLimit = options != null && typeof options.limit === "number";
  const isFactories = sourcesOrFactories.length > 0 && typeof sourcesOrFactories[0] === "function";
  if (useLimit && isFactories) {
    yield* parallelStreamWithLimit(
      sourcesOrFactories,
      options.limit
    );
    return;
  }
  const streamGenerator = sourcesOrFactories;
  if (streamGenerator.length === 0) return;
  const total = streamGenerator.length;
  const completedIndices = /* @__PURE__ */ new Set();
  const pending = /* @__PURE__ */ new Map();
  const runNext = (index) => streamGenerator[index].next().then((result) => ({ index, result }));
  const yieldProgress = () => ({
    type: "parallel-stream-progress",
    completed: completedIndices.size,
    total,
    completedIndices: [...completedIndices]
  });
  yield yieldProgress();
  for (let i = 0; i < total; i++) {
    pending.set(i, runNext(i));
  }
  while (pending.size > 0) {
    const { index, result } = await Promise.race(pending.values());
    if (result.done) {
      pending.delete(index);
      completedIndices.add(index);
      yield yieldProgress();
    } else {
      yield result.value;
      pending.set(index, runNext(index));
    }
  }
}
async function* parallelStreamWithLimit(factories, limit) {
  if (factories.length === 0) return;
  const total = factories.length;
  const queue = [...factories];
  let completed = 0;
  const pool = [];
  const yieldProgress = () => ({
    type: "parallel-stream-progress",
    completed,
    total
  });
  yield yieldProgress();
  function startNext() {
    if (queue.length === 0) return false;
    const factory = queue.shift();
    const gen = factory();
    const entry = {
      gen,
      next: gen.next().then((result) => ({ entry, result }))
    };
    pool.push(entry);
    return true;
  }
  for (let i = 0; i < limit && queue.length > 0; i++) {
    startNext();
  }
  while (pool.length > 0) {
    const { entry, result } = await Promise.race(pool.map((p) => p.next));
    if (result.done) {
      pool.splice(pool.indexOf(entry), 1);
      completed++;
      yield yieldProgress();
      startNext();
    } else {
      yield result.value;
      entry.next = entry.gen.next().then((r) => ({ entry, result: r }));
    }
  }
}

// src/service/agents/search-agent-helper/RawSearchAgent.ts
var import_ai2 = require("ai");

// src/core/utils/common-utils.ts
function isBlankString(value) {
  return value === void 0 || value === null || value.trim() === "";
}

// src/service/agents/search-agent-helper/helpers/weavePathsToContext.ts
var TOP_FOLDERS = 3;
var FOLDER_STATS_EACH = 3;
var TOP_TAGS = 10;
var NAME_KEYWORDS_TOP = 20;
var FOLDER_TOP_TAGS = 10;
var GRAPH_INTERNAL_NODES_TOP_K = 10;
var GRAPH_EXTERNAL_NODES_TOP_K = 5;
var GRAPH_MIN_DEGREE = 2;
var CONNECTOR_MAX = 5;
var KEYWORD_MIN_FREQ = 2;
var MAX_KW_TOKENS = 12;
var EDGE_QUERY_CHUNK = 400;
var GROUP_TREE_MAX_LINES = 14;
var SHARED_KW_TOP_TOKENS = 10;
var SHARED_MIN_DOCS = 1;
var MAX_PATHS_FOR_GRAPH = 500;
var GET_IDS_BY_PATHS_CHUNK = 400;
function dirname(path3) {
  const i = path3.lastIndexOf("/");
  return i <= 0 ? "" : path3.slice(0, i);
}
function stripFolderPrefixForDisplay(path3, folderKey) {
  if (folderKey === "") return path3.split("/").pop() ?? path3;
  const prefix = folderKey + "/";
  return path3.startsWith(prefix) ? path3.slice(prefix.length) : path3;
}
function buildPathPrefixTrie(pathPrefixes) {
  const root = { segment: "", children: /* @__PURE__ */ new Map(), isEnd: false };
  for (const p of pathPrefixes) {
    if (!p.trim()) continue;
    const segments = p.split("/").filter(Boolean);
    let cur = root;
    for (const seg of segments) {
      let next = cur.children.get(seg);
      if (!next) {
        next = { segment: seg, children: /* @__PURE__ */ new Map(), isEnd: false };
        cur.children.set(seg, next);
      }
      cur = next;
    }
    cur.isEnd = true;
  }
  return root;
}
function collectChainSegments(node) {
  const segs = [];
  let cur = node;
  while (cur) {
    if (cur.segment) segs.push(cur.segment);
    if (cur.children.size !== 1) break;
    cur = cur.children.values().next().value;
  }
  return segs;
}
function renderPathPrefixTreeToLabel(pathPrefixes) {
  if (pathPrefixes.length === 0) return "Group";
  const root = buildPathPrefixTrie(pathPrefixes);
  const lines = [];
  const indent = "\xB7\xB7";
  function walk(node, depth) {
    if (lines.length >= GROUP_TREE_MAX_LINES) return;
    const entries = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, child] of entries) {
      if (lines.length >= GROUP_TREE_MAX_LINES) return;
      const chain = collectChainSegments(child);
      const prefix = indent.repeat(depth);
      const line = chain.length === 1 ? `${prefix}${chain[0]}` : `${prefix}${chain.join(" / ")}`;
      lines.push(line);
      let tail = child;
      for (let i = 1; i < chain.length; i++) {
        const next = tail.children.get(chain[i]);
        if (!next) break;
        tail = next;
      }
      if (tail.children.size > 0) walk(tail, depth + chain.length);
    }
  }
  walk(root, 0);
  if (lines.length >= GROUP_TREE_MAX_LINES) {
    const more = Math.max(1, pathPrefixes.length - (GROUP_TREE_MAX_LINES - 1));
    lines[GROUP_TREE_MAX_LINES - 1] = `(+${more} more)`;
  }
  const groupLabel = lines.map((l) => l.replace(/\]/g, "")).join("<br>");
  return `Group:<br>${groupLabel}`;
}
function normalizeFolderPrefixes(folderPaths) {
  const unique = [...new Set(folderPaths)].filter(Boolean);
  return unique.filter(
    (f) => !unique.some((other) => other !== f && (f === other || f.startsWith(other + "/")))
  );
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
async function getIdsByPathsChunked(paths) {
  if (paths.length === 0) return [];
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const results = [];
  for (const c of chunk(paths, GET_IDS_BY_PATHS_CHUNK)) {
    const rows = await indexedDocumentRepo.getIdsByPaths(c);
    results.push(...rows);
  }
  return results;
}
async function buildFolderLinesFromPaths(paths, idByPath) {
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const folderToPaths = /* @__PURE__ */ new Map();
  for (const p of paths) {
    const dir = dirname(p) || "(root)";
    const arr = folderToPaths.get(dir) ?? [];
    arr.push(p);
    folderToPaths.set(dir, arr);
  }
  const sortedFolders = [...folderToPaths.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, TOP_FOLDERS);
  const folderLines = [];
  for (const [folderKey, groupPaths] of sortedFolders) {
    const folderPath = folderKey === "" ? "(root)" : folderKey;
    const inGroupCount = groupPaths.length;
    const totalInFolder = folderKey === "" ? await mobiusNodeRepo.countAllDocumentStatisticsRows() : await indexedDocumentRepo.countByFolderPath(folderKey);
    const extraCount = Math.max(0, totalInFolder - inGroupCount);
    const groupDocIds = groupPaths.map((p) => idByPath.get(p)).filter(Boolean);
    if (groupDocIds.length === 0) {
      folderLines.push({
        folderPath,
        inGroupCount,
        totalInFolder,
        extraCount: extraCount > 0 ? extraCount : void 0,
        hasTopRecent: false,
        topRecent: [],
        hasTopWordCount: false,
        topWordCount: [],
        hasTopLinksIn: false,
        topLinksIn: [],
        hasTopLinksOut: false,
        topLinksOut: [],
        hasNameKeywords: false,
        nameKeywords: [],
        hasFolderTagDesc: false,
        folderTagDesc: ""
      });
      continue;
    }
    const [topRecentRaw, topWordCountRaw, edgeCounts, tagCountsRaw] = await Promise.all([
      mobiusNodeRepo.getTopRecentEditedByDocIds(groupDocIds, FOLDER_STATS_EACH),
      mobiusNodeRepo.getTopWordCountByDocIds(groupDocIds, FOLDER_STATS_EACH),
      mobiusEdgeRepo.countEdges(groupDocIds, GraphEdgeType.References),
      chunkedTagCountsByFromNodes(mobiusEdgeRepo, groupDocIds, FOLDER_TOP_TAGS)
    ]);
    const uniqueIds = [.../* @__PURE__ */ new Set([
      ...topRecentRaw.map((r) => r.doc_id),
      ...topWordCountRaw.map((r) => r.doc_id),
      ...Array.from(edgeCounts.incoming.keys()),
      ...Array.from(edgeCounts.outgoing.keys())
    ])];
    const idToPath = new Map(
      (uniqueIds.length ? await indexedDocumentRepo.getByIds(uniqueIds) : []).map((m) => [m.id, m.path])
    );
    const strip = (p) => stripFolderPrefixForDisplay(p, folderKey);
    const topRecent = topRecentRaw.map((r) => ({ path: strip(idToPath.get(r.doc_id) ?? r.doc_id) }));
    const topWordCount = topWordCountRaw.map((r) => ({
      path: strip(idToPath.get(r.doc_id) ?? r.doc_id),
      word_count: r.word_count
    }));
    const topLinksIn = [...edgeCounts.incoming.entries()].sort((a, b) => b[1] - a[1]).slice(0, FOLDER_STATS_EACH).map(([node_id, inDegree]) => ({ path: strip(idToPath.get(node_id) ?? node_id), inDegree }));
    const topLinksOut = [...edgeCounts.outgoing.entries()].sort((a, b) => b[1] - a[1]).slice(0, FOLDER_STATS_EACH).map(([node_id, outDegree]) => ({ path: strip(idToPath.get(node_id) ?? node_id), outDegree }));
    const keywordCount = /* @__PURE__ */ new Map();
    for (const p of groupPaths) {
      const basename = p.split("/").pop() ?? p;
      const nameWithoutExt = basename.replace(/\.[^.]+$/, "");
      for (const token of tokenizePathOrLabel(nameWithoutExt)) {
        keywordCount.set(token, (keywordCount.get(token) ?? 0) + 1);
      }
    }
    const nameKeywords = [...keywordCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, NAME_KEYWORDS_TOP).map(([keyword, count]) => ({ keyword, count }));
    const tagNodeIds = tagCountsRaw.map((r) => r.to_node_id);
    const tagNodeMap = tagNodeIds.length ? await mobiusNodeRepo.getByIds(tagNodeIds) : /* @__PURE__ */ new Map();
    const folderTagDesc = tagCountsRaw.map((r) => {
      const label = tagNodeMap.get(r.to_node_id)?.label ?? r.to_node_id;
      return `${label}(${r.count})`;
    }).join(", ");
    folderLines.push({
      folderPath,
      inGroupCount,
      totalInFolder,
      extraCount: extraCount > 0 ? extraCount : void 0,
      hasTopRecent: topRecent.length > 0,
      topRecent,
      hasTopWordCount: topWordCount.length > 0,
      topWordCount,
      hasTopLinksIn: topLinksIn.length > 0,
      topLinksIn,
      hasTopLinksOut: topLinksOut.length > 0,
      topLinksOut,
      hasNameKeywords: nameKeywords.length > 0,
      nameKeywords,
      hasFolderTagDesc: !!folderTagDesc.trim(),
      folderTagDesc
    });
  }
  return folderLines;
}
async function chunkedTagCountsByFromNodes(graphEdgeRepo, fromNodeIds, limitN) {
  if (!fromNodeIds.length || limitN <= 0) return [];
  const byTo = /* @__PURE__ */ new Map();
  for (const c of chunk(fromNodeIds, EDGE_QUERY_CHUNK)) {
    const edges = await graphEdgeRepo.getByFromNodesAndTypes(c, [...GRAPH_TAGGED_EDGE_TYPES]);
    for (const e of edges) byTo.set(e.to_node_id, (byTo.get(e.to_node_id) ?? 0) + 1);
  }
  return [...byTo.entries()].sort((a, b) => b[1] - a[1]).slice(0, limitN).map(([to_node_id, count]) => ({ to_node_id, count }));
}
function basenameWithoutExtension(pathOrBasename) {
  const basename = pathOrBasename.split("/").pop() ?? pathOrBasename;
  const noExt = basename.replace(/\.[^.]+$/, "").trim();
  return noExt || basename;
}
function buildKeywordCluster(docEntries, idToPath, shortIdPrefix) {
  docEntries = docEntries.filter((e) => e.path !== "");
  const tokenFreq = /* @__PURE__ */ new Map();
  const docTokens = /* @__PURE__ */ new Map();
  for (const { id, path: path3 } of docEntries) {
    const basenameNoExt = basenameWithoutExtension(path3);
    const tokens = filterTokensForGraph(tokenizePathOrLabel(basenameNoExt));
    docTokens.set(id, tokens);
    for (const t of tokens) tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
  }
  const tokenToIds = /* @__PURE__ */ new Map();
  for (const { id, path: path3 } of docEntries) {
    const tokens = docTokens.get(id) ?? [];
    for (const t of tokens) {
      if ((tokenFreq.get(t) ?? 0) < KEYWORD_MIN_FREQ) continue;
      let set = tokenToIds.get(t);
      if (!set) {
        set = /* @__PURE__ */ new Set();
        tokenToIds.set(t, set);
      }
      set.add(id);
    }
  }
  let keptTokens = [...tokenToIds.keys()].filter((t) => (tokenToIds.get(t)?.size ?? 0) >= KEYWORD_MIN_FREQ);
  keptTokens.sort((a, b) => {
    const lenA = a.length, lenB = b.length;
    if (lenB !== lenA) return lenB - lenA;
    return (tokenToIds.get(b)?.size ?? 0) - (tokenToIds.get(a)?.size ?? 0);
  });
  const toRemove = /* @__PURE__ */ new Set();
  for (let i = 0; i < keptTokens.length; i++) {
    const shortT = keptTokens[i];
    if (toRemove.has(shortT)) continue;
    for (let j = 0; j < i; j++) {
      const longT = keptTokens[j];
      if (toRemove.has(longT)) continue;
      if (longT.includes(shortT)) {
        const longSet = tokenToIds.get(longT);
        const shortSet = tokenToIds.get(shortT);
        if (shortSet) for (const id of shortSet) longSet.add(id);
        toRemove.add(shortT);
        break;
      }
    }
  }
  keptTokens = keptTokens.filter((t) => !toRemove.has(t)).slice(0, MAX_KW_TOKENS);
  for (const t of toRemove) tokenToIds.delete(t);
  const docSetSignature = (t) => [...tokenToIds.get(t) ?? []].sort().join(",");
  const sigToTokens = /* @__PURE__ */ new Map();
  for (const t of keptTokens) {
    const sig = docSetSignature(t);
    const list = sigToTokens.get(sig) ?? [];
    list.push(t);
    sigToTokens.set(sig, list);
  }
  const mergedLabels = [];
  const mergedTokenToIds = /* @__PURE__ */ new Map();
  for (const [, group] of sigToTokens) {
    const label = group.length > 1 ? group.join(" / ") : group[0];
    mergedLabels.push(label);
    mergedTokenToIds.set(label, new Set(tokenToIds.get(group[0])));
  }
  mergedLabels.sort((a, b) => (mergedTokenToIds.get(b)?.size ?? 0) - (mergedTokenToIds.get(a)?.size ?? 0));
  keptTokens = mergedLabels;
  tokenToIds.clear();
  for (const t of keptTokens) tokenToIds.set(t, mergedTokenToIds.get(t));
  const tokenToBasenames = /* @__PURE__ */ new Map();
  for (const t of keptTokens) {
    const ids = tokenToIds.get(t);
    tokenToBasenames.set(t, ids ? [...ids].map((id) => (idToPath.get(id) ?? id).split("/").pop() ?? id) : []);
  }
  let idx = 0;
  const kwToShortId = /* @__PURE__ */ new Map();
  for (const t of keptTokens) kwToShortId.set(t, `${shortIdPrefix}_${indexToAlias(idx++)}`);
  const topForShared = keptTokens.slice(0, SHARED_KW_TOP_TOKENS);
  const candidates = [];
  for (let i = 0; i < topForShared.length; i++) {
    for (let j = i + 1; j < topForShared.length; j++) {
      const t1 = topForShared[i], t2 = topForShared[j];
      const s1 = tokenToIds.get(t1), s2 = tokenToIds.get(t2);
      const ids = new Set([...s1].filter((id) => s2.has(id)));
      if (ids.size >= SHARED_MIN_DOCS) candidates.push({ ids, tokens: [t1, t2] });
    }
  }
  candidates.sort((a, b) => b.ids.size - a.ids.size);
  const alreadyAssigned = /* @__PURE__ */ new Set();
  const sharedNodes = [];
  const sharedContributors = /* @__PURE__ */ new Map();
  for (const { ids, tokens } of candidates) {
    const usable = new Set([...ids].filter((id) => !alreadyAssigned.has(id)));
    if (usable.size < SHARED_MIN_DOCS) continue;
    const shortId = `${shortIdPrefix}_shared_${indexToAlias(sharedNodes.length)}`;
    const basenames = [...usable].map((id) => (idToPath.get(id) ?? id).split("/").pop() ?? id);
    sharedNodes.push({ shortId, tokenNames: [...tokens], basenames, ids: [...usable] });
    sharedContributors.set(shortId, [...tokens]);
    for (const id of usable) alreadyAssigned.add(id);
    for (const t of tokens) {
      const set = tokenToIds.get(t);
      if (set) for (const id of usable) set.delete(id);
    }
  }
  for (const t of keptTokens) {
    const ids = tokenToIds.get(t);
    tokenToBasenames.set(t, ids ? [...ids].map((id) => (idToPath.get(id) ?? id).split("/").pop() ?? id) : []);
  }
  const docIdsInKwOrShared = /* @__PURE__ */ new Set();
  for (const t of keptTokens) {
    const set = tokenToIds.get(t);
    if (set) for (const id of set) docIdsInKwOrShared.add(id);
  }
  for (const id of alreadyAssigned) docIdsInKwOrShared.add(id);
  return {
    keptTokens,
    kwToShortId,
    tokenToBasenames,
    tokenToIds,
    sharedNodes,
    sharedContributors,
    docIdsInKwOrShared
  };
}
async function loadMermaidGraphDataFromPaths(internalIds, pathById) {
  if (internalIds.length === 0) return null;
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const { inMap: internalInDegreeMap, outMap: internalOutDegreeMap } = await mobiusEdgeRepo.getDegreeMapsByNodeIdsChunked(internalIds, GraphEdgeType.References);
  const allNodeIds = /* @__PURE__ */ new Set([...internalInDegreeMap.keys(), ...internalOutDegreeMap.keys()]);
  const totalByNode = /* @__PURE__ */ new Map();
  for (const nid of allNodeIds) {
    const total = (internalInDegreeMap.get(nid) ?? 0) + (internalOutDegreeMap.get(nid) ?? 0);
    if (total > GRAPH_MIN_DEGREE) totalByNode.set(nid, total);
  }
  const topByDegree = [...totalByNode.entries()].sort((a, b) => b[1] - a[1]).slice(0, GRAPH_INTERNAL_NODES_TOP_K).map(([id]) => id);
  if (topByDegree.length === 0) return null;
  const topSet = new Set(topByDegree);
  const internalSet = new Set(internalIds);
  const [fromEdges, toEdges, { extOut, extIn }] = await Promise.all([
    mobiusEdgeRepo.getByFromNodesAndTypes(topByDegree, [GraphEdgeType.References]),
    mobiusEdgeRepo.getByToNodesAndTypes(topByDegree, [GraphEdgeType.References]),
    mobiusEdgeRepo.getExternalEdgeCountsChunked(internalIds, GraphEdgeType.References, GRAPH_EXTERNAL_NODES_TOP_K)
  ]);
  const connectorScore = /* @__PURE__ */ new Map();
  for (const e of fromEdges) {
    if (internalSet.has(e.to_node_id) && !topSet.has(e.to_node_id))
      connectorScore.set(e.to_node_id, (connectorScore.get(e.to_node_id) ?? 0) + 1);
  }
  for (const e of toEdges) {
    if (internalSet.has(e.from_node_id) && !topSet.has(e.from_node_id))
      connectorScore.set(e.from_node_id, (connectorScore.get(e.from_node_id) ?? 0) + 1);
  }
  const connectors = [...connectorScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, CONNECTOR_MAX).map(([id]) => id);
  const internalNodeIds_TopReference = [...topByDegree, ...connectors];
  const intraEdges = await mobiusEdgeRepo.getIntraEdges(internalNodeIds_TopReference, GraphEdgeType.References);
  const allExtNodeIds = [.../* @__PURE__ */ new Set([...extOut.map((r) => r.to_node_id), ...extIn.map((r) => r.from_node_id)])];
  const extOutIdSet = new Set(extOut.map((r) => r.to_node_id));
  const extInIdSet = new Set(extIn.map((r) => r.from_node_id));
  const extMutualIds = [...extOutIdSet].filter((id) => extInIdSet.has(id));
  const extOutOnlyIds = [...extOutIdSet].filter((id) => !extInIdSet.has(id));
  const extInOnlyIds = [...extInIdSet].filter((id) => !extOutIdSet.has(id));
  if (allExtNodeIds.length > 0) {
    const { inMap: extInMap, outMap: extOutMap } = await mobiusEdgeRepo.getDegreeMapsByNodeIdsChunked(allExtNodeIds, GraphEdgeType.References);
    for (const [id, d] of extInMap) internalInDegreeMap.set(id, d);
    for (const [id, d] of extOutMap) internalOutDegreeMap.set(id, d);
  }
  const allNodeIdToPath = new Map(pathById);
  const metaRows = await indexedDocumentRepo.getByIds([...internalNodeIds_TopReference, ...allExtNodeIds]);
  for (const m of metaRows) allNodeIdToPath.set(m.id, m.path);
  const extIdsWithoutPath = allExtNodeIds.filter((id) => !allNodeIdToPath.has(id));
  if (extIdsWithoutPath.length > 0) {
    const graphNodeMap = await mobiusNodeRepo.getByIds(extIdsWithoutPath);
    for (const id of extIdsWithoutPath) allNodeIdToPath.set(id, graphNodeMap.get(id)?.label ?? id);
  }
  const nodeIdToAlias = buildIdToAlias([...internalNodeIds_TopReference, ...allExtNodeIds]);
  return {
    internalIds,
    internalNodeIds_TopReference,
    internalInDegreeMap,
    internalOutDegreeMap,
    intraEdges,
    extOut,
    extIn,
    extOutOnlyIds,
    extInOnlyIds,
    extMutualIds,
    allExtNodeIds,
    allNodeIdToPath,
    nodeIdToAlias
  };
}
function indexToAlias(i) {
  if (i < 0) return "";
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + n % 26) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
function buildIdToAlias(orderedIds) {
  const map = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  let idx = 0;
  for (const id of orderedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    map.set(id, indexToAlias(idx++));
  }
  return map;
}
function formatDocIdsWithDegree(ids, idToPath, inMap, outMap) {
  return ids.map((id) => {
    const path3 = idToPath.get(id) ?? id;
    const basename = String(path3.split("/").pop() ?? path3).replace(/\]/g, "");
    const inD = inMap.get(id) ?? 0, outD = outMap.get(id) ?? 0;
    const inPart = inD > 0 ? `in:${inD}` : "", outPart = outD > 0 ? `out:${outD}` : "";
    const degreePart = inPart && outPart ? ` (${inPart} ${outPart})` : inPart || outPart ? ` (${inPart || outPart})` : "";
    return basename + degreePart;
  }).join(";<br>");
}
function emitMermaidFlowchart(pathPrefixes, data, internal) {
  const {
    internalNodeIds_TopReference: displayNodeIds,
    allNodeIdToPath: idToPath,
    internalInDegreeMap: inMap,
    internalOutDegreeMap: outMap,
    intraEdges,
    nodeIdToAlias: idToAlias,
    extOutOnlyIds,
    extInOnlyIds,
    extMutualIds
  } = data;
  const hasIntraEdge = /* @__PURE__ */ new Set();
  for (const e of intraEdges) {
    hasIntraEdge.add(e.from_node_id);
    hasIntraEdge.add(e.to_node_id);
  }
  const connectedNodeIds = displayNodeIds.filter((nid) => hasIntraEdge.has(nid));
  const isolatedNodeIds = displayNodeIds.filter((nid) => !hasIntraEdge.has(nid));
  const orphanIdsToShow = isolatedNodeIds.filter((id) => !internal.docIdsInKwOrShared.has(id));
  const mermaidLines = ["flowchart TD"];
  const groupNodeId = "Group";
  const groupLabel = renderPathPrefixTreeToLabel(pathPrefixes);
  mermaidLines.push(`  subgraph groupWrap ["Group"]`);
  mermaidLines.push(`    ${groupNodeId}["${groupLabel}"]`);
  for (const nid of connectedNodeIds) {
    const alias = idToAlias.get(nid);
    if (alias == null) continue;
    const path3 = idToPath.get(nid) ?? nid;
    const basename = String(path3.split("/").pop() ?? path3).replace(/\]/g, "");
    const inD = inMap.get(nid) ?? 0, outD = outMap.get(nid) ?? 0;
    const inPart = inD > 0 ? `in:${inD}` : "", outPart = outD > 0 ? `out:${outD}` : "";
    const degreePart = inPart && outPart ? ` (${inPart} ${outPart})` : inPart || outPart ? ` (${inPart || outPart})` : "";
    mermaidLines.push(`    ${alias}["${basename + degreePart}"]`);
  }
  if (orphanIdsToShow.length > 0) {
    const orphansLabel = `Orphans<br>(${formatDocIdsWithDegree(orphanIdsToShow, idToPath, inMap, outMap)})`;
    mermaidLines.push(`    Orphans["${orphansLabel}"]`);
  }
  const kwIdsSeen = /* @__PURE__ */ new Set();
  for (const t of internal.keptTokens) {
    const kid = internal.kwToShortId.get(t);
    if (kwIdsSeen.has(kid)) continue;
    kwIdsSeen.add(kid);
    const ids = [...internal.tokenToIds.get(t) ?? []];
    const kwLabel = ids.length > 0 ? `kw: ${t}<br>(${formatDocIdsWithDegree(ids, idToPath, inMap, outMap)})` : `kw: ${t}`;
    mermaidLines.push(`    ${kid}["${kwLabel}"]`);
  }
  for (const sh of internal.sharedNodes) {
    const label = sh.ids.length > 0 ? `(${formatDocIdsWithDegree(sh.ids, idToPath, inMap, outMap)})` : "";
    mermaidLines.push(`    ${sh.shortId}["${label}"]`);
  }
  mermaidLines.push("  end");
  const extIdsFiltered = (ids) => ids.filter((id) => {
    const name = (idToPath.get(id) ?? id).split("/").pop() ?? id;
    return !(name.length >= 24 && /^[a-f0-9]+$/i.test(name));
  });
  if (extOutOnlyIds.length > 0) mermaidLines.push(`  extOut_glue["${extIdsFiltered(extOutOnlyIds).length > 0 ? `ext out<br>(${formatDocIdsWithDegree(extIdsFiltered(extOutOnlyIds), idToPath, inMap, outMap)})` : "ext out"}"]`);
  if (extInOnlyIds.length > 0) mermaidLines.push(`  extIn_glue["${extIdsFiltered(extInOnlyIds).length > 0 ? `ext in<br>(${formatDocIdsWithDegree(extIdsFiltered(extInOnlyIds), idToPath, inMap, outMap)})` : "ext in"}"]`);
  if (extMutualIds.length > 0) mermaidLines.push(`  extMutual_glue["${extIdsFiltered(extMutualIds).length > 0 ? `ext mutual<br>(${formatDocIdsWithDegree(extIdsFiltered(extMutualIds), idToPath, inMap, outMap)})` : "ext mutual"}"]`);
  for (const e of intraEdges) {
    const fromA = idToAlias.get(e.from_node_id), toA = idToAlias.get(e.to_node_id);
    if (fromA != null && toA != null) mermaidLines.push(`  ${fromA} --> ${toA}`);
  }
  for (const t of internal.keptTokens) mermaidLines.push(`  ${groupNodeId} --> ${internal.kwToShortId.get(t)}`);
  for (const [sharedShortId, tokenNames] of internal.sharedContributors) {
    for (const t of tokenNames) {
      const kid = internal.kwToShortId.get(t);
      if (kid) mermaidLines.push(`  ${kid} --> ${sharedShortId}`);
    }
  }
  if (orphanIdsToShow.length > 0) mermaidLines.push(`  ${groupNodeId} --> Orphans`);
  if (extOutOnlyIds.length > 0) mermaidLines.push(`  ${groupNodeId} --> extOut_glue`);
  if (extInOnlyIds.length > 0) mermaidLines.push(`  extIn_glue --> ${groupNodeId}`);
  if (extMutualIds.length > 0) {
    mermaidLines.push(`  ${groupNodeId} --> extMutual_glue`);
    mermaidLines.push(`  extMutual_glue --> ${groupNodeId}`);
  }
  return mermaidLines.length > 1 ? mermaidLines.join("\n") : "";
}
async function weavePathsToContext(paths, templateManager) {
  if (!paths.length) return "";
  if (!templateManager) return "";
  const normalized = [...new Set(paths)].filter((p) => /\.md$/i.test(p)).sort();
  if (normalized.length === 0) return "";
  const graphRepo = sqliteStoreManager.getGraphRepo();
  try {
    const idMaps = await getIdsByPathsChunked(normalized);
    const pathById = new Map(idMaps.map((m) => [m.id, m.path]));
    const idByPath = new Map(idMaps.map((m) => [m.path, m.id]));
    const docIds = idMaps.map((m) => m.id);
    if (docIds.length === 0) return "";
    const folderLines = await buildFolderLinesFromPaths(normalized, idByPath);
    const { topicTagCounts, keywordTagCounts } = await graphRepo.getTagsByDocIds(docIds);
    const tagDesc = Array.from(topicTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, TOP_TAGS).map(([name, count]) => `${name}(${count})`).join(", ");
    const userKeywordTagDesc = Array.from(keywordTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, TOP_TAGS).map(([name, count]) => `${name}(${count})`).join(", ");
    const pathsForGraph = normalized.length > MAX_PATHS_FOR_GRAPH ? normalized.slice(0, MAX_PATHS_FOR_GRAPH) : normalized;
    const idMapsForGraph = pathsForGraph.length === normalized.length ? idMaps : await getIdsByPathsChunked(pathsForGraph);
    const internalIdsForGraph = idMapsForGraph.map((m) => m.id);
    const pathByIdForGraph = new Map(idMapsForGraph.map((m) => [m.id, m.path]));
    const folderPrefixes = normalizeFolderPrefixes(pathsForGraph.map((p) => dirname(p)));
    let mermaidCode = "";
    const data = await loadMermaidGraphDataFromPaths(internalIdsForGraph, pathByIdForGraph);
    if (data) {
      const internal = buildKeywordCluster(
        data.internalNodeIds_TopReference.map((id) => ({ id, path: data.allNodeIdToPath.get(id) ?? "" })),
        data.allNodeIdToPath,
        "int"
      );
      mermaidCode = emitMermaidFlowchart(folderPrefixes, data, internal);
    }
    const payload = {
      hasFolderLines: folderLines.length > 0,
      folderLines,
      hasTagDesc: !!tagDesc.trim(),
      tagDesc,
      hasUserKeywordTagDesc: !!userKeywordTagDesc.trim(),
      userKeywordTagDesc,
      hasMermaidCode: !!mermaidCode,
      mermaidCode
    };
    return await templateManager.render(AgentTemplateId.WeavePathsContext, payload);
  } catch (err) {
    console.warn("[weavePathsToContext]", err);
    return "(Weaved context unavailable: data error)";
  }
}

// src/service/agents/search-agent-helper/RawSearchAgent.ts
async function resolvePathSubmitToPaths(report, getFullVaultPaths) {
  const paths = /* @__PURE__ */ new Set();
  if (report.lead_strategy?.must_expand_prefixes?.length) {
    const full = getFullVaultPaths();
    const maxCap = report.lead_strategy.max_expand_results ?? 5e3;
    let expanded = full.filter(
      (p) => report.lead_strategy.must_expand_prefixes.some((prefix) => {
        const norm = prefix.replace(/\/$/, "");
        return norm === "" ? true : p === norm || p.startsWith(norm + "/");
      })
    );
    const includeRegex = report.lead_strategy.include_path_regex;
    if (includeRegex?.length) {
      const compiled = includeRegex.map((r) => {
        try {
          return new RegExp(r, "i");
        } catch {
          return null;
        }
      }).filter(Boolean);
      if (compiled.length) expanded = expanded.filter((p) => compiled.some((re) => re.test(p)));
    }
    const excludeRegex = report.lead_strategy.exclude_path_regex;
    if (excludeRegex?.length) {
      const compiled = excludeRegex.map((r) => {
        try {
          return new RegExp(r, "i");
        } catch {
          return null;
        }
      }).filter(Boolean);
      if (compiled.length) expanded = expanded.filter((p) => !compiled.some((re) => re.test(p)));
    }
    expanded.slice(0, maxCap).forEach((p) => paths.add(p));
  }
  if (report.search_plan?.length) {
    const client = AppContext.getInstance().searchClient;
    for (const item of report.search_plan) {
      try {
        const res = await client.search({
          text: item.query,
          scopeMode: "inFolder",
          scopeValue: { folderPath: item.scope_path },
          topK: item.top_k ?? 80,
          searchMode: item.search_mode ?? "fulltext",
          indexTenant: "vault"
        });
        (res.items ?? []).forEach((i) => paths.add(i.path));
      } catch {
      }
    }
  }
  if (report.discovered_leads?.length) {
    const mdOnly = report.discovered_leads.filter((p) => /\.md$/i.test(p));
    mdOnly.forEach((p) => paths.add(p));
  }
  return Array.from(paths).sort();
}
var RawSearchAgent = class {
  constructor(aiServiceManager, context) {
    this.aiServiceManager = aiServiceManager;
    this.context = context;
    this.reconAgent = new ReconAgent(this.aiServiceManager, this.context);
  }
  /**
   * Recon-only path for physical tasks (Search Architect output). Uses physical-task recon prompt (unified_intent).
   * onReconFinish receives (results, mergedPaths, weavedContext).
   */
  async *streamSearchReconOnlyForPhysicalTasks(options) {
    const stopWatch = new Stopwatch("streamSearchReconOnlyForPhysicalTasks");
    const { runStepId, physicalTasks, onReconFinish } = options;
    let lastResults = [];
    let lastMergedPaths = [];
    let lastWeavedContext = "";
    stopWatch.start("streamPhysicalTasksReconOnly");
    yield* this.reconAgent.streamPhysicalTasksReconOnly({
      runStepId,
      physicalTasks,
      stepId: runStepId ?? generateUuidWithoutHyphens(),
      onReconFinish: (results, mergedPaths, weavedContext) => {
        lastResults = results;
        lastMergedPaths = mergedPaths;
        lastWeavedContext = weavedContext ?? "";
        onReconFinish(results, mergedPaths, weavedContext);
      }
    });
    stopWatch.stop();
    yield {
      type: "pk-debug",
      debugName: "streamSearchReconOnlyForPhysicalTasksResult",
      triggerName: "search-raw-agent" /* SEARCH_RAW_AGENT */,
      extra: {
        physicalTasksCount: physicalTasks.length,
        durationLabel: "streamSearchReconOnlyForPhysicalTasks",
        totalDuration: stopWatch.getTotalElapsed(),
        lastResults,
        lastMergedPaths,
        lastWeavedContext
      }
    };
  }
};
var ReconAgent = class {
  constructor(aiServiceManager, context) {
    this.aiServiceManager = aiServiceManager;
    this.context = context;
  }
  /**
   * Runs parallel recon for physical tasks (Search Architect output). Uses physical-task recon prompt.
   * Collects one result per run; merges all paths; weaves paths to context; onReconFinish(results, mergedPaths, weavedContext).
   */
  async *streamPhysicalTasksReconOnly(options) {
    const { runStepId, physicalTasks, onReconFinish } = options;
    const stepId = options.stepId ?? runStepId ?? generateUuidWithoutHyphens();
    const reconMeta = runStepId ? { runStepId, stage: "recon", agent: "RawSearchAgent.Recon" } : null;
    if (reconMeta) {
      yield uiStepStart(reconMeta, {
        title: "Parallel recon (physical tasks)\u2026",
        description: `${physicalTasks.length} task(s)`,
        triggerName: "search-raw-agent-recon" /* SEARCH_RAW_AGENT_RECON */
      });
    }
    const stopWatch = new Stopwatch("streamPhysicalTasksReconOnly");
    stopWatch.start("parallel_physical_tasks_recon");
    const results = new Array(physicalTasks.length);
    const reconStreams = physicalTasks.map((task, index) => {
      const lane = { laneType: "physical-task", laneId: `physical-${index}`, index };
      const taskStepId = reconMeta && runStepId ? makeStepId({ ...reconMeta, lane }) : `${index}-${generateUuidWithoutHyphens()}`;
      return this.streamReconForPhysicalTask(task, taskStepId, (result) => {
        results[index] = result;
      });
    });
    for await (const ev of parallelStream(reconStreams)) {
      yield ev;
      if (ev.type === "parallel-stream-progress" && reconMeta) {
        yield uiStageSignal(reconMeta, {
          status: "progress",
          payload: {
            completed: ev.completed,
            total: ev.total,
            completedIndices: ev.completedIndices ?? []
          },
          triggerName: "search-raw-agent-recon" /* SEARCH_RAW_AGENT_RECON */
        });
      }
    }
    stopWatch.stop();
    if (reconMeta) {
      yield uiStageSignal(reconMeta, { status: "complete", payload: { physicalTasks: physicalTasks.length }, triggerName: "search-raw-agent-recon" /* SEARCH_RAW_AGENT_RECON */ });
    }
    const finishedResults = results.filter((r) => r != null);
    const mergedPaths = [...new Set(finishedResults.flatMap((r) => r.paths))].sort();
    const tm = this.aiServiceManager.getTemplateManager?.();
    const weavedContext = await weavePathsToContext(mergedPaths, tm);
    onReconFinish(finishedResults, mergedPaths, weavedContext ?? "");
    yield {
      type: "pk-debug",
      debugName: "parallelPhysicalTasksReconResult",
      triggerName: "search-raw-agent-task-consolidator" /* SEARCH_RAW_AGENT_TASK_CONSOLIDATOR */,
      extra: {
        physicalTasksCount: physicalTasks.length,
        resultsCount: finishedResults.length,
        mergedPathsCount: mergedPaths.length,
        stepDuration: stopWatch.getLastDuration(),
        physicalTaskResults: finishedResults,
        mergedPaths
      }
    };
  }
  /**
   * Recon for one physical task (unified_intent). Reuses dimension recon prompt with unified_intent + scope.
   */
  async *streamReconForPhysicalTask(physicalTask, stepId, onResult) {
    const singleReconAgent = new SingleReconAgent(this.aiServiceManager, this.context);
    yield* singleReconAgent.streamReconForPhysicalTask(physicalTask, stepId, onResult);
  }
};
var RECON_MANUAL_LOOP_MAX_ITERATIONS_MANIFEST = 10;
var RECON_MANUAL_LOOP_MAX_ITERATIONS_DEFAULT = 5;
function buildTaskReminder(ctx) {
  const parts = [
    "[Task focus \u2014 stay aligned]",
    "User query: " + (ctx.userQuery || "(none)")
  ];
  if (ctx.dimensionId) parts.push("Dimension: " + ctx.dimensionId);
  if (ctx.intent_description) parts.push("Intent: " + ctx.intent_description);
  if (ctx.unified_intent) parts.push("Unified intent: " + ctx.unified_intent);
  return parts.join("\n");
}
var SingleReconAgent = class {
  constructor(aiServiceManager, context) {
    this.aiServiceManager = aiServiceManager;
    this.context = context;
    this.reconResultRef = null;
    const tm = this.aiServiceManager.getTemplateManager?.();
    this.explorationTools = {
      inspect_note_context: inspectNoteContextToolMarkdownOnly(tm),
      graph_traversal: graphTraversalToolMarkdownOnly(tm),
      find_path: findPathTool(tm),
      explore_folder: exploreFolderToolMarkdownOnly(tm),
      grep_file_tree: grepFileTreeTool(),
      local_search_whole_vault: localSearchWholeVaultTool(tm)
    };
  }
  async *runPlanRecon(ops) {
    const { iter, ctx, messages, stepId, onPlanFinish, stopwatch } = ops;
    stopwatch.start("[iteration " + iter + "] plan step messages.");
    yield {
      type: "pk-debug",
      debugName: "Recon Manual Loop - iteration " + iter + " plan step start.",
      extra: { currentMessages: JSON.stringify(messages) }
    };
    const planStepMessages = [];
    const system = await this.aiServiceManager.renderPrompt("ai-analysis-recon-loop-plan-system" /* AiAnalysisReconLoopPlanSystem */, ctx);
    yield buildPromptTraceDebugEvent("search-raw-agent-recon-plan-step" /* SEARCH_RAW_AGENT_RECON_PLAN_STEP */, system, JSON.stringify(messages));
    const stepResult = (0, import_ai2.streamText)({
      model: this.aiServiceManager.getModelInstanceForPrompt("ai-analysis-recon-loop-plan-system" /* AiAnalysisReconLoopPlanSystem */).model,
      system,
      messages,
      tools: this.explorationTools,
      toolChoice: "required"
    });
    yield* streamTransform(stepResult.fullStream, "search-raw-agent-recon-plan-step" /* SEARCH_RAW_AGENT_RECON_PLAN_STEP */, {
      yieldUIStep: { uiType: "steps-display" /* STEPS_DISPLAY */, stepId }
    });
    const responseReasoning = (await stepResult.reasoning).map((r) => r.text).join("\n");
    if (!isBlankString(responseReasoning)) {
      planStepMessages.push({ role: "assistant", content: responseReasoning });
    }
    const responseText = await stepResult.text;
    if (!isBlankString(responseText)) {
      planStepMessages.push({ role: "assistant", content: responseText });
    }
    const toolCalls = await stepResult.toolCalls;
    if (toolCalls.length > 0) {
      planStepMessages.push({
        role: "assistant",
        content: toolCalls.map((tc) => ({
          type: "tool-call",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.input
        }))
      });
    }
    stopwatch.stop();
    yield {
      type: "pk-debug",
      debugName: "Recon Manual Loop - iteration " + iter + " plan step finish.",
      extra: {
        currentStepCost: stopwatch.getLastDuration(),
        responseMessages: JSON.stringify(planStepMessages)
      }
    };
    onPlanFinish(planStepMessages);
  }
  async *runReconTool(ops) {
    const { iter, planStepMessages, stopwatch, onToolCallFinish } = ops;
    stopwatch.start("[iteration " + iter + "] process tool calls.");
    const toolCalls = planStepMessages.flatMap(
      (msg) => msg.role === "assistant" && Array.isArray(msg.content) ? msg.content.filter((part) => part.type === "tool-call") : []
    );
    const currentRoundToolMessagesFull = [];
    const currentRoundToolMessagesSummary = [];
    for (const tc of toolCalls) {
      const exec = this.explorationTools[tc.toolName];
      if (!exec || !exec.execute) continue;
      let output;
      try {
        output = await exec.execute(tc.input);
      } catch (err) {
        console.error("[RawSearchAgent][runReconTool] Error executing tool", tc.toolName, tc.input, err);
        output = { error: err instanceof Error ? err.message : String(err) };
      }
      const toolResultGetter = (outputValue) => ({
        role: "tool",
        content: [{
          type: "tool-result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          output: typeof outputValue === "string" ? { type: "text", value: outputValue } : { type: "json", value: outputValue }
        }]
      });
      currentRoundToolMessagesFull.push(toolResultGetter(output));
      currentRoundToolMessagesSummary.push(toolResultGetter("[truncated for context]"));
    }
    stopwatch.stop();
    yield {
      type: "pk-debug",
      debugName: "Recon Manual Loop - iteration " + iter + " process tool calls",
      extra: { currentStepCost: stopwatch.getLastDuration() }
    };
    onToolCallFinish(currentRoundToolMessagesFull, currentRoundToolMessagesSummary, toolCalls.length > 0);
  }
  async *runSubmitReconPaths(ops) {
    const { iter, ctx, planStepMessages, fullToolResultMessages, alreadyCollectedPaths, previousPathSubmitHistory, stepId, stopwatch, onSubmitFinish } = ops;
    stopwatch.start("[iteration " + iter + "] path submit.");
    const systemPathSubmit = await this.aiServiceManager.renderPrompt("ai-analysis-recon-loop-path-submit-system" /* AiAnalysisReconLoopPathSubmitSystem */, {});
    const taskReminderMessage = [{ role: "user", content: buildTaskReminder(ctx) }];
    const historyMessage = (previousPathSubmitHistory?.length ?? 0) > 0 ? [{ role: "user", content: "Previous rounds' path-submit strategies (do not duplicate must_expand_prefixes or search_plan):\n" + JSON.stringify(previousPathSubmitHistory) }] : [];
    const currentPathsMessage = alreadyCollectedPaths.length > 0 ? [{ role: "user", content: "Current paths already collected (do not include in discovered_leads):\n" + compactPathsForPrompt(alreadyCollectedPaths) }] : [];
    const messages = [...taskReminderMessage, ...historyMessage, ...currentPathsMessage, ...planStepMessages, ...fullToolResultMessages];
    yield buildPromptTraceDebugEvent("search-raw-agent-recon-path-submit-step" /* SEARCH_RAW_AGENT_RECON_PATH_SUBMIT_STEP */, systemPathSubmit, JSON.stringify(messages));
    const providerOptionsConfig = {
      noReasoning: false,
      reasoningEffort: "low"
    };
    const { model: modelPathSubmit, providerOptions } = this.aiServiceManager.getModelInstanceForPrompt("ai-analysis-recon-loop-path-submit-system" /* AiAnalysisReconLoopPathSubmitSystem */, providerOptionsConfig);
    const pathResult = (0, import_ai2.streamObject)({
      model: modelPathSubmit,
      system: systemPathSubmit,
      messages,
      schema: pathSubmitOutputSchema,
      providerOptions
    });
    yield* streamTransform(pathResult.fullStream, "search-raw-agent-recon-path-submit-step" /* SEARCH_RAW_AGENT_RECON_PATH_SUBMIT_STEP */, {
      yieldUIStep: { uiType: "steps-display" /* STEPS_DISPLAY */, stepId }
    });
    let pathSubmitOutput;
    let resolvedPaths = [];
    try {
      pathSubmitOutput = await pathResult.object;
      resolvedPaths = await resolvePathSubmitToPaths(pathSubmitOutput, getFullVaultFilePathsForGrep);
    } catch {
      resolvedPaths = [];
    }
    stopwatch.stop();
    yield {
      type: "pk-debug",
      debugName: "Recon Manual Loop - iteration " + iter + " path submit result",
      extra: {
        currentStepCost: stopwatch.getLastDuration(),
        pathSubmitOutput,
        resolvedPaths
      }
    };
    onSubmitFinish(resolvedPaths, pathSubmitOutput);
  }
  async *runManualReconLoop(ctx, stepId, triggerName) {
    const stopwatch = new Stopwatch("Recon Manual Loop");
    const messages = [
      { role: "user", content: await this.aiServiceManager.renderPrompt("ai-analysis-recon-loop-plan" /* AiAnalysisReconLoopPlan */, ctx) }
    ];
    const allPaths = /* @__PURE__ */ new Set();
    const pathSubmitHistory = [];
    for (let iter = 0; iter < ctx.maxIterations; iter++) {
      const planStepMessages = [];
      yield* this.runPlanRecon({
        iter,
        ctx,
        stopwatch,
        stepId,
        messages: [
          ...messages,
          { role: "user", content: buildTaskReminder(ctx) },
          {
            role: "assistant",
            content: allPaths.size === 0 ? "Current paths: (none yet)" : "Current paths (compact):\n" + compactPathsForPrompt(Array.from(allPaths))
          }
        ],
        onPlanFinish: (messageCallback) => planStepMessages.push(...messageCallback)
      });
      let needToSubmitPaths = false;
      let fullToolResultMessages = [];
      let summaryToolResultMessages = [];
      yield* this.runReconTool({
        iter,
        planStepMessages,
        stopwatch,
        onToolCallFinish: (fullMessages, summaryMessages, needSubmitPaths) => {
          fullToolResultMessages = fullMessages;
          summaryToolResultMessages = summaryMessages;
          needToSubmitPaths = needSubmitPaths;
        }
      });
      let lastPathSubmitOutput;
      let discoveredLeadsCollection = [];
      if (needToSubmitPaths) {
        yield* this.runSubmitReconPaths({
          iter,
          ctx,
          planStepMessages,
          fullToolResultMessages,
          alreadyCollectedPaths: Array.from(allPaths),
          previousPathSubmitHistory: pathSubmitHistory,
          stepId,
          stopwatch,
          onSubmitFinish: (discovered_leads_callback, pathSubmitOutput) => {
            discoveredLeadsCollection = discovered_leads_callback;
            lastPathSubmitOutput = pathSubmitOutput;
          }
        });
      }
      messages.push(...planStepMessages);
      messages.push(...summaryToolResultMessages);
      messages.push({
        role: "assistant",
        content: JSON.stringify({
          tactical_summary: lastPathSubmitOutput?.tactical_summary ?? "",
          battlefield_assessment: lastPathSubmitOutput?.battlefield_assessment ?? null,
          lead_strategy: lastPathSubmitOutput?.lead_strategy,
          search_plan: lastPathSubmitOutput?.search_plan,
          resolved_count: discoveredLeadsCollection?.length ?? 0
        })
      });
      discoveredLeadsCollection.forEach((p) => allPaths.add(p));
      pathSubmitHistory.push({
        lead_strategy: lastPathSubmitOutput?.lead_strategy,
        search_plan: lastPathSubmitOutput?.search_plan,
        resolved_count: discoveredLeadsCollection?.length ?? 0
      });
      if (lastPathSubmitOutput?.should_submit_report === true) break;
    }
    yield {
      type: "pk-debug",
      debugName: "Recon Manual Loop",
      extra: {
        stopwatch: stopwatch.toString(),
        pathsCount: allPaths.size,
        pathSubmitHistory
      }
    };
    this.reconResultRef?.({
      paths: Array.from(allPaths).sort(),
      messages,
      pathSubmitHistory
    });
    this.reconResultRef = null;
  }
  /**
   * Recon for one physical task (unified_intent). Reuses dimension recon prompt with unified_intent + scope.
   * Passes back paths, messages, pathSubmitHistory (no final report step).
   */
  async *streamReconForPhysicalTask(physicalTask, stepId, onResult) {
    if (!stepId) stepId = generateUuidWithoutHyphens();
    const scope = physicalTask.scope_constraint;
    const persona = await getVaultPersona();
    const isManifest = physicalTask.covered_dimension_ids.includes("inventory_mapping");
    const maxIterations = isManifest ? RECON_MANUAL_LOOP_MAX_ITERATIONS_MANIFEST : RECON_MANUAL_LOOP_MAX_ITERATIONS_DEFAULT;
    const ctx = {
      userQuery: this.context.getInitialPrompt(),
      unified_intent: physicalTask.unified_intent,
      coveredDimensionIds: physicalTask.covered_dimension_ids.join(", "),
      inventoryRequiresManifest: isManifest,
      scopePath: scope?.path,
      scopeAnchor: scope?.anchor_entity,
      scopeTags: scope?.tags?.length ? scope.tags.join(", ") : void 0,
      vaultDescription: persona.description,
      vaultStructure: persona.structure,
      vaultTopTags: persona.topTags,
      vaultCapabilities: persona.capabilities,
      maxIterations
    };
    this.reconResultRef = (loopResult) => {
      onResult?.({
        task: physicalTask,
        paths: loopResult.paths,
        messages: loopResult.messages,
        pathSubmitHistory: loopResult.pathSubmitHistory
      });
    };
    yield* this.runManualReconLoop(ctx, stepId, "search-raw-agent-recon" /* SEARCH_RAW_AGENT_RECON */);
  }
};

// src/service/agents/search-agent-helper/SearchArchitectAgent.ts
var import_ai3 = require("ai");
function fallbackPhysicalTasks(dimensions) {
  return dimensions.map((d, i) => ({
    unified_intent: d.intent_description,
    covered_dimension_ids: [d.id],
    search_priority: i,
    scope_constraint: d.scope_constraint
  }));
}
async function* streamSearchArchitect(aiServiceManager, dimensions, userQuery, options) {
  const { runStepId, onFinish } = options;
  if (dimensions.length === 0) {
    onFinish([]);
    return;
  }
  const dimensionsPayload = dimensions.map((d) => ({
    id: d.id,
    intent_description: d.intent_description,
    scope_constraint: d.scope_constraint
  }));
  const dimensionsJson = JSON.stringify(dimensionsPayload, null, 2);
  const promptInfo = await aiServiceManager.getPromptInfo("ai-analysis-search-architect" /* AiAnalysisSearchArchitect */);
  const system = await aiServiceManager.renderPrompt(promptInfo.systemPromptId, {});
  const prompt = await aiServiceManager.renderPrompt("ai-analysis-search-architect" /* AiAnalysisSearchArchitect */, {
    userQuery,
    dimensionsJson
  });
  const { provider, modelId } = aiServiceManager.getModelForPrompt("ai-analysis-search-architect" /* AiAnalysisSearchArchitect */);
  const model = aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId);
  const result = (0, import_ai3.streamText)({
    model,
    system,
    prompt,
    experimental_output: import_ai3.Output.object({
      schema: searchArchitectOutputSchema
    })
  });
  const meta2 = runStepId ? { runStepId, stage: "classify", agent: "SlotRecallAgent", lane: { laneType: "dimension", laneId: "search-architect" } } : null;
  const stepId = meta2 ? makeStepId(meta2) : void 0;
  yield* streamTransform(result.fullStream, "search-slot-recall-agent" /* SEARCH_SLOT_RECALL_AGENT */, {
    yieldUIStep: stepId ? { uiType: "steps-display" /* STEPS_DISPLAY */, stepId } : void 0
  });
  const text = await result.text;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    onFinish(fallbackPhysicalTasks(dimensions));
    return;
  }
  const validated = searchArchitectOutputSchema.safeParse(parsed);
  if (!validated.success || validated.data.physical_tasks.length === 0) {
    onFinish(fallbackPhysicalTasks(dimensions));
    return;
  }
  const tasks = validated.data.physical_tasks;
  tasks.sort((a, b) => a.search_priority - b.search_priority);
  onFinish(tasks);
}

// src/service/agents/search-agent-helper/SlotRecallAgent.ts
function formatFunctionalTagsMapping(mapping) {
  return Object.entries(mapping).map(([dim, tags]) => `${dim} \u2192 ${tags.join(", ")}`).join("\n");
}
var SlotRecallAgent = class {
  constructor(aiServiceManager, context) {
    this.aiServiceManager = aiServiceManager;
    this.context = context;
    this.rawSearchAgent = new RawSearchAgent(this.aiServiceManager, this.context);
  }
  /**
   * Stream:
   * 1) yield "Classifying...", run classifier (streamText + Output.object);
   * 2) yield "Running parallel recall...", run pipeline.
   */
  async *stream(opts) {
    const runStepId = opts?.runStepId ?? generateUuidWithoutHyphens();
    const stopWatch = new Stopwatch();
    stopWatch.start("classifyQuery");
    yield uiStepStart(
      { runStepId, stage: "classify", agent: "SlotRecallAgent" },
      {
        title: "Classifying query\u2026",
        description: "",
        triggerName: "search-slot-recall-agent" /* SEARCH_SLOT_RECALL_AGENT */
      }
    );
    let queryClassify = defaultClassify;
    try {
      yield* this.classifyQuery({
        runStepId,
        stepId: void 0,
        vaultSkeleton: opts?.vaultSkeleton,
        onClassifyFinish: (p) => {
          queryClassify = p;
        }
      });
    } catch (error) {
      yield {
        type: "error",
        error,
        triggerName: "search-slot-recall-agent" /* SEARCH_SLOT_RECALL_AGENT */
      };
      queryClassify = defaultClassify;
    }
    if (queryClassify.semantic_dimensions.length > 10) {
      const tail = queryClassify.semantic_dimensions.slice(10);
      const mergedIntent = tail.map((d) => d.intent_description).join(" ");
      const mergedDimension = {
        id: tail[0].id,
        intent_description: mergedIntent,
        scope_constraint: null,
        retrieval_orientation: null
      };
      queryClassify = {
        ...queryClassify,
        semantic_dimensions: [...queryClassify.semantic_dimensions.slice(0, SLICE_CAPS.agent.slotRecallDimensions), mergedDimension]
      };
    }
    const raw = queryClassify.user_persona_config;
    this.context.setUserPersonaConfig(
      raw == null ? void 0 : {
        appeal: raw.appeal ?? void 0,
        detail_level: raw.detail_level ?? void 0
      }
    );
    const dimensions = this.getDimensionsForRecall(queryClassify);
    this.context.setRecallDimensions(dimensions);
    yield uiStageSignal(
      { runStepId, stage: "classify", agent: "SlotRecallAgent" },
      { status: "complete", payload: { dimensions }, triggerName: "search-slot-recall-agent" /* SEARCH_SLOT_RECALL_AGENT */ }
    );
    stopWatch.stop();
    yield {
      type: "pk-debug",
      debugName: "queryClassifyResult",
      triggerName: "search-slot-recall-agent" /* SEARCH_SLOT_RECALL_AGENT */,
      triggerTimestamp: Date.now(),
      extra: {
        queryClassify,
        durationLabel: "queryClassifyResult",
        stepDuration: stopWatch.getLastDuration(),
        totalDuration: stopWatch.getTotalElapsed()
      }
    };
    if (opts?.skipStreamSearchArchitect) {
      return;
    }
    stopWatch.start("streamSearchArchitect");
    let physicalTasks = [];
    yield* streamSearchArchitect(this.aiServiceManager, dimensions, this.context.getInitialPrompt(), {
      runStepId,
      onFinish: (tasks) => {
        physicalTasks = tasks;
      }
    });
    if (physicalTasks.length === 0) {
      physicalTasks = dimensions.map((d, i) => ({
        unified_intent: d.intent_description,
        covered_dimension_ids: [d.id],
        search_priority: i,
        scope_constraint: d.scope_constraint
      }));
    }
    stopWatch.stop();
    yield {
      type: "pk-debug",
      debugName: "searchArchitectResult",
      triggerName: "search-slot-recall-agent" /* SEARCH_SLOT_RECALL_AGENT */,
      triggerTimestamp: Date.now(),
      extra: {
        physicalTasks,
        durationLabel: "searchArchitectResult",
        stepDuration: stopWatch.getLastDuration(),
        totalDuration: stopWatch.getTotalElapsed()
      }
    };
    if (opts?.skipSearch) {
      return;
    }
    stopWatch.start("streamSearchReconOnlyForPhysicalTasks");
    yield uiStepStart(
      { runStepId, stage: "recon", agent: "SlotRecallAgent" },
      {
        title: "Running parallel recall\u2026",
        description: "",
        triggerName: "search-slot-recall-agent" /* SEARCH_SLOT_RECALL_AGENT */
      }
    );
    yield* this.rawSearchAgent.streamSearchReconOnlyForPhysicalTasks({
      runStepId,
      physicalTasks,
      onReconFinish: (results, mergedPaths, weavedContext) => {
        this.context.setReconReportsFromPhysicalTasks(
          results.map((r) => r.task),
          mergedPaths
        );
        this.context.setReconWeavedContext(weavedContext ?? "");
      }
    });
    stopWatch.stop();
    yield {
      type: "pk-debug",
      debugName: "searchResultAfterGroupEvidence",
      triggerName: "search-slot-recall-agent" /* SEARCH_SLOT_RECALL_AGENT */,
      triggerTimestamp: Date.now(),
      extra: {
        queryClassify,
        dimensions,
        evidencePacks: this.context.getRecallEvidencePacks(),
        durationLabel: "searchResultAfterGroupEvidence",
        stepDuration: stopWatch.getLastDuration(),
        totalDuration: stopWatch.getTotalElapsed()
      }
    };
  }
  async *classifyQuery(options) {
    const meta2 = options?.runStepId ? { runStepId: options.runStepId, stage: "classify", agent: "SlotRecallAgent" } : null;
    const stepId = meta2 ? makeStepId(meta2) : options?.stepId ?? generateUuidWithoutHyphens();
    const promptInfo = await this.aiServiceManager.getPromptInfo("ai-analysis-query-classifier" /* AiAnalysisQueryClassifier */);
    const system = await this.aiServiceManager.renderPrompt(promptInfo.systemPromptId, {});
    const vaultDescription = await getVaultDescription();
    const functionalTagsMapping = formatFunctionalTagsMapping(SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS);
    const prompt = await this.aiServiceManager.renderPrompt("ai-analysis-query-classifier" /* AiAnalysisQueryClassifier */, {
      userQuery: this.context.getInitialPrompt(),
      vaultSkeleton: options?.vaultSkeleton,
      vaultDescription: vaultDescription ?? void 0,
      functionalTagsMapping
    });
    const { provider, modelId } = this.aiServiceManager.getModelForPrompt("ai-analysis-query-classifier" /* AiAnalysisQueryClassifier */);
    const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId);
    const result = (0, import_ai4.streamText)({
      model,
      system,
      prompt,
      experimental_output: import_ai4.Output.object({
        schema: queryClassifierOutputSchema
      })
    });
    yield* streamTransform(result.fullStream, "search-slot-recall-agent" /* SEARCH_SLOT_RECALL_AGENT */, {
      yieldUIStep: stepId ? { uiType: "steps-display" /* STEPS_DISPLAY */, stepId } : void 0
    });
    const text = await result.text;
    const parsed = queryClassifierOutputSchema.safeParse(JSON.parse(text));
    if (parsed.success) options?.onClassifyFinish?.(parsed.data);
  }
  getDimensionsForRecall(output) {
    const { semantic_dimensions, topology_dimensions, temporal_dimensions } = output;
    const semanticSource = semantic_dimensions && semantic_dimensions.length > 0 ? semantic_dimensions : defaultClassify.semantic_dimensions;
    const semantic = semanticSource.map((d) => ({
      id: d.id,
      intent_description: d.intent_description,
      scope_constraint: d.scope_constraint,
      retrieval_orientation: d.retrieval_orientation,
      output_format: null,
      mustIncludeKeywords: null
    }));
    const topologySource = topology_dimensions && topology_dimensions.length > 0 ? topology_dimensions : defaultClassify.topology_dimensions;
    const topology = topologySource.map((d) => ({
      id: AXIS_TOPOLOGY_ID,
      intent_description: d.intent_description,
      scope_constraint: d.scope_constraint,
      retrieval_orientation: null,
      output_format: null,
      mustIncludeKeywords: null
    }));
    const temporalSource = temporal_dimensions && temporal_dimensions.length > 0 ? temporal_dimensions : defaultClassify.temporal_dimensions;
    const temporal = temporalSource.map((d) => ({
      id: AXIS_TEMPORAL_ID,
      intent_description: d.intent_description,
      scope_constraint: d.scope_constraint,
      retrieval_orientation: null,
      output_format: null,
      mustIncludeKeywords: null
    }));
    const finalDimensions = [];
    finalDimensions.push(...semantic, ...topology, ...temporal);
    return finalDimensions;
  }
};

// src/service/agents/search-agent-helper/helpers/gravityGrouping.ts
var AFFINITY_DIRECT_LINK = 5;
var AFFINITY_SAME_PARENT_BASE = 5;
var AFFINITY_COCITATION = 3;
var AFFINITY_SHARED_TAGS = 2;
var AFFINITY_SIMILARITY_PEAK = 10;
var PARENT_IDF_C = 1e3;
var EDGE_LIMIT = 100;
var MIN_AFFINITY_THRESHOLD = 4;
var AFFINITY_SATURATION_SCALE = 10;
var CROSS_DIR_DECAY = 0.55;
var LOUVAIN_GAMMA = 0.8;
var DELTA_Q_THRESHOLD = 1e-6;
var MIN_MOVE_RATIO = 0.01;
var MAX_LOUVAIN_ITERATIONS = 10;
var MAX_EVIDENCE_CONCURRENCY = 12;
var TARGET_LOAD_PER_GROUP = 8;
function taskLoadScore(t) {
  const load = t.task_load ?? "medium";
  return load === "high" ? 3 : load === "low" ? 1 : 2;
}
async function groupConsolidatedTasksGravity(tasks, opts = {}) {
  const maxCapacity = opts.maxCapacity ?? 15;
  if (tasks.length === 0) return [];
  const N = tasks.length;
  const paths = tasks.map((t) => t.path);
  const parentSet = new Set(paths.map((p) => parentPathFromPath(p)));
  const parentPathToFileCount = await getFileCountPerParentPath(parentSet);
  const pathToLinksAndTags = await getLinksAndTagsForPaths(paths);
  const similarityCache = await getPairwiseSimilarityScores(paths);
  const A = buildAffinityMatrix(
    N,
    paths,
    pathToLinksAndTags,
    parentPathToFileCount,
    (i, j) => i === j ? 0 : similarityCache[i]?.[j] ?? 0
  );
  const adj = buildAdjacencyFromMatrix(N, A, MIN_AFFINITY_THRESHOLD);
  const communityByIndex = louvainFromAdjacency(N, adj, paths);
  const indexByCommunity = /* @__PURE__ */ new Map();
  for (let i = 0; i < N; i++) {
    const c = communityByIndex.get(i) ?? i;
    if (!indexByCommunity.has(c)) indexByCommunity.set(c, []);
    indexByCommunity.get(c).push(i);
  }
  let groups = [];
  for (const indices of indexByCommunity.values()) {
    groups.push(indices.map((i) => tasks[i]));
  }
  const pathToIndex = new Map(paths.map((p, i) => [p, i]));
  const capacityBalancedGroups = capacityBalance(groups, maxCapacity, pathToIndex, A);
  const targetLoadPerGroup = opts.targetLoadPerGroup ?? TARGET_LOAD_PER_GROUP;
  const maxEvidenceConcurrency = opts.maxEvidenceConcurrency ?? MAX_EVIDENCE_CONCURRENCY;
  const activeDimensions = new Set(tasks.flatMap((t) => (t.relevant_dimension_ids ?? []).map((d) => d.id))).size;
  const totalScore = tasks.reduce((s, t) => s + taskLoadScore(t), 0);
  const maxGroups = Math.min(
    activeDimensions * 2,
    maxEvidenceConcurrency,
    Math.max(1, Math.ceil(totalScore / targetLoadPerGroup))
  );
  console.debug("[groupConsolidatedTasksGravity] maxGroups:", {
    maxGroups,
    targetLoadPerGroup,
    maxEvidenceConcurrency,
    activeDimensions,
    totalScore,
    groups,
    capacityBalancedGroups
  });
  const finalGroups = balancedGravitationalConsolidation(
    capacityBalancedGroups,
    maxGroups,
    maxCapacity,
    pathToIndex,
    A
  );
  console.debug("[groupConsolidatedTasksGravity] final groups:", finalGroups);
  return finalGroups;
}
function parentPathFromPath(path3) {
  const p = path3.replace(/\\/g, "/");
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(0, idx) : "";
}
async function getFileCountPerParentPath(parentPaths) {
  if (parentPaths.size === 0) return EMPTY_MAP;
  const tenantToPaths = /* @__PURE__ */ new Map();
  for (const p of parentPaths) {
    const tenant = getIndexTenantForPath(p + "/dummy.md");
    if (!tenantToPaths.has(tenant)) tenantToPaths.set(tenant, []);
    tenantToPaths.get(tenant).push(p);
  }
  const out = /* @__PURE__ */ new Map();
  await Promise.all(
    [...tenantToPaths.entries()].map(async ([tenant, paths]) => {
      const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      for (const p of paths) {
        const count = await repo.countByFolderPath(p);
        out.set(p, Math.max(1, count));
      }
    })
  );
  return out;
}
async function getLinksAndTagsForPaths(paths) {
  const out = /* @__PURE__ */ new Map();
  if (paths.length === 0) return out;
  const empty = { outlinks: [], backlinks: [], tags: [] };
  await Promise.all(
    paths.map(async (path3) => {
      try {
        const tenant = getIndexTenantForPath(path3);
        const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
        const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
        const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
        const docMeta = await indexedDocumentRepo.getByPath(path3);
        if (!docMeta?.id) {
          out.set(path3, { ...empty, tags: parseTags(docMeta?.tags ?? null) });
          return;
        }
        const edges = await mobiusEdgeRepo.getAllEdgesForNode(docMeta.id, EDGE_LIMIT);
        const inIds = edges.filter((e) => e.to_node_id === docMeta.id).map((e) => e.from_node_id);
        const outIds = edges.filter((e) => e.from_node_id === docMeta.id).map((e) => e.to_node_id);
        const allIds = [.../* @__PURE__ */ new Set([...inIds, ...outIds])];
        const nodesMap = await mobiusNodeRepo.getByIds(allIds);
        const outlinks = [];
        const backlinks = [];
        for (const node of nodesMap.values()) {
          if (isIndexedNoteNodeType(node.type) && node.label) {
            const p = getPathFromNode(node);
            if (p) {
              if (outIds.includes(node.id)) outlinks.push(p);
              if (inIds.includes(node.id)) backlinks.push(p);
            }
          }
        }
        out.set(path3, { outlinks, backlinks, tags: parseTags(docMeta.tags) });
      } catch {
        out.set(path3, empty);
      }
    })
  );
  return out;
}
async function getPairwiseSimilarityScores(paths) {
  const N = paths.length;
  const scoreCache = Array.from({ length: N }, () => new Array(N).fill(0));
  if (N === 0) return scoreCache;
  const pathToDocId = /* @__PURE__ */ new Map();
  const pathToTenant = /* @__PURE__ */ new Map();
  await Promise.all(
    paths.map(async (p) => {
      const tenant = getIndexTenantForPath(p);
      pathToTenant.set(p, tenant);
      try {
        const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
        const meta2 = await repo.getByPath(p);
        if (meta2?.id) pathToDocId.set(p, meta2.id);
      } catch {
      }
    })
  );
  const tenantToDocIds = /* @__PURE__ */ new Map();
  for (const [path3, docId] of pathToDocId) {
    const t = pathToTenant.get(path3);
    if (!tenantToDocIds.has(t)) tenantToDocIds.set(t, []);
    tenantToDocIds.get(t).push(docId);
  }
  const docIdToVec = /* @__PURE__ */ new Map();
  await Promise.all(
    [...tenantToDocIds.entries()].map(async ([tenant, docIds]) => {
      const embRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
      for (const id of docIds) {
        const vec = await embRepo.getEmbeddingForSemanticSearch(id);
        if (vec && vec.length) docIdToVec.set(id, vec);
      }
    })
  );
  const pathToVec = /* @__PURE__ */ new Map();
  for (const p of paths) {
    const docId = pathToDocId.get(p);
    if (docId) {
      const vec = docIdToVec.get(docId);
      if (vec) pathToVec.set(p, vec);
    }
  }
  for (let i = 0; i < N; i++) {
    const vi = pathToVec.get(paths[i]);
    if (!vi) continue;
    for (let j = i + 1; j < N; j++) {
      const vj = pathToVec.get(paths[j]);
      if (!vj) continue;
      const sim = cosineSimilarity2(vi, vj);
      const score = similaritySweetSpot(sim);
      scoreCache[i][j] = score;
      scoreCache[j][i] = score;
    }
  }
  return scoreCache;
}
function cosineSimilarity2(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let k = 0; k < a.length; k++) {
    dot += a[k] * b[k];
    na += a[k] * a[k];
    nb += b[k] * b[k];
  }
  const norm = Math.sqrt(na) * Math.sqrt(nb);
  return norm === 0 ? 0 : Math.max(0, Math.min(1, dot / norm));
}
function similaritySweetSpot(sim) {
  if (sim < 0.6) return 0;
  if (sim <= 0.85) return AFFINITY_SIMILARITY_PEAK * (sim - 0.6) / 0.25;
  return AFFINITY_SIMILARITY_PEAK * (1 - sim) / 0.15;
}
function parseTags(tagsJson) {
  const blob = decodeIndexedTagsBlob(tagsJson);
  const topicFlat = blob.topicTagEntries?.length ? blob.topicTagEntries.flatMap((e) => [e.id, ...e.label ? [e.label] : []]) : blob.topicTags;
  return [
    .../* @__PURE__ */ new Set([
      ...topicFlat,
      ...blob.functionalTagEntries.flatMap((e) => [e.id, ...e.label ? [e.label] : []]),
      ...blob.keywordTags,
      ...blob.timeTags,
      ...blob.geoTags,
      ...blob.personTags
    ])
  ];
}
function toAffinitySets(d) {
  return {
    outlinksSet: new Set(d.outlinks),
    backlinksSet: new Set(d.backlinks),
    tagsSet: new Set(d.tags)
  };
}
function buildAffinityMatrix(N, paths, pathToData, parentPathToFileCount, getSimilarity) {
  const parentPathFromPath2 = (p) => {
    const idx = p.replace(/\\/g, "/").lastIndexOf("/");
    return idx >= 0 ? p.slice(0, idx) : "";
  };
  const emptySets = { outlinksSet: /* @__PURE__ */ new Set(), backlinksSet: /* @__PURE__ */ new Set(), tagsSet: /* @__PURE__ */ new Set() };
  const pathToSets = /* @__PURE__ */ new Map();
  for (const [path3, d] of pathToData) {
    pathToSets.set(path3, toAffinitySets(d));
  }
  const A = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const pi = paths[i];
      const pj = paths[j];
      const di = pathToSets.get(pi) ?? emptySets;
      const dj = pathToSets.get(pj) ?? emptySets;
      let score = 0;
      const direct = di.outlinksSet.has(pj) || di.backlinksSet.has(pj) || dj.outlinksSet.has(pi) || dj.backlinksSet.has(pi);
      if (direct) score += AFFINITY_DIRECT_LINK;
      const parentI = parentPathFromPath2(pi);
      const parentJ = parentPathFromPath2(pj);
      if (parentI && parentI === parentJ) {
        const n = parentPathToFileCount.get(parentI) ?? 1;
        score += AFFINITY_SAME_PARENT_BASE * Math.max(0, Math.log10(PARENT_IDF_C / (n + 1)));
      }
      const cociteOut = di.outlinksSet.size <= dj.outlinksSet.size ? [...di.outlinksSet].some((x) => dj.outlinksSet.has(x)) : [...dj.outlinksSet].some((x) => di.outlinksSet.has(x));
      const cociteBack = di.backlinksSet.size <= dj.backlinksSet.size ? [...di.backlinksSet].some((x) => dj.backlinksSet.has(x)) : [...dj.backlinksSet].some((x) => di.backlinksSet.has(x));
      if (cociteOut || cociteBack) score += AFFINITY_COCITATION;
      const sharedTag = di.tagsSet.size <= dj.tagsSet.size ? [...di.tagsSet].some((t) => dj.tagsSet.has(t)) : [...dj.tagsSet].some((t) => di.tagsSet.has(t));
      if (sharedTag) score += AFFINITY_SHARED_TAGS;
      score += getSimilarity(i, j);
      if (parentI !== parentJ) score *= CROSS_DIR_DECAY;
      score = AFFINITY_SATURATION_SCALE * Math.tanh(score / AFFINITY_SATURATION_SCALE);
      A[i][j] = score;
      A[j][i] = score;
    }
  }
  return A;
}
function buildAdjacencyFromMatrix(N, A, minScore) {
  const edgesForEachMember = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i !== j && A[i][j] >= minScore) {
        edgesForEachMember[i].push({ to: j, weight: Math.round(A[i][j]) });
      }
    }
  }
  return edgesForEachMember;
}
function louvainFromAdjacency(N, edgesForEachMember, paths) {
  const k = edgesForEachMember.map((edges) => edges.reduce((s, e) => s + e.weight, 0));
  const twoM = k.reduce((a, b) => a + b, 0);
  if (twoM <= 0) {
    const out2 = /* @__PURE__ */ new Map();
    for (let i = 0; i < N; i++) out2.set(i, i);
    return out2;
  }
  const parentToComm = /* @__PURE__ */ new Map();
  let commId = 0;
  const community = paths.map((p) => {
    const parent = parentPathFromPath(p);
    if (!parentToComm.has(parent)) parentToComm.set(parent, commId++);
    return parentToComm.get(parent);
  });
  const commMembers = /* @__PURE__ */ new Map();
  const commSumTot = /* @__PURE__ */ new Map();
  const commSumIn = /* @__PURE__ */ new Map();
  for (let i = 0; i < N; i++) {
    const c = community[i];
    if (!commMembers.has(c)) commMembers.set(c, /* @__PURE__ */ new Set());
    commMembers.get(c).add(i);
  }
  for (const [c, members] of commMembers) {
    commSumTot.set(c, [...members].reduce((s, i) => s + k[i], 0));
    let sumIn = 0;
    for (const i of members) {
      for (const e of edgesForEachMember[i]) {
        if (members.has(e.to) && e.to > i) sumIn += e.weight;
      }
    }
    commSumIn.set(c, sumIn);
  }
  const twoMSq = twoM * twoM;
  const deltaQNumeratorThreshold = DELTA_Q_THRESHOLD * twoMSq;
  let iter = 0;
  while (iter < MAX_LOUVAIN_ITERATIONS) {
    iter++;
    let movedCount = 0;
    const order = Array.from({ length: N }, (_, i) => i);
    for (let t = order.length - 1; t > 0; t--) {
      const r = Math.floor(Math.random() * (t + 1));
      [order[t], order[r]] = [order[r], order[t]];
    }
    for (const i of order) {
      const D = community[i];
      const weightsToComms = /* @__PURE__ */ new Map();
      for (const e of edgesForEachMember[i]) {
        const commOfNeighbor = community[e.to];
        weightsToComms.set(commOfNeighbor, (weightsToComms.get(commOfNeighbor) ?? 0) + e.weight);
      }
      const kIInD = weightsToComms.get(D) ?? 0;
      let bestC = D;
      let bestNumerator = 0;
      let bestKIInC = 0;
      const sumTotD = commSumTot.get(D);
      for (const [C, kIInC] of weightsToComms) {
        if (C === D) continue;
        const sumTotC = commSumTot.get(C);
        const numerator = (kIInC - kIInD) * twoM - LOUVAIN_GAMMA * k[i] * (sumTotC - sumTotD);
        if (numerator > bestNumerator) {
          bestNumerator = numerator;
          bestC = C;
          bestKIInC = kIInC;
        }
      }
      if (bestNumerator > deltaQNumeratorThreshold && bestC !== D) {
        commMembers.get(D).delete(i);
        commMembers.get(bestC).add(i);
        commSumTot.set(D, commSumTot.get(D) - k[i]);
        commSumTot.set(bestC, commSumTot.get(bestC) + k[i]);
        commSumIn.set(D, commSumIn.get(D) - kIInD);
        commSumIn.set(bestC, commSumIn.get(bestC) + bestKIInC);
        community[i] = bestC;
        movedCount++;
      }
    }
    if (movedCount === 0 || movedCount / N < MIN_MOVE_RATIO) break;
  }
  const canon = /* @__PURE__ */ new Map();
  let id = 0;
  for (let i = 0; i < N; i++) {
    const c = community[i];
    if (!canon.has(c)) canon.set(c, id++);
  }
  const out = /* @__PURE__ */ new Map();
  for (let i = 0; i < N; i++) out.set(i, canon.get(community[i]));
  return out;
}
function capacityBalance(groups, maxCapacity, pathToIndex, A) {
  const result = [];
  for (const g of groups) {
    const totalLoad = g.reduce((s, t) => s + taskLoadScore(t), 0);
    if (totalLoad <= maxCapacity) {
      result.push(g);
      continue;
    }
    const { left, right } = splitGroupByPathAndAffinity(g, maxCapacity, pathToIndex, A);
    result.push(...capacityBalance([left, right], maxCapacity, pathToIndex, A));
  }
  return result;
}
function balancedGravitationalConsolidation(groups, maxGroups, maxCapacity, pathToIndex, A) {
  if (groups.length <= 1) return groups;
  const groupCount = groups.length;
  const groupAffinity = Array.from({ length: groupCount }, () => new Float64Array(groupCount));
  for (let i = 0; i < groupCount; i++) {
    for (let j = i + 1; j < groupCount; j++) {
      let sum = 0;
      for (const tA of groups[i]) {
        const idxA = pathToIndex.get(tA.path);
        if (idxA === void 0) continue;
        for (const tB of groups[j]) {
          const idxB = pathToIndex.get(tB.path);
          if (idxB !== void 0) sum += A[idxA][idxB];
        }
      }
      groupAffinity[i][j] = groupAffinity[j][i] = sum;
    }
  }
  let currentGroups = groups.map((g, i) => ({
    id: i,
    tasks: g,
    load: g.reduce((s, t) => s + taskLoadScore(t), 0)
  }));
  while (true) {
    const totalScore = currentGroups.reduce((s, g) => s + g.load, 0);
    const averageLoad = totalScore / maxGroups;
    const floor = averageLoad * 0.7;
    const gMin = currentGroups.reduce((a, b) => a.load <= b.load ? a : b);
    const mustMerge = currentGroups.length > maxGroups;
    const tooSmall = gMin.load < floor;
    if (!mustMerge && !tooSmall) break;
    if (currentGroups.length <= 1) break;
    const candidates = currentGroups.filter(
      (g) => g.id !== gMin.id && g.load + gMin.load <= maxCapacity
    );
    if (candidates.length === 0) break;
    const bestReceiver = candidates.reduce((best, c) => {
      const aff = groupAffinity[gMin.id][c.id];
      const bestAff = groupAffinity[gMin.id][best.id];
      if (aff > bestAff) return c;
      if (aff < bestAff) return best;
      return c.load < best.load ? c : best;
    });
    for (const other of currentGroups) {
      if (other.id !== bestReceiver.id && other.id !== gMin.id) {
        const updated = groupAffinity[bestReceiver.id][other.id] + groupAffinity[gMin.id][other.id];
        groupAffinity[bestReceiver.id][other.id] = groupAffinity[other.id][bestReceiver.id] = updated;
      }
    }
    bestReceiver.tasks = [...bestReceiver.tasks, ...gMin.tasks];
    bestReceiver.load += gMin.load;
    currentGroups = currentGroups.filter((g) => g.id !== gMin.id);
  }
  return currentGroups.map((g) => g.tasks);
}
function splitGroupByPathAndAffinity(g, maxCapacity, pathToIndex, A) {
  const sorted = [...g].sort((a, b) => a.path.localeCompare(b.path));
  const orderedPaths = [];
  for (const t of sorted) {
    if (orderedPaths[orderedPaths.length - 1] !== t.path) orderedPaths.push(t.path);
  }
  const n = orderedPaths.length;
  if (n <= 1) {
    const mid = Math.ceil(g.length / 2);
    return { left: g.slice(0, mid), right: g.slice(mid) };
  }
  const pathLoad = /* @__PURE__ */ new Map();
  for (const t of g) pathLoad.set(t.path, (pathLoad.get(t.path) ?? 0) + taskLoadScore(t));
  const load = orderedPaths.map((p) => pathLoad.get(p) ?? 0);
  let bestK = 1;
  let bestScore = Infinity;
  for (let k = 1; k < n; k++) {
    const leftLoad = load.slice(0, k).reduce((a, b) => a + b, 0);
    const rightLoad = load.slice(k).reduce((a, b) => a + b, 0);
    if (leftLoad > maxCapacity || rightLoad > maxCapacity) continue;
    let score;
    if (A && pathToIndex) {
      let cut = 0;
      for (let i = 0; i < k; i++) {
        const gi = pathToIndex.get(orderedPaths[i]);
        if (gi === void 0) continue;
        for (let j = k; j < n; j++) {
          const gj = pathToIndex.get(orderedPaths[j]);
          if (gj !== void 0) cut += A[gi][gj];
        }
      }
      score = cut;
    } else {
      score = Math.abs(leftLoad - rightLoad);
    }
    if (score < bestScore) {
      bestScore = score;
      bestK = k;
    }
  }
  const leftPaths = new Set(orderedPaths.slice(0, bestK));
  const rightPaths = new Set(orderedPaths.slice(bestK));
  const left = g.filter((t) => leftPaths.has(t.path));
  const right = g.filter((t) => rightPaths.has(t.path));
  return { left, right };
}

// src/service/agents/search-agent-helper/GroupContextAgent.ts
var import_ai5 = require("ai");
var GroupContextAgent = class {
  constructor(aiServiceManager, context) {
    this.aiServiceManager = aiServiceManager;
    this.context = context;
  }
  /**
   * Run one stream per group in parallel; assemble EvidenceGroup[] and call onRefinementFinish when all done.
   */
  async *streamAllGroupsContext(options) {
    const { groups, dimensions, stepId, onRefinementFinish } = options;
    if (groups.length === 0) {
      onRefinementFinish?.([]);
      return;
    }
    const results = new Array(groups.length);
    for (let i = 0; i < groups.length; i++) results[i] = null;
    console.debug("[streamAllGroupsContext] groups:", groups);
    const groupStreams = groups.map(
      (g, i) => this.streamGroupContext({
        groupIndex: i,
        tasks: g,
        dimensions,
        stepId: stepId ?? generateUuidWithoutHyphens(),
        onFinish: (item) => {
          results[i] = item;
        }
      })
    );
    yield* parallelStream(groupStreams);
    const evidenceTaskGroups = groups.map((tasks, i) => ({
      groupId: `group_${String(i).padStart(3, "0")}`,
      topic_anchor: results[i]?.topic_anchor ?? "",
      group_focus: results[i]?.group_focus ?? "",
      tasks,
      sharedContext: void 0,
      clustering_reason: "Vector similarity & graph co-citation"
    }));
    onRefinementFinish?.(evidenceTaskGroups);
  }
  /**
   * One group → one LLM call (streamObject) → topic_anchor + group_focus. Used as one branch in parallelStream.
   */
  async *streamGroupContext(options) {
    const { groupIndex, tasks, dimensions, onFinish } = options;
    if (tasks.length === 0) {
      onFinish?.({ topic_anchor: "", group_focus: "" });
      return;
    }
    const runStepId = options.stepId ?? generateUuidWithoutHyphens();
    const laneId = `group_${String(groupIndex).padStart(3, "0")}`;
    const meta2 = { runStepId, stage: "groupContext", lane: { laneType: "group", laneId, index: groupIndex }, agent: "GroupContextAgent" };
    const stepId = makeStepId(meta2);
    yield uiStepStart(meta2, {
      title: `Group context: ${laneId}`,
      description: `${tasks.length} file(s)`,
      triggerName: "search-raw-agent-task-consolidator" /* SEARCH_RAW_AGENT_TASK_CONSOLIDATOR */
    });
    console.debug("[streamGroupContext] tasks:", tasks);
    const files = tasks.map((t) => ({
      path: t.path,
      extraction_focus: t.extraction_focus,
      priority: t.priority,
      task_load: t.task_load,
      relevant_dimension_ids: t.relevant_dimension_ids.map((d) => ({ id: d.id, intent: d.intent }))
    }));
    const userQuery = this.context.getInitialPrompt();
    const system = await this.aiServiceManager.renderPrompt("ai-analysis-group-context-system" /* AiAnalysisGroupContextSystem */, {});
    const prompt = await this.aiServiceManager.renderPrompt("ai-analysis-group-context-single" /* AiAnalysisGroupContextSingle */, {
      userQuery,
      dimensions,
      groupIndex,
      files
    });
    const providerOptionsConfig = {
      noReasoning: false,
      reasoningEffort: "low"
    };
    const { provider, modelId } = this.aiServiceManager.getModelForPrompt("ai-analysis-group-context-single" /* AiAnalysisGroupContextSingle */);
    const model = this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId, providerOptionsConfig);
    const providerOptions = this.aiServiceManager.getMultiChat().getProviderService(provider).getProviderOptions(providerOptionsConfig);
    const result = (0, import_ai5.streamText)({
      model,
      system,
      prompt,
      providerOptions,
      experimental_output: import_ai5.Output.object({
        schema: groupContextItemSchema
      })
    });
    yield buildPromptTraceDebugEvent("search-raw-agent-task-consolidator" /* SEARCH_RAW_AGENT_TASK_CONSOLIDATOR */, system, prompt);
    yield* streamTransform(result.fullStream, "search-raw-agent-task-consolidator" /* SEARCH_RAW_AGENT_TASK_CONSOLIDATOR */, {
      yieldUIStep: { uiType: "steps-display" /* STEPS_DISPLAY */, stepId }
    });
    const text = await result.text;
    const parsed = groupContextItemSchema.safeParse(JSON.parse(text));
    if (parsed.success) {
      onFinish?.(parsed.data);
    } else {
      onFinish?.({ topic_anchor: "", group_focus: "" });
    }
  }
};

// src/app/context/test-tools.ts
var GraphInspectorTestTools = class {
  constructor() {
    this.tools = {
      inspect_note_context: inspectNoteContextTool(),
      graph_traversal: graphTraversalTool(),
      hub_local_graph: hubLocalGraphTool(),
      find_path: findPathTool(),
      find_key_nodes: findKeyNodesTool(),
      find_orphans: findOrphansTool(),
      search_by_dimensions: searchByDimensionsTool(),
      explore_folder: exploreFolderTool(),
      recent_changes_whole_vault: recentChangesWholeVaultTool(),
      local_search_whole_vault: localSearchWholeVaultTool()
    };
  }
  /**
   * Execute a specific tool
   */
  async executeTool(name, params) {
    try {
      console.log(`\u{1F50D} Executing ${name} with params:`, params);
      if (!this.tools[name]) {
        throw new Error(`Tool ${name} not found`);
      }
      const result = await this.tools[name].execute(params);
      console.log("\u2705 Tool execution result:", JSON.stringify(result));
      return result;
    } catch (error) {
      console.error("\u274C Tool execution failed:", error);
      throw error;
    }
  }
  // Convenience methods for each tool
  async inspectNote(notePath, includeSemantic = false, limit = 10, responseFormat = "hybrid") {
    return this.executeTool("inspect_note_context", {
      note_path: notePath,
      limit,
      include_semantic_paths: includeSemantic,
      response_format: responseFormat
    });
  }
  async graphTraversal(startPath, hops = 1, limit = 20, responseFormat = "hybrid", includeSemantic = false, filters = void 0, sorter = void 0) {
    return this.executeTool("graph_traversal", {
      start_note_path: startPath,
      hops,
      limit,
      response_format: responseFormat,
      include_semantic_paths: includeSemantic,
      filters,
      sorter
    });
  }
  async findPath(startPath, endPath, responseFormat = "hybrid", limit = 10, includeSemantic = false) {
    return this.executeTool("find_path", {
      start_note_path: startPath,
      end_note_path: endPath,
      response_format: responseFormat,
      limit,
      include_semantic_paths: includeSemantic
    });
  }
  async findKeyNodes(limit = 20, responseFormat = "hybrid") {
    return this.executeTool("find_key_nodes", {
      limit,
      response_format: responseFormat
    });
  }
  async findOrphans(limit = 20, responseFormat = "hybrid") {
    return this.executeTool("find_orphans", {
      limit,
      response_format: responseFormat
    });
  }
  async searchByDimensions(expression, limit = 20, responseFormat = "hybrid") {
    return this.executeTool("search_by_dimensions", {
      boolean_expression: expression,
      limit,
      response_format: responseFormat
    });
  }
  async exploreFolder(folderPath = "/", recursive = true, maxDepth = 2, responseFormat = "hybrid") {
    return this.executeTool("explore_folder", {
      folderPath,
      recursive,
      max_depth: maxDepth,
      response_format: responseFormat
    });
  }
  async getRecentChanges(limit = 20, responseFormat = "hybrid") {
    return this.executeTool("recent_changes_whole_vault", {
      limit,
      response_format: responseFormat
    });
  }
  async localSearch(query, searchMode = "hybrid", limit = 20, responseFormat = "hybrid") {
    return this.executeTool("local_search_whole_vault", {
      query,
      searchMode,
      limit,
      response_format: responseFormat
      // Pass flattened params if needed, or let them be undefined
    });
  }
  // Utility methods
  async getAppInfo() {
    const app = AppContext.getInstance().app;
    return {
      vaultName: app.vault.getName(),
      vaultPath: app.vault.getRoot(),
      fileCount: app.vault.getFiles().length,
      plugin: AppContext.getInstance().plugin
    };
  }
  async listAllFiles(limit = 100) {
    const app = AppContext.getInstance().app;
    const files = app.vault.getFiles();
    return files.slice(0, limit).map((f) => ({
      path: f.path,
      name: f.name,
      size: f.stat.size,
      mtime: new Date(f.stat.mtime).toISOString()
    }));
  }
};
async function* streamWithStreamLog(stream) {
  const allLog = [];
  let totalTokenUsage = emptyUsage();
  try {
    for await (const ev of stream) {
      if (!DELTA_EVENT_TYPES.has(ev.type)) {
        allLog.push(ev);
      }
      console.debug("[stream-event]", ev.type, JSON.stringify(ev));
      if (ev.type === "on-step-finish") {
        totalTokenUsage = mergeTokenUsage(totalTokenUsage, ev.usage);
      }
      yield ev;
    }
  } finally {
    allLog.push({ type: "total-token-usage", totalTokenUsage });
    console.debug("[stream-all-log]", JSON.stringify(allLog));
  }
}
var AISearchAgentTestTools = class {
  /**
   * Run streamReconForPhysicalTask once for a single physical task.
   * Usage: pass a PhysicalSearchTask (e.g. from pk-debug physicalTaskResults, or build one). Optionally pass userQuery to set context; defaults to a short placeholder.
   * Returns { result, duration, eventCount }.
   */
  async testStreamReconForPhysicalTask(physicalTask, userQuery = "List relevant notes for the given dimensions.") {
    const start = Date.now();
    const ctx = AppContext.getInstance();
    const context = new AgentContextManager(ctx.manager);
    context.resetAgentMemory(userQuery);
    const agent = new ReconAgent(ctx.manager, context);
    let result = null;
    let eventCount = 0;
    for await (const _ev of streamWithStreamLog(
      agent.streamReconForPhysicalTask(physicalTask, generateUuidWithoutHyphens(), (r) => {
        result = r;
      })
    )) {
      eventCount++;
    }
    const duration = Date.now() - start;
    console.debug("[testStreamReconForPhysicalTask] result:", result, "duration:", duration, "eventCount:", eventCount);
    return { result, duration, eventCount };
  }
  /** Run SlotRecallAgent once with a user query; returns event count and slot coverage from context. */
  async testSlotRecall(userQuery, skipStreamSearchArchitect = false, skipSearch = true) {
    const start = Date.now();
    const ctx = AppContext.getInstance();
    const context = new AgentContextManager(ctx.manager);
    context.resetAgentMemory(userQuery);
    const agent = new SlotRecallAgent(ctx.manager, context);
    let eventCount = 0;
    for await (const _ev of streamWithStreamLog(agent.stream({ skipStreamSearchArchitect, skipSearch }))) {
      eventCount++;
    }
    const end = Date.now();
    const duration = end - start;
    return {
      debugSnapshot: context.getDebugSnapshot(),
      duration
    };
  }
  /**
   * Test gravity-merge grouping with saved consolidator data (no full search run).
   * Available as window.testGroupingTools when enableDevTools.
   * Usage: paste consolidated_tasks from pk-debug "parallelSearchResultAfterTaskConsolidator", add taskId, then:
   *   await window.testGroupingTools.testGrouping(tasksWithIds, { maxEvidenceConcurrency: 12 })
   * Run gravity grouping on tasks (with optional graph affinity when DB is ready).
   * Returns { groups, groupCount, totalTasks, opts } and logs to console.
   */
  async testGroupConsolidatedTasksGravity(tasks, opts = {}) {
    const withIds = tasks.map(
      (t, i) => "taskId" in t && t.taskId ? t : { ...t, taskId: `task-${i}` }
    );
    const groups = await groupConsolidatedTasksGravity(withIds, opts);
    const totalScore = withIds.reduce((s, t) => s + taskLoadScore(t), 0);
    console.debug("[testGrouping] input tasks:", withIds.length, "totalScore:", totalScore, "opts:", opts);
    console.debug("[testGrouping] output groups:", groups);
    console.debug("[testGrouping] output groups stats:", groups.length, groups.map((g, i) => ({
      groupIndex: i,
      taskCount: g.length,
      score: g.reduce((s, t) => s + taskLoadScore(t), 0),
      paths: g.map((t) => t.path)
    })));
    return {
      groups,
      groupCount: groups.length,
      totalTasks: withIds.length,
      opts
    };
  }
  async testGroupContextAgent(testData) {
    const ctx = AppContext.getInstance();
    const context = new AgentContextManager(ctx.manager);
    const groupContextAgent = new GroupContextAgent(ctx.manager, context);
    let evidenceGroups = [];
    let eventCount = 0;
    for await (const _ev of streamWithStreamLog(
      groupContextAgent.streamAllGroupsContext({
        groups: testData.groups,
        dimensions: testData.dimensions,
        stepId: generateUuidWithoutHyphens(),
        onRefinementFinish: (eg) => {
          evidenceGroups = eg;
        }
      })
    )) {
      eventCount++;
    }
    console.debug("[testGroupContextAgent] evidenceGroups:", evidenceGroups);
    return {
      eventCount,
      evidenceGroups
    };
  }
  async testGroupContextAgentWithSharedContext(testData) {
    const { groups } = testData;
    const ctx = AppContext.getInstance();
    const tm = ctx.manager.getTemplateManager?.();
    const sharedContexts = await Promise.all(
      groups.map((tasks) => weavePathsToContext(tasks.map((t) => t.path), tm))
    );
    return {
      sharedContexts
    };
  }
};

// src/app/context/graph-cleanup.ts
var import_kysely4 = require("kysely");
async function cleanupGraphTable() {
  const kdb = sqliteStoreManager.getSearchContext();
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const pathMap = await indexedDocumentRepo.getAllIndexedPaths();
  const paths = Array.from(pathMap.keys());
  const idRows = paths.length > 0 ? await indexedDocumentRepo.getIdsByPaths(paths) : [];
  const validDocIds = new Set(idRows.map((r) => r.id));
  const allNodeIdsToCheck = [];
  for (const t of GRAPH_DOCUMENT_LIKE_NODE_TYPES) {
    const nodes = await mobiusNodeRepo.getByType(t);
    allNodeIdsToCheck.push(...nodes.map((n) => n.id));
  }
  const nodeIdsWithoutIndexedDocument = [...new Set(allNodeIdsToCheck)].filter((id) => !validDocIds.has(id));
  let orphanEdgesDeleted = 0;
  await kdb.transaction().execute(async (trx) => {
    const orphanEdgeRows = await trx.selectFrom("mobius_edge").select("id").where(
      import_kysely4.sql`from_node_id NOT IN (SELECT node_id FROM mobius_node) OR to_node_id NOT IN (SELECT node_id FROM mobius_node)`
    ).execute();
    const orphanEdgeIds = orphanEdgeRows.map((r) => r.id);
    if (orphanEdgeIds.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < orphanEdgeIds.length; i += chunkSize) {
        const chunk2 = orphanEdgeIds.slice(i, i + chunkSize);
        await trx.deleteFrom("mobius_edge").where("id", "in", chunk2).execute();
      }
      orphanEdgesDeleted = orphanEdgeIds.length;
    }
    if (nodeIdsWithoutIndexedDocument.length > 0) {
      await trx.deleteFrom("mobius_edge").where(
        (eb) => eb.or([
          eb("from_node_id", "in", nodeIdsWithoutIndexedDocument),
          eb("to_node_id", "in", nodeIdsWithoutIndexedDocument)
        ])
      ).execute();
      await trx.deleteFrom("mobius_node").where("node_id", "in", nodeIdsWithoutIndexedDocument).execute();
    }
  });
  return {
    orphanEdgesDeleted,
    nodesWithoutIndexedDocumentDeleted: nodeIdsWithoutIndexedDocument.length
  };
}

// src/app/context/AppContext.ts
var AppContext = class _AppContext {
  constructor(app, manager, searchClient, plugin, settings, aiAnalysisHistoryService, searchAgentFactory, isMockEnv = false) {
    this.app = app;
    this.manager = manager;
    this.searchClient = searchClient;
    this.plugin = plugin;
    this.settings = settings;
    this.aiAnalysisHistoryService = aiAnalysisHistoryService;
    this.searchAgentFactory = searchAgentFactory;
    this.isMockEnv = isMockEnv;
    this.viewManager = null;
    _AppContext.instance = this;
    this.handleDevToolsSettingChange(this.settings.enableDevTools ?? false);
    this.unsubscribeSettingsUpdated = EventBus.getInstance(app).on("peak:settings-updated" /* SETTINGS_UPDATED */, (event) => {
      const previousEnableDevTools = this.settings.enableDevTools ?? false;
      this.settings = this.plugin.settings;
      const currentEnableDevTools = this.settings.enableDevTools ?? false;
      if (previousEnableDevTools !== currentEnableDevTools) {
        this.handleDevToolsSettingChange(currentEnableDevTools);
      }
    });
  }
  static {
    this.instance = null;
  }
  static getInstance() {
    if (!_AppContext.instance) {
      throw new BusinessError(
        "CONFIGURATION_MISSING" /* CONFIGURATION_MISSING */,
        "AppContext is not initialized"
      );
    }
    return _AppContext.instance;
  }
  /** Obsidian `App` from the initialized singleton. */
  static getApp() {
    return _AppContext.getInstance().app;
  }
  /**
   * Clear singleton and unsubscribe from workspace events.
   * Must be called from plugin onunload to break reference chains and allow GC.
   */
  static clearForUnload() {
    if (_AppContext.instance) {
      _AppContext.instance.unsubscribeSettingsUpdated?.();
      _AppContext.instance.handleDevToolsSettingChange(false);
      _AppContext.instance = null;
    }
  }
  static searchAgent(options) {
    return _AppContext.getInstance().searchAgentFactory(_AppContext.getInstance().manager, options);
  }
  /**
   * Handle dynamic changes to enableDevTools setting
   */
  handleDevToolsSettingChange(enabled) {
    if (enabled) {
      if (typeof window !== "undefined") {
        window.testGraphTools = new GraphInspectorTestTools();
        window.testAISearchTools = new AISearchAgentTestTools();
        window.indexDocument = (docPath) => IndexService.getInstance().indexDocument(docPath, this.settings.search);
        window.getVaultPersona = () => getVaultPersona();
        window.cleanupGraphTable = () => cleanupGraphTable();
        console.debug("\u{1F527} Graph Inspector Test Tools initialized!");
        console.debug('\u{1F4D6} Usage: window.testGraphTools.inspectNote("path/to/note.md")');
        console.debug('\u{1F4D6} Usage: await window.testAISearchTools.testSlotRecall("your question")');
        console.debug('\u{1F4D6} Usage: window.indexDocument("path/to/note.md")');
        console.debug("\u{1F4D6} Usage: await window.cleanupGraphTable() \u2014 clean mobius_node/edge orphans and doc nodes missing from index");
        console.debug("\u{1F4D6} Available methods:", [
          ...Object.getOwnPropertyNames(GraphInspectorTestTools.prototype).filter((name) => name !== "constructor"),
          "testAISearchTools.testSlotRecall",
          "indexDocument",
          "cleanupGraphTable"
        ]);
      }
    } else {
      if (typeof window !== "undefined") {
        if (window.testGraphTools) delete window.testGraphTools;
        if (window.testAISearchTools) delete window.testAISearchTools;
        if (window.indexDocument) delete window.indexDocument;
        if (window.cleanupGraphTable) delete window.cleanupGraphTable;
        console.log("\u{1F527} Graph Inspector Test Tools disabled");
      }
    }
  }
};

// src/core/utils/bit-util.ts
function uint32BitsetWordCount(bitLength) {
  return Math.ceil(Math.max(0, bitLength) / 32);
}
function createUint32Bitset(bitLength) {
  return new Uint32Array(uint32BitsetWordCount(bitLength));
}
function setUint32Bit(bits, bitIndex) {
  const wi = bitIndex >>> 5;
  const mask = 1 << (bitIndex & 31);
  bits[wi] |= mask;
}
function hasUint32Bit(bits, bitIndex) {
  const wi = bitIndex >>> 5;
  const mask = 1 << (bitIndex & 31);
  return ((bits[wi] ?? 0) & mask) !== 0;
}
function popcountUint32(x) {
  x >>>= 0;
  x -= x >>> 1 & 1431655765;
  x = (x & 858993459) + (x >>> 2 & 858993459);
  return (x + (x >>> 4) & 252645135) * 16843009 >>> 24;
}
function countBitsUint32(bits) {
  let t = 0;
  for (let i = 0; i < bits.length; i++) t += popcountUint32(bits[i] ?? 0);
  return t;
}
function fractionOfBitsNewSince(candidate, covered) {
  let candidateCount = 0;
  let newCount = 0;
  const n = Math.min(candidate.length, covered.length);
  for (let i = 0; i < n; i++) {
    const c = candidate[i] ?? 0;
    const cov = covered[i] ?? 0;
    candidateCount += popcountUint32(c);
    newCount += popcountUint32(c & ~cov);
  }
  return newCount / Math.max(1, candidateCount);
}
function overlapRatioMinUint32(a, b) {
  let inter = 0;
  let ca = 0;
  let cb = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    inter += popcountUint32(va & vb);
    ca += popcountUint32(va);
    cb += popcountUint32(vb);
  }
  if (inter === 0) return 0;
  const den = Math.min(ca, cb);
  return den > 0 ? inter / den : 0;
}

// src/service/search/index/helper/hub/hubDiscover.ts
var VALID_MANUAL_HUB_ROLES = /* @__PURE__ */ new Set([
  "authority",
  "index",
  "bridge",
  "cluster_center",
  "folder_anchor",
  "manual"
]);
function normalizeManualHubSourcePathsList(raw) {
  const toNorm = (s) => normalizeVaultPath(s.trim());
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x) => typeof x === "string" && x.trim().length > 0).map((x) => toNorm(x)).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split(/\r?\n/).flatMap((line) => line.split(",")).map((s) => s.trim()).filter(Boolean).map(toNorm).filter(Boolean);
  }
  return [];
}
function parseManualHubFrontmatterEnhancements(markdown) {
  const parsed = parseFrontmatter(markdown);
  if (!parsed) return {};
  const d = parsed.data;
  let hubRole;
  const r = d[MANUAL_HUB_FRONTMATTER_KEYS.hubRole];
  if (typeof r === "string" && VALID_MANUAL_HUB_ROLES.has(r.trim())) {
    hubRole = r.trim();
  }
  const pathsRaw = d[MANUAL_HUB_FRONTMATTER_KEYS.hubSourcePaths];
  const hubSourcePaths = normalizeManualHubSourcePathsList(pathsRaw);
  const out = {};
  if (hubRole) out.hubRole = hubRole;
  if (hubSourcePaths.length) out.hubSourcePaths = hubSourcePaths;
  return out;
}
function computeHubDiscoverBudgets(documentNodeCount) {
  const n = Math.max(0, Math.floor(documentNodeCount));
  const raw = Math.floor(Math.sqrt(n) * HUB_DISCOVER_LIMIT_SQRT_SCALE);
  const limitTotal = Math.max(HUB_DISCOVER_LIMIT_MIN, Math.min(HUB_DISCOVER_LIMIT_MAX, raw));
  const documentFetchLimit = Math.max(1, Math.ceil(limitTotal * 1.8));
  const folderFetchLimit = Math.max(1, Math.ceil(limitTotal * 0.6));
  const clusterLimit = Math.max(1, Math.ceil(limitTotal * 0.35));
  const topDocExcludeLimit = Math.max(1, Math.ceil(limitTotal * 0.4));
  const clusterSeedFetchLimit = Math.min(120, Math.max(20, topDocExcludeLimit + clusterLimit * 3));
  return {
    limitTotal,
    documentFetchLimit,
    folderFetchLimit,
    clusterLimit,
    topDocExcludeLimit,
    clusterSeedFetchLimit
  };
}
function marginalCoverageGain(candidateCov, covered) {
  let newCount = 0;
  for (const id of candidateCov) {
    if (!covered.has(id)) newCount++;
  }
  return newCount / Math.max(1, candidateCov.size);
}
function computeHubRankingScore(graphScore, sourceConsensusScore) {
  return Math.min(1, graphScore + sourceConsensusScore);
}
function singleSourceHubProvenance(kind, graphScore) {
  const sourceConsensusScore = 0;
  return {
    sourceKind: kind,
    sourceKinds: [kind],
    sourceEvidence: [{ kind, graphScore }],
    sourceConsensusScore,
    rankingScore: computeHubRankingScore(graphScore, sourceConsensusScore)
  };
}
function mergeHubAssemblyHintsGroup(group) {
  const list = group.map((g) => g.assemblyHints).filter((h) => !!h);
  if (list.length === 0) return void 0;
  let acc = list[0];
  for (let i = 1; i < list.length; i++) {
    const b = list[i];
    acc = {
      anchorTopicTags: [.../* @__PURE__ */ new Set([...acc.anchorTopicTags, ...b.anchorTopicTags])],
      anchorFunctionalTagIds: [.../* @__PURE__ */ new Set([...acc.anchorFunctionalTagIds, ...b.anchorFunctionalTagIds])],
      anchorKeywords: [.../* @__PURE__ */ new Set([...acc.anchorKeywords, ...b.anchorKeywords])],
      preferredChildHubNodeIds: [.../* @__PURE__ */ new Set([...acc.preferredChildHubNodeIds, ...b.preferredChildHubNodeIds])],
      stopAtChildHub: acc.stopAtChildHub || b.stopAtChildHub,
      expectedTopology: acc.expectedTopology,
      deprioritizedBridgeNodeIds: [
        .../* @__PURE__ */ new Set([...acc.deprioritizedBridgeNodeIds ?? [], ...b.deprioritizedBridgeNodeIds ?? []])
      ],
      rationale: [acc.rationale, b.rationale].filter(Boolean).join(" | ") || void 0
    };
  }
  const winner = [...group].sort((a, b) => SOURCE_PRIORITY[b.sourceKind] - SOURCE_PRIORITY[a.sourceKind])[0];
  const topo = winner.assemblyHints?.expectedTopology;
  return topo ? { ...acc, expectedTopology: topo } : acc;
}
function buildDeterministicAssemblyHintsForCandidate(candidate, allSelected, hubDocumentNodeIds, tagsByNodeId, clusterPathToId) {
  const topicTags = /* @__PURE__ */ new Set();
  const functionalIds = /* @__PURE__ */ new Set();
  const keywords = /* @__PURE__ */ new Set();
  const mergeBlob = (raw) => {
    const blob = decodeIndexedTagsBlob(raw);
    for (const t of blob.topicTags) topicTags.add(t);
    for (const e of blob.functionalTagEntries) functionalIds.add(e.id);
    for (const k of graphKeywordTagsForMobius(blob)) keywords.add(k);
    for (const k of blob.textrankKeywordTerms ?? []) keywords.add(k);
  };
  if (candidate.sourceKind === "cluster") {
    for (const p of (candidate.clusterMemberPaths ?? []).slice(0, 8)) {
      const id = clusterPathToId.get(p);
      if (id) mergeBlob(tagsByNodeId.get(id) ?? null);
    }
  } else {
    mergeBlob(tagsByNodeId.get(candidate.nodeId) ?? null);
  }
  const centerFolder = folderPrefixOfPath(candidate.path);
  const pref = centerFolder ? centerFolder.endsWith("/") ? centerFolder : `${centerFolder}/` : "";
  const preferredChildHubNodeIds = [];
  if (pref) {
    for (const h of allSelected) {
      if (h.nodeId === candidate.nodeId) continue;
      if (!hubDocumentNodeIds.has(h.nodeId)) continue;
      const p = h.path;
      if (!p || p === candidate.path) continue;
      if (p.startsWith(pref)) preferredChildHubNodeIds.push(h.nodeId);
    }
  }
  const preferred = [...new Set(preferredChildHubNodeIds)].slice(0, 48);
  const expectedTopology = candidate.sourceKind === "folder" ? "hierarchical" : candidate.sourceKind === "cluster" ? "clustered" : preferred.length > 0 ? "hierarchical" : "mixed";
  return {
    anchorTopicTags: [...topicTags].slice(0, 48),
    anchorFunctionalTagIds: [...functionalIds].slice(0, 24),
    anchorKeywords: [...keywords].slice(0, 48),
    preferredChildHubNodeIds: preferred,
    stopAtChildHub: true,
    expectedTopology,
    rationale: `deterministic:${candidate.sourceKind}`
  };
}
async function attachDeterministicAssemblyHints(tenant, candidates) {
  const repo = sqliteStoreManager.getMobiusNodeRepo(tenant);
  const hubDocumentNodeIds = new Set(
    candidates.filter((c) => c.sourceKind === "document" || c.sourceKind === "manual").map((c) => c.nodeId)
  );
  const idsToLoad = /* @__PURE__ */ new Set();
  for (const c of candidates) {
    if (c.sourceKind !== "cluster") {
      idsToLoad.add(c.nodeId);
    }
  }
  const clusterPaths = [];
  for (const c of candidates) {
    if (c.sourceKind === "cluster") {
      for (const p of (c.clusterMemberPaths ?? []).slice(0, 8)) {
        clusterPaths.push(p);
      }
    }
  }
  const clusterPathToId = /* @__PURE__ */ new Map();
  const uniqueClusterPaths = [...new Set(clusterPaths)];
  if (uniqueClusterPaths.length > 0) {
    const pathRows = await repo.listHubOrDocumentNodeIdsByVaultPaths(uniqueClusterPaths);
    for (const r of pathRows) {
      clusterPathToId.set(r.path, r.node_id);
    }
  }
  for (const id of clusterPathToId.values()) {
    idsToLoad.add(id);
  }
  const tagsByNodeId = /* @__PURE__ */ new Map();
  if (idsToLoad.size > 0) {
    const rows = await repo.listHubLocalGraphNodeMeta([...idsToLoad]);
    for (const r of rows) {
      tagsByNodeId.set(r.node_id, r.tags_json ?? null);
    }
  }
  return candidates.map((c) => ({
    ...c,
    assemblyHints: buildDeterministicAssemblyHintsForCandidate(
      c,
      candidates,
      hubDocumentNodeIds,
      tagsByNodeId,
      clusterPathToId
    )
  }));
}
function mergeCandidatesByPriority(ordered) {
  const byKey = /* @__PURE__ */ new Map();
  for (const c of ordered) {
    let g = byKey.get(c.stableKey);
    if (!g) {
      g = [];
      byKey.set(c.stableKey, g);
    }
    g.push(c);
  }
  const out = [];
  for (const group of byKey.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    let base = group[0];
    for (let i = 1; i < group.length; i++) {
      const c = group[i];
      if (SOURCE_PRIORITY[c.sourceKind] > SOURCE_PRIORITY[base.sourceKind]) base = c;
    }
    const kindsAcc = [];
    const evByKind = /* @__PURE__ */ new Map();
    for (const g of group) {
      kindsAcc.push(...g.sourceKinds);
      for (const ev of g.sourceEvidence) {
        const prev = evByKind.get(ev.kind);
        if (!prev) {
          evByKind.set(ev.kind, ev);
          continue;
        }
        const ps = prev.graphScore;
        const s = ev.graphScore;
        if (typeof s === "number" && (typeof ps !== "number" || s > ps)) evByKind.set(ev.kind, ev);
      }
    }
    const sourceKinds = [...new Set(kindsAcc)].sort((a, b) => SOURCE_PRIORITY[b] - SOURCE_PRIORITY[a]);
    const nUnique = sourceKinds.length;
    const sourceConsensusScore = Math.min(
      HUB_SOURCE_CONSENSUS_MAX,
      Math.max(0, (nUnique - 1) * HUB_SOURCE_CONSENSUS_PER_EXTRA)
    );
    const sourceEvidence = [...evByKind.values()].sort((x, y) => SOURCE_PRIORITY[y.kind] - SOURCE_PRIORITY[x.kind]);
    const mergedHints = mergeHubAssemblyHintsGroup(group);
    out.push({
      ...base,
      sourceKinds,
      sourceEvidence,
      sourceConsensusScore,
      sourceKind: sourceKinds[0],
      rankingScore: computeHubRankingScore(base.graphScore, sourceConsensusScore),
      ...mergedHints ? { assemblyHints: mergedHints } : {}
    });
  }
  return out.sort((a, b) => b.rankingScore - a.rankingScore);
}
function pathPrefixForGap(path3) {
  const parts = path3.split("/").filter(Boolean);
  if (parts.length === 0) return "(root)";
  if (parts.length === 1) return parts[0];
  return `${parts[0]}/${parts[1]}`;
}
async function buildHubDiscoverDocCoverageIndex(tenant) {
  const rows = await sqliteStoreManager.getMobiusNodeRepo(tenant).listDocumentNodeIdPathForCoverageIndex();
  const ordinalByNodeId = /* @__PURE__ */ new Map();
  const nodeIdByOrdinal = [];
  const pathByOrdinal = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    ordinalByNodeId.set(r.node_id, i);
    nodeIdByOrdinal.push(r.node_id);
    pathByOrdinal.push(r.path);
  }
  return { docCount: rows.length, ordinalByNodeId, nodeIdByOrdinal, pathByOrdinal };
}
function mergeCoverageBitsIntoUnion(candidateBits, coveredBits, coveredDocumentCount, coveredPrefixCounts, pathByOrdinal) {
  const docWords = coveredBits.length;
  for (let wi = 0; wi < docWords; wi++) {
    const cand = candidateBits[wi] ?? 0;
    const prev = coveredBits[wi] ?? 0;
    const newMask = cand & ~prev;
    if (newMask === 0) continue;
    coveredBits[wi] = prev | cand;
    for (let bitIdx = 0; bitIdx < 32; bitIdx++) {
      if ((newMask & 1 << bitIdx) === 0) continue;
      const globalOrd = wi * 32 + bitIdx;
      if (globalOrd >= pathByOrdinal.length) continue;
      coveredDocumentCount.value += 1;
      const p = pathByOrdinal[globalOrd] ?? "";
      if (p) {
        const prefix = pathPrefixForGap(p);
        coveredPrefixCounts.set(prefix, (coveredPrefixCounts.get(prefix) ?? 0) + 1);
      }
    }
  }
}
async function estimateCandidateCoverageBits(tenant, c, index) {
  const bits = createUint32Bitset(index.docCount);
  const hubSummaryFolder = getAIHubSummaryFolder();
  const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
  const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
  const setOrd = (nodeId) => {
    const o = index.ordinalByNodeId.get(nodeId);
    if (o !== void 0) setUint32Bit(bits, o);
  };
  if (c.sourceKind === "manual" && (c.clusterMemberPaths?.length ?? 0) > 0) {
    const paths = c.clusterMemberPaths ?? [];
    for (const p of paths.slice(0, SLICE_CAPS.hub.discoverRoundPaths)) {
      const id = await nodeRepo.getDocumentNodeIdByVaultPath(p);
      if (id) setOrd(id);
    }
    setOrd(c.nodeId);
    return bits;
  }
  if (c.sourceKind === "cluster") {
    const paths = c.clusterMemberPaths ?? [];
    if (paths.length === 0) {
      setOrd(c.nodeId);
      return bits;
    }
    for (const p of paths.slice(0, SLICE_CAPS.hub.discoverRoundPaths)) {
      const id = await nodeRepo.getDocumentNodeIdByVaultPath(p);
      if (id) setOrd(id);
    }
    setOrd(c.nodeId);
    return bits;
  }
  if (c.sourceKind === "folder") {
    setOrd(c.nodeId);
    const prefix = c.path.endsWith("/") ? c.path : `${c.path}/`;
    const rows = await nodeRepo.listDocumentNodeIdPathByPathPrefix(prefix, 2e3);
    for (const r of rows) {
      const p = r.path ?? "";
      if (hubSummaryFolder && p && isVaultPathUnderPrefix(p, hubSummaryFolder)) continue;
      setOrd(r.node_id);
    }
    return bits;
  }
  setOrd(c.nodeId);
  const refRows = await edgeRepo.listReferenceEdgesIncidentToNode(c.nodeId, 500);
  for (const e of refRows) {
    const other = e.from_node_id === c.nodeId ? e.to_node_id : e.from_node_id;
    setOrd(other);
  }
  return bits;
}
async function selectHubCandidatesMultiRound(options) {
  const { candidatePool, limitTotal, tenant, hubDiscoverSettings, seedSelected = [], docCoverageIndex } = options;
  const coverageBitCache = /* @__PURE__ */ new Map();
  const coveredBits = createUint32Bitset(docCoverageIndex.docCount);
  const coveredDocumentCount = { value: 0 };
  const coveredPrefixCounts = /* @__PURE__ */ new Map();
  async function getCoverageBits(candidate) {
    const k = candidate.stableKey;
    let s = coverageBitCache.get(k);
    if (!s) {
      s = await estimateCandidateCoverageBits(tenant, candidate, docCoverageIndex);
      coverageBitCache.set(k, s);
    }
    return s;
  }
  const selected = [];
  const selectedStableKeys = /* @__PURE__ */ new Set();
  for (const candidate of seedSelected) {
    if (selected.length >= limitTotal) break;
    if (selectedStableKeys.has(candidate.stableKey)) continue;
    const coverage = await getCoverageBits(candidate);
    selected.push(candidate);
    selectedStableKeys.add(candidate.stableKey);
    mergeCoverageBitsIntoUnion(
      coverage,
      coveredBits,
      coveredDocumentCount,
      coveredPrefixCounts,
      docCoverageIndex.pathByOrdinal
    );
  }
  const rankedPool = [...candidatePool].sort((a, b) => b.rankingScore - a.rankingScore);
  for (const candidate of rankedPool) {
    if (selected.length >= limitTotal) break;
    if (selectedStableKeys.has(candidate.stableKey)) continue;
    const coverage = await getCoverageBits(candidate);
    const marginalGain = fractionOfBitsNewSince(coverage, coveredBits);
    const isEarlyFillSlot = selected.length < HUB_DISCOVER_GREEDY_SELECTION.earlyFillSlots;
    const isStrongHub = candidate.rankingScore >= HUB_DISCOVER_GREEDY_SELECTION.strongHubScore;
    const hasUsefulCoverageGain = marginalGain >= hubDiscoverSettings.minCoverageGain * HUB_DISCOVER_GREEDY_SELECTION.usefulGainFactor;
    const shouldSkip = !isEarlyFillSlot && selected.length >= HUB_DISCOVER_GREEDY_SELECTION.strictFilterStartCount && !isStrongHub && !hasUsefulCoverageGain;
    if (shouldSkip) continue;
    selected.push(candidate);
    selectedStableKeys.add(candidate.stableKey);
    mergeCoverageBitsIntoUnion(
      coverage,
      coveredBits,
      coveredDocumentCount,
      coveredPrefixCounts,
      docCoverageIndex.pathByOrdinal
    );
  }
  let sum = 0;
  for (const c of rankedPool) {
    if (selectedStableKeys.has(c.stableKey)) continue;
    sum += c.rankingScore * HUB_DISCOVER_REMAINING_CANDIDATE_SCORE_WEIGHT;
  }
  const remainingCandidateScore = Math.min(1, sum);
  const remainingUnselectedKeyRatio = marginalCoverageGain(
    new Set(rankedPool.map((p) => p.stableKey)),
    selectedStableKeys
  );
  const stopDecision = {
    continueDiscovery: remainingCandidateScore > hubDiscoverSettings.minCoverageGain * 2 && selected.length < limitTotal,
    reason: selected.length >= limitTotal ? "limit_reached" : remainingCandidateScore <= hubDiscoverSettings.minCoverageGain ? "low_remaining_potential" : "pool_exhausted",
    remainingPotentialScore: remainingCandidateScore,
    coverageGainEstimate: remainingUnselectedKeyRatio
  };
  const roundContext = {
    roundIndex: Math.max(1, options.roundIndex ?? 1),
    maxRounds: hubDiscoverSettings.maxRounds,
    selectedStableKeys,
    coveredDocumentBits: coveredBits,
    docCoverageIndex,
    coverageBitCache,
    remainingPotentialScore: remainingCandidateScore,
    coveredDocumentCount: coveredDocumentCount.value,
    coveredPrefixCounts
  };
  return { selected, stopDecision, roundContext };
}
function countByKey(items) {
  const out = {};
  for (const k of items) {
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
async function buildHubDiscoverRoundSummary(options) {
  const { tenant, documentCount, mergedPoolSize, limitTotal, selected, stopDecision, roundContext } = options;
  const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
  const idx = roundContext.docCoverageIndex;
  const cache = roundContext.coverageBitCache;
  const isDocumentCovered = (nodeId) => {
    const o = idx.ordinalByNodeId.get(nodeId);
    return o !== void 0 && hasUint32Bit(roundContext.coveredDocumentBits, o);
  };
  const coveredDocumentCount = roundContext.coveredDocumentCount;
  const uncoveredDocumentCount = Math.max(0, documentCount - coveredDocumentCount);
  const coverageRatio = documentCount > 0 ? coveredDocumentCount / documentCount : 0;
  const hubCards = [];
  const covByKey = /* @__PURE__ */ new Map();
  for (const c of selected) {
    let cov = cache.get(c.stableKey);
    if (!cov) {
      cov = await estimateCandidateCoverageBits(tenant, c, idx);
      cache.set(c.stableKey, cov);
    }
    covByKey.set(c.stableKey, cov);
    hubCards.push({
      stableKey: c.stableKey,
      path: c.path,
      label: c.label,
      sourceKind: c.sourceKind,
      sourceKinds: [...c.sourceKinds],
      sourceConsensusScore: c.sourceConsensusScore,
      rankingScore: c.rankingScore,
      role: c.role,
      graphScore: c.graphScore,
      coverageSize: countBitsUint32(cov)
    });
  }
  const vaultPrefixTotals = await nodeRepo.listDocumentGapPrefixCounts();
  const coveredPrefix = roundContext.coveredPrefixCounts;
  const sortedGapCandidates = vaultPrefixTotals.map((row) => ({
    pathPrefix: row.pathPrefix,
    uncoveredDocumentCount: row.documentCount - (coveredPrefix.get(row.pathPrefix) ?? 0)
  })).filter((g) => g.uncoveredDocumentCount > 0).sort((a, b) => b.uncoveredDocumentCount - a.uncoveredDocumentCount).slice(0, 12);
  const topUncoveredFolders = await Promise.all(
    sortedGapCandidates.map(async (g) => ({
      pathPrefix: g.pathPrefix,
      uncoveredDocumentCount: g.uncoveredDocumentCount,
      examplePaths: await nodeRepo.listSampleUncoveredPathsForGapPrefix(g.pathPrefix, isDocumentCovered, 5)
    }))
  );
  const keys = selected.map((c) => c.stableKey);
  const topOverlapPairs = [];
  for (let i = 0; i < keys.length; i++) {
    const sa = covByKey.get(keys[i]);
    for (let j = i + 1; j < keys.length; j++) {
      const sb = covByKey.get(keys[j]);
      let shared = 0;
      const nw = Math.max(sa.length, sb.length);
      for (let wi = 0; wi < nw; wi++) {
        shared += popcountUint32((sa[wi] ?? 0) & (sb[wi] ?? 0));
      }
      const ratio = overlapRatioMinUint32(sa, sb);
      if (shared > 0) {
        topOverlapPairs.push({
          stableKeyA: selected[i].stableKey,
          stableKeyB: selected[j].stableKey,
          overlapRatio: ratio,
          sharedNodeCount: shared
        });
      }
    }
  }
  topOverlapPairs.sort((a, b) => b.overlapRatio - a.overlapRatio);
  const topOverlapTrimmed = topOverlapPairs.slice(0, 12);
  return {
    documentCount,
    mergedPoolSize,
    limitTotal,
    roundIndex: roundContext.roundIndex,
    maxRounds: roundContext.maxRounds,
    remainingSlots: options.remainingSlots,
    newlyAddedThisRound: options.newlyAddedThisRound,
    selectedHubCount: selected.length,
    selectedBySourceKind: countByKey(selected.map((c) => c.sourceKind)),
    selectedBySourceBlend: countByKey(
      selected.map(
        (c) => [...new Set(c.sourceKinds)].sort((a, b) => SOURCE_PRIORITY[b] - SOURCE_PRIORITY[a]).join("+")
      )
    ),
    selectedByRole: countByKey(selected.map((c) => c.role)),
    coveredDocumentCount,
    uncoveredDocumentCount,
    coverageRatio,
    remainingPotentialScore: stopDecision.remainingPotentialScore,
    coverageGainEstimate: stopDecision.coverageGainEstimate,
    deterministicContinueDiscovery: stopDecision.continueDiscovery,
    deterministicStopReason: stopDecision.reason,
    hubCards,
    topUncoveredFolders,
    topOverlapPairs: topOverlapTrimmed
  };
}
var DEFAULT_MODES_ALL = ["manual_seed", "folder", "document", "cluster"];
function listMarkdownPathsUnderFolder(folderPath) {
  const app = AppContext.getApp();
  const normalized = (0, import_obsidian19.normalizePath)(folderPath.trim());
  if (!normalized) return [];
  const abs = app.vault.getAbstractFileByPath(normalized);
  if (!abs || !(abs instanceof import_obsidian19.TFolder)) return [];
  const out = [];
  const walk = (f) => {
    if (f instanceof import_obsidian19.TFile && f.extension === "md") out.push(f.path);
    else if (f instanceof import_obsidian19.TFolder) for (const ch of f.children) walk(ch);
  };
  walk(abs);
  return out.sort();
}
var HubCandidateDiscoveryService = class {
  inferRole(incoming, outgoing) {
    if (incoming >= 5 && outgoing >= 5) return "bridge";
    if (outgoing > incoming * 1.2 && outgoing >= 4) return "index";
    if (incoming > outgoing * 1.2 && incoming >= 4) return "authority";
    if (incoming + outgoing >= 6) return "folder_anchor";
    return "authority";
  }
  /** Must stay aligned with {@link MobiusNodeRepo.listTopDocumentNodesForHubDiscovery} SQL scoring. */
  scoreDocumentRow(r) {
    const inc = r.doc_incoming_cnt ?? 0;
    const out = r.doc_outgoing_cnt ?? 0;
    const pr = typeof r.pagerank === "number" && Number.isFinite(r.pagerank) ? r.pagerank : 0;
    const spr = typeof r.semantic_pagerank === "number" && Number.isFinite(r.semantic_pagerank) ? r.semantic_pagerank : 0;
    const wc = typeof r.word_count === "number" && Number.isFinite(r.word_count) ? r.word_count : 0;
    const longDocWeak = Math.min(0.08, wc / 5e4 * 0.08);
    const physicalAuthorityScore = Math.min(1, pr * 2.5 + longDocWeak);
    const organizationalScore = Math.min(1, inc * 0.035 + out * 0.055);
    const semanticCentralityScore = Math.min(1, spr * 1.2);
    const manualBoost = 0;
    const graphScore = Math.min(
      1,
      physicalAuthorityScore * 0.35 + organizationalScore * 0.25 + semanticCentralityScore * 0.35 + manualBoost * 0.05
    );
    const role = this.inferRole(inc, out);
    return {
      graphScore,
      candidateScore: {
        physicalAuthorityScore,
        organizationalScore,
        semanticCentralityScore,
        manualBoost
      },
      role
    };
  }
  /**
   * Top document nodes by graph score (no LLM). Ranking is done in SQL via {@link MobiusNodeRepo.listTopDocumentNodesForHubDiscovery}.
   */
  async discoverDocumentHubCandidates(options) {
    const tenant = options.tenant ?? "vault";
    const limit = Math.max(1, options.limit ?? 20);
    const hubFolder = getAIHubSummaryFolder();
    const prefixes = (options.targetPathPrefixes ?? []).map((p) => (0, import_obsidian19.normalizePath)(p.trim())).filter(Boolean);
    const mult = options.fetchMultiplier ?? (prefixes.length ? 3 : 1);
    const fetchLimit = Math.max(limit, Math.ceil(limit * mult));
    const rows = await sqliteStoreManager.getMobiusNodeRepo(tenant).listTopDocumentNodesForHubDiscovery(fetchLimit, hubFolder);
    const scored = [];
    for (const r of rows) {
      const path3 = r.path ?? "";
      if (!path3) continue;
      if (prefixes.length && !pathMatchesAnyPrefix(path3, prefixes)) continue;
      const inc = r.doc_incoming_cnt ?? 0;
      const out = r.doc_outgoing_cnt ?? 0;
      const role = this.inferRole(inc, out);
      const gs = r.hub_graph_score;
      scored.push({
        nodeId: r.node_id,
        path: path3,
        label: r.label || path3,
        role,
        graphScore: gs,
        candidateScore: {
          physicalAuthorityScore: r.hub_physical_authority_score,
          organizationalScore: r.hub_organizational_score,
          semanticCentralityScore: r.hub_semantic_centrality_score,
          manualBoost: 0
        },
        stableKey: `document:${r.node_id}`,
        pagerank: typeof r.pagerank === "number" && Number.isFinite(r.pagerank) ? r.pagerank : 0,
        semanticPagerank: typeof r.semantic_pagerank === "number" && Number.isFinite(r.semantic_pagerank) ? r.semantic_pagerank : 0,
        docIncomingCnt: inc,
        docOutgoingCnt: out,
        ...singleSourceHubProvenance("document", gs)
      });
    }
    scored.sort((a, b) => b.graphScore - a.graphScore);
    return scored.slice(0, limit);
  }
  /**
   * One candidate per indexed markdown under `getAIManualHubFolder()` (first-class user hub notes).
   *
   * **Why a DB lookup per path:** discovery here is driven by vault paths from the filesystem, not by
   * `listTopDocumentNodesForHubDiscovery`. Each manual hub needs `mobius_node` (`node_id`, degrees, PageRank, etc.).
   * `getIndexedHubOrDocumentRowByPath` resolves path → row (`hub_doc` or `document`). Maintenance runs
   * `indexDocument` on all Manual notes before discovery; if the row is still missing, skip (we do not inline-index here).
   *
   * **Why `scoreDocumentRow`:** hub graph score is not stored on `mobius_node`. Auto document candidates get scores
   * inside SQL; manual hubs reuse the same formula in TS so merged candidates share comparable `graphScore` /
   * `candidateScore` for ranking (keep in sync with `MobiusNodeRepo.listTopDocumentNodesForHubDiscovery`).
   */
  async discoverManualHubCandidates(options) {
    const tenant = options.tenant ?? "vault";
    const app = AppContext.getApp();
    const manualRoot = getAIManualHubFolder();
    const hubFolder = getAIHubSummaryFolder();
    if (!manualRoot) return [];
    const paths = listMarkdownPathsUnderFolder(manualRoot);
    const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const out = [];
    for (const path3 of paths) {
      if (!isVaultPathUnderPrefix(path3, manualRoot)) continue;
      const row = await nodeRepo.getIndexedHubOrDocumentRowByPath(path3);
      if (!row?.node_id || !row.path) {
        console.warn(`[discoverManualHubCandidates] Skip (not indexed yet): ${path3}`);
        continue;
      }
      let raw = "";
      const f = app.vault.getAbstractFileByPath(path3);
      if (f instanceof import_obsidian19.TFile) {
        try {
          raw = await app.vault.read(f);
        } catch {
          raw = "";
        }
      }
      const fm = parseManualHubFrontmatterEnhancements(raw);
      const inc = row.doc_incoming_cnt ?? 0;
      const outd = row.doc_outgoing_cnt ?? 0;
      const { graphScore, candidateScore, role: inferredRole } = this.scoreDocumentRow(row);
      const role = fm.hubRole ?? inferredRole;
      const filteredMembers = fm.hubSourcePaths?.filter((p) => p && !(hubFolder && isVaultPathUnderPrefix(p, hubFolder))) ?? [];
      const gs = Math.min(1, graphScore + 0.25);
      out.push({
        nodeId: row.node_id,
        path: row.path,
        label: row.label || path3.split("/").pop() || path3,
        role,
        graphScore: gs,
        candidateScore: {
          ...candidateScore,
          manualBoost: 1
        },
        stableKey: `manual-hub:${(0, import_obsidian19.normalizePath)(row.path)}`,
        pagerank: typeof row.pagerank === "number" && Number.isFinite(row.pagerank) ? row.pagerank : 0,
        semanticPagerank: typeof row.semantic_pagerank === "number" && Number.isFinite(row.semantic_pagerank) ? row.semantic_pagerank : 0,
        docIncomingCnt: inc,
        docOutgoingCnt: outd,
        ...singleSourceHubProvenance("manual", gs),
        ...filteredMembers.length ? { clusterMemberPaths: filteredMembers } : {}
      });
    }
    return out;
  }
  /**
   * Folder-level hubs from path prefix aggregation.
   */
  async discoverFolderHubCandidates(options) {
    const tenant = options.tenant ?? "vault";
    const limit = Math.max(1, options.limit ?? HUB_DISCOVER_FOLDER_MAX_CANDIDATES);
    const hubFolder = getAIHubSummaryFolder();
    const prefixes = (options.targetPathPrefixes ?? []).map((p) => (0, import_obsidian19.normalizePath)(p.trim())).filter(Boolean);
    const mult = options.fetchMultiplier ?? (prefixes.length ? 3 : 1);
    const fetchLimit = Math.max(limit, Math.ceil(limit * mult));
    const rows = await sqliteStoreManager.getMobiusNodeRepo(tenant).listTopFolderNodesForHubDiscovery(fetchLimit, hubFolder);
    const candidates = [];
    for (const r of rows) {
      const folderPath = r.path;
      if (prefixes.length && !pathMatchesAnyPrefix(folderPath, prefixes)) continue;
      const label = folderPath.includes("/") ? folderPath.slice(folderPath.lastIndexOf("/") + 1) : folderPath;
      const avgPr = typeof r.pagerank === "number" && Number.isFinite(r.pagerank) ? r.pagerank : 0;
      const avgSpr = typeof r.semantic_pagerank === "number" && Number.isFinite(r.semantic_pagerank) ? r.semantic_pagerank : 0;
      const gs = r.hub_graph_score;
      candidates.push({
        nodeId: r.node_id,
        path: folderPath,
        label,
        role: "folder_anchor",
        graphScore: gs,
        candidateScore: {
          physicalAuthorityScore: r.hub_physical_authority_score,
          organizationalScore: r.hub_organizational_score,
          semanticCentralityScore: r.hub_semantic_centrality_score,
          manualBoost: 0
        },
        stableKey: `folder:${(0, import_obsidian19.normalizePath)(folderPath)}`,
        pagerank: avgPr,
        semanticPagerank: avgSpr,
        docIncomingCnt: Math.max(0, Math.floor(Number(r.doc_incoming_cnt ?? 0))),
        docOutgoingCnt: Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0))),
        ...singleSourceHubProvenance("folder", gs)
      });
    }
    candidates.sort((a, b) => b.graphScore - a.graphScore);
    return candidates.slice(0, limit);
  }
  /**
   * Cluster hubs from semantic PageRank seeds + 1-hop semantic edges.
   * Stops when `out.length` reaches `limit` (`clusterLimit` from `computeHubDiscoverBudgets`).
   */
  async discoverClusterHubCandidates(options) {
    const tenant = options.tenant ?? "vault";
    const limit = Math.max(1, options.limit ?? 8);
    const seedFetchLimit = Math.max(limit, options.seedFetchLimit ?? limit * 4);
    const hubFolder = getAIHubSummaryFolder();
    const exclude = options.excludeNodeIds ?? /* @__PURE__ */ new Set();
    const prefixes = (options.targetPathPrefixes ?? []).map((p) => (0, import_obsidian19.normalizePath)(p.trim())).filter(Boolean);
    const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const seeds = await nodeRepo.listDocumentNodesForHubClusterSeeds(seedFetchLimit);
    const out = [];
    for (const s of seeds) {
      if (out.length >= limit) break;
      const p = s.path ?? "";
      if (!p || hubFolder && isVaultPathUnderPrefix(p, hubFolder)) continue;
      if (prefixes.length && !pathMatchesAnyPrefix(p, prefixes)) continue;
      if (exclude.has(s.node_id)) continue;
      const neighRows = await edgeRepo.listSemanticRelatedEdgesIncidentToNode(s.node_id, 200);
      const memberIds = /* @__PURE__ */ new Set([s.node_id]);
      for (const e of neighRows) {
        const other = e.from_node_id === s.node_id ? e.to_node_id : e.from_node_id;
        memberIds.add(other);
        if (memberIds.size >= HUB_DISCOVER_CLUSTER_SEMANTIC_NEIGHBOR_CAP) break;
      }
      if (memberIds.size < HUB_DISCOVER_CLUSTER_MIN_SIZE) continue;
      const idList = [...memberIds];
      const paths = await nodeRepo.listDocumentNodeIdPathByIds(idList);
      const pathById = new Map(paths.map((r) => [r.node_id, r.path ?? ""]));
      const memberPaths = idList.map((id) => pathById.get(id)).filter((x) => !!x && !(hubFolder && isVaultPathUnderPrefix(x, hubFolder)));
      if (memberPaths.length < HUB_DISCOVER_CLUSTER_MIN_SIZE) continue;
      const sortedKey = [...memberIds].sort().join("|");
      const h = hashSHA256(sortedKey).slice(0, SLICE_CAPS.hub.clusterHashHexPrefix);
      const nodeId = stableHubClusterNodeId(tenant, h);
      const spr = typeof s.semantic_pagerank === "number" && Number.isFinite(s.semantic_pagerank) ? s.semantic_pagerank : 0;
      const pr = typeof s.pagerank === "number" && Number.isFinite(s.pagerank) ? s.pagerank : 0;
      const inc = s.doc_incoming_cnt ?? 0;
      const physicalAuthorityScore = Math.min(1, pr * 2);
      const organizationalScore = Math.min(1, memberPaths.length * 0.04);
      const semanticCentralityScore = Math.min(1, spr * 1.3);
      const graphScore = Math.min(
        1,
        physicalAuthorityScore * 0.25 + organizationalScore * 0.2 + semanticCentralityScore * 0.55
      );
      out.push({
        nodeId,
        path: `__hub_cluster__/${h}`,
        label: `Cluster (${memberPaths.length}) ${s.label || p}`,
        role: "cluster_center",
        graphScore,
        candidateScore: {
          physicalAuthorityScore,
          organizationalScore,
          semanticCentralityScore,
          manualBoost: 0
        },
        stableKey: `cluster:${h}`,
        pagerank: pr,
        semanticPagerank: spr,
        docIncomingCnt: inc,
        docOutgoingCnt: memberPaths.length,
        ...singleSourceHubProvenance("cluster", graphScore),
        clusterMemberPaths: memberPaths
      });
    }
    return out.slice(0, limit);
  }
  /**
   * Full first-pass discovery (all sources, no path hints).
   */
  async discoverHubCandidatesFirstRound(options) {
    const { tenant, budgets } = options;
    const [manual, docs, folders] = await Promise.all([
      this.discoverManualHubCandidates({ tenant }),
      this.discoverDocumentHubCandidates({ tenant, limit: budgets.documentFetchLimit }),
      this.discoverFolderHubCandidates({ tenant, limit: budgets.folderFetchLimit })
    ]);
    const topDocSlice = docs.slice(0, budgets.topDocExcludeLimit);
    const topDocIds = new Set(topDocSlice.map((d) => d.nodeId));
    const clusters = await this.discoverClusterHubCandidates({
      tenant,
      limit: budgets.clusterLimit,
      seedFetchLimit: budgets.clusterSeedFetchLimit,
      excludeNodeIds: topDocIds
    });
    return [...manual, ...folders, ...docs, ...clusters];
  }
  /**
   * Targeted discovery for follow-up agent rounds from hints (modes + path prefixes).
   */
  async discoverHubCandidatesFollowUpRound(options) {
    const { tenant, budgets, hints } = options;
    const modes = hints.suggestedDiscoveryModes;
    const has = (m) => modes.includes(m);
    const prefixes = hints.targetPathPrefixes;
    const hubFolder = getAIHubSummaryFolder();
    const rows = await sqliteStoreManager.getMobiusNodeRepo(tenant).listTopDocumentNodesForHubDiscovery(Math.max(1, budgets.topDocExcludeLimit), hubFolder);
    const topDocIds = new Set(rows.map((r) => r.node_id));
    const out = [];
    if (has("manual_seed")) {
      out.push(...await this.discoverManualHubCandidates({ tenant }));
    }
    if (has("document")) {
      out.push(
        ...await this.discoverDocumentHubCandidates({
          tenant,
          limit: budgets.documentFetchLimit,
          targetPathPrefixes: prefixes
        })
      );
    }
    if (has("folder")) {
      out.push(
        ...await this.discoverFolderHubCandidates({
          tenant,
          limit: budgets.folderFetchLimit,
          targetPathPrefixes: prefixes
        })
      );
    }
    if (has("cluster")) {
      out.push(
        ...await this.discoverClusterHubCandidates({
          tenant,
          limit: budgets.clusterLimit,
          seedFetchLimit: budgets.clusterSeedFetchLimit,
          excludeNodeIds: topDocIds,
          targetPathPrefixes: prefixes
        })
      );
    }
    return out;
  }
  /**
   * Merge sources with priority manual > folder > document > cluster (per stableKey),
   * agent loop: accumulate pool, greedy selection with pinned hubs, round LLM review drives targeted follow-up.
   * Resolves hub discovery options from `AppContext.getInstance().settings.search.hubDiscover` merged with defaults.
   */
  async discoverAllHubCandidates(options) {
    const sw = new Stopwatch("HubDiscover.discoverAllHubCandidates");
    const tenant = options?.tenant ?? "vault";
    const hubDiscoverSetting = AppContext.getInstance().settings.search.hubDiscover;
    sw.start("buildDocCoverageIndex");
    const docCoverageIndex = await buildHubDiscoverDocCoverageIndex(tenant);
    sw.stop();
    sw.start("computeHubDiscoverBudgets");
    const docCount = docCoverageIndex.docCount;
    const budgets = computeHubDiscoverBudgets(docCount);
    sw.stop();
    let candidatePool = [];
    let finalSelected = [];
    let hints = {
      roundIndex: 1,
      remainingSlots: budgets.limitTotal,
      targetPathPrefixes: [],
      suggestedDiscoveryModes: [...DEFAULT_MODES_ALL],
      nextDirections: []
    };
    let roundIndex = 0;
    let discoveryRounds = 0;
    while (true) {
      roundIndex++;
      const remainingSlots = budgets.limitTotal - finalSelected.length;
      if (remainingSlots <= 0) break;
      if (roundIndex > hubDiscoverSetting.maxRounds) break;
      discoveryRounds++;
      sw.start(`round${roundIndex}.discoverBatch`);
      const newBatch = roundIndex === 1 ? await this.discoverHubCandidatesFirstRound({ tenant, budgets }) : await this.discoverHubCandidatesFollowUpRound({
        tenant,
        budgets,
        hints
      });
      sw.stop();
      sw.start(`round${roundIndex}.mergeCandidates`);
      candidatePool = mergeCandidatesByPriority([...candidatePool, ...newBatch]);
      sw.stop();
      if (candidatePool.length === 0) break;
      sw.start(`round${roundIndex}.selectHubCandidates`);
      const selection = await selectHubCandidatesMultiRound({
        tenant,
        candidatePool,
        limitTotal: budgets.limitTotal,
        docCoverageIndex,
        // "in the next round, put the ones that were decided to be kept last round first"
        seedSelected: finalSelected.length > 0 ? finalSelected : void 0,
        hubDiscoverSettings: hubDiscoverSetting,
        roundIndex
      });
      sw.stop();
      const prevKeys = new Set(finalSelected.map((c) => c.stableKey));
      const newlyAdded = selection.selected.filter((c) => !prevKeys.has(c.stableKey));
      finalSelected = selection.selected;
      sw.start(`round${roundIndex}.buildRoundSummary`);
      const summary = await buildHubDiscoverRoundSummary({
        tenant,
        documentCount: docCount,
        mergedPoolSize: candidatePool.length,
        limitTotal: budgets.limitTotal,
        selected: selection.selected,
        stopDecision: selection.stopDecision,
        roundContext: selection.roundContext,
        remainingSlots: budgets.limitTotal - finalSelected.length,
        newlyAddedThisRound: newlyAdded.length
      });
      sw.stop();
      let review = null;
      if (hubDiscoverSetting.enableLlmJudge) {
        sw.start(`round${roundIndex}.llmRoundReview`);
        try {
          review = await AppContext.getInstance().manager.streamObjectWithPrompt(
            "hub-discover-round-review" /* HubDiscoverRoundReview */,
            { roundSummaryJson: JSON.stringify(summary) },
            hubDiscoverRoundReviewLlmSchema
          );
        } catch (e) {
          console.warn("[applyHubDiscoverRoundReview] Round review failed:", e);
        }
        sw.stop();
      }
      if (finalSelected.length >= budgets.limitTotal) break;
      if (roundIndex >= hubDiscoverSetting.maxRounds) break;
      const contDet = selection.stopDecision.continueDiscovery && finalSelected.length < budgets.limitTotal;
      const contLlm = hubDiscoverSetting.enableLlmJudge && review?.needAnotherRound === true;
      if (!contDet && !contLlm) break;
      if (newlyAdded.length === 0 && !contLlm) break;
      const nextRemaining = budgets.limitTotal - finalSelected.length;
      sw.start(`round${roundIndex}.buildNextRoundHints`);
      hints = await buildNextRoundHints(hubDiscoverSetting, review, summary, nextRemaining, roundIndex + 1);
      sw.stop();
    }
    sw.print();
    return attachDeterministicAssemblyHints(tenant, finalSelected);
  }
};
async function buildNextRoundHints(hubDiscoverSetting, review, summary, remainingSlots, nextRoundIndex) {
  if (hubDiscoverSetting.enableLlmJudge && review) {
    let modes = review.suggestedDiscoveryModes ?? [];
    if (!modes.length) {
      modes = summary.topUncoveredFolders.length ? ["folder", "document", "cluster"] : [...DEFAULT_MODES_ALL];
    }
    let prefixes = (review.targetPathPrefixes ?? []).map((p) => (0, import_obsidian19.normalizePath)(p.trim())).filter(Boolean);
    if (!prefixes.length && summary.topUncoveredFolders.length) {
      prefixes = summary.topUncoveredFolders.slice(0, 5).map((g) => g.pathPrefix);
    }
    return {
      roundIndex: nextRoundIndex,
      remainingSlots,
      targetPathPrefixes: prefixes,
      suggestedDiscoveryModes: modes.includes("manual_seed") ? modes : ["manual_seed", ...modes],
      nextDirections: review.nextDirections ?? []
    };
  }
  const gapPrefixes = summary.topUncoveredFolders.slice(0, 5).map((g) => g.pathPrefix).filter(Boolean);
  const tm = AppContext.getInstance().manager.getTemplateManager();
  if (!tm) throw new Error("TemplateManager is required for hub discover next-direction hints");
  const nextDirections = [await tm.render(IndexingTemplateId.HubDiscoverNextDirections, { gapPrefixes })];
  return {
    roundIndex: nextRoundIndex,
    remainingSlots,
    targetPathPrefixes: gapPrefixes,
    suggestedDiscoveryModes: ["folder", "document", "cluster"],
    nextDirections
  };
}

// src/service/search/index/helper/hub/localGraphAssembler.ts
var LH = LOCAL_HUB_GRAPH;
function clampLocalGraphScore(x) {
  return Math.max(0, Math.min(1, x));
}
function shouldStopExpansionLocalCore(addedNodes, novelTokenCount, maxNewNodes, minNoveltyRatio) {
  if (addedNodes > maxNewNodes) return true;
  if (addedNodes <= 0) return false;
  const ratio = novelTokenCount / Math.max(1, addedNodes);
  return ratio < minNoveltyRatio;
}
function crossFolderPenaltySync(centerFolder, pathById, fromId, toId) {
  const p1 = pathById.get(fromId) ?? "";
  const p2 = pathById.get(toId) ?? "";
  const f1 = folderPrefixOfPath(p1);
  const f2 = folderPrefixOfPath(p2);
  if (!centerFolder || !f1 || !f2) return LH.crossFolderPenalty.incompletePaths;
  const sameRoot = f1.startsWith(centerFolder) && f2.startsWith(centerFolder);
  return sameRoot ? 0 : LH.crossFolderPenalty.acrossSubtree;
}
function folderCohesion(path3, centerFolder) {
  if (!path3 || !centerFolder) return LH.folderCohesion.defaultWhenMissing;
  return path3.startsWith(centerFolder) ? LH.folderCohesion.insideCenterFolder : LH.folderCohesion.outsideCenterFolder;
}
function bridgePenalty(meta2) {
  const inc = meta2.doc_incoming_cnt ?? 0;
  const out = meta2.doc_outgoing_cnt ?? 0;
  if (inc >= LH.bridgeDegree.highThreshold && out >= LH.bridgeDegree.highThreshold) return LH.bridgeDegree.penalty;
  return 0;
}
function computeLocalHubNodeWeight(input) {
  const nw = LH.nodeWeight;
  const distPen = 1 / (1 + input.depth * nw.depthDecayPerHop);
  const pr = typeof input.pagerank === "number" && Number.isFinite(input.pagerank) ? input.pagerank : 0;
  const spr = typeof input.semanticPagerank === "number" && Number.isFinite(input.semanticPagerank) ? input.semanticPagerank : 0;
  const align = typeof input.tagAlignment === "number" && Number.isFinite(input.tagAlignment) ? input.tagAlignment : nw.defaultTagAlignment;
  const effectiveCohesion = nw.cohesionBlendCohesion * input.cohesionScore + nw.cohesionBlendAlignment * align;
  return clampLocalGraphScore(
    nw.quarter * distPen + nw.quarter * effectiveCohesion + nw.quarter * clampLocalGraphScore(pr * nw.pagerankScale) + nw.quarter * clampLocalGraphScore(spr * nw.semanticPagerankScale) - input.bridgePenalty * nw.bridgePenaltyScale
  );
}
function computeLocalHubEdgeWeight(input) {
  const ew = LH.edgeWeight;
  const wBase = typeof input.baseWeight === "number" && Number.isFinite(input.baseWeight) ? input.baseWeight : ew.defaultBase;
  const edgeTypeWeight = input.edgeType === GraphEdgeType.References ? ew.references : input.edgeType === GraphEdgeType.Contains ? ew.contains : input.edgeType === GraphEdgeType.SemanticRelated ? ew.semanticRelated : ew.other;
  return {
    hubEdgeWeight: clampLocalGraphScore(
      wBase * edgeTypeWeight * (1 - input.crossBoundaryPenalty * ew.crossPenaltyScale)
    ),
    edgeTypeWeight,
    semanticSupport: input.edgeType === GraphEdgeType.SemanticRelated ? wBase : 0
  };
}
function anchorSetsFromBlob(blob) {
  const topics = new Set(blob.topicTags);
  for (const e of blob.topicTagEntries ?? []) topics.add(e.id);
  const functionals = new Set(blob.functionalTagEntries.map((e) => e.id));
  const keywords = /* @__PURE__ */ new Set([...graphKeywordTagsForMobius(blob), ...blob.textrankKeywordTerms ?? []]);
  return { topics, functionals, keywords };
}
function buildAnchorSetsFromCandidateAndCenterBlob(candidate, centerBlob) {
  const h = candidate.assemblyHints;
  if (h && (h.anchorTopicTags.length || h.anchorFunctionalTagIds.length || h.anchorKeywords.length)) {
    return {
      topics: new Set(h.anchorTopicTags),
      functionals: new Set(h.anchorFunctionalTagIds),
      keywords: new Set(h.anchorKeywords)
    };
  }
  return anchorSetsFromBlob(centerBlob);
}
function tagAlignmentScore(anchor, blob) {
  const tab = LH.tagAlignmentBlend;
  const n = anchor.topics.size + anchor.functionals.size + anchor.keywords.size;
  if (n === 0) return tab.neutralEmptyAnchors;
  const nodeTopics = new Set(blob.topicTags);
  for (const e of blob.topicTagEntries ?? []) nodeTopics.add(e.id);
  const nodeFuncs = new Set(blob.functionalTagEntries.map((e) => e.id));
  const nodeKw = /* @__PURE__ */ new Set([...graphKeywordTagsForMobius(blob), ...blob.textrankKeywordTerms ?? []]);
  const jacc = (a, b) => {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const x of a) {
      if (b.has(x)) inter++;
    }
    const union = a.size + b.size - inter;
    return union > 0 ? inter / union : 0;
  };
  return clampLocalGraphScore(
    tab.topics * jacc(anchor.topics, nodeTopics) + tab.functionals * jacc(anchor.functionals, nodeFuncs) + tab.keywords * jacc(anchor.keywords, nodeKw)
  );
}
function noveltyTokensFromBlob(blob) {
  const out = [];
  for (const t of blob.topicTags) out.push(`t:${t}`);
  for (const e of blob.topicTagEntries ?? []) out.push(`t:${e.id}`);
  for (const e of blob.functionalTagEntries) out.push(`f:${e.id}`);
  for (const k of graphKeywordTagsForMobius(blob)) out.push(`k:${k}`);
  for (const k of blob.textrankKeywordTerms ?? []) out.push(`tr:${k}`);
  return out;
}
function inferRoleHint(meta2, depth, isCenter, isPeerHub) {
  if (isCenter) return "core";
  if (isPeerHub) return "child_hub";
  if (meta2.type === GraphNodeType.Folder) return "folder";
  const rh = LH.roleHint;
  const inc = meta2.doc_incoming_cnt ?? 0;
  const out = meta2.doc_outgoing_cnt ?? 0;
  if (depth >= rh.boundaryMinDepth) return "boundary";
  if (inc >= rh.bridgeMinInc && out >= rh.bridgeMinOut) return "bridge";
  if (inc + out <= rh.leafMaxTotalDegree) return "leaf";
  if (inc + out >= rh.bridgeMinTotalDegree) return "bridge";
  return "leaf";
}
async function loadNodeMetaBatch(tenant, nodeIds) {
  const ids = [...new Set(nodeIds)];
  const m = /* @__PURE__ */ new Map();
  if (ids.length === 0) return m;
  const rows = await sqliteStoreManager.getMobiusNodeRepo(tenant).listHubLocalGraphNodeMeta(ids);
  for (const r of rows) {
    m.set(r.node_id, {
      node_id: r.node_id,
      path: r.path ?? "",
      label: r.label,
      type: r.type,
      doc_incoming_cnt: r.doc_incoming_cnt,
      doc_outgoing_cnt: r.doc_outgoing_cnt,
      pagerank: r.pagerank,
      semantic_pagerank: r.semantic_pagerank,
      tags_json: r.tags_json ?? null
    });
  }
  return m;
}
function buildClusterLocalGraph(candidate) {
  const paths = candidate.clusterMemberPaths ?? [];
  if (paths.length === 0) return void 0;
  const center = candidate.nodeId;
  const cap = SLICE_CAPS.hub.clusterMemberPaths;
  const ch = LH.clusterHub;
  const nodes = paths.slice(0, cap).map((p, i) => ({
    nodeId: `cluster:${p}:${i}`,
    path: p,
    label: basenameFromPath(p),
    type: GraphNodeType.Document,
    depth: ch.memberDepth,
    hubNodeWeight: clampLocalGraphScore(ch.memberWeightBase + ch.memberWeightSpread * (1 - i / cap)),
    distancePenalty: ch.memberDistancePenalty,
    cohesionScore: ch.memberCohesion,
    bridgePenalty: 0,
    roleHint: "leaf"
  }));
  nodes.unshift({
    nodeId: center,
    path: candidate.path,
    label: candidate.label,
    type: GraphNodeType.Document,
    depth: 0,
    hubNodeWeight: ch.centerHubWeight,
    distancePenalty: 0,
    cohesionScore: 1,
    bridgePenalty: 0,
    roleHint: "core"
  });
  return {
    centerNodeId: center,
    nodes,
    edges: [],
    frontierSummary: {
      stoppedAtDepth: ch.stoppedAtDepth,
      reason: "cluster_hub",
      boundaryNodeIds: []
    },
    coverageSummary: {
      topFolderPrefixes: [],
      documentCount: paths.length
    }
  };
}
async function buildLocalHubGraphForCandidate(options) {
  const { tenant, candidate, hubNodeIdSet } = options;
  const maxDepth = options.maxDepth ?? LH.defaultMaxDepth;
  const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
  const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
  if (candidate.sourceKind === "cluster") {
    return buildClusterLocalGraph(candidate);
  }
  const centerId = candidate.nodeId;
  const centerRowsRaw = await nodeRepo.getHubLocalGraphCenterMeta(centerId);
  const centerRows = centerRowsRaw ? {
    node_id: centerRowsRaw.node_id,
    path: centerRowsRaw.path ?? "",
    label: centerRowsRaw.label,
    type: centerRowsRaw.type,
    doc_incoming_cnt: centerRowsRaw.doc_incoming_cnt,
    doc_outgoing_cnt: centerRowsRaw.doc_outgoing_cnt,
    pagerank: centerRowsRaw.pagerank,
    semantic_pagerank: centerRowsRaw.semantic_pagerank,
    tags_json: centerRowsRaw.tags_json ?? null
  } : void 0;
  if (!centerRows) return void 0;
  const centerPath = centerRows.path ?? candidate.path;
  const centerFolder = folderPrefixOfPath(centerPath);
  const centerBlob = decodeIndexedTagsBlob(centerRows.tags_json);
  const anchorSets = buildAnchorSetsFromCandidateAndCenterBlob(candidate, centerBlob);
  const assemblyHints = candidate.assemblyHints;
  const preferredChildHubSet = new Set(assemblyHints?.preferredChildHubNodeIds ?? []);
  const stopAtChildHub = assemblyHints?.stopAtChildHub !== false;
  const deprioritizedBridge = new Set(assemblyHints?.deprioritizedBridgeNodeIds ?? []);
  const visited = /* @__PURE__ */ new Set([centerId]);
  const frontier = /* @__PURE__ */ new Set([centerId]);
  const depthById = /* @__PURE__ */ new Map([[centerId, 0]]);
  const noveltyTokensSeen = /* @__PURE__ */ new Set();
  const novelBasenames = /* @__PURE__ */ new Set();
  const edgesAcc = [];
  const edgeKey = (a, b, t) => [a, b].sort().join("|") + "|" + t;
  const seenEdgeKeys = /* @__PURE__ */ new Set();
  const boundaryIds = [];
  let depth = 0;
  let stopReason = "max_depth_reached";
  const edgeTypes = [GraphEdgeType.References, GraphEdgeType.Contains, GraphEdgeType.SemanticRelated];
  while (frontier.size > 0 && depth < maxDepth && visited.size < LH.maxNodes) {
    const frontierIds = [...frontier];
    const rows = await edgeRepo.listEdgesByTypesIncidentToAnyNode(frontierIds, edgeTypes, LH.edgeQueryLimit);
    const neighborByNode = /* @__PURE__ */ new Map();
    const neighborEdges = [];
    for (const e of rows) {
      if (!frontier.has(e.from_node_id) && !frontier.has(e.to_node_id)) continue;
      neighborEdges.push(e);
      if (frontier.has(e.from_node_id)) {
        if (!neighborByNode.has(e.from_node_id)) neighborByNode.set(e.from_node_id, /* @__PURE__ */ new Set());
        neighborByNode.get(e.from_node_id).add(e.to_node_id);
      }
      if (frontier.has(e.to_node_id)) {
        if (!neighborByNode.has(e.to_node_id)) neighborByNode.set(e.to_node_id, /* @__PURE__ */ new Set());
        neighborByNode.get(e.to_node_id).add(e.from_node_id);
      }
    }
    const nextFrontier = /* @__PURE__ */ new Set();
    let addedNodes = 0;
    let novelTokenCount = 0;
    for (const src of frontier) {
      const neigh = neighborByNode.get(src);
      if (!neigh) continue;
      for (const n of neigh) {
        if (n === centerId) continue;
        const isPeerHub = hubNodeIdSet.has(n) && n !== centerId;
        const isPreferredChild = preferredChildHubSet.has(n);
        if (isPeerHub || isPreferredChild) {
          boundaryIds.push(n);
          if (stopAtChildHub) continue;
        }
        if (visited.has(n)) continue;
        if (visited.size >= LH.maxNodes) break;
        visited.add(n);
        depthById.set(n, depth + 1);
        nextFrontier.add(n);
        addedNodes++;
      }
    }
    if (nextFrontier.size > 0) {
      const newIds = [...nextFrontier];
      const pathMap = await loadNodeMetaBatch(tenant, newIds);
      for (const id of newIds) {
        const raw = pathMap.get(id)?.tags_json ?? null;
        const blob = decodeIndexedTagsBlob(raw);
        for (const tok of noveltyTokensFromBlob(blob)) {
          if (!noveltyTokensSeen.has(tok)) {
            noveltyTokensSeen.add(tok);
            novelTokenCount++;
          }
        }
      }
      if (novelTokenCount === 0 && newIds.length > 0) {
        for (const id of newIds) {
          const p = pathMap.get(id)?.path ?? "";
          const base = basenameFromPath(p);
          if (base && !novelBasenames.has(base)) {
            novelBasenames.add(base);
            novelTokenCount++;
          }
        }
      }
    }
    const visitedMeta = await loadNodeMetaBatch(tenant, [...visited]);
    const pathById = /* @__PURE__ */ new Map();
    for (const id of visited) {
      const p = visitedMeta.get(id)?.path ?? "";
      if (p) pathById.set(id, p);
    }
    for (const e of neighborEdges) {
      if (edgesAcc.length >= LH.maxEdges) break;
      if (!visited.has(e.from_node_id) || !visited.has(e.to_node_id)) continue;
      const k = edgeKey(e.from_node_id, e.to_node_id, e.type);
      if (seenEdgeKeys.has(k)) continue;
      seenEdgeKeys.add(k);
      const cross = crossFolderPenaltySync(centerFolder, pathById, e.from_node_id, e.to_node_id);
      const weighted = computeLocalHubEdgeWeight({
        baseWeight: e.weight,
        edgeType: e.type,
        crossBoundaryPenalty: cross
      });
      edgesAcc.push({
        fromNodeId: e.from_node_id,
        toNodeId: e.to_node_id,
        edgeType: e.type,
        hubEdgeWeight: weighted.hubEdgeWeight,
        edgeTypeWeight: weighted.edgeTypeWeight,
        semanticSupport: weighted.semanticSupport,
        crossBoundaryPenalty: cross
      });
    }
    if (shouldStopExpansionLocalCore(
      addedNodes,
      novelTokenCount,
      HUB_ANTI_EXPLOSION_MAX_NEW_NODES,
      HUB_ANTI_EXPLOSION_MIN_NOVELTY_RATIO
    )) {
      stopReason = "anti_explosion_novelty";
      break;
    }
    frontier.clear();
    for (const n of nextFrontier) frontier.add(n);
    depth++;
    if (frontier.size === 0) {
      stopReason = "empty_frontier";
      break;
    }
  }
  if (depth >= maxDepth) stopReason = "max_depth_reached";
  const allIds = [...visited];
  const metaMap = await loadNodeMetaBatch(tenant, allIds);
  const folderCounts = /* @__PURE__ */ new Map();
  for (const id of allIds) {
    const p = metaMap.get(id)?.path ?? "";
    if (!p || metaMap.get(id)?.type !== GraphNodeType.Document) continue;
    const fp = folderPrefixOfPath(p);
    const seg = fp.split("/").slice(0, SLICE_CAPS.hub.pathFolderSegmentParts).join("/");
    if (seg) folderCounts.set(seg, (folderCounts.get(seg) ?? 0) + 1);
  }
  const topFolders = [...folderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, SLICE_CAPS.hub.localGraphTopFolderPrefixes).map(([k]) => k);
  const nodes = [];
  for (const id of allIds) {
    const meta2 = metaMap.get(id);
    if (!meta2) continue;
    const d = depthById.get(id) ?? 0;
    const path3 = meta2.path ?? "";
    const isCenter = id === centerId;
    const isPreferredChild = preferredChildHubSet.has(id);
    const isPeerHubDoc = hubNodeIdSet.has(id) && id !== centerId;
    const isPeerHub = isPeerHubDoc || isPreferredChild;
    const role = inferRoleHint(meta2, d, isCenter, isPeerHub);
    const cohesion = folderCohesion(path3, centerFolder);
    const bridgeP = bridgePenalty(meta2);
    const distPen = 1 / (1 + d * LH.nodeWeight.depthDecayPerHop);
    const nodeBlob = decodeIndexedTagsBlob(meta2.tags_json);
    const align = tagAlignmentScore(anchorSets, nodeBlob);
    let hubW = computeLocalHubNodeWeight({
      depth: d,
      cohesionScore: cohesion,
      pagerank: meta2.pagerank,
      semanticPagerank: meta2.semantic_pagerank,
      bridgePenalty: bridgeP,
      tagAlignment: align
    });
    if (deprioritizedBridge.has(id)) {
      hubW = clampLocalGraphScore(hubW * LH.deprioritizedBridgeMultiplier);
    }
    nodes.push({
      nodeId: id,
      path: path3,
      label: meta2.label || path3 || id,
      type: meta2.type,
      depth: d,
      hubNodeWeight: hubW,
      distancePenalty: 1 - distPen,
      cohesionScore: cohesion,
      bridgePenalty: bridgeP,
      roleHint: role,
      expandPriority: hubW * distPen
    });
  }
  nodes.sort((a, b) => b.hubNodeWeight - a.hubNodeWeight);
  const frontierSummary = {
    stoppedAtDepth: depth,
    reason: stopReason,
    boundaryNodeIds: [...new Set(boundaryIds)].slice(0, SLICE_CAPS.hub.localGraphBoundaryNodes)
  };
  const coverageSummary = {
    topFolderPrefixes: topFolders,
    documentCount: nodes.filter((n) => n.type === GraphNodeType.Document).length
  };
  return {
    centerNodeId: centerId,
    nodes,
    edges: edgesAcc.slice(0, LH.maxEdges),
    frontierSummary,
    coverageSummary
  };
}
async function buildLocalHubGraphForPath(options) {
  const nodeId = await sqliteStoreManager.getMobiusNodeRepo(options.tenant).getHubOrDocumentNodeIdByVaultPath(options.centerPath);
  if (!nodeId) return void 0;
  const candidate = {
    nodeId,
    path: options.centerPath,
    label: options.centerPath.split("/").pop() ?? options.centerPath,
    role: "authority",
    graphScore: 1,
    stableKey: `path:${options.centerPath}`,
    docIncomingCnt: 0,
    docOutgoingCnt: 0,
    ...singleSourceHubProvenance("document", 1)
  };
  return buildLocalHubGraphForCandidate({
    tenant: options.tenant,
    candidate,
    hubNodeIdSet: options.hubNodeIdSet,
    maxDepth: options.maxDepth
  });
}
function mergeAssemblyFromLocal(hubNodeIdSet, local) {
  const childHubRoutes = [];
  for (const bid of local.frontierSummary.boundaryNodeIds) {
    if (!hubNodeIdSet.has(bid)) continue;
    const node = local.nodes.find((n) => n.nodeId === bid);
    if (!node?.path) continue;
    childHubRoutes.push({
      nodeId: bid,
      path: node.path,
      label: node.label || node.path.split("/").pop() || node.path
    });
  }
  const seen = /* @__PURE__ */ new Set();
  const routes = childHubRoutes.filter((r) => {
    if (seen.has(r.nodeId)) return false;
    seen.add(r.nodeId);
    return true;
  });
  const memberPathsSample = local.nodes.filter((n) => n.type === GraphNodeType.Document).sort((a, b) => b.hubNodeWeight - a.hubNodeWeight).map((n) => n.path).filter(Boolean).slice(0, SLICE_CAPS.hub.assemblyMemberPathsSample);
  return {
    childHubRoutes: routes.length ? routes : void 0,
    memberPathsSample: memberPathsSample.length ? memberPathsSample : void 0,
    localHubGraph: local
  };
}
async function resolveHubDocAssembly(c, hubNodeIdSet) {
  const tenant = "vault";
  const local = await buildLocalHubGraphForCandidate({ tenant, candidate: c, hubNodeIdSet });
  if (c.sourceKind === "manual" || c.sourceKind === "document") {
    if (!local) {
      return { memberPathsSample: [c.path], localHubGraph: void 0 };
    }
    return mergeAssemblyFromLocal(hubNodeIdSet, local);
  }
  if (c.sourceKind === "folder") {
    const baseSample = await sqliteStoreManager.getMobiusNodeRepo(tenant).listFolderHubDocMemberPathsSample(c.path);
    if (!local) {
      return { memberPathsSample: baseSample, localHubGraph: void 0 };
    }
    const merged = mergeAssemblyFromLocal(hubNodeIdSet, local);
    if (!merged.memberPathsSample?.length) {
      merged.memberPathsSample = baseSample;
    } else if (baseSample.length) {
      merged.memberPathsSample = [.../* @__PURE__ */ new Set([...merged.memberPathsSample, ...baseSample])].slice(
        0,
        SLICE_CAPS.hub.memberPathsMergedSample
      );
    }
    return merged;
  }
  if (c.sourceKind === "cluster") {
    if (!local) {
      return { clusterMemberPaths: c.clusterMemberPaths, localHubGraph: void 0 };
    }
    return {
      ...mergeAssemblyFromLocal(hubNodeIdSet, local),
      clusterMemberPaths: c.clusterMemberPaths
    };
  }
  return void 0;
}

// test/hub-local-graph-weights.test.ts
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function runTests() {
  assert(folderCohesion("A/B/note.md", "A/B") === 1, "same folder subtree should have full cohesion");
  assert(folderCohesion("A/C/note.md", "A/B") < 1, "different subtree should reduce cohesion");
  const pathById = /* @__PURE__ */ new Map([
    ["a", "A/B/one.md"],
    ["b", "A/B/two.md"],
    ["c", "X/Y/three.md"]
  ]);
  assert(crossFolderPenaltySync("A/B", pathById, "a", "b") === 0, "same root should have no cross-folder penalty");
  assert(crossFolderPenaltySync("A/B", pathById, "a", "c") > 0, "cross-root edge should have penalty");
  const lowBridge = bridgePenalty({ doc_incoming_cnt: 2, doc_outgoing_cnt: 3 });
  const highBridge = bridgePenalty({ doc_incoming_cnt: 12, doc_outgoing_cnt: 11 });
  assert(lowBridge === 0, "small degree node should not be bridge-penalized");
  assert(highBridge > 0, "high degree node should receive bridge penalty");
  const strongNode = computeLocalHubNodeWeight({
    depth: 0,
    cohesionScore: 1,
    pagerank: 0.4,
    semanticPagerank: 0.5,
    bridgePenalty: 0
  });
  const weakNode = computeLocalHubNodeWeight({
    depth: 4,
    cohesionScore: 0.35,
    pagerank: 0,
    semanticPagerank: 0,
    bridgePenalty: 0.35
  });
  assert(strongNode > weakNode, "strong central node should outrank distant weak node");
  const refEdge = computeLocalHubEdgeWeight({
    baseWeight: 1,
    edgeType: GraphEdgeType.References,
    crossBoundaryPenalty: 0
  });
  const semanticEdge = computeLocalHubEdgeWeight({
    baseWeight: 0.9,
    edgeType: GraphEdgeType.SemanticRelated,
    crossBoundaryPenalty: 0.45
  });
  assert(refEdge.hubEdgeWeight > semanticEdge.hubEdgeWeight, "cross-boundary semantic edge should be weaker than local reference edge");
  assert(semanticEdge.semanticSupport > 0, "semantic edge should keep semantic support");
  assert(!shouldStopExpansionLocalCore(0, 0, 32, 0.05), "no added nodes should not stop by novelty rule");
  assert(shouldStopExpansionLocalCore(40, 10, 32, 0.05), "too many added nodes should stop expansion");
  assert(shouldStopExpansionLocalCore(10, 0, 32, 0.05), "zero novelty after added nodes should stop expansion");
  console.log("hub-local-graph-weights.test.ts: all passed");
}
runTests();
