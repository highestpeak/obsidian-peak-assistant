/**
 * Chat tool builder — Harness ToolDef flavour.
 *
 * A3 (plan §5.1): Chat migrates from Vercel `tool()` factories consumed by
 * `streamText`'s built-in tool loop to Harness `ToolDef`s consumed by
 * `runAgentLoop`.
 *
 * B1 (plan §5.2):
 *   - Tool set is now filtered by the pure `resolveToolAvailability` helper.
 *     Only `available` records become ToolDefs. `disconnected` /
 *     `unconfigured` / `unsupported` stay in the availability list for the
 *     Composer + error UI to consume.
 *   - `web_search` no longer keys on the model catalog's `webSearch` flag;
 *     the fallback tool is injected whenever a Web Search profile is active
 *     (pre-B1 catalog metadata suppression was a false-availability shortcut
 *     — there is no native web-search adapter in the repo today).
 *   - MCP tools from connected servers are wired in via
 *     `getAllMcpToolDefs`; each tool inherits `source:'mcp'` and
 *     `kind:'edit'`, so PermissionGuard treats them as gated by default.
 *
 * We keep `chatToolBuilder.ts` for legacy Vercel-shape callers that are not
 * yet migrated; production Chat uses this file.
 */

import { z } from 'zod';
import { PromptId } from '@/core/types/prompt';
import { TemplateManager } from '@/core/template/TemplateManager';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { runHarnessText } from '@/service/agents/harness/HarnessModelRunner';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import { ok } from '@/service/agents/harness/tool/types';
import type { ModelCapabilities } from '@/core/providers/types';
import { VAULT_SEARCH_TOP_K } from '@/core/constant';
import { extractWebSourcesFromText, type SourceReceiptCollector } from './sourceReceiptCollector';
import type { ChatToolDeps } from './chatToolBuilder';
import { getAllMcpToolDefs } from '@/service/mcp/MCPToolAdapter';
import {
	availableToolIds,
	resolveToolAvailability,
	type ToolAvailability,
} from './toolAvailability';
import { buildMediaGenerateTool } from './mediaGenerateTool';
import { buildArtifactCreateTool } from './artifactCreateTool';

export interface BuildHarnessToolsResult {
	tools: ToolDef[];
	/** Availability snapshot the caller can surface to the UI / error paths. */
	availability: ToolAvailability[];
}

/**
 * Build Chat tools + availability snapshot in one pass.
 *
 * Attachment rules (post-B1):
 *   - vault_search: `enableVaultSearch` toggle AND live `vaultRetrieval` port.
 *   - web_search:   `enableWebSearch` toggle AND (native adapter available OR
 *                   active Web Search profile). Catalog `webSearch` metadata
 *                   no longer suppresses fallback injection.
 *   - mcp_*:        Every tool exposed by a **connected** MCP server.
 */
export function buildChatHarnessToolsDetailed(
	deps: ChatToolDeps,
	capabilities: ModelCapabilities,
): BuildHarnessToolsResult {
	const availability = resolveToolAvailability({
		enableVaultSearch: !!deps.enableVaultSearch,
		enableWebSearch: !!deps.enableWebSearch,
		vaultRetrieval: deps.vaultRetrieval,
		profileRegistry: ProfileRegistry.getInstance(),
		mcpClientManager: deps.mcpClientManager,
		modelCapabilities: capabilities,
		webSearchProvider: deps.webSearchProvider,
		mediaGenerationProbe: deps.mediaGenerationProbe,
		artifactCreateReady: !!deps.artifactProducer,
	});
	const availableIds = availableToolIds(availability);
	const tools: ToolDef[] = [];

	if (availableIds.has('vault_search')) {
		tools.push(buildVaultSearchTool(deps));
	}

	if (availableIds.has('web_search')) {
		tools.push(buildWebSearchTool(deps));
	}

	// D1 §R1: media_generate — one ToolDef per turn, closes over the
	// conversation/message anchors so persisted receipts carry them.
	if (availableIds.has('media_generate') && deps.mediaGenerationService) {
		const service = deps.mediaGenerationService;
		tools.push(
			buildMediaGenerateTool({
				service,
				conversationId: deps.conversationId,
				messageId: deps.assistantMessageId,
				projectId: deps.projectId,
				// Failed receipts are written directly through the same sink
				// the service uses on success (composeMediaGenerationService
				// wires this to `manager.conv.saveArtifactReceipt`). We wrap
				// it to also forward the receipt to the per-turn observer so
				// TurnExecutionReceipt.artifactIds picks it up (zero-gap D).
				saveReceipt: async (r) => {
					await service.saveReceiptDirect(r);
					deps.onArtifactReceipt?.(r);
				},
				resolveAllowedReference: deps.resolveAllowedMediaReference,
			}),
		);
	}

	// Zero-gap Track D (2026-07-21): artifact_create — one ToolDef per turn,
	// closes over conversation/message anchors so persisted receipts carry
	// them. The producer owns validate → save → receipt; the ToolDef only
	// hands off input and forwards the outcome payload to the model.
	if (availableIds.has('artifact_create') && deps.artifactProducer) {
		tools.push(
			buildArtifactCreateTool({
				producer: deps.artifactProducer,
				conversationId: deps.conversationId,
				messageId: deps.assistantMessageId,
				projectId: deps.projectId,
				onReceipt: deps.onArtifactReceipt,
			}),
		);
	}

	// MCP: pull every discovered tool from connected servers. The availability
	// resolver already filtered out disconnected servers; we run the adapter
	// again to keep the two paths independent (adapter owns Zod conversion,
	// availability owns the state machine).
	if (deps.mcpClientManager) {
		const mcpDefs = getAllMcpToolDefs(deps.mcpClientManager);
		for (const def of mcpDefs) {
			// Guard against a race where the availability snapshot said
			// available but the adapter (which reads a fresh snapshot) can't
			// see the tool any more; keep the tool set honest by intersecting
			// with the resolver output.
			if (availableIds.has(def.name)) tools.push(def);
		}
	}

	return { tools, availability };
}

