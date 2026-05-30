import React, { useEffect, useMemo, useState } from 'react';
import { Segmented } from '@/ui/components/primitives';
import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { TimeRange } from '@/service/usage/types';
import {
	OverviewScreen,
	ProviderModelScreen,
	OutcomeValueScreen,
	BudgetAlertsScreen,
	HistoryScreen,
	OptimizationScreen,
} from './screens';

/**
 * Usage Dashboard root — 6-screen carrier surface (spec §6.1 F).
 *
 * PR-Dash-1 lays down the navigation skeleton: a Segmented tab strip across
 * the top (Overview / Provider & Model / Outcome Value / Budget & Alerts /
 * History / Optimization) plus a Time-range Segmented (Today / 7d / 30d /
 * All). Each screen renders a placeholder section list.
 *
 * Data wiring lives in PR-Dash-2 — UsageOutcomeService + UsageLogRepo are
 * untouched here.
 */

type ScreenId =
	| 'overview'
	| 'provider-model'
	| 'outcome-value'
	| 'budget-alerts'
	| 'history'
	| 'optimization';

interface ScreenMeta {
	id: ScreenId;
	num: string;
	label: string;
	title: string;
	subtitle: string;
}

interface TimeRangeMeta {
	value: TimeRange;
	label: string;
}

export interface OverviewKpiStrings {
	label: string;
	help?: string;
	empty?: string;
}

export interface OverviewStrings {
	kpi: {
		mpg: OverviewKpiStrings;
		totalCost: OverviewKpiStrings;
		usefulMessages: OverviewKpiStrings;
		totalCalls: OverviewKpiStrings;
	};
	funnel: {
		title: string;
		subtitle: string;
		stages: { invoked: string; inspected: string; adopted: string };
		empty: string;
	};
	outcomeBreakdown: {
		title: string;
		subtitle: string;
		empty: string;
		events: Record<string, string>;
	};
}

export interface DetailPanelStrings {
	title: string;
	subtitle: string;
	close: string;
	privacyDisabled: string;
	missingMetadata: string;
	unknownFeature: string;
	sections: {
		prompt: string;
		response: string;
		attachedFiles: string;
		toolsUsed: string;
		query: string;
		topResults: string;
		clicked: string;
		taskGoal: string;
		stepName: string;
		stepTools: string;
		previousStep: string;
		filePath: string;
		selectionBefore: string;
		selectionAfter: string;
		accepted: string;
		rejected: string;
		document: string;
		chunks: string;
		embeddingModel: string;
		showFullPrompt: string;
	};
	verbs: {
		openChat: string;
		openSearch: string;
		openTrace: string;
		openEditor: string;
		openDocument: string;
	};
}

export interface ProviderModelStrings {
	providerSection: { title: string; subtitle: string };
	modelSection: { title: string; subtitle: string };
	columns: {
		provider: string;
		model: string;
		calls: string;
		tokens: string;
		cost: string;
		share: string;
	};
	empty: string;
}

export interface OutcomeValueStrings {
	perFeatureSection: { title: string; subtitle: string };
	columns: {
		feature: string;
		calls: string;
		useful: string;
		adopted: string;
		adoptRate: string;
		totalCost: string;
		mpg: string;
	};
	features: Record<string, string>;
	empty: string;
	unattributed: string;
	unattributedHelp: string;
}

export interface DashboardStrings {
	title: string;
	timeRange: Record<TimeRange, string>;
	screens: Record<string, ScreenMeta>;
	overview: OverviewStrings;
	detailPanel: DetailPanelStrings;
	providerModel: ProviderModelStrings;
	outcomeValue: OutcomeValueStrings;
}

/**
 * Hard-coded English fallback used when TemplateManager has not loaded
 * `dashboard.json` yet. Mirrors `templates/config/dashboard.json` shape.
 * Centralized here so the view never has to swallow a load race.
 */
