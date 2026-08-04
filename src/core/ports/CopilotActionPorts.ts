// T11B (2026-06-14): Explicit deps / ports for Copilot manual action
// execution.
//
// Before T11B the action `execute()` bodies inside
// `src/service/copilot/actions/index.ts` resolved every concrete
// dependency through `AppContext.getInstance()`,
// `SqliteStoreManager.getInstance()`, and `ProfileRegistry.getInstance()`.
// That made the action catalog a giant service-locator surface — actions
// could not be exercised without booting the full plugin, and the
// boundary scanner correctly counted dozens of service -> app edges.
//
// T11B replaces those hidden lookups with a small set of cohesive ports.
// Concrete Obsidian / AI / SQLite / Peak Harness / profile dependencies are
// resolved exactly once at the app composition point
// (`src/app/copilot/actions/composeCopilotActionRuntime.ts`); service
// code closes over the ports and stays fakeable.
//
// Port grouping rule: cohesion over granularity. Each port models a
// capability (talk to AI, read the vault, search semantically, suggest
// tags, run a copilot agent, list custom prompts) — not a single method.

import type { LLMStreamEvent } from '@/core/providers/types';
import type { DocumentVaultReaderPort } from '@/core/ports/DocumentVaultReaderPort';
import type { VaultMetadataResolverPort } from '@/core/ports/VaultMetadataResolverPort';
import type { VaultMetadataCachePort } from '@/core/ports/VaultMetadataCachePort';
import type { SearchAvailabilityPort } from '@/core/ports/SearchAvailabilityPort';
import type { CustomPromptSourcePort } from '@/core/ports/CustomPromptSourcePort';
import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';
import type { ActionResult } from '@/service/copilot/CopilotActionRegistry';
import type { RankedTagSuggestion } from '@/service/copilot/TagSuggestionEngine';
import type { CopilotOutputCollector } from '@/service/copilot/CopilotOutputCollector';
import type { PromptTemplateRendererPort } from '@/core/ports/PromptTemplateRendererPort';

/**
 * Talk to the AI provider. Service-side actions consume the general
 * {@link IAgentPrompter} surface that other service-side agents use
 * (search synthesis, AI graph, intuition, copilot agents) — no
 * Copilot-specific AI wrapper exists.
 *
 * Built-in actions use `queryStream` for streaming text actions and
 * `queryStructured` for JSON-shaped actions; both already cover the
 * usage callback + abort signal shape the action runtime needs.
 *
 * T11Y-7a (was T11B): retired the bespoke `CopilotActionAiPort` and
 * `AppCopilotActionAiAdapter` in favor of the shared port — the
 * `AIServiceManager` already satisfies `IAgentPrompter` structurally so
 * the composition layer hands it directly.
 */
export type CopilotActionAiPort = IAgentPrompter;

// T11Y-7b: the bespoke `CopilotActionVaultPort` is retired in favor of
// composing three existing narrow ports:
//   - {@link DocumentVaultReaderPort}    — list files + cached read,
//   - {@link VaultMetadataResolverPort}  — linkpath resolution,
//   - {@link VaultMetadataCachePort}     — per-file cache + resolved-links.
// The old port re-implemented all five methods in
// `ObsidianCopilotActionVaultAdapter`; the adapter is deleted and the
// composition layer hands the existing `AppVaultReaderAdapter` plus the
// new `AppVaultMetadataCacheAdapter` to the port bag.

/**
 * Vector / hybrid search over the indexed vault. Used by the
 * find-related action.
 *
 * T11Y-7c: this is now an alias of the shared {@link SearchAvailabilityPort},
 * which explicitly distinguishes "search subsystem not ready" from
 * "search ran and returned zero hits". The previous shape collapsed both.
 */
export type CopilotActionSearchPort = SearchAvailabilityPort;

