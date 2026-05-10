// src/ui/view/copilot/CopilotResultModal.tsx
import { Modal, type App } from 'obsidian';
import React, { useState, useEffect } from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { AuthenticationError } from '@/core/errors/llm-errors';
import { Loader2, AlertTriangle, Settings2, ArrowLeft, X, Ban } from 'lucide-react';
import { CopilotPickerModal } from '@/ui/view/copilot/CopilotPickerModal';
import { Button } from '@/ui/component/shared-ui/button';
import type { CopilotAction, DocumentContext, ActionUsage, ActionResult } from '@/service/copilot/CopilotActionRegistry';
import type { LLMStreamEvent } from '@/core/providers/types';
import type { V2ToolStep } from '@/ui/view/quick-search/types/search-steps';
import { v2ToolDisplay, extractV2Summary, unwrapToolOutput } from '@/ui/view/quick-search/types/search-steps';
import { CopilotStepTimeline } from './components/CopilotStepTimeline';

interface CopilotResultModalProps {
	action: CopilotAction;
	ctx: DocumentContext;
}

type ModalPhase =
	| { phase: 'loading'; startTime: number }
	| { phase: 'streaming'; steps: V2ToolStep[]; progressText: string; startTime: number }
	| { phase: 'result'; data: any; usage?: ActionUsage; completedSteps?: V2ToolStep[] }
	| { phase: 'cancelled' }
	| { phase: 'error'; error: Error };

const LOADING_STEPS = [
	{ after: 0, text: 'Reading document...' },
	{ after: 2, text: 'Analyzing content...' },
	{ after: 6, text: 'Generating response...' },
	{ after: 15, text: 'Still working — large documents take longer...' },
	{ after: 30, text: 'This is taking longer than expected...' },
	{ after: 60, text: 'The request is unusually slow. You can close and retry, or check your API connection.' },
];

type ToolCallRegistry = Map<string, string>;

