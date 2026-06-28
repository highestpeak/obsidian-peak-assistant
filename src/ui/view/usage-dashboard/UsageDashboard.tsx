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
			budgetPace: {
				label: 'Budget pace',
				verb: 'Adjust budget',
				empty: 'No budget set',
				projectionLabel: 'Projected',
				onTrack: 'On track',
				offTrack: 'Pace high',
				noBudgetCta: 'Set a monthly budget',
			},
			contextRisk: {
				label: 'Context risk',
				verb: 'Compact threshold',
				healthy: 'Healthy',
				warn: 'Watch',
				bad: 'At risk',
				empty: 'Open a chat to read context',
				autoCompactAt: 'Auto-compact at {threshold}%',
			},
			costPerSaved: {
				label: 'Cost / saved artifact',
				verb: 'Outcome breakdown',
				help: 'Total cost of calls that ended in something saved (vault note, copilot accept, agent file emit), divided by the count of saves. Lower = more value per dollar.',
				sub: '{cost} across {count} saved items',
				empty: '—',
			},
			calls: {
				label: 'Calls this week',
				verb: 'Review high-cost calls',
				tokensSub: '{tokens} tokens',
			},
		},
		recommendedActions: {
			title: 'Recommended actions',
			subtitle: 'From Curator · last 30 days',
			empty: 'No recommendations yet — Curator needs more data.',
			viewAll: 'View all {count} actions',
			loading: 'Loading recommendations…',
			refreshed: 'Last refreshed {ago}',
			impactLabels: {
				high: 'High impact',
				medium: 'Medium impact',
				low: 'Low impact',
				investigate: 'Investigate',
			},
		},
		thisWeek: {
			title: 'This week',
			linkLabel: 'View full usage',
			spendLabel: 'Spend',
			tokensLabel: 'Tokens',
			costPerSavedLabel: 'Cost / saved artifact',
			deltaSuffix: 'wow',
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
	budgetAlerts: {
		reset: 'Reset to recommended',
		monthlyBudget: {
			title: 'Monthly budget',
			sub: 'Pace · projected spend',
			fieldLabel: 'Budget',
			fieldHint: 'Used when projecting and triggering alerts.',
			breakdown: 'Used · projected · remaining',
			save: 'Save budget',
			resetDay: 'Reset day: {day}',
			resetDayPrompt: 'Pick the day of month (1–28) the budget cycle restarts.',
			cycleBadge: '{month} {year}',
			noBudget: 'No budget set — projection and alerts disabled.',
		},
		alertRules: {
			title: 'Alert rules',
			sub: 'Threshold-triggered notifications',
			editThresholds: 'Edit thresholds',
			testAlerts: 'Test alerts',
			howDelivered: 'How alerts are delivered →',
			rules: {
				budget_threshold: {
					title: 'Notify at {pct}% monthly budget',
					sub: 'Single in-app notification, then silenced until next threshold.',
					badge: 'In-app',
				},
				context_compact: {
					title: 'Suggest compact when context ≥ {pct}%',
					sub: 'Surface inline in chat with "Compact now" verb.',
					badge: 'Inline',
				},
				agent_receipt: {
					title: 'Summarize expensive agent tasks',
					sub: 'Post-task receipt for any task over ${cost} or {tokens} tokens.',
					badge: 'Receipt',
				},
				silence_low_cost_pip: {
					title: 'Silence low-cost receipts',
					sub: 'Hide per-message pip when call is under ${cost}.',
					badge: 'Pip',
				},
			},
		},
		modelDefaults: {
			title: 'Model defaults',
			sub: 'Pick the right model for the job.',
			manage: 'Manage models',
			tabs: { quick: 'Quick', deep: 'Deep research', premium: 'Premium' },
			costSuffix: '/ call',
			empty: 'No model bound — open the harness onboarding wizard to bind one.',
		},
		preview: {
			title: 'What users will see',
			sub: 'In-app alert preview',
			customize: 'Customize messages',
			items: {
				budgetAt40: {
					label: '1 · Spend at 40% of budget',
					value: '{used} / {budget}',
					badge: 'Pace high',
					openOptimization: 'Open Optimization',
					snooze: 'Snooze',
				},
				contextAt70: {
					label: '2 · Context warning at 70%',
					headline: 'Context at 72%',
					badge: 'Session warning',
					body: 'Compact now to keep answers focused and cut next-turn cost.',
					compactNow: 'Compact now',
					dismiss: 'Dismiss',
				},
				agentReceipt: {
					label: '3 · Agent task receipt',
					headline: 'Research run · 73k tokens · $0.21',
					body: 'Vault saves: 2 · Trace: open',
					openTrace: 'Open trace',
				},
			},
		},
	},
	optimization: {
		summary: {
			templateCanCut: '{count} changes can cut projected spend by {pct}.',
			noRecommendations: 'No recommendations yet — Curator needs more data.',
			refresh: 'Refresh',
			loading: 'Running Curator…',
			refreshing: 'Refreshing…',
		},
		recommendations: {
			title: 'Recommended changes',
			sub: 'Ranked by impact · evaluated against last 30 days',
			sourceRules: 'Heuristic rules (offline)',
			sourceLlm: 'Curator (LLM)',
			apply: 'Apply change',
			preview: 'Preview',
			openTraces: 'Open traces',
			estMonthlySaving: 'Est. monthly saving',
			evidenceColumns: {
				started: 'Started',
				goal: 'Goal',
				model: 'Model',
				cost: 'Cost',
			},
		},
		savingsDial: {
			appliedNone: 'No changes applied yet',
			appliedSummary: '${applied} / ${potential} potential monthly savings',
			openBudget: 'Open budget settings →',
		},
		projection: {
			title: 'Projected spend',
			cycle: '{start} → {end}',
			withoutChanges: 'Without changes',
			withApplied: 'With recommended changes',
			savingsTemplate: '−${saving} ({pct})',
			budget: '{budget} budget',
		},
		scenarios: {
			title: 'Choose a scenario',
			sub: 'Conservative · Balanced · Aggressive',
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
