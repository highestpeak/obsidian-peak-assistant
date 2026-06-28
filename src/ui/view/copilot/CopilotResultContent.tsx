// src/ui/view/copilot/CopilotResultContent.tsx — React content for the
// Copilot Result modal. The Obsidian Modal shell lives at
// @/app/copilot/modals/CopilotResultModal and passes a `phaseControllerRef`
// prop so non-React lifecycle callers can drive UI phase transitions via a
// modal-scoped ref (no module global).
import { Notice } from 'obsidian';
import React, { useState, useEffect } from 'react';
import { AuthenticationError } from '@/core/errors/llm-errors';
import { Loader2, AlertTriangle, Settings2, ArrowLeft, X, Ban } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { CopilotAction, DocumentContext, ActionUsage, ActionResult } from '@/service/copilot/CopilotActionRegistry';
import { getCopilotResultPanel } from '@/ui/view/copilot/copilot-action-surfaces';
import { actionResultToArtifacts } from '@/service/copilot/CopilotArtifactAdapter';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import {
	createEmptyCopilotRunArtifacts,
	mergeCapabilityArtifact,
	type CopilotRunArtifacts,
} from '@/service/copilot/CopilotRunArtifacts';
import type { LLMStreamEvent } from '@/core/providers/types';
import type { V2ToolStep } from '@/ui/view/quick-search/types/search-steps';
import { v2ToolDisplay, extractV2Summary, unwrapToolOutput } from '@/ui/view/quick-search/types/search-steps';
import { CopilotStepTimeline } from './components/CopilotStepTimeline';
import { CopilotReviewShell } from './review/CopilotReviewShell';

export type ModalPhase =
	| { phase: 'loading'; startTime: number }
	| { phase: 'streaming'; steps: V2ToolStep[]; progressText: string; startTime: number }
	| { phase: 'result'; data: any; usage?: ActionUsage; completedSteps?: V2ToolStep[]; resultType?: 'structured' | 'stream' }
	| { phase: 'cancelled' }
	| { phase: 'error'; error: Error };

const LOADING_STEPS = [
	{ after: 0, text: 'Reading document...' },
	{ after: 2, text: 'Analyzing content...' },
	{ after: 6, text: 'Generating response...' },
	{ after: 15, text: 'Still working — large documents take longer...' },
	{ after: 25, text: 'Waiting for provider response — the model may be queuing...' },
];

type ToolCallRegistry = Map<string, string>;

