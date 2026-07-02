import * as React from 'react';
import { Notice } from 'obsidian';
import type { TimeRange } from '@/service/usage/types';
import { useServiceContext } from '@/ui/context/ServiceContext';
import {
	DEFAULT_BUDGET_SETTINGS,
	DEFAULT_HARNESS_SETTINGS,
	type BudgetAlertRule,
	type BudgetAlertRuleKind,
	type BudgetSettings,
	type HarnessSettings,
} from '@/core/config/settingsTypes';
import type { MonthlyPaceSnapshot } from '@/service/usage/UsageTrackingService';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import {
	Field,
	NumberField,
	PaceBar,
	RuleRow,
	Toggle,
} from '../components/charts';
import type { BudgetAlertsStrings } from '../UsageDashboard';

export interface BudgetAlertsScreenProps {
	range: TimeRange;
	strings: BudgetAlertsStrings;
}

/**
 * 04 · Budget & Alerts (mock 4-budget-alerts.html).
 *
 * Two zones:
 *  - Row of 3 cards: Monthly budget · Alert rules · Model defaults
 *  - Bottom card: "What users will see" — preview of the 3 alert carriers in
 *    their inline shape
 *
 * Every interactive control writes back through `plugin.saveSettings`, so
 * the user never has to navigate to Settings to tune these.
 */
export function BudgetAlertsScreen({ strings }: BudgetAlertsScreenProps) {
	const { budget, harness, save } = useHarnessBudget();
	const { usageServices } = useServiceContext();
	const [pace, setPace] = React.useState<MonthlyPaceSnapshot | null>(null);

	React.useEffect(() => {
		if (!usageServices) return;
		let cancelled = false;
		(async () => {
			if (budget.monthlyUsd <= 0) {
				if (!cancelled) setPace(null);
				return;
			}
			try {
				const snap = await usageServices.tracking.getMonthlyPace(
					budget.monthlyUsd,
					budget.resetDayOfMonth,
				);
				if (!cancelled) setPace(snap);
			} catch (e) {
				console.error('[BudgetAlertsScreen] pace failed', e);
			}
		})();
		return () => { cancelled = true; };
	}, [budget.monthlyUsd, budget.resetDayOfMonth, usageServices]);

	const writeBudget = (next: BudgetSettings) => {
		save({ ...harness, budget: next });
	};

	return (
		<div className="pk-dash-screen">
			<div className="pk-row-3">
				<MonthlyBudgetCard
					strings={strings.monthlyBudget}
					resetCta={strings.reset}
					budget={budget}
					pace={pace}
					onChange={writeBudget}
				/>
				<AlertRulesCard
					strings={strings.alertRules}
					rules={budget.alertRules}
					onChange={(rules) => writeBudget({ ...budget, alertRules: rules })}
				/>
				<ModelDefaultsCard
					strings={strings.modelDefaults}
					harness={harness}
				/>
			</div>
			<WhatUsersWillSeeCard strings={strings.preview} pace={pace} />
		</div>
	);
}

// ── Monthly budget card ─────────────────────────────────────────────────────

