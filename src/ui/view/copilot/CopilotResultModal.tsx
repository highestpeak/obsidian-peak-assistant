// src/ui/view/copilot/CopilotResultModal.tsx
import { Modal, type App } from 'obsidian';
import React, { useState, useEffect } from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { AuthenticationError } from '@/core/errors/llm-errors';
import { Loader2, AlertTriangle, Settings2, ArrowLeft } from 'lucide-react';
import { CopilotPickerModal } from '@/ui/view/copilot/CopilotPickerModal';
import { Button } from '@/ui/component/shared-ui/button';
import type { CopilotAction, DocumentContext } from '@/service/copilot/CopilotActionRegistry';

interface CopilotResultModalProps {
	action: CopilotAction;
	ctx: DocumentContext;
}

type ModalPhase =
	| { phase: 'loading'; statusText?: string; progressText?: string; startTime: number }
	| { phase: 'result'; data: any }
	| { phase: 'error'; error: Error };

const LOADING_STEPS = [
	{ after: 0, text: 'Reading document...' },
	{ after: 2, text: 'Analyzing content...' },
	{ after: 6, text: 'Generating response...' },
	{ after: 15, text: 'Still working — large documents take longer...' },
	{ after: 30, text: 'This is taking longer than expected...' },
	{ after: 60, text: 'The request is unusually slow. You can close and retry, or check your API connection.' },
];

const LoadingView: React.FC<{ label: string; startTime: number; statusText?: string; progressText?: string }> = ({ label, startTime, statusText, progressText }) => {
	const [elapsed, setElapsed] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
		return () => clearInterval(timer);
	}, [startTime]);

	const autoStatus = !statusText && !progressText
		? LOADING_STEPS.filter(s => elapsed >= s.after).pop()?.text
		: undefined;

	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
			<Loader2 className="pktw-w-8 pktw-h-8 pktw-animate-spin pktw-text-accent" />
			<span className="pktw-text-sm pktw-font-medium">{label}...</span>
			{(statusText || autoStatus) && (
				<span className="pktw-text-xs pktw-text-muted-foreground">{statusText || autoStatus}</span>
			)}
			<span className="pktw-text-[10px] pktw-text-muted-foreground/50">{elapsed}s</span>
			{progressText && (
				<div className="pktw-w-full pktw-max-h-[200px] pktw-overflow-y-auto pktw-mt-4 pktw-px-4 pktw-text-xs pktw-text-muted-foreground pktw-whitespace-pre-wrap">
					{progressText}
				</div>
			)}
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

let _currentSetPhase: ((phase: ModalPhase) => void) | null = null;

const CopilotResultContent: React.FC<{
	action: CopilotAction;
	ctx: DocumentContext;
	initialPhase: ModalPhase;
	onClose: () => void;
	onBack: () => void;
}> = ({ action, ctx, initialPhase, onClose, onBack }) => {
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
				<LoadingView label={action.label} startTime={phase.startTime} statusText={phase.statusText} progressText={phase.progressText} />
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
		<div className="pktw-relative">
			{backButton}
			<Panel
				result={phase.data}
				ctx={ctx}
				file={ctx.file}
				scope={ctx.scope}
				originalContent={ctx.content}
				selectedText={ctx.selection}
				onClose={onClose}
			/>
		</div>
	);
};

export class CopilotResultModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(app: App, private props: CopilotResultModalProps) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.modalEl.addClass('peak-copilot-modal');
		this.contentEl.addClass('pktw-root');
		this.modalEl.style.width = '720px';
		this.modalEl.style.maxWidth = '90vw';

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
						this.close();
						new CopilotPickerModal(appContext).open();
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
		action.execute(ctx, (progressText: string) => this.updateProgress(progressText))
			.then(result => this.setResult(result.data ?? result.text ?? result))
			.catch(err => this.setError(err instanceof Error ? err : new Error(String(err))));
	}

	setResult(data: any): void {
		_currentSetPhase?.({ phase: 'result', data });
	}

	setError(error: Error): void {
		_currentSetPhase?.({ phase: 'error', error });
	}

	updateProgress(text: string): void {
		_currentSetPhase?.({ phase: 'loading', progressText: text, startTime: Date.now() });
	}

	onClose(): void {
		_currentSetPhase = null;
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}
