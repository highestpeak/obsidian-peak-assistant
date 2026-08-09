// src/service/chat/tools/chatToolBuilder.ts
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { AppHandle } from '@/core/ports/AppHandle';
import type { ModelCapabilities } from '@/core/providers/types';
import type { VaultRetrievalPort } from '@/core/ports/VaultRetrievalPort';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { PromptId } from '@/core/types/prompt';
import { TemplateManager } from '@/core/template/TemplateManager';
import { runHarnessText } from '@/service/agents/harness/HarnessModelRunner';
import { extractWebSourcesFromText, type SourceReceiptCollector } from './sourceReceiptCollector';
import { VAULT_SEARCH_TOP_K } from '@/core/constant';
import type { MCPClientManager } from '@/service/mcp/MCPClientManager';
import type { WebSearchProvider } from './webSearchProvider';
import type { MediaGenerationProbe } from './mediaGenerationProbe';
import type { MediaGenerationService } from '@/service/media/MediaGenerationService';
import type { MediaReferenceInput } from '@/core/types/media-generation';
import type { ArtifactProducerService } from '@/service/chat/artifacts/artifactProducers';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type { ToolDef } from '@/core/types/tool';
import type { PeakSheetToolPort } from '@/core/ports/PeakSheetToolPort';

/**
 * T11Y-6: web search tool system prompt body moved to
 * templates/prompts/web-search-tool-system.md
 * (PromptId.WebSearchToolSystem). Previously duplicated in webSearchTool.ts.
 */

export interface ChatToolDeps {
    app: AppHandle;
    pluginId: string;
    enableWebSearch: boolean;
    /** Vault Search switch (chat-studio RUN-01). Only effective when vaultRetrieval is wired. */
    enableVaultSearch?: boolean;
    /** Real retrieval port; absent = Vault Search unavailable, no tool is built. */
    vaultRetrieval?: VaultRetrievalPort | null;
    /** Folder scope for vault retrieval (conversation focusFolder). */
    vaultScopeFolder?: string;
    /** Per-turn actual-source receipt accumulator (chat-studio RUN-02). */
    receipts?: SourceReceiptCollector;
    /**
     * MCP client manager (B1 §5.2 R3). Absent = MCP tools are not injected.
     * Ownership: constructed in `main.ts` and threaded through ConversationService.
     * `buildChatHarnessTools` reads only connected servers via
     * `getAllDiscoveredTools`; disconnected servers surface via the
     * availability resolver, not as broken tool-defs.
     */
    mcpClientManager?: MCPClientManager | null;
    /**
     * Optional native web-search provider adapter registry (B1 §5.2 R2). The
     * default is a null provider (no native adapter exists today). Injected
     * so future work can wire a real registry without touching consumers.
     */
    webSearchProvider?: WebSearchProvider;
    /**
     * D1 §R1: MediaGenerationService for the `media_generate` tool. Absent
     * = the tool is reported `unconfigured` in availability records and is
     * NOT registered as a callable ToolDef. Ownership stays at the app
     * layer — no service-side singleton.
     */
    mediaGenerationService?: MediaGenerationService | null;
    /**
     * D1 §R1: sync availability probe for the tool availability resolver.
     * Passed alongside `mediaGenerationService` so the resolver can decide
     * whether to expose the tool without touching the service directly.
     * When absent the resolver reports the tool as `unconfigured`.
     */
    mediaGenerationProbe?: MediaGenerationProbe | null;
    /**
     * D1 §R2: conversation the chat turn belongs to. Piped to the tool
     * closure so persisted `ChatArtifactReceipt`s carry the correct
     * anchor. Absent → tool falls back to `''` (matches command-mode
     * behaviour) but the receipt won't render in the Chat thread.
     */
    conversationId?: string;
    /**
     * D1 §R2: assistant message id being streamed this turn. Same
     * anchoring rationale as `conversationId`. Absent → same fallback.
     */
    assistantMessageId?: string;
    /** D1 §R2: optional project id override for receipt anchoring. */
    projectId?: string;
    /**
     * Zero-gap §4 A1 — resolve a model-supplied reference id (receipt
     * artifactId or vault path) to the stable MediaReferenceInput the
     * media_generate tool consumes. Returns null when the id was NOT
     * surfaced by the user this turn (attachment or previously-generated
     * receipt in the same conversation). The tool refuses to send garbage
     * ids to a paid endpoint.
     */
    resolveAllowedMediaReference?: (id: string) => MediaReferenceInput | null;
    /**
     * Zero-gap Track D (2026-07-21): ArtifactProducerService for the
     * `artifact_create` tool. Absent = the tool is reported `unconfigured`
     * in availability records and NOT registered as a callable ToolDef.
     * Ownership stays at the app layer — no service-side singleton.
     */
    artifactProducer?: ArtifactProducerService | null;
    /**
     * Zero-gap Track D: per-turn receipt observer. `artifact_create` and (a
     * follow-up) media_generate call this on every persisted receipt so the
     * runtime can populate `TurnExecutionReceipt.artifactIds`. Absent = no
     * accumulation; the tool still persists receipts through its own sink.
     */
    onArtifactReceipt?: (receipt: ChatArtifactReceipt) => void;
    /** Current human-approved external Obsidian command tool definitions. */
    pluginCommandTools?: readonly ToolDef[];
	/** App-owned local Peak Sheet data runtime. */
	peakSheet?: PeakSheetToolPort | null;
}