function MonthlyBudgetCard({
	strings,
	resetCta,
	budget,
	pace,
	onChange,
}: {
	strings: BudgetAlertsStrings['monthlyBudget'];
	resetCta: string;
	budget: BudgetSettings;
	pace: MonthlyPaceSnapshot | null;
	onChange: (next: BudgetSettings) => void;
}) {
	const cycleDate = pace ? new Date(pace.cycleStartMs) : new Date();
	const cycleBadge = strings.cycleBadge
		.replace('{month}', cycleDate.toLocaleString(undefined, { month: 'short' }))
		.replace('{year}', String(cycleDate.getFullYear()));

	return (
		<section className="pk-dash-card pk-dash-card--pad">
			<div className="pk-dash-card__head" style={{ padding: 0, border: 'none' }}>
				<span className="pk-dash-card__title">{strings.title}</span>
				<span className="pk-badge pk-badge--soft">{cycleBadge}</span>
			</div>
			<div className="pk-stack" style={{ marginTop: 12 }}>
				<Field label={strings.fieldLabel} hint={strings.fieldHint}>
					<NumberField
						value={budget.monthlyUsd}
						onChange={(n) => onChange({ ...budget, monthlyUsd: n })}
						min={0}
						step={5}
						precision={2}
						prefix="$"
						aria-label={strings.fieldLabel}
					/>
				</Field>

				{pace ? (
					<div>
						<div className="pk-trio__row" style={{ alignItems: 'baseline' }}>
							<span className="pk-muted" style={{ fontSize: 11 }}>{strings.breakdown}</span>
							<span className="pk-strong pk-mono">
								{formatUsd(pace.used)} / {formatUsd(pace.projected)} / {formatUsd(pace.remaining)}
							</span>
						</div>
						<PaceBar
							usedPct={pace.percentUsed}
							projectedPct={pace.percentProjected}
							tone={pace.percentProjected > 1.0 ? 'bad' : pace.percentProjected > 0.9 ? 'warn' : 'ok'}
							legend={[
								`${Math.round(pace.percentUsed * 100)}% used`,
								`${Math.round(pace.percentProjected * 100)}% projected`,
								'100%',
							]}
							aria-label="Monthly budget pace"
						/>
					</div>
				) : (
					<div className="pk-dash-empty">{strings.noBudget}</div>
				)}

				<div style={{ display: 'flex', gap: 8 }}>
					<button
						type="button"
						className="pk-btn pk-btn--primary pk-btn--sm"
						onClick={() => {
							onChange(budget); // already wrote on every keystroke; this is a noop confirm + Notice
							new Notice('Budget saved.');
						}}
					>
						{strings.save}
					</button>
					<button
						type="button"
						className="pk-btn pk-btn--ghost pk-btn--sm"
						onClick={() => promptResetDay(budget, onChange, strings)}
					>
						{strings.resetDay.replace('{day}', String(budget.resetDayOfMonth))}
					</button>
					<button
						type="button"
						className="pk-btn pk-btn--ghost pk-btn--sm"
						onClick={() => onChange({ ...DEFAULT_BUDGET_SETTINGS, alertRules: DEFAULT_BUDGET_SETTINGS.alertRules.map((r) => ({ ...r })) })}
					>
						{resetCta}
					</button>
				</div>
			</div>
		</section>
	);
}

function promptResetDay(
	budget: BudgetSettings,
	onChange: (next: BudgetSettings) => void,
	strings: BudgetAlertsStrings['monthlyBudget'],
): void {
	// Obsidian doesn't expose a generic prompt; native `window.prompt` is fine
	// here — this surface is non-critical and the input is bounded.
	const raw = window.prompt(strings.resetDayPrompt, String(budget.resetDayOfMonth));
	if (!raw) return;
	const n = Number.parseInt(raw, 10);
	if (Number.isFinite(n) && n >= 1 && n <= 28) {
		onChange({ ...budget, resetDayOfMonth: n });
	}
}

// ── Alert rules card ────────────────────────────────────────────────────────

function AlertRulesCard({
	strings,
	rules,
	onChange,
}: {
	strings: BudgetAlertsStrings['alertRules'];
	rules: BudgetAlertRule[];
	onChange: (next: BudgetAlertRule[]) => void;
}) {
	const toggleRule = (kind: BudgetAlertRuleKind, next: boolean) => {
		onChange(rules.map((r) => (r.kind === kind ? { ...r, enabled: next } : r)));
	};

	return (
		<section className="pk-dash-card pk-dash-card--pad">
			<div className="pk-dash-card__head" style={{ padding: 0, border: 'none' }}>
				<span className="pk-dash-card__title">{strings.title}</span>
				<button type="button" className="pk-btn pk-btn--ghost pk-btn--sm">
					{strings.editThresholds}
				</button>
			</div>
			<div className="pk-stack" style={{ marginTop: 6 }}>
				{rules.map((rule) => {
					const meta = strings.rules[rule.kind];
					if (!meta) return null;
					const title = meta.title
						.replace('{pct}', String(Math.round(rule.threshold * 100)))
						.replace('{cost}', rule.threshold.toFixed(rule.threshold < 1 ? 4 : 2))
						.replace('{tokens}', rule.tokenThreshold ? formatTokens(rule.tokenThreshold) : '50k');
					const sub = meta.sub
						.replace('{pct}', String(Math.round(rule.threshold * 100)))
						.replace('{cost}', rule.threshold.toFixed(rule.threshold < 1 ? 4 : 2))
						.replace('{tokens}', rule.tokenThreshold ? formatTokens(rule.tokenThreshold) : '50k');
					return (
						<RuleRow
							key={rule.kind}
							leading={
								<Toggle
									pressed={rule.enabled}
									onPressedChange={(next) => toggleRule(rule.kind, next)}
									aria-label={meta.title}
								/>
							}
							title={title}
							sub={sub}
							trailing={<span className="pk-badge pk-badge--soft">{meta.badge}</span>}
						/>
					);
				})}
			</div>
			<div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
				<button
					type="button"
					className="pk-btn pk-btn--sm"
					onClick={() => new Notice('Alert test fired (preview only).')}
				>
					{strings.testAlerts}
				</button>
				<span className="pk-link">{strings.howDelivered}</span>
			</div>
		</section>
	);
}