function getToolEventId(event: any): string | undefined {
	const id = event.id ?? event.toolCallId;
	return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function normalizeToolName(toolName: unknown): string | undefined {
	return typeof toolName === 'string' && toolName.length > 0 && toolName !== 'unknown'
		? toolName
		: undefined;
}

export function actionResultData(result: ActionResult): any {
	if (result.type === 'structured') return result.data;
	if (result.type === 'stream') return result.text;
	return result;
}

function actionResultFromPhase(phase: Extract<ModalPhase, { phase: 'result' }>): ActionResult {
	if (phase.resultType === 'stream') {
		return { type: 'stream', text: String(phase.data ?? ''), usage: phase.usage };
	}
	return { type: 'structured', data: phase.data, usage: phase.usage };
}

function buildManualReviewArtifacts(params: {
	action: CopilotAction;
	ctx: DocumentContext;
	phase: Extract<ModalPhase, { phase: 'result' }>;
}): CopilotRunArtifacts {
	let artifacts = createEmptyCopilotRunArtifacts();
	for (const step of params.phase.completedSteps ?? []) {
		artifacts = mergeCapabilityArtifact(artifacts, {
			id: `${params.action.id}-${step.id}`,
			type: 'trace',
			label: step.displayName,
			status: step.status,
			summary: step.summary,
		});
	}

	for (const artifact of actionResultToArtifacts({
		action: params.action,
		result: actionResultFromPhase(params.phase),
		ctx: params.ctx,
	})) {
		artifacts = mergeCapabilityArtifact(artifacts, artifact);
	}

	return artifacts;
}

function shouldUseArtifactReview(actionId: string, artifacts: CopilotRunArtifacts): boolean {
	if (artifacts.changes.length > 0 || artifacts.sources.length > 0) return true;
	return [
		'summarize',
		'review',
		'find-related',
		'knowledge-gaps',
		'synthesize-topic',
		'vault-health',
		'vault-summary',
		'prompt-audit',
		'check-task-list',
	].includes(actionId);
}

export async function consumeCopilotStream(
	generator: AsyncGenerator<LLMStreamEvent, ActionResult | void>,
	setPhase: (phase: ModalPhase) => void,
	startTime: number,
	signal: AbortSignal,
): Promise<ActionResult | void> {
	const steps: V2ToolStep[] = [];
	const callRegistry: ToolCallRegistry = new Map();
	const pendingNoIdCalls: string[] = [];
	let fallbackCounter = 0;
	let progressText = '';
	let lastUsage: ActionUsage | undefined;

	function pushStep(step: V2ToolStep) {
		steps.push(step);
		setPhase({ phase: 'streaming', steps: [...steps], progressText, startTime });
	}

	function updateStep(id: string, updater: (s: V2ToolStep) => V2ToolStep) {
		const idx = steps.findIndex(s => s.id === id);
		if (idx >= 0) {
			steps[idx] = updater(steps[idx]);
			setPhase({ phase: 'streaming', steps: [...steps], progressText, startTime });
		}
	}

	try {
		while (true) {
			if (signal.aborted) return;
			const { value, done } = await generator.next();
			if (done) return value as ActionResult | void;

			const event = value as LLMStreamEvent;
			switch (event.type) {
				case 'tool-call': {
					const { toolName, input } = event as any;
					const eventId = getToolEventId(event);
					const resolvedToolName = normalizeToolName(toolName) ?? 'unknown';
					const stepId = eventId ?? `${resolvedToolName}-${Date.now()}-${fallbackCounter++}`;
					callRegistry.set(stepId, resolvedToolName);
					if (!eventId) pendingNoIdCalls.push(stepId);
					const display = v2ToolDisplay(resolvedToolName, input ?? {});
					pushStep({
						id: stepId,
						toolName: resolvedToolName,
						displayName: display.displayName,
						icon: display.icon,
						input: input ?? {},
						status: 'running',
						startedAt: Date.now(),
					});
					break;
				}
				case 'tool-result': {
					const { toolName, output } = event as any;
					const eventId = getToolEventId(event);
					const stepId = eventId ?? pendingNoIdCalls.pop() ?? `${normalizeToolName(toolName) ?? 'tool'}-${Date.now()}-${fallbackCounter++}`;
					const resolvedToolName = normalizeToolName(toolName) ?? callRegistry.get(stepId) ?? 'unknown';
					callRegistry.set(stepId, resolvedToolName);
					const summary = extractV2Summary(resolvedToolName, output);
					const hasExistingStep = steps.some(step => step.id === stepId);
					if (!hasExistingStep) {
						const display = v2ToolDisplay(resolvedToolName, {});
						pushStep({
							id: stepId,
							toolName: resolvedToolName,
							displayName: display.displayName,
							icon: display.icon,
							input: {},
							status: 'done',
							startedAt: Date.now(),
							endedAt: Date.now(),
							summary,
							resultPreview: unwrapToolOutput(output).slice(0, 500),
						});
						break;
					}
					updateStep(stepId, s => ({
						...s,
						toolName: resolvedToolName,
						status: 'done',
						endedAt: Date.now(),
						summary,
						resultPreview: unwrapToolOutput(output).slice(0, 500),
					}));
					break;
				}
				case 'text-delta': {
					progressText += (event as any).text;
					setPhase({ phase: 'streaming', steps: [...steps], progressText, startTime });
					break;
				}
				case 'complete': {
					const { usage } = event as any;
					if (usage) {
						lastUsage = {
							inputTokens: usage.inputTokens ?? 0,
							outputTokens: usage.outputTokens ?? 0,
						};
					}
					break;
				}
				case 'error': {
					const { error } = event as any;
					setPhase({ phase: 'error', error: error instanceof Error ? error : new Error(String(error)) });
					return;
				}
			}
		}
	} catch (err) {
		if (signal.aborted) return;
		setPhase({ phase: 'error', error: err instanceof Error ? err : new Error(String(err)) });
	}
}

const LoadingView: React.FC<{
	label: string;
	startTime: number;
	onCancel: () => void;
}> = ({ label, startTime, onCancel }) => {
	const [elapsed, setElapsed] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
		return () => clearInterval(timer);
	}, [startTime]);

	const autoStatus = LOADING_STEPS.filter(s => elapsed >= s.after).pop()?.text;

	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
			<Loader2 className="pktw-w-8 pktw-h-8 pktw-animate-spin pktw-text-accent" />
			<span className="pktw-text-sm pktw-font-medium">{label}...</span>
			{autoStatus && (
				<span className="pktw-text-xs pktw-text-muted-foreground">{autoStatus}</span>
			)}
			<span className="pktw-text-[10px] pktw-text-muted-foreground/50">{elapsed}s</span>
			<Button variant="ghost" size="sm" onClick={onCancel} className="pktw-mt-2">
				<X className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
				Cancel
			</Button>
		</div>
	);
};