/** Suggestion item for unlinked semantic neighbors (suggest-semantic-links). */
export interface SemanticLinkNeighbor {
	path: string;
	title: string;
	score: number;
	direction: 'outgoing' | 'incoming';
	snippet: string;
}

/** Suggestion item for smart-connections via embedding neighbors. */
export interface SmartConnection {
	path: string;
	title: string;
	similarityScore: number;
	sharedThemes: string[];
	suggestedLinkText: string;
}

/**
 * Graph / embedding lookups for the two semantic actions
 * (`suggest-semantic-links`, `smart-connections`). The adapter owns
 * every `sqliteStoreManager` / `getSemanticNeighbors` call so service
 * code is decoupled from the storage layer.
 */
export interface CopilotActionSemanticGraphPort {
	findSemanticLinkNeighbors(
		filePath: string,
		existingLinkPaths: Set<string>,
	): Promise<{ suggestions: SemanticLinkNeighbor[]; totalNeighbors: number; indexed: boolean }>;

	findSmartConnections(
		filePath: string,
		existingLinkPaths: Set<string>,
	): Promise<{ connections: SmartConnection[]; indexed: boolean }>;
}

/** Tag suggestion port — wraps {@link TagSuggestionEngine} + persistence. */
export interface CopilotActionTagsPort {
	suggestTags(docPath: string, content: string, title: string): Promise<RankedTagSuggestion[]>;
	persistSuggestionBatch(input: {
		docPath: string;
		batchId: string;
		suggestions: Array<{
			tag: string;
			category: 'topic' | 'keyword' | 'functional';
			confidence: number;
			sources: Array<'content' | 'graph' | 'history'>;
			reason: string;
			isExisting: boolean;
		}>;
	}): Promise<void>;
}

/**
 * Run a Copilot agent stream. The adapter owns Harness model binding,
 * profile resolution, vault tools, and copilot output tools — every
 * concrete `AppContext` / `ProfileRegistry` access happens behind this
 * port. Service-side actions just hand over a system + user prompt.
 */
export interface CopilotActionAgentPort {
	runAgentStream(options: {
		systemPrompt: string;
		userPrompt: string;
		signal?: AbortSignal;
		collector?: CopilotOutputCollector;
		maxTurns?: number;
	}): AsyncGenerator<LLMStreamEvent, ActionResult | void>;
}

/**
 * Source of custom prompt definitions. Implementations parse user
 * markdown files (the default Obsidian-folder source lives in
 * `src/app/copilot/actions/ObsidianCustomPromptSourceAdapter.ts`).
 *
 * T11Y-7d (2026-06-30): this is now a type-alias of the shared
 * {@link CustomPromptSourcePort} — scanning user prompt files is not a
 * Copilot-action concern, the runtime is just one consumer of parsed
 * prompt defs.
 */
export type CopilotCustomPromptPort = CustomPromptSourcePort;

/**
 * Cohesive port bag handed to {@link createBuiltInCopilotActions} and
 * to the runtime implementation. The app composition layer is the only
 * place that constructs this; tests construct it with fakes.
 */
export interface CopilotActionPorts {
	ai: CopilotActionAiPort;
	/** Read vault files + cached text reads. (T11Y-7b: shared with loaders.) */
	vaultReader: DocumentVaultReaderPort;
	/** Resolve `[[link]]` text to vault paths. (T11Y-7b: shared with loaders.) */
	linkResolver: VaultMetadataResolverPort;
	/** Per-file metadata cache + resolved-links graph. (T11Y-7b: new narrow port.) */
	vaultMetadataCache: VaultMetadataCachePort;
	search: CopilotActionSearchPort;
	semanticGraph: CopilotActionSemanticGraphPort;
	tags: CopilotActionTagsPort;
	agent: CopilotActionAgentPort;
	/** Shared Handlebars owner for user-authored Custom Prompt templates. */
	promptTemplates: PromptTemplateRendererPort;
	customPrompts: CopilotCustomPromptPort;
}
