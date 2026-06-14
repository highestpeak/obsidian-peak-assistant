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
// Concrete Obsidian / AI / SQLite / Agent SDK / profile dependencies are
// resolved exactly once at the app composition point
// (`src/app/copilot/actions/composeCopilotActionRuntime.ts`); service
// code closes over the ports and stays fakeable.
//
// Port grouping rule: cohesion over granularity. Each port models a
// capability (talk to AI, read the vault, search semantically, suggest
// tags, run a copilot agent, list custom prompts) — not a single method.

import type { PromptId, PromptVariables } from '@/service/prompt/PromptId';
import type { LLMUsage, LLMStreamEvent } from '@/core/providers/types';
import type { TFile } from 'obsidian';
import type { ActionResult } from '../CopilotActionRegistry';
import type { CustomPromptDef } from '../CustomPromptRegistry';
import type { RankedTagSuggestion } from '../TagSuggestionEngine';
import type { CopilotOutputCollector } from '../CopilotOutputCollector';

/**
 * Talk to the AI provider. Wraps {@link AIServiceManager.renderPrompt},
 * {@link AIServiceManager.queryStructured}, and
 * {@link AIServiceManager.queryTextStream} without exposing the manager
 * itself — the port keeps service code free of any AppContext lookup.
 */
export interface CopilotActionAiPort {
	renderPrompt<T extends PromptId>(promptId: T, variables: PromptVariables[T] | null): Promise<string>;

	queryStructured<R = unknown>(
		promptId: PromptId,
		variables: Record<string, unknown>,
		schema: unknown,
		options?: { signal?: AbortSignal; usageCallback?: (u: LLMUsage) => void },
	): Promise<R>;

	queryTextStream(
		promptId: PromptId,
		variables: Record<string, unknown>,
		options?: { signal?: AbortSignal },
	): AsyncIterable<{ type: 'delta'; text: string } | { type: 'done'; usage?: LLMUsage }>;
}

/**
 * Read Obsidian vault state. Adapters wrap `app.vault` /
 * `app.metadataCache`. Methods are intentionally narrow: actions only
 * need the file list, cached read, file cache lookup, resolved-link
 * snapshot, and linkpath resolution. No write surface.
 */
export interface CopilotActionVaultPort {
	getMarkdownFiles(): TFile[];
	cachedRead(file: TFile): Promise<string>;
	getFileCache(file: TFile): {
		links?: Array<{ link: string }>;
		embeds?: Array<{ link: string }>;
		tags?: Array<{ tag: string }>;
		frontmatter?: { tags?: string[]; [k: string]: unknown };
	} | null;
	getResolvedLinks(): Record<string, Record<string, number>>;
	getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
}

/**
 * Vector / hybrid search over the indexed vault. Wraps
 * {@link SearchClient.vectorSearch} for the find-related action.
 */
export interface CopilotActionSearchPort {
	vectorSearch(input: { text: string; scopeMode: 'vault' | 'current-note'; topK: number }): Promise<{
		items: Array<{
			path: string;
			title?: string;
			score?: number;
			finalScore?: number;
			content?: string;
			highlight?: { text?: string };
		}>;
	}>;
}

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
 * Run a Copilot agent stream. The adapter owns the Agent SDK pool,
 * profile resolution, vault MCP server, and copilot MCP server — every
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
 * Service-side runtime only sees parsed defs — it does not know about
 * Obsidian `TFile` / `TFolder`.
 */
export interface CopilotCustomPromptPort {
	loadAll(): Promise<CustomPromptDef[]>;
}

/**
 * Cohesive port bag handed to {@link createBuiltInCopilotActions} and
 * to the runtime implementation. The app composition layer is the only
 * place that constructs this; tests construct it with fakes.
 */
export interface CopilotActionPorts {
	ai: CopilotActionAiPort;
	vault: CopilotActionVaultPort;
	search: CopilotActionSearchPort;
	semanticGraph: CopilotActionSemanticGraphPort;
	tags: CopilotActionTagsPort;
	agent: CopilotActionAgentPort;
	customPrompts: CopilotCustomPromptPort;
}