/**
 * Backwards-compatible wrapper: the existing callers (execution-strategy,
 * tests) expect a flat `ToolDef[]`. The availability snapshot is delivered
 * through the detailed helper for callers that need it (Composer, tests).
 */
export function buildChatHarnessTools(
	deps: ChatToolDeps,
	capabilities: ModelCapabilities,
): ToolDef[] {
	return buildChatHarnessToolsDetailed(deps, capabilities).tools;
}

function buildVaultSearchTool(deps: ChatToolDeps): ToolDef {
	const retrieval = deps.vaultRetrieval!;
	const receipts = deps.receipts;
	return {
		name: 'vault_search',
		description:
			"Search the user's personal knowledge base (Obsidian vault) for notes, documents, and past writing. " +
			'Use when the user asks about their own notes, projects, ideas, or anything they may have written before.',
		inputSchema: z.object({
			query: z.string().describe('The search query to run against the vault'),
		}),
		kind: 'read',
		async execute(args: { query: string }) {
			receipts?.recordVaultQuery(args.query);
			try {
				const hits = await retrieval.search(args.query, {
					topK: VAULT_SEARCH_TOP_K,
					scopeFolder: deps.vaultScopeFolder,
				});
				if (hits.length === 0) return ok('No matching notes found in the vault.');
				for (const hit of hits) {
					receipts?.recordVaultDocument({ id: hit.id, path: hit.path, title: hit.title });
				}
				const rendered = hits
					.map((hit, i) => {
						const snippet = hit.snippet ? `\n${hit.snippet}` : '';
						return `${i + 1}. [[${hit.path}]] — ${hit.title}${snippet}`;
					})
					.join('\n\n');
				return ok(rendered);
			} catch (err) {
				const msg = err instanceof Error ? err.message : 'Vault search failed';
				// Preserve pre-migration behaviour: tool errors flow back to the
				// model as a normal (non-thrown) result string, so a search
				// failure is visible to the model but does not abort the turn.
				return ok(`Vault search error: ${msg}`);
			}
		},
	};
}

function buildWebSearchTool(deps: ChatToolDeps): ToolDef {
	const receipts = deps.receipts;
	// The active Web Search profile is looked up once here; the availability
	// resolver already confirmed it exists. If a subsequent settings edit
	// removes the profile the tool call will surface the same "unavailable"
	// path as any other failed provider query.
	const activeWebBinding = ProfileRegistry.getInstance().getActiveWebSearchConfig();
	const webProfileId = activeWebBinding?.profile.id ?? null;
	const webModelId = activeWebBinding?.modelId ?? null;
	return {
		name: 'web_search',
		description:
			'Search the web for up-to-date information, recent events, external knowledge, or facts. ' +
			'Use when the user asks about current events, external products, public data, or anything beyond their personal notes.',
		inputSchema: z.object({
			query: z.string().describe('The search query to look up on the web'),
		}),
		kind: 'read',
		async execute(args: { query: string }) {
			receipts?.recordWebQuery(args.query);
			try {
				const tm = TemplateManager.getInstance();
				if (!tm) return ok('Web search error: template manager not bound');
				const systemPrompt = await tm.render(PromptId.WebSearchToolSystem, {});
				const webProfile = webProfileId
					? ProfileRegistry.getInstance()
							.getAllProfiles()
							.find((p) => p.id === webProfileId)
					: ProfileRegistry.getInstance().getActiveWebSearchProfile();
				if (!webProfile) return ok('Web search error: no active Web Search profile');
				const { text } = await runHarnessText({
					loopId: `${deps.pluginId}-chat-web-search-${crypto.randomUUID()}`,
					profile: webProfile,
					modelId: webModelId ?? webProfile.primaryModel,
					prompt: args.query,
					systemPrompt,
					maxSteps: 1,
				});
				const answer = text || 'No results found.';
				if (receipts) {
					for (const source of extractWebSourcesFromText(answer)) {
						receipts.recordWebSource(source);
					}
				}
				return ok(answer);
			} catch (err) {
				const msg = err instanceof Error ? err.message : 'Web search failed';
				return ok(`Web search error: ${msg}`);
			}
		},
	};
}