// ── Model defaults card ─────────────────────────────────────────────────────

function ModelDefaultsCard({
	strings,
	harness,
}: {
	strings: BudgetAlertsStrings['modelDefaults'];
	harness: HarnessSettings;
}) {
	const reg = ProfileRegistry.getInstance();
	const tiers: Array<{
		key: 'quick' | 'deep' | 'premium';
		label: string;
		icon: React.ReactNode;
		config: { profileId: string; modelId: string } | null;
	}> = [
		{
			key: 'quick',
			label: strings.tabs.quick,
			icon: <span style={{ color: 'var(--pk-success)' }}>⚡</span>,
			config: harness.localFastConfig,
		},
		{
			key: 'deep',
			label: strings.tabs.deep,
			icon: <span style={{ color: 'var(--pk-info)' }}>⌖</span>,
			config: harness.localDeepConfig,
		},
		{
			key: 'premium',
			label: strings.tabs.premium,
			icon: <span style={{ color: 'var(--pk-warning)' }}>★</span>,
			config: harness.onlineConfig,
		},
	];

	return (
		<section className="pk-dash-card pk-dash-card--pad">
			<div className="pk-dash-card__head" style={{ padding: 0, border: 'none' }}>
				<span className="pk-dash-card__title">{strings.title}</span>
				<button type="button" className="pk-btn pk-btn--ghost pk-btn--sm">
					{strings.manage}
				</button>
			</div>
			<span className="pk-muted" style={{ fontSize: 12, marginTop: 4 }}>{strings.sub}</span>
			<div className="pk-stack" style={{ marginTop: 14 }}>
				{tiers.map((tier) => {
					if (!tier.config) {
						return (
							<RuleRow
								key={tier.key}
								leading={tier.icon}
								title={`${tier.label} — ${strings.empty}`}
								sub={undefined}
							/>
						);
					}
					const profile = (() => {
						try { return reg.getProfileById(tier.config.profileId); } catch { return null; }
					})();
					const providerLabel = profile?.kind ?? 'unknown';
					return (
						<RuleRow
							key={tier.key}
							leading={tier.icon}
							title={`${tier.label} · ${tier.config.modelId}`}
							sub={`Provider ${providerLabel}`}
							trailing={<span className="pk-mono">— {strings.costSuffix}</span>}
						/>
					);
				})}
			</div>
		</section>
	);
}

// ── Preview card ────────────────────────────────────────────────────────────

function WhatUsersWillSeeCard({
	strings,
	pace,
}: {
	strings: BudgetAlertsStrings['preview'];
	pace: MonthlyPaceSnapshot | null;
}) {
	return (
		<section className="pk-dash-card pk-dash-card--flush">
			<header className="pk-dash-card__head">
				<span className="pk-dash-card__title">{strings.title}</span>
				<button type="button" className="pk-btn pk-btn--ghost pk-btn--sm">
					{strings.customize}
				</button>
			</header>
			<div className="pk-dash-card__body pk-row-3">
				<PreviewBudgetCard strings={strings.items.budgetAt40} pace={pace} />
				<PreviewContextCard strings={strings.items.contextAt70} />
				<PreviewAgentReceipt strings={strings.items.agentReceipt} />
			</div>
		</section>
	);
}

