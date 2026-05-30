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

interface DashboardStrings {
	title: string;
	timeRange: Record<TimeRange, string>;
	screens: Record<string, ScreenMeta>;
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

function useDashboardStrings(): DashboardStrings {
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
					setStrings({ ...FALLBACK_STRINGS, ...loaded });
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

			{activeScreen === 'overview' && <OverviewScreen range={range} />}
			{activeScreen === 'provider-model' && <ProviderModelScreen range={range} />}
			{activeScreen === 'outcome-value' && <OutcomeValueScreen range={range} />}
			{activeScreen === 'budget-alerts' && <BudgetAlertsScreen range={range} />}
			{activeScreen === 'history' && <HistoryScreen range={range} />}
			{activeScreen === 'optimization' && <OptimizationScreen range={range} />}
		</div>
	);
}