const StreamingView: React.FC<{
	label: string;
	steps: V2ToolStep[];
	progressText: string;
	startTime: number;
	onCancel: () => void;
}> = ({ label, steps, progressText, startTime, onCancel }) => {
	const [elapsed, setElapsed] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
		return () => clearInterval(timer);
	}, [startTime]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-py-4 pktw-px-4">
			<div className="pktw-rounded-lg pktw-border pktw-border-border pktw-bg-muted/30 pktw-p-3">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Loader2 className="pktw-w-4 pktw-h-4 pktw-animate-spin pktw-text-accent" />
					<span className="pktw-text-sm pktw-font-medium">{label}</span>
					<span className="pktw-flex-1" />
					<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-font-mono">{elapsed}s</span>
				</div>
				<span className="pktw-block pktw-mt-1 pktw-text-xs pktw-text-muted-foreground">
					Analyzing context, running tools, then preparing reviewable output. No changes are applied automatically.
				</span>
			</div>
			{steps.length > 0 && <CopilotStepTimeline steps={steps} />}
			{progressText && (
				<details className="pktw-rounded-md pktw-border pktw-border-border pktw-bg-muted/20 pktw-p-2 pktw-mt-2">
					<summary className="pktw-cursor-pointer pktw-text-xs pktw-font-medium pktw-text-muted-foreground">
						Inspect run details
					</summary>
					<div className="pktw-max-h-[200px] pktw-overflow-y-auto pktw-text-xs pktw-text-muted-foreground pktw-whitespace-pre-wrap pktw-mt-2">
						{progressText}
					</div>
				</details>
			)}
			<div className="pktw-flex pktw-justify-center pktw-mt-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					<X className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
					Cancel
				</Button>
			</div>
		</div>
	);
};

const ErrorView: React.FC<{ error: Error; onClose: () => void; onOpenSettings: () => void }> = ({ error, onClose, onOpenSettings }) => {
	const isAuth = error instanceof AuthenticationError;
	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
			<AlertTriangle className="pktw-w-8 pktw-h-8 pktw-text-destructive" />
			<span className="pktw-text-sm pktw-font-medium">Something went wrong</span>
			<span className="pktw-text-xs pktw-text-muted-foreground pktw-text-center pktw-max-w-md">{error.message}</span>
			<div className="pktw-flex pktw-gap-2 pktw-mt-2">
				{isAuth && (
					<Button variant="outline" size="sm" onClick={onOpenSettings}>
						<Settings2 className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
						Open Settings
					</Button>
				)}
				<Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
			</div>
		</div>
	);
};

const CancelledView: React.FC<{ onBack: () => void }> = ({ onBack }) => (
	<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
		<Ban className="pktw-w-8 pktw-h-8 pktw-text-muted-foreground" />
		<span className="pktw-text-sm pktw-font-medium">Cancelled</span>
		<span className="pktw-text-xs pktw-text-muted-foreground">The request was cancelled.</span>
		<Button variant="ghost" size="sm" onClick={onBack} className="pktw-mt-2">
			<ArrowLeft className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
			Back to Copilot
		</Button>
	</div>
);

