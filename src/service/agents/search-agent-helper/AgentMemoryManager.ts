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
     * current query from user and assistant intermediate calls
     */
    currentQuery: string;
    /**
     * total token usage for the session
     */
    totalTokenUsage: LLMUsage;
}

const DEFAULT_MAX_RECENT_MESSAGES = 10;
const DEFAULT_SUMMARY_UPDATE_THRESHOLD = 5;

/**
 * Manages agent memory and session summarization.
 * Uses getModelForPrompt(AiAnalysisSessionSummary) for summarization model.
 */
export class AgentMemoryManager {
    private agentMemory: AgentMemory;

    constructor(
        private readonly aiServiceManager: AIServiceManager,
    ) {
    }

    public resetAgentMemory(initialPrompt: string): void {
        this.agentMemory = {
            initialPrompt,
            sessionSummary: '',
            historyMessages: [buildLLMRequestMessage('user', initialPrompt)],
            latestMessages: [buildLLMRequestMessage('user', initialPrompt)],
            currentQuery: initialPrompt,
            lastSummaryIndex: 0,
            totalTokenUsage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
            }
        };
    }

    public buildIterationThoughtMessage(
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
        this.agentMemory.historyMessages.push(thoughtMessage);
        this.agentMemory.latestMessages.push(thoughtMessage);
        this.agentMemory.totalTokenUsage = mergeTokenUsage(this.agentMemory.totalTokenUsage, oneGenerationContext.stepTokenUsage);
        return thoughtMessage;
    }

    /**
     * Check if current conversation context exceeds token limits and needs summarization
     */
    private async shouldSummarizeHistory(): Promise<{ shouldSummarize: boolean, reason?: string }> {
        const history = this.agentMemory.historyMessages;
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
            const shouldSummarize = history.length - this.agentMemory.lastSummaryIndex > DEFAULT_SUMMARY_UPDATE_THRESHOLD;
            // Fall back to message count based logic if token limits are not available
            return {
                shouldSummarize,
                reason: `No available token limits. Fall back to message count based logic. history length(${history.length}) - lastSummaryIndex(${this.agentMemory.lastSummaryIndex}) > ${DEFAULT_SUMMARY_UPDATE_THRESHOLD}`
            };
        }

        // Use recommended summary threshold or 80% of max tokens as default
        const summaryThreshold = tokenLimits.recommendedSummaryThreshold ??
            (tokenLimits.maxInputTokens ? Math.floor(tokenLimits.maxInputTokens * 0.8) :
                (tokenLimits.maxTokens ? Math.floor(tokenLimits.maxTokens * 0.8) : 0));

        if (summaryThreshold <= 0) {
            // Fall back to message count based logic
            const shouldSummarize = history.length - this.agentMemory.lastSummaryIndex > DEFAULT_SUMMARY_UPDATE_THRESHOLD;
            return {
                shouldSummarize,
                reason: `Summary threshold is less than or equal to 0. Fall back to message count based logic. history length(${history.length}) - lastSummaryIndex(${this.agentMemory.lastSummaryIndex}) > ${DEFAULT_SUMMARY_UPDATE_THRESHOLD}`
            };
        }

        // Estimate tokens for recent messages since last summary
        const recentMessages = history.slice(this.agentMemory.lastSummaryIndex);
        const estimatedTokens = this.aiServiceManager.estimateTokens(
            recentMessages
        );

        return {
            shouldSummarize: estimatedTokens > summaryThreshold,
            reason: `Token estimation: ${estimatedTokens} tokens, threshold: ${summaryThreshold}`
        };
    }

    /**
     * Build current prompt with agent memory, yielding progress events during summarization
     */
    public async *buildCurrentPrompt(): AsyncGenerator<LLMStreamEvent> {
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
            return;
        }

        // Calculate which messages need to be summarized
        const history = this.agentMemory.historyMessages;
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
            userQuery: this.agentMemory.initialPrompt ?? '',
            wordCount: `up to ${wordCountLimit} characters (words)`,
        })
        for await (const chunk of summaryStream) {
            if (chunk.type === 'prompt-stream-delta') {
                yield {
                    type: 'ui-step-delta',
                    uiType: UIStepType.STEPS_DISPLAY,
                    stepId,
                    titleDelta: 'building...',
                    descriptionDelta: chunk.delta,
                    triggerName: StreamTriggerName.SEARCH_THOUGHT_AGENT,
                };
            } else {
                yield chunk;
            }
            if (chunk.type === 'prompt-stream-result') {
                this.accumulateTokenUsage(chunk.usage);
                this.agentMemory.sessionSummary = chunk.output;
            }
        }

        this.agentMemory.lastSummaryIndex = messagesToSummarize.length - 1;
        this.agentMemory.latestMessages = DEFAULT_MAX_RECENT_MESSAGES > this.agentMemory.historyMessages.length
            ? this.agentMemory.historyMessages
            : [...this.agentMemory.historyMessages.slice(-DEFAULT_MAX_RECENT_MESSAGES),];

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
                value: this.agentMemory.sessionSummary,
            }
        };
    }

    /**
     * Convert agent memory to LLMRequestMessage array
     */
    public agentMemoryToPrompt(): LLMRequestMessage[] {
        if (this.agentMemory.sessionSummary && this.agentMemory.sessionSummary.trim().length > 0) {
            return [
                buildLLMRequestMessage('assistant', this.agentMemory.sessionSummary),
                ...this.agentMemory.latestMessages,
            ];
        }
        return this.agentMemory.latestMessages;
    }

    public pushMessage(message: LLMRequestMessage): void {
        this.agentMemory.latestMessages.push(message);
    }

    /**
     * Push a message into BOTH history and latest buffers.
     * Use this for internal agent notes that must be queryable by search_analysis_context.
     */
    public pushMessageToHistory(message: LLMRequestMessage): void {
        this.agentMemory.historyMessages.push(message);
        this.agentMemory.latestMessages.push(message);
    }

    public accumulateTokenUsage(usage?: LLMUsage): void {
        if (!usage) {
            return;
        }
        this.agentMemory.totalTokenUsage = mergeTokenUsage(this.agentMemory.totalTokenUsage, usage);
    }

    public getAgentMemory(): AgentMemory {
        return this.agentMemory;
    }

    /**
     * Search history messages by query. Returns relevant excerpts.
     * Used by finish-phase agents for local RAG over analysis context.
     */
    public searchHistory(query: string, options?: { maxChars?: number }): string {
        const maxChars = options?.maxChars ?? 4000;
        const q = (query ?? '').trim().toLowerCase();
        if (!q) {
            const full = (this.agentMemory.sessionSummary ? `[Session Summary]\n${this.agentMemory.sessionSummary}\n\n` : '')
                + `[Recent Messages]\n${convertMessagesToText(this.agentMemory.latestMessages)}`;
            return full.slice(0, maxChars);
        }
        const fullText = (this.agentMemory.sessionSummary ? `[Session Summary]\n${this.agentMemory.sessionSummary}\n\n` : '')
            + `[Recent Messages]\n${convertMessagesToText(this.agentMemory.latestMessages)}`;
        const lines = fullText.split(/\r?\n/);
        const matches: string[] = [];
        const contextLines = 2;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(q)) {
                const start = Math.max(0, i - contextLines);
                const end = Math.min(lines.length, i + contextLines + 1);
                matches.push(lines.slice(start, end).join('\n'));
            }
        }
        const result = matches.length > 0 ? matches.join('\n---\n') : fullText.slice(0, maxChars);
        return result.slice(0, maxChars);
    }

    private latestMessageTextSupplier: Supplier<string> = refreshableMemoizeSupplier<string, number>(
        () => {
            const messages = this.agentMemory?.latestMessages ?? [];
            if (messages.length === 0) {
                return this.agentMemory?.initialPrompt ?? '';
            }
            return convertMessagesToText([
                messages[messages.length - 1]
            ]);
        },
        () => this.agentMemory?.latestMessages?.length ?? 0,
        (lastLength, currentLength) => lastLength !== currentLength
    );

    public getLatestMessageText(): string {
        return this.latestMessageTextSupplier();
    }

    public getInitialPrompt(): string {
        return this.agentMemory?.initialPrompt ?? '';
    }
}