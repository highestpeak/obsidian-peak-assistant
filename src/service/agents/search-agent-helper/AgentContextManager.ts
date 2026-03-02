import { generateToolCallId } from "@/core/providers/adapter/ai-sdk-adapter";
import { convertMessagesToText } from "@/core/providers/adapter/ai-sdk-adapter";
import { buildLLMRequestMessage } from "@/core/providers/helpers/message-helper";
import { LLMRequestMessage, LLMUsage, mergeTokenUsage } from "@/core/providers/types";
import { refreshableMemoizeSupplier, Supplier } from "@/core/utils/functions";
import { AIServiceManager } from "@/service/chat/service-manager";
import type { RawSearchInfoForMindFlowInput, MindflowProgress, MindFlowResult } from "./MindFlowAgent";
import {
    getAnalysisMessageByIndexInputSchema,
    searchMemoryStoreInputSchema,
} from "@/core/schemas/tools/searchMemoryStore";
import { SearchAgentResult } from "../AISearchAgent";
import { AgentTool, safeAgentTool } from "@/service/tools/types";
import {
    type InternalDossier,
    type EvidencePack,
    type RawSearchRun,
    type DossierSourceEntry,
    DEFAULT_RECENT_ROUNDS_KEEP,
    DOSSIER_FACTS_COMPRESS_THRESHOLD,
} from "./dossier-types";
import { RawSearchAgentGenerationResult } from "./RawSearchAgent";
import { ifStringNoBlankThenConcat, isBlankString } from "@/core/utils/common-utils";
import type { KnowledgePanel } from "@/core/schemas/agents/search-agent-schemas";

/** Session-only state (summary, usage, mindflow, last thought). Dossier is the single source of truth for chain/facts/sources/rawLogs. */
interface SessionState {
    initialPrompt: string;
    lastSummaryIndex: number;
    totalTokenUsage: LLMUsage;
    mindflowContext?: MindFlowResult[];
}

/** Serializable snapshot of search memory for debug (window.__peakSearchDebug). */
export interface SearchMemoryDebugSnapshot {
    sessionState: {
        initialPromptPreview: string;
        lastSummaryIndex: number;
        totalTokenUsage: LLMUsage;
        mindflowContextLength: number;
    };
    agentResult: {
        title: string;
        summaryLength: number;
        topicsCount: number;
        sourcesCount: number;
        dashboardBlocksCount: number;
        suggestedFollowUpQuestionsCount: number;
    };
    verifiedPaths: string[];
    emittedSourcePaths: string[];
    dossier: {
        rawSearchRunsCount: number;
        factsCount: number;
        sourcesCount: number;
        rawSearchExecutionSummaryLength: number;
        sourcePathsSample: string[];
    };
}

/** Serializable state for replay / "from round X" testing. Use getReplayState() and restoreReplayState(). */
export interface ReplayState {
    sessionState: {
        initialPrompt: string;
        lastSummaryIndex: number;
        totalTokenUsage: LLMUsage;
        mindflowContext?: MindFlowResult[];
    };
    dossier: {
        rawSearchRuns: RawSearchRun[];
        /** Serialized as [path_or_url, EvidencePack[]][] for JSON. */
        factsArray: [string, EvidencePack[]][];
        rawSearchExecutionSummary: string[];
        sources: DossierSourceEntry[];
    };
    verifiedPaths: string[];
    emittedSourcePaths: string[];
}

const DEFAULT_GREP_MAX_MATCHES = 50;

export type AgentMemoryToolSet = {
    search_analysis_context: AgentTool;
    get_analysis_message_by_index: AgentTool;
}

