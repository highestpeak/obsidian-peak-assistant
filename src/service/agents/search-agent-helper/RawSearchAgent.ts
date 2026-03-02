
import { AIServiceManager } from "@/service/chat/service-manager";
import { Experimental_Agent as Agent, hasToolCall, InvalidToolInputError, type LanguageModel, type ModelMessage, type PrepareStepResult, type StepResult } from 'ai';
import { AgentTool, safeAgentTool } from "@/service/tools/types";
import {
    inspectNoteContextTool,
    graphTraversalTool,
    findPathTool,
    findKeyNodesTool,
    findOrphansTool,
    searchByDimensionsTool,
    exploreFolderTool,
    recentChangesWholeVaultTool,
    localSearchWholeVaultTool
} from '@/service/tools/search-graph-inspector';
import { genSystemInfo } from '@/service/tools/system-info';
import { contentReaderTool } from '@/service/tools/content-reader';
import { submitFinalAnswerTool } from '@/service/tools/submit-final-answer';
import { LLMStreamEvent, RawUIStreamEvent, StreamTriggerName, UIStepType } from "@/core/providers/types";
import { PromptId } from "@/service/prompt/PromptId";
import { generateUuidWithoutHyphens } from "@/core/utils/id-utils";
import { getFileNameFromPath } from "@/core/utils/file-utils";
import { submitEvidencePackInputSchema } from "@/core/schemas/agents";
import { submitExecutionSummaryInputSchema, submitRawSearchReportInputSchema } from "@/core/schemas/agents/search-agent-schemas";
import type { EvidencePack } from "./dossier-types";
import { buildErrorRetryInfo, buildPromptTraceDebugEvent, streamTransform, withRetryStream, type RetryContext } from "@/core/providers/helpers/stream-helper";
import { AgentContextManager } from "./AgentContextManager";
import type { ErrorRetryInfo } from "@/service/prompt/PromptId";
import { isBlankString } from "@/core/utils/common-utils";
import { convertModelMessagesToText } from "@/core/providers/adapter/ai-sdk-adapter";
import type { CallAgentToolOptions } from "@/service/tools/call-agent-tool";

/** Patterns that indicate dialogue with the user; vault search uses document-targeted queries only. */
export const VAULT_SEARCH_FORBID_DIALOGUE_PATTERNS: RegExp[] = [
    // English
    /\bplease\s+(tell|provide|share|give)\b/i,
    /\btell\s+me\b/i,
    /\byour\s+(idea|situation|status|thoughts)\b/i,
    /\b(what|how)\s+is\s+your\b/i,
    /\b(please|kindly)\s+(tell|provide|describe)\b/i,
];

export const VAULT_SEARCH_FORBID_DIALOGUE_MESSAGE =
    "REJECTED: Do not talk to the user. Format your query for vault search only (e.g. 'path:ChatFolder/ idea description', 'user status skills budget notes'). Remove phrases like 'please tell me', 'your idea', 'what is your'.";

/** Max content_reader calls per run; after this, tool returns a circuit-breaker message and control should return to Planner. */
const MAX_CONTENT_READER_PER_RUN = 8;

/** Instruction phrases that indicate recon-only (no content_reader); used to treat empty evidence + non-empty leads as success. */
const RECON_ONLY_INSTRUCTION_PATTERN = /recon only|do not read|locate hubs only|return coordinates only/i;

