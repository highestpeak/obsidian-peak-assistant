import type { CopilotAction, DocumentContext } from './CopilotActionRegistry';
import { getActionIntentTab, type IntentTabId } from './intent-hub';

export type PlannedCapabilityRisk = 'read-only' | 'suggests-change' | 'mutates-after-review';

export interface PlannedCapability {
	action: CopilotAction;
	score: number;
	reason: string;
	risk: PlannedCapabilityRisk;
}

export interface CopilotAutoPlan {
	tab: IntentTabId;
	analysisSummary: string;
	signals: string[];
	selectedActions: PlannedCapability[];
	skippedActions: Array<{ action: CopilotAction; reason: string }>;
}

const MIN_AUTO_SCORE = 0.35;
const MAX_AUTO_ACTIONS = 4;

const MUTATES_AFTER_REVIEW_ACTION_IDS = new Set([
	'polish',
	'format-polish',
	'correct-content',
	'rewrite-selection',
	'add-evidence',
]);

const SUGGESTS_CHANGE_ACTION_IDS = new Set([
	'suggest-tags',
	'suggest-links',
	'suggest-semantic-links',
	'smart-connections',
]);

function getRisk(action: CopilotAction): PlannedCapabilityRisk {
	if (MUTATES_AFTER_REVIEW_ACTION_IDS.has(action.id)) return 'mutates-after-review';
	if (SUGGESTS_CHANGE_ACTION_IDS.has(action.id)) return 'suggests-change';
	return 'read-only';
}

function buildSignals(ctx: DocumentContext): string[] {
	const signals = [ctx.scope === 'selection' || ctx.selection ? 'selection active' : 'current note'];
	if (ctx.isOrphan) signals.push('orphan note');
	if (ctx.links.length < 3) signals.push('few outgoing links');
	if (ctx.tags.length === 0) signals.push('missing tags');
	if (ctx.backlinks === 0) signals.push('no backlinks');
	if (ctx.wordCount > 300) signals.push('long enough for review');
	if (ctx.headingCount > 2) signals.push('structured note');
	return signals;
}

function buildAnalysisSummary(ctx: DocumentContext, signals: string[]): string {
	const target = ctx.scope === 'selection' || ctx.selection ? 'the active selection' : 'the current note';
	return `Auto analyzed ${target} and found ${signals.join(', ')}.`;
}

function reasonFor(action: CopilotAction, ctx: DocumentContext, signals: string[]): string {
	if (action.id === 'suggest-tags') {
		return signals.includes('missing tags')
			? 'The note has no tags, so tag suggestions can improve findability.'
			: 'Tag suggestions can refine the note metadata before saving changes.';
	}

	if (action.id === 'suggest-links' || action.id === 'suggest-semantic-links' || action.id === 'smart-connections') {
		return signals.includes('orphan note') || signals.includes('few outgoing links') || signals.includes('no backlinks')
			? 'The note has weak connection signals, so related-note discovery is useful.'
			: 'Related-note discovery can improve navigation from this context.';
	}

	if (action.id === 'add-evidence') {
		return ctx.scope === 'selection' || ctx.selection
			? 'The selected claim can be checked for source-backed support before editing.'
			: 'The note is long enough to inspect for unsupported claims.';
	}

	if (action.id === 'polish' || action.id === 'format-polish') {
		return ctx.scope === 'selection' || ctx.selection
			? 'The selected text can be cleaned up after you review the proposed edit.'
			: 'The current note is ready for review-backed clarity and formatting improvements.';
	}

	if (action.id === 'correct-content') {
		return 'The note is substantial enough to check for factual, logical, and reference issues.';
	}

	if (action.id === 'rewrite-selection') {
		return 'The active selection can be rewritten after you review the proposed wording.';
	}

	if (action.id === 'vault-health') {
		return 'Vault-level Auto should surface maintenance and health signals first.';
	}

	if (action.id === 'prompt-audit') {
		return 'Setting Auto should diagnose prompt quality and system configuration health.';
	}

	return `Planner selected ${action.label} because it is relevant to the current ${ctx.scope}.`;
}

function skippedReason(score: number, guardReason: string | null): string {
	if (guardReason) return guardReason;
	if (score < MIN_AUTO_SCORE) return 'Low relevance for the current context.';
	return 'Deferred because Auto only starts the top four relevant actions.';
}

export function planCopilotAutoRun(params: {
	tab: IntentTabId;
	ctx: DocumentContext;
	actions: CopilotAction[];
}): CopilotAutoPlan {
	const signals = buildSignals(params.ctx);
	const rankedActions = params.actions
		.filter(action => getActionIntentTab(action) === params.tab)
		.map(action => ({
			action,
			score: action.relevance(params.ctx),
			guardReason: action.guard?.(params.ctx) ?? null,
		}))
		.sort((a, b) => b.score - a.score);

	const selectedActionIds = new Set<string>();
	const selectedActions = rankedActions
		.filter(item => !item.guardReason && item.score >= MIN_AUTO_SCORE)
		.slice(0, MAX_AUTO_ACTIONS)
		.map(item => {
			selectedActionIds.add(item.action.id);
			return {
				action: item.action,
				score: item.score,
				reason: reasonFor(item.action, params.ctx, signals),
				risk: getRisk(item.action),
			};
		});

	const skippedActions = rankedActions
		.filter(item => !selectedActionIds.has(item.action.id))
		.map(item => ({
			action: item.action,
			reason: skippedReason(item.score, item.guardReason),
		}));

	return {
		tab: params.tab,
		analysisSummary: buildAnalysisSummary(params.ctx, signals),
		signals,
		selectedActions,
		skippedActions,
	};
}
