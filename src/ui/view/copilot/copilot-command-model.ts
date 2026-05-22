import type { CopilotAction, DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import {
	COPILOT_INTENT_TABS,
	getActionIntentTab,
	getIntentTabDefinition,
	type IntentTabDefinition,
	type IntentTabId,
} from '@/service/copilot/intent-hub';

export interface CopilotActionListItem {
	action: CopilotAction;
	score: number;
	tab: IntentTabId;
	recommended: boolean;
	disabledReason: string | null;
}

export interface CopilotCommandModel {
	tabs: IntentTabDefinition[];
	activeTab: IntentTabDefinition;
	contextLine: string;
	visibleActions: CopilotActionListItem[];
	recommendedActions: CopilotActionListItem[];
}

const RECOMMENDED_SCORE = 0.65;
const MAX_RECOMMENDED_ACTIONS = 4;

function buildContextLine(ctx: DocumentContext | null): string {
	if (!ctx) return 'No active document · context-required actions disabled';

	const scopeLabel = ctx.scope === 'selection' || ctx.selection ? 'selection active' : 'current note';
	return `${ctx.file.path} · ${scopeLabel} · ${ctx.wordCount} words`;
}

function matchesQuery(item: CopilotActionListItem, query: string): boolean {
	if (!query) return true;

	const searchableText = [
		item.action.label,
		item.action.description,
		item.action.id,
	].join(' ').toLowerCase();

	return searchableText.includes(query);
}

function buildActionItem(action: CopilotAction, ctx: DocumentContext | null): CopilotActionListItem {
	const score = ctx ? action.relevance(ctx) : 0;
	const disabledReason = ctx
		? action.guard?.(ctx) ?? null
		: 'Open a document first.';

	return {
		action,
		score,
		tab: getActionIntentTab(action),
		recommended: score >= RECOMMENDED_SCORE,
		disabledReason,
	};
}

function byScoreDescending(a: CopilotActionListItem, b: CopilotActionListItem): number {
	return b.score - a.score;
}

export function buildCopilotCommandModel(params: {
	ctx: DocumentContext | null;
	activeTab: IntentTabId;
	query: string;
	actions: CopilotAction[];
}): CopilotCommandModel {
	const normalizedQuery = params.query.trim().toLowerCase();
	const items = params.actions.map(action => buildActionItem(action, params.ctx));
	const activeTabItems = items.filter(item => item.tab === params.activeTab);

	return {
		tabs: COPILOT_INTENT_TABS,
		activeTab: getIntentTabDefinition(params.activeTab),
		contextLine: buildContextLine(params.ctx),
		visibleActions: activeTabItems
			.filter(item => matchesQuery(item, normalizedQuery))
			.sort(byScoreDescending),
		recommendedActions: activeTabItems
			.filter(item => item.recommended && !item.disabledReason)
			.sort(byScoreDescending)
			.slice(0, MAX_RECOMMENDED_ACTIONS),
	};
}
