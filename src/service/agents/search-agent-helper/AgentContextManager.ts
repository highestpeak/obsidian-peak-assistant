import { LLMUsage, mergeTokenUsage } from "@/core/providers/types";
import { refreshableMemoizeSupplier, Supplier } from "@/core/utils/functions";
import { AIServiceManager } from "@/service/chat/service-manager";
import {
    getAnalysisMessageByIndexInputSchema,
    searchMemoryStoreInputSchema,
} from "@/core/schemas/tools/searchMemoryStore";
import { SearchAgentResult } from "../AISearchAgent";
import { AgentTool, safeAgentTool } from "@/service/tools/types";
import type { AllDimensionId, EvidencePack, RawSearchReport } from "@/core/schemas/agents/search-agent-schemas";

/** Session-only state (prompt, usage). */
interface SessionState {
    initialPrompt: string;
    totalTokenUsage: LLMUsage;
}

/** Stored entry: EvidencePack + optional superseded flag (same path added again). */
interface DimensionEvidenceEntry {
    pack: EvidencePack;
    superseded?: boolean;
}

/** Full report per run; discovered_leads kept for consolidator and dedup. */
export type RawSearchRunReportEntry = RawSearchReport & {
    runId: string;
    runMode: 'initial' | 'recon' | 'evidence';
    dimension: AllDimensionId;
};

/** Serializable snapshot of search memory for debug (window.__peakSearchDebug). */
export interface SearchMemoryDebugSnapshot {
    sessionState: {
        initialPromptPreview: string;
        totalTokenUsage: LLMUsage;
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
        verifiedPathsCount: number;
        sourcePathsSample: string[];
    };
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

    /** Dimension evidence: dimension id -> entries (pack + superseded). getDossierForSummary reads from here. */
    private byDimensions = new Map<AllDimensionId, DimensionEvidenceEntry[]>();

    /** Raw search runs: appended report entries (no discovered_leads). */
    private rawSearchRunReports: RawSearchRunReportEntry[] = [];

    constructor(
        private readonly aiServiceManager: AIServiceManager,
    ) {
    }

    public resetAgentMemory(initialPrompt: string): void {
        this.sessionState = {
            initialPrompt,
            totalTokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
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
        this.byDimensions.clear();
        this.rawSearchRunReports = [];
    }

    /** Append raw search (recon) report; full report kept for consolidator/dedup. */
    public setRawSearchRunReport(
        runId: string,
        runMode: RawSearchRunReportEntry['runMode'],
        dimensionId: AllDimensionId,
        report: RawSearchReport
    ): void {
        this.rawSearchRunReports.push({ ...report, runId, runMode, dimension: dimensionId });
    }

    public getRawSearchRunReports(): RawSearchRunReportEntry[] {
        return this.rawSearchRunReports;
    }

    /** Append evidence packs for a dimension (slot pipeline). Same path in same dimension marks previous as superseded. */
    public appendDimensionPacks(dimensionId: AllDimensionId, packs: EvidencePack[]): void {
        for (const pack of packs) {
            const arr = this.byDimensions.get(dimensionId) ?? [];
            const key = pack.origin.path_or_url;
            for (const existing of arr) {
                if (existing.pack.origin.path_or_url === key) existing.superseded = true;
            }
            arr.push({ pack, superseded: false });
            this.byDimensions.set(dimensionId, arr);
        }
    }

    /** Get non-superseded packs for a dimension, or all dimensions if dimensionId omitted. */
    public getDimensionPacks(dimensionId?: AllDimensionId): (EvidencePack & { dimensionId: AllDimensionId })[] {
        if (dimensionId != null) {
            return (this.byDimensions.get(dimensionId) ?? [])
                .filter((e) => !e.superseded)
                .map((e) => ({ ...e.pack, dimensionId }));
        }
        const out: (EvidencePack & { dimensionId: AllDimensionId })[] = [];
        for (const did of this.byDimensions.keys()) {
            out.push(
                ...this.getDimensionPacks(did)
                    .map((p) => ({ ...p, dimensionId: did }))
            );
        }
        return out;
    }

    public getSessionState(): SessionState {
        return this.sessionState;
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
        if (!paths) return;
        const arr = typeof paths === 'string' ? [paths] : paths;
        for (const p of arr) {
            const t = p?.trim();
            if (t) this.verifiedPaths.add(t);
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
        const maxPromptPreview = 300;
        const paths = Array.from(this.verifiedPaths);
        return {
            sessionState: {
                initialPromptPreview: (this.sessionState?.initialPrompt ?? '').slice(0, maxPromptPreview),
                totalTokenUsage: this.sessionState?.totalTokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            },
            agentResult: {
                title: res?.title ?? '',
                summaryLength: (res?.summary ?? '').length,
                topicsCount: (res?.topics ?? []).length,
                sourcesCount: (res?.sources ?? []).length,
                dashboardBlocksCount: (res?.dashboardBlocks ?? []).length,
                suggestedFollowUpQuestionsCount: (res?.suggestedFollowUpQuestions ?? []).length,
            },
            verifiedPaths: paths,
            emittedSourcePaths: Array.from(this.emittedSourcePaths),
            dossier: {
                verifiedPathsCount: paths.length,
                sourcePathsSample: paths.slice(0, 30),
            },
        };
    }

    /**
     * Returns structured data for SummaryAgent/Dashboard: verified fact sheet, source map, confirmed facts, gaps.
     * When slot pipeline has run (bySlot has data), reads from slot atoms; otherwise from verifiedPaths only.
     */
    public getDossierForSummary(): {
        verifiedFactSheet: string;
        sourceMap: string;
        lastDecision: string;
        confirmedFacts: string[];
        gaps: string[];
    } {
        if (this.byDimensions.size > 0) {
            const packs = this.getDimensionPacks();
            const verifiedFactSheet = packs
                .map((p) => {
                    const claim = p.summary ?? p.facts[0]?.claim ?? '';
                    const quote = (p.facts[0]?.quote ?? p.snippet?.content ?? '').slice(0, 200);
                    return `- ${claim} (${p.origin.path_or_url}): "${quote}..."`;
                })
                .join('\n');
            const sourceMap = [...new Set(packs.map((p) => p.origin.path_or_url).filter(Boolean))].join('\n');
            const confirmedFacts = packs.map((p) => p.summary ?? p.facts[0]?.claim ?? '').filter(Boolean);
            return {
                verifiedFactSheet,
                sourceMap,
                lastDecision: '',
                confirmedFacts,
                gaps: [],
            };
        }
        const sourceMap = Array.from(this.verifiedPaths).join('\n');
        return {
            verifiedFactSheet: '',
            sourceMap,
            lastDecision: '',
            confirmedFacts: [],
            gaps: [],
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
                description: 'Return the full text of one analysis message by 0-based index. Index 0 = initial user prompt; valid range 0 to 0.',
                inputSchema: getAnalysisMessageByIndexInputSchema,
                execute: async (input) => {
                    const index = input.index;
                    if (index !== 0) {
                        return { content: `Invalid index ${index}. Valid range is 0 to 0 (initial prompt only).` };
                    }
                    const text = this.sessionState?.initialPrompt ?? '';
                    return { content: text || '(empty message).' };
                },
            }),
        }
    }

    /** Full memory as single text (initial prompt only; no legacy runs). */
    private fullMemoryTextSupplier: Supplier<string> = refreshableMemoizeSupplier<string, number>(
        () => {
            const prompt = this.sessionState?.initialPrompt ?? '';
            return `[User]\n${prompt}`;
        },
        () => this.verifiedPaths.size,
        (a, b) => a !== b
    );

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