export interface ChatToolSet {
    tools: ToolSet;
    maxSteps: number;
}

/**
 * Build Vercel AI SDK tools based on UI toggles and model capabilities.
 * Returns empty tools when nothing is enabled.
 */
export function buildChatTools(
    deps: ChatToolDeps,
    _capabilities: ModelCapabilities,
): ChatToolSet {
    // B1: `capabilities` no longer participates in the injection decision
    // (see §5.2 R2). Kept in the signature to avoid churn on callers/tests
    // that still pass it.
    const tools: ToolSet = {};

    // Vault search: only when the switch is on AND a real retrieval port is
    // wired. No port = no tool; the UI must surface "unavailable" instead of
    // pretending the vault was searched (chat-studio RUN-01).
    if (deps.enableVaultSearch && deps.vaultRetrieval) {
        const retrieval = deps.vaultRetrieval;
        tools.vault_search = tool({
            description:
                "Search the user's personal knowledge base (Obsidian vault) for notes, documents, and past writing. " +
                'Use when the user asks about their own notes, projects, ideas, or anything they may have written before.',
            inputSchema: z.object({
                query: z.string().describe('The search query to run against the vault'),
            }),
            execute: async ({ query }) => {
                deps.receipts?.recordVaultQuery(query);
                try {
                    const hits = await retrieval.search(query, {
                        topK: VAULT_SEARCH_TOP_K,
                        scopeFolder: deps.vaultScopeFolder,
                    });
                    if (hits.length === 0) return 'No matching notes found in the vault.';
                    for (const hit of hits) {
                        deps.receipts?.recordVaultDocument({ id: hit.id, path: hit.path, title: hit.title });
                    }
                    return hits
                        .map((hit, i) => {
                            const snippet = hit.snippet ? `\n${hit.snippet}` : '';
                            return `${i + 1}. [[${hit.path}]] — ${hit.title}${snippet}`;
                        })
                        .join('\n\n');
                } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Vault search failed';
                    return `Vault search error: ${msg}`;
                }
            },
        });
    }

    // Web search: B1 §5.2 R2 — catalog `webSearch: true` no longer suppresses
    // the fallback tool. No native adapter exists in this repo today, so the
    // fallback is the only real route. Inject whenever the toggle is on and
    // an active Web Search profile is configured.
    if (deps.enableWebSearch) {
        const webBinding = ProfileRegistry.getInstance().getActiveWebSearchConfig();
        if (webBinding) {
            tools.web_search = tool({
                description:
                    'Search the web for up-to-date information, recent events, external knowledge, or facts. ' +
                    'Use when the user asks about current events, external products, public data, or anything beyond their personal notes.',
                inputSchema: z.object({
                    query: z.string().describe('The search query to look up on the web'),
                }),
                execute: async ({ query }) => {
                    deps.receipts?.recordWebQuery(query);
                    try {
                        const tm = TemplateManager.getInstance();
                        if (!tm) return 'Web search error: template manager not bound';
                        const systemPrompt = await tm.render(PromptId.WebSearchToolSystem, {});
                        const { text } = await runHarnessText({
                            loopId: `${deps.pluginId}-legacy-chat-web-search-${crypto.randomUUID()}`,
                            profile: webBinding.profile,
                            modelId: webBinding.modelId,
                            prompt: query,
                            systemPrompt,
                            maxSteps: 1,
                        });
                        const answer = text || 'No results found.';
                        // RUN-02 receipt honesty: record the ACTUAL web sources the
                        // model cited. The provider profile exposes no structured
                        // per-source metadata (search runs server-side; the CLI
                        // WebSearch tool is disallowed), so we recover the real
                        // sources by parsing the cited URLs out of the answer text.
                        // See extractWebSourcesFromText for the constraint rationale.
                        if (deps.receipts) {
                            for (const source of extractWebSourcesFromText(answer)) {
                                deps.receipts.recordWebSource(source);
                            }
                        }
                        return answer;
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Web search failed';
                        return `Web search error: ${msg}`;
                    }
                },
            });
        }
    }

    const hasTools = Object.keys(tools).length > 0;
    return {
        tools,
        maxSteps: hasTools ? 3 : 1,
    };
}
