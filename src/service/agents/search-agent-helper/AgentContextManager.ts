import { LLMUsage, mergeTokenUsage } from "@/core/providers/types";
import { refreshableMemoizeSupplier, Supplier } from "@/core/utils/functions";
import { AIServiceManager } from "@/service/chat/service-manager";
import {
    getAnalysisMessageByIndexInputSchema,
    searchMemoryStoreInputSchema,
} from "@/core/schemas/tools/searchMemoryStore";
import { SearchAgentResult } from "../AISearchAgent";
import { AgentTool, safeAgentTool } from "@/service/tools/types";
import type {
    DimensionChoice,
    EvidenceTaskGroup,
    EvidencePack,
} from "@/core/schemas/agents/search-agent-schemas";

/** Serializable snapshot of search memory for debug (window.__peakSearchDebug). */
export interface SearchMemoryDebugSnapshot {
    initialPromptPreview: string;
    totalTokenUsage: LLMUsage;
    agentResult: {
        title: string;
        summaryLength: number;
        topicsCount: number;
        sourcesCount: number;
        dashboardBlocksCount: number;
        suggestedFollowUpQuestionsCount: number;
    };
    verifiedPaths: string[];
    dossier: {
        verifiedPathsCount: number;
        sourcePathsSample: string[];
    };
    /** Recall pipeline: dimensions (after classify), evidenceGroups (after recon), evidencePacks (final). */
    recallPipeline?: {
        dimensionsCount: number;
        evidenceGroupsCount: number;
        evidencePacksCount: number;
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

    /** Initial prompt. */
    private initialPrompt: string = '';

    /** Verified paths (exist in vault/DB or appeared in tool outputs). */
    private verifiedPaths: Set<string> = new Set();

    /** Recall pipeline snapshot: dimensions after classify, then evidenceGroups after recon, then final evidencePacks. */
    private recallDimensions: DimensionChoice[] = [];
    private recallEvidenceTaskGroups: EvidenceTaskGroup[] = [];
    private recallEvidencePacks: EvidencePack[] = [];

    /** Agent result. */
    private totalTokenUsage: LLMUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    private agentResult: SearchAgentResult;

    constructor(
        private readonly aiServiceManager: AIServiceManager,
    ) {
        this.agentResult = {
            title: '',
            summary: '',
            topics: [],
            sources: [],
            dashboardBlocks: [],
            suggestedFollowUpQuestions: [],
        };
    }

    public resetAgentMemory(initialPrompt: string): void {
        this.initialPrompt = initialPrompt ?? '';
        this.totalTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
        this.agentResult = {
            title: '',
            summary: '',
            topics: [],
            sources: [],
            dashboardBlocks: [],
            suggestedFollowUpQuestions: [],
        };
        this.verifiedPaths.clear();
        this.recallDimensions = [];
        this.recallEvidenceTaskGroups = [];
        this.recallEvidencePacks = [];
    }

    /** Set dimensions extracted after classify (for recall pipeline snapshot). */
    public setRecallDimensions(dimensions: DimensionChoice[]): void {
        this.recallDimensions = dimensions ?? [];
    }

    /** Set evidence groups after recon + grouping (for recall pipeline snapshot). */
    public setRecallEvidenceTaskGroups(groups: EvidenceTaskGroup[]): void {
        this.recallEvidenceTaskGroups = groups ?? [];
    }

    /** Set final evidence packs after evidence phase (for recall pipeline snapshot). */
    public setRecallEvidencePacks(packs: EvidencePack[]): void {
        this.recallEvidencePacks = packs ?? [];
    }

    public getRecallDimensions(): DimensionChoice[] {
        return this.recallDimensions;
    }

    public getRecallEvidenceTaskGroups(): EvidenceTaskGroup[] {
        return this.recallEvidenceTaskGroups;
    }

    public getRecallEvidencePacks(): EvidencePack[] {
        return this.recallEvidencePacks;
    }

    public accumulateTokenUsage(usage?: LLMUsage): void {
        if (!usage) return;
        this.totalTokenUsage = mergeTokenUsage(this.totalTokenUsage, usage);
    }

    public getTotalTokenUsage(): LLMUsage {
        return this.totalTokenUsage;
    }

    public getInitialPrompt(): string {
        return this.initialPrompt ?? '';
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

    /**
     * Serializable snapshot of current search memory for debug (e.g. window.__peakSearchDebug.getSnapshot()).
     */
    public getDebugSnapshot(): SearchMemoryDebugSnapshot {
        const res = this.agentResult;
        const maxPromptPreview = 300;
        const paths = Array.from(this.verifiedPaths);
        return {
            initialPromptPreview: (this.initialPrompt ?? '').slice(0, maxPromptPreview),
            totalTokenUsage: this.totalTokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            agentResult: {
                title: res?.title ?? '',
                summaryLength: (res?.summary ?? '').length,
                topicsCount: (res?.topics ?? []).length,
                sourcesCount: (res?.sources ?? []).length,
                dashboardBlocksCount: (res?.dashboardBlocks ?? []).length,
                suggestedFollowUpQuestionsCount: (res?.suggestedFollowUpQuestions ?? []).length,
            },
            verifiedPaths: paths,
            dossier: {
                verifiedPathsCount: paths.length,
                sourcePathsSample: paths.slice(0, 30),
            },
            recallPipeline:
                this.recallDimensions.length > 0 ||
                    this.recallEvidenceTaskGroups.length > 0 ||
                    this.recallEvidencePacks.length > 0
                    ? {
                        dimensionsCount: this.recallDimensions.length,
                        evidenceGroupsCount: this.recallEvidenceTaskGroups.length,
                        evidencePacksCount: this.recallEvidencePacks.length,
                    }
                    : undefined,
        };
    }

    /**
     * Returns structured data for SummaryAgent/Dashboard: verified fact sheet, source map, confirmed facts, gaps.
     * Uses recallEvidencePacks when present; otherwise verifiedPaths only.
     */
    public getDossierForSummary(): {
        verifiedFactSheet: string;
        sourceMap: string;
        lastDecision: string;
        confirmedFacts: string[];
        gaps: string[];
    } {
        const packs = this.recallEvidencePacks;
        if (packs.length > 0) {
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
                    const text = this.initialPrompt ?? '';
                    return { content: text || '(empty message).' };
                },
            }),
        }
    }

    /** Full memory as single text (initial prompt only; no legacy runs). */
    private fullMemoryTextSupplier: Supplier<string> = refreshableMemoizeSupplier<string, number>(
        () => {
            const prompt = this.initialPrompt ?? '';
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