const FALLBACK_STRINGS: DashboardStrings = {
	title: 'Token Usage',
	timeRange: {
		today: 'Today',
		'7d': '7d',
		'30d': '30d',
		all: 'All',
	},
	screens: {
		overview: { id: 'overview', num: '01', label: 'Overview', title: 'Usage Intelligence', subtitle: 'Understand usage, control cost, and keep context healthy.' },
		providerModel: { id: 'provider-model', num: '02', label: 'Provider & Model', title: 'Provider & Model', subtitle: 'Table-first breakdown; no truncation.' },
		outcomeValue: { id: 'outcome-value', num: '03', label: 'Outcome Value', title: 'Outcome Value', subtitle: 'Cost per useful message and outcome funnel.' },
		budgetAlerts: { id: 'budget-alerts', num: '04', label: 'Budget & Alerts', title: 'Budget & Alerts', subtitle: 'Set-and-forget guardrails and alert rules.' },
		history: { id: 'history', num: '05', label: 'History', title: 'Usage History', subtitle: 'Audit and drill into individual calls.' },
		optimization: { id: 'optimization', num: '06', label: 'Optimization', title: 'Usage Optimization', subtitle: 'Curator recommendations with Apply / Preview verbs.' },
	},
	overview: {
		kpi: {
			mpg: {
				label: 'Cost / useful message',
				help: 'Sum of usage cost in this range divided by the number of AI messages that produced a real outcome (vault save, copilot accept, agent file emit). Spec §11.2.',
				empty: '—',
			},
			totalCost: { label: 'Total cost' },
			usefulMessages: {
				label: 'Useful messages',
				help: 'Distinct AI messages with ≥1 outcome event in this range.',
			},
			totalCalls: { label: 'AI calls' },
		},
		funnel: {
			title: 'Outcome funnel',
			subtitle: 'Invoked → inspected → adopted · spec §11.3',
			stages: { invoked: 'Invoked', inspected: 'Inspected', adopted: 'Adopted' },
			empty: 'No AI activity in this range.',
		},
		outcomeBreakdown: {
			title: 'Outcome breakdown',
			subtitle: 'Events by type',
			empty: 'No outcome events recorded in this range.',
			events: {
				vault_save: 'Vault save',
				copilot_accept: 'Copilot accept',
				search_click: 'Search click',
				agent_file_emit: 'Agent file emit',
				continuation: 'Continuation',
			},
		},
	},
	detailPanel: {
		title: 'What was this about',
		subtitle: 'Context first — usage numbers below',
		close: 'Close',
		privacyDisabled:
			'Preview hidden by privacy settings (Settings → Usage → Enable previews).',
		missingMetadata:
			'No metadata captured for this call — usage row exists, but the feature did not write a per-feature payload.',
		unknownFeature: 'No detail renderer registered for feature "{feature}".',
		sections: {
			prompt: 'User prompt',
			response: 'Assistant response',
			attachedFiles: 'Attached files',
			toolsUsed: 'Tools used',
			query: 'Query',
			topResults: 'Top results',
			clicked: 'Clicked',
			taskGoal: 'Task goal',
			stepName: 'Step',
			stepTools: 'Tools in step',
			previousStep: 'Previous step summary',
			filePath: 'File',
			selectionBefore: 'Before',
			selectionAfter: 'After',
			accepted: 'Accepted',
			rejected: 'Rejected',
			document: 'Document',
			chunks: 'Chunks',
			embeddingModel: 'Embedding model',
			showFullPrompt: 'Show full prompt',
		},
		verbs: {
			openChat: 'Open in chat',
			openSearch: 'Open in search',
			openTrace: 'Open trace',
			openEditor: 'Open in editor',
			openDocument: 'Open document',
		},
	},
	providerModel: {
		providerSection: { title: 'Cost by provider', subtitle: '$ outside the bar by design' },
		modelSection: { title: 'By model', subtitle: 'Table — grouped by provider, no truncation' },
		columns: {
			provider: 'Provider',
			model: 'Model',
			calls: 'Calls',
			tokens: 'Tokens',
			cost: 'Cost',
			share: 'Share',
		},
		empty: 'No provider or model usage in this range.',
	},
	outcomeValue: {
		perFeatureSection: {
			title: 'Cost per useful message · by feature',
			subtitle: 'MPG = total cost ÷ useful messages (spec §11.2)',
		},
		columns: {
			feature: 'Feature',
			calls: 'Calls',
			useful: 'Useful',
			adopted: 'Adopted',
			adoptRate: 'Adopt rate',
			totalCost: 'Total cost',
			mpg: 'Cost / useful',
		},
		features: {
			chat: 'Chat',
			search_analysis: 'Search analysis',
			copilot: 'Copilot',
			graph: 'Graph',
			indexing: 'Indexing',
			internal: 'Internal',
			skill: 'Skill',
		},
		empty: 'No per-feature usage in this range.',
		unattributed: 'Unattributed',
		unattributedHelp:
			'Calls without a message_id in metadata — adoption rate cannot be computed.',
	},
};

