// T11 (2026-06-14): UI/app surface registry for Copilot actions.
//
// The service-layer `CopilotAction` contract carries only `iconId` plus
// an `id`. This module resolves both to concrete React components so
// service code stays free of `lucide-react` and result-panel imports.
//
// Single source of truth for:
//   - Lucide icon mark per `iconId`
//   - Result panel per `action.id`
//   - Default panel for `custom-*` prompt actions
//
// If the picker icons disappear or the result modal renders nothing,
// start here — this file owns every Copilot UI binding.

import type { LucideIcon } from 'lucide-react';
import {
	Activity, AlignLeft, BookOpen, Calendar, CheckSquare, ChevronRight,
	CircleHelp, ClipboardCheck, ClipboardList, Fingerprint, FileText,
	GitFork, HelpCircle, Inbox, Languages, Layers, Lightbulb, Link2,
	ListChecks, MessageSquareText, PenLine, Search, Share2, ShieldCheck,
	Sparkles, Tag, Workflow, WrapText, Zap,
} from 'lucide-react';
import React from 'react';
import type { ComponentType } from 'react';
import type { CopilotActionIconId } from '@/service/copilot/CopilotActionRegistry';

import { PolishPanel } from '@/ui/view/copilot/panels/PolishPanel';
import { FormatPolishPanel } from '@/ui/view/copilot/panels/FormatPolishPanel';
import { ReviewPanel } from '@/ui/view/copilot/panels/ReviewPanel';
import { LinkSuggestPanel } from '@/ui/view/copilot/panels/LinkSuggestPanel';
import { SemanticLinkSuggestPanel } from '@/ui/view/copilot/panels/SemanticLinkSuggestPanel';
import { SplitPanel } from '@/ui/view/copilot/panels/SplitPanel';
import { TagSuggestionPanel } from '@/ui/view/copilot/panels/TagSuggestionPanel';
import { SummarizePanel } from '@/ui/view/copilot/panels/SummarizePanel';
import { ExtractConceptsPanel } from '@/ui/view/copilot/panels/ExtractConceptsPanel';
import { TranslatePanel } from '@/ui/view/copilot/panels/TranslatePanel';
import { FindRelatedPanel } from '@/ui/view/copilot/panels/FindRelatedPanel';
import { KnowledgeGapsPanel } from '@/ui/view/copilot/panels/KnowledgeGapsPanel';
import { SynthesizePanel } from '@/ui/view/copilot/panels/SynthesizePanel';
import { VaultHealthPanel } from '@/ui/view/copilot/panels/VaultHealthPanel';
import { CorrectContentPanel } from '@/ui/view/copilot/panels/CorrectContentPanel';
import { VaultSummaryPanel } from '@/ui/view/copilot/panels/VaultSummaryPanel';
import { ContinueWritingPanel } from '@/ui/view/copilot/panels/ContinueWritingPanel';
import { RewriteSelectionPanel } from '@/ui/view/copilot/panels/RewriteSelectionPanel';
import { AddEvidencePanel } from '@/ui/view/copilot/panels/AddEvidencePanel';
import { ExtractTodosPanel } from '@/ui/view/copilot/panels/ExtractTodosPanel';
import { WritingPlanPanel } from '@/ui/view/copilot/panels/WritingPlanPanel';
import { WorkflowPanel } from '@/ui/view/copilot/panels/WorkflowPanel';
import { WriteArticlePanel } from '@/ui/view/copilot/panels/WriteArticlePanel';
import { DetectAndFilePanel } from '@/ui/view/copilot/panels/DetectAndFilePanel';
import { CheckTaskListPanel } from '@/ui/view/copilot/panels/CheckTaskListPanel';
import { PromptAuditPanel } from '@/ui/view/copilot/panels/PromptAuditPanel';
import { DeduplicateScanPanel } from '@/ui/view/copilot/panels/DeduplicateScanPanel';
import { FindAndSolveTasksPanel } from '@/ui/view/copilot/panels/FindAndSolveTasksPanel';
import { SmartConnectionsPanel } from '@/ui/view/copilot/panels/SmartConnectionsPanel';

/**
 * Result panels each carry a panel-specific props interface (e.g.
 * `PolishPanelProps`). The result modal hands every panel the same
 * superset of fields — see `CopilotResultModal` — and panels destructure
 * what they need. We keep this surface type loose on purpose: tightening
 * would require either a discriminated union over 29 panels or a forced
 * cast at every binding site. Loose typing here mirrors the prior
 * `ResultPanel: React.ComponentType<...>` shape that was stored as
 * `any`, without re-introducing a service-side React component type.
 */
export type CopilotResultPanel = ComponentType<any>;

