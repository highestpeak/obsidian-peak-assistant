/**
 * Harness Onboarding Wizard — React content for the Curator-driven
 * capability-binding wizard. Mounted by the app-shell modal at
 * `@/app/ui-host/modals/HarnessOnboardingModal`.
 *
 * Architecture:
 *   - State machine in src/ui/view/onboarding/OnboardingStateMachine.ts
 *   - User-facing copy in templates/config/onboarding.json
 *   - Curator backend in src/service/agents/harness/curator/* (NOT TOUCHED)
 *
 * Visual goals (per docs/superpowers/specs/2026-05-29-onboarding-design-brief):
 *   - 720px wide modal with progress indicator at top, footer with Back/Continue
 *   - Single-column body, max-width hugged by modal shell (mock uses 680px)
 *   - Cards only for: capability cards, action launchpad cards, provider grid
 *   - Selected state: solid `--pk-accent-soft` + 3px left accent border + check
 *   - Strict design-token discipline (no inline hex; no Obsidian theme vars)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
	MessageSquare,
	Search,
	BarChart3,
	Pencil,
	Database,
	FileText,
	Layout,
	Sparkles,
	ShieldCheck,
	Globe,
	Cpu,
	Check,
	Info,
	Settings,
	ChevronLeft,
	ChevronRight,
	Wand2,
} from 'lucide-react';
import {
	PRIMARY_STEPS,
	canContinue,
	type OnboardingController,
	type OnboardingEvent,
	type OnboardingState,
	type PrimaryStep,
	useOnboardingState,
} from '@/ui/view/onboarding/OnboardingStateMachine';
import {
	DEFAULT_ONBOARDING_STRINGS,
	OnboardingStringsProvider,
	loadOnboardingStrings,
	useOnboardingStrings,
	type OnboardingStrings,
} from '@/ui/view/onboarding/onboardingStrings';
import { Row, Chip, Button } from '@/ui/components/primitives';
import { WelcomeStep } from '@/ui/view/modals/harness-onboarding/WelcomeStep';
import { ProviderStep } from '@/ui/view/modals/harness-onboarding/ProviderStep';
import { BootstrapModelStep } from '@/ui/view/modals/harness-onboarding/BootstrapModelStep';
import { PreferenceQuestionsStep } from '@/ui/view/modals/harness-onboarding/PreferenceQuestionsStep';
import { RunningCuratorStep } from '@/ui/view/modals/harness-onboarding/RunningCuratorStep';
import { ReviewRecommendationStep } from '@/ui/view/modals/harness-onboarding/ReviewRecommendationStep';
import { EditRecommendationStep } from '@/ui/view/modals/harness-onboarding/EditRecommendationStep';
import { RedoInputStep } from '@/ui/view/modals/harness-onboarding/RedoInputStep';

export interface HarnessOnboardingWizardProps {
	isReRun: boolean;
	initialStep?: PrimaryStep;
	onClose: () => void;
}

export function HarnessOnboardingWizard({ isReRun, initialStep, onClose }: HarnessOnboardingWizardProps) {
	const controller = useOnboardingState({ isReRun, initialStep });
	const { state, dispatch } = controller;

	const [strings, setStrings] = useState<OnboardingStrings>(DEFAULT_ONBOARDING_STRINGS);
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const loaded = await loadOnboardingStrings();
			if (!cancelled) setStrings(loaded);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	React.useEffect(() => {
		if (state.done) onClose();
	}, [state.done, onClose]);

	return (
		<OnboardingStringsProvider strings={strings}>
			<ProgressBar state={state} />
			<div className="pkonb-modal__body">
				<PrimaryStepView state={state} dispatch={dispatch} onClose={onClose} />
			</div>
			<StepFooter state={state} dispatch={dispatch} onClose={onClose} />
		</OnboardingStringsProvider>
	);
}

// ─── Progress indicator (7-step contract w/ labels + tooltip) ──────────

function ProgressBar({ state }: { state: OnboardingState }) {
	const strings = useOnboardingStrings();
	const idx = PRIMARY_STEPS.indexOf(state.step);
	const labels = strings.progressLabels;
	const tooltips = strings.progressTooltips;

	function labelFor(step: PrimaryStep): string {
		switch (step) {
			case 'welcome':
				return labels.welcome;
			case 'capabilities':
				return labels.capabilities;
			case 'provider':
				return labels.provider;
			case 'ai-behavior':
				return labels.aiBehavior;
			case 'index-readiness':
				return labels.indexReadiness;
			case 'system-check':
				return labels.systemCheck;
			case 'ready-to-try':
				return labels.readyToTry;
		}
	}
	function tooltipFor(step: PrimaryStep): string {
		switch (step) {
			case 'welcome':
				return tooltips.welcome;
			case 'capabilities':
				return tooltips.capabilities;
			case 'provider':
				return tooltips.provider;
			case 'ai-behavior':
				return tooltips.aiBehavior;
			case 'index-readiness':
				return tooltips.indexReadiness;
			case 'system-check':
				return tooltips.systemCheck;
			case 'ready-to-try':
				return tooltips.readyToTry;
		}
	}

	const counter = strings.progressCounter
		.replace('{n}', String(idx + 1))
		.replace('{total}', String(PRIMARY_STEPS.length))
		.replace('{title}', labelFor(state.step));

	return (
		<div className="pkonb-modal__progress">
			<div className="pkonb-progress">
				<div className="pkonb-progress__dots">
					{PRIMARY_STEPS.map((step, i) => {
						const stateAttr = i < idx ? 'completed' : i === idx ? 'active' : 'future';
						return (
							<React.Fragment key={step}>
								<div
									className="pkonb-progress__step"
									data-state={stateAttr}
									title={`${labelFor(step)} — ${tooltipFor(step)}`}
								>
									<div className="pkonb-progress__bubble">
										{stateAttr === 'completed' ? <Check /> : null}
									</div>
									<div className="pkonb-progress__label">{labelFor(step)}</div>
								</div>
								{i < PRIMARY_STEPS.length - 1 && (
									<div
										className="pkonb-progress__connector"
										data-state={i < idx ? 'completed' : undefined}
									/>
								)}
							</React.Fragment>
						);
					})}
				</div>
				<div className="pkonb-progress__title">
					<span dangerouslySetInnerHTML={{ __html: emphasizeStrong(counter) }} />
				</div>
			</div>
		</div>
	);
}

function emphasizeStrong(counter: string): string {
	return counter.replace(/(\d+\s*of\s*\d+)/, '<strong>$1</strong>');
}

// ─── Footer with Back / Continue / Skip ────────────────────────────────

interface FooterProps {
	state: OnboardingState;
	dispatch: (event: OnboardingEvent) => void;
	onClose: () => void;
}

function StepFooter({ state, dispatch, onClose }: FooterProps) {
	const strings = useOnboardingStrings();

	if (state.step === 'welcome') return null;

	const inCuratorTerminal =
		state.step === 'ai-behavior' &&
		(state.aiBehavior.substep === 'running-curator' ||
			state.aiBehavior.substep === 'review-recommendation');

	const canBack = state.step !== 'welcome';
	const continueDisabled = !canContinue(state);

	const handleBack = useCallback(() => dispatch({ type: 'back' }), [dispatch]);
	const handleContinue = useCallback(() => {
		if (state.step === 'capabilities') {
			dispatch({ type: 'acknowledge-capabilities' });
			dispatch({ type: 'next' });
			return;
		}
		if (state.step === 'system-check') {
			dispatch({ type: 'acknowledge-system-check' });
			dispatch({ type: 'next' });
			return;
		}
		if (state.step === 'ready-to-try') {
			dispatch({ type: 'finish' });
			return;
		}
		dispatch({ type: 'next' });
	}, [dispatch, state.step]);

	function continueLabel(): string {
		if (state.step === 'capabilities') return strings.steps.capabilities.continueCta;
		if (state.step === 'ready-to-try') return strings.steps.readyToTry.launchCta;
		if (state.step === 'ai-behavior') {
			if (state.aiBehavior.substep === 'choose-bootstrap') return strings.actions.continue;
			if (state.aiBehavior.substep === 'preference-questions') return strings.actions.runCurator;
			if (state.aiBehavior.substep === 'edit-recommendation') return strings.steps.editRecommendation.doneCta;
			if (state.aiBehavior.substep === 'redo-input') return strings.steps.redoInput.submitCta;
		}
		return strings.actions.continue;
	}

	function continueIcon(): React.ReactNode {
		if (state.step === 'ready-to-try') return <MessageSquare />;
		if (
			state.step === 'ai-behavior' &&
			(state.aiBehavior.substep === 'preference-questions' ||
				state.aiBehavior.substep === 'redo-input')
		) {
			return <Wand2 />;
		}
		return <ChevronRight />;
	}

	function handleRedoSubmit() {
		dispatch({ type: 'submit-redo' });
	}

	if (state.step === 'ai-behavior' && state.aiBehavior.substep === 'redo-input') {
		return (
			<div className="pkonb-modal__footer">
				<Button variant="ghost" onClick={handleBack}>
					<ChevronLeft />
					<span>{strings.actions.back}</span>
				</Button>
				<Button
					variant="primary"
					onClick={handleRedoSubmit}
					disabled={!state.aiBehavior.redoNote.trim()}
				>
					<Wand2 />
					<span>{strings.steps.redoInput.submitCta}</span>
				</Button>
			</div>
		);
	}

	return (
		<div className="pkonb-modal__footer">
			{canBack ? (
				<Button variant="ghost" onClick={handleBack}>
					<ChevronLeft />
					<span>{strings.actions.back}</span>
				</Button>
			) : (
				<span />
			)}
			<div style={{ display: 'flex', gap: 'var(--pk-space-2)' }}>
				{state.step === 'index-readiness' && (
					<Button
						variant="ghost"
						onClick={() => {
							dispatch({ type: 'select-index-action', action: 'skip' });
							dispatch({ type: 'next' });
						}}
					>
						{strings.steps.indexReadiness.skipCta}
					</Button>
				)}
				{state.step === 'ready-to-try' && (
					<Button variant="secondary" onClick={onClose}>
						<Settings />
						<span>{strings.steps.readyToTry.openSettingsCta}</span>
					</Button>
				)}
				{!inCuratorTerminal && (
					<Button
						variant="primary"
						onClick={handleContinue}
						disabled={continueDisabled}
					>
						<span>{continueLabel()}</span>
						{continueIcon()}
					</Button>
				)}
			</div>
		</div>
	);
}

// ─── Primary step router ───────────────────────────────────────────────

interface PrimaryStepViewProps {
	state: OnboardingState;
	dispatch: OnboardingController['dispatch'];
	onClose: () => void;
}

function PrimaryStepView({ state, dispatch, onClose }: PrimaryStepViewProps) {
	switch (state.step) {
		case 'welcome':
			return (
				<WelcomeStep
					isReRun={state.isReRun}
					onStart={() => dispatch({ type: 'next' })}
					onManual={onClose}
				/>
			);
		case 'capabilities':
			return <CapabilitiesStep />;
		case 'provider':
			return (
				<ProviderStep
					selectedProfileId={state.provider.selectedProfileId}
					onSelect={(profileId) => dispatch({ type: 'select-profile', profileId })}
					onClear={() => dispatch({ type: 'clear-profile' })}
					onBack={() => dispatch({ type: 'back' })}
					onContinue={() => dispatch({ type: 'next' })}
				/>
			);
		case 'ai-behavior':
			return <AiBehaviorRouter state={state} dispatch={dispatch} />;
		case 'index-readiness':
			return <IndexReadinessStep state={state} dispatch={dispatch} />;
		case 'system-check':
			return <SystemCheckStep />;
		case 'ready-to-try':
			return <ReadyToTryStep />;
	}
}

// ─── ai-behavior substep router ────────────────────────────────────────

function AiBehaviorRouter({ state, dispatch }: { state: OnboardingState; dispatch: (e: OnboardingEvent) => void }) {
	const ai = state.aiBehavior;
	const back = useCallback(() => {
		if (ai.substep === 'choose-bootstrap') {
			dispatch({ type: 'back' });
			return;
		}
		dispatch({ type: 'ai-behavior-back-substep' });
	}, [ai.substep, dispatch]);

	switch (ai.substep) {
		case 'choose-bootstrap':
			return (
				<BootstrapModelStep
					profileId={state.provider.selectedProfileId}
					selectedModelId={ai.bootstrap?.modelId ?? null}
					onSelect={(profileId, modelId) =>
						dispatch({ type: 'select-bootstrap', profileId, modelId })
					}
					onBack={back}
					onContinue={() => dispatch({ type: 'next' })}
				/>
			);
		case 'preference-questions':
			return (
				<PreferenceQuestionsStep
					preferences={ai.preferences}
					onBudgetChange={(budget) => dispatch({ type: 'set-budget', budget })}
					onSpeedQualityChange={(preference) =>
						dispatch({ type: 'set-speed-quality', preference })
					}
					onBack={back}
					onContinue={() => dispatch({ type: 'next' })}
				/>
			);
		case 'running-curator':
			return (
				<RunningCuratorStep
					bootstrap={ai.bootstrap}
					preferences={ai.preferences}
					userNote={ai.redoNote}
					error={ai.error}
					onSuccess={(result) => dispatch({ type: 'run-curator-success', result })}
					onError={(message) => dispatch({ type: 'run-curator-error', message })}
					onCancel={back}
				/>
			);
		case 'review-recommendation':
			if (!ai.result) {
				dispatch({ type: 'ai-behavior-back-substep' });
				return null;
			}
			return (
				<ReviewRecommendationStep
					result={ai.result}
					onEdit={() => dispatch({ type: 'open-edit-recommendation' })}
					onRedo={() => dispatch({ type: 'open-redo-input' })}
					onAccepted={() => dispatch({ type: 'accept-recommendation' })}
					onBack={back}
				/>
			);
		case 'edit-recommendation':
			if (!ai.result) {
				dispatch({ type: 'ai-behavior-back-substep' });
				return null;
			}
			return (
				<EditRecommendationStep
					recommendation={ai.result.recommendation}
					onChange={(capability, modelId) =>
						dispatch({ type: 'update-binding', capability, modelId })
					}
					onBack={back}
					onDone={() => dispatch({ type: 'next' })}
				/>
			);
		case 'redo-input':
			return (
				<RedoInputStep
					note={ai.redoNote}
					onNoteChange={(note) => dispatch({ type: 'set-redo-note', note })}
					onBack={back}
					onSubmit={() => dispatch({ type: 'submit-redo' })}
				/>
			);
	}
}

// ─── 4 primary steps that PR-C introduces in full ──────────────────────

const CAPABILITY_ICON: Record<string, React.ComponentType> = {
	chat: MessageSquare,
	search: Search,
	analysis: BarChart3,
	copilot: Pencil,
};

function CapabilitiesStep() {
	const strings = useOnboardingStrings();
	const copy = strings.steps.capabilities;
	return (
		<div className="pkonb-section pkonb-section--cap">
			<div className="pkonb-section__intro pkonb-section__intro--center">
				<span className="pkonb-section__title">{copy.title}</span>
				<span className="pkonb-section__desc">{copy.description}</span>
			</div>
			<div className="pkonb-cap-grid">
				{copy.cards.map((c) => {
					const Icon = CAPABILITY_ICON[c.id] ?? MessageSquare;
					return (
						<div key={c.id} className="pkonb-cap-card">
							<div className="pkonb-cap-card__head">
								<span className="pkonb-cap-card__icon">
									<Icon />
								</span>
								<span className="pkonb-cap-card__title">{c.title}</span>
							</div>
							<div className="pkonb-cap-card__body">{c.body}</div>
							<div className="pkonb-cap-card__try">
								<span className="pkonb-cap-card__try-label">Try later:</span>
								<code>{c.tryLater}</code>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

const READINESS_ICON: Record<string, React.ComponentType> = {
	engine: Database,
	'existing-index': FileText,
	coverage: Layout,
	semantic: Sparkles,
};

const SYSTEM_CHECK_ICON: Record<string, React.ComponentType> = {
	provider: Layout,
	'ai-behavior': Cpu,
	'knowledge-index': Database,
	'web-access': Globe,
	safety: ShieldCheck,
};

const SUMMARY_ICON: Record<string, React.ComponentType> = {
	providers: Layout,
	'ai-behavior': Cpu,
	index: Database,
};

const READY_ACTION_ICON: Record<string, React.ComponentType> = {
	chat: MessageSquare,
	search: Search,
	analysis: BarChart3,
	copilot: Pencil,
};

function chipVariantForState(s: 'ready' | 'attention' | 'neutral'): 'success' | 'warning' | 'neutral' {
	if (s === 'ready') return 'success';
	if (s === 'attention') return 'warning';
	return 'neutral';
}

function IndexReadinessStep({
	state,
	dispatch,
}: {
	state: OnboardingState;
	dispatch: (e: OnboardingEvent) => void;
}) {
	const strings = useOnboardingStrings();
	const copy = strings.steps.indexReadiness;
	const selected = state.indexReadiness.selectedAction;

	const primaryActions: Array<{ id: typeof selected; label: string; hint: string; recommended?: boolean }> = [
		{
			id: 'update-changed',
			label: copy.actionLabels['update-changed'],
			hint: copy.actionDescriptions['update-changed'],
			recommended: true,
		},
		{
			id: 'use-existing',
			label: copy.actionLabels['use-existing'],
			hint: copy.actionDescriptions['use-existing'],
		},
		{
			id: 'enable-semantic',
			label: copy.actionLabels['enable-semantic'],
			hint: copy.actionDescriptions['enable-semantic'],
		},
	];

	return (
		<div className="pkonb-section">
			<div>
				<div className="pkonb-section__title">{copy.title}</div>
				<div className="pkonb-section__desc">{copy.description}</div>
			</div>

			<div className="pkonb-section">
				<span className="pkonb-section__kicker">{copy.currentReadinessTitle}</span>
				{copy.readinessRows.map((row) => {
					const Icon = READINESS_ICON[row.id] ?? Database;
					return (
						<Row key={row.id}>
							<Row.Icon>
								<Icon />
							</Row.Icon>
							<Row.Body>
								<Row.Title>{row.title}</Row.Title>
								<Row.Desc>{row.detail}</Row.Desc>
							</Row.Body>
							<Row.Right>
								<Chip variant={chipVariantForState(row.state)}>{row.chipLabel}</Chip>
							</Row.Right>
						</Row>
					);
				})}
			</div>

			<div className="pkonb-section">
				<span className="pkonb-section__kicker">{copy.recommendedActionTitle}</span>
				<div className="pkonb-radio-list">
					{primaryActions.map((action) => {
						const isSelected = selected === action.id;
						return (
							<button
								type="button"
								key={action.id}
								className="pkonb-radio-card"
								data-selected={isSelected ? 'true' : undefined}
								onClick={() => action.id && dispatch({ type: 'select-index-action', action: action.id })}
							>
								<span className="pkonb-radio-card__body">
									<span
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 'var(--pk-space-2)',
										}}
									>
										<span className="pkonb-radio-card__title">{action.label}</span>
										{action.recommended && (
											<Chip variant="accent">{copy.recommendedChip}</Chip>
										)}
									</span>
									<span className="pkonb-radio-card__hint">{action.hint}</span>
								</span>
								<span className="pkonb-radio-card__check">
									<Check />
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function SystemCheckStep() {
	const strings = useOnboardingStrings();
	const copy = strings.steps.systemCheck;
	return (
		<div className="pkonb-section">
			<div>
				<div className="pkonb-section__title">{copy.title}</div>
				<div className="pkonb-section__desc">{copy.description}</div>
			</div>

			<div className="pkonb-section">
				<span className="pkonb-section__kicker">{copy.sectionTitle}</span>
				{copy.checkRows.map((row) => {
					const Icon = SYSTEM_CHECK_ICON[row.id] ?? Cpu;
					return (
						<Row key={row.id}>
							<Row.Icon>
								<Icon />
							</Row.Icon>
							<Row.Body>
								<Row.Title>{row.title}</Row.Title>
								<Row.Desc>{row.detail}</Row.Desc>
							</Row.Body>
							<Row.Right>
								<Chip variant={chipVariantForState(row.state)}>{row.chipLabel}</Chip>
							</Row.Right>
						</Row>
					);
				})}
			</div>
		</div>
	);
}

function ReadyToTryStep() {
	const strings = useOnboardingStrings();
	const copy = strings.steps.readyToTry;
	return (
		<div className="pkonb-section">
			<div className="pkonb-hero" style={{ padding: 'var(--pk-space-5) 0' }}>
				<span className="pkonb-hero__mark pkonb-hero__mark--success">
					<Check />
				</span>
				<span className="pkonb-hero__title">{copy.celebrationTitle}</span>
				<span className="pkonb-hero__sub">{copy.celebrationSub}</span>
			</div>

			<div className="pkonb-section">
				<span className="pkonb-section__kicker">{copy.summaryTitle}</span>
				<div>
					{copy.summaryRows.map((row) => {
						const Icon = SUMMARY_ICON[row.id] ?? Info;
						return (
							<div key={row.id} className="pkonb-summary-row">
								<span className="pkonb-summary-row__label">
									<Icon />
									<span>{row.label}</span>
								</span>
								<span className="pkonb-summary-row__value">{row.value}</span>
								<Chip variant={chipVariantForState(row.state)}>{row.chipLabel}</Chip>
							</div>
						);
					})}
				</div>
			</div>

			<div className="pkonb-section">
				<span className="pkonb-section__kicker">{copy.actionsTitle}</span>
				<div className="pkonb-action-grid">
					{copy.actions.map((a) => {
						const Icon = READY_ACTION_ICON[a.id] ?? MessageSquare;
						return (
							<div key={a.id} className="pkonb-action-card">
								<div className="pkonb-action-card__header">
									<span className="pkonb-action-card__icon" data-tone={a.tone}>
										<Icon />
									</span>
									<span className="pkonb-action-card__title">{a.title}</span>
								</div>
								<div className="pkonb-action-card__body">{a.body}</div>
								<div className="pkonb-action-card__try">{a.tryLater}</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
