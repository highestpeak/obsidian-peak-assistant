import {
	getDefaultReviewTab,
	type CopilotReviewTab,
	type CopilotRunArtifacts,
} from '@/service/copilot/CopilotRunArtifacts';

export type InsightLayoutMode = 'rail' | 'split' | 'full';

export interface CopilotReviewTabModel {
	id: CopilotReviewTab;
	label: string;
	count: number;
	disabled: boolean;
}

export interface CopilotReviewModel {
	activeTab: CopilotReviewTab;
	tabs: CopilotReviewTabModel[];
	canApply: boolean;
	totalChangeBlocks: number;
}

const TAB_LABELS: Record<CopilotReviewTab, string> = {
	changes: 'Changes',
	insights: 'Insights',
	sources: 'Sources',
	chat: 'Chat',
	trace: 'Trace',
};

export function buildCopilotReviewModel(artifacts: CopilotRunArtifacts): CopilotReviewModel {
	const totalChangeBlocks = artifacts.changes.reduce((sum, change) => sum + change.blocks.length, 0);
	const counts: Record<CopilotReviewTab, number> = {
		changes: totalChangeBlocks,
		insights: artifacts.insights.length,
		sources: artifacts.sources.length,
		chat: 0,
		trace: artifacts.trace.length,
	};

	const activeTab = getDefaultReviewTab(artifacts);
	// Chat tab is hidden — follow-up questions surface inline in the Insights tab.
	const visibleTabs: CopilotReviewTab[] = ['changes', 'insights', 'sources', 'trace'];
	const tabs = visibleTabs.map(id => ({
		id,
		label: TAB_LABELS[id],
		count: counts[id],
		disabled: counts[id] === 0,
	}));

	return {
		activeTab,
		tabs,
		canApply: totalChangeBlocks > 0,
		totalChangeBlocks,
	};
}

export function nextInsightLayoutMode(mode: InsightLayoutMode): InsightLayoutMode {
	if (mode === 'rail') return 'split';
	if (mode === 'split') return 'full';
	return 'rail';
}
