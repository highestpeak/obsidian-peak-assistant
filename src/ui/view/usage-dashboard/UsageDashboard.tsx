import React, { useEffect, useMemo, useState } from 'react';
import { Segmented } from '@/ui/components/primitives';
import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { TimeRange } from '@/service/usage/types';
import dashboardDefaults from '../../../../templates/config/dashboard.json';
import {
	OverviewScreen,
	ProviderModelScreen,
	OutcomeValueScreen,
	BudgetAlertsScreen,
	HistoryScreen,
	OptimizationScreen,
} from './screens';

/**
 * Usage Dashboard root — 6-screen carrier surface.
 * Tab strip + time-range strip; per-screen rendering is delegated to
 * `./screens/*`.
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

export interface BudgetPaceKpiStrings {
	label: string;
	verb: string;
	empty: string;
	projectionLabel: string;
	onTrack: string;
	offTrack: string;
	noBudgetCta: string;
}

export interface ContextRiskKpiStrings {
	label: string;
	verb: string;
	healthy: string;
	warn: string;
	bad: string;
	empty: string;
	autoCompactAt: string;
}

export interface CostPerSavedKpiStrings {
	label: string;
	verb: string;
	help: string;
	sub: string;
	empty: string;
}

export interface CallsKpiStrings {
	label: string;
	verb: string;
	tokensSub: string;
}

export interface RecommendedActionsStrings {
	title: string;
	subtitle: string;
	empty: string;
	viewAll: string;
	loading: string;
	refreshed: string;
	impactLabels: Record<'high' | 'medium' | 'low' | 'investigate', string>;
}

export interface ThisWeekStrings {
	title: string;
	linkLabel: string;
	spendLabel: string;
	tokensLabel: string;
	costPerSavedLabel: string;
	deltaSuffix: string;
}

export interface OverviewStrings {
	kpi: {
		budgetPace: BudgetPaceKpiStrings;
		contextRisk: ContextRiskKpiStrings;
		costPerSaved: CostPerSavedKpiStrings;
		calls: CallsKpiStrings;
	};
	recommendedActions: RecommendedActionsStrings;
	thisWeek: ThisWeekStrings;
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

export interface BudgetAlertsStrings {
	reset: string;
	monthlyBudget: {
		title: string;
		sub: string;
		fieldLabel: string;
		fieldHint: string;
		breakdown: string;
		save: string;
		resetDay: string;
		resetDayPrompt: string;
		cycleBadge: string;
		noBudget: string;
	};
	alertRules: {
		title: string;
		sub: string;
		editThresholds: string;
		testAlerts: string;
		howDelivered: string;
		rules: Record<
			'budget_threshold' | 'context_compact' | 'agent_receipt' | 'silence_low_cost_pip',
			{ title: string; sub: string; badge: string }
		>;
	};
	modelDefaults: {
		title: string;
		sub: string;
		manage: string;
		tabs: { quick: string; deep: string; premium: string };
		costSuffix: string;
		empty: string;
	};
	preview: {
		title: string;
		sub: string;
		customize: string;
		items: {
			budgetAt40: {
				label: string;
				value: string;
				badge: string;
				openOptimization: string;
				snooze: string;
			};
			contextAt70: {
				label: string;
				headline: string;
				badge: string;
				body: string;
				compactNow: string;
				dismiss: string;
			};
			agentReceipt: {
				label: string;
				headline: string;
				body: string;
				openTrace: string;
			};
		};
	};
}

export interface OptimizationStrings {
	summary: {
		templateCanCut: string;
		noRecommendations: string;
		refresh: string;
		loading: string;
		refreshing: string;
	};
	recommendations: {
		title: string;
		sub: string;
		sourceRules: string;
		sourceLlm: string;
		apply: string;
		preview: string;
		openTraces: string;
		estMonthlySaving: string;
		evidenceColumns: {
			started: string;
			goal: string;
			model: string;
			cost: string;
		};
	};
	savingsDial: {
		appliedNone: string;
		appliedSummary: string;
		openBudget: string;
	};
	projection: {
		title: string;
		cycle: string;
		withoutChanges: string;
		withApplied: string;
		savingsTemplate: string;
		budget: string;
	};
	scenarios: {
		title: string;
		sub: string;
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
	budgetAlerts: BudgetAlertsStrings;
	optimization: OptimizationStrings;
}

/**
 * Compiled fallback for `dashboard.json` when TemplateManager has not loaded yet.
 * Imported directly from the template so the bundle never drifts from the source.
 * The JSON ships extra runtime keys for other consumers; they are tolerated
 * structurally and ignored by `DashboardStrings`.
 */
const FALLBACK_STRINGS: DashboardStrings = dashboardDefaults as unknown as DashboardStrings;

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
						overview: {
							...FALLBACK_STRINGS.overview,
							...(loaded.overview ?? {}),
							kpi: {
								...FALLBACK_STRINGS.overview.kpi,
								...(loaded.overview?.kpi ?? {}),
							},
							recommendedActions: {
								...FALLBACK_STRINGS.overview.recommendedActions,
								...(loaded.overview?.recommendedActions ?? {}),
								impactLabels: {
									...FALLBACK_STRINGS.overview.recommendedActions.impactLabels,
									...(loaded.overview?.recommendedActions?.impactLabels ?? {}),
								},
							},
							thisWeek: {
								...FALLBACK_STRINGS.overview.thisWeek,
								...(loaded.overview?.thisWeek ?? {}),
							},
						},
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
						budgetAlerts: {
							...FALLBACK_STRINGS.budgetAlerts,
							...(loaded.budgetAlerts ?? {}),
						},
						optimization: {
							...FALLBACK_STRINGS.optimization,
							...(loaded.optimization ?? {}),
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
			{activeScreen === 'budget-alerts' && (
				<BudgetAlertsScreen range={range} strings={strings.budgetAlerts} />
			)}
			{activeScreen === 'history' && (
				<HistoryScreen range={range} detailStrings={strings.detailPanel} />
			)}
			{activeScreen === 'optimization' && (
				<OptimizationScreen range={range} strings={strings.optimization} />
			)}
		</div>
	);
}
