import { AppContext } from "@/app/context/AppContext";
import { generateToolCallId } from "@/core/providers/adapter/ai-sdk-adapter";
import { buildLLMRequestMessage, concatLLMRequestMessages } from "@/core/providers/helpers/message-helper";
import { LLMRequestMessage, LLMStreamEvent, LLMUsage, mergeTokenUsage, StreamTriggerName, ToolEvent } from "@/core/providers/types";
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

export class AgentMemoryManager {
    private agentMemory: AgentMemory;

    constructor(
        private readonly aiServiceManager: AIServiceManager,
        private readonly options: {
            thoughtAgentModel: string;
            thoughtAgentProvider: string;
        }
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
        thoughtTextChunks: string[], reasoningTextChunks: string[],
        toolCalls: { toolCallId: string; toolName: string; input: any }[],
        toolResults: { toolCallId: string; toolName: string; output: any }[],
        stepTokenUsage: LLMUsage
    ): LLMRequestMessage {
        const thoughtText = thoughtTextChunks.join('');
        const reasoningText = reasoningTextChunks.join('');
        const thoughtMessage: LLMRequestMessage = {
            role: 'assistant',
            content: []
        }
        if (thoughtText.trim().length > 0) {
            thoughtMessage.content.push({ type: 'text', text: thoughtText.trim() });
        }
        if (reasoningText.trim().length > 0) {
            thoughtMessage.content.push({ type: 'reasoning', text: reasoningText.trim() });
        }
        if (toolCalls.length > 0) {
            thoughtMessage.content.push(
                ...toolCalls.map(({ toolCallId, toolName, input }) => ({
                    type: 'tool-call' as const,
                    toolCallId,
                    toolName,
                    input
                }))
            );
        }
        if (toolResults.length > 0) {
            thoughtMessage.content.push(
                ...toolResults.map(({ toolCallId, toolName, output }) => ({
                    type: 'tool-result' as const,
                    toolCallId,
                    toolName,
                    output
                }))
            );
        }
        this.agentMemory.historyMessages.push(thoughtMessage);
        this.agentMemory.latestMessages.push(thoughtMessage);
        this.agentMemory.totalTokenUsage = mergeTokenUsage(this.agentMemory.totalTokenUsage, stepTokenUsage);
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

        const tokenLimits = await this.aiServiceManager.getModelTokenLimits(
            this.options.thoughtAgentModel,
            this.options.thoughtAgentProvider
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

        // Generate summary immediately
        this.agentMemory.sessionSummary = await this.aiServiceManager.chatWithPrompt(PromptId.DocSummary, {
            content: messagesToSummarizeText,
            title: `Thought Agent History of the user query: \`${this.agentMemory.initialPrompt}\` `,
            wordCount: `less than ${AppContext.getInstance().settings.search.aiAnalysisSessionSummaryWordCount}`,
        });

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

    public getAgentMemory(): AgentMemory {
        return this.agentMemory;
    }
}