function escapeRegExpLiteral(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAutoRegex(query: string, caseSensitive: boolean): { regex: RegExp; isLiteralFallback: boolean } {
    const flags = caseSensitive ? 'g' : 'gi';
    try {
        return { regex: new RegExp(query, flags), isLiteralFallback: false };
    } catch {
        return { regex: new RegExp(escapeRegExpLiteral(query), flags), isLiteralFallback: true };
    }
}

/**
 * Manages agent memory and session summarization.
 * Uses getModelForPrompt(AiAnalysisSessionSummary) for summarization model.
 */
export class AgentContextManager {

    private sessionState: SessionState;

    /**
    * Agent result
    */
    private agentResult: SearchAgentResult;

    /**
     * Set of verified paths (paths that exist in vault/DB or appeared in tool outputs)
     */
    private verifiedPaths: Set<string> = new Set();
    /** 
     * Paths already emitted as incremental source + graph node during this run (streaming write). 
     * */
    private emittedSourcePaths: Set<string> = new Set();

    /** InternalDossier: Map / Chain / Facts / Sources / RawLogs. Single source of truth for research flow. */
    private dossier: InternalDossier = this.createEmptyDossier();

    /** Recent Knowledge Panel versions (max 5). Used by MindFlow for audit and by finish agents. */
    private knowledgePanels: KnowledgePanel[] = [];
    private static readonly MAX_KNOWLEDGE_PANELS = 5;

    private createEmptyDossier(): InternalDossier {
        return {
            rawSearchRuns: [],
            facts: new Map(),
            rawSearchExecutionSummary: [],
            sources: [],
        };
    }

    /** RawSearch runs (one per stream). */
    private getRuns(): RawSearchRun[] {
        return this.dossier.rawSearchRuns ?? [];
    }

    /** Flatten facts map to array (for summary, compress, and callers that need iteration). */
    public getFactsList(): EvidencePack[] {
        const out: EvidencePack[] = [];
        for (const arr of this.dossier.facts.values()) {
            out.push(...arr);
        }
        return out;
    }

    /** Claim list only (for RawSearch to avoid duplicate facts). No quotes or snippets. */
    public getExistingFactClaimsForRawSearch(): string[] {
        return this.getFactsList().flatMap((pack) => pack.facts.map((f) => f.claim));
    }

    constructor(
        private readonly aiServiceManager: AIServiceManager,
    ) {
    }

    public resetAgentMemory(initialPrompt: string): void {
        this.sessionState = {
            initialPrompt,
            lastSummaryIndex: 0,
            totalTokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            mindflowContext: undefined,
        };
        this.agentResult = {
            title: '',
            summary: '',
            topics: [],
            sources: [],
            dashboardBlocks: [],
            suggestedFollowUpQuestions: [],
        };
        this.verifiedPaths.clear();
        this.emittedSourcePaths.clear();
        this.dossier = this.createEmptyDossier();
        this.knowledgePanels = [];
    }

    public getSessionState(): SessionState {
        return this.sessionState;
    }

    public addMindFlowResult(result: MindFlowResult): void {
        if (!this.sessionState.mindflowContext) {
            this.sessionState.mindflowContext = [];
        }
        this.sessionState.mindflowContext.push(result);
    }

    /** Get the latest mindflow progress (for decision logic). */
    public getLatestMindflowProgress(): MindflowProgress | undefined {
        if (!this.sessionState.mindflowContext || this.sessionState.mindflowContext.length === 0) {
            return undefined;
        }
        return this.sessionState.mindflowContext[this.sessionState.mindflowContext.length - 1]?.progress;
    }

    /** MindFlow trajectory for search_analysis_context / search history. */
    public getMindflowProgressHistory(): MindflowProgress[] {
        return this.sessionState.mindflowContext?.flatMap((m) => (m.progress ? [m.progress] : [])) ?? [];
    }

    public getLatestMindflowMermaid(): string | undefined {
        if (!this.sessionState.mindflowContext || this.sessionState.mindflowContext.length === 0) {
            return undefined;
        }
        return this.sessionState.mindflowContext[this.sessionState.mindflowContext.length - 1]?.mermaid;
    }

    /**
     * format eg:
     * ...
     * Status Label: In Progress
     * Confirmed Facts: Fact 1, Fact 2
     * 
     * Status Label: In Progress
     * Confirmed Facts: Fact 3, Fact 4
     * 
     * Status Label: In Progress
     * Confirmed Facts: Fact 5, Fact 6
     * ...
     */
    public getLatestMindflowProgressHistory(): string[] | undefined {
        if (!this.sessionState.mindflowContext || this.sessionState.mindflowContext.length === 0) {
            return undefined;
        }
        return this.sessionState.mindflowContext?.flatMap(m => m.progress)
            .filter(p => p !== undefined)
            .map(p =>
                ifStringNoBlankThenConcat({ prefix: 'Status Label: ', value: p.statusLabel })
                + ifStringNoBlankThenConcat({ prefix: 'Confirmed Facts: ', value: p.confirmed_facts })
                + '\n'
            );
    }

    /**
     * stepFromLast = 1: latest RawSearch run, 2: 2nd latest, ...
     */
    public getRawSearchInfoForMindFlowInput(stepFromLast: number): RawSearchInfoForMindFlowInput | undefined {
        const runs = this.getRuns();
        if (runs.length === 0 || stepFromLast < 1 || stepFromLast > runs.length) {
            return undefined;
        }
        const run = runs[runs.length - stepFromLast];
        return {
            latestLoopDelta: this.getRawSearchLoopDelta(run),
            latestLoopRawSearchExecutionSummarys: [run.executionSummary],
            latestLoopRawSearchEvidenceFoundStatisticsInfo: JSON.stringify({
                evidencePackCount: run.evidencePackCount,
                factCount: run.factCount,
            }),
        };
    }

    private getRawSearchLoopDelta(run?: RawSearchRun): string | undefined {
        if (!run) return undefined;
        const report = run.rawSearchReport;
        const tactical = report?.tactical_summary ?? '';
        const leadsStr = Array.isArray(report?.discovered_leads) && report.discovered_leads.length > 0
            ? report.discovered_leads.join(', ')
            : '';
        const suggestion = report?.battlefield_assessment?.suggestion ?? '';
        const deltaText =
            ifStringNoBlankThenConcat({ prefix: 'Tactical Summary: ', value: tactical }) +
            ifStringNoBlankThenConcat({ prefix: 'Discovered Leads: ', value: leadsStr }) +
            ifStringNoBlankThenConcat({ prefix: 'Suggestion: ', value: suggestion }) +
            ifStringNoBlankThenConcat({ prefix: 'Execution Summary: ', value: run.executionSummary }) +
            ifStringNoBlankThenConcat({ prefix: 'Evidence Stats: ', value: `packs=${run.evidencePackCount} facts=${run.factCount}` });
        return isBlankString(deltaText) ? undefined : `RawSearch Last Loop Delta: ${deltaText}`;
    }

    public addRawSearchResult(result: RawSearchAgentGenerationResult, options?: { prompt?: string }): void {
        const runs = this.dossier.rawSearchRuns ?? (this.dossier.rawSearchRuns = []);
        const executionSummary = (result.executionSummary ?? '').trim();
        const evidencePackCount = result.evidencePack?.length ?? 0;
        const factCount = result.evidencePack?.reduce((acc, p) => acc + (p.facts?.length ?? 0), 0) ?? 0;
        runs.push({
            prompt: options?.prompt,
            executionSummary: executionSummary || '(no summary)',
            rawSearchReport: result.rawSearchReport ?? null,
            evidencePackCount,
            factCount,
        });
        if (executionSummary) this.dossier.rawSearchExecutionSummary.push(result.executionSummary);
        if (result.evidencePack?.length) this.appendDossierFacts(result.evidencePack);
    }

    /** Push a new Knowledge Panel from KnowledgeAgent; keep last N only. */
    public addKnowledgePanel(panel: KnowledgePanel): void {
        this.knowledgePanels.push(panel);
        if (this.knowledgePanels.length > AgentContextManager.MAX_KNOWLEDGE_PANELS) {
            this.knowledgePanels.shift();
        }
    }

    /** Latest Knowledge Panel (if any). */
    public getLatestKnowledgePanel(): KnowledgePanel | undefined {
        return this.knowledgePanels.length > 0 ? this.knowledgePanels[this.knowledgePanels.length - 1] : undefined;
    }

    /** Formatted Knowledge Panel for MindFlow prompt (truncated). */
    public getKnowledgePanelForMindFlow(maxChars: number = 8000): string {
        const panel = this.getLatestKnowledgePanel();
        if (!panel) return '';
        const parts: string[] = [];
        parts.push(`## Knowledge Panel (stats: facts=${panel.panel_stats.fact_count} packs=${panel.panel_stats.pack_count} sources=${panel.panel_stats.source_count} condensed=${panel.panel_stats.condensed})`);
        for (const c of panel.clusters) {
            parts.push(`### ${c.label} (${c.id})`);
            parts.push(c.summary);
            parts.push(`Paths: ${c.supporting_evidence_paths.join(', ')}`);
            if (c.key_claims?.length) parts.push(`Claims: ${c.key_claims.slice(0, 5).join('; ')}`);
        }
        if (panel.conflicts?.length) {
            parts.push('## Conflicts');
            for (const cf of panel.conflicts) {
                parts.push(`- ${cf.topic}: ${cf.conflicting_claims.join(' vs ')} (${cf.evidence_paths.join(', ')})`);
            }
        }
        if (panel.open_questions?.length) {
            parts.push('## Open questions');
            parts.push(panel.open_questions.slice(0, 10).join('\n'));
        }
        const text = parts.join('\n\n');
        return text.length <= maxChars ? text : text.slice(0, maxChars) + '\n...(truncated)';
    }

    /**
     * Append evidence packs to dossier. Dedup by origin.path_or_url (mark previous superseded).
     * O(1) per path: lookup by path_or_url in Map, no full scan.
     */
    public appendDossierFacts(packs: EvidencePack[]): void {
        for (const pack of packs) {
            const key = pack.origin.path_or_url;
            const arr = this.dossier.facts.get(key) ?? [];
            for (const existing of arr) {
                if (!existing.superseded) existing.superseded = true;
            }
            arr.push({ ...pack });
            this.dossier.facts.set(key, arr);
        }
        const total = this.getFactsList().length;
        if (total > DOSSIER_FACTS_COMPRESS_THRESHOLD) {
            this.compressDossierFacts();
        }
    }

    private compressDossierFacts(): void {
        const facts = this.getFactsList();
        const keep = Math.floor(DOSSIER_FACTS_COMPRESS_THRESHOLD / 2);
        const toCondense = facts.filter((_, i) => i < facts.length - keep && !facts[i]?.superseded);
        if (toCondense.length === 0) return;
        const claimsAndQuotes: string[] = [];
        for (const pack of toCondense) {
            if (pack.superseded) continue;
            for (const f of pack.facts) {
                claimsAndQuotes.push(`- ${f.claim}: "${(f.quote || '').slice(0, 200)}..."`);
            }
            pack.superseded = true;
        }
        const condensed: EvidencePack = {
            origin: { tool: 'condensed', path_or_url: '_condensed' },
            facts: toCondense.flatMap((p) => p.facts).slice(0, 30),
            snippet: { type: 'condensed', content: claimsAndQuotes.join('\n').slice(0, 4000) },
            superseded: false,
        };
        const remaining = facts.filter((p) => !p.superseded);
        const newMap = new Map<string, EvidencePack[]>();
        newMap.set('_condensed', [condensed]);
        for (const p of remaining) {
            const k = p.origin.path_or_url;
            const arr = newMap.get(k) ?? [];
            arr.push(p);
            newMap.set(k, arr);
        }
        this.dossier.facts = newMap;
    }

    public accumulateTokenUsage(usage?: LLMUsage): void {
        if (!usage) {
            return;
        }
        this.sessionState.totalTokenUsage = mergeTokenUsage(this.sessionState.totalTokenUsage, usage);
    }

    public getTotalTokenUsage(): LLMUsage {
        return this.sessionState.totalTokenUsage;
    }

    public getInitialPrompt(): string {
        return this.sessionState?.initialPrompt ?? '';
    }

    public yieldAgentResult(): { extra: { currentResult: SearchAgentResult } } {
        return {
            extra: {
                currentResult: this.agentResult,
            },
        };
    }

    public getAgentResult(): SearchAgentResult {
        return this.agentResult;
    }

    public getVerifiedPaths(): Set<string> {
        return this.verifiedPaths;
    }

    public appendVerifiedPaths(paths: string[] | string): void {
        if (!paths) {
            return;
        }
        const arr = typeof paths === 'string' ? [paths] : paths;
        for (const p of arr) {
            const t = p?.trim();
            if (!t) continue;
            this.verifiedPaths.add(t);
            const isUrl = t.startsWith('http://') || t.startsWith('https://');
            this.appendDossierSources([t], isUrl ? 'url' : 'vault_path');
        }
    }

    /** Append verified sources (vault paths or URLs). */
    private appendDossierSources(pathsOrUrls: string[], kind: 'vault_path' | 'url'): void {
        for (const p of pathsOrUrls) {
            const t = p?.trim();
            if (!t) continue;
            if (!this.dossier.sources.some((s) => s.path_or_url === t)) {
                this.dossier.sources.push({ path_or_url: t, kind });
            }
        }
    }

    public getEmittedSourcePaths(): Set<string> {
        return this.emittedSourcePaths;
    }

    /**
     * Serializable snapshot of current search memory for debug (e.g. window.__peakSearchDebug.getSnapshot()).
     */
    public getDebugSnapshot(): SearchMemoryDebugSnapshot {
        const res = this.agentResult;
        const factsList = this.getFactsList();
        const maxPromptPreview = 300;
        return {
            sessionState: {
                initialPromptPreview: (this.sessionState?.initialPrompt ?? '').slice(0, maxPromptPreview),
                lastSummaryIndex: this.sessionState?.lastSummaryIndex ?? 0,
                totalTokenUsage: this.sessionState?.totalTokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                mindflowContextLength: this.sessionState?.mindflowContext?.length ?? 0,
            },
            agentResult: {
                title: res?.title ?? '',
                summaryLength: (res?.summary ?? '').length,
                topicsCount: (res?.topics ?? []).length,
                sourcesCount: (res?.sources ?? []).length,
                dashboardBlocksCount: (res?.dashboardBlocks ?? []).length,
                suggestedFollowUpQuestionsCount: (res?.suggestedFollowUpQuestions ?? []).length,
            },
            verifiedPaths: Array.from(this.verifiedPaths),
            emittedSourcePaths: Array.from(this.emittedSourcePaths),
            dossier: {
                rawSearchRunsCount: this.dossier.rawSearchRuns?.length ?? 0,
                factsCount: factsList.length,
                sourcesCount: this.dossier.sources?.length ?? 0,
                rawSearchExecutionSummaryLength: this.dossier.rawSearchExecutionSummary?.length ?? 0,
                sourcePathsSample: (this.dossier.sources ?? []).slice(0, 30).map((s) => s.path_or_url),
            },
        };
    }

    /** For dev/replay: return serializable state (e.g. paste in console or pass as initialState). */
    public getReplayState(): ReplayState {
        const factsArray: [string, EvidencePack[]][] = [];
        this.dossier.facts.forEach((arr, key) => factsArray.push([key, arr]));
        return {
            sessionState: {
                initialPrompt: this.sessionState?.initialPrompt ?? '',
                lastSummaryIndex: this.sessionState?.lastSummaryIndex ?? 0,
                totalTokenUsage: this.sessionState?.totalTokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                mindflowContext: this.sessionState?.mindflowContext ? [...this.sessionState.mindflowContext] : undefined,
            },
            dossier: {
                rawSearchRuns: [...(this.dossier.rawSearchRuns ?? [])],
                factsArray,
                rawSearchExecutionSummary: [...(this.dossier.rawSearchExecutionSummary ?? [])],
                sources: [...(this.dossier.sources ?? [])],
            },
            verifiedPaths: Array.from(this.verifiedPaths),
            emittedSourcePaths: Array.from(this.emittedSourcePaths),
        };
    }

    /** Restore state from getReplayState() (e.g. continue from round X). */
    public restoreReplayState(state: ReplayState): void {
        this.sessionState = {
            initialPrompt: state.sessionState.initialPrompt,
            lastSummaryIndex: state.sessionState.lastSummaryIndex,
            totalTokenUsage: state.sessionState.totalTokenUsage,
            mindflowContext: state.sessionState.mindflowContext ? [...state.sessionState.mindflowContext] : undefined,
        };
        this.verifiedPaths = new Set(state.verifiedPaths ?? []);
        this.emittedSourcePaths = new Set(state.emittedSourcePaths ?? []);
        const facts = new Map<string, EvidencePack[]>();
        for (const [key, arr] of state.dossier.factsArray ?? []) {
            facts.set(key, [...arr]);
        }
        this.dossier = {
            rawSearchRuns: [...(state.dossier.rawSearchRuns ?? [])],
            facts,
            rawSearchExecutionSummary: [...(state.dossier.rawSearchExecutionSummary ?? [])],
            sources: [...(state.dossier.sources ?? [])],
        };
    }

    public getDossier(): InternalDossier {
        return this.dossier;
    }

    /**
     * Coverage summary for MindFlow prompt: verified path count, fact count, sample paths.
     * Used to inject "crisis" (low coverage = high risk) and triangulation hints.
     */
    public getCoverageSummaryForMindFlow(): { verifiedPathsCount: number; factCount: number; samplePaths: string[] } {
        const paths = this.getVerifiedPaths();
        const facts = this.getFactsList().filter((p) => !p.superseded);
        const samplePaths = Array.from(paths).slice(0, 15);
        return {
            verifiedPathsCount: paths.size,
            factCount: facts.length,
            samplePaths,
        };
    }

    /**
     * Returns structured data for SummaryAgent/Dashboard: verified fact sheet, source map, last MindFlow decision.
     * Uses sessionState.mindflowContext (getLatestMindflowProgress) for lastDecision, confirmedFacts, gaps.
     */
    public getDossierForSummary(): {
        verifiedFactSheet: string;
        sourceMap: string;
        lastDecision: string;
        confirmedFacts: string[];
        gaps: string[];
    } {
        const progress = this.getLatestMindflowProgress();
        const factLines = this.getFactsList()
            .filter((p) => !p.superseded)
            .flatMap((p) => p.facts.map((f) => `- ${f.claim} (${p.origin.path_or_url}): "${(f.quote || '').slice(0, 150)}..."`));
        const sourceLines = this.dossier.sources.map((s) => s.path_or_url);
        const lastDecision = progress
            ? [progress.decision, progress.instruction, progress.critique].filter(Boolean).join('; ')
            : '';
        return {
            verifiedFactSheet: factLines.join('\n'),
            sourceMap: sourceLines.join('\n'),
            lastDecision,
            confirmedFacts: progress?.confirmed_facts ?? [],
            gaps: progress?.gaps ?? [],
        };
    }

    public getAgentMemoryTool(): AgentMemoryToolSet {
        const self = this;
        return {
            search_analysis_context: safeAgentTool({
                description: 'Search the full analysis session history. Returns search tool results, prior reasoning, and evidence traces. Use REQUIRED before writing blocks—query by user keywords, topic names, file paths from Sources, or product/idea names to retrieve concrete findings.',
                inputSchema: searchMemoryStoreInputSchema,
                execute: async (input) => {
                    const result = self.searchHistory(input.query, { maxChars: input.maxChars });
                    return { content: result };
                },
            }),
            get_analysis_message_by_index: safeAgentTool({
                description: 'Return the full text of one analysis message by 0-based index. valid indices 0 to count-1. Use to fetch a specific step for detailed evidence.',
                inputSchema: getAnalysisMessageByIndexInputSchema,
                execute: async (input) => {
                    const runs = this.getRuns();
                    const count = 1 + runs.length;
                    const index = input.index;
                    if (index < 0 || index >= count) {
                        return {
                            content: `Invalid index ${index}. Valid range is 0 to ${count - 1}. Total messages: ${count}.`,
                        };
                    }
                    const text = this.getAnalysisMessageAt(index);
                    return { content: text || '(empty message).' };
                },
            }),
        }
    }

    /** Text of message at index: 0 = initial prompt, 1+ = round (run prompt + summary + report). */
    private getAnalysisMessageAt(index: number): string {
        if (index === 0) return this.sessionState?.initialPrompt ?? '';
        const runs = this.getRuns();
        const roundIndex = index - 1;
        if (roundIndex < 0 || roundIndex >= runs.length) return '';
        const run = runs[roundIndex]!;
        let text = (run.prompt ?? '').trim();
        if (run.executionSummary) text += (text ? '\n' : '') + 'Result: ' + run.executionSummary;
        if (run.rawSearchReport?.tactical_summary) text += (text ? '\n' : '') + 'Tactical: ' + run.rawSearchReport.tactical_summary;
        if (run.rawSearchReport?.discovered_leads?.length) text += (text ? '\n' : '') + 'Leads: ' + run.rawSearchReport.discovered_leads.join(', ');
        return text;
    }

    /** Full memory as single text (derived from rawSearchRuns). Cached by runs length. */
    private fullMemoryTextSupplier: Supplier<string> = refreshableMemoizeSupplier<string, number>(
        () => {
            const messagesText = convertMessagesToText(this.buildDerivedRecentMessages());
            return `[Recent Messages]\n${messagesText}`;
        },
        () => this.getRuns().length,
        (a, b) => a !== b
    );

    /** Build recent messages from dossier (user + last N RawSearch runs). */
    private buildDerivedRecentMessages(): LLMRequestMessage[] {
        const runs = this.getRuns();
        const messages: LLMRequestMessage[] = [
            buildLLMRequestMessage('user', this.sessionState.initialPrompt ?? ''),
        ];
        const n = Math.min(DEFAULT_RECENT_ROUNDS_KEEP, runs.length);
        if (n === 0) return messages;
        const start = runs.length - n;
        for (let i = 0; i < n; i++) {
            const run = runs[start + i]!;
            const tid = generateToolCallId();
            const value = run.executionSummary + (run.rawSearchReport?.tactical_summary ? '\nTactical: ' + run.rawSearchReport.tactical_summary : '');
            const content: LLMRequestMessage['content'] = [];
            if ((run.prompt ?? '').trim()) content.push({ type: 'text', text: (run.prompt ?? '').trim() });
            content.push(
                { type: 'tool-call' as const, toolCallId: tid, toolName: 'raw_search_run', input: { prompt: run.prompt } },
                { type: 'tool-result' as const, toolCallId: tid, toolName: 'raw_search_run', output: { type: 'text' as const, value } }
            );
            messages.push({ role: 'assistant', content });
        }
        return messages;
    }

    /**
     * Search history messages by query. Uses cached full memory text; grep (RegExp/literal) when query present.
     */
    public searchHistory(query: string, options?: { maxChars?: number }): string {
        const maxChars = options?.maxChars ?? 4000;
        const fullText = this.fullMemoryTextSupplier();
        const q = (query ?? '').trim();
        if (!q) {
            return fullText.slice(0, maxChars);
        }
        const matches = this.grepInMemoryText(fullText, q, { contextLines: 2 });
        const result =
            matches.length > 0
                ? matches.map((m) => `Line ${m.line}:\n${m.text}`).join('\n---\n')
                : fullText.slice(0, maxChars);
        return result.slice(0, maxChars);
    }

    /**
    * Grep over full memory text (content-reader style). Query as RegExp; fallback to literal.
    */
    private grepInMemoryText(
        fullText: string,
        query: string,
        options?: { caseSensitive?: boolean; maxMatches?: number; contextLines?: number }
    ): Array<{ line: number; text: string }> {
        const cap = Math.min(DEFAULT_GREP_MAX_MATCHES, options?.maxMatches ?? DEFAULT_GREP_MAX_MATCHES);
        const contextLines = options?.contextLines ?? 2;
        const { regex } = buildAutoRegex(query, options?.caseSensitive ?? false);
        const lines = fullText.split(/\r?\n/);
        const matches: Array<{ line: number; text: string }> = [];

        for (let i = 0; i < lines.length && matches.length < cap; i++) {
            const lineText = lines[i] ?? '';
            regex.lastIndex = 0;
            let guard = 0;
            let m: RegExpExecArray | null;
            while ((m = regex.exec(lineText)) !== null) {
                const start = Math.max(0, i - contextLines);
                const end = Math.min(lines.length, i + contextLines + 1);
                const context = lines.slice(start, end).join('\n');
                matches.push({ line: i + 1, text: context });
                if (matches.length >= cap) break;
                if (m[0]?.length === 0) {
                    regex.lastIndex = Math.min(lineText.length, regex.lastIndex + 1);
                }
                guard++;
                if (guard > 10_000) break;
            }
        }
        return matches;
    }
}