const SCREEN_ORDER: Array<keyof DashboardStrings['screens']> = [
	'overview',
	'providerModel',
	'outcomeValue',
	'budgetAlerts',
	'history',
	'optimization',
];

const TIME_RANGE_ORDER: TimeRange[] = ['today', '7d', '30d', 'all'];

export function useDashboardStrings(): DashboardStrings {
	const [strings, setStrings] = useState<DashboardStrings>(FALLBACK_STRINGS);
	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			try {
				const tm = TemplateManager.getInstance();
				const loaded = await tm.loadJson<DashboardStrings>(
					ConfigTemplateId.Dashboard
				);
				if (!cancelled && loaded && loaded.screens) {
					// Shallow-merge each known top-level group so an upstream
					// dashboard.json that omits e.g. the overview block still
					// renders with English fallbacks instead of crashing.
					setStrings({
						...FALLBACK_STRINGS,
						...loaded,
						overview: { ...FALLBACK_STRINGS.overview, ...(loaded.overview ?? {}) },
						detailPanel: {
							...FALLBACK_STRINGS.detailPanel,
							...(loaded.detailPanel ?? {}),
							sections: {
								...FALLBACK_STRINGS.detailPanel.sections,
								...(loaded.detailPanel?.sections ?? {}),
							},
							verbs: {
								...FALLBACK_STRINGS.detailPanel.verbs,
								...(loaded.detailPanel?.verbs ?? {}),
							},
						},
						providerModel: {
							...FALLBACK_STRINGS.providerModel,
							...(loaded.providerModel ?? {}),
							columns: {
								...FALLBACK_STRINGS.providerModel.columns,
								...(loaded.providerModel?.columns ?? {}),
							},
						},
						outcomeValue: {
							...FALLBACK_STRINGS.outcomeValue,
							...(loaded.outcomeValue ?? {}),
							columns: {
								...FALLBACK_STRINGS.outcomeValue.columns,
								...(loaded.outcomeValue?.columns ?? {}),
							},
							features: {
								...FALLBACK_STRINGS.outcomeValue.features,
								...(loaded.outcomeValue?.features ?? {}),
							},
						},
					});
				}
			} catch {
				/* fallback already in state */
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, []);
	return strings;
}

export function UsageDashboard() {
	const strings = useDashboardStrings();
	const [activeScreen, setActiveScreen] = useState<ScreenId>('overview');
	const [range, setRange] = useState<TimeRange>('7d');

	const screenList = useMemo<ScreenMeta[]>(
		() => SCREEN_ORDER.map((key) => strings.screens[key]),
		[strings]
	);
	const timeRangeList = useMemo<TimeRangeMeta[]>(
		() =>
			TIME_RANGE_ORDER.map((value) => ({
				value,
				label: strings.timeRange[value],
			})),
		[strings]
	);
	const activeMeta =
		screenList.find((s) => s.id === activeScreen) ?? screenList[0];

	return (
		<div className="pk-dash-shell">
			<div className="pk-dash-header">
				<div>
					<div className="pk-dash-meta">
						{activeMeta.num} · {activeMeta.label}
					</div>
					<div className="pk-dash-title">{activeMeta.title}</div>
					<div className="pk-dash-meta">{activeMeta.subtitle}</div>
				</div>
				<Segmented<TimeRange>
					value={range}
					onValueChange={setRange}
					options={timeRangeList.map((r) => ({
						value: r.value,
						label: r.label,
					}))}
					aria-label="Time range"
				/>
			</div>

			<Segmented<ScreenId>
				value={activeScreen}
				onValueChange={setActiveScreen}
				options={screenList.map((s) => ({
					value: s.id,
					label: s.label,
				}))}
				aria-label="Dashboard screen"
			/>

			{activeScreen === 'overview' && (
				<OverviewScreen range={range} strings={strings.overview} />
			)}
			{activeScreen === 'provider-model' && (
				<ProviderModelScreen range={range} strings={strings.providerModel} />
			)}
			{activeScreen === 'outcome-value' && (
				<OutcomeValueScreen range={range} strings={strings.outcomeValue} />
			)}
			{activeScreen === 'budget-alerts' && <BudgetAlertsScreen range={range} />}
			{activeScreen === 'history' && (
				<HistoryScreen range={range} detailStrings={strings.detailPanel} />
			)}
			{activeScreen === 'optimization' && <OptimizationScreen range={range} />}
		</div>
	);
}