/** Normalize query: backend does not parse OR; we strip " OR " so the call still runs with a single phrase. */
const OR_IN_QUERY_PATTERN = /\s+or\s+/gi;
function normalizeQueryRemoveOr(q: string): string {
    return q.replace(OR_IN_QUERY_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

/** Options for callAgentTool('search') when the sub-agent is this RawSearchAgent. Export for SummaryAgent, DashboardBlocksAgent. */
export const CALL_SEARCH_AGENT_OPTIONS: CallAgentToolOptions = {
    forbidDialoguePatterns: VAULT_SEARCH_FORBID_DIALOGUE_PATTERNS,
    forbidDialogueMessage: VAULT_SEARCH_FORBID_DIALOGUE_MESSAGE,
};

/**
 * Tool set for search agent (executor)
 */
type SearchToolSet = {
    content_reader: AgentTool;
    web_search?: AgentTool;
    inspect_note_context?: AgentTool;
    graph_traversal?: AgentTool;
    find_path?: AgentTool;
    find_key_nodes?: AgentTool;
    find_orphans?: AgentTool;
    search_by_dimensions?: AgentTool;
    explore_folder?: AgentTool;
    recent_changes_whole_vault?: AgentTool;
    local_search_whole_vault?: AgentTool;
    submit_evidence_pack: AgentTool;
    submit_execution_summary: AgentTool;
    submit_rawsearch_report: AgentTool;
    submit_final_answer: AgentTool;
};

/** Step 1: gather candidate paths (seeds). No graph_traversal/find_path yet—those need seeds from this step. */
const PHASE_SEED_TOOLS: (keyof SearchToolSet)[] = [
    'explore_folder', 'local_search_whole_vault', 'search_by_dimensions', 'recent_changes_whole_vault',
    'find_key_nodes', 'find_orphans',
];

/** Step 2: mandatory graph expansion from seeds. Only graph-related tools; seed paths come from step 1 outputs. */
const PHASE_GRAPH_TOOLS: (keyof SearchToolSet)[] = [
    'graph_traversal', 'find_path', 'find_key_nodes', 'inspect_note_context',
];

/** Submit tools that can be called multiple times during a run; results are accumulated. */
const PHASE_SUBMIT_INTERMEDIATE: (keyof SearchToolSet)[] = [
    'submit_evidence_pack', 'submit_execution_summary', 'submit_rawsearch_report',
];

/** Only call at end of run to hand control back to coordinator. */
const PHASE_SUBMIT_FINAL: (keyof SearchToolSet)[] = ['submit_final_answer'];

const PHASE_C_TOOLS: (keyof SearchToolSet)[] = [
    ...PHASE_SUBMIT_INTERMEDIATE,
    ...PHASE_SUBMIT_FINAL,
];

/**
 * Phase gating: Seed → Graph + intermediate submit (early) → full tools → submit-only.
 * Evidence pack / execution summary / rawsearch_report are allowed from step 2 so the agent can emit
 * intermediate results and avoid context overflow; only submit_final_answer is for the final handoff.
 */
const PHASE_RANGES: { end: number; tools: (keyof SearchToolSet)[] }[] = [
    { end: 2, tools: [...PHASE_SEED_TOOLS] },
    { end: 4, tools: [...PHASE_SEED_TOOLS, ...PHASE_GRAPH_TOOLS] },
    { end: 5, tools: [...PHASE_GRAPH_TOOLS] },
    { end: 20, tools: [...PHASE_SEED_TOOLS, ...PHASE_GRAPH_TOOLS, ...PHASE_C_TOOLS] },
    { end: Infinity, tools: PHASE_C_TOOLS },
];

export interface RawSearchAgentOptions {
    enableWebSearch?: boolean;
    enableLocalSearch?: boolean;
}

export interface RawSearchVariables {
    /**
     * current search prompt.
     */
    prompt: string;
    /**
     * with these two fields: 
     * 1. Content Snippet Extraction: eg: when content_reader read a 10,000 word PDF, RawSearch must decide which 500-800 words to extract as content_snippet.
     * 2. Fact Filtering: it will only extract information related to mission_objective as facts when generating Evidence Pack.
     * 3. Avoid too much exploration: RawSearch may accidentally see interesting B while searching A, the Task Context like a magic spell constrains it: "Don't care about B, only take A." It doesn't have the power of decision, must strictly follow the current focus.
     */
    userOriginalQuery: string;

    /**
     * currentFocus Section
     * it is attention-consuming if AI read long text. so:
     * If you don't tell him "big principle (Instruction)", he will take garbage as treasure; 
     * If you don't tell him "execution intention (Reasoning)", he will return empty-handed from the treasure mountain.
     * currentThoughtInstruction: tell user what is the correct(the target goal). come from mindflow. prevent taking garbage back. "task boundary"
     * currentRawSearchCallReason: tell user why now do this step (the correct logic). come from thought. prevent missing key details. "execution tactic"
     */
    currentThoughtInstruction?: string;
    currentRawSearchCallReason?: string;
    /** Claim list only, newline-separated (no quotes/snippets). Used to avoid duplicate facts. */
    existing_facts?: string;
}

/** Battlefield assessment for MindFlow (from submit_rawsearch_report). */
export interface RawSearchBattlefieldAssessment {
    search_density?: 'High' | 'Low';
    match_quality?: 'Exact' | 'Fuzzy' | 'None';
    suggestion?: string;
}

/** Structured report from RawSearch for MindFlow (tactical summary, leads, assessment). */
export interface RawSearchReport {
    tactical_summary: string;
    discovered_leads?: string[];
    battlefield_assessment?: RawSearchBattlefieldAssessment;
}

export interface RawSearchAgentGenerationResult {
    /**
     * every evidence has a summary.
     */
    evidencePack: EvidencePack[];
    /**
     * all evidence has a overall summary.
     */
    executionSummary: string;
    /** Tactical summary + leads + assessment for MindFlow. */
    rawSearchReport?: RawSearchReport | null;
}

export class RawSearchAgent {
    /**
     * Search Agent - sub agent for search tasks
     */
    private searchAgent: Agent<SearchToolSet>;
    private readonly aiServiceManager: AIServiceManager;
    private readonly options: RawSearchAgentOptions;
    private readonly context: AgentContextManager;

    private latestGenerationResult: RawSearchAgentGenerationResult = {
        evidencePack: [],
        executionSummary: '',
        rawSearchReport: null,
    };

    /** Cached messages from the last run; used on retry to pass previous conversation into the prompt. Cleared after stream ends. */
    private lastRunMessages: ModelMessage[] | null = null;

    /** Number of content_reader calls in the current run; cap at MAX_CONTENT_READER_PER_RUN. Reset at stream start. */
    private contentReaderCallsThisRun = 0;

    constructor(params: {
        aiServiceManager: AIServiceManager;
        options: RawSearchAgentOptions;
        context: AgentContextManager;
    }) {
        this.aiServiceManager = params.aiServiceManager;
        this.options = params.options;
        this.context = params.context;

        const baseContentReader = contentReaderTool();
        const self = this;
        // Create search agent (focused on search tasks, no submit_final_answer)
        let searchTools: SearchToolSet = {
            content_reader: safeAgentTool({
                description: baseContentReader.description,
                inputSchema: baseContentReader.inputSchema,
                execute: async (input: unknown) => {
                    if (self.contentReaderCallsThisRun >= MAX_CONTENT_READER_PER_RUN) {
                        const path = (input as { path?: string })?.path ?? '';
                        return {
                            path,
                            content: '[MAX_FILES_THRESHOLD] This run has already read the maximum number of files (8). Submit evidence_pack, execution_summary, and rawsearch_report with discovered_leads; hand control back to Planner. Do not call content_reader again.',
                        };
                    }
                    self.contentReaderCallsThisRun++;
                    return baseContentReader.execute(input);
                },
            }),
            submit_evidence_pack: this.submitEvidencePackTool(),
            submit_execution_summary: this.submitExecutionSummaryTool(),
            submit_rawsearch_report: this.submitRawSearchReportTool(),
            submit_final_answer: submitFinalAnswerTool(),
        };
        // Web search reserved as external index shard. When enabled, add e.g. localWebSearchTool()
        // or perplexityWebSearchTool(); EvidencePack.origin.path_or_url and dossier.sources support URL.
        // if (this.options.enableWebSearch) { searchTools.web_search = ...; }
        if (this.options.enableLocalSearch) {
            const tm = this.aiServiceManager.getTemplateManager?.();
            searchTools.inspect_note_context = inspectNoteContextTool(tm);
            searchTools.graph_traversal = graphTraversalTool(tm);
            searchTools.find_path = findPathTool(tm);
            searchTools.find_key_nodes = findKeyNodesTool(tm);
            searchTools.find_orphans = findOrphansTool(tm);
            searchTools.search_by_dimensions = searchByDimensionsTool(tm);
            searchTools.explore_folder = exploreFolderTool(tm);
            searchTools.recent_changes_whole_vault = recentChangesWholeVaultTool(tm);
            const baseLocalSearch = localSearchWholeVaultTool(tm);
            const localSearchDescription =
                baseLocalSearch.description
                + ' **Strongly discouraged**: do not put " OR " in query—backend does not parse it; use one short phrase or 1–2 keywords per call, or searchMode vector/hybrid; split into separate calls if needed.';
            searchTools.local_search_whole_vault = safeAgentTool({
                description: localSearchDescription,
                inputSchema: baseLocalSearch.inputSchema,
                execute: async (input: unknown) => {
                    const raw = input as { query?: string;[k: string]: unknown };
                    const q = raw?.query;
                    if (typeof q === 'string' && OR_IN_QUERY_PATTERN.test(q)) {
                        const normalized = normalizeQueryRemoveOr(q);
                        return baseLocalSearch.execute({ ...raw, query: normalized || q });
                    }
                    return baseLocalSearch.execute(input);
                },
            });
        }
        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.RawAiSearch);
        const outputControl = this.aiServiceManager.getSettings?.()?.defaultOutputControl;
        const temperature = outputControl?.temperature ?? 0.5;
        const maxOutputTokens = outputControl?.maxOutputTokens ?? 4096;

        this.searchAgent = new Agent<SearchToolSet>({
            model: this.aiServiceManager.getMultiChat()
                .getProviderService(provider)
                .modelClient(modelId),
            tools: searchTools,
            stopWhen: [
                hasToolCall('submit_final_answer'),
            ],
            temperature,
            maxOutputTokens,
            prepareStep: (options: { steps: StepResult<SearchToolSet>[]; stepNumber: number; model: LanguageModel; messages: ModelMessage[] }): PrepareStepResult<SearchToolSet> | undefined => {
                self.lastRunMessages = options.messages?.length ? [...options.messages] : null;
                const step = options.stepNumber;
                const entry = PHASE_RANGES.find(({ end }) => step <= end);
                if (entry) {
                    return { ...options, activeTools: entry.tools, toolChoice: 'required' as const };
                }
                return options;
            },
            experimental_repairToolCall: async ({ toolCall, error }) => {
                if (toolCall.toolName !== 'submit_evidence_pack' || !InvalidToolInputError.isInstance(error)) {
                    return null;
                }
                try {
                    const raw = typeof toolCall.input === 'string' ? JSON.parse(toolCall.input) : toolCall.input;
                    if (raw == null || typeof raw !== 'object') return null;
                    const packs = Array.isArray(raw.evidence_pack) ? raw.evidence_pack : [];
                    const repaired = packs.map((p: Record<string, unknown>) => {
                        const pack = { ...p };
                        if (!Array.isArray(pack.facts)) pack.facts = [];
                        if (pack.snippet == null || typeof pack.snippet !== 'object') {
                            pack.snippet = { type: 'condensed', content: '' };
                        } else {
                            const s = pack.snippet as Record<string, unknown>;
                            if (s.type !== 'extract' && s.type !== 'condensed') s.type = 'condensed';
                            if (typeof s.content !== 'string') s.content = '';
                        }
                        return pack;
                    });
                    return { ...toolCall, input: JSON.stringify({ ...raw, evidence_pack: repaired }) };
                } catch {
                    return null;
                }
            },
        });
    }

    private submitEvidencePackTool(): AgentTool {
        const schema = submitEvidencePackInputSchema;
        return safeAgentTool({
            description:
                "Submit your Evidence Pack. Call once at the end of the run (submit phase). SUCCESS/PARTIAL: evidence_pack with at least one pack (origin, summary, facts with quote, snippet). Each pack must have summary: one short sentence describing what this evidence is about. FAILED: evidence_pack: [] and status=FAILED when nothing is found. After this and submit_execution_summary, submit_rawsearch_report, call submit_final_answer to hand control back.",
            inputSchema: schema,
            execute: async (rawInput: unknown) => {
                const parsed = schema.safeParse(rawInput);
                if (parsed.success && Array.isArray(parsed.data.evidence_pack)) {
                    this.latestGenerationResult.evidencePack = parsed.data.evidence_pack;
                }
            },
        });
    }

    private submitExecutionSummaryTool(): AgentTool {
        return safeAgentTool({
            description: "Submit the execution summary of the search. Call once at the end of the run (submit phase). Report findings only (e.g. [LEADS], [COVERAGE_HINT], [HUB_IDENTIFIED]), not the search process.",
            inputSchema: submitExecutionSummaryInputSchema,
            execute: async (rawInput: unknown) => {
                const parsed = submitExecutionSummaryInputSchema.safeParse(rawInput);
                if (parsed.success) {
                    this.latestGenerationResult.executionSummary = parsed.data.summary ?? '';
                }
            },
        });
    }

    private submitRawSearchReportTool(): AgentTool {
        return safeAgentTool({
            description: "Submit tactical summary, discovered_leads, and battlefield_assessment for MindFlow. Call once at the end of the run (submit phase). Describe how you searched in tactical_summary; list paths/leads in discovered_leads.",
            inputSchema: submitRawSearchReportInputSchema,
            execute: async (rawInput: unknown) => {
                const parsed = submitRawSearchReportInputSchema.safeParse(rawInput);
                if (!parsed.success) return;
                const data = parsed.data;
                this.latestGenerationResult.rawSearchReport = {
                    tactical_summary: data.tactical_summary ?? '',
                    discovered_leads: Array.isArray(data.discovered_leads) ? data.discovered_leads : [],
                    battlefield_assessment: data.battlefield_assessment,
                };
            },
        });
    }

    private resetLatestGenerationResult(): void {
        this.contentReaderCallsThisRun = 0;
        this.latestGenerationResult = {
            evidencePack: [],
            executionSummary: '',
            rawSearchReport: null,
        };
    }

    public async *manualToolCallHandle(
        variables: RawSearchVariables,
        resultCollector: Record<string, any>
    ): AsyncGenerator<LLMStreamEvent> {
        // Forward search agent output in real-time
        const searchResultChunks: Record<string, any> = {};
        for await (const searchChunk of this.stream(variables)) {
            switch (searchChunk.type) {
                case 'on-step-finish':
                    resultCollector.stepTokenUsage = searchChunk.usage;
                    const res = searchChunk.extra?.result ?? {};
                    searchResultChunks.text = res.text;
                    searchResultChunks.reasoning = res.reasoning;
                    searchResultChunks.evidencePack = res.evidencePack;
                    searchResultChunks.executionSummary = res.executionSummary;
                    searchResultChunks.rawSearchReport = res.rawSearchReport;
                    break;
                default:
                    yield searchChunk;
                    break;
            }
        }
        resultCollector.searchResultChunks = searchResultChunks;
    }

    public async *stream(variables: RawSearchVariables): AsyncGenerator<LLMStreamEvent> {
        this.resetLatestGenerationResult();

        try {
            yield* withRetryStream(
                variables,
                (vars, retryCtx) => this.realStreamInternal(vars, retryCtx),
                {
                    triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT,
                    postStreamRetryCheckFn: () => {
                        const hitMaxFiles = this.contentReaderCallsThisRun >= MAX_CONTENT_READER_PER_RUN;
                        if (hitMaxFiles) {
                            return { shouldRetry: false, retryText: '' };
                        }
                        const hasLeads = (this.latestGenerationResult.rawSearchReport?.discovered_leads?.length ?? 0) > 0;
                        const instruction = typeof variables.prompt === 'string' ? variables.prompt : '';
                        const isReconOnly = RECON_ONLY_INSTRUCTION_PATTERN.test(instruction);
                        if (isReconOnly && hasLeads) {
                            return { shouldRetry: false, retryText: '' };
                        }
                        const previousRunText = convertModelMessagesToText(this.lastRunMessages ?? []);
                        const noReport = !this.latestGenerationResult.rawSearchReport?.tactical_summary;
                        const noEvidence = this.latestGenerationResult.evidencePack.length === 0 && isBlankString(this.latestGenerationResult.executionSummary);
                        const hasZeroResults =
                            this.latestGenerationResult.evidencePack.length === 0 ||
                            (this.latestGenerationResult.executionSummary?.includes?.('ZERO_RESULTS') ?? false);
                        const noLeads = !hasLeads;
                        const zeroResultsNoLeads = hasZeroResults && noLeads;
                        const shouldRetry = noEvidence || noReport || zeroResultsNoLeads;
                        const dimensionSwitchRetry =
                            'This run had zero results and no discovered_leads. You MUST retry with Tactical Expansion: (1) Core term extraction — strip modifiers, use 1–2 core terms only (e.g. indie from "my indie product ideas"). (2) Synonym expansion — try separate short queries (revenue, commercialization, Monetization) or searchMode: vector/hybrid with a phrase. (3) Directory probe — run explore_folder (e.g. root or from Vault Map), then local_search_whole_vault with scopeMode inFolder and folder_path if the tree suggests a candidate. Call submit_evidence_pack, submit_execution_summary, and submit_rawsearch_report with discovered_leads listing what you tried.';
                        const defaultRetry =
                            'You must call submit_evidence_pack, submit_execution_summary, and submit_rawsearch_report (tactical_summary, optional discovered_leads and battlefield_assessment) before submit_final_answer.';
                        const retryText =
                            (zeroResultsNoLeads ? dimensionSwitchRetry : defaultRetry) +
                            `\n\nUse the conversation below as context.\n\nPrevious run:\n${previousRunText}`;
                        return { shouldRetry, retryText };
                    },
                }
            );
        } finally {
            this.lastRunMessages = null;
        }

        this.context.addRawSearchResult(this.latestGenerationResult, { prompt: variables.prompt });
    }

    /**
     * Stream search execution (used internally by thought agent). On retry, appends previous run messages and retry instruction to the prompt.
     */
    public async *realStreamInternal(
        variables: RawSearchVariables,
        retryCtx?: ErrorRetryInfo | RetryContext
    ): AsyncGenerator<LLMStreamEvent> {
        if (!variables.prompt) {
            yield { type: 'error', error: new Error('search prompt is required') };
            return;
        }

        const promptInfo = await this.aiServiceManager.getPromptInfo(PromptId.RawAiSearch);
        const system = await this.aiServiceManager.renderPrompt(
            promptInfo.systemPromptId!,
            await genSystemInfo()
        );
        const errorRetryInfo = buildErrorRetryInfo(retryCtx);
        let userPrompt = await this.aiServiceManager.renderPrompt(PromptId.RawAiSearch, {
            ...variables,
            ...(errorRetryInfo ? { errorRetryInfo } : {}),
        });

        yield buildPromptTraceDebugEvent(StreamTriggerName.SEARCH_INSPECTOR_AGENT, system, userPrompt);

        const result = this.searchAgent.stream({
            system,
            prompt: userPrompt,
        });

        const self = this;

        const stepId = generateUuidWithoutHyphens();
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Deep-diving into the knowledge base...',
            triggerName: StreamTriggerName.SEARCH_INSPECTOR_AGENT,
        };

        const reasoningTextChunks: string[] = [];
        const thoughtTextChunks: string[] = [];
        yield* streamTransform(result.fullStream, StreamTriggerName.SEARCH_INSPECTOR_AGENT, {
            yieldUIStep: {
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                uiEventGenerator: (chunk) => {
                    switch (chunk.type) {
                        case 'tool-call':
                            // use a new step id to trigger a new ui step
                            return buildToolCallUIEvent(chunk, generateUuidWithoutHyphens());
                        case 'finish':
                            return {
                                type: 'ui-step',
                                uiType: UIStepType.STEPS_DISPLAY,
                                stepId,
                                title: 'Deep-dive into the knowledge base... Finished!',
                                description: 'Deep-dive into the knowledge base finished!',
                            };
                    }
                },
            },
            chunkEventInterceptor: (chunk) => {
                switch (chunk.type) {
                    case 'text-delta':
                        thoughtTextChunks.push(chunk.text);
                        break;
                    case 'reasoning-delta':
                        reasoningTextChunks.push(chunk.text);
                        break;
                    case 'tool-result':
                        self.registerVerifiedPathsFromToolOutput?.(chunk.toolName, chunk.output);
                        break;
                }
            },
            yieldEventPostProcessor: (chunk) => {
                switch (chunk.type) {
                    case 'finish':
                        return {
                            extra: {
                                result: {
                                    text: thoughtTextChunks.join('').trim(),
                                    reasoning: reasoningTextChunks.join('').trim(),
                                    evidencePack: self.latestGenerationResult.evidencePack,
                                    executionSummary: self.latestGenerationResult.executionSummary,
                                    rawSearchReport: self.latestGenerationResult.rawSearchReport,
                                },
                            }
                        };
                    default:
                        return {};
                }
            },
            yieldExtraAfterEvent: (chunk) => {
                switch (chunk.type) {
                    case 'text-start':
                        return {
                            type: 'ui-step',
                            uiType: UIStepType.STEPS_DISPLAY,
                            stepId,
                            title: 'Deep-diving into the knowledge base... Thinking...',
                            description: 'Thinking about the request...',
                        };
                    case 'reasoning-start':
                        return {
                            type: 'ui-step',
                            uiType: UIStepType.STEPS_DISPLAY,
                            stepId,
                            title: 'Deep-diving into the knowledge base... Reasoning...',
                            description: 'Reasoning about the request...',
                        };
                }
            },
        });
    }

    /**
     * Register paths from tool outputs as verified (for sources fallback and evidence hint).
     * Unwraps safeAgentTool { result } and hybrid { data }, then extracts paths from known shapes.
     */
    private registerVerifiedPathsFromToolOutput(toolName: string, output: any): void {
        if (!output) return;

        try {
            // Unwrap: safeAgentTool returns { result, durationMs }; hybrid returns { data, template }
            let data = output?.result ?? output;
            if (output?.data != null) data = output.data;

            const addPath = (path: string) => {
                this.context.appendVerifiedPaths(path.trim());
            };

            // results[] (local_search_whole_vault, etc.)
            if (data?.results && Array.isArray(data.results)) {
                for (const item of data.results) {
                    if (item.path) addPath(item.path);
                }
            }
            // levels[].documentNodes (graph_traversal)
            if (data?.levels && Array.isArray(data.levels)) {
                for (const level of data.levels) {
                    if (level.documentNodes && Array.isArray(level.documentNodes)) {
                        for (const node of level.documentNodes) {
                            const attrs = typeof node.attributes === 'string'
                                ? (() => { try { return JSON.parse(node.attributes); } catch { return null; } })()
                                : node.attributes;
                            if (attrs?.path) addPath(attrs.path);
                            if (node.path) addPath(node.path);
                        }
                    }
                }
            }
            // graph.nodes[] (graph_traversal structured)
            if (data?.graph?.nodes && Array.isArray(data.graph.nodes)) {
                for (const node of data.graph.nodes) {
                    if (node.path) addPath(node.path);
                    const attrs = typeof node.attributes === 'string'
                        ? (() => { try { return JSON.parse(node.attributes); } catch { return null; } })()
                        : node.attributes;
                    if (attrs?.path) addPath(attrs.path);
                }
            }
            // inspect_note_context: note_path + clusters with documentNodes
            if (toolName === 'inspect_note_context' && data?.note_path) addPath(data.note_path);
            for (const key of ['incoming', 'outgoing', 'semanticNeighbors']) {
                const cluster = data?.[key];
                if (cluster?.documentNodes && Array.isArray(cluster.documentNodes)) {
                    for (const node of cluster.documentNodes) {
                        const attrs = typeof node.attributes === 'string'
                            ? (() => { try { return JSON.parse(node.attributes); } catch { return null; } })()
                            : node.attributes;
                        if (attrs?.path) addPath(attrs.path);
                        if (node.path) addPath(node.path);
                    }
                }
            }
            // content_reader
            if (toolName === 'content_reader' && data?.path) addPath(data.path);
            // find_path: start/end note path + paths[].pathString (e.g. "[[path1]] -> [[path2]]")
            if (toolName === 'find_path') {
                if (data?.start_note_path) addPath(data.start_note_path);
                if (data?.end_note_path) addPath(data.end_note_path);
                if (data?.paths && Array.isArray(data.paths)) {
                    for (const p of data.paths) {
                        const pathString = p?.pathString;
                        if (typeof pathString === 'string') {
                            for (const m of pathString.matchAll(/\[\[([^\]]*)\]\]/g)) {
                                if (m[1]) addPath(m[1]);
                            }
                        }
                    }
                }
            }
            // recent_changes (items[].path) / search_by_dimensions (items[].attributes.path): items with path
            if (data?.items && Array.isArray(data.items)) {
                for (const item of data.items) {
                    if (item.path)
                        addPath(item.path);
                    // search_by_dimensions: graph node attributes with path
                    if (item.attributes) {
                        const attrs = typeof item.attributes === 'string'
                            ? (() => { try { return JSON.parse(item.attributes); } catch { return null; } })()
                            : item.attributes;
                        if (attrs?.path)
                            addPath(attrs.path);
                    }
                }
            }
        } catch (error) {
            console.warn(`[AISearchAgent] Error extracting paths from tool output: ${error}`);
        }
    }
}

