import { AppContext } from "@/app/context/AppContext";
import { DEFAULT_SEARCH_SETTINGS } from "@/app/settings/types";
import { generateToolCallId } from "@/core/providers/adapter/ai-sdk-adapter";
import { convertMessagesToText } from "@/core/providers/adapter/ai-sdk-adapter";
import { buildLLMRequestMessage, concatLLMRequestMessages } from "@/core/providers/helpers/message-helper";
import { LLMRequestMessage, LLMStreamEvent, LLMUsage, mergeTokenUsage, OneGenerationContext, StreamTriggerName, ToolEvent, UIStepType } from "@/core/providers/types";
import { refreshableMemoizeSupplier, Supplier } from "@/core/utils/functions";
import { generateUuidWithoutHyphens } from "@/core/utils/id-utils";
import { AIServiceManager } from "@/service/chat/service-manager";
import { PromptId } from "@/service/prompt/PromptId";
import type { MindflowProgress } from "./MindFlowAgent";
import { AgentTemplateId } from "@/core/template/TemplateRegistry";
import {
	getAnalysisMessageByIndexInputSchema,
	searchMemoryStoreInputSchema,
} from "@/core/schemas/tools/searchMemoryStore";
import { SearchAgentResult } from "../AISearchAgent";
import { AgentTool, safeAgentTool } from "@/service/tools/types";

/**
 * Context from MindFlowAgent available to ThoughtAgent.
 * Contains thinking progress history, self-critique, and decision signals.
 */
export interface MindflowContext {
    /** All progress snapshots; latest is used for prompt. */
    progressHistory?: MindflowProgress[];
    traces?: string[];
    lastMermaid?: string;
}

export interface AgentMemory {
    /**
     * the original prompt from user
     */
    initialPrompt: string;
    /**
     * all messages in the session
     * messages includes tool calls and results.
     * actually. these will include the discovered_key_nodes, rejected_nodes, etc. so we don't need to store them separately.
     */
    historyMessages: LLMRequestMessage[];
    /**
     * summary of the session for 0~n messages due to the context window of the model
     */
    sessionSummary: string;
    /**
     * index of the last summary
     */
    lastSummaryIndex: number;
    /**
     * latest messages in the session
     */
    latestMessages: LLMRequestMessage[];
    /**
     * total token usage for the session
     */
    totalTokenUsage: LLMUsage;
    /**
     * Latest context from MindFlowAgent (thinking progress, critique, decision).
     * ThoughtAgent uses this to understand the current planning state.
     */
    mindflowContext?: MindflowContext;
    /**
     * Last one generation context from ThoughtAgent.
     * ThoughtAgent uses this to understand the current planning state.
     */
    lastOneGenerationContext?: OneGenerationContext;
}

export interface SearchEvidence {
    searchSummaries: string[];
    candidateNotesLines: string[];
    newContextNodesLines: string[];
}

