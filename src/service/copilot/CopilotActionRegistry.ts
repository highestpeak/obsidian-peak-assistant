import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import type { LLMStreamEvent } from '@/core/providers/types';

export interface DocumentContext {
	file: VaultFileRef;
	title: string;
	content: string;
	selection?: string;
	scope: 'full' | 'selection';
	wordCount: number;
	tags: string[];
	links: string[];
	backlinks: number;
	headingCount: number;
	isOrphan: boolean;
	frontmatter: Record<string, any>;
}

export interface ActionUsage {
	inputTokens: number;
	outputTokens: number;
}

export type ActionResult =
	| { type: 'structured'; data: any; usage?: ActionUsage }
	| { type: 'stream'; text: string; usage?: ActionUsage }
	| { type: 'error'; message: string };

/**
 * Stable slug identifying which Lucide mark to render for an action.
 * The UI/app surface registry resolves the slug to a real React
 * component — the service layer stays free of `lucide-react` and React
 * component types. Known slugs are listed for editor autocompletion;
 * `string` keeps custom prompts and new actions registrable without a
 * type chase. Unknown slugs surface as a visible fallback rather than
 * crashing the picker — see `getCopilotActionIcon`.
 */
export type CopilotActionIconId =
	| 'sparkles'
	| 'tag'
	| 'message-square-text'
	| 'link-2'
	| 'git-fork'
	| 'lightbulb'
	| 'align-left'
	| 'languages'
	| 'search'
	| 'help-circle'
	| 'layers'
	| 'activity'
	| 'chevron-right'
	| 'pen-line'
	| 'book-open'
	| 'wrap-text'
	| 'share-2'
	| 'shield-check'
	| 'calendar'
	| 'check-square'
	| 'clipboard-list'
	| 'workflow'
	| 'file-text'
	| 'inbox'
	| 'list-checks'
	| 'clipboard-check'
	| 'fingerprint'
	| 'circle-help'
	| 'zap'
	| (string & {});

/**
 * Service-side Copilot action contract.
 *
 * T11 (2026-06-14): removed `icon: LucideIcon` and
 * `ResultPanel: React.ComponentType<...>` from this type — those were
 * UI components that leaked the React layer into service code and
 * forced `src/service/copilot/actions/index.ts` to import 29 result
 * panels. UI binding now lives in the action surface registry under
 * `src/ui/view/copilot/copilot-action-surfaces.tsx`, which maps
 * `iconId` to a Lucide component and `action.id` to a result panel.
 */
export interface CopilotAction {
	id: string;
	label: string;
	description: string;
	iconId: CopilotActionIconId;
	category: 'document' | 'vault' | 'writing';
	intentTab?: 'document' | 'vault' | 'setting';
	requiresDocument?: boolean;
	relevance(ctx: DocumentContext): number;
	guard?(ctx: DocumentContext): string | null;
	execute(ctx: DocumentContext, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent, ActionResult | void>;
}

// T11B (2026-06-14): the static `CopilotActionRegistry` singleton is
// gone. Catalog ownership moved to {@link CopilotActionRuntime} (under
// `src/service/copilot/actions/`) and is bound on the app-owned
// `AppRuntimeRegistry`. The types above (`CopilotAction`,
// `DocumentContext`, `ActionResult`, `ActionUsage`, `CopilotActionIconId`)
// remain the service-side contract.