/** Shared with DocSimpleAgent for tool-call UI events. */
export function buildToolCallUIEvent(chunk: any, stepId: string): RawUIStreamEvent | undefined {
    const toolName = chunk.toolName;
    if (!toolName) return undefined;
    const input = chunk.input ?? {};
    let fileName = '';
    switch (toolName) {
        case 'content_reader':
            fileName = getFileNameFromPath(input.path);
            const ifQuery = input.query ? `Query: ${input.query}` : '';
            const ifRange = input.lineRange ? `Range: ${input.lineRange.start}-${input.lineRange.end}` : '';
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Read File. ${input.mode} read. ${fileName}. ${ifQuery} ${ifRange}`,
                description: JSON.stringify(input),
            };
        case 'inspect_note_context':
            fileName = getFileNameFromPath(input.note_path);
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Inspect Note Context. ${fileName}.`,
                description: JSON.stringify(input),
            };
        case 'graph_traversal':
            fileName = getFileNameFromPath(input.start_note_path);
            const ifHops = input.hops ? `Hops: ${input.hops}` : '';
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Explore Graph. ${fileName}. ${ifHops}`,
                description: JSON.stringify(input),
            };
        case 'find_path':
            fileName = getFileNameFromPath(input.start_note_path);
            const endFileName = getFileNameFromPath(input.end_note_path);
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Find Path. ${fileName} -> ${endFileName}.`,
                description: JSON.stringify(input),
            };
        case 'find_key_nodes':
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Find Key Nodes in vault.`,
                description: JSON.stringify(input),
            };
        case 'find_orphans':
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Find Orphans in vault.`,
                description: JSON.stringify(input),
            };
        case 'search_by_dimensions':
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Search by Dimensions. ${input.boolean_expression}.`,
                description: JSON.stringify(input),
            };
        case 'explore_folder':
            fileName = getFileNameFromPath(input.folder_path ?? input.folderPath ?? '');
            const ifRecursive = input.recursive ? `Recursive: true` : `Recursive: false`;
            const ifMaxDepth = input.max_depth ? `Max Depth: ${input.max_depth}` : '';
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Explore Folder. ${fileName}. ${ifRecursive} ${ifMaxDepth}`,
                description: JSON.stringify(input),
            };
        case 'recent_changes_whole_vault':
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Search recent Changes Whole Vault.`,
                description: JSON.stringify(input),
            };
        case 'local_search_whole_vault':
            const ifSearchQuery = input.query ? `Query: ${input.query}` : '';
            const ifScopeMode = input.scopeMode ? `Scope Mode: ${input.scopeMode}` : '';
            return {
                type: 'ui-step',
                uiType: UIStepType.STEPS_DISPLAY,
                stepId,
                title: `Local Search Whole Vault. ${ifSearchQuery}. ${ifScopeMode}.`,
                description: JSON.stringify(input),
            };
        case 'submit_evidence_pack':
        case 'submit_final_answer':
        default:
            return undefined;
    }
}
