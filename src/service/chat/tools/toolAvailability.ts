/**
 * ToolAvailability resolver — the single source of truth for "which tools does
 * the current Chat context actually have?" (plan §5.2 R1).
 *
 * This layer is deliberately pure data:
 *   - takes a snapshot of the dependencies (retrieval port, MCP manager,
 *     profile registry, capability flags, UI toggles);
 *   - returns a list of `ToolAvailability` records the Composer, the Chat
 *     builder and the error UI can all consume;
 *   - has no side effects, no I/O, no singletons.
 *
 * Consumers:
 *   - `buildChatHarnessTools` — filters `available` records into ToolDefs.
 *   - `AIServiceManager.getToolAvailability()` — exposes the same data to the
 *     UI (Composer Sources popover in a later task; B1 only wires the
 *     accessor + tests, no UI change).
 *   - B2 (Assistant policy) will layer allow/deny on top of this list; deny
 *     wins over `available`, so the state machine here must stay narrow.
 */

import type { VaultRetrievalPort } from '@/core/ports/VaultRetrievalPort';
import type { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { MCPClientManager } from '@/service/mcp/MCPClientManager';
import type { Profile } from '@/core/profiles/types';
import type { ModelCapabilities } from '@/core/providers/types';
import {
	NULL_WEB_SEARCH_PROVIDER,
	type WebSearchProvider,
} from './webSearchProvider';
import {
	NULL_MEDIA_GENERATION_PROBE,
	type MediaGenerationProbe,
} from './mediaGenerationProbe';

export type ToolAvailabilityState =
	| 'available'
	| 'unconfigured'
	| 'unsupported'
	| 'disconnected'
	| 'permission-required';

export type ToolConfigureAction = 'profiles' | 'mcp' | 'media' | 'permissions';

export interface ToolAvailability {
	toolId: string;
	state: ToolAvailabilityState;
	reason?: string;
	configureAction?: ToolConfigureAction;
}

export interface ToolAvailabilityContext {
	/** UI toggle (chat-studio RUN-01). */
	enableVaultSearch: boolean;
	/** UI toggle. */
	enableWebSearch: boolean;
	/** Retrieval port — absent = Vault Search unavailable. */
	vaultRetrieval?: VaultRetrievalPort | null;
	/** ProfileRegistry snapshot (Web Search fallback profile discovery). */
	profileRegistry?: ProfileRegistry | null;
	/** MCP manager — absent = MCP absent altogether. */
	mcpClientManager?: MCPClientManager | null;
	/** Live capability snapshot of the resolved chat model. */
	modelCapabilities?: ModelCapabilities;
	/** Resolved chat profile + model id (for native web-search adapter checks). */
	profile?: Profile | null;
	modelId?: string | null;
	/** DI seam: future real native adapter registry. */
	webSearchProvider?: WebSearchProvider;
	/**
	 * D1 §R1: sync probe over `MediaGenerationService` (or null when the
	 * app-layer runtime has not built the service yet — desktop-only for
	 * now). Null = `media_generate` is reported as `unconfigured` with a
	 * generic "not wired" reason.
	 */
	mediaGenerationProbe?: MediaGenerationProbe | null;
	/**
	 * Zero-gap Track D (2026-07-21): true when the app-owned
	 * ArtifactProducerService is composed. Null = `artifact_create` reports
	 * as `unconfigured` (producer not wired at boot).
	 */
	artifactCreateReady?: boolean;
	peakSheetReady?: boolean;
}

/**
 * Compute the availability list for every tool the Chat runtime knows about.
 * Order is stable: vault_search → web_search → mcp_* (in server-discovery
 * order), so consumers that render this list get a predictable sequence.
 *
 * MCP servers that are configured but not `connected` land as `disconnected`.
 * MCP servers with zero discovered tools are represented by ZERO records — the
 * server itself is not a tool. The Settings UI (out of scope) is where the
 * user reconnects; the availability list only reports what a tool consumer
 * can act on today.
 */
export function resolveToolAvailability(
	ctx: ToolAvailabilityContext,
): ToolAvailability[] {
	const out: ToolAvailability[] = [];

	// ── vault_search ──────────────────────────────────────────────────────────
	out.push(resolveVaultSearchAvailability(ctx));

	// ── web_search ────────────────────────────────────────────────────────────
	out.push(resolveWebSearchAvailability(ctx));

	// ── media_generate ───────────────────────────────────────────────────────
	out.push(resolveMediaGenerateAvailability(ctx));

	// ── artifact_create ──────────────────────────────────────────────────────
	out.push(resolveArtifactCreateAvailability(ctx));

	for (const toolId of ['peak_sheet_list', 'peak_sheet_query', 'peak_sheet_analyze', 'peak_sheet_patch', 'peak_sheet_create']) {
		out.push(ctx.peakSheetReady
			? { toolId, state: 'available' }
			: { toolId, state: 'unconfigured', reason: 'Peak Sheet runtime is not wired' });
	}

	// ── mcp_* ────────────────────────────────────────────────────────────────
	for (const rec of resolveMcpAvailability(ctx)) out.push(rec);

	return out;
}

/**
 * `media_generate` is available when the sync probe reports at least one
 * media kind (image / video / music) has at least one route ready today.
 * When no probe is wired we surface `unconfigured` with a `media` action —
 * the boot-time runtime binding is what turns it on.
 */
function resolveMediaGenerateAvailability(
	ctx: ToolAvailabilityContext,
): ToolAvailability {
	const probe = ctx.mediaGenerationProbe ?? NULL_MEDIA_GENERATION_PROBE;
	const snapshot = probe.snapshot();
	if (!snapshot) {
		return {
			toolId: 'media_generate',
			state: 'unconfigured',
			reason: 'Media generation runtime is not wired',
			configureAction: 'media',
		};
	}
	// If ANY kind can execute today, expose the tool; per-kind availability
	// is re-checked at execute time via preflight.
	const anyReady = Object.values(snapshot.perKind).some((k) => k.anyRouteReady);
	if (anyReady) {
		return { toolId: 'media_generate', state: 'available' };
	}
	// No route ready for any kind — surface the primary reason (image has
	// the most concrete producer today, so we key its per-route problems).
	const image = snapshot.perKind.image;
	const nativeReason = image.routes.native.reason ?? 'no-adapter';
	const falMissing = !image.routes.fal.configured;
	const reason = falMissing
		? 'fal.ai API key not configured; no native provider ready either'
		: `native provider not ready (${nativeReason})`;
	return {
		toolId: 'media_generate',
		state: 'unconfigured',
		reason,
		configureAction: 'media',
	};
}

/**
 * Zero-gap Track D (2026-07-21): `artifact_create` is available whenever the
 * app-owned ArtifactProducerService is composed. Ready-check is a single
 * boolean since the producer has no per-request runtime prerequisites (the
 * vault writer is always safe to call).
 */
function resolveArtifactCreateAvailability(
	ctx: ToolAvailabilityContext,
): ToolAvailability {
	if (!ctx.artifactCreateReady) {
		return {
			toolId: 'artifact_create',
			state: 'unconfigured',
			reason: 'Artifact producer runtime is not wired',
		};
	}
	return { toolId: 'artifact_create', state: 'available' };
}

function resolveVaultSearchAvailability(
	ctx: ToolAvailabilityContext,
): ToolAvailability {
	if (!ctx.enableVaultSearch) {
		return {
			toolId: 'vault_search',
			state: 'unconfigured',
			reason: 'Vault Search toggle is off',
			configureAction: 'permissions',
		};
	}
	if (!ctx.vaultRetrieval) {
		return {
			toolId: 'vault_search',
			state: 'unsupported',
			reason: 'Vault retrieval index is not ready',
		};
	}
	return { toolId: 'vault_search', state: 'available' };
}

function resolveWebSearchAvailability(
	ctx: ToolAvailabilityContext,
): ToolAvailability {
	if (!ctx.enableWebSearch) {
		return {
			toolId: 'web_search',
			state: 'unconfigured',
			reason: 'Web Search toggle is off',
			configureAction: 'permissions',
		};
	}
	// Native route: only counts if a real adapter can execute the search.
	// Today no adapter exists → provider always returns false. Catalog
	// metadata alone MUST NOT gate the fallback (plan §5.2 R2).
	const provider = ctx.webSearchProvider ?? NULL_WEB_SEARCH_PROVIDER;
	const nativeReady = provider.isNativeAvailable({
		profile: ctx.profile ?? null,
		modelId: ctx.modelId ?? null,
		capabilityFlag: ctx.modelCapabilities?.webSearch ?? false,
	});
	if (nativeReady) {
		return { toolId: 'web_search', state: 'available' };
	}

	// Fallback: a configured Web Search profile provides the tool via
	// Harness model execution. Absent profile registry OR active profile ⇒
	// unconfigured (user needs to pick a Web Search profile in Settings).
	const activeWebProfile = ctx.profileRegistry?.getActiveWebSearchProfile();
	if (!activeWebProfile) {
		return {
			toolId: 'web_search',
			state: 'unconfigured',
			reason: 'No active Web Search profile configured',
			configureAction: 'profiles',
		};
	}
	return { toolId: 'web_search', state: 'available' };
}

function resolveMcpAvailability(
	ctx: ToolAvailabilityContext,
): ToolAvailability[] {
	if (!ctx.mcpClientManager) return [];
	const out: ToolAvailability[] = [];

	// Only servers that are connected surface real tools. Everything else
	// (configured-but-not-connected, error) becomes a single `disconnected`
	// record per server so the UI can direct the user to "reconnect".
	const infos = ctx.mcpClientManager.getAllConnectionInfo();
	const connectedServerIds = new Set<string>();
	for (const info of infos) {
		if (info.status === 'connected') {
			connectedServerIds.add(info.serverId);
		} else {
			out.push({
				toolId: `mcp_server:${info.serverId}`,
				state: 'disconnected',
				reason:
					info.error ??
					(info.status === 'connecting'
						? 'Connecting to MCP server'
						: `MCP server "${info.serverId}" is not connected`),
				configureAction: 'mcp',
			});
		}
	}

	// Per-tool records for the connected servers.
	const discovered = ctx.mcpClientManager.getAllDiscoveredTools();
	for (const { serverId, serverName, tools } of discovered) {
		if (!connectedServerIds.has(serverId)) continue;
		for (const t of tools) {
			out.push({
				toolId: buildMcpToolId(serverName, t.name),
				state: 'available',
			});
		}
	}

	return out;
}

// Kept in sync with MCPToolAdapter.mcpToolToToolDef namespacing. Extracted so
// availability records and ToolDef records agree on the same string key.
function buildMcpToolId(serverName: string, toolName: string): string {
	const safe = serverName
		.replace(/[^a-zA-Z0-9]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
	return `mcp_${safe}_${toolName}`;
}

/**
 * Convenience: filter the resolver output down to `available` tool ids.
 * `buildChatHarnessTools` uses this to gate ToolDef construction.
 */
export function availableToolIds(records: ToolAvailability[]): Set<string> {
	return new Set(records.filter((r) => r.state === 'available').map((r) => r.toolId));
}