async function consumeCopilotStream(
	generator: AsyncGenerator<LLMStreamEvent, ActionResult | void>,
	setPhase: (phase: ModalPhase) => void,
	startTime: number,
	signal: AbortSignal,
): Promise<ActionResult | void> {
	const steps: V2ToolStep[] = [];
	const callRegistry: ToolCallRegistry = new Map();
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
					const { id, toolName, input } = event as any;
					callRegistry.set(id, toolName);
					const display = v2ToolDisplay(toolName, input ?? {});
					pushStep({
						id,
						toolName,
						displayName: display.displayName,
						icon: display.icon,
						input: input ?? {},
						status: 'running',
						startedAt: Date.now(),
					});
					break;
				}
				case 'tool-result': {
					const { id, output } = event as any;
					const toolName = callRegistry.get(id) ?? 'unknown';
					const summary = extractV2Summary(toolName, output);
					updateStep(id, s => ({
						...s,
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
			<div className="pktw-flex pktw-items-center pktw-justify-between">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Loader2 className="pktw-w-4 pktw-h-4 pktw-animate-spin pktw-text-accent" />
					<span className="pktw-text-sm pktw-font-medium">{label}</span>
				</div>
				<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-font-mono">{elapsed}s</span>
			</div>
			{steps.length > 0 && <CopilotStepTimeline steps={steps} />}
			{progressText && (
				<div className="pktw-max-h-[200px] pktw-overflow-y-auto pktw-text-xs pktw-text-muted-foreground pktw-whitespace-pre-wrap pktw-mt-2">
					{progressText}
				</div>
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

const ErrorView: React.FC<{ error: Error; onClose: () => void }> = ({ error, onClose }) => {
	const isAuth = error instanceof AuthenticationError;
	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
			<AlertTriangle className="pktw-w-8 pktw-h-8 pktw-text-destructive" />
			<span className="pktw-text-sm pktw-font-medium">Something went wrong</span>
			<span className="pktw-text-xs pktw-text-muted-foreground pktw-text-center pktw-max-w-md">{error.message}</span>
			<div className="pktw-flex pktw-gap-2 pktw-mt-2">
				{isAuth && (
					<Button variant="outline" size="sm" onClick={() => {
						const { SettingsModal } = require('@/ui/view/SettingsModal');
						new SettingsModal(AppContext.getInstance()).open();
					}}>
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

let _currentSetPhase: ((phase: ModalPhase) => void) | null = null;

const CopilotResultContent: React.FC<{
	action: CopilotAction;
	ctx: DocumentContext;
	initialPhase: ModalPhase;
	onClose: () => void;
	onBack: () => void;
	onCancel: () => void;
}> = ({ action, ctx, initialPhase, onClose, onBack, onCancel }) => {
	const [phase, setPhase] = useState<ModalPhase>(initialPhase);

	useEffect(() => {
		_currentSetPhase = setPhase;
		return () => { _currentSetPhase = null; };
	}, []);

	const backButton = (
		<button
			onClick={onBack}
			className="pktw-absolute pktw-top-3 pktw-left-3 pktw-flex pktw-items-center pktw-gap-1 pktw-text-xs pktw-text-muted-foreground hover:pktw-text-foreground pktw-transition-colors pktw-cursor-pointer pktw-bg-transparent pktw-border-none pktw-p-1"
		>
			<ArrowLeft className="pktw-w-3.5 pktw-h-3.5" />
			<span>Back</span>
		</button>
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
				<ErrorView error={phase.error} onClose={onClose} />
			</div>
		);
	}

	const Panel = action.ResultPanel;
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

export class CopilotResultModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;
	private abortController: AbortController | null = null;

	constructor(app: App, private props: CopilotResultModalProps) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.modalEl.addClass('peak-copilot-modal');
		this.contentEl.addClass('pktw-root');
		this.modalEl.style.width = '720px';
		this.modalEl.style.maxWidth = '90vw';

		this.abortController = new AbortController();
		const initialPhase: ModalPhase = { phase: 'loading', startTime: Date.now() };
		const appContext = AppContext.getInstance();

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CopilotResultContent,
				{
					action: this.props.action,
					ctx: this.props.ctx,
					initialPhase,
					onClose: () => this.close(),
					onBack: () => {
						this.abortController?.abort();
						this.close();
						new CopilotPickerModal(appContext).open();
					},
					onCancel: () => {
						this.abortController?.abort();
						_currentSetPhase?.({ phase: 'cancelled' });
					},
				},
				appContext,
			),
		);

		// Execute the action and wire results into the modal
		const { action, ctx } = this.props;
		const guard = action.guard?.(ctx);
		if (guard) {
			this.setError(new Error(guard));
			return;
		}
		const signal = this.abortController.signal;
		const startTime = Date.now();

		(async () => {
			try {
				const generator = action.execute(ctx, signal);
				let lastSteps: V2ToolStep[] = [];
				const result = await consumeCopilotStream(generator, (p) => {
					_currentSetPhase?.(p);
					if (p.phase === 'streaming') lastSteps = p.steps;
				}, startTime, signal);
				if (signal.aborted) return;
				if (result) {
					_currentSetPhase?.({
						phase: 'result',
						data: result.data ?? result.text ?? result,
						usage: result.usage,
						completedSteps: lastSteps.length > 0 ? lastSteps : undefined,
					});
				}
			} catch (err) {
				if (signal.aborted) {
					_currentSetPhase?.({ phase: 'cancelled' });
					return;
				}
				this.setError(err instanceof Error ? err : new Error(String(err)));
			}
		})();
	}

	setResult(data: any, usage?: ActionUsage): void {
		_currentSetPhase?.({ phase: 'result', data, usage });
	}

	setError(error: Error): void {
		_currentSetPhase?.({ phase: 'error', error });
	}

	onClose(): void {
		this.abortController?.abort();
		this.abortController = null;
		_currentSetPhase = null;
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}