const DEFAULT_MAX_RECENT_MESSAGES = 10;
const DEFAULT_SUMMARY_UPDATE_THRESHOLD = 5;
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

    private thinkingMemory: AgentMemory;

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

    /** Evidence accumulated from all search rounds (for SummaryAgent's initial prompt). */
    private accumulatedSearchEvidence: SearchEvidence = {
        searchSummaries: [],
        candidateNotesLines: [],
        newContextNodesLines: [],
    };

    constructor(
        private readonly aiServiceManager: AIServiceManager,
    ) {
    }

    public resetAgentMemory(initialPrompt: string): void {
        this.thinkingMemory = {
            initialPrompt,
            sessionSummary: '',
            historyMessages: [buildLLMRequestMessage('user', initialPrompt)],
            latestMessages: [buildLLMRequestMessage('user', initialPrompt)],
            lastSummaryIndex: 0,
            totalTokenUsage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
            },
            mindflowContext: undefined,
            lastOneGenerationContext: undefined,
        };
    }

    /**
     * Append a progress snapshot from MindFlowAgent.
     */
    public appendMindflowProgress(progress: MindflowProgress): void {
        if (!this.thinkingMemory.mindflowContext) {
            this.thinkingMemory.mindflowContext = {};
        }
        if (!this.thinkingMemory.mindflowContext.progressHistory) {
            this.thinkingMemory.mindflowContext.progressHistory = [];
        }
        this.thinkingMemory.mindflowContext.progressHistory.push(progress);
    }

    /**
     * Append a trace from MindFlowAgent.
     */
    public appendMindflowTrace(trace: string): void {
        if (!this.thinkingMemory.mindflowContext) {
            this.thinkingMemory.mindflowContext = {};
        }
        if (!this.thinkingMemory.mindflowContext.traces) {
            this.thinkingMemory.mindflowContext.traces = [];
        }
        this.thinkingMemory.mindflowContext.traces.push(trace);
    }

    public setLastMermaid(mermaid: string): void {
        if (!this.thinkingMemory.mindflowContext) {
            this.thinkingMemory.mindflowContext = {};
        }
        this.thinkingMemory.mindflowContext.lastMermaid = mermaid;
    }

    public getMindflowContext(): MindflowContext | undefined {
        return this.thinkingMemory.mindflowContext;
    }

    /** Get the latest mindflow progress (for decision logic). */
    public getLatestMindflowProgress(): MindflowProgress | undefined {
        const history = this.thinkingMemory.mindflowContext?.progressHistory;
        return history && history.length > 0 ? history[history.length - 1] : undefined;
    }

    public pushIterationErrorMessage(message: LLMRequestMessage): void {
        this.thinkingMemory.latestMessages.push(message);
    }

    public pushIterationThoughtMessage(
        oneGenerationContext: OneGenerationContext,
        thoughtText: string,
    ): LLMRequestMessage {
        const reasoningChunks = oneGenerationContext.reasoningTextChunks ?? [];
        const reasoningText = reasoningChunks.join('');
        const thoughtStr = (thoughtText ?? '').trim();
        const reasoningStr = (reasoningText ?? '').trim();
        const thoughtMessage: LLMRequestMessage = {
            role: 'assistant',
            content: []
        }
        if (thoughtStr.length > 0) {
            thoughtMessage.content.push({ type: 'text', text: thoughtStr });
        }
        if (reasoningStr.length > 0) {
            thoughtMessage.content.push({ type: 'reasoning', text: reasoningStr });
        }
        if (oneGenerationContext.toolCalls.length > 0) {
            thoughtMessage.content.push(
                ...oneGenerationContext.toolCalls.map(({ toolCallId, toolName, input }) => ({
                    type: 'tool-call' as const,
                    toolCallId,
                    toolName,
                    input
                }))
            );
        }
        if (oneGenerationContext.toolResults.length > 0) {
            thoughtMessage.content.push(
                ...oneGenerationContext.toolResults.map(({ toolCallId, toolName, output }) => ({
                    type: 'tool-result' as const,
                    toolCallId,
                    toolName,
                    output
                }))
            );
        }
        this.thinkingMemory.historyMessages.push(thoughtMessage);
        this.thinkingMemory.latestMessages.push(thoughtMessage);
        this.thinkingMemory.totalTokenUsage = mergeTokenUsage(this.thinkingMemory.totalTokenUsage, oneGenerationContext.stepTokenUsage);
        return thoughtMessage;
    }

    private cachedCurrentPromptMessage: LLMRequestMessage[] = [];
    private cachedCurrentPromptMessageText: string = '';

    private cacheCurrentPromptMessage(messages: LLMRequestMessage[]): void {
        this.cachedCurrentPromptMessage = messages;
        this.cachedCurrentPromptMessageText = convertMessagesToText(messages);
    }

    public getCachedCurrentPromptMessage(): LLMRequestMessage[] {
        return this.cachedCurrentPromptMessage;
    }

    public getCachedCurrentPromptMessageText(): string {
        return this.cachedCurrentPromptMessageText;
    }

    /**
     * Build current prompt with agent memory, yielding progress events during summarization
     */
    public async *buildCurrentPrompt(
        setPrompt?: (prompt: LLMRequestMessage[]) => void
    ): AsyncGenerator<LLMStreamEvent> {
        // Check if summarization is needed based on token limits
        const { shouldSummarize, reason } = await this.shouldSummarizeHistory();
        if (!shouldSummarize) {
            yield {
                type: 'pk-debug',
                debugName: 'summary_context_messages_not_needed',
                triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                extra: {
                    reason,
                },
            };
            const messages = await this.agentMemoryToPrompt();
            setPrompt?.(messages);
            this.cacheCurrentPromptMessage(messages);
            return;
        }

        try {
            yield* this.summarizeHistory(reason);
        } catch (error) {
            console.error('[buildCurrentPrompt] Error summarizing history:', error);
        } finally {
            const messages = await this.agentMemoryToPrompt();
            setPrompt?.(messages);
            this.cacheCurrentPromptMessage(messages);
        }
    }

    /**
     * Check if current conversation context exceeds token limits and needs summarization
     */
    private async shouldSummarizeHistory(): Promise<{ shouldSummarize: boolean, reason?: string }> {
        const history = this.thinkingMemory.historyMessages;
        if (history.length <= DEFAULT_SUMMARY_UPDATE_THRESHOLD) {
            return {
                shouldSummarize: false,
                reason: `history length(${history.length}) is less than or equal to ${DEFAULT_SUMMARY_UPDATE_THRESHOLD}`
            };
        }

        const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisSessionSummary);
        const tokenLimits = await this.aiServiceManager.getModelTokenLimits(
            modelId,
            provider
        );
        if (!tokenLimits) {
            const shouldSummarize = history.length - this.thinkingMemory.lastSummaryIndex > DEFAULT_SUMMARY_UPDATE_THRESHOLD;
            // Fall back to message count based logic if token limits are not available
            return {
                shouldSummarize,
                reason: `No available token limits. Fall back to message count based logic. history length(${history.length}) - lastSummaryIndex(${this.thinkingMemory.lastSummaryIndex}) > ${DEFAULT_SUMMARY_UPDATE_THRESHOLD}`
            };
        }

        // Use recommended summary threshold or 80% of max tokens as default
        const summaryThreshold = tokenLimits.recommendedSummaryThreshold ??
            (tokenLimits.maxInputTokens ? Math.floor(tokenLimits.maxInputTokens * 0.8) :
                (tokenLimits.maxTokens ? Math.floor(tokenLimits.maxTokens * 0.8) : 0));

        if (summaryThreshold <= 0) {
            // Fall back to message count based logic
            const shouldSummarize = history.length - this.thinkingMemory.lastSummaryIndex > DEFAULT_SUMMARY_UPDATE_THRESHOLD;
            return {
                shouldSummarize,
                reason: `Summary threshold is less than or equal to 0. Fall back to message count based logic. history length(${history.length}) - lastSummaryIndex(${this.thinkingMemory.lastSummaryIndex}) > ${DEFAULT_SUMMARY_UPDATE_THRESHOLD}`
            };
        }

        // Estimate tokens for recent messages since last summary
        const recentMessages = history.slice(this.thinkingMemory.lastSummaryIndex);
        const estimatedTokens = this.aiServiceManager.estimateTokens(
            recentMessages
        );

        return {
            shouldSummarize: estimatedTokens > summaryThreshold,
            reason: `Token estimation: ${estimatedTokens} tokens, threshold: ${summaryThreshold}`
        };
    }

    private async *summarizeHistory(reason?: string): AsyncGenerator<LLMStreamEvent> {
        // Calculate which messages need to be summarized
        const history = this.thinkingMemory.historyMessages;
        let messagesToSummarize: LLMRequestMessage[] = history.slice(0, -DEFAULT_SUMMARY_UPDATE_THRESHOLD)
        const messagesToSummarizeText = concatLLMRequestMessages(messagesToSummarize);

        // If history is long (based on token limits), do summarization
        const toolCallId = generateToolCallId();
        yield {
            type: 'tool-call',
            id: toolCallId,
            toolName: ToolEvent.summary_context_messages,
            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
            input: {
                reason,
                messagesToSummarize: messagesToSummarizeText,
            },
        };
        const stepId = generateUuidWithoutHyphens();
        yield {
            type: 'ui-step',
            uiType: UIStepType.STEPS_DISPLAY,
            stepId,
            title: 'Summarizing context messages...',
            description: 'Trying to build next prompt with the summary...',
            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
        }

        // Generate summary with decision-critical structure (user background, pains, evidence paths)
        const wordCountLimit = AppContext.getInstance().settings.search.aiAnalysisSessionSummaryWordCount ?? DEFAULT_SEARCH_SETTINGS.aiAnalysisSessionSummaryWordCount;
        const summaryStream = this.aiServiceManager.chatWithPromptStream(PromptId.AiAnalysisSessionSummary, {
            content: messagesToSummarizeText,
            userQuery: this.thinkingMemory.initialPrompt ?? '',
            wordCount: `up to ${wordCountLimit} characters (words)`,
        })
        let hasEmitUiDeltaOnSummary = false;
        for await (const chunk of summaryStream) {
            if (chunk.type === 'prompt-stream-delta' && !hasEmitUiDeltaOnSummary) {
                yield {
                    type: 'ui-step-delta',
                    uiType: UIStepType.STEPS_DISPLAY,
                    stepId,
                    titleDelta: 'building...',
                    descriptionDelta: chunk.delta,
                    triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                };
                hasEmitUiDeltaOnSummary = true;
            } else {
                yield chunk;
            }
            if (chunk.type === 'prompt-stream-result') {
                this.thinkingMemory.sessionSummary = chunk.output;
            }
        }

        this.thinkingMemory.sessionSummary =
            `[SummaryRange] ${this.thinkingMemory.lastSummaryIndex} - ${messagesToSummarize.length - 1} `
            + `of total ${this.thinkingMemory.historyMessages.length} messages\n`
            + `[Summary] ${this.thinkingMemory.sessionSummary}`;
        this.thinkingMemory.lastSummaryIndex = messagesToSummarize.length - 1;
        this.thinkingMemory.latestMessages = DEFAULT_MAX_RECENT_MESSAGES > this.thinkingMemory.historyMessages.length
            ? this.thinkingMemory.historyMessages
            : [...this.thinkingMemory.historyMessages.slice(-DEFAULT_MAX_RECENT_MESSAGES),];

        yield {
            type: 'tool-result',
            id: toolCallId,
            toolName: ToolEvent.summary_context_messages,
            triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
            input: {
                reason,
                messagesToSummarize: messagesToSummarizeText,
            },
            output: {
                type: 'text',
                value: this.thinkingMemory.sessionSummary,
            }
        };
    }

    /**
     * Convert agent memory to LLMRequestMessage array.
     * Includes mindflow context if available, so ThoughtAgent can see MindFlowAgent's thinking progress.
     */
    private async agentMemoryToPrompt(): Promise<LLMRequestMessage[]> {
        const messages: LLMRequestMessage[] = [];

        // Add session summary if present
        if (this.thinkingMemory.sessionSummary && this.thinkingMemory.sessionSummary.trim().length > 0) {
            messages.push(buildLLMRequestMessage('assistant', this.thinkingMemory.sessionSummary));
        }

        messages.push(...this.thinkingMemory.latestMessages);

        const mfMsg = await this.buildMindflowContextMessage();
        if (mfMsg) {
            console.debug('[agentMemoryToPrompt] Mindflow context message:', mfMsg);
            messages.push(mfMsg);
        }

        return messages;
    }

    /**
     * Build a message describing current MindFlow thinking state using template.
     */
    private async buildMindflowContextMessage(): Promise<LLMRequestMessage | null> {
        const mfCtx = this.thinkingMemory.mindflowContext;
        if (!mfCtx) {
            return null;
        }

        const progressHistory = mfCtx.progressHistory ?? [];
        const progress = progressHistory.length > 0 ? progressHistory[progressHistory.length - 1] : undefined;
        const recentTraces = (mfCtx.traces ?? []).slice(-3);
        const payload = {
            hasProgress: !!progress,
            statusLabel: progress?.statusLabel ?? 'In Progress',
            estimatedCompleteness: progress?.estimatedCompleteness ?? 0,
            goalAlignment: progress?.goalAlignment,
            critique: progress?.critique,
            decision: progress?.decision,
            hasTraces: recentTraces.length > 0,
            tracesLine: recentTraces.join(' → '),
        };
        if (!payload.hasProgress && !payload.hasTraces) {
            return null;
        }

        const tm = this.aiServiceManager.getTemplateManager?.();
        const text = tm
            ? (await tm.render(AgentTemplateId.MindflowContext, payload)).trim()
            : '';
        if (!text) {
            return null;
        }

        return buildLLMRequestMessage('assistant', text);
    }

    public accumulateTokenUsage(usage?: LLMUsage): void {
        if (!usage) {
            return;
        }
        this.thinkingMemory.totalTokenUsage = mergeTokenUsage(this.thinkingMemory.totalTokenUsage, usage);
    }

    public getAgentMemory(): AgentMemory {
        return this.thinkingMemory;
    }

    /**
     * Number of messages in the analysis session (latestMessages). For use with getAnalysisMessageAt.
     */
    /** Returns count of latest messages; 0 when memory not yet initialized (before resetAgentMemory). */
    public getAnalysisMessageCount(): number {
        return this.thinkingMemory?.latestMessages?.length ?? 0;
    }

    /**
     * Returns the text of one message by 0-based index. Uses latestMessages.
     */
    public getAnalysisMessageAt(index: number): string {
        const messages = this.thinkingMemory?.latestMessages ?? [];
        if (index < 0 || index >= messages.length) {
            return '';
        }
        return convertMessagesToText([messages[index]]);
    }

    private latestMessageTextSupplier: Supplier<string> = refreshableMemoizeSupplier<string, number>(
        () => {
            const messages = this.thinkingMemory?.latestMessages ?? [];
            if (messages.length === 0) {
                return this.thinkingMemory?.initialPrompt ?? '';
            }
            return convertMessagesToText([
                messages[messages.length - 1]
            ]);
        },
        () => this.thinkingMemory?.latestMessages?.length ?? 0,
        (lastLength, currentLength) => lastLength !== currentLength
    );

    public getLatestMessageText(): string {
        return this.latestMessageTextSupplier();
    }

    public getInitialPrompt(): string {
        return this.thinkingMemory?.initialPrompt ?? '';
    }

    public resetAgentResult(): SearchAgentResult {
        this.agentResult = {
            title: '',
            summary: '',
            topics: [],
            graph: { nodes: [], edges: [] },
            sources: [],
            dashboardBlocks: [],
            suggestedFollowUpQuestions: [],
        };
        this.verifiedPaths.clear();
        this.emittedSourcePaths.clear();
        this.accumulatedSearchEvidence = { searchSummaries: [], candidateNotesLines: [], newContextNodesLines: [] };
        return this.agentResult;
    }

    public yieldAgentResult(): { extra: { currentResult: SearchAgentResult } } {
        return {
            extra: {
                currentResult: this.agentResult,
            },
        };
    }

    public getAgentResult(): SearchAgentResult {
        if (!this.agentResult) {
            this.agentResult = this.resetAgentResult();
        }
        return this.agentResult;
    }

    public getVerifiedPaths(): Set<string> {
        return this.verifiedPaths;
    }

    public appendVerifiedPaths(paths: string[] | string): void {
        if (!paths) {
            return;
        }
        if (typeof paths === 'string') {
            if (paths.trim()) {
                this.verifiedPaths.add(paths);
            }
        } else {
            paths.forEach(path => this.verifiedPaths.add(path));
        }
    }

    public getEmittedSourcePaths(): Set<string> {
        return this.emittedSourcePaths;
    }

    public accumulateSearchEvidence(evidence: SearchEvidence): void {
        this.accumulatedSearchEvidence = {
            searchSummaries: [...this.accumulatedSearchEvidence.searchSummaries, ...evidence.searchSummaries],
            candidateNotesLines: [...this.accumulatedSearchEvidence.candidateNotesLines, ...evidence.candidateNotesLines],
            newContextNodesLines: [...this.accumulatedSearchEvidence.newContextNodesLines, ...evidence.newContextNodesLines],
        };
    }

    public getAccumulatedSearchEvidence(): SearchEvidence {
        return this.accumulatedSearchEvidence;
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
                    const count = this.getAnalysisMessageCount();
                    const index = input.index;
                    if (index < 0 || index >= count) {
                        return {
                            content: `Invalid index ${index}. Valid range is 0 to ${count - 1}. Total messages: ${count}. I return the latest message instead.` + this.latestMessageTextSupplier(),
                        };
                    }
                    const text = this.getAnalysisMessageAt(index);
                    return { content: text || '(empty message). I return the latest message instead.' + this.getLatestMessageText() };
                },
            }),
        }
    }

    /**
     * Full message-context memory as single text. Cached; refreshed only when message length changes.
     */
    private fullMemoryTextSupplier: Supplier<string> = refreshableMemoizeSupplier<string, number>(
        () => {
            const summary = this.thinkingMemory?.sessionSummary ?? '';
            const messagesText = convertMessagesToText(this.thinkingMemory?.latestMessages ?? []);
            return (summary ? `[Session Summary]\n${summary}\n\n` : '') + `[Recent Messages]\n${messagesText}`;
        },
        () => this.thinkingMemory?.latestMessages?.length ?? 0,
        (lastLen, currentLen) => lastLen !== currentLen
    );

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
}