const UsageFooter: React.FC<{ usage: ActionUsage }> = ({ usage }) => (
	<div className="pktw-flex pktw-justify-end pktw-px-4 pktw-py-2 pktw-border-t pktw-border-border">
		<span className="pktw-text-[10px] pktw-text-muted-foreground">
			{usage.inputTokens.toLocaleString()} in + {usage.outputTokens.toLocaleString()} out tokens
		</span>
	</div>
);

export interface CopilotPhaseController {
	current: ((phase: ModalPhase) => void) | null;
}

export const CopilotResultContent: React.FC<{
	action: CopilotAction;
	ctx: DocumentContext;
	initialPhase: ModalPhase;
	phaseControllerRef?: CopilotPhaseController;
	onClose: () => void;
	onBack: () => void;
	onCancel: () => void;
}> = ({ action, ctx, initialPhase, phaseControllerRef, onClose, onBack, onCancel }) => {
	const { vault, navigator } = useCopilotPanelVault();
	const [phase, setPhase] = useState<ModalPhase>(initialPhase);

	useEffect(() => {
		if (!phaseControllerRef) return;
		phaseControllerRef.current = setPhase;
		return () => { phaseControllerRef.current = null; };
	}, [phaseControllerRef]);

	const backButton = (
		<Button
			variant="ghost"
			size="sm"
			onClick={onBack}
			className="pktw-absolute pktw-top-3 pktw-left-3 pktw-gap-1 pktw-text-xs pktw-text-muted-foreground hover:pktw-text-foreground"
		>
			<ArrowLeft className="pktw-w-3.5 pktw-h-3.5" />
			<span>Back</span>
		</Button>
	);

	if (phase.phase === 'loading') {
		return (
			<div className="pktw-relative">
				{backButton}
				<LoadingView
					label={action.label}
					startTime={phase.startTime}
					onCancel={onCancel}
				/>
			</div>
		);
	}
	if (phase.phase === 'streaming') {
		return (
			<div className="pktw-relative">
				{backButton}
				<StreamingView
					label={action.label}
					steps={phase.steps}
					progressText={phase.progressText}
					startTime={phase.startTime}
					onCancel={onCancel}
				/>
			</div>
		);
	}
	if (phase.phase === 'cancelled') {
		return (
			<div className="pktw-relative">
				{backButton}
				<CancelledView onBack={onBack} />
			</div>
		);
	}
	if (phase.phase === 'error') {
		return (
			<div className="pktw-relative">
				{backButton}
				<ErrorView error={phase.error} onClose={onClose} onOpenSettings={() => navigator.openSettings()} />
			</div>
		);
	}

	const artifacts = buildManualReviewArtifacts({ action, ctx, phase });
	if (shouldUseArtifactReview(action.id, artifacts)) {
		const applyArtifacts = async (selectedOnly: boolean) => {
			const result = await vault.applyArtifacts({ ctx, artifacts, selectedOnly });
			if (result.appliedBlocks === 0) {
				new Notice('No matching changes were applied.');
				return;
			}
			new Notice(`Applied ${result.appliedBlocks} change block${result.appliedBlocks === 1 ? '' : 's'}.`);
			onClose();
		};

		return (
			<div className="pktw-relative pktw-h-[min(760px,calc(100vh-96px))]">
				<CopilotReviewShell
					title={action.label}
					subtitle="Review the generated artifacts. No changes are applied until you approve them."
					artifacts={artifacts}
					onClose={onClose}
					onRejectAll={onClose}
					onApplySelected={() => void applyArtifacts(true)}
					onApplyReviewed={() => void applyArtifacts(false)}
					onCreateProposal={() => new Notice('Proposal creation is not wired yet.')}
				/>
			</div>
		);
	}

	const Panel = getCopilotResultPanel(action.id);
	return (
		<div className="pktw-relative pktw-flex pktw-flex-col">
			{backButton}
			{phase.completedSteps && phase.completedSteps.length > 0 && (
				<div className="pktw-px-4 pktw-pt-4">
					<CopilotStepTimeline steps={phase.completedSteps} collapsed />
				</div>
			)}
			<Panel
				result={phase.data}
				ctx={ctx}
				file={ctx.file}
				scope={ctx.scope}
				originalContent={ctx.content}
				selectedText={ctx.selection}
				onClose={onClose}
			/>
			{phase.usage && <UsageFooter usage={phase.usage} />}
		</div>
	);
};