function PreviewBudgetCard({
	strings,
	pace,
}: {
	strings: BudgetAlertsStrings['preview']['items']['budgetAt40'];
	pace: MonthlyPaceSnapshot | null;
}) {
	const used = pace ? formatUsd(pace.used) : '$14.20';
	const budget = pace ? formatUsd(pace.monthlyUsd) : '$40.00';
	return (
		<div>
			<div className="pk-preview-card__head">{strings.label}</div>
			<div className="pk-preview-card">
				<div className="pk-trio__row">
					<span className="pk-strong pk-mono">{strings.value.replace('{used}', used).replace('{budget}', budget)}</span>
					<span className="pk-badge pk-badge--warn">{strings.badge}</span>
				</div>
				<PaceBar
					usedPct={pace?.percentUsed ?? 0.355}
					tone="warn"
				/>
				<div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
					<button type="button" className="pk-btn pk-btn--sm">{strings.openOptimization}</button>
					<button type="button" className="pk-btn pk-btn--ghost pk-btn--sm">{strings.snooze}</button>
				</div>
			</div>
		</div>
	);
}

function PreviewContextCard({
	strings,
}: {
	strings: BudgetAlertsStrings['preview']['items']['contextAt70'];
}) {
	return (
		<div>
			<div className="pk-preview-card__head">{strings.label}</div>
			<div className="pk-preview-card pk-preview-card--warn">
				<div className="pk-trio__row">
					<span className="pk-strong" style={{ color: 'var(--pk-warning)' }}>{strings.headline}</span>
					<span className="pk-badge pk-badge--warn">{strings.badge}</span>
				</div>
				<div className="pk-muted" style={{ fontSize: 12 }}>{strings.body}</div>
				<div style={{ display: 'flex', gap: 6 }}>
					<button type="button" className="pk-btn pk-btn--primary pk-btn--sm">{strings.compactNow}</button>
					<button type="button" className="pk-btn pk-btn--ghost pk-btn--sm">{strings.dismiss}</button>
				</div>
			</div>
		</div>
	);
}

function PreviewAgentReceipt({
	strings,
}: {
	strings: BudgetAlertsStrings['preview']['items']['agentReceipt'];
}) {
	return (
		<div>
			<div className="pk-preview-card__head">{strings.label}</div>
			<div className="pk-preview-card">
				<div className="pk-strong">{strings.headline}</div>
				<div className="pk-muted" style={{ fontSize: 12 }}>{strings.body}</div>
				<div>
					<button type="button" className="pk-btn pk-btn--sm">{strings.openTrace}</button>
				</div>
			</div>
		</div>
	);
}

// ── Settings hook ───────────────────────────────────────────────────────────

interface HarnessBudgetState {
	harness: HarnessSettings;
	budget: BudgetSettings;
	save: (next: HarnessSettings) => void;
}

/**
 * Read+write helper for the harness settings block (with the budget shape
 * derived from it). Reads from AppContext on every render so other surfaces
 * can mutate the same object and we'll pick it up; writes go through
 * `plugin.saveSettings()` and the user sees a Notice on success.
 */
function useHarnessBudget(): HarnessBudgetState {
	const { settings, plugin } = useServiceContext();
	const [tick, setTick] = React.useState(0);

	const harness: HarnessSettings = (() => {
		const persisted = settings.harnessSettings;
		if (persisted) return persisted;
		return { ...DEFAULT_HARNESS_SETTINGS };
	})();

	const budget = harness.budget ?? DEFAULT_HARNESS_SETTINGS.budget;

	const save = React.useCallback(
		(next: HarnessSettings) => {
			settings.harnessSettings = next;
			plugin
				.saveSettings()
				.then(() => {
					setTick((t) => t + 1);
				})
				.catch((e: unknown) => {
					console.error('[BudgetAlertsScreen] saveSettings failed', e);
					new Notice('Failed to save budget — see console.');
				});
		},
		[settings, plugin],
	);

	// tick is intentionally not in the deps of `save` — we use it to re-render
	// after a save, but the closure binds to the same settings/plugin instances every time.
	void tick;
	return { harness, budget, save };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function formatUsd(value: number): string {
	if (!Number.isFinite(value)) return '$0';
	const decimals = value < 1 ? 4 : 2;
	return `$${value.toFixed(decimals)}`;
}

function formatTokens(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
	return String(value);
}