const ICON_MAP: Record<string, LucideIcon> = {
	'sparkles': Sparkles,
	'tag': Tag,
	'message-square-text': MessageSquareText,
	'link-2': Link2,
	'git-fork': GitFork,
	'lightbulb': Lightbulb,
	'align-left': AlignLeft,
	'languages': Languages,
	'search': Search,
	'help-circle': HelpCircle,
	'layers': Layers,
	'activity': Activity,
	'chevron-right': ChevronRight,
	'pen-line': PenLine,
	'book-open': BookOpen,
	'wrap-text': WrapText,
	'share-2': Share2,
	'shield-check': ShieldCheck,
	'calendar': Calendar,
	'check-square': CheckSquare,
	'clipboard-list': ClipboardList,
	'workflow': Workflow,
	'file-text': FileText,
	'inbox': Inbox,
	'list-checks': ListChecks,
	'clipboard-check': ClipboardCheck,
	'fingerprint': Fingerprint,
	'circle-help': CircleHelp,
	'zap': Zap,
};

const PANEL_MAP: Record<string, CopilotResultPanel> = {
	'polish': PolishPanel,
	'format-polish': FormatPolishPanel,
	'review': ReviewPanel,
	'suggest-links': LinkSuggestPanel,
	'suggest-semantic-links': SemanticLinkSuggestPanel,
	'suggest-split': SplitPanel,
	'suggest-tags': TagSuggestionPanel,
	'summarize': SummarizePanel,
	'extract-concepts': ExtractConceptsPanel,
	'translate': TranslatePanel,
	'find-related': FindRelatedPanel,
	'knowledge-gaps': KnowledgeGapsPanel,
	'synthesize-topic': SynthesizePanel,
	'vault-health': VaultHealthPanel,
	'correct-content': CorrectContentPanel,
	'vault-summary': VaultSummaryPanel,
	'continue-writing': ContinueWritingPanel,
	'rewrite-selection': RewriteSelectionPanel,
	'add-evidence': AddEvidencePanel,
	'extract-todos': ExtractTodosPanel,
	'writing-plan': WritingPlanPanel,
	'run-workflow': WorkflowPanel,
	'write-article': WriteArticlePanel,
	'detect-and-file': DetectAndFilePanel,
	'check-task-list': CheckTaskListPanel,
	'prompt-audit': PromptAuditPanel,
	'deduplicate-scan': DeduplicateScanPanel,
	'find-solve-tasks': FindAndSolveTasksPanel,
	'smart-connections': SmartConnectionsPanel,
};

/**
 * Custom prompts loaded by `CustomPromptRegistry.buildAction` get an
 * `id` of `custom-<slug>`. They all stream agent output as plain text
 * which `WritingPlanPanel` already renders — we resolve every
 * `custom-*` action to it as a stable default.
 */
const CUSTOM_PROMPT_DEFAULT_PANEL: CopilotResultPanel = WritingPlanPanel;

const FallbackIcon: LucideIcon = HelpCircle;

const MissingPanelFallback: CopilotResultPanel = ({ onClose }) => (
	<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-3 pktw-py-12 pktw-px-6 pktw-text-center">
		<span className="pktw-text-sm pktw-font-medium pktw-text-pk-foreground">No result panel registered for this action.</span>
		<span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-max-w-md">
			This is a Copilot wiring bug — the action ran but no UI is bound. Check src/ui/view/copilot/copilot-action-surfaces.tsx.
		</span>
		<button
			type="button"
			onClick={onClose}
			className="pktw-mt-2 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-rounded-md pktw-border pktw-border-pk-border pktw-text-pk-foreground hover:pktw-bg-pk-accent-tint"
		>
			Close
		</button>
	</div>
);

/**
 * Resolve a service-side `iconId` to a Lucide component. Unknown ids
 * return the generic help-circle so the picker stays usable even when
 * a slug is mistyped or a future action defines an iconId without a
 * registry entry.
 */
export function getCopilotActionIcon(iconId: string | undefined): LucideIcon {
	if (!iconId) return FallbackIcon;
	return ICON_MAP[iconId] ?? FallbackIcon;
}

/**
 * Resolve an action id to its result panel. Custom prompts (`custom-*`)
 * use the default panel. Returns a visible "wiring bug" fallback when
 * no binding exists so the result modal never silently renders blank.
 */
export function getCopilotResultPanel(actionId: string): CopilotResultPanel {
	const panel = PANEL_MAP[actionId];
	if (panel) return panel;
	if (actionId.startsWith('custom-')) return CUSTOM_PROMPT_DEFAULT_PANEL;
	return MissingPanelFallback;
}

/**
 * `true` when an explicit binding exists (built-in or `custom-*`
 * default). Picker callers use this to decide whether to gate a
 * capability behind "missing UI" gates if/when needed; today it is
 * exercised by the binding-completeness guard test.
 */
export function hasCopilotResultPanel(actionId: string): boolean {
	if (PANEL_MAP[actionId]) return true;
	if (actionId.startsWith('custom-')) return true;
	return false;
}

/**
 * Internal exports for the surface-binding completeness test. Tests
 * read these to assert that every built-in action id has a registered
 * panel and that the icon map covers every documented slug.
 */
export const _internal = {
	ICON_MAP,
	PANEL_MAP,
	CUSTOM_PROMPT_DEFAULT_PANEL,
	FallbackIcon,
};

// Mark CopilotActionIconId as used (declaration-only re-export keeps
// the type visible from this module for downstream callers).
export type { CopilotActionIconId };
